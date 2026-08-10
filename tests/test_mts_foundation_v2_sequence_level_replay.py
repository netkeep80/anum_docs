from __future__ import annotations

import pytest

from core.exact_link_network import LinkNetworkBuilder
from core.foundation_v2_materialization import (
    SequenceAtom,
    SequenceDescription,
    SequenceGroup,
    SequenceMaterializationError,
    replay_sequence_level_fold,
)


def _anchor(builder: LinkNetworkBuilder):
    ref = builder.reserve()
    builder.define(ref, ref, ref)
    return ref


def _link(builder: LinkNetworkBuilder, start, end):
    ref = builder.reserve()
    builder.define(ref, start, end)
    return ref


def test_immediate_group_result_becomes_one_outer_left_fold_value() -> None:
    builder = LinkNetworkBuilder()
    root = _anchor(builder)
    a = _anchor(builder)
    b = _anchor(builder)

    inner_ab = _link(builder, a, b)
    outer_ab = _link(builder, a, b)
    full = _link(builder, outer_ab, inner_ab)
    network = builder.freeze(root)
    snapshot = network.snapshot()

    description = SequenceDescription(
        root=root,
        items=(
            SequenceAtom(a),
            SequenceAtom(b),
            SequenceGroup((SequenceAtom(a), SequenceAtom(b))),
        ),
    )

    assert replay_sequence_level_fold(
        network,
        description,
        group_results=(inner_ab,),
        fold_results=(outer_ab, full),
        result=full,
    ) is full

    assert inner_ab is not outer_ab
    assert network.link(inner_ab) == network.link(outer_ab)
    assert network.link(full).start is outer_ab
    assert network.link(full).end is inner_ab
    assert network.snapshot() == snapshot


def test_outer_level_uses_selected_nested_run_result_not_group_structure() -> None:
    builder = LinkNetworkBuilder()
    root = _anchor(builder)
    a = _anchor(builder)
    b = _anchor(builder)

    carrier_a = _link(builder, root, a)
    carrier_ab = _link(builder, carrier_a, b)
    nested_result = _link(builder, root, carrier_ab)
    nested_a = _link(builder, nested_result, a)
    full = _link(builder, nested_a, b)
    wrong_a = _link(builder, carrier_ab, a)
    wrong_full = _link(builder, wrong_a, b)
    network = builder.freeze(root)
    snapshot = network.snapshot()

    description = SequenceDescription(
        root=root,
        items=(
            SequenceGroup(
                (SequenceGroup((SequenceAtom(carrier_ab),)),)
            ),
            SequenceAtom(a),
            SequenceAtom(b),
        ),
    )

    assert replay_sequence_level_fold(
        network,
        description,
        group_results=(nested_result,),
        fold_results=(nested_a, full),
        result=full,
    ) is full

    with pytest.raises(
        SequenceMaterializationError,
        match="forged exact poles",
    ):
        replay_sequence_level_fold(
            network,
            description,
            group_results=(carrier_ab,),
            fold_results=(nested_a, full),
            result=full,
        )

    assert network.link(wrong_full).start is wrong_a
    assert network.link(wrong_full).end is b
    assert wrong_full is not full
    assert network.snapshot() == snapshot


def test_group_result_cardinality_and_level_result_are_exact() -> None:
    builder = LinkNetworkBuilder()
    root = _anchor(builder)
    a = _anchor(builder)
    b = _anchor(builder)
    inner = _link(builder, a, b)
    other = _link(builder, root, b)
    network = builder.freeze(root)

    description = SequenceDescription(
        root=root,
        items=(SequenceGroup((SequenceAtom(a), SequenceAtom(b))),),
    )

    assert replay_sequence_level_fold(
        network,
        description,
        group_results=(inner,),
        fold_results=(),
        result=inner,
    ) is inner

    with pytest.raises(SequenceMaterializationError, match="missing immediate group"):
        replay_sequence_level_fold(
            network,
            description,
            group_results=(),
            fold_results=(),
            result=inner,
        )

    with pytest.raises(SequenceMaterializationError, match="unconsumed immediate group"):
        replay_sequence_level_fold(
            network,
            description,
            group_results=(inner, other),
            fold_results=(),
            result=inner,
        )

    with pytest.raises(SequenceMaterializationError, match="not exact fold result"):
        replay_sequence_level_fold(
            network,
            description,
            group_results=(inner,),
            fold_results=(),
            result=other,
        )
