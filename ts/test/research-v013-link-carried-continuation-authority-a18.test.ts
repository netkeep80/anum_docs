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
  if (!condition) throw new Error(`v0.13 A18 Link-carried continuation authority: ${message}`);
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
  readonly K2: LinkHandle;
  readonly A0: LinkHandle;
  readonly A1: LinkHandle;
  readonly A2: LinkHandle;
  readonly A3: LinkHandle;
  readonly A4: LinkHandle;
  readonly Z: LinkHandle;
  readonly authorityRoot: LinkHandle;
  readonly authorityTruth: LinkHandle;
  readonly labels: ReadonlyMap<LinkHandle, string>;
}

function freezeAuthority(
  memory: Memory,
  transitions: readonly LinkHandle[],
): LinkHandle {
  let tail = memory.root;
  for (let i = transitions.length - 1; i >= 0; i -= 1) {
    tail = memory.ensure(transitions[i]!, tail);
  }
  return tail;
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
    assert(x !== undefined, `A18 fresh ${i}`);
    return x;
  };

  const A0 = memory.ensure(at(0), at(1));
  const A1 = memory.ensure(at(2), at(3));
  const A2 = memory.ensure(at(4), at(5));
  const A3 = memory.ensure(at(6), at(7));
  const A4 = memory.ensure(at(8), at(9));
  const Z = memory.ensure(at(10), at(11));
  const K = memory.ensure(at(12), at(13));
  const K2 = memory.ensure(at(14), at(15));

  const transitions = Object.freeze([
    memory.ensure(A0, A1),
    memory.ensure(A0, A2),
    memory.ensure(A2, A3),
    memory.ensure(A2, A4),
    memory.ensure(A3, Z),
    memory.ensure(A4, Z),
  ]);
  const authorityRoot = freezeAuthority(memory, transitions);
  const authorityTruth = memory.ensure(K, authorityRoot);

  return Object.freeze({
    memory, K, K2, A0, A1, A2, A3, A4, Z,
    authorityRoot,
    authorityTruth,
    labels: new Map<LinkHandle, string>([
      [A0, "A0"], [A1, "A1"], [A2, "A2"],
      [A3, "A3"], [A4, "A4"], [Z, "Z"],
    ]),
  });
}

/**
 * A18 semantic kernel.
 *
 * Frontier items are contextual truths K->A.
 * Selected continuation authority is itself contextual truth K->Authority.
 * Authority is a frozen Link chain:
 *
 *   cell = transition -> nextCell
 *   terminator = R
 *
 * No host array of selected transitions is supplied to this kernel.
 */
function step(
  memory: Memory,
  context: LinkHandle,
  frontier: BundleValue,
  authorityTruth: LinkHandle,
  schedule: "forward" | "reverse",
): BundleValue {
  const authorityWitness = memory.poles(authorityTruth);
  assert(
    authorityWitness.start === context,
    "A18 continuation authority must be true in current context",
  );

  const selected: LinkHandle[] = [];
  const seen = new Set<LinkHandle>();
  let cursor = authorityWitness.end;

  while (cursor !== memory.root) {
    assert(!seen.has(cursor), "A18 authority chain cycle");
    seen.add(cursor);
    const cell = memory.poles(cursor);
    selected.push(cell.start);
    cursor = cell.end;
  }

  const parents = [...frontier.occurrences];
  if (schedule === "reverse") parents.reverse();

  const next: ResolvedOccurrence[] = [];
  for (const parent of parents) {
    const truth = memory.poles(parent.link);
    assert(truth.start === context, "A18 frontier occurrence is K->A");
    const antecedent = truth.end;
    let child = 0;

    for (const continuation of selected) {
      const p = memory.poles(continuation);
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
    same(p.start, f.K, "A18 contextual truth keeps K");
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
    assert(label !== undefined, "A18 labeled consequence");
    return `${o.path.join(".")}:${label}`;
  }).sort());
}

function exercise(noise: boolean): void {
  const f = buildFixture(noise);
  const start = initial(f);

  const first = step(
    f.memory, f.K, start, f.authorityTruth, "forward",
  );
  setSame(ends(f, first), [f.A1, f.A2], "A18 first split");

  const secondForward = step(
    f.memory, f.K, first, f.authorityTruth, "forward",
  );
  const secondReverse = step(
    f.memory, f.K, first, f.authorityTruth, "reverse",
  );
  setSame(ends(f, secondForward), [f.A3, f.A4], "A18 recursive split");
  same(secondForward.occurrences.length, 2,
    "A18 A1 terminates while A2 branches");
  assert(valuesEqual(secondForward, secondReverse),
    "A18 schedule preserves extensional value");
  exactJson(
    normalizedProvenance(f, secondForward),
    normalizedProvenance(f, secondReverse),
    "A18 schedule preserves provenance",
  );

  const third = step(
    f.memory, f.K, secondForward, f.authorityTruth, "forward",
  );
  setSame(ends(f, third), [f.Z], "A18 convergence");
  same(third.links.size, 1, "A18 one extensional K->Z truth");
  same(third.occurrences.length, 2,
    "A18 convergence preserves proof paths");

  const terminal = step(
    f.memory, f.K, third, f.authorityTruth, "forward",
  );
  same(terminal.links.size, 0, "A18 terminal yields ZERO");

  // A continuation physically present in Memory but absent from frozen authority is inert.
  f.memory.ensure(f.A0, f.Z);
  const afterAmbient = step(
    f.memory, f.K, start, f.authorityTruth, "forward",
  );
  setSame(ends(f, afterAmbient), [f.A1, f.A2],
    "A18 ambient continuation outside authority ignored");

  // A newly constructed alternative authority is inert while the selected
  // contextual authority truth still points to the frozen root.
  const extra = f.memory.ensure(f.A0, f.Z);
  const extendedAuthority = freezeAuthority(f.memory, [extra]);
  f.memory.ensure(f.K, extendedAuthority);
  const afterAmbientAuthority = step(
    f.memory, f.K, start, f.authorityTruth, "forward",
  );
  setSame(ends(f, afterAmbientAuthority), [f.A1, f.A2],
    "A18 ambient alternative authority ignored");

  // Authority is contextual truth, not merely a root handle.
  const foreignAuthorityTruth = f.memory.ensure(f.K2, f.authorityRoot);
  expectThrows(
    () => { step(f.memory, f.K, start, foreignAuthorityTruth, "forward"); },
    "A18 foreign-context authority rejected",
  );

  // Explicit empty authority is valid and yields ZERO.
  const emptyAuthorityTruth = f.memory.ensure(f.K, f.memory.root);
  const empty = step(
    f.memory, f.K, start, emptyAuthorityTruth, "forward",
  );
  same(empty.links.size, 0, "A18 empty selected authority yields ZERO");
}

function staticKernelGuard(): void {
  const repoRoot = resolve(process.cwd(), "..");
  const source = readFileSync(
    join(repoRoot, "ts/test/research-v013-link-carried-continuation-authority-a18.test.ts"),
    "utf8",
  );
  const start = source.indexOf("function step(");
  const end = source.indexOf("function initial(", start);
  assert(start >= 0 && end > start, "A18 kernel source slice");
  const kernel = source.slice(start, end);

  for (const forbidden of [
    "transitions:",
    "selectedTransitions",
    "event",
    "state",
    "pair",
    "request",
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
      `A18 kernel excludes host semantic primitive ${forbidden}`);
  }

  assert(kernel.includes("authorityTruth: LinkHandle"),
    "A18 selected continuation authority is one Link truth witness");
  assert(kernel.includes("authorityWitness.start === context"),
    "A18 authority is contextual truth K->Authority");

  const ensureCalls = kernel.match(/memory\.ensure\(/g) ?? [];
  same(ensureCalls.length, 1,
    "A18 kernel only materializes propagated K->B truth");
}

function main(): void {
  exercise(false);
  exercise(true);
  staticKernelGuard();

  console.log([
    "MTS v0.13 A18:",
    "LINK_CARRIED_CONTINUATION_AUTHORITY=GREEN_SCOPED_RESEARCH",
    "FRONTIER=K_TO_A",
    "AUTHORITY_SELECTION=K_TO_AUTHORITY",
    "HOST_TRANSITION_ARRAY_PARAMETER=0",
    "STEP=K_TO_A_PLUS_AUTHORIZED_A_TO_B_GIVES_K_TO_B",
    "FIRST_FANOUT=2",
    "LOCAL_TERMINATION=CONFIRMED",
    "SECOND_FANOUT=2",
    "CONVERGENCE_DISTINCT_TRUTH_LINKS=1",
    "CONVERGENCE_OCCURRENCES=2",
    "AMBIENT_CONTINUATION=IGNORED",
    "AMBIENT_ALTERNATIVE_AUTHORITY=IGNORED",
    "FOREIGN_CONTEXT_AUTHORITY=REJECTED",
    "EMPTY_AUTHORITY=ZERO",
    "SEMANTIC_KERNEL_ENSURES=1_CONTEXTUAL_TRUTH_ONLY",
    "INDEPENDENT_MEMORIES=2",
    "PRODUCTION_UNCHANGED",
  ].join(" "));
}

main();
