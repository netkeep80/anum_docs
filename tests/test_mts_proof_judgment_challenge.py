"""Executable challenge for candidate typed-operation MTS proof judgments v0.3."""

from copy import deepcopy
import json
from pathlib import Path

from core.mtc_ast import Definition, Form, format_expression
from core.mtc_definitions import (
    DefinitionEnvironment,
    DefinitionLookupKind,
    DefinitionRegistrationKind,
    open_definition,
)
from core.mtc_parser import parse_formula
from core.proof_checker import (
    DistinguishedLink,
    ExpectedAlias,
    ExpectedSubstitution,
    InterpretProofStep,
    ProofContext,
    ProofObject,
    check_interpret_step,
    check_proof,
)


ROOT = Path(__file__).parents[1]
CHALLENGE = ROOT / "contracts" / "mts-proof-judgment-challenge-v0.3.json"
CORPUS = ROOT / "contracts" / "mts-proof-judgment-conformance-v0.3.json"
DECISION = ROOT / "contracts" / "mts-proof-judgment-decision-v0.3.json"
MTS_V03 = ROOT / "contracts" / "mts-contract-v0.3.json"
PROOF_V02 = ROOT / "contracts" / "mts-proof-v0.2.json"
CONTRACT_VERSION = "mts-contract/v0.3"


def read(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def definition(source: str) -> Definition:
    value = parse_formula(source)
    assert isinstance(value, Definition)
    return value


def target(source: str) -> Form:
    return definition(f"{source} : __proof_judgment_query__").target


def proof_context(data: dict) -> ProofContext:
    parent = data.get("parent")
    return ProofContext(
        start=data["start"],
        end=data["end"],
        parent=proof_context(parent) if parent is not None else None,
    )


def interpret_step(claim: dict) -> InterpretProofStep:
    expected = claim["expected"]
    return InterpretProofStep(
        expression=claim["expression"],
        context=proof_context(claim["context"]),
        distinguished_memory=tuple(
            DistinguishedLink(id=item["id"], start=item["start"], end=item["end"])
            for item in claim["memory"]
        ),
        symbols=tuple((name, link) for name, link in claim["symbols"]),
        expected_success=expected["success"],
        expected_substitutions=tuple(
            ExpectedSubstitution(path=tuple(item["path"]), link=item["link"])
            for item in expected["substitutions"]
        ),
        expected_aliases=tuple(
            ExpectedAlias(
                path=tuple(item["path"]),
                target_path=tuple(item["targetPath"]),
            )
            for item in expected["aliases"]
        ),
    )


def reconstruct_environments(scopes: list[dict]) -> dict[tuple[int, ...], DefinitionEnvironment]:
    environments: dict[tuple[int, ...], DefinitionEnvironment] = {}
    for scope in sorted(scopes, key=lambda item: (len(item["path"]), item["path"])):
        path = tuple(scope["path"])
        parent_path = scope["parent"]
        if parent_path is None:
            assert path == ()
            environment = DefinitionEnvironment()
        else:
            parent = environments[tuple(parent_path)]
            assert path[:-1] == parent.scope_path
            environment = parent.child(path[-1])
        environments[path] = environment

        for source in scope["definitions"]:
            registration = environment.register(definition(source))
            assert registration.kind in {
                DefinitionRegistrationKind.REGISTERED,
                DefinitionRegistrationKind.CONFLICT,
                DefinitionRegistrationKind.NON_ADDRESSABLE,
            }
    return environments


def opening_result(claim: dict) -> dict:
    environments = reconstruct_environments(claim["scopes"])
    environment = environments[tuple(claim["lookupScope"])]
    result = open_definition(target(claim["target"]), environment)

    if result.kind is not DefinitionLookupKind.MATCH:
        return {"kind": result.kind.value}

    assert result.definition_id is not None
    assert result.body is not None
    return {
        "kind": "match",
        "definitionId": {
            "scopePath": list(result.definition_id.scope_path),
            "ordinal": result.definition_id.ordinal,
        },
        "body": format_expression(result.body),
    }


def check_candidate_judgment(claim: dict) -> bool:
    if claim.get("contractVersion") != CONTRACT_VERSION:
        return False
    if claim.get("operation") == "interpret":
        try:
            return check_interpret_step(interpret_step(claim))
        except (AssertionError, KeyError, TypeError, ValueError):
            return False
    if claim.get("operation") == "open-definition":
        try:
            return opening_result(claim) == claim["expected"]
        except (AssertionError, KeyError, TypeError, ValueError):
            return False
    return False


def patched_claim(source: dict, patch: dict) -> dict:
    result = deepcopy(source)
    for dotted_path, value in patch.items():
        parts = dotted_path.split(".")
        current = result
        for part in parts[:-1]:
            current = current[part]
        current[parts[-1]] = deepcopy(value)
    return result


def claims_by_id() -> dict[str, dict]:
    data = read(CORPUS)
    claims = data["interpretJudgments"] + data["openingJudgments"]
    return {claim["id"]: claim for claim in claims}


def test_challenge_is_non_normative_and_does_not_expand_trusted_v02_kernel():
    challenge = read(CHALLENGE)
    decision = read(DECISION)
    mts_v03_text = MTS_V03.read_text(encoding="utf-8")
    proof_v02 = read(PROOF_V02)

    assert challenge["schema"] == "mts-proof-judgment-challenge/v0.3"
    assert challenge["status"] == "candidate-challenge"
    assert challenge["acceptedContractLinkAllowed"] is False
    assert challenge["productionProofChangeAllowed"] is False
    assert challenge["trustedRuleChangeAllowed"] is False
    assert challenge["schema"] not in mts_v03_text
    assert decision["nextGate"]["artifact"] == challenge["schema"]
    assert proof_v02["checker"]["trustedRuleSet"] == ["interpret"]


def test_corpus_is_candidate_only_version_self_describing_and_has_both_operations():
    corpus = read(CORPUS)
    claims = corpus["interpretJudgments"] + corpus["openingJudgments"]

    assert corpus["schema"] == "mts-proof-judgment-conformance/v0.3"
    assert corpus["status"] == "candidate-challenge-corpus"
    assert corpus["contract"] == "mts-proof-judgment-challenge/v0.3"
    assert corpus["contractVersion"] == CONTRACT_VERSION
    assert {item["contractVersion"] for item in claims} == {CONTRACT_VERSION}
    assert {item["operation"] for item in corpus["interpretJudgments"]} == {"interpret"}
    assert {item["operation"] for item in corpus["openingJudgments"]} == {"open-definition"}
    assert {item["goalId"] for item in claims} == {
        "g-interpret-0",
        "g-interpret-1",
        "g-interpret-2",
        "g-open-0",
        "g-open-1",
        "g-open-2",
        "g-open-3",
        "g-open-4",
        "g-open-5",
        "g-open-6",
        "g-open-7",
    }


def test_all_interpret_claims_losslessly_replay_through_existing_v02_checker():
    for claim in read(CORPUS)["interpretJudgments"]:
        step = interpret_step(claim)
        assert check_interpret_step(step), claim["id"]
        assert check_proof(ProofObject(steps=(step,))), claim["id"]
        assert check_candidate_judgment(claim), claim["id"]


def test_all_opening_claims_replay_exactly_through_canonical_one_step_operation():
    for claim in read(CORPUS)["openingJudgments"]:
        assert opening_result(claim) == claim["expected"], claim["id"]
        assert check_candidate_judgment(claim), claim["id"]


def test_negative_opening_results_are_exact_replay_claims_not_hidden_failures():
    claims = claims_by_id()

    assert opening_result(claims["open-no-hidden-root"]) == {"kind": "no-match"}
    assert opening_result(claims["open-missing"]) == {"kind": "no-match"}
    assert opening_result(claims["open-conflict"]) == {"kind": "conflict"}
    assert opening_result(claims["open-non-addressable"]) == {"kind": "non-addressable"}

    boundary = read(CHALLENGE)["negativeClaimsAreFirstClass"]
    assert boundary["openingNoMatch"] is True
    assert boundary["openingConflict"] is True
    assert boundary["openingNonAddressable"] is True


def test_root_definitions_are_not_injected_when_the_serialized_scope_is_empty():
    claims = claims_by_id()

    explicit = opening_result(claims["open-explicit-root-infinity"])
    empty = opening_result(claims["open-no-hidden-root"])

    assert explicit == {
        "kind": "match",
        "definitionId": {"scopePath": [], "ordinal": 0},
        "body": "{◁ = ∞, ▷ = ∞}",
    }
    assert empty == {"kind": "no-match"}
    assert read(CHALLENGE)["independentReplay"]["ambientRootDefinitionsInjected"] is False


def test_shadowing_and_recursion_vectors_remain_finite_and_replay_local():
    claims = claims_by_id()

    shadow = opening_result(claims["open-child-shadowing"])
    self_open = opening_result(claims["open-self-one-step"])
    mutual_open = opening_result(claims["open-mutual-a-one-step"])

    assert shadow["definitionId"] == {"scopePath": [0], "ordinal": 0}
    assert shadow["body"] == "child"
    assert self_open["body"] == "a"
    assert mutual_open["body"] == "b"
    assert "steps" not in self_open and "cycle" not in self_open
    assert "steps" not in mutual_open and "cycle" not in mutual_open

    cycle = read(CHALLENGE)["cycleBoundary"]
    assert cycle["selfDefinitionOpeningSteps"] == 1
    assert cycle["mutualDefinitionOpeningSteps"] == 1
    assert cycle["recursiveNormalization"] is False


def test_every_forged_expected_result_is_rejected_by_independent_replay():
    claims = claims_by_id()
    corpus = read(CORPUS)

    for forgery in corpus["forgeries"]:
        source = claims[forgery["sourceJudgment"]]
        forged = patched_claim(source, forgery["patch"])
        assert forgery["mustReject"] is True
        assert not check_candidate_judgment(forged), forgery["id"]


def test_wrong_or_missing_contract_version_is_rejected_before_operation_replay():
    source = claims_by_id()["open-explicit-root-infinity"]

    wrong = patched_claim(source, {"contractVersion": "mts-contract/v0.2"})
    missing = deepcopy(source)
    del missing["contractVersion"]

    assert not check_candidate_judgment(wrong)
    assert not check_candidate_judgment(missing)


def test_replay_does_not_mutate_serialized_claims_or_substrates():
    corpus = read(CORPUS)
    original = deepcopy(corpus)

    for claim in corpus["interpretJudgments"] + corpus["openingJudgments"]:
        assert check_candidate_judgment(claim)

    assert corpus == original
    veto = read(CHALLENGE)["mutationVeto"]
    assert veto["serializedDefinitionScopesMustRemainByteEquivalent"] is True
    assert veto["serializedMemoryMustRemainByteEquivalent"] is True
    assert veto["openDefinitionMayRealize"] is False
    assert veto["interpretMayRealize"] is False
    assert veto["checkerMayDelete"] is False


def test_challenge_does_not_accept_composition_or_classical_rules_by_default():
    veto = read(CHALLENGE)["semanticVeto"]

    assert veto == {
        "successfulOpeningImpliesEquality": False,
        "globalTextualSubstitution": False,
        "globalEqualityRewrite": False,
        "unrestrictedSymmetry": False,
        "unrestrictedTransitivity": False,
        "unrestrictedCongruence": False,
        "modusPonens": False,
        "genericStepCompositionAccepted": False,
    }
