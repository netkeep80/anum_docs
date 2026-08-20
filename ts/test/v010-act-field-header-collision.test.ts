import { Memory, type LinkHandle } from "../src/memory.js";
import {
  StructuralReadError,
  defineActField,
  defineActHeader,
  readOptionalMany,
  readRequiredSingle,
} from "../src/structural-readers.js";
import {
  StructuralRuleError,
  admitStructuralRule,
  defineStructuralInterpreter,
  defineStructuralRoleDictionary,
  defineStructuralRule,
  replayStructuralRule,
} from "../src/structural-rule.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertSame<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  assert(
    JSON.stringify(actual) === JSON.stringify(expected),
    `${message}: ${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`,
  );
}

function expectStructuralReadError(
  effect: () => unknown,
  code: StructuralReadError["code"],
): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof StructuralReadError, `ожидался StructuralReadError, получено ${String(error)}`);
    assertSame(error.code, code, "код ошибки structural reader");
    return;
  }
  throw new Error(`ожидался StructuralReadError(${code})`);
}

function expectStructuralRuleError(
  effect: () => unknown,
  code: StructuralRuleError["code"],
): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof StructuralRuleError, `ожидался StructuralRuleError, получено ${String(error)}`);
    assertSame(error.code, code, "код ошибки structural rule");
    return;
  }
  throw new Error(`ожидался StructuralRuleError(${code})`);
}

function anchors(memory: Memory, count: number): LinkHandle[] {
  const result: LinkHandle[] = [];
  let current = memory.root;
  for (let index = 0; index < count; index += 1) {
    current = memory.ensureStartSelfClosed(current);
    result.push(current);
  }
  return result;
}

const memory = new Memory();
const [dictionary, grammar, theory, afterContext, ordinaryRole, ordinaryValue] = anchors(memory, 6);
assert(
  dictionary !== undefined && grammar !== undefined && theory !== undefined &&
  afterContext !== undefined && ordinaryRole !== undefined && ordinaryValue !== undefined,
  "опорные связи fixture должны существовать",
);

const interpreter = defineStructuralInterpreter(memory, dictionary, grammar, theory);

// Каноническая коллизия #732:
//
//   Q = DR ⟼ K
//   H = I ⟼ Q
//   A = START(H) = A ⟼ H
//
// При DR=[I] тот же A допускает две use-role: header carrier и structural
// binding attachment A⟼(I⟼Q). Для этого не создаётся вторая semantic Link.
const collisionRoleDictionary = defineStructuralRoleDictionary(memory, [interpreter]);
const roleAndContext = memory.ensure(collisionRoleDictionary, afterContext);
const header = memory.ensure(interpreter, roleAndContext);
const collisionAct = defineActHeader(
  memory,
  interpreter,
  collisionRoleDictionary,
  afterContext,
);
assertSame(memory.poles(collisionAct).end, header, "Act должен нести точный header");

// Старый specialized field-reader не имеет DR и поэтому сохраняет accepted
// compatibility boundary: self-link A для него только header-use.
assertDeepEqual(
  readOptionalMany(memory, collisionAct, interpreter),
  [],
  "legacy role reader не должен сам выводить dual-use без DR",
);
expectStructuralReadError(
  () => readRequiredSingle(memory, collisionAct, interpreter),
  "missing-required-field",
);

// Повторный host-вызов не является отдельным semantic событием: нужная
// canonical relation уже совпадает с A, поэтому topology остаётся прежней.
const outgoingBefore = [...memory.outgoing(collisionAct)];
const countBefore = memory.linkCount;
const collisionAttachment = defineActField(memory, collisionAct, interpreter, roleAndContext);
assertSame(collisionAttachment, collisionAct, "header-shaped attachment канонически является самим Act");
assertSame(memory.linkCount, countBefore, "повторная материализация collision не создаёт Link");
assertDeepEqual(memory.outgoing(collisionAct), outgoingBefore, "collision не меняет topology");

// Generic StructuralRule, напротив, имеет exact DR. Поэтому DR=[I] задаёт
// контекст use-role и self-link обязан дать rho(I)=Q.
const collisionRule = defineStructuralRule(memory, collisionRoleDictionary, interpreter);
const collisionAdmission = admitStructuralRule(memory, theory, collisionRule);
const collisionReplay = replayStructuralRule(memory, {
  act: collisionAct,
  rule: collisionRule,
  ruleAdmission: collisionAdmission,
  claimedBody: roleAndContext,
  expectedInterpreter: { dictionary, grammar, theory },
  expectedAfterContext: afterContext,
});
assertDeepEqual(
  collisionReplay.bindings,
  [{ role: interpreter, value: roleAndContext }],
  "DR должен извлечь ровно один dual-use binding",
);

// Отличное второе значение той же DR-роли остаётся настоящим конфликтом:
// self-link даёт Q, а отдельный attachment — ordinaryValue.
defineActField(memory, collisionAct, interpreter, ordinaryValue);
expectStructuralRuleError(
  () => replayStructuralRule(memory, {
    act: collisionAct,
    rule: collisionRule,
    ruleAdmission: collisionAdmission,
    claimedBody: roleAndContext,
    expectedInterpreter: { dictionary, grammar, theory },
    expectedAfterContext: afterContext,
  }),
  "multiple-role-bindings",
);

// Legacy reader продолжает видеть только отдельный field attachment и тем
// самым не меняет semantics существующих relation/colon/equality replay API.
assertDeepEqual(
  readOptionalMany(memory, collisionAct, interpreter),
  [ordinaryValue],
  "legacy reader должен игнорировать header-use и видеть отдельный field",
);
assertSame(
  readRequiredSingle(memory, collisionAct, interpreter),
  ordinaryValue,
  "legacy required-single сохраняет прежнее поведение",
);

// Контроль: обычный Field != H читается прежним exact способом и generic DR.
const ordinaryRoleDictionary = defineStructuralRoleDictionary(memory, [ordinaryRole]);
const ordinaryAct = defineActHeader(memory, interpreter, ordinaryRoleDictionary, afterContext);
const ordinaryField = memory.ensure(ordinaryRole, ordinaryValue);
assert(
  ordinaryField !== memory.poles(ordinaryAct).end,
  "контрольный fixture не должен случайно воспроизводить header collision",
);
defineActField(memory, ordinaryAct, ordinaryRole, ordinaryValue);
assertDeepEqual(
  readOptionalMany(memory, ordinaryAct, ordinaryRole),
  [ordinaryValue],
  "обычное non-colliding поле остаётся читаемым",
);
assertSame(
  readRequiredSingle(memory, ordinaryAct, ordinaryRole),
  ordinaryValue,
  "обычное required поле остаётся exact",
);
