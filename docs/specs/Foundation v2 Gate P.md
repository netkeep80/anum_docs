# Foundation v2 — Gate P

Статус: **production/reference candidate**, не accepted release.

Главный epic: #237.

Цель Gate P — собрать **один** link-only production/reference semantic path и только затем опубликовать следующую accepted версию МТС для `aprover` и других downstream consumers.

---

# 1. Текущая лестница Gate P

Завершённые semantic/docs gates:

```text
P0  production semantic surface audit          #238/#239
P1  exact-occurrence binary-link substrate     #240/#241
P2  explicit K / D / G / T / I / A             #243/#244
P3  canonical source front-end                 #245/#246
P4  relation interpreter/replay                #247/#248
P5  persistent scoped D + `:`                  #249/#250
P6  local representative `=`                   #251/#252
P7  exact multistep Run                        #253/#254
P8  separately T-admitted proof rule           #255/#256
P9  integrated source→proof→Run checker        #257/#262
Docs current MTS surface                       #261/#263
Anum sequence → апамять materialization        #242/#264
```

После merge #264 semantic candidate #242 считается завершённым Gate-P evidence. Текущий следующий release blocker:

```text
#124  persistent L4/backend contract
```

Остаток release chain:

```text
#124 persistent L4/backend
→ historical compatibility classification
→ atomic production cutover / old semantic-path deletion
→ versioned integrated conformance corpus
→ explicit Foundation-v2 acceptance
→ published next MTS version
→ aprover repin
```

---

# 2. Базовый substrate

Примитив:

```text
Link(start, end)
```

Identity принадлежит exact occurrence, а не паре полюсов:

```text
P1 = A ⟼ B
P2 = A ⟼ B
P1 ≠ P2
```

Допускаются:

```text
duplicate pairs
self-cycles
mutual cycles
sharing
```

Не являются semantic identity:

```text
graph isomorphism
pair interning
AST path
source spelling
snapshot slot
physical backend address
```

`core/exact_link_network.py` теперь также поддерживает **additive persistent evolution**: новое immutable state может сохранять те же exact refs старых occurrences и append-ить новые occurrences без изменения `before`.

---

# 3. Explicit state и source

Foundation v2 выражает обычными связями:

```text
K  context
D  scoped dictionary
G  grammar admission
T  theory admission
I  interpreter
A  actual act
```

Source path:

```text
UTF-8
→ canonical content C
→ exact source occurrence S
→ selected segmentation
→ scoped D
→ G/T admission
→ exact form
```

Token/AST class не является semantic authority.

---

# 4. Trusted replay

Основное разделение:

```text
untrusted search / ranking / execution planning
             ↓ selected exact evidence
trusted deterministic replay
             ↓
accept / reject
```

Replay:

- не ищет candidate;
- не выбирает rule;
- не materialize-ит отсутствующие links;
- не доверяет shape equality;
- не зависит от legacy parser/proof checker.

---

# 5. Persistent K и D

Context:

```text
P = parent ⟼ current
K = K ⟼ P
```

Dictionary:

```text
D = D ⟼ (parentScope ⟼ localHistory)
```

Definition effect:

```text
Entry      = sourceContent ⟼ form
Occurrence = D_before ⟼ Entry
H_after    = H_before ⟼ Occurrence
D_after    = D_after ⟼ (sameParent ⟼ H_after)
```

Старые `K`/`D` не мутируют.

---

# 6. `:` и `=`

`:` — explicit persistent dictionary effect.

`=` — local one-hop representative constraint:

```text
K ⟼ (member ⟼ representative)
```

```text
Equal_K(a,b)
⇔ rep_K(a) is rep_K(b)
```

Не встроены:

```text
global substitution
congruence
transitive alias closure
recursive decomposition
union-find semantics
```

---

# 7. Actual acts и Run

`I` и конкретный `A` различаются.

Последовательность acts:

```text
Run_0     = R
Run_(i+1) = Run_i ⟼ A_i
```

Exact continuity:

```text
A_i.after is A_(i+1).before
```

Run фиксирует order/provenance, но не создаёт логическую транзитивность.

---

# 8. Proof rule и integrated checker

Первый proof-rule candidate существует только через admission:

```text
T ⟼ Rule
```

и одношагово decomposes истинное local equality завершённых links.

Integrated P9 artifact:

```text
source `decompose`
→ scoped D / G / T
→ exact Rule
→ true equality A_eq in exact K
→ direct T ⟼ Rule
→ A_rule
→ Run[A_eq, A_rule]
→ read-only trusted replay
```

Production-facing modules:

```text
core/foundation_v2_proof.py
core/foundation_v2_checker.py
```

---

# 9. Апамять как controller

Foundation v2 operationally разделяет:

```text
READ SIDE
read / find / enumerate / resolve / replay

EFFECT SIDE
materialize / define / delete / persist transition
```

Главный инвариант:

```text
find / replay != materialize
```

Индексы и эвристики могут быть backend-specific и недоверенными; semantic acceptance определяется exact evidence.

Подробнее: [Апамять и управление сетью связей](Апамять%20и%20управление%20сетью%20связей.md).

---

# 10. #242 — sequence materialization

Исторический Anum raw/source carrier может хранить элементы будущей связи **несвязанными**.

Например:

```text
carrier(∞ a b)
```

не обязан содержать:

```text
a ⟼ b
```

Foundation-v2 candidate определяет sequence effect:

```text
∞ A B C
→ create new exact A⟼B
→ create new exact B⟼C
```

Root `∞` — sentinel и не участвует в adjacency.

Nested group:

```text
[A B]
→ X = A ⟼ B
→ return exact X as one outer value
```

Поэтому:

```text
∞ [A B] C
→ X = A ⟼ B
→ Y = X ⟼ C
```

Singleton:

```text
[A] → exact A
```

без нового link.

Полный пример:

```text
∞[window][cursor][position][[[x][int]][point]]
```

даёт nested-first candidate relations:

```text
XI = X ⟼ I
Q  = XI ⟼ Point
WC = Window ⟼ Cursor
CP = Cursor ⟼ Position
PQ = Position ⟼ Q
```

#242 после merge #264 больше не является открытым semantic gap: sequence materialization имеет executable contract, tests и replay boundary. Он остаётся candidate частью будущей Foundation v2 до общего acceptance.

---

# 11. Materialization identity policy

#242 не использует historical `AnumMemory.intern_link`.

Каждая adjacency materialization создаёт **новый exact occurrence**:

```text
old = A ⟼ B
new = A ⟼ B
old ≠ new
```

Если executor хочет reuse, это должно быть отдельным explicit planning decision; pair equality сама по себе reuse не разрешает.

Persistent before/after lineage:

```text
before
→ explicit effect
→ after
```

сохраняет exact identity старых refs и immutable old links.

Independent snapshot reload по-прежнему создаёт fresh runtime identity scope.

---

# 12. Sequence replay boundary

Production-facing candidate:

```text
core/foundation_v2_materialization.py
```

Machine contract:

```text
contracts/mts-anum-sequence-materialization-v0.7.json
```

Trusted replay проверяет:

```text
exact root
base identity preserved
old links unchanged
exact created count/order
nested adjacency poles
exact result
no extra links
before/after snapshots unchanged during replay
```

Read-only `find_links` отдельно доказывает отсутствие hidden materialization.

Подробнее: [Ачисла и сериализация](Ачисла%20и%20сериализация.md).

---

# 13. Persistent L4 gap #124

Текущий следующий Gate-P blocker — доказать те же свойства на persistent backend:

```text
multiplicity
cycles
sharing
persistent state transitions
read-only find/replay
explicit materialization
portable evidence
backend address != semantic identity
```

In-memory same-lineage `OccurrenceRef` не должен превращаться в universal persistent identity.

---

# 14. Historical compatibility

Accepted v0.2–v0.5 остаются reproducible historical contracts.

В частности:

```text
mtc_parser / typed AST / ContextFrame
historical root program
recursive Anum v0.2
historical AnumMemory pair interning
```

не удаляются задним числом.

Но production cutover не должен оставить два равноправных semantic cores. Каждый legacy consumer должен быть migrated, preserved as historical-only, либо removed from production path.

---

# 15. Acceptance criterion

Следующая версия МТС принимается только как одна интегрированная система:

```text
exact occurrence network
+ source/D/G/T/K/A
+ relation/:/=
+ proof/Run/checker
+ sequence materialization
+ persistent L4
+ cutover
+ versioned conformance
```

До explicit acceptance все Foundation-v2 contracts остаются candidate evidence, а `aprover` не repin-ится.
