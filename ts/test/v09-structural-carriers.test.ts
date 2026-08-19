import {
  type Abit,
  executeAbits,
  type StackAlgebra,
  StreamError,
} from "../src/anum.js";
import {
  ExactSequenceError,
  materializeExactSequence,
  readExactSequence,
} from "../src/exact-sequence.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type LinkPoles,
  type ReadMemory,
} from "../src/memory.js";
import {
  appendQuaternaryValue,
  closeQuaternaryState,
  finalizeQuaternaryState,
  QuaternaryStateError,
  readQuaternaryState,
} from "../src/quaternary-state.js";

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
  for (let index = 0; index < actual.length; index += 1) {
    same(actual[index], expected[index], `${message}[${index}]`);
  }
}

class PolesOnlyProbe implements ReadMemory {
  constructor(private readonly source: ReadMemory) {}
  get root(): LinkHandle { return this.source.root; }
  get linkCount(): number { return this.source.linkCount; }
  poles(link: LinkHandle): LinkPoles { return this.source.poles(link); }
  find(): LinkHandle | undefined { throw new Error("exact read must not use find"); }
  outgoing(): readonly LinkHandle[] { throw new Error("exact read must not use outgoing"); }
  incoming(): readonly LinkHandle[] { throw new Error("exact read must not use incoming"); }
}

function expectExactSequenceError(effect: () => unknown): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof ExactSequenceError, `expected ExactSequenceError, got ${String(error)}`);
    same(error.code, "not-exact-sequence", "exact-sequence error code");
    return;
  }
  throw new Error("expected not-exact-sequence");
}

function expectQuaternaryStateError(effect: () => unknown): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof QuaternaryStateError, `expected QuaternaryStateError, got ${String(error)}`);
    same(error.code, "invalid-quaternary-state", "Q-state error code");
    return;
  }
  throw new Error("expected invalid-quaternary-state");
}

// Exact-sequence carrier: R is a legal value and therefore must not disappear.
{
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  const vectors: readonly (readonly LinkHandle[])[] = [
    [],
    [basis.R],
    [basis.L],
    [basis.U],
    [basis.R, basis.L],
    [basis.L, basis.R],
    [basis.R, basis.R],
    [basis.L, basis.L],
    [basis.R, basis.L, basis.R],
  ];

  const carriers = vectors.map((values) => materializeExactSequence(memory, values));
  same(carriers[0], basis.R, "empty exact sequence is root");
  assert(carriers[1] !== basis.R, "single root position must differ from empty sequence");
  assert(carriers[4] !== carriers[2], "leading root position must not disappear");
  assert(new Set(carriers).size === carriers.length, "mandatory exact-sequence vectors must have distinct carriers");

  for (let index = 0; index < vectors.length; index += 1) {
    const carrier = carriers[index]!;
    const expected = vectors[index]!;
    const before = memory.linkCount;
    const decoded = readExactSequence(new PolesOnlyProbe(memory), carrier);
    sameHandles(decoded.values, expected, `exact vector ${index}`);
    same(memory.linkCount, before, `exact vector ${index} read-only`);
    same(materializeExactSequence(memory, expected), carrier, `exact vector ${index} canonical reuse`);
  }

  expectExactSequenceError(() => readExactSequence(memory, basis.L));
  const foreign = new Memory();
  expectExactSequenceError(() => readExactSequence(memory, foreign.root));
}

// Exhaustive small machine metacheck: no exact-sequence collisions and exact inverse.
{
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  const alphabet = [basis.R, basis.O, basis.C, basis.L, basis.U] as const;
  const carriers = new Set<LinkHandle>();
  let checked = 0;

  function visit(prefix: readonly LinkHandle[], remaining: number): void {
    const carrier = materializeExactSequence(memory, prefix);
    const decoded = readExactSequence(memory, carrier);
    sameHandles(decoded.values, prefix, `exhaustive exact sequence ${checked}`);
    carriers.add(carrier);
    checked += 1;
    if (remaining === 0) return;
    for (const value of alphabet) visit([...prefix, value], remaining - 1);
  }

  visit([], 4);
  same(checked, 781, "exact exhaustive sequence count");
  same(carriers.size, checked, "exact exhaustive carrier count");
}

// Q state: the empty/nonempty distinction is a Link form, not semantic host state.
{
  const memory = new Memory();
  const basis = ensureRootBasis(memory);

  const empty = readQuaternaryState(memory, basis.R);
  assert(!empty.started, "root must be empty Q state");

  const oneRoot = appendQuaternaryValue(memory, basis.R, basis.R);
  same(oneRoot, basis.O, "nonempty Q state carrying R reuses canonical O form");
  const readRoot = readQuaternaryState(memory, oneRoot);
  assert(readRoot.started, "Q state carrying R must be nonempty");
  same(readRoot.current, basis.R, "Q state carrying R payload");
  same(finalizeQuaternaryState(memory, oneRoot), basis.R, "top-level nonempty R finalizes to R");
  same(closeQuaternaryState(memory, oneRoot), basis.R, "group containing semantic R closes to R");

  const one = appendQuaternaryValue(memory, basis.R, basis.L);
  const oneZero = appendQuaternaryValue(memory, one, basis.U);
  const current = readQuaternaryState(memory, oneZero);
  assert(current.started, "1/0 Q state must be nonempty");
  same(current.current, memory.ensure(basis.L, basis.U), "1/0 accumulator");

  const before = memory.linkCount;
  finalizeQuaternaryState(new PolesOnlyProbe(memory), oneZero);
  same(memory.linkCount, before, "Q finalize read-only");

  expectQuaternaryStateError(() => readQuaternaryState(memory, basis.L));
  const foreign = new Memory();
  expectQuaternaryStateError(() => readQuaternaryState(memory, foreign.root));
}

function currentQ(
  memory: Memory,
  basis: ReturnType<typeof ensureRootBasis>,
  source: string,
): LinkHandle {
  const algebra: StackAlgebra<LinkHandle> = Object.freeze({
    root: basis.R,
    linked: basis.L,
    unlinked: basis.U,
    link: (start, end) => memory.ensure(start, end),
  });
  return executeAbits(source as Iterable<Abit>, algebra).denotation;
}

function structuralQ(
  memory: Memory,
  basis: ReturnType<typeof ensureRootBasis>,
  source: string,
): LinkHandle {
  const frames: LinkHandle[] = [basis.R];

  for (const abit of source as Iterable<Abit>) {
    if (abit === "[") {
      frames.push(basis.R);
      continue;
    }
    if (abit === "]") {
      if (frames.length === 1) throw new StreamError("unexpected-close");
      const inner = frames.pop();
      const parent = frames.at(-1);
      if (inner === undefined || parent === undefined) throw new Error("structural Q frame invariant");
      frames[frames.length - 1] = appendQuaternaryValue(memory, parent, closeQuaternaryState(memory, inner));
      continue;
    }

    const parent = frames.at(-1);
    if (parent === undefined) throw new Error("structural Q frame invariant");
    const value = abit === "1" ? basis.L : basis.U;
    frames[frames.length - 1] = appendQuaternaryValue(memory, parent, value);
  }

  if (frames.length !== 1) throw new StreamError("unclosed-open");
  return finalizeQuaternaryState(memory, frames[0]!);
}

function outcome(effect: () => LinkHandle): { readonly ok: true; readonly value: LinkHandle } | { readonly ok: false; readonly code: string } {
  try {
    return { ok: true, value: effect() };
  } catch (error) {
    if (error instanceof StreamError) return { ok: false, code: error.code };
    throw error;
  }
}

// Differential candidate gate: structural Q state must reproduce accepted Q behavior.
{
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  const alphabet = ["[", "]", "1", "0"] as const;
  let checked = 0;

  function compare(source: string): void {
    const accepted = outcome(() => currentQ(memory, basis, source));
    const candidate = outcome(() => structuralQ(memory, basis, source));
    same(candidate.ok, accepted.ok, `Q accept/reject ${JSON.stringify(source)}`);
    if (accepted.ok && candidate.ok) {
      same(candidate.value, accepted.value, `Q denotation ${JSON.stringify(source)}`);
    } else if (!accepted.ok && !candidate.ok) {
      same(candidate.code, accepted.code, `Q error ${JSON.stringify(source)}`);
    }
    checked += 1;
  }

  function visit(prefix: string, remaining: number): void {
    compare(prefix);
    if (remaining === 0) return;
    for (const abit of alphabet) visit(prefix + abit, remaining - 1);
  }

  visit("", 7);
  same(checked, 21845, "Q differential corpus size");
}
