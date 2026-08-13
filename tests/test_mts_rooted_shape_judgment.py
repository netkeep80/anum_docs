from __future__ import annotations

import pytest

from core.rooted_link_network import LinkNetworkBuilder, LinkNetworkError
from core.rooted_shape_judgment import end_self, full_self, shape, start_self


def build_root_vocabulary():
    builder = LinkNetworkBuilder()
    root = builder.ensure_root()
    opening = builder.ensure_start_self_closed(root)
    closing = builder.ensure_end_self_closed(root)
    linked = builder.ensure(opening, closing)
    unlinked = builder.ensure(closing, opening)
    return builder.freeze(root), {
        "root": root,
        "opening": opening,
        "closing": closing,
        "linked": linked,
        "unlinked": unlinked,
    }


def test_root_vocabulary_has_expected_shape_judgments():
    network, refs = build_root_vocabulary()
    root = refs["root"]
    opening = refs["opening"]
    closing = refs["closing"]
    linked = refs["linked"]
    unlinked = refs["unlinked"]

    assert full_self(network, root)
    assert start_self(network, opening, root)
    assert end_self(network, closing, root)
    assert shape(network, linked, opening, closing)
    assert shape(network, unlinked, closing, opening)


def test_wrong_expected_pole_makes_shape_false_without_mutation():
    network, refs = build_root_vocabulary()
    opening = refs["opening"]
    closing = refs["closing"]
    linked = refs["linked"]
    before = network.snapshot()

    assert network.find(opening, opening) is None
    assert not shape(network, linked, opening, opening)
    assert not start_self(network, linked, closing)
    assert not end_self(network, linked, opening)
    assert network.find(opening, opening) is None
    assert network.snapshot() == before


def test_full_self_holds_only_for_the_distinguished_root():
    network, _ = build_root_vocabulary()

    matching = [ref for ref in network.refs if full_self(network, ref)]
    assert matching == [network.root]


def test_shape_rejects_foreign_expected_handles():
    network, refs = build_root_vocabulary()
    other, other_refs = build_root_vocabulary()

    with pytest.raises(LinkNetworkError, match="foreign network link handle"):
        shape(
            network,
            refs["linked"],
            refs["opening"],
            other_refs["closing"],
        )

    assert other.root is other_refs["root"]
