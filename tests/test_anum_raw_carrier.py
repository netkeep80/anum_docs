"""Conformance tests for the storage-neutral raw Anum carrier description."""

import json
from pathlib import Path

import pytest

from core.anum_pair_denotation import denotate_anum_pair_subset
from core.anum_model import ProjectionContext
from core.anum_parser import parse_raw_quaternary
from core.anum_raw_carrier import (
    RawCarrierDescription,
    RawCarrierNode,
    RawCarrierRef,
    RawCarrierRole,
    canonical_raw_carrier_json,
    describe_raw_carrier,
    raw_carrier_from_data,
)
from core.anum_denotation import canonical_denotation_json


ROOT = Path(__file__).parents[1]
CONTRACT = ROOT / "contracts/anum-raw-carrier-v0.2.json"
CORPUS = ROOT / "contracts/anum-raw-carrier-conformance-v0.2.json"
SOURCE = ROOT / "core/anum_raw_carrier.py"


def test_contract_is_accepted_storage_neutral_and_not_denotation():
    contract = json.loads(CONTRACT.read_text(encoding="utf-8"))

    assert contract["schema"] == "anum-raw-carrier/v0.2"
    assert contract["status"] == "accepted"
    assert contract["conformanceCorpus"] == (
        "contracts/anum-raw-carrier-conformance-v0.2.json"
    )
    assert contract["separation"]["rawCarrierIsDenotation"] is False
    assert set(contract["separation"]["rawAbitRoles"]).isdisjoint(
        contract["separation"]["denotationProtocolAnchors"]
    )
    assert contract["effects"] == {
        "mayReadMemory": False,
        "mayMutateMemory": False,
        "mayRealize": False,
    }
    assert contract["identity"]["rolesAreProtocolPositionsNotGlobalObjects"] is True
    assert contract["identity"]["classicalGraphNodeIdentityClaimed"] is False


def test_reference_module_has_no_storage_projection_or_denotation_dependency():
    source = SOURCE.read_text(encoding="utf-8")

    for forbidden in (
        "LinkStore",
        "PersistentLinkStore",
        "database",
        "sqlite",
        "realize(",
        "find(",
        "project_anum",
        "ProjectionContext",
        "AnumDenotation",
        "protocol:0",
        "protocol:1",
    ):
        assert forbidden not in source


def test_all_language_neutral_vectors_match_reference_builder_and_json():
    corpus = json.loads(CORPUS.read_text(encoding="utf-8"))

    assert corpus["schema"] == "anum-raw-carrier-conformance/v0.2"
    assert corpus["contract"] == "anum-raw-carrier/v0.2"
    assert corpus["status"] == "accepted"

    for case in corpus["cases"]:
        description = describe_raw_carrier(parse_raw_quaternary(case["raw"]))
        expected = raw_carrier_from_data(case["expected"])

        assert description == expected
        assert canonical_raw_carrier_json(description) == case["canonicalJson"]
        assert canonical_raw_carrier_json(expected) == case["canonicalJson"]


def test_empty_raw_carrier_is_root_role_only_without_denotation_claim():
    description = describe_raw_carrier(parse_raw_quaternary(""))

    assert description.raw == ""
    assert description.nodes == ()
    assert description.root == RawCarrierRef.role_ref(RawCarrierRole.ROOT)


def test_each_raw_abit_has_a_distinct_role():
    expected = {
        "[": RawCarrierRole.OPEN,
        "]": RawCarrierRole.CLOSE,
        "1": RawCarrierRole.LINK,
        "0": RawCarrierRole.UNLINK,
    }

    assert len(set(expected.values())) == 4
    for raw, role in expected.items():
        description = describe_raw_carrier(parse_raw_quaternary(raw))
        assert len(description.nodes) == 1
        assert description.nodes[0].start == RawCarrierRef.role_ref(RawCarrierRole.ROOT)
        assert description.nodes[0].end == RawCarrierRef.role_ref(role)


def test_pair_raw_carrier_is_chain_and_not_pair_denotation():
    form = parse_raw_quaternary("01")
    carrier = describe_raw_carrier(form)
    denotation = denotate_anum_pair_subset(form, ProjectionContext.ROOT)

    assert isinstance(carrier, RawCarrierDescription)
    assert carrier.raw == "01"
    assert carrier.nodes == (
        RawCarrierNode(
            id=0,
            start=RawCarrierRef.role_ref(RawCarrierRole.ROOT),
            end=RawCarrierRef.role_ref(RawCarrierRole.UNLINK),
        ),
        RawCarrierNode(
            id=1,
            start=RawCarrierRef.node_ref(0),
            end=RawCarrierRef.role_ref(RawCarrierRole.LINK),
        ),
    )
    assert carrier.root == RawCarrierRef.node_ref(1)

    assert denotation.structural is not None
    assert len(denotation.structural.nodes) == 1
    assert canonical_raw_carrier_json(carrier) != canonical_denotation_json(denotation)
    assert "abit:0" in canonical_raw_carrier_json(carrier)
    assert "protocol:0" in canonical_denotation_json(denotation)


def test_brackets_remain_plain_raw_roles_without_quote_or_root_projection():
    description = describe_raw_carrier(parse_raw_quaternary("[01]"))

    assert [node.end.role for node in description.nodes] == [
        RawCarrierRole.OPEN,
        RawCarrierRole.UNLINK,
        RawCarrierRole.LINK,
        RawCarrierRole.CLOSE,
    ]
    assert description.raw == "[01]"


def test_repeated_and_long_sequences_are_preserved_exactly():
    raw = "00110][[10"
    description = describe_raw_carrier(parse_raw_quaternary(raw))

    assert description.raw == raw
    assert len(description.nodes) == len(raw)
    assert description.root == RawCarrierRef.node_ref(len(raw) - 1)

    for index, node in enumerate(description.nodes):
        expected_start = (
            RawCarrierRef.role_ref(RawCarrierRole.ROOT)
            if index == 0
            else RawCarrierRef.node_ref(index - 1)
        )
        assert node.id == index
        assert node.start == expected_start


def test_validator_rejects_non_contiguous_node_positions():
    with pytest.raises(ValueError, match="contiguous"):
        RawCarrierDescription(
            raw="0",
            nodes=(
                RawCarrierNode(
                    id=1,
                    start=RawCarrierRef.role_ref(RawCarrierRole.ROOT),
                    end=RawCarrierRef.role_ref(RawCarrierRole.UNLINK),
                ),
            ),
            root=RawCarrierRef.node_ref(0),
        )


def test_validator_rejects_branching_or_skipped_sequence_chain():
    with pytest.raises(ValueError, match="ordered sequence chain"):
        RawCarrierDescription(
            raw="01",
            nodes=(
                RawCarrierNode(
                    id=0,
                    start=RawCarrierRef.role_ref(RawCarrierRole.ROOT),
                    end=RawCarrierRef.role_ref(RawCarrierRole.UNLINK),
                ),
                RawCarrierNode(
                    id=1,
                    start=RawCarrierRef.role_ref(RawCarrierRole.ROOT),
                    end=RawCarrierRef.role_ref(RawCarrierRole.LINK),
                ),
            ),
            root=RawCarrierRef.node_ref(1),
        )


def test_validator_rejects_non_abit_end_role():
    with pytest.raises(ValueError, match="raw abit role"):
        RawCarrierDescription(
            raw="0",
            nodes=(
                RawCarrierNode(
                    id=0,
                    start=RawCarrierRef.role_ref(RawCarrierRole.ROOT),
                    end=RawCarrierRef.role_ref(RawCarrierRole.ROOT),
                ),
            ),
            root=RawCarrierRef.node_ref(0),
        )


def test_validator_rejects_wrong_root_and_raw_text_mismatch():
    valid_node = RawCarrierNode(
        id=0,
        start=RawCarrierRef.role_ref(RawCarrierRole.ROOT),
        end=RawCarrierRef.role_ref(RawCarrierRole.UNLINK),
    )

    with pytest.raises(ValueError, match="raw carrier root"):
        RawCarrierDescription(
            raw="0",
            nodes=(valid_node,),
            root=RawCarrierRef.role_ref(RawCarrierRole.ROOT),
        )

    with pytest.raises(ValueError, match="raw carrier text"):
        RawCarrierDescription(
            raw="1",
            nodes=(valid_node,),
            root=RawCarrierRef.node_ref(0),
        )


def test_data_parser_rejects_mixed_refs_unknown_roles_and_extra_fields():
    with pytest.raises(ValueError, match="exactly one role or node"):
        raw_carrier_from_data(
            {
                "kind": "raw-carrier",
                "raw": "",
                "nodes": [],
                "root": {"role": "root", "node": 0},
            }
        )

    with pytest.raises(ValueError, match="unknown raw carrier role"):
        raw_carrier_from_data(
            {
                "kind": "raw-carrier",
                "raw": "",
                "nodes": [],
                "root": {"role": "protocol:0"},
            }
        )

    with pytest.raises(ValueError, match="exactly kind, raw, nodes and root"):
        raw_carrier_from_data(
            {
                "kind": "raw-carrier",
                "raw": "",
                "nodes": [],
                "root": {"role": "root"},
                "linkId": 42,
            }
        )
