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
  readStructuralDerivationRule,
} from "../src/derivation.js";
import {
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

function identityProof(
  memory: Memory,
  left: LinkHandle,
  right: LinkHandle,
  children: readonly LinkHandle[],
): LinkHandle {
  const claim = memory.ensure(left, right);
  return memory.ensure(claim, materializeExactSequence(memory, children));
}

function main(): void {
  const memory = new Memory();
  const { R, O, C, L, U } = ensureRootBasis(memory);
  const theory = memory.ensure(C, U);

  const A = memory.ensure(L, R);
  const B = memory.ensure(R, L);
  const CRole = memory.ensure(R, U);
  const globalDictionary = defineStructuralRoleDictionary(memory, [A, B, CRole]);
  const genericTargetRule = defineStructuralRule(memory, globalDictionary, CRole);
  const genericTargetDR = defineStructuralDerivationRule(memory, genericTargetRule, [A]);
  const genericIdentity = memory.ensure(genericTargetDR, theory);

  const localAB = defineStructuralRoleDictionary(memory, [A, B]);
  const r1Rule = defineStructuralRule(memory, localAB, B);
  const r1DR = defineStructuralDerivationRule(memory, r1Rule, [A]);
  admitStructuralRule(memory, theory, r1Rule);
  admitStructuralDerivationRule(memory, theory, r1DR);

  const localBC = defineStructuralRoleDictionary(memory, [B, CRole]);
  const r2Rule = defineStructuralRule(memory, localBC, CRole);
  const r2DR = defineStructuralDerivationRule(memory, r2Rule, [B]);
  admitStructuralRule(memory, theory, r2Rule);
  admitStructuralDerivationRule(memory, theory, r2DR);

  const mu1 = morphism(memory, theory, localAB, globalDictionary, [[A, A], [B, B]]);
  const mu2 = morphism(memory, theory, localBC, globalDictionary, [[B, B], [CRole, CRole]]);
  const genericAssumption = memory.ensure(A, genericIdentity);
  const genericN1 = memory.ensure(
    B,
    memory.ensure(r1DR, memory.ensure(mu1, materializeExactSequence(memory, [genericAssumption]))),
  );
  const genericN2 = memory.ensure(
    CRole,
    memory.ensure(r2DR, memory.ensure(mu2, materializeExactSequence(memory, [genericN1]))),
  );
  const generic: StructuralHeterogeneousDerivedDerivationEvidence = Object.freeze({
    identity: genericIdentity,
    targetOccurrence: genericN2,
  });

  // Arbitrary ROOT-grounded identity Claim used only as supplied proof data.
  const arbitraryStart = memory.ensureStartSelfClosed(C);
  const arbitraryEnd = memory.ensureEndSelfClosed(O);
  const x = memory.ensure(arbitraryStart, arbitraryEnd);
  const a = memory.ensure(x, x);
  const rootProof = identityProof(memory, R, R, []);
  const oProof = identityProof(memory, O, O, [rootProof]);
  const cProof = identityProof(memory, C, C, [rootProof]);
  const startProof = identityProof(memory, arbitraryStart, arbitraryStart, [cProof]);
  const endProof = identityProof(memory, arbitraryEnd, arbitraryEnd, [oProof]);
  const xProof = identityProof(memory, x, x, [startProof, endProof]);
  same(memory.poles(xProof).start, a, "identity proof exact assumption Claim");
  replayRecursiveLinkIdentityProofAset(memory, xProof);

  const b = memory.ensure(O, C);
  const c = memory.ensure(O, U);
  const expanded = materializeHeterogeneousDerivedOpenRootedExpansion(memory, generic, [
    { role: A, value: a },
    { role: B, value: b },
    { role: CRole, value: c },
  ]);
  const openRoot = expanded.concreteRoot;
  const openInstance = replayStructuralHeterogeneousDerivedOpenRootedInstance(memory, {
    generic,
    concreteRoot: openRoot,
  });
  same(openInstance.bindings[0]?.value, a, "OPEN A binding");
  same(openInstance.bindings[1]?.value, b, "OPEN B binding");
  same(openInstance.bindings[2]?.value, c, "OPEN C binding");

  const openIdentity = memory.poles(openRoot).start;
  const openTargetDR = memory.poles(openIdentity).start;
  const openTargetRule = readStructuralDerivationRule(memory, openTargetDR).structuralRule;
  const openAssumption = memory.ensure(a, openIdentity);

  const closedN1 = memory.ensure(
    b,
    memory.ensure(r1DR, materializeExactSequence(memory, [xProof])),
  );
  const closedN2 = memory.ensure(
    c,
    memory.ensure(r2DR, materializeExactSequence(memory, [closedN1])),
  );
  const closedTargetDR = defineStructuralDerivationRule(memory, openTargetRule, []);
  const closedIdentity = memory.ensure(closedTargetDR, theory);
  const closedRoot = memory.ensure(closedIdentity, closedN2);

  const closedReplay = replayStructuralRootedProofAset(memory, closedRoot);
  same(closedReplay.conclusion, c, "CLOSED exact conclusion");
  same(closedReplay.declaredAssumptionCount, 0, "CLOSED declared assumptions");
  same(closedReplay.usedAssumptionCount, 0, "CLOSED used assumptions");

  const before = memory.linkCount;
  const discharge = replayStructuralHeterogeneousDerivedClosedRootedInstance(memory, {
    open: { generic, concreteRoot: openRoot },
    closedRoot,
  });
  same(discharge.theory, theory, "discharge exact Theory");
  same(discharge.openRoot, openRoot, "discharge exact OPEN root");
  same(discharge.closedRoot, closedRoot, "discharge exact CLOSED root");
  same(discharge.conclusion, c, "discharge exact conclusion");
  same(discharge.dischargedAssumptionCount, 1, "one reachable assumption discharged");
  same(memory.linkCount, before, "discharge replay read-only");

  const materialized = materializeHeterogeneousDerivedClosedRootedDischarge(
    memory,
    { generic, concreteRoot: openRoot },
    [{ assumptionOccurrence: openAssumption, proofOccurrence: xProof }],
  );
  same(materialized.closedRoot, closedRoot, "materializer matches canonical manual CLOSED root");
  replayStructuralRootedProofAset(memory, materialized.closedRoot);
  replayStructuralHeterogeneousDerivedClosedRootedInstance(memory, {
    open: { generic, concreteRoot: openRoot },
    closedRoot: materialized.closedRoot,
  });

  console.log("TOPOLOGY_DERIVED_ASSUMPTION_DISCHARGE = SUPPORTED");
  console.log("CLOSED_ROOTED_GENERIC_INSTANCE = SUPPORTED");
  console.log("EXPLICIT_DISCHARGE_CARRIER_AUTHORITY = NOT REQUIRED");
  console.log("PROOF_LAW_NEUTRAL_DISCHARGE = SUPPORTED");
  console.log("accepted semantic delta = NONE");
}

main();
