/-
MTS v0.15 EXTERNAL PROOF PROJECTION — GPR-07

This file is a verifier-side projection only. Lean types, Lists and Props are
not MTS ontology and carry no semantic authority.

GPR-07 asks whether the exact/grounded rule is a separate execution mechanism.
The theorem below proves the opposite under two explicit laws of the SAME
generic matcher/instantiator:

1. with an empty role bundle, matching succeeds exactly on Link identity and
   returns the empty substitution;
2. instantiation under the empty substitution is identity.

No structural-unification power is attributed to classical grounded MP.
-/

namespace MTS.V015.External

structure GenericRuleKernel (Link Binding : Type) where
  matchRel : List Link → Link → Link → List Binding → Prop
  instantiate : List Binding → Link → Link

  emptyRolesMatch :
    ∀ {template actual bindings},
      matchRel [] template actual bindings ↔
        template = actual ∧ bindings = []

  emptySubstitutionIdentity :
    ∀ value, instantiate [] value = value

structure RoleBundleRule (Link : Type) where
  roles : List Link
  antecedent : Link
  outputs : List Link

def GenericStep
    {Link Binding : Type}
    (K : GenericRuleKernel Link Binding)
    (rule : RoleBundleRule Link)
    (current : Link)
    (result : List Link) : Prop :=
  ∃ bindings,
    K.matchRel rule.roles rule.antecedent current bindings ∧
    result = rule.outputs.map (K.instantiate bindings)

def GroundedExactStep
    {Link : Type}
    (rule : RoleBundleRule Link)
    (current : Link)
    (result : List Link) : Prop :=
  rule.roles = [] ∧
  rule.antecedent = current ∧
  result = rule.outputs

theorem empty_substitution_map_identity
    {Link Binding : Type}
    (K : GenericRuleKernel Link Binding)
    (values : List Link) :
    values.map (K.instantiate []) = values := by
  induction values with
  | nil =>
      rfl
  | cons head tail ih =>
      simp only [List.map_cons]
      rw [K.emptySubstitutionIdentity head, ih]

/--
GPR-07 — grounded exact MP is the zero-role refinement of the SAME generic
role-bundle Rule step.

The theorem is intentionally conditional on the two generic-kernel laws above.
It does not postulate a second RuleKind, grounded opcode, alternate matcher, or
structural binding inside classical MP.
-/
theorem GPR_07_grounded_zero_role_refinement
    {Link Binding : Type}
    (K : GenericRuleKernel Link Binding)
    (rule : RoleBundleRule Link)
    (current : Link)
    (result : List Link)
    (zeroRoles : rule.roles = []) :
    GenericStep K rule current result ↔
    GroundedExactStep rule current result := by
  constructor
  · intro generic
    rcases generic with ⟨bindings, matched, produced⟩
    rw [zeroRoles] at matched
    have exactMatch := (K.emptyRolesMatch).mp matched
    rcases exactMatch with ⟨antecedentEq, bindingsEq⟩
    subst bindings
    refine ⟨zeroRoles, antecedentEq, ?_⟩
    calc
      result = rule.outputs.map (K.instantiate []) := produced
      _ = rule.outputs := empty_substitution_map_identity K rule.outputs
  · intro grounded
    rcases grounded with ⟨_, antecedentEq, produced⟩
    refine ⟨[], ?_, ?_⟩
    · rw [zeroRoles]
      exact (K.emptyRolesMatch).mpr ⟨antecedentEq, rfl⟩
    · calc
        result = rule.outputs := produced
        _ = rule.outputs.map (K.instantiate []) :=
          (empty_substitution_map_identity K rule.outputs).symm

/--
A successful zero-role generic match cannot hide any structural binding.
-/
theorem GPR_07_zero_role_has_empty_substitution
    {Link Binding : Type}
    (K : GenericRuleKernel Link Binding)
    {template actual : Link}
    {bindings : List Binding}
    (matched : K.matchRel [] template actual bindings) :
    template = actual ∧ bindings = [] :=
  (K.emptyRolesMatch).mp matched




/-
GPR-06 — finite multi-generation opacity of exact-only S0.

This lower-bound theorem does not model a particular A-memory implementation.
It isolates the explicit information/construction boundary used by A10/M6B:

* the machine may preserve the opaque current input identity;
* it may emit any Link from one fixed finite exact support;
* it has no structural reflection/decomposition of the input;
* it has no fresh structural constructor whose result escapes
  {opaque input} ∪ exact support.

ExactS0ClosedState is the invariant expressing precisely that boundary.
Any finite number of steps preserving the invariant remains unable to emit a
fresh structure-sensitive target outside that closure.
-/

def ExactS0Reachable
    {Link : Type}
    (support : List Link)
    (input value : Link) : Prop :=
  value = input ∨ value ∈ support

def ExactS0ClosedState
    {Link : Type}
    (support : List Link)
    (input : Link)
    (state : List Link) : Prop :=
  ∀ value, value ∈ state → ExactS0Reachable support input value

def ExactOnlyRun
    {State : Type}
    (step : State → State) : Nat → State → State
  | 0, state => state
  | Nat.succ generations, state =>
      ExactOnlyRun step generations (step state)

/--
GPR-06 invariant: arbitrary finite iteration cannot escape the exact-only
closure if every individual S0 step preserves that closure.
-/
theorem GPR_06_finite_exact_closure
    {Link : Type}
    (support : List Link)
    (input : Link)
    (step : List Link → List Link)
    (stepClosed :
      ∀ state,
        ExactS0ClosedState support input state →
        ExactS0ClosedState support input (step state))
    (generations : Nat)
    (initial : List Link)
    (initialClosed : ExactS0ClosedState support input initial) :
    ExactS0ClosedState support input
      (ExactOnlyRun step generations initial) := by
  induction generations generalizing initial with
  | zero =>
      simpa [ExactOnlyRun] using initialClosed
  | succ generations ih =>
      simp only [ExactOnlyRun]
      exact ih (step initial) (stepClosed initial initialClosed)

/--
If a required structure-sensitive result is neither the opaque input itself nor
one of the fixed exact-support Links, no finite exact-only run satisfying the
GPR-06 closure law can emit it.
-/
theorem GPR_06_fresh_structural_target_unreachable
    {Link : Type}
    (support : List Link)
    (input target : Link)
    (targetNotInput : target ≠ input)
    (targetFresh : target ∉ support)
    (step : List Link → List Link)
    (stepClosed :
      ∀ state,
        ExactS0ClosedState support input state →
        ExactS0ClosedState support input (step state))
    (generations : Nat)
    (initial : List Link)
    (initialClosed : ExactS0ClosedState support input initial) :
    target ∉ ExactOnlyRun step generations initial := by
  intro emitted
  have closed :=
    GPR_06_finite_exact_closure
      support input step stepClosed generations initial initialClosed
  have reachable := closed target emitted
  rcases reachable with same | supported
  · exact targetNotInput same
  · exact targetFresh supported

/--
Structure-sensitive pressure form. For example, when derive is swap(A->B)=B->A,
a fresh result that differs from the opaque input and is not pre-authored in
finite support cannot be produced by exact-only S0 iteration under the stated
closure law.
-/
theorem GPR_06_structure_sensitive_function_requires_more_than_exact_S0
    {Link : Type}
    (support : List Link)
    (input : Link)
    (derive : Link → Link)
    (changesInput : derive input ≠ input)
    (freshResult : derive input ∉ support)
    (step : List Link → List Link)
    (stepClosed :
      ∀ state,
        ExactS0ClosedState support input state →
        ExactS0ClosedState support input (step state))
    (generations : Nat)
    (initial : List Link)
    (initialClosed : ExactS0ClosedState support input initial) :
    derive input ∉ ExactOnlyRun step generations initial :=
  GPR_06_fresh_structural_target_unreachable
    support input (derive input) changesInput freshResult
    step stepClosed generations initial initialClosed

end MTS.V015.External


namespace MTS.V015.External

/-
GPR-08 — finite-arity J0 representation and semantic role authority.

The theorem does not claim that every conceivable future relation can avoid J1.
It proves the narrower v0.15 boundary needed by the current source model:

* any finite ordered/multiplicity-preserving argument/dependency carrier can be
  encoded losslessly into ONE recursively structured Link endpoint;
* therefore finite arity alone does not imply a cross-current-member join;
* role authority is semantic Aset membership, not mere physical materialization.
-/

inductive ExactPackedLink (Atom : Type) where
  | root : ExactPackedLink Atom
  | atom : Atom → ExactPackedLink Atom
  | pair : ExactPackedLink Atom → ExactPackedLink Atom → ExactPackedLink Atom

def packExactSequence
    {Atom : Type} :
    List (ExactPackedLink Atom) → ExactPackedLink Atom
  | [] => .root
  | head :: tail => .pair head (packExactSequence tail)

/--
ExactSequence-style recursive packing preserves order, arity and repetition
inside one Link endpoint.
-/
theorem GPR_08_exact_sequence_packing_injective
    {Atom : Type}
    {xs ys : List (ExactPackedLink Atom)}
    (packedEqual : packExactSequence xs = packExactSequence ys) :
    xs = ys := by
  induction xs generalizing ys with
  | nil =>
      cases ys with
      | nil =>
          rfl
      | cons head tail =>
          cases packedEqual
  | cons head tail ih =>
      cases ys with
      | nil =>
          cases packedEqual
      | cons other rest =>
          have parts := ExactPackedLink.pair.inj packedEqual
          have headEqual : head = other := parts.1
          have tailEqual :
              packExactSequence tail = packExactSequence rest := parts.2
          subst other
          have restEqual : tail = rest := ih tailEqual
          subst rest
          rfl

/--
Every finite correlated value sequence therefore has a lossless J0
representation as one explicit current endpoint. This does not assert that
J1 can never be useful; it establishes that finite arity/order/multiplicity
alone is not a justification for J1.
-/
theorem GPR_08_finite_arity_has_one_endpoint
    {Atom : Type}
    (values : List (ExactPackedLink Atom)) :
    ∃ endpoint,
      endpoint = packExactSequence values ∧
      ∀ otherValues,
        packExactSequence otherValues = endpoint →
        otherValues = values := by
  refine ⟨packExactSequence values, rfl, ?_⟩
  intro otherValues sameEndpoint
  exact GPR_08_exact_sequence_packing_injective sameEndpoint

def SemanticRole
    {Link : Type}
    (member : Link → Prop)
    (role : Link) : Prop :=
  member role

/--
Physical existence of a Link shaped like a role does not grant semantic role
authority when that Link is absent from the selected semantic Aset membership.
-/
theorem GPR_08_physical_nonmember_has_no_role_authority
    {Link : Type}
    (physicalExists semanticMember : Link → Prop)
    (role : Link)
    (_materialized : physicalExists role)
    (notSemanticMember : ¬ semanticMember role) :
    ¬ SemanticRole semanticMember role :=
  notSemanticMember


/-
GPR-01 — one semantic Gamma step with analysis/synthesis/publication refinement.

The decomposition is modeled only as internal pure functions of one transition:
analysis reads the reaction-start state, synthesis consumes only the analysis
result, and publication produces one successor from the original state plus
the staged result. No intermediate analysis/staging object is itself a
semantic machine state.
-/

structure ReactionDecomposition (State Analysis Staged : Type) where
  analyze : State → Analysis
  synthesize : Analysis → Staged
  publish : State → Staged → State

def Gamma
    {State Analysis Staged : Type}
    (D : ReactionDecomposition State Analysis Staged)
    (before : State) : State :=
  D.publish before (D.synthesize (D.analyze before))

def GammaStep
    {State Analysis Staged : Type}
    (D : ReactionDecomposition State Analysis Staged)
    (before after : State) : Prop :=
  after = Gamma D before

def DecomposedCycle
    {State Analysis Staged : Type}
    (D : ReactionDecomposition State Analysis Staged)
    (before after : State) : Prop :=
  ∃ analysis staged,
    analysis = D.analyze before ∧
    staged = D.synthesize analysis ∧
    after = D.publish before staged

/--
The internal analysis->synthesis->publication decomposition denotes exactly
the same transition relation as one Gamma state transformer.
-/
theorem GPR_01_decomposition_iff_single_gamma_step
    {State Analysis Staged : Type}
    (D : ReactionDecomposition State Analysis Staged)
    (before after : State) :
    DecomposedCycle D before after ↔
    GammaStep D before after := by
  constructor
  · intro decomposed
    rcases decomposed with ⟨analysis, staged, analysisEq, stagedEq, afterEq⟩
    subst analysis
    subst staged
    exact afterEq
  · intro oneStep
    refine ⟨D.analyze before, D.synthesize (D.analyze before), rfl, rfl, ?_⟩
    exact oneStep

/--
For a fixed reaction-start state the semantic Gamma successor is unique.
The decomposition therefore does not expose several semantic successor states.
-/
theorem GPR_01_gamma_successor_unique
    {State Analysis Staged : Type}
    (D : ReactionDecomposition State Analysis Staged)
    (before after₁ after₂ : State)
    (step₁ : GammaStep D before after₁)
    (step₂ : GammaStep D before after₂) :
    after₁ = after₂ := by
  unfold GammaStep at step₁ step₂
  rw [step₁, step₂]

/--
Synthesis is parameterized only by the read-only analysis value; it has no
semantic access to a staged successor state by construction.
-/
theorem GPR_01_same_analysis_same_staging
    {State Analysis Staged : Type}
    (D : ReactionDecomposition State Analysis Staged)
    {a₁ a₂ : Analysis}
    (sameAnalysis : a₁ = a₂) :
    D.synthesize a₁ = D.synthesize a₂ := by
  subst a₂
  rfl

end MTS.V015.External


namespace MTS.V015.External

/-
GPR-02 — canonical Aset membership convergence.

Semantic Aset membership is extensional: deriving the same canonical Link more
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
Adding the same canonical Link twice changes no Aset-membership query.
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
Order of two semantic membership contributions is nonsemantic at the Aset
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
Aset idempotence MUST NOT collapse repeated positions inside ExactSequence.
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

end MTS.V015.External
