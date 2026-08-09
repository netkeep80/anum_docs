# Foundation v2 — persistent L4 апамять

Статус: **Gate P candidate**, не accepted production backend contract.

Текущий gate: #265. Parent: #237. Historical predecessor: закрытый/superseded #124.

Machine contract candidate:

[`contracts/mts-foundation-v2-persistent-l4-v0.7.json`](../../contracts/mts-foundation-v2-persistent-l4-v0.7.json)

Reference implementation:

[`core/foundation_v2_persistent.py`](../../core/foundation_v2_persistent.py)

---

# 1. Зачем L4 пришлось вывести заново

Historical v0.3 L4 challenge был построен вокруг старой `AnumMemory` semantics:

```text
одна exact pair → один canonical LinkRef
realize_link(A,B) идемпотентен
```

Foundation v2 уже зафиксировала другой фундаментальный инвариант:

```text
P1 = A ⟼ B
P2 = A ⟼ B
P1 ≠ P2
```

И sequence materialization #242/#264 намеренно создаёт **новый exact occurrence на каждую adjacency**.

Следовательно persistent backend не имеет права снова схлопнуть occurrences только ради удобства индекса.

Поэтому historical `mts-l4-backend-*/v0.3` сохраняются как воспроизводимое исследование старой линии, но не являются Foundation-v2 L4 contract.

---

# 2. Что должен сохранять persistent controller

После clean close/reopen должны сохраняться:

```text
multiplicity
ordered poles
cycles
sharing
root selection
persistent sequence effects
logical occurrence identity внутри dataset lineage
```

При этом не обязаны сохраняться как семантика:

```text
Python object identity
RAM address
mmap pointer
PMM block address
JSON byte offset
snapshot slot как глобальное имя
```

---

# 3. Четыре уровня identity

Foundation v2 L4 различает как минимум:

```text
1. runtime OccurrenceRef
2. persistent dataset-local logical occurrence id
3. portable snapshot-local slot
4. backend physical address / record id
```

## Runtime `OccurrenceRef`

Живёт внутри одного reconstructed runtime lineage.

После reopen runtime refs могут быть совершенно новыми host objects.

## Persistent logical id

Стабилен внутри одного persistent dataset.

Reference notation:

```text
PersistentOccurrenceId(lineage, local)
```

Это не физический адрес.

## Snapshot slot

Удобен для транспортной topology, но не является universal identity.

## Physical address

Полностью backend-specific.

PMM, SQLite, mmap, B-tree или другой backend могут менять физическое расположение без изменения логической exact occurrence.

---

# 4. Dataset lineage

Persistent identity имеет область действия.

Пусть store имеет:

```text
lineage = L1
```

Occurrence:

```text
(L1, 42)
```

сохраняет logical identity после reopen **этого же dataset**.

Но если ту же topology импортировать как новый независимый dataset:

```text
lineage = L2
```

то:

```text
(L1, 42) != (L2, 42)
```

даже если их полюса и вся окружающая topology совпадают.

Это persistent-аналог уже принятого правила:

```text
same shape != same exact occurrence
```

---

# 5. Reopen не обязан сохранять runtime object identity

До закрытия:

```text
persistent (L1,42) ↔ runtime ref r_old
```

После reopen:

```text
persistent (L1,42) ↔ runtime ref r_new
```

и:

```text
r_old is not r_new
```

Но оба runtime refs нормализуются к одному persistent occurrence id внутри той же lineage.

Это позволяет backend-у свободно перестраивать in-memory representations.

---

# 6. Read side

Минимальный persistent controller предоставляет:

```text
poles(id)
find(start?, end?)
outgoing(start)
incoming(end)
all_occurrences()
snapshot()
```

Все эти операции read-only.

Если `A⟼B` отсутствует:

```text
find(A,B) -> ()
```

Store не меняется.

Если существуют два occurrences:

```text
P1 = A ⟼ B
P2 = A ⟼ B
```

то:

```text
find(A,B) -> (P1,P2)
```

Оба должны пережить reopen.

---

# 7. Effect side

Canonical operation Foundation v2:

```text
materialize(A,B) -> NEW exact occurrence
```

Даже если `A⟼B` уже существует.

То есть:

```text
P1 = materialize(A,B)
P2 = materialize(A,B)

P1 != P2
```

Индекс `(A,B)` ускоряет поиск, но **не превращается в interning table**.

Если application planner хочет reuse `P1`, он должен явно выбрать `P1` через read/search path и предъявить это решение как evidence.

---

# 8. Atomic batch materialization

Для циклов недостаточно последовательного API, где новый ref можно использовать только после commit.

Поэтому L4 candidate имеет batch-local refs:

```text
BatchRef(0)
BatchRef(1)
...
```

Пример self-cycle:

```text
batch[0] = BatchRef(0) ⟼ BatchRef(0)
```

Пример mutual cycle:

```text
A = BatchRef(1) ⟼ X
B = BatchRef(0) ⟼ Y
```

Сначала batch выделяет logical ids всех новых occurrences, затем валидирует все endpoints, затем atomically публикует весь новый state.

Никакой половинчатой сети быть не должно.

---

# 9. Atomicity

Наблюдаемая гарантия:

```text
commit(batch)
→ либо весь post-state
→ либо исходный pre-state
```

Invalid endpoint, unresolved batch ref или commit failure не должны менять ни in-memory observable state, ни persistent committed state.

Reference JSON backend использует temporary file + `os.replace` только как простой способ доказать эту границу.

Сам JSON format **не нормативен**.

Production backend может использовать transaction, WAL, copy-on-write pages или PMM-specific transaction mechanism.

---

# 10. Cycles

Persistent store обязан поддерживать self-cycle:

```text
R = R ⟼ R
```

и mutual cycle:

```text
A = B ⟼ X
B = A ⟼ Y
```

После reopen logical IDs `A/B/X/Y` должны ссылаться на те же logical occurrences внутри dataset lineage.

Никакого recursive unfolding для persistence не требуется.

---

# 11. Sharing

Пусть:

```text
P = A ⟼ X
Q = B ⟼ X
```

После reopen оба конца должны ссылаться на **один logical X**, а не на две structural copies.

Это ещё одна причина, почему persistent L4 нельзя свести к tree serializer.

---

# 12. Связь с #242 sequence materialization

#242 уже определяет runtime effect:

```text
∞ A B C
→ new A⟼B
→ new B⟼C
```

Persistent bridge не переопределяет nesting semantics.

Правильная цепочка:

```text
persistent store
→ reconstruct runtime exact network
→ existing foundation_v2_materialization.py
→ runtime SequenceMaterialization evidence
→ normalize new endpoints to persistent ids / BatchRefs
→ one persistent materialize_batch
→ PersistentSequenceMaterialization evidence
```

То есть L4 **делегирует** structural semantics уже принятому Gate-P layer вместо копирования Anum grammar в backend.

---

# 13. Replay sequence effect после reopen

Persistent evidence хранит:

```text
persistent sequence description
before_count
created persistent occurrences + poles
result persistent occurrence
```

После reopen controller может:

1. восстановить runtime `before` prefix;
2. создать runtime `after` в той же fresh runtime lineage;
3. сопоставить persistent IDs новым runtime refs;
4. восстановить runtime `SequenceMaterialization` evidence;
5. вызвать обычный `replay_sequence_materialization`;
6. проверить persistent poles;
7. убедиться, что store не изменился.

Таким образом доказательство effect не зависит от сохранения старых Python objects.

---

# 14. Полный пример с ачислом

Пусть persistent store содержит exact occurrences:

```text
Window
Cursor
Position
X
Int
Point
```

Selected sequence:

```text
∞[window][cursor][position][[[x][int]][point]]
```

#242 создаёт logical sequence effect:

```text
XI = X ⟼ Int
Q  = XI ⟼ Point
WC = Window ⟼ Cursor
CP = Cursor ⟼ Position
PQ = Position ⟼ Q
```

Persistent batch выдаёт пять **новых** persistent occurrence ids.

После close/reopen:

```text
find(Window,Cursor) -> WC
find(Cursor,Position) -> CP
find(Position,Q) -> PQ
```

а replay всё ещё может проверить исходный sequence effect.

---

# 15. Что значит «тот же link после reopen»

Не:

```text
тот же RAM pointer
```

и не:

```text
тот же physical page address
```

а:

```text
тот же dataset lineage
+ тот же logical occurrence id
+ те же ordered logical poles
```

Это и есть persistent exact-occurrence contract текущего candidate.

---

# 16. Почему physical address нельзя сделать identity

High-performance backend почти неизбежно делает:

```text
relocation
compaction
page rewrite
copy-on-write
recovery
migration
```

Если physical address является ontology, любое такое действие изменяет «сущность» связи.

Это недопустимо.

Нужен adapter layer:

```text
persistent logical occurrence id
        ↓ backend mapping
physical record/address
```

Mapping может меняться, logical identity — нет внутри dataset lineage.

---

# 17. PersistMemoryManager

`netkeep80/PersistMemoryManager` остаётся естественным кандидатом production backend-а апамяти.

Но зависимость должна быть направлена так:

```text
Foundation-v2 L4 contract
        ↑ conforms to
PMM adapter
```

а не:

```text
PMM internal address model
        ↓ объявляется МТС identity
```

Следующий cross-repo implementation step после принятия L4 gate может создать отдельный PMM adapter issue/PR, не меняя canonical semantics `anum_docs`.

---

# 18. Что historical v0.3 сохраняет

Файлы:

```text
contracts/mts-l4-backend-challenge-v0.3.json
contracts/mts-l4-backend-driver-v0.3.json
contracts/mts-l4-backend-conformance-v0.3.json
converters/l4_backend_driver.py
```

сохраняются как historical candidate evidence старой pair-interning линии.

Их полезные идеи:

```text
backend neutrality
opaque handle normalization
read-only find
atomic structural effect
parser outside backend
```

сохраняются.

Но Foundation v2 отвергает два старых свойства:

```text
exact pair uniqueness
idempotent realize by pair
```

---

# 19. Reference backend не является production backend

`JsonExactLinkStore` нужен для одного: executable proof, что storage-neutral contract реализуем и survives reopen.

Не утверждается, что JSON подходит для:

```text
больших асетей
конкурентных writers
high-throughput indexing
zero-copy access
crash recovery industrial grade
```

Эти задачи принадлежат production adapter/backend.

Нормативен observable contract, а не файл.

---

# 20. Что проверяет conformance corpus

Минимальные vectors:

```text
duplicate pair survives reopen
find returns all duplicates
self-cycle survives reopen
mutual cycle survives reopen
sharing survives reopen
root logical id survives reopen
runtime refs are reconstructed
invalid batch exposes pre-state
commit failure exposes pre-state
fresh topology import gets fresh lineage
sequence effect delegates to #242 semantics
sequence evidence replays after reopen
backend has no parser/AST/pair-interning dependency
```

---

# 21. Что ещё не принято

Этот gate сам по себе не означает:

```text
PMM adapter accepted
production crash recovery accepted
delete semantics accepted
cross-dataset replication identity accepted
Foundation v2 release accepted
aprover repin allowed
```

После L4 semantic/persistence evidence следующий этап — compatibility/cutover и final versioned conformance.

---

# 22. Короткая формула persistent апамяти

```text
persistent exact occurrence
=
stable logical identity inside one dataset lineage
+
ordered logical poles
```

при этом:

```text
same pair != same occurrence
same topology != same dataset identity
same persistent occurrence != same runtime object
logical identity != physical address
read != materialize
```

Эти границы позволяют перенести МТС из in-memory reference network в реальную долговременную ассоциативную память без потери фундаментальной exact-occurrence semantics.
