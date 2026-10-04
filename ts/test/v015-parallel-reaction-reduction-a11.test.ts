import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
} from "../src/memory.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`v0.15 A11 parallel reaction reduction: ${message}`);
  }
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}

function setSame<T>(
  actual: Iterable<T>,
  expected: Iterable<T>,
  message: string,
): void {
  const a = [...new Set(actual)];
  const e = [...new Set(expected)];
  same(a.length, e.length, `${message}: cardinality`);
  for (const value of e) {
    assert(a.includes(value), `${message}: missing expected value`);
  }
}

interface Rule {
  readonly antecedent: LinkHandle;
  readonly outputs: readonly LinkHandle[];
}

interface Contribution {
  readonly matched: boolean;
  readonly outputs: readonly LinkHandle[];
}

/**
 * Reduction algebra for independently computed pieces of one current member:
 *
 *   (m1,O1) (+) (m2,O2) = (m1 OR m2, O1 UNION O2)
 *
 * The "matched" bit MUST survive reduction separately from the output set:
 * (false,{}) means NO_MATCH and preserves current truth;
 * (true,{}) means matched-empty and removes it.
 */
function contribution(
  matched: boolean,
  outputs: Iterable<LinkHandle>,
): Contribution {
  return Object.freeze({
    matched,
    outputs: Object.freeze([...new Set(outputs)]),
  });
}

function combine(a: Contribution, b: Contribution): Contribution {
  return contribution(
    a.matched || b.matched,
    [...a.outputs, ...b.outputs],
  );
}

const ZERO_CONTRIBUTION = contribution(false, []);

function partial(
  endpoint: LinkHandle,
  rules: readonly Rule[],
): Contribution {
  let matched = false;
  const outputs: LinkHandle[] = [];

  for (const rule of rules) {
    if (rule.antecedent !== endpoint) continue;
    matched = true;
    for (const output of rule.outputs) {
      if (!outputs.includes(output)) outputs.push(output);
    }
  }

  return contribution(matched, outputs);
}

function finalizeCurrent(
  memory: Memory,
  truth: LinkHandle,
  reduced: Contribution,
): readonly LinkHandle[] {
  if (!reduced.matched) return Object.freeze([truth]);

  const K = memory.poles(truth).start;
  return Object.freeze(
    reduced.outputs.map((output) => memory.ensure(K, output)),
  );
}

interface ReactionResult {
  readonly successors: readonly LinkHandle[];
  readonly matchedCurrents: number;
  readonly reacted: boolean;
}

function reactWithRuleShards(
  memory: Memory,
  currents: readonly LinkHandle[],
  ruleShards: readonly (readonly Rule[])[],
): ReactionResult {
  const successors: LinkHandle[] = [];
  let matchedCurrents = 0;

  for (const truth of currents) {
    const endpoint = memory.poles(truth).end;
    let reduced = ZERO_CONTRIBUTION;

    // Every shard sees the SAME reaction-start truth and immutable Theory
    // snapshot. No shard is allowed to publish a local NO_MATCH successor.
    for (const shard of ruleShards) {
      reduced = combine(reduced, partial(endpoint, shard));
    }

    if (reduced.matched) matchedCurrents += 1;
    for (const successor of finalizeCurrent(memory, truth, reduced)) {
      if (!successors.includes(successor)) successors.push(successor);
    }
  }

  return Object.freeze({
    successors: Object.freeze(successors),
    matchedCurrents,
    reacted: matchedCurrents > 0,
  });
}

function reactWithCurrentAndRuleShards(
  memory: Memory,
  currentShards: readonly (readonly LinkHandle[])[],
  ruleShards: readonly (readonly Rule[])[],
): ReactionResult {
  const successors: LinkHandle[] = [];
  let matchedCurrents = 0;

  for (const currentShard of currentShards) {
    const result = reactWithRuleShards(memory, currentShard, ruleShards);
    matchedCurrents += result.matchedCurrents;
    for (const successor of result.successors) {
      if (!successors.includes(successor)) successors.push(successor);
    }
  }

  return Object.freeze({
    successors: Object.freeze(successors),
    matchedCurrents,
    reacted: matchedCurrents > 0,
  });
}

function permutations<T>(values: readonly T[]): readonly (readonly T[])[] {
  if (values.length <= 1) return Object.freeze([Object.freeze([...values])]);
  const result: T[][] = [];

  for (let i = 0; i < values.length; i += 1) {
    const head = values[i]!;
    const tail = [...values.slice(0, i), ...values.slice(i + 1)];
    for (const rest of permutations(tail)) {
      result.push([head, ...rest]);
    }
  }

  return Object.freeze(result.map((value) => Object.freeze(value)));
}

function naiveShardLocalNoMatch(
  memory: Memory,
  truth: LinkHandle,
  ruleShards: readonly (readonly Rule[])[],
): readonly LinkHandle[] {
  const endpoint = memory.poles(truth).end;
  const K = memory.poles(truth).start;
  const result: LinkHandle[] = [];

  for (const shard of ruleShards) {
    const local = partial(endpoint, shard);
    if (!local.matched) {
      // Deliberately WRONG: local shard cannot conclude global NO_MATCH.
      if (!result.includes(truth)) result.push(truth);
      continue;
    }
    for (const output of local.outputs) {
      const next = memory.ensure(K, output);
      if (!result.includes(next)) result.push(next);
    }
  }

  return Object.freeze(result);
}

function cascadingSameGeneration(
  memory: Memory,
  truth: LinkHandle,
  rules: readonly Rule[],
): readonly LinkHandle[] {
  let current = Object.freeze([truth]) as readonly LinkHandle[];

  // Deliberately WRONG hardware semantics: expose each newly produced result
  // immediately and keep reacting inside what is claimed to be one generation.
  for (let iteration = 0; iteration < 8; iteration += 1) {
    const next = reactWithRuleShards(memory, current, [rules]);
    if (!next.reacted) return current;
    current = next.successors;
  }

  return current;
}

const memory = new Memory();
const b = ensureRootBasis(memory);

let cursor = memory.ensure(b.U, b.L);
const atoms: LinkHandle[] = [];
for (let i = 0; i < 80; i += 1) {
  cursor = memory.ensure(cursor, i % 2 === 0 ? b.O : b.C);
  atoms.push(cursor);
}
const at = (index: number): LinkHandle => {
  const value = atoms[index];
  assert(value !== undefined, `atom ${index}`);
  return value;
};

const K0 = at(0);
const K1 = at(1);
const K2 = at(2);
const K3 = at(3);
const K4 = at(4);
const K5 = at(5);

const ANo = at(10);
const AEmpty = at(11);
const AOne = at(12);
const AMany = at(13);
const AMixed = at(14);
const AIdentity = at(15);

const BOne = at(20);
const BMany1 = at(21);
const BMany2 = at(22);
const BMixed = at(23);

const rules: readonly Rule[] = Object.freeze([
  Object.freeze({ antecedent: AEmpty, outputs: Object.freeze([]) }),
  Object.freeze({ antecedent: AOne, outputs: Object.freeze([BOne]) }),
  Object.freeze({ antecedent: AMany, outputs: Object.freeze([BMany1, BMany2]) }),
  // Same antecedent has one matched-empty and two positive Rules. Global match
  // occurrence remains true; positive outputs survive the union.
  Object.freeze({ antecedent: AMixed, outputs: Object.freeze([]) }),
  Object.freeze({ antecedent: AMixed, outputs: Object.freeze([BMixed]) }),
  Object.freeze({ antecedent: AMixed, outputs: Object.freeze([BMixed]) }),
  Object.freeze({ antecedent: AIdentity, outputs: Object.freeze([AIdentity]) }),
]);

const currents = Object.freeze([
  memory.ensure(K0, ANo),
  memory.ensure(K1, AEmpty),
  memory.ensure(K2, AOne),
  memory.ensure(K3, AMany),
  memory.ensure(K4, AMixed),
  memory.ensure(K5, AIdentity),
]);

// Algebraic laws of shard reduction.
{
  const samples = [
    ZERO_CONTRIBUTION,
    contribution(true, []),
    contribution(true, [BOne]),
    contribution(true, [BMany1, BMany2]),
    contribution(true, [BMany2, BMany1, BMany1]),
  ] as const;

  for (const a of samples) {
    same(
      JSON.stringify(combine(a, ZERO_CONTRIBUTION)),
      JSON.stringify(a),
      "right neutral element",
    );
    same(
      JSON.stringify(combine(ZERO_CONTRIBUTION, a)),
      JSON.stringify(a),
      "left neutral element",
    );
    same(
      JSON.stringify(combine(a, a)),
      JSON.stringify(a),
      "idempotence",
    );

    for (const bb of samples) {
      same(
        JSON.stringify(combine(a, bb)),
        JSON.stringify(combine(bb, a)),
        "commutativity",
      );

      for (const c of samples) {
        same(
          JSON.stringify(combine(combine(a, bb), c)),
          JSON.stringify(combine(a, combine(bb, c))),
          "associativity",
        );
      }
    }
  }
}

// Monolithic reference.
const baseline = reactWithRuleShards(memory, currents, [rules]);
same(baseline.matchedCurrents, 5, "five of six currents match");
same(baseline.reacted, true, "reference reaction occurs");

const expected = [
  currents[0], // NO_MATCH survives
  memory.ensure(K2, BOne),
  memory.ensure(K3, BMany1),
  memory.ensure(K3, BMany2),
  memory.ensure(K4, BMixed),
  memory.ensure(K5, AIdentity), // active identity: same extensional truth
];
setSame(baseline.successors, expected, "monolithic successor");

// NO_MATCH and matched-empty remain distinguishable although both have no image.
{
  const no = partial(ANo, rules);
  const empty = partial(AEmpty, rules);
  same(no.matched, false, "NO_MATCH event bit");
  same(no.outputs.length, 0, "NO_MATCH output");
  same(empty.matched, true, "matched-empty event bit");
  same(empty.outputs.length, 0, "matched-empty output");
  setSame(
    finalizeCurrent(memory, currents[0], no),
    [currents[0]],
    "NO_MATCH preserves current",
  );
  same(
    finalizeCurrent(memory, currents[1], empty).length,
    0,
    "matched-empty removes current",
  );
}

// Rule partition invariance, including shard scheduling order.
{
  const shards = Object.freeze([
    Object.freeze([rules[0]!, rules[4]!]),
    Object.freeze([rules[1]!, rules[3]!, rules[6]!]),
    Object.freeze([rules[2]!, rules[5]!]),
  ]);

  for (const orderedShards of permutations(shards)) {
    const result = reactWithRuleShards(memory, currents, orderedShards);
    setSame(result.successors, baseline.successors, "rule shard permutation");
    same(result.matchedCurrents, baseline.matchedCurrents, "matched current count");
  }

  const oneRulePerShard = rules.map((rule) => Object.freeze([rule]));
  const result = reactWithRuleShards(memory, currents, oneRulePerShard);
  setSame(result.successors, baseline.successors, "one-rule-per-worker reduction");
}

// Current-member partition invariance. No current-member join is used.
{
  const currentShards = Object.freeze([
    Object.freeze([currents[0]!, currents[3]!]),
    Object.freeze([currents[1]!, currents[4]!]),
    Object.freeze([currents[2]!, currents[5]!]),
  ]);

  for (const orderedCurrents of permutations(currentShards)) {
    const result = reactWithCurrentAndRuleShards(
      memory,
      orderedCurrents,
      [
        Object.freeze(rules.slice(0, 2)),
        Object.freeze(rules.slice(2, 5)),
        Object.freeze(rules.slice(5)),
      ],
    );
    setSame(result.successors, baseline.successors, "2D current/rule partition");
    same(result.matchedCurrents, baseline.matchedCurrents, "2D matched count");
  }
}

// Why local NO_MATCH publication is invalid on rule-partitioned hardware.
{
  const oneTruth = memory.ensure(K2, AOne);
  const shards = Object.freeze([
    Object.freeze([rules[0]!]), // local NO_MATCH
    Object.freeze([rules[1]!]), // actual match
  ]);

  const correct = reactWithRuleShards(memory, [oneTruth], shards).successors;
  const wrong = naiveShardLocalNoMatch(memory, oneTruth, shards);

  setSame(correct, [memory.ensure(K2, BOne)], "correct reduced result");
  assert(
    wrong.includes(oneTruth) && wrong.includes(memory.ensure(K2, BOne)),
    "naive local NO_MATCH leaks both old and new truth",
  );
  assert(
    wrong.length !== correct.length,
    "local NO_MATCH publication is observably wrong",
  );
}

// Generation isolation: new consequences may not become antecedents during the
// same generalized reaction.
{
  const A = at(40);
  const B = at(41);
  const C = at(42);
  const K = at(43);
  const chainRules: readonly Rule[] = Object.freeze([
    Object.freeze({ antecedent: A, outputs: Object.freeze([B]) }),
    Object.freeze({ antecedent: B, outputs: Object.freeze([C]) }),
  ]);
  const start = memory.ensure(K, A);

  const oneGeneration =
    reactWithRuleShards(memory, [start], [chainRules]).successors;
  setSame(oneGeneration, [memory.ensure(K, B)], "one generation stops at B");

  const wrongCascade = cascadingSameGeneration(memory, start, chainRules);
  setSame(wrongCascade, [memory.ensure(K, C)], "read-your-own-writes collapses to C");
  assert(
    !oneGeneration.includes(memory.ensure(K, C)),
    "C is not visible in the A->B generation",
  );
}

// Active identity is a reaction occurrence even when extensional state is same.
{
  const identityTruth = memory.ensure(K5, AIdentity);
  const identity = reactWithRuleShards(memory, [identityTruth], [rules]);
  setSame(identity.successors, [identityTruth], "identity extensional state");
  same(identity.reacted, true, "identity records reaction occurrence");

  const noTruth = memory.ensure(K0, ANo);
  const no = reactWithRuleShards(memory, [noTruth], [rules]);
  setSame(no.successors, [noTruth], "NO_MATCH extensional state");
  same(no.reacted, false, "NO_MATCH is quiescent");
}

console.log([
  "MTS v0.15 A11: PARALLEL_REACTION_REDUCTION=GREEN_RESEARCH",
  "REDUCTION=(MATCH_OR,OUTPUT_CANONICAL_UNION)",
  "ASSOCIATIVE=TRUE",
  "COMMUTATIVE=TRUE",
  "IDEMPOTENT=TRUE",
  "RULE_PARTITION_INVARIANT=TRUE",
  "RULE_SHARD_ORDER_INVARIANT=TRUE",
  "CURRENT_PARTITION_INVARIANT=TRUE",
  "TWO_DIMENSIONAL_PARTITION_INVARIANT=TRUE",
  "LOCAL_SHARD_NO_MATCH_PUBLICATION=FALSIFIED",
  "GLOBAL_MATCH_BIT_REQUIRED_BEFORE_NO_MATCH_PRESERVATION=TRUE",
  "MATCHED_EMPTY_DISTINCT_FROM_NO_MATCH=TRUE",
  "ACTIVE_IDENTITY_DISTINCT_FROM_QUIESCENCE=TRUE",
  "READ_YOUR_OWN_WRITES_WITHIN_GENERATION=FALSIFIED",
  "REACTION_START_SNAPSHOT_REQUIRED=TRUE",
  "HARDWARE_SCHEDULING_ORDER=NONSEMANTIC_UNDER_REDUCTION_PREMISES",
  "CROSS_MEMBER_JOIN_REQUIRED=FALSE",
  "ACCEPTED_V014_UNCHANGED",
].join(" "));
