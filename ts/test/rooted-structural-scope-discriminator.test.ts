import { materializeExactSequence } from "../src/exact-sequence.js";
import { Memory, ensureRootBasis, type LinkHandle } from "../src/memory.js";
import {
  StructuralRuleError,
  admitStructuralRule,
  defineStructuralInterpreter,
  defineStructuralRoleDictionary,
  defineStructuralRule,
  replayStructuralRule,
} from "../src/structural-rule.js";
import { defineActField, defineActHeader } from "../src/structural-readers.js";
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
  StructuralDerivedDerivationCrossScopeApplicationReplayError,
  replayStructuralDerivedDerivationCrossScopeApplication,
} from "../src/derived-derivation-cross-scope.js";
import {
  StructuralRootedProofAsetReplayError,
  replayStructuralRootedProofAset,
} from "../src/rooted-proof-aset.js";
import { exportPortableStructuralTheory } from "../src/portable-theory.js";
import { computePortableStructuralTheoryRevision } from "../src/portable-theory-digest.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}
function expectRootedError(code: string, effect: () => unknown): void {
  try { effect(); } catch (error) {
    assert(error instanceof StructuralRootedProofAsetReplayError, `${code}: wrong rooted error`);
    same(error.code, code, `${code}: rooted code`); return;
  }
  throw new Error(`${code}: expected rooted rejection`);
}
function expectDerivedError(code: string, effect: () => unknown): void {
  try { effect(); } catch (error) {
    assert(error instanceof StructuralDerivedDerivationReplayError, `${code}: wrong derived error`);
    same(error.code, code, `${code}: derived code`); return;
  }
  throw new Error(`${code}: expected derived rejection`);
}
function expectCrossScopeError(code: string, effect: () => unknown): void {
  try { effect(); } catch (error) {
    assert(error instanceof StructuralDerivedDerivationCrossScopeApplicationReplayError,
      `${code}: wrong cross-scope error`);
    same(error.code, code, `${code}: cross-scope code`); return;
  }
  throw new Error(`${code}: expected cross-scope rejection`);
}
function expectRuleError(code: string, effect: () => unknown): void {
  try { effect(); } catch (error) {
    assert(error instanceof StructuralRuleError, `${code}: wrong structural-rule error`);
    same(error.code, code, `${code}: structural-rule code`); return;
  }
  throw new Error(`${code}: expected structural-rule rejection`);
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
  memory: Memory, theory: LinkHandle, dictionary: LinkHandle,
  premise: LinkHandle, conclusion: LinkHandle,
): PrimitiveFixture {
  const rule = defineStructuralRule(memory, dictionary, conclusion);
  const derivationRule = defineStructuralDerivationRule(memory, rule, [premise]);
  const ruleAdmission = admitStructuralRule(memory, theory, rule);
  const derivationAdmission = admitStructuralDerivationRule(memory, theory, derivationRule);
  const identity = memory.ensure(derivationRule, theory);
  const assumption = Object.freeze({ occurrence: memory.ensure(premise, identity), template: premise });
  const premiseSequence = materializeExactSequence(memory, [assumption.occurrence]);
  const targetOccurrence = memory.ensure(derivationRule, premiseSequence);
  return Object.freeze({
    dictionary, rule, derivationRule, ruleAdmission, derivationAdmission,
    evidence: Object.freeze({
      identity, targetOccurrence, assumptions: Object.freeze([assumption]),
      nodes: Object.freeze([Object.freeze({
        occurrence: targetOccurrence, derivationRule, ruleAdmission,
        derivationRuleAdmission: derivationAdmission,
        premiseOccurrenceSequence: premiseSequence,
      })]),
    }),
  });
}
function targetFixture(
  memory: Memory, theory: LinkHandle, dictionary: LinkHandle,
  premise: LinkHandle, conclusion: LinkHandle,
): TargetFixture {
  const rule = defineStructuralRule(memory, dictionary, conclusion);
  const derivationRule = defineStructuralDerivationRule(memory, rule, [premise]);
  return Object.freeze({ rule, derivationRule, identity: memory.ensure(derivationRule, theory) });
}
function morphism(
  memory: Memory, theory: LinkHandle, sourceDictionary: LinkHandle,
  targetDictionary: LinkHandle,
  bindings: readonly (readonly [LinkHandle, LinkHandle])[],
): LinkHandle {
  const entries = bindings.map(([sourceRole, targetRole]) => memory.ensure(sourceRole, targetRole));
  return materializeExactSequence(memory, [
    theory, sourceDictionary, targetDictionary, materializeExactSequence(memory, entries),
  ]);
}
function rootedPrimitiveRoot(
  memory: Memory, theory: LinkHandle, primitiveDerivationRule: LinkHandle,
  premiseClaim: LinkHandle, conclusionClaim: LinkHandle,
): LinkHandle {
  const targetDictionary = defineStructuralRoleDictionary(memory, []);
  const targetRule = defineStructuralRule(memory, targetDictionary, conclusionClaim);
  const targetDerivationRule = defineStructuralDerivationRule(memory, targetRule, [premiseClaim]);
  const targetIdentity = memory.ensure(targetDerivationRule, theory);
  const assumption = memory.ensure(premiseClaim, targetIdentity);
  const application = memory.ensure(
    primitiveDerivationRule, materializeExactSequence(memory, [assumption]),
  );
  return memory.ensure(targetIdentity, memory.ensure(conclusionClaim, application));
}

function confirmSharedDictionaryInformationLoss(): void {
  const memory = new Memory();
  const { R, O, C, L, U } = ensureRootBasis(memory);
  let cursor = memory.ensure(U, R);
  const fresh = (): LinkHandle => (cursor = memory.ensure(cursor, R));
  const theory = fresh();
  const A = memory.ensure(L, R), B = memory.ensure(R, L), CRole = memory.ensure(R, U);
  const a = memory.ensure(O, fresh()), b = memory.ensure(C, fresh());
  const globalDictionary = defineStructuralRoleDictionary(memory, [A, B, CRole]);
  const sharedR1 = primitiveFixture(memory, theory, globalDictionary, A, B);
  const root = rootedPrimitiveRoot(memory, theory, sharedR1.derivationRule, a, b);
  const before = memory.linkCount;
  expectRootedError("template-mismatch", () => replayStructuralRootedProofAset(memory, root));
  same(memory.linkCount, before, "shared rejection read-only");
}

async function main(): Promise<void> {
  // D1 is isolated: its global primitive admissions cannot contaminate D2.
  confirmSharedDictionaryInformationLoss();
  console.log("SHARED_DICTIONARY_V1_INFORMATION_LOSS = CONFIRMED");

  const memory = new Memory();
  const { R, O, C, L, U } = ensureRootBasis(memory);
  let cursor = memory.ensure(U, R);
  const fresh = (): LinkHandle => (cursor = memory.ensure(cursor, R));
  const theory = fresh();
  const A = memory.ensure(L, R), B = memory.ensure(R, L), CRole = memory.ensure(R, U);
  const a = memory.ensure(O, fresh()), b = memory.ensure(C, fresh()), c = memory.ensure(L, fresh());
  const globalDictionary = defineStructuralRoleDictionary(memory, [A, B, CRole]);
  const localAB = defineStructuralRoleDictionary(memory, [A, B]);
  const localBC = defineStructuralRoleDictionary(memory, [B, CRole]);

  // D2a: local primitive ownership removes the invisible-role loss.
  const localR1 = primitiveFixture(memory, theory, localAB, A, B);
  const localR2 = primitiveFixture(memory, theory, localBC, B, CRole);
  const localR1Root = rootedPrimitiveRoot(memory, theory, localR1.derivationRule, a, b);
  const beforeR1 = memory.linkCount;
  same(replayStructuralRootedProofAset(memory, localR1Root).conclusion, b, "local R1 conclusion");
  same(memory.linkCount, beforeR1, "local R1 read-only");
  const localR2Root = rootedPrimitiveRoot(memory, theory, localR2.derivationRule, b, c);
  const beforeR2 = memory.linkCount;
  same(replayStructuralRootedProofAset(memory, localR2Root).conclusion, c, "local R2 conclusion");
  same(memory.linkCount, beforeR2, "local R2 read-only");
  console.log("LOCAL_PRIMITIVE_ROOTED_V1_COMPLETE_RHO = SUPPORTED");

  // Incomplete local rho and inconsistent visible rho still fail closed.
  const incomplete = primitiveFixture(memory, theory, localAB, A, A);
  const incompleteRoot = rootedPrimitiveRoot(memory, theory, incomplete.derivationRule, a, a);
  expectRootedError("template-mismatch", () => replayStructuralRootedProofAset(memory, incompleteRoot));
  const localA = defineStructuralRoleDictionary(memory, [A]);
  const inconsistent = primitiveFixture(memory, theory, localA, A, A);
  const inconsistentRoot = rootedPrimitiveRoot(memory, theory, inconsistent.derivationRule, a, b);
  expectRootedError("template-mismatch", () => replayStructuralRootedProofAset(memory, inconsistentRoot));
  same(replayStructuralRootedProofAset(memory, localR1Root).conclusion, b,
    "unreachable other proof occurrences grant zero authority");

  // D2b: both local schemas map successfully into the enclosing global scope.
  const globalR1 = targetFixture(memory, theory, globalDictionary, A, B);
  const globalR2 = targetFixture(memory, theory, globalDictionary, B, CRole);
  const mu1 = morphism(memory, theory, localAB, globalDictionary, [[A, A], [B, B]]);
  const mu2 = morphism(memory, theory, localBC, globalDictionary, [[B, B], [CRole, CRole]]);
  const beforeMu = memory.linkCount;
  replayStructuralDerivedDerivationCrossScopeApplication(memory,
    { source: localR1.evidence, morphism: mu1, targetIdentity: globalR1.identity });
  replayStructuralDerivedDerivationCrossScopeApplication(memory,
    { source: localR2.evidence, morphism: mu2, targetIdentity: globalR2.identity });
  same(memory.linkCount, beforeMu, "accepted mu replay read-only");
  console.log("LOCAL_TO_GLOBAL_MU_REPLAY = SUPPORTED");

  // Required mu negatives, including host metadata having zero authority.
  const partialMu = morphism(memory, theory, localAB, globalDictionary, [[A, A]]);
  const hostMu = new Map<LinkHandle, LinkHandle>([[A, A], [B, B]]);
  same(hostMu.get(B), B, "host map contains missing coordinate but grants no authority");
  expectCrossScopeError("missing-source-role", () =>
    replayStructuralDerivedDerivationCrossScopeApplication(memory,
      { source: localR1.evidence, morphism: partialMu, targetIdentity: globalR1.identity }));
  const foreign = fresh();
  const foreignMu = morphism(memory, theory, localAB, globalDictionary, [[A, A], [B, foreign]]);
  expectCrossScopeError("target-role-not-member", () =>
    replayStructuralDerivedDerivationCrossScopeApplication(memory,
      { source: localR1.evidence, morphism: foreignMu, targetIdentity: globalR1.identity }));
  const wrongTheoryMu = morphism(memory, fresh(), localAB, globalDictionary, [[A, A], [B, B]]);
  expectCrossScopeError("theory-mismatch", () =>
    replayStructuralDerivedDerivationCrossScopeApplication(memory,
      { source: localR1.evidence, morphism: wrongTheoryMu, targetIdentity: globalR1.identity }));
  const capturePremise = memory.ensure(CRole, A);
  const captureSource = primitiveFixture(memory, theory, localAB, capturePremise, B);
  const captureTarget = targetFixture(memory, theory, globalDictionary, capturePremise, B);
  const captureMu = morphism(memory, theory, localAB, globalDictionary, [[A, A], [B, B]]);
  expectCrossScopeError("grounded-target-role-capture", () =>
    replayStructuralDerivedDerivationCrossScopeApplication(memory,
      { source: captureSource.evidence, morphism: captureMu, targetIdentity: captureTarget.identity }));

  // D2c: mapped identities still cannot act as primitive nodes of a larger
  // global derived proof merely because mu replay succeeded.
  assert(memory.find(theory, globalR1.rule) === undefined, "global R1 rule stays unadmitted");
  assert(memory.find(theory, globalR2.rule) === undefined, "global R2 rule stays unadmitted");
  const composedRule = defineStructuralRule(memory, globalDictionary, CRole);
  const composedDR = defineStructuralDerivationRule(memory, composedRule, [A]);
  const composedIdentity = memory.ensure(composedDR, theory);
  const composedAssumption = Object.freeze({
    occurrence: memory.ensure(A, composedIdentity), template: A,
  });
  const r1Premises = materializeExactSequence(memory, [composedAssumption.occurrence]);
  const r1Occurrence = memory.ensure(globalR1.derivationRule, r1Premises);
  const r2Premises = materializeExactSequence(memory, [r1Occurrence]);
  const r2Occurrence = memory.ensure(globalR2.derivationRule, r2Premises);
  const composedEvidence: StructuralDerivedDerivationEvidence = Object.freeze({
    identity: composedIdentity, targetOccurrence: r2Occurrence,
    assumptions: Object.freeze([composedAssumption]),
    nodes: Object.freeze([
      Object.freeze({
        occurrence: r1Occurrence, derivationRule: globalR1.derivationRule,
        ruleAdmission: localR1.ruleAdmission,
        derivationRuleAdmission: localR1.derivationAdmission,
        premiseOccurrenceSequence: r1Premises,
      }),
      Object.freeze({
        occurrence: r2Occurrence, derivationRule: globalR2.derivationRule,
        ruleAdmission: localR2.ruleAdmission,
        derivationRuleAdmission: localR2.derivationAdmission,
        premiseOccurrenceSequence: r2Premises,
      }),
    ]),
  });
  const beforeComposition = memory.linkCount;
  expectDerivedError("rule-not-admitted", () =>
    replayStructuralDerivedDerivationSchema(memory, composedEvidence));
  same(memory.linkCount, beforeComposition, "composition rejection read-only");
  console.log("GENERIC_ROOTED_COMPOSITION_GAP = rule-not-admitted");

  // D3: current Act meaning is incidence-sensitive. The exact same Act/evidence
  // fails with one declared field absent, then succeeds after only Act -> field.
  const interpreterDictionary = fresh(), grammar = fresh(), afterContext = fresh();
  const interpreter = defineStructuralInterpreter(memory, interpreterDictionary, grammar, theory);
  const actBody = memory.ensure(B, B);
  const actClaim = memory.ensure(b, b);
  const actRule = defineStructuralRule(memory, globalDictionary, actBody);
  const actRuleAdmission = admitStructuralRule(memory, theory, actRule);
  const act = defineActHeader(memory, interpreter, globalDictionary, afterContext);
  defineActField(memory, act, A, a);
  defineActField(memory, act, B, b);
  const actEvidence = Object.freeze({
    act, rule: actRule, ruleAdmission: actRuleAdmission, claimedBody: actClaim,
    expectedInterpreter: Object.freeze({ dictionary: interpreterDictionary, grammar, theory }),
    expectedAfterContext: afterContext,
  });
  const revisionBefore = await computePortableStructuralTheoryRevision(
    exportPortableStructuralTheory(memory, theory));
  const beforeMissing = memory.linkCount;
  expectRuleError("missing-role-binding", () => replayStructuralRule(memory, actEvidence));
  same(memory.linkCount, beforeMissing, "missing Act field rejection read-only");
  defineActField(memory, act, CRole, c);
  const beforeComplete = memory.linkCount;
  const actReplay = replayStructuralRule(memory, actEvidence);
  same(actReplay.act ?? act, act, "same Act remains authority carrier");
  same(memory.linkCount, beforeComplete, "complete Act replay read-only");
  const revisionAfter = await computePortableStructuralTheoryRevision(
    exportPortableStructuralTheory(memory, theory));
  same(revisionAfter.scheme, revisionBefore.scheme, "Theory revision scheme unchanged");
  same(revisionAfter.value, revisionBefore.value, "exact Theory revision unchanged");

  console.log("C. DIFFERENT_GENERIC_ROOTED_COMPOSITION_GAP");
  console.log("ACT_FIELDS_REQUIRE_EXPLICIT_CANONICAL_INCIDENCE_CLOSURE");
  console.log("required negative controls = REJECTED");
  console.log("exact Theory revision unchanged = SUPPORTED");
  console.log("accepted semantic delta = NONE");
}

void main();
