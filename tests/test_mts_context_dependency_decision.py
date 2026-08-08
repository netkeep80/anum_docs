"""Executable checks for the non-normative context-dependency decision v0.5."""

import inspect
import json
from pathlib import Path

from core.mtc_ast import ContextPronoun, Expression, Form, structural_key
from core.mtc_definitions import DefinitionEnvironment, open_definition
from core.mtc_interpreter import ContextFrame, MemoryView, interpret_constraints
from core.mtc_parser import parse_formula


ROOT = Path(__file__).parents[1]
DECISION = ROOT / "contracts" / "mts-context-dependency-decision-v0.5.json"
CHALLENGE = ROOT / "contracts" / "mts-context-dependency-challenge-v0.5.json"
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


def direct_pronouns(expression: Expression, path: tuple[int, ...] = ()):
    """Decision-local structural walker; not a production operation yet."""

    if isinstance(expression, ContextPronoun):
        return ((path, expression.up, expression.pole.value),)

    children: tuple[Expression, ...]
    if hasattr(expression, "content"):
        content = getattr(expression, "content")
        children = () if content is None else (content,)
    elif hasattr(expression, "items"):
        children = tuple(getattr(expression, "items"))
    elif hasattr(expression, "value") and not hasattr(expression, "target"):
        children = (getattr(expression, "value"),)
    elif hasattr(expression, "left") and hasattr(expression, "right"):
        children = (getattr(expression, "left"), getattr(expression, "right"))
    elif hasattr(expression, "target") and hasattr(expression, "value"):
        children = (getattr(expression, "target"), getattr(expression, "value"))
    else:
        children = ()

    found = []
    for index, child in enumerate(children):
        if isinstance(child, Expression):
            found.extend(direct_pronouns(child, path + (index,)))
    return tuple(found)


def replay(source: str, frame: ContextFrame, *, symbols: dict[str, int] | None = None):
    return interpret_constraints(
        parse_formula(source),
        frame,
        NoReadMemory(),
        symbols=symbols,
    )


def result_shape(result):
    return result.success, result.holes, result.aliases


def test_decision_is_non_normative_and_depends_on_green_challenge():
    decision = read(DECISION)
    challenge = read(CHALLENGE)

    assert decision["schema"] == "mts-context-dependency-decision/v0.5"
    assert decision["status"] == "candidate-decision"
    assert decision["acceptedContractLinkAllowed"] is False
    assert decision["productionSemanticChangeAllowed"] is False
    assert decision["trustedProofChangeAllowed"] is False
    assert challenge["schema"] in decision["dependsOn"]
    assert decision["schema"] not in MTS_V04.read_text(encoding="utf-8")
    assert decision["schema"] not in PROOF_V03.read_text(encoding="utf-8")


def test_only_typed_direct_deixis_is_selected_as_next_production_candidate():
    decision = read(DECISION)
    models = {model["id"]: model for model in decision["models"]}

    assert models["A"]["verdict"] == "reject"
    assert models["B"]["verdict"] == "reject"
    assert models["C"]["verdict"] == "preferred-candidate"
    assert models["D"]["verdict"] == "reject"
    assert models["E"]["verdict"] == "defer"
    assert all(model["accepted"] is False for model in models.values())

    candidate = decision["productionCandidateForNextGate"]
    assert candidate["scope"] == "read-only direct typed-AST deictic analysis only"
    assert candidate["mayReturnUniversalContextInvariant"] is False
    assert candidate["mayTraverseDefinitionEnvironment"] is False
    assert candidate["mayReadMemory"] is False
    assert candidate["mayReadInterpreterIdentity"] is False


def test_no_direct_pronoun_is_not_promoted_to_context_invariant():
    expression = parse_formula("[] = []")
    assert direct_pronouns(expression) == ()

    direct = read(DECISION)["preferredCandidate"]["directAnalysis"]
    assert direct["negationImpliesUniversalInvariance"] is False
    assert direct["impliesContextSensitivity"] is False

    replay_a = replay("[] = []", ContextFrame(start=1, end=2))
    replay_b = replay("[] = []", ContextFrame(start=9, end=10))
    assert result_shape(replay_a) == result_shape(replay_b)

    evidence = read(DECISION)["preferredCandidate"]["replayEvidence"]
    assert evidence["universalInvarianceAccepted"] is False


def test_direct_pronoun_fact_is_structural_and_does_not_itself_prove_sensitivity():
    compact = parse_formula("◁=a")
    spaced = parse_formula("  ◁ = a  ")

    assert structural_key(compact) == structural_key(spaced)
    assert direct_pronouns(compact) == (((0,), 0, "◁"),)
    assert direct_pronouns(compact) == direct_pronouns(spaced)

    direct = read(DECISION)["preferredCandidate"]["directAnalysis"]
    assert direct["sourceSpanPartOfIdentity"] is False
    assert direct["displayTextPartOfIdentity"] is False
    assert direct["impliesContextSensitivity"] is False


def test_context_sensitivity_requires_explicit_semantic_counterexample():
    matching = replay("◁ = a", ContextFrame(start=1, end=7), symbols={"a": 1})
    different = replay("◁ = a", ContextFrame(start=2, end=7), symbols={"a": 1})

    assert matching.success is True
    assert different.success is False

    evidence = read(DECISION)["preferredCandidate"]["replayEvidence"]
    assert "different canonical replay result" in evidence["sensitivity"]


def test_definition_opening_remains_separate_from_current_eval_dependency():
    environment = DefinitionEnvironment()
    definition = parse_formula("a : ◁")
    assert hasattr(definition, "target")
    registration = environment.register(definition)
    assert registration.entry is not None

    target = parse_formula("a")
    assert isinstance(target, Form)
    opened = open_definition(target, environment)
    assert opened.body is not None
    assert direct_pronouns(opened.body) == (((), 0, "◁"),)

    boundary = read(DECISION)["definitionBoundary"]
    assert boundary["candidateDependencyGraphUsesCanonicalOpening"] is True
    assert boundary["graphTraversalIsCurrentInterpretSemantics"] is False
    assert boundary["openingImpliesEvaluation"] is False
    assert boundary["openingImpliesEquality"] is False
    assert boundary["normativeIndirectDependencyAcceptedHere"] is False


def test_unknown_is_required_instead_of_optimistic_classification():
    unknown = read(DECISION)["preferredCandidate"]["unknown"]

    assert unknown["mustNotBeCollapsedIntoInvariant"] is True
    assert unknown["mustNotBeCollapsedIntoSensitive"] is True
    assert len(unknown["requiredWhen"]) >= 3


def test_interpreter_is_a_link_but_not_a_hidden_eval_parameter():
    boundary = read(DECISION)["interpreterBoundary"]
    parameters = inspect.signature(interpret_constraints).parameters

    assert boundary["interpreterIsALink"] is True
    assert boundary["interpreterLinkIdentityIsImplicitEvalInput"] is False
    assert boundary["explicitContextFrameIsCurrentSemanticBoundary"] is True
    assert boundary["separateSubjectConceptRequired"] is False
    assert list(parameters) == ["expression", "frame", "memory", "symbols"]
    assert "interpreter" not in parameters


def test_proof_surface_and_root_program_stay_unchanged():
    decision = read(DECISION)
    proof = read(PROOF_V03)
    lines = [
        line.strip()
        for line in ROOT_PROGRAM.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    ]

    assert len(lines) == 10
    assert "ContextInvariant" not in proof["trustedRelations"]
    assert "DirectDeictic" not in proof["trustedRelations"]
    assert decision["proofBoundary"]["ContextInvariantTrustedRelationAccepted"] is False
    assert decision["proofBoundary"]["DirectDeicticTrustedRelationAccepted"] is False
    assert decision["proofBoundary"]["proofV03Modified"] is False


def test_next_gate_is_direct_deixis_challenge_not_generic_dependency_production():
    gate = read(DECISION)["nextGate"]

    assert gate["artifact"] == "mts-direct-deixis-challenge/v0.5"
    assert gate["mustNotChangeInterpretSemantics"] is True
    assert gate["mustNotChangeProofSemantics"] is True
    assert "deterministic ordering of multiple pronouns" in gate["requiredQuestions"]
    assert "portable conformance vectors for zero/one/multiple/current/parent pronouns" in gate["requiredQuestions"]
