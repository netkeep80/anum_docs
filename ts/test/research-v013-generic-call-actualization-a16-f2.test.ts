import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { exportCanonicalTopology } from "../src/canonical-topology.js";
import {
  materializeExactSequence,
  readExactSequence,
} from "../src/exact-sequence.js";
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
import {
  defineContext,
  readContext,
} from "../src/state.js";
import {
  resolveFlatBundle,
  valuesEqual,
  type BundleValue,
  type ResolvedOccurrence,
} from "../src/value-bundle.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.13 A16-F2 generic call actualization: ${message}`);
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}
function exactJson(actual: unknown, expected: unknown, message: string): void {
  same(JSON.stringify(actual), JSON.stringify(expected), message);
}

class View implements EnumerableReadMemory {
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
    assert(this.support.has(link), "A16-F2 selected support");
  }
  poles(link: LinkHandle): LinkPoles {
    this.require(link);
    const p = this.source.poles(link);
    assert(this.support.has(p.start) && this.support.has(p.end),
      "A16-F2 support is pole-closed");
    return p;
  }
  find(start: LinkHandle, end: LinkHandle): LinkHandle | undefined {
    this.require(start); this.require(end);
    const x = this.source.find(start, end);
    return x !== undefined && this.support.has(x) ? x : undefined;
  }
  outgoing(start: LinkHandle): readonly LinkHandle[] {
    this.require(start);
    return Object.freeze(this.source.outgoing(start).filter((x) => this.support.has(x)));
  }
  incoming(end: LinkHandle): readonly LinkHandle[] {
    this.require(end);
    return Object.freeze(this.source.incoming(end).filter((x) => this.support.has(x)));
  }
  allLinks(): readonly LinkHandle[] { return this.ordered; }
}

function closure(memory: ReadMemory, roots: readonly LinkHandle[]): ReadonlySet<LinkHandle> {
  const support = new Set<LinkHandle>();
  const pending = [memory.root, ...roots];
  while (pending.length > 0) {
    const link = pending.pop();
    if (link === undefined || support.has(link)) continue;
    const p = memory.poles(link);
    support.add(link);
    pending.push(p.start, p.end);
  }
  return support;
}

interface MetaState {
  readonly pool: LinkHandle;
  readonly context: LinkHandle;
  readonly tos: LinkHandle;
  readonly currentFn: LinkHandle;
}

function defineMetaState(memory: Memory, state: MetaState): LinkHandle {
  return materializeExactSequence(memory, [
    state.pool, state.context, state.tos, state.currentFn,
  ]);
}

function readMetaState(memory: ReadMemory, carrier: LinkHandle): MetaState {
  const seq = readExactSequence(memory, carrier);
  same(seq.values.length, 4, "A16-F2 meta-state arity");
  const [pool, context, tos, currentFn] = seq.values;
  assert(
    pool !== undefined && context !== undefined && tos !== undefined && currentFn !== undefined,
    "A16-F2 complete meta-state",
  );
  readContext(memory, context);
  return Object.freeze({ pool, context, tos, currentFn });
}

interface Artifact {
  readonly schema: "mts-v013-generic-call-actualization/research-v0.1";
  readonly topology: StorageTopologyImage;
  readonly transitionCoordinates: readonly number[];
  readonly named: Readonly<Record<string, number>>;
}

function buildArtifact(noise: boolean): Artifact {
  const memory = new Memory();
  const b = ensureRootBasis(memory);
  if (noise) {
    const n0 = memory.ensure(b.U, b.C);
    const n1 = memory.ensure(n0, b.O);
    memory.ensure(b.L, n1);
  }

  const pool0 = memory.ensure(b.U, b.L);
  const poolA = memory.ensure(b.O, pool0);
  const poolB = memory.ensure(b.C, pool0);
  const poolC = memory.ensure(poolA, b.L);
  const poolD = memory.ensure(poolB, b.U);
  const poolZ = memory.ensure(poolC, poolD);

  const tos0 = memory.ensure(b.L, b.U);
  const tosA = memory.ensure(tos0, b.O);
  const tosB = memory.ensure(tos0, b.C);
  const tosC = memory.ensure(tosA, b.L);
  const tosD = memory.ensure(tosB, b.U);
  const tosZ = memory.ensure(tosC, tosD);

  const f0 = memory.ensure(b.O, b.U);
  const fA = memory.ensure(f0, b.O);
  const fB = memory.ensure(f0, b.C);
  const fC = memory.ensure(fA, b.L);
  const fD = memory.ensure(fB, b.U);
  const fZ = memory.ensure(fC, fD);

  const cur0 = memory.ensure(b.R, b.L);
  const curA = memory.ensure(cur0, b.O);
  const curB = memory.ensure(cur0, b.C);
  const curC = memory.ensure(curA, b.L);
  const curD = memory.ensure(curB, b.U);
  const curZ = memory.ensure(curC, curD);

  const k0 = defineContext(memory, b.R, cur0);
  const kA = defineContext(memory, k0, curA);
  const kB = defineContext(memory, k0, curB);
  const kC = defineContext(memory, kB, curC);
  const kD = defineContext(memory, kB, curD);
  const kZ = defineContext(memory, k0, curZ);

  const E0 = defineMetaState(memory, { pool: pool0, context: k0, tos: tos0, currentFn: f0 });
  const EA = defineMetaState(memory, { pool: poolA, context: kA, tos: tosA, currentFn: fA });
  const EB = defineMetaState(memory, { pool: poolB, context: kB, tos: tosB, currentFn: fB });
  const EC = defineMetaState(memory, { pool: poolC, context: kC, tos: tosC, currentFn: fC });
  const ED = defineMetaState(memory, { pool: poolD, context: kD, tos: tosD, currentFn: fD });
  const EZ = defineMetaState(memory, { pool: poolZ, context: kZ, tos: tosZ, currentFn: fZ });

  const event1 = memory.ensure(b.O, b.C);
  const event2 = memory.ensure(b.C, b.O);
  const event3 = memory.ensure(event1, event2);
  const K = memory.ensure(b.L, b.R);

  const applications: LinkHandle[] = [];
  const transitions: LinkHandle[] = [];
  const define = (state: LinkHandle, event: LinkHandle, ...next: LinkHandle[]): void => {
    const app = memory.ensure(state, event);
    applications.push(app);
    for (const target of next) transitions.push(memory.ensure(app, target));
  };

  define(E0, event1, EA, EB);
  define(EA, event2);
  define(EB, event2, EC, ED);
  define(EC, event3, EZ);
  define(ED, event3, EZ);

  const namedLinks = { K, E0, EA, EB, EC, ED, EZ, event1, event2, event3 };
  const support = closure(memory, [
    ...applications, ...transitions, ...Object.values(namedLinks),
  ]);
  const canonical = exportCanonicalTopology(new View(memory, support));
  const coord = (link: LinkHandle): number => {
    const n = canonical.coordinates.get(link);
    assert(n !== undefined, "A16-F2 coordinate");
    return n;
  };

  return Object.freeze({
    schema: "mts-v013-generic-call-actualization/research-v0.1" as const,
    topology: canonical.topology,
    transitionCoordinates: Object.freeze(transitions.map(coord)),
    named: Object.freeze(Object.fromEntries(
      Object.entries(namedLinks).map(([name, link]) => [name, coord(link)]),
    )),
  });
}

interface Replay {
  readonly memory: Memory;
  readonly transitions: readonly LinkHandle[];
  readonly named: Readonly<Record<string, LinkHandle>>;
}

function replay(artifact: Artifact): Replay {
  same(artifact.schema, "mts-v013-generic-call-actualization/research-v0.1", "A16-F2 schema");
  const memory = restoreTopology(artifact.topology);
  const all = memory.allLinks();
  const at = (n: number): LinkHandle => {
    const x = all[n];
    assert(x !== undefined, "A16-F2 replay coordinate");
    return x;
  };
  return Object.freeze({
    memory,
    transitions: Object.freeze(artifact.transitionCoordinates.map(at)),
    named: Object.freeze(Object.fromEntries(
      Object.entries(artifact.named).map(([name, n]) => [name, at(n)]),
    )),
  });
}

/**
 * A16 dynamic-duality kernel applied to contextual truth Links.
 *
 * Each frontier occurrence is K->Application. Every selected
 * Application->NextState continuation propagates truth to K->NextState.
 */
function propagateCallTruth(
  memory: Memory,
  context: LinkHandle,
  callFrontier: BundleValue,
  transitions: readonly LinkHandle[],
): BundleValue {
  const next: ResolvedOccurrence[] = [];

  for (const parent of callFrontier.occurrences) {
    const contextual = memory.poles(parent.link);
    assert(contextual.start === context, "A16-F2 contextual call starts at K");
    const antecedent = contextual.end;
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

/**
 * Generic call actualization.
 *
 * Given contextual truth K->State and an external Event, application identity is
 * not selected from an authority list. It is simply the Link State->Event.
 * The current context is then linked to that application: K->(State->Event).
 *
 * This operation creates no semantic result by itself. Meaning exists only if
 * selected Application->Next continuations are present in transition authority.
 */
function actualizeCallFrontier(
  r: Replay,
  truthFrontier: BundleValue,
  event: LinkHandle,
  schedule: "forward" | "reverse",
): BundleValue {
  const parents = [...truthFrontier.occurrences];
  if (schedule === "reverse") parents.reverse();
  const calls: ResolvedOccurrence[] = [];

  for (const parent of parents) {
    const truth = r.memory.poles(parent.link);
    same(truth.start, r.named.K!, "A16-F2 state truth keeps K");
    const state = truth.end;
    const application = r.memory.ensure(state, event);
    calls.push(Object.freeze({
      path: parent.path,
      link: r.memory.ensure(r.named.K!, application),
    }));
  }

  return resolveFlatBundle(r.memory, Object.freeze(calls));
}

function initialTruth(r: Replay, state: LinkHandle): BundleValue {
  return resolveFlatBundle(r.memory, Object.freeze([
    Object.freeze({
      path: Object.freeze([]),
      link: r.memory.ensure(r.named.K!, state),
    }),
  ]));
}

function stateEnds(
  r: Replay,
  truthFrontier: BundleValue,
): ReadonlySet<LinkHandle> {
  const states = new Set<LinkHandle>();
  for (const truthLink of truthFrontier.links) {
    const p = r.memory.poles(truthLink);
    same(p.start, r.named.K!, "A16-F2 derived truth starts at K");
    states.add(p.end);
  }
  return states;
}

function setSame(
  actual: ReadonlySet<LinkHandle>,
  expected: readonly LinkHandle[],
  message: string,
): void {
  same(actual.size, new Set(expected).size, `${message}: cardinality`);
  for (const x of expected) assert(actual.has(x), `${message}: missing state`);
}

function normalizedProvenance(r: Replay, bundle: BundleValue): readonly string[] {
  const index = new Map(r.memory.allLinks().map((link, i) => [link, i] as const));
  return Object.freeze(bundle.occurrences.map((o) => {
    const p = r.memory.poles(o.link);
    const n = index.get(p.end);
    assert(n !== undefined, "A16-F2 consequence coordinate");
    return `${o.path.join(".")}:${n}`;
  }).sort());
}

function assertBranchLocalStates(r: Replay): void {
  const n = r.named;
  const A = readMetaState(r.memory, n.EA!);
  const B = readMetaState(r.memory, n.EB!);
  assert(A.context !== B.context && A.tos !== B.tos &&
    A.currentFn !== B.currentFn && A.pool !== B.pool,
  "A16-F2 first split keeps branch-local meta-state");
  const ka = readContext(r.memory, A.context);
  const kb = readContext(r.memory, B.context);
  same(ka.parent, kb.parent, "A16-F2 first split preserves lexical parent");

  const C = readMetaState(r.memory, n.EC!);
  const D = readMetaState(r.memory, n.ED!);
  assert(C.context !== D.context && C.tos !== D.tos && C.currentFn !== D.currentFn,
    "A16-F2 recursive split remains branch-local");
}

function exercise(artifact: Artifact): void {
  const r = replay(artifact);
  const n = r.named;
  for (const name of ["K", "E0", "EA", "EB", "EC", "ED", "EZ", "event1", "event2", "event3"]) {
    assert(n[name] !== undefined, `A16-F2 named ${name}`);
  }
  assertBranchLocalStates(r);

  const start = initialTruth(r, n.E0!);
  setSame(stateEnds(r, start), [n.E0!], "A16-F2 initial K->E0 truth");

  const firstCalls = actualizeCallFrontier(r, start, n.event1!, "forward");
  const first = propagateCallTruth(r.memory, n.K!, firstCalls, r.transitions);
  setSame(stateEnds(r, first), [n.EA!, n.EB!], "A16-F2 first split");
  same(first.occurrences.length, 2, "A16-F2 first branch count");

  const secondCallsForward = actualizeCallFrontier(r, first, n.event2!, "forward");
  const secondCallsReverse = actualizeCallFrontier(r, first, n.event2!, "reverse");
  const secondForward = propagateCallTruth(
    r.memory, n.K!, secondCallsForward, r.transitions,
  );
  const secondReverse = propagateCallTruth(
    r.memory, n.K!, secondCallsReverse, r.transitions,
  );

  setSame(stateEnds(r, secondForward), [n.EC!, n.ED!], "A16-F2 recursive split");
  same(secondForward.occurrences.length, 2,
    "A16-F2 EA terminates while EB splits");
  assert(valuesEqual(secondForward, secondReverse),
    "A16-F2 schedule order preserves extensional truth frontier");
  exactJson(
    normalizedProvenance(r, secondForward),
    normalizedProvenance(r, secondReverse),
    "A16-F2 schedule order preserves provenance",
  );
  exactJson(
    secondForward.occurrences.map((o) => o.path).sort(),
    [[1, 0], [1, 1]],
    "A16-F2 terminated EA branch contributes no truth children",
  );

  const thirdCallsForward = actualizeCallFrontier(r, secondForward, n.event3!, "forward");
  const thirdCallsReverse = actualizeCallFrontier(r, secondReverse, n.event3!, "reverse");
  const thirdForward = propagateCallTruth(
    r.memory, n.K!, thirdCallsForward, r.transitions,
  );
  const thirdReverse = propagateCallTruth(
    r.memory, n.K!, thirdCallsReverse, r.transitions,
  );

  setSame(stateEnds(r, thirdForward), [n.EZ!], "A16-F2 converged contextual truth");
  same(thirdForward.links.size, 1, "A16-F2 one extensional K->EZ truth Link");
  same(thirdForward.occurrences.length, 2,
    "A16-F2 convergence preserves two proof occurrences");
  assert(valuesEqual(thirdForward, thirdReverse),
    "A16-F2 convergence ignores scheduler order");
  exactJson(
    normalizedProvenance(r, thirdForward),
    normalizedProvenance(r, thirdReverse),
    "A16-F2 converged provenance ignores scheduler order",
  );

  // Generic application construction is not semantic authority.
  // EA/event3 was not one of the frozen selected applications. A16-F2 creates
  // the Link anyway, but because no selected continuation starts there the
  // resulting call truth must evaluate to ZERO.
  {
    const onlyEA = resolveFlatBundle(r.memory, Object.freeze([
      Object.freeze({
        path: Object.freeze([]),
        link: r.memory.ensure(n.K!, n.EA!),
      }),
    ]));
    const unknownCalls = actualizeCallFrontier(r, onlyEA, n.event3!, "forward");
    const unknown = propagateCallTruth(r.memory, n.K!, unknownCalls, r.transitions);
    same(unknown.links.size, 0,
      "A16-F2 generic application without selected continuation yields ZERO");
    same(unknown.occurrences.length, 0,
      "A16-F2 unknown application contributes no provenance");
  }

  // A physical transition added after freeze must remain semantically inert.
  const app = r.memory.ensure(n.EB!, n.event2!);
  const bogus = r.memory.ensure(n.event1!, n.EZ!);
  r.memory.ensure(app, bogus);

  const afterAmbient = propagateCallTruth(
    r.memory, n.K!, secondCallsForward, r.transitions,
  );
  setSame(stateEnds(r, afterAmbient), [n.EC!, n.ED!],
    "A16-F2 late ambient transition ignored");

  // A physical contextual truth not carried by the explicit frontier is inert.
  r.memory.ensure(n.K!, bogus);
  const afterAmbientTruth = propagateCallTruth(
    r.memory, n.K!, secondCallsForward, r.transitions,
  );
  setSame(stateEnds(r, afterAmbientTruth), [n.EC!, n.ED!],
    "A16-F2 ambient K->state outside frontier ignored");
}

function staticKernelGuard(): void {
  const repoRoot = resolve(process.cwd(), "..");
  const source = readFileSync(
    join(repoRoot, "ts/test/research-v013-contextual-meta-frontier-a16-f1.test.ts"),
    "utf8",
  );
  const transitionStart = source.indexOf("function propagateCallTruth(");
  const callStart = source.indexOf("function actualizeCallFrontier(");
  const callEnd = source.indexOf("function initialTruth(", callStart);
  assert(transitionStart >= 0 && callStart > transitionStart && callEnd > callStart,
    "A16-F2 kernel source slices");
  const transitionKernel = source.slice(transitionStart, callStart);
  const callKernel = source.slice(callStart, callEnd);

  for (const forbidden of [
    "active",
    "isTrue",
    "currentValue",
    "modusPonens",
    "event",
    "state",
    "applicationFor",
    ".find(",
    ".outgoing(",
    ".incoming(",
    "switch(",
  ]) {
    assert(!transitionKernel.includes(forbidden),
      `A16-F2 propagation kernel excludes host semantic primitive ${forbidden}`);
  }
  for (const forbidden of [
    "applications",
    "applicationCoordinates",
    ".find(",
    ".filter(",
    ".outgoing(",
    ".incoming(",
    "switch(",
  ]) {
    assert(!callKernel.includes(forbidden),
      `A16-F2 call actualization excludes selected-application primitive ${forbidden}`);
  }
}

function main(): void {
  const a = buildArtifact(false);
  const b = buildArtifact(true);
  exactJson(a, b, "A16-F2 portable authority ignores unrelated allocation noise");

  exercise(a);
  exercise(b);
  staticKernelGuard();

  console.log([
    "MTS v0.13 A16-F2:",
    "CONTEXTUAL_META_FRONTIER=GREEN_SCOPED_RESEARCH",
    "FRONTIER_VALUE=K_TO_STATE_TRUTH_LINKS",
    "TRANSITION_KERNEL=A16_LINK_COMPOSITION",
    "FIRST_FANOUT=2",
    "LOCAL_TERMINATION=CONFIRMED",
    "SECOND_FANOUT=2",
    "CONVERGENCE_DISTINCT_TRUTH_LINKS=1",
    "CONVERGENCE_OCCURRENCES=2",
    "SCHEDULE_ORDERS=FORWARD_REVERSE_EQUIVALENT",
    "LATE_AMBIENT_TRANSITION=IGNORED",
    "AMBIENT_TRUTH_OUTSIDE_FRONTIER=IGNORED",
    "HOST_ACTIVE_TRUE_MODUSPONENS_BRANCHES=0",
    "SELECTED_APPLICATION_LOOKUP=REMOVED",
    "GENERIC_APPLICATION_CONSTRUCTION=STATE_TO_EVENT",
    "UNKNOWN_APPLICATION_WITHOUT_CONTINUATION=ZERO",
    "EXTERNAL_EVENT_INPUT=REMAINS",
    "INDEPENDENT_MEMORIES=2",
    "PRODUCTION_UNCHANGED",
  ].join(" "));
}

main();
