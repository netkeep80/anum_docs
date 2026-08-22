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
  exportStructuralDerivationWithAssumptionsSupportTopology,
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
  readonly evidence: StructuralDerivationWithAssumptionsEvidence;
  readonly theory: LinkHandle;
  readonly usedOccurrence: LinkHandle;
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
    theory,
    usedOccurrence,
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

function supportReject(
  memory: ReadMemory,
  evidence: StructuralDerivationWithAssumptionsEvidence,
): void {
  const before = memory.linkCount;
  let rejected = false;
  try {
    exportStructuralDerivationWithAssumptionsSupportTopology(memory, evidence);
  } catch (error) {
    assert(error instanceof StructuralDerivationSupportTopologyError, "expected support rejection");
    rejected = true;
  }
  assert(rejected, "support export must fail closed");
  same(memory.linkCount, before, "failed support export must be read-only");
}

function replayReject(
  memory: ReadMemory,
  evidence: StructuralDerivationWithAssumptionsEvidence,
): string {
  try {
    replayStructuralDerivationWithAssumptions(memory, evidence);
  } catch (error) {
    assert(error instanceof StructuralAssumptionReplayError, "expected conditional replay rejection");
    return error.code;
  }
  throw new Error("expected conditional replay rejection");
}

// Positive corpus: declared-but-unused assumptions remain transport evidence.
{
  const fx = fixture();
  const full = replayStructuralDerivationWithAssumptions(fx.memory, fx.evidence);
  same(full.derivation.occurrenceCount, 2, "full replay must verify both proof nodes");
  same(full.declaredAssumptionOccurrences.length, 2, "both assumptions must remain declared");
  same(full.usedAssumptionOccurrences.length, 1, "exactly one assumption must be used");
  same(full.usedAssumptionOccurrences[0], fx.usedOccurrence, "used assumption must be exact");

  const base = exportStructuralDerivationSupportTopology(fx.memory, fx.evidence.derivation);
  assert(!base.coordinates.has(fx.unusedOccurrence), "base support must preserve the P6l gap");

  const before = fx.memory.linkCount;
  const supportA = exportStructuralDerivationWithAssumptionsSupportTopology(fx.memory, fx.evidence);
  same(fx.memory.linkCount, before, "assumption support export must be read-only");
  assert(supportA.coordinates.has(fx.usedOccurrence), "used assumption occurrence must be support");
  assert(supportA.coordinates.has(fx.unusedOccurrence), "unused declared occurrence must be support");
  assert(supportA.links.length < fx.memory.linkCount, "support must exclude unrelated topology");

  const restricted = replayStructuralDerivationWithAssumptions(
    new RestrictedSupportMemory(fx.memory, supportA.links),
    fx.evidence,
  );
  same(restricted.derivation.targetOccurrence, full.derivation.targetOccurrence, "target must match");
  same(restricted.derivation.occurrenceCount, full.derivation.occurrenceCount, "node count must match");
  same(restricted.usedAssumptionOccurrences[0], fx.usedOccurrence, "restricted use must match");

  const reordered: StructuralDerivationWithAssumptionsEvidence = {
    ...fx.evidence,
    derivation: { ...fx.evidence.derivation, nodes: [...fx.evidence.derivation.nodes].reverse() },
  };
  const supportReordered = exportStructuralDerivationWithAssumptionsSupportTopology(fx.memory, reordered);
  same(JSON.stringify(supportReordered.topology), JSON.stringify(supportA.topology), "host node order must be neutral");

  const junkA = fx.fresh();
  const junkB = fx.fresh();
  fx.memory.ensure(junkA, junkB);
  const supportB = exportStructuralDerivationWithAssumptionsSupportTopology(fx.memory, fx.evidence);
  same(JSON.stringify(supportB.topology), JSON.stringify(supportA.topology), "ambient junk must be neutral");
}

// Missing lookup witness, malformed sequence and foreign owner all fail closed.
{
  const fx = fixture();
  const missingClaim = fx.fresh();
  const missingContext = materializeExactSequence(fx.memory, [fx.theory, missingClaim]);
  supportReject(fx.memory, { ...fx.evidence, assumptionContext: missingContext });
  supportReject(fx.memory, { ...fx.evidence, assumptionContext: fx.fresh() });

  const foreign = new Memory();
  const foreignContext = materializeExactSequence(foreign, [foreign.root]);
  supportReject(fx.memory, { ...fx.evidence, assumptionContext: foreignContext });
}

// Complete outgoing(Act) remains security evidence: restriction cannot sanitize it.
{
  const fx = fixture();
  const hostileRole = fx.fresh();
  const hostileValue = fx.fresh();
  const hostileAttachment = defineActField(fx.memory, fx.targetAct, hostileRole, hostileValue);
  const fullCode = replayReject(fx.memory, fx.evidence);
  const support = exportStructuralDerivationWithAssumptionsSupportTopology(fx.memory, fx.evidence);
  assert(support.coordinates.has(hostileAttachment), "hostile Act attachment must remain support");
  const restrictedCode = replayReject(
    new RestrictedSupportMemory(fx.memory, support.links),
    fx.evidence,
  );
  same(restrictedCode, fullCode, "restricted rejection must equal full-Memory rejection");
}

// Executable P6m classification:
// CANONICAL_DECLARED_ASSUMPTION_REPLAY_SUPPORT_SUPPORTED
