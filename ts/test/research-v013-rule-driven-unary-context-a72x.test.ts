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
  if (!c) throw new Error("v0.13 A72x rule-driven unary Context: " + m);
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
    same(this.scope, expectedOld, "current scope must match expected old scope");
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
    assert(isFrame(memory, cursor), "non-root execution caller is START frame");
    const payload = memory.poles(memory.poles(cursor).end);
    cursor = payload.start;
    depth += 1;
  }
  return depth;
}

interface GroundedRuleImage {
  readonly outputTemplate: LinkHandle;
  readonly bindings: readonly StructuralRoleBinding[];
}

function discoverTaggedRuleImages(
  memory: Memory,
  theory: LinkHandle,
  active: LinkHandle,
): readonly GroundedRuleImage[] {
  const activePoles = memory.poles(active);
  const endpoint = activePoles.end;
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

interface ScopeReaction {
  readonly oldScope: LinkHandle;
  readonly nextScope: LinkHandle;
  readonly oldMembers: readonly LinkHandle[];
  readonly produced: readonly LinkHandle[];
  readonly rawRuleMatches: number;
}

function reactTaggedScope(
  memory: Memory,
  cursor: CurrentScopeCursor,
  nextScopeSeed: LinkHandle,
): ScopeReaction {
  const oldScope = cursor.currentScope();
  const authority = readWorkingScopeAuthority(memory, oldScope);
  const before = cursor.members();
  assert(before.length > 0, "reaction requires non-empty current scope");

  const produced: LinkHandle[] = [];
  let rawRuleMatches = 0;

  for (const active of before) {
    for (
      const image of discoverTaggedRuleImages(
        memory,
        authority.theory,
        active,
      )
    ) {
      rawRuleMatches += 1;
      const successor =
        instantiateTemplate(memory, image.outputTemplate, image.bindings);
      if (!produced.includes(successor)) produced.push(successor);

      same(
        cursor.currentScope(),
        oldScope,
        "old Scope stays current while successor image is derived",
      );
      sameMembers(
        cursor.members(),
        before,
        "partial successor image is never current",
      );
    }
  }

  const nextScope = defineWorkingScope(
    memory,
    nextScopeSeed,
    authority.interpreter,
    produced,
  );

  same(
    cursor.currentScope(),
    oldScope,
    "complete successor Scope is non-current before handoff",
  );
  cursor.switchAtomically(oldScope, nextScope);

  return Object.freeze({
    oldScope,
    nextScope,
    oldMembers: before,
    produced: Object.freeze(produced),
    rawRuleMatches,
  });
}

function admitTriggeredRule(
  memory: Memory,
  theory: LinkHandle,
  triggerKey: LinkHandle,
  roles: readonly LinkHandle[],
  before: LinkHandle,
  after: LinkHandle,
): LinkHandle {
  const dictionary = defineStructuralRoleDictionary(memory, roles);
  const rule = defineStructuralRule(
    memory,
    dictionary,
    memory.ensure(before, after),
  );
  const admission = admitStructuralRule(memory, theory, rule);
  memory.ensure(triggerKey, admission);
  return rule;
}

interface LifecycleRules {
  readonly open: LinkHandle;
  readonly resume: LinkHandle;
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
  const open = admitTriggeredRule(
    memory,
    theory,
    b.O,
    [kOpen, fOpen, gOpen, xOpen],
    openBefore,
    openAfter,
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
  const resume = admitTriggeredRule(
    memory,
    theory,
    b.C,
    [kResume, fResume, vResume],
    resumeBefore,
    resumeAfter,
  );

  return Object.freeze({ open, resume });
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
  return admitTriggeredRule(
    memory,
    theory,
    b.O,
    [k],
    before,
    after,
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
  for (let i = 0; i < 240; i += 1) {
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

  // Top-level caller is deliberately not START-shaped, so it cannot be
  // mistaken for a continuation frame by RESUME.
  const K = memory.ensure(at(4), at(5));
  assert(!isFrame(memory, K), "top-level K is not a continuation frame");

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

  // Noise under both trigger keys must be inert.
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

function activeEndpoint(memory: Memory, active: LinkHandle): LinkHandle {
  return memory.poles(active).end;
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

  const program = nestedNot(memory, b, NOT, input, depth);
  const initial = memory.ensure(K, program);
  const initialScope =
    defineWorkingScope(memory, at(seedBase), interpreter, [initial]);
  const cursor = new CurrentScopeCursor(memory, initialScope);

  let reaction = 0;
  let maxFrameDepth = 0;
  let openCount = 0;
  let resumeCount = 0;
  let functionCount = 0;

  while (true) {
    const members = cursor.members();
    same(members.length, 1, "deterministic nested NOT working cardinality");
    const active = members[0]!;
    const caller = activeCaller(memory, active);
    maxFrameDepth = Math.max(
      maxFrameDepth,
      frameDepthTo(memory, caller, K),
    );

    const endpoint = activeEndpoint(memory, active);
    const ep = memory.poles(endpoint);

    // Terminal state is observed only by the test oracle. The reaction kernel
    // itself has no DONE/terminal branch.
    if (ep.start === b.C && caller === K) break;

    const beforeCaller = caller;
    const beforeEndpoint = endpoint;
    const result = reactTaggedScope(
      memory,
      cursor,
      at(seedBase + 1 + reaction),
    );
    same(result.rawRuleMatches, 1, "exactly one structural Rule matches");
    same(result.produced.length, 1, "one deterministic successor");

    const after = result.produced[0]!;
    const afterCaller = activeCaller(memory, after);
    const afterEndpoint = activeEndpoint(memory, after);

    const beforeDepth = frameDepthTo(memory, beforeCaller, K);
    const afterDepth = frameDepthTo(memory, afterCaller, K);

    if (afterDepth === beforeDepth + 1) {
      openCount += 1;
    } else if (afterDepth + 1 === beforeDepth) {
      resumeCount += 1;
    } else {
      same(afterDepth, beforeDepth, "non-lifecycle Rule keeps frame depth");
      functionCount += 1;
    }

    // Every old active truth leaves current A-memory after the reaction.
    assert(
      !cursor.members().includes(memory.ensure(beforeCaller, beforeEndpoint)),
      "consumed active truth is no longer current",
    );
    sameMembers(
      cursor.members(),
      [memory.ensure(afterCaller, afterEndpoint)],
      "successor truth is exact current member",
    );

    reaction += 1;
    assert(reaction <= depth * 3 + 2, "nested NOT execution terminates");
  }

  const terminal = cursor.members()[0]!;
  same(activeCaller(memory, terminal), K, "terminal returns to top-level K");
  const terminalEndpoint = activeEndpoint(memory, terminal);
  const terminalPoles = memory.poles(terminalEndpoint);
  same(terminalPoles.start, b.C, "terminal endpoint has DONE/C shape");
  same(
    terminalPoles.end,
    expectedNot(input, FALSE, TRUE, depth),
    "exact final nested NOT value",
  );

  same(openCount, depth - 1, "one OPEN per nested boundary");
  same(resumeCount, depth - 1, "one RESUME per nested boundary");
  same(functionCount, depth, "one function Rule per NOT call");
  same(maxFrameDepth, depth - 1, "frame depth tracks unresolved nesting");
  same(
    reaction,
    depth + 2 * (depth - 1),
    "reaction count = function evaluations + push/pop",
  );
}

function exercise(): void {
  const f = buildFixture();

  // Depth 1 proves ordinary function evaluation uses the same kernel.
  runNestedCase(f, f.TRUE, 1, 80);

  // Depth 2 proves one OPEN -> inner eval -> RESUME -> outer eval cycle.
  runNestedCase(f, f.TRUE, 2, 100);
  runNestedCase(f, f.FALSE, 2, 120);

  // Depth 3 proves the same two lifecycle Rules recurse without Rules per depth.
  runNestedCase(f, f.TRUE, 3, 140);
}

function staticGuards(): void {
  const root = resolve(process.cwd(), "..");
  const own = readFileSync(
    join(
      root,
      "ts/test/research-v013-rule-driven-unary-context-a72x.test.ts",
    ),
    "utf8",
  );

  const kernelStart = own.indexOf("function reactTaggedScope(");
  const kernelEnd = own.indexOf("\nfunction admitTriggeredRule(", kernelStart);
  assert(kernelStart >= 0 && kernelEnd > kernelStart, "reaction source slice");
  const kernel = own.slice(kernelStart, kernelEnd);

  same(
    kernel.split("cursor.switchAtomically(").length - 1,
    1,
    "one atomic Scope handoff per reaction",
  );
  assert(
    kernel.includes("discoverTaggedRuleImages"),
    "kernel uses generic structural Rule discovery",
  );
  assert(
    !kernel.includes("b.O") && !kernel.includes("b.C"),
    "kernel does not name CALL/DONE aspect tags",
  );
  assert(
    !kernel.includes("NOT"),
    "kernel does not know concrete function identity",
  );

  for (const forbidden of [
    "openNested",
    "resumeFirst",
    "collapse",
    "publishTerminal",
    "RuleKind",
    "opcode",
    "selectedRule",
    "switch(",
    "readContext",
    "StateError",
  ]) {
    assert(
      !kernel.includes(forbidden),
      "reaction kernel excludes host lifecycle dispatch: " + forbidden,
    );
  }

  const lifecycleStart = own.indexOf("function defineUnaryLifecycleRules(");
  const lifecycleEnd = own.indexOf(
    "\nfunction defineGroundedUnaryFunctionRule(",
    lifecycleStart,
  );
  assert(
    lifecycleStart >= 0 && lifecycleEnd > lifecycleStart,
    "lifecycle Rule source slice",
  );
  const lifecycle = own.slice(lifecycleStart, lifecycleEnd);
  assert(!lifecycle.includes("NOT"),
    "OPEN/RESUME Rules are concrete-function agnostic");

  const implementation =
    own.slice(0, own.indexOf("function staticGuards(): void {"));
  assert(
    !implementation.includes('from "../src/state.js"'),
    "A72x uses no host Context interpreter",
  );

  const a72w = readFileSync(
    join(root, "ts/test/research-v013-flat-generalized-modus-ponens-a72w.test.ts"),
    "utf8",
  );
  assert(
    a72w.includes("FLAT_GENERALIZED_MODUS_PONENS=GREEN_SCOPED_RESEARCH"),
    "A72w flat floor remains retained",
  );

  const a72u = readFileSync(
    join(root, "ts/test/research-v013-dual-tree-result-slots-a72u.test.ts"),
    "utf8",
  );
  assert(
    a72u.includes("DUAL_TREE_SINGLE_ASSIGNMENT_RESULT_SLOTS=GREEN_SCOPED_RESEARCH"),
    "A72u deferred hierarchical research remains retained",
  );
}

function main(): void {
  exercise();
  staticGuards();

  console.log([
    "MTS v0.13 A72x: RULE_DRIVEN_UNARY_CONTEXT_LIFECYCLE=GREEN_SCOPED_RESEARCH",
    "BASE=A72W_GENERALIZED_MODUS_PONENS",
    "CALL_SHAPE=O_TO_F_TO_X",
    "DONE_SHAPE=C_TO_VALUE",
    "FRAME_SHAPE=START_K_TO_F",
    "OPEN_RULE=GENERIC",
    "RESUME_RULE=GENERIC",
    "RULES_PER_NESTING_DEPTH=0",
    "DEPTH1_NOT=GREEN",
    "DEPTH2_NOT=GREEN",
    "DEPTH3_NOT=GREEN",
    "MAX_FRAME_DEPTH_FOR_DEPTH3=2",
    "HOST_OPEN_NESTED=0",
    "HOST_PARENT_RESUME=0",
    "HOST_CONTEXT_INTERPRETER=0",
    "HOST_FUNCTION_DISPATCH=0",
    "HOST_LIFECYCLE_DISPATCH=0",
    "HOST_THEORY_ARGUMENT=0",
    "CURRENT_SCOPE_ROOT=OPAQUE_AMEMORY_SUBSTRATE_HANDLE",
    "ATOMIC_SCOPE_HANDOFF=AMEMORY_SUBSTRATE_COMMIT",
    "FINAL_DONE_PUBLICATION=DEFERRED",
    "MULTIVALUED_NESTED_LIFECYCLE=DEFERRED_RETAINS_A72P_A72T",
    "HIERARCHICAL_RESULT_RESEARCH=DEFERRED_RETAINS_A72U_A72V",
    "FULL_V013_SELF_HOSTED=NOT_YET_CLAIMED",
    "V013_NOT_ACCEPTED PRODUCTION_UNCHANGED",
  ].join(" "));
}

main();
