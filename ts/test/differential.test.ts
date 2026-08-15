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
  replaySourceSubselection,
  type SelectedSegmentSpec,
  type SourceFrontEndEvidence,
  type SourceSubselectionEvidence,
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
import {
  InterpreterReplayError,
  replayColonEffect,
  replayEqualityEvaluation,
  replayFlatReading,
  replayFlatSubselectionContinuation,
  replayFlatSubselectionReading,
  replayRelationStep,
  replayRelationSubselectionStep,
  type ColonReplayEvidence,
  type ColonRoles,
  type EqualityReplayEvidence,
  type EqualityRoles,
  type FlatReadingEvidence,
  type FlatReadingRoles,
  type RelationReplayEvidence,
  type RelationRoles,
} from "../src/interpreter.js";
import { defineActField, defineActHeader } from "../src/structural-readers.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
interface DifferentialCase {
  readonly id: string;
  readonly category: "topology" | "anum" | "persistence" | "source" | "state" | "dictionary" | "selection" | "subselection" | "relation" | "flat" | "interpreter-subselection" | "colon" | "equality";
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
  const root = input.root; const links = input.links;
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
  const operation = test.input.operation; assert(typeof operation === "string", "topology fixture needs operation");
  try {
    if (operation === "basis-loop") {
      const memory = new Memory(); const { L } = ensureRootBasis(memory); memory.ensure(L, L);
      return { id: test.id, accepted: true, observable: topologyObservable(memory) };
    }
    if (operation === "same-pair") {
      const memory = new Memory(); const { O, C, L } = ensureRootBasis(memory); const before = memory.linkCount; const reused = memory.ensure(O, C);
      return { id: test.id, accepted: true, observable: { ...(topologyObservable(memory) as Record<string, Json>), countBefore: before, countAfter: memory.linkCount, reused: reused === L } };
    }
    if (operation === "restore") return { id: test.id, accepted: true, observable: topologyObservable(restoreTopology(storageImage(test.input))) };
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

function cloneDataset(dataset: StoredDataset): StoredDataset { return JSON.parse(JSON.stringify(dataset)) as StoredDataset; }
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
function anchorChain(memory: Memory, start: LinkHandle, count: number): { readonly refs: readonly LinkHandle[]; readonly last: LinkHandle } {
  const refs: LinkHandle[] = []; let current = start;
  for (let index = 0; index < count; index += 1) { current = memory.ensureStartSelfClosed(current); refs.push(current); }
  return { refs: Object.freeze(refs), last: current };
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
  const raw = input.segments ?? [[0, byteLength, 0]]; assert(Array.isArray(raw), "selection fixture needs segments");
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
    const resolved = replaySelectedSourceEvidence(memory, fixture.refs, evidence); const after = memory.linkCount; const expected = segments.map(([, , index]) => fixture.forms[index]);
    return { id: test.id, accepted: true, observable: { formCount: resolved.length, formsMatchExpected: resolved.every((form, index) => form === expected[index]), readOnlyCountStable: before === after } };
  } catch (error) {
    if (operation === "forged-resolution" && error instanceof SourceError) return { id: test.id, accepted: false, error: "invalid-source-evidence" };
    throw error;
  }
}

function foldHandles(memory: Memory, values: readonly LinkHandle[]): LinkHandle {
  let current = memory.root;
  for (const value of values) current = memory.ensure(current, value);
  return current;
}
function runSubselection(test: DifferentialCase): Result {
  const operation = test.input.operation; const start = test.input.start; const end = test.input.end;
  assert(typeof operation === "string" && typeof start === "number" && typeof end === "number", "subselection fixture needs operation/start/end");
  const memory = new Memory(); const segments: readonly SegmentTuple[] = [[0, 1, 0], [1, 2, 1], [2, 3, 2]]; const fixture = selectedFixture(memory, new Uint8Array([97, 98, 99]), segments);
  let evidence = buildSelectedSourceEvidence(memory, fixture.refs, fixture.source, fixture.specs, { dictionary: fixture.dictionary, grammar: fixture.grammar, theory: fixture.theory });
  const validRange = Number.isInteger(start) && Number.isInteger(end) && start >= 0 && end >= start && end <= 3; const selectedStart = validRange ? start : 1; const selectedEnd = validRange ? end : 2;
  const selectedSegments = evidence.segments.slice(selectedStart, selectedEnd); const selectedForms = fixture.forms.slice(selectedStart, selectedEnd); let selectionSequence = foldHandles(memory, selectedSegments.map((segment) => segment.selection)); let formSequence = foldHandles(memory, selectedForms);
  let grammarMembership = memory.ensure(fixture.grammar, formSequence); let theoryMembership = memory.ensure(fixture.theory, formSequence);
  if (operation === "forged-selection-fold") selectionSequence = evidence.selectionSequence;
  else if (operation === "forged-form-fold") formSequence = evidence.formSequence;
  else if (operation === "forged-grammar") grammarMembership = memory.ensure(fixture.grammar, memory.root);
  else if (operation === "forged-theory") theoryMembership = memory.ensure(fixture.theory, memory.root);
  else if (operation === "forged-whole-source") {
    const first = evidence.segments[0]; assert(first !== undefined, "whole source fixture requires first segment");
    evidence = Object.freeze({ ...evidence, segments: Object.freeze([Object.freeze({ ...first, resolution: memory.root }), ...evidence.segments.slice(1)]) }) as SourceFrontEndEvidence;
  } else if (operation !== "range" && operation !== "invalid-range") throw new Error(`unknown subselection operation: ${operation}`);
  const before = memory.linkCount;
  try {
    const resolved = replaySourceSubselection(memory, fixture.refs, evidence, { startSegment: start, endSegment: end, selectionSequence, formSequence, grammar: fixture.grammar, theory: fixture.theory, grammarMembership, theoryMembership }); const after = memory.linkCount; const expected = fixture.forms.slice(start, end);
    return { id: test.id, accepted: true, observable: { formCount: resolved.length, formsMatchExpected: resolved.every((form, index) => form === expected[index]), wholeSourcePreserved: evidence.source === fixture.source, emptyUsesRootFolds: start === end ? selectionSequence === memory.root && formSequence === memory.root : false, readOnlyCountStable: before === after } };
  } catch (error) {
    if (error instanceof SourceError) return { id: test.id, accepted: false, error: error.code };
    throw error;
  }
}

function relationRoles(memory: Memory, cursor: LinkHandle): { readonly roles: RelationRoles; readonly last: LinkHandle } {
  const chain = anchorChain(memory, cursor, 11); const r = chain.refs;
  return { roles: Object.freeze({ source: r[0]!, sourceSelection: r[1]!, formSequence: r[2]!, dictionary: r[3]!, grammar: r[4]!, theory: r[5]!, form: r[6]!, beforeContext: r[7]!, binding: r[8]!, result: r[9]!, afterContext: r[10]! }), last: chain.last };
}
function flatRoles(memory: Memory, cursor: LinkHandle): { readonly roles: FlatReadingRoles; readonly last: LinkHandle } {
  const chain = anchorChain(memory, cursor, 9); const r = chain.refs;
  return { roles: Object.freeze({ source: r[0]!, sourceSelection: r[1]!, formSequence: r[2]!, dictionary: r[3]!, grammar: r[4]!, theory: r[5]!, beforeContext: r[6]!, result: r[7]!, afterContext: r[8]! }), last: chain.last };
}
function relationAct(memory: Memory, sourceEvidence: SourceFrontEndEvidence, roles: RelationRoles, interpreter: LinkHandle, roleDictionary: LinkHandle, form: LinkHandle, beforeContext: LinkHandle, binding: LinkHandle, result: LinkHandle, afterContext: LinkHandle, selected: { readonly selectionSequence: LinkHandle; readonly formSequence: LinkHandle; readonly grammar: LinkHandle; readonly theory: LinkHandle } = sourceEvidence): RelationReplayEvidence {
  const act = defineActHeader(memory, interpreter, roleDictionary, afterContext);
  const fields: readonly [LinkHandle, LinkHandle][] = [[roles.source, sourceEvidence.source], [roles.sourceSelection, selected.selectionSequence], [roles.formSequence, selected.formSequence], [roles.dictionary, sourceEvidence.dictionary], [roles.grammar, selected.grammar], [roles.theory, selected.theory], [roles.form, form], [roles.beforeContext, beforeContext], [roles.binding, binding], [roles.result, result], [roles.afterContext, afterContext]];
  for (const [role, value] of fields) defineActField(memory, act, role, value);
  return Object.freeze({ sourceEvidence, act, roles, interpreter, roleDictionary });
}
function runRelation(test: DifferentialCase): Result {
  const operation = test.input.operation; assert(typeof operation === "string", "relation fixture needs operation");
  const memory = new Memory(); const byteRefs = byteVocabulary(memory); let cursor = byteRefs[255]!; const base = anchorChain(memory, cursor, 6); cursor = base.last;
  const [fixed, parent, binding, interpreter, roleDictionary, forged] = base.refs; assert(fixed && parent && binding && interpreter && roleDictionary && forged, "relation refs");
  let form: LinkHandle; let resultStart: LinkHandle; let resultEnd: LinkHandle;
  if (["start-open", "forged-result", "forged-binding", "forged-dgt", "forged-act"].includes(operation)) { form = memory.ensureStartSelfClosed(fixed); resultStart = binding; resultEnd = fixed; }
  else if (operation === "end-open") { form = memory.ensureEndSelfClosed(fixed); resultStart = fixed; resultEnd = binding; }
  else if (operation === "complete-form") { const next = memory.ensureStartSelfClosed(cursor); cursor = next; form = memory.ensure(fixed, next); resultStart = binding; resultEnd = next; }
  else throw new Error(`unknown relation operation: ${operation}`);
  const grammar = memory.ensureStartSelfClosed(form); const theory = memory.ensureStartSelfClosed(grammar); cursor = theory;
  const content = materializeSourceContent(memory, byteRefs, new Uint8Array([120])); const source = defineSourceForm(memory, content); let dictionary = defineDictionaryScope(memory, memory.root, memory.root);
  const effect = defineDictionaryEffect(memory, dictionary, memory.root, memory.root, content, form); dictionary = effect.afterScope;
  const sourceEvidence = buildSelectedSourceEvidence(memory, byteRefs, source, [{ start: 0, end: 1, form, dictionaryOccurrence: effect.occurrence }], { dictionary, grammar, theory });
  const beforeContext = defineContext(memory, parent, binding); const expected = memory.ensure(resultStart, resultEnd); const afterContext = defineContext(memory, parent, expected);
  const roleFixture = relationRoles(memory, cursor); cursor = roleFixture.last; let actBinding = binding; let actResult = expected; let evidenceSource = sourceEvidence; let evidenceRoleDictionary = roleDictionary;
  if (operation === "forged-binding") actBinding = fixed;
  if (operation === "forged-result") { const wrongEnd = memory.ensureStartSelfClosed(cursor); actResult = memory.ensure(binding, wrongEnd); }
  let evidence = relationAct(memory, sourceEvidence, roleFixture.roles, interpreter, roleDictionary, form, beforeContext, actBinding, actResult, afterContext);
  if (operation === "forged-dgt") { evidenceSource = Object.freeze({ ...sourceEvidence, grammar: forged }); evidence = Object.freeze({ ...evidence, sourceEvidence: evidenceSource }); }
  if (operation === "forged-act") { evidenceRoleDictionary = forged; evidence = Object.freeze({ ...evidence, roleDictionary: evidenceRoleDictionary }); }
  const before = memory.linkCount;
  try {
    const result = replayRelationStep(memory, byteRefs, evidence); const after = memory.linkCount;
    return { id: test.id, accepted: true, observable: { resultMatchesExpected: result === expected, readOnlyCountStable: before === after } };
  } catch (error) {
    if (error instanceof InterpreterReplayError) return { id: test.id, accepted: false, error: "invalid-relation-evidence" };
    throw error;
  }
}

function flatAct(memory: Memory, sourceEvidence: SourceFrontEndEvidence, roles: FlatReadingRoles, interpreter: LinkHandle, roleDictionary: LinkHandle, beforeContext: LinkHandle, result: LinkHandle, afterContext: LinkHandle, selected: { readonly selectionSequence: LinkHandle; readonly formSequence: LinkHandle; readonly grammar: LinkHandle; readonly theory: LinkHandle } = sourceEvidence): FlatReadingEvidence {
  const act = defineActHeader(memory, interpreter, roleDictionary, afterContext);
  const fields: readonly [LinkHandle, LinkHandle][] = [[roles.source, sourceEvidence.source], [roles.sourceSelection, selected.selectionSequence], [roles.formSequence, selected.formSequence], [roles.dictionary, sourceEvidence.dictionary], [roles.grammar, selected.grammar], [roles.theory, selected.theory], [roles.beforeContext, beforeContext], [roles.result, result], [roles.afterContext, afterContext]];
  for (const [role, value] of fields) defineActField(memory, act, role, value);
  return Object.freeze({ sourceEvidence, act, roles, interpreter, roleDictionary });
}
function runFlat(test: DifferentialCase): Result {
  const operation = test.input.operation; assert(typeof operation === "string", "flat fixture needs operation");
  if (operation === "distinct-readings") return runFlatDistinct(test);
  const count = operation === "single" ? 1 : 2; const memory = new Memory(); const byteRefs = byteVocabulary(memory); let cursor = byteRefs[255]!; const formChain = anchorChain(memory, cursor, count); cursor = formChain.last; const forms = formChain.refs;
  const grammar = memory.ensureStartSelfClosed(cursor); const theory = memory.ensureStartSelfClosed(grammar); cursor = theory; let dictionary = defineDictionaryScope(memory, memory.root, memory.root); let history = memory.root; const specs: SelectedSegmentSpec[] = []; const bytes = new Uint8Array(count);
  for (let index = 0; index < count; index += 1) { const form = forms[index]!; const value = 97 + index; bytes[index] = value; const content = materializeSourceContent(memory, byteRefs, new Uint8Array([value])); const effect = defineDictionaryEffect(memory, dictionary, memory.root, history, content, form); dictionary = effect.afterScope; history = effect.historyAfter; specs.push(Object.freeze({ start: index, end: index + 1, form, dictionaryOccurrence: effect.occurrence })); }
  const source = defineSourceForm(memory, materializeSourceContent(memory, byteRefs, bytes)); const sourceEvidence = buildSelectedSourceEvidence(memory, byteRefs, source, specs, { dictionary, grammar, theory });
  const base = anchorChain(memory, cursor, 5); cursor = base.last; const [interpreter, roleDictionary, parent, current, forged] = base.refs; assert(interpreter && roleDictionary && parent && current && forged, "flat refs");
  const expected = count === 1 ? forms[0]! : memory.ensure(forms[0]!, forms[1]!); const beforeContext = defineContext(memory, parent, current); const afterContext = defineContext(memory, parent, expected); const roleFixture = flatRoles(memory, cursor); cursor = roleFixture.last;
  let actResult = expected; if (operation === "forged-result") { const wrong = memory.ensure(forms[0]!, memory.ensureStartSelfClosed(cursor)); actResult = wrong; }
  let evidence = flatAct(memory, sourceEvidence, roleFixture.roles, interpreter, roleDictionary, beforeContext, actResult, afterContext);
  if (operation === "forged-dgt") evidence = Object.freeze({ ...evidence, sourceEvidence: Object.freeze({ ...sourceEvidence, theory: forged }) });
  else if (operation === "forged-act") evidence = Object.freeze({ ...evidence, roleDictionary: forged });
  else if (!["single", "multi", "forged-result"].includes(operation)) throw new Error(`unknown flat operation: ${operation}`);
  const before = memory.linkCount;
  try {
    const result = replayFlatReading(memory, byteRefs, evidence); const after = memory.linkCount;
    return { id: test.id, accepted: true, observable: { formCount: count, resultMatchesExpected: result === expected, readOnlyCountStable: before === after } };
  } catch (error) {
    if (error instanceof InterpreterReplayError) return { id: test.id, accepted: false, error: "invalid-flat-evidence" };
    throw error;
  }
}
function runFlatDistinct(test: DifferentialCase): Result {
  const memory = new Memory(); const byteRefs = byteVocabulary(memory); let cursor = byteRefs[255]!; const formChain = anchorChain(memory, cursor, 2); cursor = formChain.last; const [a, b] = formChain.refs; assert(a && b, "distinct form refs");
  const carrierA = memory.ensure(memory.root, a); const carrierAB = memory.ensure(carrierA, b); const pairResult = memory.ensure(a, b); let dictionary = defineDictionaryScope(memory, memory.root, memory.root); let history = memory.root; const occurrences = new Map<string, LinkHandle>();
  for (const [key, raw, form] of [["a", new Uint8Array([97]), a], ["b", new Uint8Array([98]), b], ["ab", new Uint8Array([97, 98]), carrierAB]] as const) { const effect = defineDictionaryEffect(memory, dictionary, memory.root, history, materializeSourceContent(memory, byteRefs, raw), form); dictionary = effect.afterScope; history = effect.historyAfter; occurrences.set(key, effect.occurrence); }
  const source = defineSourceForm(memory, materializeSourceContent(memory, byteRefs, new Uint8Array([97, 98]))); const dgt = anchorChain(memory, cursor, 4); cursor = dgt.last; const [pairG, pairT, carrierG, carrierT] = dgt.refs; assert(pairG && pairT && carrierG && carrierT, "distinct DGT refs");
  const pairSource = buildSelectedSourceEvidence(memory, byteRefs, source, [{ start: 0, end: 1, form: a, dictionaryOccurrence: occurrences.get("a")! }, { start: 1, end: 2, form: b, dictionaryOccurrence: occurrences.get("b")! }], { dictionary, grammar: pairG, theory: pairT });
  const carrierSource = buildSelectedSourceEvidence(memory, byteRefs, source, [{ start: 0, end: 2, form: carrierAB, dictionaryOccurrence: occurrences.get("ab")! }], { dictionary, grammar: carrierG, theory: carrierT });
  const base = anchorChain(memory, cursor, 4); cursor = base.last; const [interpreter, roleDictionary, parent, current] = base.refs; assert(interpreter && roleDictionary && parent && current, "distinct act refs"); const beforeContext = defineContext(memory, parent, current); const roleFixture = flatRoles(memory, cursor);
  const pairAfter = defineContext(memory, parent, pairResult); const carrierAfter = defineContext(memory, parent, carrierAB); const first = flatAct(memory, pairSource, roleFixture.roles, interpreter, roleDictionary, beforeContext, pairResult, pairAfter); const second = flatAct(memory, carrierSource, roleFixture.roles, interpreter, roleDictionary, beforeContext, carrierAB, carrierAfter);
  const before = memory.linkCount; const firstResult = replayFlatReading(memory, byteRefs, first); const secondResult = replayFlatReading(memory, byteRefs, second); const after = memory.linkCount;
  return { id: test.id, accepted: true, observable: { sameSource: pairSource.source === carrierSource.source, readingsDistinct: firstResult !== secondResult, resultsMatchExpected: firstResult === pairResult && secondResult === carrierAB, readOnlyCountStable: before === after } };
}

function continuedHandles(memory: Memory, prefix: LinkHandle, forms: readonly LinkHandle[]): LinkHandle {
  let current = prefix;
  for (const form of forms) current = memory.ensure(current, form);
  return current;
}
function interpreterSubselectionFixture() {
  const memory = new Memory(); const byteRefs = byteVocabulary(memory); let cursor = byteRefs[255]!; const base = anchorChain(memory, cursor, 8); cursor = base.last;
  const [left, fixed, right, parent, prefix, interpreter, roleDictionary, other] = base.refs; assert(left && fixed && right && parent && prefix && interpreter && roleDictionary && other, "interpreter subselection refs");
  const relationForm = memory.ensureStartSelfClosed(fixed); const forms = Object.freeze([left, relationForm, right]); const grammar = memory.ensureStartSelfClosed(cursor); const theory = memory.ensureStartSelfClosed(grammar); cursor = theory;
  let dictionary = defineDictionaryScope(memory, memory.root, memory.root); let history = memory.root; const specs: SelectedSegmentSpec[] = [];
  for (let index = 0; index < forms.length; index += 1) { const form = forms[index]!; const raw = new Uint8Array([97 + index]); const effect = defineDictionaryEffect(memory, dictionary, memory.root, history, materializeSourceContent(memory, byteRefs, raw), form); dictionary = effect.afterScope; history = effect.historyAfter; specs.push(Object.freeze({ start: index, end: index + 1, form, dictionaryOccurrence: effect.occurrence })); }
  const source = defineSourceForm(memory, materializeSourceContent(memory, byteRefs, new Uint8Array([97, 98, 99]))); const sourceEvidence = buildSelectedSourceEvidence(memory, byteRefs, source, specs, { dictionary, grammar, theory });
  return { memory, byteRefs, source, sourceEvidence, forms, fixed, parent, prefix, interpreter, roleDictionary, other, cursor };
}
function makeInterpreterSubselection(memory: Memory, evidence: SourceFrontEndEvidence, forms: readonly LinkHandle[], start: number, end: number): { readonly evidence: SourceSubselectionEvidence; readonly forms: readonly LinkHandle[] } {
  const selectedForms = forms.slice(start, end); const formSequence = foldHandles(memory, selectedForms); const selectionSequence = foldHandles(memory, evidence.segments.slice(start, end).map((segment) => segment.selection));
  return { forms: Object.freeze(selectedForms), evidence: Object.freeze({ startSegment: start, endSegment: end, selectionSequence, formSequence, grammar: evidence.grammar, theory: evidence.theory, grammarMembership: memory.ensure(evidence.grammar, formSequence), theoryMembership: memory.ensure(evidence.theory, formSequence) }) };
}
function runInterpreterSubselection(test: DifferentialCase): Result {
  const operation = test.input.operation; assert(typeof operation === "string", "interpreter subselection fixture needs operation"); const fixture = interpreterSubselectionFixture(); const { memory, byteRefs, source, sourceEvidence, forms, fixed, parent, prefix, interpreter, roleDictionary, other } = fixture; let cursor = fixture.cursor; const isRelation = operation.startsWith("relation-"); const isContinuation = operation.startsWith("continuation-");
  let start: number; let end: number;
  if (isRelation) { if (operation === "relation-empty") [start, end] = [1, 1]; else if (operation === "relation-multi") [start, end] = [0, 2]; else [start, end] = [1, 2]; }
  else if (operation === "flat-single") [start, end] = [1, 2];
  else if (operation === "flat-multi" || operation === "flat-forged-result") [start, end] = [1, 3];
  else if (operation === "flat-empty") [start, end] = [1, 1];
  else if (operation === "continuation-suffix" || operation === "continuation-forged-result" || operation === "continuation-forged-fold") [start, end] = [1, 3];
  else if (operation === "continuation-empty") [start, end] = [2, 2];
  else throw new Error(`unknown interpreter subselection operation: ${operation}`);
  const selectedFixture = makeInterpreterSubselection(memory, sourceEvidence, forms, start, end); let selected = selectedFixture.evidence; const selectedForms = selectedFixture.forms;
  if (operation === "relation-forged-fold" || operation === "continuation-forged-fold") selected = Object.freeze({ ...selected, formSequence: sourceEvidence.formSequence });
  if (isRelation) {
    const relationForm = forms[1]!; const binding = prefix; const beforeContext = defineContext(memory, parent, binding); const expected = memory.ensure(binding, fixed); const afterContext = defineContext(memory, parent, expected); const roleFixture = relationRoles(memory, cursor); cursor = roleFixture.last; const evidence = relationAct(memory, sourceEvidence, roleFixture.roles, interpreter, roleDictionary, relationForm, beforeContext, binding, expected, afterContext, selected); const before = memory.linkCount;
    try { const result = replayRelationSubselectionStep(memory, byteRefs, evidence, selected); const after = memory.linkCount; return { id: test.id, accepted: true, observable: { resultMatchesExpected: result === expected, wholeSourcePreserved: evidence.sourceEvidence.source === source, selectedFormCount: selectedForms.length, readOnlyCountStable: before === after } }; }
    catch (error) { if (error instanceof InterpreterReplayError) return { id: test.id, accepted: false, error: "invalid-relation-evidence" }; throw error; }
  }
  const beforeContext = defineContext(memory, parent, prefix); const expected = isContinuation ? continuedHandles(memory, prefix, selectedForms) : selectedForms.length === 0 ? memory.root : selectedForms.length === 1 ? selectedForms[0]! : continuedHandles(memory, selectedForms[0]!, selectedForms.slice(1)); let result = expected;
  if (operation === "flat-forged-result" || operation === "continuation-forged-result") result = memory.ensure(prefix, other);
  const afterContext = defineContext(memory, parent, result); const roleFixture = flatRoles(memory, cursor); cursor = roleFixture.last; const evidence = flatAct(memory, sourceEvidence, roleFixture.roles, interpreter, roleDictionary, beforeContext, result, afterContext, selected); const before = memory.linkCount;
  try {
    const actual = isContinuation ? replayFlatSubselectionContinuation(memory, byteRefs, evidence, selected) : replayFlatSubselectionReading(memory, byteRefs, evidence, selected); const after = memory.linkCount; const beforeState = readContext(memory, beforeContext); const afterState = readContext(memory, afterContext);
    return { id: test.id, accepted: true, observable: { resultMatchesExpected: actual === expected, wholeSourcePreserved: evidence.sourceEvidence.source === source, selectedFormCount: selectedForms.length, prefixPreserved: beforeState.current === prefix, parentPreserved: afterState.parent === parent, emptyReturnsPrefix: isContinuation && selectedForms.length === 0 ? actual === prefix : false, readOnlyCountStable: before === after } };
  } catch (error) {
    if (error instanceof InterpreterReplayError) return { id: test.id, accepted: false, error: "invalid-flat-evidence" };
    throw error;
  }
}

interface ColonFields {
  readonly source: LinkHandle;
  readonly sourceContent: LinkHandle;
  readonly form: LinkHandle;
  readonly beforeDictionary: LinkHandle;
  readonly entry: LinkHandle;
  readonly definitionOccurrence: LinkHandle;
  readonly historyBefore: LinkHandle;
  readonly historyAfter: LinkHandle;
  readonly afterDictionary: LinkHandle;
  readonly context: LinkHandle;
}
function colonRoles(memory: Memory, cursor: LinkHandle): { readonly roles: ColonRoles; readonly last: LinkHandle } {
  const chain = anchorChain(memory, cursor, 10); const r = chain.refs;
  return { roles: Object.freeze({ source: r[0]!, sourceContent: r[1]!, form: r[2]!, beforeDictionary: r[3]!, entry: r[4]!, definitionOccurrence: r[5]!, historyBefore: r[6]!, historyAfter: r[7]!, afterDictionary: r[8]!, context: r[9]! }), last: chain.last };
}
function colonEvidence(memory: Memory, fields: ColonFields, roles: ColonRoles, interpreter: LinkHandle, roleDictionary: LinkHandle): ColonReplayEvidence {
  const act = defineActHeader(memory, interpreter, roleDictionary, fields.context);
  const values: readonly [LinkHandle, LinkHandle][] = [[roles.source, fields.source], [roles.sourceContent, fields.sourceContent], [roles.form, fields.form], [roles.beforeDictionary, fields.beforeDictionary], [roles.entry, fields.entry], [roles.definitionOccurrence, fields.definitionOccurrence], [roles.historyBefore, fields.historyBefore], [roles.historyAfter, fields.historyAfter], [roles.afterDictionary, fields.afterDictionary], [roles.context, fields.context]];
  for (const [role, value] of values) defineActField(memory, act, role, value);
  return Object.freeze({ act, roles, interpreter, roleDictionary });
}
function makeColonFixture(memory: Memory, options: { readonly beforeDictionary?: LinkHandle; readonly parent?: LinkHandle; readonly historyBefore?: LinkHandle; readonly sourceContent?: LinkHandle; readonly form?: LinkHandle } = {}) {
  let cursor = memory.root; const seed = anchorChain(memory, cursor, 5); cursor = seed.last; const [defaultContent, defaultForm, interpreter, roleDictionary, contextCurrent] = seed.refs; assert(defaultContent && defaultForm && interpreter && roleDictionary && contextCurrent, "colon seed");
  const parent = options.parent ?? memory.root; const historyBefore = options.historyBefore ?? memory.root; const sourceContent = options.sourceContent ?? defaultContent; const form = options.form ?? defaultForm; const beforeDictionary = options.beforeDictionary ?? defineDictionaryScope(memory, parent, historyBefore);
  const source = defineSourceForm(memory, sourceContent); const effect = defineDictionaryEffect(memory, beforeDictionary, parent, historyBefore, sourceContent, form); const context = defineContext(memory, memory.root, contextCurrent); const roleFixture = colonRoles(memory, cursor);
  const fields: ColonFields = Object.freeze({ source, sourceContent, form, beforeDictionary, entry: effect.entry, definitionOccurrence: effect.occurrence, historyBefore, historyAfter: effect.historyAfter, afterDictionary: effect.afterScope, context });
  return { fields, effect, roles: roleFixture.roles, interpreter, roleDictionary, last: roleFixture.last };
}
function runColon(test: DifferentialCase): Result {
  const operation = test.input.operation; assert(typeof operation === "string", "colon fixture needs operation"); const memory = new Memory(); let fields: ColonFields; let roles: ColonRoles; let interpreter: LinkHandle; let roleDictionary: LinkHandle; let forgedRoleDictionary: LinkHandle | undefined; let structuralEventDistinct = false;
  if (operation === "repeated-event") {
    const content = memory.ensureStartSelfClosed(memory.root); const form = memory.ensureStartSelfClosed(content); const base = defineDictionaryScope(memory, memory.root, memory.root); const first = defineDictionaryEffect(memory, base, memory.root, memory.root, content, form); const fixture = makeColonFixture(memory, { beforeDictionary: first.afterScope, parent: memory.root, historyBefore: first.historyAfter, sourceContent: content, form });
    ({ fields, roles, interpreter, roleDictionary } = fixture); structuralEventDistinct = fixture.effect.occurrence !== first.occurrence;
  } else if (operation === "conflict") {
    const content = memory.ensureStartSelfClosed(memory.root); const formOne = memory.ensureStartSelfClosed(content); const formTwo = memory.ensureStartSelfClosed(formOne); const base = defineDictionaryScope(memory, memory.root, memory.root); const first = defineDictionaryEffect(memory, base, memory.root, memory.root, content, formOne); const fixture = makeColonFixture(memory, { beforeDictionary: first.afterScope, parent: memory.root, historyBefore: first.historyAfter, sourceContent: content, form: formTwo });
    const evidence = colonEvidence(memory, fixture.fields, fixture.roles, fixture.interpreter, fixture.roleDictionary);
    try { replayColonEffect(memory, evidence); }
    catch (error) { if (error instanceof InterpreterReplayError) return { id: test.id, accepted: false, error: "invalid-colon-evidence" }; throw error; }
    throw new Error("colon conflict was unexpectedly accepted");
  } else {
    const fixture = makeColonFixture(memory); ({ fields, roles, interpreter, roleDictionary } = fixture);
    if (operation === "forged-occurrence") fields = Object.freeze({ ...fields, definitionOccurrence: memory.ensureStartSelfClosed(fixture.last) });
    else if (operation === "forged-history") fields = Object.freeze({ ...fields, historyAfter: memory.ensure(memory.ensureStartSelfClosed(fixture.last), fields.definitionOccurrence) });
    else if (operation === "forged-act") forgedRoleDictionary = memory.ensureStartSelfClosed(fixture.last);
    else if (operation !== "valid") throw new Error(`unknown colon operation: ${operation}`);
  }
  let evidence = colonEvidence(memory, fields, roles, interpreter, roleDictionary);
  if (forgedRoleDictionary !== undefined) evidence = Object.freeze({ ...evidence, roleDictionary: forgedRoleDictionary });
  const before = memory.linkCount;
  try {
    const result = replayColonEffect(memory, evidence); const after = memory.linkCount; const beforeScope = readDictionaryScope(memory, fields.beforeDictionary); const afterScope = readDictionaryScope(memory, fields.afterDictionary); const resolution = lookupScopedDictionary(memory, fields.afterDictionary, fields.sourceContent); const beforeResolution = lookupScopedDictionary(memory, fields.beforeDictionary, fields.sourceContent); const history = memory.poles(fields.historyAfter);
    return { id: test.id, accepted: true, observable: { resultMatchesExpected: result === fields.afterDictionary, occurrenceVisibleAfter: resolution !== undefined && resolution.occurrences.includes(fields.definitionOccurrence), occurrenceInvisibleBefore: beforeResolution === undefined || !beforeResolution.occurrences.includes(fields.definitionOccurrence), parentPreserved: beforeScope.parentScope === afterScope.parentScope, historyAppended: history.start === fields.historyBefore && history.end === fields.definitionOccurrence, structuralEventDistinct, readOnlyCountStable: before === after } };
  } catch (error) {
    if (error instanceof InterpreterReplayError) return { id: test.id, accepted: false, error: "invalid-colon-evidence" };
    throw error;
  }
}

function equalityRoles(memory: Memory, cursor: LinkHandle): { readonly roles: EqualityRoles; readonly last: LinkHandle } {
  const chain = anchorChain(memory, cursor, 5); const r = chain.refs;
  return { roles: Object.freeze({ context: r[0]!, left: r[1]!, right: r[2]!, leftRepresentative: r[3]!, rightRepresentative: r[4]! }), last: chain.last };
}
function equalityEvidence(memory: Memory, roles: EqualityRoles, interpreter: LinkHandle, roleDictionary: LinkHandle, context: LinkHandle, left: LinkHandle, right: LinkHandle, leftRepresentative: LinkHandle, rightRepresentative: LinkHandle): EqualityReplayEvidence {
  const act = defineActHeader(memory, interpreter, roleDictionary, context); const values: readonly [LinkHandle, LinkHandle][] = [[roles.context, context], [roles.left, left], [roles.right, right], [roles.leftRepresentative, leftRepresentative], [roles.rightRepresentative, rightRepresentative]];
  for (const [role, value] of values) defineActField(memory, act, role, value);
  return Object.freeze({ act, roles, interpreter, roleDictionary });
}
function runEquality(test: DifferentialCase): Result {
  const operation = test.input.operation; assert(typeof operation === "string", "equality fixture needs operation"); const memory = new Memory(); const base = anchorChain(memory, memory.root, 7); let cursor = base.last; const [parent, current, originalLeft, originalRight, representative, interpreter, roleDictionary] = base.refs; assert(parent && current && originalLeft && originalRight && representative && interpreter && roleDictionary, "equality refs");
  const context = defineContext(memory, parent, current); let left = originalLeft; let right = originalRight; let leftRepresentative = left; let rightRepresentative = right; let forgedRoleDictionary: LinkHandle | undefined; let expected = false;
  if (operation === "identical") { right = left; rightRepresentative = left; expected = true; }
  else if (operation === "distinct") {}
  else if (operation === "shared-representative") { defineLocalRepresentativeBinding(memory, context, left, representative); defineLocalRepresentativeBinding(memory, context, right, representative); leftRepresentative = representative; rightRepresentative = representative; expected = true; }
  else if (operation === "one-hop") { defineLocalRepresentativeBinding(memory, context, left, right); leftRepresentative = right; rightRepresentative = right; expected = true; }
  else if (operation === "non-transitive") { defineLocalRepresentativeBinding(memory, context, left, right); defineLocalRepresentativeBinding(memory, context, right, representative); leftRepresentative = right; rightRepresentative = representative; expected = false; }
  else if (operation === "conflict") { defineLocalRepresentativeBinding(memory, context, left, right); defineLocalRepresentativeBinding(memory, context, left, representative); leftRepresentative = right; }
  else if (operation === "forged-representative") { leftRepresentative = representative; }
  else if (operation === "forged-act") forgedRoleDictionary = memory.ensureStartSelfClosed(cursor);
  else throw new Error(`unknown equality operation: ${operation}`);
  const roleFixture = equalityRoles(memory, cursor); cursor = roleFixture.last; let evidence = equalityEvidence(memory, roleFixture.roles, interpreter, roleDictionary, context, left, right, leftRepresentative, rightRepresentative);
  if (forgedRoleDictionary !== undefined) evidence = Object.freeze({ ...evidence, roleDictionary: forgedRoleDictionary });
  const before = memory.linkCount;
  try {
    const equal = replayEqualityEvaluation(memory, evidence); const after = memory.linkCount;
    return { id: test.id, accepted: true, observable: { equal, resultMatchesExpected: equal === expected, readOnlyCountStable: before === after } };
  } catch (error) {
    if (error instanceof InterpreterReplayError || (error instanceof StateError && error.code === "representative-conflict")) return { id: test.id, accepted: false, error: "invalid-equality-evidence" };
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
const runners: Record<DifferentialCase["category"], (test: DifferentialCase) => Result> = { topology: runTopology, anum: runAnum, persistence: runPersistence, source: runSource, state: runState, dictionary: runDictionary, selection: runSelection, subselection: runSubselection, relation: runRelation, flat: runFlat, "interpreter-subselection": runInterpreterSubselection, colon: runColon, equality: runEquality };
const actual = corpus.cases.map((test) => runners[test.category](test));
assert(expected.length === actual.length, "differential result cardinality mismatch");
expected.forEach((pythonResult, index) => {
  const tsResult = actual[index]; assert(tsResult !== undefined, `missing TS result at ${index}`);
  assert(sameJson(pythonResult as unknown as Json, tsResult as unknown as Json), `differential mismatch for ${pythonResult.id}: Python=${JSON.stringify(pythonResult)} TS=${JSON.stringify(tsResult)}`);
});