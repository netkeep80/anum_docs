"""Non-normative Foundation v2 equality challenge for issue #225.

Equality is challenged as a context-local representative constraint. Relation
"decomposition" is a separate, theory-admitted, one-step rule. Neither path
implies recursive graph equality, transitivity, substitutivity or congruence.
"""
from __future__ import annotations

from dataclasses import dataclass, replace
import json
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[1]
CHALLENGE = (
    ROOT_DIR
    / "contracts/mts-foundation-v2-local-equality-challenge-v0.7.json"
)
ROOT = 0


@dataclass(frozen=True)
class Link:
    start: int
    end: int


@dataclass(frozen=True)
class AtomicEqualityEvidence:
    occurrence_ref: int
    theory_ref: int
    rule_ref: int
    context_ref: int
    left_ref: int
    right_ref: int
    left_representative_ref: int
    right_representative_ref: int
    outcome: bool


@dataclass(frozen=True)
class DecompositionEvidence:
    occurrence_ref: int
    theory_ref: int
    rule_ref: int
    context_ref: int
    left_relation_ref: int
    right_relation_ref: int
    generated_constraints: tuple[int, int]


class BindingConflict(ValueError):
    pass


class Graph:
    def __init__(self) -> None:
        root = Link(ROOT, ROOT)
        self.links: dict[int, Link] = {ROOT: root}
        self._pairs: dict[Link, int] = {root: ROOT}
        self._next = 1

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

    def find_pair(self, start: int, end: int) -> int | None:
        return self._pairs.get(Link(start, end))

    def self_closed_start(self, end: int) -> int:
        ref = self._next
        self._next += 1
        link = Link(ref, end)
        assert link not in self._pairs
        self.links[ref] = link
        self._pairs[link] = ref
        return ref

    def self_closed_end(self, start: int) -> int:
        ref = self._next
        self._next += 1
        link = Link(start, ref)
        assert link not in self._pairs
        self.links[ref] = link
        self._pairs[link] = ref
        return ref

    def self_cycle(self) -> int:
        ref = self._next
        self._next += 1
        link = Link(ref, ref)
        assert link not in self._pairs
        self.links[ref] = link
        self._pairs[link] = ref
        return ref

    def fresh_identity(self) -> int:
        return self.self_closed_end(ROOT)

    def validate(self) -> None:
        refs = set(self.links)
        assert len(self.links) == len(self._pairs)
        for ref, link in self.links.items():
            assert link.start in refs
            assert link.end in refs
            assert self._pairs[link] == ref


def contract() -> dict:
    return json.loads(CHALLENGE.read_text(encoding="utf-8"))


def encode_spine(graph: Graph, values: tuple[int, ...]) -> int:
    if len(values) < 2:
        raise ValueError("evidence spine needs at least two refs")
    current = graph.intern(values[0], values[1])
    for value in values[2:]:
        current = graph.intern(current, value)
    return current


def decode_spine(graph: Graph, terminal_ref: int, count: int) -> tuple[int, ...]:
    if count < 2:
        raise ValueError("evidence spine needs at least two refs")
    current = terminal_ref
    tail: list[int] = []
    for _ in range(count - 2):
        link = graph.links[current]
        tail.append(link.end)
        current = link.start
    base = graph.links[current]
    return (base.start, base.end, *reversed(tail))


def encode_occurrence(graph: Graph, values: tuple[int, ...]) -> int:
    """Give one evidence tuple occurrence identity without a host id/tag."""
    return graph.self_closed_start(encode_spine(graph, values))


def check_occurrence(
    graph: Graph,
    occurrence_ref: int,
    expected_values: tuple[int, ...],
) -> bool:
    occurrence = graph.links.get(occurrence_ref)
    if occurrence is None or occurrence.start != occurrence_ref:
        return False
    try:
        actual = decode_spine(graph, occurrence.end, len(expected_values))
    except KeyError:
        return False
    return actual == expected_values


def new_context(graph: Graph) -> int:
    # K is an explicitly supplied local equality scope. Its self-closed shape
    # alone does not globally mean "context"; the selected occurrence does.
    payload = graph.fresh_identity()
    return graph.self_closed_start(payload)


def add_binding(
    graph: Graph,
    context_ref: int,
    member_ref: int,
    representative_ref: int,
) -> int:
    binding_ref = graph.intern(member_ref, representative_ref)
    return graph.intern(context_ref, binding_ref)


def representatives(
    graph: Graph,
    context_ref: int,
    member_ref: int,
) -> set[int]:
    values: set[int] = set()
    for attachment_ref, attachment in graph.links.items():
        # K itself is K -> payload, not K -> binding membership.
        if attachment_ref == context_ref or attachment.start != context_ref:
            continue
        binding = graph.links.get(attachment.end)
        if binding is not None and binding.start == member_ref:
            values.add(binding.end)
    return values


def representative(graph: Graph, context_ref: int, member_ref: int) -> int:
    values = representatives(graph, context_ref, member_ref)
    if not values:
        return member_ref
    if len(values) != 1:
        raise BindingConflict((context_ref, member_ref, tuple(sorted(values))))
    return next(iter(values))


def admit(graph: Graph, theory_ref: int, rule_ref: int) -> int:
    return graph.intern(theory_ref, rule_ref)


def atomic_values(evidence: AtomicEqualityEvidence) -> tuple[int, ...]:
    return (
        evidence.theory_ref,
        evidence.rule_ref,
        evidence.context_ref,
        evidence.left_ref,
        evidence.right_ref,
        evidence.left_representative_ref,
        evidence.right_representative_ref,
    )


def execute_atomic(
    graph: Graph,
    theory_ref: int,
    rule_ref: int,
    context_ref: int,
    left_ref: int,
    right_ref: int,
) -> AtomicEqualityEvidence:
    if graph.find_pair(theory_ref, rule_ref) is None:
        raise ValueError("atomic equality rule is not admitted")
    left_rep = representative(graph, context_ref, left_ref)
    right_rep = representative(graph, context_ref, right_ref)
    provisional = AtomicEqualityEvidence(
        occurrence_ref=-1,
        theory_ref=theory_ref,
        rule_ref=rule_ref,
        context_ref=context_ref,
        left_ref=left_ref,
        right_ref=right_ref,
        left_representative_ref=left_rep,
        right_representative_ref=right_rep,
        outcome=left_rep == right_rep,
    )
    occurrence_ref = encode_occurrence(graph, atomic_values(provisional))
    return replace(provisional, occurrence_ref=occurrence_ref)


def check_atomic(graph: Graph, evidence: AtomicEqualityEvidence) -> bool:
    before = dict(graph.links)
    try:
        if graph.find_pair(evidence.theory_ref, evidence.rule_ref) is None:
            return False
        if not check_occurrence(
            graph,
            evidence.occurrence_ref,
            atomic_values(evidence),
        ):
            return False
        try:
            left_rep = representative(
                graph, evidence.context_ref, evidence.left_ref
            )
            right_rep = representative(
                graph, evidence.context_ref, evidence.right_ref
            )
        except (KeyError, BindingConflict):
            return False
        if left_rep != evidence.left_representative_ref:
            return False
        if right_rep != evidence.right_representative_ref:
            return False
        return (left_rep == right_rep) == evidence.outcome
    finally:
        assert graph.links == before


def is_complete_relation(graph: Graph, ref: int) -> bool:
    link = graph.links[ref]
    return link.start != ref and link.end != ref


def decomposition_values(evidence: DecompositionEvidence) -> tuple[int, ...]:
    start_constraint, end_constraint = evidence.generated_constraints
    return (
        evidence.theory_ref,
        evidence.rule_ref,
        evidence.context_ref,
        evidence.left_relation_ref,
        evidence.right_relation_ref,
        start_constraint,
        end_constraint,
    )


def execute_decomposition(
    graph: Graph,
    theory_ref: int,
    rule_ref: int,
    context_ref: int,
    left_relation_ref: int,
    right_relation_ref: int,
) -> DecompositionEvidence:
    if graph.find_pair(theory_ref, rule_ref) is None:
        raise ValueError("decomposition rule is not admitted")
    if not is_complete_relation(graph, left_relation_ref):
        raise ValueError("left relation is not complete")
    if not is_complete_relation(graph, right_relation_ref):
        raise ValueError("right relation is not complete")

    left = graph.links[left_relation_ref]
    right = graph.links[right_relation_ref]
    # These are ordinary links. They are equality constraints only as explicit
    # outputs of the selected theory rule, not because of their bare topology.
    starts = graph.intern(left.start, right.start)
    ends = graph.intern(left.end, right.end)
    provisional = DecompositionEvidence(
        occurrence_ref=-1,
        theory_ref=theory_ref,
        rule_ref=rule_ref,
        context_ref=context_ref,
        left_relation_ref=left_relation_ref,
        right_relation_ref=right_relation_ref,
        generated_constraints=(starts, ends),
    )
    occurrence_ref = encode_occurrence(graph, decomposition_values(provisional))
    return replace(provisional, occurrence_ref=occurrence_ref)


def check_decomposition(graph: Graph, evidence: DecompositionEvidence) -> bool:
    before = dict(graph.links)
    try:
        if graph.find_pair(evidence.theory_ref, evidence.rule_ref) is None:
            return False
        if not check_occurrence(
            graph,
            evidence.occurrence_ref,
            decomposition_values(evidence),
        ):
            return False
        if not is_complete_relation(graph, evidence.left_relation_ref):
            return False
        if not is_complete_relation(graph, evidence.right_relation_ref):
            return False
        left = graph.links[evidence.left_relation_ref]
        right = graph.links[evidence.right_relation_ref]
        expected = (
            graph.find_pair(left.start, right.start),
            graph.find_pair(left.end, right.end),
        )
        if None in expected:
            return False
        return evidence.generated_constraints == expected
    finally:
        assert graph.links == before


def prepared():
    graph = Graph()
    theory_ref = graph.fresh_identity()
    atomic_rule_ref = graph.fresh_identity()
    decomposition_rule_ref = graph.fresh_identity()
    admit(graph, theory_ref, atomic_rule_ref)
    admit(graph, theory_ref, decomposition_rule_ref)
    k1 = new_context(graph)
    k2 = new_context(graph)
    return (
        graph,
        theory_ref,
        atomic_rule_ref,
        decomposition_rule_ref,
        k1,
        k2,
    )


def test_contract_keeps_equality_candidate_non_normative():
    data = contract()
    assert data["schema"] == "mts-foundation-v2-local-equality-challenge/v0.7"
    assert data["issue"] == 225
    assert data["accepted"] is False
    assert data["candidateAtomic"]["globalRewrite"] is False
    assert data["candidateAtomic"]["transitiveClosure"] is False
    assert data["candidateDecomposition"]["recursiveEvaluation"] is False
    assert data["identityBoundaries"]["graphIsomorphismImpliesEquality"] is False
    assert data["trustedReplay"]["checksExactOccurrence"] is True
    assert data["veto"]["automaticSubstitutivityAllowed"] is False
    assert data["veto"]["productionChangeAllowed"] is False


def test_atomic_equality_is_exact_context_local_and_nontransitive():
    graph, theory, atomic_rule, _, k1, k2 = prepared()
    a = graph.fresh_identity()
    b = graph.fresh_identity()
    c = graph.fresh_identity()
    shared_rep = graph.fresh_identity()

    same = execute_atomic(graph, theory, atomic_rule, k1, a, a)
    assert same.outcome and check_atomic(graph, same)

    add_binding(graph, k1, a, shared_rep)
    add_binding(graph, k1, b, shared_rep)
    local = execute_atomic(graph, theory, atomic_rule, k1, a, b)
    assert local.outcome and check_atomic(graph, local)

    other = execute_atomic(graph, theory, atomic_rule, k2, a, b)
    assert not other.outcome and check_atomic(graph, other)

    k3 = new_context(graph)
    add_binding(graph, k3, a, b)
    add_binding(graph, k3, b, c)
    not_transitive = execute_atomic(graph, theory, atomic_rule, k3, a, c)
    assert not not_transitive.outcome
    assert check_atomic(graph, not_transitive)
    graph.validate()


def test_same_self_closed_shape_and_root_like_cycle_do_not_imply_identity():
    graph, theory, atomic_rule, _, k1, _ = prepared()
    payload = graph.fresh_identity()
    s1 = graph.self_closed_start(payload)
    s2 = graph.self_closed_start(payload)
    assert graph.links[s1].start == s1
    assert graph.links[s2].start == s2
    assert graph.links[s1].end == graph.links[s2].end == payload
    shape_result = execute_atomic(graph, theory, atomic_rule, k1, s1, s2)
    assert not shape_result.outcome
    assert check_atomic(graph, shape_result)

    root_like = graph.self_cycle()
    assert root_like != ROOT
    assert graph.links[root_like] == Link(root_like, root_like)
    root_result = execute_atomic(
        graph, theory, atomic_rule, k1, ROOT, root_like
    )
    assert not root_result.outcome
    assert check_atomic(graph, root_result)


def test_conflicting_bindings_reject_instead_of_choosing_a_winner():
    graph, theory, atomic_rule, _, k1, _ = prepared()
    a = graph.fresh_identity()
    r1 = graph.fresh_identity()
    r2 = graph.fresh_identity()
    add_binding(graph, k1, a, r1)
    add_binding(graph, k1, a, r2)

    forged = AtomicEqualityEvidence(
        occurrence_ref=graph.self_closed_start(ROOT),
        theory_ref=theory,
        rule_ref=atomic_rule,
        context_ref=k1,
        left_ref=a,
        right_ref=a,
        left_representative_ref=r1,
        right_representative_ref=r1,
        outcome=True,
    )
    assert not check_atomic(graph, forged)


def test_decomposition_requires_admitted_rule_and_is_one_step_only():
    graph, theory, _, decomposition_rule, k1, k2 = prepared()
    b1, e1, b2, e2 = [graph.fresh_identity() for _ in range(4)]
    x = graph.intern(b1, e1)
    y = graph.intern(b2, e2)

    evidence = execute_decomposition(
        graph, theory, decomposition_rule, k1, x, y
    )
    assert check_decomposition(graph, evidence)
    start_constraint, end_constraint = evidence.generated_constraints
    assert graph.links[start_constraint] == Link(b1, b2)
    assert graph.links[end_constraint] == Link(e1, e2)

    snapshot = dict(graph.links)
    assert check_decomposition(graph, evidence)
    assert graph.links == snapshot

    # Exact occurrence binding makes changing K/rule/T on the same recorded act
    # a failed replay even when the mathematical pole pairs are unchanged.
    wrong = graph.fresh_identity()
    snapshot = dict(graph.links)
    for forged in (
        replace(evidence, theory_ref=wrong),
        replace(evidence, rule_ref=wrong),
        replace(evidence, context_ref=k2),
    ):
        assert not check_decomposition(graph, forged)
        assert graph.links == snapshot

    partial = graph.self_closed_end(b1)
    try:
        execute_decomposition(
            graph, theory, decomposition_rule, k1, partial, y
        )
    except ValueError:
        pass
    else:
        raise AssertionError("partial relation must not decompose as complete")


def test_cycles_and_sharing_remain_finite_under_one_step_decomposition():
    graph, theory, _, decomposition_rule, k1, _ = prepared()
    shared = graph.fresh_identity()
    left_tail = graph.self_cycle()
    right_tail = graph.self_cycle()
    x = graph.intern(shared, left_tail)
    y = graph.intern(shared, right_tail)

    evidence = execute_decomposition(
        graph, theory, decomposition_rule, k1, x, y
    )
    assert check_decomposition(graph, evidence)
    first, second = evidence.generated_constraints
    assert graph.links[first] == Link(shared, shared)
    assert graph.links[second] == Link(left_tail, right_tail)


def test_equality_data_does_nothing_and_alias_does_not_substitute():
    graph, theory, atomic_rule, _, k1, _ = prepared()
    a = graph.fresh_identity()
    b = graph.fresh_identity()
    tail = graph.fresh_identity()
    unrelated = graph.intern(a, tail)
    equality_shaped_data = graph.intern(a, b)
    snapshot = dict(graph.links)
    assert equality_shaped_data in graph.links
    assert graph.links == snapshot

    rep = graph.fresh_identity()
    add_binding(graph, k1, a, rep)
    add_binding(graph, k1, b, rep)
    evidence = execute_atomic(graph, theory, atomic_rule, k1, a, b)
    snapshot = dict(graph.links)
    assert check_atomic(graph, evidence)
    assert graph.links == snapshot
    assert graph.links[unrelated] == Link(a, tail)
    assert graph.find_pair(b, tail) is None
    assert graph.find_pair(rep, tail) is None


def test_forged_atomic_evidence_rejects_and_checker_is_read_only():
    graph, theory, atomic_rule, _, k1, k2 = prepared()
    a = graph.fresh_identity()
    b = graph.fresh_identity()
    rep = graph.fresh_identity()
    add_binding(graph, k1, a, rep)
    add_binding(graph, k1, b, rep)
    evidence = execute_atomic(graph, theory, atomic_rule, k1, a, b)
    assert evidence.outcome
    snapshot = dict(graph.links)
    assert check_atomic(graph, evidence)
    assert graph.links == snapshot

    wrong = graph.fresh_identity()
    snapshot = dict(graph.links)
    for forged in (
        replace(evidence, theory_ref=wrong),
        replace(evidence, rule_ref=wrong),
        replace(evidence, context_ref=k2),
        replace(evidence, left_representative_ref=wrong),
        replace(evidence, right_representative_ref=wrong),
        replace(evidence, outcome=False),
    ):
        assert not check_atomic(graph, forged)
        assert graph.links == snapshot
