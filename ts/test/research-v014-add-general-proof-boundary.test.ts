// mts-version-evidence: candidate-from=0.14

import { materializeExactSequence } from "../src/exact-sequence.js";
import {
  admitStructuralDerivationRule,
  defineStructuralDerivationRule,
} from "../src/derivation.js";
import {
  StructuralClosureApplicationReplayError,
  replayStructuralClosureApplication,
  type StructuralClosureApplicationEvidence,
} from "../src/derived-derivation-closure.js";
import {
  replayStructuralDerivedDerivationSchema,
  type StructuralDerivedDerivationEvidence,
} from "../src/derived-derivation-schema.js";
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
  if (!condition) throw new Error("v0.14 N5 Add proof boundary: " + message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}

function expectClosureError(code: string, effect: () => unknown): void {
  try {
    effect();
  } catch (error) {
    assert(
      error instanceof StructuralClosureApplicationReplayError,
      `${code}: wrong error type`,
    );
    same(error.code, code, `${code}: wrong error code`);
    return;
  }
  throw new Error(`${code}: expected closure rejection`);
}

interface GenericFixture {
  readonly derivationRule: LinkHandle;
  readonly identity: LinkHandle;
  readonly root: LinkHandle;
  readonly evidence: StructuralDerivedDerivationEvidence;
}

function admittedGeneric(
  memory: Memory,
  theory: LinkHandle,
  dictionary: LinkHandle,
  premises: readonly LinkHandle[],
  conclusion: LinkHandle,
): GenericFixture {
  const rule = defineStructuralRule(memory, dictionary, conclusion);
  const derivationRule = defineStructuralDerivationRule(
    memory,
    rule,
    premises,
  );
  const ruleAdmission = admitStructuralRule(memory, theory, rule);
  const derivationRuleAdmission =
    admitStructuralDerivationRule(memory, theory, derivationRule);
  const identity = memory.ensure(derivationRule, theory);
  const assumptions = premises.map((template) =>
    Object.freeze({
      occurrence: memory.ensure(template, identity),
      template,
    }),
  );
  const premiseOccurrenceSequence = materializeExactSequence(
    memory,
    assumptions.map(({ occurrence }) => occurrence),
  );
  const targetOccurrence = memory.ensure(
    derivationRule,
    premiseOccurrenceSequence,
  );
  const rootedOccurrence = memory.ensure(conclusion, targetOccurrence);
  const root = memory.ensure(identity, rootedOccurrence);

  return Object.freeze({
    derivationRule,
    identity,
    root,
    evidence: Object.freeze({
      identity,
      targetOccurrence,
      assumptions: Object.freeze(assumptions),
      nodes: Object.freeze([
        Object.freeze({
          occurrence: targetOccurrence,
          derivationRule,
          ruleAdmission,
          derivationRuleAdmission,
          premiseOccurrenceSequence,
        }),
      ]),
    }),
  });
}

function resultIdentity(
  memory: Memory,
  theory: LinkHandle,
  dictionary: LinkHandle,
  premises: readonly LinkHandle[],
  conclusion: LinkHandle,
): Readonly<{
  derivationRule: LinkHandle;
  identity: LinkHandle;
}> {
  const rule = defineStructuralRule(memory, dictionary, conclusion);
  admitStructuralRule(memory, theory, rule);
  const derivationRule = defineStructuralDerivationRule(
    memory,
    rule,
    premises,
  );
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

function grounding(
  memory: Memory,
  theory: LinkHandle,
  sourceDictionary: LinkHandle,
  generator: LinkHandle,
  sourceRole: LinkHandle,
): LinkHandle {
  return materializeExactSequence(memory, [
    theory,
    sourceDictionary,
    generator,
    materializeExactSequence(
      memory,
      [memory.ensure(sourceRole, generator)],
    ),
  ]);
}

function main(): void {
  const memory = new Memory();
  const { R, O, C, L, U } = ensureRootBasis(memory);
  const theory = memory.ensure(C, U);

  const x = memory.ensure(R, L);
  const x1 = memory.ensure(R, U);
  const n = memory.ensure(L, R);
  const n1 = memory.ensure(U, R);
  const z = memory.ensure(O, U);
  const p = memory.ensure(C, R);
  same(
    new Set([x, x1, n, n1, z, p]).size,
    6,
    "proof coordinates are distinct",
  );

  const domainContext = memory.ensure(O, C);
  const stepContext = memory.ensure(C, O);
  const claimContext = memory.ensure(L, U);

  const domain = (value: LinkHandle): LinkHandle =>
    memory.ensure(domainContext, value);
  const edge = (
    left: LinkHandle,
    right: LinkHandle,
  ): LinkHandle =>
    memory.ensure(memory.ensure(stepContext, left), right);
  const claim = (
    parameter: LinkHandle,
    value: LinkHandle,
  ): LinkHandle =>
    memory.ensure(
      claimContext,
      memory.ensure(parameter, value),
    );

  // -----------------------------------------------------------------------
  // N5.1 — strict unary control: current closure verifier is valid for P(n).
  // -----------------------------------------------------------------------

  const dAuthority = defineStructuralRoleDictionary(memory, [x, x1]);
  const dBase = defineStructuralRoleDictionary(memory, []);
  const dStep = defineStructuralRoleDictionary(memory, [n, n1]);
  const dResult = defineStructuralRoleDictionary(memory, [n]);

  const domainZ = domain(z);
  const domainX = domain(x);
  const domainX1 = domain(x1);
  const stepXX1 = edge(x, x1);
  const authority = materializeExactSequence(memory, [
    theory,
    dAuthority,
    z,
    domainZ,
    domainX,
    stepXX1,
    domainX1,
  ]);
  const authorityAdmission = memory.ensure(theory, authority);

  const domainN = domain(n);
  const stepNN1 = edge(n, n1);
  const unaryParameter = U;
  const cZ = claim(unaryParameter, z);
  const cN = claim(unaryParameter, n);
  const cN1 = claim(unaryParameter, n1);

  const unaryBase = admittedGeneric(
    memory,
    theory,
    dBase,
    [],
    cZ,
  );
  const unaryStep = admittedGeneric(
    memory,
    theory,
    dStep,
    [domainN, stepNN1, cN],
    cN1,
  );
  const unaryResult = resultIdentity(
    memory,
    theory,
    dResult,
    [domainN],
    cN,
  );

  same(
    replayStructuralDerivedDerivationSchema(
      memory,
      unaryBase.evidence,
    ).conclusionTemplate,
    cZ,
    "unary BASE replay",
  );
  same(
    replayStructuralDerivedDerivationSchema(
      memory,
      unaryStep.evidence,
    ).conclusionTemplate,
    cN1,
    "unary STEP replay",
  );
  same(
    replayStructuralRootedProofAset(
      memory,
      unaryBase.root,
    ).conclusion,
    cZ,
    "unary rooted BASE replay",
  );
  same(
    replayStructuralRootedProofAset(
      memory,
      unaryStep.root,
    ).conclusion,
    cN1,
    "unary rooted STEP replay",
  );

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
    [[n, n]],
  );
  const nextMorphism = morphism(
    memory,
    theory,
    dResult,
    dStep,
    [[n, n1]],
  );
  const baseGrounding = grounding(
    memory,
    theory,
    dResult,
    z,
    n,
  );

  const unaryEvidence: StructuralClosureApplicationEvidence =
    Object.freeze({
      authority,
      authorityAdmission,
      baseRoot: unaryBase.root,
      stepRoot: unaryStep.root,
      resultIdentity: unaryResult.identity,
      authorityMorphism,
      currentMorphism,
      nextMorphism,
      baseGrounding,
    });

  const beforeUnary = memory.linkCount;
  same(
    replayStructuralClosureApplication(
      memory,
      unaryEvidence,
    ).resultConclusionTemplate,
    cN,
    "unary P(n) closure remains supported",
  );
  same(
    memory.linkCount,
    beforeUnary,
    "unary closure replay is read-only",
  );

  // -----------------------------------------------------------------------
  // N5.2 — valid parametric induction shape P(p,n).
  //
  // BASE and STEP are independently valid rooted proof data. The only new
  // requirement is that p remains stable while n advances.
  // -----------------------------------------------------------------------

  const dParamBase = defineStructuralRoleDictionary(memory, [p]);
  const dParamStep = defineStructuralRoleDictionary(
    memory,
    [p, n, n1],
  );
  const dParamResult = defineStructuralRoleDictionary(
    memory,
    [p, n],
  );

  const paramBaseClaim = claim(p, z);
  const paramCurrentClaim = claim(p, n);
  const paramNextClaim = claim(p, n1);

  const paramBase = admittedGeneric(
    memory,
    theory,
    dParamBase,
    [],
    paramBaseClaim,
  );
  const paramStep = admittedGeneric(
    memory,
    theory,
    dParamStep,
    [domainN, stepNN1, paramCurrentClaim],
    paramNextClaim,
  );
  const paramResult = resultIdentity(
    memory,
    theory,
    dParamResult,
    [domainN],
    paramCurrentClaim,
  );

  same(
    replayStructuralDerivedDerivationSchema(
      memory,
      paramBase.evidence,
    ).conclusionTemplate,
    paramBaseClaim,
    "parametric BASE is valid proof data",
  );
  same(
    replayStructuralDerivedDerivationSchema(
      memory,
      paramStep.evidence,
    ).conclusionTemplate,
    paramNextClaim,
    "parametric STEP is valid proof data",
  );
  same(
    replayStructuralRootedProofAset(
      memory,
      paramBase.root,
    ).conclusion,
    paramBaseClaim,
    "parametric rooted BASE is valid",
  );
  same(
    replayStructuralRootedProofAset(
      memory,
      paramStep.root,
    ).conclusion,
    paramNextClaim,
    "parametric rooted STEP is valid",
  );

  assert(
    memory.find(theory, paramResult.derivationRule) === undefined,
    "parametric RESULT remains derived, not primitive",
  );

  const beforeParametric = memory.linkCount;
  expectClosureError(
    "invalid-scope",
    () =>
      replayStructuralClosureApplication(memory, {
        ...unaryEvidence,
        baseRoot: paramBase.root,
        stepRoot: paramStep.root,
        resultIdentity: paramResult.identity,
      }),
  );
  same(
    memory.linkCount,
    beforeParametric,
    "parametric rejection is read-only",
  );
  assert(
    memory.find(theory, paramResult.derivationRule) === undefined,
    "parametric rejection does not promote RESULT",
  );

  console.log([
    "MTS v0.14 N5: GENERAL_ADD_PROOF_BOUNDARY=PINNED",
    "UNARY_CLOSURE_P_N=GREEN",
    "PARAMETRIC_BASE_P_P_Z=GREEN",
    "PARAMETRIC_STEP_P_P_N_TO_P_P_N1=GREEN",
    "PARAMETRIC_CLOSURE_REJECT=invalid-scope",
    "BLOCKER_CLASS=PROOF_VERIFIER_EXPRESSIVENESS",
    "TOTALITY_REQUIRES_DEPENDENT_EXISTENTIAL_WITNESS=TRUE",
    "FUNCTIONALITY_REQUIRES_DERIVATION_INDUCTION_INVERSION=TRUE",
    "GENERAL_TOTALITY_PROOF=OPEN",
    "GENERAL_FUNCTIONALITY_PROOF=OPEN",
    "PRODUCTION_DELTA=NONE",
    "ACCEPTED_V013_MUTATED=FALSE",
  ].join(" "));
}

main();
