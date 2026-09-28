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


/--
FND-01 C3 structural capstone.

C1 provides an exhaustive and exclusive four-way proposition partition for any
Link once the two local self-incidence questions are explicitly decidable.
C2 proves that all four proposition patterns are realized in the accepted
finite R-grounded domain.

The capstone keeps both facts together and also preserves the already proved
identity boundaries:
- full self-closure is unique ROOT through FND-02;
- actual semantic Link identity is ordered-pole identity through FND-13.
-/
theorem FND_01_four_structural_cases
    (F : Foundation)
    (a1 : A1RecursiveSeparation F)
    (N : F2F3Normalization F
      (fun {x} hx => FND_02_unique_root F a1 hx))
    (E : F2F3OneSidedExistence F)
    {x : F.Link}
    (decision : LocalSelfDecision F x) :
    LocalSelfIncidenceExhaustive F x ∧
    LocalSelfIncidenceExclusive F x ∧
    (FullSelf F x → x = F.R) ∧
    (∀ {y : F.Link},
      F.start x = F.start y →
      F.finish x = F.finish y →
      x = y) ∧
    (FullSelf F F.R ∧
      ∃ startWitness finishWitness pairWitness : F.Link,
        Grounded F startWitness ∧
        Grounded F finishWitness ∧
        Grounded F pairWitness ∧
        StartOnly F startWitness ∧
        FinishOnly F finishWitness ∧
        PairLocal F pairWitness) := by
  have c1 := FND_01_local_partition F a1 N decision
  have c2 := FND_01_grounded_realizability F E
  exact ⟨
    c1.1,
    c1.2.1,
    c1.2.2.1,
    c1.2.2.2,
    c2
  ⟩

/--
Context-relative START_K / END_K naming is presentation only.

The predicate does not create Links and does not classify anything.  It merely
states that two Context-provided names refer to the two one-sided witnesses
already supplied by F2/F3.  Which orientation/frame chooses these names belongs
to CTX-03 and is intentionally not assumed by FND-01.
-/
def ContextOneSidedNames
    (F : Foundation)
    (E : F2F3OneSidedExistence F)
    (START_K END_K : F.Link) : Prop :=
  START_K = E.startRoot ∧ END_K = E.finishRoot

theorem FND_01_context_names_only
    (F : Foundation)
    (E : F2F3OneSidedExistence F)
    {START_K END_K : F.Link}
    (names : ContextOneSidedNames F E START_K END_K) :
    FullSelf F F.R ∧
    StartOnly F START_K ∧
    FinishOnly F END_K ∧
    PairLocal F (F.form START_K END_K) := by
  rcases names with ⟨hStartName, hEndName⟩
  subst START_K
  subst END_K
  exact ⟨
    root_full_self F,
    f2f3_start_root_pattern F E,
    f2f3_finish_root_pattern F E,
    f2f3_pair_pattern F E
  ⟩


/--
Generic F2/F3 recursive formation for the already accepted finite domain.

FND-01 used the ROOT instances to prove four-pattern realizability.  INV-01
needs the historical generic START(F) / END(F) domain closure.  This interface
does not add a new Link kind: both forms are ordinary Links satisfying the
same single form equation.
-/
structure F2F3RecursiveFormation
    (F : Foundation)
    (E : F2F3OneSidedExistence F) where
  startForm : F.Link → F.Link
  finishForm : F.Link → F.Link

  startEquation :
    ∀ x : F.Link,
      startForm x = F.form (startForm x) x

  finishEquation :
    ∀ x : F.Link,
      finishForm x = F.form x (finishForm x)

  startRootAgreement :
    startForm F.R = E.startRoot

  finishRootAgreement :
    finishForm F.R = E.finishRoot

theorem f2f3_start_form_start
    (F : Foundation)
    (E : F2F3OneSidedExistence F)
    (D : F2F3RecursiveFormation F E)
    (x : F.Link) :
    F.start (D.startForm x) = D.startForm x := by
  calc
    F.start (D.startForm x) =
        F.start (F.form (D.startForm x) x) :=
      congrArg F.start (D.startEquation x)
    _ = D.startForm x := F.form_start (D.startForm x) x

theorem f2f3_start_form_finish
    (F : Foundation)
    (E : F2F3OneSidedExistence F)
    (D : F2F3RecursiveFormation F E)
    (x : F.Link) :
    F.finish (D.startForm x) = x := by
  calc
    F.finish (D.startForm x) =
        F.finish (F.form (D.startForm x) x) :=
      congrArg F.finish (D.startEquation x)
    _ = x := F.form_finish (D.startForm x) x

theorem f2f3_finish_form_start
    (F : Foundation)
    (E : F2F3OneSidedExistence F)
    (D : F2F3RecursiveFormation F E)
    (x : F.Link) :
    F.start (D.finishForm x) = x := by
  calc
    F.start (D.finishForm x) =
        F.start (F.form x (D.finishForm x)) :=
      congrArg F.start (D.finishEquation x)
    _ = x := F.form_start x (D.finishForm x)

theorem f2f3_finish_form_finish
    (F : Foundation)
    (E : F2F3OneSidedExistence F)
    (D : F2F3RecursiveFormation F E)
    (x : F.Link) :
    F.finish (D.finishForm x) = D.finishForm x := by
  calc
    F.finish (D.finishForm x) =
        F.finish (F.form x (D.finishForm x)) :=
      congrArg F.finish (D.finishEquation x)
    _ = D.finishForm x := F.form_finish x (D.finishForm x)

theorem f2f3_start_form_proper
    (F : Foundation)
    (a1 : A1RecursiveSeparation F)
    (E : F2F3OneSidedExistence F)
    (D : F2F3RecursiveFormation F E)
    (x : F.Link) :
    D.startForm x ≠ x := by
  intro hCollapse
  have hEquation := D.startEquation x
  rw [hCollapse] at hEquation
  have hFull : FullSelf F x := by
    constructor
    · calc
        F.start x = F.start (F.form x x) := congrArg F.start hEquation
        _ = x := F.form_start x x
    · calc
        F.finish x = F.finish (F.form x x) := congrArg F.finish hEquation
        _ = x := F.form_finish x x
  have hxRoot : x = F.R := FND_02_unique_root F a1 hFull
  apply E.startRootNeRoot
  calc
    E.startRoot = D.startForm F.R := D.startRootAgreement.symm
    _ = D.startForm x := congrArg D.startForm hxRoot.symm
    _ = x := hCollapse
    _ = F.R := hxRoot

theorem f2f3_finish_form_proper
    (F : Foundation)
    (a1 : A1RecursiveSeparation F)
    (E : F2F3OneSidedExistence F)
    (D : F2F3RecursiveFormation F E)
    (x : F.Link) :
    D.finishForm x ≠ x := by
  intro hCollapse
  have hEquation := D.finishEquation x
  rw [hCollapse] at hEquation
  have hFull : FullSelf F x := by
    constructor
    · calc
        F.start x = F.start (F.form x x) := congrArg F.start hEquation
        _ = x := F.form_start x x
    · calc
        F.finish x = F.finish (F.form x x) := congrArg F.finish hEquation
        _ = x := F.form_finish x x
  have hxRoot : x = F.R := FND_02_unique_root F a1 hFull
  apply E.finishRootNeRoot
  calc
    E.finishRoot = D.finishForm F.R := D.finishRootAgreement.symm
    _ = D.finishForm x := congrArg D.finishForm hxRoot.symm
    _ = x := hCollapse
    _ = F.R := hxRoot

theorem f2f3_start_form_pattern
    (F : Foundation)
    (a1 : A1RecursiveSeparation F)
    (E : F2F3OneSidedExistence F)
    (D : F2F3RecursiveFormation F E)
    (x : F.Link) :
    StartOnly F (D.startForm x) := by
  constructor
  · exact f2f3_start_form_start F E D x
  · intro hFinishSelf
    exact (f2f3_start_form_proper F a1 E D x) <| by
      calc
        D.startForm x = F.finish (D.startForm x) := hFinishSelf.symm
        _ = x := f2f3_start_form_finish F E D x

theorem f2f3_finish_form_pattern
    (F : Foundation)
    (a1 : A1RecursiveSeparation F)
    (E : F2F3OneSidedExistence F)
    (D : F2F3RecursiveFormation F E)
    (x : F.Link) :
    FinishOnly F (D.finishForm x) := by
  constructor
  · intro hStartSelf
    exact (f2f3_finish_form_proper F a1 E D x) <| by
      calc
        D.finishForm x = F.start (D.finishForm x) := hStartSelf.symm
        _ = x := f2f3_finish_form_start F E D x
  · exact f2f3_finish_form_finish F E D x

/--
A constructive decision object.  It carries authority only for the exact
proposition supplied at one recursive node, not a global equality procedure.
-/
inductive ProofDecision (P : Prop) : Type
  | yes : P → ProofDecision P
  | no : (P → False) → ProofDecision P

def proofDecisionOr {P : Prop} : ProofDecision P → (P ∨ ¬ P)
  | .yes h => Or.inl h
  | .no h => Or.inr h

/--
Finite recursive traversal evidence for INV-01.

There is one node constructor, not a four-case semantic datatype.  Recursive
evidence is required only for poles that are not self-incidences.
-/
inductive InversionReady (F : Foundation) : F.Link → Type
  | node {x : F.Link} :
      ProofDecision (StartSelf F x) →
      ProofDecision (FinishSelf F x) →
      (F.start x ≠ x → InversionReady F (F.start x)) →
      (F.finish x ≠ x → InversionReady F (F.finish x)) →
      InversionReady F x

def inversionReadyDecision
    (F : Foundation)
    {x : F.Link} :
    InversionReady F x → LocalSelfDecision F x
  | .node startDecision finishDecision _ _ =>
      ⟨proofDecisionOr startDecision, proofDecisionOr finishDecision⟩

theorem inversion_ready_grounded
    (F : Foundation)
    {x : F.Link}
    (ready : InversionReady F x) :
    Grounded F x := by
  induction ready with
  | node startDecision finishDecision startReady finishReady startIH finishIH =>
      exact Grounded.node
        (fun h => startIH h)
        (fun h => finishIH h)

/--
INV-01 semantic relation.

The relation is defined over Links themselves.  START/END target formation is
the accepted F2/F3 recursive domain closure; PAIR uses the one Link-forming
primitive with recursively inverted poles in reverse order.
-/
inductive RecursiveInverse
    (F : Foundation)
    (E : F2F3OneSidedExistence F)
    (D : F2F3RecursiveFormation F E) :
    F.Link → F.Link → Prop
  | rootCase :
      RecursiveInverse F E D F.R F.R
  | startCase {x childInverse : F.Link} :
      StartOnly F x →
      RecursiveInverse F E D (F.finish x) childInverse →
      RecursiveInverse F E D x (D.finishForm childInverse)
  | finishCase {x childInverse : F.Link} :
      FinishOnly F x →
      RecursiveInverse F E D (F.start x) childInverse →
      RecursiveInverse F E D x (D.startForm childInverse)
  | pairCase {x startInverse finishInverse : F.Link} :
      PairLocal F x →
      RecursiveInverse F E D (F.start x) startInverse →
      RecursiveInverse F E D (F.finish x) finishInverse →
      RecursiveInverse F E D x (F.form finishInverse startInverse)

theorem recursive_inverse_exists
    (F : Foundation)
    (a1 : A1RecursiveSeparation F)
    (N : F2F3Normalization F
      (fun {x} hx => FND_02_unique_root F a1 hx))
    (E : F2F3OneSidedExistence F)
    (D : F2F3RecursiveFormation F E)
    {x : F.Link}
    (ready : InversionReady F x) :
    ∃ y : F.Link, RecursiveInverse F E D x y := by
  induction ready with
  | @node x startDecision finishDecision startReady finishReady startIH finishIH =>
      have localDecision : LocalSelfDecision F x :=
        ⟨proofDecisionOr startDecision, proofDecisionOr finishDecision⟩
      have cases :=
        (FND_01_four_structural_cases F a1 N E localDecision).1
      rcases cases with hFull | hStart | hFinish | hPair
      · have hxRoot : x = F.R := FND_02_unique_root F a1 hFull
        subst x
        exact ⟨F.R, RecursiveInverse.rootCase⟩
      · rcases finishIH hStart.2 with ⟨childInverse, hChild⟩
        exact ⟨D.finishForm childInverse,
          RecursiveInverse.startCase hStart hChild⟩
      · rcases startIH hFinish.1 with ⟨childInverse, hChild⟩
        exact ⟨D.startForm childInverse,
          RecursiveInverse.finishCase hFinish hChild⟩
      · rcases startIH hPair.1 with ⟨startInverse, hStartInverse⟩
        rcases finishIH hPair.2 with ⟨finishInverse, hFinishInverse⟩
        exact ⟨F.form finishInverse startInverse,
          RecursiveInverse.pairCase hPair hStartInverse hFinishInverse⟩

theorem recursive_inverse_functional
    (F : Foundation)
    (E : F2F3OneSidedExistence F)
    (D : F2F3RecursiveFormation F E)
    {x y z : F.Link}
    (left : RecursiveInverse F E D x y)
    (right : RecursiveInverse F E D x z) :
    y = z := by
  induction left generalizing z with
  | rootCase =>
      cases right with
      | rootCase => rfl
      | startCase hStart _ =>
          exact False.elim (hStart.2 (root_full_self F).2)
      | finishCase hFinish _ =>
          exact False.elim (hFinish.1 (root_full_self F).1)
      | pairCase hPair _ _ =>
          exact False.elim (hPair.1 (root_full_self F).1)
  | startCase hStart hChild childIH =>
      cases right with
      | rootCase =>
          exact False.elim (hStart.2 (root_full_self F).2)
      | startCase _ hOtherChild =>
          exact congrArg D.finishForm (childIH hOtherChild)
      | finishCase hFinish _ =>
          exact False.elim (hFinish.1 hStart.1)
      | pairCase hPair _ _ =>
          exact False.elim (hPair.1 hStart.1)
  | finishCase hFinish hChild childIH =>
      cases right with
      | rootCase =>
          exact False.elim (hFinish.1 (root_full_self F).1)
      | startCase hStart _ =>
          exact False.elim (hFinish.1 hStart.1)
      | finishCase _ hOtherChild =>
          exact congrArg D.startForm (childIH hOtherChild)
      | pairCase hPair _ _ =>
          exact False.elim (hPair.2 hFinish.2)
  | pairCase hPair hStartChild hFinishChild startIH finishIH =>
      cases right with
      | rootCase =>
          exact False.elim (hPair.1 (root_full_self F).1)
      | startCase hStart _ =>
          exact False.elim (hPair.1 hStart.1)
      | finishCase hFinish _ =>
          exact False.elim (hPair.2 hFinish.2)
      | pairCase _ hOtherStart hOtherFinish =>
          have hs := startIH hOtherStart
          have hf := finishIH hOtherFinish
          rw [hs, hf]

/--
INV-01 — recursive Link inversion is uniquely defined on the declared finite
recursive domain equipped with exact local decision evidence.

The result is a unique semantic Link.  No host graph, codec, handle identity or
global equality decision participates in the definition.
-/
theorem INV_01_recursive_inversion
    (F : Foundation)
    (a1 : A1RecursiveSeparation F)
    (N : F2F3Normalization F
      (fun {x} hx => FND_02_unique_root F a1 hx))
    (E : F2F3OneSidedExistence F)
    (D : F2F3RecursiveFormation F E)
    {x : F.Link}
    (ready : InversionReady F x) :
    ∃! y : F.Link, RecursiveInverse F E D x y := by
  rcases recursive_inverse_exists F a1 N E D ready with ⟨y, hy⟩
  exact ⟨y, hy, fun z hz => recursive_inverse_functional F E D hz hy⟩

end MTS.External
