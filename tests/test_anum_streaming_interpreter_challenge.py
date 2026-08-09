"""Non-normative streaming Anum interpreter challenge for issue #201.

The streaming core reproduces the accepted recursive root subset with explicit
pair-context frames and emits storage-neutral denotation nodes directly.  Root
boundary precedence remains a separate earlier layer, deliberately exposing
why '[' and ']' cannot be unconditional PUSH/POP opcodes.
"""

from __future__ import annotations

from dataclasses import dataclass
import json
from pathlib import Path

import pytest

from core.anum_denotation import (
    AnumDenotation,
    DenotationNode,
    DenotationRef,
    StructuralDenotation,
    canonical_denotation_json,
)
from core.anum_model import ProjectionContext
from core.anum_pair_denotation import PROTOCOL_ONE_ANCHOR, PROTOCOL_ZERO_ANCHOR
from core.anum_parser import parse_raw_quaternary
from core.anum_recursive_denotation import (
    canonical_recursive_anum,
    denotate_recursive_anum,
    restore_collapsed_root_opens,
)


ROOT = Path(__file__).resolve().parents[1]
CHALLENGE = ROOT / "contracts/anum-streaming-interpreter-challenge-v0.7.json"
KERNEL_CHALLENGE = ROOT / "contracts/mts-semantic-root-kernel-challenge-v0.7.json"
RECURSIVE_CORPUS = ROOT / "contracts/anum-recursive-denotation-conformance-v0.2.json"


class StreamingDecodeError(ValueError):
    """The source is outside the recursive streaming subset."""


@dataclass
class PairFrame:
    values: list[DenotationRef]


@dataclass(frozen=True)
class TraceStep:
    token: str
    action: str
    depth_before: int
    depth_after: int


def read(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def anchor_ref(token: str) -> tuple[DenotationRef, str]:
    if token == "0":
        anchor = PROTOCOL_ZERO_ANCHOR
    elif token == "1":
        anchor = PROTOCOL_ONE_ANCHOR
    else:
        raise StreamingDecodeError("stream atom must be 0 or 1")
    return DenotationRef.anchor_ref(anchor), anchor


def stream_recursive_expanded(raw: str) -> tuple[AnumDenotation, tuple[TraceStep, ...]]:
    """Decode explicit recursive grammar with a finite stack, without an AST."""

    if raw in ("0", "1"):
        ref, anchor = anchor_ref(raw)
        return (
            AnumDenotation.structural_result(
                StructuralDenotation(anchors=(anchor,), nodes=(), root=ref)
            ),
            (TraceStep(raw, "emit-atom", 1, 1),),
        )

    frames = [PairFrame(values=[])]
    nodes: list[DenotationNode] = []
    anchors: set[str] = set()
    trace: list[TraceStep] = []

    def emit(ref: DenotationRef) -> None:
        frame = frames[-1]
        if len(frame.values) >= 2:
            raise StreamingDecodeError("pair context accepts exactly two values")
        frame.values.append(ref)

    def build_pair(values: list[DenotationRef]) -> DenotationRef:
        if len(values) != 2:
            raise StreamingDecodeError("closing pair context requires exactly two values")
        node_id = len(nodes)
        nodes.append(DenotationNode(id=node_id, start=values[0], end=values[1]))
        return DenotationRef.node_ref(node_id)

    for token in raw:
        depth_before = len(frames)
        if token in ("0", "1"):
            ref, anchor = anchor_ref(token)
            anchors.add(anchor)
            emit(ref)
            action = "emit-atom"
        elif token == "[":
            frames.append(PairFrame(values=[]))
            action = "open-context"
        elif token == "]":
            if len(frames) == 1:
                raise StreamingDecodeError("cannot close the implicit root context")
            nested = frames.pop()
            emit(build_pair(nested.values))
            action = "close-context"
        else:
            raise StreamingDecodeError(f"unsupported token: {token}")
        trace.append(TraceStep(token, action, depth_before, len(frames)))

    if len(frames) != 1:
        raise StreamingDecodeError("recursive carrier ended with unclosed context")
    root = build_pair(frames[0].values)
    return (
        AnumDenotation.structural_result(
            StructuralDenotation(
                anchors=tuple(sorted(anchors)),
                nodes=tuple(nodes),
                root=root,
            )
        ),
        tuple(trace),
    )


def stream_recursive_raw(raw: str) -> tuple[AnumDenotation, tuple[TraceStep, ...]]:
    """Apply accepted root-open restoration, then stream the recursive subset."""

    if raw in ("[]", "][", "[[", "]]", ""):
        raise StreamingDecodeError("root boundary/special carrier is outside recursive stack grammar")

    expanded = restore_collapsed_root_opens(raw)
    value, trace = stream_recursive_expanded(expanded)
    if canonical_recursive_anum(value) != raw:
        raise StreamingDecodeError("recursive carrier is not canonical")
    return value, trace


def naive_unconditional_bracket_depth(raw: str) -> int:
    """Intentionally naive model used only as a falsification oracle."""

    depth = 0
    for token in raw:
        if token == "[":
            depth += 1
        elif token == "]":
            depth -= 1
            if depth < 0:
                raise StreamingDecodeError("unconditional POP underflow")
    return depth


def test_contract_is_non_normative_and_depends_on_semantic_kernel_challenge():
    challenge = read(CHALLENGE)
    kernel = read(KERNEL_CHALLENGE)

    assert challenge["schema"] == "anum-streaming-interpreter-challenge/v0.7"
    assert challenge["status"] == "candidate-challenge"
    assert challenge["accepted"] is False
    assert challenge["issue"] == 201
    assert challenge["dependsOn"] == [kernel["schema"]]
    assert challenge["criticalBoundary"]["naiveUnconditionalPushPopRejected"] is True
    assert challenge["contextQuestion"]["currentPronounDerivedHere"] is False
    assert challenge["veto"]["productionAnumChangeAllowed"] is False


def test_streaming_stack_matches_all_accepted_recursive_structural_vectors():
    corpus = read(RECURSIVE_CORPUS)

    tested = 0
    for case in corpus["cases"]:
        if case["context"] != "root":
            continue
        if case["expected"]["kind"] != "structural":
            continue
        if case["raw"] in ("[]", "]["):
            continue

        production = denotate_recursive_anum(
            parse_raw_quaternary(case["raw"]),
            ProjectionContext.ROOT,
        )
        streamed, _ = stream_recursive_raw(case["raw"])
        assert canonical_denotation_json(streamed) == canonical_denotation_json(production)
        assert canonical_recursive_anum(streamed) == case["canonicalRaw"]
        tested += 1

    assert tested >= 6


def test_open_and_close_are_real_stack_transitions_inside_recursive_context():
    streamed, trace = stream_recursive_raw("[01]1")

    assert streamed.structural is not None
    open_step = next(step for step in trace if step.action == "open-context")
    close_step = next(step for step in trace if step.action == "close-context")
    assert (open_step.depth_before, open_step.depth_after) == (1, 2)
    assert (close_step.depth_before, close_step.depth_after) == (2, 1)


def test_nested_both_uses_two_separate_context_lifecycles():
    _, trace = stream_recursive_raw("[01][10]")

    opens = [step for step in trace if step.action == "open-context"]
    closes = [step for step in trace if step.action == "close-context"]
    assert len(opens) == 2
    assert len(closes) == 2
    assert all(step.depth_after == 2 for step in opens)
    assert all(step.depth_after == 1 for step in closes)


def test_root_opening_collapse_remains_compatible_with_streaming_core():
    raw = "[01]1]0"
    expanded = restore_collapsed_root_opens(raw)
    production = denotate_recursive_anum(
        parse_raw_quaternary(raw),
        ProjectionContext.ROOT,
    )
    streamed, trace = stream_recursive_raw(raw)

    assert expanded == "[[01]1]0"
    assert trace[0].action == "open-context"
    assert trace[1].action == "open-context"
    assert canonical_denotation_json(streamed) == canonical_denotation_json(production)
    assert canonical_recursive_anum(streamed) == raw


def test_root_boundary_precedence_is_not_recursive_push_pop_grammar():
    expected = {
        "[]": PROTOCOL_ONE_ANCHOR,
        "][": PROTOCOL_ZERO_ANCHOR,
    }

    for raw, anchor in expected.items():
        production = denotate_recursive_anum(
            parse_raw_quaternary(raw),
            ProjectionContext.ROOT,
        )
        assert production.structural is not None
        assert production.structural.nodes == ()
        assert production.structural.root.anchor == anchor
        with pytest.raises(StreamingDecodeError):
            stream_recursive_raw(raw)


def test_naive_unconditional_push_pop_is_falsified_by_root_unlink_boundary():
    assert naive_unconditional_bracket_depth("[]") == 0
    with pytest.raises(StreamingDecodeError, match="underflow"):
        naive_unconditional_bracket_depth("][")

    challenge = read(CHALLENGE)
    assert challenge["acceptedBaseline"]["rootBoundaryPrecedence"]["]["] == "protocol:0"
    assert challenge["criticalBoundary"]["primaryAbitMeaningMustPrecedeOpcodeReading"] is True


def test_open_open_and_close_close_remain_raw_at_root():
    for raw in ("[[", "]]"):
        production = denotate_recursive_anum(
            parse_raw_quaternary(raw),
            ProjectionContext.ROOT,
        )
        assert production.raw is not None
        with pytest.raises(StreamingDecodeError):
            stream_recursive_raw(raw)


def test_known_malformed_or_noncanonical_recursive_carriers_stay_rejected():
    for raw in ("[0]1", "010", "[01]", "[[01]1]0"):
        production = denotate_recursive_anum(
            parse_raw_quaternary(raw),
            ProjectionContext.ROOT,
        )
        assert production.raw is not None
        with pytest.raises(StreamingDecodeError):
            stream_recursive_raw(raw)


def test_streaming_core_emits_denotation_nodes_directly_without_l4_effects():
    source = Path(__file__).read_text(encoding="utf-8")
    streamed, _ = stream_recursive_raw("0[10]")
    recursive_tree_name = "Recursive" + "AnumTree"
    memory_name = "Anum" + "Memory"

    assert streamed.structural is not None
    assert len(streamed.structural.nodes) == 2
    assert recursive_tree_name not in source
    assert memory_name not in source
    assert read(CHALLENGE)["streamingCoreCandidate"][
        "buildsStorageNeutralDenotationDirectly"
    ] is True


def test_stack_frame_is_not_yet_promoted_to_current_link_ontology():
    challenge = read(CHALLENGE)

    assert challenge["contextQuestion"]["stackFrameIsOperationalContext"] is True
    assert challenge["contextQuestion"]["stackFrameIsAlreadyProvenToBeOntologicalLink"] is False
    assert challenge["notDecided"] == [
        "link-only representation of the context stack",
        "whether a newly opened context starts from ∞ as an ontological current relation",
        "how outer and inner current relations combine on close",
        "exact current-link pronoun ↑",
        "general dictionary-driven interpreter",
        "formal notation execution semantics",
    ]
