import MtsV015GeneralizedReactionCore

/-
Clean-main theorem-boundary continuation of the #1989 GPR proof projection.
Contains GPR-02/03/04/05/09. The imported Core owns GPR-07/06/08/01.
-/

namespace MTS.V015.External

/-
GPR-02 — canonical ANet membership convergence.

Semantic ANet membership is extensional: deriving the same canonical Link more
than once does not introduce semantic multiplicity. This is a membership law,
not a runtime "dedup command". Provenance/event multiplicity may be retained in
a separate evidence carrier. ExactSequence multiplicity is explicitly outside
this law.
-/

def AddAsetMember
    {Link : Type}
    (member : Link → Prop)
    (derived : Link) : Link → Prop :=
  fun value => value = derived ∨ member value

/--
Adding the same canonical Link twice changes no ANet-membership query.
The theorem is pointwise and therefore needs no proposition/function
extensionality axiom.
-/
theorem GPR_02_duplicate_membership_idempotent
    {Link : Type}
    (member : Link → Prop)
    (derived value : Link) :
    AddAsetMember (AddAsetMember member derived) derived value ↔
    AddAsetMember member derived value := by
  constructor
  · intro duplicated
    rcases duplicated with same | nested
    · exact Or.inl same
    · rcases nested with same | old
      · exact Or.inl same
      · exact Or.inr old
  · intro single
    rcases single with same | old
    · exact Or.inl same
    · exact Or.inr (Or.inr old)

/--
Order of two semantic membership contributions is nonsemantic at the ANet
membership level.
-/
theorem GPR_02_membership_contribution_commutes
    {Link : Type}
    (member : Link → Prop)
    (first second value : Link) :
    AddAsetMember (AddAsetMember member first) second value ↔
    AddAsetMember (AddAsetMember member second) first value := by
  constructor
  · intro left
    rcases left with secondEq | nested
    · exact Or.inr (Or.inl secondEq)
    · rcases nested with firstEq | old
      · exact Or.inl firstEq
      · exact Or.inr (Or.inr old)
  · intro right
    rcases right with firstEq | nested
    · exact Or.inr (Or.inl firstEq)
    · rcases nested with secondEq | old
      · exact Or.inl secondEq
      · exact Or.inr (Or.inr old)

def EventDerives
    {Link Provenance : Type}
    (events : List (Link × Provenance))
    (value : Link) : Prop :=
  ∃ provenance, (value, provenance) ∈ events

/--
Two distinct derivation events may remain two evidence occurrences even when
they project to one semantic Link membership.
-/
theorem GPR_02_duplicate_provenance_events_are_preserved
    {Link Provenance : Type}
    (value : Link)
    (firstProvenance secondProvenance : Provenance) :
    let events := [(value, firstProvenance), (value, secondProvenance)]
    events.length = 2 ∧ EventDerives events value := by
  dsimp
  constructor
  · rfl
  · refine ⟨firstProvenance, ?_⟩
    exact List.Mem.head _

/--
ANet idempotence MUST NOT collapse repeated positions inside ExactSequence.
-/
theorem GPR_02_exact_sequence_multiplicity_not_collapsed
    {Atom : Type}
    (value : ExactPackedLink Atom) :
    packExactSequence [value, value] ≠
    packExactSequence [value] := by
  intro equalPacked
  change
    ExactPackedLink.pair value
        (ExactPackedLink.pair value ExactPackedLink.root) =
      ExactPackedLink.pair value ExactPackedLink.root
    at equalPacked
  have tailEqual := (ExactPackedLink.pair.inj equalPacked).2
  cases tailEqual


/-
GPR-03 — generation isolation / no read-your-own-writes.

PrePublicationCurrent is verifier-side refinement machinery. It states the
selected semantic law explicitly: while one Gamma generation is being
analyzed/staged, the observable current remains the reaction-start State.
Only publication creates the State that may be analyzed by the next Gamma.
-/

def PrePublicationCurrent
    {State Staged : Type}
    (before : State)
    (_staged : Staged) : State :=
  before

theorem GPR_03_prepublication_current_is_reaction_start
    {State Staged : Type}
    (before : State)
    (staged : Staged) :
    PrePublicationCurrent before staged = before :=
  rfl

theorem GPR_03_analysis_ignores_staged_candidate
    {State Analysis Staged : Type}
    (D : ReactionDecomposition State Analysis Staged)
    (before : State)
    (firstStaged secondStaged : Staged) :
    D.analyze (PrePublicationCurrent before firstStaged) =
    D.analyze (PrePublicationCurrent before secondStaged) :=
  rfl

/--
A concrete A->B->C-style witness. One semantic Gamma maps A to B. Feeding B
back into analysis immediately computes the second generation C and therefore
is not a refinement of one isolated generation.
-/
inductive GPR03WitnessState
  | a
  | b
  | c
  deriving DecidableEq

def gpr03WitnessDecomposition :
    ReactionDecomposition
      GPR03WitnessState
      GPR03WitnessState
      GPR03WitnessState where
  analyze := fun state => state
  synthesize := fun
    | .a => .b
    | .b => .c
    | .c => .c
  publish := fun _before staged => staged

theorem GPR_03_one_generation_stops_at_B :
    Gamma gpr03WitnessDecomposition GPR03WitnessState.a =
    GPR03WitnessState.b :=
  rfl

theorem GPR_03_read_your_own_writes_is_not_one_generation :
    Gamma gpr03WitnessDecomposition
        (Gamma gpr03WitnessDecomposition GPR03WitnessState.a) ≠
      Gamma gpr03WitnessDecomposition GPR03WitnessState.a := by
  decide


/-
GPR-04 — partition/schedule refinement.

ReductionContribution is external proof machinery for the extensional result
of independently analyzed work. The merge operation models the A11 law:
matched flags combine by OR and output membership combines by extensional OR.
No runtime UNION opcode or second semantic command is introduced.
-/

structure ReductionContribution (Output : Type) where
  matched : Prop
  emits : Output → Prop

def MergeContribution
    {Output : Type}
    (left right : ReductionContribution Output) :
    ReductionContribution Output where
  matched := left.matched ∨ right.matched
  emits := fun output => left.emits output ∨ right.emits output

def ContributionEquivalent
    {Output : Type}
    (left right : ReductionContribution Output) : Prop :=
  (left.matched ↔ right.matched) ∧
  ∀ output, left.emits output ↔ right.emits output

theorem GPR_04_merge_associative_observation
    {Output : Type}
    (a b c : ReductionContribution Output) :
    ContributionEquivalent
      (MergeContribution (MergeContribution a b) c)
      (MergeContribution a (MergeContribution b c)) := by
  constructor
  · change ((a.matched ∨ b.matched) ∨ c.matched) ↔
      (a.matched ∨ (b.matched ∨ c.matched))
    exact or_assoc
  · intro output
    change ((a.emits output ∨ b.emits output) ∨ c.emits output) ↔
      (a.emits output ∨ (b.emits output ∨ c.emits output))
    exact or_assoc

theorem GPR_04_merge_commutative_observation
    {Output : Type}
    (a b : ReductionContribution Output) :
    ContributionEquivalent
      (MergeContribution a b)
      (MergeContribution b a) := by
  constructor
  · change (a.matched ∨ b.matched) ↔ (b.matched ∨ a.matched)
    exact or_comm
  · intro output
    change (a.emits output ∨ b.emits output) ↔
      (b.emits output ∨ a.emits output)
    exact or_comm

theorem GPR_04_merge_idempotent_observation
    {Output : Type}
    (a : ReductionContribution Output) :
    ContributionEquivalent
      (MergeContribution a a)
      a := by
  constructor
  · change (a.matched ∨ a.matched) ↔ a.matched
    constructor
    · intro duplicated
      rcases duplicated with value | value
      · exact value
      · exact value
    · intro value
      exact Or.inl value
  · intro output
    change (a.emits output ∨ a.emits output) ↔ a.emits output
    constructor
    · intro duplicated
      rcases duplicated with value | value
      · exact value
      · exact value
    · intro value
      exact Or.inl value

theorem gpr04_four_way_repartition
    (A B C D : Prop) :
    ((A ∨ B) ∨ (C ∨ D)) ↔
    ((A ∨ C) ∨ (B ∨ D)) := by
  constructor
  · intro left
    rcases left with ab | cd
    · rcases ab with a | b
      · exact Or.inl (Or.inl a)
      · exact Or.inr (Or.inl b)
    · rcases cd with c | d
      · exact Or.inl (Or.inr c)
      · exact Or.inr (Or.inr d)
  · intro right
    rcases right with ac | bd
    · rcases ac with a | c
      · exact Or.inl (Or.inl a)
      · exact Or.inr (Or.inl c)
    · rcases bd with b | d
      · exact Or.inl (Or.inr b)
      · exact Or.inr (Or.inr d)

theorem GPR_04_two_dimensional_partition_refinement
    {Output : Type}
    (a11 a12 a21 a22 : ReductionContribution Output) :
    ContributionEquivalent
      (MergeContribution
        (MergeContribution a11 a12)
        (MergeContribution a21 a22))
      (MergeContribution
        (MergeContribution a11 a21)
        (MergeContribution a12 a22)) := by
  constructor
  · change
      ((a11.matched ∨ a12.matched) ∨ (a21.matched ∨ a22.matched)) ↔
      ((a11.matched ∨ a21.matched) ∨ (a12.matched ∨ a22.matched))
    exact gpr04_four_way_repartition _ _ _ _
  · intro output
    change
      ((a11.emits output ∨ a12.emits output) ∨
        (a21.emits output ∨ a22.emits output)) ↔
      ((a11.emits output ∨ a21.emits output) ∨
        (a12.emits output ∨ a22.emits output))
    exact gpr04_four_way_repartition _ _ _ _

def PreserveCurrentAllowed
    {Output : Type}
    (contribution : ReductionContribution Output) : Prop :=
  ¬ contribution.matched

theorem GPR_04_local_no_match_cannot_publish_global_no_match
    {Output : Type}
    (left right : ReductionContribution Output)
    (_leftNoMatch : ¬ left.matched)
    (rightMatch : right.matched) :
    ¬ PreserveCurrentAllowed (MergeContribution left right) := by
  intro preserve
  exact preserve (Or.inr rightMatch)

/-
GPR-05 — finite completion boundary.

This projection deliberately leaves Link and Rule as arbitrary Types. It does
not assume a finite ambient Link carrier. Finiteness enters only through the
materialized lists used by one concrete reaction and through Nat-valued local
match cost (the explicit local-termination premise).

The bounds below are verifier/refinement budgets, not new MTS ontology.
-/

def GPR05TotalImageSize
    {Link Rule : Type}
    (rules : List Rule)
    (image : Rule → List Link) : Nat :=
  rules.foldr (fun rule total => (image rule).length + total) 0

def GPR05LocalWork
    {Link Rule : Type}
    (currents : List Link)
    (rules : List Rule)
    (localMatchCost : Link → Rule → Nat) : Nat :=
  currents.foldr
    (fun current total =>
      rules.foldr
        (fun rule subtotal => localMatchCost current rule + subtotal)
        0 + total)
    0

def GPR05ComparisonBound
    {Link Rule : Type}
    (currents : List Link)
    (rules : List Rule) : Nat :=
  currents.length * rules.length

def GPR05RawStageBound
    {Link Rule : Type}
    (currents : List Link)
    (rules : List Rule)
    (image : Rule → List Link) : Nat :=
  currents.length * GPR05TotalImageSize rules image

def GPR05SuccessorStageBound
    {Link Rule : Type}
    (currents : List Link)
    (rules : List Rule)
    (image : Rule → List Link) : Nat :=
  currents.length + GPR05RawStageBound currents rules image

theorem GPR_05_current_rule_comparison_product
    {Link Rule : Type}
    (currents : List Link)
    (rules : List Rule) :
    GPR05ComparisonBound currents rules =
      currents.length * rules.length := by
  rfl

theorem GPR_05_raw_staging_budget
    {Link Rule : Type}
    (currents : List Link)
    (rules : List Rule)
    (image : Rule → List Link) :
    GPR05RawStageBound currents rules image =
      currents.length * GPR05TotalImageSize rules image := by
  rfl

theorem GPR_05_finite_generation_budget
    {Link Rule : Type}
    (materialized : List Link)
    (currents : List Link)
    (rules : List Rule)
    (image : Rule → List Link)
    (localMatchCost : Link → Rule → Nat) :
    ∃ comparisonBound localWorkBound rawStageBound
        successorStageBound materializedCount : Nat,
      comparisonBound = GPR05ComparisonBound currents rules ∧
      localWorkBound = GPR05LocalWork currents rules localMatchCost ∧
      rawStageBound = GPR05RawStageBound currents rules image ∧
      successorStageBound = GPR05SuccessorStageBound currents rules image ∧
      materializedCount = materialized.length := by
  refine ⟨GPR05ComparisonBound currents rules,
    GPR05LocalWork currents rules localMatchCost,
    GPR05RawStageBound currents rules image,
    GPR05SuccessorStageBound currents rules image,
    materialized.length, rfl, rfl, rfl, rfl, rfl⟩

theorem GPR_05_no_finite_ambient_carrier_required
    {Link : Type}
    (materialized : List Link) :
    ∃ materializedCount : Nat,
      materializedCount = materialized.length := by
  exact ⟨materialized.length, rfl⟩

/-
GPR-09 — direct-gauge C-boundary compatibility and chirality covariance.

Accepted v0.14 CTX-03 already supplies the Link-native mirror transport:
one-sided START/END classes exchange under J while relative structural roles
are preserved. This v0.15 projection isolates the remaining Gamma obligation.

The theorem below does NOT postulate a reverse-execution mode. It assumes each
internal phase of the SAME Gamma operation commutes with the selected mirror
transport and proves that their composition commutes as well.

State/Plan/Stage/Boundary are verifier-side types only.
-/

structure GPR09ChiralGammaKernel
    (State Plan Stage Boundary : Type) where
  analyze : Boundary → State → Plan
  synthesize : Boundary → Plan → Stage
  publish : Boundary → State → Stage → State
  mirrorState : State → State
  mirrorPlan : Plan → Plan
  mirrorStage : Stage → Stage
  mirrorBoundary : Boundary → Boundary

  mirrorStateInvolutive :
    ∀ state, mirrorState (mirrorState state) = state

  mirrorBoundaryInvolutive :
    ∀ boundary, mirrorBoundary (mirrorBoundary boundary) = boundary

  analysisCovariant :
    ∀ boundary state,
      mirrorPlan (analyze boundary state) =
        analyze (mirrorBoundary boundary) (mirrorState state)

  synthesisCovariant :
    ∀ boundary plan,
      mirrorStage (synthesize boundary plan) =
        synthesize (mirrorBoundary boundary) (mirrorPlan plan)

  publicationCovariant :
    ∀ boundary state stage,
      mirrorState (publish boundary state stage) =
        publish
          (mirrorBoundary boundary)
          (mirrorState state)
          (mirrorStage stage)

def GPR09Gamma
    {State Plan Stage Boundary : Type}
    (K : GPR09ChiralGammaKernel State Plan Stage Boundary)
    (boundary : Boundary)
    (state : State) : State :=
  K.publish boundary state
    (K.synthesize boundary (K.analyze boundary state))

theorem GPR_09_gamma_chirality_covariant
    {State Plan Stage Boundary : Type}
    (K : GPR09ChiralGammaKernel State Plan Stage Boundary)
    (boundary : Boundary)
    (state : State) :
    K.mirrorState (GPR09Gamma K boundary state) =
      GPR09Gamma K (K.mirrorBoundary boundary) (K.mirrorState state) := by
  calc
    K.mirrorState (GPR09Gamma K boundary state) =
        K.publish
          (K.mirrorBoundary boundary)
          (K.mirrorState state)
          (K.mirrorStage
            (K.synthesize boundary (K.analyze boundary state))) := by
      exact K.publicationCovariant
        boundary state
        (K.synthesize boundary (K.analyze boundary state))
    _ =
        K.publish
          (K.mirrorBoundary boundary)
          (K.mirrorState state)
          (K.synthesize
            (K.mirrorBoundary boundary)
            (K.mirrorPlan (K.analyze boundary state))) := by
      rw [K.synthesisCovariant]
    _ =
        K.publish
          (K.mirrorBoundary boundary)
          (K.mirrorState state)
          (K.synthesize
            (K.mirrorBoundary boundary)
            (K.analyze
              (K.mirrorBoundary boundary)
              (K.mirrorState state))) := by
      rw [K.analysisCovariant]
    _ = GPR09Gamma K
        (K.mirrorBoundary boundary)
        (K.mirrorState state) := by
      rfl

theorem GPR_09_direct_end_boundary_mirrors_to_start
    {State Plan Stage Boundary : Type}
    (K : GPR09ChiralGammaKernel State Plan Stage Boundary)
    (directBoundary rootEnd rootStart : Boundary)
    (directIsEnd : directBoundary = rootEnd)
    (endMirrorsStart : K.mirrorBoundary rootEnd = rootStart) :
    K.mirrorBoundary directBoundary = rootStart := by
  rw [directIsEnd, endMirrorsStart]

theorem GPR_09_direct_gauge_mirror_equivalence
    {State Plan Stage Boundary : Type}
    (K : GPR09ChiralGammaKernel State Plan Stage Boundary)
    (directBoundary rootEnd rootStart : Boundary)
    (directIsEnd : directBoundary = rootEnd)
    (endMirrorsStart : K.mirrorBoundary rootEnd = rootStart)
    (state : State) :
    K.mirrorState (GPR09Gamma K directBoundary state) =
      GPR09Gamma K rootStart (K.mirrorState state) := by
  calc
    K.mirrorState (GPR09Gamma K directBoundary state) =
        GPR09Gamma K
          (K.mirrorBoundary directBoundary)
          (K.mirrorState state) :=
      GPR_09_gamma_chirality_covariant K directBoundary state
    _ = GPR09Gamma K rootStart (K.mirrorState state) := by
      rw [GPR_09_direct_end_boundary_mirrors_to_start
        K directBoundary rootEnd rootStart directIsEnd endMirrorsStart]

theorem GPR_09_boundary_mirror_roundtrip
    {State Plan Stage Boundary : Type}
    (K : GPR09ChiralGammaKernel State Plan Stage Boundary)
    (boundary : Boundary) :
    K.mirrorBoundary (K.mirrorBoundary boundary) = boundary :=
  K.mirrorBoundaryInvolutive boundary

end MTS.V015.External

