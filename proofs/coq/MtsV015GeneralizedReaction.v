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
Semantic role authority is selected ANet membership, not physical existence.
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
GPR-02 — canonical ANet membership convergence.

The laws are pointwise membership laws, not a separate runtime dedup command.
Distinct provenance events may remain distinct evidence occurrences.
ExactSequence multiplicity is explicitly not collapsed by ANet idempotence.
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

(*
GPR-03 — generation isolation / no read-your-own-writes.

PrePublicationCurrent is verifier-side refinement machinery. During one Gamma
generation the observable current remains the reaction-start State while
analysis and synthesis are performed. Publication creates the State that may
be analyzed by the next Gamma.
*)

Definition PrePublicationCurrent
    {State Staged : Type}
    (before : State)
    (_staged : Staged) : State :=
  before.

Theorem GPR_03_prepublication_current_is_reaction_start
    {State Staged : Type}
    (before : State)
    (staged : Staged) :
    PrePublicationCurrent before staged = before.
Proof.
  reflexivity.
Qed.

Theorem GPR_03_analysis_ignores_staged_candidate
    {State Analysis Staged : Type}
    (D : ReactionDecomposition State Analysis Staged)
    (before : State)
    (first_staged second_staged : Staged) :
    analyze _ _ _ D (PrePublicationCurrent before first_staged) =
    analyze _ _ _ D (PrePublicationCurrent before second_staged).
Proof.
  reflexivity.
Qed.

Inductive GPR03WitnessState : Type :=
| GPR03_A
| GPR03_B
| GPR03_C.

Definition gpr03_witness_synthesize
    (state : GPR03WitnessState) : GPR03WitnessState :=
  match state with
  | GPR03_A => GPR03_B
  | GPR03_B => GPR03_C
  | GPR03_C => GPR03_C
  end.

Definition GPR03WitnessDecomposition :
    ReactionDecomposition
      GPR03WitnessState
      GPR03WitnessState
      GPR03WitnessState :=
  {|
    analyze := fun state => state;
    synthesize := gpr03_witness_synthesize;
    publish := fun _before staged => staged
  |}.

Theorem GPR_03_one_generation_stops_at_B :
    Gamma GPR03WitnessDecomposition GPR03_A = GPR03_B.
Proof.
  reflexivity.
Qed.

Theorem GPR_03_read_your_own_writes_is_not_one_generation :
    Gamma GPR03WitnessDecomposition
      (Gamma GPR03WitnessDecomposition GPR03_A) <>
    Gamma GPR03WitnessDecomposition GPR03_A.
Proof.
  simpl.
  discriminate.
Qed.

Print Assumptions GPR_03_prepublication_current_is_reaction_start.
Print Assumptions GPR_03_analysis_ignores_staged_candidate.
Print Assumptions GPR_03_one_generation_stops_at_B.
Print Assumptions GPR_03_read_your_own_writes_is_not_one_generation.


(*
GPR-04 — partition/schedule refinement.

ReductionContribution is verifier-side machinery for the extensional result of
independently analyzed work. MergeContribution models the A11 law:
matched flags combine by OR and output membership combines by extensional OR.
No runtime UNION opcode is introduced.
*)

Record ReductionContribution (Output : Type) := {
  rc_matched : Prop;
  rc_emits : Output -> Prop
}.

Definition MergeContribution
    {Output : Type}
    (left right : ReductionContribution Output) :
    ReductionContribution Output :=
  {|
    rc_matched := rc_matched _ left \/ rc_matched _ right;
    rc_emits := fun output =>
      rc_emits _ left output \/ rc_emits _ right output
  |}.

Definition ContributionEquivalent
    {Output : Type}
    (left right : ReductionContribution Output) : Prop :=
  (rc_matched _ left <-> rc_matched _ right) /\
  forall output,
    rc_emits _ left output <-> rc_emits _ right output.

Theorem GPR_04_merge_associative_observation
    {Output : Type}
    (a b c : ReductionContribution Output) :
    ContributionEquivalent
      (MergeContribution (MergeContribution a b) c)
      (MergeContribution a (MergeContribution b c)).
Proof.
  unfold ContributionEquivalent, MergeContribution.
  simpl.
  split.
  - split.
    + intros [[ha | hb] | hc].
      * left. exact ha.
      * right. left. exact hb.
      * right. right. exact hc.
    + intros [ha | [hb | hc]].
      * left. left. exact ha.
      * left. right. exact hb.
      * right. exact hc.
  - intro output.
    split.
    + intros [[ha | hb] | hc].
      * left. exact ha.
      * right. left. exact hb.
      * right. right. exact hc.
    + intros [ha | [hb | hc]].
      * left. left. exact ha.
      * left. right. exact hb.
      * right. exact hc.
Qed.

Theorem GPR_04_merge_commutative_observation
    {Output : Type}
    (a b : ReductionContribution Output) :
    ContributionEquivalent
      (MergeContribution a b)
      (MergeContribution b a).
Proof.
  unfold ContributionEquivalent, MergeContribution.
  simpl.
  split.
  - split.
    + intros [ha | hb].
      * right. exact ha.
      * left. exact hb.
    + intros [hb | ha].
      * right. exact hb.
      * left. exact ha.
  - intro output.
    split.
    + intros [ha | hb].
      * right. exact ha.
      * left. exact hb.
    + intros [hb | ha].
      * right. exact hb.
      * left. exact ha.
Qed.

Theorem GPR_04_merge_idempotent_observation
    {Output : Type}
    (a : ReductionContribution Output) :
    ContributionEquivalent
      (MergeContribution a a)
      a.
Proof.
  unfold ContributionEquivalent, MergeContribution.
  simpl.
  split.
  - split.
    + intros [ha | ha]; exact ha.
    + intro ha. left. exact ha.
  - intro output.
    split.
    + intros [ha | ha]; exact ha.
    + intro ha. left. exact ha.
Qed.

Lemma gpr04_four_way_repartition
    (A B C D : Prop) :
    ((A \/ B) \/ (C \/ D)) <->
    ((A \/ C) \/ (B \/ D)).
Proof.
  split.
  - intros [[ha | hb] | [hc | hd]].
    + left. left. exact ha.
    + right. left. exact hb.
    + left. right. exact hc.
    + right. right. exact hd.
  - intros [[ha | hc] | [hb | hd]].
    + left. left. exact ha.
    + right. left. exact hc.
    + left. right. exact hb.
    + right. right. exact hd.
Qed.

Theorem GPR_04_two_dimensional_partition_refinement
    {Output : Type}
    (a11 a12 a21 a22 : ReductionContribution Output) :
    ContributionEquivalent
      (MergeContribution
        (MergeContribution a11 a12)
        (MergeContribution a21 a22))
      (MergeContribution
        (MergeContribution a11 a21)
        (MergeContribution a12 a22)).
Proof.
  unfold ContributionEquivalent, MergeContribution.
  simpl.
  split.
  - apply gpr04_four_way_repartition.
  - intro output.
    apply gpr04_four_way_repartition.
Qed.

Definition PreserveCurrentAllowed
    {Output : Type}
    (contribution : ReductionContribution Output) : Prop :=
  ~ rc_matched _ contribution.

Theorem GPR_04_local_no_match_cannot_publish_global_no_match
    {Output : Type}
    (left right : ReductionContribution Output)
    (_left_no_match : ~ rc_matched _ left)
    (right_match : rc_matched _ right) :
    ~ PreserveCurrentAllowed (MergeContribution left right).
Proof.
  unfold PreserveCurrentAllowed, MergeContribution.
  simpl.
  intro preserve.
  apply preserve.
  right.
  exact right_match.
Qed.

Print Assumptions GPR_04_merge_associative_observation.
Print Assumptions GPR_04_merge_commutative_observation.
Print Assumptions GPR_04_merge_idempotent_observation.
Print Assumptions GPR_04_two_dimensional_partition_refinement.
Print Assumptions GPR_04_local_no_match_cannot_publish_global_no_match.


(*
GPR-05 — finite completion boundary.

Link and Rule remain arbitrary Types: there is no finite ambient Link-carrier
axiom. One concrete reaction is represented by finite materialized/current/
admission lists, finite explicit images, and Nat-valued local-match cost.
These Nat/list values are verifier-side execution/refinement budgets only.
*)

Definition GPR05TotalImageSize
    {Link Rule : Type}
    (rules : list Rule)
    (image : Rule -> list Link) : nat :=
  fold_right
    (fun rule total => length (image rule) + total)
    0
    rules.

Definition GPR05LocalWork
    {Link Rule : Type}
    (currents : list Link)
    (rules : list Rule)
    (local_match_cost : Link -> Rule -> nat) : nat :=
  fold_right
    (fun current total =>
      fold_right
        (fun rule subtotal => local_match_cost current rule + subtotal)
        0
        rules + total)
    0
    currents.

Definition GPR05ComparisonBound
    {Link Rule : Type}
    (currents : list Link)
    (rules : list Rule) : nat :=
  length currents * length rules.

Definition GPR05RawStageBound
    {Link Rule : Type}
    (currents : list Link)
    (rules : list Rule)
    (image : Rule -> list Link) : nat :=
  length currents * GPR05TotalImageSize rules image.

Definition GPR05SuccessorStageBound
    {Link Rule : Type}
    (currents : list Link)
    (rules : list Rule)
    (image : Rule -> list Link) : nat :=
  length currents + GPR05RawStageBound currents rules image.

Theorem GPR_05_current_rule_comparison_product
    {Link Rule : Type}
    (currents : list Link)
    (rules : list Rule) :
    GPR05ComparisonBound currents rules =
      length currents * length rules.
Proof.
  reflexivity.
Qed.

Theorem GPR_05_raw_staging_budget
    {Link Rule : Type}
    (currents : list Link)
    (rules : list Rule)
    (image : Rule -> list Link) :
    GPR05RawStageBound currents rules image =
      length currents * GPR05TotalImageSize rules image.
Proof.
  reflexivity.
Qed.

Theorem GPR_05_finite_generation_budget
    {Link Rule : Type}
    (materialized : list Link)
    (currents : list Link)
    (rules : list Rule)
    (image : Rule -> list Link)
    (local_match_cost : Link -> Rule -> nat) :
    exists comparisonBound localWorkBound rawStageBound
      successorStageBound materializedCount : nat,
      comparisonBound = GPR05ComparisonBound currents rules /\
      localWorkBound = GPR05LocalWork currents rules local_match_cost /\
      rawStageBound = GPR05RawStageBound currents rules image /\
      successorStageBound = GPR05SuccessorStageBound currents rules image /\
      materializedCount = length materialized.
Proof.
  exists (GPR05ComparisonBound currents rules).
  exists (GPR05LocalWork currents rules local_match_cost).
  exists (GPR05RawStageBound currents rules image).
  exists (GPR05SuccessorStageBound currents rules image).
  exists (length materialized).
  repeat split; reflexivity.
Qed.

Theorem GPR_05_no_finite_ambient_carrier_required
    {Link : Type}
    (materialized : list Link) :
    exists materializedCount : nat,
      materializedCount = length materialized.
Proof.
  exists (length materialized).
  reflexivity.
Qed.

Print Assumptions GPR_05_current_rule_comparison_product.
Print Assumptions GPR_05_raw_staging_budget.
Print Assumptions GPR_05_finite_generation_budget.
Print Assumptions GPR_05_no_finite_ambient_carrier_required.


(*
GPR-09 — direct-gauge C-boundary compatibility and chirality covariance.

Accepted v0.14 CTX-03 supplies the Link-native mirror transport for the
one-sided START/END classes. This v0.15 projection assumes the internal phases
of the SAME Gamma operation are structurally mirror-covariant, then proves the
whole composed Gamma is mirror-covariant. No reverse-mode command is added.
*)

Record GPR09ChiralGammaKernel
    (State Plan Stage Boundary : Type) := {
  gpr09_analyze : Boundary -> State -> Plan;
  gpr09_synthesize : Boundary -> Plan -> Stage;
  gpr09_publish : Boundary -> State -> Stage -> State;
  gpr09_mirror_state : State -> State;
  gpr09_mirror_plan : Plan -> Plan;
  gpr09_mirror_stage : Stage -> Stage;
  gpr09_mirror_boundary : Boundary -> Boundary;

  gpr09_mirror_state_involutive :
    forall state,
      gpr09_mirror_state (gpr09_mirror_state state) = state;

  gpr09_mirror_boundary_involutive :
    forall boundary,
      gpr09_mirror_boundary (gpr09_mirror_boundary boundary) = boundary;

  gpr09_analysis_covariant :
    forall boundary state,
      gpr09_mirror_plan (gpr09_analyze boundary state) =
        gpr09_analyze
          (gpr09_mirror_boundary boundary)
          (gpr09_mirror_state state);

  gpr09_synthesis_covariant :
    forall boundary plan,
      gpr09_mirror_stage (gpr09_synthesize boundary plan) =
        gpr09_synthesize
          (gpr09_mirror_boundary boundary)
          (gpr09_mirror_plan plan);

  gpr09_publication_covariant :
    forall boundary state stage,
      gpr09_mirror_state (gpr09_publish boundary state stage) =
        gpr09_publish
          (gpr09_mirror_boundary boundary)
          (gpr09_mirror_state state)
          (gpr09_mirror_stage stage)
}.

Definition GPR09Gamma
    {State Plan Stage Boundary : Type}
    (K : GPR09ChiralGammaKernel State Plan Stage Boundary)
    (boundary : Boundary)
    (state : State) : State :=
  gpr09_publish _ _ _ _ K boundary state
    (gpr09_synthesize _ _ _ _ K boundary
      (gpr09_analyze _ _ _ _ K boundary state)).

Theorem GPR_09_gamma_chirality_covariant
    {State Plan Stage Boundary : Type}
    (K : GPR09ChiralGammaKernel State Plan Stage Boundary)
    (boundary : Boundary)
    (state : State) :
    gpr09_mirror_state _ _ _ _ K (GPR09Gamma K boundary state) =
      GPR09Gamma K
        (gpr09_mirror_boundary _ _ _ _ K boundary)
        (gpr09_mirror_state _ _ _ _ K state).
Proof.
  unfold GPR09Gamma.
  rewrite
    (gpr09_publication_covariant _ _ _ _ K boundary state
      (gpr09_synthesize _ _ _ _ K boundary
        (gpr09_analyze _ _ _ _ K boundary state))).
  rewrite
    (gpr09_synthesis_covariant _ _ _ _ K boundary
      (gpr09_analyze _ _ _ _ K boundary state)).
  rewrite
    (gpr09_analysis_covariant _ _ _ _ K boundary state).
  reflexivity.
Qed.

Theorem GPR_09_direct_end_boundary_mirrors_to_start
    {State Plan Stage Boundary : Type}
    (K : GPR09ChiralGammaKernel State Plan Stage Boundary)
    (directBoundary rootEnd rootStart : Boundary)
    (direct_is_end : directBoundary = rootEnd)
    (end_mirrors_start :
      gpr09_mirror_boundary _ _ _ _ K rootEnd = rootStart) :
    gpr09_mirror_boundary _ _ _ _ K directBoundary = rootStart.
Proof.
  rewrite direct_is_end.
  exact end_mirrors_start.
Qed.

Theorem GPR_09_direct_gauge_mirror_equivalence
    {State Plan Stage Boundary : Type}
    (K : GPR09ChiralGammaKernel State Plan Stage Boundary)
    (directBoundary rootEnd rootStart : Boundary)
    (direct_is_end : directBoundary = rootEnd)
    (end_mirrors_start :
      gpr09_mirror_boundary _ _ _ _ K rootEnd = rootStart)
    (state : State) :
    gpr09_mirror_state _ _ _ _ K (GPR09Gamma K directBoundary state) =
      GPR09Gamma K rootStart
        (gpr09_mirror_state _ _ _ _ K state).
Proof.
  rewrite
    (GPR_09_gamma_chirality_covariant K directBoundary state).
  rewrite
    (GPR_09_direct_end_boundary_mirrors_to_start
      K directBoundary rootEnd rootStart
      direct_is_end end_mirrors_start).
  reflexivity.
Qed.

Theorem GPR_09_boundary_mirror_roundtrip
    {State Plan Stage Boundary : Type}
    (K : GPR09ChiralGammaKernel State Plan Stage Boundary)
    (boundary : Boundary) :
    gpr09_mirror_boundary _ _ _ _ K
      (gpr09_mirror_boundary _ _ _ _ K boundary) =
    boundary.
Proof.
  exact (gpr09_mirror_boundary_involutive _ _ _ _ K boundary).
Qed.

Print Assumptions GPR_09_gamma_chirality_covariant.
Print Assumptions GPR_09_direct_end_boundary_mirrors_to_start.
Print Assumptions GPR_09_direct_gauge_mirror_equivalence.
Print Assumptions GPR_09_boundary_mirror_roundtrip.
