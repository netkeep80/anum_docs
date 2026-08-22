import { materializeExactSequence } from "../src/exact-sequence.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
} from "../src/memory.js";
import {
  PORTABLE_STRUCTURAL_DERIVATION_CONTENT_DIGEST_SCHEME,
  computePortableStructuralDerivationContentDigest,
} from "../src/portable-derivation-digest.js";
import {
  PortableStructuralDerivationError,
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

async function expectPortable(
  code: PortableStructuralDerivationError["code"],
  effect: () => Promise<unknown>,
): Promise<void> {
  try {
    await effect();
  } catch (error) {
    assert(error instanceof PortableStructuralDerivationError, `${code}: wrong error type`);
    same(error.code, code, `${code}: wrong error code`);
    return;
  }
  throw new Error(`${code}: expected digest input rejection`);
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

type Binding = readonly [LinkHandle, LinkHandle];

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
  const leftRole = fresh();
  const rightRole = fresh();
  const left = fresh();
  const right = fresh();
  const expectedInterpreter: StructuralInterpreter = { dictionary, grammar, theory };
  const interpreter = defineStructuralInterpreter(memory, dictionary, grammar, theory);

  const node = (
    roles: readonly LinkHandle[],
    bindings: readonly Binding[],
    template: LinkHandle,
    claim: LinkHandle,
    premiseTemplates: readonly LinkHandle[] = [],
    premiseOccurrences: readonly LinkHandle[] = [],
  ) => {
    const roleDictionary = defineStructuralRoleDictionary(memory, roles);
    const rule = defineStructuralRule(memory, roleDictionary, template);
    const ruleAdmission = admitStructuralRule(memory, theory, rule);
    const act = defineActHeader(memory, interpreter, roleDictionary, context);
    bindings.forEach(([role, value]) => defineActField(memory, act, role, value));
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
    const derivationRule = defineStructuralDerivationRule(memory, rule, premiseTemplates);
    return {
      occurrence,
      node: {
        occurrence,
        judgment,
        derivationRule,
        derivationRuleAdmission: admitStructuralDerivationRule(memory, theory, derivationRule),
        premiseOccurrenceSequence: materializeExactSequence(memory, premiseOccurrences),
      },
    };
  };

  const leftNode = node([leftRole], [[leftRole, left]], leftRole, left);
  const rightNode = node([rightRole], [[rightRole, right]], rightRole, right);
  const targetClaim = memory.ensure(left, right);
  const target = node(
    [leftRole, rightRole],
    [[leftRole, left], [rightRole, right]],
    memory.ensure(leftRole, rightRole),
    targetClaim,
    [leftRole, rightRole],
    [leftNode.occurrence, rightNode.occurrence],
  );

  return {
    memory,
    evidence: {
      theory,
      targetOccurrence: target.occurrence,
      nodes: [target.node, rightNode.node, leftNode.node],
    },
  };
}

function reverseObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reverseObjectKeys);
  if (typeof value !== "object" || value === null) return value;
  const entries = Object.entries(value as Record<string, unknown>)
    .reverse()
    .map(([key, nested]) => [key, reverseObjectKeys(nested)] as const);
  return Object.fromEntries(entries);
}

async function main(): Promise<void> {
  const fx = fixture();
  const before = fx.memory.linkCount;
  const artifact = exportPortableStructuralDerivation(fx.memory, fx.evidence);
  const digest = await computePortableStructuralDerivationContentDigest(artifact);

  same(
    digest.scheme,
    "mts-portable-structural-derivation-content/sha-256/v0.1",
    "digest scheme is pinned",
  );
  same(digest.scheme, PORTABLE_STRUCTURAL_DERIVATION_CONTENT_DIGEST_SCHEME, "descriptor scheme matches constant");
  assert(/^[0-9a-f]{64}$/.test(digest.value), "SHA-256 digest must be lowercase 64-hex");
  same(fx.memory.linkCount, before, "export and digest remain source read-only");

  const repeated = await computePortableStructuralDerivationContentDigest(artifact);
  same(repeated.value, digest.value, "repeated digest is stable");

  const reorderedEnvelope = reverseObjectKeys(artifact);
  const reorderedDigest = await computePortableStructuralDerivationContentDigest(reorderedEnvelope);
  same(reorderedDigest.value, digest.value, "object insertion order has no digest authority");

  const reorderedNodes = exportPortableStructuralDerivation(fx.memory, {
    ...fx.evidence,
    nodes: [...fx.evidence.nodes].reverse(),
  });
  const reorderedNodesDigest = await computePortableStructuralDerivationContentDigest(reorderedNodes);
  same(JSON.stringify(reorderedNodes), JSON.stringify(artifact), "host node order does not change current artifact");
  same(reorderedNodesDigest.value, digest.value, "host node order does not change digest");

  const imported = replayPortableStructuralDerivation(artifact);
  const importedBefore = imported.memory.linkCount;
  const reexported = exportPortableStructuralDerivation(imported.memory, imported.evidence);
  const reexportedDigest = await computePortableStructuralDerivationContentDigest(reexported);
  same(JSON.stringify(reexported), JSON.stringify(artifact), "v0.2 import/re-export stays byte-stable");
  same(reexportedDigest.value, digest.value, "v0.2 import/re-export keeps digest");
  same(imported.memory.linkCount, importedBefore, "digest path does not mutate reconstructed Memory");

  const countBeforeAmbient = fx.memory.linkCount;
  const junkA = fx.memory.ensure(fx.evidence.theory, fx.evidence.theory);
  const junkB = fx.memory.ensure(junkA, fx.evidence.theory);
  assert(fx.memory.linkCount > countBeforeAmbient, "ambient witness must grow selected Memory");
  const ambientArtifact = exportPortableStructuralDerivation(fx.memory, fx.evidence);
  const ambientDigest = await computePortableStructuralDerivationContentDigest(ambientArtifact);
  same(JSON.stringify(ambientArtifact), JSON.stringify(artifact), "unrelated ambient growth leaves v0.2 bytes stable");
  same(ambientDigest.value, digest.value, "unrelated ambient growth leaves digest stable");
  void junkB;

  await expectPortable("unsupported-schema", () => computePortableStructuralDerivationContentDigest({
    ...artifact,
    schema: "mts-portable-structural-derivation/v0.1",
  }));
  await expectPortable("unsupported-schema", () => computePortableStructuralDerivationContentDigest({
    ...artifact,
    schema: "mts-portable-structural-derivation/v999",
  }));
  await expectPortable("unsupported-semantic-base", () => computePortableStructuralDerivationContentDigest({
    ...artifact,
    mtsSemanticBase: "mts-contract/v0.10",
  }));
  await expectPortable("invalid-envelope", () => computePortableStructuralDerivationContentDigest({
    ...artifact,
    unexpectedAuthority: true,
  }));
  await expectPortable("invalid-coordinate", () => computePortableStructuralDerivationContentDigest({
    ...artifact,
    theoryCoordinate: 1.5,
  }));

  assert(artifact.theoryCoordinate !== 0, "fixture theory coordinate must make forgery observable");
  const forged = { ...artifact, theoryCoordinate: 0 };
  const forgedDigest = await computePortableStructuralDerivationContentDigest(forged);
  assert(forgedDigest.value !== digest.value, "proof-content mutation must change digest");
  expectReplayReject(() => replayPortableStructuralDerivation(forged));

  const hostileFx = fixture();
  const hostileValid = exportPortableStructuralDerivation(hostileFx.memory, hostileFx.evidence);
  const hostileValidDigest = await computePortableStructuralDerivationContentDigest(hostileValid);
  const targetAct = hostileFx.evidence.nodes[0]!.judgment.application.act;
  const badRole = hostileFx.memory.ensure(hostileFx.evidence.theory, hostileFx.evidence.theory);
  const badField = hostileFx.memory.ensure(badRole, hostileFx.evidence.theory);
  const hostileAttachment = hostileFx.memory.ensure(targetAct, badField);
  assert(hostileFx.memory.outgoing(targetAct).includes(hostileAttachment), "hostile evidence must be outgoing(target Act)");
  const hostile = exportPortableStructuralDerivation(hostileFx.memory, hostileFx.evidence);
  const hostileDigest = await computePortableStructuralDerivationContentDigest(hostile);
  assert(hostileDigest.value !== hostileValidDigest.value, "hostile outgoing evidence must change digest");
  expectReplayReject(() => replayPortableStructuralDerivation(hostile));

  // Executable P6h classification:
  // PORTABLE_V02_CONTENT_DIGEST_SUPPORTED
}

await main();
