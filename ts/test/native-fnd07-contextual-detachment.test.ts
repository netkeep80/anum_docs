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

function primitiveClaimProof(
  memory: Memory,
  theory: LinkHandle,
  claim: LinkHandle,
  supportRoles: readonly LinkHandle[] = [],
): {
  readonly rule: LinkHandle;
  readonly derivationRule: LinkHandle;
  readonly occurrence: LinkHandle;
} {
  const dictionary = defineStructuralRoleDictionary(memory, supportRoles);
  const rule = defineStructuralRule(memory, dictionary, claim);
  const derivationRule = defineStructuralDerivationRule(memory, rule, []);
  admitStructuralRule(memory, theory, rule);
  admitStructuralDerivationRule(memory, theory, derivationRule);
  const occurrence = memory.ensure(
    claim,
    memory.ensure(derivationRule, materializeExactSequence(memory, [])),
  );
  return Object.freeze({ rule, derivationRule, occurrence });
}

function main(): void {
  const memory = new Memory();
  const { R, O, C, L, U } = ensureRootBasis(memory);

  // This Theory is proof authority only. It is deliberately not the Scope token.
  const theory = memory.ensure(C, U);
  let freshSeed = memory.ensure(L, U);
  const fresh = (): LinkHandle => {
    freshSeed = memory.ensure(freshSeed, O);
    return freshSeed;
  };

  // Link-native proof proposition for the external CurrentScopeMember relation.
  // The tag is proof syntax, not runtime publication authority.
  const currentTag = fresh();
  const current = (scope: LinkHandle, witness: LinkHandle): LinkHandle =>
    memory.ensure(currentTag, memory.ensure(scope, witness));

  // Global theorem roles.
  const S = fresh();
  const K = fresh();
  const A = fresh();
  const B = fresh();
  const globalDictionary = defineStructuralRoleDictionary(memory, [S, K, A, B]);
  const globalKA = memory.ensure(K, A);
  const globalAB = memory.ensure(A, B);
  const globalKB = memory.ensure(K, B);
  const targetPremiseTruth = current(S, globalKA);
  const targetPremiseRule = current(S, globalAB);
  const targetConclusion = current(S, globalKB);
  const targetRule = defineStructuralRule(memory, globalDictionary, targetConclusion);
  const targetDR = defineStructuralDerivationRule(
    memory,
    targetRule,
    [targetPremiseTruth, targetPremiseRule],
  );
  const targetIdentity = memory.ensure(targetDR, theory);

  // Local roles are intentionally distinct. This admitted primitive rule is the
  // explicit ContextualScopeCompositionLaw premise, not the theorem target rule.
  const s = fresh();
  const k = fresh();
  const a = fresh();
  const b = fresh();
  for (const [globalRole, localRole] of [[S, s], [K, k], [A, a], [B, b]] as const) {
    assert(globalRole !== localRole, "global and local proof roles stay distinct");
  }
  const localDictionary = defineStructuralRoleDictionary(memory, [s, k, a, b]);
  assert(
    localDictionary !== globalDictionary,
    "premise role dictionary is structurally distinct from theorem target dictionary",
  );
  const localKA = memory.ensure(k, a);
  const localAB = memory.ensure(a, b);
  const localKB = memory.ensure(k, b);
  const localRule = defineStructuralRule(memory, localDictionary, current(s, localKB));
  const localDR = defineStructuralDerivationRule(
    memory,
    localRule,
    [current(s, localKA), current(s, localAB)],
  );
  assert(localRule !== targetRule, "premise Rule is structurally distinct from theorem target Rule");
  assert(localDR !== targetDR, "premise DR is structurally distinct from theorem target DR");

  admitStructuralRule(memory, theory, localRule);
  admitStructuralDerivationRule(memory, theory, localDR);
  same(memory.find(theory, localRule) !== undefined, true, "composition premise Rule admitted");
  same(memory.find(theory, localDR) !== undefined, true, "composition premise DR admitted");
  same(memory.find(theory, targetRule), undefined, "theorem target Rule remains unadmitted");
  same(memory.find(theory, targetDR), undefined, "theorem target DR remains unadmitted");

  const mu = morphism(
    memory,
    theory,
    localDictionary,
    globalDictionary,
    [[s, S], [k, K], [a, A], [b, B]],
  );

  const genericTruth = memory.ensure(targetPremiseTruth, targetIdentity);
  const genericRule = memory.ensure(targetPremiseRule, targetIdentity);
  const genericTarget = memory.ensure(
    targetConclusion,
    memory.ensure(
      localDR,
      memory.ensure(mu, materializeExactSequence(memory, [genericTruth, genericRule])),
    ),
  );
  const generic: StructuralHeterogeneousDerivedDerivationEvidence = Object.freeze({
    identity: targetIdentity,
    targetOccurrence: genericTarget,
  });

  // Concrete theorem instance.
  const scope = fresh();
  const context = fresh();
  const antecedent = fresh();
  const consequent = fresh();
  assert(scope !== theory, "proof Theory and current-Scope token are distinct authority coordinates");

  const truthWitness = memory.ensure(context, antecedent);
  const ruleWitness = memory.ensure(antecedent, consequent);
  const resultWitness = memory.ensure(context, consequent);

  const currentTruth = current(scope, truthWitness);
  const currentRule = current(scope, ruleWitness);
  const currentResult = current(scope, resultWitness);

  assert(currentTruth !== truthWitness, "currentness proposition is not raw K->A existence");
  assert(currentRule !== ruleWitness, "currentness proposition is not raw A->B existence");

  const openRoot = materializeHeterogeneousDerivedOpenRootedExpansion(
    memory,
    generic,
    [
      { role: S, value: scope },
      { role: K, value: context },
      { role: A, value: antecedent },
      { role: B, value: consequent },
    ],
  ).concreteRoot;

  const openReplay = replayStructuralHeterogeneousDerivedOpenRootedInstance(memory, {
    generic,
    concreteRoot: openRoot,
  });
  same(openReplay.theory, theory, "OPEN replay selects exact proof Theory");
  same(
    memory.poles(openReplay.concreteTargetOccurrence).start,
    currentResult,
    "OPEN theorem target occurrence carries exact current K->B proposition",
  );

  const openIdentity = memory.poles(openRoot).start;
  const truthAssumption = memory.ensure(currentTruth, openIdentity);
  const ruleAssumption = memory.ensure(currentRule, openIdentity);

  const truthProof = primitiveClaimProof(memory, theory, currentTruth);
  const ruleProof = primitiveClaimProof(memory, theory, currentRule);

  const coordinates: readonly StructuralAssumptionProofCoordinate[] = [
    { assumptionOccurrence: truthAssumption, proofOccurrence: truthProof.occurrence },
    { assumptionOccurrence: ruleAssumption, proofOccurrence: ruleProof.occurrence },
  ];

  const closedRoot = materializeHeterogeneousDerivedClosedRootedDischarge(
    memory,
    { generic, concreteRoot: openRoot },
    coordinates,
  ).closedRoot;

  const before = memory.linkCount;
  const closedK1 = replayStructuralRootedProofAset(memory, closedRoot);
  same(closedK1.conclusion, currentResult, "CLOSED K1 proves exact current K->B proposition");
  same(closedK1.declaredAssumptionCount, 0, "CLOSED proof has no open assumptions");
  same(closedK1.usedAssumptionCount, 0, "CLOSED proof uses no assumption leaves");

  const binding = replayStructuralHeterogeneousDerivedClosedRootedInstance(memory, {
    open: { generic, concreteRoot: openRoot },
    closedRoot,
  });
  same(binding.dischargedAssumptionCount, 2, "both current-Scope premises are discharged");
  same(binding.conclusion, currentResult, "OPEN/CLOSED binding preserves exact result");
  same(memory.linkCount, before, "trusted replay is read-only");

  // Ambient raw Links, including a selected-Theory-looking attachment, do not
  // satisfy Current(S, X) assumptions.
  memory.ensure(theory, ruleWitness);
  expectMaterializeError("missing-assumption-proof", () =>
    materializeHeterogeneousDerivedClosedRootedDischarge(
      memory,
      { generic, concreteRoot: openRoot },
      [{ assumptionOccurrence: truthAssumption, proofOccurrence: truthProof.occurrence }],
    ),
  );

  // A proof about the same K->A witness under another Scope token is the wrong Claim.
  const otherScope = fresh();
  const wrongScopeTruth = current(otherScope, truthWitness);
  const wrongScopeProof = primitiveClaimProof(memory, theory, wrongScopeTruth);
  expectMaterializeError("proof-claim-mismatch", () =>
    materializeHeterogeneousDerivedClosedRootedDischarge(
      memory,
      { generic, concreteRoot: openRoot },
      [
        { assumptionOccurrence: truthAssumption, proofOccurrence: wrongScopeProof.occurrence },
        { assumptionOccurrence: ruleAssumption, proofOccurrence: ruleProof.occurrence },
      ],
    ),
  );

  // Host metadata cannot grant or alter proof authority.
  const noisyTruth = {
    assumptionOccurrence: truthAssumption,
    proofOccurrence: truthProof.occurrence,
    theoremId: "FND-07",
    current: true,
  };
  const noisyClosed = materializeHeterogeneousDerivedClosedRootedDischarge(
    memory,
    { generic, concreteRoot: openRoot },
    [
      noisyTruth,
      { assumptionOccurrence: ruleAssumption, proofOccurrence: ruleProof.occurrence },
    ],
  ).closedRoot;
  same(noisyClosed, closedRoot, "host theorem/current metadata grants zero authority");

  // Same Claim with structurally distinct support admitted only in another proof
  // Theory may pass claim matching at construction time, but independent K1
  // replay under the selected Theory must reject it.
  const foreignTheory = fresh();
  assert(foreignTheory !== theory, "foreign proof Theory is distinct");
  const foreignSupportRole = fresh();
  const foreignTruthProof = primitiveClaimProof(
    memory,
    foreignTheory,
    currentTruth,
    [foreignSupportRole],
  );
  assert(
    memory.find(theory, foreignTruthProof.rule) === undefined,
    "foreign currentness Rule absent from selected proof Theory",
  );
  assert(
    memory.find(theory, foreignTruthProof.derivationRule) === undefined,
    "foreign currentness DR absent from selected proof Theory",
  );
  const foreignClosed = materializeHeterogeneousDerivedClosedRootedDischarge(
    memory,
    { generic, concreteRoot: openRoot },
    [
      { assumptionOccurrence: truthAssumption, proofOccurrence: foreignTruthProof.occurrence },
      { assumptionOccurrence: ruleAssumption, proofOccurrence: ruleProof.occurrence },
    ],
  ).closedRoot;

  let foreignRejected = false;
  try {
    replayStructuralRootedProofAset(memory, foreignClosed);
  } catch (error) {
    assert(
      error instanceof StructuralRootedProofAsetReplayError,
      "foreign currentness proof rejected by generic CLOSED K1",
    );
    foreignRejected = true;
  }
  assert(foreignRejected, "foreign proof Theory currentness evidence must fail closed");

  console.log("FND07_CONTEXTUAL_DETACHMENT_NATIVE_COMPONENT = DERIVED_CLOSED_PROOF_ANET");
  console.log("FULL_FND07_NATIVE_ACCEPT = NOT_YET");
  console.log("THEOREM_TARGET_PRIMITIVE_ADMISSION = ABSENT");
  console.log("CONTEXTUAL_SCOPE_COMPOSITION_PREMISE = EXPLICIT");
  console.log("RAW_LINK_EXISTENCE_IS_CURRENTNESS_AUTHORITY = FALSE");
  console.log("SELECTED_THEORY_RELATION_IS_CURRENTNESS_AUTHORITY = FALSE");
  console.log("RUNTIME_CURRENT_SCOPE_IMPLEMENTATION = NOT_CLAIMED");
  console.log("accepted semantic delta = NONE");
}

main();
