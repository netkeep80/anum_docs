"""Decision evidence for DefinitionEnvironment v0.3 using the canonical core."""

import json
from pathlib import Path

from core.mtc_ast import Definition, SourceSpan, Symbol, structural_key
from core.mtc_definitions import (
    DefinitionEnvironment,
    DefinitionLookupKind,
    DefinitionRegistrationKind,
)
from core.mtc_interpreter import ContextFrame
from core.mtc_parser import parse_formula
from core.root_library import load_root_library


ROOT = Path(__file__).parents[1]
DECISION = ROOT / "contracts" / "mts-definition-environment-decision-v0.3.json"
CHALLENGE = ROOT / "contracts" / "mts-definition-resolution-challenge-v0.3.json"
MTS_CONTRACT = ROOT / "contracts" / "mts-contract-v0.2.json"
MTS_PROOF = ROOT / "contracts" / "mts-proof-v0.2.json"
ROOT_PROGRAM = ROOT / "tests" / "mtc_formulas.mtc"


def decision() -> dict:
    return json.loads(DECISION.read_text(encoding="utf-8"))


def definition(source: str) -> Definition:
    value = parse_formula(source)
    assert isinstance(value, Definition)
    return value


def test_decision_remains_historical_non_normative_evidence():
    data = decision()
    challenge = json.loads(CHALLENGE.read_text(encoding="utf-8"))
    mts_contract_text = MTS_CONTRACT.read_text(encoding="utf-8")
    mts_proof_text = MTS_PROOF.read_text(encoding="utf-8")

    assert data["schema"] == "mts-definition-environment-decision/v0.3"
    assert data["status"] == "candidate-decision"
    assert data["dependsOn"] == ["mts-contract/v0.2", challenge["schema"]]
    assert data["acceptedContractLinkAllowed"] is False
    assert data["productionInterpreterChangeAllowed"] is False
    assert "mts-definition-environment-decision" not in mts_contract_text
    assert "mts-definition-environment-decision" not in mts_proof_text


def test_only_scoped_introduction_identity_was_selected_by_the_decision():
    models = {model["id"]: model for model in decision()["identityModels"]}

    assert set(models) == {"A", "B", "C", "D", "E"}
    assert models["A"]["verdict"] == "reject"
    assert models["B"]["verdict"] == "reject"
    assert models["C"]["verdict"] == "reject-as-identity-keep-as-lookup-key"
    assert models["D"]["verdict"] == "reject-for-L2-environment"
    assert models["E"]["verdict"] == "preferred-candidate"
    assert all(model["accepted"] is False for model in models.values())

    selected = models["E"]
    assert selected["definitionId"]["shape"] == "DefinitionId(scopeId, ordinal)"
    assert selected["definitionId"]["persistentStorageIdentity"] is False
    assert selected["targetKey"]["role"] == "lookup discriminant only"
    assert selected["targetKey"]["semanticEquality"] is False
    assert selected["provenance"]["participatesInDefinitionIdentity"] is False


def test_canonical_root_environment_now_realizes_the_selected_identity_model():
    library = load_root_library(ROOT_PROGRAM)
    entries = library.definitions.entries()

    assert len(entries) == 10
    assert library.definitions.conflicts() == ()
    assert len({entry.identity for entry in entries}) == 10
    assert [entry.identity.ordinal for entry in entries] == list(range(10))
    assert all(entry.identity.scope_path == () for entry in entries)


def test_target_structure_is_lookup_discriminant_not_introduction_identity():
    left = Symbol("a", SourceSpan(0, 1))
    same_shape_different_span = Symbol("a", SourceSpan(100, 101))
    assert structural_key(left) == structural_key(same_shape_different_span)

    root = DefinitionEnvironment()
    child = root.child(0)
    root_registration = root.register(definition("a : b"))
    child_registration = child.register(definition("a : c"))
    assert root_registration.entry is not None
    assert child_registration.entry is not None

    assert root_registration.entry.target_key == child_registration.entry.target_key
    assert root_registration.entry.identity != child_registration.entry.identity
    assert root.lookup(same_shape_different_span).entry == root_registration.entry
    assert child.lookup(same_shape_different_span).entry == child_registration.entry


def test_same_scope_duplicate_is_conflict_and_child_shadowing_is_explicit():
    root = DefinitionEnvironment()
    first = root.register(definition("a : b"))
    duplicate = root.register(definition("a : c"))
    assert first.kind is DefinitionRegistrationKind.REGISTERED
    assert duplicate.kind is DefinitionRegistrationKind.CONFLICT
    assert root.lookup(definition("a : z").target).kind is DefinitionLookupKind.CONFLICT

    clean_root = DefinitionEnvironment()
    root_a = clean_root.register(definition("a : rootValue"))
    root_b = clean_root.register(definition("b : rootB"))
    child = clean_root.child(7)
    child_a = child.register(definition("a : childValue"))
    assert root_a.entry is not None and root_b.entry is not None and child_a.entry is not None
    assert child.lookup(definition("a : ignored").target).entry == child_a.entry
    assert child.lookup(definition("b : ignored").target).entry == root_b.entry
    assert child_a.entry.identity.scope_path == (7,)
    assert root_a.entry.identity.scope_path == ()


def test_contextframe_is_not_definition_scope_or_lookup_input():
    root = DefinitionEnvironment()
    registration = root.register(definition("a : b"))
    assert registration.entry is not None
    child = root.child(1)
    target = definition("a : ignored").target

    frames = [
        ContextFrame(start=1, end=2),
        ContextFrame(start=100, end=200, parent=ContextFrame(start=10, end=20)),
    ]
    for _frame in frames:
        assert child.lookup(target).entry == registration.entry

    assert decision()["contextModel"]["definitionLookupDependsOnContextFrame"] is False
    assert decision()["scopeModel"]["contextFrameIsDefinitionScope"] is False


def test_decision_boundary_still_forbids_equality_proof_or_l4_effects():
    result = decision()["resolutionResultCandidate"]
    vetoes = set(decision()["negativeVetoes"])

    assert result["returnsEquality"] is False
    assert result["returnsProofArtifact"] is False
    assert result["mutatesMemory"] is False
    assert result["rewritesCallerAst"] is False
    assert "successful lookup implies A = F" in vetoes
    assert "successful lookup rewrites all A occurrences" in vetoes
    assert "definition lookup realizes missing L4 links" in vetoes
