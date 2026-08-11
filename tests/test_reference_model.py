"""Architecture checks for the compact current reference index."""

from core.reference_model import (
    CONCEPTS,
    EXECUTION_OPERATIONS,
    OPERATORS,
    SEMANTIC_RULES,
    Layer,
    StatementStatus,
    concept,
    execution_operation,
    operator,
    validate_reference_model,
)


def test_reference_model_contract_is_internally_consistent():
    assert validate_reference_model() == ()


def test_every_architectural_layer_has_one_explicit_concept():
    assert {item.layer for item in CONCEPTS} == set(Layer)


def test_semantic_rules_publish_post_reset_rooted_identity():
    rules = {item.name: item for item in SEMANTIC_RULES}

    assert rules["link-identity"].equation == "Link(A,B)=Link(C,D) iff A=C and B=D"
    assert rules["unique-root"].equation == "R = Link(R,R); X=Link(X,X) => X=R"
    assert rules["start-self-closure"].equation == "O = Link(O,R)"
    assert rules["end-self-closure"].equation == "C = Link(R,C)"
    assert rules["root-basis-link"].equation == "L=Link(O,C); U=Link(C,O)"


def test_current_l3_concept_names_only_stream_deserialization_v03():
    anum = concept("anum-stream")

    assert anum.layer is Layer.SERIALIZATION
    assert anum.status is StatementStatus.ACCEPTED
    assert "anum-stream-deserialization/v0.3" in anum.description
    assert "[ ] 1 0" in anum.description


def test_l2_operator_table_keeps_parser_precedence_boundary():
    symbols = {item.symbol for item in OPERATORS}

    assert symbols == {":", "=", "!=", "⟼", "¬", "♀", "♂", "(...)", "[...]", "{...}"}
    assert operator(":").precedence < operator("=").precedence < operator("⟼").precedence
    assert operator("⟼").associativity.value == "left"
    assert operator("¬").associativity.value == "prefix"
    assert operator("♂").associativity.value == "postfix"


def test_execution_boundary_separates_pure_stream_and_reads_from_memory_effects():
    operations = {item.name: item for item in EXECUTION_OPERATIONS}

    assert set(operations) == {"deserialize", "interpret", "find_link", "intern_link", "delete_link"}
    assert operations["deserialize"].contract == "anum-stream-deserialization/v0.3"
    assert operations["deserialize"].mutates_memory is False
    assert operations["deserialize"].materializes is False
    assert operations["interpret"].mutates_memory is False
    assert operations["find_link"].mutates_memory is False
    assert operations["intern_link"].mutates_memory is True
    assert operations["intern_link"].materializes is True
    assert operations["delete_link"].mutates_memory is True


def test_historical_anum_projection_and_denotation_operations_are_absent():
    names = {item.name for item in EXECUTION_OPERATIONS}

    assert "project" not in names
    assert "load" not in names
    assert "find" not in names
    assert "realize" not in names
