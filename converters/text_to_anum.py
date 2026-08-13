# -*- coding: utf-8 -*-
"""
Кодер UTF-8 текста в четверичную абитовую запись.

Этот модуль создаёт UTF-8 payload codec. Он не компилирует string symbolic
anum и не материализует связи.

Каждый символ UTF-8 текста кодируется в последовательность абитов:
  - Байт кодируется 8 абитами: бит 1 → '1', бит 0 → '0'
  - Символ оборачивается в контекст: '[' символ_абиты ']'
  - Строка — левоассоциативная цепочка закодированных символов

Соответствие МТС:
  - decode(c₁...cₙ) = (((∞ ⟼ c₁) ⟼ c₂) ⟼ ... ⟼ cₙ)
  - Где ∞ = [] (акорень)

Использование:
  python3 converters/text_to_anum.py "hello"
  python3 converters/text_to_anum.py --file input.txt
  python3 converters/text_to_anum.py --verbose "A"
"""

import sys
import argparse


def byte_to_abits(byte_val: int) -> str:
    """Конвертация одного байта в 8 абитов.

    Args:
        byte_val: Значение байта (0–255).

    Returns:
        Строка из 8 символов '1' и '0'.

    Raises:
        ValueError: Если значение не является целым байтом 0–255.
    """
    if type(byte_val) is not int or not 0 <= byte_val <= 255:
        raise ValueError(f'Ожидается значение байта 0–255, получено: {byte_val!r}')
    binary = format(byte_val, '08b')
    return ''.join('1' if bit == '1' else '0' for bit in binary)


def char_to_anum(char: str) -> str:
    """Конвертация одного символа в ачисло.

    Символ кодируется через UTF-8 байты, каждый байт — 8 абитов.
    Результат оборачивается в контекст '[' ... ']'.

    Args:
        char: Один символ UTF-8.

    Returns:
        Ачисло символа в абитовой нотации.
    """
    utf8_bytes = char.encode('utf-8')
    abits = ''.join(byte_to_abits(b) for b in utf8_bytes)
    return f'[{abits}]'


def text_to_anum(text: str) -> str:
    """Кодирование UTF-8 текста в четверичную абитовую запись.

    Каждый символ кодируется отдельно, результат — конкатенация
    ачисел символов (левоассоциативная цепочка).

    Args:
        text: UTF-8 строка.

    Returns:
        Четверичная абитовая запись (строка из символов '[', ']', '1', '0').
    """
    return ''.join(char_to_anum(c) for c in text)


def text_to_anum_verbose(text: str) -> list:
    """Подробная конвертация с информацией о каждом символе.

    Args:
        text: UTF-8 строка.

    Returns:
        Список словарей с деталями кодирования каждого символа.
    """
    result = []
    for char in text:
        utf8_bytes = char.encode('utf-8')
        entry = {
            'char': char,
            'codepoint': f'U+{ord(char):04X}',
            'utf8_bytes': [f'0x{b:02X}' for b in utf8_bytes],
            'utf8_binary': [format(b, '08b') for b in utf8_bytes],
            'anum': char_to_anum(char),
        }
        result.append(entry)
    return result


def main():
    parser = argparse.ArgumentParser(
        description='Кодер UTF-8 payload в четверичную абитовую запись'
    )
    parser.add_argument(
        'text', nargs='?', default=None,
        help='Текст для конвертации'
    )
    parser.add_argument(
        '--file', '-f', type=str, default=None,
        help='Файл с текстом для конвертации'
    )
    parser.add_argument(
        '--verbose', '-v', action='store_true',
        help='Подробный вывод с деталями кодирования'
    )

    args = parser.parse_args()

    if args.file:
        with open(args.file, 'r', encoding='utf-8') as f:
            text = f.read()
    elif args.text is not None:
        text = args.text
    else:
        parser.print_help()
        sys.exit(1)

    if args.verbose:
        details = text_to_anum_verbose(text)
        print(f'Текст: "{text}"')
        print(f'Длина: {len(text)} символов')
        print()
        for entry in details:
            print(f'  {entry["char"]}  '
                  f'({entry["codepoint"]})  '
                  f'UTF-8: {" ".join(entry["utf8_bytes"])}  '
                  f'→  {entry["anum"]}')
        print()
        print(f'Результат: {text_to_anum(text)}')
    else:
        print(text_to_anum(text))


if __name__ == '__main__':
    main()
