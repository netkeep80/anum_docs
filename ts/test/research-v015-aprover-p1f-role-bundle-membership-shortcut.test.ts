import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
} from "../src/memory.js";
import {
  StructuralRuleError,
} from "../src/structural-rule.js";
import {
  unifyStructuralRuleTemplate,
} from "../src/structural-unification.js";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error("v0.15 aprover P1f role-bundle shortcut: " + message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), message);
}

/**
 * Candidate shortcut under test:
 *
 *   roles(ObjectTheory,M_t) = { r in M_t | START(r)=ObjectTheory }
 *
 * If the queried admission q = ObjectTheory->Rule is a role exactly when q is
 * selected membership, perhaps a structural match could act as membership
 * predicate without address lookup.
 *
 * The current generic matcher, however, requires every declared role to be
 * bound by the template.  Therefore using the entire ObjectTheory frontier as
 * one Rule's role bundle fails as soon as ObjectTheory has another admission.
 */
const memory = new Memory();
const b = ensureRootBasis(memory);

let cursor = memory.ensure(b.U, b.L);
const fresh = (): LinkHandle => {
  cursor = memory.ensure(cursor, b.C);
  return cursor;
};

const objectTheory = fresh();
const ruleA = fresh();
const ruleB = fresh();
const admissionA = memory.ensure(objectTheory, ruleA);
const admissionB = memory.ensure(objectTheory, ruleB);
const probe = fresh();

// Singleton frontier: q is the only selected role.  Matching template q against
// an arbitrary probe binds q and therefore succeeds.
{
  const bindings = unifyStructuralRuleTemplate(
    memory,
    admissionB,
    probe,
    [admissionB],
  );
  same(bindings.length, 1, "singleton role frontier binds queried admission");
  same(bindings[0]!.role, admissionB, "singleton binding role");
  same(bindings[0]!.value, probe, "singleton binding value");
}

// Real Theory frontier with another admission: q still belongs to M_t, but the
// same matcher must also bind admissionA.  Since the template contains only q,
// it correctly fails with missing-role-binding under current Rule semantics.
{
  let rejected = false;
  try {
    unifyStructuralRuleTemplate(
      memory,
      admissionB,
      probe,
      [admissionA, admissionB],
    );
  } catch (error) {
    rejected =
      error instanceof StructuralRuleError &&
      error.code === "missing-role-binding";
  }
  assert(
    rejected,
    "multi-admission ObjectTheory cannot be reused as one Rule role bundle",
  );
}

// Physical q without selected membership: q is not a role.  It is then an exact
// constant in the template and cannot match an unrelated probe.
{
  let rejected = false;
  try {
    unifyStructuralRuleTemplate(
      memory,
      admissionB,
      probe,
      [admissionA],
    );
  } catch (error) {
    rejected =
      error instanceof StructuralRuleError &&
      error.code === "template-mismatch";
  }
  assert(
    rejected,
    "physical queried admission outside selected role frontier stays inert",
  );
}

console.log([
  "MTS_V015_APROVER_P1F_ROLE_BUNDLE_MEMBERSHIP_SHORTCUT=FALSIFIED",
  "SINGLETON_FRONTIER=ACCIDENTALLY_SUFFICIENT",
  "MULTI_ADMISSION_FRONTIER=MISSING_ROLE_BINDING",
  "PHYSICAL_UNSELECTED_QUERY=TEMPLATE_MISMATCH",
  "OBJECT_THEORY_AS_RULE_ROLE_BUNDLE=NOT_GENERIC",
  "MATCHER_SEMANTICS_CHANGED=FALSE",
  "ADDRESS_OR_OTHER_MEMBERSHIP_READ_STILL_OPEN=TRUE",
].join(" "));
