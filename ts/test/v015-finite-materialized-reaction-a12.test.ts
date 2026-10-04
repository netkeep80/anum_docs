import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`v0.15 A12 finite materialized reaction: ${message}`);
  }
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}

interface AcceptedPremiseClassification {
  readonly modelObligation: {
    readonly ambientLinkCarrier: string;
    readonly groundedReplayDomain: string;
    readonly noBackflow: string;
  };
}

const accepted = JSON.parse(
  readFileSync(
    resolve(process.cwd(), "../proofs/premise-classification-v0.14.json"),
    "utf8",
  ),
) as AcceptedPremiseClassification;

same(
  accepted.modelObligation.ambientLinkCarrier,
  "INFINITE_REQUIRED",
  "accepted model keeps ambient Link carrier infinite",
);
same(
  accepted.modelObligation.groundedReplayDomain,
  "FINITE_EXPLICIT_WITNESSES_REQUIRED",
  "accepted proof boundary already separates finite grounded witnesses",
);
assert(
  /must not become MTS ontology/i.test(accepted.modelObligation.noBackflow),
  "host model cardinality machinery has no semantic backflow",
);

/**
 * These numbers are only finite-set tokens for the cardinality argument.
 * They are NOT a replacement Link ontology or a proposed runtime encoding.
 */
type Token = number;

interface FiniteRule {
  readonly antecedent: Token;
  readonly outputs: readonly Token[];
}

interface FiniteReactionResult {
  readonly comparisons: number;
  readonly matchedCurrents: number;
  readonly noMatchCurrents: number;
  readonly rawOutputOccurrences: number;
  readonly successors: readonly Token[];
}

function finiteReaction(
  currents: readonly Token[],
  rules: readonly FiniteRule[],
): FiniteReactionResult {
  const successors = new Set<Token>();
  let comparisons = 0;
  let matchedCurrents = 0;
  let noMatchCurrents = 0;
  let rawOutputOccurrences = 0;

  for (const current of currents) {
    let matched = false;
    const outputs = new Set<Token>();

    for (const rule of rules) {
      comparisons += 1;
      if (rule.antecedent !== current) continue;

      matched = true;
      for (const output of rule.outputs) {
        rawOutputOccurrences += 1;
        outputs.add(output);
      }
    }

    if (!matched) {
      noMatchCurrents += 1;
      successors.add(current);
      continue;
    }

    matchedCurrents += 1;
    for (const output of outputs) successors.add(output);
  }

  return Object.freeze({
    comparisons,
    matchedCurrents,
    noMatchCurrents,
    rawOutputOccurrences,
    successors: Object.freeze([...successors]),
  });
}

function sumImageLengths(rules: readonly FiniteRule[]): number {
  return rules.reduce((sum, rule) => sum + rule.outputs.length, 0);
}

function makeFixture(
  currentCount: number,
  ruleCount: number,
  maxImage: number,
): {
  readonly currents: readonly Token[];
  readonly rules: readonly FiniteRule[];
} {
  assert(currentCount > 0, "fixture currentCount positive");
  assert(ruleCount >= 0, "fixture ruleCount non-negative");
  assert(maxImage >= 0, "fixture maxImage non-negative");

  const currents = Object.freeze(
    Array.from({ length: currentCount }, (_, index) => 1_000 + index),
  );

  const rules: FiniteRule[] = [];
  for (let index = 0; index < ruleCount; index += 1) {
    const antecedent =
      currents[index % currents.length]!;
    const imageLength =
      maxImage === 0 ? 0 : index % (maxImage + 1);
    const outputs = Object.freeze(
      Array.from(
        { length: imageLength },
        (_, outputIndex) => 100_000 + index * (maxImage + 1) + outputIndex,
      ),
    );
    rules.push(Object.freeze({ antecedent, outputs }));
  }

  return Object.freeze({
    currents,
    rules: Object.freeze(rules),
  });
}

function verifyFiniteBound(
  currentCount: number,
  ruleCount: number,
  maxImage: number,
): void {
  const { currents, rules } = makeFixture(
    currentCount,
    ruleCount,
    maxImage,
  );
  const result = finiteReaction(currents, rules);

  // Exhaustive finite pair inspection has a simple finite upper bound.
  same(
    result.comparisons,
    currentCount * ruleCount,
    "finite current×Rule comparison bound",
  );

  const totalImageSize = sumImageLengths(rules);

  // In the worst case every current may match every Rule. The exact unary
  // fixture is usually much smaller, but this bound remains valid for any
  // finite matcher whose one current×Rule pair produces at most that Rule's
  // finite explicit image.
  assert(
    result.rawOutputOccurrences <= currentCount * totalImageSize,
    "raw output occurrences have finite upper bound",
  );

  // NO_MATCH may preserve at most one current per current member. Positive
  // successors are bounded by raw output occurrences before canonical union.
  assert(
    result.successors.length <=
      result.noMatchCurrents + result.rawOutputOccurrences,
    "extensional successor cardinality is finitely bounded",
  );

  same(
    result.matchedCurrents + result.noMatchCurrents,
    currentCount,
    "every finite current member is classified exactly once",
  );
}

for (const vector of [
  [1, 0, 0],
  [1, 1, 0],
  [2, 3, 2],
  [17, 31, 5],
  [128, 257, 7],
] as const) {
  verifyFiniteBound(vector[0], vector[1], vector[2]);
}

interface CompletionPremises {
  readonly materializedAsetFinite: boolean;
  readonly activeCurrentSetFinite: boolean;
  readonly selectedAdmissionSetFinite: boolean;
  readonly everyMatchedImageFinite: boolean;
  readonly eachLocalMatchTerminates: boolean;
}

type CompletionClassification =
  | "FINITE_ONE_GENERATION_WORK_DERIVED"
  | "FINITE_COMPLETION_NOT_DERIVED";

function classifyCompletion(
  premises: CompletionPremises,
): CompletionClassification {
  return (
    premises.materializedAsetFinite &&
    premises.activeCurrentSetFinite &&
    premises.selectedAdmissionSetFinite &&
    premises.everyMatchedImageFinite &&
    premises.eachLocalMatchTerminates
  )
    ? "FINITE_ONE_GENERATION_WORK_DERIVED"
    : "FINITE_COMPLETION_NOT_DERIVED";
}

const sufficient: CompletionPremises = Object.freeze({
  materializedAsetFinite: true,
  activeCurrentSetFinite: true,
  selectedAdmissionSetFinite: true,
  everyMatchedImageFinite: true,
  eachLocalMatchTerminates: true,
});

same(
  classifyCompletion(sufficient),
  "FINITE_ONE_GENERATION_WORK_DERIVED",
  "finite materialized slice derives finite one-generation work",
);

for (const missing of Object.keys(sufficient) as (keyof CompletionPremises)[]) {
  const weakened = {
    ...sufficient,
    [missing]: false,
  };
  same(
    classifyCompletion(weakened),
    "FINITE_COMPLETION_NOT_DERIVED",
    `completion is not derived when premise ${missing} is absent`,
  );
}

/**
 * The theorem boundary tested by A12:
 *
 * - ambient Link carrier cardinality is irrelevant to one concrete reaction;
 * - only the selected materialized semantic slice participates;
 * - if current set C and admitted Rule set T are finite, every C×T pair can
 *   be completed after finitely many local-match steps;
 * - if every matching Rule has a finite explicit image, the complete staged
 *   successor has a finite cardinality bound;
 * - A11 then permits arbitrary finite partition/reduction of that work.
 *
 * What does NOT follow:
 * - that every possible MTS Aset must be finite;
 * - that atomic publication is derived from finiteness;
 * - that an infinite semantic reaction is impossible denotationally;
 * - that a particular CPU/GPU/ASIC has enough resources for a chosen slice.
 *
 * Therefore "finite executable materialization" is an execution/refinement
 * premise, not a restriction that collapses the infinite MTS Link universe.
 */

console.log([
  "MTS v0.15 A12: FINITE_MATERIALIZED_REACTION_COMPLETION=GREEN_RESEARCH",
  "AMBIENT_LINK_CARRIER=INFINITE_REQUIRED_ACCEPTED_BASELINE",
  "FINITE_GROUNDED_WITNESSES=ACCEPTED_BASELINE",
  "MATERIALIZED_ASET_FINITE=EXECUTION_PREMISE_CANDIDATE",
  "ACTIVE_CURRENT_SET_FINITE=EXECUTION_PREMISE_CANDIDATE",
  "SELECTED_ADMISSION_SET_FINITE=EXECUTION_PREMISE_CANDIDATE",
  "MATCHED_IMAGE_FINITE=EXECUTION_PREMISE_CANDIDATE",
  "LOCAL_MATCH_TERMINATION=EXECUTION_PREMISE_CANDIDATE",
  "FINITE_CURRENT_X_RULE_WORK=DERIVED",
  "FINITE_STAGED_SUCCESSOR_BOUND=DERIVED",
  "AMBIENT_INFINITY_IMPLIES_INFINITE_REACTION=FALSE",
  "ATOMIC_PUBLICATION=PREMISE_NOT_DERIVED_FROM_FINITENESS",
  "INFINITE_SEMANTIC_REACTION=NOT_RULED_OUT_DENOTATIONALLY",
  "PHYSICAL_RESOURCE_CAPACITY=IMPLEMENTATION_ONLY",
  "A11_FINITE_PARTITION_REDUCTION=COMPATIBLE",
  "ACCEPTED_V014_UNCHANGED",
].join(" "));
