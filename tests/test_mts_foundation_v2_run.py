from __future__ import annotations

from dataclasses import replace
from pathlib import Path

import pytest

from core.exact_link_network import LinkNetworkBuilder
from core.foundation_v2_run import (
    RunEvidence,
    RunReplayError,
    RunStepEvidence,
    define_run_chain,
    replay_run,
)
from core.foundation_v2_state import (
    define_act_field,
    define_act_header,
    define_context,
    define_dictionary_scope,
)


ROOT = Path(__file__).resolve().parents[1]


def _anchor(builder: LinkNetworkBuilder):
    ref = builder.reserve()
    builder.define(ref, ref, ref)
    return ref


def _context(builder: LinkNetworkBuilder, parent=None, current=None):
    return define_context(
        builder,
        parent if parent is not None else _anchor(builder),
        current if current is not None else _anchor(builder),
    )


def _act(builder, root, before, after, before_role=None, after_role=None):
    interpreter = _anchor(builder)
    role_dictionary = define_dictionary_scope(builder, root, root)
    before_role = before_role or _anchor(builder)
    after_role = after_role or _anchor(builder)
    act = define_act_header(builder, interpreter, role_dictionary, after)
    define_act_field(builder, act, before_role, before)
    define_act_field(builder, act, after_role, after)
    return RunStepEvidence(
        act=act,
        before_context=before,
        after_context=after,
        before_role=before_role,
        after_role=after_role,
    )


def _run(builder, root, steps, initial, terminal):
    run_root = define_run_chain(builder, root, tuple(step.act for step in steps))
    return RunEvidence(
        run_root=run_root,
        initial_context=initial,
        terminal_context=terminal,
        steps=tuple(steps),
    )


def test_linear_run_replays_exact_k_continuity_read_only() -> None:
    builder = LinkNetworkBuilder()
    root = _anchor(builder)
    k0 = _context(builder)
    k1 = _context(builder)
    k2 = _context(builder)
    step0 = _act(builder, root, k0, k1)
    step1 = _act(builder, root, k1, k2)
    evidence = _run(builder, root, (step0, step1), k0, k2)
    network = builder.freeze(root)
    before = network.snapshot()

    assert replay_run(network, evidence) == (step0.act, step1.act)
    assert network.snapshot() == before


def test_reordered_selected_steps_reject_against_exact_run_chain() -> None:
    builder = LinkNetworkBuilder()
    root = _anchor(builder)
    k0 = _context(builder)
    k1 = _context(builder)
    k2 = _context(builder)
    step0 = _act(builder, root, k0, k1)
    step1 = _act(builder, root, k1, k2)
    good = _run(builder, root, (step0, step1), k0, k2)
    forged = replace(good, steps=(step1, step0))
    network = builder.freeze(root)

    with pytest.raises(RunReplayError, match="order or exact act"):
        replay_run(network, forged)


def test_shape_equivalent_but_distinct_context_breaks_continuity() -> None:
    builder = LinkNetworkBuilder()
    root = _anchor(builder)
    parent = _anchor(builder)
    current = _anchor(builder)
    k0 = _context(builder)
    k1 = _context(builder, parent, current)
    k1_copy = _context(builder, parent, current)
    k2 = _context(builder)
    step0 = _act(builder, root, k0, k1)
    step1 = _act(builder, root, k1_copy, k2)
    evidence = _run(builder, root, (step0, step1), k0, k2)
    network = builder.freeze(root)

    assert k1 is not k1_copy
    with pytest.raises(RunReplayError, match="same exact context"):
        replay_run(network, evidence)


def test_two_occurrence_distinct_noop_acts_survive_order() -> None:
    builder = LinkNetworkBuilder()
    root = _anchor(builder)
    k0 = _context(builder)
    before_role = _anchor(builder)
    after_role = _anchor(builder)
    step0 = _act(builder, root, k0, k0, before_role, after_role)
    step1 = _act(builder, root, k0, k0, before_role, after_role)
    evidence = _run(builder, root, (step0, step1), k0, k0)
    network = builder.freeze(root)

    assert step0.act is not step1.act
    assert replay_run(network, evidence) == (step0.act, step1.act)


def test_finite_context_return_replays_without_recursive_unfolding() -> None:
    builder = LinkNetworkBuilder()
    root = _anchor(builder)
    k0 = _context(builder)
    k1 = _context(builder)
    step0 = _act(builder, root, k0, k1)
    step1 = _act(builder, root, k1, k0)
    evidence = _run(builder, root, (step0, step1), k0, k0)
    network = builder.freeze(root)

    assert replay_run(network, evidence) == (step0.act, step1.act)


def test_unselected_branch_candidate_does_not_affect_selected_run() -> None:
    builder = LinkNetworkBuilder()
    root = _anchor(builder)
    k0 = _context(builder)
    k1 = _context(builder)
    k_branch = _context(builder)
    selected = _act(builder, root, k0, k1)
    branch = _act(builder, root, k0, k_branch)
    evidence = _run(builder, root, (selected,), k0, k1)
    network = builder.freeze(root)

    assert branch.act is not selected.act
    assert replay_run(network, evidence) == (selected.act,)


def test_forged_before_field_rejects() -> None:
    builder = LinkNetworkBuilder()
    root = _anchor(builder)
    k0 = _context(builder)
    k1 = _context(builder)
    wrong = _context(builder)
    step = _act(builder, root, k0, k1)
    define_act_field(builder, step.act, step.before_role, wrong)
    evidence = _run(builder, root, (step,), k0, k1)
    network = builder.freeze(root)

    with pytest.raises(RunReplayError, match="before-context field"):
        replay_run(network, evidence)


def test_forged_terminal_rejects() -> None:
    builder = LinkNetworkBuilder()
    root = _anchor(builder)
    k0 = _context(builder)
    k1 = _context(builder)
    wrong_terminal = _context(builder)
    step = _act(builder, root, k0, k1)
    evidence = _run(builder, root, (step,), k0, wrong_terminal)
    network = builder.freeze(root)

    with pytest.raises(RunReplayError, match="terminal context"):
        replay_run(network, evidence)


def test_run_construction_does_not_materialize_context_shortcut() -> None:
    builder = LinkNetworkBuilder()
    root = _anchor(builder)
    k0 = _context(builder)
    k1 = _context(builder)
    k2 = _context(builder)
    step0 = _act(builder, root, k0, k1)
    step1 = _act(builder, root, k1, k2)
    evidence = _run(builder, root, (step0, step1), k0, k2)
    network = builder.freeze(root)

    assert replay_run(network, evidence)
    assert not any(
        network.link(ref).start is k0 and network.link(ref).end is k2
        for ref in network.refs
    )


def test_empty_run_is_exact_identity_not_state_change() -> None:
    builder = LinkNetworkBuilder()
    root = _anchor(builder)
    k0 = _context(builder)
    evidence = RunEvidence(
        run_root=root,
        initial_context=k0,
        terminal_context=k0,
        steps=(),
    )
    network = builder.freeze(root)

    # Diagnostic exact-identity assertions are intentional: the run contract must
    # use the same network-issued occurrence identity as the substrate itself.
    assert network.root is root
    assert evidence.run_root is root
    assert evidence.run_root is network.root
    assert evidence.initial_context is evidence.terminal_context
    assert replay_run(network, evidence) == ()


def test_run_module_has_no_legacy_proof_or_interpreter_dependency() -> None:
    source = (ROOT / "core/foundation_v2_run.py").read_text(encoding="utf-8")
    assert "mtc_parser" not in source
    assert "mtc_ast" not in source
    assert "mtc_interpreter" not in source
    assert "proof_checker" not in source
    assert "transitiv" not in source.lower()
