# Mathlib M0 External Boundary Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce deterministic, fail-closed evidence for every external Lean `ConstantInfo` reference left by the 10-declaration Mathlib M0 transport corpus, validate it independently in TypeScript, and derive research-only `unsupported` / `blocked-by-dependency` dispositions.

**Architecture:** Keep `mts-mathlib-m0-transport/v0.1` and its digest identity unchanged. The untrusted Lean exporter emits a second `mts-mathlib-m0-external-boundary/v0.1` JSON artifact from the same pinned `Environment`; a strict TypeScript parser validates it; the live workflow validates both artifacts; a pure accounting helper derives only boundary-caused blocking states and never fabricates theorem acceptance.

**Tech Stack:** Lean 4 `leanprover/lean4:v4.34.0-rc2`, mathlib4 `d6893048e0d784c43f3cf098b61299b3a4b4aed0`, TypeScript/Node 24, GitHub Actions, accepted MTS v0.11.

**Spec:** `docs/superpowers/specs/2026-09-05-mathlib-m0-external-boundary-design.md`

## Global Constraints

- Accepted MTS stays v0.11; do not create or imply v0.12.
- Do not modify `contracts/**`, `cutover/**`, `traceability/**`, or `repo-policy.json`.
- Do not change `mts-mathlib-m0-transport/v0.1` or its canonical digest scheme.
- Exporter/parser/classifier are untrusted research tooling, never proof authority.
- Do not add proof translation for `inductInfo`, `ctorInfo`, `recInfo`, `opaqueInfo`, or `quotInfo`.
- No `unknown` success category: malformed/new forms fail closed.
- Exact pins remain mathlib `d6893048e0d784c43f3cf098b61299b3a4b4aed0` and Lean `leanprover/lean4:v4.34.0-rc2`.
- PR #983 remains Draft throughout this slice.

---

### Task 1: Strict TypeScript external-boundary parser

**Files:**
- Create: `ts/src/mathlib-m0-external-boundary.ts`
- Create: `ts/test/mathlib-m0-external-boundary.test.ts`

**Interfaces:**

```ts
export const MATHLIB_M0_EXTERNAL_BOUNDARY_SCHEMA =
  "mts-mathlib-m0-external-boundary/v0.1" as const;

export type MathlibM0ConstantInfoKind =
  | "axiom"
  | "definition"
  | "theorem"
  | "opaque"
  | "quotient"
  | "inductive"
  | "constructor"
  | "recursor";

export interface MathlibM0ExternalBoundaryEntry {
  readonly qualifiedName: string;
  readonly constantInfoKind: MathlibM0ConstantInfoKind;
  readonly referencedBy: readonly string[];
}

export interface MathlibM0ExternalBoundary {
  readonly schema: typeof MATHLIB_M0_EXTERNAL_BOUNDARY_SCHEMA;
  readonly upstream: Readonly<{
    mathlibSha: string;
    leanToolchain: string;
  }>;
  readonly entries: readonly MathlibM0ExternalBoundaryEntry[];
}

export function parseMathlibM0ExternalBoundary(input: unknown): MathlibM0ExternalBoundary;
```

- [ ] **Step 1: Write test-only RED**

Use this exact accepted fixture:

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

Reject wrong schema, non-40-hex SHA, empty toolchain, unknown kind, duplicate/unsorted entry names, duplicate/unsorted `referencedBy`, missing keys, and extra keys.

- [ ] **Step 2: Commit RED**

Commit message: `test: require Mathlib M0 external boundary parser`.

- [ ] **Step 3: Verify RED in exact-head CI**

Expected failure: TypeScript compile/test fails because `parseMathlibM0ExternalBoundary` does not exist. Other ordinary jobs remain GREEN.

- [ ] **Step 4: Implement minimal strict parser**

Follow existing transport parser patterns: exact records, explicit enum, sorted/unique checks, frozen results, no proof/replay imports.

- [ ] **Step 5: Commit GREEN candidate**

Commit message: `feat: validate Mathlib M0 external boundary evidence`.

- [ ] **Step 6: Verify ordinary CI GREEN**

Run the repository CI on that exact head and require the TypeScript job to pass.

---

### Task 2: Lean exporter emits deterministic boundary evidence

**Files:**
- Modify: `research/mathlib-m0/lean/Export.lean`
- Modify: `ts/test/mathlib-m0-export-contract.test.ts`

**Interfaces:**
- New required environment variable: `MATHLIB_M0_BOUNDARY_OUTPUT`.
- Second output schema: `mts-mathlib-m0-external-boundary/v0.1`.
- Existing transport output is untouched.

- [ ] **Step 1: Add source-contract RED assertions**

Require `Export.lean` to read `MATHLIB_M0_BOUNDARY_OUTPUT`, emit the boundary schema, derive `referencedBy` from `ExportNode.externalDependencies`, and explicitly match all eight `ConstantInfo` cases.

The production classifier must be exactly exhaustive in intent:

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

- [ ] **Step 2: Commit and verify RED**

Commit message: `test: require Mathlib M0 boundary export evidence`.
Expected failure: `mathlib-m0-export-contract.test` reports missing boundary emission/classification.

- [ ] **Step 3: Implement deterministic boundary collection**

For every unique external dependency in the built transport nodes:
1. resolve it with `env.find?`, failing if absent;
2. classify its `ConstantInfo` with the exhaustive function above;
3. gather all referencing exported declaration names;
4. sort/unique entries by external `qualifiedName` and `referencedBy` by name;
5. emit one document with the same exact upstream pins.

Concrete output for the currently known live boundary is expected to have the shape:

```json
{
  "schema": "mts-mathlib-m0-external-boundary/v0.1",
  "upstream": {
    "mathlibSha": "d6893048e0d784c43f3cf098b61299b3a4b4aed0",
    "leanToolchain": "leanprover/lean4:v4.34.0-rc2"
  },
  "entries": [
    { "qualifiedName": "Eq", "constantInfoKind": "inductive", "referencedBy": ["Ne"] }
  ]
}
```

Production code derives all entries from the `Environment`; it must not hard-code `Eq`, `False`, `Membership`, or `Membership.mk`.

- [ ] **Step 4: Commit exporter GREEN candidate**

Commit message: `feat: export Mathlib M0 external boundary evidence`.

- [ ] **Step 5: Verify ordinary CI GREEN**

Do not interpret the live exporter gate yet: until Task 3 wires the new env var, its failure is expected and is not evidence against the Lean implementation.

---

### Task 3: Live pinned workflow validates both artifacts

**Files:**
- Modify: `.github/workflows/mathlib-m0-export.yml`
- Modify: `ts/test/mathlib-m0-export-contract.test.ts`

**Interfaces:**
- Inputs: exact-head exporter and `parseMathlibM0ExternalBoundary()`.
- Uploaded outputs: `corpus-export.json`, `external-boundary.json`, `run-metadata.json`.

- [ ] **Step 1: Add workflow-contract RED**

Require the workflow to watch `ts/src/mathlib-m0-external-boundary.ts`, provide `MATHLIB_M0_BOUNDARY_OUTPUT` on both exporter passes, byte-compare both boundary files, and invoke `parseMathlibM0ExternalBoundary()` on the live file.

- [ ] **Step 2: Commit and verify RED**

Commit message: `test: require live Mathlib M0 boundary validation`.
Expected failure: TypeScript source-contract test reports missing workflow wiring.

- [ ] **Step 3: Wire deterministic double export**

Use exactly:

```bash
MATHLIB_M0_OUTPUT="$artifact_dir/corpus-export-$pass.json" \
MATHLIB_M0_BOUNDARY_OUTPUT="$artifact_dir/external-boundary-$pass.json" \
MATHLIB_M0_MATHLIB_SHA="$MATHLIB_SHA" \
MATHLIB_M0_LEAN_TOOLCHAIN="$LEAN_TOOLCHAIN" \
  lake env lean "$exporter"
```

Then compare both pairs, keep pass 1 as `corpus-export.json` and `external-boundary.json`, and delete pass 2.

- [ ] **Step 4: Extend live Node validation**

Parse both artifacts. Require identical upstream pins. Build the exact set of external names and `(externalName, referencedBy)` edges from the transport declarations; require the boundary artifact to describe exactly that set—no missing or stale entries.

- [ ] **Step 5: Commit workflow GREEN candidate**

Commit message: `ci: validate Mathlib M0 external boundary artifact`.

- [ ] **Step 6: Verify exact-head ordinary CI and pinned live workflow GREEN**

Require deterministic double export, transport parser, boundary parser, and upload all GREEN on the same head.

- [ ] **Step 7: Download and independently audit the live artifact**

Verify transport declaration count is 10 and record the actual boundary names, kinds, and reference edges. If a new kind/name appears, stop and treat it as falsification evidence rather than widening support automatically.

---

### Task 4: Derive boundary-caused result dispositions

**Files:**
- Modify: `ts/src/mathlib-m0-result-accounting.ts`
- Modify: `ts/test/mathlib-m0-result-accounting.test.ts`

**Interface:**

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

`null` means only “not blocked by this boundary audit”; it never means translated or approved.

- [ ] **Step 1: Write and commit RED**

Fixture topology:

```text
A has external dependency Eq     -> unsupported
B depends on A                   -> blocked-by-dependency
C has neither                    -> null
```

Also reject upstream mismatch, missing boundary entry, stale boundary entry, and wrong `referencedBy` identity.
Commit message: `test: require Mathlib M0 boundary disposition propagation`.

- [ ] **Step 2: Verify RED in exact-head CI**

Expected failure: helper absent.

- [ ] **Step 3: Implement exact identity validation and propagation**

After both parsers succeed, verify boundary entries exactly match transport external references. Iterate validated topological transport order:

```ts
if (declaration.externalDependencies.length > 0) {
  disposition = "unsupported";
} else if (declaration.dependencies.some((name) => blocked.has(name))) {
  disposition = "blocked-by-dependency";
} else {
  disposition = null;
}
```

Only direct unsupported declarations carry their external names in `unsupportedExternalDependencies`. Never synthesize `translated`, evidence digests, approver digests, `approved`, or `rejected`.

- [ ] **Step 4: Commit GREEN candidate**

Commit message: `feat: classify Mathlib M0 boundary-blocked declarations`.

- [ ] **Step 5: Verify TypeScript/ordinary CI GREEN**

- [ ] **Step 6: Apply helper to the downloaded live 10-declaration pair**

Record exact counts for `unsupported`, `blocked-by-dependency`, and `null` as research evidence only.

---

### Task 5: Governance checkpoint and research record

**Files/records:**
- Do not edit MTS semantic/control files.
- Add one top-level comment to issue #969 with exact evidence.
- Update PR #983 body only if its “Current evidence / Still in progress” summary has become materially stale.

- [ ] **Step 1: Re-read fresh `main`, #969, #983, `repo-policy.json`, and exact-head checks**

Require PR still Draft and mergeable. Repo-guard SKIPPED is acceptable only because Draft.

- [ ] **Step 2: Compare PR against base and verify hard boundaries**

Confirm no changes under `contracts/**`, `cutover/**`, `traceability/**`, or `repo-policy.json`; no change to transport v0.1 identity; no inductive/constructor proof translation.

- [ ] **Step 3: Record exact research evidence in #969**

The comment must include: research head SHA, exact upstream pins, transport count 10, exact boundary entries/kinds/reference edges, derived disposition counts, and an explicit statement that the “10–100 declaration dependency-closed corpus” checkbox remains OPEN.

- [ ] **Step 4: Stop at the decision boundary**

Do not add `inductInfo` or `ctorInfo` structural/proof transport in this plan. The next decision is separately evidence-driven: choose a different seed or authorize a new minimal inductive/constructor slice.
