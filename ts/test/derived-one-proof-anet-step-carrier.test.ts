import {
  type EqualityReplayEvidence,
  type EqualityRoles,
} from "../src/interpreter.js";
import { Memory, ensureRootBasis, type LinkHandle } from "../src/memory.js";
import {
  replayDecomposeEqualRelations,
  type DecomposeEqualityEvidence,
  type DecomposeEqualityRoles,
} from "../src/proof.js";
import { defineContext } from "../src/state.js";
import { defineActField, defineActHeader } from "../src/structural-readers.js";
import { defineStructuralRoleDictionary } from "../src/structural-rule.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
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

function decompositionRoles(fresh: () => LinkHandle): DecomposeEqualityRoles {
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

function main(): void {
  const memory = new Memory();
  const { R, L, U } = ensureRootBasis(memory);
  let cursor = memory.ensure(U, R);
  const fresh = (): LinkHandle => (cursor = memory.ensure(cursor, R));

  const theory = memory.ensure(L, U);
  const context = defineContext(memory, fresh(), fresh());
  const sharedStart = fresh();
  const end1 = fresh();
  const end2 = fresh();
  const relation1 = memory.ensure(sharedStart, end1);
  const relation2 = memory.ensure(sharedStart, end2);
  assert(relation1 !== relation2, "relations must be structurally distinct");

  const makeEquality = (relation: LinkHandle): EqualityReplayEvidence => {
    const roles = equalityRoles(fresh);
    const roleDictionary = defineStructuralRoleDictionary(memory, Object.values(roles));
    const interpreter = fresh();
    const act = defineActHeader(memory, interpreter, roleDictionary, context);
    for (const [role, value] of [
      [roles.context, context],
      [roles.left, relation],
      [roles.right, relation],
      [roles.leftRepresentative, relation],
      [roles.rightRepresentative, relation],
    ] as const) {
      defineActField(memory, act, role, value);
    }
    return Object.freeze({ act, roles, interpreter, roleDictionary });
  };

  const equality1 = makeEquality(relation1);
  const equality2 = makeEquality(relation2);

  const roles1 = decompositionRoles(fresh);
  const roles2 = decompositionRoles(fresh);
  const proofDictionary = defineStructuralRoleDictionary(memory, [
    ...Object.values(roles1),
    ...Object.values(roles2),
  ]);
  const proofInterpreter = fresh();
  const proofAct = defineActHeader(memory, proofInterpreter, proofDictionary, context);

  const rule = fresh();
  const ruleMembership = memory.ensure(theory, rule);
  const sharedStartClaim = memory.ensure(sharedStart, sharedStart);
  const endClaim1 = memory.ensure(end1, end1);
  const endClaim2 = memory.ensure(end2, end2);
  assert(endClaim1 !== endClaim2, "end claims must differ");

  const attachDecomposition = (
    roles: DecomposeEqualityRoles,
    equality: EqualityReplayEvidence,
    relation: LinkHandle,
    endClaim: LinkHandle,
  ): void => {
    for (const [role, value] of [
      [roles.premiseEqualityAct, equality.act],
      [roles.theory, theory],
      [roles.rule, rule],
      [roles.ruleMembership, ruleMembership],
      [roles.leftRelation, relation],
      [roles.rightRelation, relation],
      [roles.startClaim, sharedStartClaim],
      [roles.endClaim, endClaim],
      [roles.beforeContext, context],
      [roles.afterContext, context],
    ] as const) {
      defineActField(memory, proofAct, role, value);
    }
  };

  attachDecomposition(roles1, equality1, relation1, endClaim1);
  attachDecomposition(roles2, equality2, relation2, endClaim2);

  const evidence1: DecomposeEqualityEvidence = Object.freeze({
    premise: equality1,
    act: proofAct,
    roles: roles1,
    interpreter: proofInterpreter,
    roleDictionary: proofDictionary,
  });
  const evidence2: DecomposeEqualityEvidence = Object.freeze({
    premise: equality2,
    act: proofAct,
    roles: roles2,
    interpreter: proofInterpreter,
    roleDictionary: proofDictionary,
  });

  // The proof occurrence itself is exactly identical for both host projections.
  const occurrence1 = memory.ensure(sharedStartClaim, proofAct);
  const occurrence2 = memory.ensure(sharedStartClaim, proofAct);
  same(occurrence1, occurrence2, "same Claim->Act must have one canonical identity");

  const beforeFirst = memory.linkCount;
  const first = replayDecomposeEqualRelations(memory, evidence1);
  same(memory.linkCount, beforeFirst, "first decomposition replay must be read-only");
  same(first[0], sharedStartClaim, "first projection start claim");
  same(first[1], endClaim1, "first projection end claim");

  const beforeSecond = memory.linkCount;
  const second = replayDecomposeEqualRelations(memory, evidence2);
  same(memory.linkCount, beforeSecond, "second decomposition replay must be read-only");
  same(second[0], sharedStartClaim, "second projection start claim");
  same(second[1], endClaim2, "second projection end claim");

  assert(first[1] !== second[1], "host projections must select distinct valid proof meanings");

  // No MTS Link changed between the two replays. The exact same occurrence,
  // Theory, Rule, Act and primary Claim admits two valid meanings solely because
  // DecomposeEqualityRoles + premise are supplied by the host projection.
  const EXISTING_DECOMPOSITION_ACT_NOT_SELF_DESCRIBING_AS_PROOF_ANET = true;
  const ROOTED_PROOF_ANET_CAN_SAFELY_DISPATCH_THIS_ACT_WITHOUT_MORE_MTS_EVIDENCE = false;
  const PRODUCTION_DELTA_AUTHORIZED_BY_THIS_TEST = false;

  assert(EXISTING_DECOMPOSITION_ACT_NOT_SELF_DESCRIBING_AS_PROOF_ANET, "classification");
  assert(
    !ROOTED_PROOF_ANET_CAN_SAFELY_DISPATCH_THIS_ACT_WITHOUT_MORE_MTS_EVIDENCE,
    "same MTS occurrence cannot delegate meaning to host role projection",
  );
  assert(!PRODUCTION_DELTA_AUTHORIZED_BY_THIS_TEST, "research slice remains test-only");

  console.log("ONE_PROOF_ANET application carrier = EXISTING_TOPOLOGY_INSUFFICIENT");
  console.log("decomposition Act self-description = GAP");
  console.log("production delta = NOT AUTHORIZED");
}

main();
