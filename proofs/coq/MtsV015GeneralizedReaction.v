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


(*
GPR-06 — finite multi-generation opacity of exact-only S0.

This is an explicit lower-bound model, not a claim that Rocq data structures
are MTS ontology. ExactS0ClosedState states the no-reflection/no-constructor
boundary: a state may contain the opaque current input identity and Links from
one fixed finite exact support, but no fresh structure-derived Link outside
that closure.
*)

Definition ExactS0Reachable
    {Link : Type}
    (support : list Link)
    (input value : Link) : Prop :=
  value = input \/ In value support.

Definition ExactS0ClosedState
    {Link : Type}
    (support : list Link)
    (input : Link)
    (state : list Link) : Prop :=
  forall value,
    In value state ->
    ExactS0Reachable support input value.

Fixpoint ExactOnlyRun
    {State : Type}
    (step : State -> State)
    (generations : nat)
    (state : State) : State :=
  match generations with
  | O => state
  | S rest => ExactOnlyRun step rest (step state)
  end.

Theorem GPR_06_finite_exact_closure
    {Link : Type}
    (support : list Link)
    (input : Link)
    (step : list Link -> list Link)
    (step_closed :
      forall state,
        ExactS0ClosedState support input state ->
        ExactS0ClosedState support input (step state))
    (generations : nat)
    (initial : list Link)
    (initial_closed : ExactS0ClosedState support input initial) :
    ExactS0ClosedState support input
      (ExactOnlyRun step generations initial).
Proof.
  revert initial initial_closed.
  induction generations as [|rest IH]; intros initial initial_closed.
  - exact initial_closed.
  - simpl.
    apply IH.
    apply step_closed.
    exact initial_closed.
Qed.

Theorem GPR_06_fresh_structural_target_unreachable
    {Link : Type}
    (support : list Link)
    (input target : Link)
    (target_not_input : target <> input)
    (target_fresh : ~ In target support)
    (step : list Link -> list Link)
    (step_closed :
      forall state,
        ExactS0ClosedState support input state ->
        ExactS0ClosedState support input (step state))
    (generations : nat)
    (initial : list Link)
    (initial_closed : ExactS0ClosedState support input initial) :
    ~ In target (ExactOnlyRun step generations initial).
Proof.
  intro emitted.
  pose proof
    (GPR_06_finite_exact_closure
      support input step step_closed generations initial initial_closed)
    as closed.
  unfold ExactS0ClosedState in closed.
  specialize (closed target emitted).
  destruct closed as [same | supported].
  - apply target_not_input.
    exact same.
  - apply target_fresh.
    exact supported.
Qed.

Theorem GPR_06_structure_sensitive_function_requires_more_than_exact_S0
    {Link : Type}
    (support : list Link)
    (input : Link)
    (derive : Link -> Link)
    (changes_input : derive input <> input)
    (fresh_result : ~ In (derive input) support)
    (step : list Link -> list Link)
    (step_closed :
      forall state,
        ExactS0ClosedState support input state ->
        ExactS0ClosedState support input (step state))
    (generations : nat)
    (initial : list Link)
    (initial_closed : ExactS0ClosedState support input initial) :
    ~ In (derive input) (ExactOnlyRun step generations initial).
Proof.
  apply
    (GPR_06_fresh_structural_target_unreachable
      support input (derive input) changes_input fresh_result
      step step_closed generations initial initial_closed).
Qed.

Print Assumptions GPR_06_finite_exact_closure.
Print Assumptions GPR_06_fresh_structural_target_unreachable.
Print Assumptions GPR_06_structure_sensitive_function_requires_more_than_exact_S0.


(*
GPR-08 — finite-arity J0 representation and semantic role authority.

This paired projection proves only the boundary needed by v0.15:
finite ordered/multiplicity-preserving structure can be packed losslessly into
one recursive Link endpoint, so finite arity alone does not justify J1.
Semantic role authority is selected Aset membership, not physical existence.
*)

Inductive ExactPackedLink (Atom : Type) : Type :=
| ERoot : ExactPackedLink Atom
| EAtom : Atom -> ExactPackedLink Atom
| EPair :
    ExactPackedLink Atom ->
    ExactPackedLink Atom ->
    ExactPackedLink Atom.

Arguments ERoot {Atom}.
Arguments EAtom {Atom} _.
Arguments EPair {Atom} _ _.

Fixpoint pack_exact_sequence
    {Atom : Type}
    (values : list (ExactPackedLink Atom)) : ExactPackedLink Atom :=
  match values with
  | [] => ERoot
  | head :: tail => EPair head (pack_exact_sequence tail)
  end.

Theorem GPR_08_exact_sequence_packing_injective
    {Atom : Type}
    (xs ys : list (ExactPackedLink Atom))
    (packed_equal :
      pack_exact_sequence xs = pack_exact_sequence ys) :
    xs = ys.
Proof.
  revert ys packed_equal.
  induction xs as [|head tail IH]; intros ys packed_equal.
  - destruct ys as [|other rest].
    + reflexivity.
    + simpl in packed_equal.
      discriminate.
  - destruct ys as [|other rest].
    + simpl in packed_equal.
      discriminate.
    + simpl in packed_equal.
      inversion packed_equal.
      subst other.
      f_equal.
      apply IH.
      assumption.
Qed.

Theorem GPR_08_finite_arity_has_one_endpoint
    {Atom : Type}
    (values : list (ExactPackedLink Atom)) :
    exists endpoint,
      endpoint = pack_exact_sequence values /\
      forall other_values,
        pack_exact_sequence other_values = endpoint ->
        other_values = values.
Proof.
  exists (pack_exact_sequence values).
  split.
  - reflexivity.
  - intros other_values same_endpoint.
    apply
      (GPR_08_exact_sequence_packing_injective
        other_values values same_endpoint).
Qed.

Definition SemanticRole
    {Link : Type}
    (member : Link -> Prop)
    (role : Link) : Prop :=
  member role.

Theorem GPR_08_physical_nonmember_has_no_role_authority
    {Link : Type}
    (physical_exists semantic_member : Link -> Prop)
    (role : Link)
    (_materialized : physical_exists role)
    (not_semantic_member : ~ semantic_member role) :
    ~ SemanticRole semantic_member role.
Proof.
  exact not_semantic_member.
Qed.

Print Assumptions GPR_08_exact_sequence_packing_injective.
Print Assumptions GPR_08_finite_arity_has_one_endpoint.
Print Assumptions GPR_08_physical_nonmember_has_no_role_authority.


(*
GPR-01 — one semantic Gamma step with analysis/synthesis/publication
refinement. Analysis and staging values are verifier-side machinery only and
are not semantic machine states.
*)

Record ReactionDecomposition
    (State Analysis Staged : Type) := {
  analyze : State -> Analysis;
  synthesize : Analysis -> Staged;
  publish : State -> Staged -> State
}.

Definition Gamma
    {State Analysis Staged : Type}
    (D : ReactionDecomposition State Analysis Staged)
    (before : State) : State :=
  publish _ _ _ D before
    (synthesize _ _ _ D (analyze _ _ _ D before)).

Definition GammaStep
    {State Analysis Staged : Type}
    (D : ReactionDecomposition State Analysis Staged)
    (before after : State) : Prop :=
  after = Gamma D before.

Definition DecomposedCycle
    {State Analysis Staged : Type}
    (D : ReactionDecomposition State Analysis Staged)
    (before after : State) : Prop :=
  exists analysis staged,
    analysis = analyze _ _ _ D before /\
    staged = synthesize _ _ _ D analysis /\
    after = publish _ _ _ D before staged.

Theorem GPR_01_decomposition_iff_single_gamma_step
    {State Analysis Staged : Type}
    (D : ReactionDecomposition State Analysis Staged)
    (before after : State) :
    DecomposedCycle D before after <->
    GammaStep D before after.
Proof.
  split.
  - intros [analysis [staged [analysis_eq [staged_eq after_eq]]]].
    subst analysis.
    subst staged.
    exact after_eq.
  - intro one_step.
    exists (analyze _ _ _ D before).
    exists (synthesize _ _ _ D (analyze _ _ _ D before)).
    repeat split; try reflexivity.
    exact one_step.
Qed.

Theorem GPR_01_gamma_successor_unique
    {State Analysis Staged : Type}
    (D : ReactionDecomposition State Analysis Staged)
    (before after1 after2 : State)
    (step1 : GammaStep D before after1)
    (step2 : GammaStep D before after2) :
    after1 = after2.
Proof.
  unfold GammaStep in step1, step2.
  rewrite step1.
  rewrite step2.
  reflexivity.
Qed.

Theorem GPR_01_same_analysis_same_staging
    {State Analysis Staged : Type}
    (D : ReactionDecomposition State Analysis Staged)
    (a1 a2 : Analysis)
    (same_analysis : a1 = a2) :
    synthesize _ _ _ D a1 = synthesize _ _ _ D a2.
Proof.
  subst a2.
  reflexivity.
Qed.

Print Assumptions GPR_01_decomposition_iff_single_gamma_step.
Print Assumptions GPR_01_gamma_successor_unique.
Print Assumptions GPR_01_same_analysis_same_staging.


(*
GPR-02 — canonical Aset membership convergence.

The laws are pointwise membership laws, not a separate runtime dedup command.
Distinct provenance events may remain distinct evidence occurrences.
ExactSequence multiplicity is explicitly not collapsed by Aset idempotence.
*)

Definition AddAsetMember
    {Link : Type}
    (member : Link -> Prop)
    (derived value : Link) : Prop :=
  value = derived \/ member value.

Theorem GPR_02_duplicate_membership_idempotent
    {Link : Type}
    (member : Link -> Prop)
    (derived value : Link) :
    AddAsetMember (AddAsetMember member derived) derived value <->
    AddAsetMember member derived value.
Proof.
  split.
  - intros [same | nested].
    + left. exact same.
    + destruct nested as [same | old].
      * left. exact same.
      * right. exact old.
  - intros [same | old].
    + left. exact same.
    + right. right. exact old.
Qed.

Theorem GPR_02_membership_contribution_commutes
    {Link : Type}
    (member : Link -> Prop)
    (first second value : Link) :
    AddAsetMember (AddAsetMember member first) second value <->
    AddAsetMember (AddAsetMember member second) first value.
Proof.
  split.
  - intros [second_eq | nested].
    + right. left. exact second_eq.
    + destruct nested as [first_eq | old].
      * left. exact first_eq.
      * right. right. exact old.
  - intros [first_eq | nested].
    + right. left. exact first_eq.
    + destruct nested as [second_eq | old].
      * left. exact second_eq.
      * right. right. exact old.
Qed.

Definition EventDerives
    {Link Provenance : Type}
    (events : list (Link * Provenance))
    (value : Link) : Prop :=
  exists provenance, In (value, provenance) events.

Theorem GPR_02_duplicate_provenance_events_are_preserved
    {Link Provenance : Type}
    (value : Link)
    (first_provenance second_provenance : Provenance) :
    let events :=
      [(value, first_provenance); (value, second_provenance)] in
    length events = 2 /\ EventDerives events value.
Proof.
  simpl.
  split.
  - reflexivity.
  - exists first_provenance.
    left.
    reflexivity.
Qed.

Theorem GPR_02_exact_sequence_multiplicity_not_collapsed
    {Atom : Type}
    (value : ExactPackedLink Atom) :
    pack_exact_sequence [value; value] <>
    pack_exact_sequence [value].
Proof.
  intro equal_packed.
  simpl in equal_packed.
  injection equal_packed as tail_equal.
  discriminate tail_equal.
Qed.

Print Assumptions GPR_02_duplicate_membership_idempotent.
Print Assumptions GPR_02_membership_contribution_commutes.
Print Assumptions GPR_02_duplicate_provenance_events_are_preserved.
Print Assumptions GPR_02_exact_sequence_multiplicity_not_collapsed.
