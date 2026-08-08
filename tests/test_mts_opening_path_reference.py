"""Production conformance for accepted mts-opening-path/v0.4."""

import inspect
import json
from copy import deepcopy
from pathlib import Path

import pytest

from core.mtc_ast import Definition, Expression, Form, format_expression
from core.mtc_definitions import DefinitionEnvironment, DefinitionId
from core.mtc_opening_path import (
    OpeningPathEdge,
    OpeningPathFailure,
    OpeningPathWitness,
    verify_opening_path,
)
from core.mtc_parser import parse_formula


ROOT = Path(__file__).parents[1]
CONTRACT = ROOT / "contracts" / "mts-opening-path-v0.4.json"
CONFORMANCE = ROOT / "contracts" / "mts-opening-path-conformance-v0.4.json"
CHALLENGE_CORPUS = ROOT / "contracts" / "mts-opening-path-conformance-candidate-v0.4.json"
MTS_V04 = ROOT / "contracts" / "mts-contract-v0.4.json"
PROOF_V03 = ROOT / "contracts" / "mts-proof-v0.3.json"
CORE = ROOT / "core" / "mtc_opening_path.py"
ROOT_PROGRAM = ROOT / "tests" / "mtc_formulas.mtc"


def read(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def parse_form(source: str) -> Form:
    expression = parse_formula(source)
    if not isinstance(expression, Form):
        raise ValueError("expected Form")
    return expression


def parse_canonical_expression(source: str, label: str) -> Expression:
    expression = parse_formula(source)
    if format_expression(expression) != source:
        raise ValueError(f"{label} must use canonical format_expression transport")
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


def decode_portable_vector(vector: dict) -> tuple[OpeningPathWitness, DefinitionEnvironment]:
    """Strict conformance adapter; the core verifier remains transport-agnostic."""

    environments = build_environments(vector["scopes"])
    environment = environments[tuple(vector["lookupScope"])]
    edges: list[OpeningPathEdge] = []

    for index, edge in enumerate(vector["edges"]):
        expected_id = edge["definitionId"]
        edges.append(
            OpeningPathEdge(
                target=parse_form(edge["target"]),
                definition_id=DefinitionId(
                    tuple(expected_id["scopePath"]),
                    expected_id["ordinal"],
                ),
                body=parse_canonical_expression(edge["body"], f"edge[{index}].body"),
            )
        )

    return (
        OpeningPathWitness(
            start_target=parse_form(vector["startTarget"]),
            edges=tuple(edges),
            final_body=parse_canonical_expression(vector["finalBody"], "finalBody"),
        ),
        environment,
    )


def verify_portable(vector: dict) -> bool:
    try:
        witness, environment = decode_portable_vector(vector)
    except (KeyError, TypeError, ValueError):
        return False
    return verify_opening_path(witness, environment).accepted


def root_sources() -> tuple[str, ...]:
    return tuple(
        line.strip()
        for line in ROOT_PROGRAM.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    )


def test_contract_is_accepted_standalone_without_rewriting_v04_or_proof_v03():
    contract = read(CONTRACT)
    conformance = read(CONFORMANCE)

    assert contract["schema"] == "mts-opening-path/v0.4"
    assert contract["status"] == "accepted"
    assert contract["accepted"] is True
    assert conformance["schema"] == "mts-opening-path-conformance/v0.4"
    assert conformance["accepted"] is True
    assert conformance["contract"] == contract["schema"]
    assert contract["versioning"]["mtsContractV04Modified"] is False
    assert contract["versioning"]["mtsProofV03Modified"] is False
    assert contract["versioning"]["publishedThroughUmbrella"] is False
    assert contract["schema"] not in MTS_V04.read_text(encoding="utf-8")
    assert contract["schema"] not in PROOF_V03.read_text(encoding="utf-8")


def test_accepted_conformance_selects_all_green_challenge_vectors_without_copying():
    conformance = read(CONFORMANCE)
    corpus = read(CHALLENGE_CORPUS)

    assert conformance["sourceCorpus"] == (
        "contracts/mts-opening-path-conformance-candidate-v0.4.json"
    )
    assert conformance["selection"] == {"validPaths": "all", "invalidPaths": "all"}
    assert "validPaths" not in conformance
    assert "invalidPaths" not in conformance
    assert corpus["status"] == "candidate-challenge-corpus"


def test_every_challenged_valid_path_replays_in_canonical_production_verifier():
    for vector in read(CHALLENGE_CORPUS)["validPaths"]:
        assert verify_portable(vector), vector["id"]


def test_every_challenged_invalid_path_fails_closed():
    for vector in read(CHALLENGE_CORPUS)["invalidPaths"]:
        assert not verify_portable(vector), vector["id"]


def test_transport_requires_canonical_body_but_target_identity_remains_structural():
    vector = next(
        deepcopy(item)
        for item in read(CHALLENGE_CORPUS)["validPaths"]
        if item["id"] == "structural-adjacency-whitespace"
    )

    # Non-canonical whitespace in a target is explicitly allowed.
    assert vector["edges"][1]["target"] == "( b )"
    assert verify_portable(vector)

    # The expected body is deterministic replay output, so transport is canonical.
    vector["edges"][0]["body"] = "( b )"
    assert not verify_portable(vector)

    transport = read(CONTRACT)["portableCertificate"]
    assert "equivalent whitespace allowed" in transport["edges"]["target"]
    assert "canonical format_expression" in transport["edges"]["body"]


def test_typed_core_verifier_uses_structural_identity_not_display_text():
    vector = next(
        item
        for item in read(CHALLENGE_CORPUS)["validPaths"]
        if item["id"] == "structural-adjacency-whitespace"
    )
    witness, environment = decode_portable_vector(vector)

    # Rebuild the second target from equivalent source spelling; typed replay stays valid.
    rebuilt_edges = list(witness.edges)
    rebuilt_edges[1] = OpeningPathEdge(
        target=parse_form("(    b    )"),
        definition_id=rebuilt_edges[1].definition_id,
        body=rebuilt_edges[1].body,
    )
    rebuilt = OpeningPathWitness(
        start_target=witness.start_target,
        edges=tuple(rebuilt_edges),
        final_body=witness.final_body,
    )

    assert verify_opening_path(rebuilt, environment).accepted is True
    assert read(CONTRACT)["typedCore"]["comparison"].startswith("typed structural_key")


def test_failure_codes_are_deterministic_for_core_forgery_classes():
    environment = DefinitionEnvironment()
    registration_a = environment.register(parse_formula("a : b"))
    registration_b = environment.register(parse_formula("b : a"))
    assert registration_a.entry is not None
    assert registration_b.entry is not None

    edge_a = OpeningPathEdge(
        target=parse_form("a"),
        definition_id=registration_a.entry.identity,
        body=parse_formula("b"),
    )
    edge_b = OpeningPathEdge(
        target=parse_form("b"),
        definition_id=registration_b.entry.identity,
        body=parse_formula("a"),
    )

    cases = [
        (
            OpeningPathWitness(parse_form("a"), (), parse_formula("a")),
            OpeningPathFailure.EMPTY_PATH,
        ),
        (
            OpeningPathWitness(parse_form("x"), (edge_a,), parse_formula("b")),
            OpeningPathFailure.START_TARGET_MISMATCH,
        ),
        (
            OpeningPathWitness(
                parse_form("a"),
                (
                    edge_a,
                    OpeningPathEdge(
                        target=parse_form("x"),
                        definition_id=registration_b.entry.identity,
                        body=parse_formula("a"),
                    ),
                ),
                parse_formula("a"),
            ),
            OpeningPathFailure.ADJACENCY_MISMATCH,
        ),
        (
            OpeningPathWitness(
                parse_form("missing"),
                (
                    OpeningPathEdge(
                        target=parse_form("missing"),
                        definition_id=DefinitionId((), 0),
                        body=parse_formula("x"),
                    ),
                ),
                parse_formula("x"),
            ),
            OpeningPathFailure.OPENING_NOT_MATCH,
        ),
        (
            OpeningPathWitness(
                parse_form("a"),
                (
                    OpeningPathEdge(
                        target=parse_form("a"),
                        definition_id=DefinitionId((), 99),
                        body=parse_formula("b"),
                    ),
                ),
                parse_formula("b"),
            ),
            OpeningPathFailure.DEFINITION_ID_MISMATCH,
        ),
        (
            OpeningPathWitness(
                parse_form("a"),
                (
                    OpeningPathEdge(
                        target=parse_form("a"),
                        definition_id=registration_a.entry.identity,
                        body=parse_formula("wrong"),
                    ),
                ),
                parse_formula("wrong"),
            ),
            OpeningPathFailure.BODY_MISMATCH,
        ),
        (
            OpeningPathWitness(parse_form("a"), (edge_a,), parse_formula("wrong")),
            OpeningPathFailure.FINAL_BODY_MISMATCH,
        ),
    ]

    for witness, expected in cases:
        result = verify_opening_path(witness, environment)
        assert result.accepted is False
        assert result.failure is expected

    # A repeated DefinitionId is caught after both replayed edges have matched.
    recursive_environment = DefinitionEnvironment()
    recursive = recursive_environment.register(parse_formula("a : a"))
    assert recursive.entry is not None
    repeated_edge = OpeningPathEdge(
        target=parse_form("a"),
        definition_id=recursive.entry.identity,
        body=parse_formula("a"),
    )
    repeated = verify_opening_path(
        OpeningPathWitness(
            start_target=parse_form("a"),
            edges=(repeated_edge, repeated_edge),
            final_body=parse_formula("a"),
        ),
        recursive_environment,
    )
    assert repeated.accepted is False
    assert repeated.failure is OpeningPathFailure.REPEATED_DEFINITION_ID
    assert repeated.failed_edge == 1


def test_non_form_terminal_is_valid_but_cannot_have_a_following_edge():
    environment = DefinitionEnvironment()
    registration = environment.register(parse_formula("a : b = c"))
    assert registration.entry is not None

    terminal_edge = OpeningPathEdge(
        target=parse_form("a"),
        definition_id=registration.entry.identity,
        body=parse_formula("b = c"),
    )
    terminal = verify_opening_path(
        OpeningPathWitness(
            start_target=parse_form("a"),
            edges=(terminal_edge,),
            final_body=parse_formula("b = c"),
        ),
        environment,
    )
    assert terminal.accepted is True

    extra = OpeningPathEdge(
        target=parse_form("x"),
        definition_id=DefinitionId((), 99),
        body=parse_formula("y"),
    )
    continued = verify_opening_path(
        OpeningPathWitness(
            start_target=parse_form("a"),
            edges=(terminal_edge, extra),
            final_body=parse_formula("y"),
        ),
        environment,
    )
    assert continued.accepted is False
    assert continued.failure is OpeningPathFailure.PREVIOUS_BODY_NOT_FORM
    assert continued.failed_edge == 1


def test_verifier_is_read_only_and_has_no_context_memory_or_interpreter_input():
    environment = DefinitionEnvironment()
    first = environment.register(parse_formula("a : b"))
    second = environment.register(parse_formula("b : c"))
    assert first.entry is not None
    assert second.entry is not None

    before_entries = environment.entries()
    before_conflicts = environment.conflicts()
    witness = OpeningPathWitness(
        start_target=parse_form("a"),
        edges=(
            OpeningPathEdge(parse_form("a"), first.entry.identity, parse_formula("b")),
            OpeningPathEdge(parse_form("b"), second.entry.identity, parse_formula("c")),
        ),
        final_body=parse_formula("c"),
    )

    assert verify_opening_path(witness, environment).accepted is True
    assert environment.entries() == before_entries
    assert environment.conflicts() == before_conflicts

    signature = inspect.signature(verify_opening_path)
    assert list(signature.parameters) == ["witness", "environment"]
    core_source = CORE.read_text(encoding="utf-8")
    for forbidden in ("MemoryView", "ContextFrame", "interpret_constraints", "realize", "delete"):
        assert forbidden not in core_source


def test_relation_never_claims_equality_normalization_or_generic_composition():
    meaning = read(CONTRACT)["meaningBoundary"]
    proof = read(CONTRACT)["proofBoundary"]

    assert meaning["impliesEquality"] is False
    assert meaning["impliesEquivalence"] is False
    assert meaning["impliesNormalization"] is False
    assert meaning["impliesContextualSatisfaction"] is False
    assert meaning["impliesGenericTransitivity"] is False
    assert meaning["evaluatesBodies"] is False
    assert proof["trustedProofRelationAddedByThisContract"] is False
    assert proof["genericCompositionAccepted"] is False
    assert proof["openingPathPlusContextuallySatisfiesAccepted"] is False


def test_root_program_remains_exactly_ten_and_replay_does_not_mutate_it():
    before = root_sources()
    assert len(before) == 10

    environment = DefinitionEnvironment()
    entries = []
    for source in before:
        registration = environment.register(parse_formula(source))
        assert registration.entry is not None
        entries.append(registration.entry)

    # Each canonical root definition remains a valid one-edge certificate.
    for entry in entries:
        result = verify_opening_path(
            OpeningPathWitness(
                start_target=entry.definition.target,
                edges=(
                    OpeningPathEdge(
                        target=entry.definition.target,
                        definition_id=entry.identity,
                        body=entry.definition.value,
                    ),
                ),
                final_body=entry.definition.value,
            ),
            environment,
        )
        assert result.accepted is True

    assert root_sources() == before
    assert len(environment.entries()) == 10


def test_public_failure_code_surface_matches_contract_exactly():
    expected = set(read(CONTRACT)["failureCodes"])
    actual = {item.value for item in OpeningPathFailure}
    assert actual == expected


def test_transport_adapter_rejects_noncanonical_final_body_even_when_structurally_equal():
    vector = next(
        deepcopy(item)
        for item in read(CHALLENGE_CORPUS)["validPaths"]
        if item["id"] == "structural-adjacency-whitespace"
    )
    assert vector["finalBody"] == "c"

    # Parentheses change structure, so instead use canonical-whitespace variance on a bundle.
    bundle = next(
        deepcopy(item)
        for item in read(CHALLENGE_CORPUS)["validPaths"]
        if item["id"] == "ends-in-constraint-bundle"
    )
    bundle["finalBody"] = "{ ◁ = x, ▷ = y }"
    assert not verify_portable(bundle)


@pytest.mark.parametrize(
    "source",
    ["a : b", "a : b = c", "a : {◁ = x}"],
)
def test_definition_registration_substrate_is_not_reinterpreted(source: str):
    environment = DefinitionEnvironment()
    definition = parse_formula(source)
    assert isinstance(definition, Definition)
    result = environment.register(definition)
    assert result.entry is not None
    assert environment.entries() == (result.entry,)
