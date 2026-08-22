import { Memory, ensureRootBasis, type LinkHandle } from "../src/memory.js";
import { defineContext } from "../src/state.js";
import { defineActField, defineActHeader } from "../src/structural-readers.js";
import {
  admitStructuralRule,
  defineStructuralInterpreter,
  defineStructuralRoleDictionary,
  defineStructuralRule,
  type StructuralInterpreter,
} from "../src/structural-rule.js";
import {
  StructuralJudgmentReplayError,
  replayStructuralJudgment,
  type StructuralJudgmentEvidence,
} from "../src/derivation.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

function expectJudgmentError(
  code: StructuralJudgmentReplayError["code"],
  effect: () => unknown,
): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof StructuralJudgmentReplayError, `${code}: wrong error type`);
    same(error.code, code, `${code}: wrong error code`);
    return;
  }
  throw new Error(`${code}: expected StructuralJudgmentReplayError`);
}

interface Fixture {
  readonly memory: Memory;
  readonly evidence: StructuralJudgmentEvidence;
  readonly fresh: () => LinkHandle;
  readonly rule: LinkHandle;
}

function fixture(): Fixture {
  const memory = new Memory();
  const { R, U } = ensureRootBasis(memory);
  let cursor = U;
  const fresh = (): LinkHandle => {
    cursor = memory.ensure(cursor, R);
    return cursor;
  };

  const dictionary = fresh();
  const grammar = fresh();
  const theory = fresh();
  const leftRole = fresh();
  const rightRole = fresh();
  const left = fresh();
  const right = fresh();
  const context = defineContext(memory, fresh(), fresh());

  const expectedInterpreter: StructuralInterpreter = Object.freeze({ dictionary, grammar, theory });
  const interpreter = defineStructuralInterpreter(memory, dictionary, grammar, theory);
  const roleDictionary = defineStructuralRoleDictionary(memory, [leftRole, rightRole]);
  const templateBody = memory.ensure(leftRole, rightRole);
  const rule = defineStructuralRule(memory, roleDictionary, templateBody);
  const ruleAdmission = admitStructuralRule(memory, theory, rule);
  const claim = memory.ensure(left, right);
  const act = defineActHeader(memory, interpreter, roleDictionary, context);
  defineActField(memory, act, leftRole, left);
  defineActField(memory, act, rightRole, right);

  const evidence: StructuralJudgmentEvidence = Object.freeze({
    application: Object.freeze({
      act,
      rule,
      ruleAdmission,
      claimedBody: claim,
      expectedInterpreter,
      expectedAfterContext: context,
    }),
    judgment: Object.freeze({ theory, context, claim }),
  });
  return { memory, evidence, fresh, rule };
}

// Positive generic one-step judgment: exact claim and zero writes.
{
  const fx = fixture();
  const before = fx.memory.linkCount;
  const result = replayStructuralJudgment(fx.memory, fx.evidence);
  same(result.judgment.theory, fx.evidence.judgment.theory, "exact theory");
  same(result.judgment.context, fx.evidence.judgment.context, "exact context");
  same(result.judgment.claim, fx.evidence.judgment.claim, "exact claim");
  same(result.application.claimedBody, fx.evidence.judgment.claim, "application binds exact claim");
  same(fx.memory.linkCount, before, "judgment replay must be read-only");
}

// Judgment theory is independent from the application interpreter theory.
{
  const fx = fixture();
  expectJudgmentError("judgment-theory-mismatch", () => replayStructuralJudgment(
    fx.memory,
    { ...fx.evidence, judgment: { ...fx.evidence.judgment, theory: fx.fresh() } },
  ));
}

// A different valid Context cannot be silently accepted as the judgment Context.
{
  const fx = fixture();
  const otherContext = defineContext(fx.memory, fx.fresh(), fx.fresh());
  expectJudgmentError("judgment-context-mismatch", () => replayStructuralJudgment(
    fx.memory,
    { ...fx.evidence, judgment: { ...fx.evidence.judgment, context: otherContext } },
  ));
}

// An ordinary relation is not an alternative encoding of Context K.
{
  const fx = fixture();
  const invalidContext = fx.memory.ensure(fx.fresh(), fx.fresh());
  expectJudgmentError("invalid-judgment-context", () => replayStructuralJudgment(
    fx.memory,
    { ...fx.evidence, judgment: { ...fx.evidence.judgment, context: invalidContext } },
  ));
}

// A valid application cannot prove a different selected claim.
{
  const fx = fixture();
  const forgedClaim = fx.memory.ensure(fx.fresh(), fx.fresh());
  expectJudgmentError("judgment-claim-mismatch", () => replayStructuralJudgment(
    fx.memory,
    { ...fx.evidence, judgment: { ...fx.evidence.judgment, claim: forgedClaim } },
  ));
}

// Admission remains structural T ⟼ Rule evidence, never a host callback name.
{
  const fx = fixture();
  const forgedAdmission = fx.memory.ensure(fx.fresh(), fx.rule);
  expectJudgmentError("invalid-rule-application", () => replayStructuralJudgment(
    fx.memory,
    { ...fx.evidence, application: { ...fx.evidence.application, ruleAdmission: forgedAdmission } },
  ));
}

// Even when the selected judgment repeats a forged body, exact Act bindings win.
{
  const fx = fixture();
  const forgedClaim = fx.memory.ensure(fx.fresh(), fx.fresh());
  expectJudgmentError("invalid-rule-application", () => replayStructuralJudgment(
    fx.memory,
    {
      application: { ...fx.evidence.application, claimedBody: forgedClaim },
      judgment: { ...fx.evidence.judgment, claim: forgedClaim },
    },
  ));
}

// Foreign handles cannot cross the Memory boundary as judgment evidence.
{
  const fx = fixture();
  const foreign = new Memory().root;
  expectJudgmentError("invalid-judgment-evidence", () => replayStructuralJudgment(
    fx.memory,
    { ...fx.evidence, judgment: { ...fx.evidence.judgment, claim: foreign } },
  ));
}
