import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { Memory, ensureRootBasis, type LinkHandle } from "../src/memory.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.13 A22 meta-detachment history: ${message}`);
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}
function exactJson(actual: unknown, expected: unknown, message: string): void {
  same(JSON.stringify(actual), JSON.stringify(expected), message);
}
function expectThrows(run: () => void, message: string): void {
  let threw = false;
  try { run(); } catch { threw = true; }
  assert(threw, message);
}

function freezeChain(memory: Memory, values: readonly LinkHandle[]): LinkHandle {
  let body = memory.root;
  for (let i = values.length - 1; i >= 0; i -= 1) {
    body = memory.ensure(values[i]!, body);
  }
  return memory.ensureStartSelfClosed(body);
}

function readChain(
  memory: Memory,
  envelope: LinkHandle,
  kind: string,
): readonly LinkHandle[] {
  const e = memory.poles(envelope);
  assert(e.start === envelope && e.end !== envelope,
    `A22 ${kind} envelope is proper START-self-closed`);
  const out: LinkHandle[] = [];
  const seen = new Set<LinkHandle>();
  let cursor = e.end;
  while (cursor !== memory.root) {
    assert(!seen.has(cursor), `A22 ${kind} chain cycle`);
    seen.add(cursor);
    const cell = memory.poles(cursor);
    out.push(cell.start);
    cursor = cell.end;
  }
  return Object.freeze(out);
}

interface Fixture {
  readonly memory: Memory;
  readonly M: LinkHandle;
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
  for (let i = 0; i < 22; i += 1) {
    seed = memory.ensure(seed, i % 2 === 0 ? b.O : b.C);
    fresh.push(seed);
  }
  const at = (i: number): LinkHandle => {
    const x = fresh[i];
    assert(x !== undefined, `A22 fresh ${i}`);
    return x;
  };

  const A0 = memory.ensure(at(0), at(1));
  const A1 = memory.ensure(at(2), at(3));
  const A2 = memory.ensure(at(4), at(5));
  const A3 = memory.ensure(at(6), at(7));
  const A4 = memory.ensure(at(8), at(9));
  const Z = memory.ensure(at(10), at(11));
  const parent = memory.ensure(at(12), at(13));
  const M = memory.ensure(at(14), at(15));

  const authority = freezeChain(memory, Object.freeze([
    memory.ensure(A0, A1), memory.ensure(A0, A2),
    memory.ensure(A2, A3), memory.ensure(A2, A4),
    memory.ensure(A3, Z), memory.ensure(A4, Z),
  ]));
  const K = memory.ensure(parent, authority);

  return Object.freeze({
    memory, M, K, A0, A1, A2, A3, A4, Z,
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

/** A21 producer residual: compute one next execution root from E_n. */
function produceNextExecution(
  memory: Memory,
  executionRoot: LinkHandle,
  schedule: "forward" | "reverse",
): LinkHandle {
  const execution = memory.poles(executionRoot);
  const context = execution.start;
  const contextPoles = memory.poles(context);
  const continuations = [...readChain(memory, contextPoles.end, "authority")];
  const occurrences = [...readChain(memory, execution.end, "frontier")];
  if (schedule === "reverse") occurrences.reverse();

  let nextBody = memory.root;
  for (const occurrence of occurrences) {
    const op = memory.poles(occurrence);
    const truth = memory.poles(op.end);
    assert(truth.start === context, "A22 occurrence carries current-context truth");
    for (const continuation of continuations) {
      const p = memory.poles(continuation);
      if (p.start !== truth.end) continue;
      const nextTruth = memory.ensure(context, p.end);
      const child = memory.ensure(occurrence, nextTruth);
      nextBody = memory.ensure(child, nextBody);
    }
  }
  return memory.ensure(context, memory.ensureStartSelfClosed(nextBody));
}

/**
 * Generic meta-level dynamic duality.
 *
 * M->E_n plus selected E_n->E_(n+1) propagates execution truth to
 * M->E_(n+1). This kernel has no knowledge of frontier, authority, State,
 * Event, scheduler semantics, or the A21 producer.
 */
function propagateExecutionTruth(
  memory: Memory,
  metaContext: LinkHandle,
  currentExecutionTruth: LinkHandle,
  selectedExecutionTransition: LinkHandle,
): LinkHandle {
  const truth = memory.poles(currentExecutionTruth);
  assert(truth.start === metaContext, "A22 current execution truth is M->E_n");

  const transition = memory.poles(selectedExecutionTransition);
  assert(transition.start === truth.end,
    "A22 selected transition starts at the true execution root");

  return memory.ensure(metaContext, transition.end);
}

function frontierOccurrences(memory: Memory, execution: LinkHandle): readonly LinkHandle[] {
  return readChain(memory, memory.poles(execution).end, "frontier");
}

function executionTruthEnds(
  f: Fixture,
  execution: LinkHandle,
): ReadonlySet<LinkHandle> {
  const context = f.memory.poles(execution).start;
  same(context, f.K, "A22 execution keeps K");
  const out = new Set<LinkHandle>();
  for (const occurrence of frontierOccurrences(f.memory, execution)) {
    const truth = f.memory.poles(f.memory.poles(occurrence).end);
    same(truth.start, f.K, "A22 frontier truth keeps K");
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

function frontierProvenance(f: Fixture, execution: LinkHandle): readonly string[] {
  return Object.freeze(frontierOccurrences(f.memory, execution).map((occurrence) => {
    const labels: string[] = [];
    const seen = new Set<LinkHandle>();
    let cursor = occurrence;
    while (true) {
      assert(!seen.has(cursor), "A22 occurrence ancestry cycle");
      seen.add(cursor);
      const op = f.memory.poles(cursor);
      const truth = f.memory.poles(op.end);
      const label = f.labels.get(truth.end);
      assert(label !== undefined, "A22 labeled truth");
      labels.push(label);
      if (op.start === f.memory.root) break;
      cursor = op.start;
    }
    return labels.reverse().join(">");
  }).sort());
}

function exercise(noise: boolean): void {
  const f = buildFixture(noise);
  const E0 = initialExecution(f);
  const metaTruth0 = f.memory.ensure(f.M, E0);
  let metaOccurrence = f.memory.ensure(f.memory.root, metaTruth0);

  const advance = (
    current: LinkHandle,
    schedule: "forward" | "reverse",
  ): LinkHandle => {
    const next = produceNextExecution(f.memory, current, schedule);
    const transition = f.memory.ensure(current, next);
    const currentTruth = f.memory.poles(metaOccurrence).end;
    const nextTruth = propagateExecutionTruth(
      f.memory, f.M, currentTruth, transition,
    );
    metaOccurrence = f.memory.ensure(metaOccurrence, nextTruth);
    return next;
  };

  const E1 = advance(E0, "forward");
  setSame(executionTruthEnds(f, E1), [f.A1, f.A2], "A22 first split");

  const E2 = advance(E1, "forward");
  setSame(executionTruthEnds(f, E2), [f.A3, f.A4], "A22 recursive split");

  const E3 = advance(E2, "forward");
  setSame(executionTruthEnds(f, E3), [f.Z], "A22 convergence");
  same(frontierOccurrences(f.memory, E3).length, 2,
    "A22 convergence preserves two occurrences");
  exactJson(
    frontierProvenance(f, E3),
    ["A0>A2>A3>Z", "A0>A2>A4>Z"],
    "A22 semantic provenance preserved",
  );

  const E4 = advance(E3, "forward");
  same(frontierOccurrences(f.memory, E4).length, 0,
    "A22 terminal execution has ZERO frontier");

  // Meta-history is immutable: old M->E_i truths remain, while the selected
  // occurrence ancestry identifies the propagated execution sequence.
  const history: LinkHandle[] = [];
  let cursor = metaOccurrence;
  while (true) {
    const op = f.memory.poles(cursor);
    const truth = f.memory.poles(op.end);
    same(truth.start, f.M, "A22 meta-history truth keeps M");
    history.push(truth.end);
    if (op.start === f.memory.root) break;
    cursor = op.start;
  }
  exactJson(history.reverse(), [E0, E1, E2, E3, E4],
    "A22 Link-native immutable execution history");

  // Ambient alternative execution transition is inert unless selected.
  const bogusExecution = f.memory.ensure(f.K, f.memory.ensureStartSelfClosed(f.memory.root));
  f.memory.ensure(E0, bogusExecution);
  const selectedE1 = produceNextExecution(f.memory, E0, "forward");
  const selectedTransition = f.memory.ensure(E0, selectedE1);
  const selectedTruth = propagateExecutionTruth(
    f.memory, f.M, metaTruth0, selectedTransition,
  );
  same(f.memory.poles(selectedTruth).end, selectedE1,
    "A22 ambient alternative transition ignored");

  // Transition not starting at the true E_n fails closed.
  const wrongTransition = f.memory.ensure(E1, E2);
  expectThrows(
    () => { propagateExecutionTruth(f.memory, f.M, metaTruth0, wrongTransition); },
    "A22 mismatched execution transition rejected",
  );

  // Execution truth from another meta-context fails closed.
  const M2 = f.memory.ensure(f.A4, f.Z);
  const foreignTruth = f.memory.ensure(M2, E0);
  expectThrows(
    () => {
      propagateExecutionTruth(f.memory, f.M, foreignTruth, selectedTransition);
    },
    "A22 foreign meta-context truth rejected",
  );
}

function staticKernelGuard(): void {
  const repoRoot = resolve(process.cwd(), "..");
  const source = readFileSync(
    join(repoRoot, "ts/test/research-v013-meta-detachment-history-a22.test.ts"),
    "utf8",
  );
  const start = source.indexOf("function propagateExecutionTruth(");
  const end = source.indexOf("function frontierOccurrences(", start);
  assert(start >= 0 && end > start, "A22 meta-kernel source slice");
  const kernel = source.slice(start, end);

  for (const forbidden of [
    "frontier", "authority", "schedule", "State", "Event", "BundleValue",
    "produceNextExecution", "modusPonens", ".find(", ".outgoing(", ".incoming(",
    "switch(",
  ]) {
    assert(!kernel.includes(forbidden),
      `A22 meta-detachment kernel excludes ${forbidden}`);
  }
  assert(kernel.includes("memory.ensure(metaContext, transition.end)"),
    "A22 meta-step materializes only propagated M->E_(n+1) truth");
}

function main(): void {
  exercise(false);
  exercise(true);
  staticKernelGuard();

  console.log([
    "MTS v0.13 A22: META_EXECUTION_DETACHMENT=GREEN_SCOPED_RESEARCH",
    "SEMANTIC_LAW=M_TO_E_N_PLUS_E_N_TO_E_N_PLUS_1_GIVES_M_TO_E_N_PLUS_1",
    "EXECUTION_TRANSITION=LINK_CARRIED",
    "META_HISTORY=LINK_ANCESTRY",
    "SEMANTIC_FIRST_FANOUT=2 SEMANTIC_SECOND_FANOUT=2",
    "SEMANTIC_CONVERGENCE_TRUTHS=1 SEMANTIC_CONVERGENCE_OCCURRENCES=2",
    "TERMINAL_FRONTIER=ZERO AMBIENT_EXECUTION_TRANSITION=IGNORED",
    "MISMATCHED_TRANSITION=REJECTED FOREIGN_META_CONTEXT=REJECTED",
    "TRANSITION_PRODUCER_HOST_RESIDUAL=1 CURRENT_META_OCCURRENCE_SELECTION_RESIDUAL=1",
    "INDEPENDENT_MEMORIES=2 PRODUCTION_UNCHANGED",
  ].join(" "));
}

main();
