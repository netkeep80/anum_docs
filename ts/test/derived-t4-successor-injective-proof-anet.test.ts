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
  StructuralHeterogeneousDerivedDerivationReplayError,
  replayStructuralHeterogeneousDerivedDerivationSchema,
  type StructuralHeterogeneousDerivedDerivationEvidence,
} from "../src/derived-derivation-heterogeneous.js";
import { materializeHeterogeneousDerivedOpenRootedExpansion } from "../src/derived-derivation-heterogeneous-expansion.js";
import { replayStructuralHeterogeneousDerivedOpenRootedInstance } from "../src/derived-derivation-heterogeneous-instance.js";
import { replayStructuralHeterogeneousDerivedClosedRootedInstance } from "../src/derived-derivation-heterogeneous-discharge.js";
import { materializeHeterogeneousDerivedClosedRootedDischarge } from "../src/derived-derivation-heterogeneous-discharge-materialize.js";
import { replayStructuralRootedProofAset } from "../src/rooted-proof-aset.js";
import { replayRecursiveLinkIdentityProofAset } from "../src/recursive-link-identity-proof.js";

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

function expectGenericGap(
  memory: Memory,
  evidence: StructuralHeterogeneousDerivedDerivationEvidence & Readonly<Record<string, unknown>>,
): string {
  const before = memory.linkCount;
  try {
    replayStructuralHeterogeneousDerivedDerivationSchema(memory, evidence);
  } catch (error) {
    assert(
      error instanceof StructuralHeterogeneousDerivedDerivationReplayError,
      "T4 rerun must fail at the heterogeneous generic authority boundary",
    );
    same(memory.linkCount, before, "failed generic replay remains read-only");
    return error.code;
  }
  throw new Error("T4 generic certificate unexpectedly accepted without primitive authority");
}

function main(): void {
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

  // T4-shaped concrete control. Because Memory is canonical, a true concrete
  // equality (A->L)=(B->L) is represented by one exact successor Link. Its
  // recursive identity proof already carries the exact start-pole proof.
  const successor = memory.ensure(a, L);
  const successorProof = identityProof(memory, successor, successor, [aProof, lProof]);
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
  // F2. K1d3/K1d4 are not the remaining blocker. Use one arbitrary admitted
  // structural step P->Q. The projected identity ProofOccurrence discharges only
  // the concrete P assumption; it is never interpreted as this primitive step.
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
  // F3. Exact generic T4 schema. Current K1d2 has no occurrence law saying that
  // an already-valid premise identity ProofOccurrence authorizes one of its
  // reachable pole subproofs as the theorem consequence. The only structural
  // node shape that could encode this today would promote ordered-pole/T4 to an
  // admitted primitive Rule/DR. Keep that authority deliberately absent.
  // ---------------------------------------------------------------------------
  const A = memory.ensure(L, R);
  const B = memory.ensure(R, L);
  const t4GlobalDictionary = defineStructuralRoleDictionary(memory, [A, B]);
  const t4Premise = memory.ensure(memory.ensure(A, L), memory.ensure(B, L));
  const t4Conclusion = memory.ensure(A, B);
  const t4TargetRule = defineStructuralRule(memory, t4GlobalDictionary, t4Conclusion);
  const t4TargetDR = defineStructuralDerivationRule(memory, t4TargetRule, [t4Premise]);
  const t4Identity = memory.ensure(t4TargetDR, theory);
  const t4Assumption = memory.ensure(t4Premise, t4Identity);

  // Use distinct local Roles so the candidate exercises the accepted local->global
  // morphism architecture rather than relying on one shared RoleDictionary.
  const X = memory.ensure(U, L);
  const Y = memory.ensure(C, L);
  const localDictionary = defineStructuralRoleDictionary(memory, [X, Y]);
  const localPremise = memory.ensure(memory.ensure(X, L), memory.ensure(Y, L));
  const localConclusion = memory.ensure(X, Y);
  const localRule = defineStructuralRule(memory, localDictionary, localConclusion);
  const localDR = defineStructuralDerivationRule(memory, localRule, [localPremise]);
  const mu = morphism(memory, theory, localDictionary, t4GlobalDictionary, [
    [X, A],
    [Y, B],
  ]);
  const t4Candidate = genericNode(memory, t4Conclusion, localDR, mu, [t4Assumption]);

  assert(memory.find(theory, t4TargetRule) === undefined, "T4 target Rule remains unadmitted");
  assert(memory.find(theory, t4TargetDR) === undefined, "T4 target DR remains unadmitted");
  assert(memory.find(theory, localRule) === undefined, "ordered-pole local Rule remains unadmitted");
  assert(memory.find(theory, localDR) === undefined, "ordered-pole local DR remains unadmitted");

  // Host coordinates and ambient Links may describe the already-observed
  // whole-proof -> start-subproof relation, but they grant zero generic authority.
  const hostDecoratedEvidence = Object.freeze({
    identity: t4Identity,
    targetOccurrence: t4Candidate,
    premiseProof: successorProof,
    projectedStartProof: aProof,
  });
  memory.ensure(successorProof, aProof);

  const gap = expectGenericGap(memory, hostDecoratedEvidence);
  same(gap, "invalid-generic-occurrence", "exact post-K1d4 generic boundary");
  assert(memory.find(theory, localRule) === undefined, "rerun did not admit ordered-pole Rule");
  assert(memory.find(theory, localDR) === undefined, "rerun did not admit ordered-pole DR");

  console.log("T4_SUCCESSOR_INJECTIVITY_STRUCTURE = SUPPORTED");
  console.log("IDENTITY_POLE_SUBANET_PROJECTION = SUPPORTED");
  console.log("K1D4_PROJECTED_PROOF_ASSUMPTION_DISCHARGE = SUPPORTED");
  console.log(`T4_PROOF_ANET_RERUN = GAP(${gap})`);
  console.log("T4_REUSE = NOT TESTED");
  console.log("T4_PRIMITIVE_PROMOTION = NOT USED");
  console.log("accepted semantic delta = NONE");
}

main();
