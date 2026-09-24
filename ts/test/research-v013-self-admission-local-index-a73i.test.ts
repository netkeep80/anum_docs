import { materializeExactSequence, readExactSequence } from "../src/exact-sequence.js";
import { Memory, ensureRootBasis, type LinkHandle } from "../src/memory.js";

function assert(c: unknown, m: string): asserts c {
  if (!c) throw new Error("v0.13 A73i self-admission index falsifier: " + m);
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

function admitWithLocalIndex(
  memory: Memory,
  theory: LinkHandle,
  relation: LinkHandle,
): LinkHandle {
  const antecedent = memory.poles(relation).start;
  const admission = memory.ensure(theory, relation);
  memory.ensure(antecedent, admission);
  return admission;
}

interface Image {
  readonly relation: LinkHandle;
  readonly outputs: readonly LinkHandle[];
}

/**
 * Source-equivalent A73h discovery boundary:
 * executable admission is reachable only through antecedent -> admission index.
 */
function discoverA73hImages(
  memory: Memory,
  theory: LinkHandle,
  antecedent: LinkHandle,
): readonly Image[] {
  const found: Image[] = [];
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
      outputs: readExactSequence(memory, rp.end).values,
    }));
  }
  return Object.freeze(found);
}

interface Reaction {
  readonly after: readonly LinkHandle[];
  readonly matches: number;
  readonly quiescent: boolean;
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

  for (const member of members) {
    const truth = memory.poles(member);
    const images = discoverA73hImages(memory, theory, truth.end);
    if (images.length === 0) {
      after.push(member);
      continue;
    }
    matches += images.length;
    for (const image of images) {
      for (const output of image.outputs) {
        after.push(memory.ensure(truth.start, output));
      }
    }
  }

  if (matches === 0) {
    return Object.freeze({ after: members, matches, quiescent: true });
  }

  const unique = Object.freeze([...new Set(after)]);
  cursor.switchAtomically(oldScope, defineScope(memory, nextSeed, theory, unique));
  return Object.freeze({ after: unique, matches, quiescent: false });
}

function exercise(): void {
  const memory = new Memory();
  const b = ensureRootBasis(memory);
  let seed = memory.ensure(b.U, b.L);
  const fresh: LinkHandle[] = [];
  for (let i = 0; i < 100; i += 1) {
    seed = memory.ensure(seed, i % 2 === 0 ? b.O : b.C);
    fresh.push(seed);
  }
  const at = (i: number): LinkHandle => {
    const x = fresh[i];
    assert(x !== undefined, "fresh anchor " + i);
    return x;
  };

  const theory = memory.ensure(at(0), at(1));
  const BOOT = memory.ensure(at(2), at(3));
  const A = memory.ensure(at(4), at(5));
  const B = memory.ensure(at(6), at(7));
  const K = memory.ensure(at(8), at(9));

  // Candidate executable relation exists only as data.
  const candidate = relationData(memory, A, [B]);
  same(
    memory.find(theory, candidate),
    undefined,
    "candidate is data only: Theory admission absent before execution",
  );

  // Bootstrap relation is executable and emits candidate relation under Theory:
  //
  //   Theory -> BOOT
  //   BOOT -> [candidate]
  //   -------------------
  //   Theory -> candidate
  //
  const bootstrap = relationData(memory, BOOT, [candidate]);
  admitWithLocalIndex(memory, theory, bootstrap);

  const seedTruth = memory.ensure(theory, BOOT);
  const targetTruth = memory.ensure(K, A);
  const initial = defineScope(memory, at(20), theory, [seedTruth, targetTruth]);
  const cursor = new Cursor(memory, initial);

  const r1 = react(memory, cursor, at(21));
  same(r1.quiescent, false, "bootstrap relation fires");
  const candidateAdmission = memory.find(theory, candidate);
  assert(candidateAdmission !== undefined,
    "first relational reaction physically materializes Theory->candidate");
  setSame(r1.after, [candidateAdmission, targetTruth],
    "reaction publishes generated Theory->candidate plus untouched target");
  assert(
    memory.find(A, candidateAdmission) === undefined,
    "execution generated no host-authored local activation index",
  );

  // Falsifier: candidate is now present as Theory->relation, but A73h local
  // discovery still cannot execute it because the separate A->admission index
  // was not produced by the relational law.
  const r2 = react(memory, cursor, at(22));
  same(r2.quiescent, true,
    "current A73h carrier cannot activate dynamically admitted relation");
  setSame(r2.after, [candidateAdmission, targetTruth],
    "target remains unreduced despite generated Theory admission");
  assert(!r2.after.includes(memory.ensure(K, B)),
    "self-admitted candidate did not become executable");

  // Control: adding the missing local index immediately activates candidate,
  // proving the missing capability is activation reachability, not relation law.
  memory.ensure(A, candidateAdmission);
  const r3 = react(memory, cursor, at(23));
  same(r3.quiescent, false, "control local index activates candidate");
  assert(r3.after.includes(memory.ensure(K, B)),
    "indexed candidate executes through unchanged grounded law");
}

function main(): void {
  exercise();
  console.log([
    "MTS v0.13 A73i: SELF_ADMISSION_LOCAL_INDEX_FALSIFIER=GREEN_FALSIFIER",
    "GROUND_RELATION_AS_DATA=GREEN",
    "RELATIONAL_BOOTSTRAP_EMITS_THEORY_TO_RELATION=GREEN",
    "DYNAMIC_THEORY_ADMISSION_BECOMES_EXECUTABLE_UNDER_A73H=FALSE",
    "EXACT_MISSING_CAPABILITY=SELF_GENERATED_ACTIVATION_REACHABILITY",
    "A73H_LOCAL_INDEX=A_TO_ADMISSION_HOST_AUTHORED_RESIDUAL",
    "ADDING_ONLY_LOCAL_INDEX_ACTIVATES_CANDIDATE=GREEN_CONTROL",
    "NEXT=A73J_REMOVE_OR_SELF_GENERATE_LOCAL_INDEX",
    "FULL_SELF_HOSTED=FALSE",
    "V013_NOT_ACCEPTED PRODUCTION_UNCHANGED",
  ].join(" "));
}

main();
