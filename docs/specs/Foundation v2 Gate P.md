# Foundation v2 — Gate P candidate

Статус: **production/reference candidate**, не accepted release.

Главный epic: #237. Завершены exact-occurrence substrate #240/#241 и state/apamemory layer #243/#244. Текущий слой: source front-end #245. Sequence-deserialization: #242. Persistent L4 backend: #124.

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

## 5. Апамять

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

## 6. Ачисло и будущая sequence deserialization

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

Важно не смешивать #245 и #242:

```text
#245 source front-end
    читает/разрешает/проверяет source evidence
    без application effects

#242 Anum→апамять
    исследует явный materialization результирующей сети
```

## 7. Что должна получить следующая версия для aprover

`aprover` должен потреблять опубликованный versioned contract и conformance corpus, а не повторно определять семантику МТС.

Минимальная trusted цепочка будущего checker-а:

```text
exact source/evidence
→ selected dictionary/grammar/theory relations
→ exact active K
→ selected declarative form + bindings
→ actual act A
→ exact result / K_after
→ deterministic read-only replay
```

Proof search, ranking и UI могут быть сложными и эвристическими. Валидность доказательства определяется replay выбранных exact relations.

## 8. Что ещё блокирует release

До repin `aprover` остаются как минимум:

```text
source front-end #245
→ one interpreter/replay engine
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
