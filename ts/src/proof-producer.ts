import {
  admitStructuralDerivationRule,
  defineStructuralAssumptionContext,
  defineStructuralDerivationRule,
  defineStructuralProofOccurrence,
  defineStructuralTheorem,
} from "./derivation.js";
import { materializeExactSequence } from "./exact-sequence.js";
import type { LinkHandle, WriteMemory } from "./memory.js";
import { defineContext } from "./state.js";
import { defineActField, defineActHeader } from "./structural-readers.js";
import {
  admitStructuralRule,
  defineStructuralInterpreter,
  defineStructuralRoleDictionary,
  defineStructuralRule,
} from "./structural-rule.js";

/**
 * Construction-only facade for untrusted proof producers.
 *
 * Every method only materializes the existing structural evidence vocabulary.
 * The facade deliberately exposes no replay/acceptance operation: successful
 * construction is candidate preparation only, while existing replay APIs remain
 * the sole proof-authority boundary.
 */
export interface StructuralProofProducer {
  defineContext(parent: LinkHandle, current: LinkHandle): LinkHandle;
  defineInterpreter(dictionary: LinkHandle, grammar: LinkHandle, theory: LinkHandle): LinkHandle;
  defineRoleDictionary(roles: readonly LinkHandle[]): LinkHandle;
  defineRule(roleDictionary: LinkHandle, body: LinkHandle): LinkHandle;
  admitRule(theory: LinkHandle, rule: LinkHandle): LinkHandle;
  defineAct(interpreter: LinkHandle, roleDictionary: LinkHandle, afterContext: LinkHandle): LinkHandle;
  defineActField(act: LinkHandle, role: LinkHandle, value: LinkHandle): LinkHandle;
  defineProofOccurrence(act: LinkHandle, claim: LinkHandle): LinkHandle;
  defineDerivationRule(rule: LinkHandle, premiseTemplates: readonly LinkHandle[]): LinkHandle;
  admitDerivationRule(theory: LinkHandle, derivationRule: LinkHandle): LinkHandle;
  definePremiseOccurrenceSequence(occurrences: readonly LinkHandle[]): LinkHandle;
  defineAssumptionContext(theory: LinkHandle, claims: readonly LinkHandle[]): LinkHandle;
  defineTheorem(claim: LinkHandle, theory: LinkHandle): LinkHandle;
}

export function createStructuralProofProducer(
  memory: WriteMemory,
): StructuralProofProducer {
  return Object.freeze({
    defineContext: (parent: LinkHandle, current: LinkHandle) =>
      defineContext(memory, parent, current),
    defineInterpreter: (dictionary: LinkHandle, grammar: LinkHandle, theory: LinkHandle) =>
      defineStructuralInterpreter(memory, dictionary, grammar, theory),
    defineRoleDictionary: (roles: readonly LinkHandle[]) =>
      defineStructuralRoleDictionary(memory, roles),
    defineRule: (roleDictionary: LinkHandle, body: LinkHandle) =>
      defineStructuralRule(memory, roleDictionary, body),
    admitRule: (theory: LinkHandle, rule: LinkHandle) =>
      admitStructuralRule(memory, theory, rule),
    defineAct: (interpreter: LinkHandle, roleDictionary: LinkHandle, afterContext: LinkHandle) =>
      defineActHeader(memory, interpreter, roleDictionary, afterContext),
    defineActField: (act: LinkHandle, role: LinkHandle, value: LinkHandle) =>
      defineActField(memory, act, role, value),
    defineProofOccurrence: (act: LinkHandle, claim: LinkHandle) =>
      defineStructuralProofOccurrence(memory, act, claim),
    defineDerivationRule: (rule: LinkHandle, premiseTemplates: readonly LinkHandle[]) =>
      defineStructuralDerivationRule(memory, rule, premiseTemplates),
    admitDerivationRule: (theory: LinkHandle, derivationRule: LinkHandle) =>
      admitStructuralDerivationRule(memory, theory, derivationRule),
    definePremiseOccurrenceSequence: (occurrences: readonly LinkHandle[]) =>
      materializeExactSequence(memory, occurrences),
    defineAssumptionContext: (theory: LinkHandle, claims: readonly LinkHandle[]) =>
      defineStructuralAssumptionContext(memory, theory, claims),
    defineTheorem: (claim: LinkHandle, theory: LinkHandle) =>
      defineStructuralTheorem(memory, claim, theory),
  });
}
