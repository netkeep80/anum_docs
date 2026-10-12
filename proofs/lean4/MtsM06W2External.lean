/-
M06-W2 independent external kernel candidate: C-01 / B-1.3 / C-02.
Append after the exact accepted MtsFoundation.lean + MtsExplicitModel.lean.
The source does not introduce axioms, rewrite accepted models, or assert
scientific approval of the reviewer questions.
-/
namespace MTS.External.Model1796

theorem M06_W2_badStart_not_form_image (a b : ModelLink) :
    badStart ≠ form a b := by
  intro h
  have hd : decode badStart = some (a, b) := by
    rw [h, decode_form]
  simp [decode, badStart] at hd

theorem M06_W2_reverse_law_fails :
    form (start badStart) (finish badStart) ≠ badStart := by
  exact (M06_W2_badStart_not_form_image _ _).symm

theorem M06_W2_poles_nonextensional :
    badStart ≠ badFinish ∧
    start badStart = start badFinish ∧
    finish badStart = finish badFinish := by
  exact ⟨badStart_ne_badFinish, by simp, by simp⟩

theorem M06_W2_joint_model_witness :
    A1RecursiveSeparation ExplicitFoundation ∧
    ∃ E : F2F3OneSidedExistence ExplicitFoundation,
      ∃ N : F2F3GroundedNormalization ExplicitFoundation,
        ∃ D : RecursiveInversionDomain ExplicitFoundation E, True := by
  exact ⟨explicit_a1,
    ⟨ExplicitOneSided,
      ⟨ExplicitGroundedNormalization,
        ⟨ExplicitInversionDomain, trivial⟩⟩⟩⟩


/--
If a weak Foundation has two different Links, the iterated right-pole
construction embeds Nat into its carrier. No F2F3/A1/Grounded premise.
-/
def M06_W2_two_point_orbit
    (F : Foundation) (a b : F.Link) : Nat → F.Link
  | 0 => F.form F.R b
  | n + 1 => F.form (M06_W2_two_point_orbit F a b n) a

theorem M06_W2_two_point_orbit_succ_ne_zero
    (F : Foundation) {a b : F.Link} (hab : a ≠ b) (n : Nat) :
    M06_W2_two_point_orbit F a b (n + 1) ≠
      M06_W2_two_point_orbit F a b 0 := by
  intro h
  have hp := congrArg F.finish h
  have hEq : a = b := by
    simpa only [M06_W2_two_point_orbit, F.form_finish] using hp
  exact hab hEq

theorem M06_W2_two_point_orbit_injective
    (F : Foundation) {a b : F.Link} (hab : a ≠ b) :
    Function.Injective (M06_W2_two_point_orbit F a b) := by
  intro m
  induction m with
  | zero =>
      intro n h
      cases n with
      | zero => rfl
      | succ n =>
          exact False.elim
            (M06_W2_two_point_orbit_succ_ne_zero F hab n h.symm)
  | succ m ih =>
      intro n h
      cases n with
      | zero =>
          exact False.elim
            (M06_W2_two_point_orbit_succ_ne_zero F hab m h)
      | succ n =>
          have hPrev :
              M06_W2_two_point_orbit F a b m =
                M06_W2_two_point_orbit F a b n := by
            have hPoles := congrArg F.start h
            simpa only [M06_W2_two_point_orbit, F.form_start] using hPoles
          exact congrArg Nat.succ (ih hPrev)

theorem M06_W2_two_distinct_implies_nat_injection
    (F : Foundation) (a b : F.Link) (hab : a ≠ b) :
    HasNatInjection F :=
  ⟨M06_W2_two_point_orbit F a b,
   M06_W2_two_point_orbit_injective F hab⟩

end MTS.External.Model1796
