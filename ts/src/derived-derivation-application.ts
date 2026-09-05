import {
  MemoryError,
  type LinkHandle,
  type ReadMemory,
} from "./memory.js";
import {
  readStructuralDerivationRule,
  replayStructuralDerivationWithAssumptions,
  type StructuralDerivationWithAssumptionsEvidence,
  type StructuralDerivationWithAssumptionsReplayResult,
} from "./derivation.js";
import {
  replayStructuralDerivedDerivationSchema,
  type StructuralDerivedDerivationEvidence,
  type StructuralDerivedDerivationReplayResult,
} from "./derived-derivation-schema.js";
import {
  StructuralRuleError,
  matchStructuralTemplate,
  readStructuralRoleDictionary,
  readStructuralRule,
  type StructuralRoleBinding,
} from "./structural-rule.js";

export type StructuralDerivedDerivationApplicationReplayErrorCode =
  | "duplicate-role-binding"
  | "undeclared-role-binding"
  | "missing-role-binding"
  | "role-valued-binding"
  | "invalid-binding-value"
  | "theory-mismatch"
  | "premise-count-mismatch"
  | "premise-instance-mismatch"
  | "target-instance-mismatch"
  | "application-replay-wrote";

export class StructuralDerivedDerivationApplicationReplayError extends Error {
  override readonly name = "StructuralDerivedDerivationApplicationReplayError";

  constructor(readonly code: StructuralDerivedDerivationApplicationReplayErrorCode) {
    super(code);
  }
}

export interface StructuralDerivedDerivationApplicationReplayResult {
  readonly generic: StructuralDerivedDerivationReplayResult;
  readonly concrete: StructuralDerivationWithAssumptionsReplayResult;
  readonly bindings: readonly StructuralRoleBinding[];
}

function fail(code: StructuralDerivedDerivationApplicationReplayErrorCode): never {
  throw new StructuralDerivedDerivationApplicationReplayError(code);
}

/**
 * Trusted read-only composition of a replay-valid generic derivation schema
 * with independently replay-valid ordinary evidence for one exact rho-instance.
 *
 * The concrete producer is not trusted. Acceptance binds the two replay
 * results by exact Theory identity and by structural premise/conclusion
 * matching under the generic RoleDictionary.
 */
export function replayStructuralDerivedDerivationApplication(
  memory: ReadMemory,
  genericEvidence: StructuralDerivedDerivationEvidence,
  concreteEvidence: StructuralDerivationWithAssumptionsEvidence,
  bindings: readonly StructuralRoleBinding[],
): StructuralDerivedDerivationApplicationReplayResult {
  const before = memory.linkCount;

  try {
    const generic = replayStructuralDerivedDerivationSchema(memory, genericEvidence);
    const targetSchema = readStructuralDerivationRule(memory, generic.derivationRule);
    const targetRule = readStructuralRule(memory, targetSchema.structuralRule);
    const roleDictionary = readStructuralRoleDictionary(memory, targetRule.roleDictionary);

    const roleSet = new Set(roleDictionary.roles);
    const rho = new Map<LinkHandle, LinkHandle>();
    for (const binding of bindings) {
      if (!roleSet.has(binding.role)) fail("undeclared-role-binding");
      if (rho.has(binding.role)) fail("duplicate-role-binding");
      if (roleSet.has(binding.value)) fail("role-valued-binding");
      try {
        memory.poles(binding.value);
      } catch (error) {
        if (error instanceof MemoryError) fail("invalid-binding-value");
        throw error;
      }
      rho.set(binding.role, binding.value);
    }
    for (const role of roleDictionary.roles) {
      if (!rho.has(role)) fail("missing-role-binding");
    }

    const orderedBindings = Object.freeze(
      roleDictionary.roles.map((role): StructuralRoleBinding => {
        const value = rho.get(role);
        if (value === undefined) fail("missing-role-binding");
        return Object.freeze({ role, value });
      }),
    );

    const concrete = replayStructuralDerivationWithAssumptions(memory, concreteEvidence);
    if (concrete.derivation.theory !== generic.theory) fail("theory-mismatch");

    if (concrete.declaredAssumptionClaims.length !== targetSchema.premiseTemplates.length) {
      fail("premise-count-mismatch");
    }
    targetSchema.premiseTemplates.forEach((template, index) => {
      const claim = concrete.declaredAssumptionClaims[index];
      if (claim === undefined) fail("premise-count-mismatch");
      try {
        matchStructuralTemplate(memory, template, claim, orderedBindings);
      } catch (error) {
        if (error instanceof StructuralRuleError || error instanceof MemoryError) {
          fail("premise-instance-mismatch");
        }
        throw error;
      }
    });

    try {
      matchStructuralTemplate(
        memory,
        generic.conclusionTemplate,
        concrete.derivation.target.judgment.claim,
        orderedBindings,
      );
    } catch (error) {
      if (error instanceof StructuralRuleError || error instanceof MemoryError) {
        fail("target-instance-mismatch");
      }
      throw error;
    }

    if (memory.linkCount !== before) fail("application-replay-wrote");
    return Object.freeze({
      generic,
      concrete,
      bindings: orderedBindings,
    });
  } finally {
    if (memory.linkCount !== before) {
      throw new StructuralDerivedDerivationApplicationReplayError("application-replay-wrote");
    }
  }
}
