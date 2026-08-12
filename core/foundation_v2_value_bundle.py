"""Rooted read-only ValueBundle challenge for the Foundation-v2 candidate.

The accepted historical ``mts-value-bundle/v0.2`` surface mixes four concerns:
static curly-role elaboration, flat value-bundle membership, tagged comparison
and read-only expansion over an explicit memory.  This module factors those
observable operations through rooted structural evidence without importing the
historical AST/parser/interpreter or treating a runtime handle as a third
component of MTS Link identity.

Structural syntax evidence is intentionally minimal.  Operator spelling is not
semantic authority here; only the categories actually observed by the current
elaboration algorithm are represented.  Ordered children are finite R-rooted
sequences.  Resolved bundle members are already-distinguished semantic links in
the same canonical :class:`LinkNetwork`; occurrence paths are checker
coordinates induced by the ordered carrier and are not Link identity.

All replay/query functions are read-only.  Builders exist only for untrusted
challenge fixtures and future producers of explicit evidence.
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Iterable

from .rooted_link_network import (
    LinkNetwork,
    LinkNetworkBuilder,
    LinkNetworkError,
    LinkNetworkEvolutionBuilder,
    LinkRef,
    RootedSequence,
    read_rooted_sequence,
)


class ValueBundleReplayError(ValueError):
    """Malformed skeleton/evidence or a rejected ValueBundle operation."""

    def __init__(self, code: str, path: tuple[int, ...] = ()) -> None:
        super().__init__(f"{code} at {path}")
        self.code = code
        self.path = path


class BundleRole(str, Enum):
    CONSTRAINT = "ConstraintBundle"
    VALUE = "ValueBundle"


class ExpectedRole(str, Enum):
    NONE = "none"
    CONSTRAINT = "constraint"
    VALUE = "value"
    SCALAR = "scalar"
    DEFINITION_RHS = "definition-rhs"


@dataclass(frozen=True)
class BundleRoleAt:
    path: tuple[int, ...]
    role: BundleRole


@dataclass(frozen=True)
class BundleElaboration:
    roles: tuple[BundleRoleAt, ...]

    def role_at(self, path: tuple[int, ...]) -> BundleRole | None:
        for item in self.roles:
            if item.path == path:
                return item.role
        return None


@dataclass(frozen=True)
class ResolvedValueOccurrence:
    path: tuple[int, ...]
    value: LinkRef


@dataclass(frozen=True)
class ScalarValue:
    value: LinkRef


@dataclass(frozen=True)
class BundleValue:
    """Set-valued semantic result plus ordered source-occurrence evidence."""

    members: frozenset[LinkRef]
    occurrences: tuple[ResolvedValueOccurrence, ...] = ()


MtsValue = ScalarValue | BundleValue


@dataclass(frozen=True)
class ValueBundleVocabulary:
    """Canonical role links used by the minimal rooted structural skeleton."""

    bundle_tag: LinkRef
    definition_tag: LinkRef
    comparison_tag: LinkRef
    sequence_tag: LinkRef
    scalar_op_tag: LinkRef
    group_tag: LinkRef
    form_tag: LinkRef
    judgment_tag: LinkRef
    resolved_bundle_tag: LinkRef
    resolved_value_tag: LinkRef
    start_role: LinkRef
    end_role: LinkRef


Builder = LinkNetworkBuilder | LinkNetworkEvolutionBuilder


def build_value_bundle_vocabulary(builder: Builder) -> ValueBundleVocabulary:
    """Construct/reuse a rooted role vocabulary without ID-only distinction."""

    root = builder.ensure_root()
    start_role = builder.ensure_start_self_closed(root)
    end_role = builder.ensure_end_self_closed(root)
    bundle_tag = builder.ensure(start_role, end_role)
    definition_tag = builder.ensure(end_role, start_role)
    comparison_tag = builder.ensure(bundle_tag, definition_tag)
    sequence_tag = builder.ensure(definition_tag, bundle_tag)
    scalar_op_tag = builder.ensure(comparison_tag, sequence_tag)
    group_tag = builder.ensure(sequence_tag, comparison_tag)
    form_tag = builder.ensure(scalar_op_tag, group_tag)
    judgment_tag = builder.ensure(group_tag, scalar_op_tag)
    resolved_bundle_tag = builder.ensure(form_tag, judgment_tag)
    resolved_value_tag = builder.ensure(judgment_tag, form_tag)
    return ValueBundleVocabulary(
        bundle_tag=bundle_tag,
        definition_tag=definition_tag,
        comparison_tag=comparison_tag,
        sequence_tag=sequence_tag,
        scalar_op_tag=scalar_op_tag,
        group_tag=group_tag,
        form_tag=form_tag,
        judgment_tag=judgment_tag,
        resolved_bundle_tag=resolved_bundle_tag,
        resolved_value_tag=resolved_value_tag,
        start_role=start_role,
        end_role=end_role,
    )


class ValueBundleSkeletonBuilder:
    """Construction helper for explicit structural and resolved bundle evidence."""

    def __init__(self, builder: Builder, vocabulary: ValueBundleVocabulary) -> None:
        self._builder = builder
        self._vocabulary = vocabulary
        self._root = builder.ensure_root()

    def form(self) -> LinkRef:
        return self._builder.ensure(self._vocabulary.form_tag, self._root)

    def judgment(self) -> LinkRef:
        return self._builder.ensure(self._vocabulary.judgment_tag, self._root)

    def bundle(self, children: Iterable[LinkRef]) -> LinkRef:
        return self._structural_node(self._vocabulary.bundle_tag, tuple(children))

    def definition(self, target: LinkRef, value: LinkRef) -> LinkRef:
        return self._structural_node(self._vocabulary.definition_tag, (target, value))

    def comparison(self, left: LinkRef, right: LinkRef) -> LinkRef:
        return self._structural_node(self._vocabulary.comparison_tag, (left, right))

    def sequence(self, children: Iterable[LinkRef]) -> LinkRef:
        return self._structural_node(self._vocabulary.sequence_tag, tuple(children))

    def scalar_op(self, children: Iterable[LinkRef]) -> LinkRef:
        return self._structural_node(self._vocabulary.scalar_op_tag, tuple(children))

    def group(self, child: LinkRef | None) -> LinkRef:
        return self._structural_node(
            self._vocabulary.group_tag,
            () if child is None else (child,),
        )

    def resolved_bundle(self, values: Iterable[LinkRef]) -> LinkRef:
        leaves = tuple(
            self._builder.ensure(self._vocabulary.resolved_value_tag, value)
            for value in values
        )
        return self._structural_node(self._vocabulary.resolved_bundle_tag, leaves)

    def _structural_node(self, tag: LinkRef, children: tuple[LinkRef, ...]) -> LinkRef:
        return self._builder.ensure(tag, self._fold(children))

    def _fold(self, values: tuple[LinkRef, ...]) -> LinkRef:
        current = self._root
        for value in values:
            current = self._builder.ensure(current, value)
        return current


def elaborate_bundle_skeleton(
    network: LinkNetwork,
    carrier: LinkRef,
    vocabulary: ValueBundleVocabulary,
    *,
    entry: ExpectedRole = ExpectedRole.NONE,
) -> BundleElaboration:
    """Replay current static bundle-role elaboration over rooted evidence."""

    _validate_vocabulary(network, vocabulary)
    before = network.snapshot()
    roles: list[BundleRoleAt] = []
    try:
        _elaborate(network, carrier, vocabulary, (), entry, roles, set())
    finally:
        if network.snapshot() != before:
            raise ValueBundleReplayError("query-mutated-network")
    return BundleElaboration(tuple(roles))


def evaluate_resolved_bundle(
    network: LinkNetwork,
    carrier: LinkRef,
    vocabulary: ValueBundleVocabulary,
    *,
    path: tuple[int, ...] = (),
) -> BundleValue:
    """Read ordered resolved occurrences and deduplicate semantic membership."""

    _validate_vocabulary(network, vocabulary)
    before = network.snapshot()
    try:
        node = network.link(carrier)
        if node.start is not vocabulary.resolved_bundle_tag:
            raise ValueBundleReplayError("not-resolved-value-bundle", path)
        sequence = _read_sequence(network, node.end, "resolved-bundle-items", path)
        occurrences: list[ResolvedValueOccurrence] = []
        for index, leaf_ref in enumerate(sequence.values):
            leaf = network.link(leaf_ref)
            if leaf.start is not vocabulary.resolved_value_tag:
                raise ValueBundleReplayError("invalid-resolved-value-item", path + (index,))
            occurrences.append(
                ResolvedValueOccurrence(path=path + (index,), value=leaf.end)
            )
        return BundleValue(
            members=frozenset(item.value for item in occurrences),
            occurrences=tuple(occurrences),
        )
    except LinkNetworkError as exc:
        raise ValueBundleReplayError("invalid-resolved-value-bundle", path) from exc
    finally:
        if network.snapshot() != before:
            raise ValueBundleReplayError("query-mutated-network")


def values_equal(left: MtsValue, right: MtsValue) -> bool:
    """Tagged equality: scalar and singleton bundle are never coerced."""

    if type(left) is not type(right):
        return False
    if isinstance(left, ScalarValue):
        assert isinstance(right, ScalarValue)
        return left.value is right.value
    assert isinstance(left, BundleValue) and isinstance(right, BundleValue)
    return left.members == right.members


def expand_bundle_query(
    network: LinkNetwork,
    universe: Iterable[LinkRef],
    left: MtsValue,
    right: MtsValue,
) -> BundleValue:
    """Read existing pairs only, restricted to an explicit semantic query universe."""

    if not isinstance(left, BundleValue) and not isinstance(right, BundleValue):
        raise ValueBundleReplayError("bundle-expansion-requires-bundle")

    before = network.snapshot()
    allowed = frozenset(universe)
    try:
        for ref in allowed:
            network.link(ref)
        left_domain = _endpoint_domain(left)
        right_domain = _endpoint_domain(right)

        if left_domain is None and right_domain is None:
            members = allowed
        elif left_domain is None:
            assert right_domain is not None
            members = frozenset(
                ref for ref in allowed if network.link(ref).end in right_domain
            )
        elif right_domain is None:
            members = frozenset(
                ref for ref in allowed if network.link(ref).start in left_domain
            )
        else:
            found: set[LinkRef] = set()
            for start in left_domain:
                for end in right_domain:
                    ref = network.find(start, end)
                    if ref is not None and ref in allowed:
                        found.add(ref)
            members = frozenset(found)
        return BundleValue(members=members)
    finally:
        if network.snapshot() != before:
            raise ValueBundleReplayError("query-mutated-network")


def _endpoint_domain(value: MtsValue) -> frozenset[LinkRef] | None:
    if isinstance(value, BundleValue):
        return None if not value.members else value.members
    return frozenset({value.value})


def _intrinsic_bundle_evidence(
    network: LinkNetwork,
    carrier: LinkRef,
    vocabulary: ValueBundleVocabulary,
    path: tuple[int, ...],
    active: set[LinkRef],
) -> str | None:
    children = _children(network, carrier, vocabulary, vocabulary.bundle_tag, path)
    evidence: set[str] = set()
    for index, child in enumerate(children.values):
        child_path = path + (index,)
        tag = _tag(network, child)
        if tag is vocabulary.bundle_tag:
            if child in active:
                raise ValueBundleReplayError("skeleton-cycle", child_path)
            active.add(child)
            try:
                nested = _intrinsic_bundle_evidence(
                    network, child, vocabulary, child_path, active
                )
            finally:
                active.remove(child)
            if nested is not None:
                evidence.add(nested)
        elif tag in {vocabulary.comparison_tag, vocabulary.judgment_tag}:
            evidence.add("constraint")
        elif tag in {
            vocabulary.form_tag,
            vocabulary.sequence_tag,
            vocabulary.scalar_op_tag,
            vocabulary.group_tag,
        }:
            evidence.add("value")
        else:
            raise ValueBundleReplayError("unsupported-bundle-item", child_path)

    if len(evidence) > 1:
        return "mixed"
    return next(iter(evidence), None)


def _contains_bundle(
    network: LinkNetwork,
    carrier: LinkRef,
    vocabulary: ValueBundleVocabulary,
    path: tuple[int, ...],
    active: set[LinkRef],
) -> bool:
    tag = _tag(network, carrier)
    if tag is vocabulary.bundle_tag:
        return True
    if tag not in {
        vocabulary.sequence_tag,
        vocabulary.scalar_op_tag,
        vocabulary.group_tag,
    }:
        return False
    if carrier in active:
        raise ValueBundleReplayError("skeleton-cycle", path)
    active.add(carrier)
    try:
        children = _structural_children(network, carrier, tag, path)
        return any(
            _contains_bundle(network, child, vocabulary, path + (index,), active)
            for index, child in enumerate(children.values)
        )
    finally:
        active.remove(carrier)


def _elaborate(
    network: LinkNetwork,
    carrier: LinkRef,
    vocabulary: ValueBundleVocabulary,
    path: tuple[int, ...],
    expected: ExpectedRole,
    roles: list[BundleRoleAt],
    active: set[LinkRef],
) -> None:
    if carrier in active:
        raise ValueBundleReplayError("skeleton-cycle", path)
    active.add(carrier)
    try:
        tag = _tag(network, carrier)

        if tag is vocabulary.bundle_tag:
            evidence = _intrinsic_bundle_evidence(
                network, carrier, vocabulary, path, {carrier}
            )
            if evidence == "mixed":
                raise ValueBundleReplayError("mixed-bundle-role-evidence", path)
            if expected is ExpectedRole.SCALAR:
                raise ValueBundleReplayError("bundle-not-supported-in-scalar-operator", path)
            if expected is ExpectedRole.DEFINITION_RHS:
                if evidence == "value":
                    raise ValueBundleReplayError("bundle-valued-definition-deferred", path)
                role = BundleRole.CONSTRAINT
            elif expected is ExpectedRole.CONSTRAINT:
                if evidence == "value":
                    raise ValueBundleReplayError("bundle-role-mismatch", path)
                role = BundleRole.CONSTRAINT
            elif expected is ExpectedRole.VALUE:
                if evidence == "constraint":
                    raise ValueBundleReplayError("bundle-role-mismatch", path)
                role = BundleRole.VALUE
            elif evidence == "constraint":
                role = BundleRole.CONSTRAINT
            elif evidence == "value":
                role = BundleRole.VALUE
            else:
                raise ValueBundleReplayError("ambiguous-empty-bundle-role", path)

            children = _children(network, carrier, vocabulary, vocabulary.bundle_tag, path)
            if role is BundleRole.VALUE and any(
                _tag(network, item) is vocabulary.bundle_tag for item in children.values
            ):
                raise ValueBundleReplayError("nested-value-bundle-not-supported", path)

            roles.append(BundleRoleAt(path, role))
            child_expected = (
                ExpectedRole.CONSTRAINT
                if role is BundleRole.CONSTRAINT
                else ExpectedRole.SCALAR
            )
            for index, child in enumerate(children.values):
                _elaborate(
                    network,
                    child,
                    vocabulary,
                    path + (index,),
                    child_expected,
                    roles,
                    active,
                )
            return

        if tag is vocabulary.definition_tag:
            if expected in {
                ExpectedRole.SCALAR,
                ExpectedRole.VALUE,
                ExpectedRole.CONSTRAINT,
            }:
                raise ValueBundleReplayError("expression-role-mismatch", path)
            children = _structural_children(network, carrier, tag, path, exact=2)
            _elaborate(
                network,
                children.values[0],
                vocabulary,
                path + (0,),
                ExpectedRole.SCALAR,
                roles,
                active,
            )
            _elaborate(
                network,
                children.values[1],
                vocabulary,
                path + (1,),
                ExpectedRole.DEFINITION_RHS,
                roles,
                active,
            )
            return

        if tag is vocabulary.comparison_tag:
            if expected is ExpectedRole.SCALAR:
                raise ValueBundleReplayError("expression-role-mismatch", path)
            children = _structural_children(network, carrier, tag, path, exact=2)
            for index, child in enumerate(children.values):
                _elaborate(
                    network,
                    child,
                    vocabulary,
                    path + (index,),
                    ExpectedRole.VALUE,
                    roles,
                    active,
                )
            return

        if tag is vocabulary.sequence_tag:
            if expected is ExpectedRole.CONSTRAINT:
                raise ValueBundleReplayError("expression-role-mismatch", path)
            if expected is ExpectedRole.SCALAR and _contains_bundle(
                network, carrier, vocabulary, path, set()
            ):
                raise ValueBundleReplayError("bundle-not-supported-in-scalar-operator", path)
            if expected is ExpectedRole.DEFINITION_RHS and _contains_bundle(
                network, carrier, vocabulary, path, set()
            ):
                raise ValueBundleReplayError("bundle-valued-definition-deferred", path)
            children = _structural_children(network, carrier, tag, path)
            for index, child in enumerate(children.values):
                _elaborate(
                    network,
                    child,
                    vocabulary,
                    path + (index,),
                    ExpectedRole.VALUE,
                    roles,
                    active,
                )
            return

        if tag is vocabulary.scalar_op_tag:
            if expected is ExpectedRole.CONSTRAINT:
                raise ValueBundleReplayError("expression-role-mismatch", path)
            children = _structural_children(network, carrier, tag, path)
            for index, child in enumerate(children.values):
                _elaborate(
                    network,
                    child,
                    vocabulary,
                    path + (index,),
                    ExpectedRole.SCALAR,
                    roles,
                    active,
                )
            return

        if tag is vocabulary.group_tag:
            if expected is ExpectedRole.CONSTRAINT:
                raise ValueBundleReplayError("expression-role-mismatch", path)
            children = _structural_children(network, carrier, tag, path)
            if len(children.values) > 1:
                raise ValueBundleReplayError("invalid-group-arity", path)
            if children.values:
                _elaborate(
                    network,
                    children.values[0],
                    vocabulary,
                    path + (0,),
                    expected,
                    roles,
                    active,
                )
            return

        if tag is vocabulary.form_tag:
            _require_leaf(network, carrier, path)
            if expected is ExpectedRole.CONSTRAINT:
                raise ValueBundleReplayError("expression-role-mismatch", path)
            return

        if tag is vocabulary.judgment_tag:
            _require_leaf(network, carrier, path)
            if expected is not ExpectedRole.CONSTRAINT:
                raise ValueBundleReplayError("expression-role-mismatch", path)
            return

        raise ValueBundleReplayError("unsupported-expression", path)
    except LinkNetworkError as exc:
        raise ValueBundleReplayError("invalid-rooted-skeleton", path) from exc
    finally:
        active.remove(carrier)


def _tag(network: LinkNetwork, carrier: LinkRef) -> LinkRef:
    return network.link(carrier).start


def _require_leaf(
    network: LinkNetwork,
    carrier: LinkRef,
    path: tuple[int, ...],
) -> None:
    if network.link(carrier).end is not network.root:
        raise ValueBundleReplayError("invalid-leaf", path)


def _children(
    network: LinkNetwork,
    carrier: LinkRef,
    vocabulary: ValueBundleVocabulary,
    expected_tag: LinkRef,
    path: tuple[int, ...],
) -> RootedSequence:
    if _tag(network, carrier) is not expected_tag:
        raise ValueBundleReplayError("unexpected-node-tag", path)
    return _read_sequence(network, network.link(carrier).end, "children", path)


def _structural_children(
    network: LinkNetwork,
    carrier: LinkRef,
    expected_tag: LinkRef,
    path: tuple[int, ...],
    *,
    exact: int | None = None,
) -> RootedSequence:
    if _tag(network, carrier) is not expected_tag:
        raise ValueBundleReplayError("unexpected-node-tag", path)
    sequence = _read_sequence(network, network.link(carrier).end, "children", path)
    if exact is not None and len(sequence.values) != exact:
        raise ValueBundleReplayError("invalid-node-arity", path)
    return sequence


def _read_sequence(
    network: LinkNetwork,
    final: LinkRef,
    label: str,
    path: tuple[int, ...],
) -> RootedSequence:
    try:
        return read_rooted_sequence(network, final)
    except LinkNetworkError as exc:
        raise ValueBundleReplayError(f"{label}-not-rooted", path) from exc


def _validate_vocabulary(
    network: LinkNetwork,
    vocabulary: ValueBundleVocabulary,
) -> None:
    refs = tuple(vocabulary.__dict__.values())
    if len(set(refs)) != len(refs):
        raise ValueBundleReplayError("value-bundle-vocabulary-not-distinct")

    root = network.root
    expected = (
        (vocabulary.start_role, vocabulary.start_role, root),
        (vocabulary.end_role, root, vocabulary.end_role),
        (vocabulary.bundle_tag, vocabulary.start_role, vocabulary.end_role),
        (vocabulary.definition_tag, vocabulary.end_role, vocabulary.start_role),
        (vocabulary.comparison_tag, vocabulary.bundle_tag, vocabulary.definition_tag),
        (vocabulary.sequence_tag, vocabulary.definition_tag, vocabulary.bundle_tag),
        (vocabulary.scalar_op_tag, vocabulary.comparison_tag, vocabulary.sequence_tag),
        (vocabulary.group_tag, vocabulary.sequence_tag, vocabulary.comparison_tag),
        (vocabulary.form_tag, vocabulary.scalar_op_tag, vocabulary.group_tag),
        (vocabulary.judgment_tag, vocabulary.group_tag, vocabulary.scalar_op_tag),
        (vocabulary.resolved_bundle_tag, vocabulary.form_tag, vocabulary.judgment_tag),
        (vocabulary.resolved_value_tag, vocabulary.judgment_tag, vocabulary.form_tag),
    )
    try:
        for ref, start, end in expected:
            link = network.link(ref)
            if link.start is not start or link.end is not end:
                raise ValueBundleReplayError("invalid-rooted-value-bundle-vocabulary")
    except LinkNetworkError as exc:
        raise ValueBundleReplayError("invalid-rooted-value-bundle-vocabulary") from exc
