import { materializeExactSequence, readExactSequence } from "../src/exact-sequence.js";
import { Memory, ensureRootBasis, type LinkHandle } from "../src/memory.js";
import {
  admitStructuralRule,
  defineStructuralRoleDictionary,
  defineStructuralRule,
  readStructuralRoleDictionary,
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
import { exportPortableStructuralTheory } from "../src/portable-theory.js";
import { computePortableStructuralTheoryRevision } from "../src/portable-theory-digest.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`proof-Aset falsifier: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

function expectSchemaError(code: string, effect: () => unknown): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof StructuralDerivedDerivationReplayError, `${code}: wrong error type`);
    same(error.code, code, `${code}: wrong error code`);
    return;
  }
  throw new Error(`${code}: expected StructuralDerivedDerivationReplayError`);
}

interface Schema {
  readonly rule: LinkHandle;
  readonly derivationRule: LinkHandle;
}

interface AdmittedSchema extends Schema {
  readonly ruleAdmission: LinkHandle;
  readonly derivationRuleAdmission: LinkHandle;
}

/**
 * Test-local operational projection of an MTS proof Aset.
 *
 * Authority-bearing identity/dependency data remain MTS Links. `nodes[]` is only
 * an index used to traverse those Links; it is not an authoritative host graph.
 * External assumptions are intentionally reconstructed from exact Links of the
 * form Template -> DerivedIdentity rather than supplied as a second host list.
 */
interface ProofAsetEvidence {
  readonly identity: LinkHandle;
  readonly targetOccurrence: LinkHandle;
  readonly nodes: readonly StructuralDerivedDerivationNodeEvidence[];
}

interface ProofAsetReplayResult {
  readonly theory: LinkHandle;
  readonly derivationRule: LinkHandle;
  readonly conclusionTemplate: LinkHandle;
  readonly occurrenceCount: number;
  readonly assumptionTemplateCount: number;
}

function schemaParts(memory: Memory, derivationRule: LinkHandle) {
  const schema = readStructuralDerivationRule(memory, derivationRule);
  const rule = readStructuralRule(memory, schema.structuralRule);
  const roles = readStructuralRoleDictionary(memory, rule.roleDictionary).roles;
  return { schema, rule, roles };
}

function verifyAdmission(
  memory: Memory,
  admission: LinkHandle,
  theory: LinkHandle,
  target: LinkHandle,
  message: string,
): void {
  const poles = memory.poles(admission);
  assert(poles.start === theory && poles.end === target, message);
}

/**
 * Research observer for the hypothesis "a proof in MTS is an Aset".
 *
 * The only semantic coordinates read here are MTS Links/Asets:
 * - DerivedIdentity = DR -> Theory
 * - proof occurrences = DR -> ExactSequence(dependency occurrences)
 * - assumption occurrences = Template -> DerivedIdentity
 * - primitive authority = Theory -> Rule / Theory -> DR
 *
 * Maps/Sets below are traversal indexes only. In particular, repeated premise
 * use is represented by repeated references to the exact same occurrence Link.
 */
function replayProofAset(memory: Memory, evidence: ProofAsetEvidence): ProofAsetReplayResult {
  const before = memory.linkCount;
  try {
    const identity = memory.poles(evidence.identity);
    const targetDerivationRule = identity.start;
    const theory = identity.end;
    const target = schemaParts(memory, targetDerivationRule);
    const targetPremiseTemplates = new Set(target.schema.premiseTemplates);

    const nodes = new Map<LinkHandle, StructuralDerivedDerivationNodeEvidence>();
    for (const node of evidence.nodes) {
      assert(!nodes.has(node.occurrence), "duplicate proof occurrence in traversal index");
      nodes.set(node.occurrence, node);
    }
    assert(nodes.has(evidence.targetOccurrence), "target proof occurrence missing from proof Aset");

    const active = new Set<LinkHandle>();
    const verified = new Map<LinkHandle, LinkHandle>();
    const usedAssumptionTemplates = new Set<LinkHandle>();

    const verifyNode = (occurrence: LinkHandle): LinkHandle => {
      const cached = verified.get(occurrence);
      if (cached !== undefined) return cached;
      assert(!active.has(occurrence), "cyclic proof-Aset dependency");
      const node = nodes.get(occurrence);
      assert(node !== undefined, "missing proof-Aset node");

      active.add(occurrence);
      try {
        const parts = schemaParts(memory, node.derivationRule);
        same(parts.rule.roleDictionary, target.rule.roleDictionary, "proof-Aset RoleDictionary");
        verifyAdmission(memory, node.ruleAdmission, theory, parts.schema.structuralRule,
          "proof-Aset primitive Rule admission mismatch");
        verifyAdmission(memory, node.derivationRuleAdmission, theory, node.derivationRule,
          "proof-Aset primitive DR admission mismatch");

        const occurrencePoles = memory.poles(node.occurrence);
        same(occurrencePoles.start, node.derivationRule, "proof-Aset occurrence DR");
        same(occurrencePoles.end, node.premiseOccurrenceSequence, "proof-Aset occurrence dependencies");

        const dependencies = readExactSequence(memory, node.premiseOccurrenceSequence).values;
        same(dependencies.length, parts.schema.premiseTemplates.length, "proof-Aset premise arity");

        dependencies.forEach((dependencyOccurrence, index) => {
          const expectedTemplate = parts.schema.premiseTemplates[index];
          assert(expectedTemplate !== undefined, "proof-Aset expected premise missing");

          let actualTemplate: LinkHandle;
          if (nodes.has(dependencyOccurrence)) {
            actualTemplate = verifyNode(dependencyOccurrence);
          } else {
            const assumption = memory.poles(dependencyOccurrence);
            same(assumption.end, evidence.identity, "assumption belongs to exact proof-Aset identity");
            assert(targetPremiseTemplates.has(assumption.start), "assumption template outside target schema");
            actualTemplate = assumption.start;
            usedAssumptionTemplates.add(actualTemplate);
          }
          same(actualTemplate, expectedTemplate, "proof-Aset premise template");
        });

        verified.set(occurrence, parts.rule.body);
        return parts.rule.body;
      } finally {
        active.delete(occurrence);
      }
    };

    const conclusionTemplate = verifyNode(evidence.targetOccurrence);
    same(conclusionTemplate, target.rule.body, "proof-Aset target conclusion");
    same(verified.size, nodes.size, "all indexed proof occurrences reachable");
    for (const template of targetPremiseTemplates) {
      assert(usedAssumptionTemplates.has(template), "target premise has no proved assumption occurrence");
    }
    same(memory.linkCount, before, "proof-Aset replay read-only");

    return Object.freeze({
      theory,
      derivationRule: targetDerivationRule,
      conclusionTemplate,
      occurrenceCount: verified.size,
      assumptionTemplateCount: usedAssumptionTemplates.size,
    });
  } finally {
    same(memory.linkCount, before, "proof-Aset replay final read-only guard");
  }
}

function externalPremiseSlots(
  memory: Memory,
  identity: LinkHandle,
  carrier: LinkHandle,
): readonly LinkHandle[] {
  const identityPoles = memory.poles(identity);
  const target = readStructuralDerivationRule(memory, identityPoles.start);
  const carrierPoles = memory.poles(carrier);
  same(carrierPoles.start, identityPoles.start, "external premise carrier DR");
  const slots = readExactSequence(memory, carrierPoles.end).values;
  same(slots.length, target.premiseTemplates.length, "external premise slot count");
  slots.forEach((occurrence, index) => {
    const expected = target.premiseTemplates[index];
    assert(expected !== undefined, "external premise template missing");
    const poles = memory.poles(occurrence);
    same(poles.start, expected, "external premise occurrence template");
    same(poles.end, identity, "external premise occurrence proof-Aset identity");
  });
  return slots;
}

function strictEvidence(
  memory: Memory,
  proof: ProofAsetEvidence,
  duplicateStructuralSlots: boolean,
): StructuralDerivedDerivationEvidence {
  const targetDerivationRule = memory.poles(proof.identity).start;
  const target = readStructuralDerivationRule(memory, targetDerivationRule);
  const templates: LinkHandle[] = [];
  if (duplicateStructuralSlots) {
    templates.push(...target.premiseTemplates);
  } else {
    const seen = new Set<LinkHandle>();
    for (const template of target.premiseTemplates) {
      if (!seen.has(template)) {
        seen.add(template);
        templates.push(template);
      }
    }
  }
  return Object.freeze({
    identity: proof.identity,
    targetOccurrence: proof.targetOccurrence,
    assumptions: Object.freeze(templates.map((template) => Object.freeze({
      occurrence: memory.ensure(template, proof.identity),
      template,
    }))),
    nodes: proof.nodes,
  });
}

function makeNode(
  memory: Memory,
  schema: AdmittedSchema,
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
 * Test-local untrusted producer: copy a verified proof Aset under a new derived
 * identity with the same external premise templates. Primitive Rule/DR authority
 * is not changed; the final expanded Aset is replayed independently afterwards.
 */
function expandProofAset(
  memory: Memory,
  source: ProofAsetEvidence,
  targetIdentity: LinkHandle,
): { readonly targetOccurrence: LinkHandle; readonly nodes: readonly StructuralDerivedDerivationNodeEvidence[] } {
  const sourceResult = replayProofAset(memory, source);
  const targetIdentityPoles = memory.poles(targetIdentity);
  same(targetIdentityPoles.end, sourceResult.theory, "proof-Aset expansion Theory");

  const sourceTarget = readStructuralDerivationRule(memory, sourceResult.derivationRule);
  const target = readStructuralDerivationRule(memory, targetIdentityPoles.start);
  same(target.premiseTemplates.length, sourceTarget.premiseTemplates.length,
    "proof-Aset expansion external premise count");
  sourceTarget.premiseTemplates.forEach((template, index) => {
    same(target.premiseTemplates[index], template, "proof-Aset expansion external premise template");
  });

  const sourceNodes = new Map(source.nodes.map((node) => [node.occurrence, node] as const));
  const expanded = new Map<LinkHandle, StructuralDerivedDerivationNodeEvidence>();
  const mappedOccurrences = new Map<LinkHandle, LinkHandle>();

  const mapOccurrence = (occurrence: LinkHandle): LinkHandle => {
    const cached = mappedOccurrences.get(occurrence);
    if (cached !== undefined) return cached;

    const sourceNode = sourceNodes.get(occurrence);
    if (sourceNode === undefined) {
      const assumption = memory.poles(occurrence);
      same(assumption.end, source.identity, "expanded source assumption identity");
      const mapped = memory.ensure(assumption.start, targetIdentity);
      mappedOccurrences.set(occurrence, mapped);
      return mapped;
    }

    const dependencies = readExactSequence(memory, sourceNode.premiseOccurrenceSequence).values;
    const mappedDependencies = dependencies.map((dependency) => mapOccurrence(dependency));
    const premiseOccurrenceSequence = materializeExactSequence(memory, mappedDependencies);
    const mappedOccurrence = memory.ensure(sourceNode.derivationRule, premiseOccurrenceSequence);
    const mappedNode = Object.freeze({
      ...sourceNode,
      occurrence: mappedOccurrence,
      premiseOccurrenceSequence,
    });
    mappedOccurrences.set(occurrence, mappedOccurrence);
    expanded.set(mappedOccurrence, mappedNode);
    return mappedOccurrence;
  };

  const targetOccurrence = mapOccurrence(source.targetOccurrence);
  return Object.freeze({
    targetOccurrence,
    nodes: Object.freeze([...expanded.values()]),
  });
}

function dependencyReferenceCount(
  memory: Memory,
  nodes: readonly StructuralDerivedDerivationNodeEvidence[],
  targetOccurrence: LinkHandle,
): number {
  let count = 0;
  for (const node of nodes) {
    for (const dependency of readExactSequence(memory, node.premiseOccurrenceSequence).values) {
      if (dependency === targetOccurrence) count += 1;
    }
  }
  return count;
}

async function main(): Promise<void> {
  const memory = new Memory();
  const { R, L, U } = ensureRootBasis(memory);
  let cursor = memory.ensure(U, R);
  const fresh = (): LinkHandle => (cursor = memory.ensure(cursor, R));
  const theory = memory.ensure(L, U);

  const a = fresh();
  const b = fresh();
  const c = fresh();
  const d = fresh();
  const x = fresh();
  const dictionary = defineStructuralRoleDictionary(memory, [a, b, c, d, x]);

  const defineSchema = (body: LinkHandle, premises: readonly LinkHandle[]): Schema => {
    const rule = defineStructuralRule(memory, dictionary, body);
    return Object.freeze({
      rule,
      derivationRule: defineStructuralDerivationRule(memory, rule, premises),
    });
  };
  const admit = (schema: Schema): AdmittedSchema => Object.freeze({
    ...schema,
    ruleAdmission: admitStructuralRule(memory, theory, schema.rule),
    derivationRuleAdmission: admitStructuralDerivationRule(memory, theory, schema.derivationRule),
  });

  const r1 = admit(defineSchema(b, [a]));
  const r2 = admit(defineSchema(c, [b]));
  const r4 = admit(defineSchema(d, [c]));
  const rABX = admit(defineSchema(x, [a, b]));
  const rXBC = admit(defineSchema(c, [x, b]));

  // ---------------------------------------------------------------------------
  // P1: one exact proved occurrence may satisfy multiple compatible premise uses.
  // ---------------------------------------------------------------------------
  const repeatedTarget = defineSchema(c, [a, b, b]);
  const repeatedIdentity = memory.ensure(repeatedTarget.derivationRule, theory);
  const repeatedA = memory.ensure(a, repeatedIdentity);
  const repeatedB = memory.ensure(b, repeatedIdentity);
  const repeatedNode1 = makeNode(memory, rABX, [repeatedA, repeatedB]);
  const repeatedNode2 = makeNode(memory, rXBC, [repeatedNode1.occurrence, repeatedB]);
  const repeatedProof: ProofAsetEvidence = Object.freeze({
    identity: repeatedIdentity,
    targetOccurrence: repeatedNode2.occurrence,
    nodes: Object.freeze([repeatedNode1, repeatedNode2]),
  });

  const repeatedSlotCarrier = memory.ensure(
    repeatedTarget.derivationRule,
    materializeExactSequence(memory, [repeatedA, repeatedB, repeatedB]),
  );
  const slots = externalPremiseSlots(memory, repeatedIdentity, repeatedSlotCarrier);
  same(slots.length, 3, "P1 structural slot count");
  same(new Set(slots).size, 2, "P1 unique proved occurrences");
  same(slots[1], repeatedB, "P1 first B slot");
  same(slots[2], repeatedB, "P1 second B slot reuses exact occurrence");

  expectSchemaError("target-assumption-mismatch", () =>
    replayStructuralDerivedDerivationSchema(memory, strictEvidence(memory, repeatedProof, false)));
  expectSchemaError("duplicate-occurrence", () =>
    replayStructuralDerivedDerivationSchema(memory, strictEvidence(memory, repeatedProof, true)));

  const p1Before = memory.linkCount;
  const p1 = replayProofAset(memory, repeatedProof);
  same(p1.conclusionTemplate, c, "P1 proof-Aset conclusion");
  same(p1.assumptionTemplateCount, 2, "P1 semantic assumption templates");
  same(dependencyReferenceCount(memory, repeatedProof.nodes, repeatedB), 2,
    "P1 exact B occurrence participates in two dependency relations");
  same(memory.linkCount, p1Before, "P1 replay read-only");

  // ---------------------------------------------------------------------------
  // P2: derived DR authority is carried proof-Aset expansion, never T -> DR.
  // ---------------------------------------------------------------------------
  const derivedAC = defineSchema(c, [a]);
  same(derivedAC.rule, r2.rule, "P2 derived conclusion Rule already has primitive authority");
  const derivedACIdentity = memory.ensure(derivedAC.derivationRule, theory);
  const derivedACA = memory.ensure(a, derivedACIdentity);
  const derivedACNode1 = makeNode(memory, r1, [derivedACA]);
  const derivedACNode2 = makeNode(memory, r2, [derivedACNode1.occurrence]);
  const derivedACProof: ProofAsetEvidence = Object.freeze({
    identity: derivedACIdentity,
    targetOccurrence: derivedACNode2.occurrence,
    nodes: Object.freeze([derivedACNode1, derivedACNode2]),
  });
  replayProofAset(memory, derivedACProof);
  replayStructuralDerivedDerivationSchema(memory, strictEvidence(memory, derivedACProof, false));
  assert(memory.find(theory, derivedAC.derivationRule) === undefined,
    "P2 derived DR3 remains outside primitive Theory admissions");

  const targetAD = defineSchema(d, [a]);
  const targetADIdentity = memory.ensure(targetAD.derivationRule, theory);
  const targetADA = memory.ensure(a, targetADIdentity);

  // Incoming DR3 -> Theory identity has zero authority by itself. Presenting it
  // as though it were a primitive Theory -> DR3 admission must fail closed.
  const directDerivedPremises = materializeExactSequence(memory, [targetADA]);
  const directDerivedOccurrence = memory.ensure(derivedAC.derivationRule, directDerivedPremises);
  const directDerivedNode: StructuralDerivedDerivationNodeEvidence = Object.freeze({
    occurrence: directDerivedOccurrence,
    derivationRule: derivedAC.derivationRule,
    ruleAdmission: r2.ruleAdmission,
    derivationRuleAdmission: derivedACIdentity,
    premiseOccurrenceSequence: directDerivedPremises,
  });
  const directConsumer = makeNode(memory, r4, [directDerivedOccurrence]);
  expectSchemaError("derivation-rule-not-admitted", () =>
    replayStructuralDerivedDerivationSchema(memory, {
      identity: targetADIdentity,
      targetOccurrence: directConsumer.occurrence,
      assumptions: Object.freeze([{ occurrence: targetADA, template: a }]),
      nodes: Object.freeze([directDerivedNode, directConsumer]),
    }));

  // Instead expand the complete carried proof Aset into the consuming Aset.
  const expandedAC = expandProofAset(memory, derivedACProof, targetADIdentity);
  const expandedConsumer = makeNode(memory, r4, [expandedAC.targetOccurrence]);
  const targetADProof: ProofAsetEvidence = Object.freeze({
    identity: targetADIdentity,
    targetOccurrence: expandedConsumer.occurrence,
    nodes: Object.freeze([...expandedAC.nodes, expandedConsumer]),
  });
  const p2 = replayProofAset(memory, targetADProof);
  same(p2.conclusionTemplate, d, "P2 expanded proof-Aset conclusion");
  replayStructuralDerivedDerivationSchema(memory, strictEvidence(memory, targetADProof, false));
  assert(memory.find(theory, derivedAC.derivationRule) === undefined,
    "P2 expansion does not promote source derived DR3");
  assert(memory.find(theory, targetAD.derivationRule) === undefined,
    "P2 expansion does not promote target DR5");

  // ---------------------------------------------------------------------------
  // P3: shared occurrence reuse and proof-carrying derived expansion compose.
  // ---------------------------------------------------------------------------
  const targetABBD = defineSchema(d, [a, b, b]);
  const targetABBDIdentity = memory.ensure(targetABBD.derivationRule, theory);
  const expandedRepeated = expandProofAset(memory, repeatedProof, targetABBDIdentity);
  const repeatedConsumer = makeNode(memory, r4, [expandedRepeated.targetOccurrence]);
  const targetABBDProof: ProofAsetEvidence = Object.freeze({
    identity: targetABBDIdentity,
    targetOccurrence: repeatedConsumer.occurrence,
    nodes: Object.freeze([...expandedRepeated.nodes, repeatedConsumer]),
  });
  const targetABBDB = memory.ensure(b, targetABBDIdentity);
  const p3Before = memory.linkCount;
  const p3 = replayProofAset(memory, targetABBDProof);
  same(p3.conclusionTemplate, d, "P3 composed proof-Aset conclusion");
  same(p3.assumptionTemplateCount, 2, "P3 semantic assumption templates");
  same(dependencyReferenceCount(memory, targetABBDProof.nodes, targetABBDB), 2,
    "P3 shared B occurrence survives proof-Aset expansion");
  same(memory.linkCount, p3Before, "P3 replay read-only");

  expectSchemaError("target-assumption-mismatch", () =>
    replayStructuralDerivedDerivationSchema(memory, strictEvidence(memory, targetABBDProof, false)));
  expectSchemaError("duplicate-occurrence", () =>
    replayStructuralDerivedDerivationSchema(memory, strictEvidence(memory, targetABBDProof, true)));
  assert(memory.find(theory, repeatedTarget.derivationRule) === undefined,
    "P3 source repeated derived DR remains unadmitted");
  assert(memory.find(theory, targetABBD.derivationRule) === undefined,
    "P3 target repeated derived DR remains unadmitted");

  // Final read-only/revision guard over the completed synthetic proof-Aset corpus.
  const revisionBefore = await computePortableStructuralTheoryRevision(
    exportPortableStructuralTheory(memory, theory),
  );
  const finalBefore = memory.linkCount;
  replayProofAset(memory, repeatedProof);
  replayProofAset(memory, targetADProof);
  replayProofAset(memory, targetABBDProof);
  same(memory.linkCount, finalBefore, "synthetic proof-Aset corpus replay read-only");
  const revisionAfter = await computePortableStructuralTheoryRevision(
    exportPortableStructuralTheory(memory, theory),
  );
  same(revisionAfter.scheme, revisionBefore.scheme, "proof-Aset replay preserves revision scheme");
  same(revisionAfter.value, revisionBefore.value, "proof-Aset replay preserves exact Theory revision");

  console.log("P1 shared proof-Aset occurrence reuse = SUPPORTED by MTS topology; strict carrier GAP");
  console.log("P2 proof-carrying derived DR composition = SUPPORTED by proof-Aset expansion");
  console.log("P3 shared occurrence + derived expansion = SUPPORTED; strict repeated-assumption carrier GAP");
}

void main();
