# MTS proof semantics guardrail for Mathlib/M0

Date: 2026-09-05
Issue: #969
Research PR: #983

## Purpose

This companion design fixes the MTS-side semantic interpretation that must constrain the Mathlib/M0 proof experiment. It does not change accepted MTS v0.11 semantics and does not introduce a new logical calculus. It records which semantics are already taken as MTS ground truth for this research and which mappings from Lean remain hypotheses to be tested.

## Confirmed MTS semantic baseline

For this research, the following are semantic ground truth supplied by MTS rather than imported from Lean.

### Truth and falsity

`True` is represented by a link. `False` is represented by a non-link.

This is not an external Boolean layer and must not be replaced by Lean's `True`, `False`, `Bool`, or any other foreign logical object.

### Structural comparison of links

For links

```text
(A ⟼ B)
(C ⟼ D)
```

comparison returns the link abit exactly when both starts and both ends coincide:

```text
A = C
B = D
```

Equivalently:

```text
(A ⟼ B) = (C ⟼ D)
    iff
A = C and B = D
```

If either starts differ or ends differ, comparison returns the non-link abit.

The result of comparison is therefore expressed inside MTS as the link/non-link distinction, not as an external Boolean value.

### Executable interpretation of a link

A link

```text
a ⟼ b
```

may be executed by the interpreter as replacement/substitution:

```text
a -> b
```

This executable reading is a contextual interpretation of the link; it does not require introducing a new logical primitive named `apply` or `rewrite` merely to emulate Lean.

### Relation/implication interpretation is contextual

The same link

```text
a ⟼ b
```

may, in an appropriate context, be interpreted as a correspondence in a binary relation.

In particular, when a context is a set/aset of mappings belonging to one functional binary relation, presence of `a ⟼ b` in that relation may be read operationally as the corresponding implication/mapping from `a` to `b`.

Therefore implication is not assumed to be a new fundamental MTS object. The research must first test whether the required implication behavior is already expressible as contextual interpretation and execution of existing links.

## Core research principle

The Mathlib/M0 importer must not build a second conventional logic on top of MTS merely because Lean uses propositions, implication, lambda terms, and dependent function types.

The preferred reduction is:

```text
logical consequence
    =
contextually valid execution / substitution / composition of links
```

subject to the existing trusted MTS replay boundary.

The proof object should therefore be sought as an MTS link network whose claimed result is reproducible by allowed structural execution, substitution, comparison, and composition in the stated context.

It must not default to an instruction stream such as:

```text
INTRO
APPLY
EXACT
FORALL_ELIM
```

unless a later falsification proves that an existing MTS mechanism cannot express the required semantics and a separate semantic proposal is explicitly authorized.

## Composition as the first proof hypothesis

For the first Π/→ experiment, the key hypothesis to test is composition of functional relations.

If one context contains a mapping equivalent to:

```text
a ⟼ p[a]
```

and another contains:

```text
p[a] ⟼ q[a]
```

then execution/composition should be investigated as the MTS-native route to:

```text
a ⟼ q[a]
```

This is the intended MTS-side interpretation to test against the Lean proof shape:

```lean
fun h' a => h a (h' a)
```

The Lean proof term is evidence to be translated, not semantic authority. The MTS result is acceptable only if the translated proof network replays under already accepted MTS mechanisms.

## What is confirmed versus still a hypothesis

Confirmed for this research:

- link corresponds to truth;
- non-link corresponds to falsity;
- link comparison yields the link abit iff both starts and ends coincide, otherwise the non-link abit;
- links can be executed as replacement/substitution `a -> b`;
- a link can be interpreted contextually as a correspondence/implication when it belongs to an appropriate functional binary relation.

Still research hypotheses, not accepted semantic law:

- exact encoding of Lean `A -> B` as an MTS functional relation;
- exact encoding of Lean function application as link execution/substitution;
- exact representation of lambda binding under current MTS v0.11;
- exact representation of Lean `forall` / dependent Π under current MTS v0.11;
- whether composition alone is sufficient for the selected Π/→ theorem corpus;
- whether the existing structural proof producer/replay API can express the required proof network without any MTS semantic delta.

The experiment must keep this distinction explicit. A successful transport parse or a plausible analogy does not promote a hypothesis into accepted MTS semantics.

## Lean `False` is not MTS non-link by name

The external Lean declaration named `False` is a Lean kernel inductive declaration. It must not be equated automatically with MTS non-link merely because both are informally called false.

Any future mapping from Lean `False` to MTS non-link must be justified by a proof-preserving encoding and trusted MTS replay. Name equality or intended meaning is insufficient.

The same rule applies to Lean `Eq`, implication, conjunction, quantification, and other logical declarations: foreign names do not acquire MTS meaning without an explicit structural encoding whose result is independently replayable.

## Consequence for the current Π/→ corpus cutover

The current corpus cutover remains a transport-closure experiment first. Its hard gate remains an empty foreign external boundary on the exact pinned Lean/mathlib environment.

If that succeeds, the next MTS encoder slice must begin with the smallest theorem proof term that exercises relation composition, preferably the `forall_imp` / `forall₂_imp` / `forall₃_imp` chain already identified in the selected corpus.

The encoder must try the MTS-native route in this order:

```text
foreign proof structure
    -> identify contextual mappings/relations
    -> encode them as existing MTS links/context
    -> execute/substitute/compose through existing mechanisms
    -> materialize candidate result link/network
    -> trusted structural replay
```

Only after this route is falsified may a missing semantic mechanism be proposed separately.

## Hard boundaries

This companion design does not authorize:

- a new MTS `True` or `False` primitive;
- an external Boolean truth layer;
- a new primitive implication operator merely to mirror Lean `->`;
- a Lean tactic interpreter;
- a trusted Lean-to-MTS translator;
- automatic identification of Lean logical constants with MTS semantics by name;
- a permanent second Lean AST/domain authority inside MTS;
- modification of accepted MTS v0.11 contracts/conformance/policy to make Mathlib pass;
- any implication of an MTS v0.12 candidate.

## Falsification criterion for the next proof stage

After transport closure, the first MTS proof experiment succeeds only if a real Lean proof can be encoded into existing MTS structures and independently replayed as valid link construction/substitution/composition without foundational changes.

If the proof requires a behavior that cannot be expressed using current MTS links, contexts, execution/substitution, comparison, structural proof production, and trusted replay, that is a research result: the missing behavior must be isolated and proposed separately rather than smuggled into the importer.

This keeps Mathlib as a source of falsifiable proof evidence while MTS remains the semantic and acceptance authority.