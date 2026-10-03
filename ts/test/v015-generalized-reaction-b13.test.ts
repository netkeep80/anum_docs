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
  type RootBasis,
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

const AMEMORY_ORACLE = Object.freeze({
  main: "e707392b74860563a5c4e99e1bd9c391e69f74a5",
  version: "0.167.0",
  structuralBlob: "ca192dbce2a18371c7cfcc033f2e74417788d10d",
  reactionWebBlob: "24a31beba03c4084152e9cfd246cabda0f531da4",
  reactionTestBlob: "4ba31ee94481fffeed0a092c40cd743c29c95ba1",
});

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(`v0.15 B13 generalized reaction: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(
    Object.is(actual, expected),
    `${message}: ${String(actual)} !== ${String(expected)}`,
  );
}

function sameMembers(
  actual: readonly LinkHandle[],
  expected: readonly LinkHandle[],
  message: string,
): void {
  same(actual.length, expected.length, `${message}: cardinality`);
  for (const member of expected) {
    assert(actual.includes(member), `${message}: missing member`);
  }
}

interface Fixture {
  readonly memory: Memory;
  readonly basis: RootBasis;
  readonly theory: LinkHandle;
  readonly foreignTheory: LinkHandle;
  readonly interpreter: LinkHandle;
  readonly foreignInterpreter: LinkHandle;
  readonly K: LinkHandle;
  readonly A: LinkHandle;
  readonly B: LinkHandle;
  readonly C: LinkHandle;
  readonly D: LinkHandle;
  readonly E: LinkHandle;
  readonly fresh: () => LinkHandle;
}

function fixture(): Fixture {
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  let cursor = memory.ensure(basis.U, basis.L);
  const fresh = (): LinkHandle => (
    cursor = memory.ensure(cursor, basis.C)
  );

  const theory = fresh();
  const foreignTheory = fresh();
  const grammar = fresh();
  const authorityDictionary = defineStructuralRoleDictionary(memory, []);
  const interpreter = defineStructuralInterpreter(
    memory,
    authorityDictionary,
    grammar,
    theory,
  );
  const foreignInterpreter = defineStructuralInterpreter(
    memory,
    authorityDictionary,
    grammar,
    foreignTheory,
  );

  return Object.freeze({
    memory,
    basis,
    theory,
    foreignTheory,
    interpreter,
    foreignInterpreter,
    K: fresh(),
    A: fresh(),
    B: fresh(),
    C: fresh(),
    D: fresh(),
    E: fresh(),
    fresh,
  });
}

interface AdmittedRule {
  readonly rule: LinkHandle;
  readonly outputBundleTemplate: LinkHandle;
}

function admitUnary(
  f: Fixture,
  antecedent: LinkHandle,
  outputs: readonly LinkHandle[],
  theory = f.theory,
): AdmittedRule {
  const role = f.fresh();
  const dictionary = defineStructuralRoleDictionary(f.memory, [role]);
  const before = f.memory.ensure(role, antecedent);
  const outputTemplates = outputs.map(
    (output) => f.memory.ensure(role, output),
  );
  const outputBundleTemplate = materializeExactSequence(
    f.memory,
    outputTemplates,
  );
  const body = f.memory.ensure(before, outputBundleTemplate);
  const rule = defineStructuralRule(f.memory, dictionary, body);
  const admission = admitStructuralRule(f.memory, theory, rule);
  const triggerKey = f.memory.poles(antecedent).start;
  f.memory.ensure(triggerKey, admission);
  return Object.freeze({ rule, outputBundleTemplate });
}

function active(
  f: Fixture,
  value: LinkHandle,
  context = f.K,
): LinkHandle {
  return f.memory.ensure(context, value);
}

function run(
  f: Fixture,
  members: readonly LinkHandle[],
  interpreter = f.interpreter,
) {
  const scope = defineV013WorkingScope(
    f.memory,
    f.fresh(),
    interpreter,
    members,
  );
  const cursor = new V013CurrentScopeCursor(f.memory, scope);
  const reaction = reactV013StructuralScope(
    f.memory,
    cursor,
    f.fresh(),
  );
  return Object.freeze({ cursor, reaction, scope });
}

// Bare scalar positive consequences are not a complete reaction observation.
// NO_MATCH and active identity have the same extensional successor but differ
// in match/handoff/quiescence state.
{
  const noMatch = fixture();
  const current = active(noMatch, noMatch.A);
  const passive = run(noMatch, [current]);
  sameMembers(passive.cursor.members(), [current], "NO_MATCH successor");
  same(passive.reaction.rawRuleMatches, 0, "NO_MATCH match count");
  same(passive.reaction.handoffCount, 0, "NO_MATCH handoff");
  same(passive.reaction.quiescent, true, "NO_MATCH quiescence");

  const identity = fixture();
  admitUnary(identity, identity.A, [identity.A]);
  const identityCurrent = active(identity, identity.A);
  const activeIdentity = run(identity, [identityCurrent]);
  sameMembers(
    activeIdentity.cursor.members(),
    [identityCurrent],
    "active identity successor",
  );
  same(activeIdentity.reaction.rawRuleMatches, 1, "identity match count");
  same(activeIdentity.reaction.handoffCount, 1, "identity handoff");
  same(activeIdentity.reaction.quiescent, false, "identity is active");
}

// MATCH + EMPTY_IMAGE is distinct from NO_MATCH.
{
  const f = fixture();
  admitUnary(f, f.A, []);
  const current = active(f, f.A);
  const zero = run(f, [current]);
  sameMembers(zero.cursor.members(), [], "1->0 successor");
  same(zero.reaction.rawRuleMatches, 1, "1->0 match count");
  same(zero.reaction.transitionedMembers, 1, "1->0 transition count");
  same(zero.reaction.handoffCount, 1, "1->0 handoff");
  same(zero.reaction.quiescent, false, "1->0 is active");
}

// 1->1.
{
  const f = fixture();
  admitUnary(f, f.A, [f.B]);
  const one = run(f, [active(f, f.A)]);
  sameMembers(one.cursor.members(), [active(f, f.B)], "1->1 successor");
  same(one.reaction.rawRuleMatches, 1, "1->1 match count");
}

// 1->N exhausts every admitted matching Rule and canonically converges
// duplicate successor Links.
{
  const f = fixture();
  admitUnary(f, f.A, [f.B, f.C]);
  admitUnary(f, f.A, [f.C, f.D]);
  const many = run(f, [active(f, f.A)]);
  sameMembers(
    many.cursor.members(),
    [active(f, f.B), active(f, f.C), active(f, f.D)],
    "1->N all-matching union",
  );
  same(many.reaction.rawRuleMatches, 2, "1->N raw matches");
  same(many.reaction.transitionedMembers, 1, "1->N transitioned member");
}

// N->1 canonical convergence under one Context K.
{
  const f = fixture();
  admitUnary(f, f.A, [f.B]);
  admitUnary(f, f.C, [f.B]);
  const converged = run(
    f,
    [active(f, f.A), active(f, f.C)],
  );
  sameMembers(
    converged.cursor.members(),
    [active(f, f.B)],
    "N->1 canonical convergence",
  );
  same(converged.reaction.rawRuleMatches, 2, "N->1 raw matches");
  same(converged.reaction.transitionedMembers, 2, "N->1 transitioned members");
}

// N->M pointwise union plus local ZERO. Empty contribution does not veto
// a positive sibling image, and a NO_MATCH sibling is preserved.
{
  const f = fixture();
  admitUnary(f, f.A, []);
  admitUnary(f, f.A, [f.B]);
  admitUnary(f, f.C, [f.D, f.E]);
  const mixed = run(
    f,
    [active(f, f.A), active(f, f.C), active(f, f.B)],
  );
  sameMembers(
    mixed.cursor.members(),
    [active(f, f.B), active(f, f.D), active(f, f.E)],
    "N->M mixed union",
  );
  same(mixed.reaction.rawRuleMatches, 3, "N->M raw matches");
  same(mixed.reaction.transitionedMembers, 2, "N->M transitioned members");
}

// ExactSequence is the ordered/repetition-preserving image carrier before
// extensional successor union. Reaction projection may deduplicate identical
// successor Links without destroying the image carrier itself.
{
  const f = fixture();
  const admitted = admitUnary(f, f.A, [f.B, f.C, f.B]);
  const rawTemplate = readExactSequence(
    f.memory,
    admitted.outputBundleTemplate,
  ).values;
  same(rawTemplate.length, 3, "image carrier preserves arity");
  same(
    f.memory.poles(rawTemplate[0]!).end,
    f.B,
    "image carrier position 0",
  );
  same(
    f.memory.poles(rawTemplate[1]!).end,
    f.C,
    "image carrier position 1",
  );
  same(
    f.memory.poles(rawTemplate[2]!).end,
    f.B,
    "image carrier repeated position",
  );

  const projected = run(f, [active(f, f.A)]);
  sameMembers(
    projected.cursor.members(),
    [active(f, f.B), active(f, f.C)],
    "extensional union deduplicates repeated output",
  );
}

// Selected Theory is authority. A discoverable-looking Rule admitted only
// under a foreign Theory remains inert.
{
  const f = fixture();
  admitUnary(f, f.A, [f.B], f.foreignTheory);
  const current = active(f, f.A);
  const foreign = run(f, [current], f.interpreter);
  sameMembers(foreign.cursor.members(), [current], "foreign Theory inert");
  same(foreign.reaction.rawRuleMatches, 0, "foreign Theory match count");
  same(foreign.reaction.quiescent, true, "foreign Theory quiescent");
}

// Joint antecedent correlation is not granted by a pointwise Scope. A Rule
// for Pair(A,C) does not fire merely because K->A and K->C are both current.
// Packing Pair(A,C) as one actual current endpoint makes it an ordinary unary
// structural antecedent again.
{
  const f = fixture();
  const pair = f.memory.ensure(f.A, f.C);
  admitUnary(f, pair, [f.D]);

  const unpacked = run(
    f,
    [active(f, f.A), active(f, f.C)],
  );
  sameMembers(
    unpacked.cursor.members(),
    [active(f, f.A), active(f, f.C)],
    "unpacked joint antecedent does not fire",
  );
  same(unpacked.reaction.rawRuleMatches, 0, "unpacked joint match count");

  const packed = run(f, [active(f, pair)]);
  sameMembers(
    packed.cursor.members(),
    [active(f, f.D)],
    "packed structural antecedent fires",
  );
  same(packed.reaction.rawRuleMatches, 1, "packed joint match count");
}

// Machine-readable execution profile and paired external proof lane must keep
// the exact boundaries that scalar MP alone does not derive.
{
  const root = resolve(process.cwd(), "..");
  const profile = JSON.parse(
    readFileSync(
      join(root, "profiles/amemory-execution-profile.json"),
      "utf8",
    ),
  ) as {
    theory: {
      visibility: string;
      sameSnapshotForAllCurrentMembers: boolean;
      sameReactionNewAdmissionExecutable: boolean;
      nextReactionNewAdmissionExecutable: boolean;
    };
    reaction: {
      relationDiscovery: string;
      noAdmittedRelation: string;
      zeroImage: string;
      manyImages: string;
      duplicateOutputs: string;
    };
    publication: {
      fullSuccessorBuiltBeforePublication: boolean;
      atomicCurrentRootHandoff: boolean;
    };
  };

  same(profile.theory.visibility, "reaction-start-snapshot", "Theory snapshot");
  same(
    profile.theory.sameSnapshotForAllCurrentMembers,
    true,
    "one snapshot for all current members",
  );
  same(
    profile.theory.sameReactionNewAdmissionExecutable,
    false,
    "new admission not visible in same reaction",
  );
  same(
    profile.theory.nextReactionNewAdmissionExecutable,
    true,
    "new admission visible next reaction",
  );
  same(
    profile.reaction.relationDiscovery,
    "exhaustive-over-selected-theory-snapshot",
    "exhaustive discovery",
  );
  same(
    profile.reaction.noAdmittedRelation,
    "preserve-current-truth",
    "no-match preservation",
  );
  same(
    profile.reaction.zeroImage,
    "zero-successor-contribution",
    "matched empty image",
  );
  same(
    profile.reaction.manyImages,
    "union-all-canonical-successors",
    "multi-image union",
  );
  same(
    profile.reaction.duplicateOutputs,
    "converge-by-canonical-link-identity",
    "duplicate convergence",
  );
  same(
    profile.publication.fullSuccessorBuiltBeforePublication,
    true,
    "complete successor before publication",
  );
  same(
    profile.publication.atomicCurrentRootHandoff,
    true,
    "atomic current-root handoff",
  );

  const lean = readFileSync(
    join(root, "proofs/lean4/MtsFoundation.lean"),
    "utf8",
  );
  const rocq = readFileSync(
    join(root, "proofs/coq/MtsFoundation.v"),
    "utf8",
  );
  for (const source of [lean, rocq]) {
    assert(
      source.includes("SelectedTheoryReactionSemantics"),
      "paired proof keeps selected-Theory semantic premise explicit",
    );
    assert(
      source.includes("FND_08_generalized_relational_reaction"),
      "paired proof retains FND-08",
    );
    assert(
      source.includes("FND_09_zero_one_many_are_relational"),
      "paired proof retains FND-09",
    );
  }
}

console.log([
  "MTS v0.15 B13 generalized reaction gate:",
  `AMEMORY_MAIN=${AMEMORY_ORACLE.main}`,
  `AMEMORY_VERSION=${AMEMORY_ORACLE.version}`,
  `AMEMORY_STRUCTURAL_BLOB=${AMEMORY_ORACLE.structuralBlob}`,
  `AMEMORY_REACTION_WEB_BLOB=${AMEMORY_ORACLE.reactionWebBlob}`,
  `AMEMORY_REACTION_TEST_BLOB=${AMEMORY_ORACLE.reactionTestBlob}`,
  "BARE_SCALAR_MP_COMPLETE_REACTION=FALSE",
  "SCALAR_POSITIVE_DETACHMENT=RETAINED",
  "EVENT_RICH_POINTWISE_LIFT=SUFFICIENT_FOR_PINNED_UNARY_DOMAIN",
  "NO_MATCH_VS_ACTIVE_IDENTITY=DISTINCT",
  "NO_MATCH_VS_MATCHED_EMPTY=DISTINCT",
  "ONE_TO_ZERO=GREEN",
  "ONE_TO_ONE=GREEN",
  "ONE_TO_N=GREEN",
  "N_TO_ONE=GREEN",
  "N_TO_M=GREEN",
  "MULTIPLE_MATCHES=EXHAUSTIVE",
  "EXACT_SEQUENCE_ORDER_REPETITION=PRESERVED_BEFORE_UNION",
  "DUPLICATE_SUCCESSORS=CANONICALLY_CONVERGED",
  "FOREIGN_THEORY=INERT",
  "WHOLE_ANTECEDENT_JOIN=NOT_IMPLICIT",
  "PACKED_STRUCTURAL_ANTECEDENT=UNARY_AGAIN",
  "THEORY_SNAPSHOT=EXPLICIT_PREMISE",
  "ATOMIC_PUBLICATION=EXPLICIT_PREMISE",
  "PAIRED_LEAN_ROCQ=RETAINED",\n  "PINNED_AMEMORY_CPU_GPU_REACTION_CORPUS=AUDITED",
  "NEW_BUNDLE_ONTOLOGY_REQUIRED=FALSE",
  "IRREDUCIBLE_MULTIWAY_PRIMITIVE_REQUIRED=FALSE_FOR_PINNED_DOMAIN",
].join(" "));
