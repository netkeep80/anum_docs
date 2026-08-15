import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { Memory, type LinkHandle } from "../src/memory.js";
import {
  SequenceReplayError,
  materializeSequence,
  replaySequenceMaterialization,
  type MaterializedEdge,
  type SequenceDescription,
  type SequenceItem,
  type SequenceMaterializationEffect,
} from "../src/sequence.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
interface MaterializationCase { readonly id: string; readonly operation: string; }
interface Corpus {
  readonly schema: string;
  readonly contract: string;
  readonly pythonOracleSha: string;
  readonly cases: readonly MaterializationCase[];
}
interface Result {
  readonly id: string;
  readonly accepted: boolean;
  readonly observable?: Json;
  readonly error?: string;
}

function canonical(value: Json): Json {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonical(item)]),
    );
  }
  return value;
}
function sameJson(left: Json, right: Json): boolean {
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}

const atom = (value: LinkHandle): SequenceItem => Object.freeze({ kind: "atom", value });
const group = (...items: SequenceItem[]): SequenceItem => Object.freeze({ kind: "group", items: Object.freeze(items) });
const description = (root: LinkHandle, ...items: SequenceItem[]): SequenceDescription =>
  Object.freeze({ root, items: Object.freeze(items) });

function fixture(preexistingAb: boolean) {
  const memory = new Memory();
  const a = memory.ensureStartSelfClosed(memory.root);
  const b = memory.ensureStartSelfClosed(a);
  const c = memory.ensureStartSelfClosed(b);
  const ab = preexistingAb ? memory.ensure(a, b) : undefined;
  return { memory, a, b, c, ab };
}

function normalizeEffect(
  effect: SequenceMaterializationEffect,
  baseLabels: ReadonlyMap<LinkHandle, string>,
): Json {
  const createdLabels = new Map<LinkHandle, string>();
  effect.created.forEach((edge, index) => createdLabels.set(edge.ref, `e${index}`));
  const label = (ref: LinkHandle): string => {
    const result = baseLabels.get(ref) ?? createdLabels.get(ref);
    assert(result !== undefined, "materialization observable contains an unlabeled link");
    return result;
  };
  return {
    createdCount: effect.created.length,
    createdEdges: effect.created.map((edge, index) => ({
      ref: `e${index}`,
      start: label(edge.start),
      end: label(edge.end),
    })),
    result: label(effect.result),
    writeDelta: effect.linkCountAfter - effect.linkCountBefore,
  };
}

function buildEffect(operation: string) {
  const reusePrefix = operation === "reuse" || operation === "partial-prefix";
  const { memory, a, b, c, ab } = fixture(reusePrefix);
  const baseLabels = new Map<LinkHandle, string>([
    [memory.root, "root"],
    [a, "a"],
    [b, "b"],
    [c, "c"],
  ]);
  if (ab !== undefined) baseLabels.set(ab, "ab");

  const descriptions: Record<string, SequenceDescription> = {
    empty: description(memory.root),
    singleton: description(memory.root, atom(a)),
    "two-new": description(memory.root, atom(a), atom(b)),
    reuse: description(memory.root, atom(a), atom(b)),
    "partial-prefix": description(memory.root, atom(a), atom(b), atom(c)),
    nested: description(memory.root, group(atom(a), atom(b)), atom(c)),
    "empty-nested": description(memory.root, group(), atom(c)),
    "repeated-nested": description(memory.root, group(atom(a), atom(b)), group(atom(a), atom(b))),
    "replay-valid": description(memory.root, atom(a), atom(b), atom(c)),
    "replay-forged-result": description(memory.root, atom(a), atom(b), atom(c)),
    "replay-wrong-poles": description(memory.root, atom(a), atom(b), atom(c)),
    "replay-omitted-created": description(memory.root, atom(a), atom(b), atom(c)),
    "replay-reordered-created": description(memory.root, atom(a), atom(b), atom(c)),
  };
  const selected = descriptions[operation];
  assert(selected !== undefined, `unknown materialization differential operation: ${operation}`);
  const effect = materializeSequence(memory, selected);
  return { memory, effect, baseLabels, a, c };
}

function run(test: MaterializationCase): Result {
  const { memory, effect, baseLabels, a, c } = buildEffect(test.operation);
  if ([
    "empty",
    "singleton",
    "two-new",
    "reuse",
    "partial-prefix",
    "nested",
    "empty-nested",
    "repeated-nested",
  ].includes(test.operation)) {
    return { id: test.id, accepted: true, observable: normalizeEffect(effect, baseLabels) };
  }

  if (test.operation === "replay-valid") {
    const before = memory.linkCount;
    replaySequenceMaterialization(memory, effect);
    const observable = normalizeEffect(effect, baseLabels) as { [key: string]: Json };
    observable.replayReadOnly = before === memory.linkCount;
    return { id: test.id, accepted: true, observable };
  }

  let forged: SequenceMaterializationEffect = effect;
  if (test.operation === "replay-forged-result") {
    forged = Object.freeze({ ...effect, result: a });
  } else if (test.operation === "replay-wrong-poles") {
    const first = effect.created[0];
    assert(first !== undefined, "wrong-poles fixture needs created evidence");
    forged = Object.freeze({
      ...effect,
      created: Object.freeze([
        Object.freeze({ ...first, start: c }) as MaterializedEdge,
        ...effect.created.slice(1),
      ]),
    });
  } else if (test.operation === "replay-omitted-created") {
    forged = Object.freeze({
      ...effect,
      created: Object.freeze([]),
      linkCountAfter: effect.linkCountBefore,
    });
  } else if (test.operation === "replay-reordered-created") {
    forged = Object.freeze({ ...effect, created: Object.freeze([...effect.created].reverse()) });
  } else {
    throw new Error(`unknown materialization replay operation: ${test.operation}`);
  }

  try { replaySequenceMaterialization(memory, forged); }
  catch (error) {
    if (error instanceof SequenceReplayError) {
      return { id: test.id, accepted: false, error: "invalid-sequence-evidence" };
    }
    throw error;
  }
  throw new Error("forged materialization evidence was unexpectedly accepted");
}

const repoRoot = resolve(process.cwd(), "..");
const fixturePath = resolve(repoRoot, "differential/materialization-fixtures-v0.7.json");
const corpus = JSON.parse(readFileSync(fixturePath, "utf8")) as Corpus;
assert(corpus.schema === "mts-materialization-differential-fixtures/v0.1", "unexpected materialization differential fixture schema");
assert(corpus.contract === "mts-contract/v0.7", "materialization differential fixtures must select accepted v0.7 contract");
assert(corpus.pythonOracleSha === "ef42d91a868bbc5b7004acc325006ad27db3bb68", "materialization fixtures must select frozen Python oracle");
const python = spawnSync(
  "python3",
  ["differential/materialization_python_oracle.py", "differential/materialization-fixtures-v0.7.json"],
  { cwd: repoRoot, encoding: "utf8" },
);
assert(python.status === 0, `frozen Python materialization oracle failed: ${python.stderr || python.stdout}`);
const expected = JSON.parse(python.stdout) as Result[];
const actual = corpus.cases.map(run);
assert(expected.length === actual.length, "materialization differential result cardinality mismatch");
expected.forEach((pythonResult, index) => {
  const tsResult = actual[index];
  assert(tsResult !== undefined, `missing TS materialization result at ${index}`);
  assert(
    sameJson(pythonResult as unknown as Json, tsResult as unknown as Json),
    `materialization differential mismatch for ${pythonResult.id}: Python=${JSON.stringify(pythonResult)} TS=${JSON.stringify(tsResult)}`,
  );
});
