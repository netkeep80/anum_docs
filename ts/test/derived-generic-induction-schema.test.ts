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
  StructuralDerivedDerivationReplayError,
  replayStructuralDerivedDerivationSchema,
  type StructuralDerivedDerivationEvidence,
} from "../src/derived-derivation-schema.js";
import {
  StructuralDerivedDerivationCrossScopeApplicationReplayError,
  replayStructuralDerivedDerivationCrossScopeApplication,
} from "../src/derived-derivation-cross-scope.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

function expectDerivedError(code: string, effect: () => unknown): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof StructuralDerivedDerivationReplayError, `${code}: wrong error type`);
    same(error.code, code, `${code}: wrong error code`);
    return;
  }
  throw new Error(`${code}: expected StructuralDerivedDerivationReplayError`);
}

function expectCrossError(code: string, effect: () => unknown): void {
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
  throw new Error(`${code}: expected cross-scope error`);
}

interface GenericFixture {
  readonly derivationRule: LinkHandle;
  readonly identity: LinkHandle;
  readonly evidence: StructuralDerivedDerivationEvidence;
}

function admittedGeneric(
  memory: Memory,
  theory: LinkHandle,
  dictionary: LinkHandle,
  premises: readonly LinkHandle[],
  conclusion: LinkHandle,
): GenericFixture {
  const rule = defineStructuralRule(memory, dictionary, conclusion);
  const derivationRule = defineStructuralDerivationRule(memory, rule, premises);
  const ruleAdmission = admitStructuralRule(memory, theory, rule);
  const derivationRuleAdmission = admitStructuralDerivationRule(memory, theory, derivationRule);
  const identity = memory.ensure(derivationRule, theory);
  const assumptions = premises.map((template) =>
    Object.freeze({ occurrence: memory.ensure(template, identity), template }),
  );
  const premiseOccurrenceSequence = materializeExactSequence(
    memory,
    assumptions.map(({ occurrence }) => occurrence),
  );
  const targetOccurrence = memory.ensure(derivationRule, premiseOccurrenceSequence);
  return Object.freeze({
    derivationRule,
    identity,
    evidence: Object.freeze({
      identity,
      targetOccurrence,
      assumptions: Object.freeze(assumptions),
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

function unadmittedCandidate(
  memory: Memory,
  theory: LinkHandle,
  dictionary: LinkHandle,
  premises: readonly LinkHandle[],
  conclusion: LinkHandle,
): GenericFixture {
  const rule = defineStructuralRule(memory, dictionary, conclusion);
  const derivationRule = defineStructuralDerivationRule(memory, rule, premises);
  const ruleAdmission = admitStructuralRule(memory, theory, rule);
  const identity = memory.ensure(derivationRule, theory);
  const assumptions = premises.map((template) =>
    Object.freeze({ occurrence: memory.ensure(template, identity), template }),
  );
  const premiseOccurrenceSequence = materializeExactSequence(
    memory,
    assumptions.map(({ occurrence }) => occurrence),
  );
  const targetOccurrence = memory.ensure(derivationRule, premiseOccurrenceSequence);
  return Object.freeze({
    derivationRule,
    identity,
    evidence: Object.freeze({
      identity,
      targetOccurrence,
      assumptions: Object.freeze(assumptions),
      nodes: Object.freeze([
        Object.freeze({
          occurrence: targetOccurrence,
          derivationRule,
          ruleAdmission,
          // DR -> Theory is proof/schema identity, not primitive Theory -> DR authority.
          derivationRuleAdmission: identity,
          premiseOccurrenceSequence,
        }),
      ]),
    }),
  });
}

function targetIdentity(
  memory: Memory,
  theory: LinkHandle,
  dictionary: LinkHandle,
  premises: readonly LinkHandle[],
  conclusion: LinkHandle,
): { readonly derivationRule: LinkHandle; readonly identity: LinkHandle } {
  const rule = defineStructuralRule(memory, dictionary, conclusion);
  const derivationRule = defineStructuralDerivationRule(memory, rule, premises);
  return Object.freeze({ derivationRule, identity: memory.ensure(derivationRule, theory) });
}

function morphism(
  memory: Memory,
  theory: LinkHandle,
  sourceDictionary: LinkHandle,
  targetDictionary: LinkHandle,
  bindings: readonly (readonly [LinkHandle, LinkHandle])[],
): LinkHandle {
  const entries = bindings.map(([source, target]) => memory.ensure(source, target));
  return materializeExactSequence(memory, [
    theory,
    sourceDictionary,
    targetDictionary,
    materializeExactSequence(memory, entries),
  ]);
}

function main(): void {
  const memory = new Memory();
  const { R, O, C, L, U } = ensureRootBasis(memory);

  // Exact selected arithmetic Theory identity. All primitive controls are fixed
  // before the candidate induction result is created.
  const theory = memory.ensure(C, U);
  const foreignTheory = memory.ensure(U, C);

  // P is the selected claim-context Role; no host Predicate/Lambda exists.
  const pRole = memory.ensure(L, R);
  const nRole = memory.ensure(R, L);
  const n1Role = memory.ensure(R, U);
  same(new Set([pRole, nRole, n1Role]).size, 3, "induction Roles are exact Links");

  const dBase = defineStructuralRoleDictionary(memory, [pRole]);
  const dResult = defineStructuralRoleDictionary(memory, [pRole, nRole]);
  const dStep = defineStructuralRoleDictionary(memory, [pRole, nRole, n1Role]);
  const dNatStep = defineStructuralRoleDictionary(memory, [nRole, n1Role]);
  const dGround = defineStructuralRoleDictionary(memory, []);

  // Grounded contextual domain vocabulary. The host never inspects a degree to
  // infer Nat0 membership.
  const nat0Context = memory.ensure(O, C);
  const succContext = memory.ensure(C, O);
  const nat0 = (x: LinkHandle): LinkHandle => memory.ensure(nat0Context, x);
  const succ = (x: LinkHandle, y: LinkHandle): LinkHandle =>
    memory.ensure(memory.ensure(succContext, x), y);
  const p = (x: LinkHandle): LinkHandle => memory.ensure(pRole, x);

  const natU = nat0(U);
  const natN = nat0(nRole);
  const natN1 = nat0(n1Role);
  const succNN1 = succ(nRole, n1Role);
  const pU = p(U);
  const pN = p(nRole);
  const pN1 = p(n1Role);

  // Explicit Nat0/S0 Theory controls consistent with #586: base and successor
  // closure are ordinary structural proof data, not host traversal.
  const natBase = admittedGeneric(memory, theory, dGround, [], natU);
  const natStep = admittedGeneric(memory, theory, dNatStep, [natN, succNN1], natN1);
  same(replayStructuralDerivedDerivationSchema(memory, natBase.evidence).conclusionTemplate, natU,
    "Nat0(U) control");
  same(replayStructuralDerivedDerivationSchema(memory, natStep.evidence).conclusionTemplate, natN1,
    "Nat0 successor-closure control");

  // BASE and STEP are independently replay-valid generic certificates. These are
  // controls for the induction premises; they do not authorize RESULT.
  const base = admittedGeneric(memory, theory, dBase, [], pU);
  const step = admittedGeneric(memory, theory, dStep, [natN, succNN1, pN], pN1);
  same(replayStructuralDerivedDerivationSchema(memory, base.evidence).conclusionTemplate, pU,
    "generic induction base control");
  same(replayStructuralDerivedDerivationSchema(memory, step.evidence).conclusionTemplate, pN1,
    "generic induction step control");

  // N2b itself is independently GREEN in the exact scope relation required by IND.
  const qContext = memory.ensure(O, U);
  const rContext = memory.ensure(C, L);
  const qN = memory.ensure(qContext, nRole);
  const rN = memory.ensure(rContext, nRole);
  const n2Source = admittedGeneric(memory, theory, dResult, [qN], rN);
  const n2Target = targetIdentity(memory, theory, dStep, [qN], rN);
  const muSame = morphism(memory, theory, dResult, dStep, [
    [pRole, pRole],
    [nRole, nRole],
  ]);
  const beforeN2 = memory.linkCount;
  const n2Replay = replayStructuralDerivedDerivationCrossScopeApplication(memory, {
    source: n2Source.evidence,
    morphism: muSame,
    targetIdentity: n2Target.identity,
  });
  same(n2Replay.targetDerivationRule, n2Target.derivationRule, "N2b control target");
  same(memory.linkCount, beforeN2, "N2b control is read-only");
  assert(memory.find(theory, n2Target.derivationRule) === undefined,
    "N2b control must not admit mapped target DR");

  // RESULT is structurally representable but deliberately not admitted:
  // Nat0(N) -> P[N]. Its StructuralRule shape may be known to Tnat, while its
  // new DerivationRule authority is absent.
  const result = unadmittedCandidate(memory, theory, dResult, [natN], pN);
  assert(memory.find(theory, result.derivationRule) === undefined,
    "induction RESULT DR must not be primitive Theory authority");
  expectDerivedError("derivation-rule-not-admitted", () =>
    replayStructuralDerivedDerivationSchema(memory, result.evidence),
  );

  // A not-yet-proved RESULT cannot become its own induction hypothesis merely by
  // mapping it into the richer step scope. N2b first replays its source evidence.
  const resultInStep = targetIdentity(memory, theory, dStep, [natN], pN);
  expectCrossError("invalid-source-schema", () =>
    replayStructuralDerivedDerivationCrossScopeApplication(memory, {
      source: result.evidence,
      morphism: muSame,
      targetIdentity: resultInStep.identity,
    }),
  );
  assert(memory.find(theory, resultInStep.derivationRule) === undefined,
    "failed IH transport must not admit target DR");

  // Host metadata and a finite MTS carrier of sample claims grant zero generic
  // proof authority. They leave the same exact RESULT rejection unchanged.
  const l2 = memory.ensure(L, L);
  const finiteSamples = materializeExactSequence(memory, [pU, p(L), p(l2)]);
  const decorated = {
    ...result.evidence,
    induction: true,
    finiteSamples,
    predicate: (_x: LinkHandle) => true,
  };
  expectDerivedError("derivation-rule-not-admitted", () =>
    replayStructuralDerivedDerivationSchema(memory, decorated),
  );

  // A Link that happens to be shaped like a generic-schema identity remains an
  // ordinary claim template in StructuralDerivationRule premises. Current replay
  // does not recursively verify a proof-carrying generic certificate merely from
  // that Link shape. This precisely exposes the proof-object/schema-premise gap.
  const marker = memory.ensure(O, R);
  const schemaAsClaim = admittedGeneric(memory, theory, dResult, [result.identity], marker);
  same(
    replayStructuralDerivedDerivationSchema(memory, schemaAsClaim.evidence).conclusionTemplate,
    marker,
    "schema-shaped Link is only an ordinary assumption claim",
  );
  expectDerivedError("derivation-rule-not-admitted", () =>
    replayStructuralDerivedDerivationSchema(memory, result.evidence),
  );

  // Dependency carriers are structurally bound into proof-occurrence identity.
  // A host attempt to retrofit recursive self-use is rejected before it can gain
  // authority; current honest evidence has no guarded-recursion representation.
  const recursiveControl = admittedGeneric(memory, theory, dResult, [pN], pN);
  const recursiveNode = recursiveControl.evidence.nodes[0];
  assert(recursiveNode !== undefined, "recursive control node");
  const recursiveSequence = materializeExactSequence(memory, [recursiveNode.occurrence]);
  expectDerivedError("occurrence-mismatch", () =>
    replayStructuralDerivedDerivationSchema(memory, {
      ...recursiveControl.evidence,
      nodes: [{ ...recursiveNode, premiseOccurrenceSequence: recursiveSequence }],
    }),
  );

  // Foreign/stronger Theory identity cannot rescue the candidate either.
  const foreignIdentity = memory.ensure(result.derivationRule, foreignTheory);
  expectDerivedError("derivation-rule-not-admitted", () =>
    replayStructuralDerivedDerivationSchema(memory, {
      ...result.evidence,
      identity: foreignIdentity,
    }),
  );

  // All required induction coordinates are representable as ordinary MTS data;
  // the missing piece is trusted composition/consumption of that proof data.
  const inductionCarrier = materializeExactSequence(memory, [
    theory,
    dBase,
    dResult,
    dStep,
    base.identity,
    step.identity,
    result.identity,
    muSame,
    nat0Context,
    succContext,
    U,
    pRole,
  ]);
  assert(memory.poles(inductionCarrier), "induction evidence carrier is an ordinary Link");

  const NAT0_INDUCTION_SCHEMA_EXPRESSIBLE_AS_THEORY_PROOF_DATA = false;
  const GENERIC_INDUCTION_SCHEMA_REPLAY_GAP = true;
  const OBSERVABLE_SEMANTIC_DELTA_REQUIRED = false;
  assert(!NAT0_INDUCTION_SCHEMA_EXPRESSIBLE_AS_THEORY_PROOF_DATA,
    "current proof calculus does not close RESULT");
  assert(GENERIC_INDUCTION_SCHEMA_REPLAY_GAP,
    "IND pressure is a proof-object/composition replay gap");
  assert(!OBSERVABLE_SEMANTIC_DELTA_REQUIRED,
    "all selected coordinates remain ordinary Links/Asets under v0.11");
}

main();
