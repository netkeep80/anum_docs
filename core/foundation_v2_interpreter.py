"""Foundation-v2 read-only interpreter/replay spine.

This module is the production-facing trusted replay spine after the exact-
occurrence state and source gates. It consumes already-selected exact evidence;
it does not tokenize, parse, search, rank or materialize application links.

The same engine currently replays:

- one-pole relation resolution against exact K/current;
- one flat selected Anum sequence reading against exact source/D/G/T evidence;
- one persistent scoped-dictionary ``:`` effect;
- one local exact-representative ``=`` evaluation.

Python dataclasses below are checker/transport API only. Semantic identity lives
in the exact link occurrences they reference.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Mapping

from .rooted_link_network import LinkNetwork, LinkRef
from .foundation_v2_source import (
    SourceFrontEndEvidence,
    SourceReplayError,
    replay_source_front_end,
    replay_source_subselection,
)
from .foundation_v2_state import (
    DictionaryLookupError,
    FoundationStateError,
    RepresentativeConflictError,
    act_header,
    act_values,
    current_of_context,
    local_representative,
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

    source: LinkRef
    source_selection: LinkRef
    form_sequence: LinkRef
    dictionary: LinkRef
    grammar: LinkRef
    theory: LinkRef
    form: LinkRef
    before_context: LinkRef
    binding: LinkRef
    result: LinkRef
    after_context: LinkRef


@dataclass(frozen=True)
class RelationStepEvidence:
    """Checker handle for one exact read-only relation-resolution act."""

    source_evidence: SourceFrontEndEvidence
    interpreter: LinkRef
    form: LinkRef
    before_context: LinkRef
    binding: LinkRef
    result: LinkRef
    after_context: LinkRef
    act: LinkRef
    role_dictionary: LinkRef
    roles: RelationStepRoleRefs


@dataclass(frozen=True)
class FlatSequenceReadingRoleRefs:
    """Exact roles required to replay one selected flat Anum reading act."""

    source: LinkRef
    source_selection: LinkRef
    form_sequence: LinkRef
    dictionary: LinkRef
    grammar: LinkRef
    theory: LinkRef
    before_context: LinkRef
    result: LinkRef
    after_context: LinkRef


@dataclass(frozen=True)
class FlatSequenceReadingEvidence:
    """Checker handle for one read-only flat sequence reading.

    The selected source front-end fixes exact source/D/G/T evidence and the
    ordered form sequence. ``result`` must already exist and must be exactly the
    left-fold denotation of that flat sequence. Replay never creates it.
    """

    source_evidence: SourceFrontEndEvidence
    interpreter: LinkRef
    before_context: LinkRef
    result: LinkRef
    after_context: LinkRef
    act: LinkRef
    role_dictionary: LinkRef
    roles: FlatSequenceReadingRoleRefs


@dataclass(frozen=True)
class ColonRoleRefs:
    """Exact role refs required to replay one persistent ``:`` effect."""

    source: LinkRef
    source_content: LinkRef
    form: LinkRef
    before_dictionary: LinkRef
    entry: LinkRef
    definition_occurrence: LinkRef
    history_before: LinkRef
    history_after: LinkRef
    after_dictionary: LinkRef
    context: LinkRef


@dataclass(frozen=True)
class ColonEffectEvidence:
    """Checker handle for one already-materialized persistent definition effect."""

    interpreter: LinkRef
    source: LinkRef
    source_content: LinkRef
    form: LinkRef
    before_dictionary: LinkRef
    entry: LinkRef
    definition_occurrence: LinkRef
    history_after: LinkRef
    after_dictionary: LinkRef
    context: LinkRef
    act: LinkRef
    role_dictionary: LinkRef
    roles: ColonRoleRefs


@dataclass(frozen=True)
class EqualityRoleRefs:
    """Exact role refs required to replay one local equality evaluation."""

    context: LinkRef
    left: LinkRef
    right: LinkRef
    left_representative: LinkRef
    right_representative: LinkRef


@dataclass(frozen=True)
class EqualityEvaluationEvidence:
    """Checker handle for one exact local equality-evaluation act."""

    interpreter: LinkRef
    context: LinkRef
    left: LinkRef
    right: LinkRef
    left_representative: LinkRef
    right_representative: LinkRef
    act: LinkRef
    role_dictionary: LinkRef
    roles: EqualityRoleRefs


def replay_relation_step(
    network: LinkNetwork,
    evidence: RelationStepEvidence,
    byte_refs: Mapping[int, LinkRef],
) -> LinkRef:
    """Replay one selected Foundation-v2 relation-resolution act read-only."""

    before_snapshot = network.snapshot()
    try:
        forms = _replay_source(network, evidence.source_evidence, byte_refs)
        if forms != (evidence.form,):
            raise InterpreterReplayError(
                "relation-step source must select exactly the claimed form"
            )
        return _replay_relation_selected_form(
            network,
            evidence,
            source_selection=evidence.source_evidence.selection_sequence,
            form_sequence=evidence.source_evidence.form_sequence,
            grammar=evidence.source_evidence.grammar,
            theory=evidence.source_evidence.theory,
        )
    finally:
        if network.snapshot() != before_snapshot:
            raise InterpreterReplayError("interpreter replay mutated the network")


def replay_relation_source_subselection_step(
    network: LinkNetwork,
    evidence: RelationStepEvidence,
    byte_refs: Mapping[int, LinkRef],
    *,
    start_segment: int,
    end_segment: int,
    selection_sequence: LinkRef,
    form_sequence: LinkRef,
    grammar: LinkRef,
    theory: LinkRef,
    grammar_membership: LinkRef,
    theory_membership: LinkRef,
) -> LinkRef:
    """Replay one-pole relation resolution from a trusted whole-source subselection.

    The semantic source remains ``evidence.source_evidence.source``. The selected
    source/form folds and G/T refs name one exact contiguous subselection of that
    whole source. No secondary source occurrence or bracket-specific opcode is
    introduced.
    """

    before_snapshot = network.snapshot()
    try:
        try:
            forms = replay_source_subselection(
                network,
                evidence.source_evidence,
                byte_refs,
                start_segment=start_segment,
                end_segment=end_segment,
                selection_sequence=selection_sequence,
                form_sequence=form_sequence,
                grammar=grammar,
                theory=theory,
                grammar_membership=grammar_membership,
                theory_membership=theory_membership,
            )
        except SourceReplayError as exc:
            raise InterpreterReplayError("invalid relation source subselection") from exc
        if forms != (evidence.form,):
            raise InterpreterReplayError(
                "relation-step subselection must select exactly the claimed form"
            )
        return _replay_relation_selected_form(
            network,
            evidence,
            source_selection=selection_sequence,
            form_sequence=form_sequence,
            grammar=grammar,
            theory=theory,
        )
    finally:
        if network.snapshot() != before_snapshot:
            raise InterpreterReplayError(
                "relation source-subselection replay mutated the network"
            )


def replay_flat_sequence_reading(
    network: LinkNetwork,
    evidence: FlatSequenceReadingEvidence,
    byte_refs: Mapping[int, LinkRef],
) -> LinkRef:
    """Replay one selected flat Anum sequence reading without effects.

    This operation deliberately stops before O/C grouping. The source front-end
    has already selected one exact flat form sequence under explicit D/G/T. The
    result must be the exact existing left-fold denotation of those selected
    forms: empty -> root, singleton -> the same occurrence, longer sequences ->
    left-associated links. Search and creation remain outside replay.
    """

    before_snapshot = network.snapshot()
    try:
        forms = _replay_source(network, evidence.source_evidence, byte_refs)
        return _replay_flat_selected_forms(
            network,
            evidence,
            forms,
            source_selection=evidence.source_evidence.selection_sequence,
            form_sequence=evidence.source_evidence.form_sequence,
            grammar=evidence.source_evidence.grammar,
            theory=evidence.source_evidence.theory,
        )
    finally:
        if network.snapshot() != before_snapshot:
            raise InterpreterReplayError("flat-reading replay mutated the network")


def replay_flat_source_subselection_reading(
    network: LinkNetwork,
    evidence: FlatSequenceReadingEvidence,
    byte_refs: Mapping[int, LinkRef],
    *,
    start_segment: int,
    end_segment: int,
    selection_sequence: LinkRef,
    form_sequence: LinkRef,
    grammar: LinkRef,
    theory: LinkRef,
    grammar_membership: LinkRef,
    theory_membership: LinkRef,
) -> LinkRef:
    """Replay a flat reading of one trusted subselection of the same whole source.

    ``evidence.source_evidence`` remains the whole exact source occurrence. The
    selected source/form folds and G/T refs name only the requested contiguous
    subselection. Segment indices are checker coordinates; actual-act identity
    is carried by exact link fields. No nested source occurrence is introduced.
    """

    before_snapshot = network.snapshot()
    try:
        try:
            forms = replay_source_subselection(
                network,
                evidence.source_evidence,
                byte_refs,
                start_segment=start_segment,
                end_segment=end_segment,
                selection_sequence=selection_sequence,
                form_sequence=form_sequence,
                grammar=grammar,
                theory=theory,
                grammar_membership=grammar_membership,
                theory_membership=theory_membership,
            )
        except SourceReplayError as exc:
            raise InterpreterReplayError("invalid source subselection evidence") from exc

        return _replay_flat_selected_forms(
            network,
            evidence,
            forms,
            source_selection=selection_sequence,
            form_sequence=form_sequence,
            grammar=grammar,
            theory=theory,
        )
    finally:
        if network.snapshot() != before_snapshot:
            raise InterpreterReplayError(
                "flat source-subselection replay mutated the network"
            )


def replay_flat_source_subselection_continuation(
    network: LinkNetwork,
    evidence: FlatSequenceReadingEvidence,
    byte_refs: Mapping[int, LinkRef],
    *,
    start_segment: int,
    end_segment: int,
    selection_sequence: LinkRef,
    form_sequence: LinkRef,
    grammar: LinkRef,
    theory: LinkRef,
    grammar_membership: LinkRef,
    theory_membership: LinkRef,
) -> LinkRef:
    """Continue one exact left fold from ``K_before.current`` over a subselection.

    This is sequence continuation, not bracket semantics. The selected source
    suffix is trusted through the same source-subselection evidence as an
    ordinary flat reading. Replay only verifies an already-existing exact result;
    it never creates the intermediate or final links.
    """

    before_snapshot = network.snapshot()
    try:
        try:
            forms = replay_source_subselection(
                network,
                evidence.source_evidence,
                byte_refs,
                start_segment=start_segment,
                end_segment=end_segment,
                selection_sequence=selection_sequence,
                form_sequence=form_sequence,
                grammar=grammar,
                theory=theory,
                grammar_membership=grammar_membership,
                theory_membership=theory_membership,
            )
        except SourceReplayError as exc:
            raise InterpreterReplayError(
                "invalid continuation source subselection evidence"
            ) from exc

        try:
            parent = parent_of_context(network, evidence.before_context)
            prefix = current_of_context(network, evidence.before_context)
            after_parent = parent_of_context(network, evidence.after_context)
            after_current = current_of_context(network, evidence.after_context)
        except FoundationStateError as exc:
            raise InterpreterReplayError("invalid continuation context") from exc

        _verify_flat_sequence_continuation_result(
            network,
            prefix,
            forms,
            evidence.result,
        )
        if after_parent is not parent:
            raise InterpreterReplayError(
                "flat continuation changed the explicit parent"
            )
        if after_current is not evidence.result:
            raise InterpreterReplayError(
                "flat-continuation after-context current is not the exact result"
            )

        _verify_flat_sequence_act_header(network, evidence)
        _verify_flat_sequence_act_fields(
            network,
            evidence,
            source_selection=selection_sequence,
            form_sequence=form_sequence,
            grammar=grammar,
            theory=theory,
        )
        return evidence.result
    finally:
        if network.snapshot() != before_snapshot:
            raise InterpreterReplayError(
                "flat source-subselection continuation mutated the network"
            )


def replay_colon_effect(
    network: LinkNetwork,
    evidence: ColonEffectEvidence,
) -> LinkRef:
    """Replay one persistent scoped-dictionary definition effect read-only."""

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


def replay_equality_evaluation(
    network: LinkNetwork,
    evidence: EqualityEvaluationEvidence,
) -> bool:
    """Replay one local exact-representative equality evaluation read-only.

    The host boolean is only a convenience result. The exact actual act ``A``
    records the evaluated context, operands and one-hop representatives.
    """

    before_snapshot = network.snapshot()
    try:
        try:
            current_of_context(network, evidence.context)
            left_rep = local_representative(network, evidence.context, evidence.left)
            right_rep = local_representative(network, evidence.context, evidence.right)
        except RepresentativeConflictError as exc:
            raise InterpreterReplayError("conflicting local representative") from exc
        except FoundationStateError as exc:
            raise InterpreterReplayError("invalid equality context") from exc

        if evidence.left_representative is not left_rep:
            raise InterpreterReplayError("forged left representative evidence")
        if evidence.right_representative is not right_rep:
            raise InterpreterReplayError("forged right representative evidence")

        _verify_equality_act_header(network, evidence)
        _verify_equality_act_fields(network, evidence)
        return left_rep is right_rep
    finally:
        if network.snapshot() != before_snapshot:
            raise InterpreterReplayError("equality replay mutated the network")


def _replay_source(
    network: LinkNetwork,
    source: SourceFrontEndEvidence,
    byte_refs: Mapping[int, LinkRef],
) -> tuple[LinkRef, ...]:
    try:
        return replay_source_front_end(network, source, byte_refs)
    except SourceReplayError as exc:
        raise InterpreterReplayError("invalid source-front-end evidence") from exc


def _replay_relation_selected_form(
    network: LinkNetwork,
    evidence: RelationStepEvidence,
    *,
    source_selection: LinkRef,
    form_sequence: LinkRef,
    grammar: LinkRef,
    theory: LinkRef,
) -> LinkRef:
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
    _verify_relation_act_fields(
        network,
        evidence,
        source_selection=source_selection,
        form_sequence=form_sequence,
        grammar=grammar,
        theory=theory,
    )
    return evidence.result


def _replay_flat_selected_forms(
    network: LinkNetwork,
    evidence: FlatSequenceReadingEvidence,
    forms: tuple[LinkRef, ...],
    *,
    source_selection: LinkRef,
    form_sequence: LinkRef,
    grammar: LinkRef,
    theory: LinkRef,
) -> LinkRef:
    _verify_flat_sequence_result(network, forms, evidence.result)

    try:
        parent = parent_of_context(network, evidence.before_context)
        current_of_context(network, evidence.before_context)
        after_parent = parent_of_context(network, evidence.after_context)
        after_current = current_of_context(network, evidence.after_context)
    except FoundationStateError as exc:
        raise InterpreterReplayError("invalid flat-reading context") from exc
    if after_parent is not parent:
        raise InterpreterReplayError("flat reading changed the explicit parent")
    if after_current is not evidence.result:
        raise InterpreterReplayError(
            "flat-reading after-context current is not the exact result"
        )

    _verify_flat_sequence_act_header(network, evidence)
    _verify_flat_sequence_act_fields(
        network,
        evidence,
        source_selection=source_selection,
        form_sequence=form_sequence,
        grammar=grammar,
        theory=theory,
    )
    return evidence.result


def _verify_flat_sequence_result(
    network: LinkNetwork,
    forms: tuple[LinkRef, ...],
    result: LinkRef,
) -> None:
    if not forms:
        if result is not network.root:
            raise InterpreterReplayError("empty flat sequence result is not exact root")
        return
    if len(forms) == 1:
        if result is not forms[0]:
            raise InterpreterReplayError(
                "singleton flat sequence result is not the exact selected form"
            )
        return

    current = result
    for expected_end in reversed(forms[1:]):
        link = network.link(current)
        if link.end is not expected_end:
            raise InterpreterReplayError(
                "flat sequence result does not match exact left-fold denotation"
            )
        current = link.start
    if current is not forms[0]:
        raise InterpreterReplayError(
            "flat sequence result does not start from the first exact form"
        )


def _verify_flat_sequence_continuation_result(
    network: LinkNetwork,
    prefix: LinkRef,
    forms: tuple[LinkRef, ...],
    result: LinkRef,
) -> None:
    current = result
    for expected_end in reversed(forms):
        link = network.link(current)
        if link.end is not expected_end:
            raise InterpreterReplayError(
                "flat continuation result does not match exact left fold"
            )
        current = link.start
    if current is not prefix:
        raise InterpreterReplayError(
            "flat continuation result does not start from exact K current"
        )


def _expected_result_poles(
    network: LinkNetwork,
    form: LinkRef,
    binding: LinkRef,
) -> tuple[LinkRef, LinkRef]:
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
    *,
    source_selection: LinkRef,
    form_sequence: LinkRef,
    grammar: LinkRef,
    theory: LinkRef,
) -> None:
    source = evidence.source_evidence
    expected = (
        (evidence.roles.source, source.source, "source"),
        (evidence.roles.source_selection, source_selection, "source-selection"),
        (evidence.roles.form_sequence, form_sequence, "form-sequence"),
        (evidence.roles.dictionary, source.dictionary, "dictionary"),
        (evidence.roles.grammar, grammar, "grammar"),
        (evidence.roles.theory, theory, "theory"),
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


def _verify_flat_sequence_act_header(
    network: LinkNetwork,
    evidence: FlatSequenceReadingEvidence,
) -> None:
    try:
        header = act_header(network, evidence.act)
    except FoundationStateError as exc:
        raise InterpreterReplayError("invalid flat-reading actual-act header") from exc
    expected = (evidence.interpreter, evidence.role_dictionary, evidence.after_context)
    if header != expected:
        raise InterpreterReplayError(
            "flat-reading actual-act header does not match I/D_roles/K_after"
        )


def _verify_flat_sequence_act_fields(
    network: LinkNetwork,
    evidence: FlatSequenceReadingEvidence,
    *,
    source_selection: LinkRef,
    form_sequence: LinkRef,
    grammar: LinkRef,
    theory: LinkRef,
) -> None:
    source = evidence.source_evidence
    expected = (
        (evidence.roles.source, source.source, "source"),
        (evidence.roles.source_selection, source_selection, "source-selection"),
        (evidence.roles.form_sequence, form_sequence, "form-sequence"),
        (evidence.roles.dictionary, source.dictionary, "dictionary"),
        (evidence.roles.grammar, grammar, "grammar"),
        (evidence.roles.theory, theory, "theory"),
        (
            evidence.roles.before_context,
            evidence.before_context,
            "before-context",
        ),
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
    history_before: LinkRef,
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


def _verify_equality_act_header(
    network: LinkNetwork,
    evidence: EqualityEvaluationEvidence,
) -> None:
    try:
        header = act_header(network, evidence.act)
    except FoundationStateError as exc:
        raise InterpreterReplayError("invalid equality actual-act header") from exc
    expected = (evidence.interpreter, evidence.role_dictionary, evidence.context)
    if header != expected:
        raise InterpreterReplayError(
            "equality actual-act header does not match I/D_roles/K"
        )


def _verify_equality_act_fields(
    network: LinkNetwork,
    evidence: EqualityEvaluationEvidence,
) -> None:
    expected = (
        (evidence.roles.context, evidence.context, "context"),
        (evidence.roles.left, evidence.left, "left"),
        (evidence.roles.right, evidence.right, "right"),
        (
            evidence.roles.left_representative,
            evidence.left_representative,
            "left-representative",
        ),
        (
            evidence.roles.right_representative,
            evidence.right_representative,
            "right-representative",
        ),
    )
    _verify_exact_act_fields(network, evidence.act, expected)


def _verify_exact_act_fields(
    network: LinkNetwork,
    act: LinkRef,
    expected: tuple[tuple[LinkRef, LinkRef, str], ...],
) -> None:
    for role, value, label in expected:
        values = act_values(network, act, role)
        if values != (value,):
            raise InterpreterReplayError(
                f"actual-act field {label!r} is missing, duplicated or forged"
            )
