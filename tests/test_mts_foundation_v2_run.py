from __future__ import annotations

from dataclasses import replace
from pathlib import Path

import pytest

from core.exact_link_network import LinkNetworkBuilder
from core.foundation_v2_interpreter import (
    FlatSequenceReadingEvidence,
    FlatSequenceReadingRoleRefs,
    RelationStepEvidence,
    RelationStepRoleRefs,
    replay_flat_sequence_reading,
    replay_relation_step,
)
from core.foundation_v2_root import build_root_kernel
from core.foundation_v2_run import (
    RunEvidence,
    RunReplayError,
    RunStepEvidence,
    define_run_chain,
    replay_run,
)
from core.foundation_v2_source import SegmentSpec, SourceFrontEndBuilder
from core.foundation_v2_state import (
    define_act_field,
    define_act_header,
    define_context,
    define_dictionary_effect,
    define_dictionary_scope,
)


ROOT = Path(__file__).resolve().parents[1]


def _anchor(builder: LinkNetworkBuilder):
    ref = builder.reserve()
    builder.define(ref, ref, ref)
    return ref


def _new_link(builder: LinkNetworkBuilder, start, end):
    ref = builder.reserve()
    builder.define(ref, start, end)
    return ref


def _byte_vocabulary(builder: LinkNetworkBuilder):
    return {value: _anchor(builder) for value in range(256)}


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


def _define_scoped_mapping(builder, root, before, history, source_content, form):
    effect = define_dictionary_effect(
        builder, before, root, history, source_content, form
    )
    return effect.after_scope, effect.history_after, effect.occurrence


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


def test_flat_des_then_root_closing_form_replays_carrier_raise_as_one_run() -> None:
    kernel = build_root_kernel()
    builder = kernel.network.evolve()
    root = kernel.refs.root
    closing = kernel.refs.closing
    byte_refs = _byte_vocabulary(builder)
    front_end = SourceFrontEndBuilder(builder, root, byte_refs)

    a = _anchor(builder)
    b = _anchor(builder)
    x = _new_link(builder, a, b)
    carrier_x = _new_link(builder, root, x)

    source_ab = front_end.source_occurrence(b"ab")
    source_close = front_end.source_occurrence(b"]")
    dictionary = define_dictionary_scope(builder, root, root)
    history = root
    occurrences = {}
    for raw, form in ((b"a", a), (b"b", b), (b"]", closing)):
        dictionary, history, occurrence = _define_scoped_mapping(
            builder,
            root,
            dictionary,
            history,
            front_end.content_ref(raw),
            form,
        )
        occurrences[raw] = occurrence

    flat_grammar = _anchor(builder)
    flat_theory = _anchor(builder)
    close_grammar = _anchor(builder)
    close_theory = _anchor(builder)
    flat_source = front_end.build_selected_evidence(
        source_ab,
        (
            SegmentSpec(0, 1, a, occurrences[b"a"]),
            SegmentSpec(1, 2, b, occurrences[b"b"]),
        ),
        dictionary=dictionary,
        grammar=flat_grammar,
        theory=flat_theory,
    )
    close_source = front_end.build_selected_evidence(
        source_close,
        (SegmentSpec(0, 1, closing, occurrences[b"]"]),),
        dictionary=dictionary,
        grammar=close_grammar,
        theory=close_theory,
    )

    interpreter = _anchor(builder)
    parent = _anchor(builder)
    prior = _anchor(builder)
    k0 = define_context(builder, parent, prior)
    k1 = define_context(builder, parent, x)
    k1_copy = define_context(builder, parent, x)
    k2 = define_context(builder, parent, carrier_x)

    role_refs = {name: _anchor(builder) for name in (
        "source",
        "source-selection",
        "form-sequence",
        "dictionary",
        "grammar",
        "theory",
        "form",
        "before-context",
        "binding",
        "result",
        "after-context",
    )}
    flat_roles = FlatSequenceReadingRoleRefs(
        source=role_refs["source"],
        source_selection=role_refs["source-selection"],
        form_sequence=role_refs["form-sequence"],
        dictionary=role_refs["dictionary"],
        grammar=role_refs["grammar"],
        theory=role_refs["theory"],
        before_context=role_refs["before-context"],
        result=role_refs["result"],
        after_context=role_refs["after-context"],
    )
    relation_roles = RelationStepRoleRefs(
        source=role_refs["source"],
        source_selection=role_refs["source-selection"],
        form_sequence=role_refs["form-sequence"],
        dictionary=role_refs["dictionary"],
        grammar=role_refs["grammar"],
        theory=role_refs["theory"],
        form=role_refs["form"],
        before_context=role_refs["before-context"],
        binding=role_refs["binding"],
        result=role_refs["result"],
        after_context=role_refs["after-context"],
    )

    role_dictionary = define_dictionary_scope(builder, root, root)
    role_history = root
    for name, role in role_refs.items():
        role_dictionary, role_history, _ = _define_scoped_mapping(
            builder,
            root,
            role_dictionary,
            role_history,
            front_end.content_ref(name.encode("utf-8")),
            role,
        )

    flat_act = define_act_header(builder, interpreter, role_dictionary, k1)
    for role, value in (
        (flat_roles.source, flat_source.source),
        (flat_roles.source_selection, flat_source.selection_sequence),
        (flat_roles.form_sequence, flat_source.form_sequence),
        (flat_roles.dictionary, flat_source.dictionary),
        (flat_roles.grammar, flat_source.grammar),
        (flat_roles.theory, flat_source.theory),
        (flat_roles.before_context, k0),
        (flat_roles.result, x),
        (flat_roles.after_context, k1),
    ):
        define_act_field(builder, flat_act, role, value)

    def close_act(before_context):
        act = define_act_header(builder, interpreter, role_dictionary, k2)
        for role, value in (
            (relation_roles.source, close_source.source),
            (relation_roles.source_selection, close_source.selection_sequence),
            (relation_roles.form_sequence, close_source.form_sequence),
            (relation_roles.dictionary, close_source.dictionary),
            (relation_roles.grammar, close_source.grammar),
            (relation_roles.theory, close_source.theory),
            (relation_roles.form, closing),
            (relation_roles.before_context, before_context),
            (relation_roles.binding, x),
            (relation_roles.result, carrier_x),
            (relation_roles.after_context, k2),
        ):
            define_act_field(builder, act, role, value)
        return act

    closing_act = close_act(k1)
    same_shape_closing_act = close_act(k1_copy)

    good_steps = (
        RunStepEvidence(
            act=flat_act,
            before_context=k0,
            after_context=k1,
            before_role=role_refs["before-context"],
            after_role=role_refs["after-context"],
        ),
        RunStepEvidence(
            act=closing_act,
            before_context=k1,
            after_context=k2,
            before_role=role_refs["before-context"],
            after_role=role_refs["after-context"],
        ),
    )
    bad_steps = (
        good_steps[0],
        RunStepEvidence(
            act=same_shape_closing_act,
            before_context=k1_copy,
            after_context=k2,
            before_role=role_refs["before-context"],
            after_role=role_refs["after-context"],
        ),
    )
    good = _run(builder, root, good_steps, k0, k2)
    bad = _run(builder, root, bad_steps, k0, k2)
    network = builder.freeze()
    before_snapshot = network.snapshot()

    flat_evidence = FlatSequenceReadingEvidence(
        source_evidence=flat_source,
        interpreter=interpreter,
        before_context=k0,
        result=x,
        after_context=k1,
        act=flat_act,
        role_dictionary=role_dictionary,
        roles=flat_roles,
    )
    closing_evidence = RelationStepEvidence(
        source_evidence=close_source,
        interpreter=interpreter,
        form=closing,
        before_context=k1,
        binding=x,
        result=carrier_x,
        after_context=k2,
        act=closing_act,
        role_dictionary=role_dictionary,
        roles=relation_roles,
    )
    same_shape_closing_evidence = replace(
        closing_evidence,
        before_context=k1_copy,
        act=same_shape_closing_act,
    )

    assert network.link(closing).start is root
    assert network.link(closing).end is closing
    assert replay_flat_sequence_reading(network, flat_evidence, byte_refs) is x
    assert replay_relation_step(network, closing_evidence, byte_refs) is carrier_x
    assert (
        replay_relation_step(network, same_shape_closing_evidence, byte_refs)
        is carrier_x
    )
    assert network.link(carrier_x).start is root
    assert network.link(carrier_x).end is x
    assert replay_run(network, good) == (flat_act, closing_act)

    assert k1 is not k1_copy
    with pytest.raises(RunReplayError, match="same exact context"):
        replay_run(network, bad)
    assert network.snapshot() == before_snapshot


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
    assert "def transitive" not in source.lower()
    assert "transitive_closure" not in source.lower()
    assert "derive_transitive" not in source.lower()
