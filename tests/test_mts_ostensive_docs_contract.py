from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
README = ROOT / "README.md"
FOUNDATIONS = ROOT / "docs" / "theory" / "Основания МТС.md"
AXIOMS = ROOT / "docs" / "theory" / "Система аксиом МТС.md"
NOTATION = ROOT / "docs" / "specs" / "Формальная нотация МТС.md"
GATE_P = ROOT / "docs" / "specs" / "Foundation v2 Gate P.md"

ACTIVE_OSTENSIVE_DOCS = (README, FOUNDATIONS, AXIOMS, NOTATION, GATE_P)


def _text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def test_active_foundation_surface_keeps_ostensive_root_signs() -> None:
    for path in ACTIVE_OSTENSIVE_DOCS:
        text = _text(path)
        assert "∞" in text, path
        assert "♂" in text, path
        assert "♀" in text, path
        assert "остенсив" in text.lower(), path


def test_readme_presents_ostensive_forms_before_machine_link_carrier() -> None:
    text = _text(README)
    ostensive = text.index("# 1. Остенсивный корень МТС")
    machine = text.index("# 3. Машинное представление идёт после остенсивного")
    link_api = text.index("Link(start, end)")

    assert ostensive < machine < link_api
    assert "♂e       начало самозамкнуто, конец e различён" in text
    assert "b♀       начало b различено, конец самозамкнут" in text


def test_foundation_v2_self_closure_orientation_is_exact() -> None:
    for path in (README, FOUNDATIONS, AXIOMS, NOTATION, GATE_P):
        text = _text(path)
        assert "S = S ⟼ e" in text, path
        assert "E = b ⟼ E" in text, path

    notation = _text(NOTATION)
    assert "♂e" in notation
    assert "b♀" in notation
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
    for path in (README, FOUNDATIONS, AXIOMS, GATE_P):
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


def test_historical_projection_spelling_is_explicitly_not_foundation_v2() -> None:
    axioms = _text(AXIOMS)
    notation = _text(NOTATION)

    assert "Historical accepted v0.2" in axioms
    assert "♀F / F♂" in axioms
    assert "не является Foundation-v2 определением self-closure" in axioms

    assert "Historical accepted v0.2" in notation
    assert "♀F" in notation and "F♂" in notation
    assert "Foundation v2 **не переносит** эту ориентацию" in notation


def test_docs_do_not_redefine_ostensive_signs_as_raw_projection_opcodes() -> None:
    joined = "\n".join(_text(path) for path in (FOUNDATIONS, AXIOMS, NOTATION, GATE_P))
    forbidden = (
        "♂ = getStart",
        "♀ = getEnd",
        "♂ = raw start projection",
        "♀ = raw end projection",
    )
    for fragment in forbidden:
        assert fragment not in joined


def test_gate_p_records_persistent_l4_as_completed_before_cutover() -> None:
    text = _text(GATE_P)
    assert "Persistent exact-occurrence L4                 #265/#266" in text
    assert "Persistent L4 больше не является открытым blocker-ом" in text
    assert "historical compatibility classification" in text
    assert "atomic production cutover" in text
