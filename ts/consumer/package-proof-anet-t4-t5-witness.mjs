import assert from "node:assert/strict";
import {
  Memory,
  createStructuralProofProducer,
  ensureRootBasis,
  materializeHeterogeneousDerivedClosedRootedDischarge,
  materializeHeterogeneousDerivedOpenRootedExpansion,
  replayClosedProofOccurrence,
  replayProofSubAnetProjection,
  replayStructuralHeterogeneousDerivedClosedRootedInstance,
  replayStructuralHeterogeneousDerivedDerivationSchema,
  replayStructuralHeterogeneousDerivedOpenRootedInstance,
} from "@mts/core";

const memory = new Memory();
const { R, O, C, L, U } = ensureRootBasis(memory);
const producer = createStructuralProofProducer(memory);
const theory = memory.ensure(C, U);

const sequence = (values) => producer.definePremiseOccurrenceSequence(values);
const identityProof = (left, right, children) =>
  memory.ensure(memory.ensure(left, right), sequence(children));
const morphism = (sourceDictionary, targetDictionary, bindings) =>
  sequence([
    theory,
    sourceDictionary,
    targetDictionary,
    sequence(bindings.map(([sourceRole, targetRole]) => memory.ensure(sourceRole, targetRole))),
  ]);
const genericNode = (claim, localDR, mu, dependencies) =>
  memory.ensure(claim, memory.ensure(localDR, memory.ensure(mu, sequence(dependencies))));

let roleCursor = memory.ensure(L, R);
const freshRole = () => (roleCursor = memory.ensure(roleCursor, R));

// Exact K1-valid identity support used only as ordinary proof data.
const rootProof = identityProof(R, R, []);
const oProof = identityProof(O, O, [rootProof]);
const cProof = identityProof(C, C, [rootProof]);
const lProof = identityProof(L, L, [oProof, cProof]);
const uProof = identityProof(U, U, [cProof, oProof]);
const a = memory.ensure(O, U);
const aProof = identityProof(a, a, [oProof, uProof]);
const aClaim = memory.ensure(a, a);
const successor = memory.ensure(a, L);
const successorProof = identityProof(successor, successor, [aProof, lProof]);
const successorClaim = memory.ensure(successor, successor);

replayClosedProofOccurrence(memory, theory, successorProof);
replayClosedProofOccurrence(memory, theory, aProof);

// Generic two-slot package law Pair(P1,P2) <- P1,P2. The target schema is
// deliberately unadmitted; only the local implementation step is admitted.
const P1 = freshRole();
const P2 = freshRole();
const packageDictionary = producer.defineRoleDictionary([P1, P2]);
const packageConclusion = memory.ensure(P1, P2);
const packageRule = producer.defineRule(packageDictionary, packageConclusion);
const packageDR = producer.defineDerivationRule(packageRule, [P1, P2]);
const packageIdentity = memory.ensure(packageDR, theory);
assert.equal(memory.find(theory, packageRule), undefined);
assert.equal(memory.find(theory, packageDR), undefined);

const localP1 = freshRole();
const localP2 = freshRole();
const localDictionary = producer.defineRoleDictionary([localP1, localP2]);
const localConclusion = memory.ensure(localP1, localP2);
const localRule = producer.defineRule(localDictionary, localConclusion);
const localDR = producer.defineDerivationRule(localRule, [localP1, localP2]);
producer.admitRule(theory, localRule);
producer.admitDerivationRule(theory, localDR);
const packageMu = morphism(
  localDictionary,
  packageDictionary,
  [[localP1, P1], [localP2, P2]],
);
const genericAssumption1 = memory.ensure(P1, packageIdentity);
const genericAssumption2 = memory.ensure(P2, packageIdentity);
const packageTarget = genericNode(
  packageConclusion,
  localDR,
  packageMu,
  [genericAssumption1, genericAssumption2],
);
const packageGeneric = Object.freeze({ identity: packageIdentity, targetOccurrence: packageTarget });
const genericReplay = replayStructuralHeterogeneousDerivedDerivationSchema(memory, packageGeneric);
assert.equal(genericReplay.declaredAssumptionCount, 2);
assert.equal(genericReplay.usedAssumptionCount, 2);

// Canonical concrete T5 instance contracts both symbolic premises to the same
// exact successor identity Claim, while K1d2 remains authority for two slots.
const openPackageRoot = materializeHeterogeneousDerivedOpenRootedExpansion(
  memory,
  packageGeneric,
  [{ role: P1, value: successorClaim }, { role: P2, value: successorClaim }],
).concreteRoot;
const openPackage = replayStructuralHeterogeneousDerivedOpenRootedInstance(memory, {
  generic: packageGeneric,
  concreteRoot: openPackageRoot,
});
assert.equal(openPackage.pairedOccurrenceCount, 3);

const openPackageIdentity = memory.poles(openPackageRoot).start;
const sharedAssumption = memory.ensure(successorClaim, openPackageIdentity);
const closedPackageRoot = materializeHeterogeneousDerivedClosedRootedDischarge(
  memory,
  { generic: packageGeneric, concreteRoot: openPackageRoot },
  [{ assumptionOccurrence: sharedAssumption, proofOccurrence: successorProof }],
).closedRoot;
const closedPackage = replayStructuralHeterogeneousDerivedClosedRootedInstance(memory, {
  open: { generic: packageGeneric, concreteRoot: openPackageRoot },
  closedRoot: closedPackageRoot,
});
assert.equal(closedPackage.dischargedAssumptionCount, 1);
assert.equal(closedPackage.pairedStructuralOccurrenceCount, 1);
const closedPackageTarget = memory.poles(closedPackageRoot).end;
replayClosedProofOccurrence(memory, theory, closedPackageTarget);

// Generic T5 bridge selects the already validated T4 premise descendant.
const A = freshRole();
const B = freshRole();
const N = freshRole();
const bridgeDictionary = producer.defineRoleDictionary([A, B, N]);
const successorA = memory.ensure(A, L);
const successorB = memory.ensure(B, L);
const predecessorPremiseA = memory.ensure(successorA, N);
const predecessorPremiseB = memory.ensure(successorB, N);
const combinedPremise = memory.ensure(predecessorPremiseA, predecessorPremiseB);
const t4PremiseTemplate = memory.ensure(successorA, successorB);
const bridgeRule = producer.defineRule(bridgeDictionary, t4PremiseTemplate);
const bridgeDR = producer.defineDerivationRule(bridgeRule, [combinedPremise]);
assert.equal(memory.find(theory, bridgeRule), undefined);
assert.equal(memory.find(theory, bridgeDR), undefined);
const bridge = replayProofSubAnetProjection(memory, {
  theory,
  schemaDerivationRule: bridgeDR,
  premiseProofOccurrence: closedPackageTarget,
});
assert.equal(bridge.projectedOccurrence, successorProof);
assert.equal(bridge.projectedClaim, successorClaim);

// Reuse the accepted generic T4 projection shape on the exact projected premise.
const T4A = freshRole();
const T4B = freshRole();
const t4Dictionary = producer.defineRoleDictionary([T4A, T4B]);
const t4Premise = memory.ensure(memory.ensure(T4A, L), memory.ensure(T4B, L));
const t4Conclusion = memory.ensure(T4A, T4B);
const t4Rule = producer.defineRule(t4Dictionary, t4Conclusion);
const t4DR = producer.defineDerivationRule(t4Rule, [t4Premise]);
assert.equal(memory.find(theory, t4Rule), undefined);
assert.equal(memory.find(theory, t4DR), undefined);
const t4 = replayProofSubAnetProjection(memory, {
  theory,
  schemaDerivationRule: t4DR,
  premiseProofOccurrence: bridge.projectedOccurrence,
});
assert.equal(t4.projectedOccurrence, aProof);
assert.equal(t4.projectedClaim, aClaim);

// A later unrelated generic proof consumes the exact T4 result via K1d4.
const CP = freshRole();
const CQ = freshRole();
const consumerDictionary = producer.defineRoleDictionary([CP, CQ]);
const consumerRule = producer.defineRule(consumerDictionary, CQ);
const consumerDR = producer.defineDerivationRule(consumerRule, [CP]);
const consumerIdentity = memory.ensure(consumerDR, theory);

const localCP = freshRole();
const localCQ = freshRole();
const consumerLocalDictionary = producer.defineRoleDictionary([localCP, localCQ]);
const consumerLocalRule = producer.defineRule(consumerLocalDictionary, localCQ);
const consumerLocalDR = producer.defineDerivationRule(consumerLocalRule, [localCP]);
producer.admitRule(theory, consumerLocalRule);
producer.admitDerivationRule(theory, consumerLocalDR);
const consumerMu = morphism(
  consumerLocalDictionary,
  consumerDictionary,
  [[localCP, CP], [localCQ, CQ]],
);
const consumerAssumption = memory.ensure(CP, consumerIdentity);
const consumerTarget = genericNode(CQ, consumerLocalDR, consumerMu, [consumerAssumption]);
const consumerGeneric = Object.freeze({
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
replayStructuralHeterogeneousDerivedOpenRootedInstance(memory, {
  generic: consumerGeneric,
  concreteRoot: consumerOpenRoot,
});
const consumerOpenIdentity = memory.poles(consumerOpenRoot).start;
const consumerConcreteAssumption = memory.ensure(aClaim, consumerOpenIdentity);
const consumerClosedRoot = materializeHeterogeneousDerivedClosedRootedDischarge(
  memory,
  { generic: consumerGeneric, concreteRoot: consumerOpenRoot },
  [{ assumptionOccurrence: consumerConcreteAssumption, proofOccurrence: t4.projectedOccurrence }],
).closedRoot;
const consumerClosed = replayStructuralHeterogeneousDerivedClosedRootedInstance(memory, {
  open: { generic: consumerGeneric, concreteRoot: consumerOpenRoot },
  closedRoot: consumerClosedRoot,
});
assert.equal(consumerClosed.dischargedAssumptionCount, 1);
replayClosedProofOccurrence(memory, theory, memory.poles(consumerClosedRoot).end);

assert.equal(memory.find(theory, bridgeRule), undefined);
assert.equal(memory.find(theory, bridgeDR), undefined);
assert.equal(memory.find(theory, t4Rule), undefined);
assert.equal(memory.find(theory, t4DR), undefined);

console.log("PACKAGE_ROOT_K1D2_CONSTRUCTION = SUPPORTED");
console.log("PACKAGE_ROOT_T5_TWO_SLOT_CLOSURE = SUPPORTED");
console.log("PACKAGE_ROOT_T5_TO_T4_PROJECTION = SUPPORTED");
console.log("PACKAGE_ROOT_T4_REUSE = SUPPORTED");
console.log("ADDITIONAL_CONSTRUCTION_FACADE = NOT REQUIRED");
console.log("DEEP_IMPORTS = NONE");
console.log("production delta = NONE");
console.log("accepted semantic delta = NONE");
