# Метатеория связей (МТС)

МТС исходит из постулата:

```text
всё есть связь
```

Связь — единственная форма существования; существовать — значит быть связью. Смысл не существует отдельно от связи: связь и есть смысл в своей различённой форме. Нормативный набор формул хранится в `tests/mtc_formulas.mtc`.

## Каноническая структура

| Артефакт | Роль |
|---|---|
| [Основания МТС](docs/theory/Основания%20МТС.md) | онтологические основания |
| [Система аксиом МТС](docs/theory/Система%20аксиом%20МТС.md) | нормативное чтение корневых формул |
| [Reference model МТС v0.1](docs/specs/Reference%20model%20МТС%20v0.1.md) | границы L0–L5 и инженерный контракт версии |
| [Формальная нотация МТС](docs/specs/Формальная%20нотация%20МТС.md) | typed L2 syntax, скобочные формы и роли вхождений |
| [Ачисла и сериализация](docs/specs/Ачисла%20и%20сериализация.md) | контейнер `*.anum`, raw parser, dictionary и serialization |
| [Протокол абитов ачисел](docs/specs/Протокол%20абитов%20ачисел.md) | contextual L3 projection и quote semantics |
| [Корневой fixture](tests/mtc_formulas.mtc) | единственный машинно-читаемый набор формул |

`docs/research/` содержит ненормативные исходные заметки. Они не определяют активную систему.

## Архитектурные уровни v0.1

```text
L0  онтология
L1  семантическая reference model
L2  формальный язык
L3  сериализация ачисел
L4  исполнение и апамять
L5  теория вывода
```

Совпадение написания на разных уровнях не означает автоматического тождества объектов. В частности, квадратная форма L2 и абиты `[ ]` L3 связываются только явным правилом протокола.

## Базовые различия

```text
[] — минимальная завершённая форма одной связи
() — минимальная формальная форма смысла
{} — пустой пучок связей

(...) — круглая формальная нотация
[...] — квадратная форма L2
{...} — пучковая нотация
```

Несвязь не существует в натуре; смысл несвязи выражается связью. `0` — абит связи, несущей смысл несвязи, а `↛` — смысл несвязи.

## Рабочие инструменты

```text
core/reference_model.py     декларативный контракт МТС/Anum v0.1
core/semantic_carrier.py    конечный cyclic Link carrier принятой части L1
core/mtc_ast.py             typed AST формального языка L2
core/mtc_parser.py          tokenizer, Pratt parser и static validation L2
core/root_library.py        загрузка fixture через typed AST
core/validate_root.py       структурная валидация root library

core/anum_model.py          typed L3 contexts/results
core/anum_parser.py         raw parse + incremental decoder + deterministic serialization
core/anum_protocol.py       validate/project/quote/unquote/dictionary layer
core/anum_memory.py         временный L4 symbolic test-double до #72
converters/anum_cli.py      CLI parse/validate/project/normalize/quote/unquote
converters/text_to_anum.py  UTF-8 payload → quaternary запись
converters/anum_to_text.py  quaternary запись → UTF-8 payload
converters/ascii_unicode.py ASCII ↔ Unicode
```

L1 carrier уже умеет конечные циклы, self-closure начала/конца, конкретную Link-инверсию и проверку точной rooted carrier topology. `carrier_isomorphic()` является инженерным сравнением конечного носителя и **не является L2-оператором `=`**; полная equality/substitution semantics остаётся открытой в #79.

L2 имеет один production parsing path: `core/mtc_parser.py`. L3 имеет один protocol path: `core/anum_parser.py` читает только raw carrier, а `core/anum_protocol.py` выполняет context validation/projection.

Старые `mtc_reader.py`, `layers.py`, двухабитный `anum_projector.py` и отдельный symbolic `Quote` удалены после миграции consumers.

`core/reference_model.py` не является prover. `core/semantic_carrier.py` не решает `:`/`=`. `core/anum_memory.py` не является реализацией полноценной апамяти.

## Проверка

```bash
python -m pytest tests -v --tb=short
ruff check converters/ core/ tests/ --ignore E501,F401
git diff --check
```

## Вклад

Правила изменения активного ядра приведены в [руководстве по вкладу](docs/CONTRIBUTING.md).

## Лицензия

Проект распространяется под лицензией [Unlicense](LICENSE).

## Авторы и соавторы

- [Вертушкин Роман Павлович](https://github.com/netkeep80)
- [Дьяченко Константин Константинович](https://github.com/konard)
- [Шакиров Тимур Эдуардович](https://github.com/TimaxLacs)
- [Бурдуков Александр Николаевич](https://github.com/InAiwetrustAGI)
- [Глазунов Иван Сергеевич](https://github.com/ivansglazunov)
