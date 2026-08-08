"""Executable counterexamples for candidate replay-to-derivation lifts v0.3."""

import json
from pathlib import Path

from core.mtc_ast import Definition, Form, format_expression
from core.mtc_definitions import DefinitionEnvironment, DefinitionLookupKind, open_definition
from core.mtc_interpreter import ContextFrame, interpret_constraints
from core.mtc_parser import parse_formula
from core.proof_checker import DistinguishedLink, ProofMemory


ROOT = Path(__file__).parents[1]
CHALLENGE = ROOT / "contracts" / "mts-proof-lifting-challenge-v0.3.json"
CORPUS = ROOT / "contracts" / "mts-proof-lifting-conformance-v0.3.json"
PROOF_V02 = ROOT / "contracts" / "mts-proof-v0.2.json"


def read(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def definition(source: str) -> Definition:
    value = parse_formula(source)
    assert isinstance(value, Definition)
    return value


def target(source: str) -> Form:
    return definition(f"{source} : __lift_query__").target


def build_environment(definitions: list[str]) -> DefinitionEnvironment:
    environment = DefinitionEnvironment()
    for source in definitions:
        environment.register(definition(source))
    return environment


def opening_data(definitions: list[str], target_source: str) -> dict:
    result = open_definition(target(target_source), build_environment(definitions))
    if result.kind is not DefinitionLookupKind.MATCH:
        return {"kind": result.kind.value}
    assert result.body is not None
    return {"kind": "match", "body": format_expression(result.body)}


def interpret_success(vector: dict) -> bool:
    memory = ProofMemory(
        tuple(
            DistinguishedLink(id=item["id"], start=item["start"], end=item["end"])
            for item in vector["memory"]
        )
    )
    result = interpret_constraints(
        parse_formula(vector["expression"]),
        ContextFrame(start=vector["context"]["start"], end=vector["context"]["end"]),
        memory,
        symbols=dict(vector["symbols"]),
    )
    return result.success


def test_challenge_is_non_normative_and_adds_no_trusted_rules():
    data = read(CHALLENGE)
    proof = read(PROOF_V02)

    assert data["schema"] == "mts-proof-lifting-challenge/v0.3"
    assert data["status"] == "candidate-challenge"
    assert data["acceptedContractLinkAllowed"] is False
    assert data["productionProofChangeAllowed"] is False
    assert data["trustedRuleChangeAllowed"] is False
    assert proof["checker"]["trustedRuleSet"] == ["interpret"]
    assert data["derivationBoundary"]["genericCompositionAccepted"] is False


def test_contextual_satisfaction_is_context_scoped_not_global_truth():
    vectors = {item["id"]: item for item in read(CORPUS)["vectors"]}
    positive = vectors["contextual-satisfaction-positive"]
    counter = vectors["contextual-satisfaction-countercontext"]

    assert interpret_success(positive) is True
    assert interpret_success(counter) is False
    assert positive["expression"] == counter["expression"]
    assert positive["symbols"] == counter["symbols"]
    assert positive["context"] != counter["context"]

    candidate = next(
        item for item in read(CHALLENGE)["candidateLifts"]
        if item["id"] == "contextual-satisfaction"
    )
    assert "global formula truth" in candidate["doesNotMean"]
    assert candidate["accepted"] is False


def test_definition_opening_match_is_exact_relation_but_not_equality():
    vector = next(item for item in read(CORPUS)["vectors"] if item["id"] == "opening-match")
    assert opening_data(vector["definitions"], vector["target"]) == vector["expect"]
    assert vector["mustNotAssertEquality"] is True

    candidate = next(
        item for item in read(CHALLENGE)["candidateLifts"]
        if item["id"] == "definition-opens"
    )
    assert "target = body" in candidate["doesNotMean"]
    assert "RHS interpretation" in candidate["doesNotMean"]
    assert candidate["accepted"] is False


def test_no_match_is_scoped_to_exact_environment_not_global_absence():
    vectors = {item["id"]: item for item in read(CORPUS)["vectors"]}
    local = vectors["no-match-local"]
    other = vectors["same-target-other-environment"]

    assert opening_data(local["definitions"], local["target"]) == {"kind": "no-match"}
    assert opening_data(other["definitions"], other["target"]) == other["expect"]

    candidate = next(
        item for item in read(CHALLENGE)["candidateLifts"]
        if item["id"] == "no-visible-definition"
    )
    assert "definition does not exist globally" in candidate["doesNotMean"]
    assert candidate["accepted"] is False


def test_conflict_does_not_assert_duplicate_body_equality():
    vector = next(item for item in read(CORPUS)["vectors"] if item["id"] == "same-scope-conflict")
    assert opening_data(vector["definitions"], vector["target"]) == {"kind": "conflict"}
    assert vector["mustNotAssertBodyEquality"] is True

    witness = read(CHALLENGE)["mandatoryCounterexamples"]
    conflict = next(item for item in witness if item["id"] == "conflict-not-equality")
    assert "b=c" in conflict["witness"]


def test_non_addressable_target_is_typed_relation_candidate_only():
    vector = next(item for item in read(CORPUS)["vectors"] if item["id"] == "anonymous-target")
    assert opening_data(vector["definitions"], vector["target"]) == {"kind": "non-addressable"}

    candidate = next(
        item for item in read(CHALLENGE)["candidateLifts"]
        if item["id"] == "non-addressable-target"
    )
    assert candidate["accepted"] is False
    assert candidate["scope"] == "accepted v0.3 definition-addressability subset"


def test_all_lifts_stay_unaccepted_and_classical_composition_is_still_blocked():
    data = read(CHALLENGE)
    assert all(item["accepted"] is False for item in data["candidateLifts"])
    boundary = data["derivationBoundary"]
    assert boundary == {
        "liftResultMayBeUsedAsPremiseOnlyAfterAcceptance": True,
        "genericCompositionAccepted": False,
        "transitivityAccepted": False,
        "symmetryAccepted": False,
        "congruenceAccepted": False,
        "modusPonensAccepted": False,
        "globalSubstitutionAccepted": False,
        "searchTraceIsEvidence": False,
    }


def test_next_gate_is_relation_acceptance_decision_not_multistep_search():
    gate = read(CHALLENGE)["nextGate"]
    assert gate["mustKeepMtsProofV02Unchanged"] is True
    assert gate["mustNotAddTrustedRulesYet"] is True
    assert gate["goal"].startswith("decide which challenged relations")
