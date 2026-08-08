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
| [Пучки связей МТС](docs/theory/Пучки%20связей%20МТС.md) | теоретический смысл ConstraintBundle / flat ValueBundle |
| [Reference model МТС v0.2](docs/specs/Reference%20model%20МТС%20v0.2.md) | границы L0–L5 и инженерная semantics |
| [Формальная нотация МТС](docs/specs/Формальная%20нотация%20МТС.md) | typed L2 syntax и interpretation |
| [Пучки значений МТС v0.2](docs/specs/Пучки%20значений%20МТС%20v0.2.md) | static elaboration, flat algebra и read-only expansion |
| [Ачисла и сериализация](docs/specs/Ачисла%20и%20сериализация.md) | L3 `*.anum`, raw carrier, denotation и serialization |
| [Протокол абитов ачисел](docs/specs/Протокол%20абитов%20ачисел.md) | contextual L3 projection и quote semantics |
| [MTS contract v0.2](contracts/mts-contract-v0.2.json) | language-neutral normative contract |
| [ValueBundle contract v0.2](contracts/mts-value-bundle-v0.2.json) | accepted flat bundle semantics |
| [ValueBundle conformance v0.2](contracts/mts-value-bundle-conformance-v0.2.json) | executable bundle compatibility corpus |
| [Anum raw carrier v0.2](contracts/anum-raw-carrier-v0.2.json) | storage-neutral описание raw-последовательности абитов |
| [Anum boundary projection v0.2](contracts/anum-boundary-projection-v0.2.json) | принятый root-context boundary subset L3 |
| [Anum denotation v0.2](contracts/anum-denotation-v0.2.json) | storage-neutral structural handoff L3→L4 |
| [Anum pair denotation v0.2](contracts/anum-pair-denotation-v0.2.json) | прямой structural subset `0/1` и двух protocol atoms |
| [Anum recursive denotation v0.2](contracts/anum-recursive-denotation-v0.2.json) | принятая рекурсивная root grammar и canonical inverse |
| [MTS conformance v0.2](contracts/mts-conformance-v0.2.json) | cross-language executable compatibility corpus |
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

## Пучки связей v0.2

Фигурная запись `{...}` статически различается на две семантические роли:

```text
ConstraintBundle
ValueBundle
```

Корневые `{◁ = ∞, ▷ = ∞}` и `{♀◁ = ♀▷, ◁♂ = ▷♂}` остаются `ConstraintBundle` и не изменяют 10 root definitions.

Плоский `ValueBundle` представляет экстенсиональный набор **уже разрешённых** связей. Source occurrences сохраняются раздельно, поэтому одинаковые `[]` нельзя схлопывать по glyph до resolution. После resolution порядок и повторы не входят в семантическое равенство пучка.

Read-only expansion использует пучок как множество допустимых полюсов:

```text
a{b,c}
{a,b}c
{a,b}{c,d}
```

В expansion-position пустой пучок является wildcard endpoint:

```text
a{}   — существующие outgoing links
{}b   — существующие incoming links
{}{}  — существующие links рассматриваемой памяти
```

Отсутствующие links не создаются. Nested ValueBundle, bundle-valued definitions и lifting scalar operators на bundle в v0.2 не приняты.

## L2 и L3 не смешиваются

В L3 базовый Anum-алфавит:

```text
[ ] 1 0
```

В L2 квадратные скобки являются формальной нотацией. Их видимое совпадение с L3-абитами не создаёт автоматического тождества.

Принятый root-context boundary subset L3 выводится из root definitions МТС v0.2:

```text
[  → ♀∞
]  → ∞♂
[] → 1
][ → 0
```

После boundary/protocol слоя принят storage-neutral structural handoff и два denoting subset:

```text
0 / 1
00 / 01 / 10 / 11
```

а также рекурсивная root grammar:

```text
Atom  = 0 | 1
Value = Atom | '[' Pair ']'
Pair  = Value Value
Root  = Atom | Pair
```

Для корневой записи действует проверяемое схлопывание ведущих открывающих абитов: decoder принимает structural reading только если повторное canonical encode в точности восстанавливает исходный raw carrier. Поэтому неоднозначные или неканонические строки не угадываются, а остаются typed `RAW`.

`[[` и `]]` по-прежнему имеют специальный boundary status и не получают structural denotation. `quote` и `relative` не наследуют рекурсивную root grammar автоматически: quote сохраняет свой отдельный уровень описания, relative остаётся raw до отдельного принятого контракта.

## Рабочие инструменты

```text
core/reference_model.py         декларативный contract L0–L5
core/semantic_carrier.py        конечный cyclic Link carrier L1
core/mtc_ast.py                 typed AST L2
core/mtc_parser.py              tokenizer + Pratt parser L2
core/mtc_interpreter.py         read-only contextual ConstraintBundle interpreter
core/mtc_value_bundle.py        canonical flat ValueBundle elaboration/value/query core
core/root_library.py            загрузка canonical root definitions
core/validate_root.py           structural root validation

contracts/mts-contract-v0.2.json
                               versioned language-neutral contract
contracts/mts-value-bundle-v0.2.json
                               accepted flat ValueBundle contract
contracts/mts-value-bundle-conformance-v0.2.json
                               accepted bundle conformance corpus
contracts/anum-raw-carrier-v0.2.json
                               storage-neutral raw carrier
contracts/anum-boundary-projection-v0.2.json
                               accepted root-context boundary projection
contracts/anum-denotation-v0.2.json
                               storage-neutral L3→L4 structural IR
contracts/anum-pair-denotation-v0.2.json
                               accepted direct protocol/pair subset
contracts/anum-recursive-denotation-v0.2.json
                               accepted recursive root denotation
contracts/mts-conformance-v0.2.json
                               cross-language formal-language corpus

core/anum_model.py              typed L3 contexts/results
core/anum_parser.py             raw parse + incremental decoder + serialization
core/anum_protocol.py           validate/project/quote/unquote/dictionary
core/anum_denotation.py         storage-neutral denotation IR
core/anum_pair_denotation.py    direct pair subset
core/anum_raw_carrier.py        structural raw carrier description
core/anum_recursive_denotation.py
                               recursive root decode + canonical inverse
core/anum_memory.py             canonical indexed in-memory L4 store
core/proof_checker.py           replay-only trusted L5 checker

converters/anum_cli.py
converters/text_to_anum.py
converters/anum_to_text.py
converters/ascii_unicode.py
```

`carrier_isomorphic()` — техническое сравнение finite carrier topology и не является L2 `=`.

`core/mtc_interpreter.py` остаётся единственным active ConstraintBundle interpreter; `core/mtc_value_bundle.py` исполняет отдельную принятую ValueBundle role. Candidate/legacy copies после promotion не сохраняются.

## Cross-language conformance

`contracts/mts-conformance-v0.2.json` содержит одинаковые входы и ожидаемые результаты для любой реализации МТС v0.2:

```text
lexing cases
canonicalization cases
ContextFrame + memory fixtures
expected local substitutions / aliases
normalized resolution trace kinds
```

Python reference runtime обязан проходить этот corpus в CI. Другие consumers, включая `aprover`, должны проходить тот же файл, а не копировать правила вручную.

Flat ValueBundle имеет отдельный accepted corpus `contracts/mts-value-bundle-conformance-v0.2.json`; downstream consumers обязаны исполнять его после repin, а не выводить bundle semantics из UI или legacy prover behavior.

L3 имеет отдельные language-neutral corpora для raw carrier, denotation IR, pair subset и recursive root denotation. Downstream L4/AVM adapters должны потреблять typed результаты этих контрактов и не дублировать quaternary grammar.

## Сквозной vertical slice v0.2

Один integration test связывает production APIs без mock/legacy обходов:

```text
raw Anum
→ parse
→ RawCarrierDescription
→ accepted recursive AnumDenotation
→ L4 load/find/realize/find
→ canonical inverse

materialized LinkRef
→ L2 structural interpretation
→ mts-proof/v0.2
→ independent L5 replay
```

Запуск:

```bash
python -m pytest tests/test_mts_v02_end_to_end.py -v
```

В этом же suite проверяется отрицательный путь: noncanonical `010` остаётся `RAW`, quote остаётся `QUOTED_RAW`, и ни один из них не превращается в скрытую команду materialization.

## Интеграция с визуальным апрувером

`anum_docs` остаётся единственным normative source МТС.

`aprover` потребляет versioned contract и conformance corpus отсюда. Display labels не являются runtime identity: визуально одинаковые occurrences могут иметь разные `HoleId`/`LinkRef`.

После изменения accepted contract downstream `aprover` обязан repin-ить exact upstream snapshot и исполнить новый bundle conformance corpus до добавления собственной UI semantics.

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
