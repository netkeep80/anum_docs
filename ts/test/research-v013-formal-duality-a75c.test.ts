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
import { exportPortableStructuralTheory } from "../src/portable-theory.js";
import { defineSourceForm } from "../src/source.js";
import {
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
  evaluateV013FormalAspectProgram,
  type V013FormalAspectProgramEvidence,
} from "../src/v013-formal-aspect-evaluator.js";
import {
  decomposeV013SemanticLink,
  materializeV013HierarchicalCarrierFromSemanticLink,
  serializeV013HierarchicalCarrier,
} from "../src/v013-hierarchical-carrier.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.13 A75c FORMAL duality: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
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
  assert(DIGITS.includes(value as Digit), `digit ${value}`);
  return value as Digit;
}

function buildFixture(memory: Memory, text: string): Fixture {
  const basis = ensureRootBasis(memory);
  const refs = neutralRefs(memory, basis, 14);

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

function program(fixture: Fixture): V013FormalAspectProgramEvidence {
  const operators = [...fixture.text].map((raw, index) => {
    const digit = asDigit(raw);
    const selectedRule = fixture.rules[digit];
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

function evaluate(fixture: Fixture): LinkHandle {
  return evaluateV013FormalAspectProgram(
    fixture.memory,
    fixture.basis,
    program(fixture),
    fixture.authority,
    fixture.fixedTheory,
  );
}

function invertLink(
  memory: Memory,
  basis: RootBasis,
  source: LinkHandle,
  memo = new Map<LinkHandle, LinkHandle>(),
): LinkHandle {
  const known = memo.get(source);
  if (known !== undefined) return known;

  const decomposition = decomposeV013SemanticLink(memory, basis, source);
  let result: LinkHandle;
  if (decomposition.aspect === "ROOT") {
    result = basis.R;
  } else if (decomposition.aspect === "START") {
    result = memory.ensureEndSelfClosed(
      invertLink(memory, basis, decomposition.children[0]!, memo),
    );
  } else if (decomposition.aspect === "END") {
    result = memory.ensureStartSelfClosed(
      invertLink(memory, basis, decomposition.children[0]!, memo),
    );
  } else {
    const left = invertLink(memory, basis, decomposition.children[0]!, memo);
    const right = invertLink(memory, basis, decomposition.children[1]!, memo);
    result = memory.ensure(right, left);
  }
  memo.set(source, result);
  return result;
}

function invertWire(source: string): string {
  let offset = 0;
  const visit = (): string => {
    const opcode = source[offset++];
    if (opcode === undefined) throw new Error("truncated FORMAL wire");
    if (opcode === "8") return "8";
    if (opcode === "9") return `6${visit()}`;
    if (opcode === "6") return `9${visit()}`;
    if (opcode === "1") {
      const left = visit();
      const right = visit();
      return `1${right}${left}`;
    }
    throw new Error(`invalid FORMAL opcode ${opcode}`);
  };
  const result = visit();
  assert(offset === source.length, "wire inversion consumes exact source");
  return result;
}

function canonicalWire(
  memory: Memory,
  basis: RootBasis,
  semantic: LinkHandle,
): string {
  const carrier = materializeV013HierarchicalCarrierFromSemanticLink(
    memory,
    basis,
    semantic,
  );
  return String.fromCharCode(
    ...serializeV013HierarchicalCarrier(memory, basis, carrier),
  );
}

for (const text of [
  "8",
  "98",
  "68",
  "19868",
  "16898",
  "1968698",
] as const) {
  const memory = new Memory();

  const original = buildFixture(memory, text);
  const originalResult = evaluate(original);

  const dualText = invertWire(text);
  const dual = buildFixture(memory, dualText);
  const dualResult = evaluate(dual);

  same(original.dictionary, dual.dictionary, `${text}: same Dictionary`);
  same(original.grammar, dual.grammar, `${text}: same Grammar`);
  same(original.theory, dual.theory, `${text}: same Theory identity`);
  same(original.roleDictionary, dual.roleDictionary, `${text}: same role Dictionary`);

  for (const digit of DIGITS) {
    same(original.rules[digit].rule, dual.rules[digit].rule, `${text}: same ${digit} Rule`);
    same(
      original.rules[digit].admission,
      dual.rules[digit].admission,
      `${text}: same ${digit} Theory admission`,
    );
  }

  same(
    dualResult,
    invertLink(memory, original.basis, originalResult),
    `${text}: Eval(J(q)) = J(Eval(q))`,
  );
  same(
    canonicalWire(memory, original.basis, dualResult),
    dualText,
    `${text}: dual result has exact recursively inverted canonical wire`,
  );
}

console.log([
  "MTS v0.13 A75c: FORMAL_DUALITY=GREEN_SCOPED_RESEARCH",
  "FRM_01_EVAL_EQUIVARIANCE=EVAL_JQ_EQUALS_J_EVAL_Q",
  "SAME_DICTIONARY_GRAMMAR_THEORY_IDENTITY=YES",
  "SAME_FOUR_OPERATOR_RULES_AND_ADMISSIONS=YES",
  "SOURCE_THEORY_MEMBERSHIP=SOURCE_SPECIFIC_AS_EXPECTED",
  "FORMAL_COMPOSER_ORIENTATION_OBSTRUCTION=NONE_IN_TESTED_SCOPE",
  "PORTABLE_THEORY_J_AUTOMORPHISM=NOT_YET_CLASSIFIED",
].join(" "));
