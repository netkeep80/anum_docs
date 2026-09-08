import { ExactSequenceError, readExactSequence } from "./exact-sequence.js";
import { MemoryError, type LinkHandle, type ReadMemory } from "./memory.js";
import { StructuralRuleError, matchStructuralTemplate } from "./structural-rule.js";

export interface StructuralRoleMorphismBinding {
  readonly sourceRole: LinkHandle;
  readonly targetRole: LinkHandle;
}

export interface StructuralRoleMorphismReplayResult {
  readonly theory: LinkHandle;
  readonly sourceDictionary: LinkHandle;
  readonly targetDictionary: LinkHandle;
  readonly bindings: readonly StructuralRoleMorphismBinding[];
}

export type StructuralRoleMorphismErrorCode =
  | "invalid-morphism"
  | "theory-mismatch"
  | "source-dictionary-mismatch"
  | "target-dictionary-mismatch"
  | "undeclared-source-role"
  | "duplicate-source-role"
  | "missing-source-role"
  | "target-role-not-member"
  | "mapping-mismatch"
  | "grounded-target-role-capture"
  | "replay-wrote";

export class StructuralRoleMorphismError extends Error {
  override readonly name = "StructuralRoleMorphismError";

  constructor(readonly code: StructuralRoleMorphismErrorCode) {
    super(code);
  }
}

function fail(code: StructuralRoleMorphismErrorCode): never {
  throw new StructuralRoleMorphismError(code);
}

function sequence(memory: ReadMemory, link: LinkHandle): readonly LinkHandle[] {
  try {
    return readExactSequence(memory, link).values;
  } catch (error) {
    if (error instanceof ExactSequenceError || error instanceof MemoryError) {
      fail("invalid-morphism");
    }
    throw error;
  }
}

export function replayStructuralRoleMorphism(
  memory: ReadMemory,
  morphism: LinkHandle,
  expected: Readonly<{
    theory: LinkHandle;
    sourceDictionary: LinkHandle;
    targetDictionary: LinkHandle;
    sourceRoles: readonly LinkHandle[];
    targetRoles: readonly LinkHandle[];
  }>,
): StructuralRoleMorphismReplayResult {
  const before = memory.linkCount;
  try {
    const values = sequence(memory, morphism);
    if (values.length !== 4) fail("invalid-morphism");
    const [carrierTheory, carrierSource, carrierTarget, entriesHandle] = values;
    if (carrierTheory !== expected.theory) fail("theory-mismatch");
    if (carrierSource !== expected.sourceDictionary) fail("source-dictionary-mismatch");
    if (carrierTarget !== expected.targetDictionary) fail("target-dictionary-mismatch");
    if (entriesHandle === undefined) fail("invalid-morphism");

    const sourceSet = new Set(expected.sourceRoles);
    const targetSet = new Set(expected.targetRoles);
    const mapped = new Map<LinkHandle, LinkHandle>();
    for (const entry of sequence(memory, entriesHandle)) {
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

    const bindings = Object.freeze(expected.sourceRoles.map((sourceRole) => {
      const targetRole = mapped.get(sourceRole);
      if (targetRole === undefined) fail("missing-source-role");
      return Object.freeze({ sourceRole, targetRole });
    }));

    return Object.freeze({
      theory: expected.theory,
      sourceDictionary: expected.sourceDictionary,
      targetDictionary: expected.targetDictionary,
      bindings,
    });
  } finally {
    if (memory.linkCount !== before) fail("replay-wrote");
  }
}

export function verifyStructuralRoleMorphismMapping(
  memory: ReadMemory,
  sourceTemplate: LinkHandle,
  targetTemplate: LinkHandle,
  bindings: readonly StructuralRoleMorphismBinding[],
  targetRoles: readonly LinkHandle[],
): void {
  const before = memory.linkCount;
  try {
    try {
      matchStructuralTemplate(
        memory,
        sourceTemplate,
        targetTemplate,
        bindings.map(({ sourceRole: role, targetRole: value }) => ({ role, value })),
      );
    } catch (error) {
      if (error instanceof StructuralRuleError || error instanceof MemoryError) {
        fail("mapping-mismatch");
      }
      throw error;
    }

    const mu = new Map(bindings.map(({ sourceRole, targetRole }) => [sourceRole, targetRole]));
    const targetSet = new Set(targetRoles);
    const visited = new Map<LinkHandle, Set<LinkHandle>>();

    const walk = (left: LinkHandle, right: LinkHandle): void => {
      const replacement = mu.get(left);
      if (replacement !== undefined) {
        if (replacement !== right || !targetSet.has(right)) fail("mapping-mismatch");
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
        const leftPoles = memory.poles(left);
        const rightPoles = memory.poles(right);
        walk(leftPoles.start, rightPoles.start);
        walk(leftPoles.end, rightPoles.end);
      } catch (error) {
        if (error instanceof StructuralRoleMorphismError) throw error;
        if (error instanceof MemoryError) fail("mapping-mismatch");
        throw error;
      }
    };

    walk(sourceTemplate, targetTemplate);
  } finally {
    if (memory.linkCount !== before) fail("replay-wrote");
  }
}
