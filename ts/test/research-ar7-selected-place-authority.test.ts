import {
  materializeExactSequence,
  readExactSequence,
} from "../src/exact-sequence.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type LinkPoles,
  type ReadMemory,
} from "../src/memory.js";
import { defineContext } from "../src/state.js";
import { defineActHeader } from "../src/structural-readers.js";
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
  defineStructuralAssumptionContext,
  defineStructuralDerivationRule,
  defineStructuralProofOccurrence,
  replayStructuralDerivation,
  replayStructuralDerivationWithAssumptions,
  type StructuralJudgmentEvidence,
} from "../src/derivation.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

class AdmissionError extends Error {
  override readonly name = "AdmissionError";
}

interface SelectedSupport {
  readonly groundedClaims: readonly LinkHandle[];
  readonly admittedRules: readonly LinkHandle[];
}

/**
 * Bounded AR7 support carrier:
 *
 *   S = GroundedClaims ⟼ AdmittedRules
 *
 * Both poles are exact Link sequences. The point of the experiment is not to
 * make this pair a new MTS primitive, but to test whether authority can be
 * expressed as a selected structural place inside one immutable support root.
 */
function readSelectedSupport(memory: ReadMemory, support: LinkHandle): SelectedSupport {
  try {
    const poles = memory.poles(support);
    return Object.freeze({
      groundedClaims: readExactSequence(memory, poles.start).values,
      admittedRules: readExactSequence(memory, poles.end).values,
    });
  } catch {
    throw new AdmissionError("invalid-selected-support");
  }
}

function requireAdmittedRule(
  memory: ReadMemory,
  support: LinkHandle,
  rule: LinkHandle,
): void {
  const selected = readSelectedSupport(memory, support);
  if (!selected.admittedRules.includes(rule)) {
    throw new AdmissionError("rule-not-admitted-at-selected-place");
  }
}

function expectAdmissionRejected(effect: () => unknown, message: string): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof AdmissionError, `${message}: wrong error type`);
    return;
  }
  throw new Error(`${message}: expected AdmissionError`);
}

class PoleOnlyProbe implements ReadMemory {
  constructor(private readonly source: ReadMemory) {}

  get root(): LinkHandle {
    return this.source.root;
  }

  get linkCount(): number {
    return this.source.linkCount;
  }

  poles(link: LinkHandle): LinkPoles {
    return this.source.poles(link);
  }

  find(): LinkHandle | undefined {
    throw new Error("selected-place admission must not use find");
  }

  outgoing(): readonly LinkHandle[] {
    throw new Error("selected-place admission must not use outgoing");
  }

  incoming(): readonly LinkHandle[] {
    throw new Error("selected-place admission must not use incoming");
  }
}

function anchors(memory: Memory, count: number): readonly LinkHandle[] {
  const { R, U } = ensureRootBasis(memory);
  const result: LinkHandle[] = [];
  let current = U;
  for (let index = 0; index < count; index += 1) {
    current = memory.ensure(current, R);
    result.push(current);
  }
  return Object.freeze(result);
}

// A1/A2/A4: readable, admitted and ambiently attached are distinct relations.
{
  const memory = new Memory();
  const [groundedClaim, admittedRule, quotedRule, unrelated] = anchors(memory, 4);
  assert(
    groundedClaim !== undefined &&
      admittedRule !== undefined &&
      quotedRule !== undefined &&
      unrelated !== undefined,
    "authority fixture anchors",
  );

  const groundedClaims = materializeExactSequence(memory, [groundedClaim]);
  const admittedRules = materializeExactSequence(memory, [admittedRule]);
  const support = memory.ensure(groundedClaims, admittedRules);

  // A1: the permissive rule is structurally readable from quoted source data,
  // but that does not put it at the selected support's admission place.
  const quotedSource = memory.ensureStartSelfClosed(quotedRule);
  same(memory.poles(quotedSource).end, quotedRule, "quoted rule is structurally readable");
  requireAdmittedRule(memory, support, admittedRule);
  expectAdmissionRejected(
    () => requireAdmittedRule(memory, support, quotedRule),
    "quoted readable rule must not become admitted",
  );

  // A2: producer may materialize an ambient S⟼Rule relation after S was selected.
  // Since admission is read from S's own end-pole exact sequence, the attachment
  // cannot alter the meaning of the already selected support root.
  const selfAdmissionAttempt = memory.ensure(support, quotedRule);
  same(memory.poles(selfAdmissionAttempt).start, support, "self-admission attachment exists");
  expectAdmissionRejected(
    () => requireAdmittedRule(memory, support, quotedRule),
    "producer evidence cannot self-admit into immutable selected support",
  );

  // A4: more ambient extensions around the same roots cannot alter either old
  // verdict. No outgoing/incoming/global scan participates in admission.
  memory.ensure(support, unrelated);
  memory.ensure(quotedSource, unrelated);
  memory.ensure(unrelated, support);
  requireAdmittedRule(memory, support, admittedRule);
  expectAdmissionRejected(
    () => requireAdmittedRule(memory, support, quotedRule),
    "ambient extension leaves selected support verdict unchanged",
  );

  const poleOnly = new PoleOnlyProbe(memory);
  requireAdmittedRule(poleOnly, support, admittedRule);
  expectAdmissionRejected(
    () => requireAdmittedRule(poleOnly, support, quotedRule),
    "pole-only replay preserves non-admission",
  );

  // Positive control: meaning may change when a genuinely different support
  // root structurally includes the formerly quoted rule at the admission place.
  // The checker code remains unchanged.
  const expandedRules = materializeExactSequence(memory, [admittedRule, quotedRule]);
  const explicitlyDifferentSupport = memory.ensure(groundedClaims, expandedRules);
  assert(explicitlyDifferentSupport !== support, "changed admission place must change support root");
  requireAdmittedRule(memory, explicitlyDifferentSupport, quotedRule);
}

function expectCyclicDerivation(effect: () => unknown): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof StructuralDerivationReplayError, "expected derivation replay error");
    same(error.code, "cyclic-dependency", "q=>q ungrounded cycle rejection");
    return;
  }
  throw new Error("q=>q without grounded q must not derive q");
}

// A3: admitting the rule q=>q is not enough to derive q. A circular dependency
// fails. The same rule succeeds once q is separately presented as an explicit
// structural assumption, proving admitted-rule != grounded-premise != derived.
{
  const memory = new Memory();
  const [dictionary, grammar, theory, q, parent, current] = anchors(memory, 6);
  assert(
    dictionary !== undefined &&
      grammar !== undefined &&
      theory !== undefined &&
      q !== undefined &&
      parent !== undefined &&
      current !== undefined,
    "q=>q fixture anchors",
  );

  const context = defineContext(memory, parent, current);
  const expectedInterpreter: StructuralInterpreter = Object.freeze({
    dictionary,
    grammar,
    theory,
  });
  const interpreter = defineStructuralInterpreter(memory, dictionary, grammar, theory);

  // No placeholders are needed: both premise and conclusion are the grounded
  // structural claim q. The rule itself is admitted under the selected Theory.
  const roleDictionary = defineStructuralRoleDictionary(memory, []);
  const structuralRule = defineStructuralRule(memory, roleDictionary, q);
  const ruleAdmission = admitStructuralRule(memory, theory, structuralRule);
  const act = defineActHeader(memory, interpreter, roleDictionary, context);

  const judgment: StructuralJudgmentEvidence = Object.freeze({
    application: Object.freeze({
      act,
      rule: structuralRule,
      ruleAdmission,
      claimedBody: q,
      expectedInterpreter,
      expectedAfterContext: context,
    }),
    judgment: Object.freeze({ theory, context, claim: q }),
  });

  const occurrence = defineStructuralProofOccurrence(memory, act, q);
  const derivationRule = defineStructuralDerivationRule(memory, structuralRule, [q]);
  const derivationRuleAdmission = admitStructuralDerivationRule(memory, theory, derivationRule);

  const selfDependency = materializeExactSequence(memory, [occurrence]);
  const cyclicNode = Object.freeze({
    occurrence,
    judgment,
    derivationRule,
    derivationRuleAdmission,
    premiseOccurrenceSequence: selfDependency,
  });

  expectCyclicDerivation(() =>
    replayStructuralDerivation(memory, {
      theory,
      targetOccurrence: occurrence,
      nodes: [cyclicNode],
    }),
  );

  // Grounding is an independently presented structural fact, not the cycle.
  const assumptionContext = defineStructuralAssumptionContext(memory, theory, [q]);
  const assumptionOccurrence = memory.find(assumptionContext, q);
  assert(assumptionOccurrence !== undefined, "explicit q assumption occurrence");
  const groundedDependency = materializeExactSequence(memory, [assumptionOccurrence]);
  const groundedNode = Object.freeze({
    ...cyclicNode,
    premiseOccurrenceSequence: groundedDependency,
  });

  const before = memory.linkCount;
  const result = replayStructuralDerivationWithAssumptions(memory, {
    assumptionContext,
    derivation: {
      theory,
      targetOccurrence: occurrence,
      nodes: [groundedNode],
    },
  });
  same(result.derivation.target.judgment.claim, q, "explicitly grounded q can discharge q=>q premise");
  same(result.usedAssumptionOccurrences.length, 1, "q assumption is actually used");
  same(result.usedAssumptionOccurrences[0], assumptionOccurrence, "exact q assumption occurrence used");
  same(memory.linkCount, before, "grounded q=>q replay is read-only");
}

console.log(
  "MTS AR7 selected-place authority: readable != admitted != grounded != derived; ambient/self-admission fails closed.",
);
