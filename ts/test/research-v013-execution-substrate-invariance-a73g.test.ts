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
  if (!c) throw new Error("v0.13 A73g execution substrate invariance: " + m);
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

function defineUnaryRule(
  memory: Memory,
  theory: LinkHandle,
  b: RootBasis,
  seed: LinkHandle,
  fn: LinkHandle,
  input: LinkHandle,
  output: LinkHandle,
): void {
  const callerRole = memory.ensure(seed, b.O);
  const before = memory.ensure(
    callerRole,
    call(memory, b, fn, input),
  );
  const after = memory.ensure(
    callerRole,
    done(memory, b, output),
  );
  admitTaggedBundleRule(
    memory,
    theory,
    b.O,
    [callerRole],
    before,
    [after],
  );
}

interface RunResult {
  readonly initialScope: LinkHandle;
  readonly finalScope: LinkHandle;
  readonly finalMembers: readonly LinkHandle[];
  readonly reactionCount: number;
  readonly handoffCount: number;
  readonly firstRawRuleMatches: number;
  readonly firstTransitionedMembers: number;
}

function runToFixedPoint(
  memory: Memory,
  interpreter: LinkHandle,
  initialSeed: LinkHandle,
  nextSeeds: readonly LinkHandle[],
  initialMembers: readonly LinkHandle[],
): RunResult {
  const initialScope =
    defineV013WorkingScope(memory, initialSeed, interpreter, initialMembers);
  const cursor = new V013CurrentScopeCursor(memory, initialScope);
  let reactionCount = 0;
  let handoffCount = 0;
  let firstRawRuleMatches = -1;
  let firstTransitionedMembers = -1;

  for (const nextSeed of nextSeeds) {
    const reaction = reactV013StructuralScope(memory, cursor, nextSeed);
    reactionCount += 1;
    handoffCount += reaction.handoffCount;
    if (reactionCount === 1) {
      firstRawRuleMatches = reaction.rawRuleMatches;
      firstTransitionedMembers = reaction.transitionedMembers;
    }
    if (reaction.quiescent) {
      return Object.freeze({
        initialScope,
        finalScope: cursor.currentScope(),
        finalMembers: cursor.members(),
        reactionCount,
        handoffCount,
        firstRawRuleMatches,
        firstTransitionedMembers,
      });
    }
  }

  throw new Error("v0.13 A73g execution substrate invariance: fixed point not reached");
}

function exercise(): void {
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

  const authorityDictionary = defineStructuralRoleDictionary(memory, []);
  const grammar = memory.ensure(at(0), at(1));

  const theoryA = memory.ensure(at(2), at(3));
  const theoryB = memory.ensure(at(4), at(5));
  const interpreterA =
    defineStructuralInterpreter(memory, authorityDictionary, grammar, theoryA);
  const interpreterB =
    defineStructuralInterpreter(memory, authorityDictionary, grammar, theoryB);

  const caller = memory.ensure(at(6), at(7));
  const fn = memory.ensure(at(8), at(9));
  const token = memory.ensure(at(10), at(11));
  const y = memory.ensure(at(12), at(13));
  const z = memory.ensure(at(14), at(15));

  // Same extensional Rule set, opposite physical admission order.
  defineUnaryRule(memory, theoryA, b, at(20), fn, token, y);
  defineUnaryRule(memory, theoryA, b, at(21), fn, token, z);
  defineUnaryRule(memory, theoryB, b, at(22), fn, token, z);
  defineUnaryRule(memory, theoryB, b, at(23), fn, token, y);

  const active = memory.ensure(caller, call(memory, b, fn, token));
  const inert = memory.ensure(at(24), b.C);
  const expectedY = memory.ensure(caller, done(memory, b, y));
  const expectedZ = memory.ensure(caller, done(memory, b, z));
  const expected = [expectedY, expectedZ, inert] as const;

  // A/B share one Theory and differ only in initial member enumeration and
  // opaque Scope identities. C also uses the same extensional Rules admitted
  // in reverse order under another Theory identity.
  const a = runToFixedPoint(
    memory,
    interpreterA,
    at(40),
    [at(41), at(42), at(43)],
    [active, inert],
  );
  const bRun = runToFixedPoint(
    memory,
    interpreterA,
    at(50),
    [at(51), at(52), at(53)],
    [inert, active],
  );
  const c = runToFixedPoint(
    memory,
    interpreterB,
    at(60),
    [at(61), at(62), at(63)],
    [inert, active],
  );

  for (const [label, result] of [
    ["A", a],
    ["B", bRun],
    ["C", c],
  ] as const) {
    sameMembers(result.finalMembers, expected, label + " fixed-point members");
    same(result.reactionCount, 2, label + " reaction count");
    same(result.handoffCount, 1, label + " atomic handoff count");
    same(result.firstRawRuleMatches, 2, label + " all matching Rules fire");
    same(result.firstTransitionedMembers, 1,
      label + " only the active member transitions");
    assert(result.finalMembers.includes(inert),
      label + " inert sibling is preserved");
  }

  sameMembers(a.finalMembers, bRun.finalMembers,
    "member order and Scope seed do not change extensional fixed point");
  sameMembers(a.finalMembers, c.finalMembers,
    "Rule admission order and Theory identity with same Rule set do not change extensional fixed point");

  assert(a.initialScope !== bRun.initialScope,
    "distinct initial Scope seeds yield distinct current-root identities");
  assert(a.finalScope !== bRun.finalScope,
    "distinct successor Scope seeds yield distinct final current-root identities");
  assert(a.finalScope !== c.finalScope,
    "distinct execution carriers may converge extensionally without Scope identity convergence");
}

function staticGuards(): void {
  const root = resolve(process.cwd(), "..");
  const runtime = readFileSync(
    join(root, "ts/src/v013-structural-execution.ts"),
    "utf8",
  );

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
    "readContext",
  ]) {
    assert(!runtime.includes(forbidden),
      "production execution kernel excludes program semantic dispatch: " + forbidden);
  }

  const cursorStart = runtime.indexOf("export class V013CurrentScopeCursor");
  const cursorEnd = runtime.indexOf("\nexport interface V013GroundedRuleImage", cursorStart);
  assert(cursorStart >= 0 && cursorEnd > cursorStart, "cursor source slice");
  const cursor = runtime.slice(cursorStart, cursorEnd);
  assert(cursor.includes("this.scope = next"),
    "current-root substrate performs one opaque mutable assignment");
  for (const forbidden of [
    ".ensure(",
    ".poles(",
    ".outgoing(",
    "readStructuralRule",
    "unifyStructuralRuleTemplate",
  ]) {
    assert(!cursor.includes(forbidden),
      "current-root cursor contains no semantic inspection/write: " + forbidden);
  }

  const prior = readFileSync(
    join(root, "ts/test/research-v013-append-only-currentness-falsifier-a72n.test.ts"),
    "utf8",
  );
  assert(prior.includes("PLAIN_APPEND_ONLY_CURRENT_BINDING_IS_INSUFFICIENT"),
    "A72n append-only currentness falsifier remains retained");
  assert(prior.includes(
    "MINIMUM_BOUNDARY=MUTABLE_CURRENTNESS_OR_EXTERNAL_ROOT_OR_EXPLICIT_LIFECYCLE_SEMANTICS",
  ), "A72n minimum currentness boundary remains retained");
}

function main(): void {
  exercise();
  staticGuards();

  console.log([
    "MTS v0.13 A73g: EXECUTION_SUBSTRATE_INVARIANCE=GREEN_SCOPED_RESEARCH",
    "INITIAL_MEMBER_ORDER=EXTENSIONALLY_INERT",
    "RULE_ADMISSION_ORDER=EXTENSIONALLY_INERT",
    "SCOPE_SEED_IDENTITY=EXTENSIONALLY_INERT",
    "DISTINCT_CURRENT_ROOTS_SAME_FIXED_POINT=GREEN",
    "ALL_MATCHING_RULES_FIRE=TRUE",
    "NO_MATCH_MEMBER_PRESERVED=TRUE",
    "CURRENT_SCOPE_CURSOR=OPAQUE_MUTABLE_AMEMORY_SUBSTRATE",
    "CURSOR_SEMANTIC_INSPECTION=0",
    "CURSOR_LINK_WRITES=0",
    "PROGRAM_SEMANTIC_DISPATCH_IN_HOST_KERNEL=0",
    "PROGRAM_SEMANTIC_AUTHORITY=LINK_CARRIED_RULES",
    "GENERIC_RULE_MATCHING_AND_INSTANTIATION=HOST_EXECUTED_RESIDUAL",
    "FULL_SELF_HOSTED=NOT_YET_CLAIMED",
    "HIERARCHICAL_RESULT_RESEARCH=DEFERRED_RETAINS_A72U_A72V",
    "V013_NOT_ACCEPTED ACCEPTED_RUNTIME_UNCHANGED",
  ].join(" "));
}

main();
