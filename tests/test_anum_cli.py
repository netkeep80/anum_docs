"""CLI smoke tests for converters.anum_cli."""

import subprocess
import sys


def run_cli(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, "-m", "converters.anum_cli", *args],
        check=True,
        capture_output=True,
        text=True,
    )


def test_cli_parse_outputs_quaternary_tokens(tmp_path):
    anum_file = tmp_path / "sample.anum"
    anum_file.write_text("# anum-format: quaternary\n[]\n", encoding="utf-8")

    result = run_cli("parse", str(anum_file))

    assert "format: quaternary" in result.stdout
    assert "0: [" in result.stdout
    assert "1: ]" in result.stdout


def test_cli_validate_uses_explicit_context(tmp_path):
    anum_file = tmp_path / "sample.anum"
    anum_file.write_text("][", encoding="utf-8")

    result = run_cli("validate", str(anum_file), "--context", "relative")

    assert "context: relative" in result.stdout
    assert "valid: true" in result.stdout


def test_cli_project_outputs_contextual_root_projection(tmp_path):
    anum_file = tmp_path / "form.anum"
    anum_file.write_text("[]", encoding="utf-8")

    result = run_cli("project", str(anum_file), "--context", "root")

    assert "context: root" in result.stdout
    assert "input: []" in result.stdout
    assert "kind: protocol-value" in result.stdout
    assert "protocol_value: 0" in result.stdout
    assert "arrow_form: α ⟼ β" in result.stdout


def test_cli_quote_and_unquote_use_real_quaternary_envelope(tmp_path):
    raw = tmp_path / "raw.anum"
    raw.write_text("][", encoding="utf-8")

    quoted = run_cli("quote", str(raw))
    assert quoted.stdout.strip() == "[][]"

    quoted_file = tmp_path / "quoted.anum"
    quoted_file.write_text(quoted.stdout, encoding="utf-8")
    unquoted = run_cli("unquote", str(quoted_file))
    assert unquoted.stdout.strip() == "]["


def test_cli_normalize_removes_comments_and_whitespace(tmp_path):
    anum_file = tmp_path / "spaced.anum"
    anum_file.write_text("# anum-format: quaternary\n[ 0 1 ] # comment\n", encoding="utf-8")

    result = run_cli("normalize", str(anum_file))
    assert result.stdout.strip() == "[01]"


def test_cli_normalize_rejects_string_mode(tmp_path):
    anum_file = tmp_path / "string.anum"
    anum_file.write_text("# anum-format: string\na b\n", encoding="utf-8")

    result = subprocess.run(
        [sys.executable, "-m", "converters.anum_cli", "normalize", str(anum_file)],
        capture_output=True,
        text=True,
    )

    assert result.returncode != 0
    assert "normalize" in result.stderr
    assert "quaternary" in result.stderr


def test_cli_no_longer_exposes_symbolic_realize_command():
    result = subprocess.run(
        [sys.executable, "-m", "converters.anum_cli", "realize", "missing.anum"],
        capture_output=True,
        text=True,
    )

    assert result.returncode != 0
    assert "invalid choice" in result.stderr
