import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type RootBasis,
} from "../src/memory.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.13 A54 raw pair constructor: ${message}`);
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}
function freezeChain(memory: Memory, values: readonly LinkHandle[]): LinkHandle {
  let body = memory.root;
  for (let i = values.length - 1; i >= 0; i -= 1) body = memory.ensure(values[i]!, body);
  return memory.ensureStartSelfClosed(body);
}
function readChain(memory: Memory, envelope: LinkHandle, kind: string): readonly LinkHandle[] {
  const e = memory.poles(envelope);
  assert(e.start === envelope && e.end !== envelope, `A21 ${kind} envelope`);
  const out: LinkHandle[] = [];
  const seen = new Set<LinkHandle>();
  let cursor = e.end;
  while (cursor !== memory.root) {
    assert(!seen.has(cursor), `A21 ${kind} cycle`);
    seen.add(cursor);
    const p = memory.poles(cursor);
    out.push(p.start);
    cursor = p.end;
  }
  return Object.freeze(out);
}

/** Exact A21 single-root executor, source-identical to A53. */
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
function frontierTruthEnds(memory: Memory, E: LinkHandle): readonly LinkHandle[] {
  const ep = memory.poles(E);
  const out: LinkHandle[] = [];
  for (const occurrence of readChain(memory, ep.end, "frontier")) {
    const truth = memory.poles(memory.poles(occurrence).end);
    same(truth.start, ep.start, "A54 frontier context");
    out.push(truth.end);
  }
  return Object.freeze(out);
}

interface Schema {
  readonly startRole: LinkHandle;
  readonly endRole: LinkHandle;
  readonly targetTemplate: LinkHandle;
}
function defineSchema(memory: Memory, basis: RootBasis): Schema {
  const marker = memory.ensure(basis.U, basis.U);
  const startRole = memory.ensure(memory.ensure(basis.O, marker), marker);
  const endRole = memory.ensure(startRole, marker);
  assert(startRole !== endRole, "A54 roles distinct");
  return Object.freeze({
    startRole,
    endRole,
    targetTemplate: memory.ensure(startRole, endRole),
  });
}
interface ApplicationInput {
  readonly environment: LinkHandle;
  readonly application: LinkHandle;
  readonly selection: LinkHandle;
}
function selectedInput(
  memory: Memory,
  context: LinkHandle,
  schema: Schema,
  startValue: LinkHandle,
  endValue: LinkHandle,
): ApplicationInput {
  const leftBinding = memory.ensure(schema.startRole, startValue);
  const rightBinding = memory.ensure(schema.endRole, endValue);
  const environment = memory.ensure(leftBinding, rightBinding);
  const application = memory.ensure(schema.targetTemplate, environment);
  const proof = memory.ensure(environment, application);
  const truth = memory.ensure(context, application);
  return Object.freeze({
    environment,
    application,
    selection: memory.ensure(proof, truth),
  });
}

interface EqualityCheck {
  readonly gate: LinkHandle;
  readonly query: LinkHandle;
}
function equalityCheck(
  memory: Memory,
  stage: LinkHandle,
  expected: LinkHandle,
  actual: LinkHandle,
): EqualityCheck {
  const expectedScoped = memory.ensure(stage, expected);
  const actualScoped = memory.ensure(stage, actual);
  const gate = memory.ensureStartSelfClosed(expectedScoped);
  return Object.freeze({ gate, query: memory.ensure(gate, actualScoped) });
}
interface ApplicationCandidate {
  readonly parentContext: LinkHandle;
  readonly startValue: LinkHandle;
  readonly endValue: LinkHandle;
  readonly checks: readonly EqualityCheck[];
}
function deriveCandidate(
  memory: Memory,
  schema: Schema,
  selection: LinkHandle,
): ApplicationCandidate {
  const selected = memory.poles(selection);
  const proof = memory.poles(selected.start);
  const truth = memory.poles(selected.end);
  const environment = proof.start;
  const proofApplication = proof.end;
  const parentContext = truth.start;
  const truthApplication = truth.end;

  const env = memory.poles(environment);
  const leftBinding = memory.poles(env.start);
  const rightBinding = memory.poles(env.end);
  const startValue = leftBinding.end;
  const endValue = rightBinding.end;
  const expectedApplication = memory.ensure(schema.targetTemplate, environment);

  let stage = memory.ensure(selection, memory.root);
  const check = (expected: LinkHandle, actual: LinkHandle): EqualityCheck => {
    stage = memory.ensure(stage, memory.ensure(expected, actual));
    return equalityCheck(memory, stage, expected, actual);
  };
  return Object.freeze({
    parentContext,
    startValue,
    endValue,
    checks: Object.freeze([
      check(proofApplication, truthApplication),
      check(expectedApplication, proofApplication),
      check(schema.startRole, leftBinding.start),
      check(schema.endRole, rightBinding.start),
    ]),
  });
}

interface PairConstructor {
  construct(start: LinkHandle, end: LinkHandle): LinkHandle;
  calls(): number;
}
function directConstructor(memory: Memory): PairConstructor {
  let n = 0;
  return Object.freeze({
    construct(start: LinkHandle, end: LinkHandle): LinkHandle {
      n += 1;
      return memory.ensure(start, end);
    },
    calls: () => n,
  });
}
function idempotentConstructor(memory: Memory): PairConstructor {
  let n = 0;
  return Object.freeze({
    construct(start: LinkHandle, end: LinkHandle): LinkHandle {
      n += 1;
      const first = memory.ensure(start, end);
      const second = memory.ensure(start, end);
      same(second, first, "A54 repeated physical construction canonical");
      return second;
    },
    calls: () => n,
  });
}
function noisyConstructor(memory: Memory): PairConstructor {
  let n = 0;
  return Object.freeze({
    construct(start: LinkHandle, end: LinkHandle): LinkHandle {
      n += 1;
      const leftNoise = memory.ensure(start, start);
      const rightNoise = memory.ensure(end, end);
      memory.ensure(leftNoise, rightNoise);
      return memory.ensure(start, end);
    },
    calls: () => n,
  });
}
function reversedConstructor(memory: Memory): PairConstructor {
  let n = 0;
  return Object.freeze({
    construct(start: LinkHandle, end: LinkHandle): LinkHandle {
      n += 1;
      return memory.ensure(end, start);
    },
    calls: () => n,
  });
}
function rootConstructor(memory: Memory): PairConstructor {
  let n = 0;
  return Object.freeze({
    construct(_start: LinkHandle, _end: LinkHandle): LinkHandle {
      n += 1;
      return memory.root;
    },
    calls: () => n,
  });
}

/** External substrate audit only: no Template/role/context semantics. */
function pairContractHolds(
  memory: Memory,
  constructor: PairConstructor,
  start: LinkHandle,
  end: LinkHandle,
): boolean {
  const result = constructor.construct(start, end);
  const p = memory.poles(result);
  return p.start === start && p.end === end && memory.find(start, end) === result;
}

interface ValidationProgram {
  readonly E0: LinkHandle;
  readonly depth: number;
}
function compileValidation(
  memory: Memory,
  candidate: ApplicationCandidate,
  physicalResult: LinkHandle,
): ValidationProgram {
  const transitions = candidate.checks.map((current, index) =>
    memory.ensure(current.gate, candidate.checks[index + 1]?.query ?? physicalResult)
  );
  const authority = freezeChain(memory, transitions);
  const K = memory.ensure(candidate.parentContext, authority);
  const seed = memory.ensure(K, candidate.checks[0]!.query);
  return Object.freeze({
    E0: memory.ensure(K, freezeChain(memory, [memory.ensure(memory.root, seed)])),
    depth: candidate.checks.length,
  });
}
function runProgram(memory: Memory, program: ValidationProgram): readonly LinkHandle[] {
  let current = program.E0;
  for (let i = 0; i < program.depth; i += 1) current = step(memory, current, "forward");
  return frontierTruthEnds(memory, current);
}
function executeSelection(
  memory: Memory,
  schema: Schema,
  selection: LinkHandle,
  constructor: PairConstructor,
): readonly LinkHandle[] {
  const candidate = deriveCandidate(memory, schema, selection);
  const physical = constructor.construct(candidate.startValue, candidate.endValue);
  return runProgram(memory, compileValidation(memory, candidate, physical));
}

function freshValues(memory: Memory, basis: RootBasis): readonly [LinkHandle, LinkHandle] {
  const start = memory.ensure(memory.ensure(basis.C, basis.U), basis.L);
  const end = memory.ensure(memory.ensure(basis.O, basis.C), basis.U);
  return Object.freeze([start, end] as const);
}
type ConstructorFactory = (memory: Memory) => PairConstructor;

function exercise(
  memory: Memory,
  factory: ConstructorFactory,
  withNoise: boolean,
): string {
  const basis = ensureRootBasis(memory);
  if (withNoise) memory.ensure(memory.ensure(basis.U, basis.C), basis.O);
  const schema = defineSchema(memory, basis);
  const constructor = factory(memory);

  // Audit the constructor contract on unrelated operands, not the semantic case.
  const auditStart = memory.ensure(basis.R, memory.ensure(basis.C, basis.L));
  const auditEnd = memory.ensure(basis.O, memory.ensure(basis.U, basis.C));
  assert(pairContractHolds(memory, constructor, auditStart, auditEnd), "A54 compliant E1 pair contract");

  const [startValue, endValue] = freshValues(memory, basis);
  const parent = memory.ensure(basis.O, basis.U);
  const selected = selectedInput(memory, parent, schema, startValue, endValue);
  assert(memory.find(startValue, endValue) === undefined, "A54 result absent before selected construction");
  const valid = executeSelection(memory, schema, selected.selection, constructor);
  const result = memory.find(startValue, endValue);
  assert(result !== undefined, "A54 compliant constructor materializes exact pair");
  same(valid.length, 1, "A54 valid application singleton");
  same(valid[0], result, "A54 valid application exact pair");

  // Physical ambient existence carries no execution authority.
  const ambientStart = memory.ensure(startValue, basis.C);
  const ambientEnd = memory.ensure(endValue, basis.C);
  selectedInput(memory, parent, schema, ambientStart, ambientEnd);
  const ambientPair = memory.ensure(ambientStart, ambientEnd);
  assert(ambientPair !== result, "A54 ambient physical pair distinct");
  assert(!valid.includes(ambientPair), "A54 ambient physical pair absent from contextual result");

  // Invalid selected carrier may create scratch, but semantic gates still yield ZERO.
  const left = memory.ensure(schema.startRole, startValue);
  const right = memory.ensure(schema.endRole, endValue);
  const swappedEnv = memory.ensure(right, left);
  const swappedApp = memory.ensure(schema.targetTemplate, swappedEnv);
  const swappedSelection = memory.ensure(
    memory.ensure(swappedEnv, swappedApp),
    memory.ensure(parent, swappedApp),
  );
  const swapped = executeSelection(memory, schema, swappedSelection, constructor);
  assert(memory.find(endValue, startValue) !== undefined, "A54 invalid reverse scratch may physically exist");
  same(swapped.length, 0, "A54 swapped semantic ZERO");

  const foreignTemplate = memory.ensure(schema.targetTemplate, basis.U);
  const foreignApp = memory.ensure(foreignTemplate, selected.environment);
  const foreign = executeSelection(
    memory,
    schema,
    memory.ensure(
      memory.ensure(selected.environment, foreignApp),
      memory.ensure(parent, foreignApp),
    ),
    constructor,
  );
  same(foreign.length, 0, "A54 foreign template ZERO");

  const mismatchApp = memory.ensure(foreignTemplate, memory.ensure(selected.environment, basis.C));
  const mismatch = executeSelection(
    memory,
    schema,
    memory.ensure(
      memory.ensure(selected.environment, selected.application),
      memory.ensure(parent, mismatchApp),
    ),
    constructor,
  );
  same(mismatch.length, 0, "A54 proof truth mismatch ZERO");

  return [
    valid.length,
    swapped.length,
    foreign.length,
    mismatch.length,
    memory.poles(result).start === startValue ? 1 : 0,
    memory.poles(result).end === endValue ? 1 : 0,
  ].join(":");
}

function nonconformingControls(): void {
  for (const factory of [reversedConstructor, rootConstructor] as const) {
    const memory = new Memory();
    const basis = ensureRootBasis(memory);
    const [start, end] = freshValues(memory, basis);
    assert(!pairContractHolds(memory, factory(memory), start, end),
      "A54 nonconforming constructor rejected by generic Link-pair contract");
  }
}

function staticGuards(): void {
  const root = resolve(process.cwd(), "..");
  const own = readFileSync(join(root, "ts/test/research-v013-raw-pair-constructor-a54.test.ts"), "utf8");
  const a53 = readFileSync(join(root, "ts/test/research-v013-proof-gated-application-a53.test.ts"), "utf8");

  const interfaceSlice = own.slice(
    own.indexOf("interface PairConstructor"),
    own.indexOf("/** External substrate audit", own.indexOf("interface PairConstructor")),
  ).toLowerCase();
  for (const forbidden of ["schema", "template", "role", "context", "truth", "application", "proof", "candidate"])
    assert(!interfaceSlice.includes(forbidden), `A54 constructor capability excludes semantic term ${forbidden}`);

  const execute = own.slice(
    own.indexOf("function executeSelection("),
    own.indexOf("\nfunction freshValues(", own.indexOf("function executeSelection(")),
  );
  assert(execute.includes("constructor.construct(candidate.startValue, candidate.endValue)"),
    "A54 semantic path crosses only opaque binary constructor interface");
  assert(!execute.includes("memory.ensure(candidate.startValue, candidate.endValue)"),
    "A54 semantic path contains no raw pair creation bypass");

  const x = own.slice(own.indexOf("function step("), own.indexOf("\nfunction frontierTruthEnds(", own.indexOf("function step(")));
  const y = a53.slice(a53.indexOf("function step("), a53.indexOf("\nfunction frontierTruthEnds(", a53.indexOf("function step(")));
  same(x.replace(/\s+/g, ""), y.replace(/\s+/g, ""), "A54 runtime source-identical A53/A21");
}

function main(): void {
  const factories: readonly ConstructorFactory[] = [
    directConstructor,
    idempotentConstructor,
    noisyConstructor,
  ];
  let reference: string | undefined;
  for (const factory of factories) {
    for (const withNoise of [false, true]) {
      const signature = exercise(new Memory(), factory, withNoise);
      reference ??= signature;
      same(signature, reference, "A54 semantic signature invariant across E1 constructors/memories");
    }
  }
  nonconformingControls();
  staticGuards();

  console.log([
    "MTS v0.13 A54: RAW_BINARY_CONSTRUCTOR_CLASSIFICATION=GREEN_SCOPED_RESEARCH",
    "CONSTRUCTOR_INPUTS=START_END_ONLY SEMANTIC_ARGUMENTS=0",
    "COMPLIANT_OPAQUE_CONSTRUCTORS=3 SEMANTIC_SIGNATURE=INVARIANT",
    "NONCONFORMING_CONSTRUCTORS=2 REJECTED_BY_GENERIC_LINK_PAIR_CONTRACT",
    "REQUIRED_CONTRACT=CANONICAL_ORDERED_LINK_START_END",
    "INVALID_PHYSICAL_SCRATCH=ALLOWED_BUT_SEMANTIC_ZERO",
    "AMBIENT_PHYSICAL_EXISTENCE=INERT",
    "CLASSIFICATION=E1_PHYSICAL_SUBSTRATE_ON_A53_PATH",
    "IRREDUCIBILITY=NOT_PROVEN BOOTSTRAP_PRIMITIVE_STATUS=UNKNOWN",
    "A21_RUNTIME=SOURCE_IDENTICAL INDEPENDENT_MEMORIES=2_PLUS_VARIANTS",
    "GLOBAL_E2=OPEN GLOBAL_E3=OPEN GLOBAL_E4=OPEN FULL_SELF_HOSTED=FALSE",
    "NEXT=REASSESS_RULE_TO_CONTRACT_SCHEMA_SOURCE",
    "PRODUCTION_UNCHANGED V013_NOT_ACCEPTED",
  ].join(" "));
}
main();
