import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { materializeExactSequence, readExactSequence } from "../src/exact-sequence.js";
import { Memory, ensureRootBasis, type LinkHandle, type ReadMemory } from "../src/memory.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.13 A24 self-generated meta authority: ${message}`);
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}
function expectThrows(run: () => void, message: string): void {
  let threw = false;
  try { run(); } catch { threw = true; }
  assert(threw, message);
}

function freezeChain(memory: Memory, values: readonly LinkHandle[]): LinkHandle {
  let body = memory.root;
  for (let i = values.length - 1; i >= 0; i -= 1) body = memory.ensure(values[i]!, body);
  return memory.ensureStartSelfClosed(body);
}

function readChain(memory: Memory, envelope: LinkHandle): readonly LinkHandle[] {
  const e = memory.poles(envelope);
  assert(e.start === envelope && e.end !== envelope, "A24 proper START-self envelope");
  const out: LinkHandle[] = [];
  const seen = new Set<LinkHandle>();
  let cursor = e.end;
  while (cursor !== memory.root) {
    assert(!seen.has(cursor), "A24 chain cycle");
    seen.add(cursor);
    const cell = memory.poles(cursor);
    out.push(cell.start);
    cursor = cell.end;
  }
  return Object.freeze(out);
}

interface Base {
  readonly memory: Memory;
  readonly K: LinkHandle;
  readonly metaParent: LinkHandle;
  readonly E0: LinkHandle; readonly E1: LinkHandle; readonly E2: LinkHandle;
  readonly E3: LinkHandle; readonly E4: LinkHandle;
}

function referenceNextExecution(memory: Memory, executionRoot: LinkHandle): LinkHandle {
  const execution = memory.poles(executionRoot);
  const context = execution.start;
  const continuations = readChain(memory, memory.poles(context).end);
  const occurrences = readChain(memory, execution.end);
  let nextBody = memory.root;

  for (const occurrence of occurrences) {
    const op = memory.poles(occurrence);
    const truth = memory.poles(op.end);
    assert(truth.start === context, "A24 reference occurrence keeps K");
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

function buildBase(noise: boolean): Base {
  const memory = new Memory();
  const b = ensureRootBasis(memory);
  if (noise) memory.ensure(memory.ensure(b.U, b.C), b.O);

  const fresh: LinkHandle[] = [];
  let seed = memory.ensure(b.U, b.L);
  for (let i = 0; i < 24; i += 1) {
    seed = memory.ensure(seed, i % 2 === 0 ? b.O : b.C);
    fresh.push(seed);
  }
  const at = (i: number): LinkHandle => {
    const x = fresh[i]; assert(x !== undefined, `A24 fresh ${i}`); return x;
  };

  const A0 = memory.ensure(at(0), at(1));
  const A1 = memory.ensure(at(2), at(3));
  const A2 = memory.ensure(at(4), at(5));
  const A3 = memory.ensure(at(6), at(7));
  const A4 = memory.ensure(at(8), at(9));
  const Z = memory.ensure(at(10), at(11));
  const parent = memory.ensure(at(12), at(13));
  const metaParent = memory.ensure(at(14), at(15));

  const semanticAuthority = freezeChain(memory, [
    memory.ensure(A0, A1), memory.ensure(A0, A2),
    memory.ensure(A2, A3), memory.ensure(A2, A4),
    memory.ensure(A3, Z), memory.ensure(A4, Z),
  ]);
  const K = memory.ensure(parent, semanticAuthority);
  const truth0 = memory.ensure(K, A0);
  const occurrence0 = memory.ensure(memory.root, truth0);
  const E0 = memory.ensure(K, freezeChain(memory, [occurrence0]));
  const E1 = referenceNextExecution(memory, E0);
  const E2 = referenceNextExecution(memory, E1);
  const E3 = referenceNextExecution(memory, E2);
  const E4 = referenceNextExecution(memory, E3);

  return Object.freeze({ memory, K, metaParent, E0, E1, E2, E3, E4 });
}

/**
 * Exact copy of the A23 runtime meta-step.
 * A24 changes only the source/publication of M's producer authority.
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

const ROOT = 0, META = 1, E0 = 2, E1 = 3, E2 = 4, E3 = 5, E4 = 6;
const T0 = 7, T1 = 8, T2 = 9, T3 = 10;
const C3 = 11, C2 = 12, C1 = 13, C0 = 14, ENV = 15, M = 16;

function anonymousRoles(memory: Memory): readonly LinkHandle[] {
  const b = ensureRootBasis(memory);
  const roles: LinkHandle[] = [];
  let seed = memory.ensure(b.O, b.U);
  for (let i = 0; i < 17; i += 1) {
    seed = memory.ensure(seed, i % 2 === 0 ? b.L : b.C);
    roles.push(seed);
  }
  same(new Set(roles).size, 17, "A24 anonymous roles distinct");
  return Object.freeze(roles);
}

function defineRule(memory: Memory): LinkHandle {
  const r = anonymousRoles(memory);
  const triples = [
    [T0, E0, E1], [T1, E1, E2], [T2, E2, E3], [T3, E3, E4],
    [C3, T3, ROOT], [C2, T2, C3], [C1, T1, C2], [C0, T0, C1],
    [ENV, ENV, C0], [M, META, ENV],
  ] as const;
  const constraints = triples.map(([target, start, end]) =>
    materializeExactSequence(memory, [r[target]!, r[start]!, r[end]!]));
  return materializeExactSequence(memory, [
    materializeExactSequence(memory, r),
    materializeExactSequence(memory, constraints),
  ]);
}

function structurallyAdmitted(
  memory: ReadMemory,
  rule: LinkHandle,
  candidate: LinkHandle,
): boolean {
  try {
    const parts = readExactSequence(memory, rule).values;
    if (parts.length !== 2 || parts[0] === undefined || parts[1] === undefined) return false;
    const roles = readExactSequence(memory, parts[0]).values;
    const values = readExactSequence(memory, candidate).values;
    if (roles.length !== values.length || new Set(roles).size !== roles.length) return false;
    const bindings = new Map<LinkHandle, LinkHandle>();
    roles.forEach((role, i) => { if (values[i] !== undefined) bindings.set(role, values[i]!); });
    if (bindings.size !== roles.length) return false;

    for (const constraint of readExactSequence(memory, parts[1]).values) {
      const t = readExactSequence(memory, constraint).values;
      if (t.length !== 3) return false;
      const target = bindings.get(t[0]!);
      const start = bindings.get(t[1]!);
      const end = bindings.get(t[2]!);
      if (target === undefined || start === undefined || end === undefined) return false;
      if (memory.find(start, end) !== target) return false;
    }
    return true;
  } catch { return false; }
}

interface Generated {
  readonly candidate: LinkHandle;
  readonly M: LinkHandle;
  readonly publication: LinkHandle;
  readonly values: readonly LinkHandle[];
}

/**
 * F5-style post-freeze producer. Request schema is still external authority.
 * The producer creates no candidate-specific admission evidence.
 */
function generate(
  memory: Memory,
  rule: LinkHandle,
  request: LinkHandle,
): Generated {
  const q = readExactSequence(memory, request).values;
  same(q.length, 6, "A24 request arity");
  for (const x of q) assert(x !== undefined, "A24 complete request");
  const [metaParent, e0, e1, e2, e3, e4] = q as readonly LinkHandle[];
  const executions = [e0, e1, e2, e3, e4] as const;

  const transitions: LinkHandle[] = [];
  for (let i = 0; i < executions.length - 1; i += 1) {
    transitions.push(memory.ensure(executions[i]!, executions[i + 1]!));
  }
  let tail = memory.root;
  const cells: LinkHandle[] = [];
  for (let i = transitions.length - 1; i >= 0; i -= 1) {
    tail = memory.ensure(transitions[i]!, tail);
    cells.unshift(tail);
  }
  const envelope = memory.ensureStartSelfClosed(cells[0]!);
  const meta = memory.ensure(metaParent!, envelope);
  const values = Object.freeze([
    memory.root, metaParent!, e0!, e1!, e2!, e3!, e4!,
    ...transitions, cells[3]!, cells[2]!, cells[1]!, cells[0]!, envelope, meta,
  ]);
  const candidate = materializeExactSequence(memory, values);
  assert(structurallyAdmitted(memory, rule, candidate),
    "A24 generated unknown producer authority passes frozen structural rule");
  const publication = memory.ensure(candidate, meta);
  return Object.freeze({ candidate, M: meta, publication, values });
}

function publishChecked(
  memory: Memory,
  rule: LinkHandle,
  candidate: LinkHandle,
  meta: LinkHandle,
): LinkHandle {
  assert(structurallyAdmitted(memory, rule, candidate),
    "A24 publication requires frozen structural admission");
  return memory.ensure(candidate, meta);
}

function exercise(noise: boolean): void {
  const b = buildBase(noise);
  const { memory } = b;
  const rule = defineRule(memory);
  const request = materializeExactSequence(memory, [
    b.metaParent, b.E0, b.E1, b.E2, b.E3, b.E4,
  ]);

  same(memory.find(b.E0, b.E1), undefined,
    "A24 producer transition absent at freeze");
  const before = memory.linkCount;
  const generated = generate(memory, rule, request);
  assert(memory.linkCount > before, "A24 producer authority generated after freeze");
  assert(memory.find(generated.candidate, generated.M) === generated.publication,
    "A24 explicit publication exists");

  let truth = memory.ensure(generated.M, b.E0);
  for (const expected of [b.E1, b.E2, b.E3, b.E4]) {
    const next = metaStep(memory, truth);
    assert(next !== undefined, "A24 unchanged A23 meta-step advances");
    same(memory.poles(next).end, expected, "A24 generated authority selects expected E");
    truth = next;
  }
  same(metaStep(memory, truth), undefined, "A24 generated authority terminal ZERO");

  same(readChain(memory, memory.poles(b.E1).end).length, 2, "A24 E1 fanout");
  same(readChain(memory, memory.poles(b.E2).end).length, 2, "A24 E2 fanout");
  same(readChain(memory, memory.poles(b.E3).end).length, 2, "A24 convergence occurrences");
  same(readChain(memory, memory.poles(b.E4).end).length, 0, "A24 E4 ZERO");

  const forged = [...generated.values];
  forged[T0] = memory.ensure(b.E1, b.E0);
  const forgedCandidate = materializeExactSequence(memory, forged);
  assert(!structurallyAdmitted(memory, rule, forgedCandidate),
    "A24 forged transition authority rejected");
  expectThrows(
    () => { publishChecked(memory, rule, forgedCandidate, generated.M); },
    "A24 forged producer authority cannot self-publish",
  );
}

function staticGuards(): void {
  const repoRoot = resolve(process.cwd(), "..");
  const own = readFileSync(
    join(repoRoot, "ts/test/research-v013-self-generated-meta-authority-a24.test.ts"),
    "utf8",
  );
  const prior = readFileSync(
    join(repoRoot, "ts/test/research-v013-meta-transition-authority-a23.test.ts"),
    "utf8",
  );
  const ownKernel = own.slice(
    own.indexOf("function metaStep("),
    own.indexOf("\nconst ROOT =", own.indexOf("function metaStep(")),
  );
  const priorKernel = prior.slice(
    prior.indexOf("function metaStep("),
    prior.indexOf("\nfunction frontierOccurrences(", prior.indexOf("function metaStep(")),
  );
  same(
    ownKernel.replace(/\s+/g, ""),
    priorKernel.replace(/\s+/g, ""),
    "A24 consumes generated authority through unchanged A23 metaStep",
  );

  const generator = own.slice(
    own.indexOf("function generate("),
    own.indexOf("\nfunction publishChecked(", own.indexOf("function generate(")),
  );
  for (const forbidden of ["E0", "E1", "E2", "E3", "E4", "switch(", "structurallyAdmitted(memory, rule, forged"]) {
    assert(!generator.includes(forbidden), `A24 generator excludes candidate-specific branch ${forbidden}`);
  }
}

function main(): void {
  exercise(false);
  exercise(true);
  staticGuards();
  console.log([
    "MTS v0.13 A24: SELF_GENERATED_META_PRODUCER_AUTHORITY=GREEN_SCOPED_RESEARCH",
    "PRODUCER_AUTHORITY_ABSENT_AT_FREEZE=YES GENERATED_AFTER_FREEZE=YES",
    "FROZEN_STRUCTURAL_ADMISSION=GREEN EXPLICIT_PUBLICATION=YES",
    "UNCHANGED_A23_META_STEP=YES REQUEST_SCHEMA_SOURCE_REMOVED=NO",
    "FIRST_FANOUT=2 SECOND_FANOUT=2 CONVERGENCE_OCCURRENCES=2 TERMINAL=ZERO",
    "FORGED_PRODUCER_AUTHORITY=REJECTED INVALID_SELF_PUBLICATION=REJECTED",
    "INDEPENDENT_MEMORIES=2 GLOBAL_E2=OPEN GLOBAL_E3=OPEN FULL_SELF_HOSTED=NOT_CLAIMED",
    "PRODUCTION_UNCHANGED",
  ].join(" "));
}

main();
