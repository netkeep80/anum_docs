"""Non-normative link-only context-state challenge for issue #205.

The preferred test candidate represents an interpreter frame only with binary
links.  A frame carries an explicit current *builder relation*: root for zero
bound values, an ostensive self-closed-end relation for one bound value, and an
ordinary completed pair for two values.  This makes stage observable from link
shape in the accepted recursive-tree subset without adding a meaning tag.
"""

from __future__ import annotations

from dataclasses import dataclass, fields
import json
from pathlib import Path

from core.anum_denotation import DenotationRef, DenotationRefKind
from core.anum_model import ProjectionContext
from core.anum_pair_denotation import PROTOCOL_ONE_ANCHOR, PROTOCOL_ZERO_ANCHOR
from core.anum_parser import parse_raw_quaternary
from core.anum_recursive_denotation import (
    denotate_recursive_anum,
    restore_collapsed_root_opens,
)


ROOT = Path(__file__).resolve().parents[1]
CHALLENGE = ROOT / "contracts/anum-link-context-state-challenge-v0.7.json"
RECURSIVE_CORPUS = ROOT / "contracts/anum-recursive-denotation-conformance-v0.2.json"

R = 0
OPEN_REF = 1
C = 2
L = 3
U = 4


@dataclass(frozen=True)
class Link:
    start: int
    end: int


class LinkGraph:
    """Tiny exact-pair link graph used only by this challenge."""

    def __init__(self) -> None:
        self.links: dict[int, Link] = {
            R: Link(R, R),
            OPEN_REF: Link(OPEN_REF, R),
            C: Link(R, C),
            L: Link(OPEN_REF, C),
            U: Link(C, OPEN_REF),
        }
        self._pair_index = {pair: ref for ref, pair in self.links.items()}
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

    def self_closed_end(self, start: int) -> int:
        """Create E=(start,E) without an external semantic stage tag."""

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
            assert link.start in refs, (ref, link.start)
            assert link.end in refs, (ref, link.end)
            assert self._pair_index[link] == ref


@dataclass(frozen=True)
class FrameView:
    parent: int
    current: int


@dataclass(frozen=True)
class StateStep:
    token: str
    top_before: int
    top_after: int
    current_after: int
    depth_after: int


def read(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def make_frame(graph: LinkGraph, parent_frame: int, current: int) -> int:
    """K = (parentFrame ⟼ O) ⟼ current."""

    marker = graph.intern(parent_frame, OPEN_REF)
    return graph.intern(marker, current)


def read_frame(graph: LinkGraph, frame_ref: int) -> FrameView:
    frame = graph.links[frame_ref]
    marker = graph.links[frame.start]
    if marker.end != OPEN_REF:
        raise ValueError("not a candidate-A frame")
    return FrameView(parent=marker.start, current=frame.end)


def frame_depth(graph: LinkGraph, frame_ref: int) -> int:
    depth = 1
    frame = read_frame(graph, frame_ref)
    while frame.parent != R:
        depth += 1
        frame = read_frame(graph, frame.parent)
    return depth


def builder_stage(graph: LinkGraph, current: int) -> str:
    if current == R:
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
        first_value = graph.links[frame.current].start
        next_current = graph.intern(first_value, value)
    else:
        raise ValueError("completed pair context cannot consume a third value")
    return make_frame(graph, frame.parent, next_current)


def open_context(graph: LinkGraph, frame_ref: int) -> int:
    return make_frame(graph, frame_ref, R)


def close_context(graph: LinkGraph, frame_ref: int) -> int:
    inner = read_frame(graph, frame_ref)
    if inner.parent == R:
        raise ValueError("cannot close implicit root context")
    if builder_stage(graph, inner.current) != "complete":
        raise ValueError("nested context must contain exactly two resolved values")
    return feed_value(graph, inner.parent, inner.current)


def interpret_expanded(raw: str) -> tuple[LinkGraph, int, tuple[StateStep, ...]]:
    graph = LinkGraph()
    top = make_frame(graph, R, R)
    trace: list[StateStep] = []

    for token in raw:
        before = top
        if token == "0":
            top = feed_value(graph, top, U)
        elif token == "1":
            top = feed_value(graph, top, L)
        elif token == "[":
            top = open_context(graph, top)
        elif token == "]":
            top = close_context(graph, top)
        else:
            raise ValueError(f"unsupported token: {token}")
        trace.append(
            StateStep(
                token=token,
                top_before=before,
                top_after=top,
                current_after=read_frame(graph, top).current,
                depth_after=frame_depth(graph, top),
            )
        )

    top_view = read_frame(graph, top)
    if top_view.parent != R or builder_stage(graph, top_view.current) != "complete":
        raise ValueError("root recursive context did not resolve exactly two values")
    graph.validate()
    return graph, top, tuple(trace)


def interpret_raw(raw: str) -> tuple[LinkGraph, int, tuple[StateStep, ...]]:
    if raw in ("", "[]", "][", "[[", "]]"):
        raise ValueError("special root carrier is outside recursive context-state challenge")
    expanded = restore_collapsed_root_opens(raw)
    return interpret_expanded(expanded)


def graph_tree(graph: LinkGraph, ref: int, active: frozenset[int] = frozenset()):
    if ref == U:
        return "0"
    if ref == L:
        return "1"
    if ref in active:
        raise ValueError("final recursive tree unexpectedly contains a cycle")
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


def history_spine(raw: str) -> tuple[LinkGraph, int]:
    """Candidate B: state is only the finite interpreted-prefix spine."""

    graph = LinkGraph()
    history = R
    meanings = {"[": OPEN_REF, "]": C, "1": L, "0": U}
    for token in raw:
        history = graph.intern(history, meanings[token])
    graph.validate()
    return graph, history


def test_contract_is_non_normative_and_keeps_current_pronoun_candidate_only():
    challenge = read(CHALLENGE)

    assert challenge["schema"] == "anum-link-context-state-challenge/v0.7"
    assert challenge["status"] == "candidate-challenge"
    assert challenge["accepted"] is False
    assert challenge["issue"] == 205
    assert challenge["candidateA"]["accepted"] is False
    assert challenge["candidateB"]["accepted"] is False
    assert challenge["veto"]["implicitGlobalCurrentAllowed"] is False
    assert challenge["veto"]["productionChangeAllowed"] is False


def test_candidate_a_uses_only_binary_links_and_no_meaning_metadata():
    assert [field.name for field in fields(Link)] == ["start", "end"]

    graph, _, _ = interpret_raw("[01]1")
    graph.validate()
    source = Path(__file__).read_text(encoding="utf-8")
    forbidden_meaning_field = "meaning" + "Id"
    forbidden_context_class = "Context" + "Frame"
    assert forbidden_meaning_field not in source
    assert forbidden_context_class not in source


def test_new_nested_context_preserves_outer_frame_and_sets_current_to_root():
    graph = LinkGraph()
    root_frame = make_frame(graph, R, R)
    with_first = feed_value(graph, root_frame, U)
    outer_current = read_frame(graph, with_first).current

    nested = open_context(graph, with_first)
    nested_view = read_frame(graph, nested)

    assert nested_view.parent == with_first
    assert nested_view.current == R
    assert read_frame(graph, nested_view.parent).current == outer_current
    assert frame_depth(graph, nested) == 2
    assert nested != with_first


def test_one_bound_value_is_ostensive_self_closed_end_and_not_a_stage_tag():
    graph = LinkGraph()
    root_frame = make_frame(graph, R, R)
    one = feed_value(graph, root_frame, U)
    current = read_frame(graph, one).current

    assert builder_stage(graph, current) == "one"
    assert graph.links[current] == Link(U, current)
    assert current not in {R, OPEN_REF, C, L, U}


def test_second_value_resolves_partial_current_to_completed_pair():
    graph = LinkGraph()
    frame = make_frame(graph, R, R)
    frame = feed_value(graph, frame, U)
    partial = read_frame(graph, frame).current
    frame = feed_value(graph, frame, L)
    complete = read_frame(graph, frame).current

    assert graph.links[partial] == Link(U, partial)
    assert complete != partial
    assert graph.links[complete] == Link(U, L)
    assert builder_stage(graph, complete) == "complete"


def test_current_relation_without_partial_self_closure_loses_builder_stage():
    graph = LinkGraph()
    pair_01 = graph.intern(U, L)

    naive_one_value_current = pair_01
    naive_completed_01_current = pair_01
    assert naive_one_value_current == naive_completed_01_current

    wrapped_one_value = graph.self_closed_end(pair_01)
    assert wrapped_one_value != pair_01
    assert graph.links[wrapped_one_value] == Link(pair_01, wrapped_one_value)
    assert builder_stage(graph, wrapped_one_value) == "one"
    assert builder_stage(graph, pair_01) == "complete"


def test_nested_close_returns_inner_completed_pair_to_outer_builder():
    graph = LinkGraph()
    root_frame = make_frame(graph, R, R)
    root_frame = feed_value(graph, root_frame, U)
    nested = open_context(graph, root_frame)
    nested = feed_value(graph, nested, L)
    nested = feed_value(graph, nested, U)
    inner = read_frame(graph, nested).current

    closed = close_context(graph, nested)
    outer = read_frame(graph, closed)

    assert graph.links[inner] == Link(L, U)
    assert outer.parent == R
    assert graph.links[outer.current] == Link(U, inner)
    assert builder_stage(graph, outer.current) == "complete"


def test_candidate_a_matches_all_accepted_recursive_structural_tree_vectors():
    corpus = read(RECURSIVE_CORPUS)
    tested = 0

    for case in corpus["cases"]:
        if case["context"] != "root" or case["expected"]["kind"] != "structural":
            continue
        if case["raw"] in ("[]", "]["):
            continue

        production = denotate_recursive_anum(
            parse_raw_quaternary(case["raw"]), ProjectionContext.ROOT
        )
        graph, top, _ = interpret_raw(case["raw"])
        current = read_frame(graph, top).current
        assert graph_tree(graph, current) == denotation_tree(production)
        tested += 1

    assert tested >= 6


def test_current_pronoun_candidate_is_locally_resolved_from_top_frame_pattern():
    graph, top, trace = interpret_raw("[01]1")
    view = read_frame(graph, top)
    frame_link = graph.links[top]
    marker_link = graph.links[frame_link.start]

    assert marker_link.end == OPEN_REF
    assert marker_link.start == R
    assert frame_link.end == view.current
    assert view.current == trace[-1].current_after
    assert graph_tree(graph, view.current) == (("0", "1"), "1")


def test_previous_context_is_recoverable_without_incoming_link_search():
    graph = LinkGraph()
    root_frame = make_frame(graph, R, R)
    root_frame = feed_value(graph, root_frame, U)
    nested = open_context(graph, root_frame)

    nested_view = read_frame(graph, nested)
    assert nested_view.parent == root_frame
    assert read_frame(graph, nested_view.parent).current != nested_view.current


def test_untagged_exact_pair_stack_with_root_sentinel_would_collapse_depth():
    graph = LinkGraph()

    naive_root_state = graph.intern(R, R)
    naive_pushed_empty_state = graph.intern(naive_root_state, R)
    assert naive_root_state == R
    assert naive_pushed_empty_state == R

    marked_root_frame = make_frame(graph, R, R)
    marked_nested_frame = open_context(graph, marked_root_frame)
    assert marked_root_frame != R
    assert marked_nested_frame != marked_root_frame
    assert frame_depth(graph, marked_nested_frame) == 2


def test_history_spine_is_link_only_but_does_not_expose_builder_current_locally():
    raw = "[01]1"
    history_graph, history = history_spine(raw)
    state_graph, top, _ = interpret_raw(raw)
    actual_current = read_frame(state_graph, top).current

    assert history_graph.links[history].end == L
    assert graph_tree(state_graph, actual_current) == (("0", "1"), "1")
    assert actual_current not in {R, OPEN_REF, C, L, U}
    assert history_graph.links[history].end != actual_current


def test_history_spine_preserves_distinct_prefix_states_and_is_replayable():
    graph = LinkGraph()
    history = R
    meanings = {"[": OPEN_REF, "]": C, "1": L, "0": U}
    refs = []
    for token in "[01]1":
        history = graph.intern(history, meanings[token])
        refs.append(history)

    assert len(set(refs)) == len(refs)
    assert graph.links[refs[-1]].end == L
    assert graph.links[refs[-2]].end == C


def test_root_unlink_boundary_remains_outside_context_pop_model():
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
        raise AssertionError("][ must remain root-boundary precedence, not context POP/PUSH")


def test_candidate_scope_stays_recursive_tree_only_and_no_l4_identity_is_needed():
    challenge = read(CHALLENGE)

    assert challenge["scopeBoundary"]["recursiveTreeSubsetOnly"] is True
    assert challenge["scopeBoundary"]["generalCyclesCovered"] is False
    assert challenge["veto"]["l4IdentityRequired"] is False
    assert challenge["notDecided"][0] == "candidate A acceptance"
