import { StructuralDerivationReplayError, readStructuralDerivationRule } from "./derivation.js";
import { ExactSequenceError, readExactSequence } from "./exact-sequence.js";
import { MemoryError, type LinkHandle, type ReadMemory } from "./memory.js";
import {
  StructuralDerivedDerivationReplayError,
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

export interface StructuralDerivedDerivationSpecializationAssumptionEvidence {
  readonly occurrence: LinkHandle;
  readonly template: LinkHandle;
}

export interface StructuralDerivedDerivationSpecializationEvidence {
  readonly source: StructuralDerivedDerivationEvidence;
  readonly specialization: LinkHandle;
  readonly targetIdentity: LinkHandle;
  readonly targetAssumptions: readonly StructuralDerivedDerivationSpecializationAssumptionEvidence[];
  readonly targetOccurrence: LinkHandle;
}

export interface StructuralDerivedDerivationSpecializationReplayResult {
  readonly source: StructuralDerivedDerivationReplayResult;
  readonly theory: LinkHandle;
  readonly sourceDictionary: LinkHandle;
  readonly targetDictionary: LinkHandle;
  readonly targetDerivationRule: LinkHandle;
  readonly targetConclusionTemplate: LinkHandle;
  readonly targetAssumptionCount: number;
  readonly premiseSlotCount: number;
}

export type StructuralDerivedDerivationSpecializationReplayErrorCode =
  | "invalid-source-schema"
  | "invalid-specialization-carrier"
  | "theory-mismatch"
  | "source-dictionary-mismatch"
  | "target-dictionary-mismatch"
  | "undeclared-source-role"
  | "duplicate-source-role-binding"
  | "binding-partition-overlap"
  | "missing-source-role"
  | "target-role-not-member"
  | "grounded-target-role-capture"
  | "invalid-target-identity"
  | "target-primitive-admission"
  | "premise-count-mismatch"
  | "premise-mapping-mismatch"
  | "conclusion-mismatch"
  | "assumption-image-mismatch"
  | "invalid-assumption-occurrence"
  | "premise-slot-mismatch"
  | "specialization-wrote";

export class StructuralDerivedDerivationSpecializationReplayError extends Error {
  override readonly name = "StructuralDerivedDerivationSpecializationReplayError";
  constructor(readonly code: StructuralDerivedDerivationSpecializationReplayErrorCode) {
    super(code);
  }
}

function fail(code: StructuralDerivedDerivationSpecializationReplayErrorCode): never {
  throw new StructuralDerivedDerivationSpecializationReplayError(code);
}

function schemaParts(memory: ReadMemory, derivationRule: LinkHandle) {
  const schema = readStructuralDerivationRule(memory, derivationRule);
  const rule = readStructuralRule(memory, schema.structuralRule);
  const roles = readStructuralRoleDictionary(memory, rule.roleDictionary).roles;
  return { schema, rule, roles };
}

function exactValues(memory: ReadMemory, sequence: LinkHandle, code: StructuralDerivedDerivationSpecializationReplayErrorCode) {
  try { return readExactSequence(memory, sequence).values; }
  catch (error) { if (error instanceof ExactSequenceError) return fail(code); throw error; }
}

function verifyMapped(
  memory: ReadMemory,
  source: LinkHandle,
  target: LinkHandle,
  bindings: readonly StructuralRoleBinding[],
  replacements: ReadonlyMap<LinkHandle, LinkHandle>,
  targetRoles: ReadonlySet<LinkHandle>,
  mismatch: "premise-mapping-mismatch" | "conclusion-mismatch",
): void {
  try { matchStructuralTemplate(memory, source, target, bindings); }
  catch (error) { if (error instanceof StructuralRuleError) fail(mismatch); throw error; }

  const visited = new Map<LinkHandle, Set<LinkHandle>>();
  const walk = (left: LinkHandle, right: LinkHandle): void => {
    const replacement = replacements.get(left);
    if (replacement !== undefined) {
      if (replacement !== right) fail(mismatch);
      return;
    }
    if (targetRoles.has(right)) fail("grounded-target-role-capture");
    let rights = visited.get(left);
    if (rights === undefined) { rights = new Set(); visited.set(left, rights); }
    if (rights.has(right)) return;
    rights.add(right);
    try {
      const lp = memory.poles(left);
      const rp = memory.poles(right);
      walk(lp.start, rp.start);
      walk(lp.end, rp.end);
    } catch (error) {
      if (error instanceof StructuralDerivedDerivationSpecializationReplayError) throw error;
      if (error instanceof MemoryError) fail(mismatch);
      throw error;
    }
  };
  walk(source, target);
}

function replayBody(
  memory: ReadMemory,
  evidence: StructuralDerivedDerivationSpecializationEvidence,
): StructuralDerivedDerivationSpecializationReplayResult {
  let source: StructuralDerivedDerivationReplayResult;
  try { source = replayStructuralDerivedDerivationSchema(memory, evidence.source); }
  catch (error) { if (error instanceof StructuralDerivedDerivationReplayError) fail("invalid-source-schema"); throw error; }

  let sourceParts: ReturnType<typeof schemaParts>;
  try { sourceParts = schemaParts(memory, source.derivationRule); }
  catch (error) { if (error instanceof StructuralDerivationReplayError || error instanceof StructuralRuleError) fail("invalid-source-schema"); throw error; }
  const sourceDictionary = sourceParts.rule.roleDictionary;
  const sourceRoleSet = new Set(sourceParts.roles);

  let targetDerivationRule: LinkHandle;
  try {
    const identity = memory.poles(evidence.targetIdentity);
    if (identity.end !== source.theory) fail("invalid-target-identity");
    targetDerivationRule = identity.start;
  } catch (error) {
    if (error instanceof StructuralDerivedDerivationSpecializationReplayError) throw error;
    if (error instanceof MemoryError) fail("invalid-target-identity");
    throw error;
  }
  let targetParts: ReturnType<typeof schemaParts>;
  try { targetParts = schemaParts(memory, targetDerivationRule); }
  catch (error) { if (error instanceof StructuralDerivationReplayError || error instanceof StructuralRuleError) fail("invalid-target-identity"); throw error; }
  const targetDictionary = targetParts.rule.roleDictionary;
  const targetRoleSet = new Set(targetParts.roles);
  if (memory.find(source.theory, targetDerivationRule) !== undefined) fail("target-primitive-admission");

  const coordinates = exactValues(memory, evidence.specialization, "invalid-specialization-carrier");
  if (coordinates.length !== 5) fail("invalid-specialization-carrier");
  const [carrierTheory, carrierSource, carrierTarget, roleSequence, groundSequence] = coordinates;
  if (carrierTheory !== source.theory) fail("theory-mismatch");
  if (carrierSource !== sourceDictionary) fail("source-dictionary-mismatch");
  if (carrierTarget !== targetDictionary) fail("target-dictionary-mismatch");
  if (roleSequence === undefined || groundSequence === undefined) fail("invalid-specialization-carrier");

  const roleEntries = exactValues(memory, roleSequence, "invalid-specialization-carrier");
  const groundEntries = exactValues(memory, groundSequence, "invalid-specialization-carrier");
  const replacements = new Map<LinkHandle, LinkHandle>();
  const roleBindings: StructuralRoleBinding[] = [];
  const seenRolePartition = new Set<LinkHandle>();
  const seenGroundPartition = new Set<LinkHandle>();

  const readBinding = (entry: LinkHandle): readonly [LinkHandle, LinkHandle] => {
    try { const p = memory.poles(entry); return [p.start, p.end] as const; }
    catch (error) { if (error instanceof MemoryError) return fail("invalid-specialization-carrier"); throw error; }
  };
  for (const entry of roleEntries) {
    const [role, value] = readBinding(entry);
    if (!sourceRoleSet.has(role)) fail("undeclared-source-role");
    if (seenRolePartition.has(role)) fail("duplicate-source-role-binding");
    seenRolePartition.add(role);
    if (!targetRoleSet.has(value)) fail("target-role-not-member");
    replacements.set(role, value);
    roleBindings.push(Object.freeze({ role, value }));
  }
  for (const entry of groundEntries) {
    const [role, value] = readBinding(entry);
    if (!sourceRoleSet.has(role)) fail("undeclared-source-role");
    if (seenGroundPartition.has(role)) fail("duplicate-source-role-binding");
    seenGroundPartition.add(role);
    if (seenRolePartition.has(role)) fail("binding-partition-overlap");
    try { memory.poles(value); }
    catch (error) { if (error instanceof MemoryError) fail("invalid-specialization-carrier"); throw error; }
    if (targetRoleSet.has(value)) fail("grounded-target-role-capture");
    replacements.set(role, value);
    roleBindings.push(Object.freeze({ role, value }));
  }
  for (const role of sourceParts.roles) if (!replacements.has(role)) fail("missing-source-role");

  if (sourceParts.schema.premiseTemplates.length !== targetParts.schema.premiseTemplates.length) {
    fail("premise-count-mismatch");
  }
  for (let i = 0; i < sourceParts.schema.premiseTemplates.length; i += 1) {
    const left = sourceParts.schema.premiseTemplates[i];
    const right = targetParts.schema.premiseTemplates[i];
    if (left === undefined || right === undefined) fail("premise-count-mismatch");
    verifyMapped(memory, left, right, roleBindings, replacements, targetRoleSet, "premise-mapping-mismatch");
  }
  verifyMapped(
    memory,
    sourceParts.rule.body,
    targetParts.rule.body,
    roleBindings,
    replacements,
    targetRoleSet,
    "conclusion-mismatch",
  );

  const uniqueTemplates: LinkHandle[] = [];
  const uniqueSet = new Set<LinkHandle>();
  for (const template of targetParts.schema.premiseTemplates) {
    if (!uniqueSet.has(template)) { uniqueSet.add(template); uniqueTemplates.push(template); }
  }
  if (evidence.targetAssumptions.length !== uniqueTemplates.length) fail("assumption-image-mismatch");
  const occurrenceByTemplate = new Map<LinkHandle, LinkHandle>();
  const seenOccurrences = new Set<LinkHandle>();
  for (let i = 0; i < uniqueTemplates.length; i += 1) {
    const expected = uniqueTemplates[i];
    const actual = evidence.targetAssumptions[i];
    if (expected === undefined || actual === undefined || actual.template !== expected) fail("assumption-image-mismatch");
    if (seenOccurrences.has(actual.occurrence)) fail("invalid-assumption-occurrence");
    seenOccurrences.add(actual.occurrence);
    try {
      const p = memory.poles(actual.occurrence);
      if (p.start !== actual.template || p.end !== evidence.targetIdentity) fail("invalid-assumption-occurrence");
    } catch (error) {
      if (error instanceof StructuralDerivedDerivationSpecializationReplayError) throw error;
      if (error instanceof MemoryError) fail("invalid-assumption-occurrence");
      throw error;
    }
    occurrenceByTemplate.set(actual.template, actual.occurrence);
  }

  let premiseOccurrenceSequence: LinkHandle;
  try {
    const targetOccurrence = memory.poles(evidence.targetOccurrence);
    if (targetOccurrence.start !== targetDerivationRule) fail("premise-slot-mismatch");
    premiseOccurrenceSequence = targetOccurrence.end;
  } catch (error) {
    if (error instanceof StructuralDerivedDerivationSpecializationReplayError) throw error;
    if (error instanceof MemoryError) fail("premise-slot-mismatch");
    throw error;
  }
  const slots = exactValues(memory, premiseOccurrenceSequence, "premise-slot-mismatch");
  if (slots.length !== targetParts.schema.premiseTemplates.length) fail("premise-slot-mismatch");
  for (let i = 0; i < slots.length; i += 1) {
    const template = targetParts.schema.premiseTemplates[i];
    if (template === undefined || slots[i] !== occurrenceByTemplate.get(template)) fail("premise-slot-mismatch");
  }

  return Object.freeze({
    source,
    theory: source.theory,
    sourceDictionary,
    targetDictionary,
    targetDerivationRule,
    targetConclusionTemplate: targetParts.rule.body,
    targetAssumptionCount: uniqueTemplates.length,
    premiseSlotCount: slots.length,
  });
}

export function replayStructuralDerivedDerivationSpecialization(
  memory: ReadMemory,
  evidence: StructuralDerivedDerivationSpecializationEvidence,
): StructuralDerivedDerivationSpecializationReplayResult {
  const before = memory.linkCount;
  try {
    const result = replayBody(memory, evidence);
    if (memory.linkCount !== before) fail("specialization-wrote");
    return result;
  } catch (error) { if (memory.linkCount !== before) fail("specialization-wrote"); throw error; }
}
