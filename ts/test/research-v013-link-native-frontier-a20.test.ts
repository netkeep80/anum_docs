import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
} from "../src/memory.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.13 A20 Link-native frontier: ${message}`);
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
    `A20 ${kind} envelope is proper START-self-closed`,
  );

  const values: LinkHandle[] = [];
  const seen = new Set<LinkHandle>();
  let cursor = e.end;
  while (cursor !== memory.root) {
    assert(!seen.has(cursor), `A20 ${kind} chain cycle`);
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
    assert(x !== undefined, `A20 fresh ${i}`);
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

function initialFrontier(f: Fixture): LinkHandle {
  const truth = f.memory.ensure(f.K, f.A0);
  const occurrence = f.memory.ensure(f.memory.root, truth);
  return freezeFrontier(f.memory, [occurrence]);
}

/**
 * A20 Link-native scheduler/executor.
 *
 * K carries continuation authority structurally (A19).
 * The selected frontier is one Link envelope, not BundleValue.
 *
 * Each frontier item is an occurrence Link:
 *
 *   occurrence = parentOccurrence -> truthWitness
 *   truthWitness = K -> A
 *
 * Child occurrences point to their exact parent occurrence, so two branches
 * may converge on one canonical K->B truth while retaining distinct provenance.
 */
function step(
  memory: Memory,
  context: LinkHandle,
  frontierEnvelope: LinkHandle,
  schedule: "forward" | "reverse",
): LinkHandle {
  const contextPoles = memory.poles(context);
  const authorityEnvelope = contextPoles.end;
  const continuations = [...readChain(memory, authorityEnvelope, "authority")];
  const occurrences = [...readChain(memory, frontierEnvelope, "frontier")];
  if (schedule === "reverse") occurrences.reverse();

  let nextBody = memory.root;

  for (const occurrence of occurrences) {
    const occurrencePoles = memory.poles(occurrence);
    const truth = memory.poles(occurrencePoles.end);
    assert(truth.start === context, "A20 occurrence carries K->A truth");
    const antecedent = truth.end;

    for (const continuation of continuations) {
      const p = memory.poles(continuation);
      if (p.start !== antecedent) continue;

      const nextTruth = memory.ensure(context, p.end);
      const childOccurrence = memory.ensure(occurrence, nextTruth);
      nextBody = memory.ensure(childOccurrence, nextBody);
    }
  }

  return memory.ensureStartSelfClosed(nextBody);
}

function frontierOccurrences(
  memory: Memory,
  frontier: LinkHandle,
): readonly LinkHandle[] {
  return readChain(memory, frontier, "frontier");
}

function frontierTruthEnds(
  f: Fixture,
  frontier: LinkHandle,
): ReadonlySet<LinkHandle> {
  const out = new Set<LinkHandle>();
  for (const occurrence of frontierOccurrences(f.memory, frontier)) {
    const op = f.memory.poles(occurrence);
    const truth = f.memory.poles(op.end);
    same(truth.start, f.K, "A20 frontier truth keeps K");
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
    assert(!seen.has(cursor), "A20 occurrence ancestry cycle");
    seen.add(cursor);
    const p = f.memory.poles(cursor);
    const truth = f.memory.poles(p.end);
    same(truth.start, f.K, "A20 ancestry truth keeps K");
    const label = f.labels.get(truth.end);
    assert(label !== undefined, "A20 ancestry consequence label");
    labels.push(label);
    if (p.start === f.memory.root) break;
    cursor = p.start;
  }

  return labels.reverse().join(">");
}

function frontierProvenance(
  f: Fixture,
  frontier: LinkHandle,
): readonly string[] {
  return Object.freeze(
    frontierOccurrences(f.memory, frontier)
      .map((o) => provenancePath(f, o))
      .sort(),
  );
}

function exercise(noise: boolean): void {
  const f = buildFixture(noise);
  const start = initialFrontier(f);

  // Ambient contextual truth not selected by the Link-native frontier is inert.
  f.memory.ensure(f.K, f.A2);

  const first = step(f.memory, f.K, start, "forward");
  setSame(frontierTruthEnds(f, first), [f.A1, f.A2], "A20 first split");
  same(frontierOccurrences(f.memory, first).length, 2,
    "A20 first occurrence count");
  exactJson(
    frontierProvenance(f, first),
    ["A0>A1", "A0>A2"],
    "A20 first provenance",
  );

  const secondForward = step(f.memory, f.K, first, "forward");
  const secondReverse = step(f.memory, f.K, first, "reverse");
  setSame(frontierTruthEnds(f, secondForward), [f.A3, f.A4],
    "A20 recursive split");
  same(frontierOccurrences(f.memory, secondForward).length, 2,
    "A20 A1 terminates while A2 branches");
  exactJson(
    frontierProvenance(f, secondForward),
    ["A0>A2>A3", "A0>A2>A4"],
    "A20 branch-local termination provenance",
  );
  exactJson(
    frontierProvenance(f, secondForward),
    frontierProvenance(f, secondReverse),
    "A20 schedule preserves provenance",
  );

  const thirdForward = step(f.memory, f.K, secondForward, "forward");
  const thirdReverse = step(f.memory, f.K, secondReverse, "reverse");
  setSame(frontierTruthEnds(f, thirdForward), [f.Z], "A20 convergence");
  same(frontierOccurrences(f.memory, thirdForward).length, 2,
    "A20 convergence preserves two occurrences");
  exactJson(
    frontierProvenance(f, thirdForward),
    ["A0>A2>A3>Z", "A0>A2>A4>Z"],
    "A20 convergence provenance",
  );
  exactJson(
    frontierProvenance(f, thirdForward),
    frontierProvenance(f, thirdReverse),
    "A20 schedule preserves converged provenance",
  );

  const zTruths = new Set<LinkHandle>();
  for (const occurrence of frontierOccurrences(f.memory, thirdForward)) {
    zTruths.add(f.memory.poles(occurrence).end);
  }
  same(zTruths.size, 1,
    "A20 two occurrences share one canonical K->Z truth Link");

  const terminal = step(f.memory, f.K, thirdForward, "forward");
  same(frontierOccurrences(f.memory, terminal).length, 0,
    "A20 terminal frontier is ZERO");

  // Ambient occurrence/frontier carrier is inert unless selected as the step input.
  const ambientTruth = f.memory.ensure(f.K, f.A3);
  const ambientOccurrence = f.memory.ensure(f.memory.root, ambientTruth);
  freezeFrontier(f.memory, [ambientOccurrence]);
  const firstAgain = step(f.memory, f.K, start, "forward");
  setSame(frontierTruthEnds(f, firstAgain), [f.A1, f.A2],
    "A20 ambient occurrence outside selected frontier ignored");

  // Malformed selected occurrence from another context fails closed.
  const K2 = f.memory.ensure(f.A4, f.Z);
  const foreignTruth = f.memory.ensure(K2, f.A0);
  const foreignOccurrence = f.memory.ensure(f.memory.root, foreignTruth);
  const foreignFrontier = freezeFrontier(f.memory, [foreignOccurrence]);
  expectThrows(
    () => { step(f.memory, f.K, foreignFrontier, "forward"); },
    "A20 foreign-context occurrence rejected",
  );

  // Raw frontier body without structural envelope is rejected.
  const rawBody = f.memory.ensure(ambientOccurrence, f.memory.root);
  expectThrows(
    () => { step(f.memory, f.K, rawBody, "forward"); },
    "A20 unwrapped frontier rejected",
  );
}

function staticKernelGuard(): void {
  const repoRoot = resolve(process.cwd(), "..");
  const source = readFileSync(
    join(repoRoot, "ts/test/research-v013-link-native-frontier-a20.test.ts"),
    "utf8",
  );
  const start = source.indexOf("function step(");
  const end = source.indexOf("function frontierOccurrences(", start);
  assert(start >= 0 && end > start, "A20 kernel source slice");
  const kernel = source.slice(start, end);

  for (const forbidden of [
    "BundleValue",
    "ResolvedOccurrence",
    "resolveFlatBundle",
    ".occurrences",
    ".links",
    "authorityTruth",
    "transitions:",
    "active",
    "isTrue",
    "currentValue",
    "modusPonens",
    ".find(",
    ".outgoing(",
    ".incoming(",
    "switch(",
  ]) {
    assert(!kernel.includes(forbidden),
      `A20 kernel excludes host frontier/semantic primitive ${forbidden}`);
  }

  assert(kernel.includes("frontierEnvelope: LinkHandle"),
    "A20 frontier input is one Link carrier");
  assert(kernel.includes("memory.ensure(occurrence, nextTruth)"),
    "A20 provenance is Link-native occurrence ancestry");
}

function main(): void {
  exercise(false);
  exercise(true);
  staticKernelGuard();

  console.log([
    "MTS v0.13 A20:",
    "LINK_NATIVE_FRONTIER=GREEN_SCOPED_RESEARCH",
    "HOST_BUNDLEVALUE_FRONTIER=REMOVED",
    "FRONTIER_CARRIER=PROPER_START_SELF_CLOSED_LINK_CHAIN",
    "OCCURRENCE=ParentOccurrence_TO_K_TO_A",
    "CONTEXT_CARRIED_AUTHORITY=YES",
    "FIRST_FANOUT=2",
    "LOCAL_TERMINATION=CONFIRMED",
    "SECOND_FANOUT=2",
    "CONVERGENCE_DISTINCT_TRUTH_LINKS=1",
    "CONVERGENCE_OCCURRENCES=2",
    "PROVENANCE=LINK_ANCESTRY",
    "SCHEDULE_PROVENANCE_EQUIVALENCE=YES",
    "AMBIENT_TRUTH=IGNORED",
    "AMBIENT_OCCURRENCE=IGNORED",
    "FOREIGN_CONTEXT_OCCURRENCE=REJECTED",
    "UNWRAPPED_FRONTIER=REJECTED",
    "TERMINAL_FRONTIER=ZERO",
    "INDEPENDENT_MEMORIES=2",
    "PRODUCTION_UNCHANGED",
  ].join(" "));
}

main();
