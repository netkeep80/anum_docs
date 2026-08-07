# Метатеория связей (МТС)

МТС исходит из постулата:

```text
всё есть связь
```

Связь — единственная форма существования. Смысл не существует отдельно от связи: связь и есть смысл в своей различённой форме.

## Каноническая структура

| Артефакт | Роль |
|---|---|
| [Основания МТС](docs/theory/Основания%20МТС.md) | онтологические основания |
| [Система аксиом МТС](docs/theory/Система%20аксиом%20МТС.md) | нормативное чтение 10 root definitions |
| [Reference model МТС v0.2](docs/specs/Reference%20model%20МТС%20v0.2.md) | границы L0–L5 и инженерная semantics |
| [Формальная нотация МТС](docs/specs/Формальная%20нотация%20МТС.md) | typed L2 syntax и interpretation |
| [Ачисла и сериализация](docs/specs/Ачисла%20и%20сериализация.md) | L3 `*.anum`, raw parser и serialization |
| [Протокол абитов ачисел](docs/specs/Протокол%20абитов%20ачисел.md) | contextual L3 projection и quote semantics |
| [MTS contract v0.2](contracts/mts-contract-v0.2.json) | machine-readable contract для внешних consumers |
| [Корневая программа](tests/mtc_formulas.mtc) | единственный машинный root definitions source |

`docs/research/` содержит ненормативные исходные заметки и не определяет активную систему.

## Архитектурные уровни

```text
L0  онтология
L1  семантическая reference model
L2  формальный язык
L3  сериализация ачисел
L4  исполнение и апамять
L5  теория вывода
```

Совпадение glyph на разных уровнях не означает тождества объектов.

## Формальная нотация v0.2

### Контекст

У бинарного интерпретационного контекста ровно две роли и два атомарных односимвольных местоимения:

```text
◁  — start текущего ContextFrame
▷  — end текущего ContextFrame
```

Подъём к родителю отделён:

```text
↑◁
↑▷
↑↑◁
```

Квадратные скобки не участвуют в context syntax.

```text
◁[]▷
```

всегда токенизируется как:

```text
◁  [  ]  ▷
```

### Anonymous form

```text
[]
```

в L2 interpreter является occurrence-local anonymous Link form. Два одинаковых `[]` — два разных AST occurrences, пока локальная интерпретация явно их не свяжет.

### Равенство

```text
(=) : {♀◁ = ♀▷, ◁♂ = ▷♂}
```

`=` — локальное identity/unification constraint, а не глобальная текстовая подстановка.

### Акорень

```text
∞ : {◁ = ∞, ▷ = ∞}
```

На L1 этому соответствует конечный self-cycle:

```text
root.start = root
root.end = root
```

## Формальная нотация как запрос к асети

`LinkForm` является не только синтаксическим конструктором, но и structural pattern.

Например:

```text
10 = [] ⟼ []
```

при `poles(10) = (2,3)` возвращает два локальных substitutions.

Вложенные patterns декомпозируются рекурсивно без materialization.

Это задаёт границу:

```text
L2: parse / interpret
L3: serialize / deserialize
L4: find / realize / delete
```

Главный invariant:

```text
interpret ≠ realize
```

## L2 и L3 не смешиваются

В L3 базовый Anum-алфавит:

```text
[ ] 1 0
```

В L2 квадратные скобки являются формальной нотацией. Их видимое совпадение с L3-абитами не создаёт автоматического тождества.

Рабочая проекция issue #61 остаётся experimental.

## Рабочие инструменты

```text
core/reference_model.py   декларативный contract L0–L5
core/semantic_carrier.py  конечный cyclic Link carrier L1
core/mtc_ast.py           typed AST L2
core/mtc_parser.py        tokenizer + Pratt parser L2
core/mtc_interpreter.py   read-only contextual interpreter L2/L4 boundary
core/root_library.py      загрузка canonical root definitions
core/validate_root.py     structural root validation

contracts/mts-contract-v0.2.json
                         versioned language-neutral contract

core/anum_model.py        typed L3 contexts/results
core/anum_parser.py       raw parse + incremental decoder + serialization
core/anum_protocol.py     validate/project/quote/unquote/dictionary
core/anum_memory.py       временный L4 test-double до production apamemory #72

converters/anum_cli.py
converters/text_to_anum.py
converters/anum_to_text.py
converters/ascii_unicode.py
```

`carrier_isomorphic()` — техническое сравнение finite carrier topology и не является L2 `=`.

`core/mtc_interpreter.py` — единственный active formal interpreter. Candidate/legacy copies после promotion не сохраняются.

## Интеграция с визуальным апрувером

`anum_docs` должен оставаться единственным normative source МТС.

Будущий `aprover` потребляет versioned machine contract и conformance vectors отсюда. Display labels не являются runtime identity: визуально одинаковые occurrences могут иметь разные `HoleId`/`LinkRef`.

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
