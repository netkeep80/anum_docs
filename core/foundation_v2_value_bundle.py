"""Rooted ValueBundle challenge for the Foundation-v2 production candidate.

The accepted historical ``mts-value-bundle/v0.2`` core combines two separable
operations behind one typed-AST API:

* static curly-role elaboration; and
* resolved flat bundle values / read-only link expansion.

This module challenges the AST as semantic authority by representing only the
structure observed by those operations. Static replay consumes canonical
``kind-tag -> R-rooted(children...)`` links. Once values are resolved, bundle
semantics consumes only canonical semantic links plus occurrence coordinates.
Source spans, AST object identity and runtime slots are never MTS identity.

The query path reuses :func:`foundation_v2_materialization.find_links`; it never
creates a missing pair. Construction helpers are deliberately untrusted and may
use ``ensure`` before the network is frozen. Trusted replay/query functions are
read-only.
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Iterable, TypeAlias

from .foundation_v2_materialization import find_links
from .rooted_link_network import (
    LinkNetwork,
    LinkNetworkBuilder,
    LinkNetworkError,
    LinkNetworkEvolutionBuilder,
    LinkRef,
    read_rooted_sequence,
)


OccurrencePath: TypeAlias = tuple[int, ...]
Builder: TypeAlias = LinkNetworkBuilder | LinkNetworkEvolutionBuilder


class ValueBundleReplayError(ValueError):
    """Malformed rooted ValueBundle evidence or invalid resolved value input."""


class BundleElaborationError(ValueError):
    """Static role error with the same portable code/path boundary as v0.2."""

    def __init__(self, code: str, path: OccurrencePath):
        super().__init__(f"{code} at {path}")
        self.code = code
        self.path = path


class BundleNodeKind(str, Enum):
    BUNDLE = "bundle"
    DEFINITION = "definition"
    COMPARISON = "comparison"
    SEQUENCE = "sequence"
    LINK = "link"
    UNARY = "unary"
    ROUND = "round"
    SQUARE = "square"
    SCALAR = "scalar"
    JUDGMENT = "judgment"


class BundleRole(str, Enum):
    CONSTRAINT = "ConstraintBundle"
    VALUE = "ValueBundle"


class ExpectedRole(str, Enum):
    NONE = "none"
    CONSTRAINT = "constraint"
    VALUE = "value"
    SCALAR = "scalar"
    DEFINITION_RHS = "definition-rhs"


KIND_ORDER = tuple(BundleNodeKind)
FORM_KINDS = {
    BundleNodeKind.BUNDLE,
    BundleNodeKind.SEQUENCE,
    BundleNodeKind.LINK,
    BundleNodeKind.UNARY,
    BundleNodeKind.ROUND,
    BundleNodeKind.SQUARE,
    BundleNodeKind.SCALAR,
}


@dataclass(frozen=True)
class BundleRoleAt:
    path: OccurrencePath
    role: BundleRole


@dataclass(frozen=True)
class BundleElaboration:
    roles: tuple[BundleRoleAt, ...]

    def role_at(self, path: OccurrencePath) -> BundleRole | None:
        for item in self.roles:
            if item.path == path:
                return item.role
        return None


@dataclass(frozen=True)
class ValueBundleVocabulary:
    """Structurally derived tags for the minimal role skeleton."""

    start_anchor: LinkRef
    end_anchor: LinkRef
    kind_seed: LinkRef
    kind_tags: tuple[LinkRef, ...]

    def tag(self, kind: BundleNodeKind) -> LinkRef:
        return self.kind_tags[KIND_ORDER.index(kind)]


@dataclass(frozen=True)
class ResolvedOccurrence:
    """One resolved source occurrence; path is provenance/checker coordinate only."""

    path: OccurrencePath
    link: LinkRef


@dataclass(frozen=True)
class LinkValue:
    link: LinkRef


@dataclass(frozen=True)
class BundleValue:
    """Extensional semantic set plus separately preserved occurrence evidence."""

    links: frozenset[LinkRef]
    occurrences: tuple[ResolvedOccurrence, ...] = ()


MtsValue: TypeAlias = LinkValue | BundleValue


def build_value_bundle_vocabulary(builder: Builder) -> ValueBundleVocabulary:
    """Construct/reuse role tags outward from the distinguished root."""

    root = builder.ensure_root()
    start_anchor = builder.ensure_start_self_closed(root)
    end_anchor = builder.ensure_end_self_closed(root)
    kind_seed = builder.ensure(start_anchor, end_anchor)

    current = root
    tags: list[LinkRef] = []
    for _kind in KIND_ORDER:
        current = builder.ensure(current, kind_seed)
        tags.append(current)

    return ValueBundleVocabulary(
        start_anchor=start_anchor,
        end_anchor=end_anchor,
        kind_seed=kind_seed,
        kind_tags=tuple(tags),
    )


class BundleRoleSkeletonBuilder:
    """Untrusted helper that materializes a selected static-role skeleton."""

    def __init__(self, builder: Builder, vocabulary: ValueBundleVocabulary) -> None:
        self._builder = builder
        self._vocabulary = vocabulary
        self._root = builder.ensure_root()

    def node(self, kind: BundleNodeKind, children: Iterable[LinkRef] = ()) -> LinkRef:
        if not isinstance(kind, BundleNodeKind):
            raise ValueBundleReplayError("role skeleton kind must be BundleNodeKind")
        child_sequence = self._fold(tuple(children))
        return self._builder.ensure(self._vocabulary.tag(kind), child_sequence)

    def _fold(self, values: tuple[LinkRef, ...]) -> LinkRef:
        current = self._root
        for value in values:
            current = self._builder.ensure(current, value)
        return current


def elaborate_bundle_roles(
    network: LinkNetwork,
    carrier: LinkRef,
    vocabulary: ValueBundleVocabulary,
    *,
    entry: ExpectedRole = ExpectedRole.NONE,
) -> BundleElaboration:
    """Replay static ValueBundle role classification from rooted evidence."""

    if not isinstance(entry, ExpectedRole):
        raise ValueBundleReplayError("entry must be an ExpectedRole")
    _validate_vocabulary(network, vocabulary)
    before = network.snapshot()
    roles: list[BundleRoleAt] = []
    try:
        _elaborate_expression(
            network,
            carrier,
            vocabulary,
            (),
            entry,
            roles,
            set(),
        )
        return BundleElaboration(tuple(roles))
    finally:
        if network.snapshot() != before:
            raise ValueBundleReplayError("bundle role replay mutated the network")


def resolve_flat_bundle(
    network: LinkNetwork,
    occurrences: Iterable[ResolvedOccurrence],
) -> BundleValue:
    """Validate every occurrence independently, then form an extensional set."""

    before = network.snapshot()
    resolved = tuple(occurrences)
    try:
        for occurrence in resolved:
            if not isinstance(occurrence, ResolvedOccurrence):
                raise ValueBundleReplayError("bundle occurrence evidence is malformed")
            network.link(occurrence.link)
        return BundleValue(
            links=frozenset(occurrence.link for occurrence in resolved),
            occurrences=resolved,
        )
    except LinkNetworkError as exc:
        raise ValueBundleReplayError(
            "resolved bundle occurrence is not a link of the selected network"
        ) from exc
    finally:
        if network.snapshot() != before:
            raise ValueBundleReplayError("bundle resolution mutated the network")


def values_equal(left: MtsValue, right: MtsValue) -> bool:
    """Tagged local equality; singleton bundles never coerce to scalar links."""

    if type(left) is not type(right):
        return False
    if isinstance(left, LinkValue):
        assert isinstance(right, LinkValue)
        return left.link is right.link
    assert isinstance(left, BundleValue) and isinstance(right, BundleValue)
    return left.links == right.links


def expand_resolved_bundle_query(
    network: LinkNetwork,
    left: MtsValue,
    right: MtsValue,
) -> BundleValue:
    """Read-only two-endpoint expansion over already-resolved scalar/bundle values."""

    if not isinstance(left, (LinkValue, BundleValue)) or not isinstance(
        right, (LinkValue, BundleValue)
    ):
        raise ValueBundleReplayError("bundle query endpoint has an invalid value kind")
    if not isinstance(left, BundleValue) and not isinstance(right, BundleValue):
        raise ValueBundleReplayError(
            "bundle expansion requires at least one BundleValue endpoint"
        )

    before = network.snapshot()
    try:
        _validate_value_links(network, left)
        _validate_value_links(network, right)
        left_domain = _endpoint_domain(left)
        right_domain = _endpoint_domain(right)

        found: set[LinkRef] = set()
        if left_domain is None and right_domain is None:
            found.update(find_links(network))
        elif left_domain is None:
            assert right_domain is not None
            for end in right_domain:
                found.update(find_links(network, end=end))
        elif right_domain is None:
            for start in left_domain:
                found.update(find_links(network, start=start))
        else:
            for start in left_domain:
                for end in right_domain:
                    found.update(find_links(network, start=start, end=end))

        return BundleValue(links=frozenset(found))
    except LinkNetworkError as exc:
        raise ValueBundleReplayError(
            "bundle query endpoint is not a link of the selected network"
        ) from exc
    finally:
        if network.snapshot() != before:
            raise ValueBundleReplayError("bundle expansion query mutated the network")


def _endpoint_domain(value: MtsValue) -> frozenset[LinkRef] | None:
    if isinstance(value, LinkValue):
        return frozenset({value.link})
    return None if not value.links else value.links


def _validate_value_links(network: LinkNetwork, value: MtsValue) -> None:
    if isinstance(value, LinkValue):
        network.link(value.link)
        return
    for ref in value.links:
        network.link(ref)
    for occurrence in value.occurrences:
        network.link(occurrence.link)


def _elaborate_expression(
    network: LinkNetwork,
    carrier: LinkRef,
    vocabulary: ValueBundleVocabulary,
    path: OccurrencePath,
    expected: ExpectedRole,
    roles: list[BundleRoleAt],
    active: set[LinkRef],
) -> None:
    if carrier in active:
        raise ValueBundleReplayError("bundle role skeleton contains a traversal cycle")
    active.add(carrier)
    try:
        kind, children = _decode_node(network, carrier, vocabulary)
        _validate_arity(kind, children)

        if kind is BundleNodeKind.BUNDLE:
            _elaborate_bundle(
                network,
                children,
                vocabulary,
                path,
                expected,
                roles,
                active,
            )
            return

        if kind is BundleNodeKind.DEFINITION:
            if expected in {
                ExpectedRole.SCALAR,
                ExpectedRole.VALUE,
                ExpectedRole.CONSTRAINT,
            }:
                raise BundleElaborationError("expression-role-mismatch", path)
            _elaborate_expression(
                network,
                children[0],
                vocabulary,
                path + (0,),
                ExpectedRole.SCALAR,
                roles,
                active,
            )
            _elaborate_expression(
                network,
                children[1],
                vocabulary,
                path + (1,),
                ExpectedRole.DEFINITION_RHS,
                roles,
                active,
            )
            return

        if kind is BundleNodeKind.COMPARISON:
            if expected is ExpectedRole.SCALAR:
                raise BundleElaborationError("expression-role-mismatch", path)
            for index, child in enumerate(children):
                _elaborate_expression(
                    network,
                    child,
                    vocabulary,
                    path + (index,),
                    ExpectedRole.VALUE,
                    roles,
                    active,
                )
            return

        if kind is BundleNodeKind.SEQUENCE:
            if expected is ExpectedRole.CONSTRAINT:
                raise BundleElaborationError("expression-role-mismatch", path)
            contains_bundle = any(
                _contains_bundle(network, child, vocabulary, set())
                for child in children
            )
            if expected is ExpectedRole.SCALAR and contains_bundle:
                raise BundleElaborationError(
                    "bundle-not-supported-in-scalar-operator",
                    path,
                )
            if expected is ExpectedRole.DEFINITION_RHS and contains_bundle:
                raise BundleElaborationError("bundle-valued-definition-deferred", path)
            for index, child in enumerate(children):
                _elaborate_expression(
                    network,
                    child,
                    vocabulary,
                    path + (index,),
                    ExpectedRole.VALUE,
                    roles,
                    active,
                )
            return

        if kind is BundleNodeKind.LINK:
            if expected is ExpectedRole.CONSTRAINT:
                raise BundleElaborationError("expression-role-mismatch", path)
            for index, child in enumerate(children):
                _elaborate_expression(
                    network,
                    child,
                    vocabulary,
                    path + (index,),
                    ExpectedRole.SCALAR,
                    roles,
                    active,
                )
            return

        if kind is BundleNodeKind.UNARY:
            if expected is ExpectedRole.CONSTRAINT:
                raise BundleElaborationError("expression-role-mismatch", path)
            _elaborate_expression(
                network,
                children[0],
                vocabulary,
                path + (0,),
                ExpectedRole.SCALAR,
                roles,
                active,
            )
            return

        if kind is BundleNodeKind.ROUND:
            if expected is ExpectedRole.CONSTRAINT:
                raise BundleElaborationError("expression-role-mismatch", path)
            if children:
                _elaborate_expression(
                    network,
                    children[0],
                    vocabulary,
                    path + (0,),
                    expected,
                    roles,
                    active,
                )
            return

        if kind in {BundleNodeKind.SQUARE, BundleNodeKind.SCALAR}:
            if expected is ExpectedRole.CONSTRAINT:
                raise BundleElaborationError("expression-role-mismatch", path)
            return

        if kind is BundleNodeKind.JUDGMENT:
            if expected is not ExpectedRole.CONSTRAINT:
                raise BundleElaborationError("expression-role-mismatch", path)
            return

        raise BundleElaborationError("unsupported-expression", path)
    finally:
        active.remove(carrier)


def _elaborate_bundle(
    network: LinkNetwork,
    children: tuple[LinkRef, ...],
    vocabulary: ValueBundleVocabulary,
    path: OccurrencePath,
    expected: ExpectedRole,
    roles: list[BundleRoleAt],
    active: set[LinkRef],
) -> None:
    evidence = _intrinsic_bundle_evidence(network, children, vocabulary, set())
    if evidence == "mixed":
        raise BundleElaborationError("mixed-bundle-role-evidence", path)

    if expected is ExpectedRole.SCALAR:
        raise BundleElaborationError("bundle-not-supported-in-scalar-operator", path)

    if expected is ExpectedRole.DEFINITION_RHS:
        if evidence == "value":
            raise BundleElaborationError("bundle-valued-definition-deferred", path)
        role = BundleRole.CONSTRAINT
    elif expected is ExpectedRole.CONSTRAINT:
        if evidence == "value":
            raise BundleElaborationError("bundle-role-mismatch", path)
        role = BundleRole.CONSTRAINT
    elif expected is ExpectedRole.VALUE:
        if evidence == "constraint":
            raise BundleElaborationError("bundle-role-mismatch", path)
        role = BundleRole.VALUE
    elif evidence == "constraint":
        role = BundleRole.CONSTRAINT
    elif evidence == "value":
        role = BundleRole.VALUE
    else:
        raise BundleElaborationError("ambiguous-empty-bundle-role", path)

    if role is BundleRole.VALUE:
        for child in children:
            child_kind, _ = _decode_node(network, child, vocabulary)
            if child_kind is BundleNodeKind.BUNDLE:
                raise BundleElaborationError("nested-value-bundle-not-supported", path)

    roles.append(BundleRoleAt(path, role))
    child_expected = (
        ExpectedRole.CONSTRAINT
        if role is BundleRole.CONSTRAINT
        else ExpectedRole.SCALAR
    )
    for index, child in enumerate(children):
        _elaborate_expression(
            network,
            child,
            vocabulary,
            path + (index,),
            child_expected,
            roles,
            active,
        )


def _intrinsic_bundle_evidence(
    network: LinkNetwork,
    children: tuple[LinkRef, ...],
    vocabulary: ValueBundleVocabulary,
    active: set[LinkRef],
) -> str | None:
    evidence: set[str] = set()
    for child in children:
        if child in active:
            raise ValueBundleReplayError("bundle evidence contains a traversal cycle")
        active.add(child)
        try:
            kind, nested = _decode_node(network, child, vocabulary)
            _validate_arity(kind, nested)
            if kind is BundleNodeKind.BUNDLE:
                child_evidence = _intrinsic_bundle_evidence(
                    network,
                    nested,
                    vocabulary,
                    active,
                )
                if child_evidence is not None:
                    evidence.add(child_evidence)
            elif kind in {BundleNodeKind.COMPARISON, BundleNodeKind.JUDGMENT}:
                evidence.add("constraint")
            elif kind in FORM_KINDS:
                evidence.add("value")
            else:
                raise BundleElaborationError("unsupported-bundle-item", ())
        finally:
            active.remove(child)

    if len(evidence) > 1:
        return "mixed"
    return next(iter(evidence), None)


def _contains_bundle(
    network: LinkNetwork,
    carrier: LinkRef,
    vocabulary: ValueBundleVocabulary,
    active: set[LinkRef],
) -> bool:
    if carrier in active:
        raise ValueBundleReplayError("bundle containment evidence contains a traversal cycle")
    active.add(carrier)
    try:
        kind, children = _decode_node(network, carrier, vocabulary)
        _validate_arity(kind, children)
        if kind is BundleNodeKind.BUNDLE:
            return True
        if kind in {
            BundleNodeKind.SEQUENCE,
            BundleNodeKind.LINK,
            BundleNodeKind.UNARY,
        }:
            return any(
                _contains_bundle(network, child, vocabulary, active)
                for child in children
            )
        if kind is BundleNodeKind.ROUND and children:
            return _contains_bundle(network, children[0], vocabulary, active)
        return False
    finally:
        active.remove(carrier)


def _decode_node(
    network: LinkNetwork,
    carrier: LinkRef,
    vocabulary: ValueBundleVocabulary,
) -> tuple[BundleNodeKind, tuple[LinkRef, ...]]:
    try:
        link = network.link(carrier)
        index = vocabulary.kind_tags.index(link.start)
        sequence = read_rooted_sequence(network, link.end)
    except (LinkNetworkError, ValueError) as exc:
        raise ValueBundleReplayError("link is not a rooted ValueBundle role node") from exc
    return KIND_ORDER[index], sequence.values


def _validate_arity(kind: BundleNodeKind, children: tuple[LinkRef, ...]) -> None:
    expected: dict[BundleNodeKind, tuple[int, ...]] = {
        BundleNodeKind.DEFINITION: (2,),
        BundleNodeKind.COMPARISON: (2,),
        BundleNodeKind.LINK: (2,),
        BundleNodeKind.UNARY: (1,),
        BundleNodeKind.ROUND: (0, 1),
        BundleNodeKind.SQUARE: (0,),
        BundleNodeKind.SCALAR: (0,),
        BundleNodeKind.JUDGMENT: (0,),
    }
    if kind is BundleNodeKind.SEQUENCE and len(children) < 2:
        raise ValueBundleReplayError("SEQUENCE role node requires at least two children")
    if kind in expected and len(children) not in expected[kind]:
        raise ValueBundleReplayError(f"{kind.value} role node has invalid child arity")


def _validate_vocabulary(
    network: LinkNetwork,
    vocabulary: ValueBundleVocabulary,
) -> None:
    if len(vocabulary.kind_tags) != len(KIND_ORDER):
        raise ValueBundleReplayError("ValueBundle vocabulary has the wrong kind-tag count")
    refs = (
        vocabulary.start_anchor,
        vocabulary.end_anchor,
        vocabulary.kind_seed,
        *vocabulary.kind_tags,
    )
    if len(set(refs)) != len(refs):
        raise ValueBundleReplayError("ValueBundle vocabulary links must be distinct")

    root = network.root
    try:
        start = network.link(vocabulary.start_anchor)
        end = network.link(vocabulary.end_anchor)
        seed = network.link(vocabulary.kind_seed)
        if start.start is not vocabulary.start_anchor or start.end is not root:
            raise ValueBundleReplayError("invalid ValueBundle start anchor")
        if end.start is not root or end.end is not vocabulary.end_anchor:
            raise ValueBundleReplayError("invalid ValueBundle end anchor")
        if (
            seed.start is not vocabulary.start_anchor
            or seed.end is not vocabulary.end_anchor
        ):
            raise ValueBundleReplayError("invalid ValueBundle kind seed")

        for count, tag in enumerate(vocabulary.kind_tags, start=1):
            sequence = read_rooted_sequence(network, tag)
            if sequence.values != (vocabulary.kind_seed,) * count:
                raise ValueBundleReplayError(
                    "ValueBundle kind tag is not structurally derived from the root"
                )
    except LinkNetworkError as exc:
        raise ValueBundleReplayError("invalid rooted ValueBundle vocabulary") from exc
