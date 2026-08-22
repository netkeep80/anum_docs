import { exportCanonicalTopology } from "../src/canonical-topology.js";
import { materializeExactSequence } from "../src/exact-sequence.js";
import {
  Memory,
  MemoryError,
  ensureRootBasis,
  type LinkHandle,
} from "../src/memory.js";
import { exportTopology } from "../src/persistence-topology.js";
import {
  PORTABLE_STRUCTURAL_DERIVATION_SCHEMA,
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

const LEGACY_SCHEMA = "mts-portable-structural-derivation/v0.1" as const;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

function expectPortable(
  code: PortableStructuralDerivationError["code"],
  effect: () => unknown,
): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof PortableStructuralDerivationError, `${code}: wrong error type`);
    same(error.code, code, `${code}: wrong error code`);
    return;
  }
  throw new Error(`${code}: expected portable transport rejection`);
}

function expectReplayReject(effect: () => unknown): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof StructuralDerivationReplayError, "expected generic derivation replay rejection");
    return;
  }
  throw new Error("expected generic derivation replay rejection");
}

type Binding = readonly [LinkHandle, LinkHandle];

function branchFixture(): {
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

function siblingFixture(reverse: boolean): Memory {
  const memory = new Memory();
  const { O, C } = ensureRootBasis(memory);
  let x: LinkHandle;
  let y: LinkHandle;
  if (reverse) {
    y = memory.ensure(C, C);
    x = memory.ensure(O, O);
  } else {
    x = memory.ensure(O, O);
    y = memory.ensure(C, C);
  }
  memory.ensure(x, y);
  return memory;
}

// The package marker remains pinned to v0.1 for compatibility, while current
// artifact output is the versioned v0.2 replay-support transport.
{
  const fx = branchFixture();
  const beforeExport = fx.memory.linkCount;
  const artifact = exportPortableStructuralDerivation(fx.memory, fx.evidence);
  same(
    PORTABLE_STRUCTURAL_DERIVATION_SCHEMA,
    "mts-portable-structural-derivation/v0.1",
    "public package compatibility marker remains pinned",
  );
  same(artifact.schema, "mts-portable-structural-derivation/v0.2", "current output must be v0.2");
  same(fx.memory.linkCount, beforeExport, "portable export is source read-only");
  same(artifact.nodes.length, 3, "complete branching node closure transported");
  assert(
    artifact.nodes.every((node, index) => index === 0 || artifact.nodes[index - 1]!.occurrence < node.occurrence),
    "portable nodes are canonical by occurrence coordinate",
  );

  const imported = replayPortableStructuralDerivation(artifact);
  same(imported.replay.occurrenceCount, 3, "fresh replay preserves dependency closure");
  same(imported.memory.linkCount, artifact.topology.links.length, "fresh topology remains read-only after replay");

  let foreignRejected = false;
  try {
    imported.memory.poles(fx.evidence.theory);
  } catch (error) {
    assert(error instanceof MemoryError, "source handles must remain foreign to imported Memory");
    foreignRejected = true;
  }
  assert(foreignRejected, "portable replay must not reuse source owner handles");

  const reexported = exportPortableStructuralDerivation(imported.memory, imported.evidence);
  same(JSON.stringify(reexported), JSON.stringify(artifact), "v0.2 import/re-export is byte-stable");
}

// P2 host nodes[] order remains transport-only.
{
  const fx = branchFixture();
  const a = exportPortableStructuralDerivation(fx.memory, fx.evidence);
  const b = exportPortableStructuralDerivation(fx.memory, {
    ...fx.evidence,
    nodes: [...fx.evidence.nodes].reverse(),
  });
  same(JSON.stringify(a), JSON.stringify(b), "source node order has no portable authority");
}

// P6f adoption removes unrelated selected-Memory topology from current bytes.
{
  const fx = branchFixture();
  const before = exportPortableStructuralDerivation(fx.memory, fx.evidence);
  const countBeforeJunk = fx.memory.linkCount;
  const junkA = fx.memory.ensure(fx.evidence.theory, fx.evidence.theory);
  const junkB = fx.memory.ensure(junkA, fx.evidence.theory);
  assert(fx.memory.linkCount > countBeforeJunk, "ambient witness must grow selected Memory");

  const after = exportPortableStructuralDerivation(fx.memory, fx.evidence);
  same(JSON.stringify(after), JSON.stringify(before), "unrelated ambient growth must not change v0.2 bytes");
  const full = exportCanonicalTopology(fx.memory).topology;
  assert(
    after.topology.links.length < full.links.length,
    "v0.2 support topology must be smaller than ambient full-Memory topology",
  );
  void junkB;
}

// v0.1 remains a real compatibility contract. Add one canonical START-self Link
// over the old final coordinate: it is a new later round and not outgoing(any Act).
// Legacy v0.1 accepts this canonical baggage; current v0.2 rejects it, and a
// current re-export from the legacy reconstruction strips it deterministically.
{
  const fx = branchFixture();
  const artifact = exportPortableStructuralDerivation(fx.memory, fx.evidence);
  const next = artifact.topology.links.length;
  const last = next - 1;
  assert(last >= 0, "portable topology must be non-empty");
  const expandedTopology = Object.freeze({
    ...artifact.topology,
    links: Object.freeze([
      ...artifact.topology.links,
      Object.freeze([next, last] as const),
    ]),
  });

  const legacy = {
    ...artifact,
    schema: LEGACY_SCHEMA,
    topology: expandedTopology,
  };
  const legacyImported = replayPortableStructuralDerivation(legacy);
  same(legacyImported.replay.occurrenceCount, 3, "legacy v0.1 canonical baggage remains accepted");

  expectPortable("noncanonical-support-topology", () => replayPortableStructuralDerivation({
    ...artifact,
    topology: expandedTopology,
  }));

  const normalized = exportPortableStructuralDerivation(legacyImported.memory, legacyImported.evidence);
  same(JSON.stringify(normalized), JSON.stringify(artifact), "legacy baggage normalizes to exact current v0.2");

  const minimalLegacy = replayPortableStructuralDerivation({ ...artifact, schema: LEGACY_SCHEMA });
  same(minimalLegacy.replay.occurrenceCount, 3, "support-minimal v0.1 input also remains accepted");
}

// Strict envelope validation is fail-closed before structural replay.
{
  const fx = branchFixture();
  const artifact = exportPortableStructuralDerivation(fx.memory, fx.evidence);
  expectPortable("unsupported-schema", () => replayPortableStructuralDerivation({
    ...artifact,
    schema: "mts-portable-structural-derivation/v999",
  }));
  expectPortable("unsupported-semantic-base", () => replayPortableStructuralDerivation({
    ...artifact,
    mtsSemanticBase: "mts-contract/v0.10",
  }));
  expectPortable("invalid-envelope", () => replayPortableStructuralDerivation({
    ...artifact,
    unexpectedAuthority: true,
  }));
  expectPortable("invalid-envelope", () => replayPortableStructuralDerivation({
    schema: artifact.schema,
    mtsSemanticBase: artifact.mtsSemanticBase,
    topology: artifact.topology,
    theoryCoordinate: artifact.theoryCoordinate,
    nodes: artifact.nodes,
  }));
  expectPortable("invalid-coordinate", () => replayPortableStructuralDerivation({
    ...artifact,
    targetOccurrenceCoordinate: 1.5,
  }));
  expectPortable("invalid-coordinate", () => replayPortableStructuralDerivation({
    ...artifact,
    targetOccurrenceCoordinate: artifact.topology.links.length + 1,
  }));
  expectPortable("noncanonical-node-order", () => replayPortableStructuralDerivation({
    ...artifact,
    nodes: [...artifact.nodes].reverse(),
  }));
  expectPortable("noncanonical-node-order", () => replayPortableStructuralDerivation({
    ...artifact,
    nodes: [artifact.nodes[0], artifact.nodes[0], ...artifact.nodes.slice(1)],
  }));
}

// A valid persistence image is not automatically canonical proof transport.
{
  const fx = branchFixture();
  const artifact = exportPortableStructuralDerivation(fx.memory, fx.evidence);
  const first = siblingFixture(false);
  const second = siblingFixture(true);
  const canonical = JSON.stringify(exportCanonicalTopology(first).topology);
  const rawFirst = exportTopology(first);
  const rawSecond = exportTopology(second);
  const noncanonical = JSON.stringify(rawFirst) === canonical ? rawSecond : rawFirst;
  assert(JSON.stringify(noncanonical) !== canonical, "adversarial raw topology must be noncanonical");
  expectPortable("noncanonical-topology", () => replayPortableStructuralDerivation({
    ...artifact,
    topology: noncanonical,
  }));
}

// Hostile outgoing evidence remains inside v0.2 support. Export does not decide
// truth; reconstructed generic replay still rejects the undeclared binding.
{
  const fx = branchFixture();
  const valid = exportPortableStructuralDerivation(fx.memory, fx.evidence);
  const targetAct = fx.evidence.nodes[0]!.judgment.application.act;
  const badRole = fx.memory.ensure(fx.evidence.theory, fx.evidence.theory);
  const badField = fx.memory.ensure(badRole, fx.evidence.theory);
  const hostileAttachment = fx.memory.ensure(targetAct, badField);
  assert(fx.memory.outgoing(targetAct).includes(hostileAttachment), "hostile attachment must be outgoing(target Act)");

  const hostile = exportPortableStructuralDerivation(fx.memory, fx.evidence);
  assert(
    hostile.topology.links.length > valid.topology.links.length,
    "hostile outgoing evidence must enlarge exact replay support",
  );
  expectReplayReject(() => replayPortableStructuralDerivation(hostile));
}

// Once transport is structurally valid, forged proof coordinates do not gain
// authority: the existing generic derivation kernel rejects first.
{
  const fx = branchFixture();
  const artifact = exportPortableStructuralDerivation(fx.memory, fx.evidence);
  expectReplayReject(() => replayPortableStructuralDerivation({
    ...artifact,
    theoryCoordinate: 0,
  }));
  expectReplayReject(() => replayPortableStructuralDerivation({
    ...artifact,
    targetOccurrenceCoordinate: 0,
  }));
  const targetIndex = artifact.nodes.findIndex((node) => node.occurrence === artifact.targetOccurrenceCoordinate);
  assert(targetIndex >= 0, "target portable node exists");
  const target = artifact.nodes[targetIndex]!;
  const forgedTarget = {
    ...target,
    derivationRuleAdmission: 0,
  };
  const forgedNodes = [...artifact.nodes];
  forgedNodes[targetIndex] = forgedTarget;
  expectReplayReject(() => replayPortableStructuralDerivation({
    ...artifact,
    nodes: forgedNodes,
  }));

  // Executable P6g classification:
  // PORTABLE_REPLAY_SUPPORT_V02_SUPPORTED
}
