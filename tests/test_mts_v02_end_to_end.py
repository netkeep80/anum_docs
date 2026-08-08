"""Canonical MTS/Anum v0.2 vertical slice through accepted production APIs."""

import pytest

from core.anum_denotation import DenotationKind
from core.anum_memory import AnumMemory, NonStructuralDenotationError
from core.anum_model import ProjectionContext
from core.anum_pair_denotation import denotate_anum_pair_subset
from core.anum_parser import parse_raw_quaternary
from core.anum_raw_carrier import describe_raw_carrier
from core.anum_recursive_denotation import (
    canonical_recursive_anum,
    denotate_recursive_anum,
)
from core.proof_checker import (
    DistinguishedLink,
    ExpectedSubstitution,
    InterpretProofStep,
    ProofContext,
    ProofObject,
    check_proof,
)


INITIAL_GRAPH = {
    0: (0, 0),
    1: (1, 0),
    2: (0, 2),
}
ANCHORS = {
    "protocol:0": 1,
    "protocol:1": 2,
}


def test_recursive_anum_load_find_realize_round_trip_uses_one_l3_l4_path():
    raw = "[01]1"
    form = parse_raw_quaternary(raw)
    carrier = describe_raw_carrier(form)
    denotation = denotate_recursive_anum(form, ProjectionContext.ROOT)
    store = AnumMemory(initial_links=INITIAL_GRAPH)

    assert denotation.kind is DenotationKind.STRUCTURAL
    assert canonical_recursive_anum(denotation) == raw

    store.load_raw(carrier)
    after_load = store.snapshot()
    assert store.has_raw(carrier)
    assert store.find_denotation(denotation, ANCHORS) is None
    assert store.snapshot() == after_load

    root = store.realize_denotation(denotation, ANCHORS)
    inner = store.find_link(1, 2)

    assert inner == 3
    assert root == 4
    assert store.poles(inner) == (1, 2)
    assert store.poles(root) == (inner, 2)
    assert store.find_denotation(denotation, ANCHORS) == root

    after_realize = store.snapshot()
    assert store.realize_denotation(denotation, ANCHORS) == root
    assert store.snapshot() == after_realize


def test_noncanonical_and_quote_context_never_become_hidden_l4_commands():
    store = AnumMemory(initial_links=INITIAL_GRAPH)

    noncanonical_form = parse_raw_quaternary("010")
    noncanonical_carrier = describe_raw_carrier(noncanonical_form)
    noncanonical = denotate_recursive_anum(
        noncanonical_form,
        ProjectionContext.ROOT,
    )
    store.load_raw(noncanonical_carrier)
    before = store.snapshot()

    assert noncanonical.kind is DenotationKind.RAW
    with pytest.raises(NonStructuralDenotationError):
        store.realize_denotation(noncanonical, ANCHORS)
    assert store.snapshot() == before

    quoted = denotate_recursive_anum(
        parse_raw_quaternary("[01]"),
        ProjectionContext.QUOTE,
    )
    assert quoted.kind is DenotationKind.QUOTED_RAW
    assert quoted.raw == "01"
    with pytest.raises(NonStructuralDenotationError):
        store.realize_denotation(quoted, ANCHORS)
    assert store.snapshot() == before


def test_materialized_l3_link_is_checked_by_independent_l2_l5_replay():
    store = AnumMemory(initial_links=INITIAL_GRAPH)
    pair = denotate_anum_pair_subset(
        parse_raw_quaternary("01"),
        ProjectionContext.ROOT,
    )

    materialized = store.realize_denotation(pair, ANCHORS)
    start, end = store.poles(materialized)
    assert (materialized, start, end) == (3, 1, 2)

    proof = ProofObject(
        steps=(
            InterpretProofStep(
                expression=f"{materialized} = [] ⟼ []",
                context=ProofContext(start=0, end=0),
                symbols=((str(materialized), materialized),),
                distinguished_memory=(
                    DistinguishedLink(materialized, start, end),
                ),
                expected_substitutions=(
                    ExpectedSubstitution((1, 0), start),
                    ExpectedSubstitution((1, 1), end),
                ),
            ),
        )
    )

    assert check_proof(proof)
