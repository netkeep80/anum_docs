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
  if (!c) throw new Error("v0.13 A72z unary quiescence: " + m);
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
    "working scope START shape",
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
    assert(isFrame(memory, cursor), "non-root caller must be START frame");
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

function reactExecutionScope(
  memory: Memory,
  cursor: CurrentScopeCursor,
  nextScopeSeed: LinkHandle,
): ScopeReaction {
  const oldScope = cursor.currentScope();
  const authority = readWorkingScopeAuthority(memory, oldScope);
  const before = cursor.members();
  assert(before.length > 0, "reaction requires current members");

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
      for (const successor of readExactSequence(memory, groundedBundle).values) {
        addNext(successor);
      }

      same(cursor.currentScope(), oldScope,
        "old Scope stays current during derivation");
      sameMembers(cursor.members(), before,
        "partial successor bundle is never current");
    }
  }

  if (rawRuleMatches === 0) {
    sameMembers(nextMembers, before, "quiescent state preserved exactly");
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

function admitBundleRule(
  memory: Memory,
  theory: LinkHandle,
  triggerKey: LinkHandle,
  roles: readonly LinkHandle[],
  before: LinkHandle,
  outputs: readonly LinkHandle[],
): LinkHandle {
  const dictionary = defineStructuralRoleDictionary(memory, roles);
  const outputBundle = materializeExactSequence(memory, outputs);
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
  const openBefore = memory.ensure(
    kOpen,
    call(memory, b, fOpen, inner),
  );
  const openAfter = memory.ensure(
    frame(memory, kOpen, fOpen),
    inner,
  );
  const open = admitBundleRule(
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
  const resume = admitBundleRule(
    memory,
    theory,
    b.C,
    [kResume, fResume, vResume],
    resumeBefore,
    [resumeAfter],
  );

  const rootPayload = memory.ensure(seed, memory.ensure(b.U, b.C));
  const vPublish = memory.ensure(seed, memory.ensure(b.L, b.C));
  const rootCaller = memory.ensureEndSelfClosed(rootPayload);
  const publishBefore = memory.ensure(
    rootCaller,
    done(memory, b, vPublish),
  );
  const publishAfter = memory.ensure(rootCaller, vPublish);
  const publish = admitBundleRule(
    memory,
    theory,
    b.C,
    [rootPayload, vPublish],
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
  const k = memory.ensure(seed, b.O);
  const before = memory.ensure(k, call(memory, b, fn, input));
  const after = memory.ensure(k, done(memory, b, output));
  return admitBundleRule(
    memory,
    theory,
    b.O,
    [k],
    before,
    [after],
  );
}

interface Fixture {
  readonly memory: Memory;
  readonly b: RootBasis;
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
  for (let i = 0; i < 260; i += 1) {
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

  const K = memory.ensureEndSelfClosed(at(4));
  const kp = memory.poles(K);
  assert(kp.end === K && kp.start !== K, "top-level caller is proper END");

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

  memory.ensure(b.O, memory.ensure(at(23), at(24)));
  memory.ensure(b.C, memory.ensure(at(25), at(26)));

  return Object.freeze({
    memory,
    b,
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
  assert(depth >= 1, "positive nesting depth");
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
    assert(value !== undefined, "run seed " + i);
    return value;
  };

  const initial = memory.ensure(
    K,
    nestedNot(memory, b, NOT, input, depth),
  );
  const initialScope =
    defineWorkingScope(memory, at(seedBase), interpreter, [initial]);
  const cursor = new CurrentScopeCursor(memory, initialScope);

  let transitions = 0;
  let maxFrameDepth = 0;

  while (true) {
    const members = cursor.members();
    same(members.length, 1, "deterministic working cardinality");

    const caller = memory.poles(members[0]!).start;
    maxFrameDepth = Math.max(
      maxFrameDepth,
      frameDepthTo(memory, caller, K),
    );

    const step = reactExecutionScope(
      memory,
      cursor,
      at(seedBase + 1 + transitions),
    );
    if (step.quiescent) {
      same(step.handoffCount, 0, "quiescence performs no handoff");
      break;
    }

    same(step.rawRuleMatches, 1,
      "one structural Rule matches deterministic unary state");
    same(step.transitionedMembers, 1,
      "one current member transitions");
    same(step.handoffCount, 1, "one atomic handoff per transition");
    transitions += 1;
    assert(transitions <= depth * 3 + 1, "execution must terminate");
  }

  const expectedValue = expectedNot(input, FALSE, TRUE, depth);
  const stableResult = memory.ensure(K, expectedValue);
  sameMembers(cursor.members(), [stableResult],
    "quiescent current member is exact stable K -> value");

  same(maxFrameDepth, depth - 1,
    "temporary START frame depth tracks unresolved nesting");
  same(transitions, 3 * depth - 1,
    "OPEN/evaluate/RESUME plus one PUBLISH reach quiescence");

  const stableScope = cursor.currentScope();
  const replay = reactExecutionScope(
    memory,
    cursor,
    at(seedBase + 40),
  );
  assert(replay.quiescent, "stable result remains quiescent");
  same(replay.rawRuleMatches, 0, "stable result has no transition Rule");
  same(replay.handoffCount, 0, "quiescent replay has no handoff");
  same(cursor.currentScope(), stableScope,
    "stable quiescent Scope identity remains exact");
  sameMembers(cursor.members(), [stableResult],
    "stable result survives quiescent replay");
}

function exercise(): void {
  const f = buildFixture();

  runNestedCase(f, f.TRUE, 1, 80);
  runNestedCase(f, f.FALSE, 1, 120);
  runNestedCase(f, f.TRUE, 2, 160);
  runNestedCase(f, f.FALSE, 2, 200);
  runNestedCase(f, f.TRUE, 3, 230);
}

function staticGuards(): void {
  const root = resolve(process.cwd(), "..");
  const own = readFileSync(
    join(
      root,
      "ts/test/research-v013-selfhosted-unary-quiescence-a72z.test.ts",
    ),
    "utf8",
  );

  const kernelStart = own.indexOf("function reactExecutionScope(");
  const kernelEnd = own.indexOf("\nfunction admitBundleRule(", kernelStart);
  assert(kernelStart >= 0 && kernelEnd > kernelStart,
    "generic reaction source slice");
  const kernel = own.slice(kernelStart, kernelEnd);

  assert(kernel.includes("if (images.length === 0)"),
    "kernel preserves no-match current members");
  assert(kernel.includes("readExactSequence"),
    "kernel realizes structural output bundles");
  assert(kernel.includes("if (rawRuleMatches === 0)"),
    "kernel exposes structural quiescence");

  for (const forbidden of [
    "b.O",
    "b.C",
    "NOT",
    "open",
    "resume",
    "publish",
    "RuleKind",
    "opcode",
    "selectedRule",
    "switch(",
    "readContext",
    "StateError",
  ]) {
    assert(!kernel.includes(forbidden),
      "kernel excludes semantic lifecycle dispatch: " + forbidden);
  }

  const runStart = own.indexOf("function runNestedCase(");
  const runEnd = own.indexOf("\nfunction exercise()", runStart);
  assert(runStart >= 0 && runEnd > runStart, "execution-loop source slice");
  const run = own.slice(runStart, runEnd);
  assert(run.includes("if (step.quiescent)"),
    "host loop stops only on generic quiescence");
  for (const forbidden of [
    "ep.start",
    "endpoint.start",
    "caller === K",
    "b.C",
    "DONE",
    "publish",
  ]) {
    assert(!run.includes(forbidden),
      "host loop has no terminal semantic oracle: " + forbidden);
  }

  const lifecycleStart = own.indexOf("function defineUnaryLifecycleRules(");
  const lifecycleEnd = own.indexOf(
    "\nfunction defineGroundedUnaryFunctionRule(",
    lifecycleStart,
  );
  const lifecycle = own.slice(lifecycleStart, lifecycleEnd);
  assert(!lifecycle.includes("NOT"),
    "OPEN/RESUME/PUBLISH Rules are concrete-function agnostic");

  const implementation =
    own.slice(0, own.indexOf("function staticGuards(): void {"));
  assert(!implementation.includes('from "../src/state.js"'),
    "no host Context interpreter imported");

  const a72x = readFileSync(
    join(root, "ts/test/research-v013-rule-driven-unary-context-a72x.test.ts"),
    "utf8",
  );
  assert(a72x.includes("RULE_DRIVEN_UNARY_CONTEXT_LIFECYCLE=GREEN_SCOPED_RESEARCH"),
    "A72x lifecycle base remains retained");

  const a72y = readFileSync(
    join(root, "ts/test/research-v013-explicit-zero-image-a72y.test.ts"),
    "utf8",
  );
  assert(a72y.includes("EXPLICIT_ZERO_IMAGE_AND_QUIESCENCE=GREEN_SCOPED_RESEARCH"),
    "A72y quiescence base remains retained");

  const a72u = readFileSync(
    join(root, "ts/test/research-v013-dual-tree-result-slots-a72u.test.ts"),
    "utf8",
  );
  assert(a72u.includes("DUAL_TREE_SINGLE_ASSIGNMENT_RESULT_SLOTS=GREEN_SCOPED_RESEARCH"),
    "deferred hierarchical Result evidence remains retained");
}

function main(): void {
  exercise();
  staticGuards();

  console.log([
    "MTS v0.13 A72z: SELF_HOSTED_UNARY_TO_QUIESCENCE=GREEN_SCOPED_RESEARCH",
    "BASE=A72X_PLUS_A72Y",
    "TOP_LEVEL_CALLER=END_SHAPED",
    "CONTINUATION_FRAME=START_SHAPED",
    "OPEN_RULE=GENERIC_STRUCTURAL",
    "RESUME_RULE=GENERIC_STRUCTURAL",
    "PUBLISH_RULE=GENERIC_STRUCTURAL",
    "FINAL_RESULT=K_TO_VALUE",
    "FINAL_RESULT_RUNTIME_KIND=NONE",
    "TERMINATION=NO_APPLICABLE_STRUCTURAL_TRANSITIONS",
    "QUIESCENCE_REPLAY_HANDOFFS=0",
    "DEPTH1_NOT=GREEN",
    "DEPTH2_NOT=GREEN",
    "DEPTH3_NOT=GREEN",
    "RULES_PER_NESTING_DEPTH=0",
    "HOST_NESTED_OPEN=0",
    "HOST_PARENT_RESUME=0",
    "HOST_COMPLETION_CLASSIFIER=0",
    "HOST_RESULT_PUBLICATION=0",
    "HOST_TERMINAL_ORACLE=0",
    "HOST_CONTEXT_INTERPRETER=0",
    "HOST_FUNCTION_DISPATCH=0",
    "HOST_THEORY_ARGUMENT=0",
    "HOST_LOOP_STOP_CONDITION=GENERIC_QUIESCENCE_ONLY",
    "CURRENT_SCOPE_ROOT=OPAQUE_AMEMORY_SUBSTRATE_HANDLE",
    "ATOMIC_SCOPE_HANDOFF=AMEMORY_SUBSTRATE_COMMIT_WHEN_TRANSITION_EXISTS",
    "MULTIVALUED_NESTED_LIFECYCLE=NEXT_RETAIN_A72P_A72T",
    "HIERARCHICAL_RESULT_RESEARCH=DEFERRED_RETAINS_A72U_A72V",
    "FULL_V013_SELF_HOSTED=NOT_YET_CLAIMED",
    "V013_NOT_ACCEPTED PRODUCTION_UNCHANGED",
  ].join(" "));
}

main();
