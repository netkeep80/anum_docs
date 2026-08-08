"""Executable reference gate for the candidate L4 backend conformance corpus."""

import inspect
import json
from pathlib import Path

import pytest

from core.anum_denotation import AnumDenotation
from core.anum_memory import (
    AnumMemory,
    LinkInUseError,
    MissingAnchorError,
    NonStructuralDenotationError,
)
from core.anum_model import ProjectionContext
from core.anum_parser import parse_raw_quaternary
from core.anum_recursive_denotation import denotate_recursive_anum


ROOT = Path(__file__).parents[1]
CHALLENGE = ROOT / "contracts" / "mts-l4-backend-challenge-v0.3.json"
CORPUS = ROOT / "contracts" / "mts-l4-backend-conformance-v0.3.json"
DECISION = ROOT / "contracts" / "mts-l4-backend-decision-v0.3.json"
MTS_CONTRACT = ROOT / "contracts" / "mts-contract-v0.2.json"


class ReferenceHarness:
    """Challenge-only adapter; backend handles stay opaque to observations."""

    def __init__(self, assignment: dict[str, int]):
        seed = corpus()["seedGraph"]["links"]
        self.refs = dict(assignment)
        graph = {
            assignment[name]: (
                assignment[record["start"]],
                assignment[record["end"]],
            )
            for name, record in seed.items()
        }
        self.store = AnumMemory(initial_links=graph)

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

    def bind(self, name: str, ref: int) -> int:
        existing = self.refs.get(name)
        if existing is not None and existing != ref:
            raise AssertionError(f"symbolic binding {name!r} changed ref")
        self.refs[name] = ref
        return ref

    def ref(self, name: str) -> int:
        return self.refs[name]

    def name(self, ref: int) -> str:
        reverse = {value: key for key, value in self.refs.items()}
        return reverse[ref]

    def names(self, refs: tuple[int, ...]) -> tuple[str, ...]:
        return tuple(sorted(self.name(ref) for ref in refs))


def challenge() -> dict:
    return json.loads(CHALLENGE.read_text(encoding="utf-8"))


def corpus() -> dict:
    return json.loads(CORPUS.read_text(encoding="utf-8"))


def decision() -> dict:
    return json.loads(DECISION.read_text(encoding="utf-8"))


def assignments() -> list[dict[str, int]]:
    return corpus()["handleAssignmentsForReferenceChallenge"]


def _exact_pair_observation(assignment: dict[str, int]) -> tuple[dict, int]:
    harness = ReferenceHarness(assignment)
    before = harness.store.snapshot()

    assert harness.find_link(harness.ref("zero"), harness.ref("one")) is None
    assert harness.store.snapshot() == before

    pair = harness.bind(
        "pair",
        harness.realize_link(harness.ref("zero"), harness.ref("one")),
    )
    observation = {
        "pairPoles": tuple(harness.name(ref) for ref in harness.poles(pair)),
        "findPair": harness.name(
            harness.find_link(harness.ref("zero"), harness.ref("one"))
        ),
        "outgoingZero": harness.names(harness.outgoing(harness.ref("zero"))),
        "incomingOne": harness.names(harness.incoming(harness.ref("one"))),
        "allLinks": harness.names(harness.all_links()),
    }
    return observation, pair


def test_challenge_and_corpus_are_non_normative_and_follow_decision_gate():
    data = challenge()
    vectors = corpus()
    selected = decision()["nextGate"]
    mts_text = MTS_CONTRACT.read_text(encoding="utf-8")

    assert data["schema"] == "mts-l4-backend-challenge/v0.3"
    assert data["status"] == "candidate-challenge"
    assert vectors["schema"] == "mts-l4-backend-conformance/v0.3"
    assert vectors["status"] == "candidate-challenge-corpus"
    assert selected["artifact"] == data["schema"]
    assert data["conformanceCorpus"] == "contracts/mts-l4-backend-conformance-v0.3.json"
    assert data["acceptedContractLinkAllowed"] is False
    assert data["productionBackendContractAccepted"] is False
    assert "mts-l4-backend-challenge" not in mts_text
    assert "mts-l4-backend-conformance" not in mts_text


def test_portable_corpus_uses_symbolic_topology_not_expected_backend_handles():
    data = corpus()
    seed = data["seedGraph"]

    assert set(seed["links"]) == {"root", "zero", "one"}
    assert seed["links"]["root"] == {"start": "root", "end": "root"}
    assert seed["anchors"] == {"protocol:0": "zero", "protocol:1": "one"}

    keys = set(seed["links"])
    for assignment in assignments():
        assert set(assignment) == keys
        assert len(set(assignment.values())) == len(assignment)

    policy = data["handlePolicy"]
    assert "opaque" in policy["backend refs are opaque and never serialized as expected values"]
    assert challenge()["symbolicConformanceModel"]["numericOrPhysicalHandleValuesAreNormative"] is False


def test_opaque_handle_renaming_preserves_all_normalized_pair_observations():
    results = [_exact_pair_observation(item) for item in assignments()]
    observed = [observation for observation, _ref in results]
    pair_refs = [ref for _observation, ref in results]

    assert pair_refs[0] != pair_refs[1]
    assert len({item["pairPoles"] for item in observed}) == 1
    assert observed[0] == observed[1]
    assert observed[0] == {
        "pairPoles": ("zero", "one"),
        "findPair": "pair",
        "outgoingZero": ("pair", "zero"),
        "incomingOne": ("one", "pair"),
        "allLinks": ("one", "pair", "root", "zero"),
    }


def test_find_poles_and_incidence_are_read_only_and_ordered_where_required():
    harness = ReferenceHarness(assignments()[0])
    before = harness.store.snapshot()

    assert harness.find_link(harness.ref("zero"), harness.ref("one")) is None
    assert harness.poles(harness.ref("zero")) == (
        harness.ref("zero"),
        harness.ref("root"),
    )
    assert harness.outgoing(harness.ref("zero")) == (harness.ref("zero"),)
    assert harness.ref("one") in harness.incoming(harness.ref("one"))
    assert harness.store.snapshot() == before


def test_exact_pair_realize_is_idempotent_and_indexes_stay_consistent():
    for assignment in assignments():
        harness = ReferenceHarness(assignment)
        pair = harness.bind(
            "pair",
            harness.realize_link(harness.ref("zero"), harness.ref("one")),
        )
        after_first = harness.store.snapshot()

        assert harness.realize_link(harness.ref("zero"), harness.ref("one")) == pair
        assert harness.store.snapshot() == after_first
        assert harness.find_link(harness.ref("zero"), harness.ref("one")) == pair
        assert harness.poles(pair) == (harness.ref("zero"), harness.ref("one"))
        assert pair in harness.outgoing(harness.ref("zero"))
        assert pair in harness.incoming(harness.ref("one"))


def test_referenced_delete_is_rejected_then_explicit_non_cascading_delete_succeeds():
    harness = ReferenceHarness(assignments()[0])
    inner = harness.bind(
        "inner",
        harness.realize_link(harness.ref("zero"), harness.ref("one")),
    )
    outer = harness.bind(
        "outer",
        harness.realize_link(inner, harness.ref("one")),
    )
    before_rejected = harness.store.snapshot()

    with pytest.raises(LinkInUseError):
        harness.delete_link(inner)
    assert harness.store.snapshot() == before_rejected

    harness.delete_link(outer)
    assert harness.find_link(inner, harness.ref("one")) is None
    harness.delete_link(inner)
    assert harness.find_link(harness.ref("zero"), harness.ref("one")) is None


def test_closed_cyclic_bootstrap_is_observable_without_ordinary_realize():
    for assignment in assignments():
        harness = ReferenceHarness(assignment)
        root = harness.ref("root")
        zero = harness.ref("zero")
        one = harness.ref("one")

        assert harness.poles(root) == (root, root)
        assert harness.poles(zero) == (zero, root)
        assert harness.poles(one) == (root, one)


def test_structural_denotation_realize_is_atomic_on_error_and_idempotent_on_success():
    denotation = denotate_recursive_anum(
        parse_raw_quaternary("[01]1"),
        ProjectionContext.ROOT,
    )

    for assignment in assignments():
        harness = ReferenceHarness(assignment)
        before = harness.store.snapshot()

        with pytest.raises(MissingAnchorError):
            harness.store.realize_denotation(
                denotation,
                {"protocol:0": harness.ref("zero")},
            )
        assert harness.store.snapshot() == before

        anchors = {
            "protocol:0": harness.ref("zero"),
            "protocol:1": harness.ref("one"),
        }
        root = harness.store.realize_denotation(denotation, anchors)
        after_first = harness.store.snapshot()
        assert harness.store.realize_denotation(denotation, anchors) == root
        assert harness.store.snapshot() == after_first


def test_non_structural_denotations_remain_non_commands_without_partial_mutation():
    harness = ReferenceHarness(assignments()[0])
    before = harness.store.snapshot()
    anchors = {
        "protocol:0": harness.ref("zero"),
        "protocol:1": harness.ref("one"),
    }

    for value in (
        AnumDenotation.raw_result("010"),
        AnumDenotation.quoted_raw_result("01"),
    ):
        with pytest.raises(NonStructuralDenotationError):
            harness.store.realize_denotation(value, anchors)
        assert harness.store.snapshot() == before


def test_primitive_adapter_surface_does_not_smuggle_parser_or_l2_semantics():
    public = {name for name in vars(ReferenceHarness) if not name.startswith("_")}
    backend_surface = {
        "poles",
        "find_link",
        "outgoing",
        "incoming",
        "all_links",
        "realize_link",
        "delete_link",
    }
    assert backend_surface.issubset(public)

    for name in backend_surface:
        signature = inspect.signature(getattr(ReferenceHarness, name))
        assert all(
            token not in str(signature).lower()
            for token in ("anum", "parser", "formula", "contextframe")
        )

    vetoes = challenge()["implementationVetoes"]
    assert "backend parses [ ] 1 0" in vetoes
    assert "backend contains L2 interpreter semantics" in vetoes


def test_reference_pass_does_not_claim_persistence_or_complete_issue_124():
    gate = challenge()["persistentCapabilityGate"]
    persistent = corpus()["persistentOnlyScenarios"]

    assert challenge()["referenceHarness"]["persistent"] is False
    assert challenge()["referenceHarness"]["crashRecovery"] is False
    assert gate["requiredBeforeAcceptance"] is True
    assert gate["notSatisfiedByReferenceHarness"] is True
    assert {item["requires"] for item in persistent} == {"persistence", "crash-recovery"}
    assert any(item["id"] == "clean-reopen" for item in persistent)
    assert any(item["id"] == "interrupted-atomic-commit" for item in persistent)

    pmm = challenge()["pmmNextStep"]
    assert pmm["repository"] == "netkeep80/PersistMemoryManager"
    assert pmm["mayChangeCanonicalContractToMatchPmmInternals"] is False
    assert pmm["acceptanceRequiresSamePortableCorpus"] is True
