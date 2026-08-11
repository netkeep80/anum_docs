"""Trusted proof replay kernels for versioned MTS proof artifacts.

v0.2 deliberately trusts only replay of the accepted read-only contextual
``interpret`` semantics.

The five primitive derivation relations are implemented once as a
version-neutral base replay core. v0.3 packages exactly those five relations;
v0.4 packages the same five plus the accepted finite DefinitionOpeningPath
certificate. No proof version implements proof search, generic composition,
global rewriting, classical inference rules, hidden root injection, or ambient
interpreter/subject access.
"""

from dataclasses import dataclass
import json
from typing import TypeAlias

from core.mtc_ast import Definition, Expression, Form, format_expression
from core.mtc_definitions import (
    DefinitionEnvironment,
    DefinitionId,
    DefinitionLookupKind,
    DefinitionRegistrationKind,
    open_definition,
)
from core.mtc_interpreter import ContextFrame, MemoryView, interpret_constraints
from core.mtc_opening_path import OpeningPathEdge, OpeningPathWitness, verify_opening_path
from core.mtc_parser import parse_formula


# Existing v0.2 public constants remain unchanged for compatibility.
CONTRACT_VERSION = "mts-contract/v0.2"
PROOF_SCHEMA = "mts-proof/v0.2"

CONTRACT_VERSION_V03 = "mts-contract/v0.3"
PROOF_SCHEMA_V03 = "mts-proof/v0.3"


@dataclass(frozen=True)
class ProofContext:
    start: int
    end: int
    parent: "ProofContext | None" = None

    def to_runtime(self) -> ContextFrame:
        return ContextFrame(
            start=self.start,
            end=self.end,
            parent=self.parent.to_runtime() if self.parent is not None else None,
        )


@dataclass(frozen=True)
class DistinguishedLink:
    id: int
    start: int
    end: int


@dataclass(frozen=True, order=True)
class ExpectedSubstitution:
    path: tuple[int, ...]
    link: int


@dataclass(frozen=True, order=True)
class ExpectedAlias:
    path: tuple[int, ...]
    target_path: tuple[int, ...]


@dataclass(frozen=True)
class InterpretProofStep:
    expression: str
    context: ProofContext
    distinguished_memory: tuple[DistinguishedLink, ...] = ()
    symbols: tuple[tuple[str, int], ...] = ()
    expected_success: bool = True
    expected_substitutions: tuple[ExpectedSubstitution, ...] = ()
    expected_aliases: tuple[ExpectedAlias, ...] = ()
    rule: str = "interpret"


@dataclass(frozen=True)
class ProofObject:
    steps: tuple[InterpretProofStep, ...]
    contract_version: str = CONTRACT_VERSION
    schema: str = PROOF_SCHEMA


class ProofMemory(MemoryView):
    """Immutable memory snapshot reconstructed from a proof object."""

    def __init__(self, links: tuple[DistinguishedLink, ...]):
        by_id: dict[int, tuple[int, int]] = {}
        by_poles: dict[tuple[int, int], int] = {}
        for item in links:
            poles = (item.start, item.end)
            if item.id in by_id:
                raise ValueError(f"Duplicate LinkRef in proof memory: {item.id}")
            previous = by_poles.get(poles)
            if previous is not None and previous != item.id:
                raise ValueError(
                    "Ambiguous distinguished Link identity for poles "
                    f"{poles}: {previous} and {item.id}"
                )
            by_id[item.id] = poles
            by_poles[poles] = item.id
        self._by_id = by_id
        self._by_poles = by_poles

    def poles(self, link: int) -> tuple[int, int]:
        return self._by_id[link]

    def find_link(self, start: int, end: int) -> int | None:
        return self._by_poles.get((start, end))

    def find_start_projection(self, form: int) -> int | None:
        for link, poles in self._by_id.items():
            if poles == (link, form):
                return link
        return None

    def find_end_projection(self, form: int) -> int | None:
        for link, poles in self._by_id.items():
            if poles == (form, link):
                return link
        return None


def check_interpret_step(step: InterpretProofStep) -> bool:
    """Replay one claimed interpretation step against an immutable snapshot."""

    if step.rule != "interpret":
        return False

    try:
        expression = parse_formula(step.expression)
        memory = ProofMemory(step.distinguished_memory)
        result = interpret_constraints(
            expression,
            step.context.to_runtime(),
            memory,
            symbols=dict(step.symbols),
        )
    except (KeyError, TypeError, ValueError):
        return False

    substitutions = tuple(
        ExpectedSubstitution(path=hole.path, link=link) for hole, link in result.holes
    )
    aliases = tuple(
        ExpectedAlias(path=hole.path, target_path=target.path)
        for hole, target in result.aliases
    )

    return (
        result.success == step.expected_success
        and substitutions == tuple(sorted(step.expected_substitutions))
        and aliases == tuple(sorted(step.expected_aliases))
    )


def check_proof(proof: ProofObject) -> bool:
    """Independently replay every trusted v0.2 step in a proof object."""

    if proof.schema != PROOF_SCHEMA or proof.contract_version != CONTRACT_VERSION:
        return False
    return all(check_interpret_step(step) for step in proof.steps)


@dataclass(frozen=True)
class DefinitionScopeSnapshot:
    path: tuple[int, ...]
    parent: tuple[int, ...] | None
    definitions: tuple[str, ...]


@dataclass(frozen=True)
class ExpectedDefinitionId:
    scope_path: tuple[int, ...]
    ordinal: int


@dataclass(frozen=True)
class ContextuallySatisfiesJudgment:
    expression: str
    context: ProofContext
    distinguished_memory: tuple[DistinguishedLink, ...] = ()
    symbols: tuple[tuple[str, int], ...] = ()
    expected_substitutions: tuple[ExpectedSubstitution, ...] = ()
    expected_aliases: tuple[ExpectedAlias, ...] = ()
    relation: str = "ContextuallySatisfies"


@dataclass(frozen=True)
class OpensJudgment:
    scopes: tuple[DefinitionScopeSnapshot, ...]
    lookup_scope: tuple[int, ...]
    target: str
    expected_definition_id: ExpectedDefinitionId
    expected_body: str
    relation: str = "Opens"


@dataclass(frozen=True)
class NoVisibleDefinitionJudgment:
    scopes: tuple[DefinitionScopeSnapshot, ...]
    lookup_scope: tuple[int, ...]
    target: str
    relation: str = "NoVisibleDefinition"


@dataclass(frozen=True)
class DefinitionConflictJudgment:
    scopes: tuple[DefinitionScopeSnapshot, ...]
    lookup_scope: tuple[int, ...]
    target: str
    relation: str = "DefinitionConflict"


@dataclass(frozen=True)
class NonAddressableDefinitionTargetJudgment:
    target: str
    relation: str = "NonAddressableDefinitionTarget"


BaseJudgment: TypeAlias = (
    ContextuallySatisfiesJudgment
    | OpensJudgment
    | NoVisibleDefinitionJudgment
    | DefinitionConflictJudgment
    | NonAddressableDefinitionTargetJudgment
)
V03Judgment: TypeAlias = BaseJudgment


@dataclass(frozen=True)
class ProofObjectV03:
    judgments: tuple[V03Judgment, ...]
    contract_version: str = CONTRACT_VERSION_V03
    proof_version: str = PROOF_SCHEMA_V03


def _is_non_negative_int(value: object) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and value >= 0


def _validate_path(path: tuple[int, ...]) -> None:
    if any(not _is_non_negative_int(item) for item in path):
        raise ValueError("path must contain only non-negative integers")


def _parse_definition(source: str) -> Definition:
    value = parse_formula(source)
    if not isinstance(value, Definition):
        raise ValueError("definition scope item must parse as Definition")
    return value


def _parse_definition_target(source: str) -> Form:
    value = parse_formula(f"{source} : __proof_query__")
    if not isinstance(value, Definition):
        raise ValueError("definition target must parse as Form")
    return value.target


def _build_definition_environments(
    scopes: tuple[DefinitionScopeSnapshot, ...],
) -> dict[tuple[int, ...], DefinitionEnvironment]:
    if not scopes:
        raise ValueError("definition environment must contain explicit root scope")

    canonical = tuple(sorted(scopes, key=lambda item: (len(item.path), item.path)))
    if scopes != canonical:
        raise ValueError("definition scopes must use canonical order")

    paths = [scope.path for scope in scopes]
    if len(paths) != len(set(paths)):
        raise ValueError("duplicate definition scope path")

    environments: dict[tuple[int, ...], DefinitionEnvironment] = {}
    for scope in scopes:
        _validate_path(scope.path)
        if scope.parent is not None:
            _validate_path(scope.parent)

        if scope.parent is None:
            if scope.path != () or environments:
                raise ValueError("exactly one root scope must be first")
            environment = DefinitionEnvironment()
        else:
            if not scope.path or scope.path[:-1] != scope.parent:
                raise ValueError("scope path must extend declared parent by one index")
            parent = environments.get(scope.parent)
            if parent is None:
                raise ValueError("definition scope parent must precede child")
            environment = parent.child(scope.path[-1])

        environments[scope.path] = environment
        for source in scope.definitions:
            registration = environment.register(_parse_definition(source))
            if registration.kind not in {
                DefinitionRegistrationKind.REGISTERED,
                DefinitionRegistrationKind.CONFLICT,
                DefinitionRegistrationKind.NON_ADDRESSABLE,
            }:
                raise ValueError("unknown definition registration result")

    if () not in environments:
        raise ValueError("explicit root definition scope is required")
    return environments


def _replay_definition_opening(
    scopes: tuple[DefinitionScopeSnapshot, ...],
    lookup_scope: tuple[int, ...],
    target: str,
):
    _validate_path(lookup_scope)
    environments = _build_definition_environments(scopes)
    environment = environments.get(lookup_scope)
    if environment is None:
        raise ValueError("lookupScope must name a serialized scope")
    return open_definition(_parse_definition_target(target), environment)


def check_contextually_satisfies(judgment: ContextuallySatisfiesJudgment) -> bool:
    """Replay the accepted context-scoped satisfaction relation."""

    if judgment.relation != "ContextuallySatisfies":
        return False
    step = InterpretProofStep(
        expression=judgment.expression,
        context=judgment.context,
        distinguished_memory=judgment.distinguished_memory,
        symbols=judgment.symbols,
        expected_success=True,
        expected_substitutions=judgment.expected_substitutions,
        expected_aliases=judgment.expected_aliases,
    )
    return check_interpret_step(step)


def check_opens(judgment: OpensJudgment) -> bool:
    """Replay one accepted lexical definition opening without evaluating RHS."""

    if judgment.relation != "Opens":
        return False
    try:
        _validate_path(judgment.expected_definition_id.scope_path)
        if not _is_non_negative_int(judgment.expected_definition_id.ordinal):
            return False
        result = _replay_definition_opening(
            judgment.scopes,
            judgment.lookup_scope,
            judgment.target,
        )
    except (KeyError, TypeError, ValueError):
        return False

    if result.kind is not DefinitionLookupKind.MATCH:
        return False
    if result.definition_id is None or result.body is None:
        return False
    return (
        result.definition_id.scope_path == judgment.expected_definition_id.scope_path
        and result.definition_id.ordinal == judgment.expected_definition_id.ordinal
        and format_expression(result.body) == judgment.expected_body
    )


def check_no_visible_definition(judgment: NoVisibleDefinitionJudgment) -> bool:
    if judgment.relation != "NoVisibleDefinition":
        return False
    try:
        result = _replay_definition_opening(
            judgment.scopes,
            judgment.lookup_scope,
            judgment.target,
        )
    except (KeyError, TypeError, ValueError):
        return False
    return result.kind is DefinitionLookupKind.NO_MATCH


def check_definition_conflict(judgment: DefinitionConflictJudgment) -> bool:
    if judgment.relation != "DefinitionConflict":
        return False
    try:
        result = _replay_definition_opening(
            judgment.scopes,
            judgment.lookup_scope,
            judgment.target,
        )
    except (KeyError, TypeError, ValueError):
        return False
    return result.kind is DefinitionLookupKind.CONFLICT


def check_non_addressable_definition_target(
    judgment: NonAddressableDefinitionTargetJudgment,
) -> bool:
    if judgment.relation != "NonAddressableDefinitionTarget":
        return False
    try:
        target = _parse_definition_target(judgment.target)
        result = open_definition(target, DefinitionEnvironment())
    except (KeyError, TypeError, ValueError):
        return False
    return result.kind is DefinitionLookupKind.NON_ADDRESSABLE


def check_base_judgment(judgment: BaseJudgment) -> bool:
    """Replay one of the five primitive accepted derivation relations."""

    if isinstance(judgment, ContextuallySatisfiesJudgment):
        return check_contextually_satisfies(judgment)
    if isinstance(judgment, OpensJudgment):
        return check_opens(judgment)
    if isinstance(judgment, NoVisibleDefinitionJudgment):
        return check_no_visible_definition(judgment)
    if isinstance(judgment, DefinitionConflictJudgment):
        return check_definition_conflict(judgment)
    if isinstance(judgment, NonAddressableDefinitionTargetJudgment):
        return check_non_addressable_definition_target(judgment)
    return False


def check_proof_v03(proof: ProofObjectV03) -> bool:
    """Independently replay every v0.3 base judgment; order has no inference meaning."""

    if (
        proof.proof_version != PROOF_SCHEMA_V03
        or proof.contract_version != CONTRACT_VERSION_V03
    ):
        return False
    return all(check_base_judgment(judgment) for judgment in proof.judgments)


def _require_exact_keys(data: dict, expected: set[str], label: str) -> None:
    if set(data) != expected:
        raise ValueError(f"{label} has unexpected or missing fields")


def _int_from_data(value: object, label: str) -> int:
    if not _is_non_negative_int(value):
        raise ValueError(f"{label} must be a non-negative integer")
    return value


def _path_from_data(value: object, label: str) -> tuple[int, ...]:
    if not isinstance(value, list):
        raise ValueError(f"{label} must be an integer array")
    result = tuple(_int_from_data(item, label) for item in value)
    _validate_path(result)
    return result


def _context_from_data(data: object) -> ProofContext:
    if not isinstance(data, dict):
        raise ValueError("context must be an object")
    _require_exact_keys(data, {"start", "end", "parent"}, "context")
    parent = data["parent"]
    return ProofContext(
        start=_int_from_data(data["start"], "context.start"),
        end=_int_from_data(data["end"], "context.end"),
        parent=_context_from_data(parent) if parent is not None else None,
    )


def _memory_from_data(data: object) -> tuple[DistinguishedLink, ...]:
    if not isinstance(data, list):
        raise ValueError("memory must be an array")
    result: list[DistinguishedLink] = []
    for item in data:
        if not isinstance(item, dict):
            raise ValueError("memory item must be an object")
        _require_exact_keys(item, {"id", "start", "end"}, "memory item")
        result.append(
            DistinguishedLink(
                id=_int_from_data(item["id"], "memory.id"),
                start=_int_from_data(item["start"], "memory.start"),
                end=_int_from_data(item["end"], "memory.end"),
            )
        )
    ProofMemory(tuple(result))
    return tuple(result)


def _symbols_from_data(data: object) -> tuple[tuple[str, int], ...]:
    if not isinstance(data, list):
        raise ValueError("symbols must be an array")
    result: list[tuple[str, int]] = []
    seen: set[str] = set()
    for item in data:
        if not isinstance(item, list) or len(item) != 2:
            raise ValueError("symbol binding must be [name, LinkRef]")
        name, link = item
        if not isinstance(name, str) or not name:
            raise ValueError("symbol name must be a non-empty string")
        if name in seen:
            raise ValueError("duplicate symbol binding")
        seen.add(name)
        result.append((name, _int_from_data(link, "symbol LinkRef")))
    if result != sorted(result):
        raise ValueError("symbol bindings must use deterministic lexical order")
    return tuple(result)


def _substitutions_from_data(data: object) -> tuple[ExpectedSubstitution, ...]:
    if not isinstance(data, list):
        raise ValueError("substitutions must be an array")
    result: list[ExpectedSubstitution] = []
    for item in data:
        if not isinstance(item, dict):
            raise ValueError("substitution must be an object")
        _require_exact_keys(item, {"path", "link"}, "substitution")
        result.append(
            ExpectedSubstitution(
                path=_path_from_data(item["path"], "substitution.path"),
                link=_int_from_data(item["link"], "substitution.link"),
            )
        )
    if result != sorted(result) or len({item.path for item in result}) != len(result):
        raise ValueError("substitutions must be unique and canonically ordered")
    return tuple(result)


def _aliases_from_data(data: object) -> tuple[ExpectedAlias, ...]:
    if not isinstance(data, list):
        raise ValueError("aliases must be an array")
    result: list[ExpectedAlias] = []
    for item in data:
        if not isinstance(item, dict):
            raise ValueError("alias must be an object")
        _require_exact_keys(item, {"path", "targetPath"}, "alias")
        result.append(
            ExpectedAlias(
                path=_path_from_data(item["path"], "alias.path"),
                target_path=_path_from_data(item["targetPath"], "alias.targetPath"),
            )
        )
    if result != sorted(result) or len({item.path for item in result}) != len(result):
        raise ValueError("aliases must be unique and canonically ordered")
    return tuple(result)


def _scopes_from_data(data: object) -> tuple[DefinitionScopeSnapshot, ...]:
    if not isinstance(data, list):
        raise ValueError("scopes must be an array")
    result: list[DefinitionScopeSnapshot] = []
    for item in data:
        if not isinstance(item, dict):
            raise ValueError("scope must be an object")
        _require_exact_keys(item, {"path", "parent", "definitions"}, "scope")
        parent = item["parent"]
        definitions = item["definitions"]
        if not isinstance(definitions, list) or not all(
            isinstance(source, str) for source in definitions
        ):
            raise ValueError("scope definitions must be a string array")
        result.append(
            DefinitionScopeSnapshot(
                path=_path_from_data(item["path"], "scope.path"),
                parent=(
                    _path_from_data(parent, "scope.parent")
                    if parent is not None
                    else None
                ),
                definitions=tuple(definitions),
            )
        )
    scopes = tuple(result)
    _build_definition_environments(scopes)
    return scopes


def _definition_id_from_data(data: object) -> ExpectedDefinitionId:
    if not isinstance(data, dict):
        raise ValueError("definitionId must be an object")
    _require_exact_keys(data, {"scopePath", "ordinal"}, "definitionId")
    return ExpectedDefinitionId(
        scope_path=_path_from_data(data["scopePath"], "definitionId.scopePath"),
        ordinal=_int_from_data(data["ordinal"], "definitionId.ordinal"),
    )


def _base_judgment_from_data(data: object) -> BaseJudgment:
    if not isinstance(data, dict):
        raise ValueError("judgment must be an object")
    relation = data.get("relation")
    if relation == "ContextuallySatisfies":
        _require_exact_keys(
            data,
            {"relation", "expression", "context", "symbols", "memory", "expected"},
            relation,
        )
        if not isinstance(data["expression"], str):
            raise ValueError("expression must be a string")
        expected = data["expected"]
        if not isinstance(expected, dict):
            raise ValueError("expected must be an object")
        _require_exact_keys(expected, {"substitutions", "aliases"}, "expected")
        return ContextuallySatisfiesJudgment(
            expression=data["expression"],
            context=_context_from_data(data["context"]),
            symbols=_symbols_from_data(data["symbols"]),
            distinguished_memory=_memory_from_data(data["memory"]),
            expected_substitutions=_substitutions_from_data(expected["substitutions"]),
            expected_aliases=_aliases_from_data(expected["aliases"]),
        )

    if relation == "Opens":
        _require_exact_keys(
            data,
            {"relation", "scopes", "lookupScope", "target", "expected"},
            relation,
        )
        if not isinstance(data["target"], str):
            raise ValueError("target must be a string")
        expected = data["expected"]
        if not isinstance(expected, dict):
            raise ValueError("expected must be an object")
        _require_exact_keys(expected, {"definitionId", "body"}, "expected")
        if not isinstance(expected["body"], str):
            raise ValueError("expected body must be a string")
        return OpensJudgment(
            scopes=_scopes_from_data(data["scopes"]),
            lookup_scope=_path_from_data(data["lookupScope"], "lookupScope"),
            target=data["target"],
            expected_definition_id=_definition_id_from_data(expected["definitionId"]),
            expected_body=expected["body"],
        )

    if relation in {"NoVisibleDefinition", "DefinitionConflict"}:
        _require_exact_keys(
            data,
            {"relation", "scopes", "lookupScope", "target"},
            str(relation),
        )
        if not isinstance(data["target"], str):
            raise ValueError("target must be a string")
        common = {
            "scopes": _scopes_from_data(data["scopes"]),
            "lookup_scope": _path_from_data(data["lookupScope"], "lookupScope"),
            "target": data["target"],
        }
        if relation == "NoVisibleDefinition":
            return NoVisibleDefinitionJudgment(**common)
        return DefinitionConflictJudgment(**common)

    if relation == "NonAddressableDefinitionTarget":
        _require_exact_keys(data, {"relation", "target"}, relation)
        if not isinstance(data["target"], str):
            raise ValueError("target must be a string")
        return NonAddressableDefinitionTargetJudgment(target=data["target"])

    raise ValueError("unknown base proof relation")


def proof_v03_from_data(data: object) -> ProofObjectV03:
    """Strictly parse one portable mts-proof/v0.3 JSON-shaped artifact."""

    if not isinstance(data, dict):
        raise ValueError("proof must be an object")
    _require_exact_keys(
        data,
        {"proofVersion", "contractVersion", "judgments"},
        "proof",
    )
    if data["proofVersion"] != PROOF_SCHEMA_V03:
        raise ValueError("unsupported proofVersion")
    if data["contractVersion"] != CONTRACT_VERSION_V03:
        raise ValueError("unsupported contractVersion")
    if not isinstance(data["judgments"], list):
        raise ValueError("judgments must be an array")
    return ProofObjectV03(
        judgments=tuple(_base_judgment_from_data(item) for item in data["judgments"]),
    )


def check_proof_v03_data(data: object) -> bool:
    """Strictly parse then independently replay one portable v0.3 artifact."""

    try:
        return check_proof_v03(proof_v03_from_data(data))
    except (KeyError, TypeError, ValueError):
        return False


def _context_to_data(context: ProofContext) -> dict:
    return {
        "start": context.start,
        "end": context.end,
        "parent": _context_to_data(context.parent) if context.parent is not None else None,
    }


def _memory_to_data(memory: tuple[DistinguishedLink, ...]) -> list[dict]:
    return [
        {"id": item.id, "start": item.start, "end": item.end}
        for item in memory
    ]


def _symbols_to_data(symbols: tuple[tuple[str, int], ...]) -> list[list[object]]:
    return [[name, link] for name, link in symbols]


def _substitutions_to_data(
    substitutions: tuple[ExpectedSubstitution, ...],
) -> list[dict]:
    return [{"path": list(item.path), "link": item.link} for item in substitutions]


def _aliases_to_data(aliases: tuple[ExpectedAlias, ...]) -> list[dict]:
    return [
        {"path": list(item.path), "targetPath": list(item.target_path)}
        for item in aliases
    ]


def _scopes_to_data(scopes: tuple[DefinitionScopeSnapshot, ...]) -> list[dict]:
    return [
        {
            "path": list(item.path),
            "parent": list(item.parent) if item.parent is not None else None,
            "definitions": list(item.definitions),
        }
        for item in scopes
    ]


def _base_judgment_to_data(judgment: BaseJudgment) -> dict:
    if isinstance(judgment, ContextuallySatisfiesJudgment):
        return {
            "relation": judgment.relation,
            "expression": judgment.expression,
            "context": _context_to_data(judgment.context),
            "symbols": _symbols_to_data(judgment.symbols),
            "memory": _memory_to_data(judgment.distinguished_memory),
            "expected": {
                "substitutions": _substitutions_to_data(judgment.expected_substitutions),
                "aliases": _aliases_to_data(judgment.expected_aliases),
            },
        }
    if isinstance(judgment, OpensJudgment):
        return {
            "relation": judgment.relation,
            "scopes": _scopes_to_data(judgment.scopes),
            "lookupScope": list(judgment.lookup_scope),
            "target": judgment.target,
            "expected": {
                "definitionId": {
                    "scopePath": list(judgment.expected_definition_id.scope_path),
                    "ordinal": judgment.expected_definition_id.ordinal,
                },
                "body": judgment.expected_body,
            },
        }
    if isinstance(judgment, NoVisibleDefinitionJudgment):
        return {
            "relation": judgment.relation,
            "scopes": _scopes_to_data(judgment.scopes),
            "lookupScope": list(judgment.lookup_scope),
            "target": judgment.target,
        }
    if isinstance(judgment, DefinitionConflictJudgment):
        return {
            "relation": judgment.relation,
            "scopes": _scopes_to_data(judgment.scopes),
            "lookupScope": list(judgment.lookup_scope),
            "target": judgment.target,
        }
    if isinstance(judgment, NonAddressableDefinitionTargetJudgment):
        return {"relation": judgment.relation, "target": judgment.target}
    raise TypeError("unknown base proof judgment")


def proof_v03_to_data(proof: ProofObjectV03) -> dict:
    """Serialize one typed v0.3 proof object to the canonical portable shape."""

    if not check_proof_v03(proof):
        raise ValueError("cannot serialize invalid v0.3 proof object")
    return {
        "proofVersion": proof.proof_version,
        "contractVersion": proof.contract_version,
        "judgments": [_base_judgment_to_data(item) for item in proof.judgments],
    }


def canonical_proof_v03_json(proof: ProofObjectV03) -> str:
    return json.dumps(
        proof_v03_to_data(proof),
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )


# v0.4 adds exactly one accepted composite certificate relation to the same
# version-neutral primitive relation core. Existing v0.2/v0.3 artifact APIs do
# not define or mediate v0.4 semantics.
CONTRACT_VERSION_V04 = "mts-contract/v0.4"
PROOF_SCHEMA_V04 = "mts-proof/v0.4"


@dataclass(frozen=True)
class DefinitionOpeningPathJudgment:
    scopes: tuple[DefinitionScopeSnapshot, ...]
    lookup_scope: tuple[int, ...]
    start_target: Form
    edges: tuple[OpeningPathEdge, ...]
    final_body: Expression
    relation: str = "DefinitionOpeningPath"


V04Judgment: TypeAlias = BaseJudgment | DefinitionOpeningPathJudgment


@dataclass(frozen=True)
class ProofObjectV04:
    judgments: tuple[V04Judgment, ...]
    contract_version: str = CONTRACT_VERSION_V04
    proof_version: str = PROOF_SCHEMA_V04


def _canonical_expression_from_data(value: object, label: str) -> Expression:
    if not isinstance(value, str):
        raise ValueError(f"{label} must be a string")
    expression = parse_formula(value)
    if format_expression(expression) != value:
        raise ValueError(f"{label} must use canonical format_expression transport")
    return expression


def _opening_path_judgment_from_data(data: object) -> DefinitionOpeningPathJudgment:
    if not isinstance(data, dict):
        raise ValueError("DefinitionOpeningPath judgment must be an object")
    _require_exact_keys(
        data,
        {"relation", "scopes", "lookupScope", "startTarget", "edges", "finalBody"},
        "DefinitionOpeningPath",
    )
    if data["relation"] != "DefinitionOpeningPath":
        raise ValueError("invalid DefinitionOpeningPath relation")
    if not isinstance(data["startTarget"], str):
        raise ValueError("startTarget must be a string")
    if not isinstance(data["edges"], list) or not data["edges"]:
        raise ValueError("edges must be a non-empty array")

    edges: list[OpeningPathEdge] = []
    for index, edge_data in enumerate(data["edges"]):
        if not isinstance(edge_data, dict):
            raise ValueError("opening path edge must be an object")
        _require_exact_keys(
            edge_data,
            {"target", "definitionId", "body"},
            "opening path edge",
        )
        if not isinstance(edge_data["target"], str):
            raise ValueError("opening path edge target must be a string")
        expected_id = _definition_id_from_data(edge_data["definitionId"])
        edges.append(
            OpeningPathEdge(
                target=_parse_definition_target(edge_data["target"]),
                definition_id=DefinitionId(
                    expected_id.scope_path,
                    expected_id.ordinal,
                ),
                body=_canonical_expression_from_data(
                    edge_data["body"],
                    f"opening path edge[{index}].body",
                ),
            )
        )

    return DefinitionOpeningPathJudgment(
        scopes=_scopes_from_data(data["scopes"]),
        lookup_scope=_path_from_data(data["lookupScope"], "lookupScope"),
        start_target=_parse_definition_target(data["startTarget"]),
        edges=tuple(edges),
        final_body=_canonical_expression_from_data(data["finalBody"], "finalBody"),
    )


def check_definition_opening_path(judgment: DefinitionOpeningPathJudgment) -> bool:
    """Replay one accepted finite opening-path certificate exactly once."""

    if judgment.relation != "DefinitionOpeningPath":
        return False
    try:
        _validate_path(judgment.lookup_scope)
        environments = _build_definition_environments(judgment.scopes)
        environment = environments.get(judgment.lookup_scope)
        if environment is None:
            return False
        witness = OpeningPathWitness(
            start_target=judgment.start_target,
            edges=judgment.edges,
            final_body=judgment.final_body,
        )
        return verify_opening_path(witness, environment).accepted
    except (KeyError, TypeError, ValueError):
        return False


def check_v04_judgment(judgment: V04Judgment) -> bool:
    if isinstance(judgment, DefinitionOpeningPathJudgment):
        return check_definition_opening_path(judgment)
    return check_base_judgment(judgment)


def check_proof_v04(proof: ProofObjectV04) -> bool:
    """Replay six accepted v0.4 relations; array order has no dependency meaning."""

    if (
        proof.proof_version != PROOF_SCHEMA_V04
        or proof.contract_version != CONTRACT_VERSION_V04
    ):
        return False
    return all(check_v04_judgment(judgment) for judgment in proof.judgments)


def _v04_judgment_from_data(data: object) -> V04Judgment:
    if isinstance(data, dict) and data.get("relation") == "DefinitionOpeningPath":
        return _opening_path_judgment_from_data(data)
    return _base_judgment_from_data(data)


def proof_v04_from_data(data: object) -> ProofObjectV04:
    """Strictly parse one portable mts-proof/v0.4 JSON-shaped artifact."""

    if not isinstance(data, dict):
        raise ValueError("proof must be an object")
    _require_exact_keys(
        data,
        {"proofVersion", "contractVersion", "judgments"},
        "proof",
    )
    if data["proofVersion"] != PROOF_SCHEMA_V04:
        raise ValueError("unsupported proofVersion")
    if data["contractVersion"] != CONTRACT_VERSION_V04:
        raise ValueError("unsupported contractVersion")
    if not isinstance(data["judgments"], list):
        raise ValueError("judgments must be an array")
    return ProofObjectV04(
        judgments=tuple(_v04_judgment_from_data(item) for item in data["judgments"]),
    )


def check_proof_v04_data(data: object) -> bool:
    """Strictly parse then independently replay one portable v0.4 artifact."""

    try:
        return check_proof_v04(proof_v04_from_data(data))
    except (KeyError, TypeError, ValueError):
        return False


def _opening_path_judgment_to_data(judgment: DefinitionOpeningPathJudgment) -> dict:
    return {
        "relation": judgment.relation,
        "scopes": _scopes_to_data(judgment.scopes),
        "lookupScope": list(judgment.lookup_scope),
        "startTarget": format_expression(judgment.start_target),
        "edges": [
            {
                "target": format_expression(edge.target),
                "definitionId": {
                    "scopePath": list(edge.definition_id.scope_path),
                    "ordinal": edge.definition_id.ordinal,
                },
                "body": format_expression(edge.body),
            }
            for edge in judgment.edges
        ],
        "finalBody": format_expression(judgment.final_body),
    }


def _v04_judgment_to_data(judgment: V04Judgment) -> dict:
    if isinstance(judgment, DefinitionOpeningPathJudgment):
        return _opening_path_judgment_to_data(judgment)
    return _base_judgment_to_data(judgment)


def proof_v04_to_data(proof: ProofObjectV04) -> dict:
    """Serialize one valid typed v0.4 proof object to canonical portable data."""

    if not check_proof_v04(proof):
        raise ValueError("cannot serialize invalid v0.4 proof object")
    return {
        "proofVersion": proof.proof_version,
        "contractVersion": proof.contract_version,
        "judgments": [_v04_judgment_to_data(item) for item in proof.judgments],
    }


def canonical_proof_v04_json(proof: ProofObjectV04) -> str:
    return json.dumps(
        proof_v04_to_data(proof),
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )
