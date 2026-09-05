# Mathlib M0 Π/→ Proof Corpus Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the falsified Pairwise seed with the approved pure Π/→ proof corpus, prove that its exact pinned Lean closure stays inside the existing `mts-mathlib-m0-transport/v0.1` declaration subset, and fail the live gate unless the external kernel boundary is empty.

**Architecture:** Keep the existing structural Lean exporter, transport schema, external-boundary schema, and result-accounting logic unchanged. Change only source provenance, source roots/import, and the live dependency-closure acceptance gate. The subsequent MTS proof encoder is deliberately out of scope until a live pinned run proves `external-boundary.entries.length === 0`.

**Tech Stack:** Lean 4 `leanprover/lean4:v4.34.0-rc2`, pinned mathlib4 `d6893048e0d784c43f3cf098b61299b3a4b4aed0`, TypeScript 5.9, Node.js, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-05-mathlib-m0-pi-proof-corpus-cutover-design.md`

**Semantic guardrail:** `docs/superpowers/specs/2026-09-05-mts-proof-semantics-guardrail-design.md`

## Global Constraints

- Accepted MTS semantics remain v0.11; this plan introduces no semantic/foundational delta.
- Do not imply or create MTS v0.12.
- Keep `mts-mathlib-m0-transport/v0.1` unchanged.
- Keep `mts-mathlib-m0-external-boundary/v0.1` unchanged.
- Do not add inductive/constructor/recursor transport support in this slice.
- Do not allowlist external Lean names or shrink recursive closure to make the corpus pass.
- Do not modify `contracts/**`, `cutover/**`, `traceability/**`, or `repo-policy.json`.
- Lean/exporter output remains untrusted; empty external boundary is transport closure only, not theorem acceptance.
- MTS proof semantics remain MTS-native: link/non-link truth, structural comparison, contextual execution/substitution, and relation composition are the interpretation guardrail; no second conventional logic is introduced here.
- Any unsupported `ConstantInfo`, `Expr`, or `Level` found by the exact pinned live run stops this plan as falsification evidence.

---

### Task 1: Cut the active corpus from Pairwise to the exact Π/→ roots

**Files:**
- Modify: `ts/test/mathlib-m0-export-contract.test.ts`
- Modify: `research/mathlib-m0/corpus-seed.json`
- Modify: `research/mathlib-m0/corpus-reproduction.json`
- Modify: `research/mathlib-m0/lean/Export.lean`

**Interfaces:**
- Consumes: existing `collectDependencyClosure(env, corpusRoots)`, structural `Expr`/`Level` serializers, exact upstream pins.
- Produces: exact ten source-level roots plus exact three-entry `sources[]` provenance, with the exporter using `Mathlib.Logic.Function.Basic` as the umbrella import.

- [ ] **Step 1: Write the failing corpus-selection contract test**

Replace the old Pairwise-specific manifest/exporter assertions in `ts/test/mathlib-m0-export-contract.test.ts` with exact assertions equivalent to:

```ts
type SourcePin = {
  module: string;
  path: string;
  blobSha: string;
};

const corpusSeed = JSON.parse(readFileSync(corpusSeedPath, "utf8")) as {
  roots?: unknown;
  source?: unknown;
  sources?: unknown;
};
const reproduction = JSON.parse(readFileSync(reproductionPath, "utf8")) as {
  source?: unknown;
  sources?: unknown;
  selection?: { roots?: unknown };
};

const expectedRoots = [
  "Function.eval",
  "hidden",
  "Function.swap₂",
  "Function.dcomp",
  "Function.onFun",
  "Function.swap",
  "Function.bicompl",
  "Function.bicompr",
  "Pi.map",
  "forall₃_imp",
];

const expectedSources: SourcePin[] = [
  {
    module: "Mathlib.Logic.Function.Basic",
    path: "Mathlib/Logic/Function/Basic.lean",
    blobSha: "e32127e286544f7ecdbd488c9787b85bee4548ba",
  },
  {
    module: "Mathlib.Logic.Function.Defs",
    path: "Mathlib/Logic/Function/Defs.lean",
    blobSha: "565ae3df6b95fa084d60818ab13fab2e80874f3f",
  },
  {
    module: "Mathlib.Basic.Logic.Basic",
    path: "Mathlib/Basic/Logic/Basic.lean",
    blobSha: "1b8251cc298129bb6613435742ca7cb9ab553df2",
  },
];

assert(
  JSON.stringify(corpusSeed.roots) === JSON.stringify(expectedRoots) &&
    JSON.stringify(reproduction.selection?.roots) === JSON.stringify(expectedRoots),
  "Mathlib M0 manifests must pin the approved Π/→ source roots",
);
assert(
  JSON.stringify(corpusSeed.sources) === JSON.stringify(expectedSources) &&
    JSON.stringify(reproduction.sources) === JSON.stringify(expectedSources),
  "Mathlib M0 manifests must pin exact root-source provenance",
);
assert(
  !("source" in corpusSeed) && !("source" in reproduction),
  "multi-source Π/→ provenance must not retain the obsolete singular source field",
);
assert(
  source.includes("import Mathlib.Logic.Function.Basic") &&
    !source.includes("import Mathlib.Logic.Pairwise"),
  "exporter must import the approved Π/→ umbrella module",
);
assert(
  expectedRoots.every((root) => source.includes(```${root}`)),
  "Lean exporter must use every approved Π/→ source root",
);
assert(
  !source.includes("``Pairwise.set_pairwise"),
  "Lean exporter must not retain the falsified Pairwise root as active selection",
);
```

Keep all existing assertions that protect post-elaboration environment use, recursive closure, structural transport, exhaustive boundary classification, and no source-text evidence parsing.

- [ ] **Step 2: Run the focused test and verify RED**

Run from `ts/`:

```bash
npm run build --silent
node dist/test/mathlib-m0-export-contract.test.js
```

Expected: FAIL on the new roots/provenance/import assertions because the branch still uses `Pairwise.set_pairwise` and singular `source`.

- [ ] **Step 3: Replace both manifests with the approved roots and `sources[]`**

In `research/mathlib-m0/corpus-seed.json`, preserve schema/upstream/semantics and replace `source` + roots with:

```json
"sources": [
  {
    "module": "Mathlib.Logic.Function.Basic",
    "path": "Mathlib/Logic/Function/Basic.lean",
    "blobSha": "e32127e286544f7ecdbd488c9787b85bee4548ba"
  },
  {
    "module": "Mathlib.Logic.Function.Defs",
    "path": "Mathlib/Logic/Function/Defs.lean",
    "blobSha": "565ae3df6b95fa084d60818ab13fab2e80874f3f"
  },
  {
    "module": "Mathlib.Basic.Logic.Basic",
    "path": "Mathlib/Basic/Logic/Basic.lean",
    "blobSha": "1b8251cc298129bb6613435742ca7cb9ab553df2"
  }
],
"roots": [
  "Function.eval",
  "hidden",
  "Function.swap₂",
  "Function.dcomp",
  "Function.onFun",
  "Function.swap",
  "Function.bicompl",
  "Function.bicompr",
  "Pi.map",
  "forall₃_imp"
]
```

In `research/mathlib-m0/corpus-reproduction.json`, use the same exact `sources[]` and the same root list under `selection.roots`. Preserve the 10–100 bounds, recursive-closure policy, transport schema, output path, and fail-closed settings.

- [ ] **Step 4: Cut over only the exporter import and root list**

At the top of `research/mathlib-m0/lean/Export.lean`, replace:

```lean
import Mathlib.Logic.Pairwise
```

with:

```lean
import Mathlib.Logic.Function.Basic
```

Replace `corpusRoots` with exactly:

```lean
private def corpusRoots : List Name := [
  ``Function.eval,
  ``hidden,
  ``Function.swap₂,
  ``Function.dcomp,
  ``Function.onFun,
  ``Function.swap,
  ``Function.bicompl,
  ``Function.bicompr,
  ``Pi.map,
  ``forall₃_imp
]
```

Do not change `supportedKernel?`, `collectDependencyClosure`, `levelJson`, `exprJson`, boundary classification, ordering, or artifact schemas.

- [ ] **Step 5: Run the focused test and full TypeScript suite**

Run from `ts/`:

```bash
npm run build --silent
node dist/test/mathlib-m0-export-contract.test.js
npm test
```

Expected: PASS. A local TypeScript pass proves only the repository contract; it does not prove that the pinned Lean closure is transport-closed.

- [ ] **Step 6: Commit Task 1**

```bash
git add \
  ts/test/mathlib-m0-export-contract.test.ts \
  research/mathlib-m0/corpus-seed.json \
  research/mathlib-m0/corpus-reproduction.json \
  research/mathlib-m0/lean/Export.lean
git commit -m "research(mathlib-m0): cut over to pi proof corpus"
```

---

### Task 2: Make empty external boundary a mandatory live dependency-closure gate

**Files:**
- Modify: `ts/test/mathlib-m0-export-contract.test.ts`
- Modify: `.github/workflows/mathlib-m0-export.yml`

**Interfaces:**
- Consumes: parsed `MathlibM0ExternalBoundary` from `parseMathlibM0ExternalBoundary(...)`.
- Produces: live workflow failure unless `boundary.entries.length === 0`, after existing exact boundary-identity validation.

- [ ] **Step 1: Write the failing workflow-contract assertion**

Add to `ts/test/mathlib-m0-export-contract.test.ts`:

```ts
assert(
  workflow.includes("if (boundary.entries.length !== 0)") &&
    workflow.includes("live transport is not dependency-closed"),
  "live Mathlib M0 gate must reject every non-empty external kernel boundary",
);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run from `ts/`:

```bash
npm run build --silent
node dist/test/mathlib-m0-export-contract.test.js
```

Expected: FAIL because the current workflow validates boundary identity but still permits non-empty boundary evidence.

- [ ] **Step 3: Add the minimal fail-closed live assertion**

In `.github/workflows/mathlib-m0-export.yml`, inside the existing Node validation script, immediately after exact `actualBoundaryIdentity` versus `expectedBoundaryIdentity` comparison, add:

```js
if (boundary.entries.length !== 0) {
  throw new Error(
    `live transport is not dependency-closed: ${boundary.entries.length} external boundary entries`,
  );
}
```

Do not delete the external-boundary artifact, parser, identity derivation, or classifier. The artifact remains required even when its successful active-corpus result is empty.

- [ ] **Step 4: Run the focused test and full TypeScript suite**

Run from `ts/`:

```bash
npm run build --silent
node dist/test/mathlib-m0-export-contract.test.js
npm test
```

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

```bash
git add ts/test/mathlib-m0-export-contract.test.ts .github/workflows/mathlib-m0-export.yml
git commit -m "ci(mathlib-m0): require empty external boundary"
```

---

### Task 3: Prove or falsify the Π/→ corpus on the exact pinned live environment

**Files:**
- Read only unless evidence requires documentation updates: generated workflow artifacts.
- Potential documentation-only update after evidence: Issue #969 and PR #983 body/comment.

**Interfaces:**
- Consumes: exact research head after Tasks 1–2, workflow `Mathlib M0 pinned export`, pinned mathlib SHA/toolchain.
- Produces: either a deterministic 10–100 declaration transport with empty boundary, or an explicit falsification report naming the first unsupported/overflow/external condition.

- [ ] **Step 1: Verify exact-head repository checks before live interpretation**

Record the exact research head SHA and confirm ordinary CI is GREEN. PR #983 must remain Draft; repo-guard may remain SKIPPED solely because the PR is Draft.

- [ ] **Step 2: Trigger the pinned live export on the exact research head**

Using GitHub CLI, equivalent API dispatch, or the repository connector, dispatch:

```bash
gh workflow run mathlib-m0-export.yml \
  --repo netkeep80/anum_docs \
  --ref research/969-mathlib-m0 \
  -f research_ref=<EXACT_RESEARCH_HEAD_SHA>
```

The `research_ref` value must be the exact commit SHA, not a floating branch name.

- [ ] **Step 3: Require the live workflow result to be GREEN before claiming closure**

The workflow must prove all of:

```text
10 <= declarations <= 100
transport parser GREEN
boundary parser GREEN
boundary identity exactly matches transport external references
boundary.entries.length == 0
double transport export byte-identical
double boundary export byte-identical
mathlib SHA == d6893048e0d784c43f3cf098b61299b3a4b4aed0
Lean toolchain == leanprover/lean4:v4.34.0-rc2
```

If the workflow is RED because of a non-empty boundary, unsupported `Expr`/`Level`, unsupported root declaration kind, or closure size >100, stop. Do not broaden support in this plan.

- [ ] **Step 4: Download and independently inspect the evidence artifact**

Download the `mathlib-m0-export-<run_id>` artifact and inspect:

```text
corpus-export.json
external-boundary.json
run-metadata.json
```

Verify:

```text
run-metadata.researchSha == exact Task 2 head
external-boundary.entries == []
corpus-export.declarations.length in [10, 100]
every declaration externalDependencies == []
forall_imp / forall₂_imp / forall₃_imp identities are present if reached by the actual closure
```

Do not require the expected ~12 declaration count as a contract; the exact pinned environment decides the real closure.

- [ ] **Step 5: Record the result without overstating theorem acceptance**

If GREEN, update #969/#983 with the exact head, run ID, declaration count/digest, empty boundary, and explicit statement:

```text
transport dependency closure proven; MTS translated/approved/replayed status remains not started
```

If RED, record the exact falsification condition and leave the dependency-closed acceptance item unchecked.

- [ ] **Step 6: Stop at the semantic boundary**

Do not implement the MTS proof encoder in this plan. A GREEN Task 3 unlocks a new design/plan whose first theorem experiment must follow `docs/superpowers/specs/2026-09-05-mts-proof-semantics-guardrail-design.md`: translate the smallest proof term into MTS-native contextual links/substitutions/compositions and replay it through the existing trusted structural proof mechanism.
