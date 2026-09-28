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
   class.

   The normalization package is indexed by a previously established unique
   ROOT proof.  In the accepted proof order that proof is supplied by FND-02.
   FND-13 then uses the recursive normal-form equation and completeness, not
   pole extensionality as a premise. *)
Definition RootUniqueness (F : Foundation) : Prop :=
  forall x : Link F,
    FullSelf F x ->
    x = R F.

Record F2F3Normalization
    (F : Foundation)
    (_uniqueRoot : RootUniqueness F) : Type := {
  NormalForm : Type;
  compose_nf : NormalForm -> NormalForm -> NormalForm;
  normal_form : Link F -> NormalForm;

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
   accepted F2/F3 recursive-normalization interface after FND-02. *)
Theorem FND_13_identity_by_poles
    (F : Foundation)
    (A1 : A1RecursiveSeparation F)
    (N : F2F3Normalization F (FND_02_unique_root F A1))
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
    apply (normal_form_complete
      F (FND_02_unique_root F A1) N x y).
    rewrite (normal_form_equation
      F (FND_02_unique_root F A1) N x).
    rewrite (normal_form_equation
      F (FND_02_unique_root F A1) N y).
    rewrite Hs, Hf.
    reflexivity.
Qed.


(* Local self-incidence predicates for FND-01.
   No four-constructor datatype is introduced: these are four proposition
   patterns induced by two independent self-incidence questions. *)
Definition StartSelf (F : Foundation) (x : Link F) : Prop :=
  start F x = x.

Definition FinishSelf (F : Foundation) (x : Link F) : Prop :=
  finish F x = x.

Definition StartOnly (F : Foundation) (x : Link F) : Prop :=
  StartSelf F x /\ ~ FinishSelf F x.

Definition FinishOnly (F : Foundation) (x : Link F) : Prop :=
  ~ StartSelf F x /\ FinishSelf F x.

Definition PairLocal (F : Foundation) (x : Link F) : Prop :=
  ~ StartSelf F x /\ ~ FinishSelf F x.

(* Constructive classification receives exact local decision evidence rather
   than assuming arbitrary Link equality is globally decidable. *)
Definition LocalSelfDecision (F : Foundation) (x : Link F) : Prop :=
  (StartSelf F x \/ ~ StartSelf F x) /\
  (FinishSelf F x \/ ~ FinishSelf F x).

Definition LocalSelfIncidenceExhaustive
    (F : Foundation) (x : Link F) : Prop :=
  FullSelf F x \/
  StartOnly F x \/
  FinishOnly F x \/
  PairLocal F x.

Definition LocalSelfIncidenceExclusive
    (F : Foundation) (x : Link F) : Prop :=
  ~ (FullSelf F x /\ StartOnly F x) /\
  ~ (FullSelf F x /\ FinishOnly F x) /\
  ~ (FullSelf F x /\ PairLocal F x) /\
  ~ (StartOnly F x /\ FinishOnly F x) /\
  ~ (StartOnly F x /\ PairLocal F x) /\
  ~ (FinishOnly F x /\ PairLocal F x).

Lemma local_self_incidence_exhaustive
    (F : Foundation)
    (x : Link F) :
    LocalSelfDecision F x ->
    LocalSelfIncidenceExhaustive F x.
Proof.
  intros D.
  destruct D as [Ds Df].
  destruct Ds as [Hs | Hns].
  - destruct Df as [Hf | Hnf].
    + left. split; assumption.
    + right. left. split; assumption.
  - destruct Df as [Hf | Hnf].
    + right. right. left. split; assumption.
    + right. right. right. split; assumption.
Qed.

Lemma local_self_incidence_exclusive
    (F : Foundation)
    (x : Link F) :
    LocalSelfIncidenceExclusive F x.
Proof.
  unfold LocalSelfIncidenceExclusive.
  split.
  - intros [H0 H1]. exact ((proj2 H1) (proj2 H0)).
  - split.
    + intros [H0 H2]. exact ((proj1 H2) (proj1 H0)).
    + split.
      * intros [H0 H3]. exact ((proj1 H3) (proj1 H0)).
      * split.
        -- intros [H1 H2]. exact ((proj1 H2) (proj1 H1)).
        -- split.
           ++ intros [H1 H3]. exact ((proj1 H3) (proj1 H1)).
           ++ intros [H2 H3]. exact ((proj2 H3) (proj2 H2)).
Qed.

(* FND-01 C1 — proposition-level local partition only.

   This is intentionally not the full realizability claim.  Given explicit
   decisions for the two local identity questions, exactly one proposition
   pattern is possible.  The full-self branch is identified with ROOT by
   FND-02, while actual Link identity remains ordered-pole identity from
   FND-13.  Context orientation only names the two one-sided cases later. *)
Theorem FND_01_local_partition
    (F : Foundation)
    (A1 : A1RecursiveSeparation F)
    (N : F2F3Normalization F (FND_02_unique_root F A1))
    (x : Link F) :
    LocalSelfDecision F x ->
    LocalSelfIncidenceExhaustive F x /\
    LocalSelfIncidenceExclusive F x /\
    (FullSelf F x -> x = R F) /\
    (forall y : Link F,
      start F x = start F y ->
      finish F x = finish F y ->
      x = y).
Proof.
  intros D.
  split.
  - apply local_self_incidence_exhaustive. exact D.
  - split.
    + apply local_self_incidence_exclusive.
    + split.
      * intros H. apply (FND_02_unique_root F A1 x H).
      * intros y Hs Hf.
        apply (proj2 (FND_13_identity_by_poles F A1 N x y)).
        split; assumption.
Qed.
