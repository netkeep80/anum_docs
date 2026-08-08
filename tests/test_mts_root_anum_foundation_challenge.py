"""Executable non-normative challenge for Foundation Gate A / issue #181.

The test separates two questions that the historical implementation mixed:

* how root-level protocol anchors are constructed from links; and
* the already accepted recursive Anum occurrence-tree grammar over opaque
  ``protocol:0`` / ``protocol:1`` anchors.

No production root or Anum contract is modified here.
"""

from __future__ import annotations

from collections import deque
import json
from pathlib import Path

from core.anum_denotation import canonical_denotation_json, denotation_from_data
from core.anum_memory import AnumMemory
from core.anum_model import ProjectionContext
from core.anum_parser import parse_raw_quaternary
from core.anum_recursive_denotation import canonical_recursive_anum, denotate_recursive_anum
from core.semantic_carrier import (
    CarrierGraph,
    LinkNode,
    associative_root_carrier,
    carrier_isomorphic,
    end_carrier,
    link_carrier,
    start_carrier,
)


ROOT = Path(__file__).resolve().parents[1]
CHALLENGE = ROOT / "contracts/mts-root-anum-foundation-challenge-v0.6.json"
CORPUS = ROOT / "contracts/anum-boundary-conformance-candidate-v0.6.json"
DIRECTION = ROOT / "contracts/mts-foundation-direction-decision-v0.6.json"
EQUALITY_DECISION = ROOT / "contracts/mts-current-link-equality-decision-v0.6.json"
HISTORICAL_BOUNDARY = ROOT / "contracts/anum-boundary-projection-v0.2.json"
RECURSIVE_CONTRACT = ROOT / "contracts/anum-recursive-denotation-v0.2.json"
RECURSIVE_CORPUS = ROOT / "contracts/anum-recursive-denotation-conformance-v0.2.json"
MTS_V05 = ROOT / "contracts/mts-contract-v0.5.json"
ROOT_FIXTURE = ROOT / "tests/mtc_formulas.mtc"


def read(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def context(name: str) -> ProjectionContext:
    return ProjectionContext(name)


def candidate_memory() -> tuple[AnumMemory, dict[str, int]]:
    corpus = read(CORPUS)
    refs = {name: int(ref) for name, ref in corpus["candidateRootRefs"].items()}
    pairs = {
        refs[name]: (int(pair[0]), int(pair[1]))
        for name, pair in corpus["candidatePairs"].items()
    }
    return AnumMemory(pairs), refs


def carrier_from_memory(memory: AnumMemory, root: int) -> CarrierGraph:
    """Project one reachable exact-pair L4 subgraph into the L1 engineering IR."""

    order: list[int] = []
    seen: set[int] = set()
    pending = deque([root])
    while pending:
        ref = pending.popleft()
        if ref in seen:
            continue
        seen.add(ref)
        order.append(ref)
        start, end = memory.poles(ref)
        pending.extend((start, end))

    remap = {ref: index for index, ref in enumerate(order)}
    nodes = tuple(
        LinkNode(start=remap[memory.poles(ref)[0]], end=remap[memory.poles(ref)[1]])
        for ref in order
    )
    return CarrierGraph(nodes=nodes, root=remap[root])


def historical_root_lines() -> list[str]:
    return [
        line.strip()
        for line in ROOT_FIXTURE.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    ]


def test_gate_a_challenge_is_non_normative_and_composes_gate_e():
    challenge = read(CHALLENGE)
    direction = read(DIRECTION)
    equality = read(EQUALITY_DECISION)
    corpus = read(CORPUS)

    assert challenge["schema"] == "mts-root-anum-foundation-challenge/v0.6"
    assert challenge["status"] == "candidate-challenge"
    assert challenge["accepted"] is False
    assert challenge["issue"] == 181
    assert direction["schema"] in challenge["dependsOn"]
    assert equality["schema"] in challenge["dependsOn"]
    assert challenge["conformanceCorpus"] == "contracts/anum-boundary-conformance-candidate-v0.6.json"
    assert corpus["status"] == "candidate-challenge-corpus"
    assert corpus["accepted"] is False
    assert challenge["schema"] not in MTS_V05.read_text(encoding="utf-8")
    assert challenge["releaseVeto"]["productionRootChangeAllowed"] is False
    assert challenge["releaseVeto"]["productionAnumChangeAllowed"] is False


def test_candidate_boundary_graph_is_finite_closed_exact_pair_unique_and_oriented():
    memory, ref = candidate_memory()
    pairs = {name: memory.poles(value) for name, value in ref.items()}

    assert pairs["R"] == (ref["R"], ref["R"])
    assert pairs["O"] == (ref["O"], ref["R"])
    assert pairs["C"] == (ref["R"], ref["C"])
    assert pairs["L"] == (ref["O"], ref["C"])
    assert pairs["U"] == (ref["C"], ref["O"])
    assert pairs["OO"] == (ref["O"], ref["O"])
    assert pairs["CC"] == (ref["C"], ref["C"])
    assert len(set(pairs.values())) == len(pairs)
    assert memory.all_links() == frozenset(ref.values())
    assert ref["O"] != ref["C"]
    assert ref["L"] != ref["U"]


def test_special_boundary_pairs_are_directly_expressed_by_candidate_root_links():
    memory, ref = candidate_memory()

    assert memory.find_link(ref["O"], ref["O"]) == ref["OO"]
    assert memory.find_link(ref["O"], ref["C"]) == ref["L"]
    assert memory.find_link(ref["C"], ref["O"]) == ref["U"]
    assert memory.find_link(ref["C"], ref["C"]) == ref["CC"]

    vectors = {item["raw"]: item for item in read(CORPUS)["specialBoundaryVectors"]}
    assert vectors["[]"]["meaning"] == "L"
    assert vectors["[]"]["protocolValue"] == "1"
    assert vectors["]["]["meaning"] == "U"
    assert vectors["]["]["protocolValue"] == "0"
    assert vectors["[["]["recursiveDenotation"] == "raw"
    assert vectors["]]"]["recursiveDenotation"] == "raw"


def test_individual_open_close_topologies_match_historical_boundary_carriers():
    memory, ref = candidate_memory()
    historical_root = associative_root_carrier()
    historical_open = start_carrier(historical_root)
    historical_close = end_carrier(historical_root)
    candidate_open = carrier_from_memory(memory, ref["O"])
    candidate_close = carrier_from_memory(memory, ref["C"])

    assert carrier_isomorphic(candidate_open, historical_open)
    assert carrier_isomorphic(candidate_close, historical_close)

    bridge = read(CORPUS)["historicalBridge"]
    assert bridge["individualOpenCarrierTopologyPreserved"] is True
    assert bridge["individualCloseCarrierTopologyPreserved"] is True


def test_candidate_one_zero_make_shared_root_delta_explicit_instead_of_claiming_old_isomorphism():
    memory, ref = candidate_memory()
    historical_root = associative_root_carrier()
    historical_open = start_carrier(historical_root)
    historical_close = end_carrier(historical_root)
    historical_one = link_carrier(historical_open, historical_close)
    historical_zero = link_carrier(historical_close, historical_open)
    candidate_one = carrier_from_memory(memory, ref["L"])
    candidate_zero = carrier_from_memory(memory, ref["U"])

    assert not carrier_isomorphic(candidate_one, historical_one)
    assert not carrier_isomorphic(candidate_zero, historical_zero)

    # The ordered local root roles are nevertheless exactly the intended O/C
    # and C/O links in one shared semantic root network.
    assert memory.poles(ref["L"]) == (ref["O"], ref["C"])
    assert memory.poles(ref["U"]) == (ref["C"], ref["O"])

    comparison = read(CHALLENGE)["historicalCarrierComparison"]
    assert comparison["one"]["exactRootedTopologyIsomorphic"] is False
    assert comparison["zero"]["exactRootedTopologyIsomorphic"] is False
    assert comparison["carrierIsomorphicIsL2Equality"] is False
    assert comparison["sharingDeltaAutomaticallyRejected"] is False
    assert comparison["sharingDeltaAutomaticallyAccepted"] is False


def test_candidate_protocol_anchor_binding_is_total_for_recursive_v02_denotations():
    bindings = read(CORPUS)["protocolAnchorBindings"]
    accepted = read(RECURSIVE_CORPUS)

    assert bindings == {"protocol:1": "L", "protocol:0": "U"}
    allowed = set(bindings)

    for case in accepted["cases"]:
        result = denotate_recursive_anum(
            parse_raw_quaternary(case["raw"]),
            context(case["context"]),
        )
        if result.structural is not None:
            assert set(result.structural.anchors) <= allowed


def test_every_accepted_recursive_v02_vector_replays_unchanged_under_candidate_anchor_derivation():
    accepted = read(RECURSIVE_CORPUS)

    assert accepted["status"] == "accepted"
    for case in accepted["cases"]:
        result = denotate_recursive_anum(
            parse_raw_quaternary(case["raw"]),
            context(case["context"]),
        )
        expected = denotation_from_data(case["expected"])
        assert canonical_denotation_json(result) == canonical_denotation_json(expected)

        canonical = case["canonicalRaw"]
        if canonical is not None:
            assert result.structural is not None
            assert canonical_recursive_anum(result) == canonical


def test_recursive_grammar_and_inverse_are_independent_of_root_anchor_internal_topology():
    recursive = read(RECURSIVE_CONTRACT)
    challenge = read(CHALLENGE)["preservedRecursiveSemantics"]
    corpus = read(CORPUS)["recursiveCompatibility"]

    assert recursive["semantics"]["0"] == "Anchor(protocol:0)"
    assert recursive["semantics"]["1"] == "Anchor(protocol:1)"
    assert challenge["rawAlphabet"] == ["[", "]", "1", "0"]
    assert challenge["rootGrammarChanged"] is False
    assert challenge["rootOpeningCollapseChanged"] is False
    assert challenge["canonicalInverseChanged"] is False
    assert challenge["occurrencePreservingPostorderNodesChanged"] is False
    assert challenge["quoteContextChanged"] is False
    assert challenge["relativeContextChanged"] is False
    assert challenge["memoryReadAdded"] is False
    assert corpus["protocolAnchorNamesChanged"] is False
    assert corpus["rawGrammarChanged"] is False
    assert corpus["canonicalInverseChanged"] is False


def test_special_boundary_precedence_matches_historical_raw_behavior_without_old_projection_construction():
    expected = {
        "[]": ("protocol:1", "1"),
        "][": ("protocol:0", "0"),
    }
    for raw, (anchor, canonical) in expected.items():
        result = denotate_recursive_anum(parse_raw_quaternary(raw), ProjectionContext.ROOT)
        assert result.structural is not None
        assert result.structural.anchors == (anchor,)
        assert canonical_recursive_anum(result) == canonical

    for raw in ("[[", "]]"):
        result = denotate_recursive_anum(parse_raw_quaternary(raw), ProjectionContext.ROOT)
        assert result.structural is None
        assert result.raw == raw


def test_candidate_boundary_keeps_historical_protocol_orientation_but_changes_derivation_names():
    historical = read(HISTORICAL_BOUNDARY)
    candidate = read(CORPUS)

    assert historical["orientation"] == {"open": "♀∞", "close": "∞♂"}
    meanings = {item["raw"]: item["meaning"] for item in candidate["protocolProjection"]}
    assert meanings == {"[": "O", "]": "C", "1": "L", "0": "U"}
    assert candidate["rootMeanings"] == {
        "∞": "R",
        "([)": "O",
        "(])": "C",
        "(⟼)": "L",
        "(↛)": "U",
    }
    assert candidate["recursiveCompatibility"]["specialBoundaryPrecedenceChanged"] is False


def test_round_form_a2_is_not_required_by_the_candidate_anum_boundary():
    corpus = read(CORPUS)["roundRootA2"]
    root_meanings = read(CORPUS)["rootMeanings"]

    assert "()" not in root_meanings
    assert corpus["requiredForThisAnumBoundaryCorpus"] is False
    assert corpus["removingA2ChangesROCLU"] is False
    assert corpus["foundationNeedStillOpen"] is True


def test_historical_root_and_anum_contracts_remain_unchanged():
    lines = historical_root_lines()
    challenge = read(CHALLENGE)

    assert len(lines) == 10
    assert lines[0] == "∞ : {◁ = ∞, ▷ = ∞}"
    assert read(HISTORICAL_BOUNDARY)["status"] == "accepted-subset"
    assert read(RECURSIVE_CONTRACT)["status"] == "accepted"
    assert challenge["effectsBoundary"]["historicalContractsMutated"] is False
    assert challenge["effectsBoundary"]["historicalRootFixtureMutated"] is False
    assert challenge["releaseVeto"]["acceptedContractLinkAllowed"] is False
