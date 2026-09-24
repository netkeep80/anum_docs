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
  if (!c) throw new Error("v0.13 A72a unary NOT dynamics: " + m);
}

function same<T>(a: T, e: T, m: string): void {
  assert(Object.is(a, e), m + ": values differ");
}

interface GroundedRewrite {
  readonly rule: LinkHandle;
  readonly outputTemplate: LinkHandle;
  readonly bindings: readonly StructuralRoleBinding[];
}

interface ReactionResult {
  readonly consumed: readonly LinkHandle[];
  readonly produced: readonly LinkHandle[];
  readonly matchedRuleCount: number;
}

/**
 * Test-only candidate for "which Context Links are in the working A-network
 * now". It deliberately does not change canonical Link identity.
 *
 * A72a tests the distinction; it does not claim Set<> is the final Links-only
 * representation of working presence.
 */
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
 * Unary application is represented only by Links:
 *
 *   F ⟼ X
 *
 * and the active Context contains that application as its current value:
 *
 *   START(K ⟼ (F ⟼ X))
 *
 * A truth-table row is a structural Rule:
 *
 *   START(K ⟼ (F ⟼ X))  ->  START(K ⟼ Y)
 *
 * K is the sole role. F/X/Y are ordinary grounded Links.
 */
function defineUnaryTruthRule(
  memory: Memory,
  theory: LinkHandle,
  b: RootBasis,
  seed: LinkHandle,
  fn: LinkHandle,
  input: LinkHandle,
  output: LinkHandle,
): LinkHandle {
  const kRole = memory.ensure(seed, b.O);
  const dictionary = defineStructuralRoleDictionary(memory, [kRole]);

  const application = memory.ensure(fn, input);
  const beforeContext = memory.ensureStartSelfClosed(
    memory.ensure(kRole, application),
  );
  const afterContext = memory.ensureStartSelfClosed(
    memory.ensure(kRole, output),
  );

  const body = memory.ensure(beforeContext, afterContext);
  const rule = defineStructuralRule(memory, dictionary, body);
  admitStructuralRule(memory, theory, rule);
  return rule;
}

function discoverAllApplicableRules(
  memory: Memory,
  theory: LinkHandle,
  activeContext: LinkHandle,
): readonly GroundedRewrite[] {
  // The active object must first be an actual Context. This prevents the
  // projection unifier from turning a non-START object into execution input.
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
        rule: ruleHandle,
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

/**
 * Candidate local reaction law:
 *
 *   one active Context -> all Context outputs of all applicable Rules
 *
 * A72a exercises only the deterministic 1 -> 1 NOT rows. The kernel itself
 * does not choose a single Rule by identity and is intentionally shaped for
 * later 1 -> N branching tests.
 */
function reactSingleActiveContext(
  memory: Memory,
  theory: LinkHandle,
  working: WorkingMembership,
): ReactionResult {
  const before = working.snapshot();
  assert(before.length === 1, "A72a requires exactly one active Context");
  const activeContext = before[0]!;
  readContext(memory, activeContext);

  const matches = discoverAllApplicableRules(memory, theory, activeContext);
  assert(matches.length > 0, "A72a requires at least one applicable Rule");

  const produced = matches.map((match) =>
    instantiateTemplate(memory, match.outputTemplate, match.bindings)
  );
  for (const output of produced) readContext(memory, output);

  // Semantic mutation is committed as one replacement of current membership:
  // the consumed Context is no longer current when produced Contexts appear.
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
  readonly NOT: LinkHandle;
  readonly FALSE: LinkHandle;
  readonly TRUE: LinkHandle;
  readonly parent: LinkHandle;
}

function buildFixture(): Fixture {
  const memory = new Memory();
  const b = ensureRootBasis(memory);

  let seed = memory.ensure(b.U, b.L);
  const fresh: LinkHandle[] = [];
  for (let i = 0; i < 20; i += 1) {
    seed = memory.ensure(seed, i % 2 === 0 ? b.O : b.C);
    fresh.push(seed);
  }
  const at = (i: number): LinkHandle => {
    const value = fresh[i];
    assert(value !== undefined, "fresh anchor " + i);
    return value;
  };

  const theory = memory.ensure(at(0), at(1));

  // These are fixture truth-domain values only. A72a does not claim a new
  // foundation definition of TRUE/FALSE.
  const FALSE = memory.ensure(at(2), at(3));
  const TRUE = memory.ensure(at(4), at(5));
  const NOT = memory.ensure(at(6), at(7));
  const parent = memory.ensure(at(8), at(9));

  assert(FALSE !== TRUE, "truth values are distinct");
  assert(NOT !== FALSE && NOT !== TRUE, "function identity is distinct");

  defineUnaryTruthRule(memory, theory, b, at(10), NOT, FALSE, TRUE);
  defineUnaryTruthRule(memory, theory, b, at(11), NOT, TRUE, FALSE);

  return Object.freeze({ memory, theory, NOT, FALSE, TRUE, parent });
}

function runNotCase(
  f: Fixture,
  input: LinkHandle,
  expected: LinkHandle,
  label: string,
): void {
  const { memory, theory, NOT, parent } = f;
  const application = memory.ensure(NOT, input);
  const beforeContext = defineContext(memory, parent, application);
  const expectedContext = defineContext(memory, parent, expected);

  const beforeState = readContext(memory, beforeContext);
  same(beforeState.parent, parent, label + " parent");
  same(beforeState.current, application, label + " current is NOT application");

  const working = new WorkingMembership([beforeContext]);
  assert(working.has(beforeContext), label + " old Context initially present");
  assert(!working.has(expectedContext), label + " result Context initially absent");

  const carrierBeforeReaction = memory.linkCount;
  const reaction = reactSingleActiveContext(memory, theory, working);

  same(reaction.matchedRuleCount, 1, label + " exactly one truth-table Rule");
  same(reaction.consumed.length, 1, label + " consumes one Context");
  same(reaction.consumed[0]!, beforeContext, label + " consumes exact input Context");
  same(reaction.produced.length, 1, label + " produces one Context");
  same(reaction.produced[0]!, expectedContext, label + " produces expected truth value");

  same(working.size, 1, label + " remains one active Context");
  assert(!working.has(beforeContext), label + " old Context absent after reaction");
  assert(working.has(expectedContext), label + " result Context present after reaction");

  // Both canonical Contexts were materialized before the reaction. Therefore a
  // successful reaction changes only working presence, not carrier topology.
  same(memory.linkCount, carrierBeforeReaction,
    label + " adds no append-only execution-history Links");

  // The old Link remains an addressable canonical value, but is no longer in
  // the working A-network candidate. This is the distinction A72a isolates.
  const oldIdentity = readContext(memory, beforeContext);
  same(oldIdentity.current, application, label + " old identity remains readable");
}

function exercise(): void {
  const f = buildFixture();

  // Complete unary NOT truth table.
  runNotCase(f, f.FALSE, f.TRUE, "NOT(FALSE)");
  runNotCase(f, f.TRUE, f.FALSE, "NOT(TRUE)");

  // Ordinary truth values are terminal for this tiny program: there is no
  // accidental second NOT reaction once the application has been replaced.
  const terminalFalse = defineContext(f.memory, f.parent, f.FALSE);
  const terminalTrue = defineContext(f.memory, f.parent, f.TRUE);
  same(discoverAllApplicableRules(f.memory, f.theory, terminalFalse).length, 0,
    "FALSE result has no accidental continuation");
  same(discoverAllApplicableRules(f.memory, f.theory, terminalTrue).length, 0,
    "TRUE result has no accidental continuation");
}

function staticGuards(): void {
  const root = resolve(process.cwd(), "..");
  const own = readFileSync(
    join(root, "ts/test/research-v013-working-amemory-single-rewrite-a72a.test.ts"),
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

  const memorySource = readFileSync(join(root, "ts/src/memory.ts"), "utf8");
  assert(memorySource.includes("Link allocation is not append-only"),
    "current Memory explicitly enforces append-only allocation");
  assert(!memorySource.includes("remove(link:"),
    "current WriteMemory exposes no Link removal operation");

  const runner = readFileSync(join(root, "ts/src/tooling/test-runner.ts"), "utf8");
  assert(runner.includes('readdirSync(directory)'),
    "test runner discovers the cumulative test corpus");
  assert(runner.includes('for (const test of builtTests)'),
    "every later iteration reruns all retained earlier test files");
}

function main(): void {
  exercise();
  staticGuards();

  console.log([
    "MTS v0.13 A72a: UNARY_LOGIC_NOT_WORKING_DYNAMICS=GREEN_SCOPED_RESEARCH",
    "PROGRAM=NOT",
    "APPLICATION_TOPOLOGY=FUNCTION_TO_ARGUMENT",
    "TRUTH_TABLE_ROWS=2",
    "NOT_FALSE=TRUE NOT_TRUE=FALSE",
    "ACTIVE_CONTEXTS_PER_CASE_BEFORE=1 ACTIVE_CONTEXTS_PER_CASE_AFTER=1",
    "OLD_CONTEXT_WORKING_PRESENCE=ABSENT_AFTER",
    "RESULT_CONTEXT_WORKING_PRESENCE=PRESENT_AFTER",
    "APPEND_ONLY_EXECUTION_HISTORY=NOT_USED",
    "END_TOMBSTONE=NOT_USED",
    "HOST_RULE_KIND=0 HOST_OPCODE=0 HOST_SELECTED_RULE=0",
    "ALL_MATCHING_RULE_OUTPUTS=COLLECTED_BY_GENERIC_KERNEL",
    "CARRIER_LINK_IDENTITY=IMMUTABLE",
    "WORKING_MEMBERSHIP=MUTABLE_TEST_HYPOTHESIS",
    "LINK_IDENTITY_EQUALS_CURRENT_PRESENCE=FALSE_CANDIDATE",
    "HOST_PHYSICAL_MEMBERSHIP_COMMIT=RESIDUAL",
    "LINKS_ONLY_MUTATION=NOT_PROVEN",
    "CUMULATIVE_REGRESSION=ALL_RETAINED_TEST_FILES",
    "NEXT=A72B_BINARY_AND_TRUTH_TABLE",
    "FULL_SELF_HOSTED=FALSE",
    "V013_NOT_ACCEPTED PRODUCTION_UNCHANGED",
  ].join(" "));
}

main();
