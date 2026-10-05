/-
MTS v0.15 EXTERNAL FORMAL SOUNDNESS BOOTSTRAP

This file formalizes a small mathematical model of the currently selected
FORMAL fragment. Lean types, Lists and Props are verifier machinery only.

The theorems below are deliberately classified by their exact assumptions.
They do NOT claim that the production parser/compiler is already proved.
-/

namespace MTS.V015.FormalExternal

def resolvePath {Link : Type}
    (pair : Link → Link → Link)
    (context : Link) : List Link → Link
  | [] => context
  | name :: rest => resolvePath pair (pair context name) rest

def absoluteName {Link : Type}
    (pair : Link → Link → Link)
    (root name : Link) : Link :=
  resolvePath pair root [name]

/-- FRM-01: absolute contextual name :A is the one-step path R:A. -/
theorem FRM_01_absolute_contextual_name
    {Link : Type}
    (pair : Link → Link → Link)
    (root name : Link) :
    absoluteName pair root name = pair root name := by
  rfl

inductive SourceRole (Link : Type) where
  | bare (value : Link)
  | binding (name value : Link)
  | emptyBundle (name : Link)

def semanticMembers {Link : Type}
    (pair : Link → Link → Link)
    (context : Option Link) :
    SourceRole Link → List Link
  | .bare value =>
      match context with
      | none => [value]
      | some anchor => [pair anchor value]
  | .binding name _ =>
      match context with
      | none => []
      | some anchor => [pair anchor name]
  | .emptyBundle name =>
      match context with
      | none => []
      | some anchor => [pair anchor name]

/--
FRM-02a: at the root, bare membership is semantic membership while a binding
or an explicit empty bundle does not by itself publish root membership.
-/
theorem FRM_02_root_source_role_separation
    {Link : Type}
    (pair : Link → Link → Link)
    (name value : Link) :
    semanticMembers pair none (.bare value) = [value] ∧
    semanticMembers pair none (.binding name value) = [] ∧
    semanticMembers pair none (.emptyBundle name) = [] := by
  constructor
  · rfl
  constructor
  · rfl
  · rfl

/--
FRM-02b: inside an explicit context, bare values and local names publish the
context-qualified semantic member selected by the current source-role law.
-/
theorem FRM_02_nested_source_role_membership
    {Link : Type}
    (pair : Link → Link → Link)
    (context name value : Link) :
    semanticMembers pair (some context) (.bare value) =
        [pair context value] ∧
    semanticMembers pair (some context) (.binding name value) =
        [pair context name] ∧
    semanticMembers pair (some context) (.emptyBundle name) =
        [pair context name] := by
  constructor
  · rfl
  constructor
  · rfl
  · rfl

def directSequentialAssociation {Link : Type}
    (pair : Link → Link → Link) : List Link → Option Link
  | [] => none
  | head :: tail => some (tail.foldl pair head)

/-- FRM-03: three ungrouped terms lower left-to-right, not algebraically. -/
theorem FRM_03_direct_sequential_association_three
    {Link : Type}
    (pair : Link → Link → Link)
    (a b c : Link) :
    directSequentialAssociation pair [a, b, c] =
      some (pair (pair a b) c) := by
  rfl

structure ExactSequenceKernel (Link : Type) where
  root : Link
  encode : List Link → Link
  emptyRoot : encode [] = root
  injective : Function.Injective encode

/-- FRM-04a: the empty exact sequence denotes the declared root. -/
theorem FRM_04_empty_exact_sequence_is_root
    {Link : Type}
    (K : ExactSequenceKernel Link) :
    K.encode [] = K.root :=
  K.emptyRoot

/-- FRM-04b: positional cardinality distinguishes [] from [R]. -/
theorem FRM_04_single_root_distinct_from_empty
    {Link : Type}
    (K : ExactSequenceKernel Link) :
    K.encode [K.root] ≠ K.encode [] := by
  intro h
  have listsEqual : [K.root] = [] := K.injective h
  cases listsEqual

/-- FRM-04c: positional cardinality distinguishes [R,R] from [R]. -/
theorem FRM_04_two_roots_distinct_from_one
    {Link : Type}
    (K : ExactSequenceKernel Link) :
    K.encode [K.root, K.root] ≠ K.encode [K.root] := by
  intro h
  have listsEqual : [K.root, K.root] = [K.root] := K.injective h
  cases listsEqual

structure DualSurface (Formal Json Source : Type) where
  fromFormal : Formal → Source
  fromJson : Json → Source

/--
FRM-05: once FORMAL and JSON reconstruct the same native source ANet,
any shared denotation function must produce the same semantic value.
-/
theorem FRM_05_shared_source_implies_shared_denotation
    {Formal Json Source Semantic : Type}
    (D : DualSurface Formal Json Source)
    (denote : Source → Semantic)
    (formal : Formal)
    (json : Json)
    (sameSource : D.fromFormal formal = D.fromJson json) :
    denote (D.fromFormal formal) = denote (D.fromJson json) := by
  exact congrArg denote sameSource

structure MetaCompiler (Semantic Recursive : Type) where
  compile : Semantic → Recursive
  decode : Recursive → Semantic
  roundTrip : ∀ semantic, decode (compile semantic) = semantic

/--
FRM-06 bootstrap: semantic preservation follows from the explicit
metacompiler round-trip law. Proving that production metacompilation satisfies
this law is a separate refinement obligation under #2004.
-/
theorem FRM_06_metacompiler_preserves_semantics
    {Semantic Recursive : Type}
    (M : MetaCompiler Semantic Recursive)
    (semantic : Semantic) :
    M.decode (M.compile semantic) = semantic :=
  M.roundTrip semantic

end MTS.V015.FormalExternal
