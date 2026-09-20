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

interface Fixture {
  readonly memory: Memory;
  readonly fixedTheory: unknown;
  readonly sourceUseRole: LinkHandle;
  readonly startRole: LinkHandle;
  readonly endRole: LinkHandle;
  readonly maleUse: LinkHandle;
  readonly rule: LinkHandle;
  readonly admission: LinkHandle;
  readonly interpreter: LinkHandle;
  readonly roleDictionary: LinkHandle;
  readonly dictionary: LinkHandle;
  readonly grammar: LinkHandle;
  readonly theory: LinkHandle;
  readonly parent: LinkHandle;
  readonly a: LinkHandle;
  readonly b: LinkHandle;
  readonly c: LinkHandle;
  readonly S: LinkHandle;
  readonly T: LinkHandle;
  evidence(
    operand: LinkHandle,
    claimedResult: LinkHandle,
    boundStart: LinkHandle,
    boundEnd: LinkHandle,
  ): StructuralRuleReplayEvidence;
}

function fixture(): Fixture {
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
  //   Operand    = Start -> End
  //   Prefix     = Prefix -> Operand
  //   Transition = Prefix -> Start
  //   Body       = SourceUse -> Transition
  //
  // Reusing Start in Operand and Transition is the authority link between
  // start(Operand) and the claimed semantic result.
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
    const afterContext = defineContext(memory, parent, claimedBody);
    const act = defineActHeader(
      memory,
      interpreter,
      roleDictionary,
      afterContext,
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
      expectedAfterContext: afterContext,
    });
  }

  return Object.freeze({
    memory,
    fixedTheory,
    sourceUseRole,
    startRole,
    endRole,
    maleUse,
    rule,
    admission,
    interpreter,
    roleDictionary,
    dictionary,
    grammar,
    theory,
    parent,
    a,
    b,
    c,
    S,
    T,
    evidence,
  });
}

// Positive: Rule itself proves result=a from the same concrete occurrence
// ♂S=(♂S)->S where S=a->b.
{
  const f = fixture();
  const correct = f.evidence(f.S, f.a, f.a, f.b);
  const before = f.memory.linkCount;
  const replay = replayV012StructuralRuleAgainstTheoryAuthority(
    f.memory,
    correct,
    f.fixedTheory,
  );
  same(replay.claimedBody, correct.claimedBody, "correct transition replays");
  same(f.memory.linkCount, before, "correct replay is read-only");
}

// Same exact ♂S, but claimed result=b. Start is already grounded to a by
// S=a->b, so the repeated Start role must reject b.
{
  const f = fixture();
  const wrongResult = f.evidence(f.S, f.b, f.a, f.b);
  const before = f.memory.linkCount;
  expectRuleError(
    "template-mismatch",
    () => replayV012StructuralRuleAgainstTheoryAuthority(
      f.memory,
      wrongResult,
      f.fixedTheory,
    ),
  );
  same(f.memory.linkCount, before, "wrong result rejection is read-only");
}

// Act binds Operand poles as a,b, but concrete ♂T carries T=a->c.
{
  const f = fixture();
  const wrongOperand = f.evidence(f.T, f.a, f.a, f.b);
  const before = f.memory.linkCount;
  expectRuleError(
    "template-mismatch",
    () => replayV012StructuralRuleAgainstTheoryAuthority(
      f.memory,
      wrongOperand,
      f.fixedTheory,
    ),
  );
  same(f.memory.linkCount, before, "wrong operand rejection is read-only");
}

// Concrete S and result=a are correct, but Act lies that Start=b.
{
  const f = fixture();
  const wrongStartBinding = f.evidence(f.S, f.a, f.b, f.b);
  const before = f.memory.linkCount;
  expectRuleError(
    "template-mismatch",
    () => replayV012StructuralRuleAgainstTheoryAuthority(
      f.memory,
      wrongStartBinding,
      f.fixedTheory,
    ),
  );
  same(f.memory.linkCount, before, "wrong start binding rejection is read-only");
}

console.log("MTS v0.13 prefix result grounded by StructuralRule: GREEN.");
