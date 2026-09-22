import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type LinkPoles,
  type ReadMemory,
} from "../src/memory.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.13 A23 selected associative detachment: ${message}`);
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}
function exactJson(actual: unknown, expected: unknown, message: string): void {
  same(JSON.stringify(actual), JSON.stringify(expected), message);
}

class SelectedView implements ReadMemory {
  readonly root: LinkHandle;
  constructor(
    private readonly source: ReadMemory,
    private readonly support: ReadonlySet<LinkHandle>,
  ) {
    this.root = source.root;
  }
  get linkCount(): number { return this.support.size; }
  poles(link: LinkHandle): LinkPoles {
    assert(this.support.has(link), "A23 selected authority read");
    const p = this.source.poles(link);
    assert(this.support.has(p.start) && this.support.has(p.end),
      "A23 selected authority is pole-closed");
    return p;
  }
  find(start: LinkHandle, end: LinkHandle): LinkHandle | undefined {
    assert(this.support.has(start) && this.support.has(end), "A23 selected find poles");
    const x = this.source.find(start, end);
    return x !== undefined && this.support.has(x) ? x : undefined;
  }
  outgoing(start: LinkHandle): readonly LinkHandle[] {
    assert(this.support.has(start), "A23 selected outgoing start");
    return Object.freeze(
      this.source.outgoing(start).filter((x) => this.support.has(x)),
    );
  }
  incoming(end: LinkHandle): readonly LinkHandle[] {
    assert(this.support.has(end), "A23 selected incoming end");
    return Object.freeze(
      this.source.incoming(end).filter((x) => this.support.has(x)),
    );
  }
}

function closure(memory: ReadMemory, roots: readonly LinkHandle[]): ReadonlySet<LinkHandle> {
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

function freezeChain(memory: Memory, values: readonly LinkHandle[]): LinkHandle {
  let body = memory.root;
  for (let i = values.length - 1; i >= 0; i -= 1) {
    body = memory.ensure(values[i]!, body);
  }
  return memory.ensureStartSelfClosed(body);
}

function readChain(memory: Memory, envelope: LinkHandle): readonly LinkHandle[] {
  const e = memory.poles(envelope);
  assert(e.start === envelope && e.end !== envelope,
    "A23 frontier envelope proper START-self-closed");
  const out: LinkHandle[] = [];
  const seen = new Set<LinkHandle>();
  let cursor = e.end;
  while (cursor !== memory.root) {
    assert(!seen.has(cursor), "A23 frontier chain cycle");
    seen.add(cursor);
    const cell = memory.poles(cursor);
    out.push(cell.start);
    cursor = cell.end;
  }
  return Object.freeze(out);
}

function selectedAuthorityView(memory: Memory, context: LinkHandle): SelectedView {
  const envelope = memory.poles(context).end;
  const e = memory.poles(envelope);
  assert(e.start === envelope && e.end !== envelope,
    "A23 context carries proper selected authority envelope");
  return new SelectedView(memory, closure(memory, [envelope]));
}

interface Fixture {
  readonly memory: Memory;
  readonly K: LinkHandle;
  readonly A0: LinkHandle;
  readonly A1: LinkHandle;
  readonly A2: LinkHandle;
  readonly A3: LinkHandle;
  readonly A4: LinkHandle;
  readonly Z: LinkHandle;
  readonly labels: ReadonlyMap<LinkHandle, string>;
}

function buildFixture(noise: boolean): Fixture {
  const memory = new Memory();
  const b = ensureRootBasis(memory);
  if (noise) {
    const n0 = memory.ensure(b.U, b.C);
    memory.ensure(n0, b.O);
  }

  const fresh: LinkHandle[] = [];
  let seed = memory.ensure(b.U, b.L);
  for (let i = 0; i < 20; i += 1) {
    seed = memory.ensure(seed, i % 2 === 0 ? b.O : b.C);
    fresh.push(seed);
  }
  const at = (i: number): LinkHandle => {
    const x = fresh[i];
    assert(x !== undefined, `A23 fresh ${i}`);
    return x;
  };

  const A0 = memory.ensure(at(0), at(1));
  const A1 = memory.ensure(at(2), at(3));
  const A2 = memory.ensure(at(4), at(5));
  const A3 = memory.ensure(at(6), at(7));
  const A4 = memory.ensure(at(8), at(9));
  const Z = memory.ensure(at(10), at(11));
  const parent = memory.ensure(at(12), at(13));

  const authority = freezeChain(memory, Object.freeze([
    memory.ensure(A0, A1), memory.ensure(A0, A2),
    memory.ensure(A2, A3), memory.ensure(A2, A4),
    memory.ensure(A3, Z), memory.ensure(A4, Z),
  ]));
  const K = memory.ensure(parent, authority);

  return Object.freeze({
    memory, K, A0, A1, A2, A3, A4, Z,
    labels: new Map<LinkHandle, string>([
      [A0, "A0"], [A1, "A1"], [A2, "A2"],
      [A3, "A3"], [A4, "A4"], [Z, "Z"],
    ]),
  });
}

function initialExecution(f: Fixture): LinkHandle {
  const truth = f.memory.ensure(f.K, f.A0);
  const occurrence = f.memory.ensure(f.memory.root, truth);
  return f.memory.ensure(f.K, freezeChain(f.memory, [occurrence]));
}

/**
 * A23 execution kernel.
 *
 * Dynamic duality is delegated to one associative operation over the selected
 * authority: outgoing(A). There is no explicit loop over a transition array
 * and no host START(continuation)==A comparison.
 */
function step(
  memory: Memory,
  executionRoot: LinkHandle,
  schedule: "forward" | "reverse",
): LinkHandle {
  const execution = memory.poles(executionRoot);
  const context = execution.start;
  const authority = selectedAuthorityView(memory, context);
  const occurrences = [...readChain(memory, execution.end)];
  if (schedule === "reverse") occurrences.reverse();

  let nextBody = memory.root;
  for (const occurrence of occurrences) {
    const truth = memory.poles(memory.poles(occurrence).end);
    assert(truth.start === context, "A23 occurrence carries K->A truth");
    const antecedent = truth.end;

    for (const continuation of authority.outgoing(antecedent)) {
      const consequent = authority.poles(continuation).end;
      const nextTruth = memory.ensure(context, consequent);
      const child = memory.ensure(occurrence, nextTruth);
      nextBody = memory.ensure(child, nextBody);
    }
  }

  const nextFrontier = memory.ensureStartSelfClosed(nextBody);
  return memory.ensure(context, nextFrontier);
}

function frontierOccurrences(memory: Memory, execution: LinkHandle): readonly LinkHandle[] {
  return readChain(memory, memory.poles(execution).end);
}

function truthEnds(f: Fixture, execution: LinkHandle): ReadonlySet<LinkHandle> {
  const out = new Set<LinkHandle>();
  for (const occurrence of frontierOccurrences(f.memory, execution)) {
    const truth = f.memory.poles(f.memory.poles(occurrence).end);
    same(truth.start, f.K, "A23 contextual truth keeps K");
    out.add(truth.end);
  }
  return out;
}

function setSame(
  actual: ReadonlySet<LinkHandle>,
  expected: readonly LinkHandle[],
  message: string,
): void {
  same(actual.size, new Set(expected).size, `${message}: cardinality`);
  for (const x of expected) assert(actual.has(x), `${message}: missing value`);
}

function provenance(f: Fixture, execution: LinkHandle): readonly string[] {
  return Object.freeze(frontierOccurrences(f.memory, execution).map((occurrence) => {
    const labels: string[] = [];
    let cursor = occurrence;
    const seen = new Set<LinkHandle>();
    while (true) {
      assert(!seen.has(cursor), "A23 occurrence ancestry cycle");
      seen.add(cursor);
      const op = f.memory.poles(cursor);
      const truth = f.memory.poles(op.end);
      const label = f.labels.get(truth.end);
      assert(label !== undefined, "A23 labeled truth");
      labels.push(label);
      if (op.start === f.memory.root) break;
      cursor = op.start;
    }
    return labels.reverse().join(">");
  }).sort());
}

function exercise(noise: boolean): void {
  const f = buildFixture(noise);
  const authority = selectedAuthorityView(f.memory, f.K);
  same(authority.outgoing(f.A0).length, 2, "A23 MANY relational image");
  same(authority.outgoing(f.A3).length, 1, "A23 ONE relational image");
  same(authority.outgoing(f.A1).length, 0, "A23 ZERO relational image");

  const E0 = initialExecution(f);
  const E1 = step(f.memory, E0, "forward");
  setSame(truthEnds(f, E1), [f.A1, f.A2], "A23 first split");

  const E2f = step(f.memory, E1, "forward");
  const E2r = step(f.memory, E1, "reverse");
  setSame(truthEnds(f, E2f), [f.A3, f.A4], "A23 recursive split");
  exactJson(provenance(f, E2f), provenance(f, E2r),
    "A23 schedule provenance equivalence");

  const E3 = step(f.memory, E2f, "forward");
  setSame(truthEnds(f, E3), [f.Z], "A23 convergence");
  same(frontierOccurrences(f.memory, E3).length, 2,
    "A23 convergence occurrence multiplicity");
  exactJson(provenance(f, E3), ["A0>A2>A3>Z", "A0>A2>A4>Z"],
    "A23 convergence provenance");

  const zTruths = new Set<LinkHandle>();
  for (const occurrence of frontierOccurrences(f.memory, E3)) {
    zTruths.add(f.memory.poles(occurrence).end);
  }
  same(zTruths.size, 1, "A23 one canonical K->Z truth");

  const E4 = step(f.memory, E3, "forward");
  same(frontierOccurrences(f.memory, E4).length, 0, "A23 terminal ZERO");

  // Physical ambient continuation is not in the selected authority closure.
  f.memory.ensure(f.A0, f.Z);
  const E1again = step(f.memory, E0, "forward");
  setSame(truthEnds(f, E1again), [f.A1, f.A2],
    "A23 ambient continuation invisible to selected relational image");

  // A separately constructed alternate authority does not alter immutable K.
  const alternate = freezeChain(f.memory, [f.memory.ensure(f.A0, f.Z)]);
  f.memory.ensure(f.A4, alternate);
  const E1afterAlternate = step(f.memory, E0, "forward");
  setSame(truthEnds(f, E1afterAlternate), [f.A1, f.A2],
    "A23 ambient alternate authority ignored");
}

function staticKernelGuard(): void {
  const repoRoot = resolve(process.cwd(), "..");
  const source = readFileSync(
    join(repoRoot, "ts/test/research-v013-selected-associative-detachment-a23.test.ts"),
    "utf8",
  );
  const start = source.indexOf("function step(");
  const end = source.indexOf("function frontierOccurrences(", start);
  assert(start >= 0 && end > start, "A23 kernel source slice");
  const kernel = source.slice(start, end);

  for (const forbidden of [
    "transitions", "selectedTransitions", "p.start", "=== antecedent",
    "!== antecedent", ".find(", ".incoming(", "modusPonens", "State", "Event",
  ]) {
    assert(!kernel.includes(forbidden), `A23 kernel excludes ${forbidden}`);
  }
  const outgoingCalls = kernel.match(/authority\.outgoing\(/g) ?? [];
  same(outgoingCalls.length, 1,
    "A23 kernel has one selected associative relational-image operation");
}

function main(): void {
  exercise(false);
  exercise(true);
  staticKernelGuard();

  console.log([
    "MTS v0.13 A23: SELECTED_ASSOCIATIVE_DETACHMENT=GREEN_SCOPED_RESEARCH",
    "DYNAMIC_PRIMITIVE_CANDIDATE=SELECTED_AUTHORITY_OUTGOING_IMAGE",
    "HOST_TRANSITION_ARRAY=0 EXPLICIT_START_MATCHER_BRANCHES=0",
    "RELATIONAL_IMAGE_CARDINALITY=ZERO_ONE_MANY",
    "FIRST_FANOUT=2 SECOND_FANOUT=2 LOCAL_TERMINATION=CONFIRMED",
    "CONVERGENCE_DISTINCT_TRUTHS=1 CONVERGENCE_OCCURRENCES=2",
    "AMBIENT_CONTINUATION=IGNORED AMBIENT_ALTERNATE_AUTHORITY=IGNORED",
    "SELECTED_AUTHORITY_VIEW_PROJECTION_RESIDUAL=1",
    "IRREDUCIBILITY=NOT_PROVEN INDEPENDENT_MEMORIES=2 PRODUCTION_UNCHANGED",
  ].join(" "));
}

main();
