namespace MTS.External

/--
Minimal external embedding interface for the accepted MTS Link foundation.

This interface deliberately excludes pole extensionality/A6 and root uniqueness.
Accepted proof order is:

  A1 recursive distinguishability + finite grounding
    -> A2 unique ROOT
      -> A6 identity by ordered poles
-/
structure Foundation where
  Link : Type
  form : Link → Link → Link
  start : Link → Link
  finish : Link → Link
  R : Link

  form_start : ∀ a b, start (form a b) = a
  form_finish : ∀ a b, finish (form a b) = b

  root_self : form R R = R

/-- A Link is fully self-closed when both relational pole positions are self. -/
def FullSelf (F : Foundation) (x : F.Link) : Prop :=
  F.start x = x ∧ F.finish x = x

/--
Finite F2/F3 grounding without a four-constructor Aspect datatype.

There is one constructor.  Each pole contributes one conditional recursive
obligation: if the pole is not self, its external Link must itself carry finite
Grounded evidence.  This is the standard strictly-positive shape used by
accessibility predicates; finiteness lives in the proof object.
-/
inductive Grounded (F : Foundation) : F.Link → Prop
  | node {x : F.Link} :
      (F.start x ≠ x → Grounded F (F.start x)) →
      (F.finish x ≠ x → Grounded F (F.finish x)) →
      Grounded F x

/--
A finite, name-neutral witness that two Links are recursively distinguishable.

Evidence is either a local self/non-self mismatch at one pole, or a finite
recursive distinction through corresponding external poles.
-/
inductive Distinguishable (F : Foundation) : F.Link → F.Link → Prop
  | startSelfLeft {x y : F.Link} :
      F.start x = x →
      F.start y ≠ y →
      Distinguishable F x y
  | startSelfRight {x y : F.Link} :
      F.start x ≠ x →
      F.start y = y →
      Distinguishable F x y
  | finishSelfLeft {x y : F.Link} :
      F.finish x = x →
      F.finish y ≠ y →
      Distinguishable F x y
  | finishSelfRight {x y : F.Link} :
      F.finish x ≠ x →
      F.finish y = y →
      Distinguishable F x y
  | startChild {x y : F.Link} :
      F.start x ≠ x →
      F.start y ≠ y →
      Distinguishable F (F.start x) (F.start y) →
      Distinguishable F x y
  | finishChild {x y : F.Link} :
      F.finish x ≠ x →
      F.finish y ≠ y →
      Distinguishable F (F.finish x) (F.finish y) →
      Distinguishable F x y

/--
External formalization of accepted A1/F2/F3:

  no finitely grounded recursive distinction
  =>
  no two semantic Links

The premise is restricted to Links that carry finite Grounded evidence.
-/
def A1RecursiveSeparation (F : Foundation) : Prop :=
  ∀ {x y : F.Link},
    Grounded F x →
    Grounded F y →
    ¬ Distinguishable F x y →
    x = y

theorem root_full_self (F : Foundation) : FullSelf F F.R := by
  constructor
  · calc
      F.start F.R = F.start (F.form F.R F.R) := congrArg F.start F.root_self.symm
      _ = F.R := F.form_start F.R F.R
  · calc
      F.finish F.R = F.finish (F.form F.R F.R) := congrArg F.finish F.root_self.symm
      _ = F.R := F.form_finish F.R F.R

theorem grounded_of_full_self
    (F : Foundation) {x : F.Link} (h : FullSelf F x) : Grounded F x :=
  Grounded.node
    (fun hNot => False.elim (hNot h.1))
    (fun hNot => False.elim (hNot h.2))

theorem full_self_not_distinguishable
    (F : Foundation) {x y : F.Link}
    (hx : FullSelf F x) (hy : FullSelf F y) :
    ¬ Distinguishable F x y := by
  intro h
  cases h with
  | startSelfLeft _ hNot =>
      exact hNot hy.1
  | startSelfRight hNot _ =>
      exact hNot hx.1
  | finishSelfLeft _ hNot =>
      exact hNot hy.2
  | finishSelfRight hNot _ =>
      exact hNot hx.2
  | startChild hNot _ _ =>
      exact hNot hx.1
  | finishChild hNot _ _ =>
      exact hNot hx.2

/--
FND-02 — unique full self-closure / unique ROOT.

This theorem depends on the explicit A1RecursiveSeparation premise and finite
F2/F3 grounding.  It does not assume pole extensionality, a four-case datatype,
or root uniqueness itself.
-/
theorem FND_02_unique_root
    (F : Foundation)
    (a1 : A1RecursiveSeparation F)
    {x : F.Link}
    (hx : FullSelf F x) :
    x = F.R :=
  a1
    (grounded_of_full_self F hx)
    (grounded_of_full_self F (root_full_self F))
    (full_self_not_distinguishable F hx (root_full_self F))


/--
External F2/F3 normalization interface.

Historical MTS source 1e529a23... describes finite recursive forms modulo the
least relation ≈, with one alpha-neutral normal form per semantic class.

The normalization package is indexed by a previously established unique-ROOT
proof.  For the accepted proof order that proof is supplied by FND-02.  The
A6/FND-13 step itself then uses only the recursive normal-form equation and
normal-form completeness; it does not re-prove or silently assume Link
extensionality.
-/
def RootUniqueness (F : Foundation) : Prop :=
  ∀ {x : F.Link}, FullSelf F x → x = F.R

structure F2F3Normalization
    (F : Foundation)
    (_uniqueRoot : RootUniqueness F) where
  NormalForm : Type
  compose : NormalForm → NormalForm → NormalForm
  normalForm : F.Link → NormalForm

  recursiveEquation :
    ∀ x : F.Link,
      normalForm x =
        compose (normalForm (F.start x)) (normalForm (F.finish x))

  complete :
    ∀ {x y : F.Link},
      normalForm x = normalForm y →
      x = y

/--
FND-13 / historical A6 — semantic Link identity is exactly identity of the
ordered poles on the accepted F2/F3-normalized domain.

The normalization witness is explicitly indexed by the unique-ROOT result
proved by FND-02.  Same ordered poles imply the same recursively composed
normal form; F2/F3 completeness then yields one semantic Link.
-/
theorem FND_13_identity_by_poles
    (F : Foundation)
    (a1 : A1RecursiveSeparation F)
    (N : F2F3Normalization F
      (fun {x} hx => FND_02_unique_root F a1 hx))
    {x y : F.Link} :
    x = y ↔
      (F.start x = F.start y ∧ F.finish x = F.finish y) := by
  constructor
  · intro h
    cases h
    exact ⟨rfl, rfl⟩
  · intro h
    apply N.complete
    calc
      N.normalForm x =
          N.compose (N.normalForm (F.start x)) (N.normalForm (F.finish x)) :=
        N.recursiveEquation x
      _ =
          N.compose (N.normalForm (F.start y)) (N.normalForm (F.finish y)) := by
        rw [h.1, h.2]
      _ = N.normalForm y := (N.recursiveEquation y).symm


/--
Local self-incidence predicates for FND-01.

These are propositions over one Link.  They are deliberately not encoded as a
four-constructor datatype: the four cases arise from two independent
self-incidence questions.
-/
def StartSelf (F : Foundation) (x : F.Link) : Prop :=
  F.start x = x

def FinishSelf (F : Foundation) (x : F.Link) : Prop :=
  F.finish x = x

def StartOnly (F : Foundation) (x : F.Link) : Prop :=
  StartSelf F x ∧ ¬ FinishSelf F x

def FinishOnly (F : Foundation) (x : F.Link) : Prop :=
  ¬ StartSelf F x ∧ FinishSelf F x

def PairLocal (F : Foundation) (x : F.Link) : Prop :=
  ¬ StartSelf F x ∧ ¬ FinishSelf F x

/--
Constructive external proof does not silently assume that arbitrary Link
identity is decidable.  A caller that wants the exhaustive local classifier
supplies the two exact decisions it has authority to make.
-/
def LocalSelfDecision (F : Foundation) (x : F.Link) : Prop :=
  (StartSelf F x ∨ ¬ StartSelf F x) ∧
  (FinishSelf F x ∨ ¬ FinishSelf F x)

def LocalSelfIncidenceExhaustive (F : Foundation) (x : F.Link) : Prop :=
  FullSelf F x ∨
  StartOnly F x ∨
  FinishOnly F x ∨
  PairLocal F x

def LocalSelfIncidenceExclusive (F : Foundation) (x : F.Link) : Prop :=
  ¬ (FullSelf F x ∧ StartOnly F x) ∧
  ¬ (FullSelf F x ∧ FinishOnly F x) ∧
  ¬ (FullSelf F x ∧ PairLocal F x) ∧
  ¬ (StartOnly F x ∧ FinishOnly F x) ∧
  ¬ (StartOnly F x ∧ PairLocal F x) ∧
  ¬ (FinishOnly F x ∧ PairLocal F x)

theorem local_self_incidence_exhaustive
    (F : Foundation)
    {x : F.Link}
    (decision : LocalSelfDecision F x) :
    LocalSelfIncidenceExhaustive F x := by
  rcases decision with ⟨hs, hf⟩
  cases hs with
  | inl hSelfStart =>
      cases hf with
      | inl hSelfFinish =>
          exact Or.inl ⟨hSelfStart, hSelfFinish⟩
      | inr hNotSelfFinish =>
          exact Or.inr (Or.inl ⟨hSelfStart, hNotSelfFinish⟩)
  | inr hNotSelfStart =>
      cases hf with
      | inl hSelfFinish =>
          exact Or.inr (Or.inr (Or.inl ⟨hNotSelfStart, hSelfFinish⟩))
      | inr hNotSelfFinish =>
          exact Or.inr (Or.inr (Or.inr ⟨hNotSelfStart, hNotSelfFinish⟩))

theorem local_self_incidence_exclusive
    (F : Foundation)
    {x : F.Link} :
    LocalSelfIncidenceExclusive F x := by
  refine ⟨?_, ?_, ?_, ?_, ?_, ?_⟩
  · intro h
    exact h.2.2 h.1.2
  · intro h
    exact h.2.1 h.1.1
  · intro h
    exact h.2.1 h.1.1
  · intro h
    exact h.2.1 h.1.1
  · intro h
    exact h.2.1 h.1.1
  · intro h
    exact h.2.2 h.1.2

/--
FND-01 C1 — proposition-level local partition only.

This is not yet the full FND-01 realizability claim.  It proves that, once the
two local identity questions have explicit decision evidence, the accepted
Link has exactly one of the four self-incidence proposition patterns.

The full-self branch is tied to unique ROOT through FND-02.  Equality of actual
Links remains structural ordered-pole equality through FND-13.  Context
orientation is intentionally absent here: it later names the two one-sided
patterns but does not create them.
-/
theorem FND_01_local_partition
    (F : Foundation)
    (a1 : A1RecursiveSeparation F)
    (N : F2F3Normalization F
      (fun {x} hx => FND_02_unique_root F a1 hx))
    {x : F.Link}
    (decision : LocalSelfDecision F x) :
    LocalSelfIncidenceExhaustive F x ∧
    LocalSelfIncidenceExclusive F x ∧
    (FullSelf F x → x = F.R) ∧
    (∀ {y : F.Link},
      F.start x = F.start y →
      F.finish x = F.finish y →
      x = y) := by
  refine ⟨
    local_self_incidence_exhaustive F decision,
    local_self_incidence_exclusive F,
    ?_,
    ?_
  ⟩
  · intro h
    exact FND_02_unique_root F a1 h
  · intro y hs hf
    exact (FND_13_identity_by_poles F a1 N).2 ⟨hs, hf⟩


/--
Minimal F2/F3 existence premise needed for FND-01 realizability.

It does not postulate four ready-made aspect objects.  It supplies only the two
proper one-sided recursive forms around the already established ROOT.  Their
non-collapse to ROOT is the executable boundary corresponding to the accepted
F2/F3 claim that START(ROOT) and END(ROOT) have their own alpha-neutral normal
forms.  The ordinary PAIR representative is derived with the one Link-forming
primitive.
-/
structure F2F3OneSidedExistence (F : Foundation) where
  startRoot : F.Link
  finishRoot : F.Link

  startRootEquation :
    startRoot = F.form startRoot F.R

  finishRootEquation :
    finishRoot = F.form F.R finishRoot

  startRootNeRoot :
    startRoot ≠ F.R

  finishRootNeRoot :
    finishRoot ≠ F.R

theorem f2f3_start_root_start
    (F : Foundation)
    (E : F2F3OneSidedExistence F) :
    F.start E.startRoot = E.startRoot := by
  calc
    F.start E.startRoot =
        F.start (F.form E.startRoot F.R) := congrArg F.start E.startRootEquation
    _ = E.startRoot := F.form_start E.startRoot F.R

theorem f2f3_start_root_finish
    (F : Foundation)
    (E : F2F3OneSidedExistence F) :
    F.finish E.startRoot = F.R := by
  calc
    F.finish E.startRoot =
        F.finish (F.form E.startRoot F.R) := congrArg F.finish E.startRootEquation
    _ = F.R := F.form_finish E.startRoot F.R

theorem f2f3_finish_root_start
    (F : Foundation)
    (E : F2F3OneSidedExistence F) :
    F.start E.finishRoot = F.R := by
  calc
    F.start E.finishRoot =
        F.start (F.form F.R E.finishRoot) := congrArg F.start E.finishRootEquation
    _ = F.R := F.form_start F.R E.finishRoot

theorem f2f3_finish_root_finish
    (F : Foundation)
    (E : F2F3OneSidedExistence F) :
    F.finish E.finishRoot = E.finishRoot := by
  calc
    F.finish E.finishRoot =
        F.finish (F.form F.R E.finishRoot) := congrArg F.finish E.finishRootEquation
    _ = E.finishRoot := F.form_finish F.R E.finishRoot

theorem f2f3_start_root_pattern
    (F : Foundation)
    (E : F2F3OneSidedExistence F) :
    StartOnly F E.startRoot := by
  constructor
  · exact f2f3_start_root_start F E
  · intro h
    apply E.startRootNeRoot
    calc
      E.startRoot = F.finish E.startRoot := h.symm
      _ = F.R := f2f3_start_root_finish F E

theorem f2f3_finish_root_pattern
    (F : Foundation)
    (E : F2F3OneSidedExistence F) :
    FinishOnly F E.finishRoot := by
  constructor
  · intro h
    apply E.finishRootNeRoot
    calc
      E.finishRoot = F.start E.finishRoot := h.symm
      _ = F.R := f2f3_finish_root_start F E
  · exact f2f3_finish_root_finish F E

theorem f2f3_start_root_grounded
    (F : Foundation)
    (E : F2F3OneSidedExistence F) :
    Grounded F E.startRoot := by
  apply Grounded.node
  · intro hNot
    exact False.elim (hNot (f2f3_start_root_start F E))
  · intro _
    simpa only [f2f3_start_root_finish F E] using
      grounded_of_full_self F (root_full_self F)

theorem f2f3_finish_root_grounded
    (F : Foundation)
    (E : F2F3OneSidedExistence F) :
    Grounded F E.finishRoot := by
  apply Grounded.node
  · intro _
    simpa only [f2f3_finish_root_start F E] using
      grounded_of_full_self F (root_full_self F)
  · intro hNot
    exact False.elim (hNot (f2f3_finish_root_finish F E))

theorem f2f3_pair_pattern
    (F : Foundation)
    (E : F2F3OneSidedExistence F) :
    PairLocal F (F.form E.startRoot E.finishRoot) := by
  constructor
  · intro h
    have hStartRootIsPair :
        E.startRoot = F.form E.startRoot E.finishRoot := by
      calc
        E.startRoot =
            F.start (F.form E.startRoot E.finishRoot) :=
          (F.form_start E.startRoot E.finishRoot).symm
        _ = F.form E.startRoot E.finishRoot := h
    apply E.finishRootNeRoot
    calc
      E.finishRoot =
          F.finish (F.form E.startRoot E.finishRoot) :=
        (F.form_finish E.startRoot E.finishRoot).symm
      _ = F.finish E.startRoot := (congrArg F.finish hStartRootIsPair).symm
      _ = F.R := f2f3_start_root_finish F E
  · intro h
    have hFinishRootIsPair :
        E.finishRoot = F.form E.startRoot E.finishRoot := by
      calc
        E.finishRoot =
            F.finish (F.form E.startRoot E.finishRoot) :=
          (F.form_finish E.startRoot E.finishRoot).symm
        _ = F.form E.startRoot E.finishRoot := h
    apply E.startRootNeRoot
    calc
      E.startRoot =
          F.start (F.form E.startRoot E.finishRoot) :=
        (F.form_start E.startRoot E.finishRoot).symm
      _ = F.start E.finishRoot := (congrArg F.start hFinishRootIsPair).symm
      _ = F.R := f2f3_finish_root_start F E

theorem f2f3_pair_grounded
    (F : Foundation)
    (E : F2F3OneSidedExistence F) :
    Grounded F (F.form E.startRoot E.finishRoot) := by
  apply Grounded.node
  · intro _
    simpa only [F.form_start] using f2f3_start_root_grounded F E
  · intro _
    simpa only [F.form_finish] using f2f3_finish_root_grounded F E

/--
FND-01 C2 — grounded realizability of all four proposition patterns.

ROOT is already realized by R.  F2/F3 contributes only two proper one-sided
recursive witnesses.  The neither-self representative is then derived by the
single Link-forming primitive from those two witnesses.

No host enum, four-opcode model, global equality decision, technical handle, or
storage canonicalization is used as existence authority.
-/
theorem FND_01_grounded_realizability
    (F : Foundation)
    (E : F2F3OneSidedExistence F) :
    FullSelf F F.R ∧
    ∃ startWitness finishWitness pairWitness : F.Link,
      Grounded F startWitness ∧
      Grounded F finishWitness ∧
      Grounded F pairWitness ∧
      StartOnly F startWitness ∧
      FinishOnly F finishWitness ∧
      PairLocal F pairWitness := by
  refine ⟨root_full_self F, ?_⟩
  exact ⟨
    E.startRoot,
    E.finishRoot,
    F.form E.startRoot E.finishRoot,
    f2f3_start_root_grounded F E,
    f2f3_finish_root_grounded F E,
    f2f3_pair_grounded F E,
    f2f3_start_root_pattern F E,
    f2f3_finish_root_pattern F E,
    f2f3_pair_pattern F E
  ⟩

end MTS.External
