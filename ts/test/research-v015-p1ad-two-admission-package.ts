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

function fail(message: string): never {
  throw new Error("research v0.15 P1ad two-admission package: " + message);
}
function same<T>(actual: T, expected: T, message: string): void {
  if (!Object.is(actual, expected)) {
    fail(message + ": " + String(actual) + " !== " + String(expected));
  }
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
const staticAproverTheory = memory.ensure(b.O, b.L);
const executionTheory = memory.ensure(b.C, b.L);

const MEMBER = fresh();
const REQUEST = fresh();
const VERIFY_TWO = fresh();
const MEMBER_CHECK = fresh();
const CHECKED = fresh();
const CONTINUE = fresh();
const DONE = fresh();
const ACCEPT = fresh();
const grammar = fresh();

const structuralRule = fresh();
const derivationRule = fresh();
const absentRule = fresh();

const selectedStructuralAdmission =
  memory.ensure(objectTheory, structuralRule);
const selectedDerivationAdmission =
  memory.ensure(objectTheory, derivationRule);
const pinnedObjectAdmissions = Object.freeze([
  selectedStructuralAdmission,
  selectedDerivationAdmission,
]);

const application = (theory: LinkHandle, rule: LinkHandle): LinkHandle =>
  memory.ensure(memory.ensure(MEMBER, theory), rule);
const state = (
  theory: LinkHandle,
  rule: LinkHandle,
  result: LinkHandle,
): LinkHandle =>
  memory.ensure(application(theory, rule), result);
const checking = (
  continuation: LinkHandle,
  memberState: LinkHandle,
): LinkHandle =>
  memory.ensure(
    continuation,
    memory.ensure(MEMBER_CHECK, memberState),
  );
const checked = (
  continuation: LinkHandle,
  memberState: LinkHandle,
): LinkHandle =>
  memory.ensure(
    continuation,
    memory.ensure(CHECKED, memberState),
  );

const packageLinks: LinkHandle[] = [
  selectedStructuralAdmission,
  selectedDerivationAdmission,
];

// Characteristic projection.
const K_ROLE = fresh();
const characteristicDictionary = defineStructuralRoleDictionary(
  memory,
  [K_ROLE],
);
for (const sourceAdmission of pinnedObjectAdmissions) {
  const poles = memory.poles(sourceAdmission);
  same(poles.start, objectTheory, "pinned ObjectTheory source");
  const rule = poles.end;
  const before = checking(K_ROLE, state(objectTheory, rule, b.U));
  const after = checked(K_ROLE, state(objectTheory, rule, b.L));
  const relation = defineStructuralRule(
    memory,
    characteristicDictionary,
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
  packageLinks.push(memory.ensure(MEMBER_CHECK, runtimeAdmission));
}

// Static aprover source + derived execution copy.
const T_ROLE = fresh();
const R1_ROLE = fresh();
const R2_ROLE = fresh();
const queryDictionary = defineStructuralRoleDictionary(
  memory,
  [T_ROLE, R1_ROLE, R2_ROLE],
);

function admitStaticAndRuntime(
  rule: LinkHandle,
  trigger: LinkHandle,
): void {
  packageLinks.push(
    admitStructuralRule(memory, staticAproverTheory, rule),
  );
  const runtimeAdmission = admitStructuralRule(
    memory,
    executionTheory,
    rule,
  );
  packageLinks.push(memory.ensure(trigger, runtimeAdmission));
}

const continuation1Template = memory.ensure(
  CONTINUE,
  memory.ensure(T_ROLE, R2_ROLE),
);
const requestTemplate = memory.ensure(
  REQUEST,
  memory.ensure(
    VERIFY_TWO,
    memory.ensure(T_ROLE, memory.ensure(R1_ROLE, R2_ROLE)),
  ),
);
const firstCheckTemplate = checking(
  continuation1Template,
  state(T_ROLE, R1_ROLE, b.U),
);
const builderRule = defineStructuralRule(
  memory,
  queryDictionary,
  memory.ensure(
    requestTemplate,
    materializeExactSequence(memory, [firstCheckTemplate]),
  ),
);
admitStaticAndRuntime(builderRule, VERIFY_TWO);

const firstCheckedTemplate = checked(
  continuation1Template,
  state(T_ROLE, R1_ROLE, b.L),
);
const secondCheckTemplate = checking(
  DONE,
  state(T_ROLE, R2_ROLE, b.U),
);
const continuationRule = defineStructuralRule(
  memory,
  queryDictionary,
  memory.ensure(
    firstCheckedTemplate,
    materializeExactSequence(memory, [secondCheckTemplate]),
  ),
);
admitStaticAndRuntime(continuationRule, CHECKED);

const finalDictionary = defineStructuralRoleDictionary(
  memory,
  [T_ROLE, R2_ROLE],
);
const finalCheckedTemplate = checked(
  DONE,
  state(T_ROLE, R2_ROLE, b.L),
);
const finalRule = defineStructuralRule(
  memory,
  finalDictionary,
  memory.ensure(
    finalCheckedTemplate,
    materializeExactSequence(memory, [ACCEPT]),
  ),
);
admitStaticAndRuntime(finalRule, CHECKED);

const interpreter = defineStructuralInterpreter(
  memory,
  queryDictionary,
  grammar,
  executionTheory,
);

const request = (
  theory: LinkHandle,
  first: LinkHandle,
  second: LinkHandle,
): LinkHandle =>
  memory.ensure(
    REQUEST,
    memory.ensure(
      VERIFY_TWO,
      memory.ensure(theory, memory.ensure(first, second)),
    ),
  );
const continuation1 = (
  theory: LinkHandle,
  second: LinkHandle,
): LinkHandle =>
  memory.ensure(CONTINUE, memory.ensure(theory, second));

const launch = (
  current: LinkHandle,
  expected: LinkHandle,
): LinkHandle =>
  materializeExactSequence(
    memory,
    [interpreter, current, expected],
  );

const launches: LinkHandle[] = [];

// Positive 5-generation path.
const positiveRequest =
  request(objectTheory, structuralRule, derivationRule);
const positiveFirstU = checking(
  continuation1(objectTheory, derivationRule),
  state(objectTheory, structuralRule, b.U),
);
const positiveFirstL = checked(
  continuation1(objectTheory, derivationRule),
  state(objectTheory, structuralRule, b.L),
);
const positiveSecondU = checking(
  DONE,
  state(objectTheory, derivationRule, b.U),
);
const positiveSecondL = checked(
  DONE,
  state(objectTheory, derivationRule, b.L),
);
launches.push(
  launch(positiveRequest, positiveFirstU),
  launch(positiveFirstU, positiveFirstL),
  launch(positiveFirstL, positiveSecondU),
  launch(positiveSecondU, positiveSecondL),
  launch(positiveSecondL, ACCEPT),
);

// Missing first admission: builder succeeds, membership is inert.
const missingFirstRequest =
  request(objectTheory, absentRule, derivationRule);
const missingFirstU = checking(
  continuation1(objectTheory, derivationRule),
  state(objectTheory, absentRule, b.U),
);
launches.push(
  launch(missingFirstRequest, missingFirstU),
  launch(missingFirstU, missingFirstU),
);

// Missing second admission: first membership succeeds and continuation builds
// second U request; that request is inert.
const missingSecondRequest =
  request(objectTheory, structuralRule, absentRule);
const missingSecondFirstU = checking(
  continuation1(objectTheory, absentRule),
  state(objectTheory, structuralRule, b.U),
);
const missingSecondFirstL = checked(
  continuation1(objectTheory, absentRule),
  state(objectTheory, structuralRule, b.L),
);
const missingSecondU = checking(
  DONE,
  state(objectTheory, absentRule, b.U),
);
launches.push(
  launch(missingSecondRequest, missingSecondFirstU),
  launch(missingSecondFirstU, missingSecondFirstL),
  launch(missingSecondFirstL, missingSecondU),
  launch(missingSecondU, missingSecondU),
);

// Materialize the absent ObjectTheory admission only AFTER the characteristic
// projection. Loading it in frozen A-memory must not create verifier authority.
const ambientAdmission = memory.ensure(objectTheory, absentRule);
packageLinks.push(ambientAdmission);

const entry = materializeExactSequence(memory, launches);

const packageValue = Object.freeze({
  schema: "mts-v015-recursive-execution-package/v0.1",
  links: Object.freeze(
    packageLinks.map((link) => wire(memory, b, link)),
  ),
  entry: wire(memory, b, entry),
});

process.stdout.write(JSON.stringify(packageValue));
