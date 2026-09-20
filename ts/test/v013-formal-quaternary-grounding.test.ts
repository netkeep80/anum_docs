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
  StructuralRuleError,
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
  replayV012SourceResultEvidence,
  type V012SourceAuthority,
  type V012SourceResultEvidence,
} from "../src/v012-source.js";
import {
  materializeV012StringAnum,
  serializeV012StringAnum,
} from "../src/v012-string-anum.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.13 FORMAL quaternary grounding: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}

function sameBytes(
  actual: Uint8Array,
  expected: Uint8Array,
  message: string,
): void {
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

interface Membership {
  readonly grammar: LinkHandle;
  readonly theory: LinkHandle;
}

interface RuleRef {
  readonly rule: LinkHandle;
  readonly admission: LinkHandle;
}

interface FormalAuthority {
  readonly basis: RootBasis;
  readonly dictionary: LinkHandle;
  readonly grammar: LinkHandle;
  readonly theory: LinkHandle;
  readonly fixedTheory: unknown;
  readonly formalInterpreter: Readonly<{
    handle: LinkHandle;
    structure: StructuralInterpreter;
  }>;
  readonly formalContext: LinkHandle;
  readonly sourceUseRole: LinkHandle;
  readonly roleDictionary: LinkHandle;
  readonly uses: Readonly<Record<Digit, LinkHandle>>;
  readonly tags: Readonly<Record<Digit, LinkHandle>>;
  readonly occurrences: Readonly<Record<Digit, LinkHandle>>;
  readonly memberships: Readonly<Record<Digit, Membership>>;
  readonly rules: Readonly<Record<Digit, RuleRef>>;
}

interface LocalSource {
  readonly source: LinkHandle;
  readonly anum: LinkHandle;
  readonly wire: Uint8Array;
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

function buildFormalAuthority(memory: Memory): FormalAuthority {
  const basis = ensureRootBasis(memory);
  const refs = neutralRefs(memory, basis, 12);

  // Grounded constants must not structurally contain a declared role. Build
  // all exact Uses first, then allocate the role placeholder later in the
  // append-only Memory. Otherwise generic template matching would correctly
  // discover SourceUseRole inside ExpectedUse and treat that subtree as
  // parameterized rather than grounded.
  const uses = Object.freeze({
    "8": refs[0]!,
    "9": refs[1]!,
    "6": refs[2]!,
    "1": refs[3]!,
  });
  const grammar = refs[4]!;
  const theory = refs[5]!;
  const sourceUseRole = refs[8]!;

  // These are structural class descriptors, not aliases for the physical
  // characters themselves:
  //
  //   ROOT  -> R
  //   START -> O = START_FORM(R)
  //   END   -> C = END_FORM(R)
  //   PAIR  -> L = O -> C
  //
  // In particular physical source "1" is not assumed to be the accepted F1
  // sign m1 merely because both are printed with the same glyph.
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

  const memberships = {} as Record<Digit, Membership>;
  for (const digit of DIGITS) {
    const useSequence = materializeExactSequence(memory, [uses[digit]]);
    memberships[digit] = Object.freeze({
      grammar: memory.ensure(grammar, useSequence),
      theory: memory.ensure(theory, useSequence),
    });
  }

  // v0.12 FORMAL has no host enum that makes an interpreter "formal".
  // Interpreter identity is the explicit D/G/T Link. This candidate I_FORMAL
  // is therefore the exact structural interpreter selected by the witness.
  const formalInterpreter = Object.freeze({
    handle: defineStructuralInterpreter(memory, dictionary, grammar, theory),
    structure: Object.freeze({ dictionary, grammar, theory }),
  });
  const formalContext = defineContext(memory, basis.R, basis.R);

  const roleDictionary = defineStructuralRoleDictionary(
    memory,
    [sourceUseRole],
  );

  const rules = {} as Record<Digit, RuleRef>;
  for (const digit of DIGITS) {
    // The Rule has two independent obligations:
    //
    //   1. sourceUseRole must equal this exact digit's local Use;
    //   2. that exact Use denotes this exact structural class tag.
    //
    // Body template:
    //
    //   SourceUseRole -> (ExpectedUse -> StructuralTag)
    //
    // A different physical source selects a different Use and therefore cannot
    // replay this Rule merely by choosing it from the same fixed Theory.
    const groundedMeaning = memory.ensure(uses[digit], tags[digit]);
    const body = memory.ensure(sourceUseRole, groundedMeaning);
    const rule = defineStructuralRule(memory, roleDictionary, body);
    rules[digit] = Object.freeze({
      rule,
      admission: admitStructuralRule(memory, theory, rule),
    });
  }

  // Freeze Theory only after all source memberships and meaning Rules exist.
  const fixedTheory = exportPortableStructuralTheory(memory, theory);

  return Object.freeze({
    basis,
    dictionary,
    grammar,
    theory,
    fixedTheory,
    formalInterpreter,
    formalContext,
    sourceUseRole,
    roleDictionary,
    uses,
    tags,
    occurrences: Object.freeze(occurrences),
    memberships: Object.freeze(memberships),
    rules: Object.freeze(rules),
  });
}

function sourceAuthority(
  local: FormalAuthority,
  digit: Digit,
): V012SourceAuthority {
  return Object.freeze({
    dictionary: local.dictionary,
    grammar: local.grammar,
    theory: local.theory,
    grammarMembership: local.memberships[digit].grammar,
    theoryMembership: local.memberships[digit].theory,
  });
}

function materializeLocalSource(
  memory: Memory,
  local: FormalAuthority,
  digit: Digit,
  physical: Uint8Array = bytes(digit),
): LocalSource {
  const stringAnum = materializeV012StringAnum(
    memory,
    local.basis,
    physical,
  );
  const wire = serializeV012StringAnum(memory, local.basis, stringAnum);
  sameBytes(wire, physical, `${digit}: STRING source preserves exact bytes`);

  return Object.freeze({
    source: defineSourceForm(memory, stringAnum.anumLink),
    anum: stringAnum.anumLink,
    wire,
  });
}

function buildEvidence(
  memory: Memory,
  local: FormalAuthority,
  digit: Digit,
  source: LinkHandle,
  ruleDigit: Digit = digit,
): V012SourceResultEvidence {
  const selected = buildV012SelectedSourceEvidence(
    memory,
    local.basis,
    source,
    [{
      start: 0,
      end: 1,
      form: local.uses[digit],
      dictionaryOccurrence: local.occurrences[digit],
    }],
    sourceAuthority(local, digit),
  );

  const act = defineActHeader(
    memory,
    local.formalInterpreter.handle,
    local.roleDictionary,
    local.formalContext,
  );
  const sourceUseAttachment = defineActField(
    memory,
    act,
    local.sourceUseRole,
    local.uses[digit],
  );

  // Concrete claim is always what this exact selected source says:
  //
  //   selectedUse -> (selectedUse -> expected structural tag)
  //
  // If a Rule belonging to another digit is substituted, its grounded
  // ExpectedUse / StructuralTag constants must reject during template replay.
  const claim = memory.ensure(
    local.uses[digit],
    memory.ensure(local.uses[digit], local.tags[digit]),
  );

  const rule = local.rules[ruleDigit];
  const structural: StructuralRuleReplayEvidence = Object.freeze({
    act,
    rule: rule.rule,
    ruleAdmission: rule.admission,
    claimedBody: claim,
    expectedInterpreter: local.formalInterpreter.structure,
    expectedAfterContext: local.formalContext,
  });

  return Object.freeze({
    source: selected,
    structural,
    selectedActAttachments: Object.freeze([sourceUseAttachment]),
    sourceUseIndex: 0,
    sourceUseRole: local.sourceUseRole,
  });
}

function replayMeaning(
  memory: Memory,
  local: FormalAuthority,
  digit: Digit,
  source: LinkHandle,
): LinkHandle {
  const evidence = buildEvidence(memory, local, digit, source);
  const before = memory.linkCount;

  const replay = replayV012SourceResultEvidence(
    memory,
    local.basis,
    evidence,
    sourceAuthority(local, digit),
    local.fixedTheory,
  );

  same(memory.linkCount, before, `${digit}: FORMAL replay is read-only`);
  same(replay.selectedUse, local.uses[digit], `${digit}: exact selected Use`);
  same(
    replay.structural.interpreter,
    local.formalInterpreter.handle,
    `${digit}: exact I_FORMAL identity`,
  );

  const outer = memory.poles(replay.structural.claimedBody);
  same(outer.start, replay.selectedUse, `${digit}: meaning owner is selected Use`);

  const groundedMeaning = memory.poles(outer.end);
  same(
    groundedMeaning.start,
    replay.selectedUse,
    `${digit}: Rule grounds this exact source Use`,
  );
  same(
    groundedMeaning.end,
    local.tags[digit],
    `${digit}: Rule grounds exact structural class tag`,
  );

  return groundedMeaning.end;
}

function expectRuleMismatch(
  effect: () => unknown,
  message: string,
): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof StructuralRuleError, `${message}: wrong error type`);
    same(error.code, "template-mismatch", `${message}: exact error code`);
    return;
  }
  throw new Error(
    `v0.13 FORMAL quaternary grounding: ${message}: expected template-mismatch`,
  );
}

const memoryA = new Memory();
const memoryB = new Memory();
const localA = buildFormalAuthority(memoryA);
const localB = buildFormalAuthority(memoryB);

// Independent Memories must never share local structural identities.
for (const digit of DIGITS) {
  assert(
    localA.uses[digit] !== localB.uses[digit],
    `${digit}: source Use handles are Memory-local`,
  );
  assert(
    localA.tags[digit] !== localB.tags[digit],
    `${digit}: structural class tags are Memory-local`,
  );
}

// The four exact physical symbols cross the boundary as faithful STRING source
// bytes, then acquire meaning only through receiver-local FORMAL authority.
for (const digit of DIGITS) {
  const sourceA = materializeLocalSource(memoryA, localA, digit);
  const emitted = sourceA.wire;

  const sourceB = materializeLocalSource(memoryB, localB, digit, emitted);
  sameBytes(sourceB.wire, emitted, `${digit}: two-Memory physical parity`);

  const meaningA = replayMeaning(memoryA, localA, digit, sourceA.source);
  const meaningB = replayMeaning(memoryB, localB, digit, sourceB.source);

  same(meaningA, localA.tags[digit], `${digit}: A structural meaning`);
  same(meaningB, localB.tags[digit], `${digit}: B structural meaning`);

  // Source carrier, Dictionary Use, and semantic structural class are three
  // different roles even when the printed glyph is the same.
  assert(sourceA.anum !== meaningA, `${digit}: source anum != structural meaning`);
  assert(localA.uses[digit] !== meaningA, `${digit}: selected Use != structural meaning`);
}

// Exact candidate correspondence proved through FORMAL D/G/T/Rule authority.
same(replayMeaning(
  memoryA,
  localA,
  "8",
  materializeLocalSource(memoryA, localA, "8").source,
), localA.basis.R, "8 = ROOT");
same(replayMeaning(
  memoryA,
  localA,
  "9",
  materializeLocalSource(memoryA, localA, "9").source,
), localA.basis.O, "9 = START class");
same(replayMeaning(
  memoryA,
  localA,
  "6",
  materializeLocalSource(memoryA, localA, "6").source,
), localA.basis.C, "6 = END class");
same(replayMeaning(
  memoryA,
  localA,
  "1",
  materializeLocalSource(memoryA, localA, "1").source,
), localA.basis.L, "1 = PAIR class");

// Critical anti-glyph-magic control: "1" as physical source is not itself L.
// It reaches the PAIR-class descriptor only after exact Dictionary/Grammar/
// fixed-Theory/Rule replay.
assert(localA.uses["1"] !== localA.basis.L, "physical-source Use for 1 is not L");

// A different admitted Rule from the SAME fixed Theory cannot be selected for
// source "9". Rule 6 is fully valid and admitted, but its grounded expected Use
// and END-class tag make the substitution structurally false.
{
  const source9 = materializeLocalSource(memoryA, localA, "9");
  const forged = buildEvidence(memoryA, localA, "9", source9.source, "6");
  const before = memoryA.linkCount;

  expectRuleMismatch(
    () => replayV012SourceResultEvidence(
      memoryA,
      localA.basis,
      forged,
      sourceAuthority(localA, "9"),
      localA.fixedTheory,
    ),
    "source 9 cannot borrow source 6 meaning Rule",
  );
  same(memoryA.linkCount, before, "wrong meaning Rule writes nothing");
}

console.log(
  "MTS v0.13 FORMAL grounding of physical 8/9/6/1 -> ROOT/START/END/PAIR structural classes under exact Dictionary/Grammar/fixed Theory/Rule authority: GREEN.",
);
