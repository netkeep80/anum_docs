import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { materializeExactSequence, readExactSequence } from "../src/exact-sequence.js";
import { Memory, ensureRootBasis, type LinkHandle, type RootBasis } from "../src/memory.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.13 A55 Rule-native contract: ${message}`);
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}
function sameSet(actual: readonly LinkHandle[], expected: readonly LinkHandle[], message: string): void {
  const a = new Set(actual), e = new Set(expected);
  same(a.size, actual.length, `${message} actual unique`);
  same(e.size, expected.length, `${message} expected unique`);
  same(a.size, e.size, `${message} cardinality`);
  for (const value of e) assert(a.has(value), `${message}: missing expected`);
}

interface RuleShape {
  readonly rule: LinkHandle;
  readonly roles: readonly LinkHandle[];
  readonly equations: readonly LinkHandle[];
}
function makeRoles(memory: Memory, basis: RootBasis): readonly LinkHandle[] {
  const marker = memory.ensure(basis.U, basis.U);
  let cursor = memory.ensure(basis.O, marker);
  const roles: LinkHandle[] = [];
  for (let i = 0; i < 8; i += 1) {
    cursor = memory.ensure(cursor, i % 2 === 0 ? basis.L : basis.C);
    roles.push(cursor);
  }
  same(new Set(roles).size, 8, "A55 roles distinct");
  return Object.freeze(roles);
}
function equation(
  memory: Memory,
  target: LinkHandle,
  start: LinkHandle,
  end: LinkHandle,
): LinkHandle {
  return memory.ensure(target, memory.ensure(start, end));
}
/**
 * Rule-native semantic form:
 *
 * Rule = RolesCarrier -> EquationsCarrier
 * Equation = TargetRole -> (StartRole -> EndRole)
 *
 * There is no derived Contract, no free-role list and no constrained-target list.
 */
function defineRule(
  memory: Memory,
  basis: RootBasis,
  reverseRoles: boolean,
  reverseEquations: boolean,
): RuleShape {
  const roles = makeRoles(memory, basis);
  const equations = Object.freeze([
    equation(memory, roles[3]!, roles[1]!, roles[2]!),
    equation(memory, roles[6]!, roles[3]!, roles[4]!),
    equation(memory, roles[7]!, roles[3]!, roles[5]!),
  ]);
  const roleCarrier = materializeExactSequence(memory, reverseRoles ? [...roles].reverse() : roles);
  const equationCarrier = materializeExactSequence(
    memory,
    reverseEquations ? [...equations].reverse() : equations,
  );
  return Object.freeze({
    rule: memory.ensure(roleCarrier, equationCarrier),
    roles,
    equations,
  });
}
function readRuleCarriers(memory: Memory, rule: LinkHandle): {
  readonly roles: readonly LinkHandle[];
  readonly equations: readonly LinkHandle[];
} {
  const p = memory.poles(rule);
  return Object.freeze({
    roles: readExactSequence(memory, p.start).values,
    equations: readExactSequence(memory, p.end).values,
  });
}
function equationTarget(memory: Memory, value: LinkHandle): LinkHandle {
  return memory.poles(value).start;
}

function realization(
  memory: Memory,
  inputRoles: readonly LinkHandle[],
  equations: readonly LinkHandle[],
): LinkHandle {
  return memory.ensure(
    materializeExactSequence(memory, inputRoles),
    materializeExactSequence(memory, equations),
  );
}
function request(
  memory: Memory,
  context: LinkHandle,
  rule: LinkHandle,
  candidateRealization: LinkHandle,
): LinkHandle {
  return memory.ensure(context, memory.ensure(rule, candidateRealization));
}

/**
 * A55 oracle: validate directly against Rule carriers.
 *
 * This intentionally remains a host extensional validator. A55 removes the
 * Rule->derived-Contract semantic source, not the already separately attacked
 * A43-A45 validation boundary.
 */
function validateRuleDirect(
  memory: Memory,
  selectedRequest: LinkHandle,
): LinkHandle | undefined {
  const selected = memory.poles(selectedRequest);
  const context = selected.start;
  const pair = memory.poles(selected.end);
  const rule = pair.start;
  const candidateRealization = pair.end;

  const expected = readRuleCarriers(memory, rule);
  const proposedPoles = memory.poles(candidateRealization);
  const proposedInputs = readExactSequence(memory, proposedPoles.start).values;
  const proposedEquations = readExactSequence(memory, proposedPoles.end).values;

  const roleCoverage = [
    ...proposedInputs,
    ...proposedEquations.map(value => equationTarget(memory, value)),
  ];

  try {
    sameSet(roleCoverage, expected.roles, "A55 direct Rule role coverage");
    sameSet(proposedEquations, expected.equations, "A55 direct Rule equation coverage");
  } catch {
    return undefined;
  }
  return memory.ensure(context, candidateRealization);
}

/** Historical A42 meaning, reference oracle only. */
function legacyProjection(memory: Memory, rule: LinkHandle): {
  readonly free: readonly LinkHandle[];
  readonly targets: readonly LinkHandle[];
} {
  const current = readRuleCarriers(memory, rule);
  const targets = current.equations.map(value => equationTarget(memory, value));
  const constrained = new Set(targets);
  return Object.freeze({
    free: Object.freeze(current.roles.filter(role => !constrained.has(role))),
    targets: Object.freeze(targets),
  });
}

function exercise(memory: Memory, withNoise: boolean): void {
  const basis = ensureRootBasis(memory);
  if (withNoise) memory.ensure(memory.ensure(basis.U, basis.C), basis.L);

  const forward = defineRule(memory, basis, false, false);
  const reverse = defineRule(memory, basis, true, true);
  assert(forward.rule !== reverse.rule, "A55 distinct exact Rule carrier topology");

  const forwardRead = readRuleCarriers(memory, forward.rule);
  const reverseRead = readRuleCarriers(memory, reverse.rule);
  sameSet(forwardRead.roles, reverseRead.roles, "A55 equivalent Rule role obligations");
  sameSet(forwardRead.equations, reverseRead.equations, "A55 equivalent Rule equations");

  const legacyForward = legacyProjection(memory, forward.rule);
  const legacyReverse = legacyProjection(memory, reverse.rule);
  sameSet(legacyForward.free, legacyReverse.free, "A55 legacy free-role meaning stable");
  sameSet(legacyForward.targets, legacyReverse.targets, "A55 legacy target meaning stable");
  same(legacyForward.free.length, 5, "A55 reference free-role count");
  same(legacyForward.targets.length, 3, "A55 reference target count");

  const context = memory.ensure(basis.R, basis.U);
  const validForward = realization(memory, legacyForward.free, forward.equations);
  const validReverse = realization(
    memory,
    [...legacyForward.free].reverse(),
    [...forward.equations].reverse(),
  );

  for (const rule of [forward.rule, reverse.rule]) {
    for (const valid of [validForward, validReverse]) {
      const witness = validateRuleDirect(memory, request(memory, context, rule, valid));
      assert(witness !== undefined, "A55 equivalent realization accepted");
      same(memory.poles(witness).start, context, "A55 contextual acceptance witness");
      same(memory.poles(witness).end, valid, "A55 accepted exact realization");
    }
  }

  const free = legacyForward.free;
  const eqs = forward.equations;
  const foreignRole = memory.ensure(forward.rule, basis.C);
  const foreignEquation = equation(memory, eqs[0]!, basis.C, basis.U);
  const constrainedTarget = equationTarget(memory, eqs[0]!);
  const bads = [
    realization(memory, free.slice(0, 4), eqs),
    realization(memory, [free[0]!, free[1]!, free[1]!, free[3]!, free[4]!], eqs),
    realization(memory, [free[0]!, free[1]!, free[2]!, free[3]!, foreignRole], eqs),
    realization(memory, [constrainedTarget, ...free.slice(1)], eqs),
    realization(memory, free, eqs.slice(0, 2)),
    realization(memory, free, [eqs[0]!, eqs[1]!, eqs[1]!]),
    realization(memory, free, [eqs[0]!, eqs[1]!, foreignEquation]),
  ];
  for (const bad of bads) {
    same(
      validateRuleDirect(memory, request(memory, context, forward.rule, bad)),
      undefined,
      "A55 invalid realization ZERO",
    );
    same(memory.find(context, bad), undefined, "A55 invalid realization gets no truth witness");
  }

  // Ambient physical equation is inert until selected inside a realization.
  const ambient = equation(memory, foreignRole, basis.O, basis.C);
  assert(!forward.equations.includes(ambient), "A55 ambient equation outside Rule authority");
  const selected = request(memory, context, forward.rule, validForward);
  request(memory, context, forward.rule, realization(memory, free, [...eqs.slice(0, 2), ambient]));
  const stable = validateRuleDirect(memory, selected);
  assert(stable !== undefined, "A55 selected valid request stable under ambient alternate");

  // Contract identity is literally Rule identity: no derived semantic object.
  same(memory.poles(memory.poles(selected).end).start, forward.rule, "A55 request selects Rule directly");
}

function staticGuards(): void {
  const root = resolve(process.cwd(), "..");
  const own = readFileSync(
    join(root, "ts/test/research-v013-rule-native-contract-a55.test.ts"),
    "utf8",
  );
  const a42 = readFileSync(
    join(root, "ts/test/research-v013-rule-semantic-schema-contract-a42.test.ts"),
    "utf8",
  );
  const a45 = readFileSync(
    join(root, "ts/test/research-v013-link-carried-coverage-history-a45.test.ts"),
    "utf8",
  );

  const semanticSource = own.slice(
    own.indexOf("function defineRule("),
    own.indexOf("\nfunction realization(", own.indexOf("function defineRule(")),
  );
  for (const forbidden of [
    "deriveSemanticContract",
    "SemanticContract",
    "freeRoles",
    "constrainedTargets",
    "gateOrder",
    "TemplatePlan",
    "TemplateE0",
  ]) assert(!semanticSource.includes(forbidden), `A55 Rule source excludes ${forbidden}`);

  const requestPath = own.slice(
    own.indexOf("function request("),
    own.indexOf("\n/**\n * A55 oracle", own.indexOf("function request(")),
  );
  assert(!requestPath.includes("contract"), "A55 selected request has no derived Contract handle");
  assert(requestPath.includes("memory.ensure(context, memory.ensure(rule, candidateRealization))"),
    "A55 request is K->(Rule->Realization)");

  assert(a42.includes("HOST_RULE_CONTRACT_DERIVATION=RESIDUAL"),
    "A55 attacks exact A42 residual");
  assert(a45.includes("RULE_CONTRACT_DERIVATION=HOST_STRUCTURAL_RESIDUAL"),
    "A55 preserves A45 residual provenance");
  assert(a45.includes("LINK_CARRIED_COVERAGE_HISTORY=GREEN_SCOPED_RESEARCH"),
    "A55 keeps A45 validation evidence");
}

function main(): void {
  exercise(new Memory(), false);
  exercise(new Memory(), true);
  staticGuards();
  console.log([
    "MTS v0.13 A55: RULE_NATIVE_CONSTRUCTION_CONTRACT=GREEN_SCOPED_RESEARCH",
    "DERIVED_SEMANTIC_CONTRACT_OBJECT=0 RULE_IS_CONTRACT_AUTHORITY=YES",
    "EQUATION_FORM=TARGET_ROLE_TO_START_ROLE_TO_END_ROLE",
    "FREE_ROLE_PRECOMPUTATION=0 CONSTRAINED_TARGET_LIST=0",
    "ROLE_COMPLETENESS=INPUT_ROLES_UNION_EQUATION_TARGETS",
    "FORWARD_REVERSE_RULE_TOPOLOGIES=SEMANTICALLY_EQUIVALENT",
    "VALID_FORWARD_REVERSE_REALIZATIONS=ACCEPTED",
    "MISSING_DUPLICATE_FOREIGN_MISCLASSIFIED_INPUT_OR_EQUATION=ZERO",
    "AMBIENT_PHYSICAL_EQUATION=INERT",
    "A55_VALIDATOR=REFERENCE_ORACLE HOST_EXTensional_VALIDATION=RESIDUAL",
    "A43_A45_LINK_NATIVE_VALIDATION_EVIDENCE=PRESERVED_NOT_YET_RECONNECTED",
    "NEXT_BOUNDARY=A56_DIRECT_RULE_TO_LINK_NATIVE_COVERAGE",
    "A35_PUBLICATION_EXISTENCE=RESIDUAL GLOBAL_E2=OPEN GLOBAL_E3=OPEN GLOBAL_E4=OPEN",
    "FULL_SELF_HOSTED=FALSE V013_NOT_ACCEPTED PRODUCTION_UNCHANGED",
  ].join(" "));
}
main();
