from __future__ import annotations

import json
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[1]
CONTRACT_PATH = ROOT / "contracts/anum-stream-deserialization-v0.3.json"
CONFORMANCE_PATH = ROOT / "contracts/anum-stream-deserialization-conformance-v0.3.json"


class StreamError(ValueError):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


def _load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def _link(start: str, end: str) -> str:
    root_pairs = {
        ("R", "R"): "R",
        ("O", "R"): "O",
        ("R", "C"): "C",
        ("O", "C"): "L",
        ("C", "O"): "U",
    }
    return root_pairs.get((start, end), f"({start}⟼{end})")


def _append(frame: dict, value: str) -> None:
    if not frame["started"]:
        frame["current"] = value
        frame["started"] = True
    else:
        frame["current"] = _link(frame["current"], value)


def _deserialize(source: str) -> tuple[str, list[str], list[str]]:
    frames = [{"started": False, "current": "R"}]
    operations: list[str] = []
    resolved: list[str] = []

    for token in source:
        if token == "[":
            frames.append({"started": False, "current": "R"})
            operations.append("OPEN")
            continue
        if token == "]":
            if len(frames) == 1:
                raise StreamError("unexpected-close")
            inner = frames.pop()
            returned = "R" if not inner["started"] else _link("R", inner["current"])
            _append(frames[-1], returned)
            operations.append("CLOSE")
            continue
        if token in "10":
            value = "L" if token == "1" else "U"
            resolved.append(value)
            _append(frames[-1], value)
            operations.append("VALUE")
            continue
        raise StreamError("non-abit")

    if len(frames) != 1:
        raise StreamError("unclosed-open")
    result = frames[0]["current"] if frames[0]["started"] else "R"
    return result, resolved, operations


def test_contract_is_current_accepted_and_independent_of_foundation_v2_acceptance() -> None:
    contract = _load(CONTRACT_PATH)

    assert contract["schema"] == "anum-stream-deserialization/v0.3"
    assert contract["status"] == "accepted"
    assert contract["accepted"] is True
    assert contract["semanticReset"] == 343
    assert contract["issue"] == 355
    assert contract["scope"]["effect"] == "none"
    assert contract["scope"]["existingAsetCarrierInputAccepted"] is False
    assert contract["downstream"]["aproverRepinAllowed"] is True


def test_contract_preserves_four_abits_root_and_by_poles_identity() -> None:
    contract = _load(CONTRACT_PATH)

    assert contract["alphabet"]["abits"] == ["[", "]", "1", "0"]
    assert contract["alphabet"]["rootIsFifthAbit"] is False
    assert contract["alphabet"]["rootIsImplicitContextBasis"] is True
    assert contract["rootBasis"]["root"] == "R"
    assert contract["semanticIdentity"]["linkIdentity"] == "by ordered semantic poles"
    assert contract["semanticIdentity"]["rootCollapse"] == "Link(R,R)=R"
    assert contract["semanticIdentity"]["samePairCreatesSecondSemanticLink"] is False
    assert contract["semanticIdentity"]["repeatedSourcePositionCreatesSecondSemanticLink"] is False


def test_every_valid_conformance_vector_executes() -> None:
    corpus = _load(CONFORMANCE_PATH)
    assert corpus["schema"] == "anum-stream-deserialization-conformance/v0.3"
    assert corpus["contract"] == "anum-stream-deserialization/v0.3"
    assert corpus["accepted"] is True

    for vector in corpus["valid"]:
        result, resolved, operations = _deserialize(vector["source"])
        assert result == vector["expectedDenotation"], vector["id"]
        assert operations == vector["expectedOperations"], vector["id"]
        if "expectedResolvedValues" in vector:
            assert resolved == vector["expectedResolvedValues"], vector["id"]
        if "expectedDistinctRootRefs" in vector:
            assert sorted(set(resolved)) == sorted(vector["expectedDistinctRootRefs"]), vector["id"]


def test_every_invalid_conformance_vector_rejects_with_exact_boundary() -> None:
    corpus = _load(CONFORMANCE_PATH)

    for vector in corpus["invalid"]:
        with pytest.raises(StreamError) as caught:
            _deserialize(vector["source"])
        assert caught.value.code == vector["error"], vector["id"]


def test_empty_groups_and_root_collapse_are_not_special_copies() -> None:
    assert _deserialize("")[0] == "R"
    assert _deserialize("[]")[0] == "R"
    assert _deserialize("[][]")[0] == "R"
    assert _link("R", "R") == "R"


def test_physical_positions_do_not_duplicate_root_links() -> None:
    result, resolved, _ = _deserialize("1110")
    assert resolved == ["L", "L", "L", "U"]
    assert set(resolved) == {"L", "U"}
    assert result == "(((L⟼L)⟼L)⟼U)"
