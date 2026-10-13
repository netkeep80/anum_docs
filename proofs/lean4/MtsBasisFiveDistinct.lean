/-
Post-v0.15 independent external proof candidate for #2222 (F03).
This file is compiled by concatenating the unchanged accepted MtsFoundation.lean
source before this suffix. It adds neither MTS axioms nor Link constructors.
Only F : Foundation and E : F2F3OneSidedExistence F are premises.
-/
namespace MTS.External

theorem F03_basis_five_pairwise_distinct
    (F : Foundation)
    (E : F2F3OneSidedExistence F) :
    F.R ≠ E.startRoot ∧
    F.R ≠ E.finishRoot ∧
    F.R ≠ F.form E.startRoot E.finishRoot ∧
    F.R ≠ F.form E.finishRoot E.startRoot ∧
    E.startRoot ≠ E.finishRoot ∧
    E.startRoot ≠ F.form E.startRoot E.finishRoot ∧
    E.startRoot ≠ F.form E.finishRoot E.startRoot ∧
    E.finishRoot ≠ F.form E.startRoot E.finishRoot ∧
    E.finishRoot ≠ F.form E.finishRoot E.startRoot ∧
    F.form E.startRoot E.finishRoot ≠
      F.form E.finishRoot E.startRoot := by
  let O : F.Link := E.startRoot
  let C : F.Link := E.finishRoot
  let L : F.Link := F.form O C
  let U : F.Link := F.form C O
  change F.R ≠ O ∧ F.R ≠ C ∧ F.R ≠ L ∧ F.R ≠ U ∧
    O ≠ C ∧ O ≠ L ∧ O ≠ U ∧ C ≠ L ∧ C ≠ U ∧ L ≠ U
  have hR : FullSelf F F.R := root_full_self F
  have hO : StartOnly F O := f2f3_start_root_pattern F E
  have hC : FinishOnly F C := f2f3_finish_root_pattern F E
  have hL : PairLocal F L := f2f3_pair_pattern F E
  have hU : PairLocal F U := f2f3_reverse_pair_pattern F E
  have hRO : F.R ≠ O := Ne.symm E.startRootNeRoot
  have hRC : F.R ≠ C := Ne.symm E.finishRootNeRoot
  have hRL : F.R ≠ L := by
    intro eq
    have hs : F.start L = L := by
      rw [← eq]
      exact hR.1
    exact hL.1 hs
  have hRU : F.R ≠ U := by
    intro eq
    have hs : F.start U = U := by
      rw [← eq]
      exact hR.1
    exact hU.1 hs
  have hOC : O ≠ C := by
    intro eq
    have hs : F.start C = C := by
      rw [← eq]
      exact hO.1
    exact hC.1 hs
  have hOL : O ≠ L := by
    intro eq
    have hs : F.start L = L := by
      rw [← eq]
      exact hO.1
    exact hL.1 hs
  have hOU : O ≠ U := by
    intro eq
    have hs : F.start U = U := by
      rw [← eq]
      exact hO.1
    exact hU.1 hs
  have hCL : C ≠ L := by
    intro eq
    have hf : F.finish L = L := by
      rw [← eq]
      exact hC.2
    exact hL.2 hf
  have hCU : C ≠ U := by
    intro eq
    have hf : F.finish U = U := by
      rw [← eq]
      exact hC.2
    exact hU.2 hf
  have hLU : L ≠ U := by
    intro eq
    have h : O = C ∧ C = O :=
      (fnd13_form_injective F).mp
        (show F.form O C = F.form C O from eq)
    exact hOC h.1
  exact ⟨hRO, hRC, hRL, hRU, hOC, hOL, hOU, hCL, hCU, hLU⟩

end MTS.External
