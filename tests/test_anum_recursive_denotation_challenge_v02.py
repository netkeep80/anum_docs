"""Challenge gate for recursive Anum denotation before a production grammar exists."""

import json
from pathlib import Path

from core.anum_parser import normalize_raw_form, parse_raw_quaternary


ROOT = Path(__file__).resolve().parents[1]
CHALLENGE_PATH = ROOT / "contracts" / "anum-recursive-denotation-challenge-v0.2.json"
PAIR_PATH = ROOT / "contracts" / "anum-pair-denotation-v0.2.json"
DENOTATION_PATH = ROOT / "contracts" / "anum-denotation-v0.2.json"


def _load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def test_challenge_is_non_normative_and_depends_on_accepted_subset():
    challenge = _load(CHALLENGE_PATH)

    assert challenge["schema"] == "anum-recursive-denotation-challenge/v0.2"
    assert challenge["status"] == "challenged"
    assert challenge["dependsOn"] == [
        "anum-boundary-projection/v0.2",
        "anum-denotation/v0.2",
        "anum-pair-denotation/v0.2",
    ]
    assert challenge["parentIssues"] == [89, 95]


def test_baseline_is_exactly_the_already_accepted_pair_contract():
    challenge = _load(CHALLENGE_PATH)
    pair = _load(PAIR_PATH)

    assert challenge["acceptedBaseline"]["rootStructural"] == pair["acceptedStructuralRaw"]
    assert challenge["acceptedBaseline"]["rootAliases"] == pair["acceptedRootAliases"]
    assert challenge["acceptedBaseline"]["canonicalAliasInverse"] == {
        "][": "0",
        "[]": "1",
    }


def test_all_three_atom_direct_sequences_remain_explicitly_ambiguous():
    challenge = _load(CHALLENGE_PATH)
    cases = challenge["directSequenceChallenges"]

    assert [case["raw"] for case in cases] == [
        "000",
        "001",
        "010",
        "011",
        "100",
        "101",
        "110",
        "111",
    ]

    for case in cases:
        assert case["requiredCurrentKind"] == "raw"
        assert len(case["competingAssociationShapes"]) == 2
        assert len(set(case["competingAssociationShapes"])) == 2
        parsed = parse_raw_quaternary(case["raw"])
        assert normalize_raw_form(parsed) == case["raw"]


def test_bracket_candidates_are_raw_syntax_not_an_assumed_recursive_grammar():
    challenge = _load(CHALLENGE_PATH)
    pair = _load(PAIR_PATH)
    accepted = set(pair["acceptedStructuralRaw"]) | set(pair["acceptedRootAliases"])

    for case in challenge["bracketChallenges"]:
        assert case["raw"] not in accepted
        assert case["rootRequiredCurrentKind"] == "raw"
        assert case["reason"]
        parsed = parse_raw_quaternary(case["raw"])
        assert normalize_raw_form(parsed) == case["raw"]


def test_contexts_cannot_inherit_recursive_semantics_implicitly():
    contexts = _load(CHALLENGE_PATH)["contextSeparation"]

    assert "not accepted" in contexts["root"]
    assert "quote" in contexts["quote"]
    assert "raw" in contexts["relative"]


def test_identity_constraints_match_storage_neutral_denotation_contract():
    challenge = _load(CHALLENGE_PATH)
    denotation = _load(DENOTATION_PATH)
    identity = challenge["identityConstraints"]

    assert identity["displayLabelIsIdentity"] is False
    assert identity["rawSpellingIsRuntimeIdentity"] is False
    assert identity["persistentLinkIdAllowed"] is False
    assert identity["structuralNodeIdentity"] == "description-local"

    assert denotation["identity"]["displayLabelIsIdentity"] is False
    assert denotation["identity"]["rawSpellingIsRuntimeIdentity"] is False
    assert denotation["identity"]["persistentLinkIdAllowed"] is False
    assert denotation["identity"]["nodeIdentity"] == "description-local node id"


def test_future_acceptance_requires_round_trip_and_one_decoder_path():
    gates = _load(CHALLENGE_PATH)["futureAcceptanceGates"]
    joined = "\n".join(gates)

    assert "unique parse" in joined
    assert "deterministic canonical inverse" in joined
    assert "decode(canonical_encode(D)) = D" in joined
    assert "canonical_encode(decode(raw)) = canonical(raw)" in joined
    assert "single path" in joined
    assert "compatibility decoder" in joined
