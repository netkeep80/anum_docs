"""Foundation-v2 higher-layer state over the exact-occurrence link substrate.

This module deliberately adds no semantic fields to :class:`Link`. Contexts,
dictionaries, theories, grammar evidence and interpretation acts are represented
only by ordinary exact link occurrences. The Python functions below are
construction/read helpers for the candidate topology; their function names are
not MTS ontology.

Foundation-v2 dictionaries use one persistent lexical-scope model. A dictionary
snapshot is start-self-closed and points to ``parentScope ⟼ localHistory``.
Definitions append exact occurrences to that history; lookup replays the explicit
history/parent links rather than consulting a mutable host map.

The module is storage-neutral and read-only after a network has been frozen. It
does not materialize persistent L4 links and does not define Anum sequence
deserialization (tracked separately by issue #242).
"""
from __future__ import annotations

from dataclasses import dataclass

from .exact_link_network import LinkNetwork, LinkNetworkBuilder, OccurrenceRef


class FoundationStateError(ValueError):
    """The supplied exact occurrences do not match the candidate topology."""


class DictionaryLookupError(FoundationStateError):
    """A scoped dictionary cannot be replayed or resolved consistently."""


class DictionaryConflictError(DictionaryLookupError):
    """One lexical scope contains distinct forms for the same source content."""


@dataclass(frozen=True)
class DictionaryEffectRefs:
    """Construction handles for one persistent definition effect."""

    entry: OccurrenceRef
    occurrence: OccurrenceRef
    history_after: OccurrenceRef
    after_scope: OccurrenceRef


@dataclass(frozen=True)
class ScopedDictionaryResolution:
    """Exact visible occurrences supporting one scoped dictionary resolution."""

    scope: OccurrenceRef
    form: OccurrenceRef
    occurrences: tuple[OccurrenceRef, ...]


def define_source_occurrence(
    builder: LinkNetworkBuilder,
    content: OccurrenceRef,
) -> OccurrenceRef:
    """Create exact source occurrence ``S = S ⟼ content``."""

    source = builder.reserve()
    builder.define(source, source, content)
    return source


def define_context(
    builder: LinkNetworkBuilder,
    parent: OccurrenceRef,
    current: OccurrenceRef,
) -> OccurrenceRef:
    """Create persistent context ``K = K ⟼ (parent ⟼ current)``."""

    pair = builder.reserve()
    context = builder.reserve()
    builder.define(pair, parent, current)
    builder.define(context, context, pair)
    return context


def current_of_context(network: LinkNetwork, context: OccurrenceRef) -> OccurrenceRef:
    """Resolve ``↑`` from one explicitly selected exact context occurrence."""

    context_link = network.link(context)
    if context_link.start is not context:
        raise FoundationStateError("context is not start-self-closed")
    pair = network.link(context_link.end)
    return pair.end


def parent_of_context(network: LinkNetwork, context: OccurrenceRef) -> OccurrenceRef:
    """Read the explicit parent carried by one context occurrence."""

    context_link = network.link(context)
    if context_link.start is not context:
        raise FoundationStateError("context is not start-self-closed")
    pair = network.link(context_link.end)
    return pair.start


def define_dictionary_scope(
    builder: LinkNetworkBuilder,
    parent_scope: OccurrenceRef,
    local_history: OccurrenceRef,
) -> OccurrenceRef:
    """Create ``D = D ⟼ (parentScope ⟼ localHistory)``."""

    payload = builder.reserve()
    scope = builder.reserve()
    builder.define(payload, parent_scope, local_history)
    builder.define(scope, scope, payload)
    return scope


def define_dictionary_effect(
    builder: LinkNetworkBuilder,
    before_scope: OccurrenceRef,
    parent_scope: OccurrenceRef,
    history_before: OccurrenceRef,
    source_content: OccurrenceRef,
    form: OccurrenceRef,
) -> DictionaryEffectRefs:
    """Construct one persistent ``:``-style dictionary update.

    The helper is construction-only; trusted replay later verifies that the
    supplied parent/history really belong to ``before_scope``.
    """

    entry = builder.reserve()
    occurrence = builder.reserve()
    history_after = builder.reserve()
    builder.define(entry, source_content, form)
    builder.define(occurrence, before_scope, entry)
    builder.define(history_after, history_before, occurrence)
    after_scope = define_dictionary_scope(builder, parent_scope, history_after)
    return DictionaryEffectRefs(
        entry=entry,
        occurrence=occurrence,
        history_after=history_after,
        after_scope=after_scope,
    )


def read_dictionary_scope(
    network: LinkNetwork,
    dictionary: OccurrenceRef,
) -> tuple[OccurrenceRef, OccurrenceRef]:
    """Return exact ``(parentScope, localHistory)`` for one dictionary snapshot."""

    if dictionary is network.root:
        raise DictionaryLookupError("exact root is a dictionary sentinel, not a scope")
    scope = network.link(dictionary)
    if scope.start is not dictionary:
        raise DictionaryLookupError("dictionary scope is not start-self-closed")
    payload = network.link(scope.end)
    return payload.start, payload.end


def lookup_scoped_dictionary(
    network: LinkNetwork,
    dictionary: OccurrenceRef,
    source_content: OccurrenceRef,
) -> ScopedDictionaryResolution | None:
    """Resolve source content using local-history-first lexical scope semantics."""

    visited_scopes: set[OccurrenceRef] = set()
    current_scope = dictionary
    while current_scope is not network.root:
        if current_scope in visited_scopes:
            raise DictionaryLookupError("dictionary parent cycle")
        visited_scopes.add(current_scope)

        parent, _ = read_dictionary_scope(network, current_scope)
        local = _local_dictionary_matches(network, current_scope, source_content)
        if local:
            forms = {form for _, form in local}
            if len(forms) != 1:
                raise DictionaryConflictError(
                    "dictionary scope contains distinct local forms for one source"
                )
            form = next(iter(forms))
            return ScopedDictionaryResolution(
                scope=current_scope,
                form=form,
                occurrences=tuple(occurrence for occurrence, _ in local),
            )
        current_scope = parent
    return None


def verify_visible_dictionary_occurrence(
    network: LinkNetwork,
    dictionary: OccurrenceRef,
    occurrence: OccurrenceRef,
    source_content: OccurrenceRef,
    form: OccurrenceRef,
) -> None:
    """Verify an exact declaration occurrence is the visible scoped resolution."""

    resolution = lookup_scoped_dictionary(network, dictionary, source_content)
    if resolution is None:
        raise DictionaryLookupError("source content is not visible in dictionary")
    if resolution.form is not form:
        raise DictionaryLookupError("visible dictionary form differs from selected form")
    if occurrence not in resolution.occurrences:
        raise DictionaryLookupError(
            "selected declaration occurrence is not visible from current dictionary"
        )


def _local_dictionary_matches(
    network: LinkNetwork,
    dictionary: OccurrenceRef,
    source_content: OccurrenceRef,
) -> list[tuple[OccurrenceRef, OccurrenceRef]]:
    parent, history = read_dictionary_scope(network, dictionary)
    matches: list[tuple[OccurrenceRef, OccurrenceRef]] = []
    visited_history: set[OccurrenceRef] = set()

    while history is not network.root:
        if history in visited_history:
            raise DictionaryLookupError("dictionary local-history cycle")
        visited_history.add(history)

        cell = network.link(history)
        previous_history = cell.start
        occurrence = cell.end
        occurrence_link = network.link(occurrence)
        before_scope = occurrence_link.start
        entry_ref = occurrence_link.end

        before_parent, before_history = read_dictionary_scope(network, before_scope)
        if before_parent is not parent or before_history is not previous_history:
            raise DictionaryLookupError(
                "definition occurrence is not bound to the exact predecessor snapshot"
            )

        entry = network.link(entry_ref)
        if entry.start is source_content:
            matches.append((occurrence, entry.end))
        history = previous_history

    return matches


def define_membership(
    builder: LinkNetworkBuilder,
    container: OccurrenceRef,
    value: OccurrenceRef,
) -> OccurrenceRef:
    """Create direct theory/grammar-style membership ``container ⟼ value``."""

    membership = builder.reserve()
    builder.define(membership, container, value)
    return membership


def has_exact_membership(
    network: LinkNetwork,
    container: OccurrenceRef,
    value: OccurrenceRef,
) -> bool:
    """Check direct G/T-style membership without equality or materialization."""

    return any(
        network.link(ref).start is container and network.link(ref).end is value
        for ref in network.refs
    )


def define_act_header(
    builder: LinkNetworkBuilder,
    interpreter: OccurrenceRef,
    role_dictionary: OccurrenceRef,
    after_context: OccurrenceRef,
) -> OccurrenceRef:
    """Create Gate-R finite header.

    ``P = D_roles ⟼ K_after``
    ``H = I ⟼ P``
    ``A = A ⟼ H``
    """

    pair = builder.reserve()
    header = builder.reserve()
    act = builder.reserve()
    builder.define(pair, role_dictionary, after_context)
    builder.define(header, interpreter, pair)
    builder.define(act, act, header)
    return act


def act_header(
    network: LinkNetwork,
    act: OccurrenceRef,
) -> tuple[OccurrenceRef, OccurrenceRef, OccurrenceRef]:
    """Return ``(I, D_roles, K_after)`` from the finite structural header."""

    act_link = network.link(act)
    if act_link.start is not act:
        raise FoundationStateError("act is not start-self-closed")
    header = network.link(act_link.end)
    pair = network.link(header.end)
    return header.start, pair.start, pair.end


def define_act_field(
    builder: LinkNetworkBuilder,
    act: OccurrenceRef,
    role: OccurrenceRef,
    value: OccurrenceRef,
) -> tuple[OccurrenceRef, OccurrenceRef]:
    """Create ``field=role⟼value`` and exact attachment ``act⟼field``."""

    field = builder.reserve()
    attachment = builder.reserve()
    builder.define(field, role, value)
    builder.define(attachment, act, field)
    return field, attachment


def act_values(
    network: LinkNetwork,
    act: OccurrenceRef,
    role: OccurrenceRef,
) -> tuple[OccurrenceRef, ...]:
    """Read values attached to an act through one exact role ref."""

    values: list[OccurrenceRef] = []
    for attachment_ref in network.refs:
        if attachment_ref is act:
            # A itself is start-self-closed and therefore also has start == A.
            # It is the finite bootstrap header occurrence, not a role field.
            continue
        attachment = network.link(attachment_ref)
        if attachment.start is not act:
            continue
        field = network.link(attachment.end)
        if field.start is role:
            values.append(field.end)
    return tuple(values)
