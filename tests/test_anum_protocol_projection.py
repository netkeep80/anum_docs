"""Conformance tests for contextual L3 Anum protocol v0.2."""

import pytest

from core.anum_model import ProjectionContext, ProjectionKind
from core.anum_parser import normalize_raw_form, parse_raw_quaternary
from core.anum_protocol import (
    has_quote_envelope,
    project_anum,
    quote_anum,
    unquote_anum,
    validate_anum,
)


def test_root_context_projects_open_close_to_canonical_link_value():
    projection = project_anum(parse_raw_quaternary("[]"), ProjectionContext.ROOT)

    assert projection.kind is ProjectionKind.PROTOCOL_VALUE
    assert projection.source == "[]"
    assert projection.arrow_form == "♀∞ ⟼ ∞♂"
    assert projection.protocol_value == "1"
    assert "accepted MTS v0.2" in projection.note


def test_root_context_projects_close_open_to_canonical_unlink_value():
    projection = project_anum(parse_raw_quaternary("]["), ProjectionContext.ROOT)

    assert projection.kind is ProjectionKind.PROTOCOL_VALUE
    assert projection.source == "]["
    assert projection.arrow_form == "∞♂ ⟼ ♀∞"
    assert projection.protocol_value == "0"
    assert "accepted MTS v0.2" in projection.note


def test_open_open_and_close_close_remain_boundary_forms_without_value():
    open_open = project_anum(parse_raw_quaternary("[["), ProjectionContext.ROOT)
    close_close = project_anum(parse_raw_quaternary("]]"), ProjectionContext.ROOT)

    assert open_open.kind is ProjectionKind.BOUNDARY_FORM
    assert open_open.arrow_form == "♀∞ ⟼ ♀∞"
    assert open_open.protocol_value is None

    assert close_close.kind is ProjectionKind.BOUNDARY_FORM
    assert close_close.arrow_form == "∞♂ ⟼ ∞♂"
    assert close_close.protocol_value is None


def test_relative_context_preserves_all_boundary_forms_raw():
    for source in ("[[", "[]", "][", "]]"):
        projection = project_anum(
            parse_raw_quaternary(source),
            ProjectionContext.RELATIVE,
        )
        assert projection.kind is ProjectionKind.RAW
        assert projection.protocol_value is None
        assert normalize_raw_form(projection.projected) == source


def test_quote_context_preserves_unwrapped_raw_payload():
    source = parse_raw_quaternary("][")
    projection = project_anum(source, ProjectionContext.QUOTE)

    assert projection.kind is ProjectionKind.QUOTED_RAW
    assert normalize_raw_form(projection.projected) == "]["
    assert projection.protocol_value is None


def test_real_quote_envelope_raises_description_level_one_step():
    raw = parse_raw_quaternary("][")
    quoted = quote_anum(raw)
    quoted_twice = quote_anum(quoted)

    assert normalize_raw_form(raw) == "]["
    assert normalize_raw_form(quoted) == "[][]"
    assert normalize_raw_form(quoted_twice) == "[[][]]"
    assert has_quote_envelope(quoted)

    first = project_anum(quoted_twice, ProjectionContext.QUOTE)
    second = project_anum(first.projected, ProjectionContext.QUOTE)

    assert normalize_raw_form(first.projected) == "[][]"
    assert normalize_raw_form(second.projected) == "]["


def test_unquote_requires_explicit_outer_envelope():
    with pytest.raises(ValueError, match="quote-оболочку"):
        unquote_anum(parse_raw_quaternary("]["))


def test_context_validation_is_separate_from_raw_parser():
    raw = parse_raw_quaternary("][[]]10")

    for context in ProjectionContext:
        result = validate_anum(raw, context)
        assert result.is_valid
        assert result.context is context


def test_general_root_carrier_remains_raw_until_denotation_is_defined():
    raw = parse_raw_quaternary("[01]][")
    projection = project_anum(raw, ProjectionContext.ROOT)

    assert projection.kind is ProjectionKind.RAW
    assert normalize_raw_form(projection.projected) == "[01]]["
    assert "no general root denotation" in projection.note
