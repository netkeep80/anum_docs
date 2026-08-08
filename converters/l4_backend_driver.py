"""Language-neutral L4 backend-driver challenge implementation.

The driver is intentionally thin: it delegates link semantics to the canonical
``AnumMemory`` reference backend and adds only scenario-local symbolic bindings,
normalized observations/errors, and a JSON-shaped request/response boundary.

Raw Anum parsing is *not* part of the driver wire. ``compile_l3_fixture`` is a
runner-side helper used to compile #130 fixtures into accepted storage-neutral
``anum-denotation/v0.2`` structural IR before dispatch to any backend driver.
"""

from collections.abc import Mapping
import json

from core.anum_denotation import (
    AnumDenotation,
    DenotationRef,
    DenotationRefKind,
    canonical_denotation_json,
    denotation_from_data,
)
from core.anum_memory import (
    AnumMemory,
    InvalidInitialGraphError,
    LinkInUseError,
    MissingAnchorError,
    NonStructuralDenotationError,
    UnknownLinkRefError,
)
from core.anum_model import ProjectionContext
from core.anum_parser import parse_raw_quaternary
from core.anum_recursive_denotation import denotate_recursive_anum


PROTOCOL_SCHEMA = "mts-l4-backend-driver/v0.3"


class DriverRequestError(ValueError):
    """Protocol-level failure normalized independently of backend exceptions."""

    def __init__(self, code: str, message: str = "") -> None:
        super().__init__(message or code)
        self.code = code


class ReferenceL4BackendDriver:
    """Reference protocol adapter over ``AnumMemory``.

    ``seed_handle_assignment`` exists only to challenge handle normalization.
    It is constructor/test harness state and is never accepted through the
    language-neutral request wire.
    """

    CAPABILITIES = {
        "exact-pair": True,
        "incidence": True,
        "explicit-delete": True,
        "atomic-multi-link-realize": True,
        "enumeration": True,
        "persistence": False,
        "crash-recovery": False,
    }

    def __init__(
        self,
        seed_handle_assignment: Mapping[str, int] | None = None,
    ) -> None:
        self._seed_handle_assignment = (
            dict(seed_handle_assignment) if seed_handle_assignment is not None else None
        )
        self._store: AnumMemory | None = None
        self._bindings: dict[str, int] = {}

    def dispatch(self, request: object) -> dict:
        """Execute one JSON-shaped request and return a normalized response."""

        request_id = None
        try:
            if not isinstance(request, dict):
                raise DriverRequestError("invalid-request", "request must be an object")
            request_id = request.get("id")
            if not isinstance(request_id, str) or not request_id:
                raise DriverRequestError("invalid-request", "request id must be a non-empty string")
            if set(request) - {"id", "op", "args"}:
                raise DriverRequestError("invalid-request", "unexpected request fields")
            op = request.get("op")
            if not isinstance(op, str) or not op:
                raise DriverRequestError("invalid-request", "op must be a non-empty string")
            args = request.get("args", {})
            if not isinstance(args, dict):
                raise DriverRequestError("invalid-request", "args must be an object")

            result = self._dispatch_operation(op, args)
            return {"id": request_id, "ok": True, "result": result}
        except DriverRequestError as exc:
            return self._error_response(request_id, exc.code)
        except LinkInUseError:
            return self._error_response(request_id, "link-in-use")
        except MissingAnchorError:
            return self._error_response(request_id, "missing-anchor")
        except NonStructuralDenotationError:
            return self._error_response(request_id, "non-structural-denotation")
        except UnknownLinkRefError:
            return self._error_response(request_id, "unknown-link")
        except InvalidInitialGraphError:
            return self._error_response(request_id, "invalid-request")
        except (KeyError, TypeError, ValueError):
            return self._error_response(request_id, "invalid-request")
        except RuntimeError:
            return self._error_response(request_id, "backend-error")

    def _dispatch_operation(self, op: str, args: dict) -> dict:
        if op == "hello":
            self._require_no_args(args)
            return {
                "protocol": PROTOCOL_SCHEMA,
                "capabilities": dict(self.CAPABILITIES),
            }
        if op == "create":
            return self._create(args)
        if op in {"close", "reopen"}:
            raise DriverRequestError("capability-not-supported")

        store = self._require_store()
        if op == "snapshot":
            self._require_no_args(args)
            return {"links": self._normalized_snapshot(store)}
        if op == "poles":
            ref = self._bound_ref(self._required_name(args, "ref"))
            self._require_exact_fields(args, {"ref"})
            start, end = store.poles(ref)
            return {"poles": [self._normalized_name(start), self._normalized_name(end)]}
        if op == "find_link":
            self._require_exact_fields(args, {"start", "end"})
            start = self._bound_ref(self._required_name(args, "start"))
            end = self._bound_ref(self._required_name(args, "end"))
            found = store.find_link(start, end)
            return {"ref": None if found is None else self._normalized_name(found)}
        if op == "outgoing":
            self._require_exact_fields(args, {"ref"})
            ref = self._bound_ref(self._required_name(args, "ref"))
            return {"refs": sorted(self._normalized_name(item) for item in store.outgoing(ref))}
        if op == "incoming":
            self._require_exact_fields(args, {"ref"})
            ref = self._bound_ref(self._required_name(args, "ref"))
            return {"refs": sorted(self._normalized_name(item) for item in store.incoming(ref))}
        if op == "all_links":
            self._require_no_args(args)
            return {"refs": sorted(self._normalized_name(item) for item in store.all_links())}
        if op == "realize_link":
            self._require_exact_fields(args, {"start", "end", "bind"})
            start = self._bound_ref(self._required_name(args, "start"))
            end = self._bound_ref(self._required_name(args, "end"))
            bind = self._required_name(args, "bind")
            ref = store.intern_link(start, end)
            self._bind(bind, ref)
            return {"ref": bind}
        if op == "realize_structural_denotation":
            return self._realize_structural_denotation(store, args)
        if op == "delete_link":
            self._require_exact_fields(args, {"ref"})
            store.delete_link(self._bound_ref(self._required_name(args, "ref")))
            return {}
        raise DriverRequestError("invalid-request", f"unknown operation: {op}")

    def _create(self, args: dict) -> dict:
        self._require_exact_fields(args, {"seedGraph"})
        seed_graph = args["seedGraph"]
        if not isinstance(seed_graph, dict) or set(seed_graph) != {"links"}:
            raise DriverRequestError("invalid-request", "seedGraph must contain only links")
        links = seed_graph["links"]
        if not isinstance(links, dict) or not links:
            raise DriverRequestError("invalid-request", "seed links must be a non-empty object")

        names = list(links)
        assignment = self._seed_handle_assignment
        if assignment is None:
            assignment = {name: index for index, name in enumerate(names)}
        if set(assignment) != set(names):
            raise DriverRequestError(
                "invalid-request", "seed handle assignment must cover seed names exactly"
            )
        if any(
            not isinstance(value, int) or isinstance(value, bool) or value < 0
            for value in assignment.values()
        ) or len(set(assignment.values())) != len(assignment):
            raise DriverRequestError("invalid-request", "seed handles must be distinct non-negative integers")

        initial: dict[int, tuple[int, int]] = {}
        for name, record in links.items():
            if not isinstance(record, dict) or set(record) != {"start", "end"}:
                raise DriverRequestError("invalid-request", "seed link must contain start/end")
            start = record["start"]
            end = record["end"]
            if start not in assignment or end not in assignment:
                raise DriverRequestError("invalid-request", "seed link points outside symbolic graph")
            initial[assignment[name]] = (assignment[start], assignment[end])

        self._store = AnumMemory(initial_links=initial)
        self._bindings = dict(assignment)
        return {"created": True}

    def _realize_structural_denotation(self, store: AnumMemory, args: dict) -> dict:
        self._require_exact_fields(
            args,
            {"denotation", "anchors", "nodeBindings", "bind"},
        )
        denotation_data = args["denotation"]
        if not isinstance(denotation_data, dict):
            raise DriverRequestError("invalid-request", "denotation must be an object")
        # The protocol accepts only storage-neutral IR. Raw/context fixtures belong
        # to the common runner and are forbidden on the driver wire.
        if "sourceRaw" in denotation_data or "context" in denotation_data:
            raise DriverRequestError("invalid-request", "raw/context are not driver inputs")
        denotation = denotation_from_data(denotation_data)
        if denotation.structural is None:
            raise NonStructuralDenotationError("driver requires structural denotation")

        anchors_data = args["anchors"]
        if not isinstance(anchors_data, dict):
            raise DriverRequestError("invalid-request", "anchors must be an object")
        anchor_refs = {
            key: self._bound_ref(name)
            for key, name in anchors_data.items()
            if isinstance(key, str) and isinstance(name, str)
        }
        if len(anchor_refs) != len(anchors_data):
            raise DriverRequestError("invalid-request", "anchor names must be strings")

        node_bindings = args["nodeBindings"]
        if not isinstance(node_bindings, dict):
            raise DriverRequestError("invalid-request", "nodeBindings must be an object")
        expected_node_keys = {str(node.id) for node in denotation.structural.nodes}
        if set(node_bindings) != expected_node_keys or not all(
            isinstance(name, str) and name for name in node_bindings.values()
        ):
            raise DriverRequestError(
                "invalid-request", "nodeBindings must name every structural node exactly"
            )
        root_bind = self._required_name(args, "bind")

        root = store.realize_denotation(denotation, anchor_refs)
        local_nodes: dict[int, int] = {}
        for node in denotation.structural.nodes:
            start = self._resolve_denotation_ref(node.start, anchor_refs, local_nodes)
            end = self._resolve_denotation_ref(node.end, anchor_refs, local_nodes)
            ref = store.find_link(start, end)
            if ref is None:
                raise DriverRequestError(
                    "driver-protocol-error", "realized structural node cannot be found"
                )
            local_nodes[node.id] = ref
            self._bind(node_bindings[str(node.id)], ref)

        resolved_root = self._resolve_denotation_ref(
            denotation.structural.root,
            anchor_refs,
            local_nodes,
        )
        if resolved_root != root:
            raise DriverRequestError("driver-protocol-error", "backend returned wrong denotation root")
        self._bind(root_bind, root)
        return {"ref": root_bind}

    @staticmethod
    def _resolve_denotation_ref(
        ref: DenotationRef,
        anchors: Mapping[str, int],
        local_nodes: Mapping[int, int],
    ) -> int:
        if ref.kind is DenotationRefKind.ANCHOR:
            assert ref.anchor is not None
            return anchors[ref.anchor]
        assert ref.node is not None
        return local_nodes[ref.node]

    def _normalized_snapshot(self, store: AnumMemory) -> list[dict]:
        links: list[dict] = []
        for ref in store.all_links():
            start, end = store.poles(ref)
            links.append(
                {
                    "ref": self._normalized_name(ref),
                    "start": self._normalized_name(start),
                    "end": self._normalized_name(end),
                }
            )
        return sorted(links, key=lambda item: (item["ref"], item["start"], item["end"]))

    def _normalized_name(self, ref: int) -> str:
        names = sorted(name for name, value in self._bindings.items() if value == ref)
        if not names:
            raise DriverRequestError(
                "driver-protocol-error", "live backend handle has no symbolic binding"
            )
        return names[0]

    def _bound_ref(self, name: str) -> int:
        try:
            return self._bindings[name]
        except KeyError as exc:
            raise DriverRequestError("unknown-binding", f"unknown binding: {name}") from exc

    def _bind(self, name: str, ref: int) -> None:
        existing = self._bindings.get(name)
        if existing is not None and existing != ref:
            raise DriverRequestError("binding-conflict", f"binding {name!r} changed handle")
        self._bindings[name] = ref

    def _require_store(self) -> AnumMemory:
        if self._store is None:
            raise DriverRequestError("workspace-not-open")
        return self._store

    @staticmethod
    def _required_name(args: dict, key: str) -> str:
        value = args.get(key)
        if not isinstance(value, str) or not value:
            raise DriverRequestError("invalid-request", f"{key} must be a non-empty string")
        return value

    @staticmethod
    def _require_no_args(args: dict) -> None:
        if args:
            raise DriverRequestError("invalid-request", "operation does not accept args")

    @staticmethod
    def _require_exact_fields(args: dict, expected: set[str]) -> None:
        if set(args) != expected:
            raise DriverRequestError(
                "invalid-request",
                f"expected args {sorted(expected)}, got {sorted(args)}",
            )

    @staticmethod
    def _error_response(request_id: object, code: str) -> dict:
        return {
            "id": request_id if isinstance(request_id, str) else "",
            "ok": False,
            "error": {"code": code},
        }


def compile_l3_fixture(source_raw: str, context: str) -> dict:
    """Compile one #130 raw fixture into canonical structural IR outside driver.

    This helper belongs to the common runner side of the protocol. External
    storage drivers receive its resulting IR object and never ``source_raw`` or
    ``ProjectionContext``.
    """

    try:
        projection_context = ProjectionContext(context)
    except ValueError as exc:
        raise ValueError(f"unsupported fixture context: {context}") from exc
    denotation = denotate_recursive_anum(
        parse_raw_quaternary(source_raw),
        projection_context,
    )
    if denotation.structural is None:
        raise ValueError("driver fixture must compile to structural denotation")
    return json.loads(canonical_denotation_json(denotation))


def canonical_wire_json(value: object) -> str:
    """Deterministic JSON encoding for future JSONL process framing."""

    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )
