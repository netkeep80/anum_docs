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
