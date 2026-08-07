# -*- coding: utf-8 -*-
"""Declarative reference-model contract for MTS/Anum v0.1.

This module does not evaluate MTS formulas and is not a prover.  It records the
layer boundaries and semantic obligations that later implementations must obey.
Executable semantics belongs to the follow-up reference interpreter.
"""

from dataclasses import dataclass
from enum import Enum


class Layer(str, Enum):
    """Architectural layers of the v0.1 reference model."""

    ONTOLOGY = "L0"
    SEMANTICS = "L1"
    FORMAL_LANGUAGE = "L2"
    SERIALIZATION = "L3"
    EXECUTION = "L4"
    INFERENCE = "L5"


class StatementStatus(str, Enum):
    """Normative status of a statement or concept."""

    PRIMITIVE = "primitive"
    DEFINITION = "definition"
    DERIVED = "derived"
    CONFORMANCE = "conformance"
    EXPERIMENTAL = "experimental"


class DecisionState(str, Enum):
    """Lifecycle of a fundamental theoretical change."""

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
    """Implementation-level categories used to type the L2/L4 contracts."""

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
    equation: str
    description: str


@dataclass(frozen=True)
class OperatorSpec:
    symbol: str
    operands: tuple[ValueKind, ...]
    result: ValueKind
    precedence: int
    associativity: Associativity
    denotation: str


@dataclass(frozen=True)
class ExecutionOperationSpec:
    name: str
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
        "Несвязь не существует в натуре; допустим только смысл несвязи, выраженный связью.",
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
        "Начало формы задаётся конечным циклическим самозамыканием начала.",
    ),
    ConceptSpec(
        "end-form",
        Layer.SEMANTICS,
        StatementStatus.DEFINITION,
        "Конец формы задаётся конечным циклическим самозамыканием конца.",
    ),
    ConceptSpec(
        "inversion",
        Layer.SEMANTICS,
        StatementStatus.DEFINITION,
        "Инверсия связи меняет местами упорядоченные полюса связи.",
    ),
    ConceptSpec(
        "equality",
        Layer.SEMANTICS,
        StatementStatus.DEFINITION,
        "Равенство сравнивает конечные циклические формы структурно без бесконечного unfolding.",
    ),
    ConceptSpec(
        "bundle",
        Layer.SEMANTICS,
        StatementStatus.DEFINITION,
        "Пучок v0.1 экстенсионален: порядок несущественен, повтор не добавляет элемент.",
    ),
    ConceptSpec(
        "formal-notation",
        Layer.FORMAL_LANGUAGE,
        StatementStatus.DEFINITION,
        "Знаки L2 записывают формы и суждения, но не являются сами по себе L3-абитами.",
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
        "Проекция []→0 и ][→1 остаётся рабочей протокольной гипотезой до отдельного принятия.",
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
        "Правила вывода не входят в v0.1 reference model до отдельного L5-этапа.",
    ),
)


SEMANTIC_RULES = (
    SemanticRuleSpec(
        "link",
        "Link(a, b)",
        "L1 представляет связь как узел с упорядоченными полюсами start=a и end=b.",
    ),
    SemanticRuleSpec(
        "finite-cyclic-carrier",
        "Model = finite directed graph of Link nodes; cycles are allowed",
        "Рекурсивные формы имеют конечный циклический носитель и не требуют бесконечного разворачивания.",
    ),
    SemanticRuleSpec(
        "associative-root",
        "∞ = Link(∞, ∞)",
        "Акорень — узел полного самозамыкания.",
    ),
    SemanticRuleSpec(
        "start-form",
        "♀F = Link(♀F, F)",
        "Префикс ♀ строит начало формы через самозамкнутый start-полюс.",
    ),
    SemanticRuleSpec(
        "end-form",
        "F♂ = Link(F, F♂)",
        "Постфикс ♂ строит конец формы через самозамкнутый end-полюс.",
    ),
    SemanticRuleSpec(
        "inversion",
        "¬Link(a, b) = Link(b, a)",
        "Инверсия меняет направление одной связи и не означает отсутствие связи.",
    ),
    SemanticRuleSpec(
        "equality",
        "A = B iff their rooted ordered cyclic Link graphs are bisimilar",
        "Равенство v0.1 — коиндуктивное структурное сравнение start/end-рёбер.",
    ),
    SemanticRuleSpec(
        "bundle",
        "{A, A} = {A}; {A, B} = {B, A}",
        "Пучки v0.1 читаются экстенсионально, как зафиксировано текущим fixture.",
    ),
)


OPERATORS = (
    OperatorSpec(
        ":",
        (ValueKind.FORM, ValueKind.FORM),
        ValueKind.DEFINITION,
        10,
        Associativity.RIGHT,
        "Вводит имя/различие через локальную форму; не является L4-мутацией памяти.",
    ),
    OperatorSpec(
        "=",
        (ValueKind.FORM, ValueKind.FORM),
        ValueKind.JUDGMENT,
        20,
        Associativity.NONE,
        "Строит суждение структурного равенства L1-денотаций.",
    ),
    OperatorSpec(
        "!=",
        (ValueKind.FORM, ValueKind.FORM),
        ValueKind.JUDGMENT,
        20,
        Associativity.NONE,
        "Строит суждение различимости L1-денотаций.",
    ),
    OperatorSpec(
        "⟼",
        (ValueKind.FORM, ValueKind.FORM),
        ValueKind.FORM,
        40,
        Associativity.LEFT,
        "Строит Link(start, end); цепочка читается слева направо согласно текущему fixture.",
    ),
    OperatorSpec(
        "¬",
        (ValueKind.FORM,),
        ValueKind.FORM,
        60,
        Associativity.PREFIX,
        "Инвертирует направление denotation одной формы.",
    ),
    OperatorSpec(
        "♀",
        (ValueKind.FORM,),
        ValueKind.FORM,
        70,
        Associativity.PREFIX,
        "Строит/читает начало формы в reference model.",
    ),
    OperatorSpec(
        "♂",
        (ValueKind.FORM,),
        ValueKind.FORM,
        70,
        Associativity.POSTFIX,
        "Строит/читает конец формы в reference model.",
    ),
    OperatorSpec(
        "(...)" ,
        (ValueKind.FORM,),
        ValueKind.FORM,
        80,
        Associativity.CONTAINER,
        "Круглая формальная форма/группировка; точная AST-роль определяется контекстом L2.",
    ),
    OperatorSpec(
        "[...]",
        (ValueKind.FORM,),
        ValueKind.FORM,
        80,
        Associativity.CONTAINER,
        "Квадратная форма L2; совпадение glyph [ ] с L3-абитами не создаёт автоматического тождества.",
    ),
    OperatorSpec(
        "{...}",
        (ValueKind.FORM,),
        ValueKind.BUNDLE,
        80,
        Associativity.CONTAINER,
        "Строит пучковую форму; список элементов типизируется front-end-ом L2.",
    ),
)


EXECUTION_OPERATIONS = (
    ExecutionOperationSpec(
        "load",
        ValueKind.RAW_ANUM,
        ValueKind.RAW_ANUM,
        True,
        False,
        "Сохраняет raw carrier, но не создаёт den(A).",
    ),
    ExecutionOperationSpec(
        "decode",
        ValueKind.RAW_ANUM,
        ValueKind.PROJECTION,
        False,
        False,
        "Разбирает носитель без изменения апамяти.",
    ),
    ExecutionOperationSpec(
        "project",
        ValueKind.RAW_ANUM,
        ValueKind.PROJECTION,
        False,
        False,
        "Применяет явный контекст K без изменения апамяти.",
    ),
    ExecutionOperationSpec(
        "find",
        ValueKind.PROJECTION,
        ValueKind.MEMORY_QUERY,
        False,
        False,
        "Проверяет наличие denotation и не создаёт искомую связь.",
    ),
    ExecutionOperationSpec(
        "realize",
        ValueKind.PROJECTION,
        ValueKind.MEMORY_EFFECT,
        True,
        True,
        "Явно материализует denotation либо получает уже существующую каноническую связь.",
    ),
    ExecutionOperationSpec(
        "delete",
        ValueKind.PROJECTION,
        ValueKind.MEMORY_EFFECT,
        True,
        False,
        "Явно удаляет материализованную связь/структуру; описание состояния само по себе не удаляет ничего.",
    ),
)


def concept(name: str) -> ConceptSpec:
    """Return one named concept from the v0.1 contract."""

    for item in CONCEPTS:
        if item.name == name:
            return item
    raise KeyError(name)


def operator(symbol: str) -> OperatorSpec:
    """Return one L2 operator specification."""

    for item in OPERATORS:
        if item.symbol == symbol:
            return item
    raise KeyError(symbol)


def execution_operation(name: str) -> ExecutionOperationSpec:
    """Return one L4 operation specification."""

    for item in EXECUTION_OPERATIONS:
        if item.name == name:
            return item
    raise KeyError(name)


def validate_reference_model() -> tuple[str, ...]:
    """Check architectural invariants of the declarative v0.1 contract."""

    errors = []

    if {item.layer for item in CONCEPTS} != set(Layer):
        errors.append("reference model must contain concepts from every L0-L5 layer")

    concept_names = [item.name for item in CONCEPTS]
    if len(concept_names) != len(set(concept_names)):
        errors.append("concept names must be unique")

    operator_symbols = [item.symbol for item in OPERATORS]
    if len(operator_symbols) != len(set(operator_symbols)):
        errors.append("L2 operator symbols must be unique")

    semantic_names = [item.name for item in SEMANTIC_RULES]
    if len(semantic_names) != len(set(semantic_names)):
        errors.append("semantic rule names must be unique")

    operation_names = [item.name for item in EXECUTION_OPERATIONS]
    if len(operation_names) != len(set(operation_names)):
        errors.append("L4 operation names must be unique")

    if concept("issue-61-projection").status is not StatementStatus.EXPERIMENTAL:
        errors.append("issue #61 protocol projection must remain experimental in v0.1")

    for name in ("decode", "project", "find"):
        operation = execution_operation(name)
        if operation.mutates_memory or operation.materializes_denotation:
            errors.append(f"{name} must be non-mutating and non-materializing")

    if not execution_operation("load").mutates_memory:
        errors.append("load must be allowed to store the raw carrier")
    if execution_operation("load").materializes_denotation:
        errors.append("load must not materialize denotation")

    if not execution_operation("realize").materializes_denotation:
        errors.append("realize must be the explicit denotation-materializing operation")

    return tuple(errors)
