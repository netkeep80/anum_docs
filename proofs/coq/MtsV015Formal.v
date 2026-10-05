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
