(*
M06-W2 independent external kernel candidate for C-01 / B-1.3 / C-02.
Append after the exact accepted MtsFoundation.v + MtsExplicitModel.v.
No Admitted, Axiom, or replacement of accepted theory.
*)
Import Model1796.

Theorem M06_W2_bad_start_not_form_image :
  forall (a b : ModelLink), model_bad_start <> model_form a b.
Proof.
  intros a b Heq.
  pose proof (decode_model_form a b) as Hdecode.
  rewrite <- Heq in Hdecode.
  simpl in Hdecode.
  discriminate Hdecode.
Qed.

Theorem M06_W2_reverse_law_fails :
  model_form (model_start model_bad_start) (model_finish model_bad_start)
    <> model_bad_start.
Proof.
  intro Heq.
  apply (M06_W2_bad_start_not_form_image
    (model_start model_bad_start) (model_finish model_bad_start)).
  symmetry. exact Heq.
Qed.

Theorem M06_W2_poles_nonextensional :
  model_bad_start <> model_bad_finish /\
  model_start model_bad_start = model_start model_bad_finish /\
  model_finish model_bad_start = model_finish model_bad_finish.
Proof.
  repeat split.
  - apply model_bad_start_ne_bad_finish.
  - reflexivity.
  - reflexivity.
Qed.

Theorem M06_W2_joint_model_witness :
  A1RecursiveSeparation ExplicitFoundation /\
  exists E : F2F3OneSidedExistence ExplicitFoundation,
    exists N : F2F3GroundedNormalization ExplicitFoundation,
      exists D : RecursiveInversionDomain ExplicitFoundation E, True.
Proof.
  split.
  - exact explicit_a1.
  - exists ExplicitOneSided.
    exists ExplicitGroundedNormalization.
    exists ExplicitInversionDomain.
    exact I.
Qed.
