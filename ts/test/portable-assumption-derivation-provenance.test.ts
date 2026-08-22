import { materializeExactSequence } from "../src/exact-sequence.js";
import { Memory, ensureRootBasis, type LinkHandle } from "../src/memory.js";
import {
  PORTABLE_STRUCTURAL_DERIVATION_CONTENT_DIGEST_SCHEME,
  computePortableStructuralDerivationWithAssumptionsContentDigest,
} from "../src/portable-derivation-digest.js";
import {
  PORTABLE_STRUCTURAL_DERIVATION_PROVENANCE_DIGEST_SCHEME,
  PORTABLE_STRUCTURAL_DERIVATION_PROVENANCE_SCHEMA,
  PORTABLE_STRUCTURAL_DERIVATION_WITH_ASSUMPTIONS_PROVENANCE_DIGEST_SCHEME,
  PORTABLE_STRUCTURAL_DERIVATION_WITH_ASSUMPTIONS_PROVENANCE_SCHEMA,
  PortableStructuralDerivationProvenanceError,
  canonicalPortableStructuralDerivationWithAssumptionsProvenanceClaimJson,
  computePortableStructuralDerivationProvenanceDigest,
  computePortableStructuralDerivationWithAssumptionsProvenanceDigest,
  createPortableStructuralDerivationWithAssumptionsProvenanceClaim,
  verifyPortableStructuralDerivationWithAssumptionsProvenanceClaim,
  type PortableStructuralDerivationProducerProvenance,
  type PortableStructuralDerivationSourceProvenance,
} from "../src/portable-derivation-provenance.js";
import {
  exportPortableStructuralDerivationWithAssumptions,
  replayPortableStructuralDerivationWithAssumptions,
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
  StructuralAssumptionReplayError,
  admitStructuralDerivationRule,
  defineStructuralAssumptionContext,
  defineStructuralDerivationRule,
  defineStructuralProofOccurrence,
  type StructuralDerivationWithAssumptionsEvidence,
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
  effect: () => unknown | Promise<unknown>,
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

function reverseObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reverseObjectKeys);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .reverse()
      .map(([key, nested]) => [key, reverseObjectKeys(nested)]),
  );
}

interface Fixture {
  readonly memory: Memory;
  readonly evidence: StructuralDerivationWithAssumptionsEvidence;
  readonly fresh: () => LinkHandle;
}

function fixture(): Fixture {
  const memory = new Memory();
  const { R, U } = ensureRootBasis(memory);
  let cursor = U;
  const fresh = (): LinkHandle => (cursor = memory.ensure(cursor, R));
  const dictionary = fresh();
  const grammar = fresh();
  const theory = fresh();
  const role = fresh();
  const claim = fresh();
  const expectedInterpreter: StructuralInterpreter = { dictionary, grammar, theory };
  const interpreter = defineStructuralInterpreter(memory, dictionary, grammar, theory);
  const roleDictionary = defineStructuralRoleDictionary(memory, [role]);
  const rule = defineStructuralRule(memory, roleDictionary, role);
  const ruleAdmission = admitStructuralRule(memory, theory, rule);
  const assumptionContext = defineStructuralAssumptionContext(memory, theory, [claim]);
  const assumptionOccurrence = memory.find(assumptionContext, claim);
  assert(assumptionOccurrence !== undefined, "assumption occurrence must exist");

  const context = defineContext(memory, fresh(), fresh());
  const act = defineActHeader(memory, interpreter, roleDictionary, context);
  defineActField(memory, act, role, claim);
  const judgment: StructuralJudgmentEvidence = {
    application: {
      act,
      rule,
      ruleAdmission,
      claimedBody: claim,
      expectedInterpreter,
      expectedAfterContext: context,
    },
    judgment: { theory, context, claim },
  };
  const occurrence = defineStructuralProofOccurrence(memory, act, claim);
  const derivationRule = defineStructuralDerivationRule(memory, rule, [role]);
  const node = {
    occurrence,
    judgment,
    derivationRule,
    derivationRuleAdmission: admitStructuralDerivationRule(memory, theory, derivationRule),
    premiseOccurrenceSequence: materializeExactSequence(memory, [assumptionOccurrence]),
  };
  return {
    memory,
    fresh,
    evidence: {
      derivation: { theory, targetOccurrence: occurrence, nodes: [node] },
      assumptionContext,
    },
  };
}

async function main(): Promise<void> {
  same(
    PORTABLE_STRUCTURAL_DERIVATION_PROVENANCE_SCHEMA,
    "mts-portable-structural-derivation-provenance/v0.1",
    "base provenance schema remains pinned",
  );
  same(
    PORTABLE_STRUCTURAL_DERIVATION_PROVENANCE_DIGEST_SCHEME,
    "mts-portable-structural-derivation-provenance/sha-256/v0.1",
    "base provenance digest remains pinned",
  );
  same(
    PORTABLE_STRUCTURAL_DERIVATION_WITH_ASSUMPTIONS_PROVENANCE_SCHEMA,
    "mts-portable-structural-derivation-with-assumptions-provenance/v0.1",
    "conditional provenance schema",
  );
  same(
    PORTABLE_STRUCTURAL_DERIVATION_WITH_ASSUMPTIONS_PROVENANCE_DIGEST_SCHEME,
    "mts-portable-structural-derivation-with-assumptions-provenance/sha-256/v0.1",
    "conditional provenance digest scheme",
  );

  const source: PortableStructuralDerivationSourceProvenance = {
    locator: "https://example.invalid/math-source",
    revision: "0123456789abcdef0123456789abcdef01234567",
    subject: "Example.conditionalTheorem",
  };
  const producer: PortableStructuralDerivationProducerProvenance = {
    id: "mts-proof-importer",
    version: "0.2.0",
  };
  const fx = fixture();
  const artifact = exportPortableStructuralDerivationWithAssumptions(fx.memory, fx.evidence);
  const before = fx.memory.linkCount;
  const directContent = await computePortableStructuralDerivationWithAssumptionsContentDigest(artifact);
  const claim = await createPortableStructuralDerivationWithAssumptionsProvenanceClaim(
    artifact,
    source,
    producer,
  );
  same(claim.contentDigest.value, directContent.value, "claim binds recomputed conditional content");
  same(fx.memory.linkCount, before, "claim creation is source read-only");

  const digest = await computePortableStructuralDerivationWithAssumptionsProvenanceDigest(claim);
  same(digest.scheme, PORTABLE_STRUCTURAL_DERIVATION_WITH_ASSUMPTIONS_PROVENANCE_DIGEST_SCHEME, "digest scheme");
  assert(/^[0-9a-f]{64}$/.test(digest.value), "conditional provenance digest must be lowercase 64-hex");
  same(
    (await computePortableStructuralDerivationWithAssumptionsProvenanceDigest(claim)).value,
    digest.value,
    "repeated digest",
  );
  same(
    canonicalPortableStructuralDerivationWithAssumptionsProvenanceClaimJson(reverseObjectKeys(claim)),
    canonicalPortableStructuralDerivationWithAssumptionsProvenanceClaimJson(claim),
    "object key insertion order has no authority",
  );

  for (const [label, changedSource, changedProducer] of [
    ["locator", { ...source, locator: `${source.locator}/changed` }, producer],
    ["revision", { ...source, revision: `${source.revision}x` }, producer],
    ["subject", { ...source, subject: `${source.subject}.changed` }, producer],
    ["producer-id", source, { ...producer, id: `${producer.id}.changed` }],
    ["producer-version", source, { ...producer, version: `${producer.version}+changed` }],
  ] as const) {
    const changed = await createPortableStructuralDerivationWithAssumptionsProvenanceClaim(
      artifact,
      changedSource,
      changedProducer,
    );
    const changedDigest = await computePortableStructuralDerivationWithAssumptionsProvenanceDigest(changed);
    assert(changedDigest.value !== digest.value, `${label} must change provenance identity`);
  }

  const verified = await verifyPortableStructuralDerivationWithAssumptionsProvenanceClaim(artifact, claim);
  same(verified.contentDigest.value, claim.contentDigest.value, "claim verifies against artifact");
  same(fx.memory.linkCount, before, "digest and verification are source read-only");

  const junkA = fx.fresh();
  const junkB = fx.fresh();
  fx.memory.ensure(junkA, junkB);
  const ambientArtifact = exportPortableStructuralDerivationWithAssumptions(fx.memory, fx.evidence);
  same(JSON.stringify(ambientArtifact), JSON.stringify(artifact), "ambient growth leaves artifact stable");
  const ambientClaim = await createPortableStructuralDerivationWithAssumptionsProvenanceClaim(
    ambientArtifact,
    source,
    producer,
  );
  same(
    (await computePortableStructuralDerivationWithAssumptionsProvenanceDigest(ambientClaim)).value,
    digest.value,
    "ambient growth leaves provenance stable",
  );

  const baseClaim = {
    schema: PORTABLE_STRUCTURAL_DERIVATION_PROVENANCE_SCHEMA,
    contentDigest: {
      scheme: PORTABLE_STRUCTURAL_DERIVATION_CONTENT_DIGEST_SCHEME,
      value: "0".repeat(64),
    },
    source,
    producer,
  };
  assert(
    /^[0-9a-f]{64}$/.test((await computePortableStructuralDerivationProvenanceDigest(baseClaim)).value),
    "base provenance function remains operational",
  );
  await expectProvenance(
    "unsupported-schema",
    () => computePortableStructuralDerivationWithAssumptionsProvenanceDigest(baseClaim),
  );
  await expectProvenance(
    "unsupported-schema",
    () => computePortableStructuralDerivationProvenanceDigest(claim),
  );
  await expectProvenance("unsupported-schema", () =>
    computePortableStructuralDerivationWithAssumptionsProvenanceDigest({ ...claim, schema: "unknown" }));
  await expectProvenance("invalid-content-digest", () =>
    computePortableStructuralDerivationWithAssumptionsProvenanceDigest({
      ...claim,
      contentDigest: { ...claim.contentDigest, scheme: PORTABLE_STRUCTURAL_DERIVATION_CONTENT_DIGEST_SCHEME },
    }));
  await expectProvenance("invalid-content-digest", () =>
    computePortableStructuralDerivationWithAssumptionsProvenanceDigest({
      ...claim,
      contentDigest: { ...claim.contentDigest, value: claim.contentDigest.value.toUpperCase() },
    }));
  await expectProvenance("invalid-provenance-string", () =>
    computePortableStructuralDerivationWithAssumptionsProvenanceDigest({
      ...claim,
      source: { ...claim.source, revision: "   " },
    }));
  await expectProvenance("invalid-envelope", () =>
    computePortableStructuralDerivationWithAssumptionsProvenanceDigest({ ...claim, trusted: true }));
  await expectProvenance("invalid-envelope", () =>
    computePortableStructuralDerivationWithAssumptionsProvenanceDigest({
      ...claim,
      producer: { ...claim.producer, signature: "not-authority" },
    }));

  const forgedClaim = {
    ...claim,
    contentDigest: { ...claim.contentDigest, value: "0".repeat(64) },
  };
  assert(
    /^[0-9a-f]{64}$/.test(
      (await computePortableStructuralDerivationWithAssumptionsProvenanceDigest(forgedClaim)).value,
    ),
    "structurally valid forged claim may have content identity",
  );
  await expectProvenance(
    "content-digest-mismatch",
    () => verifyPortableStructuralDerivationWithAssumptionsProvenanceClaim(artifact, forgedClaim),
  );

  assert(
    artifact.assumptionContextCoordinate !== artifact.targetOccurrenceCoordinate,
    "fixture requires distinct context and target coordinates",
  );
  const forgedArtifact = {
    ...artifact,
    assumptionContextCoordinate: artifact.targetOccurrenceCoordinate,
  };
  const forgedProofClaim = await createPortableStructuralDerivationWithAssumptionsProvenanceClaim(
    forgedArtifact,
    source,
    producer,
  );
  const forgedProofDigest = await computePortableStructuralDerivationWithAssumptionsProvenanceDigest(
    forgedProofClaim,
  );
  assert(forgedProofDigest.value !== digest.value, "proof mutation changes provenance identity");
  try {
    replayPortableStructuralDerivationWithAssumptions(forgedArtifact);
    throw new Error("invalid conditional proof must reject");
  } catch (error) {
    assert(error instanceof StructuralAssumptionReplayError, "generic conditional replay must reject forged proof");
    same(error.code, "invalid-assumption-context", "forged proof rejection code");
  }

  // Executable P6r classification:
  // PORTABLE_CONDITIONAL_EXTERNAL_PROVENANCE_CLAIM_SUPPORTED
}

await main();
