# MTS Nat Re-foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-found the derived MTS natural-number theory around `N0=U; N(n+1)=Nn⟼L`, revalidate Peano/Count/arithmetic consequences, and classify whether any accepted MTS semantic version change is actually required.

**Architecture:** Preserve accepted `v0.11` and the root basis `R/O/C/L/U`. Treat the new Nat construction as a falsifiable derived-foundation hypothesis. Keep generic proof-calculus work independent, pause arithmetic theorem acceptance until the Nat carrier is selected, then replay arithmetic proofs over that selected theory.

**Tech Stack:** MTS TypeScript core/tests, GitHub Issues/PRs, repo-guard, Markdown theory documentation.

**Spec:** `docs/superpowers/specs/2026-09-07-mts-nat-refoundation-design.md`

## Global Constraints

- Accepted MTS remains `v0.11` until an explicit semantic-candidate lifecycle proves otherwise.
- Do not assign a next version number in advance.
- `U` remains unlinked/zero-boundary semantics; `L` remains linked/unit-link semantics.
- Do not assume `L == Nat(1)` or abit `1 == Nat(1)`.
- No host integer, Ordinal, Cardinal, Nat type, tag or enum may become semantic authority.
- Existing L-degree research remains historical evidence and an object to measure, not something to delete.
- L0/L1/COMM acceptance is paused until the Nat theory is selected.
- Every executable child uses TDD, blocking CI, blocking repo-guard, `behind_by=0`, exact-head merge and post-merge verification.

---

### Task 1: Control-plane reorientation

**Files:**
- No production files.
- GitHub Issues/PR metadata only.

**Interfaces:**
- Consumes: accepted v0.11 baseline, #342/#586/#588 historical arithmetic, #999/#1019 proof-calculus ladder, #1050/#1051 weakening.
- Produces: one authoritative Nat re-foundation owner and explicit pause/resume boundaries.

- [ ] **Step 1:** Create one Nat re-foundation owner issue linked to #657, #342, #586, #588, #999, #1019, #1050/#1051 and #1049.
- [ ] **Step 2:** Record exact opening main and accepted state.
- [ ] **Step 3:** Mark L0/L1/COMM in #1019 paused pending the Nat owner.
- [ ] **Step 4:** Narrow #1050/#1051 to generic rooted-proof-Anet weakening only; remove real-L0 completion from that slice.
- [ ] **Step 5:** Record in #999 that generic proof calculus continues while arithmetic proof acceptance is paused.
- [ ] **Step 6:** Record in #657 that a falsifiable derived-foundation Nat hypothesis is active, but no semantic candidate/version is yet opened.

### Task 2: N0 inventory — old Nat dependency map

**Files:**
- Create a bounded research artifact or issue comment owned by the Nat re-foundation issue.
- Do not modify contracts.

**Interfaces:**
- Consumes: repository search for `Nat0`, `S0`, `Count`, `L⟼L`, `connectivity-degree`, arithmetic fixtures.
- Produces: classified dependency map: historical-only, derived-theory, proof fixture, live API, accepted-contract.

- [ ] **Step 1:** Search current tree for all old Nat semantics.
- [ ] **Step 2:** Classify every hit into the five dependency classes.
- [ ] **Step 3:** Verify whether accepted contracts/conformance contain Nat semantics; if absent, record `accepted-contract impact = NONE` at this stage.
- [ ] **Step 4:** Identify all tests that must become stale-model controls rather than current-theory acceptance tests.
- [ ] **Step 5:** Commit only if a repository artifact is needed; otherwise persist the map in the owner issue.

### Task 3: N1 executable carrier falsification

**Files:**
- Create: one focused TypeScript research test under `ts/test/` selected by the child issue.
- No production code initially.

**Interfaces:**
- Consumes: `ensureRootBasis`, Link identity law.
- Produces: executable comparison of old `D1=L,D(n+1)=Dn⟼L` and new `N0=U,N(n+1)=Nn⟼L` families.

- [ ] **Step 1:** Write a RED/research test that constructs `N0..N8` only from `U`, `L`, and Link construction.
- [ ] **Step 2:** Assert pairwise distinction for `N0..N8` and exact prefix/predecessor recovery.
- [ ] **Step 3:** Assert `N1 != L` and retain old `D1=L` as a separate family.
- [ ] **Step 4:** Assert `N(n+1)=Nn⟼L` uniformly including `N0`.
- [ ] **Step 5:** Run the isolated test and classify whether production changes are needed; do not add Nat-specific trusted code if pure Link structure suffices.
- [ ] **Step 6:** Commit the falsifier/evidence.

### Task 4: N2 Peano law proof/falsification

**Files:**
- Test/research files only unless a general proof-calculus gap is exposed.

**Interfaces:**
- Consumes: selected new Nat carrier from Task 3.
- Produces: exact status for closure, successor injectivity, zero-not-successor, predecessor uniqueness, no finite collapse, induction/minimality, initiality.

- [ ] **Step 1:** Prove successor injectivity from ordered-pole identity, not host indexing.
- [ ] **Step 2:** Falsify any candidate `X` with `X⟼L=U` over the admissible Nat carrier; classify the proof obligation if structural proof is incomplete.
- [ ] **Step 3:** Prove unique predecessor for every non-zero constructed Nat.
- [ ] **Step 4:** Prove finite no-collapse/no-cycle for the canonical chain.
- [ ] **Step 5:** Express induction/minimality using existing generic proof machinery; if blocked, record the exact proof-calculus gap without Nat-specific opcode.
- [ ] **Step 6:** Classify initial `1+X` algebra status.
- [ ] **Step 7:** Commit each independently reviewable theorem/falsifier slice.

### Task 5: N3 separate Nat, Degree, Ordinal-like and Cardinal-like provenance

**Files:**
- Focused research tests and one derived-theory spec/document section.

**Interfaces:**
- Consumes: Nat carrier and old L-degree family.
- Produces: explicit relations/provenance without primitive host sorts.

- [ ] **Step 1:** Define/test `Degree(old L-degree form) -> Nn` as a derived relation or proof witness.
- [ ] **Step 2:** Define/test `Count(empty)=N0`, singleton=`N1`, two occurrences=`N2`.
- [ ] **Step 3:** Preserve occurrence identity vs semantic Link identity.
- [ ] **Step 4:** Recheck admissible reorder invariance for cardinal reading.
- [ ] **Step 5:** Record ordinal-like provenance as sequential prefix construction; do not introduce an `Ordinal` primitive type.
- [ ] **Step 6:** Record cardinal-like provenance as Count/forget-content; do not introduce a `Cardinal` primitive type.
- [ ] **Step 7:** Prove that equal resulting Nat forms need not erase provenance in the surrounding Anet.

### Task 6: N4 rederive arithmetic

**Files:**
- Arithmetic research/tests selected by child issues.

**Interfaces:**
- Consumes: selected Nat + successor.
- Produces: revalidated `Add`, `Mul`, `Order` laws.

- [ ] **Step 1:** Re-express base and recursive Add laws using `N0` and uniform successor.
- [ ] **Step 2:** Run finite executable corpus without host arithmetic as authority.
- [ ] **Step 3:** Re-express and test multiplication.
- [ ] **Step 4:** Re-express and test order.
- [ ] **Step 5:** Compare old derived results and classify which proofs transport unchanged and which must be replaced.

### Task 7: N5 resume proof-calculus arithmetic ladder

**Files:**
- Existing L0/L1/COMM research tests only after Task 6 acceptance.

**Interfaces:**
- Consumes: selected Nat theory plus generic proof calculus.
- Produces: new exact L0/L1/COMM statuses.

- [ ] **Step 1:** Rebuild Nat0/S0 contextual evidence from the selected Nat theory.
- [ ] **Step 2:** Rerun L0; record exact first result without special-casing.
- [ ] **Step 3:** Only after L0 is supported, proceed to L1 functionality/soundness gate.
- [ ] **Step 4:** Only after L1 is supported, proceed to relation-native COMM.
- [ ] **Step 5:** Feed proof-calculus-only findings back to #999 and arithmetic findings back to the Nat owner.

### Task 8: N6 semantic-delta classification

**Files:**
- Governance/research documents only initially.

**Interfaces:**
- Consumes: Tasks 2–7 evidence.
- Produces: one of two classifications.

- [ ] **Step 1:** Compare all changed meanings with accepted v0.11 contract/conformance surface.
- [ ] **Step 2:** Classify `DERIVED_THEORY_CORRECTION_ONLY` if core accepted semantics remain unchanged.
- [ ] **Step 3:** Otherwise classify `OBSERVABLE_ACCEPTED_MTS_SEMANTIC_DELTA_REQUIRED` with exact affected pointers/behaviors.
- [ ] **Step 4:** Only for the second classification, open a separate candidate lifecycle under #657.
- [ ] **Step 5:** Assign a version identifier only inside that lifecycle, never beforehand.

### Task 9: N7 canonical Nat chapter

**Files:**
- Create: `docs/theory/Натуральные числа, счёт и мера в МТС.md`
- Modify: `docs/theory/Основания МТС.md` only to link/summarize the accepted result when stable.
- Modify glossary produced by #1049 as required.

**Interfaces:**
- Consumes: final research evidence and semantic-delta classification.
- Produces: canonical human-readable theory chapter.

- [ ] **Step 1:** Write sections for `U`, `L`, unit vs number one, and `N0/N1/...`.
- [ ] **Step 2:** Explain extent vs coordinate and the zero boundary.
- [ ] **Step 3:** Explain old L-degree model and why it was separated from Nat.
- [ ] **Step 4:** Document Peano laws with links to executable evidence.
- [ ] **Step 5:** Document Degree, Count, ordinal-like and cardinal-like readings.
- [ ] **Step 6:** Document Add/Mul/Order only at the actually proven level.
- [ ] **Step 7:** State clearly whether this is a derived-theory correction or accepted-MTS semantic delta.
- [ ] **Step 8:** Update glossary terminology and cross-links.
- [ ] **Step 9:** Run docs/structure/CI gates and merge through repo-guard.

### Task 10: N8 final control-plane cleanup

**Files:**
- GitHub Issues/PR metadata and roadmap comments.

**Interfaces:**
- Consumes: all completed Nat re-foundation work.
- Produces: coherent source of truth with no stale arithmetic status.

- [ ] **Step 1:** Update/close superseded old arithmetic issues without deleting historical evidence.
- [ ] **Step 2:** Update #1019 ladder statuses.
- [ ] **Step 3:** Update #999 proof-calculus boundary.
- [ ] **Step 4:** Update #657 candidate/no-candidate state.
- [ ] **Step 5:** Update Mathlib #969/#983 only if their active theorem assumptions are affected.
- [ ] **Step 6:** Confirm the canonical Nat chapter, glossary, Issues and executable tests agree.
