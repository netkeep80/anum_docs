"""Non-normative colon-definition effect challenge for issue #224.

Candidate C models a persistent lexical scope snapshot entirely with links:
D = D -> (parentScope -> localHistory), where local history records actual
S->F definition occurrences without evaluating F.
"""

from __future__ import annotations

from dataclasses import dataclass, fields, replace
import json
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[1]
CHALLENGE = ROOT / "contracts/mts-colon-definition-effects-challenge-v0.7.json"

ROOT_REF = 0
OPEN_REF = 1
CLOSE_REF = 2
LINK_REF = 3
UNLINK_REF = 4


@dataclass(frozen=True)
class Link:
    start: int
    end: int


@dataclass(frozen=True)
class ScopeView:
    parent_ref: int
    history_ref: int


@dataclass(frozen=True)
class DefinitionEvidence:
    before_scope_ref: int
    source_carrier: str
    source_ref: int
    form_ref: int
    entry_ref: int
    occurrence_ref: int
    after_scope_ref: int


class UnknownDefinition(ValueError):
    pass


class DefinitionConflict(ValueError):
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


def challenge() -> dict:
    return json.loads(CHALLENGE.read_text(encoding="utf-8"))


def encode_text(text: str) -> str:
    return "".join(f"[{byte:08b}]" for byte in text.encode("utf-8"))


def abit_meaning(token: str) -> int:
    return {"[": OPEN_REF, "]": CLOSE_REF, "1": LINK_REF, "0": UNLINK_REF}[token]


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
            raise UnknownDefinition(carrier)
        current = next_ref
    return current


def make_scope(graph: LinkGraph, parent_ref: int, history_ref: int) -> int:
    payload_ref = graph.intern(parent_ref, history_ref)
    return graph.self_closed_start(payload_ref)


def root_scope(graph: LinkGraph) -> int:
    return make_scope(graph, ROOT_REF, ROOT_REF)


def read_scope(graph: LinkGraph, scope_ref: int) -> ScopeView:
    scope = graph.links[scope_ref]
    if scope.start != scope_ref:
        raise ValueError("scope must be start-self-closed")
    payload = graph.links[scope.end]
    return ScopeView(parent_ref=payload.start, history_ref=payload.end)


def enter_child_scope(graph: LinkGraph, parent_scope_ref: int) -> int:
    return make_scope(graph, parent_scope_ref, ROOT_REF)


def define(
    graph: LinkGraph,
    before_scope_ref: int,
    source_carrier: str,
    form_ref: int,
) -> DefinitionEvidence:
    before = read_scope(graph, before_scope_ref)
    source_ref = add_source(graph, source_carrier)
    entry_ref = graph.intern(source_ref, form_ref)
    occurrence_ref = graph.intern(before_scope_ref, entry_ref)
    history_ref = graph.intern(before.history_ref, occurrence_ref)
    after_scope_ref = make_scope(graph, before.parent_ref, history_ref)
    return DefinitionEvidence(
        before_scope_ref=before_scope_ref,
        source_carrier=source_carrier,
        source_ref=source_ref,
        form_ref=form_ref,
        entry_ref=entry_ref,
        occurrence_ref=occurrence_ref,
        after_scope_ref=after_scope_ref,
    )


def local_entries(graph: LinkGraph, history_ref: int) -> tuple[int, ...]:
    if history_ref == ROOT_REF:
        return ()
    reverse_entries: list[int] = []
    current = history_ref
    seen: set[int] = set()
    while current != ROOT_REF:
        if current in seen:
            raise ValueError("local history cycle")
        seen.add(current)
        cell = graph.links[current]
        occurrence = graph.links[cell.end]
        reverse_entries.append(occurrence.end)
        current = cell.start
    return tuple(reversed(reverse_entries))


def lookup(graph: LinkGraph, scope_ref: int, source_carrier: str) -> int:
    source_ref = find_source(graph, source_carrier)
    current_scope = scope_ref
    while True:
        scope = read_scope(graph, current_scope)
        local_forms = {
            graph.links[entry_ref].end
            for entry_ref in local_entries(graph, scope.history_ref)
            if graph.links[entry_ref].start == source_ref
        }
        if len(local_forms) > 1:
            raise DefinitionConflict(source_carrier)
        if len(local_forms) == 1:
            return next(iter(local_forms))
        if scope.parent_ref == ROOT_REF:
            raise UnknownDefinition(source_carrier)
        current_scope = scope.parent_ref


def count_local_occurrences(
    graph: LinkGraph,
    scope_ref: int,
    source_carrier: str,
) -> int:
    source_ref = find_source(graph, source_carrier)
    scope = read_scope(graph, scope_ref)
    return sum(
        1
        for entry_ref in local_entries(graph, scope.history_ref)
        if graph.links[entry_ref].start == source_ref
    )


def check_definition_effect(graph: LinkGraph, evidence: DefinitionEvidence) -> bool:
    before_snapshot = dict(graph.links)
    try:
        try:
            before = read_scope(graph, evidence.before_scope_ref)
            after = read_scope(graph, evidence.after_scope_ref)
            source_ref = find_source(graph, evidence.source_carrier)
        except (KeyError, ValueError, UnknownDefinition):
            return False
        if source_ref != evidence.source_ref:
            return False
        if graph.links.get(evidence.entry_ref) != Link(
            evidence.source_ref, evidence.form_ref
        ):
            return False
        if graph.links.get(evidence.occurrence_ref) != Link(
            evidence.before_scope_ref, evidence.entry_ref
        ):
            return False
        if after.parent_ref != before.parent_ref:
            return False
        if graph.links.get(after.history_ref) != Link(
            before.history_ref, evidence.occurrence_ref
        ):
            return False
        try:
            resolved = lookup(
                graph, evidence.after_scope_ref, evidence.source_carrier
            )
        except (UnknownDefinition, DefinitionConflict):
            return False
        return resolved == evidence.form_ref
    finally:
        assert graph.links == before_snapshot


def test_contract_is_non_normative_and_rederives_old_environment():
    value = challenge()

    assert value["schema"] == "mts-colon-definition-effects-challenge/v0.7"
    assert value["status"] == "candidate-challenge"
    assert value["accepted"] is False
    assert value["issue"] == 224
    assert value["candidateC"]["preferredAfterChallenge"] is False
    assert value["veto"]["mutableHostLexicalMapAccepted"] is False
    assert value["veto"]["definitionImpliesEquality"] is False
    assert value["veto"]["productionChangeAllowed"] is False


def test_links_have_no_scope_or_definition_metadata_fields():
    assert [field.name for field in fields(Link)] == ["start", "end"]


def test_root_scope_is_self_closed_with_root_parent_and_empty_history():
    graph = LinkGraph()
    scope_ref = root_scope(graph)
    view = read_scope(graph, scope_ref)

    assert view == ScopeView(parent_ref=ROOT_REF, history_ref=ROOT_REF)
    assert graph.links[scope_ref].start == scope_ref


def test_definition_creates_persistent_scope_snapshot_without_mutating_before():
    graph = LinkGraph()
    before = root_scope(graph)
    before_link = graph.links[before]
    carrier = encode_text("x")
    form_ref = graph.self_closed_end(LINK_REF)

    evidence = define(graph, before, carrier, form_ref)

    assert evidence.after_scope_ref != before
    assert graph.links[before] == before_link
    assert lookup(graph, evidence.after_scope_ref, carrier) == form_ref
    with pytest.raises(UnknownDefinition):
        lookup(graph, before, carrier)
    assert check_definition_effect(graph, evidence)


def test_local_history_preserves_definition_occurrence_order():
    graph = LinkGraph()
    scope = root_scope(graph)
    first = define(graph, scope, encode_text("x"), LINK_REF)
    second = define(
        graph, first.after_scope_ref, encode_text("y"), UNLINK_REF
    )
    history = read_scope(graph, second.after_scope_ref).history_ref

    assert local_entries(graph, history) == (first.entry_ref, second.entry_ref)
    assert first.occurrence_ref != second.occurrence_ref


def test_repeated_identical_definition_keeps_unique_mapping_but_distinct_occurrences():
    graph = LinkGraph()
    carrier = encode_text("x")
    scope = root_scope(graph)
    first = define(graph, scope, carrier, LINK_REF)
    second = define(graph, first.after_scope_ref, carrier, LINK_REF)

    assert first.entry_ref == second.entry_ref
    assert first.occurrence_ref != second.occurrence_ref
    assert lookup(graph, second.after_scope_ref, carrier) == LINK_REF
    assert count_local_occurrences(graph, second.after_scope_ref, carrier) == 2
    assert challenge()["candidateC"]["sameLocalRepeatedIdenticalForm"].startswith(
        "idempotent mapping"
    )


def test_distinct_forms_for_same_source_in_same_lexical_scope_conflict():
    graph = LinkGraph()
    carrier = encode_text("x")
    scope = root_scope(graph)
    first = define(graph, scope, carrier, LINK_REF)
    second = define(
        graph, first.after_scope_ref, carrier, UNLINK_REF
    )

    with pytest.raises(DefinitionConflict):
        lookup(graph, second.after_scope_ref, carrier)


def test_child_local_definition_shadows_parent_without_mutating_parent():
    graph = LinkGraph()
    carrier = encode_text("x")
    parent0 = root_scope(graph)
    parent_definition = define(graph, parent0, carrier, LINK_REF)
    parent = parent_definition.after_scope_ref
    parent_link = graph.links[parent]
    child = enter_child_scope(graph, parent)
    child_definition = define(graph, child, carrier, UNLINK_REF)

    assert lookup(graph, parent, carrier) == LINK_REF
    assert lookup(graph, child_definition.after_scope_ref, carrier) == UNLINK_REF
    assert graph.links[parent] == parent_link


def test_missing_child_local_definition_falls_through_explicit_parent_chain():
    graph = LinkGraph()
    carrier = encode_text("x")
    root0 = root_scope(graph)
    parent_definition = define(graph, root0, carrier, LINK_REF)
    child = enter_child_scope(graph, parent_definition.after_scope_ref)

    assert lookup(graph, child, carrier) == LINK_REF


def test_lookup_is_one_step_and_does_not_evaluate_stored_form():
    graph = LinkGraph()
    carrier = encode_text("self")
    scope = root_scope(graph)
    opaque_recursive_form = graph.self_closed_start(ROOT_REF)
    evidence = define(graph, scope, carrier, opaque_recursive_form)

    assert lookup(graph, evidence.after_scope_ref, carrier) == opaque_recursive_form
    assert graph.links[opaque_recursive_form].start == opaque_recursive_form


def test_self_and_mutual_reference_forms_store_without_recursive_normalization():
    graph = LinkGraph()
    scope = root_scope(graph)
    self_form = graph.self_closed_start(LINK_REF)
    mutual_left = graph.self_closed_start(UNLINK_REF)
    mutual_right = graph.self_closed_end(mutual_left)
    first = define(graph, scope, encode_text("self"), self_form)
    second = define(
        graph, first.after_scope_ref, encode_text("left"), mutual_left
    )
    third = define(
        graph, second.after_scope_ref, encode_text("right"), mutual_right
    )

    assert lookup(graph, third.after_scope_ref, encode_text("self")) == self_form
    assert lookup(graph, third.after_scope_ref, encode_text("left")) == mutual_left
    assert lookup(graph, third.after_scope_ref, encode_text("right")) == mutual_right


def test_empty_root_scope_injects_no_hidden_definitions():
    graph = LinkGraph()
    scope = root_scope(graph)
    for name in ("∞", "1", "0", "[", "]"):
        with pytest.raises(UnknownDefinition):
            lookup(graph, scope, encode_text(name))


def test_definition_effect_creates_no_equality_or_theorem_relation():
    graph = LinkGraph()
    scope = root_scope(graph)
    carrier = encode_text("x")
    form_ref = graph.self_closed_end(LINK_REF)
    evidence = define(graph, scope, carrier, form_ref)

    assert graph.links[evidence.entry_ref] == Link(evidence.source_ref, form_ref)
    assert graph.find_pair(form_ref, evidence.source_ref) is None
    assert challenge()["veto"]["definitionImpliesEquality"] is False


def test_occurrence_identity_binds_before_scope_not_globally_reused_entry_pair():
    graph = LinkGraph()
    scope = root_scope(graph)
    carrier = encode_text("x")
    first = define(graph, scope, carrier, LINK_REF)
    second = define(graph, first.after_scope_ref, carrier, LINK_REF)

    assert first.entry_ref == second.entry_ref
    assert first.occurrence_ref != second.occurrence_ref
    assert graph.links[first.occurrence_ref] == Link(
        first.before_scope_ref, first.entry_ref
    )
    assert graph.links[second.occurrence_ref] == Link(
        second.before_scope_ref, second.entry_ref
    )


def test_effect_replay_is_read_only_and_rejects_forged_evidence():
    graph = LinkGraph()
    before = root_scope(graph)
    carrier = encode_text("x")
    form_ref = graph.self_closed_end(LINK_REF)
    evidence = define(graph, before, carrier, form_ref)
    other_scope = root_scope(graph)
    other_form = graph.self_closed_start(UNLINK_REF)
    before_snapshot = dict(graph.links)

    assert check_definition_effect(graph, evidence)
    forged = [
        replace(evidence, before_scope_ref=other_scope),
        replace(evidence, source_carrier=encode_text("y")),
        replace(evidence, source_ref=ROOT_REF),
        replace(evidence, form_ref=other_form),
        replace(evidence, entry_ref=ROOT_REF),
        replace(evidence, occurrence_ref=ROOT_REF),
        replace(evidence, after_scope_ref=other_scope),
    ]
    assert all(not check_definition_effect(graph, item) for item in forged)
    assert graph.links == before_snapshot


def test_historical_same_identical_definition_conflict_is_not_silently_preserved():
    parity = challenge()["historicalParityClassificationCandidate"]

    assert "same-scope repeated identical definition automatically conflicts" in parity[
        "rederiveOrSupersede"
    ]
    assert "different local forms for one source conflict" in parity["preserve"]
    assert "child local definition shadows parent" in parity["preserve"]


def test_ast_specific_empty_target_addressability_is_explicitly_outside_gate():
    parity = challenge()["historicalParityClassificationCandidate"]

    assert "AST-specific addressability of empty () and [] targets" in parity[
        "rederiveOrSupersede"
    ]


def test_definition_candidate_remains_noncanonical_and_production_blocked():
    value = challenge()

    assert value["notDecided"] == [
        "whether candidate C is accepted as canonical lexical dictionary topology",
        "whether repeated identical definitions should be semantically idempotent or conflict in final MTS",
        "canonical source/form syntax for colon definitions after grammar reset",
        "whether a definition effect also changes active interpreter context K",
        "interaction with theory admission T",
        "production migration",
    ]
