# -*- coding: utf-8 -*-
"""
Декодер UTF-8 payload из четверичной абитовой записи.

Обратная операция к text_to_anum: восстанавливает текст из
последовательности абитов.

Этот модуль не является десериализатором связей. Он работает только с
текстовым payload, закодированным через UTF-8 байты.

Формат payload:
  - Символ закодирован как '[' абиты ']' где абиты — '1'/'0' (биты 1/0)
  - Каждые 8 абитов — один байт UTF-8
  - Строка — конкатенация закодированных символов

Использование:
  python3 converters/anum_to_text.py "[10010001][10100100][10010100][10010100][10010111]"
  python3 converters/anum_to_text.py --file output.anum
  python3 converters/anum_to_text.py --verbose "[10010001]"
"""

import sys
import argparse


def abits_to_byte(abits: str) -> int:
    """Конвертация 8 абитов в значение байта.

    Args:
        abits: Строка из 8 символов '1' (единица) и '0' (нуль).

    Returns:
        Значение байта (0–255).

    Raises:
        ValueError: Если длина не 8 или содержит недопустимые символы.
    """
    if len(abits) != 8:
        raise ValueError(
            f'Ожидается 8 абитов, получено {len(abits)}: "{abits}"'
        )
    binary = ''
    for a in abits:
        if a == '1':
            binary += '1'
        elif a == '0':
            binary += '0'
        else:
            raise ValueError(f'Недопустимый абит: "{a}" (ожидается "1" или "0")')
    return int(binary, 2)


def extract_char_anums(anum: str) -> list:
    """Извлечение отдельных ачисел символов из строки.

    Парсит вложенные контексты '[' ... ']' верхнего уровня.

    Args:
        anum: Четверичная абитовая запись (строка из '[', ']', '1', '0').

    Returns:
        Список строк — содержимое каждого контекста верхнего уровня.

    Raises:
        ValueError: При некорректной структуре скобок.
    """
    chars = []
    depth = 0
    current = []

    for c in anum:
        if c == '[':
            depth += 1
            if depth > 1:
                current.append(c)
        elif c == ']':
            depth -= 1
            if depth < 0:
                raise ValueError('Лишняя закрывающая скобка "]"')
            if depth == 0:
                chars.append(''.join(current))
                current = []
            else:
                current.append(c)
        elif c in '10':
            if depth == 0:
                raise ValueError(
                    f'Абит "{c}" вне контекста (вне скобок). '
                    f'Ожидается формат: [абиты]'
                )
            current.append(c)
        elif c in ' \t\n\r':
            continue  # пропускаем пробельные символы
        else:
            raise ValueError(f'Недопустимый символ: "{c}"')

    if depth != 0:
        raise ValueError(f'Незакрытые скобки []: глубина = {depth}')

    return chars


def anum_to_char(abits: str) -> str:
    """Конвертация ачисла одного символа в один UTF-8 символ.

    Args:
        abits: Строка абитов ('1' и '0'), кратная 8 по длине.

    Returns:
        Ровно один декодированный UTF-8 символ.

    Raises:
        ValueError: При некорректной длине, UTF-8 или числе символов.
    """
    if len(abits) % 8 != 0:
        raise ValueError(
            f'Длина абитов ({len(abits)}) не кратна 8: "{abits}"'
        )
    byte_values = []
    for i in range(0, len(abits), 8):
        byte_values.append(abits_to_byte(abits[i:i+8]))
    try:
        char = bytes(byte_values).decode('utf-8')
    except UnicodeDecodeError as exc:
        raise ValueError('Ачисло символа содержит некорректную UTF-8 последовательность') from exc
    if len(char) != 1:
        raise ValueError(
            f'Ожидается ровно один UTF-8 символ, декодировано: {len(char)}'
        )
    return char


def anum_to_text(anum: str) -> str:
    """Декодирование UTF-8 текста из четверичной абитовой записи.

    Args:
        anum: Четверичная абитовая запись в формате [абиты][абиты]...

    Returns:
        Декодированный UTF-8 текст.
    """
    char_anums = extract_char_anums(anum)
    return ''.join(anum_to_char(a) for a in char_anums)


def anum_to_text_verbose(anum: str) -> list:
    """Подробная конвертация с информацией о каждом символе.

    Args:
        anum: Четверичное ачисло.

    Returns:
        Список словарей с деталями декодирования.
    """
    char_anums = extract_char_anums(anum)
    result = []
    for abits in char_anums:
        byte_values = []
        for i in range(0, len(abits), 8):
            byte_values.append(abits_to_byte(abits[i:i+8]))
        char = anum_to_char(abits)
        entry = {
            'anum': f'[{abits}]',
            'abits': abits,
            'utf8_bytes': [f'0x{b:02X}' for b in byte_values],
            'codepoint': f'U+{ord(char):04X}',
            'char': char,
        }
        result.append(entry)
    return result


def main():
    parser = argparse.ArgumentParser(
        description='Декодер UTF-8 payload из четверичной абитовой записи'
    )
    parser.add_argument(
        'anum', nargs='?', default=None,
        help='Четверичное ачисло для конвертации'
    )
    parser.add_argument(
        '--file', '-f', type=str, default=None,
        help='Файл с ачислом для конвертации'
    )
    parser.add_argument(
        '--verbose', '-v', action='store_true',
        help='Подробный вывод с деталями декодирования'
    )

    args = parser.parse_args()

    if args.file:
        with open(args.file, 'r', encoding='utf-8') as f:
            anum = f.read().strip()
    elif args.anum is not None:
        anum = args.anum
    else:
        parser.print_help()
        sys.exit(1)

    if args.verbose:
        details = anum_to_text_verbose(anum)
        print(f'Ачисло: {anum}')
        print(f'Символов: {len(details)}')
        print()
        for entry in details:
            print(f'  {entry["anum"]}  '
                  f'→  {entry["char"]}  '
                  f'({entry["codepoint"]})  '
                  f'UTF-8: {" ".join(entry["utf8_bytes"])}')
        print()
        print(f'Результат: {anum_to_text(anum)}')
    else:
        print(anum_to_text(anum))


if __name__ == '__main__':
    main()
