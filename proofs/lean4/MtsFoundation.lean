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
This interface states exactly the part needed by A6:

* every Link has a recursively composed normal form;
* equal normal forms denote one semantic Link;
* construction of the normalization layer already consumes FND-02 / unique ROOT.

It deliberately does not assume pole extensionality and does not add a
reconstruction axiom `form (start x) (finish x) = x`.
-/
structure F2F3Normalization (F : Foundation) where
  NormalForm : Type
  compose : NormalForm → NormalForm → NormalForm
  normalForm : F.Link → NormalForm

  rootUnique :
    ∀ {x : F.Link}, FullSelf F x → x = F.R

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

The reverse direction is a normal-form argument, not host pointer equality:
same ordered poles imply the same recursively composed normal form; F2/F3
completeness then yields one semantic Link.
-/
theorem FND_13_identity_by_poles
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

end MTS.External
