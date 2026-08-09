"""Non-normative integrated interpreter-act challenge for issue #219.

This slice composes the previously challenged source, dictionary, theory,
self-closed context and partial-relation resolution surfaces.  It also compares
an exact positional evidence spine with a self-closed act carrying explicit
role/value fields resolved through a scoped role dictionary.
"""

from __future__ import annotations

from dataclasses import dataclass, fields, replace
import json
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[1]
CHALLENGE = ROOT / "contracts/mts-integrated-interpreter-act-challenge-v0.7.json"

ROOT_REF = 0
OPEN_REF = 1
CLOSE_REF = 2
LINK_REF = 3
UNLINK_REF = 4

ROLE_NAMES = (
    "interpreter",
    "source",
    "dictionary",
    "dictionary-membership",
    "theory",
    "theory-membership",
    "form",
    "before-context",
    "binding",
    "result",
    "after-context",
)


@dataclass(frozen=True)
class Link:
    start: int
    end: int


@dataclass(frozen=True)
class ContextView:
    payload: int
    parent: int
    current: int


@dataclass(frozen=True)
class DictionaryResolution:
    source_ref: int
    entry_ref: int
    membership_ref: int
    form_ref: int


@dataclass(frozen=True)
class StepEvidence:
    source_carrier: str
    interpreter_ref: int
    source_ref: int
    dictionary_ref: int
    dictionary_entry_ref: int
    dictionary_membership_ref: int
    theory_ref: int
    theory_membership_ref: int
    form_ref: int
    before_context_ref: int
    binding_ref: int
    result_ref: int
    after_context_ref: int


@dataclass(frozen=True)
class ActEncodings:
    positional_ref: int
    bundle_ref: int
    role_dictionary_ref: int


class UnknownSource(ValueError):
    pass


class DictionaryConflict(ValueError):
    pass


class MissingTheoryMembership(ValueError):
    pass


class LinkGraph:
    def __init__(self) -> None:
        self.links: dict[int, Link] = {
            ROOT_REF: Link(ROOT_REF, ROOT_REF),
            OPEN_REF: Link(OPEN_REF, ROOT_REF),
            CLOSE_REF: Link(ROOT_REF, CLOSE_REF),
            LINK_REF: Link(OPEN_REF, CLOSE_REF),
            UNLINK_REF: Link(CLOSE_REF, OPEN_REF),
        }
        self._pairs = {link: ref for ref, link in self.links.items()}
        self._next_ref = 5

    def intern(self, start: int, end: int) -> int:
        pair = Link(start, end)
        existing = self._pairs.get(pair)
        if existing is not None:
            return existing
        ref = self._next_ref
        self._next_ref += 1
        self.links[ref] = pair
        self._pairs[pair] = ref
        return ref

    def find_pair(self, start: int, end: int) -> int | None:
        return self._pairs.get(Link(start, end))

    def self_closed_start(self, end: int) -> int:
        ref = self._next_ref
        self._next_ref += 1
        pair = Link(ref, end)
        assert pair not in self._pairs
        self.links[ref] = pair
        self._pairs[pair] = ref
        return ref

    def self_closed_end(self, start: int) -> int:
        ref = self._next_ref
        self._next_ref += 1
        pair = Link(start, ref)
        assert pair not in self._pairs
        self.links[ref] = pair
        self._pairs[pair] = ref
        return ref

    def validate(self) -> None:
        refs = set(self.links)
        assert len(self.links) == len(self._pairs)
        for ref, link in self.links.items():
            assert link.start in refs
            assert link.end in refs
            assert self._pairs[link] == ref


def contract() -> dict:
    return json.loads(CHALLENGE.read_text(encoding="utf-8"))


def encode_text(text: str) -> str:
    return "".join(f"[{value:08b}]" for value in text.encode("utf-8"))


def abit_meaning(token: str) -> int:
    if token == "[":
        return OPEN_REF
    if token == "]":
        return CLOSE_REF
    if token == "1":
        return LINK_REF
    if token == "0":
        return UNLINK_REF
    raise ValueError(token)


def add_source(graph: LinkGraph, carrier: str) -> int:
    current = ROOT_REF
    for token in carrier:
        current = graph.intern(current, abit_meaning(token))
    return current


def find_source(graph: LinkGraph, carrier: str) -> int:
    current = ROOT_REF
    for token in carrier:
        next_ref = graph.find_pair(current, abit_meaning(token))
        if next_ref is None:
            raise UnknownSource(carrier)
        current = next_ref
    return current


def new_scoped_identity(graph: LinkGraph) -> int:
    seed = graph.self_closed_end(ROOT_REF)
    return graph.intern(seed, LINK_REF)


def add_dictionary_entry(
    graph: LinkGraph,
    dictionary_ref: int,
    source_ref: int,
    form_ref: int,
) -> tuple[int, int]:
    entry_ref = graph.intern(source_ref, form_ref)
    membership_ref = graph.intern(dictionary_ref, entry_ref)
    return entry_ref, membership_ref


def lookup_dictionary(
    graph: LinkGraph,
    dictionary_ref: int,
    source_carrier: str,
) -> DictionaryResolution:
    source_ref = find_source(graph, source_carrier)
    matches: list[tuple[int, int, int]] = []
    for membership_ref, membership in graph.links.items():
        if membership.start != dictionary_ref:
            continue
        entry = graph.links.get(membership.end)
        if entry is None or entry.start != source_ref:
            continue
        matches.append((membership_ref, membership.end, entry.end))
    if not matches:
        raise UnknownSource(source_carrier)
    distinct_forms = {form_ref for _, _, form_ref in matches}
    if len(distinct_forms) != 1:
        raise DictionaryConflict(source_carrier)
    membership_ref, entry_ref, form_ref = sorted(matches)[0]
    return DictionaryResolution(
        source_ref=source_ref,
        entry_ref=entry_ref,
        membership_ref=membership_ref,
        form_ref=form_ref,
    )


def admit(graph: LinkGraph, theory_ref: int, form_ref: int) -> int:
    return graph.intern(theory_ref, form_ref)


def new_context(graph: LinkGraph, parent_ref: int, current_ref: int) -> int:
    payload_ref = graph.intern(parent_ref, current_ref)
    return graph.self_closed_start(payload_ref)


def read_context(graph: LinkGraph, context_ref: int) -> ContextView:
    context = graph.links[context_ref]
    if context.start != context_ref:
        raise ValueError("active context must be start-self-closed")
    payload_ref = context.end
    payload = graph.links[payload_ref]
    return ContextView(
        payload=payload_ref,
        parent=payload.start,
        current=payload.end,
    )


def partial_kind(graph: LinkGraph, form_ref: int) -> str | None:
    form = graph.links[form_ref]
    if form.start == form_ref and form.end != form_ref:
        return "start-open"
    if form.end == form_ref and form.start != form_ref:
        return "end-open"
    return None


def expected_result(graph: LinkGraph, form_ref: int, binding_ref: int) -> Link:
    form = graph.links[form_ref]
    kind = partial_kind(graph, form_ref)
    if kind == "start-open":
        return Link(binding_ref, form.end)
    if kind == "end-open":
        return Link(form.start, binding_ref)
    raise ValueError("resolved form is not one-pole self-closed")


def positional_values(evidence: StepEvidence) -> tuple[int, ...]:
    return (
        evidence.interpreter_ref,
        evidence.source_ref,
        evidence.dictionary_ref,
        evidence.dictionary_membership_ref,
        evidence.theory_ref,
        evidence.theory_membership_ref,
        evidence.form_ref,
        evidence.before_context_ref,
        evidence.binding_ref,
        evidence.result_ref,
        evidence.after_context_ref,
    )


def encode_positional(graph: LinkGraph, values: tuple[int, ...]) -> int:
    if len(values) < 2:
        raise ValueError("positional spine needs at least two values")
    current = graph.intern(values[0], values[1])
    for value in values[2:]:
        current = graph.intern(current, value)
    return current


def decode_positional(graph: LinkGraph, terminal_ref: int, count: int) -> tuple[int, ...]:
    if count < 2:
        raise ValueError("positional schema needs at least two values")
    current = terminal_ref
    tail: list[int] = []
    for _ in range(count - 2):
        link = graph.links[current]
        tail.append(link.end)
        current = link.start
    base = graph.links[current]
    return (base.start, base.end, *reversed(tail))


def build_role_dictionary(graph: LinkGraph) -> tuple[int, dict[str, int]]:
    dictionary_ref = new_scoped_identity(graph)
    role_refs: dict[str, int] = {}
    for role_name in ROLE_NAMES:
        source_carrier = encode_text(role_name)
        source_ref = add_source(graph, source_carrier)
        role_ref = graph.self_closed_end(source_ref)
        add_dictionary_entry(graph, dictionary_ref, source_ref, role_ref)
        role_refs[role_name] = role_ref
    return dictionary_ref, role_refs


def resolve_role(graph: LinkGraph, role_dictionary_ref: int, role_name: str) -> int:
    return lookup_dictionary(
        graph, role_dictionary_ref, encode_text(role_name)
    ).form_ref


def evidence_fields(evidence: StepEvidence) -> dict[str, int]:
    return {
        "interpreter": evidence.interpreter_ref,
        "source": evidence.source_ref,
        "dictionary": evidence.dictionary_ref,
        "dictionary-membership": evidence.dictionary_membership_ref,
        "theory": evidence.theory_ref,
        "theory-membership": evidence.theory_membership_ref,
        "form": evidence.form_ref,
        "before-context": evidence.before_context_ref,
        "binding": evidence.binding_ref,
        "result": evidence.result_ref,
        "after-context": evidence.after_context_ref,
    }


def build_bundle_act(
    graph: LinkGraph,
    evidence: StepEvidence,
    role_dictionary_ref: int,
) -> int:
    payload_ref = graph.intern(
        evidence.interpreter_ref, evidence.after_context_ref
    )
    act_ref = graph.self_closed_start(payload_ref)
    for role_name, value_ref in evidence_fields(evidence).items():
        role_ref = resolve_role(graph, role_dictionary_ref, role_name)
        field_ref = graph.intern(role_ref, value_ref)
        graph.intern(act_ref, field_ref)
    return act_ref


def read_bundle_field(
    graph: LinkGraph,
    act_ref: int,
    role_ref: int,
) -> int:
    matches: list[int] = []
    for attachment_ref, attachment in graph.links.items():
        if attachment_ref == act_ref or attachment.start != act_ref:
            continue
        field = graph.links.get(attachment.end)
        if field is not None and field.start == role_ref:
            matches.append(field.end)
    if len(set(matches)) != 1:
        raise ValueError("bundle field is missing or conflicting")
    return matches[0]


def execute_integrated(
    graph: LinkGraph,
    interpreter_ref: int,
    dictionary_ref: int,
    theory_ref: int,
    before_context_ref: int,
    source_carrier: str,
    role_dictionary_ref: int,
) -> tuple[StepEvidence, ActEncodings]:
    dictionary_resolution = lookup_dictionary(
        graph, dictionary_ref, source_carrier
    )
    form_ref = dictionary_resolution.form_ref
    theory_membership_ref = graph.find_pair(theory_ref, form_ref)
    if theory_membership_ref is None:
        raise MissingTheoryMembership(form_ref)

    before = read_context(graph, before_context_ref)
    binding_ref = before.current
    pair = expected_result(graph, form_ref, binding_ref)
    result_ref = graph.intern(pair.start, pair.end)
    after_context_ref = new_context(graph, before.parent, result_ref)

    evidence = StepEvidence(
        source_carrier=source_carrier,
        interpreter_ref=interpreter_ref,
        source_ref=dictionary_resolution.source_ref,
        dictionary_ref=dictionary_ref,
        dictionary_entry_ref=dictionary_resolution.entry_ref,
        dictionary_membership_ref=dictionary_resolution.membership_ref,
        theory_ref=theory_ref,
        theory_membership_ref=theory_membership_ref,
        form_ref=form_ref,
        before_context_ref=before_context_ref,
        binding_ref=binding_ref,
        result_ref=result_ref,
        after_context_ref=after_context_ref,
    )
    positional_ref = encode_positional(graph, positional_values(evidence))
    bundle_ref = build_bundle_act(graph, evidence, role_dictionary_ref)
    return evidence, ActEncodings(
        positional_ref=positional_ref,
        bundle_ref=bundle_ref,
        role_dictionary_ref=role_dictionary_ref,
    )


def check_integrated(
    graph: LinkGraph,
    evidence: StepEvidence,
    encodings: ActEncodings,
) -> bool:
    """Read-only end-to-end replay of one selected integrated step."""

    before_snapshot = dict(graph.links)
    try:
        try:
            dictionary_resolution = lookup_dictionary(
                graph, evidence.dictionary_ref, evidence.source_carrier
            )
        except (UnknownSource, DictionaryConflict, ValueError):
            return False
        if dictionary_resolution != DictionaryResolution(
            source_ref=evidence.source_ref,
            entry_ref=evidence.dictionary_entry_ref,
            membership_ref=evidence.dictionary_membership_ref,
            form_ref=evidence.form_ref,
        ):
            return False
        if graph.links.get(evidence.theory_membership_ref) != Link(
            evidence.theory_ref, evidence.form_ref
        ):
            return False
        try:
            before = read_context(graph, evidence.before_context_ref)
        except (KeyError, ValueError):
            return False
        if before.current != evidence.binding_ref:
            return False
        try:
            pair = expected_result(
                graph, evidence.form_ref, evidence.binding_ref
            )
        except (KeyError, ValueError):
            return False
        if graph.links.get(evidence.result_ref) != pair:
            return False
        if graph.find_pair(pair.start, pair.end) != evidence.result_ref:
            return False
        try:
            after = read_context(graph, evidence.after_context_ref)
        except (KeyError, ValueError):
            return False
        if after.parent != before.parent or after.current != evidence.result_ref:
            return False
        if decode_positional(
            graph, encodings.positional_ref, len(positional_values(evidence))
        ) != positional_values(evidence):
            return False

        act = graph.links.get(encodings.bundle_ref)
        if act is None or act.start != encodings.bundle_ref:
            return False
        payload = graph.links.get(act.end)
        if payload != Link(evidence.interpreter_ref, evidence.after_context_ref):
            return False
        for role_name, expected_ref in evidence_fields(evidence).items():
            try:
                role_ref = resolve_role(
                    graph, encodings.role_dictionary_ref, role_name
                )
                actual_ref = read_bundle_field(
                    graph, encodings.bundle_ref, role_ref
                )
            except (UnknownSource, DictionaryConflict, ValueError):
                return False
            if actual_ref != expected_ref:
                return False
        return True
    finally:
        assert graph.links == before_snapshot


def prepare_environment():
    graph = LinkGraph()
    interpreter_ref = new_scoped_identity(graph)
    dictionary_ref = new_scoped_identity(graph)
    theory_ref = new_scoped_identity(graph)
    role_dictionary_ref, _ = build_role_dictionary(graph)

    end_open_form = graph.self_closed_end(LINK_REF)
    start_open_form = graph.self_closed_start(UNLINK_REF)
    end_source = encode_text("end-open")
    start_source = encode_text("start-open")
    end_source_ref = add_source(graph, end_source)
    start_source_ref = add_source(graph, start_source)
    add_dictionary_entry(
        graph, dictionary_ref, end_source_ref, end_open_form
    )
    add_dictionary_entry(
        graph, dictionary_ref, start_source_ref, start_open_form
    )
    admit(graph, theory_ref, end_open_form)
    admit(graph, theory_ref, start_open_form)
    return (
        graph,
        interpreter_ref,
        dictionary_ref,
        theory_ref,
        role_dictionary_ref,
        end_open_form,
        start_open_form,
        end_source,
        start_source,
    )


def test_contract_composes_all_lower_foundation_v2_surfaces_without_acceptance():
    value = contract()

    assert value["schema"] == "mts-integrated-interpreter-act-challenge/v0.7"
    assert value["status"] == "candidate-challenge"
    assert value["accepted"] is False
    assert value["issue"] == 219
    assert value["interpreterIdentity"]["interpreterIsLink"] is True
    assert value["interpreterIdentity"]["separateSubjectRequired"] is False
    assert value["veto"]["productionChangeAllowed"] is False


def test_link_ontology_for_integrated_slice_is_still_only_start_end():
    assert [field.name for field in fields(Link)] == ["start", "end"]


def test_end_open_source_runs_complete_vertical_step_and_persists_context():
    (
        graph,
        interpreter_ref,
        dictionary_ref,
        theory_ref,
        role_dictionary_ref,
        end_open_form,
        _,
        end_source,
        _,
    ) = prepare_environment()
    before_context = new_context(graph, ROOT_REF, UNLINK_REF)
    immutable_before = {
        dictionary_ref: graph.links[dictionary_ref],
        theory_ref: graph.links[theory_ref],
        end_open_form: graph.links[end_open_form],
        before_context: graph.links[before_context],
    }

    evidence, encodings = execute_integrated(
        graph,
        interpreter_ref,
        dictionary_ref,
        theory_ref,
        before_context,
        end_source,
        role_dictionary_ref,
    )

    assert evidence.binding_ref == UNLINK_REF
    assert graph.links[evidence.result_ref] == Link(LINK_REF, UNLINK_REF)
    after = read_context(graph, evidence.after_context_ref)
    assert after.parent == ROOT_REF
    assert after.current == evidence.result_ref
    assert evidence.after_context_ref != before_context
    assert all(graph.links[ref] == link for ref, link in immutable_before.items())
    assert check_integrated(graph, evidence, encodings)


def test_start_open_source_runs_symmetric_step_to_same_complete_relation():
    (
        graph,
        interpreter_ref,
        dictionary_ref,
        theory_ref,
        role_dictionary_ref,
        _,
        start_open_form,
        _,
        start_source,
    ) = prepare_environment()
    before_context = new_context(graph, ROOT_REF, LINK_REF)
    form_before = graph.links[start_open_form]

    evidence, encodings = execute_integrated(
        graph,
        interpreter_ref,
        dictionary_ref,
        theory_ref,
        before_context,
        start_source,
        role_dictionary_ref,
    )

    assert evidence.binding_ref == LINK_REF
    assert graph.links[evidence.result_ref] == Link(LINK_REF, UNLINK_REF)
    assert graph.links[start_open_form] == form_before
    assert check_integrated(graph, evidence, encodings)


def test_both_source_rules_can_converge_to_same_exact_result_ref():
    (
        graph,
        interpreter_ref,
        dictionary_ref,
        theory_ref,
        role_dictionary_ref,
        _,
        _,
        end_source,
        start_source,
    ) = prepare_environment()
    end_context = new_context(graph, ROOT_REF, UNLINK_REF)
    start_context = new_context(graph, ROOT_REF, LINK_REF)

    end_evidence, _ = execute_integrated(
        graph,
        interpreter_ref,
        dictionary_ref,
        theory_ref,
        end_context,
        end_source,
        role_dictionary_ref,
    )
    start_evidence, _ = execute_integrated(
        graph,
        interpreter_ref,
        dictionary_ref,
        theory_ref,
        start_context,
        start_source,
        role_dictionary_ref,
    )

    assert end_evidence.result_ref == start_evidence.result_ref


def test_current_pronoun_candidate_covers_root_partial_and_complete_relations():
    graph = LinkGraph()
    root_context = OPEN_REF
    partial = graph.self_closed_end(LINK_REF)
    partial_context = new_context(graph, ROOT_REF, partial)
    complete = graph.intern(LINK_REF, UNLINK_REF)
    complete_context = new_context(graph, ROOT_REF, complete)

    assert read_context(graph, root_context).current == ROOT_REF
    assert read_context(graph, partial_context).current == partial
    assert read_context(graph, complete_context).current == complete


def test_unknown_source_and_dictionary_conflict_stop_before_resolution():
    (
        graph,
        interpreter_ref,
        dictionary_ref,
        theory_ref,
        role_dictionary_ref,
        _,
        start_open_form,
        end_source,
        _,
    ) = prepare_environment()
    before_context = new_context(graph, ROOT_REF, UNLINK_REF)

    with pytest.raises(UnknownSource):
        execute_integrated(
            graph,
            interpreter_ref,
            dictionary_ref,
            theory_ref,
            before_context,
            encode_text("unknown"),
            role_dictionary_ref,
        )

    source_ref = find_source(graph, end_source)
    add_dictionary_entry(
        graph, dictionary_ref, source_ref, start_open_form
    )
    with pytest.raises(DictionaryConflict):
        execute_integrated(
            graph,
            interpreter_ref,
            dictionary_ref,
            theory_ref,
            before_context,
            end_source,
            role_dictionary_ref,
        )


def test_dictionary_resolved_form_not_admitted_by_selected_theory_stops():
    (
        graph,
        interpreter_ref,
        dictionary_ref,
        _,
        role_dictionary_ref,
        _,
        _,
        end_source,
        _,
    ) = prepare_environment()
    empty_theory = new_scoped_identity(graph)
    before_context = new_context(graph, ROOT_REF, UNLINK_REF)

    with pytest.raises(MissingTheoryMembership):
        execute_integrated(
            graph,
            interpreter_ref,
            dictionary_ref,
            empty_theory,
            before_context,
            end_source,
            role_dictionary_ref,
        )


def test_integrated_replay_is_read_only_and_rejects_forged_boundaries():
    (
        graph,
        interpreter_ref,
        dictionary_ref,
        theory_ref,
        role_dictionary_ref,
        _,
        _,
        end_source,
        _,
    ) = prepare_environment()
    before_context = new_context(graph, ROOT_REF, UNLINK_REF)
    evidence, encodings = execute_integrated(
        graph,
        interpreter_ref,
        dictionary_ref,
        theory_ref,
        before_context,
        end_source,
        role_dictionary_ref,
    )
    other_dictionary = new_scoped_identity(graph)
    other_theory = new_scoped_identity(graph)
    other_context = new_context(graph, ROOT_REF, LINK_REF)
    other_result = graph.intern(UNLINK_REF, LINK_REF)
    other_after = new_context(graph, ROOT_REF, other_result)
    before_snapshot = dict(graph.links)

    assert check_integrated(graph, evidence, encodings)
    forged = [
        replace(evidence, source_carrier=encode_text("changed")),
        replace(evidence, dictionary_ref=other_dictionary),
        replace(evidence, dictionary_membership_ref=ROOT_REF),
        replace(evidence, theory_ref=other_theory),
        replace(evidence, theory_membership_ref=ROOT_REF),
        replace(evidence, form_ref=ROOT_REF),
        replace(evidence, before_context_ref=other_context),
        replace(evidence, binding_ref=LINK_REF),
        replace(evidence, result_ref=other_result),
        replace(evidence, after_context_ref=other_after),
    ]
    assert all(not check_integrated(graph, item, encodings) for item in forged)
    assert graph.links == before_snapshot


def test_same_form_admitted_only_by_another_theory_does_not_authorize_selected_theory():
    (
        graph,
        interpreter_ref,
        dictionary_ref,
        theory_ref,
        role_dictionary_ref,
        end_open_form,
        _,
        end_source,
        _,
    ) = prepare_environment()
    other_theory = new_scoped_identity(graph)
    admit(graph, other_theory, end_open_form)
    selected_without_rule = new_scoped_identity(graph)
    before_context = new_context(graph, ROOT_REF, UNLINK_REF)

    assert graph.find_pair(other_theory, end_open_form) is not None
    assert graph.find_pair(selected_without_rule, end_open_form) is None
    with pytest.raises(MissingTheoryMembership):
        execute_integrated(
            graph,
            interpreter_ref,
            dictionary_ref,
            selected_without_rule,
            before_context,
            end_source,
            role_dictionary_ref,
        )
    assert graph.find_pair(theory_ref, end_open_form) is not None


def test_same_source_under_another_dictionary_can_resolve_a_different_form():
    (
        graph,
        interpreter_ref,
        dictionary_ref,
        theory_ref,
        role_dictionary_ref,
        end_open_form,
        start_open_form,
        end_source,
        _,
    ) = prepare_environment()
    other_dictionary = new_scoped_identity(graph)
    source_ref = find_source(graph, end_source)
    add_dictionary_entry(
        graph, other_dictionary, source_ref, start_open_form
    )
    before_end = new_context(graph, ROOT_REF, UNLINK_REF)
    before_start = new_context(graph, ROOT_REF, LINK_REF)

    first, _ = execute_integrated(
        graph,
        interpreter_ref,
        dictionary_ref,
        theory_ref,
        before_end,
        end_source,
        role_dictionary_ref,
    )
    second, _ = execute_integrated(
        graph,
        interpreter_ref,
        other_dictionary,
        theory_ref,
        before_start,
        end_source,
        role_dictionary_ref,
    )

    assert first.form_ref == end_open_form
    assert second.form_ref == start_open_form
    assert first.dictionary_ref != second.dictionary_ref


def test_positional_candidate_round_trips_only_under_exact_position_schema():
    (
        graph,
        interpreter_ref,
        dictionary_ref,
        theory_ref,
        role_dictionary_ref,
        _,
        _,
        end_source,
        _,
    ) = prepare_environment()
    before_context = new_context(graph, ROOT_REF, UNLINK_REF)
    evidence, encodings = execute_integrated(
        graph,
        interpreter_ref,
        dictionary_ref,
        theory_ref,
        before_context,
        end_source,
        role_dictionary_ref,
    )
    values = positional_values(evidence)

    assert decode_positional(graph, encodings.positional_ref, len(values)) == values

    extra_value = graph.self_closed_end(ROOT_REF)
    extended = graph.intern(encodings.positional_ref, extra_value)
    assert decode_positional(graph, extended, len(values)) != values
    assert contract()["candidateA"]["externalPositionSchemaRequired"] is True
    assert contract()["candidateA"]["additiveFieldsStable"] is False


def test_role_bundle_fields_are_resolved_through_explicit_role_dictionary():
    (
        graph,
        interpreter_ref,
        dictionary_ref,
        theory_ref,
        role_dictionary_ref,
        _,
        _,
        end_source,
        _,
    ) = prepare_environment()
    before_context = new_context(graph, ROOT_REF, UNLINK_REF)
    evidence, encodings = execute_integrated(
        graph,
        interpreter_ref,
        dictionary_ref,
        theory_ref,
        before_context,
        end_source,
        role_dictionary_ref,
    )

    for role_name, expected_ref in evidence_fields(evidence).items():
        role_ref = resolve_role(graph, role_dictionary_ref, role_name)
        assert read_bundle_field(graph, encodings.bundle_ref, role_ref) == expected_ref


def test_role_bundle_is_additively_extensible_without_changing_existing_fields():
    (
        graph,
        interpreter_ref,
        dictionary_ref,
        theory_ref,
        role_dictionary_ref,
        _,
        _,
        end_source,
        _,
    ) = prepare_environment()
    before_context = new_context(graph, ROOT_REF, UNLINK_REF)
    evidence, encodings = execute_integrated(
        graph,
        interpreter_ref,
        dictionary_ref,
        theory_ref,
        before_context,
        end_source,
        role_dictionary_ref,
    )
    source_role = resolve_role(graph, role_dictionary_ref, "source")
    source_before = read_bundle_field(graph, encodings.bundle_ref, source_role)

    trace_source = add_source(graph, encode_text("trace"))
    trace_role = graph.self_closed_end(trace_source)
    add_dictionary_entry(
        graph, role_dictionary_ref, trace_source, trace_role
    )
    trace_value = graph.self_closed_end(LINK_REF)
    trace_field = graph.intern(trace_role, trace_value)
    graph.intern(encodings.bundle_ref, trace_field)

    assert read_bundle_field(graph, encodings.bundle_ref, source_role) == source_before
    assert read_bundle_field(graph, encodings.bundle_ref, trace_role) == trace_value


def test_identical_positional_evidence_collapses_but_bundle_act_occurrences_can_be_distinct():
    (
        graph,
        interpreter_ref,
        dictionary_ref,
        theory_ref,
        role_dictionary_ref,
        _,
        _,
        end_source,
        _,
    ) = prepare_environment()
    before_context = new_context(graph, ROOT_REF, UNLINK_REF)
    evidence, encodings = execute_integrated(
        graph,
        interpreter_ref,
        dictionary_ref,
        theory_ref,
        before_context,
        end_source,
        role_dictionary_ref,
    )

    same_positional = encode_positional(graph, positional_values(evidence))
    another_bundle = build_bundle_act(
        graph, evidence, role_dictionary_ref
    )

    assert same_positional == encodings.positional_ref
    assert another_bundle != encodings.bundle_ref
    assert graph.links[another_bundle].start == another_bundle
    assert contract()["candidateB"]["identicalEvidenceOccurrenceIdentityPreserved"] is True


def test_interpreter_link_can_participate_in_multiple_explicit_acts():
    (
        graph,
        interpreter_ref,
        dictionary_ref,
        theory_ref,
        role_dictionary_ref,
        _,
        _,
        end_source,
        start_source,
    ) = prepare_environment()
    end_context = new_context(graph, ROOT_REF, UNLINK_REF)
    start_context = new_context(graph, ROOT_REF, LINK_REF)

    first, first_encodings = execute_integrated(
        graph,
        interpreter_ref,
        dictionary_ref,
        theory_ref,
        end_context,
        end_source,
        role_dictionary_ref,
    )
    second, second_encodings = execute_integrated(
        graph,
        interpreter_ref,
        dictionary_ref,
        theory_ref,
        start_context,
        start_source,
        role_dictionary_ref,
    )

    assert first.interpreter_ref == second.interpreter_ref == interpreter_ref
    assert first_encodings.bundle_ref != second_encodings.bundle_ref
    assert graph.links[first_encodings.bundle_ref].start == first_encodings.bundle_ref
    assert graph.links[second_encodings.bundle_ref].start == second_encodings.bundle_ref


def test_bundle_self_closure_does_not_make_every_self_closed_link_an_act():
    graph = LinkGraph()
    ordinary = graph.self_closed_start(LINK_REF)

    assert graph.links[ordinary] == Link(ordinary, LINK_REF)
    assert contract()["candidateB"]["actIdentity"] == "A = A ⟼ (I ⟼ K')"
    assert ordinary != OPEN_REF


def test_integrated_challenge_keeps_production_and_composition_open():
    value = contract()

    assert value["comparisonBoundary"]["candidateBPreferredAfterChallenge"] is False
    assert value["notDecided"] == [
        "candidate A or candidate B acceptance as canonical act ontology",
        "canonical role vocabulary and its own theory bootstrap",
        "general multi-step interpreter loop",
        "general theory rule composition",
        "colon definition effects",
        "equality semantics after foundation v2",
        "persistent storage/L4 mapping",
        "production migration",
    ]
