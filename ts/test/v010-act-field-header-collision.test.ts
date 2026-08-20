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
// При объявленной роли I и значении Q поле I⟼Q является тем же H, а
// attachment A⟼H — тем же A. Это не требует второй semantic occurrence:
// один A одновременно исполняет header-use и field-use в контексте DR=[I].
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

// Binding уже предъявлен структурой A и выбранной role I. Host-вызов
// defineActField не является отдельным semantic событием и не должен быть
// нужен reader-у, чтобы увидеть существующую relation A⟼(I⟼Q).
assertDeepEqual(
  readOptionalMany(memory, collisionAct, interpreter),
  [roleAndContext],
  "self-link Act должен читаться как field в явно выбранной роли I",
);
assertSame(
  readRequiredSingle(memory, collisionAct, interpreter),
  roleAndContext,
  "dual-use binding должен удовлетворять required-single",
);

const outgoingBefore = [...memory.outgoing(collisionAct)];
const countBefore = memory.linkCount;
const collisionAttachment = defineActField(memory, collisionAct, interpreter, roleAndContext);
assertSame(collisionAttachment, collisionAct, "header-shaped attachment канонически является самим Act");
assertSame(memory.linkCount, countBefore, "повторная материализация dual-use binding не создаёт Link");
assertDeepEqual(
  memory.outgoing(collisionAct),
  outgoingBefore,
  "идемпотентный defineActField не меняет topology",
);
assertDeepEqual(
  readOptionalMany(memory, collisionAct, interpreter),
  [roleAndContext],
  "идемпотентная конструкция не создаёт multiplicity",
);

// DR действительно объявляет I placeholder-роль, поэтому generic Rule replay
// обязан получить rho(I)=Q из того же self-link A и сопоставить body I с Q.
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
  "generic Rule должен получить ровно один dual-use binding",
);

// Отличное второе значение для той же роли остаётся настоящим конфликтом
// cardinality: self-link даёт Q, отдельный attachment даёт ordinaryValue.
defineActField(memory, collisionAct, interpreter, ordinaryValue);
const conflictingValues = readOptionalMany(memory, collisionAct, interpreter);
assertSame(conflictingValues.length, 2, "два отличных значения роли должны быть видимы");
assert(
  conflictingValues.includes(roleAndContext) && conflictingValues.includes(ordinaryValue),
  "оба конфликтующих значения должны сохраняться структурно",
);
expectStructuralReadError(
  () => readRequiredSingle(memory, collisionAct, interpreter),
  "multiple-field-values",
);
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

// Контроль: обычный Field != H по-прежнему читается прежним exact способом.
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
