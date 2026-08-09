# Foundation v2 — Gate P candidate

Статус: **production/reference candidate**, не accepted release.

Главный epic: #237. Завершены exact-occurrence substrate #240/#241, state/apamemory layer #243/#244, source front-end #245/#246 и первый relation replay #247/#248. Текущий слой: persistent scoped dictionary + `:` #249. Sequence-deserialization: #242. Persistent L4 backend: #124.

Цель Gate P — собрать **один** production/reference semantic path, после чего опубликовать следующую версию МТС, которую сможет точно потреблять `aprover`.

## 1. Каноническая лестница Foundation v2

```text
binary link ontology
→ distinguished R/O/C/L/U bootstrap
→ exact-occurrence finite link networks
→ root-relative Anum descriptions where defined
→ canonical UTF-8/astring source content
→ exact source occurrence
→ selected exact segmentation
→ scoped D + explicit G/T evidence
→ explicit K/current
→ one trusted interpreter/replay engine
→ actual acts A
→ multistep/proof replay
→ accepted contract
→ aprover
```

Ключевые границы:

```text
source != semantic form
form != theory membership
structure != exact occurrence identity
read/find/replay != materialize
candidate search != trusted replay
```

## 2. Production substrate

Foundation-v2 substrate:

```text
OccurrenceRef
Link(start,end)
LinkNetwork
```

`Link` имеет только два полюса. На нём нет фундаментальных полей:

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

Sharing и cycles являются native конечной структурой. Два occurrences могут иметь одинаковые полюса и всё же оставаться различёнными:

```text
X1 = a ⟼ b
X2 = a ⟼ b
X1 != X2
```

Поэтому shape/isomorphism и physical backend address не определяют semantic identity.

## 3. Source, context и actual act — тоже связи

### 3.1. Source content и occurrence

Lower byte protocol предоставляет exact refs `B(byte)`.

Канонический astring content:

```text
C0 = R
C(n+1) = Cn ⟼ B(byte_n)
```

Конкретное появление исходника:

```text
S = S ⟼ C
```

Поэтому одинаковые bytes могут разделять один canonical `C`, но иметь разные exact source occurrences `S1`, `S2`.

### 3.2. Контекст

```text
P = parent ⟼ current
K = K ⟼ P
↑ = current from exact active K
```

`↑` не является process-global переменной. Trusted act обязан назвать конкретный exact `K`.

### 3.3. Actual act

Минимальный Gate-R bootstrap:

```text
P0 = D_roles ⟼ K_after
H  = I ⟼ P0
A  = A ⟼ H
```

Расширяемые поля:

```text
Field = roleRef ⟼ value
A ⟼ Field
```

`roleRef` разрешается через явный scoped `D_roles`. Host enum может быть API-удобством, но не semantic identity роли.

## 4. Один source front-end

Production-facing source path не доверяет lexer/token/AST classes как смыслу.

```text
raw bytes
→ canonical C
→ exact S
→ untrusted candidate segmentation
→ selected exact source spans
→ visible scoped-D declaration occurrences
→ ordered exact forms
→ explicit G/T admission
→ read-only replay
```

Кандидатный поиск может использовать trie, regex, индексы, longest-match или UI. Trusted replay проверяет **выбранное evidence**, а не алгоритм, который его предложил.

### 4.1. Selected slice

```text
Span = sourcePrefix(start) ⟼ sourcePrefix(end)
SliceEvidence = Span ⟼ sliceContent
Lexeme = S ⟼ SliceEvidence
Resolution = Lexeme ⟼ form
```

Host byte offsets — transport/checker coordinates. Семантическое evidence задаётся exact refs границ, source occurrence и slice content.

UTF-8 `⟼` может быть одним многобайтным selected slice; trusted semantics не обязана дробить его на byte-sized tokens.

### 4.2. Ordered result

```text
SelectedSequence = fold(R, Selection_0 ... Selection_n)
FormSequence     = fold(R, Form_0 ... Form_n)

G ⟼ FormSequence
T ⟼ FormSequence
```

`G/T` membership остаётся отдельным от lexical dictionary semantics. То, что host parser построил какой-то AST, не означает admission формы.

## 5. Один persistent scoped dictionary D

Ранний Gate-P candidate `D ⟼ Entry` оказался недостаточным после интеграции уже принятой семантики `:`. В production path теперь остаётся одна модель — persistent lexical scope snapshots.

### 5.1. Scope snapshot

```text
ScopePayload = parentScope ⟼ localHistory
D = D ⟼ ScopePayload
```

Кандидат пустого root-scope:

```text
D0 = D0 ⟼ (R ⟼ R)
```

Кандидат пустого child-scope:

```text
Child0 = Child0 ⟼ (D_parent ⟼ R)
```

### 5.2. Definition occurrence

Для:

```text
sourceContent : form
```

структура эффекта:

```text
Entry      = sourceContent ⟼ form
Occurrence = D_before ⟼ Entry
H_after    = H_before ⟼ Occurrence
D_after    = D_after ⟼ (sameParentScope ⟼ H_after)
```

Здесь необходимо различать:

```text
Entry
```

как semantic mapping и:

```text
Occurrence
```

как конкретное occurrence объявления в конкретном snapshot.

Два одинаковых объявления могут иметь один mapping, но разные declaration occurrences.

### 5.3. Lookup

Trusted lookup под текущим exact `D` идёт только по явно представленной структуре:

```text
D.localHistory
→ history cells backwards
→ exact Occurrence
→ exact Entry
```

Если локального определения нет:

```text
D.parentScope
→ lookup(parent)
```

Правила:

```text
local first
local mapping shadows parent
local miss falls through to parent
same local source + same form = one mapping, many declaration occurrences allowed
distinct local forms for same source = conflict
no last-write-wins
```

Особенно важно: произвольная связь где-то в сети

```text
D_old ⟼ Entry
```

не становится видимой только потому, что её можно найти глобальным scan. Trusted replay должен доказать достижимость exact declaration occurrence через `localHistory/parentScope` выбранного `D`.

### 5.4. Source resolution использует historical occurrence

Для selected lexeme:

```text
Resolution = Lexeme ⟼ form
Selection  = visibleDefinitionOccurrence ⟼ Resolution
```

`visibleDefinitionOccurrence` может быть создано против более раннего snapshot `D_before`, но оставаться видимым в позднем `D_current`, если exact history chain это доказывает.

Так source front-end и `:` используют **одну и ту же** dictionary semantics.

## 6. Один interpreter/replay engine

После source front-end интерпретатор не строит вторую semantic representation.

Его trusted вход уже состоит из exact evidence.

### 6.1. Relation-resolution act

Первый vertical slice:

```text
exact source evidence
→ one selected partial form F
→ exact K/current
→ binding = ↑
→ structural pole resolution
→ exact result X
→ persistent K_after
→ actual A
```

Если:

```text
F = F ⟼ e
```

то:

```text
X = current ⟼ e
```

Если:

```text
F = b ⟼ F
```

то:

```text
X = b ⟼ current
```

Направление выводится из exact structural form, а не из `TokenKind`, glyph switch или AST opcode.

### 6.2. Exact result

Если память содержит:

```text
X1 = a ⟼ b
X2 = a ⟼ b
```

act может выбрать `X2`. Replay проверяет:

```text
poles(X2) = (a,b)
K_after.current = X2
A.result = X2
```

и не схлопывает `X1/X2` по форме пары.

### 6.3. Persistent `:` — тот же engine

Gate #249 добавляет `:` не отдельным DefinitionInterpreter, а вторым replay act того же engine.

Replay `:` проверяет уже присутствующее evidence:

```text
D_before
source occurrence S
sourceContent
form
Entry
Occurrence
H_before
H_after
D_after
actual A
```

Он обязан подтвердить:

```text
S = S ⟼ sourceContent
Entry = sourceContent ⟼ form
Occurrence = D_before ⟼ Entry
H_after = H_before ⟼ Occurrence
parent(D_after) = parent(D_before)
history(D_after) = H_after
```

а затем проверить, что новый exact `Occurrence` видим из `D_after`, но не стал ретроактивно видимым из immutable `D_before`.

При этом:

```text
: != =
: != theorem assertion
: != recursive RHS evaluation
```

И replay остаётся read-only: он не создаёт `Entry`, `Occurrence`, history или `D_after`; он проверяет candidate effect network.

## 7. Апамять как controller сети

Подробно: [Апамять и управление сетью связей](Апамять%20и%20управление%20сетью%20связей.md).

Ключевой operational split:

```text
read / find / enumerate / replay
        │
        └── наблюдают существующую сеть

materialize / delete
        │
        └── явные effects
```

Это не мелкая backend-деталь, а необходимая семантическая граница.

Если описание искомой связи автоматически создаёт эту связь, запрос существования становится бессмысленным.

Поэтому:

```text
source carrier != result network
query description != queried fact
replay evidence != application effect
```

### 7.1. Простой пример

До:

```text
a       b

нет exact occurrence a ⟼ b
```

`find(a,b)`:

```text
→ {}
```

и сеть остаётся той же.

Только explicit effect:

```text
x = materialize(a,b)
```

даёт:

```text
a ─────x─────▶ b
```

### 7.2. Почему это важно для `:`

Запись/описание:

```text
name : form
```

сама по себе не обязана менять dictionary state. Executor может построить candidate effect network, а trusted replay отдельно проверит:

```text
D_before → history append → D_after
```

Так semantic effect становится проверяемым объектом, а не скрытой мутацией host map.

## 8. Ачисло и будущая sequence deserialization

Recursive Anum уже является root-relative structural description на принятой occurrence-tree области, но это ещё не полная operational semantics произвольной последовательности.

Отдельный gate #242 проверит более широкий исторический принцип:

```text
∞ A B C
```

как последовательностное описание, которое после **явной** десериализации/materialization может построить:

```text
A ⟼ B
B ⟼ C
```

с корректной nested-context semantics.

Не смешиваем:

```text
source front-end
    read/resolve source evidence

interpreter replay
    validate selected semantic act

Anum→апамять
    explicit result-network materialization
```

Поэтому текущий Gate P не превращает `[`/`]` в безусловные host PUSH/POP opcodes и не расширяет pair-only recursive grammar одной красивой картинкой.

## 9. Следующий слой: local `=`

После закрытия #249 следующий semantic gate должен интегрировать уже принятое решение #225 **в этот же engine**.

Минимальная equality semantics:

```text
K ⟼ (member ⟼ representative)
rep_K(x) = one explicit local representative, else x
Equal_K(a,b) iff rep_K(a) and rep_K(b) are the same exact ref
```

Без автоматических:

```text
transitivity
substitution
congruence
global rewriting
shape equality
```

Relation decomposition допустима только как отдельно admitted one-step theory rule.

## 10. Что должна получить следующая версия для aprover

`aprover` должен потреблять published versioned contract + conformance corpus, а не заново определять МТС.

Trusted checker path:

```text
exact source/evidence
→ scoped D resolution + G/T admission
→ exact active K
→ selected form/bindings
→ selected act semantics
→ exact result/state transition
→ actual A
→ deterministic read-only replay
```

Proof search, ranking, индексы и UI могут быть эвристическими. Доверенная часть проверяет выбранные exact relations.

## 11. Что ещё блокирует release

```text
scoped D + `:` #249
→ local `=` in same engine
→ multistep/proof integration
→ sequence-to-apamemory #242
→ persistent L4 boundary #124
→ historical compatibility classification
→ integrated end-to-end conformance
→ explicit acceptance decision
→ atomic production cutover
→ publish next MTS version
→ repin aprover
```

Запрещён итоговый режим:

```text
legacy semantics + Foundation-v2 semantics selectable by flag
```

После acceptance активный production tree должен иметь один canonical semantic path. Историю сохраняет Git.
