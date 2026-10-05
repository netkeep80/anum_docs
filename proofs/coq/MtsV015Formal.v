(*
MTS v0.15 EXTERNAL FORMAL SOUNDNESS BOOTSTRAP

This file mirrors the Lean mathematical model for the currently selected
FORMAL fragment. Rocq types/lists/Props are verifier machinery only.
*)

From Coq Require Import List.
Import ListNotations.

Section FormalBootstrap.

Context {Link : Type}.
Variable pair : Link -> Link -> Link.

Fixpoint resolve_path (context : Link) (names : list Link) : Link :=
  match names with
  | [] => context
  | name :: rest => resolve_path (pair context name) rest
  end.

Definition absolute_name (root name : Link) : Link :=
  resolve_path root [name].

Theorem FRM_01_absolute_contextual_name
    (root name : Link) :
    absolute_name root name = pair root name.
Proof.
  reflexivity.
Qed.

Inductive SourceRole : Type :=
| Bare : Link -> SourceRole
| Binding : Link -> Link -> SourceRole
| EmptyBundle : Link -> SourceRole.

Definition semantic_members
    (context : option Link)
    (role : SourceRole) : list Link :=
  match role, context with
  | Bare value, None => [value]
  | Bare value, Some anchor => [pair anchor value]
  | Binding _ _, None => []
  | Binding name _, Some anchor => [pair anchor name]
  | EmptyBundle _, None => []
  | EmptyBundle name, Some anchor => [pair anchor name]
  end.

Theorem FRM_02_root_source_role_separation
    (name value : Link) :
    semantic_members None (Bare value) = [value] /\
    semantic_members None (Binding name value) = [] /\
    semantic_members None (EmptyBundle name) = [].
Proof.
  repeat split; reflexivity.
Qed.

Theorem FRM_02_nested_source_role_membership
    (context name value : Link) :
    semantic_members (Some context) (Bare value) = [pair context value] /\
    semantic_members (Some context) (Binding name value) = [pair context name] /\
    semantic_members (Some context) (EmptyBundle name) = [pair context name].
Proof.
  repeat split; reflexivity.
Qed.

Definition direct_sequential_association (values : list Link) : option Link :=
  match values with
  | [] => None
  | head :: tail => Some (fold_left pair tail head)
  end.

Theorem FRM_03_direct_sequential_association_three
    (a b c : Link) :
    direct_sequential_association [a; b; c] =
      Some (pair (pair a b) c).
Proof.
  reflexivity.
Qed.

Record ExactSequenceKernel : Type := {
  exact_root : Link;
  exact_encode : list Link -> Link;
  exact_empty_root : exact_encode [] = exact_root;
  exact_injective :
    forall xs ys,
      exact_encode xs = exact_encode ys ->
      xs = ys
}.

Theorem FRM_04_empty_exact_sequence_is_root
    (K : ExactSequenceKernel) :
    exact_encode K [] = exact_root K.
Proof.
  apply exact_empty_root.
Qed.

Theorem FRM_04_single_root_distinct_from_empty
    (K : ExactSequenceKernel) :
    exact_encode K [exact_root K] <> exact_encode K [].
Proof.
  intro H.
  pose proof (exact_injective K [exact_root K] [] H) as E.
  discriminate E.
Qed.

Theorem FRM_04_two_roots_distinct_from_one
    (K : ExactSequenceKernel) :
    exact_encode K [exact_root K; exact_root K] <>
    exact_encode K [exact_root K].
Proof.
  intro H.
  pose proof
    (exact_injective K
      [exact_root K; exact_root K]
      [exact_root K]
      H) as E.
  discriminate E.
Qed.

End FormalBootstrap.

Section SharedSource.

Context {Formal Json Source Semantic : Type}.

Record DualSurface : Type := {
  from_formal : Formal -> Source;
  from_json : Json -> Source
}.

Theorem FRM_05_shared_source_implies_shared_denotation
    (D : DualSurface)
    (denote : Source -> Semantic)
    (formal : Formal)
    (json : Json)
    (same_source : from_formal D formal = from_json D json) :
    denote (from_formal D formal) = denote (from_json D json).
Proof.
  now rewrite same_source.
Qed.

End SharedSource.

Section MetaCompilation.

Context {Semantic Recursive : Type}.

Record MetaCompiler : Type := {
  mc_compile : Semantic -> Recursive;
  mc_decode : Recursive -> Semantic;
  mc_round_trip :
    forall semantic,
      mc_decode (mc_compile semantic) = semantic
}.

Theorem FRM_06_metacompiler_preserves_semantics
    (M : MetaCompiler)
    (semantic : Semantic) :
    mc_decode M (mc_compile M semantic) = semantic.
Proof.
  apply mc_round_trip.
Qed.

End MetaCompilation.

Print Assumptions FRM_01_absolute_contextual_name.
Print Assumptions FRM_02_root_source_role_separation.
Print Assumptions FRM_02_nested_source_role_membership.
Print Assumptions FRM_03_direct_sequential_association_three.
Print Assumptions FRM_04_empty_exact_sequence_is_root.
Print Assumptions FRM_04_single_root_distinct_from_empty.
Print Assumptions FRM_04_two_roots_distinct_from_one.
Print Assumptions FRM_05_shared_source_implies_shared_denotation.
Print Assumptions FRM_06_metacompiler_preserves_semantics.

Section ProductionRefinement.

Context {Formal Json Source Semantic Recursive : Type}.

Record ProductionArtifactRefinement : Type := {
  pr_from_formal : Formal -> Source;
  pr_from_json : Json -> Source;
  pr_denote : Source -> Semantic;
  pr_compile : Semantic -> Recursive;
  pr_decode : Recursive -> Semantic;
  pr_recursive_left_inverse :
    forall semantic,
      pr_decode (pr_compile semantic) = semantic
}.

Theorem FRM_07_approved_artifact_refinement
    (P : ProductionArtifactRefinement)
    (formal : Formal)
    (json : Json)
    (same_source : pr_from_formal P formal = pr_from_json P json) :
    pr_decode P (pr_compile P (pr_denote P (pr_from_formal P formal))) =
      pr_denote P (pr_from_json P json).
Proof.
  rewrite (pr_recursive_left_inverse P (pr_denote P (pr_from_formal P formal))).
  now rewrite same_source.
Qed.

End ProductionRefinement.

Section ExactSequenceLeftInverse.

Context {Link : Type}.

Record ExactSequenceLeftInverse : Type := {
  es_encode : list Link -> Link;
  es_read : Link -> list Link;
  es_left_inverse :
    forall values,
      es_read (es_encode values) = values
}.

Theorem FRM_07_exact_sequence_injective_from_left_inverse
    (E : ExactSequenceLeftInverse) :
    forall a b,
      es_encode E a = es_encode E b ->
      a = b.
Proof.
  intros a b H.
  apply (f_equal (es_read E)) in H.
  now rewrite (es_left_inverse E a), (es_left_inverse E b) in H.
Qed.

End ExactSequenceLeftInverse.

Print Assumptions FRM_07_approved_artifact_refinement.
Print Assumptions FRM_07_exact_sequence_injective_from_left_inverse.

Section StructuralAspects.

Context {Link : Type}.

Inductive StructuralAspectExpr : Type :=
| SA_Root : StructuralAspectExpr
| SA_Atom : Link -> StructuralAspectExpr
| SA_Start : StructuralAspectExpr -> StructuralAspectExpr
| SA_Finish : StructuralAspectExpr -> StructuralAspectExpr
| SA_Pair : StructuralAspectExpr -> StructuralAspectExpr ->
    StructuralAspectExpr.

Fixpoint denote_structural_aspect
    (root : Link)
    (start finish : Link -> Link)
    (pair : Link -> Link -> Link)
    (expr : StructuralAspectExpr) : Link :=
  match expr with
  | SA_Root => root
  | SA_Atom value => value
  | SA_Start child =>
      start (denote_structural_aspect root start finish pair child)
  | SA_Finish child =>
      finish (denote_structural_aspect root start finish pair child)
  | SA_Pair left right =>
      pair
        (denote_structural_aspect root start finish pair left)
        (denote_structural_aspect root start finish pair right)
  end.

Theorem FRM_08_structural_aspect_denotation
    (root : Link)
    (start finish : Link -> Link)
    (pair : Link -> Link -> Link)
    (a b : Link) :
    denote_structural_aspect root start finish pair SA_Root = root /\
    denote_structural_aspect root start finish pair (SA_Start (SA_Atom a)) =
      start a /\
    denote_structural_aspect root start finish pair (SA_Finish (SA_Atom a)) =
      finish a /\
    denote_structural_aspect root start finish pair
      (SA_Pair (SA_Atom a) (SA_Atom b)) = pair a b /\
    denote_structural_aspect root start finish pair
      (SA_Start (SA_Pair (SA_Atom a) (SA_Atom b))) =
      start (pair a b).
Proof.
  repeat split; reflexivity.
Qed.

End StructuralAspects.

Print Assumptions FRM_08_structural_aspect_denotation.
