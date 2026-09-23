import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { materializeExactSequence, readExactSequence } from "../src/exact-sequence.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type RootBasis,
} from "../src/memory.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.13 A37 Link-carried admission program: ${message}`);
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
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

/**
 * Exact A21 single-root executor.
 *
 * A37 deliberately does not add any admission-specific branch here.
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

interface Program {
  readonly E0: LinkHandle;
  readonly K: LinkHandle;
  readonly accept: LinkHandle;
  readonly gates: readonly LinkHandle[];
  readonly queries: readonly LinkHandle[];
}

/**
 * Producer-side residual.
 *
 * It still decodes Rule/Candidate and compiles A36 canonical gates. The A37
 * claim is narrower: this compilation no longer occurs in the runtime step.
 * Its result is carried entirely by the ordinary A19-A21 K/Frontier topology.
 */
function compileProgram(
  memory: Memory,
  rule: LinkHandle,
  candidate: LinkHandle,
  parent: LinkHandle,
  accept: LinkHandle,
): Program {
  const parts = readExactSequence(memory, rule).values;
  assert(parts.length === 2 && parts[0] !== undefined && parts[1] !== undefined,
    "A37 rule has role and constraint sequences");
  const roles = readExactSequence(memory, parts[0]).values;
  const values = readExactSequence(memory, candidate).values;
  same(values.length, roles.length, "A37 candidate arity");
  same(new Set(roles).size, roles.length, "A37 roles unique");

  const bindings = new Map<LinkHandle, LinkHandle>();
  roles.forEach((role, index) => {
    const value = values[index];
    assert(value !== undefined, "A37 role binding value");
    bindings.set(role, value);
  });

  const gates: LinkHandle[] = [];
  const queries: LinkHandle[] = [];
  for (const constraint of readExactSequence(memory, parts[1]).values) {
    const triple = readExactSequence(memory, constraint).values;
    same(triple.length, 3, "A37 constraint arity");
    const target = bindings.get(triple[0]!);
    const start = bindings.get(triple[1]!);
    const end = bindings.get(triple[2]!);
    assert(target !== undefined && start !== undefined && end !== undefined,
      "A37 constraint roles bound");

    const pair = memory.ensure(start, end);
    const gate = memory.ensureStartSelfClosed(target);
    gates.push(gate);
    queries.push(memory.ensure(gate, pair));
  }
  assert(gates.length > 0, "A37 non-empty admission program");

  const transitions = gates.map((gate, index) =>
    memory.ensure(gate, queries[index + 1] ?? accept)
  );
  const authorityEnvelope = freezeAuthority(memory, transitions);
  const K = memory.ensure(parent, authorityEnvelope);
  const seedTruth = memory.ensure(K, queries[0]!);
  const seedOccurrence = memory.ensure(memory.root, seedTruth);
  const frontier = freezeFrontier(memory, [seedOccurrence]);
  const E0 = memory.ensure(K, frontier);

  return Object.freeze({
    E0,
    K,
    accept,
    gates: Object.freeze(gates),
    queries: Object.freeze(queries),
  });
}

function frontierTruthEnds(
  memory: Memory,
  executionRoot: LinkHandle,
): readonly LinkHandle[] {
  const execution = memory.poles(executionRoot);
  const context = execution.start;
  const ends: LinkHandle[] = [];
  for (const occurrence of readChain(memory, execution.end, "frontier")) {
    const truth = memory.poles(memory.poles(occurrence).end);
    same(truth.start, context, "A37 frontier truth context");
    ends.push(truth.end);
  }
  return Object.freeze(ends);
}

function anonymousRoles(memory: Memory): readonly LinkHandle[] {
  const basis = ensureRootBasis(memory);
  const roles: LinkHandle[] = [];
  let cursor = memory.ensure(basis.O, basis.U);
  for (let index = 0; index < 8; index += 1) {
    cursor = memory.ensure(cursor, index % 2 === 0 ? basis.L : basis.C);
    roles.push(cursor);
  }
  return Object.freeze(roles);
}

function defineRule(memory: Memory): LinkHandle {
  const r = anonymousRoles(memory);
  const constraints = [
    materializeExactSequence(memory, [r[3]!, r[1]!, r[2]!]),
    materializeExactSequence(memory, [r[6]!, r[3]!, r[4]!]),
    materializeExactSequence(memory, [r[7]!, r[3]!, r[5]!]),
  ];
  return materializeExactSequence(memory, [
    materializeExactSequence(memory, r),
    materializeExactSequence(memory, constraints),
  ]);
}

interface Candidate {
  readonly values: readonly LinkHandle[];
  readonly handle: LinkHandle;
}

function candidate(memory: Memory, basis: RootBasis): Candidate {
  let cursor = memory.ensure(basis.U, basis.L);
  const fresh = (): LinkHandle => {
    cursor = memory.ensure(cursor, basis.C);
    return cursor;
  };

  const name = fresh();
  const fnStart = fresh();
  const fnEnd = fresh();
  const fn = memory.ensure(fnStart, fnEnd);
  const argument = fresh();
  const application = memory.ensure(fn, argument);
  const result1 = fresh();
  const result2 = fresh();
  const continuation1 = memory.ensure(application, result1);
  const continuation2 = memory.ensure(application, result2);
  const values = Object.freeze([
    name, fn, argument, application, result1, result2, continuation1, continuation2,
  ]);
  return Object.freeze({
    values,
    handle: materializeExactSequence(memory, values),
  });
}

function replaceValues(memory: Memory, values: readonly LinkHandle[]): Candidate {
  const frozen = Object.freeze([...values]);
  return Object.freeze({
    values: frozen,
    handle: materializeExactSequence(memory, frozen),
  });
}

function forge(
  memory: Memory,
  valid: Candidate,
  index: 0 | 1 | 2,
): Candidate {
  const v = [...valid.values];
  if (index === 0) {
    const wrongApplication = memory.ensure(v[2]!, v[1]!);
    v[3] = wrongApplication;
    v[6] = memory.ensure(wrongApplication, v[4]!);
    v[7] = memory.ensure(wrongApplication, v[5]!);
  } else if (index === 1) {
    v[6] = memory.ensure(v[4]!, v[3]!);
  } else {
    v[7] = memory.ensure(v[5]!, v[3]!);
  }
  return replaceValues(memory, v);
}

function runToDepth(
  memory: Memory,
  E0: LinkHandle,
  depth: number,
): readonly LinkHandle[] {
  const ends: LinkHandle[] = [];
  let current = E0;
  for (let i = 0; i < depth; i += 1) {
    current = step(memory, current, "forward");
    ends.push(...frontierTruthEnds(memory, current));
  }
  return Object.freeze(ends);
}

function exercise(memory: Memory, withNoise: boolean): void {
  const basis = ensureRootBasis(memory);
  if (withNoise) {
    const n0 = memory.ensure(basis.C, basis.U);
    memory.ensure(n0, basis.L);
  }

  const rule = defineRule(memory);
  const valid = candidate(memory, basis);
  const parent = memory.ensure(valid.handle, basis.O);
  const accept = memory.ensure(basis.L, valid.handle);
  const good = compileProgram(memory, rule, valid.handle, parent, accept);

  // Runtime receives only E0. Rule, Candidate, bindings and compiled arrays are
  // not parameters of the unchanged A21 step.
  let current = good.E0;
  for (let index = 1; index < good.queries.length; index += 1) {
    current = step(memory, current, "forward");
    const ends = frontierTruthEnds(memory, current);
    same(ends.length, 1, `A37 valid step ${index} singleton`);
    same(ends[0], good.queries[index], `A37 valid step ${index} query`);
  }
  current = step(memory, current, "forward");
  same(frontierTruthEnds(memory, current)[0], accept, "A37 valid program reaches ACCEPT");

  for (const failedIndex of [0, 1, 2] as const) {
    const badCandidate = forge(memory, valid, failedIndex);
    const badParent = memory.ensure(badCandidate.handle, basis.C);
    const badAccept = memory.ensure(basis.U, badCandidate.handle);
    const bad = compileProgram(memory, rule, badCandidate.handle, badParent, badAccept);

    const observed = runToDepth(memory, bad.E0, 4);
    assert(!observed.includes(badAccept),
      `A37 forged constraint ${failedIndex} never reaches ACCEPT`);

    // A physical shortcut from the failed query is inert because it is not in
    // K's selected authority envelope.
    memory.ensure(bad.queries[failedIndex]!, badAccept);
    const again = runToDepth(memory, bad.E0, 4);
    assert(!again.includes(badAccept),
      `A37 ambient shortcut ${failedIndex} remains inert`);
  }
}

function normalize(source: string): string {
  return source.replace(/\s+/g, " ").trim();
}

function sliceFunction(source: string, name: string, next: string): string {
  const start = source.indexOf(`function ${name}(`);
  const end = source.indexOf(`\nfunction ${next}(`, start);
  assert(start >= 0 && end > start, `A37 source slice ${name}`);
  return source.slice(start, end);
}

function staticGuards(): void {
  const root = resolve(process.cwd(), "..");
  const own = readFileSync(
    join(root, "ts/test/research-v013-link-carried-admission-program-a37.test.ts"),
    "utf8",
  );
  const a21 = readFileSync(
    join(root, "ts/test/research-v013-single-execution-root-a21.test.ts"),
    "utf8",
  );

  const ownStepStart = own.indexOf("function step(");
  const ownStepEnd = own.indexOf("\ninterface Program", ownStepStart);
  const a21StepStart = a21.indexOf("function step(");
  const a21StepEnd = a21.indexOf("\nfunction executionContext(", a21StepStart);
  assert(ownStepStart >= 0 && ownStepEnd > ownStepStart, "A37 own step source slice");
  assert(a21StepStart >= 0 && a21StepEnd > a21StepStart, "A37 A21 step source slice");
  const runtime = own.slice(ownStepStart, ownStepEnd);
  same(
    normalize(runtime),
    normalize(a21.slice(a21StepStart, a21StepEnd)),
    "A37 runtime step remains exact normalized A21 implementation",
  );

  for (const forbidden of [
    "candidate", "rule", "binding", "constraint", "readExactSequence",
    "ensureStartSelfClosed(target)", ".find(", "switch(",
  ]) {
    assert(!runtime.includes(forbidden), `A37 runtime excludes ${forbidden}`);
  }

  const compiler = sliceFunction(own, "compileProgram", "frontierTruthEnds");
  assert(compiler.includes("readExactSequence"), "A37 host producer residual remains visible");
  assert(compiler.includes("ensureStartSelfClosed(target)"), "A37 producer uses A36 canonical gate");

  const a36 = readFileSync(
    join(root, "ts/test/research-v013-detachment-structural-admission-a36.test.ts"),
    "utf8",
  );
  assert(a36.includes("PAIR_IDENTITY_TRUTH_TEST=START_SELF_CLOSED_CANONICALIZATION"),
    "A37 inherits A36 canonical pair-identity evidence");
}

function main(): void {
  exercise(new Memory(), false);
  exercise(new Memory(), true);
  staticGuards();

  console.log([
    "MTS v0.13 A37: LINK_CARRIED_ADMISSION_PROGRAM=GREEN_SCOPED_RESEARCH",
    "RUNTIME_EXECUTION_ROOT=E_K_FRONTIER",
    "RUNTIME_STEP=A21_SOURCE_IDENTICAL",
    "HOST_RUNTIME_RULE_ARGUMENT=0 HOST_RUNTIME_CANDIDATE_ARGUMENT=0",
    "HOST_RUNTIME_BINDING_COMPILER=0 HOST_RUNTIME_ADMISSION_BRANCH=0",
    "VALID_CONSTRAINTS=3 VALID_RESULT=ACCEPT",
    "FORGED_CONSTRAINTS=ZERO AMBIENT_SHORTCUT=INERT",
    "HOST_PROGRAM_PRODUCER=RESIDUAL",
    "HOST_RULE_CANDIDATE_DECODING=PRODUCER_RESIDUAL",
    "A35_PUBLICATION_EXISTENCE=RESIDUAL",
    "CURRENT_EXECUTION_ROOT=EXECUTOR_STATE_BOUNDARY_SCOPED",
    "INDEPENDENT_MEMORIES=2 GLOBAL_E2=OPEN GLOBAL_E3=OPEN",
    "FULL_SELF_HOSTED=NOT_CLAIMED PRODUCTION_UNCHANGED",
  ].join(" "));
}

main();
