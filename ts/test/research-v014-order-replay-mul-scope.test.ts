// mts-version-evidence: candidate-from=0.14
// research-owner: #1650

import { materializeExactSequence } from "../src/exact-sequence.js";
import {
  admitStructuralDerivationRule,
  defineStructuralDerivationRule,
} from "../src/derivation.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
} from "../src/memory.js";
import {
  StructuralRootedProofAsetReplayError,
  replayConstructorScopedStructuralOccurrence,
} from "../src/rooted-proof-aset.js";
import {
  admitStructuralRule,
  defineStructuralRoleDictionary,
  defineStructuralRule,
} from "../src/structural-rule.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error("v0.14 N13 order replay: " + message);
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}
function expectReplayReject(effect: () => unknown, message: string): void {
  try { effect(); } catch (error) {
    assert(
      error instanceof StructuralRootedProofAsetReplayError,
      `${message}: wrong error type`,
    );
    return;
  }
  throw new Error(`${message}: expected rejection`);
}
function expectReplayCode(code: string, effect: () => unknown): void {
  try { effect(); } catch (error) {
    assert(error instanceof StructuralRootedProofAsetReplayError, `${code}: wrong error type`);
    same(error.code, code, `${code}: wrong error code`);
    return;
  }
  throw new Error(`${code}: expected rejection`);
}
function occurrence(
  memory: Memory,
  claim: LinkHandle,
  derivationRule: LinkHandle,
  dependencies: readonly LinkHandle[],
): LinkHandle {
  return memory.ensure(
    claim,
    memory.ensure(derivationRule, materializeExactSequence(memory, dependencies)),
  );
}
function identityProof(
  memory: Memory,
  value: LinkHandle,
  children: readonly LinkHandle[],
): LinkHandle {
  return memory.ensure(
    memory.ensure(value, value),
    materializeExactSequence(memory, children),
  );
}
function recursiveIdentityBuilder(memory: Memory) {
  const memo = new Map<LinkHandle, LinkHandle>();
  const prove = (value: LinkHandle): LinkHandle => {
    const cached = memo.get(value);
    if (cached !== undefined) return cached;
    const poles = memory.poles(value);
    let children: readonly LinkHandle[];
    if (poles.start === value && poles.end === value) {
      same(value, memory.root, "only ROOT may be fully self-closed");
      children = [];
    } else if (poles.start === value) {
      children = [prove(poles.end)];
    } else if (poles.end === value) {
      children = [prove(poles.start)];
    } else {
      children = [prove(poles.start), prove(poles.end)];
    }
    const proof = identityProof(memory, value, children);
    memo.set(value, proof);
    return proof;
  };
  return prove;
}

interface BuiltAdd {
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
  const relation = memory.ensure(O, C);
  const addContext = memory.ensure(relation, fresh());
  const leContext = memory.ensure(relation, fresh());

  const add = (a: LinkHandle, b: LinkHandle, c: LinkHandle): LinkHandle =>
    memory.ensure(memory.ensure(memory.ensure(addContext, a), b), c);
  const le = (a: LinkHandle, b: LinkHandle): LinkHandle =>
    memory.ensure(memory.ensure(leContext, a), b);
  const successorEquality = (n: LinkHandle, n1: LinkHandle): LinkHandle =>
    memory.ensure(n1, memory.ensure(n, L));

  // One role set serves the Add constructors and the derived Le projection:
  // Add(a,b,c) -> Le(a,c), with b as the existential/additive witness.
  const a = fresh(), b = fresh(), c = fresh(), b1 = fresh(), c1 = fresh();
  same(new Set([a, b, c, b1, c1]).size, 5, "roles must be distinct");

  const groundA = defineStructuralRoleDictionary(memory, [a]);
  const stepRoles = defineStructuralRoleDictionary(memory, [a, b, c, b1, c1]);
  const leRoles = defineStructuralRoleDictionary(memory, [a, b, c]);

  const addBaseTemplate = add(a, U, a);
  const addPremiseTemplate = add(a, b, c);
  const succBTemplate = successorEquality(b, b1);
  const succCTemplate = successorEquality(c, c1);
  const addStepTemplate = add(a, b1, c1);
  const leTemplate = le(a, c);

  const defineConstructor = (
    dictionary: LinkHandle,
    body: LinkHandle,
    premises: readonly LinkHandle[],
  ): LinkHandle => {
    const rule = defineStructuralRule(memory, dictionary, body);
    const dr = defineStructuralDerivationRule(memory, rule, premises);
    admitStructuralRule(memory, theory, rule);
    admitStructuralDerivationRule(memory, theory, dr);
    return dr;
  };

  const addBase = defineConstructor(groundA, addBaseTemplate, []);
  const addStep = defineConstructor(
    stepRoles,
    addStepTemplate,
    [addPremiseTemplate, succBTemplate, succCTemplate],
  );
  const leFromAdd = defineConstructor(leRoles, leTemplate, [addPremiseTemplate]);

  // Composite arithmetic authority is ordinary Link data. Full scoped replay
  // must stay inside these three structural constructors.
  const arithmeticAuthority = materializeExactSequence(memory, [
    theory,
    addBase,
    addStep,
    leFromAdd,
  ]);
  const arithmeticAuthorityAdmission = memory.ensure(theory, arithmeticAuthority);

  const proveIdentity = recursiveIdentityBuilder(memory);

  const buildAdd = (left: LinkHandle, depth: number): BuiltAdd => {
    let right = U;
    let result = left;
    let proof = occurrence(memory, add(left, right, result), addBase, []);
    for (let index = 0; index < depth; index += 1) {
      const nextRight = memory.ensure(right, L);
      const nextResult = memory.ensure(result, L);
      proof = occurrence(
        memory,
        add(left, nextRight, nextResult),
        addStep,
        [proof, proveIdentity(nextRight), proveIdentity(nextResult)],
      );
      right = nextRight;
      result = nextResult;
    }
    return Object.freeze({ occurrence: proof, left, right, result });
  };

  const buildLe = (source: BuiltAdd, target = le(source.left, source.result)): LinkHandle =>
    occurrence(memory, target, leFromAdd, [source.occurrence]);

  const replayLe = (proof: LinkHandle, expectedAdd?: LinkHandle): void => {
    const before = memory.linkCount;
    const replay = replayConstructorScopedStructuralOccurrence(
      memory,
      arithmeticAuthority,
      arithmeticAuthorityAdmission,
      proof,
    );
    same(replay.primitiveDerivationRule, leFromAdd, "Le target uses exact FROM_ADD DR");
    if (expectedAdd !== undefined) {
      same(replay.dependencyOccurrences.length, 1, "Le has exactly one direct dependency");
      same(replay.dependencyOccurrences[0], expectedAdd, "Le depends on exact Add occurrence");
    }
    same(memory.linkCount, before, "order replay is read-only");
  };

  // -----------------------------------------------------------------------
  // Positive zero-rooted Nat / Add / Le migration witnesses.
  // -----------------------------------------------------------------------

  const N0 = U;
  const N1 = memory.ensure(N0, L);
  const N2 = memory.ensure(N1, L);
  const N3 = memory.ensure(N2, L);

  same(N1, memory.ensure(U, L), "N1 uses uniform zero-rooted successor");
  assert(N1 !== L, "v0.14 N1 must not collapse to historical Degree one");

  const le00Add = buildAdd(N0, 0);
  same(le00Add.result, N0, "Add(N0,N0)=N0");
  replayLe(buildLe(le00Add), le00Add.occurrence);

  const le03Add = buildAdd(N0, 3);
  same(le03Add.right, N3, "Add zero witness right=N3");
  same(le03Add.result, N3, "Add(N0,N3)=N3");
  replayLe(buildLe(le03Add), le03Add.occurrence);

  const le13Add = buildAdd(N1, 2);
  same(le13Add.right, N2, "Le(N1,N3) additive witness=N2");
  same(le13Add.result, N3, "Add(N1,N2)=N3");
  replayLe(buildLe(le13Add), le13Add.occurrence);

  const deepAdd = buildAdd(N2, 7);
  replayLe(buildLe(deepAdd), deepAdd.occurrence);

  // -----------------------------------------------------------------------
  // Legacy v0.13 zero-successor shortcut must not migrate.
  // A STEP whose next right coordinate is L would require the grounded
  // transition L = U->L, but N1=U->L != L.
  // -----------------------------------------------------------------------

  const baseU = buildAdd(U, 0);
  const legacyStep = occurrence(
    memory,
    add(U, L, N1),
    addStep,
    [baseU.occurrence, proveIdentity(L), proveIdentity(N1)],
  );
  const legacyLe = occurrence(memory, le(U, N1), leFromAdd, [legacyStep]);
  expectReplayReject(
    () => replayConstructorScopedStructuralOccurrence(
      memory, arithmeticAuthority, arithmeticAuthorityAdmission, legacyLe,
    ),
    "legacy Succ(U)=L shortcut",
  );

  // -----------------------------------------------------------------------
  // Ambient Add existence is not proof authority.
  // -----------------------------------------------------------------------

  const ambientAddClaim = add(N1, N1, N2);
  memory.ensure(theory, ambientAddClaim);
  const ambientLe = occurrence(memory, le(N1, N2), leFromAdd, [ambientAddClaim]);
  expectReplayReject(
    () => replayConstructorScopedStructuralOccurrence(
      memory, arithmeticAuthority, arithmeticAuthorityAdmission, ambientLe,
    ),
    "ambient Add claim without ProofOccurrence",
  );

  // -----------------------------------------------------------------------
  // Same-Theory forged Add constructor cannot witness Le.
  // -----------------------------------------------------------------------

  const forgedDict = defineStructuralRoleDictionary(memory, []);
  const forgedRule = defineStructuralRule(memory, forgedDict, ambientAddClaim);
  const forgedAdd = defineStructuralDerivationRule(memory, forgedRule, []);
  admitStructuralRule(memory, theory, forgedRule);
  admitStructuralDerivationRule(memory, theory, forgedAdd);
  const forgedAddOccurrence = occurrence(memory, ambientAddClaim, forgedAdd, []);
  const forgedLe = occurrence(memory, le(N1, N2), leFromAdd, [forgedAddOccurrence]);
  expectReplayCode(
    "primitive-derivation-rule-out-of-scope",
    () => replayConstructorScopedStructuralOccurrence(
      memory, arithmeticAuthority, arithmeticAuthorityAdmission, forgedLe,
    ),
  );
  assert(memory.find(theory, forgedAdd) !== undefined,
    "forged Add DR is admitted in Theory but still out of selected authority");

  // Wrong Add dependency does not match the Le target substitution.
  const add01 = buildAdd(N0, 1);
  const wrongLeTarget = occurrence(memory, le(N0, N2), leFromAdd, [add01.occurrence]);
  expectReplayReject(
    () => replayConstructorScopedStructuralOccurrence(
      memory, arithmeticAuthority, arithmeticAuthorityAdmission, wrongLeTarget,
    ),
    "Le target with nonmatching Add result",
  );

  // Tampered direct dependency.
  const rootIdentity = proveIdentity(R);
  const tamperedLe = occurrence(memory, le(N0, N1), leFromAdd, [rootIdentity]);
  expectReplayReject(
    () => replayConstructorScopedStructuralOccurrence(
      memory, arithmeticAuthority, arithmeticAuthorityAdmission, tamperedLe,
    ),
    "tampered Le dependency",
  );

  // Cross-Theory authority cannot reuse selected constructors.
  const foreignTheory = memory.ensure(C, R);
  const foreignAuthority = materializeExactSequence(memory, [
    foreignTheory, addBase, addStep, leFromAdd,
  ]);
  expectReplayCode(
    "invalid-constructor-authority",
    () => replayConstructorScopedStructuralOccurrence(
      memory,
      foreignAuthority,
      memory.ensure(foreignTheory, foreignAuthority),
      buildLe(le00Add),
    ),
  );

  // Duplicate/malformed authority remains fail-closed.
  const duplicateAuthority = materializeExactSequence(memory, [
    theory, addBase, addStep, leFromAdd, leFromAdd,
  ]);
  expectReplayCode(
    "invalid-constructor-authority",
    () => replayConstructorScopedStructuralOccurrence(
      memory,
      duplicateAuthority,
      memory.ensure(theory, duplicateAuthority),
      buildLe(le00Add),
    ),
  );
  const malformedAuthority = materializeExactSequence(memory, [theory, R]);
  expectReplayCode(
    "invalid-constructor-authority",
    () => replayConstructorScopedStructuralOccurrence(
      memory,
      malformedAuthority,
      memory.ensure(theory, malformedAuthority),
      buildLe(le00Add),
    ),
  );

  console.log([
    "MTS v0.14 N13: ORDER_OVER_V014_NAT_REPLAY=GREEN_RESEARCH",
    "LE_FROM_CANONICAL_ADD=GREEN",
    "COMPOSITE_ARITHMETIC_AUTHORITY_LINK_CARRIED=TRUE",
    "ADD_CONSTRUCTOR_SCOPE_ENFORCED=TRUE",
    "FORGED_ADD_CANNOT_WITNESS_LE=TRUE",
    "AMBIENT_ADD_CANNOT_WITNESS_LE=TRUE",
    "ZERO_ROOTED_SUCCESSOR_USED=TRUE",
    "N1_NOT_DEGREE_ONE=TRUE",
    "LEGACY_ZERO_SUCCESSOR_REJECTED=TRUE",
    "WRONG_ADD_DEPENDENCY_REJECTED=TRUE",
    "TAMPERED_DIRECT_DEPENDENCY_REJECTED=TRUE",
    "CROSS_THEORY_AUTHORITY_REJECTED=TRUE",
    "DUPLICATE_OR_MALFORMED_AUTHORITY_REJECTED=TRUE",
    "REPLAY_READ_ONLY=TRUE",
    "ORDER_SPECIFIC_HOST_DISPATCH=0",
    "ADD_SPECIFIC_HOST_DISPATCH=0",
    "MUL_OVER_V014_NAT=EXPLICITLY_DEFERRED",
    "MUL_REQUIRED_FOR_V014_ACCEPTANCE=FALSE",
    "FULL_SEMIRING=DOWNSTREAM_DERIVED_RESEARCH",
    "PRODUCTION_DELTA=NONE",
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
