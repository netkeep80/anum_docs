"""Historical opening challenge replayed through the canonical v0.3 core."""

from dataclasses import fields, is_dataclass
import inspect
import json
from pathlib import Path

import pytest

from core.mtc_ast import ContextPronoun, Definition, Expression, Form, format_expression, structural_key
from core.mtc_definitions import (
    DefinitionEnvironment,
    DefinitionLookupKind,
    DefinitionRegistrationKind,
    open_definition,
)
from core.mtc_interpreter import ContextFrame, InterpretationError, interpret_constraints
from core.mtc_parser import parse_formula
from core.root_library import load_root_library


ROOT = Path(__file__).parents[1]
CHALLENGE = ROOT / "contracts" / "mts-definition-opening-challenge-v0.3.json"
CORPUS = ROOT / "contracts" / "mts-definition-opening-conformance-v0.3.json"
DECISION = ROOT / "contracts" / "mts-definition-opening-decision-v0.3.json"
MTS_CONTRACT = ROOT / "contracts" / "mts-contract-v0.2.json"
MTS_PROOF = ROOT / "contracts" / "mts-proof-v0.2.json"
ROOT_PROGRAM = ROOT / "tests" / "mtc_formulas.mtc"


def challenge() -> dict:
    return json.loads(CHALLENGE.read_text(encoding="utf-8"))


def corpus() -> dict:
    return json.loads(CORPUS.read_text(encoding="utf-8"))


def decision() -> dict:
    return json.loads(DECISION.read_text(encoding="utf-8"))


def definition(source: str) -> Definition:
    value = parse_formula(source)
    assert isinstance(value, Definition)
    return value


def target(source: str) -> Form:
    return definition(f"{source} : __query_body__").target


def contains_context_pronoun(value: object) -> bool:
    if isinstance(value, ContextPronoun):
        return True
    if isinstance(value, tuple):
        return any(contains_context_pronoun(item) for item in value)
    if isinstance(value, Expression) and is_dataclass(value):
        return any(
            contains_context_pronoun(getattr(value, item.name))
            for item in fields(value)
            if item.name != "span"
        )
    return False


def opening_data(target_form: Form, environment: DefinitionEnvironment) -> dict:
    result = open_definition(target_form, environment)
    if result.kind is DefinitionLookupKind.MATCH:
        assert result.definition_id is not None and result.body is not None
        return {
            "kind": "match",
            "definitionId": {
                "scopePath": list(result.definition_id.scope_path),
                "ordinal": result.definition_id.ordinal,
            },
            "body": format_expression(result.body),
        }
    return {"kind": result.kind.value}


def scenario_data(scenario: dict) -> dict:
    environments: dict[tuple[int, ...], DefinitionEnvironment] = {}
    for scope in sorted(
        scenario["scopes"], key=lambda item: (len(item["path"]), item["path"])
    ):
        path = tuple(scope["path"])
        parent_path = scope.get("parent")
        parent = environments.get(tuple(parent_path)) if parent_path is not None else None
        environment = DefinitionEnvironment(path, parent)
        environments[path] = environment
        for source in scope["definitions"]:
            registration = environment.register(definition(source))
            if registration.kind is DefinitionRegistrationKind.CONFLICT:
                return {"kind": "conflict"}
            if registration.kind is DefinitionRegistrationKind.NON_ADDRESSABLE:
                return {"kind": "non-addressable"}

    return opening_data(
        target(scenario["target"]),
        environments[tuple(scenario["lookupScope"])],
    )


class NoMemory:
    def __getattr__(self, name):
        raise AssertionError(f"unexpected L4 access: {name}")


def test_challenge_remains_historical_while_its_vectors_are_promoted_to_conformance():
    data = challenge()
    vectors = corpus()
    selected = decision()["nextGate"]
    mts_text = MTS_CONTRACT.read_text(encoding="utf-8")
    proof_text = MTS_PROOF.read_text(encoding="utf-8")

    assert data["schema"] == "mts-definition-opening-challenge/v0.3"
    assert data["status"] == "candidate-challenge"
    assert vectors["schema"] == "mts-definition-opening-conformance/v0.3"
    assert vectors["status"] == "accepted"
    assert vectors["accepted"] is True
    assert vectors["contract"] == "mts-definition-opening/v0.3"
    assert selected["artifact"] == data["schema"]
    assert data["conformanceCorpus"] == "contracts/mts-definition-opening-conformance-v0.3.json"
    assert data["acceptedContractLinkAllowed"] is False
    assert data["productionInterpreterChangeAllowed"] is False
    assert data["proofRuleAccepted"] is False
    assert "mts-definition-opening-challenge" not in mts_text
    assert "mts-definition-opening-challenge" not in proof_text


def test_root_corpus_is_exactly_current_ten_definition_surface_and_replays_in_core():
    library = load_root_library(ROOT_PROGRAM)
    vectors = corpus()["rootOpenings"]
    assert len(library.formulas) == len(library.definitions.entries()) == len(vectors) == 10

    corpus_sources = [
        f"{vector['target']} : {vector['expected']['body']}"
        for vector in vectors
    ]
    assert corpus_sources == [formula.text for formula in library.formulas]

    for vector in vectors:
        query = target(vector["target"])
        assert opening_data(query, library.definitions) == vector["expected"]
        if vector.get("mustContainUnresolvedContextPronoun"):
            lookup = library.definitions.lookup(query)
            assert lookup.entry is not None
            assert contains_context_pronoun(lookup.entry.definition.value)


def test_all_custom_positive_and_negative_vectors_replay_exactly_in_core():
    for scenario in corpus()["scenarios"]:
        assert scenario_data(scenario) == scenario["expected"], scenario["id"]


def test_one_step_vectors_do_not_recursively_follow_returned_symbol():
    one_step = [
        scenario
        for scenario in corpus()["scenarios"]
        if scenario.get("mustStopAfterOneOpening")
    ]
    assert {scenario["id"] for scenario in one_step} == {
        "self-one-step",
        "mutual-a-one-step",
        "mutual-b-one-step",
    }
    for scenario in one_step:
        actual = scenario_data(scenario)
        assert actual == scenario["expected"]
        assert "cycle" not in actual and "steps" not in actual


def test_shadowing_uses_lexical_scope_and_opening_has_no_contextframe_input():
    scenarios = {scenario["id"]: scenario for scenario in corpus()["scenarios"]}
    shadow = scenario_data(scenarios["child-shadowing"])
    fallback = scenario_data(scenarios["parent-fallback"])
    assert shadow["definitionId"] == {"scopePath": [0], "ordinal": 0}
    assert shadow["body"] == "c"
    assert fallback["definitionId"] == {"scopePath": [], "ordinal": 0}
    assert fallback["body"] == "b"

    assert set(inspect.signature(open_definition).parameters) == {"target", "environment"}
    boundary = challenge()["contextBoundary"]
    assert boundary["ContextFrameIsOpeningInput"] is False
    assert boundary["MemoryViewIsOpeningInput"] is False
    assert boundary["symbolBindingsAreOpeningInput"] is False
    assert boundary["proofStateIsOpeningInput"] is False


def test_addressable_lookup_ignores_span_but_anonymous_shape_is_not_globalized():
    compact = definition("a:b")
    spaced = definition("   a : c")
    assert compact.target.span != spaced.target.span
    assert structural_key(compact.target) == structural_key(spaced.target)

    environment = DefinitionEnvironment()
    registration = environment.register(compact)
    assert registration.entry is not None
    assert environment.lookup(spaced.target).entry == registration.entry

    anonymous_a = definition("[] : a")
    anonymous_b = definition("   [] : b")
    assert structural_key(anonymous_a.target) == structural_key(anonymous_b.target)
    assert environment.register(anonymous_a).kind is DefinitionRegistrationKind.NON_ADDRESSABLE
    assert environment.register(anonymous_b).kind is DefinitionRegistrationKind.NON_ADDRESSABLE


def test_returned_context_pronouns_are_not_interpreted_by_opening():
    scenario = next(
        item
        for item in corpus()["scenarios"]
        if item["id"] == "constraint-bundle-rhs"
    )
    assert scenario_data(scenario) == scenario["expected"]
    assert scenario["expected"]["body"] == "{◁ = c, ▷ = c}"


def test_opening_has_no_l4_or_proof_effect_and_interpret_still_rejects_definition():
    operation = challenge()["operationUnderChallenge"]
    assert operation["readsL4"] is False
    assert operation["writesL4"] is False
    assert operation["assertsEquality"] is False
    assert operation["producesProofStep"] is False
    assert operation["rewritesCallerAst"] is False
    assert operation["evaluatesBody"] is False

    source = definition("a : b")
    with pytest.raises(InterpretationError, match="Definition"):
        interpret_constraints(
            source,
            ContextFrame(1, 2),
            NoMemory(),
            symbols={"a": 1, "b": 2},
        )


def test_corpus_has_no_storage_or_source_span_observable_identity():
    text = CORPUS.read_text(encoding="utf-8")
    non_observables = set(corpus()["nonObservables"])
    assert "source span offsets" in non_observables
    assert "persistent LinkRef or backend address" in non_observables
    assert "target structural-key serialization" in non_observables
    assert '"LinkRef"' not in text
    assert '"sourceSpan"' not in text
