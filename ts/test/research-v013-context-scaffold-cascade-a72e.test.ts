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
import {
  defineContext,
  readContext,
  StateError,
} from "../src/state.js";

function assert(c: unknown, m: string): asserts c {
  if (!c) throw new Error("v0.13 A72e Context scaffold cascade: " + m);
}

function same<T>(a: T, e: T, m: string): void {
  assert(Object.is(a, e), m + ": values differ");
}

interface GroundedRewrite {
  readonly outputTemplate: LinkHandle;
  readonly bindings: readonly StructuralRoleBinding[];
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

  only(): LinkHandle {
    assert(this.present.size === 1, "working state must contain exactly one member");
    const value = this.present.values().next().value as LinkHandle | undefined;
    assert(value !== undefined, "working state member");
    return value;
  }

  replaceAtomically(
    consumed: readonly LinkHandle[],
    produced: readonly LinkHandle[],
  ): void {
    const next = new Set(this.present);
    for (const link of consumed) {
      assert(next.delete(link), "consumed member must be current");
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
  const before = memory.ensureStartSelfClosed(
    memory.ensure(kRole, memory.ensure(fn, input)),
  );
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
  const application = memory.ensure(fn, memory.ensure(left, right));
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
): LinkHandle {
  const active = working.only();
  readContext(memory, active);

  const matches = discoverAllApplicableRules(memory, theory, active);
  assert(matches.length === 1,
    "single-valued deterministic phase requires exactly one applicable Rule");

  const match = matches[0]!;
  const produced = instantiateTemplate(
    memory,
    match.outputTemplate,
    match.bindings,
  );
  readContext(memory, produced);
  working.replaceAtomically([active], [produced]);
  return produced;
}

/**
 * A72e host residual: suspend one unary application and make its argument call
 * the current child Context. No concrete function identity or depth is known.
 */
function openNestedUnaryArgument(
  memory: Memory,
  outerContext: LinkHandle,
  working: WorkingMembership,
): LinkHandle {
  assert(working.has(outerContext), "outer Context must be current before growth");

  const outer = readContext(memory, outerContext);
  const application = memory.poles(outer.current);
  const child = defineContext(memory, outerContext, application.end);

  working.replaceAtomically([outerContext], [child]);
  return child;
}

/**
 * A72e host residual: consume one completed child Context and rebuild exactly
 * one suspended unary application with the child value as its new argument.
 */
function collapseOneLevel(
  memory: Memory,
  childResultContext: LinkHandle,
  working: WorkingMembership,
): LinkHandle {
  assert(working.has(childResultContext), "child result must be current");

  const child = readContext(memory, childResultContext);
  const suspended = readContext(memory, child.parent);
  const suspendedApplication = memory.poles(suspended.current);

  const resumedApplication =
    memory.ensure(suspendedApplication.start, child.current);
  const resumed = defineContext(memory, suspended.parent, resumedApplication);

  working.replaceAtomically([childResultContext], [resumed]);
  return resumed;
}

function contextDepthTo(
  memory: Memory,
  activeContext: LinkHandle,
  rootParent: LinkHandle,
): number {
  let depth = 0;
  let cursor = activeContext;

  while (true) {
    const state = readContext(memory, cursor);
    depth += 1;
    if (state.parent === rootParent) return depth;
    cursor = state.parent;
  }
}

function contextAncestry(
  memory: Memory,
  activeContext: LinkHandle,
  rootParent: LinkHandle,
): readonly LinkHandle[] {
  const result: LinkHandle[] = [];
  let cursor = activeContext;

  while (true) {
    result.push(cursor);
    const state = readContext(memory, cursor);
    if (state.parent === rootParent) return Object.freeze(result);
    cursor = state.parent;
  }
}

function isContext(memory: Memory, link: LinkHandle): boolean {
  try {
    readContext(memory, link);
    return true;
  } catch (error) {
    if (error instanceof StateError && error.code === "invalid-context") {
      return false;
    }
    throw error;
  }
}

/**
 * Final top-level teardown.
 *
 * The scalar value is attached to a stable result slot and the last Context is
 * removed from current working membership. Canonical Context identity remains
 * in the append-only carrier, so this tests semantic teardown, not deletion.
 */
function publishStableResult(
  memory: Memory,
  rootParent: LinkHandle,
  resultSlot: LinkHandle,
  terminalContext: LinkHandle,
  working: WorkingMembership,
): LinkHandle {
  assert(working.has(terminalContext), "terminal Context must be current");
  const terminal = readContext(memory, terminalContext);
  same(terminal.parent, rootParent, "terminal Context is top-level");

  const result = memory.ensure(resultSlot, terminal.current);
  working.replaceAtomically([terminalContext], [result]);

  assert(!isContext(memory, result), "published result is not a Context");
  return result;
}

interface Fixture {
  readonly memory: Memory;
  readonly theory: LinkHandle;
  readonly NOT: LinkHandle;
  readonly AND: LinkHandle;
  readonly FALSE: LinkHandle;
  readonly TRUE: LinkHandle;
  readonly rootParent: LinkHandle;
  readonly resultRoot: LinkHandle;
}

function buildFixture(): Fixture {
  const memory = new Memory();
  const b = ensureRootBasis(memory);

  let seed = memory.ensure(b.U, b.L);
  const fresh: LinkHandle[] = [];
  for (let i = 0; i < 40; i += 1) {
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
  const rootParent = memory.ensure(at(10), at(11));
  const resultRoot = memory.ensure(at(12), at(13));

  defineUnaryTruthRule(memory, theory, b, at(14), NOT, FALSE, TRUE);
  defineUnaryTruthRule(memory, theory, b, at(15), NOT, TRUE, FALSE);

  defineBinaryTruthRule(memory, theory, b, at(16), AND, FALSE, FALSE, FALSE);
  defineBinaryTruthRule(memory, theory, b, at(17), AND, FALSE, TRUE, FALSE);
  defineBinaryTruthRule(memory, theory, b, at(18), AND, TRUE, FALSE, FALSE);
  defineBinaryTruthRule(memory, theory, b, at(19), AND, TRUE, TRUE, TRUE);

  return Object.freeze({
    memory,
    theory,
    NOT,
    AND,
    FALSE,
    TRUE,
    rootParent,
    resultRoot,
  });
}

function runDeepCase(
  f: Fixture,
  left: LinkHandle,
  right: LinkHandle,
  expected: LinkHandle,
  label: string,
): void {
  const { memory, theory, NOT, AND, rootParent, resultRoot } = f;

  const leaf = memory.ensure(AND, memory.ensure(left, right));
  const n1 = memory.ensure(NOT, leaf);
  const n2 = memory.ensure(NOT, n1);
  const n3 = memory.ensure(NOT, n2);
  const outer = defineContext(memory, rootParent, n3);

  const resultSlot = memory.ensure(resultRoot, memory.ensure(left, right));
  const working = new WorkingMembership([outer]);
  const scaffold = new Set<LinkHandle>([outer]);

  const depthTrace: number[] = [contextDepthTo(memory, outer, rootParent)];

  // Descend structurally until the current call is directly reducible.
  while (discoverAllApplicableRules(memory, theory, working.only()).length === 0) {
    const child = openNestedUnaryArgument(memory, working.only(), working);
    for (const context of contextAncestry(memory, child, rootParent)) {
      scaffold.add(context);
    }
    depthTrace.push(contextDepthTo(memory, child, rootParent));
  }

  same(depthTrace.length, 4, label + " creates three nested child Contexts");
  same(depthTrace[0]!, 1, label + " starts at Context depth 1");
  same(depthTrace[1]!, 2, label + " reaches depth 2");
  same(depthTrace[2]!, 3, label + " reaches depth 3");
  same(depthTrace[3]!, 4, label + " reaches depth 4");

  let current = reactSingleActiveContext(memory, theory, working);
  scaffold.add(current);
  same(contextDepthTo(memory, current, rootParent), 4,
    label + " leaf result still belongs to deepest scaffold level");

  let collapseCount = 0;
  while (readContext(memory, current).parent !== rootParent) {
    const beforeDepth = contextDepthTo(memory, current, rootParent);
    const resumed = collapseOneLevel(memory, current, working);
    scaffold.add(resumed);

    same(contextDepthTo(memory, resumed, rootParent), beforeDepth - 1,
      label + " each collapse removes exactly one unresolved Context level");

    current = reactSingleActiveContext(memory, theory, working);
    scaffold.add(current);
    collapseCount += 1;
  }

  same(collapseCount, 3, label + " performs three outward collapses");
  same(contextDepthTo(memory, current, rootParent), 1,
    label + " only top-level terminal Context remains before publication");
  same(readContext(memory, current).current, expected,
    label + " deep composition produces simple expected boolean");

  const stableResult =
    publishStableResult(memory, rootParent, resultSlot, current, working);

  same(working.size, 1, label + " final working state has one stable Result");
  same(working.only(), stableResult, label + " Result is current working member");
  same(memory.poles(stableResult).start, resultSlot, label + " result slot");
  same(memory.poles(stableResult).end, expected, label + " result value");

  // Strong scaffold criterion: none of the Context Links used during the
  // computation is in final working membership.
  for (const context of scaffold) {
    assert(!working.has(context), label + " temporary Context absent at completion");
    assert(isContext(memory, context),
      label + " canonical Context identity remains readable in append-only carrier");
  }

  assert(!isContext(memory, working.only()),
    label + " completed working state contains Result, not Context");
}

function exercise(): void {
  const f = buildFixture();

  // NOT(NOT(NOT(AND(x,y)))) = NAND(x,y), but requires three nested Context
  // collapses instead of A72d's one.
  runDeepCase(f, f.FALSE, f.FALSE, f.TRUE, "DEEP(FALSE,FALSE)");
  runDeepCase(f, f.FALSE, f.TRUE,  f.TRUE, "DEEP(FALSE,TRUE)");
  runDeepCase(f, f.TRUE,  f.FALSE, f.TRUE, "DEEP(TRUE,FALSE)");
  runDeepCase(f, f.TRUE,  f.TRUE,  f.FALSE, "DEEP(TRUE,TRUE)");
}

function staticGuards(): void {
  const root = resolve(process.cwd(), "..");
  const own = readFileSync(
    join(root, "ts/test/research-v013-context-scaffold-cascade-a72e.test.ts"),
    "utf8",
  );

  for (const functionName of [
    "openNestedUnaryArgument",
    "collapseOneLevel",
    "publishStableResult",
  ]) {
    const start = own.indexOf("function " + functionName + "(");
    assert(start >= 0, functionName + " source slice");
    const nextFunction = own.indexOf("\nfunction ", start + 10);
    const nextInterface = own.indexOf("\ninterface ", start + 10);
    const candidates = [nextFunction, nextInterface].filter((index) => index >= 0);
    const end = candidates.length > 0 ? Math.min(...candidates) : own.length;
    const source = own.slice(start, end);
    for (const forbidden of ["NOT", "AND", "RuleKind", "opcode", "switch("]) {
      assert(!source.includes(forbidden),
        functionName + " remains function-agnostic: " + forbidden);
    }
  }

  const prior = [
    ["research-v013-working-amemory-single-rewrite-a72a.test.ts",
      "UNARY_LOGIC_NOT_WORKING_DYNAMICS=GREEN_SCOPED_RESEARCH"],
    ["research-v013-working-amemory-binary-and-a72b.test.ts",
      "BINARY_LOGIC_AND_WORKING_DYNAMICS=GREEN_SCOPED_RESEARCH"],
    ["research-v013-working-amemory-binary-implies-a72c.test.ts",
      "NONCOMMUTATIVE_BINARY_IMPLIES=GREEN_SCOPED_RESEARCH"],
    ["research-v013-working-amemory-nand-composition-a72d.test.ts",
      "DETERMINISTIC_NAND_COMPOSITION=GREEN_SCOPED_RESEARCH"],
  ] as const;

  for (const [file, marker] of prior) {
    const source = readFileSync(join(root, "ts/test/" + file), "utf8");
    assert(source.includes(marker), "retained cumulative witness: " + file);
  }
}

function main(): void {
  exercise();
  staticGuards();

  console.log([
    "MTS v0.13 A72e: CONTEXT_SCAFFOLD_CASCADE=GREEN_SCOPED_RESEARCH",
    "PROGRAM=NOT_NOT_NOT_AND",
    "FUNCTION_CLASS=SINGLE_VALUED_FIXED_ARITY_DEEP_COMPOSITION",
    "MAX_CONTEXT_DEPTH=4",
    "CASCADE_COLLAPSE_LEVELS=3",
    "FINAL_VALUE_DEPTH=SIMPLE_BOOLEAN",
    "CONTEXT_DEPTH_EQUALS_RESULT_DEPTH=FALSE",
    "TEMP_CONTEXT_SCAFFOLD_REQUIRED_WHILE_UNFINISHED=GREEN",
    "FINAL_WORKING_CONTEXT_COUNT=0",
    "FINAL_WORKING_RESULT_COUNT=1",
    "RESULT_PERSISTS_AFTER_CONTEXT_TEARDOWN=GREEN",
    "CANONICAL_CONTEXT_IDENTITY_REMAINS_READABLE=TRUE",
    "CURRENT_WORKING_MEMBERSHIP_OF_OLD_CONTEXTS=FALSE",
    "PHYSICAL_CONTEXT_DELETION=NOT_CLAIMED",
    "HOST_NESTED_GROWTH=RESIDUAL",
    "HOST_COLLAPSE=RESIDUAL",
    "HOST_RESULT_PUBLICATION=RESIDUAL",
    "LINKS_ONLY_SCAFFOLD_DYNAMICS=NOT_PROVEN",
    "NEXT=A72F_HIERARCHICAL_RESULT_WITH_FULL_SCAFFOLD_TEARDOWN",
    "MULTIVALUED_FUNCTIONS=DEFERRED",
    "VARIABLE_ARITY_FUNCTIONS=DEFERRED",
    "FULL_SELF_HOSTED=FALSE",
    "V013_NOT_ACCEPTED PRODUCTION_UNCHANGED",
  ].join(" "));
}

main();
