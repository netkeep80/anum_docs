import { materializeExactSequence } from "../src/exact-sequence.js";
import { Memory, type LinkHandle } from "../src/memory.js";
import { ensureRootBasis } from "../src/public.js";
import { defineContext } from "../src/state.js";
import {
  admitStructuralDerivationRule,
  defineStructuralDerivationRule,
  replayStructuralDerivationWithAssumptions,
} from "../src/derivation.js";
import {
  StructuralDerivedDerivationReplayError,
  replayStructuralDerivedDerivationSchema,
  type StructuralDerivedDerivationEvidence,
  type StructuralDerivedDerivationNodeEvidence,
} from "../src/derived-derivation-schema.js";
import { instantiateStructuralDerivedDerivationSchema } from "../src/derived-derivation-instantiation.js";
import {
  StructuralDerivedDerivationApplicationReplayError,
  replayStructuralDerivedDerivationApplication,
  type StructuralDerivedDerivationApplicationReplayErrorCode,
} from "../src/derived-derivation-application.js";
import {
  admitStructuralRule,
  defineStructuralInterpreter,
  defineStructuralRoleDictionary,
  defineStructuralRule,
  type StructuralRoleBinding,
} from "../src/structural-rule.js";
import { exportPortableStructuralTheory } from "../src/portable-theory.js";
import { computePortableStructuralTheoryRevision } from "../src/portable-theory-digest.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`derived derivation application: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

function expectApplicationError(
  code: StructuralDerivedDerivationApplicationReplayErrorCode,
  effect: () => unknown,
): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof StructuralDerivedDerivationApplicationReplayError, `${code}: wrong error type`);
    same(error.code, code, `${code}: wrong error code`);
    return;
  }
  throw new Error(`${code}: expected application rejection`);
}

interface Schema {
  readonly rule: LinkHandle;
  readonly derivationRule: LinkHandle;
}

interface AdmittedSchema extends Schema {
  readonly ruleAdmission: LinkHandle;
  readonly derivationRuleAdmission: LinkHandle;
}

async function main(): Promise<void> {
  const memory = new Memory();
  const { R, L, U } = ensureRootBasis(memory);
  let cursor = memory.ensure(U, R);
  const fresh = (): LinkHandle => (cursor = memory.ensure(cursor, R));

  const theory = memory.ensure(L, U);
  const dictionary = fresh();
  const grammar = fresh();
  const interpreter = defineStructuralInterpreter(memory, dictionary, grammar, theory);
  const afterContext = defineContext(memory, R, L);

  const aRole = fresh();
  const bRole = fresh();
  const cRole = fresh();
  const roleDictionary = defineStructuralRoleDictionary(memory, [aRole, bRole, cRole]);

  const defineSchema = (body: LinkHandle, premises: readonly LinkHandle[]): Schema => {
    const rule = defineStructuralRule(memory, roleDictionary, body);
    return { rule, derivationRule: defineStructuralDerivationRule(memory, rule, premises) };
  };
  const admitSchema = (schema: Schema, selectedTheory = theory): AdmittedSchema => ({
    ...schema,
    ruleAdmission: admitStructuralRule(memory, selectedTheory, schema.rule),
    derivationRuleAdmission: admitStructuralDerivationRule(
      memory,
      selectedTheory,
      schema.derivationRule,
    ),
  });
  const makeNode = (
    schema: AdmittedSchema,
    dependencies: readonly LinkHandle[],
  ): StructuralDerivedDerivationNodeEvidence => {
    const premiseOccurrenceSequence = materializeExactSequence(memory, dependencies);
    return Object.freeze({
      occurrence: memory.ensure(schema.derivationRule, premiseOccurrenceSequence),
      derivationRule: schema.derivationRule,
      ruleAdmission: schema.ruleAdmission,
      derivationRuleAdmission: schema.derivationRuleAdmission,
      premiseOccurrenceSequence,
    });
  };
  const makeOneStepEvidence = (
    target: Schema,
    selectedTheory: LinkHandle,
    assumptionTemplate: LinkHandle,
    admitted: AdmittedSchema,
  ): StructuralDerivedDerivationEvidence => {
    const identity = memory.ensure(target.derivationRule, selectedTheory);
    const assumptionOccurrence = memory.ensure(assumptionTemplate, identity);
    const node = makeNode(admitted, [assumptionOccurrence]);
    return Object.freeze({
      identity,
      targetOccurrence: node.occurrence,
      assumptions: Object.freeze([
        Object.freeze({ occurrence: assumptionOccurrence, template: assumptionTemplate }),
      ]),
      nodes: Object.freeze([node]),
    });
  };
  const selectedBindings = (
    a: LinkHandle,
    b: LinkHandle,
    c: LinkHandle,
  ): readonly StructuralRoleBinding[] =>
    Object.freeze([
      Object.freeze({ role: aRole, value: a }),
      Object.freeze({ role: bRole, value: b }),
      Object.freeze({ role: cRole, value: c }),
    ]);

  const r1 = admitSchema(defineSchema(bRole, [aRole]));
  const r2 = admitSchema(defineSchema(cRole, [bRole]));
  const target = defineSchema(cRole, [aRole]);
  assert(memory.find(theory, target.derivationRule) === undefined, "derived target DR must not be admitted");

  const identity = memory.ensure(target.derivationRule, theory);
  const assumptionOccurrence = memory.ensure(aRole, identity);
  const node1 = makeNode(r1, [assumptionOccurrence]);
  const node2 = makeNode(r2, [node1.occurrence]);
  const genericEvidence: StructuralDerivedDerivationEvidence = Object.freeze({
    identity,
    targetOccurrence: node2.occurrence,
    assumptions: Object.freeze([
      Object.freeze({ occurrence: assumptionOccurrence, template: aRole }),
    ]),
    nodes: Object.freeze([node1, node2]),
  });

  replayStructuralDerivedDerivationSchema(memory, genericEvidence);

  const x = fresh();
  const bx = fresh();
  const cx = fresh();
  const rhoX = selectedBindings(x, bx, cx);
  const concreteX = instantiateStructuralDerivedDerivationSchema(
    memory,
    genericEvidence,
    interpreter,
    afterContext,
    rhoX,
  );
  same(
    replayStructuralDerivationWithAssumptions(memory, concreteX.evidence).derivation.target.judgment.claim,
    cx,
    "ordinary rho_X target",
  );

  const revisionBefore = await computePortableStructuralTheoryRevision(
    exportPortableStructuralTheory(memory, theory),
  );
  const beforeApplication = memory.linkCount;
  const applicationX = replayStructuralDerivedDerivationApplication(
    memory,
    genericEvidence,
    concreteX.evidence,
    rhoX,
  );
  same(applicationX.generic.theory, theory, "application rho_X generic theory");
  same(applicationX.concrete.derivation.theory, theory, "application rho_X concrete theory");
  same(applicationX.concrete.derivation.target.judgment.claim, cx, "application rho_X target");
  same(memory.linkCount, beforeApplication, "application rho_X read-only");
  same(
    await computePortableStructuralTheoryRevision(exportPortableStructuralTheory(memory, theory)),
    revisionBefore,
    "application preserves exact T0 revision",
  );

  const y = fresh();
  const by = fresh();
  const cy = fresh();
  const rhoY = selectedBindings(y, by, cy);
  const secondContext = defineContext(memory, afterContext, fresh());
  const concreteY = instantiateStructuralDerivedDerivationSchema(
    memory,
    genericEvidence,
    interpreter,
    secondContext,
    rhoY,
  );
  same(
    replayStructuralDerivedDerivationApplication(memory, genericEvidence, concreteY.evidence, rhoY)
      .concrete.derivation.target.judgment.claim,
    cy,
    "independent rho_Y application",
  );

  expectApplicationError("missing-role-binding", () =>
    replayStructuralDerivedDerivationApplication(memory, genericEvidence, concreteX.evidence, rhoX.slice(0, 2)),
  );
  expectApplicationError("duplicate-role-binding", () =>
    replayStructuralDerivedDerivationApplication(memory, genericEvidence, concreteX.evidence, [
      ...rhoX,
      { role: aRole, value: y },
    ]),
  );
  expectApplicationError("undeclared-role-binding", () =>
    replayStructuralDerivedDerivationApplication(memory, genericEvidence, concreteX.evidence, [
      ...rhoX,
      { role: fresh(), value: y },
    ]),
  );
  expectApplicationError("role-valued-binding", () =>
    replayStructuralDerivedDerivationApplication(memory, genericEvidence, concreteX.evidence, [
      { role: aRole, value: bRole },
      { role: bRole, value: bx },
      { role: cRole, value: cx },
    ]),
  );

  const unrelatedEvidence = makeOneStepEvidence(r1, theory, aRole, r1);
  replayStructuralDerivedDerivationSchema(memory, unrelatedEvidence);
  const unrelatedConcrete = instantiateStructuralDerivedDerivationSchema(
    memory,
    unrelatedEvidence,
    interpreter,
    defineContext(memory, secondContext, fresh()),
    rhoX,
  );
  replayStructuralDerivationWithAssumptions(memory, unrelatedConcrete.evidence);
  expectApplicationError("target-instance-mismatch", () =>
    replayStructuralDerivedDerivationApplication(
      memory,
      genericEvidence,
      unrelatedConcrete.evidence,
      rhoX,
    ),
  );

  const wrongPremiseEvidence = makeOneStepEvidence(r2, theory, bRole, r2);
  replayStructuralDerivedDerivationSchema(memory, wrongPremiseEvidence);
  const wrongPremiseConcrete = instantiateStructuralDerivedDerivationSchema(
    memory,
    wrongPremiseEvidence,
    interpreter,
    defineContext(memory, secondContext, fresh()),
    rhoX,
  );
  replayStructuralDerivationWithAssumptions(memory, wrongPremiseConcrete.evidence);
  expectApplicationError("premise-instance-mismatch", () =>
    replayStructuralDerivedDerivationApplication(
      memory,
      genericEvidence,
      wrongPremiseConcrete.evidence,
      rhoX,
    ),
  );

  const foreignTheory = memory.ensure(fresh(), fresh());
  const foreignInterpreter = defineStructuralInterpreter(memory, fresh(), fresh(), foreignTheory);
  const foreignR1 = admitSchema(r1, foreignTheory);
  const foreignR2 = admitSchema(r2, foreignTheory);
  const foreignIdentity = memory.ensure(target.derivationRule, foreignTheory);
  const foreignAssumptionOccurrence = memory.ensure(aRole, foreignIdentity);
  const foreignNode1 = makeNode(foreignR1, [foreignAssumptionOccurrence]);
  const foreignNode2 = makeNode(foreignR2, [foreignNode1.occurrence]);
  const foreignGeneric: StructuralDerivedDerivationEvidence = Object.freeze({
    identity: foreignIdentity,
    targetOccurrence: foreignNode2.occurrence,
    assumptions: Object.freeze([
      Object.freeze({ occurrence: foreignAssumptionOccurrence, template: aRole }),
    ]),
    nodes: Object.freeze([foreignNode1, foreignNode2]),
  });
  replayStructuralDerivedDerivationSchema(memory, foreignGeneric);
  const foreignConcrete = instantiateStructuralDerivedDerivationSchema(
    memory,
    foreignGeneric,
    foreignInterpreter,
    defineContext(memory, secondContext, fresh()),
    rhoX,
  );
  same(
    replayStructuralDerivationWithAssumptions(memory, foreignConcrete.evidence).derivation.theory,
    foreignTheory,
    "foreign ordinary replay is independently GREEN",
  );
  expectApplicationError("theory-mismatch", () =>
    replayStructuralDerivedDerivationApplication(memory, genericEvidence, foreignConcrete.evidence, rhoX),
  );

  const malformedGeneric: StructuralDerivedDerivationEvidence = Object.freeze({
    ...genericEvidence,
    nodes: Object.freeze([
      Object.freeze({ ...node1, derivationRuleAdmission: memory.ensure(fresh(), fresh()) }),
      node2,
    ]),
  });
  try {
    replayStructuralDerivedDerivationApplication(memory, malformedGeneric, concreteX.evidence, rhoX);
  } catch (error) {
    assert(error instanceof StructuralDerivedDerivationReplayError, "malformed generic must fail in generic replay");
    assert(memory.find(theory, target.derivationRule) === undefined, "rejection must not self-admit target DR");
    return;
  }
  throw new Error("malformed generic support must be rejected");
}

void main();
