# Reference model МТС v0.2

Статус: **актуальное, нормативное**.

Машинный контракт: [`core/reference_model.py`](../../core/reference_model.py).

Language-neutral контракт для внешних реализаций: [`contracts/mts-contract-v0.2.json`](../../contracts/mts-contract-v0.2.json).

Этот документ фиксирует инженерную reference model, относительно которой работают parser, interpreter, протокол ачисел, будущая апамять и апрувер. Он не подменяет [Основания МТС](../theory/Основания%20МТС.md) и не объявляет Python-представление окончательной «природой связи».

## 1. Архитектурные уровни

```text
L0  Онтология
L1  Семантическая модель
L2  Формальный язык
L3  Сериализация
L4  Исполнение
L5  Теория вывода
```

Главное правило границ:

```text
совпадение написания на разных уровнях не означает тождества объектов;
верхний уровень не имеет права тайно переопределять нижний;
описание состояния не является командой изменения состояния.
```

## 2. L0 — онтология

```text
всё есть связь;
связь — единственная форма существования;
смысл не существует отдельно от связи;
несвязь не существует как отдельная натуральная сущность;
смысл несвязи выражается связью.
```

L0 не зависит от Python, графов, `*.anum`, конкретных скобок или алгоритма доказательства.

## 3. L1 — конечный Link carrier

Исполнимая reference-структура различённой связи:

```text
Link(start, end)
```

`start` и `end` ссылаются на связи. Carrier является конечным ориентированным графом; циклы разрешены.

Это позволяет хранить самоссылочные формы без бесконечного unfolding.

### Акорень

```text
root.start = root
root.end = root
```

Один LinkNode достаточен для полного self-cycle.

### Начало формы

```text
start(F).start = start(F)
start(F).end = F
```

### Конец формы

```text
end(F).start = F
end(F).end = end(F)
```

### Инверсия

```text
invert(Link(a, b)) = Link(b, a)
```

Инверсия не обязана рекурсивно перестраивать весь достижимый граф.

### Технический comparator carrier

`core/semantic_carrier.py` содержит `carrier_isomorphic(A, B)` для проверки topology конечных carrier.

Это инженерная операция и **не** синтаксический оператор L2 `=`.

## 4. L2 — формальный язык v0.2

L2 имеет typed AST:

```text
Expression
├── Form
├── Judgment
└── Definition
```

### Два атомарных местоимения контекста

У каждого бинарного `ContextFrame` ровно две роли:

```text
◁  current.start
▷  current.end
```

Оба местоимения являются самостоятельными односимвольными токенами.

Подъём к вышестоящему контексту — отдельная операция:

```text
↑◁    parent.start
↑▷    parent.end
↑↑◁   grandparent.start
```

Инвариант lexer-а:

```text
atomicPronouns = true
bracketOverloading = false
```

Квадратные скобки не участвуют в context syntax. Поэтому:

```text
◁[]▷
```

всегда лексически разбирается как четыре независимых токена:

```text
◁  [  ]  ▷
```

### `[]` — anonymous form

Пустая квадратная форма:

```text
[]
```

в исполняемой формальной нотации означает **анонимное вхождение формы связи**, а не одну глобальную Link-константу для всего исходного текста.

Каждое AST-вхождение имеет собственный `HoleId`.

Identity определяется структурным путём в typed AST:

```text
HoleId := AST occurrence path
```

а не:

```text
не display label;
не SourceSpan;
не Python/JS object identity.
```

Поэтому два одинаково записанных `[]` сначала различны:

```text
{[] = ◁, [] = ▷}
```

и получают два независимых локальных замещения.

### `=` — локальное constraint

Нормативная форма смысла равенства:

```text
(=) : {♀◁ = ♀▷, ◁♂ = ▷♂}
```

Если `ContextFrame(start=A, end=B)`, сравниваются соответствующие формы начала и конца `A` и `B`.

Ключевое ограничение:

```text
A = B
```

не создаёт глобальное rewrite-rule для всех одинаковых glyph во всех формулах.

`=` исполняется как локальное identity/unification constraint одного запуска `interpret`.

### `⟼` — одновременно форма и структурный pattern

Синтаксически:

```text
A ⟼ B
```

— `LinkForm(A, B)`.

При interpret полностью заданная LinkForm может искать существующую связь, а LinkForm с anonymous forms может **декомпозировать** уже известный `LinkRef`.

Пример:

```text
10 = [] ⟼ []
```

при:

```text
poles(10) = (2, 3)
```

даёт локальные substitutions:

```text
hole₀ → 2
hole₁ → 3
```

Вложенные patterns разбираются рекурсивно:

```text
20 = ([] ⟼ []) ⟼ []
```

без materialization новых связей.

### Круглые скобки

Round grouping сохраняется в AST и canonical printer, но прозрачен для structural matcher.

### Корневая система

Каноническая root-программа: [`tests/mtc_formulas.mtc`](../../tests/mtc_formulas.mtc).

Она содержит только 10 именованных определений. Parser/conformance-примеры последовательностей и пучков не являются корневыми аксиомами.

Ключевые определения:

```text
∞   : {◁ = ∞, ▷ = ∞}
(=) : {♀◁ = ♀▷, ◁♂ = ▷♂}
```

## 5. L3 — сериализация Anum

L3 отвечает за сериализацию/десериализацию и использует четверичный алфавит:

```text
[ ] 1 0
```

Квадратные glyph L2 и абиты L3 не тождественны автоматически.

Canonical pipeline:

```text
parse_raw_quaternary
→ validate_anum(context)
→ project_anum(context)
→ deterministic serialize
```

Рабочая проекция issue #61:

```text
[] → 0
][ → 1
```

остаётся **experimental**. Принятие L2 v0.2 не повышает её статус.

## 6. L4 — исполнение

Две разные группы операций должны оставаться разделены.

### Формальная нотация

```text
parse(source) → typed AST
interpret(AST, ContextFrame, MemoryView)
    → success
    → local substitutions
    → local aliases
    → resolution trace
```

`ContextFrame` виртуален:

```text
ContextFrame(
    start: LinkRef,
    end: LinkRef,
    parent?: ContextFrame
)
```

Для интерпретации `A = B` не требуется сначала материализовать служебную связь `A ⟼ B`.

`interpret` read-only.

### Anum / память

```text
load
 decode
project
find
realize
delete
```

Инварианты:

```text
load(A) не создаёт den(A)
decode(A) не меняет память
project(A) не меняет память
find(A) не создаёт den(A)
interpret(F) не материализует связи
realize(...) — единственная явная materializing operation
```

## 7. L5 — теория вывода

L5 ещё не содержит принятого полного trusted proof kernel.

Будущий апрувер обязан разделять:

```text
proof search
proof object
proof checker / trusted kernel
```

Visual UI не является trusted kernel.

`aprover` должен потреблять versioned contract и conformance vectors из `anum_docs`, а не содержать вторую независимую семантику МТС.

## 8. Статусы

```text
primitive
definition
derived
conformance
experimental
```

В v0.2 приняты:

```text
finite cyclic Link carrier;
атомарные context pronouns ◁/▷;
context ascent ↑;
occurrence-local anonymous [];
локальная interpretation semantics;
structural LinkForm matching;
contextual equality.
```

Явно experimental остаются как минимум:

```text
issue #61 L3 projection;
trusted L5 proof rules.
```

## 9. Жизненный цикл фундаментального решения

```text
Research
→ Problem
→ Candidate
→ Challenged
→ Modeled
→ Accepted
→ Released
```

Дополнительные состояния:

```text
Rejected
Deferred
Superseded
```

Формальная нотация v0.2 прошла Candidate → Challenged → Modeled в PR #84; нормативный contract фиксируется отдельной promotion-миграцией.

## 10. Единственные активные реализации

```text
L0–L5 declarative contract             core/reference_model.py
finite cyclic L1 carrier               core/semantic_carrier.py
L2 typed AST                           core/mtc_ast.py
L2 tokenizer/parser                    core/mtc_parser.py
L2 interpreter                         core/mtc_interpreter.py
L2 root library                        core/root_library.py
L3 Anum protocol                       core/anum_protocol.py
versioned external contract            contracts/mts-contract-v0.2.json
```

После migration параллельные candidate/legacy implementations не сохраняются: история экспериментов находится в Git.
