# Метатеория связей (МТС)

**Метатеория связей (МТС)** исследует системы, в которых единственным первичным видом сущности является **связь**.

Базовая запись:

```text
L = A ⟼ B
```

означает: связь `L` имеет начало `A` и конец `B`.

Главная идея МТС предельно проста:

```text
всё есть связь
```

В частности, контекст, словарь, теория, исходный текст, акт интерпретации, доказательство и состояние памяти не обязаны быть внешними объектами или метаданными — они сами могут быть представлены сетями связей.

---

## Текущий статус

В репозитории одновременно существуют два слоя, которые важно не смешивать.

### Принятые версии v0.2–v0.5

Контракты `v0.2`–`v0.5` остаются **принятыми историческими версиями** и сохраняются как воспроизводимая база совместимости. Они включают старую формальную нотацию, typed AST, `ContextFrame`, корневую программу и соответствующие conformance-корпуса.

Они не удалены и не переписаны задним числом.

### Foundation v2 — следующая версия МТС

Текущее развитие идёт через [Foundation v2 Gate P](docs/specs/Foundation%20v2%20Gate%20P.md).

Foundation v2 уже имеет production-facing executable candidate для:

```text
exact-occurrence binary links
→ explicit K / D / G / T / I / A
→ canonical source evidence
→ read-only interpreter replay
→ persistent scoped dictionary `:`
→ local representative equality `=`
→ exact multistep Run
→ explicitly T-admitted proof rule
→ integrated trusted proof replay
```

Но **Foundation v2 ещё не опубликована как новая accepted версия МТС**. До этого должны быть закрыты materialization, persistent L4, cutover и итоговый versioned conformance gate.

---

# 1. Что существует в МТС

Минимальная онтология — бинарная ориентированная связь:

```text
Link = start ⟼ end
```

У связи нет обязательного внешнего типа, имени, класса или набора свойств. Всё дополнительное содержание должно быть выражено отношениями самой сети либо явно вынесено в уровень реализации.

Подробнее: [Основания МТС](docs/theory/Основания%20МТС.md).

## Exact occurrence важнее формы

Одинаковая структура не означает тождество сущностей.

```text
P1 = A ⟼ B
P2 = A ⟼ B

P1 ≠ P2
```

`P1` и `P2` могут быть двумя разными точными вхождениями одной и той же пары полюсов.

То же относится к самозамкнутым связям:

```text
R = R ⟼ R
X = X ⟼ X

R ≠ X
```

Поэтому Foundation v2 не использует:

```text
графовый изоморфизм = семантическое тождество
адрес backend-а       = универсальное семантическое имя
одинаковая пара       = одна автоматически интернированная связь
```

Эта граница принципиальна для циклов, sharing, provenance и доказательств.

---

# 2. Корень и самозамыкание

МТС допускает самозамыкание как обычную структуру связи:

```text
R = R ⟼ R
```

Самозамыкание само по себе не является скрытым opcode и не задаёт глобальный класс всех объектов такой формы.

Foundation v2 использует небольшой набор **различённых exact occurrences** bootstrap-уровня (`R/O/C/L/U`). Это опорные элементы конкретной системы, а не правило вида «любая связь такой формы автоматически означает X».

Историческая десятиформульная корневая программа v0.2–v0.5 сохранена отдельно и рассматривается как принятый предыдущий контракт, а не как повод переносить старую `ContextFrame`-семантику в новую foundation.

Подробнее: [Система аксиом МТС](docs/theory/Система%20аксиом%20МТС.md).

---

# 3. Контекст — тоже сеть связей

Foundation v2 не требует скрытого стека `ContextFrame`.

Минимальный persistent context представим как:

```text
P = parent ⟼ current
K = K ⟼ P
```

Тогда `K` — exact occurrence текущего снимка контекста, а `current` извлекается из предъявленного `K`.

Смена текущего объекта создаёт новый снимок:

```text
K0 → K1 → K2
```

а не мутирует невидимое глобальное состояние.

Это даёт важное свойство: любой акт можно повторно проверить, если предъявлены exact `K_before` и `K_after`.

---

# 4. Исходный текст не является семантикой

Текст программы или доказательства — это входной носитель, а не identity смысловой сущности.

Текущая Foundation-v2 цепочка выглядит так:

```text
raw UTF-8
→ canonical astring content C
→ exact source occurrence S
→ selected exact segmentation
→ scoped dictionary D
→ explicit grammar G / theory T admission
→ resolved exact form
```

Один и тот же набор байтов может разрешаться по-разному в разных словарях или теориях. Поэтому нельзя считать host-token, AST-класс или spelling семантической идентичностью.

Подробнее: [Формальная нотация МТС](docs/specs/Формальная%20нотация%20МТС.md).

---

# 5. Словарь `D` — persistent scoped сеть

Словарь не является глобальным `dict<string, object>`.

Концептуально Foundation v2 использует persistent scope/history:

```text
ScopePayload = parentScope ⟼ localHistory
D            = D ⟼ ScopePayload

Entry        = sourceContent ⟼ form
Occurrence   = D_before ⟼ Entry
H_after      = H_before ⟼ Occurrence
D_after      = D_after ⟼ (parentScope ⟼ H_after)
```

Определение через `:` — явный effect, создающий новое состояние словаря.

При этом чтение остаётся чтением:

```text
lookup / find / replay ≠ materialize
```

Это различие проходит через всю Foundation v2.

---

# 6. Интерпретатор и actual act

МТС различает:

```text
описание интерпретатора I
и
фактически произошедший акт A
```

`A` содержит exact evidence того, что было выбрано и проверено: source, форму, словарь, теорию, контекст, binding, result и другие необходимые роли.

Trusted replay не обязан доверять тому, кто нашёл этот акт. Он повторно проверяет предъявленную сеть.

Отсюда фундаментальное разделение:

```text
untrusted search / ranking
        ↓ candidate
trusted exact replay
        ↓
accept / reject
```

Именно эта граница нужна будущему `aprover`.

---

# 7. Локальное равенство, а не глобальная подстановка

Foundation v2 отказалась от идеи, что `=` автоматически создаёт глобальную конгруэнтность или rewrite-систему.

Локальное representative-ограничение может быть представлено так:

```text
Pair    = member ⟼ representative
Binding = K ⟼ Pair
```

Тогда:

```text
rep_K(x) = явный локальный representative,
           иначе сам x

Equal_K(a,b)
⇔ rep_K(a) и rep_K(b) — один exact occurrence
```

Это **одношаговая локальная** семантика.

Из

```text
a → b
b → c
```

не появляется автоматически:

```text
a → c
```

Нет скрытой транзитивности, substitution, congruence или глобального union-find.

Если требуется логическое правило — оно должно быть отдельно предъявлено и допущено теорией `T`.

---

# 8. Proof rules и Run

Последовательность actual acts сама является сетью:

```text
Run_0     = R
Run_(i+1) = Run_i ⟼ A_i
```

Соседние шаги обязаны иметь exact continuity контекста:

```text
A_i.after is A_(i+1).before
```

Но adjacency не означает логическую транзитивность и не создаёт shortcut `K0 → Kn`.

Первый Foundation-v2 proof-rule candidate — отдельно допущенная теорией одношаговая decomposition истинного локального равенства двух завершённых связей:

```text
Equal_K(L,R) = true

L = ls ⟼ le
R = rs ⟼ re

T ⟼ Rule

Rule(L,R)
→ ls ⟼ rs
→ le ⟼ re
```

Это правило не встроено в `=` и не запускается рекурсивно само.

Подробнее: [Foundation v2 Proof replay](docs/specs/Foundation%20v2%20Proof%20replay.md).

---

# 9. Апамять — контроллер сетей связей

Один из наиболее наглядных прикладных результатов МТС — архитектура **апамяти**.

Апамять лучше понимать не как «базу объектов», а как контроллер exact-occurrence сети связей:

```text
создать связь
найти связи по полюсам
перечислить exact occurrences
сохранить sharing и циклы
вести persistent состояния
проверять selected evidence
явно materialize-ить effect
```

При этом данные и управляющая структура могут находиться в одной и той же онтологии:

```text
application links
K contexts
D dictionaries
G/T admissions
source evidence
actual acts
proof claims
Runs
```

Например запись ачислового/структурного выражения:

```text
∞[window][cursor][position][[[x][int]][point]]
```

может рассматриваться не просто как строка для парсера, а как инструкция/описание того, какие отношения должны быть разрешены, найдены или материализованы в сети.

Ключевой принцип:

```text
find / read / replay
        ≠
materialize / delete
```

Это позволяет использовать быстрые индексы и эвристики для поиска, не делая их частью доверенной семантики.

Подробнее: [Апамять и управление сетью связей](docs/specs/Апамять%20и%20управление%20сетью%20связей.md).

---

# 10. Ачисла

Ачисло — рекурсивное структурное описание, исторически использующее четыре абита:

```text
[ ] 0 1
```

Для Foundation v2 важно уточнение: рекурсивное ачисло не объявляется универсальной identity произвольной асети.

Оно является **root-relative structural description** на своей области применимости, прежде всего для occurrence-tree представлений. Для сетей с sharing и произвольными циклами требуется exact occurrence identity.

Документы:

- [Ачисла и сериализация](docs/specs/Ачисла%20и%20сериализация.md)
- [Протокол абитов ачисел](docs/specs/Протокол%20абитов%20ачисел.md)

Следующий release gate #242 должен связать последовательность ачисла с явной materialization-семантикой апамяти.

---

# 11. Что уже является executable Foundation v2

Production-facing candidate modules сейчас разделены по обязанностям:

```text
core/exact_link_network.py
    exact-occurrence binary-link substrate

core/foundation_v2_state.py
    K / scoped D / memberships / actual-act state

core/foundation_v2_source.py
    canonical source and selected segmentation replay

core/foundation_v2_interpreter.py
    relation / `:` / `=` trusted replay

core/foundation_v2_run.py
    exact ordered actual-act Run

core/foundation_v2_proof.py
    separately T-admitted proof-rule replay

core/foundation_v2_checker.py
    integrated source → proof → Run replay
```

Это всё ещё **candidate следующей версии**, а не разрешение удалить старые accepted contracts.

---

# 12. Путь к следующей версии МТС

После завершения semantic proof/checker core фокус должен идти по release chain:

```text
#261  обновление главной документации
  ↓
#242  Anum sequence → апамять materialization
  ↓
#124  persistent L4/backend contract
  ↓
historical compatibility classification
  ↓
atomic production cutover + удаление старого semantic path
  ↓
versioned integrated conformance corpus
  ↓
explicit Foundation-v2 acceptance
  ↓
следующая опубликованная версия МТС
  ↓
aprover repin
```

До explicit acceptance Foundation v2 нельзя называть новой принятой версией.

---

# 13. Как читать репозиторий сейчас

Для понимания **текущей** МТС рекомендуется такой порядок:

1. [Основания МТС](docs/theory/Основания%20МТС.md)
2. [Система аксиом МТС](docs/theory/Система%20аксиом%20МТС.md)
3. [Foundation v2 Gate P](docs/specs/Foundation%20v2%20Gate%20P.md)
4. [Формальная нотация МТС](docs/specs/Формальная%20нотация%20МТС.md)
5. [Апамять и управление сетью связей](docs/specs/Апамять%20и%20управление%20сетью%20связей.md)
6. [Foundation v2 Proof replay](docs/specs/Foundation%20v2%20Proof%20replay.md)
7. [Ачисла и сериализация](docs/specs/Ачисла%20и%20сериализация.md)

Для воспроизведения **исторически принятых** версий:

- [Reference model МТС v0.2](docs/specs/Reference%20model%20МТС%20v0.2.md)
- `contracts/mts-contract-v0.2.json` … `contracts/mts-contract-v0.5.json`
- соответствующие conformance-корпуса
- `tests/mtc_formulas.mtc` — неизменяемая корневая программа исторической линии

`docs/research/` содержит исследовательские записи и provenance решений; они не заменяют активные спецификации.

---

## Главный инвариант текущей работы

```text
одна онтология связей
+ exact occurrence identity
+ явное состояние
+ явное evidence
+ недоверенный поиск
+ доверенное replay
+ явная materialization
```

Именно из этой комбинации МТС превращается из абстрактной теории связей в основу для ассоциативной памяти, интерпретатора и проверяемого доказателя.
