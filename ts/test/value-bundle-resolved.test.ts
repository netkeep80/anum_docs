import {
  Memory,
  type EnumerableReadMemory,
  type LinkHandle,
  type LinkPoles,
} from "../src/memory.js";
import {
  ValueBundleReplayError,
  expandResolvedBundleQuery,
  resolveFlatBundle,
  valuesEqual,
  type BundleValue,
  type LinkValue,
  type MtsValue,
  type ResolvedOccurrence,
} from "../src/value-bundle.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}
function setSame(actual: ReadonlySet<LinkHandle>, expected: readonly LinkHandle[], message: string): void {
  same(actual.size, new Set(expected).size, `${message}: size`);
  for (const ref of expected) assert(actual.has(ref), `${message}: missing expected Link`);
}
function reject(effect: () => unknown): void {
  try { effect(); }
  catch (error) {
    assert(error instanceof ValueBundleReplayError, `expected ValueBundleReplayError, got ${String(error)}`);
    same(error.code, "invalid-value-bundle-evidence", "ValueBundle error code");
    return;
  }
  throw new Error("expected invalid-value-bundle-evidence");
}
function occurrence(path: readonly number[], link: LinkHandle): ResolvedOccurrence {
  return Object.freeze({ path: Object.freeze([...path]), link });
}
function scalar(link: LinkHandle): LinkValue {
  return Object.freeze({ kind: "link", link });
}
function bundle(memory: Memory, ...links: LinkHandle[]): BundleValue {
  return resolveFlatBundle(memory, links.map((link, index) => occurrence([index], link)));
}

{
  const m = new Memory();
  const a = m.ensureEndSelfClosed(m.root);
  const b = m.ensure(a, m.root);
  const before = m.linkCount;
  const value = resolveFlatBundle(m, [occurrence([0], a), occurrence([1], b), occurrence([2], a)]);
  setSame(value.links, [a, b], "resolved bundle deduplicates extensional set");
  same(value.occurrences.length, 3, "resolved bundle preserves duplicate occurrences");
  same(value.occurrences[0]?.path.join(","), "0", "first occurrence path");
  same(value.occurrences[2]?.path.join(","), "2", "duplicate occurrence path");
  same(m.linkCount, before, "resolveFlatBundle is read-only");

  const reordered = resolveFlatBundle(m, [occurrence([9], b), occurrence([8], a)]);
  assert(valuesEqual(value, reordered), "bundle equality is extensional and order-insensitive");
  const duplicateOnly = resolveFlatBundle(m, [occurrence([0], a), occurrence([1], a)]);
  const singleton = resolveFlatBundle(m, [occurrence([0], a)]);
  assert(valuesEqual(duplicateOnly, singleton), "duplicate occurrences are equality-idempotent");
  assert(!valuesEqual(value, singleton), "different bundle sets are unequal");
  assert(valuesEqual(scalar(a), scalar(a)), "same scalar Link is equal");
  assert(!valuesEqual(scalar(a), scalar(b)), "different scalar Links are unequal");
  assert(!valuesEqual(singleton, scalar(a)), "singleton bundle never coerces to scalar");
}

{
  const m = new Memory();
  const foreign = new Memory().root;
  reject(() => resolveFlatBundle(m, [occurrence([0], foreign)]));
  same(m.linkCount, 1, "foreign occurrence never materializes a guess");
}

interface ExpansionFixture {
  readonly memory: Memory;
  readonly root: LinkHandle;
  readonly one: LinkHandle;
  readonly two: LinkHandle;
  readonly three: LinkHandle;
}
function expansionFixture(): ExpansionFixture {
  const memory = new Memory();
  const root = memory.root;
  const one = memory.ensureEndSelfClosed(root);
  const two = memory.ensure(one, root);
  const three = memory.ensure(one, one);
  same(memory.linkCount, 4, "expansion fixture must have four Links");
  return { memory, root, one, two, three };
}

{
  const f = expansionFixture();
  const before = f.memory.linkCount;
  const cases: readonly [string, MtsValue, MtsValue, readonly LinkHandle[]][] = [
    ["single-to-bundle", scalar(f.root), bundle(f.memory, f.root, f.one), [f.root, f.one]],
    ["bundle-to-single", bundle(f.memory, f.root, f.one), scalar(f.one), [f.one, f.three]],
    ["cartesian-existing", bundle(f.memory, f.root, f.one), bundle(f.memory, f.root, f.one), [f.root, f.one, f.two, f.three]],
    ["outgoing-wildcard", scalar(f.root), bundle(f.memory), [f.root, f.one]],
    ["incoming-wildcard", bundle(f.memory), scalar(f.one), [f.one, f.three]],
    ["all-links-wildcard", bundle(f.memory), bundle(f.memory), [f.root, f.one, f.two, f.three]],
    ["missing-pair-no-realize", scalar(f.root), bundle(f.memory, f.two), []],
  ];
  for (const [id, left, right, expected] of cases) {
    const value = expandResolvedBundleQuery(f.memory, left, right);
    setSame(value.links, expected, id);
    same(value.occurrences.length, 0, `${id}: query result has no source occurrences`);
    same(f.memory.linkCount, before, `${id}: query is read-only`);
  }
}

class QueryProbe implements EnumerableReadMemory {
  findCalls = 0;
  outgoingCalls = 0;
  incomingCalls = 0;
  allLinksCalls = 0;
  constructor(private readonly source: Memory) {}
  get root(): LinkHandle { return this.source.root; }
  get linkCount(): number { return this.source.linkCount; }
  poles(link: LinkHandle): LinkPoles { return this.source.poles(link); }
  find(start: LinkHandle, end: LinkHandle): LinkHandle | undefined {
    this.findCalls += 1;
    return this.source.find(start, end);
  }
  outgoing(start: LinkHandle): readonly LinkHandle[] {
    this.outgoingCalls += 1;
    return this.source.outgoing(start);
  }
  incoming(end: LinkHandle): readonly LinkHandle[] {
    this.incomingCalls += 1;
    return this.source.incoming(end);
  }
  allLinks(): readonly LinkHandle[] {
    this.allLinksCalls += 1;
    return this.source.allLinks();
  }
}

{
  const f = expansionFixture();
  const exact = new QueryProbe(f.memory);
  expandResolvedBundleQuery(exact, bundle(f.memory, f.root, f.one), bundle(f.memory, f.root, f.one));
  same(exact.findCalls, 4, "Cartesian query uses exact pair index");
  same(exact.outgoingCalls, 0, "Cartesian query does not use outgoing wildcard");
  same(exact.incomingCalls, 0, "Cartesian query does not use incoming wildcard");
  same(exact.allLinksCalls, 0, "Cartesian query does not enumerate all Links");

  const outgoing = new QueryProbe(f.memory);
  expandResolvedBundleQuery(outgoing, scalar(f.root), bundle(f.memory));
  same(outgoing.outgoingCalls, 1, "right wildcard uses outgoing index");
  same(outgoing.allLinksCalls, 0, "one-sided wildcard does not enumerate all Links");

  const incoming = new QueryProbe(f.memory);
  expandResolvedBundleQuery(incoming, bundle(f.memory), scalar(f.one));
  same(incoming.incomingCalls, 1, "left wildcard uses incoming index");
  same(incoming.allLinksCalls, 0, "one-sided wildcard does not enumerate all Links");

  const all = new QueryProbe(f.memory);
  expandResolvedBundleQuery(all, bundle(f.memory), bundle(f.memory));
  same(all.allLinksCalls, 1, "double wildcard uses explicit enumeration capability once");
  same(all.findCalls, 0, "double wildcard does not reconstruct memory by pair scans");
}

{
  const f = expansionFixture();
  reject(() => expandResolvedBundleQuery(f.memory, scalar(f.root), scalar(f.one)));
  reject(() => expandResolvedBundleQuery(
    f.memory,
    { kind: "bundle", links: new Set([new Memory().root]), occurrences: [] },
    scalar(f.one),
  ));
  reject(() => expandResolvedBundleQuery(
    f.memory,
    { kind: "mystery" } as unknown as MtsValue,
    bundle(f.memory),
  ));
}
