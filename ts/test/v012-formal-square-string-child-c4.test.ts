import {
  continueFormalContext,
  continueStringSign,
  defineTypedContext,
  openFormalContext,
  openFormalSquareBracketContext,
  replayStringClose,
  type TypedContext,
} from "../src/context-integration.js";
import {
  materializeExactSequence,
  readExactSequence,
} from "../src/exact-sequence.js";
import {
  Memory,
  type LinkHandle,
} from "../src/memory.js";
import { readContext } from "../src/state.js";
import {
  defineStructuralInterpreter,
  type StructuralInterpreter,
} from "../src/structural-rule.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.12 FORMAL[]->STRING C4: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
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
const R = memory.root;
const pool = anchors(memory, 20);
let cursor = 0;

function next(label: string): LinkHandle {
  const value = pool[cursor++];
  assert(value !== undefined, `missing fixture: ${label}`);
  return value;
}

function interpreter(label: string): InterpreterFixture {
  const dictionary = next(`${label}-dictionary`);
  const grammar = next(`${label}-grammar`);
  const theory = next(`${label}-theory`);
  const structure: StructuralInterpreter = Object.freeze({ dictionary, grammar, theory });
  return Object.freeze({
    handle: defineStructuralInterpreter(memory, dictionary, grammar, theory),
    structure,
  });
}

function parentContext(owner: InterpreterFixture, marker: LinkHandle): TypedContext {
  return defineTypedContext(
    memory,
    owner.handle,
    R,
    materializeExactSequence(memory, [marker]),
  );
}

const rootI = interpreter("root");
const formalI = interpreter("formal");
const stringI = interpreter("string");
const qI = interpreter("q");

assert(rootI.handle !== formalI.handle, "I_ROOT and I_FORMAL differ structurally");
assert(formalI.handle !== stringI.handle, "I_FORMAL and I_STRING differ structurally");
assert(stringI.handle !== qI.handle, "I_STRING and I_Q differ structurally");

const a = next("sign-a");
const b = next("sign-b");
const tail = next("formal-tail");
const A = memory.ensure(a, b);

// Empty FORMAL square-bracket child must be explicitly I_STRING from R and
// return R as one exact FORMAL position rather than collapse FORMAL to empty.
{
  const parent = parentContext(rootI, next("empty-parent"));
  let formal = openFormalContext(memory, parent, rootI.structure, formalI.handle);
  const child = openFormalSquareBracketContext(
    memory,
    formal,
    formalI.structure,
    stringI.handle,
  );

  same(child.interpreter, stringI.handle, "FORMAL [ selects I_STRING child");
  assert(child.interpreter !== qI.handle, "FORMAL [ must not select I_Q child");

  const childState = readContext(memory, child.context);
  same(childState.parent, formal.context, "STRING child has exact FORMAL lexical parent");
  same(childState.current, R, "STRING child starts from R");

  const beforeClose = memory.linkCount;
  const result = replayStringClose(
    memory,
    child,
    stringI.structure,
    formal,
    formalI.structure,
  );
  same(result, R, "empty STRING child closes to R");
  same(memory.linkCount, beforeClose, "STRING close is read-only");

  formal = continueFormalContext(memory, formal, formalI.structure, result);
  const values = readExactSequence(memory, readContext(memory, formal.context).current).values;
  same(values.length, 1, "returned R occupies one FORMAL position");
  same(values[0], R, "returned FORMAL position contains R");
}

// Non-empty FORMAL [ab] executes through STRING and FORMAL then continues
// after the child result as an ordinary exact FORMAL sequence.
{
  const parent = parentContext(rootI, next("nonempty-parent"));
  let formal = openFormalContext(memory, parent, rootI.structure, formalI.handle);
  let child = openFormalSquareBracketContext(
    memory,
    formal,
    formalI.structure,
    stringI.handle,
  );

  child = continueStringSign(memory, child, stringI.structure, a);
  child = continueStringSign(memory, child, stringI.structure, b);

  const beforeClose = memory.linkCount;
  const result = replayStringClose(
    memory,
    child,
    stringI.structure,
    formal,
    formalI.structure,
  );
  same(result, A, "FORMAL [ab] returns STRING value a ⟼ b");
  same(memory.linkCount, beforeClose, "non-empty STRING close is read-only");

  formal = continueFormalContext(memory, formal, formalI.structure, result);
  formal = continueFormalContext(memory, formal, formalI.structure, tail);
  const values = readExactSequence(memory, readContext(memory, formal.context).current).values;
  same(values.length, 2, "FORMAL continues after STRING child result");
  same(values[0], A, "first FORMAL position is returned STRING Link");
  same(values[1], tail, "FORMAL appends later value after STRING child");
}

console.log("MTS v0.12 C4 FORMAL square brackets -> I_STRING child: GREEN.");
