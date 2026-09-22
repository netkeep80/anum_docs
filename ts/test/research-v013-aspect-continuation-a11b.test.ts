import {
  exportCanonicalTopology,
} from "../src/canonical-topology.js";
import {
  Memory,
  ensureRootBasis,
  type EnumerableReadMemory,
  type LinkHandle,
  type LinkPoles,
  type ReadMemory,
} from "../src/memory.js";
import {
  restoreTopology,
  type StorageTopologyImage,
} from "../src/persistence-topology.js";
import {
  resolveFlatBundle,
  type BundleValue,
  type ResolvedOccurrence,
} from "../src/value-bundle.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.13 A11b aspect continuation: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}

function exactJson(actual: unknown, expected: unknown, message: string): void {
  same(JSON.stringify(actual), JSON.stringify(expected), message);
}

class SelectedSupport implements EnumerableReadMemory {
  readonly root: LinkHandle;
  private readonly ordered: readonly LinkHandle[];

  constructor(
    private readonly source: ReadMemory,
    private readonly support: ReadonlySet<LinkHandle>,
  ) {
    this.root = source.root;
    this.ordered = Object.freeze([...support]);
  }

  get linkCount(): number {
    return this.ordered.length;
  }

  private require(link: LinkHandle): void {
    assert(this.support.has(link), "selected continuation authority stays inside frozen support");
  }

  poles(link: LinkHandle): LinkPoles {
    this.require(link);
    const poles = this.source.poles(link);
    assert(
      this.support.has(poles.start) && this.support.has(poles.end),
      "selected continuation support is pole-closed",
    );
    return poles;
  }

  find(start: LinkHandle, end: LinkHandle): LinkHandle | undefined {
    this.require(start);
    this.require(end);
    const found = this.source.find(start, end);
    return found !== undefined && this.support.has(found) ? found : undefined;
  }

  outgoing(start: LinkHandle): readonly LinkHandle[] {
    this.require(start);
    return Object.freeze(
      this.source.outgoing(start).filter((link) => this.support.has(link)),
    );
  }

  incoming(end: LinkHandle): readonly LinkHandle[] {
    this.require(end);
    return Object.freeze(
      this.source.incoming(end).filter((link) => this.support.has(link)),
    );
  }

  allLinks(): readonly LinkHandle[] {
    return this.ordered;
  }
}

function poleClosure(
  memory: ReadMemory,
  roots: readonly LinkHandle[],
): ReadonlySet<LinkHandle> {
  const support = new Set<LinkHandle>();
  const pending = [memory.root, ...roots];
  while (pending.length > 0) {
    const link = pending.pop();
    if (link === undefined || support.has(link)) continue;
    const poles = memory.poles(link);
    support.add(link);
    pending.push(poles.start, poles.end);
  }
  return support;
}

interface PortableContinuationAuthority {
  readonly schema: "mts-v013-aspect-continuation/research-v0.1";
  readonly topology: StorageTopologyImage;
}

interface FixtureRefs {
  readonly a0: LinkHandle;
  readonly a1: LinkHandle;
  readonly aMany: LinkHandle;
  readonly a2: LinkHandle;
  readonly g: LinkHandle;
  readonly h: LinkHandle;
  readonly z1: LinkHandle;
  readonly z2: LinkHandle;
}

function refs(memory: Memory): FixtureRefs {
  const basis = ensureRootBasis(memory);
  const a0 = memory.ensure(basis.U, basis.L);
  const a1 = memory.ensure(basis.L, basis.U);
  const aMany = memory.ensure(a0, a1);
  const a2 = memory.ensure(a1, a0);
  const g = memory.ensure(basis.O, basis.U);
  const h = memory.ensure(basis.C, basis.L);
  const z1 = memory.ensure(g, basis.C);
  const z2 = memory.ensure(h, basis.O);
  return Object.freeze({ a0, a1, aMany, a2, g, h, z1, z2 });
}

function defineResult(
  memory: Memory,
  fn: LinkHandle,
  argument: LinkHandle,
  result: LinkHandle,
): readonly [LinkHandle, LinkHandle] {
  const prefix = memory.ensure(fn, argument);
  const occurrence = memory.ensure(prefix, result);
  return Object.freeze([prefix, occurrence]);
}

function buildAuthority(noise: boolean): PortableContinuationAuthority {
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  if (noise) {
    const n0 = memory.ensure(basis.C, basis.U);
    const n1 = memory.ensure(n0, basis.C);
    memory.ensure(basis.L, n1);
  }

  const r = refs(memory);
  const selectedRoots: LinkHandle[] = [];

  // Defined empty result: the prefix is authoritative even with no result edge.
  const zeroPrefix = memory.ensure(basis.R, r.a0);
  selectedRoots.push(zeroPrefix);

  // One result.
  const [onePrefix, oneOccurrence] = defineResult(memory, basis.R, r.a1, r.g);
  selectedRoots.push(onePrefix, oneOccurrence);

  // Many results from the same selected application.
  const manyPrefix = memory.ensure(basis.R, r.aMany);
  const manyG = memory.ensure(manyPrefix, r.g);
  const manyH = memory.ensure(manyPrefix, r.h);
  selectedRoots.push(manyPrefix, manyG, manyH);

  // Returned Links g/h can themselves be functions under exactly the same
  // nested-Link continuation shape.
  const [gPrefix, gOccurrence] = defineResult(memory, r.g, r.a2, r.z1);
  const [hPrefix, hOccurrence] = defineResult(memory, r.h, r.a2, r.z2);
  selectedRoots.push(gPrefix, gOccurrence, hPrefix, hOccurrence);

  const support = poleClosure(memory, selectedRoots);
  const canonical = exportCanonicalTopology(new SelectedSupport(memory, support));
  return Object.freeze({
    schema: "mts-v013-aspect-continuation/research-v0.1" as const,
    topology: canonical.topology,
  });
}

function replayAuthority(
  artifact: PortableContinuationAuthority,
): { readonly memory: Memory; readonly frozen: SelectedSupport } {
  same(
    artifact.schema,
    "mts-v013-aspect-continuation/research-v0.1",
    "continuation authority schema",
  );
  const memory = restoreTopology(artifact.topology);
  const support = new Set(memory.allLinks());
  const frozen = new SelectedSupport(memory, support);
  const canonical = exportCanonicalTopology(frozen);
  exactJson(canonical.topology, artifact.topology, "continuation authority canonical replay");
  return Object.freeze({ memory, frozen });
}

/**
 * One generic frozen-continuation reader.
 *
 * Research notation F(a) means:
 *
 *   P = F ⟼ a
 *   results = { b | selected frozen support contains P ⟼ b }
 *
 * The result is projected through the already accepted derived BundleValue
 * surface. No Dictionary, Theory, StructuralRule, name table, operator enum or
 * host arity metadata participates here.
 */
function readFrozenContinuations(
  memory: Memory,
  frozen: SelectedSupport,
  fn: LinkHandle,
  argument: LinkHandle,
): BundleValue {
  const prefix = frozen.find(fn, argument);
  assert(prefix !== undefined, "application prefix is not defined by selected authority");

  const occurrences: ResolvedOccurrence[] = [];
  let index = 0;
  for (const edge of frozen.outgoing(prefix)) {
    // Strict continuation occurrence. Self-incidence application/result cases
    // are deliberately left for A11d rather than hidden here.
    if (edge === prefix) continue;
    const poles = frozen.poles(edge);
    same(poles.start, prefix, "continuation occurrence starts at exact application prefix");
    occurrences.push(Object.freeze({
      path: Object.freeze([index]),
      link: poles.end,
    }));
    index += 1;
  }

  return resolveFlatBundle(memory, Object.freeze(occurrences));
}

function setSame(
  actual: ReadonlySet<LinkHandle>,
  expected: readonly LinkHandle[],
  message: string,
): void {
  same(actual.size, new Set(expected).size, `${message}: cardinality`);
  for (const link of expected) assert(actual.has(link), `${message}: missing expected result`);
}

function execute(artifact: PortableContinuationAuthority): void {
  const replay = replayAuthority(artifact);
  const { memory, frozen } = replay;
  const beforeRefs = memory.linkCount;
  const basis = ensureRootBasis(memory);
  const r = refs(memory);
  same(memory.linkCount, beforeRefs, "all invocation refs already belong to frozen authority");

  // R(a0) is explicitly defined by its prefix but has zero continuations.
  {
    const result = readFrozenContinuations(memory, frozen, basis.R, r.a0);
    same(result.kind, "bundle", "zero result is BundleValue");
    same(result.links.size, 0, "R(a0) result cardinality");
  }

  // R(a1) -> {g}.
  {
    const result = readFrozenContinuations(memory, frozen, basis.R, r.a1);
    same(result.kind, "bundle", "one result is BundleValue");
    setSame(result.links, [r.g], "R(a1)");
    same(result.occurrences.length, 1, "R(a1) occurrence count");
  }

  // R(aMany) -> {g,h}.
  {
    const result = readFrozenContinuations(memory, frozen, basis.R, r.aMany);
    same(result.kind, "bundle", "many result is BundleValue");
    setSame(result.links, [r.g, r.h], "R(aMany)");
    same(result.occurrences.length, 2, "R(aMany) occurrence count");
  }

  // Returned b may itself be a function of the next argument.
  {
    const gResult = readFrozenContinuations(memory, frozen, r.g, r.a2);
    const hResult = readFrozenContinuations(memory, frozen, r.h, r.a2);
    setSame(gResult.links, [r.z1], "g(a2)");
    setSame(hResult.links, [r.z2], "h(a2)");
  }

  // Undefined is distinct from defined-empty: no F⟼a prefix in frozen support.
  {
    const unknownArg = memory.ensure(r.z1, r.z2);
    let rejected = false;
    try {
      readFrozenContinuations(memory, frozen, basis.R, unknownArg);
    } catch {
      rejected = true;
    }
    assert(rejected, "undefined application fails closed");
  }

  // Live adjacency after authority freeze has no semantic effect.
  {
    const prefix = frozen.find(basis.R, r.a1);
    assert(prefix !== undefined, "known prefix exists");
    const liveOnlyResult = memory.ensure(r.z2, r.z1);
    memory.ensure(prefix, liveOnlyResult);

    const still = readFrozenContinuations(memory, frozen, basis.R, r.a1);
    setSame(still.links, [r.g], "frozen authority ignores later live outgoing result");
  }

  // Every application prefix exercised by A11b is an ordinary non-self-closed
  // Link. Self-incidence application cases remain an explicit later gate.
  for (const [fn, arg] of [
    [basis.R, r.a0],
    [basis.R, r.a1],
    [basis.R, r.aMany],
    [r.g, r.a2],
    [r.h, r.a2],
  ] as const) {
    const prefix = frozen.find(fn, arg);
    assert(prefix !== undefined, "selected ordinary application prefix exists");
    const poles = frozen.poles(prefix);
    assert(poles.start !== prefix && poles.end !== prefix, "A11b prefix is ordinary PAIR-like aspect");
  }
}

function main(): void {
  const a = buildAuthority(false);
  const b = buildAuthority(true);
  exactJson(a, b, "selected continuation authority ignores unrelated local noise");

  execute(a);
  execute(b);

  console.log([
    "MTS v0.13 A11b:",
    "R_ARROW_A_ARROW_B=GREEN_FROZEN_CONTINUATION_CANDIDATE",
    "RESULT_CARDINALITY=ZERO_ONE_MANY",
    "RESULT_KIND=VALUE_BUNDLE",
    "DEFINED_EMPTY_NE_UNDEFINED=CONFIRMED",
    "RETURNED_LINK_AS_NEXT_FUNCTION=CONFIRMED",
    "HIGHER_ORDER_DEPTH=2",
    "INDEPENDENT_MEMORIES=2",
    "STRUCTURAL_RULE_AUTHORITY=0",
    "DICTIONARY_AUTHORITY=0",
    "HOST_ARITY_METADATA=0",
    "LIVE_ADJACENCY_AUTHORITY=REJECTED",
    "SELF_INCIDENCE_APPLICATION=OPEN",
    "HOST_CONTINUATION_READING_LAW=OPEN",
    "PRODUCTION_UNCHANGED",
  ].join(" "));
}

main();
