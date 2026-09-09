import {
  parseRawQuaternary,
  normalizeRawForm,
  QuaternaryDecodeError,
  type Abit,
} from "../src/anum.js";
import {
  encodeBytesToQuaternary,
  readCanonicalByteSequence,
  textToUtf8Bytes,
} from "../src/byte-carrier.js";
import {
  continueFormalContext,
  continueQuaternaryContext,
  continueStringSign,
  defineTypedContext,
  openFormalContext,
  openFormalSquareBracketContext,
  openQuaternaryContext,
  replayQuaternaryClose,
  replayStringClose,
  type TypedContext,
} from "../src/context-integration.js";
import {
  defineDictionaryEffect,
  defineDictionaryScope,
} from "../src/dictionary.js";
import { readExactSequence } from "../src/exact-sequence.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
} from "../src/memory.js";
import {
  closeQuaternaryState,
  finalizeQuaternaryState,
} from "../src/quaternary-state.js";
import {
  buildSelectedSourceEvidence,
  defineSourceForm,
  materializeSourceContent,
  replaySelectedSourceEvidence,
} from "../src/source.js";
import { readContext } from "../src/state.js";
import {
  defineStructuralInterpreter,
  type StructuralInterpreter,
} from "../src/structural-rule.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.12 C5: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

function vector(id: string, condition: boolean): void {
  assert(condition, `vector failed: ${id}`);
}

interface InterpreterFixture {
  readonly handle: LinkHandle;
  readonly structure: StructuralInterpreter;
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

const memory = new Memory();
const basis = ensureRootBasis(memory);
const R = basis.R;
const pool = anchors(memory, 24);
let cursor = 0;

function next(label: string): LinkHandle {
  const value = pool[cursor++];
  assert(value !== undefined, `missing fixture: ${label}`);
  return value;
}

// Establish the physical representation boundary before any semantic
// interpreter identity is created. Byte construction uses structural Q
// denotation laws, but it does not select/open an I_Q TypedContext.
const oneBytes = textToUtf8Bytes("1");
vector(
  "v012-string-one-utf8-byte-is-0x31",
  oneBytes.length === 1 && oneBytes[0] === 0x31,
);
const oneCarrier = encodeBytesToQuaternary(oneBytes);
vector(
  "v012-string-one-q-carrier-is-00110001-envelope",
  oneCarrier === "[00110001]",
);
const oneContent = materializeSourceContent(memory, oneBytes);
const oneCanonical = readCanonicalByteSequence(memory, basis, oneContent);
const oneByteLink = oneCanonical.byteLinks[0];
assert(oneByteLink !== undefined, "Byte(0x31) exists");
assert(oneByteLink !== basis.L, "Byte(0x31) must differ from Q abit L");

// Explicit source/dictionary evidence gives the physical glyph a STRING value
// S1. S1 is deliberately distinct from both the byte carrier value and Q L.
const S1 = next("STRING-sign-1");
const grammar = next("STRING-grammar");
const theory = next("STRING-theory");
assert(S1 !== oneByteLink, "dictionary-resolved S1 differs from Byte(0x31)");
assert(S1 !== basis.L, "dictionary-resolved S1 differs from Q abit L");
const oneSource = defineSourceForm(memory, oneContent);
let dictionaryHistory = R;
let dictionary = defineDictionaryScope(memory, R, dictionaryHistory);
const dictionaryEffect = defineDictionaryEffect(
  memory,
  dictionary,
  R,
  dictionaryHistory,
  oneContent,
  S1,
);
dictionaryHistory = dictionaryEffect.historyAfter;
dictionary = dictionaryEffect.afterScope;
const oneEvidence = buildSelectedSourceEvidence(
  memory,
  oneSource,
  [{ start: 0, end: 1, form: S1, dictionaryOccurrence: dictionaryEffect.occurrence }],
  { dictionary, grammar, theory },
);
const resolvedOne = replaySelectedSourceEvidence(memory, oneEvidence);
same(resolvedOne.length, 1, "physical glyph 1 resolves to one STRING form");
same(resolvedOne[0], S1, "physical glyph 1 resolves to S1 through dictionary evidence");

function interpreter(label: string): InterpreterFixture {
  const dictionaryRef = next(`${label}-dictionary`);
  const grammarRef = next(`${label}-grammar`);
  const theoryRef = next(`${label}-theory`);
  const structure: StructuralInterpreter = Object.freeze({
    dictionary: dictionaryRef,
    grammar: grammarRef,
    theory: theoryRef,
  });
  return Object.freeze({
    handle: defineStructuralInterpreter(memory, dictionaryRef, grammarRef, theoryRef),
    structure,
  });
}

const rootI = interpreter("root");
const formalI = interpreter("formal");
const stringI = interpreter("string");
const qI = interpreter("q");
assert(rootI.handle !== formalI.handle, "I_ROOT differs from I_FORMAL");
assert(formalI.handle !== stringI.handle, "I_FORMAL differs from I_STRING");
assert(stringI.handle !== qI.handle, "I_STRING differs from I_Q");

function interpretQ(source: string): LinkHandle {
  let offset = 0;
  const rootParent: TypedContext = defineTypedContext(memory, rootI.handle, R, R);

  function parse(
    parentBefore: TypedContext,
    expectedParentInterpreter: StructuralInterpreter,
    nested: boolean,
  ): LinkHandle {
    let current = openQuaternaryContext(
      memory,
      parentBefore,
      expectedParentInterpreter,
      qI.handle,
    );
    same(current.interpreter, qI.handle, "Q context is explicitly I_Q");

    while (offset < source.length) {
      const token = source[offset];
      if (token === "]") {
        assert(nested, `unexpected ] at ${offset}`);
        offset += 1;
        const state = readContext(memory, current.context).current;
        const result = closeQuaternaryState(memory, state);
        return replayQuaternaryClose(
          memory,
          current,
          qI.structure,
          parentBefore,
          expectedParentInterpreter,
          result,
        );
      }
      if (token === "[") {
        offset += 1;
        const childResult = parse(current, qI.structure, true);
        current = continueQuaternaryContext(memory, current, qI.structure, childResult);
        continue;
      }
      if (token === "1" || token === "0") {
        offset += 1;
        current = continueQuaternaryContext(
          memory,
          current,
          qI.structure,
          token === "1" ? basis.L : basis.U,
        );
        continue;
      }
      throw new Error(`v0.12 C5 test driver received non-Q token ${String(token)}`);
    }

    assert(!nested, "unclosed [ in Q test source");
    const state = readContext(memory, current.context).current;
    return finalizeQuaternaryState(memory, state);
  }

  const result = parse(rootParent, rootI.structure, false);
  same(offset, source.length, `consumed Q source ${JSON.stringify(source)}`);
  return result;
}

const LU = memory.ensure(basis.L, basis.U);
const rootedLU = memory.ensure(R, LU);
const doubleRootedLU = memory.ensure(R, rootedLU);
const qVectors: readonly (readonly [string, string, LinkHandle])[] = Object.freeze([
  ["v012-q-empty", "", R],
  ["v012-q-empty-nested-context", "[]", R],
  ["v012-q-one-abit", "1", basis.L],
  ["v012-q-zero-abit", "0", basis.U],
  ["v012-q-one-zero-sequence", "10", LU],
  ["v012-q-nested-one-zero", "[10]", rootedLU],
  ["v012-q-double-nested-one-zero", "[[10]]", doubleRootedLU],
]);
for (const [id, source, expected] of qVectors) {
  same(interpretQ(source), expected, id);
}

const qAlphabet: readonly Abit[] = ["[", "]", "1", "0"];
vector(
  "v012-q-alphabet-remains-four-abits",
  qAlphabet.length === 4 && new Set(qAlphabet).size === 4,
);
for (const abit of qAlphabet) {
  same(normalizeRawForm(parseRawQuaternary(abit)), abit, `raw Q admits ${abit}`);
}
try {
  parseRawQuaternary("a");
  throw new Error("expected raw Q non-abit rejection");
} catch (error) {
  assert(error instanceof QuaternaryDecodeError, `expected QuaternaryDecodeError, got ${String(error)}`);
  same(error.code, "non-abit", "raw Q rejection code");
  same(error.symbol, "a", "raw Q rejected symbol");
  vector("v012-q-rejects-non-q-glyph", true);
}

const qOne = interpretQ("1");
same(qOne, basis.L, "explicit Q interpretation of physical glyph 1 is L");
const explicitByteQ = interpretQ(oneCarrier);
same(explicitByteQ, oneByteLink, "explicit Q interpretation of [00110001] denotes Byte(0x31)");
vector(
  "v012-representation-is-not-interpretation",
  oneByteLink !== qOne,
);
vector(
  "v012-representation-does-not-invoke-q-interpretation",
  oneByteLink !== qOne && explicitByteQ === oneByteLink,
);
vector(
  "v012-same-glyph-one-has-distinct-string-and-q-role",
  S1 !== qOne,
);
vector(
  "v012-string-glyph-one-is-not-q-abit-one",
  S1 !== basis.L,
);

// Critical cross-layer witness: FORMAL [1] consumes the dictionary-resolved
// STRING sign S1, not Byte(0x31) and not Q abit L.
{
  const parent = defineTypedContext(memory, rootI.handle, R, R);
  let formal = openFormalContext(memory, parent, rootI.structure, formalI.handle);
  let child = openFormalSquareBracketContext(
    memory,
    formal,
    formalI.structure,
    stringI.handle,
  );
  same(child.interpreter, stringI.handle, "FORMAL [1] selects I_STRING");
  assert(child.interpreter !== qI.handle, "FORMAL [1] must not select I_Q");

  const [resolved] = replaySelectedSourceEvidence(memory, oneEvidence);
  same(resolved, S1, "FORMAL [1] source resolves to S1 before STRING continuation");
  child = continueStringSign(memory, child, stringI.structure, S1);
  const result = replayStringClose(
    memory,
    child,
    stringI.structure,
    formal,
    formalI.structure,
  );
  same(result, S1, "FORMAL [1] STRING close returns S1");
  assert(result !== oneByteLink, "FORMAL [1] result is not Byte(0x31)");
  assert(result !== basis.L, "FORMAL [1] result is not Q abit L");

  formal = continueFormalContext(memory, formal, formalI.structure, result);
  const values = readExactSequence(memory, readContext(memory, formal.context).current).values;
  vector(
    "v012-formal-square-one-uses-string-character-semantics",
    values.length === 1 && values[0] === S1,
  );
}

console.log("MTS v0.12 C5 Q compatibility + representation separation: GREEN.");
