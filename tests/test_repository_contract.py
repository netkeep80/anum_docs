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
MTS_CONTRACT_V02 = ROOT / "contracts/mts-contract-v0.2.json"
MTS_CONFORMANCE_V02 = ROOT / "contracts/mts-conformance-v0.2.json"
MTS_CONTRACT_V03 = ROOT / "contracts/mts-contract-v0.3.json"
MTS_CONFORMANCE_V03 = ROOT / "contracts/mts-conformance-v0.3.json"
MTS_CONTRACT_V04 = ROOT / "contracts/mts-contract-v0.4.json"
MTS_CONFORMANCE_V04 = ROOT / "contracts/mts-conformance-v0.4.json"
MTS_CONTRACT_V05 = ROOT / "contracts/mts-contract-v0.5.json"
MTS_CONFORMANCE_V05 = ROOT / "contracts/mts-conformance-v0.5.json"
ACTIVE_THEORY = {"Основания МТС.md", "Система аксиом МТС.md", "Пучки связей МТС.md"}
ACTIVE_SPECS = {
    "Reference model МТС v0.2.md",
    "Формальная нотация МТС.md",
    "Ачисла и сериализация.md",
    "Протокол абитов ачисел.md",
    "Пучки значений МТС v0.2.md",
}
ACTIVE_MARKDOWN = (
    ROOT / "README.md",
    ROOT / "docs/CONTRIBUTING.md",
    *(ROOT / "docs/theory" / name for name in ACTIVE_THEORY),
    *(ROOT / "docs/specs" / name for name in ACTIVE_SPECS),
)
FORBIDDEN_DIRECTORIES = {"archive", "legacy", "old", "deprecated"}
FORBIDDEN_PROTOCOL_FORMULAS = {"[ := ∞♀", "] := ♂∞", "[] := 0", "][ := 1"}
FORBIDDEN_CANDIDATE_PATHS = {
    "core/context_interpreter_candidate.py",
    "tests/fixtures/mtc_root_v02_candidate.mtc",
    "tests/fixtures/mts_contract_v02_candidate.json",
    "tests/test_context_interpreter_candidate.py",
    "tests/test_mts_contract_v02_candidate.py",
    "tests/test_root_v02_candidate.py",
    "tests/test_root_v02_execution_candidate.py",
    "docs/specs/Reference model МТС v0.1.md",
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


def test_versioned_machine_contract_and_conformance_chain_is_exact():
    for path in (
        MTS_CONTRACT_V02,
        MTS_CONFORMANCE_V02,
        MTS_CONTRACT_V03,
        MTS_CONFORMANCE_V03,
        MTS_CONTRACT_V04,
        MTS_CONFORMANCE_V04,
        MTS_CONTRACT_V05,
        MTS_CONFORMANCE_V05,
    ):
        assert path.is_file()

    v02 = json.loads(MTS_CONTRACT_V02.read_text(encoding="utf-8"))
    v02_corpus = json.loads(MTS_CONFORMANCE_V02.read_text(encoding="utf-8"))
    v03 = json.loads(MTS_CONTRACT_V03.read_text(encoding="utf-8"))
    v03_corpus = json.loads(MTS_CONFORMANCE_V03.read_text(encoding="utf-8"))
    v04 = json.loads(MTS_CONTRACT_V04.read_text(encoding="utf-8"))
    v04_corpus = json.loads(MTS_CONFORMANCE_V04.read_text(encoding="utf-8"))
    v05 = json.loads(MTS_CONTRACT_V05.read_text(encoding="utf-8"))
    v05_corpus = json.loads(MTS_CONFORMANCE_V05.read_text(encoding="utf-8"))

    assert v02["schema"] == "mts-contract/v0.2"
    assert v02["status"] == "accepted"
    assert v02["rootProgram"] == "tests/mtc_formulas.mtc"
    assert v02["conformanceCorpus"] == "contracts/mts-conformance-v0.2.json"
    assert v02["formalNotation"]["context"]["atomicPronouns"] is True
    assert v02["formalNotation"]["context"]["bracketOverloading"] is False
    assert v02["formalNotation"]["valueBundle"]["contract"] == "contracts/mts-value-bundle-v0.2.json"
    assert v02_corpus["schema"] == "mts-conformance/v0.2"
    assert v02_corpus["contract"] == v02["schema"]
    assert v02_corpus["status"] == "accepted"

    assert v03["schema"] == "mts-contract/v0.3"
    assert v03["status"] == "accepted"
    assert v03["extends"] == v02["schema"]
    assert v03["baseContract"] == "contracts/mts-contract-v0.2.json"
    assert v03["rootProgram"] == v02["rootProgram"]
    assert v03["conformanceCorpus"] == "contracts/mts-conformance-v0.3.json"
    assert v03_corpus["schema"] == "mts-conformance/v0.3"
    assert v03_corpus["contract"] == v03["schema"]
    assert v03_corpus["status"] == "accepted"

    assert v04["schema"] == "mts-contract/v0.4"
    assert v04["status"] == "accepted"
    assert v04["extends"] == v03["schema"]
    assert v04["baseContract"] == "contracts/mts-contract-v0.3.json"
    assert v04["rootProgram"] == v03["rootProgram"]
    assert v04["conformanceCorpus"] == "contracts/mts-conformance-v0.4.json"
    assert v04["dependsOn"] == [v03["schema"], "mts-proof/v0.3"]
    assert v04_corpus["schema"] == "mts-conformance/v0.4"
    assert v04_corpus["contract"] == v04["schema"]
    assert v04_corpus["status"] == "accepted"
    required_v04 = {item["role"]: item for item in v04_corpus["requiredCorpora"]}
    assert set(required_v04) == {"base-v0.3", "proof-v0.3"}
    assert required_v04["base-v0.3"]["schema"] == v03_corpus["schema"]
    assert required_v04["base-v0.3"]["contract"] == v03_corpus["contract"]
    assert required_v04["proof-v0.3"]["schema"] == "mts-proof-conformance/v0.3"
    assert required_v04["proof-v0.3"]["contract"] == "mts-proof/v0.3"

    assert v05["schema"] == "mts-contract/v0.5"
    assert v05["status"] == "accepted"
    assert v05["extends"] == v04["schema"]
    assert v05["baseContract"] == "contracts/mts-contract-v0.4.json"
    assert v05["rootProgram"] == v04["rootProgram"]
    assert v05["conformanceCorpus"] == "contracts/mts-conformance-v0.5.json"
    assert v05["dependsOn"] == [
        v04["schema"],
        "mts-opening-path/v0.4",
        "mts-proof/v0.4",
        "mts-direct-deixis/v0.5",
    ]
    assert v05_corpus["schema"] == "mts-conformance/v0.5"
    assert v05_corpus["contract"] == v05["schema"]
    assert v05_corpus["status"] == "accepted"
    required_v05 = {item["role"]: item for item in v05_corpus["requiredCorpora"]}
    assert set(required_v05) == {
        "base-v0.4",
        "opening-path-v0.4",
        "proof-v0.4",
        "direct-deixis-v0.5",
    }
    assert required_v05["base-v0.4"]["schema"] == v04_corpus["schema"]
    assert required_v05["base-v0.4"]["contract"] == v04_corpus["contract"]
    assert required_v05["opening-path-v0.4"]["contract"] == "mts-opening-path/v0.4"
    assert required_v05["proof-v0.4"]["contract"] == "mts-proof/v0.4"
    assert required_v05["direct-deixis-v0.5"]["contract"] == "mts-direct-deixis/v0.5"

    contract_files = sorted((ROOT / "contracts").glob("mts-contract-*.json"))
    conformance_files = sorted((ROOT / "contracts").glob("mts-conformance-*.json"))
    assert contract_files == [
        MTS_CONTRACT_V02,
        MTS_CONTRACT_V03,
        MTS_CONTRACT_V04,
        MTS_CONTRACT_V05,
    ]
    assert conformance_files == [
        MTS_CONFORMANCE_V02,
        MTS_CONFORMANCE_V03,
        MTS_CONFORMANCE_V04,
        MTS_CONFORMANCE_V05,
    ]


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
