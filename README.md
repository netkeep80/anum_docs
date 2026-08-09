# Метатеория связей (МТС)

**Метатеория связей (МТС)** исследует системы, в которых единственным первичным видом сущности является **связь**.

Базовая запись:

```text
L = A ⟼ B
```

Главный постулат:

```text
всё есть связь
```

Контекст, словарь, теория, source, actual act, доказательство и состояние памяти не обязаны быть внешними объектами — они сами могут быть представлены сетями связей.

---

# Текущий статус

В репозитории существуют два явно разделённых слоя.

## Historical accepted v0.2–v0.5

Versioned contracts v0.2–v0.5 остаются принятыми и воспроизводимыми. Они сохраняют historical parser/typed-AST/`ContextFrame`, десятиформульную root program, старые Anum denotation contracts и conformance corpus.

Они не переписываются задним числом.

## Foundation v2 — candidate следующей версии

Текущее развитие идёт через [Foundation v2 Gate P](docs/specs/Foundation%20v2%20Gate%20P.md).

Уже существует executable production/reference candidate для:

```text
exact-occurrence binary links
→ explicit K / D / G / T / I / A
→ canonical source evidence
→ read-only interpreter replay
→ persistent scoped `:`
→ local representative `=`
→ exact Run
→ T-admitted proof rule
→ integrated proof checker
→ Anum nested sequence materialization
→ persistent exact-occurrence L4 reference backend
```

Foundation v2 **ещё не является accepted release**. Persistent L4 сейчас проходит Gate #265; после него останутся compatibility/cutover, versioned integrated conformance и explicit acceptance перед repin `aprover`.

---

# 1. Онтология

Примитивная семантическая форма:

```text
Link(start, end)
```

У primitive `Link` нет обязательных semantic tags вроде:

```text
type
context
meaning
rule
source
```

Если роль существенна, она выражается связями.

Подробнее: [Основания МТС](docs/theory/Основания%20МТС.md).

---

# 2. Exact occurrence identity

Одинаковая форма не означает тождество:

```text
P1 = A ⟼ B
P2 = A ⟼ B

P1 ≠ P2
```

Также:

```text
R = R ⟼ R
X = X ⟼ X

R ≠ X
```

Foundation v2 поэтому не принимает как universal identity:

```text
pair interning
graph isomorphism
AST path
source spelling
snapshot slot
physical backend address
```

Exact occurrence identity необходима для multiplicity, cycles, sharing, provenance и proof acts.

---

# 3. Explicit context K

Контекст хранится сетью:

```text
P = parent ⟼ current
K = K ⟼ P
```

`K` — exact snapshot.

```text
↑ = current(K)
```

не является hidden global variable или ambient `ContextFrame` stack.

Старые ContextFrame/`◁`/`▷` остаются historical v0.2 semantics.

---

# 4. Source не равен смыслу

Foundation-v2 source path:

```text
raw UTF-8
→ canonical content C
→ exact source occurrence S
→ selected segmentation
→ scoped D
→ explicit G/T admission
→ exact form
```

Поэтому:

```text
same bytes != same source occurrence
source occurrence != semantic form
semantic form != theory admission
```

Token/AST class не является semantic authority.

Подробнее: [Формальная нотация МТС](docs/specs/Формальная%20нотация%20МТС.md).

---

# 5. Persistent dictionary D

Dictionary state также является сетью:

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

`:` — explicit persistent effect, а не host assignment и не theorem assertion.

---

# 6. Read/replay не materialize-ит

Фундаментальный operational split:

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

Если описание связи само создаёт искомую связь, ассоциативный поиск теряет смысл.

---

# 7. Local `=`

Текущее Foundation-v2 equality — local representative constraint:

```text
K ⟼ (member ⟼ representative)
```

```text
Equal_K(a,b)
⇔ rep_K(a) is rep_K(b)
```

Нет автоматических:

```text
transitivity chains
substitution
congruence
recursive rewriting
global union-find
```

Логический вывод требует отдельного `T`-admitted rule.

---

# 8. Actual act и Run

МТС различает:

```text
I — interpreter / capability
A — конкретный actual act
```

Actual act хранит exact evidence выбранного случая.

Многошаговый provenance:

```text
Run_0     = R
Run_(i+1) = Run_i ⟼ A_i
```

с exact continuity:

```text
A_i.after is A_(i+1).before
```

Run фиксирует order, но не создаёт logical transitivity.

---

# 9. Proof и будущий aprover

Первый proof-rule candidate существует только через:

```text
T ⟼ Rule
```

и одношагово decomposes истинное local equality завершённых links.

Integrated checker replay-ит:

```text
source `decompose`
→ scoped D/G/T
→ exact Rule
→ true equality A_eq
→ T ⟼ Rule
→ A_rule
→ Run[A_eq,A_rule]
→ accept / reject
```

Ключевая архитектура `aprover`:

```text
untrusted proof search / indices / heuristics
                  ↓ candidate
trusted exact replay
                  ↓
             accept / reject
```

Поисковый алгоритм может быть сложным и недоверенным, если selected evidence проверяется маленьким trusted core.

Подробнее: [Foundation v2 Proof replay](docs/specs/Foundation%20v2%20Proof%20replay.md).

---

# 10. Апамять — controller сети связей

Апамять — прикладная operational форма МТС.

Она хранит и обслуживает exact network:

```text
application links
K contexts
D histories
G/T admissions
source evidence
actual acts
proof claims
Runs
```

Индекс может быстро вернуть candidates, но не определяет истину.

```text
find(A,B) -> exact occurrences
```

не создаёт отсутствующую связь.

Только explicit materialization создаёт новый occurrence.

Подробнее: [Апамять и управление сетью связей](docs/specs/Апамять%20и%20управление%20сетью%20связей.md).

---

# 11. Ачисла: source sequence и result network

Historical Anum использует четыре абита:

```text
[ ] 0 1
```

Historical recursive denotation v0.2 остаётся accepted occurrence-tree contract.

Foundation v2 уточняет более общий sequence mode:

```text
source carrier != target network
```

Например source carrier:

```text
∞ A B
```

не обязан уже содержать:

```text
A ⟼ B
```

Explicit sequence materialization создаёт target relation только на effect side.

---

# 12. Foundation-v2 sequence materialization #242/#264

Machine contract candidate:

```text
contracts/mts-anum-sequence-materialization-v0.7.json
```

Production-facing module:

```text
core/foundation_v2_materialization.py
```

Semantics:

```text
∞ A B C
→ new exact A⟼B
→ new exact B⟼C
```

Root `∞` — sentinel, а не первый adjacency operand.

Nested group:

```text
[A]   → exact A
[A B] → X = A ⟼ B, return exact X
```

Поэтому:

```text
∞ [A B] C
→ X = A ⟼ B
→ Y = X ⟼ C
```

Подробнее: [Ачисла и сериализация](docs/specs/Ачисла%20и%20сериализация.md).

---

# 13. Наглядный Anum/apamemory пример

```text
∞[window][cursor][position][[[x][int]][point]]
```

Sequence candidate строит:

```text
XI = X ⟼ Int
Q  = XI ⟼ Point
WC = Window ⟼ Cursor
CP = Cursor ⟼ Position
PQ = Position ⟼ Q
```

```text
Window ─────▶ Cursor ─────▶ Position
                              │
                              ▼
                              Q
                             / \
                            /   \
                          XI   Point
                         /  \
                        X   Int
```

До explicit effect source carrier не обязан содержать эти target relations.

---

# 14. Materialization не наследует pair interning

Если уже существует:

```text
P1 = A ⟼ B
```

новый explicit effect может создать:

```text
P2 = A ⟼ B
```

при этом:

```text
P1 ≠ P2
```

Каждая adjacency sequence effect создаёт новый exact occurrence. Возможный reuse — отдельное explicit planning decision, а не скрытое следствие одинаковой пары.

Именно поэтому historical L4 #124 с pair uniqueness/idempotent realize закрыт как superseded, а Foundation-v2 persistent L4 заново выводится в #265.

---

# 15. Persistent exact-occurrence L4 #265

Persistent апамять должна сохранить exact occurrence semantics после close/reopen, не объявляя физический адрес identity.

Foundation v2 различает:

```text
runtime OccurrenceRef
persistent dataset-local logical occurrence id
snapshot-local slot
backend physical address
```

Reference persistent identity:

```text
PersistentOccurrenceId(lineage, local)
```

Для одного dataset:

```text
close → reopen
```

сохраняет `lineage/local`, но runtime refs строятся заново.

Импорт той же topology в независимый dataset получает новый lineage:

```text
same topology != same persistent exact identity
```

---

# 16. Persistent multiplicity, cycles и sharing

Persistent `materialize(A,B)` всегда создаёт **новый** logical occurrence.

```text
P1 = materialize(A,B)
P2 = materialize(A,B)
P1 ≠ P2
```

Оба должны пережить reopen и вернуться через:

```text
find(A,B) -> (P1,P2)
```

Atomic batch поддерживает self/mutual cycles и sharing через batch-local refs, не раскрывая циклы рекурсивно.

Подробнее: [Foundation v2 Persistent L4](docs/specs/Foundation%20v2%20Persistent%20L4.md).

---

# 17. Sequence effect после reopen

Persistent L4 не копирует Anum grammar.

Правильная цепочка:

```text
persistent store
→ reconstruct runtime exact network
→ foundation_v2_materialization.py
→ runtime effect evidence
→ normalize to persistent ids
→ atomic persistent batch
```

После reopen persistent evidence снова преобразуется в runtime before/after lineage и проверяется обычным trusted replay #242.

То есть storage меняется, а semantic sequence checker остаётся один.

---

# 18. Текущие Foundation-v2 modules

```text
core/exact_link_network.py
    exact-occurrence substrate + additive evolution

core/foundation_v2_state.py
    K / scoped D / memberships / A

core/foundation_v2_source.py
    canonical source and selected segmentation replay

core/foundation_v2_interpreter.py
    relation / `:` / `=` replay

core/foundation_v2_run.py
    exact ordered actual-act Run

core/foundation_v2_proof.py
    T-admitted proof-rule replay

core/foundation_v2_checker.py
    integrated source→proof→Run replay

core/foundation_v2_materialization.py
    nested Anum sequence materialization/replay

core/foundation_v2_persistent.py
    persistent exact-occurrence L4 reference backend and sequence bridge
```

Все они пока candidate следующей версии.

---

# 19. Путь к accepted Foundation v2

Текущий Gate-P release chain:

```text
#265 persistent exact-occurrence L4
↓
historical compatibility classification
↓
atomic production cutover + old semantic-path deletion
↓
versioned integrated conformance corpus
↓
explicit Foundation-v2 acceptance
↓
следующая опубликованная версия МТС
↓
aprover repin
```

Reference JSON store в #265 — только executable persistence evidence. Production backend может быть PMM или другой storage, если он проходит тот же observable contract.

До explicit acceptance Foundation v2 нельзя называть новой принятой версией.

---

# 20. Как читать репозиторий

Для текущей МТС:

1. [Основания МТС](docs/theory/Основания%20МТС.md)
2. [Система аксиом МТС](docs/theory/Система%20аксиом%20МТС.md)
3. [Foundation v2 Gate P](docs/specs/Foundation%20v2%20Gate%20P.md)
4. [Формальная нотация МТС](docs/specs/Формальная%20нотация%20МТС.md)
5. [Апамять и управление сетью связей](docs/specs/Апамять%20и%20управление%20сетью%20связей.md)
6. [Foundation v2 Persistent L4](docs/specs/Foundation%20v2%20Persistent%20L4.md)
7. [Foundation v2 Proof replay](docs/specs/Foundation%20v2%20Proof%20replay.md)
8. [Ачисла и сериализация](docs/specs/Ачисла%20и%20сериализация.md)

Для historical accepted behavior:

- [Reference model МТС v0.2](docs/specs/Reference%20model%20МТС%20v0.2.md)
- versioned `contracts/mts-contract-v0.2.json` … `v0.5`
- historical conformance corpora.

---

## Главный инвариант

```text
одна онтология связей
+ exact occurrence identity
+ explicit state/evidence
+ untrusted discovery
+ deterministic trusted replay
+ explicit materialization
+ persistent logical identity independent of physical storage
```

Эта комбинация связывает фундаментальную МТС с долговременной ассоциативной памятью и проверяемым `aprover`.
