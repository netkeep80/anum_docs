import {
  buildSelectedSourceEvidence,
  defineSourceForm,
  materializeSourceContent,
  replaySelectedSourceEvidence,
} from "../src/source.js";
import {
  defineDictionaryEffect,
  defineDictionaryScope,
  lookupScopedDictionary,
} from "../src/dictionary.js";
import { readExactSequence } from "../src/exact-sequence.js";
import { Memory, ensureRootBasis, type LinkHandle } from "../src/memory.js";
import { readRootedSequence } from "../src/rooted-sequence.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

function sameHandles(
  actual: readonly LinkHandle[],
  expected: readonly LinkHandle[],
  message: string,
): void {
  assert(actual.length === expected.length, `${message}: length ${actual.length} !== ${expected.length}`);
  actual.forEach((value, index) => same(value, expected[index], `${message}[${index}]`));
}

// #744 regression: ROOT is a valid dictionary form. A restricted rooted fold
// loses its position, while the accepted ExactSequence carrier preserves it.
{
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  const sliceContent = materializeSourceContent(memory, new Uint8Array([0x61]));

  const beforeScope = defineDictionaryScope(memory, basis.R, basis.R);
  const effect = defineDictionaryEffect(
    memory,
    beforeScope,
    basis.R,
    basis.R,
    sliceContent,
    basis.R,
  );

  const visible = lookupScopedDictionary(memory, effect.afterScope, sliceContent);
  assert(visible !== undefined, "ROOT form must be visible in dictionary before source replay");
  same(visible.form, basis.R, "dictionary accepts ROOT as the selected form");
  assert(visible.occurrences.includes(effect.occurrence), "dictionary exposes exact ROOT-form occurrence");

  const legacyRooted = memory.ensure(basis.R, basis.R);
  same(legacyRooted, basis.R, "legacy rooted fold collapses one ROOT position to empty R");
  sameHandles(readRootedSequence(memory, legacyRooted).values, [], "legacy rooted reader sees empty sequence");

  const source = defineSourceForm(
    memory,
    materializeSourceContent(memory, new Uint8Array([0x61])),
  );
  const evidence = buildSelectedSourceEvidence(
    memory,
    source,
    [{
      start: 0,
      end: 1,
      form: basis.R,
      dictionaryOccurrence: effect.occurrence,
    }],
    { dictionary: effect.afterScope, grammar: basis.L, theory: basis.U },
  );

  same(evidence.segments.length, 1, "builder preserves one selected segment");
  same(evidence.segments[0]?.form, basis.R, "builder preserves ROOT form on segment");
  assert(evidence.formSequence !== basis.R, "ExactSequence([R]) must differ from empty sequence R");
  sameHandles(
    readExactSequence(memory, evidence.formSequence).values,
    [basis.R],
    "exact formSequence preserves ROOT position",
  );

  const beforeReplay = memory.linkCount;
  sameHandles(
    replaySelectedSourceEvidence(memory, evidence),
    [basis.R],
    "ROOT-form builder/replay round-trip",
  );
  same(memory.linkCount, beforeReplay, "ROOT-form replay remains read-only");
}

// Control: ordinary non-ROOT forms use the same exact carrier and preserve the
// existing source-selection behavior.
{
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  const sliceContent = materializeSourceContent(memory, new Uint8Array([0x62]));
  const form = basis.L;

  const beforeScope = defineDictionaryScope(memory, basis.R, basis.R);
  const effect = defineDictionaryEffect(
    memory,
    beforeScope,
    basis.R,
    basis.R,
    sliceContent,
    form,
  );
  const source = defineSourceForm(
    memory,
    materializeSourceContent(memory, new Uint8Array([0x62])),
  );
  const evidence = buildSelectedSourceEvidence(
    memory,
    source,
    [{
      start: 0,
      end: 1,
      form,
      dictionaryOccurrence: effect.occurrence,
    }],
    { dictionary: effect.afterScope, grammar: basis.C, theory: basis.U },
  );

  sameHandles(readExactSequence(memory, evidence.formSequence).values, [form], "non-ROOT exact form carrier");
  const beforeReplay = memory.linkCount;
  sameHandles(replaySelectedSourceEvidence(memory, evidence), [form], "non-ROOT builder/replay round-trip");
  same(memory.linkCount, beforeReplay, "successful replay remains read-only");
}
