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
  if (!c) throw new Error("v0.13 A72a working A-memory rewrite: " + m);
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
 * Test-only candidate for "what is present in the working A-memory now".
 *
 * This is deliberately NOT claimed as the final representation. The point of
 * A72a is to test whether current-state membership must be distinguished from
 * canonical Link identity in the existing append-only Memory carrier.
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

function defineSingleContextRewriteRule(
  memory: Memory,
  theory: LinkHandle,
  b: RootBasis,
  seed: LinkHandle,
  fromValue: LinkHandle,
  toValue: LinkHandle,
): LinkHandle {
  const kRole = memory.ensure(seed, b.O);
  const dictionary = defineStructuralRoleDictionary(memory, [kRole]);

  const beforePayload = memory.ensure(kRole, fromValue);
  const beforeContext = memory.ensureStartSelfClosed(beforePayload);

  const afterPayload = memory.ensure(kRole, toValue);
  const afterContext = memory.ensureStartSelfClosed(afterPayload);

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
 * Minimal local reaction law for the one-active-Context experiment.
 *
 * Important: this does not choose one matching Rule. Every admitted matching
 * Rule contributes an output. A72a exercises the cardinality-one case only;
 * branching is intentionally reserved for the next experiment.
 *
 * The semantic transition is committed to working membership in one operation:
 * the old active Context is absent from the resulting membership and every
 * Rule-produced Context is present.
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

  working.replaceAtomically([activeContext], produced);

  return Object.freeze({
    consumed: Object.freeze([activeContext]),
    produced: Object.freeze(produced),
    matchedRuleCount: matches.length,
  });
}

function exercise(): void {
  const memory = new Memory();
  const b = ensureRootBasis(memory);

  let seed = memory.ensure(b.U, b.L);
  const fresh: LinkHandle[] = [];
  for (let i = 0; i < 16; i += 1) {
    seed = memory.ensure(seed, i % 2 === 0 ? b.O : b.C);
    fresh.push(seed);
  }
  const at = (i: number): LinkHandle => {
    const value = fresh[i];
    assert(value !== undefined, "fresh anchor " + i);
    return value;
  };

  const theory = memory.ensure(at(0), at(1));
  const fromValue = memory.ensure(at(2), at(3));
  const toValue = memory.ensure(at(4), at(5));
  const parent = memory.ensure(at(6), at(7));

  const rule = defineSingleContextRewriteRule(
    memory,
    theory,
    b,
    at(8),
    fromValue,
    toValue,
  );

  const beforeContext = defineContext(memory, parent, fromValue);
  const afterContext = defineContext(memory, parent, toValue);

  const beforeState = readContext(memory, beforeContext);
  same(beforeState.parent, parent, "before Context parent");
  same(beforeState.current, fromValue, "before Context current");

  const afterState = readContext(memory, afterContext);
  same(afterState.parent, parent, "after Context parent");
  same(afterState.current, toValue, "after Context current");

  // Discriminator: the current append-only Memory carrier already contains
  // both semantic Context Links. On its own it therefore cannot tell which one
  // is the current working state.
  assert(beforeContext !== afterContext, "before/after Context identities differ");
  const carrierBeforeReaction = memory.linkCount;

  const working = new WorkingMembership([beforeContext]);
  assert(working.has(beforeContext), "old Context initially present");
  assert(!working.has(afterContext), "new Context initially absent");

  const applicable = discoverAllApplicableRules(memory, theory, beforeContext);
  same(applicable.length, 1, "exactly one Rule applies in A72a");
  same(applicable[0]!.rule, rule, "the admitted concrete rewrite Rule applies");

  const reaction = reactSingleActiveContext(memory, theory, working);

  same(reaction.matchedRuleCount, 1, "one Rule fired");
  same(reaction.consumed.length, 1, "one old Context consumed");
  same(reaction.consumed[0]!, beforeContext, "exact old Context consumed");
  same(reaction.produced.length, 1, "one new Context produced");
  same(reaction.produced[0]!, afterContext, "exact new Context produced");

  same(working.size, 1, "working state remains cardinality one");
  assert(!working.has(beforeContext), "old Context disappears from working state");
  assert(working.has(afterContext), "new Context is current working state");

  // No END marker, tombstone or append-only lifecycle history is needed for
  // the working-state transition itself. Carrier topology does not grow
  // because all semantic values were canonicalized before the reaction.
  same(memory.linkCount, carrierBeforeReaction,
    "reaction adds no execution-history Links to canonical carrier");

  // The old semantic Link still has stable identity in the carrier. This is
  // the exact distinction under test: identity existence != current presence.
  const stillReadable = readContext(memory, beforeContext);
  same(stillReadable.parent, parent, "old Context identity remains readable");
  same(stillReadable.current, fromValue, "old Context semantic value remains readable");

  // Re-running the same law over the new active Context has no matching Rule,
  // so the first reaction did not hide a second implicit lifecycle transition.
  same(
    discoverAllApplicableRules(memory, theory, afterContext).length,
    0,
    "new Context has no accidental continuation Rule",
  );
}

function staticGuards(): void {
  const root = resolve(process.cwd(), "..");
  const own = readFileSync(
    join(root, "ts/test/research-v013-working-amemory-single-rewrite-a72a.test.ts"),
    "utf8",
  );

  const kernelStart = own.indexOf("function reactSingleActiveContext(");
  const kernelEnd = own.indexOf("\nfunction exercise()", kernelStart);
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
      "reaction kernel excludes semantic selector/history mechanism: " + forbidden);
  }

  assert(kernel.includes("discoverAllApplicableRules"),
    "reaction derives outputs from all admitted matching Rules");
  assert(kernel.includes("working.replaceAtomically"),
    "working-state replacement is one commit operation");

  const memorySource = readFileSync(join(root, "ts/src/memory.ts"), "utf8");
  assert(memorySource.includes("Link allocation is not append-only"),
    "current Memory explicitly enforces append-only allocation");
  assert(!memorySource.includes("remove(link:"),
    "current WriteMemory exposes no Link removal operation");
}

function main(): void {
  exercise();
  staticGuards();

  console.log([
    "MTS v0.13 A72a: SINGLE_CONTEXT_WORKING_REWRITE=GREEN_SCOPED_RESEARCH",
    "EXAMPLE=K_TO_A__BECOMES__K_TO_B",
    "ACTIVE_CONTEXTS_BEFORE=1 ACTIVE_CONTEXTS_AFTER=1",
    "OLD_CONTEXT_WORKING_PRESENCE=ABSENT_AFTER",
    "NEW_CONTEXT_WORKING_PRESENCE=PRESENT_AFTER",
    "APPEND_ONLY_EXECUTION_HISTORY=NOT_USED",
    "END_TOMBSTONE=NOT_USED",
    "HOST_RULE_KIND=0 HOST_OPCODE=0 HOST_SELECTED_RULE=0",
    "ALL_MATCHING_RULE_OUTPUTS=COLLECTED_BY_GENERIC_KERNEL",
    "BRANCHING_CARDINALITY_GT_1=NOT_YET_EXERCISED",
    "CARRIER_LINK_IDENTITY=IMMUTABLE",
    "WORKING_MEMBERSHIP=MUTABLE_TEST_HYPOTHESIS",
    "CURRENT_MEMORY_ONLY_CAN_DISTINGUISH_BEFORE_AFTER=FALSE",
    "LINK_IDENTITY_EQUALS_CURRENT_PRESENCE=FALSE_CANDIDATE",
    "HOST_PHYSICAL_MEMBERSHIP_COMMIT=RESIDUAL",
    "LINKS_ONLY_MUTATION=NOT_PROVEN",
    "MULTI_LOCUS_SCHEDULING=NOT_TESTED",
    "NEXT=A72B_TWO_RULE_ATOMIC_CONTEXT_SPLIT",
    "FULL_SELF_HOSTED=FALSE",
    "V013_NOT_ACCEPTED PRODUCTION_UNCHANGED",
  ].join(" "));
}

main();
