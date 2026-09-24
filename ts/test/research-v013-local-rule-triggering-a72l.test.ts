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
  if (!c) throw new Error("v0.13 A72l local Rule triggering: " + m);
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
 * Continuation Rule plus local trigger topology.
 *
 * Rule:
 *
 *   K -> A
 *   ------
 *   K -> B
 *
 * Theory admission:
 *
 *   Theory -> Rule
 *
 * Local trigger:
 *
 *   A -> (Theory -> Rule)
 *
 * The trigger makes the grounded source A itself the local discovery point.
 * No global Theory scan is required at execution time.
 */
function defineLocallyTriggeredContinuationRule(
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
  const admission = admitStructuralRule(memory, theory, rule);

  return memory.ensure(from, admission);
}

/**
 * Discover only Rule triggers attached to the current active endpoint.
 *
 * The selected Theory is still verified as authority, but it is not enumerated.
 */
function discoverLocallyTriggeredRuleImages(
  memory: Memory,
  theory: LinkHandle,
  endpoint: LinkHandle,
  active: LinkHandle,
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
 * A72l candidate local reaction.
 *
 * For each active K -> A, only A's local outgoing trigger topology is read.
 * There is no memory.outgoing(theory) scan and no relationScope traversal.
 *
 * The active bundle is still supplied by the host test harness and the final
 * current-state replacement remains one host commit.
 */
function reactBundleByLocalRuleTriggers(
  memory: Memory,
  theory: LinkHandle,
  working: WorkingBundle,
): BundleReaction {
  const before = working.snapshot();
  assert(before.length > 0, "reaction requires a non-empty active bundle");

  const produced: LinkHandle[] = [];
  let rawRuleMatches = 0;

  for (const active of before) {
    const activePoles = memory.poles(active);
    const endpoint = activePoles.end;

    for (
      const image of discoverLocallyTriggeredRuleImages(
        memory,
        theory,
        endpoint,
        active,
      )
    ) {
      rawRuleMatches += 1;
      const successor =
        instantiateTemplate(memory, image.outputTemplate, image.bindings);

      if (!produced.includes(successor)) produced.push(successor);

      same(working.snapshot(), before,
        "working state remains immutable during local Rule firing derivation");
      assert(!working.has(successor),
        "successor becomes current only at final atomic commit");
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
  for (let i = 0; i < 48; i += 1) {
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

  defineLocallyTriggeredContinuationRule(memory, theory, b, at(18), A1, B1);
  defineLocallyTriggeredContinuationRule(memory, theory, b, at(19), A1, B2);
  defineLocallyTriggeredContinuationRule(memory, theory, b, at(20), A2, B2);
  defineLocallyTriggeredContinuationRule(memory, theory, b, at(21), A2, B3);

  // Unrelated Rule exists in Theory but is triggered only from B0.
  defineLocallyTriggeredContinuationRule(memory, theory, b, at(22), B0, A0);

  // Unrelated local adjacency on A1 must not become executable authority.
  memory.ensure(A1, memory.ensure(at(23), at(24)));

  return Object.freeze({
    memory,
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

  const reaction = reactBundleByLocalRuleTriggers(memory, theory, working);

  same(reaction.rawRuleMatches, 0,
    "A0 has no locally attached admitted continuation Rule");
  same(reaction.produced.length, 0, "A0 maps to no successors");
  same(working.size, 0, "1 -> 0 removes old branch from current state");
}

function exerciseGeneralImage(f: Fixture): void {
  const { memory, theory, K, A1, A2, B1, B2, B3 } = f;
  const KA1 = memory.ensure(K, A1);
  const KA2 = memory.ensure(K, A2);
  const working = new WorkingBundle([KA1, KA2]);

  const reaction = reactBundleByLocalRuleTriggers(memory, theory, working);

  same(reaction.rawRuleMatches, 4,
    "four endpoint-local admitted Rule triggers fire");
  same(reaction.produced.length, 3,
    "four causal matches canonicalize to three output Links");

  const KB1 = memory.ensure(K, B1);
  const KB2 = memory.ensure(K, B2);
  const KB3 = memory.ensure(K, B3);

  assert(reaction.produced.includes(KB1), "K -> B1 produced");
  assert(reaction.produced.includes(KB2), "K -> B2 produced");
  assert(reaction.produced.includes(KB3), "K -> B3 produced");

  same(
    reaction.produced.filter((link) => link === KB2).length,
    1,
    "shared B2 remains one canonical current Link",
  );

  same(working.size, 3, "working state becomes B1/B2/B3");
  assert(!working.has(KA1), "K -> A1 no longer current");
  assert(!working.has(KA2), "K -> A2 no longer current");
  assert(working.has(KB1), "K -> B1 current");
  assert(working.has(KB2), "K -> B2 current");
  assert(working.has(KB3), "K -> B3 current");
}

function staticGuards(): void {
  const root = resolve(process.cwd(), "..");
  const own = readFileSync(
    join(root, "ts/test/research-v013-local-rule-triggering-a72l.test.ts"),
    "utf8",
  );

  const discoverStart =
    own.indexOf("function discoverLocallyTriggeredRuleImages(");
  const discoverEnd =
    own.indexOf("\nfunction instantiateTemplate(", discoverStart);
  assert(discoverStart >= 0 && discoverEnd > discoverStart,
    "local discovery source slice");
  const discovery = own.slice(discoverStart, discoverEnd);

  assert(discovery.includes("memory.outgoing(endpoint)"),
    "Rule discovery is local to active endpoint");
  assert(!discovery.includes("memory.outgoing(theory)"),
    "Rule discovery never scans Theory admissions globally");
  assert(discovery.includes("verifyStructuralRuleAdmission"),
    "local trigger still proves selected Theory authority");

  const kernelStart = own.indexOf("function reactBundleByLocalRuleTriggers(");
  const kernelEnd = own.indexOf("\ninterface Fixture", kernelStart);
  assert(kernelStart >= 0 && kernelEnd > kernelStart, "reaction source slice");
  const kernel = own.slice(kernelStart, kernelEnd);

  same(
    kernel.split("working.replaceAtomically(").length - 1,
    1,
    "local reaction publishes current state exactly once",
  );

  for (const forbidden of [
    "memory.outgoing(theory)",
    "relationScope",
    "continuationTargets",
    "RuleKind",
    "opcode",
    "selectedRule",
    "switch(",
  ]) {
    assert(!kernel.includes(forbidden),
      "reaction kernel excludes global scheduler/relation mechanism: " + forbidden);
  }

  const prior = readFileSync(
    join(root, "ts/test/research-v013-relational-rules-bundle-a72k.test.ts"),
    "utf8",
  );
  assert(prior.includes("RELATIONAL_BUNDLE_FROM_STRUCTURAL_RULES=GREEN_SCOPED_RESEARCH"),
    "A72k Theory-enumeration baseline remains retained");
}

function main(): void {
  const fixture = buildFixture();
  exerciseNoImageControl(fixture);
  exerciseGeneralImage(fixture);
  staticGuards();

  console.log([
    "MTS v0.13 A72l: ENDPOINT_LOCAL_RULE_TRIGGERING=GREEN_SCOPED_RESEARCH",
    "RELATION_SCOPE_OBJECT=ABSENT",
    "HOST_CONTINUATION_TARGET_ENUMERATION=0",
    "HOST_GLOBAL_THEORY_ENUMERATION=0",
    "RULE_TRIGGER_TOPOLOGY=A_TO_THEORY_ADMISSION",
    "RULE_AUTHORITY=VERIFIED_SELECTED_THEORY",
    "LOCAL_ENDPOINT_ADJACENCY_TRAVERSAL=GREEN",
    "UNRELATED_LOCAL_ADJACENCY=INERT",
    "ONE_TO_ZERO_CONTROL=GREEN",
    "N_TO_M_AUTHOR_EXAMPLE=GREEN",
    "RAW_LOCAL_RULE_MATCHES=4",
    "CANONICAL_OUTPUT_LINKS=3",
    "WORKING_STATE_COMMITS_PER_REACTION=1",
    "INTERMEDIATE_WORKING_STATE_EXPOSURE=0",
    "HOST_ACTIVE_BUNDLE_ENUMERATION=RESIDUAL",
    "HOST_LOCAL_ADJACENCY_LOOP=RESIDUAL_SUBSTRATE_OPERATION",
    "HOST_WORKING_MEMBERSHIP=RESIDUAL",
    "LINKS_ONLY_CURRENT_STATE_MUTATION=NOT_PROVEN",
    "NEXT=REPRESENT_CURRENT_WORKING_BUNDLE_AS_LINK_TOPOLOGY_AND_TEST_LOCAL_REPLACEMENT",
    "FULL_SELF_HOSTED=FALSE",
    "V013_NOT_ACCEPTED PRODUCTION_UNCHANGED",
  ].join(" "));
}

main();
