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
import { readContext } from "../src/state.js";

function assert(c: unknown, m: string): asserts c {
  if (!c) throw new Error("v0.13 A72s branch-skew completion falsifier: " + m);
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

/** Resume each suspended outer Context with its child result as head. */
function resumeFirstArgumentBranches(
  memory: Memory,
  cursor: CurrentScopeCursor,
  nextScopeSeed: LinkHandle,
): readonly LinkHandle[] {
  const oldScope = cursor.currentScope();
  const children = cursor.members();
  assert(children.length > 0, "inner result branches required");

  const produced: LinkHandle[] = [];

  for (const childContext of children) {
    const child = readContext(memory, childContext);
    const suspendedOuter = child.parent;
    const outer = readContext(memory, suspendedOuter);

    const outerApplication = memory.poles(outer.current);
    const outerFunction = outerApplication.start;
    const oldCarrier = memory.poles(outerApplication.end);
    const tail = oldCarrier.end;

    const resumedCarrier = memory.ensure(child.current, tail);
    const resumedApplication = memory.ensure(outerFunction, resumedCarrier);
    const resumedContext = memory.ensureStartSelfClosed(
      memory.ensure(outer.parent, resumedApplication),
    );

    if (!produced.includes(resumedContext)) produced.push(resumedContext);
  }

  const nextScope = defineWorkingScope(memory, nextScopeSeed, produced);
  cursor.switchAtomically(oldScope, nextScope);
  return Object.freeze(produced);
}

interface Fixture {
  readonly memory: Memory;
  readonly theory: LinkHandle;
  readonly K: LinkHandle;
  readonly ALL: LinkHandle;
  readonly CHOICE: LinkHandle;
  readonly TOKEN: LinkHandle;
  readonly FALSE: LinkHandle;
  readonly TRUE: LinkHandle;
  readonly seeds: readonly LinkHandle[];
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
  const CHOICE = memory.ensure(at(10), at(11));
  const TOKEN = memory.ensure(at(12), at(13));

  defineRecursiveAllRules(
    memory,
    theory,
    b,
    at(14),
    ALL,
    FALSE,
    TRUE,
  );
  defineChoiceRules(
    memory,
    theory,
    b,
    at(15),
    CHOICE,
    TOKEN,
    FALSE,
    TRUE,
  );

  return Object.freeze({
    memory,
    theory,
    K,
    ALL,
    CHOICE,
    TOKEN,
    FALSE,
    TRUE,
    seeds: Object.freeze([
      at(40), at(41), at(42), at(43), at(44),
      at(45), at(46), at(47), at(48), at(49),
    ]),
  });
}

function exercise(): void {
  const f = buildFixture();
  const {
    memory,
    theory,
    K,
    ALL,
    CHOICE,
    TOKEN,
    FALSE,
    TRUE,
    seeds,
  } = f;

  const choiceCall = memory.ensure(CHOICE, TOKEN);
  const args = buildArgumentChain(memory, [choiceCall, TRUE, TRUE]);
  const outerCall = memory.ensure(ALL, args);
  const outerContext =
    memory.ensureStartSelfClosed(memory.ensure(K, outerCall));

  const initialScope = defineWorkingScope(memory, seeds[0]!, [outerContext]);
  const cursor = new CurrentScopeCursor(memory, initialScope);

  // ALL cannot reduce until its first argument has become a boolean.
  same(
    discoverFunctionTriggeredRuleImages(
      memory,
      theory,
      outerContext,
    ).length,
    0,
    "outer recursive ALL waits for nested first argument",
  );

  const child =
    openFirstArgumentCall(memory, cursor, seeds[1]!);
  same(readContext(memory, child).current, choiceCall,
    "child evaluates exact CHOICE call");

  const split =
    reactContextScopeDroppingNoMatch(memory, theory, cursor, seeds[2]!);
  same(split.rawRuleMatches, 2, "CHOICE fires both Rules");
  same(split.producedContexts.length, 2, "CHOICE creates two Context branches");

  const choiceValues = split.producedContexts.map(
    (context) => readContext(memory, context).current,
  );
  sameMembers(choiceValues, [FALSE, TRUE], "exact CHOICE values");

  const resumed =
    resumeFirstArgumentBranches(memory, cursor, seeds[3]!);
  same(resumed.length, 2, "both CHOICE branches resume outer ALL");

  const falseProgram =
    memory.ensure(ALL, buildArgumentChain(memory, [FALSE, TRUE, TRUE]));
  const trueProgram =
    memory.ensure(ALL, buildArgumentChain(memory, [TRUE, TRUE, TRUE]));
  const resumedPrograms = resumed.map(
    (context) => readContext(memory, context).current,
  );
  sameMembers(
    resumedPrograms,
    [falseProgram, trueProgram],
    "exact resumed variadic programs",
  );

  // Round 1: FALSE completes; TRUE still reduces.
  const round1 =
    reactContextScopeDroppingNoMatch(memory, theory, cursor, seeds[4]!);
  same(round1.rawRuleMatches, 2, "both resumed branches react once");
  same(round1.producedContexts.length, 2, "round1 keeps two produced Contexts");

  const falseTerminal = memory.ensureStartSelfClosed(memory.ensure(K, FALSE));
  const allTT = memory.ensure(
    ALL,
    buildArgumentChain(memory, [TRUE, TRUE]),
  );
  const trueStillActive =
    memory.ensureStartSelfClosed(memory.ensure(K, allTT));

  sameMembers(
    cursor.members(),
    [falseTerminal, trueStillActive],
    "round1 creates one completed and one still-active sibling",
  );

  same(
    discoverFunctionTriggeredRuleImages(
      memory,
      theory,
      falseTerminal,
    ).length,
    0,
    "FALSE branch has no further Rule",
  );
  same(
    discoverFunctionTriggeredRuleImages(
      memory,
      theory,
      trueStillActive,
    ).length,
    1,
    "TRUE branch still has one recursive Rule",
  );

  // Round 2: the completed FALSE Context is dropped from current state.
  const round2 =
    reactContextScopeDroppingNoMatch(memory, theory, cursor, seeds[5]!);
  same(round2.rawRuleMatches, 1, "only still-active TRUE branch reacts");
  same(round2.producedContexts.length, 1,
    "naive successor Scope has only the still-active branch");
  assert(
    !cursor.members().includes(falseTerminal),
    "completed FALSE Context disappears from current state",
  );

  const stableFalse = memory.ensure(K, FALSE);
  assert(
    !cursor.members().includes(stableFalse),
    "completed FALSE value was not promoted to stable current Result",
  );

  // Continue surviving TRUE branch.
  const round3 =
    reactContextScopeDroppingNoMatch(memory, theory, cursor, seeds[6]!);
  same(round3.rawRuleMatches, 1, "TRUE branch final recursive reaction");
  same(round3.producedContexts.length, 1, "one TRUE terminal Context remains");

  const trueTerminal = memory.ensureStartSelfClosed(memory.ensure(K, TRUE));
  sameMembers(cursor.members(), [trueTerminal], "surviving terminal branch");

  // Publish only what remains current.
  const finalScope = defineWorkingScope(memory, seeds[7]!, [memory.ensure(K, TRUE)]);
  cursor.switchAtomically(cursor.currentScope(), finalScope);

  sameMembers(
    cursor.members(),
    [memory.ensure(K, TRUE)],
    "naive final current Result contains only TRUE",
  );

  // Correct relational result is both K->FALSE and K->TRUE.
  const expectedRelationImage = [memory.ensure(K, FALSE), memory.ensure(K, TRUE)];
  same(expectedRelationImage.length, 2, "correct relation image cardinality");
  assert(
    !sameCurrentMembers(cursor.members(), expectedRelationImage),
    "naive lifecycle must fail the correct two-result relation image",
  );
}

function sameCurrentMembers(
  actual: readonly LinkHandle[],
  expected: readonly LinkHandle[],
): boolean {
  if (actual.length !== expected.length) return false;
  return expected.every((member) => actual.includes(member));
}

function staticGuards(): void {
  const root = resolve(process.cwd(), "..");
  const own = readFileSync(
    join(
      root,
      "ts/test/research-v013-branch-skew-completion-falsifier-a72s.test.ts",
    ),
    "utf8",
  );

  const reactionStart =
    own.indexOf("function reactContextScopeDroppingNoMatch(");
  const reactionEnd =
    own.indexOf("\n/**\n * Open a nested call", reactionStart);
  assert(reactionStart >= 0 && reactionEnd > reactionStart,
    "reaction source slice");
  const reaction = own.slice(reactionStart, reactionEnd);

  assert(reaction.includes("defineWorkingScope(memory, nextScopeSeed, produced)"),
    "next Scope is built only from Rule-produced successors");
  assert(!reaction.includes("stableResults"),
    "naive reaction has no completed-result channel");
  assert(!reaction.includes("carry"),
    "naive reaction has no terminal carry-forward path");

  const a72r = readFileSync(
    join(root, "ts/test/research-v013-recursive-variadic-all-a72r.test.ts"),
    "utf8",
  );
  assert(a72r.includes("RECURSIVE_VARIADIC_ALL=GREEN_SCOPED_RESEARCH"),
    "A72r recursive variadic base remains retained");

  const a72p = readFileSync(
    join(
      root,
      "ts/test/research-v013-multivalued-deterministic-composition-a72p.test.ts",
    ),
    "utf8",
  );
  assert(
    a72p.includes("MULTIVALUED_DETERMINISTIC_COMPOSITION=GREEN_SCOPED_RESEARCH"),
    "A72p multivalued composition base remains retained",
  );
}

function main(): void {
  exercise();
  staticGuards();

  console.log([
    "MTS v0.13 A72s: BRANCH_SKEW_COMPLETION_FALSIFIER=GREEN_SCOPED_RESEARCH",
    "PROGRAM=ALL_OF_CHOICE_TRUE_TRUE",
    "INNER_CHOICE_BRANCHES=2",
    "RESUMED_VARIADIC_BRANCHES=2",
    "ROUND1_COMPLETED_FALSE_BRANCH=1",
    "ROUND1_ACTIVE_TRUE_BRANCH=1",
    "BRANCH_REDUCTION_DEPTHS=UNEQUAL",
    "NAIVE_NO_MATCH_CONTEXT_BEHAVIOR=DROPPED_FROM_NEXT_SCOPE",
    "EARLY_FALSE_CONTEXT_LOST=TRUE",
    "EARLY_FALSE_STABLE_RESULT_PUBLISHED=FALSE",
    "NAIVE_FINAL_RESULT_BUNDLE=TRUE_ONLY",
    "CORRECT_RELATIONAL_RESULT_BUNDLE=FALSE_AND_TRUE",
    "CURRENT_LIFECYCLE_UNDER_BRANCH_SKEW=RED",
    "RULE_MATCHING=NOT_THE_FAILURE",
    "VARIADIC_CARRIER=NOT_THE_FAILURE",
    "MISSING_MECHANISM=EARLY_CONTEXT_COLLAPSE_TO_STABLE_RESULT_WHILE_SIBLINGS_CONTINUE",
    "CANDIDATE_NEXT_WORKING_SCOPE=MIXED_ACTIVE_CONTEXTS_PLUS_STABLE_RESULTS",
    "HOST_CURRENT_SCOPE_CURSOR=RESIDUAL_PER_A72N",
    "NEXT=A72T_MIXED_WORKING_SCOPE_EARLY_RESULT_COLLAPSE",
    "FULL_SELF_HOSTED=FALSE",
    "V013_NOT_ACCEPTED PRODUCTION_UNCHANGED",
  ].join(" "));
}

main();
