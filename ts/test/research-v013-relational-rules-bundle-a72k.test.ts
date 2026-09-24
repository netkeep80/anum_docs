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

function assert(c: unknown, m: string): asserts c {
  if (!c) throw new Error("v0.13 A72k relational Rules bundle: " + m);
}

function same<T>(a: T, e: T, m: string): void {
  assert(Object.is(a, e), m + ": values differ");
}

class WorkingBundle {
  private current: readonly LinkHandle[];

  constructor(initial: readonly LinkHandle[]) {
    this.current = Object.freeze([...initial]);
    this.assertCanonical();
  }

  get size(): number {
    return this.current.length;
  }

  snapshot(): readonly LinkHandle[] {
    return this.current;
  }

  has(link: LinkHandle): boolean {
    return this.current.includes(link);
  }

  replaceAtomically(
    consumed: readonly LinkHandle[],
    produced: readonly LinkHandle[],
  ): void {
    const before = this.current;
    for (const link of consumed) {
      assert(before.includes(link), "consumed active Link must be current");
    }

    const next = before.filter((link) => !consumed.includes(link));
    for (const link of produced) {
      if (!next.includes(link)) next.push(link);
    }

    this.current = Object.freeze(next);
    this.assertCanonical();
  }

  private assertCanonical(): void {
    for (let i = 0; i < this.current.length; i += 1) {
      for (let j = i + 1; j < this.current.length; j += 1) {
        assert(this.current[i] !== this.current[j],
          "working bundle contains duplicate Link identity");
      }
    }
  }
}

interface GroundedRuleImage {
  readonly outputTemplate: LinkHandle;
  readonly bindings: readonly StructuralRoleBinding[];
}

interface BundleReaction {
  readonly consumed: readonly LinkHandle[];
  readonly produced: readonly LinkHandle[];
  readonly rawRuleMatches: number;
}

/**
 * One continuation A -> B is represented by an admitted structural Rule:
 *
 *   K -> A
 *   ------
 *   K -> B
 *
 * Only K is a role. A and B are grounded Link identities.
 *
 * The Rule itself is ordinary Link topology. There is no host relation table,
 * relationScope object, RuleKind or opcode.
 */
function defineContinuationRule(
  memory: Memory,
  theory: LinkHandle,
  b: RootBasis,
  seed: LinkHandle,
  from: LinkHandle,
  to: LinkHandle,
): LinkHandle {
  const kRole = memory.ensure(seed, b.O);
  const dictionary = defineStructuralRoleDictionary(memory, [kRole]);
  const before = memory.ensure(kRole, from);
  const after = memory.ensure(kRole, to);
  const body = memory.ensure(before, after);
  const rule = defineStructuralRule(memory, dictionary, body);
  admitStructuralRule(memory, theory, rule);
  return rule;
}

function discoverApplicableRuleImages(
  memory: Memory,
  theory: LinkHandle,
  active: LinkHandle,
): readonly GroundedRuleImage[] {
  const matches: GroundedRuleImage[] = [];

  for (const admission of memory.outgoing(theory)) {
    const admissionPoles = memory.poles(admission);
    if (admissionPoles.start !== theory || admissionPoles.end === admission) {
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
        active,
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
    const poles = memory.poles(source);

    let value: LinkHandle;
    if (poles.start === source && poles.end === source) {
      value = memory.ensureRoot();
    } else if (poles.start === source) {
      value = memory.ensureStartSelfClosed(clone(poles.end));
    } else if (poles.end === source) {
      value = memory.ensureEndSelfClosed(clone(poles.start));
    } else {
      visiting.add(source);
      const start = clone(poles.start);
      const end = clone(poles.end);
      visiting.delete(source);
      value = memory.ensure(start, end);
    }

    mapping.set(source, value);
    return value;
  };

  return clone(template);
}

/**
 * A72k candidate bundle reaction.
 *
 * Key change from A72g-A72j:
 * - there is NO relationScope;
 * - there is NO continuationTargets(A) host traversal;
 * - continuation topology is carried by admitted structural Rules themselves.
 *
 * Remaining residual:
 * - host loops over the immutable active snapshot and admitted Theory Rules.
 *
 * All matches are derived from one pre-state snapshot, every successor remains
 * non-current during derivation, then one working-membership commit publishes
 * the complete canonical image.
 */
function reactBundleByStructuralRules(
  memory: Memory,
  theory: LinkHandle,
  working: WorkingBundle,
): BundleReaction {
  const before = working.snapshot();
  assert(before.length > 0, "reaction requires a non-empty active bundle");

  const produced: LinkHandle[] = [];
  let rawRuleMatches = 0;

  for (const active of before) {
    for (const image of discoverApplicableRuleImages(memory, theory, active)) {
      rawRuleMatches += 1;
      const successor =
        instantiateTemplate(memory, image.outputTemplate, image.bindings);

      if (!produced.includes(successor)) produced.push(successor);

      same(working.snapshot(), before,
        "working state remains the exact pre-reaction snapshot");
      assert(!working.has(successor),
        "successor cannot become current before the one final commit");
    }
  }

  working.replaceAtomically(before, produced);

  return Object.freeze({
    consumed: before,
    produced: Object.freeze(produced),
    rawRuleMatches,
  });
}

interface Fixture {
  readonly memory: Memory;
  readonly b: RootBasis;
  readonly theory: LinkHandle;
  readonly K: LinkHandle;
  readonly A0: LinkHandle;
  readonly A1: LinkHandle;
  readonly A2: LinkHandle;
  readonly B0: LinkHandle;
  readonly B1: LinkHandle;
  readonly B2: LinkHandle;
  readonly B3: LinkHandle;
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
  const K = memory.ensure(at(2), at(3));
  const A0 = memory.ensure(at(4), at(5));
  const A1 = memory.ensure(at(6), at(7));
  const A2 = memory.ensure(at(8), at(9));
  const B0 = memory.ensure(at(10), at(11));
  const B1 = memory.ensure(at(12), at(13));
  const B2 = memory.ensure(at(14), at(15));
  const B3 = memory.ensure(at(16), at(17));

  // Exact N -> M continuation graph from A72j:
  //
  // A1 -> B1
  // A1 -> B2
  // A2 -> B2
  // A2 -> B3
  //
  // represented now by four structural Rules, not by a relationScope traversal.
  defineContinuationRule(memory, theory, b, at(18), A1, B1);
  defineContinuationRule(memory, theory, b, at(19), A1, B2);
  defineContinuationRule(memory, theory, b, at(20), A2, B2);
  defineContinuationRule(memory, theory, b, at(21), A2, B3);

  // Keep Theory non-empty for the A0 1 -> 0 control without giving A0 an image.
  defineContinuationRule(memory, theory, b, at(22), B0, A0);

  return Object.freeze({
    memory,
    b,
    theory,
    K,
    A0,
    A1,
    A2,
    B0,
    B1,
    B2,
    B3,
  });
}

function exerciseNoImageControl(f: Fixture): void {
  const { memory, theory, K, A0 } = f;
  const KA0 = memory.ensure(K, A0);
  const working = new WorkingBundle([KA0]);

  const reaction = reactBundleByStructuralRules(memory, theory, working);

  same(reaction.rawRuleMatches, 0,
    "explicit selected Theory gives A0 no continuation");
  same(reaction.produced.length, 0, "1 -> 0 produces no successors");
  same(working.size, 0, "old A0 branch leaves working state");
  assert(!working.has(KA0), "K -> A0 no longer current");
}

function exerciseGeneralImage(f: Fixture): void {
  const { memory, theory, K, A1, A2, B1, B2, B3 } = f;

  const KA1 = memory.ensure(K, A1);
  const KA2 = memory.ensure(K, A2);
  const working = new WorkingBundle([KA1, KA2]);

  const reaction = reactBundleByStructuralRules(memory, theory, working);

  same(reaction.consumed.length, 2, "two old active Links consumed");
  same(reaction.rawRuleMatches, 4,
    "four admitted continuation Rules match the old bundle");
  same(reaction.produced.length, 3,
    "four causal Rule matches canonicalize to three successor Links");

  const KB1 = memory.ensure(K, B1);
  const KB2 = memory.ensure(K, B2);
  const KB3 = memory.ensure(K, B3);

  assert(reaction.produced.includes(KB1), "K -> B1 produced");
  assert(reaction.produced.includes(KB2), "K -> B2 produced");
  assert(reaction.produced.includes(KB3), "K -> B3 produced");

  same(
    reaction.produced.filter((link) => link === KB2).length,
    1,
    "shared B2 has one canonical successor identity",
  );

  same(working.size, 3, "working bundle contains B1/B2/B3 only");
  assert(!working.has(KA1), "K -> A1 no longer current");
  assert(!working.has(KA2), "K -> A2 no longer current");
  assert(working.has(KB1), "K -> B1 current");
  assert(working.has(KB2), "K -> B2 current");
  assert(working.has(KB3), "K -> B3 current");
}

function staticGuards(): void {
  const root = resolve(process.cwd(), "..");
  const own = readFileSync(
    join(root, "ts/test/research-v013-relational-rules-bundle-a72k.test.ts"),
    "utf8",
  );

  const kernelStart = own.indexOf("function reactBundleByStructuralRules(");
  const kernelEnd = own.indexOf("\ninterface Fixture", kernelStart);
  assert(kernelStart >= 0 && kernelEnd > kernelStart, "reaction source slice");
  const kernel = own.slice(kernelStart, kernelEnd);

  assert(kernel.includes("const before = working.snapshot()"),
    "reaction starts from one immutable working snapshot");
  assert(kernel.includes("discoverApplicableRuleImages"),
    "reaction derives continuations through structural Rule matching");
  assert(kernel.includes("working.replaceAtomically(before, produced)"),
    "reaction publishes the complete image once");

  same(
    kernel.split("working.replaceAtomically(").length - 1,
    1,
    "exactly one semantic working-state commit",
  );

  for (const forbidden of [
    "relationScope",
    "continuationTargets",
    "admitContinuation",
    "RuleKind",
    "opcode",
    "selectedRule",
    "switch(",
  ]) {
    assert(!kernel.includes(forbidden),
      "reaction kernel excludes old relation enumeration/opcode: " + forbidden);
  }

  const prior = readFileSync(
    join(root, "ts/test/research-v013-relational-bundle-n-to-m-a72j.test.ts"),
    "utf8",
  );
  assert(prior.includes("RELATIONAL_BUNDLE_N_TO_M=GREEN_SCOPED_RESEARCH"),
    "A72j host-relation baseline remains retained");
}

function main(): void {
  const fixture = buildFixture();
  exerciseNoImageControl(fixture);
  exerciseGeneralImage(fixture);
  staticGuards();

  console.log([
    "MTS v0.13 A72k: RELATIONAL_BUNDLE_FROM_STRUCTURAL_RULES=GREEN_SCOPED_RESEARCH",
    "RELATION_SCOPE_OBJECT=ABSENT",
    "HOST_CONTINUATION_TARGET_ENUMERATION=0",
    "CONTINUATION_AUTHORITY=ADMITTED_STRUCTURAL_RULES",
    "RULE_FORM=K_TO_A_REWRITES_TO_K_TO_B",
    "MTS_SET_OBJECT=ABSENT",
    "ONE_TO_ZERO_CONTROL=GREEN",
    "N_TO_M_AUTHOR_EXAMPLE=GREEN",
    "RAW_RULE_MATCHES=4",
    "CANONICAL_OUTPUT_LINKS=3",
    "SHARED_B2_DUPLICATED=FALSE",
    "WORKING_STATE_COMMITS_PER_REACTION=1",
    "INTERMEDIATE_WORKING_STATE_EXPOSURE=0",
    "HOST_ACTIVE_BUNDLE_ENUMERATION=RESIDUAL",
    "HOST_THEORY_RULE_ENUMERATION=RESIDUAL",
    "HOST_WORKING_MEMBERSHIP=RESIDUAL",
    "LINKS_ONLY_RELATIONAL_DYNAMICS=NOT_PROVEN",
    "NEXT=REMOVE_HOST_RULE_ENUMERATION_OR_FALSIFY_NATIVE_LOCAL_FIRING",
    "FULL_SELF_HOSTED=FALSE",
    "V013_NOT_ACCEPTED PRODUCTION_UNCHANGED",
  ].join(" "));
}

main();
