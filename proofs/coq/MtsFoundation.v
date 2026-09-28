Record Foundation : Type := {
  Link : Type;
  form : Link -> Link -> Link;
  start : Link -> Link;
  finish : Link -> Link;
  R : Link;

  form_start :
    forall a b : Link, start (form a b) = a;

  form_finish :
    forall a b : Link, finish (form a b) = b;

  root_self :
    form R R = R
}.

Definition FullSelf (F : Foundation) (x : Link F) : Prop :=
  start F x = x /\ finish F x = x.

(* Finite F2/F3 grounding uses one constructor.  Each pole contributes
   one conditional recursive obligation: if it is not self, its external Link
   must itself have finite Grounded evidence. *)
Inductive Grounded (F : Foundation) : Link F -> Prop :=
| grounded_node :
    forall x : Link F,
      (start F x <> x -> Grounded F (start F x)) ->
      (finish F x <> x -> Grounded F (finish F x)) ->
      Grounded F x.

(* Finite recursive evidence that two Links are distinguishable. *)
Inductive Distinguishable (F : Foundation) : Link F -> Link F -> Prop :=
| distinguished_start_self_left :
    forall x y : Link F,
      start F x = x ->
      start F y <> y ->
      Distinguishable F x y
| distinguished_start_self_right :
    forall x y : Link F,
      start F x <> x ->
      start F y = y ->
      Distinguishable F x y
| distinguished_finish_self_left :
    forall x y : Link F,
      finish F x = x ->
      finish F y <> y ->
      Distinguishable F x y
| distinguished_finish_self_right :
    forall x y : Link F,
      finish F x <> x ->
      finish F y = y ->
      Distinguishable F x y
| distinguished_start_child :
    forall x y : Link F,
      start F x <> x ->
      start F y <> y ->
      Distinguishable F (start F x) (start F y) ->
      Distinguishable F x y
| distinguished_finish_child :
    forall x y : Link F,
      finish F x <> x ->
      finish F y <> y ->
      Distinguishable F (finish F x) (finish F y) ->
      Distinguishable F x y.

(* Accepted A1/F2/F3 principle:
   finitely grounded Links with no finite recursive distinction are one
   semantic Link. *)
Definition A1RecursiveSeparation (F : Foundation) : Prop :=
  forall x y : Link F,
    Grounded F x ->
    Grounded F y ->
    ~ Distinguishable F x y ->
    x = y.

Lemma root_full_self (F : Foundation) :
  FullSelf F (R F).
Proof.
  unfold FullSelf.
  split.
  - pose proof (form_start F (R F) (R F)) as H.
    rewrite (root_self F) in H.
    exact H.
  - pose proof (form_finish F (R F) (R F)) as H.
    rewrite (root_self F) in H.
    exact H.
Qed.

Lemma grounded_of_full_self
    (F : Foundation)
    (x : Link F) :
    FullSelf F x ->
    Grounded F x.
Proof.
  intros H.
  destruct H as [Hs Hf].
  apply grounded_node.
  - intros Hnot. exact (False_rect _ (Hnot Hs)).
  - intros Hnot. exact (False_rect _ (Hnot Hf)).
Qed.

Lemma full_self_not_distinguishable
    (F : Foundation)
    (x y : Link F) :
    FullSelf F x ->
    FullSelf F y ->
    ~ Distinguishable F x y.
Proof.
  intros Hx Hy D.
  destruct Hx as [Hxs Hxf].
  destruct Hy as [Hys Hyf].
  destruct D as
    [x0 y0 Hsx Hnsy
    |x0 y0 Hnsx Hsy
    |x0 y0 Hfx Hnfy
    |x0 y0 Hnfx Hfy
    |x0 y0 Hnsx Hnsy Dxy
    |x0 y0 Hnfx Hnfy Dxy].
  - exact (Hnsy Hys).
  - exact (Hnsx Hxs).
  - exact (Hnfy Hyf).
  - exact (Hnfx Hxf).
  - exact (Hnsx Hxs).
  - exact (Hnfx Hxf).
Qed.

(* FND-02 — unique full self-closure / unique ROOT.
   No pole extensionality, four-case datatype, or root-uniqueness axiom
   appears in this proof. *)
Theorem FND_02_unique_root
    (F : Foundation) :
    A1RecursiveSeparation F ->
    forall x : Link F,
      FullSelf F x ->
      x = R F.
Proof.
  intros A1 x Hx.
  apply (A1 x (R F)).
  - apply grounded_of_full_self. exact Hx.
  - apply grounded_of_full_self. apply root_full_self.
  - apply full_self_not_distinguishable.
    + exact Hx.
    + apply root_full_self.
Qed.


(* External F2/F3 normalization interface.

   Historical MTS source 1e529a23... describes finite recursive forms modulo
   the least relation ~=, with one alpha-neutral normal form per semantic
   class.  This record captures the exact dependency needed by A6 without
   assuming pole extensionality or a reconstruction axiom. *)
Record F2F3Normalization (F : Foundation) : Type := {
  NormalForm : Type;
  compose_nf : NormalForm -> NormalForm -> NormalForm;
  normal_form : Link F -> NormalForm;

  root_unique_fnd02 :
    forall x : Link F,
      FullSelf F x ->
      x = R F;

  normal_form_equation :
    forall x : Link F,
      normal_form x =
      compose_nf
        (normal_form (start F x))
        (normal_form (finish F x));

  normal_form_complete :
    forall x y : Link F,
      normal_form x = normal_form y ->
      x = y
}.

(* FND-13 / historical A6 — identity by ordered poles, derived from the
   accepted F2/F3 recursive-normalization interface. *)
Theorem FND_13_identity_by_poles
    (F : Foundation)
    (N : F2F3Normalization F)
    (x y : Link F) :
    x = y <->
    start F x = start F y /\
    finish F x = finish F y.
Proof.
  split.
  - intros Hxy.
    subst y.
    split; reflexivity.
  - intros H.
    destruct H as [Hs Hf].
    apply (normal_form_complete F N x y).
    rewrite (normal_form_equation F N x).
    rewrite (normal_form_equation F N y).
    rewrite Hs, Hf.
    reflexivity.
Qed.
