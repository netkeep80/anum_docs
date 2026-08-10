"""Foundation-v2 Anum sequence materialization over the canonical MTS network.

The source/Anum front-end and this module are deliberately separate. Raw glyphs,
tokens and parser nodes are not semantic identity here. After source replay has
selected an ordered tuple of resolved forms, an explicitly selected root-opening
restoration may first expand collapsed leading-open usage. Then
``replay_resolved_sequence_grouping`` may interpret explicitly selected links as
open/close delimiters for sequence-deserialization mode.

A nested group is a host-side handle for a nested invocation of the same
sequence-deserialization semantics. Its result is returned as one link value to
the surrounding sequence. Empty top-level and nested contexts return the same
distinguished root; a singleton returns its only value.

Sequence semantics are a left fold over resolved values:

``∞ A B C`` -> ``AB=A⟼B`` -> ``ABC=AB⟼C``.

Materialization is explicit, but MTS identity is canonical by ordered poles.
Each fold step therefore obtains ``(current,end)`` through ``ensure``: an already
materialized pair is reused, while an absent pair is appended exactly once.
``SequenceMaterialization.created`` records only links actually appended by this
effect. Reuse is a property of the operation, not a second semantic identity.

The immutable ``before`` network is preserved and ``after`` remains in the same
runtime access scope. Trusted replay is read-only and reconstructs the result
from the canonical links of ``after`` while checking that every appended link is
accounted for by the selected fold.
"""
from __future__ import annotations

from dataclasses import dataclass

from .exact_link_network import LinkNetwork, LinkNetworkError, OccurrenceRef


class SequenceMaterializationError(ValueError):
    """Selected sequence/materialization evidence is invalid or forged."""


@dataclass(frozen=True)
class SequenceAtom:
    """One already-resolved link used as a sequence value."""

    value: OccurrenceRef


@dataclass(frozen=True)
class SequenceGroup:
    """Nested sequence invocation returning one link to the outer level.

    Host nesting is checker machinery, not a second kind of MTS entity. Empty
    ``items`` denotes a new root-default deserialization context.
    """

    items: tuple["SequenceItem", ...]


SequenceItem = SequenceAtom | SequenceGroup


@dataclass(frozen=True)
class SequenceDescription:
    """Selected root-relative sequence description for one materialization."""

    root: OccurrenceRef
    items: tuple[SequenceItem, ...]


@dataclass(frozen=True)
class MaterializedEdge:
    """One link physically appended by the explicit sequence effect."""

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


def replay_root_opening_restoration(
    network: LinkNetwork,
    forms: tuple[OccurrenceRef, ...],
    *,
    open_form: OccurrenceRef,
    close_form: OccurrenceRef,
) -> tuple[OccurrenceRef, ...]:
    """Restore root-collapsed leading opens over resolved forms.

    Restoration is eligible only when the represented carrier already begins
    with the selected ``open_form``. If closes outnumber opens, the deficit is
    prepended as repeated *uses of the same opening link*. No link is created.
    """

    before = network.snapshot()
    try:
        _validate_resolved_grouping_inputs(
            network,
            forms,
            open_form=open_form,
            close_form=close_form,
        )
        if not forms or forms[0] is not open_form:
            return forms

        balance = sum(
            1 if form is open_form else -1 if form is close_form else 0
            for form in forms
        )
        if balance >= 0:
            return forms
        return (open_form,) * (-balance) + forms
    except LinkNetworkError as exc:
        raise SequenceMaterializationError(
            "resolved sequence contains a foreign link handle"
        ) from exc
    finally:
        if network.snapshot() != before:
            raise SequenceMaterializationError(
                "root opening restoration mutated the network"
            )


def replay_resolved_sequence_grouping(
    network: LinkNetwork,
    forms: tuple[OccurrenceRef, ...],
    *,
    open_form: OccurrenceRef,
    close_form: OccurrenceRef,
) -> SequenceDescription:
    """Replay nested grouping over already-resolved forms without effects.

    ``open_form`` and ``close_form`` are explicit role selections for this
    deserialization mode. Because the network is canonical, another semantic
    link with the same poles cannot exist as a competing delimiter identity.
    Empty input and empty groups are valid root-default contexts.
    """

    before = network.snapshot()
    try:
        _validate_resolved_grouping_inputs(
            network,
            forms,
            open_form=open_form,
            close_form=close_form,
        )

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
            "resolved sequence contains a foreign link handle"
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
    """Read-only link search; never materializes a missing pair."""

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
    """Explicitly obtain one nested sequence in a new immutable network state."""

    before_snapshot = before.snapshot()
    _require_description_root(before, description)
    evolution = before.evolve()
    created: list[MaterializedEdge] = []
    created_refs: set[OccurrenceRef] = set()

    result = _materialize_items(
        before,
        evolution,
        description.items,
        created,
        created_refs,
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
    """Replay one already-materialized sequence effect without changing state."""

    before_snapshot = before.snapshot()
    after_snapshot = evidence.after.snapshot()
    try:
        _require_description_root(before, evidence.description)
        _verify_persistent_lineage(before, evidence.after, evidence.created)

        tracker = _ReplayTracker(base_count=len(before.refs))
        result = _replay_items(
            before,
            evidence.after,
            evidence.description.items,
            tracker,
        )
        if tuple(tracker.first_created_uses) != tuple(edge.ref for edge in evidence.created):
            raise SequenceMaterializationError(
                "created evidence does not match first use of appended fold links"
            )
        if result is not evidence.result:
            raise SequenceMaterializationError("forged materialization result link")
        return result
    except LinkNetworkError as exc:
        raise SequenceMaterializationError("invalid link evidence") from exc
    finally:
        if before.snapshot() != before_snapshot:
            raise SequenceMaterializationError("replay mutated the before network")
        if evidence.after.snapshot() != after_snapshot:
            raise SequenceMaterializationError("replay mutated the after network")


def _validate_resolved_grouping_inputs(
    network: LinkNetwork,
    forms: tuple[OccurrenceRef, ...],
    *,
    open_form: OccurrenceRef,
    close_form: OccurrenceRef,
) -> None:
    network.link(open_form)
    network.link(close_form)
    if open_form is close_form:
        raise SequenceMaterializationError(
            "open and close sequence delimiters must be distinct links"
        )
    for form in forms:
        network.link(form)


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
            "sequence must be rooted at the distinguished network root"
        )


def _materialize_items(
    before: LinkNetwork,
    evolution,
    items: tuple[SequenceItem, ...],
    created: list[MaterializedEdge],
    created_refs: set[OccurrenceRef],
) -> OccurrenceRef:
    if not items:
        return before.root

    values = tuple(
        _materialize_item(before, evolution, item, created, created_refs)
        for item in items
    )
    current = values[0]
    for end in values[1:]:
        ref = evolution.ensure(current, end)
        if ref.slot >= evolution.base_count and ref not in created_refs:
            created.append(MaterializedEdge(ref=ref, start=current, end=end))
            created_refs.add(ref)
        current = ref
    return current


def _materialize_item(
    before: LinkNetwork,
    evolution,
    item: SequenceItem,
    created: list[MaterializedEdge],
    created_refs: set[OccurrenceRef],
) -> OccurrenceRef:
    if isinstance(item, SequenceAtom):
        try:
            before.link(item.value)
        except LinkNetworkError as exc:
            raise SequenceMaterializationError(
                "sequence atom is not a link of the before network"
            ) from exc
        return item.value
    return _materialize_items(before, evolution, item.items, created, created_refs)


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
        raise SequenceMaterializationError("materialization changed the root")

    for index, ref in enumerate(before.refs):
        if after.refs[index] is not ref:
            raise SequenceMaterializationError(
                "after network does not preserve base runtime handles"
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
                "created link order differs from appended network order"
            )
        link = after.link(ref)
        if link.start is not edge.start or link.end is not edge.end:
            raise SequenceMaterializationError("forged created link poles")


@dataclass
class _ReplayTracker:
    base_count: int
    first_created_uses: list[OccurrenceRef] = None  # type: ignore[assignment]
    seen_created: set[OccurrenceRef] = None  # type: ignore[assignment]

    def __post_init__(self) -> None:
        self.first_created_uses = []
        self.seen_created = set()

    def observe(self, ref: OccurrenceRef) -> None:
        if ref.slot < self.base_count or ref in self.seen_created:
            return
        self.seen_created.add(ref)
        self.first_created_uses.append(ref)


def _replay_items(
    before: LinkNetwork,
    after: LinkNetwork,
    items: tuple[SequenceItem, ...],
    tracker: _ReplayTracker,
) -> OccurrenceRef:
    if not items:
        return before.root

    values = tuple(_replay_item(before, after, item, tracker) for item in items)
    current = values[0]
    for end in values[1:]:
        ref = after.find(current, end)
        if ref is None:
            raise SequenceMaterializationError(
                "after network is missing required canonical fold link"
            )
        tracker.observe(ref)
        current = ref
    return current


def _replay_item(
    before: LinkNetwork,
    after: LinkNetwork,
    item: SequenceItem,
    tracker: _ReplayTracker,
) -> OccurrenceRef:
    if isinstance(item, SequenceAtom):
        before.link(item.value)
        after.link(item.value)
        return item.value
    return _replay_items(before, after, item.items, tracker)
