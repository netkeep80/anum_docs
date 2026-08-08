"""Executable non-normative challenge for relative Anum context v0.3.

The accepted v0.2 implementation must remain unchanged: relative denotation is
RAW, root recursive denotation stays structural where already accepted, quote is
still description-level raw, and no L4 backend participates.
"""

from dataclasses import dataclass
import inspect
import json
from pathlib import Path

from core.anum_denotation import AnumDenotation, DenotationKind, DenotationRef
from core.anum_model import ProjectionContext
from core.anum_parser import normalize_raw_form, parse_raw_quaternary
from core.anum_protocol import project_anum
from core.anum_recursive_denotation import (
    canonical_recursive_anum,
    denotate_recursive_anum,
)


ROOT = Path(__file__).parents[1]
CHALLENGE = ROOT / "contracts" / "anum-relative-context-challenge-v0.3.json"
RECURSIVE_CONTRACT = ROOT / "contracts" / "anum-recursive-denotation-v0.2.json"
MTS_CONTRACT = ROOT / "contracts" / "mts-contract-v0.2.json"


@dataclass(frozen=True)
class RelativeAnchor:
    anchor_key: str


@dataclass(frozen=True)
class RelativePairContext:
    start_anchor: str
    end_anchor: str


@dataclass(frozen=True)
class RelativeFrame:
    start_anchor: str
    end_anchor: str
    parent: "RelativeFrame | None" = None


@dataclass(frozen=True)
class RelativeStructuralContext:
    value: AnumDenotation
    focus: DenotationRef


def challenge() -> dict:
    return json.loads(CHALLENGE.read_text(encoding="utf-8"))


def test_challenge_is_non_normative_and_preserves_accepted_v02_boundary():
    data = challenge()
    recursive = json.loads(RECURSIVE_CONTRACT.read_text(encoding="utf-8"))
    recursive_text = RECURSIVE_CONTRACT.read_text(encoding="utf-8")
    mts_text = MTS_CONTRACT.read_text(encoding="utf-8")

    assert data["schema"] == "anum-relative-context-challenge/v0.3"
    assert data["status"] == "candidate-challenge"
    assert data["dependsOn"] == [recursive["schema"]]
    assert data["acceptedContractLinkAllowed"] is False
    assert data["productionRelativeSemanticsChangeAllowed"] is False
    assert recursive["contextIsolation"]["relative"].startswith("raw only")
    assert recursive["unsupported"]["relativeDenotation"] is True
    assert "anum-relative-context-challenge" not in recursive_text
    assert "anum-relative-context-challenge" not in mts_text


def test_current_relative_projection_and_denotation_remain_raw_for_entire_challenge_corpus():
    for raw in challenge()["challengeCorpus"]["rawVectors"]:
        form = parse_raw_quaternary(raw)
        projection = project_anum(form, ProjectionContext.RELATIVE)
        denotation = denotate_recursive_anum(form, ProjectionContext.RELATIVE)

        assert projection.context is ProjectionContext.RELATIVE
        assert projection.projected == form
        assert denotation.kind is DenotationKind.RAW
        assert denotation.raw == normalize_raw_form(form) == raw


def test_root_and_quote_are_observably_distinct_from_relative_on_same_carriers():
    quote_payloads = {
        "0": "0",
        "1": "1",
        "01": "01",
        "10": "10",
        "[]": "",
        "][": "][",
    }
    for raw, expected_quote_raw in quote_payloads.items():
        form = parse_raw_quaternary(raw)
        root = denotate_recursive_anum(form, ProjectionContext.ROOT)
        quote = denotate_recursive_anum(form, ProjectionContext.QUOTE)
        relative = denotate_recursive_anum(form, ProjectionContext.RELATIVE)

        assert root.kind is DenotationKind.STRUCTURAL
        assert quote.kind is DenotationKind.QUOTED_RAW
        assert relative.kind is DenotationKind.RAW
        assert quote.raw == expected_quote_raw
        assert relative.raw == raw

    quote_only_payloads = {
        "[[": "[[",
        "]]": "]]",
        "[01]": "01",
    }
    for raw, expected_quote_raw in quote_only_payloads.items():
        form = parse_raw_quaternary(raw)
        quote = denotate_recursive_anum(form, ProjectionContext.QUOTE)
        relative = denotate_recursive_anum(form, ProjectionContext.RELATIVE)

        assert quote.kind is DenotationKind.QUOTED_RAW
        assert relative.kind is DenotationKind.RAW
        assert quote.raw == expected_quote_raw
        assert relative.raw == raw


def test_accepted_root_canonical_inverse_is_unchanged_for_recursive_subset():
    for raw in ("0", "1", "01", "10", "[01]1", "0[10]"):
        value = denotate_recursive_anum(parse_raw_quaternary(raw), ProjectionContext.ROOT)
        assert value.kind is DenotationKind.STRUCTURAL
        assert canonical_recursive_anum(value) == raw


def test_context_candidates_are_typed_but_none_is_accepted_by_the_challenge():
    candidates = {item["id"]: item for item in challenge()["contextCandidates"]}

    assert set(candidates) == {"A", "B", "C", "D", "E"}
    assert candidates["A"]["shape"] == "RelativeAnchor(anchorKey)"
    assert candidates["B"]["shape"] == "RelativePairContext(startAnchor, endAnchor)"
    assert candidates["C"]["shape"] == "RelativeFrame(startAnchor, endAnchor, parent?)"
    assert candidates["D"]["shape"] == "RelativeStructuralContext(AnumDenotation)"
    assert candidates["E"]["disposition"] == "reject"
    assert all(item["accepted"] is False for item in candidates.values())

    # Challenge fixtures demonstrate that the candidate inputs are genuinely
    # different typed carriers, not aliases for one stringly context parameter.
    anchor = RelativeAnchor("ctx:a")
    pair = RelativePairContext("ctx:start", "ctx:end")
    parent = RelativeFrame("parent:start", "parent:end")
    frame = RelativeFrame("child:start", "child:end", parent=parent)

    assert anchor != pair
    assert pair.start_anchor != pair.end_anchor
    assert frame.parent == parent


def test_external_structural_context_can_stay_storage_neutral_and_requires_explicit_focus():
    root_value = denotate_recursive_anum(parse_raw_quaternary("01"), ProjectionContext.ROOT)
    assert root_value.kind is DenotationKind.STRUCTURAL
    assert root_value.structural is not None

    context = RelativeStructuralContext(root_value, root_value.structural.root)
    assert context.value == root_value
    assert context.focus == root_value.structural.root
    assert context.focus.node == 0

    identity = challenge()["identityBoundary"]
    assert identity["contextAnchorKeysArePersistentLinkIds"] is False
    assert identity["structuralNodeIdsAreDescriptionLocal"] is True
    assert identity["equalSubtreesNeedNotIntern"] is True


def test_parented_candidate_does_not_reuse_l2_contextframe_or_make_parent_semantics_implicit():
    candidate = next(item for item in challenge()["contextCandidates"] if item["id"] == "C")
    frame = RelativeFrame(
        "child:start",
        "child:end",
        parent=RelativeFrame("root:start", "root:end"),
    )

    assert frame.parent is not None
    assert frame.parent.start_anchor == "root:start"
    assert "L2 ContextFrame" in candidate["strength"]
    assert "openQuestion" in candidate
    assert candidate["accepted"] is False


def test_special_double_boundaries_remain_unresolved_without_an_explicit_relative_rule():
    required = set(challenge()["challengeCorpus"]["requiredContrasts"])
    assert "[[ and ]] remain unresolved unless an explicit rule is justified" in required

    for raw in ("[[", "]]"):
        value = denotate_recursive_anum(parse_raw_quaternary(raw), ProjectionContext.RELATIVE)
        assert value.kind is DenotationKind.RAW
        assert value.raw == raw


def test_l3_projection_and_denotation_surfaces_have_no_memory_backend_parameter():
    project_parameters = set(inspect.signature(project_anum).parameters)
    denotate_parameters = set(inspect.signature(denotate_recursive_anum).parameters)

    assert project_parameters == {"form", "context"}
    assert denotate_parameters == {"form", "context"}

    boundary = challenge()["currentBoundary"]
    assert boundary["mayReadMemory"] is False
    assert boundary["mayMutateMemory"] is False
    assert boundary["mayRealize"] is False


def test_release_gate_requires_a_decision_and_conformance_before_production_changes():
    gate = challenge()["releaseGate"]

    assert "choose one typed relative context model from executable evidence rather than implementation convenience" in gate
    assert "publish language-neutral positive and negative conformance" in gate
    assert "prove root and quote behavior unchanged" in gate
    assert "accept a versioned relative-denotation contract before production code changes" in gate
