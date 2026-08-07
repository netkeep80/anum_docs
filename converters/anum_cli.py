"""CLI for the canonical L3 ``*.anum`` protocol v0.1."""

import argparse
from pathlib import Path

from core.anum_model import AnumForm, AnumSource, ProjectionContext
from core.anum_parser import normalize_raw_form, parse_anum_file
from core.anum_protocol import (
    project_anum,
    quote_anum,
    unquote_anum,
    validate_anum,
)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Инструменты протокола *.anum v0.1")
    subparsers = parser.add_subparsers(dest="command", required=True)

    parse_parser = subparsers.add_parser("parse", help="Разобрать raw *.anum")
    parse_parser.add_argument("file")

    validate_parser = subparsers.add_parser(
        "validate",
        help="Проверить raw carrier в явном контексте",
    )
    validate_parser.add_argument("file")
    _add_context_argument(validate_parser)

    project_parser = subparsers.add_parser(
        "project",
        help="Спроецировать raw carrier в явном контексте",
    )
    project_parser.add_argument("file")
    _add_context_argument(project_parser)

    normalize_parser = subparsers.add_parser(
        "normalize",
        help="Вывести каноническую quaternary запись",
    )
    normalize_parser.add_argument("file")

    quote_parser = subparsers.add_parser(
        "quote",
        help="Добавить одну реальную quote-оболочку [ ... ]",
    )
    quote_parser.add_argument("file")

    unquote_parser = subparsers.add_parser(
        "unquote",
        help="Снять одну quote-оболочку [ ... ]",
    )
    unquote_parser.add_argument("file")

    args = parser.parse_args(argv)

    try:
        if args.command == "parse":
            _command_parse(args.file)
        elif args.command == "validate":
            _command_validate(args.file, ProjectionContext(args.context))
        elif args.command == "project":
            _command_project(args.file, ProjectionContext(args.context))
        elif args.command == "normalize":
            _command_normalize(args.file)
        elif args.command == "quote":
            _command_quote(args.file)
        elif args.command == "unquote":
            _command_unquote(args.file)
        else:
            parser.error(f"Неизвестная команда: {args.command}")
    except (KeyError, TypeError, ValueError) as exc:
        parser.exit(1, f"{exc}\n")

    return 0


def _add_context_argument(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "--context",
        choices=[context.value for context in ProjectionContext],
        default=ProjectionContext.ROOT.value,
    )


def _read_source(path: str) -> AnumForm | AnumSource:
    text = Path(path).read_text(encoding="utf-8")
    return parse_anum_file(text)


def _require_quaternary(path: str, command: str) -> AnumForm:
    source = _read_source(path)
    if not isinstance(source, AnumForm):
        raise ValueError(f"{command} поддерживает только quaternary *.anum")
    return source


def _command_parse(path: str) -> None:
    source = _read_source(path)
    if isinstance(source, AnumForm):
        _print_form(source)
        return

    print("format: string")
    print("text:")
    print(source.text)


def _command_validate(path: str, context: ProjectionContext) -> None:
    source = _require_quaternary(path, "validate")
    result = validate_anum(source, context)

    print(f"context: {result.context.value}")
    print(f"valid: {str(result.is_valid).lower()}")
    for message in result.messages:
        print(f"message: {message}")


def _command_project(path: str, context: ProjectionContext) -> None:
    source = _require_quaternary(path, "project")
    result = project_anum(source, context)

    print(f"context: {result.context.value}")
    print(f"input: {result.source}")
    print(f"kind: {result.kind.value}")
    print(f"protocol_value: {result.protocol_value}")
    if result.arrow_form is not None:
        print(f"arrow_form: {result.arrow_form}")
    if result.projected is not None:
        print(f"projected: {normalize_raw_form(result.projected)}")
    if result.note:
        print(f"note: {result.note}")


def _command_normalize(path: str) -> None:
    source = _require_quaternary(path, "normalize")
    print(normalize_raw_form(source))


def _command_quote(path: str) -> None:
    source = _require_quaternary(path, "quote")
    print(normalize_raw_form(quote_anum(source)))


def _command_unquote(path: str) -> None:
    source = _require_quaternary(path, "unquote")
    print(normalize_raw_form(unquote_anum(source)))


def _print_form(form: AnumForm) -> None:
    print("format: quaternary")
    print("tokens:")
    for index, token in enumerate(form.tokens):
        print(f"  {index}: {token.abit.value}")


if __name__ == "__main__":
    raise SystemExit(main())
