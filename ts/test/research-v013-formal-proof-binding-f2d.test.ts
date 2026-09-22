import { exportCanonicalTopology } from "../src/canonical-topology.js";
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
import { materializeV012SourceContent } from "../src/v012-source.js";
import {
  resolveFlatBundle,
  type BundleValue,
  type ResolvedOccurrence,
} from "../src/value-bundle.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.13 FORMAL F2d proof binding: ${message}`);
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
    assert(this.support.has(link), "F2d access stays inside selected support");
  }
  poles(link: LinkHandle): LinkPoles {
    this.require(link);
    const poles = this.source.poles(link);
    assert(
      this.support.has(poles.start) && this.support.has(poles.end),
      "F2d support is pole-closed",
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
    return Object.freeze(this.source.outgoing(start).filter((x) => this.support.has(x)));
  }
  incoming(end: LinkHandle): readonly LinkHandle[] {
    this.require(end);
    return Object.freeze(this.source.incoming(end).filter((x) => this.support.has(x)));
  }
  allLinks(): readonly LinkHandle[] { return this.ordered; }
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

interface Frame {
  readonly startRole: LinkHandle;
  readonly endRole: LinkHandle;
  readonly directMethod: LinkHandle;
}

function frame(memory: Memory): Frame {
  const basis = ensureRootBasis(memory);
  return Object.freeze({
    startRole: basis.O,
    endRole: basis.C,
    directMethod: basis.L,
  });
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

function defineWitness(
  memory: Memory,
  f: Frame,
  target: LinkHandle,
): LinkHandle {
  const poles = memory.poles(target);
  const first = memory.ensure(f.startRole, poles.start);
  const second = memory.ensure(f.endRole, poles.end);
  return memory.ensure(memory.ensure(first, second), target);
}

interface PortableAuthority {
  readonly schema: "mts-v013-formal-proof-binding/research-v0.1";
  readonly topology: StorageTopologyImage;
  readonly dictionaryCoordinate: number;
  readonly directMethodCoordinate: number;
  readonly witnessCoordinates: readonly number[];
}

function buildAuthority(noise: boolean): PortableAuthority {
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  if (noise) {
    const n0 = memory.ensure(basis.C, basis.U);
    const n1 = memory.ensure(n0, basis.L);
    memory.ensure(basis.O, n1);
  }

  const f = frame(memory);
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

  const targets = [f.directMethod, application, r1, r2] as const;
  const witnesses = targets.map((target) => defineWitness(memory, f, target));

  const support = poleClosure(memory, [
    dictionary,
    f.startRole,
    f.endRole,
    f.directMethod,
    ...witnesses,
  ]);
  const canonical = exportCanonicalTopology(new SupportView(memory, support));

  const dictionaryCoordinate = canonical.coordinates.get(dictionary);
  const directMethodCoordinate = canonical.coordinates.get(f.directMethod);
  assert(dictionaryCoordinate !== undefined, "F2d Dictionary coordinate");
  assert(directMethodCoordinate !== undefined, "F2d Direct method coordinate");

  const witnessCoordinates = witnesses.map((witness) => {
    const coordinate = canonical.coordinates.get(witness);
    assert(coordinate !== undefined, "F2d binding witness coordinate");
    return coordinate;
  });

  return Object.freeze({
    schema: "mts-v013-formal-proof-binding/research-v0.1" as const,
    topology: canonical.topology,
    dictionaryCoordinate,
    directMethodCoordinate,
    witnessCoordinates: Object.freeze(witnessCoordinates),
  });
}

interface VerifiedBinding {
  readonly target: LinkHandle;
  readonly values: ReadonlyMap<LinkHandle, LinkHandle>;
}

function verifyWitness(
  memory: ReadMemory,
  startRole: LinkHandle,
  endRole: LinkHandle,
  witness: LinkHandle,
): VerifiedBinding {
  const witnessPoles = memory.poles(witness);
  const pairPoles = memory.poles(witnessPoles.start);
  const bindingHandles = [pairPoles.start, pairPoles.end] as const;

  const values = new Map<LinkHandle, LinkHandle>();
  for (const bindingHandle of bindingHandles) {
    const binding = memory.poles(bindingHandle);
    assert(
      binding.start === startRole || binding.start === endRole,
      "F2d binding uses selected roles only",
    );
    assert(!values.has(binding.start), "F2d each selected role occurs once");
    values.set(binding.start, binding.end);
  }

  same(values.size, 2, "F2d exact role coverage");
  const startValue = values.get(startRole);
  const endValue = values.get(endRole);
  assert(startValue !== undefined && endValue !== undefined, "F2d both roles bind");

  same(
    memory.find(startValue, endValue),
    witnessPoles.end,
    "F2d witness values reconstruct exact target Link",
  );

  return Object.freeze({
    target: witnessPoles.end,
    values,
  });
}

interface Replay {
  readonly memory: Memory;
  readonly dictionary: LinkHandle;
  readonly directMethod: LinkHandle;
  readonly bindings: readonly VerifiedBinding[];
}

function replayAuthority(artifact: PortableAuthority): Replay {
  same(
    artifact.schema,
    "mts-v013-formal-proof-binding/research-v0.1",
    "F2d schema",
  );
  const memory = restoreTopology(artifact.topology);
  const all = memory.allLinks();
  const dictionary = all[artifact.dictionaryCoordinate];
  const directMethod = all[artifact.directMethodCoordinate];
  assert(dictionary !== undefined, "F2d replay Dictionary");
  assert(directMethod !== undefined, "F2d replay method");

  const basis = ensureRootBasis(memory);
  const bindings = artifact.witnessCoordinates.map((coordinate) => {
    const witness = all[coordinate];
    assert(witness !== undefined, "F2d replay binding witness");
    return verifyWitness(memory, basis.O, basis.C, witness);
  });

  exactJson(
    exportCanonicalTopology(new SupportView(memory, new Set(all))).topology,
    artifact.topology,
    "F2d canonical replay",
  );

  return Object.freeze({
    memory,
    dictionary,
    directMethod,
    bindings: Object.freeze(bindings),
  });
}

function bindingFor(
  bindings: readonly VerifiedBinding[],
  target: LinkHandle,
): VerifiedBinding {
  const found = bindings.filter((binding) => binding.target === target);
  same(found.length, 1, "F2d exact binding witness per target");
  return found[0]!;
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

function evaluateNamedApplication(
  memory: Memory,
  directMethod: LinkHandle,
  bindings: readonly VerifiedBinding[],
  fn: LinkHandle,
  argument: LinkHandle,
): BundleValue {
  const basis = ensureRootBasis(memory);
  const application = memory.find(fn, argument);
  assert(application !== undefined, "F2d selected application Link exists");

  const applicationBinding = bindingFor(bindings, application);
  const methodBinding = bindingFor(bindings, directMethod);
  const fromRole = methodBinding.values.get(basis.O);
  const toRole = methodBinding.values.get(basis.C);
  assert(fromRole !== undefined && toRole !== undefined, "F2d method role mapping exists");
  assert(
    fromRole === basis.O && toRole === basis.C,
    "F2d selected Direct method maps START->END",
  );

  assert(
    applicationBinding.values.get(fromRole) !== application,
    "F2d ordinary application is not its own direct continuation",
  );

  const occurrences: ResolvedOccurrence[] = [];
  let index = 0;
  for (const candidate of bindings) {
    if (candidate.target === directMethod) continue;
    const from = candidate.values.get(fromRole);
    const to = candidate.values.get(toRole);
    assert(from !== undefined && to !== undefined, "F2d verified candidate roles exist");
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
  for (const link of expected) assert(actual.has(link), `${message}: missing result`);
}

function execute(artifact: PortableAuthority): void {
  const { memory, dictionary, directMethod, bindings } = replayAuthority(artifact);

  const beforeKnown = memory.linkCount;
  const fn = resolveName(memory, dictionary, "f");
  const alias = resolveName(memory, dictionary, "dup");
  const arg = resolveName(memory, dictionary, "a");
  const b1 = resolveName(memory, dictionary, "b1");
  const b2 = resolveName(memory, dictionary, "b2");

  assert(fn !== undefined && alias !== undefined && arg !== undefined, "F2d input names resolve");
  assert(b1 !== undefined && b2 !== undefined, "F2d output names resolve");
  same(memory.linkCount, beforeKnown, "F2d known names reuse frozen carriers");
  same(alias, fn, "F2d alias resolves to exact same function Link");
  same(bindings.length, 4, "F2d four proof-carrying bindings");

  const result = evaluateNamedApplication(memory, directMethod, bindings, fn, arg);
  same(result.kind, "bundle", "F2d result is BundleValue");
  setSame(result.links, [b1, b2], "F2d f(a)");
  same(result.occurrences.length, 2, "F2d exact result occurrences");

  const aliasResult = evaluateNamedApplication(
    memory,
    directMethod,
    bindings,
    alias,
    arg,
  );
  setSame(aliasResult.links, [b1, b2], "F2d dup(a)");

  same(resolveName(memory, dictionary, "unknown"), undefined, "F2d unknown name rejected");
}

function main(): void {
  const a = buildAuthority(false);
  const b = buildAuthority(true);
  exactJson(a, b, "F2d portable authority ignores unrelated source noise");

  execute(a);
  execute(b);

  console.log([
    "MTS v0.13 FORMAL F2d:",
    "NAME_TO_PROOF_CARRYING_ASPECT_APPLICATION=GREEN_SCOPED_RESEARCH",
    "FLOW=STRING_DICTIONARY_LINK_APPLICATION_BUNDLE",
    "PHYSICAL_NAMES=5",
    "FUNCTION_ALIASES=2_TO_1_LINK",
    "PROOF_BINDING_WITNESSES=4",
    "RESULT_CARDINALITY=2",
    "HOST_MATCHERS=0",
    "STRUCTURAL_UNIFICATION=NOT_USED",
    "CANONICAL_BYTE_SWITCH=NOT_USED",
    "INDEPENDENT_MEMORIES=2",
    "GROUPING_F_OF_A=STILL_EXTERNAL",
    "F_KERNEL_SELF_EXTENSION=OPEN",
    "PRODUCTION_UNCHANGED",
  ].join(" "));
}

main();
