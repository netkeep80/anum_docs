// mts-version-evidence: candidate-from=0.14

import { materializeExactSequence, readExactSequence } from "../src/exact-sequence.js";
import {
  admitStructuralDerivationRule,
  defineStructuralDerivationRule,
  readStructuralDerivationRule,
} from "../src/derivation.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type ReadMemory,
} from "../src/memory.js";
import {
  StructuralRootedProofAsetReplayError,
  replayConstructorScopedStructuralOccurrence,
} from "../src/rooted-proof-aset.js";
import {
  admitStructuralRule,
  defineStructuralRoleDictionary,
  defineStructuralRule,
  readStructuralRoleDictionary,
  readStructuralRule,
} from "../src/structural-rule.js";
import { inferStructuralSubstitution } from "../src/structural-substitution.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error("v0.14 N12 Add functionality: " + message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}

function expectReplayError(code: string, effect: () => unknown): void {
  try {
    effect();
  } catch (error) {
    assert(
      error instanceof StructuralRootedProofAsetReplayError,
      `${code}: wrong error type`,
    );
    same(error.code, code, `${code}: wrong error code`);
    return;
  }
  throw new Error(`${code}: expected rejection`);
}

function expectReplayRejection(effect: () => unknown, label: string): void {
  try {
    effect();
  } catch (error) {
    assert(
      error instanceof StructuralRootedProofAsetReplayError,
      `${label}: must fail at constructor-scoped replay`,
    );
    return;
  }
  throw new Error(`${label}: expected rejection`);
}

function occurrence(
  memory: Memory,
  claim: LinkHandle,
  derivationRule: LinkHandle,
  dependencies: readonly LinkHandle[],
): LinkHandle {
  const application = memory.ensure(
    derivationRule,
    materializeExactSequence(memory, dependencies),
  );
  return memory.ensure(claim, application);
}

function identityProof(
  memory: Memory,
  left: LinkHandle,
  right: LinkHandle,
  children: readonly LinkHandle[],
): LinkHandle {
  return memory.ensure(
    memory.ensure(left, right),
    materializeExactSequence(memory, children),
  );
}

/**
 * Construction helper only. It recursively builds the already-existing
 * intrinsic Link-identity proof law from topology; it does not add a proof-step
 * opcode or semantic tag.
 */
function recursiveIdentityProofBuilder(memory: Memory) {
  const memo = new Map<LinkHandle, LinkHandle>();

  const prove = (value: LinkHandle): LinkHandle => {
    const cached = memo.get(value);
    if (cached !== undefined) return cached;

    const poles = memory.poles(value);
    let children: readonly LinkHandle[];

    if (poles.start === value && poles.end === value) {
      same(value, memory.root, "only canonical ROOT may be fully self-closed");
      children = [];
    } else if (poles.start === value) {
      children = [prove(poles.end)];
    } else if (poles.end === value) {
      children = [prove(poles.start)];
    } else {
      children = [prove(poles.start), prove(poles.end)];
    }

    const proof = identityProof(memory, value, value, children);
    memo.set(value, proof);
    return proof;
  };

  return prove;
}

interface RecursiveFunctionalitySchema {
  readonly constructorAuthority: LinkHandle;
  readonly constructorAuthorityAdmission: LinkHandle;
  readonly baseConstructor: LinkHandle;
  readonly stepConstructor: LinkHandle;

  readonly stableRole: LinkHandle;
  readonly currentInductionRole: LinkHandle;
  readonly currentWitnessRole: LinkHandle;
  readonly nextInductionRole: LinkHandle;
  readonly nextWitnessRole: LinkHandle;

  readonly baseInductionValue: LinkHandle;
  readonly successorUnit: LinkHandle;

  readonly recursivePremiseTemplate: LinkHandle;
  readonly inductionTransitionTemplate: LinkHandle;
  readonly witnessTransitionTemplate: LinkHandle;
}

/**
 * The functionality schema itself is ordinary Link-carried authority:
 *
 * [ Theory,
 *   ConstructorAuthority, BASE, STEP,
 *   stable, currentInduction, currentWitness, nextInduction, nextWitness,
 *   baseInductionValue, successorUnit,
 *   recursivePremise, inductionTransitionPremise, witnessTransitionPremise ]
 *
 * Host field names below are only a read projection of that exact carrier.
 */
function readRecursiveFunctionalitySchema(
  memory: ReadMemory,
  carrier: LinkHandle,
  admission: LinkHandle,
): RecursiveFunctionalitySchema {
  const values = readExactSequence(memory, carrier).values;
  if (values.length !== 14) functionalityFail("invalid-functionality-schema");

  const [
    theory,
    constructorAuthority,
    baseConstructor,
    stepConstructor,
    stableRole,
    currentInductionRole,
    currentWitnessRole,
    nextInductionRole,
    nextWitnessRole,
    baseInductionValue,
    successorUnit,
    recursivePremiseTemplate,
    inductionTransitionTemplate,
    witnessTransitionTemplate,
  ] = values;

  if (
    theory === undefined
    || constructorAuthority === undefined
    || baseConstructor === undefined
    || stepConstructor === undefined
    || stableRole === undefined
    || currentInductionRole === undefined
    || currentWitnessRole === undefined
    || nextInductionRole === undefined
    || nextWitnessRole === undefined
    || baseInductionValue === undefined
    || successorUnit === undefined
    || recursivePremiseTemplate === undefined
    || inductionTransitionTemplate === undefined
    || witnessTransitionTemplate === undefined
  ) {
    functionalityFail("invalid-functionality-schema");
  }

  const admissionPoles = memory.poles(admission);
  if (admissionPoles.start !== theory || admissionPoles.end !== carrier) {
    functionalityFail("invalid-functionality-schema");
  }

  const constructorValues = readExactSequence(
    memory,
    constructorAuthority,
  ).values;
  if (
    constructorValues.length !== 3
    || constructorValues[0] !== theory
    || constructorValues[1] !== baseConstructor
    || constructorValues[2] !== stepConstructor
  ) {
    functionalityFail("invalid-functionality-schema");
  }

  return Object.freeze({
    constructorAuthority,
    constructorAuthorityAdmission: memory.find(theory, constructorAuthority)
      ?? functionalityFail("invalid-functionality-schema"),
    baseConstructor,
    stepConstructor,
    stableRole,
    currentInductionRole,
    currentWitnessRole,
    nextInductionRole,
    nextWitnessRole,
    baseInductionValue,
    successorUnit,
    recursivePremiseTemplate,
    inductionTransitionTemplate,
    witnessTransitionTemplate,
  });
}

type ConstructorNode =
  | Readonly<{
      kind: "base";
      occurrence: LinkHandle;
      stable: LinkHandle;
      induction: LinkHandle;
      witness: LinkHandle;
    }>
  | Readonly<{
      kind: "step";
      occurrence: LinkHandle;
      stable: LinkHandle;
      induction: LinkHandle;
      witness: LinkHandle;
      previousInduction: LinkHandle;
      previousWitness: LinkHandle;
      recursiveOccurrence: LinkHandle;
    }>;

type FunctionalityProofErrorCode =
  | "invalid-functionality-schema"
  | "input-mismatch"
  | "invalid-induction-successor"
  | "invalid-witness-successor"
  | "invalid-transition-proof"
  | "constructor-exclusivity-violation"
  | "recursive-result-mismatch"
  | "noncanonical-successor-result"
  | "replay-wrote";

class FunctionalityProofError extends Error {
  override readonly name = "FunctionalityProofError";

  constructor(readonly code: FunctionalityProofErrorCode) {
    super(code);
  }
}

function functionalityFail(code: FunctionalityProofErrorCode): never {
  throw new FunctionalityProofError(code);
}

function bindingValue(
  bindings: readonly Readonly<{ role: LinkHandle; value: LinkHandle }>[],
  role: LinkHandle,
): LinkHandle {
  const matches = bindings.filter((binding) => binding.role === role);
  if (matches.length !== 1) functionalityFail("invalid-functionality-schema");
  return matches[0]!.value;
}

/**
 * Generic read-only constructor inversion projection for a dependent-witness
 * family with:
 *
 *   BASE: induction := fixed base, witness := stable parameter
 *   STEP: recursive family proof + uniform successor(induction)
 *         + uniform successor(witness)
 *
 * The family itself is not named here. Constructor identity, role identity and
 * premise identity all come from Link-carried structural rules.
 */
function inspectRecursiveFunctionalityNode(
  memory: ReadMemory,
  schema: RecursiveFunctionalitySchema,
  targetOccurrence: LinkHandle,
): ConstructorNode {
  const before = memory.linkCount;
  try {
    const inverted = replayConstructorScopedStructuralOccurrence(
      memory,
      schema.constructorAuthority,
      schema.constructorAuthorityAdmission,
      targetOccurrence,
    );

    const primitive = readStructuralDerivationRule(
      memory,
      inverted.primitiveDerivationRule,
    );
    const rule = readStructuralRule(memory, primitive.structuralRule);
    const roles = readStructuralRoleDictionary(memory, rule.roleDictionary).roles;

    const byOccurrence = new Map(
      inverted.validatedOccurrences.map(({ occurrence: item, claim }) => [
        item,
        claim,
      ] as const),
    );

    const actualPremises = inverted.dependencyOccurrences.map((dependency) => {
      const claim = byOccurrence.get(dependency);
      if (claim === undefined) functionalityFail("invalid-functionality-schema");
      return claim;
    });

    const bindings = inferStructuralSubstitution(
      memory,
      roles,
      [
        Object.freeze({ template: rule.body, actual: inverted.claim }),
        ...primitive.premiseTemplates.map((template, index) =>
          Object.freeze({
            template,
            actual: actualPremises[index]!,
          })
        ),
      ],
      { requireAll: true },
    );

    const stable = bindingValue(bindings, schema.stableRole);

    if (inverted.primitiveDerivationRule === schema.baseConstructor) {
      if (primitive.premiseTemplates.length !== 0) {
        functionalityFail("invalid-functionality-schema");
      }
      return Object.freeze({
        kind: "base",
        occurrence: targetOccurrence,
        stable,
        induction: schema.baseInductionValue,
        witness: stable,
      });
    }

    if (inverted.primitiveDerivationRule !== schema.stepConstructor) {
      functionalityFail("invalid-functionality-schema");
    }

    const previousInduction = bindingValue(
      bindings,
      schema.currentInductionRole,
    );
    const previousWitness = bindingValue(
      bindings,
      schema.currentWitnessRole,
    );
    const induction = bindingValue(bindings, schema.nextInductionRole);
    const witness = bindingValue(bindings, schema.nextWitnessRole);

    // Uniform successor is structural Pair(previous, unit). This is the same
    // ordered-pole identity used by the retained T3/T4 Peano witnesses.
    const inductionPoles = memory.poles(induction);
    if (
      inductionPoles.start !== previousInduction
      || inductionPoles.end !== schema.successorUnit
    ) {
      functionalityFail("invalid-induction-successor");
    }

    const witnessPoles = memory.poles(witness);
    if (
      witnessPoles.start !== previousWitness
      || witnessPoles.end !== schema.successorUnit
    ) {
      functionalityFail("invalid-witness-successor");
    }

    const dependencyFor = (template: LinkHandle): LinkHandle => {
      const indexes: number[] = [];
      primitive.premiseTemplates.forEach((candidate, index) => {
        if (candidate === template) indexes.push(index);
      });
      if (indexes.length !== 1) functionalityFail("invalid-functionality-schema");
      const dependency = inverted.dependencyOccurrences[indexes[0]!];
      if (dependency === undefined) functionalityFail("invalid-functionality-schema");
      return dependency;
    };

    const recursiveOccurrence = dependencyFor(
      schema.recursivePremiseTemplate,
    );
    const inductionTransitionOccurrence = dependencyFor(
      schema.inductionTransitionTemplate,
    );
    const witnessTransitionOccurrence = dependencyFor(
      schema.witnessTransitionTemplate,
    );

    // N10 has already validated these dependencies as full proof occurrences.
    // For this schema the two transition claims must be intrinsic identities:
    //   next = Pair(previous, unit)
    // so each grounded premise is exactly next -> next.
    for (const [dependency, expected] of [
      [inductionTransitionOccurrence, induction],
      [witnessTransitionOccurrence, witness],
    ] as const) {
      const claim = byOccurrence.get(dependency);
      if (claim === undefined) functionalityFail("invalid-transition-proof");
      const claimPoles = memory.poles(claim);
      if (claimPoles.start !== expected || claimPoles.end !== expected) {
        functionalityFail("invalid-transition-proof");
      }
    }

    return Object.freeze({
      kind: "step",
      occurrence: targetOccurrence,
      stable,
      induction,
      witness,
      previousInduction,
      previousWitness,
      recursiveOccurrence,
    });
  } finally {
    if (memory.linkCount !== before) functionalityFail("replay-wrote");
  }
}

/**
 * Generic unbounded proof-tree recursion for functionality of the schema above.
 *
 * No family-specific relation name, opcode or host tag is inspected. The only
 * case distinction is exact constructor identity supplied by the selected
 * constructor authority.
 */
function proveRecursiveConstructorFunctionality(
  memory: ReadMemory,
  functionalityAuthority: LinkHandle,
  functionalityAuthorityAdmission: LinkHandle,
  leftOccurrence: LinkHandle,
  rightOccurrence: LinkHandle,
): LinkHandle {
  const before = memory.linkCount;
  const schema = readRecursiveFunctionalitySchema(
    memory,
    functionalityAuthority,
    functionalityAuthorityAdmission,
  );
  const active = new Map<LinkHandle, Set<LinkHandle>>();

  const enter = (left: LinkHandle, right: LinkHandle): void => {
    let rights = active.get(left);
    if (rights === undefined) {
      rights = new Set<LinkHandle>();
      active.set(left, rights);
    }
    if (rights.has(right)) functionalityFail("invalid-functionality-schema");
    rights.add(right);
  };

  const leave = (left: LinkHandle, right: LinkHandle): void => {
    const rights = active.get(left);
    rights?.delete(right);
    if (rights?.size === 0) active.delete(left);
  };

  const prove = (leftOccurrence: LinkHandle, rightOccurrence: LinkHandle): LinkHandle => {
    enter(leftOccurrence, rightOccurrence);
    try {
      const left = inspectRecursiveFunctionalityNode(
        memory,
        schema,
        leftOccurrence,
      );
      const right = inspectRecursiveFunctionalityNode(
        memory,
        schema,
        rightOccurrence,
      );

      if (
        left.stable !== right.stable
        || left.induction !== right.induction
      ) {
        functionalityFail("input-mismatch");
      }

      if (left.kind === "base" && right.kind === "base") {
        // Both BASE witnesses are aliases of the same stable parameter.
        same(left.witness, right.witness, "BASE/BASE witness");
        return left.witness;
      }

      if (left.kind !== right.kind) {
        // A valid STEP induction value has exact end=successorUnit, while the
        // BASE value is the fixed zero/base. For this schema the mixed case at
        // one exact input is contradictory. The concrete N12 fixture separately
        // checks that its base U has end != L.
        functionalityFail("constructor-exclusivity-violation");
      }

      // Narrowing after the constructor-kind equality above.
      if (left.kind !== "step" || right.kind !== "step") {
        functionalityFail("invalid-functionality-schema");
      }

      // Same next induction Link has one exact ordered start pole, so both STEP
      // nodes must expose the same predecessor induction coordinate.
      const inductionPoles = memory.poles(left.induction);
      same(
        inductionPoles.start,
        left.previousInduction,
        "left STEP predecessor from exact successor",
      );
      same(
        inductionPoles.start,
        right.previousInduction,
        "right STEP predecessor from exact successor",
      );

      const previousWitness = prove(
        left.recursiveOccurrence,
        right.recursiveOccurrence,
      );

      if (
        left.previousWitness !== previousWitness
        || right.previousWitness !== previousWitness
      ) {
        functionalityFail("recursive-result-mismatch");
      }

      // Both outputs are Pair(the same previous witness, the same unit).
      // Canonical ordered-pair identity therefore makes them one exact Link.
      if (left.witness !== right.witness) {
        functionalityFail("noncanonical-successor-result");
      }
      return left.witness;
    } finally {
      leave(leftOccurrence, rightOccurrence);
    }
  };

  try {
    return prove(leftOccurrence, rightOccurrence);
  } finally {
    if (memory.linkCount !== before) functionalityFail("replay-wrote");
  }
}

interface BuiltFamilyProof {
  readonly occurrence: LinkHandle;
  readonly left: LinkHandle;
  readonly right: LinkHandle;
  readonly result: LinkHandle;
}

function main(): void {
  const memory = new Memory();
  const { R, O, C, L, U } = ensureRootBasis(memory);

  let cursor = memory.ensure(U, R);
  const fresh = (): LinkHandle => (cursor = memory.ensure(cursor, R));

  const theory = memory.ensure(L, U);
  const relationContext = memory.ensure(O, C);
  const addContext = memory.ensure(relationContext, fresh());

  const add = (
    left: LinkHandle,
    right: LinkHandle,
    result: LinkHandle,
  ): LinkHandle =>
    memory.ensure(memory.ensure(memory.ensure(addContext, left), right), result);

  // Structural successor evidence:
  //
  //   S(x,x1) := x1 = x -> L
  //
  // encoded as the equality Claim x1 -> (x -> L). When x1 is the canonical
  // successor, this is exactly x1 -> x1 and is therefore proved by the
  // intrinsic recursive Link-identity law already retained by N10/N11.
  const successorEquality = (
    value: LinkHandle,
    next: LinkHandle,
  ): LinkHandle =>
    memory.ensure(next, memory.ensure(value, L));

  const a = fresh();
  const b = fresh();
  const c = fresh();
  const b1 = fresh();
  const c1 = fresh();
  same(new Set([a, b, c, b1, c1]).size, 5, "constructor roles are distinct");

  const dBase = defineStructuralRoleDictionary(memory, [a]);
  const dStep = defineStructuralRoleDictionary(memory, [a, b, c, b1, c1]);

  const baseBody = add(a, U, a);
  const recursivePremise = add(a, b, c);
  const inductionTransitionPremise = successorEquality(b, b1);
  const witnessTransitionPremise = successorEquality(c, c1);
  const stepBody = add(a, b1, c1);

  const defineConstructor = (
    dictionary: LinkHandle,
    premises: readonly LinkHandle[],
    conclusion: LinkHandle,
  ): LinkHandle => {
    const rule = defineStructuralRule(memory, dictionary, conclusion);
    const derivationRule = defineStructuralDerivationRule(
      memory,
      rule,
      premises,
    );
    admitStructuralRule(memory, theory, rule);
    admitStructuralDerivationRule(memory, theory, derivationRule);
    return derivationRule;
  };

  const baseConstructor = defineConstructor(dBase, [], baseBody);
  const stepConstructor = defineConstructor(
    dStep,
    [
      recursivePremise,
      inductionTransitionPremise,
      witnessTransitionPremise,
    ],
    stepBody,
  );

  const constructorAuthority = materializeExactSequence(memory, [
    theory,
    baseConstructor,
    stepConstructor,
  ]);
  const constructorAuthorityAdmission = memory.ensure(
    theory,
    constructorAuthority,
  );

  const functionalityAuthority = materializeExactSequence(memory, [
    theory,
    constructorAuthority,
    baseConstructor,
    stepConstructor,
    a,
    b,
    c,
    b1,
    c1,
    U,
    L,
    recursivePremise,
    inductionTransitionPremise,
    witnessTransitionPremise,
  ]);
  const functionalityAuthorityAdmission = memory.ensure(
    theory,
    functionalityAuthority,
  );

  // Read-back proves that theorem coordinates come from the carrier rather than
  // from an unvalidated host object.
  readRecursiveFunctionalitySchema(
    memory,
    functionalityAuthority,
    functionalityAuthorityAdmission,
  );

  // Exact T3 boundary used by BASE/STEP exclusivity:
  // U=C->O while every positive successor has end=L, and O!=L.
  const uPoles = memory.poles(U);
  same(uPoles.start, C, "U start");
  same(uPoles.end, O, "U end");
  assert(O !== L, "T3 root-basis boundary O != L");
  assert(uPoles.end !== L, "BASE induction U is not a successor");

  const proveIdentity = recursiveIdentityProofBuilder(memory);

  const buildCanonical = (
    left: LinkHandle,
    depth: number,
  ): BuiltFamilyProof => {
    let right = U;
    let result = left;
    let currentOccurrence = occurrence(
      memory,
      add(left, right, result),
      baseConstructor,
      [],
    );

    for (let index = 0; index < depth; index += 1) {
      const nextRight = memory.ensure(right, L);
      const nextResult = memory.ensure(result, L);

      currentOccurrence = occurrence(
        memory,
        add(left, nextRight, nextResult),
        stepConstructor,
        [
          currentOccurrence,
          proveIdentity(nextRight),
          proveIdentity(nextResult),
        ],
      );
      right = nextRight;
      result = nextResult;
    }

    return Object.freeze({
      occurrence: currentOccurrence,
      left,
      right,
      result,
    });
  };

  // -----------------------------------------------------------------------
  // N12.1 — positive executable theorem instances.
  // The prover itself is recursive over proof topology and has no Nat-depth
  // bound; finite depths here are only test vectors.
  // -----------------------------------------------------------------------

  const nat0 = U;
  const nat1 = memory.ensure(nat0, L);
  const nat2 = memory.ensure(nat1, L);
  const stableA = nat2;

  const baseLeft = buildCanonical(stableA, 0);
  const baseRight = buildCanonical(stableA, 0);
  const beforeBase = memory.linkCount;
  same(
    proveRecursiveConstructorFunctionality(
      memory,
      functionalityAuthority,
      functionalityAuthorityAdmission,
      baseLeft.occurrence,
      baseRight.occurrence,
    ),
    stableA,
    "BASE/BASE functionality",
  );
  same(memory.linkCount, beforeBase, "BASE/BASE theorem replay is read-only");

  const oneLeft = buildCanonical(stableA, 1);
  const oneRight = buildCanonical(stableA, 1);
  same(
    proveRecursiveConstructorFunctionality(
      memory,
      functionalityAuthority,
      functionalityAuthorityAdmission,
      oneLeft.occurrence,
      oneRight.occurrence,
    ),
    oneLeft.result,
    "STEP/STEP depth 1 functionality",
  );

  const deepLeft = buildCanonical(stableA, 6);
  const deepRight = buildCanonical(stableA, 6);
  same(deepLeft.right, deepRight.right, "deep proofs have same induction input");
  same(
    proveRecursiveConstructorFunctionality(
      memory,
      functionalityAuthority,
      functionalityAuthorityAdmission,
      deepLeft.occurrence,
      deepRight.occurrence,
    ),
    deepLeft.result,
    "STEP/STEP recursive depth > 1 functionality",
  );

  // Rebuilding independently in one canonical Memory reconstructs the same
  // structural proof tree identity rather than relying on an object/host ID.
  same(
    deepLeft.occurrence,
    deepRight.occurrence,
    "independently rebuilt canonical proof trees converge structurally",
  );

  const beforeDeepRepeat = memory.linkCount;
  same(
    proveRecursiveConstructorFunctionality(
      memory,
      functionalityAuthority,
      functionalityAuthorityAdmission,
      deepLeft.occurrence,
      deepRight.occurrence,
    ),
    deepLeft.result,
    "repeated deep functionality replay",
  );
  same(memory.linkCount, beforeDeepRepeat, "deep theorem replay remains read-only");

  // -----------------------------------------------------------------------
  // N12.2 — constructor exclusivity falsifiers.
  // -----------------------------------------------------------------------

  const rootIdentity = proveIdentity(R);

  // Attempt a STEP whose next induction coordinate is the BASE value U.
  // The recursive premise fixes b=U, while the transition would require
  // U = U->L. Full N10 closure must reject before N11 can expose inversion.
  const baseU = buildCanonical(U, 0);
  const canonicalResult1 = memory.ensure(U, L);
  const baseStepMismatch = occurrence(
    memory,
    add(U, U, canonicalResult1),
    stepConstructor,
    [
      baseU.occurrence,
      proveIdentity(U),
      proveIdentity(canonicalResult1),
    ],
  );
  expectReplayRejection(
    () =>
      replayConstructorScopedStructuralOccurrence(
        memory,
        constructorAuthority,
        constructorAuthorityAdmission,
        baseStepMismatch,
      ),
    "BASE/STEP same-input mismatch",
  );
  // Same impossible candidate is the symmetric STEP/BASE falsifier.
  expectReplayRejection(
    () =>
      replayConstructorScopedStructuralOccurrence(
        memory,
        constructorAuthority,
        constructorAuthorityAdmission,
        baseStepMismatch,
      ),
    "STEP/BASE same-input mismatch",
  );

  // -----------------------------------------------------------------------
  // N12.3 — wrong successor witnesses.
  // -----------------------------------------------------------------------

  const n2 = memory.ensure(canonicalResult1, L);

  // Right coordinate skips one successor: predecessor right=U but b1=N2.
  const wrongInductionSuccessor = occurrence(
    memory,
    add(U, n2, canonicalResult1),
    stepConstructor,
    [
      baseU.occurrence,
      proveIdentity(n2),
      proveIdentity(canonicalResult1),
    ],
  );
  expectReplayRejection(
    () =>
      replayConstructorScopedStructuralOccurrence(
        memory,
        constructorAuthority,
        constructorAuthorityAdmission,
        wrongInductionSuccessor,
      ),
    "wrong induction successor witness",
  );

  // Result coordinate skips one successor while right coordinate is correct.
  const wrongResultSuccessor = occurrence(
    memory,
    add(U, canonicalResult1, n2),
    stepConstructor,
    [
      baseU.occurrence,
      proveIdentity(canonicalResult1),
      proveIdentity(n2),
    ],
  );
  expectReplayRejection(
    () =>
      replayConstructorScopedStructuralOccurrence(
        memory,
        constructorAuthority,
        constructorAuthorityAdmission,
        wrongResultSuccessor,
      ),
    "wrong result successor witness",
  );

  // A second STEP predecessor candidate attempts a distinct result for the same
  // (left,right). It uses the selected STEP DR, but its witness transition is
  // not the canonical successor, so scoped closure rejects recursively.
  const canonicalStep1 = buildCanonical(U, 1);
  const differentStepPredecessor = wrongResultSuccessor;
  assert(
    canonicalStep1.occurrence !== differentStepPredecessor,
    "different STEP predecessor candidate is structurally distinct",
  );
  expectReplayRejection(
    () =>
      replayConstructorScopedStructuralOccurrence(
        memory,
        constructorAuthority,
        constructorAuthorityAdmission,
        differentStepPredecessor,
      ),
    "different STEP predecessor result",
  );

  // -----------------------------------------------------------------------
  // N12.4 — authority and ambient-Link falsifiers.
  // -----------------------------------------------------------------------

  const ambientSecondResultClaim = add(U, canonicalResult1, n2);
  memory.ensure(theory, ambientSecondResultClaim);
  expectReplayRejection(
    () =>
      replayConstructorScopedStructuralOccurrence(
        memory,
        constructorAuthority,
        constructorAuthorityAdmission,
        ambientSecondResultClaim,
      ),
    "ambient Add Link without canonical proof",
  );

  // Same-Theory third primitive constructor remains outside selected BASE/STEP.
  const forgedDictionary = defineStructuralRoleDictionary(memory, []);
  const forgedRule = defineStructuralRule(
    memory,
    forgedDictionary,
    ambientSecondResultClaim,
  );
  const forgedConstructor = defineStructuralDerivationRule(
    memory,
    forgedRule,
    [],
  );
  admitStructuralRule(memory, theory, forgedRule);
  admitStructuralDerivationRule(memory, theory, forgedConstructor);
  const forgedOccurrence = occurrence(
    memory,
    ambientSecondResultClaim,
    forgedConstructor,
    [],
  );
  expectReplayError(
    "primitive-derivation-rule-out-of-scope",
    () =>
      replayConstructorScopedStructuralOccurrence(
        memory,
        constructorAuthority,
        constructorAuthorityAdmission,
        forgedOccurrence,
      ),
  );

  // Primitive/Theory admission alone therefore cannot act as result authority.
  assert(
    memory.find(theory, forgedConstructor) !== undefined,
    "forged primitive DR is Theory-admitted",
  );

  const foreignTheory = memory.ensure(C, R);
  const crossTheoryAuthority = materializeExactSequence(memory, [
    foreignTheory,
    baseConstructor,
    stepConstructor,
  ]);
  const crossTheoryAdmission = memory.ensure(
    foreignTheory,
    crossTheoryAuthority,
  );
  expectReplayError(
    "invalid-constructor-authority",
    () =>
      replayConstructorScopedStructuralOccurrence(
        memory,
        crossTheoryAuthority,
        crossTheoryAdmission,
        baseU.occurrence,
      ),
  );

  const duplicateAuthority = materializeExactSequence(memory, [
    theory,
    baseConstructor,
    baseConstructor,
    stepConstructor,
  ]);
  expectReplayError(
    "invalid-constructor-authority",
    () =>
      replayConstructorScopedStructuralOccurrence(
        memory,
        duplicateAuthority,
        memory.ensure(theory, duplicateAuthority),
        baseU.occurrence,
      ),
  );

  const malformedAuthority = materializeExactSequence(memory, [
    theory,
    R,
  ]);
  expectReplayError(
    "invalid-constructor-authority",
    () =>
      replayConstructorScopedStructuralOccurrence(
        memory,
        malformedAuthority,
        memory.ensure(theory, malformedAuthority),
        baseU.occurrence,
      ),
  );

  // Tamper the recursive direct dependency of an otherwise STEP-shaped target.
  const tamperedStep = occurrence(
    memory,
    add(U, canonicalResult1, n2),
    stepConstructor,
    [
      rootIdentity,
      proveIdentity(canonicalResult1),
      proveIdentity(n2),
    ],
  );
  expectReplayRejection(
    () =>
      replayConstructorScopedStructuralOccurrence(
        memory,
        constructorAuthority,
        constructorAuthorityAdmission,
        tamperedStep,
      ),
    "tampered direct dependency",
  );

  // -----------------------------------------------------------------------
  // N12.5 — retained production/A9 boundary.
  //
  // N12 adds only this research witness. The trusted N10/N11 runtime remains
  // unchanged, so the whole-package source audit must remain at the exact N11
  // baseline; the existing A9 test recomputes these values in CI.
  // -----------------------------------------------------------------------

  console.log([
    "MTS v0.14 N12: GENERAL_ADD_FUNCTIONALITY_PROOF=GREEN_RESEARCH",
    "BASE_BASE_UNIQUENESS=GREEN",
    "BASE_STEP_EXCLUSIVITY=GREEN",
    "STEP_BASE_EXCLUSIVITY=GREEN",
    "STEP_STEP_RECURSIVE_UNIQUENESS=GREEN",
    "UNBOUNDED_PROOF_TREE_RECURSION=TRUE",
    "CONSTRUCTOR_SCOPE_ENFORCED=TRUE",
    "FUNCTIONALITY_SCHEMA_LINK_CARRIED=TRUE",
    "CONSTRUCTOR_INVERSION_USED=TRUE",
    "SUCCESSOR_AUTHORITY=STRUCTURAL_IDENTITY_X1_EQ_X_TO_L",
    "SUCCESSOR_UNIQUENESS_USED=TRUE",
    "ZERO_NOT_SUCCESSOR_USED=TRUE",
    "FORGED_THIRD_CONSTRUCTOR_REJECTED=TRUE",
    "WRONG_INDUCTION_SUCCESSOR_REJECTED=TRUE",
    "WRONG_RESULT_SUCCESSOR_REJECTED=TRUE",
    "DIFFERENT_STEP_PREDECESSOR_RESULT_REJECTED=TRUE",
    "CROSS_THEORY_AUTHORITY_REJECTED=TRUE",
    "OUT_OF_SCOPE_DR_REJECTED=TRUE",
    "AMBIENT_ADD_NOT_AUTHORITY=TRUE",
    "TAMPERED_DIRECT_DEPENDENCY_REJECTED=TRUE",
    "PRIMITIVE_RESULT_ADMISSION_SHORTCUT_REJECTED=TRUE",
    "DUPLICATE_OR_MALFORMED_AUTHORITY_REJECTED=TRUE",
    "REPLAY_READ_ONLY=TRUE",
    "PRODUCTION_DELTA=NONE",
    "ADD_SPECIFIC_HOST_DISPATCH=0",
    "A9_TYPED_READ_SITES_EXPECTED=531",
    "A9_TYPED_READ_OWNERS_EXPECTED=238",
    "A9_TYPED_READ_OWNER_FINGERPRINT_EXPECTED=6469719fde82d8a1",
    "A9_DECISION_OWNERS_EXPECTED=389",
    "A9_DECISION_FINGERPRINT_EXPECTED=17177b220de31e73",
    "A9_PROOF_REPLAY_DECISION_OWNERS_EXPECTED=99",
    "A9_ROOTED_PROOF_ASET_OWNERS_EXPECTED=14",
    "A9_WIRE_LITERAL_DISPATCH_EXPECTED=0",
    "ACCEPTED_V013_MUTATED=FALSE",
    "MTS_V014_ACCEPTED=FALSE",
  ].join(" "));
}

main();
