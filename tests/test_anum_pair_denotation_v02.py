"""Executable conformance for the accepted minimal Anum denotation subset v0.2."""

import json
from pathlib import Path

import pytest

from core.anum_denotation import (
    AnumDenotation,
    DenotationNode,
    DenotationRef,
    StructuralDenotation,
    denotation_from_data,
)
from core.anum_denotation_codec import (
    PROTOCOL_ONE_ANCHOR,
    PROTOCOL_ZERO_ANCHOR,
    canonical_anum_from_denotation,
    decode_anum_denotation,
)
from core.anum_model import ProjectionContext
from core.anum_parser import parse_raw_quaternary


ROOT = Path(__file__).resolve().parents[1]
CONTRACT_PATH = ROOT / "contracts" / "anum-pair-denotation-v0.2.json"
CORPUS_PATH = ROOT / "contracts" / "anum-pair-denotation-conformance-v0.2.json"
CODEC_PATH = ROOT / "core" / "anum_denotation_codec.py"


def _contract() -> dict:
    return json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))


def _corpus() -> dict:
    return json.loads(CORPUS_PATH.read_text(encoding="utf-8"))


def _context(name: str) -> ProjectionContext:
    return ProjectionContext(name)


def test_pair_denotation_contract_is_narrow_and_storage_neutral():
    contract = _contract()

    assert contract["schema"] == "anum-pair-denotation/v0.2"
    assert contract["status"] == "accepted-subset"
    assert contract["dependsOn"] == [
        "mts-contract/v0.2",
        "anum-boundary-projection/v0.2",
        "anum-denotation/v0.2",
    ]
    assert contract["protocolAnchors"] == {
        "0": PROTOCOL_ZERO_ANCHOR,
        "1": PROTOCOL_ONE_ANCHOR,
    }
    assert contract["scope"]["recursiveBracketGrammar"] is False
    assert contract["scope"]["relativeDenotation"] is False
    assert contract["effects"] == {
        "mayReadMemory": False,
        "mayMutateMemory": False,
        "mayRealize": False,
        "persistentLinkIdAllowed": False,
    }


def test_every_conformance_vector_executes_through_the_single_codec_path():
    corpus = _corpus()
    assert corpus["schema"] == "anum-pair-denotation-conformance/v0.2"
    assert corpus["contract"] == "anum-pair-denotation/v0.2"

    for case in corpus["cases"]:
        actual = decode_anum_denotation(
            parse_raw_quaternary(case["raw"]),
            _context(case["context"]),
        )
        expected = denotation_from_data(case["denotation"])
        assert actual == expected, case["name"]

        canonical_raw = case["canonicalRaw"]
        if canonical_raw is not None:
            assert canonical_anum_from_denotation(actual) == canonical_raw, case["name"]


def test_protocol_atoms_are_opaque_anchor_values_not_display_labels():
    zero = decode_anum_denotation(parse_raw_quaternary("0"), ProjectionContext.ROOT)
    one = decode_anum_denotation(parse_raw_quaternary("1"), ProjectionContext.ROOT)

    assert zero.structural == StructuralDenotation(
        anchors=(PROTOCOL_ZERO_ANCHOR,),
        nodes=(),
        root=DenotationRef.anchor_ref(PROTOCOL_ZERO_ANCHOR),
    )
    assert one.structural == StructuralDenotation(
        anchors=(PROTOCOL_ONE_ANCHOR,),
        nodes=(),
        root=DenotationRef.anchor_ref(PROTOCOL_ONE_ANCHOR),
    )
    assert PROTOCOL_ZERO_ANCHOR not in {"0", "∞♂", "♀∞"}
    assert PROTOCOL_ONE_ANCHOR not in {"1", "∞♂", "♀∞"}


def test_all_four_direct_pairs_denote_exactly_one_link_node():
    expected = {
        "00": (PROTOCOL_ZERO_ANCHOR, PROTOCOL_ZERO_ANCHOR),
        "01": (PROTOCOL_ZERO_ANCHOR, PROTOCOL_ONE_ANCHOR),
        "10": (PROTOCOL_ONE_ANCHOR, PROTOCOL_ZERO_ANCHOR),
        "11": (PROTOCOL_ONE_ANCHOR, PROTOCOL_ONE_ANCHOR),
    }

    for raw, (start, end) in expected.items():
        result = decode_anum_denotation(parse_raw_quaternary(raw), ProjectionContext.ROOT)
        assert result.structural is not None
        assert result.structural.nodes == (
            DenotationNode(
                id=0,
                start=DenotationRef.anchor_ref(start),
                end=DenotationRef.anchor_ref(end),
            ),
        )
        assert result.structural.root == DenotationRef.node_ref(0)
        assert canonical_anum_from_denotation(result) == raw


def test_boundary_aliases_are_many_to_one_but_inverse_is_canonical():
    zero = decode_anum_denotation(parse_raw_quaternary("0"), ProjectionContext.ROOT)
    zero_alias = decode_anum_denotation(parse_raw_quaternary("]["), ProjectionContext.ROOT)
    one = decode_anum_denotation(parse_raw_quaternary("1"), ProjectionContext.ROOT)
    one_alias = decode_anum_denotation(parse_raw_quaternary("[]"), ProjectionContext.ROOT)

    assert zero_alias == zero
    assert one_alias == one
    assert canonical_anum_from_denotation(zero_alias) == "0"
    assert canonical_anum_from_denotation(one_alias) == "1"


def test_unsupported_root_forms_remain_typed_raw_instead_of_guessing_denotation():
    for raw in ("[[", "]]", "010", "[01]", "[01]01", "10[]"):
        result = decode_anum_denotation(parse_raw_quaternary(raw), ProjectionContext.ROOT)
        assert result == AnumDenotation.raw_result(raw)


def test_quote_context_lowers_one_description_envelope_without_structural_decode():
    first = decode_anum_denotation(parse_raw_quaternary("[01]"), ProjectionContext.QUOTE)
    second = decode_anum_denotation(parse_raw_quaternary("[[01]]"), ProjectionContext.QUOTE)

    assert first == AnumDenotation.quoted_raw_result("01")
    assert second == AnumDenotation.quoted_raw_result("[01]")


def test_relative_context_never_inherits_root_pair_semantics():
    for raw in ("0", "1", "00", "01", "10", "11", "[]", "]["):
        assert decode_anum_denotation(
            parse_raw_quaternary(raw), ProjectionContext.RELATIVE
        ) == AnumDenotation.raw_result(raw)


def test_inverse_rejects_structural_shapes_outside_the_accepted_subset():
    nested = AnumDenotation.structural_result(
        StructuralDenotation(
            anchors=(PROTOCOL_ZERO_ANCHOR, PROTOCOL_ONE_ANCHOR),
            nodes=(
                DenotationNode(
                    id=0,
                    start=DenotationRef.anchor_ref(PROTOCOL_ZERO_ANCHOR),
                    end=DenotationRef.anchor_ref(PROTOCOL_ONE_ANCHOR),
                ),
                DenotationNode(
                    id=1,
                    start=DenotationRef.node_ref(0),
                    end=DenotationRef.anchor_ref(PROTOCOL_ZERO_ANCHOR),
                ),
            ),
            root=DenotationRef.node_ref(1),
        )
    )

    with pytest.raises(ValueError, match="outside the accepted direct-pair subset"):
        canonical_anum_from_denotation(nested)
    with pytest.raises(ValueError, match="only for structural denotations"):
        canonical_anum_from_denotation(AnumDenotation.raw_result("010"))


def test_codec_has_no_l4_or_storage_dependency():
    source = CODEC_PATH.read_text(encoding="utf-8")

    forbidden = (
        "anum_memory",
        "PersistMemoryManager",
        "persistent",
        "find(",
        "realize(",
        "delete(",
    )
    for marker in forbidden:
        assert marker not in source, marker
