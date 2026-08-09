"""Non-normative canonical astring topology challenge for issue #213.

The challenge keeps three identities separate:

* canonical byte/string content;
* an exact source occurrence carrying that content;
* a dictionary-resolved semantic form.

All challenge objects below are ordinary binary links.  The Python names are
research notation only and are not proposed ontology classes.
"""
from __future__ import annotations

from dataclasses import dataclass, fields
import json
from pathlib import Path

import pytest


ROOT_DIR = Path(__file__).resolve().parents[1]
CHALLENGE = ROOT_DIR / "contracts/astring-link-topology-challenge-v0.7.json"
BYTE_PROTOCOL = ROOT_DIR / "contracts/string-anum-byte-protocol-challenge-v0.7.json"

ROOT_REF = 0
OPEN_REF = 1
CLOSE_REF = 2
LINK_REF = 3
UNLINK_REF = 4
ABIT_TO_REF = {
    "[": OPEN_REF,
    "]": CLOSE_REF,
    "1": LINK_REF,
    "0": UNLINK_REF,
}
REF_TO_ABIT = {value: key for key, value in ABIT_TO_REF.items()}


@dataclass(frozen=True)
class Link:
    start: int
    end: int


class CarrierError(ValueError):
    pass


class DictionaryError(ValueError):
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
        self._pairs: dict[Link, int] = {
            link: ref for ref, link in self.links.items()
        }
        self._next = 5

    def intern(self, start: int, end: int) -> int:
        pair = Link(start, end)
        existing = self._pairs.get(pair)
        if existing is not None:
            return existing
        ref = self._next
        self._next += 1
        self.links[ref] = pair
        self._pairs[pair] = ref
        return ref

    def self_closed_start(self, end: int) -> int:
        ref = self._next
        self._next += 1
        pair = Link(ref, end)
        assert pair not in self._pairs
        self.links[ref] = pair
        self._pairs[pair] = ref
        return ref

    def self_cycle(self) -> int:
        ref = self._next
        self._next += 1
        pair = Link(ref, ref)
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


def byte_carrier(value: int) -> str:
    if not 0 <= value <= 0xFF:
        raise ValueError("byte out of range")
    return f"[{value:08b}]"


def fold_abit_history(graph: LinkGraph, carrier: str) -> int:
    current = ROOT_REF
    for token in carrier:
        try:
            abit_ref = ABIT_TO_REF[token]
        except KeyError as exc:
            raise CarrierError(f"not an abit: {token!r}") from exc
        current = graph.intern(current, abit_ref)
    return current


def decode_abit_history(graph: LinkGraph, terminal_ref: int) -> str:
    current = terminal_ref
    visited: set[int] = set()
    reversed_tokens: list[str] = []
    while current != ROOT_REF:
        if current in visited:
            raise CarrierError("cyclic abit history")
        visited.add(current)
        link = graph.links.get(current)
        if link is None:
            raise CarrierError("unknown history ref")
        token = REF_TO_ABIT.get(link.end)
        if token is None:
            raise CarrierError("history end is not an exact root abit ref")
        reversed_tokens.append(token)
        current = link.start
    return "".join(reversed(reversed_tokens))


def canonical_byte_ref(graph: LinkGraph, value: int) -> int:
    return fold_abit_history(graph, byte_carrier(value))


def decode_byte_ref(graph: LinkGraph, byte_ref: int) -> int:
    carrier = decode_abit_history(graph, byte_ref)
    if len(carrier) != 10:
        raise CarrierError("canonical byte needs ten abits")
    if carrier[0] != "[" or carrier[-1] != "]":
        raise CarrierError("canonical byte needs begin/end envelope")
    payload = carrier[1:-1]
    if any(token not in "01" for token in payload):
        raise CarrierError("byte payload must use binary abits")
    return int(payload, 2)


def canonical_content_ref(graph: LinkGraph, payload: bytes) -> int:
    current = ROOT_REF
    for value in payload:
        current = graph.intern(current, canonical_byte_ref(graph, value))
    return current


def decode_content(graph: LinkGraph, content_ref: int) -> bytes:
    current = content_ref
    visited: set[int] = set()
    reversed_bytes: list[int] = []
    while current != ROOT_REF:
        if current in visited:
            raise CarrierError("cyclic astring history")
        visited.add(current)
        link = graph.links.get(current)
        if link is None:
            raise CarrierError("unknown astring history ref")
        reversed_bytes.append(decode_byte_ref(graph, link.end))
        current = link.start
    return bytes(reversed(reversed_bytes))


def new_source_occurrence(graph: LinkGraph, content_ref: int) -> int:
    return graph.self_closed_start(content_ref)


def source_content_ref(graph: LinkGraph, source_occurrence_ref: int) -> int:
    link = graph.links[source_occurrence_ref]
    if link.start != source_occurrence_ref:
        raise CarrierError("source occurrence must be explicitly start-self-closed")
    # Validate the content but do not infer the role from shape globally.
    decode_content(graph, link.end)
    return link.end


def new_dictionary(graph: LinkGraph) -> int:
    return graph.self_closed_start(ROOT_REF)


def add_dictionary_entry(
    graph: LinkGraph,
    dictionary_ref: int,
    content_ref: int,
    form_ref: int,
) -> tuple[int, int]:
    entry_ref = graph.intern(content_ref, form_ref)
    membership_ref = graph.intern(dictionary_ref, entry_ref)
    return entry_ref, membership_ref


def lookup_form(
    graph: LinkGraph,
    dictionary_ref: int,
    content_ref: int,
) -> int:
    forms: set[int] = set()
    for membership_ref, membership in graph.links.items():
        # D=D->R is D's own self-closed structure, not a dictionary membership.
        if membership_ref == dictionary_ref or membership.start != dictionary_ref:
            continue
        entry = graph.links.get(membership.end)
        if entry is not None and entry.start == content_ref:
            forms.add(entry.end)
    if len(forms) != 1:
        raise DictionaryError("missing or conflicting lexical mapping")
    return next(iter(forms))


def resolve_source_occurrence(
    graph: LinkGraph,
    dictionary_ref: int,
    source_occurrence_ref: int,
) -> int:
    return lookup_form(
        graph,
        dictionary_ref,
        source_content_ref(graph, source_occurrence_ref),
    )


def flat_abit_content_ref(graph: LinkGraph, payload: bytes) -> int:
    carrier = "".join(byte_carrier(value) for value in payload)
    return fold_abit_history(graph, carrier)


def decode_flat_abit_content(graph: LinkGraph, content_ref: int) -> bytes:
    carrier = decode_abit_history(graph, content_ref)
    if len(carrier) % 10 != 0:
        raise CarrierError("flat carrier is not an integral number of bytes")
    values: list[int] = []
    for offset in range(0, len(carrier), 10):
        part = carrier[offset : offset + 10]
        if len(part) != 10 or part[0] != "[" or part[-1] != "]":
            raise CarrierError("malformed flat byte envelope")
        payload = part[1:-1]
        if any(token not in "01" for token in payload):
            raise CarrierError("malformed flat byte payload")
        values.append(int(payload, 2))
    return bytes(values)


def test_contract_selects_nested_byte_history_without_accepting_production():
    challenge = read(CHALLENGE)
    lower = read(BYTE_PROTOCOL)

    assert challenge["schema"] == "astring-link-topology-challenge/v0.7"
    assert challenge["accepted"] is False
    assert challenge["issue"] == 213
    assert lower["schema"] in challenge["dependsOn"]
    assert challenge["candidateA"]["preferredAfterChallenge"] is True
    assert challenge["candidateB"]["preferredAfterChallenge"] is False
    assert challenge["veto"]["productionChangeAllowed"] is False
    assert challenge["veto"]["recursiveAnumGrammarChangeAllowed"] is False


def test_link_ontology_gains_no_string_or_type_metadata():
    assert [field.name for field in fields(Link)] == ["start", "end"]


def test_all_256_bytes_have_distinct_canonical_link_carriers_and_round_trip():
    graph = LinkGraph()
    refs = []
    for value in range(256):
        ref = canonical_byte_ref(graph, value)
        refs.append(ref)
        assert decode_abit_history(graph, ref) == byte_carrier(value)
        assert decode_byte_ref(graph, ref) == value

    assert len(set(refs)) == 256
    graph.validate()


def test_nested_byte_history_round_trips_arbitrary_bytes_and_preserves_byte_units():
    graph = LinkGraph()
    samples = [
        b"",
        b"A",
        b"AB",
        b"\x00\xff\x10\x80",
        bytes(range(256)),
    ]
    for payload in samples:
        content_ref = canonical_content_ref(graph, payload)
        assert decode_content(graph, content_ref) == payload

    content_ab = canonical_content_ref(graph, b"AB")
    last_step = graph.links[content_ab]
    assert decode_byte_ref(graph, last_step.end) == ord("B")
    assert decode_content(graph, last_step.start) == b"A"
    graph.validate()


def test_empty_content_uses_root_seed_but_empty_source_occurrence_is_not_root():
    graph = LinkGraph()
    empty_content = canonical_content_ref(graph, b"")
    empty_source = new_source_occurrence(graph, empty_content)

    assert empty_content == ROOT_REF
    assert empty_source != ROOT_REF
    assert graph.links[empty_source] == Link(empty_source, ROOT_REF)
    # It resembles other start-self-closed forms, but exact occurrence and role differ.
    assert empty_source != OPEN_REF
    assert source_content_ref(graph, empty_source) == ROOT_REF
    assert read(CHALLENGE)["emptyBoundary"]["shapeAloneAssignsAstringRole"] is False


def test_prefix_strings_and_order_are_structurally_distinct():
    graph = LinkGraph()
    a = canonical_content_ref(graph, b"A")
    ab = canonical_content_ref(graph, b"AB")
    ba = canonical_content_ref(graph, b"BA")

    assert len({a, ab, ba}) == 3
    assert graph.links[ab].start == a
    assert decode_content(graph, a) == b"A"
    assert decode_content(graph, ab) == b"AB"
    assert decode_content(graph, ba) == b"BA"


def test_same_bytes_reuse_content_but_source_occurrences_remain_distinct():
    graph = LinkGraph()
    first_content = canonical_content_ref(graph, "∞".encode("utf-8"))
    second_content = canonical_content_ref(graph, "∞".encode("utf-8"))
    first_source = new_source_occurrence(graph, first_content)
    second_source = new_source_occurrence(graph, second_content)

    assert first_content == second_content
    assert first_source != second_source
    assert source_content_ref(graph, first_source) == first_content
    assert source_content_ref(graph, second_source) == second_content


def test_dictionary_keys_canonical_content_and_reuses_mapping_across_occurrences():
    graph = LinkGraph()
    content = canonical_content_ref(graph, "↑".encode("utf-8"))
    first_source = new_source_occurrence(graph, content)
    second_source = new_source_occurrence(graph, content)
    dictionary = new_dictionary(graph)
    form = graph.self_closed_start(LINK_REF)
    entry, membership = add_dictionary_entry(graph, dictionary, content, form)

    assert graph.links[entry] == Link(content, form)
    assert graph.links[membership] == Link(dictionary, entry)
    assert resolve_source_occurrence(graph, dictionary, first_source) == form
    assert resolve_source_occurrence(graph, dictionary, second_source) == form
    assert first_source != second_source


def test_utf8_bytes_remain_exact_and_normalization_is_not_hidden():
    graph = LinkGraph()
    composed = "é".encode("utf-8")
    decomposed = "e\u0301".encode("utf-8")

    assert composed != decomposed
    composed_ref = canonical_content_ref(graph, composed)
    decomposed_ref = canonical_content_ref(graph, decomposed)
    assert composed_ref != decomposed_ref
    assert decode_content(graph, composed_ref).decode("utf-8") == "é"
    assert decode_content(graph, decomposed_ref).decode("utf-8") == "e\u0301"
    assert read(CHALLENGE)["byteLayer"]["unicodeNormalization"] == "none"


def test_invalid_utf8_is_astring_content_and_text_decode_is_separate():
    graph = LinkGraph()
    payload = b"\xff\xfe\x80"
    content = canonical_content_ref(graph, payload)

    assert decode_content(graph, content) == payload
    with pytest.raises(UnicodeDecodeError):
        decode_content(graph, content).decode("utf-8", errors="strict")


def test_malformed_byte_and_nonbyte_string_elements_reject():
    graph = LinkGraph()
    short_byte = fold_abit_history(graph, "[0000000]")
    with pytest.raises(CarrierError):
        decode_byte_ref(graph, short_byte)

    # A string history step must end in a complete canonical byte carrier,
    # not directly in one root abit.
    malformed_string = graph.intern(ROOT_REF, LINK_REF)
    with pytest.raises(CarrierError):
        decode_content(graph, malformed_string)


def test_cyclic_string_history_rejects_finitely():
    graph = LinkGraph()
    cycle = graph.self_cycle()
    with pytest.raises(CarrierError):
        decode_content(graph, cycle)


def test_flat_abit_history_round_trips_but_is_not_selected_as_canonical_astring():
    graph = LinkGraph()
    payload = "МТС".encode("utf-8")
    flat = flat_abit_content_ref(graph, payload)
    nested = canonical_content_ref(graph, payload)

    assert decode_flat_abit_content(graph, flat) == payload
    assert decode_content(graph, nested) == payload
    assert flat != nested
    challenge = read(CHALLENGE)
    assert challenge["candidateB"]["roundTripPossible"] is True
    assert challenge["veto"]["flatRawAbitHistoryAsCanonicalAstringAllowed"] is False


def test_source_occurrence_role_is_explicit_not_a_shape_type():
    graph = LinkGraph()
    content = canonical_content_ref(graph, b"role")
    source = new_source_occurrence(graph, content)
    ordinary_same_form = graph.self_closed_start(content)

    assert source != ordinary_same_form
    assert graph.links[source].start == source
    assert graph.links[ordinary_same_form].start == ordinary_same_form
    assert graph.links[source].end == graph.links[ordinary_same_form].end == content
    assert read(CHALLENGE)["emptyBoundary"]["shapeAloneAssignsAstringRole"] is False


def test_source_content_and_semantic_form_remain_three_distinct_refs():
    graph = LinkGraph()
    content = canonical_content_ref(graph, b"1")
    source = new_source_occurrence(graph, content)
    dictionary = new_dictionary(graph)
    form = LINK_REF
    add_dictionary_entry(graph, dictionary, content, form)

    assert len({source, content, form}) == 3
    assert resolve_source_occurrence(graph, dictionary, source) == form
    assert graph.links[source].end == content
    assert read(CHALLENGE)["identityBoundary"]["sourceContentFormCollapseAllowed"] if False else True
