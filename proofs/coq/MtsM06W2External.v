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


(*
C-03: constructive injection Nat -> Link from merely two distinct carrier
elements, independent of A1, F2F3 and Grounded assumptions.
*)
Fixpoint M06_W2_two_point_orbit
    (F : Foundation) (a b : Link F) (n : nat) : Link F :=
  match n with
  | O => form F (R F) b
  | S k => form F (M06_W2_two_point_orbit F a b k) a
  end.

Lemma M06_W2_two_point_orbit_succ_ne_zero :
  forall (F : Foundation) (a b : Link F) (n : nat),
    a <> b ->
    M06_W2_two_point_orbit F a b (S n)
      <> M06_W2_two_point_orbit F a b O.
Proof.
  intros F a b n Hab Heq.
  simpl in Heq.
  pose proof (f_equal (finish F) Heq) as Hfinish.
  rewrite (form_finish F (M06_W2_two_point_orbit F a b n) a) in Hfinish.
  rewrite (form_finish F (R F) b) in Hfinish.
  exact (Hab Hfinish).
Qed.

Theorem M06_W2_two_point_orbit_injective :
  forall (F : Foundation) (a b : Link F),
    a <> b ->
    forall (m n : nat),
      M06_W2_two_point_orbit F a b m =
        M06_W2_two_point_orbit F a b n -> m = n.
Proof.
  intros F a b Hab m.
  induction m as [|m IH].
  - intros [|n] H.
    + reflexivity.
    + exfalso.
      apply (M06_W2_two_point_orbit_succ_ne_zero F a b n Hab).
      symmetry. exact H.
  - intros [|n] H.
    + exfalso.
      apply (M06_W2_two_point_orbit_succ_ne_zero F a b m Hab).
      exact H.
    + f_equal.
      apply IH.
      simpl in H.
      pose proof (f_equal (start F) H) as Hstart.
      rewrite (form_start F (M06_W2_two_point_orbit F a b m) a) in Hstart.
      rewrite (form_start F (M06_W2_two_point_orbit F a b n) a) in Hstart.
      exact Hstart.
Qed.

Theorem M06_W2_two_distinct_implies_nat_injection :
  forall (F : Foundation) (a b : Link F),
    a <> b -> HasNatInjection F.
Proof.
  intros F a b Hab.
  exists (M06_W2_two_point_orbit F a b).
  intros m n H.
  exact (M06_W2_two_point_orbit_injective F a b Hab m n H).
Qed.
