import {
  exportCanonicalTopology,
} from "../src/canonical-topology.js";
import {
  defineDictionaryEffect,
  defineDictionaryScope,
  lookupScopedDictionary,
} from "../src/dictionary.js";
import {
  Memory,
  ensureRootBasis,
  type EnumerableReadMemory,
  type LinkHandle,
  type LinkPoles,
  type ReadMemory,
  type RootBasis,
} from "../src/memory.js";
import {
  restoreTopology,
  type StorageTopologyImage,
} from "../src/persistence-topology.js";
import { StructuralRuleError } from "../src/structural-rule.js";
import { unifyStructuralTemplate } from "../src/structural-unification.js";
import {
  materializeV012SourceContent,
} from "../src/v012-source.js";
import {
  resolveFlatBundle,
  type BundleValue,
  type ResolvedOccurrence,
} from "../src/value-bundle.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.13 FORMAL integrated F2c: ${message}`);
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}
function exactJson(actual: unknown, expected: unknown, message: string): void {
  same(JSON.stringify(actual), JSON.stringify(expected), message);
}
function bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

class SupportView implements EnumerableReadMemory {
  readonly root: LinkHandle;
  private readonly ordered: readonly LinkHandle[];

  constructor(
    private readonly source: ReadMemory,
    private readonly support: ReadonlySet<LinkHandle>,
  ) {
    this.root = source.root;
    this.ordered = Object.freeze([...support]);
  }

  get linkCount(): number { return this.ordered.length; }

  private require(link: LinkHandle): void {
    assert(this.support.has(link), "F2c access stays inside selected support");
  }

  poles(link: LinkHandle): LinkPoles {
    this.require(link);
    const p = this.source.poles(link);
    assert(this.support.has(p.start) && this.support.has(p.end), "F2c support pole-closed");
    return p;
  }

  find(start: LinkHandle, end: LinkHandle): LinkHandle | undefined {
    this.require(start);
    this.require(end);
    const x = this.source.find(start, end);
    return x !== undefined && this.support.has(x) ? x : undefined;
  }

  outgoing(start: LinkHandle): readonly LinkHandle[] {
    this.require(start);
    return Object.freeze(this.source.outgoing(start).filter((x) => this.support.has(x)));
  }

  incoming(end: LinkHandle): readonly LinkHandle[] {
    this.require(end);
    return Object.freeze(this.source.incoming(end).filter((x) => this.support.has(x)));
  }

  allLinks(): readonly LinkHandle[] { return this.ordered; }
}

class PoleOnlyProbe implements ReadMemory {
  constructor(private readonly source: ReadMemory) {}
  get root(): LinkHandle { return this.source.root; }
  get linkCount(): number { return this.source.linkCount; }
  poles(link: LinkHandle): LinkPoles { return this.source.poles(link); }
  find(): LinkHandle | undefined { throw new Error("F2c unification must not use find"); }
  outgoing(): readonly LinkHandle[] { throw new Error("F2c unification must not use outgoing"); }
  incoming(): readonly LinkHandle[] { throw new Error("F2c unification must not use incoming"); }
}

function poleClosure(
  memory: ReadMemory,
  roots: readonly LinkHandle[],
): ReadonlySet<LinkHandle> {
  const support = new Set<LinkHandle>();
  const pending = [memory.root, ...roots];
  while (pending.length > 0) {
    const x = pending.pop();
    if (x === undefined || support.has(x)) continue;
    const p = memory.poles(x);
    support.add(x);
    pending.push(p.start, p.end);
  }
  return support;
}

interface PortableAuthority {
  readonly schema: "mts-v013-formal-name-aspect/research-v0.1";
  readonly topology: StorageTopologyImage;
  readonly dictionaryCoordinate: number;
  readonly candidateCoordinates: readonly number[];
}

function defineName(
  memory: Memory,
  basis: RootBasis,
  dictionary: LinkHandle,
  history: LinkHandle,
  physicalName: string,
  value: LinkHandle,
): Readonly<{ dictionary: LinkHandle; history: LinkHandle }> {
  const content = materializeV012SourceContent(memory, basis, bytes(physicalName));
  const effect = defineDictionaryEffect(
    memory,
    dictionary,
    basis.R,
    history,
    content,
    value,
  );
  return Object.freeze({
    dictionary: effect.afterScope,
    history: effect.historyAfter,
  });
}

function buildAuthority(noise: boolean): PortableAuthority {
  const memory = new Memory();
  const basis = ensureRootBasis(memory);

  if (noise) {
    const n0 = memory.ensure(basis.C, basis.U);
    const n1 = memory.ensure(n0, basis.L);
    memory.ensure(basis.O, n1);
  }

  const fn = memory.ensure(basis.U, basis.L);
  const arg = memory.ensure(basis.L, basis.U);
  const b1 = memory.ensure(basis.O, fn);
  const b2 = memory.ensure(basis.C, arg);
  const application = memory.ensure(fn, arg);
  const r1 = memory.ensure(application, b1);
  const r2 = memory.ensure(application, b2);

  let history = basis.R;
  let dictionary = defineDictionaryScope(memory, basis.R, history);

  for (const [name, value] of [
    ["f", fn],
    ["dup", fn],
    ["a", arg],
    ["b1", b1],
    ["b2", b2],
  ] as const) {
    const next = defineName(memory, basis, dictionary, history, name, value);
    dictionary = next.dictionary;
    history = next.history;
  }

  const semanticCandidates = Object.freeze([application, r1, r2]);
  const support = poleClosure(memory, [dictionary, basis.L, basis.U, ...semanticCandidates]);
  const canonical = exportCanonicalTopology(new SupportView(memory, support));

  const dictionaryCoordinate = canonical.coordinates.get(dictionary);
  assert(dictionaryCoordinate !== undefined, "portable Dictionary coordinate");

  const candidateCoordinates = semanticCandidates.map((x) => {
    const coordinate = canonical.coordinates.get(x);
    assert(coordinate !== undefined, "portable continuation candidate coordinate");
    return coordinate;
  });

  return Object.freeze({
    schema: "mts-v013-formal-name-aspect/research-v0.1" as const,
    topology: canonical.topology,
    dictionaryCoordinate,
    candidateCoordinates: Object.freeze(candidateCoordinates),
  });
}

function replayAuthority(artifact: PortableAuthority): Readonly<{
  memory: Memory;
  dictionary: LinkHandle;
  candidates: readonly LinkHandle[];
}> {
  same(artifact.schema, "mts-v013-formal-name-aspect/research-v0.1", "F2c schema");
  const memory = restoreTopology(artifact.topology);
  const all = memory.allLinks();

  const dictionary = all[artifact.dictionaryCoordinate];
  assert(dictionary !== undefined, "replayed Dictionary coordinate");

  const candidates = artifact.candidateCoordinates.map((coordinate) => {
    const link = all[coordinate];
    assert(link !== undefined, "replayed candidate coordinate");
    return link;
  });

  const support = new Set(all);
  exactJson(
    exportCanonicalTopology(new SupportView(memory, support)).topology,
    artifact.topology,
    "F2c canonical replay",
  );

  return Object.freeze({
    memory,
    dictionary,
    candidates: Object.freeze(candidates),
  });
}

function resolveName(
  memory: Memory,
  dictionary: LinkHandle,
  physicalName: string,
): LinkHandle | undefined {
  const basis = ensureRootBasis(memory);
  const content = materializeV012SourceContent(memory, basis, bytes(physicalName));
  return lookupScopedDictionary(memory, dictionary, content)?.form;
}

interface RootFrame {
  readonly startRole: LinkHandle;
  readonly endRole: LinkHandle;
  readonly directMethod: LinkHandle;
}

function frame(memory: Memory): RootFrame {
  const basis = ensureRootBasis(memory);
  return Object.freeze({
    startRole: basis.O,
    endRole: basis.C,
    directMethod: basis.L,
  });
}

function decode(
  memory: Memory,
  f: RootFrame,
  target: LinkHandle,
): ReadonlyMap<LinkHandle, LinkHandle> {
  const bindings = unifyStructuralTemplate(
    new PoleOnlyProbe(memory),
    f.directMethod,
    target,
    Object.freeze([f.startRole, f.endRole]),
  );
  return new Map(bindings.map((x) => [x.role, x.value]));
}

/**
 * Direct A11h method specialized only by the selected method Link L itself.
 * There is no form/name dispatch here.
 */
function evaluateNamedApplication(
  memory: Memory,
  candidates: readonly LinkHandle[],
  fn: LinkHandle,
  argument: LinkHandle,
): BundleValue {
  const f = frame(memory);
  const application = memory.ensure(fn, argument);
  assert(candidates.includes(application), "selected application belongs to frozen authority");

  const occurrences: ResolvedOccurrence[] = [];
  let index = 0;
  for (const candidate of candidates) {
    let values: ReadonlyMap<LinkHandle, LinkHandle>;
    try {
      values = decode(memory, f, candidate);
    } catch (error) {
      if (error instanceof StructuralRuleError) continue;
      throw error;
    }

    const from = values.get(f.startRole);
    const to = values.get(f.endRole);
    assert(from !== undefined && to !== undefined, "F2c candidate roles resolve");
    if (from !== application) continue;

    occurrences.push(Object.freeze({
      path: Object.freeze([index]),
      link: to,
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
  for (const x of expected) assert(actual.has(x), `${message}: missing expected Link`);
}

function execute(artifact: PortableAuthority): void {
  const { memory, dictionary, candidates } = replayAuthority(artifact);

  const beforeKnown = memory.linkCount;
  const fn = resolveName(memory, dictionary, "f");
  const alias = resolveName(memory, dictionary, "dup");
  const arg = resolveName(memory, dictionary, "a");
  const b1 = resolveName(memory, dictionary, "b1");
  const b2 = resolveName(memory, dictionary, "b2");

  assert(fn !== undefined && alias !== undefined && arg !== undefined, "known input names resolve");
  assert(b1 !== undefined && b2 !== undefined, "known output names resolve");
  same(memory.linkCount, beforeKnown, "known source names reuse frozen carriers");
  same(alias, fn, "physical aliases resolve to one semantic function Link");

  const result = evaluateNamedApplication(memory, candidates, fn, arg);
  same(result.kind, "bundle", "integrated result is BundleValue");
  setSame(result.links, [b1, b2], "f(a) exact result bundle");
  same(result.occurrences.length, 2, "f(a) result occurrence count");

  const aliasResult = evaluateNamedApplication(memory, candidates, alias, arg);
  setSame(aliasResult.links, [b1, b2], "dup(a) alias exact result bundle");

  const unknown = resolveName(memory, dictionary, "unknown");
  same(unknown, undefined, "unknown physical name has no semantic Use");
}

function main(): void {
  const a = buildAuthority(false);
  const b = buildAuthority(true);
  exactJson(a, b, "combined portable authority ignores unrelated local noise");

  execute(a);
  execute(b);

  console.log([
    "MTS v0.13 FORMAL F2c:",
    "NAME_TO_ASPECT_APPLICATION=GREEN_SCOPED_RESEARCH",
    "PHYSICAL_NAMES=5",
    "FUNCTION_ALIASES=2_TO_1_LINK",
    "FLOW=STRING_TO_DICTIONARY_TO_LINK_TO_APPLICATION_TO_BUNDLE",
    "RESULT_CARDINALITY=2",
    "RESULT_KIND=VALUE_BUNDLE",
    "CANONICAL_BYTE_SWITCH=NOT_USED",
    "NAME_FORM_SPECIFIC_HOST_BRANCHES=0",
    "INDEPENDENT_MEMORIES=2",
    "GENERIC_UNIFICATION=HOST_RESIDUAL",
    "F_KERNEL_SELF_EXTENSION=STILL_OPEN_RED_BASELINE",
    "PRODUCTION_UNCHANGED",
  ].join(" "));
}

main();
