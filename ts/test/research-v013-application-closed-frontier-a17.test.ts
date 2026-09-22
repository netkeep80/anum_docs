import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
} from "../src/memory.js";
import {
  resolveFlatBundle,
  valuesEqual,
  type BundleValue,
  type ResolvedOccurrence,
} from "../src/value-bundle.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.13 A17 application-closed frontier: ${message}`);
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}
function exactJson(actual: unknown, expected: unknown, message: string): void {
  same(JSON.stringify(actual), JSON.stringify(expected), message);
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
  readonly transitions: readonly LinkHandle[];
  readonly labels: ReadonlyMap<LinkHandle, string>;
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
  for (let i = 0; i < 16; i += 1) {
    seed = memory.ensure(seed, i % 2 === 0 ? b.O : b.C);
    fresh.push(seed);
  }

  const at = (i: number): LinkHandle => {
    const x = fresh[i];
    assert(x !== undefined, `A17 fresh ${i}`);
    return x;
  };

  // Every frontier-capable Ai is already an application-shaped Link ∞->∞.
  const A0 = memory.ensure(at(0), at(1));
  const A1 = memory.ensure(at(2), at(3));
  const A2 = memory.ensure(at(4), at(5));
  const A3 = memory.ensure(at(6), at(7));
  const A4 = memory.ensure(at(8), at(9));
  const Z = memory.ensure(at(10), at(11));
  const K = memory.ensure(at(12), at(13));

  const transitions = Object.freeze([
    memory.ensure(A0, A1),
    memory.ensure(A0, A2),
    memory.ensure(A2, A3),
    memory.ensure(A2, A4),
    memory.ensure(A3, Z),
    memory.ensure(A4, Z),
  ]);

  return Object.freeze({
    memory,
    K,
    A0,
    A1,
    A2,
    A3,
    A4,
    Z,
    transitions,
    labels: new Map<LinkHandle, string>([
      [A0, "A0"],
      [A1, "A1"],
      [A2, "A2"],
      [A3, "A3"],
      [A4, "A4"],
      [Z, "Z"],
    ]),
  });
}

/**
 * The complete A17 semantic kernel.
 *
 * Frontier values are contextual truths K->A.
 * Selected A->B continuations propagate truth to K->B.
 * B may itself already be another application-shaped Link.
 */
function step(
  memory: Memory,
  context: LinkHandle,
  frontier: BundleValue,
  transitions: readonly LinkHandle[],
  schedule: "forward" | "reverse",
): BundleValue {
  const parents = [...frontier.occurrences];
  if (schedule === "reverse") parents.reverse();

  const next: ResolvedOccurrence[] = [];
  for (const parent of parents) {
    const truth = memory.poles(parent.link);
    assert(truth.start === context, "A17 frontier occurrence is K->A");
    const antecedent = truth.end;
    let child = 0;

    for (const transition of transitions) {
      const p = memory.poles(transition);
      if (p.start !== antecedent) continue;
      next.push(Object.freeze({
        path: Object.freeze([...parent.path, child]),
        link: memory.ensure(context, p.end),
      }));
      child += 1;
    }
  }

  return resolveFlatBundle(memory, Object.freeze(next));
}

function initial(f: Fixture): BundleValue {
  return resolveFlatBundle(f.memory, Object.freeze([
    Object.freeze({
      path: Object.freeze([]),
      link: f.memory.ensure(f.K, f.A0),
    }),
  ]));
}

function ends(f: Fixture, value: BundleValue): ReadonlySet<LinkHandle> {
  const out = new Set<LinkHandle>();
  for (const truth of value.links) {
    const p = f.memory.poles(truth);
    same(p.start, f.K, "A17 contextual truth keeps K");
    out.add(p.end);
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

function normalizedProvenance(
  f: Fixture,
  value: BundleValue,
): readonly string[] {
  return Object.freeze(value.occurrences.map((o) => {
    const p = f.memory.poles(o.link);
    const label = f.labels.get(p.end);
    assert(label !== undefined, "A17 labeled consequence");
    return `${o.path.join(".")}:${label}`;
  }).sort());
}

function exercise(noise: boolean): void {
  const f = buildFixture(noise);
  const start = initial(f);

  setSame(ends(f, start), [f.A0], "A17 initial invocation truth");

  const first = step(f.memory, f.K, start, f.transitions, "forward");
  setSame(ends(f, first), [f.A1, f.A2], "A17 first split");
  same(first.occurrences.length, 2, "A17 first split occurrences");

  const secondForward = step(f.memory, f.K, first, f.transitions, "forward");
  const secondReverse = step(f.memory, f.K, first, f.transitions, "reverse");
  setSame(ends(f, secondForward), [f.A3, f.A4], "A17 recursive split");
  same(secondForward.occurrences.length, 2,
    "A17 A1 terminates while A2 branches");
  assert(valuesEqual(secondForward, secondReverse),
    "A17 second-step schedule preserves extensional value");
  exactJson(
    normalizedProvenance(f, secondForward),
    normalizedProvenance(f, secondReverse),
    "A17 second-step schedule preserves provenance",
  );
  exactJson(
    secondForward.occurrences.map((o) => o.path).sort(),
    [[1, 0], [1, 1]],
    "A17 terminated branch contributes no child",
  );

  const thirdForward = step(
    f.memory, f.K, secondForward, f.transitions, "forward",
  );
  const thirdReverse = step(
    f.memory, f.K, secondReverse, f.transitions, "reverse",
  );
  setSame(ends(f, thirdForward), [f.Z], "A17 convergence");
  same(thirdForward.links.size, 1, "A17 one extensional K->Z truth");
  same(thirdForward.occurrences.length, 2,
    "A17 convergence preserves two proof occurrences");
  assert(valuesEqual(thirdForward, thirdReverse),
    "A17 converged value ignores scheduler order");
  exactJson(
    normalizedProvenance(f, thirdForward),
    normalizedProvenance(f, thirdReverse),
    "A17 converged provenance ignores scheduler order",
  );

  const terminal = step(
    f.memory, f.K, thirdForward, f.transitions, "forward",
  );
  same(terminal.links.size, 0, "A17 terminal Z yields ZERO");

  // An invocation may exist and be true without having any selected continuation.
  const unknownApplication = f.memory.ensure(f.A1, f.Z);
  const unknownTruth = resolveFlatBundle(f.memory, Object.freeze([
    Object.freeze({
      path: Object.freeze([]),
      link: f.memory.ensure(f.K, unknownApplication),
    }),
  ]));
  const unknownResult = step(
    f.memory, f.K, unknownTruth, f.transitions, "forward",
  );
  same(unknownResult.links.size, 0,
    "A17 application without continuation yields ZERO");

  // Ambient transition added after selected authority freeze is inert.
  const bogus = f.memory.ensure(f.A0, f.Z);
  const afterAmbient = step(
    f.memory, f.K, start, f.transitions, "forward",
  );
  setSame(ends(f, afterAmbient), [f.A1, f.A2],
    "A17 late ambient transition ignored");
  assert(!afterAmbient.links.has(bogus),
    "A17 ambient transition is not contextual result");
}

function staticKernelGuard(): void {
  const repoRoot = resolve(process.cwd(), "..");
  const source = readFileSync(
    join(repoRoot, "ts/test/research-v013-application-closed-frontier-a17.test.ts"),
    "utf8",
  );
  const start = source.indexOf("function step(");
  const end = source.indexOf("function initial(", start);
  assert(start >= 0 && end > start, "A17 kernel source slice");
  const kernel = source.slice(start, end);

  for (const forbidden of [
    "event",
    "state",
    "pair",
    "request",
    "applicationFor",
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
      `A17 kernel excludes runtime semantic primitive ${forbidden}`);
  }

  const ensureCalls = kernel.match(/memory\.ensure\(/g) ?? [];
  same(ensureCalls.length, 1,
    "A17 kernel has exactly one ensure: propagated K->B truth");
  assert(kernel.includes("memory.ensure(context, p.end)"),
    "A17 only materializes contextual consequent truth");
}

function main(): void {
  exercise(false);
  exercise(true);
  staticKernelGuard();

  console.log([
    "MTS v0.13 A17:",
    "APPLICATION_CLOSED_FRONTIER=GREEN_SCOPED_RESEARCH",
    "INITIAL_TRUTH=K_TO_A0",
    "APPLICATION_SHAPE=INFINITY_TO_INFINITY",
    "STEP=K_TO_A_PLUS_A_TO_B_GIVES_K_TO_B",
    "FIRST_FANOUT=2",
    "LOCAL_TERMINATION=CONFIRMED",
    "SECOND_FANOUT=2",
    "CONVERGENCE_DISTINCT_TRUTH_LINKS=1",
    "CONVERGENCE_OCCURRENCES=2",
    "TERMINAL_RESULT=ZERO_NEXT",
    "UNKNOWN_APPLICATION_WITHOUT_CONTINUATION=ZERO",
    "LATE_AMBIENT_TRANSITION=IGNORED",
    "RUNTIME_EVENT_PARAMETER=0",
    "RUNTIME_PAIR_CONSTRUCTION=0",
    "RUNTIME_PAIR_REQUEST=0",
    "SEMANTIC_KERNEL_ENSURES=1_CONTEXTUAL_TRUTH_ONLY",
    "INDEPENDENT_MEMORIES=2",
    "PRODUCTION_UNCHANGED",
  ].join(" "));
}

main();
