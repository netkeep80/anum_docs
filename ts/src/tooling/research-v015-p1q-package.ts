import { materializeExactSequence } from "../exact-sequence.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type RootBasis,
} from "../memory.js";
import {
  admitStructuralRule,
  defineStructuralInterpreter,
  defineStructuralRoleDictionary,
  defineStructuralRule,
} from "../structural-rule.js";
import {
  materializeV013HierarchicalCarrierFromSemanticLink,
  serializeV013HierarchicalCarrier,
} from "../v013-hierarchical-carrier.js";

function fail(message: string): never {
  throw new Error("research v0.15 P1q package: " + message);
}

function wire(
  memory: Memory,
  basis: RootBasis,
  link: LinkHandle,
): string {
  const carrier = materializeV013HierarchicalCarrierFromSemanticLink(
    memory,
    basis,
    link,
  );
  return new TextDecoder().decode(
    serializeV013HierarchicalCarrier(memory, basis, carrier),
  );
}

const memory = new Memory();
const b = ensureRootBasis(memory);

let cursor = memory.ensure(b.O, b.U);
const fresh = (): LinkHandle => {
  cursor = memory.ensure(cursor, b.C);
  return cursor;
};

const objectTheory = memory.ensure(b.L, b.C);
const executionTheory = memory.ensure(b.C, b.L);
const MEMBER = fresh();
const grammar = fresh();

const selectedRule = fresh();
const ambientRule = fresh();

const selectedAdmission = memory.ensure(objectTheory, selectedRule);

// Closed pinned authority for this bounded research package is exactly the one
// selected admission above. Projection happens before ambient/candidate data.
const emptyDictionary = defineStructuralRoleDictionary(memory, []);

const application = (
  theory: LinkHandle,
  rule: LinkHandle,
): LinkHandle =>
  memory.ensure(memory.ensure(MEMBER, theory), rule);

const state = (
  theory: LinkHandle,
  rule: LinkHandle,
  value: LinkHandle,
): LinkHandle =>
  memory.ensure(application(theory, rule), value);

const before = state(objectTheory, selectedRule, b.U);
const after = state(objectTheory, selectedRule, b.L);
const relation = defineStructuralRule(
  memory,
  emptyDictionary,
  memory.ensure(
    before,
    materializeExactSequence(memory, [after]),
  ),
);
const runtimeAdmission = admitStructuralRule(
  memory,
  executionTheory,
  relation,
);
const triggerKey = memory.poles(memory.poles(before).end).start;
const index = memory.ensure(triggerKey, runtimeAdmission);

const interpreter = defineStructuralInterpreter(
  memory,
  emptyDictionary,
  grammar,
  executionTheory,
);

// Ambient admission is introduced only after closed membership projection.
// It exists physically but has no projected runtime membership relation.
const ambientAdmission = memory.ensure(objectTheory, ambientRule);

const positiveCurrent = state(objectTheory, selectedRule, b.U);
const positiveExpected = state(objectTheory, selectedRule, b.L);
const positiveLaunch = materializeExactSequence(
  memory,
  [interpreter, positiveCurrent, positiveExpected],
);
const entry = materializeExactSequence(memory, [positiveLaunch]);

const negativeCurrent = state(objectTheory, ambientRule, b.U);
const negativeLaunch = materializeExactSequence(
  memory,
  [interpreter, negativeCurrent, negativeCurrent],
);

if (memory.find(objectTheory, ambientRule) !== ambientAdmission) {
  fail("ambient physical admission missing");
}
if (positiveCurrent === positiveExpected) {
  fail("positive U/L states collapsed");
}

const packageValue = Object.freeze({
  schema: "mts-v015-recursive-execution-package/v0.1",
  links: Object.freeze([
    wire(memory, b, selectedAdmission),
    wire(memory, b, ambientAdmission),
    wire(memory, b, index),
  ]),
  entry: wire(memory, b, entry),
  negativeEntry: wire(memory, b, negativeLaunch),
});

process.stdout.write(JSON.stringify(packageValue));
