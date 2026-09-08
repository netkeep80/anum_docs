# Асеть доказательства МТС — ONE rooted proof Anet

Статус: **текущая каноническая спецификация состояния proof authority** поверх принятой MTS `v0.11`.

Связанные владельцы:

```text
#999  proof-calculus authority
#1066 ONE MTS PROOF ANET
#1087 rooted mixed-proof architecture
#1057 Nat × proof theorem-challenge program
#1064 T4 successor-injectivity proof challenge
#1093 current K1b architecture discriminator
#995  semantic-delta escalation only
```

Историческая архитектурная спецификация:

```text
docs/specs/Асеть доказательства МТС.md
```

остаётся важным proof-log и источником происхождения решений. Этот документ **заменяет только её устаревшие утверждения о текущем исполнимом состоянии**, когда они расходятся с уже принятыми K1 / recursive-Link-identity результатами.

Принятая семантика МТС остаётся:

```text
accepted MTS = v0.11
active semantic candidate = NONE
```

Ни один результат ниже сам по себе не является semantic-contract delta.

---

## 1. Главный закон доказательного авторитета

```text
proof authority = one rooted reachable MTS proof Anet
```

Доказательный объект не является host-графом, массивом узлов, tagged union, TypeScript-объектом, JSON envelope или результатом callback.

Все такие структуры могут быть только проекциями:

```text
MTS proof Anet               <- authority
        |
        +-> Map / Set         <- traversal cache
        +-> array / index     <- operational projection
        +-> JSON              <- transport projection
        +-> graph             <- visual projection
        +-> formal notation   <- textual projection
```

Принадлежность доказательству определяется корневой MTS-топологией и доказательным замыканием, а не host-списком членов.

---

## 2. Общая внешняя форма доказанного вхождения

Принятая внешняя форма:

```text
ProofOccurrence = Claim ⟼ Support
```

`Claim` — точная доказываемая Link.

`Support` — MTS-топология, из которой доверенный replay должен однозначно восстановить допустимый proof law.

Имена `Claim`, `Support`, `ProofOccurrence` являются поясняющими ролями, а не фундаментальными MTS-типами.

Нельзя вводить авторитетную host-иерархию:

```text
StructuralProofNode
IdentityProofNode
TheoremProofNode
ProofStepKind
kind = structural | identity | ...
```

Если смысл proof occurrence нельзя восстановить из MTS-топологии, форма ещё не готова войти в общий rooted kernel.

---

## 3. Принятая rooted structural application V1

Для уже принятого структурного proof law поддерживается:

```text
Occurrence
=
Claim ⟼ ApplicationV1

ApplicationV1
=
StructuralDerivationRule
  ⟼
ExactSequence(dependency ProofOccurrences)
```

Для структурного применения точная rooted `Theory` остаётся примитивным авторитетом:

```text
Theory ⟼ StructuralRule
Theory ⟼ StructuralDerivationRule
```

Производное доказательство не получает примитивного разрешения только из-за успешного replay.

Запрещено:

```text
verified DerivedDR
  -> materialize Theory ⟼ DerivedDR
```

Точная ревизия `Theory` должна оставаться неизменной.

---

## 4. Полная структурная подстановка rho

Для одного primitive `StructuralDerivationRule` действует одна согласованная структурная подстановка:

```text
rho : Role -> Link
```

Она должна удовлетворять одновременно:

```text
всем premise templates
+
conclusion template
```

Для **каждой Role в exact RoleDictionary данного primitive rule** требуется ровно одно значение.

Действуют границы:

```text
missing role binding       -> reject
conflicting role binding   -> reject
repeated Role              -> same exact value
undeclared grounded Link   -> remains grounded
capture by target Role     -> reject where cross-scope mapping applies
```

Полнота rho не ослабляется только потому, что конкретная Role визуально не встретилась в одной части шага.

Открытым остаётся другой вопрос: должна ли primitive application вообще владеть Roles более широкого enclosing generic scope, которые не принадлежат её собственному локальному правилу. Этот вопрос теперь принадлежит #1093.

---

## 5. Принятая intrinsic recursive Link identity

Intrinsic recursive identity является отдельным уже принятым proof law над обычной MTS-топологией.

Его proof occurrence также имеет форму:

```text
Claim ⟼ Support
```

где:

```text
Claim = left ⟼ right
Support = ExactSequence(child ProofOccurrences)
```

Доказательный смысл восстанавливается из структурной формы сравниваемых Links и точных child occurrences.

Поддерживаются рекурсивные случаи, соответствующие полной/частичной self-closed форме и ordinary pair decomposition; уникальное ROOT-bottomed основание остаётся частью fail-closed replay.

Критически:

```text
intrinsic identity
!=
Theory-specific primitive theorem admission
```

Не создаётся искусственная связь:

```text
Theory ⟼ IdentityRule
```

лишь для унификации host API.

---

## 6. K1 — mixed rooted proof dependency composition

Принятый K1 результат:

```text
MIXED_ROOTED_PROOF_ANET_DEPENDENCY = SUPPORTED
```

Структурное primitive application может использовать intrinsic recursive identity `ProofOccurrence` как обычную dependency, если exact dependency `Claim` совпадает с требуемой premise Claim.

То есть один rooted proof Anet уже способен содержать минимум два proof laws:

```text
1. rooted structural application
2. intrinsic recursive Link identity
```

без превращения одного закона в разновидность другого и без host `ProofStepKind`.

Это и есть первый принятый шаг к:

```text
ONE MTS PROOF ANET
```

---

## 7. Выбор proof law только по топологии

Порядок host-verifier'ов не должен давать смысл.

Запрещено:

```text
try identity
catch -> try structural
```

как семантический discriminator.

Для одного candidate occurrence общий rooted kernel должен концептуально классифицировать все admitted на данном этапе proof laws:

```text
0 valid interpretations
  -> invalid-proof-occurrence

1 valid interpretation
  -> accept exact Claim

>1 valid interpretations
  -> ambiguous-proof-support
```

Неоднозначность закрывается fail-closed, а не порядком `if/switch/callback`.

---

## 8. Root reachability

Общий закон:

```text
reachable proof-support closure from rooted target
=
proof membership authority
```

Следствия:

```text
unreachable proof occurrence grants nothing
unreachable host evidence grants nothing
unreachable cache/index entry grants nothing
```

Но точное понятие reachability для self-describing carriers с outgoing incidence ещё не должно додумываться молча.

В частности existing `Act` bindings читаются через outgoing attachments от `Act`. Поэтому если Act когда-либо войдёт в rooted proof support, необходимо явно решить:

```text
reachable Act
=> какие именно outgoing fields считаются канонической частью его rooted support closure?
```

Этот вопрос сейчас специально фальсифицируется в #1093.

До его решения нельзя считать текущий `readExactActBindings` автоматически совместимым с rooted proof-membership law.

---

## 9. K1b Act-V2 НЕ принят

Предложенная в #1092 форма:

```text
ApplicationV2
=
StructuralDerivationRule
  ⟼
ExactSequence(
  Act,
  dependency ProofOccurrences...
)
```

**не является принятой архитектурой**.

Она возникла из измеренного случая:

```text
RoleDictionary = [A,B,C]
R1: A -> B
```

где rooted V1 видит только значения `A` и `B`, но shared dictionary требует ещё `C`.

Repository-wide review обнаружил, что это может быть следствием старого намеренно ограниченного generic slice:

```text
all primitive nodes share one exact RoleDictionary
```

а не фундаментальной необходимостью полного Act внутри каждого rooted occurrence.

---

## 10. Текущий K1b discriminator

#1093 сравнивает две архитектуры.

### Вариант A — shared dictionary + Act-V2

```text
Dglobal = [A,B,C]
R1: A -> B
rho = {A=a,B=b,C=c}
```

Если primitive R1 действительно семантически владеет всем `Dglobal`, rooted carrier должен сохранить invisible `C` каким-то MTS-native способом.

### Вариант B — local primitive dictionary + existing mu

```text
D1 = [A,B]
R1: A -> B

D2 = [B,C]
R2: B -> C

Dglobal = [A,B,C]
```

с уже существующими MTS-native morphisms:

```text
mu1 : D1 -> Dglobal
mu2 : D2 -> Dglobal
```

Тогда concrete primitive rho локальны:

```text
rho1 = {A=a,B=b}
rho2 = {B=b,C=c}
```

и invisible Role может исчезнуть не из-за ослабления полноты rho, а потому что она вообще не принадлежит локальному primitive rule.

До executable classification #1093 нельзя утверждать, что Act-V2 необходим.

---

## 11. Cross-scope role morphisms уже являются принятым proof-calculus механизмом

Предыдущая N2 работа установила MTS-native transport между generic RoleDictionaries:

```text
mu : source Role -> target Role
```

с явными структурными требованиями:

```text
exact source dictionary
exact target dictionary
total mapping over source Roles
target Role membership
capture safety
exact Theory
read-only verification
```

Host `Map` не является authority.

Поэтому local-scope hypothesis #1093 обязана быть сфальсифицирована до добавления новой rooted application topology.

---

## 12. Старый K2 план больше не является execution authority

Исторический K2 owner:

```text
#1090
```

закрыт:

```text
CLOSED / not_planned / SUPERSEDED
```

PR:

```text
#1091
```

закрыт unmerged и сохраняется только как executable RED witness старого пути.

Его `invalid-proof-occurrence` остаётся полезным измерением, но не разрешает конкретный production fix.

После #1093 должен быть создан **новый K2 implementation plan**, основанный на принятой архитектуре, а не восстановлен старый план.

---

## 13. Текущий T4 статус

Theorem challenge:

```text
A ⟼ L = B ⟼ L
----------------
A = B
```

текущий статус:

```text
STRUCTURE  = SUPPORTED
PROOF_ANET = GAP / not yet rerun after final K1b architecture
REUSE      = NOT TESTED
```

T4 нельзя повышать до `PROOF_ANET = SUPPORTED`, пока generic rooted application/discharge path не принят и исходный T4 witness не replayed через него.

T5 остаётся downstream reuse challenge.

---

## 14. Что остаётся неизменным

Независимо от результата #1093 сохраняются законы:

```text
proof authority = MTS Links/Anet topology
host metadata = zero authority
exact Theory revision
primitive authority is explicit
DerivedDR is not self-admitted
replay is read-only
cycles fail closed
unreachable proof support grants nothing
proof-law ambiguity fails closed
no Nat/T4-specific trusted opcode
```

Также сохраняется semantic boundary:

```text
accepted MTS = v0.11
active semantic candidate = NONE
```

Если executable evidence когда-либо покажет реальный observable semantic-contract delta:

```text
STOP
-> #995
-> separate semantic-candidate lifecycle
```

Нельзя молча менять accepted `v0.11` и нельзя заранее называть следующую версию.

---

## 15. Текущий порядок работы

```text
accepted K1
  ↓
#1093 test-only discriminator
  ↓
final K1b classification
  ↓
new bounded K2 plan
  ↓
closed rooted proof Anet discharge
  ↓
exact T4 rerun
  ↓
reusable T4 evidence
  ↓
T5 reuse challenge
```

Aprover остаётся downstream-blocked до принятого reusable theorem path.

---

## 16. Критерий архитектурной завершённости

Долгосрочная цель остаётся прежней:

```text
rooted MTS proof Anet
+
exact required Theory authority
        ↓
trusted replay reconstructs complete proof authority
```

без знания алгоритма построения proof Anet и без host-классификации математических или доказательных сущностей.

```text
всё доказательство выражено связями
смысл доказательного support выражен связями
```
