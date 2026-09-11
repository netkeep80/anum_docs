# Selected source authority replay — implementation design

Date: 2026-09-11

Status: implementation design only; **not** an MTS normative specification, contract, conformance claim, readiness transition, or acceptance record.

Owners / evidence:

- lifecycle: #1134
- executable ANUM conformance: #1169
- completed foundation research: #1167
- accepted MTS remains v0.11
- v0.12 remains candidate / NOT ACCEPTED
- design base: `main = 0b7c93c0fcf58940c9bc0bef60b1fa130094df3d`

## 1. Problem

The merged source layer can faithfully materialize and replay physical source bytes, Dictionary occurrences, selected segments, Grammar membership evidence and Theory membership evidence. The merged STRING context layer can execute already-selected `SIGN / OPEN / CLOSE / PARENT_CONTINUE` mechanics.

What production does **not** yet prove is that candidate source/Grammar/Theory/Use evidence was authorized by an independently selected support.

This distinction is mandatory after #1167:

```text
readable / materialized evidence
!=
selected authority
```

In particular, `buildSelectedSourceEvidence()` may materialize candidate `grammarMembership` and `theoryMembership` links. Their existence and internal shape are evidence, but cannot by themselves grant authority.

The first flat STRING two-memory gate merged in #1180 remains useful evidence for faithful source transport and deterministic replay of already-selected evidence. It is not sufficient evidence that semantic admission was independently selected.

## 2. Goal

Add the smallest production **read-only selected-authority replay** needed to consume the already completed research decision:

```text
A = (source, D, G, T, S, K)
```

where:

```text
source = independently selected faithful source root
D      = selected Dictionary revision
G      = selected Grammar revision
T      = selected Theory revision
S      = selected support/admission root
K      = selected contextual/binding revision
```

The first implementation slice validates a bounded source-to-Use decision. It does not implement a parser, lexer, STRING codec, universal Query type, universal Support ontology, or new MTS semantic rule.

## 3. Architecture decision

Introduce one narrow production module for verifying a candidate source-to-Use selection under an explicitly supplied authority vector.

Conceptual input:

```text
selected authority A=(source,D,G,T,S,K)
+ SourceFrontEndEvidence
+ candidate Entry
+ candidate Use fact
+ candidate Use
```

Conceptual output:

```text
verified admitted Use
```

The verifier is **read-only** and must derive its verdict only from the pole-closure of the explicitly supplied authority/evidence roots. It must not discover authority from ambient Memory state.

The module is not allowed to create semantic links while replaying.

## 4. Selected support boundary

This slice must not invent a universal `Support` class/type or claim one final support serialization for all future MTS work.

For this bounded kernel step, `S` is an explicitly supplied Link root whose own selected structural place enumerates the evidence admitted for this replay. The representation may reuse the exact-sequence / selected-place discipline already falsified in AR6/AR7, but the production API must name it as a **bounded selected authority revision**, not as a universal ontology object.

The essential invariant is independent of the temporary carrier shape:

```text
member(E, selected S) = true
```

must be established by traversing `S`'s own immutable pole structure.

This is forbidden:

```text
exists ambient S ⟼ E
=> E is admitted
```

A late attachment to the same selected `S` must not change an old verdict.

## 5. Verification obligations

The first replay must verify all of the following simultaneously:

```text
1. evidence.source.source == authority.source
2. evidence source/D/G/T coordinates == selected D/G/T
3. source evidence replays successfully without writing
4. selected source resolves to the claimed Entry
5. source Grammar membership evidence is admitted by selected S
6. source Theory membership evidence is admitted by selected S
7. candidate Use fact has exact poles Entry ⟼ Use
8. candidate Use fact is admitted by selected G and selected S
9. candidate Use is admitted by selected T and selected S
10. selected K is explicit and unchanged by ambient attachments
11. replay performs no Memory mutation
```

The exact mechanism for `G`/`T` membership must use explicit revision structure, not ambient `outgoing(G)` / `outgoing(T)` discovery.

## 6. Negative invariants

Permanent tests must prove failure for at least:

```text
N1 late ambient Entry ⟼ Use self-admission
N2 candidate Use absent from selected S
N3 candidate Use fact absent from selected G
N4 candidate Use absent from selected T
N5 source root substitution with otherwise colliding downstream evidence
N6 D/G/T substitution without an admitted bridge
N7 ambient attachment around K attempting to change an old binding
N8 replay that would need find/incoming/outgoing ambient discovery
```

Where a current production reader still requires ambient discovery for unrelated implementation reasons, this slice must not silently bless that dependency as semantic authority. The trusted replay boundary should receive or construct a bounded view instead.

## 7. STRING relationship

This module is deliberately **not STRING-specific**.

After it is GREEN, nested STRING conformance can use it as follows:

```text
faithful `[ab]` source
  -> exact selected source occurrences
  -> Dictionary Entries
  -> selected admitted Use for `[` under fixed G/T/S/K
  -> existing openStringContext(...)
  -> admitted ordinary sign Uses for `a` and `b`
  -> existing continueStringSign(...)
  -> admitted close Use for `]`
  -> existing replayStringClose(...)
  -> existing continueStringAnum(...)
  -> result
```

The characters `[`, `]`, `a`, `b` must never select behavior by host-language token branching. Their physical bytes identify source occurrences; the selected Dictionary/Grammar/Theory/support determines the admitted Use.

Thus:

```text
physical glyph `[` != semantic abit O
physical glyph `[` != OPEN command
```

OPEN is an admitted structural use of that selected source Entry in the selected authority.

## 8. TDD sequence

Implementation starts only after this design is reviewed.

RED:

- add a permanent test demonstrating that mere materialization / ambient attachment of a competing `Entry -> Use` is not a valid selected authority;
- test imports the intended production replay surface before it exists, or otherwise fails specifically because the trusted selected-support verification is absent;
- record exact RED CI evidence.

GREEN:

- add the smallest production replay implementation;
- keep replay read-only;
- make the positive selected Use pass;
- make late ambient/self-admitted alternatives fail;
- run full TypeScript/CI suite.

Only after this kernel slice is merged and post-merge CI is GREEN may the next nested STRING fixture be implemented.

## 9. Expected repository scope for first implementation PR

Expected files are intentionally narrow:

```text
ts/src/<selected-authority-replay-module>.ts
ts/test/<selected-authority-replay>.test.ts
```

A public export is not automatically required. C7 public facade remains blocked. If an internal barrel/export is technically necessary only for tests, prefer direct internal import rather than widening the package boundary.

Do not change in this slice:

```text
contracts/**
cutover/**
traceability/**
repo-policy.json
README.md
docs/theory/**
docs/specs/**
public/package facade
accepted v0.11
candidate readiness/acceptance flags
```

## 10. Stop conditions

STOP and return to #1134/#1169 instead of forcing GREEN if implementation reveals any of these:

```text
- selected authority requires a new observable MTS semantic law;
- a universal Support ontology/type becomes necessary;
- source identity has to be reconstructed from result/denotation;
- a host token kind/opcode becomes semantic authority;
- a parser stack/current mutable state becomes semantic authority;
- the verifier must scan ambient Memory to decide admission;
- K can change without a new explicit contextual authority;
- nested STRING requires changing the accepted expected C3 topology.
```

## 11. Success criterion

The first slice is complete only when an exact-head PR proves:

```text
same selected A + admitted source/use evidence -> PASS
same selected A + late ambient competing Use  -> REJECT
same selected A + substituted source/G/T/S/K -> REJECT where applicable
trusted replay writes                         -> NEVER
```

with blocking repo-guard and CI GREEN, exact-head merge, and post-merge CI GREEN.

That completion still does **not** make v0.12 ready or accepted. It only supplies the missing trusted kernel boundary needed before honest nested STRING two-memory conformance can proceed.
