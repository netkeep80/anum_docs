import { type LinkHandle, type ReadMemory } from "./memory.js";
import { readStructuralDerivationRule } from "./derivation.js";
import {
  replayStructuralDerivedDerivationSchema,
  type StructuralDerivedDerivationEvidence,
  type StructuralDerivedDerivationReplayResult,
} from "./derived-derivation-schema.js";
import { readStructuralRoleDictionary, readStructuralRule } from "./structural-rule.js";
import {
  StructuralRoleMorphismError,
  replayStructuralRoleMorphism,
  verifyStructuralRoleMorphismMapping,
  type StructuralRoleMorphismBinding,
} from "./structural-role-morphism.js";

export type StructuralDerivedDerivationCrossScopeApplicationReplayErrorCode =
  | "invalid-source-schema" | "invalid-target-identity" | "theory-mismatch" | "invalid-morphism"
  | "source-dictionary-mismatch" | "target-dictionary-mismatch" | "undeclared-source-role"
  | "duplicate-source-role" | "missing-source-role" | "target-role-not-member"
  | "premise-count-mismatch" | "premise-mapping-mismatch" | "conclusion-mapping-mismatch"
  | "grounded-target-role-capture" | "cross-scope-application-wrote";

export class StructuralDerivedDerivationCrossScopeApplicationReplayError extends Error {
  override readonly name = "StructuralDerivedDerivationCrossScopeApplicationReplayError";
  constructor(readonly code: StructuralDerivedDerivationCrossScopeApplicationReplayErrorCode) {
    super(code);
  }
}

export type CrossScopeRoleMorphismBinding = StructuralRoleMorphismBinding;

export interface StructuralDerivedDerivationCrossScopeApplicationEvidence {
  readonly source: StructuralDerivedDerivationEvidence;
  readonly morphism: LinkHandle;
  readonly targetIdentity: LinkHandle;
}

export interface StructuralDerivedDerivationCrossScopeApplicationReplayResult {
  readonly source: StructuralDerivedDerivationReplayResult;
  readonly theory: LinkHandle;
  readonly sourceDictionary: LinkHandle;
  readonly targetDictionary: LinkHandle;
  readonly targetDerivationRule: LinkHandle;
  readonly targetConclusionTemplate: LinkHandle;
  readonly bindings: readonly CrossScopeRoleMorphismBinding[];
}

function fail(code: StructuralDerivedDerivationCrossScopeApplicationReplayErrorCode): never {
  throw new StructuralDerivedDerivationCrossScopeApplicationReplayError(code);
}

function mapMorphismError(error: StructuralRoleMorphismError): never {
  switch (error.code) {
    case "invalid-morphism": fail("invalid-morphism");
    case "theory-mismatch": fail("theory-mismatch");
    case "source-dictionary-mismatch": fail("source-dictionary-mismatch");
    case "target-dictionary-mismatch": fail("target-dictionary-mismatch");
    case "undeclared-source-role": fail("undeclared-source-role");
    case "duplicate-source-role": fail("duplicate-source-role");
    case "missing-source-role": fail("missing-source-role");
    case "target-role-not-member": fail("target-role-not-member");
    case "grounded-target-role-capture": fail("grounded-target-role-capture");
    case "replay-wrote": fail("cross-scope-application-wrote");
    case "mapping-mismatch": fail("invalid-morphism");
  }
}

function verifyMapping(
  memory: ReadMemory,
  source: LinkHandle,
  target: LinkHandle,
  bindings: readonly CrossScopeRoleMorphismBinding[],
  targetRoles: readonly LinkHandle[],
  mismatch: "premise-mapping-mismatch" | "conclusion-mapping-mismatch",
): void {
  try {
    verifyStructuralRoleMorphismMapping(memory, source, target, bindings, targetRoles);
  } catch (error) {
    if (error instanceof StructuralRoleMorphismError) {
      if (error.code === "mapping-mismatch") fail(mismatch);
      mapMorphismError(error);
    }
    throw error;
  }
}

export function replayStructuralDerivedDerivationCrossScopeApplication(
  memory: ReadMemory,
  evidence: StructuralDerivedDerivationCrossScopeApplicationEvidence,
): StructuralDerivedDerivationCrossScopeApplicationReplayResult {
  const before = memory.linkCount;
  try {
    let source: StructuralDerivedDerivationReplayResult;
    try {
      source = replayStructuralDerivedDerivationSchema(memory, evidence.source);
    } catch {
      fail("invalid-source-schema");
    }

    let sourceSchema: ReturnType<typeof readStructuralDerivationRule>;
    let sourceRule: ReturnType<typeof readStructuralRule>;
    let sourceRoles: readonly LinkHandle[];
    try {
      sourceSchema = readStructuralDerivationRule(memory, source.derivationRule);
      sourceRule = readStructuralRule(memory, sourceSchema.structuralRule);
      sourceRoles = readStructuralRoleDictionary(memory, sourceRule.roleDictionary).roles;
    } catch {
      fail("invalid-source-schema");
    }

    let targetDerivationRule: LinkHandle;
    let targetTheory: LinkHandle;
    try {
      ({ start: targetDerivationRule, end: targetTheory } = memory.poles(evidence.targetIdentity));
    } catch {
      fail("invalid-target-identity");
    }
    if (targetTheory !== source.theory) fail("theory-mismatch");

    let targetSchema: ReturnType<typeof readStructuralDerivationRule>;
    let targetRule: ReturnType<typeof readStructuralRule>;
    let targetRoles: readonly LinkHandle[];
    try {
      targetSchema = readStructuralDerivationRule(memory, targetDerivationRule);
      targetRule = readStructuralRule(memory, targetSchema.structuralRule);
      targetRoles = readStructuralRoleDictionary(memory, targetRule.roleDictionary).roles;
    } catch {
      fail("invalid-target-identity");
    }

    let bindings: readonly CrossScopeRoleMorphismBinding[];
    try {
      bindings = replayStructuralRoleMorphism(memory, evidence.morphism, {
        theory: source.theory,
        sourceDictionary: sourceRule.roleDictionary,
        targetDictionary: targetRule.roleDictionary,
        sourceRoles,
        targetRoles,
      }).bindings;
    } catch (error) {
      if (error instanceof StructuralRoleMorphismError) mapMorphismError(error);
      throw error;
    }

    if (sourceSchema.premiseTemplates.length !== targetSchema.premiseTemplates.length) {
      fail("premise-count-mismatch");
    }
    sourceSchema.premiseTemplates.forEach((template, index) => {
      const mapped = targetSchema.premiseTemplates[index];
      if (mapped === undefined) fail("premise-count-mismatch");
      verifyMapping(memory, template, mapped, bindings, targetRoles, "premise-mapping-mismatch");
    });
    verifyMapping(
      memory,
      source.conclusionTemplate,
      targetRule.body,
      bindings,
      targetRoles,
      "conclusion-mapping-mismatch",
    );

    if (memory.linkCount !== before) fail("cross-scope-application-wrote");
    return Object.freeze({
      source,
      theory: source.theory,
      sourceDictionary: sourceRule.roleDictionary,
      targetDictionary: targetRule.roleDictionary,
      targetDerivationRule,
      targetConclusionTemplate: targetRule.body,
      bindings,
    });
  } finally {
    if (memory.linkCount !== before) fail("cross-scope-application-wrote");
  }
}
