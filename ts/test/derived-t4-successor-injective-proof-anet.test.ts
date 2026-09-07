import { materializeExactSequence } from "../src/exact-sequence.js";
import { defineStructuralDerivationRule } from "../src/derivation.js";
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
import {
  StructuralRootedProofAsetReplayError,
  replayStructuralRootedProofAset,
} from "../src/rooted-proof-aset.js";
import { defineContext } from "../src/state.js";
import { defineActField, defineActHeader } from "../src/structural-readers.js";
import {
  admitStructuralRule,
  defineStructuralRoleDictionary,
  defineStructuralRule,
} from "../src/structural-rule.js";

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

  const a = fresh();
  const successor = memory.ensure(a, L);
  const context = defineContext(memory, fresh(), fresh());

  // Exact Link identity is the T4 premise instance. No representative binding
  // is added: equality is true because both sides are literally one Link.
  const eqInterpreter = fresh();
  const eqDictionary = fresh();
  const eqRoles = equalityRoles(fresh);
  const eqAct = defineActHeader(memory, eqInterpreter, eqDictionary, context);
  for (const [role, value] of [
    [eqRoles.context, context],
    [eqRoles.left, successor],
    [eqRoles.right, successor],
    [eqRoles.leftRepresentative, successor],
    [eqRoles.rightRepresentative, successor],
  ] as const) {
    defineActField(memory, eqAct, role, value);
  }
  const equality: EqualityReplayEvidence = {
    act: eqAct,
    roles: eqRoles,
    interpreter: eqInterpreter,
    roleDictionary: eqDictionary,
  };

  // Existing generic production rule: equal complete relations decompose to
  // equality claims for their ordered start/end poles.
  const decomposeRule = memory.ensure(fresh(), fresh());
  const decomposeMembership = memory.ensure(theory, decomposeRule);
  const startClaim = memory.ensure(a, a);
  const endClaim = memory.ensure(L, L);
  const proofInterpreter = fresh();
  const proofDictionary = fresh();
  const proofRoles = decompositionRoles(fresh);
  const proofAct = defineActHeader(memory, proofInterpreter, proofDictionary, context);
  for (const [role, value] of [
    [proofRoles.premiseEqualityAct, eqAct],
    [proofRoles.theory, theory],
    [proofRoles.rule, decomposeRule],
    [proofRoles.ruleMembership, decomposeMembership],
    [proofRoles.leftRelation, successor],
    [proofRoles.rightRelation, successor],
    [proofRoles.startClaim, startClaim],
    [proofRoles.endClaim, endClaim],
    [proofRoles.beforeContext, context],
    [proofRoles.afterContext, context],
  ] as const) {
    defineActField(memory, proofAct, role, value);
  }
  const decomposition: DecomposeEqualityEvidence = {
    premise: equality,
    act: proofAct,
    roles: proofRoles,
    interpreter: proofInterpreter,
    roleDictionary: proofDictionary,
  };

  const beforeDecomposition = memory.linkCount;
  const decomposed = replayDecomposeEqualRelations(memory, decomposition);
  same(decomposed[0], startClaim, "existing decomposition yields exact start claim");
  same(decomposed[1], endClaim, "existing decomposition yields exact end claim");
  same(memory.linkCount, beforeDecomposition, "existing decomposition is read-only");

  // Generic T4 target schema. Its DR is deliberately not admitted: the challenge
  // is to carry the existing generic decomposition evidence, not promote T4.
  const aRole = fresh();
  const bRole = fresh();
  const targetDictionary = defineStructuralRoleDictionary(memory, [aRole, bRole]);
  const premiseTemplate = memory.ensure(
    memory.ensure(aRole, L),
    memory.ensure(bRole, L),
  );
  const conclusionTemplate = memory.ensure(aRole, bRole);
  const targetRule = defineStructuralRule(memory, targetDictionary, conclusionTemplate);
  admitStructuralRule(memory, theory, targetRule);
  const targetDerivationRule = defineStructuralDerivationRule(
    memory,
    targetRule,
    [premiseTemplate],
  );
  assert(
    memory.find(theory, targetDerivationRule) === undefined,
    "T4 target DR must remain unadmitted",
  );

  const targetIdentity = memory.ensure(targetDerivationRule, theory);
  const premiseClaim = memory.ensure(successor, successor);
  const premiseOccurrence = memory.ensure(premiseClaim, targetIdentity);

  // Canonical rooted applications require their first pole to be an admitted
  // StructuralDerivationRule. Reuse the already-admitted decomposition rule as
  // the step identity rather than inventing/admitting a second T4 primitive.
  const application = memory.ensure(
    decomposeRule,
    materializeExactSequence(memory, [premiseOccurrence]),
  );
  const targetOccurrence = memory.ensure(startClaim, application);
  const root = memory.ensure(targetIdentity, targetOccurrence);

  try {
    const replay = replayStructuralRootedProofAset(memory, root);
    same(replay.conclusion, startClaim, "T4 rooted conclusion");
    same(memory.find(theory, targetDerivationRule), undefined, "T4 DR remains unadmitted");
  } catch (error) {
    assert(
      error instanceof StructuralRootedProofAsetReplayError,
      "T4 rooted replay must fail at the trusted rooted surface",
    );
    same(error.code, "invalid-application", "first rooted composition boundary");
    throw new Error(
      "T4_PROOF_ANET_GAP: existing equality-decomposition evidence cannot inhabit a rooted StructuralDerivationRule application",
    );
  }
}

main();
