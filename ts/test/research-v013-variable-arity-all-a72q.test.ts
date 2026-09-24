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
import { readContext, StateError } from "../src/state.js";

function assert(c: unknown, m: string): asserts c {
  if (!c) throw new Error("v0.13 A72q variable-arity ALL: " + m);
}

function same<T>(a: T, e: T, m: string): void {
  assert(Object.is(a, e), m + ": values differ");
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

function buildArgumentChain(
  memory: Memory,
  terminator: LinkHandle,
  args: readonly LinkHandle[],
): LinkHandle {
  assert(args.length > 0, "A72q starts with positive arity");

  let chain = terminator;
  for (let i = args.length - 1; i >= 0; i -= 1) {
    chain = memory.ensure(args[i]!, chain);
  }
  return chain;
}

function defineGroundedFunctionRule(
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

  const before =
    memory.ensureStartSelfClosed(memory.ensure(kRole, application));
  const after =
    memory.ensureStartSelfClosed(memory.ensure(kRole, output));

  const rule = defineStructuralRule(
    memory,
    dictionary,
    memory.ensure(before, after),
  );
  const admission = admitStructuralRule(memory, theory, rule);
  memory.ensure(application, admission);
}

function discoverLocallyTriggeredRuleImages(
  memory: Memory,
  theory: LinkHandle,
  endpoint: LinkHandle,
  activeContext: LinkHandle,
): readonly GroundedRuleImage[] {
  const matches: GroundedRuleImage[] = [];

  for (const trigger of memory.outgoing(endpoint)) {
    if (trigger === endpoint) continue;

    const triggerPoles = memory.poles(trigger);
    if (triggerPoles.start !== endpoint) continue;

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

/**
 * Same reaction for every tested arity.
 *
 * No arity value, chain traversal, argument counting or arity-specific switch
 * appears here. The application Link itself is the local Rule trigger.
 */
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
    const state = readContext(memory, context);

    for (
      const image of discoverLocallyTriggeredRuleImages(
        memory,
        theory,
        state.current,
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
  same(contexts.length, 1, "deterministic case has one terminal Context");

  const payload = memory.poles(contexts[0]!).end;
  const resultScope =
    defineWorkingScope(memory, resultScopeSeed, [payload]);

  cursor.switchAtomically(oldScope, resultScope);
  return payload;
}

interface TruthRow {
  readonly args: readonly LinkHandle[];
  readonly expected: LinkHandle;
  readonly label: string;
  readonly ruleSeed: LinkHandle;
  readonly initialScopeSeed: LinkHandle;
  readonly resultContextScopeSeed: LinkHandle;
  readonly stableResultScopeSeed: LinkHandle;
}

interface Fixture {
  readonly memory: Memory;
  readonly theory: LinkHandle;
  readonly K: LinkHandle;
  readonly ALL: LinkHandle;
  readonly ARG_END: LinkHandle;
  readonly FALSE: LinkHandle;
  readonly TRUE: LinkHandle;
  readonly rows: readonly TruthRow[];
}

function buildFixture(): Fixture {
  const memory = new Memory();
  const b = ensureRootBasis(memory);

  let seed = memory.ensure(b.U, b.L);
  const fresh: LinkHandle[] = [];
  for (let i = 0; i < 120; i += 1) {
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

  // Program-data terminator for this first carrier experiment.
  // It is not claimed as a new MTS foundation entity or accepted FORMAL syntax.
  const ARG_END = memory.ensure(at(10), at(11));

  const specs: readonly {
    args: readonly LinkHandle[];
    expected: LinkHandle;
    label: string;
  }[] = Object.freeze([
    { args: [FALSE], expected: FALSE, label: "ALL(F)" },
    { args: [TRUE], expected: TRUE, label: "ALL(T)" },

    { args: [FALSE, FALSE], expected: FALSE, label: "ALL(F,F)" },
    { args: [FALSE, TRUE], expected: FALSE, label: "ALL(F,T)" },
    { args: [TRUE, FALSE], expected: FALSE, label: "ALL(T,F)" },
    { args: [TRUE, TRUE], expected: TRUE, label: "ALL(T,T)" },

    { args: [FALSE, FALSE, FALSE], expected: FALSE, label: "ALL(F,F,F)" },
    { args: [FALSE, FALSE, TRUE], expected: FALSE, label: "ALL(F,F,T)" },
    { args: [FALSE, TRUE, FALSE], expected: FALSE, label: "ALL(F,T,F)" },
    { args: [FALSE, TRUE, TRUE], expected: FALSE, label: "ALL(F,T,T)" },
    { args: [TRUE, FALSE, FALSE], expected: FALSE, label: "ALL(T,F,F)" },
    { args: [TRUE, FALSE, TRUE], expected: FALSE, label: "ALL(T,F,T)" },
    { args: [TRUE, TRUE, FALSE], expected: FALSE, label: "ALL(T,T,F)" },
    { args: [TRUE, TRUE, TRUE], expected: TRUE, label: "ALL(T,T,T)" },
  ]);

  const rows: TruthRow[] = [];
  for (let i = 0; i < specs.length; i += 1) {
    const spec = specs[i]!;
    const args = Object.freeze([...spec.args]);
    const input = buildArgumentChain(memory, ARG_END, args);

    defineGroundedFunctionRule(
      memory,
      theory,
      b,
      at(20 + i),
      ALL,
      input,
      spec.expected,
    );

    rows.push(Object.freeze({
      args,
      expected: spec.expected,
      label: spec.label,
      ruleSeed: at(20 + i),
      initialScopeSeed: at(50 + i * 3),
      resultContextScopeSeed: at(51 + i * 3),
      stableResultScopeSeed: at(52 + i * 3),
    }));
  }

  return Object.freeze({
    memory,
    theory,
    K,
    ALL,
    ARG_END,
    FALSE,
    TRUE,
    rows: Object.freeze(rows),
  });
}

function exerciseCarrierShape(f: Fixture): void {
  const { memory, ARG_END, FALSE, TRUE } = f;

  const one = buildArgumentChain(memory, ARG_END, [TRUE]);
  const two = buildArgumentChain(memory, ARG_END, [TRUE, TRUE]);
  const three = buildArgumentChain(memory, ARG_END, [TRUE, TRUE, TRUE]);

  assert(one !== two && two !== three && one !== three,
    "arity 1/2/3 have distinct Link topology");

  const tf = buildArgumentChain(memory, ARG_END, [TRUE, FALSE]);
  const ft = buildArgumentChain(memory, ARG_END, [FALSE, TRUE]);
  assert(tf !== ft, "argument chain preserves order");

  same(memory.poles(one).start, TRUE, "arity-1 first argument");
  same(memory.poles(one).end, ARG_END, "arity-1 explicit terminator");
  same(memory.poles(two).start, TRUE, "arity-2 first argument");
  same(memory.poles(memory.poles(two).end).start, TRUE,
    "arity-2 second argument");
}

function runRow(f: Fixture, row: TruthRow): void {
  const {
    memory,
    theory,
    K,
    ALL,
    ARG_END,
  } = f;

  const argsChain = buildArgumentChain(memory, ARG_END, row.args);
  const application = memory.ensure(ALL, argsChain);
  const initialContext = memory.ensureStartSelfClosed(
    memory.ensure(K, application),
  );

  const initialScope = defineWorkingScope(
    memory,
    row.initialScopeSeed,
    [initialContext],
  );
  const cursor = new CurrentScopeCursor(memory, initialScope);

  const reaction = reactContextScope(
    memory,
    theory,
    cursor,
    row.resultContextScopeSeed,
  );

  same(reaction.rawRuleMatches, 1,
    row.label + " has exactly one deterministic Rule");
  same(reaction.producedContexts.length, 1,
    row.label + " produces one Context");

  const terminalContext = reaction.producedContexts[0]!;
  const terminal = readContext(memory, terminalContext);
  same(terminal.parent, K, row.label + " preserves K");
  same(terminal.current, row.expected, row.label + " exact logical result");

  const stable = publishTerminalContext(
    memory,
    cursor,
    row.stableResultScopeSeed,
  );
  same(stable, memory.ensure(K, row.expected),
    row.label + " exact stable K -> result Link");
  same(cursor.members().length, 1, row.label + " final current cardinality");
  same(cursor.members()[0]!, stable, row.label + " stable result current");
  assert(!isContext(memory, stable),
    row.label + " terminal scaffold removed from current state");
}

function exercise(): void {
  const f = buildFixture();
  exerciseCarrierShape(f);

  for (const row of f.rows) runRow(f, row);

  same(f.rows.filter((row) => row.args.length === 1).length, 2,
    "complete arity-1 boolean table");
  same(f.rows.filter((row) => row.args.length === 2).length, 4,
    "complete arity-2 boolean table");
  same(f.rows.filter((row) => row.args.length === 3).length, 8,
    "complete arity-3 boolean table");
}

function staticGuards(): void {
  const root = resolve(process.cwd(), "..");
  const own = readFileSync(
    join(root, "ts/test/research-v013-variable-arity-all-a72q.test.ts"),
    "utf8",
  );

  const reactionStart = own.indexOf("function reactContextScope(");
  const reactionEnd = own.indexOf("\nfunction isContext(", reactionStart);
  assert(reactionStart >= 0 && reactionEnd > reactionStart,
    "reaction source slice");
  const reaction = own.slice(reactionStart, reactionEnd);

  for (const forbidden of [
    "args.length",
    "arity",
    "buildArgumentChain",
    "ARG_END",
    "switch(",
    "RuleKind",
    "opcode",
    "selectedRule",
  ]) {
    assert(!reaction.includes(forbidden),
      "execution kernel is arity-blind: " + forbidden);
  }

  same(
    reaction.split("cursor.switchAtomically(").length - 1,
    1,
    "one deterministic result-scope handoff",
  );

  const a72p = readFileSync(
    join(
      root,
      "ts/test/research-v013-multivalued-deterministic-composition-a72p.test.ts",
    ),
    "utf8",
  );
  assert(
    a72p.includes("MULTIVALUED_DETERMINISTIC_COMPOSITION=GREEN_SCOPED_RESEARCH"),
    "A72p multi-valued composition remains retained",
  );
}

function main(): void {
  exercise();
  staticGuards();

  console.log([
    "MTS v0.13 A72q: VARIABLE_ARITY_ALL=GREEN_SCOPED_RESEARCH",
    "PROGRAM=ALL",
    "SAME_FUNCTION_IDENTITY_ACROSS_ARITIES=TRUE",
    "TESTED_ARITIES=1_2_3",
    "ARITY_1_TRUTH_ROWS=2",
    "ARITY_2_TRUTH_ROWS=4",
    "ARITY_3_TRUTH_ROWS=8",
    "ALL_TRUE_ROWS=TRUE",
    "ANY_FALSE_ROWS=FALSE",
    "ARGUMENT_CARRIER=ORDERED_LINK_CHAIN_WITH_PROGRAM_DATA_TERMINATOR",
    "ARGUMENT_ORDER_PRESERVED=TRUE",
    "MTS_SET_OBJECT=ABSENT",
    "HOST_ARITY_SWITCH_IN_EXECUTION=0",
    "EXECUTION_KERNEL_ARITY_BLIND=TRUE",
    "ONE_RESULT_PER_APPLICATION=TRUE",
    "FINAL_WORKING_CONTEXT_COUNT=0",
    "ARG_END_IS_FOUNDATION_ENTITY=FALSE",
    "ARG_END_IS_ACCEPTED_FORMAL_SYNTAX=FALSE",
    "VARIADIC_CARRIER_FINALIZED=FALSE",
    "HOST_CURRENT_SCOPE_CURSOR=RESIDUAL_PER_A72N",
    "NEXT=TEST_RECURSIVE_OR_RULE_GENERIC_VARIADIC_REDUCTION_WITHOUT_GROUNDED_TABLE_PER_ARITY",
    "FULL_SELF_HOSTED=FALSE",
    "V013_NOT_ACCEPTED PRODUCTION_UNCHANGED",
  ].join(" "));
}

main();
