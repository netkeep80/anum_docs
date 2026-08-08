"""Cross-check the L3 root-boundary projection against accepted MTS v0.2."""

import json
from pathlib import Path

from core.anum_model import ProjectionContext, ProjectionKind
from core.anum_parser import parse_raw_quaternary
from core.anum_protocol import project_anum


CONTRACT = Path(__file__).parents[1] / "contracts" / "anum-boundary-projection-v0.2.json"
ROOT_PROGRAM = Path(__file__).with_name("mtc_formulas.mtc")


def _contract():
    return json.loads(CONTRACT.read_text(encoding="utf-8"))


def test_boundary_contract_is_root_scoped_and_does_not_claim_general_denotation():
    contract = _contract()

    assert contract["schema"] == "anum-boundary-projection/v0.2"
    assert contract["status"] == "accepted-subset"
    assert contract["dependsOn"] == "mts-contract/v0.2"
    assert contract["context"] == "root"
    assert contract["scope"] == {
        "absoluteRule": False,
        "quoteContextApplies": False,
        "relativeContextApplies": False,
        "generalRawDenotationDefined": False,
    }


def test_boundary_orientation_is_derived_from_the_accepted_root_program():
    root = ROOT_PROGRAM.read_text(encoding="utf-8")
    contract = _contract()

    for formula in contract["derivation"]:
        assert formula in root

    assert contract["orientation"] == {"open": "♀∞", "close": "∞♂"}


def test_executable_projection_matches_every_contract_vector():
    for vector in _contract()["projection"]:
        projection = project_anum(
            parse_raw_quaternary(vector["raw"]), ProjectionContext.ROOT
        )

        expected_kind = (
            ProjectionKind.PROTOCOL_VALUE
            if vector["kind"] == "protocol-value"
            else ProjectionKind.BOUNDARY_FORM
        )
        assert projection.kind is expected_kind
        assert projection.arrow_form == vector["form"]
        assert projection.protocol_value == vector["protocolValue"]


def test_root_boundary_values_follow_current_mts_link_and_unlink_orientation():
    link = project_anum(parse_raw_quaternary("[]"), ProjectionContext.ROOT)
    unlink = project_anum(parse_raw_quaternary("]["), ProjectionContext.ROOT)

    assert link.protocol_value == "1"
    assert unlink.protocol_value == "0"
