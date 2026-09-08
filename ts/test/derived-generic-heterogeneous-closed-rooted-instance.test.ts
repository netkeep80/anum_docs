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
import {
  StructuralHeterogeneousDerivedClosedRootedInstanceReplayError,
  replayStructuralHeterogeneousDerivedClosedRootedInstance,
} from "../src/derived-derivation-heterogeneous-discharge.js";
import {
  StructuralHeterogeneousDerivedClosedRootedDischargeMaterializeError,
  materializeHeterogeneousDerivedClosedRootedDischarge,
} from "../src/derived-derivation-heterogeneous-discharge-materialize.js";
import {
  StructuralRootedProofAsetReplayError,
  replayStructuralRootedProofAset,
} from "../src/rooted-proof-aset.js";
import { replayRecursiveLinkIdentityProofAset } from "../src/recursive-link-identity-proof.js";
import { exportPortableStructuralTheory } from "../src/portable-theory.js";
import { computePortableStructuralTheoryRevision } from "../src/portable-theory-digest.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

function expectDischargeError(code: string, effect: () => unknown): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof StructuralHeterogeneousDerivedClosedRootedInstanceReplayError, `${code}: wrong discharge error type`);
    same(error.code, code, `${code}: wrong discharge error code`);
    return;
  }
  throw new Error(`${code}: expected discharge error`);
}

function expectMaterializeError(code: string, effect: () => unknown): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof StructuralHeterogeneousDerivedClosedRootedDischargeMaterializeError, `${code}: wrong materialize error type`);
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

function identityProof(
  memory: Memory,
  left: LinkHandle,
  right: LinkHandle,
  children: readonly LinkHandle[],
): LinkHandle {
  const claim = memory.ensure(left, right);
  return memory.ensure(claim, materializeExactSequence(memory, children));
}

async function main(): Promise<void> {
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
  const genericN1 = memory.ensure(B, memory.ensure(r1DR, memory.ensure(mu1, materializeExactSequence(memory, [genericAssumption]))));
  const genericN2 = memory.ensure(CRole, memory.ensure(r2DR, memory.ensure(mu2, materializeExactSequence(memory, [genericN1]))));
  const generic: StructuralHeterogeneousDerivedDerivationEvidence = Object.freeze({ identity: genericIdentity, targetOccurrence: genericN2 });

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
  const openRoot = materializeHeterogeneousDerivedOpenRootedExpansion(memory, generic, [
    { role: A, value: a }, { role: B, value: b }, { role: CRole, value: c },
  ]).concreteRoot;
  const openInstance = replayStructuralHeterogeneousDerivedOpenRootedInstance(memory, { generic, concreteRoot: openRoot });
  same(openInstance.bindings[0]?.value, a, "OPEN A binding");
  same(openInstance.bindings[1]?.value, b, "OPEN B binding");
  same(openInstance.bindings[2]?.value, c, "OPEN C binding");

  const openIdentity = memory.poles(openRoot).start;
  const openTargetDR = memory.poles(openIdentity).start;
  const openTargetRule = readStructuralDerivationRule(memory, openTargetDR).structuralRule;
  const openAssumption = memory.ensure(a, openIdentity);

  const closedN1 = memory.ensure(b, memory.ensure(r1DR, materializeExactSequence(memory, [xProof])));
  const closedN2 = memory.ensure(c, memory.ensure(r2DR, materializeExactSequence(memory, [closedN1])));
  const closedTargetDR = defineStructuralDerivationRule(memory, openTargetRule, []);
  const closedIdentity = memory.ensure(closedTargetDR, theory);
  const closedRoot = memory.ensure(closedIdentity, closedN2);

  const closedReplay = replayStructuralRootedProofAset(memory, closedRoot);
  same(closedReplay.conclusion, c, "CLOSED exact conclusion");
  same(closedReplay.declaredAssumptionCount, 0, "CLOSED declared assumptions");
  same(closedReplay.usedAssumptionCount, 0, "CLOSED used assumptions");

  const before = memory.linkCount;
  const discharge = replayStructuralHeterogeneousDerivedClosedRootedInstance(memory, {
    open: { generic, concreteRoot: openRoot }, closedRoot,
  });
  same(discharge.theory, theory, "discharge exact Theory");
  same(discharge.openRoot, openRoot, "discharge exact OPEN root");
  same(discharge.closedRoot, closedRoot, "discharge exact CLOSED root");
  same(discharge.conclusion, c, "discharge exact conclusion");
  same(discharge.dischargedAssumptionCount, 1, "one reachable assumption discharged");
  same(discharge.pairedStructuralOccurrenceCount, 2, "two structural occurrences paired");
  same(memory.linkCount, before, "discharge replay read-only");

  const materialized = materializeHeterogeneousDerivedClosedRootedDischarge(
    memory,
    { generic, concreteRoot: openRoot },
    [{ assumptionOccurrence: openAssumption, proofOccurrence: xProof }],
  );
  same(materialized.closedRoot, closedRoot, "materializer matches canonical manual CLOSED root");
  replayStructuralRootedProofAset(memory, materialized.closedRoot);
  replayStructuralHeterogeneousDerivedClosedRootedInstance(memory, {
    open: { generic, concreteRoot: openRoot }, closedRoot: materialized.closedRoot,
  });

  // Proof-law neutrality: the same assumption may be discharged by an ordinary structural proof.
  const proofDictionary = defineStructuralRoleDictionary(memory, []);
  const proofRule = defineStructuralRule(memory, proofDictionary, a);
  const proofDR = defineStructuralDerivationRule(memory, proofRule, []);
  admitStructuralRule(memory, theory, proofRule);
  admitStructuralDerivationRule(memory, theory, proofDR);
  const structuralProof = memory.ensure(a, memory.ensure(proofDR, materializeExactSequence(memory, [])));
  const structurallyClosed = materializeHeterogeneousDerivedClosedRootedDischarge(
    memory,
    { generic, concreteRoot: openRoot },
    [{ assumptionOccurrence: openAssumption, proofOccurrence: structuralProof }],
  ).closedRoot;
  replayStructuralRootedProofAset(memory, structurallyClosed);
  replayStructuralHeterogeneousDerivedClosedRootedInstance(memory, {
    open: { generic, concreteRoot: openRoot }, closedRoot: structurallyClosed,
  });

  // Fail closed at predecessor boundaries.
  expectDischargeError("invalid-open-instance", () =>
    replayStructuralHeterogeneousDerivedClosedRootedInstance(memory, {
      open: { generic, concreteRoot: memory.root }, closedRoot,
    }),
  );
  expectDischargeError("invalid-closed-rooted-proof", () =>
    replayStructuralHeterogeneousDerivedClosedRootedInstance(memory, {
      open: { generic, concreteRoot: openRoot }, closedRoot: memory.root,
    }),
  );
  expectDischargeError("non-closed-target", () =>
    replayStructuralHeterogeneousDerivedClosedRootedInstance(memory, {
      open: { generic, concreteRoot: openRoot }, closedRoot: openRoot,
    }),
  );

  // Same closed theorem but a different concrete B is valid K1, not this OPEN discharge.
  const b2 = memory.ensure(C, L);
  const changedN1 = memory.ensure(b2, memory.ensure(r1DR, materializeExactSequence(memory, [xProof])));
  const changedN2 = memory.ensure(c, memory.ensure(r2DR, materializeExactSequence(memory, [changedN1])));
  const changedRoot = memory.ensure(closedIdentity, changedN2);
  replayStructuralRootedProofAset(memory, changedRoot);
  expectDischargeError("claim-mismatch", () =>
    replayStructuralHeterogeneousDerivedClosedRootedInstance(memory, {
      open: { generic, concreteRoot: openRoot }, closedRoot: changedRoot,
    }),
  );

  // Same Claims through another admitted primitive path remain valid K1 but are noncanonical discharge.
  const A2 = memory.ensure(U, L);
  const B2 = memory.ensure(L, O);
  const altDictionary = defineStructuralRoleDictionary(memory, [A2, B2]);
  const altRule = defineStructuralRule(memory, altDictionary, B2);
  const altDR = defineStructuralDerivationRule(memory, altRule, [A2]);
  admitStructuralRule(memory, theory, altRule);
  admitStructuralDerivationRule(memory, theory, altDR);
  const altN1 = memory.ensure(b, memory.ensure(altDR, materializeExactSequence(memory, [xProof])));
  const altN2 = memory.ensure(c, memory.ensure(r2DR, materializeExactSequence(memory, [altN1])));
  const altRoot = memory.ensure(closedIdentity, altN2);
  replayStructuralRootedProofAset(memory, altRoot);
  expectDischargeError("derivation-rule-mismatch", () =>
    replayStructuralHeterogeneousDerivedClosedRootedInstance(memory, {
      open: { generic, concreteRoot: openRoot }, closedRoot: altRoot,
    }),
  );

  // Constructor coordinates are transport only and fail closed when malformed.
  expectMaterializeError("duplicate-assumption-proof", () =>
    materializeHeterogeneousDerivedClosedRootedDischarge(memory, { generic, concreteRoot: openRoot }, [
      { assumptionOccurrence: openAssumption, proofOccurrence: xProof },
      { assumptionOccurrence: openAssumption, proofOccurrence: xProof },
    ]),
  );
  expectMaterializeError("unknown-assumption-occurrence", () =>
    materializeHeterogeneousDerivedClosedRootedDischarge(memory, { generic, concreteRoot: openRoot }, [
      { assumptionOccurrence: memory.root, proofOccurrence: xProof },
    ]),
  );
  expectMaterializeError("missing-assumption-proof", () =>
    materializeHeterogeneousDerivedClosedRootedDischarge(memory, { generic, concreteRoot: openRoot }, []),
  );
  const y = memory.ensure(U, C);
  const wrongProof = identityProof(memory, y, y, []);
  expectMaterializeError("proof-claim-mismatch", () =>
    materializeHeterogeneousDerivedClosedRootedDischarge(memory, { generic, concreteRoot: openRoot }, [
      { assumptionOccurrence: openAssumption, proofOccurrence: wrongProof },
    ]),
  );

  // Materializer deliberately does not inspect Support; final K1 rejects malformed replacement support.
  const fakeProof = memory.ensure(a, memory.root);
  const malformedClosed = materializeHeterogeneousDerivedClosedRootedDischarge(
    memory,
    { generic, concreteRoot: openRoot },
    [{ assumptionOccurrence: openAssumption, proofOccurrence: fakeProof }],
  ).closedRoot;
  try {
    replayStructuralRootedProofAset(memory, malformedClosed);
    throw new Error("malformed replacement Support must fail K1");
  } catch (error) {
    assert(error instanceof StructuralRootedProofAsetReplayError, "malformed replacement rejected by K1");
  }
  expectDischargeError("invalid-closed-rooted-proof", () =>
    replayStructuralHeterogeneousDerivedClosedRootedInstance(memory, {
      open: { generic, concreteRoot: openRoot }, closedRoot: malformedClosed,
    }),
  );

  // Canonical collapse: two distinct generic premise positions ground to one OPEN assumption occurrence.
  const P = memory.ensure(L, U);
  const Q = memory.ensure(U, R);
  const T = memory.ensure(C, L);
  const collapseGlobal = defineStructuralRoleDictionary(memory, [P, Q, T]);
  const collapseTargetRule = defineStructuralRule(memory, collapseGlobal, T);
  const collapseTargetDR = defineStructuralDerivationRule(memory, collapseTargetRule, [P, Q]);
  const collapseIdentity = memory.ensure(collapseTargetDR, theory);
  const collapseLocal = defineStructuralRoleDictionary(memory, [P, Q, T]);
  const collapseRule = defineStructuralRule(memory, collapseLocal, T);
  const collapseDR = defineStructuralDerivationRule(memory, collapseRule, [P, Q]);
  admitStructuralRule(memory, theory, collapseRule);
  admitStructuralDerivationRule(memory, theory, collapseDR);
  const collapseMu = morphism(memory, theory, collapseLocal, collapseGlobal, [[P, P], [Q, Q], [T, T]]);
  const pAssumption = memory.ensure(P, collapseIdentity);
  const qAssumption = memory.ensure(Q, collapseIdentity);
  const collapseNode = memory.ensure(T, memory.ensure(collapseDR, memory.ensure(collapseMu, materializeExactSequence(memory, [pAssumption, qAssumption]))));
  const collapseGeneric = { identity: collapseIdentity, targetOccurrence: collapseNode };
  const tValue = memory.ensure(C, O);
  const collapseOpen = materializeHeterogeneousDerivedOpenRootedExpansion(memory, collapseGeneric, [
    { role: P, value: a }, { role: Q, value: a }, { role: T, value: tValue },
  ]).concreteRoot;
  replayStructuralHeterogeneousDerivedOpenRootedInstance(memory, { generic: collapseGeneric, concreteRoot: collapseOpen });
  const collapseOpenIdentity = memory.poles(collapseOpen).start;
  const collapsedAssumption = memory.ensure(a, collapseOpenIdentity);
  const collapseClosed = materializeHeterogeneousDerivedClosedRootedDischarge(
    memory,
    { generic: collapseGeneric, concreteRoot: collapseOpen },
    [{ assumptionOccurrence: collapsedAssumption, proofOccurrence: xProof }],
  ).closedRoot;
  replayStructuralRootedProofAset(memory, collapseClosed);
  const collapseReplay = replayStructuralHeterogeneousDerivedClosedRootedInstance(memory, {
    open: { generic: collapseGeneric, concreteRoot: collapseOpen }, closedRoot: collapseClosed,
  });
  same(collapseReplay.dischargedAssumptionCount, 1, "two grounded premise positions share one discharged occurrence");

  // Fake ambient carriers/admissions created after the proof grant zero authority.
  memory.ensure(openAssumption, xProof);
  memory.ensure(theory, closedTargetDR);
  const afterFake = replayStructuralHeterogeneousDerivedClosedRootedInstance(memory, {
    open: { generic, concreteRoot: openRoot }, closedRoot,
  });
  same(afterFake.closedRoot, closedRoot, "fake ambient evidence leaves authority unchanged");

  // Trusted replay is read-only and preserves exact Theory revision.
  const revisionBefore = await computePortableStructuralTheoryRevision(
    exportPortableStructuralTheory(memory, theory),
  );
  const countBeforeRevisionReplay = memory.linkCount;
  replayStructuralHeterogeneousDerivedClosedRootedInstance(memory, {
    open: { generic, concreteRoot: openRoot }, closedRoot,
  });
  same(memory.linkCount, countBeforeRevisionReplay, "K1d4 binder remains read-only");
  const revisionAfter = await computePortableStructuralTheoryRevision(
    exportPortableStructuralTheory(memory, theory),
  );
  same(revisionAfter.scheme, revisionBefore.scheme, "Theory revision scheme unchanged");
  same(revisionAfter.value, revisionBefore.value, "exact Theory revision unchanged");

  console.log("TOPOLOGY_DERIVED_ASSUMPTION_DISCHARGE = SUPPORTED");
  console.log("CLOSED_ROOTED_GENERIC_INSTANCE = SUPPORTED");
  console.log("EXPLICIT_DISCHARGE_CARRIER_AUTHORITY = NOT REQUIRED");
  console.log("PROOF_LAW_NEUTRAL_DISCHARGE = SUPPORTED");
  console.log("FUNCTIONAL_OPEN_TO_CLOSED = REQUIRED");
  console.log("REVERSE_INJECTIVITY = NOT REQUIRED");
  console.log("ROOTED_K1_SEMANTICS = UNCHANGED");
  console.log("K1D4_SECURITY_CORPUS = GREEN");
  console.log("accepted semantic delta = NONE");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
