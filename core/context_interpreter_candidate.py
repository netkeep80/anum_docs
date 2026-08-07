"""Experimental contextual interpreter for MTS formal notation v0.2.

This module tests the semantic direction behind issue #79. It is intentionally
small and read-only:

* every empty ``[]`` occurrence is an anonymous local link hole;
* ``$[`` / ``$]`` are deictic references to the two poles of a context link;
* repeated ``$`` ascends the execution-context stack;
* ``=`` performs local unification and returns substitutions;
* interpretation never turns equality into a global rewrite rule;
* memory mutation/materialization remains a separate L4 operation.

The memory interface is deliberately abstract so the model can later run over
real apamemory instead of owning another storage implementation.
"""

from dataclasses import dataclass, field
from typing import Protocol, TypeAlias

from core.mtc_ast import (
    BundleForm,
    ContextPath,
    ContextPole,
    Equality,
    Expression,
    Form,
    Inequality,
    LinkForm,
    SquareForm,
    Symbol,
)


LinkRef: TypeAlias = int


class MemoryView(Protocol):
    """Read-only associative-memory surface required by interpretation."""

    def poles(self, link: LinkRef) -> tuple[LinkRef, LinkRef]: ...

    def find_link(self, start: LinkRef, end: LinkRef) -> LinkRef | None: ...


@dataclass(frozen=True)
class ContextFrame:
    """One instantiated binary-link interpretation context."""

    link: LinkRef
    parent: "ContextFrame | None" = None


@dataclass(frozen=True, order=True)
class HoleId:
    """Identity of one anonymous ``[]`` AST occurrence inside one source."""

    start: int
    end: int


@dataclass
class InterpretationState:
    """Local substitutions produced while resolving one expression."""

    symbols: dict[str, LinkRef] = field(default_factory=dict)
    holes: dict[HoleId, LinkRef] = field(default_factory=dict)
    trace: list[str] = field(default_factory=list)

    def clone(self) -> "InterpretationState":
        return InterpretationState(
            symbols=dict(self.symbols),
            holes=dict(self.holes),
            trace=list(self.trace),
        )


@dataclass(frozen=True)
class InterpretationResult:
    success: bool
    holes: tuple[tuple[HoleId, LinkRef], ...]
    trace: tuple[str, ...]


class InterpretationError(ValueError):
    pass


def resolve_context_path(
    path: ContextPath,
    frame: ContextFrame,
    memory: MemoryView,
) -> LinkRef:
    """Resolve a binary path from current/ancestor context into the aseti."""

    anchor = frame
    for _ in range(path.up):
        if anchor.parent is None:
            raise InterpretationError(
                f"Контекстный путь поднимается выше корневого контекста: up={path.up}"
            )
        anchor = anchor.parent

    current = anchor.link
    for step in path.steps:
        start, end = memory.poles(current)
        current = start if step is ContextPole.START else end
    return current


def interpret_constraints(
    expression: Expression,
    frame: ContextFrame,
    memory: MemoryView,
    *,
    symbols: dict[str, LinkRef] | None = None,
) -> InterpretationResult:
    """Resolve a judgment/bundle and return its local substitution set."""

    state = InterpretationState(symbols=dict(symbols or {}))
    success = _interpret_expression(expression, frame, memory, state)
    return InterpretationResult(
        success=success,
        holes=tuple(sorted(state.holes.items())),
        trace=tuple(state.trace),
    )


def _interpret_expression(
    expression: Expression,
    frame: ContextFrame,
    memory: MemoryView,
    state: InterpretationState,
) -> bool:
    if isinstance(expression, Equality):
        state.trace.append("equality")
        return _unify_forms(expression.left, expression.right, frame, memory, state)

    if isinstance(expression, Inequality):
        state.trace.append("inequality")
        trial = state.clone()
        return not _unify_forms(expression.left, expression.right, frame, memory, trial)

    if isinstance(expression, BundleForm):
        state.trace.append(f"bundle:{len(expression.items)}")
        for item in expression.items:
            if not _interpret_expression(item, frame, memory, state):
                return False
        return True

    raise InterpretationError(
        f"Candidate interpreter пока исполняет только constraints, получено {type(expression).__name__}"
    )


def _unify_forms(
    left: Form,
    right: Form,
    frame: ContextFrame,
    memory: MemoryView,
    state: InterpretationState,
) -> bool:
    left_value = _resolve_form(left, frame, memory, state)
    right_value = _resolve_form(right, frame, memory, state)

    if isinstance(left_value, HoleId) and isinstance(right_value, HoleId):
        left_bound = state.holes.get(left_value)
        right_bound = state.holes.get(right_value)
        if left_bound is not None and right_bound is not None:
            return left_bound == right_bound
        if left_bound is not None:
            state.holes[right_value] = left_bound
            state.trace.append(f"bind:{right_value}->{left_bound}")
            return True
        if right_bound is not None:
            state.holes[left_value] = right_bound
            state.trace.append(f"bind:{left_value}->{right_bound}")
            return True

        # Two distinct anonymous holes do not become a permanent global alias.
        # They remain unresolved until one side is grounded by another local
        # constraint. This avoids inventing an extra union-find semantics here.
        state.trace.append(f"defer-hole-equality:{left_value}:{right_value}")
        return True

    if isinstance(left_value, HoleId):
        return _bind_hole(left_value, right_value, state)
    if isinstance(right_value, HoleId):
        return _bind_hole(right_value, left_value, state)

    return left_value == right_value


def _resolve_form(
    form: Form,
    frame: ContextFrame,
    memory: MemoryView,
    state: InterpretationState,
) -> LinkRef | HoleId:
    if isinstance(form, ContextPath):
        resolved = resolve_context_path(form, frame, memory)
        state.trace.append(f"context:{_format_path(form)}->{resolved}")
        return resolved

    if isinstance(form, SquareForm) and form.content is None:
        hole = HoleId(form.span.start, form.span.end)
        bound = state.holes.get(hole)
        return bound if bound is not None else hole

    if isinstance(form, Symbol):
        try:
            return state.symbols[form.name]
        except KeyError as exc:
            raise InterpretationError(
                f"Символ {form.name!r} не связан в текущем окружении"
            ) from exc

    if isinstance(form, LinkForm):
        left = _resolve_form(form.left, frame, memory, state)
        right = _resolve_form(form.right, frame, memory, state)
        if isinstance(left, HoleId) or isinstance(right, HoleId):
            raise InterpretationError(
                "Нельзя разрешить составную связь до связывания её анонимных полюсов"
            )
        found = memory.find_link(left, right)
        if found is None:
            raise InterpretationError(
                f"Связь ({left} ⟼ {right}) не материализована; interpret не выполняет realize"
            )
        return found

    raise InterpretationError(
        f"Candidate interpreter ещё не разрешает форму {type(form).__name__}"
    )


def _bind_hole(
    hole: HoleId,
    value: LinkRef | HoleId,
    state: InterpretationState,
) -> bool:
    if isinstance(value, HoleId):
        raise InterpretationError("Внутренняя ошибка: hole-hole binding должен быть обработан раньше")

    existing = state.holes.get(hole)
    if existing is not None:
        return existing == value

    state.holes[hole] = value
    state.trace.append(f"bind:{hole}->{value}")
    return True


def _format_path(path: ContextPath) -> str:
    return "$" * (path.up + 1) + "".join(step.value for step in path.steps)
