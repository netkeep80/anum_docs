# Асеть доказательства МТС — ONE rooted proof Anet

Статус: текущая каноническая спецификация proof authority поверх принятой MTS `v0.11`.
Владельцы: #999, #1066, #1087, #1057, #1064, #1093. Semantic escalation: #995.
Исторический `docs/specs/Асеть доказательства МТС.md` остаётся proof-log; здесь заменены только устаревшие утверждения о текущем состоянии.

```text
accepted MTS = v0.11
active semantic candidate = NONE
```

## 1. Главный закон
```text
proof authority = one rooted reachable MTS proof Anet
```
Host `Map`/`Set`, массивы, объекты, graph DTO, JSON и текст — только traversal/transport/presentation projections. Принадлежность доказательству определяется rooted MTS topology и достижимым proof-support closure.

## 2. Общая внешняя форма
```text
ProofOccurrence = Claim ⟼ Support
```
`Claim` — точная доказываемая Link. `Support` — MTS topology, из которой trusted replay восстанавливает proof law. Эти имена — поясняющие роли, не MTS-типы.

Запрещён host-authority слой `ProofStepKind`, `StructuralProofNode`, `IdentityProofNode`, `kind = structural | identity | ...`. Если смысл occurrence нельзя восстановить из Links, форма ещё не готова войти в общий rooted kernel.

## 3. Принятая rooted structural application V1
```text
Occurrence = Claim ⟼ ApplicationV1
ApplicationV1 = StructuralDerivationRule ⟼ ExactSequence(dependency ProofOccurrences)
```
Structural application Theory-relative:
```text
Theory ⟼ StructuralRule
Theory ⟼ StructuralDerivationRule
```
Успешный replay производного доказательства не разрешает `Theory ⟼ DerivedDR`; exact Theory revision остаётся неизменной.

## 4. Полная structural rho
Для primitive `StructuralDerivationRule` действует одна подстановка `rho : Role -> Link`, одновременно удовлетворяющая всем premises и conclusion. Для каждой Role в **RoleDictionary данного primitive rule** требуется ровно одно значение:
```text
missing/conflicting binding -> reject
repeated Role               -> same exact value
grounded subtree            -> exact identity
```
Полнота rho не ослабляется. Открыт иной вопрос: должна ли primitive application владеть Roles более широкого enclosing scope. Это исследует #1093.

## 5. Принятая intrinsic recursive Link identity
```text
Occurrence = IdentityClaim(left,right) ⟼ ExactSequence(child ProofOccurrences)
IdentityClaim(left,right) = left ⟼ right
```
Replay восстанавливает recursive obligations из Link topology и остаётся ROOT-bottomed/fail-closed.
`intrinsic identity != Theory-specific primitive admission`; fake `Theory ⟼ IdentityRule` ради унификации host API запрещён.

## 6. Принятый K1
```text
MIXED_ROOTED_PROOF_ANET_DEPENDENCY = SUPPORTED
```
Rooted structural application может использовать replay-valid intrinsic identity occurrence как dependency при точном совпадении Claim. Один proof Anet уже содержит rooted structural application и intrinsic recursive Link identity без host `ProofStepKind`.

## 7. Выбор proof law
Verifier order не является семантикой. `try identity; catch -> structural` не может быть authority discriminator.
```text
0 valid interpretations -> invalid-proof-occurrence
1 valid interpretation  -> accept exact Claim
>1 interpretations      -> ambiguous-proof-support
```
Неоднозначность fail-closed.

## 8. Root reachability
```text
reachable proof-support closure from rooted target = proof membership authority
```
Unreachable proof occurrence, host evidence или cache entry ничего не доказывают.
Existing `Act` bindings читаются через outgoing attachments, поэтому до принятия Act внутри rooted support надо явно определить: `reachable Act => какие outgoing fields входят в rooted support closure?`
Это фальсифицирует #1093. Текущий `readExactActBindings` нельзя автоматически объявлять совместимым с rooted reachability law.

## 9. K1b Act-V2 пока НЕ принят
#1092 предложил:
```text
ApplicationV2 = StructuralDerivationRule ⟼ ExactSequence(Act, dependency ProofOccurrences...)
```
но эта форма **UNDER FALSIFICATION**. Она возникла из witness:
```text
RoleDictionary = [A,B,C]
R1: A -> B
rho = {A=a,B=b,C=c}
```
V1 видит `A/B`, а shared dictionary требует ещё `C`. Review показал, что это может быть следствием старого deliberately shared-RoleDictionary slice, а не фундаментальной нуждой нести полный Act.

## 10. Discriminator #1093
Сравниваются две архитектуры.

### A. shared dictionary + Act-V2
```text
Dglobal=[A,B,C]
R1: A -> B
rho={A=a,B=b,C=c}
```
Если R1 семантически владеет всем `Dglobal`, invisible `C` должен сохраняться MTS-native carrier'ом.

### B. local primitive dictionaries + existing mu
```text
D1=[A,B]  R1: A -> B
D2=[B,C]  R2: B -> C
Dglobal=[A,B,C]
mu1: D1 -> Dglobal
mu2: D2 -> Dglobal
rho1={A=a,B=b}
rho2={B=b,C=c}
```
Тогда invisible Role исчезает не через partial rho, а потому что не принадлежит local primitive rule. До executable classification #1093 Act-V2 не считается необходимым.

## 11. Cross-scope mu уже принят
N2 установил MTS-native `mu : source Role -> target Role` с exact source/target RoleDictionary, total mapping, target membership, capture safety, exact Theory и read-only replay. Host `Map` не authority. Поэтому local-dictionary hypothesis обязана быть опровергнута до новой rooted topology.

## 12. Старый K2 путь закрыт
```text
#1090 = CLOSED / not_planned / SUPERSEDED
#1091 = CLOSED UNMERGED historical RED witness
```
`invalid-proof-occurrence` остаётся измерением старого пути, но не разрешает production fix. После #1093 создаётся новый bounded K2 plan.

## 13. T4
Для `A ⟼ L = B ⟼ L -> A = B` текущий статус:
```text
STRUCTURE  = SUPPORTED
PROOF_ANET = GAP / not rerun after final K1b architecture
REUSE      = NOT TESTED
```
T4 нельзя повышать до `PROOF_ANET = SUPPORTED` до принятия generic rooted application/discharge path и повторного replay исходного witness.

## 14. Неизменные границы
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
accepted MTS = v0.11
active semantic candidate = NONE
```
Observable semantic-contract delta, если он будет доказан: `STOP -> #995 -> separate semantic-candidate lifecycle`.

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
Долгосрочная цель: `rooted MTS proof Anet + exact required Theory authority -> trusted replay reconstructs complete proof authority`, без знания алгоритма построения Anet и без host-сортов доказательных сущностей.
