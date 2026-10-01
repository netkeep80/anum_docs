import {
  V015_FORMAL_ROLE_MATRIX,
  V015FormalRoleError,
  resolveV015DotRole,
  resolveV015ParenthesesRole,
  validateV015Rebinding,
} from "../src/v015-formal-roles.js";
import {
  replayEqualityEvaluation,
  type EqualityReplayEvidence,
  type EqualityRoles,
} from "../src/interpreter.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
} from "../src/memory.js";
import {
  StateError,
  defineContext,
  defineLocalRepresentativeBinding,
  localRepresentative,
  localRepresentativeResolution,
} from "../src/state.js";
import {
  defineActField,
  defineActHeader,
} from "../src/structural-readers.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), message + ": " + String(actual) + " !== " + String(expected));
}

function expectRoleError(action: () => unknown, code: string, message: string): void {
  try {
    action();
  } catch (error) {
    assert(error instanceof V015FormalRoleError, message + ": wrong error type");
    same(error.code, code, message + ": error code");
    return;
  }
  throw new Error(message + ": expected V015FormalRoleError");
}

function anchors(memory: Memory, count: number): LinkHandle[] {
  const result: LinkHandle[] = [];
  let current = memory.ensure(memory.root, memory.ensureStartSelfClosed(memory.root));
  for (let index = 0; index < count; index += 1) {
    current = memory.ensureStartSelfClosed(current);
    result.push(current);
  }
  return result;
}

// Operator-role matrix: glyph shape never silently chooses a second semantic role.
same(V015_FORMAL_ROLE_MATRIX.link.role, "STRUCTURAL_LINK", "arrow role");
same(V015_FORMAL_ROLE_MATRIX.identity.role, "LINK_IDENTITY_EQUALITY", "equals role");
same(V015_FORMAL_ROLE_MATRIX.identity.bindingAuthority, false, "equality is not binding");
same(V015_FORMAL_ROLE_MATRIX.identity.canMaterialize, false, "equality is read-only");
same(V015_FORMAL_ROLE_MATRIX.binding.role, "DEFINITION_BINDING", "colon role");
same(V015_FORMAL_ROLE_MATRIX.binding.cardinalityInfersRole, false, "cardinality does not infer definition");
same(V015_FORMAL_ROLE_MATRIX.dot.ambientHostCurrentAuthority, false, "ambient host current is not authority");
same(V015_FORMAL_ROLE_MATRIX.dot.hostStackAuthority, false, "host stack is not authority");
same(V015_FORMAL_ROLE_MATRIX.parentheses.defaultRole, null, "parentheses have no default semantic role");
same(V015_FORMAL_ROLE_MATRIX.ontology.variableIsOntologyKind, false, "Variable is a role, not ontology");
same(V015_FORMAL_ROLE_MATRIX.ontology.constantIsOntologyKind, false, "Constant is a role, not ontology");

// P3 must fail closed on ambiguous glyph roles.
expectRoleError(
  () => resolveV015ParenthesesRole(undefined),
  "ambiguous-parentheses-role",
  "f(A)/K(A) requires explicit selected-Grammar role",
);
same(resolveV015ParenthesesRole("GROUPING"), "GROUPING", "explicit grouping role");
same(resolveV015ParenthesesRole("CONTEXT"), "CONTEXT", "explicit Context role");
same(resolveV015ParenthesesRole("APPLICATION"), "APPLICATION", "explicit application role");
expectRoleError(
  () => resolveV015ParenthesesRole("OTHER" as never),
  "invalid-parentheses-role",
  "unknown parentheses role",
);

expectRoleError(
  () => resolveV015DotRole(undefined),
  "ambiguous-dot-role",
  "dot occurrence/qualifier requires explicit Grammar role",
);
same(resolveV015DotRole("CURRENT_OCCURRENCE"), "CURRENT_OCCURRENCE", "historical standalone dot role");
same(
  resolveV015DotRole("CONTEXTUAL_NAME_QUALIFIER"),
  "CONTEXTUAL_NAME_QUALIFIER",
  "v0.15 .name qualifier role",
);
expectRoleError(
  () => resolveV015DotRole("HOST_CURRENT" as never),
  "invalid-dot-role",
  "host current cannot substitute for dot role",
);

// Variable/Constant are transformation policies over a binding, not Link kinds.
same(
  validateV015Rebinding({
    mutability: "VARIABLE",
    scopeRelation: "SAME_SCOPE",
    hasPreviousBinding: false,
    sameSemanticValue: false,
  }),
  "INITIAL_BINDING",
  "first variable binding",
);
same(
  validateV015Rebinding({
    mutability: "CONSTANT",
    scopeRelation: "NESTED_SCOPE",
    hasPreviousBinding: true,
    sameSemanticValue: true,
  }),
  "IDENTICAL_BINDING",
  "identical constant rebinding is harmless",
);
same(
  validateV015Rebinding({
    mutability: "VARIABLE",
    scopeRelation: "NESTED_SCOPE",
    hasPreviousBinding: true,
    sameSemanticValue: false,
  }),
  "VARIABLE_SHADOW",
  "variable may shadow in explicit nested scope",
);
expectRoleError(
  () => validateV015Rebinding({
    mutability: "VARIABLE",
    scopeRelation: "SAME_SCOPE",
    hasPreviousBinding: true,
    sameSemanticValue: false,
  }),
  "same-scope-rebinding-conflict",
  "same-scope conflicting rebinding is never silently selected",
);
expectRoleError(
  () => validateV015Rebinding({
    mutability: "CONSTANT",
    scopeRelation: "NESTED_SCOPE",
    hasPreviousBinding: true,
    sameSemanticValue: false,
  }),
  "constant-rebinding",
  "constant cannot shadow to a non-identical value",
);

// The .a : X candidate is represented by explicit Link-native Context binding,
// not by a host scope map. Two names may denote one Link without becoming equal.
const memory = new Memory();
const { R, O, C, L, U } = ensureRootBasis(memory);
const K = defineContext(memory, R, L);
const nameA = memory.ensure(O, L);
const nameB = memory.ensure(C, U);
const X = memory.ensure(L, C);
assert(nameA !== nameB && nameA !== X && nameB !== X, "names and value are distinct Links");

const bindingA = defineLocalRepresentativeBinding(memory, K, nameA, X);
const bindingB = defineLocalRepresentativeBinding(memory, K, nameB, X);
same(localRepresentative(memory, K, nameA), X, ".a contextual lookup");
same(localRepresentative(memory, K, nameB), X, ".b contextual lookup");
assert(nameA !== nameB, "same value under two names does not collapse name identity");

// Structural round-trip: binding facts are recoverable from Links only.
const bindingAPoles = memory.poles(bindingA);
same(bindingAPoles.start, K, "binding attachment names explicit Context");
const pairA = memory.poles(bindingAPoles.end);
same(pairA.start, nameA, "binding pair keeps name");
same(pairA.end, X, "binding pair keeps value");
const bindingBPoles = memory.poles(bindingB);
same(bindingBPoles.start, K, "second binding uses the same explicit Context");

// Plain contextual lookup is read-only and requires the explicit K.
const beforeLookup = memory.linkCount;
const boundResolution = localRepresentativeResolution(memory, K, nameA);
same(boundResolution.representative, X, "bound occurrence resolves to X");
same(boundResolution.bindings.length, 1, "bound occurrence has structural evidence");
same(memory.linkCount, beforeLookup, "contextual lookup performs no hidden write");

const freeName = memory.ensure(U, L);
const beforeFreeRead = memory.linkCount;
const freeResolution = localRepresentativeResolution(memory, K, freeName);
same(freeResolution.representative, freeName, "free occurrence remains itself");
same(freeResolution.bindings.length, 0, "free occurrence has no hidden binding");
same(memory.linkCount, beforeFreeRead, "free lookup is read-only");

// Nested explicit Context is the scope boundary for variable shadowing.
const innerK = defineContext(memory, K, C);
const Y = memory.ensure(U, O);
defineLocalRepresentativeBinding(memory, innerK, nameA, Y);
same(localRepresentative(memory, K, nameA), X, "outer binding remains X");
same(localRepresentative(memory, innerK, nameA), Y, "inner variable shadow resolves Y");
same(localRepresentative(memory, innerK, nameB), nameB, "unbound inner name does not use host/ambient parent lookup");

// Even if contradictory same-scope facts are physically present, reading fails
// closed rather than choosing first/last.
const conflictK = defineContext(memory, R, U);
const conflictName = memory.ensure(O, U);
const conflictX = memory.ensure(L, O);
const conflictY = memory.ensure(C, L);
defineLocalRepresentativeBinding(memory, conflictK, conflictName, conflictX);
defineLocalRepresentativeBinding(memory, conflictK, conflictName, conflictY);
const beforeConflictRead = memory.linkCount;
let conflictRejected = false;
try {
  localRepresentative(memory, conflictK, conflictName);
} catch (error) {
  conflictRejected = true;
  assert(error instanceof StateError, "same-scope conflict must be StateError");
  same(error.code, "representative-conflict", "same-scope conflict error");
}
assert(conflictRejected, "same-scope conflicting binding must reject");
same(memory.linkCount, beforeConflictRead, "conflict detection is read-only");

// Existing equality replay is retained only as evidence for the read-only
// equality boundary; P3 does not reinterpret it as binding.
const roleRefs = anchors(memory, 5);
const equalityRoles: EqualityRoles = Object.freeze({
  context: roleRefs[0]!,
  left: roleRefs[1]!,
  right: roleRefs[2]!,
  leftRepresentative: roleRefs[3]!,
  rightRepresentative: roleRefs[4]!,
});
const equalityRefs = anchors(memory, 2);
const interpreter = equalityRefs[0]!;
const roleDictionary = equalityRefs[1]!;
const equalityAct = defineActHeader(memory, interpreter, roleDictionary, K);
for (const [role, value] of [
  [equalityRoles.context, K],
  [equalityRoles.left, X],
  [equalityRoles.right, X],
  [equalityRoles.leftRepresentative, X],
  [equalityRoles.rightRepresentative, X],
] as const) {
  defineActField(memory, equalityAct, role, value);
}
const equalityEvidence: EqualityReplayEvidence = Object.freeze({
  act: equalityAct,
  roles: equalityRoles,
  interpreter,
  roleDictionary,
});
const beforeEquality = memory.linkCount;
same(replayEqualityEvaluation(memory, equalityEvidence), true, "existing equality evidence evaluates true");
same(memory.linkCount, beforeEquality, "equality replay never materializes binding or Link identity");

console.log("V15_P3_OPERATOR_ROLE_MATRIX = GREEN_RESEARCH");
console.log("IDENTITY_VS_BINDING = SEPARATED");
console.log("DOT_CONTEXT = EXPLICIT_NO_HOST_STACK");
console.log("PARENTHESES_ROLE = SELECTED_GRAMMAR_REQUIRED");
console.log("VARIABLE_CONSTANT = BINDING_TRANSFORMATION_POLICY");
console.log("CONTEXTUAL_BINDING = LINK_NATIVE");
console.log("accepted MTS v0.14 semantic delta = NONE");
