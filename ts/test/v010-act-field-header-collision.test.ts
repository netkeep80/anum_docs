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
    assert(error instanceof StructuralReadError, `expected StructuralReadError, got ${String(error)}`);
    assertSame(error.code, code, "structural read error code");
    return;
  }
  throw new Error(`expected StructuralReadError(${code})`);
}

function expectStructuralRuleError(
  effect: () => unknown,
  code: StructuralRuleError["code"],
): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof StructuralRuleError, `expected StructuralRuleError, got ${String(error)}`);
    assertSame(error.code, code, "structural rule error code");
    return;
  }
  throw new Error(`expected StructuralRuleError(${code})`);
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
  "fixture anchors must exist",
);

const interpreter = defineStructuralInterpreter(memory, dictionary, grammar, theory);

// Exact collision from #732:
//
//   Q = DR -> K
//   H = I -> Q
//   A = START(H) = A -> H
//
// With declared role=I and value=Q, Field=I->Q is the same semantic H.
// Therefore Attachment=A->Field is the same semantic A as the header carrier.
const collisionRoleDictionary = defineStructuralRoleDictionary(memory, [interpreter]);
const roleAndContext = memory.ensure(collisionRoleDictionary, afterContext);
const header = memory.ensure(interpreter, roleAndContext);
const collisionAct = defineActHeader(
  memory,
  interpreter,
  collisionRoleDictionary,
  afterContext,
);
assertSame(memory.poles(collisionAct).end, header, "Act must carry the exact reconstructed header");

const outgoingBefore = [...memory.outgoing(collisionAct)];
const countBefore = memory.linkCount;
const collisionAttachment = defineActField(memory, collisionAct, interpreter, roleAndContext);

assertSame(collisionAttachment, collisionAct, "header-shaped field attachment collapses to the Act itself");
assertSame(memory.linkCount, countBefore, "declaring the colliding field adds no structural evidence");
assertDeepEqual(
  memory.outgoing(collisionAct),
  outgoingBefore,
  "Act topology is identical before and after the colliding defineActField call",
);
assertDeepEqual(
  readOptionalMany(memory, collisionAct, interpreter),
  [],
  "reader skips the self-link header carrier and loses the colliding role field",
);
expectStructuralReadError(
  () => readRequiredSingle(memory, collisionAct, interpreter),
  "missing-required-field",
);

// The same loss propagates to generic structural Rule replay. The DR genuinely
// declares I as a role, but the accepted field constructor cannot leave a
// distinguishable binding rho(I)=Q in the Act topology.
const collisionRule = defineStructuralRule(memory, collisionRoleDictionary, interpreter);
const collisionAdmission = admitStructuralRule(memory, theory, collisionRule);
expectStructuralRuleError(
  () => replayStructuralRule(memory, {
    act: collisionAct,
    rule: collisionRule,
    ruleAdmission: collisionAdmission,
    claimedBody: roleAndContext,
    expectedInterpreter: { dictionary, grammar, theory },
    expectedAfterContext: afterContext,
  }),
  "missing-role-binding",
);

// Control vector: the existing representation remains exact when Field != H.
const ordinaryRoleDictionary = defineStructuralRoleDictionary(memory, [ordinaryRole]);
const ordinaryAct = defineActHeader(memory, interpreter, ordinaryRoleDictionary, afterContext);
const ordinaryField = memory.ensure(ordinaryRole, ordinaryValue);
assert(
  ordinaryField !== memory.poles(ordinaryAct).end,
  "control fixture must not accidentally reproduce the header collision",
);
defineActField(memory, ordinaryAct, ordinaryRole, ordinaryValue);
assertDeepEqual(
  readOptionalMany(memory, ordinaryAct, ordinaryRole),
  [ordinaryValue],
  "ordinary non-colliding field remains readable",
);
assertSame(
  readRequiredSingle(memory, ordinaryAct, ordinaryRole),
  ordinaryValue,
  "ordinary required field remains exact",
);
