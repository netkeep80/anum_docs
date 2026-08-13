# -*- coding: utf-8 -*-
"""
Тесты конвертеров МТС.

Запуск:
  python3 tests/test_converters.py
"""

import sys
import os
import unittest

# Добавляем корень проекта в путь
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from converters.text_to_anum import (
    byte_to_abits, char_to_anum, text_to_anum, text_to_anum_verbose
)
from converters.anum_to_text import (
    abits_to_byte, extract_char_anums, anum_to_char, anum_to_text,
    anum_to_text_verbose
)
from converters.ascii_unicode import (
    unicode_to_ascii, ascii_to_unicode, abits_to_aprover, aprover_to_abits
)


class TestByteToAbits(unittest.TestCase):
    """Тесты конвертации байтов в абиты."""

    def test_zero(self):
        self.assertEqual(byte_to_abits(0), '00000000')

    def test_max(self):
        self.assertEqual(byte_to_abits(255), '11111111')

    def test_ascii_A(self):
        # A = 0x41 = 01000001
        self.assertEqual(byte_to_abits(0x41), '01000001')

    def test_ascii_a(self):
        # a = 0x61 = 01100001
        self.assertEqual(byte_to_abits(0x61), '01100001')

    def test_rejects_out_of_byte_range(self):
        for value in (-1, 256):
            with self.subTest(value=value):
                with self.assertRaises(ValueError):
                    byte_to_abits(value)

    def test_rejects_bool_as_byte(self):
        with self.assertRaises(ValueError):
            byte_to_abits(True)


class TestAbitsToByteRoundtrip(unittest.TestCase):
    """Тесты обратной конвертации абитов в байты."""

    def test_roundtrip_all_values(self):
        for i in range(256):
            abits = byte_to_abits(i)
            back = abits_to_byte(abits)
            self.assertEqual(i, back, f'Roundtrip failed for byte {i}')

    def test_invalid_length(self):
        with self.assertRaises(ValueError):
            abits_to_byte('101')

    def test_invalid_char(self):
        with self.assertRaises(ValueError):
            abits_to_byte('101x0101')


class TestCharToAnum(unittest.TestCase):
    """Тесты конвертации символов в ачисла."""

    def test_ascii_char(self):
        anum = char_to_anum('A')
        self.assertTrue(anum.startswith('['))
        self.assertTrue(anum.endswith(']'))
        self.assertEqual(len(anum), 10)  # '[' + 8 abits + ']'

    def test_cyrillic_char(self):
        anum = char_to_anum('М')
        # Кириллица — 2 байта UTF-8 → 16 абитов
        self.assertEqual(len(anum), 18)  # '[' + 16 abits + ']'

    def test_infinity_symbol(self):
        anum = char_to_anum('∞')
        # ∞ (U+221E) — 3 байта UTF-8 → 24 абита
        self.assertEqual(len(anum), 26)  # '[' + 24 abits + ']'


class TestTextToAnumRoundtrip(unittest.TestCase):
    """Тесты двунаправленной конвертации текст ↔ ачисло."""

    def test_ascii_roundtrip(self):
        text = 'hello'
        self.assertEqual(anum_to_text(text_to_anum(text)), text)

    def test_cyrillic_roundtrip(self):
        text = 'МТС'
        self.assertEqual(anum_to_text(text_to_anum(text)), text)

    def test_mixed_roundtrip(self):
        text = 'hello МТС'
        self.assertEqual(anum_to_text(text_to_anum(text)), text)

    def test_unicode_symbols_roundtrip(self):
        text = '♂♀∞→'
        self.assertEqual(anum_to_text(text_to_anum(text)), text)

    def test_digits_roundtrip(self):
        text = '0123456789'
        self.assertEqual(anum_to_text(text_to_anum(text)), text)

    def test_empty_string(self):
        self.assertEqual(text_to_anum(''), '')
        self.assertEqual(anum_to_text(''), '')

    def test_single_char(self):
        for c in 'AzМЯ09!':
            self.assertEqual(anum_to_text(text_to_anum(c)), c)

    def test_spaces_and_punctuation(self):
        text = 'hello, world!'
        self.assertEqual(anum_to_text(text_to_anum(text)), text)


class TestAnumToCharBoundary(unittest.TestCase):
    """Тесты явной границы одного UTF-8 символа."""

    def test_rejects_empty_character_payload(self):
        with self.assertRaises(ValueError):
            anum_to_char('')

    def test_rejects_two_characters_in_one_group(self):
        abits = byte_to_abits(ord('A')) + byte_to_abits(ord('B'))
        with self.assertRaises(ValueError):
            anum_to_char(abits)

    def test_verbose_rejects_two_characters_with_domain_error(self):
        abits = byte_to_abits(ord('A')) + byte_to_abits(ord('B'))
        with self.assertRaises(ValueError):
            anum_to_text_verbose(f'[{abits}]')

    def test_rejects_invalid_utf8_with_domain_error(self):
        with self.assertRaises(ValueError):
            anum_to_char('11111111')


class TestExtractCharAnums(unittest.TestCase):
    """Тесты извлечения отдельных ачисел из строки."""

    def test_single(self):
        chars = extract_char_anums('[10101010]')
        self.assertEqual(chars, ['10101010'])

    def test_multiple(self):
        chars = extract_char_anums('[11111111][00000000]')
        self.assertEqual(len(chars), 2)

    def test_invalid_unmatched(self):
        with self.assertRaises(ValueError):
            extract_char_anums('[11')

    def test_invalid_extra_close(self):
        with self.assertRaises(ValueError):
            extract_char_anums('11]]')

    def test_abit_outside_context(self):
        with self.assertRaises(ValueError):
            extract_char_anums('1[11]')

    def test_whitespace_ignored(self):
        chars = extract_char_anums('[11] [00]')
        self.assertEqual(len(chars), 2)


class TestVerboseOutput(unittest.TestCase):
    """Тесты подробного вывода."""

    def test_text_to_anum_verbose(self):
        result = text_to_anum_verbose('A')
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]['char'], 'A')
        self.assertEqual(result[0]['codepoint'], 'U+0041')
        self.assertIn('0x41', result[0]['utf8_bytes'])


class TestUnicodeToAscii(unittest.TestCase):
    """Тесты конвертации Unicode → ASCII нотации."""

    def test_operators(self):
        self.assertEqual(unicode_to_ascii('a ⟼ b'), 'a -> b')

    def test_negated_arrow(self):
        self.assertEqual(unicode_to_ascii('a ¬⟼ b'), 'a !-> b')

    def test_symbols(self):
        result = unicode_to_ascii('♂∞♀')
        self.assertIn('M', result)
        self.assertIn('INF', result)
        self.assertIn('F', result)

    def test_negation(self):
        self.assertEqual(unicode_to_ascii('¬x'), '!x')

    def test_inequality(self):
        self.assertEqual(unicode_to_ascii('a ≠ b'), 'a != b')

    def test_complex_formula(self):
        result = unicode_to_ascii('∞ : ∞ ⟼ ∞')
        self.assertEqual(result, 'INF : INF -> INF')

    def test_selfclosure(self):
        result = unicode_to_ascii('♂v : ♂v ⟼ v')
        self.assertEqual(result, 'M v : M v -> v')

    def test_spaces_between_identifiers(self):
        result = unicode_to_ascii('♂♀')
        self.assertEqual(result, 'M F')


class TestAsciiToUnicode(unittest.TestCase):
    """Тесты конвертации ASCII → Unicode нотации."""

    def test_operators(self):
        self.assertEqual(ascii_to_unicode('a -> b'), 'a ⟼ b')

    def test_negated_arrow(self):
        self.assertEqual(ascii_to_unicode('a !-> b'), 'a ¬⟼ b')

    def test_symbols(self):
        self.assertEqual(ascii_to_unicode('INF'), '∞')

    def test_negation(self):
        self.assertEqual(ascii_to_unicode('!x'), '¬x')

    def test_inequality(self):
        self.assertEqual(ascii_to_unicode('a != b'), 'a ≠ b')

    def test_complex_formula(self):
        result = ascii_to_unicode('INF : INF -> INF')
        self.assertEqual(result, '∞ : ∞ ⟼ ∞')

    def test_plain_word_not_corrupted(self):
        # Регрессия issue #46: наивный str.replace превращал "FORM" в "♀OR♂".
        # Буквы M и F внутри обычного слова не должны заменяться.
        self.assertEqual(ascii_to_unicode('FORM'), 'FORM')

    def test_words_containing_mtc_letters(self):
        for word in ('FORM', 'MTC', 'INFO', 'FROM', 'MODEM', 'FF', 'MM'):
            self.assertEqual(
                ascii_to_unicode(word), word,
                f'Слово "{word}" не должно изменяться'
            )

    def test_standalone_tokens_still_converted(self):
        self.assertEqual(ascii_to_unicode('M'), '♂')
        self.assertEqual(ascii_to_unicode('F'), '♀')
        self.assertEqual(ascii_to_unicode('M F'), '♂ ♀')

    def test_tokens_in_sentence(self):
        # Токены конвертируются, окружающие слова — нет.
        self.assertEqual(ascii_to_unicode('the FORM of M'), 'the FORM of ♂')

    def test_roundtrip_via_ascii(self):
        # unicode_to_ascii вставляет пробелы между M/F/INF, поэтому обратная
        # конвертация восстанавливает исходные символы (с разделителями).
        self.assertEqual(ascii_to_unicode(unicode_to_ascii('♂∞♀')), '♂ ∞ ♀')


class TestAbitConversion(unittest.TestCase):
    """Тесты конвертации абитов между anum_docs и aprover.

    После унификации нотаций символы абитов совпадают,
    поэтому конвертация является тождественной.
    """

    def test_to_aprover(self):
        self.assertEqual(abits_to_aprover('[10]'), '[10]')

    def test_to_anum(self):
        self.assertEqual(aprover_to_abits('[10]'), '[10]')

    def test_roundtrip_to_aprover(self):
        original = '[[][10][00]'
        converted = abits_to_aprover(original)
        back = aprover_to_abits(converted)
        self.assertEqual(back, original)

    def test_roundtrip_to_anum(self):
        original = '[[]][10][00]'
        converted = aprover_to_abits(original)
        back = abits_to_aprover(converted)
        self.assertEqual(back, original)


if __name__ == '__main__':
    unittest.main(verbosity=2)
