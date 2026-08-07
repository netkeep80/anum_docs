"""Conformance tests for the declarative MTS/Anum v0.2 reference model."""

from core.reference_model import (
    CONCEPTS,
    EXECUTION_OPERATIONS,
    OPEN_QUESTIONS,
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


def test_accepted_l1_carrier_rules_are_finite_and_cyclic_without_unfolding():
    equations = {item.name: item.equation for item in SEMANTIC_RULES}

    assert equations["associative-root-carrier"] == "root.start = root; root.end = root"
    assert equations["start-form-carrier"] == "start(F).start = start(F); start(F).end = F"
    assert equations["end-form-carrier"] == "end(F).start = F; end(F).end = end(F)"
    assert equations["link-inversion"] == "invert(Link(a, b)) = Link(b, a)"
    assert "finite directed graph" in equations["finite-cyclic-carrier"]


def test_contextual_equality_is_accepted_and_issue_79_is_not_an_open_blocker():
    equality = concept("equality-meaning")
    assert equality.layer is Layer.SEMANTICS
    assert equality.status is StatementStatus.DEFINITION
    assert not any(item.issue == 79 for item in OPEN_QUESTIONS)

    equations = {item.name: item.equation for item in SEMANTIC_RULES}
    assert equations["contextual-equality"] == (
        "eq(A, B) := start(A) = start(B) and end(A) = end(B)"
    )
    assert "локаль" in operator("=").denotation
    assert "глобаль" in operator("=").denotation


def test_context_pronouns_and_anonymous_form_are_first_class_l2_concepts():
    pronouns = concept("context-pronouns")
    anonymous = concept("anonymous-form")

    assert pronouns.layer is Layer.FORMAL_LANGUAGE
    assert pronouns.status is StatementStatus.DEFINITION
    assert "◁" in pronouns.description and "▷" in pronouns.description
    assert "↑" in pronouns.description
    assert anonymous.layer is Layer.FORMAL_LANGUAGE
    assert "typed AST" in anonymous.description


def test_l2_operator_contract_separates_form_judgment_and_definition():
    assert operator("⟼").result.value == "form"
    assert operator("=").result.value == "judgment"
    assert operator("!=").result.value == "judgment"
    assert operator(":").result.value == "definition"
    assert operator("⟼").associativity.value == "left"
    assert "poles()" in operator("⟼").denotation


def test_l2_square_form_does_not_claim_identity_with_l3_abits_or_context_pronouns():
    assert concept("abit").layer is Layer.SERIALIZATION
    square = operator("[...]").denotation
    assert "L3" in square
    assert "не перегружены context syntax" in square


def test_issue_61_projection_remains_experimental():
    projection = concept("issue-61-projection")
    assert projection.layer is Layer.SERIALIZATION
    assert projection.status is StatementStatus.EXPERIMENTAL


def test_interpret_is_read_only_and_non_materializing():
    operation = execution_operation("interpret")
    assert operation.input_kind.value == "expression"
    assert operation.result_kind.value == "memory-query"
    assert operation.mutates_memory is False
    assert operation.materializes_denotation is False
    assert "ContextFrame" in operation.contract


def test_read_operations_do_not_mutate_or_materialize_denotation():
    for name in ("decode", "project", "interpret", "find"):
        operation = execution_operation(name)
        assert operation.mutates_memory is False
        assert operation.materializes_denotation is False


def test_load_stores_raw_without_materializing_denotation():
    load = execution_operation("load")
    assert load.mutates_memory is True
    assert load.materializes_denotation is False


def test_realize_is_the_only_explicit_materializing_operation():
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
