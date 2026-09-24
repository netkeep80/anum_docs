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
  if (!c) throw new Error("v0.13 A72o multivalued AND preimage: " + m);
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
    same(this.scope, expectedOld, "scope handoff expected old");
    this.scope = next;
  }
}

interface GroundedRuleImage {
  readonly outputTemplate: LinkHandle;
  readonly bindings: readonly StructuralRoleBinding[];
}

interface ContextReaction {
  readonly oldScope: LinkHandle;
  readonly nextScope: LinkHandle;
  readonly producedContexts: readonly LinkHandle[];
  readonly rawRuleMatches: number;
}

interface Publication {
  readonly oldScope: LinkHandle;
  readonly nextScope: LinkHandle;
  readonly stableResults: readonly LinkHandle[];
}

/**
 * A generalized function value is still not a Set object.
 *
 * Each admissible result is one structural Rule with the same grounded
 * application input:
 *
 *   START(K -> (F -> X))
 *   --------------------
 *   START(K -> Value_i)
 *
 * The grounded application itself locally triggers all of its admitted Rules:
 *
 *   (F -> X) -> (Theory -> Rule_i)
 */
function defineMultivaluedFunctionRule(
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
  const before = memory.ensureStartSelfClosed(
    memory.ensure(kRole, application),
  );
  const after = memory.ensureStartSelfClosed(
    memory.ensure(kRole, output),
  );

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
 * One old Context bundle -> all Context results from all matching Rules.
 *
 * All branches are derived while oldScope remains current. The complete next
 * scope is built first; one cursor handoff publishes all branches together.
 */
function reactContextScope(
  memory: Memory,
  theory: LinkHandle,
  cursor: CurrentScopeCursor,
  nextScopeSeed: LinkHandle,
): ContextReaction {
  const oldScope = cursor.currentScope();
  const before = cursor.members();
  assert(before.length > 0, "Context reaction needs current members");

  const produced: LinkHandle[] = [];
  let rawRuleMatches = 0;

  for (const activeContext of before) {
    const state = readContext(memory, activeContext);

    for (
      const image of discoverLocallyTriggeredRuleImages(
        memory,
        theory,
        state.current,
        activeContext,
      )
    ) {
      rawRuleMatches += 1;
      const successor =
        instantiateTemplate(memory, image.outputTemplate, image.bindings);
      readContext(memory, successor);

      if (!produced.includes(successor)) produced.push(successor);

      same(cursor.currentScope(), oldScope,
        "old Context scope remains current during complete image derivation");
      sameMembers(cursor.members(), before,
        "no partial branch bundle is current");
    }
  }

  const nextScope = defineWorkingScope(memory, nextScopeSeed, produced);

  same(cursor.currentScope(), oldScope,
    "complete next Context scope is still non-current before handoff");
  cursor.switchAtomically(oldScope, nextScope);

  return Object.freeze({
    oldScope,
    nextScope,
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

/**
 * Terminal Context scaffolding disappears from current working state while the
 * already-built payload Links K -> Value_i become stable current Results.
 */
function publishTerminalContextBundle(
  memory: Memory,
  theory: LinkHandle,
  cursor: CurrentScopeCursor,
  resultScopeSeed: LinkHandle,
): Publication {
  const oldScope = cursor.currentScope();
  const contexts = cursor.members();
  assert(contexts.length > 0, "publication needs terminal Contexts");

  const stableResults: LinkHandle[] = [];

  for (const context of contexts) {
    const state = readContext(memory, context);

    same(
      discoverLocallyTriggeredRuleImages(
        memory,
        theory,
        state.current,
        context,
      ).length,
      0,
      "published Context must be locally terminal",
    );

    const payload = memory.poles(context).end;
    const payloadPoles = memory.poles(payload);
    same(payloadPoles.start, state.parent,
      "stable result payload preserves Context parent K");
    same(payloadPoles.end, state.current,
      "stable result payload contains completed value");

    if (!stableResults.includes(payload)) stableResults.push(payload);
  }

  const resultScope =
    defineWorkingScope(memory, resultScopeSeed, stableResults);

  same(cursor.currentScope(), oldScope,
    "stable Result scope not current before one handoff");
  cursor.switchAtomically(oldScope, resultScope);

  return Object.freeze({
    oldScope,
    nextScope: resultScope,
    stableResults: Object.freeze(stableResults),
  });
}

interface Fixture {
  readonly memory: Memory;
  readonly theory: LinkHandle;
  readonly K: LinkHandle;
  readonly AND_PREIMAGE: LinkHandle;
  readonly FALSE: LinkHandle;
  readonly TRUE: LinkHandle;
  readonly P00: LinkHandle;
  readonly P01: LinkHandle;
  readonly P10: LinkHandle;
  readonly P11: LinkHandle;
  readonly scopeSeeds: readonly LinkHandle[];
}

function buildFixture(): Fixture {
  const memory = new Memory();
  const b = ensureRootBasis(memory);

  let seed = memory.ensure(b.U, b.L);
  const fresh: LinkHandle[] = [];
  for (let i = 0; i < 56; i += 1) {
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
  const AND_PREIMAGE = memory.ensure(at(8), at(9));

  const P00 = memory.ensure(FALSE, FALSE);
  const P01 = memory.ensure(FALSE, TRUE);
  const P10 = memory.ensure(TRUE, FALSE);
  const P11 = memory.ensure(TRUE, TRUE);

  assert(P00 !== P01 && P00 !== P10 && P00 !== P11,
    "ordered boolean pairs are distinct");
  assert(P01 !== P10, "argument order remains structural");

  defineMultivaluedFunctionRule(
    memory, theory, b, at(10), AND_PREIMAGE, FALSE, P00,
  );
  defineMultivaluedFunctionRule(
    memory, theory, b, at(11), AND_PREIMAGE, FALSE, P01,
  );
  defineMultivaluedFunctionRule(
    memory, theory, b, at(12), AND_PREIMAGE, FALSE, P10,
  );
  defineMultivaluedFunctionRule(
    memory, theory, b, at(13), AND_PREIMAGE, TRUE, P11,
  );

  const scopeSeeds = Object.freeze([
    at(20), at(21), at(22),
    at(23), at(24), at(25),
  ]);

  return Object.freeze({
    memory,
    theory,
    K,
    AND_PREIMAGE,
    FALSE,
    TRUE,
    P00,
    P01,
    P10,
    P11,
    scopeSeeds,
  });
}

function runCase(
  f: Fixture,
  input: LinkHandle,
  expectedValues: readonly LinkHandle[],
  initialSeed: LinkHandle,
  branchSeed: LinkHandle,
  resultSeed: LinkHandle,
  label: string,
): void {
  const { memory, theory, K, AND_PREIMAGE } = f;

  const application = memory.ensure(AND_PREIMAGE, input);
  const initialContext = memory.ensureStartSelfClosed(
    memory.ensure(K, application),
  );
  const initialScope =
    defineWorkingScope(memory, initialSeed, [initialContext]);
  const cursor = new CurrentScopeCursor(memory, initialScope);

  const reaction =
    reactContextScope(memory, theory, cursor, branchSeed);

  same(reaction.rawRuleMatches, expectedValues.length,
    label + " all and only admissible values fire");
  same(reaction.producedContexts.length, expectedValues.length,
    label + " Context branch cardinality");
  same(cursor.members().length, expectedValues.length,
    label + " all branches become current together");

  const actualValues = reaction.producedContexts.map(
    (context) => readContext(memory, context).current,
  );
  sameMembers(actualValues, expectedValues,
    label + " exact multivalued image");

  assert(!cursor.members().includes(initialContext),
    label + " input Context is no longer current after split");

  const publication =
    publishTerminalContextBundle(memory, theory, cursor, resultSeed);

  same(publication.stableResults.length, expectedValues.length,
    label + " stable result cardinality");

  const expectedPayloads = expectedValues.map(
    (value) => memory.ensure(K, value),
  );
  sameMembers(publication.stableResults, expectedPayloads,
    label + " stable result bundle");

  sameMembers(cursor.members(), expectedPayloads,
    label + " final working state contains stable results only");

  for (const member of cursor.members()) {
    assert(!isContext(memory, member),
      label + " final current member is Result, not Context");
  }

  for (const context of reaction.producedContexts) {
    assert(!cursor.members().includes(context),
      label + " temporary branch Context is absent after publication");
    assert(isContext(memory, context),
      label + " canonical Context identity remains readable in carrier");
  }
}

function exercise(): void {
  const f = buildFixture();

  runCase(
    f,
    f.FALSE,
    [f.P00, f.P01, f.P10],
    f.scopeSeeds[0]!,
    f.scopeSeeds[1]!,
    f.scopeSeeds[2]!,
    "AND_PREIMAGE(FALSE)",
  );

  runCase(
    f,
    f.TRUE,
    [f.P11],
    f.scopeSeeds[3]!,
    f.scopeSeeds[4]!,
    f.scopeSeeds[5]!,
    "AND_PREIMAGE(TRUE)",
  );
}

function staticGuards(): void {
  const root = resolve(process.cwd(), "..");
  const own = readFileSync(
    join(root, "ts/test/research-v013-multivalued-and-preimage-a72o.test.ts"),
    "utf8",
  );

  const reactionStart = own.indexOf("function reactContextScope(");
  const reactionEnd = own.indexOf("\nfunction isContext(", reactionStart);
  assert(reactionStart >= 0 && reactionEnd > reactionStart,
    "Context reaction source slice");
  const reaction = own.slice(reactionStart, reactionEnd);

  same(
    reaction.split("cursor.switchAtomically(").length - 1,
    1,
    "multivalued split has one current-scope handoff",
  );

  for (const forbidden of [
    "RuleKind",
    "opcode",
    "selectedRule",
    "memory.outgoing(theory)",
    "relationScope",
    "Set<",
  ]) {
    assert(!reaction.includes(forbidden),
      "multivalued reaction has no selected-rule/set ontology: " + forbidden);
  }

  const a72m = readFileSync(
    join(root, "ts/test/research-v013-working-scope-reachability-a72m.test.ts"),
    "utf8",
  );
  assert(a72m.includes("WORKING_STATE_AS_SCOPE_REACHABILITY=GREEN_SCOPED_RESEARCH"),
    "A72m scope-reachability baseline remains retained");

  const a72n = readFileSync(
    join(root, "ts/test/research-v013-append-only-currentness-falsifier-a72n.test.ts"),
    "utf8",
  );
  assert(a72n.includes("APPEND_ONLY_CURRENTNESS_FALSIFIER=GREEN_SCOPED_RESEARCH"),
    "A72n append-only currentness boundary remains retained");
}

function main(): void {
  exercise();
  staticGuards();

  console.log([
    "MTS v0.13 A72o: MULTIVALUED_AND_PREIMAGE=GREEN_SCOPED_RESEARCH",
    "PROGRAM=AND_PREIMAGE",
    "FUNCTION_CLASS=GENERALIZED_MULTIVALUED_FIXED_ARITY_INPUT_1",
    "INPUT_FALSE_RESULT_COUNT=3",
    "FALSE_RESULTS=PAIR_00_PAIR_01_PAIR_10",
    "INPUT_TRUE_RESULT_COUNT=1",
    "TRUE_RESULTS=PAIR_11",
    "MTS_SET_OBJECT=ABSENT",
    "MULTIVALUEDNESS=PARALLEL_STRUCTURAL_RULES_WITH_SAME_INPUT",
    "ONE_ACTIVE_CONTEXT_TO_MANY_CONTEXTS=ATOMIC_SCOPE_HANDOFF",
    "SELECTED_RULE=0",
    "ALL_MATCHING_RULES_FIRE=TRUE",
    "FINAL_WORKING_CONTEXT_COUNT=0",
    "FINAL_WORKING_MEMBERS=STABLE_K_TO_VALUE_LINKS",
    "TEMP_CONTEXT_SCAFFOLD_DISAPPEARS_FROM_CURRENT_STATE=GREEN",
    "CANONICAL_CONTEXT_IDENTITIES_REMAIN_READABLE=TRUE",
    "HOST_CURRENT_SCOPE_CURSOR=RESIDUAL_PER_A72N",
    "VARIABLE_ARITY_FUNCTIONS=DEFERRED",
    "NEXT=COMPOSE_MULTIVALUED_FUNCTION_WITH_DETERMINISTIC_FUNCTION",
    "FULL_SELF_HOSTED=FALSE",
    "V013_NOT_ACCEPTED PRODUCTION_UNCHANGED",
  ].join(" "));
}

main();
