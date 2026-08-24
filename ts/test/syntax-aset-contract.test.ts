import { materializeExactSequence } from "../src/exact-sequence.js";
import {
  Memory,
  type LinkHandle,
  type LinkPoles,
  type ReadMemory,
} from "../src/memory.js";
import {
  SyntaxAsetBuilder,
  SyntaxAsetContractError,
  readSyntaxAset,
  type SyntaxAsetVocabulary,
} from "../src/syntax-aset-contract.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

function rejectContract(effect: () => unknown, code: SyntaxAsetContractError["code"]): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof SyntaxAsetContractError, `expected SyntaxAsetContractError, got ${String(error)}`);
    const contractError = error as SyntaxAsetContractError;
    same(contractError.code, code, "SyntaxAset error code");
    return;
  }
  throw new Error(`expected SyntaxAset rejection: ${code}`);
}

function refFactory(memory: Memory): () => LinkHandle {
  const seed = memory.ensureEndSelfClosed(memory.root);
  let tag = memory.ensureStartSelfClosed(memory.root);
  return () => {
    tag = memory.ensureStartSelfClosed(tag);
    return memory.ensure(seed, tag);
  };
}

interface Fixture {
  readonly memory: Memory;
  readonly vocabulary: SyntaxAsetVocabulary;
  readonly leafKind: LinkHandle;
  readonly linkKind: LinkHandle;
  readonly definitionKind: LinkHandle;
  readonly sequenceKind: LinkHandle;
  readonly carrierRole: LinkHandle;
  readonly startRole: LinkHandle;
  readonly endRole: LinkHandle;
  readonly nameRole: LinkHandle;
  readonly bodyRole: LinkHandle;
  readonly itemRole: LinkHandle;
  readonly carrierX: LinkHandle;
  readonly carrierName: LinkHandle;
}

function fixture(): Fixture {
  const memory = new Memory();
  const next = refFactory(memory);
  const syntaxTag = next();
  const carrierRole = next();
  const startRole = next();
  const endRole = next();
  const nameRole = next();
  const bodyRole = next();
  const itemRole = next();
  const vocabulary: SyntaxAsetVocabulary = Object.freeze({
    tag: syntaxTag,
    childRoles: Object.freeze([startRole, endRole, bodyRole, itemRole]),
  });
  return Object.freeze({
    memory,
    vocabulary,
    leafKind: next(),
    linkKind: next(),
    definitionKind: next(),
    sequenceKind: next(),
    carrierRole,
    startRole,
    endRole,
    nameRole,
    bodyRole,
    itemRole,
    carrierX: next(),
    carrierName: next(),
  });
}

class ReadProbe implements ReadMemory {
  polesCalls = 0;

  constructor(private readonly source: ReadMemory) {}

  get root(): LinkHandle { return this.source.root; }
  get linkCount(): number { return this.source.linkCount; }
  poles(link: LinkHandle): LinkPoles {
    this.polesCalls += 1;
    return this.source.poles(link);
  }
  find(start: LinkHandle, end: LinkHandle): LinkHandle | undefined { return this.source.find(start, end); }
  outgoing(start: LinkHandle): readonly LinkHandle[] { return this.source.outgoing(start); }
  incoming(end: LinkHandle): readonly LinkHandle[] { return this.source.incoming(end); }
}

function appendOccurrenceCell(memory: Memory, previous: LinkHandle, descriptor: LinkHandle): LinkHandle {
  return memory.ensureStartSelfClosed(memory.ensure(previous, descriptor));
}

function wrapSyntaxAset(
  memory: Memory,
  tag: LinkHandle,
  occurrenceOrder: LinkHandle,
  rootOccurrence: LinkHandle,
): LinkHandle {
  return memory.ensure(tag, memory.ensure(occurrenceOrder, rootOccurrence));
}

// Equal syntax descriptors remain distinct occurrences because occurrence identity
// is the structural ExactSequence Cell, never descriptor identity or host index.
{
  const f = fixture();
  const builder = new SyntaxAsetBuilder(f.memory, f.vocabulary);
  const first = builder.addOccurrence(f.leafKind, [
    { role: f.carrierRole, value: f.carrierX },
  ]);
  const second = builder.addOccurrence(f.leafKind, [
    { role: f.carrierRole, value: f.carrierX },
  ]);
  assert(first !== second, "equal-looking leaves must have distinct occurrence Links");

  const pair = builder.addOccurrence(f.linkKind, [
    { role: f.startRole, value: first },
    { role: f.endRole, value: second },
  ]);
  const aset = builder.finish(pair);
  const read = readSyntaxAset(f.memory, aset, f.vocabulary);
  same(read.root, pair, "declared root is the final occurrence");
  same(read.occurrences.length, 3, "three occurrences are preserved");
  same(read.occurrences[0]?.occurrence, first, "first duplicate occurrence retained");
  same(read.occurrences[1]?.occurrence, second, "second duplicate occurrence retained");
  same(read.occurrences[2]?.fields[0]?.value, first, "Link start role targets first occurrence");
  same(read.occurrences[2]?.fields[1]?.value, second, "Link end role targets second occurrence");
}

// Nested syntax and repeated ordered fields use explicit structural roles.
{
  const f = fixture();
  const builder = new SyntaxAsetBuilder(f.memory, f.vocabulary);
  const value = builder.addOccurrence(f.leafKind, [
    { role: f.carrierRole, value: f.carrierX },
  ]);
  const sequence = builder.addOccurrence(f.sequenceKind, [
    { role: f.itemRole, value },
    { role: f.itemRole, value },
  ]);
  const definition = builder.addOccurrence(f.definitionKind, [
    { role: f.nameRole, value: f.carrierName },
    { role: f.bodyRole, value: sequence },
  ]);
  const aset = builder.finish(definition);
  const read = readSyntaxAset(f.memory, aset, f.vocabulary);
  const sequenceRead = read.occurrences[1];
  const definitionRead = read.occurrences[2];
  assert(sequenceRead !== undefined && definitionRead !== undefined, "nested occurrences exist");
  same(sequenceRead.fields.length, 2, "repeated sequence positions remain explicit");
  same(sequenceRead.fields[0]?.role, f.itemRole, "first item role retained");
  same(sequenceRead.fields[1]?.role, f.itemRole, "second item role retained");
  same(sequenceRead.fields[0]?.value, value, "first repeated value retained");
  same(sequenceRead.fields[1]?.value, value, "second repeated value retained");
  same(definitionRead.fields[0]?.role, f.nameRole, "definition name role is structural");
  same(definitionRead.fields[0]?.value, f.carrierName, "definition name carrier retained");
  same(definitionRead.fields[1]?.role, f.bodyRole, "definition body role is structural");
  same(definitionRead.fields[1]?.value, sequence, "definition body targets occurrence");
}

// Provenance is external metadata: changing it cannot change SyntaxAset topology.
{
  const f = fixture();
  const builder = new SyntaxAsetBuilder(f.memory, f.vocabulary);
  const leaf = builder.addOccurrence(f.leafKind, [
    { role: f.carrierRole, value: f.carrierX },
  ]);
  const aset = builder.finish(leaf);
  const provenanceA = new Map([[leaf, Object.freeze({ source: "a.mts", start: 0, end: 1 })]]);
  const provenanceB = new Map([[leaf, Object.freeze({ source: "b.mts", start: 90, end: 120 })]]);
  assert(provenanceA.get(leaf)?.source !== provenanceB.get(leaf)?.source, "fixture provenance differs");
  same(readSyntaxAset(f.memory, aset, f.vocabulary).root, leaf, "topology ignores provenance A");
  same(readSyntaxAset(f.memory, aset, f.vocabulary).root, leaf, "topology ignores provenance B");
}

// Reading is deterministic and read-only through ReadMemory only.
{
  const f = fixture();
  const builder = new SyntaxAsetBuilder(f.memory, f.vocabulary);
  const leaf = builder.addOccurrence(f.leafKind, []);
  const aset = builder.finish(leaf);
  const before = f.memory.linkCount;
  const probe = new ReadProbe(f.memory);
  const first = readSyntaxAset(probe, aset, f.vocabulary);
  const second = readSyntaxAset(probe, aset, f.vocabulary);
  same(f.memory.linkCount, before, "SyntaxAset read must not materialize Links");
  same(first.root, second.root, "repeat read root deterministic");
  same(first.occurrences.length, second.occurrences.length, "repeat read occurrence count deterministic");
  assert(probe.polesCalls > 0, "reader inspects structural Links");
}

// A child-bearing role may reference only an already-issued occurrence in this
// builder's post-order sequence; a foreign occurrence cannot become local syntax.
{
  const f = fixture();
  const otherBuilder = new SyntaxAsetBuilder(f.memory, f.vocabulary);
  const foreign = otherBuilder.addOccurrence(f.leafKind, []);
  otherBuilder.finish(foreign);
  const builder = new SyntaxAsetBuilder(f.memory, f.vocabulary);
  rejectContract(
    () => builder.addOccurrence(f.linkKind, [{ role: f.startRole, value: foreign }]),
    "invalid-child-occurrence",
  );
}

// Reader rejects a child reference that is not a prior occurrence of this Aset.
{
  const f = fixture();
  const foreignBuilder = new SyntaxAsetBuilder(f.memory, f.vocabulary);
  const foreign = foreignBuilder.addOccurrence(f.leafKind, []);
  foreignBuilder.finish(foreign);

  const field = f.memory.ensure(f.startRole, foreign);
  const fieldSequence = materializeExactSequence(f.memory, [field]);
  const descriptor = f.memory.ensure(f.linkKind, fieldSequence);
  const localOccurrence = appendOccurrenceCell(f.memory, f.memory.root, descriptor);
  const aset = wrapSyntaxAset(f.memory, f.vocabulary.tag, localOccurrence, localOccurrence);
  rejectContract(() => readSyntaxAset(f.memory, aset, f.vocabulary), "invalid-child-occurrence");
}

// Exact-sequence shape is mandatory for descriptor fields.
{
  const f = fixture();
  const notAFieldSequence = f.memory.ensure(f.leafKind, f.carrierX);
  const descriptor = f.memory.ensure(f.leafKind, notAFieldSequence);
  const occurrence = appendOccurrenceCell(f.memory, f.memory.root, descriptor);
  const aset = wrapSyntaxAset(f.memory, f.vocabulary.tag, occurrence, occurrence);
  rejectContract(() => readSyntaxAset(f.memory, aset, f.vocabulary), "invalid-field-sequence");
}

// Exact-sequence shape is mandatory for occurrence order.
{
  const f = fixture();
  const notAnOccurrenceSequence = f.memory.ensure(f.leafKind, f.carrierX);
  const fakeRoot = f.memory.ensureStartSelfClosed(f.carrierX);
  const aset = wrapSyntaxAset(f.memory, f.vocabulary.tag, notAnOccurrenceSequence, fakeRoot);
  rejectContract(() => readSyntaxAset(f.memory, aset, f.vocabulary), "invalid-occurrence-sequence");
}

// The explicit root in the header must be the final structural occurrence Cell.
{
  const f = fixture();
  const descriptor = f.memory.ensure(f.leafKind, materializeExactSequence(f.memory, []));
  const first = appendOccurrenceCell(f.memory, f.memory.root, descriptor);
  const second = appendOccurrenceCell(f.memory, first, descriptor);
  const aset = wrapSyntaxAset(f.memory, f.vocabulary.tag, second, first);
  rejectContract(() => readSyntaxAset(f.memory, aset, f.vocabulary), "root-not-final");
}

// Syntax tag and Link ownership are checked structurally, not by scalar IDs.
{
  const f = fixture();
  const builder = new SyntaxAsetBuilder(f.memory, f.vocabulary);
  const leaf = builder.addOccurrence(f.leafKind, []);
  const aset = builder.finish(leaf);
  const wrongVocabulary: SyntaxAsetVocabulary = Object.freeze({
    tag: f.carrierX,
    childRoles: f.vocabulary.childRoles,
  });
  rejectContract(() => readSyntaxAset(f.memory, aset, wrongVocabulary), "invalid-aset");

  const foreignMemory = new Memory();
  rejectContract(() => readSyntaxAset(f.memory, foreignMemory.root, f.vocabulary), "invalid-aset");
  rejectContract(
    () => readSyntaxAset(f.memory, 7 as unknown as LinkHandle, f.vocabulary),
    "invalid-aset",
  );
}
