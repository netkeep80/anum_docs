/-
EXTERNAL PROJECTION BOUNDARY

This file is a prover-side projection of MTS into Lean's metalanguage.
Lean vocabulary such as Type, Prop, structure, inductive, and theorem is
verification machinery only; it is not MTS ontology, native notation, or
semantic authority.

EXTERNAL THEORY PROJECTION MANIFEST

HOST FOUNDATION:
- Lean 4 dependent type theory / kernel metalanguage.

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
-/

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
External F2/F3 normalization interfaces.

Historical MTS source 1e529a23... describes finite recursive forms modulo the
least relation ≈, with one alpha-neutral normal form per semantic class.

Two proof strengths are deliberately separated:

* F2F3GroundedNormalization is the exact finite R-grounded premise used by
  the accepted FND-13 theorem.
* F2F3Normalization is a strictly stronger global completeness premise kept
  only for downstream lemmas that currently quantify over arbitrary Links.

Neither interface is indexed by FND-02.  Unique ROOT is a separate theorem and
must not appear as a fake dependency when the normalization fields do not use
it.
-/
def RootUniqueness (F : Foundation) : Prop :=
  ∀ {x : F.Link}, FullSelf F x → x = F.R

structure F2F3GroundedNormalization (F : Foundation) where
  NormalForm : Type
  compose : NormalForm → NormalForm → NormalForm
  normalForm : F.Link → NormalForm

  recursiveEquation :
    ∀ x : F.Link,
      Grounded F x →
      normalForm x =
        compose (normalForm (F.start x)) (normalForm (F.finish x))

  complete :
    ∀ {x y : F.Link},
      Grounded F x →
      Grounded F y →
      normalForm x = normalForm y →
      x = y

structure F2F3Normalization (F : Foundation) where
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
Constructor injectivity follows directly from the primitive projection laws.
This is weaker than arbitrary-Link pole extensionality and requires no
normalization premise.
-/
theorem fnd13_form_injective
    (F : Foundation)
    {a b c d : F.Link} :
    F.form a b = F.form c d ↔
      (a = c ∧ b = d) := by
  constructor
  · intro h
    constructor
    · calc
        a = F.start (F.form a b) := (F.form_start a b).symm
        _ = F.start (F.form c d) := congrArg F.start h
        _ = c := F.form_start c d
    · calc
        b = F.finish (F.form a b) := (F.form_finish a b).symm
        _ = F.finish (F.form c d) := congrArg F.finish h
        _ = d := F.form_finish c d
  · intro h
    rw [h.1, h.2]

/--
FND-13 / historical A6 — semantic Link identity is ordered-pole identity on
the accepted finite R-grounded semantic domain.

The theorem consumes only an explicit grounded normalization-completeness
premise for the two Links under comparison.  It does not depend on FND-02 and
does not claim arbitrary non-grounded Link extensionality.
-/
theorem FND_13_identity_by_poles
    (F : Foundation)
    (N : F2F3GroundedNormalization F)
    {x y : F.Link}
    (gx : Grounded F x)
    (gy : Grounded F y) :
    x = y ↔
      (F.start x = F.start y ∧ F.finish x = F.finish y) := by
  constructor
  · intro h
    cases h
    exact ⟨rfl, rfl⟩
  · intro h
    apply N.complete gx gy
    calc
      N.normalForm x =
          N.compose (N.normalForm (F.start x)) (N.normalForm (F.finish x)) :=
        N.recursiveEquation x gx
      _ =
          N.compose (N.normalForm (F.start y)) (N.normalForm (F.finish y)) := by
        rw [h.1, h.2]
      _ = N.normalForm y := (N.recursiveEquation y gy).symm

/--
Explicit stronger auxiliary theorem.

This is not the accepted FND-13 domain statement.  It records exactly what a
caller receives if it supplies the stronger global F2/F3 normalization
completeness premise used by older downstream proof slices.
-/
theorem global_identity_by_poles_from_complete_normalization
    (F : Foundation)
    (N : F2F3Normalization F)
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

The full-self branch is tied to unique ROOT through FND-02.  Ordered-pole
identity remains the separate FND-13 theorem and is intentionally not imported
into this local classification.  Context orientation later names the two
one-sided patterns but does not create them.
-/
theorem FND_01_local_partition
    (F : Foundation)
    (a1 : A1RecursiveSeparation F)
    {x : F.Link}
    (decision : LocalSelfDecision F x) :
    LocalSelfIncidenceExhaustive F x ∧
    LocalSelfIncidenceExclusive F x ∧
    (FullSelf F x → x = F.R) := by
  exact ⟨
    local_self_incidence_exhaustive F decision,
    local_self_incidence_exclusive F,
    fun h => FND_02_unique_root F a1 h
  ⟩


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

The capstone keeps the structural classification and grounded realizability
together.  Full self-closure is identified with unique ROOT through FND-02;
ordered-pole identity remains the separate FND-13 theorem.
-/
theorem FND_01_four_structural_cases
    (F : Foundation)
    (a1 : A1RecursiveSeparation F)
    (E : F2F3OneSidedExistence F)
    {x : F.Link}
    (decision : LocalSelfDecision F x) :
    LocalSelfIncidenceExhaustive F x ∧
    LocalSelfIncidenceExclusive F x ∧
    (FullSelf F x → x = F.R) ∧
    (FullSelf F F.R ∧
      ∃ startWitness finishWitness pairWitness : F.Link,
        Grounded F startWitness ∧
        Grounded F finishWitness ∧
        Grounded F pairWitness ∧
        StartOnly F startWitness ∧
        FinishOnly F finishWitness ∧
        PairLocal F pairWitness) := by
  have c1 := FND_01_local_partition F a1 decision
  have c2 := FND_01_grounded_realizability F E
  exact ⟨
    c1.1,
    c1.2.1,
    c1.2.2,
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
FND-03 external projection of the derived root/aspect basis.

The theorem deliberately introduces no four-constructor datatype and no new
ontology sort.  R is the existing Foundation root.  O/C are merely the two
Context-relative names for the already supplied one-sided F2/F3 witnesses.
L is formed by the one ordinary Link-forming primitive.

A1 is used only through FND-02 to retain the unique-full-self/root boundary.
The Context naming premise selects labels; it does not create or classify Links.
-/
theorem FND_03_derived_aspect_basis
    (F : Foundation)
    (a1 : A1RecursiveSeparation F)
    (E : F2F3OneSidedExistence F)
    {O C : F.Link}
    (names : ContextOneSidedNames F E O C) :
    ∃ R L : F.Link,
      R = F.R ∧
      L = F.form O C ∧
      FullSelf F R ∧
      StartOnly F O ∧
      FinishOnly F C ∧
      PairLocal F L ∧
      (∀ x : F.Link, FullSelf F x → x = R) := by
  have hBasis := FND_01_context_names_only F E names
  refine ⟨F.R, F.form O C, rfl, rfl, ?_, ?_, ?_, ?_, ?_⟩
  · exact hBasis.1
  · exact hBasis.2.1
  · exact hBasis.2.2.1
  · exact hBasis.2.2.2
  · intro x hFull
    exact FND_02_unique_root F a1 hFull

/--
Declared finite recursive domain used by structural inversion.

The domain realizes the historical F2/F3 recursive forms START(F) and END(F)
for arbitrary grounded F.  These are proof-level constructors over the one
Link-forming primitive, not new ontology kinds.

Local self-incidence decisions are explicit proof inputs for the declared
finite domain; they are not host handles, codec digits, or graph labels.
-/
structure RecursiveInversionDomain
    (F : Foundation)
    (E : F2F3OneSidedExistence F) where
  startForm : F.Link → F.Link
  endForm : F.Link → F.Link

  startEquation :
    ∀ a : F.Link,
      startForm a = F.form (startForm a) a

  endEquation :
    ∀ a : F.Link,
      endForm a = F.form a (endForm a)

  startRootCompat :
    startForm F.R = E.startRoot

  endRootCompat :
    endForm F.R = E.finishRoot

  decide :
    ∀ {x : F.Link},
      Grounded F x →
      LocalSelfDecision F x

theorem recursive_start_start
    (F : Foundation)
    {E : F2F3OneSidedExistence F}
    (D : RecursiveInversionDomain F E)
    (a : F.Link) :
    F.start (D.startForm a) = D.startForm a := by
  calc
    F.start (D.startForm a) =
        F.start (F.form (D.startForm a) a) :=
      congrArg F.start (D.startEquation a)
    _ = D.startForm a := F.form_start (D.startForm a) a

theorem recursive_start_finish
    (F : Foundation)
    {E : F2F3OneSidedExistence F}
    (D : RecursiveInversionDomain F E)
    (a : F.Link) :
    F.finish (D.startForm a) = a := by
  calc
    F.finish (D.startForm a) =
        F.finish (F.form (D.startForm a) a) :=
      congrArg F.finish (D.startEquation a)
    _ = a := F.form_finish (D.startForm a) a

theorem recursive_end_start
    (F : Foundation)
    {E : F2F3OneSidedExistence F}
    (D : RecursiveInversionDomain F E)
    (a : F.Link) :
    F.start (D.endForm a) = a := by
  calc
    F.start (D.endForm a) =
        F.start (F.form a (D.endForm a)) :=
      congrArg F.start (D.endEquation a)
    _ = a := F.form_start a (D.endForm a)

theorem recursive_end_finish
    (F : Foundation)
    {E : F2F3OneSidedExistence F}
    (D : RecursiveInversionDomain F E)
    (a : F.Link) :
    F.finish (D.endForm a) = D.endForm a := by
  calc
    F.finish (D.endForm a) =
        F.finish (F.form a (D.endForm a)) :=
      congrArg F.finish (D.endEquation a)
    _ = D.endForm a := F.form_finish a (D.endForm a)

theorem recursive_start_grounded
    (F : Foundation)
    {E : F2F3OneSidedExistence F}
    (D : RecursiveInversionDomain F E)
    {a : F.Link}
    (ga : Grounded F a) :
    Grounded F (D.startForm a) := by
  apply Grounded.node
  · intro hNot
    exact False.elim (hNot (recursive_start_start F D a))
  · intro _
    simpa only [recursive_start_finish F D a] using ga

theorem recursive_end_grounded
    (F : Foundation)
    {E : F2F3OneSidedExistence F}
    (D : RecursiveInversionDomain F E)
    {a : F.Link}
    (ga : Grounded F a) :
    Grounded F (D.endForm a) := by
  apply Grounded.node
  · intro _
    simpa only [recursive_end_start F D a] using ga
  · intro hNot
    exact False.elim (hNot (recursive_end_finish F D a))

theorem recursive_pair_grounded
    (F : Foundation)
    {a b : F.Link}
    (ga : Grounded F a)
    (gb : Grounded F b) :
    Grounded F (F.form a b) := by
  apply Grounded.node
  · intro _
    simpa only [F.form_start] using ga
  · intro _
    simpa only [F.form_finish] using gb

/--
Prop-valued graph of recursive structural inversion.

This is not an Aspect datatype.  The proof rules are the structural action of
J itself:
  ROOT      -> ROOT
  START(F)  -> END(J(F))
  END(F)    -> START(J(F))
  PAIR(F,G) -> PAIR(J(G), J(F))
-/
inductive RecursiveInversion
    (F : Foundation)
    {E : F2F3OneSidedExistence F}
    (D : RecursiveInversionDomain F E) :
    F.Link → F.Link → Prop
  | root :
      RecursiveInversion F D F.R F.R
  | start {x childInverse : F.Link} :
      StartOnly F x →
      RecursiveInversion F D (F.finish x) childInverse →
      RecursiveInversion F D x (D.endForm childInverse)
  | finish {x childInverse : F.Link} :
      FinishOnly F x →
      RecursiveInversion F D (F.start x) childInverse →
      RecursiveInversion F D x (D.startForm childInverse)
  | pair {x inverseFinish inverseStart : F.Link} :
      PairLocal F x →
      RecursiveInversion F D (F.finish x) inverseFinish →
      RecursiveInversion F D (F.start x) inverseStart →
      RecursiveInversion F D x (F.form inverseFinish inverseStart)

theorem recursive_inversion_image_grounded
    (F : Foundation)
    {E : F2F3OneSidedExistence F}
    (D : RecursiveInversionDomain F E)
    {x y : F.Link}
    (h : RecursiveInversion F D x y) :
    Grounded F y := by
  induction h with
  | root =>
      exact grounded_of_full_self F (root_full_self F)
  | start _ _ ih =>
      exact recursive_end_grounded F D ih
  | finish _ _ ih =>
      exact recursive_start_grounded F D ih
  | pair _ _ _ ihFinish ihStart =>
      exact recursive_pair_grounded F ihFinish ihStart

/--
INV-01 totality on the declared finite recursive domain.

The proof recurses only through non-self poles supplied by finite Grounded
evidence.  The local four-way split is imported from FND-01; the fully self
case is identified with ROOT by FND-02.
-/
theorem INV_01_recursive_inversion_total
    (F : Foundation)
    (a1 : A1RecursiveSeparation F)
    (E : F2F3OneSidedExistence F)
    (D : RecursiveInversionDomain F E)
    {x : F.Link}
    (gx : Grounded F x) :
    ∃ y : F.Link, RecursiveInversion F D x y := by
  induction gx with
  | @node current startStep finishStep ihStart ihFinish =>
      have gxCurrent : Grounded F current :=
        Grounded.node startStep finishStep
      have decision := D.decide gxCurrent
      have partition := FND_01_local_partition F a1 decision
      rcases partition.1 with hFull | hStart | hFinish | hPair
      · have hxRoot := FND_02_unique_root F a1 hFull
        refine ⟨F.R, ?_⟩
        simpa only [hxRoot] using
          (RecursiveInversion.root (F := F) (D := D))
      · rcases ihFinish hStart.2 with ⟨childInverse, hChild⟩
        exact ⟨D.endForm childInverse, RecursiveInversion.start hStart hChild⟩
      · rcases ihStart hFinish.1 with ⟨childInverse, hChild⟩
        exact ⟨D.startForm childInverse, RecursiveInversion.finish hFinish hChild⟩
      · rcases ihFinish hPair.2 with ⟨inverseFinish, hFinishInv⟩
        rcases ihStart hPair.1 with ⟨inverseStart, hStartInv⟩
        exact ⟨
          F.form inverseFinish inverseStart,
          RecursiveInversion.pair hPair hFinishInv hStartInv
        ⟩


theorem recursive_full_start_disjoint
    (F : Foundation)
    {x : F.Link}
    (hFull : FullSelf F x)
    (hStart : StartOnly F x) :
    False :=
  hStart.2 hFull.2

theorem recursive_full_finish_disjoint
    (F : Foundation)
    {x : F.Link}
    (hFull : FullSelf F x)
    (hFinish : FinishOnly F x) :
    False :=
  hFinish.1 hFull.1

theorem recursive_full_pair_disjoint
    (F : Foundation)
    {x : F.Link}
    (hFull : FullSelf F x)
    (hPair : PairLocal F x) :
    False :=
  hPair.1 hFull.1

theorem recursive_start_finish_disjoint
    (F : Foundation)
    {x : F.Link}
    (hStart : StartOnly F x)
    (hFinish : FinishOnly F x) :
    False :=
  hFinish.1 hStart.1

theorem recursive_start_pair_disjoint
    (F : Foundation)
    {x : F.Link}
    (hStart : StartOnly F x)
    (hPair : PairLocal F x) :
    False :=
  hPair.1 hStart.1

theorem recursive_finish_pair_disjoint
    (F : Foundation)
    {x : F.Link}
    (hFinish : FinishOnly F x)
    (hPair : PairLocal F x) :
    False :=
  hPair.2 hFinish.2

/--
Relational spelling of the defining equation

  J(A ⟼ B) = J(B) ⟼ J(A).

For self-incidence, one recursively inverted pole is the current inverse Link
itself.  This theorem makes that recursion explicit without expanding J into a
host data representation.
-/
theorem INV_01_recursive_pole_reversal
    (F : Foundation)
    {E : F2F3OneSidedExistence F}
    (D : RecursiveInversionDomain F E)
    {x y : F.Link}
    (h : RecursiveInversion F D x y) :
    ∃ inverseFinish inverseStart : F.Link,
      RecursiveInversion F D (F.finish x) inverseFinish ∧
      RecursiveInversion F D (F.start x) inverseStart ∧
      y = F.form inverseFinish inverseStart := by
  cases h with
  | root =>
      have hRoot := root_full_self F
      refine ⟨F.R, F.R, ?_, ?_, F.root_self.symm⟩
      · simpa only [hRoot.2] using
          (RecursiveInversion.root (F := F) (D := D))
      · simpa only [hRoot.1] using
          (RecursiveInversion.root (F := F) (D := D))
  | start hStart hChild =>
      have selfInverse :=
        RecursiveInversion.start (D := D) hStart hChild
      refine ⟨
        _,
        _,
        hChild,
        ?_,
        D.endEquation _
      ⟩
      rw [hStart.1]
      exact selfInverse
  | finish hFinish hChild =>
      have selfInverse :=
        RecursiveInversion.finish (D := D) hFinish hChild
      refine ⟨
        _,
        _,
        ?_,
        hChild,
        D.startEquation _
      ⟩
      rw [hFinish.2]
      exact selfInverse
  | pair hPair hFinishInv hStartInv =>
      exact ⟨
        _,
        _,
        hFinishInv,
        hStartInv,
        rfl
      ⟩

/--
The structural inversion graph is functional: one source Link cannot have two
different structural inverses.

The proof uses only recursive uniqueness and disjoint self-incidence
propositions; no host enum or representation equality participates.
-/
theorem recursive_inversion_functional
    (F : Foundation)
    {E : F2F3OneSidedExistence F}
    (D : RecursiveInversionDomain F E)
    {x y z : F.Link}
    (hy : RecursiveInversion F D x y)
    (hz : RecursiveInversion F D x z) :
    y = z := by
  induction hy generalizing z with
  | root =>
      cases hz with
      | root => rfl
      | start hStart _ =>
          exact False.elim
            (recursive_full_start_disjoint F (root_full_self F) hStart)
      | finish hFinish _ =>
          exact False.elim
            (recursive_full_finish_disjoint F (root_full_self F) hFinish)
      | pair hPair _ _ =>
          exact False.elim
            (recursive_full_pair_disjoint F (root_full_self F) hPair)
  | start hStart hChild ih =>
      cases hz with
      | root =>
          exact False.elim
            (recursive_full_start_disjoint F (root_full_self F) hStart)
      | start _ hOther =>
          exact congrArg D.endForm (ih hOther)
      | finish hFinish _ =>
          exact False.elim
            (recursive_start_finish_disjoint F hStart hFinish)
      | pair hPair _ _ =>
          exact False.elim
            (recursive_start_pair_disjoint F hStart hPair)
  | finish hFinish hChild ih =>
      cases hz with
      | root =>
          exact False.elim
            (recursive_full_finish_disjoint F (root_full_self F) hFinish)
      | start hStart _ =>
          exact False.elim
            (recursive_start_finish_disjoint F hStart hFinish)
      | finish _ hOther =>
          exact congrArg D.startForm (ih hOther)
      | pair hPair _ _ =>
          exact False.elim
            (recursive_finish_pair_disjoint F hFinish hPair)
  | pair hPair hFinishInv hStartInv ihFinish ihStart =>
      cases hz with
      | root =>
          exact False.elim
            (recursive_full_pair_disjoint F (root_full_self F) hPair)
      | start hStart _ =>
          exact False.elim
            (recursive_start_pair_disjoint F hStart hPair)
      | finish hFinish _ =>
          exact False.elim
            (recursive_finish_pair_disjoint F hFinish hPair)
      | pair _ hOtherFinish hOtherStart =>
          have hf := ihFinish hOtherFinish
          have hs := ihStart hOtherStart
          rw [hf, hs]

/--
Constructive unique-image proposition used without importing library-level
ExistsUnique notation.
-/
def UniqueRecursiveInverse
    (F : Foundation)
    {E : F2F3OneSidedExistence F}
    (D : RecursiveInversionDomain F E)
    (x : F.Link) : Prop :=
  ∃ y : F.Link,
    RecursiveInversion F D x y ∧
    ∀ z : F.Link,
      RecursiveInversion F D x z →
      z = y

/--
INV-01 capstone: recursive structural inversion is a unique total graph on the
declared finite Grounded domain.

This is the external proof meaning of a function J without invoking classical
choice: every source has exactly one graph image.
-/
theorem INV_01_recursive_inversion_unique_total
    (F : Foundation)
    (a1 : A1RecursiveSeparation F)
    (E : F2F3OneSidedExistence F)
    (D : RecursiveInversionDomain F E)
    {x : F.Link}
    (gx : Grounded F x) :
    UniqueRecursiveInverse F D x := by
  rcases INV_01_recursive_inversion_total F a1 E D gx with
    ⟨y, hy⟩
  refine ⟨y, hy, ?_⟩
  intro z hz
  exact recursive_inversion_functional F D hz hy


/--
Finite recursive distinction is irreflexive.

This is needed to show that two grounded one-sided Links with the same external
pole carry no recursive distinction.  It follows directly from the proof
relation itself; no equality decision procedure is used.
-/
theorem distinguishable_same_false
    (F : Foundation)
    {x y : F.Link}
    (h : Distinguishable F x y)
    (hxy : x = y) :
    False := by
  induction h with
  | startSelfLeft hSelf hNot =>
      cases hxy
      exact hNot hSelf
  | startSelfRight hNot hSelf =>
      cases hxy
      exact hNot hSelf
  | finishSelfLeft hSelf hNot =>
      cases hxy
      exact hNot hSelf
  | finishSelfRight hNot hSelf =>
      cases hxy
      exact hNot hSelf
  | startChild _ _ _ ih =>
      cases hxy
      exact ih rfl
  | finishChild _ _ _ ih =>
      cases hxy
      exact ih rfl

theorem distinguishable_irreflexive
    (F : Foundation)
    {x : F.Link} :
    ¬ Distinguishable F x x := by
  intro h
  exact distinguishable_same_false F h rfl

theorem grounded_start_of_nonself
    (F : Foundation)
    {x : F.Link}
    (gx : Grounded F x)
    (hNot : F.start x ≠ x) :
    Grounded F (F.start x) := by
  cases gx with
  | node startStep _ =>
      exact startStep hNot

theorem grounded_finish_of_nonself
    (F : Foundation)
    {x : F.Link}
    (gx : Grounded F x)
    (hNot : F.finish x ≠ x) :
    Grounded F (F.finish x) := by
  cases gx with
  | node _ finishStep =>
      exact finishStep hNot

/--
Generic F2/F3 START(F) is a proper one-sided form, not an accidental ROOT.
-/
theorem recursive_start_form_pattern
    (F : Foundation)
    (a1 : A1RecursiveSeparation F)
    (E : F2F3OneSidedExistence F)
    (D : RecursiveInversionDomain F E)
    (a : F.Link) :
    StartOnly F (D.startForm a) := by
  constructor
  · exact recursive_start_start F D a
  · intro hFinishSelf
    have hFull : FullSelf F (D.startForm a) :=
      ⟨recursive_start_start F D a, hFinishSelf⟩
    have hRoot := FND_02_unique_root F a1 hFull
    have haRoot : a = F.R := by
      calc
        a = F.finish (D.startForm a) :=
          (recursive_start_finish F D a).symm
        _ = F.finish F.R := congrArg F.finish hRoot
        _ = F.R := (root_full_self F).2
    apply E.startRootNeRoot
    calc
      E.startRoot = D.startForm F.R := D.startRootCompat.symm
      _ = D.startForm a := congrArg D.startForm haRoot.symm
      _ = F.R := hRoot

/--
Generic F2/F3 END(F) is a proper one-sided form, not an accidental ROOT.
-/
theorem recursive_end_form_pattern
    (F : Foundation)
    (a1 : A1RecursiveSeparation F)
    (E : F2F3OneSidedExistence F)
    (D : RecursiveInversionDomain F E)
    (a : F.Link) :
    FinishOnly F (D.endForm a) := by
  constructor
  · intro hStartSelf
    have hFull : FullSelf F (D.endForm a) :=
      ⟨hStartSelf, recursive_end_finish F D a⟩
    have hRoot := FND_02_unique_root F a1 hFull
    have haRoot : a = F.R := by
      calc
        a = F.start (D.endForm a) :=
          (recursive_end_start F D a).symm
        _ = F.start F.R := congrArg F.start hRoot
        _ = F.R := (root_full_self F).1
    apply E.finishRootNeRoot
    calc
      E.finishRoot = D.endForm F.R := D.endRootCompat.symm
      _ = D.endForm a := congrArg D.endForm haRoot.symm
      _ = F.R := hRoot
  · exact recursive_end_finish F D a

/--
A grounded StartOnly Link is the unique semantic START of its external finish
pole.  This is derived from A1 recursive separation, not added as a domain
field.
-/
theorem recursive_start_form_canonical
    (F : Foundation)
    (a1 : A1RecursiveSeparation F)
    (E : F2F3OneSidedExistence F)
    (D : RecursiveInversionDomain F E)
    {x : F.Link}
    (gx : Grounded F x)
    (hStart : StartOnly F x) :
    x = D.startForm (F.finish x) := by
  have gFinish := grounded_finish_of_nonself F gx hStart.2
  have gCanonical := recursive_start_grounded F D gFinish
  have hCanonical :=
    recursive_start_form_pattern F a1 E D (F.finish x)
  apply a1 gx gCanonical
  intro hDist
  cases hDist with
  | startSelfLeft _ hNot =>
      exact hNot hCanonical.1
  | startSelfRight hNot _ =>
      exact hNot hStart.1
  | finishSelfLeft hSelf _ =>
      exact hStart.2 hSelf
  | finishSelfRight _ hSelf =>
      exact hCanonical.2 hSelf
  | startChild hNot _ _ =>
      exact hNot hStart.1
  | finishChild _ _ hChild =>
      apply distinguishable_irreflexive F
      simpa only [recursive_start_finish F D (F.finish x)] using hChild

/--
A grounded FinishOnly Link is the unique semantic END of its external start
pole.
-/
theorem recursive_end_form_canonical
    (F : Foundation)
    (a1 : A1RecursiveSeparation F)
    (E : F2F3OneSidedExistence F)
    (D : RecursiveInversionDomain F E)
    {x : F.Link}
    (gx : Grounded F x)
    (hFinish : FinishOnly F x) :
    x = D.endForm (F.start x) := by
  have gStart := grounded_start_of_nonself F gx hFinish.1
  have gCanonical := recursive_end_grounded F D gStart
  have hCanonical :=
    recursive_end_form_pattern F a1 E D (F.start x)
  apply a1 gx gCanonical
  intro hDist
  cases hDist with
  | startSelfLeft hSelf _ =>
      exact hFinish.1 hSelf
  | startSelfRight _ hSelf =>
      exact hCanonical.1 hSelf
  | finishSelfLeft _ hNot =>
      exact hNot hCanonical.2
  | finishSelfRight hNot _ =>
      exact hNot hFinish.2
  | startChild _ _ hChild =>
      apply distinguishable_irreflexive F
      simpa only [recursive_end_start F D (F.start x)] using hChild
  | finishChild hNot _ _ =>
      exact hNot hFinish.2

/--
Under the explicitly stronger global normalization-completeness premise, any
Link is derivably equal to the form built from its ordered poles.

This auxiliary reconstruction is intentionally not attributed to the accepted
finite-grounded FND-13 theorem.
-/
theorem poles_recompose_from_global_normalization
    (F : Foundation)
    (a1 : A1RecursiveSeparation F)
    (N : F2F3Normalization F)
    (x : F.Link) :
    let s := F.start x
    let t := F.finish x
    F.form s t = x := by
  dsimp
  apply (global_identity_by_poles_from_complete_normalization F N).2
  exact ⟨
    F.form_start (F.start x) (F.finish x),
    F.form_finish (F.start x) (F.finish x)
  ⟩


/--
Every source admitted by the INV-01 structural graph is itself in the exact
finite Grounded domain.  This is derived from the inversion proof tree; no
larger domain is introduced for INV-02.
-/
theorem recursive_inversion_source_grounded
    (F : Foundation)
    {E : F2F3OneSidedExistence F}
    (D : RecursiveInversionDomain F E)
    {x y : F.Link}
    (h : RecursiveInversion F D x y) :
    Grounded F x := by
  induction h with
  | root =>
      exact grounded_of_full_self F (root_full_self F)
  | start hStart _ ih =>
      apply Grounded.node
      · intro hNot
        exact False.elim (hNot hStart.1)
      · intro _
        exact ih
  | finish hFinish _ ih =>
      apply Grounded.node
      · intro _
        exact ih
      · intro hNot
        exact False.elim (hNot hFinish.2)
  | pair hPair _ _ ihFinish ihStart =>
      apply Grounded.node
      · intro _
        exact ihStart
      · intro _
        exact ihFinish

/--
A structural inverse whose source is StartOnly must use the INV-01 START rule.
This is an elimination lemma for the existing proof graph, not a new case
classifier.
-/
theorem recursive_inversion_from_start_only
    (F : Foundation)
    {E : F2F3OneSidedExistence F}
    (D : RecursiveInversionDomain F E)
    {x y : F.Link}
    (hStart : StartOnly F x)
    (h : RecursiveInversion F D x y) :
    ∃ childInverse : F.Link,
      RecursiveInversion F D (F.finish x) childInverse ∧
      y = D.endForm childInverse := by
  cases h with
  | root =>
      exact False.elim
        (recursive_full_start_disjoint F (root_full_self F) hStart)
  | start _ hChild =>
      exact ⟨_, hChild, rfl⟩
  | finish hFinish _ =>
      exact False.elim
        (recursive_start_finish_disjoint F hStart hFinish)
  | pair hPair _ _ =>
      exact False.elim
        (recursive_start_pair_disjoint F hStart hPair)

/--
A structural inverse whose source is FinishOnly must use the INV-01 FINISH
rule.
-/
theorem recursive_inversion_from_finish_only
    (F : Foundation)
    {E : F2F3OneSidedExistence F}
    (D : RecursiveInversionDomain F E)
    {x y : F.Link}
    (hFinish : FinishOnly F x)
    (h : RecursiveInversion F D x y) :
    ∃ childInverse : F.Link,
      RecursiveInversion F D (F.start x) childInverse ∧
      y = D.startForm childInverse := by
  cases h with
  | root =>
      exact False.elim
        (recursive_full_finish_disjoint F (root_full_self F) hFinish)
  | start hStart _ =>
      exact False.elim
        (recursive_start_finish_disjoint F hStart hFinish)
  | finish _ hChild =>
      exact ⟨_, hChild, rfl⟩
  | pair hPair _ _ =>
      exact False.elim
        (recursive_finish_pair_disjoint F hFinish hPair)

/--
INV-02 relational core: applying the same structural inversion graph twice
returns the original semantic Link.

The induction is over the first INV-01 proof tree, so INV-02 has exactly the
same declared domain as INV-01.  START/END branches use the already derived
F2/F3 canonical one-sided forms.  PAIR reverses the two recursively inverted
poles again and then uses the exact Grounded FND-13 pole reconstruction.
-/
theorem INV_02_recursive_inversion_involutive
    (F : Foundation)
    (a1 : A1RecursiveSeparation F)
    (N : F2F3GroundedNormalization F)
    (E : F2F3OneSidedExistence F)
    (D : RecursiveInversionDomain F E)
    {x y z : F.Link}
    (hxy : RecursiveInversion F D x y)
    (hyz : RecursiveInversion F D y z) :
    z = x := by
  induction hxy generalizing z with
  | root =>
      cases hyz with
      | root =>
          rfl
      | start hStart _ =>
          exact False.elim
            (recursive_full_start_disjoint F (root_full_self F) hStart)
      | finish hFinish _ =>
          exact False.elim
            (recursive_full_finish_disjoint F (root_full_self F) hFinish)
      | pair hPair _ _ =>
          exact False.elim
            (recursive_full_pair_disjoint F (root_full_self F) hPair)
  | @start x childInverse hStart hChild ih =>
      have hYFinish : FinishOnly F (D.endForm childInverse) :=
        recursive_end_form_pattern F a1 E D childInverse
      have gx : Grounded F x := by
        apply Grounded.node
        · intro hNot
          exact False.elim (hNot hStart.1)
        · intro _
          exact recursive_inversion_source_grounded F D hChild
      rcases recursive_inversion_from_finish_only F D hYFinish hyz with
        ⟨secondChild, hSecond, hz⟩
      have hSecond' :
          RecursiveInversion F D childInverse secondChild := by
        simpa only [recursive_end_start F D childInverse] using hSecond
      have hSecondEq : secondChild = F.finish x :=
        ih hSecond'
      calc
        z = D.startForm secondChild := hz
        _ = D.startForm (F.finish x) := congrArg D.startForm hSecondEq
        _ = x :=
          (recursive_start_form_canonical F a1 E D gx hStart).symm
  | @finish x childInverse hFinish hChild ih =>
      have hYStart : StartOnly F (D.startForm childInverse) :=
        recursive_start_form_pattern F a1 E D childInverse
      have gx : Grounded F x := by
        apply Grounded.node
        · intro _
          exact recursive_inversion_source_grounded F D hChild
        · intro hNot
          exact False.elim (hNot hFinish.2)
      rcases recursive_inversion_from_start_only F D hYStart hyz with
        ⟨secondChild, hSecond, hz⟩
      have hSecond' :
          RecursiveInversion F D childInverse secondChild := by
        simpa only [recursive_start_finish F D childInverse] using hSecond
      have hSecondEq : secondChild = F.start x :=
        ih hSecond'
      calc
        z = D.endForm secondChild := hz
        _ = D.endForm (F.start x) := congrArg D.endForm hSecondEq
        _ = x :=
          (recursive_end_form_canonical F a1 E D gx hFinish).symm
  | @pair x inverseFinish inverseStart hPair hFinishInv hStartInv ihFinish ihStart =>
      rcases INV_01_recursive_pole_reversal F D hyz with
        ⟨secondFinish, secondStart, hSecondFinish, hSecondStart, hzForm⟩
      have hSecondFinish' :
          RecursiveInversion F D inverseStart secondFinish := by
        simpa only [F.form_finish] using hSecondFinish
      have hSecondStart' :
          RecursiveInversion F D inverseFinish secondStart := by
        simpa only [F.form_start] using hSecondStart
      have hFinishEq : secondFinish = F.start x :=
        ihStart hSecondFinish'
      have hStartEq : secondStart = F.finish x :=
        ihFinish hSecondStart'
      have gx : Grounded F x := by
        apply Grounded.node
        · intro _
          exact recursive_inversion_source_grounded F D hStartInv
        · intro _
          exact recursive_inversion_source_grounded F D hFinishInv
      have gStart : Grounded F (F.start x) :=
        grounded_start_of_nonself F gx hPair.1
      have gFinish : Grounded F (F.finish x) :=
        grounded_finish_of_nonself F gx hPair.2
      have gForm : Grounded F (F.form (F.start x) (F.finish x)) :=
        recursive_pair_grounded F gStart gFinish
      calc
        z = F.form secondFinish secondStart := hzForm
        _ = F.form (F.start x) (F.finish x) := by
          rw [hFinishEq, hStartEq]
        _ = x :=
          (FND_13_identity_by_poles F N gForm gx).2 ⟨
            F.form_start (F.start x) (F.finish x),
            F.form_finish (F.start x) (F.finish x)
          ⟩

/--
Function-level INV-02 witness without choosing a host function: INV-01
totality produces the first and second graph images, and the relational
involution theorem identifies the second image with the original Link.
-/
theorem INV_02_unique_total_involution
    (F : Foundation)
    (a1 : A1RecursiveSeparation F)
    (N : F2F3GroundedNormalization F)
    (E : F2F3OneSidedExistence F)
    (D : RecursiveInversionDomain F E)
    {x : F.Link}
    (gx : Grounded F x) :
    ∃ y z : F.Link,
      RecursiveInversion F D x y ∧
      RecursiveInversion F D y z ∧
      z = x := by
  rcases INV_01_recursive_inversion_total F a1 E D gx with
    ⟨y, hxy⟩
  have gy : Grounded F y :=
    recursive_inversion_image_grounded F D hxy
  rcases INV_01_recursive_inversion_total F a1 E D gy with
    ⟨z, hyz⟩
  exact ⟨
    y,
    z,
    hxy,
    hyz,
    INV_02_recursive_inversion_involutive F a1 N E D hxy hyz
  ⟩


/--
INV-03: ROOT is a fixed point of the existing INV-01 structural graph, and
functionality makes that image unique.
-/
theorem INV_03_root_fixed
    (F : Foundation)
    {E : F2F3OneSidedExistence F}
    (D : RecursiveInversionDomain F E)
    {y : F.Link}
    (h : RecursiveInversion F D F.R y) :
    y = F.R := by
  exact recursive_inversion_functional F D h
    (RecursiveInversion.root (F := F) (D := D))

/--
INV-04, START side: a proper START source is sent to a proper END image, and
the two Links cannot be identified because the one-sided predicates are
disjoint.
-/
theorem INV_04_start_to_finish
    (F : Foundation)
    (a1 : A1RecursiveSeparation F)
    (E : F2F3OneSidedExistence F)
    (D : RecursiveInversionDomain F E)
    {x y : F.Link}
    (hStart : StartOnly F x)
    (hxy : RecursiveInversion F D x y) :
    FinishOnly F y ∧ x ≠ y := by
  rcases recursive_inversion_from_start_only F D hStart hxy with
    ⟨childInverse, _hChild, hy⟩
  have hFinishImage :
      FinishOnly F (D.endForm childInverse) :=
    recursive_end_form_pattern F a1 E D childInverse
  subst y
  refine ⟨hFinishImage, ?_⟩
  intro hEq
  have hFinishX : FinishOnly F x := by
    rw [hEq]
    exact hFinishImage
  exact recursive_start_finish_disjoint F hStart hFinishX

/--
INV-04, END side: a proper END source is sent to a proper START image, again
without identifying the two one-sided classes.
-/
theorem INV_04_finish_to_start
    (F : Foundation)
    (a1 : A1RecursiveSeparation F)
    (E : F2F3OneSidedExistence F)
    (D : RecursiveInversionDomain F E)
    {x y : F.Link}
    (hFinish : FinishOnly F x)
    (hxy : RecursiveInversion F D x y) :
    StartOnly F y ∧ x ≠ y := by
  rcases recursive_inversion_from_finish_only F D hFinish hxy with
    ⟨childInverse, _hChild, hy⟩
  have hStartImage :
      StartOnly F (D.startForm childInverse) :=
    recursive_start_form_pattern F a1 E D childInverse
  subst y
  refine ⟨hStartImage, ?_⟩
  intro hEq
  have hStartX : StartOnly F x := by
    rw [hEq]
    exact hStartImage
  exact recursive_start_finish_disjoint F hStartX hFinish

/--
INV-05: a PAIR source remains PAIR under structural inversion and its poles
are recursively exchanged.

The non-collapse argument uses INV-02 only as an already-derived theorem of the
same INV-01 assumptions: if the image collapsed to ROOT/START/END, inverting it
again would force the original PAIR into the corresponding disjoint class.
No new domain field or pair-preservation axiom is introduced.
-/
theorem INV_05_pair_preserved_and_reversed
    (F : Foundation)
    (a1 : A1RecursiveSeparation F)
    (N : F2F3GroundedNormalization F)
    (E : F2F3OneSidedExistence F)
    (D : RecursiveInversionDomain F E)
    {x y : F.Link}
    (hPairX : PairLocal F x)
    (hxy : RecursiveInversion F D x y) :
    PairLocal F y ∧
    ∃ inverseFinish inverseStart : F.Link,
      RecursiveInversion F D (F.finish x) inverseFinish ∧
      RecursiveInversion F D (F.start x) inverseStart ∧
      y = F.form inverseFinish inverseStart := by
  have gy : Grounded F y :=
    recursive_inversion_image_grounded F D hxy
  rcases INV_01_recursive_inversion_total F a1 E D gy with
    ⟨z, hyz⟩
  have hzx : z = x :=
    INV_02_recursive_inversion_involutive F a1 N E D hxy hyz
  have decision := D.decide gy
  have partition := FND_01_local_partition F a1 decision
  have hPairY : PairLocal F y := by
    rcases partition.1 with hFull | hStart | hFinish | hPair
    · have hyRoot : y = F.R :=
        FND_02_unique_root F a1 hFull
      have hyzRoot : RecursiveInversion F D F.R z := by
        rw [← hyRoot]
        exact hyz
      have hzRoot : z = F.R :=
        recursive_inversion_functional F D hyzRoot
          (RecursiveInversion.root (F := F) (D := D))
      have hxRoot : x = F.R := by
        calc
          x = z := hzx.symm
          _ = F.R := hzRoot
      have hFullX : FullSelf F x := by
        rw [hxRoot]
        exact root_full_self F
      exact False.elim
        (recursive_full_pair_disjoint F hFullX hPairX)
    · have hzFinish : FinishOnly F z :=
        (INV_04_start_to_finish F a1 E D hStart hyz).1
      have hFinishX : FinishOnly F x := by
        rw [← hzx]
        exact hzFinish
      exact False.elim
        (recursive_finish_pair_disjoint F hFinishX hPairX)
    · have hzStart : StartOnly F z :=
        (INV_04_finish_to_start F a1 E D hFinish hyz).1
      have hStartX : StartOnly F x := by
        rw [← hzx]
        exact hzStart
      exact False.elim
        (recursive_start_pair_disjoint F hStartX hPairX)
    · exact hPair
  exact ⟨
    hPairY,
    INV_01_recursive_pole_reversal F D hxy
  ⟩


/--
The mirror ordered pair C⟼O is an ordinary PAIR representative as well.
This is derived from the same two proper one-sided F2/F3 witnesses; U is not
introduced as a primitive or a fifth self-incidence case.
-/
theorem f2f3_reverse_pair_pattern
    (F : Foundation)
    (E : F2F3OneSidedExistence F) :
    PairLocal F (F.form E.finishRoot E.startRoot) := by
  constructor
  · intro hSelf
    have hFinishRootIsPair :
        E.finishRoot = F.form E.finishRoot E.startRoot := by
      calc
        E.finishRoot =
            F.start (F.form E.finishRoot E.startRoot) :=
          (F.form_start E.finishRoot E.startRoot).symm
        _ = F.form E.finishRoot E.startRoot := hSelf
    have hEq := congrArg F.start hFinishRootIsPair
    apply E.finishRootNeRoot
    simpa only [
      f2f3_finish_root_start F E,
      F.form_start E.finishRoot E.startRoot
    ] using hEq.symm
  · intro hSelf
    have hStartRootIsPair :
        E.startRoot = F.form E.finishRoot E.startRoot := by
      calc
        E.startRoot =
            F.finish (F.form E.finishRoot E.startRoot) :=
          (F.form_finish E.finishRoot E.startRoot).symm
        _ = F.form E.finishRoot E.startRoot := hSelf
    have hEq := congrArg F.finish hStartRootIsPair
    apply E.startRootNeRoot
    simpa only [
      f2f3_start_root_finish F E,
      F.form_finish E.finishRoot E.startRoot
    ] using hEq.symm

/--
FND-04 — U = C ⟼ O is derived by the same Link-forming primitive.

The existing reverse-pair lemma already proves this ordering is PairLocal.
The witness is therefore incompatible with the other three local
self-incidence patterns.  Nothing here introduces a fifth recursive alphabet
symbol, constructor, opcode, or ontology primitive.
-/
theorem FND_04_u_is_ordinary_pair
    (F : Foundation)
    (E : F2F3OneSidedExistence F)
    {O C : F.Link}
    (names : ContextOneSidedNames F E O C) :
    ∃ U : F.Link,
      U = F.form C O ∧
      PairLocal F U ∧
      ¬ FullSelf F U ∧
      ¬ StartOnly F U ∧
      ¬ FinishOnly F U := by
  rcases names with ⟨hO, hC⟩
  subst O
  subst C
  let U := F.form E.finishRoot E.startRoot
  have hPair : PairLocal F U :=
    f2f3_reverse_pair_pattern F E
  refine ⟨U, rfl, hPair, ?_, ?_, ?_⟩
  · intro hFull
    exact hPair.1 hFull.1
  · intro hStart
    exact hPair.1 hStart.1
  · intro hFinish
    exact hPair.2 hFinish.2

/--
INV-06 root-basis calculation under one chosen orientation.

O and C are only the two F2/F3 one-sided representatives supplied by the
chosen orientation; L=O⟼C and U=C⟼O are ordinary PAIR-derived Links.  The
theorem therefore records a representative calculation, not a Foundation-
global choice of which one-sided class must be called START.
-/
theorem INV_06_root_basis
    (F : Foundation)
    (a1 : A1RecursiveSeparation F)
    (N : F2F3GroundedNormalization F)
    (E : F2F3OneSidedExistence F)
    (D : RecursiveInversionDomain F E) :
    let O := E.startRoot
    let C := E.finishRoot
    let L := F.form O C
    let U := F.form C O
    RecursiveInversion F D F.R F.R ∧
    RecursiveInversion F D O C ∧
    RecursiveInversion F D C O ∧
    RecursiveInversion F D L L ∧
    RecursiveInversion F D U U := by
  dsimp
  have hR : RecursiveInversion F D F.R F.R :=
    RecursiveInversion.root (F := F) (D := D)
  have hO : RecursiveInversion F D E.startRoot E.finishRoot := by
    have hChild : RecursiveInversion F D (F.finish E.startRoot) F.R := by
      simpa only [f2f3_start_root_finish F E] using hR
    have h :=
      RecursiveInversion.start
        (D := D)
        (f2f3_start_root_pattern F E)
        hChild
    simpa only [D.endRootCompat] using h
  have hC : RecursiveInversion F D E.finishRoot E.startRoot := by
    have hChild : RecursiveInversion F D (F.start E.finishRoot) F.R := by
      simpa only [f2f3_finish_root_start F E] using hR
    have h :=
      RecursiveInversion.finish
        (D := D)
        (f2f3_finish_root_pattern F E)
        hChild
    simpa only [D.startRootCompat] using h
  have hL :
      RecursiveInversion F D
        (F.form E.startRoot E.finishRoot)
        (F.form E.startRoot E.finishRoot) := by
    have hFinish :
        RecursiveInversion F D
          (F.finish (F.form E.startRoot E.finishRoot))
          E.startRoot := by
      simpa only [F.form_finish] using hC
    have hStart :
        RecursiveInversion F D
          (F.start (F.form E.startRoot E.finishRoot))
          E.finishRoot := by
      simpa only [F.form_start] using hO
    exact RecursiveInversion.pair
      (f2f3_pair_pattern F E)
      hFinish
      hStart
  have hU :
      RecursiveInversion F D
        (F.form E.finishRoot E.startRoot)
        (F.form E.finishRoot E.startRoot) := by
    have hFinish :
        RecursiveInversion F D
          (F.finish (F.form E.finishRoot E.startRoot))
          E.finishRoot := by
      simpa only [F.form_finish] using hO
    have hStart :
        RecursiveInversion F D
          (F.start (F.form E.finishRoot E.startRoot))
          E.startRoot := by
      simpa only [F.form_start] using hC
    exact RecursiveInversion.pair
      (f2f3_reverse_pair_pattern F E)
      hFinish
      hStart

  -- Cross-check the named P0 support boundaries against the direct graph
  -- calculation above.  These are structural-class audits, not hidden
  -- premises for constructing hR/hO/hC/hL/hU.
  have _hRootAudit : F.R = F.R :=
    INV_03_root_fixed F D hR
  have _hFinishAudit : FinishOnly F E.finishRoot :=
    (INV_04_start_to_finish
      F a1 E D
      (f2f3_start_root_pattern F E)
      hO).1
  have _hStartAudit : StartOnly F E.startRoot :=
    (INV_04_finish_to_start
      F a1 E D
      (f2f3_finish_root_pattern F E)
      hC).1
  have _hLPairAudit : PairLocal F (F.form E.startRoot E.finishRoot) :=
    (INV_05_pair_preserved_and_reversed
      F a1 N E D
      (f2f3_pair_pattern F E)
      hL).1
  have _hUPairAudit : PairLocal F (F.form E.finishRoot E.startRoot) :=
    (INV_05_pair_preserved_and_reversed
      F a1 N E D
      (f2f3_reverse_pair_pattern F E)
      hU).1

  exact ⟨hR, hO, hC, hL, hU⟩


/--
INV-07 objective chirality capstone.

For any admitted structural inversion edge x ~J~ y:
- a proper START source becomes proper END, remains distinct from its image, and
  the image cannot simultaneously be proper START;
- symmetrically, a proper END source becomes proper START;
- any second inversion edge returns to x by INV-02;
- PAIR stays PAIR by INV-05.

The theorem preserves the objective distinction of the structural classes.  It
does not select a Foundation-global absolute orientation and introduces no
observer-dependent semantic primitive.
-/
theorem INV_07_objective_chirality
    (F : Foundation)
    (a1 : A1RecursiveSeparation F)
    (N : F2F3GroundedNormalization F)
    (E : F2F3OneSidedExistence F)
    (D : RecursiveInversionDomain F E)
    (x y : F.Link)
    (hxy : RecursiveInversion F D x y) :
    (StartOnly F x ->
      FinishOnly F y ∧
      x ≠ y ∧
      ¬ StartOnly F y ∧
      ∀ z : F.Link, RecursiveInversion F D y z -> z = x) ∧
    (FinishOnly F x ->
      StartOnly F y ∧
      x ≠ y ∧
      ¬ FinishOnly F y ∧
      ∀ z : F.Link, RecursiveInversion F D y z -> z = x) ∧
    (PairLocal F x -> PairLocal F y) := by
  constructor
  · intro hStart
    have hSwap :=
      INV_04_start_to_finish F a1 E D hStart hxy
    have hNotStartY : ¬ StartOnly F y := by
      intro hStartY
      exact recursive_start_finish_disjoint F hStartY hSwap.1
    have hRoundTrip :
        ∀ z : F.Link, RecursiveInversion F D y z -> z = x := by
      intro z hyz
      exact INV_02_recursive_inversion_involutive
        F a1 N E D hxy hyz
    exact ⟨hSwap.1, hSwap.2, hNotStartY, hRoundTrip⟩
  · constructor
    · intro hFinish
      have hSwap :=
        INV_04_finish_to_start F a1 E D hFinish hxy
      have hNotFinishY : ¬ FinishOnly F y := by
        intro hFinishY
        exact recursive_start_finish_disjoint F hSwap.1 hFinishY
      have hRoundTrip :
          ∀ z : F.Link, RecursiveInversion F D y z -> z = x := by
        intro z hyz
        exact INV_02_recursive_inversion_involutive
          F a1 N E D hxy hyz
      exact ⟨hSwap.1, hSwap.2, hNotFinishY, hRoundTrip⟩
    · intro hPair
      exact
        (INV_05_pair_preserved_and_reversed
          F a1 N E D hPair hxy).1


/--
CTX-03 relational support vocabulary.

These are propositions over existing Links, not a Frame/Gauge ontology.  There
is no Bool/enum whose value is semantic orientation authority.
-/
def ProperOneSided (F : Foundation) (x : F.Link) : Prop :=
  StartOnly F x ∨ FinishOnly F x

def SameChiralClass (F : Foundation) (x y : F.Link) : Prop :=
  (StartOnly F x ∧ StartOnly F y) ∨
  (FinishOnly F x ∧ FinishOnly F y)

def OppositeChiralClass (F : Foundation) (x y : F.Link) : Prop :=
  (StartOnly F x ∧ FinishOnly F y) ∨
  (FinishOnly F x ∧ StartOnly F y)

/--
EXTERNAL THEORY PROJECTION: elementary group theory (Z2)

The Z2 transport table is stated relationally: Same acts as Id and Opposite
acts as J.  No two-valued semantic carrier is introduced, and the group
description is external proof vocabulary only.
-/
def RelativeZ2Law (F : Foundation) : Prop :=
  (∀ x : F.Link, ProperOneSided F x → SameChiralClass F x x) ∧
  (∀ x y : F.Link, SameChiralClass F x y → SameChiralClass F y x) ∧
  (∀ x y : F.Link, OppositeChiralClass F x y → OppositeChiralClass F y x) ∧
  (∀ x y : F.Link,
    ProperOneSided F x →
    ProperOneSided F y →
    SameChiralClass F x y ∨ OppositeChiralClass F x y) ∧
  (∀ x y : F.Link,
    SameChiralClass F x y →
    OppositeChiralClass F x y →
    False) ∧
  (∀ a b c : F.Link,
    SameChiralClass F a b →
    SameChiralClass F b c →
    SameChiralClass F a c) ∧
  (∀ a b c : F.Link,
    SameChiralClass F a b →
    OppositeChiralClass F b c →
    OppositeChiralClass F a c) ∧
  (∀ a b c : F.Link,
    OppositeChiralClass F a b →
    SameChiralClass F b c →
    OppositeChiralClass F a c) ∧
  (∀ a b c : F.Link,
    OppositeChiralClass F a b →
    OppositeChiralClass F b c →
    SameChiralClass F a c)

def InversionIsMirrorTransport
    (F : Foundation)
    {E : F2F3OneSidedExistence F}
    (D : RecursiveInversionDomain F E) : Prop :=
  ∀ x y : F.Link,
    RecursiveInversion F D x y →
    ProperOneSided F x →
    ProperOneSided F y ∧ OppositeChiralClass F x y

theorem ctx03_same_refl
    (F : Foundation)
    {x : F.Link}
    (hx : ProperOneSided F x) :
    SameChiralClass F x x := by
  rcases hx with h | h
  · exact Or.inl ⟨h, h⟩
  · exact Or.inr ⟨h, h⟩

theorem ctx03_same_symm
    (F : Foundation)
    {x y : F.Link}
    (h : SameChiralClass F x y) :
    SameChiralClass F y x := by
  rcases h with h | h
  · exact Or.inl ⟨h.2, h.1⟩
  · exact Or.inr ⟨h.2, h.1⟩

theorem ctx03_opposite_symm
    (F : Foundation)
    {x y : F.Link}
    (h : OppositeChiralClass F x y) :
    OppositeChiralClass F y x := by
  rcases h with h | h
  · exact Or.inr ⟨h.2, h.1⟩
  · exact Or.inl ⟨h.2, h.1⟩

theorem ctx03_transport_total
    (F : Foundation)
    {x y : F.Link}
    (hx : ProperOneSided F x)
    (hy : ProperOneSided F y) :
    SameChiralClass F x y ∨ OppositeChiralClass F x y := by
  rcases hx with hx | hx <;> rcases hy with hy | hy
  · exact Or.inl (Or.inl ⟨hx, hy⟩)
  · exact Or.inr (Or.inl ⟨hx, hy⟩)
  · exact Or.inr (Or.inr ⟨hx, hy⟩)
  · exact Or.inl (Or.inr ⟨hx, hy⟩)

theorem ctx03_transport_disjoint
    (F : Foundation)
    {x y : F.Link}
    (hs : SameChiralClass F x y)
    (ho : OppositeChiralClass F x y) :
    False := by
  rcases hs with hs | hs <;> rcases ho with ho | ho
  · exact recursive_start_finish_disjoint F hs.2 ho.2
  · exact recursive_start_finish_disjoint F hs.1 ho.1
  · exact recursive_start_finish_disjoint F ho.1 hs.1
  · exact recursive_start_finish_disjoint F ho.2 hs.2

theorem ctx03_same_same
    (F : Foundation)
    {a b c : F.Link}
    (hab : SameChiralClass F a b)
    (hbc : SameChiralClass F b c) :
    SameChiralClass F a c := by
  rcases hab with hab | hab <;> rcases hbc with hbc | hbc
  · exact Or.inl ⟨hab.1, hbc.2⟩
  · exact False.elim (recursive_start_finish_disjoint F hab.2 hbc.1)
  · exact False.elim (recursive_start_finish_disjoint F hbc.1 hab.2)
  · exact Or.inr ⟨hab.1, hbc.2⟩

theorem ctx03_same_opposite
    (F : Foundation)
    {a b c : F.Link}
    (hab : SameChiralClass F a b)
    (hbc : OppositeChiralClass F b c) :
    OppositeChiralClass F a c := by
  rcases hab with hab | hab <;> rcases hbc with hbc | hbc
  · exact Or.inl ⟨hab.1, hbc.2⟩
  · exact False.elim (recursive_start_finish_disjoint F hab.2 hbc.1)
  · exact False.elim (recursive_start_finish_disjoint F hbc.1 hab.2)
  · exact Or.inr ⟨hab.1, hbc.2⟩

theorem ctx03_opposite_same
    (F : Foundation)
    {a b c : F.Link}
    (hab : OppositeChiralClass F a b)
    (hbc : SameChiralClass F b c) :
    OppositeChiralClass F a c := by
  rcases hab with hab | hab <;> rcases hbc with hbc | hbc
  · exact False.elim (recursive_start_finish_disjoint F hbc.1 hab.2)
  · exact Or.inl ⟨hab.1, hbc.2⟩
  · exact Or.inr ⟨hab.1, hbc.2⟩
  · exact False.elim (recursive_start_finish_disjoint F hab.2 hbc.1)

theorem ctx03_opposite_opposite
    (F : Foundation)
    {a b c : F.Link}
    (hab : OppositeChiralClass F a b)
    (hbc : OppositeChiralClass F b c) :
    SameChiralClass F a c := by
  rcases hab with hab | hab <;> rcases hbc with hbc | hbc
  · exact False.elim (recursive_start_finish_disjoint F hbc.1 hab.2)
  · exact Or.inl ⟨hab.1, hbc.2⟩
  · exact Or.inr ⟨hab.1, hbc.2⟩
  · exact False.elim (recursive_start_finish_disjoint F hab.2 hbc.1)

theorem ctx03_relative_z2
    (F : Foundation) :
    RelativeZ2Law F := by
  exact ⟨
    fun _ h => ctx03_same_refl F h,
    fun _ _ h => ctx03_same_symm F h,
    fun _ _ h => ctx03_opposite_symm F h,
    fun _ _ hx hy => ctx03_transport_total F hx hy,
    fun _ _ hs ho => ctx03_transport_disjoint F hs ho,
    fun _ _ _ hab hbc => ctx03_same_same F hab hbc,
    fun _ _ _ hab hbc => ctx03_same_opposite F hab hbc,
    fun _ _ _ hab hbc => ctx03_opposite_same F hab hbc,
    fun _ _ _ hab hbc => ctx03_opposite_opposite F hab hbc
  ⟩

theorem ctx03_inversion_is_mirror_transport
    (F : Foundation)
    (a1 : A1RecursiveSeparation F)
    (N : F2F3GroundedNormalization F)
    (E : F2F3OneSidedExistence F)
    (D : RecursiveInversionDomain F E) :
    InversionIsMirrorTransport F D := by
  intro x y hxy hx
  rcases hx with hStart | hFinish
  · have h := INV_07_objective_chirality F a1 N E D x y hxy
    have hy := (h.1 hStart).1
    exact ⟨Or.inr hy, Or.inl ⟨hStart, hy⟩⟩
  · have h := INV_07_objective_chirality F a1 N E D x y hxy
    have hy := (h.2.1 hFinish).1
    exact ⟨Or.inl hy, Or.inr ⟨hFinish, hy⟩⟩

/--
Supporting CTX-03 result: relative orientation transport is the Z2
same/opposite relation on Link-native one-sided structural classes, and J is
the mirror transport on that carrier.

The result introduces no semantic Frame/Gauge datatype; Lean's propositions
and disjunctions are external projection machinery only.
-/
theorem CTX_03_relational_z2_support
    (F : Foundation)
    (a1 : A1RecursiveSeparation F)
    (N : F2F3GroundedNormalization F)
    (E : F2F3OneSidedExistence F)
    (D : RecursiveInversionDomain F E) :
    RelativeZ2Law F ∧ InversionIsMirrorTransport F D := by
  exact ⟨
    ctx03_relative_z2 F,
    ctx03_inversion_is_mirror_transport F a1 N E D
  ⟩


/--
CTX-03 Link-native Context orientation carrier.

A Context body K has two canonical one-sided markers supplied by the existing
recursive F2/F3 forms.  This proposition is external proof vocabulary only;
it does not introduce a native MTS frame datatype or absolute START/END names.
-/
def ContextOrientationMarker
    (F : Foundation)
    {E : F2F3OneSidedExistence F}
    (D : RecursiveInversionDomain F E)
    (body marker : F.Link) : Prop :=
  marker = D.startForm body ∨
  marker = D.endForm body

/--
After a Context selects one marker, START_K means "same chiral class as the
selected marker".  The role name is Context-local.
-/
def ContextLocalStartRole
    (F : Foundation)
    (selected candidate : F.Link) : Prop :=
  SameChiralClass F selected candidate

/--
After selection, END_K means "opposite chiral class to the selected marker".
-/
def ContextLocalEndRole
    (F : Foundation)
    (selected candidate : F.Link) : Prop :=
  OppositeChiralClass F selected candidate

theorem context_orientation_markers_distinct
    (F : Foundation)
    (a1 : A1RecursiveSeparation F)
    (E : F2F3OneSidedExistence F)
    (D : RecursiveInversionDomain F E)
    (body : F.Link) :
    D.startForm body ≠ D.endForm body := by
  intro hEq
  have hStart := recursive_start_form_pattern F a1 E D body
  have hFinish := recursive_end_form_pattern F a1 E D body
  have hFinishAtStart : FinishOnly F (D.startForm body) := by
    rw [hEq]
    exact hFinish
  exact recursive_start_finish_disjoint F hStart hFinishAtStart

theorem context_orientation_marker_one_sided
    (F : Foundation)
    (a1 : A1RecursiveSeparation F)
    (E : F2F3OneSidedExistence F)
    (D : RecursiveInversionDomain F E)
    {body marker : F.Link}
    (hMarker : ContextOrientationMarker F D body marker) :
    ProperOneSided F marker := by
  rcases hMarker with hStart | hFinish
  · subst marker
    exact Or.inl (recursive_start_form_pattern F a1 E D body)
  · subst marker
    exact Or.inr (recursive_end_form_pattern F a1 E D body)

/--
CTX-03 Context selection induces local START_K / END_K roles from the
Link-native marker.  No Foundation-global orientation is selected.
-/
theorem CTX_03_context_selection_induces_local_roles
    (F : Foundation)
    (a1 : A1RecursiveSeparation F)
    (E : F2F3OneSidedExistence F)
    (D : RecursiveInversionDomain F E)
    {body selected : F.Link}
    (hSelected : ContextOrientationMarker F D body selected) :
    ∃ localStart localEnd : F.Link,
      ContextOrientationMarker F D body localStart ∧
      ContextOrientationMarker F D body localEnd ∧
      ContextLocalStartRole F selected localStart ∧
      ContextLocalEndRole F selected localEnd ∧
      localStart ≠ localEnd := by
  rcases hSelected with hSelectedStart | hSelectedEnd
  · subst selected
    let localStart := D.startForm body
    let localEnd := D.endForm body
    have hStart := recursive_start_form_pattern F a1 E D body
    have hEnd := recursive_end_form_pattern F a1 E D body
    refine ⟨localStart, localEnd, ?_, ?_, ?_, ?_, ?_⟩
    · exact Or.inl rfl
    · exact Or.inr rfl
    · exact Or.inl ⟨hStart, hStart⟩
    · exact Or.inl ⟨hStart, hEnd⟩
    · exact context_orientation_markers_distinct F a1 E D body
  · subst selected
    let localStart := D.endForm body
    let localEnd := D.startForm body
    have hStart := recursive_start_form_pattern F a1 E D body
    have hEnd := recursive_end_form_pattern F a1 E D body
    refine ⟨localStart, localEnd, ?_, ?_, ?_, ?_, ?_⟩
    · exact Or.inr rfl
    · exact Or.inl rfl
    · exact Or.inr ⟨hEnd, hEnd⟩
    · exact Or.inr ⟨hEnd, hStart⟩
    · intro hEq
      exact context_orientation_markers_distinct F a1 E D body hEq.symm

/--
Objective chirality exists before any Context selection.  The witness order in
this external theorem is technical only; it does not define an absolute MTS
orientation.
-/
theorem CTX_03_objective_chiral_orbit_before_context
    (F : Foundation)
    (a1 : A1RecursiveSeparation F)
    (N : F2F3GroundedNormalization F)
    (E : F2F3OneSidedExistence F)
    (D : RecursiveInversionDomain F E) :
    ∃ w jw : F.Link,
      RecursiveInversion F D w jw ∧
      RecursiveInversion F D jw w ∧
      w ≠ jw ∧
      OppositeChiralClass F w jw ∧
      (∀ z : F.Link, RecursiveInversion F D jw z -> z = w) := by
  have hR : RecursiveInversion F D F.R F.R :=
    RecursiveInversion.root (F := F) (D := D)
  have hOC : RecursiveInversion F D E.startRoot E.finishRoot := by
    have hChild : RecursiveInversion F D (F.finish E.startRoot) F.R := by
      simpa only [f2f3_start_root_finish F E] using hR
    have h :=
      RecursiveInversion.start
        (D := D)
        (f2f3_start_root_pattern F E)
        hChild
    simpa only [D.endRootCompat] using h
  have hCO : RecursiveInversion F D E.finishRoot E.startRoot := by
    have hChild : RecursiveInversion F D (F.start E.finishRoot) F.R := by
      simpa only [f2f3_finish_root_start F E] using hR
    have h :=
      RecursiveInversion.finish
        (D := D)
        (f2f3_finish_root_pattern F E)
        hChild
    simpa only [D.startRootCompat] using h
  have hMirror :=
    ctx03_inversion_is_mirror_transport F a1 N E D
      E.startRoot E.finishRoot hOC
      (Or.inl (f2f3_start_root_pattern F E))
  refine ⟨E.startRoot, E.finishRoot, hOC, hCO, ?_, hMirror.2, ?_⟩
  · intro hEq
    have hStart := f2f3_start_root_pattern F E
    have hFinish : FinishOnly F E.startRoot := by
      rw [hEq]
      exact f2f3_finish_root_pattern F E
    exact recursive_start_finish_disjoint F hStart hFinish
  · intro z hz
    exact INV_02_recursive_inversion_involutive
      F a1 N E D hOC hz

/--
Simultaneous global inversion preserves the relative Same/Opposite relation of
two one-sided Context markers.
-/
theorem CTX_03_simultaneous_inversion_covariance
    (F : Foundation)
    (a1 : A1RecursiveSeparation F)
    (N : F2F3GroundedNormalization F)
    (E : F2F3OneSidedExistence F)
    (D : RecursiveInversionDomain F E)
    {a b ja jb : F.Link}
    (hJa : RecursiveInversion F D a ja)
    (hJb : RecursiveInversion F D b jb) :
    (SameChiralClass F a b ->
      SameChiralClass F ja jb) ∧
    (OppositeChiralClass F a b ->
      OppositeChiralClass F ja jb) := by
  have mirror := ctx03_inversion_is_mirror_transport F a1 N E D
  constructor
  · intro hSame
    have haProper : ProperOneSided F a := by
      rcases hSame with h | h
      · exact Or.inl h.1
      · exact Or.inr h.1
    have hbProper : ProperOneSided F b := by
      rcases hSame with h | h
      · exact Or.inl h.2
      · exact Or.inr h.2
    have hMa := mirror a ja hJa haProper
    have hMb := mirror b jb hJb hbProper
    have hJaA := ctx03_opposite_symm F hMa.2
    have hJaB := ctx03_opposite_same F hJaA hSame
    exact ctx03_opposite_opposite F hJaB hMb.2
  · intro hOpposite
    have haProper : ProperOneSided F a := by
      rcases hOpposite with h | h
      · exact Or.inl h.1
      · exact Or.inr h.1
    have hbProper : ProperOneSided F b := by
      rcases hOpposite with h | h
      · exact Or.inr h.2
      · exact Or.inl h.2
    have hMa := mirror a ja hJa haProper
    have hMb := mirror b jb hJb hbProper
    have hJaA := ctx03_opposite_symm F hMa.2
    have hJaB := ctx03_opposite_opposite F hJaA hOpposite
    exact ctx03_same_opposite F hJaB hMb.2

/--
Accepted post-orientation direction witnesses, expressed only as existing
Links. These names are external proof aliases; before Context selection neither
one is a Foundation-global preferred orientation.
-/
def ContextInRWitness
    (F : Foundation)
    (E : F2F3OneSidedExistence F) : F.Link :=
  F.form E.finishRoot F.R

def ContextOutRWitness
    (F : Foundation)
    (E : F2F3OneSidedExistence F) : F.Link :=
  F.form F.R E.startRoot

/--
Relational bridge from a selected Link-native Context marker to chi(K).

If the selected marker is in the root START class, local END_K is the root
finish-self representative and chi(K)=C_K⟼R.  If the selected marker is in the
root END class, the semantic frame is mirrored and chi(K)=R⟼O_K in technical
coordinates.  No host orientation datatype value is semantic authority.
-/
def ContextChiWitness
    (F : Foundation)
    (E : F2F3OneSidedExistence F)
    (selected chi : F.Link) : Prop :=
  (SameChiralClass F selected E.startRoot ∧
    chi = ContextInRWitness F E) ∨
  (SameChiralClass F selected E.finishRoot ∧
    chi = ContextOutRWitness F E)

theorem ctx03_inr_pair_pattern
    (F : Foundation)
    (E : F2F3OneSidedExistence F) :
    PairLocal F (ContextInRWitness F E) := by
  constructor
  · intro hSelf
    have hEq :
        E.finishRoot = ContextInRWitness F E := by
      calc
        E.finishRoot =
            F.start (ContextInRWitness F E) := by
          unfold ContextInRWitness
          rw [F.form_start]
        _ = ContextInRWitness F E := hSelf
    have hFinish := congrArg F.finish hEq
    have hBad : E.finishRoot = F.R := by
      calc
        E.finishRoot = F.finish E.finishRoot :=
          (f2f3_finish_root_finish F E).symm
        _ = F.finish (ContextInRWitness F E) := hFinish
        _ = F.R := by
          unfold ContextInRWitness
          rw [F.form_finish]
    exact E.finishRootNeRoot hBad
  · intro hSelf
    have hEq :
        F.R = ContextInRWitness F E := by
      calc
        F.R =
            F.finish (ContextInRWitness F E) := by
          unfold ContextInRWitness
          rw [F.form_finish]
        _ = ContextInRWitness F E := hSelf
    have hStart := congrArg F.start hEq
    have hRootStart : F.start F.R = F.R := (root_full_self F).1
    have hRootEq : F.R = E.finishRoot := by
      calc
        F.R = F.start F.R := hRootStart.symm
        _ = F.start (ContextInRWitness F E) := hStart
        _ = E.finishRoot := by
          unfold ContextInRWitness
          rw [F.form_start]
    exact E.finishRootNeRoot hRootEq.symm

theorem ctx03_outr_pair_pattern
    (F : Foundation)
    (E : F2F3OneSidedExistence F) :
    PairLocal F (ContextOutRWitness F E) := by
  constructor
  · intro hSelf
    have hEq :
        F.R = ContextOutRWitness F E := by
      calc
        F.R =
            F.start (ContextOutRWitness F E) := by
          unfold ContextOutRWitness
          rw [F.form_start]
        _ = ContextOutRWitness F E := hSelf
    have hFinish := congrArg F.finish hEq
    have hRootFinish : F.finish F.R = F.R := (root_full_self F).2
    have hRootEq : F.R = E.startRoot := by
      calc
        F.R = F.finish F.R := hRootFinish.symm
        _ = F.finish (ContextOutRWitness F E) := hFinish
        _ = E.startRoot := by
          unfold ContextOutRWitness
          rw [F.form_finish]
    exact E.startRootNeRoot hRootEq.symm
  · intro hSelf
    have hEq :
        E.startRoot = ContextOutRWitness F E := by
      calc
        E.startRoot =
            F.finish (ContextOutRWitness F E) := by
          unfold ContextOutRWitness
          rw [F.form_finish]
        _ = ContextOutRWitness F E := hSelf
    have hStart := congrArg F.start hEq
    have hBad : E.startRoot = F.R := by
      calc
        E.startRoot = F.start E.startRoot :=
          (f2f3_start_root_start F E).symm
        _ = F.start (ContextOutRWitness F E) := hStart
        _ = F.R := by
          unfold ContextOutRWitness
          rw [F.form_start]
    exact E.startRootNeRoot hBad

theorem ctx03_direction_witnesses_distinct
    (F : Foundation)
    (E : F2F3OneSidedExistence F) :
    ContextInRWitness F E ≠ ContextOutRWitness F E := by
  intro hEq
  have hStart := congrArg F.start hEq
  apply E.finishRootNeRoot
  unfold ContextInRWitness ContextOutRWitness at hStart
  rw [F.form_start, F.form_start] at hStart
  exact hStart

/--
J exchanges the two accepted direction-witness Links.  This is a structural
statement over RecursiveInversion, not a host-side function definition.
-/
theorem CTX_03_direction_witness_inversion
    (F : Foundation)
    (E : F2F3OneSidedExistence F)
    (D : RecursiveInversionDomain F E) :
    RecursiveInversion F D
      (ContextInRWitness F E)
      (ContextOutRWitness F E) ∧
    RecursiveInversion F D
      (ContextOutRWitness F E)
      (ContextInRWitness F E) := by
  have hR : RecursiveInversion F D F.R F.R :=
    RecursiveInversion.root (F := F) (D := D)
  have hOC : RecursiveInversion F D E.startRoot E.finishRoot := by
    have hChild : RecursiveInversion F D (F.finish E.startRoot) F.R := by
      rw [f2f3_start_root_finish F E]
      exact hR
    have h :=
      RecursiveInversion.start
        (D := D)
        (f2f3_start_root_pattern F E)
        hChild
    rw [D.endRootCompat] at h
    exact h
  have hCO : RecursiveInversion F D E.finishRoot E.startRoot := by
    have hChild : RecursiveInversion F D (F.start E.finishRoot) F.R := by
      rw [f2f3_finish_root_start F E]
      exact hR
    have h :=
      RecursiveInversion.finish
        (D := D)
        (f2f3_finish_root_pattern F E)
        hChild
    rw [D.startRootCompat] at h
    exact h
  constructor
  · have hFinish :
        RecursiveInversion F D
          (F.finish (ContextInRWitness F E))
          F.R := by
      unfold ContextInRWitness
      rw [F.form_finish]
      exact hR
    have hStart :
        RecursiveInversion F D
          (F.start (ContextInRWitness F E))
          E.startRoot := by
      unfold ContextInRWitness
      rw [F.form_start]
      exact hCO
    exact
      RecursiveInversion.pair
        (D := D)
        (ctx03_inr_pair_pattern F E)
        hFinish
        hStart
  · have hFinish :
        RecursiveInversion F D
          (F.finish (ContextOutRWitness F E))
          E.finishRoot := by
      unfold ContextOutRWitness
      rw [F.form_finish]
      exact hOC
    have hStart :
        RecursiveInversion F D
          (F.start (ContextOutRWitness F E))
          F.R := by
      unfold ContextOutRWitness
      rw [F.form_start]
      exact hR
    exact
      RecursiveInversion.pair
        (D := D)
        (ctx03_outr_pair_pattern F E)
        hFinish
        hStart

/--
A Link-native Context marker selects exactly one chi(K).  The two branches are
the accepted InR_K / OutR_K representatives; uniqueness follows from the
one-sided chiral classes, not from a host orientation enum.
-/
theorem CTX_03_context_marker_selects_unique_chi
    (F : Foundation)
    (a1 : A1RecursiveSeparation F)
    (E : F2F3OneSidedExistence F)
    (D : RecursiveInversionDomain F E)
    {body selected : F.Link}
    (hSelected : ContextOrientationMarker F D body selected) :
    ∃ chi : F.Link,
      ContextChiWitness F E selected chi ∧
      ∀ other : F.Link,
        ContextChiWitness F E selected other →
        other = chi := by
  rcases hSelected with hSelectedStart | hSelectedEnd
  · subst selected
    have hSelectedPattern := recursive_start_form_pattern F a1 E D body
    have hSameStart :
        SameChiralClass F (D.startForm body) E.startRoot :=
      Or.inl ⟨hSelectedPattern, f2f3_start_root_pattern F E⟩
    have hOppFinish :
        OppositeChiralClass F (D.startForm body) E.finishRoot :=
      Or.inl ⟨hSelectedPattern, f2f3_finish_root_pattern F E⟩
    refine ⟨ContextInRWitness F E, Or.inl ⟨hSameStart, rfl⟩, ?_⟩
    intro other hOther
    rcases hOther with hIn | hOut
    · exact hIn.2
    · exact False.elim
        (ctx03_transport_disjoint F hOut.1 hOppFinish)
  · subst selected
    have hSelectedPattern := recursive_end_form_pattern F a1 E D body
    have hSameFinish :
        SameChiralClass F (D.endForm body) E.finishRoot :=
      Or.inr ⟨hSelectedPattern, f2f3_finish_root_pattern F E⟩
    have hOppStart :
        OppositeChiralClass F (D.endForm body) E.startRoot :=
      Or.inr ⟨hSelectedPattern, f2f3_start_root_pattern F E⟩
    refine ⟨ContextOutRWitness F E, Or.inr ⟨hSameFinish, rfl⟩, ?_⟩
    intro other hOther
    rcases hOther with hIn | hOut
    · exact False.elim
        (ctx03_transport_disjoint F hIn.1 hOppStart)
    · exact hOut.2

/--
Formal chi(K) bridge: every selected Context marker yields a unique direction
witness, and its structural J-image is the other accepted witness.  The image
is distinct from chi, which is the formal negative control against accepting
the same-polarity root witness as chi(K).
-/
theorem CTX_03_chi_direction_bridge
    (F : Foundation)
    (a1 : A1RecursiveSeparation F)
    (E : F2F3OneSidedExistence F)
    (D : RecursiveInversionDomain F E)
    {body selected : F.Link}
    (hSelected : ContextOrientationMarker F D body selected) :
    ∃ chi jchi : F.Link,
      ContextChiWitness F E selected chi ∧
      RecursiveInversion F D chi jchi ∧
      chi ≠ jchi ∧
      ((chi = ContextInRWitness F E ∧
        jchi = ContextOutRWitness F E) ∨
       (chi = ContextOutRWitness F E ∧
        jchi = ContextInRWitness F E)) := by
  rcases CTX_03_context_marker_selects_unique_chi
    F a1 E D hSelected with ⟨chi, hChi, _⟩
  have hDirections := CTX_03_direction_witness_inversion F E D
  rcases hChi with hIn | hOut
  · exact ⟨
      ContextInRWitness F E,
      ContextOutRWitness F E,
      Or.inl ⟨hIn.1, rfl⟩,
      hDirections.1,
      ctx03_direction_witnesses_distinct F E,
      Or.inl ⟨rfl, rfl⟩
    ⟩
  · exact ⟨
      ContextOutRWitness F E,
      ContextInRWitness F E,
      Or.inr ⟨hOut.1, rfl⟩,
      hDirections.2,
      (ctx03_direction_witnesses_distinct F E).symm,
      Or.inr ⟨rfl, rfl⟩
    ⟩


/--
Semantic Link construction relative to a selected Context marker.

The semantic pole order is expressed relationally rather than by a host frame:
START-class selection uses form(start,end); END-class selection uses the
mirrored technical carrier form(end,start).
-/
def ContextSemanticArrow
    (F : Foundation)
    (E : F2F3OneSidedExistence F)
    (selected semanticStart semanticEnd technicalLink : F.Link) : Prop :=
  (SameChiralClass F selected E.startRoot ∧
    technicalLink = F.form semanticStart semanticEnd) ∨
  (SameChiralClass F selected E.finishRoot ∧
    technicalLink = F.form semanticEnd semanticStart)

theorem ctx03_same_start_root_implies_start
    (F : Foundation)
    (E : F2F3OneSidedExistence F)
    {selected : F.Link}
    (h : SameChiralClass F selected E.startRoot) :
    StartOnly F selected := by
  rcases h with h | h
  · exact h.1
  · exact False.elim
      (recursive_start_finish_disjoint
        F
        (f2f3_start_root_pattern F E)
        h.2)

theorem ctx03_same_finish_root_implies_finish
    (F : Foundation)
    (E : F2F3OneSidedExistence F)
    {selected : F.Link}
    (h : SameChiralClass F selected E.finishRoot) :
    FinishOnly F selected := by
  rcases h with h | h
  · exact False.elim
      (recursive_start_finish_disjoint
        F
        h.2
        (f2f3_finish_root_pattern F E))
  · exact h.1

/--
One semantic arrow is covariant under simultaneous structural inversion.

This theorem is the key bridge from structural chirality to semantic
covariance: the source and target use opposite technical pole order, while the
semantic start/end roles are preserved.
-/
theorem CTX_03_semantic_arrow_covariant
    (F : Foundation)
    (a1 : A1RecursiveSeparation F)
    (N : F2F3GroundedNormalization F)
    (E : F2F3OneSidedExistence F)
    (D : RecursiveInversionDomain F E)
    {selected jselected
      semanticStart semanticEnd
      jStart jEnd
      technicalLink jTechnicalLink : F.Link}
    (hMarkerInv : RecursiveInversion F D selected jselected)
    (hStartInv : RecursiveInversion F D semanticStart jStart)
    (hEndInv : RecursiveInversion F D semanticEnd jEnd)
    (hLinkInv : RecursiveInversion F D technicalLink jTechnicalLink)
    (hArrow :
      ContextSemanticArrow
        F E selected semanticStart semanticEnd technicalLink) :
    ContextSemanticArrow
      F E jselected jStart jEnd jTechnicalLink := by
  rcases hArrow with hDirect | hMirror
  · have hSelectedStart :=
      ctx03_same_start_root_implies_start F E hDirect.1
    have hJSelectedFinish :=
      (INV_07_objective_chirality
        F a1 N E D selected jselected hMarkerInv).1 hSelectedStart |>.1
    have hTargetClass :
        SameChiralClass F jselected E.finishRoot :=
      Or.inr ⟨hJSelectedFinish, f2f3_finish_root_pattern F E⟩
    rcases INV_01_recursive_pole_reversal F D hLinkInv with
      ⟨inverseFinish, inverseStart, hFinishInv, hStartPoleInv, hRebuild⟩
    have hFinishInv' :
        RecursiveInversion F D semanticEnd inverseFinish := by
      simpa only [hDirect.2, F.form_finish] using hFinishInv
    have hStartInv' :
        RecursiveInversion F D semanticStart inverseStart := by
      simpa only [hDirect.2, F.form_start] using hStartPoleInv
    have hFinishEq :
        inverseFinish = jEnd :=
      recursive_inversion_functional F D hFinishInv' hEndInv
    have hStartEq :
        inverseStart = jStart :=
      recursive_inversion_functional F D hStartInv' hStartInv
    have hTargetLink :
        jTechnicalLink = F.form jEnd jStart := by
      calc
        jTechnicalLink = F.form inverseFinish inverseStart := hRebuild
        _ = F.form jEnd jStart := by rw [hFinishEq, hStartEq]
    exact Or.inr ⟨hTargetClass, hTargetLink⟩
  · have hSelectedFinish :=
      ctx03_same_finish_root_implies_finish F E hMirror.1
    have hJSelectedStart :=
      (INV_07_objective_chirality
        F a1 N E D selected jselected hMarkerInv).2.1 hSelectedFinish |>.1
    have hTargetClass :
        SameChiralClass F jselected E.startRoot :=
      Or.inl ⟨hJSelectedStart, f2f3_start_root_pattern F E⟩
    rcases INV_01_recursive_pole_reversal F D hLinkInv with
      ⟨inverseFinish, inverseStart, hFinishInv, hStartPoleInv, hRebuild⟩
    have hFinishInv' :
        RecursiveInversion F D semanticStart inverseFinish := by
      simpa only [hMirror.2, F.form_finish] using hFinishInv
    have hStartInv' :
        RecursiveInversion F D semanticEnd inverseStart := by
      simpa only [hMirror.2, F.form_start] using hStartPoleInv
    have hFinishEq :
        inverseFinish = jStart :=
      recursive_inversion_functional F D hFinishInv' hStartInv
    have hStartEq :
        inverseStart = jEnd :=
      recursive_inversion_functional F D hStartInv' hEndInv
    have hTargetLink :
        jTechnicalLink = F.form jStart jEnd := by
      calc
        jTechnicalLink = F.form inverseFinish inverseStart := hRebuild
        _ = F.form jStart jEnd := by rw [hFinishEq, hStartEq]
    exact Or.inl ⟨hTargetClass, hTargetLink⟩

/--
The one-relation structural kernel of generalized modus ponens in an oriented
Context:

  K ⟼ A
  A ⟼ B
  -------
  K ⟼ B

The three Links are represented through ContextSemanticArrow, so technical pole
order is not semantic orientation authority.
-/
def ContextGeneralizedMPStep
    (F : Foundation)
    (E : F2F3OneSidedExistence F)
    (selected K A B truth rule result : F.Link) : Prop :=
  ContextSemanticArrow F E selected K A truth ∧
  ContextSemanticArrow F E selected A B rule ∧
  ContextSemanticArrow F E selected K B result

def ContextGeneralizedMPCovarianceLaw
    (F : Foundation)
    {E : F2F3OneSidedExistence F}
    (D : RecursiveInversionDomain F E) : Prop :=
  ∀ selected jselected
    K A B jK jA jB
    truth rule result jtruth jrule jresult : F.Link,
    RecursiveInversion F D selected jselected →
    RecursiveInversion F D K jK →
    RecursiveInversion F D A jA →
    RecursiveInversion F D B jB →
    RecursiveInversion F D truth jtruth →
    RecursiveInversion F D rule jrule →
    RecursiveInversion F D result jresult →
    ContextGeneralizedMPStep F E selected K A B truth rule result →
    ContextGeneralizedMPStep
      F E jselected jK jA jB jtruth jrule jresult

theorem CTX_03_generalized_mp_semantic_covariance
    (F : Foundation)
    (a1 : A1RecursiveSeparation F)
    (N : F2F3GroundedNormalization F)
    (E : F2F3OneSidedExistence F)
    (D : RecursiveInversionDomain F E) :
    ContextGeneralizedMPCovarianceLaw F D := by
  intro selected jselected
    K A B jK jA jB
    truth rule result jtruth jrule jresult
    hMarkerInv hKInv hAInv hBInv
    hTruthInv hRuleInv hResultInv hStep
  exact ⟨
    CTX_03_semantic_arrow_covariant
      F a1 N E D
      hMarkerInv hKInv hAInv hTruthInv hStep.1,
    CTX_03_semantic_arrow_covariant
      F a1 N E D
      hMarkerInv hAInv hBInv hRuleInv hStep.2.1,
    CTX_03_semantic_arrow_covariant
      F a1 N E D
      hMarkerInv hKInv hBInv hResultInv hStep.2.2
  ⟩

/--
Explicit negative control.

A host-style operation that always reads the technical first pole is not
inversion-covariant.  Therefore arbitrary non-covariant operations are outside
the accepted Context-semantic relation.
-/
def TechnicalStartOperation
    (F : Foundation)
    (input output : F.Link) : Prop :=
  output = F.start input

def InversionCovariantUnaryOperation
    (F : Foundation)
    {E : F2F3OneSidedExistence F}
    (D : RecursiveInversionDomain F E)
    (Op : F.Link → F.Link → Prop) : Prop :=
  ∀ input jinput output joutput : F.Link,
    RecursiveInversion F D input jinput →
    RecursiveInversion F D output joutput →
    Op input output →
    Op jinput joutput

theorem CTX_03_technical_start_not_covariant
    (F : Foundation)
    (E : F2F3OneSidedExistence F)
    (D : RecursiveInversionDomain F E) :
    ¬ InversionCovariantUnaryOperation
      F D (TechnicalStartOperation F) := by
  intro hCovariant
  have hDirections := CTX_03_direction_witness_inversion F E D
  have hR : RecursiveInversion F D F.R F.R :=
    RecursiveInversion.root (F := F) (D := D)
  have hCO : RecursiveInversion F D E.finishRoot E.startRoot := by
    have hChild : RecursiveInversion F D (F.start E.finishRoot) F.R := by
      rw [f2f3_finish_root_start F E]
      exact hR
    have h :=
      RecursiveInversion.finish
        (D := D)
        (f2f3_finish_root_pattern F E)
        hChild
    rw [D.startRootCompat] at h
    exact h
  have hSource :
      TechnicalStartOperation
        F (ContextInRWitness F E) E.finishRoot := by
    unfold TechnicalStartOperation ContextInRWitness
    rw [F.form_start]
  have hMirror :=
    hCovariant
      (ContextInRWitness F E)
      (ContextOutRWitness F E)
      E.finishRoot
      E.startRoot
      hDirections.1
      hCO
      hSource
  unfold TechnicalStartOperation ContextOutRWitness at hMirror
  rw [F.form_start] at hMirror
  exact E.startRootNeRoot hMirror

def ContextChiBridgeLaw
    (F : Foundation)
    (E : F2F3OneSidedExistence F)
    (D : RecursiveInversionDomain F E) : Prop :=
  ∀ body selected : F.Link,
    ContextOrientationMarker F D body selected →
    ∃ chi jchi : F.Link,
      ContextChiWitness F E selected chi ∧
      RecursiveInversion F D chi jchi ∧
      chi ≠ jchi ∧
      ((chi = ContextInRWitness F E ∧
        jchi = ContextOutRWitness F E) ∨
       (chi = ContextOutRWitness F E ∧
        jchi = ContextInRWitness F E))

/--
CTX-03 capstone: objective chirality predates observation, Context selection
induces only local START_K/END_K roles, and relative transport composes as the
already-proved relational Z2 layer.

The Z2 terminology is an explicitly marked external group-theory projection;
the native MTS content remains Link-native and Context-relative.
-/
theorem CTX_03_context_relative_gauge
    (F : Foundation)
    (a1 : A1RecursiveSeparation F)
    (N : F2F3GroundedNormalization F)
    (E : F2F3OneSidedExistence F)
    (D : RecursiveInversionDomain F E) :
    RelativeZ2Law F ∧
    InversionIsMirrorTransport F D ∧
    (∃ w jw : F.Link,
      RecursiveInversion F D w jw ∧
      RecursiveInversion F D jw w ∧
      w ≠ jw ∧
      OppositeChiralClass F w jw ∧
      (∀ z : F.Link, RecursiveInversion F D jw z -> z = w)) ∧
    (∀ body selected : F.Link,
      ContextOrientationMarker F D body selected ->
      ∃ localStart localEnd : F.Link,
        ContextOrientationMarker F D body localStart ∧
        ContextOrientationMarker F D body localEnd ∧
        ContextLocalStartRole F selected localStart ∧
        ContextLocalEndRole F selected localEnd ∧
        localStart ≠ localEnd) ∧
    (∀ a b ja jb : F.Link,
      RecursiveInversion F D a ja ->
      RecursiveInversion F D b jb ->
      (SameChiralClass F a b -> SameChiralClass F ja jb) ∧
      (OppositeChiralClass F a b -> OppositeChiralClass F ja jb)) := by
  rcases CTX_03_relational_z2_support F a1 N E D with ⟨hZ2, hMirror⟩
  refine ⟨
    hZ2,
    hMirror,
    CTX_03_objective_chiral_orbit_before_context F a1 N E D,
    ?_,
    ?_
  ⟩
  · intro body selected hSelected
    exact CTX_03_context_selection_induces_local_roles
      F a1 E D hSelected
  · intro a b ja jb hJa hJb
    exact CTX_03_simultaneous_inversion_covariance
      F a1 N E D hJa hJb


/--
Strengthened CTX-03 semantic capstone.

It composes the previously proved structural orientation layer with:
- marker -> chi(K) direction-witness semantics;
- covariance of the generalized-MP structural semantic step under J;
- an explicit falsifier showing raw technical first-pole operations are not
  admitted as semantic operations merely because they are definable.
-/
theorem CTX_03_semantic_covariance_capstone
    (F : Foundation)
    (a1 : A1RecursiveSeparation F)
    (N : F2F3GroundedNormalization F)
    (E : F2F3OneSidedExistence F)
    (D : RecursiveInversionDomain F E) :
    ContextChiBridgeLaw F E D ∧
    ContextGeneralizedMPCovarianceLaw F D ∧
    ¬ InversionCovariantUnaryOperation
      F D (TechnicalStartOperation F) := by
  have _structuralLayer :=
    CTX_03_context_relative_gauge F a1 N E D
  refine ⟨
    ?_,
    CTX_03_generalized_mp_semantic_covariance F a1 N E D,
    CTX_03_technical_start_not_covariant F E D
  ⟩
  intro body selected hSelected
  exact CTX_03_chi_direction_bridge F a1 E D hSelected



/--
FND-07 external projection of accepted contextual-truth semantics.

EXTERNAL THEORY PROJECTION NOTE:
no additional external mathematical theory is introduced here.
CurrentScopeMember is intentionally a Prop-valued prover relation. It projects
membership in the one published current Scope; it is NOT a native MTS
predicate object and is NOT an axiomatic-set-theory Set/Membership model.

The structural witness itself remains the Link K ⟼ A.
-/
def ContextualTruthWitness
    (F : Foundation)
    (K A : F.Link) : F.Link :=
  F.form K A

def ContextualTruth
    (F : Foundation)
    (CurrentScopeMember : F.Link → Prop)
    (K A : F.Link) : Prop :=
  CurrentScopeMember (ContextualTruthWitness F K A)

/--
Accepted root truth-aspect L projected from the same F2/F3 root basis already
used throughout the external foundation proof.

This is not an arbitrary host-selected Link.  It is the structural root-basis
Link O⟼C.  Calling it the truth value is an accepted contextual-truth semantic
premise inherited from A16/V14-L11; the definition does not claim to derive
the semantic role "truth" from bare Foundation.
-/
def TruthValueL
    (F : Foundation)
    (E : F2F3OneSidedExistence F) : F.Link :=
  F.form E.startRoot E.finishRoot

def ContextualRuleWitness
    (F : Foundation)
    (A B : F.Link) : F.Link :=
  F.form A B

def ContextualRule
    (F : Foundation)
    (CurrentScopeMember : F.Link → Prop)
    (A B : F.Link) : Prop :=
  CurrentScopeMember (ContextualRuleWitness F A B)

/--
External proof projection of the accepted A16 closure law.

It says only that the current Scope is closed under the directed composition
used by contextual detachment.  It is an explicit semantic premise, not a
theorem of bare Foundation and not a host function/opcode.
-/
def ContextualScopeCompositionLaw
    (F : Foundation)
    (CurrentScopeMember : F.Link → Prop) : Prop :=
  ∀ K A B : F.Link,
    CurrentScopeMember (F.form K A) →
    CurrentScopeMember (F.form A B) →
    CurrentScopeMember (F.form K B)

/--
FND-07 currentness/contextual-witness boundary lemma.

Even the exact structural Link K⟼A may exist as an ambient Link while not
being current.  In that case it is not contextual truth.  Conversely,
contextual truth is witnessed by currentness of exactly that Link.

No host Bool, Set, Finset, map/environment, or collection object carries truth
authority here.
-/
theorem FND_07_contextual_truth_boundary
    (F : Foundation)
    (CurrentScopeMember : F.Link → Prop) :
    (∀ K A : F.Link,
      ContextualTruth F CurrentScopeMember K A ↔
      CurrentScopeMember (F.form K A)) ∧
    (∀ K A : F.Link,
      ¬ CurrentScopeMember (F.form K A) →
      ∃ ambientWitness : F.Link,
        ambientWitness = F.form K A ∧
        ¬ ContextualTruth F CurrentScopeMember K A) := by
  constructor
  · intro K A
    rfl
  · intro K A hNotCurrent
    refine ⟨F.form K A, rfl, ?_⟩
    exact hNotCurrent

/--
The accepted root truth-value carrier is structurally the root-basis PAIR
O⟼C.  This proves the structural side of the A16 statement ROOT_TRUE_ASPECT=L;
the semantic role itself remains an accepted contextual-truth premise.
-/
theorem FND_07_root_truth_aspect_L
    (F : Foundation)
    (E : F2F3OneSidedExistence F) :
    TruthValueL F E = F.form E.startRoot E.finishRoot ∧
    PairLocal F (TruthValueL F E) := by
  exact ⟨rfl, f2f3_pair_pattern F E⟩

/--
Accepted A16 detachment becomes an actual theorem once the explicit current
Scope composition law is supplied:

  K⟼A current
  A⟼B current
  -----------
  K⟼B current
-/
theorem FND_07_contextual_detachment
    (F : Foundation)
    (CurrentScopeMember : F.Link → Prop)
    (closure : ContextualScopeCompositionLaw F CurrentScopeMember) :
    ∀ K A B : F.Link,
      ContextualTruth F CurrentScopeMember K A →
      ContextualRule F CurrentScopeMember A B →
      ContextualTruth F CurrentScopeMember K B := by
  intro K A B hTruth hRule
  exact closure K A B hTruth hRule

/--
The same ambient proposition A can have different truth status in two distinct
Contexts without changing A itself.
-/
theorem FND_07_context_relative_truth_status
    (F : Foundation)
    (CurrentScopeMember : F.Link → Prop)
    {K₁ K₂ A : F.Link}
    (hContexts : K₁ ≠ K₂)
    (hTrue : CurrentScopeMember (F.form K₁ A))
    (hFalse : ¬ CurrentScopeMember (F.form K₂ A)) :
    K₁ ≠ K₂ ∧
    ContextualTruth F CurrentScopeMember K₁ A ∧
    ¬ ContextualTruth F CurrentScopeMember K₂ A := by
  exact ⟨hContexts, hTrue, hFalse⟩

/--
Strengthened FND-07 semantic capstone.

It deliberately keeps three roles distinct:
- L = O⟼C is the accepted root truth-value aspect;
- K⟼A is the Context-specific current truth witness;
- directed Scope composition is the explicit accepted A16 execution law.

Nothing here promotes ambient Memory membership, host collection membership,
or an arbitrary Link parameter to truth authority.
-/
theorem FND_07_semantic_truth_capstone
    (F : Foundation)
    (E : F2F3OneSidedExistence F)
    (CurrentScopeMember : F.Link → Prop)
    (closure : ContextualScopeCompositionLaw F CurrentScopeMember) :
    (TruthValueL F E = F.form E.startRoot E.finishRoot ∧
      PairLocal F (TruthValueL F E)) ∧
    (∀ K A : F.Link,
      ContextualTruth F CurrentScopeMember K A ↔
      CurrentScopeMember (F.form K A)) ∧
    (∀ K A B : F.Link,
      ContextualTruth F CurrentScopeMember K A →
      ContextualRule F CurrentScopeMember A B →
      ContextualTruth F CurrentScopeMember K B) := by
  exact ⟨
    FND_07_root_truth_aspect_L F E,
    (FND_07_contextual_truth_boundary F CurrentScopeMember).1,
    FND_07_contextual_detachment F CurrentScopeMember closure
  ⟩


/--
FND-05 external proof projection of the accepted finite recursive Link codec.

EXTERNAL THEORY PROJECTION NOTE:
RecursiveDescriptionCode is a host inductive proof syntax used only by Lean.
It mirrors the recursive structural grammar ROOT / one-sided-start /
one-sided-finish / PAIR, but it is not an MTS ontology datatype, not an Anum/Q
carrier, and not semantic authority.

No additional external mathematical theory is introduced here beyond the
already-declared constructive inductive/propositional host proof methods.
-/
inductive RecursiveDescriptionCode where
  | root
  | startSelf (child : RecursiveDescriptionCode)
  | finishSelf (child : RecursiveDescriptionCode)
  | pair (startChild finishChild : RecursiveDescriptionCode)

/--
The declared finite recursive carrier supplies only the exact local
self-incidence decisions required to read the structural grammar on a
Grounded Link. Finiteness itself remains in the Grounded proof object.
-/
def FiniteRecursiveCarrierDecision (F : Foundation) : Prop :=
  ∀ {x : F.Link}, Grounded F x → LocalSelfDecision F x

/--
Relational interpretation of one external recursive proof code as one Link.
The four constructors are proof rules over existing Link structure, not a
second native MTS entity.
-/
inductive CanonicalRecursiveDescription
    (F : Foundation) : F.Link → RecursiveDescriptionCode → Prop
  | root :
      CanonicalRecursiveDescription F F.R .root
  | startSelf {x : F.Link} {child : RecursiveDescriptionCode} :
      StartOnly F x →
      CanonicalRecursiveDescription F (F.finish x) child →
      CanonicalRecursiveDescription F x (.startSelf child)
  | finishSelf {x : F.Link} {child : RecursiveDescriptionCode} :
      FinishOnly F x →
      CanonicalRecursiveDescription F (F.start x) child →
      CanonicalRecursiveDescription F x (.finishSelf child)
  | pair {x : F.Link}
      {startCode finishCode : RecursiveDescriptionCode} :
      PairLocal F x →
      CanonicalRecursiveDescription F (F.start x) startCode →
      CanonicalRecursiveDescription F (F.finish x) finishCode →
      CanonicalRecursiveDescription F x (.pair startCode finishCode)

/--
Every Link in the declared finite ROOT-decomposable carrier has a recursive
description.

This consumes the proposition-level FND-01 four-way partition and FND-02
unique ROOT only. No host tree equality or codec implementation is semantic
authority.
-/
theorem FND_05_recursive_description_total
    (F : Foundation)
    (a1 : A1RecursiveSeparation F)
    (D : FiniteRecursiveCarrierDecision F)
    {x : F.Link}
    (gx : Grounded F x) :
    ∃ code : RecursiveDescriptionCode,
      CanonicalRecursiveDescription F x code := by
  induction gx with
  | node startStep finishStep ihStart ihFinish =>
      have decision := D (Grounded.node startStep finishStep)
      have cases := local_self_incidence_exhaustive F decision
      rcases cases with hFull | hStart | hFinish | hPair
      · have hxRoot := FND_02_unique_root F a1 hFull
        refine ⟨.root, ?_⟩
        simpa only [hxRoot] using
          (CanonicalRecursiveDescription.root (F := F))
      · rcases ihFinish hStart.2 with ⟨child, hChild⟩
        exact ⟨.startSelf child,
          CanonicalRecursiveDescription.startSelf hStart hChild⟩
      · rcases ihStart hFinish.1 with ⟨child, hChild⟩
        exact ⟨.finishSelf child,
          CanonicalRecursiveDescription.finishSelf hFinish hChild⟩
      · rcases ihStart hPair.1 with ⟨startCode, hStartChild⟩
        rcases ihFinish hPair.2 with ⟨finishCode, hFinishChild⟩
        exact ⟨.pair startCode finishCode,
          CanonicalRecursiveDescription.pair
            hPair hStartChild hFinishChild⟩

/--
One Link cannot have two different canonical recursive descriptions on the
declared structural grammar.
-/
theorem recursive_description_functional
    (F : Foundation)
    {x : F.Link}
    {left right : RecursiveDescriptionCode}
    (hLeft : CanonicalRecursiveDescription F x left)
    (hRight : CanonicalRecursiveDescription F x right) :
    left = right := by
  induction hLeft generalizing right with
  | root =>
      cases hRight with
      | root => rfl
      | startSelf hStart _ =>
          exact False.elim
            (recursive_full_start_disjoint F (root_full_self F) hStart)
      | finishSelf hFinish _ =>
          exact False.elim
            (recursive_full_finish_disjoint F (root_full_self F) hFinish)
      | pair hPair _ _ =>
          exact False.elim
            (recursive_full_pair_disjoint F (root_full_self F) hPair)
  | startSelf hStart hChild ih =>
      cases hRight with
      | root =>
          exact False.elim
            (recursive_full_start_disjoint F (root_full_self F) hStart)
      | startSelf _ hOther =>
          exact congrArg RecursiveDescriptionCode.startSelf (ih hOther)
      | finishSelf hFinish _ =>
          exact False.elim
            (recursive_start_finish_disjoint F hStart hFinish)
      | pair hPair _ _ =>
          exact False.elim
            (recursive_start_pair_disjoint F hStart hPair)
  | finishSelf hFinish hChild ih =>
      cases hRight with
      | root =>
          exact False.elim
            (recursive_full_finish_disjoint F (root_full_self F) hFinish)
      | startSelf hStart _ =>
          exact False.elim
            (recursive_start_finish_disjoint F hStart hFinish)
      | finishSelf _ hOther =>
          exact congrArg RecursiveDescriptionCode.finishSelf (ih hOther)
      | pair hPair _ _ =>
          exact False.elim
            (recursive_finish_pair_disjoint F hFinish hPair)
  | pair hPair hStartChild hFinishChild ihStart ihFinish =>
      cases hRight with
      | root =>
          exact False.elim
            (recursive_full_pair_disjoint F (root_full_self F) hPair)
      | startSelf hStart _ =>
          exact False.elim
            (recursive_start_pair_disjoint F hStart hPair)
      | finishSelf hFinish _ =>
          exact False.elim
            (recursive_finish_pair_disjoint F hFinish hPair)
      | pair _ hOtherStart hOtherFinish =>
          have hs := ihStart hOtherStart
          have hf := ihFinish hOtherFinish
          rw [hs, hf]

/--
FND-05 capstone: canonical recursive structural description exists uniquely
on the explicitly declared finite ROOT-decomposable carrier domain.

The conclusion is restricted to Grounded Links admitted by the declared
recursive carrier decision. It does not extend to arbitrary non-well-founded
distinct-node cycles and says nothing about sequential Anum/Q identity.
-/
theorem FND_05_canonical_recursive_description_unique
    (F : Foundation)
    (a1 : A1RecursiveSeparation F)
    (D : FiniteRecursiveCarrierDecision F)
    {x : F.Link}
    (gx : Grounded F x) :
    ∃ code : RecursiveDescriptionCode,
      CanonicalRecursiveDescription F x code ∧
      ∀ other : RecursiveDescriptionCode,
        CanonicalRecursiveDescription F x other →
        other = code := by
  rcases FND_05_recursive_description_total F a1 D gx with
    ⟨code, hCode⟩
  refine ⟨code, hCode, ?_⟩
  intro other hOther
  exact recursive_description_functional F hOther hCode


/--
FND-11 external proof vocabulary for representation identity targets.

EXTERNAL THEORY PROJECTION NOTE:
RepresentationIdentityTarget is a host-side classifier of already accepted
representation contracts. It is not an MTS ontology datatype and does not add
entities beside Link. No additional external mathematical theory is introduced
here; the proof uses only constructive propositions, equality, functions and
small inductive host syntax.
-/
inductive RepresentationIdentityTarget where
  | recursiveLinkStructure
  | anumRootedSequence
  | exactPositionalSequence
  | rootedFoldDenotation
  | versionedQDenotation

def recursiveCodecIdentityTarget : RepresentationIdentityTarget :=
  .recursiveLinkStructure

def anumIdentityTarget : RepresentationIdentityTarget :=
  .anumRootedSequence

def exactSequenceIdentityTarget : RepresentationIdentityTarget :=
  .exactPositionalSequence

def foldDenotationIdentityTarget : RepresentationIdentityTarget :=
  .rootedFoldDenotation

def qIdentityTarget : RepresentationIdentityTarget :=
  .versionedQDenotation

theorem recursive_codec_target_ne_anum :
    recursiveCodecIdentityTarget ≠ anumIdentityTarget := by
  intro h
  cases h

theorem exact_sequence_target_ne_fold :
    exactSequenceIdentityTarget ≠ foldDenotationIdentityTarget := by
  intro h
  cases h

/--
Projection of the accepted v0.14 representation-layer definitions.

Anum and ExactSequence are modeled as predicates over the one Link carrier,
not as new MTS sorts. QVersion/QSource are external source/interpreter syntax,
not ontology entities.

The concrete witnesses correspond to accepted executable vectors:
- ExactSequence [] and [R] are distinct carriers but have the same rooted fold R;
- Q14 empty source and [] are distinct normalized sources but both denote R.
-/
structure AcceptedV014RepresentationDefinitions (F : Foundation) where
  anumCarrier : F.Link → Prop
  exactSequenceCarrier : F.Link → Prop

  anumOrigin : F.Link → F.Link
  exactSequenceOrigin : F.Link → F.Link

  anumOriginRoot :
    ∀ {a : F.Link}, anumCarrier a → anumOrigin a = F.R

  exactSequenceOriginRoot :
    ∀ {s : F.Link}, exactSequenceCarrier s → exactSequenceOrigin s = F.R

  exactFold : F.Link → F.Link

  exactEmpty : F.Link
  exactOneRoot : F.Link
  exactEmptyCarrier : exactSequenceCarrier exactEmpty
  exactOneRootCarrier : exactSequenceCarrier exactOneRoot
  exactEmptyNeOneRoot : exactEmpty ≠ exactOneRoot
  exactFoldEmpty : exactFold exactEmpty = F.R
  exactFoldOneRoot : exactFold exactOneRoot = F.R

  QVersion : Type
  QSource : Type

  qOrigin : QVersion → QSource → F.Link
  qInterpret : QVersion → QSource → F.Link

  qOriginRoot :
    ∀ version source, qOrigin version source = F.R

  q14 : QVersion
  qEmpty : QSource
  qNestedEmpty : QSource
  qEmptyNeNested : qEmpty ≠ qNestedEmpty
  qEmptyDenotesRoot : qInterpret q14 qEmpty = F.R
  qNestedDenotesRoot : qInterpret q14 qNestedEmpty = F.R

/--
The established FND-05 result recast as a dependency proposition.

FND-11 receives a proof of this proposition as its declared theorem dependency;
it does not import FND-05's premises as new FND-11 assumptions.
-/
def FND05Canonicality (F : Foundation) : Prop :=
  ∀ {x : F.Link},
    Grounded F x →
    ∃ code : RecursiveDescriptionCode,
      CanonicalRecursiveDescription F x code ∧
      ∀ other : RecursiveDescriptionCode,
        CanonicalRecursiveDescription F x other →
        other = code

theorem fnd05_dependency_witness
    (F : Foundation)
    (a1 : A1RecursiveSeparation F)
    (D : FiniteRecursiveCarrierDecision F) :
    FND05Canonicality F := by
  intro x gx
  exact FND_05_canonical_recursive_description_unique F a1 D gx

def ExactSequenceFoldCollision
    (F : Foundation)
    (B : AcceptedV014RepresentationDefinitions F) : Prop :=
  ∃ left right : F.Link,
    B.exactSequenceCarrier left ∧
    B.exactSequenceCarrier right ∧
    left ≠ right ∧
    B.exactFold left = B.exactFold right

def QDenotationCollision
    (F : Foundation)
    (B : AcceptedV014RepresentationDefinitions F) : Prop :=
  ∃ left right : B.QSource,
    left ≠ right ∧
    B.qInterpret B.q14 left = B.qInterpret B.q14 right

theorem exact_sequence_fold_collision
    (F : Foundation)
    (B : AcceptedV014RepresentationDefinitions F) :
    ExactSequenceFoldCollision F B := by
  refine ⟨
    B.exactEmpty,
    B.exactOneRoot,
    B.exactEmptyCarrier,
    B.exactOneRootCarrier,
    B.exactEmptyNeOneRoot,
    ?_
  ⟩
  calc
    B.exactFold B.exactEmpty = F.R := B.exactFoldEmpty
    _ = B.exactFold B.exactOneRoot := B.exactFoldOneRoot.symm

theorem q_denotation_collision
    (F : Foundation)
    (B : AcceptedV014RepresentationDefinitions F) :
    QDenotationCollision F B := by
  refine ⟨B.qEmpty, B.qNestedEmpty, B.qEmptyNeNested, ?_⟩
  calc
    B.qInterpret B.q14 B.qEmpty = F.R := B.qEmptyDenotesRoot
    _ = B.qInterpret B.q14 B.qNestedEmpty := B.qNestedDenotesRoot.symm

/--
FND-11 capstone.

The accepted representation definitions and the already-established FND-05
canonicality result imply a strict separation of identity roles:

- recursive Link structure has unique recursive-code identity on the FND-05 domain;
- its identity target is not the Anum rooted-sequence target;
- Anum and ExactSequence local sequence origins are R;
- ExactSequence positional identity is strictly stronger than rooted fold
  denotation because two distinct exact carriers can have the same fold;
- Q is explicitly versioned by QVersion and interpreted by qInterpret;
- Q source identity is not denotation identity because distinct Q14 sources
  can share the same denotation;
- every projected Q local sequence origin is R.

No global recursive-structure/Q isomorphism and no representation-strength
ranking are asserted.
-/
theorem FND_11_representation_identities_separated
    (F : Foundation)
    (B : AcceptedV014RepresentationDefinitions F)
    (fnd05 : FND05Canonicality F) :
    FND05Canonicality F ∧
    recursiveCodecIdentityTarget ≠ anumIdentityTarget ∧
    (∀ {a : F.Link}, B.anumCarrier a → B.anumOrigin a = F.R) ∧
    (∀ {s : F.Link},
      B.exactSequenceCarrier s →
      B.exactSequenceOrigin s = F.R) ∧
    ExactSequenceFoldCollision F B ∧
    (∀ version source, B.qOrigin version source = F.R) ∧
    QDenotationCollision F B := by
  refine ⟨
    fnd05,
    recursive_codec_target_ne_anum,
    ?_,
    ?_,
    exact_sequence_fold_collision F B,
    ?_,
    q_denotation_collision F B
  ⟩
  · intro a ha
    exact B.anumOriginRoot ha
  · intro s hs
    exact B.exactSequenceOriginRoot hs
  · intro version source
    exact B.qOriginRoot version source

end MTS.External
