# Foundation v2 — Gate P candidate

Статус: **production/reference candidate**, не accepted release.

Главный epic: #237. Завершены exact-occurrence substrate #240/#241, state/apamemory layer #243/#244 и source front-end #245/#246. Текущий слой: unified interpreter/replay #247. Sequence-deserialization: #242. Persistent L4 backend: #124.

Цель Gate P — превратить завершённые research-решения Foundation v2 в **один** reference/production path, после чего опубликовать следующую версию МТС, которую сможет точно потреблять `aprover`.

## 1. Что уже считается обязательным направлением

Новая версия должна строиться снизу вверх:

```text
binary link ontology
→ distinguished R/O/C/L/U bootstrap
→ exact-occurrence finite link networks
→ root-relative Anum structural descriptions where defined
→ canonical UTF-8/astring source carrier
→ explicit selected source segmentation
→ explicit D/G/T relations
→ explicit K/current
→ structural relation resolution
→ actual interpretation acts A
→ trusted exact replay
→ proof checker / aprover
```

При этом:

```text
source != semantic form
form != theory membership
structural equality != exact occurrence identity
read/find/replay != materialize
```

## 2. Production substrate

Текущий Foundation-v2 substrate:

```text
OccurrenceRef
Link(start,end)
LinkNetwork
```

`Link` не имеет semantic tags. В частности, на нём нет полей:

```text
meaning
kind
context
theory
axiom
role
token
astNode
```

Sharing и cycles конечны и native. Два occurrences с одинаковыми полюсами могут оставаться различными.

## 3. Higher-layer state тоже является сетью связей

Контекст:

```text
P = parent ⟼ current
K = K ⟼ P
↑ = current from exact active K
```

Source occurrence:

```text
S = S ⟼ C
```

где `C` — canonical source content, а `S` — конкретное occurrence источника.

Dictionary:

```text
Entry = C ⟼ F
D ⟼ Entry
```

Theory / grammar evidence:

```text
T ⟼ F
G ⟼ selectedEvidence
```

Actual interpretation act использует finite structural bootstrap:

```text
P0 = D_roles ⟼ K_after
H  = I ⟼ P0
A  = A ⟼ H
```

а расширяемые поля:

```text
Field = roleRef ⟼ value
A ⟼ Field
```

Role refs разрешаются через явный `D_roles`; host enum не является их semantic identity.

## 4. Один source front-end

Gate P не должен иметь отдельные «настоящий tokenizer», «semantic parser» и затем второй semantic evaluator, каждый со своим скрытым набором смыслов. Production-facing source layer строится как проверяемый переход от байтов к **выбранным exact relations**.

Каноническая цепочка #245:

```text
raw bytes
→ canonical astring content C
→ exact source occurrence S
→ untrusted candidate segmentation
→ selected exact source spans
→ explicit D memberships
→ ordered exact form sequence
→ explicit G/T admission
→ replayable source evidence
```

Кандидатный поиск может использовать индексы, trie, regex, longest-match heuristics или UI. Но trusted boundary не доверяет результату поиска по факту того, какой host-код его выдал. Она повторно проверяет выбранное evidence.

### 4.1. Канонический content и occurrence источника

Lower byte protocol предоставляет exact refs `B(byte)`. Astring content является R-seeded history:

```text
C0 = R
C(n+1) = Cn ⟼ B(byte_n)
```

Конкретное появление исходника отдельно:

```text
S = S ⟼ C
```

Поэтому одинаковые bytes могут иметь общий canonical `C`, но разные exact source occurrences `S1`, `S2`.

### 4.2. Выбранный slice — не token class

Для выбранного байтового диапазона используются exact prefix refs источника:

```text
Span = sourcePrefix(start) ⟼ sourcePrefix(end)
SliceEvidence = Span ⟼ sliceContent
Lexeme = S ⟼ SliceEvidence
```

`start/end` в host artifact остаются transport/checker coordinates. Семантическое evidence задаётся самими exact refs границ, source occurrence и slice content.

UTF-8 знак из нескольких байтов, например `⟼`, может быть одним выбранным slice. Он не обязан превращаться в набор byte-sized semantic token-ов.

### 4.3. Разрешение через словарь

Словарь остаётся явной сетью:

```text
Entry = sliceContent ⟼ form
Membership = D ⟼ Entry
```

Для конкретного lexeme выбранное разрешение фиксируется:

```text
Resolution = Lexeme ⟼ form
Selection = exactDictionaryMembership ⟼ Resolution
```

Это важно для неоднозначности. Один и тот же source может иметь:

```text
D1 → form1
D2 → form2
```

без изменения source content.

### 4.4. Порядок и G/T admission

Порядок выбранных lexeme и resolved forms также является связевой структурой:

```text
SelectedSequence = fold(R, Selection_0 ... Selection_n)
FormSequence     = fold(R, Form_0 ... Form_n)
```

Затем выбранная композиция должна быть явно допущена:

```text
G ⟼ FormSequence
T ⟼ FormSequence
```

Точная будущая grammar/theory topology может расшириться, но production boundary уже запрещает неявное правило «раз host parser построил AST, значит композиция допустима».

### 4.5. Что source replay не делает

Source replay:

```text
проверяет байты и C/S;
проверяет exact boundaries;
проверяет D memberships;
проверяет порядок forms;
проверяет G/T admission.
```

Он **не** обязан:

```text
создавать application links;
исполнять `:` или `=`;
выбирать proof rule;
делать Anum sequence materialization;
менять апамять.
```

Поэтому:

```text
source resolution/replay != materialization
```

Это критично для апрувера: исходник и proof evidence можно проверять, не делая доказываемое истинным самим фактом чтения.

## 5. Один interpreter/replay spine

После #245 интерпретатор больше не должен повторно превращать source в свои token/AST objects. Он получает уже replayable exact source evidence и продолжает **ту же связевую цепочку**.

Первый production-facing vertical slice #247 намеренно минимален:

```text
exact source evidence
        ↓
selected one-pole form F
        ↓
exact active K
        ↓
↑ = current
        ↓
structural pole resolution
        ↓
exact result X
        ↓
persistent K_after
        ↓
actual act A
```

### 5.1. Направление операции не является opcode

Если выбранная exact form имеет самозамкнутое начало:

```text
F = F ⟼ e
```

то начало ещё не различено внешним binding, а конец уже различён. В текущем act:

```text
binding = ↑
X = binding ⟼ e
```

Для симметричной формы:

```text
F = b ⟼ F
```

получаем:

```text
binding = ↑
X = b ⟼ binding
```

То есть interpreter не спрашивает:

```text
if token == "♂": ...
if ast.kind == START_PROJECTION: ...
```

Он читает структуру выбранной exact form и explicit K. Операционное направление является следствием того, какой полюс уже различён в данном акте.

### 5.2. `↑` не ambient state

До акта:

```text
P_before = parent ⟼ current
K_before = K_before ⟼ P_before
```

Trusted replay получает **конкретный exact K_before** и выводит:

```text
↑ = current
binding = current
```

После проверенного результата:

```text
P_after = sameParent ⟼ X
K_after = K_after ⟼ P_after
```

Старый K не мутирует. Новый K — новая exact occurrence persistent state.

### 5.3. Результат выбирается exact occurrence, а не формой пары

Пусть в апамяти существуют:

```text
X1 = a ⟼ b
X2 = a ⟼ b
X1 != X2
```

Trusted act может выбрать `X2`. Проверка обязана подтвердить:

```text
poles(X2) = (a,b)
K_after.current = X2
A.result = X2
```

но не имеет права сказать «пара `(a,b)` уникальна, значит X1=X2».

Это связывает interpreter semantics с exact-occurrence моделью апамяти и сохраняет provenance отдельных актов/результатов.

### 5.4. Actual act является проверяемой сетью

Заголовок:

```text
P0 = D_roles ⟼ K_after
H  = I ⟼ P0
A  = A ⟼ H
```

Минимальные role-addressed fields первого vertical slice:

```text
source
source-selection
form-sequence
dictionary
grammar
theory
form
before-context
binding
result
after-context
```

Каждое поле:

```text
Field = roleRef ⟼ value
A ⟼ Field
```

Trusted replay требует ровно одно согласованное значение каждой обязательной роли. Дублированное/конфликтующее evidence отклоняется.

Host dataclass с удобными именами полей допустим как checker API, но не определяет ontology: semantic role identity задаётся exact `roleRef` из явного `D_roles`.

### 5.5. Replay и исполнение апамяти пока разведены

Текущий interpreter slice является **read-only**:

```text
replay(source,K,A)
→ проверить выбранные exact relations
→ вернуть exact result ref
```

Он не делает:

```text
materialize(result poles)
materialize(K_after)
materialize(A)
```

Эти occurrences уже должны входить в проверяемую сеть/evidence.

Это намеренно. Сначала фиксируется trusted semantics, затем отдельный effect/L4 слой сможет создавать структуру, которую тот же replay независимо проверяет.

Такой разрыв особенно важен для апрувера:

```text
proof search / executor
    может строить candidate evidence

trusted replay
    только проверяет candidate evidence
```

и сам факт проверки не изменяет предмет доказательства.

### 5.6. `:` и `=` должны расширить этот же engine

После #247 нельзя создавать отдельный `DefinitionInterpreter`, `EqualityInterpreter` и ещё один общий evaluator с разными скрытыми состояниями.

Принятые research decisions должны стать следующими режимами **одной replay architecture**:

```text
relation-resolution act
colon definition effect/replay
local equality constraint/replay
```

Для `:` уже выбран persistent scope snapshot:

```text
D = D ⟼ (parentScope ⟼ localHistory)
Entry = S ⟼ F
Occurrence = D_before ⟼ Entry
history' = history ⟼ Occurrence
D_after = new persistent scope snapshot
```

Для `=` выбран local exact representative constraint, без global congruence/substitution.

Их интеграция должна переиспользовать exact source, K/D/G/T, actual A и общий replay boundary, а не создавать parallel semantics.

## 6. Апамять

Foundation v2 рассматривает апамять как **контроллер сети exact link occurrences**.

Подробно: [Апамять и управление сетью связей](Апамять%20и%20управление%20сетью%20связей.md).

Ключевой operational boundary:

```text
read / find / enumerate / replay
        │
        └── не изменяют сеть

materialize / delete
        │
        └── явные effects
```

Это позволяет описывать и искать связь, не создавая её самим фактом запроса.

## 7. Ачисло и будущая sequence deserialization

Recursive Anum уже является root-relative structural description на принятой occurrence-tree области, но это ещё не полная operational semantics произвольной последовательности.

Отдельный gate #242 должен проверить более широкий исторический принцип:

```text
∞ A B C
```

как последовательностное описание, которое после **явной** десериализации/materialization может построить сеть:

```text
A ⟼ B
B ⟼ C
```

с корректной nested-context semantics.

До этого challenge нельзя молча расширять pair-only recursive grammar или делать `[`/`]` безусловными PUSH/POP opcode-ами.

Важно не смешивать #245/#247 и #242:

```text
#245 source front-end
    читает/разрешает/проверяет source evidence
    без application effects

#247 interpreter replay
    проверяет selected semantic act над exact evidence
    без application effects

#242 Anum→апамять
    исследует явный materialization результирующей сети
```

## 8. Что должна получить следующая версия для aprover

`aprover` должен потреблять опубликованный versioned contract и conformance corpus, а не повторно определять семантику МТС.

Минимальная trusted цепочка будущего checker-а теперь становится конкретной:

```text
exact source/evidence
→ selected dictionary/grammar/theory relations
→ exact active K
→ selected declarative form + binding
→ structural relation resolution
→ exact result / K_after
→ actual act A
→ deterministic read-only replay
```

Proof search, ranking и UI могут быть сложными и эвристическими. Валидность доказательства определяется replay выбранных exact relations.

## 9. Что ещё блокирует release

До repin `aprover` остаются как минимум:

```text
interpreter/replay spine #247
→ integrate `:` and local `=` into the same engine
→ sequence-to-apamemory gate #242
→ historical compatibility classification
→ explicit persistent L4 boundary #124
→ integrated end-to-end conformance
→ explicit acceptance decision
→ atomic production cutover
→ published next MTS contract/version
```

Запрещён конечный результат вида:

```text
legacy semantics + Foundation-v2 semantics selectable by mode
```

После acceptance активный production tree должен иметь один canonical semantic path; Git хранит исторические версии.
