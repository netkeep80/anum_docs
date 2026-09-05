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
  replayStructuralDerivedDerivationSchema,
  type StructuralDerivedDerivationEvidence,
  type StructuralDerivedDerivationNodeEvidence,
} from "../src/derived-derivation-schema.js";
import { instantiateStructuralDerivedDerivationSchema } from "../src/derived-derivation-instantiation.js";
import { replayStructuralDerivedDerivationApplication } from "../src/derived-derivation-application.js";
import {
  admitStructuralRule,
  defineStructuralInterpreter,
  defineStructuralRoleDictionary,
  defineStructuralRule,
  type StructuralRoleBinding,
} from "../src/structural-rule.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`derived derivation application: ${message}`);
}

interface Schema {
  readonly rule: LinkHandle;
  readonly derivationRule: LinkHandle;
}

interface AdmittedSchema extends Schema {
  readonly ruleAdmission: LinkHandle;
  readonly derivationRuleAdmission: LinkHandle;
}

function main(): void {
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
  const admitSchema = (schema: Schema): AdmittedSchema => ({
    ...schema,
    ruleAdmission: admitStructuralRule(memory, theory, schema.rule),
    derivationRuleAdmission: admitStructuralDerivationRule(memory, theory, schema.derivationRule),
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

  const generic = replayStructuralDerivedDerivationSchema(memory, genericEvidence);
  assert(generic.theory === theory, "generic replay theory");
  assert(generic.derivationRule === target.derivationRule, "generic target DR");

  const x = fresh();
  const bx = fresh();
  const cx = fresh();
  const selectedBindings: readonly StructuralRoleBinding[] = Object.freeze([
    Object.freeze({ role: aRole, value: x }),
    Object.freeze({ role: bRole, value: bx }),
    Object.freeze({ role: cRole, value: cx }),
  ]);

  const concrete = instantiateStructuralDerivedDerivationSchema(
    memory,
    genericEvidence,
    interpreter,
    afterContext,
    selectedBindings,
  );
  const ordinary = replayStructuralDerivationWithAssumptions(memory, concrete.evidence);
  assert(ordinary.derivation.theory === theory, "ordinary replay theory");
  assert(ordinary.derivation.target.judgment.claim === cx, "ordinary target claim");

  const before = memory.linkCount;
  const application = replayStructuralDerivedDerivationApplication(
    memory,
    genericEvidence,
    concrete.evidence,
    selectedBindings,
  );
  assert(application.generic.theory === theory, "application generic theory");
  assert(application.concrete.derivation.theory === theory, "application concrete theory");
  assert(application.concrete.derivation.target.judgment.claim === cx, "application target claim");
  assert(memory.linkCount === before, "application replay must be read-only");
  assert(memory.find(theory, target.derivationRule) === undefined, "application must not self-admit target DR");
}

main();
