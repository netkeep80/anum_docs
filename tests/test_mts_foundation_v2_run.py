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
    if not builder._refs:
        return builder.ensure_root()
    current = next(
        ref
        for ref, link in reversed(list(zip(builder._refs, builder._links)))
        if link is not None
    )
    count = len(builder._refs)
    while len(builder._refs) == count:
        current = builder.ensure_start_self_closed(current)
    return current


def _context(builder: LinkNetworkBuilder, parent=None, current=None):
    return define_context(
        builder,
        parent if parent is not None else _anchor(builder),
        current if current is not None else _anchor(builder),
    )


def _step(builder, root, before, after, *, interpreter=None, before_role=None, after_role=None):
    interpreter = interpreter or _anchor(builder)
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
    return RunEvidence(
        run_root=define_run_chain(builder, root, tuple(step.act for step in steps)),
        initial_context=initial,
        terminal_context=terminal,
        steps=tuple(steps),
    )


def test_linear_run_replays_context_continuity_read_only() -> None:
    builder = LinkNetworkBuilder()
    root = _anchor(builder)
    k0 = _context(builder)
    k1 = _context(builder)
    k2 = _context(builder)
    step0 = _step(builder, root, k0, k1)
    step1 = _step(builder, root, k1, k2)
    evidence = _run(builder, root, (step0, step1), k0, k2)
    network = builder.freeze(root)
    snapshot = network.snapshot()

    assert replay_run(network, evidence) == (step0.act, step1.act)
    assert network.snapshot() == snapshot


def test_reordered_selected_steps_reject_against_run_chain() -> None:
    builder = LinkNetworkBuilder()
    root = _anchor(builder)
    k0 = _context(builder)
    k1 = _context(builder)
    k2 = _context(builder)
    step0 = _step(builder, root, k0, k1)
    step1 = _step(builder, root, k1, k2)
    good = _run(builder, root, (step0, step1), k0, k2)
    network = builder.freeze(root)

    with pytest.raises(RunReplayError, match="order or selected act"):
        replay_run(network, replace(good, steps=(step1, step0)))


def test_same_context_form_is_the_same_context_and_preserves_continuity() -> None:
    builder = LinkNetworkBuilder()
    root = _anchor(builder)
    parent = _anchor(builder)
    current = _anchor(builder)
    k0 = _context(builder)
    k1 = _context(builder, parent, current)
    k1_again = _context(builder, parent, current)
    k2 = _context(builder)

    assert k1_again is k1
    step0 = _step(builder, root, k0, k1)
    step1 = _step(builder, root, k1_again, k2)
    evidence = _run(builder, root, (step0, step1), k0, k2)
    network = builder.freeze(root)

    assert replay_run(network, evidence) == (step0.act, step1.act)


def test_same_act_can_occupy_two_run_positions_without_copying_act() -> None:
    builder = LinkNetworkBuilder()
    root = _anchor(builder)
    k0 = _context(builder)
    before_role = _anchor(builder)
    after_role = _anchor(builder)
    interpreter = _anchor(builder)
    step = _step(
        builder,
        root,
        k0,
        k0,
        interpreter=interpreter,
        before_role=before_role,
        after_role=after_role,
    )
    evidence = _run(builder, root, (step, step), k0, k0)
    network = builder.freeze(root)

    assert replay_run(network, evidence) == (step.act, step.act)
    tail = network.link(evidence.run_root)
    head = network.link(tail.start)
    assert head.start is root
    assert head.end is step.act
    assert tail.end is step.act
    assert tail.start is not root


def test_finite_context_return_replays_without_recursive_unfolding() -> None:
    builder = LinkNetworkBuilder()
    root = _anchor(builder)
    k0 = _context(builder)
    k1 = _context(builder)
    step0 = _step(builder, root, k0, k1)
    step1 = _step(builder, root, k1, k0)
    evidence = _run(builder, root, (step0, step1), k0, k0)
    network = builder.freeze(root)

    assert replay_run(network, evidence) == (step0.act, step1.act)


def test_unselected_structurally_distinct_branch_does_not_affect_run() -> None:
    builder = LinkNetworkBuilder()
    root = _anchor(builder)
    k0 = _context(builder)
    k1 = _context(builder)
    k_branch = _context(builder)
    selected = _step(builder, root, k0, k1)
    branch = _step(builder, root, k0, k_branch)
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
    step = _step(builder, root, k0, k1)
    define_act_field(builder, step.act, step.before_role, wrong)
    evidence = _run(builder, root, (step,), k0, k1)
    network = builder.freeze(root)

    with pytest.raises(RunReplayError, match="before-context field"):
        replay_run(network, evidence)


def test_forged_terminal_context_rejects() -> None:
    builder = LinkNetworkBuilder()
    root = _anchor(builder)
    k0 = _context(builder)
    k1 = _context(builder)
    wrong_terminal = _context(builder)
    step = _step(builder, root, k0, k1)
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
    step0 = _step(builder, root, k0, k1)
    step1 = _step(builder, root, k1, k2)
    evidence = _run(builder, root, (step0, step1), k0, k2)
    network = builder.freeze(root)

    assert replay_run(network, evidence)
    assert network.find(k0, k2) is None


def test_empty_run_is_identity_of_selected_context() -> None:
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

    assert replay_run(network, evidence) == ()


def test_empty_run_cannot_change_context() -> None:
    builder = LinkNetworkBuilder()
    root = _anchor(builder)
    k0 = _context(builder)
    k1 = _context(builder)
    evidence = RunEvidence(
        run_root=root,
        initial_context=k0,
        terminal_context=k1,
        steps=(),
    )
    network = builder.freeze(root)

    with pytest.raises(RunReplayError, match="cannot change terminal context"):
        replay_run(network, evidence)


def test_run_module_has_no_legacy_or_transitive_dependency() -> None:
    source = (ROOT / "core/foundation_v2_run.py").read_text(encoding="utf-8")
    assert "mtc_parser" not in source
    assert "mtc_ast" not in source
    assert "mtc_interpreter" not in source
    assert "proof_checker" not in source
    assert "transitive_closure" not in source.lower()
