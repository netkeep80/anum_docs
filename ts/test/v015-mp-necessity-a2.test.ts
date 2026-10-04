import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  materializeExactSequence,
} from "../src/exact-sequence.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
} from "../src/memory.js";
import {
  defineV013GroundedExecutionScope,
  reactV013GroundedScope,
  V013GroundedScopeCursor,
} from "../src/v013-grounded-execution.js";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error("v0.15 MP necessity A2: " + message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

function sameMembers(
  actual: readonly LinkHandle[],
  expected: readonly LinkHandle[],
  message: string,
): void {
  same(actual.length, expected.length, message + " cardinality");
  for (const member of expected) {
    assert(actual.includes(member), message + " missing expected member");
  }
}

interface Fixture {
  readonly memory: Memory;
  readonly theory: LinkHandle;
  readonly foreignTheory: LinkHandle;
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
    cursor = memory.ensure(cursor, cursor === basis.U ? basis.C : basis.O)
  );

  return Object.freeze({
    memory,
    theory: fresh(),
    foreignTheory: fresh(),
    K: fresh(),
    A: fresh(),
    B: fresh(),
    C: fresh(),
    D: fresh(),
    E: fresh(),
    fresh,
  });
}

function admit(
  f: Fixture,
  antecedent: LinkHandle,
  outputs: readonly LinkHandle[],
  theory = f.theory,
): LinkHandle {
  const image = materializeExactSequence(f.memory, outputs);
  const relation = f.memory.ensure(antecedent, image);
  f.memory.ensure(theory, relation);
  return relation;
}

function active(f: Fixture, value: LinkHandle): LinkHandle {
  return f.memory.ensure(f.K, value);
}

function run(
  f: Fixture,
  members: readonly LinkHandle[],
  theory = f.theory,
) {
  const scope = defineV013GroundedExecutionScope(
    f.memory,
    f.fresh(),
    theory,
    members,
  );
  const cursor = new V013GroundedScopeCursor(f.memory, scope);
  const reaction = reactV013GroundedScope(f.memory, cursor, f.fresh());
  return Object.freeze({ cursor, reaction });
}

// MP0 is not a complete reaction contract: NO_MATCH and ACTIVE_IDENTITY have
// the same extensional successor but distinct reaction occurrence.
{
  const noMatch = fixture();
  const current = active(noMatch, noMatch.A);
  const passive = run(noMatch, [current]);
  sameMembers(passive.cursor.members(), [current], "NO_MATCH successor");
  same(passive.reaction.matchedRelations, 0, "NO_MATCH matchedRelations");
  same(passive.reaction.handoffCount, 0, "NO_MATCH handoff");
  same(passive.reaction.quiescent, true, "NO_MATCH quiescent");

  const identity = fixture();
  admit(identity, identity.A, [identity.A]);
  const identityCurrent = active(identity, identity.A);
  const reacted = run(identity, [identityCurrent]);
  sameMembers(reacted.cursor.members(), [identityCurrent], "identity successor");
  same(reacted.reaction.matchedRelations, 1, "identity matchedRelations");
  same(reacted.reaction.handoffCount, 1, "identity handoff");
  same(reacted.reaction.quiescent, false, "identity is active");
}

// MP1 needs explicit MATCH+EMPTY_IMAGE semantics: 1->0 differs from NO_MATCH.
{
  const f = fixture();
  admit(f, f.A, []);
  const zero = run(f, [active(f, f.A)]);
  sameMembers(zero.cursor.members(), [], "1->0 successor");
  same(zero.reaction.matchedRelations, 1, "1->0 matchedRelations");
  same(zero.reaction.transitionedMembers, 1, "1->0 transitionedMembers");
  same(zero.reaction.handoffCount, 1, "1->0 handoff");
}

// 1->1.
{
  const f = fixture();
  admit(f, f.A, [f.B]);
  const one = run(f, [active(f, f.A)]);
  sameMembers(one.cursor.members(), [active(f, f.B)], "1->1 successor");
  same(one.reaction.matchedRelations, 1, "1->1 matchedRelations");
}

// 1->N and multiple matches remain unary at the antecedent boundary.
{
  const f = fixture();
  admit(f, f.A, [f.B, f.C]);
  admit(f, f.A, [f.C, f.D]);
  const many = run(f, [active(f, f.A)]);
  sameMembers(
    many.cursor.members(),
    [active(f, f.B), active(f, f.C), active(f, f.D)],
    "1->N union",
  );
  same(many.reaction.matchedRelations, 2, "1->N all admitted matches");
  same(many.reaction.transitionedMembers, 1, "1->N one current antecedent");
}

// MP2 candidate is a pointwise lift of MP1: several independent current
// members contribute to one canonical successor Scope.
{
  const f = fixture();
  admit(f, f.A, []);
  admit(f, f.A, [f.B]);
  admit(f, f.C, [f.D, f.E]);
  const mixed = run(
    f,
    [active(f, f.A), active(f, f.C), active(f, f.B)],
  );
  sameMembers(
    mixed.cursor.members(),
    [active(f, f.B), active(f, f.D), active(f, f.E)],
    "N->M pointwise union",
  );
  same(mixed.reaction.matchedRelations, 3, "N->M matchedRelations");
  same(mixed.reaction.transitionedMembers, 2, "N->M transitionedMembers");
  same(mixed.reaction.handoffCount, 1, "N->M one atomic handoff");
}

// N->1 is canonical convergence, not a multi-antecedent join.
{
  const f = fixture();
  admit(f, f.A, [f.B]);
  admit(f, f.C, [f.B]);
  const converged = run(f, [active(f, f.A), active(f, f.C)]);
  sameMembers(converged.cursor.members(), [active(f, f.B)], "N->1 convergence");
  same(converged.reaction.matchedRelations, 2, "N->1 two independent matches");
}

// Theory selection is explicit authority.
{
  const f = fixture();
  admit(f, f.A, [f.B], f.foreignTheory);
  const current = active(f, f.A);
  const selected = run(f, [current], f.theory);
  sameMembers(selected.cursor.members(), [current], "foreign Theory inert");
  same(selected.reaction.matchedRelations, 0, "foreign Theory no match");
}

// An explicitly packed antecedent is one Link and therefore unary for MP1.
// Separate members do not implicitly satisfy that relation.
{
  const f = fixture();
  const pair = f.memory.ensure(f.A, f.C);
  admit(f, pair, [f.D]);

  const unpacked = run(f, [active(f, f.A), active(f, f.C)]);
  sameMembers(
    unpacked.cursor.members(),
    [active(f, f.A), active(f, f.C)],
    "separate members do not imply packed antecedent",
  );
  same(unpacked.reaction.matchedRelations, 0, "unpacked cross-member no match");

  const packed = run(f, [active(f, pair)]);
  sameMembers(packed.cursor.members(), [active(f, f.D)], "packed antecedent fires");
  same(packed.reaction.matchedRelations, 1, "packed antecedent unary match");
}

// Machine-readable candidate must remain weaker than an implicit cross-member
// join and must keep the historical execution premises explicit.
{
  const root = resolve(process.cwd(), "..");
  const candidate = JSON.parse(
    readFileSync(
      join(root, "profiles/mts-v015-generalized-reaction-candidate.json"),
      "utf8",
    ),
  ) as {
    status: string;
    candidateFamily: string;
    capabilityAxes: {
      matchPower: string;
      jointAntecedentArity: string;
      imageArity: string;
      scopeLift: string;
      eventPublication: string;
    };
    competingCandidate: {
      id: string;
      status: string;
      matchPower: string;
      jointAntecedentArity: string;
    };
    decision: {
      scalarPositiveLaw: string;
      minimalCompleteLocalReaction: string;
      scopeLift: string;
      packedStructuralAntecedent: string;
      trueCrossMemberJoin: string;
    };
    crossMemberJoin: {
      implicitPackingForbidden: boolean;
      requiredForV015: boolean;
    };
    frozenExecutionBackend: {
      main: string;
      version: string;
      semanticAuthority: boolean;
    };
    theoremPremiseSplit: {
      status: string;
      localReactionPower: {
        classification: string;
      };
      derivedTheoremCandidates: {
        BUNDLE_LIFT: { classification: string };
        POINTWISE_CURRENT_LIFT: { classification: string };
        PARTITION_ORDER_INVARIANCE: { classification: string };
        FINITE_ONE_GENERATION_COMPLETION: { classification: string };
      };
      executionPremises: {
        SELECTED_THEORY_AUTHORITY: string;
        REACTION_START_SNAPSHOT: string;
        EXHAUSTIVE_DISCOVERY: string;
        NO_MATCH_PRESERVATION: string;
        MATCHED_EMPTY_ZERO: string;
        GENERATION_ISOLATION: string;
        COMPLETE_SUCCESSOR_BEFORE_PUBLICATION: string;
        ATOMIC_PUBLICATION: string;
        FINITE_MATERIALIZED_EXECUTION_SLICE: string;
      };
      explicitNonClaims: readonly string[];
    };
  };
  const accepted = JSON.parse(
    readFileSync(
      join(root, "profiles/amemory-execution-profile.json"),
      "utf8",
    ),
  ) as {
    theory: {
      visibility: string;
      sameSnapshotForAllCurrentMembers: boolean;
    };
    publication: {
      fullSuccessorBuiltBeforePublication: boolean;
      atomicCurrentRootHandoff: boolean;
    };
  };

  same(candidate.status, "DEVELOPMENT_ONLY_AUTHOR_REVIEW_PENDING", "candidate status");
  same(candidate.candidateFamily, "GROUNDED_EXACT_REACTION_FLOOR", "grounded candidate family");
  same(candidate.capabilityAxes.matchPower, "EXACT_ANTECEDENT_IDENTITY", "grounded exact match axis");
  same(candidate.capabilityAxes.jointAntecedentArity, "ONE_CURRENT_MEMBER", "grounded one-member antecedent");
  same(candidate.capabilityAxes.imageArity, "ZERO_ONE_MANY", "grounded image cardinality");
  same(candidate.capabilityAxes.scopeLift, "POINTWISE_N_CURRENT_MEMBERS", "grounded pointwise scope lift");
  same(candidate.competingCandidate.id, "STRUCTURAL_UNARY_TEMPLATE_REACTION", "structural-unary comparison retained");
  same(
    candidate.competingCandidate.status,
    "AUTHOR_APPROVED_DESIGN_PROOF_PENDING",
    "structural-unary Γ design approved with proof closure pending",
  );
  same(candidate.competingCandidate.matchPower, "STRUCTURAL_TEMPLATE_WITH_ROLES", "structural-unary match axis");
  same(candidate.competingCandidate.jointAntecedentArity, "ONE_CURRENT_MEMBER", "structural-unary is not cross-member join");
  same(candidate.decision.scalarPositiveLaw, "MP0_RETAINED", "MP0 retained");
  same(candidate.decision.minimalCompleteLocalReaction, "MP1_CANDIDATE", "MP1 candidate");
  same(candidate.decision.scopeLift, "MP2_DERIVED_CANDIDATE", "MP2 derived candidate");
  same(
    candidate.decision.packedStructuralAntecedent,
    "MP1_ON_EXPLICIT_COMPOSITE_LINK",
    "packed structure remains unary",
  );
  same(
    candidate.decision.trueCrossMemberJoin,
    "MP4_DEFERRED_NOT_REQUIRED_BY_CURRENT_CORPUS",
    "MP4 deferred",
  );
  same(candidate.crossMemberJoin.implicitPackingForbidden, true, "implicit packing forbidden");
  same(candidate.crossMemberJoin.requiredForV015, false, "MP4 not currently required");
  same(candidate.frozenExecutionBackend.semanticAuthority, false, "frozen backend non-authoritative");
  same(
    candidate.frozenExecutionBackend.main,
    "832daa89f15fd0f3b7b40819b6d3670c7fd57e7d",
    "frozen backend exact SHA",
  );
  same(candidate.frozenExecutionBackend.version, "0.175.0", "frozen backend version");

  same(
    candidate.theoremPremiseSplit.status,
    "GREEN_RESEARCH_AUTHOR_REVIEW_PENDING",
    "theorem/premise split status",
  );
  same(
    candidate.theoremPremiseSplit.localReactionPower.classification,
    "OPEN_ARCHITECTURE_DECISION",
    "local reaction power remains an Author decision",
  );
  same(
    candidate.theoremPremiseSplit.derivedTheoremCandidates.BUNDLE_LIFT.classification,
    "DERIVED_GIVEN_LOCAL_REACTION_AND_EXHAUSTIVE_SELECTED_RELATIONS",
    "bundle lift is classified as derived under explicit premises",
  );
  same(
    candidate.theoremPremiseSplit.derivedTheoremCandidates.POINTWISE_CURRENT_LIFT.classification,
    "DERIVED_GIVEN_MEMBER_INDEPENDENCE_AND_ONE_REACTION_START_SNAPSHOT",
    "pointwise lift is classified as derived under explicit premises",
  );
  same(
    candidate.theoremPremiseSplit.derivedTheoremCandidates.PARTITION_ORDER_INVARIANCE.classification,
    "PROVED_RESEARCH",
    "partition invariance evidence classification",
  );
  same(
    candidate.theoremPremiseSplit.derivedTheoremCandidates.FINITE_ONE_GENERATION_COMPLETION.classification,
    "PROVED_RESEARCH_GIVEN_EXPLICIT_FINITE_EXECUTION_PREMISES",
    "finite completion evidence classification",
  );
  for (const premise of [
    "REACTION_START_SNAPSHOT",
    "EXHAUSTIVE_DISCOVERY",
    "GENERATION_ISOLATION",
    "COMPLETE_SUCCESSOR_BEFORE_PUBLICATION",
    "ATOMIC_PUBLICATION",
  ] as const) {
    assert(
      candidate.theoremPremiseSplit.executionPremises[premise]?.includes("PREMISE"),
      premise + " remains a premise rather than a fake MP theorem",
    );
  }
  assert(
    candidate.theoremPremiseSplit.executionPremises.NO_MATCH_PRESERVATION.includes(
      "REACTION_SEMANTICS_RULE",
    ),
    "NO_MATCH preservation remains explicit reaction semantics",
  );
  assert(
    candidate.theoremPremiseSplit.executionPremises.MATCHED_EMPTY_ZERO.includes(
      "REACTION_SEMANTICS_RULE",
    ),
    "matched-empty remains explicit reaction semantics",
  );
  assert(
    candidate.theoremPremiseSplit.explicitNonClaims.some((value) =>
      value.includes("atomic publication")
    ),
    "profile explicitly forbids deriving atomic publication from scalar MP",
  );

  same(accepted.theory.visibility, "reaction-start-snapshot", "accepted Theory snapshot");
  same(
    accepted.theory.sameSnapshotForAllCurrentMembers,
    true,
    "accepted one snapshot for pointwise lift",
  );
  same(
    accepted.publication.fullSuccessorBuiltBeforePublication,
    true,
    "accepted complete successor before publish",
  );
  same(
    accepted.publication.atomicCurrentRootHandoff,
    true,
    "accepted atomic handoff",
  );
}

console.log([
  "MTS_V015_MP_A2=CANDIDATE_GREEN",
  "MP0=POSITIVE_DETACHMENT_RETAINED",
  "MP1=MINIMAL_COMPLETE_LOCAL_REACTION_CANDIDATE",
  "MP2=DERIVED_POINTWISE_LIFT_CANDIDATE",
  "MP3=EXPLICIT_PACKING_NOT_STRONGER_RUNTIME_PRIMITIVE",
  "MP_MATCH_AXES=EXPLICIT",
  "GROUNDED_CANDIDATE=EXACT_ONE_MEMBER",
  "STRUCTURAL_UNARY_CANDIDATE=OPEN_COMPARISON",
  "MP4=DEFERRED_NOT_REQUIRED_BY_CURRENT_CORPUS",
  "THEOREM_PREMISE_SPLIT=EXPLICIT_GREEN_RESEARCH",
  "ATOMIC_PUBLICATION=PREMISE_NOT_MP_THEOREM",
  "SNAPSHOT=PREMISE_NOT_MP_THEOREM",
  "NO_MATCH_VS_IDENTITY=DISTINCT",
  "MATCHED_EMPTY=EXPLICIT",
  "ONE_TO_ZERO=GREEN",
  "ONE_TO_ONE=GREEN",
  "ONE_TO_N=GREEN",
  "N_TO_ONE=GREEN",
  "N_TO_M=GREEN",
  "PACKED_ANTECEDENT=UNARY_GREEN",
  "UNPACKED_JOIN=NO_MATCH",
  "FROZEN_AMEMORY=832daa89f15f",
].join(" "));
