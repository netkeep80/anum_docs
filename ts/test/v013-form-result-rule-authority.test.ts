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
  if (!condition) throw new Error(`v0.13 form result Rule: ${message}`);
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
  throw new Error(`v0.13 form result Rule: expected ${code}`);
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

type Kind = "direct" | "inverse";

interface Fixture {
  readonly memory: Memory;
  readonly sourceUseRole: LinkHandle;
  readonly startRole: LinkHandle;
  readonly endRole: LinkHandle;
  readonly use: LinkHandle;
  readonly rule: LinkHandle;
  readonly admission: LinkHandle;
  readonly fixedTheory: unknown;
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
  form(operand: LinkHandle): LinkHandle;
  expectedResult(operand: LinkHandle): LinkHandle;
  evidence(
    operand: LinkHandle,
    claimedResult: LinkHandle,
    boundStart: LinkHandle,
    boundEnd: LinkHandle,
  ): StructuralRuleReplayEvidence;
}

function fixture(kind: Kind): Fixture {
  const memory = new Memory();
  ensureRootBasis(memory);
  const refs = anchors(memory, 28);

  const sourceUseRole = refs[0]!;
  const startRole = refs[1]!;
  const endRole = refs[2]!;
  const dictionary = refs[3]!;
  const grammar = refs[4]!;
  const theory = refs[5]!;
  const use = refs[6]!;

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

  // Shared operand template:
  //
  //   Operand = Start -> End
  //   P       = P -> Operand
  //   Q       = Operand -> Q
  //
  // Direct form:
  //   D = P -> Q
  //   Transition = D -> Operand
  //
  // Inverse form:
  //   I = Q -> P
  //   Transition = I -> (End -> Start)
  const operandTemplate = memory.ensure(startRole, endRole);
  const startFormTemplate = memory.ensureStartSelfClosed(operandTemplate);
  const endFormTemplate = memory.ensureEndSelfClosed(operandTemplate);

  const formTemplate = kind === "direct"
    ? memory.ensure(startFormTemplate, endFormTemplate)
    : memory.ensure(endFormTemplate, startFormTemplate);

  const resultTemplate = kind === "direct"
    ? operandTemplate
    : memory.ensure(endRole, startRole);

  const transitionTemplate = memory.ensure(formTemplate, resultTemplate);
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

  function form(operand: LinkHandle): LinkHandle {
    const p = memory.ensureStartSelfClosed(operand);
    const q = memory.ensureEndSelfClosed(operand);
    return kind === "direct"
      ? memory.ensure(p, q)
      : memory.ensure(q, p);
  }

  function expectedResult(operand: LinkHandle): LinkHandle {
    if (kind === "direct") return operand;
    const poles = memory.poles(operand);
    return memory.ensure(poles.end, poles.start);
  }

  function evidence(
    operand: LinkHandle,
    claimedResult: LinkHandle,
    boundStart: LinkHandle,
    boundEnd: LinkHandle,
  ): StructuralRuleReplayEvidence {
    const concreteForm = form(operand);
    const transition = memory.ensure(concreteForm, claimedResult);
    const claimedBody = memory.ensure(use, transition);

    const afterContext = defineContext(memory, parent, claimedBody);
    const act = defineActHeader(
      memory,
      interpreter,
      roleDictionary,
      afterContext,
    );
    defineActField(memory, act, sourceUseRole, use);
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
    sourceUseRole,
    startRole,
    endRole,
    use,
    rule,
    admission,
    fixedTheory,
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
    form,
    expectedResult,
    evidence,
  });
}

// DIRECT_FORM(S) is itself a Link, and the Rule proves its semantic result is
// exactly the same Operand S=a->b.
{
  const f = fixture("direct");
  const D = f.form(f.S);
  const result = f.expectedResult(f.S);
  same(result, f.S, "direct result is S");

  const correct = f.evidence(f.S, result, f.a, f.b);
  const before = f.memory.linkCount;
  const replay = replayV012StructuralRuleAgainstTheoryAuthority(
    f.memory,
    correct,
    f.fixedTheory,
  );
  same(replay.claimedBody, correct.claimedBody, "D -> S transition replays");
  same(f.memory.linkCount, before, "direct replay is read-only");

  const dPoles = f.memory.poles(D);
  const p = f.memory.ensureStartSelfClosed(f.S);
  const q = f.memory.ensureEndSelfClosed(f.S);
  same(dPoles.start, p, "D starts at START_FORM(S)");
  same(dPoles.end, q, "D ends at END_FORM(S)");
}

// The same D form cannot claim the inverse result.
{
  const f = fixture("direct");
  const wrong = f.memory.ensure(f.b, f.a);
  const evidence = f.evidence(f.S, wrong, f.a, f.b);
  const before = f.memory.linkCount;
  expectRuleError(
    "template-mismatch",
    () => replayV012StructuralRuleAgainstTheoryAuthority(
      f.memory,
      evidence,
      f.fixedTheory,
    ),
  );
  same(f.memory.linkCount, before, "wrong direct result rejection is read-only");
}

// INVERSE_FORM(S) is a Link Q->P, and the Rule proves its result is b->a.
{
  const f = fixture("inverse");
  const I = f.form(f.S);
  const inverse = f.expectedResult(f.S);
  const inversePoles = f.memory.poles(inverse);
  same(inversePoles.start, f.b, "inverse result starts at end(S)");
  same(inversePoles.end, f.a, "inverse result ends at start(S)");

  const correct = f.evidence(f.S, inverse, f.a, f.b);
  const before = f.memory.linkCount;
  const replay = replayV012StructuralRuleAgainstTheoryAuthority(
    f.memory,
    correct,
    f.fixedTheory,
  );
  same(replay.claimedBody, correct.claimedBody, "I -> -S transition replays");
  same(f.memory.linkCount, before, "inverse replay is read-only");

  const iPoles = f.memory.poles(I);
  const p = f.memory.ensureStartSelfClosed(f.S);
  const q = f.memory.ensureEndSelfClosed(f.S);
  same(iPoles.start, q, "I starts at END_FORM(S)");
  same(iPoles.end, p, "I ends at START_FORM(S)");
}

// The same I form cannot claim the original S as its result.
{
  const f = fixture("inverse");
  const evidence = f.evidence(f.S, f.S, f.a, f.b);
  const before = f.memory.linkCount;
  expectRuleError(
    "template-mismatch",
    () => replayV012StructuralRuleAgainstTheoryAuthority(
      f.memory,
      evidence,
      f.fixedTheory,
    ),
  );
  same(f.memory.linkCount, before, "wrong inverse result rejection is read-only");
}

// Substituting a different Whole while preserving the bound a,b pair is caught
// recursively inside the concrete form topology.
for (const kind of ["direct", "inverse"] as const) {
  const f = fixture(kind);
  const claimed = f.expectedResult(f.T);
  const evidence = f.evidence(f.T, claimed, f.a, f.b);
  const before = f.memory.linkCount;
  expectRuleError(
    "template-mismatch",
    () => replayV012StructuralRuleAgainstTheoryAuthority(
      f.memory,
      evidence,
      f.fixedTheory,
    ),
  );
  same(
    f.memory.linkCount,
    before,
    `${kind} wrong Whole rejection is read-only`,
  );
}

// Root projection: L/U are form Links whose Rule-grounded semantic result is R.
// This is result equality, not strict Link identity.
{
  const direct = fixture("direct");
  const basis = ensureRootBasis(direct.memory);
  const D = direct.form(basis.R);
  same(D, basis.L, "DIRECT_FORM(R)=L");
  const directEvidence = direct.evidence(
    basis.R,
    basis.R,
    basis.R,
    basis.R,
  );
  replayV012StructuralRuleAgainstTheoryAuthority(
    direct.memory,
    directEvidence,
    direct.fixedTheory,
  );

  const inverse = fixture("inverse");
  const inverseBasis = ensureRootBasis(inverse.memory);
  const I = inverse.form(inverseBasis.R);
  same(I, inverseBasis.U, "INVERSE_FORM(R)=U");
  const inverseEvidence = inverse.evidence(
    inverseBasis.R,
    inverseBasis.R,
    inverseBasis.R,
    inverseBasis.R,
  );
  replayV012StructuralRuleAgainstTheoryAuthority(
    inverse.memory,
    inverseEvidence,
    inverse.fixedTheory,
  );
}

console.log(
  "MTS v0.13 direct/inverse form results grounded by StructuralRule: GREEN.",
);
