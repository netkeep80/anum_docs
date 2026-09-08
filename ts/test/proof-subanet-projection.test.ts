import {
  defineStructuralRoleDictionary,
  defineStructuralRule,
} from "../src/structural-rule.js";
import { defineStructuralDerivationRule } from "../src/derivation.js";
import { materializeExactSequence } from "../src/exact-sequence.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
} from "../src/memory.js";
import { replayRecursiveLinkIdentityProofAset } from "../src/recursive-link-identity-proof.js";
import { replayProofSubAnetProjection } from "../src/proof-subanet-projection.js";

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

const memory = new Memory();
const { R, O, C, L, U } = ensureRootBasis(memory);
const theory = memory.ensure(C, U);

// Arbitrary non-Nat relation identity proof. The projected left-pole identity
// is already an exact existing ProofOccurrence inside the recursive proof Anet.
const rootProof = identityProof(memory, R, R, []);
const oProof = identityProof(memory, O, O, [rootProof]);
const cProof = identityProof(memory, C, C, [rootProof]);
const lProof = identityProof(memory, L, L, [oProof, cProof]);
const uProof = identityProof(memory, U, U, [cProof, oProof]);

const left = memory.ensure(O, U);
const right = memory.ensure(C, L);
const leftProof = identityProof(memory, left, left, [oProof, uProof]);
const rightProof = identityProof(memory, right, right, [cProof, lProof]);
const relation = memory.ensure(left, right);
const relationProof = identityProof(memory, relation, relation, [leftProof, rightProof]);

const beforeIdentity = memory.linkCount;
replayRecursiveLinkIdentityProofAset(memory, relationProof);
same(memory.linkCount, beforeIdentity, "parent identity replay is read-only");

// Existing structural topology is used only as a one-premise projection schema.
// Neither the Rule nor the DR is admitted into Theory.
const A = memory.ensure(L, R);
const B = memory.ensure(R, L);
const dictionary = defineStructuralRoleDictionary(memory, [A, B]);
const relationTemplate = memory.ensure(A, B);
const premiseTemplate = memory.ensure(relationTemplate, relationTemplate);
const conclusionTemplate = memory.ensure(A, A);
const rule = defineStructuralRule(memory, dictionary, conclusionTemplate);
const dr = defineStructuralDerivationRule(memory, rule, [premiseTemplate]);

assert(memory.find(theory, rule) === undefined, "projection schema Rule stays unadmitted");
assert(memory.find(theory, dr) === undefined, "projection schema DR stays unadmitted");

const beforeProjection = memory.linkCount;
const replay = replayProofSubAnetProjection(memory, {
  theory,
  schemaDerivationRule: dr,
  premiseProofOccurrence: relationProof,
});

same(replay.theory, theory, "exact Theory coordinate");
same(replay.premiseClaim, memory.poles(relationProof).start, "exact premise Claim");
same(replay.projectedOccurrence, leftProof, "returns exact existing projected occurrence");
same(replay.projectedClaim, memory.poles(leftProof).start, "exact projected Claim");
same(replay.bindings.length, 2, "all schema roles bind from the premise Claim");
same(memory.linkCount, beforeProjection, "projection replay is read-only");

console.log("PROOF_SUBANET_PROJECTION = SUPPORTED");
console.log("K1_VALIDATED_CLOSURE_OBSERVABILITY = SUPPORTED");
