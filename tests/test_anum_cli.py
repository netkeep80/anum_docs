"""CLI smoke tests for the current ANUM stream path."""

import subprocess
import sys


def run_cli(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, "-m", "converters.anum_cli", *args],
        capture_output=True,
        text=True,
        check=False,
    )


def test_cli_parse_outputs_quaternary_tokens(tmp_path):
    anum_file = tmp_path / "sample.anum"
    anum_file.write_text("# anum-format: quaternary\n[]\n", encoding="utf-8")

    result = run_cli("parse", str(anum_file))

    assert result.returncode == 0
    assert "format: quaternary" in result.stdout
    assert "0: [" in result.stdout
    assert "1: ]" in result.stdout


def test_cli_validate_runs_current_stack_boundary(tmp_path):
    valid_file = tmp_path / "valid.anum"
    valid_file.write_text("[]", encoding="utf-8")
    invalid_file = tmp_path / "invalid.anum"
    invalid_file.write_text("]", encoding="utf-8")

    valid = run_cli("validate", str(valid_file))
    invalid = run_cli("validate", str(invalid_file))

    assert valid.returncode == 0
    assert "valid: true" in valid.stdout
    assert invalid.returncode == 0
    assert "valid: false" in invalid.stdout
    assert "error: unexpected-close" in invalid.stdout


def test_cli_deserialize_outputs_current_root_semantics(tmp_path):
    empty = tmp_path / "empty.anum"
    empty.write_text("[]", encoding="utf-8")
    sequence = tmp_path / "sequence.anum"
    sequence.write_text("1110", encoding="utf-8")

    empty_result = run_cli("deserialize", str(empty))
    sequence_result = run_cli("deserialize", str(sequence))

    assert empty_result.returncode == 0
    assert "denotation: R" in empty_result.stdout
    assert "operations: OPEN CLOSE" in empty_result.stdout

    assert sequence_result.returncode == 0
    assert "denotation: (((L⟼L)⟼L)⟼U)" in sequence_result.stdout
    assert "resolved_values: L L L U" in sequence_result.stdout


def test_cli_normalize_removes_comments_and_whitespace(tmp_path):
    anum_file = tmp_path / "spaced.anum"
    anum_file.write_text("# anum-format: quaternary\n[ 0 1 ] # comment\n", encoding="utf-8")

    result = run_cli("normalize", str(anum_file))
    assert result.returncode == 0
    assert result.stdout.strip() == "[01]"


def test_cli_semantic_commands_reject_string_mode(tmp_path):
    anum_file = tmp_path / "string.anum"
    anum_file.write_text("# anum-format: string\na b\n", encoding="utf-8")

    for command in ("validate", "deserialize", "normalize"):
        result = run_cli(command, str(anum_file))
        assert result.returncode != 0
        assert command in result.stderr
        assert "quaternary" in result.stderr


def test_cli_no_longer_exposes_historical_projection_quote_or_realize_commands():
    for command in ("project", "quote", "unquote", "realize"):
        result = run_cli(command, "missing.anum")
        assert result.returncode != 0
        assert "invalid choice" in result.stderr
