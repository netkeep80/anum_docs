import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
} from "../src/memory.js";
import {
  materializeExactSequence,
} from "../src/exact-sequence.js";

/**
 * P1g falsifier:
 *
 * Replaying an antecedent under ObjectTheory and observing only its extensional
 * result cannot validate that one exact referenced Rule was admitted.
 *
 * Two distinct admitted Rules can be behaviorally equivalent on the tested
 * antecedent. Removing the referenced one while retaining the other leaves the
 * same result, so result equality is not an admission witness for Rule identity.
 */
function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error("v0.15 aprover P1g exact rule identity: " + message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), message);
}

interface GroundRule {
  readonly rule: LinkHandle;
  readonly admission: LinkHandle;
}

const memory = new Memory();
const b = ensureRootBasis(memory);

let cursor = memory.ensure(b.U, b.L);
const fresh = (): LinkHandle => {
  cursor = memory.ensure(cursor, b.C);
  return cursor;
};

const theory = fresh();
const antecedent = fresh();
const output = fresh();

// Give the two Rules distinct role-bundle anchors while keeping the same exact
// grounded antecedent and image. They are different Rule Links but have the
// same observable transition on this input.
const makeRule = (): GroundRule => {
  const V = fresh();
  const body = memory.ensure(
    antecedent,
    materializeExactSequence(memory, [output]),
  );
  const rule = memory.ensure(V, body);
  const admission = memory.ensure(theory, rule);
  return Object.freeze({ rule, admission });
};

const referenced = makeRule();
const equivalent = makeRule();

assert(referenced.rule !== equivalent.rule, "Rules are structurally distinct");
assert(
  referenced.admission !== equivalent.admission,
  "Theory admissions are structurally distinct",
);

const imageOf = (rule: LinkHandle): LinkHandle => {
  const rp = memory.poles(rule);
  const bp = memory.poles(rp.end);
  same(bp.start, antecedent, "same tested antecedent");
  const image = bp.end;
  return image;
};

same(
  imageOf(referenced.rule),
  imageOf(equivalent.rule),
  "distinct Rules expose the same exact image carrier",
);

// Semantic states differ on exact referenced admission but are observationally
// identical if a checker only replays antecedent -> output behavior.
const withReferenced = new Set<LinkHandle>([
  referenced.admission,
  equivalent.admission,
]);
const withoutReferenced = new Set<LinkHandle>([
  equivalent.admission,
]);

assert(
  withReferenced.has(referenced.admission),
  "control state contains exact referenced admission",
);
assert(
  !withoutReferenced.has(referenced.admission),
  "negative state omits exact referenced admission",
);

// Yet the remaining equivalent rule still supplies the same antecedent/image.
const remainingRule = memory.poles(equivalent.admission).end;
same(remainingRule, equivalent.rule, "remaining exact Rule");
same(
  imageOf(remainingRule),
  imageOf(referenced.rule),
  "behavior-only replay cannot distinguish missing referenced Rule",
);

console.log([
  "MTS_V015_APROVER_P1G_BEHAVIOR_ONLY_RULE_VALIDATION=FALSIFIED",
  "DISTINCT_RULES_SAME_TESTED_BEHAVIOR=TRUE",
  "REMOVE_REFERENCED_ADMISSION_RESULT_CAN_STAY_SAME=TRUE",
  "EXTENSIONAL_RESULT_IS_EXACT_RULE_WITNESS=FALSE",
  "EXACT_RULE_ADMISSION_OR_RULE_PROVENANCE_REQUIRED=TRUE",
  "HOST_TRACE_AS_PROOF_AUTHORITY=FORBIDDEN",
].join(" "));
