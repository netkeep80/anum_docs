// mts-version-evidence: candidate-from=0.14

import { materializeExactSequence } from "../src/exact-sequence.js";
import {
  admitStructuralDerivationRule,
  defineStructuralDerivationRule,
} from "../src/derivation.js";
import {
  StructuralClosureApplicationReplayError,
  replayStructuralClosureApplication,
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
  if (!condition) {
    throw new Error("v0.14 N2 Add left-zero closure: " + message);
  }
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}

function expectClosureError(
  code: string,
  effect: () => unknown,
): void {
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

interface PrimitiveSchema {
  readonly derivationRule: LinkHandle;
}

function admittedPrimitive(
  memory: Memory,
  theory: LinkHandle,
  dictionary: LinkHandle,
  premises: readonly LinkHandle[],
  conclusion: LinkHandle,
): PrimitiveSchema {
  const rule = defineStructuralRule(memory, dictionary, conclusion);
  const derivationRule = defineStructuralDerivationRule(
    memory,
    rule,
    premises,
  );
  admitStructuralRule(memory, theory, rule);
  admitStructuralDerivationRule(memory, theory, derivationRule);
  return Object.freeze({ derivationRule });
}

interface TargetSchema {
  readonly derivationRule: LinkHandle;
  readonly identity: LinkHandle;
}

function targetSchema(
  memory: Memory,
  theory: LinkHandle,
  dictionary: LinkHandle,
  premises: readonly LinkHandle[],
  conclusion: LinkHandle,
  admitRule: boolean,
): TargetSchema {
  const rule = defineStructuralRule(memory, dictionary, conclusion);
  if (admitRule) admitStructuralRule(memory, theory, rule);
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

function rootedOccurrence(
  memory: Memory,
  claim: LinkHandle,
  primitiveDerivationRule: LinkHandle,
  dependencies: readonly LinkHandle[],
): LinkHandle {
  const dependencySequence = materializeExactSequence(memory, dependencies);
  const application = memory.ensure(
    primitiveDerivationRule,
    dependencySequence,
  );
  return memory.ensure(claim, application);
}

function rootedProof(
  memory: Memory,
  targetIdentity: LinkHandle,
  targetOccurrence: LinkHandle,
): LinkHandle {
  return memory.ensure(targetIdentity, targetOccurrence);
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
      bindings.map(([source, target]) =>
        memory.ensure(source, target),
      ),
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

  let cursor = memory.ensure(U, R);
  const fresh = (): LinkHandle => {
    cursor = memory.ensure(cursor, R);
    return cursor;
  };

  const theory = memory.ensure(L, U);

  // -----------------------------------------------------------------------
  // N2.1 — grounded relation vocabulary.
  // -----------------------------------------------------------------------

  const relationContext = memory.ensure(O, C);
  const plusContext = memory.ensure(relationContext, fresh());
  const succContext = memory.ensure(relationContext, fresh());
  const natContext = memory.ensure(C, fresh());

  const add = (
    left: LinkHandle,
    right: LinkHandle,
    result: LinkHandle,
  ): LinkHandle =>
    memory.ensure(
      memory.ensure(
        memory.ensure(plusContext, left),
        right,
      ),
      result,
    );

  const succ = (
    value: LinkHandle,
    next: LinkHandle,
  ): LinkHandle =>
    memory.ensure(
      memory.ensure(succContext, value),
      next,
    );

  const nat = (value: LinkHandle): LinkHandle =>
    memory.ensure(natContext, value);

  // -----------------------------------------------------------------------
  // N2.2 — generic Add source laws already available to Theory.
  // -----------------------------------------------------------------------

  const a = fresh();
  const b = fresh();
  const c = fresh();
  const b1 = fresh();
  const c1 = fresh();

  const dBaseSource = defineStructuralRoleDictionary(memory, [a]);
  const dStepSource = defineStructuralRoleDictionary(
    memory,
    [a, b, c, b1, c1],
  );

  const sourceBase = admittedPrimitive(
    memory,
    theory,
    dBaseSource,
    [],
    add(a, U, a),
  );

  const sourceStep = admittedPrimitive(
    memory,
    theory,
    dStepSource,
    [
      add(a, b, c),
      succ(b, b1),
      succ(c, c1),
    ],
    add(a, b1, c1),
  );

  // -----------------------------------------------------------------------
  // N2.3 — target induction coordinates.
  //
  // RESULT:
  //   Nat(n) -> Add(U,n,n)
  //
  // STEP:
  //   Nat(n)
  //   S(n,n1)
  //   Add(U,n,n)
  //   ----------------
  //   Add(U,n1,n1)
  //
  // The primitive Add step itself consumes only Add + S + S. Nat(n) is the
  // induction-domain guard and is intentionally not a primitive Add premise.
  // -----------------------------------------------------------------------

  const n = fresh();
  const n1 = fresh();
  const x = fresh();
  const x1 = fresh();

  const dBase = defineStructuralRoleDictionary(memory, []);
  const dStep = defineStructuralRoleDictionary(memory, [n, n1]);
  const dResult = defineStructuralRoleDictionary(memory, [n]);
  const dAuthority = defineStructuralRoleDictionary(memory, [x, x1]);

  const add000 = add(U, U, U);
  const current = add(U, n, n);
  const transition = succ(n, n1);
  const next = add(U, n1, n1);

  const baseTarget = targetSchema(
    memory,
    theory,
    dBase,
    [],
    add000,
    false,
  );

  const stepTarget = targetSchema(
    memory,
    theory,
    dStep,
    [nat(n), transition, current],
    next,
    false,
  );

  const resultTarget = targetSchema(
    memory,
    theory,
    dResult,
    [nat(n)],
    current,
    true,
  );

  assert(
    memory.find(theory, resultTarget.derivationRule) === undefined,
    "RESULT derivation rule must remain derived, not primitive",
  );

  // -----------------------------------------------------------------------
  // N2.4 — rooted BASE proof from generic Add(A,U,A), A:=U.
  // -----------------------------------------------------------------------

  const baseOccurrence = rootedOccurrence(
    memory,
    add000,
    sourceBase.derivationRule,
    [],
  );
  const baseRoot = rootedProof(
    memory,
    baseTarget.identity,
    baseOccurrence,
  );

  const baseReplay = replayStructuralRootedProofAset(
    memory,
    baseRoot,
  );
  same(baseReplay.conclusion, add000, "BASE conclusion");
  same(baseReplay.declaredAssumptionCount, 0, "BASE assumptions");
  same(baseReplay.usedAssumptionCount, 0, "BASE used assumptions");

  // -----------------------------------------------------------------------
  // N2.5 — guarded STEP proof.
  //
  // Target identity declares three induction assumptions. The primitive Add
  // application consumes the IH plus the same exact successor occurrence
  // twice, because B=C=n and B1=C1=n1 under the left-zero specialization.
  // -----------------------------------------------------------------------

  const natAssumption = memory.ensure(
    nat(n),
    stepTarget.identity,
  );
  const succAssumption = memory.ensure(
    transition,
    stepTarget.identity,
  );
  const ihAssumption = memory.ensure(
    current,
    stepTarget.identity,
  );

  const stepOccurrence = rootedOccurrence(
    memory,
    next,
    sourceStep.derivationRule,
    [
      ihAssumption,
      succAssumption,
      succAssumption,
    ],
  );
  const stepRoot = rootedProof(
    memory,
    stepTarget.identity,
    stepOccurrence,
  );

  const stepReplay = replayStructuralRootedProofAset(
    memory,
    stepRoot,
  );

  same(stepReplay.conclusion, next, "guarded STEP conclusion");
  same(
    stepReplay.declaredAssumptionCount,
    3,
    "guarded STEP declares Nat + S + IH",
  );
  same(
    stepReplay.usedAssumptionCount,
    2,
    "primitive Add occurrence uses S + IH; Nat is domain guard",
  );

  // Ensure the declared Nat guard is really present but not accidentally used
  // as one of the primitive Add dependencies.
  assert(
    natAssumption !== succAssumption &&
      natAssumption !== ihAssumption,
    "Nat guard occurrence is structurally distinct",
  );

  const app = memory.poles(stepOccurrence).end;
  const dependencySequence = memory.poles(app).end;
  const dependencyCarrier = memory.poles(dependencySequence);
  assert(
    dependencyCarrier.start === dependencySequence,
    "dependency carrier remains canonical exact sequence",
  );

  // -----------------------------------------------------------------------
  // N2.6 — generic induction/closure authority.
  // -----------------------------------------------------------------------

  const authority = materializeExactSequence(memory, [
    theory,
    dAuthority,
    U,
    nat(U),
    nat(x),
    succ(x, x1),
    nat(x1),
  ]);
  const authorityAdmission = memory.ensure(theory, authority);

  const authorityMorphism = morphism(
    memory,
    theory,
    dAuthority,
    dStep,
    [
      [x, n],
      [x1, n1],
    ],
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
    U,
    n,
  );

  const evidence = Object.freeze({
    authority,
    authorityAdmission,
    baseRoot,
    stepRoot,
    resultIdentity: resultTarget.identity,
    authorityMorphism,
    currentMorphism,
    nextMorphism,
    baseGrounding,
  });

  const before = memory.linkCount;
  const closure = replayStructuralClosureApplication(
    memory,
    evidence,
  );

  same(closure.theory, theory, "left-zero exact Theory");
  same(
    closure.resultDerivationRule,
    resultTarget.derivationRule,
    "left-zero derived RESULT",
  );
  same(
    closure.resultConclusionTemplate,
    current,
    "left-zero theorem body Add(U,n,n)",
  );
  same(closure.base.conclusion, add000, "closure consumes BASE");
  same(closure.step.conclusion, next, "closure consumes guarded STEP");
  same(memory.linkCount, before, "closure replay is read-only");

  assert(
    memory.find(theory, resultTarget.derivationRule) === undefined,
    "successful closure does not promote RESULT derivation rule",
  );

  // -----------------------------------------------------------------------
  // N2.7 — fail-closed negative controls.
  // -----------------------------------------------------------------------

  const badDomainAuthority = materializeExactSequence(memory, [
    theory,
    dAuthority,
    U,
    nat(U),
    nat(x1),
    succ(x, x1),
    nat(x1),
  ]);
  expectClosureError(
    "invalid-authority",
    () =>
      replayStructuralClosureApplication(memory, {
        ...evidence,
        authority: badDomainAuthority,
        authorityAdmission: memory.ensure(
          theory,
          badDomainAuthority,
        ),
      }),
  );

  const badTransitionAuthority = materializeExactSequence(memory, [
    theory,
    dAuthority,
    U,
    nat(U),
    nat(x),
    succ(x1, x),
    nat(x1),
  ]);
  expectClosureError(
    "step-mismatch",
    () =>
      replayStructuralClosureApplication(memory, {
        ...evidence,
        authority: badTransitionAuthority,
        authorityAdmission: memory.ensure(
          theory,
          badTransitionAuthority,
        ),
      }),
  );

  expectClosureError(
    "invalid-base-grounding",
    () =>
      replayStructuralClosureApplication(memory, {
        ...evidence,
        baseGrounding: grounding(
          memory,
          theory,
          dResult,
          L,
          n,
        ),
      }),
  );

  // Primitive RESULT admission is explicitly forbidden: induction closes the
  // derived theorem and must not be replaced by direct Theory authority.
  memory.ensure(theory, resultTarget.derivationRule);
  expectClosureError(
    "result-primitive-admission",
    () => replayStructuralClosureApplication(memory, evidence),
  );

  console.log([
    "MTS v0.14 N2: NAT_ADD_LEFT_ZERO_CLOSURE=GREEN_RESEARCH",
    "THEOREM=NAT_N_IMPLIES_ADD_U_N_N",
    "BASE=ADD_U_U_U",
    "GUARDED_STEP=NatN_SuccNN1_AddUNN_TO_AddUN1N1",
    "STEP_DECLARED_ASSUMPTIONS=3",
    "STEP_USED_ASSUMPTIONS=2",
    "SUCCESSOR_OCCURRENCE_REUSED=TRUE",
    "NAT_GUARD_IS_DOMAIN_AUTHORITY=TRUE",
    "RESULT_DR_PRIMITIVE_ADMISSION=FORBIDDEN",
    "CLOSURE_REPLAY=READ_ONLY",
    "PRODUCTION_DELTA=NONE",
    "ACCEPTED_V013_MUTATED=FALSE",
  ].join(" "));
}

main();
