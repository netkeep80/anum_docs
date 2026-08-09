"""Non-normative four binding-form challenge for issue #208.

The challenge keeps self-closure ostensive: it tests structural relation forms
and directional resolution acts without redefining the glyphs as projection
functions, stage enums, or unique constructors.
"""

from __future__ import annotations

from dataclasses import dataclass, fields
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CHALLENGE = ROOT / "contracts/mts-four-binding-forms-challenge-v0.7.json"

ROOT_REF = 0
OPEN_REF = 1
CLOSE_REF = 2
LINK_REF = 3
UNLINK_REF = 4


@dataclass(frozen=True)
class Link:
    start: int
    end: int


class RelationGraph:
    """Finite exact-pair graph used only as a falsifiable research model."""

    def __init__(self) -> None:
        self.links: dict[int, Link] = {
            ROOT_REF: Link(ROOT_REF, ROOT_REF),
            OPEN_REF: Link(OPEN_REF, ROOT_REF),
            CLOSE_REF: Link(ROOT_REF, CLOSE_REF),
            LINK_REF: Link(OPEN_REF, CLOSE_REF),
            UNLINK_REF: Link(CLOSE_REF, OPEN_REF),
        }
        self._pair_index = {link: ref for ref, link in self.links.items()}
        self._next_ref = 5

    def intern(self, start: int, end: int) -> int:
        pair = Link(start, end)
        existing = self._pair_index.get(pair)
        if existing is not None:
            return existing
        ref = self._next_ref
        self._next_ref += 1
        self.links[ref] = pair
        self._pair_index[pair] = ref
        return ref

    def self_closed_start(self, end: int) -> int:
        """Create one S=(S,end) occurrence; same end may have many S refs."""

        ref = self._next_ref
        self._next_ref += 1
        pair = Link(ref, end)
        assert pair not in self._pair_index
        self.links[ref] = pair
        self._pair_index[pair] = ref
        return ref

    def self_closed_end(self, start: int) -> int:
        """Create one E=(start,E) occurrence; same start may have many E refs."""

        ref = self._next_ref
        self._next_ref += 1
        pair = Link(start, ref)
        assert pair not in self._pair_index
        self.links[ref] = pair
        self._pair_index[pair] = ref
        return ref

    def validate(self) -> None:
        refs = set(self.links)
        assert len(self.links) == len(self._pair_index)
        for ref, link in self.links.items():
            assert link.start in refs
            assert link.end in refs
            assert self._pair_index[link] == ref


def read_contract() -> dict:
    return json.loads(CHALLENGE.read_text(encoding="utf-8"))


def structural_form(graph: RelationGraph, ref: int) -> str:
    link = graph.links[ref]
    if link.start == ref and link.end == ref:
        return "fully-open"
    if link.start == ref:
        return "start-open"
    if link.end == ref:
        return "end-open"
    return "complete"


def bind_start(graph: RelationGraph, start_open: int, start: int) -> int:
    link = graph.links[start_open]
    if link.start != start_open or link.end == start_open:
        raise ValueError("relation is not a start-open self-closure")
    return graph.intern(start, link.end)


def bind_end(graph: RelationGraph, end_open: int, end: int) -> int:
    link = graph.links[end_open]
    if link.end != end_open or link.start == end_open:
        raise ValueError("relation is not an end-open self-closure")
    return graph.intern(link.start, end)


def distinguished_pole(graph: RelationGraph, partial: int) -> int:
    link = graph.links[partial]
    form = structural_form(graph, partial)
    if form == "start-open":
        return link.end
    if form == "end-open":
        return link.start
    raise ValueError("partial relation must have exactly one self-closed pole")


def invert_form(graph: RelationGraph, ref: int) -> int:
    """Invert relation form, not occurrence identity, for this challenge."""

    link = graph.links[ref]
    form = structural_form(graph, ref)
    if form == "fully-open":
        return ref
    if form == "start-open":
        return graph.self_closed_end(link.end)
    if form == "end-open":
        return graph.self_closed_start(link.start)
    return graph.intern(link.end, link.start)


def find_start_open(graph: RelationGraph, end: int) -> tuple[int, ...]:
    return tuple(
        ref
        for ref, link in graph.links.items()
        if ref == link.start and ref != link.end and link.end == end
    )


def find_end_open(graph: RelationGraph, start: int) -> tuple[int, ...]:
    return tuple(
        ref
        for ref, link in graph.links.items()
        if ref == link.end and ref != link.start and link.start == start
    )


def test_contract_keeps_four_form_model_non_normative():
    contract = read_contract()

    assert contract["schema"] == "mts-four-binding-forms-challenge/v0.7"
    assert contract["status"] == "candidate-challenge"
    assert contract["accepted"] is False
    assert contract["issue"] == 208
    assert contract["rootBoundary"]["rootMeaningOfMeaningRemainsPrimary"] is True
    assert contract["rootBoundary"]["usingRootAsFullyOpenResolutionStateAcceptedHere"] is False
    assert contract["veto"]["rawProjectionSemanticsForSelfClosureGlyphsAllowed"] is False
    assert contract["veto"]["stageTagAllowed"] is False


def test_link_contains_only_binary_structure_and_no_semantic_stage_metadata():
    assert [field.name for field in fields(Link)] == ["start", "end"]
    source = Path(__file__).read_text(encoding="utf-8")
    forbidden_stage_field = "stage" + "Id"
    forbidden_meaning_field = "meaning" + "Id"
    assert forbidden_stage_field not in source
    assert forbidden_meaning_field not in source


def test_both_partial_forms_are_finite_self_closed_binary_links():
    graph = RelationGraph()
    start_value = LINK_REF
    end_value = UNLINK_REF

    start_open = graph.self_closed_start(end_value)
    end_open = graph.self_closed_end(start_value)
    graph.validate()

    assert graph.links[start_open] == Link(start_open, end_value)
    assert graph.links[end_open] == Link(start_value, end_open)
    assert structural_form(graph, start_open) == "start-open"
    assert structural_form(graph, end_open) == "end-open"


def test_symmetric_partial_branches_converge_to_same_exact_complete_relation():
    graph = RelationGraph()
    start = LINK_REF
    end = UNLINK_REF
    start_open = graph.self_closed_start(end)
    end_open = graph.self_closed_end(start)

    from_start_open = bind_start(graph, start_open, start)
    from_end_open = bind_end(graph, end_open, end)

    assert from_start_open == from_end_open
    assert graph.links[from_start_open] == Link(start, end)
    assert structural_form(graph, from_start_open) == "complete"
    graph.validate()


def test_resolution_does_not_mutate_partial_self_closed_relations():
    graph = RelationGraph()
    start_open = graph.self_closed_start(UNLINK_REF)
    end_open = graph.self_closed_end(LINK_REF)
    start_before = graph.links[start_open]
    end_before = graph.links[end_open]

    complete_a = bind_start(graph, start_open, LINK_REF)
    complete_b = bind_end(graph, end_open, UNLINK_REF)

    assert complete_a == complete_b
    assert graph.links[start_open] == start_before
    assert graph.links[end_open] == end_before
    assert complete_a not in {start_open, end_open}


def test_form_inversion_swaps_partial_kinds_and_preserves_distinguished_pole():
    graph = RelationGraph()
    bound = LINK_REF
    start_open = graph.self_closed_start(bound)
    end_open = graph.self_closed_end(bound)

    inverse_start = invert_form(graph, start_open)
    inverse_end = invert_form(graph, end_open)

    assert structural_form(graph, inverse_start) == "end-open"
    assert structural_form(graph, inverse_end) == "start-open"
    assert distinguished_pole(graph, inverse_start) == bound
    assert distinguished_pole(graph, inverse_end) == bound


def test_complete_inversion_swaps_poles_and_root_is_fixed():
    graph = RelationGraph()
    complete = graph.intern(LINK_REF, UNLINK_REF)
    inverse = invert_form(graph, complete)

    assert graph.links[inverse] == Link(UNLINK_REF, LINK_REF)
    assert invert_form(graph, inverse) == complete
    assert invert_form(graph, ROOT_REF) == ROOT_REF


def test_partial_form_inversion_does_not_claim_unique_occurrence_identity():
    graph = RelationGraph()
    start_open = graph.self_closed_start(LINK_REF)

    end_open = invert_form(graph, start_open)
    another_end_open = graph.self_closed_end(LINK_REF)

    assert end_open != another_end_open
    assert structural_form(graph, end_open) == structural_form(graph, another_end_open)
    assert distinguished_pole(graph, end_open) == LINK_REF
    assert distinguished_pole(graph, another_end_open) == LINK_REF


def test_known_complete_relation_resolves_both_poles_without_self_closure_projection_semantics():
    graph = RelationGraph()
    complete = graph.intern(LINK_REF, UNLINK_REF)
    known = graph.links[complete]

    resolved_start = known.start
    resolved_end = known.end

    assert resolved_start == LINK_REF
    assert resolved_end == UNLINK_REF
    assert structural_form(graph, complete) == "complete"


def test_known_partial_relation_resolves_its_already_distinguished_pole():
    graph = RelationGraph()
    start_open = graph.self_closed_start(UNLINK_REF)
    end_open = graph.self_closed_end(LINK_REF)

    assert distinguished_pole(graph, start_open) == UNLINK_REF
    assert distinguished_pole(graph, end_open) == LINK_REF


def test_same_known_end_can_have_multiple_start_open_occurrences():
    graph = RelationGraph()
    first = graph.self_closed_start(UNLINK_REF)
    second = graph.self_closed_start(UNLINK_REF)

    matches = find_start_open(graph, UNLINK_REF)
    assert first != second
    assert set(matches) >= {first, second}
    assert graph.links[first] != graph.links[second]
    graph.validate()


def test_same_known_start_can_have_multiple_end_open_occurrences():
    graph = RelationGraph()
    first = graph.self_closed_end(LINK_REF)
    second = graph.self_closed_end(LINK_REF)

    matches = find_end_open(graph, LINK_REF)
    assert first != second
    assert set(matches) >= {first, second}
    assert graph.links[first] != graph.links[second]
    graph.validate()


def test_partial_pattern_multiplicity_and_complete_exact_pair_uniqueness_coexist():
    graph = RelationGraph()
    start_open_a = graph.self_closed_start(UNLINK_REF)
    start_open_b = graph.self_closed_start(UNLINK_REF)
    end_open_a = graph.self_closed_end(LINK_REF)
    end_open_b = graph.self_closed_end(LINK_REF)

    results = {
        bind_start(graph, start_open_a, LINK_REF),
        bind_start(graph, start_open_b, LINK_REF),
        bind_end(graph, end_open_a, UNLINK_REF),
        bind_end(graph, end_open_b, UNLINK_REF),
    }

    assert len(results) == 1
    complete = next(iter(results))
    assert graph.links[complete] == Link(LINK_REF, UNLINK_REF)
    graph.validate()


def test_self_closed_shape_can_be_a_legitimate_known_payload_not_an_incomplete_global_state():
    graph = RelationGraph()
    semantic_self_closed_value = graph.self_closed_end(LINK_REF)
    outer = graph.intern(semantic_self_closed_value, UNLINK_REF)

    assert structural_form(graph, semantic_self_closed_value) == "end-open"
    assert graph.links[outer].start == semantic_self_closed_value
    assert structural_form(graph, outer) == "complete"

    contract = read_contract()
    assert contract["researchReading"]["shapeAloneImpliesIncompleteGlobally"] is False
    assert contract["veto"]["selfClosedShapeGloballyMeansIncomplete"] is False


def test_four_form_distinction_edges_require_explicit_binding_not_external_bitmask():
    contract = read_contract()
    edges = contract["distinctionOrderCandidate"]["edges"]

    assert edges == [
        "R -> startOpen(e)",
        "R -> endOpen(b)",
        "startOpen(e) -> complete(b,e)",
        "endOpen(b) -> complete(b,e)",
    ]
    assert contract["distinctionOrderCandidate"][
        "startOpenAndEndOpenComparableWithoutAdditionalBinding"
    ] is False
    assert contract["distinctionOrderCandidate"]["externalSetOrBitmaskOrderAllowed"] is False


def test_root_remains_semantic_fixed_point_not_merely_empty_builder_tag():
    graph = RelationGraph()

    assert graph.links[ROOT_REF] == Link(ROOT_REF, ROOT_REF)
    assert structural_form(graph, ROOT_REF) == "fully-open"
    contract = read_contract()
    assert contract["rootBoundary"]["rootIsOnlyAParserSentinel"] is False
    assert contract["rootBoundary"]["rootMeaningOfMeaningRemainsPrimary"] is True


def test_challenge_keeps_universal_four_form_interpretation_open():
    contract = read_contract()

    assert contract["notDecided"] == [
        "whether the four forms are accepted universal interpretation semantics",
        "whether R is the canonical fully-open state for every interpretation act",
        "whether root abits are instances of these forms or serialization meanings derived from them",
        "general associative-memory query language for partial forms",
        "formal notation syntax for relation solving",
        "production migration",
    ]
