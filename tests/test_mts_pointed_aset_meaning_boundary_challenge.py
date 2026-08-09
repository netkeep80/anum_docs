"""Non-normative arbitrary-aset meaning-boundary challenge for #206/#200.

The challenge does not add a Meaning object. It tests whether an arbitrary
shared/cyclic aset can remain its own finite exact link-network referent while
recursive Anum stays a partial root-relative structural view.
"""
from __future__ import annotations

from dataclasses import dataclass, fields
import json
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[1]
CHALLENGE = ROOT_DIR / "contracts/mts-pointed-aset-meaning-boundary-challenge-v0.7.json"
ANUM_BOUNDARY = ROOT_DIR / "contracts/anum-root-relative-meaning-challenge-v0.7.json"

ROOT_REF = 0
OPEN_REF = 1
CLOSE_REF = 2
LINK_REF = 3
UNLINK_REF = 4
KERNEL = frozenset({ROOT_REF, OPEN_REF, CLOSE_REF, LINK_REF, UNLINK_REF})


@dataclass(frozen=True)
class Link:
    start: int
    end: int


class ExactNetwork:
    """Storage-neutral occurrence graph; refs are challenge-local identities."""

    def __init__(self) -> None:
        self.links: dict[int, Link] = {
            ROOT_REF: Link(ROOT_REF, ROOT_REF),
            OPEN_REF: Link(OPEN_REF, ROOT_REF),
            CLOSE_REF: Link(ROOT_REF, CLOSE_REF),
            LINK_REF: Link(OPEN_REF, CLOSE_REF),
            UNLINK_REF: Link(CLOSE_REF, OPEN_REF),
        }
        self._next = 5

    def reserve(self) -> int:
        ref = self._next
        self._next += 1
        return ref

    def define(self, ref: int, start: int, end: int) -> int:
        if ref in self.links:
            raise ValueError(f"already defined: {ref}")
        self.links[ref] = Link(start, end)
        return ref

    def add(self, start: int, end: int) -> int:
        return self.define(self.reserve(), start, end)

    def self_cycle(self) -> int:
        ref = self.reserve()
        return self.define(ref, ref, ref)

    def start_self_closed(self, end: int) -> int:
        ref = self.reserve()
        return self.define(ref, ref, end)

    def end_self_closed(self, start: int) -> int:
        ref = self.reserve()
        return self.define(ref, start, ref)

    def validate(self) -> None:
        refs = set(self.links)
        for link in self.links.values():
            assert link.start in refs
            assert link.end in refs


def read(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def exact_closure(graph: ExactNetwork, focus: int) -> frozenset[int]:
    """Finite start/end closure using exact occurrence revisit, not shape."""
    pending = [focus]
    visited: set[int] = set()
    while pending:
        ref = pending.pop()
        if ref in visited:
            continue
        visited.add(ref)
        link = graph.links[ref]
        if link.start not in visited:
            pending.append(link.start)
        if link.end not in visited:
            pending.append(link.end)
    return frozenset(visited)


def root_anchored(graph: ExactNetwork, focus: int) -> bool:
    return bool(exact_closure(graph, focus) & KERNEL)


def make_context(graph: ExactNetwork, parent_ref: int, current_ref: int) -> int:
    payload = graph.add(parent_ref, current_ref)
    return graph.start_self_closed(payload)


def current_from_context(graph: ExactNetwork, context_ref: int) -> int:
    context = graph.links[context_ref]
    if context.start != context_ref:
        raise ValueError("K must be start-self-closed")
    payload = graph.links[context.end]
    return payload.end


def assert_isomorphic_under(
    first: ExactNetwork,
    first_focus: int,
    second: ExactNetwork,
    second_focus: int,
    mapping: dict[int, int],
) -> None:
    """Research helper: prove one supplied shape mapping, never identity."""
    assert mapping[first_focus] == second_focus
    for left_ref, right_ref in mapping.items():
        left = first.links[left_ref]
        right = second.links[right_ref]
        assert mapping[left.start] == right.start
        assert mapping[left.end] == right.end


def add_dictionary_mapping(
    graph: ExactNetwork,
    dictionary_ref: int,
    referent_ref: int,
    form_ref: int,
) -> tuple[int, int]:
    entry = graph.add(referent_ref, form_ref)
    membership = graph.add(dictionary_ref, entry)
    return entry, membership


def lookup_dictionary(
    graph: ExactNetwork,
    dictionary_ref: int,
    referent_ref: int,
) -> int:
    matches: set[int] = set()
    for membership_ref, membership in graph.links.items():
        if membership_ref == dictionary_ref or membership.start != dictionary_ref:
            continue
        entry = graph.links.get(membership.end)
        if entry is not None and entry.start == referent_ref:
            matches.add(entry.end)
    if len(matches) != 1:
        raise ValueError("missing or conflicting dictionary mapping")
    return next(iter(matches))


def test_contract_rejects_total_anum_meaning_and_graph_canonical_identity():
    data = read(CHALLENGE)
    assert data["schema"] == "mts-pointed-aset-meaning-boundary-challenge/v0.7"
    assert data["accepted"] is False
    assert data["issue"] == 206
    assert data["parentIssue"] == 200
    assert data["candidateComparison"]["recursiveAnumAsUniversalMeaning"]["survives"] is False
    assert data["candidateComparison"]["rootedGraphCanonicalizationAsSemanticIdentity"]["survives"] is False
    assert data["candidateComparison"]["pointedExactNetworkPlusPartialAnumView"]["survives"] is True
    assert data["semanticBoundary"]["meaningAsStoredPayload"] is False
    assert data["veto"]["newAnumGrammarForThisGateAllowed"] is False
    assert data["veto"]["productionChangeAllowed"] is False


def test_merged_anum_boundary_is_imported_instead_of_reopened():
    prior = read(ANUM_BOUNDARY)
    assert prior["criticalBoundary"]["canonicalAnumPreservesOccurrenceTree"] is True
    assert prior["criticalBoundary"]["canonicalAnumPreservesExplicitSharingIdentity"] is False
    assert prior["criticalBoundary"]["canonicalAnumRepresentsGeneralCyclesDirectly"] is False
    assert prior["criticalBoundary"]["generalArbitraryLinkMeaningSolved"] is False


def test_link_has_only_two_poles_and_no_meaning_or_canonical_id_metadata():
    assert [field.name for field in fields(Link)] == ["start", "end"]


def test_context_selects_exact_referent_without_pointed_graph_ontology():
    graph = ExactNetwork()
    x = graph.add(LINK_REF, UNLINK_REF)
    other = graph.add(UNLINK_REF, LINK_REF)
    kx = make_context(graph, ROOT_REF, x)
    ko = make_context(graph, ROOT_REF, other)

    assert current_from_context(graph, kx) == x
    assert current_from_context(graph, ko) == other
    assert x != other
    assert read(CHALLENGE)["candidateComparison"]["pointedExactNetworkPlusPartialAnumView"][
        "newPointedGraphOntologyRequired"
    ] is False
    graph.validate()


def test_root_like_self_cycle_is_not_root_and_not_root_anchored_by_shape():
    graph = ExactNetwork()
    root_like = graph.self_cycle()

    assert graph.links[root_like] == Link(root_like, root_like)
    assert graph.links[ROOT_REF] == Link(ROOT_REF, ROOT_REF)
    assert root_like != ROOT_REF
    assert exact_closure(graph, root_like) == frozenset({root_like})
    assert not root_anchored(graph, root_like)


def test_start_self_closed_cycle_is_finite_and_root_anchored_without_unfolding():
    graph = ExactNetwork()
    s = graph.start_self_closed(LINK_REF)

    closure = exact_closure(graph, s)
    assert s in closure
    assert LINK_REF in closure
    assert ROOT_REF in closure
    assert root_anchored(graph, s)
    assert len(closure) <= len(graph.links)
    graph.validate()


def test_mutual_cycle_with_root_derived_outgoing_poles_has_finite_exact_closure():
    graph = ExactNetwork()
    a = graph.reserve()
    b = graph.reserve()
    graph.define(a, b, LINK_REF)
    graph.define(b, a, UNLINK_REF)

    closure = exact_closure(graph, a)
    assert {a, b, LINK_REF, UNLINK_REF, OPEN_REF, CLOSE_REF, ROOT_REF} <= closure
    assert root_anchored(graph, a)
    assert len(closure) == 7
    graph.validate()


def test_cycle_traversal_stops_on_exact_occurrence_not_equal_shape():
    graph = ExactNetwork()
    s1 = graph.start_self_closed(LINK_REF)
    s2 = graph.start_self_closed(LINK_REF)
    pair = graph.add(s1, s2)

    closure = exact_closure(graph, pair)
    assert s1 in closure and s2 in closure
    assert s1 != s2
    assert graph.links[s1].end == graph.links[s2].end == LINK_REF
    assert len({s1, s2} & closure) == 2


def test_isomorphic_pointed_cycles_do_not_become_the_same_referent():
    first = ExactNetwork()
    second = ExactNetwork()
    f = first.self_cycle()
    s = second.self_cycle()

    mapping = {
        ROOT_REF: ROOT_REF,
        OPEN_REF: OPEN_REF,
        CLOSE_REF: CLOSE_REF,
        LINK_REF: LINK_REF,
        UNLINK_REF: UNLINK_REF,
        f: s,
    }
    assert_isomorphic_under(first, f, second, s, mapping)

    k_first = make_context(first, ROOT_REF, f)
    k_second = make_context(second, ROOT_REF, s)
    assert current_from_context(first, k_first) == f
    assert current_from_context(second, k_second) == s
    assert read(CHALLENGE)["identityBoundaries"]["graphIsomorphismImpliesIdentity"] is False


def test_same_exact_referent_can_resolve_differently_in_explicit_dictionaries():
    graph = ExactNetwork()
    x = graph.add(LINK_REF, UNLINK_REF)
    d1 = graph.end_self_closed(ROOT_REF)
    d2 = graph.end_self_closed(OPEN_REF)
    form1 = graph.start_self_closed(CLOSE_REF)
    form2 = graph.start_self_closed(UNLINK_REF)
    add_dictionary_mapping(graph, d1, x, form1)
    add_dictionary_mapping(graph, d2, x, form2)

    before = graph.links[x]
    assert lookup_dictionary(graph, d1, x) == form1
    assert lookup_dictionary(graph, d2, x) == form2
    assert graph.links[x] == before
    assert form1 != form2


def test_root_anchoring_uses_exact_kernel_occurrences_not_kernel_like_shapes():
    graph = ExactNetwork()
    fake_root = graph.self_cycle()
    fake_open = graph.start_self_closed(fake_root)

    assert exact_closure(graph, fake_open) == frozenset({fake_open, fake_root})
    assert not root_anchored(graph, fake_open)

    real_open_like = graph.start_self_closed(ROOT_REF)
    assert root_anchored(graph, real_open_like)
    assert ROOT_REF in exact_closure(graph, real_open_like)


def test_decision_candidate_keeps_three_surfaces_distinct():
    data = read(CHALLENGE)
    boundary = data["semanticBoundary"]
    assert "exact link occurrence" in boundary["referent"]
    assert "partial structural description" in boundary["rootRelativeAnum"]
    assert "dictionary/theory/act" in boundary["higherContextualMeaning"]
    assert data["identityBoundaries"]["canonicalAnumImpliesExactReferentIdentity"] is False
    assert data["cycleBoundary"]["recursiveAnumRequiredForCycleIdentity"] is False
