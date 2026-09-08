import { materializeExactSequence } from "../src/exact-sequence.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
} from "../src/memory.js";
import {
  admitStructuralRule,
  defineStructuralRoleDictionary,
  defineStructuralRule,
} from "../src/structural-rule.js";
import {
  admitStructuralDerivationRule,
  defineStructuralDerivationRule,
} from "../src/derivation.js";
import { replayStructuralRootedProofAset } from "../src/rooted-proof-aset.js";
import { replayRecursiveLinkIdentityProofAset } from "../src/recursive-link-identity-proof.js";

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
  return memory.ensure(claim, materializeExactSequence(memory, children));
}

function proofOccurrence(
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

const memory = new Memory();
const { R, O, C, U } = ensureRootBasis(memory);
let cursor = memory.ensure(U, R);
const fresh = (): LinkHandle => (cursor = memory.ensure(cursor, R));
const theory = fresh();

// Arbitrary finite ROOT-grounded relation. No Nat/Succ/T4 structure participates.
const arbitraryStart = memory.ensureStartSelfClosed(C);
const arbitraryEnd = memory.ensureEndSelfClosed(O);
const x = memory.ensure(arbitraryStart, arbitraryEnd);
const identityClaim = memory.ensure(x, x);

// Complete accepted recursive identity proof for X = X.
const rootProof = identityProof(memory, R, R, []);
const oProof = identityProof(memory, O, O, [rootProof]);
const cProof = identityProof(memory, C, C, [rootProof]);
const startProof = identityProof(memory, arbitraryStart, arbitraryStart, [cProof]);
const endProof = identityProof(memory, arbitraryEnd, arbitraryEnd, [oProof]);
const xProof = identityProof(memory, x, x, [startProof, endProof]);

const identityBefore = memory.linkCount;
const identityReplay = replayRecursiveLinkIdentityProofAset(memory, xProof);
same(identityReplay.left, x, "identity left");
same(identityReplay.right, x, "identity right");
same(memory.poles(xProof).start, identityClaim, "proof root exact Claim");
same(memory.linkCount, identityBefore, "identity replay read-only");

// A primitive structural application consumes the exact identity Claim.
const premiseRole = fresh();
const conclusionRole = fresh();
const sourceDictionary = defineStructuralRoleDictionary(
  memory,
  [premiseRole, conclusionRole],
);
const primitiveRule = defineStructuralRule(memory, sourceDictionary, conclusionRole);
admitStructuralRule(memory, theory, primitiveRule);
const primitiveDR = defineStructuralDerivationRule(memory, primitiveRule, [premiseRole]);
admitStructuralDerivationRule(memory, theory, primitiveDR);

// Closed derived target: no target assumptions exist to hide the dependency.
const resultClaim = fresh();
const targetDictionary = defineStructuralRoleDictionary(memory, []);
const targetRule = defineStructuralRule(memory, targetDictionary, resultClaim);
admitStructuralRule(memory, theory, targetRule);
const targetDR = defineStructuralDerivationRule(memory, targetRule, []);
const targetIdentity = memory.ensure(targetDR, theory);
assert(memory.find(theory, targetDR) === undefined, "derived target DR stays unadmitted");

const resultOccurrence = proofOccurrence(memory, resultClaim, primitiveDR, [xProof]);
const root = memory.ensure(targetIdentity, resultOccurrence);

const before = memory.linkCount;
const replay = replayStructuralRootedProofAset(memory, root);
same(replay.conclusion, resultClaim, "mixed rooted conclusion");
same(replay.declaredAssumptionCount, 0, "closed proof has no assumptions");
same(replay.usedAssumptionCount, 0, "closed proof uses no assumptions");
same(memory.linkCount, before, "mixed rooted replay read-only");
console.log("MIXED_ROOTED_PROOF_ANET_DEPENDENCY = SUPPORTED");
