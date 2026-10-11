(*
Post-v0.15 independent external proof candidate for #2222 (F03).
Compile by concatenating the unchanged accepted MtsFoundation.v source before
this suffix. The sole extra premise is E : F2F3OneSidedExistence F.
No admitted statement, classical axiom or replacement of accepted proofs.
*)
Theorem F03_basis_five_pairwise_distinct
    (F : Foundation)
    (E : F2F3OneSidedExistence F) :
    R F <> f2f3_start_root F E /\
    R F <> f2f3_finish_root F E /\
    R F <> form F (f2f3_start_root F E) (f2f3_finish_root F E) /\
    R F <> form F (f2f3_finish_root F E) (f2f3_start_root F E) /\
    f2f3_start_root F E <> f2f3_finish_root F E /\
    f2f3_start_root F E <>
      form F (f2f3_start_root F E) (f2f3_finish_root F E) /\
    f2f3_start_root F E <>
      form F (f2f3_finish_root F E) (f2f3_start_root F E) /\
    f2f3_finish_root F E <>
      form F (f2f3_start_root F E) (f2f3_finish_root F E) /\
    f2f3_finish_root F E <>
      form F (f2f3_finish_root F E) (f2f3_start_root F E) /\
    form F (f2f3_start_root F E) (f2f3_finish_root F E) <>
      form F (f2f3_finish_root F E) (f2f3_start_root F E).
Proof.
  set (O := f2f3_start_root F E).
  set (C := f2f3_finish_root F E).
  set (L := form F O C).
  set (U := form F C O).
  pose proof (root_full_self F) as HR.
  pose proof (f2f3_start_root_pattern F E) as HO.
  pose proof (f2f3_finish_root_pattern F E) as HC.
  pose proof (f2f3_pair_pattern F E) as HL.
  pose proof (f2f3_reverse_pair_pattern F E) as HU.
  assert (Hro : R F <> O).
  { intro Heq. apply (f2f3_start_root_ne_root F E).
    symmetry. exact Heq. }
  assert (Hrc : R F <> C).
  { intro Heq. apply (f2f3_finish_root_ne_root F E).
    symmetry. exact Heq. }
  assert (Hrl : R F <> L).
  { intro Heq. apply (proj1 HL).
    rewrite <- Heq. exact (proj1 HR). }
  assert (Hru : R F <> U).
  { intro Heq. apply (proj1 HU).
    rewrite <- Heq. exact (proj1 HR). }
  assert (Hoc : O <> C).
  { intro Heq. apply (proj1 HC).
    rewrite <- Heq. exact (proj1 HO). }
  assert (Hol : O <> L).
  { intro Heq. apply (proj1 HL).
    rewrite <- Heq. exact (proj1 HO). }
  assert (Hou : O <> U).
  { intro Heq. apply (proj1 HU).
    rewrite <- Heq. exact (proj1 HO). }
  assert (Hcl : C <> L).
  { intro Heq. apply (proj2 HL).
    rewrite <- Heq. exact (proj2 HC). }
  assert (Hcu : C <> U).
  { intro Heq. apply (proj2 HU).
    rewrite <- Heq. exact (proj2 HC). }
  assert (Hlu : L <> U).
  { intro Heq.
    apply Hoc.
    change (form F O C = form F C O) in Heq.
    destruct (proj1 (fnd13_form_injective F O C C O) Heq)
      as [Hoc' _].
    exact Hoc'. }
  repeat split; assumption.
Qed.
