# Reference model МТС v0.2

Статус: **historical accepted reference model v0.2**.

> Этот документ остаётся нормативным **только для контракта МТС v0.2 и совместимой historical-линии v0.2–v0.5**. Он больше не является описанием текущей целевой архитектуры Foundation v2.
>
> Для текущего развития начинайте с [Оснований МТС](../theory/Основания%20МТС.md), [Foundation v2 Gate P](Foundation%20v2%20Gate%20P.md) и [Формальной нотации МТС](Формальная%20нотация%20МТС.md).

Машинный historical contract: [`core/reference_model.py`](../../core/reference_model.py).

Language-neutral accepted v0.2 contract: [`contracts/mts-contract-v0.2.json`](../../contracts/mts-contract-v0.2.json).

Принятый L3 boundary subset: [`contracts/anum-boundary-projection-v0.2.json`](../../contracts/anum-boundary-projection-v0.2.json).

Этот документ фиксирует инженерную reference model v0.2, относительно которой воспроизводятся historical parser/interpreter/protocol behavior и conformance corpus. Такие конструкции, как typed AST, `ContextFrame`, `◁/▷` и AST-path `HoleId`, являются частью принятой v0.2 модели, но **не переносятся автоматически в Foundation v2**.

## 1. Архитектурные уровни v0.2

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

Эти общие границы остаются полезными и в Foundation v2, хотя конкретные v0.2 representations ниже являются historical.

## 2. L0 — онтология v0.2

```text
всё есть связь;
связь — единственная форма существования;
смысл не существует отдельно от связи;
несвязь не существует как отдельная натуральная сущность;
смысл несвязи выражается связью.
```

L0 не зависит от Python, графов, `*.anum`, конкретных скобок или алгоритма доказательства.

Текущая Foundation-v2 формулировка уточняет эту основу exact-occurrence identity; см. [Основания МТС](../theory/Основания%20МТС.md).

## 3. L1 — finite Link carrier v0.2

Исполнимая historical reference-структура различённой связи:

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

Это инженерная операция и **не** синтаксический оператор L2 `=`. Foundation v2 дополнительно фиксирует, что graph isomorphism не является semantic exact identity.

## 4. L2 — formal language v0.2

L2 historical model имеет typed AST:

```text
Expression
├── Form
├── Judgment
└── Definition
```

### Два атомарных местоимения контекста

У каждого historical `ContextFrame` ровно две роли:

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

Инвариант lexer-а v0.2:

```text
atomicPronouns = true
bracketOverloading = false
```

Квадратные скобки не участвуют в context syntax. Поэтому:

```text
◁[]▷
```

лексически разбирается как:

```text
◁  [  ]  ▷
```

### `[]` — anonymous form v0.2

Пустая квадратная форма:

```text
[]
```

в historical исполняемой нотации означает анонимное вхождение формы связи, а не одну глобальную Link-константу.

Каждое AST-вхождение имеет собственный `HoleId`:

```text
HoleId := AST occurrence path
```

Это было важным historical шагом к различению одинаково записанных occurrences. Foundation v2 переносит сам принцип различённости глубже — в exact occurrence network — и больше не использует AST path как semantic identity.

### `=` — local constraint v0.2

Historical нормативная форма:

```text
(=) : {♀◁ = ♀▷, ◁♂ = ▷♂}
```

Если `ContextFrame(start=A, end=B)`, сравниваются соответствующие формы начала и конца `A` и `B`.

Даже v0.2 запрещала понимать:

```text
A = B
```

как глобальное rewrite-rule для всех одинаковых glyph.

Foundation v2 далее заменяет эту модель explicit local representative evidence in `K`.

### `⟼` — form и structural pattern v0.2

Синтаксически:

```text
A ⟼ B
```

— `LinkForm(A, B)`.

Historical interpreter мог искать существующую связь или декомпозировать известный `LinkRef` через anonymous forms.

Пример:

```text
10 = [] ⟼ []
```

при:

```text
poles(10) = (2, 3)
```

давал local substitutions:

```text
hole₀ → 2
hole₁ → 3
```

Вложенные patterns разбирались рекурсивно без materialization новых связей.

Foundation v2 не принимает эту automatic decomposition как встроенную equality semantics; proof decomposition существует только как отдельно `T`-admitted rule.

### Круглые скобки

Round grouping сохраняется в historical AST и canonical printer, но прозрачен для structural matcher.

### Historical корневая система

Каноническая root-программа: [`tests/mtc_formulas.mtc`](../../tests/mtc_formulas.mtc).

Она содержит 10 именованных definitions и остаётся immutable accepted evidence v0.2–v0.5.

Ключевые historical определения:

```text
∞   : {◁ = ∞, ▷ = ∞}
(=) : {♀◁ = ♀▷, ◁♂ = ▷♂}
```

Они не являются текущим определением Foundation-v2 `K` и local representative `=`.

## 5. L3 — сериализация Anum v0.2

L3 отвечает за сериализацию/десериализацию и использует четверичный алфавит:

```text
[ ] 1 0
```

Квадратные glyph L2 и абиты L3 не тождественны автоматически.

Historical pipeline:

```text
parse_raw_quaternary
→ validate_anum(context)
→ project_anum(context)
→ deterministic serialize
```

Принятые root definitions v0.2 фиксируют boundary orientation:

```text
([) : (♀∞)
(]) : (∞♂)
(⟼) : (♀∞ ⟼ ∞♂)
(↛) : (∞♂ ⟼ ♀∞)
[1] : (⟼)
[0] : (↛)
```

Поэтому в root context принят boundary subset:

```text
[  → ♀∞
]  → ∞♂
[] → 1
][ → 0
```

`[[` и `]]` сохраняют historical boundary status.

Foundation v2 дополнительно отделяет recursive Anum structural description от universal exact identity arbitrary shared/cyclic networks и требует отдельного materialization gate #242.

## 6. L4 — historical execution model

Две группы операций уже в v0.2 должны были оставаться разделены.

### Формальная нотация v0.2

```text
parse(source) → typed AST
interpret(AST, ContextFrame, MemoryView)
    → success
    → local substitutions
    → local aliases
    → resolution trace
```

`ContextFrame` historical model:

```text
ContextFrame(
    start: LinkRef,
    end: LinkRef,
    parent?: ContextFrame
)
```

`interpret` read-only.

### Anum / память v0.2

```text
load
decode
project
find
realize
delete
```

Historical invariants:

```text
load(A) не создаёт den(A)
decode(A) не меняет память
project(A) не меняет память
find(A) не создаёт den(A)
interpret(F) не материализует связи
realize(...) — явная materializing operation
```

Foundation v2 сохраняет и усиливает общий принцип:

```text
read / find / replay != materialize
```

см. [Апамять и управление сетью связей](Апамять%20и%20управление%20сетью%20связей.md).

## 7. L5 — historical proof direction

Historical L5 развивала replay-only trusted proof kernel поверх v0.2 interpret semantics.

Уже здесь была важная архитектурная идея:

```text
proof search
proof object
proof checker / trusted kernel
```

должны быть разделены.

Foundation v2 реализует эту идею заново на exact-occurrence substrate: actual acts, exact Run, explicit `T ⟼ Rule` и integrated read-only checker без legacy parser/proof semantics.

См. [Foundation v2 Proof replay](Foundation%20v2%20Proof%20replay.md).

## 8. Accepted status v0.2

В v0.2 были приняты:

```text
finite cyclic Link carrier;
atomic context pronouns ◁/▷;
context ascent ↑;
occurrence-local anonymous [];
local interpretation semantics;
structural LinkForm matching;
contextual equality;
root Anum boundary orientation [] → 1, ][ → 0.
```

Это остаётся правдой **о версии v0.2**.

Это не означает, что перечисленные host/syntax mechanisms являются primitives следующей Foundation v2.

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

Именно этот lifecycle означает, что accepted historical v0.2 нельзя переписать задним числом, а Foundation v2 нельзя объявить accepted до собственного release gate.

## 10. Historical implementation surface

Для воспроизведения v0.2 сохраняются:

```text
core/reference_model.py
core/semantic_carrier.py
core/mtc_ast.py
core/mtc_parser.py
core/mtc_interpreter.py
core/root_library.py
core/anum_protocol.py
contracts/mts-contract-v0.2.json
```

Текущий Foundation-v2 production/reference candidate находится в отдельных exact-evidence modules:

```text
core/exact_link_network.py
core/foundation_v2_state.py
core/foundation_v2_source.py
core/foundation_v2_interpreter.py
core/foundation_v2_run.py
core/foundation_v2_proof.py
core/foundation_v2_checker.py
```

После будущего cutover Git должен хранить историю, а production tree не должен сохранять два конкурирующих semantic cores без явной historical-only причины.

---

## Правило чтения этого документа сегодня

```text
если вопрос: «как точно работала accepted v0.2?»
    этот документ является правильной reference model;

если вопрос: «какой должна стать следующая МТС?»
    используйте Foundation v2 docs и executable Gate-P contracts.
```
