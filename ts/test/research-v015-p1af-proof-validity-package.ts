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
  throw new Error("research v0.15 P1af proof-validity package: " + message);
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

const VALID_PROOF = fresh();
const MEMBER = fresh();
const REQUEST = fresh();
const VERIFY_TWO = fresh();
const MEMBER_CHECK = fresh();
const CHECKED = fresh();
const CONTINUE = fresh();
const DONE = fresh();
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

const proof = (
  theory: LinkHandle,
  first: LinkHandle,
  second: LinkHandle,
): LinkHandle =>
  memory.ensure(theory, memory.ensure(first, second));
const verdict = (
  certificate: LinkHandle,
  result: LinkHandle,
): LinkHandle =>
  memory.ensure(memory.ensure(VALID_PROOF, certificate), result);
const application = (
  theory: LinkHandle,
  rule: LinkHandle,
): LinkHandle =>
  memory.ensure(memory.ensure(MEMBER, theory), rule);
const membershipState = (
  theory: LinkHandle,
  rule: LinkHandle,
  result: LinkHandle,
): LinkHandle =>
  memory.ensure(application(theory, rule), result);
const checking = (
  verdictState: LinkHandle,
  memberState: LinkHandle,
  continuation: LinkHandle,
): LinkHandle =>
  memory.ensure(
    verdictState,
    memory.ensure(
      MEMBER_CHECK,
      memory.ensure(memberState, continuation),
    ),
  );
const checked = (
  verdictState: LinkHandle,
  memberState: LinkHandle,
  continuation: LinkHandle,
): LinkHandle =>
  memory.ensure(
    verdictState,
    memory.ensure(
      CHECKED,
      memory.ensure(memberState, continuation),
    ),
  );

const packageLinks: LinkHandle[] = [
  selectedStructuralAdmission,
  selectedDerivationAdmission,
];

// Context-preserving characteristic projection.
const VERDICT_ROLE = fresh();
const CONT_ROLE = fresh();
const characteristicDictionary = defineStructuralRoleDictionary(
  memory,
  [VERDICT_ROLE, CONT_ROLE],
);
for (const sourceAdmission of pinnedObjectAdmissions) {
  const poles = memory.poles(sourceAdmission);
  same(poles.start, objectTheory, "pinned ObjectTheory source");
  const rule = poles.end;
  const before = checking(
    VERDICT_ROLE,
    membershipState(objectTheory, rule, b.U),
    CONT_ROLE,
  );
  const after = checked(
    VERDICT_ROLE,
    membershipState(objectTheory, rule, b.L),
    CONT_ROLE,
  );
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

// Static aprover program copied into derived ExecutionTheory.
const T_ROLE = fresh();
const R1_ROLE = fresh();
const R2_ROLE = fresh();
const verifierDictionary = defineStructuralRoleDictionary(
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

const proofTemplate = proof(T_ROLE, R1_ROLE, R2_ROLE);
const verdictUTemplate = verdict(proofTemplate, b.U);
const verdictLTemplate = verdict(proofTemplate, b.L);
const continuation1Template = memory.ensure(
  CONTINUE,
  memory.ensure(T_ROLE, R2_ROLE),
);

const requestTemplate = memory.ensure(
  REQUEST,
  memory.ensure(VERIFY_TWO, proofTemplate),
);
const firstCheckTemplate = checking(
  verdictUTemplate,
  membershipState(T_ROLE, R1_ROLE, b.U),
  continuation1Template,
);
const builderRule = defineStructuralRule(
  memory,
  verifierDictionary,
  memory.ensure(
    requestTemplate,
    materializeExactSequence(memory, [firstCheckTemplate]),
  ),
);
admitStaticAndRuntime(builderRule, VERIFY_TWO);

const firstCheckedTemplate = checked(
  verdictUTemplate,
  membershipState(T_ROLE, R1_ROLE, b.L),
  continuation1Template,
);
const secondCheckTemplate = checking(
  verdictUTemplate,
  membershipState(T_ROLE, R2_ROLE, b.U),
  DONE,
);
const continuationRule = defineStructuralRule(
  memory,
  verifierDictionary,
  memory.ensure(
    firstCheckedTemplate,
    materializeExactSequence(memory, [secondCheckTemplate]),
  ),
);
admitStaticAndRuntime(continuationRule, CHECKED);

const finalCheckedTemplate = checked(
  verdictUTemplate,
  membershipState(T_ROLE, R2_ROLE, b.L),
  DONE,
);
const finalRule = defineStructuralRule(
  memory,
  verifierDictionary,
  memory.ensure(
    finalCheckedTemplate,
    materializeExactSequence(memory, [verdictLTemplate]),
  ),
);
admitStaticAndRuntime(finalRule, CHECKED);

const interpreter = defineStructuralInterpreter(
  memory,
  verifierDictionary,
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
      proof(theory, first, second),
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
  materializeExactSequence(memory, [interpreter, current, expected]);

const launches: LinkHandle[] = [];

// Positive certificate: U is constructed in generation 1; generation 5 yields L.
const positiveCertificate = proof(
  objectTheory,
  structuralRule,
  derivationRule,
);
const positiveU = verdict(positiveCertificate, b.U);
const positiveL = verdict(positiveCertificate, b.L);
const positiveFirstU = checking(
  positiveU,
  membershipState(objectTheory, structuralRule, b.U),
  continuation1(objectTheory, derivationRule),
);
const positiveFirstL = checked(
  positiveU,
  membershipState(objectTheory, structuralRule, b.L),
  continuation1(objectTheory, derivationRule),
);
const positiveSecondU = checking(
  positiveU,
  membershipState(objectTheory, derivationRule, b.U),
  DONE,
);
const positiveSecondL = checked(
  positiveU,
  membershipState(objectTheory, derivationRule, b.L),
  DONE,
);
launches.push(
  launch(
    request(objectTheory, structuralRule, derivationRule),
    positiveFirstU,
  ),
  launch(positiveFirstU, positiveFirstL),
  launch(positiveFirstL, positiveSecondU),
  launch(positiveSecondU, positiveSecondL),
  launch(positiveSecondL, positiveL),
);

// Missing first cited admission: U verdict carrier is constructed, then remains.
const missingFirstCertificate = proof(
  objectTheory,
  absentRule,
  derivationRule,
);
const missingFirstU = verdict(missingFirstCertificate, b.U);
const missingFirstState = checking(
  missingFirstU,
  membershipState(objectTheory, absentRule, b.U),
  continuation1(objectTheory, derivationRule),
);
launches.push(
  launch(
    request(objectTheory, absentRule, derivationRule),
    missingFirstState,
  ),
  launch(missingFirstState, missingFirstState),
);

// Missing second cited admission: first succeeds; second U state remains.
const missingSecondCertificate = proof(
  objectTheory,
  structuralRule,
  absentRule,
);
const missingSecondU = verdict(missingSecondCertificate, b.U);
const missingSecondFirstU = checking(
  missingSecondU,
  membershipState(objectTheory, structuralRule, b.U),
  continuation1(objectTheory, absentRule),
);
const missingSecondFirstL = checked(
  missingSecondU,
  membershipState(objectTheory, structuralRule, b.L),
  continuation1(objectTheory, absentRule),
);
const missingSecondState = checking(
  missingSecondU,
  membershipState(objectTheory, absentRule, b.U),
  DONE,
);
launches.push(
  launch(
    request(objectTheory, structuralRule, absentRule),
    missingSecondFirstU,
  ),
  launch(missingSecondFirstU, missingSecondFirstL),
  launch(missingSecondFirstL, missingSecondState),
  launch(missingSecondState, missingSecondState),
);

// Ambient post-pin admission is physically loaded but has no characteristic Rule.
packageLinks.push(memory.ensure(objectTheory, absentRule));

const entry = materializeExactSequence(memory, launches);
const packageValue = Object.freeze({
  schema: "mts-v015-recursive-execution-package/v0.1",
  links: Object.freeze(packageLinks.map((link) => wire(memory, b, link))),
  entry: wire(memory, b, entry),
});

process.stdout.write(JSON.stringify(packageValue));
