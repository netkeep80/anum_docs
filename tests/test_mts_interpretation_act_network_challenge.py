"""Non-normative executable challenge for issue #173.

The model intentionally contains only finite binary links. Human role names are
kept outside the carrier so tests can expose when a topology depends on an
external positional schema rather than making roles internally distinguishable.
"""

from dataclasses import dataclass, fields
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CHALLENGE = ROOT / "contracts/mts-interpretation-act-network-challenge-v0.6.json"
CURRENT_LINK_CHALLENGE = ROOT / "contracts/mts-current-link-foundation-challenge-v0.6.json"
MTS_V05 = ROOT / "contracts/mts-contract-v0.5.json"


@dataclass(frozen=True)
class Link:
    start: int
    end: int


@dataclass(frozen=True)
class FiniteLinkGraph:
    links: dict[int, Link]

    def validate_closed(self) -> None:
        refs = set(self.links)
        for ref, link in self.links.items():
            assert link.start in refs, (ref, "start", link.start)
            assert link.end in refs, (ref, "end", link.end)

    def forward_closure(self, root: int) -> frozenset[int]:
        assert root in self.links
        seen: set[int] = set()
        pending = [root]
        while pending:
            ref = pending.pop()
            if ref in seen:
                continue
            seen.add(ref)
            link = self.links[ref]
            pending.extend((link.start, link.end))
        return frozenset(seen)

    def incoming(self, target: int) -> frozenset[int]:
        return frozenset(
            ref
            for ref, link in self.links.items()
            if link.start == target or link.end == target
        )


def atom(ref: int) -> tuple[int, Link]:
    """A self-closed link used only as a finite challenge anchor."""

    return ref, Link(ref, ref)


def read_contract() -> dict:
    return json.loads(CHALLENGE.read_text(encoding="utf-8"))


def positional_spine_graph() -> tuple[FiniteLinkGraph, int, dict[str, int]]:
    # External role names are deliberately outside the graph.
    roles = {"I": 1, "F": 2, "X": 3, "M": 4, "R": 5}
    graph = FiniteLinkGraph(
        {
            **dict(atom(ref) for ref in roles.values()),
            10: Link(roles["I"], roles["F"]),
            11: Link(10, roles["X"]),
            12: Link(11, roles["M"]),
            13: Link(12, roles["R"]),
        }
    )
    return graph, 13, roles


def transition_graph() -> tuple[FiniteLinkGraph, dict[str, int]]:
    # Atomic challenge anchors. Their human names are fixture metadata, not
    # ontology; this is precisely what candidate C still has to solve later.
    role = {
        "I": 1,
        "F": 2,
        "X": 3,
        "M": 4,
        "R": 5,
        "R2": 6,
    }
    graph = FiniteLinkGraph(
        {
            **dict(atom(ref) for ref in role.values()),
            # before-state: ((I,M),(F,X))
            10: Link(role["I"], role["M"]),
            11: Link(role["F"], role["X"]),
            12: Link(10, 11),  # S_before
            # after-state: ((I,M),(R,X))
            13: Link(role["I"], role["M"]),
            14: Link(role["R"], role["X"]),
            15: Link(13, 14),  # S_after
            16: Link(12, 15),  # Act A = S_before -> S_after
            # A second transition and an explicit history/continuation relation.
            17: Link(role["I"], role["M"]),
            18: Link(role["R2"], role["X"]),
            19: Link(17, 18),  # S_after2
            20: Link(15, 19),  # Act A2
            21: Link(16, 20),  # continuation/history link A -> A2
        }
    )
    refs = {
        **role,
        "S_before": 12,
        "S_after": 15,
        "A": 16,
        "S_after2": 19,
        "A2": 20,
        "history": 21,
    }
    return graph, refs


def test_challenge_is_non_normative_and_composes_first_foundation_evidence():
    contract = read_contract()
    first = json.loads(CURRENT_LINK_CHALLENGE.read_text(encoding="utf-8"))
    accepted = MTS_V05.read_text(encoding="utf-8")

    assert contract["schema"] == "mts-interpretation-act-network-challenge/v0.6"
    assert contract["status"] == "candidate-challenge"
    assert contract["accepted"] is False
    assert first["schema"] in contract["dependsOn"]
    assert contract["schema"] not in accepted
    assert contract["nextGate"]["productionChangeBeforeDecision"] is False
    assert contract["nextGate"]["acceptedContractLinkAllowed"] is False


def test_carrier_node_type_contains_only_two_link_poles():
    assert [field.name for field in fields(Link)] == ["start", "end"]

    for graph, _root in ((positional_spine_graph()[0], positional_spine_graph()[1]),):
        graph.validate_closed()
        assert all(isinstance(link, Link) for link in graph.links.values())

    graph, _refs = transition_graph()
    graph.validate_closed()
    assert all(isinstance(link, Link) for link in graph.links.values())


def test_positional_spine_is_binary_but_role_meaning_is_external():
    graph, act, roles = positional_spine_graph()
    graph.validate_closed()

    assert graph.forward_closure(act) == frozenset(graph.links)

    # The exact same carrier admits a different external interpretation of two
    # structurally atomic refs. Nothing inside the graph says that ref 1 is
    # "interpreter" and ref 2 is "form".
    alternative_roles = dict(roles)
    alternative_roles["I"], alternative_roles["F"] = roles["F"], roles["I"]

    assert alternative_roles != roles
    assert graph.links == positional_spine_graph()[0].links
    assert read_contract()["candidateTopologies"][0]["status"] == "likely-reject"


def test_transition_candidate_makes_actual_act_a_binary_before_after_link():
    graph, ref = transition_graph()
    graph.validate_closed()

    act = graph.links[ref["A"]]
    assert act == Link(ref["S_before"], ref["S_after"])
    assert ref["F"] != ref["A"]
    assert ref["R"] != ref["A"]

    before = graph.forward_closure(ref["S_before"])
    after = graph.forward_closure(ref["S_after"])
    assert ref["F"] in before
    assert ref["X"] in before
    assert ref["M"] in before
    assert ref["R"] not in before
    assert ref["R"] in after


def test_result_and_next_state_are_not_hidden_return_values():
    graph, ref = transition_graph()
    act_closure = graph.forward_closure(ref["A"])

    assert ref["S_after"] in act_closure
    assert ref["R"] in act_closure
    assert ref["A"] in graph.links
    assert ref["R"] in graph.links


def test_continuation_is_an_ordinary_link_not_a_host_parent_field():
    graph, ref = transition_graph()

    assert graph.links[ref["A2"]] == Link(ref["S_after"], ref["S_after2"])
    assert graph.links[ref["history"]] == Link(ref["A"], ref["A2"])
    assert [field.name for field in fields(Link)] == ["start", "end"]
    assert "parent" not in {field.name for field in fields(Link)}


def test_focus_anchor_has_strictly_local_forward_closure():
    graph, ref = transition_graph()

    focus_closure = graph.forward_closure(ref["X"])
    act_closure = graph.forward_closure(ref["A"])

    assert focus_closure == frozenset({ref["X"]})
    assert ref["A"] not in focus_closure
    assert ref["I"] not in focus_closure
    assert ref["F"] not in focus_closure
    assert ref["M"] not in focus_closure
    assert ref["R"] not in focus_closure

    assert focus_closure < act_closure
    assert {ref["I"], ref["F"], ref["X"], ref["M"], ref["R"]} <= act_closure


def test_incoming_search_from_focus_does_not_identify_one_unique_act():
    graph, ref = transition_graph()
    incoming = graph.incoming(ref["X"])

    # X participates in before, after and later state payloads. Associative
    # incoming search is useful, but without additional role/act constraints it
    # cannot be treated as a magic "go to my current act" operation.
    assert {11, 14, 18} <= incoming
    assert len(incoming) >= 3
    assert ref["A"] not in incoming


def test_full_act_ontology_does_not_imply_full_act_observability():
    contract = read_contract()
    expected = contract["expectedChallengeFindings"]

    assert expected["focusForwardClosureMayBeStrictlyLocal"] is True
    assert expected["currentActAnchorHasBroaderReachabilityThanFocusAnchor"] is True
    assert expected["thereforeFullActOntologyDoesNotImplyFullActObservability"] is True
    assert contract["deicticBoundaryHypothesis"]["focusOnlyMustNotImplyActIntrospection"] is True
    assert contract["deicticBoundaryHypothesis"]["additionalAnchorRequiresCounterexample"] is True


def test_no_candidate_topology_is_promoted_by_the_challenge():
    models = read_contract()["candidateTopologies"]

    assert {model["id"] for model in models} == {
        "A-positional-spine",
        "B-role-labelled-association-network",
        "C-state-transition",
        "D-interpreter-focus-binding-only",
    }
    assert all(model["accepted"] is False for model in models)
    preferred = next(model for model in models if model["id"] == "C-state-transition")
    assert preferred["status"] == "preferred-outer-shape-candidate"
