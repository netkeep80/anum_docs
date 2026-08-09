"""Non-normative local equality/constraint challenge for issue #226."""

from __future__ import annotations

from dataclasses import dataclass, fields, replace
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CHALLENGE = ROOT / "contracts/mts-local-equality-challenge-v0.7.json"

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
class DecompositionEvidence:
    theory_ref: int
    rule_membership_ref: int
    rule_ref: int
    context_ref: int
    alias_scope_ref: int
    left_ref: int
    right_ref: int
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

    def self_closed_both(self) -> int:
        ref = self._next_ref
        self._next_ref += 1
        pair = Link(ref, ref)
        assert pair not in self._pairs
        self.links[ref] = pair
        self._pairs[pair] = ref
        return ref


def challenge() -> dict:
    return json.loads(CHALLENGE.read_text(encoding="utf-8"))


def new_identity(graph: LinkGraph) -> int:
    seed = graph.self_closed_end(ROOT_REF)
    return graph.intern(seed, LINK_REF)


def new_context(graph: LinkGraph) -> int:
    payload = graph.intern(ROOT_REF, ROOT_REF)
    return graph.self_closed_start(payload)


def new_alias_scope(graph: LinkGraph) -> int:
    return new_identity(graph)


def bind_alias_scope(graph: LinkGraph, context_ref: int, alias_scope_ref: int) -> int:
    return graph.intern(context_ref, alias_scope_ref)


def add_alias(graph: LinkGraph, alias_scope_ref: int, left_ref: int, right_ref: int) -> int:
    entry = graph.intern(left_ref, right_ref)
    return graph.intern(alias_scope_ref, entry)


def local_equal(
    graph: LinkGraph,
    alias_scope_ref: int,
    left_ref: int,
    right_ref: int,
) -> bool:
    if left_ref == right_ref:
        return True
    for membership in graph.links.values():
        if membership.start != alias_scope_ref:
            continue
        entry = graph.links.get(membership.end)
        if entry is None:
            continue
        if (entry.start, entry.end) in {
            (left_ref, right_ref),
            (right_ref, left_ref),
        }:
            return True
    return False


def make_decomposition_rule(graph: LinkGraph) -> int:
    return graph.self_closed_start(LINK_REF)


def admit_rule(graph: LinkGraph, theory_ref: int, rule_ref: int) -> int:
    return graph.intern(theory_ref, rule_ref)


def make_constraint(graph: LinkGraph, left_ref: int, right_ref: int) -> int:
    return graph.intern(left_ref, right_ref)


def decompose_once(
    graph: LinkGraph,
    theory_ref: int,
    rule_membership_ref: int,
    context_ref: int,
    alias_scope_ref: int,
    left_ref: int,
    right_ref: int,
) -> DecompositionEvidence:
    membership = graph.links[rule_membership_ref]
    if membership.start != theory_ref:
        raise ValueError("decomposition rule not admitted by selected theory")
    rule_ref = membership.end
    if graph.find_pair(context_ref, alias_scope_ref) is None:
        raise ValueError("alias scope is not bound to selected context")
    left = graph.links[left_ref]
    right = graph.links[right_ref]
    start_constraint = make_constraint(graph, left.start, right.start)
    end_constraint = make_constraint(graph, left.end, right.end)
    result_ref = graph.intern(start_constraint, end_constraint)
    return DecompositionEvidence(
        theory_ref=theory_ref,
        rule_membership_ref=rule_membership_ref,
        rule_ref=rule_ref,
        context_ref=context_ref,
        alias_scope_ref=alias_scope_ref,
        left_ref=left_ref,
        right_ref=right_ref,
        result_ref=result_ref,
    )


def check_decomposition(graph: LinkGraph, evidence: DecompositionEvidence) -> bool:
    before = dict(graph.links)
    try:
        if graph.links.get(evidence.rule_membership_ref) != Link(
            evidence.theory_ref, evidence.rule_ref
        ):
            return False
        if graph.find_pair(evidence.context_ref, evidence.alias_scope_ref) is None:
            return False
        left = graph.links.get(evidence.left_ref)
        right = graph.links.get(evidence.right_ref)
        if left is None or right is None:
            return False
        start_constraint = graph.find_pair(left.start, right.start)
        end_constraint = graph.find_pair(left.end, right.end)
        if start_constraint is None or end_constraint is None:
            return False
        expected = Link(start_constraint, end_constraint)
        return graph.links.get(evidence.result_ref) == expected
    finally:
        assert graph.links == before


def test_contract_is_non_normative_and_rejects_global_equality_defaults():
    value = challenge()

    assert value["schema"] == "mts-local-equality-challenge/v0.7"
    assert value["status"] == "candidate-challenge"
    assert value["accepted"] is False
    assert value["issue"] == 226
    assert value["veto"]["globalStructuralEqualityAllowed"] is False
    assert value["veto"]["automaticSubstitutivityAllowed"] is False
    assert value["veto"]["automaticTransitivityAllowed"] is False
    assert value["veto"]["productionChangeAllowed"] is False


def test_link_ontology_remains_binary_only():
    assert [field.name for field in fields(Link)] == ["start", "end"]


def test_same_ref_is_locally_equal_without_shape_recursion():
    graph = LinkGraph()
    aliases = new_alias_scope(graph)
    value = graph.self_closed_start(LINK_REF)

    assert local_equal(graph, aliases, value, value)


def test_explicit_local_alias_succeeds_in_both_orientations():
    graph = LinkGraph()
    aliases = new_alias_scope(graph)
    left = graph.self_closed_start(LINK_REF)
    right = graph.self_closed_start(LINK_REF)
    add_alias(graph, aliases, left, right)

    assert local_equal(graph, aliases, left, right)
    assert local_equal(graph, aliases, right, left)


def test_same_refs_can_be_equal_in_one_alias_scope_and_unequal_in_another():
    graph = LinkGraph()
    first_scope = new_alias_scope(graph)
    second_scope = new_alias_scope(graph)
    left = graph.self_closed_end(LINK_REF)
    right = graph.self_closed_end(LINK_REF)
    add_alias(graph, first_scope, left, right)

    assert local_equal(graph, first_scope, left, right)
    assert not local_equal(graph, second_scope, left, right)


def test_structurally_isomorphic_distinct_refs_are_not_equal_without_alias():
    graph = LinkGraph()
    aliases = new_alias_scope(graph)
    left = graph.self_closed_start(LINK_REF)
    right = graph.self_closed_start(LINK_REF)

    assert graph.links[left].end == graph.links[right].end == LINK_REF
    assert left != right
    assert not local_equal(graph, aliases, left, right)


def test_alias_chain_does_not_imply_transitive_equality():
    graph = LinkGraph()
    aliases = new_alias_scope(graph)
    a = graph.self_closed_end(ROOT_REF)
    b = graph.self_closed_end(ROOT_REF)
    c = graph.self_closed_end(ROOT_REF)
    add_alias(graph, aliases, a, b)
    add_alias(graph, aliases, b, c)

    assert local_equal(graph, aliases, a, b)
    assert local_equal(graph, aliases, b, c)
    assert not local_equal(graph, aliases, a, c)


def test_local_alias_does_not_materialize_substituted_relations_elsewhere():
    graph = LinkGraph()
    aliases = new_alias_scope(graph)
    a = graph.self_closed_start(ROOT_REF)
    b = graph.self_closed_start(ROOT_REF)
    c = graph.self_closed_end(ROOT_REF)
    relation = graph.intern(a, c)
    before_substitute = graph.find_pair(b, c)
    add_alias(graph, aliases, a, b)

    assert local_equal(graph, aliases, a, b)
    assert graph.links[relation] == Link(a, c)
    assert graph.find_pair(b, c) == before_substitute


def test_same_self_closed_shape_and_distinguished_pole_do_not_imply_identity():
    graph = LinkGraph()
    aliases = new_alias_scope(graph)
    first = graph.self_closed_start(LINK_REF)
    second = graph.self_closed_start(LINK_REF)

    assert first != second
    assert graph.links[first].end == graph.links[second].end
    assert not local_equal(graph, aliases, first, second)


def test_full_self_closed_occurrence_is_not_root_by_shape_alone():
    graph = LinkGraph()
    aliases = new_alias_scope(graph)
    other = graph.self_closed_both()

    assert graph.links[ROOT_REF] == Link(ROOT_REF, ROOT_REF)
    assert graph.links[other] == Link(other, other)
    assert other != ROOT_REF
    assert not local_equal(graph, aliases, ROOT_REF, other)


def test_theory_admitted_one_step_decomposition_produces_two_pole_constraints():
    graph = LinkGraph()
    theory = new_identity(graph)
    rule = make_decomposition_rule(graph)
    membership = admit_rule(graph, theory, rule)
    context = new_context(graph)
    aliases = new_alias_scope(graph)
    bind_alias_scope(graph, context, aliases)
    left = graph.intern(LINK_REF, UNLINK_REF)
    right = graph.intern(UNLINK_REF, LINK_REF)

    evidence = decompose_once(
        graph, theory, membership, context, aliases, left, right
    )
    package = graph.links[evidence.result_ref]
    start_constraint = graph.links[package.start]
    end_constraint = graph.links[package.end]

    assert start_constraint == Link(LINK_REF, UNLINK_REF)
    assert end_constraint == Link(UNLINK_REF, LINK_REF)
    assert check_decomposition(graph, evidence)


def test_without_selected_theory_membership_decomposition_replay_rejects():
    graph = LinkGraph()
    theory = new_identity(graph)
    other_theory = new_identity(graph)
    rule = make_decomposition_rule(graph)
    membership = admit_rule(graph, theory, rule)
    context = new_context(graph)
    aliases = new_alias_scope(graph)
    bind_alias_scope(graph, context, aliases)
    left = graph.intern(LINK_REF, UNLINK_REF)
    right = graph.intern(UNLINK_REF, LINK_REF)
    evidence = decompose_once(
        graph, theory, membership, context, aliases, left, right
    )

    assert not check_decomposition(
        graph, replace(evidence, theory_ref=other_theory)
    )


def test_decomposing_self_closed_relations_is_finite_and_does_not_recurse():
    graph = LinkGraph()
    theory = new_identity(graph)
    rule = make_decomposition_rule(graph)
    membership = admit_rule(graph, theory, rule)
    context = new_context(graph)
    aliases = new_alias_scope(graph)
    bind_alias_scope(graph, context, aliases)
    left = graph.self_closed_start(LINK_REF)
    right = graph.self_closed_start(LINK_REF)

    evidence = decompose_once(
        graph, theory, membership, context, aliases, left, right
    )
    package = graph.links[evidence.result_ref]

    assert graph.links[package.start] == Link(left, right)
    assert graph.links[package.end] == Link(LINK_REF, LINK_REF)
    assert check_decomposition(graph, evidence)


def test_root_decomposition_is_finite_and_does_not_prove_unique_root_shape():
    graph = LinkGraph()
    theory = new_identity(graph)
    rule = make_decomposition_rule(graph)
    membership = admit_rule(graph, theory, rule)
    context = new_context(graph)
    aliases = new_alias_scope(graph)
    bind_alias_scope(graph, context, aliases)
    other_root_shape = graph.self_closed_both()

    evidence = decompose_once(
        graph,
        theory,
        membership,
        context,
        aliases,
        ROOT_REF,
        other_root_shape,
    )
    package = graph.links[evidence.result_ref]

    assert graph.links[package.start] == Link(ROOT_REF, other_root_shape)
    assert graph.links[package.end] == Link(ROOT_REF, other_root_shape)
    assert not local_equal(graph, aliases, ROOT_REF, other_root_shape)
    assert check_decomposition(graph, evidence)


def test_equality_shaped_constraint_can_exist_as_ordinary_payload_without_execution():
    graph = LinkGraph()
    left = graph.self_closed_end(LINK_REF)
    right = graph.self_closed_end(UNLINK_REF)
    equality_shaped = make_constraint(graph, left, right)
    outer = graph.intern(LINK_REF, equality_shaped)

    assert graph.links[outer] == Link(LINK_REF, equality_shaped)
    assert challenge()["veto"]["equalityAstOpcodeAcceptedAsSemantics"] is False


def test_decomposition_replay_is_read_only_and_rejects_forged_boundaries():
    graph = LinkGraph()
    theory = new_identity(graph)
    other_theory = new_identity(graph)
    rule = make_decomposition_rule(graph)
    membership = admit_rule(graph, theory, rule)
    context = new_context(graph)
    other_context = new_context(graph)
    aliases = new_alias_scope(graph)
    other_aliases = new_alias_scope(graph)
    bind_alias_scope(graph, context, aliases)
    left = graph.intern(LINK_REF, UNLINK_REF)
    right = graph.intern(UNLINK_REF, LINK_REF)
    evidence = decompose_once(
        graph, theory, membership, context, aliases, left, right
    )
    bogus = graph.intern(ROOT_REF, LINK_REF)
    before = dict(graph.links)

    assert check_decomposition(graph, evidence)
    forged = [
        replace(evidence, theory_ref=other_theory),
        replace(evidence, rule_membership_ref=ROOT_REF),
        replace(evidence, rule_ref=ROOT_REF),
        replace(evidence, context_ref=other_context),
        replace(evidence, alias_scope_ref=other_aliases),
        replace(evidence, left_ref=ROOT_REF),
        replace(evidence, right_ref=ROOT_REF),
        replace(evidence, result_ref=bogus),
    ]
    assert all(not check_decomposition(graph, item) for item in forged)
    assert graph.links == before


def test_no_global_transitivity_congruence_substitutivity_or_bisimulation_is_claimed():
    veto = challenge()["veto"]

    assert veto["globalStructuralEqualityAllowed"] is False
    assert veto["graphBisimulationEqualsIdentityAllowed"] is False
    assert veto["automaticSubstitutivityAllowed"] is False
    assert veto["automaticCongruenceAllowed"] is False
    assert veto["automaticTransitivityAllowed"] is False
    assert veto["infiniteRecursiveComparisonAllowed"] is False


def test_equality_gate_keeps_higher_rules_and_production_open():
    value = challenge()

    assert value["notDecided"] == [
        "whether exact-ref-plus-local-alias is the final primitive equality relation",
        "which decomposition/equality forms are admitted by the canonical theory",
        "whether any explicit transitivity/congruence rules should exist at higher theory levels",
        "formal surface syntax and binding behavior of equality after grammar reset",
        "proof lifting from equality-resolution acts",
        "production migration",
    ]
