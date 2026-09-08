# Асеть доказательства МТС — ONE rooted proof Anet

Статус: текущая каноническая спецификация proof authority поверх принятой MTS `v0.11`.

Владельцы: #999, #1066, #1087, #1057, #1064, #1093. Semantic-delta escalation only: #995.

Исторический документ `docs/specs/Асеть доказательства МТС.md` сохраняется как proof-log. Этот документ заменяет только его устаревшие утверждения о **текущем исполнимом состоянии**.

```text
accepted MTS = v0.11
active semantic candidate = NONE
```

## 1. Главный закон

```text
proof authority = one rooted reachable MTS proof Anet
```

Host `Map`, `Set`, массивы, объекты, graph DTO, JSON и текст — только traversal/transport/presentation projections. Они не дают доказательного авторитета.

Принадлежность доказательству определяется rooted MTS topology и достижимым proof-support closure.

## 2. Общая внешняя форма

```text
ProofOccurrence = Claim ⟼ Support
```

`Claim` — точная доказываемая Link. `Support` — MTS topology, из которой trusted replay восстанавливает proof law.

`Claim`, `Support`, `ProofOccurrence` — поясняющие роли, не фундаментальные MTS-типы.

Запрещён host-authority слой вида:

```text
ProofStepKind
StructuralProofNode
IdentityProofNode
kind = structural | identity | ...
```

Если смысл occurrence нельзя восстановить из Links, он ещё не готов войти в общий rooted kernel.

## 3. Принятая rooted structural application V1

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

Structural application остаётся Theory-relative:

```text
Theory ⟼ StructuralRule
Theory ⟼ StructuralDerivationRule
```

Успешный replay производного доказательства не разрешает материализовать `Theory ⟼ DerivedDR`. Exact Theory revision должна оставаться неизменной.

## 4. Полная structural rho

Для одного primitive `StructuralDerivationRule` используется одна согласованная подстановка:

```text
rho : Role -> Link
```

Она одновременно обязана удовлетворять всем premise templates и conclusion template.

Для каждой Role в **RoleDictionary данного primitive rule** требуется ровно одно значение:

```text
missing binding     -> reject
conflicting binding -> reject
repeated Role       -> same exact value
grounded subtree    -> exact identity
```

Полнота rho не ослабляется. Открытым является другое: должна ли primitive application вообще владеть Roles более широкого enclosing generic scope. Это исследует #1093.

## 5. Принятая intrinsic recursive Link identity

Intrinsic identity также использует общий outer carrier:

```text
Occurrence = IdentityClaim(left,right) ⟼ ExactSequence(child ProofOccurrences)
IdentityClaim(left,right) = left ⟼ right
```

Replay восстанавливает точные recursive child obligations из Link topology и остаётся ROOT-bottomed/fail-closed.

Критически:

```text
intrinsic identity
!=
Theory-specific primitive admission
```

Нельзя создавать fake `Theory ⟼ IdentityRule` только ради унификации host API.

## 6. Принятый K1

```text
MIXED_ROOTED_PROOF_ANET_DEPENDENCY = SUPPORTED
```

Rooted structural application уже может использовать replay-valid intrinsic identity `ProofOccurrence` как dependency при точном совпадении требуемой Claim.

Следовательно один rooted proof Anet уже композиционно содержит минимум два proof laws:

```text
1. rooted structural application
2. intrinsic recursive Link identity
```

без host `ProofStepKind`.

## 7. Выбор proof law

Verifier order не является семантикой. Нельзя делать:

```text
try identity
catch -> try structural
```

как authority discriminator.

Концептуальный общий закон:

```text
0 valid interpretations -> invalid-proof-occurrence
1 valid interpretation  -> accept exact Claim
>1 interpretations      -> ambiguous-proof-support
```

Неоднозначность закрывается fail-closed.

## 8. Root reachability

```text
reachable proof-support closure from rooted target
=
proof membership authority
```

Поэтому unreachable proof occurrence, host evidence или cache entry ничего не доказывают.

Отдельно не решён вопрос self-describing carriers с outgoing incidence. Existing `Act` bindings читаются через outgoing attachments от `Act`, поэтому до принятия Act внутри rooted support необходимо явно определить:

```text
reachable Act
=> какие outgoing fields канонически входят в rooted support closure?
```

Этот вопрос специально фальсифицируется в #1093. Нельзя молча считать текущий `readExactActBindings` уже совместимым с rooted reachability law.

## 9. K1b Act-V2 пока НЕ принят

Предложенная #1092 форма:

```text
ApplicationV2
=
StructuralDerivationRule
  ⟼
ExactSequence(Act, dependency ProofOccurrences...)
```

находится **UNDER FALSIFICATION**.

Она возникла из witness:

```text
RoleDictionary = [A,B,C]
R1: A -> B
rho = {A=a,B=b,C=c}
```

где V1 видит `A/B`, но shared dictionary требует ещё `C`.

Repository-wide review обнаружил, что это может быть следствием старого deliberately shared-RoleDictionary slice, а не фундаментальной необходимости нести полный `Act` в каждом rooted occurrence.

## 10. Текущий discriminator #1093

Сравниваются две архитектуры.

### A. shared dictionary + Act-V2

```text
Dglobal = [A,B,C]
R1: A -> B
rho = {A=a,B=b,C=c}
```

Если primitive R1 семантически владеет всем `Dglobal`, invisible `C` действительно должен сохраняться MTS-native carrier'ом.

### B. local primitive dictionaries + existing mu

```text
D1 = [A,B]   R1: A -> B
D2 = [B,C]   R2: B -> C
Dglobal = [A,B,C]
```

с MTS-native mappings:

```text
mu1 : D1 -> Dglobal
mu2 : D2 -> Dglobal
```

Тогда concrete primitive substitutions локальны:

```text
rho1 = {A=a,B=b}
rho2 = {B=b,C=c}
```

и invisible Role исчезает не через ослабление rho, а потому что не принадлежит local primitive rule.

До executable classification #1093 нельзя утверждать, что Act-V2 необходим.

## 11. Cross-scope mu уже принят

N2 установил MTS-native generic Role transport:

```text
mu : source Role -> target Role
```

с exact source/target RoleDictionary, total mapping, target membership, capture safety, exact Theory и read-only replay.

Host `Map` не является authority.

Поэтому local-dictionary hypothesis обязана быть опровергнута до добавления новой rooted application topology.

## 12. Старый K2 путь закрыт

```text
#1090 = CLOSED / not_planned / SUPERSEDED
#1091 = CLOSED UNMERGED historical RED witness
```

`invalid-proof-occurrence` из #1091 остаётся полезным измерением старого пути, но не разрешает production fix.

После #1093 создаётся **новый** bounded K2 implementation plan из принятой архитектуры.

## 13. T4

```text
A ⟼ L = B ⟼ L
----------------
A = B
```

Текущий статус:

```text
STRUCTURE  = SUPPORTED
PROOF_ANET = GAP / not rerun after final K1b architecture
REUSE      = NOT TESTED
```

T4 нельзя повышать до `PROOF_ANET = SUPPORTED`, пока generic rooted application/discharge path не принят и исходный T4 witness не replayed через него.

## 14. Неизменные границы

Независимо от #1093 сохраняется:

```text
MTS Links/Anet topology = proof authority
host metadata = zero authority
exact Theory revision
DerivedDR is not self-admitted
replay is read-only
cycles fail closed
unreachable support grants nothing
proof-law ambiguity fails closed
NO Nat/T4-specific trusted opcode
```

Semantic boundary:

```text
accepted MTS = v0.11
active semantic candidate = NONE
```

Если executable evidence покажет observable semantic-contract delta:

```text
STOP -> #995 -> separate semantic-candidate lifecycle
```

## 15. Текущий порядок

```text
accepted K1
  ↓
#1093 test-only discriminator
  ↓
final K1b classification
  ↓
new K2 plan
  ↓
closed rooted proof Anet discharge
  ↓
exact T4 rerun
  ↓
reusable T4 evidence
  ↓
T5 reuse
```

Долгосрочный критерий остаётся:

```text
rooted MTS proof Anet
+
exact required Theory authority
        ↓
trusted replay reconstructs complete proof authority
```

без знания алгоритма построения Anet и без host-сортов доказательных сущностей.
