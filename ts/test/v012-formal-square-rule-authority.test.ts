// mts-version-evidence: required-from=0.12

import {
  openFormalContext,
  openFormalSquareBracketContext,
  defineTypedContext,
  type TypedContext,
} from "../src/context-integration.js";
import {
  defineDictionaryEffect,
  defineDictionaryScope,
} from "../src/dictionary.js";
import { materializeExactSequence } from "../src/exact-sequence.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
} from "../src/memory.js";
import {
  PortableStructuralTheoryError,
  exportPortableStructuralTheory,
} from "../src/portable-theory.js";
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
import {
  buildV012SelectedSourceEvidence,
  materializeV012SourceContent,
  type V012SourceAuthority,
  type V012SourceResultEvidence,
} from "../src/v012-source.js";
import {
  V012FormalExecutionError,
  openAuthorizedV012FormalSquareBracketContext,
} from "../src/v012-formal-execution.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.12 FORMAL [ Rule authority: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

function expectTheoryError(effect: () => unknown): void {
  try {
    effect();
  } catch (error) {
    assert(
      error instanceof PortableStructuralTheoryError,
      `expected PortableStructuralTheoryError, got ${String(error)}`,
    );
    return;
  }
  throw new Error("v0.12 FORMAL [ Rule authority: expected fixed-Theory rejection");
}

function expectFormalExecutionError(
  code: V012FormalExecutionError["code"],
  effect: () => unknown,
): void {
  try {
    effect();
  } catch (error) {
    assert(
      error instanceof V012FormalExecutionError,
      `expected V012FormalExecutionError, got ${String(error)}`,
    );
    same(error.code, code, "formal execution error code");
    return;
  }
  throw new Error(`v0.12 FORMAL [ Rule authority: expected ${code}`);
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

interface InterpreterFixture {
  readonly handle: LinkHandle;
  readonly structure: StructuralInterpreter;
}

function defineInterpreter(
  memory: Memory,
  dictionary: LinkHandle,
  grammar: LinkHandle,
  theory: LinkHandle,
): InterpreterFixture {
  return Object.freeze({
    handle: defineStructuralInterpreter(memory, dictionary, grammar, theory),
    structure: Object.freeze({ dictionary, grammar, theory }),
  });
}

// The old primitive is transition plumbing, not target-selection authority.
// Supplying I_Q really does create an I_Q child.
{
  const memory = new Memory();
  const refs = anchors(memory, 12);
  const rootI = defineInterpreter(memory, refs[0]!, refs[1]!, refs[2]!);
  const formalI = defineInterpreter(memory, refs[3]!, refs[4]!, refs[5]!);
  const qI = defineInterpreter(memory, refs[6]!, refs[7]!, refs[8]!);
  const parent = defineTypedContext(memory, rootI.handle, memory.root, memory.root);
  const formal = openFormalContext(memory, parent, rootI.structure, formalI.handle);
  const qChild = openFormalSquareBracketContext(
    memory,
    formal,
    formalI.structure,
    qI.handle,
  );
  same(qChild.interpreter, qI.handle, "low-level primitive follows supplied target");
}

// Normative authority-bound FORMAL "[" path.
{
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  const refs = anchors(memory, 28);

  const selectedUse = refs[0]!;
  const sourceUseRole = refs[1]!;
  const grammar = refs[2]!;
  const theory = refs[3]!;

  const rootI = defineInterpreter(memory, refs[4]!, refs[5]!, refs[6]!);
  const stringI = defineInterpreter(memory, refs[7]!, refs[8]!, refs[9]!);
  const qI = defineInterpreter(memory, refs[10]!, refs[11]!, refs[12]!);
  assert(stringI.handle !== qI.handle, "I_STRING and I_Q differ");

  const sourceContent = materializeV012SourceContent(
    memory,
    basis,
    Uint8Array.of(0x5b), // physical UTF-8 source "["
  );
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

  const formalI = defineInterpreter(memory, dictionary, grammar, theory);
  const sourceAuthority: V012SourceAuthority = Object.freeze({
    dictionary,
    grammar,
    theory,
    grammarMembership,
    theoryMembership,
  });

  const parent = defineTypedContext(memory, rootI.handle, memory.root, memory.root);
  const formalBefore: TypedContext = openFormalContext(
    memory,
    parent,
    rootI.structure,
    formalI.handle,
  );

  const roleDictionary = defineStructuralRoleDictionary(memory, [sourceUseRole]);

  // The admitted Rule grounds the exact target interpreter as a constant.
  // Only the source Use is a role placeholder.
  const correctTemplate = memory.ensure(sourceUseRole, stringI.handle);
  const correctRule = defineStructuralRule(memory, roleDictionary, correctTemplate);

  // Snapshot with the same source/Theory membership but WITHOUT the opening Rule.
  const noOpeningRuleAuthority = exportPortableStructuralTheory(memory, theory);

  const correctRuleAdmission = admitStructuralRule(memory, theory, correctRule);
  const fixedTheoryAuthority = exportPortableStructuralTheory(memory, theory);

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
    sourceAuthority,
  );

  const act = defineActHeader(
    memory,
    formalI.handle,
    roleDictionary,
    formalBefore.context,
  );
  const selectedUseAttachment = defineActField(
    memory,
    act,
    sourceUseRole,
    selectedUse,
  );
  const correctClaimedBody = memory.ensure(selectedUse, stringI.handle);
  const correctReplay: StructuralRuleReplayEvidence = Object.freeze({
    act,
    rule: correctRule,
    ruleAdmission: correctRuleAdmission,
    claimedBody: correctClaimedBody,
    expectedInterpreter: formalI.structure,
    expectedAfterContext: formalBefore.context,
  });
  const correctEvidence: V012SourceResultEvidence = Object.freeze({
    source: sourceEvidence,
    structural: correctReplay,
    selectedActAttachments: Object.freeze([selectedUseAttachment]),
    sourceUseIndex: 0,
    sourceUseRole,
  });

  // Without the Rule in the independently fixed Theory artifact, the same
  // candidate evidence cannot open any child context.
  const beforeMissingRule = memory.linkCount;
  expectTheoryError(() => openAuthorizedV012FormalSquareBracketContext(
    memory,
    basis,
    formalBefore,
    formalI.structure,
    stringI.handle,
    correctEvidence,
    sourceAuthority,
    noOpeningRuleAuthority,
  ));
  same(memory.linkCount, beforeMissingRule, "missing fixed Rule causes zero writes");

  // With exact source + fixed Rule authority, the Rule-grounded I_STRING target
  // is consumed by the context transition.
  const authorizedChild = openAuthorizedV012FormalSquareBracketContext(
    memory,
    basis,
    formalBefore,
    formalI.structure,
    stringI.handle,
    correctEvidence,
    sourceAuthority,
    fixedTheoryAuthority,
  );
  same(authorizedChild.interpreter, stringI.handle, "authorized Rule opens exact I_STRING");
  assert(authorizedChild.interpreter !== qI.handle, "authorized Rule does not open I_Q");

  // A substituted Rule targeting I_Q can be materialized and even admitted
  // later, but the earlier fixed Theory artifact does not authorize it.
  const alternateTemplate = memory.ensure(sourceUseRole, qI.handle);
  const alternateRule = defineStructuralRule(memory, roleDictionary, alternateTemplate);
  const alternateAdmission = admitStructuralRule(memory, theory, alternateRule);
  const alternateClaimedBody = memory.ensure(selectedUse, qI.handle);
  const alternateReplay: StructuralRuleReplayEvidence = Object.freeze({
    ...correctReplay,
    rule: alternateRule,
    ruleAdmission: alternateAdmission,
    claimedBody: alternateClaimedBody,
  });
  const alternateEvidence: V012SourceResultEvidence = Object.freeze({
    ...correctEvidence,
    structural: alternateReplay,
  });

  const beforeLateSubstitution = memory.linkCount;
  expectTheoryError(() => openAuthorizedV012FormalSquareBracketContext(
    memory,
    basis,
    formalBefore,
    formalI.structure,
    stringI.handle,
    alternateEvidence,
    sourceAuthority,
    fixedTheoryAuthority,
  ));
  same(memory.linkCount, beforeLateSubstitution, "late substituted Rule causes zero writes");

  // Even under a permissive later Theory snapshot that contains the substituted
  // Rule, the independent exact I_STRING target authority still rejects I_Q
  // before context materialization.
  const permissiveTheoryAuthority = exportPortableStructuralTheory(memory, theory);
  const beforeWrongTarget = memory.linkCount;
  expectFormalExecutionError(
    "square-bracket-target-mismatch",
    () => openAuthorizedV012FormalSquareBracketContext(
      memory,
      basis,
      formalBefore,
      formalI.structure,
      stringI.handle,
      alternateEvidence,
      sourceAuthority,
      permissiveTheoryAuthority,
    ),
  );
  same(memory.linkCount, beforeWrongTarget, "wrong grounded target causes zero writes");
}

console.log("MTS v0.12 FORMAL [ source Rule -> I_STRING opening authority: GREEN.");
