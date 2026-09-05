import { materializeExactSequence } from "../src/exact-sequence.js";
import { Memory, type LinkHandle } from "../src/memory.js";
import { ensureRootBasis } from "../src/public.js";
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
  type StructuralDerivedDerivationReplayErrorCode,
  type StructuralDerivedDerivationEvidence,
  type StructuralDerivedDerivationNodeEvidence,
  replayStructuralDerivedDerivationSchema,
} from "../src/derived-derivation-schema.js";
import { exportPortableStructuralTheory } from "../src/portable-theory.js";
import { computePortableStructuralTheoryRevision } from "../src/portable-theory-digest.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

function expectReplayError(
  code: StructuralDerivedDerivationReplayErrorCode,
  effect: () => unknown,
): void {
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
  const otherDictionary = defineStructuralRoleDictionary(memory, [aRole, bRole, cRole]);
  const mixedDictionary = admitSchema(
    defineSchemaWithDictionary(otherDictionary, cRole, [bRole]),
  );

  const identity = memory.ensure(r3.derivationRule, theory);
  const assumptionOccurrence = memory.ensure(aRole, identity);

  const makeNode = (
    schema: AdmittedSchema,
    dependencies: readonly LinkHandle[],
  ): StructuralDerivedDerivationNodeEvidence => {
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
  const evidence: StructuralDerivedDerivationEvidence = Object.freeze({
    identity,
    targetOccurrence: node2.occurrence,
    assumptions: Object.freeze([{ occurrence: assumptionOccurrence, template: aRole }]),
    nodes: Object.freeze([node1, node2]),
  });

  const badMiddleNode = makeNode(badMiddle, [node1.occurrence]);
  const mixedDictionaryNode = makeNode(mixedDictionary, [node1.occurrence]);
  const missingDependency = fresh();
  const missingDependencyNode = makeNode(r2, [missingDependency]);
  const extraDependencyNode = makeNode(r1, [assumptionOccurrence, assumptionOccurrence]);
  const unreachablePremises = materializeExactSequence(memory, [node2.occurrence]);
  const unreachableNode: StructuralDerivedDerivationNodeEvidence = Object.freeze({
    occurrence: memory.ensure(r1.derivationRule, unreachablePremises),
    derivationRule: r1.derivationRule,
    ruleAdmission: r1.ruleAdmission,
    derivationRuleAdmission: r1.derivationRuleAdmission,
    premiseOccurrenceSequence: unreachablePremises,
  });

  return {
    memory,
    theory,
    foreignTheory,
    aRole,
    bRole,
    cRole,
    r1,
    r2,
    r3,
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
  const result = replayStructuralDerivedDerivationSchema(fx.memory, fx.evidence);
  same(result.theory, fx.theory, "template proof remains under exact T0");
  same(result.derivationRule, fx.r3.derivationRule, "template proof certifies DR3");
  same(result.conclusionTemplate, fx.cRole, "template proof derives C");
  same(result.occurrenceCount, 2, "template proof verifies both primitive nodes");
  same(fx.memory.linkCount, before, "positive template replay read-only");

  const afterArtifact = exportPortableStructuralTheory(fx.memory, fx.theory);
  const afterRevision = await computePortableStructuralTheoryRevision(afterArtifact);
  same(afterRevision.value, pinnedRevision.value, "template replay preserves exact T0 revision");

  const hostForgedNode = {
    ...fx.node1,
    derivationRuleAdmission: fx.r2.derivationRuleAdmission,
    generic: true,
    forall: true,
    derived: true,
    parametric: true,
  };
  expectReplayError("derivation-rule-not-admitted", () =>
    replayStructuralDerivedDerivationSchema(fx.memory, {
      ...fx.evidence,
      nodes: [hostForgedNode, fx.node2],
    }),
  );

  expectReplayError("rule-not-admitted", () =>
    replayStructuralDerivedDerivationSchema(fx.memory, {
      ...fx.evidence,
      nodes: [{ ...fx.node1, ruleAdmission: fx.r2.ruleAdmission }, fx.node2],
    }),
  );

  expectReplayError("premise-template-mismatch", () =>
    replayStructuralDerivedDerivationSchema(fx.memory, {
      ...fx.evidence,
      targetOccurrence: fx.badMiddleNode.occurrence,
      nodes: [fx.node1, fx.badMiddleNode],
    }),
  );

  expectReplayError("target-assumption-mismatch", () =>
    replayStructuralDerivedDerivationSchema(fx.memory, {
      ...fx.evidence,
      assumptions: [{ occurrence: fx.assumptionOccurrence, template: fx.bRole }],
    }),
  );

  expectReplayError("target-conclusion-mismatch", () =>
    replayStructuralDerivedDerivationSchema(fx.memory, {
      ...fx.evidence,
      targetOccurrence: fx.node1.occurrence,
      nodes: [fx.node1],
    }),
  );

  const foreignIdentity = fx.memory.ensure(fx.r3.derivationRule, fx.foreignTheory);
  const foreignAssumption = fx.memory.ensure(fx.aRole, foreignIdentity);
  const foreignNode1Premises = materializeExactSequence(fx.memory, [foreignAssumption]);
  const foreignNode1: StructuralDerivedDerivationNodeEvidence = {
    ...fx.node1,
    occurrence: fx.memory.ensure(fx.r1.derivationRule, foreignNode1Premises),
    premiseOccurrenceSequence: foreignNode1Premises,
  };
  const foreignNode2Premises = materializeExactSequence(fx.memory, [foreignNode1.occurrence]);
  const foreignNode2: StructuralDerivedDerivationNodeEvidence = {
    ...fx.node2,
    occurrence: fx.memory.ensure(fx.r2.derivationRule, foreignNode2Premises),
    premiseOccurrenceSequence: foreignNode2Premises,
  };
  expectReplayError("rule-not-admitted", () =>
    replayStructuralDerivedDerivationSchema(fx.memory, {
      identity: foreignIdentity,
      targetOccurrence: foreignNode2.occurrence,
      assumptions: [{ occurrence: foreignAssumption, template: fx.aRole }],
      nodes: [foreignNode1, foreignNode2],
    }),
  );

  expectReplayError("missing-dependency", () =>
    replayStructuralDerivedDerivationSchema(fx.memory, {
      ...fx.evidence,
      targetOccurrence: fx.missingDependencyNode.occurrence,
      nodes: [fx.node1, fx.missingDependencyNode],
    }),
  );

  expectReplayError("premise-count-mismatch", () =>
    replayStructuralDerivedDerivationSchema(fx.memory, {
      ...fx.evidence,
      targetOccurrence: fx.extraDependencyNode.occurrence,
      nodes: [fx.extraDependencyNode],
    }),
  );

  expectReplayError("role-dictionary-mismatch", () =>
    replayStructuralDerivedDerivationSchema(fx.memory, {
      ...fx.evidence,
      targetOccurrence: fx.mixedDictionaryNode.occurrence,
      nodes: [fx.node1, fx.mixedDictionaryNode],
    }),
  );

  const cycleAttemptSequence = materializeExactSequence(fx.memory, [fx.node2.occurrence]);
  expectReplayError("occurrence-mismatch", () =>
    replayStructuralDerivedDerivationSchema(fx.memory, {
      ...fx.evidence,
      nodes: [
        { ...fx.node1, premiseOccurrenceSequence: cycleAttemptSequence },
        fx.node2,
      ],
    }),
  );

  expectReplayError("unreachable-node", () =>
    replayStructuralDerivedDerivationSchema(fx.memory, {
      ...fx.evidence,
      nodes: [fx.node1, fx.node2, fx.unreachableNode],
    }),
  );
}

void main();
