from __future__ import annotations

import json
from pathlib import Path

import pytest

from core.anum_carrier import (
    AnumCarrierVocabulary,
    CarrierInputError,
    decode_carrier_stream,
    deserialize_carrier,
)
from core.anum_protocol import StreamError, deserialize_stream
from core.rooted_link_network import (
    LinkNetworkBuilder,
    LinkNetworkError,
    read_rooted_sequence,
)


ROOT = Path(__file__).resolve().parents[1]
CONFORMANCE = ROOT / "contracts/mts-conformance-v0.6.json"


def _fixture():
    builder = LinkNetworkBuilder()
    root = builder.ensure_root()
    opening = builder.ensure_start_self_closed(root)
    closing = builder.ensure_end_self_closed(root)
    linked = builder.ensure(opening, closing)
    unlinked = builder.ensure(closing, opening)
    return (
        builder,
        root,
        AnumCarrierVocabulary(
            opening=opening,
            closing=closing,
            linked=linked,
            unlinked=unlinked,
        ),
    )


def _carrier(builder, root, vocabulary, source: str):
    values = {
        "[": vocabulary.opening,
        "]": vocabulary.closing,
        "1": vocabulary.linked,
        "0": vocabulary.unlinked,
    }
    current = root
    for token in source:
        current = builder.ensure(current, values[token])
    return current


def _anum_corpus() -> dict:
    current = json.loads(CONFORMANCE.read_text(encoding="utf-8"))
    return current["corpora"]["anum"]


def test_rooted_sequence_is_a_property_not_a_second_link_kind() -> None:
    builder, root, vocabulary = _fixture()
    closing = vocabulary.closing
    opening_carrier = _carrier(builder, root, vocabulary, "[")
    network = builder.freeze(root)

    assert read_rooted_sequence(network, root).values == ()
    closing_sequence = read_rooted_sequence(network, closing)
    assert closing_sequence.values == (closing,)
    assert closing_sequence.prefixes == (root, closing)

    assert opening_carrier is not vocabulary.opening
    assert decode_carrier_stream(network, opening_carrier, vocabulary) == "["
    with pytest.raises(LinkNetworkError, match="finite R-rooted"):
        read_rooted_sequence(network, vocabulary.opening)


def test_carrier_role_is_explicit_when_one_link_has_another_structural_reading() -> None:
    builder, root, vocabulary = _fixture()
    single_zero = _carrier(builder, root, vocabulary, "0")
    close_open = _carrier(builder, root, vocabulary, "][")
    assert close_open is vocabulary.unlinked
    assert single_zero is not vocabulary.unlinked
    network = builder.freeze(root)

    assert decode_carrier_stream(network, single_zero, vocabulary) == "0"
    assert decode_carrier_stream(network, vocabulary.unlinked, vocabulary) == "]["


def test_multielement_carrier_preserves_exact_source_order_read_only() -> None:
    builder, root, vocabulary = _fixture()
    source = "10[1]0"
    carrier = _carrier(builder, root, vocabulary, source)
    network = builder.freeze(root)
    before = network.snapshot()

    sequence = read_rooted_sequence(network, carrier)
    assert decode_carrier_stream(network, carrier, vocabulary) == source
    assert sequence.prefixes[0] is root
    assert sequence.prefixes[-1] is carrier
    assert len(sequence.values) == len(source)
    assert network.snapshot() == before


def test_every_accepted_valid_raw_vector_replays_identically_from_carrier() -> None:
    for vector in _anum_corpus()["valid"]:
        source = vector["source"]
        builder, root, vocabulary = _fixture()
        carrier = _carrier(builder, root, vocabulary, source)
        network = builder.freeze(root)
        before = network.snapshot()

        assert decode_carrier_stream(network, carrier, vocabulary) == source
        assert deserialize_carrier(network, carrier, vocabulary) == deserialize_stream(source)
        assert network.snapshot() == before


def test_applicable_invalid_raw_vectors_keep_the_same_stack_error_code() -> None:
    applicable = [
        vector
        for vector in _anum_corpus()["invalid"]
        if set(vector["source"]) <= set("[]10")
    ]
    assert applicable

    for vector in applicable:
        source = vector["source"]
        builder, root, vocabulary = _fixture()
        carrier = _carrier(builder, root, vocabulary, source)
        network = builder.freeze(root)

        with pytest.raises(StreamError) as raw_error:
            deserialize_stream(source)
        with pytest.raises(StreamError) as carrier_error:
            deserialize_carrier(network, carrier, vocabulary)
        assert carrier_error.value.code == raw_error.value.code == vector["error"]


def test_non_abit_sequence_element_is_rejected_without_guessing() -> None:
    builder, root, vocabulary = _fixture()
    other = builder.ensure_start_self_closed(vocabulary.linked)
    carrier = builder.ensure(root, other)
    network = builder.freeze(root)

    with pytest.raises(CarrierInputError) as caught:
        decode_carrier_stream(network, carrier, vocabulary)
    assert caught.value.code == "non-abit"


def test_non_rooted_carrier_and_wrong_vocabulary_fail_closed() -> None:
    builder, root, vocabulary = _fixture()
    network = builder.freeze(root)

    with pytest.raises(CarrierInputError) as non_rooted:
        decode_carrier_stream(network, vocabulary.opening, vocabulary)
    assert non_rooted.value.code == "not-rooted-sequence"

    wrong = AnumCarrierVocabulary(
        opening=vocabulary.closing,
        closing=vocabulary.opening,
        linked=vocabulary.linked,
        unlinked=vocabulary.unlinked,
    )
    with pytest.raises(CarrierInputError) as invalid_vocabulary:
        decode_carrier_stream(network, root, wrong)
    assert invalid_vocabulary.value.code == "invalid-vocabulary"


def test_current_conformance_accepts_dual_transport_and_role_boundary() -> None:
    corpus = _anum_corpus()
    assert corpus["schema"] == "anum-deserialization-conformance/v0.4"
    assert corpus["contract"] == "anum-deserialization/v0.4"
    assert corpus["carrier"]["roleIsExplicit"] is True
    assert corpus["carrier"]["readOnly"] is True
    assert corpus["carrier"]["materializes"] is False
    structural = {case["id"]: case for case in corpus["carrier"]["structural"]}
    assert structural["root-empty-carrier"]["expectedSource"] == ""
    assert structural["C-canonical-singleton-close"]["expectedSource"] == "]"
    assert structural["U-explicit-carrier-role"]["expectedSource"] == "]["
    assert corpus["equivalence"]["sameDenotation"] is True
    assert corpus["equivalence"]["sameStackErrorCode"] is True
