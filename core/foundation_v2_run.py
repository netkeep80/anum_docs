"""Foundation-v2 exact multistep run container and read-only replay.

A run is an ordered chain of already-existing actual act occurrences:

    Run_0 = R
    Run_(i+1) = Run_i ⟼ A_i

The trusted checker reconstructs that chain from exact links, validates explicit
before/after context fields for every act and requires exact context continuity.
It does not reimplement individual act semantics, choose branches, infer logical
transitivity or materialize shortcut links.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence

from .exact_link_network import LinkNetwork, LinkNetworkBuilder, OccurrenceRef
from .foundation_v2_state import (
    FoundationStateError,
    act_header,
    act_values,
    current_of_context,
)


class RunReplayError(ValueError):
    """Selected multistep run evidence is forged or discontinuous."""


@dataclass(frozen=True)
class RunStepEvidence:
    """Exact act boundary evidence used only for run composition."""

    act: OccurrenceRef
    before_context: OccurrenceRef
    after_context: OccurrenceRef
    before_role: OccurrenceRef
    after_role: OccurrenceRef


@dataclass(frozen=True)
class RunEvidence:
    """Checker handle for one exact ordered selected run."""

    run_root: OccurrenceRef
    initial_context: OccurrenceRef
    terminal_context: OccurrenceRef
    steps: tuple[RunStepEvidence, ...]


def define_run_chain(
    builder: LinkNetworkBuilder,
    root: OccurrenceRef,
    acts: Sequence[OccurrenceRef],
) -> OccurrenceRef:
    """Construct the exact ordered container ``fold(R, A_0 ... A_n)``."""

    current = root
    for act in acts:
        cell = builder.reserve()
        builder.define(cell, current, act)
        current = cell
    return current


def replay_run(network: LinkNetwork, evidence: RunEvidence) -> tuple[OccurrenceRef, ...]:
    """Replay exact run ordering and persistent-context continuity read-only."""

    before_snapshot = network.snapshot()
    try:
        _verify_run_chain(network, evidence)
        if not evidence.steps:
            if evidence.run_root is not network.root:
                raise RunReplayError("empty run must terminate at exact root")
            if evidence.initial_context is not evidence.terminal_context:
                raise RunReplayError("empty run cannot change terminal context")
            _validate_context(network, evidence.initial_context, "initial")
            return ()

        previous_after: OccurrenceRef | None = None
        acts: list[OccurrenceRef] = []
        for index, step in enumerate(evidence.steps):
            _validate_context(network, step.before_context, f"step {index} before")
            _validate_context(network, step.after_context, f"step {index} after")
            _verify_step_act(network, step, index)

            if index == 0 and step.before_context is not evidence.initial_context:
                raise RunReplayError("first act does not start at exact initial context")
            if previous_after is not None and step.before_context is not previous_after:
                raise RunReplayError("adjacent acts do not share the same exact context")
            previous_after = step.after_context
            acts.append(step.act)

        if previous_after is not evidence.terminal_context:
            raise RunReplayError("last act does not end at exact terminal context")
        return tuple(acts)
    finally:
        if network.snapshot() != before_snapshot:
            raise RunReplayError("run replay mutated the network")


def _verify_run_chain(network: LinkNetwork, evidence: RunEvidence) -> None:
    current = evidence.run_root
    for step in reversed(evidence.steps):
        if current is network.root:
            raise RunReplayError("run chain ended before all selected acts")
        cell = network.link(current)
        if cell.end is not step.act:
            raise RunReplayError("run chain order or exact act occurrence is forged")
        current = cell.start
    if current is not network.root:
        raise RunReplayError("run chain does not terminate at exact root")


def _validate_context(network: LinkNetwork, context: OccurrenceRef, label: str) -> None:
    try:
        current_of_context(network, context)
    except FoundationStateError as exc:
        raise RunReplayError(f"{label} context is invalid") from exc


def _verify_step_act(network: LinkNetwork, step: RunStepEvidence, index: int) -> None:
    try:
        _, _, header_after = act_header(network, step.act)
    except FoundationStateError as exc:
        raise RunReplayError(f"step {index} has invalid actual-act header") from exc
    if header_after is not step.after_context:
        raise RunReplayError(f"step {index} act header selects another after-context")

    before_values = act_values(network, step.act, step.before_role)
    after_values = act_values(network, step.act, step.after_role)
    if before_values != (step.before_context,):
        raise RunReplayError(f"step {index} has forged/ambiguous before-context field")
    if after_values != (step.after_context,):
        raise RunReplayError(f"step {index} has forged/ambiguous after-context field")
