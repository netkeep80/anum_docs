import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  materializeExactSequence,
  readExactSequence,
} from "../src/exact-sequence.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type RootBasis,
} from "../src/memory.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.13 A36 detachment admission: ${message}`);
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}

interface AdmissionProgram {
  readonly seedTruth: LinkHandle;
  readonly rules: readonly LinkHandle[];
  readonly gates: readonly LinkHandle[];
  readonly queries: readonly LinkHandle[];
  readonly accept: LinkHandle;
}

/**
 * Compile anonymous pair-identity constraints into a detachment program.
 *
 * For every instantiated constraint
 *
 *   target = start -> end
 *
 * build:
 *
 *   pair  = start -> end
 *   gate  = START(target), therefore gate = gate -> target
 *   query = gate -> pair
 *
 * Canonical Link identity gives:
 *
 *   query = gate  <=>  pair = target
 *
 * The compiler does not inspect candidate topology to decide truth. It only
 * constructs the probes and a continuation chain. Truth/failure appears later
 * from ordinary contextual detachment.
 */
function compileAdmissionProgram(
  memory: Memory,
  rule: LinkHandle,
  candidate: LinkHandle,
  context: LinkHandle,
  accept: LinkHandle,
): AdmissionProgram {
  const parts = readExactSequence(memory, rule).values;
  assert(parts.length === 2, "rule has roles and constraints");
  const roleSequence = parts[0];
  const constraintSequence = parts[1];
  assert(roleSequence !== undefined && constraintSequence !== undefined, "rule parts exist");

  const roles = readExactSequence(memory, roleSequence).values;
  const values = readExactSequence(memory, candidate).values;
  same(values.length, roles.length, "candidate arity equals role arity");
  same(new Set(roles).size, roles.length, "roles are unique");

  const bindings = new Map<LinkHandle, LinkHandle>();
  roles.forEach((role, index) => {
    const value = values[index];
    assert(value !== undefined, "candidate binding exists");
    bindings.set(role, value);
  });

  const constraints = readExactSequence(memory, constraintSequence).values;
  assert(constraints.length > 0, "non-empty structural rule");

  const gates: LinkHandle[] = [];
  const queries: LinkHandle[] = [];

  for (const constraint of constraints) {
    const triple = readExactSequence(memory, constraint).values;
    same(triple.length, 3, "constraint arity");
    const target = bindings.get(triple[0]!);
    const start = bindings.get(triple[1]!);
    const end = bindings.get(triple[2]!);
    assert(target !== undefined && start !== undefined && end !== undefined, "constraint roles bound");

    const pair = memory.ensure(start, end);
    const gate = memory.ensureStartSelfClosed(target);
    const query = memory.ensure(gate, pair);
    gates.push(gate);
    queries.push(query);
  }

  const rules: LinkHandle[] = [];
  for (let index = 0; index < gates.length; index += 1) {
    const next = queries[index + 1] ?? accept;
    rules.push(memory.ensure(gates[index]!, next));
  }

  return Object.freeze({
    seedTruth: memory.ensure(context, queries[0]!),
    rules: Object.freeze(rules),
    gates: Object.freeze(gates),
    queries: Object.freeze(queries),
    accept,
  });
}

/**
 * Generic recursive contextual detachment.
 *
 * This kernel knows no rule/candidate/role/constraint semantics:
 *
 *   K -> A
 *   A -> B
 *   ------
 *   K -> B
 */
function executeDetachment(
  memory: Memory,
  context: LinkHandle,
  seedTruth: LinkHandle,
  selectedRules: readonly LinkHandle[],
): ReadonlySet<LinkHandle> {
  const truths = new Set<LinkHandle>([seedTruth]);
  const queue: LinkHandle[] = [seedTruth];

  while (queue.length > 0) {
    const truth = queue.shift();
    assert(truth !== undefined, "detachment queue");
    const tp = memory.poles(truth);
    same(tp.start, context, "truth remains contextual");

    for (const rule of selectedRules) {
      const rp = memory.poles(rule);
      if (rp.start !== tp.end) continue;
      const derived = memory.ensure(context, rp.end);
      if (truths.has(derived)) continue;
      truths.add(derived);
      queue.push(derived);
    }
  }

  return truths;
}

function hasTruthEnd(
  memory: Memory,
  context: LinkHandle,
  truths: ReadonlySet<LinkHandle>,
  expectedEnd: LinkHandle,
): boolean {
  for (const truth of truths) {
    const p = memory.poles(truth);
    same(p.start, context, "observed truth context");
    if (p.end === expectedEnd) return true;
  }
  return false;
}

function anonymousRoles(memory: Memory): readonly LinkHandle[] {
  const basis = ensureRootBasis(memory);
  const roles: LinkHandle[] = [];
  let cursor = memory.ensure(basis.O, basis.U);
  for (let index = 0; index < 8; index += 1) {
    cursor = memory.ensure(cursor, index % 2 === 0 ? basis.L : basis.C);
    roles.push(cursor);
  }
  same(new Set(roles).size, 8, "eight anonymous roles");
  return Object.freeze(roles);
}

function defineRule(memory: Memory): LinkHandle {
  const roles = anonymousRoles(memory);
  const constraints = Object.freeze([
    materializeExactSequence(memory, [roles[3]!, roles[1]!, roles[2]!]),
    materializeExactSequence(memory, [roles[6]!, roles[3]!, roles[4]!]),
    materializeExactSequence(memory, [roles[7]!, roles[3]!, roles[5]!]),
  ]);
  return materializeExactSequence(memory, [
    materializeExactSequence(memory, roles),
    materializeExactSequence(memory, constraints),
  ]);
}

interface CandidateFixture {
  readonly values: readonly LinkHandle[];
  readonly candidate: LinkHandle;
}
function candidateFixture(memory: Memory, basis: RootBasis): CandidateFixture {
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
    candidate: materializeExactSequence(memory, values),
  });
}

function withValues(memory: Memory, values: readonly LinkHandle[]): CandidateFixture {
  const frozen = Object.freeze([...values]);
  return Object.freeze({
    values: frozen,
    candidate: materializeExactSequence(memory, frozen),
  });
}

function forgeConstraint(
  memory: Memory,
  valid: CandidateFixture,
  index: 0 | 1 | 2,
): CandidateFixture {
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

  return withValues(memory, v);
}

function freshContext(memory: Memory, basis: RootBasis, seed: LinkHandle): LinkHandle {
  return memory.ensure(memory.ensure(seed, basis.O), basis.L);
}

function runCase(
  memory: Memory,
  rule: LinkHandle,
  candidate: LinkHandle,
  context: LinkHandle,
  accept: LinkHandle,
): Readonly<{ program: AdmissionProgram; truths: ReadonlySet<LinkHandle> }> {
  const program = compileAdmissionProgram(memory, rule, candidate, context, accept);
  const truths = executeDetachment(memory, context, program.seedTruth, program.rules);
  return Object.freeze({ program, truths });
}

function exercise(memory: Memory, withNoise: boolean): void {
  const basis = ensureRootBasis(memory);
  if (withNoise) {
    const n0 = memory.ensure(basis.C, basis.U);
    const n1 = memory.ensure(n0, basis.L);
    memory.ensure(basis.O, n1);
  }

  const rule = defineRule(memory);
  const valid = candidateFixture(memory, basis);

  const validContext = freshContext(memory, basis, valid.candidate);
  const validAccept = memory.ensure(validContext, basis.U);
  const good = runCase(memory, rule, valid.candidate, validContext, validAccept);

  same(good.program.gates.length, 3, "three structural gates");
  for (let index = 0; index < 3; index += 1) {
    same(good.program.queries[index], good.program.gates[index],
      `valid constraint ${index} canonicalizes query to gate`);
  }
  assert(
    hasTruthEnd(memory, validContext, good.truths, validAccept),
    "all valid constraints recursively detach to ACCEPT",
  );

  // The canonical probe may need to materialize start->end as execution scratch.
  // This is deliberately NOT claimed to preserve the historical read-only
  // admission property. The new Link still cannot authorize ACCEPT when the
  // bound target is different.
  {
    const v = [...valid.values];
    const freshStart = memory.ensure(valid.candidate, basis.O);
    const freshEnd = memory.ensure(basis.C, valid.candidate);
    assert(memory.find(freshStart, freshEnd) === undefined,
      "A36 scratch pair absent before structural probe");
    v[1] = freshStart;
    v[2] = freshEnd;
    const forged = withValues(memory, v);
    const context = freshContext(memory, basis, forged.candidate);
    const accept = memory.ensure(context, memory.ensure(basis.U, forged.candidate));
    const before = memory.linkCount;
    const bad = runCase(memory, rule, forged.candidate, context, accept);
    assert(memory.linkCount > before, "A36 structural probe may materialize scratch Links");
    assert(!hasTruthEnd(memory, context, bad.truths, accept),
      "A36 materialized scratch pair does not self-authorize forged target");
  }

  for (const failedIndex of [0, 1, 2] as const) {
    const forged = forgeConstraint(memory, valid, failedIndex);
    const context = freshContext(memory, basis, forged.candidate);
    const accept = memory.ensure(context, memory.ensure(basis.C, forged.candidate));
    const bad = runCase(memory, rule, forged.candidate, context, accept);

    assert(
      bad.program.queries[failedIndex] !== bad.program.gates[failedIndex],
      `forged constraint ${failedIndex} does not canonicalize`,
    );
    assert(
      !hasTruthEnd(memory, context, bad.truths, accept),
      `forged constraint ${failedIndex} terminates before ACCEPT`,
    );

    // Ambient adjacency is not selected semantic authority.
    memory.ensure(bad.program.queries[failedIndex]!, accept);
    const still = executeDetachment(memory, context, bad.program.seedTruth, bad.program.rules);
    assert(
      !hasTruthEnd(memory, context, still, accept),
      `ambient forged shortcut ${failedIndex} remains inert`,
    );
  }
}

function publicationExistenceBoundary(): void {
  // Canonical construction cannot be used to ask whether publication evidence
  // existed before execution: ensure(Candidate,M) would create that very
  // evidence. Therefore A36 does NOT source-remove A35 sourcePublishable's
  // prior-publication/existence authority.
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  const candidate = memory.ensure(basis.O, basis.U);
  const meta = memory.ensure(basis.C, basis.L);
  same(memory.find(candidate, meta), undefined,
    "A36 publication evidence absent before construction");
  const before = memory.linkCount;
  const fabricated = memory.ensure(candidate, meta);
  assert(memory.linkCount > before,
    "A36 ensure(candidate,M) would create publication rather than verify prior existence");
  same(memory.find(candidate, meta), fabricated,
    "A36 constructed publication now exists");
}

function staticGuards(): void {
  const root = resolve(process.cwd(), "..");
  const own = readFileSync(
    join(root, "ts/test/research-v013-detachment-structural-admission-a36.test.ts"),
    "utf8",
  );

  const compiler = own.slice(
    own.indexOf("function compileAdmissionProgram("),
    own.indexOf("\n/**\n * Generic recursive contextual detachment.", own.indexOf("function compileAdmissionProgram(")),
  );
  for (const forbidden of [
    ".find(", ".outgoing(", ".incoming(", "allLinks(", "switch(",
    "structurallyAdmitted(", "admitted(", "memory.poles(",
  ]) {
    assert(!compiler.includes(forbidden), `A36 compiler excludes semantic truth test ${forbidden}`);
  }

  const kernel = own.slice(
    own.indexOf("function executeDetachment("),
    own.indexOf("\nfunction hasTruthEnd(", own.indexOf("function executeDetachment(")),
  );
  for (const forbidden of [
    "readExactSequence", "ensureStartSelfClosed", "candidate", "constraint",
    "role", "admitted", ".find(", ".outgoing(", ".incoming(", "switch(", "basis.",
  ]) {
    assert(!kernel.includes(forbidden), `A36 detachment kernel excludes domain primitive ${forbidden}`);
  }

  const prior = readFileSync(
    join(root, "ts/test/research-v013-admitted-source-catalog-a34.test.ts"),
    "utf8",
  );
  const oldAdmission = prior.slice(
    prior.indexOf("function admitted("),
    prior.indexOf("\ninterface Template", prior.indexOf("function admitted(")),
  );
  assert(oldAdmission.includes("memory.find(s,e)!==t"),
    "A36 explicitly targets A34 host pair-identity truth test");

  const a16 = readFileSync(
    join(root, "ts/test/research-v013-contextual-truth-dynamic-duality-a16.test.ts"),
    "utf8",
  );
  assert(
    a16.includes("K->A_PLUS_A_TO_B_GIVES_K_TO_B") ||
      a16.includes("K_TO_A_PLUS_A_TO_B_GIVES_K_TO_B"),
    "A36 keeps A16 detachment evidence in scope",
  );
}

function main(): void {
  exercise(new Memory(), false);
  exercise(new Memory(), true);
  publicationExistenceBoundary();
  staticGuards();

  console.log([
    "MTS v0.13 A36: DETACHMENT_STRUCTURAL_ADMISSION=GREEN_SCOPED_RESEARCH",
    "PAIR_IDENTITY_TRUTH_TEST=START_SELF_CLOSED_CANONICALIZATION",
    "HOST_FIND_EQUALITY_CHECK=0",
    "ADMISSION_RESULT=RECURSIVE_CONTEXTUAL_DETACHMENT",
    "STRUCTURAL_PROBE_MAY_MATERIALIZE_SCRATCH=YES",
    "READ_ONLY_ADMISSION_PRESERVED=NO",
    "PUBLICATION_EXISTENCE_SOURCE_REMOVED=NO",
    "VALID_CONSTRAINTS=3",
    "FORGED_CONSTRAINT_0=ZERO FORGED_CONSTRAINT_1=ZERO FORGED_CONSTRAINT_2=ZERO",
    "AMBIENT_SHORTCUT_AUTHORITY=IGNORED",
    "DETACHMENT_KERNEL_RULE_SEMANTICS=0",
    "HOST_RULE_CANDIDATE_DECODING=RESIDUAL",
    "HOST_PROGRAM_CONSTRUCTION=RESIDUAL",
    "A35_SOURCE_PUBLISHABLE_EXISTENCE_CHECK=RESIDUAL",
    "ROOT_ASPECT_CONSTRUCTION=PHYSICAL_EXECUTOR_RESIDUAL",
    "INDEPENDENT_MEMORIES=2 GLOBAL_E2=OPEN GLOBAL_E3=OPEN",
    "FULL_SELF_HOSTED=NOT_CLAIMED PRODUCTION_UNCHANGED",
  ].join(" "));
}

main();
