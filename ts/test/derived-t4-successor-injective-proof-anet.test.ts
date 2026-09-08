import { materializeExactSequence, readExactSequence } from "../src/exact-sequence.js";
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
  replayStructuralHeterogeneousDerivedDerivationSchema,
  type StructuralHeterogeneousDerivedDerivationEvidence,
} from "../src/derived-derivation-heterogeneous.js";
import { materializeHeterogeneousDerivedOpenRootedExpansion } from "../src/derived-derivation-heterogeneous-expansion.js";
import { replayStructuralHeterogeneousDerivedOpenRootedInstance } from "../src/derived-derivation-heterogeneous-instance.js";
import { replayStructuralHeterogeneousDerivedClosedRootedInstance } from "../src/derived-derivation-heterogeneous-discharge.js";
import { materializeHeterogeneousDerivedClosedRootedDischarge } from "../src/derived-derivation-heterogeneous-discharge-materialize.js";
import { replayStructuralRootedProofAset } from "../src/rooted-proof-aset.js";
import { replayRecursiveLinkIdentityProofAset } from "../src/recursive-link-identity-proof.js";
import { replayProofSubAnetProjection } from "../src/proof-subanet-projection.js";
import { exportPortableStructuralTheory } from "../src/portable-theory.js";
import { computePortableStructuralTheoryRevision } from "../src/portable-theory-digest.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

function identityProof(
  memory: Memory,
  left: LinkHandle,
  right: LinkHandle,
  children: readonly LinkHandle[],
): LinkHandle {
  return memory.ensure(
    memory.ensure(left, right),
    materializeExactSequence(memory, children),
  );
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

function genericNode(
  memory: Memory,
  claim: LinkHandle,
  localDR: LinkHandle,
  mu: LinkHandle,
  dependencies: readonly LinkHandle[],
): LinkHandle {
  return memory.ensure(
    claim,
    memory.ensure(
      localDR,
      memory.ensure(mu, materializeExactSequence(memory, dependencies)),
    ),
  );
}

async function main(): Promise<void> {
  const memory = new Memory();
  const { R, O, C, L, U } = ensureRootBasis(memory);
  const theory = memory.ensure(C, U);

  // ---------------------------------------------------------------------------
  // F1. Recursive identity already contains the exact ordered-start proof Anet.
  // This first control is arbitrary and does not use the Nat successor pole L.
  // ---------------------------------------------------------------------------
  const rootProof = identityProof(memory, R, R, []);
  const oProof = identityProof(memory, O, O, [rootProof]);
  const cProof = identityProof(memory, C, C, [rootProof]);
  const lProof = identityProof(memory, L, L, [oProof, cProof]);
  const uProof = identityProof(memory, U, U, [cProof, oProof]);

  const a = memory.ensure(O, U);
  const aProof = identityProof(memory, a, a, [oProof, uProof]);
  const startClaim = memory.ensure(a, a);
  same(memory.poles(aProof).start, startClaim, "projected start proof exact Claim");

  const arbitraryRelation = memory.ensure(a, U);
  const arbitraryRelationProof = identityProof(
    memory,
    arbitraryRelation,
    arbitraryRelation,
    [aProof, uProof],
  );
  const arbitraryChildren = readExactSequence(
    memory,
    memory.poles(arbitraryRelationProof).end,
  ).values;
  same(arbitraryChildren[0], aProof, "arbitrary ordinary relation start proof is existing child[0]");
  replayRecursiveLinkIdentityProofAset(memory, arbitraryRelationProof);
  replayRecursiveLinkIdentityProofAset(memory, aProof);

  // Accepted K1e must remain genuinely generic: replay the arbitrary non-Nat
  // relation through an unadmitted one-premise ProjectionSchema and recover the
  // exact existing start identity ProofOccurrence from the validated closure.
  const genericStartRole = memory.ensure(U, R);
  const genericEndRole = memory.ensure(R, U);
  const genericProjectionDictionary = defineStructuralRoleDictionary(
    memory,
    [genericStartRole, genericEndRole],
  );
  const genericRelationTemplate = memory.ensure(genericStartRole, genericEndRole);
  const genericPremiseTemplate = memory.ensure(genericRelationTemplate, genericRelationTemplate);
  const genericConclusionTemplate = memory.ensure(genericStartRole, genericStartRole);
  const genericProjectionRule = defineStructuralRule(
    memory,
    genericProjectionDictionary,
    genericConclusionTemplate,
  );
  const genericProjectionDR = defineStructuralDerivationRule(
    memory,
    genericProjectionRule,
    [genericPremiseTemplate],
  );
  assert(
    memory.find(theory, genericProjectionRule) === undefined,
    "generic projection Rule remains unadmitted",
  );
  assert(
    memory.find(theory, genericProjectionDR) === undefined,
    "generic projection DR remains unadmitted",
  );

  const genericProjectionBefore = memory.linkCount;
  const genericProjection = replayProofSubAnetProjection(memory, {
    theory,
    schemaDerivationRule: genericProjectionDR,
    premiseProofOccurrence: arbitraryRelationProof,
  });
  same(genericProjection.projectedOccurrence, aProof, "generic non-Nat projection exact occurrence");
  same(genericProjection.projectedClaim, startClaim, "generic non-Nat projection exact Claim");
  same(memory.linkCount, genericProjectionBefore, "generic non-Nat projection replay read-only");

  // T4-shaped concrete control. Because Memory is canonical, a true concrete
  // equality (A->L)=(B->L) is represented by one exact successor Link. Its
  // recursive identity proof already carries the exact start-pole proof.
  const successor = memory.ensure(a, L);
  const successorProof = identityProof(memory, successor, successor, [aProof, lProof]);
  const successorClaim = memory.poles(successorProof).start;
  const successorChildren = readExactSequence(
    memory,
    memory.poles(successorProof).end,
  ).values;
  same(successorChildren[0], aProof, "T4-shaped identity exposes exact start proof");
  same(successorChildren[1], lProof, "T4-shaped identity exposes exact end proof");

  const successorBefore = memory.linkCount;
  const successorReplay = replayRecursiveLinkIdentityProofAset(memory, successorProof);
  same(successorReplay.left, successor, "T4-shaped identity left");
  same(successorReplay.right, successor, "T4-shaped identity right");
  same(memory.linkCount, successorBefore, "T4-shaped identity replay read-only");
  replayRecursiveLinkIdentityProofAset(memory, aProof);

  // ---------------------------------------------------------------------------
  // F2. K1d3/K1d4 are not blockers. Use one arbitrary admitted structural step
  // P->Q. The projected identity ProofOccurrence discharges only the concrete P
  // assumption; it is never interpreted as this primitive step.
  // ---------------------------------------------------------------------------
  const P = memory.ensure(L, U);
  const Q = memory.ensure(U, R);
  const projectionDictionary = defineStructuralRoleDictionary(memory, [P, Q]);
  const projectionRule = defineStructuralRule(memory, projectionDictionary, Q);
  const projectionDR = defineStructuralDerivationRule(memory, projectionRule, [P]);
  const projectionIdentity = memory.ensure(projectionDR, theory);

  const localP = memory.ensure(O, L);
  const localQ = memory.ensure(U, O);
  const projectionLocalDictionary = defineStructuralRoleDictionary(memory, [localP, localQ]);
  const projectionLocalRule = defineStructuralRule(memory, projectionLocalDictionary, localQ);
  const projectionLocalDR = defineStructuralDerivationRule(
    memory,
    projectionLocalRule,
    [localP],
  );
  admitStructuralRule(memory, theory, projectionLocalRule);
  admitStructuralDerivationRule(memory, theory, projectionLocalDR);
  const projectionMu = morphism(
    memory,
    theory,
    projectionLocalDictionary,
    projectionDictionary,
    [[localP, P], [localQ, Q]],
  );

  const projectionAssumption = memory.ensure(P, projectionIdentity);
  const projectionTarget = genericNode(
    memory,
    Q,
    projectionLocalDR,
    projectionMu,
    [projectionAssumption],
  );
  const projectionGeneric: StructuralHeterogeneousDerivedDerivationEvidence = Object.freeze({
    identity: projectionIdentity,
    targetOccurrence: projectionTarget,
  });

  const projectionReplay = replayStructuralHeterogeneousDerivedDerivationSchema(
    memory,
    projectionGeneric,
  );
  same(projectionReplay.occurrenceCount, 1, "projection generic one structural node");
  same(projectionReplay.declaredAssumptionCount, 1, "projection generic one assumption");
  same(projectionReplay.usedAssumptionCount, 1, "projection generic assumption reachable");

  const projectionValue = memory.ensure(U, C);
  const openRoot = materializeHeterogeneousDerivedOpenRootedExpansion(
    memory,
    projectionGeneric,
    [{ role: P, value: startClaim }, { role: Q, value: projectionValue }],
  ).concreteRoot;
  const openReplay = replayStructuralHeterogeneousDerivedOpenRootedInstance(memory, {
    generic: projectionGeneric,
    concreteRoot: openRoot,
  });
  same(
    memory.poles(openReplay.concreteTargetOccurrence).start,
    projectionValue,
    "projection OPEN exact conclusion",
  );

  const openIdentity = memory.poles(openRoot).start;
  const openAssumption = memory.ensure(startClaim, openIdentity);
  const closedRoot = materializeHeterogeneousDerivedClosedRootedDischarge(
    memory,
    { generic: projectionGeneric, concreteRoot: openRoot },
    [{ assumptionOccurrence: openAssumption, proofOccurrence: aProof }],
  ).closedRoot;

  const closedK1 = replayStructuralRootedProofAset(memory, closedRoot);
  same(closedK1.conclusion, projectionValue, "projection CLOSED exact conclusion");
  same(closedK1.declaredAssumptionCount, 0, "projection CLOSED declared assumptions");
  same(closedK1.usedAssumptionCount, 0, "projection CLOSED used assumptions");

  const closedBinding = replayStructuralHeterogeneousDerivedClosedRootedInstance(memory, {
    open: { generic: projectionGeneric, concreteRoot: openRoot },
    closedRoot,
  });
  same(closedBinding.dischargedAssumptionCount, 1, "projected proof discharges one OPEN assumption");
  same(closedBinding.pairedStructuralOccurrenceCount, 1, "one arbitrary structural node survives discharge");

  // ---------------------------------------------------------------------------
  // F3. Exact generic T4 rerun after accepted K1e.
  //
  // ProjectionSchema is ordinary MTS structural schema data and remains
  // unadmitted. The trusted K1e mechanism must infer A/B solely from the exact
  // premise Claim Eq(A->L,B->L), traverse only the K1-validated premise closure,
  // and select the unique existing Eq(A,B) ProofOccurrence.
  // ---------------------------------------------------------------------------
  const A = memory.ensure(L, R);
  const B = memory.ensure(R, L);
  const t4Dictionary = defineStructuralRoleDictionary(memory, [A, B]);
  const t4Premise = memory.ensure(memory.ensure(A, L), memory.ensure(B, L));
  const t4Conclusion = memory.ensure(A, B);
  const t4ProjectionRule = defineStructuralRule(memory, t4Dictionary, t4Conclusion);
  const t4ProjectionDR = defineStructuralDerivationRule(
    memory,
    t4ProjectionRule,
    [t4Premise],
  );

  assert(memory.find(theory, t4ProjectionRule) === undefined, "T4 projection Rule remains unadmitted");
  assert(memory.find(theory, t4ProjectionDR) === undefined, "T4 projection DR remains unadmitted");

  const revisionBefore = await computePortableStructuralTheoryRevision(
    exportPortableStructuralTheory(memory, theory),
  );
  const t4Before = memory.linkCount;
  const t4Replay = replayProofSubAnetProjection(memory, {
    theory,
    schemaDerivationRule: t4ProjectionDR,
    premiseProofOccurrence: successorProof,
  });

  same(t4Replay.premiseClaim, successorClaim, "T4 exact premise identity Claim");
  same(t4Replay.projectedOccurrence, aProof, "T4 exact existing projected ProofOccurrence");
  same(t4Replay.projectedClaim, startClaim, "T4 exact projected Eq(A,B) Claim");
  same(t4Replay.bindings.length, 2, "T4 A/B bindings inferred only from premise Claim");
  same(memory.linkCount, t4Before, "T4 projection replay read-only");

  assert(memory.find(theory, t4ProjectionRule) === undefined, "T4 rerun did not admit projection Rule");
  assert(memory.find(theory, t4ProjectionDR) === undefined, "T4 rerun did not admit projection DR");

  const revisionAfter = await computePortableStructuralTheoryRevision(
    exportPortableStructuralTheory(memory, theory),
  );
  same(revisionAfter.scheme, revisionBefore.scheme, "T4 Theory revision scheme unchanged");
  same(revisionAfter.value, revisionBefore.value, "T4 exact Theory revision unchanged");

  console.log("T4_SUCCESSOR_INJECTIVITY_STRUCTURE = SUPPORTED");
  console.log("IDENTITY_POLE_SUBANET_PROJECTION = SUPPORTED");
  console.log("K1D4_PROJECTED_PROOF_ASSUMPTION_DISCHARGE = SUPPORTED");
  console.log("K1E_GENERIC_PROOF_SUBANET_PROJECTION = SUPPORTED");
  console.log("T4_PROOF_ANET_RERUN = SUPPORTED");
  console.log("T4_REUSE = NOT TESTED");
  console.log("T4_PRIMITIVE_PROMOTION = NOT USED");
  console.log("accepted semantic delta = NONE");
}

void main();
