"""CLI for the accepted pure ``anum-deserialization/v0.4`` path."""

import argparse
from pathlib import Path

from core.anum_model import AnumForm, AnumSource
from core.anum_parser import normalize_raw_form, parse_anum_file
from core.anum_protocol import deserialize_anum, validate_anum


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Инструменты текущего потока ANUM v0.4")
    subparsers = parser.add_subparsers(dest="command", required=True)

    parse_parser = subparsers.add_parser("parse", help="Лексически разобрать *.anum")
    parse_parser.add_argument("file")

    validate_parser = subparsers.add_parser(
        "validate",
        help="Проверить границы стековой десериализации",
    )
    validate_parser.add_argument("file")

    deserialize_parser = subparsers.add_parser(
        "deserialize",
        help="Выполнить чистую десериализацию ANUM v0.4",
    )
    deserialize_parser.add_argument("file")

    normalize_parser = subparsers.add_parser(
        "normalize",
        help="Вывести каноническую четырёхзначную запись",
    )
    normalize_parser.add_argument("file")

    args = parser.parse_args(argv)

    try:
        if args.command == "parse":
            _command_parse(args.file)
        elif args.command == "validate":
            _command_validate(args.file)
        elif args.command == "deserialize":
            _command_deserialize(args.file)
        elif args.command == "normalize":
            _command_normalize(args.file)
        else:
            parser.error(f"Неизвестная команда: {args.command}")
    except (KeyError, TypeError, ValueError) as exc:
        parser.exit(1, f"{exc}\n")

    return 0


def _read_source(path: str) -> AnumForm | AnumSource:
    return parse_anum_file(Path(path).read_text(encoding="utf-8"))


def _require_quaternary(path: str, command: str) -> AnumForm:
    source = _read_source(path)
    if not isinstance(source, AnumForm):
        raise ValueError(f"{command} поддерживает только quaternary *.anum")
    return source


def _command_parse(path: str) -> None:
    source = _read_source(path)
    if isinstance(source, AnumForm):
        print("format: quaternary")
        print("tokens:")
        for index, token in enumerate(source.tokens):
            print(f"  {index}: {token.abit.value}")
        return

    print("format: string")
    print("text:")
    print(source.text)


def _command_validate(path: str) -> None:
    result = validate_anum(_require_quaternary(path, "validate"))
    print(f"valid: {str(result.is_valid).lower()}")
    if result.error is not None:
        print(f"error: {result.error}")


def _command_deserialize(path: str) -> None:
    source = _require_quaternary(path, "deserialize")
    result = deserialize_anum(source)
    print(f"input: {normalize_raw_form(source)}")
    print(f"denotation: {result.denotation}")
    print("resolved_values: " + " ".join(result.resolved_values))
    print("operations: " + " ".join(result.operations))


def _command_normalize(path: str) -> None:
    source = _require_quaternary(path, "normalize")
    print(normalize_raw_form(source))


if __name__ == "__main__":
    raise SystemExit(main())
