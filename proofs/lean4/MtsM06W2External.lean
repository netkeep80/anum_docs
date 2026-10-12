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

end MTS.External.Model1796
