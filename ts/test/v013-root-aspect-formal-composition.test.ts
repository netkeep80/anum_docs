import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  defineDictionaryEffect,
  defineDictionaryScope,
} from "../src/dictionary.js";
import { materializeExactSequence } from "../src/exact-sequence.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type RootBasis,
} from "../src/memory.js";
import {
  PortableStructuralTheoryError,
  exportPortableStructuralTheory,
} from "../src/portable-theory.js";
import { defineSourceForm } from "../src/source.js";
import {
  StructuralRuleError,
  admitStructuralRule,
  defineStructuralInterpreter,
  defineStructuralRoleDictionary,
  defineStructuralRule,
  type StructuralInterpreter,
  type StructuralRuleReplayEvidence,
} from "../src/structural-rule.js";
import {
  defineActField,
  defineActHeader,
} from "../src/structural-readers.js";
import { defineContext } from "../src/state.js";
import {
  buildV012SelectedSourceEvidence,
  materializeV012SourceContent,
  type V012SourceAuthority,
  type V012SourceResultEvidence,
} from "../src/v012-source.js";
import {
  V013FormalAspectEvaluationError,
  evaluateV013FormalAspectProgram,
  type V013FormalAspectProgramEvidence,
} from "../src/v013-formal-aspect-evaluator.js";
import {
  materializeV013HierarchicalCarrierFromSemanticLink,
  serializeV013HierarchicalCarrier,
} from "../src/v013-hierarchical-carrier.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.13 FORMAL aspect composition: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}

function sameBytes(actual: Uint8Array, expected: Uint8Array, message: string): void {
  assert(
    actual.length === expected.length &&
      actual.every((value, index) => value === expected[index]),
    `${message}: byte sequences differ`,
  );
}

function bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

type Digit = "8" | "9" | "6" | "1";
const DIGITS = Object.freeze(["8", "9", "6", "1"] as const);

interface RuleRef {
  readonly rule: LinkHandle;
  readonly admission: LinkHandle;
}

interface Fixture {
  readonly memory: Memory;
  readonly basis: RootBasis;
  readonly dictionary: LinkHandle;
  readonly grammar: LinkHandle;
  readonly theory: LinkHandle;
  readonly fixedTheoryWithoutRules: unknown;
  readonly fixedTheory: unknown;
  readonly interpreter: Readonly<{
    handle: LinkHandle;
    structure: StructuralInterpreter;
  }>;
  readonly context: LinkHandle;
  readonly sourceUseRole: LinkHandle;
  readonly roleDictionary: LinkHandle;
  readonly uses: Readonly<Record<Digit, LinkHandle>>;
  readonly tags: Readonly<Record<Digit, LinkHandle>>;
  readonly rules: Readonly<Record<Digit, RuleRef>>;
  readonly selectedSource: ReturnType<typeof buildV012SelectedSourceEvidence>;
  readonly authority: V012SourceAuthority;
  readonly text: string;
}

function neutralRefs(
  memory: Memory,
  basis: RootBasis,
  count: number,
): readonly LinkHandle[] {
  const result: LinkHandle[] = [];
  let current = memory.ensure(basis.U, basis.L);
  for (let index = 0; index < count; index += 1) {
    current = index % 2 === 0
      ? memory.ensure(current, basis.U)
      : memory.ensure(basis.L, current);
    result.push(current);
  }
  return Object.freeze(result);
}

function asDigit(value: string): Digit {
  assert(DIGITS.includes(value as Digit), `test fixture digit ${value}`);
  return value as Digit;
}

function buildFixture(memory: Memory, text: string): Fixture {
  const basis = ensureRootBasis(memory);
  const refs = neutralRefs(memory, basis, 14);

  // Uses are allocated before the role placeholder so grounded constants cannot
  // recursively contain that placeholder in generic template matching.
  const uses = Object.freeze({
    "8": refs[0]!,
    "9": refs[1]!,
    "6": refs[2]!,
    "1": refs[3]!,
  });
  const grammar = refs[4]!;
  const theory = refs[5]!;
  const sourceUseRole = refs[10]!;

  const tags = Object.freeze({
    "8": basis.R,
    "9": basis.O,
    "6": basis.C,
    "1": basis.L,
  });

  let history = basis.R;
  let dictionary = defineDictionaryScope(memory, basis.R, history);
  const occurrences = {} as Record<Digit, LinkHandle>;
  for (const digit of DIGITS) {
    const effect = defineDictionaryEffect(
      memory,
      dictionary,
      basis.R,
      history,
      materializeV012SourceContent(memory, basis, bytes(digit)),
      uses[digit],
    );
    occurrences[digit] = effect.occurrence;
    history = effect.historyAfter;
    dictionary = effect.afterScope;
  }

  const source = defineSourceForm(
    memory,
    materializeV012SourceContent(memory, basis, bytes(text)),
  );
  const textDigits = [...text].map(asDigit);
  const formSequence = materializeExactSequence(
    memory,
    textDigits.map((digit) => uses[digit]),
  );
  const grammarMembership = memory.ensure(grammar, formSequence);
  const theoryMembership = memory.ensure(theory, formSequence);
  const authority: V012SourceAuthority = Object.freeze({
    dictionary,
    grammar,
    theory,
    grammarMembership,
    theoryMembership,
  });

  const selectedSource = buildV012SelectedSourceEvidence(
    memory,
    basis,
    source,
    textDigits.map((digit, index) => Object.freeze({
      start: index,
      end: index + 1,
      form: uses[digit],
      dictionaryOccurrence: occurrences[digit],
    })),
    authority,
  );

  const interpreter = Object.freeze({
    handle: defineStructuralInterpreter(memory, dictionary, grammar, theory),
    structure: Object.freeze({ dictionary, grammar, theory }),
  });
  const context = defineContext(memory, basis.R, basis.R);
  const roleDictionary = defineStructuralRoleDictionary(memory, [sourceUseRole]);

  // This snapshot proves that source membership alone cannot authorize an
  // operator Rule added later.
  const fixedTheoryWithoutRules = exportPortableStructuralTheory(memory, theory);

  const rules = {} as Record<Digit, RuleRef>;
  for (const digit of DIGITS) {
    const groundedMeaning = memory.ensure(uses[digit], tags[digit]);
    const body = memory.ensure(sourceUseRole, groundedMeaning);
    const rule = defineStructuralRule(memory, roleDictionary, body);
    rules[digit] = Object.freeze({
      rule,
      admission: admitStructuralRule(memory, theory, rule),
    });
  }

  return Object.freeze({
    memory,
    basis,
    dictionary,
    grammar,
    theory,
    fixedTheoryWithoutRules,
    fixedTheory: exportPortableStructuralTheory(memory, theory),
    interpreter,
    context,
    sourceUseRole,
    roleDictionary,
    uses,
    tags,
    rules: Object.freeze(rules),
    selectedSource,
    authority,
    text,
  });
}

function program(
  fixture: Fixture,
  ruleOverride: ReadonlyMap<number, Digit> = new Map(),
): V013FormalAspectProgramEvidence {
  const operators = [...fixture.text].map((raw, index) => {
    const digit = asDigit(raw);
    const selectedRule = fixture.rules[ruleOverride.get(index) ?? digit];
    const use = fixture.uses[digit];

    const act = defineActHeader(
      fixture.memory,
      fixture.interpreter.handle,
      fixture.roleDictionary,
      fixture.context,
    );
    const useAttachment = defineActField(
      fixture.memory,
      act,
      fixture.sourceUseRole,
      use,
    );
    const claim = fixture.memory.ensure(
      use,
      fixture.memory.ensure(use, fixture.tags[digit]),
    );
    const structural: StructuralRuleReplayEvidence = Object.freeze({
      act,
      rule: selectedRule.rule,
      ruleAdmission: selectedRule.admission,
      claimedBody: claim,
      expectedInterpreter: fixture.interpreter.structure,
      expectedAfterContext: fixture.context,
    });
    const result: V012SourceResultEvidence = Object.freeze({
      source: fixture.selectedSource,
      structural,
      selectedActAttachments: Object.freeze([useAttachment]),
      sourceUseIndex: index,
      sourceUseRole: fixture.sourceUseRole,
    });
    return result;
  });

  return Object.freeze({
    source: fixture.selectedSource,
    operators: Object.freeze(operators),
  });
}

function evaluate(
  fixture: Fixture,
  evidence: V013FormalAspectProgramEvidence = program(fixture),
  fixedTheory: unknown = fixture.fixedTheory,
): LinkHandle {
  return evaluateV013FormalAspectProgram(
    fixture.memory,
    fixture.basis,
    evidence,
    fixture.authority,
    fixedTheory,
  );
}

function expectEvaluatorError(
  effect: () => unknown,
  code: V013FormalAspectEvaluationError["code"],
): void {
  try {
    effect();
  } catch (error) {
    assert(
      error instanceof V013FormalAspectEvaluationError,
      `expected evaluator error, got ${String(error)}`,
    );
    same(error.code, code, "evaluator error code");
    return;
  }
  throw new Error(`v0.13 FORMAL aspect composition: expected ${code}`);
}

function canonicalWire(fixture: Fixture, semantic: LinkHandle): Uint8Array {
  const carrier = materializeV013HierarchicalCarrierFromSemanticLink(
    fixture.memory,
    fixture.basis,
    semantic,
  );
  return serializeV013HierarchicalCarrier(
    fixture.memory,
    fixture.basis,
    carrier,
  );
}

// Root closure: the operator sign is not the target Link; composition is.
for (const [text, expected] of [
  ["8", "R"],
  ["98", "O"],
  ["68", "C"],
  ["19868", "L"],
  ["16898", "U"],
] as const) {
  const fixture = buildFixture(new Memory(), text);
  const result = evaluate(fixture);
  same(result, fixture.basis[expected], `${text} constructs exact ${expected}`);
  sameBytes(canonicalWire(fixture, result), bytes(text), `${text} canonical semantic wire`);
}

// Generic non-bootstrap term, independently reconstructed in two Memories.
{
  const text = "1968698";
  const a = buildFixture(new Memory(), text);
  const b = buildFixture(new Memory(), text);
  const resultA = evaluate(a);
  const resultB = evaluate(b);

  assert(resultA !== resultB, "independent Memories keep local target handles");
  sameBytes(canonicalWire(a, resultA), bytes(text), "A generic finite term wire");
  sameBytes(canonicalWire(b, resultB), bytes(text), "B generic finite term wire");

  const poles = b.memory.poles(resultB);
  const left = b.memory.poles(poles.start);
  const right = b.memory.poles(poles.end);
  same(left.start, poles.start, "generic left is START form");
  same(left.end, b.basis.C, "generic left is START(C)");
  same(right.start, b.basis.O, "generic right is END(O)");
  same(right.end, poles.end, "generic right is END form");
}

// A fully admitted but semantically wrong Rule cannot be borrowed by another
// exact source position, and failure performs no semantic write.
{
  const fixture = buildFixture(new Memory(), "98");
  const forged = program(fixture, new Map([[0, "6" as const]]));
  const before = fixture.memory.linkCount;
  try {
    evaluate(fixture, forged);
    throw new Error("wrong Rule unexpectedly accepted");
  } catch (error) {
    assert(error instanceof StructuralRuleError, "wrong Rule error type");
    same(error.code, "template-mismatch", "wrong Rule exact rejection");
  }
  same(fixture.memory.linkCount, before, "wrong Rule rejection writes zero Links");
}

// Source membership in a Theory snapshot without the selected operator Rules is
// insufficient authority.
{
  const fixture = buildFixture(new Memory(), "98");
  const evidence = program(fixture);
  const before = fixture.memory.linkCount;
  try {
    evaluate(fixture, evidence, fixture.fixedTheoryWithoutRules);
    throw new Error("wrong Theory unexpectedly accepted");
  } catch (error) {
    assert(error instanceof PortableStructuralTheoryError, "wrong Theory error type");
  }
  same(fixture.memory.linkCount, before, "wrong Theory rejection writes zero Links");
}

// Prefix shape is decided only after every source position has acquired an
// authorized structural meaning. Malformed/trailing inputs therefore fail
// before semantic materialization.
for (const [text, code] of [
  ["9", "malformed-prefix"],
  ["1", "malformed-prefix"],
  ["88", "trailing-source"],
] as const) {
  const fixture = buildFixture(new Memory(), text);
  const evidence = program(fixture);
  const before = fixture.memory.linkCount;
  expectEvaluatorError(() => evaluate(fixture, evidence), code);
  same(fixture.memory.linkCount, before, `${text}: structural rejection writes zero Links`);
}

// Generalized PAIR alias, not just a bootstrap special case:
// Pair(START(C), C) would canonicalize to START(C). The evaluator rejects the
// whole plan before creating START(C) or any other semantic child.
{
  const fixture = buildFixture(new Memory(), "196868");
  const evidence = program(fixture);
  const before = fixture.memory.linkCount;
  expectEvaluatorError(
    () => evaluate(fixture, evidence),
    "noncanonical-pair-alias",
  );
  same(fixture.memory.linkCount, before, "noncanonical PAIR writes zero Links");
}

// Executable anti-special-case guard: the production evaluator contains no
// witness-term lookup table. Its only source-dependent dispatch is the
// Rule-grounded ROOT/START/END/PAIR aspect.
{
  const repoRoot = resolve(process.cwd(), "..");
  const implementation = readFileSync(
    join(repoRoot, "ts/src/v013-formal-aspect-evaluator.ts"),
    "utf8",
  );
  for (const forbidden of ["19868", "16898", "1968698"]) {
    assert(!implementation.includes(forbidden), `no hard-coded term ${forbidden}`);
  }
  assert(!/term\s*===/.test(implementation), "no host term equality dispatch");
}

console.log(
  "MTS v0.13 AC10 FORMAL composition: fixed-Theory 8/9/6/1 meanings generically compose R/O/C/L/U and unknown finite terms across independent Memories; wrong Rule/Theory, malformed prefix and PAIR aliases fail before semantic writes: GREEN.",
);
