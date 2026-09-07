# MTS Nat Re-foundation Design

## Статус

Архитектурный research/design документ. Accepted MTS `v0.11` не изменяется этим документом. Активный semantic candidate не открывается автоматически.

## Причина пересмотра

Старый derived-foundation результат F5 отождествлял натуральный счёт с connectivity-degree формами:

```text
Nat(0) = U
Nat(1) = L
Nat(2) = L ⟼ L
Nat(3) = (L ⟼ L) ⟼ L
...
```

Из-за `U ⟼ L != L` нулевой переход требовал отдельного производного случая:

```text
S0(U) = L
S0(D) = D ⟼ L, D in Pos
```

Новое наблюдение показывает, что в этой модели были слиты как минимум три различных смысла:

```text
U      = unlinked / нулевая граница / отсутствие протяжённости
L      = linked / одна целая связь / единица меры протяжённости
Nat(1) = результат отсчёта одной единицы меры от нулевой границы
```

Особенно важно:

```text
abit `1` / L != автоматически натуральное число 1
```

Логическое чтение `L=true`, `U=false` также является контекстной интерпретацией, а не фундаментальным определением натуральных чисел.

## Новый главный кандидат

```text
N0 = U
N(n+1) = Nn ⟼ L
```

Первые формы:

```text
N0 = U
N1 = U ⟼ L
N2 = (U ⟼ L) ⟼ L
N3 = ((U ⟼ L) ⟼ L) ⟼ L
N4 = (((U ⟼ L) ⟼ L) ⟼ L) ⟼ L
...
```

Интерпретация:

```text
U = отсутствие протяжённости
L = одна целая связь, мера единичной протяжённости
Nn = n-кратная протяжённость, отсчитанная от нулевой границы
```

Это даёт один структурный successor для всего zero-inclusive carrier:

```text
Succ(N) = N ⟼ L
```

включая:

```text
Succ(N0) = U ⟼ L = N1
```

## Принцип «нет умолчаний»

МТС не должна молча отождествлять:

```text
единицу меры
числовое значение 1
символ/абит `1`
логическое true
связность вообще
```

Если эти смыслы совпадают в некоторой теории, совпадение должно быть выражено и доказано связевой структурой этой теории.

## Протяжённость и координата

Натуральное число в этой гипотезе является не точкой координатной оси, а мерой протяжённости:

```text
N1 = протяжённость от 0 до 1
N2 = две единичные протяжённости
N3 = три единичные протяжённости
```

Координата `n` является границей накопленной протяжённости, а не самой протяжённостью.

Повторение несвязи не создаёт протяжённость:

```text
unlinked repeated any finite number of times -> unlinked
```

Повторение единичной связи `L`, напротив, является содержательным актом наращивания уже установленной меры.

## Старый L-degree не удаляется

Формы:

```text
L
L ⟼ L
(L ⟼ L) ⟼ L
...
```

по новой гипотезе не обязаны быть самими натуральными числами. Они могут остаться самостоятельной измеряемой structural family — connectivity degree / loop degree.

Тогда вместо:

```text
Nat(n) = L-degree(n)
```

исследуется:

```text
Degree(L-degree(n)) = Nn
```

Это разделяет:

```text
измеряемую структуру
единицу меры
результат измерения
```

и позволяет одному Nat использоваться для степени петли, cardinality, arity, depth и других конечных количеств.

## Ordinal-like и Cardinal-like чтения

Не вводить primitive host types `Ordinal` или `Cardinal`.

Исследовать одну Nat-структуру с разным доказательным происхождением/контекстом.

### Ordinal-like

Последовательное построение сохраняет предыдущую форму как левый префикс:

```text
N(n+1) = Nn ⟼ L
```

Поэтому Nat может иметь порядковое чтение как достигнутая позиция/протяжённость после `n` единичных продолжений.

### Cardinal-like

Конкретная конечная Anet/sequence/occurrence carrier может проектироваться в Nat через Count/Cardinality:

```text
Count(empty)     = N0
Count(singleton) = N1
Count(two)       = N2
...
```

Порядок и содержание witness могут быть забыты, а конечное количество сохранено.

Обязательная граница:

```text
ordinal provenance != cardinal provenance
```

даже если итоговая Nat Link-форма совпадает.

## Peano obligations

Новая модель интересна именно потому, что Peano shape получается структурно, а не через специальный zero-to-one case:

```text
Zero = U
Succ(N) = N ⟼ L
```

Но это гипотеза до доказательства. Требуется доказать/фальсифицировать:

```text
1. closure: Nat(N) => Nat(N ⟼ L)
2. successor injectivity
3. U is not successor of any Nat
4. every non-zero Nat has a unique predecessor
5. finite no-collapse / no finite cycle
6. induction/minimality
7. initial 1+X algebra property or exact reason of failure
```

Successor injectivity должна следовать из ordered-pole identity:

```text
(A ⟼ L) = (B ⟼ L) => A = B
```

но это необходимо оформить как доказательство, а не считать автоматически завершённым.

## Count / Degree / arithmetic obligations

После Nat carrier:

```text
Count
Degree
Add
Mul
Order
```

должны быть перевыведены или фальсифицированы.

Нельзя сохранять старые результаты только потому, что их математические названия те же.

Особенно проверить:

```text
Count(empty)     = U
Count(singleton) = U ⟼ L

Add(a,N0)=a
Add(a,Succ(b))=Succ(Add(a,b))

Mul(a,N0)=N0
Mul(a,Succ(b))=Add(Mul(a,b),a)
```

## Relation to proof-calculus work

Generic proof-calculus results, не зависящие от конкретного Nat carrier, продолжаются.

В частности rooted proof Anet weakening:

```text
UsedPremises subset-of DeclaredPremises
```

является общим proof law и может быть завершён независимо.

Arithmetic ladder:

```text
L0
L1
COMM
```

ставится на semantic/re-foundation pause. Существующие proof fixtures на старом Nat0 являются regression/research evidence, но не должны использоваться для принятия новой Nat theory до завершения этого исследования.

## Relation to accepted MTS v0.11

Accepted v0.11 фиксирует фундаментальные Link identities и значения `L/U`, но текущий аудит не обнаружил `Nat0/S0/Count` в accepted contract/conformance surface.

Поэтому начальная классификация:

```text
accepted v0.11 mutation = NONE
active semantic candidate = NONE
new Nat theory = derived-foundation hypothesis under falsification
```

После executable evidence необходимо отдельно классифицировать результат:

```text
A. derived-theory correction only
B. observable accepted MTS semantic delta required
```

Только вариант B открывает отдельный candidate lifecycle и вопрос следующего номера версии. Номер версии заранее не назначается.

## Documentation requirement

После стабилизации Nat hypothesis создать отдельную центральную главу МТС:

```text
docs/theory/Натуральные числа, счёт и мера в МТС.md
```

Глава обязана объяснить минимум:

```text
U и нулевая граница
L как связь и единица меры
почему abit `1` не равен автоматически Nat(1)
протяжённость и координата
старую L-degree модель и причину пересмотра
новый Nat carrier
successor и Peano
Count/Cardinality
Ordinal-like reading
Degree/connectivity degree
Add/Mul/Order
границу accepted core vs derived arithmetic theory
```

До принятия результата глава должна честно маркировать candidate/research status; после acceptance должна быть синхронизирована с окончательным статусом.

## Governance / execution order

```text
N0 inventory / dependency impact
N1 direct falsification old-vs-new Nat carrier
N2 Peano laws
N3 Count/Cardinal/Ordinal/Degree separation
N4 derived Add/Mul/Order revalidation
N5 proof-calculus arithmetic replay on selected Nat theory
N6 semantic-delta classification
N7 documentation finalization
N8 candidate lifecycle only if required
```

Каждый executable этап получает отдельный bounded child Issue/ChangeIntent.

## Veto

```text
NO mutation of accepted v0.11 by discussion alone
NO automatic v0.12 naming
NO host integer as Nat identity
NO host Ordinal/Cardinal primitive types as semantic authority
NO conflation L == Nat(1) without proof
NO conflation abit `1` == Nat(1)
NO conflation L == true globally
NO deletion of old L-degree research evidence
NO arithmetic L0/L1/COMM acceptance on stale Nat assumptions
NO special-case successor merely to fit previous implementation
NO code changes before a falsifiable child slice
```
