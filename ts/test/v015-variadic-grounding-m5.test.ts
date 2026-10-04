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
  if (!value) throw new Error("v0.15 M5 variadic meta-grounding: " + message);
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

interface MetaRule {
  readonly roles: readonly LinkHandle[];
  readonly antecedentTemplate: LinkHandle;
  readonly outputTemplates: readonly LinkHandle[];
}

interface Fixture {
  readonly memory: Memory;
  readonly theory: LinkHandle;
  readonly K: LinkHandle;
  readonly ALL: LinkHandle;
  readonly FALSE: LinkHandle;
  readonly TRUE: LinkHandle;
  readonly sourceRules: readonly MetaRule[];
  readonly fresh: () => LinkHandle;
}

function buildArgumentChain(
  memory: Memory,
  args: readonly LinkHandle[],
): LinkHandle {
  assert(args.length > 0, "positive arity required");
  let chain = memory.root;
  for (let i = args.length - 1; i >= 0; i -= 1) {
    chain = memory.ensure(args[i]!, chain);
  }
  return chain;
}

function buildFixture(): Fixture {
  const memory = new Memory();
  const b = ensureRootBasis(memory);
  let cursor = memory.ensure(b.U, b.L);
  const fresh = (): LinkHandle => (
    cursor = memory.ensure(cursor, cursor === b.U ? b.C : b.O)
  );

  const theory = fresh();
  const K = fresh();
  const FALSE = fresh();
  const TRUE = fresh();
  const ALL = fresh();

  // Meta variables/roles belong to source grounding, not runtime MP.
  const falseTail = fresh();
  const nextHead = fresh();
  const nextRest = fresh();

  // 1. ALL(PAIR(FALSE, tail)) -> FALSE
  const falseArgs = memory.ensure(FALSE, falseTail);
  const falseApplication = memory.ensure(ALL, falseArgs);
  const falseRule: MetaRule = Object.freeze({
    roles: Object.freeze([falseTail]),
    antecedentTemplate: falseApplication,
    outputTemplates: Object.freeze([FALSE]),
  });

  // 2. ALL(PAIR(TRUE, ROOT)) -> TRUE
  const trueTerminalArgs = memory.ensure(TRUE, memory.root);
  const trueTerminalApplication = memory.ensure(ALL, trueTerminalArgs);
  const trueTerminalRule: MetaRule = Object.freeze({
    roles: Object.freeze([]),
    antecedentTemplate: trueTerminalApplication,
    outputTemplates: Object.freeze([TRUE]),
  });

  // 3. ALL(PAIR(TRUE, PAIR(nextHead,nextRest)))
  //      -> ALL(PAIR(nextHead,nextRest))
  const nonEmptyTail = memory.ensure(nextHead, nextRest);
  const trueRecursiveArgs = memory.ensure(TRUE, nonEmptyTail);
  const trueRecursiveApplication = memory.ensure(ALL, trueRecursiveArgs);
  const resumedApplication = memory.ensure(ALL, nonEmptyTail);
  const trueRecursiveRule: MetaRule = Object.freeze({
    roles: Object.freeze([nextHead, nextRest]),
    antecedentTemplate: trueRecursiveApplication,
    outputTemplates: Object.freeze([resumedApplication]),
  });

  return Object.freeze({
    memory,
    theory,
    K,
    ALL,
    FALSE,
    TRUE,
    sourceRules: Object.freeze([
      falseRule,
      trueTerminalRule,
      trueRecursiveRule,
    ]),
    fresh,
  });
}

interface GroundingResult {
  readonly matchedSourceRules: number;
  readonly groundedRelations: readonly LinkHandle[];
}

/**
 * Dynamic generic meta-grounder.
 *
 * It sees ONE explicit current structured endpoint, matches generic source
 * templates against that endpoint, and emits ordinary grounded Theory
 * relations. It neither iterates current Scope members nor performs MP.
 */
function groundApplicableSourceRules(
  f: Fixture,
  actualAntecedent: LinkHandle,
): GroundingResult {
  const relations: LinkHandle[] = [];
  let matchedSourceRules = 0;

  for (const rule of f.sourceRules) {
    let bindings: readonly StructuralRoleBinding[];
    try {
      bindings = unifyStructuralRuleTemplate(
        f.memory,
        rule.antecedentTemplate,
        actualAntecedent,
        rule.roles,
      );
    } catch (error) {
      if (error instanceof StructuralRuleError && error.code === "template-mismatch") {
        continue;
      }
      throw error;
    }

    matchedSourceRules += 1;
    const outputs = rule.outputTemplates.map((template) =>
      instantiateV013StructuralTemplate(f.memory, template, bindings)
    );
    const image = materializeExactSequence(f.memory, outputs);
    const relation = f.memory.ensure(actualAntecedent, image);
    f.memory.ensure(f.theory, relation);
    if (!relations.includes(relation)) relations.push(relation);
  }

  return Object.freeze({
    matchedSourceRules,
    groundedRelations: Object.freeze(relations),
  });
}

function groundedStep(
  f: Fixture,
  value: LinkHandle,
): {
  readonly nextValue: LinkHandle;
  readonly matchedRelations: number;
} {
  const currentTruth = f.memory.ensure(f.K, value);
  const scope = defineV013GroundedExecutionScope(
    f.memory,
    f.fresh(),
    f.theory,
    [currentTruth],
  );
  const cursor = new V013GroundedScopeCursor(f.memory, scope);
  const reaction = reactV013GroundedScope(f.memory, cursor, f.fresh());

  same(cursor.members().length, 1, "deterministic successor cardinality");
  const successorTruth = cursor.members()[0]!;
  const poles = f.memory.poles(successorTruth);
  same(poles.start, f.K, "grounded MP preserves K");

  return Object.freeze({
    nextValue: poles.end,
    matchedRelations: reaction.matchedRelations,
  });
}

interface RunSpec {
  readonly args: readonly LinkHandle[];
  readonly expected: LinkHandle;
  readonly label: string;
  readonly expectedSteps: number;
}

function runSpec(f: Fixture, spec: RunSpec): void {
  let current = f.memory.ensure(
    f.ALL,
    buildArgumentChain(f.memory, spec.args),
  );
  let steps = 0;

  while (current !== f.FALSE && current !== f.TRUE) {
    const grounding = groundApplicableSourceRules(f, current);
    same(
      grounding.matchedSourceRules,
      1,
      spec.label + " exactly one generic source rule grounds",
    );
    same(
      grounding.groundedRelations.length,
      1,
      spec.label + " one grounded unary relation emitted",
    );

    const reaction = groundedStep(f, current);
    same(
      reaction.matchedRelations,
      1,
      spec.label + " exactly one grounded MP relation fires",
    );
    current = reaction.nextValue;
    steps += 1;
    assert(steps <= spec.args.length, spec.label + " terminates within arity");
  }

  same(current, spec.expected, spec.label + " exact result");
  same(steps, spec.expectedSteps, spec.label + " exact reduction steps");
}

const f = buildFixture();
const F = f.FALSE;
const T = f.TRUE;

same(f.sourceRules.length, 3, "exactly three generic source rules");

const specs: readonly RunSpec[] = Object.freeze([
  { args: [F], expected: F, label: "ALL(F)", expectedSteps: 1 },
  { args: [T], expected: T, label: "ALL(T)", expectedSteps: 1 },

  { args: [F, F], expected: F, label: "ALL(F,F)", expectedSteps: 1 },
  { args: [F, T], expected: F, label: "ALL(F,T)", expectedSteps: 1 },
  { args: [T, F], expected: F, label: "ALL(T,F)", expectedSteps: 2 },
  { args: [T, T], expected: T, label: "ALL(T,T)", expectedSteps: 2 },

  { args: [T, T, T], expected: T, label: "ALL(T,T,T)", expectedSteps: 3 },
  { args: [T, T, F], expected: F, label: "ALL(T,T,F)", expectedSteps: 3 },
  { args: [T, T, T, T, T], expected: T, label: "ALL(T^5)", expectedSteps: 5 },
  { args: [T, T, T, F, T], expected: F, label: "ALL(T,T,T,F,T)", expectedSteps: 4 },
]);

for (const spec of specs) runSpec(f, spec);

// No grounded truth-table-per-tuple is authored. Grounded relations arise only
// for actual encountered applications, while source rule count remains 3.
assert(specs.length > f.sourceRules.length, "tested applications exceed generic rule count");

// The execution floor never receives N separate function arguments. Each ALL
// application is one explicit Link endpoint whose internal recursive structure
// is a meta-grounding concern.
for (const spec of specs) {
  const carrier = buildArgumentChain(f.memory, spec.args);
  const application = f.memory.ensure(f.ALL, carrier);
  const truth = f.memory.ensure(f.K, application);
  same(f.memory.poles(truth).end, application, spec.label + " one unary endpoint");
}

console.log([
  "MTS_V015_META_M5=VARIADIC_GROUNDING_GREEN",
  "PROGRAM=ALL",
  "GENERIC_SOURCE_RULE_COUNT=3",
  "TESTED_ARITIES=1_2_3_5",
  "GROUNDED_RULE_PER_INPUT_TUPLE_AUTHORED=0",
  "META_GROUNDING=DYNAMIC_PER_EXPLICIT_APPLICATION",
  "EXECUTION=GROUNDED_UNARY_MP1",
  "EXECUTION_KERNEL_ARITY_BLIND=TRUE",
  "CROSS_MEMBER_JOIN_REQUIRED=FALSE",
  "VARIABLE_ARITY_DOES_NOT_IMPLY_STRONGER_MP=TRUE",
  "META_GROUNDER_SELF_HOSTED=FALSE_THIS_SLICE",
].join(" "));
