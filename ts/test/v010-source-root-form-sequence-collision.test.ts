import {
  buildSelectedSourceEvidence,
  defineSourceForm,
  materializeSourceContent,
  replaySelectedSourceEvidence,
  SourceError,
} from "../src/source.js";
import {
  defineDictionaryEffect,
  defineDictionaryScope,
  lookupScopedDictionary,
} from "../src/dictionary.js";
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

function expectSourceError(effect: () => unknown, code: SourceError["code"]): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof SourceError, `expected SourceError, got ${String(error)}`);
    same(error.code, code, "source error code");
    return;
  }
  throw new Error(`expected SourceError(${code})`);
}

// #744 exact witness: ROOT is a valid dictionary form, but the legacy
// formSequence carrier is a restricted rooted left-fold. Therefore one selected
// ROOT form collapses to the same semantic Link as the empty form sequence.
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

  same(evidence.segments.length, 1, "builder preserves one selected segment in host evidence");
  same(evidence.segments[0]?.form, basis.R, "builder preserves ROOT form on segment");
  same(evidence.formSequence, basis.R, "legacy rooted fold collapses [R] to empty carrier R");
  sameHandles(readRootedSequence(memory, evidence.formSequence).values, [], "reader sees collapsed form sequence as empty");

  const beforeReplay = memory.linkCount;
  expectSourceError(
    () => replaySelectedSourceEvidence(memory, evidence),
    "invalid-source-evidence",
  );
  same(memory.linkCount, beforeReplay, "failed replay remains read-only");
}

// Control: the same one-segment builder/replay path round-trips when the form is
// outside the restricted carrier's ROOT collision.
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

  sameHandles(readRootedSequence(memory, evidence.formSequence).values, [form], "non-ROOT form carrier");
  const beforeReplay = memory.linkCount;
  sameHandles(replaySelectedSourceEvidence(memory, evidence), [form], "non-ROOT builder/replay round-trip");
  same(memory.linkCount, beforeReplay, "successful replay remains read-only");
}
