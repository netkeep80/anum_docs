"""Foundation-v2 higher-layer state over the canonical MTS link network.

This module adds no semantic fields to :class:`Link`. Contexts, dictionaries,
theories, grammar evidence, local representative relations and interpretation
acts are represented only by ordinary links.

The underlying network is canonical by ordered poles. Construction helpers
therefore use ``ensure`` whenever the requested link is determined entirely by
already-known poles. ``reserve`` + ``define`` remains only where a self-reference
must be established before its own handle can be used as a pole.

Runtime handles are technical access/build coordinates; they are not a third
semantic component of a link and do not authorize duplicate equal-pole links.

The module is storage-neutral and read-only after a network has been frozen.
"""
from __future__ import annotations

from dataclasses import dataclass

from .exact_link_network import LinkNetwork, LinkNetworkBuilder, OccurrenceRef


class FoundationStateError(ValueError):
    """The supplied links do not match the candidate state topology."""


class DictionaryLookupError(FoundationStateError):
    """A scoped dictionary cannot be replayed or resolved consistently."""


class DictionaryConflictError(DictionaryLookupError):
    """One lexical scope contains distinct forms for the same source content."""


class RepresentativeConflictError(FoundationStateError):
    """One local context maps a member to distinct representatives."""


@dataclass(frozen=True)
class DictionaryEffectRefs:
    """Construction handles for one persistent definition effect."""

    entry: OccurrenceRef
    occurrence: OccurrenceRef
    history_after: OccurrenceRef
    after_scope: OccurrenceRef


@dataclass(frozen=True)
class ScopedDictionaryResolution:
    """Visible links supporting one scoped dictionary resolution."""

    scope: OccurrenceRef
    form: OccurrenceRef
    occurrences: tuple[OccurrenceRef, ...]


@dataclass(frozen=True)
class LocalRepresentativeResolution:
    """One-hop representative plus explicit K-attachments supporting it."""

    member: OccurrenceRef
    representative: OccurrenceRef
    bindings: tuple[OccurrenceRef, ...]


def define_source_occurrence(
    builder: LinkNetworkBuilder,
    content: OccurrenceRef,
) -> OccurrenceRef:
    """Create self-referential source record ``S = S ⟼ content``."""

    source = builder.reserve()
    builder.define(source, source, content)
    return source


def define_context(
    builder: LinkNetworkBuilder,
    parent: OccurrenceRef,
    current: OccurrenceRef,
) -> OccurrenceRef:
    """Create context ``K = K ⟼ (parent ⟼ current)``.

    The payload pair is canonical. The outer self-reference requires a reserved
    construction handle because ``K`` is itself one of its poles.
    """

    pair = builder.ensure(parent, current)
    context = builder.reserve()
    builder.define(context, context, pair)
    return context


def current_of_context(network: LinkNetwork, context: OccurrenceRef) -> OccurrenceRef:
    """Resolve ``↑`` from one explicitly selected context."""

    context_link = network.link(context)
    if context_link.start is not context:
        raise FoundationStateError("context is not start-self-closed")
    pair = network.link(context_link.end)
    return pair.end


def parent_of_context(network: LinkNetwork, context: OccurrenceRef) -> OccurrenceRef:
    """Read the explicit parent carried by one context."""

    context_link = network.link(context)
    if context_link.start is not context:
        raise FoundationStateError("context is not start-self-closed")
    pair = network.link(context_link.end)
    return pair.start


def define_local_representative_binding(
    builder: LinkNetworkBuilder,
    context: OccurrenceRef,
    member: OccurrenceRef,
    representative: OccurrenceRef,
) -> tuple[OccurrenceRef, OccurrenceRef]:
    """Ensure ``Pair=member⟼representative`` and ``Binding=K⟼Pair``."""

    pair = builder.ensure(member, representative)
    binding = builder.ensure(context, pair)
    return pair, binding


def local_representative_resolution(
    network: LinkNetwork,
    context: OccurrenceRef,
    member: OccurrenceRef,
) -> LocalRepresentativeResolution:
    """Resolve one local representative value, without alias chaining.

    Under pair-canonical identity one exact ``K ⟼ Pair`` attachment can occur at
    most once. Distinct representative values still conflict. Missing mapping
    falls back to the member itself and has no binding evidence.
    """

    current_of_context(network, context)

    matches: list[tuple[OccurrenceRef, OccurrenceRef]] = []
    for binding_ref in network.refs:
        if binding_ref is context:
            continue
        binding = network.link(binding_ref)
        if binding.start is not context:
            continue
        pair = network.link(binding.end)
        if pair.start is member:
            matches.append((binding_ref, pair.end))

    if not matches:
        return LocalRepresentativeResolution(
            member=member,
            representative=member,
            bindings=(),
        )

    representatives = {representative for _, representative in matches}
    if len(representatives) != 1:
        raise RepresentativeConflictError(
            "context contains distinct local representatives for one member"
        )
    representative = next(iter(representatives))
    return LocalRepresentativeResolution(
        member=member,
        representative=representative,
        bindings=tuple(binding for binding, _ in matches),
    )


def local_representative(
    network: LinkNetwork,
    context: OccurrenceRef,
    member: OccurrenceRef,
) -> OccurrenceRef:
    """Return the one-hop representative of ``member`` in ``K``."""

    return local_representative_resolution(network, context, member).representative


def define_dictionary_scope(
    builder: LinkNetworkBuilder,
    parent_scope: OccurrenceRef,
    local_history: OccurrenceRef,
) -> OccurrenceRef:
    """Create ``D = D ⟼ (parentScope ⟼ localHistory)``.

    In particular ``(R ⟼ R)`` is the already existing root link ``R``; no
    second payload occurrence is created for an empty root/root scope.
    """

    payload = builder.ensure(parent_scope, local_history)
    scope = builder.reserve()
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

    Links whose poles are already known are canonicalized. Trusted replay later
    verifies that the supplied parent/history belong to ``before_scope``.
    """

    entry = builder.ensure(source_content, form)
    occurrence = builder.ensure(before_scope, entry)
    history_after = builder.ensure(history_before, occurrence)
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
    """Return ``(parentScope, localHistory)`` for one dictionary snapshot."""

    if dictionary is network.root:
        raise DictionaryLookupError("root is a dictionary sentinel, not a scope")
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
    """Verify a selected declaration link is the visible scoped resolution."""

    resolution = lookup_scoped_dictionary(network, dictionary, source_content)
    if resolution is None:
        raise DictionaryLookupError("source content is not visible in dictionary")
    if resolution.form is not form:
        raise DictionaryLookupError("visible dictionary form differs from selected form")
    if occurrence not in resolution.occurrences:
        raise DictionaryLookupError(
            "selected declaration is not visible from current dictionary"
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
                "definition is not bound to the exact predecessor snapshot"
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
    """Ensure direct theory/grammar-style membership ``container ⟼ value``."""

    return builder.ensure(container, value)


def has_exact_membership(
    network: LinkNetwork,
    container: OccurrenceRef,
    value: OccurrenceRef,
) -> bool:
    """Check direct G/T-style membership without equality or materialization."""

    return network.find(container, value) is not None


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

    pair = builder.ensure(role_dictionary, after_context)
    header = builder.ensure(interpreter, pair)
    act = builder.reserve()
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
    """Ensure ``field=role⟼value`` and attachment ``act⟼field``."""

    field = builder.ensure(role, value)
    attachment = builder.ensure(act, field)
    return field, attachment


def act_values(
    network: LinkNetwork,
    act: OccurrenceRef,
    role: OccurrenceRef,
) -> tuple[OccurrenceRef, ...]:
    """Read values attached to an act through one role link."""

    values: list[OccurrenceRef] = []
    for attachment_ref in network.refs:
        if attachment_ref is act:
            continue
        attachment = network.link(attachment_ref)
        if attachment.start is not act:
            continue
        field = network.link(attachment.end)
        if field.start is role:
            values.append(field.end)
    return tuple(values)
