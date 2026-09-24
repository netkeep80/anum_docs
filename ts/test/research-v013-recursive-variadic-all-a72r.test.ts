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
import { readContext, StateError } from "../src/state.js";

function assert(c: unknown, m: string): asserts c {
  if (!c) throw new Error("v0.13 A72r recursive variadic ALL: " + m);
}

function same<T>(a: T, e: T, m: string): void {
  assert(Object.is(a, e), m + ": values differ");
}

/**
 * Source-equivalent A71p Rule matcher:
 * preserve both self-incidence bits at every non-role node.
 *
 * This is intentionally stricter than projection unification. A72r needs that
 * distinction so an ordinary PAIR(head,tail) Rule cannot also match END(head).
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
    same(memory.linkCount, before, "Rule matching is read-only");
  }
}

function defineWorkingScope(
  memory: Memory,
  seed: LinkHandle,
  members: readonly LinkHandle[],
): LinkHandle {
  const scope = memory.ensureStartSelfClosed(seed);
  for (const member of members) memory.ensure(scope, member);
  return scope;
}

function readWorkingScope(
  memory: Memory,
  scope: LinkHandle,
): readonly LinkHandle[] {
  const members: LinkHandle[] = [];
  for (const attachment of memory.outgoing(scope)) {
    if (attachment === scope) continue;
    const p = memory.poles(attachment);
    if (p.start !== scope) continue;
    if (!members.includes(p.end)) members.push(p.end);
  }
  return Object.freeze(members);
}

class CurrentScopeCursor {
  constructor(
    private readonly memory: Memory,
    private scope: LinkHandle,
  ) {}

  currentScope(): LinkHandle {
    return this.scope;
  }

  members(): readonly LinkHandle[] {
    return readWorkingScope(this.memory, this.scope);
  }

  switchAtomically(expectedOld: LinkHandle, next: LinkHandle): void {
    same(this.scope, expectedOld, "scope handoff old scope");
    this.scope = next;
  }
}

interface GroundedRuleImage {
  readonly outputTemplate: LinkHandle;
  readonly bindings: readonly StructuralRoleBinding[];
}

interface ContextReaction {
  readonly producedContexts: readonly LinkHandle[];
  readonly rawRuleMatches: number;
}

/**
 * Recursive positive-arity carrier:
 *
 *   []        = ROOT
 *   [x,...xs] = PAIR(x, [xs])
 *
 * ROOT is reused here only as the empty-tail structural boundary for this
 * scoped boolean-function experiment. No new terminator identity is created.
 *
 * A72r also records why the initially attempted END(x) terminal is invalid:
 *
 *   E = END(x) = x -> E
 *   PAIR(x,E)  = x -> E = E
 *
 * so adjacent repeated values would collapse canonically.
 */
function buildAspectArgumentChain(
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

function defineRule(
  memory: Memory,
  theory: LinkHandle,
  fn: LinkHandle,
  roles: readonly LinkHandle[],
  before: LinkHandle,
  after: LinkHandle,
): void {
  const dictionary = defineStructuralRoleDictionary(memory, roles);
  const rule = defineStructuralRule(
    memory,
    dictionary,
    memory.ensure(before, after),
  );
  const admission = admitStructuralRule(memory, theory, rule);

  // Local function-level trigger. Every ALL application discovers the same
  // four Rules from the ALL identity, independent of arity or argument values.
  memory.ensure(fn, admission);
}

function defineRecursiveAllRules(
  memory: Memory,
  theory: LinkHandle,
  b: RootBasis,
  seed: LinkHandle,
  ALL: LinkHandle,
  FALSE: LinkHandle,
  TRUE: LinkHandle,
): void {
  const kFalse = memory.ensure(seed, b.O);
  const falseTail = memory.ensure(seed, b.C);

  const kTrueTerminal = memory.ensure(seed, b.L);

  const kTrueRecursive = memory.ensure(seed, b.U);
  const nextHead = memory.ensure(seed, memory.root);
  const nextRest = memory.ensure(seed, memory.ensure(b.O, b.C));

  // PAIR(FALSE, tail) -> FALSE
  //
  // One Rule covers FALSE at every positive arity, including tail=ROOT.
  {
    const args = memory.ensure(FALSE, falseTail);
    const application = memory.ensure(ALL, args);
    const before =
      memory.ensureStartSelfClosed(memory.ensure(kFalse, application));
    const after =
      memory.ensureStartSelfClosed(memory.ensure(kFalse, FALSE));
    defineRule(
      memory,
      theory,
      ALL,
      [kFalse, falseTail],
      before,
      after,
    );
  }

  // PAIR(TRUE, ROOT) -> TRUE
  {
    const args = memory.ensure(TRUE, memory.root);
    const application = memory.ensure(ALL, args);
    const before =
      memory.ensureStartSelfClosed(memory.ensure(kTrueTerminal, application));
    const after =
      memory.ensureStartSelfClosed(memory.ensure(kTrueTerminal, TRUE));
    defineRule(
      memory,
      theory,
      ALL,
      [kTrueTerminal],
      before,
      after,
    );
  }

  // PAIR(TRUE, PAIR(nextHead,nextRest))
  //   -> ALL(PAIR(nextHead,nextRest))
  //
  // The strict A71p matcher distinguishes the nested ordinary PAIR tail from
  // ROOT, so this Rule cannot also match the terminal TRUE case.
  {
    const nonEmptyTail = memory.ensure(nextHead, nextRest);
    const args = memory.ensure(TRUE, nonEmptyTail);
    const application = memory.ensure(ALL, args);
    const before =
      memory.ensureStartSelfClosed(memory.ensure(kTrueRecursive, application));
    const resumed = memory.ensure(ALL, nonEmptyTail);
    const after =
      memory.ensureStartSelfClosed(memory.ensure(kTrueRecursive, resumed));
    defineRule(
      memory,
      theory,
      ALL,
      [kTrueRecursive, nextHead, nextRest],
      before,
      after,
    );
  }
}

function discoverFunctionTriggeredRuleImages(
  memory: Memory,
  theory: LinkHandle,
  activeContext: LinkHandle,
): readonly GroundedRuleImage[] {
  const state = readContext(memory, activeContext);
  const application = memory.poles(state.current);
  const fn = application.start;

  const matches: GroundedRuleImage[] = [];

  for (const trigger of memory.outgoing(fn)) {
    if (trigger === fn) continue;

    const triggerPoles = memory.poles(trigger);
    if (triggerPoles.start !== fn) continue;

    const admission = triggerPoles.end;
    const admissionPoles = memory.poles(admission);
    if (
      admissionPoles.start !== theory ||
      admissionPoles.end === admission
    ) {
      continue;
    }

    try {
      const rule = admissionPoles.end;
      verifyStructuralRuleAdmission(memory, theory, rule, admission);
      const structuralRule = readStructuralRule(memory, rule);
      const dictionary =
        readStructuralRoleDictionary(memory, structuralRule.roleDictionary);
      const body = memory.poles(structuralRule.body);
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

function instantiateTemplate(
  memory: Memory,
  template: LinkHandle,
  bindings: readonly StructuralRoleBinding[],
): LinkHandle {
  const mapping = new Map<LinkHandle, LinkHandle>();
  for (const binding of bindings) mapping.set(binding.role, binding.value);

  const visiting = new Set<LinkHandle>();
  const clone = (source: LinkHandle): LinkHandle => {
    const bound = mapping.get(source);
    if (bound !== undefined) return bound;

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

function reactContextScope(
  memory: Memory,
  theory: LinkHandle,
  cursor: CurrentScopeCursor,
  nextScopeSeed: LinkHandle,
): ContextReaction {
  const oldScope = cursor.currentScope();
  const before = cursor.members();
  assert(before.length > 0, "reaction requires current Context");

  const produced: LinkHandle[] = [];
  let rawRuleMatches = 0;

  for (const context of before) {
    for (
      const image of discoverFunctionTriggeredRuleImages(
        memory,
        theory,
        context,
      )
    ) {
      rawRuleMatches += 1;
      const successor =
        instantiateTemplate(memory, image.outputTemplate, image.bindings);
      readContext(memory, successor);
      if (!produced.includes(successor)) produced.push(successor);
    }
  }

  const nextScope = defineWorkingScope(memory, nextScopeSeed, produced);
  same(cursor.currentScope(), oldScope,
    "successor scope does not become current before handoff");
  cursor.switchAtomically(oldScope, nextScope);

  return Object.freeze({
    producedContexts: Object.freeze(produced),
    rawRuleMatches,
  });
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

function publishTerminalContext(
  memory: Memory,
  cursor: CurrentScopeCursor,
  resultScopeSeed: LinkHandle,
): LinkHandle {
  const oldScope = cursor.currentScope();
  const contexts = cursor.members();
  same(contexts.length, 1, "deterministic terminal Context cardinality");

  const payload = memory.poles(contexts[0]!).end;
  const resultScope = defineWorkingScope(memory, resultScopeSeed, [payload]);
  cursor.switchAtomically(oldScope, resultScope);
  return payload;
}

interface Fixture {
  readonly memory: Memory;
  readonly theory: LinkHandle;
  readonly K: LinkHandle;
  readonly ALL: LinkHandle;
  readonly FALSE: LinkHandle;
  readonly TRUE: LinkHandle;
  readonly fresh: readonly LinkHandle[];
}

function buildFixture(): Fixture {
  const memory = new Memory();
  const b = ensureRootBasis(memory);

  let seed = memory.ensure(b.U, b.L);
  const fresh: LinkHandle[] = [];
  for (let i = 0; i < 520; i += 1) {
    seed = memory.ensure(seed, i % 2 === 0 ? b.O : b.C);
    fresh.push(seed);
  }
  const at = (i: number): LinkHandle => {
    const value = fresh[i];
    assert(value !== undefined, "fresh anchor " + i);
    return value;
  };

  const theory = memory.ensure(at(0), at(1));
  const K = memory.ensure(at(2), at(3));
  const FALSE = memory.ensure(at(4), at(5));
  const TRUE = memory.ensure(at(6), at(7));
  const ALL = memory.ensure(at(8), at(9));

  defineRecursiveAllRules(
    memory,
    theory,
    b,
    at(10),
    ALL,
    FALSE,
    TRUE,
  );

  // Noise adjacent to ALL must not become executable authority.
  memory.ensure(ALL, memory.ensure(at(11), at(12)));

  return Object.freeze({
    memory,
    theory,
    K,
    ALL,
    FALSE,
    TRUE,
    fresh: Object.freeze(fresh),
  });
}

interface RunSpec {
  readonly args: readonly LinkHandle[];
  readonly expected: LinkHandle;
  readonly label: string;
  readonly seedBase: number;
}

function runSpec(f: Fixture, spec: RunSpec): void {
  const { memory, theory, K, ALL, FALSE, TRUE, fresh } = f;
  const at = (i: number): LinkHandle => {
    const value = fresh[i];
    assert(value !== undefined, "run fresh anchor " + i);
    return value;
  };

  const carrier = buildAspectArgumentChain(memory, spec.args);
  const application = memory.ensure(ALL, carrier);
  const initialContext =
    memory.ensureStartSelfClosed(memory.ensure(K, application));
  const initialScope = defineWorkingScope(
    memory,
    at(spec.seedBase),
    [initialContext],
  );
  const cursor = new CurrentScopeCursor(memory, initialScope);

  let reactions = 0;
  while (true) {
    const members = cursor.members();
    assert(
      members.length === 1,
      spec.label +
        " deterministic current cardinality: actual=" +
        members.length +
        " reaction=" +
        reactions,
    );
    const state = readContext(memory, members[0]!);

    if (state.current === FALSE || state.current === TRUE) break;

    const reaction = reactContextScope(
      memory,
      theory,
      cursor,
      at(spec.seedBase + 1 + reactions),
    );
    same(reaction.rawRuleMatches, 1,
      spec.label + " exactly one generic ALL Rule matches per reduction");
    same(reaction.producedContexts.length, 1,
      spec.label + " one deterministic successor Context");
    reactions += 1;

    assert(reactions <= spec.args.length,
      spec.label + " recursion must terminate within input arity");
  }

  const terminalContext = cursor.members()[0]!;
  const terminal = readContext(memory, terminalContext);
  same(terminal.parent, K, spec.label + " preserves K");
  same(terminal.current, spec.expected, spec.label + " exact result");

  const stable = publishTerminalContext(
    memory,
    cursor,
    at(spec.seedBase + 20),
  );
  same(stable, memory.ensure(K, spec.expected),
    spec.label + " stable K -> result");
  same(cursor.members().length, 1, spec.label + " final stable cardinality");
  same(cursor.members()[0]!, stable, spec.label + " stable result is current");
  assert(!isContext(memory, stable),
    spec.label + " temporary terminal Context removed");

  // FALSE is short-circuiting; all-TRUE consumes exactly one argument per step.
  const firstFalse = spec.args.findIndex((x) => x === FALSE);
  const expectedReactions =
    firstFalse >= 0 ? firstFalse + 1 : spec.args.length;
  assert(
    reactions === expectedReactions,
    spec.label +
      " recursive reductions follow carrier prefix: actual=" +
      reactions +
      " expected=" +
      expectedReactions,
  );
}

function exerciseCarrier(f: Fixture): void {
  const { memory, FALSE, TRUE } = f;

  // Falsifier for the first attempted END-terminal encoding.
  const naiveEndTrue = memory.ensureEndSelfClosed(TRUE);
  same(
    memory.ensure(TRUE, naiveEndTrue),
    naiveEndTrue,
    "naive PAIR(TRUE,END(TRUE)) collapses to END(TRUE)",
  );

  const naiveEndFalse = memory.ensureEndSelfClosed(FALSE);
  same(
    memory.ensure(FALSE, naiveEndFalse),
    naiveEndFalse,
    "naive PAIR(FALSE,END(FALSE)) collapses to END(FALSE)",
  );

  // ROOT-tail carrier keeps repeated adjacent values distinct.
  const one = buildAspectArgumentChain(memory, [TRUE]);
  const two = buildAspectArgumentChain(memory, [TRUE, TRUE]);
  const three = buildAspectArgumentChain(memory, [TRUE, TRUE, TRUE]);

  assert(one !== two && two !== three && one !== three,
    "arity 1/2/3 repeated TRUE carriers stay distinct");

  const p1 = memory.poles(one);
  same(p1.start, TRUE, "arity-1 first argument");
  same(p1.end, memory.root, "arity-1 tail is ROOT");

  const p2 = memory.poles(two);
  same(p2.start, TRUE, "arity-2 first argument");
  assert(p2.end !== memory.root, "arity-2 tail is non-empty");
  const p2tail = memory.poles(p2.end);
  same(p2tail.start, TRUE, "arity-2 repeated second argument");
  same(p2tail.end, memory.root, "arity-2 final tail is ROOT");

  const tf = buildAspectArgumentChain(memory, [TRUE, FALSE]);
  const ft = buildAspectArgumentChain(memory, [FALSE, TRUE]);
  assert(tf !== ft, "carrier preserves argument order");
}

function exercise(): void {
  const f = buildFixture();
  const { FALSE: F, TRUE: T } = f;

  exerciseCarrier(f);

  const specs: RunSpec[] = [
    { args: [F], expected: F, label: "ALL(F)", seedBase: 30 },
    { args: [T], expected: T, label: "ALL(T)", seedBase: 70 },

    { args: [F, F], expected: F, label: "ALL(F,F)", seedBase: 110 },
    { args: [F, T], expected: F, label: "ALL(F,T)", seedBase: 150 },
    { args: [T, F], expected: F, label: "ALL(T,F)", seedBase: 190 },
    { args: [T, T], expected: T, label: "ALL(T,T)", seedBase: 230 },

    // Generic recursion beyond the arities used to define any Rule.
    { args: [T, T, T], expected: T, label: "ALL(T,T,T)", seedBase: 270 },
    { args: [T, T, F], expected: F, label: "ALL(T,T,F)", seedBase: 310 },
    { args: [T, T, T, T, T], expected: T, label: "ALL(T^5)", seedBase: 350 },
    { args: [T, T, T, F, T], expected: F, label: "ALL(T,T,T,F,T)", seedBase: 390 },
  ];

  for (const spec of specs) runSpec(f, spec);
}

function sourceSlice(source: string, start: string, end: string): string {
  const i = source.indexOf(start);
  const j = source.indexOf(end, i + 1);
  assert(i >= 0 && j > i, "source slice " + start);
  return source.slice(i, j).replace(/\s+/g, "");
}

function staticGuards(): void {
  const root = resolve(process.cwd(), "..");
  const own = readFileSync(
    join(root, "ts/test/research-v013-recursive-variadic-all-a72r.test.ts"),
    "utf8",
  );
  const a71p = readFileSync(
    join(root, "ts/test/research-v013-aspect-preserving-rule-matcher-a71p.test.ts"),
    "utf8",
  );
  const a72q = readFileSync(
    join(root, "ts/test/research-v013-variable-arity-all-a72q.test.ts"),
    "utf8",
  );

  same(
    sourceSlice(own, "function unifyRuleTemplate(", "\nfunction defineWorkingScope("),
    sourceSlice(a71p, "function unifyRuleTemplate(", "\nfunction expectMismatch("),
    "A72r reuses A71p strict aspect-preserving Rule matcher source-equivalently",
  );

  const rulesStart = own.indexOf("function defineRecursiveAllRules(");
  const rulesEnd = own.indexOf("\nfunction discoverFunctionTriggeredRuleImages(", rulesStart);
  assert(rulesStart >= 0 && rulesEnd > rulesStart, "Rule definition source slice");
  const rules = own.slice(rulesStart, rulesEnd);

  same(
    rules.split("defineRule(").length - 1,
    3,
    "ALL semantics uses exactly three generic Rules",
  );

  for (const forbidden of [
    "ARG_END",
    "arity ===",
    "args.length ===",
    "truth table",
    "defineGroundedFunctionRule",
    "switch(",
    "RuleKind",
    "opcode",
  ]) {
    assert(!rules.includes(forbidden),
      "generic ALL Rule topology excludes grounded arity machinery: " + forbidden);
  }

  const reactionStart = own.indexOf("function reactContextScope(");
  const reactionEnd = own.indexOf("\nfunction isContext(", reactionStart);
  const reaction = own.slice(reactionStart, reactionEnd);
  for (const forbidden of [
    "args.length",
    "arity",
    "ARG_END",
    "switch(",
    "selectedRule",
  ]) {
    assert(!reaction.includes(forbidden),
      "execution kernel remains arity-blind: " + forbidden);
  }

  assert(a72q.includes("VARIABLE_ARITY_ALL=GREEN_SCOPED_RESEARCH"),
    "A72q grounded variadic carrier remains retained");
}

function main(): void {
  exercise();
  staticGuards();

  console.log([
    "MTS v0.13 A72r: RECURSIVE_VARIADIC_ALL=GREEN_SCOPED_RESEARCH",
    "PROGRAM=ALL",
    "ARGUMENT_CARRIER=PAIR_CHAIN_WITH_ROOT_EMPTY_TAIL",
    "PROGRAM_DATA_TERMINATOR=ABSENT",
    "NEW_FOUNDATION_ENTITY=ABSENT",
    "NAIVE_END_TERMINAL_REPEAT_COLLAPSE=PROVEN",
    "GENERIC_RULE_COUNT=3",
    "GROUNDED_RULE_PER_INPUT=0",
    "RULE_MATCHER=A71P_ASPECT_PRESERVING",
    "PAIR_VS_ROOT_TERMINAL_AMBIGUITY=0",
    "TESTED_ARITIES=1_2_3_5",
    "ARITY_FIVE_WITHOUT_NEW_RULE=GREEN",
    "ROOT_VALUED_ARGUMENT=OUTSIDE_CURRENT_BOOLEAN_FIXTURE",
    "ARGUMENT_ORDER_PRESERVED=TRUE",
    "EXECUTION_KERNEL_ARITY_BLIND=TRUE",
    "FALSE_SHORT_CIRCUIT=STRUCTURAL_REDUCTION",
    "ALL_TRUE_REDUCES_ONE_ARGUMENT_PER_REACTION=TRUE",
    "FINAL_WORKING_CONTEXT_COUNT=0",
    "STABLE_RESULT_REMAINS=TRUE",
    "HOST_CURRENT_SCOPE_CURSOR=RESIDUAL_PER_A72N",
    "HOST_SCOPE_HANDOFF=RESIDUAL",
    "FULL_SELF_HOSTED=FALSE",
    "NEXT=COMPOSE_RECURSIVE_VARIADIC_FUNCTION_WITH_NESTED_OR_MULTIVALUED_ARGUMENTS",
    "V013_NOT_ACCEPTED PRODUCTION_UNCHANGED",
  ].join(" "));
}

main();
