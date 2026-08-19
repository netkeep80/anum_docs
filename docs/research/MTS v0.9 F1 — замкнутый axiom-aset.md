# MTS v0.9 F1 — замкнутый axiom-aset

Статус: **candidate foundation artifact** для #594.

Этот документ не изменяет accepted MTS v0.8 и не доказывает теоремы #582/#583. Его задача уже: собрать в одной форме завершённые решения #595/#596/#599/#601/#602/#597 и показать минимальную замкнутую систему самовведения знаков F1.

## 1. Граница F1

Внутренний минимальный алфавит ровно:

```text
∞ [ ] 1 0 ( ) ⟼ : =
```

Не входят в минимальный F1:

```text
≡              DEFER / META-ONLY
♂ ♀            DEFER-DERIVED
↑              DEFER-DERIVED
{ }            DEFER-DERIVED
¬ ↛            DEFER-DERIVED
∧ ⇔ ⇒ ≠ →      META-ONLY
```

ASCII/tooling spellings вроде `->`, `!=`, `INF` также не являются знаками foundation.

`R/O/C/L/U` — meta/machine aliases для Links, а не второй физический алфавит.

## 2. Четыре слоя, которые нельзя схлопывать

Для каждого внутреннего glyph `g` различаются:

```text
physical glyph g
canonical exact source carrier c_g
sign/dictionary Entry E_g
semantic meaning Link m_g
```

Дополнительно конкретное употребление определяется явным `I/K/Rule` context.

Канонический source carrier:

```text
UTF-8 bytes(g)
-> Rep_SQ: один [bbbbbbbb] на каждый byte, MSB-first
-> ExactSequence<Byte(p)>
= c_g
```

Затем собственный Link знака:

```text
E_g := c_g ⟼ m_g
```

Здесь `:=` — только metanotation этого документа. Внутри axiom-aset отдельного оператора `:=` нет.

В частности, одинаковый смысл не означает одинаковый знак:

```text
m∞ и m=    ожидаемо один R
E∞ и E=    разные Links из-за разных carriers

m[ и m(    ожидаемо один O
E[ и E(    разные Links

m] и m)    ожидаемо один C
E] и E)    разные Links

m1 и m⟼    ожидаемо один L
E1 и E⟼    разные Links
```

## 3. Внутренняя форма аксиомы без внешнего equality

Строки вида

```text
m∞ = m∞ ⟼ m∞
```

ниже являются удобной META-сериализацией recursive pole constraint. Знак `=` в такой строке **не** является FORMAL `=` МТС и не импортирует classical equality.

Реальный объект axiom-aset — обычные Links:

```text
poles(m_g) = (m_start, m_end)
E_g       = c_g ⟼ m_g
```

а resolved FORMAL presentation каждой вводящей аксиомы имеет exact form:

```text
Relation_g = ExactSequence(
  m_start,
  E_⟼,
  m_end
)

A_g = ExactSequence(
  c_g,
  E_:,
  Relation_g
)
```

То есть внутренняя читаемая форма — по смыслу:

```text
carrier_g : (m_start ⟼ m_end)
```

без необходимости использовать conventional `=` для определения самого смысла.

Её результат:

```text
m_start ⟼ m_end -> m_g
c_g ⟼ m_g       -> E_g
```

Это не новый `EquationObject`: `A_g` — обычный exact FORMAL carrier, `E_g` — обычный Link, а recursive equation уже содержится в полюсах `m_g`.

## 4. Десять simultaneous constraints

META-проекция системы:

```text
m∞ = m∞ ⟼ m∞

m[ = m[ ⟼ m∞
m] = m∞ ⟼ m]
m1 = m[ ⟼ m]
m0 = m] ⟼ m[

m( = m( ⟼ m∞
m) = m∞ ⟼ m)
m⟼ = m( ⟼ m)

m: = m∞ ⟼ m⟼
m= = m= ⟼ m=
```

Все dependency names справа принадлежат тому же набору из десяти meanings. Внешнего foundation primitive здесь не требуется.

Система должна рассматриваться одновременно, а не как программа вида «сначала определить `∞`, потом `[`, потом ...».

Особенно:

```text
A_: содержит E_: как свой оператор `:`
A_⟼ содержит E_⟼ как свой оператор `⟼`
```

Поэтому `:` и `⟼` действительно участвуют в собственном самовведении. Это mutual structural constraint, а не bootstrap по порядку токенов.

## 5. Exact carriers

| glyph | canonical Rep_SQ |
|---|---|
| `∞` | `[11100010][10001000][10011110]` |
| `[` | `[01011011]` |
| `]` | `[01011101]` |
| `1` | `[00110001]` |
| `0` | `[00110000]` |
| `(` | `[00101000]` |
| `)` | `[00101001]` |
| `⟼` | `[11100010][10011111][10111100]` |
| `:` | `[00111010]` |
| `=` | `[00111101]` |

Carrier — representation, а не interpretation. Invalid UTF-8 остаётся допустимым на более низком byte-carrier layer, но эти десять physical glyphs являются строгими UTF-8 text values.

## 6. Expected root projection — только target

Candidate system намеренно совместим с текущим machine projection:

```text
m∞ = m=       -> R
m[ = m(       -> O
m] = m)       -> C
m1 = m⟼       -> L
m0             -> U
m:             -> R ⟼ L
```

Но эта таблица **не является доказательством** равенств/collapse.

F1 только предъявляет recursive system и machine falsification witness. Внутреннее основание simultaneous solution и no-instance принадлежит:

```text
#582 — grounded simultaneous solution
#583 — no-instance / unique-root consequences
```

Нельзя закрывать #583 ссылкой на `Memory.ensure` или на эту таблицу.

## 7. Сам axiom-aset как ordinary Theory Link

Порядок declaration нужен как точная presentation/configuration, но не как opaque identity аксиомы.

Candidate representation:

```text
TheoryDeclSeq = ExactSequence(
  A_∞,
  A_[,
  A_],
  A_1,
  A_0,
  A_(,
  A_),
  A_⟼,
  A_:,
  A_=
)

T_F1 = T_F1 ⟼ TheoryDeclSeq
```

`T_F1` — обычный one-sided selfclosed Link с exact declaration payload. Никаких `AxiomId`, UUID, host objects или unordered-set identity нет.

Перестановка declaration sequence — структурно другая presentation. Если когда-нибудь нужна extensional equivalence теорий независимо от порядка, это derived theorem, не F1 identity.

## 8. Dictionary и context closure

Все `E_g` могут быть включены в обычный scoped dictionary `D` как canonical Entries:

```text
Entry = sourceContent ⟼ form
```

Occurrence/history Links dictionary не создают новые `E_g` или `m_g`; они только фиксируют declaration/effect history.

Контекст задаётся structural configuration:

```text
G_Q      = G_Q      ⟼ ExactSequence(E_[, E_], E_1, E_0)
G_FORMAL = G_FORMAL ⟼ ExactSequence(E_(, E_), E_⟼, E_:, E_=)

I_Q      = D ⟼ (G_Q      ⟼ T_F1)
I_FORMAL = D ⟼ (G_FORMAL ⟼ T_F1)

K = K ⟼ (parent ⟼ current)
I ⟼ K
```

Поэтому одинаковый structural `K` не обязан клонироваться ради названий «Q» и «FORMAL». Различие использования выражено через `I ⟼ K` и различную рекурсивную структуру `G`.

Host enum/mode не является semantic authority.

## 9. Замкнутый цикл для каждого знака

Для каждого `g` выполняется одна и та же схема:

```text
physical glyph g
-> exact UTF-8 bytes
-> canonical Rep_SQ / ExactSequence carrier c_g
-> dictionary Entry E_g = c_g ⟼ m_g
-> recursive poles of m_g use only meanings того же F1 registry
-> exact FORMAL axiom A_g uses E_: and E_⟼ from того же registry
-> A_g belongs to TheoryDeclSeq of T_F1
-> T_F1 participates in I_Q / I_FORMAL
-> D in the same I resolves c_g back to m_g
```

Это и есть closure. Ни один шаг не требует внешнего semantic token.

Carrier materialization относится к explicit write/setup path. Последующий lookup/verify/replay обязан оставаться read-only.

## 10. Центральные self-introduction challenges

### Root

Resolved FORMAL axiom:

```text
A_∞ = [
  c_∞,
  E_:,
  [m∞, E_⟼, m∞]
]
```

В machine projection inner relation имеет форму `R ⟼ R` и возвращает R, а outer Entry — `c_∞ ⟼ R`.

Человеческая краткая запись:

```text
∞ : (∞ ⟼ ∞)
```

должна читаться как self-consistency presentation, а не как внешнее определение root.

### Colon

```text
A_: = [
  c_:,
  E_:,
  [m∞, E_⟼, m⟼]
]
```

Здесь `E_:` уже находится внутри своей собственной theory declaration. Нет первого «магически уже определённого» colon token.

### Formal arrow

```text
A_⟼ = [
  c_⟼,
  E_:,
  [m(, E_⟼, m)]
]
```

`E_⟼` участвует в собственном axiom form таким же simultaneous образом.

### Equality sign

```text
poles(m=) = (m=, m=)
E_=       = c_= ⟼ m=
```

Это self-introduction root/no-distinction meaning знака. Оно **не** определяет FORMAL equality через callback.

FORMAL use `left = right` остаётся отдельным admitted Rule/judgment:

```text
localRepresentative(K,left)
localRepresentative(K,right)
-> no-distinction только если representatives совпали
```

Без global equality closure, assignment, rewrite или congruence primitive.

## 11. Rule/use слой

Замыкание sign axiom-aset не создаёт второй interpreter. Оно опирается на уже green candidate evidence:

| role | executable owner |
|---|---|
| exact sequence + Q state | `ts/test/v09-structural-carriers.test.ts` |
| canonical byte/string carrier | `ts/test/v09-byte-carrier.test.ts` |
| `I/DR/Rule`, `T ⟼ Rule`, generic replay | `ts/test/v09-structural-rules.test.ts` |
| FORMAL/Q context integration, `:`, `=`, relation, close | `ts/test/v09-context-integration.test.ts` |
| readiness negative gaps | `ts/test/v09-readiness.test.ts` |
| assembled F1 closure | `ts/test/v09-f1-axiom-aset.test.ts` |

Минимальные semantic Rule roles остаются:

```text
Q_OPEN
Q_VALUE
Q_CLOSE
Q_FINALIZE
FORMAL_OPEN
FORMAL_GROUP
FORMAL_LINK
FORMAL_COLON
FORMAL_EQUAL
FORMAL_CLOSE
PARENT_CONTINUE
```

Это роли structural Rules/contexts, а не `RuleKind`, opcode или callback identity.

## 12. Что F1 сознательно не решает

Не являются результатом #594:

```text
доказательство существования/единственности simultaneous solution
общая recursive equality theory
A6 как фундаментальная pair-equality аксиома
глобальная транзитивная equality closure
экстенсиональная equality Theory/Grammar declarations
derived logic
negation/inversion
bundle notation
ostensive ♂/♀ as mandatory minimal signs
accepted-release cutover
```

Эти вопросы принадлежат следующим слоям F2+.

## 13. Machine reconciliation

#597 уже классифицировал machine side:

```text
candidate = MTS v0.9
semanticBase = v0.8
observableSemanticDelta = true
executable candidate coverage = complete
accepted current = v0.8
```

Candidate implementation сохраняет no-instance, exact carriers, root-safe positions, structural Rules и immutable contexts.

До отдельного acceptance #610 нельзя объявлять v0.9 accepted или менять v0.8 public/current pointers.

## 14. Handoff в F2

После successful executable challenge этого документа #582 получает ровно:

```text
internal alphabet:
∞ [ ] 1 0 ( ) ⟼ : =

recursive sign constraints:
10 pole equations из раздела 4

sign representation:
E_g = c_g ⟼ m_g

internal axiom form:
A_g = ExactSequence(c_g, E_:, ExactSequence(m_start, E_⟼, m_end))

axiom-aset/theory presentation:
T_F1 = T_F1 ⟼ ExactSequence(A_g...)

explicit contexts:
I = D ⟼ (G ⟼ T_F1)
K = K ⟼ (parent ⟼ current)
I ⟼ K

META boundary:
≡ ♂ ♀ ↑ { } ¬ ↛ ∧ ⇔ ⇒ ≠ → and tooling aliases are not minimal F1 signs
```

Главный следующий вопрос #582 уже не «какими знаками записана система?», а строго: **что внутри МТС означает grounded simultaneous solution этой рекурсивной системы?**
