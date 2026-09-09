# План реализации МТС v0.12 C6a — круглые скобки FORMAL, явный K и сходимость чтения

> Для исполнения: выполнять задачи по порядку. Рабочая C6a-транзакция должна оставаться test-only. При неожиданном красном результате не исправлять production-код в той же задаче.

## Цель

Добавить один исполняемый тест кандидата v0.12, который совместно подтверждает три уже существующие смысловые границы:

```text
FORMAL (...) как явный дочерний I_FORMAL-контекст
+
контекстная точка через явно предъявленный K
+
общее левое чтение как отдельная проекция
```

Ожидаемый результат:

```text
new candidate-specific convergence test
-> GREEN on current runtime
-> production delta = NONE
```

Если первый запуск оказывается красным, это измерение, а не разрешение автоматически менять рабочую реализацию.

## Архитектура

C6a не создаёт нового интерпретатора, парсера, стека контекстов или механизма свёртки. Он соединяет в одном кандидатном свидетельстве три уже существующих пути:

```text
ts/src/context-integration.ts
  openFormalContext
  continueFormalContext
  replayFormalClose

 ts/src/interpreter.ts
  replayContextualReading
  replayFlatReading

 ts/src/state.ts
  defineContext / readContext
```

Главный закон разделения:

```text
FORMAL grammar
!= contextual-K selection
!= generic flat fold
```

Источником архитектуры является:

```text
docs/superpowers/specs/2026-09-09-v012-c6-formal-context-reading-design.md
```

## Технологическая база

```text
TypeScript 5.9
Memory / ReadMemory
TypedContext
ExactSequence
StructuralInterpreter
StructuralRule
Act / role dictionary
source + dictionary evidence
GitHub Actions
repo-guard
```

## Точная исходная точка плана

```text
main = 08b9ee397735b6e0c111ddf0d3afaa96998dd8a1
accepted MTS = v0.11
active semantic candidate = v0.12 / candidate / NOT ACCEPTED
C0-C5 = COMPLETE
C6 design = MERGED
C6a executable work = NOT STARTED
```

Несвязанные черновые PR:

```text
#983
#1053
```

Они не участвуют в C6a.

## Жёсткие ограничения

Рабочая C6a-транзакция создаёт ровно один файл:

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

Статус кандидата не меняется:

```text
accepted = false
acceptanceReady = false
candidateRuntimeSelectable = false
implementationComplete = false
coverageState = incomplete
accepted runtime = v0.11
```

C6a не связывает contract/conformance evidence. Это отдельная C6b-транзакция после принятого GREEN C6a.

---

## Задача 1. Создать отдельную C6a test-only задачу

### Файлы

На этом шаге файлы не меняются.

### Шаги

- [ ] Создать отдельную issue C6a от свежего `main`.
- [ ] Зафиксировать exact main, accepted v0.11 и non-selectable candidate v0.12.
- [ ] Задать `change_type: test` и scope ровно на новый C6a test.
- [ ] Явно запретить `ts/src/**`, contracts, docs, policy, workflows, web и downstream.
- [ ] Создать отдельную ветку от exact main.

Ожидаемый ChangeIntent:

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

## Задача 2. Построить общий минимальный тестовый каркас

### Файл

```text
CREATE ts/test/v012-formal-context-reading-c6.test.ts
```

### Переиспользуемые образцы

Не копировать старые тесты целиком. Использовать только минимальные проверенные шаблоны из:

```text
ts/test/v09-context-integration.test.ts
ts/test/v011-nested-explicit-binding-compatibility.test.ts
ts/test/interpreter-flat.test.ts
ts/test/v012-q-compatibility-representation-c5.test.ts
```

### Шаги

- [ ] Импортировать только существующие production API.
- [ ] Добавить локальные `assert`, `same` и `vector`.
- [ ] Создать `Memory` и набор рекурсивно различимых fixture Links.
- [ ] Создать различные структурные интерпретаторы для корневого и FORMAL-контекстов.
- [ ] Проверить, что их handles структурно различны.
- [ ] Создать локальный `ReadMemory`-probe, который делегирует `poles`/разрешённые `outgoing`, но бросает ошибку на `find()` и `incoming()`.

Probe должен доказывать только отсутствие скрытого поиска. Он не является новым источником смыслового авторитета.

---

## Задача 3. Блок A — круглые скобки FORMAL

### Назначение

Подтвердить, что круглые скобки уже выражаются существующим явным переходом в дочерний `I_FORMAL` и не требуют нового production helper.

### 3.1. Создать простое допустимое правило одного значения

Построить существующими структурными функциями:

```text
FORMAL sequence = [valueRole]
result          = valueRole
```

Нужны:

```text
defineStructuralRoleDictionary
defineStructuralRule
admitStructuralRule
defineActHeader
defineActField
```

Никаких специальных правил C6 в production.

### 3.2. Открыть дочерний FORMAL

Для явного родителя:

```text
K_parent
```

вызвать:

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
- [ ] Построить существующее rule/Act evidence.
- [ ] Сохранить `linkCount` перед replay.
- [ ] Выполнить `replayFormalClose` через read-only probe.
- [ ] Проверить exact result `A`.
- [ ] Проверить неизменность `linkCount`.
- [ ] Проверить, что исходный parent ещё не изменён.
- [ ] Выполнить отдельный `continueFormalContext` родителя с результатом.
- [ ] Проверить, что `A` занимает ровно одну позицию parent ExactSequence.

Связать вектор:

```text
v012-formal-parent-continues-after-child-result
```

### 3.4. Пустые круглые скобки

Открыть child и не добавлять ни одной формы.

`replayFormalClose` должен завершиться:

```text
ContextIntegrationError
code = empty-formal-context
```

Не разрешать превращать этот случай в:

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

### 3.5. Проверка блока A

После написания блока собрать и запустить новый тест. Первый результат классифицируется честно; production не менять.

---

## Задача 4. Блок B — явный K как единственный контекстный авторитет

### Назначение

Собрать кандидатный cross-layer witness поверх уже принятого v0.11 explicit-binding поведения.

### 4.1. Физический знак точки

Построить реальное исходное свидетельство для UTF-8 точки:

```text
0x2e
```

через существующие:

```text
materializeSourceContent
defineSourceForm
defineDictionaryScope
defineDictionaryEffect
buildSelectedSourceEvidence
```

Точка должна разрешаться в отдельную `contextualRole`, а не становиться K сама по себе.

### 4.2. Построить два одновременно существующих контекста

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

### 4.3. Построить существующее contextual reading evidence

Переиспользовать текущую форму ролей:

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

`beforeContext` должен находиться в самом `Act` evidence.

### 4.4. Два положительных replay

Через probe, запрещающий скрытый поиск:

```text
Act.beforeContext = K_outer
-> result = A

Act.beforeContext = K_inner
-> result = B
```

Проверить read-only `linkCount`.

Связать:

```text
v012-formal-contextual-dot-uses-explicit-selected-k
```

### 4.5. Неверный авторитет

Построить evidence:

```text
beforeContext = K_outer
claimed result = B
```

Ожидаемый отказ существующего replay:

```text
InterpreterReplayError
code = invalid-flat-evidence
```

Это показывает, что наличие внутреннего контекста не подменяет явно названный внешний K.

### 4.6. Создание child не выбирает K

Дополнительно открыть дочерний `I_FORMAL` внутри окружения, где существуют `K_outer` и `K_inner`, но затем повторить replay с явно названным `K_outer`.

Результат обязан остаться:

```text
A
```

а не current дочернего или ближайшего контекста.

Связать:

```text
v012-child-creation-does-not-auto-select-contextual-k
```

### 4.7. Отсутствие неявного поиска

Успешные explicit-K replay должны проходить через probe, где:

```text
find()     -> throw
incoming() -> throw
```

Вместе с outer/inner discriminator это непосредственно подтверждает отсутствие поиска ближайшего/родительского K и фонового current как источника авторитета.

Связать:

```text
v012-nearest-lexical-frame-is-not-semantic-authority
v012-ambient-current-is-not-semantic-authority
v012-hidden-parent-traversal-is-not-semantic-authority
```

Не связывать в C6a более широкие public-surface векторы lexer/parser, если новый тест их непосредственно не доказывает.

---

## Задача 5. Блок C — общее левое чтение не является грамматикой FORMAL

### Назначение

Доказать на одном fixture, что одинаково выглядящая последовательность не создаёт единого скрытого механизма интерпретации.

### 5.1. Общее плоское чтение

Построить допустимое source/dictionary evidence для трёх уже разрешённых форм:

```text
[A, B, C]
```

Построить существующий flat-reading Act с заявленным результатом:

```text
AB  = A ⟼ B
ABC = AB ⟼ C
```

Вызвать:

```text
replayFlatReading(probe, evidence)
```

и проверить exact result:

```text
ABC
```

Проверить read-only replay.

### 5.2. Бинарная грамматика FORMAL

Построить существующее допустимое бинарное правило:

```text
[leftRole, arrowUse, rightRole]
-> leftRole ⟼ rightRole
```

### 5.3. Bare chain не получает автоматическую левую свёртку

Построить один FORMAL child с последовательностью:

```text
[A, arrowUse, B, arrowUse, C]
```

Попытка закрыть весь child одним бинарным правилом должна завершиться:

```text
StructuralRuleError
code = template-mismatch
```

Это ключевой отрицательный discriminator:

```text
generic flat fold != FORMAL grammar
```

### 5.4. Явная вложенность FORMAL

Существующими `openFormalContext` / `continueFormalContext` / `replayFormalClose` построить отдельно:

```text
left  = (A ⟼ B) ⟼ C
right = A ⟼ (B ⟼ C)
```

Проверить:

```text
left != right
```

там, где выбранные A/B/C дают структурно разные результаты.

Связать:

```text
v012-link-left-association-is-not-formal-grammar
v012-generic-flat-reader-is-not-formal-grammar
```

---

## Задача 6. Первый полный запуск C6a и классификация

### 6.1. Собрать проект и выполнить только новый тест

```bash
cd ts
npm run build --silent
node dist/test/v012-formal-context-reading-c6.test.js
```

### 6.2. Если результат GREEN

Классифицировать:

```text
C6A_CURRENT_RUNTIME_CONVERGENCE = GREEN
production delta = NONE
```

Проверить git diff: `ts/src/**` должен оставаться без изменений.

После этого выполнить полный test suite:

```bash
npm test
```

и затем полный TS check:

```bash
npm run check
```

### 6.3. Если результат RED

Немедленно остановить C6a production-работу.

Зафиксировать exact error и отнести его ровно к одной категории:

```text
TEST_MISTAKE
STALE_OLD_EVIDENCE
MISSING_COMPOSITION_EVIDENCE
ACTUAL_CANDIDATE_RUNTIME_GAP
```

Правила:

```text
TEST_MISTAKE
-> исправить только новый тест

STALE_OLD_EVIDENCE
-> проверить утверждённую спецификацию и текущий accepted evidence;
   не менять runtime до reconciliation

MISSING_COMPOSITION_EVIDENCE
-> добавить только недостающее явное test evidence,
   если оно уже выразимо текущими API

ACTUAL_CANDIDATE_RUNTIME_GAP
-> STOP C6a
-> отдельная issue/design/RED witness
-> bounded production transaction
```

Запрещено превращать RED C6a в смешанный test+production PR.

---

## Задача 7. Открыть и проверить C6a PR

После локально/CI-подтверждённого состояния:

- [ ] Проверить exact diff: один новый файл `ts/test/v012-formal-context-reading-c6.test.ts`.
- [ ] Открыть недрафтовый PR из отдельной C6a ветки.
- [ ] Запустить штатные CI и blocking repo-guard.
- [ ] При failure применять root-cause debugging; не ослаблять policy.
- [ ] Перед merge заново проверить `main`, exact head, `behind_by=0`, `mergeable=true`, `draft=false`.
- [ ] Merge только с `expected_head_sha`.
- [ ] После merge проверить новый exact `main`.
- [ ] Не утверждать post-merge GREEN, если на merge SHA нет соответствующих workflow runs.

---

## Задача 8. После принятого GREEN C6a

Только после merge C6a открыть отдельную C6b evidence-binding transaction.

C6b должна:

```text
- добавить exact C6a gate в requiredExecutableGates;
- убрать C6 placeholder из plannedExecutableGates;
- перевести C6 evidence state в green-confirmed;
- связать только напрямую доказанные векторы;
- фактически синхронизировать README + обязательные theory docs по cochange policy;
- обновить Contract Observatory projection tests;
- продвинуть C7 в NEXT;
- сохранить acceptanceReady=false и accepted=false.
```

C6b не является полной C8 нормативной синхронизацией.

C8 отдельно аудитирует минимум:

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

При выполнении этих условий C6a подтверждает сходимость существующих механизмов, но сам по себе ещё не меняет машинный lifecycle кандидата. Это делает только отдельный C6b.