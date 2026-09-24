import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type RootBasis,
} from "../src/memory.js";
import {
  admitStructuralRule,
  defineStructuralRoleDictionary,
  defineStructuralRule,
  readStructuralRoleDictionary,
  readStructuralRule,
  StructuralRuleError,
  verifyStructuralRuleAdmission,
  type StructuralRoleBinding,
} from "../src/structural-rule.js";
import { unifyStructuralTemplate } from "../src/structural-unification.js";
import { defineContext, readContext } from "../src/state.js";

function assert(c: unknown, m: string): asserts c {
  if (!c) throw new Error("v0.13 A72d deterministic NAND composition: " + m);
}

function same<T>(a: T, e: T, m: string): void {
  assert(Object.is(a, e), m + ": values differ");
}

interface GroundedRewrite {
  readonly outputTemplate: LinkHandle;
  readonly bindings: readonly StructuralRoleBinding[];
}

interface ReactionResult {
  readonly consumed: readonly LinkHandle[];
  readonly produced: readonly LinkHandle[];
  readonly matchedRuleCount: number;
}

class WorkingMembership {
  private present: Set<LinkHandle>;

  constructor(initial: readonly LinkHandle[]) {
    this.present = new Set(initial);
  }

  get size(): number {
    return this.present.size;
  }

  has(link: LinkHandle): boolean {
    return this.present.has(link);
  }

  snapshot(): readonly LinkHandle[] {
    return Object.freeze([...this.present]);
  }

  replaceAtomically(
    consumed: readonly LinkHandle[],
    produced: readonly LinkHandle[],
  ): void {
    const next = new Set(this.present);
    for (const link of consumed) {
      assert(next.delete(link), "consumed Context must be present");
    }
    for (const link of produced) next.add(link);
    this.present = next;
  }
}

function defineUnaryTruthRule(
  memory: Memory,
  theory: LinkHandle,
  b: RootBasis,
  seed: LinkHandle,
  fn: LinkHandle,
  input: LinkHandle,
  output: LinkHandle,
): void {
  const kRole = memory.ensure(seed, b.O);
  const dictionary = defineStructuralRoleDictionary(memory, [kRole]);
  const application = memory.ensure(fn, input);
  const before = memory.ensureStartSelfClosed(memory.ensure(kRole, application));
  const after = memory.ensureStartSelfClosed(memory.ensure(kRole, output));
  const rule = defineStructuralRule(memory, dictionary, memory.ensure(before, after));
  admitStructuralRule(memory, theory, rule);
}

function defineBinaryTruthRule(
  memory: Memory,
  theory: LinkHandle,
  b: RootBasis,
  seed: LinkHandle,
  fn: LinkHandle,
  left: LinkHandle,
  right: LinkHandle,
  output: LinkHandle,
): void {
  const kRole = memory.ensure(seed, b.O);
  const dictionary = defineStructuralRoleDictionary(memory, [kRole]);
  const args = memory.ensure(left, right);
  const application = memory.ensure(fn, args);
  const before = memory.ensureStartSelfClosed(memory.ensure(kRole, application));
  const after = memory.ensureStartSelfClosed(memory.ensure(kRole, output));
  const rule = defineStructuralRule(memory, dictionary, memory.ensure(before, after));
  admitStructuralRule(memory, theory, rule);
}

function discoverAllApplicableRules(
  memory: Memory,
  theory: LinkHandle,
  activeContext: LinkHandle,
): readonly GroundedRewrite[] {
  readContext(memory, activeContext);

  const matches: GroundedRewrite[] = [];
  for (const admission of memory.outgoing(theory)) {
    const ap = memory.poles(admission);
    if (ap.start !== theory || ap.end === admission) continue;

    try {
      verifyStructuralRuleAdmission(memory, theory, ap.end, admission);
      const rule = readStructuralRule(memory, ap.end);
      const dictionary = readStructuralRoleDictionary(memory, rule.roleDictionary);
      const body = memory.poles(rule.body);
      const bindings = unifyStructuralTemplate(
        memory,
        body.start,
        activeContext,
        dictionary.roles,
      );
      matches.push(Object.freeze({
        outputTemplate: body.end,
        bindings,
      }));
    } catch (error) {
      if (error instanceof StructuralRuleError) continue;
      throw error;
    }
  }

  return Object.freeze(matches);
}

function instantiateTemplate(
  memory: Memory,
  template: LinkHandle,
  bindings: readonly StructuralRoleBinding[],
): LinkHandle {
  const mapping = new Map<LinkHandle, LinkHandle>();
  for (const binding of bindings) mapping.set(binding.role, binding.value);

  const visiting = new Set<LinkHandle>();
  const clone = (source: LinkHandle): LinkHandle => {
    const known = mapping.get(source);
    if (known !== undefined) return known;

    assert(!visiting.has(source), "unsupported non-self template cycle");
    const p = memory.poles(source);

    let value: LinkHandle;
    if (p.start === source && p.end === source) {
      value = memory.ensureRoot();
    } else if (p.start === source) {
      value = memory.ensureStartSelfClosed(clone(p.end));
    } else if (p.end === source) {
      value = memory.ensureEndSelfClosed(clone(p.start));
    } else {
      visiting.add(source);
      const start = clone(p.start);
      const end = clone(p.end);
      visiting.delete(source);
      value = memory.ensure(start, end);
    }

    mapping.set(source, value);
    return value;
  };

  return clone(template);
}

function reactSingleActiveContext(
  memory: Memory,
  theory: LinkHandle,
  working: WorkingMembership,
): ReactionResult {
  const before = working.snapshot();
  assert(before.length === 1, "A72d requires one active Context per local reaction");
  const active = before[0]!;
  readContext(memory, active);

  const matches = discoverAllApplicableRules(memory, theory, active);
  assert(matches.length > 0, "local reaction requires an applicable Rule");

  const produced = matches.map((match) =>
    instantiateTemplate(memory, match.outputTemplate, match.bindings)
  );
  for (const output of produced) readContext(memory, output);

  working.replaceAtomically([active], produced);
  return Object.freeze({
    consumed: Object.freeze([active]),
    produced: Object.freeze(produced),
    matchedRuleCount: matches.length,
  });
}

/**
 * Generic unary nesting operation used only as an A72d host residual.
 *
 * Suspended outer:
 *
 *   START(K -> (F -> innerCall))
 *
 * Child:
 *
 *   START(suspendedOuter -> innerCall)
 *
 * No function identity is inspected. This is intentionally isolated so later
 * research can ask whether this growth can itself be Rule-driven in Links.
 */
function openNestedUnaryArgument(
  memory: Memory,
  outerContext: LinkHandle,
  working: WorkingMembership,
): LinkHandle {
  assert(working.has(outerContext), "outer Context must be current before growth");

  const outer = readContext(memory, outerContext);
  const application = memory.poles(outer.current);
  const innerCall = application.end;

  const childContext = defineContext(memory, outerContext, innerCall);
  working.replaceAtomically([outerContext], [childContext]);

  same(readContext(memory, childContext).parent, outerContext,
    "child Context carries exact suspended outer Context");
  return childContext;
}

/**
 * Generic one-level unary collapse, also an explicit A72d host residual.
 *
 * Child result:
 *
 *   START(suspendedOuter -> value)
 *
 * Suspended outer:
 *
 *   START(K -> (F -> oldArgument))
 *
 * becomes:
 *
 *   START(K -> (F -> value))
 *
 * Again no concrete function identity is inspected.
 */
function collapseUnaryArgumentResult(
  memory: Memory,
  childResultContext: LinkHandle,
  working: WorkingMembership,
): LinkHandle {
  assert(working.has(childResultContext), "child result must be current");

  const child = readContext(memory, childResultContext);
  const suspendedOuter = child.parent;
  const outer = readContext(memory, suspendedOuter);
  const outerApplication = memory.poles(outer.current);
  const outerFunction = outerApplication.start;

  const resumedApplication = memory.ensure(outerFunction, child.current);
  const resumedContext = defineContext(memory, outer.parent, resumedApplication);

  working.replaceAtomically([childResultContext], [resumedContext]);
  return resumedContext;
}

interface Fixture {
  readonly memory: Memory;
  readonly theory: LinkHandle;
  readonly NOT: LinkHandle;
  readonly AND: LinkHandle;
  readonly FALSE: LinkHandle;
  readonly TRUE: LinkHandle;
  readonly parent: LinkHandle;
}

function buildFixture(): Fixture {
  const memory = new Memory();
  const b = ensureRootBasis(memory);

  let seed = memory.ensure(b.U, b.L);
  const fresh: LinkHandle[] = [];
  for (let i = 0; i < 32; i += 1) {
    seed = memory.ensure(seed, i % 2 === 0 ? b.O : b.C);
    fresh.push(seed);
  }
  const at = (i: number): LinkHandle => {
    const value = fresh[i];
    assert(value !== undefined, "fresh anchor " + i);
    return value;
  };

  const theory = memory.ensure(at(0), at(1));
  const FALSE = memory.ensure(at(2), at(3));
  const TRUE = memory.ensure(at(4), at(5));
  const NOT = memory.ensure(at(6), at(7));
  const AND = memory.ensure(at(8), at(9));
  const parent = memory.ensure(at(10), at(11));

  defineUnaryTruthRule(memory, theory, b, at(12), NOT, FALSE, TRUE);
  defineUnaryTruthRule(memory, theory, b, at(13), NOT, TRUE, FALSE);

  defineBinaryTruthRule(memory, theory, b, at(14), AND, FALSE, FALSE, FALSE);
  defineBinaryTruthRule(memory, theory, b, at(15), AND, FALSE, TRUE, FALSE);
  defineBinaryTruthRule(memory, theory, b, at(16), AND, TRUE, FALSE, FALSE);
  defineBinaryTruthRule(memory, theory, b, at(17), AND, TRUE, TRUE, TRUE);

  return Object.freeze({ memory, theory, NOT, AND, FALSE, TRUE, parent });
}

function runNandCase(
  f: Fixture,
  left: LinkHandle,
  right: LinkHandle,
  expected: LinkHandle,
  label: string,
): void {
  const { memory, theory, NOT, AND, parent } = f;

  const andArgs = memory.ensure(left, right);
  const innerCall = memory.ensure(AND, andArgs);
  const outerCall = memory.ensure(NOT, innerCall);
  const outerContext = defineContext(memory, parent, outerCall);

  const working = new WorkingMembership([outerContext]);

  // There is deliberately no NAND Rule and NOT cannot fire on an unevaluated
  // AND application. Composition therefore exposes a real nested dependency.
  same(discoverAllApplicableRules(memory, theory, outerContext).length, 0,
    label + " outer call is not directly reducible");

  const childContext = openNestedUnaryArgument(memory, outerContext, working);
  same(working.size, 1, label + " growth keeps one deterministic active locus");
  assert(!working.has(outerContext), label + " suspended outer is not current");
  assert(working.has(childContext), label + " inner call becomes current");
  same(readContext(memory, childContext).current, innerCall,
    label + " child evaluates exact inner AND call");

  const innerReaction = reactSingleActiveContext(memory, theory, working);
  same(innerReaction.matchedRuleCount, 1, label + " AND has one result");
  same(innerReaction.produced.length, 1, label + " AND produces one Context");
  const childResultContext = innerReaction.produced[0]!;

  const innerExpected = (left === f.TRUE && right === f.TRUE) ? f.TRUE : f.FALSE;
  same(readContext(memory, childResultContext).current, innerExpected,
    label + " inner AND result");

  const resumedContext =
    collapseUnaryArgumentResult(memory, childResultContext, working);

  same(working.size, 1, label + " collapse keeps one deterministic active locus");
  assert(!working.has(childResultContext), label + " child result ceases to be current");
  assert(working.has(resumedContext), label + " outer call resumes");
  same(readContext(memory, resumedContext).parent, parent,
    label + " collapse returns to original parent");

  const resumedApplication = memory.poles(readContext(memory, resumedContext).current);
  same(resumedApplication.start, NOT, label + " resumed function is NOT");
  same(resumedApplication.end, innerExpected, label + " AND value substituted into NOT");

  const outerReaction = reactSingleActiveContext(memory, theory, working);
  same(outerReaction.matchedRuleCount, 1, label + " resumed NOT has one result");
  same(outerReaction.produced.length, 1, label + " final result cardinality one");

  const finalContext = outerReaction.produced[0]!;
  same(readContext(memory, finalContext).parent, parent,
    label + " final result at original Context level");
  same(readContext(memory, finalContext).current, expected,
    label + " final NAND value");
  same(working.size, 1, label + " execution remains single-valued");
  assert(working.has(finalContext), label + " only final Context is current");
}

function exercise(): void {
  const f = buildFixture();

  runNandCase(f, f.FALSE, f.FALSE, f.TRUE, "NAND(FALSE,FALSE)");
  runNandCase(f, f.FALSE, f.TRUE,  f.TRUE, "NAND(FALSE,TRUE)");
  runNandCase(f, f.TRUE,  f.FALSE, f.TRUE, "NAND(TRUE,FALSE)");
  runNandCase(f, f.TRUE,  f.TRUE,  f.FALSE, "NAND(TRUE,TRUE)");
}

function staticGuards(): void {
  const root = resolve(process.cwd(), "..");
  const own = readFileSync(
    join(root, "ts/test/research-v013-working-amemory-nand-composition-a72d.test.ts"),
    "utf8",
  );

  const growthStart = own.indexOf("function openNestedUnaryArgument(");
  const growthEnd = own.indexOf("\n/**\n * Generic one-level unary collapse", growthStart);
  const growth = own.slice(growthStart, growthEnd);
  for (const forbidden of ["NOT", "AND", "RuleKind", "opcode", "switch("]) {
    assert(!growth.includes(forbidden),
      "nested growth is function-agnostic: " + forbidden);
  }

  const collapseStart = own.indexOf("function collapseUnaryArgumentResult(");
  const collapseEnd = own.indexOf("\ninterface Fixture", collapseStart);
  const collapse = own.slice(collapseStart, collapseEnd);
  for (const forbidden of ["NOT", "AND", "RuleKind", "opcode", "switch("]) {
    assert(!collapse.includes(forbidden),
      "collapse is function-agnostic: " + forbidden);
  }

  const a72a = readFileSync(
    join(root, "ts/test/research-v013-working-amemory-single-rewrite-a72a.test.ts"),
    "utf8",
  );
  const a72b = readFileSync(
    join(root, "ts/test/research-v013-working-amemory-binary-and-a72b.test.ts"),
    "utf8",
  );
  const a72c = readFileSync(
    join(root, "ts/test/research-v013-working-amemory-binary-implies-a72c.test.ts"),
    "utf8",
  );
  assert(a72a.includes("UNARY_LOGIC_NOT_WORKING_DYNAMICS=GREEN_SCOPED_RESEARCH"),
    "A72a NOT retained");
  assert(a72b.includes("BINARY_LOGIC_AND_WORKING_DYNAMICS=GREEN_SCOPED_RESEARCH"),
    "A72b AND retained");
  assert(a72c.includes("NONCOMMUTATIVE_BINARY_IMPLIES=GREEN_SCOPED_RESEARCH"),
    "A72c IMPLIES retained");
}

function main(): void {
  exercise();
  staticGuards();

  console.log([
    "MTS v0.13 A72d: DETERMINISTIC_NAND_COMPOSITION=GREEN_SCOPED_RESEARCH",
    "PROGRAM=NAND_AS_NOT_OF_AND",
    "DIRECT_NAND_RULE=ABSENT",
    "OUTER_NOT_BEFORE_INNER_RESULT=NO_MATCH",
    "NESTED_CONTEXT_GROWTH=GREEN",
    "INNER_AND_REACTION=GREEN",
    "ONE_LEVEL_CONTEXT_COLLAPSE=GREEN",
    "OUTER_NOT_REACTION=GREEN",
    "NAND_00=1 NAND_01=1 NAND_10=1 NAND_11=0",
    "FUNCTION_CLASS=SINGLE_VALUED_FIXED_ARITY_COMPOSITION",
    "ACTIVE_WORKING_CONTEXT_CARDINALITY=1_THROUGHOUT",
    "HOST_RULE_KIND=0 HOST_OPCODE=0 HOST_SELECTED_RULE=0",
    "GROWTH_AND_COLLAPSE_FUNCTION_SPECIFIC=FALSE",
    "HOST_NESTED_GROWTH_COLLAPSE=RESIDUAL",
    "SUSPENDED_CONTEXT_CANONICAL_IDENTITY=RETAINED_CARRIER_LIMITATION",
    "LINKS_ONLY_NESTED_DYNAMICS=NOT_PROVEN",
    "CUMULATIVE_REGRESSION=A72A_NOT_A72B_AND_A72C_IMPLIES_A72D_NAND",
    "NEXT=A72E_RULE_DRIVEN_OR_LINKS_NATIVE_NESTED_LIFECYCLE_FALSIFIER",
    "MULTIVALUED_FUNCTIONS=DEFERRED",
    "VARIABLE_ARITY_FUNCTIONS=DEFERRED",
    "FULL_SELF_HOSTED=FALSE",
    "V013_NOT_ACCEPTED PRODUCTION_UNCHANGED",
  ].join(" "));
}

main();
