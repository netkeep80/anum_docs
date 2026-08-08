"""Read-only structural context analysis for typed MTS L2 expressions.

This module answers one deliberately narrow question: where does the typed AST
contain explicit ``ContextPronoun`` nodes?  It does not evaluate the expression,
open definitions, inspect associative memory, infer context sensitivity, or
claim context invariance when no pronoun is present.
"""

from dataclasses import dataclass
from typing import TypeAlias

from core.mtc_ast import (
    BundleForm,
    ContextPole,
    ContextPronoun,
    Definition,
    EndProjection,
    Equality,
    Expression,
    Inequality,
    Inversion,
    LinkForm,
    Literal,
    RoundForm,
    Sequence,
    SquareForm,
    StartProjection,
    Symbol,
)


AstPath: TypeAlias = tuple[int, ...]


@dataclass(frozen=True, order=True)
class DeicticOccurrence:
    """One explicit context-pronoun occurrence in structural typed-AST space."""

    path: AstPath
    up: int
    pole: ContextPole


def analyze_direct_deixis(expression: Expression) -> tuple[DeicticOccurrence, ...]:
    """Return all explicit deictic occurrences in deterministic preorder.

    Paths describe the typed AST itself:

    * round/square content and unary operands append ``0``;
    * binary left/right append ``0``/``1``;
    * bundle/sequence items append their item index;
    * definition target/body append ``0``/``1``.

    Grouping is therefore visible in a path.  Source spans, whitespace and
    canonical display formatting are not part of occurrence identity.
    """

    return _analyze(expression, ())


def _analyze(
    expression: Expression,
    path: AstPath,
) -> tuple[DeicticOccurrence, ...]:
    if isinstance(expression, ContextPronoun):
        return (DeicticOccurrence(path, expression.up, expression.pole),)

    found: list[DeicticOccurrence] = []
    for index, child in enumerate(_children(expression)):
        found.extend(_analyze(child, path + (index,)))
    return tuple(found)


def _children(expression: Expression) -> tuple[Expression, ...]:
    if isinstance(expression, (Symbol, Literal, ContextPronoun)):
        return ()
    if isinstance(expression, (RoundForm, SquareForm)):
        return () if expression.content is None else (expression.content,)
    if isinstance(expression, (BundleForm, Sequence)):
        return expression.items
    if isinstance(expression, (StartProjection, EndProjection, Inversion)):
        return (expression.value,)
    if isinstance(expression, (LinkForm, Equality, Inequality)):
        return (expression.left, expression.right)
    if isinstance(expression, Definition):
        return (expression.target, expression.value)
    raise TypeError(f"unsupported typed AST node: {type(expression).__name__}")
