# МТС v0.12 C6 — круглые скобки формального контекста, явный K и сходимость чтения

Дата: 2026-09-09

Статус: **утверждённая архитектура; реализация C6 ещё не начата**.

Родитель жизненного цикла: #1134  
Дорожная карта: #657  
Задача фиксации архитектуры: #1159  
Связанное исследование `Anum Protocol`: #1143

## 1. Точная исходная точка

Архитектура зафиксирована относительно:

```text
anum_docs/main = 368fac45a60d3dc2626dd04c3ad2a0f539b1333c

accepted MTS              = v0.11
active semantic candidate = v0.12
candidate status          = candidate
candidate accepted        = false
acceptanceReady           = false
candidateRuntimeSelectable = false
implementationComplete    = false
coverageState             = incomplete

C0 = COMPLETE
C1 = COMPLETE
C2 = COMPLETE
C3 = COMPLETE
C4 = COMPLETE
C5 = COMPLETE
C6 = NEXT
```

C5 завершён без изменения рабочей реализации для совместимости `Q` и разделения представления с интерпретацией.

На момент фиксации остаются только два несвязанных черновых запроса на слияние:

```text
#983
#1053
```

Они не относятся к выполнению C6.

## 2. Назначение C6

C6 должен дать одно исполняемое доказательство согласованности трёх уже существующих механизмов:

```text
A. вложенный FORMAL-контекст / круглые скобки
B. контекстное разрешение через явно выбранный K
C. общее левое чтение как отдельная проекция
```

Главный вопрос C6:

> Нужна ли новая рабочая семантика, или текущая исполняемая среда уже удовлетворяет объявленной границе кандидата v0.12?

Стартовая гипотеза после полного аудита репозитория:

```text
production delta expected = NONE
```

Поэтому C6 начинается не с новых вспомогательных функций, а с исполняемого корпуса сходимости, специфичного для кандидата v0.12.

## 3. Три механизма нельзя отождествлять

### 3.1 Грамматика `FORMAL`

Дочерний `FORMAL` является отдельным типизированным смысловым контекстом:

```text
I_FORMAL ⟼ K_child
```

Его результат определяется воспроизведением правила и шаблона `FORMAL`.

### 3.2 Явный контекстный K

Контекстная точка разрешается относительно **конкретного K, предъявленного свидетельством**:

```text
Act -> beforeContext = K
Role_ctx -> K.current
```

Лексическая близость и стек языка реализации не выбирают этот K автоматически.

### 3.3 Общее плоское чтение

Общее плоское чтение проверяет уже разрешённую последовательность форм как явную левую свёртку:

```text
[A,B,C]
-> (A ⟼ B) ⟼ C
```

Это не грамматика `FORMAL` и не разрешение контекстной точки.

Общий закон C6:

```text
FORMAL grammar
!= contextual-K selection
!= generic flat fold
```

## 4. Уже существующая рабочая реализация

C6 не должен дублировать существующие механизмы.

### 4.1 `ts/src/context-integration.ts`

Уже существуют:

```text
defineTypedContext
verifyTypedContext
openChildContext
openFormalContext
continueFormalContext
replayFormalClose
```

`openChildContext` получает родительский контекст и целевой интерпретатор явно. Скрытый стек разбора не используется.

`openFormalContext` задаёт:

```text
parentBefore = explicit supplied TypedContext
target interpreter = I_FORMAL
initial current = R
```

`continueFormalContext` хранит последовательность `FORMAL` через `ExactSequence` и сохраняет даже явный `R` как одну позицию.

`replayFormalClose`:

```text
- read-only;
- verifies exact child I/K;
- verifies exact lexical parent;
- requires non-empty ExactSequence;
- empty child -> empty-formal-context;
- verifies structural Rule through explicit evidence;
- verifies close projection [child-form-sequence, semantic-result].
```

### 4.2 `ts/src/state.ts`

Уже существует явный K:

```text
payload = parent ⟼ current
K = START(payload)
```

`ROOT` не является альтернативной кодировкой K.

`readContext(K)` возвращает только:

```text
parent
current
```

и не вводит скрытый текущий смысл на стороне языка реализации.

### 4.3 `ts/src/interpreter.ts`

Уже существуют:

```text
replayFlatReading
replayContextualReading
replayTopLevelContextualReading
```

`replayContextualReading` получает `beforeContext` из явного свидетельства `Act` и заменяет только явно допущенную роль `contextualRole` на `K.current`.

В этом пути отсутствуют:

```text
nearest-frame search
implicit parent traversal
ambient host current
parser-stack lookup
second contextual fold engine
```

`replayFlatReading` отдельно проверяет левую свёртку уже разрешённых форм.

## 5. Существующие исполняемые свидетельства

Их нужно переиспользовать и скомпоновать, а не копировать без необходимости.

### 5.1 `ts/test/v09-context-integration.test.ts`

Этот тест уже подтверждает среди прочего:

```text
open FORMAL child
non-empty FORMAL close
empty FORMAL -> empty-formal-context
explicit parent continuation
left/right explicit nested relation forms differ
bare A-arrow-B-arrow-C does not automatically satisfy one binary FORMAL rule
```

### 5.2 `ts/test/v011-nested-explicit-binding-compatibility.test.ts`

Этот тест уже подтверждает:

```text
K_outer.current = A
K_inner.current = B
K_inner.parent = K_outer

explicit inner K -> contextual result B
explicit outer K -> contextual result A
outer K cannot claim inner current B
TopBind wrapper cannot capture nested K
```

Проверочная проекция чтения запрещает скрытые `find()` и сканирование `incoming()`.

C6a должен собрать эти принятые механизмы под точными векторами кандидата v0.12 и добавить межслойное доказательство их независимости.

## 6. Выбранная архитектура

Выбран один новый тест сходимости кандидата:

```text
C6a = one candidate-specific test-only convergence gate
```

Канонический путь:

```text
ts/test/v012-formal-context-reading-c6.test.ts
```

Начальная граница C6a:

```text
ts/test/** only
NO ts/src/**
NO contracts/**
NO docs/** in the executable transaction
```

Причина: все три рабочих механизма уже существуют. Новая реализация до измерения была бы дублированием архитектуры.

## 7. C6a: блок A — круглые скобки `FORMAL`

### 7.1 Положительный закон

Для явно заданного родительского типизированного контекста:

```text
K_parent
```

открытие `(...)` выражается существующей функцией `openFormalContext`:

```text
K_parent
   ↓ explicit open
K_child : I_FORMAL
```

Необходимо доказать:

```text
child.interpreter = I_FORMAL
parent(child.K) = exact K_parent
current(child.K) = R immediately after open
```

После заполнения дочернего `FORMAL` допустимыми формами и воспроизведения закрытия:

```text
child -> exactly one semantic Link/value
```

Возвращённая связь сама по себе не изменяет родителя. Продолжение родителя выполняется отдельным явным `continueFormalContext`.

### 7.2 Отрицательный закон пустых скобок

Пустые круглые скобки:

```text
()
```

соответствуют открытому, но не заполненному дочернему `FORMAL`.

`replayFormalClose` обязан завершиться отказом:

```text
ContextIntegrationError("empty-formal-context")
```

Ни `R`, ни `undefined`, ни пустой список, ни служебное значение языка реализации не считаются допустимым результатом `FORMAL`.

### 7.3 Прямо доказываемые векторы

```text
v012-formal-parentheses-open-formal-child
v012-formal-empty-parentheses-fail-closed
v012-formal-empty-parentheses-are-not-a-valid-result
v012-formal-parent-continues-after-child-result
```

## 8. C6a: блок B — явный контекстный K

### 8.1 Исходная конструкция

Одновременно существуют:

```text
K_outer.current = A
K_inner.current = B
K_inner.parent = K_outer
A != B
```

Один физический знак `.` через явное свидетельство источника и словаря разрешается в смысловую роль `Role_ctx`.

### 8.2 Положительный закон авторитета

`Act`, который явно предъявляет:

```text
beforeContext = K_outer
```

должен получить:

```text
Role_ctx -> A
```

`Act`, который явно предъявляет:

```text
beforeContext = K_inner
```

должен получить:

```text
Role_ctx -> B
```

Одинаковая физическая форма не выбирает K по положению или области видимости языка реализации.

### 8.3 Отрицательные законы авторитета

Должны завершаться отказом следующие попытки:

```text
1. K_outer named explicitly, but claimed result = B
2. existence of K_inner changes outer evidence to inner current
3. child creation automatically selects child as contextual K
4. nearest lexical K is selected without explicit evidence
5. ambient mutable current replaces named K
6. hidden parent traversal discovers another K
```

### 8.4 Враждебная проекция чтения

Воспроизведение должно работать на проекции `ReadMemory`, в которой запрещены неразрешённые операции фонового поиска или обхода.

Цель не запретить законное структурное чтение, а доказать:

```text
selected K comes from evidence
not from discovery
```

### 8.5 Прямо доказываемые векторы

```text
v012-formal-contextual-dot-uses-explicit-selected-k
v012-child-creation-does-not-auto-select-contextual-k
v012-nearest-lexical-frame-is-not-semantic-authority
v012-ambient-current-is-not-semantic-authority
v012-hidden-parent-traversal-is-not-semantic-authority
```

## 9. C6a: блок C — левое чтение не является грамматикой `FORMAL`

### 9.1 Общее плоское чтение

Для уже разрешённых форм:

```text
[A,B,C]
```

существующее общее плоское чтение должно подтвердить:

```text
(A ⟼ B) ⟼ C
```

Это закон проекции и свёртки.

### 9.2 Грамматика `FORMAL` имеет другой источник авторитета

Для последовательности `FORMAL`, визуально похожей на:

```text
A ⟼ B ⟼ C
```

одно допущенное бинарное правило `FORMAL` не получает права автоматически интерпретировать всю последовательность как общее левое чтение.

Без явной структуры вложенного дочернего `FORMAL` такая последовательность должна оставаться несовместимой с соответствующим бинарным шаблоном:

```text
template mismatch / reject
```

### 9.3 Явная вложенность `FORMAL`

Отдельно требуется доказать, что:

```text
(A ⟼ B) ⟼ C
```

и:

```text
A ⟼ (B ⟼ C)
```

получаются через явное выполнение вложенных дочерних контекстов `FORMAL` и имеют различную топологию связей там, где результаты структурно различны.

### 9.4 Прямо доказываемые векторы

```text
v012-link-left-association-is-not-formal-grammar
v012-generic-flat-reader-is-not-formal-grammar
```

## 10. Векторы, которые C6 не должен присваивать себе без доказательства

C6a не должен автоматически связывать все оставшиеся отрицательные векторы о скрытом авторитете среды.

Полную проверку публичной поверхности для:

```text
v012-hidden-lexer-mode-has-zero-semantic-authority
v012-hidden-parser-mode-has-zero-semantic-authority
```

правильнее завершать в C7, где проверяется весь публичный интерфейс и возможность выбора исполняемой среды.

`v012-host-parser-stack-has-zero-semantic-authority` разрешено связать в C6 только при наличии прямого враждебного исполняемого свидетельства достаточной силы. Иначе он также остаётся до C7.

Правило:

```text
bind only what executable gate directly proves
```

## 11. Ожидаемый результат C6a

Основное ожидание:

```text
new C6 candidate regression test
-> GREEN on current runtime
-> production delta = NONE
```

C6a является этапом проверки совместимости и сходимости поверх уже существующих рабочих механизмов, поэтому немедленный зелёный результат здесь является ожидаемым доказательством, а не нарушением разработки через тесты.

## 12. Обработка неожиданного красного результата

Если новый тест C6a красный:

```text
STOP
```

Запрещено сразу менять `ts/src/**` в той же транзакции.

Сначала нужно определить точную классификацию:

```text
TEST_MISTAKE
STALE_OLD_EVIDENCE
MISSING_COMPOSITION_EVIDENCE
ACTUAL_CANDIDATE_RUNTIME_GAP
```

Только последний случай разрешает отдельную ограниченную задачу на изменение рабочей реализации.

Такая задача должна:

```text
- иметь собственную Issue/ChangeIntent;
- иметь отдельный RED witness;
- change the smallest existing kernel;
- add no new parser subsystem;
- return to C6a convergence gate after GREEN.
```

## 13. Отклонённые варианты архитектуры

### 13.1 Новая `openFormalParenthesesContext`

Не вводится по умолчанию.

Причина:

```text
openFormalContext already expresses the semantic child transition
```

Новая функция допустима только если исполняемое свидетельство покажет независимый наблюдаемый закон, которого текущая функция не выражает.

### 13.2 Скрытый стек разбора

Отклонён:

```text
host stack != semantic authority
```

### 13.3 Поиск ближайшего K

Отклонён:

```text
lexical proximity != authority
```

### 13.4 Использование плоского чтения как грамматики `FORMAL`

Отклонено. Левая свёртка и выполнение шаблона `FORMAL` являются разными путями свидетельств.

### 13.5 Новое дерево разбора языка реализации для круглых скобок

Отклонено. Смысл вложенного `FORMAL` уже выражается типизированным контекстом и обычными связями.

## 14. C6b — отдельная привязка свидетельств

После зелёного C6a выполняется отдельная транзакция.

Ожидаемый переход машинного состояния:

```text
formalContextComplete / equivalent C6 candidate flag -> true
formalContextC6 = green-confirmed
requiredExecutableGates: 4 -> 5
C7 = NEXT
```

Точные имена полей берутся из свежих файлов контракта и соответствия кандидата, а не придумываются заранее.

C6b связывает:

```text
- exact C6a test path;
- exact issue/PR/head;
- exact CI/repo-guard runs;
- exact merge SHA;
- only directly proved vectors.
```

Если C6a прошёл на текущем коде, C6b не меняет рабочую реализацию.

## 15. Документация является частью жизненного цикла

Документация не откладывается до конца работ.

### 15.1 Текущая транзакция

Она создаёт только этот устойчивый документ архитектуры и не меняет нормативную теорию.

### 15.2 Фактическая синхронизация C6b

После зелёного свидетельства C6 необходимо синхронизировать фактическое состояние жизненного цикла во всех канонических проекциях, требуемых свежей политикой репозитория.

Ожидаемый набор:

```text
contracts/mts-contract-v0.12.json
contracts/mts-conformance-v0.12.json
README.md
docs/theory/Основания МТС.md
docs/theory/Система аксиом МТС.md
web/contract-observatory/test/contract-index.test.ts
web/contract-observatory/test/methodology-projection.test.ts
```

Ожидаемая фактическая проекция:

```text
C6 = GREEN-confirmed / bound
C7 = NEXT
v0.12 = candidate / NOT ACCEPTED / not selectable / not ready
v0.11 = current accepted runtime
```

### 15.3 C8 — полная синхронизация нормативной документации

C6b не подменяет C8.

C8 отдельно проверяет и синхронизирует минимум:

```text
docs/specs/Формальная нотация МТС.md
docs/specs/Ачисла и сериализация.md
README.md
docs/theory/Основания МТС.md
docs/theory/Система аксиом МТС.md
```

Известная устаревшая формулировка о принятой версии в документе формальной нотации должна быть проверена именно там либо раньше отдельной доказанной документационной коррекцией, если начнёт вводить текущую работу в заблуждение.

## 16. Граница C7

C7 остаётся отдельным этапом:

```text
package/public facade convergence
```

До C7 нельзя:

```text
- export candidate runtime as selectable public authority;
- treat internal functions as public v0.12 support;
- bind full public absence of hidden lexer/parser mode knobs without public-surface audit.
```

`ts/src/public.ts` в C6 не изменяется.

## 17. Границы C8, C9 и C10

Завершение C6 не означает:

```text
normative docs complete
traceability complete
acceptanceReady
accepted v0.12
```

Отдельными этапами остаются:

```text
C8  normative documentation synchronization
C9  evidence completeness / acceptance-readiness audit
C10 atomic acceptance/cutover
C11 post-cutover cleanup / contract budget normalization
```

## 18. Заморозка downstream

До явного принятия на C10 сохраняется:

```text
#1132 native astring transport = PAUSED
#1128 portable CLOSED proof transport = PAUSED
aprover#255 = PAUSED
```

Свидетельство C6 не разрешает переключать потребителей на непринятую исполняемую среду кандидата.

## 19. Предлагаемая граница `ChangeIntent` для C6a

После проверки этого документа пользователем задача реализации C6a должна использовать примерно следующую ограниченную область, но точный блок политики формируется из свежего `repo-policy.json`:

```text
change_type: test
scope:
  - ts/test/v012-formal-context-reading-c6.test.ts

max_new_files: 1
max_new_docs: 0

must_not_touch:
  - ts/src/**
  - contracts/**
  - docs/**
  - README.md
  - cutover/**
  - traceability/**
  - repo-policy.json
  - .github/**
```

Будущий план реализации не может молча расширять эту область.

## 20. Критерии готовности архитектуры C6

Архитектура готова к планированию C6a только при выполнении всех условий:

```text
[x] user approved architecture in chat
[x] three existing runtime kernels identified
[x] C6a starts test-only
[x] FORMAL parentheses positive/negative law explicit
[x] explicit-K authority law explicit
[x] nearest/ambient/hidden traversal veto explicit
[x] left-reading vs FORMAL grammar non-conflation explicit
[x] RED handling isolated from production mutation
[x] C6b separated from C6a
[x] factual docs cochange separated from C8 normative sync
[x] C7 public facade boundary preserved
[x] downstream freeze preserved
[x] accepted v0.11 remains immutable
[x] v0.12 remains candidate/not accepted
```

## 21. Самопроверка спецификации

```text
placeholder/TODO scan                 = CLEAN
accepted-version leakage              = NONE
candidate-acceptance leakage          = NONE
hidden parser/lexer authority         = NONE
nearest-context semantic authority    = NONE
flat-reader/FORMAL conflation         = NONE
unapproved production API expansion   = NONE
C6/C7 boundary ambiguity              = RESOLVED
C6b/C8 documentation ambiguity        = RESOLVED
implementation scope                  = C6a ONLY after written-spec review
```

## 22. Следующий процессный шлюз

Этот файл является устойчивой письменной спецификацией утверждённой архитектуры C6.

Следующий шаг выполняется только после проверки этого письменного документа пользователем:

```text
write detailed implementation plan for C6a only
```

После этого:

```text
fresh GitHub state
-> C6a bounded issue
-> test-only branch
-> executable convergence gate
```

Никакое изменение рабочей реализации C6 не считается заранее необходимым.
