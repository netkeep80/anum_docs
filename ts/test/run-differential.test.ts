import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { Memory, ensureRootBasis, type LinkHandle } from "../src/memory.js";
import { defineContext } from "../src/state.js";
import { defineActField, defineActHeader } from "../src/structural-readers.js";
import {
  RunReplayError,
  replayRun,
  type RunEvidence,
  type RunStepSelection,
} from "../src/run.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
interface RunCase { readonly id: string; readonly operation: string; }
interface Corpus {
  readonly schema: string;
  readonly contract: string;
  readonly pythonOracleSha: string;
  readonly cases: readonly RunCase[];
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
  const { R, O, C, L, U } = ensureRootBasis(memory);
  const interpreter = memory.ensure(L, R);
  const roleDictionary = memory.ensure(U, R);
  const beforeRole = memory.ensure(O, L);
  const afterRole = memory.ensure(C, U);
  const context = (seed: LinkHandle): LinkHandle => {
    const parent = memory.ensure(seed, R);
    const current = memory.ensure(R, seed);
    return defineContext(memory, parent, current);
  };
  return { memory, R, interpreter, roleDictionary, beforeRole, afterRole, context };
}

type Fixture = ReturnType<typeof fixture>;
function step(
  fx: Fixture,
  before: LinkHandle,
  after: LinkHandle,
  headerAfter: LinkHandle = after,
): RunStepSelection {
  const act = defineActHeader(fx.memory, fx.interpreter, fx.roleDictionary, headerAfter);
  defineActField(fx.memory, act, fx.beforeRole, before);
  defineActField(fx.memory, act, fx.afterRole, after);
  return Object.freeze({ act, beforeRole: fx.beforeRole, afterRole: fx.afterRole });
}
function runEvidence(
  fx: Fixture,
  steps: readonly RunStepSelection[],
  initialContext: LinkHandle,
  terminalContext: LinkHandle,
): RunEvidence {
  let runRoot = fx.R;
  for (const selected of steps) runRoot = fx.memory.ensure(runRoot, selected.act);
  return Object.freeze({
    runRoot,
    initialContext,
    terminalContext,
    steps: Object.freeze([...steps]),
  });
}

function run(test: RunCase): Result {
  const fx = fixture();
  const k0 = fx.context(fx.beforeRole);
  const k1 = fx.context(fx.afterRole);
  const k2 = fx.context(fx.interpreter);
  let evidence: RunEvidence;
  const labels = new Map<LinkHandle, string>();

  if (test.operation === "linear") {
    const s0 = step(fx, k0, k1);
    const s1 = step(fx, k1, k2);
    evidence = runEvidence(fx, [s0, s1], k0, k2);
    labels.set(s0.act, "a0"); labels.set(s1.act, "a1");
  } else if (test.operation === "repeated-act") {
    const s0 = step(fx, k0, k0);
    evidence = runEvidence(fx, [s0, s0], k0, k0);
    labels.set(s0.act, "a0");
  } else if (test.operation === "context-return") {
    const s0 = step(fx, k0, k1);
    const s1 = step(fx, k1, k0);
    evidence = runEvidence(fx, [s0, s1], k0, k0);
    labels.set(s0.act, "a0"); labels.set(s1.act, "a1");
  } else if (test.operation === "unselected-branch") {
    const s0 = step(fx, k0, k1);
    step(fx, k0, k2);
    evidence = runEvidence(fx, [s0], k0, k1);
    labels.set(s0.act, "a0");
  } else if (test.operation === "empty-identity") {
    evidence = runEvidence(fx, [], k0, k0);
  } else if (test.operation === "reordered") {
    const s0 = step(fx, k0, k1);
    const s1 = step(fx, k1, k2);
    const good = runEvidence(fx, [s0, s1], k0, k2);
    evidence = Object.freeze({ ...good, steps: Object.freeze([s1, s0]) });
  } else if (test.operation === "discontinuity") {
    const s0 = step(fx, k0, k1);
    const s1 = step(fx, k2, k0);
    evidence = runEvidence(fx, [s0, s1], k0, k0);
  } else if (test.operation === "initial-mismatch") {
    const s0 = step(fx, k0, k1);
    evidence = runEvidence(fx, [s0], k2, k1);
  } else if (test.operation === "terminal-mismatch") {
    const s0 = step(fx, k0, k1);
    evidence = runEvidence(fx, [s0], k0, k2);
  } else if (test.operation === "forged-before") {
    const s0 = step(fx, k0, k1);
    defineActField(fx.memory, s0.act, fx.beforeRole, k2);
    evidence = runEvidence(fx, [s0], k0, k1);
  } else if (test.operation === "forged-after") {
    const s0 = step(fx, k0, k1);
    defineActField(fx.memory, s0.act, fx.afterRole, k2);
    evidence = runEvidence(fx, [s0], k0, k1);
  } else if (test.operation === "header-mismatch") {
    const s0 = step(fx, k0, k1, k2);
    evidence = runEvidence(fx, [s0], k0, k1);
  } else if (test.operation === "invalid-before-context") {
    const invalid = fx.memory.ensure(fx.beforeRole, fx.afterRole);
    const s0 = step(fx, invalid, k0);
    evidence = runEvidence(fx, [s0], invalid, k0);
  } else if (test.operation === "invalid-after-context") {
    const invalid = fx.memory.ensure(fx.beforeRole, fx.afterRole);
    const s0 = step(fx, k0, invalid);
    evidence = runEvidence(fx, [s0], k0, invalid);
  } else if (test.operation === "empty-context-change") {
    evidence = runEvidence(fx, [], k0, k1);
  } else if (test.operation === "empty-invalid-context") {
    const invalid = fx.memory.ensure(fx.beforeRole, fx.afterRole);
    evidence = runEvidence(fx, [], invalid, invalid);
  } else if (test.operation === "empty-root-mismatch") {
    evidence = Object.freeze({ runRoot: fx.beforeRole, initialContext: k0, terminalContext: k0, steps: [] });
  } else if (test.operation === "chain-extra-prefix") {
    const s0 = step(fx, k0, k0);
    const good = runEvidence(fx, [s0], k0, k0);
    const extra = fx.memory.ensure(fx.R, fx.afterRole);
    const forged = fx.memory.ensure(extra, s0.act);
    evidence = Object.freeze({ ...good, runRoot: forged });
  } else if (test.operation === "chain-ended-early") {
    const s0 = step(fx, k0, k0);
    const good = runEvidence(fx, [s0], k0, k0);
    evidence = Object.freeze({ ...good, runRoot: fx.R });
  } else if (test.operation === "foreign-root") {
    const foreign = new Memory().root;
    evidence = Object.freeze({ runRoot: foreign, initialContext: k0, terminalContext: k0, steps: [] });
  } else {
    throw new Error(`unknown Run differential operation: ${test.operation}`);
  }

  const before = fx.memory.linkCount;
  try {
    const acts = replayRun(fx.memory, evidence);
    const observable: { acts: string[]; readOnlyCountStable: boolean; shortcutAbsent?: boolean } = {
      acts: acts.map((act) => {
        const label = labels.get(act);
        assert(label !== undefined, "missing portable Run act label");
        return label;
      }),
      readOnlyCountStable: before === fx.memory.linkCount,
    };
    if (test.operation === "linear") {
      observable.shortcutAbsent = fx.memory.find(k0, k2) === undefined;
    }
    return { id: test.id, accepted: true, observable };
  } catch (error) {
    if (error instanceof RunReplayError) {
      return { id: test.id, accepted: false, error: "invalid-run-evidence" };
    }
    throw error;
  }
}

const repoRoot = resolve(process.cwd(), "..");
const fixturePath = resolve(repoRoot, "differential/run-fixtures-v0.7.json");
const corpus = JSON.parse(readFileSync(fixturePath, "utf8")) as Corpus;
assert(corpus.schema === "mts-run-differential-fixtures/v0.1", "unexpected Run differential fixture schema");
assert(corpus.contract === "mts-contract/v0.7", "Run differential fixtures must select accepted v0.7 contract");
assert(corpus.pythonOracleSha === "ef42d91a868bbc5b7004acc325006ad27db3bb68", "Run fixtures must select frozen Python oracle");
const python = spawnSync(
  "python3",
  ["differential/run_python_oracle.py", "differential/run-fixtures-v0.7.json"],
  { cwd: repoRoot, encoding: "utf8" },
);
assert(python.status === 0, `frozen Python Run oracle failed: ${python.stderr || python.stdout}`);
const expected = JSON.parse(python.stdout) as Result[];
const actual = corpus.cases.map(run);
assert(expected.length === actual.length, "Run differential result cardinality mismatch");
expected.forEach((pythonResult, index) => {
  const tsResult = actual[index];
  assert(tsResult !== undefined, `missing TS Run result at ${index}`);
  assert(
    sameJson(pythonResult as unknown as Json, tsResult as unknown as Json),
    `Run differential mismatch for ${pythonResult.id}: Python=${JSON.stringify(pythonResult)} TS=${JSON.stringify(tsResult)}`,
  );
});
