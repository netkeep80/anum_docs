import {
  admitStructuralDerivationRule,
  defineStructuralDerivationRule,
} from "../src/derivation.js";
import {
  materializeExactSequence,
  readExactSequence,
} from "../src/exact-sequence.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
} from "../src/memory.js";
import {
  exportPortableProofSubAnetProjection,
  replayPortableProofSubAnetProjection,
} from "../src/portable-proof-subanet-projection.js";
import {
  ProofSubAnetProjectionReplayError,
  replayProofSubAnetProjection,
} from "../src/proof-subanet-projection.js";
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

interface IdentityProof {
  readonly claim: LinkHandle;
  readonly occurrence: LinkHandle;
}

interface StructuralParent {
  readonly derivationRule: LinkHandle;
  readonly dependencySequence: LinkHandle;
  readonly occurrence: LinkHandle;
  readonly claim: LinkHandle;
}

function identityProof(
  memory: Memory,
  left: LinkHandle,
  right: LinkHandle,
  children: readonly LinkHandle[],
): IdentityProof {
  const claim = memory.ensure(left, right);
  const occurrence = memory.ensure(claim, materializeExactSequence(memory, children));
  return Object.freeze({ claim, occurrence });
}

function structuralParent(
  memory: Memory,
  theory: LinkHandle,
  premiseClaims: readonly LinkHandle[],
  dependencies: readonly LinkHandle[],
  claim: LinkHandle,
): StructuralParent {
  // The role is created after every premise/claim Link, so fixed premise
  // templates cannot accidentally contain it as a structural variable.
  const roleSeed = memory.ensure(claim, theory);
  const role = memory.ensure(roleSeed, memory.root);
  const dictionary = defineStructuralRoleDictionary(memory, [role]);
  const rule = defineStructuralRule(memory, dictionary, role);
  admitStructuralRule(memory, theory, rule);
  const derivationRule = defineStructuralDerivationRule(memory, rule, premiseClaims);
  admitStructuralDerivationRule(memory, theory, derivationRule);

  const dependencySequence = materializeExactSequence(memory, dependencies);
  const application = memory.ensure(derivationRule, dependencySequence);
  const occurrence = memory.ensure(claim, application);
  return Object.freeze({ derivationRule, dependencySequence, occurrence, claim });
}

function projectionSchema(
  memory: Memory,
  premiseOccurrence: LinkHandle,
  theory: LinkHandle,
  projectedClaim: LinkHandle,
): LinkHandle {
  // One generic role is bound only from the exact parent Claim. The projected
  // body is fixed data and the schema deliberately remains unadmitted.
  const roleSeed = memory.ensure(premiseOccurrence, theory);
  const role = memory.ensure(roleSeed, memory.root);
  const dictionary = defineStructuralRoleDictionary(memory, [role]);
  const rule = defineStructuralRule(memory, dictionary, projectedClaim);
  return defineStructuralDerivationRule(memory, rule, [role]);
}

function dependencyValues(
  replay: ReturnType<typeof replayPortableProofSubAnetProjection>,
): readonly LinkHandle[] {
  const occurrence = replay.memory.poles(replay.evidence.premiseProofOccurrence);
  const application = replay.memory.poles(occurrence.end);
  return readExactSequence(replay.memory, application.end).values;
}

function expectInvalidPremise(run: () => unknown, message: string): void {
  try {
    run();
  } catch (error) {
    assert(error instanceof ProofSubAnetProjectionReplayError, `${message}: wrong error class`);
    same(error.code, "invalid-premise-proof", `${message}: exact fail-closed code`);
    return;
  }
  throw new Error(`${message}: expected rejection`);
}

function duplicateFixture() {
  const memory = new Memory();
  const { R, O, C, L, U } = ensureRootBasis(memory);
  const theory = memory.ensure(C, U);

  const rootProof = identityProof(memory, R, R, []);
  const sharedProof = identityProof(memory, O, O, [rootProof.occurrence]);
  const targetClaim = memory.ensure(L, U);
  const parent = structuralParent(
    memory,
    theory,
    [sharedProof.claim, sharedProof.claim],
    [sharedProof.occurrence, sharedProof.occurrence],
    targetClaim,
  );
  const schemaDerivationRule = projectionSchema(
    memory,
    parent.occurrence,
    theory,
    sharedProof.claim,
  );

  return Object.freeze({
    memory,
    theory,
    sharedProof,
    parent,
    schemaDerivationRule,
  });
}

function orderedFixture(swapped: boolean) {
  const memory = new Memory();
  const { R, O, C, L, U } = ensureRootBasis(memory);
  const theory = memory.ensure(C, U);

  const rootProof = identityProof(memory, R, R, []);
  const firstProof = identityProof(memory, O, O, [rootProof.occurrence]);
  const secondProof = identityProof(memory, C, C, [rootProof.occurrence]);
  const targetClaim = memory.ensure(U, L);
  const dependencies = swapped
    ? [secondProof.occurrence, firstProof.occurrence]
    : [firstProof.occurrence, secondProof.occurrence];
  const parent = structuralParent(
    memory,
    theory,
    [firstProof.claim, secondProof.claim],
    dependencies,
    targetClaim,
  );
  const schemaDerivationRule = projectionSchema(
    memory,
    parent.occurrence,
    theory,
    firstProof.claim,
  );

  return Object.freeze({
    memory,
    theory,
    firstProof,
    secondProof,
    parent,
    schemaDerivationRule,
  });
}

async function main(): Promise<void> {
  // Positive: one canonical ProofOccurrence legitimately fills two exact slots.
  const duplicate = duplicateFixture();
  const evidence = Object.freeze({
    theory: duplicate.theory,
    schemaDerivationRule: duplicate.schemaDerivationRule,
    premiseProofOccurrence: duplicate.parent.occurrence,
  });
  const before = duplicate.memory.linkCount;
  const sourceReplay = replayProofSubAnetProjection(duplicate.memory, evidence);
  same(
    sourceReplay.projectedOccurrence,
    duplicate.sharedProof.occurrence,
    "source K1e selects the shared dependency proof",
  );
  same(duplicate.memory.linkCount, before, "source replay is read-only");

  const artifact = exportPortableProofSubAnetProjection(duplicate.memory, evidence);
  same(duplicate.memory.linkCount, before, "portable export is read-only");
  const restored = replayPortableProofSubAnetProjection(JSON.parse(JSON.stringify(artifact)));
  const restoredDependencies = dependencyValues(restored);
  same(restoredDependencies.length, 2, "portable round-trip preserves two dependency slots");
  same(
    restoredDependencies[0],
    restoredDependencies[1],
    "both restored slots retain the same ProofOccurrence",
  );
  same(
    restoredDependencies[0],
    restored.replay.projectedOccurrence,
    "restored shared dependency is the exact K1e-selected occurrence",
  );

  // Negative: losing one duplicate slot is not a normalization; it invalidates
  // the primitive two-premise structural occurrence before portability can bless it.
  const lost = duplicateFixture();
  const lostSequence = materializeExactSequence(lost.memory, [lost.sharedProof.occurrence]);
  const lostApplication = lost.memory.ensure(lost.parent.derivationRule, lostSequence);
  const lostOccurrence = lost.memory.ensure(lost.parent.claim, lostApplication);
  expectInvalidPremise(
    () => replayProofSubAnetProjection(lost.memory, {
      theory: lost.theory,
      schemaDerivationRule: lost.schemaDerivationRule,
      premiseProofOccurrence: lostOccurrence,
    }),
    "lost duplicate slot",
  );

  // Positive order control: two distinct dependency slots retain their order.
  const ordered = orderedFixture(false);
  const orderedArtifact = exportPortableProofSubAnetProjection(ordered.memory, {
    theory: ordered.theory,
    schemaDerivationRule: ordered.schemaDerivationRule,
    premiseProofOccurrence: ordered.parent.occurrence,
  });
  const orderedRestored = replayPortableProofSubAnetProjection(orderedArtifact);
  const orderedDependencies = dependencyValues(orderedRestored);
  same(orderedDependencies.length, 2, "ordered fixture retains two slots");
  same(
    orderedDependencies[0],
    orderedRestored.replay.projectedOccurrence,
    "first restored slot remains the first projected dependency",
  );
  assert(
    orderedDependencies[1] !== orderedDependencies[0],
    "second restored slot remains a distinct ProofOccurrence",
  );

  // Negative order control: [Y,X] cannot satisfy templates [claimX,claimY].
  const reordered = orderedFixture(true);
  expectInvalidPremise(
    () => replayProofSubAnetProjection(reordered.memory, {
      theory: reordered.theory,
      schemaDerivationRule: reordered.schemaDerivationRule,
      premiseProofOccurrence: reordered.parent.occurrence,
    }),
    "reordered ExactSequence",
  );

  console.log("PORTABLE_DUPLICATE_DEPENDENCY_SLOTS = SUPPORTED");
  console.log("PORTABLE_EXACT_SEQUENCE_ORDER = SUPPORTED");
  console.log("SET_NORMALIZATION = NOT USED");
  console.log("production delta = NONE");
  console.log("accepted semantic delta = NONE");
}

void main();
