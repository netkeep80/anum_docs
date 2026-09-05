# Mathlib M0 external dependency boundary audit

Date: 2026-09-05
Issue: #969
Research PR: #983

## Status and decision

The first live pinned structural export is GREEN on research head `3362d473075db9fa00076be3084ca7634a41e89c`:

- exact mathlib SHA: `d6893048e0d784c43f3cf098b61299b3a4b4aed0`;
- exact Lean toolchain: `leanprover/lean4:v4.34.0-rc2`;
- deterministic export succeeds twice byte-for-byte;
- the live artifact passes `parseMathlibM0TransportBundle()`;
- the measured corpus contains exactly 10 exported declarations.

The live artifact still references four declarations outside the exported set:

```text
Eq
False
Membership
Membership.mk
```

The current exporter treats unsupported `ConstantInfo` kinds as non-selected external names. That is not sufficient evidence for #969 because an unsupported kernel declaration kind must not be silently reclassified as harmless external support.

Decision: classify the external boundary explicitly and fail closed. Do not expand the trusted MTS foundation and do not add inductive/constructor proof semantics in this slice.

## Hard boundaries

This work MUST NOT:

- change accepted MTS v0.11 semantics;
- imply or create MTS v0.12;
- weaken trusted replay/approval;
- make the Lean exporter or TypeScript classifier trusted proof authority;
- add a Lean tactic interpreter;
- turn unsupported declarations into accepted evidence;
- modify `contracts/**`, `cutover/**`, `traceability/**`, or `repo-policy.json` to make Mathlib pass;
- add `inductInfo`, `ctorInfo`, `recInfo`, `opaqueInfo`, or `quotInfo` proof translation in this slice.

## Architecture

### 1. Keep the existing transport contract unchanged

`mts-mathlib-m0-transport/v0.1` remains the structural transport envelope for the currently exportable declarations. Its canonical digest scheme remains unchanged.

External-boundary classification is deliberately NOT added to the transport envelope in this slice. This avoids silently changing the identity semantics of a transport schema that has already produced a live deterministic artifact.

### 2. Add a separate research-only external-boundary audit envelope

The untrusted Lean exporter emits a second deterministic JSON artifact derived from the same pinned `Environment` and the same selected corpus.

Schema shape, shown with concrete pinned provenance and one source-known example entry:

```json
{
  "schema": "mts-mathlib-m0-external-boundary/v0.1",
  "upstream": {
    "mathlibSha": "d6893048e0d784c43f3cf098b61299b3a4b4aed0",
    "leanToolchain": "leanprover/lean4:v4.34.0-rc2"
  },
  "entries": [
    {
      "qualifiedName": "Eq",
      "constantInfoKind": "inductive",
      "referencedBy": ["Ne"]
    }
  ]
}
```

The example is descriptive only. Production code derives every entry and kind from the pinned elaborated `Environment`; it does not hard-code the four currently observed names or their kinds.

`entries` are sorted by `qualifiedName`; `referencedBy` is sorted and unique. Every field is derived from the elaborated Lean `Environment`; no source parsing and no manually maintained per-name kind table are allowed.

### 3. Exhaustive `ConstantInfo` classification

The exporter classifies the exact pinned Lean constructors:

```text
axiomInfo   -> axiom
defnInfo    -> definition
thmInfo     -> theorem
opaqueInfo  -> opaque
quotInfo    -> quotient
inductInfo  -> inductive
ctorInfo    -> constructor
recInfo     -> recursor
```

The match must be exhaustive. A future Lean constructor that makes the match non-exhaustive must fail at compile time or be rejected explicitly; it must never fall through to an `unknown` success category.

This classification is descriptive evidence only. It does not make any category trusted or supported for MTS translation.

### 4. TypeScript audit validator

Add a small parser for `mts-mathlib-m0-external-boundary/v0.1` with exact-record validation, exact upstream pin shape, strict enum validation, sorted/unique identity checks, and duplicate rejection.

The parser is untrusted input validation. It has no theorem/proof authority.

The live workflow validates the actual generated boundary artifact using the TypeScript parser before upload.

### 5. Fail-closed research disposition

For this slice, any transport declaration that directly references an external declaration whose `ConstantInfo` kind is not already represented inside the exported transport is not considered admitted proof evidence.

Disposition rules for later result accounting:

- `unsupported`: the declaration itself directly requires an unsupported external kernel declaration kind, or contains an unsupported kernel Expr/Form;
- `blocked-by-dependency`: the declaration's own representation is supported, but at least one internal dependency is `unsupported` or `blocked-by-dependency`;
- `translated` is possible only after all dependencies required by the declaration are inside the supported transport/evidence path;
- `approved` is possible only after translated MTS evidence passes existing trusted replay/approval.

No external kind is implicitly allowlisted as a trusted primitive by this audit slice.

### 6. Current corpus expectation

The live audit is expected to classify the currently observed external names from the pinned environment, rather than hard-coding their classification into production code.

The currently observed direct external references in live run #23 are:

```text
Not                -> False
Ne                 -> Eq
Set.instMembership -> Membership, Membership.mk
Membership.mem     -> Membership
```

Therefore the unique external boundary is exactly:

```text
Eq
False
Membership
Membership.mk
```

The live boundary-audit artifact, not a fixture, decides their `ConstantInfo` kinds. The expected research consequence is that the present 10-declaration export remains useful transport evidence but does NOT yet satisfy the #969 dependency-closed acceptance checkbox.

## Data flow

```text
pinned Lean/mathlib Environment
  -> collect selected exportable closure
  -> structural transport artifact (existing v0.1)
  -> collect external references from actual elaborated Exprs
  -> Environment.find? for every external name
  -> exact ConstantInfo kind classification
  -> deterministic external-boundary audit artifact
  -> TypeScript audit parser
  -> research disposition: unsupported / blocked-by-dependency
```

The two artifacts share exact upstream provenance but have different purposes:

- transport artifact: candidate foreign structural evidence;
- boundary audit: falsification evidence explaining why the candidate is not yet dependency-closed.

Neither artifact is trusted theorem authority.

## Error handling

The exporter must fail closed when:

- an external referenced name is absent from the elaborated `Environment`;
- the exact upstream environment variables do not match the pinned values;
- duplicate or inconsistent audit identities would be emitted.

The TypeScript parser must reject:

- unknown schema;
- malformed/floating upstream identity;
- unknown `constantInfoKind`;
- duplicate `qualifiedName`;
- duplicate/unsorted `referencedBy` identities;
- extra fields or missing required fields.

## TDD sequence

1. Test-only RED requiring deterministic external-boundary classification from `ConstantInfo` and a strict TypeScript audit parser/workflow boundary.
2. Minimal GREEN exporter support that emits the separate audit artifact without changing transport v0.1.
3. Minimal GREEN TypeScript parser and live-workflow validation.
4. Exact-head CI GREEN.
5. Exact pinned live workflow GREEN.
6. Download and independently inspect the live audit artifact.
7. Record the actual boundary kinds and propagate `unsupported` / `blocked-by-dependency` into the existing Mathlib M0 result-accounting model.

If any step reveals a new kernel form or a materially larger dependency boundary, stop and record the falsification rather than broadening support automatically.

## Decision after this slice

Only after the live external-boundary audit exists do we choose between:

1. selecting a different corpus whose full kernel closure fits the current supported declaration forms; or
2. opening/authorizing a separate bounded slice for minimal `inductInfo` / `ctorInfo` structural transport.

That later decision must be evidence-driven. This design does not authorize inductive or constructor translation.