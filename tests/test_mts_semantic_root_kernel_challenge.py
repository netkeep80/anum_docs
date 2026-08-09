"""Non-normative semantic-root kernel challenge for issue #200.

This slice tests only the finite R/O/C/L/U topology and its structural
recognizability relative to a distinguished root.  It deliberately does not
claim a general algorithm for deriving the meaning of an arbitrary link.
"""

from __future__ import annotations

from dataclasses import dataclass, fields
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CHALLENGE = ROOT / "contracts/mts-semantic-root-kernel-challenge-v0.7.json"
MTS_V05 = ROOT / "contracts/mts-contract-v0.5.json"


@dataclass(frozen=True)
class Link:
    start: int
    end: int


@dataclass(frozen=True)
class KernelGraph:
    links: dict[int, Link]

    def validate_closed_unique_pairs(self) -> None:
        refs = set(self.links)
        pairs: set[tuple[int, int]] = set()
        for ref, link in self.links.items():
            assert link.start in refs, (ref, "start", link.start)
            assert link.end in refs, (ref, "end", link.end)
            pair = (link.start, link.end)
            assert pair not in pairs, (ref, "duplicate pair", pair)
            pairs.add(pair)


def read(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def semantic_kernel(refs: dict[str, int]) -> KernelGraph:
    required = {"R", "O", "C", "L", "U"}
    assert set(refs) == required
    assert len(set(refs.values())) == 5

    root_ref = refs["R"]
    open_ref = refs["O"]
    close_ref = refs["C"]
    link_ref = refs["L"]
    unlink_ref = refs["U"]
    graph = KernelGraph(
        {
            root_ref: Link(root_ref, root_ref),
            open_ref: Link(open_ref, root_ref),
            close_ref: Link(root_ref, close_ref),
            link_ref: Link(open_ref, close_ref),
            unlink_ref: Link(close_ref, open_ref),
        }
    )
    graph.validate_closed_unique_pairs()
    return graph


def recognize_kernel(graph: KernelGraph, root: int) -> dict[str, int]:
    """Recognize R/O/C/L/U only from ordered topology relative to root."""

    assert graph.links[root] == Link(root, root)

    open_candidates = [
        ref
        for ref, link in graph.links.items()
        if ref != root and link == Link(ref, root)
    ]
    close_candidates = [
        ref
        for ref, link in graph.links.items()
        if ref != root and link == Link(root, ref)
    ]
    assert len(open_candidates) == 1
    assert len(close_candidates) == 1
    open_ref = open_candidates[0]
    close_ref = close_candidates[0]

    link_candidates = [
        ref
        for ref, link in graph.links.items()
        if link == Link(open_ref, close_ref)
    ]
    unlink_candidates = [
        ref
        for ref, link in graph.links.items()
        if link == Link(close_ref, open_ref)
    ]
    assert len(link_candidates) == 1
    assert len(unlink_candidates) == 1

    return {
        "R": root,
        "O": open_ref,
        "C": close_ref,
        "L": link_candidates[0],
        "U": unlink_candidates[0],
    }


def test_challenge_is_non_normative_and_does_not_modify_historical_release():
    challenge = read(CHALLENGE)

    assert challenge["schema"] == "mts-semantic-root-kernel-challenge/v0.7"
    assert challenge["status"] == "candidate-challenge"
    assert challenge["accepted"] is False
    assert challenge["issue"] == 200
    assert challenge["centralReading"]["externalMeaningPrimitiveAllowed"] is False
    assert challenge["centralReading"]["semanticTagAllowed"] is False
    assert challenge["recognitionBoundary"]["generalMeaningDerivationSolvedByThisChallenge"] is False
    assert challenge["schema"] not in MTS_V05.read_text(encoding="utf-8")
    assert challenge["veto"]["productionInterpreterChangeAllowed"] is False
    assert challenge["veto"]["aproverRepinAllowed"] is False


def test_five_link_kernel_is_finite_closed_and_exact_pair_unique():
    refs = {"R": 0, "O": 1, "C": 2, "L": 3, "U": 4}
    graph = semantic_kernel(refs)

    assert len(graph.links) == 5
    graph.validate_closed_unique_pairs()
    assert graph.links[refs["R"]] == Link(refs["R"], refs["R"])
    assert graph.links[refs["O"]] == Link(refs["O"], refs["R"])
    assert graph.links[refs["C"]] == Link(refs["R"], refs["C"])
    assert graph.links[refs["L"]] == Link(refs["O"], refs["C"])
    assert graph.links[refs["U"]] == Link(refs["C"], refs["O"])


def test_link_ontology_contains_no_embedded_meaning_metadata():
    assert [field.name for field in fields(Link)] == ["start", "end"]


def test_root_is_unique_fully_self_closed_link_in_kernel():
    refs = {"R": 17, "O": 4, "C": 91, "L": 8, "U": 33}
    graph = semantic_kernel(refs)

    fully_self_closed = [
        ref
        for ref, link in graph.links.items()
        if link.start == ref and link.end == ref
    ]
    assert fully_self_closed == [refs["R"]]


def test_open_close_and_link_unlink_are_distinguished_by_orientation():
    refs = {"R": 0, "O": 1, "C": 2, "L": 3, "U": 4}
    graph = semantic_kernel(refs)

    assert graph.links[refs["O"]] != graph.links[refs["C"]]
    assert graph.links[refs["L"]] != graph.links[refs["U"]]
    assert graph.links[refs["L"]] == Link(refs["O"], refs["C"])
    assert graph.links[refs["U"]] == Link(refs["C"], refs["O"])


def test_kernel_roles_are_recognized_from_topology_not_numeric_refs():
    first = {"R": 0, "O": 1, "C": 2, "L": 3, "U": 4}
    second = {"R": 73, "O": 9, "C": 41, "L": 2, "U": 88}

    assert recognize_kernel(semantic_kernel(first), first["R"]) == first
    assert recognize_kernel(semantic_kernel(second), second["R"]) == second


def test_kernel_recognition_does_not_read_candidate_glyph_spellings():
    challenge = read(CHALLENGE)
    refs = {"R": 51, "O": 10, "C": 20, "L": 30, "U": 40}
    graph = semantic_kernel(refs)

    glyphs = challenge["kernel"]["candidateGlyphs"]
    assert set(glyphs.values()) == {"∞", "[", "]", "1", "0"}
    assert recognize_kernel(graph, refs["R"]) == refs


def test_unrelated_link_is_not_silently_promoted_to_a_kernel_meaning():
    refs = {"R": 0, "O": 1, "C": 2, "L": 3, "U": 4}
    graph = semantic_kernel(refs)
    unrelated = 5
    extended = KernelGraph(
        {
            **graph.links,
            unrelated: Link(refs["L"], refs["R"]),
        }
    )
    extended.validate_closed_unique_pairs()

    recognized = recognize_kernel(extended, refs["R"])
    assert unrelated not in recognized.values()
    assert read(CHALLENGE)["recognitionBoundary"][
        "arbitraryLinkMustNotReceiveInventedMeaning"
    ] is True


def test_challenge_keeps_ostensive_self_closure_resolution_as_later_hypothesis():
    challenge = read(CHALLENGE)
    hypothesis = challenge["relationalResolutionHypothesis"]

    assert hypothesis["accepted"] is False
    assert hypothesis["ostensiveStartForm"] == "S = S ⟼ x"
    assert hypothesis["ostensiveEndForm"] == "E = x ⟼ E"
    assert "resolution direction" in hypothesis["claimToChallengeLater"]
