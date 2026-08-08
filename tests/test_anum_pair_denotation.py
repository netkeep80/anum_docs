"""Conformance tests for the accepted minimal Anum pair denotation subset."""

import json
from pathlib import Path

import pytest

from core.anum_denotation import (
    AnumDenotation,
    DenotationNode,
    DenotationRef,
    StructuralDenotation,
    canonical_denotation_json,
    denotation_from_data,
)
from core.anum_model import ProjectionContext
from core.anum_pair_denotation import (
    PROTOCOL_ONE_ANCHOR,
    PROTOCOL_ZERO_ANCHOR,
    canonical_pair_anum,
    denotate_anum_pair_subset,
)
from core.anum_parser import parse_raw_quaternary


ROOT = Path(__file__).parents[1]
CONTRACT = ROOT / "contracts/anum-pair-denotation-v0.2.json"
CORPUS = ROOT / "contracts/anum-pair-denotation-conformance-v0.2.json"
SOURCE = ROOT / "core/anum_pair_denotation.py"


def _context(name: str) -> ProjectionContext:
    return ProjectionContext(name)


def test_pair_contract_is_accepted_bounded_and_non_materializing():
    contract = json.loads(CONTRACT.read_text(encoding="utf-8"))

    assert contract["schema"] == "anum-pair-denotation/v0.2"
    assert contract["status"] == "accepted"
    assert contract["protocolAnchors"] == {
        "0": PROTOCOL_ZERO_ANCHOR,
        "1": PROTOCOL_ONE_ANCHOR,
    }
    assert contract["unsupported"]["recursiveBrackets"] == "issue #95"
    assert contract["unsupported"]["relativeDenotation"] is True
    assert contract["effects"] == {
        "mayReadMemory": False,
        "mayMutateMemory": False,
        "mayRealize": False,
    }


def test_pair_decoder_source_has_no_storage_or_realization_dependency():
    source = SOURCE.read_text(encoding="utf-8")

    for forbidden in (
        "LinkStore",
        "PersistentLinkStore",
        "database",
        "sqlite",
        "realize(",
        "find(",
    ):
        assert forbidden not in source


def test_every_language_neutral_pair_vector_matches_reference_decoder():
    corpus = json.loads(CORPUS.read_text(encoding="utf-8"))

    assert corpus["schema"] == "anum-pair-denotation-conformance/v0.2"
    assert corpus["contract"] == "anum-pair-denotation/v0.2"
    assert corpus["status"] == "accepted"

    for case in corpus["cases"]:
        result = denotate_anum_pair_subset(
            parse_raw_quaternary(case["raw"]),
            _context(case["context"]),
        )
        expected = denotation_from_data(case["expected"])
        assert canonical_denotation_json(result) == canonical_denotation_json(expected)

        canonical_raw = case["canonicalRaw"]
        if canonical_raw is None:
            with pytest.raises(ValueError, match="structural"):
                canonical_pair_anum(result)
        else:
            assert canonical_pair_anum(result) == canonical_raw
            round_trip = denotate_anum_pair_subset(
                parse_raw_quaternary(canonical_raw),
                ProjectionContext.ROOT,
            )
            assert canonical_denotation_json(round_trip) == canonical_denotation_json(result)


def test_all_four_direct_protocol_pairs_create_exactly_one_ordered_link():
    expected = {
        "00": (PROTOCOL_ZERO_ANCHOR, PROTOCOL_ZERO_ANCHOR),
        "01": (PROTOCOL_ZERO_ANCHOR, PROTOCOL_ONE_ANCHOR),
        "10": (PROTOCOL_ONE_ANCHOR, PROTOCOL_ZERO_ANCHOR),
        "11": (PROTOCOL_ONE_ANCHOR, PROTOCOL_ONE_ANCHOR),
    }

    for raw, endpoints in expected.items():
        result = denotate_anum_pair_subset(
            parse_raw_quaternary(raw), ProjectionContext.ROOT
        )
        assert result.structural is not None
        assert len(result.structural.nodes) == 1
        node = result.structural.nodes[0]
        assert node.start == DenotationRef.anchor_ref(endpoints[0])
        assert node.end == DenotationRef.anchor_ref(endpoints[1])
        assert result.structural.root == DenotationRef.node_ref(0)


def test_root_boundary_aliases_have_atomic_canonical_inverse():
    link_alias = denotate_anum_pair_subset(
        parse_raw_quaternary("[]"), ProjectionContext.ROOT
    )
    direct_link = denotate_anum_pair_subset(
        parse_raw_quaternary("1"), ProjectionContext.ROOT
    )
    unlink_alias = denotate_anum_pair_subset(
        parse_raw_quaternary("]["), ProjectionContext.ROOT
    )
    direct_unlink = denotate_anum_pair_subset(
        parse_raw_quaternary("0"), ProjectionContext.ROOT
    )

    assert canonical_denotation_json(link_alias) == canonical_denotation_json(direct_link)
    assert canonical_denotation_json(unlink_alias) == canonical_denotation_json(direct_unlink)
    assert canonical_pair_anum(link_alias) == "1"
    assert canonical_pair_anum(unlink_alias) == "0"


def test_longer_and_bracket_structures_are_not_guessed():
    for raw in ("010", "1011", "[0]", "[01]", "[][]", "[[", "]]"):
        result = denotate_anum_pair_subset(
            parse_raw_quaternary(raw), ProjectionContext.ROOT
        )
        assert result.structural is None
        assert result.raw == raw


def test_quote_and_relative_contexts_never_inherit_root_pair_semantics():
    quoted = denotate_anum_pair_subset(
        parse_raw_quaternary("[01]"), ProjectionContext.QUOTE
    )
    quoted_plain = denotate_anum_pair_subset(
        parse_raw_quaternary("01"), ProjectionContext.QUOTE
    )
    relative = denotate_anum_pair_subset(
        parse_raw_quaternary("01"), ProjectionContext.RELATIVE
    )

    assert quoted.structural is None and quoted.raw == "01"
    assert quoted_plain.structural is None and quoted_plain.raw == "01"
    assert relative.structural is None and relative.raw == "01"


def test_inverse_rejects_nested_or_non_protocol_structural_values():
    nested = AnumDenotation.structural_result(
        StructuralDenotation(
            anchors=(PROTOCOL_ZERO_ANCHOR,),
            nodes=(
                DenotationNode(
                    id=0,
                    start=DenotationRef.anchor_ref(PROTOCOL_ZERO_ANCHOR),
                    end=DenotationRef.anchor_ref(PROTOCOL_ZERO_ANCHOR),
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
    external_anchor = AnumDenotation.structural_result(
        StructuralDenotation(
            anchors=("external:a",),
            nodes=(),
            root=DenotationRef.anchor_ref("external:a"),
        )
    )

    with pytest.raises(ValueError, match="nested"):
        canonical_pair_anum(nested)
    with pytest.raises(ValueError, match="protocol anchor"):
        canonical_pair_anum(external_anchor)


def test_inverse_rejects_extra_unused_anchors():
    malformed_subset = AnumDenotation.structural_result(
        StructuralDenotation(
            anchors=(PROTOCOL_ONE_ANCHOR, PROTOCOL_ZERO_ANCHOR),
            nodes=(),
            root=DenotationRef.anchor_ref(PROTOCOL_ZERO_ANCHOR),
        )
    )

    with pytest.raises(ValueError, match="outside the canonical pair subset"):
        canonical_pair_anum(malformed_subset)
