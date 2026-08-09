"""Foundation-v2 higher-layer state over the exact-occurrence link substrate.

This module deliberately adds no semantic fields to :class:`Link`.  Contexts,
dictionaries, theories, grammar evidence and interpretation acts are represented
only by ordinary exact link occurrences.  The Python functions below are
construction/read helpers for the candidate topology; their function names are
not MTS ontology.

The module is intentionally storage-neutral and read-only after a network has
been frozen.  It does not materialize persistent L4 links and does not define
Anum sequence deserialization (tracked separately by issue #242).
"""
from __future__ import annotations

from .exact_link_network import LinkNetwork, LinkNetworkBuilder, OccurrenceRef


class FoundationStateError(ValueError):
    """The supplied exact occurrences do not match the candidate topology."""


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


def define_dictionary_membership(
    builder: LinkNetworkBuilder,
    dictionary: OccurrenceRef,
    source_content: OccurrenceRef,
    form: OccurrenceRef,
) -> tuple[OccurrenceRef, OccurrenceRef]:
    """Create ``entry=source⟼form`` and ``membership=D⟼entry``."""

    entry = builder.reserve()
    membership = builder.reserve()
    builder.define(entry, source_content, form)
    builder.define(membership, dictionary, entry)
    return entry, membership


def dictionary_forms(
    network: LinkNetwork,
    dictionary: OccurrenceRef,
    source_content: OccurrenceRef,
) -> tuple[OccurrenceRef, ...]:
    """Return exact forms admitted by matching dictionary membership links."""

    forms: list[OccurrenceRef] = []
    for membership_ref in network.refs:
        membership = network.link(membership_ref)
        if membership.start is not dictionary:
            continue
        entry = network.link(membership.end)
        if entry.start is source_content:
            forms.append(entry.end)
    return tuple(forms)


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
    """Check direct membership without structural equality or materialization."""

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
