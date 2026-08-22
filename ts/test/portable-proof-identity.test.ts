import { exportCanonicalTopology } from "../src/canonical-topology.js";
import { materializeExactSequence } from "../src/exact-sequence.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
} from "../src/memory.js";
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
  admitStructuralDerivationRule,
  defineStructuralDerivationRule,
  defineStructuralProofOccurrence,
  replayStructuralDerivation,
  type StructuralDerivationEvidence,
  type StructuralJudgmentEvidence,
} from "../src/derivation.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}

function sameHandles(
  actual: readonly LinkHandle[],
  expected: readonly LinkHandle[],
  message: string,
): void {
  assert(actual.length === expected.length, `${message}: length differs`);
  actual.forEach((value, index) => same(value, expected[index], `${message}[${index}]`));
}

function fixture(): {
  readonly memory: Memory;
  readonly evidence: StructuralDerivationEvidence;
  readonly act: LinkHandle;
  readonly attachment: LinkHandle;
  readonly value: LinkHandle;
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
  const derivationRule = defineStructuralDerivationRule(memory, rule, []);
  const derivationRuleAdmission = admitStructuralDerivationRule(memory, theory, derivationRule);
  const premiseOccurrenceSequence = materializeExactSequence(memory, []);

  return {
    memory,
    act,
    attachment,
    value,
    evidence: {
      theory,
      targetOccurrence: occurrence,
      nodes: [{
        occurrence,
        judgment,
        derivationRule,
        derivationRuleAdmission,
        premiseOccurrenceSequence,
      }],
    },
  };
}

function explicitEvidenceHandles(evidence: StructuralDerivationEvidence): readonly LinkHandle[] {
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
  return Object.freeze(result);
}

function recursivePoleClosure(
  memory: Memory,
  seeds: readonly LinkHandle[],
): ReadonlySet<LinkHandle> {
  const result = new Set<LinkHandle>();
  const pending = [...seeds];
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined || result.has(current)) continue;
    result.add(current);
    const poles = memory.poles(current);
    if (!result.has(poles.start)) pending.push(poles.start);
    if (!result.has(poles.end)) pending.push(poles.end);
  }
  return result;
}

const fx = fixture();
const sourceTheory = fx.evidence.theory;
const sourceTarget = fx.evidence.targetOccurrence;
const sourceHandles = explicitEvidenceHandles(fx.evidence);

// P6c itself is valid and read-only before ambient growth.
const beforeA = fx.memory.linkCount;
const sourceReplayA = replayStructuralDerivation(fx.memory, fx.evidence);
const artifactA = exportPortableStructuralDerivation(fx.memory, fx.evidence);
const fullTopologyA = exportCanonicalTopology(fx.memory).topology;
const importedA = replayPortableStructuralDerivation(artifactA);
same(fx.memory.linkCount, beforeA, "baseline replay/export must be source read-only");
same(sourceReplayA.theory, sourceTheory, "baseline source Theory selection");
same(sourceReplayA.targetOccurrence, sourceTarget, "baseline source target selection");
same(importedA.replay.occurrenceCount, 1, "baseline portable replay occurrence count");
same(importedA.memory.linkCount, artifactA.topology.links.length, "baseline imported replay read-only");

// A role field is replay support discovered through outgoing(act), but it is not
// part of a naive recursive pole closure seeded only by explicit evidence handles.
const outgoingBefore = [...fx.memory.outgoing(fx.act)];
assert(outgoingBefore.includes(fx.attachment), "Act attachment must be visible through outgoing(act)");
const naiveClosure = recursivePoleClosure(fx.memory, sourceHandles);
assert(naiveClosure.has(fx.act), "naive closure must include explicit Act");
assert(!naiveClosure.has(fx.attachment), "Act attachment must escape naive pole closure");

// Add semantic topology that is unrelated to the proof and does not touch the
// replay-observed outgoing namespace of the Act.
const countBeforeJunk = fx.memory.linkCount;
const junkA = fx.memory.ensure(fx.value, sourceTheory);
const junkB = fx.memory.ensure(junkA, fx.value);
assert(fx.memory.linkCount > countBeforeJunk, "ambient semantic growth must add topology");
assert(junkA !== fx.act && junkB !== fx.act, "ambient Links must not replace the Act");
sameHandles([...fx.memory.outgoing(fx.act)], outgoingBefore, "ambient growth must not alter outgoing(act)");

// The same source evidence still proves the same selected Theory/target. The
// canonical topology of the whole selected Memory changes, independently of how
// a current/future portable exporter chooses its replay-support transport subset.
const beforeB = fx.memory.linkCount;
const sourceReplayB = replayStructuralDerivation(fx.memory, fx.evidence);
const artifactB = exportPortableStructuralDerivation(fx.memory, fx.evidence);
const fullTopologyB = exportCanonicalTopology(fx.memory).topology;
const importedB = replayPortableStructuralDerivation(artifactB);
same(fx.memory.linkCount, beforeB, "post-growth replay/export must be source read-only");
same(fx.evidence.theory, sourceTheory, "ambient growth must not mutate evidence Theory handle");
same(fx.evidence.targetOccurrence, sourceTarget, "ambient growth must not mutate target handle");
sameHandles(explicitEvidenceHandles(fx.evidence), sourceHandles, "ambient growth must not mutate explicit evidence handles");
same(sourceReplayB.theory, sourceReplayA.theory, "source Theory semantics stay fixed");
same(sourceReplayB.targetOccurrence, sourceReplayA.targetOccurrence, "source target semantics stay fixed");
same(sourceReplayB.occurrenceCount, sourceReplayA.occurrenceCount, "source dependency semantics stay fixed");
same(importedB.replay.occurrenceCount, importedA.replay.occurrenceCount, "portable proof result stays fixed");
same(importedB.memory.linkCount, artifactB.topology.links.length, "post-growth imported replay read-only");
assert(
  JSON.stringify(fullTopologyA) !== JSON.stringify(fullTopologyB),
  "full selected-Memory canonical topology must expose ambient topology sensitivity",
);

// Executable P6e classifications remain historical facts independent of the
// current exporter policy:
// FULL_MEMORY_PORTABLE_ARTIFACT_NOT_STABLE_PROOF_IDENTITY
// NAIVE_POLE_CLOSURE_NOT_REPLAY_COMPLETE
// P6E_HISTORICAL_FALSIFICATION_DECOUPLED_FROM_CURRENT_EXPORTER
