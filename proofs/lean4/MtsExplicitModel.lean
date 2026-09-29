/-
EXPLICIT MODEL SLICE FOR #1796

This file is compiled only after proofs/lean4/MtsFoundation.lean has been
prepended by CI. Host List/Bool coding is external model machinery; it is not
MTS ontology, notation, or semantic authority.

The carrier is intentionally infinite. Canonical Link forms are represented
inside one List Bool carrier:
  ROOT       = []
  START(a)   = 01 ++ a
  END(a)     = 10 ++ a
  PAIR(a,b)  = 11 ++ escaped(a) ++ delimiter ++ b

The dedicated START/END encodings are fixed points of the corresponding form
sections, while PAIR is an injective self-delimiting encoding. Non-canonical
carrier values remain possible; later #1796 slices prove that they cannot enter
the finite Grounded replay domain.
-/

namespace MTS.External.Model1796

abbrev ModelLink := List Bool

def root : ModelLink := []

def startForm (a : ModelLink) : ModelLink :=
  false :: true :: a

def endForm (a : ModelLink) : ModelLink :=
  true :: false :: a

def badStart : ModelLink := [false]

def badFinish : ModelLink := [true]

/--
Self-delimiting encoding of the left pole.
Each source bit is escaped by a leading false; the first unescaped true is the
delimiter. The remaining suffix is therefore available verbatim for the right
pole.
-/
def encodeLeft : ModelLink → ModelLink
  | [] => [true]
  | false :: tail => false :: false :: encodeLeft tail
  | true :: tail => false :: true :: encodeLeft tail

def decodeLeft : ModelLink → Option (ModelLink × ModelLink)
  | [] => none
  | true :: rest => some ([], rest)
  | false :: [] => none
  | false :: false :: rest =>
      match decodeLeft rest with
      | none => none
      | some (left, right) => some (false :: left, right)
  | false :: true :: rest =>
      match decodeLeft rest with
      | none => none
      | some (left, right) => some (true :: left, right)

theorem decodeLeft_encodeLeft_append
    (left right : ModelLink) :
    decodeLeft (encodeLeft left ++ right) = some (left, right) := by
  induction left with
  | nil =>
      rfl
  | cons bit tail ih =>
      cases bit <;> simp [encodeLeft, decodeLeft, ih]

def pairCode (left right : ModelLink) : ModelLink :=
  true :: true :: (encodeLeft left ++ right)

/--
Decode only canonical model forms.

Singleton 0/1 and malformed encodings deliberately decode to none. They remain
ambient Links but receive the non-Grounded fallback poles below.
-/
def decode : ModelLink → Option (ModelLink × ModelLink)
  | [] => some (root, root)
  | false :: true :: rest =>
      some (startForm rest, rest)
  | true :: false :: rest =>
      some (rest, endForm rest)
  | true :: true :: rest =>
      decodeLeft rest
  | _ =>
      none

@[simp] theorem decode_root :
    decode root = some (root, root) :=
  rfl

@[simp] theorem decode_startForm (a : ModelLink) :
    decode (startForm a) = some (startForm a, a) :=
  rfl

@[simp] theorem decode_endForm (a : ModelLink) :
    decode (endForm a) = some (a, endForm a) :=
  rfl

@[simp] theorem decode_pairCode (a b : ModelLink) :
    decode (pairCode a b) = some (a, b) := by
  simp [pairCode, decode, decodeLeft_encodeLeft_append]

@[simp] theorem startForm_ne_root (a : ModelLink) :
    startForm a ≠ root := by
  simp [startForm, root]

@[simp] theorem endForm_ne_root (a : ModelLink) :
    endForm a ≠ root := by
  simp [endForm, root]

theorem no_start_end_overlap (a : ModelLink) :
    a ≠ startForm (endForm a) := by
  intro h
  have hLength :
      a.length = a.length + 1 + 1 + 1 + 1 := by
    simpa [startForm, endForm] using congrArg List.length h
  have h1 : a.length < a.length + 1 :=
    Nat.lt_succ_self a.length
  have h2 : a.length + 1 < a.length + 1 + 1 :=
    Nat.lt_succ_self (a.length + 1)
  have h3 : a.length + 1 + 1 < a.length + 1 + 1 + 1 :=
    Nat.lt_succ_self (a.length + 1 + 1)
  have h4 : a.length + 1 + 1 + 1 < a.length + 1 + 1 + 1 + 1 :=
    Nat.lt_succ_self (a.length + 1 + 1 + 1)
  have hLt : a.length < a.length + 1 + 1 + 1 + 1 :=
    Nat.lt_trans h1 (Nat.lt_trans h2 (Nat.lt_trans h3 h4))
  exact (Nat.ne_of_lt hLt) hLength

/--
One total Link-forming primitive.

The first three branches enforce exactly the recursive fixed-point equations
needed by ROOT, START(F), and END(F). Every other ordered pair is encoded by
the generic self-delimiting PAIR representation.
-/
def form (a b : ModelLink) : ModelLink :=
  if _hRoot : a = root ∧ b = root then
    root
  else if _hStart : a = startForm b then
    a
  else if _hEnd : b = endForm a then
    b
  else
    pairCode a b

theorem decode_form (a b : ModelLink) :
    decode (form a b) = some (a, b) := by
  by_cases hRoot : a = root ∧ b = root
  · rcases hRoot with ⟨rfl, rfl⟩
    simp [form]
  · by_cases hStart : a = startForm b
    · rw [hStart]
      simp [form]
    · by_cases hEnd : b = endForm a
      · rw [hEnd]
        simp [form, hStart, no_start_end_overlap]
      · simp [form, hRoot, hStart, hEnd]

def start (x : ModelLink) : ModelLink :=
  match decode x with
  | some poles =>
      if x = form poles.1 poles.2 then poles.1 else badStart
  | none => badStart

def finish (x : ModelLink) : ModelLink :=
  match decode x with
  | some poles =>
      if x = form poles.1 poles.2 then poles.2 else badFinish
  | none => badFinish

@[simp] theorem start_form (a b : ModelLink) :
    start (form a b) = a := by
  simp [start, decode_form]

@[simp] theorem finish_form (a b : ModelLink) :
    finish (form a b) = b := by
  simp [finish, decode_form]

@[simp] theorem form_root_root :
    form root root = root := by
  simp [form]

abbrev ExplicitFoundation : Foundation where
  Link := ModelLink
  form := form
  start := start
  finish := finish
  R := root

  form_start := start_form
  form_finish := finish_form
  root_self := form_root_root

@[simp] theorem form_startForm (a : ModelLink) :
    form (startForm a) a = startForm a := by
  simp [form]

@[simp] theorem form_endForm (a : ModelLink) :
    form a (endForm a) = endForm a := by
  simp [form, no_start_end_overlap]

/--
The model supplies proper one-sided witnesses around ROOT without adding
one-sided constructors to the MTS Foundation interface.
-/
abbrev ExplicitOneSided : F2F3OneSidedExistence ExplicitFoundation where
  startRoot := startForm root
  finishRoot := endForm root

  startRootEquation := by
    change startForm root = form (startForm root) root
    simp

  finishRootEquation := by
    change endForm root = form root (endForm root)
    simp

  startRootNeRoot := by
    change startForm root ≠ root
    exact startForm_ne_root root

  finishRootNeRoot := by
    change endForm root ≠ root
    exact endForm_ne_root root

theorem explicit_local_decision
    (x : ExplicitFoundation.Link) :
    LocalSelfDecision ExplicitFoundation x := by
  letI : DecidableEq ExplicitFoundation.Link := by
    change DecidableEq ModelLink
    infer_instance
  unfold LocalSelfDecision StartSelf FinishSelf
  constructor
  · by_cases h : ExplicitFoundation.start x = x
    · exact Or.inl h
    · exact Or.inr h
  · by_cases h : ExplicitFoundation.finish x = x
    · exact Or.inl h
    · exact Or.inr h

/--
The historical recursive START(F)/END(F) witness exists for every ambient Link.
Local classification decisions are computational equality decisions on the host
List Bool representation and carry no MTS semantic authority.
-/
def ExplicitInversionDomain :
    RecursiveInversionDomain ExplicitFoundation ExplicitOneSided where
  startForm := startForm
  endForm := endForm

  startEquation := by
    intro a
    change startForm a = form (startForm a) a
    simp

  endEquation := by
    intro a
    change endForm a = form a (endForm a)
    simp

  startRootCompat := rfl
  endRootCompat := rfl

  decide := by
    intro x _gx
    exact explicit_local_decision x

/--
External model-only predicate: a Link is canonical exactly when it is in the
image of the one primitive `form`. This is host evidence about this concrete
model, not a new MTS ontology predicate.
-/
def CanonicalImage (x : ModelLink) : Prop :=
  ∃ a b : ModelLink, x = form a b

@[simp] theorem start_badStart :
    start badStart = badStart := by
  rfl

@[simp] theorem finish_badStart :
    finish badStart = badFinish := by
  rfl

@[simp] theorem start_badFinish :
    start badFinish = badStart := by
  rfl

@[simp] theorem finish_badFinish :
    finish badFinish = badFinish := by
  rfl

@[simp] theorem badStart_ne_badFinish :
    badStart ≠ badFinish := by
  simp [badStart, badFinish]

/--
The two fallback Links form a non-well-founded two-node obligation cycle.
Because `Grounded` is finite inductive evidence, neither endpoint of this
cycle can be Grounded.
-/
theorem fallback_cycle_not_grounded
    {x : ModelLink}
    (gx : Grounded ExplicitFoundation x) :
    x = badStart ∨ x = badFinish → False := by
  induction gx with
  | @node current startStep finishStep ihStart ihFinish =>
      intro hBad
      rcases hBad with hStart | hFinish
      · subst current
        have hne : ExplicitFoundation.finish badStart ≠ badStart := by
          simpa using badStart_ne_badFinish.symm
        exact ihFinish hne (Or.inr finish_badStart)
      · subst current
        have hne : ExplicitFoundation.start badFinish ≠ badFinish := by
          simpa using badStart_ne_badFinish
        exact ihStart hne (Or.inl start_badFinish)

theorem badStart_not_grounded :
    ¬ Grounded ExplicitFoundation badStart := by
  intro gx
  exact fallback_cycle_not_grounded gx (Or.inl rfl)

theorem badFinish_not_grounded :
    ¬ Grounded ExplicitFoundation badFinish := by
  intro gx
  exact fallback_cycle_not_grounded gx (Or.inr rfl)

/--
Any decodable value that is not the exact re-encoding of its poles is rejected
by the projection boundary and receives the fallback start pole.
-/
theorem start_fallback_of_not_canonical
    {x : ModelLink}
    (hNot : ¬ CanonicalImage x) :
    start x = badStart := by
  unfold start
  cases hDecode : decode x with
  | none =>
      rfl
  | some poles =>
      by_cases hCanonical : x = form poles.1 poles.2
      · exact False.elim (hNot ⟨poles.1, poles.2, hCanonical⟩)
      · simp [hDecode, hCanonical]

/--
Finite Grounded evidence can therefore exist only for an exact image of
`form`. Malformed and duplicate host encodings remain ambient Links, but
cannot enter the finite semantic replay domain.
-/
theorem grounded_is_canonical
    {x : ModelLink}
    (gx : Grounded ExplicitFoundation x) :
    CanonicalImage x := by
  by_contra hNot
  have hStart : start x = badStart :=
    start_fallback_of_not_canonical hNot
  by_cases hx : x = badStart
  · subst x
    exact badStart_not_grounded gx
  · cases gx with
    | node startStep finishStep =>
        have hStartNe : ExplicitFoundation.start x ≠ x := by
          intro hEq
          apply hx
          calc
            x = ExplicitFoundation.start x := hEq.symm
            _ = badStart := hStart
        have gBad : Grounded ExplicitFoundation badStart := by
          simpa [hStart] using startStep hStartNe
        exact badStart_not_grounded gBad

/--
Concrete Grounded normalization for the explicit model.

The normal form is the canonical Link itself. Recursive decomposition is valid
exactly because Grounded Links were proved to be in the image of `form`;
completeness is therefore ordinary host equality on this external model carrier.
-/
abbrev ExplicitGroundedNormalization :
    F2F3GroundedNormalization ExplicitFoundation where
  NormalForm := ModelLink
  compose := form
  normalForm := fun x => x

  recursiveEquation := by
    intro x gx
    change x = form (start x) (finish x)
    rcases grounded_is_canonical gx with ⟨a, b, hx⟩
    subst x
    simp

  complete := by
    intro x y _gx _gy h
    exact h

theorem explicit_fnd13_replay
    {x y : ModelLink}
    (gx : Grounded ExplicitFoundation x)
    (gy : Grounded ExplicitFoundation y) :
    x = y ↔
      (ExplicitFoundation.start x = ExplicitFoundation.start y ∧
       ExplicitFoundation.finish x = ExplicitFoundation.finish y) :=
  FND_13_identity_by_poles
    ExplicitFoundation ExplicitGroundedNormalization gx gy

/--
Explicit finite Grounded witness slice inside the infinite ambient carrier.
-/
theorem explicit_grounded_slice :
    Grounded ExplicitFoundation ExplicitFoundation.R ∧
    Grounded ExplicitFoundation ExplicitOneSided.startRoot ∧
    Grounded ExplicitFoundation ExplicitOneSided.finishRoot ∧
    Grounded ExplicitFoundation
      (ExplicitFoundation.form
        ExplicitOneSided.startRoot
        ExplicitOneSided.finishRoot) := by
  exact ⟨
    grounded_of_full_self ExplicitFoundation
      (root_full_self ExplicitFoundation),
    f2f3_start_root_grounded ExplicitFoundation ExplicitOneSided,
    f2f3_finish_root_grounded ExplicitFoundation ExplicitOneSided,
    f2f3_pair_grounded ExplicitFoundation ExplicitOneSided
  ⟩

/--
Concrete witness that the ambient carrier is not a finite four-element model:
Nat injects into the single Link carrier by length.
-/
def natLink (n : Nat) : ModelLink :=
  List.replicate n false ++ [true]

theorem natLink_injective :
    Function.Injective natLink := by
  intro left right h
  have hLength := congrArg List.length h
  have hSucc : left + 1 = right + 1 := by
    simpa [natLink] using hLength
  exact Nat.add_right_cancel hSucc

end MTS.External.Model1796
