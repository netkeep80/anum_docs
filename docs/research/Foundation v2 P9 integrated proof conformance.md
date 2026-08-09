# Foundation v2 P9 — integrated proof/checker conformance

Статус: **Gate P candidate / research integration record**, не accepted версия МТС.

Issue: #257. Parent Gate P: #237.

Этот документ фиксирует первый end-to-end сценарий будущего trusted checker-а `aprover`. Он не вводит новый оператор и не расширяет proof calculus; его цель — проверить, что уже принятые candidate-слои действительно образуют одну машину.

## Полная цепочка

```text
UTF-8 source `decompose`
        │
        ▼
canonical astring content C
        │
        ▼
exact source occurrence S
        │
        ▼
selected source slice
        │
        ▼
scoped D declaration occurrence
        │
        ▼
exact Rule
        │
        ├────────── G admission of form sequence
        └────────── T admission of form sequence
        │
        ▼
true local equality actual act A_eq
        │
        ▼
exact direct admission T ⟼ Rule
        │
        ▼
one-step proof-rule actual act A_rule
        │
        ▼
exact Run = [A_eq, A_rule]
        │
        ▼
read-only integrated replay
```

## 1. Source выбирает правило, а не host opcode

Пусть пользователь/поисковая сторона выбрали исходник:

```text
decompose
```

Scoped dictionary содержит точное declaration occurrence, через которое source content разрешается в exact `Rule`.

Trusted source replay проверяет:

```text
bytes
→ canonical C
→ exact S
→ exact slice boundaries
→ visible declaration occurrence in D
→ exact Rule
→ exact G/T source admission
```

Integrated checker затем требует:

```text
source-selected Rule
is
proof-application Rule
```

Не одинаковый label, не та же форма, не тот же host enum — **тот же exact occurrence**.

## 2. Theory identity также сквозная

Source evidence и proof application обязаны использовать одну exact `T`:

```text
source.theory is application.theory
```

Отдельно proof-rule replay проверяет прямое admission evidence:

```text
RuleMembership = T ⟼ Rule
```

Поэтому валидный source под другой теорией `T2` не может незаметно подменить правило, применяемое под `T1`.

## 3. Premise — реальный local equality act

В exact context `K` находятся representative constraints, например:

```text
K ⟼ (L ⟼ R0)
K ⟼ (R ⟼ R0)
```

Отсюда только в данном K:

```text
rep_K(L) = R0
rep_K(R) = R0
Equal_K(L,R) = true
```

Equality evaluation фиксируется actual occurrence `A_eq`. Integrated checker не принимает внешний boolean `true`: он вызывает trusted equality replay и повторно проверяет exact K/operands/representatives/A.

## 4. Rule application

Для завершённых связей:

```text
L = l_start ⟼ l_end
R = r_start ⟼ r_end
```

отдельно admitted one-step rule проверяет exact claims:

```text
C_start = l_start ⟼ r_start
C_end   = l_end   ⟼ r_end
```

и actual application `A_rule`.

Правило observational:

```text
K_before is K_after
```

Claims не становятся equality bindings автоматически и nested links не разлагаются рекурсивно.

## 5. Run фиксирует provenance доказательства

Выбранный proof artifact содержит exact order:

```text
Run0 = R
Run1 = Run0 ⟼ A_eq
Run2 = Run1 ⟼ A_rule
```

Trusted run replay требует именно:

```text
(A_eq, A_rule)
```

и exact context continuity. Перестановка acts или подмена occurrence с теми же видимыми полями не должна приниматься.

## 6. Integrated checker ничего не ищет

Production-facing entry point:

```text
replay_integrated_proof(network, evidence, byte_refs)
```

не должен:

```text
лексить/парсить source заново;
искать Rule;
ранжировать proof candidates;
выводить equality по shape;
выбирать theory;
рекурсивно применять rules;
materialize-ить claims/K/A;
обращаться к legacy proof checker.
```

Он только компонует существующие trusted replay layers и проверяет cross-layer exact identity.

## 7. Почему это важно для апамяти

В одной сети теперь могут одновременно жить:

```text
application links
source carrier/evidence
scoped dictionaries
G/T admissions
context K
local representatives
actual acts
proof claims
Run
```

При этом controller апамяти сохраняет фундаментальное разделение:

```text
find / select / replay != materialize
```

Поисковая часть `aprover` может использовать любые индексы и эвристики апамяти, но proof acceptance сводится к replay selected exact relations.

Это даёт практическую архитектуру:

```text
             APAMEMORY
                 │
       ┌─────────┴─────────┐
       │                   │
untrusted search       trusted replay
indices/heuristics     exact evidence only
       │                   │
       └──── candidate ─────┘
                 │
                 ▼
          accepted / reject
```

## 8. Что P9 ещё не означает

P9 не является публикацией Foundation v2 и не разрешает repin `aprover`.

После успешного integrated proof conformance остаются release blockers:

```text
#242  executable Anum sequence → апамять materialization
#124  persistent L4/backend contract
historical compatibility classification
atomic removal/cutover of old production semantic path
versioned integrated conformance corpus
explicit Foundation-v2 acceptance decision
published next MTS contract/version
aprover repin
```

Следующий шаг после P9 должен вернуться именно к этим deferred blockers, а не добавлять новые операторы без необходимости.
