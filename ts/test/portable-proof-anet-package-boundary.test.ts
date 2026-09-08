import {
  Memory,
  PortableProofSubAnetProjectionError,
  PortableStructuralTheoryError,
  computePortableStructuralTheoryRevision,
  ensureRootBasis,
  exportPortableProofSubAnetProjection,
  exportPortableStructuralTheory,
  materializeHeterogeneousDerivedClosedRootedDischarge,
  materializeHeterogeneousDerivedOpenRootedExpansion,
  replayClosedProofOccurrence,
  replayPortableProofSubAnetProjection,
  replayProofSubAnetProjection,
  replayStructuralHeterogeneousDerivedClosedRootedInstance,
  replayStructuralHeterogeneousDerivedDerivationSchema,
  replayStructuralHeterogeneousDerivedOpenRootedInstance,
  verifyPortableProofSubAnetProjectionTheoryRevision,
  type LinkHandle,
} from "../src/public.js";
import { defineStructuralDerivationRule } from "../src/derivation.js";
import { materializeExactSequence } from "../src/exact-sequence.js";
import {
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
  return memory.ensure(
    memory.ensure(left, right),
    materializeExactSequence(memory, children),
  );
}

function fixture() {
  const memory = new Memory();
  const { R, O, C, L, U } = ensureRootBasis(memory);
  const theory = memory.ensure(C, U);

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

  const A = memory.ensure(L, R);
  const B = memory.ensure(R, L);
  const dictionary = defineStructuralRoleDictionary(memory, [A, B]);
  const relationTemplate = memory.ensure(A, B);
  const premiseTemplate = memory.ensure(relationTemplate, relationTemplate);
  const conclusionTemplate = memory.ensure(A, A);
  const rule = defineStructuralRule(memory, dictionary, conclusionTemplate);
  const schemaDerivationRule = defineStructuralDerivationRule(memory, rule, [premiseTemplate]);

  return Object.freeze({
    memory,
    basis: { R, O, C, L, U },
    theory,
    leftProof,
    evidence: Object.freeze({
      theory,
      schemaDerivationRule,
      premiseProofOccurrence: relationProof,
    }),
  });
}

async function expectTheoryError(
  run: () => Promise<void>,
  code: PortableStructuralTheoryError["code"],
): Promise<void> {
  try {
    await run();
  } catch (error) {
    assert(error instanceof PortableStructuralTheoryError, `expected Theory error ${code}`);
    same(error.code, code, `Theory error ${code}`);
    return;
  }
  throw new Error(`expected Theory error ${code}`);
}

function expectFailure(run: () => unknown, message: string): void {
  try {
    run();
  } catch {
    return;
  }
  throw new Error(message);
}

async function main(): Promise<void> {
  // Compile-time/package-root witnesses for accepted generic proof-calculus laws.
  // These are existing operations only; this test does not introduce new proof semantics.
  void [
    replayClosedProofOccurrence,
    replayProofSubAnetProjection,
    replayStructuralHeterogeneousDerivedDerivationSchema,
    replayStructuralHeterogeneousDerivedOpenRootedInstance,
    replayStructuralHeterogeneousDerivedClosedRootedInstance,
    materializeHeterogeneousDerivedOpenRootedExpansion,
    materializeHeterogeneousDerivedClosedRootedDischarge,
  ];

  const source = fixture();
  const before = source.memory.linkCount;
  const artifact = exportPortableProofSubAnetProjection(source.memory, source.evidence);
  same(source.memory.linkCount, before, "portable export stays read-only");

  const replayed = replayPortableProofSubAnetProjection(artifact);
  assert(
    replayed.replay.projectedOccurrence !== replayed.evidence.premiseProofOccurrence,
    "portable replay recomputes a descendant occurrence",
  );

  const expectedTheory = exportPortableStructuralTheory(source.memory, source.theory);
  const expectedRevision = await computePortableStructuralTheoryRevision(expectedTheory);
  await verifyPortableProofSubAnetProjectionTheoryRevision(
    artifact,
    expectedTheory,
    expectedRevision,
  );
  same(source.memory.linkCount, before, "external Theory verification stays read-only");

  await expectTheoryError(
    () => verifyPortableProofSubAnetProjectionTheoryRevision(
      artifact,
      expectedTheory,
      { ...expectedRevision, value: "0".repeat(64) },
    ),
    "theory-revision-mismatch",
  );

  const otherTheory = source.memory.ensure(source.basis.U, source.basis.C);
  const otherTheoryArtifact = exportPortableStructuralTheory(source.memory, otherTheory);
  const otherTheoryRevision = await computePortableStructuralTheoryRevision(otherTheoryArtifact);
  await expectTheoryError(
    () => verifyPortableProofSubAnetProjectionTheoryRevision(
      artifact,
      otherTheoryArtifact,
      otherTheoryRevision,
    ),
    "proof-theory-mismatch",
  );

  expectFailure(
    () => replayPortableProofSubAnetProjection({
      ...artifact,
      schemaDerivationRuleCoordinate: artifact.theoryCoordinate,
    }),
    "mutated ProjectionSchema coordinate must reject",
  );

  for (const hostile of [
    { ...artifact, projectedOccurrence: artifact.premiseProofOccurrenceCoordinate },
    { ...artifact, rho: [[artifact.theoryCoordinate, artifact.premiseProofOccurrenceCoordinate]] },
    { ...artifact, proofKind: "identity" },
    { ...artifact, proved: true },
  ]) {
    try {
      replayPortableProofSubAnetProjection(hostile);
    } catch (error) {
      assert(error instanceof PortableProofSubAnetProjectionError, "host authority must fail at envelope parse");
      same(error.code, "invalid-envelope", "host authority envelope rejection");
      continue;
    }
    throw new Error("host authority field must reject");
  }

  console.log("PORTABLE_PROOF_ANET_EXACT_THEORY_BINDING = SUPPORTED");
  console.log("PORTABLE_PROOF_ANET_PACKAGE_ROOT = SUPPORTED");
  console.log("PORTABLE_PROOF_ANET_GENERIC_SECURITY = GREEN");
  console.log("accepted semantic delta = NONE");
}

void main();
