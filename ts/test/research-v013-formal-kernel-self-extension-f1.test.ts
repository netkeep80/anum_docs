import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import * as publicApi from "../src/public.js";
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

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.13 FORMAL self-extension F1: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}

function bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

interface Fixture {
  readonly memory: Memory;
  readonly basis: RootBasis;
  readonly authority: V012SourceAuthority;
  readonly fixedTheory: unknown;
  readonly program: V013FormalAspectProgramEvidence;
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

/**
 * This fixture deliberately grants the candidate MORE producer authority than
 * the public v0.13 FORMAL facade exposes. It prebuilds:
 *
 *   "x" -> Dictionary Use
 *       -> Grammar/Theory membership
 *       -> admitted structural Rule
 *       -> grounded semantic tag
 *
 * If the unchanged evaluator still rejects the form, the RED boundary is in
 * the fixed FORMAL kernel rather than merely in public API exposure.
 */
function buildFixture(
  memory: Memory,
  tagFactory: (memory: Memory, basis: RootBasis) => LinkHandle,
): Fixture {
  const basis = ensureRootBasis(memory);
  const refs = neutralRefs(memory, basis, 10);
  const use = refs[0]!;
  const grammar = refs[1]!;
  const theory = refs[2]!;
  const sourceUseRole = refs[7]!;
  const tag = tagFactory(memory, basis);

  let history = basis.R;
  let dictionary = defineDictionaryScope(memory, basis.R, history);
  const content = materializeV012SourceContent(memory, basis, bytes("x"));
  const definition = defineDictionaryEffect(
    memory,
    dictionary,
    basis.R,
    history,
    content,
    use,
  );
  history = definition.historyAfter;
  dictionary = definition.afterScope;

  const source = defineSourceForm(memory, content);
  const formSequence = materializeExactSequence(memory, [use]);
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
    [Object.freeze({
      start: 0,
      end: 1,
      form: use,
      dictionaryOccurrence: definition.occurrence,
    })],
    authority,
  );

  const interpreterStructure: StructuralInterpreter = Object.freeze({
    dictionary,
    grammar,
    theory,
  });
  const interpreter = defineStructuralInterpreter(
    memory,
    dictionary,
    grammar,
    theory,
  );
  const context = defineContext(memory, basis.R, basis.R);
  const roleDictionary = defineStructuralRoleDictionary(memory, [sourceUseRole]);

  const groundedMeaning = memory.ensure(use, tag);
  const body = memory.ensure(sourceUseRole, groundedMeaning);
  const rule = defineStructuralRule(memory, roleDictionary, body);
  const admission = admitStructuralRule(memory, theory, rule);
  const fixedTheory = exportPortableStructuralTheory(memory, theory);

  const act = defineActHeader(memory, interpreter, roleDictionary, context);
  const selectedAttachment = defineActField(memory, act, sourceUseRole, use);
  const claim = memory.ensure(use, memory.ensure(use, tag));
  const structural: StructuralRuleReplayEvidence = Object.freeze({
    act,
    rule,
    ruleAdmission: admission,
    claimedBody: claim,
    expectedInterpreter: interpreterStructure,
    expectedAfterContext: context,
  });
  const operator: V012SourceResultEvidence = Object.freeze({
    source: selectedSource,
    structural,
    selectedActAttachments: Object.freeze([selectedAttachment]),
    sourceUseIndex: 0,
    sourceUseRole,
  });

  return Object.freeze({
    memory,
    basis,
    authority,
    fixedTheory,
    program: Object.freeze({
      source: selectedSource,
      operators: Object.freeze([operator]),
    }),
  });
}

function exactFailure(
  fixture: Fixture,
  expected: V013FormalAspectEvaluationError["code"],
  label: string,
): void {
  const before = fixture.memory.linkCount;
  try {
    evaluateV013FormalAspectProgram(
      fixture.memory,
      fixture.basis,
      fixture.program,
      fixture.authority,
      fixture.fixedTheory,
    );
  } catch (error) {
    assert(error instanceof V013FormalAspectEvaluationError, `${label}: exact evaluator error type`);
    same(error.code, expected, `${label}: exact failure`);
    same(fixture.memory.linkCount, before, `${label}: rejection writes zero Links`);
    return;
  }
  throw new Error(`v0.13 FORMAL self-extension F1: ${label}: unexpectedly accepted`);
}

// ---------------------------------------------------------------------------
// F1.1 — real public consumer FORMAL cannot construct authority.
// Existing producer helpers remain intentionally internal.
// ---------------------------------------------------------------------------
for (const producer of [
  "defineDictionaryScope",
  "defineDictionaryEffect",
  "defineStructuralRoleDictionary",
  "defineStructuralRule",
  "admitStructuralRule",
  "defineStructuralInterpreter",
  "defineActHeader",
  "defineActField",
] as const) {
  assert(!(producer in publicApi), `${producer} is not public FORMAL authority`);
}

same(
  publicApi.replayDefinitionEffect,
  publicApi.replayColonEffect,
  "definition replay is the accepted read-only colon replay alias",
);

// ---------------------------------------------------------------------------
// F1.2 — even with prebuilt valid authority, a NEW PHYSICAL NAME for an
// existing structural operator cannot extend the fixed language.
// "x" is correctly Dictionary/Grammar/Theory/Rule-grounded to O, but the
// evaluator still requires the host-fixed canonical spelling "9".
// Repeat in two independent Memories.
// ---------------------------------------------------------------------------
for (const label of ["A", "B"] as const) {
  const fixture = buildFixture(new Memory(), (_memory, basis) => basis.O);
  exactFailure(fixture, "noncanonical-spelling", `${label}: new name alias`);
}

// ---------------------------------------------------------------------------
// F1.3 — even with prebuilt valid authority, a NEW NAMED SEMANTIC FORM outside
// the four root representatives cannot become an operator under the unchanged
// evaluator. The Rule grounds "x" to an ordinary Link, but operatorAspect
// rejects it before physical spelling is considered.
// Repeat in two independent Memories.
// ---------------------------------------------------------------------------
for (const label of ["A", "B"] as const) {
  const fixture = buildFixture(
    new Memory(),
    (memory, basis) => memory.ensure(basis.U, basis.L),
  );
  exactFailure(fixture, "operator-meaning-mismatch", `${label}: new semantic form`);
}

// ---------------------------------------------------------------------------
// F1.4 — static localization of the fixed host boundary.
// This is not the semantic proof by itself; the executable failures above are.
// It prevents the RED result from being misreported as only a public-facade gap.
// ---------------------------------------------------------------------------
{
  const repoRoot = resolve(process.cwd(), "..");
  const evaluator = readFileSync(
    join(repoRoot, "ts/src/v013-formal-aspect-evaluator.ts"),
    "utf8",
  );
  assert(evaluator.includes("function operatorAspect("), "operator grounding remains a host function");
  assert(evaluator.includes("if (decomposition.sign !== tag)"), "operator grounding fixes root representatives");
  assert(evaluator.includes("function canonicalByte("), "physical spelling remains host-fixed");
  assert(evaluator.includes("function parsePlan("), "prefix composition remains host-fixed");
  assert(evaluator.includes("function materializePlan("), "plan materialization remains host-fixed");
}

console.log([
  "MTS v0.13 FORMAL F1:",
  "F_KERNEL_SELF_EXTENSION=RED_CONFIRMED",
  "INDEPENDENT_MEMORIES=2",
  "NEW_NAME_ALIAS=NONCANONICAL_SPELLING",
  "NEW_SEMANTIC_FORM=OPERATOR_MEANING_MISMATCH",
  "FIXTURE_GRANTED_PREBUILT_DICTIONARY_GRAMMAR_THEORY_RULE_AUTHORITY",
  "SUCCESSFUL_SELF_EXTENSION_WITNESSES=0",
  "PRODUCTION_UNCHANGED",
].join(" "));
