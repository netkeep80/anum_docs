# Mathlib M0 Π/→ proof corpus cutover design

Date: 2026-09-05
Issue: #969
Research PR: #983

## Status and decision

The Pairwise-based M0 corpus remains valid falsification evidence but is not dependency-closed under the currently supported foreign transport declaration subset. The live pinned audit on research head `653b5d7dbb77b304b2c9001dbb66587a8ae9f890` found the external kernel boundary:

```text
Eq             inductive
False          inductive
Membership     inductive
Membership.mk  constructor
```

The corresponding current-corpus disposition is:

```text
unsupported            4
blocked-by-dependency  3
boundary-clear         3
```

This design does not authorize structural transport for Lean inductive declarations. Instead, the active M0 corpus selection is cut over to a deliberately small Π/→ fragment containing real theorem proof terms and simple lambda definitions/abbreviations. The goal is to isolate the first proof-preserving MTS experiment from the separate problem of representing Lean inductive kernel declarations.

The Pairwise result remains recorded in #969 and in the existing external-boundary design/evidence. It is not erased or reinterpreted as success.

## Why not add `inductive` and `constructor` now

Lean kernel inductive support is not a two-enum extension to the current flat declaration transport. An inductive declaration is introduced as an atomic kernel declaration containing level parameters, the number of parameters, one or more inductive types, and constructor types. The environment subsequently exposes inductive, constructor, and generated recursor constant information.

Therefore a faithful future foreign IR would need to preserve at least the inductive block identity and constructor relationship rather than independently serializing `InductiveVal` and `ConstructorVal` as if they were unrelated declarations. That is a separate research slice and is not required to test whether accepted MTS v0.11 can replay evidence for a simpler Lean proof fragment.

## Hard boundaries

This cutover MUST NOT:

- change accepted MTS v0.11 semantics;
- imply or create MTS v0.12;
- change `mts-mathlib-m0-transport/v0.1`;
- weaken trusted replay/approval;
- make Lean or the exporter a theorem authority;
- add Lean tactic interpretation;
- add inductive/constructor/recursor proof translation;
- add a permanent MTS-side Lean AST/domain authority;
- modify `contracts/**`, `cutover/**`, `traceability/**`, or `repo-policy.json` to make the experiment pass;
- treat an unexpected external dependency as a harmless primitive.

Any new unsupported `ConstantInfo`, `Expr`, or `Level` form stops the cutover and is recorded as falsification evidence before support is broadened.

## Active seed

The new source-level roots are exactly:

```text
Function.eval
hidden
Function.swap₂
Function.dcomp
Function.onFun
Function.swap
Function.bicompl
Function.bicompr
Pi.map
forall₃_imp
```

These are selection roots only. They are not the expected emitted declaration list and are not trusted evidence. The exporter continues to derive the real recursive closure from elaborated `Expr.getUsedConstants` references in the exact pinned `Environment`.

The seed intentionally mixes:

- simple definitions/abbreviations represented by lambda/Π structure;
- real theorem declarations with proof values;
- an internal theorem dependency chain.

In particular, the expected proof dependency chain includes:

```text
forall₃_imp
  -> forall₂_imp
     -> forall_imp
```

The pinned Lean definition of `forall_imp` is itself a theorem with a lambda proof term:

```lean
fun h' a => h a (h' a)
```

This makes the corpus a proof-preserving experiment rather than a definitions-only serialization exercise.

## Source provenance manifest

The current singular `source` field in `corpus-seed.json` and `corpus-reproduction.json` becomes `sources`, because the approved roots originate in three pinned source files.

The exact root-source provenance is:

```json
[
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
]
```

`sources` records where the source-level roots were selected. It is not a complete source manifest for the recursively discovered closure. Closure provenance remains kernel-level: qualified identities and exact type/value structure are read from the pinned elaborated environment. Dependencies discovered in Lean core or other imported modules are admitted into the candidate corpus only when their `ConstantInfo` form is already supported and their structural `Expr`/`Level` forms pass the existing serializer.

The exact upstream pin remains unchanged:

```text
mathlib SHA    d6893048e0d784c43f3cf098b61299b3a4b4aed0
Lean toolchain leanprover/lean4:v4.34.0-rc2
```

## Exporter cutover

`research/mathlib-m0/lean/Export.lean` changes only the source import and `corpusRoots` selection needed for the new seed.

The umbrella import becomes:

```lean
import Mathlib.Logic.Function.Basic
```

This import exposes the selected Function declarations and imports the required basic logic module containing `hidden`, `Function.swap₂`, and `forall₃_imp`.

The following existing mechanisms remain unchanged:

- exact upstream environment checks;
- recursive dependency closure;
- 10–100 declaration limit;
- topological ordering;
- structural `Expr`/`Level` serialization;
- transport schema and digest identity;
- separate external-boundary audit artifact;
- exhaustive `ConstantInfo` classification;
- double-export byte-for-byte determinism check;
- TypeScript transport and boundary validation.

No declaration is added to the emitted corpus merely because it appears in the source manifest. Environment evidence remains authoritative for the foreign transport candidate.

## Required live result

The cutover succeeds only if the exact pinned live workflow proves all of the following on one exact research head:

```text
10 <= emitted declarations <= 100
external-boundary entries == []
transport parser GREEN
boundary parser GREEN
double export byte-for-byte identical
exact mathlib SHA matches pin
exact Lean toolchain matches pin
internal dependencies are topologically closed
```

An empty external-boundary artifact means only that every referenced kernel declaration has entered the currently supported foreign transport closure. It does not mean any theorem is true in MTS.

If the emitted corpus has a non-empty external boundary, exceeds 100 declarations, introduces an unsupported `Expr`/`Level`, or fails any identity check, the cutover is RED and stops. The implementation must not shrink the closure, allowlist an external name, or extend kernel-form support merely to make the run green.

## Workflow strengthening

The live workflow already validates the transport and external-boundary artifacts. For this cutover it additionally asserts that the parsed boundary contains zero entries before the corpus can be called dependency-closed for #969.

This is a research gate, not a theorem-acceptance gate.

## Result-accounting effect

The existing external-boundary classifier remains in place. It is not removed because it documents and tests the Pairwise falsification case and remains useful if future seeds expose another boundary.

For the new active corpus:

- a non-empty boundary continues to produce `unsupported` and propagated `blocked-by-dependency` dispositions;
- an empty boundary produces `null` for this boundary audit only;
- `null` MUST NOT be presented as `translated`, `approved`, or `replayed`.

Actual translation state begins only in the subsequent MTS encoder slice.

## TDD sequence

1. Test-only RED requiring the new exact roots and `sources[]` provenance in both manifests and the exporter source contract.
2. Minimal GREEN manifest/exporter cutover. Do not change transport or proof APIs.
3. Test-only RED requiring the live workflow to reject any non-empty external boundary for the active dependency-closed corpus.
4. Minimal GREEN workflow assertion.
5. Exact-head ordinary CI GREEN.
6. Exact pinned live export GREEN or explicit falsification stop.
7. Download and independently audit the generated artifacts: declaration identities, declaration kinds, structural forms, dependencies, external boundary, pins, and deterministic identity.
8. Record the cutover result in #969 and update #983 without checking the dependency-closed acceptance box unless the live boundary is actually empty.

## Success transition

Only after this exact corpus has a real empty external boundary may #969 proceed to the MTS evidence-encoding experiment:

```text
pinned Lean Environment
  -> existing foreign structural transport v0.1
  -> untrusted MTS encoder
  -> createStructuralProofProducer(...)
  -> candidate portable structural evidence
  -> existing trusted replay/approval
  -> approved / rejected / unsupported / blocked-by-dependency accounting
```

The encoder must use the existing structural proof producer and replay APIs. It must not create a new trusted theorem interpreter or define arbitrary MTS rules from Lean and then treat those same rules as independent proof authority.

## Separate future pressure

If this Π/→ corpus becomes transport-closed but later MTS encoding cannot express or replay its proof terms under accepted v0.11, that is the intended falsification result for the next stage. It must be recorded as MTS foundational/expressivity pressure rather than repaired inside this cutover.

If the Π/→ corpus cannot become transport-closed even with the currently observed structural forms, that is also a valid research result. Minimal faithful Lean inductive-block transport can then be designed in a separate explicitly authorized slice.