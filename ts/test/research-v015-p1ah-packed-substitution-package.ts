import { materializeExactSequence } from "../src/exact-sequence.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type RootBasis,
} from "../src/memory.js";
import {
  admitStructuralRule,
  defineStructuralInterpreter,
  defineStructuralRoleDictionary,
  defineStructuralRule,
} from "../src/structural-rule.js";
import {
  materializeV013HierarchicalCarrierFromSemanticLink,
  serializeV013HierarchicalCarrier,
} from "../src/v013-hierarchical-carrier.js";

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

const staticAproverTheory = memory.ensure(b.O, b.L);
const executionTheory = memory.ensure(b.C, b.L);
const CURRENT = fresh();
const SUBST_CHECK = fresh();
const ENTRY = fresh();
const SUBST_OK = fresh();
const grammar = fresh();

const S = fresh();
const K = fresh();
const A = fresh();
const B = fresh();
const dictionary = defineStructuralRoleDictionary(memory, [S, K, A, B]);

const current = (scope: LinkHandle, witness: LinkHandle): LinkHandle =>
  memory.ensure(CURRENT, memory.ensure(scope, witness));

const conclusionTemplate = current(S, memory.ensure(K, B));
const premiseTruthTemplate = current(S, memory.ensure(K, A));
const premiseRuleTemplate = current(S, memory.ensure(A, B));
const packedTemplate = materializeExactSequence(
  memory,
  [conclusionTemplate, premiseTruthTemplate, premiseRuleTemplate],
);
const antecedentTemplate = memory.ensure(
  ENTRY,
  memory.ensure(SUBST_CHECK, packedTemplate),
);
const verifierRule = defineStructuralRule(
  memory,
  dictionary,
  memory.ensure(
    antecedentTemplate,
    materializeExactSequence(memory, [SUBST_OK]),
  ),
);
const sourceAdmission = admitStructuralRule(
  memory,
  staticAproverTheory,
  verifierRule,
);
const runtimeAdmission = admitStructuralRule(
  memory,
  executionTheory,
  verifierRule,
);
const runtimeIndex = memory.ensure(SUBST_CHECK, runtimeAdmission);

const interpreter = defineStructuralInterpreter(
  memory,
  dictionary,
  grammar,
  executionTheory,
);

const actualS = fresh();
const actualK = fresh();
const actualA = fresh();
const actualB = fresh();
const otherA = fresh();

const actualConclusion = current(actualS, memory.ensure(actualK, actualB));
const actualPremiseTruth = current(actualS, memory.ensure(actualK, actualA));
const actualPremiseRule = current(actualS, memory.ensure(actualA, actualB));
const conflictingPremiseRule = current(
  actualS,
  memory.ensure(otherA, actualB),
);

const packet = (values: readonly LinkHandle[]): LinkHandle =>
  memory.ensure(
    ENTRY,
    memory.ensure(
      SUBST_CHECK,
      materializeExactSequence(memory, values),
    ),
  );
const launch = (
  active: LinkHandle,
  expected: LinkHandle,
): LinkHandle =>
  materializeExactSequence(memory, [interpreter, active, expected]);

const positive = packet([
  actualConclusion,
  actualPremiseTruth,
  actualPremiseRule,
]);
const conflict = packet([
  actualConclusion,
  actualPremiseTruth,
  conflictingPremiseRule,
]);
const swapped = packet([
  actualConclusion,
  actualPremiseRule,
  actualPremiseTruth,
]);
const missing = packet([
  actualConclusion,
  actualPremiseTruth,
]);
const extra = packet([
  actualConclusion,
  actualPremiseTruth,
  actualPremiseRule,
  actualPremiseRule,
]);

const entry = materializeExactSequence(memory, [
  launch(positive, SUBST_OK),
  launch(conflict, conflict),
  launch(swapped, swapped),
  launch(missing, missing),
  launch(extra, extra),
]);

const packageValue = Object.freeze({
  schema: "mts-v015-recursive-execution-package/v0.1",
  links: Object.freeze([
    wire(memory, b, sourceAdmission),
    wire(memory, b, runtimeIndex),
  ]),
  entry: wire(memory, b, entry),
});

process.stdout.write(JSON.stringify(packageValue));
