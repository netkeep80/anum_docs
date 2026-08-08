"""Executable evidence for the non-normative DefinitionOpeningPath challenge v0.4."""

import inspect
import json
from pathlib import Path

from core.mtc_ast import Definition, Expression, Form, format_expression, structural_key
from core.mtc_definitions import (
    DefinitionEnvironment,
    DefinitionId,
    DefinitionLookupKind,
    open_definition,
)
from core.mtc_parser import parse_formula


ROOT = Path(__file__).parents[1]
CHALLENGE = ROOT / "contracts" / "mts-opening-path-challenge-v0.4.json"
CORPUS = ROOT / "contracts" / "mts-opening-path-conformance-candidate-v0.4.json"
PROOF_V03 = ROOT / "contracts" / "mts-proof-v0.3.json"
ROOT_PROGRAM = ROOT / "tests" / "mtc_formulas.mtc"


def read(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def parse_form(source: str) -> Form:
    expression = parse_formula(source)
    if not isinstance(expression, Form):
        raise ValueError("expected Form")
    return expression


def build_environments(scopes: list[dict]) -> dict[tuple[int, ...], DefinitionEnvironment]:
    environments: dict[tuple[int, ...], DefinitionEnvironment] = {}

    for index, spec in enumerate(scopes):
        path = tuple(spec["path"])
        parent_path = None if spec["parent"] is None else tuple(spec["parent"])
        if parent_path is None:
            if index != 0 or path != ():
                raise ValueError("root scope must be first")
            environment = DefinitionEnvironment()
        else:
            parent = environments[parent_path]
            if not path or path[:-1] != parent_path:
                raise ValueError("scope must extend parent")
            environment = parent.child(path[-1])

        if path in environments:
            raise ValueError("duplicate scope")
        environments[path] = environment

        for source in spec["definitions"]:
            definition = parse_formula(source)
            if not isinstance(definition, Definition):
                raise ValueError("scope entry must be Definition")
            environment.register(definition)

    return environments


def same_form(left: Form, right: Form) -> bool:
    return structural_key(left) == structural_key(right)


def verify_candidate_path(vector: dict) -> bool:
    """Challenge-only verifier; production proof semantics is intentionally untouched."""

    try:
        environments = build_environments(vector["scopes"])
        lookup = environments[tuple(vector["lookupScope"])]
        start = parse_form(vector["startTarget"])
        edges = vector["edges"]
        if not edges:
            return False

        previous_body: Expression | None = None
        used_ids: set[DefinitionId] = set()

        for index, edge in enumerate(edges):
            target = parse_form(edge["target"])
            if index == 0:
                if not same_form(target, start):
                    return False
            else:
                if not isinstance(previous_body, Form):
                    return False
                if not same_form(target, previous_body):
                    return False

            opened = open_definition(target, lookup)
            if opened.kind is not DefinitionLookupKind.MATCH:
                return False
            if opened.definition_id is None or opened.body is None:
                return False

            expected_id = edge["definitionId"]
            if opened.definition_id.scope_path != tuple(expected_id["scopePath"]):
                return False
            if opened.definition_id.ordinal != expected_id["ordinal"]:
                return False
            if opened.definition_id in used_ids:
                return False
            used_ids.add(opened.definition_id)

            if format_expression(opened.body) != edge["body"]:
                return False
            previous_body = opened.body

        assert previous_body is not None
        return format_expression(previous_body) == vector["finalBody"]
    except (KeyError, TypeError, ValueError):
        return False


def root_sources() -> tuple[str, ...]:
    return tuple(
        line.strip()
        for line in ROOT_PROGRAM.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    )


def test_challenge_is_non_normative_and_proof_v03_is_unchanged():
    challenge = read(CHALLENGE)
    proof = read(PROOF_V03)

    assert challenge["schema"] == "mts-opening-path-challenge/v0.4"
    assert challenge["status"] == "candidate-challenge"
    assert challenge["acceptedContractLinkAllowed"] is False
    assert challenge["productionProofChangeAllowed"] is False
    assert challenge["trustedRuleChangeAllowed"] is False
    assert challenge["schema"] not in PROOF_V03.read_text(encoding="utf-8")
    assert proof["compositionBoundary"]["genericCompositionAccepted"] is False


def test_all_valid_portable_paths_verify_by_independent_one_step_replay():
    for vector in read(CORPUS)["validPaths"]:
        assert verify_candidate_path(vector), vector["id"]


def test_all_invalid_portable_paths_fail_closed():
    for vector in read(CORPUS)["invalidPaths"]:
        assert not verify_candidate_path(vector), vector["id"]


def test_self_and_mutual_cycles_are_finite_without_reusing_definition_id():
    vectors = {item["id"]: item for item in read(CORPUS)["validPaths"]}

    self_path = vectors["self-cycle-one-edge"]
    mutual = vectors["mutual-cycle-two-edges"]

    assert verify_candidate_path(self_path)
    assert len(self_path["edges"]) == 1
    assert self_path["startTarget"] == self_path["finalBody"] == "a"

    assert verify_candidate_path(mutual)
    assert len(mutual["edges"]) == 2
    ids = [
        (tuple(edge["definitionId"]["scopePath"]), edge["definitionId"]["ordinal"])
        for edge in mutual["edges"]
    ]
    assert len(ids) == len(set(ids)) == 2
    assert mutual["startTarget"] == mutual["finalBody"] == "a"

    boundary = read(CHALLENGE)["cycleBoundary"]
    assert boundary["definitionIdMayAppearAtMostOnce"] is True
    assert boundary["repeatedDefinitionIdRejected"] is True


def test_checker_replays_exactly_serialized_edges_and_never_auto_normalizes():
    challenge = read(CHALLENGE)
    boundary = challenge["checkerBoundary"]

    assert boundary["replaysExactlySerializedEdgeCount"] is True
    assert boundary["autoContinuesUntilTerminal"] is False
    assert boundary["trustsSerializedDefinitionId"] is False
    assert boundary["trustsSerializedBody"] is False
    assert boundary["replaysEveryEdgeWithCanonicalOpenDefinition"] is True

    one_edge = next(
        item for item in read(CORPUS)["validPaths"] if item["id"] == "one-edge"
    )
    assert verify_candidate_path(one_edge)
    assert len(one_edge["edges"]) == 1


def test_structural_adjacency_ignores_whitespace_but_preserves_grouping_identity():
    vector = next(
        item
        for item in read(CORPUS)["validPaths"]
        if item["id"] == "structural-adjacency-whitespace"
    )

    assert verify_candidate_path(vector)
    first_body = parse_formula(vector["edges"][0]["body"])
    second_target = parse_formula(vector["edges"][1]["target"])
    assert structural_key(first_body) == structural_key(second_target)
    assert format_expression(second_target) == "(b)"

    challenge = read(CHALLENGE)
    assert challenge["adjacency"]["canonicalDisplayTextIsIdentity"] is False
    assert challenge["transportBoundary"]["targetSourceMayUseEquivalentWhitespace"] is True


def test_child_scope_is_shared_for_every_edge():
    vector = next(
        item for item in read(CORPUS)["validPaths"] if item["id"] == "child-shadowing"
    )

    assert verify_candidate_path(vector)
    assert vector["lookupScope"] == [0]
    assert [edge["definitionId"]["scopePath"] for edge in vector["edges"]] == [[0], [0]]

    relation = read(CHALLENGE)["candidateRelation"]
    assert relation["sharedEnvironment"] is True
    assert relation["sharedLookupScope"] is True
    assert relation["environmentSwitchPerEdgeRepresentable"] is False


def test_chain_may_end_in_bundle_without_evaluating_it():
    vector = next(
        item
        for item in read(CORPUS)["validPaths"]
        if item["id"] == "ends-in-constraint-bundle"
    )

    assert verify_candidate_path(vector)
    assert vector["finalBody"] == "{◁ = x, ▷ = y}"

    final = read(CHALLENGE)["finalBody"]
    assert final["mayBeNonFormExpression"] is True
    assert final["automaticallyEvaluated"] is False
    assert final["automaticallyContextuallySatisfied"] is False


def test_candidate_verifier_has_no_memory_context_or_effect_input():
    signature = inspect.signature(verify_candidate_path)
    opening_signature = inspect.signature(open_definition)

    assert list(signature.parameters) == ["vector"]
    assert list(opening_signature.parameters) == ["target", "environment"]

    meaning = read(CHALLENGE)["meaningBoundary"]
    assert meaning["readsMemory"] is False
    assert meaning["readsContextFrame"] is False
    assert meaning["materializes"] is False
    assert meaning["deletes"] is False


def test_path_never_claims_equality_equivalence_or_normal_form():
    meaning = read(CHALLENGE)["meaningBoundary"]

    assert meaning["impliesEquality"] is False
    assert meaning["impliesEquivalence"] is False
    assert meaning["impliesTransitiveEquality"] is False
    assert meaning["impliesGlobalRewrite"] is False
    assert meaning["impliesNormalization"] is False
    assert meaning["evaluatesAnyBody"] is False


def test_root_program_and_canonical_opening_api_remain_unchanged():
    before = root_sources()
    assert len(before) == 10

    environments = build_environments(
        [{"path": [], "parent": None, "definitions": list(before)}]
    )
    root = environments[()]
    entries_before = root.entries()

    # Read-only challenge activity must not mutate the environment.
    for entry in entries_before:
        result = open_definition(entry.definition.target, root)
        assert result.kind is DefinitionLookupKind.MATCH

    assert root.entries() == entries_before
    assert root_sources() == before
