import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { materializeExactSequence, readExactSequence } from "../src/exact-sequence.js";
import { Memory, ensureRootBasis, type LinkHandle } from "../src/memory.js";

function assert(c: unknown, m: string): asserts c {
  if (!c) throw new Error("v0.13 A73k self-activation schedule invariance: " + m);
}
function same<T>(a: T, e: T, m: string): void {
  assert(Object.is(a, e), m + ": values differ");
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
  assert(sp.start === scope, "Scope START");
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
function admitRelation(memory: Memory, theory: LinkHandle, relation: LinkHandle): LinkHandle {
  return memory.ensure(theory, relation);
}
interface Image {
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
        relation,
        outputs: readExactSequence(memory, rp.end).values,
      }));
    } catch {
      // Unrelated Theory topology is not an executable grounded relation.
    }
  }
  return Object.freeze(found);
}

interface Reaction {
  readonly matches: number;
  readonly quiescent: boolean;
}
function react(memory: Memory, cursor: Cursor, nextSeed: LinkHandle): Reaction {
  const oldScope = cursor.currentScope();
  const { theory, members } = readScope(memory, oldScope);
  const after: LinkHandle[] = [];
  let matches = 0;

  for (const member of members) {
    const truth = memory.poles(member);
    const images = discoverTheoryImages(memory, theory, truth.end);
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

  if (matches === 0) return Object.freeze({ matches, quiescent: true });

  cursor.switchAtomically(
    oldScope,
    defineScope(memory, nextSeed, theory, Object.freeze([...new Set(after)])),
  );
  return Object.freeze({ matches, quiescent: false });
}

interface Outcome {
  readonly signature: string;
  readonly matchesByReaction: readonly number[];
  readonly nonQuiescentReactions: number;
  readonly totalReactionCalls: number;
}

function run(generatorFirst: boolean): Outcome {
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
    assert(x !== undefined, "fresh " + i);
    return x;
  };

  const theory = memory.ensure(at(0), at(1));
  const foreignTheory = memory.ensure(at(2), at(3));
  const BOOT = memory.ensure(at(4), at(5));
  const A = memory.ensure(at(6), at(7));
  const B = memory.ensure(at(8), at(9));
  const C = memory.ensure(at(10), at(11));
  const K = memory.ensure(at(12), at(13));

  const candidate = relationData(memory, A, [B]);
  const foreignCandidate = relationData(memory, A, [C]);
  admitRelation(memory, foreignTheory, foreignCandidate);

  const bootstrap = relationData(memory, BOOT, [candidate]);
  admitRelation(memory, theory, bootstrap);

  const generator = memory.ensure(theory, BOOT);
  const target = memory.ensure(K, A);
  const initialMembers = generatorFirst
    ? Object.freeze([generator, target])
    : Object.freeze([target, generator]);

  const cursor = new Cursor(
    memory,
    defineScope(memory, at(30), theory, initialMembers),
  );

  same(memory.find(theory, candidate), undefined,
    "candidate admission absent before first reaction");

  const matchesByReaction: number[] = [];
  let nonQuiescentReactions = 0;
  let totalReactionCalls = 0;
  for (const nextSeed of [at(31), at(32), at(33), at(34)]) {
    const result = react(memory, cursor, nextSeed);
    matchesByReaction.push(result.matches);
    totalReactionCalls += 1;
    if (result.quiescent) break;
    nonQuiescentReactions += 1;
  }

  const admission = memory.find(theory, candidate);
  assert(admission !== undefined, "generated candidate admission exists");
  same(memory.find(A, admission), undefined,
    "no antecedent-local activation index");

  const KB = memory.ensure(K, B);
  const KA = memory.ensure(K, A);
  const KC = memory.ensure(K, C);
  const members = cursor.members();

  same(members.length, 2, "final member cardinality");
  assert(members.includes(admission), "final generated admission remains");
  assert(members.includes(KB), "final K->B result remains");
  assert(!members.includes(KA), "K->A fully reduced");
  assert(!members.includes(KC), "foreign Theory output absent");

  return Object.freeze({
    signature: JSON.stringify({
      count: members.length,
      admission: members.includes(admission),
      KB: members.includes(KB),
      KA: members.includes(KA),
      KC: members.includes(KC),
    }),
    matchesByReaction: Object.freeze(matchesByReaction),
    nonQuiescentReactions,
    totalReactionCalls,
  });
}

function staticGuards(): void {
  const root = resolve(process.cwd(), "..");
  const a73j = readFileSync(
    join(root, "ts/test/research-v013-self-activating-theory-relations-a73j.test.ts"),
    "utf8",
  );
  assert(a73j.includes("SELF_ACTIVATING_THEORY_RELATIONS=GREEN_SCOPED_RESEARCH"),
    "A73j self-activation evidence retained");
  assert(a73j.includes("LIVE_MEMORY_EFFECT_WITH_IMMUTABLE_SCOPE_SNAPSHOT=OBSERVED"),
    "A73j same-reaction live-Memory observation retained");

  const own = readFileSync(
    join(root, "ts/test/research-v013-self-activation-schedule-invariance-a73k.test.ts"),
    "utf8",
  );
  const discoveryStart = own.indexOf("function discoverTheoryImages(");
  const discoveryEnd = own.indexOf("\ninterface Reaction", discoveryStart);
  const discovery = own.slice(discoveryStart, discoveryEnd);
  assert(discovery.includes("memory.outgoing(theory)"),
    "A73k uses Theory frontier");
  assert(!discovery.includes("memory.outgoing(antecedent)"),
    "A73k has no local activation index");
}

function main(): void {
  const generatorFirst = run(true);
  const targetFirst = run(false);

  same(generatorFirst.signature, targetFirst.signature,
    "opposite sibling schedules converge to same extensional fixed point");

  same(generatorFirst.nonQuiescentReactions, 1,
    "generator-first self-activates within same reaction");
  same(generatorFirst.totalReactionCalls, 2,
    "generator-first reaches quiescence on second call");
  same(generatorFirst.matchesByReaction.join(","), "2,0",
    "generator-first match schedule");

  same(targetFirst.nonQuiescentReactions, 2,
    "target-first requires one later activation reaction");
  same(targetFirst.totalReactionCalls, 3,
    "target-first reaches quiescence on third call");
  same(targetFirst.matchesByReaction.join(","), "1,1,0",
    "target-first match schedule");

  staticGuards();

  console.log([
    "MTS v0.13 A73k: SELF_ACTIVATION_SCHEDULE_INVARIANCE=GREEN_SCOPED_RESEARCH",
    "GENERATOR_FIRST_MATCHES=2_0",
    "TARGET_FIRST_MATCHES=1_1_0",
    "REACTION_COUNT_CAN_DIFFER=TRUE",
    "FINAL_EXTENTIONAL_FIXED_POINT=SAME",
    "SIBLING_ORDER_AFFECTS_TEMPORAL_PROPAGATION_ONLY=GREEN_SCOPED",
    "LIVE_MEMORY_SELF_ACTIVATION=GREEN",
    "HOST_REGISTRATION_PASS=0",
    "ANTECEDENT_LOCAL_INDEX=0",
    "FOREIGN_THEORY=INERT",
    "SCHEDULING_AS_SEMANTIC_AUTHORITY=NOT_OBSERVED_IN_TESTED_CASE",
    "NEXT=PRODUCTIONIZE_SELF_ACTIVATING_GROUNDED_EXECUTION",
    "EXACT_SEQUENCE_READER=HOST_CARRIER_RESIDUAL",
    "FULL_SELF_HOSTED=NOT_YET_CLAIMED",
    "A72U_A72V=RETAINED_DEFERRED",
    "V013_NOT_ACCEPTED",
  ].join(" "));
}
main();
