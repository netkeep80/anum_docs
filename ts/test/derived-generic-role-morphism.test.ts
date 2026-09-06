import {
  materializeExactSequence,
  readExactSequence,
} from "../src/exact-sequence.js";
import { Memory, type LinkHandle } from "../src/memory.js";
import { ensureRootBasis } from "../src/public.js";
import {
  StructuralRuleError,
  defineStructuralRoleDictionary,
  readStructuralRoleDictionary,
  type StructuralRoleBinding,
} from "../src/structural-rule.js";
import { unifyStructuralTemplate } from "../src/structural-unification.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

type MorphismErrorCode =
  | "invalid-carrier"
  | "wrong-theory"
  | "undeclared-source-role"
  | "duplicate-source-role"
  | "target-role-not-member"
  | "missing-source-role";

class ResearchMorphismError extends Error {
  override readonly name = "ResearchMorphismError";

  constructor(readonly code: MorphismErrorCode) {
    super(code);
  }
}

interface ResearchMorphism {
  readonly theory: LinkHandle;
  readonly sourceDictionary: LinkHandle;
  readonly targetDictionary: LinkHandle;
  readonly bindings: readonly StructuralRoleBinding[];
}

function fail(code: MorphismErrorCode): never {
  throw new ResearchMorphismError(code);
}

function expectMorphismError(code: MorphismErrorCode, effect: () => unknown): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof ResearchMorphismError, `${code}: wrong error type`);
    same(error.code, code, `${code}: wrong error code`);
    return;
  }
  throw new Error(`${code}: expected ResearchMorphismError`);
}

function expectRuleError(code: string, effect: () => unknown): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof StructuralRuleError, `${code}: wrong error type`);
    same(error.code, code, `${code}: wrong error code`);
    return;
  }
  throw new Error(`${code}: expected StructuralRuleError`);
}

function bindingValue(
  bindings: readonly StructuralRoleBinding[],
  role: LinkHandle,
): LinkHandle {
  const binding = bindings.find((candidate) => candidate.role === role);
  assert(binding !== undefined, "expected role binding");
  return binding.value;
}

function defineResearchMorphism(
  memory: Memory,
  theory: LinkHandle,
  sourceDictionary: LinkHandle,
  targetDictionary: LinkHandle,
  pairs: readonly (readonly [LinkHandle, LinkHandle])[],
): LinkHandle {
  const entries = pairs.map(([source, target]) => memory.ensure(source, target));
  return materializeExactSequence(memory, [
    theory,
    sourceDictionary,
    targetDictionary,
    materializeExactSequence(memory, entries),
  ]);
}

/**
 * Test-local observer for the candidate N2a carrier. It has no trusted proof
 * authority; it only falsifies whether existing MTS data can carry the laws.
 */
function readResearchMorphism(
  memory: Memory,
  morphism: LinkHandle,
  expectedTheory: LinkHandle,
): ResearchMorphism {
  const before = memory.linkCount;
  try {
    let values: readonly LinkHandle[];
    try {
      values = readExactSequence(memory, morphism).values;
    } catch {
      fail("invalid-carrier");
    }
    if (values.length !== 4) fail("invalid-carrier");

    const theory = values[0];
    const sourceDictionary = values[1];
    const targetDictionary = values[2];
    const entryCarrier = values[3];
    if (
      theory === undefined ||
      sourceDictionary === undefined ||
      targetDictionary === undefined ||
      entryCarrier === undefined
    ) {
      fail("invalid-carrier");
    }
    if (theory !== expectedTheory) fail("wrong-theory");

    let sourceRoles: readonly LinkHandle[];
    let targetRoles: readonly LinkHandle[];
    let entries: readonly LinkHandle[];
    try {
      sourceRoles = readStructuralRoleDictionary(memory, sourceDictionary).roles;
      targetRoles = readStructuralRoleDictionary(memory, targetDictionary).roles;
      entries = readExactSequence(memory, entryCarrier).values;
    } catch {
      fail("invalid-carrier");
    }

    const sourceSet = new Set(sourceRoles);
    const targetSet = new Set(targetRoles);
    const seen = new Set<LinkHandle>();
    const bindings: StructuralRoleBinding[] = [];

    for (const entry of entries) {
      const pair = memory.poles(entry);
      if (!sourceSet.has(pair.start)) fail("undeclared-source-role");
      if (seen.has(pair.start)) fail("duplicate-source-role");
      if (!targetSet.has(pair.end)) fail("target-role-not-member");
      seen.add(pair.start);
      bindings.push(Object.freeze({ role: pair.start, value: pair.end }));
    }

    for (const role of sourceRoles) {
      if (!seen.has(role)) fail("missing-source-role");
    }

    return Object.freeze({
      theory,
      sourceDictionary,
      targetDictionary,
      bindings: Object.freeze(bindings),
    });
  } finally {
    if (memory.linkCount !== before) {
      throw new Error("research morphism observer must be read-only");
    }
  }
}

function main(): void {
  const memory = new Memory();
  const { R, O, C, L, U } = ensureRootBasis(memory);

  const xRole = memory.ensure(L, R);
  const yRole = memory.ensure(U, R);
  const aRole = memory.ensure(R, L);
  const bRole = memory.ensure(R, U);
  const undeclaredRole = memory.ensure(O, O);
  const theory = memory.ensure(C, U);
  const foreignTheory = memory.ensure(C, R);
  const grounded = O;

  same(new Set([xRole, yRole, aRole, bRole, undeclaredRole]).size, 5, "role identities");

  const sourceX = defineStructuralRoleDictionary(memory, [xRole]);
  const sourceXY = defineStructuralRoleDictionary(memory, [xRole, yRole]);
  const targetAB = defineStructuralRoleDictionary(memory, [aRole, bRole]);
  const targetA = defineStructuralRoleDictionary(memory, [aRole]);

  // Canonical N2a witness: the complete mapping is ordinary MTS data.
  const morphismXA = defineResearchMorphism(memory, theory, sourceX, targetAB, [[xRole, aRole]]);
  const beforeRead = memory.linkCount;
  const parsed = readResearchMorphism(memory, morphismXA, theory);
  same(memory.linkCount, beforeRead, "morphism read must not write");
  same(parsed.theory, theory, "exact Theory identity");
  same(parsed.sourceDictionary, sourceX, "exact source dictionary identity");
  same(parsed.targetDictionary, targetAB, "exact target dictionary identity");
  same(parsed.bindings.length, 1, "one source role produces one mapping entry");
  same(bindingValue(parsed.bindings, xRole), aRole, "mu(X)=A");
  assert(!parsed.bindings.some((binding) => binding.value === bRole), "target-local B remains unmapped");

  // Existing read-only unification infers the same morphism through repeated,
  // nested source-role occurrences while keeping grounded structure exact.
  const nestedSource = memory.ensure(xRole, memory.ensure(grounded, xRole));
  const nestedTarget = memory.ensure(aRole, memory.ensure(grounded, aRole));
  const beforeUnify = memory.linkCount;
  const inferred = unifyStructuralTemplate(memory, nestedSource, nestedTarget, [xRole]);
  same(bindingValue(inferred, xRole), aRole, "nested inference agrees with mu(X)=A");
  same(memory.linkCount, beforeUnify, "nested morphism inference is read-only");

  // Capture safety: A is a target role, but is grounded in the source scope
  // because Dsrc declares only X. Mapping X->B must not reinterpret grounded A.
  const captureSource = memory.ensure(xRole, aRole);
  const captureTarget = memory.ensure(bRole, aRole);
  const captureBindings = unifyStructuralTemplate(memory, captureSource, captureTarget, [xRole]);
  same(bindingValue(captureBindings, xRole), bRole, "capture-safe mu(X)=B");
  expectRuleError("template-mismatch", () =>
    unifyStructuralTemplate(memory, captureSource, memory.ensure(bRole, grounded), [xRole]),
  );

  // Totality and exact dictionary membership are structural obligations.
  const partial = defineResearchMorphism(memory, theory, sourceXY, targetAB, [[xRole, aRole]]);
  expectMorphismError("missing-source-role", () => readResearchMorphism(memory, partial, theory));

  const undeclared = defineResearchMorphism(memory, theory, sourceX, targetAB, [[undeclaredRole, aRole]]);
  expectMorphismError("undeclared-source-role", () => readResearchMorphism(memory, undeclared, theory));

  const nonRoleImage = defineResearchMorphism(memory, theory, sourceX, targetAB, [[xRole, grounded]]);
  expectMorphismError("target-role-not-member", () => readResearchMorphism(memory, nonRoleImage, theory));

  const duplicate = defineResearchMorphism(memory, theory, sourceX, targetAB, [
    [xRole, aRole],
    [xRole, bRole],
  ]);
  expectMorphismError("duplicate-source-role", () => readResearchMorphism(memory, duplicate, theory));
  expectMorphismError("wrong-theory", () => readResearchMorphism(memory, morphismXA, foreignTheory));

  const malformedCarrier = materializeExactSequence(memory, [theory, sourceX, targetAB, grounded]);
  expectMorphismError("invalid-carrier", () => readResearchMorphism(memory, malformedCarrier, theory));

  // Host labels cannot supply absent structural mapping evidence.
  const labels = new Map<LinkHandle, string>([[xRole, "X"], [aRole, "A"]]);
  same(labels.get(xRole), "X", "host label fixture");
  const hostOnly = defineResearchMorphism(memory, theory, sourceX, targetAB, []);
  expectMorphismError("missing-source-role", () => readResearchMorphism(memory, hostOnly, theory));

  // Distinct source roles may map to the same target role; inequality is not
  // inferred merely from distinct Role identity.
  const nonInjective = defineResearchMorphism(memory, theory, sourceXY, targetA, [
    [xRole, aRole],
    [yRole, aRole],
  ]);
  const parsedNonInjective = readResearchMorphism(memory, nonInjective, theory);
  same(bindingValue(parsedNonInjective.bindings, xRole), aRole, "mu(X)=A");
  same(bindingValue(parsedNonInjective.bindings, yRole), aRole, "mu(Y)=A");

  // N2a classification only: representation/projection is derived from existing
  // structures. Cross-scope proof authority remains explicitly deferred to N2b.
  const GENERIC_ROLE_MORPHISM_DERIVED_FROM_EXISTING_STRUCTURES = true;
  const TRUSTED_CROSS_SCOPE_REUSE_PROVED_BY_N2A = false;
  const PRODUCTION_DELTA_REQUIRED = false;
  assert(GENERIC_ROLE_MORPHISM_DERIVED_FROM_EXISTING_STRUCTURES, "N2a classification");
  assert(!TRUSTED_CROSS_SCOPE_REUSE_PROVED_BY_N2A, "N2b authority remains separate");
  assert(!PRODUCTION_DELTA_REQUIRED, "N2a has no production delta");
}

main();
