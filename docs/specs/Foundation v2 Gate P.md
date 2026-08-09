# Foundation v2 — Gate P candidate

Статус: **production/reference candidate**, не accepted release.

Главный epic: #237. Завершены exact-occurrence substrate #240/#241, state/apamemory #243/#244, source front-end #245/#246, relation replay #247/#248 и persistent scoped `D` + `:` #249/#250. Текущий слой: local exact representative `=` #251. Sequence-deserialization: #242. Persistent L4 backend: #124.

Цель Gate P — собрать **один** production/reference semantic path, затем опубликовать следующую версию МТС, которую сможет точно потреблять `aprover`.

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
→ relation / : / = acts
→ exact multistep/proof replay
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
local equality != global rewrite system
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

Sharing и cycles — native конечная структура. Два occurrences могут иметь одинаковые полюса и всё же оставаться различёнными:

```text
X1 = a ⟼ b
X2 = a ⟼ b
X1 != X2
```

Shape/isomorphism и physical backend address не определяют semantic identity.

## 3. Source, context и actual act — тоже связи

### 3.1. Source content и occurrence

Lower byte protocol предоставляет exact refs `B(byte)`.

```text
C0 = R
C(n+1) = Cn ⟼ B(byte_n)

S = S ⟼ C
```

Одинаковые bytes могут разделять canonical `C`, но иметь разные exact source occurrences `S1`, `S2`.

### 3.2. Контекст

```text
P = parent ⟼ current
K = K ⟼ P
↑ = current from exact active K
```

`↑` не process-global variable. Trusted act обязан назвать exact `K`.

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

`roleRef` разрешается через explicit scoped `D_roles`. Host field name — checker API, не semantic identity.

## 4. Один source front-end

Production source path не доверяет lexer/token/AST classes как смыслу:

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

Candidate search может использовать trie, regex, indices, longest-match или UI. Trusted replay проверяет **selected evidence**.

Selected slice:

```text
Span = sourcePrefix(start) ⟼ sourcePrefix(end)
SliceEvidence = Span ⟼ sliceContent
Lexeme = S ⟼ SliceEvidence
Resolution = Lexeme ⟼ form
Selection = visibleDefinitionOccurrence ⟼ Resolution
```

UTF-8 `⟼` может быть одним многобайтным slice. Host byte offsets остаются transport/checker coordinates.

Порядок:

```text
SelectedSequence = fold(R, Selection_0 ... Selection_n)
FormSequence     = fold(R, Form_0 ... Form_n)

G ⟼ FormSequence
T ⟼ FormSequence
```

## 5. Один persistent scoped dictionary D

Production path использует только persistent lexical scope snapshots:

```text
ScopePayload = parentScope ⟼ localHistory
D = D ⟼ ScopePayload
```

Definition effect:

```text
Entry      = sourceContent ⟼ form
Occurrence = D_before ⟼ Entry
H_after    = H_before ⟼ Occurrence
D_after    = D_after ⟼ (sameParentScope ⟼ H_after)
```

Нужно различать `Entry` как mapping и `Occurrence` как конкретное declaration occurrence.

Lookup:

```text
D.localHistory
→ history cells backwards
→ exact Occurrence
→ exact Entry
```

Если локального mapping нет — explicit parent scope.

Правила:

```text
local first
local mapping shadows parent
local miss falls through to parent
same local source + same form = one mapping, many declaration occurrences allowed
distinct local forms for same source = conflict
no last-write-wins
```

Произвольное `D_old ⟼ Entry` где-то в сети не считается видимым без exact history/parent path.

## 6. Один interpreter/replay engine

После source front-end интерпретатор не строит вторую semantic representation. Его trusted input уже состоит из exact evidence.

### 6.1. Relation-resolution act

```text
exact source evidence
→ selected partial form F
→ exact K/current
→ binding = ↑
→ structural pole resolution
→ exact result X
→ persistent K_after
→ actual A
```

Для:

```text
F = F ⟼ e
```

получаем:

```text
X = current ⟼ e
```

Для:

```text
F = b ⟼ F
```

получаем:

```text
X = b ⟼ current
```

Направление выводится из exact structural form, не из glyph/AST/opcode.

### 6.2. Exact result

Если:

```text
X1 = a ⟼ b
X2 = a ⟼ b
```

act может выбрать `X2`. Replay проверяет exact `X2` через poles, `K_after.current` и `A.result`; pair uniqueness не предполагается.

### 6.3. Persistent `:` — тот же engine

`:` replay проверяет уже присутствующую candidate effect network:

```text
S = S ⟼ sourceContent
Entry = sourceContent ⟼ form
Occurrence = D_before ⟼ Entry
H_after = H_before ⟼ Occurrence
parent(D_after) = parent(D_before)
history(D_after) = H_after
```

Новый occurrence должен быть видим из `D_after`, но не ретроактивно из immutable `D_before`.

```text
: != =
: != theorem assertion
: != recursive RHS evaluation
```

Replay не materialize-ит Entry/history/D_after — он их проверяет.

## 7. Local exact representative `=` — тот же engine

Gate #251 интегрирует `=` как **локальное отношение внутри exact K**, а не как глобальное свойство всей асети.

Context topology сохраняется:

```text
K = K ⟼ (parent ⟼ current)
```

Дополнительный local representative constraint:

```text
Pair    = member ⟼ representative
Binding = K ⟼ Pair
```

Важно: сам exact occurrence `K` является context topology и не считается equality binding, хотя его `start` тоже равен `K`.

### 7.1. One-hop representative

```text
rep_K(x) = explicit local representative, если mapping однозначен
         = x, если mapping отсутствует
```

И:

```text
Equal_K(a,b)
iff
rep_K(a) and rep_K(b) are the same exact occurrence
```

Никакого recursive alias chasing.

Если:

```text
K: a → b
K: b → c
```

то:

```text
rep_K(a) = b
rep_K(b) = c
```

следовательно `Equal_K(a,b)` в таком состоянии **false**. Автоматическое транзитивное замыкание не выполняется.

### 7.2. Duplicate и conflict

Повторные exact bindings:

```text
K: a → r
K: a → r
```

могут существовать как два occurrence provenance, но mapping остаётся однозначным:

```text
rep_K(a) = r
```

Если же:

```text
K: a → r1
K: a → r2
r1 != r2
```

lookup/replay отклоняется как local representative conflict. Last-write-wins отсутствует.

### 7.3. Shape не создаёт equality

Пусть:

```text
X1 = X1 ⟼ X1
X2 = X2 ⟼ X2
X1 != X2
```

Без local representative evidence:

```text
rep_K(X1) = X1
rep_K(X2) = X2
Equal_K(X1,X2) = false
```

То есть другой self-cycle не становится `∞` и две одинаковые формы не становятся равными только по graph isomorphism.

### 7.4. Equality evaluation является actual act

Результат проверки не должен существовать только как временный host boolean.

Actual `A` фиксирует exact evidence ролей:

```text
context
left
right
left-representative
right-representative
```

Host API может вернуть `true/false` для удобства, но доверенная семантика — это replay exact `K`, exact representative bindings и actual `A`.

И equal, и non-equal evaluation являются допустимыми actual acts.

### 7.5. Чего `=` намеренно не делает

Нет автоматических:

```text
transitivity
substitution
congruence
global rewriting
recursive rewriting
shape/isomorphism equality
bisimulation equality
```

Relation decomposition:

```text
(a⟼b) = (c⟼d)
→ a=c, b=d
```

**не встроена в equality core**. Она допустима только как отдельно admitted one-step rule через `T` в последующем proof/inference gate и не запускается рекурсивно сама собой.

## 8. Апамять как controller сети

Подробно: [Апамять и управление сетью связей](Апамять%20и%20управление%20сетью%20связей.md).

Operational split:

```text
read / find / enumerate / replay
        │
        └── наблюдают существующую сеть

materialize / delete
        │
        └── явные effects
```

Поэтому:

```text
source carrier != result network
query description != queried fact
replay evidence != application effect
```

И local equality даёт ещё один прикладной пример: «равенство» не вычисляется скрытым comparator по всей памяти, а является explicit context-local relation, которую можно хранить, искать и replay-ить как часть сети.

## 9. Ачисло и будущая sequence deserialization

Recursive Anum уже является root-relative structural description на occurrence-tree области, но это не полная operational semantics произвольной последовательности.

Отдельный gate #242 проверит исторический принцип:

```text
∞ A B C
```

как последовательностное описание, которое после **явной** materialization может построить:

```text
A ⟼ B
B ⟼ C
```

с nested-context semantics.

Не смешиваем:

```text
source front-end     = read/resolve source evidence
interpreter replay   = validate selected semantic act
Anum→апамять         = explicit result-network materialization
```

## 10. Что должна получить следующая версия для aprover

`aprover` должен потреблять published versioned contract + conformance corpus, а не заново определять МТС.

Trusted checker path:

```text
exact source/evidence
→ scoped D resolution + G/T admission
→ exact K/current/local representatives
→ selected act semantics
→ exact result/state transition
→ actual A
→ exact multistep adjacency
→ deterministic read-only replay
```

Proof search, ranking, indices и UI могут быть эвристическими. Доверенная часть проверяет selected exact relations.

## 11. Следующий слой после #251

После local `=` следующий gate должен быть не ещё одним оператором, а **multistep/proof integration** над уже существующими actual acts.

Нужно переиспользовать принятое exact-adjacency направление #230/#227 и затем отдельно admitted theory rules. Это будет непосредственный мост к новой версии МТС для `aprover`.

## 12. Что ещё блокирует release

```text
local `=` #251
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
