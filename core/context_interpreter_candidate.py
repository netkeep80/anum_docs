"""Experimental read-only interpreter for contextual MTS notation v0.2.

The candidate has three semantic primitives beyond the existing L2 operators:

* each empty ``[]`` is an occurrence-local anonymous Link pattern;
* atomic ``◁`` / ``▷`` select the two roles of a virtual ``ContextFrame``;
* ``interpret`` resolves patterns against existing associative memory and returns
  local substitutions/aliases/trace without materializing anything.

``↑`` is a separate context-ascent operator for parent frames; it is not part of
pronoun identity and never overloads bracket syntax. Identity of anonymous forms
comes from typed-AST paths, not labels or source spans. Parentheses remain in the
AST for round-trip fidelity but are transparent to interpretation.
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
    RoundForm,
    SquareForm,
    StartProjection,
    Symbol,
)

LinkRef: TypeAlias = int
OccurrencePath: TypeAlias = tuple[int, ...]


class MemoryView(Protocol):
    def poles(self, link: LinkRef) -> tuple[LinkRef, LinkRef]: ...

    def find_link(self, start: LinkRef, end: LinkRef) -> LinkRef | None: ...

    def find_start_projection(self, form: LinkRef) -> LinkRef | None: ...

    def find_end_projection(self, form: LinkRef) -> LinkRef | None: ...


@dataclass(frozen=True)
class ContextFrame:
    """Virtual binary role environment; it need not exist as a Link in memory."""

    start: LinkRef
    end: LinkRef
    parent: "ContextFrame | None" = None


@dataclass(frozen=True, order=True)
class HoleId:
    """Semantic identity of one anonymous ``[]`` typed-AST occurrence."""

    path: OccurrencePath


@dataclass
class InterpretationState:
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


def resolve_context_pronoun(pronoun: ContextPronoun, frame: ContextFrame) -> LinkRef:
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
    state = InterpretationState(symbols=dict(symbols or {}))
    success = _interpret_expression(expression, (), frame, memory, state)
    return InterpretationResult(
        success=success,
        holes=tuple(sorted(_grounded_holes(state).items())),
        aliases=tuple(sorted(_normalized_aliases(state).items())),
        trace=tuple(state.trace),
    )


def _interpret_expression(
    expression: Expression,
    path: OccurrencePath,
    frame: ContextFrame,
    memory: MemoryView,
    state: InterpretationState,
) -> bool:
    if isinstance(expression, Equality):
        state.trace.append("equality")
        return _unify_forms(
            expression.left,
            path + (0,),
            expression.right,
            path + (1,),
            frame,
            memory,
            state,
        )

    if isinstance(expression, Inequality):
        state.trace.append("inequality")
        trial = state.clone()
        return not _unify_forms(
            expression.left,
            path + (0,),
            expression.right,
            path + (1,),
            frame,
            memory,
            trial,
        )

    if isinstance(expression, BundleForm):
        state.trace.append(f"bundle:{len(expression.items)}")
        for index, item in enumerate(expression.items):
            if not _interpret_expression(item, path + (index,), frame, memory, state):
                return False
        return True

    raise InterpretationError(
        "Candidate interpreter пока исполняет только constraints, получено "
        f"{type(expression).__name__}"
    )


def _unwrap_round(form: Form, path: OccurrencePath) -> tuple[Form, OccurrencePath]:
    """Remove grouping for semantics while preserving a structural path step."""

    while isinstance(form, RoundForm):
        if not isinstance(form.content, Form):
            raise InterpretationError("Круглая группировка должна содержать форму")
        form = form.content
        path = path + (0,)
    return form, path


def _unify_forms(
    left: Form,
    left_path: OccurrencePath,
    right: Form,
    right_path: OccurrencePath,
    frame: ContextFrame,
    memory: MemoryView,
    state: InterpretationState,
) -> bool:
    left, left_path = _unwrap_round(left, left_path)
    right, right_path = _unwrap_round(right, right_path)

    if _is_anonymous(left):
        left_hole = _resolve_form(left, left_path, frame, memory, state)
        assert isinstance(left_hole, HoleId)
        if _is_anonymous(right):
            right_hole = _resolve_form(right, right_path, frame, memory, state)
            assert isinstance(right_hole, HoleId)
            return _union_holes(left_hole, right_hole, state)
        right_value = _resolve_form(right, right_path, frame, memory, state)
        return (
            _union_holes(left_hole, right_value, state)
            if isinstance(right_value, HoleId)
            else _bind_hole(left_hole, right_value, state)
        )

    if _is_anonymous(right):
        right_hole = _resolve_form(right, right_path, frame, memory, state)
        assert isinstance(right_hole, HoleId)
        left_value = _resolve_form(left, left_path, frame, memory, state)
        return (
            _union_holes(left_value, right_hole, state)
            if isinstance(left_value, HoleId)
            else _bind_hole(right_hole, left_value, state)
        )

    if isinstance(left, LinkForm) and isinstance(right, LinkForm):
        return _unify_forms(
            left.left,
            left_path + (0,),
            right.left,
            right_path + (0,),
            frame,
            memory,
            state,
        ) and _unify_forms(
            left.right,
            left_path + (1,),
            right.right,
            right_path + (1,),
            frame,
            memory,
            state,
        )

    if isinstance(left, LinkForm):
        right_ref = _require_link(
            _resolve_form(right, right_path, frame, memory, state),
            "правый операнд =",
        )
        return _match_link_pattern(left, left_path, right_ref, frame, memory, state)

    if isinstance(right, LinkForm):
        left_ref = _require_link(
            _resolve_form(left, left_path, frame, memory, state),
            "левый операнд =",
        )
        return _match_link_pattern(right, right_path, left_ref, frame, memory, state)

    left_value = _resolve_form(left, left_path, frame, memory, state)
    right_value = _resolve_form(right, right_path, frame, memory, state)
    if isinstance(left_value, HoleId) and isinstance(right_value, HoleId):
        return _union_holes(left_value, right_value, state)
    if isinstance(left_value, HoleId):
        return _bind_hole(left_value, right_value, state)
    if isinstance(right_value, HoleId):
        return _bind_hole(right_value, left_value, state)
    return left_value == right_value


def _match_link_pattern(
    pattern: LinkForm,
    path: OccurrencePath,
    link: LinkRef,
    frame: ContextFrame,
    memory: MemoryView,
    state: InterpretationState,
) -> bool:
    start, end = memory.poles(link)
    state.trace.append(f"decompose:{link}->{start},{end}")
    return _unify_form_with_ref(
        pattern.left,
        path + (0,),
        start,
        frame,
        memory,
        state,
    ) and _unify_form_with_ref(
        pattern.right,
        path + (1,),
        end,
        frame,
        memory,
        state,
    )


def _unify_form_with_ref(
    form: Form,
    path: OccurrencePath,
    value: LinkRef,
    frame: ContextFrame,
    memory: MemoryView,
    state: InterpretationState,
) -> bool:
    form, path = _unwrap_round(form, path)
    if _is_anonymous(form):
        hole = _resolve_form(form, path, frame, memory, state)
        assert isinstance(hole, HoleId)
        return _bind_hole(hole, value, state)
    if isinstance(form, LinkForm):
        return _match_link_pattern(form, path, value, frame, memory, state)
    resolved = _resolve_form(form, path, frame, memory, state)
    return (
        _bind_hole(resolved, value, state)
        if isinstance(resolved, HoleId)
        else resolved == value
    )


def _resolve_form(
    form: Form,
    path: OccurrencePath,
    frame: ContextFrame,
    memory: MemoryView,
    state: InterpretationState,
) -> LinkRef | HoleId:
    form, path = _unwrap_round(form, path)

    if isinstance(form, ContextPronoun):
        resolved = resolve_context_pronoun(form, frame)
        state.trace.append(f"context:{_format_pronoun(form)}->{resolved}")
        return resolved

    if _is_anonymous(form):
        hole = HoleId(path)
        root = _find_root(hole, state)
        return state.holes.get(root, root)

    if isinstance(form, Symbol):
        try:
            return state.symbols[form.name]
        except KeyError as exc:
            raise InterpretationError(
                f"Символ {form.name!r} не связан в текущем окружении"
            ) from exc

    if isinstance(form, StartProjection):
        value = _require_link(
            _resolve_form(form.value, path + (0,), frame, memory, state),
            "♀",
        )
        projected = memory.find_start_projection(value)
        if projected is None:
            raise InterpretationError(
                f"Форма начала для {value} не различена; interpret не выполняет realize"
            )
        state.trace.append(f"start:{value}->{projected}")
        return projected

    if isinstance(form, EndProjection):
        value = _require_link(
            _resolve_form(form.value, path + (0,), frame, memory, state),
            "♂",
        )
        projected = memory.find_end_projection(value)
        if projected is None:
            raise InterpretationError(
                f"Форма конца для {value} не различена; interpret не выполняет realize"
            )
        state.trace.append(f"end:{value}->{projected}")
        return projected

    if isinstance(form, LinkForm):
        left = _require_link(
            _resolve_form(form.left, path + (0,), frame, memory, state),
            "левый полюс ⟼",
        )
        right = _require_link(
            _resolve_form(form.right, path + (1,), frame, memory, state),
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


def _is_anonymous(form: Form) -> bool:
    return isinstance(form, SquareForm) and form.content is None


def _require_link(value: LinkRef | HoleId, role: str) -> LinkRef:
    if isinstance(value, HoleId):
        raise InterpretationError(
            f"{role} нельзя разрешить до связывания анонимной формы {value}"
        )
    return value


def _find_root(hole: HoleId, state: InterpretationState) -> HoleId:
    parent = state.aliases.get(hole)
    if parent is None:
        state.aliases[hole] = hole
        return hole
    if parent == hole:
        return hole
    root = _find_root(parent, state)
    state.aliases[hole] = root
    return root


def _union_holes(left: HoleId, right: HoleId, state: InterpretationState) -> bool:
    left_root, right_root = _find_root(left, state), _find_root(right, state)
    if left_root == right_root:
        return True
    left_bound, right_bound = state.holes.get(left_root), state.holes.get(right_root)
    if left_bound is not None and right_bound is not None and left_bound != right_bound:
        return False
    root, child = sorted((left_root, right_root))
    state.aliases[root] = root
    state.aliases[child] = root
    state.holes.pop(left_root, None)
    state.holes.pop(right_root, None)
    bound = left_bound if left_bound is not None else right_bound
    if bound is not None:
        state.holes[root] = bound
    state.trace.append(f"alias:{child}->{root}")
    return True


def _bind_hole(hole: HoleId, value: LinkRef, state: InterpretationState) -> bool:
    root = _find_root(hole, state)
    existing = state.holes.get(root)
    if existing is not None:
        return existing == value
    state.holes[root] = value
    state.trace.append(f"bind:{root}->{value}")
    return True


def _grounded_holes(state: InterpretationState) -> dict[HoleId, LinkRef]:
    result: dict[HoleId, LinkRef] = {}
    for hole in tuple(state.aliases):
        root = _find_root(hole, state)
        bound = state.holes.get(root)
        if bound is not None:
            result[hole] = bound
    result.update(state.holes)
    return result


def _normalized_aliases(state: InterpretationState) -> dict[HoleId, HoleId]:
    result: dict[HoleId, HoleId] = {}
    for hole in tuple(state.aliases):
        root = _find_root(hole, state)
        if root != hole:
            result[hole] = root
    return result


def _format_pronoun(pronoun: ContextPronoun) -> str:
    return "↑" * pronoun.up + pronoun.pole.value
