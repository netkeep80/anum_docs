// mts-version-evidence: required-from=0.12

import { readFileSync } from "node:fs";
import {
  continueStringSign,
  defineTypedContext,
  openStringContext,
  replayStringClose,
} from "../src/context-integration.js";
import {
  defineDictionaryEffect,
  defineDictionaryScope,
} from "../src/dictionary.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type RootBasis,
} from "../src/memory.js";
import {
  buildSelectedSourceEvidence,
  defineSourceForm,
  materializeSourceContent,
  readSourceContent,
  replaySelectedSourceEvidence,
  type SelectedSegmentSpec,
} from "../src/source.js";
import {
  defineStructuralInterpreter,
  type StructuralInterpreter,
} from "../src/structural-rule.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

interface InterpreterFixture {
  readonly handle: LinkHandle;
  readonly structure: StructuralInterpreter;
}

interface StringAuthority {
  readonly basis: RootBasis;
  readonly a: LinkHandle;
  readonly b: LinkHandle;
  readonly dictionary: LinkHandle;
  readonly occurrences: readonly [LinkHandle, LinkHandle];
  readonly grammar: LinkHandle;
  readonly theory: LinkHandle;
  readonly rootInterpreter: InterpreterFixture;
  readonly stringInterpreter: InterpreterFixture;
}

interface LoadedStringFixture {
  readonly authority: StringAuthority;
  readonly content: LinkHandle;
  readonly source: LinkHandle;
  readonly result: LinkHandle;
  readonly wire: Uint8Array;
}

function anchors(memory: Memory, count: number): readonly LinkHandle[] {
  const result: LinkHandle[] = [];
  let current = ensureRootBasis(memory).L;
  for (let index = 0; index < count; index += 1) {
    current = memory.ensureStartSelfClosed(current);
    result.push(current);
  }
  return Object.freeze(result);
}

function defineInterpreter(
  memory: Memory,
  dictionary: LinkHandle,
  grammar: LinkHandle,
  theory: LinkHandle,
): InterpreterFixture {
  const structure: StructuralInterpreter = Object.freeze({ dictionary, grammar, theory });
  return Object.freeze({
    handle: defineStructuralInterpreter(memory, dictionary, grammar, theory),
    structure,
  });
}

function buildStringAuthority(memory: Memory): StringAuthority {
  const basis = ensureRootBasis(memory);
  const refs = anchors(memory, 7);
  const [a, b, grammar, theory, rootDictionary, rootGrammar, rootTheory] = refs;
  assert(a && b && grammar && theory && rootDictionary && rootGrammar && rootTheory, "authority anchors");

  let history = memory.root;
  let dictionary = defineDictionaryScope(memory, memory.root, history);
  const occurrences: LinkHandle[] = [];
  for (const [bytes, form] of [
    [new Uint8Array([0x61]), a],
    [new Uint8Array([0x62]), b],
  ] as const) {
    const effect = defineDictionaryEffect(
      memory,
      dictionary,
      memory.root,
      history,
      materializeSourceContent(memory, bytes),
      form,
    );
    occurrences.push(effect.occurrence);
    history = effect.historyAfter;
    dictionary = effect.afterScope;
  }

  const occurrenceA = occurrences[0];
  const occurrenceB = occurrences[1];
  assert(occurrenceA && occurrenceB, "dictionary occurrences");

  return Object.freeze({
    basis,
    a,
    b,
    dictionary,
    occurrences: Object.freeze([occurrenceA, occurrenceB]) as readonly [LinkHandle, LinkHandle],
    grammar,
    theory,
    rootInterpreter: defineInterpreter(memory, rootDictionary, rootGrammar, rootTheory),
    stringInterpreter: defineInterpreter(memory, dictionary, grammar, theory),
  });
}

function segment(
  start: number,
  end: number,
  form: LinkHandle,
  dictionaryOccurrence: LinkHandle,
): SelectedSegmentSpec {
  return Object.freeze({ start, end, form, dictionaryOccurrence });
}

function loadFlatStringFixture(memory: Memory, bytes: Uint8Array): LoadedStringFixture {
  const authority = buildStringAuthority(memory);
  const content = materializeSourceContent(memory, bytes);
  const source = defineSourceForm(memory, content);
  const evidence = buildSelectedSourceEvidence(
    memory,
    source,
    [
      segment(0, 1, authority.a, authority.occurrences[0]),
      segment(1, 2, authority.b, authority.occurrences[1]),
    ],
    {
      dictionary: authority.dictionary,
      grammar: authority.grammar,
      theory: authority.theory,
    },
  );

  const values = replaySelectedSourceEvidence(memory, evidence);
  same(values.length, 2, "flat STRING selected value count");
  same(values[0], authority.a, "first selected value");
  same(values[1], authority.b, "second selected value");

  const parent = defineTypedContext(
    memory,
    authority.rootInterpreter.handle,
    memory.root,
    memory.root,
  );
  let current = openStringContext(
    memory,
    parent,
    authority.rootInterpreter.structure,
    authority.stringInterpreter.handle,
  );
  for (const value of values) {
    current = continueStringSign(
      memory,
      current,
      authority.stringInterpreter.structure,
      value,
    );
  }
  const result = replayStringClose(
    memory,
    current,
    authority.stringInterpreter.structure,
    parent,
    authority.rootInterpreter.structure,
  );

  return Object.freeze({
    authority,
    content,
    source,
    result,
    wire: readSourceContent(memory, authority.basis, content).bytes,
  });
}

function structuralSignature(
  memory: Memory,
  link: LinkHandle,
  memo: Map<LinkHandle, string>,
  active: Set<LinkHandle>,
): string {
  const cached = memo.get(link);
  if (cached !== undefined) return cached;
  if (link === memory.root) {
    memo.set(link, "R");
    return "R";
  }
  assert(!active.has(link), "unexpected non-self recursive cycle in canonical Memory");
  active.add(link);
  try {
    const poles = memory.poles(link);
    const startSelf = poles.start === link;
    const endSelf = poles.end === link;
    assert(!(startSelf && endSelf), "non-root full selfclosure");
    const result = startSelf
      ? `S(${structuralSignature(memory, poles.end, memo, active)})`
      : endSelf
        ? `E(${structuralSignature(memory, poles.start, memo, active)})`
        : `P(${structuralSignature(memory, poles.start, memo, active)},${structuralSignature(memory, poles.end, memo, active)})`;
    memo.set(link, result);
    return result;
  } finally {
    active.delete(link);
  }
}

function stateSignatures(memory: Memory): readonly string[] {
  const memo = new Map<LinkHandle, string>();
  const values = memory.allLinks().map((link) => structuralSignature(memory, link, memo, new Set()));
  assert(new Set(values).size === values.length, "canonical Memory must not contain duplicate structural forms");
  return Object.freeze([...values].sort());
}

function sameStructuralState(left: Memory, right: Memory): boolean {
  const a = stateSignatures(left);
  const b = stateSignatures(right);
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

const fixture = new Uint8Array(
  readFileSync("../examples/anum/conformance/string-flat-ab.string.anum"),
);
assert(bytesEqual(fixture, new Uint8Array([0x61, 0x62])), "golden STRING fixture must be exact UTF-8 bytes `ab`");

const memoryA = new Memory();
const loadedA = loadFlatStringFixture(memoryA, fixture);
assert(bytesEqual(loadedA.wire, fixture), "Memory A faithful STRING wire must equal fixture bytes");
same(
  loadedA.result,
  memoryA.ensure(loadedA.authority.a, loadedA.authority.b),
  "STRING result must be a ⟼ b",
);

const memoryB = new Memory();
const loadedB = loadFlatStringFixture(memoryB, loadedA.wire);

assert(loadedA.result !== loadedB.result, "independent memories must not share result handles");
assert(loadedA.source !== loadedB.source, "independent memories must not share source handles");
assert(loadedA.content !== loadedB.content, "independent memories must not share source-content handles");
assert(bytesEqual(loadedB.wire, loadedA.wire), "Memory B canonical faithful STRING reserialization");

const signatureA = structuralSignature(memoryA, loadedA.result, new Map(), new Set());
const signatureB = structuralSignature(memoryB, loadedB.result, new Map(), new Set());
same(signatureA, signatureB, "STRING result structural equivalence across memories");

const sourceA = structuralSignature(memoryA, loadedA.source, new Map(), new Set());
const sourceB = structuralSignature(memoryB, loadedB.source, new Map(), new Set());
same(sourceA, sourceB, "faithful source structural equivalence across memories");

assert(
  sameStructuralState(memoryA, memoryB),
  "Memory A and Memory B must have the same complete canonical structural state",
);

console.log("MTS v0.12 faithful STRING two-memory conformance: flat `ab` GREEN.");
