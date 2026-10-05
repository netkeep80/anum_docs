(*
MTS v0.15 EXTERNAL PROOF PROJECTION — GPR-07

Rocq's Type/list/Prop vocabulary is verifier machinery only, not MTS ontology.
The proof states explicit laws for the same generic matcher/instantiator and
shows that its empty-role boundary is exactly grounded identity matching.
*)

From Coq Require Import List.
Import ListNotations.

Record GenericRuleKernel (Link Binding : Type) := {
  matches :
    list Link -> Link -> Link -> list Binding -> Prop;

  instantiate :
    list Binding -> Link -> Link;

  empty_roles_match :
    forall (template actual : Link) (bindings : list Binding),
      matches [] template actual bindings <->
        template = actual /\ bindings = [];

  empty_substitution_identity :
    forall value : Link,
      instantiate [] value = value
}.

Record RoleBundleRule (Link : Type) := {
  roles : list Link;
  antecedent : Link;
  outputs : list Link
}.

Definition GenericStep
    {Link Binding : Type}
    (K : GenericRuleKernel Link Binding)
    (rule : RoleBundleRule Link)
    (current : Link)
    (result : list Link) : Prop :=
  exists bindings,
    matches _ _ K (roles _ rule) (antecedent _ rule) current bindings /\
    result = map (instantiate _ _ K bindings) (outputs _ rule).

Definition GroundedExactStep
    {Link : Type}
    (rule : RoleBundleRule Link)
    (current : Link)
    (result : list Link) : Prop :=
  roles _ rule = [] /\
  antecedent _ rule = current /\
  result = outputs _ rule.

Lemma empty_substitution_map_identity
    {Link Binding : Type}
    (K : GenericRuleKernel Link Binding)
    (values : list Link) :
    map (instantiate _ _ K []) values = values.
Proof.
  induction values as [|head tail IH].
  - reflexivity.
  - simpl.
    rewrite (empty_substitution_identity _ _ K head).
    rewrite IH.
    reflexivity.
Qed.

(*
GPR-07 — grounded exact MP is the zero-role refinement of the SAME generic
role-bundle Rule step. No RuleKind or second matcher is introduced.
*)
Theorem GPR_07_grounded_zero_role_refinement
    {Link Binding : Type}
    (K : GenericRuleKernel Link Binding)
    (rule : RoleBundleRule Link)
    (current : Link)
    (result : list Link)
    (zero_roles : roles _ rule = []) :
    GenericStep K rule current result <->
    GroundedExactStep rule current result.
Proof.
  split.
  - intros [bindings [matched produced]].
    unfold GroundedExactStep.
    rewrite zero_roles in matched.
    apply (proj1 (empty_roles_match _ _ K _ _ _)) in matched.
    destruct matched as [antecedent_eq bindings_eq].
    subst bindings.
    repeat split; try assumption.
    rewrite produced.
    apply empty_substitution_map_identity.
  - intros [_ [antecedent_eq produced]].
    unfold GenericStep.
    exists [].
    split.
    + rewrite zero_roles.
      apply (proj2 (empty_roles_match _ _ K _ _ _)).
      split; [exact antecedent_eq | reflexivity].
    + rewrite produced.
      symmetry.
      apply empty_substitution_map_identity.
Qed.

Theorem GPR_07_zero_role_has_empty_substitution
    {Link Binding : Type}
    (K : GenericRuleKernel Link Binding)
    (template actual : Link)
    (bindings : list Binding)
    (matched : matches _ _ K [] template actual bindings) :
    template = actual /\ bindings = [].
Proof.
  apply (proj1 (empty_roles_match _ _ K template actual bindings)).
  exact matched.
Qed.

Print Assumptions GPR_07_grounded_zero_role_refinement.
Print Assumptions GPR_07_zero_role_has_empty_substitution.
