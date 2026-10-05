import {
  materializeExactSequence,
} from "../src/exact-sequence.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
} from "../src/memory.js";
import {
  admitStructuralRule,
  defineStructuralInterpreter,
  defineStructuralRoleDictionary,
  defineStructuralRule,
} from "../src/structural-rule.js";
import {
  defineV013WorkingScope,
  reactV013StructuralScope,
  V013CurrentScopeCursor,
} from "../src/v013-structural-execution.js";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error("v0.15 aprover P1b witness traversal: " + message);
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), message + ": " + String(actual) + " !== " + String(expected));
}
function sameMembers(actual: readonly LinkHandle[], expected: readonly LinkHandle[], message: string): void {
  same(actual.length, expected.length, message + " cardinality");
  for (const value of expected) assert(actual.includes(value), message + " member");
}

interface Fixture {
  memory: Memory;
  root: LinkHandle;
  aproverTheory: LinkHandle;
  interpreter: LinkHandle;
  verifyTag: LinkHandle;
  acceptTag: LinkHandle;
  context: LinkHandle;
  objectTheory: LinkHandle;
  foreignTheory: LinkHandle;
  ruleA: LinkHandle;
  ruleB: LinkHandle;
  ruleC: LinkHandle;
  fresh: () => LinkHandle;
}

function fixture(): Fixture {
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  let cursor = memory.ensure(basis.U, basis.L);
  const fresh = (): LinkHandle => (cursor = memory.ensure(cursor, basis.C));
  const aproverTheory = fresh();
  const grammar = fresh();
  const emptyDictionary = defineStructuralRoleDictionary(memory, []);
  return {
    memory,
    root: basis.R,
    aproverTheory,
    interpreter: defineStructuralInterpreter(memory, emptyDictionary, grammar, aproverTheory),
    verifyTag: fresh(),
    acceptTag: fresh(),
    context: fresh(),
    objectTheory: fresh(),
    foreignTheory: fresh(),
    ruleA: fresh(),
    ruleB: fresh(),
    ruleC: fresh(),
    fresh,
  };
}

function cell(
  memory: Memory,
  previous: LinkHandle,
  value: LinkHandle,
): LinkHandle {
  return memory.ensureStartSelfClosed(memory.ensure(previous, value));
}

/**
 * Packed verification endpoint:
 *
 *   VERIFY -> (Theory -> (Snapshot -> (WitnessSuffix -> ReferencedRule)))
 *
 * WitnessSuffix is untrusted. It contains exactly the values after the selected
 * admission in the transport ExactSequence. The skip rule peels one matching
 * value from Snapshot and WitnessSuffix per Γ. When WitnessSuffix reaches R,
 * the accept rule requires the current Snapshot cell value to be exactly
 * Theory -> ReferencedRule.
 *
 * This makes path/index a navigation witness, never proof authority.
 */
function state(
  f: Fixture,
  theory: LinkHandle,
  snapshot: LinkHandle,
  witness: LinkHandle,
  referencedRule: LinkHandle,
): LinkHandle {
  return f.memory.ensure(
    f.verifyTag,
    f.memory.ensure(
      theory,
      f.memory.ensure(snapshot, f.memory.ensure(witness, referencedRule)),
    ),
  );
}

function accepted(f: Fixture, theory: LinkHandle, rule: LinkHandle): LinkHandle {
  return f.memory.ensure(f.acceptTag, f.memory.ensure(theory, rule));
}

function installTraversal(f: Fixture): void {
  // SKIP: the last snapshot value and last witness value must be identical.
  {
    const k = f.fresh();
    const theory = f.fresh();
    const prevSnapshot = f.fresh();
    const prevWitness = f.fresh();
    const skipped = f.fresh();
    const referencedRule = f.fresh();
    const dictionary = defineStructuralRoleDictionary(
      f.memory,
      [k, theory, prevSnapshot, prevWitness, skipped, referencedRule],
    );

    const snapshotCell = cell(f.memory, prevSnapshot, skipped);
    const witnessCell = cell(f.memory, prevWitness, skipped);
    const endpoint = f.memory.ensure(
      f.verifyTag,
      f.memory.ensure(
        theory,
        f.memory.ensure(snapshotCell, f.memory.ensure(witnessCell, referencedRule)),
      ),
    );
    const before = f.memory.ensure(k, endpoint);
    const nextEndpoint = f.memory.ensure(
      f.verifyTag,
      f.memory.ensure(
        theory,
        f.memory.ensure(prevSnapshot, f.memory.ensure(prevWitness, referencedRule)),
      ),
    );
    const image = materializeExactSequence(
      f.memory,
      [f.memory.ensure(k, nextEndpoint)],
    );
    const rule = defineStructuralRule(f.memory, dictionary, f.memory.ensure(before, image));
    const admission = admitStructuralRule(f.memory, f.aproverTheory, rule);
    f.memory.ensure(f.verifyTag, admission);
  }

  // ACCEPT: witness is exhausted and selected Snapshot value must literally be
  // Theory -> ReferencedRule.
  {
    const k = f.fresh();
    const theory = f.fresh();
    const prevSnapshot = f.fresh();
    const referencedRule = f.fresh();
    const dictionary = defineStructuralRoleDictionary(
      f.memory,
      [k, theory, prevSnapshot, referencedRule],
    );

    const selectedAdmission = f.memory.ensure(theory, referencedRule);
    const snapshotCell = cell(f.memory, prevSnapshot, selectedAdmission);
    const endpoint = state(
      f,
      theory,
      snapshotCell,
      f.root,
      referencedRule,
    );
    const before = f.memory.ensure(k, endpoint);
    const result = f.memory.ensure(k, accepted(f, theory, referencedRule));
    const image = materializeExactSequence(f.memory, [result]);
    const rule = defineStructuralRule(f.memory, dictionary, f.memory.ensure(before, image));
    const admission = admitStructuralRule(f.memory, f.aproverTheory, rule);
    f.memory.ensure(f.verifyTag, admission);
  }
}

function scopeCurrent(f: Fixture, endpoint: LinkHandle): LinkHandle {
  return f.memory.ensure(f.context, endpoint);
}

function suffixWitness(
  f: Fixture,
  values: readonly LinkHandle[],
  selectedIndex: number,
): LinkHandle {
  assert(selectedIndex >= 0 && selectedIndex < values.length, "selected index");
  return materializeExactSequence(f.memory, values.slice(selectedIndex + 1));
}

function execute(
  f: Fixture,
  endpoint: LinkHandle,
  maxSteps = 16,
): Readonly<{
  members: readonly LinkHandle[];
  activeSteps: number;
  finalQuiescent: boolean;
}> {
  const scope = defineV013WorkingScope(
    f.memory,
    f.fresh(),
    f.interpreter,
    [scopeCurrent(f, endpoint)],
  );
  const cursor = new V013CurrentScopeCursor(f.memory, scope);
  let activeSteps = 0;

  for (let step = 0; step < maxSteps; step += 1) {
    const reaction = reactV013StructuralScope(f.memory, cursor, f.fresh());
    if (reaction.quiescent) {
      return Object.freeze({
        members: cursor.members(),
        activeSteps,
        finalQuiescent: true,
      });
    }
    activeSteps += 1;
  }
  throw new Error("v0.15 aprover P1b witness traversal: did not quiesce");
}

function admissions(
  f: Fixture,
): Readonly<{ a: LinkHandle; b: LinkHandle; c: LinkHandle }> {
  return Object.freeze({
    a: f.memory.ensure(f.objectTheory, f.ruleA),
    b: f.memory.ensure(f.objectTheory, f.ruleB),
    c: f.memory.ensure(f.objectTheory, f.ruleC),
  });
}

// Every permutation represents the same extensional selected Theory subset.
// Corrected navigation witness may change, final semantic verdict must not.
{
  const permutations = [
    ["a", "b", "c"],
    ["c", "b", "a"],
    ["b", "a", "c"],
    ["a", "c", "b"],
    ["b", "c", "a"],
    ["c", "a", "b"],
  ] as const;

  for (const order of permutations) {
    const f = fixture();
    installTraversal(f);
    const m = admissions(f);
    const map = { a: m.a, b: m.b, c: m.c } as const;
    const values = order.map((key) => map[key]);
    const selectedIndex = values.indexOf(m.b);
    assert(selectedIndex >= 0, "B admission occurs in permutation");
    const snapshot = materializeExactSequence(f.memory, values);
    const witness = suffixWitness(f, values, selectedIndex);
    const result = execute(
      f,
      state(f, f.objectTheory, snapshot, witness, f.ruleB),
    );

    sameMembers(
      result.members,
      [scopeCurrent(f, accepted(f, f.objectTheory, f.ruleB))],
      "permutation-invariant final ACCEPT " + order.join(""),
    );
    same(
      result.activeSteps,
      values.length - selectedIndex,
      "one Γ per skipped suffix item plus selected admission",
    );
    same(result.finalQuiescent, true, "accepted result stabilizes");
  }
}

// Stale witness from another ordering cannot acquire authority.
{
  const f = fixture();
  installTraversal(f);
  const m = admissions(f);

  // Original [A,B,C], selecting B => witness [C].
  const staleWitness = materializeExactSequence(f.memory, [m.c]);

  // Reordered [A,C,B], where B is now the last value and correct witness is [].
  const reordered = materializeExactSequence(f.memory, [m.a, m.c, m.b]);
  const initial = state(f, f.objectTheory, reordered, staleWitness, f.ruleB);
  const result = execute(f, initial);

  sameMembers(
    result.members,
    [scopeCurrent(f, initial)],
    "stale witness remains unresolved",
  );
  same(result.activeSteps, 0, "stale witness cannot start traversal");
}

// Physical admission outside the trusted snapshot remains powerless.
{
  const f = fixture();
  installTraversal(f);
  const m = admissions(f);

  // RuleB admission physically exists through admissions(), but trusted
  // transport snapshot deliberately contains only A and C.
  const values = [m.a, m.c];
  const snapshot = materializeExactSequence(f.memory, values);
  const forgedWitness = materializeExactSequence(f.memory, []);
  const initial = state(f, f.objectTheory, snapshot, forgedWitness, f.ruleB);
  const result = execute(f, initial);

  sameMembers(
    result.members,
    [scopeCurrent(f, initial)],
    "ambient admission absent from selected snapshot remains unresolved",
  );
  same(result.activeSteps, 0, "ambient admission has no native membership authority");
}

// A foreign-Theory admission in the snapshot cannot validate an ObjectTheory
// proof reference because ACCEPT repeats the same Theory role structurally.
{
  const f = fixture();
  installTraversal(f);
  const foreign = f.memory.ensure(f.foreignTheory, f.ruleB);
  const snapshot = materializeExactSequence(f.memory, [foreign]);
  const initial = state(
    f,
    f.objectTheory,
    snapshot,
    f.root,
    f.ruleB,
  );
  const result = execute(f, initial);

  sameMembers(
    result.members,
    [scopeCurrent(f, initial)],
    "foreign-Theory admission remains unresolved",
  );
  same(result.activeSteps, 0, "foreign-Theory admission cannot match selected Theory");
}

console.log([
  "MTS_V015_APROVER_P1B_MEMBERSHIP_WITNESS=GREEN_RESEARCH",
  "EXECUTION=REPEATED_ORDINARY_GAMMA_J0",
  "THEORY_SNAPSHOT_ORDER=REPRESENTATION_ONLY_IN_TESTED_PERMUTATIONS",
  "PERMUTATIONS=6_GREEN",
  "WITNESS=UNTRUSTED_SUFFIX_PATH",
  "CORRECTED_WITNESS_SAME_VERDICT=GREEN",
  "STALE_WITNESS=INERT",
  "AMBIENT_UNSELECTED_ADMISSION=INERT",
  "FOREIGN_THEORY_ADMISSION=INERT",
  "CROSS_CURRENT_J1=0",
  "HOST_MEMBERSHIP_LOOKUP=0",
  "FORMAL_APROVER_SOURCE=OPEN",
  "FROZEN_AMEMORY_REPLAY=OPEN",
].join(" "));
