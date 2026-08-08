"""Executable non-normative challenge for the foundation reset in issue #171.

This file intentionally does not change production parsing or interpretation.
It exposes the distinction between:

* the two roles currently supplied by ``ContextFrame``;
* the structural poles of a concrete focus link; and
* the separate projection-form links used by the current ``♀`` / ``♂`` runtime.

The challenge therefore prevents us from silently treating ``◁ == ♀↑`` and
``▷ == ↑♂`` as already true under the v0.5 implementation.
"""

from dataclasses import dataclass
import json
from pathlib import Path

import pytest

from core.mtc_ast import ContextPole, ContextPronoun
from core.mtc_interpreter import ContextFrame, MemoryView, resolve_context_pronoun
from core.mtc_parser import MTCParseError, parse_formula


ROOT = Path(__file__).resolve().parents[1]
CHALLENGE = ROOT / "contracts/mts-current-link-foundation-challenge-v0.6.json"
MTS_CONTRACT_V05 = ROOT / "contracts/mts-contract-v0.5.json"
ROOT_FIXTURE = ROOT / "tests/mtc_formulas.mtc"


@dataclass
class FiniteProjectionMemory(MemoryView):
    """Finite read-only graph in which direct poles and projection forms differ."""

    links: dict[int, tuple[int, int]]
    reads: int = 0

    def poles(self, link: int) -> tuple[int, int]:
        self.reads += 1
        return self.links[link]

    def find_link(self, start: int, end: int) -> int | None:
        self.reads += 1
        for link, poles in self.links.items():
            if poles == (start, end):
                return link
        return None

    def find_start_projection(self, form: int) -> int | None:
        self.reads += 1
        for link, poles in self.links.items():
            if poles == (link, form):
                return link
        return None

    def find_end_projection(self, form: int) -> int | None:
        self.reads += 1
        for link, poles in self.links.items():
            if poles == (form, link):
                return link
        return None


@dataclass(frozen=True)
class CandidateCurrentLink:
    """Test-local storage-neutral semantic link value for candidate B."""

    start: int
    end: int


def challenge_contract() -> dict:
    return json.loads(CHALLENGE.read_text(encoding="utf-8"))


def current_root_formulas() -> list[str]:
    return [
        line.strip()
        for line in ROOT_FIXTURE.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    ]


def projection_counterexample_memory() -> FiniteProjectionMemory:
    # X=10 has direct structural poles A=1 and B=2.
    # 110 and 210 are distinct projection-form links for X under the existing
    # MemoryView protocol: (110, X) and (X, 210).
    return FiniteProjectionMemory(
        {
            1: (1, 1),
            2: (2, 2),
            10: (1, 2),
            110: (110, 10),
            210: (10, 210),
        }
    )


def test_challenge_is_non_normative_and_not_published_through_v05():
    contract = challenge_contract()
    assert contract["schema"] == "mts-current-link-foundation-challenge/v0.6"
    assert contract["status"] == "candidate-challenge"
    assert contract["accepted"] is False
    assert contract["releaseVeto"]["acceptedContractLinkAllowed"] is False
    assert contract["releaseVeto"]["productionSemanticPromotionAllowed"] is False

    accepted = json.loads(MTS_CONTRACT_V05.read_text(encoding="utf-8"))
    assert contract["schema"] not in accepted.get("dependsOn", [])
    assert contract["schema"] not in MTS_CONTRACT_V05.read_text(encoding="utf-8")


def test_current_parser_exposes_two_pole_pronouns_but_not_standalone_current_link():
    start = parse_formula("◁")
    end = parse_formula("▷")
    parent_start = parse_formula("↑◁")

    assert isinstance(start, ContextPronoun)
    assert start.up == 0 and start.pole is ContextPole.START
    assert isinstance(end, ContextPronoun)
    assert end.up == 0 and end.pole is ContextPole.END
    assert isinstance(parent_start, ContextPronoun)
    assert parent_start.up == 1 and parent_start.pole is ContextPole.START

    with pytest.raises(MTCParseError, match="После `↑` ожидается"):
        parse_formula("↑")


def test_old_pronouns_equal_direct_focus_poles_when_frame_is_projection_of_focus():
    memory = projection_counterexample_memory()
    focus = 10
    direct_start, direct_end = memory.poles(focus)
    frame = ContextFrame(start=direct_start, end=direct_end)

    old_start = resolve_context_pronoun(parse_formula("◁"), frame)
    old_end = resolve_context_pronoun(parse_formula("▷"), frame)

    assert old_start == direct_start == 1
    assert old_end == direct_end == 2


def test_current_projection_form_runtime_is_not_direct_pole_access():
    memory = projection_counterexample_memory()
    focus = 10
    direct_start, direct_end = memory.poles(focus)

    projection_start = memory.find_start_projection(focus)
    projection_end = memory.find_end_projection(focus)

    assert (direct_start, direct_end) == (1, 2)
    assert (projection_start, projection_end) == (110, 210)
    assert projection_start != direct_start
    assert projection_end != direct_end


def test_naive_current_link_equation_is_not_valid_under_existing_projection_runtime():
    memory = projection_counterexample_memory()
    focus = 10
    direct_start, direct_end = memory.poles(focus)
    frame = ContextFrame(start=direct_start, end=direct_end)

    old_start = resolve_context_pronoun(parse_formula("◁"), frame)
    old_end = resolve_context_pronoun(parse_formula("▷"), frame)

    # If candidate ↑ simply denoted focus=10 while current ♀/♂ implementation
    # stayed unchanged, ♀↑/↑♂ would resolve through projection-form links.
    naive_female_up = memory.find_start_projection(focus)
    naive_up_male = memory.find_end_projection(focus)

    assert old_start == 1
    assert old_end == 2
    assert naive_female_up == 110
    assert naive_up_male == 210
    assert old_start != naive_female_up
    assert old_end != naive_up_male


def test_one_current_link_anchor_is_sufficient_for_direct_pole_access_candidate():
    current = CandidateCurrentLink(start=1, end=2)

    # Candidate B deliberately models pole access structurally, without L4
    # materialization and without introducing separate start/end pronouns.
    candidate_female_up = current.start
    candidate_up_male = current.end

    frame = ContextFrame(start=current.start, end=current.end)
    old_start = resolve_context_pronoun(parse_formula("◁"), frame)
    old_end = resolve_context_pronoun(parse_formula("▷"), frame)

    assert candidate_female_up == old_start == 1
    assert candidate_up_male == old_end == 2


def test_historical_roots_are_preserved_but_no_longer_a_foundation_veto():
    contract = challenge_contract()
    formulas = current_root_formulas()

    assert len(formulas) == contract["rootBoundary"]["historicalRootDefinitionCount"] == 10
    assert "∞ : {◁ = ∞, ▷ = ∞}" in formulas
    assert contract["rootBoundary"]["historicalFixtureImmutable"] is True
    assert contract["rootBoundary"]["historicalFixtureIsFundamentalVeto"] is False
    assert contract["rootBoundary"]["candidateAroot"] == "∞ : {♀↑ = ∞, ↑♂ = ∞}"
    assert contract["rootBoundary"]["candidateArootAccepted"] is False


def test_all_candidate_models_remain_unaccepted_until_full_act_gate():
    contract = challenge_contract()
    models = {item["id"]: item for item in contract["candidateModels"]}

    assert set(models) == {
        "A-context-frame-three-glyph",
        "B-current-link-plus-direct-poles",
        "C-current-link-plus-current-projection-form-runtime",
        "D-full-act-link-network",
    }
    assert all(item["accepted"] is False for item in models.values())
    assert models["B-current-link-plus-direct-poles"]["challengeStatus"] == (
        "preferred-research-candidate"
    )
    assert models["D-full-act-link-network"]["challengeStatus"] == "next-gate"
    assert contract["fullActGate"]["nAryActIsOntology"] is False
