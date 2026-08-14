import {
  StructuralReadError,
  readActHeader,
  readOptionalMany,
  readRequiredSingle,
  verifyHeader,
} from "../src/structural-readers.js";
import {
  Memory,
  type LinkHandle,
  type LinkPoles,
  type ReadMemory,
} from "../src/memory.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertSame<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  assert(
    JSON.stringify(actual) === JSON.stringify(expected),
    `${message}: ${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`,
  );
}

function expectStructuralError(
  effect: () => unknown,
  code: StructuralReadError["code"],
): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof StructuralReadError, `expected StructuralReadError, got ${String(error)}`);
    assertSame(error.code, code, "structural error code");
    return;
  }
  throw new Error(`expected StructuralReadError(${code})`);
}

function nextAnchor(memory: Memory, previous: LinkHandle): LinkHandle {
  return memory.ensureStartSelfClosed(previous);
}

function anchors(memory: Memory, count: number): LinkHandle[] {
  const result: LinkHandle[] = [];
  let current = memory.root;
  for (let index = 0; index < count; index += 1) {
    current = nextAnchor(memory, current);
    result.push(current);
  }
  return result;
}

function defineActHeader(
  memory: Memory,
  interpreter: LinkHandle,
  roleDictionary: LinkHandle,
  afterContext: LinkHandle,
): LinkHandle {
  const roleAndContext = memory.ensure(roleDictionary, afterContext);
  const header = memory.ensure(interpreter, roleAndContext);
  return memory.ensureStartSelfClosed(header);
}

function defineActField(
  memory: Memory,
  act: LinkHandle,
  role: LinkHandle,
  value: LinkHandle,
): LinkHandle {
  const field = memory.ensure(role, value);
  return memory.ensure(act, field);
}

class IndexedReadProbe implements ReadMemory {
  outgoingCalls = 0;

  constructor(private readonly source: ReadMemory) {}

  get root(): LinkHandle {
    return this.source.root;
  }

  get linkCount(): number {
    return this.source.linkCount;
  }

  poles(link: LinkHandle): LinkPoles {
    return this.source.poles(link);
  }

  find(): LinkHandle | undefined {
    throw new Error("structural reader must not use pair search");
  }

  outgoing(start: LinkHandle): readonly LinkHandle[] {
    this.outgoingCalls += 1;
    return this.source.outgoing(start);
  }

  incoming(): readonly LinkHandle[] {
    throw new Error("structural reader must not use incoming scan");
  }
}

const memory = new Memory();
const [
  interpreter,
  roleDictionary,
  afterContext,
  roleSource,
  roleTheory,
  roleMany,
  source,
  theory,
  valueOne,
  valueTwo,
  mismatch,
] = anchors(memory, 11);

assert(
  interpreter !== undefined &&
  roleDictionary !== undefined &&
  afterContext !== undefined &&
  roleSource !== undefined &&
  roleTheory !== undefined &&
  roleMany !== undefined &&
  source !== undefined &&
  theory !== undefined &&
  valueOne !== undefined &&
  valueTwo !== undefined &&
  mismatch !== undefined,
  "fixture anchors must exist",
);

const act = defineActHeader(memory, interpreter, roleDictionary, afterContext);
defineActField(memory, act, roleSource, source);
defineActField(memory, act, roleTheory, theory);
defineActField(memory, act, roleMany, valueOne);
defineActField(memory, act, roleMany, valueTwo);

// Repeating the same semantic attachment does not manufacture another field.
const repeatedOne = defineActField(memory, act, roleSource, source);
const repeatedTwo = defineActField(memory, act, roleSource, source);
assertSame(repeatedOne, repeatedTwo, "same act/role/value attachment must be canonical");

// Add unrelated topology to prove role reads are local to indexed outgoing(A).
let noise = mismatch;
for (let index = 0; index < 40; index += 1) {
  noise = memory.ensureStartSelfClosed(noise);
}
const beforeReads = memory.linkCount;

const header = readActHeader(memory, act);
assertSame(header.interpreter, interpreter, "act interpreter");
assertSame(header.roleDictionary, roleDictionary, "act role dictionary");
assertSame(header.afterContext, afterContext, "act after-context");
verifyHeader(memory, act, { interpreter, roleDictionary, afterContext });
expectStructuralError(
  () => verifyHeader(memory, act, { interpreter: mismatch, roleDictionary, afterContext }),
  "act-header-mismatch",
);

const probe = new IndexedReadProbe(memory);
assertDeepEqual(readOptionalMany(probe, act, roleSource), [source], "one role value");
assertSame(probe.outgoingCalls, 1, "role lookup must use indexed outgoing(act) once");
assertDeepEqual(readOptionalMany(memory, act, roleTheory), [theory], "second role value");
assertDeepEqual(readOptionalMany(memory, act, mismatch), [], "missing optional role");
assertDeepEqual(
  readOptionalMany(memory, act, roleMany),
  [valueOne, valueTwo],
  "distinct values remain structurally visible",
);

assertSame(readRequiredSingle(memory, act, roleSource), source, "required single role");
expectStructuralError(
  () => readRequiredSingle(memory, act, mismatch),
  "missing-required-field",
);
expectStructuralError(
  () => readRequiredSingle(memory, act, roleMany),
  "multiple-field-values",
);

const ordinary = memory.ensure(interpreter, theory);
expectStructuralError(() => readActHeader(memory, ordinary), "invalid-act-header");

assertSame(memory.linkCount, beforeReads + 1, "only explicit fixture construction may add a link");
const afterOrdinaryConstruction = memory.linkCount;
readActHeader(memory, act);
readOptionalMany(memory, act, roleSource);
readRequiredSingle(memory, act, roleTheory);
verifyHeader(memory, act, { interpreter, roleDictionary, afterContext });
assertSame(memory.linkCount, afterOrdinaryConstruction, "structural readers must be read-only");
