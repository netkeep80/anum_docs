"""Executable checks for the non-normative DefinitionOpeningPath decision v0.4."""

import json
from pathlib import Path

from core.mtc_ast import Form, format_expression, structural_key
from core.mtc_definitions import DefinitionEnvironment, DefinitionLookupKind, open_definition
from core.mtc_parser import parse_formula


ROOT = Path(__file__).parents[1]
DECISION = ROOT / "contracts" / "mts-opening-path-decision-v0.4.json"
CHALLENGE = ROOT / "contracts" / "mts-opening-path-challenge-v0.4.json"
CORPUS = ROOT / "contracts" / "mts-opening-path-conformance-candidate-v0.4.json"
PROOF_V03 = ROOT / "contracts" / "mts-proof-v0.3.json"
ROOT_PROGRAM = ROOT / "tests" / "mtc_formulas.mtc"


def read(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def root_sources() -> tuple[str, ...]:
    return tuple(
        line.strip()
        for line in ROOT_PROGRAM.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    )


def test_decision_is_non_normative_and_depends_on_green_challenge():
    decision = read(DECISION)
    challenge = read(CHALLENGE)

    assert decision["schema"] == "mts-opening-path-decision/v0.4"
    assert decision["status"] == "candidate-decision"
    assert decision["acceptedContractLinkAllowed"] is False
    assert decision["productionProofChangeAllowed"] is False
    assert decision["trustedRuleChangeAllowed"] is False
    assert challenge["schema"] in decision["dependsOn"]
    assert decision["schema"] not in PROOF_V03.read_text(encoding="utf-8")


def test_operational_composite_certificate_is_the_only_preferred_model():
    models = {item["id"]: item for item in read(DECISION)["models"]}

    assert models["A"]["verdict"] == "reject"
    assert models["B"]["verdict"] == "reject"
    assert models["C"]["verdict"] == "preferred-candidate"
    assert models["D"]["verdict"] == "reject"
    assert all(item["accepted"] is False for item in models.values())

    candidate = read(DECISION)["preferredCandidate"]
    assert candidate["classification"] == "operational-composite-certificate"
    assert candidate["minimumEdges"] == 1
    assert candidate["replayExactSerializedEdgeCount"] is True
    assert candidate["autoContinueToNormalForm"] is False


def test_decision_rejects_equality_and_generic_logic_imports():
    decision = read(DECISION)
    candidate = decision["preferredCandidate"]

    assert candidate["impliesEquality"] is False
    assert candidate["impliesEquivalence"] is False
    assert candidate["impliesNormalization"] is False
    assert candidate["impliesContextualSatisfaction"] is False

    rejected = set(decision["stillRejected"])
    for item in (
        "opening path implies equality",
        "unrestricted transitivity",
        "symmetry",
        "congruence",
        "modus ponens",
        "global substitution",
        "general proof-DAG dependency semantics",
    ):
        assert item in rejected


def test_proof_v04_artifact_choice_is_self_contained_not_judgment_index_graph():
    artifact = read(DECISION)["artifactDecision"]

    assert artifact["proofV04Representation"] == "self-contained path substrate"
    assert artifact["referencesPriorJudgmentIndexes"] is False
    assert artifact["storesSharedScopesOnce"] is True
    assert artifact["storesSharedLookupScopeOnce"] is True
    assert artifact["storesStartTargetOnce"] is True
    assert artifact["storesOrderedEdges"] is True
    assert artifact["storesFinalBody"] is True


def test_edge_transport_keeps_target_identity_structural_but_body_canonical():
    edge = read(DECISION)["edgeDecision"]
    vector = next(
        item
        for item in read(CORPUS)["validPaths"]
        if item["id"] == "structural-adjacency-whitespace"
    )

    first_body = parse_formula(vector["edges"][0]["body"])
    second_target = parse_formula(vector["edges"][1]["target"])
    assert structural_key(first_body) == structural_key(second_target)
    assert format_expression(second_target) == "(b)"
    assert vector["edges"][1]["target"] != format_expression(second_target)

    assert "structural" in edge["targetIdentity"]
    assert "canonical format_expression" in edge["bodyTransport"]
    assert edge["trustSerializedBodyWithoutReplay"] is False
    assert edge["trustSerializedDefinitionIdWithoutReplay"] is False


def test_cycle_repetition_is_canonicality_not_semantic_cycle_rejection():
    cycle = read(DECISION)["cycleDecision"]
    corpus = read(CORPUS)
    valid = {item["id"]: item for item in corpus["validPaths"]}
    invalid = {item["id"]: item for item in corpus["invalidPaths"]}

    assert cycle["definitionIdMayAppearAtMostOnce"] is True
    assert cycle["status"] == "candidate-normative-canonicality"
    assert cycle["repeatedDefinitionIdMeansSemanticFalse"] is False
    assert len(valid["self-cycle-one-edge"]["edges"]) == 1
    assert len(valid["mutual-cycle-two-edges"]["edges"]) == 2
    assert len(invalid["repeated-definition-id"]["edges"]) == 3


def test_terminal_non_form_and_non_addressable_form_are_allowed_only_as_terminals():
    decision = read(DECISION)
    terminal = decision["terminalDecision"]
    corpus = read(CORPUS)
    valid = {item["id"]: item for item in corpus["validPaths"]}
    invalid = {item["id"]: item for item in corpus["invalidPaths"]}

    non_form = valid["ends-in-non-form-judgment"]
    assert not isinstance(parse_formula(non_form["finalBody"]), Form)
    assert terminal["nonFormFinalBodyAllowed"] is True

    assert valid["ends-in-constraint-bundle"]["finalBody"] == "{◁ = x, ▷ = y}"
    assert terminal["nonAddressableFormFinalBodyAllowed"] is True
    assert invalid["continue-after-non-addressable-form"]["edges"][1]["target"] == "{ ◁ = x }"

    assert terminal["continuationRequiresPreviousBodyIsForm"] is True
    assert terminal["continuationStillRequiresCanonicalOpenDefinitionMatch"] is True
    assert terminal["terminalBodyAutomaticallyEvaluated"] is False


def test_future_proof_relation_must_replay_certificate_and_not_search_trace():
    lifting = read(DECISION)["proofLiftingDecision"]
    search = read(DECISION)["searchBoundary"]
    proof = read(PROOF_V03)

    assert lifting["eligibleForFutureTrustedRelation"] is True
    assert lifting["futureRelationName"] == "DefinitionOpeningPath"
    assert lifting["trustedMeaningMustEqualCertificateReplay"] is True
    assert lifting["proofV03Modified"] is False
    assert lifting["genericCompositionAccepted"] is False
    assert lifting["searchTraceTrusted"] is False
    assert lifting["checkerMustReplayWithoutSearchOrUi"] is True
    assert proof["compositionBoundary"]["genericCompositionAccepted"] is False

    assert search["searchTrusted"] is False
    assert search["searchMayExploreDefinitionGraph"] is True
    assert search["artifactTrustedWithoutReplay"] is False
    assert search["checkerIndependentFromSearch"] is True


def test_opening_path_does_not_implicitly_bridge_to_contextual_satisfaction():
    bridge = read(DECISION)["compositionWithContextualSatisfaction"]

    assert bridge["acceptedHere"] is False
    assert bridge["openingPathImpliesStartTargetSatisfiesFinalBody"] is False
    assert bridge["mustNotUseEqualityBridge"] is True
    assert "separately challenged" in bridge["futureCandidate"]


def test_canonical_opening_primitive_remains_the_trusted_edge_substrate():
    environment = DefinitionEnvironment()
    definition = parse_formula("a : b")
    registration = environment.register(definition)
    assert registration.entry is not None

    target = parse_formula("a")
    assert isinstance(target, Form)
    result = open_definition(target, environment)

    assert result.kind is DefinitionLookupKind.MATCH
    assert result.definition_id == registration.entry.id
    assert result.body is not None
    assert format_expression(result.body) == "b"


def test_next_gate_is_standalone_relation_before_proof_v04():
    gate = read(DECISION)["nextGate"]

    assert gate["artifact"] == "mts-opening-path/v0.4"
    assert gate["mustNotChangeProofV03"] is True
    assert gate["mustNotAddOtherCompositionRules"] is True
    assert "one canonical verifier implementation" in gate["requiredProductionProperties"]
    assert "all challenge valid vectors accepted" in gate["requiredProductionProperties"]
    assert "all challenge invalid vectors rejected" in gate["requiredProductionProperties"]


def test_root_program_remains_exactly_ten_and_unchanged_by_decision():
    before = root_sources()
    assert len(before) == 10
    assert root_sources() == before
