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
  if (!condition) throw new Error(`v0.13 A19 context-carried authority: ${message}`);
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
  readonly parent: LinkHandle;
  readonly K: LinkHandle;
  readonly A0: LinkHandle;
  readonly A1: LinkHandle;
  readonly A2: LinkHandle;
  readonly A3: LinkHandle;
  readonly A4: LinkHandle;
  readonly Z: LinkHandle;
  readonly authorityBody: LinkHandle;
  readonly authorityEnvelope: LinkHandle;
  readonly labels: ReadonlyMap<LinkHandle, string>;
}

function freezeAuthority(
  memory: Memory,
  transitions: readonly LinkHandle[],
): { readonly body: LinkHandle; readonly envelope: LinkHandle } {
  let body = memory.root;
  for (let i = transitions.length - 1; i >= 0; i -= 1) {
    body = memory.ensure(transitions[i]!, body);
  }
  const envelope = memory.ensureStartSelfClosed(body);
  return Object.freeze({ body, envelope });
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
  for (let i = 0; i < 22; i += 1) {
    seed = memory.ensure(seed, i % 2 === 0 ? b.O : b.C);
    fresh.push(seed);
  }
  const at = (i: number): LinkHandle => {
    const x = fresh[i];
    assert(x !== undefined, `A19 fresh ${i}`);
    return x;
  };

  const A0 = memory.ensure(at(0), at(1));
  const A1 = memory.ensure(at(2), at(3));
  const A2 = memory.ensure(at(4), at(5));
  const A3 = memory.ensure(at(6), at(7));
  const A4 = memory.ensure(at(8), at(9));
  const Z = memory.ensure(at(10), at(11));
  const parent = memory.ensure(at(12), at(13));

  const transitions = Object.freeze([
    memory.ensure(A0, A1),
    memory.ensure(A0, A2),
    memory.ensure(A2, A3),
    memory.ensure(A2, A4),
    memory.ensure(A3, Z),
    memory.ensure(A4, Z),
  ]);

  const authority = freezeAuthority(memory, transitions);
  const K = memory.ensure(parent, authority.envelope);

  return Object.freeze({
    memory,
    parent,
    K,
    A0,
    A1,
    A2,
    A3,
    A4,
    Z,
    authorityBody: authority.body,
    authorityEnvelope: authority.envelope,
    labels: new Map<LinkHandle, string>([
      [A0, "A0"], [A1, "A1"], [A2, "A2"],
      [A3, "A3"], [A4, "A4"], [Z, "Z"],
    ]),
  });
}

/**
 * A19 semantic kernel.
 *
 * K itself carries selected continuation authority:
 *
 *   K = Parent -> AuthorityEnvelope
 *   AuthorityEnvelope = START-self-closed(AuthorityBody)
 *
 * Frontier values remain contextual truths K->A.
 * No separate authority argument is supplied.
 */
function step(
  memory: Memory,
  context: LinkHandle,
  frontier: BundleValue,
  schedule: "forward" | "reverse",
): BundleValue {
  const contextPoles = memory.poles(context);
  const envelope = contextPoles.end;
  const envelopePoles = memory.poles(envelope);

  assert(
    envelopePoles.start === envelope && envelopePoles.end !== envelope,
    "A19 context END is a proper START-self-closed authority envelope",
  );

  const selected: LinkHandle[] = [];
  const seen = new Set<LinkHandle>();
  let cursor = envelopePoles.end;

  while (cursor !== memory.root) {
    assert(!seen.has(cursor), "A19 authority chain cycle");
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
    assert(truth.start === context, "A19 frontier occurrence is K->A");
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
    same(p.start, f.K, "A19 contextual truth keeps K");
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
    assert(label !== undefined, "A19 labeled consequence");
    return `${o.path.join(".")}:${label}`;
  }).sort());
}

function exercise(noise: boolean): void {
  const f = buildFixture(noise);
  const start = initial(f);

  const first = step(f.memory, f.K, start, "forward");
  setSame(ends(f, first), [f.A1, f.A2], "A19 first split");

  const secondForward = step(f.memory, f.K, first, "forward");
  const secondReverse = step(f.memory, f.K, first, "reverse");
  setSame(ends(f, secondForward), [f.A3, f.A4], "A19 recursive split");
  same(secondForward.occurrences.length, 2,
    "A19 A1 terminates while A2 branches");
  assert(valuesEqual(secondForward, secondReverse),
    "A19 schedule preserves extensional value");
  exactJson(
    normalizedProvenance(f, secondForward),
    normalizedProvenance(f, secondReverse),
    "A19 schedule preserves provenance",
  );

  const third = step(f.memory, f.K, secondForward, "forward");
  setSame(ends(f, third), [f.Z], "A19 convergence");
  same(third.links.size, 1, "A19 one extensional K->Z truth");
  same(third.occurrences.length, 2,
    "A19 convergence preserves proof paths");

  const terminal = step(f.memory, f.K, third, "forward");
  same(terminal.links.size, 0, "A19 terminal yields ZERO");

  // Ambient continuation remains inert because K carries immutable selected authority.
  f.memory.ensure(f.A0, f.Z);
  const afterAmbient = step(f.memory, f.K, start, "forward");
  setSame(ends(f, afterAmbient), [f.A1, f.A2],
    "A19 ambient continuation outside context authority ignored");

  // Constructing another valid authority does not alter K.
  const alternate = freezeAuthority(f.memory, [f.memory.ensure(f.A0, f.Z)]);
  f.memory.ensure(f.parent, alternate.envelope);
  const afterAlternate = step(f.memory, f.K, start, "forward");
  setSame(ends(f, afterAlternate), [f.A1, f.A2],
    "A19 ambient alternate context authority ignored");

  // To change authority, a new context Link must be selected explicitly.
  const Kalt = f.memory.ensure(f.parent, alternate.envelope);
  const altStart = resolveFlatBundle(f.memory, Object.freeze([
    Object.freeze({
      path: Object.freeze([]),
      link: f.memory.ensure(Kalt, f.A0),
    }),
  ]));
  const alt = step(f.memory, Kalt, altStart, "forward");
  const altEnds = new Set<LinkHandle>();
  for (const truth of alt.links) altEnds.add(f.memory.poles(truth).end);
  same(altEnds.size, 1, "A19 alternate context authority result count");
  assert(altEnds.has(f.Z), "A19 alternate context selects its own authority");

  // Raw/unwrapped authority body must not be accepted as context authority.
  const malformedK = f.memory.ensure(f.parent, f.authorityBody);
  const malformedStart = resolveFlatBundle(f.memory, Object.freeze([
    Object.freeze({
      path: Object.freeze([]),
      link: f.memory.ensure(malformedK, f.A0),
    }),
  ]));
  expectThrows(
    () => { step(f.memory, malformedK, malformedStart, "forward"); },
    "A19 unwrapped authority body rejected",
  );

  // Empty authority is represented by a proper envelope over R and yields ZERO.
  const emptyEnvelope = f.memory.ensureStartSelfClosed(f.memory.root);
  const emptyK = f.memory.ensure(f.parent, emptyEnvelope);
  const emptyStart = resolveFlatBundle(f.memory, Object.freeze([
    Object.freeze({
      path: Object.freeze([]),
      link: f.memory.ensure(emptyK, f.A0),
    }),
  ]));
  const empty = step(f.memory, emptyK, emptyStart, "forward");
  same(empty.links.size, 0, "A19 empty context authority yields ZERO");
}

function staticKernelGuard(): void {
  const repoRoot = resolve(process.cwd(), "..");
  const source = readFileSync(
    join(repoRoot, "ts/test/research-v013-context-carried-authority-a19.test.ts"),
    "utf8",
  );
  const start = source.indexOf("function step(");
  const end = source.indexOf("function initial(", start);
  assert(start >= 0 && end > start, "A19 kernel source slice");
  const kernel = source.slice(start, end);

  for (const forbidden of [
    "authorityTruth",
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
      `A19 kernel excludes host semantic primitive ${forbidden}`);
  }

  assert(kernel.includes("const contextPoles = memory.poles(context)"),
    "A19 authority derives from context structure");
  assert(kernel.includes("envelopePoles.start === envelope"),
    "A19 validates structural authority envelope");

  const ensureCalls = kernel.match(/memory\.ensure\(/g) ?? [];
  same(ensureCalls.length, 1,
    "A19 kernel only materializes propagated K->B truth");
}

function main(): void {
  exercise(false);
  exercise(true);
  staticKernelGuard();

  console.log([
    "MTS v0.13 A19:",
    "CONTEXT_CARRIED_CONTINUATION_AUTHORITY=GREEN_SCOPED_RESEARCH",
    "CONTEXT_SHAPE=PARENT_TO_AUTHORITY_ENVELOPE",
    "AUTHORITY_ENVELOPE=PROPER_START_SELF_CLOSED",
    "FRONTIER=K_TO_A",
    "SEPARATE_AUTHORITY_ARGUMENT=0",
    "HOST_TRANSITION_ARRAY_PARAMETER=0",
    "STEP=K_TO_A_PLUS_CONTEXT_AUTHORIZED_A_TO_B_GIVES_K_TO_B",
    "FIRST_FANOUT=2",
    "LOCAL_TERMINATION=CONFIRMED",
    "SECOND_FANOUT=2",
    "CONVERGENCE_DISTINCT_TRUTH_LINKS=1",
    "CONVERGENCE_OCCURRENCES=2",
    "AMBIENT_CONTINUATION=IGNORED",
    "AMBIENT_ALTERNATE_AUTHORITY=IGNORED",
    "AUTHORITY_CHANGE_REQUIRES_NEW_CONTEXT=YES",
    "UNWRAPPED_AUTHORITY=REJECTED",
    "EMPTY_AUTHORITY=ZERO",
    "SEMANTIC_KERNEL_ENSURES=1_CONTEXTUAL_TRUTH_ONLY",
    "INDEPENDENT_MEMORIES=2",
    "PRODUCTION_UNCHANGED",
  ].join(" "));
}

main();
