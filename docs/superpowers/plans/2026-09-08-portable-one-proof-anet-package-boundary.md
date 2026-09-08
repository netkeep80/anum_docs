# Portable ONE PROOF ANET Package Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make accepted K1/K1d2/K1d3/K1d4/K1e proof-Anet evidence portable across process/storage boundaries and consumable through the `@mts/core` package root, without adding proof semantics or promoting T4/T5 into primitive Theory authority.

**Architecture:** Variant B from `anum_docs#1122` is fixed: a coordinate-bearing transport envelope contains canonical MTS topology plus the minimum coordinates needed to rerun the already accepted trusted replay. Export observes the same trusted replay's read surface, closes it over poles, canonicalizes that exact support, and serializes coordinates; replay restores canonical topology and recomputes the projected occurrence. The JSON artifact has zero proof authority, and exact Theory selection remains an independent consumer boundary.

**Tech Stack:** TypeScript 5.9, Node 24, `Memory`/`ReadMemory`, canonical `StorageTopologyImage`, trusted rooted K1 replay, K1e projection replay, Web Crypto SHA-256, package-root TypeScript consumer compilation.

**Spec:** `anum_docs#1122`, especially the USER APPROVAL comment dated 2026-09-08 accepting Variant B; parent architectural authorities `#999`, `#1066`, `#1116`, `#1064`, `#1120`; downstream acceptance owner `aprover#247`.

## Global Constraints

- Accepted MTS is exactly `v0.11`; active semantic candidate is `NONE`.
- This program is a portable/package capability delta only; observable accepted MTS semantic delta must remain `NONE`.
- Do not modify `contracts/**`, `cutover/**`, `traceability/**`, or `repo-policy.json`; if implementation evidence requires such a change, stop and escalate through `#995`.
- Portable JSON is transport only. It must never carry proof truth such as `proved`, proof kinds, trusted host rho, callbacks, theorem opcodes, or a host-selected `projectedOccurrence`.
- The only projection authority is `replayProofSubAnetProjection()` over a K1-validated closed proof closure.
- No second proof walker. Export support is derived by observing reads performed by the same trusted replay.
- Canonical topology and numeric coordinates are the only portable Link identity mechanism; `LinkHandle` never crosses the artifact boundary.
- Preserve exact ordered `ExactSequence` topology, including duplicate dependency slots such as `[X, X]`; never Set-normalize or reorder them.
- T4 and T5 remain derived/reused evidence; no primitive Rule/DR promotion and no Nat/Succ trusted opcode.
- Package consumers must import only from `@mts/core`; `@mts/core/src/**` is forbidden.
- Every trusted replay/export path remains read-only and must fail if `memory.linkCount` changes.
- All accepted PRs require project CI and blocking repo-guard GREEN, current branch behind-by zero, stable exact head, and post-merge main CI GREEN.

---

## Acceptance transaction map

This plan is intentionally split into bounded reviewable transactions rather than one broad PR:

1. **PR E1a+E1b** — generic read-observed proof support + portable K1e projection artifact, canonical parse/replay, content digest, generic non-Nat RED/GREEN corpus.
2. **PR E1c+E1d+E1e** — exact external Theory binding, minimal package-root exports, package consumer compilation, expanded generic security corpus.
3. **PR E1f** — duplicate dependency-slot/order preservation and cross-artifact-coordinate falsifiers.
4. **PR E1g+E1h** — package-root-only T4/T5 upstream witness, package artifact identity, full gates and handoff evidence for `aprover#247`.

The downstream aprover repin is a separate repository transaction and is not part of any upstream PR above.

---

### Task 1 (E1a): Generic replay-read support observation without a second proof walker

**Files:**
- Create: `ts/src/replay-support-topology.ts`
- Test: `ts/test/portable-proof-subanet-projection.test.ts`

**Interfaces:**
- Consumes: `ReadMemory`, `EnumerableReadMemory`, `LinkHandle`, `LinkPoles`, `exportCanonicalTopology()`.
- Produces:

```ts
export interface ObservedReplaySupportTopology<T> {
  readonly replay: T;
  readonly topology: StorageTopologyImage;
  readonly coordinates: ReadonlyMap<LinkHandle, number>;
  readonly links: readonly LinkHandle[];
}

export function exportObservedReplaySupportTopology<T>(
  memory: ReadMemory,
  replay: (observedMemory: ReadMemory) => T,
): ObservedReplaySupportTopology<T>;
```

This callback is an internal execution adapter for invoking an already trusted replay; it is not serialized, registered, selected by proof kind, or accepted from a consumer.

- [ ] **Step 1: Add the generic non-Nat RED test before production code**

Create `ts/test/portable-proof-subanet-projection.test.ts` with a fixture based on arbitrary relation identity, not Nat. Build:

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

const A = memory.ensure(L, R);
const B = memory.ensure(R, L);
const dictionary = defineStructuralRoleDictionary(memory, [A, B]);
const relationTemplate = memory.ensure(A, B);
const premiseTemplate = memory.ensure(relationTemplate, relationTemplate);
const conclusionTemplate = memory.ensure(A, A);
const rule = defineStructuralRule(memory, dictionary, conclusionTemplate);
const dr = defineStructuralDerivationRule(memory, rule, [premiseTemplate]);
```

Then require the new portable exporter API, which does not exist yet:

```ts
const artifact = exportPortableProofSubAnetProjection(memory, {
  theory,
  schemaDerivationRule: dr,
  premiseProofOccurrence: relationProof,
});
assert(artifact.schema === PORTABLE_PROOF_SUBANET_PROJECTION_SCHEMA, "exact schema");
assert(!("projectedOccurrence" in artifact), "projected occurrence is not serialized");
assert(!("rho" in artifact), "rho is not serialized");
assert(!("bindings" in artifact), "bindings are not serialized");
```

- [ ] **Step 2: Verify RED**

Run through repository CI or locally:

```bash
cd ts
npm test
```

Expected failure: TypeScript cannot resolve `exportPortableProofSubAnetProjection` / `PORTABLE_PROOF_SUBANET_PROJECTION_SCHEMA` because no production API exists yet. The failure must be feature-missing, not a fixture typo.

- [ ] **Step 3: Implement read tracing only**

In `ts/src/replay-support-topology.ts`, implement a `TracingReadMemory implements ReadMemory` that delegates `root` and `linkCount` to the source and records every Link participating in a trusted read:

```ts
class TracingReadMemory implements ReadMemory {
  readonly observed = new Set<LinkHandle>();
  constructor(private readonly source: ReadMemory) {
    this.observed.add(source.root);
  }
  get root(): LinkHandle { return this.source.root; }
  get linkCount(): number { return this.source.linkCount; }
  poles(link: LinkHandle): LinkPoles {
    this.observed.add(link);
    const poles = this.source.poles(link);
    this.observed.add(poles.start);
    this.observed.add(poles.end);
    return poles;
  }
  find(start: LinkHandle, end: LinkHandle): LinkHandle | undefined {
    this.observed.add(start);
    this.observed.add(end);
    const found = this.source.find(start, end);
    if (found !== undefined) this.observed.add(found);
    return found;
  }
  outgoing(start: LinkHandle): readonly LinkHandle[] {
    this.observed.add(start);
    const found = this.source.outgoing(start);
    for (const link of found) this.observed.add(link);
    return found;
  }
  incoming(end: LinkHandle): readonly LinkHandle[] {
    this.observed.add(end);
    const found = this.source.incoming(end);
    for (const link of found) this.observed.add(link);
    return found;
  }
}
```

After the trusted replay returns, pole-close `observed`, expose it through a filtered `EnumerableReadMemory`, and canonicalize with `exportCanonicalTopology()`. Do not inspect proof shapes, derivation rules, claims, dependency slots, or projection schema in this module.

- [ ] **Step 4: Unit-test the support observer with the existing trusted K1e replay**

The same RED test must call:

```ts
const support = exportObservedReplaySupportTopology(memory, (observedMemory) =>
  replayProofSubAnetProjection(observedMemory, {
    theory,
    schemaDerivationRule: dr,
    premiseProofOccurrence: relationProof,
  }),
);
same(support.replay.projectedOccurrence, leftProof, "same trusted K1e result");
same(memory.linkCount, before, "support observation is read-only");
assert(support.coordinates.has(theory), "Theory is portable support");
assert(support.coordinates.has(dr), "ProjectionSchema DR is portable support");
assert(support.coordinates.has(relationProof), "premise ProofOccurrence is portable support");
assert(support.coordinates.has(leftProof), "selected existing occurrence is portable support");
```

- [ ] **Step 5: Verify GREEN for E1a**

```bash
cd ts
npm test
```

Expected: the new generic support-observation assertions pass and all pre-existing tests remain green.

- [ ] **Step 6: Commit**

```bash
git add ts/src/replay-support-topology.ts ts/test/portable-proof-subanet-projection.test.ts
git commit -m "feat(proof): observe trusted replay support for portability"
```

---

### Task 2 (E1b): PortableProofSubAnetProjectionArtifact parse/export/replay/canonicality

**Files:**
- Create: `ts/src/portable-proof-subanet-projection.ts`
- Modify: `ts/test/portable-proof-subanet-projection.test.ts`

**Interfaces:**
- Consumes: `exportObservedReplaySupportTopology()`, `replayProofSubAnetProjection()`, `restoreTopology()`, `exportCanonicalTopology()`, `PORTABLE_MTS_SEMANTIC_BASE`.
- Produces:

```ts
export const PORTABLE_PROOF_SUBANET_PROJECTION_SCHEMA =
  "mts-portable-proof-subanet-projection/v0.1" as const;

export interface PortableProofSubAnetProjectionArtifact {
  readonly schema: typeof PORTABLE_PROOF_SUBANET_PROJECTION_SCHEMA;
  readonly mtsSemanticBase: typeof PORTABLE_MTS_SEMANTIC_BASE;
  readonly topology: StorageTopologyImage;
  readonly theoryCoordinate: number;
  readonly schemaDerivationRuleCoordinate: number;
  readonly premiseProofOccurrenceCoordinate: number;
}

export interface PortableProofSubAnetProjectionReplayResult {
  readonly memory: Memory;
  readonly evidence: ProofSubAnetProjectionEvidence;
  readonly replay: ProofSubAnetProjectionReplayResult;
  readonly artifact: PortableProofSubAnetProjectionArtifact;
}

export function exportPortableProofSubAnetProjection(
  memory: ReadMemory,
  evidence: ProofSubAnetProjectionEvidence,
): PortableProofSubAnetProjectionArtifact;

export function replayPortableProofSubAnetProjection(
  input: unknown,
): PortableProofSubAnetProjectionReplayResult;

export function canonicalPortableProofSubAnetProjectionV01Json(input: unknown): string;
```

- [ ] **Step 1: Extend RED to require round-trip replay**

```ts
const sourceReplay = replayProofSubAnetProjection(memory, evidence);
const artifact = exportPortableProofSubAnetProjection(memory, evidence);
const restored = replayPortableProofSubAnetProjection(JSON.parse(JSON.stringify(artifact)));

same(restored.replay.projectedClaim !== undefined, true, "portable replay returns projected Claim");
same(
  canonicalPortableProofSubAnetProjectionV01Json(artifact),
  JSON.stringify(artifact),
  "export is canonical JSON",
);
same(memory.linkCount, beforeExport, "portable export remains read-only");
```

Compare source and restored results structurally by canonical coordinates/topology, never by cross-Memory `LinkHandle` object identity.

- [ ] **Step 2: Verify RED**

`npm test` must fail because parse/replay/canonical JSON is missing.

- [ ] **Step 3: Implement exact envelope parsing**

Accept exactly these top-level keys and no others:

```ts
[
  "schema",
  "mtsSemanticBase",
  "topology",
  "theoryCoordinate",
  "schemaDerivationRuleCoordinate",
  "premiseProofOccurrenceCoordinate",
]
```

Reject any extra fields, including `projectedOccurrence`, `bindings`, `rho`, `projectionKind`, `proofKind`, and `proved`, as `invalid-envelope` rather than ignoring them.

Require non-negative integer coordinates and exact `StorageTopologyImage` shape. Reuse/extract the established canonical restore pattern: `restoreTopology(topology)` → `exportCanonicalTopology(restored)` → exact topology equality; otherwise reject `invalid-topology`/`noncanonical-topology`.

- [ ] **Step 4: Implement exporter by same trusted replay observation**

```ts
const support = exportObservedReplaySupportTopology(memory, (observedMemory) =>
  replayProofSubAnetProjection(observedMemory, evidence),
);
return Object.freeze({
  schema: PORTABLE_PROOF_SUBANET_PROJECTION_SCHEMA,
  mtsSemanticBase: PORTABLE_MTS_SEMANTIC_BASE,
  topology: support.topology,
  theoryCoordinate: coordinateOf(support.coordinates, evidence.theory),
  schemaDerivationRuleCoordinate: coordinateOf(support.coordinates, evidence.schemaDerivationRule),
  premiseProofOccurrenceCoordinate: coordinateOf(
    support.coordinates,
    evidence.premiseProofOccurrence,
  ),
});
```

Do not serialize `support.replay.projectedOccurrence` or its inferred bindings.

- [ ] **Step 5: Implement replay by coordinate restoration then trusted K1e**

```ts
const artifact = parsePortableProofSubAnetProjection(input);
const restored = restoreCanonicalTopology(artifact.topology);
const evidence = Object.freeze({
  theory: handleAt(restored.refs, artifact.theoryCoordinate),
  schemaDerivationRule: handleAt(restored.refs, artifact.schemaDerivationRuleCoordinate),
  premiseProofOccurrence: handleAt(restored.refs, artifact.premiseProofOccurrenceCoordinate),
});
const replay = replayProofSubAnetProjection(restored.memory, evidence);
return Object.freeze({ memory: restored.memory, evidence, replay, artifact });
```

- [ ] **Step 6: Verify allocation independence**

Construct the same semantic fixture in a second `Memory` using a deliberately different builder allocation order for unrelated Links. Export both artifacts and assert:

```ts
same(
  canonicalPortableProofSubAnetProjectionV01Json(first),
  canonicalPortableProofSubAnetProjectionV01Json(second),
  "allocation-independent portable artifact",
);
```

- [ ] **Step 7: Verify GREEN and commit**

```bash
cd ts
npm test
git add ts/src/portable-proof-subanet-projection.ts ts/test/portable-proof-subanet-projection.test.ts
git commit -m "feat(proof): add portable K1e projection artifact"
```

---

### Task 3 (E1b): Domain-separated content digest

**Files:**
- Create: `ts/src/portable-proof-anet-digest.ts`
- Modify: `ts/test/portable-proof-subanet-projection.test.ts`

**Interfaces:**

```ts
export const PORTABLE_PROOF_SUBANET_PROJECTION_CONTENT_DIGEST_SCHEME =
  "mts-portable-proof-subanet-projection-content/sha-256/v0.1" as const;

export interface PortableProofSubAnetProjectionContentDigest {
  readonly scheme: typeof PORTABLE_PROOF_SUBANET_PROJECTION_CONTENT_DIGEST_SCHEME;
  readonly value: string;
}

export async function computePortableProofSubAnetProjectionContentDigest(
  input: unknown,
): Promise<PortableProofSubAnetProjectionContentDigest>;
```

- [ ] **Step 1: RED digest mutation test**

```ts
const digest = await computePortableProofSubAnetProjectionContentDigest(artifact);
assert(/^[0-9a-f]{64}$/.test(digest.value), "lowercase SHA-256");
const mutated = structuredClone(artifact);
mutated.topology.links[mutated.topology.links.length - 1] = [0, 0];
await expectPortableFailure(() => replayPortableProofSubAnetProjection(mutated));
```

Also require a schema-coordinate mutation to change the digest.

- [ ] **Step 2: Verify RED**

Expected: digest API missing.

- [ ] **Step 3: Implement the same digest law used by existing portable artifacts**

```ts
const canonicalJson = canonicalPortableProofSubAnetProjectionV01Json(input);
const preimage = `${PORTABLE_PROOF_SUBANET_PROJECTION_CONTENT_DIGEST_SCHEME}\n${canonicalJson}`;
const raw = await globalThis.crypto.subtle.digest(
  "SHA-256",
  new TextEncoder().encode(preimage),
);
```

Return lowercase hex. Do not make digest equality proof authority; it is artifact identity/integrity only.

- [ ] **Step 4: GREEN and commit**

```bash
cd ts
npm test
git add ts/src/portable-proof-anet-digest.ts ts/test/portable-proof-subanet-projection.test.ts
git commit -m "feat(proof): digest portable projection content"
```

At this point PR E1a+E1b is functionally complete. Do not add package-root exports or T4/T5 code to this PR.

---

### Task 4 (E1c): Exact external Theory revision binding

**Files:**
- Modify: `ts/src/portable-theory.ts`
- Modify: `ts/test/portable-proof-subanet-projection.test.ts`

**Interfaces:**

Add a proof-Anet-specific verifier rather than weakening the existing legacy structural union:

```ts
export async function verifyPortableProofSubAnetProjectionTheoryRevision(
  proofArtifact: unknown,
  expectedTheoryArtifact: unknown,
  expectedRevisionInput: unknown,
): Promise<void>;
```

- [ ] **Step 1: RED exact-Theory test**

Export the source Theory and revision:

```ts
const theoryArtifact = exportPortableStructuralTheory(memory, theory);
const revision = await computePortableStructuralTheoryRevision(theoryArtifact);
await verifyPortableProofSubAnetProjectionTheoryRevision(artifact, theoryArtifact, revision);
```

Then create a distinct wrong Theory artifact/revision and require `proof-theory-mismatch` or `theory-revision-mismatch` as appropriate.

- [ ] **Step 2: Verify RED**

Expected: verifier missing.

- [ ] **Step 3: Implement independent Theory selection**

1. Replay and canonicalize the externally supplied Theory artifact.
2. Verify its supplied revision using the existing `PORTABLE_STRUCTURAL_THEORY_REVISION_SCHEME`.
3. Replay the portable projection artifact independently.
4. Compare the restored proof Theory topology/fingerprint to the externally selected exact Theory, using the same structural fingerprint/admission-subset law already used by `verifyPortableStructuralProofTheoryRevision()`.
5. Never trust the proof artifact merely because it carries a `theoryCoordinate`.

- [ ] **Step 4: GREEN and commit**

```bash
cd ts
npm test
git add ts/src/portable-theory.ts ts/test/portable-proof-subanet-projection.test.ts
git commit -m "feat(proof): bind portable projection to exact Theory revision"
```

---

### Task 5 (E1d): Minimal package-root ONE PROOF ANET surface

**Files:**
- Modify: `ts/src/public.ts`
- Modify: `ts/test/public-api.test.ts`
- Modify: `ts/consumer/package-consumer.ts`

**Package-root exports to add:**

```ts
replayClosedProofOccurrence
replayProofSubAnetProjection
exportPortableProofSubAnetProjection
replayPortableProofSubAnetProjection
canonicalPortableProofSubAnetProjectionV01Json
computePortableProofSubAnetProjectionContentDigest
verifyPortableProofSubAnetProjectionTheoryRevision
replayStructuralHeterogeneousDerivedDerivationSchema
replayStructuralHeterogeneousDerivedOpenRootedInstance
replayStructuralHeterogeneousDerivedClosedRootedInstance
```

Export their public evidence/result/error types from the same root. Export only the construction materializers actually required by the E1g package-consumer witness after that witness is written; do not export internal readers solely for convenience.

- [ ] **Step 1: RED package consumer compile test**

In `ts/consumer/package-consumer.ts`, import the new portable K1e APIs only from `@mts/core` and type a minimal function:

```ts
import {
  replayPortableProofSubAnetProjection,
  verifyPortableProofSubAnetProjectionTheoryRevision,
  type PortableProofSubAnetProjectionArtifact,
  type PortableStructuralTheoryArtifact,
  type PortableStructuralTheoryRevision,
} from "@mts/core";

export async function consumePortableProjection(
  proof: PortableProofSubAnetProjectionArtifact,
  theory: PortableStructuralTheoryArtifact,
  revision: PortableStructuralTheoryRevision,
) {
  await verifyPortableProofSubAnetProjectionTheoryRevision(proof, theory, revision);
  return replayPortableProofSubAnetProjection(proof).replay.projectedClaim;
}
```

- [ ] **Step 2: Verify RED**

```bash
cd ts
npm run build
npm run package:check
```

Expected: root exports missing.

- [ ] **Step 3: Add only required root exports and types**

No wildcard exports and no `@mts/core/src/**` entry points.

- [ ] **Step 4: GREEN package compilation and full tests**

```bash
cd ts
npm run build
npm run package:check
npm test
```

- [ ] **Step 5: Commit**

```bash
git add ts/src/public.ts ts/test/public-api.test.ts ts/consumer/package-consumer.ts
git commit -m "feat(core): expose portable proof-Anet replay at package root"
```

---

### Task 6 (E1e): Generic non-Nat portable security corpus

**Files:**
- Modify: `ts/test/portable-proof-subanet-projection.test.ts`

- [ ] **Step 1: Add exact-envelope host-authority negatives**

For each of these cloned artifacts, require `invalid-envelope`:

```ts
{ ...artifact, projectedOccurrence: 1 }
{ ...artifact, rho: [[1, 2]] }
{ ...artifact, proofKind: "identity" }
{ ...artifact, proved: true }
```

- [ ] **Step 2: Add K1e 0/1/>1 round-trip corpus**

Build three source fixtures using existing trusted constructors:
- 0 matching validated descendants → portable replay must throw `projection-not-found`.
- exactly 1 → returns the exact structural result in restored Memory.
- >1 matching validated descendants → portable replay must throw `ambiguous-projection`.

Do not synthesize ambiguity with a host hint; construct two distinct K1-valid occurrences with the same Claim inside one validated parent closure, exactly as the accepted K1e security corpus does.

- [ ] **Step 3: Add unreachable ambient same-Claim falsifier**

Add an independently K1-valid same-Claim occurrence outside the premise's validated closure, plus an ambient `Parent -> Child` Link. Export/replay must still select only the occurrence in the K1-validated closure.

- [ ] **Step 4: Add write/materialization falsifier**

Wrap a `Memory` so any accidental write-capable path changes `linkCount`; both exporter and portable replay must reject `replay-wrote`/portable equivalent. Trusted replay must not call a producer/materializer.

- [ ] **Step 5: GREEN and commit**

```bash
cd ts
npm test
git add ts/test/portable-proof-subanet-projection.test.ts
git commit -m "test(proof): harden portable K1e security boundary"
```

---

### Task 7 (E1f): Preserve duplicate dependency slots and ExactSequence order

**Files:**
- Modify: `ts/test/portable-proof-subanet-projection.test.ts`

- [ ] **Step 1: RED duplicate-slot witness**

Construct a primitive structural parent whose admitted DR has two premise templates and whose dependency sequence is deliberately:

```ts
const shared = leftProof;
const dependencies = materializeExactSequence(memory, [shared, shared]);
const parentSupport = memory.ensure(parentDr, dependencies);
const parentOccurrence = memory.ensure(parentClaim, parentSupport);
```

Verify source K1 accepts it and then export/replay through the portable projection artifact. In the restored memory inspect the parent dependency sequence through accepted structural readers/`readExactSequence()` and assert:

```ts
same(restoredDependencies.length, 2, "two exact dependency slots survive");
same(restoredDependencies[0], restoredDependencies[1], "same occurrence occupies both slots");
```

- [ ] **Step 2: Verify RED if any serializer deduplicates**

The test must fail if topology support/export loses one occurrence slot.

- [ ] **Step 3: Add sequence reorder mutation**

Use a two-distinct-dependency structural parent, mutate only the restored ExactSequence topology so dependency order is reversed while keeping coordinates syntactically valid, and require trusted replay rejection (`template-mismatch`, `invalid-premise-proof`, or the mapped portable error). The assertion is rejection, not a host-computed expected proof.

- [ ] **Step 4: Add cross-artifact coordinate falsifier**

Take a valid coordinate from a second artifact and place its numeric value into the first artifact. If out of range, require `invalid-coordinate`; if numerically in range but structurally wrong, require trusted replay rejection. A coordinate is local to one canonical topology and never a global proof ID.

- [ ] **Step 5: GREEN and commit**

```bash
cd ts
npm test
git add ts/test/portable-proof-subanet-projection.test.ts
git commit -m "test(proof): preserve exact duplicate dependency slots"
```

---

### Task 8 (E1g): Package-root-only T4/T5 A-SYNC1 upstream witness

**Files:**
- Create: `ts/consumer/portable-t4-t5-witness.ts`
- Modify: `ts/tsconfig.consumer.json` only if the existing include set does not already compile the new consumer file.
- Modify: `ts/consumer/package-consumer.ts` only for shared package-root fixture helpers if needed.

**Rule:** This witness may import only `@mts/core`. It may not import `../src/**`.

- [ ] **Step 1: RED package-only T4 witness**

Recreate the accepted T4 evidence construction using only package-root construction APIs. Produce:

```ts
const t4Artifact = exportPortableProofSubAnetProjection(memory, {
  theory,
  schemaDerivationRule: t4ProjectionSchema,
  premiseProofOccurrence: t4PremiseProof,
});
const acceptedT4 = replayPortableProofSubAnetProjection(t4Artifact);
```

Require the T4 projection schema to remain unadmitted and require no primitive successor-injectivity Rule/DR admission.

- [ ] **Step 2: Export only missing generic construction helpers**

If compilation proves a construction helper is required, export that existing generic helper from `public.ts` with its type. Do not add theorem-specific constructors, opcodes, or callbacks.

- [ ] **Step 3: GREEN T4 store/reload simulation**

Round-trip `t4Artifact` through `JSON.stringify/parse`, verify exact Theory revision, replay again, and assert structural projected Claim equivalence by portable topology—not cross-Memory handle identity.

- [ ] **Step 4: RED then GREEN T5 consumption of reloaded T4 evidence**

Construct the accepted generic T5 path with the reloaded T4 occurrence feeding the exact dependency slots. Use package-root K1d3/K1d4/K1e operations only. Require fresh exact-Theory replay to accept the final T5 proof and require the stored artifact object by itself to have no `approved`/truth flag.

- [ ] **Step 5: Add required A-SYNC1 negatives**

```text
wrong Theory -> REJECT
mutated T4 artifact -> REJECT
theorem record without replayable proof -> ZERO authority
T5 construction without T4 evidence -> REJECT
primitive T4 Rule/DR admission -> absent
primitive T5 Rule/DR admission -> absent
```

- [ ] **Step 6: Package check and commit**

```bash
cd ts
npm run build
npm run package:check
npm test
git add ts/src/public.ts ts/consumer/portable-t4-t5-witness.ts ts/tsconfig.consumer.json ts/consumer/package-consumer.ts
git commit -m "test(core): prove package-root T4 to T5 reuse witness"
```

---

### Task 9 (E1h): Artifact identity, full gates, and upstream handoff

**Files:**
- Modify: `ts/test/package-artifact.test.ts` only if the existing artifact test needs the new package-root API names asserted.
- No semantic-contract files.

- [ ] **Step 1: Run the full local gate set**

```bash
cd ts
npm run check
npm run package:artifact
```

Record the generated `@mts/core` tarball SHA-256 from the exact PR head. The SHA is a lock/integrity identity, never proof truth.

- [ ] **Step 2: Confirm package contents expose root declarations only**

Inspect the packed tarball and compile the consumer witness against the package root. No `src/**` deep import may appear in consumer source.

- [ ] **Step 3: Run repository gates**

Require GitHub project CI and blocking repo-guard GREEN on the exact stable head. Confirm the diff excludes:

```text
contracts/**
cutover/**
traceability/**
repo-policy.json
```

- [ ] **Step 4: Record acceptance evidence in `anum_docs#1122`**

Post exact:

```text
PR number
stable head SHA
base main SHA
TypeScript test count
project CI run/result
repo-guard run/result
@mts/core version
package tarball SHA-256
portable artifact schema
content digest scheme
T4/T5 package-root witness result
accepted semantic delta = NONE
```

- [ ] **Step 5: Merge with exact head guard and verify post-merge main**

Merge only when behind-by is zero, mergeable is true, draft is false, required checks are green, and `expected_head_sha` equals the stable reviewed head. Then require post-merge main CI GREEN.

- [ ] **Step 6: Unblock downstream without repinning it in this transaction**

Comment on `aprover#247` with only the newly accepted upstream main SHA and exact package tarball SHA-256. Downstream then performs its own fresh exact repin and A-SYNC1 E2E transaction.

---

## Self-review against `#1122`

- Variant B only: covered by Tasks 1–3 and global constraints.
- Same trusted replay/read observation, no second proof walker: Task 1.
- Coordinate-only artifact with no projected occurrence/rho/proof kind: Task 2 + Task 6.
- Canonical allocation-independent topology: Task 2.
- Existing domain-separated SHA-256 law: Task 3.
- Exact external Theory binding: Task 4.
- Package-root-only consumer boundary: Task 5 + Task 8.
- Generic non-Nat first: Tasks 1–7 precede T4/T5 Task 8.
- K1e 0/1/>1 and unreachable ambient falsifiers: Task 6.
- Duplicate exact dependency slots/order: Task 7.
- T4/T5 reuse without primitive promotion: Task 8.
- Artifact identity/full gates/downstream handoff: Task 9.
- Semantic contract files untouched and `accepted semantic delta = NONE`: global constraints + Task 9.

No task introduces a proof AST, proof kind, theorem dispatcher, trusted host rho, primitive T4/T5 admission, Nat/Succ opcode, ambient Memory authority, or theorem-record truth.
