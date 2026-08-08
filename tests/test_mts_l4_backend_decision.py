"""Executable evidence for the non-normative L4 backend boundary decision."""

import json
from pathlib import Path

import pytest

from core.anum_memory import AnumMemory, LinkInUseError, MissingAnchorError
from core.anum_model import ProjectionContext
from core.anum_parser import parse_raw_quaternary
from core.anum_recursive_denotation import denotate_recursive_anum


ROOT = Path(__file__).parents[1]
DECISION = ROOT / "contracts" / "mts-l4-backend-decision-v0.3.json"
MTS_CONTRACT = ROOT / "contracts" / "mts-contract-v0.2.json"

GRAPH_A = {
    0: (0, 0),
    1: (1, 0),
    2: (0, 2),
}
BINDINGS_A = {"root": 0, "zero": 1, "one": 2}

GRAPH_B = {
    10: (10, 10),
    20: (20, 10),
    30: (10, 30),
}
BINDINGS_B = {"root": 10, "zero": 20, "one": 30}

ANCHORS_A = {
    "protocol:0": 1,
    "protocol:1": 2,
}


class ReferenceBackendAdapter:
    """Challenge-only primitive link adapter over the canonical AnumMemory."""

    def __init__(self, store: AnumMemory):
        self.store = store

    def poles(self, ref: int) -> tuple[int, int]:
        return self.store.poles(ref)

    def find_link(self, start: int, end: int) -> int | None:
        return self.store.find_link(start, end)

    def outgoing(self, start: int) -> tuple[int, ...]:
        return self.store.outgoing(start)

    def incoming(self, end: int) -> tuple[int, ...]:
        return self.store.incoming(end)

    def all_links(self) -> tuple[int, ...]:
        return self.store.all_links()

    def realize_link(self, start: int, end: int) -> int:
        return self.store.intern_link(start, end)

    def delete_link(self, ref: int) -> None:
        self.store.delete_link(ref)


def decision() -> dict:
    return json.loads(DECISION.read_text(encoding="utf-8"))


def _normalized_exact_pair_scenario(
    graph: dict[int, tuple[int, int]],
    seed_bindings: dict[str, int],
) -> tuple[dict, int]:
    store = AnumMemory(initial_links=graph)
    backend = ReferenceBackendAdapter(store)
    before = store.snapshot()

    zero = seed_bindings["zero"]
    one = seed_bindings["one"]
    assert backend.find_link(zero, one) is None
    assert store.snapshot() == before

    pair = backend.realize_link(zero, one)
    bindings = dict(seed_bindings)
    bindings["pair"] = pair
    reverse = {ref: name for name, ref in bindings.items()}

    observation = {
        "pairPoles": tuple(reverse[ref] for ref in backend.poles(pair)),
        "findPair": reverse[backend.find_link(zero, one)],
        "outgoingZero": tuple(sorted(reverse[ref] for ref in backend.outgoing(zero))),
        "incomingOne": tuple(sorted(reverse[ref] for ref in backend.incoming(one))),
        "allLinks": tuple(sorted(reverse[ref] for ref in backend.all_links())),
    }
    return observation, pair


def test_decision_is_non_normative_and_selects_only_backend_boundary():
    data = decision()
    mts_text = MTS_CONTRACT.read_text(encoding="utf-8")
    models = {model["id"]: model for model in data["models"]}

    assert data["schema"] == "mts-l4-backend-decision/v0.3"
    assert data["status"] == "candidate-decision"
    assert data["acceptedContractLinkAllowed"] is False
    assert data["productionBackendContractAccepted"] is False
    assert "mts-l4-backend-decision" not in mts_text

    assert models["A"]["verdict"] == "reject"
    assert models["B"]["verdict"] == "preferred-candidate"
    assert models["C"]["verdict"] == "reject-for-persistent-adapter"
    assert models["D"]["verdict"] == "reject"
    assert all(model["accepted"] is False for model in models.values())


def test_reference_adapter_surface_contains_only_link_primitives():
    public = {
        name
        for name in vars(ReferenceBackendAdapter)
        if not name.startswith("_") and name != "store"
    }
    assert public == {
        "poles",
        "find_link",
        "outgoing",
        "incoming",
        "all_links",
        "realize_link",
        "delete_link",
    }

    boundaries = decision()["preservedBoundaries"]
    assert boundaries["backendParsesAnum"] is False
    assert boundaries["backendInterpretsL2"] is False
    assert boundaries["rawCarrierStorageIsPartOfCanonicalLinkBackend"] is False


def test_same_topology_normalizes_identically_with_different_backend_handles():
    observation_a, pair_a = _normalized_exact_pair_scenario(GRAPH_A, BINDINGS_A)
    observation_b, pair_b = _normalized_exact_pair_scenario(GRAPH_B, BINDINGS_B)

    assert pair_a != pair_b
    assert observation_a == observation_b
    assert observation_a == {
        "pairPoles": ("zero", "one"),
        "findPair": "pair",
        "outgoingZero": ("pair", "zero"),
        "incomingOne": ("one", "pair"),
        "allLinks": ("one", "pair", "root", "zero"),
    }

    normalization = decision()["conformanceNormalization"]
    assert normalization["rawBackendHandleValuesCompared"] is False
    assert normalization["physicalAddressesCompared"] is False
    assert normalization["topologyCompared"] is True


def test_find_and_incidence_reads_do_not_mutate_reference_store():
    store = AnumMemory(initial_links=GRAPH_A)
    backend = ReferenceBackendAdapter(store)
    before = store.snapshot()

    assert backend.find_link(1, 2) is None
    assert backend.poles(1) == (1, 0)
    assert backend.outgoing(1) == (1,)
    assert 2 in backend.incoming(2)
    assert backend.all_links() == (0, 1, 2)
    assert store.snapshot() == before


def test_realize_link_is_exact_pair_idempotent_and_indexes_are_consistent():
    store = AnumMemory(initial_links=GRAPH_A)
    backend = ReferenceBackendAdapter(store)

    ref = backend.realize_link(1, 2)
    assert backend.find_link(1, 2) == ref
    assert backend.poles(ref) == (1, 2)
    assert ref in backend.outgoing(1)
    assert ref in backend.incoming(2)

    after_first = store.snapshot()
    assert backend.realize_link(1, 2) == ref
    assert store.snapshot() == after_first


def test_delete_is_non_cascading_and_preserves_referential_integrity():
    store = AnumMemory(initial_links=GRAPH_A)
    backend = ReferenceBackendAdapter(store)

    inner = backend.realize_link(1, 2)
    outer = backend.realize_link(inner, 2)

    with pytest.raises(LinkInUseError):
        backend.delete_link(inner)

    backend.delete_link(outer)
    assert backend.find_link(inner, 2) is None
    backend.delete_link(inner)
    assert backend.find_link(1, 2) is None


def test_reference_multi_node_realize_is_atomic_and_idempotent():
    store = AnumMemory(initial_links=GRAPH_A)
    denotation = denotate_recursive_anum(
        parse_raw_quaternary("[01]1"),
        ProjectionContext.ROOT,
    )
    before = store.snapshot()

    with pytest.raises(MissingAnchorError):
        store.realize_denotation(denotation, {"protocol:0": 1})
    assert store.snapshot() == before

    root = store.realize_denotation(denotation, ANCHORS_A)
    after_first = store.snapshot()
    assert store.realize_denotation(denotation, ANCHORS_A) == root
    assert store.snapshot() == after_first


def test_cyclic_bootstrap_is_separate_from_normal_realize_and_remains_supported():
    store = AnumMemory(initial_links=GRAPH_A)
    backend = ReferenceBackendAdapter(store)

    assert backend.poles(BINDINGS_A["root"]) == (
        BINDINGS_A["root"],
        BINDINGS_A["root"],
    )
    semantics = decision()["observableSemantics"]
    assert semantics["bootstrapCycles"].startswith("closed cyclic seed graphs")


def test_persistence_remains_a_required_future_conformance_gate():
    data = decision()
    persistence = data["persistenceRequirements"]
    vectors = set(data["nextGate"]["requiredVectors"])

    assert data["referenceEvidence"]["notEvidenceForPersistence"] is True
    assert persistence["cleanReopenPreservesTopology"] is True
    assert persistence["exactPairUniquenessSurvivesReopen"] is True
    assert persistence["rawOpaqueHandleBytesMustRemainEqualAcrossReopen"] is False
    assert "persistent adapter clean reopen and exact-pair uniqueness" in vectors
    assert "persistent adapter interrupted-write recovery where supported" in vectors

    pmm = data["pmmBoundary"]
    assert pmm["PersistMemoryManagerIsCandidateImplementation"] is True
    assert pmm["canonicalContractDependsOnPmmApi"] is False
    assert pmm["pmmPhysicalAddressBecomesMtsIdentity"] is False
