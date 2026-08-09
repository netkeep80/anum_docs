"""Non-normative explicit theory-network challenge for issue #216.

Theory membership is represented only as T -> F.  The trusted checker replays
one selected partial-form resolution; candidate enumeration/search stays outside
that trusted step.
"""

from __future__ import annotations

from dataclasses import dataclass, fields, replace
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CHALLENGE = ROOT / "contracts/mts-explicit-theory-network-challenge-v0.7.json"
DICTIONARY_CHALLENGE = ROOT / "contracts/mts-scoped-link-dictionary-challenge-v0.7.json"
FOUR_FORMS = ROOT / "contracts/mts-four-binding-forms-challenge-v0.7.json"

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
class ResolutionEvidence:
    theory_ref: int
    membership_ref: int
    form_ref: int
    binding_ref: int
    result_ref: int


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


def read(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def new_scoped_root(graph: LinkGraph) -> int:
    """Create an ordinary non-self-start relation for T or D identity."""

    seed = graph.self_closed_end(ROOT_REF)
    return graph.intern(seed, LINK_REF)


def admit(graph: LinkGraph, theory_ref: int, form_ref: int) -> int:
    return graph.intern(theory_ref, form_ref)


def partial_kind(graph: LinkGraph, form_ref: int) -> str | None:
    link = graph.links[form_ref]
    if link.start == form_ref and link.end != form_ref:
        return "start-open"
    if link.end == form_ref and link.start != form_ref:
        return "end-open"
    return None


def expected_result_pair(
    graph: LinkGraph,
    form_ref: int,
    binding_ref: int,
) -> Link:
    form = graph.links[form_ref]
    kind = partial_kind(graph, form_ref)
    if kind == "start-open":
        return Link(binding_ref, form.end)
    if kind == "end-open":
        return Link(form.start, binding_ref)
    raise ValueError("selected form is not a one-pole self-closed relation")


def execute_selected(
    graph: LinkGraph,
    theory_ref: int,
    membership_ref: int,
    binding_ref: int,
) -> ResolutionEvidence:
    membership = graph.links[membership_ref]
    if membership.start != theory_ref:
        raise ValueError("membership does not belong to selected theory")
    form_ref = membership.end
    expected = expected_result_pair(graph, form_ref, binding_ref)
    result_ref = graph.intern(expected.start, expected.end)
    return ResolutionEvidence(
        theory_ref=theory_ref,
        membership_ref=membership_ref,
        form_ref=form_ref,
        binding_ref=binding_ref,
        result_ref=result_ref,
    )


def check_selected(graph: LinkGraph, evidence: ResolutionEvidence) -> bool:
    """Read-only trusted candidate for one selected theory/form resolution."""

    before = dict(graph.links)
    try:
        membership = graph.links.get(evidence.membership_ref)
        if membership != Link(evidence.theory_ref, evidence.form_ref):
            return False
        try:
            expected = expected_result_pair(
                graph, evidence.form_ref, evidence.binding_ref
            )
        except (KeyError, ValueError):
            return False
        if graph.links.get(evidence.result_ref) != expected:
            return False
        return graph.find_pair(expected.start, expected.end) == evidence.result_ref
    finally:
        assert graph.links == before


def candidate_memberships(graph: LinkGraph, theory_ref: int) -> tuple[int, ...]:
    """Untrusted enumeration surface; ordering carries no semantics."""

    result = []
    for ref, link in graph.links.items():
        if link.start == theory_ref and partial_kind(graph, link.end) is not None:
            result.append(ref)
    return tuple(result)


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


def test_contract_depends_on_dictionary_and_four_form_challenges():
    value = read(CHALLENGE)

    assert value["schema"] == "mts-explicit-theory-network-challenge/v0.7"
    assert value["status"] == "candidate-challenge"
    assert value["accepted"] is False
    assert value["issue"] == 216
    assert read(DICTIONARY_CHALLENGE)["schema"] in value["dependsOn"]
    assert read(FOUR_FORMS)["schema"] in value["dependsOn"]
    assert value["veto"]["isAxiomTagAllowed"] is False
    assert value["veto"]["automaticGlobalRewriteAllowed"] is False
    assert value["veto"]["productionChangeAllowed"] is False


def test_link_has_no_intrinsic_axiom_or_rule_metadata():
    assert [field.name for field in fields(Link)] == ["start", "end"]


def test_theory_form_and_membership_are_ordinary_links():
    graph = LinkGraph()
    theory_ref = new_scoped_root(graph)
    form_ref = graph.self_closed_end(LINK_REF)
    membership_ref = admit(graph, theory_ref, form_ref)

    assert graph.links[membership_ref] == Link(theory_ref, form_ref)
    assert theory_ref != form_ref != membership_ref
    graph.validate()


def test_duplicate_exact_theory_membership_is_idempotent():
    graph = LinkGraph()
    theory_ref = new_scoped_root(graph)
    form_ref = graph.self_closed_end(LINK_REF)

    first = admit(graph, theory_ref, form_ref)
    second = admit(graph, theory_ref, form_ref)

    assert first == second
    assert graph.links[first] == Link(theory_ref, form_ref)


def test_same_form_can_be_admitted_by_two_theories():
    graph = LinkGraph()
    first_theory = new_scoped_root(graph)
    second_theory = new_scoped_root(graph)
    form_ref = graph.self_closed_end(LINK_REF)

    first_membership = admit(graph, first_theory, form_ref)
    second_membership = admit(graph, second_theory, form_ref)

    assert first_membership != second_membership
    assert graph.links[first_membership] == Link(first_theory, form_ref)
    assert graph.links[second_membership] == Link(second_theory, form_ref)


def test_form_can_be_ordinary_payload_without_being_admitted_by_theory():
    graph = LinkGraph()
    theory_ref = new_scoped_root(graph)
    form_ref = graph.self_closed_end(LINK_REF)
    outer = graph.intern(UNLINK_REF, form_ref)

    assert graph.links[outer] == Link(UNLINK_REF, form_ref)
    assert graph.find_pair(theory_ref, form_ref) is None


def test_end_open_admitted_form_resolves_explicit_end_binding():
    graph = LinkGraph()
    theory_ref = new_scoped_root(graph)
    form_ref = graph.self_closed_end(LINK_REF)
    membership_ref = admit(graph, theory_ref, form_ref)
    form_before = graph.links[form_ref]

    evidence = execute_selected(
        graph, theory_ref, membership_ref, UNLINK_REF
    )

    assert graph.links[evidence.result_ref] == Link(LINK_REF, UNLINK_REF)
    assert graph.links[form_ref] == form_before
    assert check_selected(graph, evidence)


def test_start_open_admitted_form_resolves_explicit_start_binding():
    graph = LinkGraph()
    theory_ref = new_scoped_root(graph)
    form_ref = graph.self_closed_start(UNLINK_REF)
    membership_ref = admit(graph, theory_ref, form_ref)
    form_before = graph.links[form_ref]

    evidence = execute_selected(graph, theory_ref, membership_ref, LINK_REF)

    assert graph.links[evidence.result_ref] == Link(LINK_REF, UNLINK_REF)
    assert graph.links[form_ref] == form_before
    assert check_selected(graph, evidence)


def test_both_partial_directions_converge_to_same_complete_relation():
    graph = LinkGraph()
    theory_ref = new_scoped_root(graph)
    end_open = graph.self_closed_end(LINK_REF)
    start_open = graph.self_closed_start(UNLINK_REF)
    end_membership = admit(graph, theory_ref, end_open)
    start_membership = admit(graph, theory_ref, start_open)

    from_end_open = execute_selected(
        graph, theory_ref, end_membership, UNLINK_REF
    )
    from_start_open = execute_selected(
        graph, theory_ref, start_membership, LINK_REF
    )

    assert from_end_open.result_ref == from_start_open.result_ref
    assert graph.links[from_end_open.result_ref] == Link(LINK_REF, UNLINK_REF)


def test_missing_theory_membership_rejects_replay():
    graph = LinkGraph()
    first_theory = new_scoped_root(graph)
    second_theory = new_scoped_root(graph)
    form_ref = graph.self_closed_end(LINK_REF)
    membership_ref = admit(graph, first_theory, form_ref)
    evidence = execute_selected(
        graph, first_theory, membership_ref, UNLINK_REF
    )

    assert check_selected(graph, evidence)
    assert not check_selected(
        graph,
        replace(evidence, theory_ref=second_theory),
    )


def test_trusted_replay_is_read_only_and_rejects_forged_evidence():
    graph = LinkGraph()
    theory_ref = new_scoped_root(graph)
    form_ref = graph.self_closed_end(LINK_REF)
    membership_ref = admit(graph, theory_ref, form_ref)
    evidence = execute_selected(
        graph, theory_ref, membership_ref, UNLINK_REF
    )
    before = dict(graph.links)
    other_theory = new_scoped_root(graph)
    other_form = graph.self_closed_start(UNLINK_REF)
    other_membership = admit(graph, other_theory, other_form)
    other_result = graph.intern(UNLINK_REF, LINK_REF)

    assert check_selected(graph, evidence)
    assert not check_selected(graph, replace(evidence, theory_ref=other_theory))
    assert not check_selected(graph, replace(evidence, membership_ref=other_membership))
    assert not check_selected(graph, replace(evidence, form_ref=other_form))
    assert not check_selected(graph, replace(evidence, binding_ref=LINK_REF))
    assert not check_selected(graph, replace(evidence, result_ref=other_result))
    assert all(graph.links[ref] == link for ref, link in before.items())


def test_multiple_applicable_forms_can_be_enumerated_but_selection_is_explicit():
    graph = LinkGraph()
    theory_ref = new_scoped_root(graph)
    first_form = graph.self_closed_end(LINK_REF)
    second_form = graph.self_closed_end(UNLINK_REF)
    first_membership = admit(graph, theory_ref, first_form)
    second_membership = admit(graph, theory_ref, second_form)

    candidates = candidate_memberships(graph, theory_ref)
    assert set(candidates) == {first_membership, second_membership}

    selected = execute_selected(
        graph, theory_ref, second_membership, ROOT_REF
    )
    assert graph.links[selected.result_ref] == Link(UNLINK_REF, ROOT_REF)
    assert check_selected(graph, selected)
    assert read(CHALLENGE)["searchBoundary"]["candidateEnumerationIsPolicy"] is True
    assert read(CHALLENGE)["veto"]["searchRankingTrusted"] is False


def test_membership_creation_order_has_no_semantic_selection_meaning():
    graph = LinkGraph()
    first_theory = new_scoped_root(graph)
    second_theory = new_scoped_root(graph)
    form_a = graph.self_closed_end(LINK_REF)
    form_b = graph.self_closed_end(UNLINK_REF)

    first_a = admit(graph, first_theory, form_a)
    first_b = admit(graph, first_theory, form_b)
    second_b = admit(graph, second_theory, form_b)
    second_a = admit(graph, second_theory, form_a)

    first_forms = {graph.links[ref].end for ref in candidate_memberships(graph, first_theory)}
    second_forms = {graph.links[ref].end for ref in candidate_memberships(graph, second_theory)}
    assert first_forms == second_forms == {form_a, form_b}
    assert first_a != second_a
    assert first_b != second_b


def test_source_dictionary_form_and_theory_membership_are_distinct_relations():
    graph = LinkGraph()
    dictionary_ref = new_scoped_root(graph)
    theory_ref = new_scoped_root(graph)
    source_carrier = encode_text("∞ : ∞ ⟼ ∞")
    source_ref = add_source(graph, source_carrier)
    form_ref = graph.intern(LINK_REF, ROOT_REF)
    dictionary_entry = graph.intern(source_ref, form_ref)
    dictionary_membership = graph.intern(dictionary_ref, dictionary_entry)
    theory_membership = admit(graph, theory_ref, form_ref)

    refs = {
        source_ref,
        form_ref,
        dictionary_entry,
        dictionary_membership,
        theory_membership,
    }
    assert len(refs) == 5
    assert graph.links[dictionary_entry] == Link(source_ref, form_ref)
    assert graph.links[dictionary_membership] == Link(dictionary_ref, dictionary_entry)
    assert graph.links[theory_membership] == Link(theory_ref, form_ref)


def test_root_description_admission_does_not_create_or_own_root_kernel():
    graph = LinkGraph()
    root_before = graph.links[ROOT_REF]
    source_ref = add_source(graph, encode_text("∞ : ∞ ⟼ ∞"))
    description_form = graph.intern(LINK_REF, ROOT_REF)
    dictionary_ref = new_scoped_root(graph)
    entry = graph.intern(source_ref, description_form)
    graph.intern(dictionary_ref, entry)
    theory_with_description = new_scoped_root(graph)
    theory_without_description = new_scoped_root(graph)
    membership = admit(graph, theory_with_description, description_form)

    assert graph.links[ROOT_REF] == root_before == Link(ROOT_REF, ROOT_REF)
    assert graph.links[membership] == Link(theory_with_description, description_form)
    assert graph.find_pair(theory_without_description, description_form) is None
    assert graph.links[ROOT_REF] == Link(ROOT_REF, ROOT_REF)
    assert read(CHALLENGE)["bootstrapSelfDescription"]["textCreatesRootKernel"] is False


def test_theory_ref_itself_can_be_ordinary_payload():
    graph = LinkGraph()
    theory_ref = new_scoped_root(graph)
    outer = graph.intern(LINK_REF, theory_ref)

    assert graph.links[outer] == Link(LINK_REF, theory_ref)
    assert outer != theory_ref


def test_general_composition_and_colon_effects_remain_open():
    value = read(CHALLENGE)

    assert value["notDecided"] == [
        "general inference/composition between admitted forms",
        "whether colon definitions can create new dictionary/theory relations",
        "how equality-shaped forms resolve under foundation v2",
        "how an interpreter chooses among multiple applicable forms",
        "how active context K/current ↑ is serialized into a full interpretation act",
        "production proof/interpreter migration",
    ]
