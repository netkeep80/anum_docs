import { materializeExactSequence } from "../src/exact-sequence.js";
import {
  Memory,
  ensureRootBasis,
  verifyRootBasis,
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
import {
  replayRecursiveLinkIdentityProofAset,
  replayRecursiveLinkIdentityProofClosure,
} from "../src/recursive-link-identity-proof.js";
import {
  StructuralRootedProofAsetReplayError,
  replayClosedProofOccurrence,
} from "../src/rooted-proof-aset.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
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

function primitiveSemanticBoundaryProof(
  memory: Memory,
  theory: LinkHandle,
  claim: LinkHandle,
  supportRoles: readonly LinkHandle[] = [],
): {
  readonly rule: LinkHandle;
  readonly derivationRule: LinkHandle;
  readonly occurrence: LinkHandle;
} {
  const dictionary = defineStructuralRoleDictionary(memory, supportRoles);
  const rule = defineStructuralRule(memory, dictionary, claim);
  const derivationRule = defineStructuralDerivationRule(memory, rule, []);
  admitStructuralRule(memory, theory, rule);
  admitStructuralDerivationRule(memory, theory, derivationRule);
  const occurrence = memory.ensure(
    claim,
    memory.ensure(derivationRule, materializeExactSequence(memory, [])),
  );
  return Object.freeze({ rule, derivationRule, occurrence });
}

function expectClosedProofReject(
  effect: () => unknown,
  message: string,
): void {
  try {
    effect();
  } catch (error) {
    assert(
      error instanceof StructuralRootedProofAsetReplayError,
      `${message}: wrong error type`,
    );
    return;
  }
  throw new Error(`${message}: expected rejection`);
}

function main(): void {
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  const { R, O, C, L, U } = verifyRootBasis(memory, basis);

  const theory = memory.ensure(C, U);
  const foreignTheory = memory.ensure(U, C);
  assert(theory !== foreignTheory, "selected and foreign proof Theories are distinct");

  // -------------------------------------------------------------------------
  // Structural coordinate.
  //
  // This is intrinsic recursive Link-identity / root-basis evidence only.
  // It does not mention the semantic word "truth".
  // -------------------------------------------------------------------------
  const rootProof = identityProof(memory, R, R, []);
  const oProof = identityProof(memory, O, O, [rootProof]);
  const cProof = identityProof(memory, C, C, [rootProof]);
  const lProof = identityProof(memory, L, L, [oProof, cProof]);

  const beforeStructuralReplay = memory.linkCount;
  const structural = replayRecursiveLinkIdentityProofClosure(memory, lProof);
  same(structural.left, L, "structural replay left Link");
  same(structural.right, L, "structural replay right Link");
  same(memory.linkCount, beforeStructuralReplay, "structural replay is read-only");

  const lPoles = memory.poles(L);
  same(lPoles.start, O, "verified RootBasis gives L start pole O");
  same(lPoles.end, C, "verified RootBasis gives L end pole C");
  assert(L !== O && L !== C && O !== C, "L is an ordinary root-basis PAIR aspect");

  const structuralClaims = new Map(
    structural.validatedOccurrences.map(({ occurrence, claim }) => [occurrence, claim]),
  );
  same(
    structuralClaims.get(oProof),
    memory.poles(oProof).start,
    "L structural proof carries exact O identity descendant",
  );
  same(
    structuralClaims.get(cProof),
    memory.poles(cProof).start,
    "L structural proof carries exact C identity descendant",
  );

  const closedStructural = replayClosedProofOccurrence(memory, theory, lProof);
  same(
    closedStructural.claim,
    memory.poles(lProof).start,
    "generic CLOSED K1 accepts intrinsic L structural identity",
  );

  // -------------------------------------------------------------------------
  // Accepted A16 semantic-role coordinate.
  //
  // The tag is proof syntax for an explicitly accepted semantic-definition
  // boundary. It is not inferred from PAIR topology or ambient Link existence.
  // -------------------------------------------------------------------------
  let fresh = memory.ensure(L, U);
  const nextFresh = (): LinkHandle => {
    fresh = memory.ensure(fresh, O);
    return fresh;
  };
  const truthRoleTag = nextFresh();
  const truthRole = (link: LinkHandle): LinkHandle =>
    memory.ensure(truthRoleTag, link);

  const lTruthRoleClaim = truthRole(L);
  const uTruthRoleClaim = truthRole(U);
  assert(
    lTruthRoleClaim !== memory.poles(lProof).start,
    "semantic truth-role Claim is distinct from intrinsic L identity Claim",
  );
  assert(
    lTruthRoleClaim !== L,
    "raw L existence is not the semantic-role Claim",
  );

  const lTruthBoundary = primitiveSemanticBoundaryProof(
    memory,
    theory,
    lTruthRoleClaim,
  );

  const beforeRoleReplay = memory.linkCount;
  const acceptedRole = replayClosedProofOccurrence(
    memory,
    theory,
    lTruthBoundary.occurrence,
  );
  same(acceptedRole.claim, lTruthRoleClaim, "selected Theory proves exact A16 role Claim");
  same(memory.linkCount, beforeRoleReplay, "semantic-role replay is read-only");

  // The structural proof remains only an identity proof. K1 never reinterprets
  // it as the semantic role merely because L has O/C pair topology.
  const structuralAgain = replayClosedProofOccurrence(memory, theory, lProof);
  assert(
    structuralAgain.claim !== lTruthRoleClaim,
    "PAIR/root-basis structure does not imply A16 truth role",
  );

  // Same role tag applied to another Link proves another exact Claim only.
  const uTruthBoundary = primitiveSemanticBoundaryProof(
    memory,
    theory,
    uTruthRoleClaim,
  );
  const acceptedURole = replayClosedProofOccurrence(
    memory,
    theory,
    uTruthBoundary.occurrence,
  );
  same(acceptedURole.claim, uTruthRoleClaim, "role witness for U proves only U role Claim");
  assert(
    acceptedURole.claim !== lTruthRoleClaim,
    "role witness for another Link cannot establish L role",
  );

  // A structurally distinct proof for the exact L role admitted only under a
  // foreign Theory cannot acquire authority from the selected Theory.
  const foreignSupportRole = nextFresh();
  const foreignLTruthBoundary = primitiveSemanticBoundaryProof(
    memory,
    foreignTheory,
    lTruthRoleClaim,
    [foreignSupportRole],
  );
  assert(
    memory.find(theory, foreignLTruthBoundary.rule) === undefined,
    "foreign semantic-role Rule absent from selected Theory",
  );
  assert(
    memory.find(theory, foreignLTruthBoundary.derivationRule) === undefined,
    "foreign semantic-role DR absent from selected Theory",
  );
  expectClosedProofReject(
    () => replayClosedProofOccurrence(memory, theory, foreignLTruthBoundary.occurrence),
    "foreign-Theory A16 role proof",
  );

  // A forged/unadmitted semantic-role occurrence also fails even while the
  // intrinsic L structural proof remains valid.
  const unadmittedRole = nextFresh();
  const unadmittedRule = defineStructuralRule(
    memory,
    defineStructuralRoleDictionary(memory, [unadmittedRole]),
    lTruthRoleClaim,
  );
  const unadmittedDR = defineStructuralDerivationRule(memory, unadmittedRule, []);
  const unadmittedOccurrence = memory.ensure(
    lTruthRoleClaim,
    memory.ensure(unadmittedDR, materializeExactSequence(memory, [])),
  );
  same(memory.find(theory, unadmittedRule), undefined, "unadmitted role Rule stays absent");
  same(memory.find(theory, unadmittedDR), undefined, "unadmitted role DR stays absent");
  replayRecursiveLinkIdentityProofAset(memory, lProof);
  expectClosedProofReject(
    () => replayClosedProofOccurrence(memory, theory, unadmittedOccurrence),
    "unadmitted A16 role proof",
  );

  // Host labels do not alter either exact Claim or replay authority.
  const noisyMetadata = Object.freeze({
    theoremId: "FND-07",
    truth: true,
    proofOccurrence: lProof,
  });
  same(noisyMetadata.proofOccurrence, lProof, "host metadata points only to existing structural proof");
  const metadataReplay = replayClosedProofOccurrence(
    memory,
    theory,
    noisyMetadata.proofOccurrence,
  );
  assert(
    metadataReplay.claim !== lTruthRoleClaim,
    "host theorem/truth metadata grants zero semantic-role authority",
  );

  console.log("FND07_ROOT_PAIR_STRUCTURAL_COMPONENT = KERNEL_REPLAYED");
  console.log("FND07_A16_TRUTH_ROLE = ACCEPTED_SEMANTIC_BOUNDARY_EXPLICIT");
  console.log("PAIR_STRUCTURE_IMPLIES_TRUTH_ROLE = FALSE");
  console.log("FOREIGN_OR_UNADMITTED_TRUTH_ROLE = REJECTED");
  console.log("HOST_TRUTH_METADATA_AUTHORITY = NONE");
  console.log("FULL_FND07_NATIVE_ACCEPT = NOT_YET");
  console.log("accepted semantic delta = NONE");
}

main();
