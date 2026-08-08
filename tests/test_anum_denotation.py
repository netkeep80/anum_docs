"""Conformance tests for the storage-neutral Anum denotation IR."""

import json
from pathlib import Path

import pytest

from core.anum_denotation import (
    AnumDenotation,
    DenotationKind,
    DenotationNode,
    DenotationRef,
    StructuralDenotation,
    canonical_denotation_json,
    denotation_from_data,
)


ROOT = Path(__file__).parents[1]
CONTRACT = ROOT / "contracts/anum-denotation-v0.2.json"
CORPUS = ROOT / "contracts/anum-denotation-conformance-v0.2.json"
SOURCE = ROOT / "core/anum_denotation.py"


def test_machine_contract_is_storage_neutral_non_materializing_and_accepted():
    contract = json.loads(CONTRACT.read_text(encoding="utf-8"))

    assert contract["schema"] == "anum-denotation/v0.2"
    assert contract["status"] == "accepted"
    assert contract["conformanceCorpus"] == (
        "contracts/anum-denotation-conformance-v0.2.json"
    )
    assert contract["effects"] == {
        "mayReadMemory": False,
        "mayMutateMemory": False,
        "mayRealize": False,
    }
    assert contract["identity"]["persistentLinkIdAllowed"] is False
    assert "recursive Anum decode grammar" in contract["explicitlyOutOfScope"]


def test_reference_module_does_not_import_or_name_storage_backends():
    source = SOURCE.read_text(encoding="utf-8")

    for forbidden in ("LinkStore", "PersistentLinkStore", "database", "sqlite", "realize("):
        assert forbidden not in source


def test_language_neutral_conformance_corpus_round_trips_through_reference_model():
    corpus = json.loads(CORPUS.read_text(encoding="utf-8"))

    assert corpus["schema"] == "anum-denotation-conformance/v0.2"
    assert corpus["contract"] == "anum-denotation/v0.2"
    assert corpus["status"] == "accepted"

    names = []
    for case in corpus["cases"]:
        names.append(case["name"])
        value = denotation_from_data(case["value"])
        assert canonical_denotation_json(value) == case["canonicalJson"]

    assert names == [
        "anchor-only",
        "nested-link",
        "shared-substructure",
        "unresolved-raw",
        "quoted-raw",
    ]


def test_anchor_only_structural_denotation():
    value = StructuralDenotation(
        anchors=("one",),
        nodes=(),
        root=DenotationRef.anchor_ref("one"),
    )

    result = AnumDenotation.structural_result(value)
    assert result.kind is DenotationKind.STRUCTURAL
    assert result.structural == value


def test_nested_structural_denotation_uses_only_earlier_nodes():
    value = StructuralDenotation(
        anchors=("left", "right"),
        nodes=(
            DenotationNode(
                id=0,
                start=DenotationRef.anchor_ref("left"),
                end=DenotationRef.anchor_ref("right"),
            ),
            DenotationNode(
                id=1,
                start=DenotationRef.node_ref(0),
                end=DenotationRef.anchor_ref("left"),
            ),
        ),
        root=DenotationRef.node_ref(1),
    )

    encoded = json.loads(canonical_denotation_json(AnumDenotation.structural_result(value)))
    assert encoded["root"] == {"node": 1}
    assert encoded["nodes"][1]["start"] == {"node": 0}


def test_shared_substructure_reuses_one_description_local_node():
    value = StructuralDenotation(
        anchors=("a", "b"),
        nodes=(
            DenotationNode(
                id=0,
                start=DenotationRef.anchor_ref("a"),
                end=DenotationRef.anchor_ref("b"),
            ),
            DenotationNode(
                id=1,
                start=DenotationRef.node_ref(0),
                end=DenotationRef.node_ref(0),
            ),
        ),
        root=DenotationRef.node_ref(1),
    )

    encoded = json.loads(canonical_denotation_json(AnumDenotation.structural_result(value)))
    assert encoded["nodes"][1]["start"] == {"node": 0}
    assert encoded["nodes"][1]["end"] == {"node": 0}


def test_missing_anchor_is_rejected():
    with pytest.raises(ValueError, match="undeclared anchor"):
        StructuralDenotation(
            anchors=("known",),
            nodes=(),
            root=DenotationRef.anchor_ref("missing"),
        )


def test_forward_self_duplicate_and_non_contiguous_node_ids_are_rejected():
    with pytest.raises(ValueError, match="earlier node"):
        StructuralDenotation(
            anchors=("a",),
            nodes=(
                DenotationNode(
                    id=0,
                    start=DenotationRef.node_ref(0),
                    end=DenotationRef.anchor_ref("a"),
                ),
            ),
            root=DenotationRef.node_ref(0),
        )

    with pytest.raises(ValueError, match="contiguous"):
        StructuralDenotation(
            anchors=("a",),
            nodes=(
                DenotationNode(
                    id=0,
                    start=DenotationRef.anchor_ref("a"),
                    end=DenotationRef.anchor_ref("a"),
                ),
                DenotationNode(
                    id=0,
                    start=DenotationRef.node_ref(0),
                    end=DenotationRef.anchor_ref("a"),
                ),
            ),
            root=DenotationRef.node_ref(0),
        )


def test_anchor_keys_must_be_sorted_unique_and_non_empty():
    with pytest.raises(ValueError, match="sorted"):
        StructuralDenotation(
            anchors=("b", "a"),
            nodes=(),
            root=DenotationRef.anchor_ref("a"),
        )

    with pytest.raises(ValueError, match="unique"):
        StructuralDenotation(
            anchors=("a", "a"),
            nodes=(),
            root=DenotationRef.anchor_ref("a"),
        )

    with pytest.raises(ValueError, match="non-empty"):
        StructuralDenotation(
            anchors=("",),
            nodes=(),
            root=DenotationRef.anchor_ref(""),
        )


def test_data_parser_rejects_mixed_ref_shape_and_unexpected_fields():
    with pytest.raises(ValueError, match="exactly one anchor or node"):
        denotation_from_data(
            {
                "kind": "structural",
                "anchors": ["a"],
                "nodes": [],
                "root": {"anchor": "a", "node": 0},
            }
        )

    with pytest.raises(ValueError, match="unexpected or missing fields"):
        denotation_from_data(
            {
                "kind": "structural",
                "anchors": ["a"],
                "nodes": [],
                "root": {"anchor": "a"},
                "linkId": 42,
            }
        )


def test_raw_and_quoted_raw_remain_non_structural_results():
    raw = AnumDenotation.raw_result("[[01")
    quoted = AnumDenotation.quoted_raw_result("[01]")

    assert raw.structural is None
    assert quoted.structural is None
    assert json.loads(canonical_denotation_json(raw)) == {
        "kind": "raw",
        "raw": "[[01",
    }
    assert json.loads(canonical_denotation_json(quoted)) == {
        "kind": "quoted-raw",
        "raw": "[01]",
    }


def test_payload_shapes_cannot_mix_structural_and_raw_data():
    structural = StructuralDenotation(
        anchors=("a",),
        nodes=(),
        root=DenotationRef.anchor_ref("a"),
    )

    with pytest.raises(ValueError, match="structural payload"):
        AnumDenotation(
            kind=DenotationKind.STRUCTURAL,
            structural=structural,
            raw="1",
        )

    with pytest.raises(ValueError, match="raw payload"):
        AnumDenotation(kind=DenotationKind.RAW)


def test_canonical_json_is_deterministic_and_compact():
    value = AnumDenotation.structural_result(
        StructuralDenotation(
            anchors=("a", "b"),
            nodes=(
                DenotationNode(
                    id=0,
                    start=DenotationRef.anchor_ref("a"),
                    end=DenotationRef.anchor_ref("b"),
                ),
            ),
            root=DenotationRef.node_ref(0),
        )
    )

    first = canonical_denotation_json(value)
    second = canonical_denotation_json(value)

    assert first == second
    assert " " not in first
    assert first == (
        '{"anchors":["a","b"],"kind":"structural","nodes":'
        '[{"end":{"anchor":"b"},"id":0,"start":{"anchor":"a"}}],'
        '"root":{"node":0}}'
    )
