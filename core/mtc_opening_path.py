"""Canonical read-only verifier for finite MTS definition-opening paths.

``DefinitionOpeningPath`` is deliberately an operational composite certificate,
not equality, rewriting, normalization, or evaluation.  The verifier replays
exactly the serialized/typed edges supplied by the caller against one explicit
``DefinitionEnvironment`` and stops after the last edge.
"""

from dataclasses import dataclass
from enum import Enum

from core.mtc_ast import Expression, Form, structural_key
from core.mtc_definitions import (
    DefinitionEnvironment,
    DefinitionId,
    DefinitionLookupKind,
    open_definition,
)


@dataclass(frozen=True)
class OpeningPathEdge:
    """One expected successful ``open_definition`` edge."""

    target: Form
    definition_id: DefinitionId
    body: Expression


@dataclass(frozen=True)
class OpeningPathWitness:
    """Self-contained typed path substrate apart from its explicit environment."""

    start_target: Form
    edges: tuple[OpeningPathEdge, ...]
    final_body: Expression


class OpeningPathFailure(str, Enum):
    EMPTY_PATH = "empty-path"
    START_TARGET_MISMATCH = "start-target-mismatch"
    PREVIOUS_BODY_NOT_FORM = "previous-body-not-form"
    ADJACENCY_MISMATCH = "adjacency-mismatch"
    OPENING_NOT_MATCH = "opening-not-match"
    DEFINITION_ID_MISMATCH = "definition-id-mismatch"
    REPEATED_DEFINITION_ID = "repeated-definition-id"
    BODY_MISMATCH = "body-mismatch"
    FINAL_BODY_MISMATCH = "final-body-mismatch"


@dataclass(frozen=True)
class OpeningPathReplayResult:
    """Fail-closed replay result with deterministic diagnostic coordinates."""

    accepted: bool
    failure: OpeningPathFailure | None = None
    failed_edge: int | None = None


def verify_opening_path(
    witness: OpeningPathWitness,
    environment: DefinitionEnvironment,
) -> OpeningPathReplayResult:
    """Independently replay exactly one finite definition-opening path.

    ``environment`` is already the explicit lexical lookup scope chosen by the
    caller.  The verifier never walks beyond the serialized edge count and
    never evaluates an RHS or reads any runtime evaluation substrate.
    """

    if not witness.edges:
        return _failure(OpeningPathFailure.EMPTY_PATH)

    used_ids: set[DefinitionId] = set()
    previous_body: Expression | None = None

    for index, edge in enumerate(witness.edges):
        if index == 0:
            if not _same_expression(edge.target, witness.start_target):
                return _failure(OpeningPathFailure.START_TARGET_MISMATCH, index)
        else:
            if not isinstance(previous_body, Form):
                return _failure(OpeningPathFailure.PREVIOUS_BODY_NOT_FORM, index)
            if not _same_expression(edge.target, previous_body):
                return _failure(OpeningPathFailure.ADJACENCY_MISMATCH, index)

        opening = open_definition(edge.target, environment)
        if opening.kind is not DefinitionLookupKind.MATCH:
            return _failure(OpeningPathFailure.OPENING_NOT_MATCH, index)
        if opening.definition_id is None or opening.body is None:
            return _failure(OpeningPathFailure.OPENING_NOT_MATCH, index)

        if opening.definition_id != edge.definition_id:
            return _failure(OpeningPathFailure.DEFINITION_ID_MISMATCH, index)
        if opening.definition_id in used_ids:
            return _failure(OpeningPathFailure.REPEATED_DEFINITION_ID, index)
        used_ids.add(opening.definition_id)

        if not _same_expression(opening.body, edge.body):
            return _failure(OpeningPathFailure.BODY_MISMATCH, index)
        previous_body = opening.body

    assert previous_body is not None
    if not _same_expression(previous_body, witness.final_body):
        return _failure(OpeningPathFailure.FINAL_BODY_MISMATCH)

    return OpeningPathReplayResult(accepted=True)


def _same_expression(left: Expression, right: Expression) -> bool:
    return structural_key(left) == structural_key(right)


def _failure(
    failure: OpeningPathFailure,
    failed_edge: int | None = None,
) -> OpeningPathReplayResult:
    return OpeningPathReplayResult(
        accepted=False,
        failure=failure,
        failed_edge=failed_edge,
    )
