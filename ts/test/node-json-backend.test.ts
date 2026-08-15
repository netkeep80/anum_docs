import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NodeJsonBackendError, NodeJsonFileBackend } from "../src/node-json-backend.js";
import { PersistentStore, PersistentStoreError } from "../src/persistent-store.js";
import {
  materializePersistentSequence,
  replayPersistentSequenceMaterialization,
} from "../src/persistent-sequence.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertSame<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), message);
}

type ErrorClass = abstract new (...args: any[]) => Error;

function assertThrows(effect: () => unknown, type: ErrorClass, message: string): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof type, `${message}: wrong error type`);
    return;
  }
  throw new Error(`${message}: expected error`);
}

function withTemp(run: (directory: string) => void): void {
  const directory = mkdtempSync(join(tmpdir(), "mts-node-json-"));
  try { run(directory); }
  finally { rmSync(directory, { recursive: true, force: true }); }
}

function basis(store: PersistentStore) {
  const R = store.root;
  const O = store.materializeStartSelfClosed(R);
  const C = store.materializeEndSelfClosed(R);
  const L = store.materialize(O, C);
  const U = store.materialize(C, O);
  return { R, O, C, L, U };
}

class FailingReplaceBackend extends NodeJsonFileBackend {
  failNextReplace = false;

  protected override replaceTemporary(temporary: string): void {
    if (this.failNextReplace) {
      this.failNextReplace = false;
      throw new Error("injected pre-rename failure");
    }
    super.replaceTemporary(temporary);
  }
}

withTemp((directory) => {
  const path = join(directory, "store.json");
  const backend = new NodeJsonFileBackend(path);
  assertSame(backend.load(), undefined, "missing file is an empty backend");
  const store = PersistentStore.create(backend, "file-lineage");
  assert(existsSync(path), "create writes the reference file");
  assertSame(store.count, 1, "fresh file store contains root only");

  const raw = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  assert(Object.keys(raw).sort().join(",") === "lineage,schema,topology", "file envelope contains only accepted fields");
  const topology = raw.topology as Record<string, unknown>;
  assert(Object.keys(topology).sort().join(",") === "links,root,schema", "topology contains no indexes or runtime handles");
});

withTemp((directory) => {
  const path = join(directory, "store.json");
  const store = PersistentStore.create(new NodeJsonFileBackend(path), "reopen-lineage");
  const { O, C, L } = basis(store);
  const loop = store.materialize(L, L);
  const count = store.count;

  const reopened = PersistentStore.open(new NodeJsonFileBackend(path));
  assertSame(reopened.lineage, "reopen-lineage", "reopen preserves storage lineage");
  assertSame(reopened.count, count, "reopen preserves topology cardinality");
  const links = reopened.allLinks();
  const rO = links[O.local]!;
  const rC = links[C.local]!;
  const rL = links[L.local]!;
  assertSame(reopened.find(rO, rC)?.local, rL.local, "same pair survives reopen");
  assertSame(reopened.materialize(rO, rC).local, rL.local, "same pair remains idempotent after reopen");
  assertSame(reopened.poles(links[loop.local]!)[0].local, rL.local, "ordinary loop survives reopen");
});

withTemp((directory) => {
  const path = join(directory, "store.json");
  const store = PersistentStore.create(new NodeJsonFileBackend(path), "sequence-file-lineage");
  const { O, C } = basis(store);
  const a = store.materialize(O, O);
  const b = store.materialize(C, C);
  const evidence = materializePersistentSequence(store, {
    root: store.root,
    items: [
      { kind: "atom", value: a },
      { kind: "atom", value: b },
      { kind: "atom", value: O },
    ],
  });
  const reopened = PersistentStore.open(new NodeJsonFileBackend(path));
  assertSame(replayPersistentSequenceMaterialization(reopened, evidence).local, evidence.result.local, "persistent sequence evidence replays after file reopen");
});

withTemp((directory) => {
  const path = join(directory, "bad.json");
  const malformed = "{bad json\n";
  writeFileSync(path, malformed, "utf8");
  const before = readFileSync(path);
  assertThrows(() => new NodeJsonFileBackend(path).load(), NodeJsonBackendError, "malformed JSON rejects");
  assert(readFileSync(path).equals(before), "malformed JSON is not rewritten");

  writeFileSync(path, "[]\n", "utf8");
  const nonObject = readFileSync(path);
  assertThrows(() => new NodeJsonFileBackend(path).load(), NodeJsonBackendError, "non-object JSON rejects");
  assert(readFileSync(path).equals(nonObject), "non-object JSON is not rewritten");
});

withTemp((directory) => {
  const path = join(directory, "invalid-topology.json");
  const payload = JSON.stringify({
    schema: "mts-persistent-dataset/v0.1",
    lineage: "bad-lineage",
    topology: {
      schema: "mts-storage-topology/v0.1",
      root: 0,
      links: [[0, 0], [1, 1]],
    },
  }) + "\n";
  writeFileSync(path, payload, "utf8");
  const before = readFileSync(path);
  assertThrows(() => PersistentStore.open(new NodeJsonFileBackend(path)), PersistentStoreError, "invalid topology fails in canonical store validator");
  assert(readFileSync(path).equals(before), "invalid topology open is read-only");
});

withTemp((directory) => {
  const path = join(directory, "atomic.json");
  const backend = new FailingReplaceBackend(path);
  const store = PersistentStore.create(backend, "atomic-lineage");
  const { O } = basis(store);
  const beforeBytes = readFileSync(path);
  const beforeCount = store.count;
  backend.failNextReplace = true;
  assertThrows(() => store.materialize(O, O), NodeJsonBackendError, "pre-rename failure surfaces through backend error");
  assertSame(store.count, beforeCount, "failed file commit does not publish live store candidate");
  assert(readFileSync(path).equals(beforeBytes), "pre-rename failure preserves exact previous target bytes");
  const leftovers = readdirSync(directory).filter((name) => name.startsWith(".atomic.json.") && name.endsWith(".tmp"));
  assertSame(leftovers.length, 0, "failed replace cleans temporary file");
});
