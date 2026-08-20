import { defineContext, readContext, StateError } from "../src/state.js";
import {
  defineDictionaryScope,
  readDictionaryScope,
  DictionaryError,
} from "../src/dictionary.js";
import {
  defineSourceForm,
  readSourceForm,
  SourceError,
} from "../src/source.js";
import {
  defineActHeader,
  readActHeader,
  StructuralReadError,
} from "../src/structural-readers.js";
import {
  defineStructuralRoleDictionary,
  readStructuralRoleDictionary,
  StructuralRuleError,
} from "../src/structural-rule.js";
import { readExactSequence } from "../src/exact-sequence.js";
import { Memory } from "../src/memory.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

function reject<T extends Error>(
  effect: () => unknown,
  ctor: new (...args: never[]) => T,
  code: string,
  message: string,
): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof ctor, `${message}: unexpected error ${String(error)}`);
    same((error as T & { readonly code?: string }).code, code, `${message}: error code`);
    return;
  }
  throw new Error(`${message}: expected rejection`);
}

const memory = new Memory();
const R = memory.root;
const O = memory.ensureStartSelfClosed(R);

// F2/F3 distinguish ROOT from START(R). Higher-level roles do not create
// semantic copies: with payload R all canonical START wrappers are the same O.
const source = defineSourceForm(memory, R);
const act = defineActHeader(memory, R, R, R);
const roleDictionary = defineStructuralRoleDictionary(memory, []);
const context = defineContext(memory, R, R);
const dictionary = defineDictionaryScope(memory, R, R);

same(source, O, "empty SourceForm is START(R)=O");
same(act, O, "degenerate Act header is START(R)=O");
same(roleDictionary, O, "empty DR is START(R)=O");
same(context, O, "root-state context is START(R)=O");
same(dictionary, O, "empty dictionary scope is START(R)=O");

// The selected use-role determines how the same semantic O is read.
same(readSourceForm(memory, O), R, "O reads as SourceForm(R) in source role");
const header = readActHeader(memory, O);
same(header.interpreter, R, "O Act interpreter");
same(header.roleDictionary, R, "O Act role dictionary");
same(header.afterContext, R, "O Act after context");
const dr = readStructuralRoleDictionary(memory, O);
same(dr.roleSequence, R, "O empty DR role sequence");
same(dr.roles.length, 0, "O empty DR has no roles");
const k = readContext(memory, O);
same(k.parent, R, "O context parent");
same(k.current, R, "O context current");
const scope = readDictionaryScope(memory, O);
same(scope.parentScope, R, "O dictionary parent");
same(scope.localHistory, R, "O dictionary history");

// ROOT itself remains the intentional empty ExactSequence carrier, but it is
// not an alias for any role whose canonical topology is START(payload).
same(readExactSequence(memory, R).values.length, 0, "R remains empty ExactSequence");

reject(() => readSourceForm(memory, R), SourceError, "invalid-source",
  "ROOT must not masquerade as SourceForm");
reject(() => readActHeader(memory, R), StructuralReadError, "invalid-act-header",
  "ROOT must not masquerade as Act");
reject(() => readStructuralRoleDictionary(memory, R), StructuralRuleError, "invalid-role-dictionary",
  "ROOT must not masquerade as DR");
reject(() => readContext(memory, R), StateError, "invalid-context",
  "ROOT must not masquerade as context");
reject(() => readDictionaryScope(memory, R), DictionaryError, "invalid-scope",
  "ROOT must not masquerade as dictionary scope");

// Every valid wrapper round-trips through its role-specific reader/constructor.
same(defineSourceForm(memory, readSourceForm(memory, O)), O,
  "SourceForm decode/encode round-trip");
same(defineActHeader(memory, header.interpreter, header.roleDictionary, header.afterContext), O,
  "Act decode/encode round-trip");
same(defineStructuralRoleDictionary(memory, dr.roles), O,
  "DR decode/encode round-trip");
same(defineContext(memory, k.parent, k.current), O,
  "context decode/encode round-trip");
same(defineDictionaryScope(memory, scope.parentScope, scope.localHistory), O,
  "dictionary decode/encode round-trip");
