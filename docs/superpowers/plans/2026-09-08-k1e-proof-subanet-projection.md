# K1e Topology-Derived Proof-subAnet Projection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a generic, Nat-independent trusted read-only K1e binder that selects one exact already-existing `ProofOccurrence` from the K1-validated closure of a closed premise proof using a one-premise structural schema and a complete substitution inferred only from the premise Claim.

**Architecture:** Reuse the accepted K1 proof laws rather than adding a projection proof law. First expose the exact recursive-identity validated occurrence closure without changing the existing outward identity replay result; then factor a callback-free CLOSED K1 occurrence replay surface that uses the same identity/structural candidate selection law as rooted K1. K1e reads an existing one-premise `StructuralDerivationRule` only as schema data, infers all Role bindings from the premise Claim, and matches the body against Claims in the exact validated closure; `0/1/>1` matches fail closed.

**Tech Stack:** TypeScript 5.9, canonical `Memory`/`ReadMemory`, `ExactSequence`, structural Rule/DerivationRule readers, `inferStructuralSubstitution`, `matchStructuralTemplate`, accepted recursive Link-identity replay, accepted rooted K1, GitHub Actions, repo-guard.

**Spec:** GitHub #1113 (approved Variant A) + normative self-review `#issuecomment-5587778158` + user approval `#issuecomment-5587948808` + global review #1114. Production owner: #1116.

## Global Constraints

```text
accepted MTS = v0.11
active semantic candidate = NONE
proof-calculus capability delta = YES
observable accepted-MTS semantic delta = NONE

NO new proof carrier
NO new K1 proof law
NO callback/resolver seam in the CLOSED K1 core
NO second identity/structural proof walker outside K1
NO host projectedOccurrence authority
NO host rho / Map authority
NO projection kind / start-end selector
NO ProjectionSchema primitive-admission requirement
NO primitive ordered-pole/T4 Rule/DR promotion
NO T4/Nat/Succ-specific production branch
NO public.ts/package-root export in first K1e slice
NO T4 rerun inside the K1e acceptance PR
NO contracts/**
NO cutover/**
NO traceability/**
NO repo-policy.json
```

Preserve existing outward diagnostics:

```text
replayRecursiveLinkIdentityProofAset(...) result shape unchanged
replayStructuralRootedProofAset(...) result shape unchanged
rooted K1 occurrenceCount remains structural-occurrence count
rooted target assumptions remain explicit target topology, not a callback
```

If executable work requires observable accepted MTS semantic change:

```text
STOP -> #995
```

---

## Locked File Map

```text
MODIFY ts/src/recursive-link-identity-proof.ts
  add internal/module-level closure replay projection; existing outward API delegates to it

MODIFY ts/src/rooted-proof-aset.ts
  factor common structural-application validation and callback-free CLOSED K1 replay;
  keep existing rooted wrapper behavior and outward result unchanged

CREATE ts/src/proof-subanet-projection.ts
  trusted K1e one-premise projection binder; internal package surface only

CREATE ts/test/proof-subanet-projection.test.ts
  generic RED/GREEN + closure-shape + authority/security corpus

MODIFY ts/test/recursive-link-identity-proof.test.ts
  only to pin closure projection and unchanged outward identity replay

MODIFY ts/test/rooted-proof-aset-mixed-identity.test.ts
  only to pin closed-core/rooted-wrapper equivalence and unchanged K1 diagnostics
```

Strictly unchanged in K1e:

```text
ts/src/public.ts
ts/src/derived-derivation-heterogeneous.ts
ts/src/derived-derivation-heterogeneous-instance.ts
ts/src/derived-derivation-heterogeneous-discharge.ts
ts/src/derived-derivation-heterogeneous-discharge-materialize.ts
ts/src/structural-role-morphism.ts
ts/src/structural-substitution.ts
ts/src/proof.ts
ts/src/checker.ts
contracts/**
cutover/**
traceability/**
repo-policy.json
.github/**
```

---

### Task 1: RED — expose the generic proof-subAnet projection gap

**Files:**
- Create: `ts/test/proof-subanet-projection.test.ts`
- Production: none

**Interfaces:**
- Consumes existing `Memory`, `ensureRootBasis`, `materializeExactSequence`, structural Rule/DR constructors, and `replayRecursiveLinkIdentityProofAset`.
- Expects the not-yet-existing module/API:

```ts
import {
  replayProofSubAnetProjection,
} from "../src/proof-subanet-projection.js";
```

- [ ] **Step 1: write one ordinary non-Nat RED witness**

Construct an arbitrary ordinary relation and its accepted recursive identity proof:

```ts
const memory = new Memory();
const { R, O, C, L, U } = ensureRootBasis(memory);
const theory = memory.ensure(C, U);

const rootProof = identityProof(memory, R, R, []);
const oProof = identityProof(memory, O, O, [rootProof]);
const cProof = identityProof(memory, C, C, [rootProof]);
const lProof = identityProof(memory, L, L, [oProof, cProof]);
const uProof = identityProof(memory, U, U, [cProof, oProof]);

const left = memory.ensure(O, U);
const right = memory.ensure(C, L);
const leftProof = identityProof(memory, left, left, [oProof, uProof]);
const rightProof = identityProof(memory, right, right, [cProof, lProof]);
const relation = memory.ensure(left, right);
const relationProof = identityProof(memory, relation, relation, [leftProof, rightProof]);
replayRecursiveLinkIdentityProofAset(memory, relationProof);
```

Build a K1e schema entirely as existing structural topology, without admission:

```ts
const A = memory.ensure(L, R);
const B = memory.ensure(R, L);
const dictionary = defineStructuralRoleDictionary(memory, [A, B]);
const premiseTemplate = memory.ensure(memory.ensure(A, B), memory.ensure(A, B));
const conclusionTemplate = memory.ensure(A, A);
const rule = defineStructuralRule(memory, dictionary, conclusionTemplate);
const dr = defineStructuralDerivationRule(memory, rule, [premiseTemplate]);
```

Call the intended API:

```ts
const replay = replayProofSubAnetProjection(memory, {
  theory,
  schemaDerivationRule: dr,
  premiseProofOccurrence: relationProof,
});

same(replay.premiseClaim, memory.poles(relationProof).start, "exact premise Claim");
same(replay.projectedOccurrence, leftProof, "returns exact existing start proof occurrence");
same(replay.projectedClaim, memory.poles(leftProof).start, "exact projected Claim");
same(replay.bindings.length, 2, "A/B bound only from premise Claim");
```

- [ ] **Step 2: run the targeted RED**

Run:

```bash
npm --prefix ts run build
```

Expected first failure:

```text
TS2307: Cannot find module '../src/proof-subanet-projection.js'
```

If the first failure is different, record the exact boundary in #1116 before production work; do not weaken the witness.

- [ ] **Step 3: commit the RED test only and open a Draft PR**

```bash
git add ts/test/proof-subanet-projection.test.ts
git commit -m "test(proof-calculus): expose proof-subAnet projection gap"
```

Open a Draft PR and record exact RED head + CI run before adding production files.

---

### Task 2: Expose recursive identity validated closure without changing identity replay semantics

**Files:**
- Modify: `ts/src/recursive-link-identity-proof.ts`
- Modify: `ts/test/recursive-link-identity-proof.test.ts`
- Test: `ts/test/proof-subanet-projection.test.ts` remains RED because K1e module is still absent

**Interfaces:**
- Produces the module-internal reusable types/API:

```ts
export interface ValidatedProofOccurrenceClaim {
  readonly occurrence: LinkHandle;
  readonly claim: LinkHandle;
}

export interface RecursiveLinkIdentityProofClosureReplayResult {
  readonly proofRoot: LinkHandle;
  readonly left: LinkHandle;
  readonly right: LinkHandle;
  readonly validatedOccurrences: readonly ValidatedProofOccurrenceClaim[];
}

export function replayRecursiveLinkIdentityProofClosure(
  memory: ReadMemory,
  proofRoot: LinkHandle,
): RecursiveLinkIdentityProofClosureReplayResult;
```

Existing API stays exactly:

```ts
export function replayRecursiveLinkIdentityProofAset(
  memory: ReadMemory,
  proofRoot: LinkHandle,
): RecursiveLinkIdentityProofReplayResult;
```

- [ ] **Step 1: add closure assertions to the identity test**

For an ordinary identity proof `P(X,X)` with ordered children `[P(start,start), P(end,end)]`, assert:

```ts
const closure = replayRecursiveLinkIdentityProofClosure(memory, xProof);
const byOccurrence = new Map(
  closure.validatedOccurrences.map(({ occurrence, claim }) => [occurrence, claim]),
);
same(byOccurrence.get(xProof), memory.poles(xProof).start, "root occurrence -> exact Claim");
same(byOccurrence.get(startProof), memory.poles(startProof).start, "start child -> exact Claim");
same(byOccurrence.get(endProof), memory.poles(endProof).start, "end child -> exact Claim");
```

Also call the existing outward API and pin:

```ts
const outward = replayRecursiveLinkIdentityProofAset(memory, xProof);
same(outward.proofRoot, xProof, "public/module replay proofRoot unchanged");
same(outward.left, x, "public/module replay left unchanged");
same(outward.right, x, "public/module replay right unchanged");
same(outward.verifiedOccurrenceCount, closure.validatedOccurrences.length, "count projection unchanged");
```

- [ ] **Step 2: run the focused identity test and observe RED on the missing closure API**

```bash
npm --prefix ts run build
node ts/dist/test/recursive-link-identity-proof.test.js
```

Expected before implementation: compile failure for missing `replayRecursiveLinkIdentityProofClosure`.

- [ ] **Step 3: refactor the identity verifier minimally**

Change `ReadOccurrence` to retain the exact Claim:

```ts
interface ReadOccurrence {
  readonly claim: LinkHandle;
  readonly left: LinkHandle;
  readonly right: LinkHandle;
  readonly children: readonly LinkHandle[];
}
```

In `readOccurrence`, return `claim` with `left/right/children`.

Replace the current `verified Set<LinkHandle>` with an insertion-ordered `Map<LinkHandle, LinkHandle>`:

```ts
const verified = new Map<LinkHandle, LinkHandle>();
```

After a node passes all recursive obligations:

```ts
verified.set(occurrence, data.claim);
```

The new closure replay returns a frozen array projection:

```ts
return Object.freeze({
  proofRoot,
  left: root.left,
  right: root.right,
  validatedOccurrences: Object.freeze(
    [...verified].map(([occurrence, claim]) => Object.freeze({ occurrence, claim })),
  ),
});
```

Then implement the existing outward replay only as projection:

```ts
export function replayRecursiveLinkIdentityProofAset(
  memory: ReadMemory,
  proofRoot: LinkHandle,
): RecursiveLinkIdentityProofReplayResult {
  const replay = replayRecursiveLinkIdentityProofClosure(memory, proofRoot);
  return Object.freeze({
    proofRoot: replay.proofRoot,
    left: replay.left,
    right: replay.right,
    verifiedOccurrenceCount: replay.validatedOccurrences.length,
  });
}
```

Do not alter the four FULL/START/END/ORDINARY obligations, child ordering, root base, cycle detection or read-only checks.

- [ ] **Step 4: run identity corpus GREEN**

```bash
npm --prefix ts run build
node ts/dist/test/recursive-link-identity-proof.test.js
```

Expected: all existing identity positives/negatives remain GREEN.

- [ ] **Step 5: commit**

```bash
git add ts/src/recursive-link-identity-proof.ts ts/test/recursive-link-identity-proof.test.ts
git commit -m "refactor(proof-calculus): expose validated identity proof closure"
```

---

### Task 3: Factor callback-free CLOSED K1 occurrence replay and preserve rooted K1 behavior

**Files:**
- Modify: `ts/src/rooted-proof-aset.ts`
- Modify: `ts/test/rooted-proof-aset-mixed-identity.test.ts`
- Uses: `replayRecursiveLinkIdentityProofClosure` from Task 2

**Interfaces:**
- Produces:

```ts
export interface ClosedProofOccurrenceReplayResult {
  readonly theory: LinkHandle;
  readonly occurrence: LinkHandle;
  readonly claim: LinkHandle;
  readonly validatedOccurrences: readonly ValidatedProofOccurrenceClaim[];
}

export function replayClosedProofOccurrence(
  memory: ReadMemory,
  theory: LinkHandle,
  occurrence: LinkHandle,
): ClosedProofOccurrenceReplayResult;
```

No callback, resolver, assumption list, proof kind or host descendant list is an input.

- [ ] **Step 1: add no-regression tests before refactor**

In `rooted-proof-aset-mixed-identity.test.ts`, for the existing accepted mixed dependency proof, add:

```ts
const dependencyClosure = replayClosedProofOccurrence(memory, theory, xProof);
same(dependencyClosure.occurrence, xProof, "closed K1 exact occurrence");
same(dependencyClosure.claim, identityClaim, "closed K1 exact Claim");
assert(
  dependencyClosure.validatedOccurrences.some(({ occurrence }) => occurrence === xProof),
  "closed K1 validated closure contains selected identity occurrence",
);
```

Pin the old rooted result independently:

```ts
const rooted = replayStructuralRootedProofAset(memory, root);
same(rooted.occurrenceCount, 1, "rooted occurrenceCount remains structural-only");
same(rooted.declaredAssumptionCount, 0, "rooted declared assumptions unchanged");
same(rooted.usedAssumptionCount, 0, "rooted used assumptions unchanged");
```

- [ ] **Step 2: factor common structural application parsing/validation**

Inside `rooted-proof-aset.ts`, create private data shape:

```ts
interface StructuralOccurrenceApplication {
  readonly occurrence: LinkHandle;
  readonly claim: LinkHandle;
  readonly primitiveDerivationRule: LinkHandle;
  readonly premiseTemplates: readonly LinkHandle[];
  readonly dependencyOccurrences: readonly LinkHandle[];
}
```

Create a private reader that performs only the exact shared structural checks:

```text
Occurrence poles valid
Application poles valid
primitive DR structurally valid
primitive Rule structurally valid
Theory -> primitive Rule exists
Theory -> primitive DR exists
dependency ExactSequence valid
dependency arity == premise arity
```

Do not resolve dependencies in this reader.

Create a private finisher:

```ts
function verifyStructuralApplicationClaims(
  memory: ReadMemory,
  application: StructuralOccurrenceApplication,
  dependencyClaims: readonly LinkHandle[],
): void
```

which delegates to the existing whole-derivation substitution law with the exact outer Claim.

- [ ] **Step 3: centralize candidate selection as a pure value selector, not callbacks**

Use an internal candidate result:

```ts
interface ProofCandidateReplayResult {
  readonly claim: LinkHandle;
  readonly validatedOccurrences: readonly ValidatedProofOccurrenceClaim[];
}
```

Use one pure selector:

```ts
function selectUniqueProofCandidate(
  identity: ProofCandidateReplayResult | undefined,
  structural: ProofCandidateReplayResult | undefined,
): ProofCandidateReplayResult {
  const valid = [identity, structural].filter(
    (candidate): candidate is ProofCandidateReplayResult => candidate !== undefined,
  );
  if (valid.length === 0) fail("invalid-proof-occurrence");
  if (valid.length !== 1) fail("ambiguous-proof-support");
  return valid[0]!;
}
```

This function receives already-evaluated values. It is not a callback registry and verifier order cannot grant semantics.

- [ ] **Step 4: implement CLOSED replay recursively with candidate-local results**

`replayClosedProofOccurrence` must:

```text
A. attempt identity by replayRecursiveLinkIdentityProofClosure
B. attempt structural by recursively CLOSED-replaying every dependency
C. call selectUniqueProofCandidate(identity, structural)
D. return only the selected candidate closure
```

Structural candidate recursion uses `activeStructural` for cycles and a structural-candidate memo only as operational cache. Every future proof-law selection still attempts identity and structural independently; a cached structural result must never skip identity ambiguity checking.

For structural closure, combine exact dependency validated closures plus the structural occurrence itself, deduplicated by exact occurrence Link. Do not include any raw/unvalidated Memory neighbor.

- [ ] **Step 5: keep rooted OPEN wrapper separate but share the same structural reader/finisher and candidate selector**

The existing rooted target remains structurally anchored:

```text
root = targetIdentity ⟼ targetOccurrence
```

For each structural dependency in the rooted wrapper:

```text
if dependency = Claim ⟼ targetIdentity
AND Claim is a declared target premise
  -> use explicit target assumption Claim
else
  -> independently attempt identity candidate
  -> independently attempt rooted structural candidate
  -> selectUniqueProofCandidate(...)
```

The rooted structural candidate may recursively encounter target assumptions; the CLOSED replay never does. There is no resolver callback between the two surfaces.

Preserve the existing `verified` structural count semantics for `StructuralRootedProofAsetReplayResult.occurrenceCount`.

- [ ] **Step 6: run focused K1 + identity corpora**

```bash
npm --prefix ts run build
node ts/dist/test/rooted-proof-aset.test.js
node ts/dist/test/rooted-proof-aset-mixed-identity.test.js
node ts/dist/test/recursive-link-identity-proof.test.js
```

Expected: all predecessor behavior GREEN, including `invalid-proof-occurrence`, `ambiguous-proof-support`, cycles, exact Theory admission, reachability and read-only checks.

- [ ] **Step 7: commit**

```bash
git add ts/src/rooted-proof-aset.ts ts/test/rooted-proof-aset-mixed-identity.test.ts
git commit -m "refactor(proof-calculus): expose closed K1 validated occurrence replay"
```

---

### Task 4: Implement the minimal one-premise K1e projection binder

**Files:**
- Create: `ts/src/proof-subanet-projection.ts`
- Modify: `ts/test/proof-subanet-projection.test.ts`

**Interfaces:**
- Consumes:

```ts
replayClosedProofOccurrence(memory, theory, premiseProofOccurrence)
inferStructuralSubstitution(memory, roles, constraints, { requireAll: true })
matchStructuralTemplate(memory, template, claimed, bindings)
readStructuralDerivationRule(...)
readStructuralRule(...)
readStructuralRoleDictionary(...)
```

- Produces exactly:

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
  | "unsupported-schema-arity"
  | "invalid-premise-proof"
  | "unbound-schema-role"
  | "invalid-premise-substitution"
  | "projection-not-found"
  | "ambiguous-projection"
  | "replay-wrote";

export class ProofSubAnetProjectionReplayError extends Error {
  override readonly name = "ProofSubAnetProjectionReplayError";
  constructor(readonly code: ProofSubAnetProjectionReplayErrorCode) {
    super(code);
  }
}

export function replayProofSubAnetProjection(
  memory: ReadMemory,
  evidence: ProofSubAnetProjectionEvidence,
): ProofSubAnetProjectionReplayResult;
```

- [ ] **Step 1: read schema as data only**

Read:

```text
schemaDerivationRule
-> StructuralRule
-> RoleDictionary
premiseTemplates
body
```

Require exactly one premise template:

```ts
if (schema.premiseTemplates.length !== 1) fail("unsupported-schema-arity");
```

Do not query:

```ts
memory.find(theory, schema.structuralRule)
memory.find(theory, schemaDerivationRule)
```

Schema admission is irrelevant to K1e authority.

- [ ] **Step 2: independently replay the premise proof through CLOSED K1**

```ts
let parent: ClosedProofOccurrenceReplayResult;
try {
  parent = replayClosedProofOccurrence(
    memory,
    evidence.theory,
    evidence.premiseProofOccurrence,
  );
} catch (error) {
  if (error instanceof StructuralRootedProofAsetReplayError) {
    if (error.code === "replay-wrote") fail("replay-wrote");
    fail("invalid-premise-proof");
  }
  throw error;
}
```

K1e never trusts a caller-supplied parent Claim or descendant list.

- [ ] **Step 3: infer the complete Role substitution from the premise Claim only**

```ts
const premiseTemplate = schema.premiseTemplates[0]!;
const bindings = inferStructuralSubstitution(
  memory,
  roles,
  [Object.freeze({ template: premiseTemplate, actual: parent.claim })],
  { requireAll: true },
);
```

Map errors exactly:

```text
duplicate-role        -> invalid-schema
missing-role-binding  -> unbound-schema-role
template-mismatch     -> invalid-premise-substitution
replay-wrote          -> replay-wrote
```

This step occurs before searching/matching the conclusion. Conclusion-only Roles therefore cannot be guessed.

- [ ] **Step 4: match only validated closure Claims under the exact premise bindings**

For each distinct entry in:

```ts
parent.validatedOccurrences
```

attempt:

```ts
matchStructuralTemplate(memory, rule.body, candidate.claim, bindings);
```

A normal `StructuralRuleError("template-mismatch")` means “not this candidate” and contributes no match. Do not inspect all Memory, incoming/outgoing links, allocation ids, host arrays supplied by caller, or raw pole reachability.

Collect distinct matching occurrences by exact Link identity.

Then:

```text
0 -> projection-not-found
1 -> return exact occurrence + exact Claim
>1 -> ambiguous-projection
```

Do not choose first traversal result.

- [ ] **Step 5: enforce read-only on every exit path**

Snapshot `memory.linkCount` at entry and in `finally` map any write to `replay-wrote`.

- [ ] **Step 6: make the Task-1 ordinary witness GREEN**

Run:

```bash
npm --prefix ts run build
node ts/dist/test/proof-subanet-projection.test.js
```

Expected marker after the positive assertion:

```text
PROOF_SUBANET_PROJECTION = SUPPORTED
K1_VALIDATED_CLOSURE_OBSERVABILITY = SUPPORTED
```

- [ ] **Step 7: commit minimal K1e production**

```bash
git add ts/src/proof-subanet-projection.ts ts/test/proof-subanet-projection.test.ts
git commit -m "feat(proof-calculus): project validated proof subAnets"
```

---

### Task 5: Complete generic closure-shape and security corpus

**Files:**
- Modify: `ts/test/proof-subanet-projection.test.ts`
- Production: only bounded diagnostic corrections in K1e files if a test exposes a defect in the approved law

**Interfaces:** existing Task-4 API only. No test hook or proof-kind injection.

- [ ] **Step 1: exercise ordinary/start/end/full identity closure shapes generically**

Use schema templates that expose the relevant role structurally rather than a child index.

For ordinary relation projection:

```text
premise = ((A ⟼ B) ⟼ (A ⟼ B))
body    = (A ⟼ A)
```

For a start-selfclosed relation built with `ensureStartSelfClosed(E)`:

```text
premise relation template = ensureStartSelfClosed(Erole)
premise = templateRelation ⟼ templateRelation
body    = Erole ⟼ Erole
```

For an end-selfclosed relation built with `ensureEndSelfClosed(S)`:

```text
premise relation template = ensureEndSelfClosed(Srole)
premise = templateRelation ⟼ templateRelation
body    = Srole ⟼ Srole
```

For FULL root, use the conservative identity schema:

```text
roles   = [X]
premise = X
body    = X
```

against the canonical root proof occurrence; require it returns the exact existing root occurrence. K1e must not encode `child[0]`, `child[1]`, START/END/FULL/ORDINARY tags or selector enums.

- [ ] **Step 2: invalid schema arity**

Create schema DRs with `[]` and `[p1,p2]` and require exact:

```text
unsupported-schema-arity
```

- [ ] **Step 3: unbound and inconsistent Role substitution**

Unbound role fixture:

```text
roles = [A,B]
premise mentions A only
body mentions B
```

Require:

```text
unbound-schema-role
```

Repeated-role inconsistent premise fixture must require:

```text
invalid-premise-substitution
```

- [ ] **Step 4: invalid/foreign Theory structural parent**

Build one CLOSED structural parent whose primitive Rule/DR is admitted only under `theoryA`. Require:

```text
replayProofSubAnetProjection(... theoryA ...) -> GREEN or normal projection result
replayProofSubAnetProjection(... theoryB ...) -> invalid-premise-proof
```

Do not weaken intrinsic identity authority merely because its parent does not require primitive Theory admission.

- [ ] **Step 5: unreachable same-Claim proof grants zero authority**

Build a valid proof occurrence whose Claim matches the schema body but which is not in `parent.validatedOccurrences`. Ensure the actual parent closure contains no matching occurrence. Require:

```text
projection-not-found
```

Then add a raw ambient Link:

```ts
memory.ensure(parentOccurrence, unreachableMatchingProof);
```

Replay must still return `projection-not-found`.

- [ ] **Step 6: host metadata grants zero authority**

Call using a structurally decorated object:

```ts
const decorated = Object.freeze({
  theory,
  schemaDerivationRule: dr,
  premiseProofOccurrence: parent,
  projectedOccurrence: unreachableMatchingProof,
  rho: new Map([[A, arbitraryValue]]),
  kind: "start",
});
```

The result/error must be identical to the undecorated evidence because these properties are not part of the trusted input.

- [ ] **Step 7: schema admission is authority-neutral**

Use a schema Rule/DR distinct from every primitive Rule/DR used by the parent proof.

Run K1e before admission and record exact projected occurrence. Then explicitly add:

```ts
admitStructuralRule(memory, theory, schemaRule);
admitStructuralDerivationRule(memory, theory, schemaDR);
```

Run K1e again and require the same exact projected occurrence. The writes occur outside K1e and may change Theory revision; the projection result must not.

- [ ] **Step 8: construct a genuine ambiguous-projection fixture without test hooks**

Create an exact Claim `pClaim = p ⟼ p` with two distinct independently K1-valid ProofOccurrences:

```text
identityProofP   = intrinsic recursive identity proof of p=p
structuralProofP = pClaim ⟼ (zeroPremisePrimitiveDR ⟼ ExactSequence([]))
```

Admit only the zero-premise structural primitive needed for `structuralProofP`.

Create a CLOSED parent structural proof whose admitted primitive schema has two premise positions both requiring `pClaim`, with dependencies exactly:

```text
[identityProofP, structuralProofP]
```

and whose concrete parent Claim structurally contains `p` so the K1e schema can infer Role `P` from its single premise Claim.

Projection schema:

```text
one Role P
premise template matches the parent Claim and binds P=p
body = P ⟼ P
```

Both distinct dependency ProofOccurrences are in the K1-validated closure and both match the body under the same binding. Require exact:

```text
ambiguous-projection
```

If canonical construction unexpectedly collapses the two supports into one exact occurrence, record that measured fact in #1116 before changing the test; do not add a proof-kind callback or fake dispatcher to manufacture ambiguity.

- [ ] **Step 9: read-only + exact Theory revision**

Around a normal projection call:

```ts
const revisionBefore = await computePortableStructuralTheoryRevision(
  exportPortableStructuralTheory(memory, theory),
);
const countBefore = memory.linkCount;
const projected = replayProofSubAnetProjection(memory, evidence);
same(memory.linkCount, countBefore, "K1e replay read-only");
const revisionAfter = await computePortableStructuralTheoryRevision(
  exportPortableStructuralTheory(memory, theory),
);
same(revisionAfter.scheme, revisionBefore.scheme, "Theory scheme unchanged");
same(revisionAfter.value, revisionBefore.value, "exact Theory revision unchanged");
```

- [ ] **Step 10: run all predecessor corpora and full gate**

```bash
npm --prefix ts run check
```

Required predecessor markers/corpora remain GREEN:

```text
recursive Link identity
MIXED_ROOTED_PROOF_ANET_DEPENDENCY
K1d2 heterogeneous generic replay
K1d3 open rooted binding
K1d4 closed rooted discharge
```

Do not edit the T4 rerun test in this PR.

- [ ] **Step 11: emit final generic K1e markers and commit**

Only after the complete generic corpus is GREEN:

```text
PROOF_SUBANET_PROJECTION = SUPPORTED
K1_VALIDATED_CLOSURE_OBSERVABILITY = SUPPORTED
PROJECTION_SCHEMA_ADMISSION_AUTHORITY = NOT REQUIRED
HOST_PROJECTION_AUTHORITY = NONE
ROOTED_K1_SEMANTICS = UNCHANGED
K1E_SECURITY_CORPUS = GREEN
accepted semantic delta = NONE
```

Commit:

```bash
git add ts/test/proof-subanet-projection.test.ts
# add K1e production files only if the security corpus exposed a bounded defect
git commit -m "test(proof-calculus): harden proof-subAnet projection authority"
```

---

### Task 6: K1e acceptance transaction — generic only

**Files:** none beyond Tasks 1–5.

**Interfaces:** GitHub lifecycle only.

- [ ] **Step 1: verify exact diff against the opening accepted main for the implementation branch**

Required scope:

```text
ts/src/recursive-link-identity-proof.ts
ts/src/rooted-proof-aset.ts
ts/src/proof-subanet-projection.ts
ts/test/proof-subanet-projection.test.ts
ts/test/recursive-link-identity-proof.test.ts
ts/test/rooted-proof-aset-mixed-identity.test.ts
```

No `public.ts`, T4 test, docs, contracts, cutover, traceability, policy or workflows.

- [ ] **Step 2: update PR body with exact TDD evidence**

Record:

```text
opening main SHA
RED test-only head + exact RED CI
identity-closure refactor head + regression result
closed-K1 refactor head + regression result
minimal K1e GREEN head + CI
security final head + full npm check
blocking repo-guard run
accepted MTS = v0.11
active semantic candidate = NONE
T4 PROOF_ANET remains GAP until separate #1064 rerun
```

- [ ] **Step 3: mark ready only after exact-head full GREEN**

Require on one stable head:

```text
full CI = GREEN
blocking repo-guard = GREEN
PR draft = false
mergeable = true
behind_by = 0
no blocking review finding
changed-file set unchanged
```

- [ ] **Step 4: merge with expected head SHA**

Use `expected_head_sha` equal to the exact verified final head.

- [ ] **Step 5: require post-merge main CI GREEN and classify K1e only**

Accepted result:

```text
K1e PROOF_SUBANET_PROJECTION = SUPPORTED
K1_VALIDATED_CLOSURE_OBSERVABILITY = SUPPORTED
ROOTED_K1_SEMANTICS = UNCHANGED
accepted semantic delta = NONE
```

Do **not** mark T4 `PROOF_ANET = SUPPORTED` here.

- [ ] **Step 6: hand off to a separate #1064 exact T4 rerun**

Only after K1e is merged and post-merge GREEN:

```text
fresh accepted main
-> separate test-only T4 rerun transaction
-> exact same T4 theorem challenge
```

Aprover remains WAIT until the complete `aprover#246` A-SYNC1 trigger is satisfied.

---

## ChangeIntent for the K1e implementation PR

```repo-guard-yaml
change_type: feature
scope:
  - ts/src/recursive-link-identity-proof.ts
  - ts/src/rooted-proof-aset.ts
  - ts/src/proof-subanet-projection.ts
  - ts/test/proof-subanet-projection.test.ts
  - ts/test/recursive-link-identity-proof.test.ts
  - ts/test/rooted-proof-aset-mixed-identity.test.ts
budgets:
  max_new_files: 2
  max_new_docs: 0
  max_net_added_lines: 950
must_touch:
  - ts/src/recursive-link-identity-proof.ts
  - ts/src/rooted-proof-aset.ts
  - ts/src/proof-subanet-projection.ts
  - ts/test/proof-subanet-projection.test.ts
must_not_touch:
  - ts/src/public.ts
  - ts/src/derived-derivation-heterogeneous.ts
  - ts/src/derived-derivation-heterogeneous-instance.ts
  - ts/src/derived-derivation-heterogeneous-discharge.ts
  - ts/src/derived-derivation-heterogeneous-discharge-materialize.ts
  - ts/src/structural-role-morphism.ts
  - ts/src/structural-substitution.ts
  - ts/src/proof.ts
  - ts/src/checker.ts
  - ts/test/derived-t4-successor-injective-proof-anet.test.ts
  - contracts/**
  - cutover/**
  - traceability/**
  - repo-policy.json
  - docs/**
  - .github/**
expected_effects:
  - expose exact validated recursive-identity ProofOccurrence closure without changing existing outward identity replay diagnostics
  - expose callback-free CLOSED K1 ProofOccurrence replay using the accepted 0/1/>1 proof-law selection
  - preserve existing rooted OPEN assumption topology and outward rooted replay result semantics
  - replay one-premise MTS-native projection schemas without querying schema primitive admission
  - infer every schema Role only from the exact premise Claim
  - select exactly one existing ProofOccurrence from the K1-validated parent closure by conclusion-template match
  - reject zero or multiple matching validated occurrences fail-closed
  - grant zero authority to host rho, projectedOccurrence metadata, ambient Links, raw Memory reachability, or unreachable same-Claim proofs
  - introduce no Nat/T4/Succ-specific trusted branch and no new K1 proof law
  - keep exact Theory revision unchanged during trusted replay
  - accepted MTS v0.11 remains unchanged
```

## Plan Self-Review

```text
SPEC COVERAGE = COMPLETE for approved #1113 Variant A + #1114 corrections
PLACEHOLDER SCAN = PASS
TYPE/NAME CONSISTENCY = PASS
CALLBACK/RESOLVER SEAM = NONE
OUTWARD REPLAY CONTRACT DRIFT = NONE INTENDED
T4 CODE IN K1e PR = NONE
PUBLIC PACKAGE API DELTA = NONE
SEMANTIC DELTA EXPECTED = NONE
```

Execution mode for the current ChatGPT session: **inline execution** after #1115 docs/plan synchronization is accepted, using GitHub Actions as authoritative RED/GREEN evidence and the exact-head repo-guard merge gate.
