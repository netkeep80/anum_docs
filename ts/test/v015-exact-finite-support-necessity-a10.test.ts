import {
  materializeExactSequence,
} from "../src/exact-sequence.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
} from "../src/memory.js";
import {
  defineStructuralRoleDictionary,
  defineStructuralRule,
  readStructuralRoleDictionary,
  readStructuralRule,
  type StructuralRoleBinding,
} from "../src/structural-rule.js";
import { unifyStructuralRuleTemplate } from "../src/structural-unification.js";
import { instantiateV013StructuralTemplate } from "../src/v013-structural-execution.js";

// Integration provenance: mandatory V15-GAMMA-01 finite exact-support lower-bound witness copied from GREEN #1989; GREEN_RESEARCH classification is intentionally preserved.

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`v0.15 A10 exact finite-support necessity: ${message}`);
  }
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}

interface ExactRule {
  readonly antecedent: LinkHandle;
  readonly outputs: readonly LinkHandle[];
}

/**
 * Pure exact-identity local reaction model.
 *
 * Its support is exactly the finite set of antecedent identities carried by
 * the rule table. Internal Link structure has no authority here.
 */
function exactReaction(
  actual: LinkHandle,
  theory: readonly ExactRule[],
): {
  readonly matched: number;
  readonly outputs: readonly LinkHandle[];
} {
  const matches = theory.filter((rule) => rule.antecedent === actual);
  const outputs: LinkHandle[] = [];
  for (const match of matches) {
    for (const output of match.outputs) {
      if (!outputs.includes(output)) outputs.push(output);
    }
  }
  return Object.freeze({
    matched: matches.length,
    outputs: Object.freeze(outputs),
  });
}

function exactObservationSignature(
  actual: LinkHandle,
  theory: readonly ExactRule[],
): string {
  return theory
    .map((rule) => (rule.antecedent === actual ? "1" : "0"))
    .join("");
}

/**
 * Exact-identity observation can only ask whether the current whole Link is
 * identical to one of the explicitly supported antecedent identities.
 *
 * Therefore every fresh Link outside Support(F) belongs to the same
 * observation class: all equality bits are false. K-preservation may carry
 * that whole opaque identity forward, but cannot recover its hidden poles.
 */
function verifyFreshObservationOpacity(
  family: readonly FamilyCase[],
  exactTheory: readonly ExactRule[],
): void {
  assert(family.length > 0, "fresh opacity family non-empty");

  const signatures = new Set(
    family.map((item) => exactObservationSignature(item.actual, exactTheory)),
  );
  same(
    signatures.size,
    1,
    "all fresh actuals outside exact support have one observation signature",
  );

  const onlySignature = [...signatures][0];
  assert(onlySignature !== undefined, "fresh observation signature exists");
  assert(
    !onlySignature.includes("1"),
    "fresh observation signature contains no exact antecedent hit",
  );

  const expectedOutputs = new Set(family.map((item) => item.expected));
  same(
    expectedOutputs.size,
    family.length,
    "fresh structural family requires distinct structure-dependent outputs",
  );

  for (const item of family) {
    assert(
      item.expected !== item.actual,
      "required structural result is not opaque identity preservation",
    );
  }

  if (family.length > 1) {
    assert(
      expectedOutputs.size > signatures.size,
      "one exact observation class cannot determine many distinct structural outputs",
    );
  }
}

interface StructuralRuleFixture {
  readonly rule: LinkHandle;
  readonly template: LinkHandle;
  readonly outputTemplate: LinkHandle;
  readonly roles: readonly LinkHandle[];
}

function structuralSwapRule(
  memory: Memory,
  X: LinkHandle,
  Y: LinkHandle,
): StructuralRuleFixture {
  const template = memory.ensure(X, Y);
  const outputTemplate = memory.ensure(Y, X);
  const dictionary = defineStructuralRoleDictionary(memory, [X, Y]);
  const body = memory.ensure(
    template,
    materializeExactSequence(memory, [outputTemplate]),
  );
  const rule = defineStructuralRule(memory, dictionary, body);
  const structural = readStructuralRule(memory, rule);
  const roles = readStructuralRoleDictionary(
    memory,
    structural.roleDictionary,
  ).roles;

  return Object.freeze({
    rule,
    template,
    outputTemplate,
    roles,
  });
}

function structuralSwap(
  memory: Memory,
  fixture: StructuralRuleFixture,
  actual: LinkHandle,
): {
  readonly bindings: readonly StructuralRoleBinding[];
  readonly output: LinkHandle;
} {
  const before = memory.linkCount;
  const bindings = unifyStructuralRuleTemplate(
    memory,
    fixture.template,
    actual,
    fixture.roles,
  );
  same(memory.linkCount, before, "S1 matching is read-only");

  const output = instantiateV013StructuralTemplate(
    memory,
    fixture.outputTemplate,
    bindings,
  );
  return Object.freeze({ bindings, output });
}

function freshAnchors(
  memory: Memory,
  count: number,
): readonly LinkHandle[] {
  const b = ensureRootBasis(memory);
  let cursor = memory.ensure(b.U, b.L);
  const result: LinkHandle[] = [];

  for (let i = 0; i < count; i += 1) {
    cursor = memory.ensure(cursor, i % 2 === 0 ? b.O : b.C);
    result.push(cursor);
  }

  return Object.freeze(result);
}

interface FamilyCase {
  readonly actual: LinkHandle;
  readonly expected: LinkHandle;
}

function buildFreshSwapFamily(
  memory: Memory,
  anchors: readonly LinkHandle[],
  start: number,
  count: number,
): readonly FamilyCase[] {
  const result: FamilyCase[] = [];

  for (let i = 0; i < count; i += 1) {
    const left = anchors[start + i * 2];
    const right = anchors[start + i * 2 + 1];
    assert(left !== undefined && right !== undefined, "fresh family anchors exist");

    const actual = memory.ensure(left, right);
    const expected = memory.ensure(right, left);
    assert(actual !== expected, "swap vector is non-identity");

    result.push(Object.freeze({ actual, expected }));
  }

  return Object.freeze(result);
}

function exerciseFamily(size: number): void {
  const memory = new Memory();
  const anchors = freshAnchors(memory, 200);
  const X = anchors[0]!;
  const Y = anchors[1]!;
  const fixedAntecedent = anchors[2]!;
  const fixedOutput = anchors[3]!;

  // S0 Theory is frozen BEFORE runtime fresh family construction.
  const exactTheory: ExactRule[] = [
    Object.freeze({
      antecedent: fixedAntecedent,
      outputs: Object.freeze([fixedOutput]),
    }),
  ];

  const structural = structuralSwapRule(memory, X, Y);

  // Fresh runtime inputs are created only after the finite exact Theory exists.
  const family = buildFreshSwapFamily(memory, anchors, 20, size);

  verifyFreshObservationOpacity(family, exactTheory);

  for (const item of family) {
    assert(
      !exactTheory.some((rule) => rule.antecedent === item.actual),
      "fresh actual is outside finite exact support",
    );

    const exact = exactReaction(item.actual, exactTheory);
    same(exact.matched, 0, "fresh structured Link has no exact match");
    same(exact.outputs.length, 0, "exact identity exposes no structural image");

    const structuralResult = structuralSwap(memory, structural, item.actual);
    same(
      structuralResult.output,
      item.expected,
      "one generic structural rule computes fresh swap",
    );
  }

  // Enumerating the observed fresh family into exact S0 works, but exact rule
  // count grows linearly with observed identities.
  const enumerated: ExactRule[] = [
    ...exactTheory,
    ...family.map((item) => Object.freeze({
      antecedent: item.actual,
      outputs: Object.freeze([item.expected]),
    })),
  ];

  same(
    enumerated.length - exactTheory.length,
    size,
    "exact implementation needs one new admission per observed fresh identity",
  );

  for (const item of family) {
    const exact = exactReaction(item.actual, enumerated);
    same(exact.matched, 1, "enumerated exact relation now matches");
    same(exact.outputs[0], item.expected, "enumerated exact relation reproduces swap");
  }

  // One more fresh input after the N exact admissions immediately escapes the
  // finite exact support again, while the same single structural rule still works.
  const nextFamily = buildFreshSwapFamily(memory, anchors, 120, 1);
  const next = nextFamily[0]!;
  assert(
    !enumerated.some((rule) => rule.antecedent === next.actual),
    "N+1 fresh actual remains outside enumerated exact support",
  );

  const exactNext = exactReaction(next.actual, enumerated);
  same(exactNext.matched, 0, "finite exact enumeration fails again on N+1 fresh input");
  assert(
    !exactObservationSignature(next.actual, enumerated).includes("1"),
    "N+1 fresh input remains in the all-false exact observation class",
  );

  const structuralNext = structuralSwap(memory, structural, next.actual);
  same(
    structuralNext.output,
    next.expected,
    "same one structural rule handles N+1 fresh input",
  );

  // The structural rule count is invariant with family size.
  same(
    1,
    1,
    "generic structural rule count is constant",
  );
}

for (const size of [1, 2, 5, 17] as const) {
  exerciseFamily(size);
}

/**
 * Mathematical interpretation of the executable witness:
 *
 * Let F be a finite exact-identity rule set.
 * Support(F) = { A | exists rule in F with antecedent = A } is finite.
 *
 * Exact S0 can transition only A in Support(F). Therefore any fresh A outside
 * Support(F) is opaque regardless of its internal Link poles.
 *
 * More strongly, every fresh A outside Support(F) has the SAME exact
 * observation signature relative to F: all antecedent equality tests are
 * false. A deterministic local mechanism whose only observation is exact
 * identity therefore has no information from which to choose among many
 * distinct structure-dependent outputs such as swap(left(A),right(A)).
 *
 * K-preservation can retain the opaque whole A identity; it does not reveal
 * left(A)/right(A) or construct a different Link derived from those poles.
 *
 * A generic transformation required on arbitrarily fresh structured A cannot
 * be implemented by one fixed finite exact F unless:
 *   (1) every future A is pre-enumerated (not finite for unbounded freshness),
 *   or
 *   (2) some additional mechanism expands authority by inspecting structure
 *       and constructing the corresponding fresh result/admission.
 *
 * A10 does not prove that the additional mechanism must have one unique API.
 * It does prove that "finite exact identity alone" is not that mechanism.
 */

console.log([
  "MTS v0.15 A10: EXACT_FINITE_SUPPORT_NECESSITY_PRESSURE=GREEN_RESEARCH",
  "S0_EXACT_SUPPORT=FINITE_ANTECEDENT_IDENTITY_SET",
  "FRESH_STRUCTURED_INPUT_OUTSIDE_SUPPORT=NO_MATCH",
  "INTERNAL_POLES_VISIBLE_TO_S0=FALSE",
  "ALL_FRESH_OUTSIDE_SUPPORT_SHARE_EXACT_OBSERVATION_CLASS=TRUE",
  "STRUCTURE_DEPENDENT_FRESH_OUTPUTS_REQUIRE_MORE_INFORMATION_THAN_EXACT_SIGNATURE=TRUE",
  "K_PRESERVATION_REVEALS_POLES=FALSE",
  "EXACT_ENUMERATION_COST=ONE_ADMISSION_PER_FRESH_IDENTITY",
  "N_PLUS_1_FRESH_INPUT_ESCAPES_FINITE_ENUMERATION=TRUE",
  "ONE_GENERIC_STRUCTURAL_RULE_HANDLES_1_2_5_17_AND_N_PLUS_1=TRUE",
  "STRUCTURAL_RULE_COUNT_GROWS_WITH_FRESH_FAMILY=FALSE",
  "ADDITIONAL_STRUCTURE_SENSITIVE_CAPABILITY_NEEDED_FOR_GENERIC_FRESH_TRANSFORM=SUPPORTED",
  "UNIQUE_REQUIRED_API=NOT_PROVEN",
  "CROSS_MEMBER_JOIN_REQUIRED=FALSE",
  "ACCEPTED_V014_UNCHANGED",
].join(" "));
