import json
from pathlib import Path

import pytest

from core.anum_parser import parse_raw_quaternary
from core.anum_protocol import (
    StreamError,
    deserialize_anum,
    deserialize_stream,
    semantic_link,
)


ROOT = Path(__file__).resolve().parents[1]
MTS_CONTRACT_PATH = ROOT / "contracts/mts-contract-v0.6.json"
MTS_CONFORMANCE_PATH = ROOT / "contracts/mts-conformance-v0.6.json"
SUPERSEDED_SEQUENCE_CANDIDATE = ROOT / "contracts/mts-anum-sequence-materialization-v0.7.json"


def _contract() -> dict:
    current = json.loads(MTS_CONTRACT_PATH.read_text(encoding="utf-8"))
    return current["surfaces"]["anum"]


def _corpus() -> dict:
    current = json.loads(MTS_CONFORMANCE_PATH.read_text(encoding="utf-8"))
    return current["corpora"]["anum"]


def test_contract_is_current_accepted_and_independent_of_foundation_v2_acceptance() -> None:
    contract = _contract()

    assert contract["schema"] == "anum-deserialization/v0.4"
    assert contract["status"] == "accepted"
    assert contract["accepted"] is True
    assert contract["semanticReset"] == 343
    assert contract["issue"] == 379
    assert contract["scope"]["effect"] == "none"
    assert contract["scope"]["existingAsetCarrierInputAccepted"] is True
    assert contract["supersedes"] == "anum-stream-deserialization/v0.3"
    assert contract["transports"]["rawChannel"]["operation"] == "deserialize_stream"
    assert contract["transports"]["existingCarrier"]["roleIsExplicit"] is True
    assert contract["transports"]["existingCarrier"]["readOnly"] is True
    assert contract["transports"]["existingCarrier"]["materializes"] is False
    assert contract["transportConvergence"]["carrierDecodesToRawBeforeStackMachine"] is True
    assert contract["transportConvergence"]["secondOpenCloseValueAlgorithm"] is False
    assert contract["downstream"]["aproverRepinAllowed"] is True
    assert contract["versionBoundary"]["rawV03StackSemanticsChanged"] is False
    assert contract["versionBoundary"]["supersedesFoundationV2SequenceMaterializationCandidateV07"] is True
    assert contract["versionBoundary"]["foundationV2SequenceGroupSemanticsInherited"] is False
    assert not SUPERSEDED_SEQUENCE_CANDIDATE.exists()


def test_contract_preserves_four_abits_root_and_by_poles_identity() -> None:
    contract = _contract()

    assert contract["alphabet"]["abits"] == ["[", "]", "1", "0"]
    assert contract["alphabet"]["rootIsFifthAbit"] is False
    assert contract["alphabet"]["rootIsImplicitContextBasis"] is True
    assert contract["rootBasis"]["root"] == "R"
    assert contract["semanticIdentity"]["linkIdentity"] == "by ordered semantic poles"
    assert contract["semanticIdentity"]["rootCollapse"] == "Link(R,R)=R"
    assert contract["semanticIdentity"]["samePairCreatesSecondSemanticLink"] is False
    assert contract["semanticIdentity"]["repeatedSourcePositionCreatesSecondSemanticLink"] is False


def test_every_valid_conformance_vector_executes_in_production_core() -> None:
    corpus = _corpus()
    assert corpus["schema"] == "anum-deserialization-conformance/v0.4"

    for vector in corpus["valid"]:
        result = deserialize_stream(vector["source"])
        assert result.denotation == vector["expectedDenotation"], vector["id"]
        assert list(result.operations) == vector["expectedOperations"], vector["id"]
        if "expectedResolvedValues" in vector:
            assert list(result.resolved_values) == vector["expectedResolvedValues"], vector["id"]
        if "expectedDistinctRootRefs" in vector:
            assert sorted(set(result.resolved_values)) == sorted(vector["expectedDistinctRootRefs"]), vector["id"]


def test_parsed_transport_and_compact_stream_have_identical_denotation() -> None:
    for source in ("", "[]", "1", "10", "[1]", "[[]]", "1110"):
        assert deserialize_anum(parse_raw_quaternary(source)) == deserialize_stream(source)


def test_every_invalid_conformance_vector_rejects_with_exact_boundary() -> None:
    for vector in _corpus()["invalid"]:
        with pytest.raises(StreamError) as caught:
            deserialize_stream(vector["source"])
        assert caught.value.code == vector["error"], vector["id"]


def test_empty_groups_and_root_collapse_are_not_special_copies() -> None:
    assert deserialize_stream("").denotation == "R"
    assert deserialize_stream("[]").denotation == "R"
    assert deserialize_stream("[][]").denotation == "R"
    assert semantic_link("R", "R") == "R"


def test_physical_positions_do_not_duplicate_root_links() -> None:
    result = deserialize_stream("1110")
    assert result.resolved_values == ("L", "L", "L", "U")
    assert set(result.resolved_values) == {"L", "U"}
    assert result.denotation == "(((L⟼L)⟼L)⟼U)"
