import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
} from "../src/memory.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.13 A21 single execution root: ${message}`);
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

function freezeAuthority(
  memory: Memory,
  transitions: readonly LinkHandle[],
): LinkHandle {
  let body = memory.root;
  for (let i = transitions.length - 1; i >= 0; i -= 1) {
    body = memory.ensure(transitions[i]!, body);
  }
  return memory.ensureStartSelfClosed(body);
}

function freezeFrontier(
  memory: Memory,
  occurrences: readonly LinkHandle[],
): LinkHandle {
  let body = memory.root;
  for (let i = occurrences.length - 1; i >= 0; i -= 1) {
    body = memory.ensure(occurrences[i]!, body);
  }
  return memory.ensureStartSelfClosed(body);
}

function readChain(
  memory: Memory,
  envelope: LinkHandle,
  kind: string,
): readonly LinkHandle[] {
  const e = memory.poles(envelope);
  assert(
    e.start === envelope && e.end !== envelope,
    `A21 ${kind} envelope is proper START-self-closed`,
  );

  const values: LinkHandle[] = [];
  const seen = new Set<LinkHandle>();
  let cursor = e.end;
  while (cursor !== memory.root) {
    assert(!seen.has(cursor), `A21 ${kind} chain cycle`);
    seen.add(cursor);
    const cell = memory.poles(cursor);
    values.push(cell.start);
    cursor = cell.end;
  }
  return Object.freeze(values);
}

function buildFixture(noise: boolean): Fixture {
  const memory = new Memory();
  const b = ensureRootBasis(memory);
  if (noise) {
    const n0 = memory.ensure(b.U, b.C);
    const n1 = memory.ensure(n0, b.O);
    memory.ensure(b.L, n1);
  }

  const fresh: LinkHandle[] = [];
  let seed = memory.ensure(b.U, b.L);
  for (let i = 0; i < 20; i += 1) {
    seed = memory.ensure(seed, i % 2 === 0 ? b.O : b.C);
    fresh.push(seed);
  }
  const at = (i: number): LinkHandle => {
    const x = fresh[i];
    assert(x !== undefined, `A21 fresh ${i}`);
    return x;
  };

  const A0 = memory.ensure(at(0), at(1));
  const A1 = memory.ensure(at(2), at(3));
  const A2 = memory.ensure(at(4), at(5));
  const A3 = memory.ensure(at(6), at(7));
  const A4 = memory.ensure(at(8), at(9));
  const Z = memory.ensure(at(10), at(11));
  const parent = memory.ensure(at(12), at(13));

  const authorityEnvelope = freezeAuthority(memory, Object.freeze([
    memory.ensure(A0, A1),
    memory.ensure(A0, A2),
    memory.ensure(A2, A3),
    memory.ensure(A2, A4),
    memory.ensure(A3, Z),
    memory.ensure(A4, Z),
  ]));
  const K = memory.ensure(parent, authorityEnvelope);

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
  const frontier = freezeFrontier(f.memory, [occurrence]);
  return f.memory.ensure(f.K, frontier);
}

/**
 * A21 single-root Link-native meta-step.
 *
 * One execution root carries the complete selected state:
 *
 *   E_n = K -> Frontier_n
 *
 * K carries continuation authority structurally (A19).
 * Frontier_n carries occurrence/provenance Links structurally (A20).
 *
 * The step receives one executionRoot Link and returns E_(n+1).
 */
function step(
  memory: Memory,
  executionRoot: LinkHandle,
  schedule: "forward" | "reverse",
): LinkHandle {
  const execution = memory.poles(executionRoot);
  const context = execution.start;
  const frontierEnvelope = execution.end;

  const contextPoles = memory.poles(context);
  const authorityEnvelope = contextPoles.end;
  const continuations = [...readChain(memory, authorityEnvelope, "authority")];
  const occurrences = [...readChain(memory, frontierEnvelope, "frontier")];
  if (schedule === "reverse") occurrences.reverse();

  let nextBody = memory.root;

  for (const occurrence of occurrences) {
    const occurrencePoles = memory.poles(occurrence);
    const truth = memory.poles(occurrencePoles.end);
    assert(truth.start === context, "A21 occurrence carries current-context truth");
    const antecedent = truth.end;

    for (const continuation of continuations) {
      const p = memory.poles(continuation);
      if (p.start !== antecedent) continue;

      const nextTruth = memory.ensure(context, p.end);
      const childOccurrence = memory.ensure(occurrence, nextTruth);
      nextBody = memory.ensure(childOccurrence, nextBody);
    }
  }

  const nextFrontier = memory.ensureStartSelfClosed(nextBody);
  return memory.ensure(context, nextFrontier);
}

function executionContext(memory: Memory, execution: LinkHandle): LinkHandle {
  return memory.poles(execution).start;
}

function executionFrontier(memory: Memory, execution: LinkHandle): LinkHandle {
  return memory.poles(execution).end;
}

function frontierOccurrences(
  memory: Memory,
  execution: LinkHandle,
): readonly LinkHandle[] {
  return readChain(memory, executionFrontier(memory, execution), "frontier");
}

function frontierTruthEnds(
  f: Fixture,
  execution: LinkHandle,
): ReadonlySet<LinkHandle> {
  same(executionContext(f.memory, execution), f.K, "A21 execution keeps K");
  const out = new Set<LinkHandle>();
  for (const occurrence of frontierOccurrences(f.memory, execution)) {
    const op = f.memory.poles(occurrence);
    const truth = f.memory.poles(op.end);
    same(truth.start, f.K, "A21 frontier truth keeps K");
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

function provenancePath(
  f: Fixture,
  occurrence: LinkHandle,
): string {
  const labels: string[] = [];
  const seen = new Set<LinkHandle>();
  let cursor = occurrence;
  while (true) {
    assert(!seen.has(cursor), "A21 occurrence ancestry cycle");
    seen.add(cursor);
    const p = f.memory.poles(cursor);
    const truth = f.memory.poles(p.end);
    same(truth.start, f.K, "A21 ancestry truth keeps K");
    const label = f.labels.get(truth.end);
    assert(label !== undefined, "A21 ancestry consequence label");
    labels.push(label);
    if (p.start === f.memory.root) break;
    cursor = p.start;
  }
  return labels.reverse().join(">");
}

function executionProvenance(
  f: Fixture,
  execution: LinkHandle,
): readonly string[] {
  return Object.freeze(
    frontierOccurrences(f.memory, execution)
      .map((o) => provenancePath(f, o))
      .sort(),
  );
}

function exercise(noise: boolean): void {
  const f = buildFixture(noise);
  const E0 = initialExecution(f);

  // Ambient contextual truth is inert unless present in E0's selected frontier.
  f.memory.ensure(f.K, f.A2);

  const E1 = step(f.memory, E0, "forward");
  setSame(frontierTruthEnds(f, E1), [f.A1, f.A2], "A21 first split");
  exactJson(
    executionProvenance(f, E1),
    ["A0>A1", "A0>A2"],
    "A21 first provenance",
  );

  const E2f = step(f.memory, E1, "forward");
  const E2r = step(f.memory, E1, "reverse");
  setSame(frontierTruthEnds(f, E2f), [f.A3, f.A4], "A21 recursive split");
  same(frontierOccurrences(f.memory, E2f).length, 2,
    "A21 A1 terminates while A2 branches");
  exactJson(
    executionProvenance(f, E2f),
    ["A0>A2>A3", "A0>A2>A4"],
    "A21 branch-local provenance",
  );
  exactJson(
    executionProvenance(f, E2f),
    executionProvenance(f, E2r),
    "A21 schedule preserves provenance",
  );

  const E3f = step(f.memory, E2f, "forward");
  const E3r = step(f.memory, E2r, "reverse");
  setSame(frontierTruthEnds(f, E3f), [f.Z], "A21 convergence");
  same(frontierOccurrences(f.memory, E3f).length, 2,
    "A21 convergence preserves two occurrences");
  exactJson(
    executionProvenance(f, E3f),
    ["A0>A2>A3>Z", "A0>A2>A4>Z"],
    "A21 convergence provenance",
  );
  exactJson(
    executionProvenance(f, E3f),
    executionProvenance(f, E3r),
    "A21 converged provenance schedule-equivalent",
  );

  const zTruths = new Set<LinkHandle>();
  for (const occurrence of frontierOccurrences(f.memory, E3f)) {
    zTruths.add(f.memory.poles(occurrence).end);
  }
  same(zTruths.size, 1,
    "A21 two occurrences share one canonical K->Z truth");

  const E4 = step(f.memory, E3f, "forward");
  same(frontierOccurrences(f.memory, E4).length, 0,
    "A21 terminal execution root carries ZERO frontier");
  same(executionContext(f.memory, E4), f.K,
    "A21 terminal execution root retains context");

  // Ambient execution roots have no effect unless selected as the input root.
  const ambientTruth = f.memory.ensure(f.K, f.A3);
  const ambientOccurrence = f.memory.ensure(f.memory.root, ambientTruth);
  const ambientFrontier = freezeFrontier(f.memory, [ambientOccurrence]);
  f.memory.ensure(f.K, ambientFrontier);
  const E1again = step(f.memory, E0, "forward");
  setSame(frontierTruthEnds(f, E1again), [f.A1, f.A2],
    "A21 ambient execution root ignored");

  // Execution root with a foreign-context occurrence fails closed.
  const K2 = f.memory.ensure(f.A4, f.Z);
  const foreignTruth = f.memory.ensure(K2, f.A0);
  const foreignOccurrence = f.memory.ensure(f.memory.root, foreignTruth);
  const foreignFrontier = freezeFrontier(f.memory, [foreignOccurrence]);
  const foreignExecution = f.memory.ensure(f.K, foreignFrontier);
  expectThrows(
    () => { step(f.memory, foreignExecution, "forward"); },
    "A21 foreign-context occurrence rejected",
  );

  // Execution root whose END is not a frontier envelope is rejected.
  const rawBody = f.memory.ensure(ambientOccurrence, f.memory.root);
  const malformedExecution = f.memory.ensure(f.K, rawBody);
  expectThrows(
    () => { step(f.memory, malformedExecution, "forward"); },
    "A21 unwrapped frontier execution root rejected",
  );

  // Execution root whose START is not a context carrying valid authority is rejected.
  const invalidK = f.memory.ensure(f.A4, f.Z);
  const validFrontier = executionFrontier(f.memory, E0);
  const invalidContextExecution = f.memory.ensure(invalidK, validFrontier);
  expectThrows(
    () => { step(f.memory, invalidContextExecution, "forward"); },
    "A21 invalid context authority rejected",
  );
}

function staticKernelGuard(): void {
  const repoRoot = resolve(process.cwd(), "..");
  const source = readFileSync(
    join(repoRoot, "ts/test/research-v013-single-execution-root-a21.test.ts"),
    "utf8",
  );
  const start = source.indexOf("function step(");
  const end = source.indexOf("function executionContext(", start);
  assert(start >= 0 && end > start, "A21 kernel source slice");
  const kernel = source.slice(start, end);
  const signature = kernel.slice(0, kernel.indexOf("): LinkHandle"));

  for (const forbidden of [
    "BundleValue", "ResolvedOccurrence", "resolveFlatBundle", "authorityTruth",
    "transitions:", "active", "isTrue", "currentValue", "modusPonens",
    ".find(", ".outgoing(", ".incoming(", "switch(",
  ]) {
    assert(!kernel.includes(forbidden),
      `A21 kernel excludes host semantic primitive ${forbidden}`);
  }

  assert(signature.includes("executionRoot: LinkHandle"),
    "A21 semantic input is one execution-root Link");
  assert(!signature.includes("context: LinkHandle"),
    "A21 has no separate context parameter");
  assert(!signature.includes("frontierEnvelope: LinkHandle"),
    "A21 has no separate frontier parameter");
  assert(kernel.includes("return memory.ensure(context, nextFrontier)"),
    "A21 returns one next execution-root Link");
}

function main(): void {
  exercise(false);
  exercise(true);
  staticKernelGuard();

  console.log([
    "MTS v0.13 A21: SINGLE_EXECUTION_ROOT=GREEN_SCOPED_RESEARCH",
    "EXECUTION_ROOT=K_TO_FRONTIER CONTEXT_CARRIED_AUTHORITY=YES LINK_NATIVE_FRONTIER=YES LINK_NATIVE_PROVENANCE=YES",
    "SEPARATE_CONTEXT_PARAMETER=0 SEPARATE_FRONTIER_PARAMETER=0 HOST_BUNDLEVALUE_FRONTIER=0 STEP=E_N_TO_E_N_PLUS_1",
    "FIRST_FANOUT=2 LOCAL_TERMINATION=CONFIRMED SECOND_FANOUT=2 CONVERGENCE_DISTINCT_TRUTH_LINKS=1 CONVERGENCE_OCCURRENCES=2",
    "SCHEDULE_PROVENANCE_EQUIVALENCE=YES TERMINAL_FRONTIER=ZERO AMBIENT_EXECUTION_ROOT=IGNORED",
    "FOREIGN_CONTEXT_OCCURRENCE=REJECTED UNWRAPPED_FRONTIER=REJECTED INVALID_CONTEXT_AUTHORITY=REJECTED",
    "INDEPENDENT_MEMORIES=2 PRODUCTION_UNCHANGED",
  ].join(" "));
}

main();
