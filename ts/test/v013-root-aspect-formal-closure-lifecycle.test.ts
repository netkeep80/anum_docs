import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.13 root-aspect FORMAL closure: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}

function sameJson(actual: unknown, expected: unknown, message: string): void {
  same(JSON.stringify(actual), JSON.stringify(expected), message);
}

const repoRoot = resolve(process.cwd(), "..");
const contract = JSON.parse(
  readFileSync(join(repoRoot, "contracts/mts-contract-v0.13.json"), "utf8"),
);
const conformance = JSON.parse(
  readFileSync(join(repoRoot, "contracts/mts-conformance-v0.13.json"), "utf8"),
);

const quartet = contract.rootAspectQuartet;
assert(quartet, "root aspect quartet is declared");
same(quartet.oneQuartetFourRoles, true, "one quartet/four roles invariant");
sameJson(
  quartet.roles,
  [
    "Link aspect",
    "Link local form",
    "Anum abit",
    "FORMAL root operator / ostensive sign",
  ],
  "four roles are explicit",
);

sameJson(
  Object.fromEntries(
    Object.entries(quartet.mapping).map(([bits, value]: [string, any]) => [
      bits,
      {
        aspect: value.aspect,
        abit: value.abit,
        arity: value.arity,
        rootWitness: value.rootWitness,
        rootLink: value.rootLink,
      },
    ]),
  ),
  {
    "11": { aspect: "ROOT", abit: "8", arity: 0, rootWitness: "8", rootLink: "R" },
    "10": { aspect: "START", abit: "9", arity: 1, rootWitness: "98", rootLink: "O" },
    "01": { aspect: "END", abit: "6", arity: 1, rootWitness: "68", rootLink: "C" },
    "00": { aspect: "PAIR", abit: "1", arity: 2, rootWitness: "19868", rootLink: "L" },
  },
  "self-incidence/aspect/abit/operator/root-witness mapping",
);

same(quartet.operatorIsRootLinkAlias, false, "operator is not a root-Link alias");
same(quartet.genericCompositionRequired, true, "generic composition is required");
same(quartet.hostTermSpecialCasesAllowed, false, "term-specific host branches forbidden");
same(quartet.derivedControl.term, "16898", "derived U control term");
same(quartet.derivedControl.expected, "U = C ⟼ O", "derived U control meaning");
same(quartet.derivedControl.isFifthAspect, false, "U is not fifth aspect");
same(quartet.derivedControl.isFifthAbit, false, "U is not fifth abit");
same(quartet.derivedControl.isFifthFormalOperator, false, "U is not fifth FORMAL operator");

same(contract.acceptanceCriteria.AC10, "green", "AC10 is green");
same(contract.candidateState.rootFormalDialectComplete, true, "root FORMAL dialect complete");
same(contract.candidateState.acceptanceCriteriaComplete, true, "acceptance criteria complete");
same(contract.acceptanceReady, false, "candidate readiness is reopened after stronger criteria");
same(contract.accepted, false, "candidate remains unaccepted");

const ac10 = conformance.acceptanceCriteriaEvidence.AC10;
same(ac10.status, "green", "AC10 evidence status");
sameJson(
  ac10.gates,
  ["ts/test/v013-root-aspect-formal-composition.test.ts"],
  "AC10 executable gate",
);

for (const vector of [
  "v013-formal-root-R-from-8",
  "v013-formal-root-O-from-98",
  "v013-formal-root-C-from-68",
  "v013-formal-root-L-from-19868",
  "v013-formal-derived-U-from-16898",
  "v013-formal-generic-unknown-finite-term",
]) {
  assert(ac10.requiredPositiveVectors.includes(vector), `positive vector required: ${vector}`);
}

for (const vector of [
  "v013-formal-root-wrong-rule-rejected",
  "v013-formal-root-wrong-theory-rejected",
  "v013-formal-root-malformed-prefix-rejected",
  "v013-formal-root-noncanonical-pair-alias-rejected",
  "v013-formal-root-no-host-term-special-case",
]) {
  assert(ac10.requiredNegativeVectors.includes(vector), `negative vector required: ${vector}`);
}

assert(
  !conformance.acceptanceBlockers.some(
    (value: string) => value.startsWith("AC10 root-aspect FORMAL closure"),
  ),
  "completed AC10 is no longer an acceptance blocker",
);
same(conformance.acceptanceReady, false, "conformance readiness is reopened after stronger criteria");
same(conformance.accepted, false, "conformance remains unaccepted");
same(contract.candidateState.readinessAuditComplete, true, "readiness audit is complete");
same(
  contract.candidateState.explicitAuthorAcceptanceRecorded,
  false,
  "explicit author acceptance remains pending",
);

console.log(
  "MTS v0.13 AC10 lifecycle: one ROOT/START/END/PAIR quartet is simultaneously aspect/form/abit/FORMAL-operator; generic fixed-Theory root closure and readiness are GREEN while explicit author acceptance remains pending.",
);
