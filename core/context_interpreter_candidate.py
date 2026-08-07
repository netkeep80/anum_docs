"""Experimental contextual interpreter for MTS formal notation v0.2.

The candidate deliberately separates three things:

* formal syntax is parsed into a query/pattern AST;
* interpretation runs in a virtual binary ``ContextFrame`` and returns local
  substitutions/trace;
* associative-memory mutation remains an explicit L4 operation.

Every empty ``[]`` occurrence is an anonymous local link form. ``$[`` and ``$]``
are the only primitive contextual pronouns: first/start and second/end roles of
the current frame. A frame itself does not have to be materialized as a Link in
memory, so interpreting ``A = B`` never needs to create the auxiliary link
``A ⟼ B`` first.
"""

from dataclasses import dataclass, field
from typing import Protocol, TypeAlias

from core.mtc_ast import (
    BundleForm,
    ContextPole,
    ContextPronoun,
    EndProjection,
    Equality,
    Expression,
    Form,
    Inequality,
    LinkForm,
    SquareForm,
    StartProjection,
    Symbol,
)


LinkRef: TypeAlias = int


class MemoryView(Protocol):
    """Read-only associative-memory surface required by interpretation."""

    def find_link(self, start: LinkRef, end: LinkRef) -> LinkRef | None: ...

    def find_start_projection(self, form: LinkRef) -> LinkRef | None:
        """Find ``S`` where ``S = Link(S, form)`` without materialization."""
        ...

    def find_end_projection(self, form: LinkRef) -> LinkRef | None:
        """Find ``E`` where ``E = Link(form, E)`` without materialization."""
        ...


@dataclass(frozen=True)
class ContextFrame:
    """Virtual binary role environment for one interpretation step.

    ``start`` and ``end`` are the two role values exposed by ``$[`` and ``$]``.
    The frame is interpreter state, not a third MTS operand and not necessarily
    a materialized Link in associative memory.
    """

    start: LinkRef
    end: LinkRef
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
    aliases: dict[HoleId, HoleId] = field(default_factory=dict)
    trace: list[str] = field(default_factory=list)

    def clone(self) -> "InterpretationState":
        return InterpretationState(
            symbols=dict(self.symbols),
            holes=dict(self.holes),
            aliases=dict(self.aliases),
            trace=list(self.trace),
        )


@dataclass(frozen=True)
class InterpretationResult:
    success: bool
    holes: tuple[tuple[HoleId, LinkRef], ...]
    aliases: tuple[tuple[HoleId, HoleId], ...]
    trace: tuple[str, ...]


class InterpretationError(ValueError):
    pass


def resolve_context_pronoun(
    pronoun: ContextPronoun,
    frame: ContextFrame,
) -> LinkRef:
    """Resolve one of two roles of the current/ancestor context frame."""

    anchor = frame
    for _ in range(pronoun.up):
        if anchor.parent is None:
            raise InterpretationError(
                "Контекстное местоимение поднимается выше корневого контекста: "
                f"up={pronoun.up}"
            )
        anchor = anchor.parent

    return anchor.start if pronoun.pole is ContextPole.START else anchor.end


def interpret_constraints(
    expression: Expression,
    frame: ContextFrame,
    memory: MemoryView,
    *,
    symbols: dict[str, LinkRef] | None = None,
) -> InterpretationResult:
    """Resolve one judgment/bundle and return local substitutions and trace."""

    state = InterpretationState(symbols=dict(symbols or {}))
    success = _interpret_expression(expression, frame, memory, state)
    return InterpretationResult(
        success=success,
        holes=tuple(sorted(_grounded_holes(state).items())),
        aliases=tuple(sorted(_normalized_aliases(state).items())),
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
        "Candidate interpreter пока исполняет только constraints, получено "
        f"{type(expression).__name__}"
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
        return _union_holes(left_value, right_value, state)
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
    if isinstance(form, ContextPronoun):
        resolved = resolve_context_pronoun(form, frame)
        state.trace.append(f"context:{_format_pronoun(form)}->{resolved}")
        return resolved

    if isinstance(form, SquareForm) and form.content is None:
        hole = HoleId(form.span.start, form.span.end)
        root = _find_hole_root(hole, state)
        bound = state.holes.get(root)
        return bound if bound is not None else root

    if isinstance(form, Symbol):
        try:
            return state.symbols[form.name]
        except KeyError as exc:
            raise InterpretationError(
                f"Символ {form.name!r} не связан в текущем окружении"
            ) from exc

    if isinstance(form, StartProjection):
        value = _require_resolved_link(
            _resolve_form(form.value, frame, memory, state),
            "♀",
        )
        projected = memory.find_start_projection(value)
        if projected is None:
            raise InterpretationError(
                f"Форма начала для {value} не различена в апамяти; interpret не выполняет realize"
            )
        state.trace.append(f"start:{value}->{projected}")
        return projected

    if isinstance(form, EndProjection):
        value = _require_resolved_link(
            _resolve_form(form.value, frame, memory, state),
            "♂",
        )
        projected = memory.find_end_projection(value)
        if projected is None:
            raise InterpretationError(
                f"Форма конца для {value} не различена в апамяти; interpret не выполняет realize"
            )
        state.trace.append(f"end:{value}->{projected}")
        return projected

    if isinstance(form, LinkForm):
        left = _require_resolved_link(
            _resolve_form(form.left, frame, memory, state),
            "левый полюс ⟼",
        )
        right = _require_resolved_link(
            _resolve_form(form.right, frame, memory, state),
            "правый полюс ⟼",
        )
        found = memory.find_link(left, right)
        if found is None:
            raise InterpretationError(
                f"Связь ({left} ⟼ {right}) не различена; interpret не выполняет realize"
            )
        state.trace.append(f"link:{left},{right}->{found}")
        return found

    raise InterpretationError(
        f"Candidate interpreter ещё не разрешает форму {type(form).__name__}"
    )


def _require_resolved_link(value: LinkRef | HoleId, role: str) -> LinkRef:
    if isinstance(value, HoleId):
        raise InterpretationError(
            f"{role} нельзя разрешить до связывания анонимной формы {value}"
        )
    return value


def _find_hole_root(hole: HoleId, state: InterpretationState) -> HoleId:
    parent = state.aliases.get(hole)
    if parent is None:
        state.aliases[hole] = hole
        return hole
    if parent == hole:
        return hole
    root = _find_hole_root(parent, state)
    state.aliases[hole] = root
    return root


def _union_holes(left: HoleId, right: HoleId, state: InterpretationState) -> bool:
    left_root = _find_hole_root(left, state)
    right_root = _find_hole_root(right, state)
    if left_root == right_root:
        return True

    left_bound = state.holes.get(left_root)
    right_bound = state.holes.get(right_root)
    if left_bound is not None and right_bound is not None and left_bound != right_bound:
        return False

    root, child = sorted((left_root, right_root))
    state.aliases[child] = root
    state.aliases[root] = root

    bound = left_bound if left_bound is not None else right_bound
    state.holes.pop(left_root, None)
    state.holes.pop(right_root, None)
    if bound is not None:
        state.holes[root] = bound

    state.trace.append(f"alias:{child}->{root}")
    return True


def _bind_hole(
    hole: HoleId,
    value: LinkRef | HoleId,
    state: InterpretationState,
) -> bool:
    if isinstance(value, HoleId):
        return _union_holes(hole, value, state)

    root = _find_hole_root(hole, state)
    existing = state.holes.get(root)
    if existing is not None:
        return existing == value

    state.holes[root] = value
    state.trace.append(f"bind:{root}->{value}")
    return True


def _grounded_holes(state: InterpretationState) -> dict[HoleId, LinkRef]:
    result: dict[HoleId, LinkRef] = {}
    for hole in tuple(state.aliases):
        root = _find_hole_root(hole, state)
        bound = state.holes.get(root)
        if bound is not None:
            result[hole] = bound
    for root, bound in state.holes.items():
        result[root] = bound
    return result


def _normalized_aliases(state: InterpretationState) -> dict[HoleId, HoleId]:
    result: dict[HoleId, HoleId] = {}
    for hole in tuple(state.aliases):
        root = _find_hole_root(hole, state)
        if root != hole:
            result[hole] = root
    return result


def _format_pronoun(pronoun: ContextPronoun) -> str:
    return "$" * (pronoun.up + 1) + pronoun.pole.value
