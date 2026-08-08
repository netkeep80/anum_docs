"""Canonical read-only definition environment for accepted MTS v0.3 opening semantics.

This module implements only the accepted one-step ``target : expression``
opening relation. It deliberately does not interpret the returned body, assert
an equality, create a proof step, or access associative memory.
"""

from dataclasses import dataclass
from enum import Enum
from typing import TypeAlias

from core.mtc_ast import (
    BundleForm,
    ContextPronoun,
    Definition,
    EndProjection,
    Expression,
    Form,
    Inversion,
    LinkForm,
    Literal,
    RoundForm,
    Sequence,
    SquareForm,
    StartProjection,
    Symbol,
    structural_key,
)


ScopePath: TypeAlias = tuple[int, ...]
TargetKey: TypeAlias = tuple


@dataclass(frozen=True, order=True)
class DefinitionId:
    """Replay-local identity of one successful definition introduction."""

    scope_path: ScopePath
    ordinal: int


@dataclass(frozen=True)
class DefinitionProvenance:
    """Diagnostic provenance; never part of definition identity or lookup."""

    source_path: str | None = None
    line_no: int | None = None


@dataclass(frozen=True)
class DefinitionEntry:
    identity: DefinitionId
    target_key: TargetKey
    definition: Definition
    provenance: DefinitionProvenance


@dataclass(frozen=True)
class DefinitionConflict:
    target_key: TargetKey
    first: DefinitionEntry
    duplicate: Definition
    duplicate_provenance: DefinitionProvenance


class DefinitionRegistrationKind(str, Enum):
    REGISTERED = "registered"
    CONFLICT = "conflict"
    NON_ADDRESSABLE = "non-addressable"


@dataclass(frozen=True)
class DefinitionRegistrationResult:
    kind: DefinitionRegistrationKind
    entry: DefinitionEntry | None = None
    conflict: DefinitionConflict | None = None


class DefinitionLookupKind(str, Enum):
    MATCH = "match"
    NO_MATCH = "no-match"
    CONFLICT = "conflict"
    NON_ADDRESSABLE = "non-addressable"


@dataclass(frozen=True)
class DefinitionLookupResult:
    kind: DefinitionLookupKind
    entry: DefinitionEntry | None = None
    conflict: DefinitionConflict | None = None


@dataclass(frozen=True)
class DefinitionOpeningResult:
    """One accepted opening result; the body is never evaluated here."""

    kind: DefinitionLookupKind
    definition_id: DefinitionId | None = None
    body: Expression | None = None
    provenance: DefinitionProvenance | None = None
    conflict: DefinitionConflict | None = None


class DefinitionEnvironment:
    """Explicit lexical definition scope with deterministic nearest lookup."""

    def __init__(
        self,
        scope_path: ScopePath = (),
        parent: "DefinitionEnvironment | None" = None,
    ) -> None:
        if any(
            not isinstance(item, int) or isinstance(item, bool) or item < 0
            for item in scope_path
        ):
            raise ValueError("definition scope path must contain non-negative integers")
        if parent is None:
            if scope_path:
                raise ValueError("root definition scope path must be empty")
        else:
            if not scope_path or scope_path[:-1] != parent.scope_path:
                raise ValueError("child definition scope path must extend parent by one index")
            sibling_index = scope_path[-1]
            if sibling_index in parent._children:
                raise ValueError(
                    f"definition child scope already exists: {scope_path!r}"
                )

        self.scope_path = scope_path
        self.parent = parent
        self._entries: dict[TargetKey, DefinitionEntry] = {}
        self._conflicts: dict[TargetKey, DefinitionConflict] = {}
        self._children: dict[int, DefinitionEnvironment] = {}
        self._next_ordinal = 0

        if parent is not None:
            parent._children[scope_path[-1]] = self

    def child(self, index: int) -> "DefinitionEnvironment":
        if not isinstance(index, int) or isinstance(index, bool) or index < 0:
            raise ValueError("definition child index must be a non-negative integer")
        existing = self._children.get(index)
        if existing is not None:
            return existing
        return DefinitionEnvironment(self.scope_path + (index,), self)

    def register(
        self,
        definition: Definition,
        provenance: DefinitionProvenance | None = None,
    ) -> DefinitionRegistrationResult:
        provenance = provenance or DefinitionProvenance()
        key = definition_target_key(definition.target)
        if key is None:
            return DefinitionRegistrationResult(DefinitionRegistrationKind.NON_ADDRESSABLE)

        existing_conflict = self._conflicts.get(key)
        if existing_conflict is not None:
            return DefinitionRegistrationResult(
                DefinitionRegistrationKind.CONFLICT,
                conflict=existing_conflict,
            )

        existing = self._entries.get(key)
        if existing is not None:
            conflict = DefinitionConflict(
                target_key=key,
                first=existing,
                duplicate=definition,
                duplicate_provenance=provenance,
            )
            self._conflicts[key] = conflict
            return DefinitionRegistrationResult(
                DefinitionRegistrationKind.CONFLICT,
                conflict=conflict,
            )

        entry = DefinitionEntry(
            identity=DefinitionId(self.scope_path, self._next_ordinal),
            target_key=key,
            definition=definition,
            provenance=provenance,
        )
        self._next_ordinal += 1
        self._entries[key] = entry
        return DefinitionRegistrationResult(
            DefinitionRegistrationKind.REGISTERED,
            entry=entry,
        )

    def lookup(self, target: Form) -> DefinitionLookupResult:
        key = definition_target_key(target)
        if key is None:
            return DefinitionLookupResult(DefinitionLookupKind.NON_ADDRESSABLE)

        current: DefinitionEnvironment | None = self
        while current is not None:
            conflict = current._conflicts.get(key)
            if conflict is not None:
                return DefinitionLookupResult(
                    DefinitionLookupKind.CONFLICT,
                    conflict=conflict,
                )
            entry = current._entries.get(key)
            if entry is not None:
                return DefinitionLookupResult(DefinitionLookupKind.MATCH, entry=entry)
            current = current.parent
        return DefinitionLookupResult(DefinitionLookupKind.NO_MATCH)

    def entries(self) -> tuple[DefinitionEntry, ...]:
        return tuple(
            sorted(self._entries.values(), key=lambda item: item.identity.ordinal)
        )

    def conflicts(self) -> tuple[DefinitionConflict, ...]:
        return tuple(
            sorted(
                self._conflicts.values(),
                key=lambda item: item.first.identity.ordinal,
            )
        )


def open_definition(
    target: Form,
    environment: DefinitionEnvironment,
) -> DefinitionOpeningResult:
    """Return the exact registered RHS for one visible definition and stop."""

    lookup = environment.lookup(target)
    if lookup.kind is not DefinitionLookupKind.MATCH:
        return DefinitionOpeningResult(
            kind=lookup.kind,
            conflict=lookup.conflict,
        )

    assert lookup.entry is not None
    return DefinitionOpeningResult(
        kind=DefinitionLookupKind.MATCH,
        definition_id=lookup.entry.identity,
        body=lookup.entry.definition.value,
        provenance=lookup.entry.provenance,
    )


def definition_target_key(target: Form) -> TargetKey | None:
    """Return a lookup discriminant for the accepted addressable target subset.

    The structural key is only an implementation discriminant. Returning the
    same key does not assert semantic equality. Occurrence-local/deictic forms
    are rejected before a key is formed so they cannot become global names.
    """

    if not _is_addressable_target(target):
        return None
    key = structural_key(target)
    if not isinstance(key, tuple):
        raise TypeError("addressable definition target must have a tuple structural key")
    return key


def _is_addressable_target(form: Form) -> bool:
    if isinstance(form, (Symbol, Literal)):
        return True
    if isinstance(form, ContextPronoun):
        return False
    if isinstance(form, BundleForm):
        # Accepted v0.2 definitions have scalar Form targets only.
        return False
    if isinstance(form, RoundForm):
        # ``()`` is one of the ten canonical root targets and is addressable.
        return form.content is None or (
            isinstance(form.content, Form) and _is_addressable_target(form.content)
        )
    if isinstance(form, SquareForm):
        # Empty ``[]`` is occurrence-local anonymous form and never a global key.
        return isinstance(form.content, Form) and _is_addressable_target(form.content)
    if isinstance(form, Sequence):
        return bool(form.items) and all(_is_addressable_target(item) for item in form.items)
    if isinstance(form, (StartProjection, EndProjection, Inversion)):
        return _is_addressable_target(form.value)
    if isinstance(form, LinkForm):
        return _is_addressable_target(form.left) and _is_addressable_target(form.right)
    return False
