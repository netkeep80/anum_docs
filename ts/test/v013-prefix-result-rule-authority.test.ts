import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
} from "../src/memory.js";
import {
  exportPortableStructuralTheory,
} from "../src/portable-theory.js";
import {
  admitStructuralRule,
  defineStructuralInterpreter,
  defineStructuralRoleDictionary,
  defineStructuralRule,
  StructuralRuleError,
  type StructuralRuleReplayEvidence,
} from "../src/structural-rule.js";
import {
  defineActField,
  defineActHeader,
} from "../src/structural-readers.js";
import { defineContext } from "../src/state.js";
import {
  replayV012StructuralRuleAgainstTheoryAuthority,
} from "../src/v012-source.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.13 prefix result Rule: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}

function expectRuleError(
  code: StructuralRuleError["code"],
  effect: () => unknown,
): void {
  try {
    effect();
  } catch (error) {
    assert(
      error instanceof StructuralRuleError,
      `expected StructuralRuleError, got ${String(error)}`,
    );
    same(error.code, code, "StructuralRule error code");
    return;
  }
  throw new Error(`v0.13 prefix result Rule: expected ${code}`);
}

function anchors(memory: Memory, count: number): readonly LinkHandle[] {
  const result: LinkHandle[] = [];
  const seed = memory.ensureEndSelfClosed(memory.root);
  let tag = memory.ensureStartSelfClosed(memory.root);
  for (let index = 0; index < count; index += 1) {
    tag = memory.ensureStartSelfClosed(tag);
    result.push(memory.ensure(seed, tag));
  }
  return Object.freeze(result);
}

const memory = new Memory();
ensureRootBasis(memory);
const refs = anchors(memory, 24);

const sourceUseRole = refs[0]!;
const startRole = refs[1]!;
const endRole = refs[2]!;
const dictionary = refs[3]!;
const grammar = refs[4]!;
const theory = refs[5]!;
const maleUse = refs[6]!;

const interpreter = defineStructuralInterpreter(
  memory,
  dictionary,
  grammar,
  theory,
);
const roleDictionary = defineStructuralRoleDictionary(
  memory,
  [sourceUseRole, startRole, endRole],
);

// Generic Rule:
//
//   Operand = Start -> End
//   Prefix  = Prefix -> Operand
//   Transition = Prefix -> Start
//   Body = SourceUse -> Transition
//
// Therefore a claimed result is accepted only if it is exactly the start pole
// of the same Operand carried by the concrete self-start occurrence.
const operandTemplate = memory.ensure(startRole, endRole);
const prefixTemplate = memory.ensureStartSelfClosed(operandTemplate);
const transitionTemplate = memory.ensure(prefixTemplate, startRole);
const ruleBody = memory.ensure(sourceUseRole, transitionTemplate);
const rule = defineStructuralRule(memory, roleDictionary, ruleBody);
const admission = admitStructuralRule(memory, theory, rule);
const fixedTheory = exportPortableStructuralTheory(memory, theory);

const parent = defineContext(memory, memory.root, memory.root);

const a = refs[12]!;
const b = refs[13]!;
const c = refs[14]!;
const S = memory.ensure(a, b);
const T = memory.ensure(a, c);
assert(S !== T, "fixture requires S != T");

function evidence(
  operand: LinkHandle,
  claimedResult: LinkHandle,
  boundStart: LinkHandle,
  boundEnd: LinkHandle,
): StructuralRuleReplayEvidence {
  const operation = memory.ensureStartSelfClosed(operand);
  const transition = memory.ensure(operation, claimedResult);
  const claimedBody = memory.ensure(maleUse, transition);

  const act = defineActHeader(
    memory,
    interpreter,
    roleDictionary,
    parent,
  );
  defineActField(memory, act, sourceUseRole, maleUse);
  defineActField(memory, act, startRole, boundStart);
  defineActField(memory, act, endRole, boundEnd);

  return Object.freeze({
    act,
    rule,
    ruleAdmission: admission,
    claimedBody,
    expectedInterpreter: Object.freeze({ dictionary, grammar, theory }),
    expectedAfterContext: parent,
  });
}

// Positive: the Rule itself proves result=a from the same concrete occurrence
// ♂S = (♂S)->S where S=a->b.
{
  const correct = evidence(S, a, a, b);
  const before = memory.linkCount;
  const replay = replayV012StructuralRuleAgainstTheoryAuthority(
    memory,
    correct,
    fixedTheory,
  );
  same(replay.claimedBody, correct.claimedBody, "correct transition replays");
  same(memory.linkCount, before, "correct replay is read-only");
}

// Negative: same exact ♂S occurrence, but claimed result=b. A host callback
// cannot choose an arbitrary result after the Rule has grounded S=a->b.
{
  const wrongResult = evidence(S, b, a, b);
  const before = memory.linkCount;
  expectRuleError(
    "template-mismatch",
    () => replayV012StructuralRuleAgainstTheoryAuthority(
      memory,
      wrongResult,
      fixedTheory,
    ),
  );
  same(memory.linkCount, before, "wrong result rejection is read-only");
}

// Negative: Act binds S poles as a,b, but the concrete occurrence carries
// T=a->c. Operand substitution is detected recursively inside self-incidence.
{
  const wrongOperand = evidence(T, a, a, b);
  const before = memory.linkCount;
  expectRuleError(
    "template-mismatch",
    () => replayV012StructuralRuleAgainstTheoryAuthority(
      memory,
      wrongOperand,
      fixedTheory,
    ),
  );
  same(memory.linkCount, before, "wrong operand rejection is read-only");
}

// Negative: correct operation/result pair, but claimed start binding is b.
// Result identity and operand topology must agree on one startRole.
{
  const wrongStartBinding = evidence(S, a, b, b);
  const before = memory.linkCount;
  expectRuleError(
    "template-mismatch",
    () => replayV012StructuralRuleAgainstTheoryAuthority(
      memory,
      wrongStartBinding,
      fixedTheory,
    ),
  );
  same(memory.linkCount, before, "wrong start binding rejection is read-only");
}

console.log("MTS v0.13 prefix result grounded by StructuralRule: GREEN.");
