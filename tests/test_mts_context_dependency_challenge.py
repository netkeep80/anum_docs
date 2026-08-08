"""Executable evidence for the non-normative context-dependency challenge v0.5."""

import inspect
import json
from dataclasses import dataclass
from pathlib import Path

from core.mtc_ast import (
    BundleForm,
    ContextPronoun,
    Definition,
    EndProjection,
    Equality,
    Expression,
    Form,
    Inequality,
    Inversion,
    LinkForm,
    RoundForm,
    Sequence,
    SquareForm,
    StartProjection,
    Symbol,
    structural_key,
)
from core.mtc_definitions import (
    DefinitionEnvironment,
    DefinitionId,
    DefinitionLookupKind,
    open_definition,
)
from core.mtc_interpreter import ContextFrame, MemoryView, interpret_constraints
from core.mtc_parser import parse_formula


ROOT = Path(__file__).parents[1]
CHALLENGE = ROOT / "contracts" / "mts-context-dependency-challenge-v0.5.json"
DEICTIC_CHALLENGE = ROOT / "contracts" / "mts-deictic-context-challenge-v0.5.json"
MTS_V04 = ROOT / "contracts" / "mts-contract-v0.4.json"
PROOF_V03 = ROOT / "contracts" / "mts-proof-v0.3.json"
ROOT_PROGRAM = ROOT / "tests" / "mtc_formulas.mtc"


def read(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


class NoReadMemory(MemoryView):
    def poles(self, link: int) -> tuple[int, int]:
        raise AssertionError(f"unexpected poles({link})")

    def find_link(self, start: int, end: int) -> int | None:
        raise AssertionError(f"unexpected find_link({start}, {end})")

    def find_start_projection(self, form: int) -> int | None:
        raise AssertionError(f"unexpected find_start_projection({form})")

    def find_end_projection(self, form: int) -> int | None:
        raise AssertionError(f"unexpected find_end_projection({form})")


def replay(source: str, frame: ContextFrame, *, symbols: dict[str, int] | None = None):
    return interpret_constraints(
        parse_formula(source),
        frame,
        NoReadMemory(),
        symbols=symbols,
    )


def result_shape(result) -> tuple[bool, tuple, tuple]:
    return result.success, result.holes, result.aliases


def child_expressions(expression: Expression) -> tuple[Expression, ...]:
    if isinstance(expression, (Symbol, ContextPronoun)):
        return ()
    if isinstance(expression, (RoundForm, SquareForm)):
        return () if expression.content is None else (expression.content,)
    if isinstance(expression, BundleForm):
        return expression.items
    if isinstance(expression, Sequence):
        return expression.items
    if isinstance(expression, (StartProjection, EndProjection, Inversion)):
        return (expression.value,)
    if isinstance(expression, (LinkForm, Equality, Inequality)):
        return (expression.left, expression.right)
    if isinstance(expression, Definition):
        return (expression.target, expression.value)
    return ()


def direct_pronouns(
    expression: Expression,
    path: tuple[int, ...] = (),
) -> tuple[tuple[tuple[int, ...], int, str], ...]:
    if isinstance(expression, ContextPronoun):
        return ((path, expression.up, expression.pole.value),)

    found: list[tuple[tuple[int, ...], int, str]] = []
    for index, child in enumerate(child_expressions(expression)):
        found.extend(direct_pronouns(child, path + (index,)))
    return tuple(found)


def symbols_in(expression: Expression) -> tuple[Symbol, ...]:
    found: list[Symbol] = []

    def walk(node: Expression) -> None:
        if isinstance(node, Symbol):
            found.append(node)
        for child in child_expressions(node):
            walk(child)

    walk(expression)
    return tuple(found)


@dataclass(frozen=True)
class DefinitionDependencyEvidence:
    classification: str
    visited: tuple[DefinitionId, ...]
    cycle_seen: bool
    pronouns: tuple[tuple[tuple[int, ...], int, str], ...]


def definition_dependency(
    target_source: str,
    environment: DefinitionEnvironment,
) -> DefinitionDependencyEvidence:
    """Test-local finite candidate; this is deliberately not production semantics."""

    target = parse_formula(target_source)
    if not isinstance(target, Form):
        return DefinitionDependencyEvidence("unknown", (), False, ())

    initial = open_definition(target, environment)
    if initial.kind is not DefinitionLookupKind.MATCH:
        return DefinitionDependencyEvidence("unknown", (), False, ())

    assert initial.definition_id is not None
    assert initial.body is not None

    visited: set[DefinitionId] = set()
    ordered: list[DefinitionId] = []
    all_pronouns: list[tuple[tuple[int, ...], int, str]] = []
    cycle_seen = False
    stack = [(initial.definition_id, initial.body)]

    while stack:
        definition_id, body = stack.pop()
        if definition_id in visited:
            cycle_seen = True
            continue
        visited.add(definition_id)
        ordered.append(definition_id)
        all_pronouns.extend(direct_pronouns(body))

        for symbol in reversed(symbols_in(body)):
            nested = open_definition(symbol, environment)
            if nested.kind is DefinitionLookupKind.MATCH:
                assert nested.definition_id is not None
                assert nested.body is not None
                if nested.definition_id in visited:
                    cycle_seen = True
                else:
                    stack.append((nested.definition_id, nested.body))

    return DefinitionDependencyEvidence(
        "candidate-indirect-deictic" if all_pronouns else "candidate-no-deictic-in-closure",
        tuple(ordered),
        cycle_seen,
        tuple(all_pronouns),
    )


def register(environment: DefinitionEnvironment, source: str) -> None:
    expression = parse_formula(source)
    assert isinstance(expression, Definition)
    result = environment.register(expression)
    assert result.entry is not None


def test_challenge_is_non_normative_and_keeps_current_contracts_immutable():
    challenge = read(CHALLENGE)
    deictic = read(DEICTIC_CHALLENGE)

    assert challenge["schema"] == "mts-context-dependency-challenge/v0.5"
    assert challenge["status"] == "candidate-challenge"
    assert challenge["acceptedContractLinkAllowed"] is False
    assert challenge["productionSemanticChangeAllowed"] is False
    assert deictic["schema"] == "mts-deictic-context-challenge/v0.5"
    assert challenge["schema"] not in MTS_V04.read_text(encoding="utf-8")
    assert challenge["schema"] not in PROOF_V03.read_text(encoding="utf-8")


def test_direct_scan_distinguishes_no_pronoun_current_and_parent_deixis():
    assert direct_pronouns(parse_formula("[] = []")) == ()
    assert direct_pronouns(parse_formula("◁ = a")) == (((0,), 0, "◁"),)
    assert direct_pronouns(parse_formula("↑◁ = a")) == (((0,), 1, "◁"),)

    vocabulary = read(CHALLENGE)["researchVocabulary"]
    assert "not a theorem" in vocabulary["noDirectDeictic"]


def test_no_pronoun_example_is_observably_invariant_only_on_declared_frames():
    first = replay("[] = []", ContextFrame(start=1, end=2))
    second = replay("[] = []", ContextFrame(start=900, end=901))

    assert result_shape(first) == result_shape(second)
    assert first.success is True
    boundary = read(CHALLENGE)["observableReplayBoundary"]
    assert boundary["finiteDomainInvarianceImpliesUniversalInvariance"] is False


def test_direct_deictic_example_has_explicit_context_sensitivity_counterexample():
    source = "◁ = a"
    symbols = {"a": 1}

    first = replay(source, ContextFrame(start=1, end=9), symbols=symbols)
    second = replay(source, ContextFrame(start=2, end=9), symbols=symbols)

    assert first.success is True
    assert second.success is False
    assert direct_pronouns(parse_formula(source))


def test_definition_chain_can_be_candidate_indirect_only_through_explicit_opening_graph():
    environment = DefinitionEnvironment()
    register(environment, "a : b")
    register(environment, "b : ◁")

    evidence = definition_dependency("a", environment)

    assert evidence.classification == "candidate-indirect-deictic"
    assert len(evidence.visited) == 2
    assert evidence.pronouns == (((), 0, "◁"),)
    boundary = read(CHALLENGE)["definitionDependencyBoundary"]
    assert boundary["automaticDefinitionReferenceSemanticsAccepted"] is False
    assert boundary["analysisMustUseExplicitOpening"] is True


def test_self_and_mutual_definition_cycles_terminate_by_definition_id():
    self_environment = DefinitionEnvironment()
    register(self_environment, "a : a")
    self_evidence = definition_dependency("a", self_environment)

    assert self_evidence.classification == "candidate-no-deictic-in-closure"
    assert len(self_evidence.visited) == 1
    assert self_evidence.cycle_seen is True

    mutual = DefinitionEnvironment()
    register(mutual, "a : b")
    register(mutual, "b : a")
    mutual_evidence = definition_dependency("a", mutual)

    assert mutual_evidence.classification == "candidate-no-deictic-in-closure"
    assert len(mutual_evidence.visited) == 2
    assert mutual_evidence.cycle_seen is True


def test_missing_initial_definition_is_unknown_not_invariant():
    evidence = definition_dependency("missing", DefinitionEnvironment())

    assert evidence.classification == "unknown"
    assert evidence.visited == ()
    assert evidence.pronouns == ()


def test_direct_effect_ignores_whitespace_and_source_span():
    compact = parse_formula("◁=a")
    spaced = parse_formula("  ◁   =   a  ")

    assert structural_key(compact) == structural_key(spaced)
    assert direct_pronouns(compact) == direct_pronouns(spaced)


def test_same_explicit_inputs_ignore_test_only_interpreter_labels():
    frame = ContextFrame(start=3, end=4)

    def run(_interpreter_link: int):
        return replay("{◁ = a, ▷ = b}", frame, symbols={"a": 3, "b": 4})

    assert result_shape(run(100)) == result_shape(run(200))

    boundary = read(CHALLENGE)["interpreterBoundary"]
    assert boundary["interpreterIsALink"] is True
    assert boundary["interpreterIdentityIsHiddenEvalInput"] is False


def test_analysis_is_read_only_and_current_runtime_has_no_policy_effect_input():
    environment = DefinitionEnvironment()
    register(environment, "a : b")
    register(environment, "b : ◁")
    before = environment.entries()

    evidence = definition_dependency("a", environment)
    after = environment.entries()

    assert evidence.classification == "candidate-indirect-deictic"
    assert before == after

    interpret_parameters = inspect.signature(interpret_constraints).parameters
    opening_parameters = inspect.signature(open_definition).parameters
    assert list(interpret_parameters) == ["expression", "frame", "memory", "symbols"]
    assert list(opening_parameters) == ["target", "environment"]
    for hidden in ("interpreter", "policy", "capability", "session"):
        assert hidden not in interpret_parameters
        assert hidden not in opening_parameters


def test_root_program_and_proof_surface_remain_unchanged():
    lines = [
        line.strip()
        for line in ROOT_PROGRAM.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    ]
    proof = read(PROOF_V03)
    challenge = read(CHALLENGE)

    assert len(lines) == 10
    assert "ContextInvariant" not in proof["trustedRelations"]
    assert "new trusted ContextInvariant proof relation before acceptance" in challenge["vetoes"]
    assert challenge["nextGate"]["artifact"] == "mts-context-dependency-decision/v0.5"
    assert challenge["nextGate"]["mustNotChangeProductionBeforeDecision"] is True
