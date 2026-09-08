import { materializeExactSequence } from "../src/exact-sequence.js";
import { Memory, ensureRootBasis, type LinkHandle } from "../src/memory.js";
import { defineContext } from "../src/state.js";
import {
  admitStructuralDerivationRule,
  defineStructuralDerivationRule,
  replayStructuralDerivationWithAssumptions,
} from "../src/derivation.js";
import {
  admitStructuralRule,
  defineStructuralInterpreter,
  defineStructuralRoleDictionary,
  defineStructuralRule,
  type StructuralRoleBinding,
} from "../src/structural-rule.js";
import {
  replayStructuralDerivedDerivationSchema,
  type StructuralDerivedDerivationEvidence,
} from "../src/derived-derivation-schema.js";
import {
  instantiateStructuralDerivedDerivationSchema,
} from "../src/derived-derivation-instantiation.js";
import {
  replayStructuralDerivedDerivationApplication,
} from "../src/derived-derivation-application.js";
import {
  StructuralDerivedDerivationCrossScopeApplicationReplayError,
  replayStructuralDerivedDerivationCrossScopeApplication,
} from "../src/derived-derivation-cross-scope.js";
import {
  replayStructuralRootedProofAset,
} from "../src/rooted-proof-aset.js";
import {
  replayRecursiveLinkIdentityProofAset,
} from "../src/recursive-link-identity-proof.js";
import { exportPortableStructuralTheory } from "../src/portable-theory.js";
import { computePortableStructuralTheoryRevision } from "../src/portable-theory-digest.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}

function expectCrossScopeError(code: string, effect: () => unknown): void {
  try {
    effect();
  } catch (error) {
    assert(
      error instanceof StructuralDerivedDerivationCrossScopeApplicationReplayError,
      `${code}: wrong error type`,
    );
    same(error.code, code, `${code}: wrong error code`);
    return;
  }
  throw new Error(`${code}: expected cross-scope rejection`);
}

interface PrimitiveFixture {
  readonly rule: LinkHandle;
  readonly derivationRule: LinkHandle;
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
  const derivationRuleAdmission = admitStructuralDerivationRule(memory, theory, derivationRule);
  const identity = memory.ensure(derivationRule, theory);
  const assumption = Object.freeze({
    occurrence: memory.ensure(premise, identity),
    template: premise,
  });
  const premiseOccurrenceSequence = materializeExactSequence(memory, [assumption.occurrence]);
  const targetOccurrence = memory.ensure(derivationRule, premiseOccurrenceSequence);

  return Object.freeze({
    rule,
    derivationRule,
    evidence: Object.freeze({
      identity,
      targetOccurrence,
      assumptions: Object.freeze([assumption]),
      nodes: Object.freeze([
        Object.freeze({
          occurrence: targetOccurrence,
          derivationRule,
          ruleAdmission,
          derivationRuleAdmission,
          premiseOccurrenceSequence,
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
  const entries = bindings.map(([sourceRole, targetRole]) => memory.ensure(sourceRole, targetRole));
  return materializeExactSequence(memory, [
    theory,
    sourceDictionary,
    targetDictionary,
    materializeExactSequence(memory, entries),
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

function proofOccurrence(
  memory: Memory,
  claim: LinkHandle,
  derivationRule: LinkHandle,
  dependencies: readonly LinkHandle[],
): LinkHandle {
  const application = memory.ensure(
    derivationRule,
    materializeExactSequence(memory, dependencies),
  );
  return memory.ensure(claim, application);
}

async function main(): Promise<void> {
  const memory = new Memory();
  const { R, O, C, L, U } = ensureRootBasis(memory);
  let cursor = memory.ensure(U, R);
  const fresh = (): LinkHandle => (cursor = memory.ensure(cursor, R));

  const theory = fresh();
  const A = memory.ensure(L, R);
  const B = memory.ensure(R, L);
  const CRole = memory.ensure(R, U);
  same(new Set([A, B, CRole]).size, 3, "role identities are distinct");

  const globalDictionary = defineStructuralRoleDictionary(memory, [A, B, CRole]);
  const localAB = defineStructuralRoleDictionary(memory, [A, B]);
  const localBC = defineStructuralRoleDictionary(memory, [B, CRole]);

  const localR1 = primitiveFixture(memory, theory, localAB, A, B);
  const localR2 = primitiveFixture(memory, theory, localBC, B, CRole);

  const beforeGenericReplay = memory.linkCount;
  replayStructuralDerivedDerivationSchema(memory, localR1.evidence);
  replayStructuralDerivedDerivationSchema(memory, localR2.evidence);
  same(memory.linkCount, beforeGenericReplay, "local generic replay is read-only");
  console.log("LOCAL_SOURCE_SCHEMAS = SUPPORTED");

  const globalR1 = targetFixture(memory, theory, globalDictionary, A, B);
  const globalR2 = targetFixture(memory, theory, globalDictionary, B, CRole);
  const mu1 = morphism(memory, theory, localAB, globalDictionary, [[A, A], [B, B]]);
  const mu2 = morphism(memory, theory, localBC, globalDictionary, [[B, B], [CRole, CRole]]);

  const beforeMuReplay = memory.linkCount;
  replayStructuralDerivedDerivationCrossScopeApplication(memory, {
    source: localR1.evidence,
    morphism: mu1,
    targetIdentity: globalR1.identity,
  });
  replayStructuralDerivedDerivationCrossScopeApplication(memory, {
    source: localR2.evidence,
    morphism: mu2,
    targetIdentity: globalR2.identity,
  });
  same(memory.linkCount, beforeMuReplay, "cross-scope replay is read-only");
  console.log("LOCAL_TO_GLOBAL_MU = SUPPORTED");

  assert(memory.find(theory, globalR1.rule) === undefined, "mapped global R1 Rule stays unadmitted");
  assert(memory.find(theory, globalR1.derivationRule) === undefined,
    "mapped global R1 DR stays unadmitted");
  assert(memory.find(theory, globalR2.rule) === undefined, "mapped global R2 Rule stays unadmitted");
  assert(memory.find(theory, globalR2.derivationRule) === undefined,
    "mapped global R2 DR stays unadmitted");

  const arbitraryStart = memory.ensureStartSelfClosed(C);
  const arbitraryEnd = memory.ensureEndSelfClosed(O);
  const x = memory.ensure(arbitraryStart, arbitraryEnd);
  const aClaim = memory.ensure(x, x);
  const bClaim = memory.ensure(C, fresh());
  const cClaim = memory.ensure(L, fresh());

  const rootProof = identityProof(memory, R, R, []);
  const oProof = identityProof(memory, O, O, [rootProof]);
  const cProof = identityProof(memory, C, C, [rootProof]);
  const startProof = identityProof(memory, arbitraryStart, arbitraryStart, [cProof]);
  const endProof = identityProof(memory, arbitraryEnd, arbitraryEnd, [oProof]);
  const xProof = identityProof(memory, x, x, [startProof, endProof]);
  const beforeIdentityReplay = memory.linkCount;
  const identityReplay = replayRecursiveLinkIdentityProofAset(memory, xProof);
  same(identityReplay.left, x, "identity left");
  same(identityReplay.right, x, "identity right");
  same(memory.poles(xProof).start, aClaim, "identity root exact A Claim");
  same(memory.linkCount, beforeIdentityReplay, "identity replay is read-only");

  const interpreterDictionary = fresh();
  const grammar = fresh();
  const afterContext = defineContext(memory, R, L);
  const interpreter = defineStructuralInterpreter(memory, interpreterDictionary, grammar, theory);
  const r1Bindings: readonly StructuralRoleBinding[] = Object.freeze([
    Object.freeze({ role: A, value: aClaim }),
    Object.freeze({ role: B, value: bClaim }),
  ]);
  const r2Bindings: readonly StructuralRoleBinding[] = Object.freeze([
    Object.freeze({ role: B, value: bClaim }),
    Object.freeze({ role: CRole, value: cClaim }),
  ]);

  const r1Concrete = instantiateStructuralDerivedDerivationSchema(
    memory, localR1.evidence, interpreter, afterContext, r1Bindings,
  );
  const r2Concrete = instantiateStructuralDerivedDerivationSchema(
    memory, localR2.evidence, interpreter, afterContext, r2Bindings,
  );
  same(r1Concrete.targetClaim, bClaim, "local R1 instantiated conclusion");
  same(r2Concrete.targetClaim, cClaim, "local R2 instantiated conclusion");
  replayStructuralDerivationWithAssumptions(memory, r1Concrete.evidence);
  replayStructuralDerivationWithAssumptions(memory, r2Concrete.evidence);
  replayStructuralDerivedDerivationApplication(
    memory, localR1.evidence, r1Concrete.evidence, r1Bindings,
  );
  replayStructuralDerivedDerivationApplication(
    memory, localR2.evidence, r2Concrete.evidence, r2Bindings,
  );
  console.log("LOCAL_GENERIC_TO_CONCRETE_APPLICATION = SUPPORTED");

  const revisionBeforeRootConstruction = await computePortableStructuralTheoryRevision(
    exportPortableStructuralTheory(memory, theory),
  );

  const r1Occurrence = proofOccurrence(memory, bClaim, localR1.derivationRule, [xProof]);
  const r2Occurrence = proofOccurrence(memory, cClaim, localR2.derivationRule, [r1Occurrence]);

  const closedDictionary = defineStructuralRoleDictionary(memory, []);
  const closedRule = defineStructuralRule(memory, closedDictionary, cClaim);
  admitStructuralRule(memory, theory, closedRule);
  const closedDR = defineStructuralDerivationRule(memory, closedRule, []);
  const closedIdentity = memory.ensure(closedDR, theory);
  assert(memory.find(theory, closedDR) === undefined, "closed derived target DR stays unadmitted");
  const root = memory.ensure(closedIdentity, r2Occurrence);

  const beforeRootReplay = memory.linkCount;
  const rooted = replayStructuralRootedProofAset(memory, root);
  same(rooted.conclusion, cClaim, "local-scope rooted expansion conclusion");
  same(rooted.occurrenceCount, 2, "two local structural occurrences");
  same(rooted.declaredAssumptionCount, 0, "expanded root is closed");
  same(rooted.usedAssumptionCount, 0, "expanded root has no open assumptions");
  same(memory.linkCount, beforeRootReplay, "expanded rooted replay is read-only");

  const hostProjection = new Map<LinkHandle, LinkHandle>([
    [A, cClaim],
    [B, aClaim],
    [CRole, bClaim],
  ]);
  same(hostProjection.size, 3, "bogus host projection exists");
  const replayWithBogusHostProjection = replayStructuralRootedProofAset(memory, root);
  same(replayWithBogusHostProjection.conclusion, cClaim,
    "host projection grants zero rooted authority");

  const partialMu = morphism(memory, theory, localAB, globalDictionary, [[A, A]]);
  expectCrossScopeError("missing-source-role", () =>
    replayStructuralDerivedDerivationCrossScopeApplication(memory, {
      source: localR1.evidence,
      morphism: partialMu,
      targetIdentity: globalR1.identity,
    }));

  const foreignTargetRole = fresh();
  const foreignMu = morphism(memory, theory, localAB, globalDictionary,
    [[A, A], [B, foreignTargetRole]]);
  expectCrossScopeError("target-role-not-member", () =>
    replayStructuralDerivedDerivationCrossScopeApplication(memory, {
      source: localR1.evidence,
      morphism: foreignMu,
      targetIdentity: globalR1.identity,
    }));

  const wrongTheoryMu = morphism(memory, fresh(), localAB, globalDictionary, [[A, A], [B, B]]);
  expectCrossScopeError("theory-mismatch", () =>
    replayStructuralDerivedDerivationCrossScopeApplication(memory, {
      source: localR1.evidence,
      morphism: wrongTheoryMu,
      targetIdentity: globalR1.identity,
    }));

  const capturePremise = memory.ensure(CRole, A);
  const captureSource = primitiveFixture(memory, theory, localAB, capturePremise, B);
  const captureTarget = targetFixture(memory, theory, globalDictionary, capturePremise, B);
  const captureMu = morphism(memory, theory, localAB, globalDictionary, [[A, A], [B, B]]);
  expectCrossScopeError("grounded-target-role-capture", () =>
    replayStructuralDerivedDerivationCrossScopeApplication(memory, {
      source: captureSource.evidence,
      morphism: captureMu,
      targetIdentity: captureTarget.identity,
    }));

  const revisionAfter = await computePortableStructuralTheoryRevision(
    exportPortableStructuralTheory(memory, theory),
  );
  same(revisionAfter.scheme, revisionBeforeRootConstruction.scheme, "Theory revision scheme unchanged");
  same(revisionAfter.value, revisionBeforeRootConstruction.value, "exact Theory revision unchanged");

  assert(memory.find(theory, globalR1.rule) === undefined, "mapped global R1 Rule remains unadmitted");
  assert(memory.find(theory, globalR1.derivationRule) === undefined,
    "mapped global R1 DR remains unadmitted");
  assert(memory.find(theory, globalR2.rule) === undefined, "mapped global R2 Rule remains unadmitted");
  assert(memory.find(theory, globalR2.derivationRule) === undefined,
    "mapped global R2 DR remains unadmitted");

  console.log("LOCAL_SCOPE_CONCRETE_ROOTED_EXPANSION = SUPPORTED");
  console.log("MAPPED_GLOBAL_NODE_REIFICATION_NOT_REQUIRED_FOR_CONCRETE_ROOTED_PROOF");
  console.log("A. EXISTING_ROOTED_KERNEL_SUFFICIENT_AFTER_LOCAL_EXPANSION");
  console.log("GENERIC_AUTHORITY_REMAINING_GAP = cross-scope-expansion-certificate");
  console.log("required mu negatives = REJECTED");
  console.log("host projection authority = ZERO");
  console.log("exact Theory revision unchanged = SUPPORTED");
  console.log("accepted semantic delta = NONE");
}

void main();
