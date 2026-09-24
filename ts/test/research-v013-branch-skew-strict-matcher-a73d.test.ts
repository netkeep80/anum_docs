import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { materializeExactSequence } from "../src/exact-sequence.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type RootBasis,
} from "../src/memory.js";
import {
  admitStructuralRule,
  defineStructuralInterpreter,
  defineStructuralRoleDictionary,
  defineStructuralRule,
} from "../src/structural-rule.js";
import {
  V013CurrentScopeCursor,
  defineV013WorkingScope,
  reactV013StructuralScope,
} from "../src/v013-structural-execution.js";
function assert(c: unknown, m: string): asserts c {
  if (!c) throw new Error("v0.13 A73d branch skew fixed point: " + m);
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
function call(
  memory: Memory,
  b: RootBasis,
  fn: LinkHandle,
  arg: LinkHandle,
): LinkHandle {
  return memory.ensure(b.O, memory.ensure(fn, arg));
}
function done(
  memory: Memory,
  b: RootBasis,
  value: LinkHandle,
): LinkHandle {
  return memory.ensure(b.C, value);
}
function rootBoundary(
  memory: Memory,
  rootCaller: LinkHandle,
): LinkHandle {
  return memory.ensureEndSelfClosed(rootCaller);
}
function admitTaggedBundleRule(
  memory: Memory,
  theory: LinkHandle,
  triggerKey: LinkHandle,
  roles: readonly LinkHandle[],
  before: LinkHandle,
  after: readonly LinkHandle[],
): LinkHandle {
  const dictionary = defineStructuralRoleDictionary(memory, roles);
  const outputBundle = materializeExactSequence(memory, after);
  const rule = defineStructuralRule(
    memory,
    dictionary,
    memory.ensure(before, outputBundle),
  );
  const admission = admitStructuralRule(memory, theory, rule);
  memory.ensure(triggerKey, admission);
  return rule;
}
function defineGroundedUnaryFunctionRule(
  memory: Memory,
  theory: LinkHandle,
  b: RootBasis,
  seed: LinkHandle,
  fn: LinkHandle,
  input: LinkHandle,
  output: LinkHandle,
): LinkHandle {
  const caller = memory.ensure(seed, b.O);
  const before = memory.ensure(caller, call(memory, b, fn, input));
  const after = memory.ensure(caller, done(memory, b, output));
  return admitTaggedBundleRule(
    memory,
    theory,
    b.O,
    [caller],
    before,
    [after],
  );
}
function argumentChain(
  memory: Memory,
  args: readonly LinkHandle[],
): LinkHandle {
  assert(args.length > 0, "positive arity required");
  let chain = memory.root;
  for (let i = args.length - 1; i >= 0; i -= 1) {
    chain = memory.ensure(args[i]!, chain);
  }
  return chain;
}
function variadicFrame(
  memory: Memory,
  parent: LinkHandle,
  fn: LinkHandle,
  tail: LinkHandle,
): LinkHandle {
  return memory.ensureStartSelfClosed(
    memory.ensure(parent, memory.ensure(fn, tail)),
  );
}
function defineVariadicHeadLifecycleRules(
  memory: Memory,
  theory: LinkHandle,
  b: RootBasis,
  seed: LinkHandle,
): void {
  const kOpen = memory.ensure(seed, b.O);
  const fOpen = memory.ensure(seed, b.C);
  const gOpen = memory.ensure(seed, b.L);
  const xOpen = memory.ensure(seed, b.U);
  const tailOpen = memory.ensure(seed, memory.root);
  const inner = call(memory, b, gOpen, xOpen);
  const openArgs = memory.ensure(inner, tailOpen);
  const openBefore = memory.ensure(kOpen, call(memory, b, fOpen, openArgs));
  const openAfter = memory.ensure(
    variadicFrame(memory, kOpen, fOpen, tailOpen),
    inner,
  );
  admitTaggedBundleRule(
    memory,
    theory,
    b.O,
    [kOpen, fOpen, gOpen, xOpen, tailOpen],
    openBefore,
    [openAfter],
  );
  const kResume = memory.ensure(seed, memory.ensure(b.O, b.C));
  const fResume = memory.ensure(seed, memory.ensure(b.C, b.L));
  const tailResume = memory.ensure(seed, memory.ensure(b.L, b.U));
  const vResume = memory.ensure(seed, memory.ensure(b.U, b.O));
  const resumeBefore = memory.ensure(
    variadicFrame(memory, kResume, fResume, tailResume),
    done(memory, b, vResume),
  );
  const resumedArgs = memory.ensure(vResume, tailResume);
  const resumeAfter = memory.ensure(
    kResume,
    call(memory, b, fResume, resumedArgs),
  );
  admitTaggedBundleRule(
    memory,
    theory,
    b.C,
    [kResume, fResume, tailResume, vResume],
    resumeBefore,
    [resumeAfter],
  );
}
function defineTopLevelPublishRule(
  memory: Memory,
  theory: LinkHandle,
  b: RootBasis,
  seed: LinkHandle,
): void {
  const k = memory.ensure(seed, b.O);
  const v = memory.ensure(seed, b.C);
  const before = memory.ensure(rootBoundary(memory, k), done(memory, b, v));
  const after = memory.ensure(k, v);
  admitTaggedBundleRule(memory, theory, b.C, [k, v], before, [after]);
}
function defineRecursiveAllRules(
  memory: Memory,
  theory: LinkHandle,
  b: RootBasis,
  seed: LinkHandle,
  ALL: LinkHandle,
  FALSE: LinkHandle,
  TRUE: LinkHandle,
): void {
  const kFalse = memory.ensure(seed, b.O);
  const falseTail = memory.ensure(seed, b.C);
  const falseArgs = memory.ensure(FALSE, falseTail);
  admitTaggedBundleRule(
    memory,
    theory,
    b.O,
    [kFalse, falseTail],
    memory.ensure(kFalse, call(memory, b, ALL, falseArgs)),
    [memory.ensure(kFalse, done(memory, b, FALSE))],
  );
  const kTrueTerminal = memory.ensure(seed, b.L);
  const trueTerminalArgs = memory.ensure(TRUE, memory.root);
  admitTaggedBundleRule(
    memory,
    theory,
    b.O,
    [kTrueTerminal],
    memory.ensure(kTrueTerminal, call(memory, b, ALL, trueTerminalArgs)),
    [memory.ensure(kTrueTerminal, done(memory, b, TRUE))],
  );
  const kTrueRecursive = memory.ensure(seed, b.U);
  const nextHead = memory.ensure(seed, memory.ensure(b.O, b.L));
  const nextRest = memory.ensure(seed, memory.ensure(b.C, b.U));
  const nonEmptyTail = memory.ensure(nextHead, nextRest);
  const trueRecursiveArgs = memory.ensure(TRUE, nonEmptyTail);
  admitTaggedBundleRule(
    memory,
    theory,
    b.O,
    [kTrueRecursive, nextHead, nextRest],
    memory.ensure(kTrueRecursive, call(memory, b, ALL, trueRecursiveArgs)),
    [memory.ensure(kTrueRecursive, call(memory, b, ALL, nonEmptyTail))],
  );
}
interface Fixture {
  readonly memory: Memory;
  readonly b: RootBasis;
  readonly theory: LinkHandle;
  readonly interpreter: LinkHandle;
  readonly K: LinkHandle;
  readonly ALL: LinkHandle;
  readonly CHOICE: LinkHandle;
  readonly TOKEN: LinkHandle;
  readonly FALSE: LinkHandle;
  readonly TRUE: LinkHandle;
  readonly fresh: readonly LinkHandle[];
}
function buildFixture(): Fixture {
  const memory = new Memory();
  const b = ensureRootBasis(memory);
  let seed = memory.ensure(b.U, b.L);
  const fresh: LinkHandle[] = [];
  for (let i = 0; i < 340; i += 1) {
    seed = memory.ensure(seed, i % 2 === 0 ? b.O : b.C);
    fresh.push(seed);
  }
  const at = (i: number): LinkHandle => {
    const value = fresh[i];
    assert(value !== undefined, "fresh anchor " + i);
    return value;
  };
  const theory = memory.ensure(at(0), at(1));
  const authorityDictionary = defineStructuralRoleDictionary(memory, []);
  const grammar = memory.ensure(at(2), at(3));
  const interpreter =
    defineStructuralInterpreter(memory, authorityDictionary, grammar, theory);
  const K = memory.ensure(at(4), at(5));
  const FALSE = memory.ensure(at(6), at(7));
  const TRUE = memory.ensure(at(8), at(9));
  const ALL = memory.ensure(at(10), at(11));
  const CHOICE = memory.ensure(at(12), at(13));
  const TOKEN = memory.ensure(at(14), at(15));
  defineTopLevelPublishRule(memory, theory, b, at(20));
  defineVariadicHeadLifecycleRules(memory, theory, b, at(21));
  defineRecursiveAllRules(memory, theory, b, at(22), ALL, FALSE, TRUE);
  defineGroundedUnaryFunctionRule(
    memory, theory, b, at(23), CHOICE, TOKEN, FALSE,
  );
  defineGroundedUnaryFunctionRule(
    memory, theory, b, at(24), CHOICE, TOKEN, TRUE,
  );
  memory.ensure(b.O, memory.ensure(at(25), at(26)));
  memory.ensure(b.C, memory.ensure(at(27), at(28)));
  return Object.freeze({
    memory,
    b,
    theory,
    interpreter,
    K,
    ALL,
    CHOICE,
    TOKEN,
    FALSE,
    TRUE,
    fresh: Object.freeze(fresh),
  });
}
function runBranchSkew(f: Fixture): void {
  const {
    memory,
    b,
    interpreter,
    K,
    ALL,
    CHOICE,
    TOKEN,
    FALSE,
    TRUE,
    fresh,
  } = f;
  const at = (i: number): LinkHandle => {
    const value = fresh[i];
    assert(value !== undefined, "run anchor " + i);
    return value;
  };
  const boundary = rootBoundary(memory, K);
  const choiceCall = call(memory, b, CHOICE, TOKEN);
  const args = argumentChain(memory, [choiceCall, TRUE, TRUE]);
  const initial = memory.ensure(boundary, call(memory, b, ALL, args));
  const initialScope =
    defineV013WorkingScope(memory, at(80), interpreter, [initial]);
  const cursor = new V013CurrentScopeCursor(memory, initialScope);
  const snapshots: LinkHandle[][] = [];
  const matches: number[] = [];
  const transitioned: number[] = [];
  let reactions = 0;
  let firstStableFalseRound = -1;
  let activeSiblingAfterFalse = false;
  while (true) {
    const beforeScope = cursor.currentScope();
    const result = reactV013StructuralScope(memory, cursor, at(81 + reactions));
    if (result.quiescent) {
      same(result.handoffCount, 0, "fixed point has no handoff");
      same(cursor.currentScope(), beforeScope,
        "quiescence keeps exact Scope root");
      break;
    }
    same(result.handoffCount, 1, "one atomic handoff per reaction");
    snapshots.push([...result.nextMembers]);
    matches.push(result.rawRuleMatches);
    transitioned.push(result.transitionedMembers);
    const stableFalse = memory.ensure(K, FALSE);
    if (
      firstStableFalseRound < 0 &&
      result.nextMembers.includes(stableFalse)
    ) {
      firstStableFalseRound = reactions + 1;
      activeSiblingAfterFalse = result.nextMembers.some(
        (member) => member !== stableFalse,
      );
    }
    reactions += 1;
    assert(reactions <= 10, "branch-skew program terminates");
  }
  const stableFalse = memory.ensure(K, FALSE);
  const stableTrue = memory.ensure(K, TRUE);
  sameMembers(cursor.members(), [stableFalse, stableTrue],
    "final fixed point contains both stable Results");
  assert(firstStableFalseRound > 0,
    "FALSE becomes stable before overall completion");
  assert(activeSiblingAfterFalse,
    "unfinished sibling remains current beside stable FALSE");
  same(reactions, 7,
    "VOPEN + CHOICE + VRESUME + skewed ALL reductions + publications");
  same(matches[0]!, 1, "variadic OPEN one Rule");
  same(matches[1]!, 2, "CHOICE fires both Rules");
  same(matches[2]!, 2, "variadic RESUME handles both branches");
  same(matches[3]!, 2, "both ALL branches reduce once");
  same(matches[4]!, 2,
    "FALSE publishes while TRUE branch continues recursively");
  same(matches[5]!, 1,
    "stable FALSE is inert while TRUE reaches DONE");
  same(matches[6]!, 1,
    "stable FALSE is inert while TRUE publishes");
  same(transitioned[4]!, 2,
    "publication and recursive continuation coexist in one reaction");
  same(transitioned[5]!, 1,
    "only unfinished TRUE branch transitions after FALSE stabilized");
  same(transitioned[6]!, 1,
    "only final TRUE publication transitions");
  const falseRound = snapshots[firstStableFalseRound - 1]!;
  assert(falseRound.includes(stableFalse),
    "stable FALSE present at first completion round");
  assert(falseRound.length === 2,
    "stable FALSE coexists with one unfinished sibling");
}
function sourceSlice(
  source: string,
  startNeedle: string,
  endNeedle: string,
): string {
  const start = source.indexOf(startNeedle);
  const end = source.indexOf(endNeedle, start);
  assert(start >= 0 && end > start, "source slice " + startNeedle);
  return source.slice(start, end);
}
function staticGuards(): void {
  const root = resolve(process.cwd(), "..");
  const own = readFileSync(
    join(root, "ts/test/research-v013-branch-skew-strict-matcher-a73d.test.ts"),
    "utf8",
  );
  const runtime = readFileSync(
    join(root, "ts/src/v013-structural-execution.ts"),
    "utf8",
  );
  assert(own.includes('from "../src/v013-structural-execution.js"'),
    "A73d consumes production structural execution");
  const implementation = own.slice(
    0,
    own.indexOf("function staticGuards(): void {"),
  );
  assert(!implementation.includes("function reactV013StructuralScope("),
    "A73d contains no local reaction-kernel implementation");
  for (const forbidden of [
    "ALL",
    "CHOICE",
    "FALSE",
    "TRUE",
    "NOT",
    "RuleKind",
    "opcode",
    "selectedRule",
    "selectedBranch",
    "switch(",
  ]) {
    assert(!runtime.includes(forbidden),
      "production kernel excludes program semantic dispatch: " + forbidden);
  }
  for (const required of [
    "unifyStructuralRuleTemplate(",
    "readExactSequence(",
    "if (images.length === 0)",
    "if (rawRuleMatches === 0)",
    "cursor.switchAtomically(",
  ]) {
    assert(runtime.includes(required),
      "production kernel retains generic law: " + required);
  }
  const a73c = readFileSync(
    join(root, "ts/test/research-v013-promoted-rule-matcher-a73c.test.ts"),
    "utf8",
  );
  assert(a73c.includes("PROMOTED_STRICT_RULE_MATCHER=GREEN_SCOPED_RESEARCH"),
    "A73c strict matcher evidence remains retained");
  const driver = sourceSlice(
    own,
    "function runBranchSkew(",
    "\nfunction sourceSlice(",
  );
  assert(driver.includes("if (result.quiescent)"),
    "driver terminates only at generic quiescence");
  assert(!driver.includes("switch("),
    "driver has no lifecycle scheduler switch");
  const a72r = readFileSync(
    join(root, "ts/test/research-v013-recursive-variadic-all-a72r.test.ts"),
    "utf8",
  );
  assert(a72r.includes("RECURSIVE_VARIADIC_ALL=GREEN_SCOPED_RESEARCH"),
    "A72r recursive variable-arity evidence remains retained");
  const a72s = readFileSync(
    join(root, "ts/test/research-v013-branch-skew-completion-falsifier-a72s.test.ts"),
    "utf8",
  );
  assert(a72s.includes("BRANCH_SKEW_COMPLETION_FALSIFIER=GREEN_SCOPED_RESEARCH"),
    "A72s original skew falsifier remains retained");
  const a72t = readFileSync(
    join(root, "ts/test/research-v013-mixed-scope-early-collapse-a72t.test.ts"),
    "utf8",
  );
  assert(a72t.includes("MIXED_WORKING_SCOPE_EARLY_RESULT_COLLAPSE=GREEN_SCOPED_RESEARCH"),
    "A72t mixed-scope repair remains retained");
  const a72u = readFileSync(
    join(root, "ts/test/research-v013-dual-tree-result-slots-a72u.test.ts"),
    "utf8",
  );
  assert(a72u.includes("DUAL_TREE_SINGLE_ASSIGNMENT_RESULT_SLOTS=GREEN_SCOPED_RESEARCH"),
    "A72u hierarchical Result evidence remains retained");
}
function main(): void {
  const f = buildFixture();
  runBranchSkew(f);
  staticGuards();
  console.log([
    "MTS v0.13 A73d: BRANCH_SKEW_STRICT_MATCHER=GREEN_SCOPED_RESEARCH",
    "PROGRAM=ALL_OF_CHOICE_TRUE_TRUE",
    "REACTION_KERNEL=PRODUCTION_V013_STRUCTURAL_EXECUTION",
    "A73D_LOCAL_RUNTIME=0",
    "RULE_MATCHER=A73C_SELF_INCIDENCE_PRESERVING",
    "VARIADIC_HEAD_OPEN=RULE_DRIVEN",
    "VARIADIC_HEAD_RESUME=RULE_DRIVEN",
    "RECURSIVE_VARIABLE_ARITY_ALL=RULE_DRIVEN",
    "EARLY_FALSE_PUBLICATION=RULE_DRIVEN",
    "STABLE_FALSE_SURVIVES_UNFINISHED_TRUE_SIBLING=TRUE",
    "GLOBAL_BRANCH_BARRIER=0",
    "DRIVER=REPEAT_GENERIC_REACTION_UNTIL_QUIESCENCE",
    "FINAL_RESULTS=FALSE_AND_TRUE",
    "FINAL_SCOPE=QUIESCENT_FIXED_POINT",
    "CURRENT_SCOPE_ROOT=OPAQUE_AMEMORY_SUBSTRATE_HANDLE",
    "ATOMIC_SCOPE_HANDOFF=AMEMORY_SUBSTRATE_COMMIT",
    "HIERARCHICAL_RESULT_RESEARCH=DEFERRED_RETAINS_A72U_A72V",
    "V013_NOT_ACCEPTED ACCEPTED_RUNTIME_UNCHANGED",
  ].join(" "));
}
main();
