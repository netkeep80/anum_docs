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

Однако здесь остаётся **критический OPEN**:

> отсутствие child/END пока проверялось host traversal. Полный self-hosting должен либо вывести frontier самой generalized reaction, либо заменить отрицательное условие положительной Link-native currentness-структурой.

Внешний `currentScope` нельзя вернуть как удобный shortcut.

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

## 15. Решения, которые нельзя снова потерять

| ID | Вопрос | Текущее состояние |
|---|---|---|
| MI-D01 | O или C/END-boundary как execution-space root? | **OPEN**, C strongly supported; O collision доказан |
| MI-D02 | Как вывести active frontier без host cursor? | **OPEN**, A70e topology works but host absence traversal remains |
| MI-D03 | Как Theory/admission выбираются из самой A-memory? | **OPEN**, frozen runtime пока получает authority снаружи |
| MI-D04 | Точный математический generalized parallel MP | **OPEN**, #1988 / #1989 |
| MI-D05 | Полностью self-hosted meta-grounding | **OPEN**, S0-only falsified for fresh structural substitution |

## 16. Правило сопровождения

С этого момента любое изменение архитектуры meta-interpreter/execution v0.15 должно в **том же change** обновлять:

1. `profiles/mts-v015-meta-interpreter-model.json`;
2. этот MD-документ/его будущий генератор;
3. соответствующее executable/proof evidence;
4. статус: accepted / research / candidate / open / falsified.

Тест, issue, старый runtime или комментарий сами по себе не имеют права незаметно изменить архитектурную модель.

## 17. Author gates

Без явного подтверждения автора нельзя объявлять принятыми:

- `C`/END-boundary как окончательный execution-space root;
- конкретное правило frontier/currentness;
- степень generalized MP;
- полномочия structural match/instantiate;
- конкретное FORMAL-JSON представление meta-interpreter;
- окончательный self-hosted bootstrap.

До этого документ служит **архитектурной памятью и falsifier-картой**, а не новым accepted contract.
