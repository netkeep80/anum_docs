import {
  encodeBytesToQuaternary,
  textToUtf8Bytes,
} from "../src/byte-carrier.js";
import {
  defineDictionaryEffect,
  defineDictionaryScope,
} from "../src/dictionary.js";
import { readExactSequence } from "../src/exact-sequence.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type LinkPoles,
  type ReadMemory,
} from "../src/memory.js";
import {
  buildSelectedSourceEvidence,
  defineSourceForm,
  materializeSourceContent,
  readSourceContent,
  replaySelectedSourceEvidence,
  SourceError,
  type SelectedSegmentSpec,
} from "../src/source.js";
import { defineContext, readContext } from "../src/state.js";
import {
  matchStructuralTemplate,
  StructuralRuleError,
  type StructuralRoleBinding,
} from "../src/structural-rule.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.11 physical-dot bootstrap: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

function deepSame(actual: unknown, expected: unknown, message: string): void {
  assert(
    JSON.stringify(actual) === JSON.stringify(expected),
    `${message}: ${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`,
  );
}

function expectTemplateMismatch(message: string, effect: () => void): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof StructuralRuleError, `${message}: expected StructuralRuleError`);
    same(error.code, "template-mismatch", `${message}: error code`);
    return;
  }
  throw new Error(`v0.11 physical-dot bootstrap: ${message}: expected template-mismatch`);
}

function expectSourceError(message: string, effect: () => void, code: SourceError["code"]): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof SourceError, `${message}: expected SourceError`);
    same(error.code, code, `${message}: error code`);
    return;
  }
  throw new Error(`v0.11 physical-dot bootstrap: ${message}: expected SourceError(${code})`);
}

class ReadProbe implements ReadMemory {
  constructor(private readonly source: ReadMemory) {}

  get root(): LinkHandle { return this.source.root; }
  get linkCount(): number { return this.source.linkCount; }
  poles(link: LinkHandle): LinkPoles { return this.source.poles(link); }
  find(): LinkHandle | undefined { throw new Error("C1 replay must not use find"); }
  incoming(): readonly LinkHandle[] { throw new Error("C1 replay must not scan incoming"); }
  outgoing(): readonly LinkHandle[] { throw new Error("C1 replay must not scan outgoing"); }
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

interface DictionaryFixture {
  readonly dictionary: LinkHandle;
  readonly occurrence: LinkHandle;
}

function oneEntryDictionary(
  memory: Memory,
  sourceContent: LinkHandle,
  form: LinkHandle,
): DictionaryFixture {
  const before = defineDictionaryScope(memory, memory.root, memory.root);
  const effect = defineDictionaryEffect(
    memory,
    before,
    memory.root,
    memory.root,
    sourceContent,
    form,
  );
  return Object.freeze({ dictionary: effect.afterScope, occurrence: effect.occurrence });
}

function spec(
  start: number,
  end: number,
  form: LinkHandle,
  dictionaryOccurrence: LinkHandle,
): SelectedSegmentSpec {
  return Object.freeze({ start, end, form, dictionaryOccurrence });
}

function contextualBinding(
  memory: ReadMemory,
  context: LinkHandle,
  dotRole: LinkHandle,
): readonly StructuralRoleBinding[] {
  return Object.freeze([
    Object.freeze({ role: dotRole, value: readContext(memory, context).current }),
  ]);
}

const memory = new Memory();
const basis = ensureRootBasis(memory);
const pool = anchors(memory, 8);
const dotRole = pool[0];
const otherRole = pool[1];
const A = pool[2];
const B = pool[3];
const grammar = pool[4];
const theory = pool[5];
assert(dotRole && otherRole && A && B && grammar && theory, "fixture anchors must exist");

// C1 keeps four layers distinct: physical carrier, exact occurrence, contextual
// role, and semantic sign Link. The glyph shape is not semantic authority.
const dotMeaning = memory.ensure(basis.L, basis.R);
assert(dotRole !== dotMeaning, "contextual dot role must differ from DotMeaning=L⟼R");
assert(![basis.O, basis.C, basis.L, basis.U].includes(dotRole), "dot role must not become a Q abit");

const dotBytes = textToUtf8Bytes(".");
deepSame(Array.from(dotBytes), [0x2e], "physical dot is exact UTF-8 byte 0x2E");
same(encodeBytesToQuaternary(dotBytes), "[00101110]", "physical dot reuses canonical byte carrier");
const dotContent = materializeSourceContent(memory, dotBytes);
assert(dotContent !== dotMeaning, "physical source carrier must differ from semantic DotMeaning");

const admitted = oneEntryDictionary(memory, dotContent, dotRole);
const dotSource = defineSourceForm(memory, dotContent);
const dotEvidence = buildSelectedSourceEvidence(
  memory,
  dotSource,
  [spec(0, 1, dotRole, admitted.occurrence)],
  { dictionary: admitted.dictionary, grammar, theory },
);

const beforeSingleReplay = memory.linkCount;
const singleForms = replaySelectedSourceEvidence(new ReadProbe(memory), dotEvidence);
same(memory.linkCount, beforeSingleReplay, "single-dot source replay must be read-only");
deepSame(singleForms, [dotRole], "explicit dictionary admission resolves physical dot to contextual role");
same(dotEvidence.segments[0]?.start, 0, "single dot occurrence start");
same(dotEvidence.segments[0]?.end, 1, "single dot occurrence end");

// The same physical byte can be explicitly admitted to a different form in a
// different dictionary, proving that 0x2E/glyph geometry alone does not choose
// Role_ctx. C1 authority is the source admission relation.
const alternative = oneEntryDictionary(memory, dotContent, otherRole);
const alternativeEvidence = buildSelectedSourceEvidence(
  memory,
  dotSource,
  [spec(0, 1, otherRole, alternative.occurrence)],
  { dictionary: alternative.dictionary, grammar, theory },
);
deepSame(
  replaySelectedSourceEvidence(new ReadProbe(memory), alternativeEvidence),
  [otherRole],
  "same carrier may have another explicitly admitted form",
);

// A dictionary occurrence that admits Role_ctx cannot be forged into the
// semantic DotMeaning merely because both are associated with the glyph '.'.
const forgedMeaningEvidence = buildSelectedSourceEvidence(
  memory,
  dotSource,
  [spec(0, 1, dotMeaning, admitted.occurrence)],
  { dictionary: admitted.dictionary, grammar, theory },
);
expectSourceError(
  "dictionary admission must not collapse occurrence role into DotMeaning",
  () => replaySelectedSourceEvidence(new ReadProbe(memory), forgedMeaningEvidence),
  "invalid-dictionary-evidence",
);

// Source admission alone does not create an ambient current. Without an
// explicit structural binding, the admitted dotRole stays grounded and cannot
// silently resolve to ROOT.
expectTemplateMismatch(
  "admitted dot role has no ambient top-level value",
  () => matchStructuralTemplate(new ReadProbe(memory), dotRole, basis.R, []),
);

// Candidate TopBind(R,S) is represented by the already-accepted explicit K
// whose current whole is R. K itself remains START(R)=O and is not ROOT.
const topContext = defineContext(memory, memory.root, basis.R);
same(topContext, basis.O, "canonical top execution frame remains K0=START(R)=O");
assert(topContext !== basis.R, "contextual whole R must differ from execution frame K0");
const topBindings = contextualBinding(new ReadProbe(memory), topContext, dotRole);
const beforeTopReplay = memory.linkCount;
matchStructuralTemplate(new ReadProbe(memory), dotRole, basis.R, topBindings);
same(memory.linkCount, beforeTopReplay, "top-level dot binding replay must be read-only");

// Existing explicit A:E binding remains nearest and authoritative; no process-
// global current is consulted. Nested B shadows A structurally through K.parent.
const outerContext = defineContext(memory, memory.root, A);
const innerContext = defineContext(memory, outerContext, B);
same(readContext(memory, innerContext).parent, outerContext, "inner binder has explicit lexical parent");
matchStructuralTemplate(
  new ReadProbe(memory),
  dotRole,
  B,
  contextualBinding(new ReadProbe(memory), innerContext, dotRole),
);
expectTemplateMismatch(
  "inner dot must not resolve through outer/ambient whole",
  () => matchStructuralTemplate(
    new ReadProbe(memory),
    dotRole,
    A,
    contextualBinding(new ReadProbe(memory), innerContext, dotRole),
  ),
);

// Two physical dots remain two exact source occurrences even though both admit
// the same role and the later semantic ROOT fixed-point folds Pair(R,R) to R.
const dotDotBytes = textToUtf8Bytes("..");
deepSame(Array.from(dotDotBytes), [0x2e, 0x2e], "no hidden ROOT glyph/prefix is inserted into '..'");
const dotDotContent = materializeSourceContent(memory, dotDotBytes);
const dotDotSource = defineSourceForm(memory, dotDotContent);
const dotDotEvidence = buildSelectedSourceEvidence(
  memory,
  dotDotSource,
  [
    spec(0, 1, dotRole, admitted.occurrence),
    spec(1, 2, dotRole, admitted.occurrence),
  ],
  { dictionary: admitted.dictionary, grammar, theory },
);
const beforeDotDotReplay = memory.linkCount;
const dotDotForms = replaySelectedSourceEvidence(new ReadProbe(memory), dotDotEvidence);
same(memory.linkCount, beforeDotDotReplay, "two-dot source replay must be read-only");
deepSame(dotDotForms, [dotRole, dotRole], "two dot forms preserve both occurrences");
const exactForms = readExactSequence(new ReadProbe(memory), dotDotEvidence.formSequence).values;
deepSame(exactForms, [dotRole, dotRole], "formSequence preserves duplicate role positions exactly");
assert(dotDotEvidence.segments[0]?.span !== dotDotEvidence.segments[1]?.span, "two equal bytes must have distinct source spans");

const fullDotTemplate = memory.ensure(dotRole, dotRole);
const beforeRootFold = memory.linkCount;
matchStructuralTemplate(new ReadProbe(memory), fullDotTemplate, basis.R, topBindings);
same(memory.linkCount, beforeRootFold, "ROOT dot-dot fold verification must be read-only");

// ROOT is special: Pair(R,R)=R. The same admitted role under non-root A yields
// Loop(A)=Pair(A,A), not A, so C1 introduces no general self-collapse rule.
const loopA = memory.ensure(A, A);
assert(loopA !== A, "non-root Pair(A,A) must not equal A");
matchStructuralTemplate(
  new ReadProbe(memory),
  fullDotTemplate,
  loopA,
  contextualBinding(new ReadProbe(memory), outerContext, dotRole),
);
expectTemplateMismatch(
  "non-root dot-dot must not collapse to contextual whole",
  () => matchStructuralTemplate(
    new ReadProbe(memory),
    fullDotTemplate,
    A,
    contextualBinding(new ReadProbe(memory), outerContext, dotRole),
  ),
);

// Final read-back proves the exact physical source is still only '..'. The
// semantic ROOT appears through structural binding/fixed-point identity, never
// as a hidden source byte or host parser insertion.
const beforeReadBack = memory.linkCount;
const readBack = readSourceContent(new ReadProbe(memory), basis, dotDotContent);
deepSame(Array.from(readBack.bytes), [0x2e, 0x2e], "physical source remains exactly two dot bytes");
same(memory.linkCount, beforeReadBack, "physical source read-back must be read-only");
