"""Independent executable replay for the candidate definition-opening corpus."""

from dataclasses import dataclass, fields, is_dataclass
import inspect
import json
from pathlib import Path

import pytest

from core.mtc_ast import (
    ContextPronoun,
    Definition,
    Expression,
    Form,
    SquareForm,
    format_expression,
    structural_key,
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


@dataclass(frozen=True, order=True)
class ReplayDefinitionId:
    scope_path: tuple[int, ...]
    ordinal: int

    def data(self) -> dict:
        return {"scopePath": list(self.scope_path), "ordinal": self.ordinal}


@dataclass(frozen=True)
class ReplayEntry:
    identity: ReplayDefinitionId
    source: Definition


class ReplayNonAddressable(ValueError):
    pass


class ReplayConflict(ValueError):
    pass


def challenge() -> dict:
    return json.loads(CHALLENGE.read_text(encoding="utf-8"))


def corpus() -> dict:
    return json.loads(CORPUS.read_text(encoding="utf-8"))


def decision() -> dict:
    return json.loads(DECISION.read_text(encoding="utf-8"))


def _definition(source: str) -> Definition:
    value = parse_formula(source)
    assert isinstance(value, Definition)
    return value


def _target(source: str) -> Form:
    return _definition(f"{source} : __query_body__").target


def _contains_non_addressable(value: object) -> bool:
    if isinstance(value, ContextPronoun):
        return True
    if isinstance(value, SquareForm) and value.content is None:
        return True
    if isinstance(value, tuple):
        return any(_contains_non_addressable(item) for item in value)
    if isinstance(value, Expression) and is_dataclass(value):
        return any(
            _contains_non_addressable(getattr(value, item.name))
            for item in fields(value)
            if item.name != "span"
        )
    return False


def _contains_context_pronoun(value: object) -> bool:
    if isinstance(value, ContextPronoun):
        return True
    if isinstance(value, tuple):
        return any(_contains_context_pronoun(item) for item in value)
    if isinstance(value, Expression) and is_dataclass(value):
        return any(
            _contains_context_pronoun(getattr(value, item.name))
            for item in fields(value)
            if item.name != "span"
        )
    return False


def _target_key(target: Form) -> object:
    if _contains_non_addressable(target):
        raise ReplayNonAddressable("target is occurrence-local or deictic")
    return structural_key(target)


class ReplayEnvironment:
    def __init__(
        self,
        scope_path: tuple[int, ...],
        parent: "ReplayEnvironment | None" = None,
    ) -> None:
        self.scope_path = scope_path
        self.parent = parent
        self.entries: dict[object, ReplayEntry] = {}

    def register(self, definition: Definition) -> ReplayEntry:
        key = _target_key(definition.target)
        if key in self.entries:
            raise ReplayConflict("same-scope target conflict")
        entry = ReplayEntry(
            ReplayDefinitionId(self.scope_path, len(self.entries)),
            definition,
        )
        self.entries[key] = entry
        return entry

    def lookup(self, target: Form) -> ReplayEntry | None:
        key = _target_key(target)
        current: ReplayEnvironment | None = self
        while current is not None:
            entry = current.entries.get(key)
            if entry is not None:
                return entry
            current = current.parent
        return None


def replay_open_definition(target: Form, environment: ReplayEnvironment) -> dict:
    """Independent one-step replay: lookup exact typed RHS and stop."""

    try:
        entry = environment.lookup(target)
    except ReplayNonAddressable:
        return {"kind": "non-addressable"}
    if entry is None:
        return {"kind": "no-match"}
    return {
        "kind": "match",
        "definitionId": entry.identity.data(),
        "body": format_expression(entry.source.value),
    }


def _build_scenario_environments(scenario: dict) -> tuple[dict[tuple[int, ...], ReplayEnvironment], str | None]:
    environments: dict[tuple[int, ...], ReplayEnvironment] = {}
    failure: str | None = None

    for scope in sorted(scenario["scopes"], key=lambda item: (len(item["path"]), item["path"])):
        path = tuple(scope["path"])
        parent_path = scope.get("parent")
        parent = environments.get(tuple(parent_path)) if parent_path is not None else None
        environment = ReplayEnvironment(path, parent)
        environments[path] = environment

        for source in scope["definitions"]:
            try:
                environment.register(_definition(source))
            except ReplayNonAddressable:
                failure = "non-addressable"
                break
            except ReplayConflict:
                failure = "conflict"
                break
        if failure is not None:
            break

    return environments, failure


def _replay_scenario(scenario: dict) -> dict:
    environments, failure = _build_scenario_environments(scenario)
    if failure is not None:
        return {"kind": failure}

    environment = environments[tuple(scenario["lookupScope"])]
    try:
        target = _target(scenario["target"])
    except Exception:
        raise AssertionError(f"invalid challenge target: {scenario['target']}")
    return replay_open_definition(target, environment)


class NoMemory:
    def __getattr__(self, name):
        raise AssertionError(f"unexpected L4 access: {name}")


def test_challenge_and_corpus_are_non_normative_and_follow_decision_gate():
    data = challenge()
    vectors = corpus()
    selected = decision()["nextGate"]
    mts_text = MTS_CONTRACT.read_text(encoding="utf-8")
    proof_text = MTS_PROOF.read_text(encoding="utf-8")

    assert data["schema"] == "mts-definition-opening-challenge/v0.3"
    assert data["status"] == "candidate-challenge"
    assert vectors["schema"] == "mts-definition-opening-conformance/v0.3"
    assert vectors["status"] == "candidate-challenge-corpus"
    assert selected["artifact"] == data["schema"]
    assert data["conformanceCorpus"] == "contracts/mts-definition-opening-conformance-v0.3.json"
    assert data["acceptedContractLinkAllowed"] is False
    assert data["productionInterpreterChangeAllowed"] is False
    assert data["proofRuleAccepted"] is False
    assert "mts-definition-opening-challenge" not in mts_text
    assert "mts-definition-opening-conformance" not in mts_text
    assert "mts-definition-opening-challenge" not in proof_text


def test_root_corpus_is_exactly_the_current_ten_definition_surface():
    library = load_root_library(ROOT_PROGRAM)
    vectors = corpus()["rootOpenings"]

    assert len(library.formulas) == len(vectors) == 10
    assert all(isinstance(formula.ast, Definition) for formula in library.formulas)

    corpus_sources = [
        f"{vector['target']} : {vector['expected']['body']}"
        for vector in vectors
    ]
    assert corpus_sources == [formula.text for formula in library.formulas]


def test_every_root_opening_replays_to_exact_body_and_replay_local_id():
    library = load_root_library(ROOT_PROGRAM)
    environment = ReplayEnvironment(())
    for formula in library.formulas:
        assert isinstance(formula.ast, Definition)
        environment.register(formula.ast)

    for vector in corpus()["rootOpenings"]:
        target = _target(vector["target"])
        actual = replay_open_definition(target, environment)
        assert actual == vector["expected"]

        if vector.get("mustContainUnresolvedContextPronoun"):
            entry = environment.lookup(target)
            assert entry is not None
            assert _contains_context_pronoun(entry.source.value)


def test_all_custom_positive_and_negative_vectors_replay_exactly():
    for scenario in corpus()["scenarios"]:
        actual = _replay_scenario(scenario)
        assert actual == scenario["expected"], scenario["id"]


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
        actual = _replay_scenario(scenario)
        assert actual["body"] == scenario["expected"]["body"]
        assert "cycle" not in actual
        assert "steps" not in actual


def test_shadowing_and_parent_fallback_use_lexical_scope_not_contextframe():
    scenarios = {scenario["id"]: scenario for scenario in corpus()["scenarios"]}
    shadow = _replay_scenario(scenarios["child-shadowing"])
    fallback = _replay_scenario(scenarios["parent-fallback"])

    assert shadow["definitionId"] == {"scopePath": [0], "ordinal": 0}
    assert shadow["body"] == "c"
    assert fallback["definitionId"] == {"scopePath": [], "ordinal": 0}
    assert fallback["body"] == "b"

    assert set(inspect.signature(replay_open_definition).parameters) == {
        "target",
        "environment",
    }
    boundary = challenge()["contextBoundary"]
    assert boundary["ContextFrameIsOpeningInput"] is False
    assert boundary["MemoryViewIsOpeningInput"] is False
    assert boundary["symbolBindingsAreOpeningInput"] is False
    assert boundary["proofStateIsOpeningInput"] is False


def test_addressable_lookup_ignores_source_span_but_anonymous_shape_is_not_globalized():
    compact = _definition("a:b")
    spaced = _definition("   a : c")
    assert compact.target.span != spaced.target.span
    assert structural_key(compact.target) == structural_key(spaced.target)

    environment = ReplayEnvironment(())
    entry = environment.register(compact)
    found = environment.lookup(spaced.target)
    assert found == entry

    anonymous_a = _definition("[] : a")
    anonymous_b = _definition("   [] : b")
    assert anonymous_a.target.span != anonymous_b.target.span
    assert structural_key(anonymous_a.target) == structural_key(anonymous_b.target)
    with pytest.raises(ReplayNonAddressable):
        environment.register(anonymous_a)
    with pytest.raises(ReplayNonAddressable):
        environment.register(anonymous_b)


def test_returned_context_pronouns_are_not_interpreted_by_opening():
    scenario = next(
        item
        for item in corpus()["scenarios"]
        if item["id"] == "constraint-bundle-rhs"
    )
    environments, failure = _build_scenario_environments(scenario)
    assert failure is None
    environment = environments[()]
    target = _target("c")
    entry = environment.lookup(target)
    assert entry is not None
    assert _contains_context_pronoun(entry.source.value)

    actual = replay_open_definition(target, environment)
    assert actual == scenario["expected"]
    assert actual["body"] == "{◁ = c, ▷ = c}"


def test_opening_has_no_l4_or_proof_effect_and_production_definition_execution_is_still_rejected():
    operation = challenge()["operationUnderChallenge"]
    assert operation["readsL4"] is False
    assert operation["writesL4"] is False
    assert operation["assertsEquality"] is False
    assert operation["producesProofStep"] is False
    assert operation["rewritesCallerAst"] is False
    assert operation["evaluatesBody"] is False

    source = _definition("a : b")
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


def test_release_gate_blocks_production_and_l5_until_explicit_acceptance():
    gate = challenge()["releaseGate"]
    assert "publish an explicit versioned Accepted definition-opening contract before modifying production code" in gate
    assert "only after production integration and conformance consider a trusted L5 opening rule" in gate
