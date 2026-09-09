# План реализации МТС v0.12 C6a — круглые скобки `FORMAL`, явный K и сходимость чтения

> Выполнять задачи по порядку. Рабочая транзакция C6a должна содержать только исполняемые тестовые свидетельства. При неожиданном красном результате запрещено исправлять рабочую реализацию в той же задаче.

## Цель

Добавить один исполняемый тест кандидата v0.12, который совместно подтверждает три уже существующие смысловые границы:

```text
FORMAL (...) as explicit I_FORMAL child
+
contextual resolution through explicitly selected K
+
generic left reading as a separate projection
```

Ожидаемый итог:

```text
new candidate-specific convergence test
-> GREEN on current runtime
-> production delta = NONE
```

Если первый запуск оказывается красным, это результат измерения, а не разрешение автоматически менять рабочую реализацию.

## Архитектурная граница

C6a не создаёт нового интерпретатора, синтаксического анализатора, стека контекстов или механизма свёртки. Он соединяет в одном кандидатном свидетельстве три существующих пути:

```text
ts/src/context-integration.ts
  openFormalContext
  continueFormalContext
  replayFormalClose

ts/src/interpreter.ts
  replayContextualReading
  replayFlatReading

ts/src/state.ts
  defineContext
  readContext
```

Главный закон разделения:

```text
FORMAL grammar
!= contextual-K selection
!= generic flat fold
```

Источник архитектуры:

```text
docs/superpowers/specs/2026-09-09-v012-c6-formal-context-reading-design.md
```

## Точная исходная точка

```text
main = 08b9ee397735b6e0c111ddf0d3afaa96998dd8a1
accepted MTS = v0.11
active semantic candidate = v0.12 / candidate / NOT ACCEPTED
C0-C5 = COMPLETE
C6 design = MERGED
C6a executable work = NOT STARTED
```

Несвязанные черновые запросы на слияние:

```text
#983
#1053
```

Они не участвуют в C6a.

## Жёсткие ограничения

Рабочая транзакция C6a создаёт ровно один файл:

```text
ts/test/v012-formal-context-reading-c6.test.ts
```

В C6a запрещено менять:

```text
ts/src/**
contracts/**
docs/**
cutover/**
traceability/**
repo-policy.json
.github/**
README.md
web/**
```

Состояние кандидата в C6a не меняется:

```text
accepted = false
acceptanceReady = false
candidateRuntimeSelectable = false
implementationComplete = false
coverageState = incomplete
accepted runtime = v0.11
```

C6a не связывает машинные свидетельства в контракте и корпусе соответствия. Это обязанность отдельной C6b после принятого зелёного C6a.

---

## Задача 1. Создать отдельную исполняемую задачу C6a

### Шаги

- [ ] Создать отдельную задачу C6a от свежего `main`.
- [ ] Зафиксировать точный `main`, принятую v0.11 и невыбираемый кандидат v0.12.
- [ ] Задать тип изменения `test` и область ровно на новый тест C6a.
- [ ] Явно запретить рабочую реализацию, контракты, документацию, политику, процессы сборки, веб-проекцию и downstream-работу.
- [ ] Создать отдельную ветку от точного `main`.

Ожидаемое описание изменения:

```repo-guard-yaml
change_type: test
scope:
  - ts/test/v012-formal-context-reading-c6.test.ts
budgets:
  max_new_files: 1
  max_new_docs: 0
  max_net_added_lines: 520
must_touch:
  - ts/test/v012-formal-context-reading-c6.test.ts
must_not_touch:
  - ts/src/**
  - contracts/**
  - cutover/**
  - traceability/**
  - docs/**
  - repo-policy.json
  - README.md
  - .github/**
  - web/**
expected_effects:
  - prove FORMAL parentheses through the existing explicit I_FORMAL child path
  - prove contextual dot resolves only through explicitly selected K
  - prove generic left fold is distinct from FORMAL grammar
  - require no production runtime delta when current mechanisms satisfy C6
  - preserve v0.11 as accepted runtime and v0.12 as non-selectable candidate
```

---

## Задача 2. Построить минимальный тестовый каркас

### Файл

```text
CREATE ts/test/v012-formal-context-reading-c6.test.ts
```

### Проверенные образцы

Использовать только минимально необходимые приёмы из:

```text
ts/test/v09-context-integration.test.ts
ts/test/v011-nested-explicit-binding-compatibility.test.ts
ts/test/interpreter-flat.test.ts
ts/test/v012-q-compatibility-representation-c5.test.ts
```

Не копировать эти тесты целиком.

### Шаги

- [ ] Импортировать только существующие рабочие программные интерфейсы.
- [ ] Добавить локальные `assert`, `same` и `vector`.
- [ ] Создать `Memory` и набор рекурсивно различимых связей для проверочной конструкции.
- [ ] Создать различные структурные интерпретаторы для корневого и `FORMAL`-контекстов.
- [ ] Проверить структурное различие их дескрипторов.
- [ ] Создать локальную проекцию `ReadMemory`, которая делегирует разрешённые чтения, но аварийно завершает `find()` и `incoming()`.

Последняя проекция нужна только для доказательства отсутствия скрытого поиска. Она не является новым смысловым авторитетом.

---

## Задача 3. Блок A — круглые скобки `FORMAL`

### Назначение

Подтвердить, что круглые скобки уже выражаются существующим явным переходом в дочерний `I_FORMAL` и не требуют новой функции рабочей реализации.

### 3.1. Допустимое правило одного значения

Построить существующими структурными функциями правило:

```text
FORMAL sequence = [valueRole]
result          = valueRole
```

Использовать только существующие функции:

```text
defineStructuralRoleDictionary
defineStructuralRule
admitStructuralRule
defineActHeader
defineActField
```

Специальное рабочее правило только для C6 создавать нельзя.

### 3.2. Открытие дочернего контекста

Для явного родителя вызвать:

```text
openFormalContext(memory, parent, parentInterpreter, I_FORMAL)
```

и проверить:

```text
child.interpreter = I_FORMAL
readContext(child.context).parent = parent.context
readContext(child.context).current = R
```

Связать вектор:

```text
v012-formal-parentheses-open-formal-child
```

### 3.3. Непустое закрытие

- [ ] Добавить одно значение `A` через `continueFormalContext`.
- [ ] Построить существующие свидетельства правила и акта.
- [ ] Сохранить `linkCount` перед воспроизведением.
- [ ] Выполнить `replayFormalClose` через проекцию чтения без скрытого поиска.
- [ ] Проверить точный результат `A`.
- [ ] Проверить неизменность `linkCount`.
- [ ] Проверить, что исходный родитель не изменён закрытием ребёнка.
- [ ] Отдельно продолжить родителя через `continueFormalContext`.
- [ ] Проверить, что `A` занимает ровно одну позицию `ExactSequence` родителя.

Связать вектор:

```text
v012-formal-parent-continues-after-child-result
```

### 3.4. Пустые круглые скобки

Открыть дочерний контекст и не добавлять ни одной формы.

`replayFormalClose` обязан завершиться отказом:

```text
ContextIntegrationError
code = empty-formal-context
```

Не разрешать превращать этот случай в допустимый результат:

```text
R
undefined
[]
host sentinel
```

Связать оба вектора:

```text
v012-formal-empty-parentheses-fail-closed
v012-formal-empty-parentheses-are-not-a-valid-result
```

### 3.5. Промежуточная проверка

После блока A собрать проект и запустить новый тест. Красный результат классифицировать до любых иных изменений.

---

## Задача 4. Блок B — явный K как единственный контекстный авторитет

### Назначение

Собрать кандидатное межслойное свидетельство поверх уже принятого поведения явных вложенных привязок v0.11.

### 4.1. Физическая точка

Построить реальное исходное свидетельство для байта UTF-8:

```text
0x2e
```

через существующие функции:

```text
materializeSourceContent
defineSourceForm
defineDictionaryScope
defineDictionaryEffect
buildSelectedSourceEvidence
```

Физическая точка должна разрешаться в отдельную смысловую роль `contextualRole`, но не должна сама становиться K.

### 4.2. Два одновременных контекста

Построить:

```text
K_outer = defineContext(R, A)
K_inner = defineContext(K_outer, B)
A != B
```

Проверить:

```text
readContext(K_outer).current = A
readContext(K_inner).parent = K_outer
readContext(K_inner).current = B
```

### 4.3. Явное свидетельство чтения

Переиспользовать существующий набор ролей:

```text
source
sourceSelection
formSequence
dictionary
grammar
theory
beforeContext
contextualRole
result
afterContext
```

`beforeContext` должен находиться непосредственно в свидетельстве `Act`.

### 4.4. Два положительных воспроизведения

Через проекцию, запрещающую скрытый поиск, проверить:

```text
Act.beforeContext = K_outer
-> result = A

Act.beforeContext = K_inner
-> result = B
```

Оба воспроизведения должны быть только для чтения и не менять `linkCount`.

Связать:

```text
v012-formal-contextual-dot-uses-explicit-selected-k
```

### 4.5. Неверный авторитет

Построить свидетельство:

```text
beforeContext = K_outer
claimed result = B
```

Ожидаемый отказ:

```text
InterpreterReplayError
code = invalid-flat-evidence
```

Это доказывает, что существование внутреннего контекста не подменяет явно названный внешний K.

### 4.6. Создание ребёнка не выбирает K

Открыть дополнительный дочерний `I_FORMAL` при одновременно существующих `K_outer` и `K_inner`, после чего повторить контекстное чтение с явно названным `K_outer`.

Результат обязан остаться:

```text
A
```

Связать:

```text
v012-child-creation-does-not-auto-select-contextual-k
```

### 4.7. Отсутствие неявного поиска

Успешные чтения по явному K должны проходить через проекцию, где:

```text
find()     -> throw
incoming() -> throw
```

Вместе с различением внешнего и внутреннего K это непосредственно подтверждает отсутствие поиска ближайшего или родительского K и фонового текущего состояния как смыслового авторитета.

Связать:

```text
v012-nearest-lexical-frame-is-not-semantic-authority
v012-ambient-current-is-not-semantic-authority
v012-hidden-parent-traversal-is-not-semantic-authority
```

Более широкие векторы о публичной поверхности лексического и синтаксического анализатора в C6a не связывать, если новый тест их непосредственно не доказывает.

---

## Задача 5. Блок C — общее левое чтение не является грамматикой `FORMAL`

### Назначение

Доказать на одной проверочной конструкции, что визуально похожая последовательность не создаёт единого скрытого механизма интерпретации.

### 5.1. Общее плоское чтение

Построить допустимое свидетельство источника и словаря для трёх уже разрешённых форм:

```text
[A, B, C]
```

Построить существующее свидетельство плоского чтения с заявленным результатом:

```text
AB  = A ⟼ B
ABC = AB ⟼ C
```

Выполнить:

```text
replayFlatReading(probe, evidence)
```

и проверить точный результат:

```text
ABC
```

Воспроизведение должно оставаться только для чтения.

### 5.2. Бинарная грамматика `FORMAL`

Построить существующее допустимое бинарное правило:

```text
[leftRole, arrowUse, rightRole]
-> leftRole ⟼ rightRole
```

### 5.3. Невложенная цепочка не получает автоматическую левую свёртку

Построить один дочерний `FORMAL` с последовательностью:

```text
[A, arrowUse, B, arrowUse, C]
```

Попытка закрыть всю последовательность одним бинарным правилом должна завершиться:

```text
StructuralRuleError
code = template-mismatch
```

Это основной отрицательный различитель:

```text
generic flat fold != FORMAL grammar
```

### 5.4. Явная вложенность `FORMAL`

Существующими функциями построить отдельно:

```text
left  = (A ⟼ B) ⟼ C
right = A ⟼ (B ⟼ C)
```

Проверить:

```text
left != right
```

для выбранных A, B и C, дающих структурно разные результаты.

Связать:

```text
v012-link-left-association-is-not-formal-grammar
v012-generic-flat-reader-is-not-formal-grammar
```

---

## Задача 6. Первый полный запуск C6a и классификация

### 6.1. Сборка и запуск только нового теста

```bash
cd ts
npm run build --silent
node dist/test/v012-formal-context-reading-c6.test.js
```

### 6.2. Если результат зелёный

Зафиксировать классификацию:

```text
C6A_CURRENT_RUNTIME_CONVERGENCE = GREEN
production delta = NONE
```

Проверить разницу файлов: в `ts/src/**` не должно быть изменений.

Затем выполнить полный набор тестов:

```bash
npm test
```

и полную проверку TypeScript-проекта:

```bash
npm run check
```

### 6.3. Если результат красный

Немедленно остановить любые изменения рабочей реализации.

Зафиксировать точную ошибку и отнести её ровно к одной категории:

```text
TEST_MISTAKE
STALE_OLD_EVIDENCE
MISSING_COMPOSITION_EVIDENCE
ACTUAL_CANDIDATE_RUNTIME_GAP
```

Правила:

```text
TEST_MISTAKE
-> fix only the new test

STALE_OLD_EVIDENCE
-> reconcile approved specification with current accepted evidence
-> do not change runtime before reconciliation

MISSING_COMPOSITION_EVIDENCE
-> add only missing explicit test evidence if current APIs already express it

ACTUAL_CANDIDATE_RUNTIME_GAP
-> STOP C6a
-> open separate issue/design/RED witness
-> bounded production transaction only
```

Красный C6a нельзя превращать в смешанный запрос на слияние с тестами и рабочей реализацией.

---

## Задача 7. Открыть и проверить запрос на слияние C6a

После подтверждённого состояния:

- [ ] Проверить точную разницу: один новый файл `ts/test/v012-formal-context-reading-c6.test.ts`.
- [ ] Открыть недрафтовый запрос на слияние из отдельной ветки C6a.
- [ ] Запустить штатные проверки CI и блокирующий `repo-guard`.
- [ ] При сбое сначала установить первопричину; политику не ослаблять.
- [ ] Перед слиянием заново проверить `main`, точный `head`, `behind_by=0`, `mergeable=true`, `draft=false`.
- [ ] Сливать только с `expected_head_sha`.
- [ ] После слияния проверить новый точный `main`.
- [ ] Не утверждать зелёное состояние после слияния, если на SHA слияния отсутствуют соответствующие запуски процессов.

---

## Задача 8. После принятого зелёного C6a

Только после слияния C6a открыть отдельную C6b для связывания машинных свидетельств.

C6b должна:

```text
- add exact C6a gate to requiredExecutableGates
- remove C6 placeholder from plannedExecutableGates
- mark C6 evidence state green-confirmed
- bind only vectors directly proved by C6a
- factually synchronize README and required theory docs
- update Contract Observatory projection tests
- advance C7 to NEXT
- keep acceptanceReady=false and accepted=false
```

C6b не является полной нормативной синхронизацией C8.

C8 отдельно проверяет минимум:

```text
docs/specs/Формальная нотация МТС.md
docs/specs/Ачисла и сериализация.md
README.md
docs/theory/Основания МТС.md
docs/theory/Система аксиом МТС.md
```

---

## Критерии завершения C6a

C6a считается завершённым только если доказано всё следующее:

```text
[ ] (...) opens explicit I_FORMAL child
[ ] child has exact supplied parent
[ ] child starts at R
[ ] non-empty child closes to exactly one result
[ ] parent continuation is explicit
[ ] () fails with empty-formal-context
[ ] explicit K_outer resolves A
[ ] explicit K_inner resolves B
[ ] outer K cannot claim B
[ ] child creation does not select contextual K
[ ] replay succeeds without find()/incoming() discovery
[ ] generic [A,B,C] left fold is explicitly replayed
[ ] bare binary FORMAL chain rejects template mismatch
[ ] explicit left/right FORMAL nesting differs
[ ] no ts/src production diff
[ ] focused test GREEN
[ ] full npm test GREEN
[ ] full npm run check GREEN
[ ] blocking repo-guard GREEN
[ ] exact-head merge
```

При выполнении этих условий C6a подтверждает сходимость существующих механизмов, но сам по себе не меняет машинное состояние жизненного цикла кандидата. Это делает только отдельная C6b.