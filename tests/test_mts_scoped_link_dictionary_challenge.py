"""Non-normative scoped link-dictionary challenge for issue #215.

The trusted lookup path operates only on an already-built binary-link graph.
Exact UTF-8 source carriers are represented by a deterministic root-relative
abit history spine; that source-spine topology itself remains a candidate.
"""

from __future__ import annotations

from dataclasses import dataclass, fields, replace
import json
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[1]
CHALLENGE = ROOT / "contracts/mts-scoped-link-dictionary-challenge-v0.7.json"
STRING_PROTOCOL = ROOT / "contracts/string-anum-byte-protocol-challenge-v0.7.json"

ROOT_REF = 0
OPEN_REF = 1
CLOSE_REF = 2
LINK_REF = 3
UNLINK_REF = 4


@dataclass(frozen=True)
class Link:
    start: int
    end: int


class UnknownSource(ValueError):
    pass


class DictionaryConflict(ValueError):
    pass


@dataclass(frozen=True)
class ResolutionEvidence:
    source_carrier: str
    dictionary_ref: int
    source_ref: int
    entry_ref: int
    membership_ref: int
    form_ref: int


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

    def validate(self) -> None:
        refs = set(self.links)
        assert len(self.links) == len(self._pairs)
        for ref, link in self.links.items():
            assert link.start in refs
            assert link.end in refs
            assert self._pairs[link] == ref


def read(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


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
    raise ValueError(f"not a quaternary abit: {token}")


def add_source_carrier(graph: LinkGraph, carrier: str) -> int:
    current = ROOT_REF
    for token in carrier:
        current = graph.intern(current, abit_meaning(token))
    return current


def find_source_carrier(graph: LinkGraph, carrier: str) -> int:
    current = ROOT_REF
    for token in carrier:
        next_ref = graph.find_pair(current, abit_meaning(token))
        if next_ref is None:
            raise UnknownSource(carrier)
        current = next_ref
    return current


def new_dictionary(graph: LinkGraph) -> int:
    """Dictionary identity is one ordinary self-closed link occurrence."""

    return graph.self_closed_start(ROOT_REF)


def add_dictionary_entry(
    graph: LinkGraph,
    dictionary_ref: int,
    source_ref: int,
    form_ref: int,
) -> tuple[int, int]:
    entry_ref = graph.intern(source_ref, form_ref)
    membership_ref = graph.intern(dictionary_ref, entry_ref)
    return entry_ref, membership_ref


def lookup_memberships(
    graph: LinkGraph,
    dictionary_ref: int,
    source_ref: int,
) -> tuple[tuple[int, int, int], ...]:
    """Return (membership, entry, form) using only graph topology."""

    matches: list[tuple[int, int, int]] = []
    for membership_ref, membership in graph.links.items():
        if membership.start != dictionary_ref:
            continue
        entry = graph.links.get(membership.end)
        if entry is None or entry.start != source_ref:
            continue
        matches.append((membership_ref, membership.end, entry.end))
    return tuple(sorted(matches))


def resolve_unique(
    graph: LinkGraph,
    dictionary_ref: int,
    source_carrier: str,
) -> ResolutionEvidence:
    source_ref = find_source_carrier(graph, source_carrier)
    matches = lookup_memberships(graph, dictionary_ref, source_ref)
    if not matches:
        raise UnknownSource(source_carrier)
    distinct_forms = {form_ref for _, _, form_ref in matches}
    if len(distinct_forms) != 1:
        raise DictionaryConflict(source_carrier)
    membership_ref, entry_ref, form_ref = matches[0]
    return ResolutionEvidence(
        source_carrier=source_carrier,
        dictionary_ref=dictionary_ref,
        source_ref=source_ref,
        entry_ref=entry_ref,
        membership_ref=membership_ref,
        form_ref=form_ref,
    )


def check_resolution(graph: LinkGraph, evidence: ResolutionEvidence) -> bool:
    """Read-only independent replay of one unique dictionary resolution."""

    before = dict(graph.links)
    try:
        try:
            source_ref = find_source_carrier(graph, evidence.source_carrier)
        except (UnknownSource, ValueError):
            return False
        if source_ref != evidence.source_ref:
            return False
        matches = lookup_memberships(graph, evidence.dictionary_ref, source_ref)
        if not matches:
            return False
        if len({form_ref for _, _, form_ref in matches}) != 1:
            return False
        expected = (evidence.membership_ref, evidence.entry_ref, evidence.form_ref)
        return matches == (expected,)
    finally:
        assert graph.links == before


def test_contract_depends_on_exact_string_transport_and_keeps_dictionary_candidate_only():
    challenge = read(CHALLENGE)
    string_protocol = read(STRING_PROTOCOL)

    assert challenge["schema"] == "mts-scoped-link-dictionary-challenge/v0.7"
    assert challenge["status"] == "candidate-challenge"
    assert challenge["accepted"] is False
    assert challenge["issue"] == 215
    assert string_protocol["schema"] in challenge["dependsOn"]
    assert challenge["veto"]["hostStringFormMapAllowed"] is False
    assert challenge["veto"]["productionChangeAllowed"] is False


def test_link_ontology_contains_only_binary_structure():
    assert [field.name for field in fields(Link)] == ["start", "end"]


def test_source_glyphs_use_exact_issue_213_byte_carriers():
    expected = {
        "A": "[01000001]",
        "[": "[01011011]",
        "]": "[01011101]",
        "0": "[00110000]",
        "1": "[00110001]",
    }

    for source, carrier in expected.items():
        assert encode_text(source) == carrier

    protocol = read(STRING_PROTOCOL)
    assert protocol["candidateA"]["byteForm"] == "[bbbbbbbb]"
    assert protocol["candidateA"]["unicodeNormalization"] == "none"


def test_source_ref_is_reconstructed_only_from_root_four_abit_meanings():
    graph = LinkGraph()
    carrier = encode_text("∞")
    source_ref = add_source_carrier(graph, carrier)

    assert find_source_carrier(graph, carrier) == source_ref
    assert source_ref not in {ROOT_REF, OPEN_REF, CLOSE_REF, LINK_REF, UNLINK_REF}
    graph.validate()


def test_one_source_in_one_dictionary_resolves_one_form():
    graph = LinkGraph()
    dictionary_ref = new_dictionary(graph)
    carrier = encode_text("∞")
    source_ref = add_source_carrier(graph, carrier)
    entry_ref, membership_ref = add_dictionary_entry(
        graph, dictionary_ref, source_ref, ROOT_REF
    )

    evidence = resolve_unique(graph, dictionary_ref, carrier)
    assert evidence == ResolutionEvidence(
        source_carrier=carrier,
        dictionary_ref=dictionary_ref,
        source_ref=source_ref,
        entry_ref=entry_ref,
        membership_ref=membership_ref,
        form_ref=ROOT_REF,
    )
    assert check_resolution(graph, evidence)


def test_unknown_source_is_not_inferred_from_utf8_text_or_host_map():
    graph = LinkGraph()
    dictionary_ref = new_dictionary(graph)
    known_carrier = encode_text("∞")
    known_ref = add_source_carrier(graph, known_carrier)
    add_dictionary_entry(graph, dictionary_ref, known_ref, ROOT_REF)

    with pytest.raises(UnknownSource):
        resolve_unique(graph, dictionary_ref, encode_text("?"))


def test_duplicate_identical_declaration_is_exact_pair_idempotent():
    graph = LinkGraph()
    dictionary_ref = new_dictionary(graph)
    carrier = encode_text("1")
    source_ref = add_source_carrier(graph, carrier)

    first = add_dictionary_entry(graph, dictionary_ref, source_ref, LINK_REF)
    second = add_dictionary_entry(graph, dictionary_ref, source_ref, LINK_REF)

    assert first == second
    assert lookup_memberships(graph, dictionary_ref, source_ref) == (
        (first[1], first[0], LINK_REF),
    )
    assert resolve_unique(graph, dictionary_ref, carrier).form_ref == LINK_REF


def test_two_distinct_forms_for_one_source_in_one_dictionary_are_conflict():
    graph = LinkGraph()
    dictionary_ref = new_dictionary(graph)
    carrier = encode_text("x")
    source_ref = add_source_carrier(graph, carrier)
    form_a = graph.intern(LINK_REF, ROOT_REF)
    form_b = graph.intern(UNLINK_REF, ROOT_REF)
    add_dictionary_entry(graph, dictionary_ref, source_ref, form_a)
    add_dictionary_entry(graph, dictionary_ref, source_ref, form_b)

    matches = lookup_memberships(graph, dictionary_ref, source_ref)
    assert {form_ref for _, _, form_ref in matches} == {form_a, form_b}
    with pytest.raises(DictionaryConflict):
        resolve_unique(graph, dictionary_ref, carrier)


def test_same_source_can_resolve_differently_under_two_explicit_dictionaries():
    graph = LinkGraph()
    first_dictionary = new_dictionary(graph)
    second_dictionary = new_dictionary(graph)
    carrier = encode_text("x")
    source_ref = add_source_carrier(graph, carrier)
    form_a = graph.intern(LINK_REF, ROOT_REF)
    form_b = graph.intern(UNLINK_REF, ROOT_REF)
    add_dictionary_entry(graph, first_dictionary, source_ref, form_a)
    add_dictionary_entry(graph, second_dictionary, source_ref, form_b)

    assert resolve_unique(graph, first_dictionary, carrier).form_ref == form_a
    assert resolve_unique(graph, second_dictionary, carrier).form_ref == form_b


def test_two_source_spellings_can_resolve_to_same_form():
    graph = LinkGraph()
    dictionary_ref = new_dictionary(graph)
    first_carrier = encode_text("1")
    second_carrier = encode_text("[]")
    first_source = add_source_carrier(graph, first_carrier)
    second_source = add_source_carrier(graph, second_carrier)
    add_dictionary_entry(graph, dictionary_ref, first_source, LINK_REF)
    add_dictionary_entry(graph, dictionary_ref, second_source, LINK_REF)

    assert first_carrier != second_carrier
    assert first_source != second_source
    assert resolve_unique(graph, dictionary_ref, first_carrier).form_ref == LINK_REF
    assert resolve_unique(graph, dictionary_ref, second_carrier).form_ref == LINK_REF


def test_formal_bootstrap_vocabulary_is_data_driven_after_graph_construction():
    graph = LinkGraph()
    dictionary_ref = new_dictionary(graph)
    custom_forms = {
        "∞": ROOT_REF,
        "[": OPEN_REF,
        "]": CLOSE_REF,
        "1": LINK_REF,
        "0": UNLINK_REF,
        "♂": graph.intern(LINK_REF, OPEN_REF),
        "♀": graph.intern(LINK_REF, CLOSE_REF),
        "⟼": graph.intern(LINK_REF, LINK_REF),
        "↑": graph.intern(OPEN_REF, LINK_REF),
        ":": graph.intern(CLOSE_REF, LINK_REF),
        "=": graph.intern(ROOT_REF, LINK_REF),
    }

    for source, form_ref in custom_forms.items():
        carrier = encode_text(source)
        source_ref = add_source_carrier(graph, carrier)
        add_dictionary_entry(graph, dictionary_ref, source_ref, form_ref)

    for source, form_ref in custom_forms.items():
        assert resolve_unique(graph, dictionary_ref, encode_text(source)).form_ref == form_ref

    new_form = graph.intern(UNLINK_REF, LINK_REF)
    new_carrier = encode_text("§")
    new_source = add_source_carrier(graph, new_carrier)
    add_dictionary_entry(graph, dictionary_ref, new_source, new_form)
    assert resolve_unique(graph, dictionary_ref, new_carrier).form_ref == new_form


def test_dictionary_ref_can_be_ordinary_payload_elsewhere_without_intrinsic_type():
    graph = LinkGraph()
    dictionary_ref = new_dictionary(graph)
    outer = graph.intern(LINK_REF, dictionary_ref)

    assert graph.links[outer] == Link(LINK_REF, dictionary_ref)
    assert graph.links[dictionary_ref].start == dictionary_ref


def test_resolution_evidence_is_read_only_and_rejects_forgery():
    graph = LinkGraph()
    dictionary_ref = new_dictionary(graph)
    carrier = encode_text("∞")
    source_ref = add_source_carrier(graph, carrier)
    entry_ref, membership_ref = add_dictionary_entry(
        graph, dictionary_ref, source_ref, ROOT_REF
    )
    evidence = resolve_unique(graph, dictionary_ref, carrier)
    before = dict(graph.links)

    assert check_resolution(graph, evidence)
    assert graph.links == before

    other_dictionary = new_dictionary(graph)
    forged = [
        replace(evidence, source_carrier=encode_text("1")),
        replace(evidence, dictionary_ref=other_dictionary),
        replace(evidence, source_ref=ROOT_REF),
        replace(evidence, entry_ref=ROOT_REF),
        replace(evidence, membership_ref=ROOT_REF),
        replace(evidence, form_ref=LINK_REF),
    ]
    assert all(not check_resolution(graph, item) for item in forged)
    assert evidence.entry_ref == entry_ref
    assert evidence.membership_ref == membership_ref


def test_conflicted_dictionary_cannot_be_replayed_as_unique_resolution():
    graph = LinkGraph()
    dictionary_ref = new_dictionary(graph)
    carrier = encode_text("x")
    source_ref = add_source_carrier(graph, carrier)
    form_a = graph.intern(LINK_REF, ROOT_REF)
    form_b = graph.intern(UNLINK_REF, ROOT_REF)
    entry_ref, membership_ref = add_dictionary_entry(
        graph, dictionary_ref, source_ref, form_a
    )
    evidence = ResolutionEvidence(
        source_carrier=carrier,
        dictionary_ref=dictionary_ref,
        source_ref=source_ref,
        entry_ref=entry_ref,
        membership_ref=membership_ref,
        form_ref=form_a,
    )
    add_dictionary_entry(graph, dictionary_ref, source_ref, form_b)

    assert not check_resolution(graph, evidence)
    with pytest.raises(DictionaryConflict):
        resolve_unique(graph, dictionary_ref, carrier)


def test_dictionary_membership_does_not_claim_axiom_or_execution_semantics():
    challenge = read(CHALLENGE)

    assert challenge["scopeBoundary"]["dictionaryMembershipMakesFormAnAxiom"] is False
    assert challenge["notDecided"] == [
        "whether the source history spine is the canonical astring link topology",
        "whether dictionary membership is created by executing a colon definition",
        "how multi-character identifiers and tokenization compose dictionary lookup",
        "how forms are executed after resolution",
        "how theory/axiom membership is represented",
        "production migration",
    ]
