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
  exact Grounded.rec
    (motive := fun current _ =>
      current = badStart ∨ current = badFinish → False)
    (fun {current} _startStep _finishStep ihStart ihFinish hBad => by
      rcases hBad with hStart | hFinish
      · have hne : ExplicitFoundation.finish current ≠ current := by
          rw [hStart]
          simpa using badStart_ne_badFinish.symm
        have hChild : ExplicitFoundation.finish current = badFinish := by
          rw [hStart]
          exact finish_badStart
        exact ihFinish hne (Or.inr hChild)
      · have hne : ExplicitFoundation.start current ≠ current := by
          rw [hFinish]
          simpa using badStart_ne_badFinish
        have hChild : ExplicitFoundation.start current = badStart := by
          rw [hFinish]
          exact start_badFinish
        exact ihStart hne (Or.inl hChild))
    gx

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

theorem canonical_or_start_fallback
    (x : ModelLink) :
    CanonicalImage x ∨ start x = badStart := by
  unfold start
  cases hDecode : decode x with
  | none =>
      exact Or.inr rfl
  | some poles =>
      by_cases hCanonical : x = form poles.1 poles.2
      · exact Or.inl ⟨poles.1, poles.2, hCanonical⟩
      · exact Or.inr (by simp [hDecode, hCanonical])

/--
Finite Grounded evidence can therefore exist only for an exact image of
`form`. Malformed and duplicate host encodings remain ambient Links, but
cannot enter the finite semantic replay domain.

The proof is constructive: it uses the computable decode/re-encode decision,
not excluded middle over the existential CanonicalImage proposition.
-/
theorem grounded_is_canonical
    {x : ModelLink}
    (gx : Grounded ExplicitFoundation x) :
    CanonicalImage x := by
  rcases canonical_or_start_fallback x with hCanonical | hStart
  · exact hCanonical
  · by_cases hx : x = badStart
    · subst x
      exact False.elim (badStart_not_grounded gx)
    · have hStartNe : ExplicitFoundation.start x ≠ x := by
        intro hEq
        apply hx
        calc
          x = ExplicitFoundation.start x := hEq.symm
          _ = badStart := hStart
      have gStart :=
        grounded_start_of_nonself ExplicitFoundation gx hStartNe
      have gBad : Grounded ExplicitFoundation badStart := by
        simpa [hStart] using gStart
      exact False.elim (badStart_not_grounded gBad)

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
Strict growth helpers for the host encodings. They establish uniqueness of the
recursive fixed-point sections in this external model only.
-/
theorem startForm_ne_self (a : ModelLink) :
    startForm a ≠ a := by
  intro h
  have hLength : a.length = (startForm a).length :=
    congrArg List.length h.symm
  have h1 : a.length < Nat.succ a.length :=
    Nat.lt_succ_self a.length
  have h2 : Nat.succ a.length < Nat.succ (Nat.succ a.length) :=
    Nat.lt_succ_self (Nat.succ a.length)
  have hLt : a.length < (startForm a).length := by
    simpa [startForm] using Nat.lt_trans h1 h2
  exact (Nat.ne_of_lt hLt) hLength

theorem endForm_ne_self (a : ModelLink) :
    endForm a ≠ a := by
  intro h
  have hLength : a.length = (endForm a).length :=
    congrArg List.length h.symm
  have h1 : a.length < Nat.succ a.length :=
    Nat.lt_succ_self a.length
  have h2 : Nat.succ a.length < Nat.succ (Nat.succ a.length) :=
    Nat.lt_succ_self (Nat.succ a.length)
  have hLt : a.length < (endForm a).length := by
    simpa [endForm] using Nat.lt_trans h1 h2
  exact (Nat.ne_of_lt hLt) hLength

theorem encodeLeft_length_gt (a : ModelLink) :
    a.length < (encodeLeft a).length := by
  induction a with
  | nil =>
      simp [encodeLeft]
  | cons bit tail ih =>
      cases bit <;>
        simpa [encodeLeft] using
          Nat.lt_trans
            (Nat.succ_lt_succ ih)
            (Nat.lt_succ_self (Nat.succ (encodeLeft tail).length))

theorem pairCode_ne_left (left right : ModelLink) :
    pairCode left right ≠ left := by
  intro h
  have hAppendLe :
      (encodeLeft left).length ≤ (encodeLeft left ++ right).length := by
    simpa only [List.length_append] using
      (Nat.le_add_right (encodeLeft left).length right.length)
  have hPrefixLt :
      (encodeLeft left).length <
        Nat.succ (Nat.succ (encodeLeft left ++ right).length) :=
    Nat.lt_trans
      (Nat.lt_succ_of_le hAppendLe)
      (Nat.lt_succ_self (Nat.succ (encodeLeft left ++ right).length))
  have hEncPair :
      (encodeLeft left).length < (pairCode left right).length := by
    simpa only [pairCode, List.length_cons] using hPrefixLt
  have hLt : left.length < (pairCode left right).length :=
    Nat.lt_trans (encodeLeft_length_gt left) hEncPair
  have hLength : left.length = (pairCode left right).length :=
    congrArg List.length h.symm
  exact (Nat.ne_of_lt hLt) hLength

theorem pairCode_ne_right (left right : ModelLink) :
    pairCode left right ≠ right := by
  intro h
  have hRightLe0 :
      right.length ≤ right.length + (encodeLeft left).length :=
    Nat.le_add_right right.length (encodeLeft left).length
  have hRightLe :
      right.length ≤ (encodeLeft left ++ right).length := by
    simpa only [List.length_append, Nat.add_comm] using hRightLe0
  have hLt :
      right.length <
        Nat.succ (Nat.succ (encodeLeft left ++ right).length) :=
    Nat.lt_trans
      (Nat.lt_succ_of_le hRightLe)
      (Nat.lt_succ_self (Nat.succ (encodeLeft left ++ right).length))
  have hPairLt : right.length < (pairCode left right).length := by
    simpa only [pairCode, List.length_cons] using hLt
  have hLength : right.length = (pairCode left right).length :=
    congrArg List.length h.symm
  exact (Nat.ne_of_lt hPairLt) hLength

/--
If the left pole of a canonical form is the whole itself, the only possibilities
are ROOT or the dedicated START section. The END and generic PAIR branches
cannot create an additional finite fixed point.
-/
theorem left_fixed_root_or_start
    (a b : ModelLink)
    (h : a = form a b) :
    (a = root ∧ b = root) ∨ a = startForm b := by
  by_cases hRoot : a = root ∧ b = root
  · exact Or.inl hRoot
  · by_cases hStart : a = startForm b
    · exact Or.inr hStart
    · by_cases hEnd : b = endForm a
      · subst b
        have hForm : form a (endForm a) = endForm a := by
          simp [form, no_start_end_overlap, endForm_ne_root]
        have hSelf : a = endForm a :=
          h.trans hForm
        exact False.elim (endForm_ne_self a hSelf.symm)
      · have hPair : a = pairCode a b := by
          simpa [form, hRoot, hStart, hEnd] using h
        exact False.elim (pairCode_ne_left a b hPair.symm)

/-- Symmetric uniqueness of the END fixed-point section. -/
theorem right_fixed_root_or_end
    (a b : ModelLink)
    (h : b = form a b) :
    (a = root ∧ b = root) ∨ b = endForm a := by
  by_cases hRoot : a = root ∧ b = root
  · exact Or.inl hRoot
  · by_cases hStart : a = startForm b
    · subst a
      have hForm : form (startForm b) b = startForm b := by
        simp [form, startForm_ne_root]
      have hSelf : b = startForm b :=
        h.trans hForm
      exact False.elim (startForm_ne_self b hSelf.symm)
    · by_cases hEnd : b = endForm a
      · exact Or.inr hEnd
      · have hPair : b = pairCode a b := by
          simpa [form, hRoot, hStart, hEnd] using h
        exact False.elim (pairCode_ne_right a b hPair.symm)

theorem explicit_full_self_eq_root
    {x : ModelLink}
    (gx : Grounded ExplicitFoundation x)
    (hFull : FullSelf ExplicitFoundation x) :
    x = root := by
  rcases grounded_is_canonical gx with ⟨a, b, hx⟩
  have ha : a = x := by
    calc
      a = start (form a b) := (start_form a b).symm
      _ = start x := by rw [hx]
      _ = x := hFull.1
  have hb : b = x := by
    calc
      b = finish (form a b) := (finish_form a b).symm
      _ = finish x := by rw [hx]
      _ = x := hFull.2
  subst a
  subst b
  rcases left_fixed_root_or_start x x hx with hRoot | hStart
  · exact hRoot.1
  · exact False.elim (startForm_ne_self x hStart.symm)

theorem explicit_start_only_shape
    {x : ModelLink}
    (gx : Grounded ExplicitFoundation x)
    (hStart : StartOnly ExplicitFoundation x) :
    x = startForm (finish x) := by
  rcases grounded_is_canonical gx with ⟨a, b, hx⟩
  have ha : a = x := by
    calc
      a = start (form a b) := (start_form a b).symm
      _ = start x := by rw [hx]
      _ = x := hStart.1
  have hb : b = finish x := by
    calc
      b = finish (form a b) := (finish_form a b).symm
      _ = finish x := by rw [hx]
  subst a
  subst b
  rcases left_fixed_root_or_start x (finish x) hx with hRoot | hSection
  · exact False.elim (hStart.2 (by
      calc
        finish x = root := hRoot.2
        _ = x := hRoot.1.symm))
  · exact hSection

theorem explicit_finish_only_shape
    {x : ModelLink}
    (gx : Grounded ExplicitFoundation x)
    (hFinish : FinishOnly ExplicitFoundation x) :
    x = endForm (start x) := by
  rcases grounded_is_canonical gx with ⟨a, b, hx⟩
  have ha : a = start x := by
    calc
      a = start (form a b) := (start_form a b).symm
      _ = start x := by rw [hx]
  have hb : b = x := by
    calc
      b = finish (form a b) := (finish_form a b).symm
      _ = finish x := by rw [hx]
      _ = x := hFinish.2
  subst a
  subst b
  rcases right_fixed_root_or_end (start x) x hx with hRoot | hSection
  · exact False.elim (hFinish.1 (by
      calc
        start x = root := hRoot.1
        _ = x := hRoot.2.symm))
  · exact hSection

theorem start_status_same_of_not_distinguishable
    {x y : ModelLink}
    (dx : StartSelf ExplicitFoundation x ∨ ¬ StartSelf ExplicitFoundation x)
    (dy : StartSelf ExplicitFoundation y ∨ ¬ StartSelf ExplicitFoundation y)
    (hNo : ¬ Distinguishable ExplicitFoundation x y) :
    (StartSelf ExplicitFoundation x ∧ StartSelf ExplicitFoundation y) ∨
    (¬ StartSelf ExplicitFoundation x ∧ ¬ StartSelf ExplicitFoundation y) := by
  rcases dx with hx | hx <;> rcases dy with hy | hy
  · exact Or.inl ⟨hx, hy⟩
  · exact False.elim (hNo (Distinguishable.startSelfLeft hx hy))
  · exact False.elim (hNo (Distinguishable.startSelfRight hx hy))
  · exact Or.inr ⟨hx, hy⟩

theorem finish_status_same_of_not_distinguishable
    {x y : ModelLink}
    (dx : FinishSelf ExplicitFoundation x ∨ ¬ FinishSelf ExplicitFoundation x)
    (dy : FinishSelf ExplicitFoundation y ∨ ¬ FinishSelf ExplicitFoundation y)
    (hNo : ¬ Distinguishable ExplicitFoundation x y) :
    (FinishSelf ExplicitFoundation x ∧ FinishSelf ExplicitFoundation y) ∨
    (¬ FinishSelf ExplicitFoundation x ∧ ¬ FinishSelf ExplicitFoundation y) := by
  rcases dx with hx | hx <;> rcases dy with hy | hy
  · exact Or.inl ⟨hx, hy⟩
  · exact False.elim (hNo (Distinguishable.finishSelfLeft hx hy))
  · exact False.elim (hNo (Distinguishable.finishSelfRight hx hy))
  · exact Or.inr ⟨hx, hy⟩

/--
Concrete discharge of A1 on the explicit infinite model.

No host extensionality axiom is added. Absence of finite Distinguishable
evidence synchronizes the two local self-incidence bits; the external poles
then recurse through the finite Grounded proof. START/END fixed-point
uniqueness is supplied by the explicit host encoding, and PAIR closes through
the independently constructed Grounded normalization / FND-13 replay.
-/
theorem explicit_a1 :
    A1RecursiveSeparation ExplicitFoundation := by
  intro x y gx gy hNo
  induction gx generalizing y with
  | @node current startStep finishStep ihStart ihFinish =>
      rcases explicit_local_decision current with ⟨dxStart, dxFinish⟩
      rcases explicit_local_decision y with ⟨dyStart, dyFinish⟩
      have hStartStatus :=
        start_status_same_of_not_distinguishable dxStart dyStart hNo
      have hFinishStatus :=
        finish_status_same_of_not_distinguishable dxFinish dyFinish hNo
      rcases hStartStatus with ⟨hxStart, hyStart⟩ | ⟨hxNotStart, hyNotStart⟩
      · rcases hFinishStatus with ⟨hxFinish, hyFinish⟩ | ⟨hxNotFinish, hyNotFinish⟩
        · have gxCurrent : Grounded ExplicitFoundation current :=
            Grounded.node startStep finishStep
          have hxRoot :=
            explicit_full_self_eq_root gxCurrent ⟨hxStart, hxFinish⟩
          have hyRoot :=
            explicit_full_self_eq_root gy ⟨hyStart, hyFinish⟩
          exact hxRoot.trans hyRoot.symm
        · have gxCurrent : Grounded ExplicitFoundation current :=
            Grounded.node startStep finishStep
          have gyFinish :=
            grounded_finish_of_nonself ExplicitFoundation gy hyNotFinish
          have hChildNo :
              ¬ Distinguishable ExplicitFoundation
                (finish current) (finish y) := by
            intro hChild
            exact hNo
              (Distinguishable.finishChild hxNotFinish hyNotFinish hChild)
          have hFinishEq :=
            ihFinish hxNotFinish gyFinish hChildNo
          have hxShape :=
            explicit_start_only_shape gxCurrent ⟨hxStart, hxNotFinish⟩
          have hyShape :=
            explicit_start_only_shape gy ⟨hyStart, hyNotFinish⟩
          calc
            current = startForm (finish current) := hxShape
            _ = startForm (finish y) := congrArg startForm hFinishEq
            _ = y := hyShape.symm
      · rcases hFinishStatus with ⟨hxFinish, hyFinish⟩ | ⟨hxNotFinish, hyNotFinish⟩
        · have gxCurrent : Grounded ExplicitFoundation current :=
            Grounded.node startStep finishStep
          have gyStart :=
            grounded_start_of_nonself ExplicitFoundation gy hyNotStart
          have hChildNo :
              ¬ Distinguishable ExplicitFoundation
                (start current) (start y) := by
            intro hChild
            exact hNo
              (Distinguishable.startChild hxNotStart hyNotStart hChild)
          have hStartEq :=
            ihStart hxNotStart gyStart hChildNo
          have hxShape :=
            explicit_finish_only_shape gxCurrent ⟨hxNotStart, hxFinish⟩
          have hyShape :=
            explicit_finish_only_shape gy ⟨hyNotStart, hyFinish⟩
          calc
            current = endForm (start current) := hxShape
            _ = endForm (start y) := congrArg endForm hStartEq
            _ = y := hyShape.symm
        · have gxCurrent : Grounded ExplicitFoundation current :=
            Grounded.node startStep finishStep
          have gyStart :=
            grounded_start_of_nonself ExplicitFoundation gy hyNotStart
          have gyFinish :=
            grounded_finish_of_nonself ExplicitFoundation gy hyNotFinish
          have hStartChildNo :
              ¬ Distinguishable ExplicitFoundation
                (start current) (start y) := by
            intro hChild
            exact hNo
              (Distinguishable.startChild hxNotStart hyNotStart hChild)
          have hFinishChildNo :
              ¬ Distinguishable ExplicitFoundation
                (finish current) (finish y) := by
            intro hChild
            exact hNo
              (Distinguishable.finishChild hxNotFinish hyNotFinish hChild)
          have hStartEq :=
            ihStart hxNotStart gyStart hStartChildNo
          have hFinishEq :=
            ihFinish hxNotFinish gyFinish hFinishChildNo
          exact (explicit_fnd13_replay gxCurrent gy).2
            ⟨hStartEq, hFinishEq⟩

/--
Concrete replay of the stabilized FND/INV/CTX chain on the explicit model.

These declarations add no new premise: they instantiate the already-proved
generic capstones with the concrete witnesses built above.
-/
theorem explicit_finite_recursive_carrier_decision :
    FiniteRecursiveCarrierDecision ExplicitFoundation := by
  intro x _gx
  exact explicit_local_decision x

def explicit_fnd02_replay
    {x : ModelLink}
    (hFull : FullSelf ExplicitFoundation x) :=
  FND_02_unique_root ExplicitFoundation explicit_a1 hFull

def explicit_fnd01_replay (x : ModelLink) :=
  FND_01_four_structural_cases
    ExplicitFoundation
    explicit_a1
    ExplicitOneSided
    (explicit_local_decision x)

def explicit_fnd05_replay
    {x : ModelLink}
    (gx : Grounded ExplicitFoundation x) :=
  FND_05_canonical_recursive_description_unique
    ExplicitFoundation
    explicit_a1
    explicit_finite_recursive_carrier_decision
    gx

def explicit_inv01_replay
    {x : ModelLink}
    (gx : Grounded ExplicitFoundation x) :=
  INV_01_recursive_inversion_unique_total
    ExplicitFoundation
    explicit_a1
    ExplicitOneSided
    ExplicitInversionDomain
    gx

def explicit_inv02_replay
    {x : ModelLink}
    (gx : Grounded ExplicitFoundation x) :=
  INV_02_unique_total_involution
    ExplicitFoundation
    explicit_a1
    ExplicitGroundedNormalization
    ExplicitOneSided
    ExplicitInversionDomain
    gx

def explicit_inv03_replay
    {y : ModelLink}
    (h : RecursiveInversion
      ExplicitFoundation ExplicitInversionDomain ExplicitFoundation.R y) :=
  INV_03_root_fixed
    ExplicitFoundation
    ExplicitInversionDomain
    h

def explicit_inv04_start_replay
    {x y : ModelLink}
    (hStart : StartOnly ExplicitFoundation x)
    (hxy : RecursiveInversion
      ExplicitFoundation ExplicitInversionDomain x y) :=
  INV_04_start_to_finish
    ExplicitFoundation
    explicit_a1
    ExplicitOneSided
    ExplicitInversionDomain
    hStart
    hxy

def explicit_inv04_finish_replay
    {x y : ModelLink}
    (hFinish : FinishOnly ExplicitFoundation x)
    (hxy : RecursiveInversion
      ExplicitFoundation ExplicitInversionDomain x y) :=
  INV_04_finish_to_start
    ExplicitFoundation
    explicit_a1
    ExplicitOneSided
    ExplicitInversionDomain
    hFinish
    hxy

def explicit_inv05_replay
    {x y : ModelLink}
    (hPair : PairLocal ExplicitFoundation x)
    (hxy : RecursiveInversion
      ExplicitFoundation ExplicitInversionDomain x y) :=
  INV_05_pair_preserved_and_reversed
    ExplicitFoundation
    explicit_a1
    ExplicitGroundedNormalization
    ExplicitOneSided
    ExplicitInversionDomain
    hPair
    hxy

def explicit_inv06_replay :=
  INV_06_root_basis
    ExplicitFoundation
    explicit_a1
    ExplicitGroundedNormalization
    ExplicitOneSided
    ExplicitInversionDomain

def explicit_inv07_replay :=
  INV_07_objective_chirality
    ExplicitFoundation
    explicit_a1
    ExplicitGroundedNormalization
    ExplicitOneSided
    ExplicitInversionDomain

def explicit_ctx03_replay :=
  CTX_03_context_relative_gauge
    ExplicitFoundation
    explicit_a1
    ExplicitGroundedNormalization
    ExplicitOneSided
    ExplicitInversionDomain

def explicit_ctx03_semantic_replay :=
  CTX_03_semantic_covariance_capstone
    ExplicitFoundation
    explicit_a1
    ExplicitGroundedNormalization
    ExplicitOneSided
    ExplicitInversionDomain


/--
EXTERNAL THEORY PROJECTION: constructive infinitude witness.

This is a prover-side cardinality witness only.  It records a consequence of
the existing Foundation projections plus one proper END(ROOT) witness and does
not introduce a new MTS entity or semantic primitive.

The map x ↦ form(x,R) is injective because START projects its left argument.
The proper END(ROOT) witness is outside that map's image because every image
has finish=R while END(ROOT) has finish=END(ROOT) ≠ R.  Iterating this
injective non-surjective endomap from END(ROOT) therefore embeds Nat into Link.
-/
def HasNatInjection (F : Foundation) : Prop :=
  ∃ encode : Nat → F.Link, Function.Injective encode

theorem left_root_embed_injective
    (F : Foundation) :
    Function.Injective (fun x : F.Link => F.form x F.R) := by
  intro a b h
  have hStart := congrArg F.start h
  simpa only [F.form_start] using hStart

theorem finish_root_not_left_root_image
    (F : Foundation)
    (E : F2F3OneSidedExistence F)
    (x : F.Link) :
    F.form x F.R ≠ E.finishRoot := by
  intro h
  have hFinish := congrArg F.finish h
  have hRootEq : F.R = E.finishRoot := by
    simpa only [F.form_finish, f2f3_finish_root_finish F E] using hFinish
  exact E.finishRootNeRoot hRootEq.symm

def leftRootOrbit
    (F : Foundation)
    (E : F2F3OneSidedExistence F) :
    Nat → F.Link
  | 0 => E.finishRoot
  | n + 1 => F.form (leftRootOrbit F E n) F.R

theorem leftRootOrbit_succ_ne_zero
    (F : Foundation)
    (E : F2F3OneSidedExistence F)
    (n : Nat) :
    leftRootOrbit F E (n + 1) ≠ leftRootOrbit F E 0 := by
  change F.form (leftRootOrbit F E n) F.R ≠ E.finishRoot
  exact finish_root_not_left_root_image F E (leftRootOrbit F E n)

theorem leftRootOrbit_injective
    (F : Foundation)
    (E : F2F3OneSidedExistence F) :
    Function.Injective (leftRootOrbit F E) := by
  intro m
  induction m with
  | zero =>
      intro n h
      cases n with
      | zero => rfl
      | succ n =>
          exact False.elim
            (leftRootOrbit_succ_ne_zero F E n h.symm)
  | succ m ih =>
      intro n h
      cases n with
      | zero =>
          exact False.elim
            (leftRootOrbit_succ_ne_zero F E m h)
      | succ n =>
          have hPrev :
              leftRootOrbit F E m = leftRootOrbit F E n := by
            apply left_root_embed_injective F
            exact h
          exact congrArg Nat.succ (ih hPrev)

theorem one_sided_existence_implies_nat_injection
    (F : Foundation)
    (E : F2F3OneSidedExistence F) :
    HasNatInjection F :=
  ⟨leftRootOrbit F E, leftRootOrbit_injective F E⟩


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
