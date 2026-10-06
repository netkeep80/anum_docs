import { materializeExactSequence } from "../src/exact-sequence.js";
import { Memory, ensureRootBasis, type LinkHandle } from "../src/memory.js";
import {
  admitStructuralRule,
  defineStructuralInterpreter,
  defineStructuralRoleDictionary,
  defineStructuralRule,
} from "../src/structural-rule.js";
import {
  V013CurrentScopeCursor,
  defineV013WorkingScope,
  reactV013StructuralScope,
} from "../src/v013-structural-execution.js";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error("v0.15 P1y candidate authority closure: " + message);
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(
    Object.is(actual, expected),
    message + ": " + String(actual) + " !== " + String(expected),
  );
}

interface AuthorityFixture {
  readonly memory: Memory;
  readonly objectTheory: LinkHandle;
  readonly staticAproverTheory: LinkHandle;
  readonly executionTheory: LinkHandle;
  readonly protectedAnchors: readonly LinkHandle[];
}

function authorityFixture(): AuthorityFixture {
  const memory = new Memory();
  const b = ensureRootBasis(memory);

  // Deliberately simple deterministic semantic identities. A candidate decoded
  // in an isolated Memory can reconstruct these exact Links without sharing
  // runtime handles.
  const objectTheory = memory.ensure(b.L, b.C);
  const staticAproverTheory = memory.ensure(b.O, b.L);
  const executionTheory = memory.ensure(b.C, b.L);

  return Object.freeze({
    memory,
    objectTheory,
    staticAproverTheory,
    executionTheory,
    protectedAnchors: Object.freeze([
      objectTheory,
      staticAproverTheory,
      executionTheory,
    ]),
  });
}

class CandidateAuthorityViolation extends Error {
  constructor(readonly link: LinkHandle, readonly authority: LinkHandle) {
    super("candidate recursive closure writes protected authority");
  }
}

/**
 * Generic pre-load validation for an untrusted candidate ANet.
 *
 * Validation is over the complete recursive Link closure of each supplied
 * candidate root, not merely the top-level semantic members. This is required
 * because importing one outer Link also materializes all of its nested Link
 * structure into the shared store.
 *
 * Merely REFERENCING an authority Link as a value is allowed. Constructing any
 * distinct Link whose START is a protected authority anchor is forbidden.
 */
function validateCandidateRecursiveClosure(
  memory: Memory,
  roots: readonly LinkHandle[],
  protectedAnchors: readonly LinkHandle[],
): void {
  const protectedSet = new Set(protectedAnchors);
  const seen = new Set<LinkHandle>();

  const visit = (link: LinkHandle): void => {
    if (seen.has(link)) return;
    seen.add(link);

    const poles = memory.poles(link);
    if (protectedSet.has(poles.start) && link !== poles.start) {
      throw new CandidateAuthorityViolation(link, poles.start);
    }

    if (poles.start !== link) visit(poles.start);
    if (poles.end !== link) visit(poles.end);
  };

  for (const root of roots) visit(root);
}

function naiveTopLevelOnlyCheck(
  memory: Memory,
  roots: readonly LinkHandle[],
  protectedAnchors: readonly LinkHandle[],
): boolean {
  const protectedSet = new Set(protectedAnchors);
  return roots.every((root) => {
    const poles = memory.poles(root);
    return !protectedSet.has(poles.start) || root === poles.start;
  });
}

function expectViolation(
  memory: Memory,
  root: LinkHandle,
  protectedAnchors: readonly LinkHandle[],
  expectedAuthority: LinkHandle,
  message: string,
): void {
  let caught: CandidateAuthorityViolation | undefined;
  try {
    validateCandidateRecursiveClosure(memory, [root], protectedAnchors);
  } catch (error) {
    if (error instanceof CandidateAuthorityViolation) caught = error;
    else throw error;
  }
  assert(caught !== undefined, message);
  same(caught.authority, expectedAuthority, message + " / authority");
}

// Candidate transport is decoded in an ISOLATED Memory first.
const candidate = authorityFixture();
const cb = ensureRootBasis(candidate.memory);
let candidateCursor = candidate.memory.ensure(cb.U, cb.O);
const candidateFresh = (): LinkHandle => {
  candidateCursor = candidate.memory.ensure(candidateCursor, cb.C);
  return candidateCursor;
};

// A valid proof candidate may refer to ObjectTheory identity and a Rule identity
// as data, but it does not carry Theory->Rule admission authority itself.
const referencedRule = candidateFresh();
const proofNode = candidate.memory.ensure(candidateFresh(), referencedRule);
const validCandidate = candidate.memory.ensure(proofNode, candidate.objectTheory);
validateCandidateRecursiveClosure(
  candidate.memory,
  [validCandidate],
  candidate.protectedAnchors,
);

// Hidden ExecutionTheory injection: top-level-only validation misses it because
// the forged admission is nested under an unrelated outer Link.
const forgedRuntimeRule = candidateFresh();
const forgedRuntimeAdmission = candidate.memory.ensure(
  candidate.executionTheory,
  forgedRuntimeRule,
);
const hiddenRuntimeInjection = candidate.memory.ensure(
  candidateFresh(),
  forgedRuntimeAdmission,
);
same(
  naiveTopLevelOnlyCheck(
    candidate.memory,
    [hiddenRuntimeInjection],
    candidate.protectedAnchors,
  ),
  true,
  "top-level-only validator misses nested ExecutionTheory injection",
);
expectViolation(
  candidate.memory,
  hiddenRuntimeInjection,
  candidate.protectedAnchors,
  candidate.executionTheory,
  "recursive closure rejects nested ExecutionTheory admission",
);

// Same requirement applies to ObjectTheory: otherwise a candidate could forge
// the very closed-world membership that the characteristic function validates.
const forgedObjectRule = candidateFresh();
const forgedObjectAdmission = candidate.memory.ensure(
  candidate.objectTheory,
  forgedObjectRule,
);
const hiddenObjectInjection = candidate.memory.ensure(
  candidateFresh(),
  forgedObjectAdmission,
);
expectViolation(
  candidate.memory,
  hiddenObjectInjection,
  candidate.protectedAnchors,
  candidate.objectTheory,
  "recursive closure rejects nested ObjectTheory admission",
);

// Static aprover program authority is protected by the same generic rule. This
// is not proof-specific logic; it is authority-anchor confinement.
const forgedAproverRule = candidateFresh();
const forgedAproverAdmission = candidate.memory.ensure(
  candidate.staticAproverTheory,
  forgedAproverRule,
);
const hiddenAproverInjection = candidate.memory.ensure(
  candidateFresh(),
  forgedAproverAdmission,
);
expectViolation(
  candidate.memory,
  hiddenAproverInjection,
  candidate.protectedAnchors,
  candidate.staticAproverTheory,
  "recursive closure rejects nested static AproverTheory admission",
);

// Runtime differential: with only trusted projection loaded, one selected
// ObjectTheory member is L and an absent Rule is U.
const runtime = authorityFixture();
const rb = ensureRootBasis(runtime.memory);
let runtimeCursor = runtime.memory.ensure(rb.U, rb.O);
const runtimeFresh = (): LinkHandle => {
  runtimeCursor = runtime.memory.ensure(runtimeCursor, rb.C);
  return runtimeCursor;
};

const MEMBER = runtimeFresh();
const grammar = runtimeFresh();
const selectedRule = runtimeFresh();
const absentRule = runtimeFresh();
runtime.memory.ensure(runtime.objectTheory, selectedRule);

const empty = defineStructuralRoleDictionary(runtime.memory, []);
const app = (rule: LinkHandle): LinkHandle =>
  runtime.memory.ensure(
    runtime.memory.ensure(MEMBER, runtime.objectTheory),
    rule,
  );
const state = (rule: LinkHandle, result: LinkHandle): LinkHandle =>
  runtime.memory.ensure(app(rule), result);

const selectedBefore = state(selectedRule, rb.U);
const selectedAfter = state(selectedRule, rb.L);
const membershipRule = defineStructuralRule(
  runtime.memory,
  empty,
  runtime.memory.ensure(
    selectedBefore,
    materializeExactSequence(runtime.memory, [selectedAfter]),
  ),
);
const trustedRuntimeAdmission = admitStructuralRule(
  runtime.memory,
  runtime.executionTheory,
  membershipRule,
);
const triggerKey =
  runtime.memory.poles(runtime.memory.poles(selectedBefore).end).start;
runtime.memory.ensure(triggerKey, trustedRuntimeAdmission);

const interpreter = defineStructuralInterpreter(
  runtime.memory,
  empty,
  grammar,
  runtime.executionTheory,
);

function evaluate(rule: LinkHandle): LinkHandle {
  const initial = state(rule, rb.U);
  const scope = defineV013WorkingScope(
    runtime.memory,
    runtimeFresh(),
    interpreter,
    [initial],
  );
  const current = new V013CurrentScopeCursor(runtime.memory, scope);
  reactV013StructuralScope(runtime.memory, current, runtimeFresh());
  same(current.members().length, 1, "membership result remains single-valued");
  return runtime.memory.poles(current.members()[0]!).end;
}

same(evaluate(selectedRule), rb.L, "trusted selected member -> L");
same(evaluate(absentRule), rb.U, "closed absent member -> U");

// Loading an accepted candidate must not change outgoing authority surfaces.
// We model the post-validation shared-store materialization with a candidate
// that references ObjectTheory only as END data.
const outgoingBefore = runtime.protectedAnchors.map(
  (anchor) => runtime.memory.outgoing(anchor).length,
);
const sharedProofNode = runtime.memory.ensure(runtimeFresh(), absentRule);
const sharedValidCandidate = runtime.memory.ensure(
  sharedProofNode,
  runtime.objectTheory,
);
assert(
  sharedValidCandidate !== runtime.objectTheory,
  "valid candidate materialized as ordinary data",
);
const outgoingAfter = runtime.protectedAnchors.map(
  (anchor) => runtime.memory.outgoing(anchor).length,
);
same(
  JSON.stringify(outgoingAfter),
  JSON.stringify(outgoingBefore),
  "validated candidate leaves all protected authority outgoing sets unchanged",
);
same(evaluate(absentRule), rb.U, "valid candidate cannot self-authorize absence");

// The malicious candidates were rejected in isolation and therefore never enter
// the shared runtime. The frozen-runtime semantic behavior needs no new opcode.
same(
  runtime.memory.find(runtime.executionTheory, forgedRuntimeRule),
  undefined,
  "rejected hidden runtime admission never reaches shared Memory",
);

console.log([
  "MTS_V015_P1Y_CANDIDATE_AUTHORITY_CLOSURE=FALSIFIER_GREEN",
  "VALIDATION_PHASE=ISOLATED_PRELOAD_RECURSIVE_CLOSURE",
  "TOP_LEVEL_ONLY_VALIDATION=INSUFFICIENT",
  "PROTECTED_OBJECT_THEORY=TRUE",
  "PROTECTED_STATIC_APROVER_THEORY=TRUE",
  "PROTECTED_DERIVED_EXECUTION_THEORY=TRUE",
  "AUTHORITY_REFERENCE_AS_DATA=ALLOWED",
  "OUTGOING_FROM_PROTECTED_AUTHORITY=FORBIDDEN",
  "NESTED_EXECUTION_THEORY_INJECTION=REJECTED",
  "NESTED_OBJECT_THEORY_INJECTION=REJECTED",
  "NESTED_APROVER_THEORY_INJECTION=REJECTED",
  "VALID_CANDIDATE_CHANGES_AUTHORITY=FALSE",
  "CLOSED_ABSENCE_AFTER_VALID_CANDIDATE=U",
  "HOST_ROLE=GENERIC_TRANSPORT_VALIDATION_ONLY",
  "THEOREM_ID_DISPATCH=0",
  "PROOF_RULE_SEMANTICS_IN_HOST=0",
  "FROZEN_AMEMORY_CHANGE_REQUIRED=FALSE",
].join(" "));
