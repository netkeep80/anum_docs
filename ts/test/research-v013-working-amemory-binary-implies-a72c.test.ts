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
  if (!c) throw new Error("v0.13 A72c binary IMPLIES dynamics: " + m);
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

/**
 * Ordered binary application:
 *
 *   args(X,Y) = X ⟼ Y
 *   call(F,X,Y) = F ⟼ args(X,Y)
 *
 * Active Context:
 *
 *   START(K ⟼ (F ⟼ (X ⟼ Y)))
 */
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
  const beforeContext = memory.ensureStartSelfClosed(
    memory.ensure(kRole, application),
  );
  const afterContext = memory.ensureStartSelfClosed(
    memory.ensure(kRole, output),
  );

  const body = memory.ensure(beforeContext, afterContext);
  const rule = defineStructuralRule(memory, dictionary, body);
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
    const admissionPoles = memory.poles(admission);
    if (admissionPoles.start !== theory || admissionPoles.end === admission) {
      continue;
    }

    const ruleHandle = admissionPoles.end;
    try {
      verifyStructuralRuleAdmission(memory, theory, ruleHandle, admission);
      const rule = readStructuralRule(memory, ruleHandle);
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
  assert(before.length === 1, "A72c requires exactly one active Context");
  const activeContext = before[0]!;
  readContext(memory, activeContext);

  const matches = discoverAllApplicableRules(memory, theory, activeContext);
  assert(matches.length > 0, "A72c requires at least one applicable Rule");

  const produced = matches.map((match) =>
    instantiateTemplate(memory, match.outputTemplate, match.bindings)
  );
  for (const output of produced) readContext(memory, output);

  working.replaceAtomically([activeContext], produced);

  return Object.freeze({
    consumed: Object.freeze([activeContext]),
    produced: Object.freeze(produced),
    matchedRuleCount: matches.length,
  });
}

interface Fixture {
  readonly memory: Memory;
  readonly theory: LinkHandle;
  readonly IMPLIES: LinkHandle;
  readonly FALSE: LinkHandle;
  readonly TRUE: LinkHandle;
  readonly parent: LinkHandle;
}

function buildFixture(): Fixture {
  const memory = new Memory();
  const b = ensureRootBasis(memory);

  let seed = memory.ensure(b.U, b.L);
  const fresh: LinkHandle[] = [];
  for (let i = 0; i < 24; i += 1) {
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
  const IMPLIES = memory.ensure(at(6), at(7));
  const parent = memory.ensure(at(8), at(9));

  assert(FALSE !== TRUE, "truth values are distinct");
  assert(IMPLIES !== FALSE && IMPLIES !== TRUE, "IMPLIES identity is distinct");

  defineBinaryTruthRule(memory, theory, b, at(10), IMPLIES, FALSE, FALSE, TRUE);
  defineBinaryTruthRule(memory, theory, b, at(11), IMPLIES, FALSE, TRUE, TRUE);
  defineBinaryTruthRule(memory, theory, b, at(12), IMPLIES, TRUE, FALSE, FALSE);
  defineBinaryTruthRule(memory, theory, b, at(13), IMPLIES, TRUE, TRUE, TRUE);

  return Object.freeze({ memory, theory, IMPLIES, FALSE, TRUE, parent });
}

function runImpliesCase(
  f: Fixture,
  left: LinkHandle,
  right: LinkHandle,
  expected: LinkHandle,
  label: string,
): void {
  const { memory, theory, IMPLIES, parent } = f;
  const args = memory.ensure(left, right);
  const application = memory.ensure(IMPLIES, args);
  const beforeContext = defineContext(memory, parent, application);
  const expectedContext = defineContext(memory, parent, expected);

  const working = new WorkingMembership([beforeContext]);
  assert(working.has(beforeContext), label + " input initially present");
  assert(!working.has(expectedContext), label + " output initially absent");

  const carrierBeforeReaction = memory.linkCount;
  const reaction = reactSingleActiveContext(memory, theory, working);

  same(reaction.matchedRuleCount, 1, label + " has exactly one applicable Rule");
  same(reaction.consumed.length, 1, label + " consumes one Context");
  same(reaction.consumed[0]!, beforeContext, label + " consumes exact Context");
  same(reaction.produced.length, 1, label + " produces one Context");
  same(reaction.produced[0]!, expectedContext, label + " produces exact value");

  same(working.size, 1, label + " remains deterministic");
  assert(!working.has(beforeContext), label + " old Context disappears");
  assert(working.has(expectedContext), label + " result Context becomes current");

  same(memory.linkCount, carrierBeforeReaction,
    label + " creates no append-only execution history");
}

function exercise(): void {
  const f = buildFixture();

  runImpliesCase(f, f.FALSE, f.FALSE, f.TRUE,  "IMPLIES(FALSE,FALSE)");
  runImpliesCase(f, f.FALSE, f.TRUE,  f.TRUE,  "IMPLIES(FALSE,TRUE)");
  runImpliesCase(f, f.TRUE,  f.FALSE, f.FALSE, "IMPLIES(TRUE,FALSE)");
  runImpliesCase(f, f.TRUE,  f.TRUE,  f.TRUE,  "IMPLIES(TRUE,TRUE)");

  // IMPLIES is deliberately non-commutative. The two mixed rows must remain
  // physically distinct and must evaluate to different values.
  const ft = f.memory.ensure(f.FALSE, f.TRUE);
  const tf = f.memory.ensure(f.TRUE, f.FALSE);
  assert(ft !== tf, "ordered argument pair preserves left/right distinction");

  const appFT = f.memory.ensure(f.IMPLIES, ft);
  const appTF = f.memory.ensure(f.IMPLIES, tf);
  assert(appFT !== appTF, "swapping arguments changes application topology");

  const contextFT = defineContext(f.memory, f.parent, appFT);
  const contextTF = defineContext(f.memory, f.parent, appTF);
  const matchesFT = discoverAllApplicableRules(f.memory, f.theory, contextFT);
  const matchesTF = discoverAllApplicableRules(f.memory, f.theory, contextTF);
  same(matchesFT.length, 1, "IMPLIES(FALSE,TRUE) has one Rule");
  same(matchesTF.length, 1, "IMPLIES(TRUE,FALSE) has one Rule");

  const terminalFalse = defineContext(f.memory, f.parent, f.FALSE);
  const terminalTrue = defineContext(f.memory, f.parent, f.TRUE);
  same(discoverAllApplicableRules(f.memory, f.theory, terminalFalse).length, 0,
    "FALSE is terminal in this tiny program");
  same(discoverAllApplicableRules(f.memory, f.theory, terminalTrue).length, 0,
    "TRUE is terminal in this tiny program");
}

function staticGuards(): void {
  const root = resolve(process.cwd(), "..");
  const own = readFileSync(
    join(root, "ts/test/research-v013-working-amemory-binary-implies-a72c.test.ts"),
    "utf8",
  );

  const kernelStart = own.indexOf("function reactSingleActiveContext(");
  const kernelEnd = own.indexOf("\ninterface Fixture", kernelStart);
  assert(kernelStart >= 0 && kernelEnd > kernelStart, "reaction kernel source slice");
  const kernel = own.slice(kernelStart, kernelEnd);

  for (const forbidden of [
    "RuleKind",
    "opcode",
    "selectedRule",
    "ensureEndSelfClosed(activeContext)",
    "history.push",
    "tombstone",
    "matches.length===1",
  ]) {
    assert(!kernel.includes(forbidden),
      "reaction kernel excludes selector/history mechanism: " + forbidden);
  }

  assert(kernel.includes("discoverAllApplicableRules"),
    "reaction derives outputs from all applicable Rules");
  assert(kernel.includes("working.replaceAtomically"),
    "working-state replacement is one commit operation");

  const a72a = readFileSync(
    join(root, "ts/test/research-v013-working-amemory-single-rewrite-a72a.test.ts"),
    "utf8",
  );
  assert(a72a.includes("UNARY_LOGIC_NOT_WORKING_DYNAMICS=GREEN_SCOPED_RESEARCH"),
    "A72a NOT remains retained as cumulative regression evidence");

  const a72b = readFileSync(
    join(root, "ts/test/research-v013-working-amemory-binary-and-a72b.test.ts"),
    "utf8",
  );
  assert(a72b.includes("BINARY_LOGIC_AND_WORKING_DYNAMICS=GREEN_SCOPED_RESEARCH"),
    "A72b AND remains retained as cumulative regression evidence");

  const runner = readFileSync(join(root, "ts/src/tooling/test-runner.ts"), "utf8");
  assert(runner.includes('for (const test of builtTests)'),
    "repository runner executes the full retained test corpus");
}

function main(): void {
  exercise();
  staticGuards();

  console.log([
    "MTS v0.13 A72c: NONCOMMUTATIVE_BINARY_IMPLIES=GREEN_SCOPED_RESEARCH",
    "PROGRAM=IMPLIES",
    "APPLICATION_TOPOLOGY=FUNCTION_TO_ORDERED_ARGUMENT_PAIR",
    "TRUTH_TABLE_ROWS=4",
    "IMPLIES_00=1 IMPLIES_01=1 IMPLIES_10=0 IMPLIES_11=1",
    "MIXED_ARGUMENT_ORDER_CHANGES_VALUE=GREEN",
    "FUNCTION_CLASS=SINGLE_VALUED_FIXED_ARITY_2",
    "ACTIVE_CONTEXTS_PER_CASE_BEFORE=1 ACTIVE_CONTEXTS_PER_CASE_AFTER=1",
    "OLD_CONTEXT_WORKING_PRESENCE=ABSENT_AFTER",
    "RESULT_CONTEXT_WORKING_PRESENCE=PRESENT_AFTER",
    "APPEND_ONLY_EXECUTION_HISTORY=NOT_USED",
    "HOST_RULE_KIND=0 HOST_OPCODE=0 HOST_SELECTED_RULE=0",
    "ORDERED_ARGUMENT_OCCURRENCES=PRESERVED",
    "WORKING_MEMBERSHIP=MUTABLE_TEST_HYPOTHESIS",
    "LINKS_ONLY_MUTATION=NOT_PROVEN",
    "CUMULATIVE_REGRESSION=A72A_NOT_PLUS_A72B_AND_PLUS_A72C_IMPLIES",
    "NEXT=A72D_DETERMINISTIC_FUNCTION_COMPOSITION",
    "MULTIVALUED_FUNCTIONS=DEFERRED",
    "VARIABLE_ARITY_FUNCTIONS=DEFERRED",
    "FULL_SELF_HOSTED=FALSE",
    "V013_NOT_ACCEPTED PRODUCTION_UNCHANGED",
  ].join(" "));
}

main();
