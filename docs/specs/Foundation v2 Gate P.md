# Foundation v2 — Gate P

Статус: **production/reference candidate**, не accepted release.

Главный epic: #237.

Цель Gate P — собрать **один** production/reference semantic path, сохраняющий фундаментальную остенсивную МТС, и только затем опубликовать следующую accepted версию для `aprover` и других downstream consumers.

---

# 1. Неприкосновенный semantic invariant

Production implementation может использовать opaque refs, dataclasses, storage records и индексы, но не имеет права подменить ими фундаментальную нотацию МТС.

Первичный reader-facing слой Foundation v2:

```text
∞        fully self-closed акорень
♂e       S = S ⟼ e
b♀       E = b ⟼ E
b ⟼ e    X = b ⟼ e
```

То есть:

```text
ostensive form
→ exact structural occurrence
→ implementation carrier
```

а не наоборот.

`Link(start,end)` — machine/reference representation, не замена `∞ / ♂e / b♀ / b⟼e`.

---

# 2. Root bootstrap

Foundation-v2 semantic kernel:

```text
R = ∞
R = R ⟼ R
O = O ⟼ R
C = R ⟼ C
L = O ⟼ C
U = C ⟼ O
```

Root vocabulary:

```text
∞ → R
[ → O
] → C
1 → L
0 → U
```

Остенсивно:

```text
O = O ⟼ R ≡ ♂∞
C = R ⟼ C ≡ ∞♀
```

`[ ] 1 0` — distinguished root-derived Anum meanings. `♂/♀` — formal ostensive signs self-closure. Эти source vocabularies связаны, но не тождественны.

---

# 3. Four-form decision

Accepted Foundation-v2 direction from #208/#209:

```text
R = R ⟼ R      # ∞
S = S ⟼ e      # start self-closed / ♂e
E = b ⟼ E      # end self-closed / b♀
X = b ⟼ e      # complete
```

Permanent boundaries:

- self-closed shape alone does not mean `incomplete`;
- another `Q=Q⟼Q` is not root `∞` by shape;
- multiple `♂e`-shaped S occurrences may coexist;
- multiple `b♀`-shaped E occurrences may coexist;
- missing-pole resolution does not mutate the partial relation;
- inversion swaps the two one-pole forms;
- constructor/destructor/check/search belong to explicit resolution act, not a second meaning of glyphs.

Historical v0.2 projection-oriented `♀F / F♂` remains historical-only and must not be restored as Foundation-v2 self-closure semantics.

---

# 4. Gate-P implementation ladder

Завершённые executable/docs gates:

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
Persistent exact-occurrence L4                 #265/#266
Ostensive docs regression guard                #267/#268
```

Этот P0–P9 список описывает последовательность уже выполненных implementation evidence gates. В umbrella #237 название **release phase P3** отдельно относится к historical compatibility classification; это не новая параллельная семантика.

---

# 5. Текущая release-фаза

Persistent L4 больше не является открытым blocker-ом.

Текущий gate:

```text
#269 historical compatibility classification
```

После его explicit decision:

```text
atomic production cutover planning / old live semantic-path deletion
→ versioned integrated release conformance corpus
→ explicit Foundation-v2 acceptance
→ published next MTS version
→ aprover repin
```

До explicit acceptance все Foundation-v2 machine contracts остаются candidate evidence.

---

# 6. Exact occurrence substrate

Machine primitive:

```text
Link(start,end)
```

должен реализовывать, среди прочего, остенсивные shapes:

```text
∞   ↔ Link(R,R)
♂e  ↔ Link(S,e) where S is the relation itself
b♀  ↔ Link(b,E) where E is the relation itself
b⟼e ↔ Link(b,e)
```

Identity принадлежит exact occurrence:

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

---

# 7. Explicit context K

```text
P = parent ⟼ current
K = K ⟼ P
↑ = current(K)
```

`current` может быть exact occurrence любой structural form:

```text
∞
♂e
b♀
b⟼e
```

Нет ambient current, hidden parent stack или raw-projection pronoun semantics.

---

# 8. Source / form / theory separation

```text
raw UTF-8
→ canonical astring content C
→ exact source occurrence S
→ selected segmentation
→ scoped D
→ G/T admission
→ exact semantic form F
```

В частности UTF-8 glyph `♂` не является self-closure occurrence сам по себе.

Dictionary/theory evidence связывает source с form.

```text
source != form != theory membership
```

---

# 9. Trusted replay

Архитектурное разделение:

```text
untrusted search / ranking / planning
             ↓ selected exact evidence
trusted deterministic replay
             ↓
accept / reject
```

Replay:

- не выбирает candidate;
- не ищет «похожую» relation по shape как замену exact evidence;
- не превращает `♂/♀` в host opcodes;
- не materialize-ит отсутствующие links;
- не зависит от old AST semantics.

---

# 10. Persistent D и `:`

Dictionary snapshot:

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

`:` — explicit dictionary effect after form resolution, не host assignment.

---

# 11. Local `=`

```text
Pair    = member ⟼ representative
Binding = K ⟼ Pair
```

```text
Equal_K(a,b)
⇔ rep_K(a) is rep_K(b)
```

Одинаковая ostensive shape не создаёт equality.

```text
S1 = S1⟼e
S2 = S2⟼e
```

могут оба читаться как pattern `♂e`, но exact `S1 != S2` без representative evidence.

---

# 12. Actual acts и Run

`I` и actual `A` различны.

```text
Run_0     = R
Run_(i+1) = Run_i ⟼ A_i
```

Exact continuity:

```text
A_i.after is A_(i+1).before
```

Act фиксирует, какая ostensive/structural form, binding и exact result реально были выбраны.

---

# 13. Proof layer

Первый proof rule существует только через explicit admission:

```text
T ⟼ Rule
```

Integrated checker:

```text
source
→ D/G/T
→ exact Rule
→ equality A_eq
→ T ⟼ Rule
→ A_rule
→ Run[A_eq,A_rule]
→ trusted replay
```

Никакой AST class не является proof opcode по факту своего host type.

---

# 14. Anum sequence materialization

Source carrier и result network различны:

```text
∞ A B C
→ new exact A⟼B
→ new exact B⟼C
```

Nested value:

```text
[A]   → exact A
[A B] → X = A⟼B
```

`∞` здесь protocol/root sentinel sequence layer, но это operational использование не отменяет его первичного смысла акорня `∞=∞⟼∞`.

---

# 15. Persistent exact-occurrence L4

#265/#266 established candidate persistent boundary:

```text
runtime OccurrenceRef
persistent dataset-local logical occurrence id
snapshot-local slot
physical address
```

Same dataset close/reopen preserves logical occurrence lineage.

Fresh topology import creates fresh lineage.

Materialization preserves multiplicity:

```text
P1 = materialize(A,B)
P2 = materialize(A,B)
P1 ≠ P2
```

Cycles/sharing survive reopen.

---

# 16. Historical compatibility classification — #269

Machine-readable owner:

```text
contracts/mts-foundation-v2-compatibility-classification-v0.7.json
```

У каждой исторической observable surface теперь может быть только одно из четырёх состояний:

```text
PRESERVE
INTENTIONAL_DELTA
HISTORICAL_REPLAY_ONLY
REMOVE_AS_SUPERSEDED
```

Ключевые решения:

| Surface | Решение Foundation v2 |
|---|---|
| recursive Anum root-domain + canonical inverse | `PRESERVE` в точной принятой области |
| root-opening-collapse / explicit quote-relative boundary | `PRESERVE` |
| occurrence-local distinction | `PRESERVE`, обобщается exact occurrence identity |
| read/find/replay vs explicit effect | `PRESERVE` |
| untrusted proof search → trusted replay | `PRESERVE` |
| arbitrary outer Anum sequence materialization | `INTENTIONAL_DELTA` → #242/#264 |
| ten-formula root as live Foundation-v2 authority | `HISTORICAL_REPLAY_ONLY` |
| `ContextFrame`, `◁/▷`, parent-ascent `↑` | `HISTORICAL_REPLAY_ONLY`; live runtime path удаляется |
| historical `♀F / F♂` projection semantics | `HISTORICAL_REPLAY_ONLY` |
| Foundation-v2 `∞ / ♂e / b♀ / b⟼e` | `INTENTIONAL_DELTA`, primary ostensive layer |
| historical equality implementation | `INTENTIONAL_DELTA` → exact local representative `=` |
| DefinitionEnvironment/opening as live dictionary ontology | historical replay only → persistent scoped D/`:` |
| historical proof relations | historical replay only → exact T/A/Run proof layer |
| AST/token class as semantic authority | `REMOVE_AS_SUPERSEDED` |
| v0.3 pair interning/idempotent realize | `HISTORICAL_REPLAY_ONLY` |
| persistent `(lineage, local)` exact occurrence identity | `INTENTIONAL_DELTA` → #265/#266 |
| backend address as semantic identity | rejected; explicit portable mapping replaces it |

Важно:

```text
historical replay != compatibility runtime
```

Старые accepted contracts v0.2–v0.5 и их тесты остаются воспроизводимыми. Но новый production runtime не получает mode/flag/adaptor, который переключает его обратно на `ContextFrame`, AST semantics, raw projections или pair interning.

Git хранит реализацию прошлого; active tree после cutover должен иметь одну live semantics.

Classification #269 сама по себе **ничего не удаляет и ничего не принимает как release**. Она только делает последующий cutover однозначным.

---

# 17. Cutover policy после P3

После закрытия #269 разрешено проектировать один atomic migration program с явной таблицей consumers/deletions.

Предпочтительный порядок:

```text
1. freeze integrated release candidate/conformance inputs
2. migrate live source/parser consumers
3. migrate live interpreter/state consumers
4. migrate proof/checker consumers
5. migrate root/Anum/L4 production integration
6. delete superseded live semantic code in the same migration program
7. run one versioned integrated corpus
8. record explicit acceptance decision
```

Запрещённое конечное состояние:

```text
new Foundation-v2 runtime
+
old ContextFrame/AST/pair-interning runtime behind compatibility switch
```

Historical replay tools may remain only when их versioned contract ownership explicit и они не участвуют в новой production validity.

---

# 18. Acceptance criterion

Следующая версия МТС принимается только как одна интегрированная система:

```text
ostensive root ∞ / ♂e / b♀ / b⟼e
+ distinguished ∞ [ ] 1 0 bootstrap
+ exact occurrence network
+ source/D/G/T/K/A
+ relation/:/=
+ proof/Run/checker
+ sequence materialization
+ persistent L4
+ explicit compatibility classification
+ atomic cutover
+ versioned conformance
```

Особый veto для release:

> Foundation v2 нельзя считать корректно документированной или принятой, если executable implementation зелёная, но основная теория снова скрывает `∞ / ♂ / ♀` за одним только `Link(start,end)`.

Остенсивность является частью semantic surface, которую production path обязан сохранять и объяснять.
