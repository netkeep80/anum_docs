# K1e Proof-subAnet Projection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement approved K1e Variant A so a reusable structural schema can read-only select the unique exact `ProofOccurrence` already validated inside a supplied CLOSED K1 proof, then rerun T4 without any new proof carrier, primitive promotion, or accepted-MTS semantic delta.

**Architecture:** First refactor the existing K1 candidate-law replay so both structural and recursive-identity candidates expose one shared validated `ProofOccurrence -> Claim` closure, with candidate-local state committed only after the existing `0/1/>1` proof-law selection succeeds. Then add a separate read-only K1e projection binder that uses an existing `StructuralDerivationRule` only as schema topology, infers all role bindings from the single premise claim, and uniquely matches the instantiated conclusion against the K1-validated closure. K1e never constructs a proof occurrence and never scans ambient Memory.

**Tech Stack:** TypeScript 5.9, `Memory`/`ReadMemory`, existing MTS structural rule/derivation topology, exact-sequence, recursive Link identity replay, rooted K1 replay, Node test runner.

**Spec:** GitHub issue `netkeep80/anum_docs#1113` — approved Variant A is the source of truth.

## Global Constraints

- Accepted MTS stays exactly `v0.11`.
- Active semantic candidate stays exactly `NONE`.
- Expected classification: `proof-calculus capability delta = YES`, `observable accepted MTS semantic delta = NONE`.
- Do not modify `contracts/**`, `cutover/**`, `traceability/**`, or `repo-policy.json`.
- If implementation requires an observable accepted-MTS semantic change: STOP and route evidence to `#995`; do not invent `v0.12`.
- K1e adds no proof carrier, proof kind, selector enum, callback registry, trusted host rho/Map, primitive projection Rule/DR, T4/Nat/Succ branch, second proof graph, or second proof-law dispatcher.
- K1e authority is only: approved schema topology + premise-derived complete substitution + exact K1-validated reachability + unique exact match.
- Projection result is the same existing `ProofOccurrence` handle; no new proof occurrence is materialized.
- Projection selection is fail-closed: `0 -> projection-not-found`, `1 -> return exact occurrence`, `>1 -> ambiguous-projection`.
- Rooted K1 keeps its accepted proof-law law exactly: `0 valid laws -> invalid-proof-occurrence`, `1 -> accept`, `>1 -> ambiguous-proof-support`.
- Replay stays read-only and exact Theory revision stays unchanged.
- T4 rerun is forbidden until the generic non-Nat K1e corpus and security corpus are GREEN.
- Aprover remains WAIT; this plan does not trigger downstream work.

---

## File Structure

- Modify `ts/src/recursive-link-identity-proof.ts`
  - Expose the exact identity-law validated occurrence closure produced by the existing recursive identity replay itself.
  - Do not add a second traversal.
- Modify `ts/src/rooted-proof-aset.ts`
  - Factor one shared K1 occurrence candidate core.
  - Add a CLOSED occurrence replay surface for K1e.
  - Keep existing rooted target-assumption handling and structural `occurrenceCount` semantics unchanged.
- Create `ts/src/proof-subanet-projection.ts`
  - Implement the K1e read-only schema/substitution/validated-closure/unique-match binder.
- Create `ts/test/proof-subanet-projection.test.ts`
  - RED-first generic non-Nat positive and security corpus.
- Modify `ts/test/rooted-proof-aset-mixed-identity.test.ts`
  - Lock K1 shared-closure behavior and existing regression semantics.
- Modify `ts/test/derived-t4-successor-injective-proof-anet.test.ts`
  - Only after generic K1e is GREEN, rerun exact T4 through the generic K1e binder.

---

### Task 1: Expose recursive-identity validated closure from the existing identity replay

**Files:**
- Modify: `ts/src/recursive-link-identity-proof.ts`
- Modify: `ts/test/rooted-proof-aset-mixed-identity.test.ts`

**Interfaces:**
- Produces: `RecursiveLinkIdentityProofReplayResult.validatedOccurrences: ReadonlyMap<LinkHandle, LinkHandle>` where each entry is exact `ProofOccurrence -> Claim` accepted by the existing recursive identity verifier.
- Preserves: existing `proofRoot`, `left`, `right`, `verifiedOccurrenceCount` behavior and all current identity error codes.

- [ ] **Step 1: Write the failing closure-observability assertions**

Extend the existing arbitrary non-Nat identity control in `rooted-proof-aset-mixed-identity.test.ts` so it requires the existing replay result to expose exact accepted occurrences:

```ts
const identityReplay = replayRecursiveLinkIdentityProofAset(memory, xProof);
same(identityReplay.validatedOccurrences.get(xProof), identityClaim, "identity root enters validated closure");
same(
  identityReplay.validatedOccurrences.get(startProof),
  memory.poles(startProof).start,
  "identity start child enters validated closure",
);
same(
  identityReplay.validatedOccurrences.get(endProof),
  memory.poles(endProof).start,
  "identity end child enters validated closure",
);
assert(
  !identityReplay.validatedOccurrences.has(unrelatedProof),
  "unreachable identity proof has zero closure authority",
);
```

Keep the unrelated-proof assertion after `unrelatedProof` is created; do not create or discover proof links inside replay.

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
cd ts
npm run build --silent
node dist/test/rooted-proof-aset-mixed-identity.test.js
```

Expected RED: TypeScript build fails because `validatedOccurrences` does not yet exist on `RecursiveLinkIdentityProofReplayResult`.

- [ ] **Step 3: Replace the identity verifier's private Set with an exact occurrence->claim Map**

In `recursive-link-identity-proof.ts`, extend `ReadOccurrence` with the already-read claim handle and change the verifier cache from a `Set` to a `Map`:

```ts
interface ReadOccurrence {
  readonly claim: LinkHandle;
  readonly left: LinkHandle;
  readonly right: LinkHandle;
  readonly children: readonly LinkHandle[];
}

export interface RecursiveLinkIdentityProofReplayResult {
  readonly proofRoot: LinkHandle;
  readonly left: LinkHandle;
  readonly right: LinkHandle;
  readonly verifiedOccurrenceCount: number;
  readonly validatedOccurrences: ReadonlyMap<LinkHandle, LinkHandle>;
}
```

`readOccurrence()` must return the exact `claim` it already obtains from `memory.poles(occurrence).start`.

Use:

```ts
const verified = new Map<LinkHandle, LinkHandle>();
```

After a child-complete identity occurrence is accepted:

```ts
verified.set(occurrence, data.claim);
```

Return a defensive read-only operational projection:

```ts
validatedOccurrences: new Map(verified),
```

Do not enumerate `memory.allLinks`, outgoing/incoming incidence, or ambient proof links.

- [ ] **Step 4: Run recursive identity and mixed-rooted tests GREEN**

Run:

```bash
cd ts
npm run build --silent
node dist/test/recursive-link-identity-proof.test.js
node dist/test/rooted-proof-aset-mixed-identity.test.js
```

Expected: PASS; exact read-only and malformed identity behavior unchanged.

- [ ] **Step 5: Commit Task 1**

```bash
git add ts/src/recursive-link-identity-proof.ts ts/test/rooted-proof-aset-mixed-identity.test.ts
git commit -m "refactor(proofs): expose validated identity occurrence closure"
```

---

### Task 2: Factor one shared K1 candidate-law closure core and add CLOSED occurrence replay

**Files:**
- Modify: `ts/src/rooted-proof-aset.ts`
- Modify: `ts/test/rooted-proof-aset-mixed-identity.test.ts`

**Interfaces:**
- Produces:

```ts
export interface ClosedProofOccurrenceClosureReplayResult {
  readonly theory: LinkHandle;
  readonly occurrence: LinkHandle;
  readonly claim: LinkHandle;
  readonly validatedOccurrences: ReadonlyMap<LinkHandle, LinkHandle>;
}

export function replayClosedProofOccurrenceClosure(
  memory: ReadMemory,
  input: Readonly<{ theory: LinkHandle; occurrence: LinkHandle }>,
): ClosedProofOccurrenceClosureReplayResult;
```

- Existing `replayStructuralRootedProofAset()` must use the same internal candidate-law function for every non-assumption dependency.
- Existing rooted `occurrenceCount` remains structural-only, so accepted K1 output does not silently change merely because identity descendants become observable to K1e.

- [ ] **Step 1: Write RED tests for the new CLOSED K1 surface**

In `rooted-proof-aset-mixed-identity.test.ts`, add exact checks after constructing `xProof` and the mixed structural root:

```ts
const identityClosure = replayClosedProofOccurrenceClosure(memory, {
  theory,
  occurrence: xProof,
});
same(identityClosure.claim, identityClaim, "closed identity exact Claim");
same(identityClosure.validatedOccurrences.get(xProof), identityClaim, "closed identity root reachable");
same(identityClosure.validatedOccurrences.get(startProof), memory.poles(startProof).start,
  "closed identity child reachable");

const structuralClosure = replayClosedProofOccurrenceClosure(memory, {
  theory,
  occurrence: resultOccurrence,
});
same(structuralClosure.claim, resultClaim, "closed structural exact Claim");
same(structuralClosure.validatedOccurrences.get(resultOccurrence), resultClaim,
  "closed structural root reachable");
same(structuralClosure.validatedOccurrences.get(xProof), identityClaim,
  "mixed identity dependency closure reused by same K1 core");
```

Also create a foreign Theory with no primitive admissions and require the structural parent to fail:

```ts
const foreignTheory = fresh();
expectRootedFailure(
  "closed structural parent under foreign Theory",
  "primitive-rule-not-admitted",
  () => replayClosedProofOccurrenceClosure(memory, { theory: foreignTheory, occurrence: resultOccurrence }),
);
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
cd ts
npm run build --silent
node dist/test/rooted-proof-aset-mixed-identity.test.js
```

Expected RED: missing export `replayClosedProofOccurrenceClosure`.

- [ ] **Step 3: Refactor K1 replay state so candidate effects are committed only after unique law selection**

Inside `rooted-proof-aset.ts`, introduce one internal replay state containing:

```ts
interface ProofReplayState {
  readonly validated: Map<LinkHandle, LinkHandle>;
  readonly structuralOccurrences: Set<LinkHandle>;
  readonly usedPremises: Set<LinkHandle>;
}
```

The identity candidate must call only `replayRecursiveLinkIdentityProofAset()` and stage its returned `validatedOccurrences` in candidate-local state.

The structural candidate must stage its recursive structural/dependency effects in candidate-local state.

The common candidate selector must preserve exactly:

```ts
0 accepted candidates -> fail("invalid-proof-occurrence")
1 accepted candidate  -> commit only that candidate state and return its exact Claim
>1 accepted candidates -> fail("ambiguous-proof-support")
```

Do not merge identity closure before knowing the structural candidate failed. This prevents an ambiguous occurrence from leaking descendants into the authoritative closure.

- [ ] **Step 4: Preserve target-assumption handling as a resolver, not as a second proof law**

The shared internal verifier may accept an optional resolver used only by `replayStructuralRootedProofAset()`:

```ts
type AssumptionResolver = (occurrence: LinkHandle) => LinkHandle | undefined;
```

For the rooted target replay, the resolver implements the existing accepted rule only:

```ts
const poles = memory.poles(occurrence);
if (poles.end === targetIdentity && targetPremises.has(poles.start)) {
  usedPremises.add(poles.start);
  return poles.start;
}
return undefined;
```

Resolved assumptions are not inserted into `validatedOccurrences` because they are placeholders, not closed proof occurrences.

`replayClosedProofOccurrenceClosure()` supplies no assumption resolver; therefore any open placeholder fails closed.

- [ ] **Step 5: Implement the public CLOSED wrapper**

The wrapper must snapshot `memory.linkCount`, invoke the same candidate core with no assumption resolver, and return:

```ts
Object.freeze({
  theory: input.theory,
  occurrence: input.occurrence,
  claim,
  validatedOccurrences: new Map(state.validated),
});
```

Any write must still fail with `replay-wrote`.

- [ ] **Step 6: Preserve existing rooted result semantics**

`replayStructuralRootedProofAset()` must continue returning:

```ts
occurrenceCount: state.structuralOccurrences.size,
declaredAssumptionCount: targetPremises.size,
usedAssumptionCount: state.usedPremises.size,
```

This preserves the existing accepted assertion that identity sub-Anets do not alter structural occurrence accounting.

- [ ] **Step 7: Run K1 regression corpus GREEN**

Run:

```bash
cd ts
npm run build --silent
node dist/test/rooted-proof-aset.test.js
node dist/test/rooted-proof-aset-mixed-identity.test.js
node dist/test/derived-generic-heterogeneous-proof-anet.test.js
node dist/test/derived-generic-heterogeneous-open-rooted-instance.test.js
node dist/test/derived-generic-heterogeneous-closed-rooted-instance.test.js
```

Expected: all PASS with unchanged existing markers.

- [ ] **Step 8: Commit Task 2**

```bash
git add ts/src/rooted-proof-aset.ts ts/test/rooted-proof-aset-mixed-identity.test.ts
git commit -m "refactor(proofs): share closed K1 occurrence replay closure"
```

---

### Task 3: Implement generic non-Nat K1e projection binder RED-first

**Files:**
- Create: `ts/src/proof-subanet-projection.ts`
- Create: `ts/test/proof-subanet-projection.test.ts`

**Interfaces:**
- Consumes: `replayClosedProofOccurrenceClosure`, `readStructuralDerivationRule`, `readStructuralRule`, `readStructuralRoleDictionary`, `inferStructuralSubstitution`.
- Produces:

```ts
export interface ProofSubAnetProjectionEvidence {
  readonly theory: LinkHandle;
  readonly schemaDerivationRule: LinkHandle;
  readonly premiseProofOccurrence: LinkHandle;
}

export interface ProofSubAnetProjectionReplayResult {
  readonly theory: LinkHandle;
  readonly schemaDerivationRule: LinkHandle;
  readonly premiseProofOccurrence: LinkHandle;
  readonly premiseClaim: LinkHandle;
  readonly projectedOccurrence: LinkHandle;
  readonly projectedClaim: LinkHandle;
  readonly bindings: readonly StructuralSubstitutionBinding[];
}

export type ProofSubAnetProjectionReplayErrorCode =
  | "invalid-schema"
  | "unsupported-premise-arity"
  | "unbound-schema-role"
  | "premise-template-mismatch"
  | "invalid-parent-proof-occurrence"
  | "projection-not-found"
  | "ambiguous-projection"
  | "replay-wrote";
```

The evidence has deliberately no `projectedOccurrence`, selector, proof kind, callback, or host rho input field.

- [ ] **Step 1: Write the generic RED test before production code**

Create `proof-subanet-projection.test.ts` using arbitrary ROOT-grounded finite relations only. Build at least these identity shapes:

```text
FULL      R = R
START     start-self-closed relation identity
END       end-self-closed relation identity
ORDINARY  ordinary relation identity
```

For the primary control define an existing structural schema with Roles `X,Y`:

```ts
const dictionary = defineStructuralRoleDictionary(memory, [X, Y]);
const premiseTemplate = memory.ensure(memory.ensure(X, Y), memory.ensure(X, Y));
const conclusionTemplate = memory.ensure(X, X);
const rule = defineStructuralRule(memory, dictionary, conclusionTemplate);
const schemaDR = defineStructuralDerivationRule(memory, rule, [premiseTemplate]);
```

Do **not** admit `rule` or `schemaDR` to Theory.

Supply a valid ordinary relation identity proof as `premiseProofOccurrence` and require:

```ts
const replay = replayProofSubAnetProjection(memory, {
  theory,
  schemaDerivationRule: schemaDR,
  premiseProofOccurrence: relationProof,
});

same(replay.projectedOccurrence, startProof, "K1e returns exact existing start proof occurrence");
same(replay.projectedClaim, memory.poles(startProof).start, "K1e returns exact existing start Claim");
same(replay.bindings.length, 2, "all schema Roles inferred from premise");
```

The fixture must assert the returned handle was allocated before projection replay and `memory.linkCount` is unchanged.

- [ ] **Step 2: Run the generic test and verify RED**

Run:

```bash
cd ts
npm run build --silent
node dist/test/proof-subanet-projection.test.js
```

Expected RED: missing module/export `replayProofSubAnetProjection`.

- [ ] **Step 3: Implement schema reading without primitive admission authority**

In `proof-subanet-projection.ts`:

1. Read `schemaDerivationRule` structurally.
2. Read its `StructuralRule` and RoleDictionary structurally.
3. Require exactly one premise template; zero or more than one -> `unsupported-premise-arity`.
4. Never call `memory.find(theory, schemaRule)` or `memory.find(theory, schemaDerivationRule)`.

Any malformed structural topology -> `invalid-schema`.

- [ ] **Step 4: Replay the parent through the shared CLOSED K1 core**

Call:

```ts
const parent = replayClosedProofOccurrenceClosure(memory, {
  theory: evidence.theory,
  occurrence: evidence.premiseProofOccurrence,
});
```

Map K1 replay rejection to `invalid-parent-proof-occurrence`, except any write condition must remain `replay-wrote`.

This is the only source of authoritative reachable proof occurrences.

- [ ] **Step 5: Infer complete substitution from premise only**

Call `inferStructuralSubstitution()` with exactly one constraint:

```ts
[{ template: premiseTemplate, actual: parent.claim }]
```

and `{ requireAll: true }`.

Map:

```text
missing-role-binding -> unbound-schema-role
template-mismatch    -> premise-template-mismatch
duplicate-role       -> invalid-schema
replay-wrote         -> replay-wrote
```

No caller-supplied rho is accepted.

- [ ] **Step 6: Match the conclusion against only the validated K1 closure without materialization**

For each exact `[occurrence, claim]` in `parent.validatedOccurrences`, test the combined constraints read-only:

```ts
inferStructuralSubstitution(
  memory,
  roles,
  [
    { template: premiseTemplate, actual: parent.claim },
    { template: rule.body, actual: claim },
  ],
  { requireAll: true },
);
```

A candidate matches only if inference succeeds with the same premise-derived complete bindings. Because all Roles were already required from the premise, the conclusion cannot invent a new role value.

Collect distinct matching occurrence handles in a Set only after they came from `parent.validatedOccurrences`.

Do not search Memory, raw descendants, ambient `Parent->Child` Links, allocation IDs, or host arrays.

- [ ] **Step 7: Apply exact `0/1/>1` projection law**

Implement:

```ts
if (matches.length === 0) fail("projection-not-found");
if (matches.length > 1) fail("ambiguous-projection");
```

For exactly one match return that same existing occurrence handle and its exact claim.

- [ ] **Step 8: Run the generic positive corpus GREEN**

Exercise constructible FULL/START/END/ORDINARY closures. The production binder must not know which shape was used and must not contain `child[0]` logic.

Run:

```bash
cd ts
npm run build --silent
node dist/test/proof-subanet-projection.test.js
```

Expected marker:

```text
K1E_GENERIC_PROOF_SUBANET_PROJECTION = SUPPORTED
```

- [ ] **Step 9: Commit Task 3**

```bash
git add ts/src/proof-subanet-projection.ts ts/test/proof-subanet-projection.test.ts
git commit -m "feat(proofs): add topology-derived proof-subAnet projection"
```

---

### Task 4: Complete the K1e negative/security corpus

**Files:**
- Modify: `ts/test/proof-subanet-projection.test.ts`
- Modify only if a generic bug is exposed: `ts/src/rooted-proof-aset.ts`, `ts/src/proof-subanet-projection.ts`, `ts/src/recursive-link-identity-proof.ts`

**Interfaces:**
- No new authority-bearing interface is allowed in this task.

- [ ] **Step 1: Invalid parent and foreign Theory**

Add cases:

```text
malformed recursive identity parent -> invalid-parent-proof-occurrence
structural parent with correct Theory -> accepted K1 parent replay
same structural parent with foreign Theory lacking primitive admissions -> invalid-parent-proof-occurrence
```

- [ ] **Step 2: Schema arity and role binding failures**

Add exact cases:

```text
0 premise templates -> unsupported-premise-arity
2 premise templates -> unsupported-premise-arity
Role present only in conclusion -> unbound-schema-role
inconsistent repeated Role in premise -> premise-template-mismatch
```

- [ ] **Step 3: Reachability attacks have zero authority**

Construct a valid same-Claim proof occurrence outside the parent K1 closure and require it never affects selection.

Also create:

```ts
memory.ensure(parentProofOccurrence, unreachableSameClaimProof);
```

and require the ambient link to have zero effect.

Projection must remain `projection-not-found` when the only matching proof is ambient/unreachable.

- [ ] **Step 4: Host-decorated evidence has zero authority**

Call the binder through an object widened with forbidden host fields:

```ts
const decorated = Object.freeze({
  theory,
  schemaDerivationRule: schemaDR,
  premiseProofOccurrence: parentProof,
  projectedOccurrence: unreachableSameClaimProof,
  rho: new Map([[X, someValue]]),
  projectionKind: "start",
});
```

Pass it as `ProofSubAnetProjectionEvidence & Record<string, unknown>` and require exactly the same result/error as the undecorated evidence.

- [ ] **Step 5: Schema admission is irrelevant**

On one fixture run projection while both schema Rule and DR are unadmitted.

Then add ambient admissions:

```ts
admitStructuralRule(memory, theory, schemaRule);
admitStructuralDerivationRule(memory, theory, schemaDR);
```

Rerun and require the exact same projected occurrence and bindings. The admissions may exist in Memory but confer zero K1e authority.

- [ ] **Step 6: No-match and ambiguous-match fail closed**

Create one schema whose body has no claim in the validated closure -> `projection-not-found`.

Construct a structural parent whose validated dependency closure contains two distinct valid `ProofOccurrence` handles with the same exact matching Claim, using two separately admitted primitive DR supports. Require:

```text
ambiguous-projection
```

Do not let traversal or allocation order choose one.

- [ ] **Step 7: Lock read-only and exact Theory revision**

Compute portable Theory revision before and after successful and failed K1e replays and require identical scheme/value. Also require exact `memory.linkCount` equality across every replay.

- [ ] **Step 8: Static genericity checks**

Run:

```bash
grep -nE 'replayDecomposeEqualRelations|Nat|Succ|T4|child\[0\]|projectionKind|startSelector|endSelector' \
  ts/src/proof-subanet-projection.ts
```

Expected: no output.

Run:

```bash
grep -nE 'allLinks|incoming|outgoing' ts/src/proof-subanet-projection.ts
```

Expected: no output.

- [ ] **Step 9: Run K1/K1d2/K1d3/K1d4 regression corpus**

Run:

```bash
cd ts
npm run build --silent
node dist/test/rooted-proof-aset.test.js
node dist/test/rooted-proof-aset-mixed-identity.test.js
node dist/test/derived-generic-heterogeneous-proof-anet.test.js
node dist/test/derived-generic-heterogeneous-open-rooted-instance.test.js
node dist/test/derived-generic-heterogeneous-closed-rooted-instance.test.js
node dist/test/derived-t4-successor-injective-proof-anet.test.js
```

At this stage the old T4 test must still report its existing GAP because Task 5 has not rerun T4 through K1e yet. Generic K1e itself must be GREEN.

- [ ] **Step 10: Commit Task 4**

```bash
git add ts/test/proof-subanet-projection.test.ts ts/src/rooted-proof-aset.ts ts/src/proof-subanet-projection.ts ts/src/recursive-link-identity-proof.ts
git commit -m "test(proofs): lock K1e projection security invariants"
```

Only add production files to the commit if a generic defect required a fix.

---

### Task 5: Rerun exact T4 through generic K1e only after generic GREEN

**Files:**
- Modify: `ts/test/derived-t4-successor-injective-proof-anet.test.ts`

**Interfaces:**
- Consumes: `replayProofSubAnetProjection()` only.
- Produces no T4/Nat/Succ production API.

- [ ] **Step 1: Replace the exact post-K1d4 GAP assertion with K1e application**

Keep the already-proven recursive identity and K1d4 controls.

For the T4 schema use the existing topology:

```ts
roles   = [A, B]
premise = (A -> L) -> (B -> L)
body    = A -> B
```

Do not admit the T4 Rule/DR.

Call:

```ts
const t4Projection = replayProofSubAnetProjection(memory, {
  theory,
  schemaDerivationRule: t4TargetDR,
  premiseProofOccurrence: successorProof,
});
```

Require:

```ts
same(t4Projection.projectedOccurrence, aProof, "T4 K1e returns exact existing P(a,a)");
same(t4Projection.projectedClaim, startClaim, "T4 K1e exact conclusion Claim");
```

Assert bindings are exactly `A=a`, `B=a` in declared Role order.

- [ ] **Step 2: Reassert absence of primitive promotion**

Keep/assert:

```ts
memory.find(theory, t4TargetRule) === undefined
memory.find(theory, t4TargetDR) === undefined
memory.find(theory, localRule) === undefined
memory.find(theory, localDR) === undefined
```

No `Theory -> T4` or ordered-pole admission may appear.

- [ ] **Step 3: Update exact executable markers**

On GREEN emit:

```text
T4_SUCCESSOR_INJECTIVITY_STRUCTURE = SUPPORTED
IDENTITY_POLE_SUBANET_PROJECTION = SUPPORTED
K1D4_PROJECTED_PROOF_ASSUMPTION_DISCHARGE = SUPPORTED
K1E_TOPOLOGY_DERIVED_PROOF_SUBANET_PROJECTION = SUPPORTED
T4_PROOF_ANET = SUPPORTED
T4_REUSE = NOT TESTED
T4_PRIMITIVE_PROMOTION = NOT USED
accepted semantic delta = NONE
```

Do not claim `T4_REUSE = SUPPORTED` in this task.

- [ ] **Step 4: Run exact T4 and generic K1e tests GREEN**

Run:

```bash
cd ts
npm run build --silent
node dist/test/proof-subanet-projection.test.js
node dist/test/derived-t4-successor-injective-proof-anet.test.js
```

Expected: both PASS and markers above.

- [ ] **Step 5: Commit Task 5**

```bash
git add ts/test/derived-t4-successor-injective-proof-anet.test.ts
git commit -m "test(nat-proofs): rerun T4 through generic K1e projection"
```

---

### Task 6: Full verification, PR governance, and control-plane update

**Files:**
- No semantic-contract files.
- Update GitHub issue comments only after exact evidence exists.

**Interfaces:**
- Produces accepted evidence only after CI/repo-guard and merge.

- [ ] **Step 1: Run the full TypeScript repository check**

Run:

```bash
cd ts
npm run check
```

Expected: PASS.

- [ ] **Step 2: Verify forbidden paths are untouched**

Run:

```bash
git diff --name-only 787e715d1b0cda6537fe3850821f813ba282c390...HEAD
```

Expected changed paths are limited to:

```text
docs/superpowers/plans/2026-09-08-k1e-proof-subanet-projection.md
ts/src/recursive-link-identity-proof.ts
ts/src/rooted-proof-aset.ts
ts/src/proof-subanet-projection.ts
ts/test/rooted-proof-aset-mixed-identity.test.ts
ts/test/proof-subanet-projection.test.ts
ts/test/derived-t4-successor-injective-proof-anet.test.ts
```

No `contracts/**`, `cutover/**`, `traceability/**`, or `repo-policy.json` changes.

- [ ] **Step 3: Fresh-pin main before PR lifecycle mutation**

Verify `main` again. If it is no longer `787e715d1b0cda6537fe3850821f813ba282c390`, compare/rebase before any merge decision and rerun the full relevant corpus.

- [ ] **Step 4: Open implementation PR linked to #1113/#1064/#1066/#999**

PR body must state:

```text
K1e Variant A implementation
proof-calculus capability delta = YES
observable accepted MTS semantic delta = NONE
accepted MTS = v0.11
active semantic candidate = NONE
T4 reuse = NOT TESTED
aprover = WAIT
```

- [ ] **Step 5: Require CI + blocking repo-guard + exact-head race check**

Before merge require:

```text
CI = GREEN
blocking repo-guard = GREEN
mergeable = true
draft = false
behind_by = 0
exact PR head stable
```

Merge only with exact expected head SHA.

- [ ] **Step 6: Verify post-merge CI on the exact new main**

Do not mark K1e or T4 accepted from PR CI alone. Require post-merge CI on the exact merge commit.

- [ ] **Step 7: Update #1113 and #1064 only from accepted evidence**

After post-merge GREEN, comment exact SHAs/run IDs and only then transition:

```text
K1e implementation = ACCEPTED
T4 STRUCTURE = SUPPORTED
T4 PROOF_ANET = SUPPORTED
T4 REUSE = NOT TESTED
accepted semantic delta = NONE
```

Feed the same accepted result to #1066 and #999.

- [ ] **Step 8: Preserve downstream gate**

After K1e/T4 acceptance, next work is reusable T4 theorem/projection evidence and then T5 generic reuse. Do not start aprover yet.

The aprover trigger remains:

```text
T4 PROOF_ANET = SUPPORTED
AND accepted reusable T4 theorem/projection evidence exists
AND T5 generic reuse path is ready
```

Only when all three are true tell the user exactly:

```text
сейчас запускай агента в aprover
```
