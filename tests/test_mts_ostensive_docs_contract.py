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
CURRENT_IDENTITY_DOCS = (README, FOUNDATIONS, AXIOMS, NOTATION, ANUM, APAMEMORY)
RUSSIAN_NORMATIVE_DOCS = CURRENT_IDENTITY_DOCS + (BUNDLES,)
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
    machine = text.index("## 3. Машинное представление вторично")
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


def test_root_five_link_genealogy_and_four_abit_transport_are_visible() -> None:
    required_links = (
        "R = ∞",
        "R = R ⟼ R",
        "O = O ⟼ R",
        "C = R ⟼ C",
        "L = O ⟼ C",
        "U = C ⟼ O",
    )
    required_dictionary = ("[ → O", "] → C", "1 → L", "0 → U")
    for path in (README, FOUNDATIONS, AXIOMS):
        text = _text(path)
        for fragment in required_links + required_dictionary:
            assert fragment in text, (path, fragment)
        assert "[ ] 1 0" in text, path


def test_root_is_not_a_fifth_abit_and_empty_group_is_root() -> None:
    for path in (README, FOUNDATIONS, ANUM):
        text = _text(path)
        assert "не является пятым абитом" in text, path
    assert "des(\"[]\") = R" in _text(ANUM)
    assert "Пустая группа `[]` **не является ошибкой**" in _text(ANUM)
    assert "des([]) = R" in _text(README)


def test_link_identity_is_by_ordered_poles_everywhere_current() -> None:
    axiom = "(A ⟼ B) = (C ⟼ D)"
    conclusion = "P1 = P2"
    for path in CURRENT_IDENTITY_DOCS:
        text = _text(path)
        assert axiom in text, path
        assert conclusion in text or "однозначна по (A,B)" in text, path


def test_current_docs_do_not_restore_same_pair_occurrence_multiplicity() -> None:
    forbidden = (
        "P1 ≠ P2",
        "одинаковая пара ≠ одно вхождение",
        "одинаковая форма ≠ тождество",
        "повторная материализация создаёт ещё одно вхождение",
    )
    for path in CURRENT_IDENTITY_DOCS:
        text = _text(path)
        for fragment in forbidden:
            assert fragment not in text, (path, fragment)


def test_repetition_and_history_are_structural_not_hidden_identity() -> None:
    readme = _text(README)
    anum = _text(ANUM)
    apamemory = _text(APAMEMORY)
    assert "[L, L, L, U]" in readme
    assert "[L, L, L, U]" in anum
    assert "Позиционная множественность хранится последовательностью" in anum
    assert "разные акты получения одной связи" in apamemory
    assert "разные экземпляры самой связи" in apamemory


def test_find_materialize_boundary_survives_identity_reset() -> None:
    for path in (README, AXIOMS, ANUM, APAMEMORY):
        text = _text(path)
        assert "не найдено" in text.lower(), path
        assert "materializ" in text.lower() or "материализац" in text.lower(), path
    assert "find ≠ materialize" in _text(README)
    assert "find ≠ materialize" in _text(ANUM)


def test_historical_projection_spelling_is_explicitly_separate() -> None:
    axioms = _text(AXIOMS)
    notation = _text(NOTATION)
    foundations = _text(FOUNDATIONS)
    assert "♀F / F♂" in axioms
    assert "♀F" in notation and "F♂" in notation
    assert "историческ" in notation.lower()
    assert "историческ" in foundations.lower()
    assert "♂e = S = S ⟼ e" in notation
    assert "b♀ = E = b ⟼ E" in notation


def test_self_closure_glyphs_are_not_projection_opcodes() -> None:
    assert "не являются командами взять начало или конец" in _text(README)
    assert "не являются встроенными командами получения полюсов" in _text(NOTATION)
    assert "не являются командами получения полюсов" in _text(FOUNDATIONS)


def test_nonlink_is_meaning_carried_by_links_not_second_ontology() -> None:
    foundations = _text(FOUNDATIONS)
    assert "1 → L = O ⟼ C" in foundations
    assert "0 → U = C ⟼ O" in foundations
    assert "не вводится как отдельный вид существующего" in foundations
    assert "не является буквальным отсутствием связи" in foundations
    assert "командой удаления" in foundations


def test_readme_defines_core_associative_terms_without_new_ontology() -> None:
    text = _text(README)
    required = (
        "Приставка **«а-»**",
        "**Асеть**",
        "**Акорень**",
        "**Абит**",
        "**Ачисло**",
        "**Четверичное ачисло**",
        "**Апамять**",
    )
    for fragment in required:
        assert fragment in text, fragment
