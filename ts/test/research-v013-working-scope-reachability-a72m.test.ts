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
  if (!c) throw new Error("v0.13 A72m working-scope reachability: " + m);
}

function same<T>(a: T, e: T, m: string): void {
  assert(Object.is(a, e), m + ": values differ");
}

function sameMembers(
  actual: readonly LinkHandle[],
  expected: readonly LinkHandle[],
  message: string,
): void {
  same(actual.length, expected.length, message + " cardinality");
  for (const member of expected) {
    assert(actual.includes(member), message + " missing member");
  }
}

/**
 * Working membership is represented by ordinary attachments:
 *
 *   Scope -> activeLink
 *
 * Scope itself is START(seed), only to distinguish its self/header Link from
 * membership attachments. No MTS Set object is introduced.
 */
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
  const header = memory.poles(scope);
  assert(header.start === scope && header.end !== scope,
    "working scope must have START shape");

  const members: LinkHandle[] = [];
  for (const attachment of memory.outgoing(scope)) {
    if (attachment === scope) continue;
    const poles = memory.poles(attachment);
    if (poles.start !== scope) continue;
    if (!members.includes(poles.end)) members.push(poles.end);
  }
  return Object.freeze(members);
}

/**
 * Only one host scalar remains: which scope is current.
 *
 * The bundle itself is no longer stored in a host collection.
 */
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

  has(member: LinkHandle): boolean {
    return this.members().includes(member);
  }

  switchAtomically(expectedOld: LinkHandle, next: LinkHandle): void {
    same(this.scope, expectedOld, "current scope must match expected old scope");
    this.scope = next;
  }
}

interface GroundedRuleImage {
  readonly outputTemplate: LinkHandle;
  readonly bindings: readonly StructuralRoleBinding[];
}

interface ScopeReaction {
  readonly oldScope: LinkHandle;
  readonly nextScope: LinkHandle;
  readonly oldMembers: readonly LinkHandle[];
  readonly produced: readonly LinkHandle[];
  readonly rawRuleMatches: number;
}

function defineLocallyTriggeredContinuationRule(
  memory: Memory,
  theory: LinkHandle,
  b: RootBasis,
  seed: LinkHandle,
  from: LinkHandle,
  to: LinkHandle,
): void {
  const kRole = memory.ensure(seed, b.O);
  const dictionary = defineStructuralRoleDictionary(memory, [kRole]);
  const before = memory.ensure(kRole, from);
  const after = memory.ensure(kRole, to);
  const rule = defineStructuralRule(
    memory,
    dictionary,
    memory.ensure(before, after),
  );
  const admission = admitStructuralRule(memory, theory, rule);
  memory.ensure(from, admission);
}

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
 * Replace one topology-rooted working state by another.
 *
 * During derivation:
 * - cursor still points only at oldScope;
 * - successor Links and nextScope attachments may already exist canonically;
 * - they are not current because currentness is reachability from cursor.scope.
 *
 * One scalar scope switch makes the complete next bundle current at once.
 *
 * nextScopeSeed is intentionally explicit: deriving a fresh scope identity
 * entirely from Links remains a later problem.
 */
function reactCurrentScope(
  memory: Memory,
  theory: LinkHandle,
  cursor: CurrentScopeCursor,
  nextScopeSeed: LinkHandle,
): ScopeReaction {
  const oldScope = cursor.currentScope();
  const before = cursor.members();
  assert(before.length > 0, "reaction requires non-empty current scope");

  const produced: LinkHandle[] = [];
  let rawRuleMatches = 0;

  for (const active of before) {
    const endpoint = memory.poles(active).end;

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

      same(cursor.currentScope(), oldScope,
        "old scope remains current throughout derivation");
      sameMembers(cursor.members(), before,
        "old working topology remains current throughout derivation");
    }
  }

  const nextScope = defineWorkingScope(memory, nextScopeSeed, produced);

  same(cursor.currentScope(), oldScope,
    "new scope topology is not current before handoff");
  sameMembers(cursor.members(), before,
    "allocating next scope does not expose partial next state");

  cursor.switchAtomically(oldScope, nextScope);

  return Object.freeze({
    oldScope,
    nextScope,
    oldMembers: before,
    produced: Object.freeze(produced),
    rawRuleMatches,
  });
}

function exercise(): void {
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
  const A1 = memory.ensure(at(4), at(5));
  const A2 = memory.ensure(at(6), at(7));
  const B1 = memory.ensure(at(8), at(9));
  const B2 = memory.ensure(at(10), at(11));
  const B3 = memory.ensure(at(12), at(13));

  defineLocallyTriggeredContinuationRule(memory, theory, b, at(14), A1, B1);
  defineLocallyTriggeredContinuationRule(memory, theory, b, at(15), A1, B2);
  defineLocallyTriggeredContinuationRule(memory, theory, b, at(16), A2, B2);
  defineLocallyTriggeredContinuationRule(memory, theory, b, at(17), A2, B3);

  const KA1 = memory.ensure(K, A1);
  const KA2 = memory.ensure(K, A2);
  const oldScope = defineWorkingScope(memory, at(18), [KA1, KA2]);
  const cursor = new CurrentScopeCursor(memory, oldScope);

  sameMembers(cursor.members(), [KA1, KA2],
    "initial current state comes only from scope topology");

  const reaction = reactCurrentScope(memory, theory, cursor, at(19));

  same(reaction.rawRuleMatches, 4, "four causal Rule matches");
  same(reaction.produced.length, 3, "three canonical successors");

  const KB1 = memory.ensure(K, B1);
  const KB2 = memory.ensure(K, B2);
  const KB3 = memory.ensure(K, B3);

  sameMembers(reaction.produced, [KB1, KB2, KB3],
    "reaction produces exact canonical relational image");
  sameMembers(cursor.members(), [KB1, KB2, KB3],
    "new current scope exposes complete next state");

  assert(cursor.currentScope() === reaction.nextScope,
    "cursor now points only at successor scope");
  assert(cursor.currentScope() !== reaction.oldScope,
    "old scope is no longer current");

  // Old topology remains physically readable but is semantically non-current.
  sameMembers(
    readWorkingScope(memory, reaction.oldScope),
    [KA1, KA2],
    "old scope topology remains canonical carrier data",
  );
  assert(!cursor.has(KA1), "old K -> A1 is not in current working A-memory");
  assert(!cursor.has(KA2), "old K -> A2 is not in current working A-memory");
  assert(cursor.has(KB1), "K -> B1 is current");
  assert(cursor.has(KB2), "K -> B2 is current");
  assert(cursor.has(KB3), "K -> B3 is current");

  // The successor scope contains no link back to the old scope. Therefore old
  // state is not retained as execution-history ancestry of the new state.
  for (const member of readWorkingScope(memory, reaction.nextScope)) {
    assert(member !== reaction.oldScope,
      "new current scope must not contain old scope as history member");
  }
}

function staticGuards(): void {
  const root = resolve(process.cwd(), "..");
  const own = readFileSync(
    join(root, "ts/test/research-v013-working-scope-reachability-a72m.test.ts"),
    "utf8",
  );

  assert(!own.includes("class WorkingBundle"),
    "external host bundle collection is removed");
  assert(!own.includes("replaceAtomically("),
    "external host bundle replacement primitive is removed");

  const kernelStart = own.indexOf("function reactCurrentScope(");
  const kernelEnd = own.indexOf("\nfunction exercise()", kernelStart);
  assert(kernelStart >= 0 && kernelEnd > kernelStart, "reaction source slice");
  const kernel = own.slice(kernelStart, kernelEnd);

  same(
    kernel.split("cursor.switchAtomically(").length - 1,
    1,
    "currentness changes by one scope handoff",
  );
  assert(kernel.includes("defineWorkingScope"),
    "successor working membership is Link topology");
  assert(kernel.includes("discoverLocallyTriggeredRuleImages"),
    "A72l endpoint-local Rule discovery is retained");

  for (const forbidden of [
    "memory.outgoing(theory)",
    "relationScope",
    "continuationTargets",
    "RuleKind",
    "opcode",
    "selectedRule",
  ]) {
    assert(!kernel.includes(forbidden),
      "scope reaction excludes global scheduler/relation mechanism: " + forbidden);
  }

  const prior = readFileSync(
    join(root, "ts/test/research-v013-local-rule-triggering-a72l.test.ts"),
    "utf8",
  );
  assert(prior.includes("ENDPOINT_LOCAL_RULE_TRIGGERING=GREEN_SCOPED_RESEARCH"),
    "A72l local-trigger baseline remains retained");
}

function main(): void {
  exercise();
  staticGuards();

  console.log([
    "MTS v0.13 A72m: WORKING_STATE_AS_SCOPE_REACHABILITY=GREEN_SCOPED_RESEARCH",
    "HOST_WORKING_BUNDLE_COLLECTION=0",
    "WORKING_MEMBERSHIP_TOPOLOGY=SCOPE_TO_ACTIVE_LINK",
    "CURRENTNESS=REACHABLE_FROM_SINGLE_CURRENT_SCOPE",
    "OLD_SCOPE_CURRENT_AFTER_HANDOFF=FALSE",
    "OLD_SCOPE_CANONICAL_TOPOLOGY_REMAINS=TRUE",
    "NEW_SCOPE_REFERENCES_OLD_SCOPE_AS_HISTORY=FALSE",
    "N_TO_M_AUTHOR_EXAMPLE=GREEN",
    "RAW_LOCAL_RULE_MATCHES=4",
    "CANONICAL_OUTPUT_LINKS=3",
    "CURRENT_SCOPE_HANDOFF_COUNT=1",
    "INTERMEDIATE_NEXT_STATE_EXPOSURE=0",
    "HOST_CURRENT_SCOPE_CURSOR=RESIDUAL_SINGLE_HANDLE",
    "HOST_FRESH_SCOPE_IDENTITY=RESIDUAL",
    "HOST_ACTIVE_SCOPE_ADJACENCY_LOOP=RESIDUAL_SUBSTRATE_OPERATION",
    "PHYSICAL_DELETION=NOT_CLAIMED",
    "LINKS_ONLY_CURRENTNESS=NOT_PROVEN",
    "NEXT=DERIVE_OR_ELIMINATE_HOST_CURRENT_SCOPE_CURSOR_AND_FRESH_SCOPE_IDENTITY",
    "FULL_SELF_HOSTED=FALSE",
    "V013_NOT_ACCEPTED PRODUCTION_UNCHANGED",
  ].join(" "));
}

main();
