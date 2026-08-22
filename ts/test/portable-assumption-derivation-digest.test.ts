import { materializeExactSequence } from "../src/exact-sequence.js";
import { Memory, ensureRootBasis, type LinkHandle } from "../src/memory.js";
import {
  PORTABLE_STRUCTURAL_DERIVATION_WITH_ASSUMPTIONS_CONTENT_DIGEST_SCHEME,
  computePortableStructuralDerivationContentDigest,
  computePortableStructuralDerivationWithAssumptionsContentDigest,
} from "../src/portable-derivation-digest.js";
import {
  PortableStructuralDerivationError,
  exportPortableStructuralDerivation,
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
  replayStructuralDerivationWithAssumptions,
  type StructuralDerivationNodeEvidence,
  type StructuralDerivationWithAssumptionsEvidence,
  type StructuralJudgmentEvidence,
} from "../src/derivation.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

interface Fixture {
  readonly memory: Memory;
  readonly evidence: StructuralDerivationWithAssumptionsEvidence;
  readonly targetAct: LinkHandle;
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
  const usedClaim = fresh();
  const unusedClaim = fresh();
  const expectedInterpreter: StructuralInterpreter = { dictionary, grammar, theory };
  const interpreter = defineStructuralInterpreter(memory, dictionary, grammar, theory);
  const roleDictionary = defineStructuralRoleDictionary(memory, [role]);
  const rule = defineStructuralRule(memory, roleDictionary, role);
  const ruleAdmission = admitStructuralRule(memory, theory, rule);
  const assumptionContext = defineStructuralAssumptionContext(
    memory,
    theory,
    [usedClaim, unusedClaim],
  );
  const usedOccurrence = memory.find(assumptionContext, usedClaim);
  assert(usedOccurrence !== undefined, "used assumption occurrence must exist");

  const makeNode = (
    premiseTemplates: readonly LinkHandle[],
    premiseOccurrences: readonly LinkHandle[],
  ): StructuralDerivationNodeEvidence => {
    const context = defineContext(memory, fresh(), fresh());
    const act = defineActHeader(memory, interpreter, roleDictionary, context);
    defineActField(memory, act, role, usedClaim);
    const judgment: StructuralJudgmentEvidence = {
      application: {
        act,
        rule,
        ruleAdmission,
        claimedBody: usedClaim,
        expectedInterpreter,
        expectedAfterContext: context,
      },
      judgment: { theory, context, claim: usedClaim },
    };
    const occurrence = defineStructuralProofOccurrence(memory, act, usedClaim);
    const derivationRule = defineStructuralDerivationRule(memory, rule, premiseTemplates);
    return {
      occurrence,
      judgment,
      derivationRule,
      derivationRuleAdmission: admitStructuralDerivationRule(memory, theory, derivationRule),
      premiseOccurrenceSequence: materializeExactSequence(memory, premiseOccurrences),
    };
  };

  const helper = makeNode([], []);
  const target = makeNode([role, role], [usedOccurrence, helper.occurrence]);
  return {
    memory,
    targetAct: target.judgment.application.act,
    fresh,
    evidence: {
      derivation: {
        theory,
        targetOccurrence: target.occurrence,
        nodes: [target, helper],
      },
      assumptionContext,
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

async function expectPortable(
  code: string,
  action: () => unknown | Promise<unknown>,
): Promise<void> {
  try {
    await action();
  } catch (error) {
    assert(error instanceof PortableStructuralDerivationError, "expected portable rejection");
    same(error.code, code, "portable error code");
    return;
  }
  throw new Error("expected portable rejection");
}

function assumptionCode(action: () => unknown): string {
  try {
    action();
  } catch (error) {
    assert(error instanceof StructuralAssumptionReplayError, "expected assumption replay rejection");
    return error.code;
  }
  throw new Error("expected assumption replay rejection");
}

async function main(): Promise<void> {
  same(
    PORTABLE_STRUCTURAL_DERIVATION_WITH_ASSUMPTIONS_CONTENT_DIGEST_SCHEME,
    "mts-portable-structural-derivation-with-assumptions-content/sha-256/v0.1",
    "conditional digest scheme",
  );

  const fx = fixture();
  const source = replayStructuralDerivationWithAssumptions(fx.memory, fx.evidence);
  same(source.declaredAssumptionOccurrences.length, 2, "declared assumption count");
  same(source.usedAssumptionOccurrences.length, 1, "used assumption count");

  const artifact = exportPortableStructuralDerivationWithAssumptions(fx.memory, fx.evidence);
  const beforeDigest = fx.memory.linkCount;
  const digest = await computePortableStructuralDerivationWithAssumptionsContentDigest(artifact);
  same(fx.memory.linkCount, beforeDigest, "digest must not mutate source Memory");
  same(digest.scheme, PORTABLE_STRUCTURAL_DERIVATION_WITH_ASSUMPTIONS_CONTENT_DIGEST_SCHEME, "scheme");
  assert(/^[0-9a-f]{64}$/.test(digest.value), "digest must be lowercase 64-hex SHA-256");
  same(
    (await computePortableStructuralDerivationWithAssumptionsContentDigest(artifact)).value,
    digest.value,
    "repeated digest",
  );
  same(
    (await computePortableStructuralDerivationWithAssumptionsContentDigest(reverseObjectKeys(artifact))).value,
    digest.value,
    "host object key insertion order",
  );

  const reorderedEvidence: StructuralDerivationWithAssumptionsEvidence = {
    ...fx.evidence,
    derivation: {
      ...fx.evidence.derivation,
      nodes: [...fx.evidence.derivation.nodes].reverse(),
    },
  };
  const reordered = exportPortableStructuralDerivationWithAssumptions(fx.memory, reorderedEvidence);
  same(JSON.stringify(reordered), JSON.stringify(artifact), "host node order must not change bytes");
  same(
    (await computePortableStructuralDerivationWithAssumptionsContentDigest(reordered)).value,
    digest.value,
    "host node order must not change digest",
  );

  const imported = replayPortableStructuralDerivationWithAssumptions(artifact);
  const importedBefore = imported.memory.linkCount;
  const reexported = exportPortableStructuralDerivationWithAssumptions(imported.memory, imported.evidence);
  same(JSON.stringify(reexported), JSON.stringify(artifact), "fresh import/re-export bytes");
  same(
    (await computePortableStructuralDerivationWithAssumptionsContentDigest(reexported)).value,
    digest.value,
    "fresh import/re-export digest",
  );
  same(imported.memory.linkCount, importedBefore, "digest path must not mutate reconstructed Memory");

  const junkA = fx.fresh();
  const junkB = fx.fresh();
  fx.memory.ensure(junkA, junkB);
  const ambient = exportPortableStructuralDerivationWithAssumptions(fx.memory, fx.evidence);
  same(JSON.stringify(ambient), JSON.stringify(artifact), "ambient growth must not change bytes");
  same(
    (await computePortableStructuralDerivationWithAssumptionsContentDigest(ambient)).value,
    digest.value,
    "ambient growth must not change digest",
  );

  const baseArtifact = exportPortableStructuralDerivation(fx.memory, fx.evidence.derivation);
  await expectPortable("invalid-envelope", () =>
    computePortableStructuralDerivationWithAssumptionsContentDigest(baseArtifact));
  await expectPortable("invalid-envelope", () =>
    computePortableStructuralDerivationContentDigest(artifact));
  await expectPortable("unsupported-schema", () =>
    computePortableStructuralDerivationWithAssumptionsContentDigest({ ...artifact, schema: "unknown" }));
  await expectPortable("unsupported-semantic-base", () =>
    computePortableStructuralDerivationWithAssumptionsContentDigest({
      ...artifact,
      mtsSemanticBase: "mts-contract/other",
    }));
  await expectPortable("invalid-envelope", () =>
    computePortableStructuralDerivationWithAssumptionsContentDigest({ ...artifact, extra: true }));
  await expectPortable("invalid-coordinate", () =>
    computePortableStructuralDerivationWithAssumptionsContentDigest({
      ...artifact,
      assumptionContextCoordinate: 1.5,
    }));

  assert(
    artifact.assumptionContextCoordinate !== artifact.targetOccurrenceCoordinate,
    "fixture needs distinct context and target coordinates",
  );
  const forged = {
    ...artifact,
    assumptionContextCoordinate: artifact.targetOccurrenceCoordinate,
  };
  const forgedDigest = await computePortableStructuralDerivationWithAssumptionsContentDigest(forged);
  assert(forgedDigest.value !== digest.value, "parse-valid evidence mutation must change digest");
  same(
    assumptionCode(() => replayPortableStructuralDerivationWithAssumptions(forged)),
    "invalid-assumption-context",
    "digest must not confer proof authority",
  );

  const hostileFx = fixture();
  const validHostileBase = exportPortableStructuralDerivationWithAssumptions(
    hostileFx.memory,
    hostileFx.evidence,
  );
  const validHostileDigest = await computePortableStructuralDerivationWithAssumptionsContentDigest(
    validHostileBase,
  );
  const hostileRole = hostileFx.fresh();
  const hostileValue = hostileFx.fresh();
  defineActField(hostileFx.memory, hostileFx.targetAct, hostileRole, hostileValue);
  const fullCode = assumptionCode(() =>
    replayStructuralDerivationWithAssumptions(hostileFx.memory, hostileFx.evidence));
  const hostileArtifact = exportPortableStructuralDerivationWithAssumptions(
    hostileFx.memory,
    hostileFx.evidence,
  );
  const hostileDigest = await computePortableStructuralDerivationWithAssumptionsContentDigest(
    hostileArtifact,
  );
  assert(hostileDigest.value !== validHostileDigest.value, "hostile outgoing evidence must change digest");
  same(
    assumptionCode(() => replayPortableStructuralDerivationWithAssumptions(hostileArtifact)),
    fullCode,
    "portable hostile rejection must equal full Memory rejection",
  );

  // Executable P6p classification:
  // PORTABLE_CONDITIONAL_CONTENT_DIGEST_SUPPORTED
}

await main();
