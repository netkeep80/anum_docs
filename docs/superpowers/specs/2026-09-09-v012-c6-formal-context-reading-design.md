# MTS v0.12 C6 — FORMAL parentheses, explicit-K and reading convergence

Дата: 2026-09-09

Статус: **утверждённый архитектурный дизайн; implementation ещё не начат**.

Parent lifecycle: #1134  
Roadmap: #657  
Design owner: #1159  
Anum Protocol research: #1143

## 1. Exact baseline

Дизайн зафиксирован относительно:

```text
anum_docs/main = 368fac45a60d3dc2626dd04c3ad2a0f539b1333c

accepted MTS             = v0.11
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

C5 завершён без production runtime delta для Q compatibility / representation separation.

Открытые unrelated draft PR на момент design capture:

```text
#983
#1053
```

Они не являются C6 execution work.

## 2. Цель C6

C6 должен дать одно исполняемое доказательство согласованности трёх уже существующих механизмов:

```text
A. nested FORMAL context / parentheses
B. contextual resolution через явно выбранный K
C. generic left-reading как отдельная проекция
```

Ключевой вопрос C6:

> Нужна ли новая production-семантика, или текущий runtime уже удовлетворяет объявленной v0.12 candidate boundary?

Стартовая гипотеза после repository-wide audit:

```text
production delta expected = NONE
```

Поэтому C6 начинается не с новых helper-функций, а с candidate-specific executable convergence corpus.

## 3. Не смешивать три разных механизма

### 3.1 FORMAL grammar

FORMAL child — отдельный typed semantic context:

```text
I_FORMAL ⟼ K_child
```

Его смысл задаётся FORMAL rule/template replay.

### 3.2 Explicit contextual K

Контекстная точка разрешается относительно **конкретного K, предъявленного evidence**:

```text
Act -> beforeContext = K
Role_ctx -> K.current
```

Лексическая близость или host stack не выбирают этот K автоматически.

### 3.3 Generic flat reading

Generic flat reading проверяет уже разрешённую последовательность форм как явную левую свёртку:

```text
[A,B,C]
-> (A ⟼ B) ⟼ C
```

Это не FORMAL parser/grammar и не разрешение contextual `.`.

Общий C6 non-conflation law:

```text
FORMAL grammar
!= contextual-K selection
!= generic flat fold
```

## 4. Existing runtime inventory

C6 не должен дублировать уже существующий runtime.

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

`openChildContext` получает parent и target interpreter явно. Hidden parser stack не участвует.

`openFormalContext`:

```text
parentBefore = explicit supplied TypedContext
target interpreter = I_FORMAL
initial current = R
```

`continueFormalContext` хранит FORMAL sequence через ExactSequence и сохраняет даже explicit `R` как одну позицию.

`replayFormalClose`:

```text
- read-only;
- проверяет exact child I/K;
- проверяет exact lexical parent;
- требует non-empty ExactSequence;
- пустой child -> empty-formal-context;
- выбирает/проверяет structural Rule через explicit evidence;
- проверяет exact close projection [child-form-sequence, semantic-result].
```

### 4.2 `ts/src/state.ts`

Уже существует явный K:

```text
payload = parent ⟼ current
K = START(payload)
```

ROOT не является альтернативной кодировкой K.

`readContext(K)` возвращает только:

```text
parent
current
```

без host-side hidden current authority.

### 4.3 `ts/src/interpreter.ts`

Уже существуют:

```text
replayFlatReading
replayContextualReading
replayTopLevelContextualReading
```

`replayContextualReading` читает `beforeContext` из explicit Act evidence и заменяет только явно admitted `contextualRole` на `K.current`.

В production path отсутствуют:

```text
nearest-frame search
implicit parent traversal
ambient host current
parser-stack lookup
second contextual fold engine
```

`replayFlatReading` отдельно проверяет левую свёртку resolved forms.

## 5. Existing executable evidence to reuse, not clone blindly

### 5.1 `ts/test/v09-context-integration.test.ts`

Уже доказывает среди прочего:

```text
open FORMAL child
non-empty FORMAL close
empty FORMAL -> empty-formal-context
explicit parent continuation
left/right explicit nested relation forms differ
bare A-arrow-B-arrow-C does not automatically satisfy one binary FORMAL rule
```

### 5.2 `ts/test/v011-nested-explicit-binding-compatibility.test.ts`

Уже доказывает:

```text
K_outer.current = A
K_inner.current = B
K_inner.parent = K_outer

explicit inner K -> contextual result B
explicit outer K -> contextual result A
outer K cannot claim inner current B
TopBind wrapper cannot capture nested K
```

Read probe запрещает hidden `find()`/incoming scan.

C6a должен **скомпоновать** эти принятые механизмы под exact v0.12 candidate vectors, а не копировать их как два независимых старых теста без cross-layer witness.

## 6. Chosen architecture

Выбран вариант:

```text
C6a = one candidate-specific test-only convergence gate
```

Канонический новый test path:

```text
ts/test/v012-formal-context-reading-c6.test.ts
```

Начальный C6a scope:

```text
ts/test/** only
NO ts/src/**
NO contracts/**
NO docs/** in the executable transaction
```

Причина: все три production kernels уже существуют. Новый runtime до измерения был бы архитектурным дублированием.

## 7. C6a block A — FORMAL parentheses

### 7.1 Positive law

Для явного parent typed context:

```text
K_parent
```

открытие `(...)` моделируется существующим `openFormalContext`:

```text
K_parent
   ↓ explicit open
K_child : I_FORMAL
```

Требуется доказать:

```text
child.interpreter = I_FORMAL
parent(child.K) = exact K_parent
current(child.K) = R immediately after open
```

После заполнения FORMAL child admitted forms и replay close:

```text
child -> exactly one semantic Link/value
```

Возвращённый Link сам по себе не мутирует parent. Продолжение parent выполняется отдельным explicit `continueFormalContext`.

### 7.2 Empty negative law

Пустые parentheses:

```text
()
```

соответствуют открытому, но не заполненному FORMAL child.

`replayFormalClose` обязан fail closed:

```text
ContextIntegrationError("empty-formal-context")
```

Никакой `R`, `undefined`, пустой list или host sentinel не считается допустимым FORMAL result.

### 7.3 Direct vectors

C6a block A должен напрямую покрыть:

```text
v012-formal-parentheses-open-formal-child
v012-formal-empty-parentheses-fail-closed
v012-formal-empty-parentheses-are-not-a-valid-result
v012-formal-parent-continues-after-child-result
```

## 8. C6a block B — explicit contextual K

### 8.1 Fixture

Одновременно существуют:

```text
K_outer.current = A
K_inner.current = B
K_inner.parent = K_outer
A != B
```

Один physical contextual glyph `.` через source/dictionary evidence разрешается в explicit semantic `Role_ctx`.

### 8.2 Positive authority law

Act, который явно предъявляет:

```text
beforeContext = K_outer
```

должен получить:

```text
Role_ctx -> A
```

Act, который явно предъявляет:

```text
beforeContext = K_inner
```

должен получить:

```text
Role_ctx -> B
```

Идентичная physical форма не выбирает K по позиции или host scope.

### 8.3 Negative authority laws

Должны fail closed следующие попытки:

```text
1. K_outer указан явно, но claimed result = B
2. наличие K_inner заставляет outer evidence разрешиться через inner current
3. child creation автоматически делает child contextual authority
4. nearest lexical K выбирается без explicit evidence
5. ambient mutable current подменяет named K
6. hidden parent traversal находит другой K
```

### 8.4 Read-only adversarial probe

Replay должен работать на ReadMemory projection, где запрещены неразрешённые ambient operations, в частности hidden search/traversal, если они не входят в exact accepted read boundary.

Цель не запретить легальный structural read API вообще, а доказать:

```text
selected K comes from evidence
not from discovery
```

### 8.5 Direct vectors

```text
v012-formal-contextual-dot-uses-explicit-selected-k
v012-child-creation-does-not-auto-select-contextual-k
v012-nearest-lexical-frame-is-not-semantic-authority
v012-ambient-current-is-not-semantic-authority
v012-hidden-parent-traversal-is-not-semantic-authority
```

## 9. C6a block C — left-reading non-conflation

### 9.1 Generic flat reading

Для resolved forms:

```text
[A,B,C]
```

existing generic flat reader должен подтвердить:

```text
(A ⟼ B) ⟼ C
```

Это projection/fold law.

### 9.2 FORMAL grammar is different authority

Для FORMAL sequence, похожей визуально на:

```text
A ⟼ B ⟼ C
```

одна admitted binary FORMAL rule/template не получает право автоматически интерпретировать всю последовательность как generic left fold.

Без explicit nested FORMAL child structure такой bare sequence должна остаться несовместимой с соответствующим binary template:

```text
template mismatch / reject
```

### 9.3 Explicit FORMAL nesting

Отдельно доказать, что:

```text
(A ⟼ B) ⟼ C
```

и:

```text
A ⟼ (B ⟼ C)
```

получаются через explicit nested FORMAL child execution и имеют разные Link topology там, где соответствующие результаты структурно различны.

### 9.4 Direct vectors

```text
v012-link-left-association-is-not-formal-grammar
v012-generic-flat-reader-is-not-formal-grammar
```

## 10. C6 vectors deliberately not overclaimed

C6a не должен автоматически присваивать себе все оставшиеся host-authority vectors.

В частности full public/package proof для:

```text
v012-hidden-lexer-mode-has-zero-semantic-authority
v012-hidden-parser-mode-has-zero-semantic-authority
```

логичнее завершать в C7, где проверяется public facade и selectable surface целиком.

`v012-host-parser-stack-has-zero-semantic-authority` может быть связан в C6 только если C6a непосредственно построит adversarial witness достаточной силы. Иначе он остаётся C7 evidence.

Правило:

```text
bind only what executable gate directly proves
```

## 11. Expected C6a outcome

Главное ожидаемое состояние:

```text
new C6 candidate regression test
-> GREEN on current runtime
-> production delta = NONE
```

Это не нарушение RED-first engineering discipline: C6a классифицирован как compatibility/convergence evidence stage поверх уже существующих production kernels.

## 12. RED handling

Если новый C6a test RED:

```text
STOP
```

Не разрешено сразу менять `ts/src/**` в той же транзакции.

Сначала определить точную классификацию:

```text
TEST_MISTAKE
STALE_OLD_EVIDENCE
MISSING_COMPOSITION_EVIDENCE
ACTUAL_CANDIDATE_RUNTIME_GAP
```

Только `ACTUAL_CANDIDATE_RUNTIME_GAP` разрешает отдельный bounded production child.

Такой child должен:

```text
- иметь собственную Issue/ChangeIntent;
- иметь отдельный RED witness;
- менять минимальный существующий kernel;
- не добавлять новый parser subsystem;
- после GREEN возвращаться к C6a convergence gate.
```

## 13. Anti-designs rejected

### 13.1 New `openFormalParenthesesContext`

Отклонено как default design.

Причина:

```text
openFormalContext already expresses the semantic child transition
```

Новый helper допустим только если executable evidence докажет независимый observable law, которого текущая функция не выражает.

### 13.2 Hidden parser stack

Отклонено.

```text
host stack != semantic authority
```

### 13.3 Nearest-K discovery

Отклонено.

```text
lexical proximity != authority
```

### 13.4 Reusing flat reader as FORMAL grammar

Отклонено.

Flat fold и FORMAL template execution — разные evidence paths.

### 13.5 New host AST for parentheses

Отклонено.

Nested FORMAL semantics уже выражается typed context + ordinary Link evidence.

## 14. C6b evidence binding

После C6a GREEN выполняется **отдельная transaction**.

Expected machine transition:

```text
formalContextComplete / equivalent C6 candidate flag -> true
formalContextC6 = green-confirmed
requiredExecutableGates: 4 -> 5
C7 = NEXT
```

Точные field names должны браться из свежего candidate contract/conformance, а не придумываться заранее.

C6b binds:

```text
- exact C6a test path;
- exact issue/PR/head;
- exact CI/repo-guard runs;
- exact merge SHA;
- only directly proved vectors.
```

C6b не меняет production runtime, если C6a прошёл на текущем коде.

## 15. Documentation is part of lifecycle

Документация не откладывается до конца работы.

### 15.1 This design transaction

Создаёт этот durable design document и больше ничего нормативного не меняет.

### 15.2 C6b factual cochange

После GREEN C6 evidence необходимо factually synchronize текущий lifecycle как минимум в тех canonical projections, которых требует свежий repo-policy.

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

Ожидаемая factual projection:

```text
C6 = GREEN-confirmed / bound
C7 = NEXT
v0.12 = candidate / NOT ACCEPTED / not selectable / not ready
v0.11 = current accepted runtime
```

### 15.3 C8 normative documentation convergence

C6b не подменяет C8.

C8 должен отдельно проверить и синхронизировать нормативную документацию, минимум:

```text
docs/specs/Формальная нотация МТС.md
docs/specs/Ачисла и сериализация.md
README.md
docs/theory/Основания МТС.md
docs/theory/Система аксиом МТС.md
```

Известный stale historical accepted-version wording в FORMAL notation должен быть рассмотрен именно там либо раньше отдельным доказанным docs-only correction, если он начинает вводить текущую работу в заблуждение.

## 16. C7 boundary

C7 остаётся отдельным stage:

```text
package/public facade convergence
```

До C7 нельзя:

```text
- экспортировать candidate runtime как selectable public authority;
- считать наличие внутренних функций публичной поддержкой v0.12;
- связывать full public absence of hidden lexer/parser mode knobs без public-surface audit.
```

`ts/src/public.ts` не трогать в C6.

## 17. C8/C9/C10 boundaries

C6 не означает:

```text
normative docs complete
traceability complete
acceptanceReady
accepted v0.12
```

Остаются отдельными:

```text
C8  normative documentation synchronization
C9  evidence completeness / readiness audit
C10 atomic acceptance/cutover
C11 post-cutover cleanup / contract budget normalization
```

## 18. Downstream freeze

До explicit C10 acceptance сохраняется:

```text
#1132 native astring transport = PAUSED
#1128 portable CLOSED proof transport = PAUSED
aprover#255 = PAUSED
```

C6 evidence не является разрешением repin downstream на candidate runtime.

## 19. C6a proposed ChangeIntent boundary

После written-spec review C6a implementation issue должен использовать примерно следующий bounded scope, но конкретный policy блок должен быть сформирован из свежего `repo-policy.json`:

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

No implementation plan may silently enlarge this scope.

## 20. Acceptance criteria for C6 design

Design is ready for implementation planning only if all are true:

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

## 21. Spec self-review

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

## 22. Next process gate

Этот файл — durable written specification утверждённого C6 design.

Следующий шаг выполняется только после review этого written spec пользователем:

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

Никакая production реализация C6 не считается заранее необходимой.
