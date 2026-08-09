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

Текущий единственный L4/release gate:

```text
#265 persistent exact-occurrence апамять
```

Historical #124 закрыт как superseded для Foundation v2: его pair uniqueness/idempotent realize semantics относится к старому v0.3 challenge и противоречит exact-occurrence multiplicity.

После #265 release chain:

```text
historical compatibility classification
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

`core/exact_link_network.py` поддерживает additive immutable evolution: новое runtime state сохраняет те же exact refs старых occurrences и append-ит новые occurrences без изменения `before`.

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

Replay не ищет candidate, не выбирает Rule, не доверяет shape equality и не materialize-ит отсутствующие links.

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

Не встроены global substitution, congruence, transitive alias closure, recursive decomposition или union-find semantics.

---

# 7. Actual acts и Run

`I` и конкретный `A` различаются.

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

Первый proof-rule candidate существует только через:

```text
T ⟼ Rule
```

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
materialize / define / persist transition
```

Главный инвариант:

```text
find / replay != materialize
```

Индексы и эвристики могут быть backend-specific и недоверенными; semantic acceptance определяется exact evidence.

Подробнее: [Апамять и управление сетью связей](Апамять%20и%20управление%20сетью%20связей.md).

---

# 10. #242/#264 — sequence materialization

Foundation-v2 candidate определяет explicit sequence effect:

```text
∞ A B C
→ create new exact A⟼B
→ create new exact B⟼C
```

Root `∞` — sentinel и не участвует в adjacency.

Nested group:

```text
[A]   → exact A
[A B] → X = A ⟼ B, return exact X
```

Полный пример:

```text
∞[window][cursor][position][[[x][int]][point]]
```

даёт nested-first relations:

```text
XI = X ⟼ I
Q  = XI ⟼ Point
WC = Window ⟼ Cursor
CP = Cursor ⟼ Position
PQ = Position ⟼ Q
```

Каждая adjacency создаёт **новый exact occurrence**. Historical `AnumMemory.intern_link` не наследуется.

Подробнее: [Ачисла и сериализация](Ачисла%20и%20сериализация.md).

---

# 11. Почему historical L4 #124 superseded

Старый v0.3 challenge требовал:

```text
exact pair uniqueness
idempotent realize_link(A,B)
```

Foundation v2 требует:

```text
P1 = materialize(A,B)
P2 = materialize(A,B)
P1 ≠ P2
```

Поэтому #124 нельзя использовать как production backend contract следующей версии без semantic fork.

Его contracts/tests остаются historical evidence, а новый L4 выводится отдельно в #265.

---

# 12. Persistent identity #265

Foundation v2 L4 различает:

```text
runtime OccurrenceRef
persistent dataset-local logical occurrence id
portable snapshot-local slot
backend physical address / record id
```

Reference logical id:

```text
PersistentOccurrenceId(lineage, local)
```

Reopen того же dataset сохраняет `lineage/local`, но runtime refs могут быть новыми host objects.

Fresh import той же topology создаёт новый lineage:

```text
same topology != same persistent exact identity
```

Physical address никогда не является MTS identity.

---

# 13. Persistent effect semantics

Persistent controller предоставляет read-only:

```text
poles
find
outgoing
incoming
all_occurrences
snapshot
```

и explicit effects:

```text
materialize
materialize_batch
```

`materialize(A,B)` всегда создаёт новый exact persistent occurrence.

`materialize_batch` сначала выделяет logical ids всей партии, поэтому может представить self/mutual cycles через `BatchRef`, затем atomically публикует весь state.

Наблюдаемая atomicity:

```text
либо весь post-state
либо исходный pre-state
```

---

# 14. Persistence vectors

Gate #265 требует пережить clean reopen без semantic collapse:

```text
duplicate A⟼B occurrences
self-cycle
mutual cycle
sharing
root logical identity
sequence materialization evidence
```

При этом:

```text
find remains read-only
runtime refs may be reconstructed
snapshot slot is not global identity
physical address is not semantic identity
```

Reference executable backend: `core/foundation_v2_persistent.py`.

Machine contract: `contracts/mts-foundation-v2-persistent-l4-v0.7.json`.

Подробнее: [Foundation v2 Persistent L4](Foundation%20v2%20Persistent%20L4.md).

---

# 15. Sequence replay после reopen

Persistent L4 не копирует Anum grammar.

```text
persistent store
→ reconstruct runtime exact network
→ foundation_v2_materialization.py
→ normalize created edges to persistent ids
→ atomic persistent batch
```

После reopen persistent evidence снова реконструирует runtime before/after lineage и вызывает тот же `replay_sequence_materialization`.

Storage layer не становится вторым sequence interpreter.

---

# 16. JSON reference backend boundary

`JsonExactLinkStore` — executable persistence evidence, а не нормативный storage format.

Production implementation может быть:

```text
PersistMemoryManager adapter
custom mmap store
transactional DB
another exact-link backend
```

если observable semantics совпадает.

Правильная зависимость:

```text
Foundation-v2 L4 contract
        ↑ implemented by
backend adapter
```

а не наоборот.

---

# 17. Historical compatibility

Accepted v0.2–v0.5 остаются reproducible historical contracts.

В частности:

```text
mtc_parser / typed AST / ContextFrame
historical root program
recursive Anum v0.2
historical AnumMemory pair interning
historical L4 v0.3 pair-unique challenge
```

не удаляются задним числом.

Но production cutover не должен оставить два равноправных semantic cores. Каждый legacy consumer должен быть migrated, preserved as historical-only, либо removed from production path.

---

# 18. Acceptance criterion

Следующая версия МТС принимается только как одна интегрированная система:

```text
exact occurrence network
+ source/D/G/T/K/A
+ relation/:/=
+ proof/Run/checker
+ sequence materialization
+ persistent exact-occurrence L4
+ cutover
+ versioned conformance
```

После закрытия #265 следующий фокус — **compatibility classification и atomic cutover**, а не новый параллельный semantic subsystem.

До explicit acceptance все Foundation-v2 contracts остаются candidate evidence, а `aprover` не repin-ится.
