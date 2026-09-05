import {
  ExactSequenceError,
  materializeExactSequence,
  readExactSequence,
} from "../src/exact-sequence.js";
import {
  Memory,
  MemoryError,
  type LinkHandle,
  type ReadMemory,
} from "../src/memory.js";
import { ensureRootBasis } from "../src/public.js";
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
import { exportPortableStructuralTheory } from "../src/portable-theory.js";
import { computePortableStructuralTheoryRevision } from "../src/portable-theory-digest.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

interface GenericAssumptionEvidence {
  readonly occurrence: LinkHandle;
  readonly template: LinkHandle;
}

interface GenericTemplateNodeEvidence {
  readonly occurrence: LinkHandle;
  readonly derivationRule: LinkHandle;
  readonly ruleAdmission: LinkHandle;
  readonly derivationRuleAdmission: LinkHandle;
  readonly premiseOccurrenceSequence: LinkHandle;
}

interface GenericTemplateDerivationEvidence {
  readonly identity: LinkHandle;
  readonly targetOccurrence: LinkHandle;
  readonly assumptions: readonly GenericAssumptionEvidence[];
  readonly nodes: readonly GenericTemplateNodeEvidence[];
}

interface GenericTemplateReplayResult {
  readonly theory: LinkHandle;
  readonly derivationRule: LinkHandle;
  readonly conclusionTemplate: LinkHandle;
  readonly occurrenceCount: number;
}

type GenericTemplateReplayErrorCode =
  | "invalid-identity"
  | "invalid-target-schema"
  | "target-assumption-mismatch"
  | "invalid-assumption-occurrence"
  | "duplicate-occurrence"
  | "target-occurrence-not-found"
  | "invalid-node"
  | "occurrence-mismatch"
  | "rule-not-admitted"
  | "derivation-rule-not-admitted"
  | "role-dictionary-mismatch"
  | "premise-count-mismatch"
  | "missing-dependency"
  | "premise-template-mismatch"
  | "target-conclusion-mismatch"
  | "cyclic-dependency"
  | "unreachable-node"
  | "unused-assumption"
  | "replay-wrote";

class GenericTemplateReplayError extends Error {
  override readonly name = "GenericTemplateReplayError";

  constructor(readonly code: GenericTemplateReplayErrorCode) {
    super(code);
  }
}

function replayFail(code: GenericTemplateReplayErrorCode): never {
  throw new GenericTemplateReplayError(code);
}

function expectReplayError(
  code: GenericTemplateReplayErrorCode,
  effect: () => unknown,
): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof GenericTemplateReplayError, `${code}: wrong error type`);
    same(error.code, code, `${code}: wrong error code`);
    return;
  }
  throw new Error(`${code}: expected GenericTemplateReplayError`);
}

function verifyAdmission(
  memory: ReadMemory,
  admission: LinkHandle,
  theory: LinkHandle,
  target: LinkHandle,
  errorCode: "rule-not-admitted" | "derivation-rule-not-admitted",
): void {
  try {
    const poles = memory.poles(admission);
    if (poles.start !== theory || poles.end !== target) replayFail(errorCode);
  } catch (error) {
    if (error instanceof GenericTemplateReplayError) throw error;
    if (error instanceof MemoryError) replayFail(errorCode);
    throw error;
  }
}

/**
 * Test-local research oracle only. It proves one StructuralDerivationRule from
 * already admitted StructuralDerivationRules directly at the template level.
 * There is deliberately no Act, Context or concrete role binding here.
 */
function replayGenericTemplateDerivation(
  memory: ReadMemory,
  evidence: GenericTemplateDerivationEvidence,
): GenericTemplateReplayResult {
  const before = memory.linkCount;
  try {
    let targetDerivationRule: LinkHandle;
    let theory: LinkHandle;
    try {
      const identity = memory.poles(evidence.identity);
      targetDerivationRule = identity.start;
      theory = identity.end;
    } catch (error) {
      if (error instanceof MemoryError) replayFail("invalid-identity");
      throw error;
    }

    let targetSchema: ReturnType<typeof readStructuralDerivationRule>;
    let targetRule: ReturnType<typeof readStructuralRule>;
    try {
      targetSchema = readStructuralDerivationRule(memory, targetDerivationRule);
      targetRule = readStructuralRule(memory, targetSchema.structuralRule);
      readStructuralRoleDictionary(memory, targetRule.roleDictionary);
    } catch {
      replayFail("invalid-target-schema");
    }

    if (evidence.assumptions.length !== targetSchema.premiseTemplates.length) {
      replayFail("target-assumption-mismatch");
    }

    const assumptions = new Map<LinkHandle, LinkHandle>();
    evidence.assumptions.forEach((assumption, index) => {
      const expected = targetSchema.premiseTemplates[index];
      if (expected === undefined || assumption.template !== expected) {
        replayFail("target-assumption-mismatch");
      }
      if (assumptions.has(assumption.occurrence)) replayFail("duplicate-occurrence");
      try {
        const poles = memory.poles(assumption.occurrence);
        if (poles.start !== assumption.template || poles.end !== evidence.identity) {
          replayFail("invalid-assumption-occurrence");
        }
      } catch (error) {
        if (error instanceof GenericTemplateReplayError) throw error;
        if (error instanceof MemoryError) replayFail("invalid-assumption-occurrence");
        throw error;
      }
      assumptions.set(assumption.occurrence, assumption.template);
    });

    const nodes = new Map<LinkHandle, GenericTemplateNodeEvidence>();
    for (const node of evidence.nodes) {
      if (assumptions.has(node.occurrence) || nodes.has(node.occurrence)) {
        replayFail("duplicate-occurrence");
      }
      nodes.set(node.occurrence, node);
    }
    if (!nodes.has(evidence.targetOccurrence)) replayFail("target-occurrence-not-found");

    const active = new Set<LinkHandle>();
    const verified = new Map<LinkHandle, LinkHandle>();
    const usedAssumptions = new Set<LinkHandle>();

    const resolveDependency = (occurrence: LinkHandle): LinkHandle => {
      const assumption = assumptions.get(occurrence);
      if (assumption !== undefined) {
        usedAssumptions.add(occurrence);
        return assumption;
      }
      if (!nodes.has(occurrence)) replayFail("missing-dependency");
      return verifyNode(occurrence);
    };

    const verifyNode = (occurrence: LinkHandle): LinkHandle => {
      const cached = verified.get(occurrence);
      if (cached !== undefined) return cached;
      if (active.has(occurrence)) replayFail("cyclic-dependency");
      const node = nodes.get(occurrence);
      if (node === undefined) replayFail("missing-dependency");

      active.add(occurrence);
      try {
        let schema: ReturnType<typeof readStructuralDerivationRule>;
        let rule: ReturnType<typeof readStructuralRule>;
        try {
          schema = readStructuralDerivationRule(memory, node.derivationRule);
          rule = readStructuralRule(memory, schema.structuralRule);
          readStructuralRoleDictionary(memory, rule.roleDictionary);
        } catch {
          replayFail("invalid-node");
        }

        if (rule.roleDictionary !== targetRule.roleDictionary) {
          replayFail("role-dictionary-mismatch");
        }

        verifyAdmission(
          memory,
          node.ruleAdmission,
          theory,
          schema.structuralRule,
          "rule-not-admitted",
        );
        verifyAdmission(
          memory,
          node.derivationRuleAdmission,
          theory,
          node.derivationRule,
          "derivation-rule-not-admitted",
        );

        try {
          const occurrencePoles = memory.poles(node.occurrence);
          if (
            occurrencePoles.start !== node.derivationRule ||
            occurrencePoles.end !== node.premiseOccurrenceSequence
          ) {
            replayFail("occurrence-mismatch");
          }
        } catch (error) {
          if (error instanceof GenericTemplateReplayError) throw error;
          if (error instanceof MemoryError) replayFail("occurrence-mismatch");
          throw error;
        }

        let dependencies: readonly LinkHandle[];
        try {
          dependencies = readExactSequence(memory, node.premiseOccurrenceSequence).values;
        } catch (error) {
          if (error instanceof ExactSequenceError || error instanceof MemoryError) {
            replayFail("invalid-node");
          }
          throw error;
        }
        if (dependencies.length !== schema.premiseTemplates.length) {
          replayFail("premise-count-mismatch");
        }

        dependencies.forEach((dependencyOccurrence, index) => {
          const expectedTemplate = schema.premiseTemplates[index];
          if (expectedTemplate === undefined) replayFail("premise-count-mismatch");
          const actualTemplate = resolveDependency(dependencyOccurrence);
          if (actualTemplate !== expectedTemplate) replayFail("premise-template-mismatch");
        });

        verified.set(occurrence, rule.body);
        return rule.body;
      } finally {
        active.delete(occurrence);
      }
    };

    const conclusionTemplate = verifyNode(evidence.targetOccurrence);
    if (conclusionTemplate !== targetRule.body) replayFail("target-conclusion-mismatch");
    if (verified.size !== nodes.size) replayFail("unreachable-node");
    if (usedAssumptions.size !== assumptions.size) replayFail("unused-assumption");
    if (memory.linkCount !== before) replayFail("replay-wrote");

    return Object.freeze({
      theory,
      derivationRule: targetDerivationRule,
      conclusionTemplate,
      occurrenceCount: verified.size,
    });
  } catch (error) {
    if (error instanceof GenericTemplateReplayError) throw error;
    if (error instanceof MemoryError || error instanceof ExactSequenceError) {
      throw new GenericTemplateReplayError("invalid-node");
    }
    throw error;
  } finally {
    if (memory.linkCount !== before) throw new GenericTemplateReplayError("replay-wrote");
  }
}

interface Schema {
  readonly rule: LinkHandle;
  readonly derivationRule: LinkHandle;
}

interface AdmittedSchema extends Schema {
  readonly ruleAdmission: LinkHandle;
  readonly derivationRuleAdmission: LinkHandle;
}

function fixture() {
  const memory = new Memory();
  const { R, L, U } = ensureRootBasis(memory);
  let cursor = memory.ensure(U, R);
  const fresh = (): LinkHandle => (cursor = memory.ensure(cursor, R));

  const theory = memory.ensure(L, U);
  const foreignTheory = memory.ensure(U, L);
  const aRole = fresh();
  const bRole = fresh();
  const cRole = fresh();
  const dRole = fresh();
  const roleDictionary = defineStructuralRoleDictionary(memory, [aRole, bRole, cRole, dRole]);

  const defineSchemaWithDictionary = (
    selectedDictionary: LinkHandle,
    body: LinkHandle,
    premises: readonly LinkHandle[],
  ): Schema => {
    const rule = defineStructuralRule(memory, selectedDictionary, body);
    const derivationRule = defineStructuralDerivationRule(memory, rule, premises);
    return { rule, derivationRule };
  };
  const defineSchema = (body: LinkHandle, premises: readonly LinkHandle[]) =>
    defineSchemaWithDictionary(roleDictionary, body, premises);
  const admitSchema = (schema: Schema): AdmittedSchema => ({
    ...schema,
    ruleAdmission: admitStructuralRule(memory, theory, schema.rule),
    derivationRuleAdmission: admitStructuralDerivationRule(memory, theory, schema.derivationRule),
  });

  const r1 = admitSchema(defineSchema(bRole, [aRole]));
  const r2 = admitSchema(defineSchema(cRole, [bRole]));
  const r3 = defineSchema(cRole, [aRole]);
  const badMiddle = admitSchema(defineSchema(cRole, [dRole]));
  const wrongTargetPremise = defineSchema(cRole, [bRole]);
  const wrongTargetConclusion = defineSchema(dRole, [aRole]);
  const otherDictionary = defineStructuralRoleDictionary(memory, [aRole, bRole, cRole]);
  const mixedDictionary = admitSchema(
    defineSchemaWithDictionary(otherDictionary, cRole, [bRole]),
  );

  const identity = memory.ensure(r3.derivationRule, theory);
  const assumptionOccurrence = memory.ensure(aRole, identity);

  const makeNode = (
    schema: AdmittedSchema,
    dependencies: readonly LinkHandle[],
  ): GenericTemplateNodeEvidence => {
    const premiseOccurrenceSequence = materializeExactSequence(memory, dependencies);
    const occurrence = memory.ensure(schema.derivationRule, premiseOccurrenceSequence);
    return Object.freeze({
      occurrence,
      derivationRule: schema.derivationRule,
      ruleAdmission: schema.ruleAdmission,
      derivationRuleAdmission: schema.derivationRuleAdmission,
      premiseOccurrenceSequence,
    });
  };

  const node1 = makeNode(r1, [assumptionOccurrence]);
  const node2 = makeNode(r2, [node1.occurrence]);
  const evidence: GenericTemplateDerivationEvidence = Object.freeze({
    identity,
    targetOccurrence: node2.occurrence,
    assumptions: Object.freeze([{ occurrence: assumptionOccurrence, template: aRole }]),
    nodes: Object.freeze([node1, node2]),
  });

  // All malformed alternatives are materialized before the exact-T0 revision is
  // pinned, so every subsequent verifier call can be required to stay read-only.
  const badMiddleNode = makeNode(badMiddle, [node1.occurrence]);
  const mixedDictionaryNode = makeNode(mixedDictionary, [node1.occurrence]);
  const missingDependency = fresh();
  const missingDependencyNode = makeNode(r2, [missingDependency]);
  const extraDependencyNode = makeNode(r1, [assumptionOccurrence, assumptionOccurrence]);
  const cycleAttemptSequence = materializeExactSequence(memory, [node2.occurrence]);
  const unreachableNode: GenericTemplateNodeEvidence = Object.freeze({
    ...r1,
    occurrence: memory.ensure(r1.derivationRule, cycleAttemptSequence),
    ruleAdmission: r1.ruleAdmission,
    derivationRuleAdmission: r1.derivationRuleAdmission,
    premiseOccurrenceSequence: cycleAttemptSequence,
  });

  return {
    memory,
    theory,
    foreignTheory,
    aRole,
    bRole,
    cRole,
    dRole,
    r1,
    r2,
    r3,
    wrongTargetPremise,
    wrongTargetConclusion,
    identity,
    assumptionOccurrence,
    node1,
    node2,
    evidence,
    badMiddleNode,
    mixedDictionaryNode,
    missingDependencyNode,
    extraDependencyNode,
    unreachableNode,
  };
}

async function main(): Promise<void> {
  const fx = fixture();

  // The derived identity is incoming metadata DR3 -> T0, not primitive authority.
  const identityPoles = fx.memory.poles(fx.identity);
  same(identityPoles.start, fx.r3.derivationRule, "derived identity starts at DR3");
  same(identityPoles.end, fx.theory, "derived identity ends at T0");
  assert(
    fx.memory.find(fx.theory, fx.r3.derivationRule) === undefined,
    "DR3 must remain outside primitive Theory admissions",
  );

  const pinnedArtifact = exportPortableStructuralTheory(fx.memory, fx.theory);
  const pinnedRevision = await computePortableStructuralTheoryRevision(pinnedArtifact);

  const before = fx.memory.linkCount;
  const result = replayGenericTemplateDerivation(fx.memory, fx.evidence);
  same(result.theory, fx.theory, "template proof remains under exact T0");
  same(result.derivationRule, fx.r3.derivationRule, "template proof certifies DR3");
  same(result.conclusionTemplate, fx.cRole, "template proof derives C");
  same(result.occurrenceCount, 2, "template proof verifies both primitive nodes");
  same(fx.memory.linkCount, before, "positive template replay read-only");

  const afterArtifact = exportPortableStructuralTheory(fx.memory, fx.theory);
  const afterRevision = await computePortableStructuralTheoryRevision(afterArtifact);
  same(afterRevision.value, pinnedRevision.value, "template replay preserves exact T0 revision");

  // Wrong primitive authority cannot be repaired by host generic labels.
  const wrongDrAdmissionNode = {
    ...fx.node1,
    derivationRuleAdmission: fx.r2.derivationRuleAdmission,
    generic: true,
    forall: true,
    derived: true,
    parametric: true,
  };
  expectReplayError("derivation-rule-not-admitted", () =>
    replayGenericTemplateDerivation(fx.memory, {
      ...fx.evidence,
      nodes: [wrongDrAdmissionNode, fx.node2],
    }),
  );

  const wrongRuleAdmissionNode = {
    ...fx.node1,
    ruleAdmission: fx.r2.ruleAdmission,
  };
  expectReplayError("rule-not-admitted", () =>
    replayGenericTemplateDerivation(fx.memory, {
      ...fx.evidence,
      nodes: [wrongRuleAdmissionNode, fx.node2],
    }),
  );

  expectReplayError("premise-template-mismatch", () =>
    replayGenericTemplateDerivation(fx.memory, {
      ...fx.evidence,
      targetOccurrence: fx.badMiddleNode.occurrence,
      nodes: [fx.node1, fx.badMiddleNode],
    }),
  );

  expectReplayError("target-assumption-mismatch", () =>
    replayGenericTemplateDerivation(fx.memory, {
      ...fx.evidence,
      assumptions: [{ occurrence: fx.assumptionOccurrence, template: fx.bRole }],
    }),
  );

  expectReplayError("target-conclusion-mismatch", () =>
    replayGenericTemplateDerivation(fx.memory, {
      ...fx.evidence,
      targetOccurrence: fx.node1.occurrence,
      nodes: [fx.node1],
    }),
  );

  const wrongPremiseIdentity = fx.memory.ensure(
    fx.wrongTargetPremise.derivationRule,
    fx.theory,
  );
  const wrongPremiseAssumption = fx.memory.ensure(fx.aRole, wrongPremiseIdentity);
  expectReplayError("target-assumption-mismatch", () =>
    replayGenericTemplateDerivation(fx.memory, {
      identity: wrongPremiseIdentity,
      targetOccurrence: fx.node2.occurrence,
      assumptions: [{ occurrence: wrongPremiseAssumption, template: fx.aRole }],
      nodes: [fx.node1, fx.node2],
    }),
  );

  const wrongConclusionIdentity = fx.memory.ensure(
    fx.wrongTargetConclusion.derivationRule,
    fx.theory,
  );
  const wrongConclusionAssumption = fx.memory.ensure(fx.aRole, wrongConclusionIdentity);
  expectReplayError("target-conclusion-mismatch", () =>
    replayGenericTemplateDerivation(fx.memory, {
      identity: wrongConclusionIdentity,
      targetOccurrence: fx.node2.occurrence,
      assumptions: [{ occurrence: wrongConclusionAssumption, template: fx.aRole }],
      nodes: [fx.node1, fx.node2],
    }),
  );

  const foreignIdentity = fx.memory.ensure(fx.r3.derivationRule, fx.foreignTheory);
  const foreignAssumption = fx.memory.ensure(fx.aRole, foreignIdentity);
  const foreignNode1Premises = materializeExactSequence(fx.memory, [foreignAssumption]);
  const foreignNode1 = {
    ...fx.node1,
    occurrence: fx.memory.ensure(fx.r1.derivationRule, foreignNode1Premises),
    premiseOccurrenceSequence: foreignNode1Premises,
  };
  const foreignNode2Premises = materializeExactSequence(fx.memory, [foreignNode1.occurrence]);
  const foreignNode2 = {
    ...fx.node2,
    occurrence: fx.memory.ensure(fx.r2.derivationRule, foreignNode2Premises),
    premiseOccurrenceSequence: foreignNode2Premises,
  };
  expectReplayError("rule-not-admitted", () =>
    replayGenericTemplateDerivation(fx.memory, {
      identity: foreignIdentity,
      targetOccurrence: foreignNode2.occurrence,
      assumptions: [{ occurrence: foreignAssumption, template: fx.aRole }],
      nodes: [foreignNode1, foreignNode2],
    }),
  );

  expectReplayError("missing-dependency", () =>
    replayGenericTemplateDerivation(fx.memory, {
      ...fx.evidence,
      targetOccurrence: fx.missingDependencyNode.occurrence,
      nodes: [fx.node1, fx.missingDependencyNode],
    }),
  );

  expectReplayError("premise-count-mismatch", () =>
    replayGenericTemplateDerivation(fx.memory, {
      ...fx.evidence,
      targetOccurrence: fx.extraDependencyNode.occurrence,
      nodes: [fx.extraDependencyNode],
    }),
  );

  expectReplayError("role-dictionary-mismatch", () =>
    replayGenericTemplateDerivation(fx.memory, {
      ...fx.evidence,
      targetOccurrence: fx.mixedDictionaryNode.occurrence,
      nodes: [fx.node1, fx.mixedDictionaryNode],
    }),
  );

  // Immutable occurrence identity makes a host attempt to retarget an existing
  // node's dependency fail before it can fabricate a graph cycle.
  const cycleAttemptSequence = materializeExactSequence(fx.memory, [fx.node2.occurrence]);
  expectReplayError("occurrence-mismatch", () =>
    replayGenericTemplateDerivation(fx.memory, {
      ...fx.evidence,
      nodes: [
        { ...fx.node1, premiseOccurrenceSequence: cycleAttemptSequence },
        fx.node2,
      ],
    }),
  );

  expectReplayError("unreachable-node", () =>
    replayGenericTemplateDerivation(fx.memory, {
      ...fx.evidence,
      nodes: [fx.node1, fx.node2, fx.unreachableNode],
    }),
  );
}

void main();
