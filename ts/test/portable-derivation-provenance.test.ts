import { materializeExactSequence } from "../src/exact-sequence.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
} from "../src/memory.js";
import { computePortableStructuralDerivationContentDigest } from "../src/portable-derivation-digest.js";
import {
  PORTABLE_STRUCTURAL_DERIVATION_PROVENANCE_DIGEST_SCHEME,
  PORTABLE_STRUCTURAL_DERIVATION_PROVENANCE_SCHEMA,
  PortableStructuralDerivationProvenanceError,
  canonicalPortableStructuralDerivationProvenanceClaimJson,
  computePortableStructuralDerivationProvenanceDigest,
  createPortableStructuralDerivationProvenanceClaim,
  verifyPortableStructuralDerivationProvenanceClaim,
  type PortableStructuralDerivationProducerProvenance,
  type PortableStructuralDerivationSourceProvenance,
} from "../src/portable-derivation-provenance.js";
import {
  exportPortableStructuralDerivation,
  replayPortableStructuralDerivation,
} from "../src/portable-derivation.js";
import { defineContext } from "../src/state.js";
import { defineActField, defineActHeader } from "../src/structural-readers.js";
import {
  admitStructuralRule,
  defineStructuralInterpreter,
  defineStructuralRoleDictionary,
  defineStructuralRule,
  type StructuralInterpreter,
} from "../src/structural-rule.js";
import {
  StructuralDerivationReplayError,
  admitStructuralDerivationRule,
  defineStructuralDerivationRule,
  defineStructuralProofOccurrence,
  type StructuralDerivationEvidence,
  type StructuralJudgmentEvidence,
} from "../src/derivation.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

async function expectProvenance(
  code: PortableStructuralDerivationProvenanceError["code"],
  effect: () => Promise<unknown>,
): Promise<void> {
  try {
    await effect();
  } catch (error) {
    assert(error instanceof PortableStructuralDerivationProvenanceError, `${code}: wrong error type`);
    same(error.code, code, `${code}: wrong error code`);
    return;
  }
  throw new Error(`${code}: expected provenance rejection`);
}

function expectReplayReject(effect: () => unknown): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof StructuralDerivationReplayError, "expected generic derivation rejection");
    return;
  }
  throw new Error("expected generic derivation rejection");
}

function fixture(): {
  readonly memory: Memory;
  readonly evidence: StructuralDerivationEvidence;
} {
  const memory = new Memory();
  const { R, U } = ensureRootBasis(memory);
  let cursor = U;
  const fresh = (): LinkHandle => (cursor = memory.ensure(cursor, R));
  const dictionary = fresh();
  const grammar = fresh();
  const theory = fresh();
  const context = defineContext(memory, fresh(), fresh());
  const role = fresh();
  const value = fresh();
  const expectedInterpreter: StructuralInterpreter = { dictionary, grammar, theory };
  const interpreter = defineStructuralInterpreter(memory, dictionary, grammar, theory);
  const roleDictionary = defineStructuralRoleDictionary(memory, [role]);
  const rule = defineStructuralRule(memory, roleDictionary, role);
  const ruleAdmission = admitStructuralRule(memory, theory, rule);
  const act = defineActHeader(memory, interpreter, roleDictionary, context);
  defineActField(memory, act, role, value);
  const judgment: StructuralJudgmentEvidence = {
    application: {
      act,
      rule,
      ruleAdmission,
      claimedBody: value,
      expectedInterpreter,
      expectedAfterContext: context,
    },
    judgment: { theory, context, claim: value },
  };
  const occurrence = defineStructuralProofOccurrence(memory, act, value);
  const derivationRule = defineStructuralDerivationRule(memory, rule, []);
  return {
    memory,
    evidence: {
      theory,
      targetOccurrence: occurrence,
      nodes: [{
        occurrence,
        judgment,
        derivationRule,
        derivationRuleAdmission: admitStructuralDerivationRule(memory, theory, derivationRule),
        premiseOccurrenceSequence: materializeExactSequence(memory, []),
      }],
    },
  };
}

function reverseObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reverseObjectKeys);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .reverse()
      .map(([key, nested]) => [key, reverseObjectKeys(nested)]),
  );
}

async function main(): Promise<void> {
  const fx = fixture();
  const artifact = exportPortableStructuralDerivation(fx.memory, fx.evidence);
  const source: PortableStructuralDerivationSourceProvenance = {
    locator: "https://github.com/leanprover-community/mathlib4",
    revision: "0123456789abcdef0123456789abcdef01234567",
    subject: "Mathlib.Example.theorem",
  };
  const producer: PortableStructuralDerivationProducerProvenance = {
    id: "mts-proof-importer",
    version: "0.1.0",
  };
  const before = fx.memory.linkCount;
  const directContent = await computePortableStructuralDerivationContentDigest(artifact);
  const claim = await createPortableStructuralDerivationProvenanceClaim(artifact, source, producer);
  same(claim.schema, PORTABLE_STRUCTURAL_DERIVATION_PROVENANCE_SCHEMA, "claim schema is pinned");
  same(claim.contentDigest.value, directContent.value, "claim binds recomputed content digest");
  same(fx.memory.linkCount, before, "claim creation remains source read-only");

  const digest = await computePortableStructuralDerivationProvenanceDigest(claim);
  same(digest.scheme, PORTABLE_STRUCTURAL_DERIVATION_PROVENANCE_DIGEST_SCHEME, "provenance digest scheme is pinned");
  assert(/^[0-9a-f]{64}$/.test(digest.value), "provenance digest must be lowercase 64-hex");
  const repeated = await computePortableStructuralDerivationProvenanceDigest(claim);
  same(repeated.value, digest.value, "repeated provenance digest is stable");

  const reordered = reverseObjectKeys(claim);
  same(
    canonicalPortableStructuralDerivationProvenanceClaimJson(reordered),
    canonicalPortableStructuralDerivationProvenanceClaimJson(claim),
    "object key order has no provenance authority",
  );
  const reorderedDigest = await computePortableStructuralDerivationProvenanceDigest(reordered);
  same(reorderedDigest.value, digest.value, "object key order leaves provenance digest stable");

  for (const [label, changedSource, changedProducer] of [
    ["locator", { ...source, locator: `${source.locator}/` }, producer],
    ["revision", { ...source, revision: `${source.revision}x` }, producer],
    ["subject", { ...source, subject: `${source.subject}.changed` }, producer],
    ["producer-id", source, { ...producer, id: `${producer.id}.changed` }],
    ["producer-version", source, { ...producer, version: `${producer.version}+changed` }],
  ] as const) {
    const changedClaim = await createPortableStructuralDerivationProvenanceClaim(
      artifact,
      changedSource,
      changedProducer,
    );
    const changedDigest = await computePortableStructuralDerivationProvenanceDigest(changedClaim);
    assert(changedDigest.value !== digest.value, `${label} must change provenance digest`);
  }

  const valid = await verifyPortableStructuralDerivationProvenanceClaim(artifact, claim);
  same(valid.contentDigest.value, claim.contentDigest.value, "valid claim verifies against artifact");
  same(fx.memory.linkCount, before, "digest and verification remain source read-only");

  const junkA = fx.memory.ensure(fx.evidence.theory, fx.evidence.theory);
  fx.memory.ensure(junkA, fx.evidence.theory);
  const ambientArtifact = exportPortableStructuralDerivation(fx.memory, fx.evidence);
  same(JSON.stringify(ambientArtifact), JSON.stringify(artifact), "ambient growth leaves v0.2 artifact stable");
  const ambientClaim = await createPortableStructuralDerivationProvenanceClaim(ambientArtifact, source, producer);
  const ambientDigest = await computePortableStructuralDerivationProvenanceDigest(ambientClaim);
  same(ambientDigest.value, digest.value, "ambient growth leaves provenance digest stable");

  await expectProvenance("unsupported-schema", () => computePortableStructuralDerivationProvenanceDigest({
    ...claim,
    schema: "mts-portable-structural-derivation-provenance/v999",
  }));
  await expectProvenance("invalid-content-digest", () => computePortableStructuralDerivationProvenanceDigest({
    ...claim,
    contentDigest: { ...claim.contentDigest, scheme: "sha256" },
  }));
  await expectProvenance("invalid-content-digest", () => computePortableStructuralDerivationProvenanceDigest({
    ...claim,
    contentDigest: { ...claim.contentDigest, value: claim.contentDigest.value.toUpperCase() },
  }));
  await expectProvenance("invalid-provenance-string", () => computePortableStructuralDerivationProvenanceDigest({
    ...claim,
    source: { ...claim.source, revision: "   " },
  }));
  await expectProvenance("invalid-envelope", () => computePortableStructuralDerivationProvenanceDigest({
    ...claim,
    trusted: true,
  }));
  await expectProvenance("invalid-envelope", () => computePortableStructuralDerivationProvenanceDigest({
    ...claim,
    source: { ...claim.source, signature: "not-authority" },
  }));

  const forgedClaim = {
    ...claim,
    contentDigest: { ...claim.contentDigest, value: "0".repeat(64) },
  };
  const forgedClaimDigest = await computePortableStructuralDerivationProvenanceDigest(forgedClaim);
  assert(forgedClaimDigest.value !== digest.value, "structurally valid forged claim has distinct identity");
  await expectProvenance(
    "content-digest-mismatch",
    () => verifyPortableStructuralDerivationProvenanceClaim(artifact, forgedClaim),
  );

  assert(artifact.theoryCoordinate !== 0, "fixture theory coordinate must make proof forgery observable");
  const forgedArtifact = { ...artifact, theoryCoordinate: 0 };
  const forgedProofClaim = await createPortableStructuralDerivationProvenanceClaim(
    forgedArtifact,
    source,
    producer,
  );
  const forgedProofDigest = await computePortableStructuralDerivationProvenanceDigest(forgedProofClaim);
  assert(forgedProofDigest.value !== digest.value, "proof mutation changes bound provenance identity");
  expectReplayReject(() => replayPortableStructuralDerivation(forgedArtifact));

  // Executable P6j classification:
  // PORTABLE_V02_EXTERNAL_PROVENANCE_CLAIM_SUPPORTED
}

await main();
