# -*- coding: utf-8 -*-
"""Architecture contract for the canonical active repository surface."""

import hashlib
import re
from pathlib import Path
from urllib.parse import unquote

from core.validate_root import validate_root_library

ROOT = Path(__file__).resolve().parents[1]
ROOT_FIXTURE = ROOT / "tests/mtc_formulas.mtc"
ACTIVE_THEORY = {"Основания МТС.md", "Система аксиом МТС.md"}
ACTIVE_SPECS = {
    "Reference model МТС v0.1.md",
    "Формальная нотация МТС.md",
    "Ачисла и сериализация.md",
    "Протокол абитов ачисел.md",
}
ACTIVE_MARKDOWN = (
    ROOT / "README.md",
    ROOT / "docs/CONTRIBUTING.md",
    *(ROOT / "docs/theory" / name for name in ACTIVE_THEORY),
    *(ROOT / "docs/specs" / name for name in ACTIVE_SPECS),
)
FORBIDDEN_DIRECTORIES = {"archive", "legacy", "old", "deprecated"}
FORBIDDEN_PROTOCOL_FORMULAS = {"[ := ∞♀", "] := ♂∞", "[] := 0", "][ := 1"}
ROOT_FORMULAS_SHA256 = "e47f160e18259ef37f1361be5fa5220fa1c6d83303bac27a278822de460b445b"


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


def test_root_library_validates():
    result = validate_root_library(ROOT_FIXTURE)
    assert result.is_valid, result.messages
