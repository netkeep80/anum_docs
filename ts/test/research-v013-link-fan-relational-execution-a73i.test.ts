import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
} from "../src/memory.js";

function assert(c: unknown, m: string): asserts c {
  if (!c) throw new Error("v0.13 A73i Link-fan relational execution: " + m);
}
function same<T>(a: T, e: T, m: string): void {
  assert(Object.is(a, e), m + ": values differ");
}
function setSame(
  actual: readonly LinkHandle[],
  expected: readonly LinkHandle[],
  message: string,
): void {
  same(actual.length, expected.length, message + " cardinality");
  for (const item of expected) assert(actual.includes(item), message + " missing item");
}

interface WorkingScope {
  readonly theory: LinkHandle;
  readonly members: readonly LinkHandle[];
}

function defineWorkingScope(
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

function readWorkingScope(memory: Memory, scope: LinkHandle): WorkingScope {
  const sp = memory.poles(scope);
  assert(sp.start === scope && sp.end !== scope, "working Scope is START");
  const descriptor = memory.poles(sp.end);
  const members: LinkHandle[] = [];
  for (const attachment of memory.outgoing(scope)) {
    if (attachment === scope) continue;
    const p = memory.poles(attachment);
    if (p.start === scope) members.push(p.end);
  }
  return Object.freeze({
    theory: descriptor.end,
    members: Object.freeze(members),
  });
}

class ScopeCursor {
  private scope: LinkHandle;
  constructor(
    private readonly memory: Memory,
    initialScope: LinkHandle,
  ) {
    readWorkingScope(memory, initialScope);
    this.scope = initialScope;
  }
  currentScope(): LinkHandle {
    return this.scope;
  }
  members(): readonly LinkHandle[] {
    return readWorkingScope(this.memory, this.scope).members;
  }
  switchAtomically(expectedOld: LinkHandle, next: LinkHandle): void {
    same(this.scope, expectedOld, "atomic handoff expected-old");
    readWorkingScope(this.memory, next);
    this.scope = next;
  }
}

/**
 * The relational image is an unordered Link fan:
 *
 *   image = START(seed)
 *   image -> B1
 *   image -> B2
 *   ...
 *
 * The START self-link makes the empty fan an existing Link identity, so
 * "admitted empty image" remains distinct from "no admitted relation".
 */
function defineImageFan(
  memory: Memory,
  seed: LinkHandle,
  outputs: readonly LinkHandle[],
): LinkHandle {
  const image = memory.ensureStartSelfClosed(seed);
  for (const output of outputs) memory.ensure(image, output);
  return image;
}

function readImageFan(
  memory: Memory,
  image: LinkHandle,
): readonly LinkHandle[] {
  const p = memory.poles(image);
  assert(p.start === image && p.end !== image, "image fan is START");
  const outputs: LinkHandle[] = [];
  for (const membership of memory.outgoing(image)) {
    if (membership === image) continue;
    const mp = memory.poles(membership);
    if (mp.start !== image) continue;
    if (!outputs.includes(mp.end)) outputs.push(mp.end);
  }
  return Object.freeze(outputs);
}

/**
 * Link-native admitted relation:
 *
 *   relation  = A -> imageFan
 *   admission = Theory -> relation
 *   trigger   = A -> admission
 *
 * The trigger is only a local discovery edge. Semantic multiplicity is not
 * stored in a JS Set/array-valued relation table or ExactSequence; it is the
 * fan of ordinary image -> B membership Links.
 */
function admitFanRelation(
  memory: Memory,
  theory: LinkHandle,
  antecedent: LinkHandle,
  imageSeed: LinkHandle,
  outputs: readonly LinkHandle[],
): LinkHandle {
  const image = defineImageFan(memory, imageSeed, outputs);
  const relation = memory.ensure(antecedent, image);
  const admission = memory.ensure(theory, relation);
  memory.ensure(antecedent, admission);
  return relation;
}

interface GroundedImage {
  readonly relation: LinkHandle;
  readonly image: LinkHandle;
  readonly outputs: readonly LinkHandle[];
}

function discoverFanImages(
  memory: Memory,
  theory: LinkHandle,
  antecedent: LinkHandle,
): readonly GroundedImage[] {
  const found: GroundedImage[] = [];
  for (const trigger of memory.outgoing(antecedent)) {
    if (trigger === antecedent) continue;
    const tp = memory.poles(trigger);
    if (tp.start !== antecedent) continue;

    const admission = tp.end;
    const ap = memory.poles(admission);
    if (ap.start !== theory || ap.end === admission) continue;

    const relation = ap.end;
    const rp = memory.poles(relation);
    if (rp.start !== antecedent) continue;

    const image = rp.end;
    const outputs = readImageFan(memory, image);
    found.push(Object.freeze({ relation, image, outputs }));
  }
  return Object.freeze(found);
}

interface Reaction {
  readonly before: readonly LinkHandle[];
  readonly after: readonly LinkHandle[];
  readonly matchedRelations: number;
  readonly transitionedMembers: number;
  readonly handoffCount: 0 | 1;
  readonly quiescent: boolean;
}

/**
 * Generalized relational composition over Link fans:
 *
 *   K -> A
 *   A -> fan(B_j)
 *   ----------------
 *   K -> B_j
 *
 * No host collection is the semantic image. The host loops only enumerate
 * Link adjacency supplied by Memory.
 */
function reactFanScope(
  memory: Memory,
  cursor: ScopeCursor,
  nextScopeSeed: LinkHandle,
): Reaction {
  const oldScope = cursor.currentScope();
  const { theory, members: before } = readWorkingScope(memory, oldScope);
  const produced: LinkHandle[] = [];
  let matchedRelations = 0;
  let transitionedMembers = 0;

  for (const member of before) {
    const truth = memory.poles(member);
    const images = discoverFanImages(memory, theory, truth.end);

    if (images.length === 0) {
      if (!produced.includes(member)) produced.push(member);
      continue;
    }

    transitionedMembers += 1;
    matchedRelations += images.length;
    for (const image of images) {
      for (const output of image.outputs) {
        const successor = memory.ensure(truth.start, output);
        if (!produced.includes(successor)) produced.push(successor);
      }
    }
  }

  if (matchedRelations === 0) {
    return Object.freeze({
      before,
      after: before,
      matchedRelations,
      transitionedMembers,
      handoffCount: 0 as const,
      quiescent: true,
    });
  }

  const nextScope = defineWorkingScope(memory, nextScopeSeed, theory, produced);
  cursor.switchAtomically(oldScope, nextScope);
  return Object.freeze({
    before,
    after: Object.freeze(produced),
    matchedRelations,
    transitionedMembers,
    handoffCount: 1 as const,
    quiescent: false,
  });
}

interface Fixture {
  readonly memory: Memory;
  readonly theoryA: LinkHandle;
  readonly theoryB: LinkHandle;
  readonly initial: readonly LinkHandle[];
  readonly expectedRound1: readonly LinkHandle[];
  readonly expectedRound2: readonly LinkHandle[];
  readonly fresh: readonly LinkHandle[];
}

function buildFixture(): Fixture {
  const memory = new Memory();
  const b = ensureRootBasis(memory);

  let seed = memory.ensure(b.U, b.L);
  const fresh: LinkHandle[] = [];
  for (let i = 0; i < 150; i += 1) {
    seed = memory.ensure(seed, i % 2 === 0 ? b.O : b.C);
    fresh.push(seed);
  }
  const at = (i: number): LinkHandle => {
    const x = fresh[i];
    assert(x !== undefined, "fresh anchor " + i);
    return x;
  };

  const theoryA = memory.ensure(at(0), at(1));
  const theoryB = memory.ensure(at(2), at(3));
  const K = memory.ensure(at(4), at(5));
  const K0 = memory.ensure(at(6), at(7));

  const A = memory.ensure(at(8), at(9));
  const B = memory.ensure(at(10), at(11));
  const C = memory.ensure(at(12), at(13));
  const D = memory.ensure(at(14), at(15));
  const P = memory.ensure(at(16), at(17));
  const Q = memory.ensure(at(18), at(19));
  const E = memory.ensure(at(20), at(21));
  const ZERO = memory.ensure(at(22), at(23));
  const INERT = memory.ensure(at(24), at(25));

  // Same extensional relations under two Theories. A's image fan is authored
  // in opposite membership order to prove that the fan has no sequence order.
  admitFanRelation(memory, theoryA, A, at(30), [B, C]);
  admitFanRelation(memory, theoryA, B, at(31), [D]);
  admitFanRelation(memory, theoryA, P, at(32), [E]);
  admitFanRelation(memory, theoryA, Q, at(33), [E]);
  admitFanRelation(memory, theoryA, ZERO, at(34), []);

  admitFanRelation(memory, theoryB, A, at(40), [C, B]);
  admitFanRelation(memory, theoryB, B, at(41), [D]);
  admitFanRelation(memory, theoryB, P, at(42), [E]);
  admitFanRelation(memory, theoryB, Q, at(43), [E]);
  admitFanRelation(memory, theoryB, ZERO, at(44), []);

  const initial = Object.freeze([
    memory.ensure(K, A),
    memory.ensure(K, P),
    memory.ensure(K, Q),
    memory.ensure(K0, ZERO),
    memory.ensure(K0, INERT),
  ]);
  const expectedRound1 = Object.freeze([
    memory.ensure(K, B),
    memory.ensure(K, C),
    memory.ensure(K, E),
    memory.ensure(K0, INERT),
  ]);
  const expectedRound2 = Object.freeze([
    memory.ensure(K, D),
    memory.ensure(K, C),
    memory.ensure(K, E),
    memory.ensure(K0, INERT),
  ]);

  return Object.freeze({
    memory,
    theoryA,
    theoryB,
    initial,
    expectedRound1,
    expectedRound2,
    fresh: Object.freeze(fresh),
  });
}

interface Run {
  readonly round1: Reaction;
  readonly round2: Reaction;
  readonly round3: Reaction;
  readonly final: readonly LinkHandle[];
}

function run(
  f: Fixture,
  theory: LinkHandle,
  seedOffset: number,
): Run {
  const at = (i: number): LinkHandle => {
    const x = f.fresh[i];
    assert(x !== undefined, "run anchor " + i);
    return x;
  };
  const initialScope = defineWorkingScope(
    f.memory,
    at(seedOffset),
    theory,
    f.initial,
  );
  const cursor = new ScopeCursor(f.memory, initialScope);
  const round1 = reactFanScope(f.memory, cursor, at(seedOffset + 1));
  const round2 = reactFanScope(f.memory, cursor, at(seedOffset + 2));
  const round3 = reactFanScope(f.memory, cursor, at(seedOffset + 3));
  return Object.freeze({
    round1,
    round2,
    round3,
    final: cursor.members(),
  });
}

function exercise(): void {
  const f = buildFixture();
  const a = run(f, f.theoryA, 80);
  const b = run(f, f.theoryB, 90);

  for (const [label, x] of [["A", a], ["B", b]] as const) {
    same(x.round1.quiescent, false, label + " round1 transitions");
    same(x.round1.matchedRelations, 4, label + " round1 four relations");
    same(x.round1.transitionedMembers, 4, label + " round1 four members transition");
    same(x.round1.handoffCount, 1, label + " round1 one handoff");
    setSame(x.round1.after, f.expectedRound1, label + " round1 fan image");

    same(x.round2.quiescent, false, label + " round2 branch skew");
    same(x.round2.matchedRelations, 1, label + " round2 only B continues");
    same(x.round2.transitionedMembers, 1, label + " round2 one member transitions");
    setSame(x.round2.after, f.expectedRound2, label + " round2 mixed stable/active");

    same(x.round3.quiescent, true, label + " round3 fixed point");
    same(x.round3.handoffCount, 0, label + " quiescence no handoff");
    setSame(x.final, f.expectedRound2, label + " final fixed point");
  }

  setSame(a.final, b.final,
    "opposite fan membership order is extensionally inert");

  const zeroTruth = f.initial[3]!;
  assert(!a.round1.after.includes(zeroTruth),
    "admitted empty Link fan removes ZERO truth");
  const inertTruth = f.initial[4]!;
  assert(a.round1.after.includes(inertTruth),
    "absence of admitted relation preserves INERT truth");
}

function staticGuards(): void {
  const root = resolve(process.cwd(), "..");
  const own = readFileSync(
    join(root, "ts/test/research-v013-link-fan-relational-execution-a73i.test.ts"),
    "utf8",
  );

  assert(!own.includes("exact-sequence"),
    "A73i has no ExactSequence module dependency");
  assert(!own.includes("materializeExactSequence"),
    "A73i has no ordered output bundle materialization");
  assert(!own.includes("readExactSequence"),
    "A73i has no ordered output bundle read");

  const fanStart = own.indexOf("function defineImageFan(");
  const fanEnd = own.indexOf("\n/**\n * Link-native admitted relation:", fanStart);
  assert(fanStart >= 0 && fanEnd > fanStart, "fan carrier source slice");
  const fan = own.slice(fanStart, fanEnd);
  assert(fan.includes("memory.ensure(image, output)"),
    "semantic image is a fan of ordinary membership Links");
  assert(!fan.includes("new Set"),
    "fan carrier does not use host Set as semantic image");

  const reactStart = own.indexOf("function reactFanScope(");
  const reactEnd = own.indexOf("\ninterface Fixture", reactStart);
  assert(reactStart >= 0 && reactEnd > reactStart, "reaction source slice");
  const reaction = own.slice(reactStart, reactEnd);
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
    "ExactSequence",
    "new Set",
    "Set<",
    "switch(",
  ]) {
    assert(!reaction.includes(forbidden),
      "fan reaction excludes non-relational semantic mechanism: " + forbidden);
  }
  assert(reaction.includes("memory.ensure(truth.start, output)"),
    "reaction remains literal relational composition");

  const prior = readFileSync(
    join(root, "ts/test/research-v013-grounded-relational-execution-a73h.test.ts"),
    "utf8",
  );
  assert(prior.includes("GROUNDED_RELATIONAL_EXECUTION=GREEN_SCOPED_RESEARCH"),
    "A73h ExactSequence baseline remains retained");
}

function main(): void {
  exercise();
  staticGuards();
  console.log([
    "MTS v0.13 A73i: LINK_FAN_RELATIONAL_EXECUTION=GREEN_SCOPED_RESEARCH",
    "RELATIONAL_IMAGE=LINK_FAN_NOT_SEQUENCE",
    "HOST_SET_AS_SEMANTIC_IMAGE=0",
    "EXACT_SEQUENCE_DEPENDENCY=0",
    "EMPTY_FAN=EXPLICIT_ZERO_IMAGE",
    "NO_RELATION=PRESERVE_CURRENT_TRUTH",
    "ONE_TO_ZERO=GREEN",
    "ONE_TO_MANY=GREEN",
    "N_TO_ONE_CANONICAL_CONVERGENCE=GREEN",
    "BRANCH_DEPTH_SKEW=GREEN",
    "FAN_MEMBERSHIP_ORDER=EXTENSIONALLY_INERT",
    "HOST_RULE_MATCHER=0",
    "HOST_TEMPLATE_INSTANTIATOR=0",
    "HOST_FUNCTION_OPCODE_DISPATCH=0",
    "INNER_LAW=PURE_CONTEXT_PRESERVING_RELATIONAL_COMPOSITION",
    "GENERIC_RULE_GROUNDING_OR_SELF_GENERATION=OPEN",
    "PRODUCTION_STRUCTURAL_EXECUTOR=UNCHANGED",
    "FULL_SELF_HOSTED=NOT_YET_CLAIMED",
    "A72U_A72V=RETAINED_DEFERRED",
    "V013_NOT_ACCEPTED",
  ].join(" "));
}

main();
