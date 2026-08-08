"""Executable, non-production challenge for bundle model B.

The reference elaborator in this test is deliberately test-local. It proves that
a static split is coherent before any accepted AST/parser/interpreter changes.
"""

import json
from pathlib import Path

import pytest

from core.mtc_ast import (
    BundleForm,
    Definition,
    EndProjection,
    Equality,
    Expression,
    Form,
    Inequality,
    Inversion,
    Judgment,
    LinkForm,
    RoundForm,
    Sequence,
    SquareForm,
    StartProjection,
    format_expression,
)
from core.mtc_parser import parse_formula


ROOT = Path(__file__).parents[1]
CORPUS = ROOT / "contracts" / "mts-bundle-elaboration-challenge-v0.2.json"
DECISION = ROOT / "contracts" / "mts-bundle-decision-v0.2.json"
MTS_CONTRACT = ROOT / "contracts" / "mts-contract-v0.2.json"
ROOT_PROGRAM = ROOT / "tests" / "mtc_formulas.mtc"

CONSTRAINT = "ConstraintBundle"
VALUE = "ValueBundle"


class ElaborationError(ValueError):
    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


def corpus() -> dict:
    return json.loads(CORPUS.read_text(encoding="utf-8"))


def _intrinsic_evidence(expression: Expression) -> str | None:
    """Return static role evidence without using parent/runtime context."""

    if isinstance(expression, BundleForm):
        if not expression.items:
            return None
        evidence = {
            item_evidence
            for item in expression.items
            if (item_evidence := _intrinsic_evidence(item)) is not None
        }
        if len(evidence) > 1:
            raise ElaborationError("mixed-bundle-role-evidence")
        return next(iter(evidence), None)

    if isinstance(expression, Judgment):
        return "constraint"
    if isinstance(expression, Form):
        return "value"
    raise ElaborationError("unsupported-bundle-item")


def _elaborate_bundle(
    bundle: BundleForm,
    path: tuple[int, ...],
    expected: str | None,
    roles: list[tuple[tuple[int, ...], str]],
) -> None:
    evidence = _intrinsic_evidence(bundle)

    if evidence == "constraint":
        role = CONSTRAINT
    elif evidence == "value":
        role = VALUE
    elif expected == "form":
        role = VALUE
    elif expected in {"constraint", "definition-default"}:
        role = CONSTRAINT
    else:
        raise ElaborationError("ambiguous-empty-bundle-role")

    if expected == "form" and role != VALUE:
        raise ElaborationError("bundle-role-mismatch")
    if expected == "constraint" and role != CONSTRAINT:
        raise ElaborationError("bundle-role-mismatch")

    roles.append((path, role))
    child_expected = "constraint" if role == CONSTRAINT else "form"
    for index, item in enumerate(bundle.items):
        _elaborate_expression(item, path + (index,), child_expected, roles)


def _elaborate_expression(
    expression: Expression,
    path: tuple[int, ...],
    expected: str | None,
    roles: list[tuple[tuple[int, ...], str]],
) -> None:
    if isinstance(expression, BundleForm):
        _elaborate_bundle(expression, path, expected, roles)
        return

    if isinstance(expression, Definition):
        if expected in {"form", "constraint"}:
            raise ElaborationError("expression-role-mismatch")
        _elaborate_expression(expression.target, path + (0,), "form", roles)
        _elaborate_expression(expression.value, path + (1,), "definition-default", roles)
        return

    if isinstance(expression, (Equality, Inequality)):
        if expected == "form":
            raise ElaborationError("expression-role-mismatch")
        _elaborate_expression(expression.left, path + (0,), "form", roles)
        _elaborate_expression(expression.right, path + (1,), "form", roles)
        return

    if isinstance(expression, LinkForm):
        if expected == "constraint":
            raise ElaborationError("expression-role-mismatch")
        _elaborate_expression(expression.left, path + (0,), "form", roles)
        _elaborate_expression(expression.right, path + (1,), "form", roles)
        return

    if isinstance(expression, Sequence):
        if expected == "constraint":
            raise ElaborationError("expression-role-mismatch")
        for index, item in enumerate(expression.items):
            _elaborate_expression(item, path + (index,), "form", roles)
        return

    if isinstance(expression, (StartProjection, EndProjection, Inversion)):
        if expected == "constraint":
            raise ElaborationError("expression-role-mismatch")
        _elaborate_expression(expression.value, path + (0,), "form", roles)
        return

    if isinstance(expression, RoundForm):
        if expected == "constraint":
            raise ElaborationError("expression-role-mismatch")
        if expression.content is not None:
            _elaborate_expression(expression.content, path + (0,), None, roles)
        return

    if isinstance(expression, SquareForm):
        if expected == "constraint":
            raise ElaborationError("expression-role-mismatch")
        if expression.content is not None:
            _elaborate_expression(expression.content, path + (0,), None, roles)
        return

    if isinstance(expression, Form):
        if expected == "constraint":
            raise ElaborationError("expression-role-mismatch")
        return

    raise ElaborationError("unsupported-expression")


def elaborate(source: str, entry_expected: str) -> list[dict]:
    ast = parse_formula(source)
    roles: list[tuple[tuple[int, ...], str]] = []
    expected = None if entry_expected == "none" else entry_expected
    _elaborate_expression(ast, (), expected, roles)
    return [{"path": list(path), "role": role} for path, role in roles]


def _square_paths(expression: Expression, path: tuple[int, ...] = ()) -> list[list[int]]:
    result: list[list[int]] = []
    if isinstance(expression, SquareForm):
        result.append(list(path))
        if expression.content is not None:
            result.extend(_square_paths(expression.content, path + (0,)))
        return result
    if isinstance(expression, BundleForm):
        for index, item in enumerate(expression.items):
            result.extend(_square_paths(item, path + (index,)))
        return result
    if isinstance(expression, Definition):
        result.extend(_square_paths(expression.target, path + (0,)))
        result.extend(_square_paths(expression.value, path + (1,)))
        return result
    if isinstance(expression, (Equality, Inequality, LinkForm)):
        result.extend(_square_paths(expression.left, path + (0,)))
        result.extend(_square_paths(expression.right, path + (1,)))
        return result
    if isinstance(expression, Sequence):
        for index, item in enumerate(expression.items):
            result.extend(_square_paths(item, path + (index,)))
        return result
    if isinstance(expression, (StartProjection, EndProjection, Inversion)):
        result.extend(_square_paths(expression.value, path + (0,)))
        return result
    if isinstance(expression, RoundForm) and expression.content is not None:
        result.extend(_square_paths(expression.content, path + (0,)))
    return result


def test_challenge_is_non_normative_and_uses_selected_decision_model():
    data = corpus()
    decision = json.loads(DECISION.read_text(encoding="utf-8"))
    mts_contract_text = MTS_CONTRACT.read_text(encoding="utf-8")

    assert data["schema"] == "mts-bundle-elaboration-challenge/v0.2"
    assert data["status"] == "candidate-challenge"
    assert data["model"] == "B"
    assert decision["nextGate"]["artifact"] == data["schema"]
    assert data["acceptedContractLinkAllowed"] is False
    assert data["productionSemanticsChanged"] is False
    assert "mts-bundle-elaboration-challenge" not in mts_contract_text


def test_every_challenge_vector_elaborates_or_rejects_exactly_as_declared():
    for case in corpus()["cases"]:
        ast = parse_formula(case["source"])
        assert format_expression(ast) == case["source"]

        if "error" in case:
            with pytest.raises(ElaborationError, match=case["error"]):
                elaborate(case["source"], case["entryExpected"])
        else:
            assert elaborate(case["source"], case["entryExpected"]) == case["roles"]

        if "squarePaths" in case:
            assert _square_paths(ast) == case["squarePaths"]


def test_all_current_root_definitions_still_elaborate_without_value_bundles():
    root_sources = [
        line.strip()
        for line in ROOT_PROGRAM.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    ]

    seen_roles: list[str] = []
    for source in root_sources:
        roles = elaborate(source, "none")
        seen_roles.extend(item["role"] for item in roles)

    assert seen_roles
    assert set(seen_roles) == {CONSTRAINT}


def test_empty_nested_bundle_needs_only_static_evidence_or_context():
    assert elaborate("{{}}", "constraint") == [
        {"path": [], "role": CONSTRAINT},
        {"path": [0], "role": CONSTRAINT},
    ]
    assert elaborate("{{}} = x", "none") == [
        {"path": [0], "role": VALUE},
        {"path": [0, 0], "role": VALUE},
    ]
    with pytest.raises(ElaborationError, match="ambiguous-empty-bundle-role"):
        elaborate("{{}}", "none")


def test_sibling_evidence_statically_types_empty_child_without_runtime_state():
    assert elaborate("{{}, x}", "none") == [
        {"path": [], "role": VALUE},
        {"path": [0], "role": VALUE},
    ]
    assert elaborate("{{}, x = y}", "none") == [
        {"path": [], "role": CONSTRAINT},
        {"path": [0], "role": CONSTRAINT},
    ]


def test_challenge_has_no_memory_or_production_effects():
    veto = corpus()["effectVeto"]
    assert veto == {
        "readsMemory": False,
        "realizes": False,
        "deletes": False,
        "changesInterpreter": False,
        "changesAst": False,
        "changesParser": False,
    }
