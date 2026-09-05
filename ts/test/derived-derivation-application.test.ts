import { materializeExactSequence } from "../src/exact-sequence.js";
import { Memory, type LinkHandle } from "../src/memory.js";
import { ensureRootBasis } from "../src/public.js";
import {
  defineStructuralDerivationRule,
  replayStructuralDerivationWithAssumptions,
} from "../src/derivation.js";
import {
  replayStructuralDerivedDerivationSchema,
  type StructuralDerivedDerivationEvidence,
} from "../src/derived-derivation-schema.js";
import { instantiateStructuralDerivedDerivationSchema } from "../src/derived-derivation-instantiation.js";
import { replayStructuralDerivedDerivationApplication } from "../src/derived-derivation-application.js";
import {
  admitStructuralRule,
  defineStructuralInterpreter,
  defineStructuralRoleDictionary,
  defineStructuralRule,
} from "../src/structural-rule.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`derived derivation application: ${message}`);
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
  const afterContext = fresh();

  const roleA = fresh();
  const roleB = fresh();
  const roleC = fresh();
  const roleDictionary = defineStructuralRoleDictionary(memory, [roleA, roleB, roleC]);

  const premise = memory.ensure(roleA, roleB);
  const conclusion = memory.ensure(roleA, roleC);

  const targetRule = defineStructuralRule(memory, roleDictionary, conclusion);
  const targetRuleAdmission = admitStructuralRule(memory, theory, targetRule);
  const targetDerivationRule = defineStructuralDerivationRule(memory, targetRule, [premise]);
  const targetDerivationRuleAdmission = memory.ensure(theory, targetDerivationRule);

  const identity = memory.ensure(targetDerivationRule, theory);
  const assumptionOccurrence = memory.ensure(premise, identity);
  const dependencySequence = materializeExactSequence(memory, [assumptionOccurrence]);
  const targetOccurrence = memory.ensure(targetDerivationRule, dependencySequence);

  const genericEvidence: StructuralDerivedDerivationEvidence = Object.freeze({
    identity,
    targetOccurrence,
    assumptions: Object.freeze([
      Object.freeze({ occurrence: assumptionOccurrence, template: premise }),
    ]),
    nodes: Object.freeze([
      Object.freeze({
        occurrence: targetOccurrence,
        derivationRule: targetDerivationRule,
        ruleAdmission: targetRuleAdmission,
        derivationRuleAdmission: targetDerivationRuleAdmission,
        premiseOccurrenceSequence: dependencySequence,
      }),
    ]),
  });

  const generic = replayStructuralDerivedDerivationSchema(memory, genericEvidence);
  assert(generic.theory === theory, "generic replay theory");

  const x = fresh();
  const y = fresh();
  const z = fresh();
  const bindings = Object.freeze([
    Object.freeze({ role: roleA, value: x }),
    Object.freeze({ role: roleB, value: y }),
    Object.freeze({ role: roleC, value: z }),
  ]);

  const concrete = instantiateStructuralDerivedDerivationSchema(
    memory,
    genericEvidence,
    interpreter,
    afterContext,
    bindings,
  );
  const ordinary = replayStructuralDerivationWithAssumptions(memory, concrete.evidence);
  assert(ordinary.derivation.theory === theory, "ordinary replay theory");

  const before = memory.linkCount;
  const application = replayStructuralDerivedDerivationApplication(
    memory,
    genericEvidence,
    concrete.evidence,
    bindings,
  );
  assert(application.generic.theory === theory, "application generic theory");
  assert(application.concrete.derivation.theory === theory, "application concrete theory");
  assert(memory.linkCount === before, "application replay must be read-only");
}

main();
