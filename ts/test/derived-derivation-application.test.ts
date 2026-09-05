import { Memory } from "../src/memory.js";
import {
  defineStructuralDerivationRule,
  defineStructuralProofOccurrence,
  replayStructuralDerivationWithAssumptions,
} from "../src/derivation.js";
import {
  replayStructuralDerivedDerivationSchema,
  type StructuralDerivedDerivationEvidence,
} from "../src/derived-derivation-schema.js";
import { instantiateStructuralDerivedDerivationSchema } from "../src/derived-derivation-instantiation.js";
import { replayStructuralDerivedDerivationApplication } from "../src/derived-derivation-application.js";
import { materializeExactSequence } from "../src/exact-sequence.js";
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
  const fresh = (): number => memory.ensure(memory.root, memory.ensure(memory.root, memory.root));

  const theory = fresh();
  const dictionary = fresh();
  const grammar = fresh();
  const interpreter = defineStructuralInterpreter(memory, dictionary, grammar, theory);
  const afterContext = fresh();

  const roleA = fresh();
  const roleB = fresh();
  const roleC = fresh();
  const roleDictionary = defineStructuralRoleDictionary(memory, [roleA, roleB, roleC]);

  const premise1 = memory.ensure(roleA, roleB);
  const premise2 = memory.ensure(roleB, roleC);
  const conclusion = memory.ensure(roleA, roleC);

  const rule1 = defineStructuralRule(memory, roleDictionary, premise1);
  const rule2 = defineStructuralRule(memory, roleDictionary, conclusion);
  const rule1Admission = admitStructuralRule(memory, theory, rule1);
  const rule2Admission = admitStructuralRule(memory, theory, rule2);

  const dr1 = defineStructuralDerivationRule(memory, [premise1], rule1);
  const dr2 = defineStructuralDerivationRule(memory, [premise1], rule2);
  const dr1Admission = memory.ensure(theory, dr1);
  const dr2Admission = memory.ensure(theory, dr2);

  const identity = memory.ensure(dr2, theory);
  const assumptionOccurrence = memory.ensure(premise1, identity);
  const dependencySequence = materializeExactSequence(memory, [assumptionOccurrence]);
  const targetOccurrence = memory.ensure(dr2, dependencySequence);

  const genericEvidence: StructuralDerivedDerivationEvidence = Object.freeze({
    identity,
    targetOccurrence,
    assumptions: Object.freeze([
      Object.freeze({ occurrence: assumptionOccurrence, template: premise1 }),
    ]),
    nodes: Object.freeze([
      Object.freeze({
        occurrence: targetOccurrence,
        derivationRule: dr2,
        ruleAdmission: rule2Admission,
        derivationRuleAdmission: dr2Admission,
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

  void dr1;
  void dr1Admission;
  void defineStructuralProofOccurrence;
}

main();
