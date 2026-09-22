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
  if (!condition) throw new Error(`v0.13 A11c L-template continuation: ${message}`);
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

  get linkCount(): number {
    return this.ordered.length;
  }

  private require(link: LinkHandle): void {
    assert(this.support.has(link), "A11c export stays inside selected support");
  }

  poles(link: LinkHandle): LinkPoles {
    this.require(link);
    const poles = this.source.poles(link);
    assert(
      this.support.has(poles.start) && this.support.has(poles.end),
      "A11c selected support is pole-closed",
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

class PoleOnlyProbe implements ReadMemory {
  constructor(private readonly source: ReadMemory) {}
  get root(): LinkHandle { return this.source.root; }
  get linkCount(): number { return this.source.linkCount; }
  poles(link: LinkHandle): LinkPoles { return this.source.poles(link); }
  find(): LinkHandle | undefined {
    throw new Error("A11c aspect decoder must not use find");
  }
  outgoing(): readonly LinkHandle[] {
    throw new Error("A11c aspect decoder must not use outgoing");
  }
  incoming(): readonly LinkHandle[] {
    throw new Error("A11c aspect decoder must not use incoming");
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

interface PortableAuthority {
  readonly schema: "mts-v013-l-template-continuation/research-v0.1";
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
  const application = memory.ensure(fn, argument);
  return Object.freeze([application, memory.ensure(application, result)]);
}

function buildAuthority(noise: boolean): PortableAuthority {
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  if (noise) {
    const n0 = memory.ensure(basis.C, basis.U);
    const n1 = memory.ensure(n0, basis.C);
    memory.ensure(basis.L, n1);
  }

  const r = refs(memory);
  const roots: LinkHandle[] = [];

  const zero = memory.ensure(basis.R, r.a0);
  roots.push(zero);

  const [one, oneResult] = defineResult(memory, basis.R, r.a1, r.g);
  roots.push(one, oneResult);

  const many = memory.ensure(basis.R, r.aMany);
  roots.push(
    many,
    memory.ensure(many, r.g),
    memory.ensure(many, r.h),
  );

  const [gApplication, gResult] = defineResult(memory, r.g, r.a2, r.z1);
  const [hApplication, hResult] = defineResult(memory, r.h, r.a2, r.z2);
  roots.push(gApplication, gResult, hApplication, hResult);

  const support = poleClosure(memory, roots);
  const canonical = exportCanonicalTopology(new ExportSupport(memory, support));
  return Object.freeze({
    schema: "mts-v013-l-template-continuation/research-v0.1" as const,
    topology: canonical.topology,
  });
}

function replayAuthority(
  artifact: PortableAuthority,
): {
  readonly memory: Memory;
  readonly selected: readonly LinkHandle[];
  readonly selectedSet: ReadonlySet<LinkHandle>;
} {
  same(
    artifact.schema,
    "mts-v013-l-template-continuation/research-v0.1",
    "A11c authority schema",
  );
  const memory = restoreTopology(artifact.topology);
  const selected = Object.freeze([...memory.allLinks()]);
  const selectedSet = new Set(selected);
  const canonical = exportCanonicalTopology(new ExportSupport(memory, selectedSet));
  exactJson(canonical.topology, artifact.topology, "A11c authority canonical replay");
  return Object.freeze({ memory, selected, selectedSet });
}

function binding(
  bindings: readonly StructuralRoleBinding[],
  role: LinkHandle,
): LinkHandle {
  const matches = bindings.filter((item) => item.role === role);
  same(matches.length, 1, "A11c exact inferred role cardinality");
  return matches[0]!.value;
}

/**
 * Decode one Link only through the grounded L=O⟼C template.
 *
 * O and C are declared as L's two ordered roles. There is no target-kind enum
 * and no direct target poles() call in this decoder.
 */
function decodeWithL(
  memory: Memory,
  basis: RootBasis,
  target: LinkHandle,
): Readonly<{ start: LinkHandle; end: LinkHandle }> {
  const bindings = unifyStructuralTemplate(
    new PoleOnlyProbe(memory),
    basis.L,
    target,
    Object.freeze([basis.O, basis.C]),
  );
  return Object.freeze({
    start: binding(bindings, basis.O),
    end: binding(bindings, basis.C),
  });
}

/**
 * A11c continuation reader.
 *
 * It receives an already-existing application Link F⟼a. The selected support
 * is frozen before any later live mutation. Every selected candidate Link is
 * structurally decoded by the same L template; candidates whose inferred
 * O-role equals the application Link contribute their inferred C-role as a
 * result continuation.
 *
 * No find/outgoing/incoming/direct-poles operation is used by this kernel.
 */
function readLTemplateContinuations(
  memory: Memory,
  basis: RootBasis,
  selected: readonly LinkHandle[],
  selectedSet: ReadonlySet<LinkHandle>,
  application: LinkHandle,
): BundleValue {
  assert(selectedSet.has(application), "application is defined by frozen selected authority");

  const occurrences: ResolvedOccurrence[] = [];
  let index = 0;
  for (const candidate of selected) {
    let decoded: Readonly<{ start: LinkHandle; end: LinkHandle }>;
    try {
      decoded = decodeWithL(memory, basis, candidate);
    } catch (error) {
      if (error instanceof StructuralRuleError) continue;
      throw error;
    }

    // Strict continuation occurrence. A self-incidence application Link must
    // not silently count itself as its own result; A11e owns that boundary.
    if (candidate === application) continue;
    if (decoded.start !== application) continue;

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

function verifyUniversalLTemplate(memory: Memory, basis: RootBasis): void {
  for (const [target, expectedStart, expectedEnd, label] of [
    [basis.R, basis.R, basis.R, "R"],
    [basis.O, basis.O, basis.R, "O"],
    [basis.C, basis.R, basis.C, "C"],
    [basis.L, basis.O, basis.C, "L"],
    [basis.U, basis.C, basis.O, "U"],
  ] as const) {
    const decoded = decodeWithL(memory, basis, target);
    same(decoded.start, expectedStart, `L template ${label} start`);
    same(decoded.end, expectedEnd, `L template ${label} end`);
  }
}

function execute(artifact: PortableAuthority): void {
  const replay = replayAuthority(artifact);
  const { memory, selected, selectedSet } = replay;
  const beforeRefs = memory.linkCount;
  const basis = ensureRootBasis(memory);
  const r = refs(memory);
  same(memory.linkCount, beforeRefs, "A11c invocation refs already belong to authority");

  // One L template decodes every current rooted-basis topology, including
  // self-incidence cases, when O/C are treated as its structural roles.
  verifyUniversalLTemplate(memory, basis);

  const zero = memory.ensure(basis.R, r.a0);
  const one = memory.ensure(basis.R, r.a1);
  const many = memory.ensure(basis.R, r.aMany);
  const gApplication = memory.ensure(r.g, r.a2);
  const hApplication = memory.ensure(r.h, r.a2);

  {
    const result = readLTemplateContinuations(memory, basis, selected, selectedSet, zero);
    same(result.links.size, 0, "R(a0) zero cardinality");
  }
  {
    const result = readLTemplateContinuations(memory, basis, selected, selectedSet, one);
    setSame(result.links, [r.g], "R(a1)");
    same(result.occurrences.length, 1, "R(a1) occurrence count");
  }
  {
    const result = readLTemplateContinuations(memory, basis, selected, selectedSet, many);
    setSame(result.links, [r.g, r.h], "R(aMany)");
    same(result.occurrences.length, 2, "R(aMany) occurrence count");
  }
  {
    const gResult = readLTemplateContinuations(
      memory, basis, selected, selectedSet, gApplication,
    );
    const hResult = readLTemplateContinuations(
      memory, basis, selected, selectedSet, hApplication,
    );
    setSame(gResult.links, [r.z1], "g(a2)");
    setSame(hResult.links, [r.z2], "h(a2)");
  }

  // Undefined application Link exists live but is outside frozen authority.
  {
    const unknown = memory.ensure(r.z1, r.z2);
    let rejected = false;
    try {
      readLTemplateContinuations(memory, basis, selected, selectedSet, unknown);
    } catch {
      rejected = true;
    }
    assert(rejected, "unknown application outside selected authority fails closed");
  }

  // Live continuation added after freeze is not in selected[] and has no effect.
  {
    const liveOnly = memory.ensure(r.z2, r.z1);
    memory.ensure(one, liveOnly);
    const still = readLTemplateContinuations(memory, basis, selected, selectedSet, one);
    setSame(still.links, [r.g], "later live continuation cannot alter frozen result");
  }
}

function main(): void {
  const a = buildAuthority(false);
  const b = buildAuthority(true);
  exactJson(a, b, "A11c portable authority ignores unrelated local noise");

  execute(a);
  execute(b);

  console.log([
    "MTS v0.13 A11c:",
    "L_UNIVERSAL_TWO_POLE_TEMPLATE=GREEN_SCOPED_RESEARCH",
    "BASIS_TARGETS=R_O_C_L_U",
    "R_ARROW_A_ARROW_B_VIA_L_TEMPLATE=GREEN",
    "RESULT_CARDINALITY=ZERO_ONE_MANY",
    "RETURNED_LINK_AS_NEXT_FUNCTION=CONFIRMED",
    "DIRECT_FIND_OUTGOING_INCOMING=0",
    "DIRECT_RESULT_POLES_READ=0",
    "INDEPENDENT_MEMORIES=2",
    "STRUCTURAL_RULE_AUTHORITY=0",
    "DICTIONARY_AUTHORITY=0",
    "ROLE_AUTHORITY_O_C=HOST_RESIDUAL",
    "GENERIC_UNIFICATION=HOST_RESIDUAL",
    "SELF_INCIDENCE_APPLICATION_RESULT=OPEN",
    "PRODUCTION_UNCHANGED",
  ].join(" "));
}

main();
