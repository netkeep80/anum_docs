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
  replayStructuralHeterogeneousDerivedDerivationSchema,
  type StructuralHeterogeneousDerivedDerivationEvidence,
} from "../src/derived-derivation-heterogeneous.js";
import { materializeHeterogeneousDerivedOpenRootedExpansion } from "../src/derived-derivation-heterogeneous-expansion.js";
import { replayStructuralHeterogeneousDerivedOpenRootedInstance } from "../src/derived-derivation-heterogeneous-instance.js";
import { replayStructuralRootedProofAset } from "../src/rooted-proof-aset.js";

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

function failGap(
  genericDeclared: number,
  genericUsed: number,
  concreteDeclared: number,
  concreteUsed: number,
): never {
  throw new Error(
    `T5_REUSE_GAP(CANONICAL_COLLAPSE_PREMISE_PROVENANCE): `
    + `generic=${genericDeclared}/${genericUsed}, concrete=${concreteDeclared}/${concreteUsed}; `
    + `two distinct symbolic T5 premises collapse to one concrete Claim/assumption occurrence`,
  );
}

function main(): void {
  const memory = new Memory();
  const { R, O, C, L, U } = ensureRootBasis(memory);
  const theory = memory.ensure(C, U);

  // W1c F2 discriminator. The target is deliberately only a neutral pair of
  // the two premises: no equality-transitivity rule and no T4/T5 theorem is
  // admitted here. This slice asks only whether two supplied predecessor
  // premises remain observably two proof dependencies after instantiation.
  const A = memory.ensure(U, R);
  const B = memory.ensure(R, U);
  const N = memory.ensure(C, R);
  const globalDictionary = defineStructuralRoleDictionary(memory, [A, B, N]);

  const successorA = memory.ensure(A, L);
  const successorB = memory.ensure(B, L);
  const premiseA = memory.ensure(successorA, N);
  const premiseB = memory.ensure(successorB, N);
  const pairedPremises = memory.ensure(premiseA, premiseB);
  assert(premiseA !== premiseB, "symbolic T5 premises must be distinct before substitution");

  const targetRule = defineStructuralRule(memory, globalDictionary, pairedPremises);
  const targetDR = defineStructuralDerivationRule(memory, targetRule, [premiseA, premiseB]);
  const targetIdentity = memory.ensure(targetDR, theory);
  assert(memory.find(theory, targetRule) === undefined, "T5 target Rule remains unadmitted");
  assert(memory.find(theory, targetDR) === undefined, "T5 target DR remains unadmitted");

  // One unrelated admitted structural packaging step proves only
  // Pair(PremiseA, PremiseB) from PremiseA, PremiseB. It grants no equality,
  // predecessor, Nat, Succ, T4 or T5 authority.
  const localA = memory.ensure(O, C);
  const localB = memory.ensure(C, O);
  const localN = memory.ensure(U, C);
  const localDictionary = defineStructuralRoleDictionary(memory, [localA, localB, localN]);
  const localSuccessorA = memory.ensure(localA, L);
  const localSuccessorB = memory.ensure(localB, L);
  const localPremiseA = memory.ensure(localSuccessorA, localN);
  const localPremiseB = memory.ensure(localSuccessorB, localN);
  const localPair = memory.ensure(localPremiseA, localPremiseB);
  const localRule = defineStructuralRule(memory, localDictionary, localPair);
  const localDR = defineStructuralDerivationRule(
    memory,
    localRule,
    [localPremiseA, localPremiseB],
  );
  admitStructuralRule(memory, theory, localRule);
  admitStructuralDerivationRule(memory, theory, localDR);

  const mu = morphism(
    memory,
    theory,
    localDictionary,
    globalDictionary,
    [[localA, A], [localB, B], [localN, N]],
  );
  const assumptionA = memory.ensure(premiseA, targetIdentity);
  const assumptionB = memory.ensure(premiseB, targetIdentity);
  assert(assumptionA !== assumptionB, "symbolic T5 assumption occurrences must be distinct");

  const targetOccurrence = genericNode(
    memory,
    pairedPremises,
    localDR,
    mu,
    [assumptionA, assumptionB],
  );
  const generic: StructuralHeterogeneousDerivedDerivationEvidence = Object.freeze({
    identity: targetIdentity,
    targetOccurrence,
  });

  const genericReplay = replayStructuralHeterogeneousDerivedDerivationSchema(memory, generic);
  same(genericReplay.declaredAssumptionCount, 2, "generic T5 declared premises");
  same(genericReplay.usedAssumptionCount, 2, "generic T5 used premises");

  // Faithful true T5 concrete witness. Canonical identity forces the two
  // predecessor values to be the same handle in any actually true instance.
  const a = memory.ensure(O, U);
  const successor = memory.ensure(a, L);
  const openRoot = materializeHeterogeneousDerivedOpenRootedExpansion(
    memory,
    generic,
    [{ role: A, value: a }, { role: B, value: a }, { role: N, value: successor }],
  ).concreteRoot;

  const concreteIdentity = memory.poles(openRoot).start;
  const concreteDR = memory.poles(concreteIdentity).start;
  const concretePremises = readStructuralDerivationRule(memory, concreteDR).premiseTemplates;
  same(concretePremises.length, 2, "concrete target keeps two premise sequence slots");
  const concretePremise0 = concretePremises[0];
  const concretePremise1 = concretePremises[1];
  assert(concretePremise0 !== undefined && concretePremise1 !== undefined, "concrete premise slots exist");
  same(concretePremise0, concretePremise1, "true T5 premise Claims canonically collapse");

  const openInstance = replayStructuralHeterogeneousDerivedOpenRootedInstance(memory, {
    generic,
    concreteRoot: openRoot,
  });
  same(openInstance.pairedOccurrenceCount, 3, "generic target plus two assumptions are paired");

  const rooted = replayStructuralRootedProofAset(memory, openRoot);
  console.log("T5_STRUCTURE = SUPPORTED");
  console.log("T5_SYMBOLIC_PREMISE_PROVENANCE = 2/2");
  console.log(`T5_CONCRETE_PREMISE_PROVENANCE = ${rooted.declaredAssumptionCount}/${rooted.usedAssumptionCount}`);
  console.log("T4_REUSE = NOT REACHED");
  console.log("T4_PRIMITIVE_PROMOTION = NOT USED");
  console.log("accepted semantic delta = NONE");

  if (rooted.declaredAssumptionCount !== 2 || rooted.usedAssumptionCount !== 2) {
    failGap(
      genericReplay.declaredAssumptionCount,
      genericReplay.usedAssumptionCount,
      rooted.declaredAssumptionCount,
      rooted.usedAssumptionCount,
    );
  }

  throw new Error("T5_REUSE_FALSIFIER_EXPECTED_RED: premise provenance unexpectedly survived canonical collapse");
}

main();
