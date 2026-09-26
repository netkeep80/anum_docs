// mts-version-evidence: candidate-from=0.14

import { materializeExactSequence } from "../src/exact-sequence.js";
import {
  admitStructuralDerivationRule,
  defineStructuralDerivationRule,
} from "../src/derivation.js";
import {
  StructuralClosureApplicationReplayError,
  replayStructuralClosureApplication,
  replayStructuralParametricClosureApplication,
} from "../src/derived-derivation-closure.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
} from "../src/memory.js";
import { replayStructuralRootedProofAset } from "../src/rooted-proof-aset.js";
import {
  admitStructuralRule,
  defineStructuralRoleDictionary,
  defineStructuralRule,
} from "../src/structural-rule.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error("v0.14 N6 parametric closure: " + message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}

function expectClosureError(code: string, effect: () => unknown): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof StructuralClosureApplicationReplayError, `${code}: wrong error type`);
    same(error.code, code, `${code}: wrong error code`);
    return;
  }
  throw new Error(`${code}: expected closure rejection`);
}

function admittedRoot(
  memory: Memory,
  theory: LinkHandle,
  dictionary: LinkHandle,
  premises: readonly LinkHandle[],
  conclusion: LinkHandle,
): Readonly<{
  derivationRule: LinkHandle;
  identity: LinkHandle;
  root: LinkHandle;
}> {
  const rule = defineStructuralRule(memory, dictionary, conclusion);
  const derivationRule = defineStructuralDerivationRule(memory, rule, premises);
  const ruleAdmission = admitStructuralRule(memory, theory, rule);
  const derivationRuleAdmission = admitStructuralDerivationRule(memory, theory, derivationRule);
  const identity = memory.ensure(derivationRule, theory);
  const assumptions = premises.map((template) => memory.ensure(template, identity));
  const premiseSequence = materializeExactSequence(memory, assumptions);
  const targetOccurrence = memory.ensure(derivationRule, premiseSequence);
  const rootedOccurrence = memory.ensure(conclusion, targetOccurrence);
  const root = memory.ensure(identity, rootedOccurrence);

  // Rooted replay is the authority check used by both closure verifiers.
  const replay = replayStructuralRootedProofAset(memory, root);
  same(replay.conclusion, conclusion, "rooted proof conclusion");
  // Keep admissions live in the proof graph.
  void ruleAdmission;
  void derivationRuleAdmission;

  return Object.freeze({ derivationRule, identity, root });
}

function derivedResult(
  memory: Memory,
  theory: LinkHandle,
  dictionary: LinkHandle,
  premises: readonly LinkHandle[],
  conclusion: LinkHandle,
): Readonly<{ derivationRule: LinkHandle; identity: LinkHandle }> {
  const rule = defineStructuralRule(memory, dictionary, conclusion);
  admitStructuralRule(memory, theory, rule);
  const derivationRule = defineStructuralDerivationRule(memory, rule, premises);
  return Object.freeze({
    derivationRule,
    identity: memory.ensure(derivationRule, theory),
  });
}

function morphism(
  memory: Memory,
  theory: LinkHandle,
  sourceDictionary: LinkHandle,
  targetDictionary: LinkHandle,
  bindings: readonly (readonly [LinkHandle, LinkHandle])[],
): LinkHandle {
  return materializeExactSequence(memory, [
    theory,
    sourceDictionary,
    targetDictionary,
    materializeExactSequence(
      memory,
      bindings.map(([source, target]) => memory.ensure(source, target)),
    ),
  ]);
}

function specialization(
  memory: Memory,
  theory: LinkHandle,
  sourceDictionary: LinkHandle,
  targetDictionary: LinkHandle,
  roleBindings: readonly (readonly [LinkHandle, LinkHandle])[],
  groundBindings: readonly (readonly [LinkHandle, LinkHandle])[],
): LinkHandle {
  return materializeExactSequence(memory, [
    theory,
    sourceDictionary,
    targetDictionary,
    materializeExactSequence(
      memory,
      roleBindings.map(([source, target]) => memory.ensure(source, target)),
    ),
    materializeExactSequence(
      memory,
      groundBindings.map(([source, target]) => memory.ensure(source, target)),
    ),
  ]);
}

function main(): void {
  const memory = new Memory();
  const { R, O, C, L, U } = ensureRootBasis(memory);
  const theory = memory.ensure(C, U);

  const x = memory.ensure(R, L);
  const x1 = memory.ensure(R, U);
  const p = memory.ensure(C, R);
  const n = memory.ensure(L, R);
  const n1 = memory.ensure(U, R);
  const z = memory.ensure(O, U);
  same(new Set([x, x1, p, n, n1, z]).size, 6, "coordinates are distinct");

  const domainContext = memory.ensure(O, C);
  const stepContext = memory.ensure(C, O);
  const claimContext = memory.ensure(L, U);
  const domain = (value: LinkHandle): LinkHandle => memory.ensure(domainContext, value);
  const edge = (left: LinkHandle, right: LinkHandle): LinkHandle =>
    memory.ensure(memory.ensure(stepContext, left), right);
  const claim = (parameter: LinkHandle, value: LinkHandle): LinkHandle =>
    memory.ensure(claimContext, memory.ensure(parameter, value));

  const dAuthority = defineStructuralRoleDictionary(memory, [x, x1]);
  const dBase = defineStructuralRoleDictionary(memory, [p]);
  const dStep = defineStructuralRoleDictionary(memory, [p, n, n1]);
  const dResult = defineStructuralRoleDictionary(memory, [p, n]);

  const domainZ = domain(z);
  const domainX = domain(x);
  const domainX1 = domain(x1);
  const transitionXX1 = edge(x, x1);
  const authority = materializeExactSequence(memory, [
    theory,
    dAuthority,
    z,
    domainZ,
    domainX,
    transitionXX1,
    domainX1,
  ]);
  const authorityAdmission = memory.ensure(theory, authority);

  const domainN = domain(n);
  const transitionNN1 = edge(n, n1);
  const baseClaim = claim(p, z);
  const currentClaim = claim(p, n);
  const nextClaim = claim(p, n1);

  const base = admittedRoot(memory, theory, dBase, [], baseClaim);
  const step = admittedRoot(
    memory,
    theory,
    dStep,
    [domainN, transitionNN1, currentClaim],
    nextClaim,
  );
  const result = derivedResult(memory, theory, dResult, [domainN], currentClaim);
  assert(memory.find(theory, result.derivationRule) === undefined, "RESULT DR starts derived");

  const authorityMorphism = morphism(
    memory,
    theory,
    dAuthority,
    dStep,
    [[x, n], [x1, n1]],
  );
  const currentMorphism = morphism(
    memory,
    theory,
    dResult,
    dStep,
    [[p, p], [n, n]],
  );
  const nextMorphism = morphism(
    memory,
    theory,
    dResult,
    dStep,
    [[p, p], [n, n1]],
  );
  const baseSpecialization = specialization(
    memory,
    theory,
    dResult,
    dBase,
    [[p, p]],
    [[n, z]],
  );

  const parametricEvidence = Object.freeze({
    authority,
    authorityAdmission,
    baseRoot: base.root,
    stepRoot: step.root,
    resultIdentity: result.identity,
    authorityMorphism,
    currentMorphism,
    nextMorphism,
    baseSpecialization,
  });

  // N5 boundary remains exact for the old unary verifier.
  expectClosureError("invalid-scope", () =>
    replayStructuralClosureApplication(memory, {
      authority,
      authorityAdmission,
      baseRoot: base.root,
      stepRoot: step.root,
      resultIdentity: result.identity,
      authorityMorphism,
      currentMorphism,
      nextMorphism,
      baseGrounding: R,
    }),
  );

  const before = memory.linkCount;
  const replay = replayStructuralParametricClosureApplication(memory, parametricEvidence);
  same(replay.theory, theory, "parametric closure exact Theory");
  same(replay.resultDerivationRule, result.derivationRule, "parametric RESULT DR");
  same(replay.resultConclusionTemplate, currentClaim, "parametric theorem body P(p,n)");
  same(replay.base.conclusion, baseClaim, "parametric BASE consumed");
  same(replay.step.conclusion, nextClaim, "parametric STEP consumed");
  same(memory.linkCount, before, "parametric replay is read-only");
  assert(memory.find(theory, result.derivationRule) === undefined, "RESULT DR remains unadmitted");

  // Stable parameters are semantic proof coordinates, not host metadata.
  const driftNext = morphism(
    memory,
    theory,
    dResult,
    dStep,
    [[p, n], [n, n1]],
  );
  expectClosureError("parameter-drift", () =>
    replayStructuralParametricClosureApplication(memory, {
      ...parametricEvidence,
      nextMorphism: driftNext,
    }),
  );

  const missingParameterBase = specialization(
    memory,
    theory,
    dResult,
    dBase,
    [],
    [[n, z]],
  );
  expectClosureError("invalid-base-specialization", () =>
    replayStructuralParametricClosureApplication(memory, {
      ...parametricEvidence,
      baseSpecialization: missingParameterBase,
    }),
  );

  const groundedParameterBase = specialization(
    memory,
    theory,
    dResult,
    dBase,
    [],
    [[p, z], [n, z]],
  );
  expectClosureError("invalid-base-specialization", () =>
    replayStructuralParametricClosureApplication(memory, {
      ...parametricEvidence,
      baseSpecialization: groundedParameterBase,
    }),
  );

  memory.ensure(theory, result.derivationRule);
  expectClosureError("result-primitive-admission", () =>
    replayStructuralParametricClosureApplication(memory, parametricEvidence),
  );

  console.log([
    "MTS v0.14 N6: PARAMETRIC_STRUCTURAL_CLOSURE=GREEN_RESEARCH",
    "OLD_UNARY_VERIFIER_PARAMETRIC_REJECT=invalid-scope",
    "PARAMETER_PRESERVATION=PROVEN_BY_MORPHISM",
    "BASE_ROLE_PARTITION=PARAMETERS_PLUS_ONE_GROUNDED_INDUCTION_ROLE",
    "PARAMETER_DRIFT_REJECTED=TRUE",
    "MISSING_PARAMETER_BASE_BINDING_REJECTED=TRUE",
    "MULTIPLE_GROUNDED_ROLES_REJECTED=TRUE",
    "RESULT_PRIMITIVE_ADMISSION_REJECTED=TRUE",
    "REPLAY_READ_ONLY=TRUE",
    "EXISTENTIAL_WITNESS_PRODUCTION=NOT_PROVIDED",
    "DERIVATION_INVERSION=NOT_PROVIDED",
    "GENERAL_ADD_TOTALITY=OPEN",
    "GENERAL_ADD_FUNCTIONALITY=OPEN",
    "ACCEPTED_V013_MUTATED=FALSE",
  ].join(" "));
}

main();
