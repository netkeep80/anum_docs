"""Storage-neutral structural description of a raw Anum carrier.

A raw carrier is deliberately distinct from its denotation. The description is
an ordered chain rooted at a protocol role. Local node positions exist only
inside one serialized description and are not persistent or ontological IDs.
"""

from dataclasses import dataclass
from enum import Enum
import json

from core.anum_model import Abit, AnumForm
from core.anum_parser import normalize_raw_form


class RawCarrierRole(str, Enum):
    ROOT = "root"
    OPEN = "abit:["
    CLOSE = "abit:]"
    LINK = "abit:1"
    UNLINK = "abit:0"


class RawCarrierRefKind(str, Enum):
    ROLE = "role"
    NODE = "node"


@dataclass(frozen=True)
class RawCarrierRef:
    kind: RawCarrierRefKind
    role: RawCarrierRole | None = None
    node: int | None = None

    @staticmethod
    def role_ref(role: RawCarrierRole) -> "RawCarrierRef":
        return RawCarrierRef(kind=RawCarrierRefKind.ROLE, role=role)

    @staticmethod
    def node_ref(node_id: int) -> "RawCarrierRef":
        return RawCarrierRef(kind=RawCarrierRefKind.NODE, node=node_id)


@dataclass(frozen=True)
class RawCarrierNode:
    id: int
    start: RawCarrierRef
    end: RawCarrierRef


@dataclass(frozen=True)
class RawCarrierDescription:
    raw: str
    nodes: tuple[RawCarrierNode, ...]
    root: RawCarrierRef

    def __post_init__(self) -> None:
        validate_raw_carrier(self)


def describe_raw_carrier(form: AnumForm) -> RawCarrierDescription:
    """Build the deterministic raw sequence carrier without projecting meaning."""

    current = RawCarrierRef.role_ref(RawCarrierRole.ROOT)
    nodes: list[RawCarrierNode] = []

    for node_id, token in enumerate(form.tokens):
        node = RawCarrierNode(
            id=node_id,
            start=current,
            end=RawCarrierRef.role_ref(_role_for_abit(token.abit)),
        )
        nodes.append(node)
        current = RawCarrierRef.node_ref(node_id)

    return RawCarrierDescription(
        raw=normalize_raw_form(form),
        nodes=tuple(nodes),
        root=current,
    )


def validate_raw_carrier(value: RawCarrierDescription) -> None:
    """Validate the exact root-then-abits chain shape of one raw carrier."""

    expected_start = RawCarrierRef.role_ref(RawCarrierRole.ROOT)
    reconstructed: list[str] = []

    for expected_id, node in enumerate(value.nodes):
        if node.id != expected_id:
            raise ValueError("raw carrier node ids must be contiguous sequence positions")
        _validate_ref(node.start, available_nodes=expected_id)
        _validate_ref(node.end, available_nodes=expected_id)
        if node.start != expected_start:
            raise ValueError("raw carrier nodes must form one ordered sequence chain")
        if node.end.kind is not RawCarrierRefKind.ROLE or node.end.role not in _ABIT_FOR_ROLE:
            raise ValueError("raw carrier node end must be one raw abit role")

        reconstructed.append(_ABIT_FOR_ROLE[node.end.role])
        expected_start = RawCarrierRef.node_ref(expected_id)

    expected_root = (
        RawCarrierRef.node_ref(len(value.nodes) - 1)
        if value.nodes
        else RawCarrierRef.role_ref(RawCarrierRole.ROOT)
    )
    if value.root != expected_root:
        raise ValueError("raw carrier root must be the final sequence node or root role")
    _validate_ref(value.root, available_nodes=len(value.nodes))

    if value.raw != "".join(reconstructed):
        raise ValueError("raw carrier text must match the structural abit sequence")


def canonical_raw_carrier_json(value: RawCarrierDescription) -> str:
    """Serialize one validated raw carrier description deterministically."""

    validate_raw_carrier(value)
    payload = {
        "kind": "raw-carrier",
        "raw": value.raw,
        "nodes": [
            {
                "id": node.id,
                "start": _ref_to_data(node.start),
                "end": _ref_to_data(node.end),
            }
            for node in value.nodes
        ],
        "root": _ref_to_data(value.root),
    }
    return json.dumps(
        payload,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )


def raw_carrier_from_data(data: dict) -> RawCarrierDescription:
    """Parse canonical raw-carrier-shaped data without invoking the raw parser."""

    if not isinstance(data, dict) or set(data) != {"kind", "raw", "nodes", "root"}:
        raise ValueError("raw carrier data must contain exactly kind, raw, nodes and root")
    if data["kind"] != "raw-carrier" or not isinstance(data["raw"], str):
        raise ValueError("raw carrier data has invalid kind or raw payload")
    if not isinstance(data["nodes"], list):
        raise ValueError("raw carrier nodes must be a list")

    nodes: list[RawCarrierNode] = []
    for node_data in data["nodes"]:
        if not isinstance(node_data, dict) or set(node_data) != {"id", "start", "end"}:
            raise ValueError("raw carrier node must contain exactly id, start and end")
        if not isinstance(node_data["id"], int) or isinstance(node_data["id"], bool):
            raise ValueError("raw carrier node id must be an integer")
        nodes.append(
            RawCarrierNode(
                id=node_data["id"],
                start=_ref_from_data(node_data["start"]),
                end=_ref_from_data(node_data["end"]),
            )
        )

    return RawCarrierDescription(
        raw=data["raw"],
        nodes=tuple(nodes),
        root=_ref_from_data(data["root"]),
    )


def _validate_ref(ref: RawCarrierRef, available_nodes: int) -> None:
    if ref.kind is RawCarrierRefKind.ROLE:
        if ref.role is None or ref.node is not None:
            raise ValueError("raw carrier role reference must contain only a role")
        return

    if ref.node is None or ref.role is not None:
        raise ValueError("raw carrier node reference must contain only a node position")
    if ref.node < 0 or ref.node >= available_nodes:
        raise ValueError("raw carrier node reference must target an earlier node")


def _ref_from_data(data: object) -> RawCarrierRef:
    if not isinstance(data, dict):
        raise ValueError("raw carrier reference must be an object")
    if set(data) == {"role"} and isinstance(data["role"], str):
        try:
            return RawCarrierRef.role_ref(RawCarrierRole(data["role"]))
        except ValueError as exc:
            raise ValueError("unknown raw carrier role") from exc
    if (
        set(data) == {"node"}
        and isinstance(data["node"], int)
        and not isinstance(data["node"], bool)
    ):
        return RawCarrierRef.node_ref(data["node"])
    raise ValueError("raw carrier reference must contain exactly one role or node")


def _ref_to_data(ref: RawCarrierRef) -> dict:
    if ref.kind is RawCarrierRefKind.ROLE:
        return {"role": ref.role.value if ref.role is not None else None}
    return {"node": ref.node}


def _role_for_abit(abit: Abit) -> RawCarrierRole:
    return _ROLE_FOR_ABIT[abit]


_ROLE_FOR_ABIT = {
    Abit.OPEN: RawCarrierRole.OPEN,
    Abit.CLOSE: RawCarrierRole.CLOSE,
    Abit.LINK: RawCarrierRole.LINK,
    Abit.UNLINK: RawCarrierRole.UNLINK,
}
_ABIT_FOR_ROLE = {role: abit.value for abit, role in _ROLE_FOR_ABIT.items()}
