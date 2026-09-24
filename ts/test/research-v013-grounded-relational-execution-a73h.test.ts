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
} from "../src/memory.js";

function assert(c: unknown, m: string): asserts c {
  if (!c) throw new Error("v0.13 A73h grounded relational execution: " + m);
}
function same<T>(a: T, e: T, m: string): void {
  assert(Object.is(a, e), m + ": values differ");
}
function setSame(
  actual: readonly LinkHandle[],
  expected: readonly LinkHandle[],
  message: string,
): void {
  same(actual.length, new Set(expected).size, message + " cardinality");
  for (const item of expected) assert(actual.includes(item), message + " missing item");
}

interface GroundedScopeAuthority {
  readonly theory: LinkHandle;
  readonly members: readonly LinkHandle[];
}

/**
 * Minimal Link-native working Scope for the grounded relational experiment.
 *
 * scope = START(seed -> Theory)
 * scope -> currentTruth
 *
 * The mutable "current" selector remains an opaque carrier root as established
 * by A72n/A73g; no currentness ordering is encoded into append-only Links.
 */
function defineGroundedScope(
  memory: Memory,
  seed: LinkHandle,
  theory: LinkHandle,
  members: readonly LinkHandle[],
): LinkHandle {
  const descriptor = memory.ensure(seed, theory);
  const scope = memory.ensureStartSelfClosed(descriptor);
  for (const member of members) memory.ensure(scope, member);
  return scope;
}

function readGroundedScope(
  memory: Memory,
  scope: LinkHandle,
): GroundedScopeAuthority {
  const sp = memory.poles(scope);
  assert(sp.start === scope, "working Scope must be START self-closed");
  const descriptor = memory.poles(sp.end);
  const theory = descriptor.end;
  const members: LinkHandle[] = [];

  for (const attachment of memory.outgoing(scope)) {
    if (attachment === scope) continue;
    const p = memory.poles(attachment);
    if (p.start === scope) members.push(p.end);
  }
  return Object.freeze({ theory, members: Object.freeze(members) });
}

class GroundedScopeCursor {
  private scope: LinkHandle;

  constructor(
    private readonly memory: Memory,
    initialScope: LinkHandle,
  ) {
    readGroundedScope(memory, initialScope);
    this.scope = initialScope;
  }

  currentScope(): LinkHandle {
    return this.scope;
  }

  members(): readonly LinkHandle[] {
    return readGroundedScope(this.memory, this.scope).members;
  }

  switchAtomically(expectedOld: LinkHandle, next: LinkHandle): void {
    same(this.scope, expectedOld, "atomic handoff expected old Scope");
    readGroundedScope(this.memory, next);
    this.scope = next;
  }
}

/**
 * Link-native grounded relation:
 *
 *   relation  = A -> exactSequence(B...)
 *   admission = Theory -> relation
 *   localIndex = A -> admission
 *
 * Empty exactSequence is an explicit zero-image relation. Absence of an
 * admitted relation is different: it means "no rewrite here" and preserves the
 * current member.
 */
function admitGroundedRelation(
  memory: Memory,
  theory: LinkHandle,
  antecedent: LinkHandle,
  outputs: readonly LinkHandle[],
): LinkHandle {
  const bundle = materializeExactSequence(memory, outputs);
  const relation = memory.ensure(antecedent, bundle);
  const admission = memory.ensure(theory, relation);
  memory.ensure(antecedent, admission);
  return relation;
}

interface GroundedImage {
  readonly relation: LinkHandle;
  readonly outputs: readonly LinkHandle[];
}

function discoverGroundedImages(
  memory: Memory,
  theory: LinkHandle,
  antecedent: LinkHandle,
): readonly GroundedImage[] {
  const found: GroundedImage[] = [];

  for (const index of memory.outgoing(antecedent)) {
    if (index === antecedent) continue;
    const ip = memory.poles(index);
    if (ip.start !== antecedent) continue;

    const admission = ip.end;
    const ap = memory.poles(admission);
    if (ap.start !== theory || ap.end === admission) continue;

    const relation = ap.end;
    const rp = memory.poles(relation);
    if (rp.start !== antecedent) continue;

    found.push(Object.freeze({
      relation,
      outputs: readExactSequence(memory, rp.end),
    }));
  }

  return Object.freeze(found);
}

interface Reaction {
  readonly oldScope: LinkHandle;
  readonly nextScope: LinkHandle | null;
  readonly before: readonly LinkHandle[];
  readonly after: readonly LinkHandle[];
  readonly matchedRelations: number;
  readonly transitionedMembers: number;
  readonly handoffCount: 0 | 1;
  readonly quiescent: boolean;
}

/**
 * Generalized relational modus ponens:
 *
 *   K -> A
 *   A -> {B_j}     (admitted under current Theory)
 *   ----------------
 *   K -> {B_j}
 *
 * No matcher, template, role environment, opcode or function-specific branch
 * participates. The only semantic distinction is:
 *
 *   no admitted A-relation  => preserve K->A
 *   admitted empty image    => remove K->A from successor Scope
 */
function reactGroundedScope(
  memory: Memory,
  cursor: GroundedScopeCursor,
  nextScopeSeed: LinkHandle,
): Reaction {
  const oldScope = cursor.currentScope();
  const { theory, members: before } = readGroundedScope(memory, oldScope);
  const after: LinkHandle[] = [];
  let matchedRelations = 0;
  let transitionedMembers = 0;

  for (const member of before) {
    const truth = memory.poles(member);
    const images = discoverGroundedImages(memory, theory, truth.end);

    if (images.length === 0) {
      after.push(member);
      continue;
    }

    transitionedMembers += 1;
    matchedRelations += images.length;
    for (const image of images) {
      for (const output of image.outputs) {
        after.push(memory.ensure(truth.start, output));
      }
    }
  }

  const unique = Object.freeze([...new Set(after)]);
  if (matchedRelations === 0) {
    return Object.freeze({
      oldScope,
      nextScope: null,
      before,
      after: before,
      matchedRelations,
      transitionedMembers,
      handoffCount: 0 as const,
      quiescent: true,
    });
  }

  const nextScope = defineGroundedScope(memory, nextScopeSeed, theory, unique);
  cursor.switchAtomically(oldScope, nextScope);

  return Object.freeze({
    oldScope,
    nextScope,
    before,
    after: unique,
    matchedRelations,
    transitionedMembers,
    handoffCount: 1 as const,
    quiescent: false,
  });
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

  const theory = memory.ensure(at(0), at(1));
  const K = memory.ensure(at(2), at(3));
  const K0 = memory.ensure(at(4), at(5));

  const A = memory.ensure(at(6), at(7));
  const B = memory.ensure(at(8), at(9));
  const C = memory.ensure(at(10), at(11));
  const D = memory.ensure(at(12), at(13));
  const P = memory.ensure(at(14), at(15));
  const Q = memory.ensure(at(16), at(17));
  const E = memory.ensure(at(18), at(19));
  const ZERO = memory.ensure(at(20), at(21));
  const INERT = memory.ensure(at(22), at(23));

  // One-to-many branch, one deeper continuation, N-to-one convergence,
  // and explicit one-to-zero deletion.
  admitGroundedRelation(memory, theory, A, [B, C]);
  admitGroundedRelation(memory, theory, B, [D]);
  admitGroundedRelation(memory, theory, P, [E]);
  admitGroundedRelation(memory, theory, Q, [E]);
  admitGroundedRelation(memory, theory, ZERO, []);

  const initial = Object.freeze([
    memory.ensure(K, A),
    memory.ensure(K, P),
    memory.ensure(K, Q),
    memory.ensure(K0, ZERO),
    memory.ensure(K0, INERT),
  ]);
  const initialScope = defineGroundedScope(memory, at(40), theory, initial);
  const cursor = new GroundedScopeCursor(memory, initialScope);

  // Round 1:
  // A -> B,C; P/Q -> same E; ZERO -> empty; INERT has no Rule and survives.
  const r1 = reactGroundedScope(memory, cursor, at(41));
  same(r1.quiescent, false, "round1 transitions");
  same(r1.handoffCount, 1, "round1 one atomic handoff");
  same(r1.matchedRelations, 5, "round1 five admitted relation matches");
  same(r1.transitionedMembers, 4, "round1 four current members transition");
  setSame(r1.after, [
    memory.ensure(K, B),
    memory.ensure(K, C),
    memory.ensure(K, E),
    memory.ensure(K0, INERT),
  ], "round1 extensional image");
  assert(!r1.after.includes(memory.ensure(K0, ZERO)),
    "explicit zero-image removes current ZERO truth");
  same(
    r1.after.filter((x) => x === memory.ensure(K, E)).length,
    1,
    "N-to-one convergence collapses canonical duplicate truth",
  );

  // Round 2: B continues to D while sibling C and converged E are already
  // stable. This is branch-depth skew without any completion barrier.
  const r2 = reactGroundedScope(memory, cursor, at(42));
  same(r2.quiescent, false, "round2 deeper branch continues");
  same(r2.matchedRelations, 1, "round2 only B has a continuation");
  same(r2.transitionedMembers, 1, "round2 only one member transitions");
  setSame(r2.after, [
    memory.ensure(K, D),
    memory.ensure(K, C),
    memory.ensure(K, E),
    memory.ensure(K0, INERT),
  ], "round2 mixed stable and continuing branch image");

  // Round 3: no admitted antecedent relation remains => exact fixed point.
  const r3 = reactGroundedScope(memory, cursor, at(43));
  same(r3.quiescent, true, "round3 fixed point");
  same(r3.handoffCount, 0, "quiescence performs no handoff");
  same(r3.matchedRelations, 0, "quiescence has no admitted relation");
  setSame(cursor.members(), r2.after, "fixed point leaves current Scope unchanged");

  // Ambient relation under a different Theory is inert.
  const foreignTheory = memory.ensure(at(50), at(51));
  admitGroundedRelation(memory, foreignTheory, C, [A]);
  const r4 = reactGroundedScope(memory, cursor, at(44));
  same(r4.quiescent, true, "foreign Theory relation is inert");
  setSame(cursor.members(), r2.after, "foreign authority cannot perturb fixed point");
}

function staticGuards(): void {
  const root = resolve(process.cwd(), "..");
  const own = readFileSync(
    join(root, "ts/test/research-v013-grounded-relational-execution-a73h.test.ts"),
    "utf8",
  );
  const begin = own.indexOf("function reactGroundedScope(");
  const end = own.indexOf("\nfunction exercise(", begin);
  assert(begin >= 0 && end > begin, "grounded reaction source slice");
  const kernel = own.slice(begin, end);

  for (const forbidden of [
    "unify",
    "Template",
    "Role",
    "StructuralRule",
    "RuleKind",
    "opcode",
    "selectedRule",
    "selectedBranch",
    "readContext",
    "switch(",
  ]) {
    assert(!kernel.includes(forbidden),
      "grounded reaction excludes matcher/template semantic mechanism: " + forbidden);
  }
  assert(kernel.includes("memory.ensure(truth.start, output)"),
    "kernel is literal context-preserving relational composition");
  assert(kernel.includes("if (images.length === 0)"),
    "absence of relation preserves current truth");
  assert(kernel.includes("if (matchedRelations === 0)"),
    "quiescence is generic no-relation fixed point");

  const structural = readFileSync(
    join(root, "ts/src/v013-structural-execution.ts"),
    "utf8",
  );
  assert(structural.includes("unifyStructuralRuleTemplate("),
    "A73h attacks exact remaining production matcher residual");
  assert(structural.includes("instantiateV013StructuralTemplate("),
    "A73h attacks exact remaining production template-instantiation residual");
}

function main(): void {
  exercise();
  staticGuards();

  console.log([
    "MTS v0.13 A73h: GROUNDED_RELATIONAL_EXECUTION=GREEN_SCOPED_RESEARCH",
    "LAW=K_TO_A_PLUS_ADMITTED_A_TO_BUNDLE_GIVES_K_TO_OUTPUT_BUNDLE",
    "MTS_SET_OBJECT=ABSENT_OUTPUTS_ARE_EXACT_SEQUENCE_CARRIER",
    "ONE_TO_ZERO=GREEN",
    "ONE_TO_MANY=GREEN",
    "N_TO_ONE_CANONICAL_CONVERGENCE=GREEN",
    "BRANCH_DEPTH_SKEW=GREEN",
    "NO_RELATION_PRESERVES_CURRENT_TRUTH=GREEN",
    "EXPLICIT_EMPTY_RELATION_REMOVES_CURRENT_TRUTH=GREEN",
    "FOREIGN_THEORY_RELATION=INERT",
    "HOST_RULE_MATCHER=0",
    "HOST_TEMPLATE_INSTANTIATOR=0",
    "HOST_FUNCTION_OPCODE_DISPATCH=0",
    "RELATIONAL_KERNEL_CONTEXT_PRESERVATION=ONE_GENERIC_ENSURE",
    "GROUNDED_EXECUTION_SEMANTICS=LINK_CARRIED_RELATION",
    "GENERIC_RULE_GROUNDING_OR_SELF_GENERATION=OPEN",
    "PRODUCTION_STRUCTURAL_EXECUTOR=UNCHANGED",
    "FULL_SELF_HOSTED=NOT_YET_CLAIMED",
    "V013_NOT_ACCEPTED",
  ].join(" "));
}

main();
