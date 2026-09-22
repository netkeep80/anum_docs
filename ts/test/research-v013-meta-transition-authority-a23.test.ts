import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { Memory, ensureRootBasis, type LinkHandle } from "../src/memory.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.13 A23 meta transition authority: ${message}`);
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
  assert(
    e.start === envelope && e.end !== envelope,
    `A23 ${kind} envelope is proper START-self-closed`,
  );
  const out: LinkHandle[] = [];
  const seen = new Set<LinkHandle>();
  let cursor = e.end;
  while (cursor !== memory.root) {
    assert(!seen.has(cursor), `A23 ${kind} chain cycle`);
    seen.add(cursor);
    const cell = memory.poles(cursor);
    out.push(cell.start);
    cursor = cell.end;
  }
  return Object.freeze(out);
}

interface Fixture {
  readonly memory: Memory;
  readonly K: LinkHandle;
  readonly M: LinkHandle;
  readonly metaParent: LinkHandle;
  readonly E0: LinkHandle;
  readonly E1: LinkHandle;
  readonly E2: LinkHandle;
  readonly E3: LinkHandle;
  readonly E4: LinkHandle;
  readonly A1: LinkHandle;
  readonly A2: LinkHandle;
  readonly A3: LinkHandle;
  readonly A4: LinkHandle;
  readonly Z: LinkHandle;
}

function buildSemanticBase(noise: boolean): {
  readonly memory: Memory;
  readonly K: LinkHandle;
  readonly A0: LinkHandle;
  readonly A1: LinkHandle;
  readonly A2: LinkHandle;
  readonly A3: LinkHandle;
  readonly A4: LinkHandle;
  readonly Z: LinkHandle;
  readonly metaParent: LinkHandle;
} {
  const memory = new Memory();
  const b = ensureRootBasis(memory);
  if (noise) {
    const n0 = memory.ensure(b.U, b.C);
    memory.ensure(n0, b.O);
  }

  const fresh: LinkHandle[] = [];
  let seed = memory.ensure(b.U, b.L);
  for (let i = 0; i < 24; i += 1) {
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
  const metaParent = memory.ensure(at(14), at(15));

  const semanticAuthority = freezeChain(memory, Object.freeze([
    memory.ensure(A0, A1), memory.ensure(A0, A2),
    memory.ensure(A2, A3), memory.ensure(A2, A4),
    memory.ensure(A3, Z), memory.ensure(A4, Z),
  ]));
  const K = memory.ensure(parent, semanticAuthority);

  return Object.freeze({ memory, K, A0, A1, A2, A3, A4, Z, metaParent });
}

function initialExecution(
  memory: Memory,
  K: LinkHandle,
  A0: LinkHandle,
): LinkHandle {
  const truth = memory.ensure(K, A0);
  const occurrence = memory.ensure(memory.root, truth);
  return memory.ensure(K, freezeChain(memory, [occurrence]));
}

/**
 * Reference-only A21 producer used before A23 execution to publish the
 * transition authority under test. It is deliberately outside the A23
 * semantic kernel. A23 does not claim authority publication/source removal.
 */
function referenceNextExecution(
  memory: Memory,
  executionRoot: LinkHandle,
): LinkHandle {
  const execution = memory.poles(executionRoot);
  const context = execution.start;
  const contextPoles = memory.poles(context);
  const continuations = readChain(memory, contextPoles.end, "semantic authority");
  const occurrences = readChain(memory, execution.end, "semantic frontier");

  let nextBody = memory.root;
  for (const occurrence of occurrences) {
    const op = memory.poles(occurrence);
    const truth = memory.poles(op.end);
    assert(truth.start === context, "A23 reference occurrence keeps K");

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

function buildFixture(noise: boolean): Fixture {
  const base = buildSemanticBase(noise);
  const { memory, K, A0, A1, A2, A3, A4, Z, metaParent } = base;

  const E0 = initialExecution(memory, K, A0);
  const E1 = referenceNextExecution(memory, E0);
  const E2 = referenceNextExecution(memory, E1);
  const E3 = referenceNextExecution(memory, E2);
  const E4 = referenceNextExecution(memory, E3);

  const producerAuthority = freezeChain(memory, Object.freeze([
    memory.ensure(E0, E1),
    memory.ensure(E1, E2),
    memory.ensure(E2, E3),
    memory.ensure(E3, E4),
  ]));
  const M = memory.ensure(metaParent, producerAuthority);

  return Object.freeze({
    memory, K, M, metaParent, E0, E1, E2, E3, E4,
    A1, A2, A3, A4, Z,
  });
}

/**
 * A23 generic meta-step.
 *
 * M itself carries selected execution-transition authority:
 *
 *   M = MetaParent -> ProducerAuthority
 *   M -> E_n
 *
 * ProducerAuthority carries selected E_n->E_(n+1) continuations.
 * No A21/domain-specific transition producer and no selected transition
 * argument is used at execution time.
 */
function metaStep(
  memory: Memory,
  currentExecutionTruth: LinkHandle,
): LinkHandle | undefined {
  const truth = memory.poles(currentExecutionTruth);
  const metaContext = truth.start;
  const currentExecution = truth.end;

  const metaContextPoles = memory.poles(metaContext);
  const envelope = metaContextPoles.end;
  const envelopePoles = memory.poles(envelope);
  assert(
    envelopePoles.start === envelope && envelopePoles.end !== envelope,
    "A23 meta-context carries proper START-self-closed producer authority",
  );

  const seen = new Set<LinkHandle>();
  let cursor = envelopePoles.end;
  let selected: LinkHandle | undefined;

  while (cursor !== memory.root) {
    assert(!seen.has(cursor), "A23 producer authority cycle");
    seen.add(cursor);

    const cell = memory.poles(cursor);
    const candidate = cell.start;
    const transition = memory.poles(candidate);

    if (transition.start === currentExecution) {
      assert(selected === undefined,
        "A23 producer authority is ambiguous for current execution");
      selected = candidate;
    }
    cursor = cell.end;
  }

  if (selected === undefined) return undefined;
  const transition = memory.poles(selected);
  return memory.ensure(metaContext, transition.end);
}

function frontierOccurrences(
  memory: Memory,
  execution: LinkHandle,
): readonly LinkHandle[] {
  return readChain(memory, memory.poles(execution).end, "frontier");
}

function frontierEnds(
  f: Fixture,
  execution: LinkHandle,
): ReadonlySet<LinkHandle> {
  const out = new Set<LinkHandle>();
  for (const occurrence of frontierOccurrences(f.memory, execution)) {
    const op = f.memory.poles(occurrence);
    const truth = f.memory.poles(op.end);
    same(truth.start, f.K, "A23 semantic truth keeps K");
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
  for (const value of expected) assert(actual.has(value), `${message}: missing value`);
}

function exercise(noise: boolean): void {
  const f = buildFixture(noise);
  const initialTruth = f.memory.ensure(f.M, f.E0);
  let metaOccurrence = f.memory.ensure(f.memory.root, initialTruth);

  const advance = (expected: LinkHandle): LinkHandle => {
    const currentTruth = f.memory.poles(metaOccurrence).end;
    const nextTruth = metaStep(f.memory, currentTruth);
    assert(nextTruth !== undefined, "A23 authorized meta-step exists");
    same(f.memory.poles(nextTruth).end, expected,
      "A23 generic producer selects expected execution root");
    metaOccurrence = f.memory.ensure(metaOccurrence, nextTruth);
    return expected;
  };

  advance(f.E1);
  setSame(frontierEnds(f, f.E1), [f.A1, f.A2], "A23 first split");

  advance(f.E2);
  setSame(frontierEnds(f, f.E2), [f.A3, f.A4], "A23 recursive split");

  advance(f.E3);
  setSame(frontierEnds(f, f.E3), [f.Z], "A23 convergence");
  same(frontierOccurrences(f.memory, f.E3).length, 2,
    "A23 convergence preserves two semantic occurrences");

  advance(f.E4);
  same(frontierOccurrences(f.memory, f.E4).length, 0,
    "A23 terminal execution has ZERO frontier");

  const terminalTruth = f.memory.poles(metaOccurrence).end;
  same(metaStep(f.memory, terminalTruth), undefined,
    "A23 no authorized successor after terminal execution");

  // Meta-history remains immutable Link ancestry.
  const history: LinkHandle[] = [];
  let cursor = metaOccurrence;
  while (true) {
    const op = f.memory.poles(cursor);
    const truth = f.memory.poles(op.end);
    same(truth.start, f.M, "A23 meta-history truth keeps M");
    history.push(truth.end);
    if (op.start === f.memory.root) break;
    cursor = op.start;
  }
  exactJson(history.reverse(), [f.E0, f.E1, f.E2, f.E3, f.E4],
    "A23 immutable meta-history");

  // Ambient transition is inert because it is outside M's frozen producer authority.
  const bogus = f.memory.ensure(f.K, freezeChain(f.memory, []));
  f.memory.ensure(f.E0, bogus);
  const again = metaStep(f.memory, initialTruth);
  assert(again !== undefined, "A23 original authorized transition remains");
  same(f.memory.poles(again).end, f.E1,
    "A23 ambient execution transition ignored");

  // A valid alternative producer authority is inert unless a different M is selected.
  const alternateAuthority = freezeChain(
    f.memory,
    [f.memory.ensure(f.E0, bogus)],
  );
  f.memory.ensure(f.metaParent, alternateAuthority);
  const afterAmbientAuthority = metaStep(f.memory, initialTruth);
  assert(afterAmbientAuthority !== undefined,
    "A23 selected producer authority remains available");
  same(f.memory.poles(afterAmbientAuthority).end, f.E1,
    "A23 ambient alternative producer authority ignored");

  // Empty producer authority is valid and produces ZERO.
  const emptyM = f.memory.ensure(f.metaParent, freezeChain(f.memory, []));
  const emptyTruth = f.memory.ensure(emptyM, f.E0);
  same(metaStep(f.memory, emptyTruth), undefined,
    "A23 empty producer authority yields ZERO");

  // Raw/unwrapped producer body is rejected.
  const rawTransition = f.memory.ensure(f.E0, f.E1);
  const rawBody = f.memory.ensure(rawTransition, f.memory.root);
  const malformedM = f.memory.ensure(f.metaParent, rawBody);
  const malformedTruth = f.memory.ensure(malformedM, f.E0);
  expectThrows(
    () => { metaStep(f.memory, malformedTruth); },
    "A23 unwrapped producer authority rejected",
  );

  // Ambiguous producer authority fails closed.
  const other = f.memory.ensure(f.K, freezeChain(f.memory, []));
  const ambiguousAuthority = freezeChain(f.memory, [
    f.memory.ensure(f.E0, f.E1),
    f.memory.ensure(f.E0, other),
  ]);
  const ambiguousM = f.memory.ensure(f.metaParent, ambiguousAuthority);
  const ambiguousTruth = f.memory.ensure(ambiguousM, f.E0);
  expectThrows(
    () => { metaStep(f.memory, ambiguousTruth); },
    "A23 ambiguous producer authority rejected",
  );
}

function staticKernelGuard(): void {
  const repoRoot = resolve(process.cwd(), "..");
  const source = readFileSync(
    join(repoRoot, "ts/test/research-v013-meta-transition-authority-a23.test.ts"),
    "utf8",
  );
  const start = source.indexOf("function metaStep(");
  const end = source.indexOf("function frontierOccurrences(", start);
  assert(start >= 0 && end > start, "A23 meta-kernel source slice");
  const kernel = source.slice(start, end);

  for (const forbidden of [
    "referenceNextExecution", "produceNextExecution", "frontier", "schedule",
    "State", "Event", "BundleValue", "selectedExecutionTransition",
    "modusPonens", ".find(", ".outgoing(", ".incoming(", "switch(",
  ]) {
    assert(!kernel.includes(forbidden),
      `A23 meta-kernel excludes domain-specific producer primitive ${forbidden}`);
  }

  assert(kernel.includes("const metaContextPoles = memory.poles(metaContext)"),
    "A23 producer authority derives from M");
  assert(kernel.includes("transition.start === currentExecution"),
    "A23 generic authority matches current execution structurally");

  const ensureCalls = kernel.match(/memory\.ensure\(/g) ?? [];
  same(ensureCalls.length, 1,
    "A23 meta-kernel only materializes propagated M->E_(n+1) truth");
}

function main(): void {
  exercise(false);
  exercise(true);
  staticKernelGuard();

  console.log([
    "MTS v0.13 A23: META_TRANSITION_AUTHORITY=GREEN_SCOPED_RESEARCH",
    "META_CONTEXT=M_CARRIES_EXECUTION_TRANSITION_AUTHORITY",
    "META_TRUTH=M_TO_E_N",
    "DOMAIN_SPECIFIC_TRANSITION_PRODUCER_RUNTIME=0",
    "SELECTED_EXECUTION_TRANSITION_ARGUMENT=0",
    "LAW=M_TO_E_N_PLUS_AUTHORIZED_E_N_TO_E_N_PLUS_1_GIVES_M_TO_E_N_PLUS_1",
    "SEMANTIC_FIRST_FANOUT=2 SEMANTIC_SECOND_FANOUT=2",
    "SEMANTIC_CONVERGENCE_TRUTHS=1 SEMANTIC_CONVERGENCE_OCCURRENCES=2",
    "TERMINAL_META_STEP=ZERO META_HISTORY=LINK_ANCESTRY",
    "AMBIENT_EXECUTION_TRANSITION=IGNORED",
    "AMBIENT_ALTERNATIVE_PRODUCER_AUTHORITY=IGNORED",
    "EMPTY_PRODUCER_AUTHORITY=ZERO UNWRAPPED_PRODUCER_AUTHORITY=REJECTED",
    "AMBIGUOUS_PRODUCER_AUTHORITY=REJECTED",
    "PRODUCER_AUTHORITY_PUBLICATION_SOURCE_RESIDUAL=1",
    "CURRENT_META_OCCURRENCE_SELECTION_RESIDUAL=1",
    "INDEPENDENT_MEMORIES=2 PRODUCTION_UNCHANGED",
  ].join(" "));
}

main();
