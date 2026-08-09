"""Non-production Foundation-v2 source-sequence challenge for issue #234.

The host code below is a falsification harness, not ontology.  Semantic identity in
this challenge is represented only by refs to ordinary binary links.  Candidate
search is deliberately untrusted; replay verifies the exact selected evidence.
"""
from __future__ import annotations

from dataclasses import dataclass, fields
import json
from pathlib import Path

import pytest


ROOT_DIR = Path(__file__).resolve().parents[1]
CONTRACT = ROOT_DIR / "contracts/mts-source-sequence-challenge-v0.7.json"

ROOT_REF = 0
OPEN_REF = 1
CLOSE_REF = 2
LINK_REF = 3
UNLINK_REF = 4
ABIT_TO_REF = {"[": OPEN_REF, "]": CLOSE_REF, "1": LINK_REF, "0": UNLINK_REF}


@dataclass(frozen=True)
class Link:
    start: int
    end: int


class ResolutionError(ValueError):
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

    def occurrence(self, content: int) -> int:
        ref = self._next
        self._next += 1
        pair = Link(ref, content)
        self.links[ref] = pair
        self._pairs[pair] = ref
        return ref


def read_contract() -> dict:
    return json.loads(CONTRACT.read_text(encoding="utf-8"))


def byte_carrier(value: int) -> str:
    return f"[{value:08b}]"


def fold_abits(graph: LinkGraph, carrier: str) -> int:
    current = ROOT_REF
    for token in carrier:
        current = graph.intern(current, ABIT_TO_REF[token])
    return current


def canonical_byte(graph: LinkGraph, value: int) -> int:
    return fold_abits(graph, byte_carrier(value))


def canonical_content(graph: LinkGraph, payload: bytes) -> int:
    current = ROOT_REF
    for value in payload:
        current = graph.intern(current, canonical_byte(graph, value))
    return current


@dataclass(frozen=True)
class LexicalDictionary:
    # host container only; keys/values are exact refs produced by link relations
    entries: tuple[tuple[bytes, int], ...]

    def forms_for(self, raw_slice: bytes) -> tuple[int, ...]:
        return tuple(form for source, form in self.entries if source == raw_slice)


@dataclass(frozen=True)
class Segmentation:
    boundaries: tuple[int, ...]
    forms: tuple[int, ...]


@dataclass(frozen=True)
class GrammarRule:
    form_sequence: tuple[int, ...]
    rule_ref: int


@dataclass(frozen=True)
class ReplayEvidence:
    source_occurrence: int
    source_content: int
    raw: bytes
    boundaries: tuple[int, ...]
    forms: tuple[int, ...]
    dictionary_ref: int
    grammar_ref: int
    rule_ref: int
    left: int
    right: int
    result: int


def enumerate_segmentations(raw: bytes, dictionary: LexicalDictionary) -> tuple[Segmentation, ...]:
    """Untrusted candidate enumeration: no semantic tie-break is applied."""
    out: list[Segmentation] = []

    def walk(pos: int, boundaries: list[int], forms: list[int]) -> None:
        if pos == len(raw):
            out.append(Segmentation(tuple(boundaries), tuple(forms)))
            return
        for end in range(pos + 1, len(raw) + 1):
            for form in dictionary.forms_for(raw[pos:end]):
                walk(end, boundaries + [end], forms + [form])

    walk(0, [], [])
    return tuple(out)


def select_by_grammar(
    candidates: tuple[Segmentation, ...], rules: tuple[GrammarRule, ...]
) -> tuple[Segmentation, GrammarRule]:
    matches = [
        (candidate, rule)
        for candidate in candidates
        for rule in rules
        if candidate.forms == rule.form_sequence
    ]
    if len(matches) != 1:
        raise ResolutionError("grammar selection must be exact and unique")
    return matches[0]


def replay_relation_build(
    graph: LinkGraph,
    dictionary: LexicalDictionary,
    grammar_rules: tuple[GrammarRule, ...],
    evidence: ReplayEvidence,
) -> bool:
    if canonical_content(graph, evidence.raw) != evidence.source_content:
        return False
    source = graph.links.get(evidence.source_occurrence)
    if source != Link(evidence.source_occurrence, evidence.source_content):
        return False

    candidates = enumerate_segmentations(evidence.raw, dictionary)
    selected = Segmentation(evidence.boundaries, evidence.forms)
    if selected not in candidates:
        return False

    try:
        selected2, rule = select_by_grammar(candidates, grammar_rules)
    except ResolutionError:
        return False
    if selected2 != selected or rule.rule_ref != evidence.rule_ref:
        return False

    # Generic relation resolution: the selected admitted rule supplies the two
    # explicit operands. There is no branch on the source glyph spelling.
    expected = graph.intern(evidence.left, evidence.right)
    return expected == evidence.result


def test_contract_keeps_host_token_semantics_out_of_foundation():
    contract = read_contract()
    assert contract["schema"] == "mts-source-sequence-challenge/v0.7"
    assert contract["status"] == "candidate-challenge"
    assert contract["accepted"] is False
    preferred = contract["preferredCandidate"]
    assert preferred["searchTrusted"] is False
    assert preferred["selectedSegmentationReplayed"] is True
    assert preferred["hostTokenEnumRequired"] is False
    assert preferred["hostAstOpcodeRequired"] is False
    veto = contract["veto"]
    assert veto["perGlyphSemanticDispatchAllowed"] is False
    assert veto["implicitLongestMatchAllowed"] is False


def test_link_ontology_has_only_binary_poles():
    assert [field.name for field in fields(Link)] == ["start", "end"]


def test_canonical_content_and_exact_source_occurrence_are_separate():
    graph = LinkGraph()
    raw = "a⟼b".encode("utf-8")
    content1 = canonical_content(graph, raw)
    content2 = canonical_content(graph, raw)
    source1 = graph.occurrence(content1)
    source2 = graph.occurrence(content2)

    assert content1 == content2
    assert source1 != source2
    assert graph.links[source1].end == content1
    assert graph.links[source2].end == content1
    assert source1 != content1


def test_multibyte_formal_sign_is_one_lexeme_not_one_semantic_byte():
    graph = LinkGraph()
    f_a = graph.intern(OPEN_REF, LINK_REF)
    f_arrow = graph.intern(LINK_REF, CLOSE_REF)
    f_b = graph.intern(UNLINK_REF, LINK_REF)
    dictionary = LexicalDictionary(((b"a", f_a), ("⟼".encode(), f_arrow), (b"b", f_b)))

    raw = "a⟼b".encode("utf-8")
    candidates = enumerate_segmentations(raw, dictionary)
    assert len("⟼".encode("utf-8")) > 1
    assert candidates == (Segmentation((1, 4, 5), (f_a, f_arrow, f_b)),)


def test_candidate_enumeration_exposes_ambiguity_without_longest_match_policy():
    graph = LinkGraph()
    f_a = graph.intern(OPEN_REF, LINK_REF)
    f_b = graph.intern(CLOSE_REF, LINK_REF)
    f_ab = graph.intern(LINK_REF, UNLINK_REF)
    dictionary = LexicalDictionary(((b"a", f_a), (b"b", f_b), (b"ab", f_ab)))

    candidates = enumerate_segmentations(b"ab", dictionary)
    assert set(candidates) == {
        Segmentation((1, 2), (f_a, f_b)),
        Segmentation((2,), (f_ab,)),
    }


def test_explicit_grammar_selects_one_ambiguous_segmentation():
    graph = LinkGraph()
    f_a = graph.intern(OPEN_REF, LINK_REF)
    f_b = graph.intern(CLOSE_REF, LINK_REF)
    f_ab = graph.intern(LINK_REF, UNLINK_REF)
    rule = graph.intern(f_a, f_b)
    dictionary = LexicalDictionary(((b"a", f_a), (b"b", f_b), (b"ab", f_ab)))
    candidates = enumerate_segmentations(b"ab", dictionary)

    selected, selected_rule = select_by_grammar(candidates, (GrammarRule((f_a, f_b), rule),))
    assert selected == Segmentation((1, 2), (f_a, f_b))
    assert selected_rule.rule_ref == rule


def test_grammar_ambiguity_rejects_instead_of_using_hidden_ranking():
    graph = LinkGraph()
    f_a = graph.intern(OPEN_REF, LINK_REF)
    f_b = graph.intern(CLOSE_REF, LINK_REF)
    f_ab = graph.intern(LINK_REF, UNLINK_REF)
    dictionary = LexicalDictionary(((b"a", f_a), (b"b", f_b), (b"ab", f_ab)))
    candidates = enumerate_segmentations(b"ab", dictionary)
    rules = (
        GrammarRule((f_a, f_b), graph.intern(f_a, f_b)),
        GrammarRule((f_ab,), graph.intern(f_ab, ROOT_REF)),
    )
    with pytest.raises(ResolutionError):
        select_by_grammar(candidates, rules)


def test_same_source_can_resolve_differently_under_two_explicit_dictionaries():
    graph = LinkGraph()
    f1 = graph.intern(OPEN_REF, LINK_REF)
    f2 = graph.intern(CLOSE_REF, UNLINK_REF)
    d1 = LexicalDictionary(((b"x", f1),))
    d2 = LexicalDictionary(((b"x", f2),))
    assert enumerate_segmentations(b"x", d1)[0].forms == (f1,)
    assert enumerate_segmentations(b"x", d2)[0].forms == (f2,)


def test_unknown_slice_has_no_host_fallback():
    graph = LinkGraph()
    f_a = graph.intern(OPEN_REF, LINK_REF)
    dictionary = LexicalDictionary(((b"a", f_a),))
    assert enumerate_segmentations(b"z", dictionary) == ()


def make_end_to_end_fixture():
    graph = LinkGraph()
    raw = "a⟼b".encode("utf-8")
    content = canonical_content(graph, raw)
    source = graph.occurrence(content)

    left = graph.occurrence(ROOT_REF)
    right = graph.occurrence(ROOT_REF)
    f_a = graph.intern(OPEN_REF, LINK_REF)
    f_arrow = graph.intern(LINK_REF, CLOSE_REF)
    f_b = graph.intern(UNLINK_REF, LINK_REF)
    dictionary = LexicalDictionary(((b"a", f_a), ("⟼".encode(), f_arrow), (b"b", f_b)))

    dictionary_ref = graph.occurrence(graph.intern(f_a, f_arrow))
    grammar_ref = graph.occurrence(graph.intern(f_arrow, f_b))
    rule_ref = graph.intern(f_a, f_b)
    grammar = (GrammarRule((f_a, f_arrow, f_b), rule_ref),)
    result = graph.intern(left, right)
    evidence = ReplayEvidence(
        source_occurrence=source,
        source_content=content,
        raw=raw,
        boundaries=(1, 4, 5),
        forms=(f_a, f_arrow, f_b),
        dictionary_ref=dictionary_ref,
        grammar_ref=grammar_ref,
        rule_ref=rule_ref,
        left=left,
        right=right,
        result=result,
    )
    return graph, dictionary, grammar, evidence


def test_end_to_end_selected_sequence_drives_generic_relation_resolution():
    graph, dictionary, grammar, evidence = make_end_to_end_fixture()
    assert replay_relation_build(graph, dictionary, grammar, evidence)


def test_replay_rejects_forged_boundaries_forms_rule_operands_and_result():
    graph, dictionary, grammar, evidence = make_end_to_end_fixture()
    variants = [
        ReplayEvidence(**{**evidence.__dict__, "boundaries": (1, 2, 5)}),
        ReplayEvidence(**{**evidence.__dict__, "forms": tuple(reversed(evidence.forms))}),
        ReplayEvidence(**{**evidence.__dict__, "rule_ref": ROOT_REF}),
        ReplayEvidence(**{**evidence.__dict__, "left": ROOT_REF}),
        ReplayEvidence(**{**evidence.__dict__, "right": ROOT_REF}),
        ReplayEvidence(**{**evidence.__dict__, "result": ROOT_REF}),
        ReplayEvidence(**{**evidence.__dict__, "source_occurrence": evidence.source_content}),
    ]
    for forged in variants:
        assert not replay_relation_build(graph, dictionary, grammar, forged)


def test_historical_diagram_reading_is_evidence_not_axiom():
    historical = read_contract()["historicalDiagramReading"]
    assert historical["largerAchislaComposeFromLowerRelations"] is True
    assert historical["labelsAndPredicatesMayThemselvesBeRelations"] is True
    assert historical["hostObjectLabelsAreNotOntology"] is True
    assert historical["diagramsAreNormativeAxioms"] is False
    assert historical["historicalEqualityOverridesIssue79"] is False
