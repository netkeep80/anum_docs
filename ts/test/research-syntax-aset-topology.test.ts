import { Memory, type LinkHandle, type LinkPoles, type ReadMemory } from "../src/memory.js";
import {
  SyntaxAsetBuilder,
  materializeSyntaxAsetVocabulary,
  readSyntaxAset,
} from "../src/tooling/syntax-aset.js";
import {
  ChainedTriadSyntaxAsetBuilder,
  ResearchSyntaxAsetError,
  buildResearchCorpus,
  normalizeResearchRead,
  readChainedTriadSyntaxAset,
  triad,
  type ResearchBuilder,
} from "./research-syntax-aset-topology-support.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

function reject(effect: () => unknown, code: ResearchSyntaxAsetError["code"]): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof ResearchSyntaxAsetError, `expected ResearchSyntaxAsetError, got ${String(error)}`);
    same(error.code, code, "research SyntaxAset error code");
    return;
  }
  throw new Error(`expected research SyntaxAset rejection: ${code}`);
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

function s0Fixture(): {
  readonly memory: Memory;
  readonly vocabulary: ReturnType<typeof materializeSyntaxAsetVocabulary>;
  readonly builder: ResearchBuilder;
  readonly baseline: number;
} {
  const memory = new Memory();
  const seed = memory.ensureEndSelfClosed(memory.root);
  const vocabulary = materializeSyntaxAsetVocabulary(memory, seed);
  const carrierA = memory.ensure(vocabulary.tag, vocabulary.kinds.Literal);
  const carrierB = memory.ensure(vocabulary.tag, vocabulary.kinds.ContextPronoun);
  const baseline = memory.linkCount;
  const delegate = new SyntaxAsetBuilder(memory, vocabulary);
  const builder: ResearchBuilder = {
    memory,
    vocabulary,
    carrierA,
    carrierB,
    addOccurrence: (kind, fields) => delegate.addOccurrence(kind, fields),
    finish: (root) => delegate.finish(root),
  };
  return Object.freeze({ memory, vocabulary, builder, baseline });
}

function triadFixture(): {
  readonly memory: Memory;
  readonly vocabulary: ReturnType<typeof materializeSyntaxAsetVocabulary>;
  readonly builder: ChainedTriadSyntaxAsetBuilder;
  readonly baseline: number;
} {
  const memory = new Memory();
  const seed = memory.ensureEndSelfClosed(memory.root);
  const vocabulary = materializeSyntaxAsetVocabulary(memory, seed);
  const carrierA = memory.ensure(vocabulary.tag, vocabulary.kinds.Literal);
  const carrierB = memory.ensure(vocabulary.tag, vocabulary.kinds.ContextPronoun);
  const baseline = memory.linkCount;
  const builder = new ChainedTriadSyntaxAsetBuilder(memory, vocabulary, carrierA, carrierB);
  return Object.freeze({ memory, vocabulary, builder, baseline });
}

// Generic RM-style nested pairs are information-preserving, but R is also the
// sequence sentinel: T(R,R,R) collapses to R and therefore cannot itself be a
// chained syntax fact. Syntax relation vocabulary must stay distinct from R.
{
  const memory = new Memory();
  same(triad(memory, memory.root, memory.root, memory.root), memory.root, "root triad collapses to sentinel");
}

// A context-free triad cannot distinguish two equal-looking occurrences. The
// occurrence chain must therefore participate in syntax occurrence identity.
{
  const f = triadFixture();
  const field = triad(f.memory, f.vocabulary.roles.value, f.memory.root, f.builder.carrierA);
  const first = triad(f.memory, f.vocabulary.kinds.Literal, f.memory.root, field);
  const second = triad(f.memory, f.vocabulary.kinds.Literal, f.memory.root, field);
  same(first, second, "naive equal triads collapse by poles");
}

// Chained triads preserve equal-looking occurrences and repeated ordered roles
// without UUIDs, source offsets, allocation indexes or ExactSequence Cells.
{
  const f = triadFixture();
  const first = f.builder.addOccurrence(f.vocabulary.kinds.Literal, [
    { role: f.vocabulary.roles.value, value: f.builder.carrierA },
  ]);
  const second = f.builder.addOccurrence(f.vocabulary.kinds.Literal, [
    { role: f.vocabulary.roles.value, value: f.builder.carrierA },
  ]);
  assert(first !== second, "chained equal-looking occurrences must remain distinct");
  const sequence = f.builder.addOccurrence(f.vocabulary.kinds.Sequence, [
    { role: f.vocabulary.roles.item, value: first },
    { role: f.vocabulary.roles.item, value: first },
    { role: f.vocabulary.roles.item, value: second },
  ]);
  const aset = f.builder.finish(sequence);
  const read = readChainedTriadSyntaxAset(f.memory, aset, f.vocabulary);
  const sequenceRead = read.occurrences.at(-1);
  assert(sequenceRead !== undefined, "sequence occurrence exists");
  same(sequenceRead.fields.length, 3, "three ordered repeated items retained");
  same(sequenceRead.fields[0]?.value, first, "first repeated child retained");
  same(sequenceRead.fields[1]?.value, first, "second repeated child retained");
  same(sequenceRead.fields[2]?.value, second, "third child retained");
}

// The same full corpus must round-trip through S0 and the chained-triad
// candidate to the same syntax-level normalized structure.
{
  const s0 = s0Fixture();
  const triads = triadFixture();
  const s0Root = buildResearchCorpus(s0.builder);
  const triadRoot = buildResearchCorpus(triads.builder);
  const s0Aset = s0.builder.finish(s0Root);
  const triadAset = triads.builder.finish(triadRoot);
  const s0Read = readSyntaxAset(s0.memory, s0Aset, s0.vocabulary);
  const triadRead = readChainedTriadSyntaxAset(triads.memory, triadAset, triads.vocabulary);

  const s0Normalized = normalizeResearchRead(s0Read, s0.vocabulary, s0.builder.carrierA, s0.builder.carrierB);
  const triadNormalized = normalizeResearchRead(triadRead, triads.vocabulary, triads.builder.carrierA, triads.builder.carrierB);
  same(JSON.stringify(triadNormalized), JSON.stringify(s0Normalized), "candidate preserves corpus structure");

  const s0Cost = s0.memory.linkCount - s0.baseline;
  const triadCost = triads.memory.linkCount - triads.baseline;
  assert(triadCost < s0Cost, `chained triad should use fewer corpus Links: triad=${triadCost}, S0=${s0Cost}`);
  console.log(`[research-syntax-aset] corpus links after shared vocabulary/carriers: S0=${s0Cost}, chained-triad=${triadCost}`);
}

// Equivalent construction in independent Memories yields the same normalized
// syntax bytes; host allocation identity is not part of the contract.
{
  const a = triadFixture();
  const b = triadFixture();
  const aAset = a.builder.finish(buildResearchCorpus(a.builder));
  const bAset = b.builder.finish(buildResearchCorpus(b.builder));
  const aRead = readChainedTriadSyntaxAset(a.memory, aAset, a.vocabulary);
  const bRead = readChainedTriadSyntaxAset(b.memory, bAset, b.vocabulary);
  same(
    JSON.stringify(normalizeResearchRead(aRead, a.vocabulary, a.builder.carrierA, a.builder.carrierB)),
    JSON.stringify(normalizeResearchRead(bRead, b.vocabulary, b.builder.carrierA, b.builder.carrierB)),
    "equivalent Memories produce identical normalized syntax",
  );
}

// Unrelated host allocation cannot change canonical syntax structure: it may
// change opaque handles/slots, but no topology relation or normalized read.
{
  const a = triadFixture();
  const b = triadFixture();
  const junk = b.memory.ensureStartSelfClosed(b.builder.carrierA);
  b.memory.ensure(junk, b.builder.carrierB);
  const aAset = a.builder.finish(buildResearchCorpus(a.builder));
  const bAset = b.builder.finish(buildResearchCorpus(b.builder));
  const aRead = readChainedTriadSyntaxAset(a.memory, aAset, a.vocabulary);
  const bRead = readChainedTriadSyntaxAset(b.memory, bAset, b.vocabulary);
  same(
    JSON.stringify(normalizeResearchRead(aRead, a.vocabulary, a.builder.carrierA, a.builder.carrierB)),
    JSON.stringify(normalizeResearchRead(bRead, b.vocabulary, b.builder.carrierA, b.builder.carrierB)),
    "unrelated allocation does not change normalized syntax",
  );
}

// Swapping the RM-style vertical/horizontal orientation is not an alternative
// canonical encoding: the reader sees an unknown kind and fails closed.
{
  const f = triadFixture();
  const field = triad(f.memory, f.vocabulary.roles.value, f.memory.root, f.builder.carrierA);
  const horizontal = f.memory.ensure(f.memory.root, field);
  const dualizedOccurrence = f.memory.ensure(horizontal, f.vocabulary.kinds.Literal);
  const aset = f.memory.ensure(f.vocabulary.tag, dualizedOccurrence);
  reject(() => readChainedTriadSyntaxAset(f.memory, aset, f.vocabulary), "unknown-kind");
}

// The same fail-closed rule applies inside a field chain: a swapped field pair
// cannot be reinterpreted heuristically as the intended role(subject,object).
{
  const f = triadFixture();
  const horizontal = f.memory.ensure(f.memory.root, f.builder.carrierA);
  const dualizedField = f.memory.ensure(horizontal, f.vocabulary.roles.value);
  const occurrence = triad(f.memory, f.vocabulary.kinds.Literal, f.memory.root, dualizedField);
  const aset = f.memory.ensure(f.vocabulary.tag, occurrence);
  reject(() => readChainedTriadSyntaxAset(f.memory, aset, f.vocabulary), "unknown-role");
}

// Provenance remains external metadata. Different source coordinates attached
// to the same occurrence cannot alter the SyntaxAset topology or normalized read.
{
  const f = triadFixture();
  const root = buildResearchCorpus(f.builder);
  const aset = f.builder.finish(root);
  const before = normalizeResearchRead(
    readChainedTriadSyntaxAset(f.memory, aset, f.vocabulary),
    f.vocabulary,
    f.builder.carrierA,
    f.builder.carrierB,
  );
  const provenanceA = new Map([[root, Object.freeze({ source: "a.mts", start: 0, end: 1 })]]);
  const provenanceB = new Map([[root, Object.freeze({ source: "b.mts", start: 90, end: 120 })]]);
  assert(provenanceA.get(root)?.source !== provenanceB.get(root)?.source, "research provenance differs");
  const after = normalizeResearchRead(
    readChainedTriadSyntaxAset(f.memory, aset, f.vocabulary),
    f.vocabulary,
    f.builder.carrierA,
    f.builder.carrierB,
  );
  same(JSON.stringify(after), JSON.stringify(before), "external provenance cannot change topology");
}

// Reader is a ReadMemory-only trust boundary and must reject a child occurrence
// imported from another SyntaxAset even when both live in the same Memory.
{
  const f = triadFixture();
  const foreign = new ChainedTriadSyntaxAsetBuilder(
    f.memory,
    f.vocabulary,
    f.builder.carrierA,
    f.builder.carrierB,
  );
  const foreignLeaf = foreign.addOccurrence(f.vocabulary.kinds.Literal, [
    { role: f.vocabulary.roles.value, value: f.builder.carrierA },
  ]);
  foreign.finish(foreignLeaf);

  reject(
    () => f.builder.addOccurrence(f.vocabulary.kinds.Not, [
      { role: f.vocabulary.roles.operand, value: foreignLeaf },
    ]),
    "invalid-child-occurrence",
  );

  const local = f.builder.addOccurrence(f.vocabulary.kinds.Literal, [
    { role: f.vocabulary.roles.value, value: f.builder.carrierB },
  ]);
  const aset = f.builder.finish(local);
  const before = f.memory.linkCount;
  const probe = new ReadProbe(f.memory);
  readChainedTriadSyntaxAset(probe, aset, f.vocabulary);
  same(f.memory.linkCount, before, "research reader must not materialize Links");
  assert(probe.polesCalls > 0, "research reader inspects topology through ReadMemory");
}
