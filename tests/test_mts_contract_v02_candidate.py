"""Contract tests for the language-neutral MTS v0.2 integration candidate."""

import json
from pathlib import Path

from core.mtc_ast import ContextPole, ContextPronoun, Definition
from core.mtc_parser import parse_formula

FIXTURES = Path(__file__).with_name("fixtures")
CONTRACT = FIXTURES / "mts_contract_v02_candidate.json"
ROOT_PROGRAM = FIXTURES / "mtc_root_v02_candidate.mtc"


def load_contract() -> dict:
    return json.loads(CONTRACT.read_text(encoding="utf-8"))


def root_sources() -> list[str]:
    return [
        line.strip()
        for line in ROOT_PROGRAM.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    ]


def test_contract_has_explicit_experimental_schema_and_layer_boundaries():
    contract = load_contract()
    assert contract["schema"] == "mts-contract/v0.2-candidate"
    assert contract["status"] == "experimental"
    assert contract["layers"] == {
        "formalNotation": "L2",
        "anumSerialization": "L3",
        "memoryExecution": "L4",
    }


def test_contract_exposes_exactly_two_atomic_binary_context_roles():
    contract = load_contract()
    context = contract["formalNotation"]["context"]
    roles = context["roles"]

    assert context["atomicPronouns"] is True
    assert context["bracketOverloading"] is False
    assert roles == [
        {"source": "◁", "role": "start"},
        {"source": "▷", "role": "end"},
    ]
    assert all(len(role["source"]) == 1 for role in roles)
    assert context["ancestor"]["operator"] == "↑"
    assert context["genericPathLanguage"] is False
    assert context["materializedLinkRequired"] is False

    parsed = [parse_formula(role["source"]) for role in roles]
    assert all(isinstance(item, ContextPronoun) for item in parsed)
    assert [item.pole for item in parsed] == [ContextPole.START, ContextPole.END]


def test_contract_keeps_square_brackets_out_of_context_syntax():
    context = load_contract()["formalNotation"]["context"]
    syntax = "".join(
        [role["source"] for role in context["roles"]]
        + [context["ancestor"]["operator"]]
    )
    assert "[" not in syntax
    assert "]" not in syntax


def test_contract_declares_empty_form_identity_as_ast_occurrence_path():
    anonymous = load_contract()["formalNotation"]["anonymousForm"]
    assert anonymous == {
        "source": "[]",
        "identity": "ast-occurrence-path",
        "meaning": "anonymous-link-form",
    }


def test_contract_declares_associative_link_pattern_decomposition():
    pattern = load_contract()["formalNotation"]["patternMatching"]
    assert pattern == {
        "linkForm": "decompose-existing-link",
        "roundGrouping": "transparent",
        "materializes": False,
    }
    assert "poles" in load_contract()["memory"]["readOperations"]


def test_contract_keeps_interpretation_read_only_and_realize_explicit():
    contract = load_contract()
    interpret = contract["formalNotation"]["operations"]["interpret"]
    memory = contract["memory"]
    assert interpret["effect"] == "none"
    assert memory["interpretMayMaterialize"] is False
    assert "realize" in memory["effectOperations"]
    assert "realize" not in memory["readOperations"]


def test_contract_candidate_definitions_are_present_in_root_program():
    contract = load_contract()
    sources = set(root_sources())
    assert contract["formalNotation"]["aroot"]["candidateDefinition"] in sources
    assert contract["formalNotation"]["equality"]["candidateDefinition"] in sources
    for source in sources:
        assert isinstance(parse_formula(source), Definition)


def test_contract_separates_anum_serialization_from_formal_interpretation():
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
