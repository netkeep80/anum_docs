"""Tests for strict raw and incremental quaternary parsing."""

import pytest

from core.anum_model import Abit, AnumForm
from core.anum_parser import (
    IncrementalQuaternaryDecoder,
    parse_anum_file,
    parse_raw_quaternary,
    serialize_quaternary_anum,
)


def token_values(form: AnumForm) -> list[str]:
    return list(form.values())


@pytest.mark.parametrize("source", ["[]", "][", "[[", "]]", "[01000001]"])
def test_raw_parser_accepts_all_abit_forms(source):
    form = parse_raw_quaternary(source)
    assert token_values(form) == list(source)


def test_raw_parser_ignores_whitespace_and_comments():
    form = parse_raw_quaternary("  [ 0 1 ]  # byte shell\n][")

    assert token_values(form) == ["[", "0", "1", "]", "]", "["]
    assert [token.offset for token in form.tokens] == [2, 4, 6, 8, 24, 25]


@pytest.mark.parametrize("source", ["a", "b", "∞", "♂", "♀", "⟼", '"'])
def test_raw_parser_rejects_non_quaternary_characters(source):
    with pytest.raises(ValueError, match="Недопустимый символ"):
        parse_raw_quaternary(source)


def test_raw_parser_does_not_use_bracket_balance():
    assert token_values(parse_raw_quaternary("][")) == ["]", "["]


def test_anum_file_defaults_to_quaternary_mode_without_header():
    source = parse_anum_file("[01000001]")

    assert isinstance(source, AnumForm)
    assert token_values(source) == list("[01000001]")
    assert source.tokens[0].abit is Abit.OPEN


def test_anum_file_parses_explicit_quaternary_header():
    source = parse_anum_file("# anum-format: quaternary\n[]")

    assert isinstance(source, AnumForm)
    assert token_values(source) == ["[", "]"]


def test_incremental_decoder_matches_batch_across_arbitrary_chunks():
    text = " [0# comment spans\n1] ][ [[ ]] "
    batch = parse_raw_quaternary(text)

    decoder = IncrementalQuaternaryDecoder()
    emitted = []
    for chunk in (" [0# com", "ment spans", "\n1] ", "][ [", "[ ]", "] "):
        emitted.extend(decoder.feed(chunk))

    streamed = decoder.finish()
    assert streamed.values() == batch.values()
    assert [token.offset for token in streamed.tokens] == [
        token.offset for token in batch.tokens
    ]
    assert emitted == list(streamed.tokens)


def test_incremental_decoder_reports_absolute_error_offset():
    decoder = IncrementalQuaternaryDecoder()
    decoder.feed("[01]\n")

    with pytest.raises(ValueError, match="позиции 7"):
        decoder.feed("  x")


def test_incremental_decoder_rejected_chunk_rolls_back_tokens_and_offset():
    decoder = IncrementalQuaternaryDecoder()

    with pytest.raises(ValueError, match="позиции 2"):
        decoder.feed("[0x")

    assert decoder.offset == 0
    assert decoder.finish().tokens == ()

    emitted = decoder.feed("[01]")
    assert [token.offset for token in emitted] == [0, 1, 2, 3]
    assert decoder.offset == 4
    assert decoder.finish().values() == ("[", "0", "1", "]")


def test_incremental_decoder_rejected_later_chunk_preserves_prior_commit():
    decoder = IncrementalQuaternaryDecoder()
    decoder.feed("[")
    before = decoder.finish()

    with pytest.raises(ValueError, match="позиции 2"):
        decoder.feed("0x")

    assert decoder.offset == 1
    assert decoder.finish() == before

    decoder.feed("01]")
    assert decoder.finish().values() == ("[", "0", "1", "]")
    assert [token.offset for token in decoder.finish().tokens] == [0, 1, 2, 3]


def test_incremental_decoder_rejected_chunk_rolls_back_comment_state():
    decoder = IncrementalQuaternaryDecoder()
    decoder.feed("# comment")
    before_offset = decoder.offset

    with pytest.raises(ValueError, match="Недопустимый символ"):
        decoder.feed("\n0x")

    assert decoder.offset == before_offset
    assert decoder.finish().tokens == ()

    decoder.feed("\n01")
    assert decoder.finish().values() == ("0", "1")
    assert [token.offset for token in decoder.finish().tokens] == [
        before_offset + 1,
        before_offset + 2,
    ]


def test_deterministic_quaternary_serialization_round_trip():
    original = parse_raw_quaternary(" [ 0 1 ] # comment\n][")
    serialized = serialize_quaternary_anum(original, include_header=True)
    reparsed = parse_anum_file(serialized)

    assert serialized == "# anum-format: quaternary\n[01]][\n"
    assert isinstance(reparsed, AnumForm)
    assert reparsed.values() == original.values()
