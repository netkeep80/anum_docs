"""Executable evidence for the non-normative direct-deixis challenge v0.5."""

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
    Inequality,
    Inversion,
    LinkForm,
    Literal,
    RoundForm,
    Sequence,
    SquareForm,
    StartProjection,
    Symbol,
    structural_key,
)
from core.mtc_definitions import DefinitionEnvironment
from core.mtc_interpreter import ContextFrame, MemoryView, interpret_constraints
from core.mtc_parser import parse_formula


ROOT = Path(__file__).parents[1]
CHALLENGE = ROOT / "contracts" / "mts-direct-deixis-challenge-v0.5.json"
CORPUS = ROOT / "contracts" / "mts-direct-deixis-conformance-candidate-v0.5.json"
DECISION = ROOT / "contracts" / "mts-context-dependency-decision-v0.5.json"
MTS_V04 = ROOT / "contracts" / "mts-contract-v0.4.json"
PROOF_V03 = ROOT / "contracts" / "mts-proof-v0.3.json"
ROOT_PROGRAM = ROOT / "tests" / "mtc_formulas.mtc"


def read(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


@dataclass(frozen=True, order=True)
class CandidateOccurrence:
    path: tuple[int, ...]
    up: int
    pole: str


def children(expression: Expression) -> tuple[Expression, ...]:
    if isinstance(expression, (Symbol, Literal, ContextPronoun)):
        return ()
    if isinstance(expression, (RoundForm, SquareForm)):
        return () if expression.content is None else (expression.content,)
    if isinstance(expression, (BundleForm, Sequence)):
        return expression.items
    if isinstance(expression, (StartProjection, EndProjection, Inversion)):
        return (expression.value,)
    if isinstance(expression, (LinkForm, Equality, Inequality)):
        return (expression.left, expression.right)
    if isinstance(expression, Definition):
        return (expression.target, expression.value)
    raise TypeError(f"unsupported typed AST node: {type(expression).__name__}")


def candidate_analyze(
    expression: Expression,
    path: tuple[int, ...] = (),
) -> tuple[CandidateOccurrence, ...]:
    if isinstance(expression, ContextPronoun):
        return (CandidateOccurrence(path, expression.up, expression.pole.value),)

    result: list[CandidateOccurrence] = []
    for index, child in enumerate(children(expression)):
        result.extend(candidate_analyze(child, path + (index,)))
    return tuple(result)


def portable(occurrences: tuple[CandidateOccurrence, ...]) -> list[dict]:
    return [
        {"path": list(item.path), "up": item.up, "pole": item.pole}
        for item in occurrences
    ]


class NoReadMemory(MemoryView):
    def poles(self, link: int) -> tuple[int, int]:
        raise AssertionError(f"unexpected poles({link})")

    def find_link(self, start: int, end: int) -> int | None:
        raise AssertionError(f"unexpected find_link({start}, {end})")

    def find_start_projection(self, form: int) -> int | None:
        raise AssertionError(f"unexpected find_start_projection({form})")

    def find_end_projection(self, form: int) -> int | None:
        raise AssertionError(f"unexpected find_end_projection({form})")


def replay(source: str, frame: ContextFrame):
    return interpret_constraints(parse_formula(source), frame, NoReadMemory())


def semantic_shape(result):
    return result.success, result.holes, result.aliases


def root_sources() -> tuple[str, ...]:
    return tuple(
        line.strip()
        for line in ROOT_PROGRAM.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    )


def test_challenge_is_non_normative_and_follows_dependency_decision():
    challenge = read(CHALLENGE)
    corpus = read(CORPUS)
    decision = read(DECISION)

    assert challenge["schema"] == "mts-direct-deixis-challenge/v0.5"
    assert challenge["status"] == "candidate-challenge"
    assert challenge["acceptedContractLinkAllowed"] is False
    assert challenge["productionAnalysisChangeAllowed"] is False
    assert challenge["interpretSemanticChangeAllowed"] is False
    assert challenge["proofSemanticChangeAllowed"] is False
    assert decision["schema"] in challenge["dependsOn"]
    assert corpus["contract"] == challenge["schema"]
    assert challenge["schema"] not in MTS_V04.read_text(encoding="utf-8")
    assert challenge["schema"] not in PROOF_V03.read_text(encoding="utf-8")


def test_every_portable_vector_has_exact_structural_occurrences():
    corpus = read(CORPUS)

    for vector in corpus["vectors"]:
        expression = parse_formula(vector["source"])
        assert portable(candidate_analyze(expression)) == vector["expected"], vector["id"]


def test_equivalent_whitespace_spellings_keep_structure_and_occurrences():
    for vector in read(CORPUS)["equivalentSpellings"]:
        parsed = [parse_formula(source) for source in vector["sources"]]
        keys = [structural_key(expression) for expression in parsed]
        observed = [portable(candidate_analyze(expression)) for expression in parsed]

        assert all(key == keys[0] for key in keys), vector["id"]
        assert all(value == vector["expected"] for value in observed), vector["id"]


def test_grouping_is_a_real_typed_occurrence_path_step():
    expression = parse_formula("((↑↑◁)) = a")
    occurrence = candidate_analyze(expression)

    assert occurrence == (CandidateOccurrence((0, 0, 0), 2, "◁"),)
    path_model = read(CHALLENGE)["pathModel"]
    assert path_model["groupingTransparent"] is False
    assert path_model["roundOrSquareContent"] == "append 0"


def test_definition_analysis_traverses_target_and_body_without_opening_environment():
    expression = parse_formula("◁ : {▷ = a, ↑◁ = b}")
    environment = DefinitionEnvironment()
    before = environment.entries()

    observed = candidate_analyze(expression)

    assert observed == (
        CandidateOccurrence((0,), 0, "◁"),
        CandidateOccurrence((1, 0, 0), 0, "▷"),
        CandidateOccurrence((1, 1, 0), 1, "◁"),
    )
    assert environment.entries() == before == ()
    boundary = read(CHALLENGE)["semanticBoundary"]
    assert boundary["opensDefinitions"] is False


def test_multiple_occurrences_are_preorder_and_lexicographically_deterministic():
    occurrences = candidate_analyze(parse_formula("{◁ = a, ↑▷ = b, ▷ = c}"))

    assert occurrences == tuple(sorted(occurrences))
    assert [item.path for item in occurrences] == [(0, 0), (1, 0), (2, 0)]
    assert read(CHALLENGE)["operationCandidate"]["ordering"] == (
        "preorder / lexicographic structural path"
    )


def test_same_glyph_at_distinct_paths_is_not_one_occurrence():
    occurrences = candidate_analyze(parse_formula("◁ = ◁"))

    assert occurrences == (
        CandidateOccurrence((0,), 0, "◁"),
        CandidateOccurrence((1,), 0, "◁"),
    )
    identity = read(CHALLENGE)["identityBoundary"]
    assert identity["sameGlyphAtDifferentPathsIsSameOccurrence"] is False


def test_direct_presence_does_not_imply_context_sensitivity():
    source = "◁ = ◁"
    assert len(candidate_analyze(parse_formula(source))) == 2

    first = replay(source, ContextFrame(start=1, end=2))
    second = replay(source, ContextFrame(start=999, end=1000))

    assert semantic_shape(first) == semantic_shape(second)
    assert first.success is True
    assert read(CHALLENGE)["semanticBoundary"]["presenceImpliesContextSensitivity"] is False


def test_empty_direct_result_does_not_claim_context_invariance():
    assert candidate_analyze(parse_formula("[] = []")) == ()
    assert read(CHALLENGE)["semanticBoundary"]["absenceImpliesContextInvariance"] is False
    forbidden = {item["forbiddenConclusion"] for item in read(CORPUS)["negativeClaims"]}
    assert {"ContextInvariant", "ContextSensitive"} == forbidden


def test_candidate_operation_requires_only_typed_expression():
    signature = inspect.signature(candidate_analyze)
    assert list(signature.parameters) == ["expression", "path"]

    boundary = read(CHALLENGE)["semanticBoundary"]
    assert boundary["readsMemory"] is False
    assert boundary["readsInterpreterIdentity"] is False
    assert boundary["readsSecurityPolicy"] is False
    assert boundary["changesContextFrame"] is False


def test_root_program_scan_is_deterministic_and_does_not_change_roots():
    sources_before = root_sources()
    first = tuple(candidate_analyze(parse_formula(source)) for source in sources_before)
    second = tuple(candidate_analyze(parse_formula(source)) for source in sources_before)
    sources_after = root_sources()

    assert len(sources_before) == 10
    assert sources_before == sources_after
    assert first == second
    assert any(occurrences for occurrences in first)


def test_release_gate_requires_separate_contract_before_production():
    gate = read(CHALLENGE)["releaseGate"]

    assert gate["candidateProductionOperationAllowedAfterChallenge"] is True
    assert gate["requiresLanguageNeutralCorpus"] is True
    assert gate["requiresSingleCanonicalImplementation"] is True
    assert gate["requiresSeparateAcceptedContract"] is True
    assert gate["requiresProofContractChange"] is False
    assert gate["requiresInterpretContractChange"] is False
