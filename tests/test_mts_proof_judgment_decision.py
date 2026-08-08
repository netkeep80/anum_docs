"""Executable evidence for the non-normative MTS proof-judgment decision v0.3."""

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
from core.root_library import load_root_library


ROOT = Path(__file__).parents[1]
DECISION = ROOT / "contracts" / "mts-proof-judgment-decision-v0.3.json"
MTS_V03 = ROOT / "contracts" / "mts-contract-v0.3.json"
OPENING = ROOT / "contracts" / "mts-definition-opening-v0.3.json"
PROOF_V02 = ROOT / "contracts" / "mts-proof-v0.2.json"
ROOT_PROGRAM = ROOT / "tests" / "mtc_formulas.mtc"


def read(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def definition(source: str) -> Definition:
    value = parse_formula(source)
    assert isinstance(value, Definition)
    return value


def target(source: str) -> Form:
    return definition(f"{source} : __proof_query__").target


def reconstruct_scopes(scopes: list[dict]) -> dict[tuple[int, ...], DefinitionEnvironment]:
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
            result = environment.register(definition(source))
            assert result.kind is DefinitionRegistrationKind.REGISTERED
    return environments


def test_decision_is_non_normative_over_released_v03_and_current_v02_kernel():
    data = read(DECISION)
    mts_v03 = read(MTS_V03)
    proof_v02 = read(PROOF_V02)

    assert data["schema"] == "mts-proof-judgment-decision/v0.3"
    assert data["status"] == "candidate-decision"
    assert data["dependsOn"] == [
        mts_v03["schema"],
        "mts-definition-opening/v0.3",
        proof_v02["schema"],
    ]
    assert data["acceptedContractLinkAllowed"] is False
    assert data["productionProofChangeAllowed"] is False
    assert data["trustedRuleChangeAllowed"] is False
    assert proof_v02["checker"]["trustedRuleSet"] == ["interpret"]
    assert data["trustedBoundary"]["trustedRulesAddedByThisDecision"] == []
    assert data["schema"] not in MTS_V03.read_text(encoding="utf-8")


def test_only_typed_operation_claim_is_preferred_and_no_composition_is_accepted():
    models = {model["id"]: model for model in read(DECISION)["models"]}

    assert models["A"]["verdict"] == "reject"
    assert models["B"]["verdict"] == "reject"
    assert models["C"]["verdict"] == "preferred-candidate"
    assert models["D"]["verdict"] == "reject"
    assert models["E"]["verdict"] == "defer"
    assert all(model["accepted"] is False for model in models.values())

    candidate = read(DECISION)["preferredCandidate"]
    assert candidate["kind"] == "typed operation claim with exact replay result"
    assert candidate["commonFields"]["contractVersion"] == "mts-contract/v0.3"
    assert candidate["proofSearchIsPartOfJudgment"] is False
    assert candidate["compositionRuleAccepted"] is False
    assert "A = F merely because A : F opens" in candidate["notEquivalentTo"]


def test_existing_interpret_replay_is_goal_kind_without_new_rule():
    proof_v02 = read(PROOF_V02)
    goal = read(DECISION)["goalKinds"]["interpret"]

    assert proof_v02["checker"]["trustedRuleSet"] == ["interpret"]
    assert goal["operation"] == "canonical v0.2 interpret"
    assert goal["inheritsCurrentTrustedReplay"] is True
    assert goal["introducesNewInferenceRule"] is False
    assert goal["inputs"] == [
        "ContextFrame snapshot",
        "symbol -> LinkRef bindings",
        "distinguished finite MemoryView snapshot",
    ]


def test_opening_goal_is_not_equality_interpretation_or_l4_execution():
    opening = read(OPENING)
    goal = read(DECISION)["goalKinds"]["open-definition"]

    assert opening["operation"]["assertsEquality"] is False
    assert opening["operation"]["evaluatesBody"] is False
    assert opening["operation"]["readsL4"] is False
    assert opening["operation"]["writesL4"] is False
    assert goal["takesContextFrame"] is False
    assert goal["takesMemoryView"] is False
    assert goal["assertsEquality"] is False
    assert goal["evaluatesReturnedBody"] is False
    assert goal["producesTrustedRuleByItself"] is False


def test_root_opening_replays_only_when_root_scope_is_explicit():
    library = load_root_library(ROOT_PROGRAM)
    root_sources = [formula.text for formula in library.formulas]
    environments = reconstruct_scopes(
        [{"path": [], "parent": None, "definitions": root_sources}]
    )
    root = environments[()]

    assert len(root.entries()) == 10
    for ordinal, formula in enumerate(library.formulas):
        assert isinstance(formula.ast, Definition)
        result = open_definition(formula.ast.target, root)
        assert result.kind is DefinitionLookupKind.MATCH
        assert result.definition_id is not None
        assert result.definition_id.scope_path == ()
        assert result.definition_id.ordinal == ordinal
        assert result.body is not None
        assert format_expression(result.body) == format_expression(formula.ast.value)

    empty = DefinitionEnvironment()
    assert open_definition(target("∞"), empty).kind is DefinitionLookupKind.NO_MATCH
    snapshot = read(DECISION)["definitionEnvironmentSnapshot"]
    assert snapshot["hiddenCanonicalRootInjection"] is False


def test_scope_order_deterministically_reconstructs_definition_ids():
    scopes = [
        {"path": [], "parent": None, "definitions": ["a : b", "b : c"]},
        {"path": [0], "parent": [], "definitions": ["a : child"]},
    ]
    left = reconstruct_scopes(scopes)
    right = reconstruct_scopes(scopes)

    left_root = open_definition(target("a"), left[()])
    left_child = open_definition(target("a"), left[(0,)])
    right_root = open_definition(target("a"), right[()])
    right_child = open_definition(target("a"), right[(0,)])

    assert left_root.definition_id == right_root.definition_id
    assert left_child.definition_id == right_child.definition_id
    assert left_root.definition_id != left_child.definition_id
    assert left_root.definition_id is not None and left_root.definition_id.scope_path == ()
    assert left_child.definition_id is not None and left_child.definition_id.scope_path == (0,)


def test_self_and_mutual_definitions_remain_one_step_and_finite():
    environment = DefinitionEnvironment()
    for source in ("a : a", "b : c", "c : b"):
        assert environment.register(definition(source)).kind is DefinitionRegistrationKind.REGISTERED

    self_result = open_definition(target("a"), environment)
    b_result = open_definition(target("b"), environment)
    c_result = open_definition(target("c"), environment)
    assert self_result.body is not None and format_expression(self_result.body) == "a"
    assert b_result.body is not None and format_expression(b_result.body) == "c"
    assert c_result.body is not None and format_expression(c_result.body) == "b"

    cycle = read(DECISION)["cycleBoundary"]
    assert cycle["openingIsOneStep"] is True
    assert cycle["futureMultiStepTraversalMustTrackDefinitionId"] is True


def test_environment_is_replay_substrate_not_hidden_theorem_premise():
    boundary = read(DECISION)["environmentBoundary"]
    assert boundary["environmentSnapshotIsTheoremPremise"] is False
    assert boundary["environmentSnapshotRole"] == "explicit immutable replay substrate"
    assert boundary["ContextFrameOnlyForInterpretGoal"] is True
    assert boundary["MemoryViewOnlyForInterpretGoal"] is True
    assert boundary["DefinitionEnvironmentOnlyForOpeningGoal"] is True
    assert boundary["implicitGlobalStateAllowed"] is False


def test_next_gate_is_challenge_not_production_checker_change():
    gate = read(DECISION)["nextGate"]
    assert gate["artifact"] == "mts-proof-judgment-challenge/v0.3"
    assert gate["status"] == "candidate-challenge"
    assert gate["mustNotChangeProductionProofSemantics"] is True
    assert "forged expected opening body is rejected by independent replay" in gate["requiredVectors"]
    assert "checker does not inject hidden root definitions" in gate["requiredVectors"]
