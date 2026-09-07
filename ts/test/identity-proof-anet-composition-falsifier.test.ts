import { materializeExactSequence, readExactSequence } from "../src/exact-sequence.js";
import {
  admitStructuralDerivationRule,
  defineStructuralDerivationRule,
} from "../src/derivation.js";
import {
  StructuralDerivedDerivationReplayError,
  type StructuralDerivedDerivationReplayErrorCode,
  type StructuralDerivedDerivationEvidence,
  replayStructuralDerivedDerivationSchema,
} from "../src/derived-derivation-schema.js";
import { Memory, ensureRootBasis, type LinkHandle, type ReadMemory } from "../src/memory.js";
import {
  replayRecursiveLinkIdentityProofAset,
} from "../src/recursive-link-identity-proof.js";
import {
  admitStructuralRule,
  defineStructuralRoleDictionary,
  defineStructuralRule,
} from "../src/structural-rule.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}

function identityProof(
  memory: Memory,
  left: LinkHandle,
  right: LinkHandle,
  children: readonly LinkHandle[],
): LinkHandle {
  const claim = memory.ensure(left, right);
  const childSequence = materializeExactSequence(memory, children);
  return memory.ensure(claim, childSequence);
}

function assertIdentityClaim(
  memory: ReadMemory,
  proofRoot: LinkHandle,
  left: LinkHandle,
  right: LinkHandle,
  label: string,
): void {
  const before = memory.linkCount;
  const replay = replayRecursiveLinkIdentityProofAset(memory, proofRoot);
  same(replay.left, left, `${label}: left claim`);
  same(replay.right, right, `${label}: right claim`);
  same(memory.linkCount, before, `${label}: replay is read-only`);
}

function projectPoleProofRoots(
  memory: ReadMemory,
  proofRoot: LinkHandle,
): { readonly start: LinkHandle; readonly end: LinkHandle } {
  const replay = replayRecursiveLinkIdentityProofAset(memory, proofRoot);
  const occurrence = memory.poles(proofRoot);
  const children = readExactSequence(memory, occurrence.end).values;
  const left = memory.poles(replay.left);
  const right = memory.poles(replay.right);

  const leftStartClosed = left.start === replay.left;
  const leftEndClosed = left.end === replay.left;
  const rightStartClosed = right.start === replay.right;
  const rightEndClosed = right.end === replay.right;

  same(leftStartClosed, rightStartClosed, "projection: start closure shape");
  same(leftEndClosed, rightEndClosed, "projection: end closure shape");

  if (leftStartClosed && leftEndClosed) {
    same(children.length, 0, "FULL projection arity");
    return Object.freeze({ start: proofRoot, end: proofRoot });
  }
  if (leftStartClosed) {
    same(children.length, 1, "START projection arity");
    const external = children[0];
    assert(external !== undefined, "START projection child exists");
    return Object.freeze({ start: proofRoot, end: external });
  }
  if (leftEndClosed) {
    same(children.length, 1, "END projection arity");
    const external = children[0];
    assert(external !== undefined, "END projection child exists");
    return Object.freeze({ start: external, end: proofRoot });
  }

  same(children.length, 2, "ORDINARY projection arity");
  const start = children[0];
  const end = children[1];
  assert(start !== undefined && end !== undefined, "ORDINARY projection children exist");
  return Object.freeze({ start, end });
}

function verifyProjectedPoles(
  memory: ReadMemory,
  proofRoot: LinkHandle,
  label: string,
): { readonly start: LinkHandle; readonly end: LinkHandle } {
  const parent = replayRecursiveLinkIdentityProofAset(memory, proofRoot);
  const left = memory.poles(parent.left);
  const right = memory.poles(parent.right);
  const projected = projectPoleProofRoots(memory, proofRoot);

  assertIdentityClaim(memory, projected.start, left.start, right.start, `${label}: start projection`);
  assertIdentityClaim(memory, projected.end, left.end, right.end, `${label}: end projection`);
  return projected;
}

function measureProofCarryingAssumptionReject(
  memory: Memory,
  theory: LinkHandle,
  proofRoot: LinkHandle,
  premiseTemplate: LinkHandle,
  label: string,
): StructuralDerivedDerivationReplayErrorCode | undefined {
  const role = memory.ensureStartSelfClosed(premiseTemplate);
  const dictionary = defineStructuralRoleDictionary(memory, [role]);

  // The primitive node is deliberately tautological. If the proof-carrying
  // assumption were accepted, the remaining derived-schema closure is valid.
  // No theorem-specific rule is introduced here.
  const rule = defineStructuralRule(memory, dictionary, premiseTemplate);
  const derivationRule = defineStructuralDerivationRule(memory, rule, [premiseTemplate]);
  const ruleAdmission = admitStructuralRule(memory, theory, rule);
  const derivationRuleAdmission = admitStructuralDerivationRule(memory, theory, derivationRule);
  const identity = memory.ensure(derivationRule, theory);
  const dependencySequence = materializeExactSequence(memory, [proofRoot]);
  const targetOccurrence = memory.ensure(derivationRule, dependencySequence);

  const evidence: StructuralDerivedDerivationEvidence = Object.freeze({
    identity,
    targetOccurrence,
    assumptions: Object.freeze([{ occurrence: proofRoot, template: premiseTemplate }]),
    nodes: Object.freeze([{
      occurrence: targetOccurrence,
      derivationRule,
      ruleAdmission,
      derivationRuleAdmission,
      premiseOccurrenceSequence: dependencySequence,
    }]),
  });

  const proofPoles = memory.poles(proofRoot);
  same(proofPoles.start, premiseTemplate, `${label}: proof root carries exact premise claim`);
  assert(
    proofPoles.end !== identity,
    `${label}: proof child sequence must remain distinct from derived-schema identity`,
  );

  const before = memory.linkCount;
  try {
    replayStructuralDerivedDerivationSchema(memory, evidence);
  } catch (error) {
    assert(
      error instanceof StructuralDerivedDerivationReplayError,
      `${label}: stable derived-schema replay error`,
    );
    same(memory.linkCount, before, `${label}: failed composition replay is read-only`);
    return error.code;
  }

  same(memory.linkCount, before, `${label}: successful composition replay is read-only`);
  return undefined;
}

const memory = new Memory();
const { R, O, C, L, U } = ensureRootBasis(memory);

// F1: all four accepted recursive identity shapes expose pole proof roots.
const rootProof = identityProof(memory, R, R, []);
const startProof = identityProof(memory, O, O, [rootProof]);
const endProof = identityProof(memory, C, C, [rootProof]);
const ordinaryProof = identityProof(memory, L, L, [startProof, endProof]);

const fullProjection = verifyProjectedPoles(memory, rootProof, "FULL");
same(fullProjection.start, rootProof, "FULL start is parent");
same(fullProjection.end, rootProof, "FULL end is parent");

const startProjection = verifyProjectedPoles(memory, startProof, "START");
same(startProjection.start, startProof, "START start is parent");
same(startProjection.end, rootProof, "START end is child[0]");

const endProjection = verifyProjectedPoles(memory, endProof, "END");
same(endProjection.start, rootProof, "END start is child[0]");
same(endProjection.end, endProof, "END end is parent");

const ordinaryProjection = verifyProjectedPoles(memory, ordinaryProof, "ORDINARY");
same(ordinaryProjection.start, startProof, "ORDINARY start is child[0]");
same(ordinaryProjection.end, endProof, "ORDINARY end is child[1]");

// F2: unrelated finite ROOT-grounded relation. No Nat/Succ theorem machinery.
const arbitraryStart = memory.ensureStartSelfClosed(C);
const arbitraryEnd = memory.ensureEndSelfClosed(O);
const arbitraryRelation = memory.ensure(arbitraryStart, arbitraryEnd);
const arbitraryStartProof = identityProof(memory, arbitraryStart, arbitraryStart, [endProof]);
const arbitraryEndProof = identityProof(memory, arbitraryEnd, arbitraryEnd, [startProof]);
const arbitraryRelationProof = identityProof(
  memory,
  arbitraryRelation,
  arbitraryRelation,
  [arbitraryStartProof, arbitraryEndProof],
);
const arbitraryProjection = verifyProjectedPoles(memory, arbitraryRelationProof, "non-Nat relation");
same(arbitraryProjection.start, arbitraryStartProof, "non-Nat start proof is explicit sub-Anet");
same(arbitraryProjection.end, arbitraryEndProof, "non-Nat end proof is explicit sub-Anet");

// F3: feed that already-valid proof Anet itself into the current generic
// derived-schema assumption carrier. No host replay-result token is substituted.
const theory = memory.ensure(U, arbitraryRelation);
const arbitraryClaim = memory.poles(arbitraryRelationProof).start;
const genericReject = measureProofCarryingAssumptionReject(
  memory,
  theory,
  arbitraryRelationProof,
  arbitraryClaim,
  "generic proof-carrying premise",
);

// F4: T4-shaped diagnostic only. The desired A=A conclusion is already the
// start sub-Anet of a valid identity proof for A->L; no T4 rule is admitted.
const successor = memory.ensure(arbitraryRelation, L);
const successorProof = identityProof(
  memory,
  successor,
  successor,
  [arbitraryRelationProof, ordinaryProof],
);
const successorProjection = verifyProjectedPoles(memory, successorProof, "T4-shaped successor identity");
same(successorProjection.start, arbitraryRelationProof, "T4 desired start proof is existing sub-Anet");
const successorClaim = memory.poles(successorProof).start;
const t4Reject = measureProofCarryingAssumptionReject(
  memory,
  theory,
  successorProof,
  successorClaim,
  "T4-shaped proof-carrying premise",
);

if (genericReject === undefined && t4Reject === undefined) {
  console.log("IDENTITY_SUBANET_COMPOSITION_ALREADY_EXPRESSIBLE");
} else {
  same(t4Reject, genericReject, "generic and T4-shaped composition reach the same carrier boundary");
  throw new Error(
    `GAP(PROOF_CARRYING_ASSUMPTION_ANET_COMPOSITION:${String(genericReject)})`,
  );
}
