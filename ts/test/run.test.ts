import { Memory, ensureRootBasis, type LinkHandle } from "../src/memory.js";
import { defineContext } from "../src/state.js";
import {
  defineActField,
  defineActHeader,
} from "../src/structural-readers.js";
import {
  RunReplayError,
  replayRun,
  type RunEvidence,
  type RunStepSelection,
} from "../src/run.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertSame<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), message);
}

function assertArraySame(
  actual: readonly LinkHandle[],
  expected: readonly LinkHandle[],
  message: string,
): void {
  assert(actual.length === expected.length, `${message}: length`);
  actual.forEach((value, index) => assertSame(value, expected[index], `${message}: ${index}`));
}

function assertRunError(code: RunReplayError["code"], effect: () => unknown): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof RunReplayError, `${code}: wrong error type`);
    assertSame(error.code, code, `${code}: wrong code`);
    return;
  }
  throw new Error(`${code}: expected RunReplayError`);
}

interface Fixture {
  readonly memory: Memory;
  readonly R: LinkHandle;
  readonly interpreter: LinkHandle;
  readonly roleDictionary: LinkHandle;
  readonly beforeRole: LinkHandle;
  readonly afterRole: LinkHandle;
}

function fixture(): Fixture {
  const memory = new Memory();
  const { R, O, C, L, U } = ensureRootBasis(memory);
  const interpreter = memory.ensure(L, R);
  const roleDictionary = memory.ensure(U, R);
  const beforeRole = memory.ensure(O, L);
  const afterRole = memory.ensure(C, U);
  return { memory, R, interpreter, roleDictionary, beforeRole, afterRole };
}

function context(fx: Fixture, seed: LinkHandle): LinkHandle {
  const parent = fx.memory.ensure(seed, fx.R);
  const current = fx.memory.ensure(fx.R, seed);
  return defineContext(fx.memory, parent, current);
}

function step(
  fx: Fixture,
  before: LinkHandle,
  after: LinkHandle,
  options: {
    readonly headerAfter?: LinkHandle;
    readonly beforeRole?: LinkHandle;
    readonly afterRole?: LinkHandle;
  } = {},
): RunStepSelection {
  const beforeRole = options.beforeRole ?? fx.beforeRole;
  const afterRole = options.afterRole ?? fx.afterRole;
  const act = defineActHeader(
    fx.memory,
    fx.interpreter,
    fx.roleDictionary,
    options.headerAfter ?? after,
  );
  defineActField(fx.memory, act, beforeRole, before);
  defineActField(fx.memory, act, afterRole, after);
  return Object.freeze({ act, beforeRole, afterRole });
}

function run(
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

{
  const fx = fixture();
  const k0 = context(fx, fx.beforeRole);
  const k1 = context(fx, fx.afterRole);
  const k2 = context(fx, fx.interpreter);
  const s0 = step(fx, k0, k1);
  const s1 = step(fx, k1, k2);
  const evidence = run(fx, [s0, s1], k0, k2);
  const before = fx.memory.linkCount;
  assertArraySame(replayRun(fx.memory, evidence), [s0.act, s1.act], "linear run");
  assertSame(fx.memory.linkCount, before, "linear replay must be read-only");
  assertSame(fx.memory.find(k0, k2), undefined, "run must not create context shortcut");
  assertRunError("run-chain-act-mismatch", () =>
    replayRun(fx.memory, { ...evidence, steps: [s1, s0] }),
  );
}

{
  const fx = fixture();
  const k0 = context(fx, fx.beforeRole);
  const selected = step(fx, k0, k0);
  const evidence = run(fx, [selected, selected], k0, k0);
  const first = fx.memory.poles(evidence.runRoot).start;
  assert(first !== fx.R, "repeated Act must have a distinct second run position");
  assertSame(fx.memory.poles(first).end, selected.act, "first position selects same Act");
  assertSame(fx.memory.poles(evidence.runRoot).end, selected.act, "second position selects same Act");
  assertArraySame(replayRun(fx.memory, evidence), [selected.act, selected.act], "repeated Act");
}

{
  const fx = fixture();
  const k0 = context(fx, fx.beforeRole);
  const k1 = context(fx, fx.afterRole);
  const s0 = step(fx, k0, k1);
  const s1 = step(fx, k1, k0);
  assertArraySame(replayRun(fx.memory, run(fx, [s0, s1], k0, k0)), [s0.act, s1.act], "context return");

  const branchContext = context(fx, fx.roleDictionary);
  const branch = step(fx, k0, branchContext);
  assert(branch.act !== s0.act, "branch must be structurally distinct");
  assertArraySame(replayRun(fx.memory, run(fx, [s0], k0, k1)), [s0.act], "unselected branch");
}

{
  const fx = fixture();
  const k0 = context(fx, fx.beforeRole);
  const k1 = context(fx, fx.afterRole);
  const k2 = context(fx, fx.interpreter);
  const s0 = step(fx, k0, k1);
  const s1 = step(fx, k2, k0);
  assertRunError("context-discontinuity", () => replayRun(fx.memory, run(fx, [s0, s1], k0, k0)));
  assertRunError("initial-context-mismatch", () => replayRun(fx.memory, run(fx, [s0], k2, k1)));
  assertRunError("terminal-context-mismatch", () => replayRun(fx.memory, run(fx, [s0], k0, k2)));
}

{
  const fx = fixture();
  const k0 = context(fx, fx.beforeRole);
  const k1 = context(fx, fx.afterRole);
  const selected = step(fx, k0, k1);
  const wrong = context(fx, fx.interpreter);
  defineActField(fx.memory, selected.act, selected.beforeRole, wrong);
  assertRunError("invalid-step-before-field", () => replayRun(fx.memory, run(fx, [selected], k0, k1)));
}

{
  const fx = fixture();
  const k0 = context(fx, fx.beforeRole);
  const k1 = context(fx, fx.afterRole);
  const selected = step(fx, k0, k1);
  const wrong = context(fx, fx.interpreter);
  defineActField(fx.memory, selected.act, selected.afterRole, wrong);
  assertRunError("invalid-step-after-field", () => replayRun(fx.memory, run(fx, [selected], k0, k1)));
}

{
  const fx = fixture();
  const k0 = context(fx, fx.beforeRole);
  const k1 = context(fx, fx.afterRole);
  const wrongHeader = context(fx, fx.interpreter);
  const selected = step(fx, k0, k1, { headerAfter: wrongHeader });
  assertRunError("step-header-after-context-mismatch", () => replayRun(fx.memory, run(fx, [selected], k0, k1)));
}

{
  const fx = fixture();
  const k0 = context(fx, fx.beforeRole);
  const invalid = fx.memory.ensure(fx.beforeRole, fx.afterRole);
  const beforeInvalid = step(fx, invalid, k0);
  assertRunError("invalid-step-before-context", () => replayRun(fx.memory, run(fx, [beforeInvalid], invalid, k0)));

  const afterInvalid = step(fx, k0, invalid);
  assertRunError("invalid-step-after-context", () => replayRun(fx.memory, run(fx, [afterInvalid], k0, invalid)));
}

{
  const fx = fixture();
  const k0 = context(fx, fx.beforeRole);
  assertArraySame(replayRun(fx.memory, run(fx, [], k0, k0)), [], "empty run identity");
  const k1 = context(fx, fx.afterRole);
  assertRunError("empty-run-context-change", () => replayRun(fx.memory, run(fx, [], k0, k1)));
  const invalid = fx.memory.ensure(fx.beforeRole, fx.afterRole);
  assertRunError("invalid-empty-run-context", () => replayRun(fx.memory, run(fx, [], invalid, invalid)));
  assertRunError("empty-run-root-mismatch", () => replayRun(fx.memory, {
    runRoot: fx.beforeRole,
    initialContext: k0,
    terminalContext: k0,
    steps: [],
  }));
}

{
  const fx = fixture();
  const k0 = context(fx, fx.beforeRole);
  const selected = step(fx, k0, k0);
  const evidence = run(fx, [selected], k0, k0);
  const extra = fx.memory.ensure(evidence.runRoot, fx.afterRole);
  assertRunError("run-chain-extra-prefix", () => replayRun(fx.memory, { ...evidence, runRoot: extra }));
  assertRunError("run-chain-ended-early", () => replayRun(fx.memory, { ...evidence, runRoot: fx.R }));
}

{
  const fx = fixture();
  const k0 = context(fx, fx.beforeRole);
  const foreign = new Memory().root;
  assertRunError("invalid-run-evidence", () => replayRun(fx.memory, {
    runRoot: foreign,
    initialContext: k0,
    terminalContext: k0,
    steps: [],
  }));
}
