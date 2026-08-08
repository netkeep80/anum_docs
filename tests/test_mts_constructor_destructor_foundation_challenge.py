"""Executable non-normative challenge for issue #177.

This models the proposed smaller constructor/destructor/deixis basis without
changing the production grammar or interpreter.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from core.anum_memory import AnumMemory
from core.mtc_ast import Definition, LinkForm
from core.mtc_parser import MTCParseError, parse_formula


ROOT = Path(__file__).resolve().parents[1]
CHALLENGE = ROOT / "contracts/mts-constructor-destructor-foundation-challenge-v0.6.json"
POLE_CHALLENGE = ROOT / "contracts/mts-pole-projection-foundation-challenge-v0.6.json"
ACT_CHALLENGE = ROOT / "contracts/mts-interpretation-act-network-challenge-v0.6.json"
ROOT_FIXTURE = ROOT / "tests/mtc_formulas.mtc"


def read(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def candidate_memory() -> tuple[AnumMemory, dict[str, int]]:
    refs = {
        "R": 0,
        "O": 1,
        "C": 2,
        "L": 3,
        "U": 4,
        "A": 5,
        "B": 6,
        "X": 7,
    }
    memory = AnumMemory(
        {
            refs["R"]: (refs["R"], refs["R"]),
            refs["O"]: (refs["O"], refs["R"]),
            refs["C"]: (refs["R"], refs["C"]),
            refs["L"]: (refs["O"], refs["C"]),
            refs["U"]: (refs["C"], refs["O"]),
            refs["A"]: (refs["A"], refs["A"]),
            refs["B"]: (refs["B"], refs["B"]),
            refs["X"]: (refs["A"], refs["B"]),
        }
    )
    return memory, refs


def raw_start(memory: AnumMemory, ref: int) -> int:
    return memory.poles(ref)[0]


def raw_end(memory: AnumMemory, ref: int) -> int:
    return memory.poles(ref)[1]


def historical_root_lines() -> list[str]:
    return [
        line.strip()
        for line in ROOT_FIXTURE.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    ]


def test_challenge_is_non_normative_and_depends_on_prior_foundation_evidence():
    challenge = read(CHALLENGE)
    pole = read(POLE_CHALLENGE)
    act = read(ACT_CHALLENGE)

    assert challenge["schema"] == "mts-constructor-destructor-foundation-challenge/v0.6"
    assert challenge["status"] == "candidate-challenge"
    assert challenge["accepted"] is False
    assert pole["schema"] in challenge["dependsOn"]
    assert act["schema"] in challenge["dependsOn"]
    assert challenge["veto"]["acceptedContractLinkAllowed"] is False
    assert challenge["veto"]["productionParserChanged"] is False
    assert challenge["veto"]["productionInterpreterChanged"] is False


def test_candidate_root_network_is_finite_closed_and_exact_pair_unique():
    memory, ref = candidate_memory()

    expected = {
        ref["R"]: (ref["R"], ref["R"]),
        ref["O"]: (ref["O"], ref["R"]),
        ref["C"]: (ref["R"], ref["C"]),
        ref["L"]: (ref["O"], ref["C"]),
        ref["U"]: (ref["C"], ref["O"]),
    }
    assert {key: memory.poles(key) for key in expected} == expected
    assert len(set(expected.values())) == len(expected)
    assert all(pole in memory.all_links() for pair in expected.values() for pole in pair)

    candidate = read(CHALLENGE)["rootCarrierCandidate"]
    assert candidate["allExactPairsDistinct"] is True
    assert candidate["finiteClosed"] is True


def test_raw_projection_operators_are_ordinary_destructors_in_candidate_model():
    memory, ref = candidate_memory()

    assert raw_start(memory, ref["R"]) == ref["R"]
    assert raw_end(memory, ref["R"]) == ref["R"]
    assert raw_start(memory, ref["O"]) == ref["O"]
    assert raw_end(memory, ref["O"]) == ref["R"]
    assert raw_start(memory, ref["C"]) == ref["R"]
    assert raw_end(memory, ref["C"]) == ref["C"]
    assert raw_start(memory, ref["L"]) == ref["O"]
    assert raw_end(memory, ref["L"]) == ref["C"]
    assert raw_start(memory, ref["U"]) == ref["C"]
    assert raw_end(memory, ref["U"]) == ref["O"]


def test_one_current_link_anchor_derives_both_local_roles_without_context_frame():
    memory, ref = candidate_memory()
    current = ref["X"]

    candidate_female_up = raw_start(memory, current)
    candidate_up_male = raw_end(memory, current)

    assert memory.poles(current) == (ref["A"], ref["B"])
    assert candidate_female_up == ref["A"]
    assert candidate_up_male == ref["B"]

    boundary = read(CHALLENGE)["deicticBoundary"]
    assert boundary["current"] == "↑ -> X"
    assert boundary["forXEqualLinkAB"] == ["♀↑ -> A", "↑♂ -> B"]
    assert boundary["ContextFrameRequiredByCandidateOntology"] is False


def test_candidate_aroot_directly_encodes_the_raw_self_cycle_without_deixis():
    parsed = parse_formula("∞ : ∞ ⟼ ∞")

    assert isinstance(parsed, Definition)
    assert isinstance(parsed.value, LinkForm)

    memory, ref = candidate_memory()
    assert memory.poles(ref["R"]) == (ref["R"], ref["R"])

    aroot = read(CHALLENGE)["arootBoundary"]
    assert aroot["candidate"] == "∞ : ∞ ⟼ ∞"
    assert aroot["usesDeixis"] is False
    assert aroot["historicalRawConditionReproducible"] is True


def test_root_specific_open_close_definitions_preserve_historical_local_equations():
    open_definition = parse_formula("([) : ([) ⟼ ∞")
    close_definition = parse_formula("(]) : ∞ ⟼ (])")

    assert isinstance(open_definition, Definition)
    assert isinstance(open_definition.value, LinkForm)
    assert isinstance(close_definition, Definition)
    assert isinstance(close_definition.value, LinkForm)

    memory, ref = candidate_memory()
    assert memory.poles(ref["O"]) == (ref["O"], ref["R"])
    assert memory.poles(ref["C"]) == (ref["R"], ref["C"])

    preservation = read(CHALLENGE)["historicalTopologyPreservation"]
    assert preservation["OHasHistoricalStartRootEquation"] == "O.start=O; O.end=R"
    assert preservation["CHasHistoricalEndRootEquation"] == "C.start=R; C.end=C"
    assert preservation["acceptedEquivalenceClaim"] is False


def test_candidate_link_and_unlink_meanings_preserve_orientation_and_l4_idempotence():
    memory, ref = candidate_memory()

    assert memory.poles(ref["L"]) == (ref["O"], ref["C"])
    assert memory.poles(ref["U"]) == (ref["C"], ref["O"])
    assert ref["L"] != ref["U"]
    assert memory.intern_link(ref["O"], ref["C"]) == ref["L"]
    assert memory.intern_link(ref["C"], ref["O"]) == ref["U"]

    anum = read(CHALLENGE)["anumBoundaryCandidate"]
    assert anum["open"] == "([)"
    assert anum["close"] == "(])"
    assert anum["one"] == "(⟼)"
    assert anum["zero"] == "(↛)"
    assert anum["preservesOrientationStructurally"] is True
    assert anum["replacesAcceptedV02BoundaryInProduction"] is False


def test_exact_pair_store_supports_candidate_materialized_equality_observation():
    memory, ref = candidate_memory()

    # Existing exact pair is canonical/idempotent; the store does not create a
    # second logical link with identical ordered poles.
    assert memory.intern_link(ref["A"], ref["B"]) == ref["X"]
    assert memory.find_link(ref["A"], ref["B"]) == ref["X"]

    equality = read(CHALLENGE)["equalityCandidate"]
    assert equality["materializedExactPairObservation"].startswith(
        "if A and B are canonical materialized links"
    )
    assert equality["virtualRecursiveEqualitySolved"] is False
    assert equality["accepted"] is False


def test_current_parser_proves_this_is_not_a_silent_production_migration():
    # Current grammar only permits ↑ as ascent before ◁/▷. The candidate must
    # therefore pass a separate decision before any parser change.
    with pytest.raises(MTCParseError, match="После `↑` ожидается"):
        parse_formula("↑")

    with pytest.raises(MTCParseError):
        parse_formula("(=) : {♀(♀↑) = ♀(↑♂), (♀↑)♂ = (↑♂)♂}")


def test_projection_semantic_migration_has_an_explicit_core_impact_inventory():
    challenge = read(CHALLENGE)
    files = challenge["impactInventory"]["productionCoreFilesThatEncodeOldProjectionMeaning"]

    assert set(files) == {
        "core/mtc_ast.py",
        "core/mtc_parser.py",
        "core/mtc_interpreter.py",
        "core/mtc_definitions.py",
        "core/mtc_value_bundle.py",
        "core/mtc_context_analysis.py",
    }
    for relative in files:
        assert (ROOT / relative).is_file()

    assert "class StartProjection" in (ROOT / "core/mtc_ast.py").read_text(encoding="utf-8")
    interpreter = (ROOT / "core/mtc_interpreter.py").read_text(encoding="utf-8")
    assert "find_start_projection" in interpreter
    assert "find_end_projection" in interpreter
    assert challenge["impactInventory"]["compatibilityDualProjectionSemanticsAllowed"] is False


def test_historical_root_is_preserved_while_candidate_root_is_allowed_to_change():
    historical = historical_root_lines()
    candidate = read(CHALLENGE)["candidateRootProgram"]

    assert len(historical) == 10
    assert len(candidate) == 10
    assert historical[0] == "∞ : {◁ = ∞, ▷ = ∞}"
    assert candidate[0] == "∞ : ∞ ⟼ ∞"
    assert historical != candidate
    assert read(CHALLENGE)["veto"]["productionRootChanged"] is False


def test_round_form_a2_is_explicitly_reopened_instead_of_preserved_by_counting_roots():
    a2 = read(CHALLENGE)["roundFormA2"]

    assert a2["candidate"] == "() : ♀() ⟼ ()♂"
    assert a2["mayBeDerivedOrTautological"] is True
    assert a2["keepInMinimalRoot"] == "challenged"


def test_no_constructor_destructor_candidate_is_promoted():
    challenge = read(CHALLENGE)

    assert challenge["accepted"] is False
    assert challenge["equalityCandidate"]["accepted"] is False
    assert challenge["veto"]["historicalContractChanged"] is False
    assert challenge["veto"]["noSecondProjectionMeaningCompatibilityLayer"] is True
