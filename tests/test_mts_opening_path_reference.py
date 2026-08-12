"""Production conformance for self-contained accepted mts-opening-path/v0.4."""

import inspect
import json
from copy import deepcopy
from pathlib import Path

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
MTS_CONTRACT = ROOT / "contracts" / "mts-contract-v0.6.json"
MTS_CONFORMANCE = ROOT / "contracts" / "mts-conformance-v0.6.json"
CORE = ROOT / "core" / "mtc_opening_path.py"
ROOT_PROGRAM = ROOT / "tests" / "mtc_formulas.mtc"


def read(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def _contract() -> dict:
    return read(MTS_CONTRACT)["surfaces"]["openingPath"]


def _conformance() -> dict:
    return read(MTS_CONFORMANCE)["corpora"]["openingPath"]


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


def decode_portable(vector: dict) -> tuple[OpeningPathWitness, DefinitionEnvironment]:
    environments = build_environments(vector["scopes"])
    environment = environments[tuple(vector["lookupScope"])]
    edges: list[OpeningPathEdge] = []

    for index, edge in enumerate(vector["edges"]):
        definition_id = edge["definitionId"]
        edges.append(
            OpeningPathEdge(
                target=parse_form(edge["target"]),
                definition_id=DefinitionId(
                    tuple(definition_id["scopePath"]),
                    definition_id["ordinal"],
                ),
                body=parse_canonical_expression(edge["body"], f"edge[{index}].body"),
            )
        )

    witness = OpeningPathWitness(
        start_target=parse_form(vector["startTarget"]),
        edges=tuple(edges),
        final_body=parse_canonical_expression(vector["finalBody"], "finalBody"),
    )
    return witness, environment


def verify_portable(vector: dict) -> bool:
    try:
        witness, environment = decode_portable(vector)
    except (KeyError, TypeError, ValueError):
        return False
    return verify_opening_path(witness, environment).accepted


def root_sources() -> tuple[str, ...]:
    return tuple(
        line.strip()
        for line in ROOT_PROGRAM.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    )


def test_contract_is_accepted_self_contained_and_has_only_real_dependency():
    contract = _contract()
    conformance = _conformance()

    assert contract["schema"] == "mts-opening-path/v0.4"
    assert contract["status"] == "accepted"
    assert contract["accepted"] is True
    assert contract["dependsOn"] == ["mts-definition-opening/v0.3"]
    serialized = json.dumps(contract, ensure_ascii=False)
    assert "mts-contract/v0." not in serialized
    assert "mts-proof/v0." not in serialized
    assert "versioning" not in contract
    assert conformance["schema"] == "mts-opening-path-conformance/v0.4"
    assert conformance["accepted"] is True
    assert conformance["contract"] == contract["schema"]
    assert contract["conformanceKey"] == "openingPath"


def test_accepted_conformance_owns_complete_vector_corpus():
    conformance = _conformance()

    assert conformance["validPaths"]
    assert conformance["invalidPaths"]
    assert {item["id"] for item in conformance["validPaths"]} == {
        "one-edge",
        "ends-in-non-form-judgment",
        "two-edge",
        "ends-in-constraint-bundle",
        "child-shadowing",
        "self-cycle-one-edge",
        "mutual-cycle-two-edges",
        "structural-adjacency-whitespace",
    }
    assert {item["id"] for item in conformance["invalidPaths"]} == {
        "zero-edge",
        "repeated-definition-id",
        "forged-body",
        "forged-definition-id",
        "next-target-mismatch",
        "start-target-mismatch",
        "continue-after-non-form",
        "continue-after-non-addressable-form",
        "no-match-edge",
        "conflict-edge",
        "non-addressable-edge",
        "forged-final-body",
    }


def test_every_accepted_vector_replays_fail_closed_in_production():
    conformance = _conformance()

    for vector in conformance["validPaths"]:
        assert verify_portable(vector), vector["id"]
    for vector in conformance["invalidPaths"]:
        assert not verify_portable(vector), vector["id"]


def test_transport_is_canonical_for_bodies_but_structural_for_targets():
    conformance = _conformance()
    vector = next(
        deepcopy(item)
        for item in conformance["validPaths"]
        if item["id"] == "structural-adjacency-whitespace"
    )

    assert vector["edges"][1]["target"] == "( b )"
    assert verify_portable(vector)

    witness, environment = decode_portable(vector)
    edges = list(witness.edges)
    edges[1] = OpeningPathEdge(
        target=parse_form("(    b    )"),
        definition_id=edges[1].definition_id,
        body=edges[1].body,
    )
    structural_variant = OpeningPathWitness(
        start_target=witness.start_target,
        edges=tuple(edges),
        final_body=witness.final_body,
    )
    assert verify_opening_path(structural_variant, environment).accepted is True

    vector["edges"][0]["body"] = "( b )"
    assert not verify_portable(vector)

    bundle = next(
        deepcopy(item)
        for item in conformance["validPaths"]
        if item["id"] == "ends-in-constraint-bundle"
    )
    bundle["finalBody"] = "{ ◁ = x, ▷ = y }"
    assert not verify_portable(bundle)

    transport = _contract()["portableCertificate"]
    assert "equivalent whitespace allowed" in transport["edges"]["target"]
    assert "canonical format_expression" in transport["edges"]["body"]


def test_failure_surface_and_representative_core_failures_are_deterministic():
    expected_codes = set(_contract()["failureCodes"])
    assert {item.value for item in OpeningPathFailure} == expected_codes

    environment = DefinitionEnvironment()
    registered = environment.register(parse_formula("a : b"))
    assert registered.entry is not None
    edge = OpeningPathEdge(
        target=parse_form("a"),
        definition_id=registered.entry.identity,
        body=parse_formula("b"),
    )

    cases = [
        (
            OpeningPathWitness(parse_form("a"), (), parse_formula("a")),
            OpeningPathFailure.EMPTY_PATH,
        ),
        (
            OpeningPathWitness(parse_form("x"), (edge,), parse_formula("b")),
            OpeningPathFailure.START_TARGET_MISMATCH,
        ),
        (
            OpeningPathWitness(
                parse_form("a"),
                (
                    OpeningPathEdge(
                        parse_form("a"),
                        DefinitionId((), 99),
                        parse_formula("b"),
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
                        parse_form("a"),
                        registered.entry.identity,
                        parse_formula("wrong"),
                    ),
                ),
                parse_formula("wrong"),
            ),
            OpeningPathFailure.BODY_MISMATCH,
        ),
        (
            OpeningPathWitness(parse_form("a"), (edge,), parse_formula("wrong")),
            OpeningPathFailure.FINAL_BODY_MISMATCH,
        ),
    ]

    for witness, failure in cases:
        result = verify_opening_path(witness, environment)
        assert result.accepted is False
        assert result.failure is failure


def test_repeated_definition_id_is_invalid_certificate_not_false_cycle():
    environment = DefinitionEnvironment()
    registered = environment.register(parse_formula("a : a"))
    assert registered.entry is not None
    edge = OpeningPathEdge(
        target=parse_form("a"),
        definition_id=registered.entry.identity,
        body=parse_formula("a"),
    )

    one_edge = verify_opening_path(
        OpeningPathWitness(parse_form("a"), (edge,), parse_formula("a")),
        environment,
    )
    repeated = verify_opening_path(
        OpeningPathWitness(parse_form("a"), (edge, edge), parse_formula("a")),
        environment,
    )

    assert one_edge.accepted is True
    assert repeated.accepted is False
    assert repeated.failure is OpeningPathFailure.REPEATED_DEFINITION_ID
    assert repeated.failed_edge == 1
    assert _contract()["cycleCanonicality"]["repeatedDefinitionIdMeansSemanticFalse"] is False


def test_non_form_terminal_is_valid_but_cannot_continue():
    environment = DefinitionEnvironment()
    registered = environment.register(parse_formula("a : b = c"))
    assert registered.entry is not None
    terminal_edge = OpeningPathEdge(
        target=parse_form("a"),
        definition_id=registered.entry.identity,
        body=parse_formula("b = c"),
    )

    terminal = verify_opening_path(
        OpeningPathWitness(
            parse_form("a"),
            (terminal_edge,),
            parse_formula("b = c"),
        ),
        environment,
    )
    continued = verify_opening_path(
        OpeningPathWitness(
            parse_form("a"),
            (
                terminal_edge,
                OpeningPathEdge(
                    parse_form("x"),
                    DefinitionId((), 99),
                    parse_formula("y"),
                ),
            ),
            parse_formula("y"),
        ),
        environment,
    )

    assert terminal.accepted is True
    assert continued.accepted is False
    assert continued.failure is OpeningPathFailure.PREVIOUS_BODY_NOT_FORM
    assert continued.failed_edge == 1


def test_verifier_is_read_only_and_has_no_runtime_evaluation_inputs():
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
    assert list(inspect.signature(verify_opening_path).parameters) == ["witness", "environment"]

    core_source = CORE.read_text(encoding="utf-8")
    assert "from core.mtc_interpreter" not in core_source
    assert "MemoryView" not in core_source
    assert "interpret_constraints" not in core_source


def test_relation_does_not_claim_logical_or_evaluation_semantics():
    meaning = _contract()["meaningBoundary"]
    proof = _contract()["proofBoundary"]

    assert meaning["impliesEquality"] is False
    assert meaning["impliesEquivalence"] is False
    assert meaning["impliesNormalization"] is False
    assert meaning["impliesContextualSatisfaction"] is False
    assert meaning["impliesGenericTransitivity"] is False
    assert meaning["evaluatesBodies"] is False
    assert meaning["readsMemory"] is False
    assert meaning["readsContextFrame"] is False
    assert meaning["readsInterpreterIdentity"] is False
    assert meaning["materializes"] is False
    assert meaning["deletes"] is False
    assert proof == {
        "trustedProofRelationAddedByThisContract": False,
        "currentProofConsumerMustReplayExactVerifier": True,
        "genericCompositionAccepted": False,
        "openingPathPlusContextuallySatisfiesAccepted": False,
    }


def test_all_ten_root_definitions_are_unchanged_one_edge_certificates():
    before = root_sources()
    assert len(before) == 10

    environment = DefinitionEnvironment()
    entries = []
    for source in before:
        definition = parse_formula(source)
        assert isinstance(definition, Definition)
        registration = environment.register(definition)
        assert registration.entry is not None
        entries.append(registration.entry)

    for entry in entries:
        result = verify_opening_path(
            OpeningPathWitness(
                start_target=entry.definition.target,
                edges=(
                    OpeningPathEdge(
                        entry.definition.target,
                        entry.identity,
                        entry.definition.value,
                    ),
                ),
                final_body=entry.definition.value,
            ),
            environment,
        )
        assert result.accepted is True

    assert root_sources() == before
    assert len(environment.entries()) == 10
