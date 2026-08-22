import { materializeExactSequence } from "../src/exact-sequence.js";
import {
  Memory,
  MemoryError,
  ensureRootBasis,
  type LinkHandle,
  type LinkPoles,
  type ReadMemory,
} from "../src/memory.js";
import {
  StructuralDerivationSupportTopologyError,
  exportStructuralDerivationSupportTopology,
} from "../src/proof-support-topology.js";
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
  replayStructuralDerivation,
  type StructuralDerivationEvidence,
  type StructuralDerivationNodeEvidence,
  type StructuralJudgmentEvidence,
} from "../src/derivation.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}

class RestrictedSupportMemory implements ReadMemory {
  readonly root: LinkHandle;
  private readonly support: ReadonlySet<LinkHandle>;

  constructor(
    private readonly source: ReadMemory,
    links: readonly LinkHandle[],
  ) {
    this.root = source.root;
    this.support = new Set(links);
  }

  get linkCount(): number {
    return this.support.size;
  }

  private require(link: LinkHandle): void {
    if (!this.support.has(link)) throw new MemoryError("Link is outside test replay support");
  }

  poles(link: LinkHandle): LinkPoles {
    this.require(link);
    const poles = this.source.poles(link);
    if (!this.support.has(poles.start) || !this.support.has(poles.end)) {
      throw new MemoryError("test replay support is not pole-closed");
    }
    return poles;
  }

  find(start: LinkHandle, end: LinkHandle): LinkHandle | undefined {
    this.require(start);
    this.require(end);
    const found = this.source.find(start, end);
    return found !== undefined && this.support.has(found) ? found : undefined;
  }

  outgoing(start: LinkHandle): readonly LinkHandle[] {
    this.require(start);
    return this.source.outgoing(start).filter((link) => this.support.has(link));
  }

  incoming(end: LinkHandle): readonly LinkHandle[] {
    this.require(end);
    return this.source.incoming(end).filter((link) => this.support.has(link));
  }
}

interface Fixture {
  readonly memory: Memory;
  readonly evidence: StructuralDerivationEvidence;
  readonly role: LinkHandle;
  readonly value: LinkHandle;
  readonly targetAct: LinkHandle;
  readonly attachments: readonly LinkHandle[];
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
  const value = fresh();
  const expectedInterpreter: StructuralInterpreter = { dictionary, grammar, theory };
  const interpreter = defineStructuralInterpreter(memory, dictionary, grammar, theory);
  const roleDictionary = defineStructuralRoleDictionary(memory, [role]);
  const rule = defineStructuralRule(memory, roleDictionary, role);
  const ruleAdmission = admitStructuralRule(memory, theory, rule);

  const makeNode = (
    context: LinkHandle,
    premiseTemplates: readonly LinkHandle[],
    premiseOccurrences: readonly LinkHandle[],
  ): { readonly node: StructuralDerivationNodeEvidence; readonly attachment: LinkHandle } => {
    const act = defineActHeader(memory, interpreter, roleDictionary, context);
    const attachment = defineActField(memory, act, role, value);
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
    const derivationRule = defineStructuralDerivationRule(memory, rule, premiseTemplates);
    return {
      attachment,
      node: {
        occurrence,
        judgment,
        derivationRule,
        derivationRuleAdmission: admitStructuralDerivationRule(memory, theory, derivationRule),
        premiseOccurrenceSequence: materializeExactSequence(memory, premiseOccurrences),
      },
    };
  };

  const leafContext = defineContext(memory, fresh(), fresh());
  const targetContext = defineContext(memory, fresh(), fresh());
  const leaf = makeNode(leafContext, [], []);
  const target = makeNode(targetContext, [role], [leaf.node.occurrence]);

  return {
    memory,
    role,
    value,
    targetAct: target.node.judgment.application.act,
    attachments: Object.freeze([leaf.attachment, target.attachment]),
    evidence: {
      theory,
      targetOccurrence: target.node.occurrence,
      nodes: [target.node, leaf.node],
    },
  };
}

function explicitHandles(evidence: StructuralDerivationEvidence): readonly LinkHandle[] {
  const result: LinkHandle[] = [evidence.theory, evidence.targetOccurrence];
  for (const node of evidence.nodes) {
    const application = node.judgment.application;
    result.push(
      node.occurrence,
      application.act,
      application.rule,
      application.ruleAdmission,
      application.claimedBody,
      application.expectedInterpreter.dictionary,
      application.expectedInterpreter.grammar,
      application.expectedInterpreter.theory,
      application.expectedAfterContext,
      node.judgment.judgment.theory,
      node.judgment.judgment.context,
      node.judgment.judgment.claim,
      node.derivationRule,
      node.derivationRuleAdmission,
      node.premiseOccurrenceSequence,
    );
  }
  return result;
}

function replayReject(memory: ReadMemory, evidence: StructuralDerivationEvidence): string {
  try {
    replayStructuralDerivation(memory, evidence);
  } catch (error) {
    assert(error instanceof StructuralDerivationReplayError, "expected derivation replay rejection");
    return error.code;
  }
  throw new Error("expected derivation replay rejection");
}

// Valid proof: canonical support is complete, read-only, host-node-order neutral,
// and stable under unrelated ambient Memory growth.
{
  const fx = fixture();
  const full = replayStructuralDerivation(fx.memory, fx.evidence);
  same(full.occurrenceCount, 2, "full replay must verify both dependency nodes");

  const beforeSupport = fx.memory.linkCount;
  const supportA = exportStructuralDerivationSupportTopology(fx.memory, fx.evidence);
  same(fx.memory.linkCount, beforeSupport, "support export must be read-only");
  assert(supportA.links.length < fx.memory.linkCount, "support must exclude existing unrelated topology");

  for (const link of explicitHandles(fx.evidence)) {
    assert(supportA.coordinates.has(link), "every explicit evidence handle must be mapped");
  }
  for (const attachment of fx.attachments) {
    assert(supportA.coordinates.has(attachment), "every normal Act attachment must be support");
  }
  supportA.links.forEach((link, coordinate) => {
    same(supportA.coordinates.get(link), coordinate, "support links must be canonical-coordinate ordered");
  });

  const reordered = exportStructuralDerivationSupportTopology(fx.memory, {
    ...fx.evidence,
    nodes: [...fx.evidence.nodes].reverse(),
  });
  same(
    JSON.stringify(reordered.topology),
    JSON.stringify(supportA.topology),
    "host nodes[] order must not affect support topology",
  );

  const restrictedA = new RestrictedSupportMemory(fx.memory, supportA.links);
  const restrictedReplay = replayStructuralDerivation(restrictedA, fx.evidence);
  same(restrictedReplay.theory, full.theory, "restricted replay Theory");
  same(restrictedReplay.targetOccurrence, full.targetOccurrence, "restricted replay target");
  same(restrictedReplay.occurrenceCount, full.occurrenceCount, "restricted replay dependency count");

  const countBeforeJunk = fx.memory.linkCount;
  const junkA = fx.memory.ensure(fx.value, fx.evidence.theory);
  const junkB = fx.memory.ensure(junkA, fx.value);
  assert(fx.memory.linkCount > countBeforeJunk, "ambient witness must add semantic topology");
  const supportB = exportStructuralDerivationSupportTopology(fx.memory, fx.evidence);
  same(
    JSON.stringify(supportB.topology),
    JSON.stringify(supportA.topology),
    "unrelated ambient growth must not affect support topology",
  );
  assert(!supportB.coordinates.has(junkA), "first ambient Link must stay outside proof support");
  assert(!supportB.coordinates.has(junkB), "second ambient Link must stay outside proof support");
  same(replayStructuralDerivation(fx.memory, fx.evidence).occurrenceCount, 2, "ambient growth preserves proof");
}

// Security boundary: support minimization must preserve hostile outgoing evidence,
// otherwise a full-Memory reject could be turned into a restricted-view accept.
{
  const fx = fixture();
  const validSupport = exportStructuralDerivationSupportTopology(fx.memory, fx.evidence);
  const undeclaredRole = fx.memory.ensure(fx.value, fx.value);
  assert(undeclaredRole !== fx.role, "hostile role must be undeclared");
  const hostileField = fx.memory.ensure(undeclaredRole, fx.value);
  const hostileAttachment = fx.memory.ensure(fx.targetAct, hostileField);

  const fullCode = replayReject(fx.memory, fx.evidence);
  const hostileSupport = exportStructuralDerivationSupportTopology(fx.memory, fx.evidence);
  assert(hostileSupport.coordinates.has(hostileAttachment), "hostile outgoing attachment must be support");
  assert(hostileSupport.coordinates.has(hostileField), "hostile field must be pole-closed support");
  assert(hostileSupport.coordinates.has(undeclaredRole), "hostile role must be pole-closed support");
  assert(
    JSON.stringify(hostileSupport.topology) !== JSON.stringify(validSupport.topology),
    "hostile outgoing evidence must change support topology",
  );

  const restricted = new RestrictedSupportMemory(fx.memory, hostileSupport.links);
  const restrictedCode = replayReject(restricted, fx.evidence);
  same(restrictedCode, fullCode, "restricted support must preserve full-replay rejection");
}

// Foreign owner handles fail closed during support construction.
{
  const fx = fixture();
  const foreign = new Memory();
  let rejected = false;
  try {
    exportStructuralDerivationSupportTopology(fx.memory, {
      ...fx.evidence,
      theory: foreign.root,
    });
  } catch (error) {
    assert(
      error instanceof StructuralDerivationSupportTopologyError,
      "foreign evidence handle must fail as support-topology error",
    );
    rejected = true;
  }
  assert(rejected, "foreign evidence handle must reject support construction");
}

// Executable P6f classification:
// CANONICAL_REPLAY_SUPPORT_TOPOLOGY_SUPPORTED
