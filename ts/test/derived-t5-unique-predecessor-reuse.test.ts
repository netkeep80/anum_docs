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
  readStructuralDerivationRule,
} from "../src/derivation.js";
import {
  replayStructuralHeterogeneousDerivedDerivationSchema,
  type StructuralHeterogeneousDerivedDerivationEvidence,
} from "../src/derived-derivation-heterogeneous.js";
import { materializeHeterogeneousDerivedOpenRootedExpansion } from "../src/derived-derivation-heterogeneous-expansion.js";
import { replayStructuralHeterogeneousDerivedOpenRootedInstance } from "../src/derived-derivation-heterogeneous-instance.js";
import { replayStructuralHeterogeneousDerivedClosedRootedInstance } from "../src/derived-derivation-heterogeneous-discharge.js";
import { materializeHeterogeneousDerivedClosedRootedDischarge } from "../src/derived-derivation-heterogeneous-discharge-materialize.js";
import {
  replayClosedProofOccurrence,
  replayStructuralRootedProofAset,
} from "../src/rooted-proof-aset.js";
import { replayProofSubAnetProjection } from "../src/proof-subanet-projection.js";

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

function dependencyOccurrences(memory: Memory, occurrence: LinkHandle): readonly LinkHandle[] {
  const support = memory.poles(occurrence).end;
  const dependencySequence = memory.poles(support).end;
  return readExactSequence(memory, dependencySequence).values;
}

function main(): void {
  const memory = new Memory();
  const { R, O, C, L, U } = ensureRootBasis(memory);
  const theory = memory.ensure(C, U);
  let roleCursor = memory.ensure(L, R);
  const freshRole = (): LinkHandle => (roleCursor = memory.ensure(roleCursor, R));

  // ---------------------------------------------------------------------------
  // F1. Build exact K1-valid identity proof support for one true T5 instance.
  // Canonical truth of both predecessor premises forces A=B=a and N=a->L.
  // ---------------------------------------------------------------------------
  const rootProof = identityProof(memory, R, R, []);
  const oProof = identityProof(memory, O, O, [rootProof]);
  const cProof = identityProof(memory, C, C, [rootProof]);
  const lProof = identityProof(memory, L, L, [oProof, cProof]);
  const uProof = identityProof(memory, U, U, [cProof, oProof]);
  const a = memory.ensure(O, U);
  const aProof = identityProof(memory, a, a, [oProof, uProof]);
  const aClaim = memory.ensure(a, a);
  const successor = memory.ensure(a, L);
  const successorProof = identityProof(memory, successor, successor, [aProof, lProof]);
  const successorClaim = memory.ensure(successor, successor);

  replayClosedProofOccurrence(memory, theory, successorProof);
  replayClosedProofOccurrence(memory, theory, aProof);

  // ---------------------------------------------------------------------------
  // F2. Generic two-slot packaging consumes two distinct symbolic assumptions.
  // The package law is completely relation-neutral: Pair(P1,P2) <- P1,P2.
  // ---------------------------------------------------------------------------
  const P1 = freshRole();
  const P2 = freshRole();
  const packageDictionary = defineStructuralRoleDictionary(memory, [P1, P2]);
  const packageConclusion = memory.ensure(P1, P2);
  const packageRule = defineStructuralRule(memory, packageDictionary, packageConclusion);
  const packageDR = defineStructuralDerivationRule(memory, packageRule, [P1, P2]);
  const packageIdentity = memory.ensure(packageDR, theory);
  assert(memory.find(theory, packageRule) === undefined, "generic package target Rule unadmitted");
  assert(memory.find(theory, packageDR) === undefined, "generic package target DR unadmitted");

  const localP1 = freshRole();
  const localP2 = freshRole();
  const localDictionary = defineStructuralRoleDictionary(memory, [localP1, localP2]);
  const localConclusion = memory.ensure(localP1, localP2);
  const localRule = defineStructuralRule(memory, localDictionary, localConclusion);
  const localDR = defineStructuralDerivationRule(memory, localRule, [localP1, localP2]);
  admitStructuralRule(memory, theory, localRule);
  admitStructuralDerivationRule(memory, theory, localDR);
  const packageMu = morphism(
    memory,
    theory,
    localDictionary,
    packageDictionary,
    [[localP1, P1], [localP2, P2]],
  );

  const genericAssumption1 = memory.ensure(P1, packageIdentity);
  const genericAssumption2 = memory.ensure(P2, packageIdentity);
  const packageTarget = genericNode(
    memory,
    packageConclusion,
    localDR,
    packageMu,
    [genericAssumption1, genericAssumption2],
  );
  const packageGeneric: StructuralHeterogeneousDerivedDerivationEvidence = Object.freeze({
    identity: packageIdentity,
    targetOccurrence: packageTarget,
  });
  const packageGenericReplay = replayStructuralHeterogeneousDerivedDerivationSchema(
    memory,
    packageGeneric,
  );
  same(packageGenericReplay.declaredAssumptionCount, 2, "symbolic package declares two slots");
  same(packageGenericReplay.usedAssumptionCount, 2, "symbolic package consumes two slots");

  // A true concrete T5 instance makes both predecessor premise Claims the same
  // canonical successor identity Claim. That is contraction, not yet loss of
  // slot provenance: the target ExactSequence still has two positions.
  const openPackageRoot = materializeHeterogeneousDerivedOpenRootedExpansion(
    memory,
    packageGeneric,
    [{ role: P1, value: successorClaim }, { role: P2, value: successorClaim }],
  ).concreteRoot;
  const openPackage = replayStructuralHeterogeneousDerivedOpenRootedInstance(memory, {
    generic: packageGeneric,
    concreteRoot: openPackageRoot,
  });
  same(openPackage.pairedOccurrenceCount, 3, "target plus two symbolic assumptions remain paired");

  const openPackageDeps = dependencyOccurrences(memory, openPackage.concreteTargetOccurrence);
  same(openPackageDeps.length, 2, "concrete OPEN target retains two dependency slots");
  const sharedAssumption = openPackageDeps[0];
  assert(sharedAssumption !== undefined, "shared concrete assumption exists");
  same(openPackageDeps[1], sharedAssumption, "both concrete slots share one canonical assumption occurrence");
  same(memory.poles(sharedAssumption).start, successorClaim, "shared assumption exact Claim");

  const openPackageK1 = replayStructuralRootedProofAset(memory, openPackageRoot);
  same(openPackageK1.declaredAssumptionCount, 1, "unique-Claim diagnostic contracts to one");
  same(openPackageK1.usedAssumptionCount, 1, "unique-Claim used diagnostic contracts to one");

  // K1d4 must allow one independently valid proof occurrence to satisfy both
  // identical concrete dependency slots, while the generic certificate above
  // remains the authority that there were two symbolic premise positions.
  const closedPackageRoot = materializeHeterogeneousDerivedClosedRootedDischarge(
    memory,
    { generic: packageGeneric, concreteRoot: openPackageRoot },
    [{ assumptionOccurrence: sharedAssumption, proofOccurrence: successorProof }],
  ).closedRoot;
  const closedPackageK1 = replayStructuralRootedProofAset(memory, closedPackageRoot);
  same(closedPackageK1.declaredAssumptionCount, 0, "closed package has no assumptions");
  same(closedPackageK1.usedAssumptionCount, 0, "closed package uses no assumptions");

  const closedPackage = replayStructuralHeterogeneousDerivedClosedRootedInstance(memory, {
    open: { generic: packageGeneric, concreteRoot: openPackageRoot },
    closedRoot: closedPackageRoot,
  });
  same(closedPackage.dischargedAssumptionCount, 1, "one shared concrete assumption is discharged");
  same(closedPackage.pairedStructuralOccurrenceCount, 1, "package structural target survives discharge");

  const closedPackageTarget = memory.poles(closedPackageRoot).end;
  const closedPackageDeps = dependencyOccurrences(memory, closedPackageTarget);
  same(closedPackageDeps.length, 2, "CLOSED package retains two dependency slots");
  same(closedPackageDeps[0], successorProof, "first closed slot uses exact shared premise proof");
  same(closedPackageDeps[1], successorProof, "second closed slot reuses exact shared premise proof");
  replayClosedProofOccurrence(memory, theory, closedPackageTarget);

  // ---------------------------------------------------------------------------
  // F3. From the validated combined two-premise closure, project the exact T4
  // premise proof. This bridge is unadmitted schema data: it creates no proof,
  // it only selects an already K1-validated descendant of the combined proof.
  // ---------------------------------------------------------------------------
  const A = freshRole();
  const B = freshRole();
  const N = freshRole();
  const bridgeDictionary = defineStructuralRoleDictionary(memory, [A, B, N]);
  const successorA = memory.ensure(A, L);
  const successorB = memory.ensure(B, L);
  const predecessorPremiseA = memory.ensure(successorA, N);
  const predecessorPremiseB = memory.ensure(successorB, N);
  const combinedPremise = memory.ensure(predecessorPremiseA, predecessorPremiseB);
  const t4PremiseTemplate = memory.ensure(successorA, successorB);
  const bridgeRule = defineStructuralRule(memory, bridgeDictionary, t4PremiseTemplate);
  const bridgeDR = defineStructuralDerivationRule(memory, bridgeRule, [combinedPremise]);
  assert(memory.find(theory, bridgeRule) === undefined, "T5 bridge Rule remains unadmitted");
  assert(memory.find(theory, bridgeDR) === undefined, "T5 bridge DR remains unadmitted");

  const bridge = replayProofSubAnetProjection(memory, {
    theory,
    schemaDerivationRule: bridgeDR,
    premiseProofOccurrence: closedPackageTarget,
  });
  same(bridge.projectedOccurrence, successorProof, "combined closure projects exact T4 premise proof");
  same(bridge.projectedClaim, successorClaim, "combined closure projects exact T4 premise Claim");

  // ---------------------------------------------------------------------------
  // F4. Reuse the accepted T4 ProjectionSchema shape on that exact projected
  // premise proof. No T4 Rule/DR is admitted; K1e must return the existing aProof.
  // ---------------------------------------------------------------------------
  const T4A = freshRole();
  const T4B = freshRole();
  const t4Dictionary = defineStructuralRoleDictionary(memory, [T4A, T4B]);
  const t4Premise = memory.ensure(memory.ensure(T4A, L), memory.ensure(T4B, L));
  const t4Conclusion = memory.ensure(T4A, T4B);
  const t4Rule = defineStructuralRule(memory, t4Dictionary, t4Conclusion);
  const t4DR = defineStructuralDerivationRule(memory, t4Rule, [t4Premise]);
  assert(memory.find(theory, t4Rule) === undefined, "reused T4 Rule remains unadmitted");
  assert(memory.find(theory, t4DR) === undefined, "reused T4 DR remains unadmitted");

  const t4 = replayProofSubAnetProjection(memory, {
    theory,
    schemaDerivationRule: t4DR,
    premiseProofOccurrence: bridge.projectedOccurrence,
  });
  same(t4.premiseClaim, successorClaim, "reused T4 exact premise Claim");
  same(t4.projectedOccurrence, aProof, "reused T4 returns exact existing A=B ProofOccurrence");
  same(t4.projectedClaim, aClaim, "reused T4 exact A=B Claim");

  // ---------------------------------------------------------------------------
  // F5. The exact occurrence returned by T4 must be consumable by a later proof.
  // Use one unrelated generic P->Q step; K1d4 must graft exactly t4.projectedOccurrence.
  // ---------------------------------------------------------------------------
  const CP = freshRole();
  const CQ = freshRole();
  const consumerDictionary = defineStructuralRoleDictionary(memory, [CP, CQ]);
  const consumerRule = defineStructuralRule(memory, consumerDictionary, CQ);
  const consumerDR = defineStructuralDerivationRule(memory, consumerRule, [CP]);
  const consumerIdentity = memory.ensure(consumerDR, theory);

  const localCP = freshRole();
  const localCQ = freshRole();
  const consumerLocalDictionary = defineStructuralRoleDictionary(memory, [localCP, localCQ]);
  const consumerLocalRule = defineStructuralRule(memory, consumerLocalDictionary, localCQ);
  const consumerLocalDR = defineStructuralDerivationRule(
    memory,
    consumerLocalRule,
    [localCP],
  );
  admitStructuralRule(memory, theory, consumerLocalRule);
  admitStructuralDerivationRule(memory, theory, consumerLocalDR);
  const consumerMu = morphism(
    memory,
    theory,
    consumerLocalDictionary,
    consumerDictionary,
    [[localCP, CP], [localCQ, CQ]],
  );
  const consumerAssumption = memory.ensure(CP, consumerIdentity);
  const consumerTarget = genericNode(
    memory,
    CQ,
    consumerLocalDR,
    consumerMu,
    [consumerAssumption],
  );
  const consumerGeneric: StructuralHeterogeneousDerivedDerivationEvidence = Object.freeze({
    identity: consumerIdentity,
    targetOccurrence: consumerTarget,
  });
  replayStructuralHeterogeneousDerivedDerivationSchema(memory, consumerGeneric);

  const consumerValue = memory.ensure(U, C);
  const consumerOpenRoot = materializeHeterogeneousDerivedOpenRootedExpansion(
    memory,
    consumerGeneric,
    [{ role: CP, value: aClaim }, { role: CQ, value: consumerValue }],
  ).concreteRoot;
  const consumerOpen = replayStructuralHeterogeneousDerivedOpenRootedInstance(memory, {
    generic: consumerGeneric,
    concreteRoot: consumerOpenRoot,
  });
  const consumerDeps = dependencyOccurrences(memory, consumerOpen.concreteTargetOccurrence);
  same(consumerDeps.length, 1, "downstream consumer has one assumption slot");
  const consumerConcreteAssumption = consumerDeps[0];
  assert(consumerConcreteAssumption !== undefined, "downstream concrete assumption exists");

  const consumerClosedRoot = materializeHeterogeneousDerivedClosedRootedDischarge(
    memory,
    { generic: consumerGeneric, concreteRoot: consumerOpenRoot },
    [{
      assumptionOccurrence: consumerConcreteAssumption,
      proofOccurrence: t4.projectedOccurrence,
    }],
  ).closedRoot;
  const consumerClosed = replayStructuralHeterogeneousDerivedClosedRootedInstance(memory, {
    open: { generic: consumerGeneric, concreteRoot: consumerOpenRoot },
    closedRoot: consumerClosedRoot,
  });
  same(consumerClosed.dischargedAssumptionCount, 1, "exact T4 result is consumed downstream");
  const consumerClosedTarget = memory.poles(consumerClosedRoot).end;
  const consumerClosedDeps = dependencyOccurrences(memory, consumerClosedTarget);
  same(consumerClosedDeps[0], t4.projectedOccurrence, "downstream graft uses exact T4 projected occurrence");
  replayClosedProofOccurrence(memory, theory, consumerClosedTarget);

  assert(memory.find(theory, bridgeRule) === undefined, "bridge projection never promoted");
  assert(memory.find(theory, bridgeDR) === undefined, "bridge projection DR never promoted");
  assert(memory.find(theory, t4Rule) === undefined, "T4 Rule never promoted");
  assert(memory.find(theory, t4DR) === undefined, "T4 DR never promoted");

  console.log("T5_STRUCTURE = SUPPORTED");
  console.log("T5_SYMBOLIC_PREMISE_SLOTS = 2/2");
  console.log("T5_CANONICAL_CONTRACTION = SUPPORTED");
  console.log("T5_SHARED_PROOF_IN_TWO_DEPENDENCY_SLOTS = SUPPORTED");
  console.log("T5_COMBINED_CLOSURE_TO_T4_PREMISE = SUPPORTED");
  console.log("T4_REUSE = SUPPORTED");
  console.log("T5_PROOF_ANET = SUPPORTED");
  console.log("T4_PRIMITIVE_PROMOTION = NOT USED");
  console.log("T5_PRIMITIVE_PROMOTION = NOT USED");
  console.log("accepted semantic delta = NONE");
}

main();
