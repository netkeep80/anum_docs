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
  StructuralRuleError,
  type StructuralRoleBinding,
} from "../src/structural-rule.js";
import { unifyStructuralTemplate } from "../src/structural-unification.js";
import {
  resolveFlatBundle,
  type BundleValue,
  type ResolvedOccurrence,
} from "../src/value-bundle.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.13 A11e method orientation: ${message}`);
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
    assert(this.support.has(link), "A11e selected export support");
  }
  poles(link: LinkHandle): LinkPoles {
    this.require(link);
    const poles = this.source.poles(link);
    assert(this.support.has(poles.start) && this.support.has(poles.end),
      "A11e support is pole-closed");
    return poles;
  }
  find(start: LinkHandle, end: LinkHandle): LinkHandle | undefined {
    this.require(start); this.require(end);
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

class PoleOnlyProbe implements ReadMemory {
  constructor(private readonly source: ReadMemory) {}
  get root(): LinkHandle { return this.source.root; }
  get linkCount(): number { return this.source.linkCount; }
  poles(link: LinkHandle): LinkPoles { return this.source.poles(link); }
  find(): LinkHandle | undefined { throw new Error("A11e unification must not use find"); }
  outgoing(): readonly LinkHandle[] { throw new Error("A11e unification must not use outgoing"); }
  incoming(): readonly LinkHandle[] { throw new Error("A11e unification must not use incoming"); }
}

interface RoleFrame {
  readonly whole: LinkHandle;
  readonly startRole: LinkHandle;
  readonly endRole: LinkHandle;
  readonly directMethod: LinkHandle;
  readonly inverseMethod: LinkHandle;
}

function roleFrame(memory: Memory, whole: LinkHandle): RoleFrame {
  const startRole = memory.ensureStartSelfClosed(whole);
  const endRole = memory.ensureEndSelfClosed(whole);
  const directMethod = memory.ensure(startRole, endRole);
  const inverseMethod = memory.ensure(endRole, startRole);
  assert(startRole !== endRole, "A11e structural roles are distinct");
  assert(directMethod !== inverseMethod, "A11e direct/inverse methods are distinct");
  return Object.freeze({ whole, startRole, endRole, directMethod, inverseMethod });
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

interface PortableAuthority {
  readonly schema: "mts-v013-method-orientation/research-v0.1";
  readonly topology: StorageTopologyImage;
}

interface Refs {
  readonly frame: RoleFrame;
  readonly application: LinkHandle;
  readonly g: LinkHandle;
  readonly h: LinkHandle;
  readonly d1: LinkHandle;
  readonly d2: LinkHandle;
  readonly i1: LinkHandle;
  readonly i2: LinkHandle;
}

function build(memory: Memory, noise: boolean): {
  readonly artifact: PortableAuthority;
} {
  const basis = ensureRootBasis(memory);
  if (noise) {
    const n = memory.ensure(basis.U, basis.C);
    memory.ensure(basis.L, n);
  }

  // Equal-raw-pole whole keeps method roles demonstrably structural.
  const whole = memory.ensure(basis.L, basis.L);
  const frame = roleFrame(memory, whole);

  const fn = memory.ensure(basis.U, basis.L);
  const arg = memory.ensure(basis.L, basis.U);
  const application = memory.ensure(fn, arg);

  const g = memory.ensure(basis.O, basis.U);
  const h = memory.ensure(basis.C, basis.L);
  const d1 = memory.ensure(g, basis.C);
  const d2 = memory.ensure(g, basis.O);
  const i1 = memory.ensure(h, basis.C);
  const i2 = memory.ensure(h, basis.O);

  // Same frozen support carries both orientations around the same application:
  // direct: application -> result
  // inverse: result -> application
  const roots = [
    frame.startRole,
    frame.endRole,
    frame.directMethod,
    frame.inverseMethod,
    application,
    memory.ensure(application, d1),
    memory.ensure(application, d2),
    memory.ensure(i1, application),
    memory.ensure(i2, application),
  ];

  const support = poleClosure(memory, roots);
  const topology = exportCanonicalTopology(new ExportSupport(memory, support)).topology;
  return Object.freeze({
    artifact: Object.freeze({
      schema: "mts-v013-method-orientation/research-v0.1" as const,
      topology,
    }),
  });
}

function replay(artifact: PortableAuthority): {
  readonly memory: Memory;
  readonly selected: readonly LinkHandle[];
  readonly selectedSet: ReadonlySet<LinkHandle>;
} {
  same(artifact.schema, "mts-v013-method-orientation/research-v0.1", "A11e schema");
  const memory = restoreTopology(artifact.topology);
  const selected = Object.freeze([...memory.allLinks()]);
  const selectedSet = new Set(selected);
  exactJson(
    exportCanonicalTopology(new ExportSupport(memory, selectedSet)).topology,
    artifact.topology,
    "A11e canonical replay",
  );
  return Object.freeze({ memory, selected, selectedSet });
}

function oneBinding(
  bindings: readonly StructuralRoleBinding[],
  role: LinkHandle,
): LinkHandle {
  const found = bindings.filter((x) => x.role === role);
  same(found.length, 1, "A11e exact binding");
  return found[0]!.value;
}

function decode(
  memory: Memory,
  frame: RoleFrame,
  target: LinkHandle,
): ReadonlyMap<LinkHandle, LinkHandle> {
  const bindings = unifyStructuralTemplate(
    new PoleOnlyProbe(memory),
    frame.directMethod,
    target,
    Object.freeze([frame.startRole, frame.endRole]),
  );
  return new Map(bindings.map((x) => [x.role, x.value]));
}

function orientedRoles(
  memory: Memory,
  selectedSet: ReadonlySet<LinkHandle>,
  frame: RoleFrame,
  method: LinkHandle,
): Readonly<{ fromRole: LinkHandle; toRole: LinkHandle }> {
  assert(selectedSet.has(method), "A11e selected method has frozen authority");
  const methodMap = decode(memory, frame, method);
  const fromRole = oneBinding(
    [...methodMap].map(([role, value]) => Object.freeze({ role, value })),
    frame.startRole,
  );
  const toRole = oneBinding(
    [...methodMap].map(([role, value]) => Object.freeze({ role, value })),
    frame.endRole,
  );

  const roleSet = new Set([frame.startRole, frame.endRole]);
  assert(roleSet.has(fromRole) && roleSet.has(toRole),
    "method maps inside the selected structural role pair");
  assert(fromRole !== toRole, "method orientation must be bijective");
  return Object.freeze({ fromRole, toRole });
}

/**
 * One branch-free direction kernel.
 *
 * The method Link supplies which template role is FROM and which is TO.
 * No direct/inverse enum or boolean is inspected.
 */
function readByMethod(
  memory: Memory,
  selected: readonly LinkHandle[],
  selectedSet: ReadonlySet<LinkHandle>,
  frame: RoleFrame,
  method: LinkHandle,
  application: LinkHandle,
): BundleValue {
  assert(selectedSet.has(application), "application belongs to frozen authority");
  const orientation = orientedRoles(memory, selectedSet, frame, method);

  const occurrences: ResolvedOccurrence[] = [];
  let index = 0;
  for (const candidate of selected) {
    if (candidate === application || candidate === method) continue;
    let values: ReadonlyMap<LinkHandle, LinkHandle>;
    try {
      values = decode(memory, frame, candidate);
    } catch (error) {
      if (error instanceof StructuralRuleError) continue;
      throw error;
    }

    const from = values.get(orientation.fromRole);
    const to = values.get(orientation.toRole);
    assert(from !== undefined && to !== undefined, "oriented candidate roles resolve");
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
  for (const x of expected) assert(actual.has(x), `${message}: missing result`);
}

function recover(memory: Memory): Refs {
  const basis = ensureRootBasis(memory);
  const whole = memory.ensure(basis.L, basis.L);
  const frame = roleFrame(memory, whole);
  const fn = memory.ensure(basis.U, basis.L);
  const arg = memory.ensure(basis.L, basis.U);
  const application = memory.ensure(fn, arg);
  const g = memory.ensure(basis.O, basis.U);
  const h = memory.ensure(basis.C, basis.L);
  const d1 = memory.ensure(g, basis.C);
  const d2 = memory.ensure(g, basis.O);
  const i1 = memory.ensure(h, basis.C);
  const i2 = memory.ensure(h, basis.O);
  return Object.freeze({ frame, application, g, h, d1, d2, i1, i2 });
}

function execute(artifact: PortableAuthority): void {
  const { memory, selected, selectedSet } = replay(artifact);
  const before = memory.linkCount;
  const r = recover(memory);
  same(memory.linkCount, before, "A11e refs already exist in replayed authority");

  const direct = readByMethod(
    memory, selected, selectedSet, r.frame, r.frame.directMethod, r.application,
  );
  const inverse = readByMethod(
    memory, selected, selectedSet, r.frame, r.frame.inverseMethod, r.application,
  );

  setSame(direct.links, [r.d1, r.d2], "direct method results");
  setSame(inverse.links, [r.i1, r.i2], "inverse method results");

  // The same support is interpreted covariantly; methods select opposite role
  // mappings without a host branch.
  assert(!direct.links.has(r.i1) && !direct.links.has(r.i2),
    "direct method excludes inverse-oriented results");
  assert(!inverse.links.has(r.d1) && !inverse.links.has(r.d2),
    "inverse method excludes direct-oriented results");

  // Structurally valid but unselected method has no semantic authority.
  {
    const unselectedWhole = memory.ensure(r.g, r.h);
    const unselected = roleFrame(memory, unselectedWhole).directMethod;
    let rejected = false;
    try {
      readByMethod(memory, selected, selectedSet, r.frame, unselected, r.application);
    } catch {
      rejected = true;
    }
    assert(rejected, "unselected method fails closed");
  }

  // A collapsed orientation is not a bijection over START/END roles.
  {
    const collapsed = memory.ensure(r.frame.startRole, r.frame.startRole);
    const extended = new Set(selectedSet);
    extended.add(collapsed);
    let rejected = false;
    try {
      readByMethod(memory, selected, extended, r.frame, collapsed, r.application);
    } catch {
      rejected = true;
    }
    assert(rejected, "collapsed method fails closed");
  }
}

function main(): void {
  const a = build(new Memory(), false).artifact;
  const b = build(new Memory(), true).artifact;
  exactJson(a, b, "A11e portable authority ignores unrelated allocation noise");

  execute(a);
  execute(b);

  console.log([
    "MTS v0.13 A11e:",
    "METHOD_LINK_ORIENTATION=GREEN_SCOPED_RESEARCH",
    "DIRECT_METHOD=START_TO_END",
    "INVERSE_METHOD=END_TO_START",
    "COVARIANT_RESULT_SWAP=CONFIRMED",
    "HOST_DIRECTION_BRANCHES=0",
    "INDEPENDENT_MEMORIES=2",
    "NEGATIVE_CONTROLS=2",
    "HARDCODED_END_IS_RESULT=0",
    "GENERIC_UNIFICATION=HOST_RESIDUAL",
    "SELF_INCIDENCE_APPLICATION=OPEN",
    "PRODUCTION_UNCHANGED",
  ].join(" "));
}

main();
