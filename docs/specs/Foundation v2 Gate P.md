# Foundation v2 — Gate P

Статус: **production/reference candidate**, не accepted release.

Главный epic: #237.

Цель Gate P — собрать **один** link-only production/reference semantic path, удалить конкурирующие старые semantic paths при cutover и только затем опубликовать следующую accepted версию МТС для downstream consumers, прежде всего `aprover`.

---

# 1. Текущее состояние

Foundation v2 уже прошла основные semantic gates:

```text
P0  production semantic surface audit
P1  exact-occurrence binary-link substrate
P2  link-only K / D / G / T / I / A state
P3  canonical source front-end
P4  unified relation interpreter/replay
P5  persistent scoped D + `:`
P6  local representative `=`
P7  exact multistep Run
P8  separately T-admitted proof rule
P9  integrated source → Rule → equality → proof → Run replay
```

Ключевые завершённые issues/PRs:

```text
#238/#239  production semantic surface audit
#240/#241  exact-occurrence substrate
#243/#244  Foundation-v2 state / apamemory roles
#245/#246  source front-end
#247/#248  interpreter/replay
#249/#250  scoped D + `:`
#251/#252  local `=`
#253/#254  exact Run
#255/#256  first T-admitted proof rule
#257/#262  integrated proof/checker conformance
```

Сейчас semantic proof/checker core считается **готовым к release-hardening**, но Foundation v2 ещё не принята.

Оставшиеся крупные blockers:

```text
#261  current documentation refresh
#242  Anum sequence → апамять executable materialization
#124  persistent L4/backend contract
historical compatibility classification
atomic production cutover / legacy semantic-path deletion
versioned integrated conformance corpus
explicit Foundation-v2 acceptance
published next MTS version
aprover repin
```

---

# 2. Базовый substrate

Единственный primitive semantic shape:

```text
Link(start, end)
```

При этом identity находится не в паре полюсов, а в exact occurrence.

```text
P1 = A ⟼ B
P2 = A ⟼ B

P1 ≠ P2
```

Substrate обязан поддерживать:

- duplicate pairs;
- multiple self-cycles;
- arbitrary finite cycles;
- sharing;
- exact root selection;
- portable topology snapshot без объявления snapshot slot универсальной identity.

Не принимаются как semantic identity:

```text
graph isomorphism
pair interning
physical memory address
persistent backend handle
AST path
source spelling
```

Production-facing implementation: `core/exact_link_network.py`.

---

# 3. Bootstrap R/O/C/L/U

Foundation v2 использует небольшой набор distinguished exact occurrences:

```text
R / O / C / L / U
```

Их назначение bootstrap-уровня определяется exact selection, а не глобальным shape classifier.

Например две связи:

```text
R = R ⟼ R
X = X ⟼ X
```

остаются различными exact occurrences.

Поэтому нельзя восстанавливать semantic role только из self-closed shape.

---

# 4. Context K

Persistent context выражается обычными связями:

```text
P = parent ⟼ current
K = K ⟼ P
```

`K` — exact snapshot.

Текущий focus:

```text
↑ = current(K)
```

не требует скрытого global current или `ContextFrame` stack.

Переход:

```text
K_before → K_after
```

должен иметь explicit evidence в actual act.

---

# 5. Source pipeline

Foundation v2 source path:

```text
raw UTF-8
→ canonical byte carriers
→ canonical astring content C
→ exact source occurrence S
→ selected exact segmentation
→ scoped D resolution
→ explicit G/T admission
→ exact semantic form(s)
```

Главная граница:

```text
source occurrence != canonical content != semantic form != theory admission
```

Trusted replay не обязан доверять tokenizer-у, longest-match или AST class.

Production-facing implementation: `core/foundation_v2_source.py`.

---

# 6. Persistent scoped dictionary D

Canonical D topology:

```text
D = D ⟼ (parentScope ⟼ localHistory)
```

Definition:

```text
Entry      = sourceContent ⟼ form
Occurrence = D_before ⟼ Entry
H_after    = H_before ⟼ Occurrence
D_after    = D_after ⟼ (sameParentScope ⟼ H_after)
```

Свойства:

- old scope не мутирует;
- local mapping может shadow parent;
- local miss использует parent;
- duplicate same mapping может сохраняться как provenance;
- conflicting local resolution не разрешается «last write wins» молча.

---

# 7. `:` как explicit effect

`:` — persistent dictionary effect.

Он не является:

```text
equality
host assignment
theorem assertion
```

Executor/materializer может создать требуемые exact links.

Trusted replay только проверяет уже предъявленный transition:

```text
D_before
→ exact definition occurrence
→ H_after
→ D_after
```

без мутации проверяемой сети.

---

# 8. Relation resolution

Самозамкнутый один полюс формы является структурой, а не opcode.

```text
F = F ⟼ X
```

или:

```text
F = X ⟼ F
```

Operation возникает при selected form + exact binding from `K`.

Trusted replay проверяет exact result и новый `K`, но не materialize-ит их.

Production-facing implementation: `core/foundation_v2_interpreter.py`.

---

# 9. Local `=`

Foundation v2 equality candidate:

```text
Pair    = member ⟼ representative
Binding = K ⟼ Pair
```

```text
Equal_K(a,b)
⇔ rep_K(a) is rep_K(b)
```

Только local exact representative и только один hop.

Не встроены:

```text
global structural equality
transitive alias closure
substitution
congruence
recursive decomposition
union-find semantics
```

Это решение предотвращает collapse различений exact-occurrence сети.

---

# 10. Actual act A

Foundation v2 различает:

```text
I — interpreter / capability
A — actual occurrence конкретного действия
```

Actual act содержит role-addressed exact evidence, например:

```text
source
form
D
G
T
K_before
binding
result
K_after
```

Roles также представлены ordinary link occurrences, а не enum field внутри `Link`.

---

# 11. Exact Run

Многошаговый artifact:

```text
Run_0     = R
Run_(i+1) = Run_i ⟼ A_i
```

Continuity:

```text
A_i.after is A_(i+1).before
```

Exact identity обязательна: shape-equivalent `K_copy` не подходит.

Run не создаёт:

```text
K0 → Kn shortcut
logical transitivity
theorem closure
```

Он фиксирует exact order/provenance actual acts.

Production-facing implementation: `core/foundation_v2_run.py`.

---

# 12. Separately admitted proof rule

Первый proof-rule candidate специально вынесен за пределы `=`.

Premise:

```text
Equal_K(L,R) = true
```

Links:

```text
L = ls ⟼ le
R = rs ⟼ re
```

Admission:

```text
T ⟼ Rule
```

One-step conclusions:

```text
C_start = ls ⟼ rs
C_end   = le ⟼ re
```

Claims не materialize-ят equality bindings и nested relations не decomposed автоматически.

Production-facing implementation: `core/foundation_v2_proof.py`.

Подробнее: [Foundation v2 Proof replay](Foundation%20v2%20Proof%20replay.md).

---

# 13. Integrated checker P9

Первый целостный trusted artifact:

```text
source `decompose`
        ↓
canonical C / exact S
        ↓
selected segmentation
        ↓
scoped D
        ↓
exact Rule + G/T source admission
        ↓
true local equality A_eq in exact K
        ↓
exact direct T ⟼ Rule
        ↓
one-step A_rule
        ↓
exact Run[A_eq, A_rule]
        ↓
read-only integrated replay
```

Integrated checker требует сквозное exact тождество:

```text
source-selected Rule is proof Rule
source T is proof T
premise K is proof K is Run K
Run acts are exactly (A_eq, A_rule)
```

Он не:

- tokenizes source;
- ищет proof;
- ранжирует rules;
- выводит equality по shape;
- выбирает T;
- materialize-ит claims;
- вызывает legacy proof checker.

Production-facing implementation: `core/foundation_v2_checker.py`.

Research record: [P9 integrated proof conformance](../research/Foundation%20v2%20P9%20integrated%20proof%20conformance.md).

---

# 14. Апамять как прикладной смысл Gate P

Foundation v2 становится особенно наглядной, если смотреть на неё как на теорию **контроллера сетей связей**.

Апамять предоставляет две принципиально разные группы действий:

```text
READ SIDE
find
select
enumerate
resolve
replay

EFFECT SIDE
materialize
define
delete
persist
```

Их нельзя смешивать.

В одной exact network могут существовать:

```text
application data
source carrier
K contexts
D histories
G/T admissions
actual acts
proof claims
Runs
```

Поиск может использовать эффективные индексы, кэши, эвристики и backend-specific handles. Но trusted semantics принимает только exact evidence network.

Подробнее: [Апамять и управление сетью связей](Апамять%20и%20управление%20сетью%20связей.md).

---

# 15. Ачисло и materialization gap #242

Recursive Anum пока является structural description, а не готовым universal materializer arbitrary exact network.

Нужен explicit executable bridge:

```text
Anum/source sequence
→ selected structural interpretation
→ materialization plan
→ exact links before/after
→ replayable effect evidence
```

Особенно важны:

- nested structures;
- exact occurrence multiplicity;
- sharing policy;
- cycles;
- duplicate pair policy;
- source provenance;
- round-trip boundary;
- отсутствие скрытых writes во время decode.

Это следующий semantic release blocker #242 после docs gate #261.

---

# 16. Persistent L4 gap #124

In-memory `OccurrenceRef` не должен превращаться в universal persistent identity.

Persistent backend contract обязан отделить:

```text
semantic exact occurrence identity
portable snapshot/local identity
backend physical address/handle
```

и доказать сохранение:

- multiplicity;
- cycles;
- sharing;
- root selection;
- read/find no-mutation guarantees;
- explicit materialization;
- portable replay evidence.

Только после этого production cutover может зависеть от реального persistent storage.

---

# 17. Historical compatibility boundary

Accepted v0.2–v0.5 path содержит:

```text
mtc_parser.py
mtc_ast.py
mtc_interpreter.py
ContextFrame
TokenKind
historical root program
bundle semantics
old proof contracts
```

Git сохраняет историю; поэтому Gate P не должен оставлять после cutover два равноправных semantic cores.

Для каждого legacy consumer должно быть принято одно решение:

```text
migrate
preserve as historical-only artifact
or remove from production path
```

Временный adapter не должен становиться новой постоянной semantics.

---

# 18. Acceptance gate

Foundation v2 может стать следующей accepted версией только после одного интегрированного решения:

```text
exact-occurrence substrate
+ source/D/G/T
+ K/A
+ relation/:/=
+ proof/Run/checker
+ Anum materialization
+ persistent L4
+ compatibility cutover
+ versioned conformance corpus
```

После этого:

1. публикуется новый versioned MTS contract;
2. candidate-маркировки снимаются;
3. старый production semantic path удаляется/архивируется согласно решению;
4. downstream consumers pin-ятся на новый contract;
5. `aprover` получает право на repin.

До этого момента закрытые Gate-P issues являются **evidence направления**, но не отдельными accepted версиями МТС.

---

# 19. Канонический принцип Gate P

```text
одна сеть связей
+ exact occurrence identity
+ explicit state/evidence
+ untrusted discovery
+ deterministic trusted replay
+ explicit materialization
+ one production semantic path
```

Если новый механизм требует скрытого metadata-object, второго semantic core или доверия к поисковой эвристике, он должен считаться архитектурным подозрением и проходить отдельный gate.
