"""Foundation-v2 read-only interpreter/replay spine.

This module is the production-facing trusted replay spine after the exact-
occurrence state and source gates. It consumes already-selected exact evidence;
it does not tokenize, parse, search, rank or materialize application links.

The same engine currently replays:

- one-pole relation resolution against exact K/current;
- one persistent scoped-dictionary ``:`` effect.

Python dataclasses below are checker/transport API only. Semantic identity lives
in the exact link occurrences they reference.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Mapping

from .exact_link_network import LinkNetwork, OccurrenceRef
from .foundation_v2_source import (
    SourceFrontEndEvidence,
    SourceReplayError,
    replay_source_front_end,
)
from .foundation_v2_state import (
    DictionaryLookupError,
    FoundationStateError,
    act_header,
    act_values,
    current_of_context,
    lookup_scoped_dictionary,
    parent_of_context,
    read_dictionary_scope,
    verify_visible_dictionary_occurrence,
)


class InterpreterReplayError(ValueError):
    """Selected interpreter evidence is incomplete, forged or inconsistent."""


@dataclass(frozen=True)
class RelationStepRoleRefs:
    """Exact role refs supplied by the explicit Gate-R role vocabulary."""

    source: OccurrenceRef
    source_selection: OccurrenceRef
    form_sequence: OccurrenceRef
    dictionary: OccurrenceRef
    grammar: OccurrenceRef
    theory: OccurrenceRef
    form: OccurrenceRef
    before_context: OccurrenceRef
    binding: OccurrenceRef
    result: OccurrenceRef
    after_context: OccurrenceRef


@dataclass(frozen=True)
class RelationStepEvidence:
    """Checker handle for one exact read-only relation-resolution act."""

    source_evidence: SourceFrontEndEvidence
    interpreter: OccurrenceRef
    form: OccurrenceRef
    before_context: OccurrenceRef
    binding: OccurrenceRef
    result: OccurrenceRef
    after_context: OccurrenceRef
    act: OccurrenceRef
    role_dictionary: OccurrenceRef
    roles: RelationStepRoleRefs


@dataclass(frozen=True)
class ColonRoleRefs:
    """Exact role refs required to replay one persistent ``:`` effect."""

    source: OccurrenceRef
    source_content: OccurrenceRef
    form: OccurrenceRef
    before_dictionary: OccurrenceRef
    entry: OccurrenceRef
    definition_occurrence: OccurrenceRef
    history_before: OccurrenceRef
    history_after: OccurrenceRef
    after_dictionary: OccurrenceRef
    context: OccurrenceRef


@dataclass(frozen=True)
class ColonEffectEvidence:
    """Checker handle for one already-materialized persistent definition effect."""

    interpreter: OccurrenceRef
    source: OccurrenceRef
    source_content: OccurrenceRef
    form: OccurrenceRef
    before_dictionary: OccurrenceRef
    entry: OccurrenceRef
    definition_occurrence: OccurrenceRef
    history_after: OccurrenceRef
    after_dictionary: OccurrenceRef
    context: OccurrenceRef
    act: OccurrenceRef
    role_dictionary: OccurrenceRef
    roles: ColonRoleRefs


def replay_relation_step(
    network: LinkNetwork,
    evidence: RelationStepEvidence,
    byte_refs: Mapping[int, OccurrenceRef],
) -> OccurrenceRef:
    """Replay one selected Foundation-v2 relation-resolution act read-only."""

    before_snapshot = network.snapshot()
    try:
        forms = _replay_source(network, evidence.source_evidence, byte_refs)
        if forms != (evidence.form,):
            raise InterpreterReplayError(
                "relation-step source must select exactly the claimed form"
            )

        try:
            parent = parent_of_context(network, evidence.before_context)
            current = current_of_context(network, evidence.before_context)
        except FoundationStateError as exc:
            raise InterpreterReplayError("invalid before-context") from exc
        if evidence.binding is not current:
            raise InterpreterReplayError("binding is not exact current resolved from K")

        expected_start, expected_end = _expected_result_poles(
            network, evidence.form, evidence.binding
        )
        result_link = network.link(evidence.result)
        if result_link.start is not expected_start or result_link.end is not expected_end:
            raise InterpreterReplayError("result occurrence has forged poles")

        try:
            after_parent = parent_of_context(network, evidence.after_context)
            after_current = current_of_context(network, evidence.after_context)
        except FoundationStateError as exc:
            raise InterpreterReplayError("invalid after-context") from exc
        if after_parent is not parent:
            raise InterpreterReplayError("after-context changed the explicit parent")
        if after_current is not evidence.result:
            raise InterpreterReplayError("after-context current is not the exact result")

        _verify_relation_act_header(network, evidence)
        _verify_relation_act_fields(network, evidence)
        return evidence.result
    finally:
        if network.snapshot() != before_snapshot:
            raise InterpreterReplayError("interpreter replay mutated the network")


def replay_colon_effect(
    network: LinkNetwork,
    evidence: ColonEffectEvidence,
) -> OccurrenceRef:
    """Replay one persistent scoped-dictionary definition effect read-only.

    The relation ``sourceContent ⟼ form`` is dictionary data, not equality or a
    theorem. The exact declaration occurrence is bound to ``D_before`` and
    appended once to its local history; ``D_after`` is a fresh persistent scope
    snapshot with the same lexical parent.
    """

    before_snapshot = network.snapshot()
    try:
        source_link = network.link(evidence.source)
        if (
            source_link.start is not evidence.source
            or source_link.end is not evidence.source_content
        ):
            raise InterpreterReplayError("colon source does not match S = S ⟼ C")

        try:
            parent_before, history_before = read_dictionary_scope(
                network, evidence.before_dictionary
            )
        except DictionaryLookupError as exc:
            raise InterpreterReplayError("invalid before dictionary scope") from exc

        entry = network.link(evidence.entry)
        if entry.start is not evidence.source_content or entry.end is not evidence.form:
            raise InterpreterReplayError("colon Entry does not match sourceContent ⟼ form")

        occurrence = network.link(evidence.definition_occurrence)
        if (
            occurrence.start is not evidence.before_dictionary
            or occurrence.end is not evidence.entry
        ):
            raise InterpreterReplayError(
                "definition occurrence is not bound to exact D_before and Entry"
            )

        history_after = network.link(evidence.history_after)
        if (
            history_after.start is not history_before
            or history_after.end is not evidence.definition_occurrence
        ):
            raise InterpreterReplayError("colon history is not one exact append")

        try:
            parent_after, selected_history_after = read_dictionary_scope(
                network, evidence.after_dictionary
            )
        except DictionaryLookupError as exc:
            raise InterpreterReplayError("invalid after dictionary scope") from exc
        if parent_after is not parent_before:
            raise InterpreterReplayError("colon effect changed lexical parent scope")
        if selected_history_after is not evidence.history_after:
            raise InterpreterReplayError("D_after does not select exact appended history")

        try:
            verify_visible_dictionary_occurrence(
                network,
                evidence.after_dictionary,
                evidence.definition_occurrence,
                evidence.source_content,
                evidence.form,
            )
        except DictionaryLookupError as exc:
            raise InterpreterReplayError(
                "new definition is not a valid visible mapping in D_after"
            ) from exc

        # The newly created declaration occurrence must not retroactively become
        # visible from the immutable predecessor snapshot, even when an older
        # identical mapping already exists there.
        try:
            verify_visible_dictionary_occurrence(
                network,
                evidence.before_dictionary,
                evidence.definition_occurrence,
                evidence.source_content,
                evidence.form,
            )
        except DictionaryLookupError:
            pass
        else:
            raise InterpreterReplayError(
                "new definition occurrence is retroactively visible from D_before"
            )

        _verify_colon_act_header(network, evidence)
        _verify_colon_act_fields(network, evidence, history_before)
        return evidence.after_dictionary
    finally:
        if network.snapshot() != before_snapshot:
            raise InterpreterReplayError("colon replay mutated the network")


def _replay_source(
    network: LinkNetwork,
    source: SourceFrontEndEvidence,
    byte_refs: Mapping[int, OccurrenceRef],
) -> tuple[OccurrenceRef, ...]:
    try:
        return replay_source_front_end(network, source, byte_refs)
    except SourceReplayError as exc:
        raise InterpreterReplayError("invalid source-front-end evidence") from exc


def _expected_result_poles(
    network: LinkNetwork,
    form: OccurrenceRef,
    binding: OccurrenceRef,
) -> tuple[OccurrenceRef, OccurrenceRef]:
    form_link = network.link(form)
    start_open = form_link.start is form and form_link.end is not form
    end_open = form_link.end is form and form_link.start is not form

    if start_open:
        return binding, form_link.end
    if end_open:
        return form_link.start, binding
    raise InterpreterReplayError("selected form is not exactly one-pole self-closed")


def _verify_relation_act_header(
    network: LinkNetwork,
    evidence: RelationStepEvidence,
) -> None:
    try:
        header = act_header(network, evidence.act)
    except FoundationStateError as exc:
        raise InterpreterReplayError("invalid actual-act header") from exc
    expected = (evidence.interpreter, evidence.role_dictionary, evidence.after_context)
    if header != expected:
        raise InterpreterReplayError("actual-act header does not match I/D_roles/K_after")


def _verify_relation_act_fields(
    network: LinkNetwork,
    evidence: RelationStepEvidence,
) -> None:
    source = evidence.source_evidence
    expected = (
        (evidence.roles.source, source.source, "source"),
        (
            evidence.roles.source_selection,
            source.selection_sequence,
            "source-selection",
        ),
        (evidence.roles.form_sequence, source.form_sequence, "form-sequence"),
        (evidence.roles.dictionary, source.dictionary, "dictionary"),
        (evidence.roles.grammar, source.grammar, "grammar"),
        (evidence.roles.theory, source.theory, "theory"),
        (evidence.roles.form, evidence.form, "form"),
        (
            evidence.roles.before_context,
            evidence.before_context,
            "before-context",
        ),
        (evidence.roles.binding, evidence.binding, "binding"),
        (evidence.roles.result, evidence.result, "result"),
        (evidence.roles.after_context, evidence.after_context, "after-context"),
    )
    _verify_exact_act_fields(network, evidence.act, expected)


def _verify_colon_act_header(
    network: LinkNetwork,
    evidence: ColonEffectEvidence,
) -> None:
    try:
        header = act_header(network, evidence.act)
    except FoundationStateError as exc:
        raise InterpreterReplayError("invalid colon actual-act header") from exc
    expected = (evidence.interpreter, evidence.role_dictionary, evidence.context)
    if header != expected:
        raise InterpreterReplayError(
            "colon actual-act header does not match I/D_roles/K"
        )


def _verify_colon_act_fields(
    network: LinkNetwork,
    evidence: ColonEffectEvidence,
    history_before: OccurrenceRef,
) -> None:
    expected = (
        (evidence.roles.source, evidence.source, "source"),
        (
            evidence.roles.source_content,
            evidence.source_content,
            "source-content",
        ),
        (evidence.roles.form, evidence.form, "form"),
        (
            evidence.roles.before_dictionary,
            evidence.before_dictionary,
            "before-dictionary",
        ),
        (evidence.roles.entry, evidence.entry, "entry"),
        (
            evidence.roles.definition_occurrence,
            evidence.definition_occurrence,
            "definition-occurrence",
        ),
        (evidence.roles.history_before, history_before, "history-before"),
        (evidence.roles.history_after, evidence.history_after, "history-after"),
        (
            evidence.roles.after_dictionary,
            evidence.after_dictionary,
            "after-dictionary",
        ),
        (evidence.roles.context, evidence.context, "context"),
    )
    _verify_exact_act_fields(network, evidence.act, expected)


def _verify_exact_act_fields(
    network: LinkNetwork,
    act: OccurrenceRef,
    expected: tuple[tuple[OccurrenceRef, OccurrenceRef, str], ...],
) -> None:
    for role, value, label in expected:
        values = act_values(network, act, role)
        if values != (value,):
            raise InterpreterReplayError(
                f"actual-act field {label!r} is missing, duplicated or forged"
            )
