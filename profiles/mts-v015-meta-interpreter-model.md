# Метаинтерпретатор A-memory v0.15 — модель организации исполнения

> **Статус:** RESEARCH CANDIDATE.  
> **Принятая база:** MTS v0.14 неизменна.  
> **Машиночитаемый источник этой проекции:** `profiles/mts-v015-meta-interpreter-model.json`.  
> Этот документ не принимает новую семантику автоматически. Его задача — не дать исследованиям, тестам и реализациям снова разойтись и забыть уже найденные границы.

## 1. Зачем нужен этот документ

A-memory должна быть описана не набором разрозненных реализационных механизмов, а одной проверяемой моделью:

```text
полное состояние A-memory M_t
        ↓
одна generalized parallel MP / reaction
        ↓
полное состояние A-memory M_(t+1)
```

Целевая self-hosted граница:

```text
снаружи:
- физическое хранение/канонизация Links;
- реализация одной общей параллельной реакции;
- произвольный CPU/GPU/ASIC scheduling, эквивалентный этой реакции.

НЕ снаружи:
- current Context pointer;
- program counter;
- selected Scope pointer;
- AND/OR/function/proof opcodes;
- program-specific semantic dispatch.
```

Следовательно, всё необходимое для запуска, остановки, сериализации, переноса и продолжения исполнения должно находиться в самой A-memory.

## 2. Как читать статусы

- **ACCEPTED_BASELINE** — уже входит в принятую MTS v0.14.
- **PROVED_RESEARCH** — подтверждено исследовательскими falsifier/test evidence, но само по себе не меняет принятую версию.
- **STRONGLY_SUPPORTED_CANDIDATE** — сильный кандидат, для которого уже есть хорошие положительные и отрицательные свидетельства.
- **CANDIDATE** — рабочая гипотеза.
- **OPEN** — вопрос не закрыт.
- **FALSIFIED** — вариант опровергнут.
- **IMPLEMENTATION_ONLY** — поведение реализации, которое не является семантической властью МТС.

## 3. Что уже известно про корень Context

Исследование A68c специально сравнивало `R`, `O` и `C`.

Для `O` доказана структурная неоднозначность:

```text
O = START(R)
  = Context(R,R)
  = ExactSequence([R])
```

Кроме того, generic Context ancestry не останавливается на `O`, потому что `O` само читается как Context с parent=`R`.

Для прямой gauge сильнее выглядит:

```text
C = END(R)
```

Потому что `C`:

- не читается как обычный Context;
- не читается как ExactSequence;
- даёт естественный END-boundary;
- позволяет START-growing Context chain, ancestry которой останавливается на `C`;
- не смешивает execution scaffold ancestry с обычной R-rooted sequence topology.

Исторический вывод исследования уже был:

```text
C_AS_FINAL_CONTEXT_ROOT = CANDIDATE_STRONGLY_SUPPORTED_NOT_ACCEPTED
```

То есть этот результат нельзя снова забывать, но пока нельзя и объявлять принятым.

### Важная оговорка о хиральности

v0.14 не делает абсолютный глобальный `C` привилегией Foundation. START/END — контекстно ориентированные роли, зеркальная gauge через `J` должна оставаться ковариантно эквивалентной.

Поэтому фундаментальнее говорить:

> корень пространства исполнения — END-ориентированная однополюсная граница; в текущей прямой gauge она представлена `C`.

## 4. Первый Context — не C, а K0 под C

Рабочий кандидат:

```text
C                         boundary
└─ K0 = START(C -> S0)    concrete entry
   └─ K1 = START(K0->S1)
      ├─ K2A
      └─ K2B
```

То есть:

```text
parent(K0)  = C
current(K0) = S0
```

Сам `C` является границей пространства исполнения, а не первым state-carrying Context.

## 5. Активация должна быть внутри A-memory

A68d уже проверял важное различие.

Просто существование payload:

```text
C -> S0
```

не является запуском.

А физическое существование:

```text
K0 = START(C -> S0)
```

может служить Link-native признаком конкретного execution entry.

Не требуется отдельный:

```text
active=true
entryRegistry[K0]=true
programCounter=K0
```

### FORMAL в JSON — данные без запуска

```json
{
  "S0": "A",
  "EntryPayload": "C->S0"
}
```

### FORMAL в JSON — кандидат entry

```json
{
  "S0": "A",
  "K0": "♂(C->S0)"
}
```

Здесь нет `"type":"Context"`. Роль выводится из Link-структуры.

> Синтаксис `♂(...)` здесь — рабочая v0.15-проекция с использованием принятого v0.14 остенсивного START. Точное surface spelling должно пройти Author gate.

## 6. Context tree хранит carrier ancestry, но не semantic history

Рост:

```text
K0 = START(C -> S0)
K1 = START(K0 -> S1)
K2 = START(K1 -> S2)
```

не требует изменения полюсов `K0` и `K1`.

Старые Context могут физически оставаться как неизменяемая carrier ancestry, потому что на них ссылаются потомки. **Это не semantic history и не Result. Context остаётся временным execution scaffold; физическое существование Link не означает currentness.**

### FORMAL JSON

```json
{
  "S0": "A",
  "S1": "B",
  "K0": "♂(C->S0)",
  "K1": "♂(K0->S1)"
}
```

Значит состояние можно заморозить вместе со всей A-memory и позже восстановить без внешнего указателя `resumeFrom=K1`.

## 7. Параллельное ветвление — часть топологии

Если одна реакция даёт несколько продолжений:

```text
K1
├─ K2A
└─ K2B
```

то это естественный параллельный frontier.

### FORMAL JSON

```json
{
  "S0": "A",
  "S1": "B",
  "S2A": "X",
  "S2B": "Y",
  "K0": "♂(C->S0)",
  "K1": "♂(K0->S1)",
  "K2A": "♂(K1->S2A)",
  "K2B": "♂(K1->S2B)"
}
```

Никакой scheduler не должен создавать семантический порядок между `K2A` и `K2B`, если его нет в Link-структуре.

## 8. Завершение ветви

A70e использовал branch-local END closure:

```text
END(K)
```

В текущей формальной проекции:

```json
{
  "S0": "A",
  "K0": "♂(C->S0)",
  "CloseK0": "K0♀"
}
```

В append-only carrier физический Context может остаться, но после закрытия он не является current state и не превращается в semantic history.

## 9. Рабочее правило frontier

Исследовательская модель A70e:

```text
active leaf =
    C-rooted reachable Context
    AND no START child
    AND no END closure
```

Это хорошо объясняет:

- новый `K0` активен;
- появление START-child делает предка историей;
- несколько детей дают sibling frontier;
- END закрывает только соответствующую ветвь;
- завершённое дерево остаётся физически в памяти, но не перезапускается.

Этот отрицательный frontier-кандидат теперь **superseded** A8.

Текущая модель не определяет currentness через отсутствие child/END. Она использует положительный witness членства самой семантической Aset:

```text
E -> K ∈ M_t
```

Физическое существование `K`, его детей или ancestry само по себе currentness не задаёт. Внешний `currentScope` и отрицательный leaf-test нельзя возвращать как shortcut.

## 10. Generalized parallel MP

Цель МТС — определить один наблюдаемый причинный шаг независимо от железа:

```text
snapshot M_t
    ↓
найти ВСЕ применимые MP
    ↓
вычислить полный successor
    ↓
atomic commit
    ↓
M_(t+1)
```

CPU может сделать scalar MP последовательно, GPU — тысячами потоков, будущий ассоциативный чип — миллиардами одновременно.

Семантика должна быть одинаковой.

Нужно доказать:

- fan-out completeness;
- order independence;
- partition invariance;
- generation isolation;
- atomic publication;
- canonical convergence;
- NO_MATCH != matched-empty;
- корректность hardware decomposition/refinement.

## 11. Что сейчас делает frozen A-memory и почему это не финальная модель

Frozen `netkeep80/amemory@832daa89...` всё ещё получает от host:

```text
begin_run(initial)
engine.set_current([initial])
engine.set_interpreter(interpreter)
```

и interpreter даёт selected Theory.

Это полезный compatibility backend, но **не self-hosted semantic authority**.

Цель v0.15 сильнее:

```text
НЕ:
execute(M, currentPointer, theoryPointer)

А:
Gamma(M)
```

Все semantic roots/authorities/currentness должны быть восстановимы из `M`.

## 12. Meta-interpreter: что пока нельзя смешивать

Отдельные оси:

```text
A. parallel/fan-out MP
B. structural matching/binding
C. substitution/instantiation
D. cross-current-member join
```

M6B уже показывает: exact grounded S0-MP сам по себе не умеет на свежей вложенной структуре вывести bindings и построить substituted output.

Но это ещё не доказывает, что matching/instantiation должны стать отдельными host-командами.

Открытый вопрос #1990:

> могут ли необходимые meta-операции быть представлены внутри самой A-memory как Aset и исполняться той же общей реакцией без скрытой host semantics?

## 13. Как FORMAL JSON должен использоваться в этом документе

JSON здесь не вводит ontology types.

Разрешённая идея:

```json
{
  "K0": "♂(C->S0)"
}
```

Неправильная идея:

```json
{
  "type": "Context",
  "parent": "C",
  "current": "S0",
  "active": true
}
```

Первое описывает Link-native FORMAL структуру.

Второе подменяет МТС host object model.

## 14. Freeze / transfer / resume — обязательный falsifier

Для полной self-hosted модели должен выполняться сценарий:

```text
M_t
↓ serialize whole A-memory
bytes / storage image
↓ transfer
restore M_t
↓ generalized reaction only
M_(t+1)
```

Запрещён скрытый sidecar:

```text
currentContextId
currentScope
programCounter
selectedExecutionEntry
hostCallStack
```

Если без него исполнение не продолжается тождественно — self-hosted модель не закрыта.

## 14a. Исполняемая проверка freeze / transfer / resume

Новый v0.15 falsifier:

`ts/test/v015-self-contained-context-freeze-resume-a5.test.ts`

получил:

```text
SELF_CONTAINED_CONTEXT_FREEZE_RESUME=GREEN_RESEARCH
EXTERNAL_CURRENT_CONTEXT_POINTER=0
EXTERNAL_CURRENT_SCOPE_POINTER=0
EXTERNAL_PROGRAM_COUNTER=0
WHOLE_MEMORY_CANONICAL_FREEZE_TRANSFER_RESTORE=GREEN
ENTRY_IDENTITY_RECONSTRUCTED_AFTER_RESTORE=TRUE
FRONTIER_RECONSTRUCTED_AFTER_RESTORE=TRUE
RESUME_WITHOUT_SERIALIZED_CONTEXT_HANDLE=GREEN
```

Проверка строит C-rooted execution tree с двумя entries, ветвлением и закрытой ветвью, экспортирует **всю Link topology без execution sidecar**, восстанавливает её в новой Memory, заново выводит entries/frontier и продолжает рост дерева. После продолжения выполняется ещё один freeze/restore.

Это доказывает **self-describing execution state**, но пока не доказывает полный self-hosting:

```text
HOST_FRONTIER_TRAVERSAL=RESIDUAL_READ_ONLY_ORACLE
NEGATIVE_ABSENCE_TESTS=RESIDUAL
FULL_SELF_HOSTED_GENERALIZED_REACTION=NOT_YET_PROVEN
```

То есть внешний указатель состояния уже не нужен как информация, но алгоритм вывода current frontier ещё требуется выразить/обосновать внутри общей семантики МТС.

## 14b. Theory внутри ancestry Context

A6 проверяет кандидат, в котором выбранная Theory больше не приходит снаружи:

```text
E  = C -> Theory
K0 = START(E  -> (X->A))
K1 = START(K0 -> (X->B))
```

Результат:

```text
SELF_CONTAINED_CONTEXT_THEORY=GREEN_RESEARCH
EXTERNAL_SELECTED_THEORY_POINTER=0
THEORY_DERIVED_FROM_CONTEXT_ANCESTRY=TRUE
REACTION_START_THEORY_SNAPSHOT=TRUE
SAME_REACTION_NEW_ADMISSION_EXECUTABLE=FALSE
NEXT_REACTION_NEW_ADMISSION_EXECUTABLE=TRUE
FORWARD_ENTRY_ORDER_MATCHES=1_1_0
REVERSE_ENTRY_ORDER_MATCHES=1_1_0
FINAL_CANONICAL_TOPOLOGY_SAME=TRUE
```

Это также исправляет важную историческую ловушку A73j/A73k. Старый live-Memory эксперимент мог дать `2,0` при generator-first и `1,1,0` при target-first: вновь созданный `Theory->relation` становился видим позднему sibling в том же проходе. Текущий execution profile требует reaction-start snapshot, поэтому новое admission становится причинно доступно только следующему поколению.

A6 пока **не утверждает**, что `E=C->Theory` — окончательная принятая форма environment, и не устраняет host read-only traversal/matching oracle.

## 14c. Context-frontier вместо Scope

A7 связал старую Context-lifecycle идею с текущим generalized-reaction profile:

```text
NO_MATCH      -> тот же active leaf
matched ZERO  -> END(K)
ONE           -> один START-child
MANY          -> несколько sibling START-children
N -> M        -> pointwise reaction всего active frontier
duplicates    -> canonical convergence
```

Исполняемая проверка:

`ts/test/v015-context-tree-reaction-cardinality-a7.test.ts`

дала:

```text
CONTEXT_TREE_GENERALIZED_REACTION=GREEN_RESEARCH
EXTERNAL_CURRENT_SCOPE_POINTER=0
CONTEXT_TREE_SUCCESSOR_EQUALS_POINTWISE_REFERENCE=TRUE
OLD_SCOPE_HANDOFF_REQUIRED=FALSE_FOR_TESTED_VECTOR
FORWARD_REVERSE_ENTRY_ORDER=CANONICAL_SAME
```

Это означает только то, что **для проверенного профиля отдельный semantic Scope-root/handoff не обязателен**: current state можно представить active frontier дерева Context.

Но Context по-прежнему является временным execution scaffold, а не историей. Физически сохранённая ancestry в append-only carrier не получает от этого semantic authority.

Открытый остаток:

```text
HOST_FRONTIER_TRAVERSAL=RESIDUAL
HOST_RELATION_SNAPSHOT_MATCH=RESIDUAL_READ_ONLY_ORACLE
NEGATIVE no-child / no-END tests = RESIDUAL
```

## 14d. Положительная currentness как membership самой Aset

A72n когда-то уже доказал:

```text
append-only CURRENT -> Scope
+ ещё один CURRENT -> Scope'
!= замена currentness
```

Две физически существующие связи становятся неоднозначны. Минимальная развилка была:

```text
MUTABLE_CURRENTNESS
OR EXTERNAL_ROOT
OR EXPLICIT_LIFECYCLE_SEMANTICS
```

A8 проверяет **первую** ветку без внешнего root.

Пусть:

```text
E = C -> Theory
K = Context(...)
```

Текущесть положительно представлена membership самой исполняемой Aset:

```text
E
K
K.current
E -> K       <- active membership witness
```

При реакции membership меняется атомарно:

```text
NO_MATCH:
  E->K остаётся

ZERO:
  E->K уходит из M_(t+1)

ONE/MANY:
  E->K уходит
  E->K1, E->K2, ... входят в M_(t+1)
```

Физические canonical Links старого состояния могут остаться в carrier. Это не currentness:

```text
physical Link existence != membership in M_t
```

Исполняемый A8 дал:

```text
POSITIVE_ASET_CURRENTNESS=GREEN_RESEARCH
NO_NEGATIVE_LEAF_TEST_REQUIRED=TRUE
EXTERNAL_CURRENT_POINTER=0
EXTERNAL_SCOPE_POINTER=0
REACTION_ATOMICALLY_REPLACES_SEMANTIC_MEMBERSHIP=TRUE
FREEZE_TRANSFER_RESTORE_INCLUDES_ASET_MEMBERSHIP=GREEN
CURRENT_TRUTHS_RECONSTRUCT_WITHOUT_POINTER=TRUE
```

Это лучше согласуется с исходным требованием: **A-memory сама является самомодифицирующейся Aset**, а не append-only графом плюс внешний указатель на «актуальную часть».

Как backend физически хранит membership — таблицей, bitmap, GPU buffer или будущей ассоциативной аппаратурой — не должно входить в МТС.

## 14d. One-Link role-overlap guard для currentness

A8 дополнительно проверяет случай, когда **один и тот же Link** одновременно играет две роли:

```text
Theory -> relation
```

одновременно является:
- admitted relation authority;
- current contextual truth некоторого Context.

Следствие:

```text
deactivate(K)
!=
delete(K.current Link from Aset)
```

Для снятия currentness удаляется только положительный witness:

```text
E -> K
```

Сам `K` и `K.current` могут оставаться членами Aset, если имеют другие роли. Иначе runtime-currentness начинает разрушать One-Link semantics.

Исполняемый guard:
`CURRENTNESS_WITNESS_REMOVAL_PRESERVES_OVERLAPPING_LINK_ROLES=TRUE`.

### JSON-кандидат positive currentness

Если direct JSON действительно является проекцией исходной/семантической Aset, то currentness не требует специального поля:

```json
{
  "Theory": "T",
  "E": "C->Theory",
  "Truth0": "K->A",
  "K0": "♂(E->Truth0)",
  "W0": "E->K0"
}
```

Здесь `W0` — только произвольное presentation-имя. Семантический witness — обычная Link:

```text
E -> K0
```

Поэтому обязательны дифференциалы:

- переименование `W0` не меняет исполнение;
- удаление denoted-member `E->K0` снимает currentness, даже если `K0` физически существует;
- замена его на `E->K1` переносит currentness;
- `current:true`, `active:true`, host cursor и специальные имена не имеют authority.

Остаётся один точный lowering-вопрос: надо доказать, что JSON/source-Aset definition с RHS `E->K0` действительно включает эту Link в **denoted semantic Aset membership** `M_t`, а не только материализует и именует её вне текущего множества членов.

Отдельно для JSON source рассматривается естественный кандидат:

```json
{"A": null}
```

как проекция bare `A`: `null` означает отсутствие RHS, а не значение MTS Null. Поэтому `{}`, `{"A":null}`, `{"A":{}}` и `{"A":[]}` остаются разными source/model-конструкциями.

## 14e. A9 — одна structural generalized reaction над Aset

A9 объединяет A8 и M7 в один исполняемый кандидат:

```text
Gamma_structural(M_t)
    ↓
S1: structural match/bind по одному current endpoint
    [read-only, полный reaction-start plan]
    ↓
S2: substitution + canonical Link construction
    [только после завершения полного плана]
    ↓
0 / 1 / N image
    ↓
atomic replacement E->K currentness witnesses
    ↓
M_(t+1)
```

Снаружи этому кандидату не передаются:

```text
current Context pointer
current Scope pointer
selected Theory pointer
program counter
pre-grounder command
install-rule command
```

Ключевой self-modification witness:

```text
current: Theory -> BOOT
bootstrap output: candidateRule

generic K-preservation
        ↓
Theory -> candidateRule
```

Полученный Link одновременно является обычным результатом реакции и новым admission выбранной Theory. Он **не исполняется в том же поколении**, потому что S1 использует reaction-start snapshot, но исполняется в следующем.

A9 также проходит freeze/transfer/restore между этими поколениями и получает тот же финальный canonical carrier + Aset membership.

Результат:

```text
STRUCTURAL_ASET_ONE_COMMAND=GREEN_RESEARCH
PRE_GROUNDER_COMMAND=0_FOR_TESTED_VECTOR
SAME_REACTION_NEW_ADMISSION_EXECUTABLE=FALSE
NEXT_REACTION_NEW_ADMISSION_EXECUTABLE=TRUE
CROSS_MEMBER_JOIN=0
```

Это теперь **Author-approved направление архитектуры v0.15**, но ещё не закрытая математическая теорема и не принятие v0.15 целиком. #2001 обязан формально закрыть multi-generation S0-opacity, grounded-MP refinement, фазовое разделение и hardware/schedule refinement; окончательное FORMAL/JSON представление остаётся отдельным Author gate.

### A10 — finite exact-support + information-opacity lower bound
- fixed finite exact-identity Theory has finite antecedent support;
- fresh structured identities outside that support are NO_MATCH regardless of internal poles;
- **all** fresh Links outside support have the same exact observation signature: every antecedent-equality bit is false;
- nevertheless a structural transform such as swap(left,right) requires different outputs for different fresh structures;
- K-preservation can carry the opaque whole Link forward, but does not reveal its poles;
- covering N observed fresh inputs with exact rules requires N concrete admissions, and N+1 escapes again;
- one generic two-role structural rule covers tested families 1/2/5/17 plus N+1 with constant rule count;
- therefore generic fresh transformation requires some structure-sensitive information/binding + construction power somewhere, or an external grounder;
- this does NOT prove one unique API, does NOT prove S1/S2 must be primitive, and gives no evidence for cross-member join.

## 14f. A10 — finite exact support и необходимость structure-sensitive power

A10 отделяет необходимость от конкретной реализации.

Для фиксированной конечной exact-Theory:

```text
Support(F) = { A | в F существует exact antecedent A }
```

конечно.

Следовательно:

```text
fresh A ∉ Support(F)
        ↓
exact identity reaction
        ↓
NO_MATCH
```

вне зависимости от внутренней структуры `A`.

Проверены семейства свежих pair Links размеров:

```text
1, 2, 5, 17
```

Если добавить N конкретных exact admissions, эти N случаев начинают работать, но свежий `N+1` снова NO_MATCH. То есть exact enumeration не является generic grounding.

Одна двухролевая structural template-rule при этом обрабатывает всё семейство и следующий свежий вход без роста rule count.

Результат:

```text
EXACT_FINITE_SUPPORT_NECESSITY_PRESSURE=GREEN_RESEARCH
EXACT_ENUMERATION_COST=ONE_ADMISSION_PER_FRESH_IDENTITY
N_PLUS_1_FRESH_INPUT_ESCAPES_FINITE_ENUMERATION=TRUE
ADDITIONAL_STRUCTURE_SENSITIVE_CAPABILITY_NEEDED_FOR_GENERIC_FRESH_TRANSFORM=SUPPORTED
UNIQUE_REQUIRED_API=NOT_PROVEN
CROSS_MEMBER_JOIN_REQUIRED=FALSE
```

Итак, если сохраняется сильное требование:

> снаружи A-memory существует только одна generalized reaction и нет bootstrap grounder,

то внутри этой единственной команды должна существовать **некоторая эквивалентная по мощности способность** читать структуру свежего Link, связывать роли и построить соответствующий новый Link. A10 не утверждает, что API обязан называться S1/S2 или StructuralRule.

## 14f. A11 — редукция параллельной реакции

A11 проверяет уже не форму Context, а то, **как одну реакцию можно физически распараллелить**.

Для каждого current member / shard вычисляется вклад:

```text
Contribution = (matched, outputs)
```

а объединение задаётся:

```text
(m1,O1) ⊕ (m2,O2)
  =
(m1 OR m2, O1 UNION O2)
```

Здесь `UNION` — только математическая запись экстенсионального результата. В самой A-memory отдельной операции дедупликации нет: одинаковая каноническая Link имеет одну identity, а членство Aset идемпотентно. Это не относится к повторениям внутри `ExactSequence`: `[X,X]` и `[X]` остаются различными там, где последовательность позиционна.

Исполняемо подтверждены:

```text
ASSOCIATIVE=TRUE
COMMUTATIVE=TRUE
IDEMPOTENT=TRUE
RULE_PARTITION_INVARIANT=TRUE
RULE_SHARD_ORDER_INVARIANT=TRUE
CURRENT_PARTITION_INVARIANT=TRUE
TWO_DIMENSIONAL_PARTITION_INVARIANT=TRUE
```

Это как раз даёт требуемую независимость от реализации: один CPU, тысячи GPU workers или будущая ассоциативная матрица могут делить миллиард MP между собой произвольно.

Но обязательны границы:

```text
same reaction-start snapshot
global match reduction before NO_MATCH
no read-your-own-writes inside generation
complete successor before publication
atomic semantic publication
```

A11 отдельно фальсифицирует два неправильных варианта:

1. **локальный NO_MATCH** на одном shard нельзя публиковать — другой shard может иметь настоящий match;
2. результат `A->B` нельзя тут же использовать для `B->C` в том же поколении.

Важно: A11 доказывает **экстенсиональный successor**. Полный provenance и возможный значимый порядок внутри image остаются отдельной задачей.

## 14g. A12 — бесконечная онтология, конечный исполняемый срез

В принятой proof-границе уже есть:

```text
ambient Link carrier = INFINITE_REQUIRED
grounded replay      = FINITE_EXPLICIT_WITNESSES_REQUIRED
```

A12 переносит это различие на исполнение.

Если для конкретного шага:

```text
M_t                         finite materialized Aset
Current(M_t)                finite
Admissions_T(M_t)           finite
каждая matched image        finite
каждый local match          terminating
```

то:

```text
|Current| × |Admissions|    finite work
полный staged successor     finite
```

Следовательно, один физический CPU/GPU/ASIC-шаг можно закончить до atomic publication даже при **бесконечной математической Link-вселенной**.

Это не означает:

```text
вся MTS конечна
каждая мыслимая Aset конечна
infinite denotational reaction запрещена
atomic commit выводится из одной лишь конечности
```

Правильная граница:

> конечность — premise материализованного исполняемого среза и hardware refinement, а не ограничение one-Link ontology.

Это позволяет МТС описывать и обычную память, и GPU, и будущую ассоциативную машину с триллионами физических Links одной и той же семантикой.

## 14h. A13 — что является теоремой, а что premise

После A10–A12 важно не смешать математические следствия и правила execution profile.

### Derived / theorem candidates

```text
bundle lift
  <- local reaction + exhaustive selected relations

pointwise N-current lift
  <- local reaction + J0/member independence + one snapshot

partition/order invariance
  <- A11 algebra (OR, UNION)

finite one-generation completion
  <- A12 finite materialized execution premises
```

### НЕ выводится из scalar MP

```text
selected Theory authority
reaction-start snapshot
exhaustive discovery
NO_MATCH preservation
matched-empty ZERO semantics
generation isolation
complete successor before publication
atomic publication
finite materialized physical execution slice
```

Это либо явные правила семантики реакции, либо execution/refinement premises.

Особенно запрещено писать:

```text
MP => atomic transaction
MP => snapshot
MP => NO_MATCH preservation
```

Правильно:

```text
local MP/reaction law
+ explicit reaction semantics/premises
=> bundle/pointwise/parallel refinement theorems
```

A2 теперь машинно проверяет эту классификацию, чтобы она снова не расползлась.

## 14i. Author decision — C = END(R)

2026-10-04 Author decision:

```text
DIRECT_GAUGE_EXECUTION_SPACE_ROOT = C = END(R)
STATUS = APPROVED_FOR_V015
```

Основание решения — не удобство реализации, а уже пройденные A5–A9:

- граница `C` выводится из ROOT/END-топологии;
- внешние `currentContext/currentScope/programCounter` не нужны;
- после freeze/transfer/restore активное состояние восстанавливается из самой A-memory;
- Theory восстанавливается из внутренней Link-структуры;
- currentness выражается положительным членством в Aset;
- one-command candidate исполняется без внешнего выбранного Context/Scope/Theory указателя.

Это решение относится к архитектуре v0.15 и **не означает принятие v0.15 целиком**.

Также `C` не объявляется абсолютной привилегированной сущностью Foundation. В прямой gauge это END-граница пространства исполнения; зеркальное представление должно оставаться эквивалентным по chirality.

## 14j. Author decision — единый цикл Γ

2026-10-04 Author decision:

```text
M_t --Γ--> M_(t+1) --Γ--> M_(t+2) ...

Γ = ANALYSIS(M_t)
    -> SYNTHESIS(plan)
    -> ATOMIC_PUBLISH(M_(t+1))
```

Главное архитектурное свойство A-memory: над ней снова и снова выполняется **один и тот же универсальный цикл преобразования связей**.

Двухфазность внутри реакции не создаёт двух команд. Анализ и синтез — внутренние стороны одной трансформации. Во время анализа читается только неизменный reaction-start срез `M_t`; синтез материализует следствия и готовит изменения; полный `M_(t+1)` публикуется атомарно и только после этого становится входом следующего такого же `Γ`.

Старые метки S1/S2 сохраняются только как пояснение:

- S1 = analysis-side structural applicability / match / bind;
- S2 = synthesis-side substitution / canonical Link construction.

Они не являются отдельными командами A-memory, программными opcode или внешним grounder.

Если несколько применимых отношений выводят одну и ту же Link, отдельная dedup-фаза не нужна: каноническая identity Link и экстенсиональное членство Aset автоматически дают один член. `O1 UNION O2` остаётся математической записью для доказательства редукции/распараллеливания.

Граница: повторения внутри позиционного значения, например `ExactSequence[X,X]`, не являются повторным Aset-membership и не схлопываются.

Exact grounded Modus Ponens должен быть формально доказан как частный/refinement-случай `Γ`; классическому MP не приписывается скрытая унификация. Истинный J1 cross-current-member join в v0.15 не вводится.

Все универсальные утверждения этого решения имеют release-blocking proof owner **#2001**.

## 15. Решения, которые нельзя снова потерять

| ID | Вопрос | Текущее состояние |
|---|---|---|
| MI-D01 | O или C/END-boundary как execution-space root? | **RESOLVED / AUTHOR-APPROVED:** `C = END(R)` в direct gauge; chirality covariance обязательна |
| MI-D02 | Как вывести active frontier без host cursor? | **OPEN**, A70e topology works but host absence traversal remains |
| MI-D03 | Как Theory/admission выбираются из самой A-memory? | **OPEN**, frozen runtime пока получает authority снаружи |
| MI-D04 | Точный математический generalized reaction | **AUTHOR-APPROVED DESIGN / PROOF PENDING:** единый повторяемый `Γ`, анализ→синтез→atomic publish; formal closure #2001 |
| MI-D05 | Structural capability без внешнего grounder-командного слоя | **AUTHOR-APPROVED DESIGN / PROOF PENDING:** structural-unary capability внутри `Γ`; S1/S2 не отдельные команды; #2001 закрывает lower bound/refinement |

## 16. Правило сопровождения

С этого момента любое изменение архитектуры meta-interpreter/execution v0.15 должно в **том же change** обновлять:

1. `profiles/mts-v015-meta-interpreter-model.json`;
2. этот MD-документ/его будущий генератор;
3. соответствующее executable/proof evidence;
4. статус: accepted / research / candidate / open / falsified.

Тест, issue, старый runtime или комментарий сами по себе не имеют права незаметно изменить архитектурную модель.

## 17. Author gates

Без явного подтверждения автора нельзя объявлять принятыми:

- изменение уже принятого `C = END(R)` решения или его chirality boundary;
- конкретное окончательное FORMAL/JSON представление frontier/currentness;
- любое усиление `Γ` сверх structural-unary J0 (например J1 cross-current join);
- конкретное FORMAL/JSON представление meta-interpreter/reaction rules;
- изменение bootstrap/self-hosting boundary, которое вводит внешний semantic grounder.

До этого документ служит **архитектурной памятью и falsifier-картой**, а не новым accepted contract.
