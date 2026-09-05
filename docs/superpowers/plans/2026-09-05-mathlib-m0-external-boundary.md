# Mathlib M0 External Boundary Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce deterministic, fail-closed evidence that classifies every external Lean `ConstantInfo` reference left by the 10-declaration Mathlib M0 transport corpus, validate that evidence independently in TypeScript, and derive `unsupported` / `blocked-by-dependency` research dispositions without expanding MTS semantics or pretending the corpus is dependency-closed.

**Architecture:** Keep `mts-mathlib-m0-transport/v0.1` byte/identity semantics unchanged. The untrusted Lean exporter emits a second research-only `mts-mathlib-m0-external-boundary/v0.1` JSON artifact from the same pinned `Environment`; a strict TypeScript parser validates it, the live workflow validates both artifacts, and a pure result-accounting helper derives only boundary-caused `unsupported` / `blocked-by-dependency` states while leaving otherwise eligible declarations unclassified for the future MTS encoder.

**Tech Stack:** Lean 4 `leanprover/lean4:v4.34.0-rc2`, pinned mathlib4 `d6893048e0d784c43f3cf098b61299b3a4b4aed0`, TypeScript/Node 24, GitHub Actions, existing MTS v0.11 core.

**Spec:** `docs/superpowers/specs/2026-09-05-mathlib-m0-external-boundary-design.md`

## Global Constraints

- Accepted MTS remains v0.11; no v0.12 candidate is created or implied.
- Do not modify `contracts/**`, `cutover/**`, `traceability/**`, or `repo-policy.json`.
- Do not alter `mts-mathlib-m0-transport/v0.1` schema or its canonical digest scheme.
- Lean exporter, TypeScript parser, and boundary classifier remain untrusted research tooling.
- Do not add proof translation for `inductInfo`, `ctorInfo`, `recInfo`, `opaqueInfo`, or `quotInfo`.
- Unknown or malformed boundary data must fail closed; no `unknown` success category.
- Current exact pins remain mathlib `d6893048e0d784c43f3cf098b61299b3a4b4aed0` and Lean `leanprover/lean4:v4.34.0-rc2`.
- PR #983 stays Draft throughout this slice; repo-guard SKIPPED is expected while Draft.

---

### Task 1: Strict TypeScript external-boundary parser

**Files:**
- Create: `ts/src/mathlib-m0-external-boundary.ts`
- Create: `ts/test/mathlib-m0-external-boundary.test.ts`

**Interfaces:**
- Consumes: JSON-compatible `unknown` values and the existing upstream pin shape `{ mathlibSha, leanToolchain }`.
- Produces: `parseMathlibM0ExternalBoundary(input: unknown): MathlibM0ExternalBoundary`.
- Produces constants/types: `MATHLIB_M0_EXTERNAL_BOUNDARY_SCHEMA`, `MathlibM0ConstantInfoKind`, `MathlibM0ExternalBoundaryEntry`, `MathlibM0ExternalBoundary`, `MathlibM0ExternalBoundaryError`.

- [ ] **Step 1: Write the failing parser tests**

Create fixtures around this exact accepted shape:

```ts
const validBoundary = {
  schema: "mts-mathlib-m0-external-boundary/v0.1",
  upstream: {
    mathlibSha: "d6893048e0d784c43f3cf098b61299b3a4b4aed0",
    leanToolchain: "leanprover/lean4:v4.34.0-rc2",
  },
  entries: [
    { qualifiedName: "Eq", constantInfoKind: "inductive", referencedBy: ["Ne"] },
    { qualifiedName: "False", constantInfoKind: "inductive", referencedBy: ["Not"] },
    {
      qualifiedName: "Membership",
      constantInfoKind: "inductive",
      referencedBy: ["Membership.mem", "Set.instMembership"],
    },
    {
      qualifiedName: "Membership.mk",
      constantInfoKind: "constructor",
      referencedBy: ["Set.instMembership"],
    },
  ],
};
```

Assert acceptance plus rejection of: wrong schema, non-40-hex SHA, empty toolchain, unknown `constantInfoKind`, duplicate/unsorted `qualifiedName`, duplicate/unsorted `referencedBy`, missing fields, and extra fields.

- [ ] **Step 2: Run the TypeScript suite and verify RED**

Run through repository CI (`npm --prefix ts run check` on the exact head). Expected: TypeScript/tests fail because `mathlib-m0-external-boundary.ts` and `parseMathlibM0ExternalBoundary` do not exist.

- [ ] **Step 3: Implement the minimal strict parser**

Use the exact enum:

```ts
export type MathlibM0ConstantInfoKind =
  | "axiom"
  | "definition"
  | "theorem"
  | "opaque"
  | "quotient"
  | "inductive"
  | "constructor"
  | "recursor";
```

The parser must require exact record keys, non-empty strings, exact upstream shape, sorted unique `entries` by `qualifiedName`, and sorted unique `referencedBy`. Return frozen data. Do not import proof/replay code.

- [ ] **Step 4: Run the TypeScript suite and verify GREEN**

Run `npm --prefix ts run check`. Expected: all existing and new tests pass.

- [ ] **Step 5: Commit**

Commit message: `feat: validate Mathlib M0 external boundary evidence`.

---

### Task 2: Lean exporter emits deterministic boundary evidence

**Files:**
- Modify: `research/mathlib-m0/lean/Export.lean`
- Modify: `ts/test/mathlib-m0-export-contract.test.ts`

**Interfaces:**
- Consumes: the already-built topologically sorted `List ExportNode`, the pinned Lean `Environment`, and new required env variable `MATHLIB_M0_BOUNDARY_OUTPUT`.
- Produces: a second JSON document with schema `mts-mathlib-m0-external-boundary/v0.1`.
- Does not change: existing `corpus-export.json` structure or digest identity.

- [ ] **Step 1: Add test-only RED contract assertions**

Require `Export.lean` to:

```text
read MATHLIB_M0_BOUNDARY_OUTPUT
classify every ConstantInfo constructor exhaustively
emit schema mts-mathlib-m0-external-boundary/v0.1
derive referencedBy from ExportNode.externalDependencies
write the second JSON artifact
```

The source contract must explicitly require cases `.axiomInfo`, `.defnInfo`, `.thmInfo`, `.opaqueInfo`, `.quotInfo`, `.inductInfo`, `.ctorInfo`, `.recInfo` and must not accept a wildcard as an `unknown` classification.

- [ ] **Step 2: Run CI and verify RED**

Expected failure: `mathlib-m0-export-contract.test` reports missing external-boundary emission/classification. Existing transport tests remain otherwise unchanged.

- [ ] **Step 3: Implement deterministic Lean boundary collection**

Add an exhaustive classifier equivalent to:

```lean
private def constantInfoKind : ConstantInfo → String
  | .axiomInfo _ => "axiom"
  | .defnInfo _ => "definition"
  | .thmInfo _ => "theorem"
  | .opaqueInfo _ => "opaque"
  | .quotInfo _ => "quotient"
  | .inductInfo _ => "inductive"
  | .ctorInfo _ => "constructor"
  | .recInfo _ => "recursor"
```

For each unique `externalDependencies` name, call `env.find?`; absence is an error. Build `referencedBy` from actual `ExportNode.qualifiedName` occurrences, sort/unique both axes, and emit:

```json
{
  "schema": "mts-mathlib-m0-external-boundary/v0.1",
  "upstream": { "mathlibSha": "...", "leanToolchain": "..." },
  "entries": [
    { "qualifiedName": "...", "constantInfoKind": "...", "referencedBy": ["..."] }
  ]
}
```

Require `MATHLIB_M0_BOUNDARY_OUTPUT` using the existing `requireEnv` pattern and write it only after successful node construction/toposort. Do not add any boundary field to the existing transport document.

- [ ] **Step 4: Run CI and verify GREEN before live workflow changes**

Expected: TypeScript source-contract test GREEN. Live workflow may still fail to supply `MATHLIB_M0_BOUNDARY_OUTPUT`; that is intentionally addressed in Task 3.

- [ ] **Step 5: Commit**

Commit message: `feat: export Mathlib M0 external boundary evidence`.

---

### Task 3: Live pinned workflow validates both artifacts

**Files:**
- Modify: `.github/workflows/mathlib-m0-export.yml`
- Modify: `ts/test/mathlib-m0-export-contract.test.ts`

**Interfaces:**
- Consumes: `parseMathlibM0TransportBundle()` and `parseMathlibM0ExternalBoundary()` from the exact research head.
- Produces artifacts: `corpus-export.json`, `external-boundary.json`, `run-metadata.json` under `mathlib-m0-artifacts/`.

- [ ] **Step 1: Add test-only RED workflow assertions**

Require the workflow to watch `ts/src/mathlib-m0-external-boundary.ts`, set `MATHLIB_M0_BOUNDARY_OUTPUT` for both exporter passes, compare both boundary outputs byte-for-byte, and invoke `parseMathlibM0ExternalBoundary()` on the live boundary artifact.

- [ ] **Step 2: Run CI and verify RED**

Expected failure: workflow source contract reports missing boundary-output wiring/live parser validation.

- [ ] **Step 3: Wire deterministic double export**

For each pass set both:

```bash
MATHLIB_M0_OUTPUT="$artifact_dir/corpus-export-$pass.json" \
MATHLIB_M0_BOUNDARY_OUTPUT="$artifact_dir/external-boundary-$pass.json" \
MATHLIB_M0_MATHLIB_SHA="$MATHLIB_SHA" \
MATHLIB_M0_LEAN_TOOLCHAIN="$LEAN_TOOLCHAIN" \
  lake env lean "$exporter"
```

Then `cmp` both transport files and both boundary files, rename pass 1 to `corpus-export.json` / `external-boundary.json`, and remove pass 2.

- [ ] **Step 4: Validate the live boundary in TypeScript**

Extend the existing Node validation step to load both files. After parsing, require boundary upstream pins to equal the transport/pinned values. Also verify every boundary `referencedBy` name exists in the transport declaration set and that every declared `externalDependencies` name appears in exactly one boundary entry.

- [ ] **Step 5: Run ordinary CI and exact pinned live workflow**

Expected ordinary CI: GREEN. Expected live workflow: deterministic Lean export GREEN, transport parser GREEN, boundary parser GREEN, artifact upload GREEN.

- [ ] **Step 6: Download and independently inspect the exact-head artifact**

Verify: 10 transport declarations; boundary entries sorted/unique; actual pinned classifications are derived rather than hard-coded. Record exact names/kinds/reference edges from the artifact.

- [ ] **Step 7: Commit**

Commit message: `ci: validate Mathlib M0 external boundary artifact`.

---

### Task 4: Derive fail-closed boundary dispositions without fake theorem results

**Files:**
- Modify: `ts/src/mathlib-m0-result-accounting.ts`
- Modify: `ts/test/mathlib-m0-result-accounting.test.ts`

**Interfaces:**
- Consumes: parsed/parseable transport bundle and parsed/parseable external-boundary artifact.
- Produces:

```ts
export interface MathlibM0BoundaryDisposition {
  readonly qualifiedName: string;
  readonly disposition: "unsupported" | "blocked-by-dependency" | null;
  readonly unsupportedExternalDependencies: readonly string[];
}

export function deriveMathlibM0BoundaryDispositions(
  transportInput: unknown,
  boundaryInput: unknown,
): readonly MathlibM0BoundaryDisposition[];
```

`null` means only “not blocked by this external-boundary audit”; it does NOT mean translated or approved.

- [ ] **Step 1: Write failing propagation tests**

Construct a small topologically ordered transport fixture where declaration `A` directly references an external boundary entry, `B` depends on `A`, and `C` has neither. Assert:

```text
A -> unsupported
B -> blocked-by-dependency
C -> null
```

Also assert boundary/transport upstream mismatch, missing boundary entry for a declared external dependency, stale boundary entry not referenced by transport, and mismatched `referencedBy` all fail closed.

- [ ] **Step 2: Run TypeScript tests and verify RED**

Expected: `deriveMathlibM0BoundaryDispositions` is absent.

- [ ] **Step 3: Implement minimal propagation**

Parse both artifacts. Establish exact external-reference identity first. Iterate transport declarations in their validated topological order:

```ts
if (declaration.externalDependencies.length > 0) disposition = "unsupported";
else if (declaration.dependencies.some(dep => blocked.has(dep))) disposition = "blocked-by-dependency";
else disposition = null;
```

Record only the direct external names in `unsupportedExternalDependencies`; blocked declarations get an empty list. Never synthesize `translated`, MTS evidence digests, approver digests, `approved`, or `rejected` here.

- [ ] **Step 4: Run TypeScript suite and verify GREEN**

Expected: all result-accounting and transport tests pass.

- [ ] **Step 5: Apply the helper to the downloaded live 10-declaration artifact**

Record exact counts of direct `unsupported`, transitive `blocked-by-dependency`, and `null` declarations. Treat these as research evidence only.

- [ ] **Step 6: Commit**

Commit message: `feat: classify Mathlib M0 boundary-blocked declarations`.

---

### Task 5: Audit evidence and governance checkpoint

**Files:**
- No MTS semantic/control files.
- Update only research documentation/PR/issue commentary if needed to record observed evidence.

**Interfaces:**
- Consumes exact-head CI, exact pinned live workflow artifact, and Task 4 disposition output.
- Produces a durable research checkpoint stating whether current corpus is dependency-closed and what exact unsupported kernel boundary prevents admission.

- [ ] **Step 1: Run exact-head verification**

Require: ordinary CI GREEN; Mathlib M0 pinned export GREEN; repo-guard SKIPPED only because PR remains Draft; PR mergeable; base `main` unchanged or explicitly re-evaluated if it moved.

- [ ] **Step 2: Verify hard boundaries by diff**

Confirm no changes under `contracts/**`, `cutover/**`, `traceability/**`, or `repo-policy.json`; transport v0.1 schema/digest identity unchanged; no inductive/constructor proof translation exists.

- [ ] **Step 3: Record the live boundary result**

Add a concise #969 / PR #983 research note with: exact research head, exact upstream pins, 10-declaration transport count, exact boundary entries/kinds, derived unsupported/blocked counts, and explicit statement that the dependency-closed acceptance checkbox remains OPEN.

- [ ] **Step 4: Stop at the decision boundary**

Do not add `inductInfo` / `ctorInfo` transport automatically. Use the live audit to decide separately between a different seed or a separately authorized minimal inductive/constructor structural slice.
