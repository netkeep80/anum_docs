import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  Memory,
  MemoryError,
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
  if (!c) throw new Error("v0.13 A72f hierarchical result scaffold: " + m);
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

/**
 * Generic PACK Rule:
 *
 *   START(K -> (PACK -> X))
 *     ->
 *   START(K -> (TAG -> (X -> MARK)))
 *
 * Both K and X are structural roles. The hierarchical result therefore depends
 * on the runtime value bound to X; it is not a pre-grounded answer table.
 */
function defineNaivePackRule(
  memory: Memory,
  theory: LinkHandle,
  b: RootBasis,
  kSeed: LinkHandle,
  xSeed: LinkHandle,
  pack: LinkHandle,
  tag: LinkHandle,
  mark: LinkHandle,
): void {
  const kRole = memory.ensure(kSeed, b.O);
  const xRole = memory.ensure(xSeed, b.C);
  const dictionary = defineStructuralRoleDictionary(memory, [kRole, xRole]);

  const inputCall = memory.ensure(pack, xRole);
  const before = memory.ensureStartSelfClosed(memory.ensure(kRole, inputCall));

  const dynamicInner = memory.ensure(xRole, mark);
  const dynamicResult = memory.ensure(tag, dynamicInner);
  const after = memory.ensureStartSelfClosed(memory.ensure(kRole, dynamicResult));

  const rule = defineStructuralRule(memory, dictionary, memory.ensure(before, after));
  admitStructuralRule(memory, theory, rule);
}

/**
 * Completion-gated PACK consumes evidence shaped as a completed child Context:
 *
 *   START( START(K -> (PACK -> OLD)) -> X )
 *     ->
 *   START( K -> (TAG -> (X -> MARK)) )
 *
 * The child Context is the completion authority for X. Construction of the
 * hierarchical Result and removal of the suspended PACK level are one Rule.
 */
function defineCompletionGatedPackRule(
  memory: Memory,
  theory: LinkHandle,
  b: RootBasis,
  kSeed: LinkHandle,
  oldSeed: LinkHandle,
  xSeed: LinkHandle,
  pack: LinkHandle,
  tag: LinkHandle,
  mark: LinkHandle,
): void {
  const kRole = memory.ensure(kSeed, b.O);
  const oldRole = memory.ensure(oldSeed, b.C);
  const xRole = memory.ensure(xSeed, b.L);
  const dictionary =
    defineStructuralRoleDictionary(memory, [kRole, oldRole, xRole]);

  const suspendedCall = memory.ensure(pack, oldRole);
  const suspendedContext =
    memory.ensureStartSelfClosed(memory.ensure(kRole, suspendedCall));
  const completedChild =
    memory.ensureStartSelfClosed(memory.ensure(suspendedContext, xRole));

  const dynamicInner = memory.ensure(xRole, mark);
  const dynamicResult = memory.ensure(tag, dynamicInner);
  const outputContext =
    memory.ensureStartSelfClosed(memory.ensure(kRole, dynamicResult));

  const rule = defineStructuralRule(
    memory,
    dictionary,
    memory.ensure(completedChild, outputContext),
  );
  admitStructuralRule(memory, theory, rule);
}

/**
 * A71p strict Rule relation, source-equivalent in semantics:
 * projection unification remains aspect-insensitive, but Rule matching must
 * preserve the two self-incidence bits of every non-role node.
 */
function unifyRuleTemplate(
  memory: Memory,
  template: LinkHandle,
  claimed: LinkHandle,
  roles: readonly LinkHandle[],
): readonly StructuralRoleBinding[] {
  if (new Set(roles).size !== roles.length) {
    throw new StructuralRuleError("duplicate-role");
  }

  const before = memory.linkCount;
  const roleSet = new Set(roles);
  const inferred = new Map<LinkHandle, LinkHandle>();
  const containsMemo = new Map<LinkHandle, boolean>();
  const containsActive = new Set<LinkHandle>();

  const containsRole = (node: LinkHandle): boolean => {
    if (roleSet.has(node)) return true;
    const cached = containsMemo.get(node);
    if (cached !== undefined) return cached;
    if (containsActive.has(node)) return false;
    containsActive.add(node);
    try {
      const p = memory.poles(node);
      const result = containsRole(p.start) || containsRole(p.end);
      containsMemo.set(node, result);
      return result;
    } finally {
      containsActive.delete(node);
    }
  };

  const visited = new Map<LinkHandle, Set<LinkHandle>>();
  const markVisited = (left: LinkHandle, right: LinkHandle): boolean => {
    let rights = visited.get(left);
    if (rights === undefined) {
      rights = new Set<LinkHandle>();
      visited.set(left, rights);
    }
    if (rights.has(right)) return true;
    rights.add(right);
    return false;
  };

  const unify = (left: LinkHandle, right: LinkHandle): void => {
    if (roleSet.has(left)) {
      const previous = inferred.get(left);
      if (previous !== undefined && previous !== right) {
        throw new StructuralRuleError("template-mismatch");
      }
      inferred.set(left, right);
      return;
    }
    if (!containsRole(left)) {
      if (left !== right) throw new StructuralRuleError("template-mismatch");
      return;
    }
    if (markVisited(left, right)) return;

    try {
      const lp = memory.poles(left);
      const rp = memory.poles(right);
      if (
        (lp.start === left) !== (rp.start === right) ||
        (lp.end === left) !== (rp.end === right)
      ) {
        throw new StructuralRuleError("template-mismatch");
      }
      unify(lp.start, rp.start);
      unify(lp.end, rp.end);
    } catch (error) {
      if (error instanceof StructuralRuleError) throw error;
      if (error instanceof MemoryError) {
        throw new StructuralRuleError("template-mismatch");
      }
      throw error;
    }
  };

  try {
    unify(template, claimed);
    return Object.freeze(roles.map((role) => {
      const value = inferred.get(role);
      if (value === undefined) throw new StructuralRuleError("missing-role-binding");
      return Object.freeze({ role, value });
    }));
  } finally {
    same(memory.linkCount, before, "strict Rule matching is read-only");
  }
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
      const bindings = unifyRuleTemplate(
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

function discoverAllApplicableRulesByProjection(
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
        memory, body.start, activeContext, dictionary.roles,
      );
      matches.push(Object.freeze({ outputTemplate: body.end, bindings }));
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

function collapseOneLevel(
  memory: Memory,
  childResultContext: LinkHandle,
  working: WorkingMembership,
): LinkHandle {
  assert(working.has(childResultContext), "child result must be current");

  const child = readContext(memory, childResultContext);
  const suspended = readContext(memory, child.parent);
  const suspendedApplication = memory.poles(suspended.current);

  const resumedCall = memory.ensure(suspendedApplication.start, child.current);
  const resumed = defineContext(memory, suspended.parent, resumedCall);

  working.replaceAtomically([childResultContext], [resumed]);
  return resumed;
}

function contextDepthTo(
  memory: Memory,
  context: LinkHandle,
  rootParent: LinkHandle,
): number {
  let cursor = context;
  let depth = 0;
  while (true) {
    const state = readContext(memory, cursor);
    depth += 1;
    if (state.parent === rootParent) return depth;
    cursor = state.parent;
  }
}

function contextAncestry(
  memory: Memory,
  context: LinkHandle,
  rootParent: LinkHandle,
): readonly LinkHandle[] {
  const result: LinkHandle[] = [];
  let cursor = context;
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

function publishStableResult(
  memory: Memory,
  rootParent: LinkHandle,
  resultSlot: LinkHandle,
  terminalContext: LinkHandle,
  working: WorkingMembership,
): LinkHandle {
  const terminal = readContext(memory, terminalContext);
  same(terminal.parent, rootParent, "terminal Context is top-level");

  const stable = memory.ensure(resultSlot, terminal.current);
  working.replaceAtomically([terminalContext], [stable]);
  assert(!isContext(memory, stable), "stable result is not a Context");
  return stable;
}

interface Fixture {
  readonly memory: Memory;
  readonly theory: LinkHandle;
  readonly naiveTheory: LinkHandle;
  readonly NOT: LinkHandle;
  readonly PACK: LinkHandle;
  readonly FALSE: LinkHandle;
  readonly TRUE: LinkHandle;
  readonly TAG: LinkHandle;
  readonly MARK: LinkHandle;
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
  const naiveTheory = memory.ensure(at(1), at(2));
  const FALSE = memory.ensure(at(2), at(3));
  const TRUE = memory.ensure(at(4), at(5));
  const NOT = memory.ensure(at(6), at(7));
  const PACK = memory.ensure(at(8), at(9));
  const TAG = memory.ensure(at(10), at(11));
  const MARK = memory.ensure(at(12), at(13));
  const rootParent = memory.ensure(at(14), at(15));
  const resultRoot = memory.ensure(at(16), at(17));

  defineUnaryTruthRule(memory, theory, b, at(18), NOT, FALSE, TRUE);
  defineUnaryTruthRule(memory, theory, b, at(19), NOT, TRUE, FALSE);

  // Negative control: direct PACK(X) has no completion evidence.
  defineNaivePackRule(
    memory, naiveTheory, b, at(20), at(21), PACK, TAG, MARK,
  );

  // Actual Rule: completed child Context is the completion authority.
  defineCompletionGatedPackRule(
    memory, theory, b, at(22), at(23), at(24), PACK, TAG, MARK,
  );

  return Object.freeze({
    memory,
    theory,
    naiveTheory,
    NOT,
    PACK,
    FALSE,
    TRUE,
    TAG,
    MARK,
    rootParent,
    resultRoot,
  });
}

function runCase(
  f: Fixture,
  input: LinkHandle,
  expectedScalar: LinkHandle,
  label: string,
): void {
  const {
    memory,
    theory,
    naiveTheory,
    NOT,
    PACK,
    TAG,
    MARK,
    rootParent,
    resultRoot,
  } = f;

  // PACK(NOT(NOT(NOT(input)))): Context depth grows to four, then the scalar
  // argument is propagated back to PACK, whose Rule constructs a hierarchy.
  const n1 = memory.ensure(NOT, input);
  const n2 = memory.ensure(NOT, n1);
  const n3 = memory.ensure(NOT, n2);
  const program = memory.ensure(PACK, n3);
  const outer = defineContext(memory, rootParent, program);

  const resultSlot = memory.ensure(resultRoot, input);
  const working = new WorkingMembership([outer]);
  const scaffold = new Set<LinkHandle>([outer]);

  // The first A72f attempt failed here: direct PACK(X) accepts n3 as X even
  // though n3 is still an unevaluated call.
  same(discoverAllApplicableRules(memory, naiveTheory, outer).length, 1,
    label + " naive PACK(X) prematurely accepts an unevaluated argument");
  assert(
    discoverAllApplicableRulesByProjection(memory, theory, outer).length > 0,
    label + " projection matcher falsely admits completion-gated Rule early",
  );
  same(discoverAllApplicableRules(memory, theory, outer).length, 0,
    label + " strict A71p matcher rejects premature completion");

  while (discoverAllApplicableRules(memory, theory, working.only()).length === 0) {
    const child = openNestedUnaryArgument(memory, working.only(), working);
    for (const context of contextAncestry(memory, child, rootParent)) {
      scaffold.add(context);
    }
  }

  same(contextDepthTo(memory, working.only(), rootParent), 4,
    label + " unresolved computation reaches Context depth four");

  let current = reactSingleActiveContext(memory, theory, working);
  scaffold.add(current);

  // Resolve only the inner NOT scaffold levels by the existing host helper.
  // When the computed scalar becomes a child of suspended PACK, stop: the
  // completion-gated PACK Rule itself performs the outer collapse.
  let hostCollapseCount = 0;
  while (readContext(memory, current).parent !== outer) {
    const beforeDepth = contextDepthTo(memory, current, rootParent);
    const resumed = collapseOneLevel(memory, current, working);
    scaffold.add(resumed);
    same(contextDepthTo(memory, resumed, rootParent), beforeDepth - 1,
      label + " host collapse removes one NOT scaffold level");

    current = reactSingleActiveContext(memory, theory, working);
    scaffold.add(current);
    hostCollapseCount += 1;
  }

  same(hostCollapseCount, 2, label + " only two inner collapses remain host-side");
  same(contextDepthTo(memory, current, rootParent), 2,
    label + " completed scalar remains under suspended PACK");
  same(readContext(memory, current).current, expectedScalar,
    label + " child Context carries completed runtime scalar");

  same(memory.find(expectedScalar, MARK), undefined,
    label + " runtime hierarchy payload absent before PACK reaction");
  same(discoverAllApplicableRules(memory, theory, current).length, 1,
    label + " completed child enables exactly one gated PACK Rule");

  // Atomic semantic event: build Result + remove the outer PACK scaffold level.
  current = reactSingleActiveContext(memory, theory, working);
  scaffold.add(current);
  same(contextDepthTo(memory, current, rootParent), 1,
    label + " gated PACK collapses outer scaffold while constructing Result");

  const terminal = readContext(memory, current);
  same(terminal.parent, rootParent, label + " PACK result is top-level");

  const resultValue = terminal.current;
  const resultPoles = memory.poles(resultValue);
  same(resultPoles.start, TAG, label + " hierarchy root tag");

  const innerPoles = memory.poles(resultPoles.end);
  same(innerPoles.start, expectedScalar, label + " hierarchy embeds runtime scalar");
  same(innerPoles.end, MARK, label + " hierarchy carries stable marker");
  same(memory.find(expectedScalar, MARK), resultPoles.end,
    label + " runtime-bound inner Result Link was materialized by PACK");
  same(memory.find(TAG, resultPoles.end), resultValue,
    label + " runtime-bound outer Result Link was materialized by PACK");

  // The grounded hierarchy was not the Rule's pre-grounded answer. It is the
  // instantiated result of binding X to the runtime scalar.
  assert(resultValue !== TAG && resultValue !== MARK,
    label + " hierarchy is a distinct constructed Link");

  const stable =
    publishStableResult(memory, rootParent, resultSlot, current, working);

  same(working.size, 1, label + " final state has exactly one stable Result");
  same(working.only(), stable, label + " stable Result is current");
  same(memory.poles(stable).end, resultValue,
    label + " stable Result points at hierarchical value");

  // Result topology remains traversable after all temporary Contexts leave the
  // working state.
  const stableHierarchy = memory.poles(memory.poles(stable).end);
  same(stableHierarchy.start, TAG, label + " persisted hierarchy root");
  const stableInner = memory.poles(stableHierarchy.end);
  same(stableInner.start, expectedScalar, label + " persisted runtime payload");
  same(stableInner.end, MARK, label + " persisted marker");

  for (const context of scaffold) {
    assert(!working.has(context), label + " scaffold Context absent at completion");
    assert(isContext(memory, context),
      label + " Context identity remains readable in append-only carrier");
  }
  assert(!isContext(memory, stable), label + " final working member is not Context");
}

function exercise(): void {
  const f = buildFixture();

  // Three NOTs invert the scalar before PACK constructs the hierarchy.
  runCase(f, f.FALSE, f.TRUE, "PACK_DEEP(FALSE)");
  runCase(f, f.TRUE, f.FALSE, "PACK_DEEP(TRUE)");
}

function staticGuards(): void {
  const root = resolve(process.cwd(), "..");
  const own = readFileSync(
    join(root, "ts/test/research-v013-hierarchical-result-scaffold-a72f.test.ts"),
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
    for (const forbidden of ["NOT", "PACK", "RuleKind", "opcode", "switch("]) {
      assert(!source.includes(forbidden),
        functionName + " remains function-agnostic: " + forbidden);
    }
  }

  const a72e = readFileSync(
    join(root, "ts/test/research-v013-context-scaffold-cascade-a72e.test.ts"),
    "utf8",
  );
  assert(a72e.includes("CONTEXT_SCAFFOLD_CASCADE=GREEN_SCOPED_RESEARCH"),
    "A72e scalar scaffold teardown remains retained");

  const runner = readFileSync(join(root, "ts/src/tooling/test-runner.ts"), "utf8");
  assert(runner.includes('for (const test of builtTests)'),
    "full retained corpus remains cumulative");
}

function main(): void {
  exercise();
  staticGuards();

  console.log([
    "MTS v0.13 A72f: HIERARCHICAL_RESULT_SCAFFOLD_TEARDOWN=GREEN_SCOPED_RESEARCH",
    "PROGRAM=PACK_OF_NOT_NOT_NOT",
    "FUNCTION_CLASS=SINGLE_VALUED_DETERMINISTIC_HIERARCHICAL_RESULT",
    "MAX_CONTEXT_DEPTH=4",
    "CASCADE_COLLAPSE_LEVELS=3",
    "HOST_COLLAPSE_LEVELS=2",
    "RULE_DRIVEN_RESULT_PLUS_OUTER_COLLAPSE_LEVELS=1",
    "NAIVE_GENERIC_PACK_PREMATURE_MATCH=RED_CONFIRMED",
    "PROJECTION_MATCHER_COMPLETION_FALSE_POSITIVE=RED_CONFIRMED",
    "STRICT_A71P_RULE_MATCHING=REUSED",
    "COMPLETION_AUTHORITY=CHILD_CONTEXT_OCCURRENCE",
    "RESULT_TOPOLOGY=TAG_TO_SCALAR_TO_MARK",
    "RESULT_CONSTRUCTED_FROM_RUNTIME_ROLE_BINDING=GREEN",
    "RESULT_REMAINS_TRAVERSABLE_AFTER_CONTEXT_TEARDOWN=GREEN",
    "FINAL_WORKING_CONTEXT_COUNT=0",
    "FINAL_WORKING_RESULT_COUNT=1",
    "CONTEXT_IS_TEMPORARY_CONSTRUCTION_SCAFFOLD=SUPPORTED_SCOPED",
    "CANONICAL_CONTEXT_IDENTITY_REMAINS_READABLE=TRUE",
    "PHYSICAL_CONTEXT_DELETION=NOT_CLAIMED",
    "HOST_NESTED_GROWTH=RESIDUAL",
    "HOST_INNER_COLLAPSE=RESIDUAL",
    "OUTER_PACK_COLLAPSE=RULE_DRIVEN_GREEN",
    "HOST_RESULT_PUBLICATION=RESIDUAL",
    "LINKS_ONLY_SCAFFOLD_DYNAMICS=NOT_PROVEN",
    "NEXT=A72G_RULE_DRIVEN_GENERIC_INNER_COLLAPSE_AND_GROWTH",
    "MULTIVALUED_FUNCTIONS=DEFERRED",
    "VARIABLE_ARITY_FUNCTIONS=DEFERRED",
    "FULL_SELF_HOSTED=FALSE",
    "V013_NOT_ACCEPTED PRODUCTION_UNCHANGED",
  ].join(" "));
}

main();
