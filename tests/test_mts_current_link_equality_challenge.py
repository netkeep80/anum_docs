"""Executable non-normative challenge for Gate E / issue #180.

The test-local carrier deliberately separates semantic virtual-link references
from L4 LinkRef identity.  Equality is challenged as a local constraint over
explicit representatives, not as recursive graph isomorphism or global rewrite.
"""

from __future__ import annotations

from dataclasses import dataclass
import json
from pathlib import Path

import pytest

from core.anum_memory import AnumMemory
from core.mtc_parser import MTCParseError, parse_formula


ROOT = Path(__file__).resolve().parents[1]
CHALLENGE = ROOT / "contracts/mts-current-link-equality-challenge-v0.6.json"
DIRECTION = ROOT / "contracts/mts-foundation-direction-decision-v0.6.json"
CONSTRUCTOR_CHALLENGE = ROOT / "contracts/mts-constructor-destructor-foundation-challenge-v0.6.json"
MTS_V05 = ROOT / "contracts/mts-contract-v0.5.json"


@dataclass(frozen=True)
class VirtualLinkNode:
    local_ref: int
    start: int
    end: int


@dataclass(frozen=True)
class VirtualLinkSnapshot:
    nodes: tuple[VirtualLinkNode, ...]
    current: int

    def index(self) -> dict[int, VirtualLinkNode]:
        result = {node.local_ref: node for node in self.nodes}
        if len(result) != len(self.nodes):
            raise ValueError("duplicate virtual local_ref")
        if self.current not in result:
            raise ValueError("current local_ref is not present")
        refs = set(result)
        for node in self.nodes:
            if node.start not in refs or node.end not in refs:
                raise ValueError("virtual snapshot must be finite and closed")
        return result

    def poles(self, ref: int) -> tuple[int, int]:
        node = self.index()[ref]
        return node.start, node.end


@dataclass(frozen=True)
class LocalAliases:
    """One interpretation-local equivalence environment; never global state."""

    parents: tuple[tuple[int, int], ...] = ()

    def representative(self, ref: int) -> int:
        parent = dict(self.parents)
        seen: set[int] = set()
        current = ref
        while current in parent and parent[current] != current:
            if current in seen:
                raise ValueError("alias cycle")
            seen.add(current)
            current = parent[current]
        return current


def read(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def raw_start(snapshot: VirtualLinkSnapshot, ref: int) -> int:
    return snapshot.poles(ref)[0]


def raw_end(snapshot: VirtualLinkSnapshot, ref: int) -> int:
    return snapshot.poles(ref)[1]


def atomic_equality(left: int, right: int, aliases: LocalAliases = LocalAliases()) -> bool:
    return aliases.representative(left) == aliases.representative(right)


def link_comparison(
    snapshot: VirtualLinkSnapshot,
    left: int,
    right: int,
    aliases: LocalAliases = LocalAliases(),
) -> bool:
    """Candidate meaning of `(=)` over one pair of already distinguished links.

    It compares only the two immediate raw poles through local representative
    equality.  It does not recurse into either pole's reachable subgraph.
    """

    left_start, left_end = snapshot.poles(left)
    right_start, right_end = snapshot.poles(right)
    return atomic_equality(left_start, right_start, aliases) and atomic_equality(
        left_end, right_end, aliases
    )


def ordinary_snapshot() -> VirtualLinkSnapshot:
    return VirtualLinkSnapshot(
        nodes=(
            VirtualLinkNode(1, 1, 1),  # A
            VirtualLinkNode(2, 2, 2),  # B
            VirtualLinkNode(3, 1, 2),  # X=(A,B), current
        ),
        current=3,
    )


def test_challenge_is_non_normative_and_follows_direction_decision():
    challenge = read(CHALLENGE)
    direction = read(DIRECTION)
    constructor = read(CONSTRUCTOR_CHALLENGE)

    assert challenge["schema"] == "mts-current-link-equality-challenge/v0.6"
    assert challenge["status"] == "candidate-challenge"
    assert challenge["accepted"] is False
    assert challenge["issue"] == 180
    assert challenge["dependsOn"] == [direction["schema"], constructor["schema"]]
    assert challenge["schema"] not in MTS_V05.read_text(encoding="utf-8")
    assert challenge["releaseVeto"]["productionParserChangeAllowed"] is False
    assert challenge["releaseVeto"]["productionInterpreterChangeAllowed"] is False
    assert challenge["releaseVeto"]["acceptedContractLinkAllowed"] is False


def test_virtual_current_link_replaces_two_host_role_fields_for_local_observation():
    snapshot = ordinary_snapshot()
    snapshot.index()

    assert snapshot.current == 3
    assert snapshot.poles(snapshot.current) == (1, 2)
    assert raw_start(snapshot, snapshot.current) == 1
    assert raw_end(snapshot, snapshot.current) == 2

    candidate = read(CHALLENGE)["rawProjectionCandidate"]
    assert candidate["current"] == "↑ -> snapshot.current"
    assert candidate["start"] == "♀↑ -> nodes[current].start"
    assert candidate["end"] == "↑♂ -> nodes[current].end"
    assert candidate["wrapperProjectionLookupUsed"] is False
    assert candidate["materializationRequired"] is False


def test_self_cycle_current_link_is_finite_without_l4_or_contextframe():
    snapshot = VirtualLinkSnapshot(
        nodes=(VirtualLinkNode(0, 0, 0),),
        current=0,
    )

    assert snapshot.index() == {0: VirtualLinkNode(0, 0, 0)}
    assert snapshot.poles(snapshot.current) == (0, 0)
    assert raw_start(snapshot, 0) == 0
    assert raw_end(snapshot, 0) == 0


def test_mutual_cycle_snapshot_is_finite_and_closed():
    snapshot = VirtualLinkSnapshot(
        nodes=(
            VirtualLinkNode(0, 1, 1),
            VirtualLinkNode(1, 0, 0),
            VirtualLinkNode(2, 0, 1),
        ),
        current=2,
    )

    assert set(snapshot.index()) == {0, 1, 2}
    assert snapshot.poles(0) == (1, 1)
    assert snapshot.poles(1) == (0, 0)
    assert snapshot.poles(2) == (0, 1)


def test_virtual_and_materialized_current_links_can_have_same_local_observations_without_identity_claim():
    virtual = VirtualLinkSnapshot(
        nodes=(
            VirtualLinkNode(10, 10, 10),
            VirtualLinkNode(20, 20, 20),
            VirtualLinkNode(30, 10, 20),
        ),
        current=30,
    )
    materialized = AnumMemory(
        {
            1: (1, 1),
            2: (2, 2),
            3: (1, 2),
        }
    )
    translation = {10: 1, 20: 2, 30: 3}

    virtual_poles = virtual.poles(virtual.current)
    materialized_poles = materialized.poles(translation[virtual.current])

    assert tuple(translation[ref] for ref in virtual_poles) == materialized_poles
    assert virtual.current != translation[virtual.current]
    assert read(CHALLENGE)["currentLinkCarrier"]["requiresL4LinkRef"] is False


def test_two_virtual_occurrences_with_same_ordered_pole_refs_can_compare_equal_without_merging_occurrences():
    snapshot = VirtualLinkSnapshot(
        nodes=(
            VirtualLinkNode(1, 1, 1),
            VirtualLinkNode(2, 2, 2),
            VirtualLinkNode(3, 1, 2),
            VirtualLinkNode(4, 1, 2),
            VirtualLinkNode(5, 3, 4),  # current comparison context X=(A,B)
        ),
        current=5,
    )

    assert snapshot.poles(3) == snapshot.poles(4) == (1, 2)
    assert 3 != 4
    assert link_comparison(snapshot, 3, 4) is True
    # The test did not rewrite or merge the local occurrence refs themselves.
    assert set(snapshot.index()) == {1, 2, 3, 4, 5}


def test_isomorphic_subgraphs_do_not_become_equal_by_hidden_recursive_comparison():
    snapshot = VirtualLinkSnapshot(
        nodes=(
            VirtualLinkNode(1, 1, 1),
            VirtualLinkNode(2, 2, 2),
            VirtualLinkNode(3, 1, 2),
            VirtualLinkNode(11, 11, 11),
            VirtualLinkNode(12, 12, 12),
            VirtualLinkNode(13, 11, 12),
            VirtualLinkNode(20, 3, 13),
        ),
        current=20,
    )

    # 3 and 13 have the same abstract one-link shape up to renaming, but their
    # immediate semantic pole refs differ. Gate E must not smuggle in a whole-
    # graph isomorphism comparator as the meaning of one local `=` constraint.
    assert snapshot.poles(3) == (1, 2)
    assert snapshot.poles(13) == (11, 12)
    assert link_comparison(snapshot, 3, 13) is False

    rejected = next(
        item
        for item in read(CHALLENGE)["candidateModels"]
        if item["id"] == "E2-recursive-graph-isomorphism-equality"
    )
    assert rejected["status"] == "reject-as-implicit-default"


def test_explicit_local_aliases_can_satisfy_pole_constraints_without_global_mutation():
    snapshot = VirtualLinkSnapshot(
        nodes=(
            VirtualLinkNode(1, 1, 1),
            VirtualLinkNode(2, 2, 2),
            VirtualLinkNode(3, 1, 2),
            VirtualLinkNode(11, 11, 11),
            VirtualLinkNode(12, 12, 12),
            VirtualLinkNode(13, 11, 12),
            VirtualLinkNode(20, 3, 13),
        ),
        current=20,
    )
    aliases = LocalAliases(((11, 1), (12, 2)))

    assert link_comparison(snapshot, 3, 13) is False
    assert link_comparison(snapshot, 3, 13, aliases) is True
    assert snapshot.poles(13) == (11, 12)
    assert aliases.representative(11) == 1
    assert aliases.representative(12) == 2


def test_materialized_exact_pair_store_is_idempotent_but_not_the_virtual_ontology():
    memory = AnumMemory(
        {
            1: (1, 1),
            2: (2, 2),
            3: (1, 2),
        }
    )

    before = memory.link_count
    assert memory.find_link(1, 2) == 3
    assert memory.intern_link(1, 2) == 3
    assert memory.link_count == before

    distinction = read(CHALLENGE)["criticalDistinctions"]
    assert distinction["materializedExactPair"].startswith(
        "current L4 canonical exact-pair storage"
    )
    assert read(CHALLENGE)["currentLinkCarrier"]["requiresL4LinkRef"] is False


def test_issue79_local_equality_guards_remain_in_force():
    boundary = read(CHALLENGE)["issue79Boundary"]

    assert boundary["anonymousSquareOccurrenceLocal"] is True
    assert boundary["equalityIsLocalConstraint"] is True
    assert boundary["equalityIsGlobalTextualRewrite"] is False
    assert boundary["sourceTextCreatesGlobalCoreference"] is False
    assert boundary["genericSubstitutivityAccepted"] is False
    assert boundary["genericCongruenceAccepted"] is False


def test_current_parser_remains_historical_and_rejects_standalone_up():
    with pytest.raises(MTCParseError, match="После `↑` ожидается"):
        parse_formula("↑")

    assert read(CHALLENGE)["releaseVeto"]["productionParserChangeAllowed"] is False


def test_equality_candidate_and_gate_remain_unaccepted_after_challenge_setup():
    challenge = read(CHALLENGE)
    equality = challenge["equalityLayers"]["linkComparisonConcept"]
    models = {item["id"]: item for item in challenge["candidateModels"]}

    assert equality["candidateL2"] == "{♀(♀↑) = ♀(↑♂), (♀↑)♂ = (↑♂)♂}"
    assert equality["genericBisimulation"] is False
    assert equality["globalCongruenceRule"] is False
    assert equality["accepted"] is False
    assert models["E1-current-link-local-ref-equality"]["status"] == (
        "preferred-challenge-candidate"
    )
    assert models["E3-l4-linkref-only-current"]["status"] == "reject-as-foundation"
    assert challenge["accepted"] is False
