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
  StructuralDerivedDerivationReplayError,
  replayStructuralDerivedDerivationSchema,
  type StructuralDerivedDerivationEvidence,
} from "../src/derived-derivation-schema.js";
import {
  replayStructuralDerivedDerivationSpecialization,
  type StructuralDerivedDerivationSpecializationEvidence,
} from "../src/derived-derivation-specialization.js";
import {
  StructuralClosureApplicationReplayError,
  replayStructuralClosureApplication,
} from "../src/derived-derivation-closure.js";
import { exportPortableStructuralTheory } from "../src/portable-theory.js";
import { computePortableStructuralTheoryRevision } from "../src/portable-theory-digest.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`proof-Aset L0 falsifier: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

function expectSchemaError(code: string, effect: () => unknown): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof StructuralDerivedDerivationReplayError, `${code}: wrong schema error type`);
    same(error.code, code, `${code}: wrong schema error code`);
    return;
  }
  throw new Error(`${code}: expected schema rejection`);
}

function expectClosureError(code: string, effect: () => unknown): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof StructuralClosureApplicationReplayError, `${code}: wrong closure error type`);
    same(error.code, code, `${code}: wrong closure error code`);
    return;
  }
  throw new Error(`${code}: expected closure rejection`);
}

interface GenericFixture {
  readonly derivationRule: LinkHandle;
  readonly identity: LinkHandle;
  readonly evidence: StructuralDerivedDerivationEvidence;
}

interface TargetFixture {
  readonly derivationRule: LinkHandle;
  readonly identity: LinkHandle;
  readonly assumptions: readonly { readonly occurrence: LinkHandle; readonly template: LinkHandle }[];
  readonly targetOccurrence: LinkHandle;
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
    Object.freeze({ occurrence: memory.ensure(template, identity), template }));
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
      nodes: Object.freeze([Object.freeze({
        occurrence: targetOccurrence,
        derivationRule,
        ruleAdmission,
        derivationRuleAdmission,
        premiseOccurrenceSequence,
      })]),
    }),
  });
}

function specializationTarget(
  memory: Memory,
  theory: LinkHandle,
  dictionary: LinkHandle,
  premises: readonly LinkHandle[],
  conclusion: LinkHandle,
): TargetFixture {
  const rule = defineStructuralRule(memory, dictionary, conclusion);
  const derivationRule = defineStructuralDerivationRule(memory, rule, premises);
  const identity = memory.ensure(derivationRule, theory);
  const occurrenceByTemplate = new Map<LinkHandle, LinkHandle>();
  const assumptions: { readonly occurrence: LinkHandle; readonly template: LinkHandle }[] = [];
  for (const template of premises) {
    if (occurrenceByTemplate.has(template)) continue;
    const occurrence = memory.ensure(template, identity);
    occurrenceByTemplate.set(template, occurrence);
    assumptions.push(Object.freeze({ occurrence, template }));
  }
  const slots = premises.map((template) => {
    const occurrence = occurrenceByTemplate.get(template);
    assert(occurrence !== undefined, "target slot occurrence missing");
    return occurrence;
  });
  return Object.freeze({
    derivationRule,
    identity,
    assumptions: Object.freeze(assumptions),
    targetOccurrence: memory.ensure(
      derivationRule,
      materializeExactSequence(memory, slots),
    ),
  });
}

function specializationCarrier(
  memory: Memory,
  theory: LinkHandle,
  sourceDictionary: LinkHandle,
  targetDictionary: LinkHandle,
  roleBindings: readonly (readonly [LinkHandle, LinkHandle])[],
  groundBindings: readonly (readonly [LinkHandle, LinkHandle])[],
): LinkHandle {
  const partition = (bindings: readonly (readonly [LinkHandle, LinkHandle])[]) =>
    materializeExactSequence(
      memory,
      bindings.map(([source, value]) => memory.ensure(source, value)),
    );
  return materializeExactSequence(memory, [
    theory,
    sourceDictionary,
    targetDictionary,
    partition(roleBindings),
    partition(groundBindings),
  ]);
}

function specializationEvidence(
  source: StructuralDerivedDerivationEvidence,
  specialization: LinkHandle,
  target: TargetFixture,
): StructuralDerivedDerivationSpecializationEvidence {
  return Object.freeze({
    source,
    specialization,
    targetIdentity: target.identity,
    targetAssumptions: target.assumptions,
    targetOccurrence: target.targetOccurrence,
  });
}

function unadmittedTargetEvidence(target: TargetFixture): StructuralDerivedDerivationEvidence {
  return Object.freeze({
    identity: target.identity,
    targetOccurrence: target.targetOccurrence,
    assumptions: target.assumptions,
    nodes: Object.freeze([]),
  });
}

function resultIdentity(
  memory: Memory,
  theory: LinkHandle,
  dictionary: LinkHandle,
  premises: readonly LinkHandle[],
  conclusion: LinkHandle,
): { readonly derivationRule: LinkHandle; readonly identity: LinkHandle } {
  const rule = defineStructuralRule(memory, dictionary, conclusion);
  admitStructuralRule(memory, theory, rule);
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
  return materializeExactSequence(memory, [
    theory,
    sourceDictionary,
    targetDictionary,
    materializeExactSequence(
      memory,
      bindings.map(([source, target]) => memory.ensure(source, target)),
    ),
  ]);
}

function grounding(
  memory: Memory,
  theory: LinkHandle,
  sourceDictionary: LinkHandle,
  generator: LinkHandle,
  sourceRole: LinkHandle,
): LinkHandle {
  return materializeExactSequence(memory, [
    theory,
    sourceDictionary,
    generator,
    materializeExactSequence(memory, [memory.ensure(sourceRole, generator)]),
  ]);
}

/**
 * Materialize the coordinates of an existing strict proof as an MTS Aset root.
 * The host evidence arrays remain traversal projections only; the carrier itself
 * contains exact proof identities/occurrences and is ordinary MTS Link data.
 */
function proofAsetCarrier(memory: Memory, evidence: StructuralDerivedDerivationEvidence): LinkHandle {
  return materializeExactSequence(memory, [
    evidence.identity,
    evidence.targetOccurrence,
    materializeExactSequence(memory, evidence.assumptions.map(({ occurrence }) => occurrence)),
    materializeExactSequence(memory, evidence.nodes.map(({ occurrence }) => occurrence)),
  ]);
}

/**
 * Specialization is represented here as another Aset topology, not a host proof
 * authority kind. Every coordinate is an exact MTS Link already checked by the
 * existing specialization replay.
 */
function specializationProofAsetCarrier(
  memory: Memory,
  evidence: StructuralDerivedDerivationSpecializationEvidence,
): LinkHandle {
  const sourceCarrier = proofAsetCarrier(memory, evidence.source);
  return materializeExactSequence(memory, [
    sourceCarrier,
    evidence.specialization,
    evidence.targetIdentity,
    materializeExactSequence(
      memory,
      evidence.targetAssumptions.map(({ occurrence }) => occurrence),
    ),
    evidence.targetOccurrence,
  ]);
}

async function main(): Promise<void> {
  const memory = new Memory();
  const { R, O, C, L, U } = ensureRootBasis(memory);
  let cursor = memory.ensure(U, R);
  const fresh = (): LinkHandle => (cursor = memory.ensure(cursor, R));
  const theory = memory.ensure(L, U);

  // Ground relation vocabulary before selecting generic Roles.
  const binaryContext = memory.ensure(O, C);
  const plusContext = memory.ensure(binaryContext, fresh());
  const s0Context = memory.ensure(binaryContext, fresh());
  const nat0Context = memory.ensure(C, fresh());
  const add = (a: LinkHandle, b: LinkHandle, c: LinkHandle): LinkHandle =>
    memory.ensure(memory.ensure(memory.ensure(plusContext, a), b), c);
  const s0 = (a: LinkHandle, b: LinkHandle): LinkHandle =>
    memory.ensure(memory.ensure(s0Context, a), b);
  const nat0 = (value: LinkHandle): LinkHandle => memory.ensure(nat0Context, value);

  const a = fresh(), b = fresh(), c = fresh(), b1 = fresh(), c1 = fresh();
  const n = fresh(), n1 = fresh(), x = fresh(), x1 = fresh();
  same(new Set([a, b, c, b1, c1, n, n1, x, x1, U]).size, 10,
    "L0 and closure coordinates remain distinct");

  const dBaseSource = defineStructuralRoleDictionary(memory, [a]);
  const dAddSource = defineStructuralRoleDictionary(memory, [a, b, c, b1, c1]);
  const dBase = defineStructuralRoleDictionary(memory, []);
  const dStep = defineStructuralRoleDictionary(memory, [n, n1]);
  const dResult = defineStructuralRoleDictionary(memory, [n]);
  const dAuthority = defineStructuralRoleDictionary(memory, [x, x1]);

  const sourceBase = admittedGeneric(memory, theory, dBaseSource, [], add(a, U, a));
  const sourceStep = admittedGeneric(memory, theory, dAddSource, [
    add(a, b, c),
    s0(b, b1),
    s0(c, c1),
  ], add(a, b1, c1));
  same(
    replayStructuralDerivedDerivationSchema(memory, sourceBase.evidence).conclusionTemplate,
    add(a, U, a),
    "source Add base proof Aset replay",
  );
  same(
    replayStructuralDerivedDerivationSchema(memory, sourceStep.evidence).conclusionTemplate,
    add(a, b1, c1),
    "source Add recursion proof Aset replay",
  );

  const addUUU = add(U, U, U);
  const l0Current = add(U, n, n);
  const l0S0 = s0(n, n1);
  const l0Next = add(U, n1, n1);

  const baseTarget = specializationTarget(memory, theory, dBase, [], addUUU);
  const baseSpecialization = specializationCarrier(
    memory,
    theory,
    dBaseSource,
    dBase,
    [],
    [[a, U]],
  );
  const baseEvidence = specializationEvidence(sourceBase.evidence, baseSpecialization, baseTarget);
  const baseReplay = replayStructuralDerivedDerivationSpecialization(memory, baseEvidence);
  same(baseReplay.targetConclusionTemplate, addUUU, "L0 BASE specialization conclusion");
  same(baseReplay.targetAssumptionCount, 0, "L0 BASE semantic assumptions");
  same(baseReplay.premiseSlotCount, 0, "L0 BASE structural slots");

  const stepTarget = specializationTarget(
    memory,
    theory,
    dStep,
    [l0Current, l0S0, l0S0],
    l0Next,
  );
  const stepSpecialization = specializationCarrier(
    memory,
    theory,
    dAddSource,
    dStep,
    [[b, n], [c, n], [b1, n1], [c1, n1]],
    [[a, U]],
  );
  const stepEvidence = specializationEvidence(sourceStep.evidence, stepSpecialization, stepTarget);
  const stepReplay = replayStructuralDerivedDerivationSpecialization(memory, stepEvidence);
  same(stepReplay.targetConclusionTemplate, l0Next, "L0 STEP specialization conclusion");
  same(stepReplay.targetAssumptionCount, 2, "L0 STEP semantic assumptions");
  same(stepReplay.premiseSlotCount, 3, "L0 STEP structural slots");

  const stepSlots = readExactSequence(
    memory,
    memory.poles(stepTarget.targetOccurrence).end,
  ).values;
  same(stepSlots.length, 3, "L0 STEP slot sequence length");
  same(new Set(stepSlots).size, 2, "L0 STEP unique proved occurrences");
  same(stepSlots[1], stepSlots[2], "L0 STEP exact S0 occurrence reused by two slots");

  // Materialize BASE/STEP specialization evidence as proof-Aset topology.
  const baseProofAset = specializationProofAsetCarrier(memory, baseEvidence);
  const stepProofAset = specializationProofAsetCarrier(memory, stepEvidence);
  const baseCoordinates = readExactSequence(memory, baseProofAset).values;
  const stepCoordinates = readExactSequence(memory, stepProofAset).values;
  same(baseCoordinates.length, 5, "BASE specialization proof-Aset coordinates");
  same(stepCoordinates.length, 5, "STEP specialization proof-Aset coordinates");
  same(baseCoordinates[2], baseTarget.identity, "BASE proof-Aset target identity");
  same(stepCoordinates[2], stepTarget.identity, "STEP proof-Aset target identity");
  same(baseCoordinates[4], baseTarget.targetOccurrence, "BASE proof-Aset target occurrence");
  same(stepCoordinates[4], stepTarget.targetOccurrence, "STEP proof-Aset target occurrence");

  assert(memory.find(theory, baseTarget.derivationRule) === undefined,
    "BASE specialized DR remains outside primitive Theory authority");
  assert(memory.find(theory, stepTarget.derivationRule) === undefined,
    "STEP specialized DR remains outside primitive Theory authority");

  // Real Nat0 least-closure authority and L0 RESULT coordinates.
  const authority = materializeExactSequence(memory, [
    theory,
    dAuthority,
    U,
    nat0(U),
    nat0(x),
    s0(x, x1),
    nat0(x1),
  ]);
  const authorityAdmission = memory.ensure(theory, authority);
  const result = resultIdentity(memory, theory, dResult, [nat0(n)], l0Current);
  const authorityMorphism = morphism(
    memory,
    theory,
    dAuthority,
    dStep,
    [[x, n], [x1, n1]],
  );
  const currentMorphism = morphism(memory, theory, dResult, dStep, [[n, n]]);
  const nextMorphism = morphism(memory, theory, dResult, dStep, [[n, n1]]);
  const baseGrounding = grounding(memory, theory, dResult, U, n);

  assert(memory.find(theory, result.derivationRule) === undefined,
    "L0 RESULT DR remains outside primitive Theory authority");

  // The complete L0 coordinates themselves fit in one ordinary MTS Aset root.
  // This is representation evidence only; it deliberately does not create a new
  // host closure-with-specializations verifier.
  const l0ProofAset = materializeExactSequence(memory, [
    authority,
    baseProofAset,
    stepProofAset,
    result.identity,
    authorityMorphism,
    currentMorphism,
    nextMorphism,
    baseGrounding,
  ]);
  const l0Coordinates = readExactSequence(memory, l0ProofAset).values;
  same(l0Coordinates.length, 8, "one L0 proof-Aset root coordinate count");
  same(l0Coordinates[1], baseProofAset, "one L0 proof Aset contains BASE sub-Aset");
  same(l0Coordinates[2], stepProofAset, "one L0 proof Aset contains STEP sub-Aset");

  // Current strict schema carrier still cannot consume either specialized proof
  // Aset: BASE has no primitive target node, while STEP additionally exposes the
  // 2-semantic-assumption / 3-slot restriction.
  const baseStrict = unadmittedTargetEvidence(baseTarget);
  const stepStrict = unadmittedTargetEvidence(stepTarget);
  expectSchemaError("target-occurrence-not-found", () =>
    replayStructuralDerivedDerivationSchema(memory, baseStrict));
  expectSchemaError("target-assumption-mismatch", () =>
    replayStructuralDerivedDerivationSchema(memory, stepStrict));

  const closureEvidence = Object.freeze({
    authority,
    authorityAdmission,
    base: baseStrict,
    step: stepStrict,
    resultIdentity: result.identity,
    authorityMorphism,
    currentMorphism,
    nextMorphism,
    baseGrounding,
  });

  const revisionBefore = await computePortableStructuralTheoryRevision(
    exportPortableStructuralTheory(memory, theory),
  );
  const beforeReplay = memory.linkCount;
  expectClosureError("invalid-base", () =>
    replayStructuralClosureApplication(memory, closureEvidence));
  same(memory.linkCount, beforeReplay, "L0 closure rejection read-only");
  const revisionAfter = await computePortableStructuralTheoryRevision(
    exportPortableStructuralTheory(memory, theory),
  );
  same(revisionAfter.scheme, revisionBefore.scheme, "L0 replay preserves Theory revision scheme");
  same(revisionAfter.value, revisionBefore.value, "L0 replay preserves exact Theory revision");

  assert(memory.find(theory, baseTarget.derivationRule) === undefined,
    "L0 probe does not promote BASE target DR");
  assert(memory.find(theory, stepTarget.derivationRule) === undefined,
    "L0 probe does not promote STEP target DR");
  assert(memory.find(theory, result.derivationRule) === undefined,
    "L0 probe does not promote RESULT target DR");

  console.log("L0 proof-Aset representation = SUPPORTED: BASE/STEP specialization Asets + closure coordinates fit one Aset");
  console.log("L0 first trusted consumer reject = invalid-base");
  console.log("classification = L0_PROOF_ASET_COMPOSITION_REPLAY_GAP_CONFIRMED");
  console.log("guarded-step weakening = NOT REACHED");
}

void main();
