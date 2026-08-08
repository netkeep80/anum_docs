"""Storage-neutral structural denotation handoff for Anum L3 v0.2.

The types in this module describe a denotation without querying or mutating any
associative-memory backend. Persistent LinkIds do not appear here: anchors are
opaque caller/context keys and structural nodes use description-local ids.
"""

from dataclasses import dataclass
from enum import Enum
import json


class DenotationKind(str, Enum):
    STRUCTURAL = "structural"
    RAW = "raw"
    QUOTED_RAW = "quoted-raw"


class DenotationRefKind(str, Enum):
    ANCHOR = "anchor"
    NODE = "node"


@dataclass(frozen=True)
class DenotationRef:
    kind: DenotationRefKind
    anchor: str | None = None
    node: int | None = None

    @staticmethod
    def anchor_ref(key: str) -> "DenotationRef":
        return DenotationRef(kind=DenotationRefKind.ANCHOR, anchor=key)

    @staticmethod
    def node_ref(node_id: int) -> "DenotationRef":
        return DenotationRef(kind=DenotationRefKind.NODE, node=node_id)


@dataclass(frozen=True)
class DenotationNode:
    id: int
    start: DenotationRef
    end: DenotationRef


@dataclass(frozen=True)
class StructuralDenotation:
    anchors: tuple[str, ...]
    nodes: tuple[DenotationNode, ...]
    root: DenotationRef

    def __post_init__(self) -> None:
        validate_structural_denotation(self)


@dataclass(frozen=True)
class AnumDenotation:
    kind: DenotationKind
    structural: StructuralDenotation | None = None
    raw: str | None = None

    @staticmethod
    def structural_result(value: StructuralDenotation) -> "AnumDenotation":
        return AnumDenotation(kind=DenotationKind.STRUCTURAL, structural=value)

    @staticmethod
    def raw_result(raw: str) -> "AnumDenotation":
        return AnumDenotation(kind=DenotationKind.RAW, raw=raw)

    @staticmethod
    def quoted_raw_result(raw: str) -> "AnumDenotation":
        return AnumDenotation(kind=DenotationKind.QUOTED_RAW, raw=raw)

    def __post_init__(self) -> None:
        if self.kind is DenotationKind.STRUCTURAL:
            if self.structural is None or self.raw is not None:
                raise ValueError("structural denotation requires only structural payload")
            return

        if self.structural is not None or self.raw is None:
            raise ValueError("raw denotation kind requires only raw payload")


def validate_structural_denotation(value: StructuralDenotation) -> None:
    if tuple(sorted(value.anchors)) != value.anchors:
        raise ValueError("denotation anchors must be sorted")
    if len(set(value.anchors)) != len(value.anchors):
        raise ValueError("denotation anchors must be unique")
    if any(not anchor for anchor in value.anchors):
        raise ValueError("denotation anchor keys must be non-empty")

    anchors = set(value.anchors)
    for expected_id, node in enumerate(value.nodes):
        if node.id != expected_id:
            raise ValueError("denotation node ids must be contiguous and ordered")
        _validate_ref(node.start, anchors, available_nodes=expected_id)
        _validate_ref(node.end, anchors, available_nodes=expected_id)

    _validate_ref(value.root, anchors, available_nodes=len(value.nodes))


def denotation_from_data(data: dict) -> AnumDenotation:
    """Parse canonical IR-shaped data without invoking the raw Anum parser."""

    if not isinstance(data, dict) or "kind" not in data:
        raise ValueError("denotation data must be an object with kind")

    try:
        kind = DenotationKind(data["kind"])
    except (TypeError, ValueError) as exc:
        raise ValueError("unknown denotation kind") from exc

    if kind is not DenotationKind.STRUCTURAL:
        if set(data) != {"kind", "raw"} or not isinstance(data["raw"], str):
            raise ValueError("raw denotation data must contain exactly kind and raw string")
        if kind is DenotationKind.RAW:
            return AnumDenotation.raw_result(data["raw"])
        return AnumDenotation.quoted_raw_result(data["raw"])

    if set(data) != {"kind", "anchors", "nodes", "root"}:
        raise ValueError("structural denotation data has unexpected or missing fields")
    if not isinstance(data["anchors"], list) or not all(
        isinstance(anchor, str) for anchor in data["anchors"]
    ):
        raise ValueError("structural anchors must be a string list")
    if not isinstance(data["nodes"], list):
        raise ValueError("structural nodes must be a list")

    nodes: list[DenotationNode] = []
    for node_data in data["nodes"]:
        if not isinstance(node_data, dict) or set(node_data) != {"id", "start", "end"}:
            raise ValueError("denotation node must contain exactly id, start and end")
        if not isinstance(node_data["id"], int) or isinstance(node_data["id"], bool):
            raise ValueError("denotation node id must be an integer")
        nodes.append(
            DenotationNode(
                id=node_data["id"],
                start=_ref_from_data(node_data["start"]),
                end=_ref_from_data(node_data["end"]),
            )
        )

    structural = StructuralDenotation(
        anchors=tuple(data["anchors"]),
        nodes=tuple(nodes),
        root=_ref_from_data(data["root"]),
    )
    return AnumDenotation.structural_result(structural)


def canonical_denotation_json(value: AnumDenotation) -> str:
    """Serialize one validated denotation to deterministic compact JSON."""

    payload = _denotation_to_data(value)
    return json.dumps(
        payload,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )


def _validate_ref(ref: DenotationRef, anchors: set[str], available_nodes: int) -> None:
    if ref.kind is DenotationRefKind.ANCHOR:
        if ref.anchor is None or ref.node is not None:
            raise ValueError("anchor reference must contain only an anchor key")
        if ref.anchor not in anchors:
            raise ValueError(f"denotation reference uses undeclared anchor: {ref.anchor}")
        return

    if ref.node is None or ref.anchor is not None:
        raise ValueError("node reference must contain only a node id")
    if ref.node < 0 or ref.node >= available_nodes:
        raise ValueError("denotation node reference must target an earlier node")


def _denotation_to_data(value: AnumDenotation) -> dict:
    if value.kind is DenotationKind.STRUCTURAL:
        structural = value.structural
        assert structural is not None
        return {
            "kind": value.kind.value,
            "anchors": list(structural.anchors),
            "nodes": [
                {
                    "id": node.id,
                    "start": _ref_to_data(node.start),
                    "end": _ref_to_data(node.end),
                }
                for node in structural.nodes
            ],
            "root": _ref_to_data(structural.root),
        }

    assert value.raw is not None
    return {"kind": value.kind.value, "raw": value.raw}


def _ref_from_data(data: object) -> DenotationRef:
    if not isinstance(data, dict):
        raise ValueError("denotation reference must be an object")
    if set(data) == {"anchor"} and isinstance(data["anchor"], str):
        return DenotationRef.anchor_ref(data["anchor"])
    if (
        set(data) == {"node"}
        and isinstance(data["node"], int)
        and not isinstance(data["node"], bool)
    ):
        return DenotationRef.node_ref(data["node"])
    raise ValueError("denotation reference must contain exactly one anchor or node")


def _ref_to_data(ref: DenotationRef) -> dict:
    if ref.kind is DenotationRefKind.ANCHOR:
        return {"anchor": ref.anchor}
    return {"node": ref.node}
