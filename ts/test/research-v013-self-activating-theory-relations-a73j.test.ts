import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { materializeExactSequence, readExactSequence } from "../src/exact-sequence.js";
import { Memory, ensureRootBasis, type LinkHandle } from "../src/memory.js";

function assert(c: unknown, m: string): asserts c {
  if (!c) throw new Error("v0.13 A73j self-activating Theory relations: " + m);
}
function same<T>(a: T, e: T, m: string): void {
  assert(Object.is(a, e), m + ": values differ");
}
function setSame(actual: readonly LinkHandle[], expected: readonly LinkHandle[], m: string): void {
  same(actual.length, new Set(expected).size, m + " cardinality");
  for (const x of expected) assert(actual.includes(x), m + " missing item");
}

interface ScopeView {
  readonly theory: LinkHandle;
  readonly members: readonly LinkHandle[];
}

function defineScope(
  memory: Memory,
  seed: LinkHandle,
  theory: LinkHandle,
  members: readonly LinkHandle[],
): LinkHandle {
  const scope = memory.ensureStartSelfClosed(memory.ensure(seed, theory));
  for (const member of members) memory.ensure(scope, member);
  return scope;
}

function readScope(memory: Memory, scope: LinkHandle): ScopeView {
  const sp = memory.poles(scope);
  assert(sp.start === scope, "Scope must be START self-closed");
  const theory = memory.poles(sp.end).end;
  const members: LinkHandle[] = [];
  for (const attachment of memory.outgoing(scope)) {
    if (attachment === scope) continue;
    const p = memory.poles(attachment);
    if (p.start === scope) members.push(p.end);
  }
  return Object.freeze({ theory, members: Object.freeze(members) });
}

class Cursor {
  constructor(
    private readonly memory: Memory,
    private scope: LinkHandle,
  ) {
    readScope(memory, scope);
  }
  currentScope(): LinkHandle { return this.scope; }
  members(): readonly LinkHandle[] { return readScope(this.memory, this.scope).members; }
  switchAtomically(expectedOld: LinkHandle, next: LinkHandle): void {
    same(this.scope, expectedOld, "expected old Scope");
    this.scope = next;
  }
}

function relationData(
  memory: Memory,
  antecedent: LinkHandle,
  outputs: readonly LinkHandle[],
): LinkHandle {
  return memory.ensure(antecedent, materializeExactSequence(memory, outputs));
}

/**
 * A73j activation law:
 *
 *   admission = Theory -> relation
 *   relation  = A -> exactSequence(B...)
 *
 * No A -> admission index exists or participates. The current Theory itself
 * is the complete authority frontier for grounded executable relations.
 */
function admitRelation(
  memory: Memory,
  theory: LinkHandle,
  relation: LinkHandle,
): LinkHandle {
  return memory.ensure(theory, relation);
}

interface Image {
  readonly admission: LinkHandle;
  readonly relation: LinkHandle;
  readonly outputs: readonly LinkHandle[];
}

function discoverTheoryImages(
  memory: Memory,
  theory: LinkHandle,
  antecedent: LinkHandle,
): readonly Image[] {
  const found: Image[] = [];

  for (const admission of memory.outgoing(theory)) {
    if (admission === theory) continue;
    const ap = memory.poles(admission);
    if (ap.start !== theory || ap.end === admission) continue;

    const relation = ap.end;
    const rp = memory.poles(relation);
    if (rp.start !== antecedent) continue;

    try {
      found.push(Object.freeze({
        admission,
        relation,
        outputs: readExactSequence(memory, rp.end).values,
      }));
    } catch {
      // A current Theory may carry unrelated admitted structures. Only exact
      // A -> exactSequence(B...) shapes are executable grounded relations.
    }
  }

  return Object.freeze(found);
}

interface Reaction {
  readonly after: readonly LinkHandle[];
  readonly matches: number;
  readonly transitioned: number;
  readonly quiescent: boolean;
  readonly handoffCount: 0 | 1;
}

function react(
  memory: Memory,
  cursor: Cursor,
  nextSeed: LinkHandle,
): Reaction {
  const oldScope = cursor.currentScope();
  const { theory, members } = readScope(memory, oldScope);
  const after: LinkHandle[] = [];
  let matches = 0;
  let transitioned = 0;

  for (const member of members) {
    const truth = memory.poles(member);
    const images = discoverTheoryImages(memory, theory, truth.end);

    if (images.length === 0) {
      after.push(member);
      continue;
    }

    transitioned += 1;
    matches += images.length;
    for (const image of images) {
      for (const output of image.outputs) {
        after.push(memory.ensure(truth.start, output));
      }
    }
  }

  if (matches === 0) {
    return Object.freeze({
      after: members,
      matches,
      transitioned,
      quiescent: true,
      handoffCount: 0 as const,
    });
  }

  const unique = Object.freeze([...new Set(after)]);
  cursor.switchAtomically(oldScope, defineScope(memory, nextSeed, theory, unique));
  return Object.freeze({
    after: unique,
    matches,
    transitioned,
    quiescent: false,
    handoffCount: 1 as const,
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
    const x = fresh[i];
    assert(x !== undefined, "fresh anchor " + i);
    return x;
  };

  const theory = memory.ensure(at(0), at(1));
  const foreignTheory = memory.ensure(at(2), at(3));
  const BOOT = memory.ensure(at(4), at(5));
  const A = memory.ensure(at(6), at(7));
  const B = memory.ensure(at(8), at(9));
  const C = memory.ensure(at(10), at(11));
  const K = memory.ensure(at(12), at(13));

  // Candidate executable relation starts as ordinary data only.
  const candidate = relationData(memory, A, [B]);
  same(memory.find(theory, candidate), undefined,
    "candidate Theory admission absent initially");

  // Foreign authority for the same antecedent must stay inert.
  const foreignCandidate = relationData(memory, A, [C]);
  admitRelation(memory, foreignTheory, foreignCandidate);

  // Bootstrap executable relation under current Theory:
  //
  //   BOOT -> [candidate]
  //
  // Applied in context Theory, this will materialize:
  //
  //   Theory -> candidate
  const bootstrap = relationData(memory, BOOT, [candidate]);
  admitRelation(memory, theory, bootstrap);

  // Add an unrelated Theory attachment that is deliberately not a grounded
  // relation, proving Theory scanning is structural/fail-closed rather than
  // "every outgoing Theory Link is executable".
  memory.ensure(theory, memory.ensureEndSelfClosed(at(20)));

  const seedTruth = memory.ensure(theory, BOOT);
  const targetTruth = memory.ensure(K, A);
  const cursor = new Cursor(
    memory,
    defineScope(memory, at(30), theory, [seedTruth, targetTruth]),
  );

  same(memory.find(theory, candidate), undefined,
    "candidate remains non-admitted immediately before round1");
  const bootBefore = discoverTheoryImages(memory, theory, BOOT);
  const aBefore = discoverTheoryImages(memory, theory, A);
  assert(bootBefore.length === 1,
    "pre-round1 BOOT image count=" + bootBefore.length);
  assert(bootBefore[0]!.relation === bootstrap,
    "pre-round1 BOOT image is exact bootstrap relation");
  assert(aBefore.length === 0,
    "pre-round1 A image count=" + aBefore.length +
    " candidate=" + aBefore.some((x) => x.relation === candidate) +
    " foreign=" + aBefore.some((x) => x.relation === foreignCandidate));

  // Round 1 dynamically admits candidate. Because execution writes generated
  // Links into the same Memory while walking the immutable current Scope
  // snapshot, the later sibling K->A can immediately observe the freshly
  // generated Theory->candidate admission in this same reaction.
  const r1 = react(memory, cursor, at(31));
  same(r1.quiescent, false, "round1 bootstrap and generated candidate fire");
  assert(r1.matches === 2,
    "round1 bootstrap plus generated candidate match; actual=" + r1.matches);
  same(r1.transitioned, 2,
    "round1 generator and later target sibling both transition");

  const admission = memory.find(theory, candidate);
  assert(admission !== undefined,
    "round1 materializes Theory->candidate");
  setSame(r1.after, [admission, memory.ensure(K, B)],
    "same reaction publishes admission and reduced target");
  assert(!r1.after.includes(memory.ensure(K, C)),
    "foreign Theory candidate remains inert");

  // No antecedent-local activation edge exists before or after activation.
  same(memory.find(A, admission), undefined,
    "A->admission local activation index absent");

  // Round 2 is already the fixed point. No host registration pass occurred
  // between generation and use of the candidate relation.
  const r2 = react(memory, cursor, at(32));
  same(r2.quiescent, true, "round2 fixed point");
  same(r2.handoffCount, 0, "quiescence has no handoff");
  setSame(r2.after, r1.after, "fixed point unchanged");
  same(memory.find(A, admission), undefined,
    "local activation index remains absent after successful self-activation");
}

function staticGuards(): void {
  const root = resolve(process.cwd(), "..");
  const own = readFileSync(
    join(root, "ts/test/research-v013-self-activating-theory-relations-a73j.test.ts"),
    "utf8",
  );

  const begin = own.indexOf("function discoverTheoryImages(");
  const end = own.indexOf("\ninterface Reaction", begin);
  assert(begin >= 0 && end > begin, "discovery source slice");
  const discovery = own.slice(begin, end);

  assert(discovery.includes("memory.outgoing(theory)"),
    "activation frontier derives from current Theory");
  assert(!discovery.includes("memory.outgoing(antecedent)"),
    "no antecedent-local activation index is consulted");
  assert(!discovery.includes("memory.find(antecedent"),
    "no antecedent-local registration lookup exists");

  const reactionBegin = own.indexOf("function react(");
  const reactionEnd = own.indexOf("\nfunction exercise(", reactionBegin);
  const kernel = own.slice(reactionBegin, reactionEnd);
  for (const forbidden of [
    "RuleKind",
    "opcode",
    "selectedRule",
    "selectedBranch",
    "StructuralRule",
    "unify",
    "Template",
    "Role",
    "switch(",
  ]) {
    assert(!kernel.includes(forbidden),
      "self-activating grounded kernel excludes semantic dispatcher " + forbidden);
  }

  const a73i = readFileSync(
    join(root, "ts/test/research-v013-self-admission-local-index-a73i.test.ts"),
    "utf8",
  );
  assert(a73i.includes("SELF_ADMISSION_LOCAL_INDEX_FALSIFIER=GREEN_FALSIFIER"),
    "A73i exact local-index falsifier remains retained");
}

function main(): void {
  exercise();
  staticGuards();

  console.log([
    "MTS v0.13 A73j: SELF_ACTIVATING_THEORY_RELATIONS=GREEN_SCOPED_RESEARCH",
    "THEORY_IS_EXECUTABLE_RELATION_AUTHORITY_FRONTIER=TRUE",
    "ANTECEDENT_TO_ADMISSION_LOCAL_INDEX=REMOVED",
    "BOOTSTRAP_RELATION_GENERATES_THEORY_TO_CANDIDATE=GREEN",
    "GENERATED_THEORY_TO_CANDIDATE_SELF_ACTIVATES_SAME_REACTION=GREEN",
    "LIVE_MEMORY_EFFECT_WITH_IMMUTABLE_SCOPE_SNAPSHOT=OBSERVED",
    "REACTION_COUNT_SCHEDULE_INVARIANCE=OPEN_NEXT_A73K",
    "HOST_REGISTRATION_PASS=0",
    "HOST_RULE_MATCHER=0",
    "HOST_TEMPLATE_INSTANTIATOR=0",
    "FOREIGN_THEORY_RELATION=INERT",
    "UNRELATED_THEORY_ATTACHMENT=FAIL_CLOSED",
    "SAME_LINK_CAN_BE_CURRENT_TRUTH_AND_EXECUTABLE_ADMISSION=TRUE",
    "RELATIONAL_NETWORK_CAN_EXTEND_ITS_OWN_EXECUTABLE_RELATION_SET=GREEN",
    "EXACT_SEQUENCE_READER=HOST_CARRIER_RESIDUAL",
    "OPAQUE_CURRENT_ROOT=AMEMORY_SUBSTRATE_PER_A73G",
    "FULL_SELF_HOSTED=NOT_YET_CLAIMED",
    "NEXT=A73K_REVERSE_SIBLING_ORDER_AND_PROVE_SAME_FIXED_POINT",
    "A72U_A72V=RETAINED_DEFERRED",
    "V013_NOT_ACCEPTED",
  ].join(" "));
}

main();
