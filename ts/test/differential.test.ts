import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { StreamError, deserializeStream, symbolicStackAlgebra } from "../src/anum.js";
import { Memory, ensureRootBasis, type LinkHandle } from "../src/memory.js";
import {
  PersistenceTopologyError,
  STORAGE_TOPOLOGY_SCHEMA,
  exportTopology,
  restoreTopology,
  type StorageTopologyImage,
} from "../src/persistence-topology.js";
import {
  PersistentStore,
  PersistentStoreError,
  type PersistentTopologyBackend,
  type StoredDataset,
} from "../src/persistent-store.js";
import {
  SourceError,
  buildSelectedSourceEvidence,
  defineSourceForm,
  materializeSourceContent,
  readSourceContent,
  readSourceForm,
  replaySelectedSourceEvidence,
  type SelectedSegmentSpec,
  type SourceFrontEndEvidence,
} from "../src/source.js";
import {
  StateError,
  defineContext,
  defineLocalRepresentativeBinding,
  localRepresentativeResolution,
  readContext,
} from "../src/state.js";
import {
  DictionaryError,
  defineDictionaryEffect,
  defineDictionaryScope,
  lookupScopedDictionary,
  readDictionaryScope,
  verifyVisibleDictionaryOccurrence,
} from "../src/dictionary.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
interface DifferentialCase {
  readonly id: string;
  readonly category: "topology" | "anum" | "persistence" | "source" | "state" | "dictionary" | "selection";
  readonly input: Record<string, Json>;
}
interface Corpus {
  readonly schema: string;
  readonly contract: string;
  readonly pythonOracleSha: string;
  readonly cases: readonly DifferentialCase[];
}
interface Result {
  readonly id: string;
  readonly accepted: boolean;
  readonly observable?: Json;
  readonly error?: string;
}

function canonical(value: Json): Json {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  }
  return value;
}

function sameJson(left: Json, right: Json): boolean {
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}

function topologyObservable(memory: Memory): Json {
  const topology = exportTopology(memory);
  return { root: topology.root, links: topology.links.map(([start, end]) => [start, end]) };
}

function storageImage(input: Record<string, Json>): StorageTopologyImage {
  const root = input.root;
  const links = input.links;
  assert(typeof root === "number" && Array.isArray(links), "invalid topology fixture");
  return {
    schema: STORAGE_TOPOLOGY_SCHEMA,
    root,
    links: links.map((pair) => {
      assert(Array.isArray(pair) && pair.length === 2, "invalid topology pair fixture");
      const start = pair[0]; const end = pair[1];
      assert(typeof start === "number" && typeof end === "number", "invalid topology coordinates fixture");
      return [start, end] as const;
    }),
  };
}

function runTopology(test: DifferentialCase): Result {
  const operation = test.input.operation;
  assert(typeof operation === "string", "topology fixture needs operation");
  try {
    if (operation === "basis-loop") {
      const memory = new Memory(); const { L } = ensureRootBasis(memory); memory.ensure(L, L);
      return { id: test.id, accepted: true, observable: topologyObservable(memory) };
    }
    if (operation === "same-pair") {
      const memory = new Memory(); const { O, C, L } = ensureRootBasis(memory); const before = memory.linkCount; const reused = memory.ensure(O, C);
      return { id: test.id, accepted: true, observable: { ...(topologyObservable(memory) as Record<string, Json>), countBefore: before, countAfter: memory.linkCount, reused: reused === L } };
    }
    if (operation === "restore") {
      return { id: test.id, accepted: true, observable: topologyObservable(restoreTopology(storageImage(test.input))) };
    }
    throw new Error(`unknown topology fixture operation: ${operation}`);
  } catch (error) {
    if (error instanceof PersistenceTopologyError) return { id: test.id, accepted: false, error: "invalid-topology" };
    throw error;
  }
}

function runAnum(test: DifferentialCase): Result {
  const source = test.input.source; assert(typeof source === "string", "ANUM fixture needs source");
  try {
    const result = deserializeStream(source, symbolicStackAlgebra);
    return { id: test.id, accepted: true, observable: { denotation: result.denotation, resolvedValues: [...result.resolvedValues], operations: [...result.operations] } };
  } catch (error) {
    if (error instanceof StreamError) return { id: test.id, accepted: false, error: error.code };
    throw error;
  }
}

function cloneDataset(dataset: StoredDataset): StoredDataset {
  return JSON.parse(JSON.stringify(dataset)) as StoredDataset;
}
class MemoryBackend implements PersistentTopologyBackend {
  constructor(public dataset?: StoredDataset) {}
  load(): StoredDataset | undefined { return this.dataset === undefined ? undefined : cloneDataset(this.dataset); }
  commit(dataset: StoredDataset): void { this.dataset = cloneDataset(dataset); }
}
function persistentBasis(store: PersistentStore) {
  const root = store.root; const opening = store.materializeStartSelfClosed(root); const closing = store.materializeEndSelfClosed(root);
  const linked = store.materialize(opening, closing); store.materialize(closing, opening); return { root, opening, closing, linked };
}
function persistentTopology(store: PersistentStore): Json {
  const topology = store.snapshot().topology;
  return { root: topology.root, links: topology.links.map(([start, end]) => [start, end]) };
}
function runPersistence(test: DifferentialCase): Result {
  const operation = test.input.operation; assert(typeof operation === "string", "persistence fixture needs operation");
  try {
    if (operation === "open-topology") {
      const store = PersistentStore.open(new MemoryBackend({ schema: "mts-persistent-dataset/v0.1", lineage: "differential-lineage", topology: storageImage(test.input) }));
      return { id: test.id, accepted: true, observable: persistentTopology(store) };
    }
    const backend = new MemoryBackend(); const store = PersistentStore.create(backend, "differential-lineage");
    if (operation === "root") return { id: test.id, accepted: true, observable: persistentTopology(store) };
    if (operation === "basis-loop-reopen") {
      const { linked } = persistentBasis(store); store.materialize(linked, linked);
      return { id: test.id, accepted: true, observable: persistentTopology(PersistentStore.open(backend)) };
    }
    if (operation === "same-pair") {
      const { opening, closing, linked } = persistentBasis(store); const before = store.count; const reused = store.materialize(opening, closing);
      return { id: test.id, accepted: true, observable: { ...(persistentTopology(store) as Record<string, Json>), countBefore: before, countAfter: store.count, reused: reused.local === linked.local } };
    }
    throw new Error(`unknown persistence fixture operation: ${operation}`);
  } catch (error) {
    if (error instanceof PersistentStoreError) return { id: test.id, accepted: false, error: "invalid-topology" };
    throw error;
  }
}

function byteVocabulary(memory: Memory): readonly LinkHandle[] {
  const refs: LinkHandle[] = []; let current = memory.root;
  for (let value = 0; value < 256; value += 1) { current = memory.ensureStartSelfClosed(current); refs.push(current); }
  return Object.freeze(refs);
}
function sourceBytes(input: Record<string, Json>): Uint8Array {
  const raw = input.bytes; assert(Array.isArray(raw), "source fixture needs byte array");
  return new Uint8Array(raw.map((value) => { assert(typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 255, "invalid source byte fixture"); return value; }));
}
function runSource(test: DifferentialCase): Result {
  const operation = test.input.operation; assert(typeof operation === "string", "source fixture needs operation"); const memory = new Memory(); const bytes = sourceBytes(test.input);
  if (operation === "invalid-vocabulary") {
    try { materializeSourceContent(memory, [], bytes); }
    catch (error) { if (error instanceof SourceError) return { id: test.id, accepted: false, error: "invalid-source" }; throw error; }
    throw new Error("invalid source vocabulary was unexpectedly accepted");
  }
  if (operation !== "round-trip") throw new Error(`unknown source fixture operation: ${operation}`);
  const refs = byteVocabulary(memory); const content = materializeSourceContent(memory, refs, bytes); const repeatedContent = materializeSourceContent(memory, refs, bytes);
  const source = defineSourceForm(memory, content); const repeatedSource = defineSourceForm(memory, content); const before = memory.linkCount;
  const decoded = readSourceContent(memory, refs, content); const selectedContent = readSourceForm(memory, source); const sourcePoles = memory.poles(source); const after = memory.linkCount;
  assert(selectedContent === content, "source fixture selected unexpected content");
  return { id: test.id, accepted: true, observable: { bytes: [...decoded.bytes], contentIsRoot: content === memory.root, contentReused: repeatedContent === content, sourceReused: repeatedSource === source, sourceStartSelfClosed: sourcePoles.start === source && sourcePoles.end === content, readOnlyCountStable: before === after } };
}

function runState(test: DifferentialCase): Result {
  const operation = test.input.operation; assert(typeof operation === "string", "state fixture needs operation"); const memory = new Memory(); const { O, C, L, U } = ensureRootBasis(memory); const context = defineContext(memory, O, C);
  if (operation === "context") {
    const repeated = defineContext(memory, O, C); const before = memory.linkCount; const state = readContext(memory, context); const after = memory.linkCount;
    return { id: test.id, accepted: true, observable: { parentMatches: state.parent === O, currentMatches: state.current === C, contextReused: repeated === context, readOnlyCountStable: before === after } };
  }
  if (operation === "representative-default") {
    const before = memory.linkCount; const resolution = localRepresentativeResolution(memory, context, L); const after = memory.linkCount;
    return { id: test.id, accepted: true, observable: { representativeMatches: resolution.representative === L, bindingCount: resolution.bindings.length, readOnlyCountStable: before === after } };
  }
  if (operation === "representative-binding") {
    const binding = defineLocalRepresentativeBinding(memory, context, L, U); const repeated = defineLocalRepresentativeBinding(memory, context, L, U); const before = memory.linkCount;
    const resolution = localRepresentativeResolution(memory, context, L); const after = memory.linkCount;
    return { id: test.id, accepted: true, observable: { representativeMatches: resolution.representative === U, bindingCount: resolution.bindings.length, bindingReused: repeated === binding, readOnlyCountStable: before === after } };
  }
  if (operation === "representative-conflict") {
    defineLocalRepresentativeBinding(memory, context, L, O); defineLocalRepresentativeBinding(memory, context, L, C);
    try { localRepresentativeResolution(memory, context, L); }
    catch (error) { if (error instanceof StateError && error.code === "representative-conflict") return { id: test.id, accepted: false, error: "representative-conflict" }; throw error; }
    throw new Error("representative conflict was unexpectedly accepted");
  }
  throw new Error(`unknown state fixture operation: ${operation}`);
}

function runDictionary(test: DifferentialCase): Result {
  const operation = test.input.operation; assert(typeof operation === "string", "dictionary fixture needs operation");
  const memory = new Memory(); const { O, L, U } = ensureRootBasis(memory); const content = memory.ensure(L, L); const formOne = memory.ensureStartSelfClosed(U); const formTwo = memory.ensureStartSelfClosed(formOne);
  if (operation === "root-sentinel") {
    try { readDictionaryScope(memory, memory.root); }
    catch (error) { if (error instanceof DictionaryError) return { id: test.id, accepted: false, error: "invalid-dictionary" }; throw error; }
    throw new Error("root dictionary sentinel was unexpectedly accepted");
  }
  const scope = defineDictionaryScope(memory, memory.root, memory.root); const first = defineDictionaryEffect(memory, scope, memory.root, memory.root, content, formOne);
  const repeated = defineDictionaryEffect(memory, scope, memory.root, memory.root, content, formOne);
  let selected = first.afterScope; let expectedForm = formOne; let expectedOccurrence = first.occurrence;
  if (operation === "parent-visible") selected = defineDictionaryScope(memory, first.afterScope, memory.root);
  else if (operation === "shadow") {
    const child = defineDictionaryScope(memory, first.afterScope, memory.root); const second = defineDictionaryEffect(memory, child, first.afterScope, memory.root, content, formTwo);
    selected = second.afterScope; expectedForm = formTwo; expectedOccurrence = second.occurrence;
  } else if (operation === "conflict") {
    const second = defineDictionaryEffect(memory, first.afterScope, memory.root, first.historyAfter, content, formTwo);
    try { lookupScopedDictionary(memory, second.afterScope, content); }
    catch (error) { if (error instanceof DictionaryError && error.code === "local-form-conflict") return { id: test.id, accepted: false, error: "local-form-conflict" }; throw error; }
    throw new Error("dictionary local conflict was unexpectedly accepted");
  } else if (operation !== "single" && operation !== "forged-occurrence") throw new Error(`unknown dictionary operation: ${operation}`);
  const before = memory.linkCount; const resolution = lookupScopedDictionary(memory, selected, content); assert(resolution !== undefined, "dictionary fixture did not resolve");
  if (operation === "forged-occurrence") {
    try { verifyVisibleDictionaryOccurrence(memory, selected, O, content, expectedForm); }
    catch (error) { if (error instanceof DictionaryError) return { id: test.id, accepted: false, error: "invalid-dictionary-evidence" }; throw error; }
    throw new Error("forged dictionary occurrence was unexpectedly accepted");
  }
  verifyVisibleDictionaryOccurrence(memory, selected, expectedOccurrence, content, expectedForm); const after = memory.linkCount;
  const effectReused = repeated.entry === first.entry && repeated.occurrence === first.occurrence && repeated.historyAfter === first.historyAfter && repeated.afterScope === first.afterScope;
  return { id: test.id, accepted: true, observable: { formMatches: resolution.form === expectedForm, occurrenceVisible: resolution.occurrences.includes(expectedOccurrence), occurrenceCount: resolution.occurrences.length, effectReused, readOnlyCountStable: before === after } };
}

type SegmentTuple = readonly [number, number, number];
function segmentTuples(input: Record<string, Json>, byteLength: number): readonly SegmentTuple[] {
  const raw = input.segments ?? [[0, byteLength, 0]];
  assert(Array.isArray(raw), "selection fixture needs segments");
  return raw.map((item) => {
    assert(Array.isArray(item) && item.length === 3, "invalid selection segment fixture");
    const [start, end, form] = item; assert(typeof start === "number" && typeof end === "number" && typeof form === "number", "invalid selection segment values");
    return [start, end, form] as const;
  });
}
function selectedFixture(memory: Memory, bytes: Uint8Array, segments: readonly SegmentTuple[]) {
  const refs = byteVocabulary(memory); const content = materializeSourceContent(memory, refs, bytes); const source = defineSourceForm(memory, content);
  let cursor = refs[255]!; const forms: LinkHandle[] = [];
  for (let index = 0; index < segments.length; index += 1) { cursor = memory.ensureStartSelfClosed(cursor); forms.push(cursor); }
  const grammar = memory.ensureStartSelfClosed(cursor); const theory = memory.ensureStartSelfClosed(grammar);
  let dictionary = defineDictionaryScope(memory, memory.root, memory.root); let history = memory.root; const specs: SelectedSegmentSpec[] = [];
  for (const [start, end, formIndex] of segments) {
    const form = forms[formIndex]; assert(form !== undefined, "selection form index out of range");
    const sliceContent = materializeSourceContent(memory, refs, bytes.slice(start, end)); const effect = defineDictionaryEffect(memory, dictionary, memory.root, history, sliceContent, form);
    dictionary = effect.afterScope; history = effect.historyAfter; specs.push(Object.freeze({ start, end, form, dictionaryOccurrence: effect.occurrence }));
  }
  return { refs, source, forms: Object.freeze(forms), dictionary, grammar, theory, specs: Object.freeze(specs) };
}
function runSelection(test: DifferentialCase): Result {
  const operation = test.input.operation; assert(typeof operation === "string", "selection fixture needs operation"); const bytes = sourceBytes(test.input); const memory = new Memory();
  if (operation === "dictionary-choice") {
    const refs = byteVocabulary(memory); const content = materializeSourceContent(memory, refs, bytes); const source = defineSourceForm(memory, content); let cursor = refs[255]!;
    const formOne = memory.ensureStartSelfClosed(cursor); const formTwo = memory.ensureStartSelfClosed(formOne); const grammar = memory.ensureStartSelfClosed(formTwo); const theory = memory.ensureStartSelfClosed(grammar);
    const d1 = defineDictionaryScope(memory, memory.root, memory.root); const e1 = defineDictionaryEffect(memory, d1, memory.root, memory.root, content, formOne);
    const d2 = defineDictionaryScope(memory, memory.root, memory.root); const e2 = defineDictionaryEffect(memory, d2, memory.root, memory.root, content, formTwo);
    const ev1 = buildSelectedSourceEvidence(memory, refs, source, [{ start: 0, end: bytes.length, form: formOne, dictionaryOccurrence: e1.occurrence }], { dictionary: e1.afterScope, grammar, theory });
    const ev2 = buildSelectedSourceEvidence(memory, refs, source, [{ start: 0, end: bytes.length, form: formTwo, dictionaryOccurrence: e2.occurrence }], { dictionary: e2.afterScope, grammar, theory });
    const before = memory.linkCount; const r1 = replaySelectedSourceEvidence(memory, refs, ev1); const r2 = replaySelectedSourceEvidence(memory, refs, ev2); const after = memory.linkCount;
    return { id: test.id, accepted: true, observable: { firstMatches: r1.length === 1 && r1[0] === formOne, secondMatches: r2.length === 1 && r2[0] === formTwo, formsDistinct: formOne !== formTwo, sourceShared: ev1.source === ev2.source, contentShared: ev1.content === ev2.content, readOnlyCountStable: before === after } };
  }
  const segments = segmentTuples(test.input, bytes.length); const fixture = selectedFixture(memory, bytes, segments);
  if (operation === "invalid-partition") {
    try { buildSelectedSourceEvidence(memory, fixture.refs, fixture.source, fixture.specs, { dictionary: fixture.dictionary, grammar: fixture.grammar, theory: fixture.theory }); }
    catch (error) { if (error instanceof SourceError) return { id: test.id, accepted: false, error: "invalid-selected-partition" }; throw error; }
    throw new Error("invalid selected partition was unexpectedly accepted");
  }
  let evidence = buildSelectedSourceEvidence(memory, fixture.refs, fixture.source, fixture.specs, { dictionary: fixture.dictionary, grammar: fixture.grammar, theory: fixture.theory });
  if (operation === "forged-resolution") {
    const first = evidence.segments[0]; assert(first !== undefined, "forged fixture requires first segment");
    evidence = Object.freeze({ ...evidence, segments: Object.freeze([Object.freeze({ ...first, resolution: memory.root }), ...evidence.segments.slice(1)]) }) as SourceFrontEndEvidence;
  } else if (operation !== "selected") throw new Error(`unknown selection operation: ${operation}`);
  const before = memory.linkCount;
  try {
    const resolved = replaySelectedSourceEvidence(memory, fixture.refs, evidence); const after = memory.linkCount;
    const expected = segments.map(([, , index]) => fixture.forms[index]);
    return { id: test.id, accepted: true, observable: { formCount: resolved.length, formsMatchExpected: resolved.every((form, index) => form === expected[index]), readOnlyCountStable: before === after } };
  } catch (error) {
    if (operation === "forged-resolution" && error instanceof SourceError) return { id: test.id, accepted: false, error: "invalid-source-evidence" };
    throw error;
  }
}

const repoRoot = resolve(process.cwd(), "..");
const fixturePath = resolve(repoRoot, "differential/fixtures-v0.7.json");
const corpus = JSON.parse(readFileSync(fixturePath, "utf8")) as Corpus;
assert(corpus.schema === "mts-differential-fixtures/v0.1", "unexpected differential fixture schema");
assert(corpus.contract === "mts-contract/v0.7", "differential fixtures must select accepted v0.7 contract");
const python = spawnSync("python3", ["differential/python_oracle.py", "differential/fixtures-v0.7.json"], { cwd: repoRoot, encoding: "utf8" });
assert(python.status === 0, `frozen Python oracle adapter failed: ${python.stderr || python.stdout}`);
const expected = JSON.parse(python.stdout) as Result[];
const runners: Record<DifferentialCase["category"], (test: DifferentialCase) => Result> = {
  topology: runTopology,
  anum: runAnum,
  persistence: runPersistence,
  source: runSource,
  state: runState,
  dictionary: runDictionary,
  selection: runSelection,
};
const actual = corpus.cases.map((test) => runners[test.category](test));
assert(expected.length === actual.length, "differential result cardinality mismatch");
expected.forEach((pythonResult, index) => {
  const tsResult = actual[index]; assert(tsResult !== undefined, `missing TS result at ${index}`);
  assert(sameJson(pythonResult as unknown as Json, tsResult as unknown as Json), `differential mismatch for ${pythonResult.id}: Python=${JSON.stringify(pythonResult)} TS=${JSON.stringify(tsResult)}`);
});
