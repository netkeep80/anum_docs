"""Foundation-v2 Anum sequence materialization over exact-occurrence networks.

The source/Anum front-end and this module are deliberately separate. Raw glyphs,
tokens and parser nodes are not semantic identity here. After source replay has
selected an ordered tuple of exact forms, ``replay_resolved_sequence_grouping``
may interpret two explicitly selected exact occurrences as open/close delimiters
for sequence-deserialization mode. Delimiter meaning is therefore contextual;
the link shape alone never makes an occurrence a bracket command.

The resulting nested sequence description has arbitrary exact existing link
occurrences as leaves. A leaf may itself be a complete non-self-closed relation;
it is not required to be an "atomic" value in the MTS ontology.

A nested group is a host-side handle for a nested invocation of the same
sequence-deserialization semantics. Its exact result is returned as one value
to the surrounding sequence. Therefore the resolved semantic value domain is
closed over links:

``ExactLink | NestedSequence -> ExactLink``.

Materialization is an explicit persistent effect: the immutable ``before``
network is preserved and an ``after`` state in the same runtime identity lineage
is produced with newly appended exact link occurrences.

Sequence semantics:

``∞ A B C`` -> create ``A⟼B`` and ``B⟼C``.

A nested group is evaluated recursively and returns one exact value to its
outer sequence. A singleton group returns its contained value without creating
a link. A group of two or more values creates every adjacent relation and
returns the last created relation occurrence.

Every adjacency creates a *new* exact occurrence. Pair interning and implicit
reuse are intentionally absent; a search/reuse policy belongs to the untrusted
planning side and must be explicit if introduced later.
"""
from __future__ import annotations

from dataclasses import dataclass

from .exact_link_network import LinkNetwork, LinkNetworkError, OccurrenceRef


class SequenceMaterializationError(ValueError):
    """Selected sequence/materialization evidence is invalid or forged."""


@dataclass(frozen=True)
class SequenceAtom:
    """One already-resolved exact link occurrence used as a sequence value.

    ``Atom`` is only transport terminology. ``value`` may itself denote any
    existing relation occurrence, including a complete ``A⟼B`` link.
    """

    value: OccurrenceRef


@dataclass(frozen=True)
class SequenceGroup:
    """Nested sequence invocation returning one exact link to the outer level.

    Host nesting is a checker handle, not semantic identity and not a second
    kind of MTS entity.
    """

    items: tuple["SequenceItem", ...]

    def __post_init__(self) -> None:
        if not self.items:
            raise SequenceMaterializationError("nested sequence group cannot be empty")


SequenceItem = SequenceAtom | SequenceGroup


@dataclass(frozen=True)
class SequenceDescription:
    """Selected root-relative sequence description for one materialization."""

    root: OccurrenceRef
    items: tuple[SequenceItem, ...]

    def __post_init__(self) -> None:
        if not self.items:
            raise SequenceMaterializationError("top-level sequence cannot be empty")


@dataclass(frozen=True)
class MaterializedEdge:
    """One exact new occurrence created by the explicit sequence effect."""

    ref: OccurrenceRef
    start: OccurrenceRef
    end: OccurrenceRef


@dataclass(frozen=True)
class SequenceMaterialization:
    """Persistent before→after effect evidence for one selected sequence."""

    description: SequenceDescription
    after: LinkNetwork
    created: tuple[MaterializedEdge, ...]
    result: OccurrenceRef


def replay_resolved_sequence_grouping(
    network: LinkNetwork,
    forms: tuple[OccurrenceRef, ...],
    *,
    open_form: OccurrenceRef,
    close_form: OccurrenceRef,
) -> SequenceDescription:
    """Replay nested grouping over already-resolved exact forms without effects.

    ``open_form`` and ``close_form`` are explicit role selections for this one
    sequence-deserialization mode. Only those exact occurrences delimit groups;
    another occurrence with the same poles is an ordinary sequence value.

    This function does not define the raw-carrier/root-opening-collapse mapping.
    It starts after source/D replay has already produced exact forms in order.
    """

    before = network.snapshot()
    try:
        network.link(open_form)
        network.link(close_form)
        if open_form is close_form:
            raise SequenceMaterializationError(
                "open and close sequence delimiters must be exact-distinct"
            )
        if not forms:
            raise SequenceMaterializationError("resolved sequence cannot be empty")
        for form in forms:
            network.link(form)

        items, position = _group_resolved_forms(
            forms,
            0,
            open_form=open_form,
            close_form=close_form,
            inside_group=False,
        )
        if position != len(forms):
            raise SequenceMaterializationError(
                "resolved sequence grouping left unconsumed forms"
            )
        return SequenceDescription(root=network.root, items=items)
    except LinkNetworkError as exc:
        raise SequenceMaterializationError(
            "resolved sequence contains a foreign exact occurrence"
        ) from exc
    finally:
        if network.snapshot() != before:
            raise SequenceMaterializationError(
                "resolved sequence grouping mutated the network"
            )


def find_links(
    network: LinkNetwork,
    *,
    start: OccurrenceRef | None = None,
    end: OccurrenceRef | None = None,
) -> tuple[OccurrenceRef, ...]:
    """Read-only exact occurrence search; never materializes a missing pair."""

    before = network.snapshot()
    if start is not None:
        network.link(start)
    if end is not None:
        network.link(end)

    found = tuple(
        ref
        for ref in network.refs
        if (start is None or network.link(ref).start is start)
        and (end is None or network.link(ref).end is end)
    )
    if network.snapshot() != before:
        raise SequenceMaterializationError("read-only find mutated the network")
    return found


def materialize_sequence(
    before: LinkNetwork,
    description: SequenceDescription,
) -> SequenceMaterialization:
    """Explicitly materialize one nested sequence into a new immutable state."""

    before_snapshot = before.snapshot()
    _require_description_root(before, description)
    evolution = before.evolve()
    created: list[MaterializedEdge] = []

    result = _materialize_items(
        before,
        evolution,
        description.items,
        created,
    )
    after = evolution.freeze()

    if before.snapshot() != before_snapshot:
        raise SequenceMaterializationError("materialization mutated the before network")

    evidence = SequenceMaterialization(
        description=description,
        after=after,
        created=tuple(created),
        result=result,
    )
    replay_sequence_materialization(before, evidence)
    return evidence


def replay_sequence_materialization(
    before: LinkNetwork,
    evidence: SequenceMaterialization,
) -> OccurrenceRef:
    """Replay one already-materialized sequence effect without changing either state."""

    before_snapshot = before.snapshot()
    after_snapshot = evidence.after.snapshot()
    try:
        _require_description_root(before, evidence.description)
        _verify_persistent_lineage(before, evidence.after, evidence.created)

        cursor = _ReplayCursor(evidence.created)
        result = _replay_items(
            before,
            evidence.after,
            evidence.description.items,
            cursor,
        )
        if cursor.position != len(evidence.created):
            raise SequenceMaterializationError(
                "materialization contains extra created occurrences"
            )
        if result is not evidence.result:
            raise SequenceMaterializationError("forged materialization result occurrence")
        return result
    except LinkNetworkError as exc:
        raise SequenceMaterializationError("invalid exact occurrence evidence") from exc
    finally:
        if before.snapshot() != before_snapshot:
            raise SequenceMaterializationError("replay mutated the before network")
        if evidence.after.snapshot() != after_snapshot:
            raise SequenceMaterializationError("replay mutated the after network")


def _group_resolved_forms(
    forms: tuple[OccurrenceRef, ...],
    position: int,
    *,
    open_form: OccurrenceRef,
    close_form: OccurrenceRef,
    inside_group: bool,
) -> tuple[tuple[SequenceItem, ...], int]:
    items: list[SequenceItem] = []

    while position < len(forms):
        form = forms[position]
        if form is close_form:
            if not inside_group:
                raise SequenceMaterializationError(
                    "unexpected close delimiter in resolved sequence"
                )
            if not items:
                raise SequenceMaterializationError(
                    "resolved sequence group cannot be empty"
                )
            return tuple(items), position + 1

        if form is open_form:
            nested, position = _group_resolved_forms(
                forms,
                position + 1,
                open_form=open_form,
                close_form=close_form,
                inside_group=True,
            )
            items.append(SequenceGroup(nested))
            continue

        items.append(SequenceAtom(form))
        position += 1

    if inside_group:
        raise SequenceMaterializationError(
            "resolved sequence group is missing close delimiter"
        )
    return tuple(items), position


def _require_description_root(
    network: LinkNetwork,
    description: SequenceDescription,
) -> None:
    if description.root is not network.root:
        raise SequenceMaterializationError(
            "sequence must be rooted at the exact distinguished network root"
        )


def _materialize_items(
    before: LinkNetwork,
    evolution,
    items: tuple[SequenceItem, ...],
    created: list[MaterializedEdge],
) -> OccurrenceRef:
    values = tuple(
        _materialize_item(before, evolution, item, created) for item in items
    )
    if len(values) == 1:
        return values[0]

    last: OccurrenceRef | None = None
    for start, end in zip(values, values[1:]):
        ref = evolution.reserve()
        evolution.define(ref, start, end)
        created.append(MaterializedEdge(ref=ref, start=start, end=end))
        last = ref
    assert last is not None
    return last


def _materialize_item(
    before: LinkNetwork,
    evolution,
    item: SequenceItem,
    created: list[MaterializedEdge],
) -> OccurrenceRef:
    if isinstance(item, SequenceAtom):
        try:
            before.link(item.value)
        except LinkNetworkError as exc:
            raise SequenceMaterializationError(
                "sequence atom is not an exact occurrence of the before network"
            ) from exc
        return item.value
    return _materialize_items(before, evolution, item.items, created)


def _verify_persistent_lineage(
    before: LinkNetwork,
    after: LinkNetwork,
    created: tuple[MaterializedEdge, ...],
) -> None:
    base_count = len(before.refs)
    if len(after.refs) != base_count + len(created):
        raise SequenceMaterializationError(
            "after network cardinality does not match explicit created evidence"
        )
    if after.root is not before.root:
        raise SequenceMaterializationError("materialization changed the exact root")

    for index, ref in enumerate(before.refs):
        if after.refs[index] is not ref:
            raise SequenceMaterializationError(
                "after network does not preserve exact base occurrence identity"
            )
        if after.link(ref) is not before.link(ref):
            raise SequenceMaterializationError(
                "materialization changed an existing base link"
            )

    appended = after.refs[base_count:]
    if len(appended) != len(created):
        raise SequenceMaterializationError("created evidence cardinality mismatch")
    for ref, edge in zip(appended, created, strict=True):
        if ref is not edge.ref:
            raise SequenceMaterializationError(
                "created occurrence order differs from exact appended network order"
            )


@dataclass
class _ReplayCursor:
    created: tuple[MaterializedEdge, ...]
    position: int = 0

    def consume(self) -> MaterializedEdge:
        if self.position >= len(self.created):
            raise SequenceMaterializationError(
                "materialization is missing an expected sequence relation"
            )
        edge = self.created[self.position]
        self.position += 1
        return edge


def _replay_items(
    before: LinkNetwork,
    after: LinkNetwork,
    items: tuple[SequenceItem, ...],
    cursor: _ReplayCursor,
) -> OccurrenceRef:
    values = tuple(_replay_item(before, after, item, cursor) for item in items)
    if len(values) == 1:
        return values[0]

    last: OccurrenceRef | None = None
    for start, end in zip(values, values[1:]):
        edge = cursor.consume()
        link = after.link(edge.ref)
        if edge.start is not start or edge.end is not end:
            raise SequenceMaterializationError(
                "created edge evidence does not match sequence adjacency"
            )
        if link.start is not start or link.end is not end:
            raise SequenceMaterializationError(
                "after network link does not match sequence adjacency"
            )
        last = edge.ref
    assert last is not None
    return last


def _replay_item(
    before: LinkNetwork,
    after: LinkNetwork,
    item: SequenceItem,
    cursor: _ReplayCursor,
) -> OccurrenceRef:
    if isinstance(item, SequenceAtom):
        before.link(item.value)
        after.link(item.value)
        return item.value
    return _replay_items(before, after, item.items, cursor)
