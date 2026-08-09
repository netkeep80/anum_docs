"""Non-normative multi-step interpreter-run challenge for issue #230.

The run links actual state-transition occurrences by exact persistent context
refs.  This is deliberately not a generic logical transitivity rule.
"""

from __future__ import annotations

from dataclasses import dataclass, fields
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CHALLENGE = ROOT / "contracts/mts-multistep-interpreter-run-challenge-v0.7.json"

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
class ActView:
    interpreter_ref: int
    dictionary_ref: int
    theory_ref: int
    before_context_ref: int
    after_context_ref: int


@dataclass(frozen=True)
class RunView:
    interpreter_ref: int
    act_refs: tuple[int, ...]


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


def new_identity(graph: LinkGraph) -> int:
    seed = graph.self_closed_end(ROOT_REF)
    return graph.intern(seed, LINK_REF)


def new_context(graph: LinkGraph, current_ref: int) -> int:
    payload_ref = graph.intern(ROOT_REF, current_ref)
    return graph.self_closed_start(payload_ref)


def make_act(
    graph: LinkGraph,
    interpreter_ref: int,
    dictionary_ref: int,
    theory_ref: int,
    before_context_ref: int,
    after_context_ref: int,
) -> int:
    environment_ref = graph.intern(dictionary_ref, theory_ref)
    transition_ref = graph.intern(before_context_ref, after_context_ref)
    payload_ref = graph.intern(environment_ref, transition_ref)
    header_ref = graph.intern(interpreter_ref, payload_ref)
    return graph.self_closed_start(header_ref)


def read_act(graph: LinkGraph, act_ref: int) -> ActView:
    act = graph.links[act_ref]
    if act.start != act_ref:
        raise ValueError("actual act must be start-self-closed")
    header = graph.links[act.end]
    payload = graph.links[header.end]
    environment = graph.links[payload.start]
    transition = graph.links[payload.end]
    return ActView(
        interpreter_ref=header.start,
        dictionary_ref=environment.start,
        theory_ref=environment.end,
        before_context_ref=transition.start,
        after_context_ref=transition.end,
    )


def make_run(
    graph: LinkGraph,
    interpreter_ref: int,
    act_refs: tuple[int, ...],
) -> int:
    if not act_refs:
        raise ValueError("run requires at least one actual act")
    run_ref = graph.self_closed_start(ROOT_REF)
    cell_ref = graph.intern(run_ref, act_refs[0])
    for act_ref in act_refs[1:]:
        cell_ref = graph.intern(cell_ref, act_ref)
    header_ref = graph.intern(interpreter_ref, cell_ref)
    # Run occurrence already exists. Re-pointing is forbidden, so encode final
    # header through a second self-closed run envelope whose occurrence is the
    # actual run identity used for replay.
    actual_run_ref = graph.self_closed_start(header_ref)
    # Bind the first cell to the actual run identity, rebuilding the finite
    # chain so replay needs no host alias from the provisional seed.
    first_cell = graph.intern(actual_run_ref, act_refs[0])
    cell_ref = first_cell
    for act_ref in act_refs[1:]:
        cell_ref = graph.intern(cell_ref, act_ref)
    actual_header = graph.intern(interpreter_ref, cell_ref)
    final_run_ref = graph.self_closed_start(actual_header)
    return final_run_ref


def make_run_direct(
    graph: LinkGraph,
    interpreter_ref: int,
    act_refs: tuple[int, ...],
) -> int:
    """Use a self-closed run whose header points to a backward act-cell chain.

    The run identity is created first over a temporary root payload only to get
    a distinct occurrence ref. Since immutable links cannot be retargeted, the
    replayable run is a second self-closed occurrence whose first cell uses a
    separate stable run-anchor occurrence. The anchor is structural scaffolding,
    not a semantic state transition.
    """

    if not act_refs:
        raise ValueError("run requires at least one actual act")
    run_anchor = graph.self_closed_start(ROOT_REF)
    cell_ref = graph.intern(run_anchor, act_refs[0])
    for act_ref in act_refs[1:]:
        cell_ref = graph.intern(cell_ref, act_ref)
    header_ref = graph.intern(interpreter_ref, cell_ref)
    run_ref = graph.self_closed_start(header_ref)
    # Attach the anchor explicitly so the cell-chain stop ref is discoverable
    # from the run without an incoming-link search.
    anchor_field = graph.intern(OPEN_REF, run_anchor)
    graph.intern(run_ref, anchor_field)
    return run_ref


def find_run_anchor(graph: LinkGraph, run_ref: int) -> int:
    candidates: list[int] = []
    for attachment_ref, attachment in graph.links.items():
        if attachment_ref == run_ref or attachment.start != run_ref:
            continue
        field = graph.links.get(attachment.end)
        if field is not None and field.start == OPEN_REF:
            candidates.append(field.end)
    if len(set(candidates)) != 1:
        raise ValueError("run anchor missing or conflicting")
    return candidates[0]


def read_run(graph: LinkGraph, run_ref: int) -> RunView:
    run = graph.links[run_ref]
    if run.start != run_ref:
        raise ValueError("run must be start-self-closed")
    header = graph.links[run.end]
    interpreter_ref = header.start
    current_cell = header.end
    anchor_ref = find_run_anchor(graph, run_ref)
    reverse_acts: list[int] = []
    while True:
        cell = graph.links[current_cell]
        reverse_acts.append(cell.end)
        if cell.start == anchor_ref:
            break
        current_cell = cell.start
    return RunView(
        interpreter_ref=interpreter_ref,
        act_refs=tuple(reversed(reverse_acts)),
    )


def check_run(graph: LinkGraph, run_ref: int) -> bool:
    before = dict(graph.links)
    try:
        try:
            run = read_run(graph, run_ref)
        except (KeyError, ValueError):
            return False
        previous_after: int | None = None
        for act_ref in run.act_refs:
            try:
                act = read_act(graph, act_ref)
            except (KeyError, ValueError):
                return False
            if act.interpreter_ref != run.interpreter_ref:
                return False
            if previous_after is not None and act.before_context_ref != previous_after:
                return False
            previous_after = act.after_context_ref
        return True
    finally:
        assert graph.links == before


def test_contract_is_non_normative_and_run_is_not_generic_transitivity():
    value = contract()

    assert value["schema"] == "mts-multistep-interpreter-run-challenge/v0.7"
    assert value["status"] == "candidate-challenge"
    assert value["accepted"] is False
    assert value["issue"] == 230
    assert value["runCandidate"]["genericLogicalTransitivityImplied"] is False
    assert value["trustedReplay"]["runIsProofDerivationAutomatically"] is False
    assert value["veto"]["productionChangeAllowed"] is False


def test_links_stay_binary_only():
    assert [field.name for field in fields(Link)] == ["start", "end"]


def test_two_adjacent_actual_acts_form_valid_run():
    graph = LinkGraph()
    interpreter = new_identity(graph)
    dictionary = new_identity(graph)
    theory = new_identity(graph)
    k0 = new_context(graph, ROOT_REF)
    k1 = new_context(graph, LINK_REF)
    k2 = new_context(graph, UNLINK_REF)
    a0 = make_act(graph, interpreter, dictionary, theory, k0, k1)
    a1 = make_act(graph, interpreter, dictionary, theory, k1, k2)
    run = make_run_direct(graph, interpreter, (a0, a1))

    assert read_run(graph, run).act_refs == (a0, a1)
    assert check_run(graph, run)


def test_reordered_acts_with_broken_adjacency_reject():
    graph = LinkGraph()
    interpreter = new_identity(graph)
    dictionary = new_identity(graph)
    theory = new_identity(graph)
    k0 = new_context(graph, ROOT_REF)
    k1 = new_context(graph, LINK_REF)
    k2 = new_context(graph, UNLINK_REF)
    a0 = make_act(graph, interpreter, dictionary, theory, k0, k1)
    a1 = make_act(graph, interpreter, dictionary, theory, k1, k2)
    reordered = make_run_direct(graph, interpreter, (a1, a0))

    assert not check_run(graph, reordered)


def test_skipping_required_intermediate_act_rejects():
    graph = LinkGraph()
    interpreter = new_identity(graph)
    dictionary = new_identity(graph)
    theory = new_identity(graph)
    k0 = new_context(graph, ROOT_REF)
    k1 = new_context(graph, LINK_REF)
    k2 = new_context(graph, UNLINK_REF)
    a0 = make_act(graph, interpreter, dictionary, theory, k0, k1)
    a1 = make_act(graph, interpreter, dictionary, theory, k1, k2)
    a2 = make_act(graph, interpreter, dictionary, theory, k2, k0)
    skipped = make_run_direct(graph, interpreter, (a0, a2))

    assert check_run(graph, make_run_direct(graph, interpreter, (a0, a1, a2)))
    assert not check_run(graph, skipped)


def test_act_valid_alone_can_be_invalid_at_wrong_position():
    graph = LinkGraph()
    interpreter = new_identity(graph)
    dictionary = new_identity(graph)
    theory = new_identity(graph)
    k0 = new_context(graph, ROOT_REF)
    k1 = new_context(graph, LINK_REF)
    k2 = new_context(graph, UNLINK_REF)
    good = make_act(graph, interpreter, dictionary, theory, k0, k1)
    isolated_valid = make_act(graph, interpreter, dictionary, theory, k2, k0)

    assert read_act(graph, isolated_valid).before_context_ref == k2
    run = make_run_direct(graph, interpreter, (good, isolated_valid))
    assert not check_run(graph, run)


def test_dictionary_and_theory_are_explicit_per_act_and_may_change():
    graph = LinkGraph()
    interpreter = new_identity(graph)
    d1 = new_identity(graph)
    d2 = new_identity(graph)
    t1 = new_identity(graph)
    t2 = new_identity(graph)
    k0 = new_context(graph, ROOT_REF)
    k1 = new_context(graph, LINK_REF)
    k2 = new_context(graph, UNLINK_REF)
    a0 = make_act(graph, interpreter, d1, t1, k0, k1)
    a1 = make_act(graph, interpreter, d2, t2, k1, k2)
    run = make_run_direct(graph, interpreter, (a0, a1))

    assert check_run(graph, run)
    assert read_act(graph, a0).dictionary_ref == d1
    assert read_act(graph, a1).dictionary_ref == d2
    assert read_act(graph, a0).theory_ref == t1
    assert read_act(graph, a1).theory_ref == t2


def test_run_construction_and_replay_do_not_mutate_context_refs():
    graph = LinkGraph()
    interpreter = new_identity(graph)
    dictionary = new_identity(graph)
    theory = new_identity(graph)
    k0 = new_context(graph, ROOT_REF)
    k1 = new_context(graph, LINK_REF)
    k0_before = graph.links[k0]
    k1_before = graph.links[k1]
    act = make_act(graph, interpreter, dictionary, theory, k0, k1)
    run = make_run_direct(graph, interpreter, (act,))

    assert check_run(graph, run)
    assert graph.links[k0] == k0_before
    assert graph.links[k1] == k1_before


def test_two_identical_noop_actual_acts_keep_distinct_occurrence_refs_and_order():
    graph = LinkGraph()
    interpreter = new_identity(graph)
    dictionary = new_identity(graph)
    theory = new_identity(graph)
    k0 = new_context(graph, ROOT_REF)
    first = make_act(graph, interpreter, dictionary, theory, k0, k0)
    second = make_act(graph, interpreter, dictionary, theory, k0, k0)

    assert first != second
    run = make_run_direct(graph, interpreter, (first, second))
    assert read_run(graph, run).act_refs == (first, second)
    assert check_run(graph, run)


def test_finite_run_can_return_to_earlier_context_without_infinite_unfolding():
    graph = LinkGraph()
    interpreter = new_identity(graph)
    dictionary = new_identity(graph)
    theory = new_identity(graph)
    k0 = new_context(graph, ROOT_REF)
    k1 = new_context(graph, LINK_REF)
    a0 = make_act(graph, interpreter, dictionary, theory, k0, k1)
    a1 = make_act(graph, interpreter, dictionary, theory, k1, k0)
    run = make_run_direct(graph, interpreter, (a0, a1))

    view = read_run(graph, run)
    assert view.act_refs == (a0, a1)
    assert read_act(graph, a1).after_context_ref == k0
    assert check_run(graph, run)


def test_alternative_acts_from_one_context_form_distinct_branch_runs():
    graph = LinkGraph()
    interpreter = new_identity(graph)
    dictionary = new_identity(graph)
    theory = new_identity(graph)
    k0 = new_context(graph, ROOT_REF)
    k1 = new_context(graph, LINK_REF)
    k2 = new_context(graph, UNLINK_REF)
    left = make_act(graph, interpreter, dictionary, theory, k0, k1)
    right = make_act(graph, interpreter, dictionary, theory, k0, k2)
    left_run = make_run_direct(graph, interpreter, (left,))
    right_run = make_run_direct(graph, interpreter, (right,))

    assert left_run != right_run
    assert check_run(graph, left_run)
    assert check_run(graph, right_run)
    assert read_act(graph, left).before_context_ref == read_act(graph, right).before_context_ref


def test_wrong_interpreter_inside_run_rejects():
    graph = LinkGraph()
    run_interpreter = new_identity(graph)
    other_interpreter = new_identity(graph)
    dictionary = new_identity(graph)
    theory = new_identity(graph)
    k0 = new_context(graph, ROOT_REF)
    k1 = new_context(graph, LINK_REF)
    act = make_act(graph, other_interpreter, dictionary, theory, k0, k1)
    run = make_run_direct(graph, run_interpreter, (act,))

    assert not check_run(graph, run)


def test_forged_terminal_cell_or_anchor_rejects_read_only():
    graph = LinkGraph()
    interpreter = new_identity(graph)
    dictionary = new_identity(graph)
    theory = new_identity(graph)
    k0 = new_context(graph, ROOT_REF)
    k1 = new_context(graph, LINK_REF)
    act = make_act(graph, interpreter, dictionary, theory, k0, k1)
    run = make_run_direct(graph, interpreter, (act,))
    before = dict(graph.links)

    assert check_run(graph, run)
    bogus_header = graph.intern(interpreter, ROOT_REF)
    forged_run = graph.self_closed_start(bogus_header)
    assert not check_run(graph, forged_run)
    assert all(graph.links[ref] == link for ref, link in before.items())


def test_run_does_not_materialize_direct_start_to_end_transition_or_theorem():
    graph = LinkGraph()
    interpreter = new_identity(graph)
    dictionary = new_identity(graph)
    theory = new_identity(graph)
    k0 = new_context(graph, ROOT_REF)
    k1 = new_context(graph, LINK_REF)
    k2 = new_context(graph, UNLINK_REF)
    a0 = make_act(graph, interpreter, dictionary, theory, k0, k1)
    a1 = make_act(graph, interpreter, dictionary, theory, k1, k2)
    direct_before = graph._pairs.get(Link(k0, k2))
    run = make_run_direct(graph, interpreter, (a0, a1))

    assert check_run(graph, run)
    assert graph._pairs.get(Link(k0, k2)) == direct_before
    assert contract()["veto"]["genericTransitivityAccepted"] is False
    assert contract()["veto"]["runAutomaticallyProofAllowed"] is False


def test_gate_l_keeps_canonical_topology_and_production_open():
    value = contract()

    assert value["notDecided"] == [
        "whether this run cell topology is canonical",
        "how the final Gate-R act header/role vocabulary replaces the temporary step oracle",
        "general theory-rule composition",
        "proof lifting from interpreter runs",
        "persistent/L4 run storage",
        "production migration",
    ]
