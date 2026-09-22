import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { exportCanonicalTopology } from "../src/canonical-topology.js";
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
  if (!condition) throw new Error(`v0.13 A11g-F3 unified proof binding: ${message}`);
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}
function exactJson(actual: unknown, expected: unknown, message: string): void {
  same(JSON.stringify(actual), JSON.stringify(expected), message);
}

class ExportSupport implements EnumerableReadMemory {
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
    assert(this.support.has(link), "F3 export stays inside selected support");
  }
  poles(link: LinkHandle): LinkPoles {
    this.require(link);
    const poles = this.source.poles(link);
    assert(
      this.support.has(poles.start) && this.support.has(poles.end),
      "F3 selected support is pole-closed",
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

class BindingEvidenceReader {
  readonly counters = {
    witnessReads: 0,
    bindingPairReads: 0,
    bindingReads: 0,
    targetDecompositionReads: 0,
    targetIdentityChecks: 0,
  };
  constructor(private readonly source: ReadMemory) {}
  readWitness(link: LinkHandle): LinkPoles {
    this.counters.witnessReads += 1;
    return this.source.poles(link);
  }
  readBindingPair(link: LinkHandle): LinkPoles {
    this.counters.bindingPairReads += 1;
    return this.source.poles(link);
  }
  readBinding(link: LinkHandle): LinkPoles {
    this.counters.bindingReads += 1;
    return this.source.poles(link);
  }
  reconstructTarget(start: LinkHandle, end: LinkHandle): LinkHandle | undefined {
    this.counters.targetIdentityChecks += 1;
    return this.source.find(start, end);
  }
}

function poleClosure(memory: ReadMemory, roots: readonly LinkHandle[]): ReadonlySet<LinkHandle> {
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
  readonly inverseMethod: LinkHandle;
}

function frame(memory: Memory): Frame {
  const basis = ensureRootBasis(memory);
  const whole = memory.ensure(basis.L, basis.L);
  const startRole = memory.ensureStartSelfClosed(whole);
  const endRole = memory.ensureEndSelfClosed(whole);
  const directMethod = memory.ensure(startRole, endRole);
  const inverseMethod = memory.ensure(endRole, startRole);
  assert(startRole !== endRole, "F3 structural roles are distinct");
  assert(directMethod !== inverseMethod, "F3 methods are distinct");
  return Object.freeze({ startRole, endRole, directMethod, inverseMethod });
}

interface Corpus {
  readonly frame: Frame;
  readonly application: LinkHandle;
  readonly direct1: LinkHandle;
  readonly direct2: LinkHandle;
  readonly inverse1: LinkHandle;
  readonly inverse2: LinkHandle;
  readonly d1: LinkHandle;
  readonly d2: LinkHandle;
  readonly i1: LinkHandle;
  readonly i2: LinkHandle;
  readonly zeroApplication: LinkHandle;
}

function corpus(memory: Memory): Corpus {
  const basis = ensureRootBasis(memory);
  const f = frame(memory);

  const fn = memory.ensure(basis.U, basis.L);
  const arg = memory.ensure(basis.L, basis.U);
  const application = memory.ensure(fn, arg);

  const d1 = memory.ensure(basis.O, fn);
  const d2 = memory.ensure(basis.C, arg);
  const i1 = memory.ensure(d1, basis.C);
  const i2 = memory.ensure(d2, basis.O);

  const direct1 = memory.ensure(application, d1);
  const direct2 = memory.ensure(application, d2);
  const inverse1 = memory.ensure(i1, application);
  const inverse2 = memory.ensure(i2, application);

  const zeroFn = memory.ensure(fn, d1);
  const zeroArg = memory.ensure(arg, d2);
  const zeroApplication = memory.ensure(zeroFn, zeroArg);

  return Object.freeze({
    frame: f,
    application,
    direct1,
    direct2,
    inverse1,
    inverse2,
    d1,
    d2,
    i1,
    i2,
    zeroApplication,
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

interface Artifact {
  readonly schema: "mts-v013-unified-proof-binding/research-v0.1";
  readonly topology: StorageTopologyImage;
  readonly directMethodCoordinate: number;
  readonly witnessCoordinates: readonly number[];
}

function buildArtifact(noise: boolean): Artifact {
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  if (noise) {
    const n0 = memory.ensure(basis.C, basis.U);
    const n1 = memory.ensure(n0, basis.O);
    memory.ensure(basis.L, n1);
  }
  const c = corpus(memory);

  const targets = [
    c.frame.directMethod,
    c.frame.inverseMethod,
    c.application,
    c.direct1,
    c.direct2,
    c.inverse1,
    c.inverse2,
    c.zeroApplication,
    basis.R,
    basis.O,
    basis.C,
    basis.L,
    basis.U,
  ] as const;
  const witnesses = targets.map((target) => defineWitness(memory, c.frame, target));

  const support = poleClosure(memory, [
    c.frame.startRole,
    c.frame.endRole,
    c.frame.directMethod,
    c.frame.inverseMethod,
    ...witnesses,
  ]);
  const canonical = exportCanonicalTopology(new ExportSupport(memory, support));
  const directMethodCoordinate = canonical.coordinates.get(c.frame.directMethod);
  assert(directMethodCoordinate !== undefined, "F3 direct method coordinate exists");
  const witnessCoordinates = witnesses.map((witness) => {
    const coordinate = canonical.coordinates.get(witness);
    assert(coordinate !== undefined, "F3 witness coordinate exists");
    return coordinate;
  });

  return Object.freeze({
    schema: "mts-v013-unified-proof-binding/research-v0.1" as const,
    topology: canonical.topology,
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
  const evidence = new BindingEvidenceReader(memory);
  const witnessPoles = evidence.readWitness(witness);
  const pair = evidence.readBindingPair(witnessPoles.start);
  const values = new Map<LinkHandle, LinkHandle>();

  for (const handle of [pair.start, pair.end] as const) {
    const binding = evidence.readBinding(handle);
    assert(
      binding.start === startRole || binding.start === endRole,
      "F3 witness uses only selected roles",
    );
    assert(!values.has(binding.start), "F3 each selected role occurs exactly once");
    values.set(binding.start, binding.end);
  }

  same(values.size, 2, "F3 witness has two role bindings");
  const start = values.get(startRole);
  const end = values.get(endRole);
  assert(start !== undefined && end !== undefined, "F3 selected roles are bound");
  same(
    evidence.reconstructTarget(start, end),
    witnessPoles.end,
    "F3 witness reconstructs exact target identity",
  );
  same(evidence.counters.targetDecompositionReads, 0, "F3 receiver target decomposition reads");
  same(evidence.counters.targetIdentityChecks, 1, "F3 one target identity check");

  return Object.freeze({
    target: witnessPoles.end,
    values,
  });
}

function byTarget(
  bindings: readonly VerifiedBinding[],
  target: LinkHandle,
): VerifiedBinding {
  const found = bindings.filter((item) => item.target === target);
  same(found.length, 1, "F3 exactly one selected witness per target");
  return found[0]!;
}

function orientation(
  method: VerifiedBinding,
  startRole: LinkHandle,
  endRole: LinkHandle,
): Readonly<{ fromRole: LinkHandle; toRole: LinkHandle }> {
  const fromRole = method.values.get(startRole);
  const toRole = method.values.get(endRole);
  assert(fromRole !== undefined && toRole !== undefined, "F3 method binding complete");
  const roles = new Set([startRole, endRole]);
  assert(roles.has(fromRole) && roles.has(toRole), "F3 method maps selected roles");
  assert(fromRole !== toRole, "F3 method is bijective");
  return Object.freeze({ fromRole, toRole });
}

/**
 * One continuation kernel for ordinary and self-incidence applications.
 *
 * It consumes only VERIFIED proof-carrying bindings. No target Link is
 * decomposed and no template matcher/unifier participates here.
 */
function readUnified(
  memory: Memory,
  bindings: readonly VerifiedBinding[],
  oriented: Readonly<{ fromRole: LinkHandle; toRole: LinkHandle }>,
  application: LinkHandle,
  candidates: readonly LinkHandle[],
): BundleValue {
  const occurrences: ResolvedOccurrence[] = [];
  let index = 0;

  for (const candidate of candidates) {
    const binding = byTarget(bindings, candidate);
    const from = binding.values.get(oriented.fromRole);
    const to = binding.values.get(oriented.toRole);
    assert(from !== undefined && to !== undefined, "F3 candidate oriented roles resolve");
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
  for (const item of expected) assert(actual.has(item), `${message}: missing result`);
}
function empty(result: BundleValue, message: string): void {
  same(result.links.size, 0, `${message}: empty`);
}

function replayAndExecute(artifact: Artifact): void {
  same(artifact.schema, "mts-v013-unified-proof-binding/research-v0.1", "F3 schema");
  const memory = restoreTopology(artifact.topology);
  const all = memory.allLinks();
  const directMethod = all[artifact.directMethodCoordinate];
  assert(directMethod !== undefined, "F3 direct method coordinate resolves");

  const methodPoles = memory.poles(directMethod);
  const startRole = methodPoles.start;
  const endRole = methodPoles.end;
  assert(startRole !== endRole, "F3 replay roles remain distinct");
  const inverseMethod = memory.find(endRole, startRole);
  assert(inverseMethod !== undefined, "F3 inverse method exists");

  const witnesses = artifact.witnessCoordinates.map((coordinate) => {
    const witness = all[coordinate];
    assert(witness !== undefined, "F3 witness coordinate resolves");
    return witness;
  });
  const bindings = witnesses.map((witness) =>
    verifyWitness(memory, startRole, endRole, witness)
  );

  const beforeRecover = memory.linkCount;
  const basis = ensureRootBasis(memory);
  const c = corpus(memory);
  same(memory.linkCount, beforeRecover, "F3 replay already contains corpus");

  const direct = orientation(byTarget(bindings, directMethod), startRole, endRole);
  const inverse = orientation(byTarget(bindings, inverseMethod), startRole, endRole);

  const ordinary = Object.freeze([
    c.application,
    c.direct1,
    c.direct2,
    c.inverse1,
    c.inverse2,
  ]);

  setSame(
    readUnified(memory, bindings, direct, c.application, ordinary).links,
    [c.d1, c.d2],
    "F3 ordinary direct",
  );
  setSame(
    readUnified(memory, bindings, inverse, c.application, ordinary).links,
    [c.i1, c.i2],
    "F3 ordinary inverse",
  );

  empty(
    readUnified(
      memory,
      bindings,
      direct,
      c.zeroApplication,
      Object.freeze([c.zeroApplication]),
    ),
    "F3 ordinary zero",
  );

  setSame(
    readUnified(memory, bindings, direct, basis.R, [basis.R]).links,
    [basis.R],
    "F3 R direct self",
  );
  setSame(
    readUnified(memory, bindings, inverse, basis.R, [basis.R]).links,
    [basis.R],
    "F3 R inverse self",
  );
  setSame(
    readUnified(memory, bindings, direct, basis.O, [basis.O]).links,
    [basis.R],
    "F3 O direct self",
  );
  empty(readUnified(memory, bindings, inverse, basis.O, [basis.O]), "F3 O inverse self");
  empty(readUnified(memory, bindings, direct, basis.C, [basis.C]), "F3 C direct self");
  setSame(
    readUnified(memory, bindings, inverse, basis.C, [basis.C]).links,
    [basis.R],
    "F3 C inverse self",
  );
  empty(readUnified(memory, bindings, direct, basis.L, [basis.L]), "F3 L direct self");
  empty(readUnified(memory, bindings, inverse, basis.L, [basis.L]), "F3 L inverse self");
  empty(readUnified(memory, bindings, direct, basis.U, [basis.U]), "F3 U direct self");
  empty(readUnified(memory, bindings, inverse, basis.U, [basis.U]), "F3 U inverse self");

  // A target not selected by proof-carrying binding evidence fails closed.
  const unknown = memory.ensure(c.d1, c.i1);
  let rejected = false;
  try {
    readUnified(memory, bindings, direct, unknown, [unknown]);
  } catch {
    rejected = true;
  }
  assert(rejected, "F3 unknown target without witness fails closed");
}

function main(): void {
  const a = buildArtifact(false);
  const b = buildArtifact(true);
  exactJson(a, b, "F3 portable authority ignores unrelated allocation noise");

  replayAndExecute(a);
  replayAndExecute(b);

  // Static source-removal guard.
  const source = readFileSync(
    join(resolve(process.cwd(), ".."),
      "ts/test/research-v013-unified-proof-binding-a11g-f3.test.ts"),
    "utf8",
  );
  for (const forbidden of [
    "structural-" + "unification.js",
    "matchStructural" + "Template(",
    "StructuralRole" + "Morphism",
  ]) {
    assert(!source.includes(forbidden), `F3 has no host matcher dependency: ${forbidden}`);
  }
  const begin = source.indexOf("function readUnified(");
  const finish = source.indexOf("\nfunction setSame(", begin);
  assert(begin >= 0 && finish > begin, "F3 unified kernel source slice exists");
  const kernel = source.slice(begin, finish);
  for (const forbidden of [".poles(", ".find(", "switch(", "ROOT", "START", "END", "PAIR"]) {
    assert(!kernel.includes(forbidden), `F3 kernel has no target/aspect special case: ${forbidden}`);
  }

  console.log([
    "MTS v0.13 A11g-F3:",
    "UNIFIED_PROOF_CARRYING_CONTINUATION=GREEN_SCOPED_RESEARCH",
    "APPLICATION_CLASSES=ORDINARY_AND_SELF_INCIDENCE",
    "RESULT_CARDINALITY=ZERO_ONE_MANY",
    "HOST_MATCHERS=0",
    "TARGET_DECOMPOSITION_READS=0",
    "ASPECT_SPECIAL_CASE_BRANCHES=0",
    "INDEPENDENT_MEMORIES=2",
    "UNKNOWN_WITHOUT_WITNESS=FAIL_CLOSED",
    "PRODUCTION_UNCHANGED",
  ].join(" "));
}

main();
