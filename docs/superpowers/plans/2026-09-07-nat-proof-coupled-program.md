# Nat + Proof Calculus Coupled Program Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the first reusable Peano theorem suite while developing Nat structure and generic MTS proof calculus in parallel without conflating mathematical truth, proof expressibility, or theorem reuse.

**Architecture:** #1052 owns Nat truth, #999 owns proof-calculus semantics, and #1057 synchronizes them through theorem challenges classified independently as STRUCTURE / PROOF_ANET / REUSE. Each executable theorem is a bounded child with its own ChangeIntent and can only change generic proof machinery when a structural theorem is already supported but proof replay exposes a generic gap.

**Tech Stack:** TypeScript MTS core/tests, MTS Links/Anets, GitHub Issues/PRs, repo-guard blocking policy, GitHub Actions CI.

**Spec:** `docs/superpowers/specs/2026-09-07-nat-proof-coupled-program-design.md`

## Global Constraints

- Accepted MTS remains `v0.11` unless a separate semantic-delta lifecycle is explicitly opened.
- Active semantic candidate remains `NONE` during W1.
- New prose uses `Anet`; technical `Aset -> Anet` migration is owned by #1049 and is not mixed into theorem behavior slices.
- No host integer, Nat class, Ordinal/Cardinal kind, theorem-specific trusted opcode, `InductionNode`, `forall`, `lambda`, or `Predicate<T>` may become authority.
- MTS Links/Anets and exact Theory topology remain semantic/proof authority; host structures are projections only.
- Every repository-file write uses explicit branch + PR flow.
- Every merge requires fresh main/Issue/PR/policy, CI GREEN, blocking repo-guard GREEN, `behind_by=0`, mergeable Ready PR, stable exact head, expected-head merge, and post-merge main + CI verification.
- Arithmetic L0/L1/COMM remain paused until W3/W4/W5 re-entry on the selected Nat theory.

---

### Task 1: Synchronize the GitHub control plane

**Files:**
- Modify: none

**Interfaces:**
- Consumes: #1052, #999, #1019, #1050/#1051, #1053, #1057.
- Produces: one unambiguous ownership/status map used by all later tasks.

- [ ] **Step 1: Fresh-read state**

Read exact `main`, `repo-policy.json`, #1052, #999, #1019, #1050, PR #1051, PR #1053, and #1057.

- [ ] **Step 2: Update #1052**

Add the coupled-program boundary:

```text
TRACK N authority remains here.
Theorem work is synchronized by #1057.
Each theorem records STRUCTURE independently from PROOF_ANET/REUSE.
W1 = active Nat structural theorem suite.
```

- [ ] **Step 3: Update #999**

Add:

```text
TRACK P authority remains here.
Nat theorem challenges from #1057 are the preferred proving ground.
A mathematical theorem may expose a generic proof gap but may never authorize Nat-specific trusted behavior.
```

- [ ] **Step 4: Update #1019**

Record:

```text
N2a/N2b/generic induction research = preserved.
L0/L1/COMM = PAUSED.
Re-entry is W3/W4/W5 under #1057 after selected Nat carrier/theory is established.
```

- [ ] **Step 5: Narrow #1050/#1051**

Ensure #1050/#1051 is classified strictly as generic weakening:

```text
UsedPremises ⊆ DeclaredPremises
```

Any old-Nat L0 rerun is diagnostic only and must not advance arithmetic status.

- [ ] **Step 6: Update #1053 chapter PR**

Add #1057 as the program owner and require the chapter to distinguish:

```text
STRUCTURE
PROOF_ANET
REUSE
```

- [ ] **Step 7: Re-read all modified Issues/PRs**

Verify no owner claims contradictory active status for L0/L1/COMM or semantic candidate/version.

---

### Task 2: Finish generic rooted proof-Anet weakening independently of Nat

**Files:**
- Modify: `ts/src/rooted-proof-aset.ts`
- Modify: `ts/test/rooted-proof-aset.test.ts`
- Modify: `docs/specs/Асеть доказательства МТС.md`
- Do not use old arithmetic fixture acceptance as completion evidence.

**Interfaces:**
- Consumes: current PR #1051 test/production work.
- Produces: generic rooted replay law `UsedPremises ⊆ DeclaredPremises` and exact declared/used diagnostics.

- [ ] **Step 1: Fresh-read #1050/#1051 and exact head**

Confirm existing RED/GREEN evidence remains intact after main movement.

- [ ] **Step 2: Ensure undeclared reachable premise remains rejected**

Test shape:

```text
TargetDR premises = [A]
reachable external H = EXTRA
expected = reject
```

The rejection must prove weakening is one-directional only.

- [ ] **Step 3: Remove/neutralize arithmetic acceptance coupling**

If `derived-l0-left-zero-rerun.test.ts` is still touched, its output may only say that the historical fixture was observed; it must not set current Nat/L0 program status.

- [ ] **Step 4: Synchronize proof specification**

Document exactly:

```text
declared target context != used support
UsedPremises ⊆ DeclaredPremises
primitive premise slots remain exact
```

- [ ] **Step 5: Run full CI and repo-guard**

Expected: all generic proof tests GREEN; no Nat semantic/version delta.

- [ ] **Step 6: Merge exact head and verify push CI**

Feed generic result to #999 and #1057, not as arithmetic completion.

---

### Task 3: W1a structural challenge T3 — Zero is not successor

**Files:**
- Create: `ts/test/nat-peano-zero-not-successor.test.ts`
- Production: none unless a genuine generic foundation gap is proven and separately designed.

**Interfaces:**
- Consumes: `N0=U`, `Succ(N)=N⟼L`, accepted root basis and Link identity/self-closure laws.
- Produces: `STRUCTURE(T3)` classification only.

- [ ] **Step 1: Open bounded T3 Issue/ChangeIntent**

Scope only the new test file; forbid `ts/src/**`, contracts, docs, policy.

- [ ] **Step 2: Write finite/adversarial structural falsifier**

Construct ordinary Link samples `N0..Nk` from:

```ts
const nat: LinkHandle[] = [U];
for (let i = 0; i < 8; i += 1) nat.push(memory.ensure(nat.at(-1)!, L));
```

For every tested predecessor `N` assert:

```ts
assert(memory.ensure(N, L) !== U, "successor collapsed to zero boundary");
```

Also inspect exact poles of each successor.

- [ ] **Step 3: Run full test suite**

Expected finite classification:

```text
T3 STRUCTURE_FINITE = SUPPORTED
```

Do not claim a general theorem from finite enumeration alone.

- [ ] **Step 4: Identify the general structural proof obligation**

Determine whether accepted laws already imply:

```text
N⟼L != U
```

for arbitrary Link `N`, especially via the exact identity/topology of `U` and self-closure laws. If not derivable, classify the precise foundation theorem gap; do not patch Memory.

- [ ] **Step 5: Merge only the falsifier/evidence slice**

Record `STRUCTURE=SUPPORTED` only if the general argument is separately justified; otherwise retain `STRUCTURE=NOT TESTED` with finite evidence explicitly labeled.

---

### Task 4: W1a structural challenge T4 — Successor injectivity

**Files:**
- Create: `ts/test/nat-peano-successor-injective.test.ts`
- Production: none expected.

**Interfaces:**
- Consumes: ordered-pole identity law for Links.
- Produces: structural theorem target later consumed by proof-Anet challenge.

- [ ] **Step 1: Open bounded T4 structure Issue/ChangeIntent**

The statement is generic over Links; Nat membership is not required for injectivity itself.

- [ ] **Step 2: Write exact structural corpus**

For unrelated `A`, `B`, and shared `L`, test construction identity and pole recovery:

```ts
const sA = memory.ensure(A, L);
const sB = memory.ensure(B, L);
if (sA === sB) {
  const pA = memory.poles(sA);
  const pB = memory.poles(sB);
  assert(pA.start === pB.start);
  assert(A === B);
}
```

Include negative samples with `A !== B` and assert `sA !== sB`.

- [ ] **Step 3: Tie result to accepted identity invariant**

Write the mathematical argument in the Issue:

```text
(A⟼L)=(B⟼L)
=> A=B and L=L
=> A=B
```

The executable corpus is evidence, not the source of the general law.

- [ ] **Step 4: CI/repo-guard/merge**

Expected classification:

```text
T4 STRUCTURE = SUPPORTED
PROOF_ANET = NOT TESTED
REUSE = NOT TESTED
```

---

### Task 5: W1b proof-Anet challenge for T4

**Files:**
- Prefer create: `ts/test/nat-peano-successor-injective-proof.test.ts`
- Modify generic proof-calculus production only if a RED exposes a general gap and a separate bounded child design is approved.

**Interfaces:**
- Consumes: T4 structural theorem and current #999 proof machinery.
- Produces: replayable generic proof evidence for successor injectivity or exact `PROOF_ANET=GAP`.

- [ ] **Step 1: Open proof challenge Issue**

Explicitly lock:

```text
STRUCTURE(T4)=SUPPORTED
```

and forbid Nat-specific trusted code.

- [ ] **Step 2: Attempt test-only proof Anet**

Target contextual rule:

```text
Eq(A⟼L, B⟼L)
--------------
Eq(A,B)
```

Represent equality/identity dependencies using existing structural proof machinery only.

- [ ] **Step 3: Run RED or GREEN**

If current machinery rejects, capture the exact generic error code and classify:

```text
T4 PROOF_ANET = GAP(<exact mechanism>)
```

Do not modify mathematics.

- [ ] **Step 4: If a generic gap exists, open one bounded proof-calculus child**

The child must be theorem-neutral and prove its fix with at least one non-Nat control example.

- [ ] **Step 5: Replay T4 after any generic fix**

Expected eventual classification:

```text
T4 STRUCTURE = SUPPORTED
T4 PROOF_ANET = SUPPORTED
T4 REUSE = NOT TESTED
```

---

### Task 6: W1c reuse challenge T5 — Unique predecessor

**Files:**
- Prefer create: `ts/test/nat-peano-unique-predecessor-proof.test.ts`
- Modify generic reuse machinery only after exact RED classification and bounded approval.

**Interfaces:**
- Consumes: accepted reusable T4 proof evidence.
- Produces: first theorem whose proof should depend on another derived theorem without primitive promotion.

- [ ] **Step 1: Open T5 Issue with reuse as the primary gate**

Statement:

```text
A⟼L = N
B⟼L = N
-------------
A = B
```

- [ ] **Step 2: Build proof by composing equalities into a T4-shaped premise**

The proof must obtain:

```text
A⟼L = B⟼L
```

from the shared-result premises, then invoke/reuse T4 derived proof evidence.

- [ ] **Step 3: Forbid duplicate primitive derivation**

The fixture must make it observable whether T4 evidence is actually referenced/expanded. A second independently admitted injectivity rule is not allowed.

- [ ] **Step 4: Run and classify reuse**

Possible outcomes:

```text
REUSE=SUPPORTED
REUSE=GAP(<exact expansion/composition boundary>)
```

- [ ] **Step 5: If GAP, fix only generic theorem reuse**

Require a non-Nat reuse control in the same proof-calculus child.

- [ ] **Step 6: Merge and update W1 matrix**

W1 reusable suite is not complete until T5 uses T4 successfully.

---

### Task 7: Start W2 induction only after W1 reuse is proven

**Files:**
- New bounded child tests/issues determined after W1 evidence.

**Interfaces:**
- Consumes: W1 reusable theorem suite, generic weakening, cross-scope machinery from #1019/#999.
- Produces: structural/minimality and proof-Anet induction classification.

- [ ] **Step 1: Verify W1 gate**

Required:

```text
T4 STRUCTURE = SUPPORTED
T4 PROOF_ANET = SUPPORTED
T5 REUSE = SUPPORTED
```

- [ ] **Step 2: Separate induction mathematics from proof mechanism**

Open one structure owner for Nat minimality/induction and one proof challenge only after the structure statement is precise.

- [ ] **Step 3: Reuse existing generic machinery before adding anything new**

Attempt with role morphisms, cross-scope hypotheses, weakening, rooted proof Anets, and derived-schema expansion already present.

- [ ] **Step 4: Classify exact induction gap**

No trusted Nat/induction opcode may be introduced.

---

### Task 8: Continuously update the canonical Nat chapter

**Files:**
- Modify: `docs/theory/Натуральные числа, счёт и мера в МТС.md` through PR #1053 or its successor after rebase/merge.

**Interfaces:**
- Consumes: accepted theorem-challenge evidence only.
- Produces: human-readable canonical theory chapter with explicit research/accepted boundaries.

- [ ] **Step 1: Add program methodology**

Explain STRUCTURE / PROOF_ANET / REUSE.

- [ ] **Step 2: Add theorem matrix**

For every T1..T5 record exact status and evidence owner.

- [ ] **Step 3: Keep conceptual distinctions explicit**

Document:

```text
U = zero boundary / unlinked in counting interpretation
L = Link / unit of extent
Nat(1) = U⟼L
coordinate boundary != accumulated extent
historical L-degree != Nat carrier
```

- [ ] **Step 4: Update only from merged evidence**

Research hypotheses remain labeled as such until their structural/proof obligations are satisfied.