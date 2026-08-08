"""Исполняет принятый корпус плоских пучков значений через единое ядро."""

import json
from pathlib import Path

import pytest

from core.anum_memory import AnumMemory
from core.mtc_ast import BundleForm, Sequence, SquareForm, Symbol
from core.mtc_interpreter import ContextFrame, interpret_constraints
from core.mtc_parser import parse_formula
from core.mtc_value_bundle import (
    BundleElaborationError,
    BundleRole,
    BundleValue,
    ExpectedRole,
    LinkValue,
    elaborate_bundles,
    evaluate_flat_value_bundle,
    expand_bundle_query,
    values_equal,
)


ROOT = Path(__file__).parents[1]
CORPUS = ROOT / "contracts" / "mts-value-bundle-conformance-v0.2.json"
CONTRACT = ROOT / "contracts" / "mts-value-bundle-v0.2.json"
ROOT_PROGRAM = ROOT / "tests" / "mtc_formulas.mtc"
INTERPRETER = ROOT / "core" / "mtc_interpreter.py"
REFERENCE_CORE = ROOT / "core" / "mtc_value_bundle.py"


def corpus() -> dict:
    return json.loads(CORPUS.read_text(encoding="utf-8"))


def _entry(case: dict) -> ExpectedRole:
    if case.get("context") == "constraint-entry":
        return ExpectedRole.CONSTRAINT
    if case.get("context") in {"form-required", "value-entry"}:
        return ExpectedRole.VALUE
    return ExpectedRole.NONE


def _path(case: dict) -> tuple[int, ...]:
    return tuple(case.get("bundlePath", ()))


def _resolver(symbols: dict[str, int], holes: dict[str, int]):
    def resolve(form, path: tuple[int, ...]) -> int:
        if isinstance(form, Symbol):
            if form.name not in symbols:
                raise ValueError(f"unbound symbol: {form.name}")
            return symbols[form.name]
        if isinstance(form, SquareForm) and form.content is None:
            key = ".".join(str(part) for part in path)
            if key not in holes:
                raise ValueError(f"unbound anonymous occurrence: {key}")
            return holes[key]
        raise ValueError(f"unsupported value-bundle test form: {type(form).__name__}")

    return resolve


def _bundle_value(source: str, symbols: dict[str, int], holes: dict[str, int]) -> BundleValue:
    ast = parse_formula(source)
    assert isinstance(ast, BundleForm)
    entry = ExpectedRole.VALUE if not ast.items else ExpectedRole.NONE
    elaboration = elaborate_bundles(ast, entry=entry)
    return evaluate_flat_value_bundle(
        ast,
        path=(),
        elaboration=elaboration,
        resolve_form=_resolver(symbols, holes),
    )


def _query_fixture() -> tuple[AnumMemory, dict[str, int]]:
    fixture = corpus()["expansionMemory"]
    initial = {int(ref): tuple(pair) for ref, pair in fixture["links"].items()}
    return AnumMemory(initial_links=initial), fixture["symbols"]


def test_reference_module_is_accepted_single_value_bundle_core():
    contract = json.loads(CONTRACT.read_text(encoding="utf-8"))
    interpreter_source = INTERPRETER.read_text(encoding="utf-8")

    assert contract["status"] == "accepted"
    assert contract["accepted"] is True
    assert contract["acceptanceEvidence"]["referenceCore"] == "core/mtc_value_bundle.py"
    assert REFERENCE_CORE.is_file()
    assert "mtc_value_bundle" not in interpreter_source


def test_elaboration_section_runs_through_single_reference_core():
    for case in corpus()["elaboration"]:
        ast = parse_formula(case["source"])
        elaboration = elaborate_bundles(ast, entry=_entry(case))
        role = elaboration.role_at(_path(case))
        assert role is not None, case["id"]
        assert role.value == case["expectedRole"], case["id"]


def test_every_static_rejection_has_the_declared_reference_error_code():
    for case in corpus()["staticRejections"]:
        ast = parse_formula(case["source"])
        with pytest.raises(BundleElaborationError) as caught:
            elaborate_bundles(ast, entry=_entry(case))
        assert caught.value.code == case["error"], case["id"]


def test_flat_value_equality_corpus_preserves_occurrences_and_compares_resolved_sets():
    for case in corpus()["valueEquality"]:
        left = _bundle_value(case["left"], case["symbols"], case["leftHoles"])
        right = _bundle_value(case["right"], case["symbols"], case["rightHoles"])

        assert list(left.identities) == case["leftSet"], case["id"]
        assert list(right.identities) == case["rightSet"], case["id"]
        assert values_equal(left, right) is case["equal"], case["id"]

        if case["leftHoles"]:
            assert len(left.occurrences) == len(parse_formula(case["left"]).items)


def test_cross_kind_comparison_has_no_singleton_coercion():
    for case in corpus()["crossKindComparison"]:
        bundle = _bundle_value(case["bundle"], case["symbols"], {})
        scalar = LinkValue(case["scalarIdentity"])

        assert list(bundle.identities) == case["bundleSet"]
        assert values_equal(bundle, scalar) is case["equal"]
        assert (not values_equal(bundle, scalar)) is case["notEqual"]


def test_unresolved_anonymous_value_occurrence_never_selects_an_arbitrary_identity():
    ast = parse_formula("{[]}")
    assert isinstance(ast, BundleForm)
    elaboration = elaborate_bundles(ast)

    with pytest.raises(ValueError, match="unbound anonymous occurrence"):
        evaluate_flat_value_bundle(
            ast,
            path=(),
            elaboration=elaboration,
            resolve_form=_resolver({}, {}),
        )


def test_expansion_corpus_uses_canonical_read_only_l4_surface_and_never_realizes():
    memory, symbols = _query_fixture()
    before = memory.snapshot()
    resolver = _resolver(symbols, {})

    for case in corpus()["expansion"]:
        ast = parse_formula(case["source"])
        assert isinstance(ast, Sequence), case["id"]
        value = expand_bundle_query(
            ast,
            path=(),
            elaboration=elaborate_bundles(ast),
            resolve_form=resolver,
            memory=memory,
        )
        assert list(value.identities) == case["expectedLinks"], case["id"]
        assert memory.snapshot() == before, case["id"]


def test_missing_expansion_pair_is_not_materialized():
    memory, symbols = _query_fixture()
    before = memory.snapshot()
    before_count = memory.link_count
    ast = parse_formula("a{e}")
    assert isinstance(ast, Sequence)

    value = expand_bundle_query(
        ast,
        path=(),
        elaboration=elaborate_bundles(ast),
        resolve_form=_resolver(symbols, {}),
        memory=memory,
    )

    assert value.identities == ()
    assert memory.link_count == before_count
    assert memory.snapshot() == before


def test_current_root_program_elaborates_without_any_value_bundle_role():
    roles: list[BundleRole] = []
    sources = [
        line.strip()
        for line in ROOT_PROGRAM.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    ]

    assert len(sources) == 10
    for source in sources:
        elaboration = elaborate_bundles(parse_formula(source))
        roles.extend(item.role for item in elaboration.roles)

    assert roles
    assert set(roles) == {BundleRole.CONSTRAINT}


def test_existing_constraint_bundle_interpreter_behavior_is_unchanged():
    class NoMemoryNeeded:
        def poles(self, _link: int):
            raise AssertionError("poles must not be needed")

        def find_link(self, _start: int, _end: int):
            raise AssertionError("find_link must not be needed")

        def find_start_projection(self, _form: int):
            raise AssertionError("projection must not be needed")

        def find_end_projection(self, _form: int):
            raise AssertionError("projection must not be needed")

    frame = ContextFrame(start=10, end=12)

    empty = interpret_constraints(parse_formula("{}"), frame, NoMemoryNeeded())
    same_poles = interpret_constraints(
        parse_formula("{◁ = ◁, ▷ = ▷}"),
        frame,
        NoMemoryNeeded(),
    )

    assert empty.success is True
    assert same_poles.success is True
    assert empty.holes == ()
    assert same_poles.holes == ()
