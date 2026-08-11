"""Acceptance checks for the additive MTS v0.3 machine-contract umbrella."""

import json
from pathlib import Path


ROOT = Path(__file__).parents[1]
V02 = ROOT / "contracts" / "mts-contract-v0.2.json"
V02_CONFORMANCE = ROOT / "contracts" / "mts-conformance-v0.2.json"
V03 = ROOT / "contracts" / "mts-contract-v0.3.json"
V03_CONFORMANCE = ROOT / "contracts" / "mts-conformance-v0.3.json"
OPENING = ROOT / "contracts" / "mts-definition-opening-v0.3.json"
OPENING_CONFORMANCE = ROOT / "contracts" / "mts-definition-opening-conformance-v0.3.json"
PROOF_V02 = ROOT / "contracts" / "mts-proof-v0.2.json"
ROOT_PROGRAM = ROOT / "tests" / "mtc_formulas.mtc"


def read(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def all_strings(value: object) -> list[str]:
    result: list[str] = []
    if isinstance(value, str):
        result.append(value)
    elif isinstance(value, dict):
        for key, item in value.items():
            result.extend(all_strings(key))
            result.extend(all_strings(item))
    elif isinstance(value, list):
        for item in value:
            result.extend(all_strings(item))
    return result


def test_v03_is_additive_accepted_umbrella_over_unmodified_v02_contract():
    v02 = read(V02)
    v03 = read(V03)

    assert v02["schema"] == "mts-contract/v0.2"
    assert v02["status"] == "accepted"
    assert v03["schema"] == "mts-contract/v0.3"
    assert v03["status"] == "accepted"
    assert v03["accepted"] is True
    assert v03["dependsOn"] == [v02["schema"], "mts-definition-opening/v0.3"]
    assert v03["extends"] == v02["schema"]
    assert v03["baseContract"] == "contracts/mts-contract-v0.2.json"
    assert v03["versionBoundaries"] == {
        "v02ModifiedInPlace": False,
        "v02ConformanceReplaced": False,
        "v03ConformanceComposesV02": True,
        "compatibilitySemanticLayerAllowed": False,
    }


def test_v03_conformance_composes_base_and_accepted_definition_opening_corpora():
    v02_corpus = read(V02_CONFORMANCE)
    opening_corpus = read(OPENING_CONFORMANCE)
    v03_corpus = read(V03_CONFORMANCE)

    assert v02_corpus["status"] == "accepted"
    assert opening_corpus["status"] == "accepted"
    assert opening_corpus["accepted"] is True
    assert opening_corpus["contract"] == "mts-definition-opening/v0.3"
    assert v03_corpus["schema"] == "mts-conformance/v0.3"
    assert v03_corpus["contract"] == "mts-contract/v0.3"
    assert v03_corpus["status"] == "accepted"

    required = {item["role"]: item for item in v03_corpus["requiredCorpora"]}
    assert set(required) == {"base-v0.2", "definition-opening-v0.3"}
    assert required["base-v0.2"]["schema"] == v02_corpus["schema"]
    assert required["base-v0.2"]["contract"] == v02_corpus["contract"]
    assert required["definition-opening-v0.3"]["schema"] == opening_corpus["schema"]
    assert required["definition-opening-v0.3"]["contract"] == opening_corpus["contract"]
    assert v03_corpus["releaseAssertions"]["allRequiredCorporaMustPass"] is True
    assert v03_corpus["releaseAssertions"]["baseV02VectorsRemainAuthoritative"] is True


def test_v03_adds_only_the_production_conformant_one_step_opening_operation():
    v03 = read(V03)
    opening = read(OPENING)
    extension = v03["formalNotationExtensions"]["definitionOpening"]

    assert opening["status"] == "accepted"
    assert opening["integrationStatus"] == {
        "semanticContractAccepted": True,
        "productionReferenceCoreImplemented": True,
        "canonicalRootLibraryUsesDefinitionEnvironment": True,
        "productionConformancePresent": True,
    }

    assert extension["contract"] == "contracts/mts-definition-opening-v0.3.json"
    assert extension["conformanceCorpus"] == opening["conformanceCorpus"]
    assert extension["referenceCore"] == "core/mtc_definitions.py"
    assert extension["operation"] == "open_definition"
    assert extension["effect"] == "none"
    assert extension["oneStep"] is True
    assert extension["evaluatesBody"] is False
    assert extension["definitionIsEquality"] is False
    assert extension["openingIsInterpretation"] is False
    assert extension["openingIsProofStep"] is False
    assert extension["readsL4"] is False
    assert extension["writesL4"] is False


def test_v03_does_not_promote_relative_or_persistent_backend_candidates():
    v03 = read(V03)
    strings = all_strings(v03)

    assert v03["l3Status"]["relative"] == "still RAW in production"
    assert v03["l3Status"]["relativeV03ResearchAccepted"] is False
    assert v03["l3Status"]["relativeCandidateArtifactsAreNormativeDependencies"] is False
    assert v03["l4Status"]["persistentBackendContractAccepted"] is False
    assert v03["l4Status"]["backendCandidateArtifactsAreNormativeDependencies"] is False
    assert v03["l4Status"]["PMMIsCanonicalDependency"] is False

    assert not any("anum-relative-context-decision/v0.3" in item for item in strings)
    assert not any("anum-relative-carrier-path-challenge/v0.3" in item for item in strings)
    assert not any("mts-l4-backend" in item for item in strings)


def test_v03_keeps_l5_trusted_boundary_interpret_only():
    v03 = read(V03)
    proof = read(PROOF_V02)
    l5 = v03["l5Boundary"]

    assert proof["schema"] == "mts-proof/v0.2"
    assert proof["checker"]["trustedRuleSet"] == ["interpret"]
    assert l5["currentProofContract"] == "contracts/mts-proof-v0.2.json"
    assert l5["currentTrustedRuleSet"] == ["interpret"]
    assert l5["definitionOpeningTrustedRuleAccepted"] is False
    assert l5["proofJudgmentV03Accepted"] is False
    assert l5["nextIssue"] == 122
    assert l5["searchRemainsUntrusted"] is True
    assert l5["checkerRemainsTrusted"] is True
    assert v03["downstream"]["aproverProofRepinAllowed"] is False


def test_v03_preserves_exact_ten_definition_root_program():
    v03 = read(V03)
    definitions = [
        line.strip()
        for line in ROOT_PROGRAM.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    ]

    assert v03["rootProgram"] == "tests/mtc_formulas.mtc"
    assert v03["rootDefinitionCount"] == 10
    assert len(definitions) == 10
    assert definitions[-1] == "(!=) : ¬(=)"


def test_v03_next_gate_is_non_normative_l5_judgment_challenge():
    v03 = read(V03)
    gate = v03["nextGate"]

    assert gate["issue"] == 122
    assert gate["artifactClass"] == "non-normative proof-judgment/calculus challenge"
    assert gate["mustKeepMtsProofV02Unchanged"] is True
    assert gate["mustNotTreatSuccessfulOpeningAsEquality"] is True
    assert gate["mustNotAddTrustedRuleWithoutExecutableEvidence"] is True
