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

end MTS.V015.External
