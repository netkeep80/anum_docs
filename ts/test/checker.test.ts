import { Memory, ensureRootBasis, type LinkHandle } from "../src/memory.js";
import { defineContext, defineLocalRepresentativeBinding } from "../src/state.js";
import { defineDictionaryEffect, defineDictionaryScope } from "../src/dictionary.js";
import {
  buildSelectedSourceEvidence,
  defineSourceForm,
  materializeSourceContent,
  type SourceFrontEndEvidence,
} from "../src/source.js";
import { defineActField, defineActHeader, readRequiredSingle } from "../src/structural-readers.js";
import { type EqualityReplayEvidence, type EqualityRoles } from "../src/interpreter.js";
import {
  type DecomposeEqualityEvidence,
  type DecomposeEqualityRoles,
} from "../src/proof.js";
import { type RunEvidence, type RunStepSelection } from "../src/run.js";
import {
  IntegratedCheckerError,
  replayIntegratedProof,
  type IntegratedProofEvidence,
} from "../src/checker.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertSame<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), message);
}

function assertCheckerError(
  code: IntegratedCheckerError["code"],
  effect: () => unknown,
): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof IntegratedCheckerError, `${code}: wrong error type`);
    assertSame(error.code, code, `${code}: wrong code`);
    return;
  }
  throw new Error(`${code}: expected IntegratedCheckerError`);
}

interface Fixture {
  readonly memory: Memory;
  readonly R: LinkHandle;
  readonly byteRefs: readonly LinkHandle[];
  readonly evidence: IntegratedProofEvidence;
  readonly rule: LinkHandle;
  readonly theory: LinkHandle;
  readonly context: LinkHandle;
  readonly fresh: () => LinkHandle;
}

function equalityRoles(fresh: () => LinkHandle): EqualityRoles {
  return {
    context: fresh(),
    left: fresh(),
    right: fresh(),
    leftRepresentative: fresh(),
    rightRepresentative: fresh(),
  };
}

function proofRoles(fresh: () => LinkHandle): DecomposeEqualityRoles {
  return {
    premiseEqualityAct: fresh(),
    theory: fresh(),
    rule: fresh(),
    ruleMembership: fresh(),
    leftRelation: fresh(),
    rightRelation: fresh(),
    startClaim: fresh(),
    endClaim: fresh(),
    beforeContext: fresh(),
    afterContext: fresh(),
  };
}

function sourceEvidence(
  memory: Memory,
  byteRefs: readonly LinkHandle[],
  rule: LinkHandle,
  theory: LinkHandle,
  fresh: () => LinkHandle,
): SourceFrontEndEvidence {
  const content = materializeSourceContent(memory, byteRefs, new Uint8Array([7]));
  const source = defineSourceForm(memory, content);
  const beforeDictionary = defineDictionaryScope(memory, memory.root, memory.root);
  const definition = defineDictionaryEffect(
    memory,
    beforeDictionary,
    memory.root,
    memory.root,
    content,
    rule,
  );
  return buildSelectedSourceEvidence(
    memory,
    byteRefs,
    source,
    [{ start: 0, end: 1, form: rule, dictionaryOccurrence: definition.occurrence }],
    { dictionary: definition.afterScope, grammar: fresh(), theory },
  );
}

function makeFixture(): Fixture {
  const memory = new Memory();
  const { R, U } = ensureRootBasis(memory);
  let cursor = U;
  const fresh = (): LinkHandle => {
    cursor = memory.ensure(cursor, R);
    return cursor;
  };
  const byteRefs = Object.freeze(Array.from({ length: 256 }, () => fresh()));
  const context = defineContext(memory, fresh(), fresh());
  const theory = fresh();
  const rule = fresh();
  const source = sourceEvidence(memory, byteRefs, rule, theory, fresh);

  const leftStart = fresh();
  const leftEnd = fresh();
  const rightStart = fresh();
  const rightEnd = fresh();
  const left = memory.ensure(leftStart, leftEnd);
  const right = memory.ensure(rightStart, rightEnd);
  const representative = fresh();
  defineLocalRepresentativeBinding(memory, context, left, representative);
  defineLocalRepresentativeBinding(memory, context, right, representative);

  const eqRoles = equalityRoles(fresh);
  const eqInterpreter = fresh();
  const eqRoleDictionary = fresh();
  const eqAct = defineActHeader(memory, eqInterpreter, eqRoleDictionary, context);
  for (const [role, value] of [
    [eqRoles.context, context],
    [eqRoles.left, left],
    [eqRoles.right, right],
    [eqRoles.leftRepresentative, representative],
    [eqRoles.rightRepresentative, representative],
  ] as const) defineActField(memory, eqAct, role, value);
  const premise: EqualityReplayEvidence = {
    act: eqAct,
    roles: eqRoles,
    interpreter: eqInterpreter,
    roleDictionary: eqRoleDictionary,
  };

  const membership = memory.ensure(theory, rule);
  const startClaim = memory.ensure(leftStart, rightStart);
  const endClaim = memory.ensure(leftEnd, rightEnd);
  const pRoles = proofRoles(fresh);
  const proofInterpreter = fresh();
  const proofRoleDictionary = fresh();
  const proofAct = defineActHeader(memory, proofInterpreter, proofRoleDictionary, context);
  for (const [role, value] of [
    [pRoles.premiseEqualityAct, eqAct],
    [pRoles.theory, theory],
    [pRoles.rule, rule],
    [pRoles.ruleMembership, membership],
    [pRoles.leftRelation, left],
    [pRoles.rightRelation, right],
    [pRoles.startClaim, startClaim],
    [pRoles.endClaim, endClaim],
    [pRoles.beforeContext, context],
    [pRoles.afterContext, context],
  ] as const) defineActField(memory, proofAct, role, value);
  const ruleApplication: DecomposeEqualityEvidence = {
    premise,
    act: proofAct,
    roles: pRoles,
    interpreter: proofInterpreter,
    roleDictionary: proofRoleDictionary,
  };

  const eqStep: RunStepSelection = {
    act: eqAct,
    beforeRole: eqRoles.context,
    afterRole: eqRoles.context,
  };
  const proofStep: RunStepSelection = {
    act: proofAct,
    beforeRole: pRoles.beforeContext,
    afterRole: pRoles.afterContext,
  };
  let runRoot = memory.ensure(R, eqAct);
  runRoot = memory.ensure(runRoot, proofAct);
  const run: RunEvidence = {
    runRoot,
    initialContext: context,
    terminalContext: context,
    steps: Object.freeze([eqStep, proofStep]),
  };

  const evidence: IntegratedProofEvidence = {
    source,
    ruleApplication,
    run,
    judgment: {
      theory,
      context,
      goal: { startClaim, endClaim },
    },
  };
  return { memory, R, byteRefs, evidence, rule, theory, context, fresh };
}

{
  const fx = makeFixture();
  const before = fx.memory.linkCount;
  const result = replayIntegratedProof(fx.memory, fx.byteRefs, fx.evidence);
  assertSame(result[0], fx.evidence.judgment.goal.startClaim, "exact start goal");
  assertSame(result[1], fx.evidence.judgment.goal.endClaim, "exact end goal");
  assertSame(fx.memory.linkCount, before, "integrated replay must be read-only");
}

{
  const fx = makeFixture();
  const goal = fx.evidence.judgment.goal;
  assertCheckerError("goal-mismatch", () => replayIntegratedProof(
    fx.memory,
    fx.byteRefs,
    { ...fx.evidence, judgment: { ...fx.evidence.judgment, goal: {
      startClaim: goal.endClaim,
      endClaim: goal.startClaim,
    } } },
  ));

  const startPoles = fx.memory.poles(goal.startClaim);
  const same = fx.memory.ensure(startPoles.start, startPoles.end);
  assertSame(same, goal.startClaim, "same goal pair must reuse semantic Link");
  replayIntegratedProof(fx.memory, fx.byteRefs, fx.evidence);

  const different = fx.memory.ensure(startPoles.start, fx.fresh());
  assertCheckerError("goal-mismatch", () => replayIntegratedProof(
    fx.memory,
    fx.byteRefs,
    { ...fx.evidence, judgment: { ...fx.evidence.judgment, goal: { ...goal, startClaim: different } } },
  ));
}

{
  const fx = makeFixture();
  assertCheckerError("judgment-theory-mismatch", () => replayIntegratedProof(
    fx.memory,
    fx.byteRefs,
    { ...fx.evidence, judgment: { ...fx.evidence.judgment, theory: fx.fresh() } },
  ));
  const otherContext = defineContext(fx.memory, fx.fresh(), fx.fresh());
  assertCheckerError("judgment-context-mismatch", () => replayIntegratedProof(
    fx.memory,
    fx.byteRefs,
    { ...fx.evidence, judgment: { ...fx.evidence.judgment, context: otherContext } },
  ));
}

{
  const fx = makeFixture();
  const otherRule = fx.fresh();
  const otherSource = sourceEvidence(fx.memory, fx.byteRefs, otherRule, fx.theory, fx.fresh);
  assertCheckerError("source-rule-mismatch", () => replayIntegratedProof(
    fx.memory,
    fx.byteRefs,
    { ...fx.evidence, source: otherSource },
  ));

  const otherTheory = fx.fresh();
  const otherTheorySource = sourceEvidence(fx.memory, fx.byteRefs, fx.rule, otherTheory, fx.fresh);
  assertCheckerError("source-theory-mismatch", () => replayIntegratedProof(
    fx.memory,
    fx.byteRefs,
    { ...fx.evidence, source: otherTheorySource },
  ));
}

{
  const fx = makeFixture();
  const premise = fx.evidence.ruleApplication.premise;
  defineActField(fx.memory, premise.act, premise.roles.leftRepresentative, fx.fresh());
  assertCheckerError("invalid-equality-premise", () => replayIntegratedProof(
    fx.memory,
    fx.byteRefs,
    fx.evidence,
  ));
}

{
  const fx = makeFixture();
  const swapped: RunEvidence = {
    ...fx.evidence.run,
    steps: Object.freeze([...fx.evidence.run.steps].reverse()),
  };
  assertCheckerError("invalid-run", () => replayIntegratedProof(
    fx.memory,
    fx.byteRefs,
    { ...fx.evidence, run: swapped },
  ));
}

{
  const fx = makeFixture();
  const [premiseStep, proofStep] = fx.evidence.run.steps;
  assert(premiseStep !== undefined && proofStep !== undefined, "two proof steps required");
  let extendedRoot = fx.evidence.run.runRoot;
  extendedRoot = fx.memory.ensure(extendedRoot, proofStep.act);
  const extended: RunEvidence = {
    ...fx.evidence.run,
    runRoot: extendedRoot,
    steps: Object.freeze([premiseStep, proofStep, proofStep]),
  };
  assertCheckerError("run-acts-mismatch", () => replayIntegratedProof(
    fx.memory,
    fx.byteRefs,
    { ...fx.evidence, run: extended },
  ));
}

{
  const fx = makeFixture();
  const otherContext = defineContext(fx.memory, fx.fresh(), fx.fresh());
  assertCheckerError("run-context-mismatch", () => replayIntegratedProof(
    fx.memory,
    fx.byteRefs,
    { ...fx.evidence, run: { ...fx.evidence.run, initialContext: otherContext } },
  ));
}

{
  const fx = makeFixture();
  const proof = fx.evidence.ruleApplication;
  const otherContext = defineContext(fx.memory, fx.fresh(), fx.fresh());
  defineActField(fx.memory, proof.act, proof.roles.afterContext, otherContext);
  assertCheckerError("invalid-integrated-evidence", () => replayIntegratedProof(
    fx.memory,
    fx.byteRefs,
    fx.evidence,
  ));
}

{
  const fx = makeFixture();
  const foreign = new Memory().root;
  assertCheckerError("invalid-integrated-evidence", () => replayIntegratedProof(
    fx.memory,
    fx.byteRefs,
    { ...fx.evidence, ruleApplication: { ...fx.evidence.ruleApplication, act: foreign } },
  ));
}
