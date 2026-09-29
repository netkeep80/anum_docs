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
      change model_finish model_bad_start <> model_bad_start.
      rewrite model_finish_bad_start.
      exact model_bad_start_ne_bad_finish.
    }
    apply (IHFinish Hneq).
    right.
    change model_finish model_bad_start = model_bad_finish.
    apply model_finish_bad_start.
  - subst x.
    assert (
      Hneq :
      start ExplicitFoundation model_bad_finish <> model_bad_finish
    ).
    {
      change model_start model_bad_finish <> model_bad_finish.
      rewrite model_start_bad_finish.
      exact model_bad_start_ne_bad_finish.
    }
    apply (IHStart Hneq).
    left.
    change model_start model_bad_finish = model_bad_start.
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
        change model_start x <> x.
        intros Heq.
        apply Hx.
        transitivity (model_start x).
        - symmetry. exact Heq.
        - exact Hstart.
      }
      pose proof
        (grounded_start_of_nonself ExplicitFoundation x G Hstart_ne)
        as Gbad.
      change Grounded ExplicitFoundation (model_start x) in Gbad.
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

End Model1796.
