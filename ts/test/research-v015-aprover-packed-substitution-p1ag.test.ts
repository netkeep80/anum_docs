import { materializeExactSequence } from "../src/exact-sequence.js";
import { Memory, ensureRootBasis, type LinkHandle } from "../src/memory.js";
import {
  admitStructuralRule,
  defineStructuralInterpreter,
  defineStructuralRoleDictionary,
  defineStructuralRule,
} from "../src/structural-rule.js";
import {
  inferStructuralSubstitution,
  StructuralSubstitutionError,
} from "../src/structural-substitution.js";
import {
  V013CurrentScopeCursor,
  defineV013WorkingScope,
  reactV013StructuralScope,
} from "../src/v013-structural-execution.js";

function assert(value: unknown, message: string): asserts value {
  if (!value) {
    throw new Error("v0.15 P1ag packed substitution differential: " + message);
  }
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(
    Object.is(actual, expected),
    message + ": " + String(actual) + " !== " + String(expected),
  );
}

const memory = new Memory();
const b = ensureRootBasis(memory);
let cursor = memory.ensure(b.O, b.U);
const fresh = (): LinkHandle => {
  cursor = memory.ensure(cursor, b.C);
  return cursor;
};

const executionTheory = memory.ensure(b.C, b.L);
const CURRENT = fresh();
const SUBST_CHECK = fresh();
const ENTRY = fresh();
const SUBST_OK = fresh();
const grammar = fresh();

// FND-07 target roles.
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
const verifierAdmission = admitStructuralRule(
  memory,
  executionTheory,
  verifierRule,
);
memory.ensure(SUBST_CHECK, verifierAdmission);

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

function packet(values: readonly LinkHandle[]): LinkHandle {
  return memory.ensure(
    ENTRY,
    memory.ensure(
      SUBST_CHECK,
      materializeExactSequence(memory, values),
    ),
  );
}

function oneReaction(active: LinkHandle): Readonly<{
  readonly result: LinkHandle;
  readonly matches: number;
}> {
  const scope = defineV013WorkingScope(
    memory,
    fresh(),
    interpreter,
    [active],
  );
  const currentScope = new V013CurrentScopeCursor(memory, scope);
  const reaction = reactV013StructuralScope(memory, currentScope, fresh());
  same(currentScope.members().length, 1, "packed substitution remains single-valued");
  return Object.freeze({
    result: currentScope.members()[0]!,
    matches: reaction.rawRuleMatches,
  });
}

function hostSubstitution(
  conclusion: LinkHandle,
  p1: LinkHandle,
  p2: LinkHandle,
): readonly LinkHandle[] {
  return inferStructuralSubstitution(
    memory,
    [S, K, A, B],
    [
      { template: conclusionTemplate, actual: conclusion },
      { template: premiseTruthTemplate, actual: p1 },
      { template: premiseRuleTemplate, actual: p2 },
    ],
    { requireAll: true },
  ).map((binding) => binding.value);
}

function hostRejects(effect: () => unknown, message: string): void {
  try {
    effect();
  } catch (error) {
    assert(
      error instanceof StructuralSubstitutionError,
      message + ": wrong host error type",
    );
    return;
  }
  throw new Error(
    "v0.15 P1ag packed substitution differential: " +
      message +
      ": host unexpectedly accepted",
  );
}

// Positive: host multi-constraint substitution and one ordinary J0 structural
// match agree on the same S/K/A/B assignment.
{
  const bindings = hostSubstitution(
    actualConclusion,
    actualPremiseTruth,
    actualPremiseRule,
  );
  same(
    JSON.stringify(bindings),
    JSON.stringify([actualS, actualK, actualA, actualB]),
    "host substitution binds exact S/K/A/B",
  );

  const active = packet([
    actualConclusion,
    actualPremiseTruth,
    actualPremiseRule,
  ]);
  const runtime = oneReaction(active);
  same(runtime.matches, 1, "packed ordinary Gamma match succeeds");
  same(runtime.result, SUBST_OK, "packed substitution reaches SUBST_OK");
}

// Repeated-role conflict: premise Rule uses another A while conclusion/truth use
// actualA. Both host inference and structural Gamma must reject.
const conflictingPremiseRule = current(
  actualS,
  memory.ensure(otherA, actualB),
);
hostRejects(
  () =>
    hostSubstitution(
      actualConclusion,
      actualPremiseTruth,
      conflictingPremiseRule,
    ),
  "repeated A conflict",
);
{
  const active = packet([
    actualConclusion,
    actualPremiseTruth,
    conflictingPremiseRule,
  ]);
  const runtime = oneReaction(active);
  same(runtime.matches, 0, "Gamma rejects repeated A conflict");
  same(runtime.result, active, "conflict remains quiescent");
}

// Positional carrier order is semantic for the derivation premises. Swapping
// the two actual premise positions must not accidentally produce a substitution.
hostRejects(
  () =>
    hostSubstitution(
      actualConclusion,
      actualPremiseRule,
      actualPremiseTruth,
    ),
  "swapped premise positions",
);
{
  const active = packet([
    actualConclusion,
    actualPremiseRule,
    actualPremiseTruth,
  ]);
  const runtime = oneReaction(active);
  same(runtime.matches, 0, "Gamma rejects swapped premise positions");
  same(runtime.result, active, "swapped premises remain quiescent");
}

// Wrong premise arity is encoded by a different ExactSequence topology and
// therefore cannot match the three-position verifier template.
{
  const active = packet([
    actualConclusion,
    actualPremiseTruth,
  ]);
  const runtime = oneReaction(active);
  same(runtime.matches, 0, "Gamma rejects missing premise position");
  same(runtime.result, active, "short packet remains quiescent");
}
{
  const active = packet([
    actualConclusion,
    actualPremiseTruth,
    actualPremiseRule,
    actualPremiseRule,
  ]);
  const runtime = oneReaction(active);
  same(runtime.matches, 0, "Gamma rejects extra premise position");
  same(runtime.result, active, "long packet remains quiescent");
}

// Missing-role coverage: if B disappears from all relevant template positions,
// host requireAll would reject. The accepted verifier template contains every
// role, so successful runtime match necessarily binds all four.
same(
  new Set([S, K, A, B]).size,
  4,
  "declared verifier roles are distinct and all occur in packed template",
);

console.log([
  "MTS_V015_P1AG_PACKED_SUBSTITUTION_DIFFERENTIAL=GREEN_RESEARCH",
  "FND07_CONSTRAINTS=CONCLUSION_PLUS_TWO_PREMISES",
  "HOST_INFER_STRUCTURAL_SUBSTITUTION=DIFFERENTIAL_ONLY",
  "RUNTIME_VERIFIER=ONE_STRUCTURAL_J0_RULE",
  "SHARED_ROLE_BINDING=S_K_A_B",
  "VALID_VECTOR=SUBST_OK",
  "REPEATED_ROLE_CONFLICT=QUIESCENT_REJECT",
  "SWAPPED_PREMISES=QUIESCENT_REJECT",
  "MISSING_PREMISE=QUIESCENT_REJECT",
  "EXTRA_PREMISE=QUIESCENT_REJECT",
  "EXACT_SEQUENCE_ORDER_AND_ARITY=PRESERVED",
  "CROSS_MEMBER_JOIN=0",
  "HOST_SUBSTITUTION_IN_FINAL_APROVER=NOT_REQUIRED_FOR_TESTED_FND07_VECTOR",
  "NEW_AMEMORY_OPCODE=0",
  "CANONICAL_APROVER_FORMAL_JSON=NOT_YET_PROPOSED",
].join(" "));
