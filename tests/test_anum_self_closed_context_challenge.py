"""Non-normative self-closed context-frame challenge for issue #211.

An active context is represented as K = K ⟼ (parent ⟼ current).  The model is
persistent: changing current produces a new frame relation, so nested contexts
can retain the exact outer state without a mutable parent field or incoming-link
search.
"""

from __future__ import annotations

from dataclasses import dataclass, fields
import json
from pathlib import Path

from core.anum_denotation import DenotationRef, DenotationRefKind
from core.anum_model import ProjectionContext
from core.anum_pair_denotation import PROTOCOL_ONE_ANCHOR, PROTOCOL_ZERO_ANCHOR
from core.anum_parser import parse_raw_quaternary
from core.anum_recursive_denotation import denotate_recursive_anum, restore_collapsed_root_opens


ROOT = Path(__file__).resolve().parents[1]
CHALLENGE = ROOT / "contracts/anum-self-closed-context-challenge-v0.7.json"
CORPUS = ROOT / "contracts/anum-recursive-denotation-conformance-v0.2.json"

ROOT_REF = 0
OPEN_REF = 1
CLOSE_REF = 2
LINK_REF = 3
UNLINK_REF = 4


@dataclass(frozen=True)
class Link:
    start: int
    end: int


class LinkGraph:
    def __init__(self) -> None:
        self.links: dict[int, Link] = {
            ROOT_REF: Link(ROOT_REF, ROOT_REF),
            OPEN_REF: Link(OPEN_REF, ROOT_REF),
            CLOSE_REF: Link(ROOT_REF, CLOSE_REF),
            LINK_REF: Link(OPEN_REF, CLOSE_REF),
            UNLINK_REF: Link(CLOSE_REF, OPEN_REF),
        }
        self._pairs = {link: ref for ref, link in self.links.items()}
        self._next_ref = 5

    def intern(self, start: int, end: int) -> int:
        pair = Link(start, end)
        existing = self._pairs.get(pair)
        if existing is not None:
            return existing
        ref = self._next_ref
        self._next_ref += 1
        self.links[ref] = pair
        self._pairs[pair] = ref
        return ref

    def self_closed_start(self, end: int) -> int:
        ref = self._next_ref
        self._next_ref += 1
        pair = Link(ref, end)
        assert pair not in self._pairs
        self.links[ref] = pair
        self._pairs[pair] = ref
        return ref

    def self_closed_end(self, start: int) -> int:
        ref = self._next_ref
        self._next_ref += 1
        pair = Link(start, ref)
        assert pair not in self._pairs
        self.links[ref] = pair
        self._pairs[pair] = ref
        return ref

    def validate(self) -> None:
        refs = set(self.links)
        assert len(self.links) == len(self._pairs)
        for ref, link in self.links.items():
            assert link.start in refs
            assert link.end in refs
            assert self._pairs[link] == ref


@dataclass(frozen=True)
class FrameView:
    payload: int
    parent: int
    current: int


@dataclass(frozen=True)
class Step:
    token: str
    frame_before: int
    frame_after: int
    current_after: int
    depth_after: int


def contract() -> dict:
    return json.loads(CHALLENGE.read_text(encoding="utf-8"))


def initial_root_frame() -> int:
    return OPEN_REF


def new_frame(graph: LinkGraph, parent: int, current: int) -> int:
    payload = graph.intern(parent, current)
    return graph.self_closed_start(payload)


def read_frame(graph: LinkGraph, frame_ref: int) -> FrameView:
    frame = graph.links[frame_ref]
    if frame.start != frame_ref:
        raise ValueError("active frame must be start-self-closed")
    payload_ref = frame.end
    payload = graph.links[payload_ref]
    return FrameView(payload=payload_ref, parent=payload.start, current=payload.end)


def frame_depth(graph: LinkGraph, frame_ref: int) -> int:
    depth = 1
    view = read_frame(graph, frame_ref)
    while view.parent != ROOT_REF:
        depth += 1
        view = read_frame(graph, view.parent)
    return depth


def builder_stage(graph: LinkGraph, current: int) -> str:
    if current == ROOT_REF:
        return "empty"
    link = graph.links[current]
    if link.end == current and link.start != current:
        return "one"
    return "complete"


def feed_value(graph: LinkGraph, frame_ref: int, value: int) -> int:
    frame = read_frame(graph, frame_ref)
    stage = builder_stage(graph, frame.current)
    if stage == "empty":
        next_current = graph.self_closed_end(value)
    elif stage == "one":
        first = graph.links[frame.current].start
        next_current = graph.intern(first, value)
    else:
        raise ValueError("completed pair context cannot consume a third value")
    return new_frame(graph, frame.parent, next_current)


def open_context(graph: LinkGraph, frame_ref: int) -> int:
    return new_frame(graph, frame_ref, ROOT_REF)


def close_context(graph: LinkGraph, frame_ref: int) -> int:
    inner = read_frame(graph, frame_ref)
    if inner.parent == ROOT_REF:
        raise ValueError("cannot close implicit root context")
    if builder_stage(graph, inner.current) != "complete":
        raise ValueError("nested context must resolve exactly two values")
    return feed_value(graph, inner.parent, inner.current)


def interpret_expanded(raw: str) -> tuple[LinkGraph, int, tuple[Step, ...]]:
    graph = LinkGraph()
    active = initial_root_frame()
    trace: list[Step] = []

    for token in raw:
        before = active
        if token == "0":
            active = feed_value(graph, active, UNLINK_REF)
        elif token == "1":
            active = feed_value(graph, active, LINK_REF)
        elif token == "[":
            active = open_context(graph, active)
        elif token == "]":
            active = close_context(graph, active)
        else:
            raise ValueError(f"unsupported token: {token}")
        trace.append(
            Step(
                token=token,
                frame_before=before,
                frame_after=active,
                current_after=read_frame(graph, active).current,
                depth_after=frame_depth(graph, active),
            )
        )

    final = read_frame(graph, active)
    if final.parent != ROOT_REF or builder_stage(graph, final.current) != "complete":
        raise ValueError("root context must finish with one completed pair")
    graph.validate()
    return graph, active, tuple(trace)


def interpret_raw(raw: str) -> tuple[LinkGraph, int, tuple[Step, ...]]:
    if raw in ("", "[]", "][", "[[", "]]"):
        raise ValueError("special root carrier is outside nested context challenge")
    return interpret_expanded(restore_collapsed_root_opens(raw))


def graph_tree(graph: LinkGraph, ref: int, active: frozenset[int] = frozenset()):
    if ref == UNLINK_REF:
        return "0"
    if ref == LINK_REF:
        return "1"
    if ref in active:
        raise ValueError("final recursive occurrence tree contains unexpected cycle")
    link = graph.links[ref]
    return (
        graph_tree(graph, link.start, active | {ref}),
        graph_tree(graph, link.end, active | {ref}),
    )


def denotation_tree(value, ref: DenotationRef | None = None):
    structural = value.structural
    assert structural is not None
    if ref is None:
        ref = structural.root
    if ref.kind is DenotationRefKind.ANCHOR:
        if ref.anchor == PROTOCOL_ZERO_ANCHOR:
            return "0"
        if ref.anchor == PROTOCOL_ONE_ANCHOR:
            return "1"
        raise ValueError(f"unexpected anchor: {ref.anchor}")
    assert ref.node is not None
    node = structural.nodes[ref.node]
    return (denotation_tree(value, node.start), denotation_tree(value, node.end))


def start_open_matches(graph: LinkGraph, payload: int) -> tuple[int, ...]:
    return tuple(
        ref
        for ref, link in graph.links.items()
        if link.start == ref and link.end == payload and ref != payload
    )


def test_contract_is_non_normative_and_removes_dedicated_marker_candidate():
    value = contract()

    assert value["schema"] == "anum-self-closed-context-challenge/v0.7"
    assert value["status"] == "candidate-challenge"
    assert value["accepted"] is False
    assert value["issue"] == 211
    assert value["frameCandidate"]["explicitMarkerRequired"] is False
    assert value["frameCandidate"]["mutableFrameRequired"] is False
    assert value["veto"]["dedicatedContextTypeAllowed"] is False
    assert value["veto"]["productionChangeAllowed"] is False


def test_state_links_have_only_start_end_structure():
    assert [field.name for field in fields(Link)] == ["start", "end"]


def test_initial_root_frame_is_existing_root_start_self_closed_form():
    graph = LinkGraph()
    active = initial_root_frame()
    view = read_frame(graph, active)

    assert active == OPEN_REF
    assert graph.links[active] == Link(active, ROOT_REF)
    assert view.payload == ROOT_REF
    assert graph.links[view.payload] == Link(ROOT_REF, ROOT_REF)
    assert view.parent == ROOT_REF
    assert view.current == ROOT_REF


def test_current_update_creates_new_frame_without_mutating_previous_state():
    graph = LinkGraph()
    root_frame = initial_root_frame()
    root_before = graph.links[root_frame]

    after_one = feed_value(graph, root_frame, UNLINK_REF)

    assert after_one != root_frame
    assert graph.links[root_frame] == root_before
    assert read_frame(graph, root_frame).current == ROOT_REF
    partial = read_frame(graph, after_one).current
    assert graph.links[partial] == Link(UNLINK_REF, partial)


def test_nested_open_keeps_exact_outer_state_and_sets_inner_current_to_root():
    graph = LinkGraph()
    outer = feed_value(graph, initial_root_frame(), UNLINK_REF)
    outer_current = read_frame(graph, outer).current

    inner = open_context(graph, outer)
    inner_view = read_frame(graph, inner)

    assert inner_view.parent == outer
    assert inner_view.current == ROOT_REF
    assert read_frame(graph, inner_view.parent).current == outer_current
    assert inner != outer
    assert frame_depth(graph, inner) == 2


def test_two_nested_empty_contexts_remain_distinct_with_same_root_current():
    graph = LinkGraph()
    root_frame = initial_root_frame()
    first = open_context(graph, root_frame)
    second = open_context(graph, first)

    assert read_frame(graph, first).current == ROOT_REF
    assert read_frame(graph, second).current == ROOT_REF
    assert first != second != root_frame
    assert read_frame(graph, second).parent == first
    assert read_frame(graph, first).parent == root_frame
    assert frame_depth(graph, second) == 3


def test_nested_close_returns_completed_inner_current_to_saved_parent_builder():
    graph = LinkGraph()
    outer = feed_value(graph, initial_root_frame(), UNLINK_REF)
    inner = open_context(graph, outer)
    inner = feed_value(graph, inner, LINK_REF)
    inner = feed_value(graph, inner, UNLINK_REF)
    completed_inner = read_frame(graph, inner).current

    resumed = close_context(graph, inner)
    resumed_view = read_frame(graph, resumed)

    assert graph.links[completed_inner] == Link(LINK_REF, UNLINK_REF)
    assert resumed_view.parent == ROOT_REF
    assert graph.links[resumed_view.current] == Link(UNLINK_REF, completed_inner)
    assert resumed != outer
    assert read_frame(graph, outer).current != resumed_view.current


def test_parent_and_current_resolve_only_from_active_frame_outgoing_structure():
    graph, active, trace = interpret_raw("[01]1")
    frame_link = graph.links[active]
    payload = graph.links[frame_link.end]
    view = read_frame(graph, active)

    assert frame_link.start == active
    assert view.payload == frame_link.end
    assert view.parent == payload.start
    assert view.current == payload.end
    assert view.current == trace[-1].current_after
    assert graph_tree(graph, view.current) == (("0", "1"), "1")


def test_candidate_matches_all_accepted_recursive_structural_root_vectors():
    corpus = json.loads(CORPUS.read_text(encoding="utf-8"))
    tested = 0

    for case in corpus["cases"]:
        if case["context"] != "root" or case["expected"]["kind"] != "structural":
            continue
        if case["raw"] in ("[]", "]["):
            continue
        production = denotate_recursive_anum(
            parse_raw_quaternary(case["raw"]), ProjectionContext.ROOT
        )
        graph, active, _ = interpret_raw(case["raw"])
        assert graph_tree(graph, read_frame(graph, active).current) == denotation_tree(production)
        tested += 1

    assert tested >= 6


def test_same_root_start_self_closed_form_can_have_multiple_occurrences():
    graph = LinkGraph()
    bootstrap = initial_root_frame()
    another = graph.self_closed_start(ROOT_REF)
    matches = start_open_matches(graph, ROOT_REF)

    assert bootstrap != another
    assert set(matches) >= {bootstrap, another}
    assert graph.links[bootstrap] == Link(bootstrap, ROOT_REF)
    assert graph.links[another] == Link(another, ROOT_REF)


def test_active_frame_identity_must_be_explicit_when_same_form_has_multiple_matches():
    graph = LinkGraph()
    bootstrap = initial_root_frame()
    alternative = graph.self_closed_start(ROOT_REF)

    assert read_frame(graph, bootstrap) == read_frame(graph, alternative)
    assert bootstrap != alternative
    assert contract()["rootFormBoundary"]["activeFrameIdentityMustBeExplicit"] is True
    assert contract()["rootFormBoundary"]["globalUniqueSearchForRootFrameAllowed"] is False


def test_start_self_closed_relation_can_be_ordinary_payload_data():
    graph = LinkGraph()
    ordinary_value = graph.self_closed_start(LINK_REF)
    outer = graph.intern(ordinary_value, UNLINK_REF)

    assert graph.links[ordinary_value] == Link(ordinary_value, LINK_REF)
    assert graph.links[outer].start == ordinary_value
    assert outer != ordinary_value


def test_root_unlink_boundary_remains_outside_context_close_semantics():
    production = denotate_recursive_anum(
        parse_raw_quaternary("]["), ProjectionContext.ROOT
    )
    assert production.structural is not None
    assert production.structural.root.anchor == PROTOCOL_ZERO_ANCHOR

    try:
        interpret_raw("][")
    except ValueError:
        pass
    else:
        raise AssertionError("][ must remain root protocol precedence")


def test_self_closed_context_candidate_has_fewer_dedicated_positions_than_marker_candidate():
    value = contract()

    assert value["comparisonToMarkerCandidate"]["issue205MarkerCandidateUsesExtraOPosition"] is True
    assert value["comparisonToMarkerCandidate"]["thisCandidateUsesSelfClosureAsContextForm"] is True
    assert value["comparisonToMarkerCandidate"]["fewerDedicatedStructuralPositions"] is True
    assert value["comparisonToMarkerCandidate"]["preferredIfChallengePasses"] is False


def test_general_interpreter_adoption_remains_open():
    value = contract()

    assert value["notDecided"] == [
        "whether self-closed context frames are accepted interpreter ontology",
        "whether O is the canonical bootstrap active root frame or merely one matching occurrence",
        "how the active-frame ref itself is represented in the full interpreter act network",
        "whether formal notation and Anum decoding share exactly this context topology",
        "how reverse-resolution start-open current integrates with nested decoding",
        "production migration",
    ]
