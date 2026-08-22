import { materializeExactSequence } from "../src/exact-sequence.js";
import { Memory, ensureRootBasis, type LinkHandle } from "../src/memory.js";
import {
  PORTABLE_MTS_SEMANTIC_BASE,
  PORTABLE_STRUCTURAL_DERIVATION_WITH_ASSUMPTIONS_SCHEMA,
  PortableStructuralDerivationError,
  exportPortableStructuralDerivationWithAssumptions,
  replayPortableStructuralDerivationWithAssumptions,
  type PortableStructuralDerivationWithAssumptionsArtifact,
} from "../src/portable-derivation.js";
import { exportStructuralDerivationWithAssumptionsSupportTopology } from "../src/proof-support-topology.js";
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
  assert(Object.is(actual, expected), `${message}: values differ`);
}

interface Fixture {
  readonly memory: Memory;
  readonly evidence: StructuralDerivationWithAssumptionsEvidence;
  readonly unusedOccurrence: LinkHandle;
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
  const unusedOccurrence = memory.find(assumptionContext, unusedClaim);
  assert(usedOccurrence !== undefined, "used assumption occurrence must exist");
  assert(unusedOccurrence !== undefined, "unused assumption occurrence must exist");

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
    unusedOccurrence,
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

function portableCode(input: unknown): string {
  try {
    replayPortableStructuralDerivationWithAssumptions(input);
  } catch (error) {
    assert(error instanceof PortableStructuralDerivationError, "expected portable rejection");
    return error.code;
  }
  throw new Error("expected portable rejection");
}

function assumptionCode(
  memory: Memory,
  evidence: StructuralDerivationWithAssumptionsEvidence,
): string {
  try {
    replayStructuralDerivationWithAssumptions(memory, evidence);
  } catch (error) {
    assert(error instanceof StructuralAssumptionReplayError, "expected assumption replay rejection");
    return error.code;
  }
  throw new Error("expected assumption replay rejection");
}

// Positive: exact conditional evidence survives canonical transport and fresh replay.
{
  const fx = fixture();
  const sourceReplay = replayStructuralDerivationWithAssumptions(fx.memory, fx.evidence);
  same(sourceReplay.derivation.occurrenceCount, 2, "source proof node count");
  same(sourceReplay.declaredAssumptionOccurrences.length, 2, "source declared assumptions");
  same(sourceReplay.usedAssumptionOccurrences.length, 1, "source used assumptions");

  const beforeExport = fx.memory.linkCount;
  const artifact = exportPortableStructuralDerivationWithAssumptions(fx.memory, fx.evidence);
  same(fx.memory.linkCount, beforeExport, "portable export must be read-only");
  same(artifact.schema, PORTABLE_STRUCTURAL_DERIVATION_WITH_ASSUMPTIONS_SCHEMA, "schema");
  same(artifact.mtsSemanticBase, PORTABLE_MTS_SEMANTIC_BASE, "semantic base");

  const imported = replayPortableStructuralDerivationWithAssumptions(artifact);
  same(imported.replay.derivation.occurrenceCount, 2, "fresh proof node count");
  same(imported.replay.declaredAssumptionOccurrences.length, 2, "fresh declared assumptions");
  same(imported.replay.usedAssumptionOccurrences.length, 1, "fresh used assumptions");
  same(imported.replay.derivation.theory, imported.evidence.derivation.theory, "fresh theory");
  same(
    imported.replay.derivation.targetOccurrence,
    imported.evidence.derivation.targetOccurrence,
    "fresh target",
  );

  const importedBefore = imported.memory.linkCount;
  replayStructuralDerivationWithAssumptions(imported.memory, imported.evidence);
  same(imported.memory.linkCount, importedBefore, "fresh replay must remain read-only");
  const importedSupport = exportStructuralDerivationWithAssumptionsSupportTopology(
    imported.memory,
    imported.evidence,
  );
  assert(
    importedSupport.coordinates.has(imported.replay.declaredAssumptionOccurrences[1]!),
    "unused declared occurrence must survive transport",
  );

  const reordered: StructuralDerivationWithAssumptionsEvidence = {
    ...fx.evidence,
    derivation: { ...fx.evidence.derivation, nodes: [...fx.evidence.derivation.nodes].reverse() },
  };
  same(
    JSON.stringify(exportPortableStructuralDerivationWithAssumptions(fx.memory, reordered)),
    JSON.stringify(artifact),
    "host node order must not change artifact bytes",
  );

  const junkA = fx.fresh();
  const junkB = fx.fresh();
  fx.memory.ensure(junkA, junkB);
  same(
    JSON.stringify(exportPortableStructuralDerivationWithAssumptions(fx.memory, fx.evidence)),
    JSON.stringify(artifact),
    "ambient unrelated Memory must not change artifact bytes",
  );
}

// Strict envelope/schema/base/coordinate failures are transport errors.
{
  const fx = fixture();
  const artifact = exportPortableStructuralDerivationWithAssumptions(fx.memory, fx.evidence);
  same(portableCode({ ...artifact, extra: true }), "invalid-envelope", "extra field");

  const missing = { ...artifact } as Record<string, unknown>;
  delete missing.nodes;
  same(portableCode(missing), "invalid-envelope", "missing field");
  same(portableCode({ ...artifact, schema: "unknown" }), "unsupported-schema", "unknown schema");
  same(
    portableCode({ ...artifact, mtsSemanticBase: "mts-contract/other" }),
    "unsupported-semantic-base",
    "wrong semantic base",
  );
  same(
    portableCode({ ...artifact, assumptionContextCoordinate: artifact.topology.links.length + 10 }),
    "invalid-coordinate",
    "invalid assumption coordinate",
  );
}

// A coordinate that names real but non-context topology cannot acquire authority from transport.
{
  const fx = fixture();
  const artifact = exportPortableStructuralDerivationWithAssumptions(fx.memory, fx.evidence);
  let code = "";
  try {
    replayPortableStructuralDerivationWithAssumptions({
      ...artifact,
      assumptionContextCoordinate: artifact.targetOccurrenceCoordinate,
    });
  } catch (error) {
    assert(error instanceof StructuralAssumptionReplayError, "malformed context must reach generic replay");
    code = error.code;
  }
  same(code, "invalid-assumption-context", "malformed context code");
}

// Removing the transported unused-assumption witness cannot produce acceptance.
{
  const fx = fixture();
  const artifact = exportPortableStructuralDerivationWithAssumptions(fx.memory, fx.evidence);
  const sourceSupport = exportStructuralDerivationWithAssumptionsSupportTopology(fx.memory, fx.evidence);
  const unusedCoordinate = sourceSupport.coordinates.get(fx.unusedOccurrence);
  assert(unusedCoordinate !== undefined, "unused occurrence coordinate must exist");
  const links = artifact.topology.links.filter((_pair, index) => index !== unusedCoordinate);
  const forged: PortableStructuralDerivationWithAssumptionsArtifact = {
    ...artifact,
    topology: { ...artifact.topology, links },
  };
  let rejected = false;
  try {
    replayPortableStructuralDerivationWithAssumptions(forged);
  } catch {
    rejected = true;
  }
  assert(rejected, "missing declared-assumption witness must fail closed");
}

// Unexpected Act attachments are transported as negative evidence, never sanitized.
{
  const fx = fixture();
  const hostileRole = fx.fresh();
  const hostileValue = fx.fresh();
  defineActField(fx.memory, fx.targetAct, hostileRole, hostileValue);
  const fullCode = assumptionCode(fx.memory, fx.evidence);
  const artifact = exportPortableStructuralDerivationWithAssumptions(fx.memory, fx.evidence);
  let portableReplayCode = "";
  try {
    replayPortableStructuralDerivationWithAssumptions(artifact);
  } catch (error) {
    assert(error instanceof StructuralAssumptionReplayError, "portable hostile proof must reject semantically");
    portableReplayCode = error.code;
  }
  same(portableReplayCode, fullCode, "portable hostile rejection must equal full Memory");
}

// Executable P6n classification:
// PORTABLE_CONDITIONAL_DERIVATION_SUPPORTED
