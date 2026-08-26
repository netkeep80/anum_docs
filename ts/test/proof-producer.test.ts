import * as core from "../src/public.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

const createStructuralProofProducer = (
  core as unknown as {
    readonly createStructuralProofProducer?: unknown;
  }
).createStructuralProofProducer;

assert(
  typeof createStructuralProofProducer === "function",
  "package root must expose createStructuralProofProducer",
);

const memory = new core.Memory();
const producer = core.createStructuralProofProducer(memory);
const methods = producer as unknown as Readonly<Record<string, unknown>>;
for (const name of [
  "defineContext",
  "defineInterpreter",
  "defineRoleDictionary",
  "defineRule",
  "admitRule",
  "defineAct",
  "defineActField",
  "defineProofOccurrence",
  "defineDerivationRule",
  "admitDerivationRule",
  "definePremiseOccurrenceSequence",
  "defineAssumptionContext",
  "defineTheorem",
] as const) {
  assert(typeof methods[name] === "function", `producer must expose ${name}`);
}

for (const forbidden of ["accept", "approve", "prove", "replay"] as const) {
  assert(!(forbidden in methods), `producer must not expose privileged ${forbidden} authority`);
}

const { R, U } = core.ensureRootBasis(memory);
let cursor = U;
const fresh = (): core.LinkHandle => (cursor = memory.ensure(cursor, R));
const dictionary = fresh();
const grammar = fresh();
const theory = fresh();
const context = producer.defineContext(fresh(), fresh());
const role = fresh();
const value = fresh();
const expectedInterpreter = Object.freeze({ dictionary, grammar, theory });
const interpreter = producer.defineInterpreter(dictionary, grammar, theory);
const roleDictionary = producer.defineRoleDictionary([role]);
const rule = producer.defineRule(roleDictionary, role);
const ruleAdmission = producer.admitRule(theory, rule);
const act = producer.defineAct(interpreter, roleDictionary, context);
producer.defineActField(act, role, value);
const occurrence = producer.defineProofOccurrence(act, value);
const derivationRule = producer.defineDerivationRule(rule, []);
const derivationRuleAdmission = producer.admitDerivationRule(theory, derivationRule);
const premiseOccurrenceSequence = producer.definePremiseOccurrenceSequence([]);
const evidence: core.StructuralDerivationEvidence = Object.freeze({
  theory,
  targetOccurrence: occurrence,
  nodes: Object.freeze([Object.freeze({
    occurrence,
    judgment: Object.freeze({
      application: Object.freeze({
        act,
        rule,
        ruleAdmission,
        claimedBody: value,
        expectedInterpreter,
        expectedAfterContext: context,
      }),
      judgment: Object.freeze({ theory, context, claim: value }),
    }),
    derivationRule,
    derivationRuleAdmission,
    premiseOccurrenceSequence,
  })]),
});

const beforeExport = memory.linkCount;
const artifact = core.exportPortableStructuralDerivation(memory, evidence);
same(memory.linkCount, beforeExport, "portable export must stay source read-only");
const imported = core.replayPortableStructuralProof(artifact) as core.PortableStructuralDerivationReplayResult;
same(imported.replay.occurrenceCount, 1, "trusted replay must verify one candidate node");
same(
  imported.replay.target.judgment.claim,
  imported.evidence.nodes[0]?.judgment.judgment.claim,
  "trusted replay must preserve the exact target claim in reconstructed memory",
);

// Construction alone carries no proof authority: the same facade can materialize
// a candidate whose Rule admission is merely some unrelated Link. Trusted replay
// must reject it rather than treating producer success as acceptance.
const badRuleAdmission = fresh();
const badEvidence: core.StructuralDerivationEvidence = Object.freeze({
  ...evidence,
  nodes: Object.freeze([Object.freeze({
    ...evidence.nodes[0]!,
    judgment: Object.freeze({
      ...evidence.nodes[0]!.judgment,
      application: Object.freeze({
        ...evidence.nodes[0]!.judgment.application,
        ruleAdmission: badRuleAdmission,
      }),
    }),
  })]),
});
let rejected = false;
try {
  core.replayStructuralDerivation(memory, badEvidence);
} catch (error) {
  assert(error instanceof core.StructuralDerivationReplayError, "unadmitted candidate must fail generic replay");
  rejected = true;
}
assert(rejected, "producer construction must not imply proof acceptance");
