"""Executable evidence for the non-normative deictic interpreter-focus challenge v0.5."""

import inspect
import json
from pathlib import Path

import pytest

from core.mtc_interpreter import ContextFrame, MemoryView, interpret_constraints
from core.mtc_parser import parse_formula


ROOT = Path(__file__).parents[1]
CHALLENGE = ROOT / "contracts" / "mts-deictic-context-challenge-v0.5.json"
MTS_V04 = ROOT / "contracts" / "mts-contract-v0.4.json"
PROOF_V03 = ROOT / "contracts" / "mts-proof-v0.3.json"
ROOT_PROGRAM = ROOT / "tests" / "mtc_formulas.mtc"


def read(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


class NoReadMemory(MemoryView):
    """Fails if a challenged formula accidentally touches L4."""

    def poles(self, link: int) -> tuple[int, int]:
        raise AssertionError(f"unexpected poles({link})")

    def find_link(self, start: int, end: int) -> int | None:
        raise AssertionError(f"unexpected find_link({start}, {end})")

    def find_start_projection(self, form: int) -> int | None:
        raise AssertionError(f"unexpected find_start_projection({form})")

    def find_end_projection(self, form: int) -> int | None:
        raise AssertionError(f"unexpected find_end_projection({form})")


class FiniteMemory(MemoryView):
    def __init__(self, links: dict[int, tuple[int, int]]):
        self.links = dict(links)
        self.by_poles = {poles: link for link, poles in links.items()}

    def poles(self, link: int) -> tuple[int, int]:
        return self.links[link]

    def find_link(self, start: int, end: int) -> int | None:
        return self.by_poles.get((start, end))

    def find_start_projection(self, form: int) -> int | None:
        for link, poles in self.links.items():
            if poles == (link, form):
                return link
        return None

    def find_end_projection(self, form: int) -> int | None:
        for link, poles in self.links.items():
            if poles == (form, link):
                return link
        return None


def replay(source: str, context: ContextFrame, *, symbols: dict[str, int] | None = None):
    return interpret_constraints(
        parse_formula(source),
        context,
        NoReadMemory(),
        symbols=symbols,
    )


def result_shape(result) -> tuple[bool, tuple, tuple]:
    return result.success, result.holes, result.aliases


def test_challenge_is_non_normative_and_does_not_change_published_context_or_proof_contracts():
    challenge = read(CHALLENGE)
    v04 = read(MTS_V04)
    proof = read(PROOF_V03)

    assert challenge["schema"] == "mts-deictic-context-challenge/v0.5"
    assert challenge["status"] == "candidate-challenge"
    assert challenge["acceptedContractLinkAllowed"] is False
    assert challenge["productionSemanticChangeAllowed"] is False
    assert challenge["schema"] not in MTS_V04.read_text(encoding="utf-8")
    assert v04["contextBoundary"]["acceptedContextInput"] == "explicit ContextFrame(start,end,parent?)"
    assert v04["contextBoundary"]["subjectIdentity"] is False
    assert v04["contextBoundary"]["currentFocusLinkRefIdentity"] is False
    assert proof["contextVersionBoundary"]["explicitContextFrameOnly"] is True
    assert proof["contextVersionBoundary"]["subjectOrFocusAddedToV03Artifact"] is False


def test_formula_without_context_pronouns_can_be_context_invariant_for_distinct_frames():
    left = replay("[] = []", ContextFrame(start=1, end=2))
    right = replay("[] = []", ContextFrame(start=900, end=901))

    assert result_shape(left) == result_shape(right)
    assert left.success is True
    assert len(left.aliases) == 1

    boundary = read(CHALLENGE)["contextDependence"]
    assert boundary["syntacticNoPronounImpliesGlobalInvariance"] is False


def test_pronoun_bearing_formula_can_depend_on_explicit_context():
    source = "◁ = a"
    symbols = {"a": 1}

    matching = replay(source, ContextFrame(start=1, end=77), symbols=symbols)
    different = replay(source, ContextFrame(start=2, end=77), symbols=symbols)

    assert matching.success is True
    assert different.success is False


def test_same_explicit_frame_replays_identically_under_different_interpreter_labels():
    frame = ContextFrame(start=3, end=4)

    def run_under_interpreter(_interpreter_id: str):
        # Interpreter identity is deliberately not forwarded: current production
        # semantics has only the explicit ContextFrame at this boundary.
        return replay("{◁ = a, ▷ = b}", frame, symbols={"a": 3, "b": 4})

    first = run_under_interpreter("interpreter-A")
    second = run_under_interpreter("interpreter-B")

    assert result_shape(first) == result_shape(second)
    assert first.success is True


def test_virtual_frame_and_frame_constructed_from_materialized_link_poles_are_equivalent():
    memory = FiniteMemory({10: (3, 4)})
    materialized_start, materialized_end = memory.poles(10)

    virtual = ContextFrame(start=3, end=4)
    from_materialized_poles = ContextFrame(
        start=materialized_start,
        end=materialized_end,
    )

    first = replay("{◁ = a, ▷ = b}", virtual, symbols={"a": 3, "b": 4})
    second = replay(
        "{◁ = a, ▷ = b}",
        from_materialized_poles,
        symbols={"a": 3, "b": 4},
    )

    assert result_shape(first) == result_shape(second)
    assert first.success is True

    identity = read(CHALLENGE)["focusIdentityQuestion"]
    assert identity["pairOfRolesEqualsRelationIdentity"] is False
    assert identity["virtualContextAllowedByBaseline"] is True
    assert identity["materializedLinkRefRequired"] is False


def test_parent_ascent_uses_only_the_explicit_parent_chain():
    context = ContextFrame(
        start=5,
        end=6,
        parent=ContextFrame(
            start=2,
            end=3,
            parent=ContextFrame(start=1, end=4),
        ),
    )

    parent_start = replay("↑◁ = a", context, symbols={"a": 2})
    grandparent_end = replay("↑↑▷ = b", context, symbols={"b": 4})

    assert parent_start.success is True
    assert grandparent_end.success is True
    assert read(CHALLENGE)["parentFocusQuestion"]["ambientGlobalFallbackAllowed"] is False


def test_missing_parent_fails_explicitly_instead_of_falling_back_to_hidden_global_context():
    with pytest.raises(ValueError, match="выше корневого контекста"):
        replay("↑◁ = a", ContextFrame(start=1, end=2), symbols={"a": 1})

    baseline = read(CHALLENGE)["currentAcceptedBaseline"]
    assert baseline["missingParentCurrentBehavior"].startswith("ValueError")


def test_current_production_interpreter_has_only_explicit_frame_not_hidden_interpreter_identity():
    parameters = inspect.signature(interpret_constraints).parameters

    assert list(parameters) == ["expression", "frame", "memory", "symbols"]
    assert "interpreter" not in parameters
    assert "host" not in parameters
    assert "session" not in parameters
    assert "focus" not in parameters
    assert "current_link" not in parameters

    baseline = read(CHALLENGE)["currentAcceptedBaseline"]
    assert baseline["separateSubjectConceptIntroduced"] is False
    assert baseline["interpreterIdentityObservable"] is False
    assert baseline["currentRelationIdentityObservable"] is False


def test_root_program_remains_exactly_ten_definitions_and_challenge_adds_no_new_pronoun():
    lines = [
        line.strip()
        for line in ROOT_PROGRAM.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    ]
    challenge = read(CHALLENGE)

    assert len(lines) == 10
    assert challenge["focusIdentityQuestion"]["candidateCurrentLinkRefPronounAccepted"] is False
    assert "adding a current-link pronoun before challenge" in challenge["vetoes"]


def test_next_gate_is_a_decision_about_interpreter_focus_identity_and_parent_lifecycle():
    gate = read(CHALLENGE)["nextGate"]

    assert gate["artifact"] == "mts-deictic-context-decision/v0.5"
    assert gate["mustNotChangeProductionBeforeDecision"] is True
    assert (
        "whether Focus(interpreterLink,currentFocus) belongs to MTS or only interpreter/runtime integration"
        in gate["mustDecide"]
    )
    assert "whether current focus has observable identity beyond its roles" in gate["mustDecide"]
    assert "the lifecycle/meaning of parent focus" in gate["mustDecide"]
