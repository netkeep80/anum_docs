"""Tests that string, dictionary and raw quaternary layers stay separate."""

import pytest

from core.anum_model import AnumForm, AnumSource
from core.anum_parser import parse_anum_file, parse_raw_quaternary
from core.anum_protocol import AnumDictionary


def test_quaternary_rejects_string_tokens():
    parse_raw_quaternary("[01000001]")

    for source in ("window(position)", "a b", "∞ ⟼ ∞"):
        with pytest.raises(ValueError, match="Недопустимый символ"):
            parse_raw_quaternary(source)


def test_string_mode_does_not_parse_as_quaternary():
    source = parse_anum_file("# anum-format: string\nwindow position\n")

    assert isinstance(source, AnumSource)
    assert source.format == "string"
    assert source.text == "window position"


def test_string_mode_compiles_only_through_explicit_dictionary():
    source = parse_anum_file("# anum-format: string\nwindow position\n")
    assert isinstance(source, AnumSource)

    dictionary = AnumDictionary()
    dictionary.register("window", parse_raw_quaternary("[]"))
    dictionary.register("position", parse_raw_quaternary("]["))

    compiled = dictionary.compile(source)
    assert compiled.values() == tuple("[]][")


def test_dictionary_rejects_unknown_and_duplicate_names():
    source = AnumSource(text="a b", format="string")
    dictionary = AnumDictionary()
    dictionary.register("a", parse_raw_quaternary("0"))

    with pytest.raises(KeyError, match="Неизвестное имя anum: b"):
        dictionary.compile(source)

    with pytest.raises(ValueError, match="уже определено"):
        dictionary.register("a", parse_raw_quaternary("1"))


def test_quaternary_mode_rejects_string_content():
    with pytest.raises(ValueError, match="Недопустимый символ"):
        parse_anum_file("# anum-format: quaternary\nwindow(position)\n")


def test_utf8_payload_example_is_quaternary_not_string():
    form = parse_anum_file(
        "# anum-format: quaternary\n"
        "[01101000][01100101][01101100][01101100][01101111]\n"
    )

    assert isinstance(form, AnumForm)


def test_string_mode_header_is_required_for_named_payloads():
    with pytest.raises(ValueError, match="Недопустимый символ"):
        parse_anum_file("a b")


def test_unknown_anum_format_is_rejected():
    with pytest.raises(ValueError, match="Неизвестный формат"):
        parse_anum_file("# anum-format: yaml\n[]")
