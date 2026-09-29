(*
EXPLICIT MODEL SLICE FOR #1796

CI appends this file to the exact current MtsFoundation.v source before Rocq
kernel checking. Lists, booleans and arithmetic tactics below are external
model/proof machinery only; they are not MTS ontology or semantic authority.
*)

Require Import Coq.Lists.List.
Require Import Coq.Bool.Bool.
Require Import Lia.
Import ListNotations.

Module Model1796.

Definition ModelLink := list bool.

Definition model_root : ModelLink := [].

Definition model_start_form (a : ModelLink) : ModelLink :=
  false :: true :: a.

Definition model_end_form (a : ModelLink) : ModelLink :=
  true :: false :: a.

Definition model_bad_start : ModelLink := [false].
Definition model_bad_finish : ModelLink := [true].

Fixpoint encode_left (source : ModelLink) : ModelLink :=
  match source with
  | [] => [true]
  | false :: tail => false :: false :: encode_left tail
  | true :: tail => false :: true :: encode_left tail
  end.

Fixpoint decode_left (source : ModelLink)
    : option (ModelLink * ModelLink) :=
  match source with
  | [] => None
  | true :: rest => Some ([], rest)
  | false :: [] => None
  | false :: false :: rest =>
      match decode_left rest with
      | None => None
      | Some (lhs, rhs) => Some (false :: lhs, rhs)
      end
  | false :: true :: rest =>
      match decode_left rest with
      | None => None
      | Some (lhs, rhs) => Some (true :: lhs, rhs)
      end
  end.

Lemma decode_left_encode_left_append :
  forall lhs rhs : ModelLink,
    decode_left (encode_left lhs ++ rhs) = Some (lhs, rhs).
Proof.
  induction lhs as [|bit tail IH]; intros rhs.
  - reflexivity.
  - destruct bit; simpl; rewrite IH; reflexivity.
Qed.

Definition pair_code (lhs rhs : ModelLink) : ModelLink :=
  true :: true :: (encode_left lhs ++ rhs).

Definition model_decode (source : ModelLink)
    : option (ModelLink * ModelLink) :=
  match source with
  | [] => Some (model_root, model_root)
  | false :: true :: rest =>
      Some (model_start_form rest, rest)
  | true :: false :: rest =>
      Some (rest, model_end_form rest)
  | true :: true :: rest =>
      decode_left rest
  | _ =>
      None
  end.

Lemma decode_model_root :
  model_decode model_root = Some (model_root, model_root).
Proof. reflexivity. Qed.

Lemma decode_model_start_form :
  forall a : ModelLink,
    model_decode (model_start_form a) =
    Some (model_start_form a, a).
Proof. reflexivity. Qed.

Lemma decode_model_end_form :
  forall a : ModelLink,
    model_decode (model_end_form a) =
    Some (a, model_end_form a).
Proof. reflexivity. Qed.

Lemma decode_pair_code :
  forall a b : ModelLink,
    model_decode (pair_code a b) = Some (a, b).
Proof.
  intros a b.
  unfold pair_code, model_decode.
  apply decode_left_encode_left_append.
Qed.

Definition link_eq_dec :
  forall lhs rhs : ModelLink, {lhs = rhs} + {lhs <> rhs} :=
  list_eq_dec Bool.bool_dec.

Definition nonroot_form (a b : ModelLink) : ModelLink :=
  if link_eq_dec a (model_start_form b) then
    a
  else if link_eq_dec b (model_end_form a) then
    b
  else
    pair_code a b.

Definition model_form (a b : ModelLink) : ModelLink :=
  if link_eq_dec a model_root then
    if link_eq_dec b model_root then model_root else nonroot_form a b
  else
    nonroot_form a b.

Lemma decode_nonroot_form :
  forall a b : ModelLink,
    model_decode (nonroot_form a b) = Some (a, b).
Proof.
  intros a b.
  unfold nonroot_form.
  destruct (link_eq_dec a (model_start_form b)) as [Hstart | Hstart].
  - subst a. apply decode_model_start_form.
  - destruct (link_eq_dec b (model_end_form a)) as [Hend | Hend].
    + subst b. apply decode_model_end_form.
    + apply decode_pair_code.
Qed.

Lemma decode_model_form :
  forall a b : ModelLink,
    model_decode (model_form a b) = Some (a, b).
Proof.
  intros a b.
  unfold model_form.
  destruct (link_eq_dec a model_root) as [Ha | Ha].
  - subst a.
    destruct (link_eq_dec b model_root) as [Hb | Hb].
    + subst b. reflexivity.
    + apply decode_nonroot_form.
  - apply decode_nonroot_form.
Qed.

Definition model_start (x : ModelLink) : ModelLink :=
  match model_decode x with
  | Some poles =>
      if link_eq_dec x (model_form (fst poles) (snd poles))
      then fst poles
      else model_bad_start
  | None => model_bad_start
  end.

Definition model_finish (x : ModelLink) : ModelLink :=
  match model_decode x with
  | Some poles =>
      if link_eq_dec x (model_form (fst poles) (snd poles))
      then snd poles
      else model_bad_finish
  | None => model_bad_finish
  end.

Lemma model_start_form_projection :
  forall a b : ModelLink,
    model_start (model_form a b) = a.
Proof.
  intros a b.
  unfold model_start.
  rewrite decode_model_form.
  cbn.
  destruct (link_eq_dec (model_form a b) (model_form a b)) as [Heq | Hneq].
  - reflexivity.
  - exfalso. apply Hneq. reflexivity.
Qed.

Lemma model_finish_form_projection :
  forall a b : ModelLink,
    model_finish (model_form a b) = b.
Proof.
  intros a b.
  unfold model_finish.
  rewrite decode_model_form.
  cbn.
  destruct (link_eq_dec (model_form a b) (model_form a b)) as [Heq | Hneq].
  - reflexivity.
  - exfalso. apply Hneq. reflexivity.
Qed.

Lemma model_start_form_ne_root :
  forall a : ModelLink, model_start_form a <> model_root.
Proof. intros a H; discriminate H. Qed.

Lemma model_end_form_ne_root :
  forall a : ModelLink, model_end_form a <> model_root.
Proof. intros a H; discriminate H. Qed.

Lemma no_start_end_overlap :
  forall a : ModelLink,
    a <> model_start_form (model_end_form a).
Proof.
  intros a H.
  pose proof (f_equal (@length bool) H) as Hlen.
  simpl in Hlen.
  lia.
Qed.

Lemma nonroot_form_start_fixed :
  forall a : ModelLink,
    nonroot_form (model_start_form a) a = model_start_form a.
Proof.
  intro a.
  unfold nonroot_form.
  destruct (link_eq_dec (model_start_form a) (model_start_form a));
    [reflexivity | contradiction].
Qed.

Lemma nonroot_form_end_fixed :
  forall a : ModelLink,
    nonroot_form a (model_end_form a) = model_end_form a.
Proof.
  intro a.
  unfold nonroot_form.
  destruct (link_eq_dec a (model_start_form (model_end_form a)))
    as [Hoverlap | Hoverlap].
  - exfalso. exact (no_start_end_overlap a Hoverlap).
  - destruct (link_eq_dec (model_end_form a) (model_end_form a));
      [reflexivity | contradiction].
Qed.

Lemma model_form_root_root :
  model_form model_root model_root = model_root.
Proof.
  unfold model_form.
  destruct (link_eq_dec model_root model_root); [reflexivity | contradiction].
Qed.

Lemma model_form_start_fixed :
  forall a : ModelLink,
    model_form (model_start_form a) a = model_start_form a.
Proof.
  intro a.
  unfold model_form.
  destruct (link_eq_dec (model_start_form a) model_root) as [Hbad | Hnonroot].
  - exfalso. exact (model_start_form_ne_root a Hbad).
  - apply nonroot_form_start_fixed.
Qed.

Lemma model_form_end_fixed :
  forall a : ModelLink,
    model_form a (model_end_form a) = model_end_form a.
Proof.
  intro a.
  unfold model_form.
  destruct (link_eq_dec a model_root) as [Ha | Ha].
  - destruct (link_eq_dec (model_end_form a) model_root) as [Hbad | Hnonroot].
    + exfalso. exact (model_end_form_ne_root a Hbad).
    + apply nonroot_form_end_fixed.
  - apply nonroot_form_end_fixed.
Qed.

Definition ExplicitFoundation : Foundation.
Proof.
  refine {|
    Link := ModelLink;
    form := model_form;
    start := model_start;
    finish := model_finish;
    R := model_root
  |}.
  - apply model_start_form_projection.
  - apply model_finish_form_projection.
  - apply model_form_root_root.
Defined.

Definition ExplicitOneSided : F2F3OneSidedExistence ExplicitFoundation.
Proof.
  refine (@Build_F2F3OneSidedExistence
    ExplicitFoundation
    (model_start_form model_root)
    (model_end_form model_root)
    _ _ _ _).
  - symmetry. apply model_form_start_fixed.
  - symmetry. apply model_form_end_fixed.
  - apply model_start_form_ne_root.
  - apply model_end_form_ne_root.
Defined.

Lemma explicit_local_decision :
  forall x : Link ExplicitFoundation,
    LocalSelfDecision ExplicitFoundation x.
Proof.
  intro x.
  unfold LocalSelfDecision, StartSelf, FinishSelf.
  split.
  - destruct (link_eq_dec (start ExplicitFoundation x) x) as [H | H].
    + left. exact H.
    + right. exact H.
  - destruct (link_eq_dec (finish ExplicitFoundation x) x) as [H | H].
    + left. exact H.
    + right. exact H.
Qed.

Definition ExplicitInversionDomain :
    RecursiveInversionDomain ExplicitFoundation ExplicitOneSided.
Proof.
  refine (@Build_RecursiveInversionDomain
    ExplicitFoundation
    ExplicitOneSided
    model_start_form
    model_end_form
    _ _ _ _ _).
  - intro a. symmetry. apply model_form_start_fixed.
  - intro a. symmetry. apply model_form_end_fixed.
  - reflexivity.
  - reflexivity.
  - intros x _GX. apply explicit_local_decision.
Defined.

(*
External model-only predicate: a Link is canonical exactly when it is in the
image of the one primitive form. This is host evidence about this concrete
model, not a new MTS ontology predicate.
*)
Definition CanonicalImage (x : ModelLink) : Prop :=
  exists a b : ModelLink, x = model_form a b.

Lemma model_start_bad_start :
  model_start model_bad_start = model_bad_start.
Proof. reflexivity. Qed.

Lemma model_finish_bad_start :
  model_finish model_bad_start = model_bad_finish.
Proof. reflexivity. Qed.

Lemma model_start_bad_finish :
  model_start model_bad_finish = model_bad_start.
Proof. reflexivity. Qed.

Lemma model_finish_bad_finish :
  model_finish model_bad_finish = model_bad_finish.
Proof. reflexivity. Qed.

Lemma model_bad_start_ne_bad_finish :
  model_bad_start <> model_bad_finish.
Proof. discriminate. Qed.

(*
The fallback Links form a non-well-founded two-node obligation cycle.
Finite inductive Grounded evidence therefore cannot contain either endpoint.
*)
Theorem fallback_cycle_not_grounded :
  forall x : ModelLink,
    Grounded ExplicitFoundation x ->
    (x = model_bad_start \/ x = model_bad_finish) ->
    False.
Proof.
  intros x G.
  induction G as [x StartStep IHStart FinishStep IHFinish].
  intros Hbad.
  destruct Hbad as [Hbad | Hbad].
  - subst x.
    assert (
      Hneq :
      finish ExplicitFoundation model_bad_start <> model_bad_start
    ).
    {
      change (model_finish model_bad_start <> model_bad_start).
      intro Hreverse.
      apply model_bad_start_ne_bad_finish.
      exact (eq_trans (eq_sym Hreverse) model_finish_bad_start).
    }
    apply (IHFinish Hneq).
    right.
    change (model_finish model_bad_start = model_bad_finish).
    apply model_finish_bad_start.
  - subst x.
    assert (
      Hneq :
      start ExplicitFoundation model_bad_finish <> model_bad_finish
    ).
    {
      change (model_start model_bad_finish <> model_bad_finish).
      rewrite model_start_bad_finish.
      exact model_bad_start_ne_bad_finish.
    }
    apply (IHStart Hneq).
    left.
    change (model_start model_bad_finish = model_bad_start).
    apply model_start_bad_finish.
Qed.

Theorem model_bad_start_not_grounded :
  ~ Grounded ExplicitFoundation model_bad_start.
Proof.
  intros G.
  apply (fallback_cycle_not_grounded model_bad_start G).
  left. reflexivity.
Qed.

Theorem model_bad_finish_not_grounded :
  ~ Grounded ExplicitFoundation model_bad_finish.
Proof.
  intros G.
  apply (fallback_cycle_not_grounded model_bad_finish G).
  right. reflexivity.
Qed.

Lemma canonical_or_start_fallback :
  forall x : ModelLink,
    CanonicalImage x \/ model_start x = model_bad_start.
Proof.
  intro x.
  unfold model_start.
  destruct (model_decode x) as [[a b] |] eqn:Hdecode.
  - cbn.
    destruct (link_eq_dec x (model_form a b)) as [Hcanonical | Hnoncanonical].
    + left. exists a, b. exact Hcanonical.
    + right. reflexivity.
  - right. reflexivity.
Qed.

(*
Finite Grounded evidence can exist only for an exact image of form.
The proof is constructive: decode plus exact re-encoding decides the relevant
model branch, without excluded middle over CanonicalImage.
*)
Theorem grounded_is_canonical :
  forall x : ModelLink,
    Grounded ExplicitFoundation x ->
    CanonicalImage x.
Proof.
  intros x G.
  destruct (canonical_or_start_fallback x) as [Hcanonical | Hstart].
  - exact Hcanonical.
  - destruct (link_eq_dec x model_bad_start) as [Hx | Hx].
    + subst x.
      exfalso.
      apply model_bad_start_not_grounded.
      exact G.
    + assert (
        Hstart_ne :
        start ExplicitFoundation x <> x
      ).
      {
        change (model_start x <> x).
        intros Heq.
        apply Hx.
        exact (eq_trans (eq_sym Heq) Hstart).
      }
      pose proof
        (grounded_start_of_nonself ExplicitFoundation x G Hstart_ne)
        as Gbad.
      change (Grounded ExplicitFoundation (model_start x)) in Gbad.
      rewrite Hstart in Gbad.
      exfalso.
      apply model_bad_start_not_grounded.
      exact Gbad.
Qed.

(*
Concrete Grounded normalization for the explicit infinite model.
The normal form is the canonical host Link itself; recursive decomposition is
valid because every Grounded Link is an exact form image.
*)
Definition ExplicitGroundedNormalization :
    F2F3GroundedNormalization ExplicitFoundation.
Proof.
  refine (@Build_F2F3GroundedNormalization
    ExplicitFoundation
    ModelLink
    model_form
    (fun x => x)
    _ _).
  - intros x G.
    destruct (grounded_is_canonical x G) as [a [b Hx]].
    subst x.
    simpl.
    rewrite model_start_form_projection.
    rewrite model_finish_form_projection.
    reflexivity.
  - intros x y _GX _GY Hxy.
    exact Hxy.
Defined.

Theorem explicit_fnd13_replay :
  forall x y : ModelLink,
    Grounded ExplicitFoundation x ->
    Grounded ExplicitFoundation y ->
    (x = y <->
      start ExplicitFoundation x = start ExplicitFoundation y /\
      finish ExplicitFoundation x = finish ExplicitFoundation y).
Proof.
  intros x y GX GY.
  apply (FND_13_identity_by_poles
    ExplicitFoundation ExplicitGroundedNormalization x y GX GY).
Qed.

(*
Concrete A1 discharge on the explicit infinite model.
Host list-length arguments below prove only uniqueness properties of this
external model encoding; they do not add MTS ontology or semantic authority.
*)
Lemma model_start_form_ne_self :
  forall a : ModelLink, model_start_form a <> a.
Proof.
  intros a H.
  pose proof (f_equal (@length bool) H) as Hlen.
  unfold model_start_form in Hlen.
  simpl in Hlen.
  lia.
Qed.

Lemma model_end_form_ne_self :
  forall a : ModelLink, model_end_form a <> a.
Proof.
  intros a H.
  pose proof (f_equal (@length bool) H) as Hlen.
  unfold model_end_form in Hlen.
  simpl in Hlen.
  lia.
Qed.

Lemma encode_left_length_gt :
  forall a : ModelLink, length a < length (encode_left a).
Proof.
  induction a as [|bit tail IH].
  - simpl. lia.
  - destruct bit; simpl; lia.
Qed.

Lemma pair_code_ne_left :
  forall lhs rhs : ModelLink, pair_code lhs rhs <> lhs.
Proof.
  intros lhs rhs H.
  pose proof (f_equal (@length bool) H) as Hlen.
  unfold pair_code in Hlen.
  simpl in Hlen.
  rewrite app_length in Hlen.
  pose proof (encode_left_length_gt lhs) as Hgrow.
  lia.
Qed.

Lemma pair_code_ne_right :
  forall lhs rhs : ModelLink, pair_code lhs rhs <> rhs.
Proof.
  intros lhs rhs H.
  pose proof (f_equal (@length bool) H) as Hlen.
  unfold pair_code in Hlen.
  simpl in Hlen.
  rewrite app_length in Hlen.
  lia.
Qed.

Lemma left_fixed_root_or_start :
  forall a b : ModelLink,
    a = model_form a b ->
    (a = model_root /\ b = model_root) \/
    a = model_start_form b.
Proof.
  intros a b H.
  unfold model_form in H.
  destruct (link_eq_dec a model_root) as [Ha | Ha].
  - destruct (link_eq_dec b model_root) as [Hb | Hb].
    + left. split; assumption.
    + subst a.
      unfold nonroot_form in H.
      destruct (link_eq_dec model_root (model_start_form b)) as [Hs | Hs].
      * exfalso.
        apply (model_start_form_ne_root b).
        symmetry. exact Hs.
      * destruct (link_eq_dec b (model_end_form model_root)) as [He | He].
        -- exfalso. apply Hb. symmetry. exact H.
        -- exfalso.
           apply (pair_code_ne_left model_root b).
           symmetry. exact H.
  - unfold nonroot_form in H.
    destruct (link_eq_dec a (model_start_form b)) as [Hs | Hs].
    + right. exact Hs.
    + destruct (link_eq_dec b (model_end_form a)) as [He | He].
      * exfalso.
        apply (model_end_form_ne_self a).
        symmetry.
        exact (eq_trans H He).
      * exfalso.
        apply (pair_code_ne_left a b).
        symmetry. exact H.
Qed.

Lemma right_fixed_root_or_end :
  forall a b : ModelLink,
    b = model_form a b ->
    (a = model_root /\ b = model_root) \/
    b = model_end_form a.
Proof.
  intros a b H.
  unfold model_form in H.
  destruct (link_eq_dec a model_root) as [Ha | Ha].
  - destruct (link_eq_dec b model_root) as [Hb | Hb].
    + left. split; assumption.
    + subst a.
      unfold nonroot_form in H.
      destruct (link_eq_dec model_root (model_start_form b)) as [Hs | Hs].
      * exfalso.
        apply (model_start_form_ne_root b).
        symmetry. exact Hs.
      * destruct (link_eq_dec b (model_end_form model_root)) as [He | He].
        -- right. exact He.
        -- exfalso.
           apply (pair_code_ne_right model_root b).
           symmetry. exact H.
  - unfold nonroot_form in H.
    destruct (link_eq_dec a (model_start_form b)) as [Hs | Hs].
    + exfalso.
      apply (model_start_form_ne_self b).
      symmetry.
      exact (eq_trans H Hs).
    + destruct (link_eq_dec b (model_end_form a)) as [He | He].
      * right. exact He.
      * exfalso.
        apply (pair_code_ne_right a b).
        symmetry. exact H.
Qed.

Lemma explicit_full_self_eq_root :
  forall x : ModelLink,
    Grounded ExplicitFoundation x ->
    FullSelf ExplicitFoundation x ->
    x = model_root.
Proof.
  intros x GX Hfull.
  destruct Hfull as [Hstart Hfinish].
  destruct (grounded_is_canonical x GX) as [a [b Hx]].
  assert (Ha : a = x).
  {
    transitivity (model_start x).
    - rewrite Hx.
      symmetry.
      apply model_start_form_projection.
    - exact Hstart.
  }
  assert (Hb : b = x).
  {
    transitivity (model_finish x).
    - rewrite Hx.
      symmetry.
      apply model_finish_form_projection.
    - exact Hfinish.
  }
  subst a. subst b.
  destruct (left_fixed_root_or_start x x Hx) as [Hroot | Hsection].
  - exact (proj1 Hroot).
  - exfalso.
    apply (model_start_form_ne_self x).
    symmetry. exact Hsection.
Qed.

Lemma explicit_start_only_shape :
  forall x : ModelLink,
    Grounded ExplicitFoundation x ->
    StartOnly ExplicitFoundation x ->
    x = model_start_form (model_finish x).
Proof.
  intros x GX Hshape.
  destruct Hshape as [Hstart Hnotfinish].
  destruct (grounded_is_canonical x GX) as [a [b Hx]].
  assert (Ha : a = x).
  {
    transitivity (model_start x).
    - rewrite Hx.
      symmetry.
      apply model_start_form_projection.
    - exact Hstart.
  }
  assert (Hb : b = model_finish x).
  {
    rewrite Hx.
    symmetry.
    apply model_finish_form_projection.
  }
  subst a. subst b.
  destruct (left_fixed_root_or_start x (model_finish x) Hx)
    as [Hroot | Hsection].
  - exfalso.
    apply Hnotfinish.
    unfold FinishSelf.
    change (model_finish x = x).
    transitivity model_root.
    + exact (proj2 Hroot).
    + symmetry. exact (proj1 Hroot).
  - exact Hsection.
Qed.

Lemma explicit_finish_only_shape :
  forall x : ModelLink,
    Grounded ExplicitFoundation x ->
    FinishOnly ExplicitFoundation x ->
    x = model_end_form (model_start x).
Proof.
  intros x GX Hshape.
  destruct Hshape as [Hnotstart Hfinish].
  destruct (grounded_is_canonical x GX) as [a [b Hx]].
  assert (Ha : a = model_start x).
  {
    rewrite Hx.
    symmetry.
    apply model_start_form_projection.
  }
  assert (Hb : b = x).
  {
    transitivity (model_finish x).
    - rewrite Hx.
      symmetry.
      apply model_finish_form_projection.
    - exact Hfinish.
  }
  subst a. subst b.
  destruct (right_fixed_root_or_end (model_start x) x Hx)
    as [Hroot | Hsection].
  - exfalso.
    apply Hnotstart.
    unfold StartSelf.
    change (model_start x = x).
    transitivity model_root.
    + exact (proj1 Hroot).
    + symmetry. exact (proj2 Hroot).
  - exact Hsection.
Qed.

Lemma start_status_same_of_not_distinguishable :
  forall x y : ModelLink,
    (StartSelf ExplicitFoundation x \/ ~ StartSelf ExplicitFoundation x) ->
    (StartSelf ExplicitFoundation y \/ ~ StartSelf ExplicitFoundation y) ->
    ~ Distinguishable ExplicitFoundation x y ->
    (StartSelf ExplicitFoundation x /\ StartSelf ExplicitFoundation y) \/
    (~ StartSelf ExplicitFoundation x /\ ~ StartSelf ExplicitFoundation y).
Proof.
  intros x y Dx Dy HNo.
  destruct Dx as [Hx | Hx]; destruct Dy as [Hy | Hy].
  - left. split; assumption.
  - exfalso. apply HNo.
    exact (distinguished_start_self_left ExplicitFoundation x y Hx Hy).
  - exfalso. apply HNo.
    exact (distinguished_start_self_right ExplicitFoundation x y Hx Hy).
  - right. split; assumption.
Qed.

Lemma finish_status_same_of_not_distinguishable :
  forall x y : ModelLink,
    (FinishSelf ExplicitFoundation x \/ ~ FinishSelf ExplicitFoundation x) ->
    (FinishSelf ExplicitFoundation y \/ ~ FinishSelf ExplicitFoundation y) ->
    ~ Distinguishable ExplicitFoundation x y ->
    (FinishSelf ExplicitFoundation x /\ FinishSelf ExplicitFoundation y) \/
    (~ FinishSelf ExplicitFoundation x /\ ~ FinishSelf ExplicitFoundation y).
Proof.
  intros x y Dx Dy HNo.
  destruct Dx as [Hx | Hx]; destruct Dy as [Hy | Hy].
  - left. split; assumption.
  - exfalso. apply HNo.
    exact (distinguished_finish_self_left ExplicitFoundation x y Hx Hy).
  - exfalso. apply HNo.
    exact (distinguished_finish_self_right ExplicitFoundation x y Hx Hy).
  - right. split; assumption.
Qed.

Theorem explicit_a1 :
  A1RecursiveSeparation ExplicitFoundation.
Proof.
  unfold A1RecursiveSeparation.
  intros x y GX.
  revert y.
  induction GX as [current StartStep IHStart FinishStep IHFinish].
  intros y GY HNo.
  destruct (explicit_local_decision current) as [DXStart DXFinish].
  destruct (explicit_local_decision y) as [DYStart DYFinish].
  pose proof
    (start_status_same_of_not_distinguishable
      current y DXStart DYStart HNo) as HStartStatus.
  pose proof
    (finish_status_same_of_not_distinguishable
      current y DXFinish DYFinish HNo) as HFinishStatus.
  destruct HStartStatus as [[HXStart HYStart] | [HXNotStart HYNotStart]].
  - destruct HFinishStatus as [[HXFinish HYFinish] | [HXNotFinish HYNotFinish]].
    + assert (GXCurrent : Grounded ExplicitFoundation current).
      { exact (grounded_node ExplicitFoundation current StartStep FinishStep). }
      pose proof
        (explicit_full_self_eq_root current GXCurrent
          (conj HXStart HXFinish)) as HXRoot.
      pose proof
        (explicit_full_self_eq_root y GY
          (conj HYStart HYFinish)) as HYRoot.
      exact (eq_trans HXRoot (eq_sym HYRoot)).
    + assert (GXCurrent : Grounded ExplicitFoundation current).
      { exact (grounded_node ExplicitFoundation current StartStep FinishStep). }
      pose proof
        (grounded_finish_of_nonself
          ExplicitFoundation y GY HYNotFinish) as GYFinish.
      assert (
        HChildNo :
        ~ Distinguishable ExplicitFoundation
          (finish ExplicitFoundation current)
          (finish ExplicitFoundation y)
      ).
      {
        intro D.
        apply HNo.
        exact (distinguished_finish_child
          ExplicitFoundation current y
          HXNotFinish HYNotFinish D).
      }
      pose proof
        (IHFinish HXNotFinish
          (finish ExplicitFoundation y) GYFinish HChildNo)
        as HFinishEq.
      pose proof
        (explicit_start_only_shape current GXCurrent
          (conj HXStart HXNotFinish)) as HXShape.
      pose proof
        (explicit_start_only_shape y GY
          (conj HYStart HYNotFinish)) as HYShape.
      transitivity (model_start_form (model_finish current)).
      * exact HXShape.
      * transitivity (model_start_form (model_finish y)).
        -- f_equal.
           exact HFinishEq.
        -- symmetry. exact HYShape.
  - destruct HFinishStatus as [[HXFinish HYFinish] | [HXNotFinish HYNotFinish]].
    + assert (GXCurrent : Grounded ExplicitFoundation current).
      { exact (grounded_node ExplicitFoundation current StartStep FinishStep). }
      pose proof
        (grounded_start_of_nonself
          ExplicitFoundation y GY HYNotStart) as GYStart.
      assert (
        HChildNo :
        ~ Distinguishable ExplicitFoundation
          (start ExplicitFoundation current)
          (start ExplicitFoundation y)
      ).
      {
        intro D.
        apply HNo.
        exact (distinguished_start_child
          ExplicitFoundation current y
          HXNotStart HYNotStart D).
      }
      pose proof
        (IHStart HXNotStart
          (start ExplicitFoundation y) GYStart HChildNo)
        as HStartEq.
      pose proof
        (explicit_finish_only_shape current GXCurrent
          (conj HXNotStart HXFinish)) as HXShape.
      pose proof
        (explicit_finish_only_shape y GY
          (conj HYNotStart HYFinish)) as HYShape.
      transitivity (model_end_form (model_start current)).
      * exact HXShape.
      * transitivity (model_end_form (model_start y)).
        -- f_equal.
           exact HStartEq.
        -- symmetry. exact HYShape.
    + assert (GXCurrent : Grounded ExplicitFoundation current).
      { exact (grounded_node ExplicitFoundation current StartStep FinishStep). }
      pose proof
        (grounded_start_of_nonself
          ExplicitFoundation y GY HYNotStart) as GYStart.
      pose proof
        (grounded_finish_of_nonself
          ExplicitFoundation y GY HYNotFinish) as GYFinish.
      assert (
        HStartChildNo :
        ~ Distinguishable ExplicitFoundation
          (start ExplicitFoundation current)
          (start ExplicitFoundation y)
      ).
      {
        intro D.
        apply HNo.
        exact (distinguished_start_child
          ExplicitFoundation current y
          HXNotStart HYNotStart D).
      }
      assert (
        HFinishChildNo :
        ~ Distinguishable ExplicitFoundation
          (finish ExplicitFoundation current)
          (finish ExplicitFoundation y)
      ).
      {
        intro D.
        apply HNo.
        exact (distinguished_finish_child
          ExplicitFoundation current y
          HXNotFinish HYNotFinish D).
      }
      pose proof
        (IHStart HXNotStart
          (start ExplicitFoundation y) GYStart HStartChildNo)
        as HStartEq.
      pose proof
        (IHFinish HXNotFinish
          (finish ExplicitFoundation y) GYFinish HFinishChildNo)
        as HFinishEq.
      apply (proj2
        (explicit_fnd13_replay current y GXCurrent GY)).
      split; assumption.
Qed.

(*
Concrete replay of the stabilized FND/INV/CTX chain on the explicit model.
These are checked aliases/instantiations of existing generic theorems; they
introduce no new premise and no model-specific semantic rule.
*)
Definition ExplicitFiniteRecursiveCarrierDecision :
    FiniteRecursiveCarrierDecision ExplicitFoundation.
Proof.
  intros x _GX.
  apply explicit_local_decision.
Defined.

Definition explicit_fnd02_replay :=
  FND_02_unique_root ExplicitFoundation explicit_a1.

Definition explicit_fnd01_replay (x : ModelLink) :=
  FND_01_four_structural_cases
    ExplicitFoundation
    explicit_a1
    ExplicitOneSided
    x
    (explicit_local_decision x).

Definition explicit_fnd05_replay :=
  FND_05_canonical_recursive_description_unique
    ExplicitFoundation
    explicit_a1
    ExplicitFiniteRecursiveCarrierDecision.

Definition explicit_inv01_replay :=
  INV_01_recursive_inversion_unique_total
    ExplicitFoundation
    explicit_a1
    ExplicitOneSided
    ExplicitInversionDomain.

Definition explicit_inv02_replay :=
  INV_02_unique_total_involution
    ExplicitFoundation
    explicit_a1
    ExplicitGroundedNormalization
    ExplicitOneSided
    ExplicitInversionDomain.

Definition explicit_inv03_replay :=
  INV_03_root_fixed
    ExplicitFoundation
    ExplicitOneSided
    ExplicitInversionDomain.

Definition explicit_inv04_start_replay :=
  INV_04_start_to_finish
    ExplicitFoundation
    explicit_a1
    ExplicitOneSided
    ExplicitInversionDomain.

Definition explicit_inv04_finish_replay :=
  INV_04_finish_to_start
    ExplicitFoundation
    explicit_a1
    ExplicitOneSided
    ExplicitInversionDomain.

Definition explicit_inv05_replay :=
  INV_05_pair_preserved_and_reversed
    ExplicitFoundation
    explicit_a1
    ExplicitGroundedNormalization
    ExplicitOneSided
    ExplicitInversionDomain.

Definition explicit_inv06_replay :=
  INV_06_root_basis
    ExplicitFoundation
    explicit_a1
    ExplicitGroundedNormalization
    ExplicitOneSided
    ExplicitInversionDomain.

Definition explicit_inv07_replay :=
  INV_07_objective_chirality
    ExplicitFoundation
    explicit_a1
    ExplicitGroundedNormalization
    ExplicitOneSided
    ExplicitInversionDomain.

Definition explicit_ctx03_replay :=
  CTX_03_context_relative_gauge
    ExplicitFoundation
    explicit_a1
    ExplicitGroundedNormalization
    ExplicitOneSided
    ExplicitInversionDomain.

Definition explicit_ctx03_semantic_replay :=
  CTX_03_semantic_covariance_capstone
    ExplicitFoundation
    explicit_a1
    ExplicitGroundedNormalization
    ExplicitOneSided
    ExplicitInversionDomain.


(*
EXTERNAL THEORY PROJECTION: constructive infinitude witness.

This is prover-side cardinality evidence only. It introduces no MTS entity.
The endomap x |-> form(x,R) is injective by the START projection. The proper
END(ROOT) witness is not in its image because every image has finish=R while
END(ROOT) finishes at itself and is distinct from R. Iteration therefore
embeds nat into Link.
*)
Definition HasNatInjection (F : Foundation) : Prop :=
  exists encode : nat -> Link F,
    forall m n : nat, encode m = encode n -> m = n.

Lemma left_root_embed_injective :
  forall (F : Foundation) (a b : Link F),
    form F a (R F) = form F b (R F) ->
    a = b.
Proof.
  intros F a b H.
  pose proof (f_equal (start F) H) as Hstart.
  rewrite (form_start F a (R F)) in Hstart.
  rewrite (form_start F b (R F)) in Hstart.
  exact Hstart.
Qed.

Lemma finish_root_not_left_root_image :
  forall (F : Foundation)
    (E : F2F3OneSidedExistence F)
    (x : Link F),
    form F x (R F) <> f2f3_finish_root F E.
Proof.
  intros F E x H.
  pose proof (f_equal (finish F) H) as Hfinish.
  rewrite (form_finish F x (R F)) in Hfinish.
  rewrite (f2f3_finish_root_finish F E) in Hfinish.
  apply (f2f3_finish_root_ne_root F E).
  symmetry.
  exact Hfinish.
Qed.

Fixpoint left_root_orbit
    (F : Foundation)
    (E : F2F3OneSidedExistence F)
    (n : nat) : Link F :=
  match n with
  | O => f2f3_finish_root F E
  | S k => form F (left_root_orbit F E k) (R F)
  end.

Lemma left_root_orbit_succ_ne_zero :
  forall (F : Foundation)
    (E : F2F3OneSidedExistence F)
    (n : nat),
    left_root_orbit F E (S n) <> left_root_orbit F E O.
Proof.
  intros F E n.
  simpl.
  apply finish_root_not_left_root_image.
Qed.

Theorem left_root_orbit_injective :
  forall (F : Foundation)
    (E : F2F3OneSidedExistence F)
    (m n : nat),
    left_root_orbit F E m = left_root_orbit F E n ->
    m = n.
Proof.
  intros F E m.
  induction m as [|m IH].
  - intros n H.
    destruct n as [|n].
    + reflexivity.
    + exfalso.
      apply (left_root_orbit_succ_ne_zero F E n).
      symmetry.
      exact H.
  - intros n H.
    destruct n as [|n].
    + exfalso.
      apply (left_root_orbit_succ_ne_zero F E m).
      exact H.
    + f_equal.
      apply IH.
      apply (left_root_embed_injective F).
      exact H.
Qed.

Theorem one_sided_existence_implies_nat_injection :
  forall (F : Foundation)
    (E : F2F3OneSidedExistence F),
    HasNatInjection F.
Proof.
  intros F E.
  exists (left_root_orbit F E).
  intros m n H.
  exact (left_root_orbit_injective F E m n H).
Qed.


Theorem explicit_grounded_slice :
  Grounded ExplicitFoundation (R ExplicitFoundation) /\
  Grounded ExplicitFoundation (f2f3_start_root ExplicitFoundation ExplicitOneSided) /\
  Grounded ExplicitFoundation (f2f3_finish_root ExplicitFoundation ExplicitOneSided) /\
  Grounded ExplicitFoundation
    (form ExplicitFoundation
      (f2f3_start_root ExplicitFoundation ExplicitOneSided)
      (f2f3_finish_root ExplicitFoundation ExplicitOneSided)).
Proof.
  split.
  - apply grounded_of_full_self.
    apply root_full_self.
  - split.
    + apply f2f3_start_root_grounded.
    + split.
      * apply f2f3_finish_root_grounded.
      * apply f2f3_pair_grounded.
Qed.

Definition nat_link (n : nat) : ModelLink :=
  repeat false n ++ [true].

Lemma nat_link_length :
  forall n : nat, length (nat_link n) = S n.
Proof.
  intro n.
  unfold nat_link.
  rewrite app_length, repeat_length.
  simpl.
  lia.
Qed.

Theorem nat_link_injective :
  forall lhs rhs : nat,
    nat_link lhs = nat_link rhs ->
    lhs = rhs.
Proof.
  intros lhs rhs H.
  pose proof (f_equal (@length bool) H) as Hlen.
  rewrite (nat_link_length lhs) in Hlen.
  rewrite (nat_link_length rhs) in Hlen.
  now injection Hlen.
Qed.


(*
#1797 cyclic-boundary witness.

The existing fallback values form a genuine two-Link semantic pole cycle.
Finite inductive FND-05 descriptions cannot derive either endpoint. This
falsifies all-Link totality, while recursive_description_functional remains
globally valid whenever derivations actually exist.
*)
Theorem fallback_cycle_no_recursive_description :
  forall (x : ModelLink) (code : RecursiveDescriptionCode),
    CanonicalRecursiveDescription ExplicitFoundation x code ->
    (x = model_bad_start \/ x = model_bad_finish) ->
    False.
Proof.
  intros x code H.
  induction H as
    [ | x child HStart HChild IH
      | x child HFinish HChild IH
      | x startCode finishCode HPair HStartChild IHStart HFinishChild IHFinish ];
    intros Hbad.
  - destruct Hbad as [Hbad | Hbad]; discriminate Hbad.
  - destruct Hbad as [Hbad | Hbad].
    + subst x.
      apply IH.
      right.
      change (model_finish model_bad_start = model_bad_finish).
      apply model_finish_bad_start.
    + subst x.
      apply (proj2 HStart).
      unfold FinishSelf.
      change (model_finish model_bad_finish = model_bad_finish).
      apply model_finish_bad_finish.
  - destruct Hbad as [Hbad | Hbad].
    + subst x.
      apply (proj1 HFinish).
      unfold StartSelf.
      change (model_start model_bad_start = model_bad_start).
      apply model_start_bad_start.
    + subst x.
      apply IH.
      left.
      change (model_start model_bad_finish = model_bad_start).
      apply model_start_bad_finish.
  - destruct Hbad as [Hbad | Hbad].
    + subst x.
      apply (proj1 HPair).
      unfold StartSelf.
      change (model_start model_bad_start = model_bad_start).
      apply model_start_bad_start.
    + subst x.
      apply (proj2 HPair).
      unfold FinishSelf.
      change (model_finish model_bad_finish = model_bad_finish).
      apply model_finish_bad_finish.
Qed.

Theorem model_bad_start_no_recursive_description :
  ~ exists code : RecursiveDescriptionCode,
      CanonicalRecursiveDescription ExplicitFoundation
        model_bad_start code.
Proof.
  intros [code H].
  apply (fallback_cycle_no_recursive_description model_bad_start code H).
  left. reflexivity.
Qed.

Theorem model_bad_finish_no_recursive_description :
  ~ exists code : RecursiveDescriptionCode,
      CanonicalRecursiveDescription ExplicitFoundation
        model_bad_finish code.
Proof.
  intros [code H].
  apply (fallback_cycle_no_recursive_description model_bad_finish code H).
  right. reflexivity.
Qed.

(*
The same cycle has no finite RecursiveInversion derivation. The generic
recursive_inversion_functional theorem remains valid whenever two derivations
exist; the counterexample is totality/existence only.
*)
Theorem fallback_cycle_no_recursive_inversion :
  forall (x y : ModelLink),
    RecursiveInversion
      ExplicitFoundation ExplicitOneSided ExplicitInversionDomain x y ->
    (x = model_bad_start \/ x = model_bad_finish) ->
    False.
Proof.
  intros x y H.
  induction H as
    [ | x childInverse HStart HChild IH
      | x childInverse HFinish HChild IH
      | x inverseFinish inverseStart HPair HFinishInv IHFinish HStartInv IHStart ];
    intros Hbad.
  - destruct Hbad as [Hbad | Hbad]; discriminate Hbad.
  - destruct Hbad as [Hbad | Hbad].
    + subst x.
      apply IH.
      right.
      change (model_finish model_bad_start = model_bad_finish).
      apply model_finish_bad_start.
    + subst x.
      apply (proj2 HStart).
      unfold FinishSelf.
      change (model_finish model_bad_finish = model_bad_finish).
      apply model_finish_bad_finish.
  - destruct Hbad as [Hbad | Hbad].
    + subst x.
      apply (proj1 HFinish).
      unfold StartSelf.
      change (model_start model_bad_start = model_bad_start).
      apply model_start_bad_start.
    + subst x.
      apply IH.
      left.
      change (model_start model_bad_finish = model_bad_start).
      apply model_start_bad_finish.
  - destruct Hbad as [Hbad | Hbad].
    + subst x.
      apply (proj1 HPair).
      unfold StartSelf.
      change (model_start model_bad_start = model_bad_start).
      apply model_start_bad_start.
    + subst x.
      apply (proj2 HPair).
      unfold FinishSelf.
      change (model_finish model_bad_finish = model_bad_finish).
      apply model_finish_bad_finish.
Qed.

Theorem model_bad_start_no_recursive_inverse :
  ~ exists y : ModelLink,
      RecursiveInversion
        ExplicitFoundation ExplicitOneSided ExplicitInversionDomain
        model_bad_start y.
Proof.
  intros [y H].
  apply (fallback_cycle_no_recursive_inversion model_bad_start y H).
  left. reflexivity.
Qed.

Theorem model_bad_finish_no_recursive_inverse :
  ~ exists y : ModelLink,
      RecursiveInversion
        ExplicitFoundation ExplicitOneSided ExplicitInversionDomain
        model_bad_finish y.
Proof.
  intros [y H].
  apply (fallback_cycle_no_recursive_inversion model_bad_finish y H).
  right. reflexivity.
Qed.

(*
Sharing control for #1797.

The same Grounded semantic child is used on both poles of one parent. This is
still Grounded and therefore demonstrates that repeated/shared substructure is
not the same obstruction as a true distinct-node non-well-founded cycle.
Physical pointer/heap sharing remains outside this proof boundary.
*)
Definition shared_grounded_child : ModelLink :=
  f2f3_start_root ExplicitFoundation ExplicitOneSided.

Definition shared_grounded_parent : ModelLink :=
  form ExplicitFoundation shared_grounded_child shared_grounded_child.

Theorem shared_grounded_parent_start :
  start ExplicitFoundation shared_grounded_parent =
  shared_grounded_child.
Proof.
  unfold shared_grounded_parent.
  apply form_start.
Qed.

Theorem shared_grounded_parent_finish :
  finish ExplicitFoundation shared_grounded_parent =
  shared_grounded_child.
Proof.
  unfold shared_grounded_parent.
  apply form_finish.
Qed.

Theorem shared_grounded_parent_grounded :
  Grounded ExplicitFoundation shared_grounded_parent.
Proof.
  unfold shared_grounded_parent, shared_grounded_child.
  apply recursive_pair_grounded.
  - apply f2f3_start_root_grounded.
  - apply f2f3_start_root_grounded.
Qed.


End Model1796.
