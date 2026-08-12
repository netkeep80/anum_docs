"""Rooted static ValueBundle-role challenge for the Foundation-v2 candidate.

This first P3b slice factors the accepted curly-role elaboration through a
minimal rooted structural skeleton. It deliberately does not import the
historical AST/parser/interpreter and does not yet decide resolved bundle value
or expansion-query representation. Ordered children are finite R-rooted
sequences; occurrence paths are checker coordinates only.
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
        return next((item.role for item in self.roles if item.path == path), None)


@dataclass(frozen=True)
class ValueBundleVocabulary:
    bundle_tag: LinkRef
    definition_tag: LinkRef
    comparison_tag: LinkRef
    sequence_tag: LinkRef
    scalar_op_tag: LinkRef
    group_tag: LinkRef
    form_tag: LinkRef
    judgment_tag: LinkRef
    start_role: LinkRef
    end_role: LinkRef


Builder = LinkNetworkBuilder | LinkNetworkEvolutionBuilder


def build_value_bundle_vocabulary(builder: Builder) -> ValueBundleVocabulary:
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
    return ValueBundleVocabulary(
        bundle_tag=bundle_tag,
        definition_tag=definition_tag,
        comparison_tag=comparison_tag,
        sequence_tag=sequence_tag,
        scalar_op_tag=scalar_op_tag,
        group_tag=group_tag,
        form_tag=form_tag,
        judgment_tag=judgment_tag,
        start_role=start_role,
        end_role=end_role,
    )


class ValueBundleSkeletonBuilder:
    """Untrusted construction helper for explicit structural evidence."""

    def __init__(self, builder: Builder, vocabulary: ValueBundleVocabulary) -> None:
        self._builder = builder
        self._vocabulary = vocabulary
        self._root = builder.ensure_root()

    def form(self) -> LinkRef:
        return self._builder.ensure(self._vocabulary.form_tag, self._root)

    def judgment(self) -> LinkRef:
        return self._builder.ensure(self._vocabulary.judgment_tag, self._root)

    def bundle(self, children: Iterable[LinkRef]) -> LinkRef:
        return self._node(self._vocabulary.bundle_tag, tuple(children))

    def definition(self, target: LinkRef, value: LinkRef) -> LinkRef:
        return self._node(self._vocabulary.definition_tag, (target, value))

    def comparison(self, left: LinkRef, right: LinkRef) -> LinkRef:
        return self._node(self._vocabulary.comparison_tag, (left, right))

    def sequence(self, children: Iterable[LinkRef]) -> LinkRef:
        return self._node(self._vocabulary.sequence_tag, tuple(children))

    def scalar_op(self, children: Iterable[LinkRef]) -> LinkRef:
        return self._node(self._vocabulary.scalar_op_tag, tuple(children))

    def group(self, child: LinkRef | None) -> LinkRef:
        return self._node(self._vocabulary.group_tag, () if child is None else (child,))

    def _node(self, tag: LinkRef, children: tuple[LinkRef, ...]) -> LinkRef:
        current = self._root
        for child in children:
            current = self._builder.ensure(current, child)
        return self._builder.ensure(tag, current)


def elaborate_bundle_skeleton(
    network: LinkNetwork,
    carrier: LinkRef,
    vocabulary: ValueBundleVocabulary,
    *,
    entry: ExpectedRole = ExpectedRole.NONE,
) -> BundleElaboration:
    """Replay accepted v0.2 static role classification without AST authority."""

    _validate_vocabulary(network, vocabulary)
    before = network.snapshot()
    roles: list[BundleRoleAt] = []
    try:
        _elaborate(network, carrier, vocabulary, (), entry, roles, set())
    finally:
        if network.snapshot() != before:
            raise ValueBundleReplayError("query-mutated-network")
    return BundleElaboration(tuple(roles))


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
        tag = network.link(carrier).start
        if tag is vocabulary.bundle_tag:
            evidence = _intrinsic_bundle_evidence(network, carrier, vocabulary, path, {carrier})
            if evidence == "mixed":
                raise ValueBundleReplayError("mixed-bundle-role-evidence", path)
            role = _bundle_role(expected, evidence, path)
            children = _children(network, carrier, tag, path)
            if role is BundleRole.VALUE and any(
                network.link(child).start is vocabulary.bundle_tag
                for child in children.values
            ):
                raise ValueBundleReplayError("nested-value-bundle-not-supported", path)
            roles.append(BundleRoleAt(path, role))
            _walk(
                network,
                children,
                vocabulary,
                path,
                ExpectedRole.CONSTRAINT if role is BundleRole.CONSTRAINT else ExpectedRole.SCALAR,
                roles,
                active,
            )
            return

        if tag is vocabulary.definition_tag:
            if expected in {ExpectedRole.SCALAR, ExpectedRole.VALUE, ExpectedRole.CONSTRAINT}:
                raise ValueBundleReplayError("expression-role-mismatch", path)
            children = _children(network, carrier, tag, path, exact=2)
            _elaborate(network, children.values[0], vocabulary, path + (0,), ExpectedRole.SCALAR, roles, active)
            _elaborate(network, children.values[1], vocabulary, path + (1,), ExpectedRole.DEFINITION_RHS, roles, active)
            return

        if tag is vocabulary.comparison_tag:
            if expected is ExpectedRole.SCALAR:
                raise ValueBundleReplayError("expression-role-mismatch", path)
            _walk(network, _children(network, carrier, tag, path, exact=2), vocabulary, path, ExpectedRole.VALUE, roles, active)
            return

        if tag is vocabulary.sequence_tag:
            if expected is ExpectedRole.CONSTRAINT:
                raise ValueBundleReplayError("expression-role-mismatch", path)
            contains = _contains_bundle(network, carrier, vocabulary, path, set())
            if expected is ExpectedRole.SCALAR and contains:
                raise ValueBundleReplayError("bundle-not-supported-in-scalar-operator", path)
            if expected is ExpectedRole.DEFINITION_RHS and contains:
                raise ValueBundleReplayError("bundle-valued-definition-deferred", path)
            _walk(network, _children(network, carrier, tag, path), vocabulary, path, ExpectedRole.VALUE, roles, active)
            return

        if tag is vocabulary.scalar_op_tag:
            if expected is ExpectedRole.CONSTRAINT:
                raise ValueBundleReplayError("expression-role-mismatch", path)
            _walk(network, _children(network, carrier, tag, path), vocabulary, path, ExpectedRole.SCALAR, roles, active)
            return

        if tag is vocabulary.group_tag:
            if expected is ExpectedRole.CONSTRAINT:
                raise ValueBundleReplayError("expression-role-mismatch", path)
            children = _children(network, carrier, tag, path)
            if len(children.values) > 1:
                raise ValueBundleReplayError("invalid-group-arity", path)
            if children.values:
                _elaborate(network, children.values[0], vocabulary, path + (0,), expected, roles, active)
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


def _walk(
    network: LinkNetwork,
    sequence: RootedSequence,
    vocabulary: ValueBundleVocabulary,
    path: tuple[int, ...],
    expected: ExpectedRole,
    roles: list[BundleRoleAt],
    active: set[LinkRef],
) -> None:
    for index, child in enumerate(sequence.values):
        _elaborate(network, child, vocabulary, path + (index,), expected, roles, active)


def _bundle_role(expected: ExpectedRole, evidence: str | None, path: tuple[int, ...]) -> BundleRole:
    if expected is ExpectedRole.SCALAR:
        raise ValueBundleReplayError("bundle-not-supported-in-scalar-operator", path)
    if expected is ExpectedRole.DEFINITION_RHS:
        if evidence == "value":
            raise ValueBundleReplayError("bundle-valued-definition-deferred", path)
        return BundleRole.CONSTRAINT
    if expected is ExpectedRole.CONSTRAINT:
        if evidence == "value":
            raise ValueBundleReplayError("bundle-role-mismatch", path)
        return BundleRole.CONSTRAINT
    if expected is ExpectedRole.VALUE:
        if evidence == "constraint":
            raise ValueBundleReplayError("bundle-role-mismatch", path)
        return BundleRole.VALUE
    if evidence == "constraint":
        return BundleRole.CONSTRAINT
    if evidence == "value":
        return BundleRole.VALUE
    raise ValueBundleReplayError("ambiguous-empty-bundle-role", path)


def _intrinsic_bundle_evidence(
    network: LinkNetwork,
    carrier: LinkRef,
    vocabulary: ValueBundleVocabulary,
    path: tuple[int, ...],
    active: set[LinkRef],
) -> str | None:
    evidence: set[str] = set()
    for index, child in enumerate(_children(network, carrier, vocabulary.bundle_tag, path).values):
        child_path = path + (index,)
        tag = network.link(child).start
        if tag is vocabulary.bundle_tag:
            if child in active:
                raise ValueBundleReplayError("skeleton-cycle", child_path)
            active.add(child)
            try:
                nested = _intrinsic_bundle_evidence(network, child, vocabulary, child_path, active)
            finally:
                active.remove(child)
            if nested is not None:
                evidence.add(nested)
        elif tag in {vocabulary.comparison_tag, vocabulary.judgment_tag}:
            evidence.add("constraint")
        elif tag in {vocabulary.form_tag, vocabulary.sequence_tag, vocabulary.scalar_op_tag, vocabulary.group_tag}:
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
    tag = network.link(carrier).start
    if tag is vocabulary.bundle_tag:
        return True
    if tag not in {vocabulary.sequence_tag, vocabulary.scalar_op_tag, vocabulary.group_tag}:
        return False
    if carrier in active:
        raise ValueBundleReplayError("skeleton-cycle", path)
    active.add(carrier)
    try:
        return any(
            _contains_bundle(network, child, vocabulary, path + (index,), active)
            for index, child in enumerate(_children(network, carrier, tag, path).values)
        )
    finally:
        active.remove(carrier)


def _children(
    network: LinkNetwork,
    carrier: LinkRef,
    expected_tag: LinkRef,
    path: tuple[int, ...],
    *,
    exact: int | None = None,
) -> RootedSequence:
    link = network.link(carrier)
    if link.start is not expected_tag:
        raise ValueBundleReplayError("unexpected-node-tag", path)
    try:
        sequence = read_rooted_sequence(network, link.end)
    except LinkNetworkError as exc:
        raise ValueBundleReplayError("children-not-rooted", path) from exc
    if exact is not None and len(sequence.values) != exact:
        raise ValueBundleReplayError("invalid-node-arity", path)
    return sequence


def _require_leaf(network: LinkNetwork, carrier: LinkRef, path: tuple[int, ...]) -> None:
    if network.link(carrier).end is not network.root:
        raise ValueBundleReplayError("invalid-leaf", path)


def _validate_vocabulary(network: LinkNetwork, vocabulary: ValueBundleVocabulary) -> None:
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
    )
    try:
        for ref, start, end in expected:
            link = network.link(ref)
            if link.start is not start or link.end is not end:
                raise ValueBundleReplayError("invalid-rooted-value-bundle-vocabulary")
    except LinkNetworkError as exc:
        raise ValueBundleReplayError("invalid-rooted-value-bundle-vocabulary") from exc
