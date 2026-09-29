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
  refine {|
    f2f3_start_root := model_start_form model_root;
    f2f3_finish_root := model_end_form model_root
  |}.
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
    + lhs. exact H.
    + rhs. exact H.
  - destruct (link_eq_dec (finish ExplicitFoundation x) x) as [H | H].
    + lhs. exact H.
    + rhs. exact H.
Qed.

Definition ExplicitInversionDomain :
    RecursiveInversionDomain ExplicitFoundation ExplicitOneSided.
Proof.
  refine {|
    recursive_start_form := model_start_form;
    recursive_end_form := model_end_form
  |}.
  - intro a. symmetry. apply model_form_start_fixed.
  - intro a. symmetry. apply model_form_end_fixed.
  - reflexivity.
  - reflexivity.
  - intros x _GX. apply explicit_local_decision.
Defined.

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
