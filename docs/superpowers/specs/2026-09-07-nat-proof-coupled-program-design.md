# Coupled Nat Foundation + Proof-Calculus Program Design

## Status

Approved architectural design for #1057.

Exact baseline at capture:

```text
main = 8af99dd02816ff612d8411c569fabf8e82e3c955
accepted MTS = v0.11
active semantic candidate = NONE
post-merge CI #4236 = GREEN
```

## Purpose

Natural numbers serve two roles simultaneously:

1. a foundational derived mathematical structure of MTS;
2. the smallest serious proving ground for MTS proof calculus and aprover mathematics.

The program therefore develops Nat structure and proof calculus in parallel, while keeping their authorities independent.

## Authority split

```text
TRACK N — #1052
What is Nat and which statements are structurally true?

TRACK P — #999
How are proofs represented as Anets, replayed, composed and reused?

SYNC — #1057
Which theorem is the next shared challenge and what exact gap does it expose?
```

Neither track may define truth for the other.

## Per-theorem contract

Every theorem challenge is classified independently along three axes:

```text
STRUCTURE = SUPPORTED | FALSIFIED | NOT TESTED
PROOF_ANET = SUPPORTED | GAP | NOT TESTED
REUSE = SUPPORTED | GAP | NOT TESTED
```

Interpretation:

- `STRUCTURE=FALSIFIED`: revise/reject mathematics; do not patch the prover.
- `STRUCTURE=SUPPORTED, PROOF_ANET=GAP`: keep mathematics; improve only generic proof calculus.
- `STRUCTURE=SUPPORTED, PROOF_ANET=SUPPORTED, REUSE=GAP`: theorem is provable once but cannot yet participate as reusable derived evidence.

## Current Nat hypothesis

```text
N0 = U
Succ(N) = N ⟼ L
```

Therefore:

```text
N1 = U ⟼ L
N2 = (U ⟼ L) ⟼ L
...
```

`L` remains the unit Link / unit of extent and is not identified with `Nat(1)`.

Historical L-degree remains a separate measured family:

```text
D1 = L
D(n+1) = Dn ⟼ L
```

## Core loop

```text
MATH CHALLENGE
  -> establish/falsify structural truth
  -> attempt proof Anet using current calculus
  -> classify exact generic proof gap
  -> change only generic calculus when needed
  -> replay the original theorem
  -> reuse accepted theorem in the next theorem
```

No theorem-specific trusted opcode is allowed.

## Waves

### W0 — Carrier

Accepted finite evidence from #1055/#1056:

```text
N0 = U
Succ(N) = N⟼L
N1 != L
historical D-family preserved
```

### W1 — Local Peano laws and first reusable proof suite

Theorem ladder:

```text
T1 Zero/carrier base
T2 Succ closure
T3 Zero is not successor
T4 Successor injectivity
T5 Unique predecessor
```

Expected proof-calculus pressure:

```text
Link identity
ordered-pole decomposition
implication/dependency
structural substitution
proof composition
reusable derived theorem evidence
generic Roles
```

### W2 — Structural induction / minimality

Target shape:

```text
P(N0)
P(N) -> P(Succ(N))
-------------------
P(N)
```

Expected proof-calculus pressure:

```text
generic scope
local hypothesis
cross-scope reuse
weakening
role morphisms
proof-carrying derived schemas
```

No trusted `InductionNode`, `forall`, `lambda`, `Predicate<T>` or Nat opcode.

### W3 — Recursive Add

Re-establish against the selected Nat carrier:

```text
Add(a,N0)=a
Add(a,Succ(b))=Succ(Add(a,b))
```

### W4 — Elementary arithmetic theorem ladder

Start from defining/right-zero consequences, then left-zero and successor lemmas.
Each theorem remains a coupled structure/proof/reuse challenge.

### W5 — Addition commutativity

Resume applicable machinery from #1019 only against the selected Nat theory.

### W6 — Mul / Order

Reuse induction and theorem composition; add no new trusted proof categories merely for arithmetic convenience.

### W7 — Measurement interpretations

Use the same Nat family with explicit provenance for:

```text
Degree
Count/cardinal-like reading
ordinal-like reading
arity/depth/other finite measures
```

No primitive host `Ordinal` or `Cardinal` semantic type.

## W1 theorem definitions

### T1 — Zero

```text
N0 = U
```

### T2 — Successor closure

```text
Nat(N)
-------
Nat(N ⟼ L)
```

The Nat context itself must be explicit MTS structure, never a host recursive datatype.

### T3 — Zero is not successor

```text
Nat(N)
-------
N ⟼ L != U
```

This is a structural falsification target first, not an assumed Peano axiom.

### T4 — Successor injectivity

```text
A ⟼ L = B ⟼ L
----------------
A = B
```

Expected foundation source is ordered-pole Link identity.

### T5 — Unique predecessor

```text
A ⟼ L = N
B ⟼ L = N
----------------
A = B
```

The preferred proof reuses T4 as derived evidence. This is the first explicit reuse gate.

## Parallel proof-calculus work

Generic Nat-independent work may proceed simultaneously. #1050/#1051 is the immediate example:

```text
UsedPremises ⊆ DeclaredPremises
```

Any old-Nat L0 observation inside that branch is diagnostic only and cannot advance arithmetic acceptance.

## Relationship to #1019

Completed generic results are preserved. The arithmetic ladder is reclassified as downstream:

```text
L0/L1/COMM = PAUSED
```

until W3/W4/W5 re-entry on the selected Nat theory.

Induction/cross-scope mechanisms may be reused earlier if W1/W2 theorem challenges require them.

## Governance

Every executable theorem child must have a bounded ChangeIntent.

Required boundaries:

```text
accepted v0.11 unchanged unless separately classified
active semantic candidate = NONE until evidence requires lifecycle
MTS Links/Anets = semantic/proof authority
host arrays/maps/AST = projections only
exact Theory revision
read-only trusted replay
no theorem-specific trusted opcode
no primitive admission/promotion of derived theorem evidence
no host Nat/Ordinal/Cardinal kind as authority
```

## Documentation

The central Nat chapter owned by #1053 must eventually explain:

- zero boundary and unit Link;
- the new Nat carrier;
- structure/proof/reuse separation;
- Peano laws as theorem challenges;
- proof Anet representation and theorem reuse;
- induction/minimality;
- Degree, Count, ordinal-like and cardinal-like provenance;
- recursive arithmetic and the constructive proof ladder.

New prose uses `Anet`; repository-wide technical renaming is owned by #1049.

## Immediate program sequence

```text
P0  finish generic weakening #1050/#1051 as Nat-independent proof work
W1a structural falsifiers for T3 and T4
W1b proof-Anet challenge for T4
W1c theorem-reuse challenge T5
W2  induction/minimality only after W1 reusable suite
```

T1/T2 are context-definition prerequisites and should be split or bundled only by a bounded child design that demonstrates the dependency boundary.