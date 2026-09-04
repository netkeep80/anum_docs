import {
  Memory,
  type LinkHandle,
  type LinkPoles,
  type ReadMemory,
} from "../src/memory.js";
import {
  SyntaxAsetBuilder,
  SyntaxAsetContractError,
  materializeSyntaxAsetVocabulary,
  readSyntaxAset,
  type SyntaxAsetToolingVocabulary,
} from "../src/tooling/syntax-aset.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

function rejectContract(
  effect: () => unknown,
  code: string,
): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof SyntaxAsetContractError, `expected SyntaxAsetContractError, got ${String(error)}`);
    same(String(error.code), code, "SyntaxAset error code");
    return;
  }
  throw new Error(`expected SyntaxAset rejection: ${code}`);
}

function vocabularySeed(memory: Memory): LinkHandle {
  return memory.ensureEndSelfClosed(memory.root);
}

function topology(memory: ReadMemory, root: LinkHandle): string {
  const ids = new Map<LinkHandle, number>([[root, 0]]);
  const queue: LinkHandle[] = [root];
  const records: Array<readonly [number, number]> = [];
  const id = (link: LinkHandle): number => {
    const existing = ids.get(link);
    if (existing !== undefined) return existing;
    const created = ids.size;
    ids.set(link, created);
    queue.push(link);
    return created;
  };
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const link = queue[cursor];
    assert(link !== undefined, "topology queue entry exists");
    const poles = memory.poles(link);
    records.push(Object.freeze([id(poles.start), id(poles.end)]));
  }
  return JSON.stringify(records);
}

function vocabularyFingerprint(
  memory: ReadMemory,
  vocabulary: SyntaxAsetToolingVocabulary,
): string {
  return JSON.stringify({
    tag: topology(memory, vocabulary.tag),
    kinds: Object.fromEntries(
      Object.entries(vocabulary.kinds).map(([name, link]) => [name, topology(memory, link)]),
    ),
    roles: Object.fromEntries(
      Object.entries(vocabulary.roles).map(([name, link]) => [name, topology(memory, link)]),
    ),
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
  find(start: LinkHandle, end: LinkHandle): LinkHandle | undefined {
    return this.source.find(start, end);
  }
  outgoing(start: LinkHandle): readonly LinkHandle[] { return this.source.outgoing(start); }
  incoming(end: LinkHandle): readonly LinkHandle[] { return this.source.incoming(end); }
}

// The explicit caller-owned seed determines vocabulary topology. Equivalent
// memories yield the same structure without comparing allocation indexes.
{
  const firstMemory = new Memory();
  const secondMemory = new Memory();
  const first = materializeSyntaxAsetVocabulary(firstMemory, vocabularySeed(firstMemory));
  const second = materializeSyntaxAsetVocabulary(secondMemory, vocabularySeed(secondMemory));
  same(
    vocabularyFingerprint(firstMemory, first),
    vocabularyFingerprint(secondMemory, second),
    "equivalent vocabulary seeds must yield equivalent topology",
  );

  const before = firstMemory.linkCount;
  const repeated = materializeSyntaxAsetVocabulary(firstMemory, vocabularySeed(firstMemory));
  same(repeated.tag, first.tag, "same seed rematerializes the exact syntax tag");
  same(repeated.kinds.Link, first.kinds.Link, "same seed rematerializes exact kind Links");
  same(repeated.roles.start, first.roles.start, "same seed rematerializes exact role Links");
  same(firstMemory.linkCount, before, "vocabulary rematerialization is idempotent");
}

// Public tooling preserves occurrence identity and explicit structural roles.
{
  const memory = new Memory();
  const vocabulary = materializeSyntaxAsetVocabulary(memory, vocabularySeed(memory));
  const carrier = memory.ensureStartSelfClosed(vocabulary.tag);
  const builder = new SyntaxAsetBuilder(memory, vocabulary);
  const first = builder.addOccurrence(vocabulary.kinds.Literal, [
    { role: vocabulary.roles.value, value: carrier },
  ]);
  const second = builder.addOccurrence(vocabulary.kinds.Literal, [
    { role: vocabulary.roles.value, value: carrier },
  ]);
  assert(first !== second, "equal-looking literals remain distinct occurrences");
  const link = builder.addOccurrence(vocabulary.kinds.Link, [
    { role: vocabulary.roles.start, value: first },
    { role: vocabulary.roles.end, value: second },
  ]);
  const aset = builder.finish(link);
  const read = readSyntaxAset(memory, aset, vocabulary);
  same(read.occurrences[2]?.fields[0]?.value, first, "start role targets first occurrence");
  same(read.occurrences[2]?.fields[1]?.value, second, "end role targets second occurrence");
}

// Ordered containers, definitions, statements and unary forms retain explicit
// structural roles rather than host object properties or array indexes.
{
  const memory = new Memory();
  const vocabulary = materializeSyntaxAsetVocabulary(memory, vocabularySeed(memory));
  const valueCarrier = memory.ensureEndSelfClosed(vocabulary.kinds.Literal);
  const builder = new SyntaxAsetBuilder(memory, vocabulary);
  const name = builder.addOccurrence(vocabulary.kinds.Literal, [
    { role: vocabulary.roles.value, value: memory.ensureStartSelfClosed(vocabulary.kinds.Definition) },
  ]);
  const value = builder.addOccurrence(vocabulary.kinds.Literal, [
    { role: vocabulary.roles.value, value: valueCarrier },
  ]);
  const sequence = builder.addOccurrence(vocabulary.kinds.Sequence, [
    { role: vocabulary.roles.item, value },
    { role: vocabulary.roles.item, value },
  ]);
  const unary = builder.addOccurrence(vocabulary.kinds.Not, [
    { role: vocabulary.roles.operand, value: sequence },
  ]);
  const definition = builder.addOccurrence(vocabulary.kinds.Definition, [
    { role: vocabulary.roles.name, value: name },
    { role: vocabulary.roles.body, value: unary },
  ]);
  const statement = builder.addOccurrence(vocabulary.kinds.Statement, [
    { role: vocabulary.roles.expression, value: definition },
  ]);
  const read = readSyntaxAset(memory, builder.finish(statement), vocabulary);
  same(read.occurrences[2]?.fields.length, 2, "repeated ordered items remain two structural fields");
  same(read.occurrences[2]?.fields[0]?.value, value, "first ordered item retained");
  same(read.occurrences[2]?.fields[1]?.value, value, "second ordered item retained");
  same(read.occurrences[3]?.fields[0]?.role, vocabulary.roles.operand, "unary operand role retained");
  same(read.occurrences[4]?.fields[0]?.role, vocabulary.roles.name, "definition name role retained");
  same(read.occurrences[4]?.fields[1]?.role, vocabulary.roles.body, "definition body role retained");
  same(read.occurrences[5]?.fields[0]?.role, vocabulary.roles.expression, "statement expression role retained");
}

// Child-bearing roles remain fail-closed and cannot point at arbitrary carrier
// Links or future/foreign occurrences.
{
  const memory = new Memory();
  const vocabulary = materializeSyntaxAsetVocabulary(memory, vocabularySeed(memory));
  const carrier = memory.ensureStartSelfClosed(vocabulary.roles.start);
  const builder = new SyntaxAsetBuilder(memory, vocabulary);
  rejectContract(
    () => builder.addOccurrence(vocabulary.kinds.Link, [
      { role: vocabulary.roles.start, value: carrier },
    ]),
    "invalid-child-occurrence",
  );
}

// Reading remains deterministic/read-only, and source provenance stays an
// external map that cannot affect vocabulary or SyntaxAset identity.
{
  const memory = new Memory();
  const vocabulary = materializeSyntaxAsetVocabulary(memory, vocabularySeed(memory));
  const carrier = memory.ensureStartSelfClosed(vocabulary.kinds.Literal);
  const builder = new SyntaxAsetBuilder(memory, vocabulary);
  const leaf = builder.addOccurrence(vocabulary.kinds.Literal, [
    { role: vocabulary.roles.value, value: carrier },
  ]);
  const aset = builder.finish(leaf);
  const provenanceA = new Map([[leaf, { source: "a.mts", start: 0, end: 1 }]]);
  const provenanceB = new Map([[leaf, { source: "b.mts", start: 30, end: 50 }]]);
  assert(provenanceA.get(leaf)?.source !== provenanceB.get(leaf)?.source, "provenance fixtures differ");
  const before = memory.linkCount;
  const probe = new ReadProbe(memory);
  const first = readSyntaxAset(probe, aset, vocabulary);
  const second = readSyntaxAset(probe, aset, vocabulary);
  same(first.root, second.root, "repeat read is deterministic");
  same(memory.linkCount, before, "read and provenance lookup do not materialize Links");
  assert(probe.polesCalls > 0, "reader inspects structural topology");
}

// #970 selected the chained-triad form as the production target. A single
// Literal occurrence must therefore be encoded directly as:
//
//   F1 = valueRole ⟼ (R ⟼ carrier)
//   O1 = LiteralKind ⟼ (R ⟼ F1)
//   A  = SyntaxTag ⟼ O1
{
  const memory = new Memory();
  const vocabulary = materializeSyntaxAsetVocabulary(memory, vocabularySeed(memory));
  const carrier = memory.ensureStartSelfClosed(vocabulary.tag);
  const builder = new SyntaxAsetBuilder(memory, vocabulary);
  const occurrence = builder.addOccurrence(vocabulary.kinds.Literal, [
    { role: vocabulary.roles.value, value: carrier },
  ]);
  const aset = builder.finish(occurrence);

  const fieldHorizontal = memory.find(memory.root, carrier);
  assert(fieldHorizontal !== undefined, "field horizontal Link exists");
  const field = memory.find(vocabulary.roles.value, fieldHorizontal);
  assert(field !== undefined, "field triad exists");
  const occurrenceHorizontal = memory.find(memory.root, field);
  assert(occurrenceHorizontal !== undefined, "occurrence horizontal Link exists");
  const expectedOccurrence = memory.find(vocabulary.kinds.Literal, occurrenceHorizontal);
  assert(expectedOccurrence !== undefined, "occurrence triad exists");
  same(occurrence, expectedOccurrence, "production occurrence uses chained-triad topology");
  same(memory.find(vocabulary.tag, occurrence), aset, "SyntaxAset wrapper points directly at final occurrence");
}

// #973 closes the syntax language: a Literal is exactly one value carrier.
{
  const memory = new Memory();
  const vocabulary = materializeSyntaxAsetVocabulary(memory, vocabularySeed(memory));
  const builder = new SyntaxAsetBuilder(memory, vocabulary);
  rejectContract(
    () => builder.addOccurrence(vocabulary.kinds.Literal, []),
    "invalid-grammar",
  );
  const carrier = memory.ensureStartSelfClosed(vocabulary.tag);
  rejectContract(
    () => builder.addOccurrence(vocabulary.kinds.Literal, [
      { role: vocabulary.roles.value, value: carrier },
      { role: vocabulary.roles.value, value: carrier },
    ]),
    "invalid-grammar",
  );
}

// The finite grammar rejects unknown kinds/roles instead of accepting any
// structurally readable Link as syntax vocabulary.
{
  const memory = new Memory();
  const vocabulary = materializeSyntaxAsetVocabulary(memory, vocabularySeed(memory));
  const builder = new SyntaxAsetBuilder(memory, vocabulary);
  const carrier = memory.ensureStartSelfClosed(vocabulary.tag);
  const unknownKind = memory.ensureStartSelfClosed(carrier);
  const unknownRole = memory.ensureEndSelfClosed(carrier);
  rejectContract(
    () => builder.addOccurrence(unknownKind, [
      { role: vocabulary.roles.value, value: carrier },
    ]),
    "unknown-kind",
  );
  rejectContract(
    () => builder.addOccurrence(vocabulary.kinds.Literal, [
      { role: unknownRole, value: carrier },
    ]),
    "unknown-role",
  );
}

// Definition.name is a syntax child in the actual parser grammar, not a free
// carrier. This is the old global-childRoles gap that #973 must close.
{
  const memory = new Memory();
  const vocabulary = materializeSyntaxAsetVocabulary(memory, vocabularySeed(memory));
  const builder = new SyntaxAsetBuilder(memory, vocabulary);
  const carrier = memory.ensureStartSelfClosed(vocabulary.kinds.Definition);
  const body = builder.addOccurrence(vocabulary.kinds.Literal, [
    { role: vocabulary.roles.value, value: memory.ensureEndSelfClosed(carrier) },
  ]);
  rejectContract(
    () => builder.addOccurrence(vocabulary.kinds.Definition, [
      { role: vocabulary.roles.name, value: carrier },
      { role: vocabulary.roles.body, value: body },
    ]),
    "invalid-child-occurrence",
  );
}

// Cardinality is per kind: Sequence exists only for 2+ adjacent forms, while
// empty File/Set and empty Round/Square are valid source syntax.
{
  const memory = new Memory();
  const vocabulary = materializeSyntaxAsetVocabulary(memory, vocabularySeed(memory));
  const builder = new SyntaxAsetBuilder(memory, vocabulary);
  const carrier = memory.ensureStartSelfClosed(vocabulary.kinds.Literal);
  const child = builder.addOccurrence(vocabulary.kinds.Literal, [
    { role: vocabulary.roles.value, value: carrier },
  ]);
  rejectContract(
    () => builder.addOccurrence(vocabulary.kinds.Sequence, [
      { role: vocabulary.roles.item, value: child },
    ]),
    "invalid-grammar",
  );
}

{
  const memory = new Memory();
  const vocabulary = materializeSyntaxAsetVocabulary(memory, vocabularySeed(memory));
  const fileBuilder = new SyntaxAsetBuilder(memory, vocabulary);
  const file = fileBuilder.addOccurrence(vocabulary.kinds.File, []);
  same(readSyntaxAset(memory, fileBuilder.finish(file), vocabulary).root, file, "empty File accepted");
}

{
  const memory = new Memory();
  const vocabulary = materializeSyntaxAsetVocabulary(memory, vocabularySeed(memory));
  const roundBuilder = new SyntaxAsetBuilder(memory, vocabulary);
  const round = roundBuilder.addOccurrence(vocabulary.kinds.Round, []);
  same(readSyntaxAset(memory, roundBuilder.finish(round), vocabulary).root, round, "empty Round accepted");
}
