import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type LinkPoles,
  type ReadMemory,
} from "../src/memory.js";
import { unifyStructuralTemplate } from "../src/structural-unification.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.13 A11g unifier slice: ${message}`);
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}
function exactJson(actual: unknown, expected: unknown, message: string): void {
  same(JSON.stringify(actual), JSON.stringify(expected), message);
}

class CountingProbe implements ReadMemory {
  readonly poleReads: LinkHandle[] = [];
  findCalls = 0;
  outgoingCalls = 0;
  incomingCalls = 0;

  constructor(private readonly source: ReadMemory) {}

  get root(): LinkHandle { return this.source.root; }
  get linkCount(): number { return this.source.linkCount; }

  poles(link: LinkHandle): LinkPoles {
    this.poleReads.push(link);
    return this.source.poles(link);
  }

  find(): LinkHandle | undefined {
    this.findCalls += 1;
    throw new Error("A11g unifier slice must not use find");
  }

  outgoing(): readonly LinkHandle[] {
    this.outgoingCalls += 1;
    throw new Error("A11g unifier slice must not use outgoing");
  }

  incoming(): readonly LinkHandle[] {
    this.incomingCalls += 1;
    throw new Error("A11g unifier slice must not use incoming");
  }
}

function decode(
  memory: Memory,
  template: LinkHandle,
  startRole: LinkHandle,
  endRole: LinkHandle,
  target: LinkHandle,
): Readonly<{ start: LinkHandle; end: LinkHandle; reads: readonly LinkHandle[] }> {
  const probe = new CountingProbe(memory);
  const before = memory.linkCount;

  const bindings = unifyStructuralTemplate(
    probe,
    template,
    target,
    Object.freeze([startRole, endRole]),
  );

  same(memory.linkCount, before, "decode is read-only");
  same(probe.findCalls, 0, "no find");
  same(probe.outgoingCalls, 0, "no outgoing");
  same(probe.incomingCalls, 0, "no incoming");
  same(bindings.length, 2, "exactly two role bindings");
  same(probe.poleReads.length, 3, "exactly three poles reads");

  // Exact dynamic slice of the current generic unifier for L=O->C:
  // containsRole(L), root-unify L, root-unify target.
  same(probe.poleReads[0], template, "first read is template contains-role");
  same(probe.poleReads[1], template, "second read is template root");
  same(probe.poleReads[2], target, "third read is target root");

  const start = bindings.find((x) => x.role === startRole)?.value;
  const end = bindings.find((x) => x.role === endRole)?.value;
  assert(start !== undefined && end !== undefined, "both selected roles bind");

  return Object.freeze({
    start,
    end,
    reads: Object.freeze([...probe.poleReads]),
  });
}

function exercise(memory: Memory, withNoise: boolean): void {
  const basis = ensureRootBasis(memory);

  if (withNoise) {
    const n0 = memory.ensure(basis.U, basis.L);
    const n1 = memory.ensure(n0, basis.C);
    memory.ensure(basis.O, n1);
  }

  const targets = Object.freeze([
    basis.R,
    basis.O,
    basis.C,
    basis.L,
    basis.U,
  ]);

  for (const target of targets) {
    const before = memory.linkCount;
    const decoded = decode(
      memory,
      basis.L,
      basis.O,
      basis.C,
      target,
    );
    same(memory.linkCount, before, "target decode allocates nothing");

    // Independent result check against the Link's actual root poles.
    // This verification is outside unifyStructuralTemplate and only confirms
    // what the current A11 unifier slice produced.
    const actual = memory.poles(target);
    same(decoded.start, actual.start, "O-role binds exact target start");
    same(decoded.end, actual.end, "C-role binds exact target end");
  }

  // The A11 path does not require recursive nested matching. A generic ordinary
  // target with deep children still causes the exact same three root-level
  // reads because O/C placeholders terminate traversal immediately.
  const deepLeft = memory.ensure(
    memory.ensure(basis.U, basis.L),
    memory.ensure(basis.L, basis.U),
  );
  const deepRight = memory.ensure(
    memory.ensure(basis.C, deepLeft),
    memory.ensure(deepLeft, basis.O),
  );
  const deepTarget = memory.ensure(deepLeft, deepRight);

  const deep = decode(
    memory,
    basis.L,
    basis.O,
    basis.C,
    deepTarget,
  );
  same(deep.start, deepLeft, "deep target start inferred without child traversal");
  same(deep.end, deepRight, "deep target end inferred without child traversal");
  exactJson(
    deep.reads,
    [basis.L, basis.L, deepTarget],
    "deep target still uses one-Link unifier slice",
  );
}

function main(): void {
  exercise(new Memory(), false);
  exercise(new Memory(), true);

  console.log([
    "MTS v0.13 A11g:",
    "UNIFIER_SLICE_AUDIT=GREEN",
    "POLES_READS_PER_DECODE=3",
    "ROLE_BINDINGS_PER_DECODE=2",
    "EFFECTIVE_TEMPLATE_DEPTH=1",
    "FIND_OUTGOING_INCOMING=0",
    "WRITES=0",
    "NESTED_TARGET_TRAVERSAL=NOT_REQUIRED",
    "REPEATED_ROLE_LOGIC=NOT_REQUIRED_ON_A11_PATH",
    "GROUNDED_SUBTREE_MATCHING=NOT_REQUIRED_ON_A11_PATH",
    "CYCLE_PAIR_VISITATION=NOT_REQUIRED_ON_A11_PATH",
    "INDEPENDENT_MEMORIES=2",
    "UNIFIER_SOURCE_REMOVAL=NOT_PROVEN",
    "A11G_F1=DESIGNED_NOT_EXECUTED",
    "PRODUCTION_UNCHANGED",
  ].join(" "));
}

main();
