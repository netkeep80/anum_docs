"""Declarative reference-model contract for MTS/Anum v0.1.

The module records layer boundaries and accepted semantic obligations. It is not
the L1 interpreter or the L5 prover. Unresolved theoretical contracts are kept
explicitly separate from accepted L1 rules so implementation cannot silently
promote a research hypothesis into the normative model.
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
        "Акорень допускает конечное циклическое представление полного самозамыкания.",
    ),
    ConceptSpec(
        "start-form",
        Layer.SEMANTICS,
        StatementStatus.DEFINITION,
        "Начало формы допускает циклическое самозамыкание start-полюса.",
    ),
    ConceptSpec(
        "end-form",
        Layer.SEMANTICS,
        StatementStatus.DEFINITION,
        "Конец формы допускает циклическое самозамыкание end-полюса.",
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
        "Корневая система вводит формальный смысл равенства `(=)`.",
    ),
    ConceptSpec(
        "equality-substitution-semantics",
        Layer.SEMANTICS,
        StatementStatus.EXPERIMENTAL,
        "Occurrence binding, substitutivity и congruence полного L2-оператора `=` не стабилизированы; см. issue #79.",
    ),
    ConceptSpec(
        "bundle",
        Layer.SEMANTICS,
        StatementStatus.DEFINITION,
        "Текущий fixture фиксирует экстенсиональные примеры пучков.",
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
        "Конкретная reference Link-структура имеет упорядоченные полюса start=a и end=b.",
    ),
    SemanticRuleSpec(
        "finite-cyclic-carrier",
        Layer.SEMANTICS,
        "Model = finite directed graph of Link nodes; cycles are allowed",
        "Самоссылочные Link-структуры можно хранить конечным циклическим carrier без бесконечного unfolding.",
    ),
    SemanticRuleSpec(
        "associative-root-carrier",
        Layer.SEMANTICS,
        "root.start = root; root.end = root",
        "Reference carrier акорня может быть одной полностью самозамкнутой Link-структурой; это не задаёт глобальные правила substitution по `=`.",
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
        "bundle-conformance",
        Layer.SEMANTICS,
        "{A, A} = {A}; {A, B} = {B, A}",
        "Fixture требует экстенсионального чтения перечисленных пучковых примеров; общая связь этого `=` с substitution semantics остаётся отдельным вопросом #79.",
    ),
)


OPEN_QUESTIONS = (
    OpenQuestionSpec(
        "equality-occurrence-binding",
        Layer.SEMANTICS,
        79,
        "Формализовать различие literal form, positional occurrence и повторного pattern slot после `:`; определить область `=`, substitution и congruence.",
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
        "Вводит target через шаблон/выражение; не является присваиванием или L4-мутацией. Полная binding semantics отслеживается #79.",
    ),
    OperatorSpec(
        "=",
        Layer.FORMAL_LANGUAGE,
        (ValueKind.FORM, ValueKind.FORM),
        ValueKind.JUDGMENT,
        20,
        Associativity.NONE,
        "Строит L2-суждение равенства. Полные substitutivity/congruence и связь с occurrence binding остаются experimental до #79.",
    ),
    OperatorSpec(
        "!=",
        Layer.FORMAL_LANGUAGE,
        (ValueKind.FORM, ValueKind.FORM),
        ValueKind.JUDGMENT,
        20,
        Associativity.NONE,
        "Строит L2-суждение различимости; его метасвойства не выводятся автоматически из глобальной модели `=`.",
    ),
    OperatorSpec(
        "⟼",
        Layer.FORMAL_LANGUAGE,
        (ValueKind.FORM, ValueKind.FORM),
        ValueKind.FORM,
        40,
        Associativity.LEFT,
        "Строит Link-form с упорядоченными позициями; правило congruence по `=` должно быть явно принято в #79.",
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
        errors.append("issue #61 protocol projection must remain experimental in v0.1")
    if concept("equality-substitution-semantics").status is not StatementStatus.EXPERIMENTAL:
        errors.append("full equality/substitution semantics must remain experimental until issue #79 is accepted")
    if not any(item.issue == 79 for item in OPEN_QUESTIONS):
        errors.append("reference model must expose equality occurrence blocker #79")
    if any(item.name == "equality" and "bisimilar" in item.equation for item in SEMANTIC_RULES):
        errors.append("global equality must not be hard-coded as bisimulation while #79 is open")

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
