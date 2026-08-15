import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { Memory, type LinkHandle } from "../src/memory.js";
import {
  DirectDeixisReplayError,
  analyzeDirectDeixisCarrier,
  type DeicticPole,
  type DirectDeixisVocabulary,
} from "../src/direct-deixis.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
interface DeixisCase { readonly id: string; readonly operation: string; }
interface Corpus {
  readonly schema: string;
  readonly contract: string;
  readonly pythonOracleSha: string;
  readonly cases: readonly DeixisCase[];
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
  const startPole = memory.ensureStartSelfClosed(memory.root);
  const endPole = memory.ensureEndSelfClosed(memory.root);
  const nodeTag = memory.ensure(startPole, endPole);
  const opaqueTag = memory.ensure(endPole, startPole);
  const pronounTag = memory.ensure(nodeTag, opaqueTag);
  const upStep = memory.ensure(opaqueTag, nodeTag);
  const vocabulary: DirectDeixisVocabulary = Object.freeze({
    nodeTag, opaqueTag, pronounTag, upStep, startPole, endPole,
  });
  const fold = (values: readonly LinkHandle[]): LinkHandle => {
    let current = memory.root;
    for (const value of values) current = memory.ensure(current, value);
    return current;
  };
  const opaque = (): LinkHandle => memory.ensure(opaqueTag, memory.root);
  const pronoun = (up: number, pole: DeicticPole): LinkHandle => {
    const marker = pole === "start" ? startPole : endPole;
    return memory.ensure(pronounTag, fold([...Array<LinkHandle>(up).fill(upStep), marker]));
  };
  const node = (...children: LinkHandle[]): LinkHandle => memory.ensure(nodeTag, fold(children));
  return { memory, vocabulary, fold, opaque, pronoun, node };
}

function run(test: DeixisCase): Result {
  const f = fixture();
  let vocabulary = f.vocabulary;
  let carrier: LinkHandle;

  if (test.operation === "basic") {
    carrier = f.node(
      f.node(f.pronoun(0, "start")),
      f.node(f.pronoun(2, "end")),
      f.opaque(),
    );
  } else if (test.operation === "shared-subtree") {
    const pronoun = f.pronoun(1, "end");
    const shared = f.node(pronoun);
    carrier = f.node(shared, shared);
  } else if (test.operation === "deep-path") {
    carrier = f.node(f.node(f.node(f.pronoun(2, "start"))), f.opaque());
  } else if (test.operation === "opaque") {
    carrier = f.opaque();
  } else if (test.operation === "malformed-opaque") {
    carrier = f.memory.ensure(f.vocabulary.opaqueTag, f.vocabulary.startPole);
  } else if (test.operation === "empty-metadata") {
    carrier = f.memory.ensure(f.vocabulary.pronounTag, f.memory.root);
  } else if (test.operation === "invalid-marker") {
    carrier = f.memory.ensure(f.vocabulary.pronounTag, f.fold([f.vocabulary.nodeTag]));
  } else if (test.operation === "non-up-prefix") {
    carrier = f.memory.ensure(
      f.vocabulary.pronounTag,
      f.fold([f.vocabulary.opaqueTag, f.vocabulary.startPole]),
    );
  } else if (test.operation === "malformed-node") {
    carrier = f.memory.ensure(f.vocabulary.nodeTag, f.vocabulary.startPole);
  } else if (test.operation === "duplicate-vocabulary") {
    carrier = f.opaque();
    vocabulary = Object.freeze({ ...f.vocabulary, endPole: f.vocabulary.startPole });
  } else if (test.operation === "foreign-vocabulary") {
    carrier = f.opaque();
    const other = new Memory();
    const foreign = other.ensureStartSelfClosed(other.root);
    vocabulary = Object.freeze({ ...f.vocabulary, startPole: foreign });
  } else {
    throw new Error(`unknown Direct Deixis differential operation: ${test.operation}`);
  }

  const before = f.memory.linkCount;
  try {
    const occurrences = analyzeDirectDeixisCarrier(f.memory, carrier, vocabulary);
    const after = f.memory.linkCount;
    return {
      id: test.id,
      accepted: true,
      observable: {
        occurrences: occurrences.map((occurrence) => ({
          path: [...occurrence.path],
          up: occurrence.up,
          pole: occurrence.pole,
        })),
        readOnlyCountStable: before === after,
      },
    };
  } catch (error) {
    if (error instanceof DirectDeixisReplayError) {
      return { id: test.id, accepted: false, error: "invalid-direct-deixis-evidence" };
    }
    throw error;
  }
}

const repoRoot = resolve(process.cwd(), "..");
const fixturePath = resolve(repoRoot, "differential/direct-deixis-fixtures-v0.7.json");
const corpus = JSON.parse(readFileSync(fixturePath, "utf8")) as Corpus;
assert(corpus.schema === "mts-direct-deixis-differential-fixtures/v0.1", "unexpected Direct Deixis differential fixture schema");
assert(corpus.contract === "mts-contract/v0.7", "Direct Deixis differential fixtures must select accepted v0.7 contract");
assert(corpus.pythonOracleSha === "ef42d91a868bbc5b7004acc325006ad27db3bb68", "Direct Deixis fixtures must select frozen Python oracle");
const python = spawnSync(
  "python3",
  ["differential/direct_deixis_python_oracle.py", "differential/direct-deixis-fixtures-v0.7.json"],
  { cwd: repoRoot, encoding: "utf8" },
);
assert(python.status === 0, `frozen Python Direct Deixis oracle failed: ${python.stderr || python.stdout}`);
const expected = JSON.parse(python.stdout) as Result[];
const actual = corpus.cases.map(run);
assert(expected.length === actual.length, "Direct Deixis differential result cardinality mismatch");
expected.forEach((pythonResult, index) => {
  const tsResult = actual[index];
  assert(tsResult !== undefined, `missing TS Direct Deixis result at ${index}`);
  assert(
    sameJson(pythonResult as unknown as Json, tsResult as unknown as Json),
    `Direct Deixis differential mismatch for ${pythonResult.id}: Python=${JSON.stringify(pythonResult)} TS=${JSON.stringify(tsResult)}`,
  );
});
