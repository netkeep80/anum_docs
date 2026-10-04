import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  materializeExactSequence,
} from "../src/exact-sequence.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
} from "../src/memory.js";
import {
  defineStructuralRoleDictionary,
} from "../src/structural-rule.js";
import {
  defineV013GroundedExecutionScope,
  reactV013GroundedScope,
  V013GroundedScopeCursor,
} from "../src/v013-grounded-execution.js";
import {
  defineV015StructuralMpRule,
  reactV015StructuralMpScope,
  readV015StructuralMpTheorySnapshot,
} from "../src/v015-structural-mp.js";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error("v0.15 M7 minimal structural MP: " + message);
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}
function sameMembers(
  actual: readonly LinkHandle[],
  expected: readonly LinkHandle[],
  message: string,
): void {
  same(actual.length, expected.length, message + " cardinality");
  for (const member of expected) assert(actual.includes(member), message + " missing member");
}

function anchorFactory(memory: Memory): () => LinkHandle {
  const b = ensureRootBasis(memory);
  let cursor = memory.ensure(b.O, b.C);
  return (): LinkHandle => (
    cursor = memory.ensure(b.U, cursor)
  );
}

interface ExactFixture {
  readonly memory: Memory;
  readonly groundedTheory: LinkHandle;
  readonly structuralTheory: LinkHandle;
  readonly emptyRoles: LinkHandle;
  readonly K: LinkHandle;
  readonly A: LinkHandle;
  readonly B: LinkHandle;
  readonly C: LinkHandle;
  readonly D: LinkHandle;
  readonly E: LinkHandle;
  readonly fresh: () => LinkHandle;
}

function exactFixture(): ExactFixture {
  const memory = new Memory();
  const fresh = anchorFactory(memory);
  const groundedTheory = fresh();
  const structuralTheory = fresh();
  const emptyRoles = defineStructuralRoleDictionary(memory, []);
  return Object.freeze({
    memory,
    groundedTheory,
    structuralTheory,
    emptyRoles,
    K: fresh(),
    A: fresh(),
    B: fresh(),
    C: fresh(),
    D: fresh(),
    E: fresh(),
    fresh,
  });
}

function admitBoth(
  f: ExactFixture,
  antecedent: LinkHandle,
  outputs: readonly LinkHandle[],
): void {
  const image = materializeExactSequence(f.memory, outputs);
  const relation = f.memory.ensure(antecedent, image);
  f.memory.ensure(f.groundedTheory, relation);
  defineV015StructuralMpRule(
    f.memory,
    f.structuralTheory,
    f.emptyRoles,
    antecedent,
    outputs,
  );
}

interface Observation {
  readonly members: readonly LinkHandle[];
  readonly matches: number;
  readonly transitioned: number;
  readonly handoff: 0 | 1;
  readonly quiescent: boolean;
}

function runGrounded(
  f: ExactFixture,
  members: readonly LinkHandle[],
): Observation {
  const scope = defineV013GroundedExecutionScope(
    f.memory,
    f.fresh(),
    f.groundedTheory,
    members,
  );
  const cursor = new V013GroundedScopeCursor(f.memory, scope);
  const reaction = reactV013GroundedScope(f.memory, cursor, f.fresh());
  return Object.freeze({
    members: cursor.members(),
    matches: reaction.matchedRelations,
    transitioned: reaction.transitionedMembers,
    handoff: reaction.handoffCount,
    quiescent: reaction.quiescent,
  });
}

function runStructural(
  f: ExactFixture,
  members: readonly LinkHandle[],
): Observation {
  const scope = defineV013GroundedExecutionScope(
    f.memory,
    f.fresh(),
    f.structuralTheory,
    members,
  );
  const cursor = new V013GroundedScopeCursor(f.memory, scope);
  const reaction = reactV015StructuralMpScope(f.memory, cursor, f.fresh());
  return Object.freeze({
    members: cursor.members(),
    matches: reaction.matchedRules,
    transitioned: reaction.transitionedMembers,
    handoff: reaction.handoffCount,
    quiescent: reaction.quiescent,
  });
}

function sameObservation(
  grounded: Observation,
  structural: Observation,
  label: string,
): void {
  sameMembers(structural.members, grounded.members, label + " members");
  same(structural.matches, grounded.matches, label + " matches");
  same(structural.transitioned, grounded.transitioned, label + " transitioned");
  same(structural.handoff, grounded.handoff, label + " handoff");
  same(structural.quiescent, grounded.quiescent, label + " quiescent");
}

// S0 exact-rule compatibility: NO_MATCH.
{
  const f = exactFixture();
  const current = f.memory.ensure(f.K, f.A);
  sameObservation(
    runGrounded(f, [current]),
    runStructural(f, [current]),
    "NO_MATCH",
  );
}

// Active identity.
{
  const f = exactFixture();
  admitBoth(f, f.A, [f.A]);
  const current = f.memory.ensure(f.K, f.A);
  sameObservation(
    runGrounded(f, [current]),
    runStructural(f, [current]),
    "ACTIVE_IDENTITY",
  );
}

// Explicit matched-empty 1->0.
{
  const f = exactFixture();
  admitBoth(f, f.A, []);
  const current = f.memory.ensure(f.K, f.A);
  sameObservation(
    runGrounded(f, [current]),
    runStructural(f, [current]),
    "ONE_TO_ZERO",
  );
}

// 1->N plus multiple matching relations.
{
  const f = exactFixture();
  admitBoth(f, f.A, [f.B, f.C]);
  admitBoth(f, f.A, [f.C, f.D]);
  const current = f.memory.ensure(f.K, f.A);
  sameObservation(
    runGrounded(f, [current]),
    runStructural(f, [current]),
    "ONE_TO_N_MULTI_MATCH",
  );
}

// N->1 convergence.
{
  const f = exactFixture();
  admitBoth(f, f.A, [f.B]);
  admitBoth(f, f.C, [f.B]);
  const members = [
    f.memory.ensure(f.K, f.A),
    f.memory.ensure(f.K, f.C),
  ];
  sameObservation(
    runGrounded(f, members),
    runStructural(f, members),
    "N_TO_ONE",
  );
}

// N->M pointwise lift with matched-empty and one NO_MATCH member.
{
  const f = exactFixture();
  admitBoth(f, f.A, []);
  admitBoth(f, f.A, [f.B]);
  admitBoth(f, f.C, [f.D, f.E]);
  const members = [
    f.memory.ensure(f.K, f.A),
    f.memory.ensure(f.K, f.C),
    f.memory.ensure(f.K, f.B),
  ];
  sameObservation(
    runGrounded(f, members),
    runStructural(f, members),
    "N_TO_M",
  );
}

// S1/S2: two roles bind inside ONE explicit current endpoint; K is preserved
// by the kernel and never appears in the role dictionary.
{
  const memory = new Memory();
  const fresh = anchorFactory(memory);
  const theory = fresh();
  const K = fresh();
  const X = fresh();
  const Y = fresh();
  const A = fresh();
  const C = fresh();

  const roles = defineStructuralRoleDictionary(memory, [X, Y]);
  const antecedent = memory.ensure(X, Y);
  const output = memory.ensure(Y, X);
  defineV015StructuralMpRule(memory, theory, roles, antecedent, [output]);

  const actual = memory.ensure(A, C);
  const current = memory.ensure(K, actual);
  const scope = defineV013GroundedExecutionScope(memory, fresh(), theory, [current]);
  const cursor = new V013GroundedScopeCursor(memory, scope);
  const reaction = reactV015StructuralMpScope(memory, cursor, fresh());

  same(reaction.matchedRules, 1, "two-role rule matched once");
  sameMembers(
    cursor.members(),
    [memory.ensure(K, memory.ensure(C, A))],
    "two-role output instantiated while K preserved",
  );
  assert(!readV015StructuralMpTheorySnapshot(memory, theory)[0]!.roles.includes(K),
    "caller K is not a synthetic source role");
}

// Repeated-role correlation fails closed for inconsistent actual structure.
{
  const memory = new Memory();
  const fresh = anchorFactory(memory);
  const theory = fresh();
  const K = fresh();
  const X = fresh();
  const A = fresh();
  const C = fresh();

  const roles = defineStructuralRoleDictionary(memory, [X]);
  const diagonal = memory.ensure(X, X);
  defineV015StructuralMpRule(memory, theory, roles, diagonal, [X]);

  const inconsistent = memory.ensure(A, C);
  const current = memory.ensure(K, inconsistent);
  const scope = defineV013GroundedExecutionScope(memory, fresh(), theory, [current]);
  const cursor = new V013GroundedScopeCursor(memory, scope);
  const reaction = reactV015StructuralMpScope(memory, cursor, fresh());

  same(reaction.matchedRules, 0, "repeated-role inconsistent actual does not match");
  sameMembers(cursor.members(), [current], "repeated-role mismatch preserves current");
}

// J0: a packed antecedent is one endpoint; separate current members do not
// implicitly create it.
{
  const f = exactFixture();
  const pair = f.memory.ensure(f.A, f.C);
  admitBoth(f, pair, [f.D]);

  const separate = [
    f.memory.ensure(f.K, f.A),
    f.memory.ensure(f.K, f.C),
  ];
  const structuralSeparate = runStructural(f, separate);
  same(structuralSeparate.matches, 0, "separate members do not satisfy packed rule");
  sameMembers(structuralSeparate.members, separate, "separate members preserved");

  const packed = [f.memory.ensure(f.K, pair)];
  const structuralPacked = runStructural(f, packed);
  same(structuralPacked.matches, 1, "packed endpoint matches");
  sameMembers(
    structuralPacked.members,
    [f.memory.ensure(f.K, f.D)],
    "packed endpoint result",
  );
}

interface VariadicFixture {
  readonly memory: Memory;
  readonly theory: LinkHandle;
  readonly K: LinkHandle;
  readonly ALL: LinkHandle;
  readonly FALSE: LinkHandle;
  readonly TRUE: LinkHandle;
  readonly fresh: () => LinkHandle;
}

function buildArgumentChain(
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

function variadicFixture(): VariadicFixture {
  const memory = new Memory();
  const fresh = anchorFactory(memory);
  const theory = fresh();
  const K = fresh();
  const FALSE = fresh();
  const TRUE = fresh();
  const ALL = fresh();

  const falseTail = fresh();
  const falseRoles = defineStructuralRoleDictionary(memory, [falseTail]);
  defineV015StructuralMpRule(
    memory,
    theory,
    falseRoles,
    memory.ensure(ALL, memory.ensure(FALSE, falseTail)),
    [FALSE],
  );

  const terminalRoles = defineStructuralRoleDictionary(memory, []);
  defineV015StructuralMpRule(
    memory,
    theory,
    terminalRoles,
    memory.ensure(ALL, memory.ensure(TRUE, memory.root)),
    [TRUE],
  );

  const nextHead = fresh();
  const nextRest = fresh();
  const recursiveRoles =
    defineStructuralRoleDictionary(memory, [nextHead, nextRest]);
  const nonEmptyTail = memory.ensure(nextHead, nextRest);
  defineV015StructuralMpRule(
    memory,
    theory,
    recursiveRoles,
    memory.ensure(ALL, memory.ensure(TRUE, nonEmptyTail)),
    [memory.ensure(ALL, nonEmptyTail)],
  );

  same(
    readV015StructuralMpTheorySnapshot(memory, theory).length,
    3,
    "variadic ALL source-rule count",
  );

  return Object.freeze({
    memory,
    theory,
    K,
    ALL,
    FALSE,
    TRUE,
    fresh,
  });
}

interface VariadicSpec {
  readonly args: readonly LinkHandle[];
  readonly expected: LinkHandle;
  readonly steps: number;
  readonly label: string;
}

function runVariadic(f: VariadicFixture, spec: VariadicSpec): void {
  let value = f.memory.ensure(
    f.ALL,
    buildArgumentChain(f.memory, spec.args),
  );
  let steps = 0;

  while (value !== f.FALSE && value !== f.TRUE) {
    const current = f.memory.ensure(f.K, value);
    const scope = defineV013GroundedExecutionScope(
      f.memory,
      f.fresh(),
      f.theory,
      [current],
    );
    const cursor = new V013GroundedScopeCursor(f.memory, scope);
    const reaction = reactV015StructuralMpScope(
      f.memory,
      cursor,
      f.fresh(),
    );

    same(reaction.matchedRules, 1, spec.label + " exactly one source rule matches");
    same(cursor.members().length, 1, spec.label + " one successor");
    const truth = f.memory.poles(cursor.members()[0]!);
    same(truth.start, f.K, spec.label + " K preserved by kernel");
    value = truth.end;

    steps += 1;
    assert(steps <= spec.args.length, spec.label + " termination bound");
  }

  same(value, spec.expected, spec.label + " result");
  same(steps, spec.steps, spec.label + " reduction count");
}

{
  const f = variadicFixture();
  const F = f.FALSE;
  const T = f.TRUE;

  const specs: readonly VariadicSpec[] = Object.freeze([
    { args: [F], expected: F, steps: 1, label: "ALL(F)" },
    { args: [T], expected: T, steps: 1, label: "ALL(T)" },
    { args: [T, F], expected: F, steps: 2, label: "ALL(T,F)" },
    { args: [T, T], expected: T, steps: 2, label: "ALL(T,T)" },
    { args: [T, T, T], expected: T, steps: 3, label: "ALL(T,T,T)" },
    { args: [T, T, F], expected: F, steps: 3, label: "ALL(T,T,F)" },
    { args: [T, T, T, T, T], expected: T, steps: 5, label: "ALL(T^5)" },
    { args: [T, T, T, F, T], expected: F, steps: 4, label: "ALL(T,T,T,F,T)" },
  ]);

  for (const spec of specs) runVariadic(f, spec);

  same(
    readV015StructuralMpTheorySnapshot(f.memory, f.theory).length,
    3,
    "ALL still has only three generic source rules after all runs",
  );
}

// Static anti-drift: the candidate kernel is generic and has no program
// dispatch, no semantic trigger index and no synthetic caller-role construction.
{
  const root = resolve(process.cwd(), "..");
  const source = readFileSync(
    join(root, "ts/src/v015-structural-mp.ts"),
    "utf8",
  );

  for (const forbidden of [
    "\"AND\"",
    "\"OR\"",
    "\"XOR\"",
    "\"NOT\"",
    "\"TRUE\"",
    "\"FALSE\"",
    "\"FF\"",
    "\"FT\"",
    "\"TF\"",
    "\"TT\"",
    "opcode",
    "RuleKind",
    "triggerKey",
    "selectedBranch",
    "switch(",
  ]) {
    assert(!source.includes(forbidden), "kernel excludes dispatch marker " + forbidden);
  }

  assert(
    source.includes("memory.outgoing(theory)"),
    "selected Theory is complete source-rule authority frontier",
  );
  assert(
    source.includes("unifyStructuralRuleTemplate("),
    "kernel includes S1 structural matching",
  );
  assert(
    source.includes("instantiateV013StructuralTemplate("),
    "kernel includes S2 output instantiation",
  );
  assert(
    source.includes("memory.ensure(truth.start, output)"),
    "kernel preserves K directly",
  );
  assert(
    !source.includes("memory.ensure(role,"),
    "kernel does not build synthetic caller-role templates",
  );
}

console.log([
  "MTS_V015_MP_S_M7=MINIMAL_STRUCTURAL_MP_GREEN",
  "S0_EXACT_DIFFERENTIAL=GREEN",
  "S1_STRUCTURAL_MATCHING=GREEN",
  "S2_OUTPUT_INSTANTIATION=GREEN",
  "E1_ZERO_ONE_MANY=GREEN",
  "E2_POINTWISE_SCOPE_LIFT=GREEN",
  "J0_PACKED_ONLY=GREEN",
  "J1_CROSS_MEMBER_JOIN=ABSENT",
  "CALLER_K_SYNTHETIC_ROLE=0",
  "SEMANTIC_TRIGGER_INDEX=0",
  "PROGRAM_DISPATCH=0",
  "VARIADIC_ALL_GENERIC_RULES=3",
  "TESTED_ARITIES=1_2_3_5",
  "AMEMORY_SEMANTIC_COMMAND_CANDIDATE=ONE_STRUCTURAL_GENERALIZED_MP",
].join(" "));
