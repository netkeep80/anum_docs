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

What production does **not** yet prove is that candidate source/Grammar/Theory/Use evidence was authorized by independently selected authority roots.

This distinction is mandatory after #1167:

```text
readable / materialized evidence
!=
selected authority
```

In particular, `buildSelectedSourceEvidence()` may materialize candidate `grammarMembership` and `theoryMembership` links. Their existence and internal shape are evidence, but cannot by themselves grant authority.

The first flat STRING two-memory gate merged in #1180 remains useful evidence for faithful source transport and deterministic replay of already-selected evidence. It is not sufficient evidence that semantic admission was independently selected.

## 2. Goal and authority projection

The completed #1167 research decision uses the full authority vector:

```text
A = (source, D, G, T, S, K)
```

where:

```text
source = independently selected faithful source root
D      = selected Dictionary revision
G      = selected Grammar revision
T      = selected Theory revision
S      = selected support/admission revision
K      = selected contextual/binding revision
```

The first implementation slice must not pretend to consume coordinates it does not use. Source-to-Use selection needs only:

```text
A_use = (source, D, G, T, S)
```

`K` remains mandatory for the **later operation/application replay** in which the selected Use is applied to an explicit context. It is deliberately absent from the first source-to-Use verifier rather than being passed through unused.

The first slice validates one bounded source-to-Use decision. It does not implement a parser, lexer, STRING codec, universal Query type, universal Support ontology, context application, or new MTS semantic rule.

## 3. Architecture decision

Introduce one narrow production module for verifying a candidate source-to-Use selection under explicitly supplied `A_use`.

Conceptual input:

```text
selected A_use=(source,D,G,T,S)
+ SourceFrontEndEvidence
+ candidate Entry
+ candidate Use fact = Entry ⟼ Use
+ candidate Use
```

Conceptual output:

```text
verified admitted Use
```

The verifier treats `Use` as an opaque Link selected by authority. It does **not** assign a universal internal shape or opcode to Use. A later operation-specific layer may interpret an admitted Use as a target interpreter, sign value, structural Rule/application, or another already-proven structural form.

The verifier is read-only. Its verdict must be determined only from the immutable pole structure reachable through explicitly supplied authority/evidence roots. It must not discover authority from ambient Memory state and must not create semantic Links while replaying.

## 4. Bounded revision carrier for G/T/S

The first production slice needs an exact membership carrier, but must not invent a universal `Support` ontology or final revision model for all MTS subsystems.

For this bounded lane, reuse the exact carrier already exercised by the final AR6 authority falsifier:

```text
Rev([])   = START(ExactSequence([]))
Rev(xs)   = START(ExactSequence(xs))
member(E, Rev(xs)) iff E occurs as an exact sequence value
```

The reader must verify the exact START wrapper and read the contained `ExactSequence` through poles. Full self-closure is not an alternative encoding.

In this first slice:

```text
G = Rev([admitted Use facts ...])
T = Rev([admitted Uses ...])
S = Rev([admitted evidence roots ...])
```

This is an implementation carrier scoped to the selected-authority lane. It is **not** claimed to be the final universal shape of Grammar, Theory, Support, or revisioning in MTS.

The essential invariant is:

```text
membership is read from the selected revision root itself
```

This is forbidden:

```text
exists ambient G ⟼ E
exists ambient T ⟼ E
exists ambient S ⟼ E
=> E is admitted
```

Late attachments around an already selected revision root must not change an old verdict.

## 5. Verification obligations

The first replay must verify all of the following simultaneously:

```text
1. evidence.source == selected source
2. evidence Dictionary/Grammar/Theory coordinates equal selected D/G/T
3. source evidence replays successfully without writing
4. selected source resolves to the claimed Entry
5. source Grammar-membership evidence is a structurally valid G ⟼ formSequence relation
6. source Theory-membership evidence is a structurally valid T ⟼ formSequence relation
7. both source-membership evidence Links are admitted by selected S
8. candidate Use fact has exact poles Entry ⟼ Use
9. candidate Use fact occurs in selected G
10. candidate Use occurs in selected T
11. candidate Use fact and Use both occur in selected S
12. replay performs no Memory mutation
```

`D` continues to use the existing scoped Dictionary semantics; this slice does not replace it with the bounded `Rev` carrier.

No `find`, `incoming`, `outgoing`, `allLinks`, “latest revision” lookup, or process-global registry may decide authority. Exact revision membership is recovered from the selected revision root by pole traversal only.

## 6. Negative invariants

Permanent tests must prove failure for at least:

```text
N1 late ambient Entry ⟼ Use self-admission
N2 candidate Use absent from selected S
N3 candidate Use fact absent from selected G
N4 candidate Use absent from selected T
N5 source root substitution with otherwise colliding downstream evidence
N6 D/G/T/S substitution without an admitted bridge / matching selected roots
N7 late ambient attachment to selected G/T/S cannot change an old verdict
N8 replay remains valid through a pole-only ReadMemory that rejects ambient discovery APIs
```

The test must include a positive control in which selecting a genuinely different immutable revision root intentionally changes admission. This proves the verifier is revision-sensitive rather than globally hard-coded.

## 7. Relationship to nested STRING

This module is deliberately **not STRING-specific**.

After it is GREEN, nested STRING conformance can build operation-specific evidence on top of verified Uses:

```text
faithful source occurrence
  -> Dictionary Entry
  -> source-to-Use authority replay
  -> admitted Use
  -> operation-specific replay under explicit K
  -> existing STRING context mechanics where applicable
```

For example, the already researched OPEN case may use an admitted `Entry_bracket ⟼ targetInterpreter` fact, after which the existing `openStringContext(...)` mechanics can be verified under the selected parent context.

Ordinary signs can similarly resolve to admitted semantic values before `continueStringSign(...)`.

CLOSE must receive the same treatment: its behavior may not be selected because the host character equals `]`. If no already-proven structural Use/Rule can authorize CLOSE under explicit `K`, implementation must STOP rather than introduce a `TokenKind.CLOSE` or hidden parser command.

The physical characters `[`, `]`, `a`, `b` therefore never select behavior by host-language token branching. Their bytes identify source occurrences; selected Dictionary/Grammar/Theory/support evidence selects Uses.

Thus:

```text
physical glyph `[` != semantic abit O
physical glyph `[` != OPEN command
```

OPEN is an admitted structural use of the selected source Entry in the selected authority.

## 8. TDD sequence

Implementation starts only after this design is reviewed.

RED:

- add a permanent test that imports the intended production selected-authority replay surface before it exists, or otherwise fails specifically because trusted selected-revision verification is absent;
- construct one admitted `Entry -> Use` under fixed `D/G/T/S`;
- materialize a competing ambient `Entry -> otherUse` after those roots are fixed;
- prove the desired test is RED until production replay enforces selected revision membership;
- record exact RED CI evidence.

GREEN:

- add the smallest production bounded-revision reader + source-to-Use replay;
- keep replay pole-only and read-only;
- make the selected positive Use pass;
- make late ambient/self-admitted alternatives fail;
- include a genuinely different revision positive control;
- run the full TypeScript/CI suite.

Only after this kernel slice is merged and post-merge CI is GREEN may the next operation-specific/nested STRING fixture be implemented.

## 9. Expected repository scope for first implementation PR

Expected files are intentionally narrow:

```text
ts/src/<selected-authority-replay-module>.ts
ts/test/<selected-authority-replay>.test.ts
```

If clean separation materially improves the implementation, the bounded revision reader may be a second small internal source file; it must not be exposed as a universal public MTS abstraction.

A public export is not automatically required. C7 public facade remains blocked. Tests should prefer direct internal imports rather than widening the package boundary.

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
- operation-specific replay cannot consume K explicitly;
- CLOSE requires an unproven semantic command/rule;
- nested STRING requires changing the accepted expected C3 topology.
```

## 11. Success criterion

The first slice is complete only when an exact-head PR proves:

```text
same selected A_use + admitted source/use evidence -> PASS
same selected A_use + late ambient competing Use  -> REJECT
same source + genuinely different selected G/T/S -> verdict changes only as explicitly admitted
substituted source/D/G/T/S                       -> REJECT where applicable
trusted replay writes                            -> NEVER
ambient discovery required                       -> NEVER
```

with blocking repo-guard and CI GREEN, exact-head merge, and post-merge CI GREEN.

That completion still does **not** make v0.12 ready or accepted. It only supplies the missing trusted source-to-Use kernel boundary. Explicit `K` consumption and nested STRING operation/application evidence remain subsequent bounded work.
