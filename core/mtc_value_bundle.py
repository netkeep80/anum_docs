"""Reference core for the *candidate* flat ValueBundle v0.2 semantics.

This module is intentionally not wired into the accepted MTS interpreter yet.
It provides one executable candidate implementation for the versioned
``mts-value-bundle/v0.2`` contract:

* static elaboration of curly syntax into ConstraintBundle or ValueBundle;
* flat ValueBundle resolution and tagged value comparison;
* read-only expansion queries over an explicit query-memory protocol.

No function here can realize or delete links.
"""

from collections.abc import Callable
from dataclasses import dataclass
from enum import Enum
from typing import Protocol, TypeAlias

from core.mtc_ast import (
    BundleForm,
    Definition,
    EndProjection,
    Equality,
    Expression,
    Form,
    Inequality,
    Inversion,
    Judgment,
    LinkForm,
    RoundForm,
    Sequence,
    SquareForm,
    StartProjection,
)


LinkRef: TypeAlias = int
OccurrencePath: TypeAlias = tuple[int, ...]
FormResolver: TypeAlias = Callable[[Form, OccurrencePath], LinkRef]


class BundleRole(str, Enum):
    CONSTRAINT = "ConstraintBundle"
    VALUE = "ValueBundle"


class ExpectedRole(str, Enum):
    NONE = "none"
    CONSTRAINT = "constraint"
    VALUE = "value"
    SCALAR = "scalar"
    DEFINITION_RHS = "definition-rhs"


class BundleElaborationError(ValueError):
    def __init__(self, code: str, path: OccurrencePath):
        super().__init__(f"{code} at {path}")
        self.code = code
        self.path = path


class BundleEvaluationError(ValueError):
    pass


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
class ResolvedOccurrence:
    path: OccurrencePath
    link: LinkRef


@dataclass(frozen=True)
class LinkValue:
    identity: LinkRef


@dataclass(frozen=True)
class BundleValue:
    identities: tuple[LinkRef, ...]
    occurrences: tuple[ResolvedOccurrence, ...] = ()


MtsValue: TypeAlias = LinkValue | BundleValue


class BundleQueryMemory(Protocol):
    """Read-only memory surface needed by bundle expansion."""

    def find_link(self, start: LinkRef, end: LinkRef) -> LinkRef | None: ...

    def outgoing(self, start: LinkRef) -> tuple[LinkRef, ...]: ...

    def incoming(self, end: LinkRef) -> tuple[LinkRef, ...]: ...

    def all_links(self) -> tuple[LinkRef, ...]: ...


def elaborate_bundles(
    expression: Expression,
    *,
    entry: ExpectedRole = ExpectedRole.NONE,
) -> BundleElaboration:
    """Statically elaborate curly syntax without consulting runtime memory."""

    roles: list[BundleRoleAt] = []
    _elaborate_expression(expression, (), entry, roles)
    return BundleElaboration(tuple(roles))


def evaluate_flat_value_bundle(
    bundle: BundleForm,
    *,
    path: OccurrencePath,
    elaboration: BundleElaboration,
    resolve_form: FormResolver,
) -> BundleValue:
    """Resolve every flat ValueBundle element independently, then deduplicate.

    Source occurrence provenance remains ordered and complete. Semantic bundle
    identity is the sorted unique set of resolved LinkRefs.
    """

    if elaboration.role_at(path) is not BundleRole.VALUE:
        raise BundleEvaluationError(f"bundle at {path} is not elaborated as ValueBundle")

    occurrences: list[ResolvedOccurrence] = []
    for index, item in enumerate(bundle.items):
        if isinstance(item, BundleForm):
            raise BundleEvaluationError("nested ValueBundle is not supported in v0.2 candidate")
        if not isinstance(item, Form) or isinstance(item, Judgment):
            raise BundleEvaluationError("ValueBundle item must be a Form")
        item_path = path + (index,)
        occurrences.append(ResolvedOccurrence(item_path, resolve_form(item, item_path)))

    return BundleValue(
        identities=tuple(sorted({item.link for item in occurrences})),
        occurrences=tuple(occurrences),
    )


def values_equal(left: MtsValue, right: MtsValue) -> bool:
    """Tagged local value equality; there is no singleton bundle coercion."""

    if type(left) is not type(right):
        return False
    if isinstance(left, LinkValue):
        assert isinstance(right, LinkValue)
        return left.identity == right.identity
    assert isinstance(left, BundleValue) and isinstance(right, BundleValue)
    return left.identities == right.identities


def expand_bundle_query(
    sequence: Sequence,
    *,
    path: OccurrencePath,
    elaboration: BundleElaboration,
    resolve_form: FormResolver,
    memory: BundleQueryMemory,
) -> BundleValue:
    """Evaluate a two-endpoint bundle expansion as a read-only L4 query."""

    if len(sequence.items) != 2:
        raise BundleEvaluationError("bundle expansion requires exactly two endpoints in v0.2 candidate")

    left_expr, right_expr = sequence.items
    if not isinstance(left_expr, BundleForm) and not isinstance(right_expr, BundleForm):
        raise BundleEvaluationError("bundle expansion requires at least one ValueBundle operand")

    left = _endpoint_domain(
        left_expr,
        path + (0,),
        elaboration=elaboration,
        resolve_form=resolve_form,
    )
    right = _endpoint_domain(
        right_expr,
        path + (1,),
        elaboration=elaboration,
        resolve_form=resolve_form,
    )

    if left is None and right is None:
        identities = set(memory.all_links())
    elif left is None:
        assert right is not None
        identities = {ref for end in right for ref in memory.incoming(end)}
    elif right is None:
        identities = {ref for start in left for ref in memory.outgoing(start)}
    else:
        identities = set()
        for start in left:
            for end in right:
                ref = memory.find_link(start, end)
                if ref is not None:
                    identities.add(ref)

    return BundleValue(identities=tuple(sorted(identities)))


def _intrinsic_bundle_evidence(bundle: BundleForm) -> str | None:
    evidence: set[str] = set()
    for item in bundle.items:
        if isinstance(item, BundleForm):
            child = _intrinsic_bundle_evidence(item)
            if child is not None:
                evidence.add(child)
        elif isinstance(item, Judgment):
            evidence.add("constraint")
        elif isinstance(item, Form):
            evidence.add("value")
        else:
            raise BundleElaborationError("unsupported-bundle-item", ())

    if len(evidence) > 1:
        return "mixed"
    return next(iter(evidence), None)


def _contains_bundle(expression: Expression) -> bool:
    if isinstance(expression, BundleForm):
        return True
    if isinstance(expression, Sequence):
        return any(_contains_bundle(item) for item in expression.items)
    if isinstance(expression, LinkForm):
        return _contains_bundle(expression.left) or _contains_bundle(expression.right)
    if isinstance(expression, (StartProjection, EndProjection, Inversion)):
        return _contains_bundle(expression.value)
    if isinstance(expression, RoundForm) and expression.content is not None:
        return _contains_bundle(expression.content)
    return False


def _elaborate_bundle(
    bundle: BundleForm,
    path: OccurrencePath,
    expected: ExpectedRole,
    roles: list[BundleRoleAt],
) -> None:
    evidence = _intrinsic_bundle_evidence(bundle)
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

    if role is BundleRole.VALUE and any(isinstance(item, BundleForm) for item in bundle.items):
        raise BundleElaborationError("nested-value-bundle-not-supported", path)

    roles.append(BundleRoleAt(path, role))
    child_expected = (
        ExpectedRole.CONSTRAINT if role is BundleRole.CONSTRAINT else ExpectedRole.SCALAR
    )
    for index, item in enumerate(bundle.items):
        _elaborate_expression(item, path + (index,), child_expected, roles)


def _elaborate_expression(
    expression: Expression,
    path: OccurrencePath,
    expected: ExpectedRole,
    roles: list[BundleRoleAt],
) -> None:
    if isinstance(expression, BundleForm):
        _elaborate_bundle(expression, path, expected, roles)
        return

    if isinstance(expression, Definition):
        if expected in {ExpectedRole.SCALAR, ExpectedRole.VALUE, ExpectedRole.CONSTRAINT}:
            raise BundleElaborationError("expression-role-mismatch", path)
        _elaborate_expression(expression.target, path + (0,), ExpectedRole.SCALAR, roles)
        _elaborate_expression(
            expression.value,
            path + (1,),
            ExpectedRole.DEFINITION_RHS,
            roles,
        )
        return

    if isinstance(expression, (Equality, Inequality)):
        if expected is ExpectedRole.SCALAR:
            raise BundleElaborationError("expression-role-mismatch", path)
        _elaborate_expression(expression.left, path + (0,), ExpectedRole.VALUE, roles)
        _elaborate_expression(expression.right, path + (1,), ExpectedRole.VALUE, roles)
        return

    if isinstance(expression, Sequence):
        if expected is ExpectedRole.CONSTRAINT:
            raise BundleElaborationError("expression-role-mismatch", path)
        if expected is ExpectedRole.SCALAR and _contains_bundle(expression):
            raise BundleElaborationError("bundle-not-supported-in-scalar-operator", path)
        if expected is ExpectedRole.DEFINITION_RHS and _contains_bundle(expression):
            raise BundleElaborationError("bundle-valued-definition-deferred", path)
        for index, item in enumerate(expression.items):
            _elaborate_expression(item, path + (index,), ExpectedRole.VALUE, roles)
        return

    if isinstance(expression, LinkForm):
        if expected is ExpectedRole.CONSTRAINT:
            raise BundleElaborationError("expression-role-mismatch", path)
        _elaborate_expression(expression.left, path + (0,), ExpectedRole.SCALAR, roles)
        _elaborate_expression(expression.right, path + (1,), ExpectedRole.SCALAR, roles)
        return

    if isinstance(expression, (StartProjection, EndProjection, Inversion)):
        if expected is ExpectedRole.CONSTRAINT:
            raise BundleElaborationError("expression-role-mismatch", path)
        _elaborate_expression(expression.value, path + (0,), ExpectedRole.SCALAR, roles)
        return

    if isinstance(expression, RoundForm):
        if expected is ExpectedRole.CONSTRAINT:
            raise BundleElaborationError("expression-role-mismatch", path)
        if expression.content is not None:
            _elaborate_expression(expression.content, path + (0,), expected, roles)
        return

    if isinstance(expression, SquareForm):
        if expected is ExpectedRole.CONSTRAINT:
            raise BundleElaborationError("expression-role-mismatch", path)
        return

    if isinstance(expression, Form):
        if expected is ExpectedRole.CONSTRAINT:
            raise BundleElaborationError("expression-role-mismatch", path)
        return

    if isinstance(expression, Judgment):
        if expected is not ExpectedRole.CONSTRAINT:
            raise BundleElaborationError("expression-role-mismatch", path)
        return

    raise BundleElaborationError("unsupported-expression", path)


def _endpoint_domain(
    expression: Form,
    path: OccurrencePath,
    *,
    elaboration: BundleElaboration,
    resolve_form: FormResolver,
) -> frozenset[LinkRef] | None:
    if isinstance(expression, BundleForm):
        value = evaluate_flat_value_bundle(
            expression,
            path=path,
            elaboration=elaboration,
            resolve_form=resolve_form,
        )
        return None if not value.identities else frozenset(value.identities)
    return frozenset({resolve_form(expression, path)})
