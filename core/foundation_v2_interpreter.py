"""Foundation-v2 read-only interpreter/replay spine.

This module is the first production-facing vertical interpreter slice after the
exact-occurrence state and source gates.  It consumes already-selected source
evidence; it does not tokenize, parse, search, rank or materialize application
links.

The trusted operation replays one relation-resolution act:

    source evidence -> exact active K/current -> one-pole form resolution
    -> exact result -> persistent K_after -> exact actual act A

Python dataclasses below are checker/transport API only.  Semantic identity lives
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
    FoundationStateError,
    act_header,
    act_values,
    current_of_context,
    parent_of_context,
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


def replay_relation_step(
    network: LinkNetwork,
    evidence: RelationStepEvidence,
    byte_refs: Mapping[int, OccurrenceRef],
) -> OccurrenceRef:
    """Replay one selected Foundation-v2 relation-resolution act read-only.

    Exactly one form must have been selected by the source front-end.  The
    direction of resolution is derived from the exact self-closed form itself:

    ``F = F ⟼ e``  -> bind the open start from ``↑``
    ``F = b ⟼ F``  -> bind the open end from ``↑``

    The selected result occurrence is checked by exact ref and poles.  Another
    occurrence with the same poles neither invalidates nor replaces it.
    """

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

        _verify_act_header(network, evidence)
        _verify_act_fields(network, evidence)
        return evidence.result
    finally:
        if network.snapshot() != before_snapshot:
            raise InterpreterReplayError("interpreter replay mutated the network")


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
    raise InterpreterReplayError(
        "selected form is not exactly one-pole self-closed"
    )


def _verify_act_header(network: LinkNetwork, evidence: RelationStepEvidence) -> None:
    try:
        header = act_header(network, evidence.act)
    except FoundationStateError as exc:
        raise InterpreterReplayError("invalid actual-act header") from exc
    expected = (evidence.interpreter, evidence.role_dictionary, evidence.after_context)
    if header != expected:
        raise InterpreterReplayError("actual-act header does not match I/D_roles/K_after")


def _verify_act_fields(network: LinkNetwork, evidence: RelationStepEvidence) -> None:
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
    for role, value, label in expected:
        values = act_values(network, evidence.act, role)
        if values != (value,):
            raise InterpreterReplayError(
                f"actual-act field {label!r} is missing, duplicated or forged"
            )
