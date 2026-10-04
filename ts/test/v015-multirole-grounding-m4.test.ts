import {
  materializeExactSequence,
} from "../src/exact-sequence.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
} from "../src/memory.js";
import {
  StructuralRuleError,
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
  if (!value) throw new Error("v0.15 M4 multi-role grounding: " + message);
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
  for (const member of expected) {
    assert(actual.includes(member), message + " missing member");
  }
}

interface Fixture {
  readonly memory: Memory;
  readonly theory: LinkHandle;
  readonly K: LinkHandle;
  readonly X: LinkHandle;
  readonly Y: LinkHandle;
  readonly A: LinkHandle;
  readonly B: LinkHandle;
  readonly C: LinkHandle;
  readonly D: LinkHandle;
  readonly fresh: () => LinkHandle;
}

function fixture(): Fixture {
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  let cursor = memory.ensure(basis.U, basis.L);
  const fresh = (): LinkHandle => (
    cursor = memory.ensure(cursor, cursor === basis.U ? basis.C : basis.O)
  );

  return Object.freeze({
    memory,
    theory: fresh(),
    K: fresh(),
    X: fresh(),
    Y: fresh(),
    A: fresh(),
    B: fresh(),
    C: fresh(),
    D: fresh(),
    fresh,
  });
}

interface GroundedTemplateResult {
  readonly bindings: readonly StructuralRoleBinding[];
  readonly antecedent: LinkHandle;
  readonly outputs: readonly LinkHandle[];
  readonly image: LinkHandle;
  readonly relation: LinkHandle;
  readonly admission: LinkHandle;
}

/**
 * Generic meta-grounding operation for one already-selected actual antecedent.
 *
 * This is deliberately outside the execution floor:
 * 1. match the parameteric source template against ONE actual structured Link;
 * 2. infer role bindings;
 * 3. instantiate source output templates;
 * 4. publish one ordinary grounded Theory relation A -> [B...].
 *
 * No current Scope enumeration or multi-member join participates here.
 */
function groundTemplate(
  memory: Memory,
  theory: LinkHandle,
  roles: readonly LinkHandle[],
  antecedentTemplate: LinkHandle,
  outputTemplates: readonly LinkHandle[],
  actualAntecedent: LinkHandle,
): GroundedTemplateResult {
  const bindings = unifyStructuralRuleTemplate(
    memory,
    antecedentTemplate,
    actualAntecedent,
    roles,
  );
  const outputs = outputTemplates.map((template) =>
    instantiateV013StructuralTemplate(memory, template, bindings)
  );
  const image = materializeExactSequence(memory, outputs);
  const relation = memory.ensure(actualAntecedent, image);
  const admission = memory.ensure(theory, relation);

  return Object.freeze({
    bindings,
    antecedent: actualAntecedent,
    outputs: Object.freeze(outputs),
    image,
    relation,
    admission,
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

function run(
  f: Fixture,
  currentValue: LinkHandle,
): {
  readonly members: readonly LinkHandle[];
  readonly matchedRelations: number;
} {
  const current = f.memory.ensure(f.K, currentValue);
  const scope = defineV013GroundedExecutionScope(
    f.memory,
    f.fresh(),
    f.theory,
    [current],
  );
  const cursor = new V013GroundedScopeCursor(f.memory, scope);
  const reaction = reactV013GroundedScope(f.memory, cursor, f.fresh());
  return Object.freeze({
    members: cursor.members(),
    matchedRelations: reaction.matchedRelations,
  });
}

// Two correlated roles in one explicit structured antecedent can be grounded
// before execution. The resulting runtime relation is unary MP1.
{
  const f = fixture();
  const { memory, X, Y, A, C } = f;

  const antecedentTemplate = memory.ensure(X, Y);
  const swapTemplate = memory.ensure(Y, X);
  const diagonalTemplate = memory.ensure(X, X);
  const actual = memory.ensure(A, C);

  const grounded = groundTemplate(
    memory,
    f.theory,
    [X, Y],
    antecedentTemplate,
    [swapTemplate, diagonalTemplate],
    actual,
  );

  same(binding(grounded.bindings, X), A, "X binds A");
  same(binding(grounded.bindings, Y), C, "Y binds C");

  const expectedSwap = memory.ensure(C, A);
  const expectedDiagonal = memory.ensure(A, A);
  sameMembers(
    grounded.outputs,
    [expectedSwap, expectedDiagonal],
    "deterministic instantiated output image",
  );

  const result = run(f, actual);
  same(result.matchedRelations, 1, "one grounded runtime relation matched");
  sameMembers(
    result.members,
    [
      memory.ensure(f.K, expectedSwap),
      memory.ensure(f.K, expectedDiagonal),
    ],
    "grounded MP1 realizes two-role source rule",
  );

  // Re-grounding the same selected actual antecedent is canonical/idempotent.
  const repeated = groundTemplate(
    memory,
    f.theory,
    [X, Y],
    antecedentTemplate,
    [swapTemplate, diagonalTemplate],
    actual,
  );
  same(repeated.relation, grounded.relation, "same grounding relation identity");
  same(repeated.admission, grounded.admission, "same admission identity");
}

// The same parameteric rule grounds a different actual structured antecedent
// without changing the execution primitive or source rule topology.
{
  const f = fixture();
  const { memory, X, Y, B, D } = f;
  const antecedentTemplate = memory.ensure(X, Y);
  const outputTemplate = memory.ensure(Y, X);
  const actual = memory.ensure(B, D);

  const grounded = groundTemplate(
    memory,
    f.theory,
    [X, Y],
    antecedentTemplate,
    [outputTemplate],
    actual,
  );

  same(binding(grounded.bindings, X), B, "second grounding X binds B");
  same(binding(grounded.bindings, Y), D, "second grounding Y binds D");
  const expected = memory.ensure(D, B);
  sameMembers(grounded.outputs, [expected], "second grounding output");

  const result = run(f, actual);
  same(result.matchedRelations, 1, "second grounding one runtime match");
  sameMembers(result.members, [memory.ensure(f.K, expected)], "second grounding MP1 result");
}

// Repeated-role correlation is resolved during meta-grounding, not by a
// cross-current-member runtime join.
{
  const f = fixture();
  const { memory, X, A, C } = f;
  const repeatedTemplate = memory.ensure(X, X);

  const equalActual = memory.ensure(A, A);
  const equalBindings = unifyStructuralRuleTemplate(
    memory,
    repeatedTemplate,
    equalActual,
    [X],
  );
  same(binding(equalBindings, X), A, "repeated role consistent binding");

  const unequalActual = memory.ensure(A, C);
  let rejected = false;
  try {
    unifyStructuralRuleTemplate(
      memory,
      repeatedTemplate,
      unequalActual,
      [X],
    );
  } catch (error) {
    assert(error instanceof StructuralRuleError, "repeated-role mismatch error type");
    same(error.code, "template-mismatch", "repeated-role mismatch code");
    rejected = true;
  }
  assert(rejected, "repeated role rejects inconsistent structural binding");
}

// Structural aspect is also a grounding concern. An ordinary PAIR template
// cannot be matched to ROOT merely because its role children are unconstrained.
{
  const f = fixture();
  const { memory, X, Y } = f;
  const pairTemplate = memory.ensure(X, Y);

  let rejected = false;
  try {
    unifyStructuralRuleTemplate(
      memory,
      pairTemplate,
      memory.root,
      [X, Y],
    );
  } catch (error) {
    assert(error instanceof StructuralRuleError, "PAIR-vs-ROOT mismatch type");
    same(error.code, "template-mismatch", "PAIR-vs-ROOT mismatch code");
    rejected = true;
  }
  assert(rejected, "self-incidence-preserving matcher rejects PAIR template on ROOT");
}

console.log([
  "MTS_V015_META_M4=MULTIROLE_GROUNDING_GREEN",
  "SOURCE_RULE_ROLES=2",
  "REPEATED_ROLE_CONSTRAINT=GREEN",
  "SELF_INCIDENCE_PRESERVATION=GREEN",
  "GROUNDING_INPUT=ONE_EXPLICIT_STRUCTURED_ANTECEDENT",
  "GROUNDED_RUNTIME_RELATION=UNARY_MP1",
  "CROSS_MEMBER_JOIN_REQUIRED=FALSE_FOR_THIS_PRESSURE_TEST",
  "GROUNDING_REPEAT=CANONICAL_IDEMPOTENT",
  "EXECUTION_FLOOR_STRENGTHENING=0",
  "META_GROUNDER_SELF_HOSTED=FALSE_THIS_SLICE",
].join(" "));
