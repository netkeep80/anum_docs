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
  if (!c) {
    throw new Error("v0.13 A72p multivalued deterministic composition: " + m);
  }
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
  const shape = memory.poles(scope);
  assert(shape.start === scope && shape.end !== scope, "working scope START shape");

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
  readonly oldScope: LinkHandle;
  readonly nextScope: LinkHandle;
  readonly producedContexts: readonly LinkHandle[];
  readonly rawRuleMatches: number;
}

interface ScopeTransform {
  readonly oldScope: LinkHandle;
  readonly nextScope: LinkHandle;
  readonly producedContexts: readonly LinkHandle[];
}

interface Publication {
  readonly oldScope: LinkHandle;
  readonly nextScope: LinkHandle;
  readonly stableResults: readonly LinkHandle[];
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

  // Endpoint-local trigger from exact grounded application.
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

function reactContextScope(
  memory: Memory,
  theory: LinkHandle,
  cursor: CurrentScopeCursor,
  nextScopeSeed: LinkHandle,
): ContextReaction {
  const oldScope = cursor.currentScope();
  const before = cursor.members();
  assert(before.length > 0, "Context reaction requires current Contexts");

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
        "old scope current throughout Rule-image derivation");
      sameMembers(cursor.members(), before,
        "partial successor Context bundle never becomes current");
    }
  }

  const nextScope = defineWorkingScope(memory, nextScopeSeed, produced);

  same(cursor.currentScope(), oldScope,
    "complete next scope is non-current before handoff");
  cursor.switchAtomically(oldScope, nextScope);

  return Object.freeze({
    oldScope,
    nextScope,
    producedContexts: Object.freeze(produced),
    rawRuleMatches,
  });
}

/**
 * Generic nested growth:
 *
 *   START(K -> (F -> innerCall))
 *
 * becomes one child Context:
 *
 *   START(outerContext -> innerCall)
 *
 * This is still an explicit host lifecycle residual, carried forward from A72d.
 */
function openNestedArgumentScope(
  memory: Memory,
  cursor: CurrentScopeCursor,
  nextScopeSeed: LinkHandle,
): ScopeTransform {
  const oldScope = cursor.currentScope();
  const before = cursor.members();
  assert(before.length > 0, "nested growth requires outer Contexts");

  const produced: LinkHandle[] = [];

  for (const outerContext of before) {
    const outer = readContext(memory, outerContext);
    const outerApplication = memory.poles(outer.current);
    const innerCall = outerApplication.end;

    const childContext = memory.ensureStartSelfClosed(
      memory.ensure(outerContext, innerCall),
    );
    if (!produced.includes(childContext)) produced.push(childContext);

    same(cursor.currentScope(), oldScope,
      "outer scope remains current during nested growth");
  }

  const nextScope = defineWorkingScope(memory, nextScopeSeed, produced);
  cursor.switchAtomically(oldScope, nextScope);

  return Object.freeze({
    oldScope,
    nextScope,
    producedContexts: Object.freeze(produced),
  });
}

/**
 * Branch-wise one-level collapse:
 *
 *   START(suspendedOuter -> value_i)
 *
 * becomes:
 *
 *   START(K -> (F -> value_i))
 *
 * Every child branch resumes its own copy of the same suspended outer call.
 * The complete resumed branch bundle is published by one scope handoff.
 */
function collapseBranchBundleOneLevel(
  memory: Memory,
  cursor: CurrentScopeCursor,
  nextScopeSeed: LinkHandle,
): ScopeTransform {
  const oldScope = cursor.currentScope();
  const before = cursor.members();
  assert(before.length > 0, "collapse requires child result Contexts");

  const produced: LinkHandle[] = [];

  for (const childContext of before) {
    const child = readContext(memory, childContext);
    const suspendedOuter = child.parent;
    const outer = readContext(memory, suspendedOuter);
    const outerApplication = memory.poles(outer.current);
    const outerFunction = outerApplication.start;

    const resumedApplication =
      memory.ensure(outerFunction, child.current);
    const resumedContext = memory.ensureStartSelfClosed(
      memory.ensure(outer.parent, resumedApplication),
    );

    if (!produced.includes(resumedContext)) produced.push(resumedContext);

    same(cursor.currentScope(), oldScope,
      "child-result scope remains current during branch collapse");
    sameMembers(cursor.members(), before,
      "no partially resumed outer branch becomes current");
  }

  const nextScope = defineWorkingScope(memory, nextScopeSeed, produced);
  cursor.switchAtomically(oldScope, nextScope);

  return Object.freeze({
    oldScope,
    nextScope,
    producedContexts: Object.freeze(produced),
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

function publishTerminalContextBundle(
  memory: Memory,
  theory: LinkHandle,
  cursor: CurrentScopeCursor,
  resultScopeSeed: LinkHandle,
): Publication {
  const oldScope = cursor.currentScope();
  const contexts = cursor.members();
  assert(contexts.length > 0, "publication requires terminal Contexts");

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
      "publication requires locally terminal Context",
    );

    const payload = memory.poles(context).end;
    if (!stableResults.includes(payload)) stableResults.push(payload);
  }

  const nextScope =
    defineWorkingScope(memory, resultScopeSeed, stableResults);

  cursor.switchAtomically(oldScope, nextScope);

  return Object.freeze({
    oldScope,
    nextScope,
    stableResults: Object.freeze(stableResults),
  });
}

interface Fixture {
  readonly memory: Memory;
  readonly theory: LinkHandle;
  readonly K: LinkHandle;
  readonly AND: LinkHandle;
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
  for (let i = 0; i < 72; i += 1) {
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
  const AND = memory.ensure(at(8), at(9));
  const AND_PREIMAGE = memory.ensure(at(10), at(11));

  const P00 = memory.ensure(FALSE, FALSE);
  const P01 = memory.ensure(FALSE, TRUE);
  const P10 = memory.ensure(TRUE, FALSE);
  const P11 = memory.ensure(TRUE, TRUE);

  // Multi-valued inner relation.
  defineGroundedFunctionRule(
    memory, theory, b, at(12), AND_PREIMAGE, FALSE, P00,
  );
  defineGroundedFunctionRule(
    memory, theory, b, at(13), AND_PREIMAGE, FALSE, P01,
  );
  defineGroundedFunctionRule(
    memory, theory, b, at(14), AND_PREIMAGE, FALSE, P10,
  );
  defineGroundedFunctionRule(
    memory, theory, b, at(15), AND_PREIMAGE, TRUE, P11,
  );

  // Ordinary deterministic AND applied to the pair values.
  defineGroundedFunctionRule(memory, theory, b, at(16), AND, P00, FALSE);
  defineGroundedFunctionRule(memory, theory, b, at(17), AND, P01, FALSE);
  defineGroundedFunctionRule(memory, theory, b, at(18), AND, P10, FALSE);
  defineGroundedFunctionRule(memory, theory, b, at(19), AND, P11, TRUE);

  // Separate scope identities make every lifecycle handoff observable.
  const scopeSeeds = Object.freeze([
    at(30), at(31), at(32), at(33), at(34), at(35),
    at(36), at(37), at(38), at(39), at(40), at(41),
  ]);

  return Object.freeze({
    memory,
    theory,
    K,
    AND,
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

function runCompositionCase(
  f: Fixture,
  input: LinkHandle,
  expectedPreimage: readonly LinkHandle[],
  expectedFinal: LinkHandle,
  seeds: readonly LinkHandle[],
  label: string,
): void {
  assert(seeds.length === 6, label + " requires six scope seeds");

  const {
    memory,
    theory,
    K,
    AND,
    AND_PREIMAGE,
  } = f;

  const innerCall = memory.ensure(AND_PREIMAGE, input);
  const outerCall = memory.ensure(AND, innerCall);
  const outerContext = memory.ensureStartSelfClosed(
    memory.ensure(K, outerCall),
  );
  const initialScope =
    defineWorkingScope(memory, seeds[0]!, [outerContext]);
  const cursor = new CurrentScopeCursor(memory, initialScope);

  same(
    discoverLocallyTriggeredRuleImages(
      memory,
      theory,
      outerCall,
      outerContext,
    ).length,
    0,
    label + " outer AND cannot fire before inner result exists",
  );

  // 1. Grow scaffold to inner call.
  const growth =
    openNestedArgumentScope(memory, cursor, seeds[1]!);
  same(growth.producedContexts.length, 1,
    label + " creates one child Context");
  const child = growth.producedContexts[0]!;
  same(readContext(memory, child).parent, outerContext,
    label + " child remembers exact suspended outer Context");
  same(readContext(memory, child).current, innerCall,
    label + " child evaluates exact AND_PREIMAGE call");

  // 2. Multi-valued inner evaluation.
  const innerReaction =
    reactContextScope(memory, theory, cursor, seeds[2]!);
  same(innerReaction.rawRuleMatches, expectedPreimage.length,
    label + " inner causal branch count");
  same(innerReaction.producedContexts.length, expectedPreimage.length,
    label + " inner canonical Context branch count");

  const innerValues = innerReaction.producedContexts.map(
    (context) => readContext(memory, context).current,
  );
  sameMembers(innerValues, expectedPreimage,
    label + " exact AND_PREIMAGE values");

  // 3. Every child value resumes the same suspended outer AND.
  const resumed =
    collapseBranchBundleOneLevel(memory, cursor, seeds[3]!);
  same(resumed.producedContexts.length, expectedPreimage.length,
    label + " every inner value resumes one outer branch");

  const resumedApplications = resumed.producedContexts.map(
    (context) => readContext(memory, context).current,
  );
  const expectedApplications =
    expectedPreimage.map((pair) => memory.ensure(AND, pair));
  sameMembers(resumedApplications, expectedApplications,
    label + " branch-wise outer AND applications");

  // 4. Deterministic AND executes independently on every branch.
  const outerReaction =
    reactContextScope(memory, theory, cursor, seeds[4]!);

  same(outerReaction.rawRuleMatches, expectedPreimage.length,
    label + " one deterministic AND Rule fires per causal branch");

  // For FALSE, three causal branches all instantiate the same canonical
  // START(K -> FALSE) Context, so the branch bundle converges from 3 to 1.
  same(outerReaction.producedContexts.length, 1,
    label + " canonical final Context convergence");

  const terminalContext = outerReaction.producedContexts[0]!;
  const terminal = readContext(memory, terminalContext);
  same(terminal.parent, K, label + " final Context returns to K");
  same(terminal.current, expectedFinal, label + " final composed value");

  // 5. Tear down final Context scaffold and keep stable Result.
  const publication =
    publishTerminalContextBundle(memory, theory, cursor, seeds[5]!);

  const stableExpected = memory.ensure(K, expectedFinal);
  same(publication.stableResults.length, 1,
    label + " one canonical stable result");
  same(publication.stableResults[0]!, stableExpected,
    label + " exact stable K -> result Link");
  sameMembers(cursor.members(), [stableExpected],
    label + " final current working state");

  assert(!isContext(memory, cursor.members()[0]!),
    label + " final current member is Result, not Context");

  for (const context of innerReaction.producedContexts) {
    assert(!cursor.members().includes(context),
      label + " inner branch Context no longer current");
  }
  for (const context of resumed.producedContexts) {
    assert(!cursor.members().includes(context),
      label + " resumed outer branch Context no longer current");
  }
}

function exercise(): void {
  const f = buildFixture();

  runCompositionCase(
    f,
    f.FALSE,
    [f.P00, f.P01, f.P10],
    f.FALSE,
    f.scopeSeeds.slice(0, 6),
    "AND(AND_PREIMAGE(FALSE))",
  );

  runCompositionCase(
    f,
    f.TRUE,
    [f.P11],
    f.TRUE,
    f.scopeSeeds.slice(6, 12),
    "AND(AND_PREIMAGE(TRUE))",
  );
}

function staticGuards(): void {
  const root = resolve(process.cwd(), "..");
  const own = readFileSync(
    join(
      root,
      "ts/test/research-v013-multivalued-deterministic-composition-a72p.test.ts",
    ),
    "utf8",
  );

  for (const functionName of [
    "openNestedArgumentScope",
    "collapseBranchBundleOneLevel",
  ]) {
    const start = own.indexOf("function " + functionName + "(");
    assert(start >= 0, functionName + " source start");
    const end = own.indexOf("\nfunction ", start + 10);
    assert(end > start, functionName + " source end");
    const source = own.slice(start, end);

    for (const forbidden of [
      "AND_PREIMAGE",
      "RuleKind",
      "opcode",
      "selectedRule",
      "switch(",
    ]) {
      assert(!source.includes(forbidden),
        functionName + " remains generic: " + forbidden);
    }
  }

  const reactionStart = own.indexOf("function reactContextScope(");
  const reactionEnd =
    own.indexOf("\n/**\n * Generic nested growth", reactionStart);
  assert(reactionStart >= 0 && reactionEnd > reactionStart,
    "Context reaction source slice");
  const reaction = own.slice(reactionStart, reactionEnd);

  same(
    reaction.split("cursor.switchAtomically(").length - 1,
    1,
    "each Rule reaction publishes complete branch image once",
  );
  assert(!reaction.includes("selectedRule"),
    "all matching Rules fire without selected Rule");

  const a72o = readFileSync(
    join(root, "ts/test/research-v013-multivalued-and-preimage-a72o.test.ts"),
    "utf8",
  );
  assert(a72o.includes("MULTIVALUED_AND_PREIMAGE=GREEN_SCOPED_RESEARCH"),
    "A72o multivalued base remains retained");

  const a72d = readFileSync(
    join(root, "ts/test/research-v013-working-amemory-nand-composition-a72d.test.ts"),
    "utf8",
  );
  assert(a72d.includes("DETERMINISTIC_NAND_COMPOSITION=GREEN_SCOPED_RESEARCH"),
    "A72d deterministic composition remains retained");
}

function main(): void {
  exercise();
  staticGuards();

  console.log([
    "MTS v0.13 A72p: MULTIVALUED_DETERMINISTIC_COMPOSITION=GREEN_SCOPED_RESEARCH",
    "PROGRAM=AND_OF_AND_PREIMAGE",
    "FALSE_INPUT_INNER_BRANCHES=3",
    "FALSE_INPUT_OUTER_CAUSAL_AND_MATCHES=3",
    "FALSE_INPUT_CANONICAL_FINAL_CONTEXTS=1",
    "FALSE_INPUT_FINAL_VALUE=FALSE",
    "TRUE_INPUT_INNER_BRANCHES=1",
    "TRUE_INPUT_OUTER_CAUSAL_AND_MATCHES=1",
    "TRUE_INPUT_CANONICAL_FINAL_CONTEXTS=1",
    "TRUE_INPUT_FINAL_VALUE=TRUE",
    "SPLIT_THEN_CANONICAL_CONVERGENCE=GREEN",
    "BRANCH_WISE_OUTER_RESUMPTION=GREEN",
    "SELECTED_BRANCH=0",
    "SELECTED_RULE=0",
    "MTS_SET_OBJECT=ABSENT",
    "FINAL_WORKING_CONTEXT_COUNT=0",
    "FINAL_STABLE_RESULT_COUNT=1",
    "HOST_NESTED_GROWTH=RESIDUAL",
    "HOST_BRANCH_COLLAPSE=RESIDUAL",
    "HOST_CURRENT_SCOPE_CURSOR=RESIDUAL_PER_A72N",
    "VARIABLE_ARITY_FUNCTIONS=DEFERRED",
    "NEXT=DEEPER_MULTIVALUED_COMPOSITION_OR_BEGIN_VARIABLE_ARITY_AFTER_REVIEW",
    "FULL_SELF_HOSTED=FALSE",
    "V013_NOT_ACCEPTED PRODUCTION_UNCHANGED",
  ].join(" "));
}

main();
