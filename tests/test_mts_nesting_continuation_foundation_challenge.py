"""Executable non-normative challenge for Foundation Gate N / issue #182.

The fixture models nested acts and continuation using only finite binary links.
Every observation starts from one explicit current link; no host parent stack or
implicit caller lookup participates in the result.
"""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass, fields
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CHALLENGE = ROOT / "contracts/mts-nesting-continuation-foundation-challenge-v0.6.json"
DIRECTION = ROOT / "contracts/mts-foundation-direction-decision-v0.6.json"
EQUALITY = ROOT / "contracts/mts-current-link-equality-decision-v0.6.json"
ANUM = ROOT / "contracts/mts-root-anum-foundation-decision-v0.6.json"
ACT = ROOT / "contracts/mts-interpretation-act-network-challenge-v0.6.json"
MTS_V05 = ROOT / "contracts/mts-contract-v0.5.json"


@dataclass(frozen=True)
class Link:
    start: int
    end: int


@dataclass(frozen=True)
class FiniteGraph:
    links: dict[int, Link]

    def validate_closed(self) -> None:
        refs = set(self.links)
        for ref, link in self.links.items():
            assert link.start in refs, (ref, "start", link.start)
            assert link.end in refs, (ref, "end", link.end)

    def poles(self, ref: int) -> tuple[int, int]:
        link = self.links[ref]
        return link.start, link.end

    def forward_closure(self, root: int) -> frozenset[int]:
        seen: set[int] = set()
        pending = deque([root])
        while pending:
            ref = pending.popleft()
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

    def canonical_json(self) -> str:
        return json.dumps(
            {
                str(ref): [self.links[ref].start, self.links[ref].end]
                for ref in sorted(self.links)
            },
            sort_keys=True,
            separators=(",", ":"),
        )

    @classmethod
    def from_canonical_json(cls, source: str) -> FiniteGraph:
        data = json.loads(source)
        return cls(
            {
                int(ref): Link(int(pair[0]), int(pair[1]))
                for ref, pair in data.items()
            }
        )


def atom(ref: int) -> tuple[int, Link]:
    return ref, Link(ref, ref)


def read(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def scenario() -> tuple[FiniteGraph, dict[str, int]]:
    ref = {
        "O": 1,
        "L": 2,
        "R": 3,
        "G": 4,
        "F_CHILD": 5,
        "F_GRAND": 6,
        "F_CONT": 7,
        "XC": 10,
        "XG": 11,
        "XR": 12,
        "X_ISOLATED": 13,
        "SC_BEFORE": 20,
        "SC_AFTER": 21,
        "AC": 22,
        "SG_BEFORE": 23,
        "SG_AFTER": 24,
        "AG": 25,
        "SP_BEFORE": 26,
        "SP_AFTER": 27,
        "AP": 28,
        "CALL_PC": 29,
        "CALL_CG": 30,
        "HISTORY": 31,
    }
    links = {
        **dict(atom(ref[name]) for name in ("O", "L", "R", "G", "F_CHILD", "F_GRAND", "F_CONT")),
        ref["XC"]: Link(ref["O"], ref["L"]),
        ref["XG"]: Link(ref["XC"], ref["G"]),
        ref["XR"]: Link(ref["O"], ref["R"]),
        ref["X_ISOLATED"]: Link(ref["L"], ref["G"]),
        ref["SC_BEFORE"]: Link(ref["F_CHILD"], ref["XC"]),
        ref["SC_AFTER"]: Link(ref["F_CHILD"], ref["R"]),
        ref["AC"]: Link(ref["SC_BEFORE"], ref["SC_AFTER"]),
        ref["SG_BEFORE"]: Link(ref["F_GRAND"], ref["XG"]),
        ref["SG_AFTER"]: Link(ref["F_GRAND"], ref["R"]),
        ref["AG"]: Link(ref["SG_BEFORE"], ref["SG_AFTER"]),
        ref["SP_BEFORE"]: Link(ref["F_CONT"], ref["O"]),
        ref["SP_AFTER"]: Link(ref["F_CONT"], ref["XR"]),
        ref["AP"]: Link(ref["SP_BEFORE"], ref["SP_AFTER"]),
        ref["CALL_PC"]: Link(ref["AP"], ref["AC"]),
        ref["CALL_CG"]: Link(ref["AC"], ref["AG"]),
        ref["HISTORY"]: Link(ref["AC"], ref["AP"]),
    }
    graph = FiniteGraph(links)
    graph.validate_closed()
    return graph, ref


def current_observation(graph: FiniteGraph, current: int) -> tuple[int, int]:
    """Test-local preferred `♀↑`, `↑♂` observation."""

    return graph.poles(current)


def test_gate_n_challenge_is_non_normative_and_composes_all_prior_foundation_decisions():
    challenge = read(CHALLENGE)

    assert challenge["schema"] == "mts-nesting-continuation-foundation-challenge/v0.6"
    assert challenge["status"] == "candidate-challenge"
    assert challenge["accepted"] is False
    assert challenge["issue"] == 182
    assert challenge["dependsOn"] == [
        read(DIRECTION)["schema"],
        read(EQUALITY)["schema"],
        read(ANUM)["schema"],
        read(ACT)["schema"],
    ]
    assert challenge["schema"] not in MTS_V05.read_text(encoding="utf-8")
    assert challenge["releaseVeto"]["acceptedContractLinkAllowed"] is False
    assert challenge["releaseVeto"]["productionInterpreterChangeAllowed"] is False


def test_all_scenario_carriers_are_only_binary_links_and_have_no_parent_field():
    graph, _ref = scenario()

    assert [field.name for field in fields(Link)] == ["start", "end"]
    assert "parent" not in {field.name for field in fields(Link)}
    assert all(isinstance(link, Link) for link in graph.links.values())
    graph.validate_closed()


def test_child_receives_outer_and_local_data_explicitly_in_one_current_link():
    graph, ref = scenario()

    assert graph.poles(ref["XC"]) == (ref["O"], ref["L"])
    assert current_observation(graph, ref["XC"]) == (ref["O"], ref["L"])

    hypothesis = read(CHALLENGE)["hypothesis"]
    assert hypothesis["onlyDeicticAnchor"] == "↑ -> current semantic link"
    assert hypothesis["additionalDeicticAnchors"] == []
    assert hypothesis["outerDataPolicy"].startswith("data needed by a child is explicitly included")
    assert hypothesis["hostParentFieldRequired"] is False


def test_outer_data_is_not_magically_visible_when_it_is_not_passed():
    graph, ref = scenario()

    isolated_closure = graph.forward_closure(ref["X_ISOLATED"])
    assert ref["O"] not in isolated_closure
    assert current_observation(graph, ref["X_ISOLATED"]) == (ref["L"], ref["G"])

    boundary = read(CHALLENGE)["explicitPassingBoundary"]
    assert boundary["outerFocusAutomaticallyVisibleToChild"] is False
    assert boundary["outerFocusCanBePassedAsChildCurrentPole"] is True
    assert boundary["childMayObserveOnlyWhatItsExplicitCurrentStructureExposes"] is True


def test_grandchild_uses_nested_current_link_structure_instead_of_parent_ascent():
    graph, ref = scenario()

    assert graph.poles(ref["XG"]) == (ref["XC"], ref["G"])
    xg_start, xg_end = current_observation(graph, ref["XG"])
    assert xg_start == ref["XC"]
    assert xg_end == ref["G"]

    # Preferred raw projections can continue structurally: ♀(♀↑)=O and
    # (♀↑)♂=L.  No second deictic anchor is needed for this explicitly passed
    # outer/local pair.
    assert graph.poles(xg_start) == (ref["O"], ref["L"])


def test_child_result_is_explicitly_passed_to_continuation_current_link():
    graph, ref = scenario()

    assert graph.poles(ref["XR"]) == (ref["O"], ref["R"])
    assert current_observation(graph, ref["XR"]) == (ref["O"], ref["R"])
    assert ref["R"] in graph.forward_closure(ref["SP_AFTER"])

    act = read(CHALLENGE)["actBoundary"]
    assert act["resultIsHiddenReturnValue"] is False
    assert act["continuationIsHostReturnAddress"] is False


def test_child_grandchild_parent_and_history_are_ordinary_links():
    graph, ref = scenario()

    assert graph.poles(ref["AC"]) == (ref["SC_BEFORE"], ref["SC_AFTER"])
    assert graph.poles(ref["AG"]) == (ref["SG_BEFORE"], ref["SG_AFTER"])
    assert graph.poles(ref["AP"]) == (ref["SP_BEFORE"], ref["SP_AFTER"])
    assert graph.poles(ref["CALL_PC"]) == (ref["AP"], ref["AC"])
    assert graph.poles(ref["CALL_CG"]) == (ref["AC"], ref["AG"])
    assert graph.poles(ref["HISTORY"]) == (ref["AC"], ref["AP"])


def test_generic_incoming_search_from_child_current_is_ambiguous_and_not_parent_semantics():
    graph, ref = scenario()
    incoming = graph.incoming(ref["XC"])

    # XC is both the child state's payload and the start of the explicit XG
    # structure passed to the grandchild. Nothing in generic incoming-search
    # alone says which incoming link is a caller/parent relation.
    assert {ref["SC_BEFORE"], ref["XG"]} <= incoming
    assert len(incoming) >= 2
    assert ref["AP"] not in incoming

    boundary = read(CHALLENGE)["incomingSearchBoundary"]
    assert boundary["genericIncomingSearchMayReturnManyLinks"] is True
    assert boundary["incomingSearchDefinesCaller"] is False
    assert boundary["incomingSearchDefinesParent"] is False


def test_serialized_graph_plus_current_ref_replays_nested_observations_deterministically():
    graph, ref = scenario()
    serialized = graph.canonical_json()
    replay = FiniteGraph.from_canonical_json(serialized)
    replay.validate_closed()

    assert replay.canonical_json() == serialized
    for current in (ref["XC"], ref["XG"], ref["XR"]):
        assert current_observation(replay, current) == current_observation(graph, current)

    deterministic = read(CHALLENGE)["deterministicReplay"]
    assert deterministic["hostParentStackSerialized"] is False
    assert deterministic["ambientInterpreterIdentitySerialized"] is False
    assert deterministic["sameSerializedGraphAndCurrentProducesSameRawPoleObservations"] is True


def test_required_nested_vectors_do_not_produce_evidence_for_a_second_deictic_anchor():
    challenge = read(CHALLENGE)
    search = challenge["counterexampleSearch"]
    models = {item["id"]: item for item in challenge["candidateModels"]}

    assert search["requiredVectorsNeedingOuterDataSolvedByExplicitPassing"] is True
    assert search["requiredVectorsNeedingContinuationSolvedByExplicitLinks"] is True
    assert search["requiredVectorsNeedingDeepNestingSolvedByNestedCurrentLinkStructure"] is True
    assert search["minimalCounterexampleRequiringSecondDeicticAnchorFound"] is False
    assert search["universalClaimThatNoFutureCounterexampleExists"] is False
    assert models["N1-one-current-link-explicit-passing"]["status"] == (
        "preferred-challenge-candidate"
    )
    assert models["N2-implicit-incoming-caller-search"]["status"] == "reject-as-default"
    assert models["N3-second-parent-pronoun"]["status"] == "not-justified-by-current-evidence"


def test_historical_parent_ascent_is_not_silently_preserved():
    historical = read(CHALLENGE)["historicalAscent"]

    assert historical["ContextFrameParentPreferredOntology"] is False
    assert historical["upAsParentDepthPreferred"] is False
    assert historical["oldForms"] == ["↑◁", "↑▷", "↑↑◁", "↑↑▷"]
    assert historical["automaticallyPreserved"] is False
    assert historical["migrationCandidate"].startswith(
        "replace hidden outer-frame reads with explicit data links"
    )


def test_no_nesting_model_is_promoted_by_the_challenge():
    challenge = read(CHALLENGE)

    assert challenge["accepted"] is False
    assert all(item["accepted"] is False for item in challenge["candidateModels"])
    assert challenge["effectsBoundary"]["usesProductionL4"] is False
    assert challenge["effectsBoundary"]["readsAmbientSession"] is False
    assert challenge["releaseVeto"]["secondDeicticPrimitiveAllowedWithoutCounterexample"] is False
