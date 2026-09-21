# MTS v0.13 — pre-acceptance comparative dossier

Status: **READY / NOT ACCEPTED**  
Snapshot date: **2026-09-21**  
Owner issue: #1337  
Parent research: #1270

## Exact ready candidate

```text
main = 2a397a3ee2f8594f78d2d303dd2fb057bdd27ddc

contract blob =
ceecfbba126c841909c7bf962b4c8ae9aee0cd71

conformance blob =
1f2edbc85ed4058c6effd0336b66b7023ddd83f6

traceability blob =
57216c35999022d798def0f7f65a1013f54b2acf
```

Lifecycle:

```text
status = candidate
accepted = false
acceptanceReady = true
implementationComplete = true
singleLiveSemanticRuntime = true
candidateRuntimeSelectable = false
readinessAuditComplete = true
explicitAuthorAcceptanceRecorded = false
accepted/current = MTS v0.12
```

Readiness provenance:

```text
issue = #1335
PR = #1336
head = 27eb3d39fc9e36a5fa3c4a025bc7e4a3a3289799
merge = 2a397a3ee2f8594f78d2d303dd2fb057bdd27ddc
CI #5602 = SUCCESS
Contract Observatory #312 = SUCCESS
blocking repo-guard #1706 = SUCCESS
```

## Detailed PDF snapshot

Persistent reading copy:

```text
/MTS/v0.13/MTS-v0.13-pre-acceptance-dossier-2026-09-21.pdf
```

Exact SHA-256:

```text
4fdaa44a20d1e26a6578e47d3c8a0b984b0dc412124da2d034c227b3bc853255
```

The PDF is a derived immutable reading snapshot. This GitHub manifest is the canonical acceptance-history record for that snapshot.

The existence or merge of this document is **not** author acceptance.

## Executive decision result

The current evidence separates four different questions.

| Area | Result |
|---|---|
| Functional non-regression versus accepted v0.12 | PROVEN |
| Foundation superiority under the declared A5 criteria | PROVEN |
| Formal readiness of the declared v0.13 candidate scope | COMPLETE |
| Engineering “no worse on every important measured characteristic” | PARTIALLY MEASURED |

Therefore the candidate is formally ready, but the author may legitimately keep final ACCEPT pending until the additional engineering measurements requested in #1337 are complete.

## Functional non-regression

Accepted v0.12 baseline:

```text
accepted semantic laws = 18
mandatory executable gates = 16
```

Final v0.13 parity audit:

```text
completedLawCount = 18
reviewRequiredCount = 0
regressionCount = 0
semanticDeltaLawParityComplete = true
inheritedFoundationParityComplete = true
```

Every accepted capability is classified PRESERVED / GENERALIZED / REPLACED. No essential accepted v0.12 capability remains REGRESSION or REVIEW_REQUIRED.

## Foundation comparison

v0.13 derives its four structural aspect classes directly from Link self-incidence:

```text
s(X)=1 iff start(X)=X
e(X)=1 iff end(X)=X

00 -> PAIR  -> L -> physical 1
01 -> END   -> C -> physical 6
10 -> START -> O -> physical 9
11 -> ROOT  -> R -> physical 8
```

A5 result is GREEN on:

```text
necessity
sufficiency
derivability
closure
unambiguity
host-authority boundary
```

Only the A5 foundation-alphabet role is semantically replaced. U remains an ordinary PAIR Link, not a fifth structural aspect.

## Executable evidence metrics

```text
v0.12 mandatory gates = 16
v0.13 mandatory gates = 39
delta = +23
relative evidence-surface increase = +143.75%
planned gates = 0
```

The 39-gate ready corpus explicitly inherits all 16 accepted-v0.12 gates.

## Public/kernel surface

Candidate-specific production kernel inventory:

```text
5 files
1239 source lines
```

Package runtime exports:

```text
v0.12 baseline = 132
v0.13 ready surface = 144
delta = +12
relative increase = +9.1%
```

This is a real simplicity trade-off. Low-level Dictionary/Rule/Act authority producers and low-level context builders remain internal.

## Byte problem definition

The researched binary byte is the semantic ordered sequence:

```text
TRUE  = L = O -> C
FALSE = U = C -> O

Byte(x) = ExactSequence(b7..b0)
bi in {L,U}
```

The metric is the length of the quaternary Anum that serializes the Link representing that sequence.

## All-256 byte metrics

Executable A7 enumeration (#1329):

| Representation | Same ExactSequence target? | Lmin | Lavg | Lmax | Ratio |
|---|---:|---:|---:|---:|---:|
| generic ExactSequence<L/U> | yes | 57 | 57 | 57 | 1.0 |
| generic L/U fold | no | 47 | 47 | 47 | 1.0 |
| R-rooted left fold | no | 49 | 49 | 49 | 1.0 |
| balanced pair tree | no | 47 | 47 | 47 | 1.0 |
| Boolean selector path | no, different Link | 9 | 9 | 9 | 1.0 |
| contextual BYTE8 payload | yes, round-trip | 4 | 4 | 4 | 1.0 |

For every measured scheme:

```text
Lmax/Lmin = 1.0
```

So no byte-value length instability was observed; the author’s warning threshold 1.5–2x is not approached.

## v0.12 byte baselines

Accepted v0.12 canonical grouped-Q STRING byte:

```text
[bbbbbbbb] = 10 Q/source signs per byte
```

Existing flat-Q contextual Boolean fold:

```text
8 Q signs per byte
```

v0.13 retains accepted v0.12 STRING behavior, so the 57-abit generic ExactSequence spelling is not a forced production STRING regression.

## Contextual BYTE8

Research round-trip:

```text
ExactSequence<L/U>
-> 4 root-aspect signs
-> same ExactSequence<L/U>
```

The fixed payload lower bound is four quaternary signs because:

```text
4^3 < 256 = 4^4
```

For 256 equiprobable arbitrary byte values, Kraft-McMillan/Jensen gives:

```text
Lavg >= log_4(256) = 4
```

The measured 4-abit BYTE8 payload therefore reaches the bounded payload optimum with ratio 1.0.

But it is not yet a production protocol. Context-selection authority remains host-local in the research witness.

Honest cost:

```text
first byte = C_init + 4
n bytes = C_init + 4n
asymptotic = 4 abit/byte
```

Exact Link-native Dictionary/Grammar/Theory/binding form and numeric C_init remain open.

## Static fixity classification

A7b (#1330) enumerates 12 assignments:

```text
START = prefix | postfix
END   = prefix | postfix
PAIR  = prefix | postfix | infix
```

Result:

```text
pure prefix  = injective + self-delimiting
pure postfix = injective + self-delimiting
other 10 naive mixed schemes = ambiguous on <=4-node terms
```

Any one-natural-sign-per-constructor spelling has length equal to constructor-node count. Fixity alone cannot shorten the wire.

Current prefix is therefore only:

```text
conditionally optimal
within self-contained ranked tree
one-sign-per-constructor codecs
```

Global optimality is not established.

## Shared DAG limitation

For:

```text
X0 = O
X(n+1) = Xn -> Xn
```

current REF-free tree wire obeys:

```text
W0 = 2
W(n+1) = 1 + 2Wn
Wn = 3*2^n - 1
```

Examples:

```text
n=0   2
n=1   5
n=2   11
n=5   95
n=10  3071
n=20  3145727
```

Unique semantic structure grows O(n), while expanded tree wire can grow O(2^n).

This is a known engineering limitation, but not a demonstrated accepted-v0.12 capability regression because accepted v0.12 has no production graph-REF codec that v0.13 removed.

## Cycles and nested asets

The four-aspect foundation itself does not impose acyclicity. A rooted mutual cycle remains locally PAIR/00.

The current production hierarchical carrier rejects recursive revisits because it is a tree projection. Research witnesses already demonstrate finite local-reference graph descriptions and test-only atomic cyclic reconstruction without sender IDs, but Link-native graph reference authority and production cyclic write primitives remain missing.

Issue #1332 records a separate non-Anum nesting representation:

```text
MTS aset may contain several lambda_i : L_i -> L_i x L_i
one doublets aset may contain several rooted MTS asets
with different acorns
```

Therefore current Anum/tree-carrier limitations must not be promoted into general nested-aset ontology laws.

## A6 FORMAL/proof dialect

v0.13 retains the accepted structural proof backend:

```text
Theory/Rule admission
assumptions
derivations
theorem reuse
read-only replay
derived modus ponens
no theorem-specific kernel for existing derived logic
```

B0/B1 remain GREEN; B2 is partial backend; B3/B4 are not demonstrated from FORMAL source; B5-B8 backend capabilities remain GREEN; B9 partial; B10 not demonstrated.

So v0.13 is not worse in retained proof capability, but no source-language A6 advantage is claimed yet.

## Characteristics still not measured

The current exact candidate does not yet have a controlled v0.12-v0.13 comparison for:

```text
wall-clock serialization/deserialization throughput
CPU cost per Link/byte
peak memory
allocations / GC pressure
semantic Link writes
carrier Link writes
package/bundle cost of the wider public API
Link-native BYTE8 context C_init
production contextual-default protocol
production graph-ref/binding codec
```

Therefore the dossier explicitly does **not** claim:

```text
v0.13 is faster than v0.12
v0.13 uses less memory
generic v0.13 Anum is always shorter
current prefix is globally optimal
v0.13 is compact on shared DAG
production v0.13 already materializes finite cyclic graphs
v0.13 FORMAL source dialect is already stronger than v0.12
```

## Recommended measurement before a strict engineering ACCEPT

If author acceptance requires measured engineering non-regression, benchmark both versions on the same runtime/hardware for:

```text
R/O/C/L/U
random finite Links
all 256 ExactSequence<L/U> bytes
STRING lengths 1/16/256/4096
repeated and random bytes
nested Anums
shared DAG depths 0..20
two-Memory transfer/reconstruction
negative authority cases
```

Collect:

```text
wire abits / physical bytes
semantic Link count
carrier Link count
new Link writes
read operations
allocations
elapsed time / throughput
peak memory
first-item cost
steady-state/amortized cost
```

BYTE8 must additionally measure the real Link-native `C_init`.

## Pre-acceptance conclusion

Current evidence supports:

```text
formal readiness:        COMPLETE
semantic non-regression: PROVEN
foundation improvement:  PROVEN within A5 scope
engineering no-worse:    PARTIALLY MEASURED
explicit author ACCEPT:  PENDING
```

Under the author’s strengthened criterion, final ACCEPT should not be inferred from readiness alone.

After the selected engineering measurements are completed, this dossier should be superseded by Revision 2 or explicitly reaffirmed by the author.

## Evidence history

- #1270 main v0.13 research/lifecycle owner
- #1329 A7 byte-sequence serialization cost
- #1330 A7 static fixity classification
- #1331 finite recursive description boundary
- #1332 future MTS-aset <-> doublets-aset conversion
- #1333 public consumer boundary
- #1334 candidate-kernel lifecycle binding
- #1335 independent readiness audit
- #1336 readiness state PR
- #1337 this pre-acceptance dossier

Key #1270 comments:

```text
5764809911 A7 bounded serialization study complete
5764949247 finite recursive description boundary classification
5765535923 public consumer boundary merged
5766095393 exact ready candidate after readiness merge
```

**Acceptance rule:** this dossier is evidence for a future author decision. Its merge, existence, or GREEN checks are not author acceptance of MTS v0.13.
