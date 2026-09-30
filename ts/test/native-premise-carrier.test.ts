import { materializeExactSequence } from "../src/exact-sequence.js";
import { Memory, ensureRootBasis, type LinkHandle } from "../src/memory.js";
import {
  admitStructuralRule,
  defineStructuralRoleDictionary,
  defineStructuralRule,
} from "../src/structural-rule.js";
import {
  admitStructuralDerivationRule,
  defineStructuralDerivationRule,
} from "../src/derivation.js";
import {
  type StructuralHeterogeneousDerivedDerivationEvidence,
} from "../src/derived-derivation-heterogeneous.js";
import { materializeHeterogeneousDerivedOpenRootedExpansion } from "../src/derived-derivation-heterogeneous-expansion.js";
import { replayStructuralHeterogeneousDerivedOpenRootedInstance } from "../src/derived-derivation-heterogeneous-instance.js";
import {
  replayStructuralHeterogeneousDerivedClosedRootedInstance,
} from "../src/derived-derivation-heterogeneous-discharge.js";
import {
  StructuralHeterogeneousDerivedClosedRootedDischargeMaterializeError,
  materializeHeterogeneousDerivedClosedRootedDischarge,
  type StructuralAssumptionProofCoordinate,
} from "../src/derived-derivation-heterogeneous-discharge-materialize.js";
import {
  StructuralRootedProofAsetReplayError,
  replayStructuralRootedProofAset,
} from "../src/rooted-proof-aset.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

function expectMaterializeError(code: string, effect: () => unknown): void {
  try {
    effect();
  } catch (error) {
    assert(
      error instanceof StructuralHeterogeneousDerivedClosedRootedDischargeMaterializeError,
      `${code}: wrong materialize error type`,
    );
    same(error.code, code, `${code}: wrong materialize error code`);
    return;
  }
  throw new Error(`${code}: expected materialize error`);
}

function morphism(
  memory: Memory,
  theory: LinkHandle,
  sourceDictionary: LinkHandle,
  targetDictionary: LinkHandle,
  bindings: readonly (readonly [LinkHandle, LinkHandle])[],
): LinkHandle {
  return materializeExactSequence(memory, [
    theory,
    sourceDictionary,
    targetDictionary,
    materializeExactSequence(
      memory,
      bindings.map(([sourceRole, targetRole]) => memory.ensure(sourceRole, targetRole)),
    ),
  ]);
}

function primitivePremiseProof(
  memory: Memory,
  theory: LinkHandle,
  claim: LinkHandle,
): LinkHandle {
  const dictionary = defineStructuralRoleDictionary(memory, []);
  const rule = defineStructuralRule(memory, dictionary, claim);
  const derivationRule = defineStructuralDerivationRule(memory, rule, []);
  admitStructuralRule(memory, theory, rule);
  admitStructuralDerivationRule(memory, theory, derivationRule);
  return memory.ensure(
    claim,
    memory.ensure(derivationRule, materializeExactSequence(memory, [])),
  );
}

function main(): void {
  const memory = new Memory();
  const { R, O, C, L, U } = ensureRootBasis(memory);
  const theory = memory.ensure(C, U);

  // Generic theorem shape:
  //   P, Q |- T
  // with one ordinary primitive node and two explicit OPEN assumption leaves.
  const P = memory.ensure(L, U);
  const Q = memory.ensure(U, R);
  const T = memory.ensure(C, L);

  const globalDictionary = defineStructuralRoleDictionary(memory, [P, Q, T]);
  const targetRule = defineStructuralRule(memory, globalDictionary, T);
  const targetDR = defineStructuralDerivationRule(memory, targetRule, [P, Q]);
  const targetIdentity = memory.ensure(targetDR, theory);

  const localDictionary = defineStructuralRoleDictionary(memory, [P, Q, T]);
  const localRule = defineStructuralRule(memory, localDictionary, T);
  const localDR = defineStructuralDerivationRule(memory, localRule, [P, Q]);
  admitStructuralRule(memory, theory, localRule);
  admitStructuralDerivationRule(memory, theory, localDR);

  const mu = morphism(
    memory,
    theory,
    localDictionary,
    globalDictionary,
    [[P, P], [Q, Q], [T, T]],
  );

  const genericP = memory.ensure(P, targetIdentity);
  const genericQ = memory.ensure(Q, targetIdentity);
  const genericTarget = memory.ensure(
    T,
    memory.ensure(
      localDR,
      memory.ensure(mu, materializeExactSequence(memory, [genericP, genericQ])),
    ),
  );
  const generic: StructuralHeterogeneousDerivedDerivationEvidence = Object.freeze({
    identity: targetIdentity,
    targetOccurrence: genericTarget,
  });

  const pValue = memory.ensure(O, L);
  const qValue = memory.ensure(C, O);
  const tValue = memory.ensure(U, C);

  const openRoot = materializeHeterogeneousDerivedOpenRootedExpansion(
    memory,
    generic,
    [
      { role: P, value: pValue },
      { role: Q, value: qValue },
      { role: T, value: tValue },
    ],
  ).concreteRoot;

  const openReplay = replayStructuralHeterogeneousDerivedOpenRootedInstance(memory, {
    generic,
    concreteRoot: openRoot,
  });
  same(openReplay.theory, theory, "OPEN exact Theory");

  const openIdentity = memory.poles(openRoot).start;
  const pAssumption = memory.ensure(pValue, openIdentity);
  const qAssumption = memory.ensure(qValue, openIdentity);

  const pProof = primitivePremiseProof(memory, theory, pValue);
  const qProof = primitivePremiseProof(memory, theory, qValue);

  const cleanCoordinates: readonly StructuralAssumptionProofCoordinate[] = [
    { assumptionOccurrence: pAssumption, proofOccurrence: pProof },
    { assumptionOccurrence: qAssumption, proofOccurrence: qProof },
  ];

  const closedRoot = materializeHeterogeneousDerivedClosedRootedDischarge(
    memory,
    { generic, concreteRoot: openRoot },
    cleanCoordinates,
  ).closedRoot;

  const closedK1 = replayStructuralRootedProofAset(memory, closedRoot);
  same(closedK1.conclusion, tValue, "CLOSED exact conclusion");
  same(closedK1.declaredAssumptionCount, 0, "CLOSED has no declared assumptions");
  same(closedK1.usedAssumptionCount, 0, "CLOSED uses no assumption leaves");

  const before = memory.linkCount;
  const discharge = replayStructuralHeterogeneousDerivedClosedRootedInstance(memory, {
    open: { generic, concreteRoot: openRoot },
    closedRoot,
  });
  same(discharge.dischargedAssumptionCount, 2, "two distinct premises discharged");
  same(discharge.conclusion, tValue, "discharge exact conclusion");
  same(memory.linkCount, before, "trusted discharge replay is read-only");

  // Missing one declared/reachable premise proof fails closed.
  expectMaterializeError("missing-assumption-proof", () =>
    materializeHeterogeneousDerivedClosedRootedDischarge(
      memory,
      { generic, concreteRoot: openRoot },
      [{ assumptionOccurrence: pAssumption, proofOccurrence: pProof }],
    ),
  );

  // Wrong-Claim proof is rejected before construction can bless it.
  const wrongClaim = memory.ensure(R, U);
  const wrongProof = primitivePremiseProof(memory, theory, wrongClaim);
  expectMaterializeError("proof-claim-mismatch", () =>
    materializeHeterogeneousDerivedClosedRootedDischarge(
      memory,
      { generic, concreteRoot: openRoot },
      [
        { assumptionOccurrence: pAssumption, proofOccurrence: wrongProof },
        { assumptionOccurrence: qAssumption, proofOccurrence: qProof },
      ],
    ),
  );

  expectMaterializeError("duplicate-assumption-proof", () =>
    materializeHeterogeneousDerivedClosedRootedDischarge(
      memory,
      { generic, concreteRoot: openRoot },
      [
        { assumptionOccurrence: pAssumption, proofOccurrence: pProof },
        { assumptionOccurrence: pAssumption, proofOccurrence: pProof },
        { assumptionOccurrence: qAssumption, proofOccurrence: qProof },
      ],
    ),
  );

  expectMaterializeError("unknown-assumption-occurrence", () =>
    materializeHeterogeneousDerivedClosedRootedDischarge(
      memory,
      { generic, concreteRoot: openRoot },
      [
        { assumptionOccurrence: memory.root, proofOccurrence: pProof },
        { assumptionOccurrence: pAssumption, proofOccurrence: pProof },
        { assumptionOccurrence: qAssumption, proofOccurrence: qProof },
      ],
    ),
  );

  // Host labels are transport noise: adding theoremId metadata cannot change the
  // canonical CLOSED proof or grant authority.
  const taggedP = {
    assumptionOccurrence: pAssumption,
    proofOccurrence: pProof,
    theoremId: "FND-07",
  };
  const taggedClosed = materializeHeterogeneousDerivedClosedRootedDischarge(
    memory,
    { generic, concreteRoot: openRoot },
    [
      taggedP,
      { assumptionOccurrence: qAssumption, proofOccurrence: qProof },
    ],
  ).closedRoot;
  same(taggedClosed, closedRoot, "host theoremId metadata grants zero authority");

  // A same-Claim proof admitted only in a foreign Theory passes construction
  // claim matching but must fail the independent CLOSED K1 replay under Theory T.
  const foreignTheory = memory.ensure(U, C);
  assert(foreignTheory !== theory, "foreign premise Theory is structurally distinct");
  const foreignRole = memory.ensure(pValue, foreignTheory);
  const foreignDictionary = defineStructuralRoleDictionary(memory, [foreignRole]);
  const foreignRule = defineStructuralRule(memory, foreignDictionary, pValue);
  const foreignDR = defineStructuralDerivationRule(memory, foreignRule, []);
  admitStructuralRule(memory, foreignTheory, foreignRule);
  admitStructuralDerivationRule(memory, foreignTheory, foreignDR);
  assert(memory.find(theory, foreignRule) === undefined, "foreign Rule is not admitted in selected Theory");
  assert(memory.find(theory, foreignDR) === undefined, "foreign DR is not admitted in selected Theory");
  const foreignPProof = memory.ensure(
    pValue,
    memory.ensure(foreignDR, materializeExactSequence(memory, [])),
  );
  assert(foreignPProof !== pProof, "foreign same-Claim proof has distinct Support");
  const foreignClosed = materializeHeterogeneousDerivedClosedRootedDischarge(
    memory,
    { generic, concreteRoot: openRoot },
    [
      { assumptionOccurrence: pAssumption, proofOccurrence: foreignPProof },
      { assumptionOccurrence: qAssumption, proofOccurrence: qProof },
    ],
  ).closedRoot;

  let foreignRejected = false;
  try {
    replayStructuralRootedProofAset(memory, foreignClosed);
  } catch (error) {
    assert(
      error instanceof StructuralRootedProofAsetReplayError,
      "foreign-Theory premise proof rejected by CLOSED K1",
    );
    foreignRejected = true;
  }
  assert(foreignRejected, "foreign-Theory premise proof must fail CLOSED K1");

  console.log("EXISTING_K1D4_PREMISE_CARRIER_SUFFICIENT = SUPPORTED");
  console.log("TWO_DISTINCT_NATIVE_PREMISES = SUPPORTED");
  console.log("MISSING_WRONG_DUPLICATE_PREMISE_EVIDENCE = REJECTED");
  console.log("FOREIGN_THEORY_PREMISE_AUTHORITY = REJECTED");
  console.log("HOST_THEOREM_METADATA_AUTHORITY = NONE");
  console.log("accepted semantic delta = NONE");
}

main();
