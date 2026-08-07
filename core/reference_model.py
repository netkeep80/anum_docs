"""Declarative reference-model contract for MTS/Anum v0.1.

The module records layer boundaries and semantic obligations. It is not the L1
interpreter or the L5 prover. The L2 ``Expression`` kind is a parser supertype,
not a new ontological entity.
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
    DERIVED = "derived"
    CONFORMANCE = "conformance"
    EXPERIMENTAL = "experimental"


class DecisionState(str, Enum):
    RESEARCH = "Research"
    PROBLEM = "Problem"
    CANDIDATE = "Candidate"
    CHALLENGED = "Challenged"
    MODELED = "Modeled"
    ACCEPTED = "Accepted"
    RELEASED = "Released"
    REJECTED = "Rejected"
    DEFERRED = "Deferred"
    SUPERSEDED = "Superseded"


class ValueKind(str, Enum):
    EXPRESSION = "expression"
    FORM = "form"
    BUNDLE = "bundle"
    JUDGMENT = "judgment"
    DEFINITION = "definition"
    RAW_ANUM = "raw-anum"
    PROJECTION = "projection"
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
    layer: Layer
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
    layer: Layer
    input_kind: ValueKind
    result_kind: ValueKind
    mutates_memory: bool
    materializes_denotation: bool
    contract: str


CONCEPTS = (
    ConceptSpec(
        "link",
        Layer.ONTOLOGY,
        StatementStatus.PRIMITIVE,
        "Связь — единственная форма существования в МТС.",
    ),
    ConceptSpec(
        "meaning",
        Layer.ONTOLOGY,
        StatementStatus.PRIMITIVE,
        "Смысл не существует отдельно от связи.",
    ),
    ConceptSpec(
        "nonlink-meaning",
        Layer.ONTOLOGY,
        StatementStatus.DEFINITION,
        "Несвязь не существует в натуре; её смысл выражается связью.",
    ),
    ConceptSpec(
        "associative-root",
        Layer.SEMANTICS,
        StatementStatus.DEFINITION,
        "Акорень — полностью самозамкнутая связь reference model.",
    ),
    ConceptSpec(
        "start-form",
        Layer.SEMANTICS,
        StatementStatus.DEFINITION,
        "Начало формы задаётся циклическим самозамыканием start-полюса.",
    ),
    ConceptSpec(
        "end-form",
        Layer.SEMANTICS,
        StatementStatus.DEFINITION,
        "Конец формы задаётся циклическим самозамыканием end-полюса.",
    ),
    ConceptSpec(
        "inversion",
        Layer.SEMANTICS,
        StatementStatus.DEFINITION,
        "Инверсия меняет местами упорядоченные полюса связи.",
    ),
    ConceptSpec(
        "equality",
        Layer.SEMANTICS,
        StatementStatus.DEFINITION,
        "Равенство сравнивает конечные циклические формы структурно.",
    ),
    ConceptSpec(
        "bundle",
        Layer.SEMANTICS,
        StatementStatus.DEFINITION,
        "Пучок v0.1 экстенсионален.",
    ),
    ConceptSpec(
        "formal-notation",
        Layer.FORMAL_LANGUAGE,
        StatementStatus.DEFINITION,
        "L2 различает формы, суждения и определения через typed AST.",
    ),
    ConceptSpec(
        "anum",
        Layer.SERIALIZATION,
        StatementStatus.DEFINITION,
        "Ачисло — сериализационный носитель описания связи/структуры.",
    ),
    ConceptSpec(
        "abit",
        Layer.SERIALIZATION,
        StatementStatus.DEFINITION,
        "Базовый четверичный алфавит v0.1 использует [ ] 1 0.",
    ),
    ConceptSpec(
        "issue-61-projection",
        Layer.SERIALIZATION,
        StatementStatus.EXPERIMENTAL,
        "Проекция []→0 и ][→1 остаётся рабочей протокольной гипотезой.",
    ),
    ConceptSpec(
        "memory-execution",
        Layer.EXECUTION,
        StatementStatus.DEFINITION,
        "Изменение памяти отделено от чтения, декодирования и поиска.",
    ),
    ConceptSpec(
        "proof-system",
        Layer.INFERENCE,
        StatementStatus.EXPERIMENTAL,
        "Trusted inference rules вводятся только на отдельном L5-этапе.",
    ),
)


SEMANTIC_RULES = (
    SemanticRuleSpec(
        "link",
        Layer.SEMANTICS,
        "Link(a, b)",
        "Связь имеет упорядоченные полюса start=a и end=b.",
    ),
    SemanticRuleSpec(
        "finite-cyclic-carrier",
        Layer.SEMANTICS,
        "Model = finite directed graph of Link nodes; cycles are allowed",
        "Самоссылочные формы имеют конечный циклический carrier.",
    ),
    SemanticRuleSpec(
        "associative-root",
        Layer.SEMANTICS,
        "∞ = Link(∞, ∞)",
        "Акорень — узел полного самозамыкания.",
    ),
    SemanticRuleSpec(
        "start-form",
        Layer.SEMANTICS,
        "♀F = Link(♀F, F)",
        "Префикс ♀ задаёт начало формы.",
    ),
    SemanticRuleSpec(
        "end-form",
        Layer.SEMANTICS,
        "F♂ = Link(F, F♂)",
        "Постфикс ♂ задаёт конец формы.",
    ),
    SemanticRuleSpec(
        "inversion",
        Layer.SEMANTICS,
        "¬Link(a, b) = Link(b, a)",
        "Инверсия меняет направление связи.",
    ),
    SemanticRuleSpec(
        "equality",
        Layer.SEMANTICS,
        "A = B iff their rooted ordered cyclic Link graphs are bisimilar",
        "Равенство — коиндуктивное структурное сравнение start/end-рёбер.",
    ),
    SemanticRuleSpec(
        "bundle",
        Layer.SEMANTICS,
        "{A, A} = {A}; {A, B} = {B, A}",
        "Пучки читаются экстенсионально.",
    ),
)


OPERATORS = (
    OperatorSpec(
        ":",
        Layer.FORMAL_LANGUAGE,
        (ValueKind.FORM, ValueKind.EXPRESSION),
        ValueKind.DEFINITION,
        10,
        Associativity.RIGHT,
        "Вводит target-форму через L2 expression; не является L4-мутацией.",
    ),
    OperatorSpec(
        "=",
        Layer.FORMAL_LANGUAGE,
        (ValueKind.FORM, ValueKind.FORM),
        ValueKind.JUDGMENT,
        20,
        Associativity.NONE,
        "Строит суждение структурного равенства L1-денотаций.",
    ),
    OperatorSpec(
        "!=",
        Layer.FORMAL_LANGUAGE,
        (ValueKind.FORM, ValueKind.FORM),
        ValueKind.JUDGMENT,
        20,
        Associativity.NONE,
        "Строит суждение различимости L1-денотаций.",
    ),
    OperatorSpec(
        "⟼",
        Layer.FORMAL_LANGUAGE,
        (ValueKind.FORM, ValueKind.FORM),
        ValueKind.FORM,
        40,
        Associativity.LEFT,
        "Строит Link(start, end); цепочка читается слева направо.",
    ),
    OperatorSpec(
        "¬",
        Layer.FORMAL_LANGUAGE,
        (ValueKind.FORM,),
        ValueKind.FORM,
        60,
        Associativity.PREFIX,
        "Инвертирует направление denotation формы.",
    ),
    OperatorSpec(
        "♀",
        Layer.FORMAL_LANGUAGE,
        (ValueKind.FORM,),
        ValueKind.FORM,
        70,
        Associativity.PREFIX,
        "Строит/читает начало формы.",
    ),
    OperatorSpec(
        "♂",
        Layer.FORMAL_LANGUAGE,
        (ValueKind.FORM,),
        ValueKind.FORM,
        70,
        Associativity.POSTFIX,
        "Строит/читает конец формы.",
    ),
    OperatorSpec(
        "(...)",
        Layer.FORMAL_LANGUAGE,
        (ValueKind.EXPRESSION,),
        ValueKind.FORM,
        80,
        Associativity.CONTAINER,
        "Круглая форма содержит ноль или одно L2 expression.",
    ),
    OperatorSpec(
        "[...]",
        Layer.FORMAL_LANGUAGE,
        (ValueKind.FORM,),
        ValueKind.FORM,
        80,
        Associativity.CONTAINER,
        "Квадратная L2-форма; glyph [ ] не тождественны L3-абитам автоматически.",
    ),
    OperatorSpec(
        "{...}",
        Layer.FORMAL_LANGUAGE,
        (ValueKind.EXPRESSION,),
        ValueKind.BUNDLE,
        80,
        Associativity.CONTAINER,
        "Пучковая форма содержит ноль или более L2 expressions.",
        variadic=True,
    ),
)


EXECUTION_OPERATIONS = (
    ExecutionOperationSpec(
        "load",
        Layer.EXECUTION,
        ValueKind.RAW_ANUM,
        ValueKind.RAW_ANUM,
        True,
        False,
        "Сохраняет raw carrier, но не создаёт den(A).",
    ),
    ExecutionOperationSpec(
        "decode",
        Layer.EXECUTION,
        ValueKind.RAW_ANUM,
        ValueKind.PROJECTION,
        False,
        False,
        "Разбирает носитель без изменения апамяти.",
    ),
    ExecutionOperationSpec(
        "project",
        Layer.EXECUTION,
        ValueKind.RAW_ANUM,
        ValueKind.PROJECTION,
        False,
        False,
        "Применяет явный контекст K без изменения апамяти.",
    ),
    ExecutionOperationSpec(
        "find",
        Layer.EXECUTION,
        ValueKind.PROJECTION,
        ValueKind.MEMORY_QUERY,
        False,
        False,
        "Проверяет наличие denotation и не создаёт искомую связь.",
    ),
    ExecutionOperationSpec(
        "realize",
        Layer.EXECUTION,
        ValueKind.PROJECTION,
        ValueKind.MEMORY_EFFECT,
        True,
        True,
        "Явно материализует denotation либо получает существующую каноническую связь.",
    ),
    ExecutionOperationSpec(
        "delete",
        Layer.EXECUTION,
        ValueKind.PROJECTION,
        ValueKind.MEMORY_EFFECT,
        True,
        False,
        "Явно удаляет материализованную структуру.",
    ),
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
    if any(item.layer is not Layer.SEMANTICS for item in SEMANTIC_RULES):
        errors.append("all reference semantic rules must belong to L1")
    if any(item.layer is not Layer.EXECUTION for item in EXECUTION_OPERATIONS):
        errors.append("all execution operations must belong to L4")

    if operator(":").operands != (ValueKind.FORM, ValueKind.EXPRESSION):
        errors.append("definition must accept Form × Expression in the canonical fixture")
    if not operator("{...}").variadic:
        errors.append("bundle container must accept a variadic expression list")

    if concept("issue-61-projection").status is not StatementStatus.EXPERIMENTAL:
        errors.append("issue #61 protocol projection must remain experimental in v0.1")

    for name in ("decode", "project", "find"):
        operation = execution_operation(name)
        if operation.mutates_memory or operation.materializes_denotation:
            errors.append(f"{name} must be non-mutating and non-materializing")

    load = execution_operation("load")
    if not load.mutates_memory or load.materializes_denotation:
        errors.append("load may store raw carrier but must not materialize denotation")

    if not execution_operation("realize").materializes_denotation:
        errors.append("realize must be the explicit denotation-materializing operation")

    return tuple(errors)


def _check_unique(label: str, values: list[str], errors: list[str]) -> None:
    if len(values) != len(set(values)):
        errors.append(f"{label} names must be unique")
