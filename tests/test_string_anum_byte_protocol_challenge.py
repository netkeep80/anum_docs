"""Non-normative UTF-8/string-Anum byte protocol challenge for issue #213."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from core.anum_model import ProjectionContext
from core.anum_parser import parse_raw_quaternary
from core.anum_recursive_denotation import denotate_recursive_anum


ROOT = Path(__file__).resolve().parents[1]
CHALLENGE = ROOT / "contracts/string-anum-byte-protocol-challenge-v0.7.json"


class ByteCarrierError(ValueError):
    pass


def contract() -> dict:
    return json.loads(CHALLENGE.read_text(encoding="utf-8"))


def encode_byte(value: int) -> str:
    if not 0 <= value <= 0xFF:
        raise ValueError("byte out of range")
    return f"[{value:08b}]"


def decode_byte(carrier: str) -> int:
    if len(carrier) != 10:
        raise ByteCarrierError("byte carrier must contain exactly 10 abits")
    if carrier[0] != "[" or carrier[-1] != "]":
        raise ByteCarrierError("byte carrier requires explicit begin/end abits")
    payload = carrier[1:-1]
    if any(char not in "01" for char in payload):
        raise ByteCarrierError("byte payload must contain only 0/1 abits")
    return int(payload, 2)


def encode_bytes(payload: bytes) -> str:
    return "".join(encode_byte(value) for value in payload)


def decode_bytes(carrier: str) -> bytes:
    if len(carrier) % 10 != 0:
        raise ByteCarrierError("string Anum byte stream must be an integral number of byte carriers")
    return bytes(decode_byte(carrier[offset : offset + 10]) for offset in range(0, len(carrier), 10))


def encode_text(text: str) -> str:
    return encode_bytes(text.encode("utf-8"))


def decode_text(carrier: str) -> str:
    return decode_bytes(carrier).decode("utf-8", errors="strict")


def encode_byte_quaternary_digits(value: int) -> str:
    """Candidate B: compact 2-bit digits, included only for comparison."""

    digit = {0b00: "0", 0b01: "1", 0b10: "[", 0b11: "]"}
    return "".join(digit[(value >> shift) & 0b11] for shift in (6, 4, 2, 0))


def decode_byte_quaternary_digits(carrier: str) -> int:
    reverse = {"0": 0b00, "1": 0b01, "[": 0b10, "]": 0b11}
    if len(carrier) != 4 or any(char not in reverse for char in carrier):
        raise ByteCarrierError("compact quaternary byte requires exactly four abits")
    value = 0
    for char in carrier:
        value = (value << 2) | reverse[char]
    return value


def test_contract_is_non_normative_and_does_not_change_recursive_grammar():
    value = contract()

    assert value["schema"] == "string-anum-byte-protocol-challenge/v0.7"
    assert value["status"] == "candidate-challenge"
    assert value["accepted"] is False
    assert value["issue"] == 213
    assert value["candidateA"]["accepted"] is False
    assert value["candidateB"]["accepted"] is False
    assert value["veto"]["recursiveGrammarChangeAllowed"] is False
    assert value["veto"]["productionChangeAllowed"] is False


def test_all_256_bytes_round_trip_through_binary_envelope():
    for value in range(256):
        carrier = encode_byte(value)
        assert len(carrier) == 10
        assert carrier[0] == "["
        assert carrier[-1] == "]"
        assert set(carrier[1:-1]) <= {"0", "1"}
        assert decode_byte(carrier) == value


def test_byte_envelope_has_begin_end_meanings_in_fixed_positions():
    carrier = encode_byte(0x41)

    assert carrier == "[01000001]"
    assert carrier[0] == "["
    assert carrier[-1] == "]"
    assert contract()["candidateA"]["reason"].startswith("begin/end abits remain explicit")


@pytest.mark.parametrize(
    "carrier",
    [
        "",
        "01000001",
        "[01000001",
        "01000001]",
        "[0100000]",
        "[010000010]",
        "[0100000[]",
        "[0100000a]",
        "]01000001[",
    ],
)
def test_malformed_binary_byte_carriers_are_rejected(carrier: str):
    with pytest.raises(ByteCarrierError):
        decode_byte(carrier)


def test_arbitrary_byte_sequences_round_trip_as_concatenated_byte_contexts():
    samples = [
        b"",
        b"A",
        bytes(range(256)),
        b"\x00\xff\x10\x80",
    ]

    for payload in samples:
        encoded = encode_bytes(payload)
        assert len(encoded) == len(payload) * 10
        assert decode_bytes(encoded) == payload


def test_representative_utf8_text_round_trips_exact_bytes_and_text():
    samples = [
        "ASCII",
        "Метатеория связей",
        "∞♂♀⟼↑◁▷",
        "e\u0301",
        "é",
        "🙂🚀",
        "0 1 [ ]",
    ]

    for text in samples:
        encoded = encode_text(text)
        assert decode_bytes(encoded) == text.encode("utf-8")
        assert decode_text(encoded) == text


def test_invalid_utf8_bytes_remain_representable_at_byte_layer():
    payload = b"\xff\xfe\x80"
    encoded = encode_bytes(payload)

    assert decode_bytes(encoded) == payload
    with pytest.raises(UnicodeDecodeError):
        decode_text(encoded)


def test_unicode_normalization_is_not_hidden_in_transport():
    composed = "é"
    decomposed = "e\u0301"

    assert composed != decomposed
    assert composed.encode("utf-8") != decomposed.encode("utf-8")
    assert encode_text(composed) != encode_text(decomposed)
    assert decode_text(encode_text(composed)) == composed
    assert decode_text(encode_text(decomposed)) == decomposed
    assert contract()["candidateA"]["unicodeNormalization"] == "none"


def test_bootstrap_source_glyphs_use_same_byte_protocol_without_exceptions():
    for glyph in "01[]":
        encoded = encode_text(glyph)
        assert decode_text(encoded) == glyph
        assert encoded == encode_bytes(glyph.encode("utf-8"))


def test_source_open_glyph_is_not_the_root_begin_abit_occurrence_that_delimits_its_byte():
    encoded = encode_text("[")

    assert encoded == "[01011011]"
    assert encoded[0] == "["
    assert encoded[-1] == "]"
    assert encoded != "["
    assert contract()["sourceSemanticBoundary"]["sourceGlyphOccurrenceEqualsRootMeaning"] is False


def test_same_raw_carrier_has_byte_meaning_but_is_raw_under_recursive_root_protocol():
    raw = "[01000001]"

    assert decode_byte(raw) == 0x41
    assert bytes([decode_byte(raw)]).decode("ascii") == "A"

    recursive = denotate_recursive_anum(
        parse_raw_quaternary(raw), ProjectionContext.ROOT
    )
    assert recursive.raw is not None
    assert recursive.structural is None

    boundary = contract()["protocolSeparation"]
    assert boundary["exampleRaw"] == raw
    assert boundary["byteProtocolResult"] == "0x41 / ASCII A"
    assert boundary["recursiveRootResult"] == "RAW"
    assert boundary["operationDependsOnExplicitInterpretationProtocol"] is True


def test_compact_two_bit_candidate_round_trips_but_has_no_explicit_byte_boundary_abits():
    for value in range(256):
        carrier = encode_byte_quaternary_digits(value)
        assert len(carrier) == 4
        assert decode_byte_quaternary_digits(carrier) == value

    sample = encode_byte_quaternary_digits(0x41)
    assert sample == "1001"
    assert not (sample.startswith("[") and sample.endswith("]"))
    assert contract()["candidateB"]["roundTripPossible"] is True
    assert contract()["candidateB"]["preferredForFurtherChallenge"] is False


def test_empty_string_has_empty_physical_payload_but_implicit_root_remains_protocol_assumption():
    assert encode_text("") == ""
    assert decode_text("") == ""
    assert contract()["candidateA"]["implicitRoot"] is True


def test_string_protocol_does_not_claim_dictionary_or_form_resolution_yet():
    value = contract()

    assert value["sourceSemanticBoundary"]["dictionaryRelationRequiredAboveThisLayer"] is True
    assert value["notDecided"] == [
        "candidate A acceptance as the canonical string-Anum transport",
        "whether byte envelope boundaries are semantic context transitions or only transport framing",
        "how byte carriers compose into a semantic string-link network",
        "the exact dictionary relation from string Anum to formal sign/form",
        "whether the full interpreter consumes bytes, decoded Unicode code points or dictionary tokens",
        "production migration",
    ]