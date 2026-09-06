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

export type StructuralClosureApplicationReplayErrorCode =
  | "invalid-authority"
  | "authority-not-admitted"
  | "theory-mismatch"
  | "invalid-base"
  | "invalid-step"
  | "invalid-result-identity"
  | "invalid-scope"
  | "invalid-authority-morphism"
  | "invalid-current-morphism"
  | "invalid-next-morphism"
  | "invalid-base-grounding"
  | "domain-mismatch"
  | "step-mismatch"
  | "ih-mismatch"
  | "next-conclusion-mismatch"
  | "base-mismatch"
  | "grounded-target-role-capture"
  | "result-primitive-admission"
  | "closure-application-wrote";

export class StructuralClosureApplicationReplayError extends Error {
  override readonly name = "StructuralClosureApplicationReplayError";
  constructor(readonly code: StructuralClosureApplicationReplayErrorCode) { super(code); }
}

export interface StructuralClosureApplicationEvidence {
  readonly authority: LinkHandle;
  readonly authorityAdmission: LinkHandle;
  readonly base: StructuralDerivedDerivationEvidence;
  readonly step: StructuralDerivedDerivationEvidence;
  readonly resultIdentity: LinkHandle;
  readonly authorityMorphism: LinkHandle;
  readonly currentMorphism: LinkHandle;
  readonly nextMorphism: LinkHandle;
  readonly baseGrounding: LinkHandle;
}

export interface StructuralClosureApplicationReplayResult {
  readonly theory: LinkHandle;
  readonly authority: LinkHandle;
  readonly resultDerivationRule: LinkHandle;
  readonly resultConclusionTemplate: LinkHandle;
  readonly base: StructuralDerivedDerivationReplayResult;
  readonly step: StructuralDerivedDerivationReplayResult;
}

interface MappingBinding { readonly sourceRole: LinkHandle; readonly targetRole: LinkHandle; }

function fail(code: StructuralClosureApplicationReplayErrorCode): never {
  throw new StructuralClosureApplicationReplayError(code);
}

function sequence(
  memory: ReadMemory,
  link: LinkHandle,
  code: StructuralClosureApplicationReplayErrorCode,
): readonly LinkHandle[] {
  try { return readExactSequence(memory, link).values; }
  catch (error) {
    if (error instanceof ExactSequenceError || error instanceof MemoryError) fail(code);
    throw error;
  }
}

function verifyAdmission(
  memory: ReadMemory,
  admission: LinkHandle,
  theory: LinkHandle,
  target: LinkHandle,
): void {
  try {
    const poles = memory.poles(admission);
    if (poles.start !== theory || poles.end !== target) fail("authority-not-admitted");
  } catch (error) {
    if (error instanceof StructuralClosureApplicationReplayError) throw error;
    if (error instanceof MemoryError) fail("authority-not-admitted");
    throw error;
  }
}

function readMorphism(
  memory: ReadMemory,
  carrier: LinkHandle,
  theory: LinkHandle,
  sourceDictionary: LinkHandle,
  targetDictionary: LinkHandle,
  sourceRoles: readonly LinkHandle[],
  targetRoles: readonly LinkHandle[],
  code: "invalid-authority-morphism" | "invalid-current-morphism" | "invalid-next-morphism",
): readonly MappingBinding[] {
  const values = sequence(memory, carrier, code);
  if (values.length !== 4) fail(code);
  const [carrierTheory, source, target, entriesHandle] = values;
  if (carrierTheory !== theory || source !== sourceDictionary || target !== targetDictionary) fail(code);
  if (entriesHandle === undefined) fail(code);
  const sourceSet = new Set(sourceRoles), targetSet = new Set(targetRoles);
  const mapped = new Map<LinkHandle, LinkHandle>();
  for (const entry of sequence(memory, entriesHandle, code)) {
    let left: LinkHandle, right: LinkHandle;
    try { ({ start: left, end: right } = memory.poles(entry)); }
    catch (error) { if (error instanceof MemoryError) fail(code); throw error; }
    if (!sourceSet.has(left) || !targetSet.has(right) || mapped.has(left)) fail(code);
    mapped.set(left, right);
  }
  return Object.freeze(sourceRoles.map((sourceRole) => {
    const targetRole = mapped.get(sourceRole);
    if (targetRole === undefined) fail(code);
    return Object.freeze({ sourceRole, targetRole });
  }));
}

function readGrounding(
  memory: ReadMemory,
  carrier: LinkHandle,
  theory: LinkHandle,
  sourceDictionary: LinkHandle,
  sourceRoles: readonly LinkHandle[],
  generator: LinkHandle,
): readonly MappingBinding[] {
  const values = sequence(memory, carrier, "invalid-base-grounding");
  if (values.length !== 4) fail("invalid-base-grounding");
  const [carrierTheory, source, target, entriesHandle] = values;
  if (carrierTheory !== theory || source !== sourceDictionary || target !== generator || entriesHandle === undefined) {
    fail("invalid-base-grounding");
  }
  if (sourceRoles.includes(generator)) fail("invalid-base-grounding");
  const entries = sequence(memory, entriesHandle, "invalid-base-grounding");
  if (entries.length !== sourceRoles.length) fail("invalid-base-grounding");
  return Object.freeze(sourceRoles.map((sourceRole, index) => {
    const entry = entries[index];
    if (entry === undefined) fail("invalid-base-grounding");
    try {
      const poles = memory.poles(entry);
      if (poles.start !== sourceRole || poles.end !== generator) fail("invalid-base-grounding");
    } catch (error) {
      if (error instanceof StructuralClosureApplicationReplayError) throw error;
      if (error instanceof MemoryError) fail("invalid-base-grounding");
      throw error;
    }
    return Object.freeze({ sourceRole, targetRole: generator });
  }));
}

function verifyMapping(
  memory: ReadMemory,
  source: LinkHandle,
  target: LinkHandle,
  bindings: readonly MappingBinding[],
  targetRoles: readonly LinkHandle[],
  mismatch: StructuralClosureApplicationReplayErrorCode,
): void {
  try {
    matchStructuralTemplate(memory, source, target,
      bindings.map(({ sourceRole: role, targetRole: value }) => ({ role, value })));
  } catch (error) {
    if (error instanceof StructuralRuleError || error instanceof MemoryError) fail(mismatch);
    throw error;
  }
  const replacements = new Map(bindings.map(({ sourceRole, targetRole }) => [sourceRole, targetRole]));
  const targetSet = new Set(targetRoles);
  const visited = new Map<LinkHandle, Set<LinkHandle>>();
  const walk = (left: LinkHandle, right: LinkHandle): void => {
    const replacement = replacements.get(left);
    if (replacement !== undefined) {
      if (replacement !== right) fail(mismatch);
      return;
    }
    if (targetSet.has(right)) fail("grounded-target-role-capture");
    let rights = visited.get(left);
    if (rights === undefined) visited.set(left, rights = new Set());
    if (rights.has(right)) return;
    rights.add(right);
    try {
      const lp = memory.poles(left), rp = memory.poles(right);
      walk(lp.start, rp.start); walk(lp.end, rp.end);
    } catch (error) {
      if (error instanceof StructuralClosureApplicationReplayError) throw error;
      if (error instanceof MemoryError) fail(mismatch);
      throw error;
    }
  };
  walk(source, target);
}

function schemaParts(memory: ReadMemory, derivationRule: LinkHandle) {
  const schema = readStructuralDerivationRule(memory, derivationRule);
  const rule = readStructuralRule(memory, schema.structuralRule);
  const roles = readStructuralRoleDictionary(memory, rule.roleDictionary).roles;
  return { schema, rule, roles };
}

export function replayStructuralClosureApplication(
  memory: ReadMemory,
  evidence: StructuralClosureApplicationEvidence,
): StructuralClosureApplicationReplayResult {
  const before = memory.linkCount;
  try {
    const authorityValues = sequence(memory, evidence.authority, "invalid-authority");
    if (authorityValues.length !== 7) fail("invalid-authority");
    const [theory, authorityDictionary, generator, domainBase, domainCurrent, transition, domainNext] = authorityValues;
    if ([theory, authorityDictionary, generator, domainBase, domainCurrent, transition, domainNext].some((v) => v === undefined)) {
      fail("invalid-authority");
    }
    verifyAdmission(memory, evidence.authorityAdmission, theory!, evidence.authority);

    let authorityRoles: readonly LinkHandle[];
    try { authorityRoles = readStructuralRoleDictionary(memory, authorityDictionary!).roles; }
    catch { fail("invalid-authority"); }
    if (authorityRoles.length !== 2 || authorityRoles.includes(generator!)) fail("invalid-authority");
    const [x, x1] = authorityRoles;
    if (x === undefined || x1 === undefined) fail("invalid-authority");
    verifyMapping(memory, domainCurrent!, domainBase!, [{ sourceRole: x, targetRole: generator! }], [], "invalid-authority");
    verifyMapping(memory, domainCurrent!, domainNext!, [{ sourceRole: x, targetRole: x1 }], authorityRoles, "invalid-authority");

    let base: StructuralDerivedDerivationReplayResult;
    let step: StructuralDerivedDerivationReplayResult;
    try { base = replayStructuralDerivedDerivationSchema(memory, evidence.base); }
    catch { fail("invalid-base"); }
    try { step = replayStructuralDerivedDerivationSchema(memory, evidence.step); }
    catch { fail("invalid-step"); }
    if (base.theory !== theory || step.theory !== theory) fail("theory-mismatch");

    let resultDerivationRule: LinkHandle, resultTheory: LinkHandle;
    try { ({ start: resultDerivationRule, end: resultTheory } = memory.poles(evidence.resultIdentity)); }
    catch { fail("invalid-result-identity"); }
    if (resultTheory !== theory) fail("theory-mismatch");

    let baseParts: ReturnType<typeof schemaParts>, stepParts: ReturnType<typeof schemaParts>, resultParts: ReturnType<typeof schemaParts>;
    try {
      baseParts = schemaParts(memory, base.derivationRule);
      stepParts = schemaParts(memory, step.derivationRule);
      resultParts = schemaParts(memory, resultDerivationRule);
    } catch { fail("invalid-result-identity"); }
    if (memory.find(theory!, resultParts.schema.structuralRule) === undefined) fail("invalid-result-identity");
    if (memory.find(theory!, resultDerivationRule) !== undefined) fail("result-primitive-admission");

    if (baseParts.roles.length !== 0 || resultParts.roles.length !== 1 || stepParts.roles.length !== 2) fail("invalid-scope");
    const n = resultParts.roles[0], nStep = stepParts.roles[0], n1 = stepParts.roles[1];
    if (n === undefined || nStep === undefined || n1 === undefined || n !== nStep) fail("invalid-scope");
    if (baseParts.schema.premiseTemplates.length !== 0 || resultParts.schema.premiseTemplates.length !== 1 || stepParts.schema.premiseTemplates.length !== 3) {
      fail("invalid-scope");
    }

    const authorityBindings = readMorphism(
      memory, evidence.authorityMorphism, theory!, authorityDictionary!, stepParts.rule.roleDictionary,
      authorityRoles, stepParts.roles, "invalid-authority-morphism",
    );
    const currentBindings = readMorphism(
      memory, evidence.currentMorphism, theory!, resultParts.rule.roleDictionary, stepParts.rule.roleDictionary,
      resultParts.roles, stepParts.roles, "invalid-current-morphism",
    );
    const nextBindings = readMorphism(
      memory, evidence.nextMorphism, theory!, resultParts.rule.roleDictionary, stepParts.rule.roleDictionary,
      resultParts.roles, stepParts.roles, "invalid-next-morphism",
    );
    const groundBindings = readGrounding(
      memory, evidence.baseGrounding, theory!, resultParts.rule.roleDictionary, resultParts.roles, generator!,
    );

    const resultDomain = resultParts.schema.premiseTemplates[0]!;
    const stepDomain = stepParts.schema.premiseTemplates[0]!;
    const stepTransition = stepParts.schema.premiseTemplates[1]!;
    const stepCurrent = stepParts.schema.premiseTemplates[2]!;

    verifyMapping(memory, domainCurrent!, resultDomain, authorityBindings, stepParts.roles, "domain-mismatch");
    verifyMapping(memory, resultDomain, stepDomain, currentBindings, stepParts.roles, "domain-mismatch");
    verifyMapping(memory, transition!, stepTransition, authorityBindings, stepParts.roles, "step-mismatch");
    verifyMapping(memory, resultParts.rule.body, stepCurrent, currentBindings, stepParts.roles, "ih-mismatch");
    verifyMapping(memory, resultParts.rule.body, stepParts.rule.body, nextBindings, stepParts.roles, "next-conclusion-mismatch");
    verifyMapping(memory, resultDomain, domainBase!, groundBindings, [], "invalid-base-grounding");
    verifyMapping(memory, resultParts.rule.body, baseParts.rule.body, groundBindings, [], "base-mismatch");

    if (memory.linkCount !== before) fail("closure-application-wrote");
    return Object.freeze({
      theory: theory!, authority: evidence.authority, resultDerivationRule,
      resultConclusionTemplate: resultParts.rule.body, base, step,
    });
  } catch (error) {
    if (error instanceof StructuralClosureApplicationReplayError) throw error;
    if (error instanceof MemoryError || error instanceof ExactSequenceError || error instanceof StructuralRuleError) {
      throw new StructuralClosureApplicationReplayError("invalid-authority");
    }
    throw error;
  } finally {
    if (memory.linkCount !== before) {
      throw new StructuralClosureApplicationReplayError("closure-application-wrote");
    }
  }
}
