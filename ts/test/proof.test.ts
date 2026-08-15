import { Memory, ensureRootBasis, type LinkHandle } from "../src/memory.js";
import { defineContext, defineLocalRepresentativeBinding } from "../src/state.js";
import {
  defineActField,
  defineActHeader,
  readRequiredSingle,
} from "../src/structural-readers.js";
import {
  type EqualityReplayEvidence,
  type EqualityRoles,
} from "../src/interpreter.js";
import {
  ProofRuleReplayError,
  replayDecomposeEqualRelations,
  type DecomposeEqualityEvidence,
  type DecomposeEqualityRoles,
} from "../src/proof.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertSame<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), message);
}

function assertProofError(code: ProofRuleReplayError["code"], effect: () => unknown): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof ProofRuleReplayError, `${code}: wrong error type`);
    assertSame(error.code, code, `${code}: wrong code`);
    return;
  }
  throw new Error(`${code}: expected ProofRuleReplayError`);
}

interface Fixture {
  readonly memory: Memory;
  readonly R: LinkHandle;
  readonly fresh: () => LinkHandle;
}

function fixture(): Fixture {
  const memory = new Memory();
  const { R, U } = ensureRootBasis(memory);
  let cursor = U;
  const fresh = (): LinkHandle => {
    cursor = memory.ensure(cursor, R);
    return cursor;
  };
  return { memory, R, fresh };
}

function equalityRoles(fx: Fixture): EqualityRoles {
  return {
    context: fx.fresh(),
    left: fx.fresh(),
    right: fx.fresh(),
    leftRepresentative: fx.fresh(),
    rightRepresentative: fx.fresh(),
  };
}

function proofRoles(fx: Fixture): DecomposeEqualityRoles {
  return {
    premiseEqualityAct: fx.fresh(),
    theory: fx.fresh(),
    rule: fx.fresh(),
    ruleMembership: fx.fresh(),
    leftRelation: fx.fresh(),
    rightRelation: fx.fresh(),
    startClaim: fx.fresh(),
    endClaim: fx.fresh(),
    beforeContext: fx.fresh(),
    afterContext: fx.fresh(),
  };
}

function equalityPremise(
  fx: Fixture,
  context: LinkHandle,
  left: LinkHandle,
  right: LinkHandle,
  leftRepresentative: LinkHandle,
  rightRepresentative: LinkHandle,
): EqualityReplayEvidence {
  const interpreter = fx.fresh();
  const roleDictionary = fx.fresh();
  const roles = equalityRoles(fx);
  const act = defineActHeader(fx.memory, interpreter, roleDictionary, context);
  for (const [role, value] of [
    [roles.context, context],
    [roles.left, left],
    [roles.right, right],
    [roles.leftRepresentative, leftRepresentative],
    [roles.rightRepresentative, rightRepresentative],
  ] as const) defineActField(fx.memory, act, role, value);
  return { act, roles, interpreter, roleDictionary };
}

interface ProofOptions {
  readonly theory?: LinkHandle;
  readonly rule?: LinkHandle;
  readonly ruleMembership?: LinkHandle;
  readonly left?: LinkHandle;
  readonly right?: LinkHandle;
  readonly startClaim?: LinkHandle;
  readonly endClaim?: LinkHandle;
  readonly beforeContext?: LinkHandle;
  readonly afterContext?: LinkHandle;
  readonly headerAfter?: LinkHandle;
}

function proofEvidence(
  fx: Fixture,
  premise: EqualityReplayEvidence,
  options: ProofOptions = {},
): DecomposeEqualityEvidence {
  const premiseContext = readRequiredSingle(fx.memory, premise.act, premise.roles.context);
  const premiseLeft = readRequiredSingle(fx.memory, premise.act, premise.roles.left);
  const premiseRight = readRequiredSingle(fx.memory, premise.act, premise.roles.right);

  const theory = options.theory ?? fx.fresh();
  const rule = options.rule ?? fx.fresh();
  const ruleMembership = options.ruleMembership ?? fx.memory.ensure(theory, rule);
  const left = options.left ?? premiseLeft;
  const right = options.right ?? premiseRight;
  const leftPoles = fx.memory.poles(left);
  const rightPoles = fx.memory.poles(right);
  const startClaim = options.startClaim ?? fx.memory.ensure(leftPoles.start, rightPoles.start);
  const endClaim = options.endClaim ?? fx.memory.ensure(leftPoles.end, rightPoles.end);
  const beforeContext = options.beforeContext ?? premiseContext;
  const afterContext = options.afterContext ?? beforeContext;
  const interpreter = fx.fresh();
  const roleDictionary = fx.fresh();
  const roles = proofRoles(fx);
  const act = defineActHeader(
    fx.memory,
    interpreter,
    roleDictionary,
    options.headerAfter ?? afterContext,
  );
  for (const [role, value] of [
    [roles.premiseEqualityAct, premise.act],
    [roles.theory, theory],
    [roles.rule, rule],
    [roles.ruleMembership, ruleMembership],
    [roles.leftRelation, left],
    [roles.rightRelation, right],
    [roles.startClaim, startClaim],
    [roles.endClaim, endClaim],
    [roles.beforeContext, beforeContext],
    [roles.afterContext, afterContext],
  ] as const) defineActField(fx.memory, act, role, value);
  return { premise, act, roles, interpreter, roleDictionary };
}

function trueFixture(nested = false) {
  const fx = fixture();
  const context = defineContext(fx.memory, fx.fresh(), fx.fresh());
  const leftStart = nested ? fx.memory.ensure(fx.fresh(), fx.fresh()) : fx.fresh();
  const leftEnd = nested ? fx.memory.ensure(fx.fresh(), fx.fresh()) : fx.fresh();
  const rightStart = nested ? fx.memory.ensure(fx.fresh(), fx.fresh()) : fx.fresh();
  const rightEnd = nested ? fx.memory.ensure(fx.fresh(), fx.fresh()) : fx.fresh();
  const left = fx.memory.ensure(leftStart, leftEnd);
  const right = fx.memory.ensure(rightStart, rightEnd);
  const representative = fx.fresh();
  defineLocalRepresentativeBinding(fx.memory, context, left, representative);
  defineLocalRepresentativeBinding(fx.memory, context, right, representative);
  const premise = equalityPremise(fx, context, left, right, representative, representative);
  return { fx, context, left, right, premise };
}

{
  const { fx, premise } = trueFixture();
  const evidence = proofEvidence(fx, premise);
  const before = fx.memory.linkCount;
  const claims = replayDecomposeEqualRelations(fx.memory, evidence);
  const startClaim = readRequiredSingle(fx.memory, evidence.act, evidence.roles.startClaim);
  const endClaim = readRequiredSingle(fx.memory, evidence.act, evidence.roles.endClaim);
  assertSame(claims[0], startClaim, "must return exact start claim");
  assertSame(claims[1], endClaim, "must return exact end claim");
  assertSame(fx.memory.linkCount, before, "proof replay must be read-only");
}

{
  const fx = fixture();
  const context = defineContext(fx.memory, fx.fresh(), fx.fresh());
  const left = fx.memory.ensure(fx.fresh(), fx.fresh());
  const right = fx.memory.ensure(fx.fresh(), fx.fresh());
  const premise = equalityPremise(fx, context, left, right, left, right);
  const evidence = proofEvidence(fx, premise);
  assertProofError("false-equality-premise", () => replayDecomposeEqualRelations(fx.memory, evidence));
}

{
  const { fx, premise } = trueFixture();
  const theory = fx.fresh();
  const otherTheory = fx.fresh();
  const rule = fx.fresh();
  const evidence = proofEvidence(fx, premise, {
    theory,
    rule,
    ruleMembership: fx.memory.ensure(otherTheory, rule),
  });
  assertProofError("rule-not-admitted", () => replayDecomposeEqualRelations(fx.memory, evidence));
}

{
  const { fx, premise, left } = trueFixture();
  const same = fx.memory.ensure(fx.memory.poles(left).start, fx.memory.poles(left).end);
  assertSame(same, left, "same ordered pair must reuse exact relation");
  replayDecomposeEqualRelations(fx.memory, proofEvidence(fx, premise, { left: same }));
}

{
  const fx = fixture();
  const context = defineContext(fx.memory, fx.fresh(), fx.fresh());
  const fixed = fx.fresh();
  const left = fx.memory.ensureStartSelfClosed(fixed);
  const right = fx.memory.ensure(fx.fresh(), fx.fresh());
  const representative = fx.fresh();
  defineLocalRepresentativeBinding(fx.memory, context, left, representative);
  defineLocalRepresentativeBinding(fx.memory, context, right, representative);
  const premise = equalityPremise(fx, context, left, right, representative, representative);
  assertProofError("partial-relation", () =>
    replayDecomposeEqualRelations(fx.memory, proofEvidence(fx, premise)),
  );
}

{
  const { fx, premise } = trueFixture();
  const forged = fx.memory.ensure(fx.fresh(), fx.fresh());
  assertProofError("forged-start-claim", () =>
    replayDecomposeEqualRelations(fx.memory, proofEvidence(fx, premise, { startClaim: forged })),
  );
  assertProofError("forged-end-claim", () =>
    replayDecomposeEqualRelations(fx.memory, proofEvidence(fx, premise, { endClaim: forged })),
  );
}

{
  const { fx, context, premise } = trueFixture();
  const otherContext = defineContext(fx.memory, fx.fresh(), fx.fresh());
  assertProofError("context-change", () =>
    replayDecomposeEqualRelations(fx.memory, proofEvidence(fx, premise, {
      beforeContext: context,
      afterContext: otherContext,
    })),
  );
  assertProofError("premise-context-mismatch", () =>
    replayDecomposeEqualRelations(fx.memory, proofEvidence(fx, premise, {
      beforeContext: otherContext,
      afterContext: otherContext,
    })),
  );
}

{
  const { fx, premise } = trueFixture();
  const evidence = proofEvidence(fx, premise);
  defineActField(fx.memory, evidence.act, evidence.roles.startClaim, fx.fresh());
  assertProofError("invalid-proof-evidence", () => replayDecomposeEqualRelations(fx.memory, evidence));
}

{
  const { fx, premise } = trueFixture();
  const otherContext = defineContext(fx.memory, fx.fresh(), fx.fresh());
  const evidence = proofEvidence(fx, premise, { headerAfter: otherContext });
  assertProofError("proof-header-mismatch", () => replayDecomposeEqualRelations(fx.memory, evidence));
}

{
  const { fx, left, right, premise } = trueFixture(true);
  const evidence = proofEvidence(fx, premise);
  const before = fx.memory.linkCount;
  replayDecomposeEqualRelations(fx.memory, evidence);
  const leftStart = fx.memory.poles(left).start;
  const rightStart = fx.memory.poles(right).start;
  const nestedLeft = fx.memory.poles(leftStart);
  const nestedRight = fx.memory.poles(rightStart);
  assertSame(
    fx.memory.find(nestedLeft.start, nestedRight.start),
    undefined,
    "decomposition must not recursively materialize nested claim",
  );
  assertSame(fx.memory.linkCount, before, "nested replay must stay read-only");
}

{
  const { fx, premise } = trueFixture();
  const evidence = proofEvidence(fx, premise);
  const foreign = new Memory().root;
  assertProofError("invalid-proof-evidence", () => replayDecomposeEqualRelations(fx.memory, {
    ...evidence,
    act: foreign,
  }));
}
