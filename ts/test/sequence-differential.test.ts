import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { Memory, type LinkHandle } from "../src/memory.js";
import {
  SequenceReplayError,
  replayResolvedSequenceGrouping,
  replayRootOpeningRestoration,
  type SequenceItem,
} from "../src/sequence.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
interface SequenceCase { readonly id: string; readonly operation: string; }
interface Corpus {
  readonly schema: string;
  readonly contract: string;
  readonly pythonOracleSha: string;
  readonly cases: readonly SequenceCase[];
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

function fixture() {
  const memory = new Memory();
  const refs: LinkHandle[] = [];
  let current = memory.root;
  for (let index = 0; index < 5; index += 1) {
    current = memory.ensureStartSelfClosed(current);
    refs.push(current);
  }
  const [opening, closing, a, b, c] = refs;
  assert(opening !== undefined && closing !== undefined && a !== undefined && b !== undefined && c !== undefined, "sequence fixture refs");
  return { memory, opening, closing, a, b, c };
}

function tokenNames(
  values: readonly LinkHandle[],
  opening: LinkHandle,
  closing: LinkHandle,
  a: LinkHandle,
  b: LinkHandle,
  c: LinkHandle,
): string[] {
  const names = new Map<LinkHandle, string>([[opening, "open"], [closing, "close"], [a, "a"], [b, "b"], [c, "c"]]);
  return values.map((value) => {
    const name = names.get(value);
    assert(name !== undefined, "unknown sequence fixture token");
    return name;
  });
}

function itemTree(items: readonly SequenceItem[], a: LinkHandle, b: LinkHandle, c: LinkHandle): Json[] {
  const names = new Map<LinkHandle, string>([[a, "a"], [b, "b"], [c, "c"]]);
  return items.map((item) => {
    if (item.kind === "group") return { group: itemTree(item.items, a, b, c) };
    const name = names.get(item.value);
    assert(name !== undefined, "unknown sequence atom fixture");
    return name;
  });
}

function run(test: SequenceCase): Result {
  const { memory, opening, closing, a, b, c } = fixture();
  const restoreInputs: Record<string, readonly LinkHandle[]> = {
    "restore-empty": Object.freeze([]),
    "restore-non-leading": Object.freeze([a, closing]),
    "restore-balanced": Object.freeze([opening, a, closing]),
    "restore-deficit": Object.freeze([opening, closing, closing]),
    "restore-recovered-prefix": Object.freeze([opening, closing, closing, opening]),
  };
  const restoreInput = restoreInputs[test.operation];
  if (restoreInput !== undefined) {
    const before = memory.linkCount;
    const restored = replayRootOpeningRestoration(memory, restoreInput, opening, closing);
    const after = memory.linkCount;
    return {
      id: test.id,
      accepted: true,
      observable: {
        restoredTokens: tokenNames(restored, opening, closing, a, b, c),
        prependedCount: restored.length - restoreInput.length,
        inputReused: restored === restoreInput,
        readOnlyCountStable: before === after,
      },
    };
  }

  if (test.operation === "restore-recovered-prefix-group") {
    const forms = Object.freeze([opening, closing, closing, opening]);
    const before = memory.linkCount;
    const restored = replayRootOpeningRestoration(memory, forms, opening, closing);
    let groupingAccepted = true;
    try { replayResolvedSequenceGrouping(memory, restored, opening, closing); }
    catch (error) {
      if (!(error instanceof SequenceReplayError)) throw error;
      groupingAccepted = false;
    }
    const after = memory.linkCount;
    return {
      id: test.id,
      accepted: true,
      observable: {
        restoredTokens: tokenNames(restored, opening, closing, a, b, c),
        inputReused: restored === forms,
        groupingAccepted,
        readOnlyCountStable: before === after,
      },
    };
  }

  const groupInputs: Record<string, readonly LinkHandle[]> = {
    "group-empty": Object.freeze([]),
    "group-flat": Object.freeze([a, b]),
    "group-nested": Object.freeze([opening, a, b, closing, c]),
    "group-empty-nested": Object.freeze([opening, closing]),
    "group-deep": Object.freeze([opening, a, opening, b, closing, closing]),
    "group-unexpected-close": Object.freeze([closing]),
    "group-unclosed-open": Object.freeze([opening, a]),
    "group-same-delimiter": Object.freeze([a]),
  };
  const forms = groupInputs[test.operation];
  if (forms === undefined) throw new Error(`unknown sequence differential operation: ${test.operation}`);
  const selectedClose = test.operation === "group-same-delimiter" ? opening : closing;
  const before = memory.linkCount;
  try {
    const description = replayResolvedSequenceGrouping(memory, forms, opening, selectedClose);
    const after = memory.linkCount;
    return {
      id: test.id,
      accepted: true,
      observable: {
        items: itemTree(description.items, a, b, c),
        rootMatches: description.root === memory.root,
        readOnlyCountStable: before === after,
      },
    };
  } catch (error) {
    if (error instanceof SequenceReplayError) return { id: test.id, accepted: false, error: "invalid-sequence-evidence" };
    throw error;
  }
}

const repoRoot = resolve(process.cwd(), "..");
const fixturePath = resolve(repoRoot, "differential/sequence-fixtures-v0.7.json");
const corpus = JSON.parse(readFileSync(fixturePath, "utf8")) as Corpus;
assert(corpus.schema === "mts-sequence-differential-fixtures/v0.1", "unexpected sequence differential fixture schema");
assert(corpus.contract === "mts-contract/v0.7", "sequence differential fixtures must select accepted v0.7 contract");
assert(corpus.pythonOracleSha === "ef42d91a868bbc5b7004acc325006ad27db3bb68", "sequence fixtures must select frozen Python oracle");
const python = spawnSync(
  "python3",
  ["differential/sequence_python_oracle.py", "differential/sequence-fixtures-v0.7.json"],
  { cwd: repoRoot, encoding: "utf8" },
);
assert(python.status === 0, `frozen Python sequence oracle failed: ${python.stderr || python.stdout}`);
const expected = JSON.parse(python.stdout) as Result[];
const actual = corpus.cases.map(run);
assert(expected.length === actual.length, "sequence differential result cardinality mismatch");
expected.forEach((pythonResult, index) => {
  const tsResult = actual[index];
  assert(tsResult !== undefined, `missing TS sequence result at ${index}`);
  assert(
    sameJson(pythonResult as unknown as Json, tsResult as unknown as Json),
    `sequence differential mismatch for ${pythonResult.id}: Python=${JSON.stringify(pythonResult)} TS=${JSON.stringify(tsResult)}`,
  );
});
