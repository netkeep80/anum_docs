import { materializeExactSequence, readExactSequence } from "../src/exact-sequence.js";
import { Memory, ensureRootBasis, type LinkHandle } from "../src/memory.js";
import {
  admitStructuralRule,
  defineStructuralRoleDictionary,
  defineStructuralRule,
  readStructuralRule,
} from "../src/structural-rule.js";
import {
  admitStructuralDerivationRule,
  defineStructuralDerivationRule,
  readStructuralDerivationRule,
} from "../src/derivation.js";
import {
  StructuralDerivedDerivationReplayError,
  replayStructuralDerivedDerivationSchema,
  type StructuralDerivedDerivationEvidence,
  type StructuralDerivedDerivationNodeEvidence,
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
  if (!condition) throw new Error(message);
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}
function expectSchemaError(code: string, effect: () => unknown): void {
  try { effect(); }
  catch (error) {
    assert(error instanceof StructuralDerivedDerivationReplayError, `${code}: wrong schema error type`);
    same(error.code, code, `${code}: wrong schema error code`);
    return;
  }
  throw new Error(`${code}: expected schema rejection`);
}
function expectClosureError(code: string, effect: () => unknown): void {
  try { effect(); }
  catch (error) {
    assert(error instanceof StructuralClosureApplicationReplayError, `${code}: wrong closure error type`);
    same(error.code, code, `${code}: wrong closure error code`);
    return;
  }
  throw new Error(`${code}: expected closure rejection`);
}

interface GenericFixture {
  readonly rule: LinkHandle;
  readonly derivationRule: LinkHandle;
  readonly ruleAdmission: LinkHandle;
  readonly derivationRuleAdmission: LinkHandle;
  readonly identity: LinkHandle;
  readonly evidence: StructuralDerivedDerivationEvidence;
}
interface TargetFixture {
  readonly derivationRule: LinkHandle;
  readonly identity: LinkHandle;
  readonly assumptions: readonly { readonly occurrence: LinkHandle; readonly template: LinkHandle }[];
  readonly targetOccurrence: LinkHandle;
}
interface ProofAsetEvidence {
  readonly identity: LinkHandle;
  readonly targetOccurrence: LinkHandle;
  readonly nodes: readonly StructuralDerivedDerivationNodeEvidence[];
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
    memory, assumptions.map(({ occurrence }) => occurrence));
  const targetOccurrence = memory.ensure(derivationRule, premiseOccurrenceSequence);
  return Object.freeze({
    rule,
    derivationRule,
    ruleAdmission,
    derivationRuleAdmission,
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
    if (occurrence === undefined) throw new Error("target slot fixture invariant");
    return occurrence;
  });
  return Object.freeze({
    derivationRule,
    identity,
    assumptions: Object.freeze(assumptions),
    targetOccurrence: memory.ensure(derivationRule, materializeExactSequence(memory, slots)),
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
    materializeExactSequence(memory, bindings.map(([source, value]) => memory.ensure(source, value)));
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
    materializeExactSequence(memory, bindings.map(([source, target]) => memory.ensure(source, target))),
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

function makeNode(
  memory: Memory,
  schema: GenericFixture,
  dependencies: readonly LinkHandle[],
): StructuralDerivedDerivationNodeEvidence {
  const premiseOccurrenceSequence = materializeExactSequence(memory, dependencies);
  return Object.freeze({
    occurrence: memory.ensure(schema.derivationRule, premiseOccurrenceSequence),
    derivationRule: schema.derivationRule,
    ruleAdmission: schema.ruleAdmission,
    derivationRuleAdmission: schema.derivationRuleAdmission,
    premiseOccurrenceSequence,
  });
}

/**
 * Test-local reader for an MTS proof Aset.
 * `nodes` is only a traversal index; authority remains in exact MTS Link identity,
 * dependency sequences, and primitive Theory admissions.
 */
function replayProofAset(memory: Memory, evidence: ProofAsetEvidence): LinkHandle {
  const before = memory.linkCount;
  const identity = memory.poles(evidence.identity);
  const target = readStructuralDerivationRule(memory, identity.start);
  const targetRule = readStructuralRule(memory, target.structuralRule);
  const targetPremises = new Set(target.premiseTemplates);
  const nodes = new Map(evidence.nodes.map((node) => [node.occurrence, node] as const));
  const active = new Set<LinkHandle>();
  const verified = new Map<LinkHandle, LinkHandle>();
  const usedAssumptions = new Set<LinkHandle>();

  const verify = (occurrence: LinkHandle): LinkHandle => {
    const cached = verified.get(occurrence);
    if (cached !== undefined) return cached;
    assert(!active.has(occurrence), "cyclic proof-Aset dependency");
    const node = nodes.get(occurrence);
    assert(node !== undefined, "missing proof-Aset node");
    active.add(occurrence);
    try {
      const schema = readStructuralDerivationRule(memory, node.derivationRule);
      const rule = readStructuralRule(memory, schema.structuralRule);
      same(rule.roleDictionary, targetRule.roleDictionary, "proof-Aset RoleDictionary");
      const ra = memory.poles(node.ruleAdmission);
      const da = memory.poles(node.derivationRuleAdmission);
      assert(ra.start === identity.end && ra.end === schema.structuralRule,
        "proof-Aset primitive Rule admission");
      assert(da.start === identity.end && da.end === node.derivationRule,
        "proof-Aset primitive DR admission");
      const occurrencePoles = memory.poles(node.occurrence);
      same(occurrencePoles.start, node.derivationRule, "proof-Aset occurrence DR");
      same(occurrencePoles.end, node.premiseOccurrenceSequence, "proof-Aset occurrence dependencies");
      const dependencies = readExactSequence(memory, node.premiseOccurrenceSequence).values;
      same(dependencies.length, schema.premiseTemplates.length, "proof-Aset premise arity");
      dependencies.forEach((dependency, index) => {
        const expected = schema.premiseTemplates[index];
        assert(expected !== undefined, "proof-Aset expected premise");
        let actual: LinkHandle;
        if (nodes.has(dependency)) actual = verify(dependency);
        else {
          const assumption = memory.poles(dependency);
          same(assumption.end, evidence.identity, "proof-Aset assumption identity");
          assert(targetPremises.has(assumption.start), "proof-Aset assumption outside target premises");
          actual = assumption.start;
          usedAssumptions.add(actual);
        }
        same(actual, expected, "proof-Aset premise template");
      });
      verified.set(occurrence, rule.body);
      return rule.body;
    } finally {
      active.delete(occurrence);
    }
  };

  const conclusion = verify(evidence.targetOccurrence);
  same(conclusion, targetRule.body, "proof-Aset target conclusion");
  same(verified.size, nodes.size, "all proof-Aset nodes reachable");
  for (const template of targetPremises) {
    assert(usedAssumptions.has(template), "target premise missing from proof Aset");
  }
  same(memory.linkCount, before, "proof-Aset replay read-only");
  return conclusion;
}

function expandProofAset(
  memory: Memory,
  source: ProofAsetEvidence,
  targetIdentity: LinkHandle,
): { readonly targetOccurrence: LinkHandle; readonly nodes: readonly StructuralDerivedDerivationNodeEvidence[] } {
  replayProofAset(memory, source);
  const sourceSchema = readStructuralDerivationRule(memory, memory.poles(source.identity).start);
  const targetSchema = readStructuralDerivationRule(memory, memory.poles(targetIdentity).start);
  same(targetSchema.premiseTemplates.length, sourceSchema.premiseTemplates.length,
    "proof-Aset expansion premise count");
  sourceSchema.premiseTemplates.forEach((template, index) =>
    same(targetSchema.premiseTemplates[index], template, "proof-Aset expansion premise template"));

  const sourceNodes = new Map(source.nodes.map((node) => [node.occurrence, node] as const));
  const mapped = new Map<LinkHandle, LinkHandle>();
  const expanded = new Map<LinkHandle, StructuralDerivedDerivationNodeEvidence>();
  const mapOccurrence = (occurrence: LinkHandle): LinkHandle => {
    const cached = mapped.get(occurrence);
    if (cached !== undefined) return cached;
    const sourceNode = sourceNodes.get(occurrence);
    if (sourceNode === undefined) {
      const assumption = memory.poles(occurrence);
      same(assumption.end, source.identity, "expanded assumption identity");
      const result = memory.ensure(assumption.start, targetIdentity);
      mapped.set(occurrence, result);
      return result;
    }
    const dependencies = readExactSequence(memory, sourceNode.premiseOccurrenceSequence).values
      .map((dependency) => mapOccurrence(dependency));
    const premiseOccurrenceSequence = materializeExactSequence(memory, dependencies);
    const result = memory.ensure(sourceNode.derivationRule, premiseOccurrenceSequence);
    mapped.set(occurrence, result);
    expanded.set(result, Object.freeze({ ...sourceNode, occurrence: result, premiseOccurrenceSequence }));
    return result;
  };
  const targetOccurrence = mapOccurrence(source.targetOccurrence);
  return Object.freeze({ targetOccurrence, nodes: Object.freeze([...expanded.values()]) });
}

function dependencyReferenceCount(
  memory: Memory,
  nodes: readonly StructuralDerivedDerivationNodeEvidence[],
  occurrence: LinkHandle,
): number {
  let count = 0;
  for (const node of nodes) {
    for (const dependency of readExactSequence(memory, node.premiseOccurrenceSequence).values) {
      if (dependency === occurrence) count += 1;
    }
  }
  return count;
}

function proofAsetCarrier(memory: Memory, evidence: StructuralDerivedDerivationEvidence): LinkHandle {
  return materializeExactSequence(memory, [
    evidence.identity,
    evidence.targetOccurrence,
    materializeExactSequence(memory, evidence.assumptions.map(({ occurrence }) => occurrence)),
    materializeExactSequence(memory, evidence.nodes.map(({ occurrence }) => occurrence)),
  ]);
}

function specializationProofAsetCarrier(
  memory: Memory,
  evidence: StructuralDerivedDerivationSpecializationEvidence,
): LinkHandle {
  return materializeExactSequence(memory, [
    proofAsetCarrier(memory, evidence.source),
    evidence.specialization,
    evidence.targetIdentity,
    materializeExactSequence(memory, evidence.targetAssumptions.map(({ occurrence }) => occurrence)),
    evidence.targetOccurrence,
  ]);
}

async function probeProofAsetComposition(): Promise<void> {
  const memory = new Memory();
  const { R, L, U } = ensureRootBasis(memory);
  let cursor = memory.ensure(U, R);
  const fresh = (): LinkHandle => (cursor = memory.ensure(cursor, R));
  const theory = memory.ensure(L, U);
  const a = fresh(), b = fresh(), c = fresh(), d = fresh(), x = fresh();
  const dictionary = defineStructuralRoleDictionary(memory, [a, b, c, d, x]);

  const rAB = admittedGeneric(memory, theory, dictionary, [a], b);
  const rBC = admittedGeneric(memory, theory, dictionary, [b], c);
  const rCD = admittedGeneric(memory, theory, dictionary, [c], d);
  const rABX = admittedGeneric(memory, theory, dictionary, [a, b], x);
  const rXBC = admittedGeneric(memory, theory, dictionary, [x, b], c);

  // P1: one exact B occurrence participates in two dependency relations.
  const repeatedRule = defineStructuralRule(memory, dictionary, c);
  const repeatedDR = defineStructuralDerivationRule(memory, repeatedRule, [a, b, b]);
  const repeatedIdentity = memory.ensure(repeatedDR, theory);
  const repeatedA = memory.ensure(a, repeatedIdentity);
  const repeatedB = memory.ensure(b, repeatedIdentity);
  const repeatedNode1 = makeNode(memory, rABX, [repeatedA, repeatedB]);
  const repeatedNode2 = makeNode(memory, rXBC, [repeatedNode1.occurrence, repeatedB]);
  const repeatedProof: ProofAsetEvidence = Object.freeze({
    identity: repeatedIdentity,
    targetOccurrence: repeatedNode2.occurrence,
    nodes: Object.freeze([repeatedNode1, repeatedNode2]),
  });
  same(replayProofAset(memory, repeatedProof), c, "P1 proof-Aset conclusion");
  same(dependencyReferenceCount(memory, repeatedProof.nodes, repeatedB), 2,
    "P1 exact B occurrence reused twice");
  expectSchemaError("target-assumption-mismatch", () =>
    replayStructuralDerivedDerivationSchema(memory, {
      identity: repeatedIdentity,
      targetOccurrence: repeatedNode2.occurrence,
      assumptions: Object.freeze([
        { occurrence: repeatedA, template: a },
        { occurrence: repeatedB, template: b },
      ]),
      nodes: repeatedProof.nodes,
    }));

  // P2: DR -> Theory identity alone grants no authority; carried primitive proof does.
  const derivedRule = defineStructuralRule(memory, dictionary, c);
  const derivedDR = defineStructuralDerivationRule(memory, derivedRule, [a]);
  const derivedIdentity = memory.ensure(derivedDR, theory);
  const derivedA = memory.ensure(a, derivedIdentity);
  const derivedNode1 = makeNode(memory, rAB, [derivedA]);
  const derivedNode2 = makeNode(memory, rBC, [derivedNode1.occurrence]);
  const derivedProof: ProofAsetEvidence = Object.freeze({
    identity: derivedIdentity,
    targetOccurrence: derivedNode2.occurrence,
    nodes: Object.freeze([derivedNode1, derivedNode2]),
  });
  same(replayProofAset(memory, derivedProof), c, "P2 source derived proof-Aset");

  const targetRule = defineStructuralRule(memory, dictionary, d);
  const targetDR = defineStructuralDerivationRule(memory, targetRule, [a]);
  const targetIdentity = memory.ensure(targetDR, theory);
  const targetA = memory.ensure(a, targetIdentity);
  const directDependencies = materializeExactSequence(memory, [targetA]);
  const directDerivedOccurrence = memory.ensure(derivedDR, directDependencies);
  const directDerivedNode: StructuralDerivedDerivationNodeEvidence = Object.freeze({
    occurrence: directDerivedOccurrence,
    derivationRule: derivedDR,
    ruleAdmission: rBC.ruleAdmission,
    derivationRuleAdmission: derivedIdentity,
    premiseOccurrenceSequence: directDependencies,
  });
  const directConsumer = makeNode(memory, rCD, [directDerivedOccurrence]);
  expectSchemaError("derivation-rule-not-admitted", () =>
    replayStructuralDerivedDerivationSchema(memory, {
      identity: targetIdentity,
      targetOccurrence: directConsumer.occurrence,
      assumptions: Object.freeze([{ occurrence: targetA, template: a }]),
      nodes: Object.freeze([directDerivedNode, directConsumer]),
    }));

  const revisionBefore = await computePortableStructuralTheoryRevision(
    exportPortableStructuralTheory(memory, theory));
  const expanded = expandProofAset(memory, derivedProof, targetIdentity);
  const expandedConsumer = makeNode(memory, rCD, [expanded.targetOccurrence]);
  const targetProof: ProofAsetEvidence = Object.freeze({
    identity: targetIdentity,
    targetOccurrence: expandedConsumer.occurrence,
    nodes: Object.freeze([...expanded.nodes, expandedConsumer]),
  });
  same(replayProofAset(memory, targetProof), d, "P2 expanded proof-Aset conclusion");
  assert(memory.find(theory, derivedDR) === undefined, "P2 source derived DR remains unadmitted");
  assert(memory.find(theory, targetDR) === undefined, "P2 target derived DR remains unadmitted");

  // P3: the same shared occurrence survives proof-carrying expansion.
  const repeatedTargetRule = defineStructuralRule(memory, dictionary, d);
  const repeatedTargetDR = defineStructuralDerivationRule(memory, repeatedTargetRule, [a, b, b]);
  const repeatedTargetIdentity = memory.ensure(repeatedTargetDR, theory);
  const expandedRepeated = expandProofAset(memory, repeatedProof, repeatedTargetIdentity);
  const repeatedConsumer = makeNode(memory, rCD, [expandedRepeated.targetOccurrence]);
  const repeatedTargetProof: ProofAsetEvidence = Object.freeze({
    identity: repeatedTargetIdentity,
    targetOccurrence: repeatedConsumer.occurrence,
    nodes: Object.freeze([...expandedRepeated.nodes, repeatedConsumer]),
  });
  same(replayProofAset(memory, repeatedTargetProof), d, "P3 composed proof-Aset conclusion");
  const targetB = memory.ensure(b, repeatedTargetIdentity);
  same(dependencyReferenceCount(memory, repeatedTargetProof.nodes, targetB), 2,
    "P3 shared B occurrence survives expansion");
  assert(memory.find(theory, repeatedDR) === undefined, "P3 source repeated DR remains unadmitted");
  assert(memory.find(theory, repeatedTargetDR) === undefined, "P3 target repeated DR remains unadmitted");

  const revisionAfter = await computePortableStructuralTheoryRevision(
    exportPortableStructuralTheory(memory, theory));
  same(revisionAfter.scheme, revisionBefore.scheme, "proof-Aset expansion preserves revision scheme");
  same(revisionAfter.value, revisionBefore.value, "proof-Aset expansion preserves exact Theory revision");
}

async function probeL0(): Promise<void> {
  const memory = new Memory();
  const { R, O, C, L, U } = ensureRootBasis(memory);
  let cursor = memory.ensure(U, R);
  const fresh = (): LinkHandle => (cursor = memory.ensure(cursor, R));
  const theory = memory.ensure(L, U);

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
    "L0 and closure coordinates are distinct");

  const dBaseSource = defineStructuralRoleDictionary(memory, [a]);
  const dAddSource = defineStructuralRoleDictionary(memory, [a, b, c, b1, c1]);
  const dBase = defineStructuralRoleDictionary(memory, []);
  const dStep = defineStructuralRoleDictionary(memory, [n, n1]);
  const dResult = defineStructuralRoleDictionary(memory, [n]);
  const dAuthority = defineStructuralRoleDictionary(memory, [x, x1]);

  const sourceBase = admittedGeneric(memory, theory, dBaseSource, [], add(a, U, a));
  const sourceStep = admittedGeneric(memory, theory, dAddSource, [
    add(a, b, c), s0(b, b1), s0(c, c1),
  ], add(a, b1, c1));
  same(replayStructuralDerivedDerivationSchema(memory, sourceBase.evidence).conclusionTemplate,
    add(a, U, a), "source Add base replay");
  same(replayStructuralDerivedDerivationSchema(memory, sourceStep.evidence).conclusionTemplate,
    add(a, b1, c1), "source Add recursion replay");

  const addUUU = add(U, U, U);
  const l0Current = add(U, n, n);
  const l0S0 = s0(n, n1);
  const l0Next = add(U, n1, n1);

  const baseTarget = specializationTarget(memory, theory, dBase, [], addUUU);
  const baseSpec = specializationCarrier(memory, theory, dBaseSource, dBase, [], [[a, U]]);
  const baseEvidence = specializationEvidence(sourceBase.evidence, baseSpec, baseTarget);
  const baseBefore = memory.linkCount;
  const baseReplay = replayStructuralDerivedDerivationSpecialization(memory, baseEvidence);
  same(baseReplay.targetConclusionTemplate, addUUU, "mixed BASE target");
  same(baseReplay.targetAssumptionCount, 0, "mixed BASE assumptions");
  same(baseReplay.premiseSlotCount, 0, "mixed BASE slots");
  same(memory.linkCount, baseBefore, "mixed BASE replay read-only");

  const stepTarget = specializationTarget(
    memory, theory, dStep, [l0Current, l0S0, l0S0], l0Next);
  const stepSpec = specializationCarrier(memory, theory, dAddSource, dStep, [
    [b, n], [c, n], [b1, n1], [c1, n1],
  ], [[a, U]]);
  const stepEvidence = specializationEvidence(sourceStep.evidence, stepSpec, stepTarget);
  const stepBefore = memory.linkCount;
  const stepReplay = replayStructuralDerivedDerivationSpecialization(memory, stepEvidence);
  same(stepReplay.targetConclusionTemplate, l0Next, "mixed STEP target");
  same(stepReplay.targetAssumptionCount, 2, "mixed STEP semantic assumptions");
  same(stepReplay.premiseSlotCount, 3, "mixed STEP structural slots");
  same(memory.linkCount, stepBefore, "mixed STEP replay read-only");

  const stepSlots = readExactSequence(memory, memory.poles(stepTarget.targetOccurrence).end).values;
  same(stepSlots.length, 3, "L0 STEP structural slots");
  same(new Set(stepSlots).size, 2, "L0 STEP unique semantic occurrences");
  same(stepSlots[1], stepSlots[2], "L0 STEP exact S0 occurrence reused");

  const baseProofAset = specializationProofAsetCarrier(memory, baseEvidence);
  const stepProofAset = specializationProofAsetCarrier(memory, stepEvidence);
  assert(memory.find(theory, baseTarget.derivationRule) === undefined,
    "mixed BASE target DR remains unadmitted");
  assert(memory.find(theory, stepTarget.derivationRule) === undefined,
    "mixed STEP target DR remains unadmitted");

  const baseProofObject = unadmittedTargetEvidence(baseTarget);
  expectSchemaError("target-occurrence-not-found", () =>
    replayStructuralDerivedDerivationSchema(memory, baseProofObject));
  const stepProofObject = unadmittedTargetEvidence(stepTarget);
  expectSchemaError("target-assumption-mismatch", () =>
    replayStructuralDerivedDerivationSchema(memory, stepProofObject));

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
  const authorityMorphism = morphism(memory, theory, dAuthority, dStep, [[x, n], [x1, n1]]);
  const currentMorphism = morphism(memory, theory, dResult, dStep, [[n, n]]);
  const nextMorphism = morphism(memory, theory, dResult, dStep, [[n, n1]]);
  const baseGrounding = grounding(memory, theory, dResult, U, n);

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
  same(l0Coordinates.length, 8, "one L0 proof-Aset coordinate count");
  same(l0Coordinates[1], baseProofAset, "L0 proof Aset contains BASE sub-Aset");
  same(l0Coordinates[2], stepProofAset, "L0 proof Aset contains STEP sub-Aset");

  assert(memory.find(theory, result.derivationRule) === undefined,
    "L0 RESULT DR remains unadmitted");
  const closureEvidence = Object.freeze({
    authority,
    authorityAdmission,
    base: baseProofObject,
    step: stepProofObject,
    resultIdentity: result.identity,
    authorityMorphism,
    currentMorphism,
    nextMorphism,
    baseGrounding,
  });

  const revisionBefore = await computePortableStructuralTheoryRevision(
    exportPortableStructuralTheory(memory, theory));
  const closureBefore = memory.linkCount;
  expectClosureError("invalid-base", () =>
    replayStructuralClosureApplication(memory, closureEvidence));
  same(memory.linkCount, closureBefore, "L0 closure rejection is read-only");
  const revisionAfter = await computePortableStructuralTheoryRevision(
    exportPortableStructuralTheory(memory, theory));
  same(revisionAfter.scheme, revisionBefore.scheme, "L0 replay preserves revision scheme");
  same(revisionAfter.value, revisionBefore.value, "L0 replay preserves exact Theory revision");

  assert(memory.find(theory, baseTarget.derivationRule) === undefined,
    "falsifier does not promote BASE target DR");
  assert(memory.find(theory, stepTarget.derivationRule) === undefined,
    "falsifier does not promote STEP target DR");
  assert(memory.find(theory, result.derivationRule) === undefined,
    "falsifier does not promote RESULT DR");
}

async function main(): Promise<void> {
  await probeProofAsetComposition();
  await probeL0();
  console.log("P1 shared proof-Aset occurrence reuse = SUPPORTED");
  console.log("P2 proof-carrying derived DR composition = SUPPORTED");
  console.log("P3 shared occurrence + derived expansion = SUPPORTED");
  console.log("L0 proof-Aset representation = SUPPORTED");
  console.log("L0 first trusted consumer reject = invalid-base");
  console.log("classification = L0_PROOF_ASET_COMPOSITION_REPLAY_GAP_CONFIRMED");
  console.log("guarded-step weakening = NOT REACHED");
}

void main();
