// mts-version-evidence: required-from=0.12

import {
  defineDictionaryEffect,
  defineDictionaryScope,
} from "../src/dictionary.js";
import { materializeExactSequence } from "../src/exact-sequence.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type LinkPoles,
  type ReadMemory,
} from "../src/memory.js";
import {
  SourceError,
  defineSourceForm,
} from "../src/source.js";
import {
  StructuralRuleError,
  admitStructuralRule,
  defineStructuralInterpreter,
  defineStructuralRoleDictionary,
  defineStructuralRule,
  replayStructuralRule,
  type StructuralRuleReplayEvidence,
} from "../src/structural-rule.js";
import {
  defineActField,
  defineActHeader,
} from "../src/structural-readers.js";
import {
  buildV012SelectedSourceEvidence,
  materializeV012SourceContent,
  replayV012SelectedSourceEvidence,
  type V012SourceAuthority,
} from "../src/v012-source.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.12 FORMAL source->result witness: ${message}`);
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}
function structuralError(
  code: StructuralRuleError["code"],
  effect: () => unknown,
): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof StructuralRuleError, `expected StructuralRuleError, got ${String(error)}`);
    same(error.code, code, "structural rule error code");
    return;
  }
  throw new Error(`v0.12 FORMAL source->result witness: expected ${code}`);
}
function sourceError(
  code: SourceError["code"],
  effect: () => unknown,
): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof SourceError, `expected SourceError, got ${String(error)}`);
    same(error.code, code, "source error code");
    return;
  }
  throw new Error(`v0.12 FORMAL source->result witness: expected ${code}`);
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
class ReadOnlyProbe implements ReadMemory {
  constructor(private readonly source: ReadMemory) {}
  get root(): LinkHandle { return this.source.root; }
  get linkCount(): number { return this.source.linkCount; }
  poles(link: LinkHandle): LinkPoles { return this.source.poles(link); }
  find(start: LinkHandle, end: LinkHandle): LinkHandle | undefined {
    return this.source.find(start, end);
  }
  outgoing(start: LinkHandle): readonly LinkHandle[] {
    return this.source.outgoing(start);
  }
  incoming(end: LinkHandle): readonly LinkHandle[] {
    return this.source.incoming(end);
  }
}

/**
 * End-to-end v0.12 foundation witness:
 *
 * exact FORMAL UTF-8 source "["
 *   -> exact STRING Anum
 *   -> Dictionary Entry/occurrence
 *   -> admitted selected Use
 *   -> Rule admitted by THE SAME Theory
 *   -> Use role binding checked by generic structural replay
 *   -> grounded FORMAL result
 *
 * Producer code constructs candidates only. All acceptance below is replayed
 * read-only from already fixed Dictionary/Grammar/Theory authority.
 */
{
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  const refs = anchors(memory, 12);

  const selectedUse = refs[0]!;
  const alternateUse = refs[1]!;
  const sourceUseRole = refs[2]!;
  const formalResult = refs[3]!;
  const wrongResult = refs[4]!;
  const grammar = refs[5]!;
  const theory = refs[6]!;
  const afterContext = refs[7]!;

  assert(selectedUse !== alternateUse, "selected and alternate Uses differ");
  assert(formalResult !== wrongResult, "correct and wrong results differ");
  assert(selectedUse !== basis.O, "selected Use is not Q OPEN by glyph identity");

  // -----------------------------------------------------------------------
  // 1. FIX AUTHORITY FIRST.
  // -----------------------------------------------------------------------

  const sourceBytes = Uint8Array.of(0x5b); // literal UTF-8 glyph "["
  const sourceContent = materializeV012SourceContent(memory, basis, sourceBytes);
  const source = defineSourceForm(memory, sourceContent);

  const scope0 = defineDictionaryScope(memory, memory.root, memory.root);
  const dictionaryEffect = defineDictionaryEffect(
    memory,
    scope0,
    memory.root,
    memory.root,
    sourceContent,
    selectedUse,
  );
  const dictionary = dictionaryEffect.afterScope;

  const admittedFormSequence = materializeExactSequence(memory, [selectedUse]);
  const grammarMembership = memory.ensure(grammar, admittedFormSequence);
  const theoryMembership = memory.ensure(theory, admittedFormSequence);

  const roleDictionary = defineStructuralRoleDictionary(memory, [sourceUseRole]);

  // The Rule is generic in the selected source Use, but the result is grounded
  // by Theory. This ensures that source selection is structurally connected to
  // result verification rather than being an unrelated proof.
  const correctTemplate = memory.ensure(sourceUseRole, formalResult);
  const correctRule = defineStructuralRule(memory, roleDictionary, correctTemplate);
  const correctRuleAdmission = admitStructuralRule(memory, theory, correctRule);

  // A well-formed alternative Rule exists, but the fixed Theory does NOT admit it.
  const alternateTemplate = memory.ensure(sourceUseRole, wrongResult);
  const alternateRule = defineStructuralRule(memory, roleDictionary, alternateTemplate);

  const interpreter = defineStructuralInterpreter(memory, dictionary, grammar, theory);

  const authority: V012SourceAuthority = Object.freeze({
    dictionary,
    grammar,
    theory,
    grammarMembership,
    theoryMembership,
  });

  const fixedAuthorityCount = memory.linkCount;

  // -----------------------------------------------------------------------
  // 2. PRODUCER BUILDS CANDIDATE EVIDENCE AFTER AUTHORITY IS FIXED.
  // -----------------------------------------------------------------------

  const sourceEvidence = buildV012SelectedSourceEvidence(
    memory,
    basis,
    source,
    [{
      start: 0,
      end: 1,
      form: selectedUse,
      dictionaryOccurrence: dictionaryEffect.occurrence,
    }],
    authority,
  );

  const act = defineActHeader(memory, interpreter, roleDictionary, afterContext);
  defineActField(memory, act, sourceUseRole, selectedUse);

  const correctClaimedBody = memory.ensure(selectedUse, formalResult);
  const wrongClaimedBody = memory.ensure(selectedUse, wrongResult);

  const correctReplay: StructuralRuleReplayEvidence = Object.freeze({
    act,
    rule: correctRule,
    ruleAdmission: correctRuleAdmission,
    claimedBody: correctClaimedBody,
    expectedInterpreter: Object.freeze({ dictionary, grammar, theory }),
    expectedAfterContext: afterContext,
  });

  assert(memory.linkCount >= fixedAuthorityCount, "candidate evidence may add non-authority Links");

  // -----------------------------------------------------------------------
  // 3. READ-ONLY END-TO-END REPLAY.
  // -----------------------------------------------------------------------

  const probe = new ReadOnlyProbe(memory);
  const before = memory.linkCount;

  const selected = replayV012SelectedSourceEvidence(probe, basis, sourceEvidence);
  same(selected.length, 1, "exact source selects one Use");
  same(selected[0], selectedUse, "fixed authority selects the admitted Use");

  const structural = replayStructuralRule(probe, correctReplay);
  same(memory.linkCount, before, "source + structural replay is read-only");

  const useBinding = structural.bindings.find((binding) => binding.role === sourceUseRole);
  assert(useBinding !== undefined, "Rule replay carries explicit source-Use role binding");
  same(useBinding.value, selected[0], "Rule source-Use binding equals source-selected Use");

  const resultPoles = memory.poles(structural.claimedBody);
  same(resultPoles.start, selectedUse, "verified body starts from source-selected Use");
  same(resultPoles.end, formalResult, "verified FORMAL result is Theory-grounded");

  // -----------------------------------------------------------------------
  // 4. SAME SOURCE + SAME AUTHORITY: WRONG CANDIDATES MUST FAIL.
  // -----------------------------------------------------------------------

  // Different well-formed Use for the same source remains rejected before Rule
  // replay. Spelling "[" grants no semantic authority.
  const wrongUseEvidence = buildV012SelectedSourceEvidence(
    memory,
    basis,
    source,
    [{
      start: 0,
      end: 1,
      form: alternateUse,
      dictionaryOccurrence: dictionaryEffect.occurrence,
    }],
    authority,
  );
  const beforeWrongUse = memory.linkCount;
  sourceError(
    "invalid-dictionary-evidence",
    () => replayV012SelectedSourceEvidence(new ReadOnlyProbe(memory), basis, wrongUseEvidence),
  );
  same(memory.linkCount, beforeWrongUse, "wrong Use rejection is read-only");

  // A structurally valid Rule with the same role dictionary and same Theory
  // pointer is rejected because the fixed Theory did not admit THIS rule.
  const alternateRuleReplay: StructuralRuleReplayEvidence = Object.freeze({
    ...correctReplay,
    rule: alternateRule,
    ruleAdmission: correctRuleAdmission,
    claimedBody: wrongClaimedBody,
  });
  const beforeWrongRule = memory.linkCount;
  structuralError(
    "rule-not-admitted",
    () => replayStructuralRule(new ReadOnlyProbe(memory), alternateRuleReplay),
  );
  same(memory.linkCount, beforeWrongRule, "unadmitted Rule rejection is read-only");

  // Even the admitted Rule cannot be used to claim a different result.
  const wrongResultReplay: StructuralRuleReplayEvidence = Object.freeze({
    ...correctReplay,
    claimedBody: wrongClaimedBody,
  });
  const beforeWrongResult = memory.linkCount;
  structuralError(
    "template-mismatch",
    () => replayStructuralRule(new ReadOnlyProbe(memory), wrongResultReplay),
  );
  same(memory.linkCount, beforeWrongResult, "wrong result rejection is read-only");

  // Changing the expected Theory is not a harmless host annotation: the same
  // Act/Rule evidence fails interpreter verification.
  const wrongTheoryReplay: StructuralRuleReplayEvidence = Object.freeze({
    ...correctReplay,
    expectedInterpreter: Object.freeze({
      dictionary,
      grammar,
      theory: refs[8]!,
    }),
  });
  structuralError(
    "interpreter-mismatch",
    () => replayStructuralRule(new ReadOnlyProbe(memory), wrongTheoryReplay),
  );
}

console.log("MTS v0.12 FORMAL exact source -> fixed authority -> result witness: GREEN.");
