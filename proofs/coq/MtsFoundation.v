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


(* Minimal F2/F3 existence premise for FND-01 realizability.
   Only the two proper one-sided recursive forms around ROOT are supplied.
   The ordinary pair representative is derived through the single Link-forming
   primitive. *)
Record F2F3OneSidedExistence (F : Foundation) : Type := {
  f2f3_start_root : Link F;
  f2f3_finish_root : Link F;

  f2f3_start_root_equation :
    f2f3_start_root =
    form F f2f3_start_root (R F);

  f2f3_finish_root_equation :
    f2f3_finish_root =
    form F (R F) f2f3_finish_root;

  f2f3_start_root_ne_root :
    f2f3_start_root <> R F;

  f2f3_finish_root_ne_root :
    f2f3_finish_root <> R F
}.

Lemma f2f3_start_root_start
    (F : Foundation)
    (E : F2F3OneSidedExistence F) :
    start F (f2f3_start_root F E) = f2f3_start_root F E.
Proof.
  pose proof
    (f_equal (start F) (f2f3_start_root_equation F E)) as H.
  rewrite (form_start F (f2f3_start_root F E) (R F)) in H.
  exact H.
Qed.

Lemma f2f3_start_root_finish
    (F : Foundation)
    (E : F2F3OneSidedExistence F) :
    finish F (f2f3_start_root F E) = R F.
Proof.
  pose proof
    (f_equal (finish F) (f2f3_start_root_equation F E)) as H.
  rewrite (form_finish F (f2f3_start_root F E) (R F)) in H.
  exact H.
Qed.

Lemma f2f3_finish_root_start
    (F : Foundation)
    (E : F2F3OneSidedExistence F) :
    start F (f2f3_finish_root F E) = R F.
Proof.
  pose proof
    (f_equal (start F) (f2f3_finish_root_equation F E)) as H.
  rewrite (form_start F (R F) (f2f3_finish_root F E)) in H.
  exact H.
Qed.

Lemma f2f3_finish_root_finish
    (F : Foundation)
    (E : F2F3OneSidedExistence F) :
    finish F (f2f3_finish_root F E) = f2f3_finish_root F E.
Proof.
  pose proof
    (f_equal (finish F) (f2f3_finish_root_equation F E)) as H.
  rewrite (form_finish F (R F) (f2f3_finish_root F E)) in H.
  exact H.
Qed.

Lemma f2f3_start_root_pattern
    (F : Foundation)
    (E : F2F3OneSidedExistence F) :
    StartOnly F (f2f3_start_root F E).
Proof.
  unfold StartOnly, StartSelf, FinishSelf.
  split.
  - apply f2f3_start_root_start.
  - intros H.
    apply (f2f3_start_root_ne_root F E).
    transitivity (finish F (f2f3_start_root F E)).
    + symmetry. exact H.
    + apply f2f3_start_root_finish.
Qed.

Lemma f2f3_finish_root_pattern
    (F : Foundation)
    (E : F2F3OneSidedExistence F) :
    FinishOnly F (f2f3_finish_root F E).
Proof.
  unfold FinishOnly, StartSelf, FinishSelf.
  split.
  - intros H.
    apply (f2f3_finish_root_ne_root F E).
    transitivity (start F (f2f3_finish_root F E)).
    + symmetry. exact H.
    + apply f2f3_finish_root_start.
  - apply f2f3_finish_root_finish.
Qed.

Lemma f2f3_start_root_grounded
    (F : Foundation)
    (E : F2F3OneSidedExistence F) :
    Grounded F (f2f3_start_root F E).
Proof.
  apply grounded_node.
  - intros Hnot.
    exact (False_rect _ (Hnot (f2f3_start_root_start F E))).
  - intros Hnot.
    rewrite (f2f3_start_root_finish F E).
    apply grounded_of_full_self.
    apply root_full_self.
Qed.

Lemma f2f3_finish_root_grounded
    (F : Foundation)
    (E : F2F3OneSidedExistence F) :
    Grounded F (f2f3_finish_root F E).
Proof.
  apply grounded_node.
  - intros Hnot.
    rewrite (f2f3_finish_root_start F E).
    apply grounded_of_full_self.
    apply root_full_self.
  - intros Hnot.
    exact (False_rect _ (Hnot (f2f3_finish_root_finish F E))).
Qed.

Lemma f2f3_pair_pattern
    (F : Foundation)
    (E : F2F3OneSidedExistence F) :
    PairLocal F
      (form F (f2f3_start_root F E) (f2f3_finish_root F E)).
Proof.
  unfold PairLocal, StartSelf, FinishSelf.
  split.
  - intros Hself.
    pose proof
      (form_start F (f2f3_start_root F E) (f2f3_finish_root F E))
      as Hstart.
    assert (
      HstartPair :
      f2f3_start_root F E =
      form F (f2f3_start_root F E) (f2f3_finish_root F E)
    ).
    {
      transitivity
        (start F
          (form F (f2f3_start_root F E) (f2f3_finish_root F E))).
      - symmetry. exact Hstart.
      - exact Hself.
    }
    apply (f2f3_finish_root_ne_root F E).
    transitivity
      (finish F
        (form F (f2f3_start_root F E) (f2f3_finish_root F E))).
    + symmetry.
      apply form_finish.
    + transitivity (finish F (f2f3_start_root F E)).
      * symmetry.
        exact (f_equal (finish F) HstartPair).
      * apply f2f3_start_root_finish.
  - intros Hself.
    pose proof
      (form_finish F (f2f3_start_root F E) (f2f3_finish_root F E))
      as Hfinish.
    assert (
      HfinishPair :
      f2f3_finish_root F E =
      form F (f2f3_start_root F E) (f2f3_finish_root F E)
    ).
    {
      transitivity
        (finish F
          (form F (f2f3_start_root F E) (f2f3_finish_root F E))).
      - symmetry. exact Hfinish.
      - exact Hself.
    }
    apply (f2f3_start_root_ne_root F E).
    transitivity
      (start F
        (form F (f2f3_start_root F E) (f2f3_finish_root F E))).
    + symmetry.
      apply form_start.
    + transitivity (start F (f2f3_finish_root F E)).
      * symmetry.
        exact (f_equal (start F) HfinishPair).
      * apply f2f3_finish_root_start.
Qed.

Lemma f2f3_pair_grounded
    (F : Foundation)
    (E : F2F3OneSidedExistence F) :
    Grounded F
      (form F (f2f3_start_root F E) (f2f3_finish_root F E)).
Proof.
  apply grounded_node.
  - intros Hnot.
    rewrite (form_start F (f2f3_start_root F E) (f2f3_finish_root F E)).
    apply f2f3_start_root_grounded.
  - intros Hnot.
    rewrite (form_finish F (f2f3_start_root F E) (f2f3_finish_root F E)).
    apply f2f3_finish_root_grounded.
Qed.

(* FND-01 C2 — grounded realizability of all four proposition patterns.

   ROOT is realized by R. F2/F3 contributes the two proper one-sided recursive
   witnesses. The neither-self representative is derived with the same one
   Link-forming primitive. *)
Theorem FND_01_grounded_realizability
    (F : Foundation)
    (E : F2F3OneSidedExistence F) :
    FullSelf F (R F) /\
    exists startWitness finishWitness pairWitness : Link F,
      Grounded F startWitness /\
      Grounded F finishWitness /\
      Grounded F pairWitness /\
      StartOnly F startWitness /\
      FinishOnly F finishWitness /\
      PairLocal F pairWitness.
Proof.
  split.
  - apply root_full_self.
  - exists (f2f3_start_root F E).
    exists (f2f3_finish_root F E).
    exists (form F (f2f3_start_root F E) (f2f3_finish_root F E)).
    split.
    + apply f2f3_start_root_grounded.
    + split.
      * apply f2f3_finish_root_grounded.
      * split.
        -- apply f2f3_pair_grounded.
        -- split.
           ++ apply f2f3_start_root_pattern.
           ++ split.
              ** apply f2f3_finish_root_pattern.
              ** apply f2f3_pair_pattern.
Qed.


(* FND-01 C3 structural capstone.

   C1 proves the exhaustive/exclusive proposition partition.
   C2 proves grounded realizability of every proposition pattern.
   FND-02 and FND-13 remain the identity boundaries consumed by C1. *)
Theorem FND_01_four_structural_cases
    (F : Foundation)
    (A1 : A1RecursiveSeparation F)
    (N : F2F3Normalization F (FND_02_unique_root F A1))
    (E : F2F3OneSidedExistence F)
    (x : Link F) :
    LocalSelfDecision F x ->
    LocalSelfIncidenceExhaustive F x /\
    LocalSelfIncidenceExclusive F x /\
    (FullSelf F x -> x = R F) /\
    (forall y : Link F,
      start F x = start F y ->
      finish F x = finish F y ->
      x = y) /\
    (FullSelf F (R F) /\
      exists startWitness finishWitness pairWitness : Link F,
        Grounded F startWitness /\
        Grounded F finishWitness /\
        Grounded F pairWitness /\
        StartOnly F startWitness /\
        FinishOnly F finishWitness /\
        PairLocal F pairWitness).
Proof.
  intros D.
  pose proof (FND_01_local_partition F A1 N x D) as C1.
  pose proof (FND_01_grounded_realizability F E) as C2.
  destruct C1 as [HEx [HExclusive [HRoot HIdentity]]].
  split.
  - exact HEx.
  - split.
    + exact HExclusive.
    + split.
      * exact HRoot.
      * split.
        -- exact HIdentity.
        -- exact C2.
Qed.

(* Context-relative START_K / END_K naming is presentation only.
   This predicate does not create Links. It only identifies Context-provided
   names with the already existing F2/F3 one-sided witnesses. Actual frame
   selection/chirality belongs to CTX-03. *)
Definition ContextOneSidedNames
    (F : Foundation)
    (E : F2F3OneSidedExistence F)
    (START_K END_K : Link F) : Prop :=
  START_K = f2f3_start_root F E /\
  END_K = f2f3_finish_root F E.

Theorem FND_01_context_names_only
    (F : Foundation)
    (E : F2F3OneSidedExistence F)
    (START_K END_K : Link F) :
    ContextOneSidedNames F E START_K END_K ->
    FullSelf F (R F) /\
    StartOnly F START_K /\
    FinishOnly F END_K /\
    PairLocal F (form F START_K END_K).
Proof.
  intros Names.
  destruct Names as [HStartName HEndName].
  subst START_K.
  subst END_K.
  split.
  - apply root_full_self.
  - split.
    + apply f2f3_start_root_pattern.
    + split.
      * apply f2f3_finish_root_pattern.
      * apply f2f3_pair_pattern.
Qed.


(* Generic F2/F3 recursive formation for the already accepted finite domain.
   It exposes historical START(F) / END(F) formation through ordinary Links,
   not new ontology kinds. *)
Record F2F3RecursiveFormation
    (F : Foundation)
    (E : F2F3OneSidedExistence F) : Type := {
  f2f3_start_form : Link F -> Link F;
  f2f3_finish_form : Link F -> Link F;

  f2f3_start_equation :
    forall x : Link F,
      f2f3_start_form x =
      form F (f2f3_start_form x) x;

  f2f3_finish_equation :
    forall x : Link F,
      f2f3_finish_form x =
      form F x (f2f3_finish_form x);

  f2f3_start_root_agreement :
    f2f3_start_form (R F) = f2f3_start_root F E;

  f2f3_finish_root_agreement :
    f2f3_finish_form (R F) = f2f3_finish_root F E
}.

Lemma f2f3_start_form_start
    (F : Foundation)
    (E : F2F3OneSidedExistence F)
    (D : F2F3RecursiveFormation F E)
    (x : Link F) :
    start F (f2f3_start_form F E D x) =
    f2f3_start_form F E D x.
Proof.
  pose proof
    (f_equal (start F) (f2f3_start_equation F E D x)) as H.
  rewrite (form_start F (f2f3_start_form F E D x) x) in H.
  exact H.
Qed.

Lemma f2f3_start_form_finish
    (F : Foundation)
    (E : F2F3OneSidedExistence F)
    (D : F2F3RecursiveFormation F E)
    (x : Link F) :
    finish F (f2f3_start_form F E D x) = x.
Proof.
  pose proof
    (f_equal (finish F) (f2f3_start_equation F E D x)) as H.
  rewrite (form_finish F (f2f3_start_form F E D x) x) in H.
  exact H.
Qed.

Lemma f2f3_finish_form_start
    (F : Foundation)
    (E : F2F3OneSidedExistence F)
    (D : F2F3RecursiveFormation F E)
    (x : Link F) :
    start F (f2f3_finish_form F E D x) = x.
Proof.
  pose proof
    (f_equal (start F) (f2f3_finish_equation F E D x)) as H.
  rewrite (form_start F x (f2f3_finish_form F E D x)) in H.
  exact H.
Qed.

Lemma f2f3_finish_form_finish
    (F : Foundation)
    (E : F2F3OneSidedExistence F)
    (D : F2F3RecursiveFormation F E)
    (x : Link F) :
    finish F (f2f3_finish_form F E D x) =
    f2f3_finish_form F E D x.
Proof.
  pose proof
    (f_equal (finish F) (f2f3_finish_equation F E D x)) as H.
  rewrite (form_finish F x (f2f3_finish_form F E D x)) in H.
  exact H.
Qed.

Lemma f2f3_start_form_proper
    (F : Foundation)
    (A1 : A1RecursiveSeparation F)
    (E : F2F3OneSidedExistence F)
    (D : F2F3RecursiveFormation F E)
    (x : Link F) :
    f2f3_start_form F E D x <> x.
Proof.
  intros HCollapse.
  pose proof (f2f3_start_equation F E D x) as Heq.
  rewrite HCollapse in Heq.
  assert (HFull : FullSelf F x).
  {
    unfold FullSelf.
    split.
    - transitivity (start F (form F x x)).
      + exact (f_equal (start F) Heq).
      + apply form_start.
    - transitivity (finish F (form F x x)).
      + exact (f_equal (finish F) Heq).
      + apply form_finish.
  }
  pose proof (FND_02_unique_root F A1 x HFull) as HRoot.
  apply (f2f3_start_root_ne_root F E).
  transitivity (f2f3_start_form F E D (R F)).
  - symmetry. apply f2f3_start_root_agreement.
  - transitivity (f2f3_start_form F E D x).
    + exact (f_equal (f2f3_start_form F E D) (eq_sym HRoot)).
    + transitivity x.
      * exact HCollapse.
      * exact HRoot.
Qed.

Lemma f2f3_finish_form_proper
    (F : Foundation)
    (A1 : A1RecursiveSeparation F)
    (E : F2F3OneSidedExistence F)
    (D : F2F3RecursiveFormation F E)
    (x : Link F) :
    f2f3_finish_form F E D x <> x.
Proof.
  intros HCollapse.
  pose proof (f2f3_finish_equation F E D x) as Heq.
  rewrite HCollapse in Heq.
  assert (HFull : FullSelf F x).
  {
    unfold FullSelf.
    split.
    - transitivity (start F (form F x x)).
      + exact (f_equal (start F) Heq).
      + apply form_start.
    - transitivity (finish F (form F x x)).
      + exact (f_equal (finish F) Heq).
      + apply form_finish.
  }
  pose proof (FND_02_unique_root F A1 x HFull) as HRoot.
  apply (f2f3_finish_root_ne_root F E).
  transitivity (f2f3_finish_form F E D (R F)).
  - symmetry. apply f2f3_finish_root_agreement.
  - transitivity (f2f3_finish_form F E D x).
    + exact (f_equal (f2f3_finish_form F E D) (eq_sym HRoot)).
    + transitivity x.
      * exact HCollapse.
      * exact HRoot.
Qed.

Lemma f2f3_start_form_pattern
    (F : Foundation)
    (A1 : A1RecursiveSeparation F)
    (E : F2F3OneSidedExistence F)
    (D : F2F3RecursiveFormation F E)
    (x : Link F) :
    StartOnly F (f2f3_start_form F E D x).
Proof.
  unfold StartOnly, StartSelf, FinishSelf.
  split.
  - apply f2f3_start_form_start.
  - intros H.
    apply (f2f3_start_form_proper F A1 E D x).
    transitivity (finish F (f2f3_start_form F E D x)).
    + symmetry. exact H.
    + apply f2f3_start_form_finish.
Qed.

Lemma f2f3_finish_form_pattern
    (F : Foundation)
    (A1 : A1RecursiveSeparation F)
    (E : F2F3OneSidedExistence F)
    (D : F2F3RecursiveFormation F E)
    (x : Link F) :
    FinishOnly F (f2f3_finish_form F E D x).
Proof.
  unfold FinishOnly, StartSelf, FinishSelf.
  split.
  - intros H.
    apply (f2f3_finish_form_proper F A1 E D x).
    transitivity (start F (f2f3_finish_form F E D x)).
    + symmetry. exact H.
    + apply f2f3_finish_form_start.
  - apply f2f3_finish_form_finish.
Qed.

(* A decision object for one exact proposition, not a global equality
   decision procedure. *)
Inductive ProofDecision (P : Prop) : Type :=
| proof_yes : P -> ProofDecision P
| proof_no : (P -> False) -> ProofDecision P.

Definition proof_decision_or
    (P : Prop)
    (D : ProofDecision P) :
    P \/ ~ P :=
  match D with
  | proof_yes _ H => or_introl H
  | proof_no _ H => or_intror H
  end.

(* Finite recursive traversal evidence. There is one node constructor, not a
   four-case semantic datatype. *)
Inductive InversionReady (F : Foundation) : Link F -> Type :=
| inversion_ready_node :
    forall x : Link F,
      ProofDecision (StartSelf F x) ->
      ProofDecision (FinishSelf F x) ->
      (start F x <> x -> InversionReady F (start F x)) ->
      (finish F x <> x -> InversionReady F (finish F x)) ->
      InversionReady F x.

Definition inversion_ready_decision
    (F : Foundation)
    (x : Link F)
    (Ready : InversionReady F x) :
    LocalSelfDecision F x.
Proof.
  destruct Ready as [x StartDecision FinishDecision StartReady FinishReady].
  split.
  - exact (proof_decision_or (StartSelf F x) StartDecision).
  - exact (proof_decision_or (FinishSelf F x) FinishDecision).
Defined.

Lemma inversion_ready_grounded
    (F : Foundation) :
    forall x : Link F,
      InversionReady F x ->
      Grounded F x.
Proof.
  fix IH 2.
  intros x Ready.
  destruct Ready as [x StartDecision FinishDecision StartReady FinishReady].
  apply grounded_node.
  - intros H. apply IH. exact (StartReady H).
  - intros H. apply IH. exact (FinishReady H).
Qed.

(* INV-01 semantic relation over Links themselves. *)
Inductive RecursiveInverse
    (F : Foundation)
    (E : F2F3OneSidedExistence F)
    (D : F2F3RecursiveFormation F E) :
    Link F -> Link F -> Prop :=
| inverse_root :
    RecursiveInverse F E D (R F) (R F)
| inverse_start :
    forall x childInverse : Link F,
      StartOnly F x ->
      RecursiveInverse F E D (finish F x) childInverse ->
      RecursiveInverse F E D x (f2f3_finish_form F E D childInverse)
| inverse_finish :
    forall x childInverse : Link F,
      FinishOnly F x ->
      RecursiveInverse F E D (start F x) childInverse ->
      RecursiveInverse F E D x (f2f3_start_form F E D childInverse)
| inverse_pair :
    forall x startInverse finishInverse : Link F,
      PairLocal F x ->
      RecursiveInverse F E D (start F x) startInverse ->
      RecursiveInverse F E D (finish F x) finishInverse ->
      RecursiveInverse F E D x (form F finishInverse startInverse).

Theorem recursive_inverse_exists
    (F : Foundation)
    (A1 : A1RecursiveSeparation F)
    (N : F2F3Normalization F (FND_02_unique_root F A1))
    (E : F2F3OneSidedExistence F)
    (D : F2F3RecursiveFormation F E) :
    forall x : Link F,
      InversionReady F x ->
      exists y : Link F, RecursiveInverse F E D x y.
Proof.
  fix IH 2.
  intros x Ready.
  pose proof (inversion_ready_decision F x Ready) as LocalDecision.
  pose proof
    (FND_01_four_structural_cases F A1 N E x LocalDecision)
    as Cases.
  destruct Cases as [HCase _].
  destruct Ready as [x StartDecision FinishDecision StartReady FinishReady].
  destruct HCase as [HFull | [HStart | [HFinish | HPair]]].
  - pose proof (FND_02_unique_root F A1 x HFull) as HRoot.
    subst x.
    exists (R F).
    apply inverse_root.
  - destruct (IH (finish F x) (FinishReady (proj2 HStart)))
      as [ChildInverse HChild].
    exists (f2f3_finish_form F E D ChildInverse).
    apply inverse_start.
    + exact HStart.
    + exact HChild.
  - destruct (IH (start F x) (StartReady (proj1 HFinish)))
      as [ChildInverse HChild].
    exists (f2f3_start_form F E D ChildInverse).
    apply inverse_finish.
    + exact HFinish.
    + exact HChild.
  - destruct (IH (start F x) (StartReady (proj1 HPair)))
      as [StartInverse HStartInverse].
    destruct (IH (finish F x) (FinishReady (proj2 HPair)))
      as [FinishInverse HFinishInverse].
    exists (form F FinishInverse StartInverse).
    apply inverse_pair.
    + exact HPair.
    + exact HStartInverse.
    + exact HFinishInverse.
Qed.

Theorem recursive_inverse_functional
    (F : Foundation)
    (E : F2F3OneSidedExistence F)
    (D : F2F3RecursiveFormation F E) :
    forall x y z : Link F,
      RecursiveInverse F E D x y ->
      RecursiveInverse F E D x z ->
      y = z.
Proof.
  intros x y z Left.
  revert z.
  induction Left as
    [|x childInverse HStart HChild ChildIH
     |x childInverse HFinish HChild ChildIH
     |x startInverse finishInverse HPair HStartChild StartIH HFinishChild FinishIH].
  - intros z Right.
    destruct Right as
      [|x child HStart HChild
       |x child HFinish HChild
       |x s f HPair Hs Hf].
    + reflexivity.
    + exact (False_rect _ ((proj2 HStart) (proj2 (root_full_self F)))).
    + exact (False_rect _ ((proj1 HFinish) (proj1 (root_full_self F)))).
    + exact (False_rect _ ((proj1 HPair) (proj1 (root_full_self F)))).
  - intros z Right.
    destruct Right as
      [|x child HStart2 HChild2
       |x child HFinish2 HChild2
       |x s f HPair2 Hs2 Hf2].
    + exact (False_rect _ ((proj2 HStart) (proj2 (root_full_self F)))).
    + exact (f_equal (f2f3_finish_form F E D) (ChildIH child HChild2)).
    + exact (False_rect _ ((proj1 HFinish2) (proj1 HStart))).
    + exact (False_rect _ ((proj1 HPair2) (proj1 HStart))).
  - intros z Right.
    destruct Right as
      [|x child HStart2 HChild2
       |x child HFinish2 HChild2
       |x s f HPair2 Hs2 Hf2].
    + exact (False_rect _ ((proj1 HFinish) (proj1 (root_full_self F)))).
    + exact (False_rect _ ((proj1 HFinish) (proj1 HStart2))).
    + exact (f_equal (f2f3_start_form F E D) (ChildIH child HChild2)).
    + exact (False_rect _ ((proj2 HPair2) (proj2 HFinish))).
  - intros z Right.
    destruct Right as
      [|x child HStart2 HChild2
       |x child HFinish2 HChild2
       |x s f HPair2 Hs2 Hf2].
    + exact (False_rect _ ((proj1 HPair) (proj1 (root_full_self F)))).
    + exact (False_rect _ ((proj1 HPair) (proj1 HStart2))).
    + exact (False_rect _ ((proj2 HPair) (proj2 HFinish2))).
    + pose proof (StartIH s Hs2) as HS.
      pose proof (FinishIH f Hf2) as HF.
      subst s.
      subst f.
      reflexivity.
Qed.

(* INV-01 — recursive Link inversion has exactly one result on the declared
   finite recursive domain with explicit local-decision evidence. *)
Theorem INV_01_recursive_inversion
    (F : Foundation)
    (A1 : A1RecursiveSeparation F)
    (N : F2F3Normalization F (FND_02_unique_root F A1))
    (E : F2F3OneSidedExistence F)
    (D : F2F3RecursiveFormation F E)
    (x : Link F) :
    InversionReady F x ->
    exists y : Link F,
      RecursiveInverse F E D x y /\
      forall z : Link F,
        RecursiveInverse F E D x z ->
        z = y.
Proof.
  intros Ready.
  destruct (recursive_inverse_exists F A1 N E D x Ready) as [y Hy].
  exists y.
  split.
  - exact Hy.
  - intros z Hz.
    symmetry.
    apply (recursive_inverse_functional F E D x y z).
    + exact Hy.
    + exact Hz.
Qed.
