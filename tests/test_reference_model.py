"""Conformance tests for the declarative MTS/Anum v0.1 reference model."""

from core.reference_model import (
    CONCEPTS,
    EXECUTION_OPERATIONS,
    SEMANTIC_RULES,
    DecisionState,
    Layer,
    StatementStatus,
    concept,
    execution_operation,
    operator,
    validate_reference_model,
)


def test_reference_model_contract_is_internally_consistent():
    assert validate_reference_model() == ()


def test_every_architectural_layer_has_an_explicit_concept():
    assert {item.layer for item in CONCEPTS} == set(Layer)


def test_core_l1_semantics_are_explicit_and_cyclic_without_unfolding():
    equations = {item.name: item.equation for item in SEMANTIC_RULES}

    assert equations["associative-root"] == "∞ = Link(∞, ∞)"
    assert equations["start-form"] == "♀F = Link(♀F, F)"
    assert equations["end-form"] == "F♂ = Link(F, F♂)"
    assert equations["inversion"] == "¬Link(a, b) = Link(b, a)"
    assert "finite directed graph" in equations["finite-cyclic-carrier"]
    assert "bisimilar" in equations["equality"]


def test_l2_operator_contract_separates_form_judgment_and_definition():
    assert operator("⟼").result.value == "form"
    assert operator("=").result.value == "judgment"
    assert operator("!=").result.value == "judgment"
    assert operator(":").result.value == "definition"
    assert operator("⟼").associativity.value == "left"


def test_l2_square_form_does_not_claim_identity_with_l3_abits():
    assert concept("abit").layer is Layer.SERIALIZATION
    assert "L3" in operator("[...]").denotation


def test_issue_61_projection_remains_experimental():
    projection = concept("issue-61-projection")
    assert projection.layer is Layer.SERIALIZATION
    assert projection.status is StatementStatus.EXPERIMENTAL


def test_read_operations_do_not_mutate_or_materialize_denotation():
    for name in ("decode", "project", "find"):
        operation = execution_operation(name)
        assert operation.mutates_memory is False
        assert operation.materializes_denotation is False


def test_load_stores_raw_without_materializing_denotation():
    load = execution_operation("load")
    assert load.mutates_memory is True
    assert load.materializes_denotation is False


def test_realize_is_the_explicit_materializing_operation():
    materializing = [
        item.name for item in EXECUTION_OPERATIONS if item.materializes_denotation
    ]
    assert materializing == ["realize"]


def test_theoretical_decision_lifecycle_contains_required_path():
    required_path = (
        DecisionState.RESEARCH,
        DecisionState.PROBLEM,
        DecisionState.CANDIDATE,
        DecisionState.CHALLENGED,
        DecisionState.MODELED,
        DecisionState.ACCEPTED,
        DecisionState.RELEASED,
    )

    assert tuple(item.value for item in required_path) == (
        "Research",
        "Problem",
        "Candidate",
        "Challenged",
        "Modeled",
        "Accepted",
        "Released",
    )
