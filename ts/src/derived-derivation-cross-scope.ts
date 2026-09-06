import { ExactSequenceError, readExactSequence } from "./exact-sequence.js";
import { MemoryError, type LinkHandle, type ReadMemory } from "./memory.js";
import { readStructuralDerivationRule } from "./derivation.js";
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
} from "./structural-rule.js";

export type StructuralDerivedDerivationCrossScopeApplicationReplayErrorCode =
  | "invalid-source-schema"
  | "invalid-target-identity"
  | "theory-mismatch"
  | "invalid-morphism"
  | "source-dictionary-mismatch"
  | "target-dictionary-mismatch"
  | "undeclared-source-role"
  | "duplicate-source-role"
  | "missing-source-role"
  | "target-role-not-member"
  | "premise-count-mismatch"
  | "premise-mapping-mismatch"
  | "conclusion-mapping-mismatch"
  | "grounded-target-role-capture"
  | "cross-scope-application-wrote";

export class StructuralDerivedDerivationCrossScopeApplicationReplayError extends Error {
  override readonly name = "StructuralDerivedDerivationCrossScopeApplicationReplayError";
  constructor(readonly code: StructuralDerivedDerivationCrossScopeApplicationReplayErrorCode) {
    super(code);
  }
}

export interface CrossScopeRoleMorphismBinding {
  readonly sourceRole: LinkHandle;
  readonly targetRole: LinkHandle;
}

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

function readMorphism(
  memory: ReadMemory,
  evidence: LinkHandle,
  theory: LinkHandle,
  sourceDictionary: LinkHandle,
  targetDictionary: LinkHandle,
  sourceRoles: readonly LinkHandle[],
  targetRoles: readonly LinkHandle[],
): readonly CrossScopeRoleMorphismBinding[] {
  let values: readonly LinkHandle[];
  try {
    values = readExactSequence(memory, evidence).values;
  } catch (error) {
    if (error instanceof ExactSequenceError || error instanceof MemoryError) fail("invalid-morphism");
    throw error;
  }
  if (values.length !== 4) fail("invalid-morphism");
  const [carrierTheory, carrierSource, carrierTarget, entriesHandle] = values;
  if (carrierTheory !== theory) fail("theory-mismatch");
  if (carrierSource !== sourceDictionary) fail("source-dictionary-mismatch");
  if (carrierTarget !== targetDictionary) fail("target-dictionary-mismatch");
  if (entriesHandle === undefined) fail("invalid-morphism");

  let entries: readonly LinkHandle[];
  try {
    entries = readExactSequence(memory, entriesHandle).values;
  } catch (error) {
    if (error instanceof ExactSequenceError || error instanceof MemoryError) fail("invalid-morphism");
    throw error;
  }
  const sourceSet = new Set(sourceRoles);
  const targetSet = new Set(targetRoles);
  const mapped = new Map<LinkHandle, LinkHandle>();
  for (const entry of entries) {
    let sourceRole: LinkHandle;
    let targetRole: LinkHandle;
    try {
      ({ start: sourceRole, end: targetRole } = memory.poles(entry));
    } catch (error) {
      if (error instanceof MemoryError) fail("invalid-morphism");
      throw error;
    }
    if (!sourceSet.has(sourceRole)) fail("undeclared-source-role");
    if (mapped.has(sourceRole)) fail("duplicate-source-role");
    if (!targetSet.has(targetRole)) fail("target-role-not-member");
    mapped.set(sourceRole, targetRole);
  }
  return Object.freeze(sourceRoles.map((sourceRole) => {
    const targetRole = mapped.get(sourceRole);
    if (targetRole === undefined) fail("missing-source-role");
    return Object.freeze({ sourceRole, targetRole });
  }));
}

function verifyMapping(
  memory: ReadMemory,
  source: LinkHandle,
  target: LinkHandle,
  bindings: readonly CrossScopeRoleMorphismBinding[],
  targetRoles: readonly LinkHandle[],
  mismatch: "premise-mapping-mismatch" | "conclusion-mapping-mismatch",
): void {
  const adapted = bindings.map(({ sourceRole, targetRole }) => ({ role: sourceRole, value: targetRole }));
  try {
    matchStructuralTemplate(memory, source, target, adapted);
  } catch (error) {
    if (error instanceof StructuralRuleError || error instanceof MemoryError) fail(mismatch);
    throw error;
  }

  const mu = new Map(bindings.map((binding) => [binding.sourceRole, binding.targetRole]));
  const targetSet = new Set(targetRoles);
  const visited = new Map<LinkHandle, Set<LinkHandle>>();
  const walk = (left: LinkHandle, right: LinkHandle): void => {
    const replacement = mu.get(left);
    if (replacement !== undefined) {
      if (replacement !== right || !targetSet.has(right)) fail(mismatch);
      return;
    }
    if (targetSet.has(right)) fail("grounded-target-role-capture");
    let rights = visited.get(left);
    if (rights === undefined) {
      rights = new Set<LinkHandle>();
      visited.set(left, rights);
    }
    if (rights.has(right)) return;
    rights.add(right);
    try {
      const lp = memory.poles(left);
      const rp = memory.poles(right);
      walk(lp.start, rp.start);
      walk(lp.end, rp.end);
    } catch (error) {
      if (error instanceof StructuralDerivedDerivationCrossScopeApplicationReplayError) throw error;
      if (error instanceof MemoryError) fail(mismatch);
      throw error;
    }
  };
  walk(source, target);
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

    const bindings = readMorphism(
      memory,
      evidence.morphism,
      source.theory,
      sourceRule.roleDictionary,
      targetRule.roleDictionary,
      sourceRoles,
      targetRoles,
    );
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
