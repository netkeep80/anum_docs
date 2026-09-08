import { materializeExactSequence } from "../src/exact-sequence.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
} from "../src/memory.js";
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
  StructuralDerivedDerivationReplayError,
  replayStructuralDerivedDerivationSchema,
  type StructuralDerivedDerivationEvidence,
} from "../src/derived-derivation-schema.js";
import {
  replayStructuralDerivedDerivationCrossScopeApplication,
} from "../src/derived-derivation-cross-scope.js";
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

function expectRootedError(code: string, effect: () => unknown): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof StructuralRootedProofAsetReplayError, `${code}: wrong error type`);
    same(error.code, code, `${code}: wrong error code`);
    return;
  }
  throw new Error(`${code}: expected rooted replay rejection`);
}

interface PrimitiveFixture {
  readonly dictionary: LinkHandle;
  readonly rule: LinkHandle;
  readonly derivationRule: LinkHandle;
  readonly ruleAdmission: LinkHandle;
  readonly derivationAdmission: LinkHandle;
  readonly evidence: StructuralDerivedDerivationEvidence;
}

interface TargetFixture {
  readonly rule: LinkHandle;
  readonly derivationRule: LinkHandle;
  readonly identity: LinkHandle;
}

function primitiveFixture(
  memory: Memory,
  theory: LinkHandle,
  dictionary: LinkHandle,
  premise: LinkHandle,
  conclusion: LinkHandle,
): PrimitiveFixture {
  const rule = defineStructuralRule(memory, dictionary, conclusion);
  const derivationRule = defineStructuralDerivationRule(memory, rule, [premise]);
  const ruleAdmission = admitStructuralRule(memory, theory, rule);
  const derivationAdmission = admitStructuralDerivationRule(memory, theory, derivationRule);
  const identity = memory.ensure(derivationRule, theory);
  const assumption = Object.freeze({
    occurrence: memory.ensure(premise, identity),
    template: premise,
  });
  const premiseSequence = materializeExactSequence(memory, [assumption.occurrence]);
  const targetOccurrence = memory.ensure(derivationRule, premiseSequence);

  return Object.freeze({
    dictionary,
    rule,
    derivationRule,
    ruleAdmission,
    derivationAdmission,
    evidence: Object.freeze({
      identity,
      targetOccurrence,
      assumptions: Object.freeze([assumption]),
      nodes: Object.freeze([
        Object.freeze({
          occurrence: targetOccurrence,
          derivationRule,
          ruleAdmission,
          derivationRuleAdmission: derivationAdmission,
          premiseOccurrenceSequence: premiseSequence,
        }),
      ]),
    }),
  });
}

function targetFixture(
  memory: Memory,
  theory: LinkHandle,
  dictionary: LinkHandle,
  premise: LinkHandle,
  conclusion: LinkHandle,
): TargetFixture {
  const rule = defineStructuralRule(memory, dictionary, conclusion);
  const derivationRule = defineStructuralDerivationRule(memory, rule, [premise]);
  return Object.freeze({
    rule,
    derivationRule,
    identity: memory.ensure(derivationRule, theory),
  });
}

function morphism(
  memory: Memory,
  theory: LinkHandle,
  sourceDictionary: LinkHandle,
  targetDictionary: LinkHandle,
  bindings: readonly (readonly [LinkHandle, LinkHandle])[],
): LinkHandle {
  const entries = bindings.map(([sourceRole, targetRole]) =>
    memory.ensure(sourceRole, targetRole),
  );
  return materializeExactSequence(memory, [
    theory,
    sourceDictionary,
    targetDictionary,
    materializeExactSequence(memory, entries),
  ]);
}

function rootedPrimitiveRoot(
  memory: Memory,
  theory: LinkHandle,
  primitiveDerivationRule: LinkHandle,
  premiseClaim: LinkHandle,
  conclusionClaim: LinkHandle,
): LinkHandle {
  const targetDictionary = defineStructuralRoleDictionary(memory, []);
  const targetRule = defineStructuralRule(memory, targetDictionary, conclusionClaim);
  const targetDerivationRule = defineStructuralDerivationRule(
    memory,
    targetRule,
    [premiseClaim],
  );
  const targetIdentity = memory.ensure(targetDerivationRule, theory);
  const assumptionOccurrence = memory.ensure(premiseClaim, targetIdentity);
  const application = memory.ensure(
    primitiveDerivationRule,
    materializeExactSequence(memory, [assumptionOccurrence]),
  );
  const targetOccurrence = memory.ensure(conclusionClaim, application);
  return memory.ensure(targetIdentity, targetOccurrence);
}

function confirmSharedDictionaryInformationLoss(): void {
  const memory = new Memory();
  const { R, O, C, L, U } = ensureRootBasis(memory);
  let cursor = memory.ensure(U, R);
  const fresh = (): LinkHandle => (cursor = memory.ensure(cursor, R));
  const theory = fresh();
  const A = memory.ensure(L, R);
  const B = memory.ensure(R, L);
  const CRole = memory.ensure(R, U);
  const a = memory.ensure(O, fresh());
  const b = memory.ensure(C, fresh());
  const globalDictionary = defineStructuralRoleDictionary(memory, [A, B, CRole]);
  const sharedR1 = primitiveFixture(memory, theory, globalDictionary, A, B);
  const sharedRoot = rootedPrimitiveRoot(memory, theory, sharedR1.derivationRule, a, b);
  const before = memory.linkCount;
  expectRootedError("template-mismatch", () => replayStructuralRootedProofAset(memory, sharedRoot));
  same(memory.linkCount, before, "shared R1 rejection read-only");
}

function main(): void {
  // D1 is intentionally isolated so its primitive admissions cannot contaminate
  // the local-scope-vs-mapped-global authority discriminator below.
  confirmSharedDictionaryInformationLoss();
  console.log("SHARED_DICTIONARY_V1_INFORMATION_LOSS = CONFIRMED");

  const memory = new Memory();
  const { R, O, C, L, U } = ensureRootBasis(memory);
  let cursor = memory.ensure(U, R);
  const fresh = (): LinkHandle => (cursor = memory.ensure(cursor, R));

  const theory = fresh();
  const A = memory.ensure(L, R);
  const B = memory.ensure(R, L);
  const CRole = memory.ensure(R, U);
  same(new Set([A, B, CRole]).size, 3, "role identities");

  const a = memory.ensure(O, fresh());
  const b = memory.ensure(C, fresh());
  const c = memory.ensure(L, fresh());
  same(new Set([a, b, c]).size, 3, "concrete value identities");

  const globalDictionary = defineStructuralRoleDictionary(memory, [A, B, CRole]);
  const localAB = defineStructuralRoleDictionary(memory, [A, B]);
  const localBC = defineStructuralRoleDictionary(memory, [B, CRole]);

  // D2a: primitive rooted V1 has complete rho when each primitive declares only
  // the roles it actually owns.
  const localR1 = primitiveFixture(memory, theory, localAB, A, B);
  const localR2 = primitiveFixture(memory, theory, localBC, B, CRole);

  const localR1Root = rootedPrimitiveRoot(memory, theory, localR1.derivationRule, a, b);
  const beforeLocalR1 = memory.linkCount;
  const localR1Replay = replayStructuralRootedProofAset(memory, localR1Root);
  same(localR1Replay.conclusion, b, "local R1 concrete conclusion");
  same(memory.linkCount, beforeLocalR1, "local R1 rooted replay read-only");

  const localR2Root = rootedPrimitiveRoot(memory, theory, localR2.derivationRule, b, c);
  const beforeLocalR2 = memory.linkCount;
  const localR2Replay = replayStructuralRootedProofAset(memory, localR2Root);
  same(localR2Replay.conclusion, c, "local R2 concrete conclusion");
  same(memory.linkCount, beforeLocalR2, "local R2 rooted replay read-only");
  console.log("LOCAL_PRIMITIVE_ROOTED_V1_COMPLETE_RHO = SUPPORTED");

  // D2b: accepted cross-scope replay proves each local schema maps into Dglobal.
  const globalR1 = targetFixture(memory, theory, globalDictionary, A, B);
  const globalR2 = targetFixture(memory, theory, globalDictionary, B, CRole);
  const mu1 = morphism(memory, theory, localAB, globalDictionary, [
    [A, A],
    [B, B],
  ]);
  const mu2 = morphism(memory, theory, localBC, globalDictionary, [
    [B, B],
    [CRole, CRole],
  ]);

  const beforeMu1 = memory.linkCount;
  replayStructuralDerivedDerivationCrossScopeApplication(memory, {
    source: localR1.evidence,
    morphism: mu1,
    targetIdentity: globalR1.identity,
  });
  same(memory.linkCount, beforeMu1, "mu1 replay read-only");

  const beforeMu2 = memory.linkCount;
  replayStructuralDerivedDerivationCrossScopeApplication(memory, {
    source: localR2.evidence,
    morphism: mu2,
    targetIdentity: globalR2.identity,
  });
  same(memory.linkCount, beforeMu2, "mu2 replay read-only");
  console.log("LOCAL_TO_GLOBAL_MU_REPLAY = SUPPORTED");

  // RED hypothesis: the two mapped target identities should now be usable as
  // composition authority for the global generic chain A -> B -> C without
  // admitting the mapped target Rule/DR pairs as new primitives in Theory.
  assert(memory.find(theory, globalR1.rule) === undefined, "global R1 rule stays unadmitted");
  assert(memory.find(theory, globalR1.derivationRule) === undefined, "global R1 DR stays unadmitted");
  assert(memory.find(theory, globalR2.rule) === undefined, "global R2 rule stays unadmitted");
  assert(memory.find(theory, globalR2.derivationRule) === undefined, "global R2 DR stays unadmitted");

  const composedRule = defineStructuralRule(memory, globalDictionary, CRole);
  const composedDerivationRule = defineStructuralDerivationRule(
    memory,
    composedRule,
    [A],
  );
  const composedIdentity = memory.ensure(composedDerivationRule, theory);
  const composedAssumption = Object.freeze({
    occurrence: memory.ensure(A, composedIdentity),
    template: A,
  });

  const r1Premises = materializeExactSequence(memory, [composedAssumption.occurrence]);
  const r1Occurrence = memory.ensure(globalR1.derivationRule, r1Premises);
  const r2Premises = materializeExactSequence(memory, [r1Occurrence]);
  const r2Occurrence = memory.ensure(globalR2.derivationRule, r2Premises);

  const composedEvidence: StructuralDerivedDerivationEvidence = Object.freeze({
    identity: composedIdentity,
    targetOccurrence: r2Occurrence,
    assumptions: Object.freeze([composedAssumption]),
    nodes: Object.freeze([
      Object.freeze({
        occurrence: r1Occurrence,
        derivationRule: globalR1.derivationRule,
        // Deliberately no new Theory admission exists for the mapped target.
        // The accepted mu proof is the only available authority candidate.
        ruleAdmission: localR1.ruleAdmission,
        derivationRuleAdmission: localR1.derivationAdmission,
        premiseOccurrenceSequence: r1Premises,
      }),
      Object.freeze({
        occurrence: r2Occurrence,
        derivationRule: globalR2.derivationRule,
        ruleAdmission: localR2.ruleAdmission,
        derivationRuleAdmission: localR2.derivationAdmission,
        premiseOccurrenceSequence: r2Premises,
      }),
    ]),
  });

  const beforeComposition = memory.linkCount;
  const composedReplay = replayStructuralDerivedDerivationSchema(memory, composedEvidence);
  same(composedReplay.conclusionTemplate, CRole, "global composed conclusion");
  same(memory.linkCount, beforeComposition, "global composition replay read-only");

  // This line is intentionally unreachable until the RED hypothesis is proven.
  console.log("LOCAL_DICTIONARY_PLUS_MU_SUFFICIENT_FOR_K2 = SUPPORTED");
}

try {
  main();
} catch (error) {
  if (error instanceof StructuralDerivedDerivationReplayError) {
    console.error(`ROOTED_SCOPE_DISCRIMINATOR_RED = ${error.code}`);
  }
  throw error;
}
