"""Foundation-v2 higher-layer state over rooted canonical MTS links.

Contexts, dictionaries, source records and acts are ordinary links. One-sided
self-closure is obtained through the semantic constructor rather than by issuing
a fresh runtime handle and using that handle as identity.

Therefore repeated construction of the same ``S=S⟼e`` form returns the same
semantic link. If two events using that form must be distinguished, the
difference belongs in an explicit history/act structure.
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
    entry: OccurrenceRef
    occurrence: OccurrenceRef
    history_after: OccurrenceRef
    after_scope: OccurrenceRef


@dataclass(frozen=True)
class ScopedDictionaryResolution:
    scope: OccurrenceRef
    form: OccurrenceRef
    occurrences: tuple[OccurrenceRef, ...]


@dataclass(frozen=True)
class LocalRepresentativeResolution:
    member: OccurrenceRef
    representative: OccurrenceRef
    bindings: tuple[OccurrenceRef, ...]


def define_source_occurrence(
    builder: LinkNetworkBuilder,
    content: OccurrenceRef,
) -> OccurrenceRef:
    """Return canonical source form ``S = S ⟼ content``."""

    return builder.ensure_start_self_closed(content)


def define_context(
    builder: LinkNetworkBuilder,
    parent: OccurrenceRef,
    current: OccurrenceRef,
) -> OccurrenceRef:
    """Return canonical context ``K = K ⟼ (parent ⟼ current)``."""

    pair = builder.ensure(parent, current)
    return builder.ensure_start_self_closed(pair)


def current_of_context(network: LinkNetwork, context: OccurrenceRef) -> OccurrenceRef:
    context_link = network.link(context)
    if context_link.start is not context:
        raise FoundationStateError("context is not start-self-closed")
    pair = network.link(context_link.end)
    return pair.end


def parent_of_context(network: LinkNetwork, context: OccurrenceRef) -> OccurrenceRef:
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
    pair = builder.ensure(member, representative)
    binding = builder.ensure(context, pair)
    return pair, binding


def local_representative_resolution(
    network: LinkNetwork,
    context: OccurrenceRef,
    member: OccurrenceRef,
) -> LocalRepresentativeResolution:
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
    return local_representative_resolution(network, context, member).representative


def define_dictionary_scope(
    builder: LinkNetworkBuilder,
    parent_scope: OccurrenceRef,
    local_history: OccurrenceRef,
) -> OccurrenceRef:
    """Return canonical ``D = D ⟼ (parentScope ⟼ localHistory)``."""

    payload = builder.ensure(parent_scope, local_history)
    return builder.ensure_start_self_closed(payload)


def define_dictionary_effect(
    builder: LinkNetworkBuilder,
    before_scope: OccurrenceRef,
    parent_scope: OccurrenceRef,
    history_before: OccurrenceRef,
    source_content: OccurrenceRef,
    form: OccurrenceRef,
) -> DictionaryEffectRefs:
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
    return builder.ensure(container, value)


def has_exact_membership(
    network: LinkNetwork,
    container: OccurrenceRef,
    value: OccurrenceRef,
) -> bool:
    return network.find(container, value) is not None


def define_act_header(
    builder: LinkNetworkBuilder,
    interpreter: OccurrenceRef,
    role_dictionary: OccurrenceRef,
    after_context: OccurrenceRef,
) -> OccurrenceRef:
    """Return canonical ``A = A ⟼ (I ⟼ (D_roles ⟼ K_after))``."""

    pair = builder.ensure(role_dictionary, after_context)
    header = builder.ensure(interpreter, pair)
    return builder.ensure_start_self_closed(header)


def act_header(
    network: LinkNetwork,
    act: OccurrenceRef,
) -> tuple[OccurrenceRef, OccurrenceRef, OccurrenceRef]:
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
    field = builder.ensure(role, value)
    attachment = builder.ensure(act, field)
    return field, attachment


def act_values(
    network: LinkNetwork,
    act: OccurrenceRef,
    role: OccurrenceRef,
) -> tuple[OccurrenceRef, ...]:
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
