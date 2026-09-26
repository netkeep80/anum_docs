// mts-version-evidence: candidate-from=0.14
import { materializeExactSequence, readExactSequence } from "../src/exact-sequence.js";
import {
  admitStructuralDerivationRule, defineStructuralDerivationRule,
  readStructuralDerivationRule,
} from "../src/derivation.js";
import {
  Memory, ensureRootBasis, type LinkHandle, type ReadMemory,
} from "../src/memory.js";
import {
  StructuralRootedProofAsetReplayError,
  replayConstructorScopedStructuralOccurrence,
} from "../src/rooted-proof-aset.js";
import {
  admitStructuralRule, defineStructuralRoleDictionary, defineStructuralRule,
  readStructuralRoleDictionary, readStructuralRule,
} from "../src/structural-rule.js";
import { inferStructuralSubstitution } from "../src/structural-substitution.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error("v0.14 N12 Add functionality: " + message);
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}
function expectReplayError(code: string, effect: () => unknown): void {
  try { effect(); } catch (error) {
    assert(error instanceof StructuralRootedProofAsetReplayError, `${code}: wrong error type`);
    same(error.code, code, `${code}: wrong error code`);
    return;
  }
  throw new Error(`${code}: expected rejection`);
}
function expectReplayRejection(effect: () => unknown, label: string): void {
  try { effect(); } catch (error) {
    assert(error instanceof StructuralRootedProofAsetReplayError,
      `${label}: must fail at constructor-scoped replay`);
    return;
  }
  throw new Error(`${label}: expected rejection`);
}
function occurrence(
  memory: Memory, claim: LinkHandle, derivationRule: LinkHandle,
  dependencies: readonly LinkHandle[],
): LinkHandle {
  return memory.ensure(claim, memory.ensure(
    derivationRule, materializeExactSequence(memory, dependencies),
  ));
}
function identityProof(
  memory: Memory, left: LinkHandle, right: LinkHandle,
  children: readonly LinkHandle[],
): LinkHandle {
  return memory.ensure(
    memory.ensure(left, right), materializeExactSequence(memory, children),
  );
}
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
    } else if (poles.start === value) children = [prove(poles.end)];
    else if (poles.end === value) children = [prove(poles.start)];
    else children = [prove(poles.start), prove(poles.end)];
    const proof = identityProof(memory, value, value, children);
    memo.set(value, proof);
    return proof;
  };
  return prove;
}

type FunctionalityProofErrorCode =
  | "invalid-functionality-schema" | "input-mismatch"
  | "invalid-induction-successor" | "invalid-witness-successor"
  | "invalid-transition-proof" | "constructor-exclusivity-violation"
  | "recursive-result-mismatch" | "noncanonical-successor-result"
  | "replay-wrote";
class FunctionalityProofError extends Error {
  override readonly name = "FunctionalityProofError";
  constructor(readonly code: FunctionalityProofErrorCode) { super(code); }
}
function functionalityFail(code: FunctionalityProofErrorCode): never {
  throw new FunctionalityProofError(code);
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
function readRecursiveFunctionalitySchema(
  memory: ReadMemory, carrier: LinkHandle, admission: LinkHandle,
): RecursiveFunctionalitySchema {
  const values = readExactSequence(memory, carrier).values;
  if (values.length !== 14) functionalityFail("invalid-functionality-schema");
  const [
    theory, constructorAuthority, baseConstructor, stepConstructor,
    stableRole, currentInductionRole, currentWitnessRole,
    nextInductionRole, nextWitnessRole, baseInductionValue, successorUnit,
    recursivePremiseTemplate, inductionTransitionTemplate,
    witnessTransitionTemplate,
  ] = values;
  if (
    theory === undefined || constructorAuthority === undefined
    || baseConstructor === undefined || stepConstructor === undefined
    || stableRole === undefined || currentInductionRole === undefined
    || currentWitnessRole === undefined || nextInductionRole === undefined
    || nextWitnessRole === undefined || baseInductionValue === undefined
    || successorUnit === undefined || recursivePremiseTemplate === undefined
    || inductionTransitionTemplate === undefined
    || witnessTransitionTemplate === undefined
  ) functionalityFail("invalid-functionality-schema");
  const admissionPoles = memory.poles(admission);
  if (admissionPoles.start !== theory || admissionPoles.end !== carrier) {
    functionalityFail("invalid-functionality-schema");
  }
  const constructors = readExactSequence(memory, constructorAuthority).values;
  if (
    constructors.length !== 3 || constructors[0] !== theory
    || constructors[1] !== baseConstructor || constructors[2] !== stepConstructor
  ) functionalityFail("invalid-functionality-schema");
  const constructorAuthorityAdmission = memory.find(theory, constructorAuthority);
  if (constructorAuthorityAdmission === undefined) {
    functionalityFail("invalid-functionality-schema");
  }
  return Object.freeze({
    constructorAuthority, constructorAuthorityAdmission,
    baseConstructor, stepConstructor, stableRole, currentInductionRole,
    currentWitnessRole, nextInductionRole, nextWitnessRole,
    baseInductionValue, successorUnit, recursivePremiseTemplate,
    inductionTransitionTemplate, witnessTransitionTemplate,
  });
}
function bindingValue(
  bindings: readonly Readonly<{ role: LinkHandle; value: LinkHandle }>[],
  role: LinkHandle,
): LinkHandle {
  const matches = bindings.filter((binding) => binding.role === role);
  if (matches.length !== 1) functionalityFail("invalid-functionality-schema");
  return matches[0]!.value;
}

type ConstructorNode =
  | Readonly<{
      kind: "base"; stable: LinkHandle; induction: LinkHandle;
      witness: LinkHandle;
    }>
  | Readonly<{
      kind: "step"; stable: LinkHandle; induction: LinkHandle;
      witness: LinkHandle; previousInduction: LinkHandle;
      previousWitness: LinkHandle; recursiveOccurrence: LinkHandle;
    }>;

function inspectRecursiveFunctionalityNode(
  memory: ReadMemory, schema: RecursiveFunctionalitySchema,
  targetOccurrence: LinkHandle,
): ConstructorNode {
  const before = memory.linkCount;
  try {
    const inverted = replayConstructorScopedStructuralOccurrence(
      memory, schema.constructorAuthority,
      schema.constructorAuthorityAdmission, targetOccurrence,
    );
    const primitive = readStructuralDerivationRule(
      memory, inverted.primitiveDerivationRule,
    );
    const rule = readStructuralRule(memory, primitive.structuralRule);
    const roles = readStructuralRoleDictionary(memory, rule.roleDictionary).roles;
    const byOccurrence = new Map(
      inverted.validatedOccurrences.map(({ occurrence: item, claim }) =>
        [item, claim] as const),
    );
    const actualPremises = inverted.dependencyOccurrences.map((dependency) => {
      const claim = byOccurrence.get(dependency);
      if (claim === undefined) functionalityFail("invalid-functionality-schema");
      return claim;
    });
    const constraints = [
      Object.freeze({ template: rule.body, actual: inverted.claim }),
      ...primitive.premiseTemplates.map((template, index) =>
        Object.freeze({ template, actual: actualPremises[index]! })),
    ];
    const bindings = inferStructuralSubstitution(
      memory, roles, constraints, { requireAll: true },
    );
    const stable = bindingValue(bindings, schema.stableRole);
    if (inverted.primitiveDerivationRule === schema.baseConstructor) {
      if (primitive.premiseTemplates.length !== 0) {
        functionalityFail("invalid-functionality-schema");
      }
      return Object.freeze({
        kind: "base", stable, induction: schema.baseInductionValue,
        witness: stable,
      });
    }
    if (inverted.primitiveDerivationRule !== schema.stepConstructor) {
      functionalityFail("invalid-functionality-schema");
    }
    const previousInduction = bindingValue(bindings, schema.currentInductionRole);
    const previousWitness = bindingValue(bindings, schema.currentWitnessRole);
    const induction = bindingValue(bindings, schema.nextInductionRole);
    const witness = bindingValue(bindings, schema.nextWitnessRole);
    const inductionPoles = memory.poles(induction);
    if (
      inductionPoles.start !== previousInduction
      || inductionPoles.end !== schema.successorUnit
    ) functionalityFail("invalid-induction-successor");
    const witnessPoles = memory.poles(witness);
    if (
      witnessPoles.start !== previousWitness
      || witnessPoles.end !== schema.successorUnit
    ) functionalityFail("invalid-witness-successor");
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
    const recursiveOccurrence = dependencyFor(schema.recursivePremiseTemplate);
    const inductionTransition = dependencyFor(schema.inductionTransitionTemplate);
    const witnessTransition = dependencyFor(schema.witnessTransitionTemplate);
    for (const [dependency, expected] of [
      [inductionTransition, induction], [witnessTransition, witness],
    ] as const) {
      const claim = byOccurrence.get(dependency);
      if (claim === undefined) functionalityFail("invalid-transition-proof");
      const poles = memory.poles(claim);
      if (poles.start !== expected || poles.end !== expected) {
        functionalityFail("invalid-transition-proof");
      }
    }
    return Object.freeze({
      kind: "step", stable, induction, witness, previousInduction,
      previousWitness, recursiveOccurrence,
    });
  } finally {
    if (memory.linkCount !== before) functionalityFail("replay-wrote");
  }
}

function proveRecursiveConstructorFunctionality(
  memory: ReadMemory, functionalityAuthority: LinkHandle,
  functionalityAuthorityAdmission: LinkHandle,
  leftOccurrence: LinkHandle, rightOccurrence: LinkHandle,
): LinkHandle {
  const before = memory.linkCount;
  const schema = readRecursiveFunctionalitySchema(
    memory, functionalityAuthority, functionalityAuthorityAdmission,
  );
  const active = new Map<LinkHandle, Set<LinkHandle>>();
  const prove = (leftOccurrence: LinkHandle, rightOccurrence: LinkHandle): LinkHandle => {
    let rights = active.get(leftOccurrence);
    if (rights === undefined) {
      rights = new Set<LinkHandle>();
      active.set(leftOccurrence, rights);
    }
    if (rights.has(rightOccurrence)) functionalityFail("invalid-functionality-schema");
    rights.add(rightOccurrence);
    try {
      const left = inspectRecursiveFunctionalityNode(memory, schema, leftOccurrence);
      const right = inspectRecursiveFunctionalityNode(memory, schema, rightOccurrence);
      if (left.stable !== right.stable || left.induction !== right.induction) {
        functionalityFail("input-mismatch");
      }
      if (left.kind === "base" && right.kind === "base") {
        same(left.witness, right.witness, "BASE/BASE witness");
        return left.witness;
      }
      if (left.kind !== right.kind) {
        functionalityFail("constructor-exclusivity-violation");
      }
      if (left.kind !== "step" || right.kind !== "step") {
        functionalityFail("invalid-functionality-schema");
      }
      const inputPoles = memory.poles(left.induction);
      same(inputPoles.start, left.previousInduction, "left STEP predecessor");
      same(inputPoles.start, right.previousInduction, "right STEP predecessor");
      const previousWitness = prove(
        left.recursiveOccurrence, right.recursiveOccurrence,
      );
      if (
        left.previousWitness !== previousWitness
        || right.previousWitness !== previousWitness
      ) functionalityFail("recursive-result-mismatch");
      if (left.witness !== right.witness) {
        functionalityFail("noncanonical-successor-result");
      }
      return left.witness;
    } finally {
      rights!.delete(rightOccurrence);
      if (rights!.size === 0) active.delete(leftOccurrence);
    }
  };
  try { return prove(leftOccurrence, rightOccurrence); }
  finally {
    if (memory.linkCount !== before) functionalityFail("replay-wrote");
  }
}

interface BuiltProof {
  readonly occurrence: LinkHandle;
  readonly right: LinkHandle;
  readonly result: LinkHandle;
}

function main(): void {
  const memory = new Memory();
  const { R, O, C, L, U } = ensureRootBasis(memory);
  let cursor = memory.ensure(U, R);
  const fresh = (): LinkHandle => (cursor = memory.ensure(cursor, R));
  const theory = memory.ensure(L, U);
  const addContext = memory.ensure(memory.ensure(O, C), fresh());
  const add = (
    left: LinkHandle, right: LinkHandle, result: LinkHandle,
  ): LinkHandle =>
    memory.ensure(memory.ensure(memory.ensure(addContext, left), right), result);
  const successorEquality = (
    value: LinkHandle, next: LinkHandle,
  ): LinkHandle => memory.ensure(next, memory.ensure(value, L));

  const a = fresh(), b = fresh(), c = fresh(), b1 = fresh(), c1 = fresh();
  same(new Set([a, b, c, b1, c1]).size, 5, "constructor roles distinct");
  const dBase = defineStructuralRoleDictionary(memory, [a]);
  const dStep = defineStructuralRoleDictionary(memory, [a, b, c, b1, c1]);
  const baseBody = add(a, U, a);
  const recursivePremise = add(a, b, c);
  const inductionTransitionPremise = successorEquality(b, b1);
  const witnessTransitionPremise = successorEquality(c, c1);
  const stepBody = add(a, b1, c1);

  const defineConstructor = (
    dictionary: LinkHandle, premises: readonly LinkHandle[],
    conclusion: LinkHandle,
  ): LinkHandle => {
    const rule = defineStructuralRule(memory, dictionary, conclusion);
    const dr = defineStructuralDerivationRule(memory, rule, premises);
    admitStructuralRule(memory, theory, rule);
    admitStructuralDerivationRule(memory, theory, dr);
    return dr;
  };
  const baseConstructor = defineConstructor(dBase, [], baseBody);
  const stepConstructor = defineConstructor(
    dStep,
    [recursivePremise, inductionTransitionPremise, witnessTransitionPremise],
    stepBody,
  );
  const constructorAuthority = materializeExactSequence(memory, [
    theory, baseConstructor, stepConstructor,
  ]);
  const constructorAuthorityAdmission = memory.ensure(theory, constructorAuthority);
  const functionalityAuthority = materializeExactSequence(memory, [
    theory, constructorAuthority, baseConstructor, stepConstructor,
    a, b, c, b1, c1, U, L, recursivePremise,
    inductionTransitionPremise, witnessTransitionPremise,
  ]);
  const functionalityAuthorityAdmission = memory.ensure(
    theory, functionalityAuthority,
  );
  readRecursiveFunctionalitySchema(
    memory, functionalityAuthority, functionalityAuthorityAdmission,
  );

  const uPoles = memory.poles(U);
  same(uPoles.start, C, "U start");
  same(uPoles.end, O, "U end");
  assert(O !== L && uPoles.end !== L, "T3: U is not a successor");
  const proveIdentity = recursiveIdentityProofBuilder(memory);

  const buildCanonical = (left: LinkHandle, depth: number): BuiltProof => {
    let right = U, result = left;
    let proof = occurrence(memory, add(left, right, result), baseConstructor, []);
    for (let index = 0; index < depth; index += 1) {
      const nextRight = memory.ensure(right, L);
      const nextResult = memory.ensure(result, L);
      proof = occurrence(memory, add(left, nextRight, nextResult), stepConstructor, [
        proof, proveIdentity(nextRight), proveIdentity(nextResult),
      ]);
      right = nextRight;
      result = nextResult;
    }
    return Object.freeze({ occurrence: proof, right, result });
  };
  const provePair = (left: BuiltProof, right: BuiltProof): LinkHandle =>
    proveRecursiveConstructorFunctionality(
      memory, functionalityAuthority, functionalityAuthorityAdmission,
      left.occurrence, right.occurrence,
    );
  const invert = (proof: LinkHandle): unknown =>
    replayConstructorScopedStructuralOccurrence(
      memory, constructorAuthority, constructorAuthorityAdmission, proof,
    );

  const n1 = memory.ensure(U, L);
  const stableA = memory.ensure(n1, L);
  const baseLeft = buildCanonical(stableA, 0);
  const baseRight = buildCanonical(stableA, 0);
  const beforeBase = memory.linkCount;
  same(provePair(baseLeft, baseRight), stableA, "BASE/BASE functionality");
  same(memory.linkCount, beforeBase, "BASE/BASE read-only");

  const oneLeft = buildCanonical(stableA, 1);
  const oneRight = buildCanonical(stableA, 1);
  same(provePair(oneLeft, oneRight), oneLeft.result, "STEP depth 1");

  const deepLeft = buildCanonical(stableA, 6);
  const deepRight = buildCanonical(stableA, 6);
  same(deepLeft.right, deepRight.right, "same deep input");
  same(provePair(deepLeft, deepRight), deepLeft.result, "STEP recursive depth > 1");
  same(deepLeft.occurrence, deepRight.occurrence,
    "independent reconstruction converges structurally");
  const beforeRepeat = memory.linkCount;
  same(provePair(deepLeft, deepRight), deepLeft.result, "repeat deep replay");
  same(memory.linkCount, beforeRepeat, "deep replay read-only");

  const rootIdentity = proveIdentity(R);
  const baseU = buildCanonical(U, 0);
  const baseStepMismatch = occurrence(
    memory, add(U, U, n1), stepConstructor,
    [baseU.occurrence, proveIdentity(U), proveIdentity(n1)],
  );
  expectReplayRejection(() => invert(baseStepMismatch), "BASE/STEP mismatch");
  expectReplayRejection(() => invert(baseStepMismatch), "STEP/BASE mismatch");

  const n2 = memory.ensure(n1, L);
  const wrongInduction = occurrence(
    memory, add(U, n2, n1), stepConstructor,
    [baseU.occurrence, proveIdentity(n2), proveIdentity(n1)],
  );
  expectReplayRejection(() => invert(wrongInduction), "wrong induction successor");

  const wrongResult = occurrence(
    memory, add(U, n1, n2), stepConstructor,
    [baseU.occurrence, proveIdentity(n1), proveIdentity(n2)],
  );
  expectReplayRejection(() => invert(wrongResult), "wrong result successor");
  const canonicalStep1 = buildCanonical(U, 1);
  assert(canonicalStep1.occurrence !== wrongResult,
    "different STEP predecessor candidate distinct");
  expectReplayRejection(() => invert(wrongResult), "different STEP predecessor result");

  const ambientClaim = add(U, n1, n2);
  memory.ensure(theory, ambientClaim);
  expectReplayRejection(() => invert(ambientClaim), "ambient Add without proof");

  const forgedDictionary = defineStructuralRoleDictionary(memory, []);
  const forgedRule = defineStructuralRule(memory, forgedDictionary, ambientClaim);
  const forgedConstructor = defineStructuralDerivationRule(memory, forgedRule, []);
  admitStructuralRule(memory, theory, forgedRule);
  admitStructuralDerivationRule(memory, theory, forgedConstructor);
  const forgedOccurrence = occurrence(memory, ambientClaim, forgedConstructor, []);
  expectReplayError("primitive-derivation-rule-out-of-scope",
    () => invert(forgedOccurrence));
  assert(memory.find(theory, forgedConstructor) !== undefined,
    "forged primitive DR is Theory-admitted");

  const foreignTheory = memory.ensure(C, R);
  const crossAuthority = materializeExactSequence(memory, [
    foreignTheory, baseConstructor, stepConstructor,
  ]);
  expectReplayError("invalid-constructor-authority", () =>
    replayConstructorScopedStructuralOccurrence(
      memory, crossAuthority, memory.ensure(foreignTheory, crossAuthority),
      baseU.occurrence,
    ));

  const duplicateAuthority = materializeExactSequence(memory, [
    theory, baseConstructor, baseConstructor, stepConstructor,
  ]);
  expectReplayError("invalid-constructor-authority", () =>
    replayConstructorScopedStructuralOccurrence(
      memory, duplicateAuthority, memory.ensure(theory, duplicateAuthority),
      baseU.occurrence,
    ));

  const malformedAuthority = materializeExactSequence(memory, [theory, R]);
  expectReplayError("invalid-constructor-authority", () =>
    replayConstructorScopedStructuralOccurrence(
      memory, malformedAuthority, memory.ensure(theory, malformedAuthority),
      baseU.occurrence,
    ));

  const tamperedStep = occurrence(
    memory, add(U, n1, n2), stepConstructor,
    [rootIdentity, proveIdentity(n1), proveIdentity(n2)],
  );
  expectReplayRejection(() => invert(tamperedStep), "tampered dependency");

  console.log([
    "MTS v0.14 N12: GENERAL_ADD_FUNCTIONALITY_PROOF=GREEN_RESEARCH",
    "BASE_BASE_UNIQUENESS=GREEN", "BASE_STEP_EXCLUSIVITY=GREEN",
    "STEP_BASE_EXCLUSIVITY=GREEN", "STEP_STEP_RECURSIVE_UNIQUENESS=GREEN",
    "UNBOUNDED_PROOF_TREE_RECURSION=TRUE", "CONSTRUCTOR_SCOPE_ENFORCED=TRUE",
    "FUNCTIONALITY_SCHEMA_LINK_CARRIED=TRUE", "CONSTRUCTOR_INVERSION_USED=TRUE",
    "SUCCESSOR_AUTHORITY=STRUCTURAL_IDENTITY_X1_EQ_X_TO_L",
    "SUCCESSOR_UNIQUENESS_USED=TRUE", "ZERO_NOT_SUCCESSOR_USED=TRUE",
    "FORGED_THIRD_CONSTRUCTOR_REJECTED=TRUE",
    "WRONG_INDUCTION_SUCCESSOR_REJECTED=TRUE",
    "WRONG_RESULT_SUCCESSOR_REJECTED=TRUE",
    "DIFFERENT_STEP_PREDECESSOR_RESULT_REJECTED=TRUE",
    "CROSS_THEORY_AUTHORITY_REJECTED=TRUE", "OUT_OF_SCOPE_DR_REJECTED=TRUE",
    "AMBIENT_ADD_NOT_AUTHORITY=TRUE", "TAMPERED_DIRECT_DEPENDENCY_REJECTED=TRUE",
    "PRIMITIVE_RESULT_ADMISSION_SHORTCUT_REJECTED=TRUE",
    "DUPLICATE_OR_MALFORMED_AUTHORITY_REJECTED=TRUE", "REPLAY_READ_ONLY=TRUE",
    "PRODUCTION_DELTA=NONE", "ADD_SPECIFIC_HOST_DISPATCH=0",
    "A9_TYPED_READ_SITES_EXPECTED=531", "A9_TYPED_READ_OWNERS_EXPECTED=238",
    "A9_TYPED_READ_OWNER_FINGERPRINT_EXPECTED=6469719fde82d8a1",
    "A9_DECISION_OWNERS_EXPECTED=389",
    "A9_DECISION_FINGERPRINT_EXPECTED=17177b220de31e73",
    "A9_PROOF_REPLAY_DECISION_OWNERS_EXPECTED=99",
    "A9_ROOTED_PROOF_ASET_OWNERS_EXPECTED=14",
    "A9_WIRE_LITERAL_DISPATCH_EXPECTED=0",
    "ACCEPTED_V013_MUTATED=FALSE", "MTS_V014_ACCEPTED=FALSE",
  ].join(" "));
}
main();
