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
  if (!value) throw new Error("v0.15 aprover P1m witness-free snapshot scan: " + message);
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), message + ": " + String(actual) + " !== " + String(expected));
}

interface Fixture {
  readonly memory: Memory;
  readonly root: LinkHandle;
  readonly aproverTheory: LinkHandle;
  readonly interpreter: LinkHandle;
  readonly verifyTag: LinkHandle;
  readonly acceptTag: LinkHandle;
  readonly context: LinkHandle;
  readonly objectTheory: LinkHandle;
  readonly foreignTheory: LinkHandle;
  readonly ruleA: LinkHandle;
  readonly ruleB: LinkHandle;
  readonly ruleC: LinkHandle;
  readonly fresh: () => LinkHandle;
}

function fixture(): Fixture {
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  let cursor = memory.ensure(basis.U, basis.L);
  const fresh = (): LinkHandle => (cursor = memory.ensure(cursor, basis.C));
  const aproverTheory = fresh();
  const grammar = fresh();
  const emptyDictionary = defineStructuralRoleDictionary(memory, []);
  return Object.freeze({
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
  });
}

function cell(
  memory: Memory,
  previous: LinkHandle,
  value: LinkHandle,
): LinkHandle {
  return memory.ensureStartSelfClosed(memory.ensure(previous, value));
}

/**
 * Verification endpoint contains no path/index/witness:
 *
 *   VERIFY -> (ObjectTheory -> (SnapshotCarrier -> ReferencedRule))
 *
 * SnapshotCarrier is transport authority, not Theory semantics.
 */
function state(
  f: Fixture,
  theory: LinkHandle,
  snapshot: LinkHandle,
  referencedRule: LinkHandle,
): LinkHandle {
  return f.memory.ensure(
    f.verifyTag,
    f.memory.ensure(theory, f.memory.ensure(snapshot, referencedRule)),
  );
}

function accepted(
  f: Fixture,
  theory: LinkHandle,
  referencedRule: LinkHandle,
): LinkHandle {
  return f.memory.ensure(
    f.acceptTag,
    f.memory.ensure(theory, referencedRule),
  );
}

function installScan(f: Fixture): void {
  // Generic SKIP: peel one transport cell regardless of its value.
  //
  // If the same cell is the desired admission, ACCEPT below also fires in the
  // same generalized reaction. The successor is therefore N->M: accepted branch
  // persists while the scan branch continues toward ROOT.
  {
    const k = f.fresh();
    const theory = f.fresh();
    const prevSnapshot = f.fresh();
    const skipped = f.fresh();
    const referencedRule = f.fresh();
    const dictionary = defineStructuralRoleDictionary(
      f.memory,
      [k, theory, prevSnapshot, skipped, referencedRule],
    );

    const snapshotCell = cell(f.memory, prevSnapshot, skipped);
    const endpoint = state(f, theory, snapshotCell, referencedRule);
    const before = f.memory.ensure(k, endpoint);
    const next = f.memory.ensure(
      k,
      state(f, theory, prevSnapshot, referencedRule),
    );
    const image = materializeExactSequence(f.memory, [next]);
    const rule = defineStructuralRule(
      f.memory,
      dictionary,
      f.memory.ensure(before, image),
    );
    const admission = admitStructuralRule(f.memory, f.aproverTheory, rule);
    f.memory.ensure(f.verifyTag, admission);
  }

  // ACCEPT: current transport cell value must literally be
  // ObjectTheory -> ReferencedRule.
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
    const endpoint = state(f, theory, snapshotCell, referencedRule);
    const before = f.memory.ensure(k, endpoint);
    const result = f.memory.ensure(
      k,
      accepted(f, theory, referencedRule),
    );
    const image = materializeExactSequence(f.memory, [result]);
    const rule = defineStructuralRule(
      f.memory,
      dictionary,
      f.memory.ensure(before, image),
    );
    const admission = admitStructuralRule(f.memory, f.aproverTheory, rule);
    f.memory.ensure(f.verifyTag, admission);
  }
}

function current(f: Fixture, endpoint: LinkHandle): LinkHandle {
  return f.memory.ensure(f.context, endpoint);
}

function execute(
  f: Fixture,
  endpoint: LinkHandle,
  maxSteps = 32,
): Readonly<{
  readonly members: readonly LinkHandle[];
  readonly activeSteps: number;
}> {
  const scope = defineV013WorkingScope(
    f.memory,
    f.fresh(),
    f.interpreter,
    [current(f, endpoint)],
  );
  const cursor = new V013CurrentScopeCursor(f.memory, scope);

  for (let activeSteps = 0; activeSteps < maxSteps; activeSteps += 1) {
    const reaction = reactV013StructuralScope(f.memory, cursor, f.fresh());
    if (reaction.quiescent) {
      return Object.freeze({
        members: cursor.members(),
        activeSteps,
      });
    }
  }
  throw new Error("v0.15 aprover P1m witness-free snapshot scan: did not quiesce");
}

function admissions(f: Fixture): Readonly<{
  readonly a: LinkHandle;
  readonly b: LinkHandle;
  readonly c: LinkHandle;
}> {
  return Object.freeze({
    a: f.memory.ensure(f.objectTheory, f.ruleA),
    b: f.memory.ensure(f.objectTheory, f.ruleB),
    c: f.memory.ensure(f.objectTheory, f.ruleC),
  });
}

function hasAccepted(
  f: Fixture,
  members: readonly LinkHandle[],
  theory: LinkHandle,
  rule: LinkHandle,
): boolean {
  return members.includes(current(f, accepted(f, theory, rule)));
}

// All permutations of the same selected extensional Theory subset yield the
// same semantic membership verdict. There is no path/index/witness input.
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
    installScan(f);
    const m = admissions(f);
    const map = { a: m.a, b: m.b, c: m.c } as const;
    const snapshot = materializeExactSequence(
      f.memory,
      order.map((key) => map[key]),
    );
    const result = execute(
      f,
      state(f, f.objectTheory, snapshot, f.ruleB),
    );

    assert(
      hasAccepted(f, result.members, f.objectTheory, f.ruleB),
      "permutation contains persistent ACCEPT " + order.join(""),
    );
    same(
      result.activeSteps,
      order.length,
      "full witness-free scan cost is representation length",
    );
  }
}

// Physical admission outside the frozen carrier remains powerless.
{
  const f = fixture();
  installScan(f);
  const m = admissions(f);

  const snapshot = materializeExactSequence(f.memory, [m.a, m.c]);
  const result = execute(
    f,
    state(f, f.objectTheory, snapshot, f.ruleB),
  );

  assert(
    !hasAccepted(f, result.members, f.objectTheory, f.ruleB),
    "ambient RuleB admission absent from snapshot yields no ACCEPT",
  );
  same(result.activeSteps, 2, "negative scan exhausts whole carrier");
}

// Foreign-Theory same Rule does not satisfy exact ObjectTheory membership.
{
  const f = fixture();
  installScan(f);
  const foreign = f.memory.ensure(f.foreignTheory, f.ruleB);
  const snapshot = materializeExactSequence(f.memory, [foreign]);
  const result = execute(
    f,
    state(f, f.objectTheory, snapshot, f.ruleB),
  );

  assert(
    !hasAccepted(f, result.members, f.objectTheory, f.ruleB),
    "foreign Theory admission yields no ObjectTheory ACCEPT",
  );
}

// Candidate-controlled snapshot is authority injection: if the candidate is
// allowed to replace the frozen carrier, it can self-authorize an ambient
// admission. Therefore SnapshotCarrier must be independently pinned transport
// of exact ObjectTheory, while the proof/reference itself remains untrusted.
{
  const f = fixture();
  installScan(f);
  const ambient = f.memory.ensure(f.objectTheory, f.ruleB);

  const forgedSnapshot = materializeExactSequence(f.memory, [ambient]);
  const result = execute(
    f,
    state(f, f.objectTheory, forgedSnapshot, f.ruleB),
  );

  assert(
    hasAccepted(f, result.members, f.objectTheory, f.ruleB),
    "candidate-forged carrier would self-authorize",
  );
}

console.log([
  "MTS_V015_APROVER_P1M_WITNESS_FREE_SNAPSHOT_SCAN=GREEN_RESEARCH",
  "EXECUTION=REPEATED_ORDINARY_GAMMA_J0",
  "SNAPSHOT_CARRIER=TRANSPORT_NOT_THEORY_SEMANTICS",
  "EXTERNAL_MEMBERSHIP_WITNESS=0",
  "PATH_INDEX=0",
  "SEARCH_HINT=0",
  "SCAN=GENERIC_SKIP_PLUS_EXACT_ACCEPT",
  "GENERALIZED_BRANCHING_USED=TRUE",
  "PERMUTATIONS=6_SAME_MEMBERSHIP_VERDICT",
  "REPRESENTATION_ORDER_SEMANTIC=FALSE",
  "AMBIENT_UNSELECTED_ADMISSION=NO_ACCEPT",
  "FOREIGN_THEORY_ADMISSION=NO_ACCEPT",
  "CANDIDATE_CONTROLLED_SNAPSHOT=AUTHORITY_INJECTION",
  "SNAPSHOT_MUST_BE_INDEPENDENTLY_PINNED=TRUE",
  "CROSS_CURRENT_J1=0",
  "HOST_MEMBERSHIP_LOOKUP=0",
  "FORMAL_APROVER_SOURCE=OPEN",
  "FROZEN_AMEMORY_REPLAY=OPEN",
].join(" "));
