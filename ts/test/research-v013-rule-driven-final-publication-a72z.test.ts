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
  if (!c) throw new Error("v0.13 A72z rule-driven final publication: " + m);
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

/**
 * Opaque A-memory current-root.
 *
 * It has no knowledge of functions, Rules, lifecycle, CALL/DONE/FRAME,
 * Contexts, Results or arity.
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

/**
 * Explicit top-level execution boundary.
 *
 * The nested caller frame is START-shaped. The root boundary is END-shaped,
 * so RESUME and final PUBLISH are structurally distinct without a host
 * "is top level?" branch.
 */
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

/**
 * Rule discovery uses only the structural tag at the current endpoint:
 *
 *   active = caller -> endpoint
 *   triggerKey = start(endpoint)
 *
 * CALL uses O, DONE uses C. The reaction kernel itself does not know either.
 */
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

/**
 * Single generalized reaction law.
 *
 * - no matching Rule: preserve the member;
 * - one or more matching Rules: union every Link-native output bundle;
 * - canonical Link identity removes duplicates;
 * - no matches anywhere: fixed point, no Scope handoff;
 * - otherwise publish the complete successor image with one opaque handoff.
 *
 * This function contains no lifecycle branch. OPEN, RESUME and PUBLISH are
 * ordinary admitted structural Rules below.
 */
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
  // OPEN:
  // caller -> CALL(F, CALL(G,X))
  // ----------------------------
  // FRAME(caller,F) -> CALL(G,X)
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

  // RESUME:
  // FRAME(parent,F) -> DONE(V)
  // --------------------------
  // parent -> CALL(F,V)
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

  // PUBLISH:
  // END(K) -> DONE(V)
  // -----------------
  // K -> V
  //
  // END(K) distinguishes the top-level boundary from START continuation
  // frames structurally. No host top-level test is needed.
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

interface Fixture {
  readonly memory: Memory;
  readonly b: RootBasis;
  readonly theory: LinkHandle;
  readonly interpreter: LinkHandle;
  readonly K: LinkHandle;
  readonly NOT: LinkHandle;
  readonly FALSE: LinkHandle;
  readonly TRUE: LinkHandle;
  readonly lifecycle: LifecycleRules;
  readonly fresh: readonly LinkHandle[];
}

function buildFixture(): Fixture {
  const memory = new Memory();
  const b = ensureRootBasis(memory);

  let seed = memory.ensure(b.U, b.L);
  const fresh: LinkHandle[] = [];
  for (let i = 0; i < 300; i += 1) {
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
  assert(!isFrame(memory, K), "stable Result root is not a continuation frame");

  const FALSE = memory.ensure(at(6), at(7));
  const TRUE = memory.ensure(at(8), at(9));
  const NOT = memory.ensure(at(10), at(11));

  const lifecycle =
    defineUnaryLifecycleRules(memory, theory, b, at(20));

  defineGroundedUnaryFunctionRule(
    memory, theory, b, at(21), NOT, FALSE, TRUE,
  );
  defineGroundedUnaryFunctionRule(
    memory, theory, b, at(22), NOT, TRUE, FALSE,
  );

  // Trigger-key noise must remain inert after structural unification.
  memory.ensure(b.O, memory.ensure(at(23), at(24)));
  memory.ensure(b.C, memory.ensure(at(25), at(26)));

  return Object.freeze({
    memory,
    b,
    theory,
    interpreter,
    K,
    NOT,
    FALSE,
    TRUE,
    lifecycle,
    fresh: Object.freeze(fresh),
  });
}

function nestedNot(
  memory: Memory,
  b: RootBasis,
  NOT: LinkHandle,
  value: LinkHandle,
  depth: number,
): LinkHandle {
  assert(depth >= 1, "positive NOT nesting depth");
  let current = value;
  for (let i = 0; i < depth; i += 1) {
    current = call(memory, b, NOT, current);
  }
  return current;
}

function expectedNot(
  input: LinkHandle,
  FALSE: LinkHandle,
  TRUE: LinkHandle,
  depth: number,
): LinkHandle {
  let value = input;
  for (let i = 0; i < depth; i += 1) {
    value = value === TRUE ? FALSE : TRUE;
  }
  return value;
}

function activeCaller(memory: Memory, active: LinkHandle): LinkHandle {
  return memory.poles(active).start;
}

function runNestedCase(
  f: Fixture,
  input: LinkHandle,
  depth: number,
  seedBase: number,
): void {
  const {
    memory,
    b,
    interpreter,
    K,
    NOT,
    FALSE,
    TRUE,
    fresh,
  } = f;
  const at = (i: number): LinkHandle => {
    const value = fresh[i];
    assert(value !== undefined, "run fresh anchor " + i);
    return value;
  };

  const expected = expectedNot(input, FALSE, TRUE, depth);
  const boundary = rootBoundary(memory, K);
  const program = nestedNot(memory, b, NOT, input, depth);
  const initial = memory.ensure(boundary, program);
  const initialScope =
    defineWorkingScope(memory, at(seedBase), interpreter, [initial]);
  const cursor = new CurrentScopeCursor(memory, initialScope);

  let reactionCount = 0;
  let maxFrameDepth = 0;
  let publicationCount = 0;
  let finalQuiescentScope: LinkHandle | undefined;

  while (true) {
    const beforeScope = cursor.currentScope();
    const beforeMembers = cursor.members();
    same(beforeMembers.length, 1, "deterministic working cardinality");

    const caller = activeCaller(memory, beforeMembers[0]!);
    if (caller === boundary || isFrame(memory, caller)) {
      maxFrameDepth = Math.max(
        maxFrameDepth,
        frameDepthTo(memory, caller, boundary),
      );
    }

    const result = reactScope(
      memory,
      cursor,
      at(seedBase + 1 + reactionCount),
    );

    if (result.quiescent) {
      same(result.handoffCount, 0, "quiescence performs no handoff");
      same(cursor.currentScope(), beforeScope,
        "quiescence keeps exact Scope root");
      finalQuiescentScope = beforeScope;
      break;
    }

    same(result.handoffCount, 1, "reaction performs one atomic handoff");
    same(result.rawRuleMatches, 1,
      "deterministic nested NOT has one structural Rule match");
    same(result.transitionedMembers, 1,
      "one current member participates in each reaction");
    same(result.nextMembers.length, 1,
      "one deterministic successor per reaction");

    const publishBefore =
      memory.ensure(boundary, done(memory, b, expected));
    const publishAfter = memory.ensure(K, expected);
    if (
      result.oldMembers.length === 1 &&
      result.oldMembers[0] === publishBefore
    ) {
      sameMembers(result.nextMembers, [publishAfter],
        "PUBLISH Rule emits exact stable K -> value");
      publicationCount += 1;
    }

    reactionCount += 1;
    assert(reactionCount <= depth * 3 + 4,
      "nested execution reaches structural fixed point");
  }

  const stable = memory.ensure(K, expected);
  sameMembers(cursor.members(), [stable],
    "fixed point is exact stable Result");
  assert(finalQuiescentScope !== undefined, "quiescent Scope observed");
  same(cursor.currentScope(), finalQuiescentScope,
    "final fixed-point Scope identity remains stable");

  same(publicationCount, 1,
    "exactly one Rule-driven top-level publication occurs");
  same(maxFrameDepth, depth - 1,
    "temporary frame depth tracks unresolved nested calls");
  same(
    reactionCount,
    depth + 2 * (depth - 1) + 1,
    "reactions = function evaluations + OPEN/RESUME + PUBLISH",
  );

  // Historical execution scaffold remains physically readable but is not
  // current. The stable Result itself carries no execution boundary wrapper.
  assert(!cursor.members().includes(initial),
    "initial execution member is not current after completion");
  assert(!cursor.members().includes(memory.ensure(boundary, done(memory, b, expected))),
    "terminal boundary/DONE scaffold is not current after PUBLISH");
}

function exercise(): void {
  const f = buildFixture();

  runNestedCase(f, f.TRUE, 1, 80);
  runNestedCase(f, f.TRUE, 2, 110);
  runNestedCase(f, f.FALSE, 2, 140);
  runNestedCase(f, f.TRUE, 3, 170);
}

function staticGuards(): void {
  const root = resolve(process.cwd(), "..");
  const own = readFileSync(
    join(
      root,
      "ts/test/research-v013-rule-driven-final-publication-a72z.test.ts",
    ),
    "utf8",
  );

  const kernelStart = own.indexOf("function reactScope(");
  const kernelEnd = own.indexOf(
    "\nfunction admitTaggedBundleRule(",
    kernelStart,
  );
  assert(kernelStart >= 0 && kernelEnd > kernelStart,
    "reaction kernel source slice");
  const kernel = own.slice(kernelStart, kernelEnd);

  for (const forbidden of [
    "rootBoundary",
    "frame(",
    "call(",
    "done(",
    "b.O",
    "b.C",
    "NOT",
    "publish",
    "resume",
    "open",
    "RuleKind",
    "opcode",
    "selectedRule",
    "switch(",
    "readContext",
    "StateError",
  ]) {
    assert(!kernel.includes(forbidden),
      "generic reaction kernel excludes lifecycle semantics: " + forbidden);
  }

  assert(kernel.includes("if (images.length === 0)"),
    "no-match preservation comes from generic A72y law");
  assert(kernel.includes("addNext(active)"),
    "inert current member survives unchanged");
  assert(kernel.includes("readExactSequence"),
    "Rule image is a Link-native successor bundle");
  assert(kernel.includes("if (rawRuleMatches === 0)"),
    "quiescence is generic absence of applicable transition");
  same(
    kernel.split("cursor.switchAtomically(").length - 1,
    1,
    "reaction source contains one atomic publication site",
  );

  const runStart = own.indexOf("function runNestedCase(");
  const runEnd = own.indexOf("\nfunction exercise()", runStart);
  assert(runStart >= 0 && runEnd > runStart, "driver source slice");
  const driver = own.slice(runStart, runEnd);
  const loopStart = driver.indexOf("while (true)");
  const loopEnd = driver.indexOf("\n  const stable =", loopStart);
  assert(loopStart >= 0 && loopEnd > loopStart, "fixed-point loop slice");
  const loop = driver.slice(loopStart, loopEnd);

  assert(loop.includes("if (result.quiescent)"),
    "driver terminates only on generic quiescence");
  assert(!loop.includes("ep.start"),
    "driver has no DONE-tag terminal branch");
  assert(!loop.includes("caller === K"),
    "driver has no host top-level completion branch");

  const lifecycleStart = own.indexOf("function defineUnaryLifecycleRules(");
  const lifecycleEnd = own.indexOf(
    "\nfunction defineGroundedUnaryFunctionRule(",
    lifecycleStart,
  );
  assert(lifecycleStart >= 0 && lifecycleEnd > lifecycleStart,
    "lifecycle rules source slice");
  const lifecycle = own.slice(lifecycleStart, lifecycleEnd);
  for (const required of [
    "const open =",
    "const resume =",
    "const publish =",
    "rootBoundary(memory, kPublish)",
  ]) {
    assert(lifecycle.includes(required),
      "lifecycle topology includes " + required);
  }
  assert(!lifecycle.includes("NOT"),
    "OPEN/RESUME/PUBLISH are concrete-function agnostic");

  const implementation =
    own.slice(0, own.indexOf("function staticGuards(): void {"));
  assert(
    !implementation.includes('from "../src/state.js"'),
    "A72z imports no host Context/state interpreter",
  );

  const a72x = readFileSync(
    join(root, "ts/test/research-v013-rule-driven-unary-context-a72x.test.ts"),
    "utf8",
  );
  assert(a72x.includes("RULE_DRIVEN_UNARY_CONTEXT_LIFECYCLE=GREEN_SCOPED_RESEARCH"),
    "A72x OPEN/RESUME evidence remains retained");

  const a72y = readFileSync(
    join(root, "ts/test/research-v013-explicit-zero-image-a72y.test.ts"),
    "utf8",
  );
  assert(a72y.includes("EXPLICIT_ZERO_IMAGE_AND_QUIESCENCE=GREEN_SCOPED_RESEARCH"),
    "A72y zero-image/quiescence evidence remains retained");

  const a72u = readFileSync(
    join(root, "ts/test/research-v013-dual-tree-result-slots-a72u.test.ts"),
    "utf8",
  );
  assert(a72u.includes("DUAL_TREE_SINGLE_ASSIGNMENT_RESULT_SLOTS=GREEN_SCOPED_RESEARCH"),
    "A72u deferred hierarchical Result evidence remains retained");
}

function main(): void {
  exercise();
  staticGuards();

  console.log([
    "MTS v0.13 A72z: RULE_DRIVEN_FINAL_PUBLICATION=GREEN_SCOPED_RESEARCH",
    "BASE=A72X_OPEN_RESUME_PLUS_A72Y_QUIESCENCE",
    "ROOT_EXECUTION_BOUNDARY=END_OF_K",
    "OPEN_RULE=GENERIC_STRUCTURAL",
    "RESUME_RULE=GENERIC_STRUCTURAL",
    "PUBLISH_RULE=GENERIC_STRUCTURAL",
    "TOP_LEVEL_TEST_IN_KERNEL=0",
    "TOP_LEVEL_TEST_IN_DRIVER=0",
    "HOST_FINAL_PUBLICATION_HELPER=0",
    "HOST_DONE_TERMINAL_BRANCH=0",
    "HOST_CONTEXT_CLASSIFIER=0",
    "HOST_RESULT_CLASSIFIER=0",
    "HOST_FUNCTION_DISPATCH=0",
    "HOST_LIFECYCLE_DISPATCH=0",
    "HOST_THEORY_ARGUMENT=0",
    "DRIVER=REPEAT_ONE_GENERIC_REACTION_UNTIL_QUIESCENCE",
    "DEPTH1_NOT=GREEN",
    "DEPTH2_NOT=GREEN",
    "DEPTH3_NOT=GREEN",
    "FINAL_CURRENT_MEMBER=STABLE_K_TO_VALUE",
    "FINAL_SCOPE=QUIESCENT_FIXED_POINT",
    "CURRENT_SCOPE_ROOT=OPAQUE_AMEMORY_SUBSTRATE_HANDLE",
    "ATOMIC_SCOPE_HANDOFF=AMEMORY_SUBSTRATE_COMMIT",
    "MULTIVALUED_NESTED_LIFECYCLE=DEFERRED_RETAINS_A72P_A72T",
    "HIERARCHICAL_RESULT_RESEARCH=DEFERRED_RETAINS_A72U_A72V",
    "FULL_V013_SELF_HOSTED=NOT_YET_CLAIMED",
    "V013_NOT_ACCEPTED PRODUCTION_UNCHANGED",
  ].join(" "));
}

main();
