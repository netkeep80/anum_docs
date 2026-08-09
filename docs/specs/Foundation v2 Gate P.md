# Foundation v2 — Gate P candidate

Статус: **production/reference candidate**, не accepted release.

Главный epic: #237. Текущий слой: #243. Sequence-deserialization: #242. Persistent L4 backend: #124.

Цель Gate P — превратить завершённые research-решения Foundation v2 в **один** reference/production path, после чего опубликовать следующую версию МТС, которую сможет точно потреблять `aprover`.

## 1. Что уже считается обязательным направлением

Новая версия должна строиться снизу вверх:

```text
binary link ontology
→ distinguished R/O/C/L/U bootstrap
→ exact-occurrence finite link networks
→ root-relative Anum structural descriptions where defined
→ canonical UTF-8/astring source carrier
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

Текущий Gate P state-layer проверяет следующие формы.

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

## 4. Апамять

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

## 5. Ачисло и будущая sequence deserialization

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

## 6. Что должна получить следующая версия для aprover

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

## 7. Что ещё блокирует release

До repin `aprover` остаются как минимум:

```text
current state layer #243
→ one source front-end over explicit D/G/T
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
