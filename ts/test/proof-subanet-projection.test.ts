import {
  admitStructuralRule,
  defineStructuralRoleDictionary,
  defineStructuralRule,
} from "../src/structural-rule.js";
import {
  admitStructuralDerivationRule,
  defineStructuralDerivationRule,
} from "../src/derivation.js";
import { materializeExactSequence } from "../src/exact-sequence.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
} from "../src/memory.js";
import { replayRecursiveLinkIdentityProofAset } from "../src/recursive-link-identity-proof.js";
import { replayClosedProofOccurrence } from "../src/rooted-proof-aset.js";
import {
  ProofSubAnetProjectionReplayError,
  replayProofSubAnetProjection,
} from "../src/proof-subanet-projection.js";
import { exportPortableStructuralTheory } from "../src/portable-theory.js";
import { computePortableStructuralTheoryRevision } from "../src/portable-theory-digest.js";

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

function expectProjectionError(
  memory: Memory,
  label: string,
  expectedCode: string,
  effect: () => unknown,
): void {
  const before = memory.linkCount;
  try {
    effect();
  } catch (error) {
    assert(error instanceof ProofSubAnetProjectionReplayError, `${label}: stable projection error`);
    same(error.code, expectedCode, `${label}: exact failure code`);
    same(memory.linkCount, before, `${label}: failure remains read-only`);
    return;
  }
  throw new Error(`${label}: expected projection rejection`);
}

async function main(): Promise<void> {
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
  const relationClaim = memory.poles(relationProof).start;
  const leftClaim = memory.poles(leftProof).start;

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

  const revisionBefore = await computePortableStructuralTheoryRevision(
    exportPortableStructuralTheory(memory, theory),
  );
  const beforeProjection = memory.linkCount;
  const replay = replayProofSubAnetProjection(memory, {
    theory,
    schemaDerivationRule: dr,
    premiseProofOccurrence: relationProof,
  });

  same(replay.theory, theory, "exact Theory coordinate");
  same(replay.premiseClaim, relationClaim, "exact premise Claim");
  same(replay.projectedOccurrence, leftProof, "returns exact existing projected occurrence");
  same(replay.projectedClaim, leftClaim, "exact projected Claim");
  same(replay.bindings.length, 2, "all schema roles bind from the premise Claim");
  same(memory.linkCount, beforeProjection, "projection replay is read-only");

  const revisionAfter = await computePortableStructuralTheoryRevision(
    exportPortableStructuralTheory(memory, theory),
  );
  same(revisionAfter.scheme, revisionBefore.scheme, "Theory revision scheme unchanged");
  same(revisionAfter.value, revisionBefore.value, "exact Theory revision unchanged");

  // Invalid/foreign parent proof authority is rejected before projection.
  const foreignMemory = new Memory();
  expectProjectionError(
    memory,
    "foreign parent occurrence",
    "invalid-premise-proof",
    () => replayProofSubAnetProjection(memory, {
      theory,
      schemaDerivationRule: dr,
      premiseProofOccurrence: foreignMemory.root,
    }),
  );

  // ProjectionSchema is exactly one-premise data, never a variadic host convention.
  const zeroPremiseDr = defineStructuralDerivationRule(memory, rule, []);
  expectProjectionError(
    memory,
    "zero-premise projection schema",
    "unsupported-schema-arity",
    () => replayProofSubAnetProjection(memory, {
      theory,
      schemaDerivationRule: zeroPremiseDr,
      premiseProofOccurrence: relationProof,
    }),
  );
  const twoPremiseDr = defineStructuralDerivationRule(
    memory,
    rule,
    [premiseTemplate, premiseTemplate],
  );
  expectProjectionError(
    memory,
    "two-premise projection schema",
    "unsupported-schema-arity",
    () => replayProofSubAnetProjection(memory, {
      theory,
      schemaDerivationRule: twoPremiseDr,
      premiseProofOccurrence: relationProof,
    }),
  );

  // Every declared Role must be inferred from the premise Claim alone.
  const unboundRole = memory.ensure(A, C);
  const unboundDictionary = defineStructuralRoleDictionary(memory, [A, B, unboundRole]);
  const unboundRule = defineStructuralRule(memory, unboundDictionary, conclusionTemplate);
  const unboundDr = defineStructuralDerivationRule(memory, unboundRule, [premiseTemplate]);
  expectProjectionError(
    memory,
    "unbound schema role",
    "unbound-schema-role",
    () => replayProofSubAnetProjection(memory, {
      theory,
      schemaDerivationRule: unboundDr,
      premiseProofOccurrence: relationProof,
    }),
  );

  // One Role forced onto two different actual poles is an inconsistent substitution.
  const oneRoleDictionary = defineStructuralRoleDictionary(memory, [A]);
  const repeatedRoleRelation = memory.ensure(A, A);
  const inconsistentPremise = memory.ensure(repeatedRoleRelation, repeatedRoleRelation);
  const inconsistentRule = defineStructuralRule(memory, oneRoleDictionary, conclusionTemplate);
  const inconsistentDr = defineStructuralDerivationRule(
    memory,
    inconsistentRule,
    [inconsistentPremise],
  );
  expectProjectionError(
    memory,
    "inconsistent premise substitution",
    "invalid-premise-substitution",
    () => replayProofSubAnetProjection(memory, {
      theory,
      schemaDerivationRule: inconsistentDr,
      premiseProofOccurrence: relationProof,
    }),
  );

  // A schema conclusion that has no matching Claim in the validated closure cannot
  // gain authority from ambient Memory reachability.
  const absentRule = defineStructuralRule(memory, dictionary, relationTemplate);
  const absentDr = defineStructuralDerivationRule(memory, absentRule, [premiseTemplate]);
  expectProjectionError(
    memory,
    "projection absent from validated closure",
    "projection-not-found",
    () => replayProofSubAnetProjection(memory, {
      theory,
      schemaDerivationRule: absentDr,
      premiseProofOccurrence: relationProof,
    }),
  );

  // A distinct K1-valid structural ProofOccurrence with the same projected Claim
  // remains powerless while it is outside the parent validated closure.
  const emptyDictionary = defineStructuralRoleDictionary(memory, []);
  const duplicateRule = defineStructuralRule(memory, emptyDictionary, leftClaim);
  admitStructuralRule(memory, theory, duplicateRule);
  const duplicateDr = defineStructuralDerivationRule(memory, duplicateRule, []);
  admitStructuralDerivationRule(memory, theory, duplicateDr);
  const unreachableSameClaim = proofOccurrence(memory, leftClaim, duplicateDr, []);
  const duplicateReplay = replayClosedProofOccurrence(memory, theory, unreachableSameClaim);
  same(duplicateReplay.claim, leftClaim, "unreachable same-Claim occurrence is independently K1-valid");

  const afterUnreachable = replayProofSubAnetProjection(memory, {
    theory,
    schemaDerivationRule: dr,
    premiseProofOccurrence: relationProof,
  });
  same(afterUnreachable.projectedOccurrence, leftProof, "unreachable same-Claim proof has zero authority");

  // Even an explicit ambient Parent->Child Link is not proof-subAnet provenance.
  memory.ensure(relationProof, unreachableSameClaim);
  const afterAmbientLink = replayProofSubAnetProjection(memory, {
    theory,
    schemaDerivationRule: dr,
    premiseProofOccurrence: relationProof,
  });
  same(afterAmbientLink.projectedOccurrence, leftProof, "ambient Parent->Child Link has zero authority");

  // Host metadata is transport noise: neither a projected occurrence nor rho can
  // override topology-derived selection.
  const hintedEvidence = {
    theory,
    schemaDerivationRule: dr,
    premiseProofOccurrence: relationProof,
    projectedOccurrence: rightProof,
    rho: new Map<LinkHandle, LinkHandle>([[A, right], [B, left]]),
  };
  const hintedReplay = replayProofSubAnetProjection(memory, hintedEvidence);
  same(hintedReplay.projectedOccurrence, leftProof, "host projection/rho metadata has zero authority");

  // ProjectionSchema admission is irrelevant: the same exact result was obtained
  // above while unadmitted, and remains the same after admission.
  admitStructuralRule(memory, theory, rule);
  admitStructuralDerivationRule(memory, theory, dr);
  const admittedSchemaReplay = replayProofSubAnetProjection(memory, {
    theory,
    schemaDerivationRule: dr,
    premiseProofOccurrence: relationProof,
  });
  same(admittedSchemaReplay.projectedOccurrence, leftProof, "schema admission grants no projection authority");

  // A structural parent is valid only under the exact Theory that admits its own
  // primitive Rule/DR. Its dependency closure still projects the same identity child.
  const parentRule = defineStructuralRule(memory, emptyDictionary, relationClaim);
  admitStructuralRule(memory, theory, parentRule);
  const parentDr = defineStructuralDerivationRule(memory, parentRule, [relationClaim]);
  admitStructuralDerivationRule(memory, theory, parentDr);
  const structuralParent = proofOccurrence(memory, relationClaim, parentDr, [relationProof]);
  const structuralParentReplay = replayProofSubAnetProjection(memory, {
    theory,
    schemaDerivationRule: dr,
    premiseProofOccurrence: structuralParent,
  });
  same(structuralParentReplay.projectedOccurrence, leftProof, "structural parent projects reachable child");

  const wrongTheory = memory.ensure(U, C);
  expectProjectionError(
    memory,
    "wrong Theory structural parent",
    "invalid-premise-proof",
    () => replayProofSubAnetProjection(memory, {
      theory: wrongTheory,
      schemaDerivationRule: dr,
      premiseProofOccurrence: structuralParent,
    }),
  );
  expectProjectionError(
    memory,
    "foreign Theory structural parent",
    "invalid-premise-proof",
    () => replayProofSubAnetProjection(memory, {
      theory: foreignMemory.root,
      schemaDerivationRule: dr,
      premiseProofOccurrence: structuralParent,
    }),
  );

  // >1 is constructible without test hooks: two distinct K1-valid occurrences
  // carry the same leftClaim inside one structural parent's validated closure.
  const ambiguousParentRule = defineStructuralRule(memory, emptyDictionary, relationClaim);
  admitStructuralRule(memory, theory, ambiguousParentRule);
  const ambiguousParentDr = defineStructuralDerivationRule(
    memory,
    ambiguousParentRule,
    [leftClaim, leftClaim],
  );
  admitStructuralDerivationRule(memory, theory, ambiguousParentDr);
  const ambiguousParent = proofOccurrence(
    memory,
    relationClaim,
    ambiguousParentDr,
    [leftProof, unreachableSameClaim],
  );
  expectProjectionError(
    memory,
    "multiple matching validated occurrences",
    "ambiguous-projection",
    () => replayProofSubAnetProjection(memory, {
      theory,
      schemaDerivationRule: dr,
      premiseProofOccurrence: ambiguousParent,
    }),
  );

  // Failed/ambiguous calls leave no replay state that can influence a later valid call.
  const replayAfterFailures = replayProofSubAnetProjection(memory, {
    theory,
    schemaDerivationRule: dr,
    premiseProofOccurrence: relationProof,
  });
  same(replayAfterFailures.projectedOccurrence, leftProof, "failed candidates leave no authority residue");

  console.log("PROOF_SUBANET_PROJECTION = SUPPORTED");
  console.log("K1_VALIDATED_CLOSURE_OBSERVABILITY = SUPPORTED");
  console.log("PROJECTION_SCHEMA_ADMISSION_AUTHORITY = NOT REQUIRED");
  console.log("HOST_PROJECTION_AUTHORITY = NONE");
  console.log("PROJECTION_0_1_MANY = FAIL_CLOSED");
  console.log("K1E_SECURITY_CORPUS = GREEN");
  console.log("accepted semantic delta = NONE");
}

void main();
