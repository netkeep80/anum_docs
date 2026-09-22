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
  type RootBasis,
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
  if (!condition) throw new Error(`v0.13 A11d Dual-role template: ${message}`);
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
    assert(this.support.has(link), "A11d export stays inside selected support");
  }

  poles(link: LinkHandle): LinkPoles {
    this.require(link);
    const poles = this.source.poles(link);
    assert(this.support.has(poles.start) && this.support.has(poles.end),
      "A11d selected support is pole-closed");
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
    return Object.freeze(this.source.outgoing(start).filter((link) => this.support.has(link)));
  }

  incoming(end: LinkHandle): readonly LinkHandle[] {
    this.require(end);
    return Object.freeze(this.source.incoming(end).filter((link) => this.support.has(link)));
  }

  allLinks(): readonly LinkHandle[] { return this.ordered; }
}

class PoleOnlyProbe implements ReadMemory {
  constructor(private readonly source: ReadMemory) {}
  get root(): LinkHandle { return this.source.root; }
  get linkCount(): number { return this.source.linkCount; }
  poles(link: LinkHandle): LinkPoles { return this.source.poles(link); }
  find(): LinkHandle | undefined { throw new Error("A11d unification must not use find"); }
  outgoing(): readonly LinkHandle[] { throw new Error("A11d unification must not use outgoing"); }
  incoming(): readonly LinkHandle[] { throw new Error("A11d unification must not use incoming"); }
}

interface DualTemplate {
  readonly whole: LinkHandle;
  readonly startRole: LinkHandle;
  readonly endRole: LinkHandle;
  readonly dual: LinkHandle;
}

function materializeDualTemplate(memory: Memory, whole: LinkHandle): DualTemplate {
  const startRole = memory.ensureStartSelfClosed(whole);
  const endRole = memory.ensureEndSelfClosed(whole);
  const dual = memory.ensure(startRole, endRole);
  return Object.freeze({ whole, startRole, endRole, dual });
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
  readonly schema: "mts-v013-dual-role-continuation/research-v0.1";
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
  readonly equalWhole: LinkHandle;
  readonly roleTemplate: DualTemplate;
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

  // Ordinary PAIR-aspect whole with equal raw endpoint values.
  const equalWhole = memory.ensure(basis.L, basis.L);
  assert(equalWhole !== basis.L, "equal raw-pole whole is not its endpoint value");
  const roleTemplate = materializeDualTemplate(memory, equalWhole);
  return Object.freeze({ a0, a1, aMany, a2, g, h, z1, z2, equalWhole, roleTemplate });
}

function defineResult(
  memory: Memory,
  fn: LinkHandle,
  argument: LinkHandle,
  result: LinkHandle,
): readonly [LinkHandle, LinkHandle] {
  const application = memory.ensure(fn, argument);
  return Object.freeze([application, memory.ensure(application, result)]);
}

function buildAuthority(noise: boolean): PortableAuthority {
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  if (noise) {
    const n0 = memory.ensure(basis.C, basis.U);
    memory.ensure(n0, basis.C);
  }

  const r = refs(memory);
  const roots: LinkHandle[] = [
    r.roleTemplate.startRole,
    r.roleTemplate.endRole,
    r.roleTemplate.dual,
  ];

  roots.push(memory.ensure(basis.R, r.a0));

  const [one, oneResult] = defineResult(memory, basis.R, r.a1, r.g);
  roots.push(one, oneResult);

  const many = memory.ensure(basis.R, r.aMany);
  roots.push(many, memory.ensure(many, r.g), memory.ensure(many, r.h));

  const [gApp, gResult] = defineResult(memory, r.g, r.a2, r.z1);
  const [hApp, hResult] = defineResult(memory, r.h, r.a2, r.z2);
  roots.push(gApp, gResult, hApp, hResult);

  const support = poleClosure(memory, roots);
  const canonical = exportCanonicalTopology(new ExportSupport(memory, support));
  return Object.freeze({
    schema: "mts-v013-dual-role-continuation/research-v0.1" as const,
    topology: canonical.topology,
  });
}

function replayAuthority(artifact: PortableAuthority): {
  readonly memory: Memory;
  readonly selected: readonly LinkHandle[];
  readonly selectedSet: ReadonlySet<LinkHandle>;
} {
  same(artifact.schema, "mts-v013-dual-role-continuation/research-v0.1", "A11d schema");
  const memory = restoreTopology(artifact.topology);
  const selected = Object.freeze([...memory.allLinks()]);
  const selectedSet = new Set(selected);
  exactJson(
    exportCanonicalTopology(new ExportSupport(memory, selectedSet)).topology,
    artifact.topology,
    "A11d canonical replay",
  );
  return Object.freeze({ memory, selected, selectedSet });
}

function binding(
  bindings: readonly StructuralRoleBinding[],
  role: LinkHandle,
): LinkHandle {
  const matches = bindings.filter((item) => item.role === role);
  same(matches.length, 1, "A11d exact role binding cardinality");
  return matches[0]!.value;
}

function decodeWithDualTemplate(
  memory: Memory,
  template: DualTemplate,
  target: LinkHandle,
): Readonly<{ start: LinkHandle; end: LinkHandle }> {
  const bindings = unifyStructuralTemplate(
    new PoleOnlyProbe(memory),
    template.dual,
    target,
    Object.freeze([template.startRole, template.endRole]),
  );
  return Object.freeze({
    start: binding(bindings, template.startRole),
    end: binding(bindings, template.endRole),
  });
}

function readContinuations(
  memory: Memory,
  selected: readonly LinkHandle[],
  selectedSet: ReadonlySet<LinkHandle>,
  template: DualTemplate,
  application: LinkHandle,
): BundleValue {
  assert(selectedSet.has(application), "A11d application belongs to selected authority");

  const occurrences: ResolvedOccurrence[] = [];
  let index = 0;
  for (const candidate of selected) {
    let decoded: Readonly<{ start: LinkHandle; end: LinkHandle }>;
    try {
      decoded = decodeWithDualTemplate(memory, template, candidate);
    } catch (error) {
      if (error instanceof StructuralRuleError) continue;
      throw error;
    }
    if (candidate === application || decoded.start !== application) continue;
    occurrences.push(Object.freeze({
      path: Object.freeze([index]),
      link: decoded.end,
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
  for (const link of expected) assert(actual.has(link), `${message}: missing expected Link`);
}

function execute(artifact: PortableAuthority): void {
  const replay = replayAuthority(artifact);
  const { memory, selected, selectedSet } = replay;
  const before = memory.linkCount;
  const basis = ensureRootBasis(memory);
  const r = refs(memory);
  same(memory.linkCount, before, "A11d refs already exist after replay");

  // Root specialization: L is exactly Dual(R).
  const rootDual = materializeDualTemplate(memory, basis.R);
  same(rootDual.startRole, basis.O, "START(R)=O");
  same(rootDual.endRole, basis.C, "END(R)=C");
  same(rootDual.dual, basis.L, "Dual(R)=L");

  // Falsifier: raw equal endpoint values cannot be two distinct role placeholders.
  const equalRaw = memory.poles(r.equalWhole);
  same(equalRaw.start, basis.L, "equal raw whole start");
  same(equalRaw.end, basis.L, "equal raw whole end");
  let duplicateRejected = false;
  try {
    unifyStructuralTemplate(
      new PoleOnlyProbe(memory),
      r.equalWhole,
      basis.L,
      Object.freeze([equalRaw.start, equalRaw.end]),
    );
  } catch (error) {
    assert(error instanceof StructuralRuleError, "naive raw-role failure type");
    same(error.code, "duplicate-role", "naive raw endpoint roles are not general");
    duplicateRejected = true;
  }
  assert(duplicateRejected, "equal raw endpoints falsify naive two-role model");

  // Structural START/END role Links stay distinct for the same equal-pole whole.
  assert(r.roleTemplate.startRole !== r.roleTemplate.endRole,
    "START(A) and END(A) are distinct role Links despite equal raw endpoints");

  // One non-root Dual(A) template decodes every current basis topology.
  for (const [target, label] of [
    [basis.R, "R"],
    [basis.O, "O"],
    [basis.C, "C"],
    [basis.L, "L"],
    [basis.U, "U"],
  ] as const) {
    const expected = memory.poles(target);
    const decoded = decodeWithDualTemplate(memory, r.roleTemplate, target);
    same(decoded.start, expected.start, `${label}: Dual(A) inferred start`);
    same(decoded.end, expected.end, `${label}: Dual(A) inferred end`);
  }

  const zero = memory.ensure(basis.R, r.a0);
  const one = memory.ensure(basis.R, r.a1);
  const many = memory.ensure(basis.R, r.aMany);
  const gApp = memory.ensure(r.g, r.a2);
  const hApp = memory.ensure(r.h, r.a2);

  same(readContinuations(memory, selected, selectedSet, r.roleTemplate, zero).links.size,
    0, "R(a0)");
  setSame(
    readContinuations(memory, selected, selectedSet, r.roleTemplate, one).links,
    [r.g],
    "R(a1)",
  );
  setSame(
    readContinuations(memory, selected, selectedSet, r.roleTemplate, many).links,
    [r.g, r.h],
    "R(aMany)",
  );
  setSame(
    readContinuations(memory, selected, selectedSet, r.roleTemplate, gApp).links,
    [r.z1],
    "g(a2)",
  );
  setSame(
    readContinuations(memory, selected, selectedSet, r.roleTemplate, hApp).links,
    [r.z2],
    "h(a2)",
  );
}

function main(): void {
  const a = buildAuthority(false);
  const b = buildAuthority(true);
  exactJson(a, b, "A11d authority ignores unrelated allocation noise");

  execute(a);
  execute(b);

  console.log([
    "MTS v0.13 A11d:",
    "DUAL_A_ROLE_TEMPLATE=GREEN_SCOPED_RESEARCH",
    "ROOT_SPECIALIZATION_DUAL_R_EQ_L=CONFIRMED",
    "RAW_EQUAL_ENDPOINT_ROLE_MODEL=RED_CONFIRMED",
    "STRUCTURAL_START_END_ROLES=DISTINCT",
    "BASIS_TARGETS=R_O_C_L_U",
    "R_ARROW_A_ARROW_B=ZERO_ONE_MANY_PRESERVED",
    "HARDCODED_ROOT_O_C_ROLES=0",
    "INDEPENDENT_MEMORIES=2",
    "DIRECTION_END_ROLE_AS_RESULT=HOST_RESIDUAL",
    "GENERIC_UNIFICATION=HOST_RESIDUAL",
    "PRODUCTION_UNCHANGED",
  ].join(" "));
}

main();
