import {
  materializeExactSequence,
  readExactSequence,
} from "../src/exact-sequence.js";
import { Memory, type LinkHandle } from "../src/memory.js";
import { ensureRootBasis } from "../src/public.js";
import {
  admitStructuralRule,
  defineStructuralRoleDictionary,
  defineStructuralRule,
  readStructuralRoleDictionary,
  type StructuralRoleBinding,
} from "../src/structural-rule.js";
import { unifyStructuralTemplate } from "../src/structural-unification.js";
import {
  admitStructuralDerivationRule,
  defineStructuralDerivationRule,
} from "../src/derivation.js";
import {
  StructuralDerivedDerivationReplayError,
  replayStructuralDerivedDerivationSchema,
  type StructuralDerivedDerivationEvidence,
} from "../src/derived-derivation-schema.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

function expectDerivedError(code: string, effect: () => unknown): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof StructuralDerivedDerivationReplayError, `${code}: wrong error type`);
    same(error.code, code, `${code}: wrong error code`);
    return;
  }
  throw new Error(`${code}: expected StructuralDerivedDerivationReplayError`);
}

function bindingValue(
  bindings: readonly StructuralRoleBinding[],
  role: LinkHandle,
): LinkHandle {
  const binding = bindings.find((candidate) => candidate.role === role);
  assert(binding !== undefined, "expected role binding");
  return binding.value;
}

function main(): void {
  const memory = new Memory();
  const { R, O, C, L, U } = ensureRootBasis(memory);

  // Generic coordinate identities are ordinary Links. Source and target scopes
  // are deliberately unrelated by prefix so N2b depends on explicit mu.
  const xRole = memory.ensure(L, R);
  const aRole = memory.ensure(R, L);
  const bRole = memory.ensure(R, U);
  const theory = memory.ensure(C, U);
  same(new Set([xRole, aRole, bRole]).size, 3, "generic role identities");

  const sourceDictionary = defineStructuralRoleDictionary(memory, [xRole]);
  const targetDictionary = defineStructuralRoleDictionary(memory, [aRole, bRole]);
  const sourceRoles = readStructuralRoleDictionary(memory, sourceDictionary).roles;
  const targetRoles = readStructuralRoleDictionary(memory, targetDictionary).roles;
  same(sourceRoles.length, 1, "source role count");
  same(sourceRoles[0], xRole, "source X identity");
  same(targetRoles.length, 2, "target role count");
  same(targetRoles[0], aRole, "target A identity");
  same(targetRoles[1], bRole, "target-local B identity");

  // P/Q are grounded relation contexts; only the final coordinate is generic.
  const pX = memory.ensure(O, xRole);
  const qX = memory.ensure(C, xRole);
  const pA = memory.ensure(O, aRole);
  const qA = memory.ensure(C, aRole);

  // Source generic certificate control: P[X] -> Q[X] is independently replay-valid
  // under the exact source RoleDictionary and exact T0.
  const sourceRule = defineStructuralRule(memory, sourceDictionary, qX);
  const sourceDerivationRule = defineStructuralDerivationRule(memory, sourceRule, [pX]);
  const sourceRuleAdmission = admitStructuralRule(memory, theory, sourceRule);
  const sourceDerivationAdmission = admitStructuralDerivationRule(
    memory,
    theory,
    sourceDerivationRule,
  );
  const sourceIdentity = memory.ensure(sourceDerivationRule, theory);
  const sourceAssumptionOccurrence = memory.ensure(pX, sourceIdentity);
  const sourcePremiseSequence = materializeExactSequence(memory, [sourceAssumptionOccurrence]);
  const sourceNodeOccurrence = memory.ensure(sourceDerivationRule, sourcePremiseSequence);
  const sourceEvidence: StructuralDerivedDerivationEvidence = Object.freeze({
    identity: sourceIdentity,
    targetOccurrence: sourceNodeOccurrence,
    assumptions: Object.freeze([
      Object.freeze({ occurrence: sourceAssumptionOccurrence, template: pX }),
    ]),
    nodes: Object.freeze([
      Object.freeze({
        occurrence: sourceNodeOccurrence,
        derivationRule: sourceDerivationRule,
        ruleAdmission: sourceRuleAdmission,
        derivationRuleAdmission: sourceDerivationAdmission,
        premiseOccurrenceSequence: sourcePremiseSequence,
      }),
    ]),
  });
  const beforeSourceReplay = memory.linkCount;
  const sourceReplay = replayStructuralDerivedDerivationSchema(memory, sourceEvidence);
  same(sourceReplay.conclusionTemplate, qX, "source generic conclusion");
  same(memory.linkCount, beforeSourceReplay, "source generic replay is read-only");

  // N2a morphism evidence is ordinary MTS data, not a host Map or callback.
  const morphismEntry = memory.ensure(xRole, aRole);
  const morphismEntries = materializeExactSequence(memory, [morphismEntry]);
  const morphism = materializeExactSequence(memory, [
    theory,
    sourceDictionary,
    targetDictionary,
    morphismEntries,
  ]);
  const morphismValues = readExactSequence(memory, morphism).values;
  same(morphismValues.length, 4, "morphism carrier arity");
  same(morphismValues[0], theory, "morphism exact Theory");
  same(morphismValues[1], sourceDictionary, "morphism source dictionary");
  same(morphismValues[2], targetDictionary, "morphism target dictionary");
  const entryPoles = memory.poles(morphismEntry);
  same(entryPoles.start, xRole, "mu source X");
  same(entryPoles.end, aRole, "mu target A");
  assert(targetRoles.includes(aRole), "mu image A must be a target Role");
  assert(targetRoles.includes(bRole), "target-local B must remain in target scope");
  assert(entryPoles.end !== bRole, "B is not a morphism image");

  // Existing read-only structural unification independently proves that the same
  // mu maps both premise and conclusion templates, including their grounded P/Q.
  const beforeUnify = memory.linkCount;
  const premiseMu = unifyStructuralTemplate(memory, pX, pA, [xRole]);
  const conclusionMu = unifyStructuralTemplate(memory, qX, qA, [xRole]);
  same(bindingValue(premiseMu, xRole), aRole, "P[X] maps to P[A]");
  same(bindingValue(conclusionMu, xRole), aRole, "Q[X] maps to Q[A]");
  same(memory.linkCount, beforeUnify, "morphism inference is read-only");

  // Target generic identity is valid structural data, but it is deliberately NOT
  // admitted as primitive Theory authority. The proof node remains the already
  // admitted source derivation rule and is expected to require N2b composition.
  const targetRule = defineStructuralRule(memory, targetDictionary, qA);
  const targetDerivationRule = defineStructuralDerivationRule(memory, targetRule, [pA]);
  assert(memory.find(theory, targetDerivationRule) === undefined, "mapped target DR must not be admitted");
  const targetIdentity = memory.ensure(targetDerivationRule, theory);
  const targetAssumptionOccurrence = memory.ensure(pA, targetIdentity);
  const mappedPremiseSequence = materializeExactSequence(memory, [targetAssumptionOccurrence]);
  const sourceNodeInTargetOccurrence = memory.ensure(sourceDerivationRule, mappedPremiseSequence);

  const crossScopeEvidence: StructuralDerivedDerivationEvidence = Object.freeze({
    identity: targetIdentity,
    targetOccurrence: sourceNodeInTargetOccurrence,
    assumptions: Object.freeze([
      Object.freeze({ occurrence: targetAssumptionOccurrence, template: pA }),
    ]),
    nodes: Object.freeze([
      Object.freeze({
        occurrence: sourceNodeInTargetOccurrence,
        derivationRule: sourceDerivationRule,
        ruleAdmission: sourceRuleAdmission,
        derivationRuleAdmission: sourceDerivationAdmission,
        premiseOccurrenceSequence: mappedPremiseSequence,
      }),
    ]),
  });

  const beforeCrossScope = memory.linkCount;
  expectDerivedError("role-dictionary-mismatch", () =>
    replayStructuralDerivedDerivationSchema(memory, crossScopeEvidence),
  );
  same(memory.linkCount, beforeCrossScope, "cross-scope rejection remains read-only");

  // Host metadata cannot bridge the trusted boundary. The replay result is still
  // determined only by MTS identities/admissions and the exact RoleDictionaries.
  const crossScopeNode = crossScopeEvidence.nodes[0];
  assert(crossScopeNode !== undefined, "cross-scope fixture must contain its proof node");
  const hostDecoratedNode = Object.freeze({
    ...crossScopeNode,
    generic: true,
    crossScope: true,
    roleMorphism: morphism,
  });
  expectDerivedError("role-dictionary-mismatch", () =>
    replayStructuralDerivedDerivationSchema(memory, {
      ...crossScopeEvidence,
      nodes: Object.freeze([hostDecoratedNode]),
    }),
  );

  // Executable N2b classification. Representation and mu are sufficient, while
  // trusted proof authority across scopes is intentionally absent in this kernel.
  const GENERIC_CROSS_SCOPE_REUSE_REPLAY_GAP_CONFIRMED = true;
  const ROLE_MORPHISM_REPRESENTATION_GAP = false;
  const ACCEPTED_SEMANTIC_DELTA_REQUIRED = false;
  assert(GENERIC_CROSS_SCOPE_REUSE_REPLAY_GAP_CONFIRMED, "N2b replay-gap classification");
  assert(!ROLE_MORPHISM_REPRESENTATION_GAP, "N2a representation remains sufficient");
  assert(!ACCEPTED_SEMANTIC_DELTA_REQUIRED, "N2b evidence is proof-calculus pressure only");
}

main();
