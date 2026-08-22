import { materializeExactSequence } from "../src/exact-sequence.js";
import {
  Memory,
  MemoryError,
  ensureRootBasis,
  type LinkHandle,
  type LinkPoles,
  type ReadMemory,
} from "../src/memory.js";
import { exportStructuralDerivationSupportTopology } from "../src/proof-support-topology.js";
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

function expectMissingAssumptionOccurrence(
  memory: ReadMemory,
  evidence: StructuralDerivationWithAssumptionsEvidence,
): void {
  try {
    replayStructuralDerivationWithAssumptions(memory, evidence);
  } catch (error) {
    assert(error instanceof StructuralAssumptionReplayError, "expected assumption replay rejection");
    same(error.code, "missing-assumption-occurrence", "restricted replay must expose exact support gap");
    return;
  }
  throw new Error("expected restricted assumption replay rejection");
}

function fixture(): {
  readonly memory: Memory;
  readonly evidence: StructuralDerivationWithAssumptionsEvidence;
  readonly usedOccurrence: LinkHandle;
  readonly unusedClaim: LinkHandle;
  readonly unusedOccurrence: LinkHandle;
  readonly fresh: () => LinkHandle;
} {
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
  const context = defineContext(memory, fresh(), fresh());

  const assumptionContext = defineStructuralAssumptionContext(
    memory,
    theory,
    [usedClaim, unusedClaim],
  );
  const usedOccurrence = memory.find(assumptionContext, usedClaim);
  const unusedOccurrence = memory.find(assumptionContext, unusedClaim);
  assert(usedOccurrence !== undefined, "used assumption occurrence must exist");
  assert(unusedOccurrence !== undefined, "unused declared assumption occurrence must exist");

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
  const derivationRule = defineStructuralDerivationRule(memory, rule, [role]);
  const node = {
    occurrence,
    judgment,
    derivationRule,
    derivationRuleAdmission: admitStructuralDerivationRule(memory, theory, derivationRule),
    premiseOccurrenceSequence: materializeExactSequence(memory, [usedOccurrence]),
  };

  return {
    memory,
    usedOccurrence,
    unusedClaim,
    unusedOccurrence,
    fresh,
    evidence: {
      derivation: { theory, targetOccurrence: occurrence, nodes: [node] },
      assumptionContext,
    },
  };
}

const fx = fixture();
const beforeReplay = fx.memory.linkCount;
const full = replayStructuralDerivationWithAssumptions(fx.memory, fx.evidence);
same(full.declaredAssumptionOccurrences.length, 2, "full replay must retain both declarations");
same(full.usedAssumptionOccurrences.length, 1, "exactly one assumption must be used");
same(full.usedAssumptionOccurrences[0], fx.usedOccurrence, "used occurrence must be exact");
same(fx.memory.linkCount, beforeReplay, "full assumption replay must be read-only");

const beforeSupport = fx.memory.linkCount;
const supportA = exportStructuralDerivationSupportTopology(fx.memory, fx.evidence.derivation);
same(fx.memory.linkCount, beforeSupport, "base support export must be read-only");
assert(supportA.coordinates.has(fx.usedOccurrence), "used occurrence enters base support through premise sequence");
assert(supportA.coordinates.has(fx.evidence.assumptionContext), "used occurrence pole closure reaches assumption context");
assert(supportA.coordinates.has(fx.unusedClaim), "assumption sequence pole closure reaches unused declared claim");
assert(
  !supportA.coordinates.has(fx.unusedOccurrence),
  "base support must expose the missing unused assumption lookup witness",
);

expectMissingAssumptionOccurrence(
  new RestrictedSupportMemory(fx.memory, supportA.links),
  fx.evidence,
);

const junkA = fx.fresh();
const junkB = fx.fresh();
fx.memory.ensure(junkA, junkB);
const supportB = exportStructuralDerivationSupportTopology(fx.memory, fx.evidence.derivation);
same(
  JSON.stringify(supportB.topology),
  JSON.stringify(supportA.topology),
  "unrelated ambient Memory must not repair or perturb base support",
);
assert(!supportB.coordinates.has(fx.unusedOccurrence), "ambient growth must not add missing assumption witness");
expectMissingAssumptionOccurrence(
  new RestrictedSupportMemory(fx.memory, supportB.links),
  fx.evidence,
);

// Executable P6l classification:
// BASE_REPLAY_SUPPORT_INSUFFICIENT_FOR_DECLARED_ASSUMPTIONS
