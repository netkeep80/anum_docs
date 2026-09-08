# План реализации K1e: топологическая проекция проверенного поддоказательства

> Для агентной разработки: выполнять план по задачам, отмечая завершённые пункты. Для исполнения использовать подходы пошаговой реализации и разработки через тесты.

## Цель

Добавить общий, не зависящий от натуральных чисел, доверенный механизм K1e. Он должен по одно-посылочной структурной схеме выбрать ровно одно уже существующее доказательное вхождение из замыкания, которое было проверено тем же механизмом K1.

Ключевой закон:

```text
MTS-native one-premise ProjectionSchema
+
closed K1-valid premise ProofOccurrence
+
complete role substitution inferred only from premise Claim
+
K1-validated reachable ProofOccurrence closure
->
exact already-existing unique matching ProofOccurrence
```

K1e не создаёт новое доказательство и не вводит новый закон доказательства.

## Архитектура

Сначала существующая проверка рекурсивного тождества должна уметь внутренне вернуть точное множество проверенных вхождений и соответствующих им доказываемых связей, не меняя существующий внешний результат.

Затем из корневой проверки K1 выделяется внутренний механизм проверки закрытого доказательного вхождения. Он не принимает обработчики, списки допущений, признаки вида доказательства или внешние списки потомков. Он независимо проверяет принятые законы K1 и выбирает результат только по правилу ноль/один/несколько.

После этого K1e:

1. читает существующее структурное производное правило как схему данных;
2. требует ровно одну посылку;
3. независимо проверяет родительское закрытое доказательное вхождение через общий механизм K1;
4. выводит все значения ролей только из доказываемой связи посылки;
5. сопоставляет заключение схемы только с доказываемыми связями из проверенного замыкания;
6. возвращает точное уже существующее вхождение только при единственном совпадении.

## Технологическая база

```text
TypeScript 5.9
Memory / ReadMemory
ExactSequence
StructuralRule / StructuralDerivationRule
inferStructuralSubstitution
matchStructuralTemplate
recursive Link identity replay
rooted K1 replay
GitHub Actions
repo-guard
```

Архитектурные источники:

```text
#1113 approved Variant A
#1114 global pre-implementation review
#1116 bounded production owner
#999 proof-calculus authority
```

## Жёсткие границы

```text
accepted MTS = v0.11
active semantic candidate = NONE
proof-calculus capability delta = YES
observable accepted-MTS semantic delta = NONE

NO new proof carrier
NO new K1 proof law
NO callback/resolver seam in CLOSED K1 core
NO second identity/structural proof walker outside K1
NO host projectedOccurrence authority
NO host rho / Map authority
NO projection kind / start-end selector
NO ProjectionSchema primitive-admission requirement
NO primitive ordered-pole/T4 Rule/DR promotion
NO T4/Nat/Succ-specific production branch
NO public.ts/package-root export in first K1e slice
NO T4 rerun inside K1e acceptance PR
NO contracts/**
NO cutover/**
NO traceability/**
NO repo-policy.json
```

Существующие наружные результаты должны сохранить прежний смысл.

```text
replayRecursiveLinkIdentityProofAset(...) result shape unchanged
replayStructuralRootedProofAset(...) result shape unchanged
rooted K1 occurrenceCount remains structural-occurrence count
rooted target assumptions remain explicit target topology
```

Если исполнимая работа обнаружит наблюдаемое изменение принятой семантики МТС:

```text
STOP -> #995
```

## Файлы реализации

Разрешённая область:

```text
MODIFY ts/src/recursive-link-identity-proof.ts
MODIFY ts/src/rooted-proof-aset.ts
CREATE ts/src/proof-subanet-projection.ts
CREATE ts/test/proof-subanet-projection.test.ts
MODIFY ts/test/recursive-link-identity-proof.test.ts
MODIFY ts/test/rooted-proof-aset-mixed-identity.test.ts
```

Строго не менять:

```text
ts/src/public.ts
ts/src/derived-derivation-heterogeneous.ts
ts/src/derived-derivation-heterogeneous-instance.ts
ts/src/derived-derivation-heterogeneous-discharge.ts
ts/src/derived-derivation-heterogeneous-discharge-materialize.ts
ts/src/structural-role-morphism.ts
ts/src/structural-substitution.ts
ts/src/proof.ts
ts/src/checker.ts
ts/test/derived-t4-successor-injective-proof-anet.test.ts
contracts/**
cutover/**
traceability/**
repo-policy.json
docs/**
.github/**
```

---

## Задача 1. Первый красный тест общего разрыва K1e

Файл:

```text
ts/test/proof-subanet-projection.test.ts
```

На этом шаге производственные файлы не добавлять.

### 1.1. Построить произвольное доказательство тождества

Использовать пример, не связанный с натуральными числами и T4.

```ts
const memory = new Memory();
const { R, O, C, L, U } = ensureRootBasis(memory);
const theory = memory.ensure(C, U);

const rootProof = identityProof(memory, R, R, []);
const oProof = identityProof(memory, O, O, [rootProof]);
const cProof = identityProof(memory, C, C, [rootProof]);
const lProof = identityProof(memory, L, L, [oProof, cProof]);
const uProof = identityProof(memory, U, U, [cProof, oProof]);

const left = memory.ensure(O, U);
const right = memory.ensure(C, L);
const leftProof = identityProof(memory, left, left, [oProof, uProof]);
const rightProof = identityProof(memory, right, right, [cProof, lProof]);
const relation = memory.ensure(left, right);
const relationProof = identityProof(memory, relation, relation, [leftProof, rightProof]);
replayRecursiveLinkIdentityProofAset(memory, relationProof);
```

### 1.2. Построить одно-посылочную схему без примитивного допуска

```ts
const A = memory.ensure(L, R);
const B = memory.ensure(R, L);
const dictionary = defineStructuralRoleDictionary(memory, [A, B]);
const premiseTemplate = memory.ensure(memory.ensure(A, B), memory.ensure(A, B));
const conclusionTemplate = memory.ensure(A, A);
const rule = defineStructuralRule(memory, dictionary, conclusionTemplate);
const dr = defineStructuralDerivationRule(memory, rule, [premiseTemplate]);
```

### 1.3. Зафиксировать будущий вызов

```ts
import {
  replayProofSubAnetProjection,
} from "../src/proof-subanet-projection.js";

const replay = replayProofSubAnetProjection(memory, {
  theory,
  schemaDerivationRule: dr,
  premiseProofOccurrence: relationProof,
});

same(replay.premiseClaim, memory.poles(relationProof).start, "exact premise Claim");
same(replay.projectedOccurrence, leftProof, "exact existing projected occurrence");
same(replay.projectedClaim, memory.poles(leftProof).start, "exact projected Claim");
same(replay.bindings.length, 2, "all roles bound from premise Claim");
```

### 1.4. Получить честный красный результат

```bash
npm --prefix ts run build
```

Ожидаемая первая граница:

```text
TS2307: Cannot find module '../src/proof-subanet-projection.js'
```

Если первая ошибка отличается, записать фактическую границу в #1116 до производственного изменения.

### 1.5. Зафиксировать только тест

```bash
git add ts/test/proof-subanet-projection.test.ts
git commit -m "test(proof-calculus): expose proof-subAnet projection gap"
```

После этого открыть черновой запрос на слияние и сохранить точный красный запуск проверок.

---

## Задача 2. Вывести проверенное замыкание рекурсивного тождества

Файлы:

```text
ts/src/recursive-link-identity-proof.ts
ts/test/recursive-link-identity-proof.test.ts
```

### 2.1. Добавить внутренний результат замыкания

```ts
export interface ValidatedProofOccurrenceClaim {
  readonly occurrence: LinkHandle;
  readonly claim: LinkHandle;
}

export interface RecursiveLinkIdentityProofClosureReplayResult {
  readonly proofRoot: LinkHandle;
  readonly left: LinkHandle;
  readonly right: LinkHandle;
  readonly validatedOccurrences: readonly ValidatedProofOccurrenceClaim[];
}

export function replayRecursiveLinkIdentityProofClosure(
  memory: ReadMemory,
  proofRoot: LinkHandle,
): RecursiveLinkIdentityProofClosureReplayResult;
```

Существующий интерфейс оставить без изменения.

```ts
export function replayRecursiveLinkIdentityProofAset(
  memory: ReadMemory,
  proofRoot: LinkHandle,
): RecursiveLinkIdentityProofReplayResult;
```

### 2.2. Сначала добавить тест новой внутренней проекции

Для обычной связи проверить наличие корневого вхождения и обоих дочерних доказательств в возвращённом замыкании.

```ts
const closure = replayRecursiveLinkIdentityProofClosure(memory, xProof);
const byOccurrence = new Map(
  closure.validatedOccurrences.map(({ occurrence, claim }) => [occurrence, claim]),
);
same(byOccurrence.get(xProof), memory.poles(xProof).start, "root occurrence -> exact Claim");
same(byOccurrence.get(startProof), memory.poles(startProof).start, "start child -> exact Claim");
same(byOccurrence.get(endProof), memory.poles(endProof).start, "end child -> exact Claim");
```

Отдельно зафиксировать неизменность старого результата.

```ts
const outward = replayRecursiveLinkIdentityProofAset(memory, xProof);
same(outward.proofRoot, xProof, "proofRoot unchanged");
same(outward.left, x, "left unchanged");
same(outward.right, x, "right unchanged");
same(outward.verifiedOccurrenceCount, closure.validatedOccurrences.length, "count unchanged");
```

### 2.3. Минимально переработать внутренний обход

Внутреннее чтение вхождения должно сохранять точную доказываемую связь.

```ts
interface ReadOccurrence {
  readonly claim: LinkHandle;
  readonly left: LinkHandle;
  readonly right: LinkHandle;
  readonly children: readonly LinkHandle[];
}
```

Вместо множества проверенных вхождений использовать отображение вхождения на точную доказываемую связь.

```ts
const verified = new Map<LinkHandle, LinkHandle>();
```

После успешной проверки узла:

```ts
verified.set(occurrence, data.claim);
```

Новый внутренний результат:

```ts
return Object.freeze({
  proofRoot,
  left: root.left,
  right: root.right,
  validatedOccurrences: Object.freeze(
    [...verified].map(([occurrence, claim]) => Object.freeze({ occurrence, claim })),
  ),
});
```

Старая функция должна только спроецировать этот результат в прежнюю форму.

Не менять четыре структурных случая, порядок дочерних доказательств, корневую базу, обнаружение циклов и запрет записи.

### 2.4. Проверить регрессии

```bash
npm --prefix ts run build
node ts/dist/test/recursive-link-identity-proof.test.js
```

Все прежние положительные и отрицательные случаи должны остаться зелёными.

### 2.5. Зафиксировать изменение

```bash
git add ts/src/recursive-link-identity-proof.ts ts/test/recursive-link-identity-proof.test.ts
git commit -m "refactor(proof-calculus): expose validated identity proof closure"
```

---

## Задача 3. Выделить общую проверку закрытого вхождения K1

Файлы:

```text
ts/src/rooted-proof-aset.ts
ts/test/rooted-proof-aset-mixed-identity.test.ts
```

### 3.1. Зафиксировать будущий интерфейс тестом

```ts
export interface ClosedProofOccurrenceReplayResult {
  readonly theory: LinkHandle;
  readonly occurrence: LinkHandle;
  readonly claim: LinkHandle;
  readonly validatedOccurrences: readonly ValidatedProofOccurrenceClaim[];
}

export function replayClosedProofOccurrence(
  memory: ReadMemory,
  theory: LinkHandle,
  occurrence: LinkHandle,
): ClosedProofOccurrenceReplayResult;
```

Для уже существующего смешанного доказательства проверить:

```ts
const dependencyClosure = replayClosedProofOccurrence(memory, theory, xProof);
same(dependencyClosure.occurrence, xProof, "exact occurrence");
same(dependencyClosure.claim, identityClaim, "exact Claim");
assert(
  dependencyClosure.validatedOccurrences.some(({ occurrence }) => occurrence === xProof),
  "selected occurrence belongs to validated closure",
);
```

Одновременно закрепить прежнюю диагностику корневой проверки.

```ts
const rooted = replayStructuralRootedProofAset(memory, root);
same(rooted.occurrenceCount, 1, "structural occurrence count unchanged");
same(rooted.declaredAssumptionCount, 0, "declared assumptions unchanged");
same(rooted.usedAssumptionCount, 0, "used assumptions unchanged");
```

### 3.2. Выделить чтение структурного применения

Внутреннее представление:

```ts
interface StructuralOccurrenceApplication {
  readonly occurrence: LinkHandle;
  readonly claim: LinkHandle;
  readonly primitiveDerivationRule: LinkHandle;
  readonly premiseTemplates: readonly LinkHandle[];
  readonly dependencyOccurrences: readonly LinkHandle[];
}
```

Общий читатель выполняет только следующие проверки:

```text
Occurrence poles valid
Application poles valid
primitive DR structurally valid
primitive Rule structurally valid
Theory -> primitive Rule exists
Theory -> primitive DR exists
dependency ExactSequence valid
dependency arity == premise arity
```

Разрешение зависимостей в этом читателе запрещено.

После получения уже проверенных доказываемых связей зависимостей общий завершающий шаг вызывает существующий закон полной подстановки для посылок и внешнего заключения.

### 3.3. Выделить чистый выбор одного закона

Внутренний результат кандидата:

```ts
interface ProofCandidateReplayResult {
  readonly claim: LinkHandle;
  readonly validatedOccurrences: readonly ValidatedProofOccurrenceClaim[];
}
```

Выбор принимает уже вычисленные значения, а не функции обратного вызова.

```ts
function selectUniqueProofCandidate(
  identity: ProofCandidateReplayResult | undefined,
  structural: ProofCandidateReplayResult | undefined,
): ProofCandidateReplayResult {
  const valid = [identity, structural].filter(
    (candidate): candidate is ProofCandidateReplayResult => candidate !== undefined,
  );
  if (valid.length === 0) fail("invalid-proof-occurrence");
  if (valid.length !== 1) fail("ambiguous-proof-support");
  return valid[0]!;
}
```

Порядок вычисления не должен определять смысл.

### 3.4. Реализовать проверку закрытого вхождения

Для каждого вхождения независимо попытаться:

```text
A. recursive identity law
B. structural application law
```

Кандидат рекурсивного тождества использует только замыкание из задачи 2.

Структурный кандидат рекурсивно проверяет все зависимости тем же закрытым механизмом K1, а затем проверяет полную подстановку.

Замыкание структурного кандидата состоит только из:

```text
validated dependency closures
+
current structural ProofOccurrence
```

Повторные точные вхождения удаляются по идентичности самой связи. Соседние или просто существующие в памяти связи не добавляются.

Кэш структурной попытки является только рабочим ускорением. Даже при наличии кэша нельзя пропускать независимую попытку другого закона и тем самым скрывать неоднозначность.

### 3.5. Сохранить отдельную корневую оболочку для открытых допущений

Существующая корневая форма остаётся прежней.

```text
root = targetIdentity ⟼ targetOccurrence
```

Для каждой зависимости корневая оболочка сначала структурно проверяет, является ли она объявленным допущением цели.

```text
dependency = Claim ⟼ targetIdentity
AND Claim belongs to target premise templates
```

Если да, используется точная доказываемая связь допущения. Иначе независимо проверяются принятые законы K1 и выполняется общий выбор одного результата.

Никакой внешний обработчик допущений между корневой и закрытой проверкой не вводится.

### 3.6. Проверить регрессии

```bash
npm --prefix ts run build
node ts/dist/test/rooted-proof-aset.test.js
node ts/dist/test/rooted-proof-aset-mixed-identity.test.js
node ts/dist/test/recursive-link-identity-proof.test.js
```

Все прежние правила K1, циклы, точная Теория, достижимость и запрет записи должны остаться неизменными.

### 3.7. Зафиксировать изменение

```bash
git add ts/src/rooted-proof-aset.ts ts/test/rooted-proof-aset-mixed-identity.test.ts
git commit -m "refactor(proof-calculus): expose closed K1 validated occurrence replay"
```

---

## Задача 4. Реализовать минимальный механизм K1e

Файлы:

```text
ts/src/proof-subanet-projection.ts
ts/test/proof-subanet-projection.test.ts
```

### 4.1. Интерфейс входа и результата

```ts
export interface ProofSubAnetProjectionEvidence {
  readonly theory: LinkHandle;
  readonly schemaDerivationRule: LinkHandle;
  readonly premiseProofOccurrence: LinkHandle;
}

export interface ProofSubAnetProjectionReplayResult {
  readonly theory: LinkHandle;
  readonly schemaDerivationRule: LinkHandle;
  readonly premiseProofOccurrence: LinkHandle;
  readonly premiseClaim: LinkHandle;
  readonly projectedOccurrence: LinkHandle;
  readonly projectedClaim: LinkHandle;
  readonly bindings: readonly StructuralSubstitutionBinding[];
}
```

Коды отказа:

```text
invalid-schema
unsupported-schema-arity
invalid-premise-proof
unbound-schema-role
invalid-premise-substitution
projection-not-found
ambiguous-projection
replay-wrote
```

### 4.2. Прочитать схему только как данные

Прочитать структурное производное правило, структурное правило, словарь ролей, последовательность посылок и тело.

Требовать ровно одну посылку.

```ts
if (schema.premiseTemplates.length !== 1) fail("unsupported-schema-arity");
```

Не проверять примитивное членство схемы в Теории.

```ts
memory.find(theory, schema.structuralRule)
memory.find(theory, schemaDerivationRule)
```

Эти вызовы не должны участвовать в авторитете K1e.

### 4.3. Независимо проверить родительское доказательство

```ts
const parent = replayClosedProofOccurrence(
  memory,
  evidence.theory,
  evidence.premiseProofOccurrence,
);
```

Любая неуспешная проверка родителя преобразуется в отказ K1e, кроме нарушения запрета записи, которое сохраняется отдельно.

Вход не содержит доверенной доказываемой связи родителя или списка потомков.

### 4.4. Полностью вывести роли только из посылки

```ts
const premiseTemplate = schema.premiseTemplates[0]!;
const bindings = inferStructuralSubstitution(
  memory,
  roles,
  [Object.freeze({ template: premiseTemplate, actual: parent.claim })],
  { requireAll: true },
);
```

Преобразование ошибок:

```text
duplicate-role       -> invalid-schema
missing-role-binding -> unbound-schema-role
template-mismatch    -> invalid-premise-substitution
replay-wrote         -> replay-wrote
```

Поиск подходящего заключения начинается только после полной подстановки. Роль, встречающаяся только в заключении, не может быть угадана.

### 4.5. Искать только внутри проверенного замыкания

Для каждого точного элемента:

```ts
parent.validatedOccurrences
```

проверить тело схемы при уже выведенных значениях ролей.

```ts
matchStructuralTemplate(memory, rule.body, candidate.claim, bindings);
```

Обычное несовпадение шаблона означает только отсутствие совпадения для данного кандидата.

Запрещено просматривать всю память, входящие и исходящие связи, номера выделения, внешние массивы потомков или сырое замыкание полюсов.

После удаления повторов по точной идентичности вхождения:

```text
0 -> projection-not-found
1 -> return exact existing ProofOccurrence
>1 -> ambiguous-projection
```

Нельзя выбирать первое найденное совпадение.

### 4.6. Сохранить запрет записи

Снимок количества связей выполняется на входе. Любое изменение числа связей на выходе превращается в:

```text
replay-wrote
```

### 4.7. Сделать исходный общий пример зелёным

```bash
npm --prefix ts run build
node ts/dist/test/proof-subanet-projection.test.js
```

После успешной проверки вывести:

```text
PROOF_SUBANET_PROJECTION = SUPPORTED
K1_VALIDATED_CLOSURE_OBSERVABILITY = SUPPORTED
```

### 4.8. Зафиксировать минимальную реализацию

```bash
git add ts/src/proof-subanet-projection.ts ts/test/proof-subanet-projection.test.ts
git commit -m "feat(proof-calculus): project validated proof subAnets"
```

---

## Задача 5. Полный общий и защитный набор проверок

Основной файл:

```text
ts/test/proof-subanet-projection.test.ts
```

### 5.1. Проверить разные формы тождества без признака вида

Для обычной связи использовать схему:

```text
premise = ((A ⟼ B) ⟼ (A ⟼ B))
body    = (A ⟼ A)
```

Для связи с самозамкнутым началом вывести конец структурно через шаблон. Для связи с самозамкнутым концом вывести начало структурно через шаблон.

Для корня использовать консервативную схему тождества:

```text
roles   = [X]
premise = X
body    = X
```

K1e не должен содержать номера дочерних элементов или признаки четырёх форм рекурсивного тождества.

```text
child[0]
child[1]
START
END
FULL
ORDINARY
selector
```

### 5.2. Неподдерживаемая арность схемы

Проверить ноль и две посылки.

```text
unsupported-schema-arity
```

### 5.3. Невыводимая и противоречивая роль

Схема с двумя ролями, где посылка содержит только одну, должна дать:

```text
unbound-schema-role
```

Повтор одной роли с противоречивыми значениями должен дать:

```text
invalid-premise-substitution
```

### 5.4. Неверная Теория структурного родителя

Построить закрытое структурное доказательство, примитивные правила которого допущены только в одной Теории.

```text
theoryA -> normal result
theoryB -> invalid-premise-proof
```

Это не должно менять независимую природу рекурсивного тождества, которому не нужен примитивный допуск Теории.

### 5.5. Недостижимое доказательство той же связи не даёт авторитета

Построить корректное вхождение с подходящей доказываемой связью, но не включать его в проверенное замыкание родителя. При отсутствии подходящего вхождения внутри реального замыкания ожидать:

```text
projection-not-found
```

Затем добавить обычную внешнюю связь между родителем и недостижимым доказательством.

```ts
memory.ensure(parentOccurrence, unreachableMatchingProof);
```

Результат K1e не должен измениться.

### 5.6. Внешнее украшение входа не даёт авторитета

Передать объект с дополнительными полями, которых нет в доверенном интерфейсе.

```ts
const decorated = Object.freeze({
  theory,
  schemaDerivationRule: dr,
  premiseProofOccurrence: parent,
  projectedOccurrence: unreachableMatchingProof,
  rho: new Map([[A, arbitraryValue]]),
  kind: "start",
});
```

Результат должен совпасть с результатом для обычного входа.

### 5.7. Примитивный допуск схемы не влияет на результат

Использовать отдельную схему, не совпадающую с примитивными правилами родительского доказательства.

Сначала выполнить K1e без допуска схемы и сохранить точное выбранное вхождение. Затем вне K1e явно допустить правило и производное правило схемы в Теории и повторить вызов.

```ts
admitStructuralRule(memory, theory, schemaRule);
admitStructuralDerivationRule(memory, theory, schemaDR);
```

Должно вернуться то же точное вхождение.

### 5.8. Построить настоящую неоднозначность проекции

Нужна одна и та же точная доказываемая связь:

```text
pClaim = p ⟼ p
```

и два различных независимо корректных доказательных вхождения:

```text
identityProofP   = intrinsic recursive identity proof of p=p
structuralProofP = pClaim ⟼ (zeroPremisePrimitiveDR ⟼ ExactSequence([]))
```

Для второго доказательства допустить только требуемое нуль-посылочное примитивное правило.

Построить закрытое структурное родительское доказательство с двумя позициями посылок, обе требующими эту же доказываемую связь, и зависимостями:

```text
[identityProofP, structuralProofP]
```

Доказываемая связь родителя должна структурно содержать значение роли, чтобы одно-посылочная схема K1e могла вывести его только из родительской посылки.

Схема проекции:

```text
one Role P
premise template matches parent Claim and binds P=p
body = P ⟼ P
```

Оба разных вхождения находятся в проверенном замыкании и совпадают с заключением. Требуется:

```text
ambiguous-projection
```

Если каноническое построение неожиданно схлопнет два носителя в одну точную связь, сначала записать фактическое измерение в #1116. Нельзя вводить искусственный признак вида доказательства только ради изготовления неоднозначности.

### 5.9. Запрет записи и точная ревизия Теории

До и после обычного вызова K1e сравнить число связей и точную ревизию Теории.

```ts
const revisionBefore = await computePortableStructuralTheoryRevision(
  exportPortableStructuralTheory(memory, theory),
);
const countBefore = memory.linkCount;
const projected = replayProofSubAnetProjection(memory, evidence);
same(memory.linkCount, countBefore, "K1e replay read-only");
const revisionAfter = await computePortableStructuralTheoryRevision(
  exportPortableStructuralTheory(memory, theory),
);
same(revisionAfter.scheme, revisionBefore.scheme, "Theory scheme unchanged");
same(revisionAfter.value, revisionBefore.value, "exact Theory revision unchanged");
```

### 5.10. Полный регрессионный прогон

```bash
npm --prefix ts run check
```

Должны остаться зелёными все предшествующие проверки:

```text
recursive Link identity
MIXED_ROOTED_PROOF_ANET_DEPENDENCY
K1d2 heterogeneous generic replay
K1d3 open rooted binding
K1d4 closed rooted discharge
```

Тест T4 в этом запросе на слияние не менять.

### 5.11. Итоговые маркеры K1e

После полного общего набора:

```text
PROOF_SUBANET_PROJECTION = SUPPORTED
K1_VALIDATED_CLOSURE_OBSERVABILITY = SUPPORTED
PROJECTION_SCHEMA_ADMISSION_AUTHORITY = NOT REQUIRED
HOST_PROJECTION_AUTHORITY = NONE
ROOTED_K1_SEMANTICS = UNCHANGED
K1E_SECURITY_CORPUS = GREEN
accepted semantic delta = NONE
```

Зафиксировать защитные проверки отдельным коммитом.

```bash
git add ts/test/proof-subanet-projection.test.ts
git commit -m "test(proof-calculus): harden proof-subAnet projection authority"
```

---

## Задача 6. Приёмка K1e отдельно от T4

### 6.1. Проверить точный набор изменённых файлов

Разрешены только:

```text
ts/src/recursive-link-identity-proof.ts
ts/src/rooted-proof-aset.ts
ts/src/proof-subanet-projection.ts
ts/test/proof-subanet-projection.test.ts
ts/test/recursive-link-identity-proof.test.ts
ts/test/rooted-proof-aset-mixed-identity.test.ts
```

Не должно быть изменений в публичной поверхности пакета, тесте T4, документации, контрактах, трассировке, политике или рабочих процессах.

### 6.2. Записать историю разработки через тесты

В описании запроса на слияние сохранить:

```text
opening main SHA
RED test-only head + exact RED CI
identity-closure refactor head + regression result
closed-K1 refactor head + regression result
minimal K1e GREEN head + CI
security final head + full npm check
blocking repo-guard run
accepted MTS = v0.11
active semantic candidate = NONE
T4 PROOF_ANET remains GAP until separate #1064 rerun
```

### 6.3. Финальный шлюз слияния

На одном неизменном точном коммите требуются:

```text
full CI = GREEN
blocking repo-guard = GREEN
draft = false
mergeable = true
behind_by = 0
stable exact head
```

Слияние выполнять только с защитой точного ожидаемого коммита.

### 6.4. После слияния принять только K1e

После зелёной проверки нового основного состояния зафиксировать только:

```text
K1e PROOF_SUBANET_PROJECTION = SUPPORTED
K1_VALIDATED_CLOSURE_OBSERVABILITY = SUPPORTED
ROOTED_K1_SEMANTICS = UNCHANGED
accepted semantic delta = NONE
```

Нельзя на этом этапе повышать статус T4.

### 6.5. Отдельно повторить T4

Только после принятия K1e:

```text
fresh accepted main
-> separate test-only T4 rerun under #1064
-> exact same T4 theorem challenge
```

Aprover остаётся в ожидании до выполнения полного условия синхронизации из его отдельного владельца.

---

## Ограничение изменения для #1116

```repo-guard-yaml
change_type: feature
scope:
  - ts/src/recursive-link-identity-proof.ts
  - ts/src/rooted-proof-aset.ts
  - ts/src/proof-subanet-projection.ts
  - ts/test/proof-subanet-projection.test.ts
  - ts/test/recursive-link-identity-proof.test.ts
  - ts/test/rooted-proof-aset-mixed-identity.test.ts
budgets:
  max_new_files: 2
  max_new_docs: 0
  max_net_added_lines: 950
must_touch:
  - ts/src/recursive-link-identity-proof.ts
  - ts/src/rooted-proof-aset.ts
  - ts/src/proof-subanet-projection.ts
  - ts/test/proof-subanet-projection.test.ts
must_not_touch:
  - ts/src/public.ts
  - ts/src/derived-derivation-heterogeneous.ts
  - ts/src/derived-derivation-heterogeneous-instance.ts
  - ts/src/derived-derivation-heterogeneous-discharge.ts
  - ts/src/derived-derivation-heterogeneous-discharge-materialize.ts
  - ts/src/structural-role-morphism.ts
  - ts/src/structural-substitution.ts
  - ts/src/proof.ts
  - ts/src/checker.ts
  - ts/test/derived-t4-successor-injective-proof-anet.test.ts
  - contracts/**
  - cutover/**
  - traceability/**
  - repo-policy.json
  - docs/**
  - .github/**
expected_effects:
  - expose exact validated recursive-identity ProofOccurrence closure without outward diagnostic drift
  - expose callback-free CLOSED K1 ProofOccurrence replay using accepted 0/1/>1 proof-law selection
  - preserve existing rooted OPEN assumption topology and rooted replay result semantics
  - replay one-premise MTS-native projection schemas without schema primitive-admission authority
  - infer every schema Role only from exact premise Claim
  - select exactly one existing ProofOccurrence from K1-validated parent closure
  - reject zero or multiple matching validated occurrences fail-closed
  - grant zero authority to host rho, projectedOccurrence metadata, ambient Links, raw Memory reachability, or unreachable same-Claim proofs
  - introduce no Nat/T4/Succ-specific trusted branch and no new K1 proof law
  - keep exact Theory revision unchanged during trusted replay
  - accepted MTS v0.11 remains unchanged
```

## Самопроверка плана

```text
SPEC COVERAGE = COMPLETE for approved #1113 Variant A + #1114 corrections
PLACEHOLDER SCAN = PASS
TYPE/NAME CONSISTENCY = PASS
CALLBACK/RESOLVER SEAM = NONE
OUTWARD REPLAY CONTRACT DRIFT = NONE INTENDED
T4 CODE IN K1e PR = NONE
PUBLIC PACKAGE API DELTA = NONE
SEMANTIC DELTA EXPECTED = NONE
```

Исполнение этого плана начинается только после принятия #1115. Авторитетными свидетельствами красных и зелёных состояний являются точные запуски проверок репозитория на соответствующих коммитах.
