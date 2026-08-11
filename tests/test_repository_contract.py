# -*- coding: utf-8 -*-
"""Architecture contract for the canonical active repository surface."""

import hashlib
import json
import re
from pathlib import Path
from urllib.parse import unquote

from core.validate_root import validate_root_library

ROOT = Path(__file__).resolve().parents[1]
ROOT_FIXTURE = ROOT / "tests/mtc_formulas.mtc"
MTS_CONTRACT_CURRENT = ROOT / "contracts/mts-contract-v0.5.json"
MTS_CONFORMANCE_CURRENT = ROOT / "contracts/mts-conformance-v0.5.json"
ACTIVE_THEORY = {"Основания МТС.md", "Система аксиом МТС.md"}
ACTIVE_SPECS = {
    "Формальная нотация МТС.md",
    "Ачисла и сериализация.md",
    "Пучки значений МТС v0.2.md",
    "Апамять и управление сетью связей.md",
}
ACTIVE_MARKDOWN = (
    ROOT / "README.md",
    ROOT / "docs/CONTRIBUTING.md",
    *(ROOT / "docs/theory" / name for name in ACTIVE_THEORY),
    *(ROOT / "docs/specs" / name for name in ACTIVE_SPECS),
)
FORBIDDEN_DIRECTORIES = {"archive", "legacy", "old", "deprecated"}
FORBIDDEN_PROTOCOL_FORMULAS = {"[ := ∞♀", "] := ♂∞", "[] := 0", "][ := 1"}
FORBIDDEN_HISTORICAL_MTS_RELEASES = {
    "contracts/mts-contract-v0.2.json",
    "contracts/mts-conformance-v0.2.json",
    "contracts/mts-contract-v0.3.json",
    "contracts/mts-conformance-v0.3.json",
    "contracts/mts-contract-v0.4.json",
    "contracts/mts-conformance-v0.4.json",
    "contracts/mts-proof-v0.2.json",
    "contracts/mts-proof-v0.3.json",
    "contracts/mts-proof-conformance-v0.3.json",
    "docs/specs/Reference model МТС v0.2.md",
}
FORBIDDEN_CANDIDATE_PATHS = {
    "core/context_interpreter_candidate.py",
    "tests/fixtures/mtc_root_v02_candidate.mtc",
    "tests/fixtures/mts_contract_v02_candidate.json",
    "tests/test_context_interpreter_candidate.py",
    "tests/test_mts_contract_v02_candidate.py",
    "tests/test_root_v02_candidate.py",
    "tests/test_root_v02_execution_candidate.py",
    "docs/specs/Reference model МТС v0.1.md",
    "docs/research/Foundation v2 P9 integrated proof conformance.md",
    "contracts/anum-boundary-conformance-candidate-v0.6.json",
    "contracts/mts-opening-path-challenge-v0.4.json",
    "contracts/mts-opening-path-decision-v0.4.json",
    "contracts/mts-opening-path-conformance-candidate-v0.4.json",
    "contracts/mts-proof-opening-path-challenge-v0.4.json",
    "contracts/mts-proof-v0.4-conformance-candidate.json",
    "tests/test_mts_opening_path_challenge.py",
    "tests/test_mts_opening_path_decision.py",
    "tests/test_mts_proof_v04_opening_path_challenge.py",
    "contracts/mts-definition-resolution-challenge-v0.3.json",
    "contracts/mts-definition-environment-decision-v0.3.json",
    "contracts/mts-definition-environment-challenge-v0.3.json",
    "contracts/mts-definition-opening-decision-v0.3.json",
    "contracts/mts-definition-opening-challenge-v0.3.json",
    "tests/test_mts_definition_resolution_challenge.py",
    "tests/test_mts_definition_environment_decision.py",
    "tests/test_mts_definition_environment_challenge.py",
    "tests/test_mts_definition_opening_decision.py",
    "tests/test_mts_definition_opening_challenge.py",
    "contracts/mts-deictic-context-challenge-v0.5.json",
    "contracts/mts-context-dependency-challenge-v0.5.json",
    "contracts/mts-context-dependency-decision-v0.5.json",
    "contracts/mts-direct-deixis-challenge-v0.5.json",
    "contracts/mts-direct-deixis-conformance-candidate-v0.5.json",
    "tests/test_mts_deictic_context_challenge.py",
    "tests/test_mts_context_dependency_challenge.py",
    "tests/test_mts_context_dependency_decision.py",
    "tests/test_mts_direct_deixis_challenge.py",
    "contracts/mts-bundle-challenge-v0.2.json",
    "contracts/mts-bundle-decision-v0.2.json",
    "contracts/mts-bundle-elaboration-challenge-v0.2.json",
    "contracts/mts-bundle-algebra-challenge-v0.2.json",
    "contracts/mts-bundle-expansion-challenge-v0.2.json",
    "tests/test_mts_bundle_challenge.py",
    "tests/test_mts_bundle_decision.py",
    "tests/test_mts_bundle_elaboration_challenge.py",
    "tests/test_mts_bundle_algebra_challenge.py",
    "tests/test_mts_bundle_expansion_challenge.py",
    "tests/test_mts_value_bundle_candidate_contract.py",
    "contracts/mts-proof-domain-decision-v0.3.json",
    "contracts/mts-proof-lifting-challenge-v0.3.json",
    "contracts/mts-proof-lifting-conformance-v0.3.json",
    "contracts/mts-proof-judgment-challenge-v0.3.json",
    "contracts/mts-proof-judgment-decision-v0.3.json",
    "contracts/mts-proof-judgment-conformance-v0.3.json",
    "tests/test_mts_proof_domain_decision.py",
    "tests/test_mts_proof_lifting_challenge.py",
    "tests/test_mts_proof_judgment_challenge.py",
    "tests/test_mts_proof_judgment_decision.py",
}
ROOT_FORMULAS_SHA256 = "1ccfb6fa0ae3c744dffcdefefcf2d5d96108573f4b04fdd8ac45a2e15a98ee3a"


def root_formula_text() -> str:
    lines = (
        line.strip()
        for line in ROOT_FIXTURE.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    )
    return "\n".join(lines) + "\n"


def test_active_document_sets_are_exact():
    assert {path.name for path in (ROOT / "docs/theory").glob("*.md")} == ACTIVE_THEORY
    assert {path.name for path in (ROOT / "docs/specs").glob("*.md")} == ACTIVE_SPECS


def test_forbidden_archive_directories_do_not_exist():
    forbidden = [
        path.relative_to(ROOT)
        for path in ROOT.rglob("*")
        if path.is_dir() and path.name.lower() in FORBIDDEN_DIRECTORIES
    ]
    assert forbidden == []


def test_active_markdown_links_exist():
    missing = []
    for document in ACTIVE_MARKDOWN:
        text = document.read_text(encoding="utf-8")
        for raw_target in re.findall(r"\[[^\]]+\]\(([^)]+)\)", text):
            target = raw_target.strip().strip("<>").split("#", 1)[0]
            if not target or target.startswith(("http://", "https://", "mailto:")):
                continue
            if not (document.parent / unquote(target)).exists():
                missing.append(f"{document.relative_to(ROOT)} -> {target}")
    assert missing == []


def test_illustrations_are_preserved():
    pictures = ROOT / "pics"
    assert pictures.is_dir()
    assert any(path.is_file() for path in pictures.iterdir())


def test_root_fixture_is_exact_and_excludes_protocol_hypotheses():
    formula_text = root_formula_text()
    assert hashlib.sha256(formula_text.encode("utf-8")).hexdigest() == ROOT_FORMULAS_SHA256
    assert all(formula not in formula_text for formula in FORBIDDEN_PROTOCOL_FORMULAS)
    assert len([line for line in formula_text.splitlines() if line]) == 10


def test_current_machine_manifest_is_single_self_contained_v05_surface():
    assert MTS_CONTRACT_CURRENT.is_file()
    assert MTS_CONFORMANCE_CURRENT.is_file()

    contract = json.loads(MTS_CONTRACT_CURRENT.read_text(encoding="utf-8"))
    conformance = json.loads(MTS_CONFORMANCE_CURRENT.read_text(encoding="utf-8"))

    assert contract["schema"] == "mts-contract/v0.5"
    assert contract["status"] == "accepted"
    assert contract["accepted"] is True
    assert "extends" not in contract
    assert "baseContract" not in contract
    assert not any(item.startswith("mts-contract/v0.") for item in contract["dependsOn"])
    assert contract["conformanceCorpus"] == "contracts/mts-conformance-v0.5.json"

    assert conformance["schema"] == "mts-conformance/v0.5"
    assert conformance["status"] == "accepted"
    assert conformance["accepted"] is True
    assert conformance["contract"] == contract["schema"]
    assert "legacyCoreRegressionCorpus" not in conformance
    assert "legacyCoreRegressionNormative" not in conformance

    required = conformance["requiredAcceptedSurfaces"]
    assert [item["schema"] for item in required] == contract["dependsOn"]
    assert all((ROOT / item["contractPath"]).is_file() for item in required)


def test_historical_mts_release_chain_is_physically_absent():
    leftovers = sorted(path for path in FORBIDDEN_HISTORICAL_MTS_RELEASES if (ROOT / path).exists())
    assert leftovers == []


def test_current_manifest_does_not_restore_superseded_anum_or_occurrence_link_identity():
    contract = json.loads(MTS_CONTRACT_CURRENT.read_text(encoding="utf-8"))
    serialized = json.dumps(contract, ensure_ascii=False)

    assert contract["semanticIdentity"]["linkIdentity"] == "by ordered semantic poles"
    assert contract["semanticIdentity"]["runtimeHandleIsSemanticIdentity"] is False
    assert contract["semanticIdentity"]["samePairCreatesSecondSemanticLink"] is False
    assert contract["anum"]["schema"] == "anum-stream-deserialization/v0.3"
    assert contract["anum"]["emptyStream"] == "R"
    assert contract["anum"]["emptyGroup"] == "R"
    assert contract["anum"]["rootIsFifthAbit"] is False
    for forbidden in (
        "anum-raw-carrier-v0.2",
        "anum-boundary-projection-v0.2",
        "anum-denotation-v0.2",
        "anum-pair-denotation-v0.2",
        "anum-recursive-denotation-v0.2",
    ):
        assert forbidden not in serialized


def test_candidate_runtime_fixture_and_reference_paths_are_removed_after_promotion():
    leftovers = [path for path in FORBIDDEN_CANDIDATE_PATHS if (ROOT / path).exists()]
    assert leftovers == []
    assert (ROOT / "core/mtc_interpreter.py").is_file()
    assert (ROOT / "core/mtc_value_bundle.py").is_file()
    assert (ROOT / "core/mtc_definitions.py").is_file()
    assert (ROOT / "tests/test_mtc_interpreter.py").is_file()


def test_anum_protocol_has_one_active_projection_and_quote_path():
    assert not (ROOT / "core/anum_projector.py").exists()

    memory_text = (ROOT / "core/anum_memory.py").read_text(encoding="utf-8")
    cli_text = (ROOT / "converters/anum_cli.py").read_text(encoding="utf-8")

    assert "class Quote" not in memory_text
    assert '"realize"' not in cli_text
    assert (ROOT / "core/anum_protocol.py").is_file()


def test_root_library_validates():
    result = validate_root_library(ROOT_FIXTURE)
    assert result.is_valid, result.messages
