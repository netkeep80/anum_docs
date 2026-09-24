import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  materializeExactSequence,
  readExactSequence,
} from "../src/exact-sequence.js";
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
  readStructuralInterpreter,
  readStructuralRoleDictionary,
  readStructuralRule,
  StructuralRuleError,
  verifyStructuralRuleAdmission,
  type StructuralRoleBinding,
} from "../src/structural-rule.js";
import { unifyStructuralTemplate } from "../src/structural-unification.js";
function assert(c: unknown, m: string): asserts c {
  if (!c) throw new Error("v0.13 A73b branch skew fixed point: " + m);
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
interface WorkingScopeAuthority {
  readonly interpreter: LinkHandle;
  readonly theory: LinkHandle;
}
function defineWorkingScope(
  memory: Memory,
  seed: LinkHandle,
  interpreter: LinkHandle,
  members: readonly LinkHandle[],
): LinkHandle {
  const descriptor = memory.ensure(seed, interpreter);
  const scope = memory.ensureStartSelfClosed(descriptor);
  for (const member of members) memory.ensure(scope, member);
  return scope;
}
function readWorkingScopeAuthority(
  memory: Memory,
  scope: LinkHandle,
): WorkingScopeAuthority {
  const header = memory.poles(scope);
  assert(
    header.start === scope && header.end !== scope,
    "working scope must have START shape",
  );
  const descriptor = memory.poles(header.end);
  const interpreter = descriptor.end;
  const structure = readStructuralInterpreter(memory, interpreter);
  return Object.freeze({
    interpreter,
    theory: structure.theory,
  });
}
function readWorkingScope(
  memory: Memory,
  scope: LinkHandle,
): readonly LinkHandle[] {
  readWorkingScopeAuthority(memory, scope);
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
    same(this.scope, expectedOld, "scope handoff old root");
    this.scope = next;
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
function frame(
  memory: Memory,
  parent: LinkHandle,
  fn: LinkHandle,
): LinkHandle {
  return memory.ensureStartSelfClosed(memory.ensure(parent, fn));
}
function rootBoundary(
  memory: Memory,
  rootCaller: LinkHandle,
): LinkHandle {
  return memory.ensureEndSelfClosed(rootCaller);
}
function isFrame(memory: Memory, value: LinkHandle): boolean {
  const p = memory.poles(value);
  return p.start === value && p.end !== value;
}
function frameDepthTo(
  memory: Memory,
  current: LinkHandle,
  root: LinkHandle,
): number {
  let depth = 0;
  let cursor = current;
  const seen = new Set<LinkHandle>();
  while (cursor !== root) {
    assert(!seen.has(cursor), "frame ancestry cycle");
    seen.add(cursor);
    assert(isFrame(memory, cursor), "non-root caller is START frame");
    const payload = memory.poles(memory.poles(cursor).end);
    cursor = payload.start;
    depth += 1;
  }
  return depth;
}
interface GroundedRuleImage {
  readonly outputBundleTemplate: LinkHandle;
  readonly bindings: readonly StructuralRoleBinding[];
}
function discoverTaggedRuleImages(
  memory: Memory,
  theory: LinkHandle,
  active: LinkHandle,
): readonly GroundedRuleImage[] {
  const endpoint = memory.poles(active).end;
  const triggerKey = memory.poles(endpoint).start;
  const matches: GroundedRuleImage[] = [];
  for (const trigger of memory.outgoing(triggerKey)) {
    if (trigger === triggerKey) continue;
    const tp = memory.poles(trigger);
    if (tp.start !== triggerKey) continue;
    const admission = tp.end;
    const ap = memory.poles(admission);
    if (ap.start !== theory || ap.end === admission) continue;
    try {
      const rule = ap.end;
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
        outputBundleTemplate: body.end,
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
interface ScopeReaction {
  readonly oldScope: LinkHandle;
  readonly nextScope: LinkHandle;
  readonly oldMembers: readonly LinkHandle[];
  readonly nextMembers: readonly LinkHandle[];
  readonly rawRuleMatches: number;
  readonly transitionedMembers: number;
  readonly quiescent: boolean;
  readonly handoffCount: 0 | 1;
}
function reactScope(
  memory: Memory,
  cursor: CurrentScopeCursor,
  nextScopeSeed: LinkHandle,
): ScopeReaction {
  const oldScope = cursor.currentScope();
  const authority = readWorkingScopeAuthority(memory, oldScope);
  const before = cursor.members();
  assert(before.length > 0, "reaction requires non-empty current scope");
  const nextMembers: LinkHandle[] = [];
  const addNext = (link: LinkHandle): void => {
    if (!nextMembers.includes(link)) nextMembers.push(link);
  };
  let rawRuleMatches = 0;
  let transitionedMembers = 0;
  for (const active of before) {
    const images =
      discoverTaggedRuleImages(memory, authority.theory, active);
    if (images.length === 0) {
      addNext(active);
      continue;
    }
    transitionedMembers += 1;
    for (const image of images) {
      rawRuleMatches += 1;
      const groundedBundle = instantiateTemplate(
        memory,
        image.outputBundleTemplate,
        image.bindings,
      );
      const outputs = readExactSequence(memory, groundedBundle).values;
      for (const successor of outputs) addNext(successor);
      same(
        cursor.currentScope(),
        oldScope,
        "old Scope remains current during successor derivation",
      );
      sameMembers(
        cursor.members(),
        before,
        "partial successor image never becomes current",
      );
    }
  }
  if (rawRuleMatches === 0) {
    sameMembers(nextMembers, before, "quiescent Scope is preserved exactly");
    return Object.freeze({
      oldScope,
      nextScope: oldScope,
      oldMembers: before,
      nextMembers: Object.freeze(nextMembers),
      rawRuleMatches,
      transitionedMembers,
      quiescent: true,
      handoffCount: 0,
    });
  }
  const nextScope = defineWorkingScope(
    memory,
    nextScopeSeed,
    authority.interpreter,
    nextMembers,
  );
  cursor.switchAtomically(oldScope, nextScope);
  return Object.freeze({
    oldScope,
    nextScope,
    oldMembers: before,
    nextMembers: Object.freeze(nextMembers),
    rawRuleMatches,
    transitionedMembers,
    quiescent: false,
    handoffCount: 1,
  });
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
interface LifecycleRules {
  readonly open: LinkHandle;
  readonly resume: LinkHandle;
  readonly publish: LinkHandle;
}
function defineUnaryLifecycleRules(
  memory: Memory,
  theory: LinkHandle,
  b: RootBasis,
  seed: LinkHandle,
): LifecycleRules {
  const kOpen = memory.ensure(seed, b.O);
  const fOpen = memory.ensure(seed, b.C);
  const gOpen = memory.ensure(seed, b.L);
  const xOpen = memory.ensure(seed, b.U);
  const inner = call(memory, b, gOpen, xOpen);
  const outer = call(memory, b, fOpen, inner);
  const openBefore = memory.ensure(kOpen, outer);
  const openAfter =
    memory.ensure(frame(memory, kOpen, fOpen), inner);
  const open = admitTaggedBundleRule(
    memory,
    theory,
    b.O,
    [kOpen, fOpen, gOpen, xOpen],
    openBefore,
    [openAfter],
  );
  const kResume = memory.ensure(seed, memory.ensure(b.O, b.L));
  const fResume = memory.ensure(seed, memory.ensure(b.C, b.U));
  const vResume = memory.ensure(seed, memory.ensure(b.L, b.O));
  const resumeBefore = memory.ensure(
    frame(memory, kResume, fResume),
    done(memory, b, vResume),
  );
  const resumeAfter = memory.ensure(
    kResume,
    call(memory, b, fResume, vResume),
  );
  const resume = admitTaggedBundleRule(
    memory,
    theory,
    b.C,
    [kResume, fResume, vResume],
    resumeBefore,
    [resumeAfter],
  );
  const kPublish = memory.ensure(seed, memory.ensure(b.U, b.C));
  const vPublish = memory.ensure(seed, memory.ensure(b.L, b.C));
  const publishBefore = memory.ensure(
    rootBoundary(memory, kPublish),
    done(memory, b, vPublish),
  );
  const publishAfter = memory.ensure(kPublish, vPublish);
  const publish = admitTaggedBundleRule(
    memory,
    theory,
    b.C,
    [kPublish, vPublish],
    publishBefore,
    [publishAfter],
  );
  return Object.freeze({ open, resume, publish });
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
    defineWorkingScope(memory, at(80), interpreter, [initial]);
  const cursor = new CurrentScopeCursor(memory, initialScope);
  const snapshots: LinkHandle[][] = [];
  const matches: number[] = [];
  const transitioned: number[] = [];
  let reactions = 0;
  let firstStableFalseRound = -1;
  let activeSiblingAfterFalse = false;
  while (true) {
    const beforeScope = cursor.currentScope();
    const result = reactScope(memory, cursor, at(81 + reactions));
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
    join(root, "ts/test/research-v013-branch-skew-fixedpoint-a73b.test.ts"),
    "utf8",
  );
  const a73a = readFileSync(
    join(root, "ts/test/research-v013-nested-multivalued-a73a.test.ts"),
    "utf8",
  );
  const ownKernel = sourceSlice(
    own,
    "function reactScope(",
    "\nfunction admitTaggedBundleRule(",
  );
  const priorKernel = sourceSlice(
    a73a,
    "function reactScope(",
    "\nfunction admitTaggedBundleRule(",
  );
  same(ownKernel, priorKernel,
    "A73b uses source-identical A73a/A72z reaction kernel");
  for (const forbidden of [
    "ALL",
    "CHOICE",
    "selectedRule",
    "selectedBranch",
    "Context",
    "Result",
    "switch(",
  ]) {
    assert(!ownKernel.includes(forbidden),
      "kernel excludes branch-skew program semantics: " + forbidden);
  }
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
    "MTS v0.13 A73b: BRANCH_SKEW_FIXED_POINT_LIFECYCLE=GREEN_SCOPED_RESEARCH",
    "PROGRAM=ALL_OF_CHOICE_TRUE_TRUE",
    "REACTION_KERNEL=A73A_A72Z_SOURCE_IDENTICAL",
    "VARIADIC_HEAD_OPEN=RULE_DRIVEN",
    "VARIADIC_HEAD_RESUME=RULE_DRIVEN",
    "RECURSIVE_VARIABLE_ARITY_ALL=RULE_DRIVEN",
    "EARLY_FALSE_PUBLICATION=RULE_DRIVEN",
    "STABLE_FALSE_SURVIVES_UNFINISHED_TRUE_SIBLING=TRUE",
    "GLOBAL_BRANCH_BARRIER=0",
    "HOST_CONTEXT_CLASSIFIER=0",
    "HOST_RESULT_CLASSIFIER=0",
    "HOST_SELECTED_BRANCH=0",
    "HOST_SELECTED_RULE=0",
    "HOST_LIFECYCLE_DISPATCH=0",
    "HOST_VARIABLE_ARITY_DISPATCH=0",
    "DRIVER=REPEAT_GENERIC_REACTION_UNTIL_QUIESCENCE",
    "FINAL_RESULTS=FALSE_AND_TRUE",
    "FINAL_SCOPE=QUIESCENT_FIXED_POINT",
    "CURRENT_SCOPE_ROOT=OPAQUE_AMEMORY_SUBSTRATE_HANDLE",
    "ATOMIC_SCOPE_HANDOFF=AMEMORY_SUBSTRATE_COMMIT",
    "HIERARCHICAL_RESULT_RESEARCH=DEFERRED_RETAINS_A72U_A72V",
    "V013_NOT_ACCEPTED PRODUCTION_UNCHANGED",
  ].join(" "));
}
main();
