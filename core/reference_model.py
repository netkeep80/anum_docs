"""Declarative reference-model contract for MTS/Anum v0.2.

This module is the machine-readable source for architectural layer boundaries,
accepted L1 obligations, L2 operator types and L4 effect boundaries. It is not
the semantic carrier implementation or the L5 proof kernel.
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
        "Акорень имеет конечный cyclic carrier полного самозамыкания.",
    ),
    ConceptSpec(
        "start-form",
        Layer.SEMANTICS,
        StatementStatus.DEFINITION,
        "Начало формы имеет self-closed start-полюс.",
    ),
    ConceptSpec(
        "end-form",
        Layer.SEMANTICS,
        StatementStatus.DEFINITION,
        "Конец формы имеет self-closed end-полюс.",
    ),
    ConceptSpec(
        "inversion",
        Layer.SEMANTICS,
        StatementStatus.DEFINITION,
        "Инверсия конкретной Link-структуры меняет местами её полюса.",
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
        "Пучковая algebra относится к semantic/conformance-слою, а не к root definitions.",
    ),
    ConceptSpec(
        "formal-notation",
        Layer.FORMAL_LANGUAGE,
        StatementStatus.DEFINITION,
        "L2 различает Form, Judgment и Definition через typed AST.",
    ),
    ConceptSpec(
        "context-pronouns",
        Layer.FORMAL_LANGUAGE,
        StatementStatus.DEFINITION,
        "◁ и ▷ — два атомарных местоимения start/end текущего ContextFrame; ↑ поднимает к parent context.",
    ),
    ConceptSpec(
        "anonymous-form",
        Layer.FORMAL_LANGUAGE,
        StatementStatus.DEFINITION,
        "Каждое [] — самостоятельное anonymous occurrence с identity по structural typed-AST path.",
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
        "Проекция []→0 и ][→1 остаётся рабочей L3-гипотезой issue #61.",
    ),
    ConceptSpec(
        "formal-interpretation",
        Layer.EXECUTION,
        StatementStatus.DEFINITION,
        "interpret исполняет L2 pattern относительно ContextFrame/MemoryView и возвращает локальные substitutions без materialization.",
    ),
    ConceptSpec(
        "memory-execution",
        Layer.EXECUTION,
        StatementStatus.DEFINITION,
        "Read-only interpretation/find отделены от explicit realize/delete effects.",
    ),
    ConceptSpec(
        "proof-system",
        Layer.INFERENCE,
        StatementStatus.EXPERIMENTAL,
        "Trusted L5 proof rules ещё не приняты.",
    ),
)


SEMANTIC_RULES = (
    SemanticRuleSpec(
        "link",
        Layer.SEMANTICS,
        "Link(a, b)",
        "Concrete Link carrier has ordered start=a and end=b poles.",
    ),
    SemanticRuleSpec(
        "finite-cyclic-carrier",
        Layer.SEMANTICS,
        "Model = finite directed graph of Link nodes; cycles are allowed",
        "Self-reference is represented by finite cycles without infinite unfolding.",
    ),
    SemanticRuleSpec(
        "associative-root-carrier",
        Layer.SEMANTICS,
        "root.start = root; root.end = root",
        "Акорень может быть одной полностью self-closed Link-структурой.",
    ),
    SemanticRuleSpec(
        "start-form-carrier",
        Layer.SEMANTICS,
        "start(F).start = start(F); start(F).end = F",
        "Carrier начала формы замкнут по start.",
    ),
    SemanticRuleSpec(
        "end-form-carrier",
        Layer.SEMANTICS,
        "end(F).start = F; end(F).end = end(F)",
        "Carrier конца формы замкнут по end.",
    ),
    SemanticRuleSpec(
        "link-inversion",
        Layer.SEMANTICS,
        "invert(Link(a, b)) = Link(b, a)",
        "Инверсия concrete Link меняет направление.",
    ),
    SemanticRuleSpec(
        "contextual-equality",
        Layer.SEMANTICS,
        "eq(A, B) := start(A) = start(B) and end(A) = end(B)",
        "(=) исполняется в ContextFrame(A,B); constraints принадлежат только текущей интерпретации.",
    ),
)


# Accepted v0.2 has no unresolved L1/L2 blocker. New open questions are added
# only with an explicit issue and layer assignment.
OPEN_QUESTIONS: tuple[OpenQuestionSpec, ...] = ()


OPERATORS = (
    OperatorSpec(
        ":",
        Layer.FORMAL_LANGUAGE,
        (ValueKind.FORM, ValueKind.EXPRESSION),
        ValueKind.DEFINITION,
        10,
        Associativity.RIGHT,
        "Вводит именованную форму через локально интерпретируемое expression; не является L4-мутацией.",
    ),
    OperatorSpec(
        "=",
        Layer.FORMAL_LANGUAGE,
        (ValueKind.FORM, ValueKind.FORM),
        ValueKind.JUDGMENT,
        20,
        Associativity.NONE,
        "Строит локальное identity/unification constraint; не создаёт глобальное связывание или rewrite-rule.",
    ),
    OperatorSpec(
        "!=",
        Layer.FORMAL_LANGUAGE,
        (ValueKind.FORM, ValueKind.FORM),
        ValueKind.JUDGMENT,
        20,
        Associativity.NONE,
        "Строит суждение различимости как отрицание локального сопоставления.",
    ),
    OperatorSpec(
        "⟼",
        Layer.FORMAL_LANGUAGE,
        (ValueKind.FORM, ValueKind.FORM),
        ValueKind.FORM,
        40,
        Associativity.LEFT,
        "Строит ordered LinkForm; interpret может использовать её как pattern и декомпозировать существующий LinkRef через poles().",
    ),
    OperatorSpec(
        "¬",
        Layer.FORMAL_LANGUAGE,
        (ValueKind.FORM,),
        ValueKind.FORM,
        60,
        Associativity.PREFIX,
        "Инвертирует форму.",
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
        "RoundForm сохраняет grouping в AST; grouping прозрачен для interpret.",
    ),
    OperatorSpec(
        "[...]",
        Layer.FORMAL_LANGUAGE,
        (ValueKind.FORM,),
        ValueKind.FORM,
        80,
        Associativity.CONTAINER,
        "SquareForm L2; [] является anonymous occurrence, а [ ] не перегружаются context syntax и не тождественны L3-абитам автоматически.",
    ),
    OperatorSpec(
        "{...}",
        Layer.FORMAL_LANGUAGE,
        (ValueKind.EXPRESSION,),
        ValueKind.BUNDLE,
        80,
        Associativity.CONTAINER,
        "BundleForm содержит ноль или более L2 expressions.",
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
        "Исполняет typed L2 expression относительно ContextFrame и MemoryView; возвращает substitutions/aliases/trace без materialization.",
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
        "Явно материализует denotation либо возвращает существующую canonical Link.",
    ),
    ExecutionOperationSpec(
        "delete",
        Layer.EXECUTION,
        ValueKind.PROJECTION,
        ValueKind.MEMORY_EFFECT,
        True,
        False,
        "Явно удаляет materialized structure.",
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
        errors.append("definition must accept Form × Expression")
    if not operator("{...}").variadic:
        errors.append("bundle container must accept a variadic expression list")

    if concept("issue-61-projection").status is not StatementStatus.EXPERIMENTAL:
        errors.append("issue #61 protocol projection must remain experimental")
    if concept("equality-meaning").status is not StatementStatus.DEFINITION:
        errors.append("contextual equality must be accepted in v0.2")
    if any(item.issue == 79 for item in OPEN_QUESTIONS):
        errors.append("v0.2 must not keep accepted issue #79 as an open blocker")

    equality_denotation = operator("=").denotation
    if "локаль" not in equality_denotation or "глобаль" not in equality_denotation:
        errors.append("equality must distinguish local binding from global rewriting")

    square_denotation = operator("[...]").denotation
    if "не перегружаются context syntax" not in square_denotation:
        errors.append("square brackets must remain independent from context pronouns")

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
