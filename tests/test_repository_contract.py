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
    "Foundation v2 Gate P.md",
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
        assert path.exists()

    v02 = json.loads(MTS_CONTRACT_V02.read_text(encoding="utf-8"))
    c02 = json.loads(MTS_CONFORMANCE_V02.read_text(encoding="utf-8"))
    v03 = json.loads(MTS_CONTRACT_V03.read_text(encoding="utf-8"))
    c03 = json.loads(MTS_CONFORMANCE_V03.read_text(encoding="utf-8"))
    v04 = json.loads(MTS_CONTRACT_V04.read_text(encoding="utf-8"))
    c04 = json.loads(MTS_CONFORMANCE_V04.read_text(encoding="utf-8"))
    v05 = json.loads(MTS_CONTRACT_V05.read_text(encoding="utf-8"))
    c05 = json.loads(MTS_CONFORMANCE_V05.read_text(encoding="utf-8"))

    assert v02["version"] == "0.2"
    assert c02["contractVersion"] == "0.2"
    assert v03["version"] == "0.3"
    assert c03["contractVersion"] == "0.3"
    assert v04["version"] == "0.4"
    assert c04["contractVersion"] == "0.4"
    assert v05["version"] == "0.5"
    assert c05["contractVersion"] == "0.5"

    assert v03["baseContract"] == "mts-contract-v0.2.json"
    assert v04["baseContract"] == "mts-contract-v0.3.json"
    assert v05["baseContract"] == "mts-contract-v0.4.json"


def test_candidate_runtime_fixture_and_reference_paths_are_removed_after_promotion():
    assert all(not (ROOT / path).exists() for path in FORBIDDEN_CANDIDATE_PATHS)


def test_anum_protocol_has_one_active_projection_and_quote_path():
    source = (ROOT / "core/anum_protocol.py").read_text(encoding="utf-8")
    assert "def project_anum(" in source
    assert "def quote_anum(" in source
    assert "def unquote_anum(" in source
    assert "project_root" not in source
    assert "project_quote" not in source


def test_root_library_validates():
    result = validate_root_library(ROOT_FIXTURE)
    assert result.ok
