import { materializeExactSequence } from "../src/exact-sequence.js";
import { Memory, ensureRootBasis, type LinkHandle } from "../src/memory.js";
import {
  PORTABLE_STRUCTURAL_DERIVATION_SCHEMA,
  PortableStructuralDerivationError,
  exportPortableStructuralDerivation,
  exportPortableStructuralDerivationWithAssumptions,
} from "../src/portable-derivation.js";
import { replayPortableStructuralProof } from "../src/portable-proof-replay.js";
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
  StructuralDerivationReplayError,
  admitStructuralDerivationRule,
  defineStructuralAssumptionContext,
  defineStructuralDerivationRule,
  defineStructuralProofOccurrence,
  type StructuralDerivationEvidence,
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

function expectPortable(
  code: PortableStructuralDerivationError["code"],
  effect: () => unknown,
): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof PortableStructuralDerivationError, `${code}: wrong error type`);
    same(error.code, code, `${code}: wrong code`);
    return;
  }
  throw new Error(`${code}: expected portable rejection`);
}

function expectDerivationReject(effect: () => unknown): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof StructuralDerivationReplayError, "expected generic derivation rejection");
    return;
  }
  throw new Error("expected generic derivation rejection");
}

function expectAssumptionReject(code: string, effect: () => unknown): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof StructuralAssumptionReplayError, "expected generic assumption rejection");
    same(error.code, code, "assumption rejection code");
    return;
  }
  throw new Error("expected generic assumption rejection");
}

interface Fixture {
  readonly memory: Memory;
  readonly base: StructuralDerivationEvidence;
  readonly conditional: StructuralDerivationWithAssumptionsEvidence;
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

  const node = (
    premiseTemplates: readonly LinkHandle[],
    premiseOccurrences: readonly LinkHandle[],
  ): StructuralDerivationNodeEvidence => {
    const derivationRule = defineStructuralDerivationRule(memory, rule, premiseTemplates);
    return {
      occurrence,
      judgment,
      derivationRule,
      derivationRuleAdmission: admitStructuralDerivationRule(memory, theory, derivationRule),
      premiseOccurrenceSequence: materializeExactSequence(memory, premiseOccurrences),
    };
  };

  const baseNode = node([], []);
  const base: StructuralDerivationEvidence = {
    theory,
    targetOccurrence: occurrence,
    nodes: [baseNode],
  };

  const assumptionContext = defineStructuralAssumptionContext(memory, theory, [claim]);
  const assumptionOccurrence = memory.find(assumptionContext, claim);
  assert(assumptionOccurrence !== undefined, "assumption occurrence must exist");
  const conditionalNode = node([role], [assumptionOccurrence]);

  return {
    memory,
    base,
    conditional: {
      derivation: {
        theory,
        targetOccurrence: occurrence,
        nodes: [conditionalNode],
      },
      assumptionContext,
    },
  };
}

const fx = fixture();
const baseArtifact = exportPortableStructuralDerivation(fx.memory, fx.base);
const conditionalArtifact = exportPortableStructuralDerivationWithAssumptions(
  fx.memory,
  fx.conditional,
);

// One boundary accepts all already-supported transport families. Schema selects
// only parser/reconstruction plumbing; the downstream replay remains generic.
{
  const current = replayPortableStructuralProof(baseArtifact);
  assert(!("derivation" in current.replay), "current base must use base replay result");
  same(current.replay.occurrenceCount, 1, "current base occurrence count");
  same(current.memory.linkCount, baseArtifact.topology.links.length, "current base replay is read-only");

  const legacy = replayPortableStructuralProof({
    ...baseArtifact,
    schema: PORTABLE_STRUCTURAL_DERIVATION_SCHEMA,
  });
  assert(!("derivation" in legacy.replay), "legacy base must use base replay result");
  same(legacy.replay.occurrenceCount, 1, "legacy base occurrence count");

  const conditional = replayPortableStructuralProof(conditionalArtifact);
  assert("derivation" in conditional.replay, "conditional schema must use assumption replay result");
  same(conditional.replay.derivation.occurrenceCount, 1, "conditional occurrence count");
  same(
    conditional.memory.linkCount,
    conditionalArtifact.topology.links.length,
    "conditional replay is read-only",
  );
}

// R3 RED: the versioned theorem-reuse schema must select its own exact parser
// before generic base fallback. The envelope is intentionally incomplete, so a
// correct router reaches the new parser and reports invalid-envelope; current
// baseline instead reports unsupported-schema from the base family.
{
  expectPortable("invalid-envelope", () => replayPortableStructuralProof({
    ...baseArtifact,
    schema: "mts-portable-structural-derivation-with-theorems/v0.1",
  }));
}

// Host callback/opcode/rule-name vocabulary has no dispatch authority. Known
// family parsers reject every extra field as transport pollution.
{
  for (const authority of ["callback", "handler", "opcode", "ruleKind", "tactic"] as const) {
    expectPortable("invalid-envelope", () => replayPortableStructuralProof({
      ...baseArtifact,
      [authority]: "host-authority",
    }));
  }
  expectPortable("invalid-envelope", () => replayPortableStructuralProof({
    ...conditionalArtifact,
    callback: "host-authority",
  }));
}

// Unknown and malformed transports fail closed. Exact conditional schema never
// falls back to the base parser after a conditional envelope failure.
{
  expectPortable("unsupported-schema", () => replayPortableStructuralProof({
    ...baseArtifact,
    schema: "mts-portable-structural-derivation/v999",
  }));
  expectPortable("invalid-envelope", () => replayPortableStructuralProof(null));

  const malformedConditional = { ...conditionalArtifact } as Record<string, unknown>;
  delete malformedConditional.assumptionContextCoordinate;
  expectPortable("invalid-envelope", () => replayPortableStructuralProof(malformedConditional));
}

// Transport routing cannot make forged proof evidence true. These inputs are
// structurally routed first, then rejected by the existing generic kernel.
{
  expectDerivationReject(() => replayPortableStructuralProof({
    ...baseArtifact,
    theoryCoordinate: 0,
  }));

  expectAssumptionReject("invalid-assumption-context", () => replayPortableStructuralProof({
    ...conditionalArtifact,
    assumptionContextCoordinate: conditionalArtifact.targetOccurrenceCoordinate,
  }));
}

// Executable P7a classification:
// SINGLE_PORTABLE_TRUSTED_REPLAY_BOUNDARY_SUPPORTED