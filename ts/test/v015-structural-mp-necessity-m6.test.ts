import {
  materializeExactSequence,
} from "../src/exact-sequence.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
} from "../src/memory.js";
import {
  type StructuralRoleBinding,
} from "../src/structural-rule.js";
import {
  unifyStructuralRuleTemplate,
} from "../src/structural-unification.js";
import {
  instantiateV013StructuralTemplate,
} from "../src/v013-structural-execution.js";
import {
  defineV013GroundedExecutionScope,
  reactV013GroundedScope,
  V013GroundedScopeCursor,
} from "../src/v013-grounded-execution.js";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error("v0.15 M6 structural-MP necessity: " + message);
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}
function sameMembers(
  actual: readonly LinkHandle[],
  expected: readonly LinkHandle[],
  message: string,
): void {
  same(actual.length, expected.length, message + " cardinality");
  for (const member of expected) assert(actual.includes(member), message + " missing member");
}

interface Fixture {
  readonly memory: Memory;
  readonly theory: LinkHandle;
  readonly K: LinkHandle;
  readonly X: LinkHandle;
  readonly Y: LinkHandle;
  readonly A: LinkHandle;
  readonly C: LinkHandle;
  readonly fresh: () => LinkHandle;
}

function fixture(): Fixture {
  const memory = new Memory();
  const b = ensureRootBasis(memory);
  let cursor = memory.ensure(b.U, b.L);
  const fresh = (): LinkHandle => (
    cursor = memory.ensure(cursor, cursor === b.U ? b.C : b.O)
  );
  return Object.freeze({
    memory,
    theory: fresh(),
    K: fresh(),
    X: fresh(),
    Y: fresh(),
    A: fresh(),
    C: fresh(),
    fresh,
  });
}

function admitExact(
  f: Fixture,
  antecedent: LinkHandle,
  outputs: readonly LinkHandle[],
): LinkHandle {
  const image = materializeExactSequence(f.memory, outputs);
  const relation = f.memory.ensure(antecedent, image);
  f.memory.ensure(f.theory, relation);
  return relation;
}

function run(
  f: Fixture,
  currentValue: LinkHandle,
): {
  readonly members: readonly LinkHandle[];
  readonly matchedRelations: number;
  readonly handoffCount: 0 | 1;
  readonly quiescent: boolean;
} {
  const currentTruth = f.memory.ensure(f.K, currentValue);
  const scope = defineV013GroundedExecutionScope(
    f.memory,
    f.fresh(),
    f.theory,
    [currentTruth],
  );
  const cursor = new V013GroundedScopeCursor(f.memory, scope);
  const reaction = reactV013GroundedScope(f.memory, cursor, f.fresh());
  return Object.freeze({
    members: cursor.members(),
    matchedRelations: reaction.matchedRelations,
    handoffCount: reaction.handoffCount,
    quiescent: reaction.quiescent,
  });
}

function binding(
  bindings: readonly StructuralRoleBinding[],
  role: LinkHandle,
): LinkHandle {
  const found = bindings.find((entry) => entry.role === role);
  assert(found !== undefined, "missing role binding");
  return found.value;
}

// S1 falsifier: exact grounded MP does not interpret structural roles in an
// admitted antecedent. Pair(X,Y) is just one exact Link and therefore does not
// match Pair(A,C).
{
  const f = fixture();
  const templateAntecedent = f.memory.ensure(f.X, f.Y);
  const templateOutput = f.memory.ensure(f.Y, f.X);
  admitExact(f, templateAntecedent, [templateOutput]);

  const actualAntecedent = f.memory.ensure(f.A, f.C);
  const expectedOutput = f.memory.ensure(f.C, f.A);

  const s0 = run(f, actualAntecedent);
  same(s0.matchedRelations, 0, "S0 does not structurally match template antecedent");
  same(s0.handoffCount, 0, "S0 no structural match means no handoff");
  same(s0.quiescent, true, "S0 structural gap is quiescent");
  sameMembers(
    s0.members,
    [f.memory.ensure(f.K, actualAntecedent)],
    "S0 preserves actual antecedent on structural mismatch",
  );

  // External/meta S1 resolves the structural similarity.
  const beforeUnify = f.memory.linkCount;
  const bindings = unifyStructuralRuleTemplate(
    f.memory,
    templateAntecedent,
    actualAntecedent,
    [f.X, f.Y],
  );
  same(f.memory.linkCount, beforeUnify, "S1 matcher is read-only");
  same(binding(bindings, f.X), f.A, "S1 X=A");
  same(binding(bindings, f.Y), f.C, "S1 Y=C");

  const instantiated = instantiateV013StructuralTemplate(
    f.memory,
    templateOutput,
    bindings,
  );
  same(instantiated, expectedOutput, "S1/S2 yields concrete swapped output");

  admitExact(f, actualAntecedent, [instantiated]);
  const grounded = run(f, actualAntecedent);
  same(grounded.matchedRelations, 1, "grounded relation fires after S1/S2");
  sameMembers(
    grounded.members,
    [f.memory.ensure(f.K, expectedOutput)],
    "grounded MP consumes S1/S2 result",
  );
}

// S2 falsifier: even with an exact antecedent, grounded MP does not substitute
// role values into a templated output. It emits the literal pre-existing output
// Link carried by the admitted relation.
{
  const f = fixture();
  const actualAntecedent = f.memory.ensure(f.A, f.C);
  const literalTemplateOutput = f.memory.ensure(f.Y, f.X);
  const expectedConcreteOutput = f.memory.ensure(f.C, f.A);

  admitExact(f, actualAntecedent, [literalTemplateOutput]);

  const s0 = run(f, actualAntecedent);
  same(s0.matchedRelations, 1, "exact antecedent matches under S0");
  sameMembers(
    s0.members,
    [f.memory.ensure(f.K, literalTemplateOutput)],
    "S0 emits literal template output without substitution",
  );
  assert(
    literalTemplateOutput !== expectedConcreteOutput,
    "literal template output differs from concrete substituted output",
  );

  // Supplying bindings as unrelated data does nothing to grounded MP. Only a
  // structural-instantiation operation can turn the template into C->A.
  const templateAntecedent = f.memory.ensure(f.X, f.Y);
  const bindings = unifyStructuralRuleTemplate(
    f.memory,
    templateAntecedent,
    actualAntecedent,
    [f.X, f.Y],
  );
  const instantiated = instantiateV013StructuralTemplate(
    f.memory,
    literalTemplateOutput,
    bindings,
  );
  same(instantiated, expectedConcreteOutput, "S2 instantiates output from bindings");
}

// J-axis falsifier: none of the above requires more than one current member.
// True cross-member join cannot repair the S1/S2 gap because the missing power
// is structural matching/substitution over ONE endpoint, not member jointness.
{
  const f = fixture();
  const actual = f.memory.ensure(f.A, f.C);
  const current = f.memory.ensure(f.K, actual);
  const scope = defineV013GroundedExecutionScope(
    f.memory,
    f.fresh(),
    f.theory,
    [current],
  );
  const cursor = new V013GroundedScopeCursor(f.memory, scope);
  same(cursor.members().length, 1, "S-axis witness uses exactly one current member");
}

console.log([
  "MTS_V015_META_M6=STRUCTURAL_MP_NECESSITY_FALSIFIER_GREEN",
  "S0_EXACT_GROUNDED_MP=INSUFFICIENT_FOR_PARAMETERIC_RULE_DIRECT_EXECUTION",
  "S1_STRUCTURAL_MATCHING=SEPARATE_REQUIRED_CAPABILITY_IF_NO_HOST_GROUNDER",
  "S2_TEMPLATE_INSTANTIATION=SEPARATE_REQUIRED_CAPABILITY_IF_NO_HOST_GROUNDER",
  "S0_PLUS_EXTERNAL_S1_S2=GREEN_BOOTSTRAP_ARCHITECTURE",
  "J1_CROSS_MEMBER_JOIN=IRRELEVANT_TO_THIS_GAP",
  "CURRENT_MEMBER_COUNT=1",
  "SELF_HOSTED_META_GROUNDER=NOT_PROVEN",
  "PARAMETRIC_RULE_DIRECT_EXECUTION=REQUIRES_S1_S2_OR_EXTERNAL_GROUNDER",
].join(" "));
