"""Contract tests for the accepted language-neutral MTS v0.2 surface."""

import json
from pathlib import Path

from core.mtc_ast import ContextPole, ContextPronoun, Definition
from core.mtc_parser import parse_formula


ROOT = Path(__file__).resolve().parents[1]
CONTRACT = ROOT / "contracts/mts-contract-v0.2.json"
CONFORMANCE = ROOT / "contracts/mts-conformance-v0.2.json"
ANUM_BOUNDARY = ROOT / "contracts/anum-boundary-projection-v0.2.json"
ROOT_PROGRAM = ROOT / "tests/mtc_formulas.mtc"


def load_contract() -> dict:
    return json.loads(CONTRACT.read_text(encoding="utf-8"))


def root_sources() -> list[str]:
    return [
        line.strip()
        for line in ROOT_PROGRAM.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    ]


def test_contract_is_accepted_v02_and_points_to_canonical_artifacts():
    contract = load_contract()

    assert contract["schema"] == "mts-contract/v0.2"
    assert contract["status"] == "accepted"
    assert contract["rootProgram"] == "tests/mtc_formulas.mtc"
    assert contract["conformanceCorpus"] == "contracts/mts-conformance-v0.2.json"
    assert contract["anum"]["rootBoundaryProjection"] == (
        "contracts/anum-boundary-projection-v0.2.json"
    )
    assert contract["anum"]["generalDenotationIssue"] == 89
    assert CONFORMANCE.is_file()
    assert ANUM_BOUNDARY.is_file()

    corpus = json.loads(CONFORMANCE.read_text(encoding="utf-8"))
    assert corpus["contract"] == contract["schema"]
    assert corpus["status"] == "accepted"

    boundary = json.loads(ANUM_BOUNDARY.read_text(encoding="utf-8"))
    assert boundary["dependsOn"] == contract["schema"]
    assert boundary["scope"]["generalRawDenotationDefined"] is False


def test_contract_exposes_exactly_two_atomic_non_bracket_context_pronouns():
    context = load_contract()["formalNotation"]["context"]
    roles = context["roles"]

    assert context["atomicPronouns"] is True
    assert context["bracketOverloading"] is False
    assert roles == [
        {"source": "◁", "role": "start"},
        {"source": "▷", "role": "end"},
    ]
    assert all(len(role["source"]) == 1 for role in roles)
    assert context["ancestor"]["operator"] == "↑"

    syntax = "".join(role["source"] for role in roles) + context["ancestor"]["operator"]
    assert "[" not in syntax and "]" not in syntax

    parsed = [parse_formula(role["source"]) for role in roles]
    assert all(isinstance(item, ContextPronoun) for item in parsed)
    assert [item.pole for item in parsed] == [ContextPole.START, ContextPole.END]


def test_contract_declares_occurrence_local_anonymous_form():
    anonymous = load_contract()["formalNotation"]["anonymousForm"]

    assert anonymous == {
        "source": "[]",
        "identity": "ast-occurrence-path",
        "meaning": "anonymous-link-form",
    }


def test_contract_declares_read_only_recursive_associative_pattern_matching():
    contract = load_contract()
    pattern = contract["formalNotation"]["patternMatching"]
    memory = contract["memory"]

    assert pattern == {
        "linkForm": "decompose-existing-link",
        "roundGrouping": "transparent",
        "materializes": False,
    }
    assert "poles" in memory["readOperations"]
    assert memory["interpretMayMaterialize"] is False
    assert "realize" in memory["effectOperations"]
    assert "realize" not in memory["readOperations"]


def test_contract_definitions_are_exactly_present_in_canonical_root():
    contract = load_contract()
    sources = set(root_sources())

    assert contract["formalNotation"]["aroot"]["definition"] in sources
    assert contract["formalNotation"]["equality"]["definition"] in sources
    assert len(sources) == 10
    assert all(isinstance(parse_formula(source), Definition) for source in sources)


def test_contract_separates_formal_interpretation_from_anum_serialization():
    contract = load_contract()

    assert contract["anum"]["operations"] == ["serialize", "deserialize"]
    assert set(contract["formalNotation"]["operations"]) == {"parse", "interpret"}
    assert contract["anum"]["alphabet"] == ["[", "]", "1", "0"]


def test_contract_forbids_display_label_as_runtime_identity():
    integration = load_contract()["integration"]

    assert integration["displayLabelIsIdentity"] is False
    assert {"LinkRef", "HoleId", "ContextFrameId"}.issubset(
        integration["requiredRuntimeIdentities"]
    )
