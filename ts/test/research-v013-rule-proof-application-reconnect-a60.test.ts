import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { materializeExactSequence, readExactSequence } from "../src/exact-sequence.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type RootBasis,
} from "../src/memory.js";
import {
  defineStructuralRoleDictionary,
  defineStructuralRule,
  readStructuralRoleDictionary,
  readStructuralRule,
} from "../src/structural-rule.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.13 A60 Rule/proof application reconnect: ${message}`);
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
  const out: LinkHandle[] = [], seen = new Set<LinkHandle>();
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

/** Exact A21 single-root executor, source-identical to A54. */
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
  const ep = memory.poles(E), out: LinkHandle[] = [];
  for (const occurrence of readChain(memory, ep.end, "frontier")) {
    const truth = memory.poles(memory.poles(occurrence).end);
    same(truth.start, ep.start, "A60 frontier context");
    out.push(truth.end);
  }
  return Object.freeze(out);
}

interface Frame {
  readonly startRole: LinkHandle;
  readonly endRole: LinkHandle;
}
function frame(memory: Memory, basis: RootBasis): Frame {
  const whole = memory.ensure(basis.L, basis.L);
  const startRole = memory.ensureStartSelfClosed(whole);
  const endRole = memory.ensureEndSelfClosed(whole);
  assert(startRole !== endRole, "A60 decomposition roles distinct");
  return Object.freeze({ startRole, endRole });
}

interface ConstructionSchema {
  readonly rule: LinkHandle;
  readonly inputRoles: readonly [LinkHandle, LinkHandle, LinkHandle];
  readonly equationTemplate: LinkHandle;
  readonly witnessTemplate: LinkHandle;
  readonly obligations: readonly LinkHandle[];
}
function decompositionWitness(
  memory: Memory,
  f: Frame,
  node: LinkHandle,
  left: LinkHandle,
  right: LinkHandle,
): LinkHandle {
  const leftBinding = memory.ensure(f.startRole, left);
  const rightBinding = memory.ensure(f.endRole, right);
  return memory.ensure(memory.ensure(leftBinding, rightBinding), node);
}
/**
 * A60 semantic authority is Rule-carried template decomposition, not an F5 plan.
 * Obligation order is intentionally non-semantic.
 */
function defineSchema(
  memory: Memory,
  f: Frame,
  basis: RootBasis,
  reverseObligations: boolean,
): ConstructionSchema {
  const marker = memory.ensure(basis.U, basis.U);
  const targetRole = memory.ensure(memory.ensure(basis.O, marker), marker);
  const startRole = memory.ensure(targetRole, marker);
  const endRole = memory.ensure(startRole, marker);

  const pair = memory.ensure(startRole, endRole);
  const equation = memory.ensure(targetRole, pair);
  const startBinding = memory.ensure(f.startRole, targetRole);
  const endBinding = memory.ensure(f.endRole, pair);
  const bindings = memory.ensure(startBinding, endBinding);
  const witness = memory.ensure(bindings, equation);

  const obligations = [
    decompositionWitness(memory, f, pair, startRole, endRole),
    decompositionWitness(memory, f, equation, targetRole, pair),
    decompositionWitness(memory, f, startBinding, f.startRole, targetRole),
    decompositionWitness(memory, f, endBinding, f.endRole, pair),
    decompositionWitness(memory, f, bindings, startBinding, endBinding),
    decompositionWitness(memory, f, witness, bindings, equation),
  ];
  const obligationCarrier = materializeExactSequence(
    memory,
    reverseObligations ? [...obligations].reverse() : obligations,
  );
  const outputCarrier = materializeExactSequence(memory, [equation, witness]);
  const body = memory.ensure(obligationCarrier, outputCarrier);
  const dictionary = defineStructuralRoleDictionary(memory, [targetRole, startRole, endRole]);
  return Object.freeze({
    rule: defineStructuralRule(memory, dictionary, body),
    inputRoles: [targetRole, startRole, endRole] as const,
    equationTemplate: equation,
    witnessTemplate: witness,
    obligations: Object.freeze(obligations),
  });
}

interface ObligationView {
  readonly node: LinkHandle;
  readonly leftTemplate: LinkHandle;
  readonly rightTemplate: LinkHandle;
}
function readObligationOperands(memory: Memory, witness: LinkHandle): ObligationView {
  const wp = memory.poles(witness);
  const bindings = memory.poles(wp.start);
  const leftBinding = memory.poles(bindings.start);
  const rightBinding = memory.poles(bindings.end);
  return Object.freeze({
    node: wp.end,
    leftTemplate: leftBinding.end,
    rightTemplate: rightBinding.end,
  });
}

interface PairConstructor {
  construct(start: LinkHandle, end: LinkHandle): LinkHandle;
}
function directConstructor(memory: Memory): PairConstructor {
  return Object.freeze({
    construct(start: LinkHandle, end: LinkHandle): LinkHandle {
      return memory.ensure(start, end);
    },
  });
}
function noisyConstructor(memory: Memory): PairConstructor {
  return Object.freeze({
    construct(start: LinkHandle, end: LinkHandle): LinkHandle {
      memory.ensure(memory.ensure(start, start), memory.ensure(end, end));
      return memory.ensure(start, end);
    },
  });
}

interface SelectedApplication {
  readonly selection: LinkHandle;
}
function selectedApplication(
  memory: Memory,
  context: LinkHandle,
  witness: LinkHandle,
  leftTemplate: LinkHandle,
  rightTemplate: LinkHandle,
  leftValue: LinkHandle,
  rightValue: LinkHandle,
  node: LinkHandle,
): SelectedApplication {
  const leftBinding = memory.ensure(leftTemplate, leftValue);
  const rightBinding = memory.ensure(rightTemplate, rightValue);
  const environment = memory.ensure(leftBinding, rightBinding);
  const application = memory.ensure(node, environment);
  const proof = memory.ensure(environment, application);
  const truth = memory.ensure(context, application);
  return Object.freeze({ selection: memory.ensure(witness, memory.ensure(proof, truth)) });
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
function deriveApplicationCandidate(
  memory: Memory,
  f: Frame,
  selection: LinkHandle,
): ApplicationCandidate {
  const selected = memory.poles(selection);
  const witness = selected.start;
  const inner = memory.poles(selected.end);
  const proof = memory.poles(inner.start);
  const truth = memory.poles(inner.end);
  const environment = proof.start;
  const proofApplication = proof.end;
  const parentContext = truth.start;
  const truthApplication = truth.end;

  const witnessPoles = memory.poles(witness);
  const witnessBindings = memory.poles(witnessPoles.start);
  const witnessLeft = memory.poles(witnessBindings.start);
  const witnessRight = memory.poles(witnessBindings.end);
  const node = witnessPoles.end;
  const leftTemplate = witnessLeft.end;
  const rightTemplate = witnessRight.end;

  const env = memory.poles(environment);
  const leftBinding = memory.poles(env.start);
  const rightBinding = memory.poles(env.end);
  const startValue = leftBinding.end;
  const endValue = rightBinding.end;

  const expectedApplication = memory.ensure(node, environment);
  const reconstructedNode = memory.ensure(leftTemplate, rightTemplate);

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
      check(leftTemplate, leftBinding.start),
      check(rightTemplate, rightBinding.start),
      check(f.startRole, witnessLeft.start),
      check(f.endRole, witnessRight.start),
      check(reconstructedNode, node),
    ]),
  });
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
  const K = memory.ensure(candidate.parentContext, freezeChain(memory, transitions));
  const seed = memory.ensure(K, candidate.checks[0]!.query);
  return Object.freeze({
    E0: memory.ensure(K, freezeChain(memory, [memory.ensure(memory.root, seed)])),
    depth: candidate.checks.length,
  });
}
function executeSelectedApplication(
  memory: Memory,
  f: Frame,
  selection: LinkHandle,
  constructor: PairConstructor,
): LinkHandle | undefined {
  const candidate = deriveApplicationCandidate(memory, f, selection);
  const physical = constructor.construct(candidate.startValue, candidate.endValue);
  const program = compileValidation(memory, candidate, physical);
  let current = program.E0;
  for (let i = 0; i < program.depth; i += 1) current = step(memory, current, "forward");
  const ends = frontierTruthEnds(memory, current);
  return ends.length === 1 ? ends[0] : undefined;
}

function selectedRuleRequest(
  memory: Memory,
  context: LinkHandle,
  schema: ConstructionSchema,
  target: LinkHandle,
  start: LinkHandle,
  end: LinkHandle,
): LinkHandle {
  const bindings = materializeExactSequence(memory, [
    memory.ensure(schema.inputRoles[0], target),
    memory.ensure(schema.inputRoles[1], start),
    memory.ensure(schema.inputRoles[2], end),
  ]);
  return memory.ensure(context, memory.ensure(schema.rule, bindings));
}
interface Generated {
  readonly equation: LinkHandle;
  readonly witness: LinkHandle;
}
/**
 * Generic Rule scheduler. It knows no Equation/Witness meaning and no exact
 * obligation order. Readiness/order are E4 orchestration; each construction
 * itself is a selected proof-gated Link application.
 */
function executeSelectedRule(
  memory: Memory,
  f: Frame,
  selectedRequest: LinkHandle,
  schedule: "forward" | "reverse",
  constructor: PairConstructor,
): Generated | undefined {
  const selected = memory.poles(selectedRequest);
  const context = selected.start;
  const request = memory.poles(selected.end);
  const ruleHandle = request.start;
  const bindingCarrier = request.end;

  const structural = readStructuralRule(memory, ruleHandle);
  const dictionary = readStructuralRoleDictionary(memory, structural.roleDictionary);
  const bindings = readExactSequence(memory, bindingCarrier).values;
  if (bindings.length !== dictionary.roles.length) return undefined;

  const values = new Map<LinkHandle, LinkHandle>();
  for (const binding of bindings) {
    const p = memory.poles(binding);
    if (!dictionary.roles.includes(p.start) || values.has(p.start)) return undefined;
    values.set(p.start, p.end);
  }
  if (values.size !== dictionary.roles.length) return undefined;

  const body = memory.poles(structural.body);
  const obligations = [...readExactSequence(memory, body.start).values];
  const outputs = readExactSequence(memory, body.end).values;
  if (outputs.length !== 2) return undefined;

  let pending = obligations;
  while (pending.length > 0) {
    let progress = false;
    const scan = schedule === "forward" ? pending : [...pending].reverse();
    const executed = new Set<LinkHandle>();

    for (const witness of scan) {
      const o = readObligationOperands(memory, witness);
      const left = values.get(o.leftTemplate) ?? (
        dictionary.roles.includes(o.leftTemplate) ? undefined : o.leftTemplate
      );
      const right = values.get(o.rightTemplate) ?? (
        dictionary.roles.includes(o.rightTemplate) ? undefined : o.rightTemplate
      );
      if (left === undefined || right === undefined) continue;

      const selectedApplicationValue = selectedApplication(
        memory, context, witness, o.leftTemplate, o.rightTemplate, left, right, o.node,
      );
      const result = executeSelectedApplication(memory, f, selectedApplicationValue.selection, constructor);
      if (result === undefined) return undefined;

      const old = values.get(o.node);
      if (old !== undefined && old !== result) return undefined;
      values.set(o.node, result);
      executed.add(witness);
      progress = true;
    }
    if (!progress) return undefined;
    pending = pending.filter(value => !executed.has(value));
  }

  const equation = values.get(outputs[0]!);
  const witness = values.get(outputs[1]!);
  if (equation === undefined || witness === undefined) return undefined;
  return Object.freeze({ equation, witness });
}

function directOracle(
  memory: Memory,
  f: Frame,
  target: LinkHandle,
  start: LinkHandle,
  end: LinkHandle,
): Generated {
  const pair = memory.ensure(start, end);
  const equation = memory.ensure(target, pair);
  const sb = memory.ensure(f.startRole, target);
  const eb = memory.ensure(f.endRole, pair);
  return Object.freeze({
    equation,
    witness: memory.ensure(memory.ensure(sb, eb), equation),
  });
}
function readA58Evidence(memory: Memory, f: Frame, witness: LinkHandle): Generated {
  const wp = memory.poles(witness);
  const bp = memory.poles(wp.start);
  const sb = memory.poles(bp.start);
  const eb = memory.poles(bp.end);
  same(sb.start, f.startRole, "A60 A58 START role");
  same(eb.start, f.endRole, "A60 A58 END role");
  same(memory.ensure(sb.end, eb.end), wp.end, "A60 A58 reconstructed equation");
  return Object.freeze({ equation: wp.end, witness });
}
function fresh(memory: Memory, b: RootBasis): readonly [LinkHandle, LinkHandle, LinkHandle][] {
  const a = memory.ensure(b.C, b.U), d = memory.ensure(b.O, b.L);
  return Object.freeze([
    [memory.ensure(a, b.L), a, d],
    [memory.ensure(d, b.C), d, a],
    [memory.ensure(a, d), b.O, b.C],
  ] as const);
}
type ConstructorFactory = (memory: Memory) => PairConstructor;

function exercise(memory: Memory, noise: boolean, factory: ConstructorFactory): void {
  const b = ensureRootBasis(memory);
  if (noise) memory.ensure(memory.ensure(b.U, b.C), b.O);
  const f = frame(memory, b);
  const forward = defineSchema(memory, f, b, false);
  const reverse = defineSchema(memory, f, b, true);
  assert(forward.rule !== reverse.rule, "A60 different obligation order gives distinct Rule handle");

  for (const [target, start, end] of fresh(memory, b)) {
    let reference: Generated | undefined;
    for (const schema of [forward, reverse]) {
      for (const schedule of ["forward", "reverse"] as const) {
        const request = selectedRuleRequest(memory, memory.ensure(b.R, b.U), schema, target, start, end);
        const generated = executeSelectedRule(memory, f, request, schedule, factory(memory));
        assert(generated !== undefined, "A60 selected Rule execution succeeds");
        reference ??= generated;
        same(generated.equation, reference.equation, "A60 topology/schedule equation convergence");
        same(generated.witness, reference.witness, "A60 topology/schedule witness convergence");
        const evidence = readA58Evidence(memory, f, generated.witness);
        same(evidence.equation, generated.equation, "A60 A58 evidence exact");
      }
    }
    const before = memory.linkCount;
    const oracle = directOracle(memory, f, target, start, end);
    same(memory.linkCount, before, "A60 post-hoc direct oracle adds no Links");
    same(reference!.equation, oracle.equation, "A60 exact equation oracle");
    same(reference!.witness, oracle.witness, "A60 exact witness oracle");
  }

  // Forged decomposition evidence can physically create scratch but cannot finish selected Rule.
  const structural = readStructuralRule(memory, forward.rule);
  const body = memory.poles(structural.body);
  const obligations = readExactSequence(memory, body.start).values;
  const first = readObligationOperands(memory, obligations[0]!);
  const forged = decompositionWitness(memory, f, first.node, first.rightTemplate, first.leftTemplate);
  const forgedCarrier = materializeExactSequence(memory, [forged, ...obligations.slice(1)]);
  const forgedRule = defineStructuralRule(
    memory,
    structural.roleDictionary,
    memory.ensure(forgedCarrier, body.end),
  );
  const [target, start, end] = fresh(memory, b)[0]!;
  const forgedSchema = Object.freeze({
    ...forward,
    rule: forgedRule,
  });
  const bad = executeSelectedRule(
    memory,
    f,
    selectedRuleRequest(memory, memory.ensure(b.C, b.U), forgedSchema, target, start, end),
    "forward",
    factory(memory),
  );
  same(bad, undefined, "A60 forged Rule decomposition ZERO");

  // Ambient obligation not selected by Rule is inert.
  decompositionWitness(memory, f, memory.ensure(target, start), end, target);
  const valid = executeSelectedRule(
    memory,
    f,
    selectedRuleRequest(memory, memory.ensure(b.O, b.U), forward, target, start, end),
    "forward",
    factory(memory),
  );
  assert(valid !== undefined, "A60 ambient obligation cannot alter selected Rule");
}

function staticGuards(): void {
  const root = resolve(process.cwd(), "..");
  const own = readFileSync(join(root, "ts/test/research-v013-rule-proof-application-reconnect-a60.test.ts"), "utf8");
  const a51 = readFileSync(join(root, "ts/test/research-v013-template-pair-join-falsifier-a51.test.ts"), "utf8");
  const a52 = readFileSync(join(root, "ts/test/research-v013-application-normal-form-a52.test.ts"), "utf8");
  const a53 = readFileSync(join(root, "ts/test/research-v013-proof-gated-application-a53.test.ts"), "utf8");
  const a54 = readFileSync(join(root, "ts/test/research-v013-raw-pair-constructor-a54.test.ts"), "utf8");
  const a59 = readFileSync(join(root, "ts/test/research-v013-construction-carried-equation-witness-a59.test.ts"), "utf8");

  const execution = own.slice(
    own.indexOf("function executeSelectedRule("),
    own.indexOf("\nfunction directOracle(", own.indexOf("function executeSelectedRule(")),
  );
  for (const forbidden of [
    "executeConstructionPlan", "instantiatePlan", "const clone=", "freeRoles", "constrainedTargets",
  ]) assert(!execution.includes(forbidden), `A60 Rule execution excludes reopened plan/clone source ${forbidden}`);

  const derive = own.slice(
    own.indexOf("function deriveApplicationCandidate("),
    own.indexOf("\ninterface ValidationProgram", own.indexOf("function deriveApplicationCandidate(")),
  );
  for (const forbidden of ["memory.poles(proofApplication", "memory.poles(truthApplication", "memory.find("])
    assert(!derive.includes(forbidden), `A60 application derivation excludes ${forbidden}`);

  const constructorSlice = own.slice(
    own.indexOf("interface PairConstructor"),
    own.indexOf("\ninterface SelectedApplication", own.indexOf("interface PairConstructor")),
  ).toLowerCase();
  for (const forbidden of ["schema", "template", "role", "context", "truth", "application", "proof", "candidate"])
    assert(!constructorSlice.includes(forbidden), `A60 constructor excludes semantic term ${forbidden}`);

  assert(a59.includes("GENERIC_TOPOLOGY_SUBSTITUTION=HISTORICAL_RESIDUAL"),
    "A60 attacks exact A59 historical residual");
  assert(a51.includes("MINIMUM_MISSING_AUTHORITY=DYNAMIC_BINARY_PAIR_REQUEST"),
    "A60 inherits A51 binary-join localization");
  assert(a52.includes("JOIN_REQUEST=SELECTED_APPLICATION_T_TO_BINDING_ENVIRONMENT"),
    "A60 inherits A52 selected application normal form");
  assert(a53.includes("SEMANTIC_VALIDATION=STAGE_SCOPED_CANONICAL_COLLAPSE_PLUS_A21"),
    "A60 inherits A53 proof-gated semantics");
  assert(a54.includes("CLASSIFICATION=E1_PHYSICAL_SUBSTRATE_ON_A53_PATH"),
    "A60 inherits A54 physical constructor classification");

  const x = own.slice(own.indexOf("function step("), own.indexOf("\nfunction frontierTruthEnds(", own.indexOf("function step(")));
  const y = a54.slice(a54.indexOf("function step("), a54.indexOf("\nfunction frontierTruthEnds(", a54.indexOf("function step(")));
  same(x.replace(/\s+/g, ""), y.replace(/\s+/g, ""), "A60 runtime source-identical A54/A21");
}

function main(): void {
  for (const factory of [directConstructor, noisyConstructor] as const) {
    exercise(new Memory(), false, factory);
    exercise(new Memory(), true, factory);
  }
  staticGuards();
  console.log([
    "MTS v0.13 A60: RULE_PROOF_APPLICATION_RECONNECTION=GREEN_SCOPED_RESEARCH",
    "A59_F5_PLAN_INTERPRETER=0 GENERIC_CLONE=0",
    "SEMANTIC_AUTHORITY=STRUCTURAL_RULE_PLUS_PROOF_CARRIED_DECOMPOSITION",
    "PAIR_CONSTRUCTION=SELECTED_PROOF_GATED_APPLICATION",
    "APPLICATION_VALIDATION=STAGE_SCOPED_CANONICAL_COLLAPSE_PLUS_A21",
    "PHYSICAL_CONSTRUCTOR=A54_E1_BOUNDARY",
    "PER_INSTANCE_SEMANTIC_INPUTS=TARGET_START_END_ONLY",
    "OUTPUTS=EXACT_A58_EQUATION_PLUS_WITNESS",
    "RULE_OBLIGATION_ORDER_AND_EXECUTION_SCHEDULE=NON_SEMANTIC_CONVERGENT",
    "FORGED_DECOMPOSITION=ZERO AMBIENT_OBLIGATION=INERT",
    "RULE_TO_SELECTED_APPLICATION_PRODUCTION=GENERIC_E4_ORCHESTRATION_RESIDUAL",
    "RULE_AUTHORSHIP_ADMISSION=E2_E3_RESIDUAL A35_PUBLICATION_EXISTENCE=RESIDUAL",
    "GLOBAL_E2=OPEN GLOBAL_E3=OPEN GLOBAL_E4=OPEN FULL_SELF_HOSTED=FALSE",
    "NEXT_BOUNDARY=A61_CLASSIFY_OR_SOURCE_REMOVE_RULE_APPLICATION_PRODUCTION",
    "V013_NOT_ACCEPTED PRODUCTION_UNCHANGED",
  ].join(" "));
}
main();
