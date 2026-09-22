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

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.13 A11g-F2 proof-carrying binding: ${message}`);
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
    assert(this.support.has(link), "A11g-F2 export stays inside selected support");
  }

  poles(link: LinkHandle): LinkPoles {
    this.require(link);
    const poles = this.source.poles(link);
    assert(
      this.support.has(poles.start) && this.support.has(poles.end),
      "A11g-F2 support is pole-closed",
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
      this.source.outgoing(start).filter((x) => this.support.has(x)),
    );
  }

  incoming(end: LinkHandle): readonly LinkHandle[] {
    this.require(end);
    return Object.freeze(
      this.source.incoming(end).filter((x) => this.support.has(x)),
    );
  }

  allLinks(): readonly LinkHandle[] { return this.ordered; }
}

class DenyTargetPoles implements ReadMemory {
  constructor(
    private readonly source: ReadMemory,
    private readonly denied: ReadonlySet<LinkHandle>,
  ) {}

  get root(): LinkHandle { return this.source.root; }
  get linkCount(): number { return this.source.linkCount; }

  poles(link: LinkHandle): LinkPoles {
    assert(!this.denied.has(link), "receiver must not inspect target poles");
    return this.source.poles(link);
  }

  find(start: LinkHandle, end: LinkHandle): LinkHandle | undefined {
    return this.source.find(start, end);
  }

  outgoing(start: LinkHandle): readonly LinkHandle[] {
    return this.source.outgoing(start);
  }

  incoming(end: LinkHandle): readonly LinkHandle[] {
    return this.source.incoming(end);
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

interface PortableBindingAuthority {
  readonly schema: "mts-v013-proof-carrying-binding/research-v0.1";
  readonly topology: StorageTopologyImage;
  readonly templateCoordinate: number;
  readonly witnessCoordinates: readonly number[];
}

interface SourceFrame {
  readonly whole: LinkHandle;
  readonly startRole: LinkHandle;
  readonly endRole: LinkHandle;
  readonly template: LinkHandle;
  readonly inverse: LinkHandle;
}

function sourceFrame(memory: Memory): SourceFrame {
  const basis = ensureRootBasis(memory);
  const whole = memory.ensure(basis.L, basis.L);
  const startRole = memory.ensureStartSelfClosed(whole);
  const endRole = memory.ensureEndSelfClosed(whole);
  const template = memory.ensure(startRole, endRole);
  const inverse = memory.ensure(endRole, startRole);
  assert(startRole !== endRole, "binding frame roles are distinct");
  assert(template !== inverse, "direct/inverse frame methods are distinct");
  return Object.freeze({ whole, startRole, endRole, template, inverse });
}

/**
 * Sender-side witness constructor.
 *
 * Sender may inspect poles(target) to PRODUCE proof-carrying evidence.
 * Receiver semantic authority is the verifier below, which is denied access to
 * target poles and must independently check the carried mapping.
 */
function defineBindingWitness(
  memory: Memory,
  frame: SourceFrame,
  target: LinkHandle,
): LinkHandle {
  const targetPoles = memory.poles(target);
  const a = memory.ensure(frame.startRole, targetPoles.start);
  const b = memory.ensure(frame.endRole, targetPoles.end);
  const bindingPair = memory.ensure(a, b);
  return memory.ensure(bindingPair, target);
}

function exportAuthority(noise: boolean): PortableBindingAuthority {
  const memory = new Memory();
  const basis = ensureRootBasis(memory);

  if (noise) {
    const n0 = memory.ensure(basis.U, basis.C);
    const n1 = memory.ensure(n0, basis.O);
    memory.ensure(basis.L, n1);
  }

  const frame = sourceFrame(memory);
  const targets = [
    frame.template,
    frame.inverse,
    basis.R,
    basis.O,
    basis.C,
    basis.L,
    basis.U,
  ] as const;
  const witnesses = targets.map((target) =>
    defineBindingWitness(memory, frame, target)
  );

  const support = poleClosure(memory, [
    frame.startRole,
    frame.endRole,
    frame.template,
    frame.inverse,
    ...witnesses,
  ]);
  const canonical = exportCanonicalTopology(new ExportSupport(memory, support));
  const templateCoordinate = canonical.coordinates.get(frame.template);
  assert(templateCoordinate !== undefined, "portable template coordinate exists");

  const witnessCoordinates = witnesses.map((witness) => {
    const coordinate = canonical.coordinates.get(witness);
    assert(coordinate !== undefined, "portable witness coordinate exists");
    return coordinate;
  });

  return Object.freeze({
    schema: "mts-v013-proof-carrying-binding/research-v0.1" as const,
    topology: canonical.topology,
    templateCoordinate,
    witnessCoordinates: Object.freeze(witnessCoordinates),
  });
}

interface ReplayedAuthority {
  readonly memory: Memory;
  readonly template: LinkHandle;
  readonly startRole: LinkHandle;
  readonly endRole: LinkHandle;
  readonly witnesses: readonly LinkHandle[];
}

function replayAuthority(
  artifact: PortableBindingAuthority,
): ReplayedAuthority {
  same(
    artifact.schema,
    "mts-v013-proof-carrying-binding/research-v0.1",
    "binding authority schema",
  );
  const memory = restoreTopology(artifact.topology);
  const all = memory.allLinks();
  const template = all[artifact.templateCoordinate];
  assert(template !== undefined, "replayed template coordinate resolves");

  // Reading the selected template is authority/bootstrap, not candidate decode.
  const templatePoles = memory.poles(template);
  const startRole = templatePoles.start;
  const endRole = templatePoles.end;
  assert(startRole !== endRole, "replayed selected roles remain distinct");

  const witnesses = artifact.witnessCoordinates.map((coordinate) => {
    const witness = all[coordinate];
    assert(witness !== undefined, "replayed witness coordinate resolves");
    return witness;
  });

  const canonical = exportCanonicalTopology(
    new ExportSupport(memory, new Set(memory.allLinks())),
  );
  exactJson(canonical.topology, artifact.topology, "binding authority canonical replay");

  return Object.freeze({
    memory,
    template,
    startRole,
    endRole,
    witnesses: Object.freeze(witnesses),
  });
}

interface VerifiedBinding {
  readonly witness: LinkHandle;
  readonly target: LinkHandle;
  readonly values: ReadonlyMap<LinkHandle, LinkHandle>;
}

/**
 * Receiver-side proof-carrying binding verifier.
 *
 * Critical property: target poles are forbidden. Values are obtained only from
 * witness Links and are accepted only when ordered Link identity reconstructs
 * the exact target.
 *
 * No structural matcher or recursive unifier participates.
 */
function verifyBindingWitness(
  memory: ReadMemory,
  startRole: LinkHandle,
  endRole: LinkHandle,
  witness: LinkHandle,
  deniedTargets: ReadonlySet<LinkHandle>,
): VerifiedBinding {
  const guarded = new DenyTargetPoles(memory, deniedTargets);

  const witnessPoles = guarded.poles(witness);
  const bindingPair = witnessPoles.start;
  const target = witnessPoles.end;

  const pairPoles = guarded.poles(bindingPair);
  const bindingHandles = [pairPoles.start, pairPoles.end] as const;

  const values = new Map<LinkHandle, LinkHandle>();
  for (const bindingHandle of bindingHandles) {
    const binding = guarded.poles(bindingHandle);
    assert(
      binding.start === startRole || binding.start === endRole,
      "binding uses only selected structural roles",
    );
    assert(!values.has(binding.start), "each selected role occurs exactly once");
    values.set(binding.start, binding.end);
  }

  same(values.size, 2, "witness covers exactly two selected roles");
  assert(values.has(startRole), "witness covers selected start role");
  assert(values.has(endRole), "witness covers selected end role");

  const startValue = values.get(startRole)!;
  const endValue = values.get(endRole)!;

  same(
    guarded.find(startValue, endValue),
    target,
    "witness-carried values reconstruct exact ordered target Link",
  );

  return Object.freeze({
    witness,
    target,
    values,
  });
}

function witnessByTarget(
  verified: readonly VerifiedBinding[],
  target: LinkHandle,
): VerifiedBinding {
  const matches = verified.filter((item) => item.target === target);
  same(matches.length, 1, "exactly one selected binding witness per target");
  return matches[0]!;
}

function methodOrientation(
  method: VerifiedBinding,
  startRole: LinkHandle,
  endRole: LinkHandle,
): Readonly<{ fromRole: LinkHandle; toRole: LinkHandle }> {
  const fromRole = method.values.get(startRole);
  const toRole = method.values.get(endRole);
  assert(fromRole !== undefined && toRole !== undefined, "method binding is complete");

  const roles = new Set([startRole, endRole]);
  assert(roles.has(fromRole) && roles.has(toRole), "method maps within selected role frame");
  assert(fromRole !== toRole, "method mapping is bijective");
  return Object.freeze({ fromRole, toRole });
}

function selfContinuationBit(
  candidate: VerifiedBinding,
  orientation: Readonly<{ fromRole: LinkHandle; toRole: LinkHandle }>,
): "0" | "1" {
  const from = candidate.values.get(orientation.fromRole);
  const to = candidate.values.get(orientation.toRole);
  assert(from !== undefined && to !== undefined, "candidate binding covers oriented roles");
  return from === candidate.target ? "1" : "0";
}

function executePortable(artifact: PortableBindingAuthority): void {
  const replay = replayAuthority(artifact);
  const { memory, template, startRole, endRole, witnesses } = replay;
  const basis = ensureRootBasis(memory);
  const inverse = memory.find(endRole, startRole);
  assert(inverse !== undefined, "inverse method belongs to replayed authority");

  const semanticTargets = new Set<LinkHandle>([
    template,
    inverse,
    basis.R,
    basis.O,
    basis.C,
    basis.L,
    basis.U,
  ]);

  const verified = witnesses.map((witness) =>
    verifyBindingWitness(
      memory,
      startRole,
      endRole,
      witness,
      semanticTargets,
    )
  );

  same(verified.length, 7, "seven positive proof-carrying witnesses");

  const directBinding = witnessByTarget(verified, template);
  const inverseBinding = witnessByTarget(verified, inverse);
  const direct = methodOrientation(directBinding, startRole, endRole);
  const inverseOrientation = methodOrientation(inverseBinding, startRole, endRole);

  const cases = [
    [basis.R, "11"],
    [basis.O, "10"],
    [basis.C, "01"],
    [basis.L, "00"],
    [basis.U, "00"],
  ] as const;

  const observed = new Set<string>();
  for (const [target, expected] of cases) {
    const binding = witnessByTarget(verified, target);
    const signature =
      selfContinuationBit(binding, direct) +
      selfContinuationBit(binding, inverseOrientation);
    same(signature, expected, "proof-carrying A11f signature");
    observed.add(signature);

    // Independent diagnostic only: receiver semantics above did not read target
    // poles. This confirms behavioral signature still equals raw self-incidence.
    const poles = memory.poles(target);
    const raw =
      (poles.start === target ? "1" : "0") +
      (poles.end === target ? "1" : "0");
    same(signature, raw, "proof-carrying signature equals structural self-incidence");
  }
  same(observed.size, 4, "four aspect signatures survive unifier denial");
}

function expectRejected(effect: () => unknown, message: string): void {
  let rejected = false;
  try {
    effect();
  } catch {
    rejected = true;
  }
  assert(rejected, message);
}

function negativeControls(): void {
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  const frame = sourceFrame(memory);
  const target = basis.O;
  const targetPoles = memory.poles(target);

  // 1. Reversed values under unchanged roles.
  {
    const a = memory.ensure(frame.startRole, targetPoles.end);
    const b = memory.ensure(frame.endRole, targetPoles.start);
    const witness = memory.ensure(memory.ensure(a, b), target);
    expectRejected(
      () => verifyBindingWitness(
        memory,
        frame.startRole,
        frame.endRole,
        witness,
        new Set([target]),
      ),
      "reversed proof-carrying values fail ordered target identity",
    );
  }

  // 2. Duplicate/collapsed role evidence.
  {
    const a = memory.ensure(frame.startRole, targetPoles.start);
    const b = memory.ensure(frame.startRole, targetPoles.end);
    const witness = memory.ensure(memory.ensure(a, b), target);
    expectRejected(
      () => verifyBindingWitness(
        memory,
        frame.startRole,
        frame.endRole,
        witness,
        new Set([target]),
      ),
      "duplicate role evidence fails exact role coverage",
    );
  }

  // 3. Correct values attached to a substituted target.
  {
    const a = memory.ensure(frame.startRole, targetPoles.start);
    const b = memory.ensure(frame.endRole, targetPoles.end);
    const substituted = basis.C;
    const witness = memory.ensure(memory.ensure(a, b), substituted);
    expectRejected(
      () => verifyBindingWitness(
        memory,
        frame.startRole,
        frame.endRole,
        witness,
        new Set([substituted]),
      ),
      "target substitution fails ordered Link identity",
    );
  }
}

function main(): void {
  const a = exportAuthority(false);
  const b = exportAuthority(true);
  exactJson(a, b, "portable proof-carrying binding ignores unrelated local noise");

  executePortable(a);
  executePortable(b);
  negativeControls();

  console.log([
    "MTS v0.13 A11g-F2:",
    "PROOF_CARRYING_TWO_ROLE_BINDING=GREEN_SCOPED_RESEARCH",
    "POSITIVE_WITNESSES=7",
    "NEGATIVE_CONTROLS=3",
    "INDEPENDENT_MEMORIES=2",
    "TARGET_POLE_READS_IN_VERIFIER=0",
    "HOST_MATCHERS=0",
    "A11F_SIGNATURES=R11_O10_C01_L00_U00",
    "ORDERED_LINK_IDENTITY_CHECK=REQUIRED",
    "GLOBAL_E2=OPEN",
    "PRODUCTION_UNCHANGED",
  ].join(" "));
}

main();
