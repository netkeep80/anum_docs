import { materializeExactSequence } from "../src/exact-sequence.js";
import { Memory, type LinkHandle } from "../src/memory.js";
import { ensureRootBasis } from "../src/public.js";
import { defineContext } from "../src/state.js";
import {
  admitStructuralRule,
  defineStructuralInterpreter,
  defineStructuralRoleDictionary,
  defineStructuralRule,
  type StructuralRoleBinding,
} from "../src/structural-rule.js";
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

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
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
    return {
      rule,
      derivationRule: defineStructuralDerivationRule(memory, rule, premises),
    };
  };
  const admitSchema = (schema: Schema): AdmittedSchema => ({
    ...schema,
    ruleAdmission: admitStructuralRule(memory, theory, schema.rule),
    derivationRuleAdmission: admitStructuralDerivationRule(memory, theory, schema.derivationRule),
  });

  const r1 = admitSchema(defineSchema(bRole, [aRole]));
  const r2 = admitSchema(defineSchema(cRole, [bRole]));
  const target = defineSchema(cRole, [aRole]);
  const identity = memory.ensure(target.derivationRule, theory);
  const assumptionOccurrence = memory.ensure(aRole, identity);

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

  const node1 = makeNode(r1, [assumptionOccurrence]);
  const node2 = makeNode(r2, [node1.occurrence]);
  const genericEvidence: StructuralDerivedDerivationEvidence = Object.freeze({
    identity,
    targetOccurrence: node2.occurrence,
    assumptions: Object.freeze([{ occurrence: assumptionOccurrence, template: aRole }]),
    nodes: Object.freeze([node1, node2]),
  });

  return {
    memory,
    theory,
    interpreter,
    afterContext,
    aRole,
    bRole,
    cRole,
    target,
    genericEvidence,
    fresh,
  };
}

function instantiateAndReplay(
  fx: ReturnType<typeof fixture>,
  bindings: readonly StructuralRoleBinding[],
  expectedAssumption: LinkHandle,
  expectedConclusion: LinkHandle,
): void {
  const generic = replayStructuralDerivedDerivationSchema(fx.memory, fx.genericEvidence);
  same(generic.theory, fx.theory, "generic replay theory");
  same(generic.derivationRule, fx.target.derivationRule, "generic replay target DR");

  const expansion = instantiateStructuralDerivedDerivationSchema(
    fx.memory,
    fx.genericEvidence,
    fx.interpreter,
    fx.afterContext,
    bindings,
  );

  same(expansion.assumptionClaims.length, 1, "one concrete assumption");
  same(expansion.assumptionClaims[0], expectedAssumption, "A instantiated in assumption");
  same(expansion.targetClaim, expectedConclusion, "C instantiated in conclusion");

  const beforeReplay = fx.memory.linkCount;
  const replay = replayStructuralDerivationWithAssumptions(fx.memory, expansion.evidence);
  same(replay.derivation.theory, fx.theory, "ordinary replay stays under T0");
  same(replay.derivation.target.judgment.claim, expectedConclusion, "ordinary target claim");
  same(replay.derivation.occurrenceCount, 2, "ordinary replay verifies expanded DAG");
  same(fx.memory.linkCount, beforeReplay, "ordinary replay is read-only");
  assert(
    fx.memory.find(fx.theory, fx.target.derivationRule) === undefined,
    "expansion must not self-admit the derived DR",
  );
}

function main(): void {
  const fx = fixture();

  const x = fx.fresh();
  const bx = fx.fresh();
  const cx = fx.fresh();
  instantiateAndReplay(
    fx,
    [
      { role: fx.aRole, value: x },
      { role: fx.bRole, value: bx },
      { role: fx.cRole, value: cx },
    ],
    x,
    cx,
  );
}

main();
