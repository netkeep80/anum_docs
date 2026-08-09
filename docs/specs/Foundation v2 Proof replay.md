# Foundation v2 — proof-rule replay candidate

Статус: **Gate P candidate**, не accepted proof calculus и не разрешение на repin `aprover`.

Связанные задачи: Gate P #237, local `=` #251/#252, exact run #253/#254, proof-rule gate #255/#256, integrated checker #257/#262, future sequence→апамять #242, persistent L4 #124.

> Proof-rule слой уже не является отдельной незавершённой веткой: он merged в `main` и включён в P9 integrated source→proof→Run replay. Candidate-статус сохраняется до общей Foundation-v2 acceptance.

## 1. Зачем нужен отдельный proof-rule слой

Foundation v2 различает:

```text
поиск candidate
проверку отдельного actual act
проверку exact порядка acts
логическое правило вывода
```

Эти вещи нельзя схлопывать.

Например из того, что два соседних actual acts образуют корректный run:

```text
K0 --A0--> K1 --A1--> K2
```

не следует никакое скрытое:

```text
K0 → K2
```

и не появляется логическая транзитивность.

Аналогично local equality:

```text
Equal_K(L,R) = true
```

сама по себе не должна рекурсивно разбирать `L/R` и создавать новые equality bindings. Если decomposition нужна доказательству, она должна быть **отдельно выбранным и admitted правилом**.

## 2. Первый rule candidate

Первое правило намеренно узкое: одношаговая decomposition истинного local equality двух завершённых бинарных связей.

Premise:

```text
L = l_start ⟼ l_end
R = r_start ⟼ r_end

Equal_K(L,R) = true
```

Rule application предъявляет две exact claim-связи:

```text
C_start = l_start ⟼ r_start
C_end   = l_end   ⟼ r_end
```

Это **claims**, а не автоматические representative bindings.

После replay правила контекст K остаётся тем же:

```text
K_before = K_after = K
```

и из наличия `C_start/C_end` ещё не следует, что их полюса локально отождествлены. Следующий proof act обязан явно использовать нужную semantics.

## 3. Rule должен быть явно допущен теорией

Trusted checker не делает:

```text
if operands_are_links:
    decompose()
```

В сети должно существовать exact evidence:

```text
RuleMembership = T ⟼ Rule
```

И application act должен назвать именно:

```text
T
Rule
RuleMembership
```

Поэтому две разные теории могут разрешать разные наборы proof rules над одной и той же low-level сетью без изменения самих данных.

## 4. Premise — это replayed actual equality act

Правило не доверяет host-флагу `premise=true`.

Оно получает exact `EqualityEvaluationEvidence` и повторно проверяет существующую local equality semantics:

```text
rep_K(L)
rep_K(R)
```

Premise допускается только если:

```text
rep_K(L) is rep_K(R)
```

и actual equality act содержит exact operands/representatives/context.

Подмена:

```text
L → L'
```

где `L'` имеет те же полюса, но является другим occurrence, запрещена. Shape similarity не заменяет exact premise identity.

## 5. Actual proof-rule act

Application правила — ещё один exact actual act того же Gate-R семейства.

Минимальное evidence:

```text
premise-equality-act
theory
rule
rule-membership
left-relation
right-relation
start-claim
end-claim
before-context
after-context
```

Заголовок:

```text
P0 = D_roles ⟼ K_after
H  = I ⟼ P0
A  = A ⟼ H
```

Для этого observational rule:

```text
K_after = K_before
```

Так application естественно входит в exact `Run` как no-context-change step.

## 6. Trusted replay

Проверка выполняется в следующем порядке:

```text
1. replay exact equality premise A_eq
2. require premise == true
3. verify exact T ⟼ Rule membership
4. verify L/R are complete exact links
5. verify C_start = L.start ⟼ R.start
6. verify C_end   = L.end ⟼ R.end
7. verify exact application A header/fields
8. require exact K_before is K_after
9. require network snapshot unchanged
```

Ни один шаг не требует доверять proof search.

## 7. Правило строго одношаговое

Если полюса сами являются связями:

```text
L.start = a ⟼ b
R.start = c ⟼ d
```

первое применение выдаёт только:

```text
C_start = L.start ⟼ R.start
```

Оно **не** продолжает автоматически:

```text
a ⟼ c
b ⟼ d
```

Для следующего уровня нужен новый явно выбранный rule application с собственным exact premise/admission/actual act.

Это сохраняет конечность, provenance и контролируемую силу proof calculus.

## 8. Связь с апамятью

Этот слой хорошо показывает прикладное значение апамяти как controller-а сетей связей.

В одной exact network могут одновременно находиться:

```text
application data
K и local representatives
T и rule membership
actual equality act
proof-rule actual act
claim links
Run, фиксирующий порядок acts
```

Но наличие этих links не означает скрытого выполнения всех возможных правил.

Апамять предоставляет:

```text
find / enumerate candidate evidence
```

поисковой стороне, а trusted checker делает:

```text
replay selected exact evidence
```

без materialization новых facts.

Поэтому можно построить быстрый эвристический `aprover`, не включая алгоритм поиска в trusted computing base.

Подробнее: [Апамять и управление сетью связей](Апамять%20и%20управление%20сетью%20связей.md).

## 9. Что намеренно запрещено

```text
recursive rule firing by default
global theorem closure
automatic representative binding
graph-isomorphism equality
hidden modus ponens
hidden transitivity
hidden congruence/substitution
host enum as Rule identity
proof AST as ontology
```

Rule identity, theory admission, operands, claims и actual application — exact link occurrences.

## 10. Архитектура aprover

```text
                    untrusted
                       │
              candidate proof search
             indices / heuristics / UI
                       │
                       ▼
                selected evidence
                       │
              ─────────┼─────────
                       │ trusted
                       ▼
              source/D/G/T replay
                       │
                       ▼
                 act replay
             relation / : / =
                       │
                       ▼
             admitted rule replay
                       │
                       ▼
               exact Run replay
                       │
                       ▼
                proof accepted
```

Versioned contracts + conformance corpus `anum_docs` должны стать источником этой trusted semantics. `aprover` после Foundation-v2 acceptance должен потреблять их, а не реализовывать собственное толкование МТС.

## 11. P9 integrated proof/checker уже закрыт

После proof-rule gate был реализован P9 integrated artifact:

```text
source `decompose`
→ scoped D
→ explicit G/T
→ exact Rule
→ true equality A_eq in exact K
→ direct T ⟼ Rule
→ A_rule
→ exact Run[A_eq,A_rule]
→ read-only integrated replay
```

`core/foundation_v2_checker.py` проверяет сквозное exact identity:

```text
source Rule is proof Rule
source T is proof T
premise K is proof K is Run K
Run acts are exactly A_eq then A_rule
```

Он не вводит новый proof language и не ищет proof сам.

Research record: [Foundation v2 P9 integrated proof conformance](../research/Foundation%20v2%20P9%20integrated%20proof%20conformance.md).

## 12. Что остаётся до accepted версии

После P9 дальнейшее расширение proof operators **не является текущим приоритетом**.

Release chain:

```text
#261  main documentation refresh
#242  Anum sequence → апамять materialization
#124  persistent L4/backend contract
historical compatibility classification
atomic production cutover
versioned integrated conformance corpus
explicit Foundation-v2 acceptance
next published MTS version
aprover repin
```

До этого proof layer остаётся production-facing candidate и evidence следующей архитектуры, но не отдельной accepted версией.
