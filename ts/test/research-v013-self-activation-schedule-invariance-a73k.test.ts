import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { materializeExactSequence } from "../src/exact-sequence.js";
import { Memory, ensureRootBasis, type LinkHandle } from "../src/memory.js";
import {
  V013GroundedScopeCursor,
  defineV013GroundedExecutionScope,
  reactV013GroundedScope,
} from "../src/v013-grounded-execution.js";

function assert(c: unknown, m: string): asserts c {
  if (!c) throw new Error("v0.13 A73k self-activation schedule invariance: " + m);
}
function same<T>(a: T, e: T, m: string): void {
  assert(Object.is(a, e), m + ": values differ");
}

function relationData(
  memory: Memory,
  antecedent: LinkHandle,
  outputs: readonly LinkHandle[],
): LinkHandle {
  return memory.ensure(antecedent, materializeExactSequence(memory, outputs));
}
function admitRelation(
  memory: Memory,
  theory: LinkHandle,
  relation: LinkHandle,
): LinkHandle {
  return memory.ensure(theory, relation);
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

  const cursor = new V013GroundedScopeCursor(
    memory,
    defineV013GroundedExecutionScope(memory, at(30), theory, initialMembers),
  );

  same(memory.find(theory, candidate), undefined,
    "candidate admission absent before first reaction");

  const matchesByReaction: number[] = [];
  let nonQuiescentReactions = 0;
  let totalReactionCalls = 0;
  for (const nextSeed of [at(31), at(32), at(33), at(34)]) {
    const result = reactV013GroundedScope(memory, cursor, nextSeed);
    matchesByReaction.push(result.matchedRelations);
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

  const production = readFileSync(
    join(root, "ts/src/v013-grounded-execution.ts"),
    "utf8",
  );
  assert(production.includes("memory.outgoing(theory)"),
    "production grounded executor uses Theory frontier");
  assert(!production.includes("memory.outgoing(antecedent)"),
    "production grounded executor has no local activation index");

  for (const forbidden of [
    "StructuralRule",
    "unifyStructural",
    "instantiateV013StructuralTemplate",
    "RuleKind",
    "opcode",
    "selectedRule",
    "selectedBranch",
  ]) {
    assert(!production.includes(forbidden),
      "production grounded executor excludes semantic dispatcher " + forbidden);
  }

  const own = readFileSync(
    join(root, "ts/test/research-v013-self-activation-schedule-invariance-a73k.test.ts"),
    "utf8",
  );
  assert(own.includes('from "../src/v013-grounded-execution.js"'),
    "A73k consumes production grounded execution module");
  assert(!own.includes("function discoverTheoryImages("),
    "A73k carries no test-local relation discovery");
  assert(!own.includes("function react(memory:"),
    "A73k carries no test-local reaction kernel");
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
    "MTS v0.13 A73l: PROMOTED_SELF_ACTIVATING_GROUNDED_EXECUTION=GREEN_SCOPED_RESEARCH",
    "A73K_PRODUCTION_MODULE_CONSUMER=TRUE",
    "GENERATOR_FIRST_MATCHES=2_0",
    "TARGET_FIRST_MATCHES=1_1_0",
    "FINAL_EXTENTIONAL_FIXED_POINT=SAME",
    "THEORY_FRONTIER=PRODUCTION_MODULE",
    "HOST_REGISTRATION_PASS=0",
    "ANTECEDENT_LOCAL_INDEX=0",
    "HOST_RULE_MATCHER=0",
    "HOST_TEMPLATE_INSTANTIATOR=0",
    "EXACT_SEQUENCE_READER=HOST_CARRIER_RESIDUAL",
    "NEXT=BIND_GROUNDED_EXECUTION_TO_V013_CANDIDATE_ARTIFACTS",
    "FULL_SELF_HOSTED=NOT_YET_CLAIMED",
    "A72U_A72V=RETAINED_DEFERRED",
    "V013_NOT_ACCEPTED",
  ].join(" "));
}
main();
