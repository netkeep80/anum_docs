from __future__ import annotations

import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
README = ROOT / "README.md"
FOUNDATIONS = ROOT / "docs" / "theory" / "Основания МТС.md"
AXIOMS = ROOT / "docs" / "theory" / "Система аксиом МТС.md"
NOTATION = ROOT / "docs" / "specs" / "Формальная нотация МТС.md"
ANUM = ROOT / "docs" / "specs" / "Ачисла и сериализация.md"
APAMEMORY = ROOT / "docs" / "specs" / "Апамять и управление сетью связей.md"
BUNDLES = ROOT / "docs" / "specs" / "Пучки значений МТС v0.2.md"

ACTIVE_OSTENSIVE_DOCS = (README, FOUNDATIONS, AXIOMS, NOTATION)
RUSSIAN_NORMATIVE_DOCS = (
    README,
    FOUNDATIONS,
    AXIOMS,
    NOTATION,
    ANUM,
    APAMEMORY,
    BUNDLES,
)
_ALLOWED_LATIN_PROSE = {"API", "Git", "GitHub", "JSON", "UTF"}


def _text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _prose_lines(markdown: str):
    in_fence = False
    for line_no, raw_line in enumerate(markdown.splitlines(), start=1):
        if raw_line.strip().startswith("```"):
            in_fence = not in_fence
            continue
        if in_fence:
            continue
        line = re.sub(r"`[^`]*`", "", raw_line)
        line = re.sub(r"\]\([^)]*\)", "]", line)
        line = re.sub(r"https?://\S+", "", line)
        yield line_no, line


def _unapproved_latin_words(line: str) -> list[str]:
    words = re.findall(r"(?<![\w])([A-Za-z][A-Za-z-]{2,})(?![\w])", line)
    return [word for word in words if word not in _ALLOWED_LATIN_PROSE]


def test_normative_docs_are_russian_first() -> None:
    failures = []
    for path in RUSSIAN_NORMATIVE_DOCS:
        for line_no, line in _prose_lines(_text(path)):
            latin = _unapproved_latin_words(line)
            cyrillic = re.findall(r"[А-Яа-яЁё]{3,}", line)
            if len(latin) >= 2 or (latin and not cyrillic):
                failures.append(f"{path.relative_to(ROOT)}:{line_no}: {', '.join(latin)}")
    assert failures == [], "Англоязычный текст в нормативной МТС:\n" + "\n".join(failures)


def test_active_foundation_surface_keeps_ostensive_root_signs() -> None:
    for path in ACTIVE_OSTENSIVE_DOCS:
        text = _text(path)
        assert "∞" in text, path
        assert "♂" in text, path
        assert "♀" in text, path
        assert "остенсив" in text.lower(), path


def test_readme_presents_ostensive_forms_before_machine_link_carrier() -> None:
    text = _text(README)
    ostensive = text.index("## 1. Остенсивный корень МТС")
    machine = text.index("## 3. Машинное представление идёт после остенсивного")
    link_api = text.index("Link(start, end)")
    assert ostensive < machine < link_api
    assert "♂e       начало самозамкнуто, конец e различён" in text
    assert "b♀       начало b различено, конец самозамкнут" in text


def test_foundation_v2_self_closure_orientation_is_exact() -> None:
    for path in ACTIVE_OSTENSIVE_DOCS:
        text = _text(path)
        assert "S = S ⟼ e" in text, path
        assert "E = b ⟼ E" in text, path
    notation = _text(NOTATION)
    assert "♂e = S = S ⟼ e" in notation
    assert "b♀ = E = b ⟼ E" in notation


def test_root_five_link_genealogy_remains_reader_visible() -> None:
    required = (
        "R = ∞",
        "R = R ⟼ R",
        "O = O ⟼ R",
        "C = R ⟼ C",
        "L = O ⟼ C",
        "U = C ⟼ O",
        "∞ → R",
        "[ → O",
        "] → C",
        "1 → L",
        "0 → U",
    )
    for path in (README, FOUNDATIONS, AXIOMS):
        text = _text(path)
        for fragment in required:
            assert fragment in text, (path, fragment)


def test_root_abits_and_formal_self_closure_glyphs_are_not_collapsed() -> None:
    for path in (README, FOUNDATIONS, NOTATION):
        text = _text(path)
        assert "[ ] 1 0" in text, path
        assert "♂" in text and "♀" in text, path
    foundations = _text(FOUNDATIONS)
    assert "корневые абиты ачисел" in foundations
    assert "знаки формальной нотации форм связи" in foundations


def test_historical_projection_spelling_is_explicitly_separate() -> None:
    axioms = _text(AXIOMS)
    notation = _text(NOTATION)
    assert "♀F / F♂" in axioms
    assert "♀F" in notation and "F♂" in notation
    assert "Текущий кандидат основания **не переносит** это чтение" in notation
    assert "♂e = S = S ⟼ e" in notation
    assert "b♀ = E = b ⟼ E" in notation


def test_docs_reject_projection_opcode_reading() -> None:
    foundations = _text(FOUNDATIONS)
    notation = _text(NOTATION)
    assert "не являются командами взять начало или конец" in _text(README)
    assert "не означают сами по себе" in foundations
    assert "не являются встроенными командами получения полюсов" in notation


def test_nonlink_is_a_meaning_carried_by_links_not_a_second_ontology() -> None:
    foundations = _text(FOUNDATIONS)
    anum = _text(ANUM)
    for text in (foundations, anum):
        assert "1 → L = O ⟼ C" in text
        assert "0 → U = C ⟼ O" in text
        assert "0 ≠ DELETE_LINK" in text
    assert "несвязь не вводится как отдельный вид существующего" in foundations
    assert "описание само является связевой структурой, но не тождественно своему денотату" in anum
    assert "описать несвязь ≠ сделать несвязь сущностью" in anum
