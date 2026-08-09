# Метатеория связей (МТС)

**Метатеория связей (МТС)** исследует системы, в которых единственным первичным видом сущности является **связь**.

Главный постулат:

```text
всё есть связь
```

Но МТС начинается не с программного типа `Link` и не с графической стрелки. Её исходная наглядность — **остенсивная форма связи**: запись сама показывает, какие полюса уже различены, а какие остаются самозамкнутыми.

---

# 1. Остенсивный корень МТС

Акорень обозначается знаком:

```text
∞
```

и остенсивно является полностью самозамкнутой связью:

```text
∞ = ∞ ⟼ ∞
```

Это фундаментальное чтение Foundation v2: акорень — различённая неподвижная точка, для которой смысл связывает смысл с самим смыслом. Здесь **не вводится** отдельный primitive `Meaning(x)` — сам смысл остаётся связью.

Из акорня естественно видны четыре формы различённости бинарной связи:

```text
∞        оба полюса самозамкнуты
♂e       начало самозамкнуто, конец e различён
b♀       начало b различено, конец самозамкнут
b ⟼ e    оба полюса различены
```

Их структурные уравнения:

```text
R = R ⟼ R      # ∞
S = S ⟼ e      # ♂e
E = b ⟼ E      # b♀
X = b ⟼ e      # b ⟼ e
```

Знаки `♂` и `♀` **не являются командами взять начало/конец**. Они остенсивно показывают самозамыкание соответствующего полюса:

```text
♂e  ≡  S = S ⟼ e
b♀  ≡  E = b ⟼ E
```

В конкретном акте интерпретации такая форма может использоваться для поиска, построения, проверки или разрешения недостающего полюса. Это разные направления разрешения **одной и той же структурной формы**, а не разные значения знака.

Важно также:

```text
самозамкнутая форма ≠ автоматически акорень
самозамкнутая форма ≠ автоматически «незавершённый объект»
```

Exact occurrence определяет, о какой именно связи идёт речь.

Подробнее: [Основания МТС](docs/theory/Основания%20МТС.md).

---

# 2. Пять различённых корневых связей

Foundation v2 сохраняет конечное пятисвязное bootstrap-ядро:

```text
R = ∞
R = R ⟼ R
O = O ⟼ R
C = R ⟼ C
L = O ⟼ C
U = C ⟼ O
```

Корневая семантическая генеалогия:

```text
∞ → R
[ → O
] → C
1 → L
0 → U
```

Остенсивно первые различения вокруг акорня можно читать так:

```text
[ → O = O ⟼ R  ≡  ♂∞
] → C = R ⟼ C  ≡  ∞♀
1 → L = O ⟼ C
0 → U = C ⟼ O
```

То есть `[ ] 1 0` — не четыре произвольно назначенных символа. Они происходят из первого ориентированного различения вокруг `∞` и образуют корневой словарь ачисел.

При этом нельзя смешивать разные уровни:

```text
корневая occurrence [ / ]
≠ UTF-8 glyph ♂ / ♀
≠ host token / AST node
```

`[` и `]` — различённые корневые абиты/смыслы bootstrap-а. `♂` и `♀` — знаки формальной нотации, остенсивно обозначающие формы самозамыкания.

---

# 3. Машинное представление идёт после остенсивного

Только после того, как форма связи понятна остенсивно, её удобно записать в нейтральном машинном виде:

```text
Link(start, end)
```

Это reference/API-представление, а не замена языка МТС.

Например:

```text
∞   ↔ R = R ⟼ R
♂e  ↔ S = S ⟼ e
b♀  ↔ E = b ⟼ E
b⟼e ↔ X = b ⟼ e
```

Primitive `Link` не содержит обязательных semantic tags:

```text
type
meaning
context
rule
source
```

Если роль существенна, она должна быть выражена связями самой сети.

---

# 4. Exact occurrence identity

Одинаковая форма не означает тождество:

```text
P1 = A ⟼ B
P2 = A ⟼ B

P1 ≠ P2
```

Аналогично:

```text
R = R ⟼ R
Q = Q ⟼ Q

R ≠ Q
```

Поэтому Foundation v2 не принимает как universal semantic identity:

```text
pair interning
graph isomorphism
AST path
source spelling
snapshot slot
physical backend address
```

Exact occurrence identity нужна для multiplicity, cycles, sharing, provenance, actual acts и proof artifacts.

---

# 5. Контекст тоже является связями

Целевая Foundation-v2 модель не использует hidden `ContextFrame` как онтологию.

```text
P = parent ⟼ current
K = K ⟼ P
```

`K` — exact occurrence состояния контекста.

```text
↑ = current(K)
```

означает обращение к `current`, разрешённому из **явно предъявленного** `K`, а не к глобальной переменной интерпретатора.

`current` при этом может быть:

```text
∞
♂e
b♀
b⟼e
```

то есть текущая связь не обязана быть полностью различённой пользовательской relation.

---

# 6. Source, форма и теория — разные связи

Foundation-v2 source path:

```text
raw UTF-8
→ canonical astring content C
→ exact source occurrence S
→ selected segmentation
→ scoped dictionary D
→ explicit G/T admission
→ exact semantic form F
```

Следовательно:

```text
same bytes != same source occurrence
source occurrence != semantic form
semantic form != theory admission
```

Например UTF-8 строка `♂` должна через явный словарь разрешаться в остенсивную self-closure form; сам host-character не является её онтологией.

Подробнее: [Формальная нотация МТС](docs/specs/Формальная%20нотация%20МТС.md).

---

# 7. Persistent dictionary `D` и `:`

Dictionary state выражается сетью:

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

`:` — explicit persistent dictionary effect, а не host assignment, не equality и не theorem assertion.

---

# 8. Read/replay отделены от materialization

Фундаментальная operational граница:

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

Описание искомой связи не должно само создавать её в апамяти.

---

# 9. Local `=` и proof rules

Текущее Foundation-v2 equality — explicit local representative constraint:

```text
Pair    = member ⟼ representative
Binding = K ⟼ Pair
```

```text
Equal_K(a,b)
⇔ rep_K(a) is rep_K(b)
```

Из него не следуют автоматически:

```text
transitive alias closure
substitution
congruence
recursive rewrite
graph-shape equality
```

Дополнительное правило должно быть отдельной exact form, допущенной теорией:

```text
T ⟼ Rule
```

---

# 10. Actual act и Run

МТС различает:

```text
I — interpreter / capability
A — конкретный actual interpretation act
```

Act хранит exact evidence выбранного разрешения.

Последовательность acts также представляется связями:

```text
Run_0     = R
Run_(i+1) = Run_i ⟼ A_i
```

с exact continuity:

```text
A_i.after is A_(i+1).before
```

Поиск кандидата может быть недоверенным; trusted replay проверяет предъявленные exact relations.

---

# 11. Ачисла и остенсивный bootstrap

Ачисла используют четыре корневых абита:

```text
[ ] 1 0
```

Акорень `∞` не является абитом — он корень, относительно которого начинается последовательность.

Bootstrap ladder:

```text
binary Link ontology
→ акорень ∞
→ пять различённых root occurrences ∞ [ ] 1 0
→ quaternary Anum
→ минимальный Anum interpreter/deserializer
→ UTF-8 string Anums
→ formal signs, включая ♂ / ♀ / ⟼
→ dictionary/theory network
→ general associative interpreter/prover
```

Формальный текст не создаёт акорень и четыре первых смысла. Наоборот, корневое различение делает возможными ачисла, строки и только затем текст, способный описать собственный bootstrap.

---

# 12. Sequence materialization

Foundation-v2 sequence candidate отделяет source carrier от result network:

```text
∞ A B C
→ new exact A⟼B
→ new exact B⟼C
```

Вложенная группа возвращает построенную exact relation как один элемент внешней sequence:

```text
[A]   → exact A
[A B] → X = A ⟼ B

∞ [A B] C
→ X = A ⟼ B
→ Y = X ⟼ C
```

Подробнее: [Ачисла и сериализация](docs/specs/Ачисла%20и%20сериализация.md).

---

# 13. Апамять и persistent L4

Апамять хранит exact network и отделяет поиск от эффекта.

Foundation-v2 persistent identity различает:

```text
runtime OccurrenceRef
persistent dataset-local logical occurrence id
snapshot-local slot
backend physical address
```

Persistent materialization не интернирует пары:

```text
P1 = materialize(A,B)
P2 = materialize(A,B)
P1 ≠ P2
```

Duplicates, cycles и sharing сохраняются при reopen. Физический адрес backend-а не становится смыслом связи.

Подробнее:

- [Апамять и управление сетью связей](docs/specs/Апамять%20и%20управление%20сетью%20связей.md)
- [Foundation v2 Persistent L4](docs/specs/Foundation%20v2%20Persistent%20L4.md)

---

# 14. Текущий статус Foundation v2

Historical accepted `v0.2–v0.5` остаются воспроизводимыми и не переписываются задним числом.

Foundation v2 уже имеет executable candidate для:

```text
exact-occurrence substrate
→ K / D / G / T / I / A
→ canonical source evidence
→ relation / `:` / `=` replay
→ exact Run
→ T-admitted proof rule
→ integrated checker
→ Anum sequence materialization
→ persistent exact-occurrence L4
```

Persistent L4 #265 / PR #266 завершён. Следующая release-фаза:

```text
historical compatibility classification
→ atomic production cutover
→ versioned integrated conformance
→ explicit Foundation-v2 acceptance
→ published next MTS version
→ aprover repin
```

До explicit acceptance Foundation v2 остаётся candidate.

---

# 15. Как читать репозиторий

Для текущей МТС:

1. [Основания МТС](docs/theory/Основания%20МТС.md) — акорень, остенсивность, identity и онтология.
2. [Система аксиом МТС](docs/theory/Система%20аксиом%20МТС.md) — аксиоматические обязательства Foundation v2.
3. [Формальная нотация МТС](docs/specs/Формальная%20нотация%20МТС.md) — `∞ / ♂ / ♀ / ⟼`, source и resolution.
4. [Foundation v2 Gate P](docs/specs/Foundation%20v2%20Gate%20P.md) — текущая production/reference лестница.
5. [Апамять и управление сетью связей](docs/specs/Апамять%20и%20управление%20сетью%20связей.md).
6. [Foundation v2 Proof replay](docs/specs/Foundation%20v2%20Proof%20replay.md).
7. [Ачисла и сериализация](docs/specs/Ачисла%20и%20сериализация.md).
8. [Foundation v2 Persistent L4](docs/specs/Foundation%20v2%20Persistent%20L4.md).

Для historical accepted behavior:

- [Reference model МТС v0.2](docs/specs/Reference%20model%20МТС%20v0.2.md)
- versioned `contracts/mts-contract-v0.2.json` … `v0.5`
- historical conformance corpora.

---

## Главный инвариант

```text
остенсивная форма
→ exact relation occurrence
→ explicit context/evidence
→ associative discovery
→ deterministic replay
→ explicit materialization
```

`∞`, `♂`, `♀` и `⟼` — не косметика поверх машинной модели. Они делают фундаментальную структуру связи **видимой в самой записи**, и именно поэтому остенсивность должна предшествовать API-представлению.