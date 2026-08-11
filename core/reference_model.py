"""Compact declarative index of the current MTS layer boundaries.

This module is not a second semantic implementation. The parser consumes only
the L2 operator table through ``operator()``; current L3 behavior is implemented
once in ``core.anum_protocol`` and current L5 behavior once in
``core.proof_checker``.
"""

from dataclasses import dataclass
from enum import Enum


class Layer(str, Enum):
    ONTOLOGY = "L0"
    SEMANTICS = "L1"
    FORMAL_LANGUAGE = "L2"
    SERIALIZATION = "L3"
    EXECUTION = "L4"
    INFERENCE = "L5"


class StatementStatus(str, Enum):
    PRIMITIVE = "primitive"
    DEFINITION = "definition"
    CONFORMANCE = "conformance"
    ACCEPTED = "accepted"


class ValueKind(str, Enum):
    EXPRESSION = "expression"
    FORM = "form"
    BUNDLE = "bundle"
    JUDGMENT = "judgment"
    DEFINITION = "definition"
    RAW_ANUM = "raw-anum"
    SEMANTIC_LINK = "semantic-link"
    MEMORY_QUERY = "memory-query"
    MEMORY_EFFECT = "memory-effect"
    PROOF = "proof"


class Associativity(str, Enum):
    NONE = "none"
    LEFT = "left"
    RIGHT = "right"
    PREFIX = "prefix"
    POSTFIX = "postfix"
    CONTAINER = "container"


@dataclass(frozen=True)
class ConceptSpec:
    name: str
    layer: Layer
    status: StatementStatus
    description: str


@dataclass(frozen=True)
class SemanticRuleSpec:
    name: str
    equation: str
    description: str


@dataclass(frozen=True)
class OperatorSpec:
    symbol: str
    layer: Layer
    operands: tuple[ValueKind, ...]
    result: ValueKind
    precedence: int
    associativity: Associativity
    denotation: str
    variadic: bool = False


@dataclass(frozen=True)
class ExecutionOperationSpec:
    name: str
    input_kind: ValueKind
    result_kind: ValueKind
    mutates_memory: bool
    materializes: bool
    contract: str


CONCEPTS = (
    ConceptSpec("link", Layer.ONTOLOGY, StatementStatus.PRIMITIVE, "Связь — единственная онтологическая форма МТС."),
    ConceptSpec("rooted-link-identity", Layer.SEMANTICS, StatementStatus.DEFINITION, "Связь определяется самозамыканием и связностью с уже различёнными корневыми связями; технический идентификатор не создаёт семантического тождества."),
    ConceptSpec("formal-notation", Layer.FORMAL_LANGUAGE, StatementStatus.DEFINITION, "L2 различает Form, Judgment и Definition через типизированное AST."),
    ConceptSpec("anum-stream", Layer.SERIALIZATION, StatementStatus.ACCEPTED, "Текущий L3 — чистая стековая десериализация anum-stream-deserialization/v0.3 над четырьмя абитами [ ] 1 0."),
    ConceptSpec("memory-view", Layer.EXECUTION, StatementStatus.DEFINITION, "Чтение конечной памяти пар отделено от явных эффектов intern_link/delete_link."),
    ConceptSpec("proof-replay", Layer.INFERENCE, StatementStatus.ACCEPTED, "Текущий L5 независимо переигрывает ровно шесть принятых relations без доверия поиску или общей композиции."),
)


SEMANTIC_RULES = (
    SemanticRuleSpec("link-identity", "Link(A,B)=Link(C,D) iff A=C and B=D", "Одинаковые упорядоченные семантические полюса задают одну связь."),
    SemanticRuleSpec("unique-root", "R = Link(R,R); X=Link(X,X) => X=R", "Полностью самозамкнутая связь единственна."),
    SemanticRuleSpec("start-self-closure", "O = Link(O,R)", "Начально-самозамкнутая форма различается через уже различённый конечный полюс."),
    SemanticRuleSpec("end-self-closure", "C = Link(R,C)", "Конечно-самозамкнутая форма различается через уже различённый начальный полюс."),
    SemanticRuleSpec("root-basis-link", "L=Link(O,C); U=Link(C,O)", "Корневой базис строится из самозамкнутых форм без скрытых идентификаторов."),
)


OPERATORS = (
    OperatorSpec(":", Layer.FORMAL_LANGUAGE, (ValueKind.FORM, ValueKind.EXPRESSION), ValueKind.DEFINITION, 10, Associativity.RIGHT, "Вводит определение; не является L4-мутацией."),
    OperatorSpec("=", Layer.FORMAL_LANGUAGE, (ValueKind.FORM, ValueKind.FORM), ValueKind.JUDGMENT, 20, Associativity.NONE, "Строит локальное контекстное суждение равенства."),
    OperatorSpec("!=", Layer.FORMAL_LANGUAGE, (ValueKind.FORM, ValueKind.FORM), ValueKind.JUDGMENT, 20, Associativity.NONE, "Строит локальное суждение различимости."),
    OperatorSpec("⟼", Layer.FORMAL_LANGUAGE, (ValueKind.FORM, ValueKind.FORM), ValueKind.FORM, 40, Associativity.LEFT, "Строит упорядоченную LinkForm."),
    OperatorSpec("¬", Layer.FORMAL_LANGUAGE, (ValueKind.FORM,), ValueKind.FORM, 60, Associativity.PREFIX, "Инвертирует форму."),
    OperatorSpec("♀", Layer.FORMAL_LANGUAGE, (ValueKind.FORM,), ValueKind.FORM, 70, Associativity.PREFIX, "Начало формы."),
    OperatorSpec("♂", Layer.FORMAL_LANGUAGE, (ValueKind.FORM,), ValueKind.FORM, 70, Associativity.POSTFIX, "Конец формы."),
    OperatorSpec("(...)", Layer.FORMAL_LANGUAGE, (ValueKind.EXPRESSION,), ValueKind.FORM, 80, Associativity.CONTAINER, "Круглая группировка."),
    OperatorSpec("[...]", Layer.FORMAL_LANGUAGE, (ValueKind.FORM,), ValueKind.FORM, 80, Associativity.CONTAINER, "L2 SquareForm; [] — локальная анонимная форма и не тождественна автоматически L3 пустой группе."),
    OperatorSpec("{...}", Layer.FORMAL_LANGUAGE, (ValueKind.EXPRESSION,), ValueKind.BUNDLE, 80, Associativity.CONTAINER, "Пучок L2 expressions.", variadic=True),
)


EXECUTION_OPERATIONS = (
    ExecutionOperationSpec("deserialize", ValueKind.RAW_ANUM, ValueKind.SEMANTIC_LINK, False, False, "anum-stream-deserialization/v0.3"),
    ExecutionOperationSpec("interpret", ValueKind.EXPRESSION, ValueKind.MEMORY_QUERY, False, False, "mts-contract/v0.5"),
    ExecutionOperationSpec("find_link", ValueKind.MEMORY_QUERY, ValueKind.MEMORY_QUERY, False, False, "finite L4 memory view"),
    ExecutionOperationSpec("intern_link", ValueKind.MEMORY_QUERY, ValueKind.MEMORY_EFFECT, True, True, "explicit L4 effect"),
    ExecutionOperationSpec("delete_link", ValueKind.MEMORY_QUERY, ValueKind.MEMORY_EFFECT, True, False, "explicit L4 effect"),
)


def concept(name: str) -> ConceptSpec:
    for item in CONCEPTS:
        if item.name == name:
            return item
    raise KeyError(name)


def operator(symbol: str) -> OperatorSpec:
    for item in OPERATORS:
        if item.symbol == symbol:
            return item
    raise KeyError(symbol)


def execution_operation(name: str) -> ExecutionOperationSpec:
    for item in EXECUTION_OPERATIONS:
        if item.name == name:
            return item
    raise KeyError(name)


def validate_reference_model() -> tuple[str, ...]:
    errors: list[str] = []
    if {item.layer for item in CONCEPTS} != set(Layer):
        errors.append("reference model must contain concepts from every L0-L5 layer")
    _check_unique("concept", [item.name for item in CONCEPTS], errors)
    _check_unique("L2 operator", [item.symbol for item in OPERATORS], errors)
    _check_unique("semantic rule", [item.name for item in SEMANTIC_RULES], errors)
    _check_unique("L4 operation", [item.name for item in EXECUTION_OPERATIONS], errors)

    if any(item.layer is not Layer.FORMAL_LANGUAGE for item in OPERATORS):
        errors.append("all formal operators must belong to L2")

    deserialize = execution_operation("deserialize")
    if deserialize.mutates_memory or deserialize.materializes:
        errors.append("ANUM deserialization must remain effect-free")
    if execution_operation("interpret").mutates_memory:
        errors.append("L2 interpret must remain read-only")
    if not execution_operation("intern_link").materializes:
        errors.append("intern_link must remain an explicit materializing effect")

    return tuple(errors)


def _check_unique(label: str, values: list[str], errors: list[str]) -> None:
    if len(values) != len(set(values)):
        errors.append(f"duplicate {label}")
