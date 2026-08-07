"""Declarative reference-model contract for MTS/Anum v0.2.

The module records layer boundaries and accepted semantic obligations. It is not
the L1 carrier implementation or the L5 proof kernel. Experimental protocol
questions remain explicit, while the contextual L2/L4 interpretation accepted in
v0.2 is represented directly instead of being hidden behind issue-specific flags.
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
class OpenQuestionSpec:
    name: str
    layer: Layer
    issue: int
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
        "Акорень имеет конечное циклическое представление полного самозамыкания.",
    ),
    ConceptSpec(
        "start-form",
        Layer.SEMANTICS,
        StatementStatus.DEFINITION,
        "Начало формы имеет циклическое самозамыкание start-полюса.",
    ),
    ConceptSpec(
        "end-form",
        Layer.SEMANTICS,
        StatementStatus.DEFINITION,
        "Конец формы имеет циклическое самозамыкание end-полюса.",
    ),
    ConceptSpec(
        "inversion",
        Layer.SEMANTICS,
        StatementStatus.DEFINITION,
        "Для конкретной Link-структуры инверсия меняет местами упорядоченные полюса.",
    ),
    ConceptSpec(
        "equality-meaning",
        Layer.SEMANTICS,
        StatementStatus.DEFINITION,
        "Равенство сравнивает соответствующие формы начала и конца двух ролей текущего бинарного контекста.",
    ),
    ConceptSpec(
        "bundle",
        Layer.SEMANTICS,
        StatementStatus.CONFORMANCE,
        "Пучковая семантика проверяется отдельным conformance-слоем и не расширяет корневую систему определений.",
    ),
    ConceptSpec(
        "formal-notation",
        Layer.FORMAL_LANGUAGE,
        StatementStatus.DEFINITION,
        "L2 различает формы, суждения и определения через typed AST.",
    ),
    ConceptSpec(
        "context-pronouns",
        Layer.FORMAL_LANGUAGE,
        StatementStatus.DEFINITION,
        "◁ и ▷ — два атомарных односимвольных местоимения start/end текущего ContextFrame; ↑ поднимает к родительскому контексту.",
    ),
    ConceptSpec(
        "anonymous-form",
        Layer.FORMAL_LANGUAGE,
        StatementStatus.DEFINITION,
        "Каждое вхождение [] является отдельной анонимной формой-шаблоном с identity по пути в typed AST.",
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
        "Базовый четверичный алфавит использует [ ] 1 0.",
    ),
    ConceptSpec(
        "issue-61-projection",
        Layer.SERIALIZATION,
        StatementStatus.EXPERIMENTAL,
        "Проекция []→0 и ][→1 остаётся рабочей протокольной гипотезой.",
    ),
    ConceptSpec(
        "formal-interpretation",
        Layer.EXECUTION,
        StatementStatus.DEFINITION,
        "interpret выполняет L2-шаблон относительно ContextFrame и апамяти, возвращая локальные замещения без materialization.",
    ),
    ConceptSpec(
        "memory-execution",
        Layer.EXECUTION,
        StatementStatus.DEFINITION,
        "Чтение/интерпретация памяти отделены от явных эффектов realize/delete.",
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
        "Конкретная reference Link-структура имеет упорядоченные полюса start=a и end=b.",
    ),
    SemanticRuleSpec(
        "finite-cyclic-carrier",
        Layer.SEMANTICS,
        "Model = finite directed graph of Link nodes; cycles are allowed",
        "Самоссылочные Link-структуры хранятся конечным циклическим carrier без бесконечного unfolding.",
    ),
    SemanticRuleSpec(
        "associative-root-carrier",
        Layer.SEMANTICS,
        "root.start = root; root.end = root",
        "Reference carrier акорня — одна полностью самозамкнутая Link-структура.",
    ),
    SemanticRuleSpec(
        "start-form-carrier",
        Layer.SEMANTICS,
        "start(F).start = start(F); start(F).end = F",
        "Reference carrier начала формы имеет самозамкнутый start-полюс.",
    ),
    SemanticRuleSpec(
        "end-form-carrier",
        Layer.SEMANTICS,
        "end(F).start = F; end(F).end = end(F)",
        "Reference carrier конца формы имеет самозамкнутый end-полюс.",
    ),
    SemanticRuleSpec(
        "link-inversion",
        Layer.SEMANTICS,
        "invert(Link(a, b)) = Link(b, a)",
        "Для уже различённой конкретной Link-структуры инверсия меняет направление.",
    ),
    SemanticRuleSpec(
        "contextual-equality",
        Layer.SEMANTICS,
        "eq(A, B) := start(A) = start(B) and end(A) = end(B)",
        "Форма (=) выполняется в виртуальном ContextFrame(A,B); её constraints локальны текущей интерпретации и не являются глобальным rewrite-rule.",
    ),
)


# В v0.2 blocker #79 принят через challenged/modelled contextual semantics.
# Нерешённые вопросы других уровней добавляются сюда только с конкретным issue.
OPEN_QUESTIONS: tuple[OpenQuestionSpec, ...] = ()


OPERATORS = (
    OperatorSpec(
        ":",
        Layer.FORMAL_LANGUAGE,
        (ValueKind.FORM, ValueKind.EXPRESSION),
        ValueKind.DEFINITION,
        10,
        Associativity.RIGHT,
        "Вводит именованную форму через expression, исполняемый в локальном контексте; не является L4-мутацией.",
    ),
    OperatorSpec(
        "=",
        Layer.FORMAL_LANGUAGE,
        (ValueKind.FORM, ValueKind.FORM),
        ValueKind.JUDGMENT,
        20,
        Associativity.NONE,
        "Строит локальное identity/unification constraint. Повтор glyph не создаёт глобальное связывание; замещения принадлежат одному запуску interpret.",
    ),
    OperatorSpec(
        "!=",
        Layer.FORMAL_LANGUAGE,
        (ValueKind.FORM, ValueKind.FORM),
        ValueKind.JUDGMENT,
        20,
        Associativity.NONE,
        "Строит суждение различимости как отрицание локального сопоставления форм.",
    ),
    OperatorSpec(
        "⟼",
        Layer.FORMAL_LANGUAGE,
        (ValueKind.FORM, ValueKind.FORM),
        ValueKind.FORM,
        40,
        Associativity.LEFT,
        "Строит упорядоченную Link-form; при interpret может служить структурным шаблоном и декомпозировать существующий LinkRef через poles().",
    ),
    OperatorSpec(
        "¬",
        Layer.FORMAL_LANGUAGE,
        (ValueKind.FORM,),
        ValueKind.FORM,
        60,
        Associativity.PREFIX,
        "Инвертирует форму; конкретная Link-инверсия задана accepted carrier rule.",
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
        "Круглая форма содержит ноль или одно L2 expression; grouping прозрачен для interpret.",
    ),
    OperatorSpec(
        "[...]",
        Layer.FORMAL_LANGUAGE,
        (ValueKind.FORM,),
        ValueKind.FORM,
        80,
        Associativity.CONTAINER,
        "Квадратная L2-форма. [] без содержимого — anonymous occurrence; glyph [ ] не перегружены context syntax и не тождественны L3-абитам автоматически.",
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
        "Разбирает сериализационный носитель без изменения апамяти.",
    ),
    ExecutionOperationSpec(
        "project",
        Layer.EXECUTION,
        ValueKind.RAW_ANUM,
        ValueKind.PROJECTION,
        False,
        False,
        "Применяет явный L3 context K без изменения апамяти.",
    ),
    ExecutionOperationSpec(
        "interpret",
        Layer.EXECUTION,
        ValueKind.EXPRESSION,
        ValueKind.MEMORY_QUERY,
        False,
        False,
        "Исполняет typed L2 expression относительно ContextFrame и MemoryView; возвращает локальные substitutions/aliases/trace без materialization.",
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
    _check_unique("open question", [item.name for item in OPEN_QUESTIONS], errors)
    _check_unique("L4 operation", [item.name for item in EXECUTION_OPERATIONS], errors)

    if any(item.layer is not Layer.FORMAL_LANGUAGE for item in OPERATORS):
        errors.append("all formal operators must belong to L2")
    if any(item.layer is not Layer.SEMANTICS for item in SEMANTIC_RULES):
        errors.append("all accepted reference semantic rules must belong to L1")
    if any(item.layer is not Layer.EXECUTION for item in EXECUTION_OPERATIONS):
        errors.append("all execution operations must belong to L4")

    if operator(":").operands != (ValueKind.FORM, ValueKind.EXPRESSION):
        errors.append("definition must accept Form × Expression in the canonical fixture")
    if not operator("{...}").variadic:
        errors.append("bundle container must accept a variadic expression list")

    if concept("issue-61-projection").status is not StatementStatus.EXPERIMENTAL:
        errors.append("issue #61 protocol projection must remain experimental")
    if concept("equality-meaning").status is not StatementStatus.DEFINITION:
        errors.append("contextual equality must be accepted in v0.2")
    if any(item.issue == 79 for item in OPEN_QUESTIONS):
        errors.append("accepted v0.2 reference model must not keep issue #79 as an open blocker")
    if "global" not in operator("=").denotation or "локаль" not in operator("=").denotation:
        errors.append("equality contract must explicitly distinguish local binding from global rewriting")

    for name in ("decode", "project", "interpret", "find"):
        operation = execution_operation(name)
        if operation.mutates_memory or operation.materializes_denotation:
            errors.append(f"{name} must be non-mutating and non-materializing")

    load = execution_operation("load")
    if not load.mutates_memory or load.materializes_denotation:
        errors.append("load may store raw carrier but must not materialize denotation")

    materializing = [
        item.name for item in EXECUTION_OPERATIONS if item.materializes_denotation
    ]
    if materializing != ["realize"]:
        errors.append("realize must be the only denotation-materializing operation")

    return tuple(errors)


def _check_unique(label: str, values: list[str], errors: list[str]) -> None:
    if len(values) != len(set(values)):
        errors.append(f"{label} names must be unique")
