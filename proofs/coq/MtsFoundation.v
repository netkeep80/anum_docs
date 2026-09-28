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


(* Declared finite recursive domain used by structural inversion.

   Historical F2/F3 forms START(F) and END(F) are available for arbitrary
   grounded F. These are proof-level constructors over the one Link-forming
   primitive, not ontology kinds. *)
Record RecursiveInversionDomain
    (F : Foundation)
    (E : F2F3OneSidedExistence F) : Type := {
  recursive_start_form : Link F -> Link F;
  recursive_end_form : Link F -> Link F;

  recursive_start_equation :
    forall a : Link F,
      recursive_start_form a =
      form F (recursive_start_form a) a;

  recursive_end_equation :
    forall a : Link F,
      recursive_end_form a =
      form F a (recursive_end_form a);

  recursive_start_root_compat :
    recursive_start_form (R F) = f2f3_start_root F E;

  recursive_end_root_compat :
    recursive_end_form (R F) = f2f3_finish_root F E;

  recursive_local_decision :
    forall x : Link F,
      Grounded F x ->
      LocalSelfDecision F x
}.

Lemma recursive_start_start
    (F : Foundation)
    (E : F2F3OneSidedExistence F)
    (D : RecursiveInversionDomain F E)
    (a : Link F) :
    start F (recursive_start_form F E D a) =
    recursive_start_form F E D a.
Proof.
  pose proof
    (f_equal (start F) (recursive_start_equation F E D a)) as H.
  rewrite (form_start F (recursive_start_form F E D a) a) in H.
  exact H.
Qed.

Lemma recursive_start_finish
    (F : Foundation)
    (E : F2F3OneSidedExistence F)
    (D : RecursiveInversionDomain F E)
    (a : Link F) :
    finish F (recursive_start_form F E D a) = a.
Proof.
  pose proof
    (f_equal (finish F) (recursive_start_equation F E D a)) as H.
  rewrite (form_finish F (recursive_start_form F E D a) a) in H.
  exact H.
Qed.

Lemma recursive_end_start
    (F : Foundation)
    (E : F2F3OneSidedExistence F)
    (D : RecursiveInversionDomain F E)
    (a : Link F) :
    start F (recursive_end_form F E D a) = a.
Proof.
  pose proof
    (f_equal (start F) (recursive_end_equation F E D a)) as H.
  rewrite (form_start F a (recursive_end_form F E D a)) in H.
  exact H.
Qed.

Lemma recursive_end_finish
    (F : Foundation)
    (E : F2F3OneSidedExistence F)
    (D : RecursiveInversionDomain F E)
    (a : Link F) :
    finish F (recursive_end_form F E D a) =
    recursive_end_form F E D a.
Proof.
  pose proof
    (f_equal (finish F) (recursive_end_equation F E D a)) as H.
  rewrite (form_finish F a (recursive_end_form F E D a)) in H.
  exact H.
Qed.

Lemma recursive_start_grounded
    (F : Foundation)
    (E : F2F3OneSidedExistence F)
    (D : RecursiveInversionDomain F E)
    (a : Link F) :
    Grounded F a ->
    Grounded F (recursive_start_form F E D a).
Proof.
  intros Ga.
  apply grounded_node.
  - intros Hnot.
    exact (False_rect _ (Hnot (recursive_start_start F E D a))).
  - intros Hnot.
    rewrite (recursive_start_finish F E D a).
    exact Ga.
Qed.

Lemma recursive_end_grounded
    (F : Foundation)
    (E : F2F3OneSidedExistence F)
    (D : RecursiveInversionDomain F E)
    (a : Link F) :
    Grounded F a ->
    Grounded F (recursive_end_form F E D a).
Proof.
  intros Ga.
  apply grounded_node.
  - intros Hnot.
    rewrite (recursive_end_start F E D a).
    exact Ga.
  - intros Hnot.
    exact (False_rect _ (Hnot (recursive_end_finish F E D a))).
Qed.

Lemma recursive_pair_grounded
    (F : Foundation)
    (a b : Link F) :
    Grounded F a ->
    Grounded F b ->
    Grounded F (form F a b).
Proof.
  intros Ga Gb.
  apply grounded_node.
  - intros Hnot.
    rewrite (form_start F a b).
    exact Ga.
  - intros Hnot.
    rewrite (form_finish F a b).
    exact Gb.
Qed.

(* Prop-valued graph of recursive structural inversion.

   This is not a four-case ontology datatype.  These are proof rules for the
   structural action of J itself. *)
Inductive RecursiveInversion
    (F : Foundation)
    (E : F2F3OneSidedExistence F)
    (D : RecursiveInversionDomain F E) :
    Link F -> Link F -> Prop :=
| recursive_inversion_root :
    RecursiveInversion F E D (R F) (R F)
| recursive_inversion_start :
    forall x childInverse : Link F,
      StartOnly F x ->
      RecursiveInversion F E D (finish F x) childInverse ->
      RecursiveInversion F E D x
        (recursive_end_form F E D childInverse)
| recursive_inversion_finish :
    forall x childInverse : Link F,
      FinishOnly F x ->
      RecursiveInversion F E D (start F x) childInverse ->
      RecursiveInversion F E D x
        (recursive_start_form F E D childInverse)
| recursive_inversion_pair :
    forall x inverseFinish inverseStart : Link F,
      PairLocal F x ->
      RecursiveInversion F E D (finish F x) inverseFinish ->
      RecursiveInversion F E D (start F x) inverseStart ->
      RecursiveInversion F E D x
        (form F inverseFinish inverseStart).

Lemma recursive_inversion_image_grounded
    (F : Foundation)
    (E : F2F3OneSidedExistence F)
    (D : RecursiveInversionDomain F E)
    (x y : Link F) :
    RecursiveInversion F E D x y ->
    Grounded F y.
Proof.
  intros H.
  induction H.
  - apply grounded_of_full_self.
    apply root_full_self.
  - apply recursive_end_grounded.
    exact IHRecursiveInversion.
  - apply recursive_start_grounded.
    exact IHRecursiveInversion.
  - apply recursive_pair_grounded.
    + exact IHRecursiveInversion1.
    + exact IHRecursiveInversion2.
Qed.

(* INV-01 totality on the declared finite recursive domain.

   The proof recurses only through non-self poles supplied by finite Grounded
   evidence.  The local four-way split is imported from FND-01; the fully self
   case is identified with ROOT by FND-02. *)
Theorem INV_01_recursive_inversion_total
    (F : Foundation)
    (A1 : A1RecursiveSeparation F)
    (N : F2F3Normalization F (FND_02_unique_root F A1))
    (E : F2F3OneSidedExistence F)
    (D : RecursiveInversionDomain F E)
    (x : Link F) :
    Grounded F x ->
    exists y : Link F, RecursiveInversion F E D x y.
Proof.
  intros G.
  induction G as [x StartStep IHStart FinishStep IHFinish].
  pose proof
    (recursive_local_decision F E D x
      (grounded_node F x StartStep FinishStep)) as Decision.
  pose proof
    (FND_01_local_partition F A1 N x Decision) as Partition.
  destruct Partition as [Cases _].
  destruct Cases as [HFull | [HStart | [HFinish | HPair]]].
  - pose proof (FND_02_unique_root F A1 x HFull) as HRoot.
    subst x.
    exists (R F).
    apply recursive_inversion_root.
  - destruct (IHFinish (proj2 HStart)) as [childInverse HChild].
    exists (recursive_end_form F E D childInverse).
    apply recursive_inversion_start.
    + exact HStart.
    + exact HChild.
  - destruct (IHStart (proj1 HFinish)) as [childInverse HChild].
    exists (recursive_start_form F E D childInverse).
    apply recursive_inversion_finish.
    + exact HFinish.
    + exact HChild.
  - destruct (IHFinish (proj2 HPair)) as [inverseFinish HFinishInv].
    destruct (IHStart (proj1 HPair)) as [inverseStart HStartInv].
    exists (form F inverseFinish inverseStart).
    apply recursive_inversion_pair.
    + exact HPair.
    + exact HFinishInv.
    + exact HStartInv.
Qed.


Lemma recursive_full_start_disjoint
    (F : Foundation)
    (x : Link F) :
    FullSelf F x ->
    StartOnly F x ->
    False.
Proof.
  intros HFull HStart.
  exact ((proj2 HStart) (proj2 HFull)).
Qed.

Lemma recursive_full_finish_disjoint
    (F : Foundation)
    (x : Link F) :
    FullSelf F x ->
    FinishOnly F x ->
    False.
Proof.
  intros HFull HFinish.
  exact ((proj1 HFinish) (proj1 HFull)).
Qed.

Lemma recursive_full_pair_disjoint
    (F : Foundation)
    (x : Link F) :
    FullSelf F x ->
    PairLocal F x ->
    False.
Proof.
  intros HFull HPair.
  exact ((proj1 HPair) (proj1 HFull)).
Qed.

Lemma recursive_start_finish_disjoint
    (F : Foundation)
    (x : Link F) :
    StartOnly F x ->
    FinishOnly F x ->
    False.
Proof.
  intros HStart HFinish.
  exact ((proj1 HFinish) (proj1 HStart)).
Qed.

Lemma recursive_start_pair_disjoint
    (F : Foundation)
    (x : Link F) :
    StartOnly F x ->
    PairLocal F x ->
    False.
Proof.
  intros HStart HPair.
  exact ((proj1 HPair) (proj1 HStart)).
Qed.

Lemma recursive_finish_pair_disjoint
    (F : Foundation)
    (x : Link F) :
    FinishOnly F x ->
    PairLocal F x ->
    False.
Proof.
  intros HFinish HPair.
  exact ((proj2 HPair) (proj2 HFinish)).
Qed.

(* Relational spelling of J(A -> B) = J(B) -> J(A), including the
   self-incidence cases where one recursively inverted pole is the current
   inverse Link itself. *)
Theorem INV_01_recursive_pole_reversal
    (F : Foundation)
    (E : F2F3OneSidedExistence F)
    (D : RecursiveInversionDomain F E)
    (x y : Link F) :
    RecursiveInversion F E D x y ->
    exists inverseFinish inverseStart : Link F,
      RecursiveInversion F E D (finish F x) inverseFinish /\
      RecursiveInversion F E D (start F x) inverseStart /\
      y = form F inverseFinish inverseStart.
Proof.
  intros H.
  destruct H as
    [ | x childInverse HStart HChild
      | x childInverse HFinish HChild
      | x inverseFinish inverseStart HPair HFinishInv HStartInv ].
  - exists (R F).
    exists (R F).
    split.
    + rewrite (proj2 (root_full_self F)).
      apply recursive_inversion_root.
    + split.
      * rewrite (proj1 (root_full_self F)).
        apply recursive_inversion_root.
      * symmetry.
        apply root_self.
  - exists childInverse.
    exists (recursive_end_form F E D childInverse).
    split.
    + exact HChild.
    + split.
      * rewrite (proj1 HStart).
        apply recursive_inversion_start.
        -- exact HStart.
        -- exact HChild.
      * apply recursive_end_equation.
  - exists (recursive_start_form F E D childInverse).
    exists childInverse.
    split.
    + rewrite (proj2 HFinish).
      apply recursive_inversion_finish.
      * exact HFinish.
      * exact HChild.
    + split.
      * exact HChild.
      * apply recursive_start_equation.
  - exists inverseFinish.
    exists inverseStart.
    split.
    + exact HFinishInv.
    + split.
      * exact HStartInv.
      * reflexivity.
Qed.

(* Functional uniqueness of the structural inversion graph. *)
Theorem recursive_inversion_functional
    (F : Foundation)
    (E : F2F3OneSidedExistence F)
    (D : RecursiveInversionDomain F E) :
    forall x y z : Link F,
      RecursiveInversion F E D x y ->
      RecursiveInversion F E D x z ->
      y = z.
Proof.
  intros x y z Hy.
  revert z.
  induction Hy; intros z Hz.
  - inversion Hz; subst.
    + reflexivity.
    + exfalso.
      eapply recursive_full_start_disjoint.
      * apply root_full_self.
      * eassumption.
    + exfalso.
      eapply recursive_full_finish_disjoint.
      * apply root_full_self.
      * eassumption.
    + exfalso.
      eapply recursive_full_pair_disjoint.
      * apply root_full_self.
      * eassumption.
  - inversion Hz; subst.
    + exfalso.
      eapply recursive_full_start_disjoint.
      * apply root_full_self.
      * exact H.
    + apply f_equal.
      apply IHHy.
      assumption.
    + exfalso.
      eapply recursive_start_finish_disjoint.
      * exact H.
      * eassumption.
    + exfalso.
      eapply recursive_start_pair_disjoint.
      * exact H.
      * eassumption.
  - inversion Hz; subst.
    + exfalso.
      eapply recursive_full_finish_disjoint.
      * apply root_full_self.
      * exact H.
    + exfalso.
      eapply recursive_start_finish_disjoint.
      * eassumption.
      * exact H.
    + apply f_equal.
      apply IHHy.
      assumption.
    + exfalso.
      eapply recursive_finish_pair_disjoint.
      * exact H.
      * eassumption.
  - inversion Hz; subst.
    + exfalso.
      eapply recursive_full_pair_disjoint.
      * apply root_full_self.
      * exact H.
    + exfalso.
      eapply recursive_start_pair_disjoint.
      * eassumption.
      * exact H.
    + exfalso.
      eapply recursive_finish_pair_disjoint.
      * eassumption.
      * exact H.
    + assert (HF : inverseFinish = inverseFinish0).
      {
        apply IHHy1.
        assumption.
      }
      assert (HS : inverseStart = inverseStart0).
      {
        apply IHHy2.
        assumption.
      }
      rewrite HF, HS.
      reflexivity.
Qed.

(* INV-01 capstone: J is a unique total graph on every Grounded Link in the
   declared finite recursive domain.  No choice principle is required. *)
Theorem INV_01_recursive_inversion_unique_total
    (F : Foundation)
    (A1 : A1RecursiveSeparation F)
    (N : F2F3Normalization F (FND_02_unique_root F A1))
    (E : F2F3OneSidedExistence F)
    (D : RecursiveInversionDomain F E)
    (x : Link F) :
    Grounded F x ->
    exists y : Link F,
      RecursiveInversion F E D x y /\
      forall z : Link F,
        RecursiveInversion F E D x z ->
        z = y.
Proof.
  intros G.
  destruct (INV_01_recursive_inversion_total F A1 N E D x G)
    as [y Hy].
  exists y.
  split.
  - exact Hy.
  - intros z Hz.
    symmetry.
    apply (recursive_inversion_functional F E D x y z).
    + exact Hy.
    + exact Hz.
Qed.


(* Finite recursive distinction cannot distinguish a Link from itself. *)
Lemma distinguishable_same_false
    (F : Foundation) :
    forall x y : Link F,
      Distinguishable F x y ->
      x = y ->
      False.
Proof.
  intros x y H.
  induction H as
    [x y Hs Hn
    |x y Hn Hs
    |x y Hs Hn
    |x y Hn Hs
    |x y Hnx Hny Hchild IH
    |x y Hnx Hny Hchild IH];
    intro Heq; subst y.
  - exact (Hn Hs).
  - exact (Hn Hs).
  - exact (Hn Hs).
  - exact (Hn Hs).
  - apply IH. reflexivity.
  - apply IH. reflexivity.
Qed.

Lemma distinguishable_irreflexive
    (F : Foundation)
    (x : Link F) :
    ~ Distinguishable F x x.
Proof.
  intros H.
  exact (distinguishable_same_false F x x H eq_refl).
Qed.

Lemma grounded_start_of_nonself
    (F : Foundation)
    (x : Link F) :
    Grounded F x ->
    start F x <> x ->
    Grounded F (start F x).
Proof.
  intros G Hnot.
  inversion G as [x0 StartStep FinishStep].
  exact (StartStep Hnot).
Qed.

Lemma grounded_finish_of_nonself
    (F : Foundation)
    (x : Link F) :
    Grounded F x ->
    finish F x <> x ->
    Grounded F (finish F x).
Proof.
  intros G Hnot.
  inversion G as [x0 StartStep FinishStep].
  exact (FinishStep Hnot).
Qed.

(* Generic F2/F3 START(F) is a proper one-sided form. *)
Theorem recursive_start_form_pattern
    (F : Foundation)
    (A1 : A1RecursiveSeparation F)
    (E : F2F3OneSidedExistence F)
    (D : RecursiveInversionDomain F E)
    (a : Link F) :
    StartOnly F (recursive_start_form F E D a).
Proof.
  unfold StartOnly, StartSelf, FinishSelf.
  split.
  - apply recursive_start_start.
  - intros Hfinish.
    assert (
      Hfull :
      FullSelf F (recursive_start_form F E D a)
    ).
    {
      split.
      - apply recursive_start_start.
      - exact Hfinish.
    }
    pose proof
      (FND_02_unique_root F A1 (recursive_start_form F E D a) Hfull)
      as Hroot.
    assert (HaRoot : a = R F).
    {
      transitivity (finish F (recursive_start_form F E D a)).
      - symmetry. apply recursive_start_finish.
      - rewrite Hroot.
        exact (proj2 (root_full_self F)).
    }
    apply (f2f3_start_root_ne_root F E).
    rewrite <- (recursive_start_root_compat F E D).
    rewrite HaRoot in Hroot.
    exact Hroot.
Qed.

(* Generic F2/F3 END(F) is a proper one-sided form. *)
Theorem recursive_end_form_pattern
    (F : Foundation)
    (A1 : A1RecursiveSeparation F)
    (E : F2F3OneSidedExistence F)
    (D : RecursiveInversionDomain F E)
    (a : Link F) :
    FinishOnly F (recursive_end_form F E D a).
Proof.
  unfold FinishOnly, StartSelf, FinishSelf.
  split.
  - intros Hstart.
    assert (
      Hfull :
      FullSelf F (recursive_end_form F E D a)
    ).
    {
      split.
      - exact Hstart.
      - apply recursive_end_finish.
    }
    pose proof
      (FND_02_unique_root F A1 (recursive_end_form F E D a) Hfull)
      as Hroot.
    assert (HaRoot : a = R F).
    {
      transitivity (start F (recursive_end_form F E D a)).
      - symmetry. apply recursive_end_start.
      - rewrite Hroot.
        exact (proj1 (root_full_self F)).
    }
    apply (f2f3_finish_root_ne_root F E).
    rewrite <- (recursive_end_root_compat F E D).
    rewrite HaRoot in Hroot.
    exact Hroot.
  - apply recursive_end_finish.
Qed.

(* A grounded StartOnly Link is the unique semantic START of its external
   finish pole. *)
Theorem recursive_start_form_canonical
    (F : Foundation)
    (A1 : A1RecursiveSeparation F)
    (E : F2F3OneSidedExistence F)
    (D : RecursiveInversionDomain F E)
    (x : Link F) :
    Grounded F x ->
    StartOnly F x ->
    x = recursive_start_form F E D (finish F x).
Proof.
  intros G Hstart.
  pose proof
    (grounded_finish_of_nonself F x G (proj2 Hstart))
    as Gfinish.
  pose proof
    (recursive_start_grounded F E D (finish F x) Gfinish)
    as Gcanonical.
  pose proof
    (recursive_start_form_pattern F A1 E D (finish F x))
    as Hcanonical.
  apply (A1 x (recursive_start_form F E D (finish F x)) G Gcanonical).
  intros Hdist.
  destruct Hdist as
    [a b Hsa Hnb
    |a b Hna Hsb
    |a b Hfa Hnfb
    |a b Hnfa Hfb
    |a b Hna Hnb Hchild
    |a b Hnfa Hnfb Hchild].
  - exact (Hnb (proj1 Hcanonical)).
  - exact (Hna (proj1 Hstart)).
  - exact ((proj2 Hstart) Hfa).
  - exact ((proj2 Hcanonical) Hfb).
  - exact (Hna (proj1 Hstart)).
  - rewrite (recursive_start_finish F E D (finish F x)) in Hchild.
    exact (distinguishable_irreflexive F (finish F x) Hchild).
Qed.

(* A grounded FinishOnly Link is the unique semantic END of its external
   start pole. *)
Theorem recursive_end_form_canonical
    (F : Foundation)
    (A1 : A1RecursiveSeparation F)
    (E : F2F3OneSidedExistence F)
    (D : RecursiveInversionDomain F E)
    (x : Link F) :
    Grounded F x ->
    FinishOnly F x ->
    x = recursive_end_form F E D (start F x).
Proof.
  intros G Hfinish.
  pose proof
    (grounded_start_of_nonself F x G (proj1 Hfinish))
    as Gstart.
  pose proof
    (recursive_end_grounded F E D (start F x) Gstart)
    as Gcanonical.
  pose proof
    (recursive_end_form_pattern F A1 E D (start F x))
    as Hcanonical.
  apply (A1 x (recursive_end_form F E D (start F x)) G Gcanonical).
  intros Hdist.
  destruct Hdist as
    [a b Hsa Hnb
    |a b Hna Hsb
    |a b Hfa Hnfb
    |a b Hnfa Hfb
    |a b Hna Hnb Hchild
    |a b Hnfa Hnfb Hchild].
  - exact ((proj1 Hfinish) Hsa).
  - exact ((proj1 Hcanonical) Hsb).
  - exact (Hnfb (proj2 Hcanonical)).
  - exact (Hnfa (proj2 Hfinish)).
  - rewrite (recursive_end_start F E D (start F x)) in Hchild.
    exact (distinguishable_irreflexive F (start F x) Hchild).
  - exact (Hnfa (proj2 Hfinish)).
Qed.

(* FND-13 entails reconstruction from the ordered poles.  This is downstream
   theorem use, not an extensionality/reconstruction axiom. *)
Theorem poles_recompose_after_fnd13
    (F : Foundation)
    (A1 : A1RecursiveSeparation F)
    (N : F2F3Normalization F (FND_02_unique_root F A1))
    (x : Link F) :
    form F (start F x) (finish F x) = x.
Proof.
  apply (proj2 (FND_13_identity_by_poles F A1 N
    (form F (start F x) (finish F x)) x)).
  split.
  - apply form_start.
  - apply form_finish.
Qed.


(* Every source admitted by the INV-01 graph is in the same finite Grounded
   domain. INV-02 therefore does not enlarge the domain of J. *)
Lemma recursive_inversion_source_grounded
    (F : Foundation)
    (E : F2F3OneSidedExistence F)
    (D : RecursiveInversionDomain F E) :
    forall x y : Link F,
      RecursiveInversion F E D x y ->
      Grounded F x.
Proof.
  intros x y H.
  induction H.
  - apply grounded_of_full_self.
    apply root_full_self.
  - apply grounded_node.
    + intros Hnot.
      exact (False_rect _ (Hnot (proj1 H))).
    + intros Hnot.
      exact IHRecursiveInversion.
  - apply grounded_node.
    + intros Hnot.
      exact IHRecursiveInversion.
    + intros Hnot.
      exact (False_rect _ (Hnot (proj2 H))).
  - apply grounded_node.
    + intros Hnot.
      exact IHRecursiveInversion2.
    + intros Hnot.
      exact IHRecursiveInversion1.
Qed.

(* INV-02 relational core: applying the same structural inversion graph twice
   returns the original semantic Link on exactly the INV-01 domain. *)
Theorem INV_02_recursive_inversion_involutive
    (F : Foundation)
    (A1 : A1RecursiveSeparation F)
    (N : F2F3Normalization F (FND_02_unique_root F A1))
    (E : F2F3OneSidedExistence F)
    (D : RecursiveInversionDomain F E) :
    forall x y z : Link F,
      RecursiveInversion F E D x y ->
      RecursiveInversion F E D y z ->
      z = x.
Proof.
  intros x y z Hxy.
  revert z.
  induction Hxy as
    [
    |x childInverse HStart HChild IH
    |x childInverse HFinish HChild IH
    |x inverseFinish inverseStart HPair HFinishInv IHFinish HStartInv IHStart
    ];
    intros z Hyz.
  - inversion Hyz as
      [|y0 secondChild HYStart HSecond
       |y0 secondChild HYFinish HSecond
       |y0 secondFinish secondStart HYPair HSecondFinish HSecondStart];
      subst.
    + reflexivity.
    + exfalso.
      eapply recursive_full_start_disjoint.
      * apply root_full_self.
      * exact HYStart.
    + exfalso.
      eapply recursive_full_finish_disjoint.
      * apply root_full_self.
      * exact HYFinish.
    + exfalso.
      eapply recursive_full_pair_disjoint.
      * apply root_full_self.
      * exact HYPair.
  - pose proof
      (recursive_end_form_pattern F A1 E D childInverse)
      as HYFinishPattern.
    assert (GX : Grounded F x).
    {
      apply grounded_node.
      - intros Hnot.
        exact (False_rect _ (Hnot (proj1 HStart))).
      - intros Hnot.
        eapply recursive_inversion_source_grounded.
        exact HChild.
    }
    inversion Hyz as
      [|y0 secondChild HYStart HSecond
       |y0 secondChild HYFinish HSecond
       |y0 secondFinish secondStart HYPair HSecondFinish HSecondStart];
      subst.
    + exfalso.
      eapply recursive_full_finish_disjoint.
      * apply root_full_self.
      * exact HYFinishPattern.
    + exfalso.
      eapply recursive_start_finish_disjoint.
      * exact HYStart.
      * exact HYFinishPattern.
    + assert (
        HSecond' :
        RecursiveInversion F E D childInverse secondChild
      ).
      {
        rewrite <- (recursive_end_start F E D childInverse).
        exact HSecond.
      }
      pose proof (IH secondChild HSecond') as HSecondEq.
      rewrite HSecondEq.
      symmetry.
      apply recursive_start_form_canonical.
      * exact GX.
      * exact HStart.
    + exfalso.
      eapply recursive_finish_pair_disjoint.
      * exact HYFinishPattern.
      * exact HYPair.
  - pose proof
      (recursive_start_form_pattern F A1 E D childInverse)
      as HYStartPattern.
    assert (GX : Grounded F x).
    {
      apply grounded_node.
      - intros Hnot.
        eapply recursive_inversion_source_grounded.
        exact HChild.
      - intros Hnot.
        exact (False_rect _ (Hnot (proj2 HFinish))).
    }
    inversion Hyz as
      [|y0 secondChild HYStart HSecond
       |y0 secondChild HYFinish HSecond
       |y0 secondFinish secondStart HYPair HSecondFinish HSecondStart];
      subst.
    + exfalso.
      eapply recursive_full_start_disjoint.
      * apply root_full_self.
      * exact HYStartPattern.
    + assert (
        HSecond' :
        RecursiveInversion F E D childInverse secondChild
      ).
      {
        rewrite <- (recursive_start_finish F E D childInverse).
        exact HSecond.
      }
      pose proof (IH secondChild HSecond') as HSecondEq.
      rewrite HSecondEq.
      symmetry.
      apply recursive_end_form_canonical.
      * exact GX.
      * exact HFinish.
    + exfalso.
      eapply recursive_start_finish_disjoint.
      * exact HYStartPattern.
      * exact HYFinish.
    + exfalso.
      eapply recursive_start_pair_disjoint.
      * exact HYStartPattern.
      * exact HYPair.
  - destruct
      (INV_01_recursive_pole_reversal
        F E D
        (form F inverseFinish inverseStart)
        z
        Hyz)
      as
        [secondFinish
          [secondStart
            [HSecondFinish
              [HSecondStart HzForm]]]].
    assert (
      HSecondFinish' :
      RecursiveInversion F E D inverseStart secondFinish
    ).
    {
      rewrite <- (form_finish F inverseFinish inverseStart).
      exact HSecondFinish.
    }
    assert (
      HSecondStart' :
      RecursiveInversion F E D inverseFinish secondStart
    ).
    {
      rewrite <- (form_start F inverseFinish inverseStart).
      exact HSecondStart.
    }
    pose proof (IHStart secondFinish HSecondFinish') as HFinishEq.
    pose proof (IHFinish secondStart HSecondStart') as HStartEq.
    transitivity (form F secondFinish secondStart).
    + exact HzForm.
    + rewrite HFinishEq, HStartEq.
      apply poles_recompose_after_fnd13.
Qed.

(* Function-level INV-02 witness without choosing a host function: INV-01
   totality yields both graph images and relational involution identifies the
   second image with the original Link. *)
Theorem INV_02_unique_total_involution
    (F : Foundation)
    (A1 : A1RecursiveSeparation F)
    (N : F2F3Normalization F (FND_02_unique_root F A1))
    (E : F2F3OneSidedExistence F)
    (D : RecursiveInversionDomain F E)
    (x : Link F) :
    Grounded F x ->
    exists y z : Link F,
      RecursiveInversion F E D x y /\
      RecursiveInversion F E D y z /\
      z = x.
Proof.
  intros GX.
  destruct (INV_01_recursive_inversion_total F A1 N E D x GX)
    as [y Hxy].
  pose proof
    (recursive_inversion_image_grounded F E D x y Hxy)
    as GY.
  destruct (INV_01_recursive_inversion_total F A1 N E D y GY)
    as [z Hyz].
  exists y.
  exists z.
  split.
  - exact Hxy.
  - split.
    + exact Hyz.
    + apply (INV_02_recursive_inversion_involutive F A1 N E D x y z).
      * exact Hxy.
      * exact Hyz.
Qed.
