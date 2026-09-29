(*
EXTERNAL PROJECTION BOUNDARY

This file is a prover-side projection of MTS into the Rocq metalanguage.
Rocq vocabulary such as Type, Prop, Record, Inductive, and Theorem is
verification machinery only; it is not MTS ontology, native notation, or
semantic authority.

EXTERNAL THEORY PROJECTION MANIFEST

HOST FOUNDATION:
- Rocq Calculus of Inductive Constructions / dependent type-theoretic kernel.

USED EXTERNAL LOGIC / PROOF METHODS:
- constructive propositions and equality;
- inductive predicates and structural induction;
- relational encoding of Link structure and RecursiveInversion.

ADDITIONAL EXTERNAL MATHEMATICAL THEORY:
- elementary group theory (Z2), used only to describe the same/opposite
  relative transport composition table in CTX-03 support.

The relational encoding and Z2 description are external verification tools,
not MTS ontology or semantic authority.

Any additional external theory introduced below must be marked locally with:
  EXTERNAL THEORY PROJECTION: <theory-name>

External proof constructs may expose hidden assumptions or falsifiers, but
they must not leak back into MTS as ontology or axioms unless MTS derives the
corresponding structure internally.
*)

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
  forall x : Link F, FullSelf F x -> x = R F.

(* Exact finite grounded normalization premise used by accepted FND-13. *)
Record F2F3GroundedNormalization (F : Foundation) : Type := {
  GroundedNormalForm : Type;
  grounded_compose_nf :
    GroundedNormalForm -> GroundedNormalForm -> GroundedNormalForm;
  grounded_normal_form : Link F -> GroundedNormalForm;

  grounded_normal_form_equation :
    forall x : Link F,
      Grounded F x ->
      grounded_normal_form x =
      grounded_compose_nf
        (grounded_normal_form (start F x))
        (grounded_normal_form (finish F x));

  grounded_normal_form_complete :
    forall x y : Link F,
      Grounded F x ->
      Grounded F y ->
      grounded_normal_form x = grounded_normal_form y ->
      x = y
}.

(* Stronger global normalization completeness retained only for downstream
   proof slices that explicitly quantify over arbitrary Links.  It is not
   indexed by FND-02 because its fields do not consume unique ROOT. *)
Record F2F3Normalization (F : Foundation) : Type := {
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

(* Constructor injectivity follows directly from primitive projection laws.
   It is weaker than arbitrary-Link extensionality. *)
Theorem fnd13_form_injective
    (F : Foundation)
    (a b c d : Link F) :
    form F a b = form F c d <->
    a = c /\ b = d.
Proof.
  split.
  - intros H.
    split.
    + transitivity (start F (form F a b)).
      * symmetry. apply form_start.
      * transitivity (start F (form F c d)).
        -- apply f_equal. exact H.
        -- apply form_start.
    + transitivity (finish F (form F a b)).
      * symmetry. apply form_finish.
      * transitivity (finish F (form F c d)).
        -- apply f_equal. exact H.
        -- apply form_finish.
  - intros [Hac Hbd].
    subst c. subst d. reflexivity.
Qed.

(* FND-13 / historical A6 — ordered-pole identity on the accepted finite
   R-grounded semantic domain.  No FND-02 dependency is claimed here. *)
Theorem FND_13_identity_by_poles
    (F : Foundation)
    (N : F2F3GroundedNormalization F)
    (x y : Link F) :
    Grounded F x ->
    Grounded F y ->
    (x = y <->
      start F x = start F y /\
      finish F x = finish F y).
Proof.
  intros GX GY.
  split.
  - intros Hxy.
    subst y.
    split; reflexivity.
  - intros [Hs Hf].
    apply (grounded_normal_form_complete F N x y GX GY).
    rewrite (grounded_normal_form_equation F N x GX).
    rewrite (grounded_normal_form_equation F N y GY).
    rewrite Hs, Hf.
    reflexivity.
Qed.

(* Explicit stronger auxiliary theorem from global normalization completeness.
   This is not the accepted finite-grounded FND-13 domain statement. *)
Theorem global_identity_by_poles_from_complete_normalization
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
  - intros [Hs Hf].
    apply (normal_form_complete F N x y).
    rewrite (normal_form_equation F N x).
    rewrite (normal_form_equation F N y).
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
    (N : F2F3Normalization F)
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
        apply (proj2 (global_identity_by_poles_from_complete_normalization F N x y)).
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
    (N : F2F3Normalization F)
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
    (N : F2F3Normalization F)
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
    (N : F2F3Normalization F)
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

Lemma start_only_same_finish_not_distinguishable
    (F : Foundation)
    (x y : Link F) :
    StartOnly F x ->
    StartOnly F y ->
    finish F x = finish F y ->
    ~ Distinguishable F x y.
Proof.
  intros Hx Hy Hfinish Hdist.
  destruct Hx as [Hxs Hxnf].
  destruct Hy as [Hys Hynf].
  destruct Hdist as
    [a b Hsa Hnb
    |a b Hna Hsb
    |a b Hfa Hnfb
    |a b Hnfa Hfb
    |a b Hna Hnb Hchild
    |a b Hnfa Hnfb Hchild].
  - exact (Hnb Hys).
  - exact (Hna Hxs).
  - exact (Hxnf Hfa).
  - exact (Hynf Hfb).
  - exact (Hna Hxs).
  - eapply distinguishable_same_false.
    + exact Hchild.
    + exact Hfinish.
Qed.

Lemma finish_only_same_start_not_distinguishable
    (F : Foundation)
    (x y : Link F) :
    FinishOnly F x ->
    FinishOnly F y ->
    start F x = start F y ->
    ~ Distinguishable F x y.
Proof.
  intros Hx Hy Hstart Hdist.
  destruct Hx as [Hxns Hxf].
  destruct Hy as [Hyns Hyf].
  destruct Hdist as
    [a b Hsa Hnb
    |a b Hna Hsb
    |a b Hfa Hnfb
    |a b Hnfa Hfb
    |a b Hna Hnb Hchild
    |a b Hnfa Hnfb Hchild].
  - exact (Hxns Hsa).
  - exact (Hyns Hsb).
  - exact (Hnfb Hyf).
  - exact (Hnfa Hxf).
  - eapply distinguishable_same_false.
    + exact Hchild.
    + exact Hstart.
  - exact (Hnfa Hxf).
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
  apply start_only_same_finish_not_distinguishable.
  - exact Hstart.
  - exact Hcanonical.
  - symmetry.
    apply recursive_start_finish.
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
  apply finish_only_same_start_not_distinguishable.
  - exact Hfinish.
  - exact Hcanonical.
  - symmetry.
    apply recursive_end_start.
Qed.

(* The explicitly stronger global normalization-completeness premise entails
   reconstruction from ordered poles.  This auxiliary theorem is not
   attributed to the accepted finite-grounded FND-13 statement. *)
Theorem poles_recompose_from_global_normalization
    (F : Foundation)
    (A1 : A1RecursiveSeparation F)
    (N : F2F3Normalization F)
    (x : Link F) :
    form F (start F x) (finish F x) = x.
Proof.
  apply (proj2 (global_identity_by_poles_from_complete_normalization F N
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

(* A structural inverse whose source is StartOnly must use the INV-01 START
   rule.  This is elimination over the existing proof graph, not a new case
   classifier. *)
Lemma recursive_inversion_from_start_only
    (F : Foundation)
    (E : F2F3OneSidedExistence F)
    (D : RecursiveInversionDomain F E)
    (x y : Link F) :
    StartOnly F x ->
    RecursiveInversion F E D x y ->
    exists childInverse : Link F,
      RecursiveInversion F E D (finish F x) childInverse /\
      y = recursive_end_form F E D childInverse.
Proof.
  intros HStart H.
  inversion H as
    [|x0 childInverse HStart0 HChild
     |x0 childInverse HFinish0 HChild
     |x0 inverseFinish inverseStart HPair0 HFinishInv HStartInv];
    subst.
  - exfalso.
    eapply recursive_full_start_disjoint.
    + apply root_full_self.
    + exact HStart.
  - exists childInverse.
    split.
    + exact HChild.
    + reflexivity.
  - exfalso.
    eapply recursive_start_finish_disjoint.
    + exact HStart.
    + exact HFinish0.
  - exfalso.
    eapply recursive_start_pair_disjoint.
    + exact HStart.
    + exact HPair0.
Qed.

(* A structural inverse whose source is FinishOnly must use the INV-01 FINISH
   rule. *)
Lemma recursive_inversion_from_finish_only
    (F : Foundation)
    (E : F2F3OneSidedExistence F)
    (D : RecursiveInversionDomain F E)
    (x y : Link F) :
    FinishOnly F x ->
    RecursiveInversion F E D x y ->
    exists childInverse : Link F,
      RecursiveInversion F E D (start F x) childInverse /\
      y = recursive_start_form F E D childInverse.
Proof.
  intros HFinish H.
  inversion H as
    [|x0 childInverse HStart0 HChild
     |x0 childInverse HFinish0 HChild
     |x0 inverseFinish inverseStart HPair0 HFinishInv HStartInv];
    subst.
  - exfalso.
    eapply recursive_full_finish_disjoint.
    + apply root_full_self.
    + exact HFinish.
  - exfalso.
    eapply recursive_start_finish_disjoint.
    + exact HStart0.
    + exact HFinish.
  - exists childInverse.
    split.
    + exact HChild.
    + reflexivity.
  - exfalso.
    eapply recursive_finish_pair_disjoint.
    + exact HFinish.
    + exact HPair0.
Qed.

(* INV-02 relational core: applying the same structural inversion graph twice
   returns the original semantic Link on exactly the INV-01 domain. *)
Theorem INV_02_recursive_inversion_involutive
    (F : Foundation)
    (A1 : A1RecursiveSeparation F)
    (N : F2F3Normalization F)
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
    destruct
      (recursive_inversion_from_finish_only
        F E D
        (recursive_end_form F E D childInverse)
        z
        HYFinishPattern
        Hyz)
      as [secondChild [HSecond Hz]].
    assert (
      HSecond' :
      RecursiveInversion F E D childInverse secondChild
    ).
    {
      rewrite <- (recursive_end_start F E D childInverse).
      exact HSecond.
    }
    pose proof (IH secondChild HSecond') as HSecondEq.
    transitivity (recursive_start_form F E D secondChild).
    + exact Hz.
    + rewrite HSecondEq.
      symmetry.
      apply (recursive_start_form_canonical F A1 E D x).
      * exact GX.
      * exact HStart.
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
    destruct
      (recursive_inversion_from_start_only
        F E D
        (recursive_start_form F E D childInverse)
        z
        HYStartPattern
        Hyz)
      as [secondChild [HSecond Hz]].
    assert (
      HSecond' :
      RecursiveInversion F E D childInverse secondChild
    ).
    {
      rewrite <- (recursive_start_finish F E D childInverse).
      exact HSecond.
    }
    pose proof (IH secondChild HSecond') as HSecondEq.
    transitivity (recursive_end_form F E D secondChild).
    + exact Hz.
    + rewrite HSecondEq.
      symmetry.
      apply (recursive_end_form_canonical F A1 E D x).
      * exact GX.
      * exact HFinish.
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
      apply (poles_recompose_from_global_normalization F A1 N x).
Qed.

(* Function-level INV-02 witness without choosing a host function: INV-01
   totality yields both graph images and relational involution identifies the
   second image with the original Link. *)
Theorem INV_02_unique_total_involution
    (F : Foundation)
    (A1 : A1RecursiveSeparation F)
    (N : F2F3Normalization F)
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


(* INV-03: ROOT is the unique image of ROOT under the existing INV-01 graph. *)
Theorem INV_03_root_fixed
    (F : Foundation)
    (E : F2F3OneSidedExistence F)
    (D : RecursiveInversionDomain F E)
    (y : Link F) :
    RecursiveInversion F E D (R F) y ->
    y = R F.
Proof.
  intros H.
  apply (recursive_inversion_functional F E D (R F) y (R F)).
  - exact H.
  - apply recursive_inversion_root.
Qed.

(* INV-04, START side: proper START maps to proper END and cannot be
   identified with its image. *)
Theorem INV_04_start_to_finish
    (F : Foundation)
    (A1 : A1RecursiveSeparation F)
    (E : F2F3OneSidedExistence F)
    (D : RecursiveInversionDomain F E)
    (x y : Link F) :
    StartOnly F x ->
    RecursiveInversion F E D x y ->
    FinishOnly F y /\
    x <> y.
Proof.
  intros HStart Hxy.
  destruct
    (recursive_inversion_from_start_only F E D x y HStart Hxy)
    as [childInverse [HChild Hy]].
  subst y.
  pose proof
    (recursive_end_form_pattern F A1 E D childInverse)
    as HFinishImage.
  split.
  - exact HFinishImage.
  - intros Heq.
    assert (HFinishX : FinishOnly F x).
    {
      rewrite Heq.
      exact HFinishImage.
    }
    eapply recursive_start_finish_disjoint.
    + exact HStart.
    + exact HFinishX.
Qed.

(* INV-04, END side: proper END maps to proper START and cannot be
   identified with its image. *)
Theorem INV_04_finish_to_start
    (F : Foundation)
    (A1 : A1RecursiveSeparation F)
    (E : F2F3OneSidedExistence F)
    (D : RecursiveInversionDomain F E)
    (x y : Link F) :
    FinishOnly F x ->
    RecursiveInversion F E D x y ->
    StartOnly F y /\
    x <> y.
Proof.
  intros HFinish Hxy.
  destruct
    (recursive_inversion_from_finish_only F E D x y HFinish Hxy)
    as [childInverse [HChild Hy]].
  subst y.
  pose proof
    (recursive_start_form_pattern F A1 E D childInverse)
    as HStartImage.
  split.
  - exact HStartImage.
  - intros Heq.
    assert (HStartX : StartOnly F x).
    {
      rewrite Heq.
      exact HStartImage.
    }
    eapply recursive_start_finish_disjoint.
    + exact HStartX.
    + exact HFinish.
Qed.

(* INV-05: PAIR remains PAIR and its poles are recursively exchanged.
   INV-02 is used only as a derived consequence of the same INV-01
   assumptions to rule out collapse of the target into ROOT/START/END. *)
Theorem INV_05_pair_preserved_and_reversed
    (F : Foundation)
    (A1 : A1RecursiveSeparation F)
    (N : F2F3Normalization F)
    (E : F2F3OneSidedExistence F)
    (D : RecursiveInversionDomain F E)
    (x y : Link F) :
    PairLocal F x ->
    RecursiveInversion F E D x y ->
    PairLocal F y /\
    exists inverseFinish inverseStart : Link F,
      RecursiveInversion F E D (finish F x) inverseFinish /\
      RecursiveInversion F E D (start F x) inverseStart /\
      y = form F inverseFinish inverseStart.
Proof.
  intros HPairX Hxy.
  pose proof
    (recursive_inversion_image_grounded F E D x y Hxy)
    as GY.
  destruct (INV_01_recursive_inversion_total F A1 N E D y GY)
    as [z Hyz].
  pose proof
    (INV_02_recursive_inversion_involutive F A1 N E D x y z Hxy Hyz)
    as Hzx.
  pose proof
    (recursive_local_decision F E D y GY)
    as Decision.
  pose proof
    (FND_01_local_partition F A1 N y Decision)
    as Partition.
  destruct Partition as [Cases _].
  assert (HPairY : PairLocal F y).
  {
    destruct Cases as [HFull | [HStart | [HFinish | HPair]]].
    - pose proof (FND_02_unique_root F A1 y HFull) as HyRoot.
      assert (HyzRoot : RecursiveInversion F E D (R F) z).
      {
        rewrite <- HyRoot.
        exact Hyz.
      }
      assert (HzRoot : z = R F).
      {
        apply (INV_03_root_fixed F E D z).
        exact HyzRoot.
      }
      assert (HxRoot : x = R F).
      {
        transitivity z.
        - symmetry. exact Hzx.
        - exact HzRoot.
      }
      assert (HFullX : FullSelf F x).
      {
        rewrite HxRoot.
        apply root_full_self.
      }
      exfalso.
      eapply recursive_full_pair_disjoint.
      + exact HFullX.
      + exact HPairX.
    - pose proof
        (INV_04_start_to_finish F A1 E D y z HStart Hyz)
        as HExchange.
      destruct HExchange as [HZFinish _].
      assert (HXFinish : FinishOnly F x).
      {
        rewrite <- Hzx.
        exact HZFinish.
      }
      exfalso.
      eapply recursive_finish_pair_disjoint.
      + exact HXFinish.
      + exact HPairX.
    - pose proof
        (INV_04_finish_to_start F A1 E D y z HFinish Hyz)
        as HExchange.
      destruct HExchange as [HZStart _].
      assert (HXStart : StartOnly F x).
      {
        rewrite <- Hzx.
        exact HZStart.
      }
      exfalso.
      eapply recursive_start_pair_disjoint.
      + exact HXStart.
      + exact HPairX.
    - exact HPair.
  }
  split.
  - exact HPairY.
  - exact (INV_01_recursive_pole_reversal F E D x y Hxy).
Qed.


(* The mirror ordered pair C->O is an ordinary PAIR representative as well.
   It is derived from the same proper one-sided F2/F3 witnesses; U is not a
   primitive or a fifth local self-incidence class. *)
Theorem f2f3_reverse_pair_pattern
    (F : Foundation)
    (E : F2F3OneSidedExistence F) :
    PairLocal F
      (form F (f2f3_finish_root F E) (f2f3_start_root F E)).
Proof.
  unfold PairLocal, StartSelf, FinishSelf.
  split.
  - intros Hself.
    assert (
      HfinishRootIsPair :
      f2f3_finish_root F E =
      form F (f2f3_finish_root F E) (f2f3_start_root F E)
    ).
    {
      transitivity
        (start F
          (form F (f2f3_finish_root F E) (f2f3_start_root F E))).
      - symmetry. apply form_start.
      - exact Hself.
    }
    pose proof (f_equal (start F) HfinishRootIsPair) as H.
    rewrite (f2f3_finish_root_start F E) in H.
    rewrite (form_start F (f2f3_finish_root F E) (f2f3_start_root F E)) in H.
    apply (f2f3_finish_root_ne_root F E).
    symmetry.
    exact H.
  - intros Hself.
    assert (
      HstartRootIsPair :
      f2f3_start_root F E =
      form F (f2f3_finish_root F E) (f2f3_start_root F E)
    ).
    {
      transitivity
        (finish F
          (form F (f2f3_finish_root F E) (f2f3_start_root F E))).
      - symmetry. apply form_finish.
      - exact Hself.
    }
    pose proof (f_equal (finish F) HstartRootIsPair) as H.
    rewrite (f2f3_start_root_finish F E) in H.
    rewrite (form_finish F (f2f3_finish_root F E) (f2f3_start_root F E)) in H.
    apply (f2f3_start_root_ne_root F E).
    symmetry.
    exact H.
Qed.

(* INV-06 root-basis representative calculation under one chosen orientation.
   O/C are the F2/F3 one-sided representatives; L=O->C and U=C->O are derived
   PAIR Links.  No Foundation-global absolute START side is selected here. *)
Theorem INV_06_root_basis
    (F : Foundation)
    (A1 : A1RecursiveSeparation F)
    (N : F2F3Normalization F)
    (E : F2F3OneSidedExistence F)
    (D : RecursiveInversionDomain F E) :
    let O := f2f3_start_root F E in
    let C := f2f3_finish_root F E in
    let L := form F O C in
    let U := form F C O in
    RecursiveInversion F E D (R F) (R F) /\
    RecursiveInversion F E D O C /\
    RecursiveInversion F E D C O /\
    RecursiveInversion F E D L L /\
    RecursiveInversion F E D U U.
Proof.
  cbv beta.
  assert (HR : RecursiveInversion F E D (R F) (R F)).
  {
    apply recursive_inversion_root.
  }
  assert (
    HO :
    RecursiveInversion F E D
      (f2f3_start_root F E)
      (f2f3_finish_root F E)
  ).
  {
    assert (
      HChild :
      RecursiveInversion F E D
        (finish F (f2f3_start_root F E))
        (R F)
    ).
    {
      rewrite (f2f3_start_root_finish F E).
      exact HR.
    }
    assert (
      HRaw :
      RecursiveInversion F E D
        (f2f3_start_root F E)
        (recursive_end_form F E D (R F))
    ).
    {
      apply recursive_inversion_start.
      - apply f2f3_start_root_pattern.
      - exact HChild.
    }
    rewrite (recursive_end_root_compat F E D) in HRaw.
    exact HRaw.
  }
  assert (
    HC :
    RecursiveInversion F E D
      (f2f3_finish_root F E)
      (f2f3_start_root F E)
  ).
  {
    assert (
      HChild :
      RecursiveInversion F E D
        (start F (f2f3_finish_root F E))
        (R F)
    ).
    {
      rewrite (f2f3_finish_root_start F E).
      exact HR.
    }
    assert (
      HRaw :
      RecursiveInversion F E D
        (f2f3_finish_root F E)
        (recursive_start_form F E D (R F))
    ).
    {
      apply recursive_inversion_finish.
      - apply f2f3_finish_root_pattern.
      - exact HChild.
    }
    rewrite (recursive_start_root_compat F E D) in HRaw.
    exact HRaw.
  }
  assert (
    HL :
    RecursiveInversion F E D
      (form F (f2f3_start_root F E) (f2f3_finish_root F E))
      (form F (f2f3_start_root F E) (f2f3_finish_root F E))
  ).
  {
    apply recursive_inversion_pair.
    - apply f2f3_pair_pattern.
    - rewrite (form_finish F (f2f3_start_root F E) (f2f3_finish_root F E)).
      exact HC.
    - rewrite (form_start F (f2f3_start_root F E) (f2f3_finish_root F E)).
      exact HO.
  }
  assert (
    HU :
    RecursiveInversion F E D
      (form F (f2f3_finish_root F E) (f2f3_start_root F E))
      (form F (f2f3_finish_root F E) (f2f3_start_root F E))
  ).
  {
    apply recursive_inversion_pair.
    - apply f2f3_reverse_pair_pattern.
    - rewrite (form_finish F (f2f3_finish_root F E) (f2f3_start_root F E)).
      exact HO.
    - rewrite (form_start F (f2f3_finish_root F E) (f2f3_start_root F E)).
      exact HC.
  }

  (* Cross-check the named P0 support boundaries against the direct graph
     calculation above.  These theorems audit the structural class effects;
     they are not hidden premises for constructing HR/HO/HC/HL/HU. *)
  pose proof
    (INV_03_root_fixed F E D (R F) HR)
    as HRootAudit.
  pose proof
    (proj1
      (INV_04_start_to_finish
        F A1 E D
        (f2f3_start_root F E)
        (f2f3_finish_root F E)
        (f2f3_start_root_pattern F E)
        HO))
    as HFinishAudit.
  pose proof
    (proj1
      (INV_04_finish_to_start
        F A1 E D
        (f2f3_finish_root F E)
        (f2f3_start_root F E)
        (f2f3_finish_root_pattern F E)
        HC))
    as HStartAudit.
  pose proof
    (proj1
      (INV_05_pair_preserved_and_reversed
        F A1 N E D
        (form F (f2f3_start_root F E) (f2f3_finish_root F E))
        (form F (f2f3_start_root F E) (f2f3_finish_root F E))
        (f2f3_pair_pattern F E)
        HL))
    as HLPairAudit.
  pose proof
    (proj1
      (INV_05_pair_preserved_and_reversed
        F A1 N E D
        (form F (f2f3_finish_root F E) (f2f3_start_root F E))
        (form F (f2f3_finish_root F E) (f2f3_start_root F E))
        (f2f3_reverse_pair_pattern F E)
        HU))
    as HUPairAudit.

  repeat split; assumption.
Qed.


(* INV-07 objective chirality capstone.

   The existing structural inversion graph reverses the two proper one-sided
   classes without identifying them; a second inversion returns the original
   Link; PAIR remains PAIR.  This preserves an objective structural
   distinction without selecting a Foundation-global absolute orientation. *)
Theorem INV_07_objective_chirality
    (F : Foundation)
    (A1 : A1RecursiveSeparation F)
    (N : F2F3Normalization F)
    (E : F2F3OneSidedExistence F)
    (D : RecursiveInversionDomain F E)
    (x y : Link F) :
    RecursiveInversion F E D x y ->
    (StartOnly F x ->
      FinishOnly F y /\
      x <> y /\
      ~ StartOnly F y /\
      forall z : Link F,
        RecursiveInversion F E D y z -> z = x) /\
    (FinishOnly F x ->
      StartOnly F y /\
      x <> y /\
      ~ FinishOnly F y /\
      forall z : Link F,
        RecursiveInversion F E D y z -> z = x) /\
    (PairLocal F x -> PairLocal F y).
Proof.
  intros Hxy.
  split.
  - intros HStart.
    pose proof
      (INV_04_start_to_finish F A1 E D x y HStart Hxy)
      as HSwap.
    destruct HSwap as [HFinishY Hneq].
    split.
    + exact HFinishY.
    + split.
      * exact Hneq.
      * split.
        -- intros HStartY.
           eapply recursive_start_finish_disjoint.
           ++ exact HStartY.
           ++ exact HFinishY.
        -- intros z Hyz.
           exact
             (INV_02_recursive_inversion_involutive
               F A1 N E D x y z Hxy Hyz).
  - split.
    + intros HFinish.
      pose proof
        (INV_04_finish_to_start F A1 E D x y HFinish Hxy)
        as HSwap.
      destruct HSwap as [HStartY Hneq].
      split.
      * exact HStartY.
      * split.
        -- exact Hneq.
        -- split.
           ++ intros HFinishY.
              eapply recursive_start_finish_disjoint.
              ** exact HStartY.
              ** exact HFinishY.
           ++ intros z Hyz.
              exact
                (INV_02_recursive_inversion_involutive
                  F A1 N E D x y z Hxy Hyz).
    + intros HPair.
      exact
        (proj1
          (INV_05_pair_preserved_and_reversed
            F A1 N E D x y HPair Hxy)).
Qed.


(* CTX-03 relational support vocabulary.
   These are propositions over existing Links, not a Frame/Gauge ontology.
   No Bool/enum value is semantic orientation authority. *)
Definition ProperOneSided (F : Foundation) (x : Link F) : Prop :=
  StartOnly F x \/ FinishOnly F x.

Definition SameChiralClass
    (F : Foundation) (x y : Link F) : Prop :=
  (StartOnly F x /\ StartOnly F y) \/
  (FinishOnly F x /\ FinishOnly F y).

Definition OppositeChiralClass
    (F : Foundation) (x y : Link F) : Prop :=
  (StartOnly F x /\ FinishOnly F y) \/
  (FinishOnly F x /\ StartOnly F y).

(* EXTERNAL THEORY PROJECTION: elementary group theory (Z2)

   The Z2 transport table is stated relationally: Same acts as Id and Opposite
   acts as J.  No two-valued semantic carrier is introduced, and the group
   description is external proof vocabulary only. *)
Definition RelativeZ2Law (F : Foundation) : Prop :=
  (forall x : Link F,
    ProperOneSided F x -> SameChiralClass F x x) /\
  (forall x y : Link F,
    SameChiralClass F x y -> SameChiralClass F y x) /\
  (forall x y : Link F,
    OppositeChiralClass F x y -> OppositeChiralClass F y x) /\
  (forall x y : Link F,
    ProperOneSided F x ->
    ProperOneSided F y ->
    SameChiralClass F x y \/ OppositeChiralClass F x y) /\
  (forall x y : Link F,
    SameChiralClass F x y ->
    OppositeChiralClass F x y ->
    False) /\
  (forall a b c : Link F,
    SameChiralClass F a b ->
    SameChiralClass F b c ->
    SameChiralClass F a c) /\
  (forall a b c : Link F,
    SameChiralClass F a b ->
    OppositeChiralClass F b c ->
    OppositeChiralClass F a c) /\
  (forall a b c : Link F,
    OppositeChiralClass F a b ->
    SameChiralClass F b c ->
    OppositeChiralClass F a c) /\
  (forall a b c : Link F,
    OppositeChiralClass F a b ->
    OppositeChiralClass F b c ->
    SameChiralClass F a c).

Definition InversionIsMirrorTransport
    (F : Foundation)
    (E : F2F3OneSidedExistence F)
    (D : RecursiveInversionDomain F E) : Prop :=
  forall x y : Link F,
    RecursiveInversion F E D x y ->
    ProperOneSided F x ->
    ProperOneSided F y /\ OppositeChiralClass F x y.

Theorem ctx03_same_refl
    (F : Foundation)
    (x : Link F) :
    ProperOneSided F x ->
    SameChiralClass F x x.
Proof.
  intros [HStart | HFinish].
  - left. split; exact HStart.
  - right. split; exact HFinish.
Qed.

Theorem ctx03_same_symm
    (F : Foundation)
    (x y : Link F) :
    SameChiralClass F x y ->
    SameChiralClass F y x.
Proof.
  intros [[HX HY] | [HX HY]].
  - left. split; assumption.
  - right. split; assumption.
Qed.

Theorem ctx03_opposite_symm
    (F : Foundation)
    (x y : Link F) :
    OppositeChiralClass F x y ->
    OppositeChiralClass F y x.
Proof.
  intros [[HX HY] | [HX HY]].
  - right. split; assumption.
  - left. split; assumption.
Qed.

Theorem ctx03_transport_total
    (F : Foundation)
    (x y : Link F) :
    ProperOneSided F x ->
    ProperOneSided F y ->
    SameChiralClass F x y \/ OppositeChiralClass F x y.
Proof.
  intros [HX | HX] [HY | HY].
  - left. left. split; assumption.
  - right. left. split; assumption.
  - right. right. split; assumption.
  - left. right. split; assumption.
Qed.

Theorem ctx03_transport_disjoint
    (F : Foundation)
    (x y : Link F) :
    SameChiralClass F x y ->
    OppositeChiralClass F x y ->
    False.
Proof.
  intros [[HXS HYS] | [HXF HYF]]
         [[HXS' HYF'] | [HXF' HYS']].
  - eapply recursive_start_finish_disjoint.
    + exact HYS.
    + exact HYF'.
  - eapply recursive_start_finish_disjoint.
    + exact HXS.
    + exact HXF'.
  - eapply recursive_start_finish_disjoint.
    + exact HXS'.
    + exact HXF.
  - eapply recursive_start_finish_disjoint.
    + exact HYS'.
    + exact HYF.
Qed.

Theorem ctx03_same_same
    (F : Foundation)
    (a b c : Link F) :
    SameChiralClass F a b ->
    SameChiralClass F b c ->
    SameChiralClass F a c.
Proof.
  intros [[HAS HBS] | [HAF HBF]]
         [[HBS' HCS] | [HBF' HCF]].
  - left. split; assumption.
  - exfalso.
    eapply recursive_start_finish_disjoint.
    + exact HBS.
    + exact HBF'.
  - exfalso.
    eapply recursive_start_finish_disjoint.
    + exact HBS'.
    + exact HBF.
  - right. split; assumption.
Qed.

Theorem ctx03_same_opposite
    (F : Foundation)
    (a b c : Link F) :
    SameChiralClass F a b ->
    OppositeChiralClass F b c ->
    OppositeChiralClass F a c.
Proof.
  intros [[HAS HBS] | [HAF HBF]]
         [[HBS' HCF] | [HBF' HCS]].
  - left. split; assumption.
  - exfalso.
    eapply recursive_start_finish_disjoint.
    + exact HBS.
    + exact HBF'.
  - exfalso.
    eapply recursive_start_finish_disjoint.
    + exact HBS'.
    + exact HBF.
  - right. split; assumption.
Qed.

Theorem ctx03_opposite_same
    (F : Foundation)
    (a b c : Link F) :
    OppositeChiralClass F a b ->
    SameChiralClass F b c ->
    OppositeChiralClass F a c.
Proof.
  intros [[HAS HBF] | [HAF HBS]]
         [[HBS' HCS] | [HBF' HCF]].
  - exfalso.
    eapply recursive_start_finish_disjoint.
    + exact HBS'.
    + exact HBF.
  - left. split; assumption.
  - right. split; assumption.
  - exfalso.
    eapply recursive_start_finish_disjoint.
    + exact HBS.
    + exact HBF'.
Qed.

Theorem ctx03_opposite_opposite
    (F : Foundation)
    (a b c : Link F) :
    OppositeChiralClass F a b ->
    OppositeChiralClass F b c ->
    SameChiralClass F a c.
Proof.
  intros [[HAS HBF] | [HAF HBS]]
         [[HBS' HCF] | [HBF' HCS]].
  - exfalso.
    eapply recursive_start_finish_disjoint.
    + exact HBS'.
    + exact HBF.
  - left. split; assumption.
  - right. split; assumption.
  - exfalso.
    eapply recursive_start_finish_disjoint.
    + exact HBS.
    + exact HBF'.
Qed.

Theorem ctx03_relative_z2
    (F : Foundation) :
    RelativeZ2Law F.
Proof.
  unfold RelativeZ2Law.
  repeat split.
  - intros x HX. apply (ctx03_same_refl F x HX).
  - intros x y H. apply (ctx03_same_symm F x y H).
  - intros x y H. apply (ctx03_opposite_symm F x y H).
  - intros x y HX HY. apply (ctx03_transport_total F x y HX HY).
  - intros x y HS HO. apply (ctx03_transport_disjoint F x y HS HO).
  - intros a b c H1 H2. apply (ctx03_same_same F a b c H1 H2).
  - intros a b c H1 H2. apply (ctx03_same_opposite F a b c H1 H2).
  - intros a b c H1 H2. apply (ctx03_opposite_same F a b c H1 H2).
  - intros a b c H1 H2. apply (ctx03_opposite_opposite F a b c H1 H2).
Qed.

Theorem ctx03_inversion_is_mirror_transport
    (F : Foundation)
    (A1 : A1RecursiveSeparation F)
    (N : F2F3Normalization F)
    (E : F2F3OneSidedExistence F)
    (D : RecursiveInversionDomain F E) :
    InversionIsMirrorTransport F E D.
Proof.
  unfold InversionIsMirrorTransport.
  intros x y Hxy [HStart | HFinish].
  - pose proof
      (INV_07_objective_chirality F A1 N E D x y Hxy)
      as HChiral.
    destruct HChiral as [HStartCase [_ _]].
    pose proof (HStartCase HStart) as H.
    destruct H as [HFinishY _].
    split.
    + right. exact HFinishY.
    + left. split; assumption.
  - pose proof
      (INV_07_objective_chirality F A1 N E D x y Hxy)
      as HChiral.
    destruct HChiral as [_ [HFinishCase _]].
    pose proof (HFinishCase HFinish) as H.
    destruct H as [HStartY _].
    split.
    + left. exact HStartY.
    + right. split; assumption.
Qed.

(* Supporting CTX-03 result: relative orientation transport is the Z2
   same/opposite relation on Link-native one-sided structural classes, and J
   is the mirror transport on that carrier.

   This introduces no semantic Frame/Gauge datatype; Rocq propositions and
   disjunctions are external projection machinery only. *)
Theorem CTX_03_relational_z2_support
    (F : Foundation)
    (A1 : A1RecursiveSeparation F)
    (N : F2F3Normalization F)
    (E : F2F3OneSidedExistence F)
    (D : RecursiveInversionDomain F E) :
    RelativeZ2Law F /\
    InversionIsMirrorTransport F E D.
Proof.
  split.
  - apply ctx03_relative_z2.
  - apply (ctx03_inversion_is_mirror_transport F A1 N E D).
Qed.



(* CTX-03 Link-native Context orientation carrier.

   A Context body K has two canonical one-sided markers supplied by the
   existing recursive F2/F3 forms.  This proposition is external proof
   vocabulary only; it does not introduce a native MTS frame datatype or
   absolute START/END names. *)
Definition ContextOrientationMarker
    (F : Foundation)
    (E : F2F3OneSidedExistence F)
    (D : RecursiveInversionDomain F E)
    (body marker : Link F) : Prop :=
  marker = recursive_start_form F E D body \/
  marker = recursive_end_form F E D body.

Definition ContextLocalStartRole
    (F : Foundation)
    (selected candidate : Link F) : Prop :=
  SameChiralClass F selected candidate.

Definition ContextLocalEndRole
    (F : Foundation)
    (selected candidate : Link F) : Prop :=
  OppositeChiralClass F selected candidate.

Theorem context_orientation_markers_distinct
    (F : Foundation)
    (A1 : A1RecursiveSeparation F)
    (E : F2F3OneSidedExistence F)
    (D : RecursiveInversionDomain F E)
    (body : Link F) :
    recursive_start_form F E D body <>
    recursive_end_form F E D body.
Proof.
  intros Heq.
  pose proof
    (recursive_start_form_pattern F A1 E D body)
    as HStart.
  pose proof
    (recursive_end_form_pattern F A1 E D body)
    as HFinish.
  assert (
    HFinishAtStart :
    FinishOnly F (recursive_start_form F E D body)
  ).
  {
    rewrite Heq.
    exact HFinish.
  }
  eapply recursive_start_finish_disjoint.
  - exact HStart.
  - exact HFinishAtStart.
Qed.

Theorem context_orientation_marker_one_sided
    (F : Foundation)
    (A1 : A1RecursiveSeparation F)
    (E : F2F3OneSidedExistence F)
    (D : RecursiveInversionDomain F E)
    (body marker : Link F) :
    ContextOrientationMarker F E D body marker ->
    ProperOneSided F marker.
Proof.
  intros HMarker.
  destruct HMarker as [HStart | HFinish].
  - subst marker.
    left.
    exact (recursive_start_form_pattern F A1 E D body).
  - subst marker.
    right.
    exact (recursive_end_form_pattern F A1 E D body).
Qed.

(* Context selection induces local START_K / END_K roles from the Link-native
   marker.  No Foundation-global orientation is selected. *)
Theorem CTX_03_context_selection_induces_local_roles
    (F : Foundation)
    (A1 : A1RecursiveSeparation F)
    (E : F2F3OneSidedExistence F)
    (D : RecursiveInversionDomain F E)
    (body selected : Link F) :
    ContextOrientationMarker F E D body selected ->
    exists localStart localEnd : Link F,
      ContextOrientationMarker F E D body localStart /\
      ContextOrientationMarker F E D body localEnd /\
      ContextLocalStartRole F selected localStart /\
      ContextLocalEndRole F selected localEnd /\
      localStart <> localEnd.
Proof.
  intros HSelected.
  destruct HSelected as [HSelectedStart | HSelectedEnd].
  - subst selected.
    exists (recursive_start_form F E D body).
    exists (recursive_end_form F E D body).
    split.
    + left. reflexivity.
    + split.
      * right. reflexivity.
      * split.
        -- unfold ContextLocalStartRole, SameChiralClass.
           left.
           split.
           ++ exact (recursive_start_form_pattern F A1 E D body).
           ++ exact (recursive_start_form_pattern F A1 E D body).
        -- split.
           ++ unfold ContextLocalEndRole, OppositeChiralClass.
              left.
              split.
              ** exact (recursive_start_form_pattern F A1 E D body).
              ** exact (recursive_end_form_pattern F A1 E D body).
           ++ exact (context_orientation_markers_distinct F A1 E D body).
  - subst selected.
    exists (recursive_end_form F E D body).
    exists (recursive_start_form F E D body).
    split.
    + right. reflexivity.
    + split.
      * left. reflexivity.
      * split.
        -- unfold ContextLocalStartRole, SameChiralClass.
           right.
           split.
           ++ exact (recursive_end_form_pattern F A1 E D body).
           ++ exact (recursive_end_form_pattern F A1 E D body).
        -- split.
           ++ unfold ContextLocalEndRole, OppositeChiralClass.
              right.
              split.
              ** exact (recursive_end_form_pattern F A1 E D body).
              ** exact (recursive_start_form_pattern F A1 E D body).
           ++ intros Heq.
              apply (context_orientation_markers_distinct F A1 E D body).
              symmetry.
              exact Heq.
Qed.

(* Objective chirality exists before any Context selection.  The witness order
   in this external theorem is technical only and does not define an absolute
   MTS orientation. *)
Theorem CTX_03_objective_chiral_orbit_before_context
    (F : Foundation)
    (A1 : A1RecursiveSeparation F)
    (N : F2F3Normalization F)
    (E : F2F3OneSidedExistence F)
    (D : RecursiveInversionDomain F E) :
    exists w jw : Link F,
      RecursiveInversion F E D w jw /\
      RecursiveInversion F E D jw w /\
      w <> jw /\
      OppositeChiralClass F w jw /\
      (forall z : Link F,
        RecursiveInversion F E D jw z -> z = w).
Proof.
  assert (HR : RecursiveInversion F E D (R F) (R F)).
  {
    apply recursive_inversion_root.
  }
  assert (
    HOC :
    RecursiveInversion F E D
      (f2f3_start_root F E)
      (f2f3_finish_root F E)
  ).
  {
    assert (
      HChild :
      RecursiveInversion F E D
        (finish F (f2f3_start_root F E))
        (R F)
    ).
    {
      rewrite (f2f3_start_root_finish F E).
      exact HR.
    }
    assert (
      HRaw :
      RecursiveInversion F E D
        (f2f3_start_root F E)
        (recursive_end_form F E D (R F))
    ).
    {
      apply recursive_inversion_start.
      - exact (f2f3_start_root_pattern F E).
      - exact HChild.
    }
    rewrite (recursive_end_root_compat F E D) in HRaw.
    exact HRaw.
  }
  assert (
    HCO :
    RecursiveInversion F E D
      (f2f3_finish_root F E)
      (f2f3_start_root F E)
  ).
  {
    assert (
      HChild :
      RecursiveInversion F E D
        (start F (f2f3_finish_root F E))
        (R F)
    ).
    {
      rewrite (f2f3_finish_root_start F E).
      exact HR.
    }
    assert (
      HRaw :
      RecursiveInversion F E D
        (f2f3_finish_root F E)
        (recursive_start_form F E D (R F))
    ).
    {
      apply recursive_inversion_finish.
      - exact (f2f3_finish_root_pattern F E).
      - exact HChild.
    }
    rewrite (recursive_start_root_compat F E D) in HRaw.
    exact HRaw.
  }
  pose proof
    (ctx03_inversion_is_mirror_transport F A1 N E D)
    as HMirrorLaw.
  unfold InversionIsMirrorTransport in HMirrorLaw.
  pose proof
    (HMirrorLaw
      (f2f3_start_root F E)
      (f2f3_finish_root F E)
      HOC
      (or_introl (f2f3_start_root_pattern F E)))
    as HMirror.
  exists (f2f3_start_root F E).
  exists (f2f3_finish_root F E).
  split.
  - exact HOC.
  - split.
    + exact HCO.
    + split.
      * intros Heq.
        pose proof (f2f3_start_root_pattern F E) as HStart.
        assert (HFinish : FinishOnly F (f2f3_start_root F E)).
        {
          rewrite Heq.
          exact (f2f3_finish_root_pattern F E).
        }
        eapply recursive_start_finish_disjoint.
        -- exact HStart.
        -- exact HFinish.
      * split.
        -- exact (proj2 HMirror).
        -- intros z Hz.
           exact
             (INV_02_recursive_inversion_involutive
               F A1 N E D
               (f2f3_start_root F E)
               (f2f3_finish_root F E)
               z
               HOC
               Hz).
Qed.

(* Simultaneous global inversion preserves the relative Same/Opposite
   relation of two one-sided Context markers. *)
Theorem CTX_03_simultaneous_inversion_covariance
    (F : Foundation)
    (A1 : A1RecursiveSeparation F)
    (N : F2F3Normalization F)
    (E : F2F3OneSidedExistence F)
    (D : RecursiveInversionDomain F E)
    (a b ja jb : Link F) :
    RecursiveInversion F E D a ja ->
    RecursiveInversion F E D b jb ->
    (SameChiralClass F a b ->
      SameChiralClass F ja jb) /\
    (OppositeChiralClass F a b ->
      OppositeChiralClass F ja jb).
Proof.
  intros HJa HJb.
  pose proof
    (ctx03_inversion_is_mirror_transport F A1 N E D)
    as HMirrorLaw.
  unfold InversionIsMirrorTransport in HMirrorLaw.
  split.
  - intros HSame.
    destruct HSame as [[HAStart HBStart] | [HAFinish HBFinish]].
    + pose proof
        (HMirrorLaw a ja HJa (or_introl HAStart))
        as HMa.
      pose proof
        (HMirrorLaw b jb HJb (or_introl HBStart))
        as HMb.
      pose proof
        (ctx03_opposite_symm F a ja (proj2 HMa))
        as HJaA.
      pose proof
        (ctx03_opposite_same
          F ja a b
          HJaA
          (or_introl (conj HAStart HBStart)))
        as HJaB.
      exact
        (ctx03_opposite_opposite
          F ja b jb
          HJaB
          (proj2 HMb)).
    + pose proof
        (HMirrorLaw a ja HJa (or_intror HAFinish))
        as HMa.
      pose proof
        (HMirrorLaw b jb HJb (or_intror HBFinish))
        as HMb.
      pose proof
        (ctx03_opposite_symm F a ja (proj2 HMa))
        as HJaA.
      pose proof
        (ctx03_opposite_same
          F ja a b
          HJaA
          (or_intror (conj HAFinish HBFinish)))
        as HJaB.
      exact
        (ctx03_opposite_opposite
          F ja b jb
          HJaB
          (proj2 HMb)).
  - intros HOpposite.
    destruct HOpposite as [[HAStart HBFinish] | [HAFinish HBStart]].
    + pose proof
        (HMirrorLaw a ja HJa (or_introl HAStart))
        as HMa.
      pose proof
        (HMirrorLaw b jb HJb (or_intror HBFinish))
        as HMb.
      pose proof
        (ctx03_opposite_symm F a ja (proj2 HMa))
        as HJaA.
      pose proof
        (ctx03_opposite_opposite
          F ja a b
          HJaA
          (or_introl (conj HAStart HBFinish)))
        as HJaB.
      exact
        (ctx03_same_opposite
          F ja b jb
          HJaB
          (proj2 HMb)).
    + pose proof
        (HMirrorLaw a ja HJa (or_intror HAFinish))
        as HMa.
      pose proof
        (HMirrorLaw b jb HJb (or_introl HBStart))
        as HMb.
      pose proof
        (ctx03_opposite_symm F a ja (proj2 HMa))
        as HJaA.
      pose proof
        (ctx03_opposite_opposite
          F ja a b
          HJaA
          (or_intror (conj HAFinish HBStart)))
        as HJaB.
      exact
        (ctx03_same_opposite
          F ja b jb
          HJaB
          (proj2 HMb)).
Qed.

(* Accepted post-orientation direction witnesses, expressed only as existing
   Links.  These names are external proof aliases; before Context selection
   neither one is a Foundation-global preferred orientation. *)
Definition ContextInRWitness
    (F : Foundation)
    (E : F2F3OneSidedExistence F) : Link F :=
  form F (f2f3_finish_root F E) (R F).

Definition ContextOutRWitness
    (F : Foundation)
    (E : F2F3OneSidedExistence F) : Link F :=
  form F (R F) (f2f3_start_root F E).

(* Relational marker -> chi(K) bridge.  The selected one-sided marker fixes the
   local semantic polarity; no host orientation datatype carries orientation. *)
Definition ContextChiWitness
    (F : Foundation)
    (E : F2F3OneSidedExistence F)
    (selected chi : Link F) : Prop :=
  (SameChiralClass F selected (f2f3_start_root F E) /\
    chi = ContextInRWitness F E) \/
  (SameChiralClass F selected (f2f3_finish_root F E) /\
    chi = ContextOutRWitness F E).

Theorem ctx03_inr_pair_pattern
    (F : Foundation)
    (E : F2F3OneSidedExistence F) :
    PairLocal F (ContextInRWitness F E).
Proof.
  unfold PairLocal, StartSelf, FinishSelf.
  split.
  - intros HSelf.
    assert (
      HEq :
      f2f3_finish_root F E = ContextInRWitness F E
    ).
    {
      transitivity (start F (ContextInRWitness F E)).
      - symmetry.
        unfold ContextInRWitness.
        apply form_start.
      - exact HSelf.
    }
    pose proof (f_equal (finish F) HEq) as HFinish.
    apply (f2f3_finish_root_ne_root F E).
    unfold ContextInRWitness in HFinish.
    rewrite (f2f3_finish_root_finish F E) in HFinish.
    rewrite (form_finish F (f2f3_finish_root F E) (R F)) in HFinish.
    exact HFinish.
  - intros HSelf.
    assert (
      HEq :
      R F = ContextInRWitness F E
    ).
    {
      transitivity (finish F (ContextInRWitness F E)).
      - symmetry.
        unfold ContextInRWitness.
        apply form_finish.
      - exact HSelf.
    }
    pose proof (f_equal (start F) HEq) as HStart.
    assert (HRootStart : start F (R F) = R F).
    {
      exact (proj1 (root_full_self F)).
    }
    apply (f2f3_finish_root_ne_root F E).
    symmetry.
    transitivity (start F (R F)).
    + symmetry. exact HRootStart.
    + transitivity (start F (ContextInRWitness F E)).
      * exact HStart.
      * unfold ContextInRWitness.
        apply form_start.
Qed.

Theorem ctx03_outr_pair_pattern
    (F : Foundation)
    (E : F2F3OneSidedExistence F) :
    PairLocal F (ContextOutRWitness F E).
Proof.
  unfold PairLocal, StartSelf, FinishSelf.
  split.
  - intros HSelf.
    assert (
      HEq :
      R F = ContextOutRWitness F E
    ).
    {
      transitivity (start F (ContextOutRWitness F E)).
      - symmetry.
        unfold ContextOutRWitness.
        apply form_start.
      - exact HSelf.
    }
    pose proof (f_equal (finish F) HEq) as HFinish.
    assert (HRootFinish : finish F (R F) = R F).
    {
      exact (proj2 (root_full_self F)).
    }
    apply (f2f3_start_root_ne_root F E).
    symmetry.
    transitivity (finish F (R F)).
    + symmetry. exact HRootFinish.
    + transitivity (finish F (ContextOutRWitness F E)).
      * exact HFinish.
      * unfold ContextOutRWitness.
        apply form_finish.
  - intros HSelf.
    assert (
      HEq :
      f2f3_start_root F E = ContextOutRWitness F E
    ).
    {
      transitivity (finish F (ContextOutRWitness F E)).
      - symmetry.
        unfold ContextOutRWitness.
        apply form_finish.
      - exact HSelf.
    }
    pose proof (f_equal (start F) HEq) as HStart.
    apply (f2f3_start_root_ne_root F E).
    unfold ContextOutRWitness in HStart.
    rewrite (f2f3_start_root_start F E) in HStart.
    rewrite (form_start F (R F) (f2f3_start_root F E)) in HStart.
    exact HStart.
Qed.

Theorem ctx03_direction_witnesses_distinct
    (F : Foundation)
    (E : F2F3OneSidedExistence F) :
    ContextInRWitness F E <> ContextOutRWitness F E.
Proof.
  intros HEq.
  pose proof (f_equal (start F) HEq) as HStart.
  apply (f2f3_finish_root_ne_root F E).
  unfold ContextInRWitness, ContextOutRWitness in HStart.
  rewrite (form_start F (f2f3_finish_root F E) (R F)) in HStart.
  rewrite (form_start F (R F) (f2f3_start_root F E)) in HStart.
  exact HStart.
Qed.

(* J exchanges the two accepted direction-witness Links. *)
Theorem CTX_03_direction_witness_inversion
    (F : Foundation)
    (E : F2F3OneSidedExistence F)
    (D : RecursiveInversionDomain F E) :
    RecursiveInversion F E D
      (ContextInRWitness F E)
      (ContextOutRWitness F E) /\
    RecursiveInversion F E D
      (ContextOutRWitness F E)
      (ContextInRWitness F E).
Proof.
  assert (HR : RecursiveInversion F E D (R F) (R F)).
  {
    apply recursive_inversion_root.
  }
  assert (
    HOC :
    RecursiveInversion F E D
      (f2f3_start_root F E)
      (f2f3_finish_root F E)
  ).
  {
    assert (
      HChild :
      RecursiveInversion F E D
        (finish F (f2f3_start_root F E))
        (R F)
    ).
    {
      rewrite (f2f3_start_root_finish F E).
      exact HR.
    }
    assert (
      HRaw :
      RecursiveInversion F E D
        (f2f3_start_root F E)
        (recursive_end_form F E D (R F))
    ).
    {
      apply recursive_inversion_start.
      - apply f2f3_start_root_pattern.
      - exact HChild.
    }
    rewrite (recursive_end_root_compat F E D) in HRaw.
    exact HRaw.
  }
  assert (
    HCO :
    RecursiveInversion F E D
      (f2f3_finish_root F E)
      (f2f3_start_root F E)
  ).
  {
    assert (
      HChild :
      RecursiveInversion F E D
        (start F (f2f3_finish_root F E))
        (R F)
    ).
    {
      rewrite (f2f3_finish_root_start F E).
      exact HR.
    }
    assert (
      HRaw :
      RecursiveInversion F E D
        (f2f3_finish_root F E)
        (recursive_start_form F E D (R F))
    ).
    {
      apply recursive_inversion_finish.
      - apply f2f3_finish_root_pattern.
      - exact HChild.
    }
    rewrite (recursive_start_root_compat F E D) in HRaw.
    exact HRaw.
  }
  split.
  - unfold ContextInRWitness, ContextOutRWitness.
    apply recursive_inversion_pair.
    + apply ctx03_inr_pair_pattern.
    + rewrite (form_finish F (f2f3_finish_root F E) (R F)).
      exact HR.
    + rewrite (form_start F (f2f3_finish_root F E) (R F)).
      exact HCO.
  - unfold ContextInRWitness, ContextOutRWitness.
    apply recursive_inversion_pair.
    + apply ctx03_outr_pair_pattern.
    + rewrite (form_finish F (R F) (f2f3_start_root F E)).
      exact HOC.
    + rewrite (form_start F (R F) (f2f3_start_root F E)).
      exact HR.
Qed.

(* A Link-native Context marker selects exactly one chi(K). *)
Theorem CTX_03_context_marker_selects_unique_chi
    (F : Foundation)
    (A1 : A1RecursiveSeparation F)
    (E : F2F3OneSidedExistence F)
    (D : RecursiveInversionDomain F E)
    (body selected : Link F) :
    ContextOrientationMarker F E D body selected ->
    exists chi : Link F,
      ContextChiWitness F E selected chi /\
      forall other : Link F,
        ContextChiWitness F E selected other ->
        other = chi.
Proof.
  intros HSelected.
  destruct HSelected as [HSelectedStart | HSelectedEnd].
  - subst selected.
    assert (
      HSelectedPattern :
      StartOnly F (recursive_start_form F E D body)
    ).
    {
      apply recursive_start_form_pattern.
      exact A1.
    }
    assert (
      HSameStart :
      SameChiralClass F
        (recursive_start_form F E D body)
        (f2f3_start_root F E)
    ).
    {
      left. split.
      - exact HSelectedPattern.
      - apply f2f3_start_root_pattern.
    }
    assert (
      HOppFinish :
      OppositeChiralClass F
        (recursive_start_form F E D body)
        (f2f3_finish_root F E)
    ).
    {
      left. split.
      - exact HSelectedPattern.
      - apply f2f3_finish_root_pattern.
    }
    exists (ContextInRWitness F E).
    split.
    + left. split.
      * exact HSameStart.
      * reflexivity.
    + intros other HOther.
      destruct HOther as [[HSame HEq] | [HSame HEq]].
      * exact HEq.
      * exfalso.
        eapply ctx03_transport_disjoint.
        -- exact HSame.
        -- exact HOppFinish.
  - subst selected.
    assert (
      HSelectedPattern :
      FinishOnly F (recursive_end_form F E D body)
    ).
    {
      apply recursive_end_form_pattern.
      exact A1.
    }
    assert (
      HSameFinish :
      SameChiralClass F
        (recursive_end_form F E D body)
        (f2f3_finish_root F E)
    ).
    {
      right. split.
      - exact HSelectedPattern.
      - apply f2f3_finish_root_pattern.
    }
    assert (
      HOppStart :
      OppositeChiralClass F
        (recursive_end_form F E D body)
        (f2f3_start_root F E)
    ).
    {
      right. split.
      - exact HSelectedPattern.
      - apply f2f3_start_root_pattern.
    }
    exists (ContextOutRWitness F E).
    split.
    + right. split.
      * exact HSameFinish.
      * reflexivity.
    + intros other HOther.
      destruct HOther as [[HSame HEq] | [HSame HEq]].
      * exfalso.
        eapply ctx03_transport_disjoint.
        -- exact HSame.
        -- exact HOppStart.
      * exact HEq.
Qed.

(* Every selected Context marker yields a unique chi(K); J maps it to the other
   accepted direction witness and cannot leave it fixed. *)
Theorem CTX_03_chi_direction_bridge
    (F : Foundation)
    (A1 : A1RecursiveSeparation F)
    (E : F2F3OneSidedExistence F)
    (D : RecursiveInversionDomain F E)
    (body selected : Link F) :
    ContextOrientationMarker F E D body selected ->
    exists chi jchi : Link F,
      ContextChiWitness F E selected chi /\
      RecursiveInversion F E D chi jchi /\
      chi <> jchi /\
      ((chi = ContextInRWitness F E /\
        jchi = ContextOutRWitness F E) \/
       (chi = ContextOutRWitness F E /\
        jchi = ContextInRWitness F E)).
Proof.
  intros HSelected.
  destruct
    (CTX_03_context_marker_selects_unique_chi
      F A1 E D body selected HSelected)
    as [chi [HChi HUnique]].
  pose proof (CTX_03_direction_witness_inversion F E D) as HDirections.
  destruct HChi as [[HSame HEq] | [HSame HEq]].
  - subst chi.
    exists (ContextInRWitness F E).
    exists (ContextOutRWitness F E).
    split.
    + left. split.
      * exact HSame.
      * reflexivity.
    + split.
      * exact (proj1 HDirections).
      * split.
        -- apply ctx03_direction_witnesses_distinct.
        -- left. split; reflexivity.
  - subst chi.
    exists (ContextOutRWitness F E).
    exists (ContextInRWitness F E).
    split.
    + right. split.
      * exact HSame.
      * reflexivity.
    + split.
      * exact (proj2 HDirections).
      * split.
        -- intros HEq.
           apply (ctx03_direction_witnesses_distinct F E).
           symmetry. exact HEq.
        -- right. split; reflexivity.
Qed.


(* Semantic Link construction relative to a selected Context marker.
   Pole order is expressed relationally; no host frame value is authority. *)
Definition ContextSemanticArrow
    (F : Foundation)
    (E : F2F3OneSidedExistence F)
    (selected semanticStart semanticEnd technicalLink : Link F) : Prop :=
  (SameChiralClass F selected (f2f3_start_root F E) /\
    technicalLink = form F semanticStart semanticEnd) \/
  (SameChiralClass F selected (f2f3_finish_root F E) /\
    technicalLink = form F semanticEnd semanticStart).

Theorem ctx03_same_start_root_implies_start
    (F : Foundation)
    (E : F2F3OneSidedExistence F)
    (selected : Link F) :
    SameChiralClass F selected (f2f3_start_root F E) ->
    StartOnly F selected.
Proof.
  intros H.
  destruct H as [[HSelected HRoot] | [HSelected HRoot]].
  - exact HSelected.
  - exfalso.
    eapply recursive_start_finish_disjoint.
    + apply f2f3_start_root_pattern.
    + exact HRoot.
Qed.

Theorem ctx03_same_finish_root_implies_finish
    (F : Foundation)
    (E : F2F3OneSidedExistence F)
    (selected : Link F) :
    SameChiralClass F selected (f2f3_finish_root F E) ->
    FinishOnly F selected.
Proof.
  intros H.
  destruct H as [[HSelected HRoot] | [HSelected HRoot]].
  - exfalso.
    eapply recursive_start_finish_disjoint.
    + exact HRoot.
    + apply f2f3_finish_root_pattern.
  - exact HSelected.
Qed.

(* One semantic arrow is covariant under simultaneous structural inversion. *)
Theorem CTX_03_semantic_arrow_covariant
    (F : Foundation)
    (A1 : A1RecursiveSeparation F)
    (N : F2F3Normalization F)
    (E : F2F3OneSidedExistence F)
    (D : RecursiveInversionDomain F E)
    (selected jselected
      semanticStart semanticEnd
      jStart jEnd
      technicalLink jTechnicalLink : Link F) :
    RecursiveInversion F E D selected jselected ->
    RecursiveInversion F E D semanticStart jStart ->
    RecursiveInversion F E D semanticEnd jEnd ->
    RecursiveInversion F E D technicalLink jTechnicalLink ->
    ContextSemanticArrow
      F E selected semanticStart semanticEnd technicalLink ->
    ContextSemanticArrow
      F E jselected jStart jEnd jTechnicalLink.
Proof.
  intros HMarkerInv HStartInv HEndInv HLinkInv HArrow.
  destruct HArrow as [[HClass HLinkEq] | [HClass HLinkEq]].
  - pose proof
      (ctx03_same_start_root_implies_start F E selected HClass)
      as HSelectedStart.
    pose proof
      (INV_07_objective_chirality
        F A1 N E D selected jselected HMarkerInv)
      as HChiral.
    pose proof ((proj1 HChiral) HSelectedStart) as HSwap.
    pose proof (proj1 HSwap) as HJSelectedFinish.
    assert (
      HTargetClass :
      SameChiralClass F jselected (f2f3_finish_root F E)
    ).
    {
      right. split.
      - exact HJSelectedFinish.
      - apply f2f3_finish_root_pattern.
    }
    destruct
      (INV_01_recursive_pole_reversal
        F E D technicalLink jTechnicalLink HLinkInv)
      as [inverseFinish [inverseStart [HFinishInv [HStartPoleInv HRebuild]]]].
    rewrite HLinkEq in HFinishInv, HStartPoleInv.
    rewrite (form_finish F semanticStart semanticEnd) in HFinishInv.
    rewrite (form_start F semanticStart semanticEnd) in HStartPoleInv.
    pose proof
      (recursive_inversion_functional
        F E D semanticEnd inverseFinish jEnd
        HFinishInv HEndInv)
      as HFinishEq.
    pose proof
      (recursive_inversion_functional
        F E D semanticStart inverseStart jStart
        HStartPoleInv HStartInv)
      as HStartEq.
    rewrite HFinishEq, HStartEq in HRebuild.
    right. split.
    + exact HTargetClass.
    + exact HRebuild.
  - pose proof
      (ctx03_same_finish_root_implies_finish F E selected HClass)
      as HSelectedFinish.
    pose proof
      (INV_07_objective_chirality
        F A1 N E D selected jselected HMarkerInv)
      as HChiral.
    pose proof ((proj1 (proj2 HChiral)) HSelectedFinish) as HSwap.
    pose proof (proj1 HSwap) as HJSelectedStart.
    assert (
      HTargetClass :
      SameChiralClass F jselected (f2f3_start_root F E)
    ).
    {
      left. split.
      - exact HJSelectedStart.
      - apply f2f3_start_root_pattern.
    }
    destruct
      (INV_01_recursive_pole_reversal
        F E D technicalLink jTechnicalLink HLinkInv)
      as [inverseFinish [inverseStart [HFinishInv [HStartPoleInv HRebuild]]]].
    rewrite HLinkEq in HFinishInv, HStartPoleInv.
    rewrite (form_finish F semanticEnd semanticStart) in HFinishInv.
    rewrite (form_start F semanticEnd semanticStart) in HStartPoleInv.
    pose proof
      (recursive_inversion_functional
        F E D semanticStart inverseFinish jStart
        HFinishInv HStartInv)
      as HFinishEq.
    pose proof
      (recursive_inversion_functional
        F E D semanticEnd inverseStart jEnd
        HStartPoleInv HEndInv)
      as HStartEq.
    rewrite HFinishEq, HStartEq in HRebuild.
    left. split.
    + exact HTargetClass.
    + exact HRebuild.
Qed.

(* One-relation structural kernel of generalized modus ponens:
     K -> A, A -> B  ==>  K -> B
   represented through ContextSemanticArrow. *)
Definition ContextGeneralizedMPStep
    (F : Foundation)
    (E : F2F3OneSidedExistence F)
    (selected K A B truth rule result : Link F) : Prop :=
  ContextSemanticArrow F E selected K A truth /\
  ContextSemanticArrow F E selected A B rule /\
  ContextSemanticArrow F E selected K B result.

Definition ContextGeneralizedMPCovarianceLaw
    (F : Foundation)
    (E : F2F3OneSidedExistence F)
    (D : RecursiveInversionDomain F E) : Prop :=
  forall selected jselected
    K A B jK jA jB
    truth rule result jtruth jrule jresult : Link F,
    RecursiveInversion F E D selected jselected ->
    RecursiveInversion F E D K jK ->
    RecursiveInversion F E D A jA ->
    RecursiveInversion F E D B jB ->
    RecursiveInversion F E D truth jtruth ->
    RecursiveInversion F E D rule jrule ->
    RecursiveInversion F E D result jresult ->
    ContextGeneralizedMPStep F E selected K A B truth rule result ->
    ContextGeneralizedMPStep
      F E jselected jK jA jB jtruth jrule jresult.

Theorem CTX_03_generalized_mp_semantic_covariance
    (F : Foundation)
    (A1 : A1RecursiveSeparation F)
    (N : F2F3Normalization F)
    (E : F2F3OneSidedExistence F)
    (D : RecursiveInversionDomain F E) :
    ContextGeneralizedMPCovarianceLaw F E D.
Proof.
  unfold ContextGeneralizedMPCovarianceLaw.
  intros selected jselected
    K A B jK jA jB
    truth rule result jtruth jrule jresult
    HMarkerInv HKInv HAInv HBInv
    HTruthInv HRuleInv HResultInv HStep.
  destruct HStep as [HTruth [HRule HResult]].
  split.
  - exact
      (CTX_03_semantic_arrow_covariant
        F A1 N E D
        selected jselected
        K A jK jA
        truth jtruth
        HMarkerInv HKInv HAInv HTruthInv HTruth).
  - split.
    + exact
        (CTX_03_semantic_arrow_covariant
          F A1 N E D
          selected jselected
          A B jA jB
          rule jrule
          HMarkerInv HAInv HBInv HRuleInv HRule).
    + exact
        (CTX_03_semantic_arrow_covariant
          F A1 N E D
          selected jselected
          K B jK jB
          result jresult
          HMarkerInv HKInv HBInv HResultInv HResult).
Qed.

(* Explicit non-covariant negative control.  Reading the technical first pole
   is definable, but it is not a Context-semantic operation. *)
Definition TechnicalStartOperation
    (F : Foundation)
    (input output : Link F) : Prop :=
  output = start F input.

Definition InversionCovariantUnaryOperation
    (F : Foundation)
    (E : F2F3OneSidedExistence F)
    (D : RecursiveInversionDomain F E)
    (Op : Link F -> Link F -> Prop) : Prop :=
  forall input jinput output joutput : Link F,
    RecursiveInversion F E D input jinput ->
    RecursiveInversion F E D output joutput ->
    Op input output ->
    Op jinput joutput.

Theorem CTX_03_technical_start_not_covariant
    (F : Foundation)
    (E : F2F3OneSidedExistence F)
    (D : RecursiveInversionDomain F E) :
    ~ InversionCovariantUnaryOperation
      F E D (TechnicalStartOperation F).
Proof.
  intros HCovariant.
  pose proof (CTX_03_direction_witness_inversion F E D) as HDirections.
  assert (HR : RecursiveInversion F E D (R F) (R F)).
  {
    apply recursive_inversion_root.
  }
  assert (
    HCO :
    RecursiveInversion F E D
      (f2f3_finish_root F E)
      (f2f3_start_root F E)
  ).
  {
    assert (
      HChild :
      RecursiveInversion F E D
        (start F (f2f3_finish_root F E))
        (R F)
    ).
    {
      rewrite (f2f3_finish_root_start F E).
      exact HR.
    }
    assert (
      HRaw :
      RecursiveInversion F E D
        (f2f3_finish_root F E)
        (recursive_start_form F E D (R F))
    ).
    {
      apply recursive_inversion_finish.
      - apply f2f3_finish_root_pattern.
      - exact HChild.
    }
    rewrite (recursive_start_root_compat F E D) in HRaw.
    exact HRaw.
  }
  assert (
    HSource :
    TechnicalStartOperation
      F (ContextInRWitness F E) (f2f3_finish_root F E)
  ).
  {
    unfold TechnicalStartOperation, ContextInRWitness.
    rewrite (form_start F (f2f3_finish_root F E) (R F)).
    reflexivity.
  }
  pose proof
    (HCovariant
      (ContextInRWitness F E)
      (ContextOutRWitness F E)
      (f2f3_finish_root F E)
      (f2f3_start_root F E)
      (proj1 HDirections)
      HCO
      HSource)
    as HMirror.
  unfold TechnicalStartOperation, ContextOutRWitness in HMirror.
  rewrite (form_start F (R F) (f2f3_start_root F E)) in HMirror.
  exact ((f2f3_start_root_ne_root F E) HMirror).
Qed.

Definition ContextChiBridgeLaw
    (F : Foundation)
    (E : F2F3OneSidedExistence F)
    (D : RecursiveInversionDomain F E) : Prop :=
  forall body selected : Link F,
    ContextOrientationMarker F E D body selected ->
    exists chi jchi : Link F,
      ContextChiWitness F E selected chi /\
      RecursiveInversion F E D chi jchi /\
      chi <> jchi /\
      ((chi = ContextInRWitness F E /\
        jchi = ContextOutRWitness F E) \/
       (chi = ContextOutRWitness F E /\
        jchi = ContextInRWitness F E)).

(* Strengthened CTX-03 semantic capstone. *)
Theorem CTX_03_semantic_covariance_capstone
    (F : Foundation)
    (A1 : A1RecursiveSeparation F)
    (N : F2F3Normalization F)
    (E : F2F3OneSidedExistence F)
    (D : RecursiveInversionDomain F E) :
    CTX_03_context_relative_gauge F A1 N E D /\
    ContextChiBridgeLaw F E D /\
    ContextGeneralizedMPCovarianceLaw F E D /\
    ~ InversionCovariantUnaryOperation
      F E D (TechnicalStartOperation F).
Proof.
  split.
  - exact (CTX_03_context_relative_gauge F A1 N E D).
  - split.
    + unfold ContextChiBridgeLaw.
      intros body selected HSelected.
      exact
        (CTX_03_chi_direction_bridge
          F A1 E D body selected HSelected).
    + split.
      * exact
          (CTX_03_generalized_mp_semantic_covariance F A1 N E D).
      * exact
          (CTX_03_technical_start_not_covariant F E D).
Qed.


(* CTX-03 capstone: objective chirality predates observation, Context selection
   induces only local START_K/END_K roles, and relative transport composes as
   the already-proved relational Z2 layer.

   The Z2 terminology is an explicitly marked external group-theory
   projection; native MTS content remains Link-native and Context-relative. *)
Theorem CTX_03_context_relative_gauge
    (F : Foundation)
    (A1 : A1RecursiveSeparation F)
    (N : F2F3Normalization F)
    (E : F2F3OneSidedExistence F)
    (D : RecursiveInversionDomain F E) :
    RelativeZ2Law F /\
    InversionIsMirrorTransport F E D /\
    (exists w jw : Link F,
      RecursiveInversion F E D w jw /\
      RecursiveInversion F E D jw w /\
      w <> jw /\
      OppositeChiralClass F w jw /\
      (forall z : Link F,
        RecursiveInversion F E D jw z -> z = w)) /\
    (forall body selected : Link F,
      ContextOrientationMarker F E D body selected ->
      exists localStart localEnd : Link F,
        ContextOrientationMarker F E D body localStart /\
        ContextOrientationMarker F E D body localEnd /\
        ContextLocalStartRole F selected localStart /\
        ContextLocalEndRole F selected localEnd /\
        localStart <> localEnd) /\
    (forall a b ja jb : Link F,
      RecursiveInversion F E D a ja ->
      RecursiveInversion F E D b jb ->
      (SameChiralClass F a b -> SameChiralClass F ja jb) /\
      (OppositeChiralClass F a b -> OppositeChiralClass F ja jb)).
Proof.
  pose proof
    (CTX_03_relational_z2_support F A1 N E D)
    as HSupport.
  destruct HSupport as [HZ2 HMirror].
  split.
  - exact HZ2.
  - split.
    + exact HMirror.
    + split.
      * exact (CTX_03_objective_chiral_orbit_before_context F A1 N E D).
      * split.
        -- intros body selected HSelected.
           exact
             (CTX_03_context_selection_induces_local_roles
               F A1 E D body selected HSelected).
        -- intros a b ja jb HJa HJb.
           exact
             (CTX_03_simultaneous_inversion_covariance
               F A1 N E D a b ja jb HJa HJb).
Qed.


(* FND-07 external projection of accepted contextual-truth semantics.

   EXTERNAL THEORY PROJECTION NOTE:
   no additional external mathematical theory is introduced here.
   CurrentScopeMember is only a Prop-valued relation in the Rocq host
   foundation. It projects the one published current Scope; it is not a native
   MTS predicate object and not an axiomatic-set-theory membership model.

   The structural truth witness remains the Link K -> A. *)
Definition ContextualTruthWitness
    (F : Foundation)
    (K A : Link F) : Link F :=
  form F K A.

Definition ContextualTruth
    (F : Foundation)
    (CurrentScopeMember : Link F -> Prop)
    (K A : Link F) : Prop :=
  CurrentScopeMember (ContextualTruthWitness F K A).

(* The parameter L denotes the accepted MTS truth-value Link L.  It is kept
   separate from ContextualTruthWitness because L is the truth value while
   K -> A is the contextual truth witness.  No universal structural
   disequality between them is asserted. *)
Definition TruthValueL
    (F : Foundation)
    (L : Link F) : Link F :=
  L.

(* FND-07 boundary theorem.

   Even the exact structural Link K -> A may exist as an ambient Link while
   not being current.  In that case it is not contextual truth. Conversely,
   contextual truth is witnessed by currentness of exactly that Link.

   No host Bool, Set, finite-set, map/environment, or collection object carries
   truth authority here. *)
Theorem FND_07_contextual_truth_boundary
    (F : Foundation)
    (CurrentScopeMember : Link F -> Prop)
    (L : Link F) :
    (forall K A : Link F,
      ContextualTruth F CurrentScopeMember K A <->
      CurrentScopeMember (form F K A)) /\
    (forall K A : Link F,
      ~ CurrentScopeMember (form F K A) ->
      exists ambientWitness : Link F,
        ambientWitness = form F K A /\
        ~ ContextualTruth F CurrentScopeMember K A) /\
    TruthValueL F L = L.
Proof.
  split.
  - intros K A.
    unfold ContextualTruth, ContextualTruthWitness.
    split.
    + intros H. exact H.
    + intros H. exact H.
  - split.
    + intros K A HNotCurrent.
      exists (form F K A).
      split.
      * reflexivity.
      * unfold ContextualTruth, ContextualTruthWitness.
        exact HNotCurrent.
    + reflexivity.
Qed.


(* FND-05 external proof projection of the accepted finite recursive Link
   codec.

   EXTERNAL THEORY PROJECTION NOTE:
   RecursiveDescriptionCode is a host inductive proof syntax used only by
   Rocq. It mirrors the recursive structural grammar ROOT /
   one-sided-start / one-sided-finish / PAIR, but it is not an MTS ontology
   datatype, not an Anum/Q carrier, and not semantic authority.

   No additional external mathematical theory is introduced here beyond the
   already-declared constructive inductive/propositional host proof methods. *)
Inductive RecursiveDescriptionCode : Type :=
| recursive_description_root : RecursiveDescriptionCode
| recursive_description_start_self :
    RecursiveDescriptionCode -> RecursiveDescriptionCode
| recursive_description_finish_self :
    RecursiveDescriptionCode -> RecursiveDescriptionCode
| recursive_description_pair :
    RecursiveDescriptionCode ->
    RecursiveDescriptionCode ->
    RecursiveDescriptionCode.

(* The declared finite recursive carrier supplies only the exact local
   self-incidence decisions required to read the structural grammar on a
   Grounded Link. Finiteness itself remains in the Grounded proof object. *)
Definition FiniteRecursiveCarrierDecision (F : Foundation) : Prop :=
  forall x : Link F,
    Grounded F x ->
    LocalSelfDecision F x.

(* Relational interpretation of one external recursive proof code as one Link.
   These constructors are proof rules over existing Link structure, not a
   second native MTS entity. *)
Inductive CanonicalRecursiveDescription
    (F : Foundation) :
    Link F -> RecursiveDescriptionCode -> Prop :=
| canonical_recursive_description_root :
    CanonicalRecursiveDescription F
      (R F)
      recursive_description_root
| canonical_recursive_description_start_self :
    forall (x : Link F) (child : RecursiveDescriptionCode),
      StartOnly F x ->
      CanonicalRecursiveDescription F (finish F x) child ->
      CanonicalRecursiveDescription F x
        (recursive_description_start_self child)
| canonical_recursive_description_finish_self :
    forall (x : Link F) (child : RecursiveDescriptionCode),
      FinishOnly F x ->
      CanonicalRecursiveDescription F (start F x) child ->
      CanonicalRecursiveDescription F x
        (recursive_description_finish_self child)
| canonical_recursive_description_pair :
    forall (x : Link F)
      (startCode finishCode : RecursiveDescriptionCode),
      PairLocal F x ->
      CanonicalRecursiveDescription F (start F x) startCode ->
      CanonicalRecursiveDescription F (finish F x) finishCode ->
      CanonicalRecursiveDescription F x
        (recursive_description_pair startCode finishCode).

(* Every Link in the declared finite ROOT-decomposable carrier has a recursive
   description. This consumes the proposition-level FND-01 four-way partition
   and FND-02 unique ROOT only. *)
Theorem FND_05_recursive_description_total
    (F : Foundation)
    (A1 : A1RecursiveSeparation F)
    (D : FiniteRecursiveCarrierDecision F)
    (x : Link F) :
    Grounded F x ->
    exists code : RecursiveDescriptionCode,
      CanonicalRecursiveDescription F x code.
Proof.
  intros G.
  induction G as [x StartStep IHStart FinishStep IHFinish].
  pose proof
    (D x (grounded_node F x StartStep FinishStep))
    as Decision.
  pose proof
    (local_self_incidence_exhaustive F x Decision)
    as Cases.
  destruct Cases as [HFull | [HStart | [HFinish | HPair]]].
  - pose proof (FND_02_unique_root F A1 x HFull) as HRoot.
    subst x.
    exists recursive_description_root.
    apply canonical_recursive_description_root.
  - destruct (IHFinish (proj2 HStart)) as [child HChild].
    exists (recursive_description_start_self child).
    apply canonical_recursive_description_start_self.
    + exact HStart.
    + exact HChild.
  - destruct (IHStart (proj1 HFinish)) as [child HChild].
    exists (recursive_description_finish_self child).
    apply canonical_recursive_description_finish_self.
    + exact HFinish.
    + exact HChild.
  - destruct (IHStart (proj1 HPair)) as [startCode HStartChild].
    destruct (IHFinish (proj2 HPair)) as [finishCode HFinishChild].
    exists (recursive_description_pair startCode finishCode).
    apply canonical_recursive_description_pair.
    + exact HPair.
    + exact HStartChild.
    + exact HFinishChild.
Qed.

(* One Link cannot have two different canonical recursive descriptions on the
   declared structural grammar. *)
Theorem recursive_description_functional
    (F : Foundation) :
    forall (x : Link F)
      (left right : RecursiveDescriptionCode),
      CanonicalRecursiveDescription F x left ->
      CanonicalRecursiveDescription F x right ->
      left = right.
Proof.
  intros x left right HLeft.
  revert right.
  induction HLeft as
    [ | x child HStart HChild IH
      | x child HFinish HChild IH
      | x startCode finishCode HPair HStartChild IHStart HFinishChild IHFinish ];
    intros right HRight.
  - inversion HRight; subst.
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
  - inversion HRight; subst.
    + exfalso.
      eapply recursive_full_start_disjoint.
      * apply root_full_self.
      * exact HStart.
    + apply f_equal.
      apply IH.
      assumption.
    + exfalso.
      eapply recursive_start_finish_disjoint.
      * exact HStart.
      * eassumption.
    + exfalso.
      eapply recursive_start_pair_disjoint.
      * exact HStart.
      * eassumption.
  - inversion HRight; subst.
    + exfalso.
      eapply recursive_full_finish_disjoint.
      * apply root_full_self.
      * exact HFinish.
    + exfalso.
      eapply recursive_start_finish_disjoint.
      * eassumption.
      * exact HFinish.
    + apply f_equal.
      apply IH.
      assumption.
    + exfalso.
      eapply recursive_finish_pair_disjoint.
      * exact HFinish.
      * eassumption.
  - inversion HRight; subst.
    + exfalso.
      eapply recursive_full_pair_disjoint.
      * apply root_full_self.
      * exact HPair.
    + exfalso.
      eapply recursive_start_pair_disjoint.
      * eassumption.
      * exact HPair.
    + exfalso.
      eapply recursive_finish_pair_disjoint.
      * eassumption.
      * exact HPair.
    + assert (HS : startCode = startCode0).
      {
        apply IHStart.
        assumption.
      }
      assert (HF : finishCode = finishCode0).
      {
        apply IHFinish.
        assumption.
      }
      rewrite HS, HF.
      reflexivity.
Qed.

(* FND-05 capstone: canonical recursive structural description exists uniquely
   on the explicitly declared finite ROOT-decomposable carrier domain.

   This does not extend to arbitrary non-well-founded distinct-node cycles and
   says nothing about sequential Anum/Q identity. *)
Theorem FND_05_canonical_recursive_description_unique
    (F : Foundation)
    (A1 : A1RecursiveSeparation F)
    (D : FiniteRecursiveCarrierDecision F)
    (x : Link F) :
    Grounded F x ->
    exists code : RecursiveDescriptionCode,
      CanonicalRecursiveDescription F x code /\
      forall other : RecursiveDescriptionCode,
        CanonicalRecursiveDescription F x other ->
        other = code.
Proof.
  intros G.
  destruct
    (FND_05_recursive_description_total F A1 D x G)
    as [code HCode].
  exists code.
  split.
  - exact HCode.
  - intros other HOther.
    exact
      (recursive_description_functional
        F x other code HOther HCode).
Qed.


(* FND-11 external proof vocabulary for representation identity targets.

   EXTERNAL THEORY PROJECTION NOTE:
   RepresentationIdentityTarget is a host-side classifier of already accepted
   representation contracts. It is not an MTS ontology datatype and does not
   add entities beside Link. No additional external mathematical theory is
   introduced here; the proof uses only constructive propositions, equality,
   functions and small inductive host syntax. *)
Inductive RepresentationIdentityTarget : Type :=
| representation_recursive_link_structure
| representation_anum_rooted_sequence
| representation_exact_positional_sequence
| representation_rooted_fold_denotation
| representation_versioned_q_denotation.

Definition recursive_codec_identity_target : RepresentationIdentityTarget :=
  representation_recursive_link_structure.

Definition anum_identity_target : RepresentationIdentityTarget :=
  representation_anum_rooted_sequence.

Definition exact_sequence_identity_target : RepresentationIdentityTarget :=
  representation_exact_positional_sequence.

Definition fold_denotation_identity_target : RepresentationIdentityTarget :=
  representation_rooted_fold_denotation.

Definition q_identity_target : RepresentationIdentityTarget :=
  representation_versioned_q_denotation.

Lemma recursive_codec_target_ne_anum :
    recursive_codec_identity_target <> anum_identity_target.
Proof.
  discriminate.
Qed.

Lemma exact_sequence_target_ne_fold :
    exact_sequence_identity_target <> fold_denotation_identity_target.
Proof.
  discriminate.
Qed.

(* Projection of the accepted v0.14 representation-layer definitions.

   Anum and ExactSequence are modeled as predicates over the one Link carrier,
   not as new MTS sorts. QVersion/QSource are external source/interpreter
   syntax, not ontology entities.

   The concrete witnesses correspond to accepted executable vectors:
   - ExactSequence [] and [R] are distinct carriers but share rooted fold R;
   - Q14 empty source and [] are distinct sources but both denote R. *)
Record AcceptedV014RepresentationDefinitions (F : Foundation) : Type := {
  anum_carrier : Link F -> Prop;
  exact_sequence_carrier : Link F -> Prop;

  anum_origin : Link F -> Link F;
  exact_sequence_origin : Link F -> Link F;

  anum_origin_root :
    forall a : Link F,
      anum_carrier a ->
      anum_origin a = R F;

  exact_sequence_origin_root :
    forall s : Link F,
      exact_sequence_carrier s ->
      exact_sequence_origin s = R F;

  exact_fold : Link F -> Link F;

  exact_empty : Link F;
  exact_one_root : Link F;
  exact_empty_carrier : exact_sequence_carrier exact_empty;
  exact_one_root_carrier : exact_sequence_carrier exact_one_root;
  exact_empty_ne_one_root : exact_empty <> exact_one_root;
  exact_fold_empty : exact_fold exact_empty = R F;
  exact_fold_one_root : exact_fold exact_one_root = R F;

  q_version : Type;
  q_source : Type;

  q_origin : q_version -> q_source -> Link F;
  q_interpret : q_version -> q_source -> Link F;

  q_origin_root :
    forall (version : q_version) (source : q_source),
      q_origin version source = R F;

  q14 : q_version;
  q_empty : q_source;
  q_nested_empty : q_source;
  q_empty_ne_nested : q_empty <> q_nested_empty;
  q_empty_denotes_root : q_interpret q14 q_empty = R F;
  q_nested_denotes_root : q_interpret q14 q_nested_empty = R F
}.

(* The established FND-05 result recast as a dependency proposition.

   FND-11 receives a proof of this proposition as its declared theorem
   dependency; FND-05 premises are not imported as new FND-11 assumptions. *)
Definition FND05Canonicality (F : Foundation) : Prop :=
  forall x : Link F,
    Grounded F x ->
    exists code : RecursiveDescriptionCode,
      CanonicalRecursiveDescription F x code /\
      forall other : RecursiveDescriptionCode,
        CanonicalRecursiveDescription F x other ->
        other = code.

Theorem fnd05_dependency_witness
    (F : Foundation)
    (A1 : A1RecursiveSeparation F)
    (D : FiniteRecursiveCarrierDecision F) :
    FND05Canonicality F.
Proof.
  unfold FND05Canonicality.
  intros x G.
  exact (FND_05_canonical_recursive_description_unique F A1 D x G).
Qed.

Definition ExactSequenceFoldCollision
    (F : Foundation)
    (B : AcceptedV014RepresentationDefinitions F) : Prop :=
  exists left right : Link F,
    exact_sequence_carrier F B left /\
    exact_sequence_carrier F B right /\
    left <> right /\
    exact_fold F B left = exact_fold F B right.

Definition QDenotationCollision
    (F : Foundation)
    (B : AcceptedV014RepresentationDefinitions F) : Prop :=
  exists left right : q_source F B,
    left <> right /\
    q_interpret F B (q14 F B) left =
    q_interpret F B (q14 F B) right.

Theorem exact_sequence_fold_collision
    (F : Foundation)
    (B : AcceptedV014RepresentationDefinitions F) :
    ExactSequenceFoldCollision F B.
Proof.
  exists (exact_empty F B).
  exists (exact_one_root F B).
  split.
  - exact (exact_empty_carrier F B).
  - split.
    + exact (exact_one_root_carrier F B).
    + split.
      * exact (exact_empty_ne_one_root F B).
      * transitivity (R F).
        -- exact (exact_fold_empty F B).
        -- symmetry.
           exact (exact_fold_one_root F B).
Qed.

Theorem q_denotation_collision
    (F : Foundation)
    (B : AcceptedV014RepresentationDefinitions F) :
    QDenotationCollision F B.
Proof.
  exists (q_empty F B).
  exists (q_nested_empty F B).
  split.
  - exact (q_empty_ne_nested F B).
  - transitivity (R F).
    + exact (q_empty_denotes_root F B).
    + symmetry.
      exact (q_nested_denotes_root F B).
Qed.

(* FND-11 capstone.

   Accepted representation definitions plus the already-established FND-05
   result imply separated identity roles:
   recursive structural canonicality, rooted sequence origins, ExactSequence
   positional identity distinct from fold denotation, and versioned Q
   interpretation whose source identity may collapse at denotation.

   No global recursive-structure/Q isomorphism and no representation-strength
   ranking are asserted. *)
Theorem FND_11_representation_identities_separated
    (F : Foundation)
    (B : AcceptedV014RepresentationDefinitions F) :
    FND05Canonicality F ->
    FND05Canonicality F /\
    recursive_codec_identity_target <> anum_identity_target /\
    (forall a : Link F,
      anum_carrier F B a ->
      anum_origin F B a = R F) /\
    (forall s : Link F,
      exact_sequence_carrier F B s ->
      exact_sequence_origin F B s = R F) /\
    ExactSequenceFoldCollision F B /\
    (forall (version : q_version F B) (source : q_source F B),
      q_origin F B version source = R F) /\
    QDenotationCollision F B.
Proof.
  intros FND05.
  split.
  - exact FND05.
  - split.
    + exact recursive_codec_target_ne_anum.
    + split.
      * intros a HA.
        exact (anum_origin_root F B a HA).
      * split.
        -- intros s HS.
           exact (exact_sequence_origin_root F B s HS).
        -- split.
           ++ exact (exact_sequence_fold_collision F B).
           ++ split.
              ** intros version source.
                 exact (q_origin_root F B version source).
              ** exact (q_denotation_collision F B).
Qed.
