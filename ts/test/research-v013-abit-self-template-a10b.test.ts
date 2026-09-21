import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type LinkPoles,
  type ReadMemory,
} from "../src/memory.js";
import {
  StructuralRuleError,
} from "../src/structural-rule.js";
import { unifyStructuralTemplate } from "../src/structural-unification.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.13 A10b abit self-template: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}

class PoleOnlyProbe implements ReadMemory {
  constructor(private readonly source: ReadMemory) {}
  get root(): LinkHandle { return this.source.root; }
  get linkCount(): number { return this.source.linkCount; }
  poles(link: LinkHandle): LinkPoles { return this.source.poles(link); }
  find(): LinkHandle | undefined {
    throw new Error("A10b self-interpretation must not call find");
  }
  outgoing(): readonly LinkHandle[] {
    throw new Error("A10b self-interpretation must not scan outgoing");
  }
  incoming(): readonly LinkHandle[] {
    throw new Error("A10b self-interpretation must not scan incoming");
  }
}

type ValidationErrorCode =
  | "missing-operator"
  | "trailing-source"
  | "self-incidence-mismatch"
  | "missing-role-binding";

class ValidationError extends Error {
  override readonly name = "ValidationError";

  constructor(readonly code: ValidationErrorCode) {
    super(code);
  }
}

function fail(code: ValidationErrorCode): never {
  throw new ValidationError(code);
}

const memory = new Memory();
const basis = ensureRootBasis(memory);
const probe = new PoleOnlyProbe(memory);
const { R, O, C, L, U } = basis;

// Fixture-only physical spelling. Production semantic grounding of these signs
// remains source -> Dictionary -> Grammar -> fixed Theory -> Rule authority.
// The self-interpreter below consumes only the already-grounded Link signs.
const wireSign = new Map<string, LinkHandle>([
  ["8", R],
  ["9", O],
  ["6", C],
  ["1", L],
]);

function signs(wire: string): readonly LinkHandle[] {
  return Object.freeze(
    [...wire].map((digit) => {
      const sign = wireSign.get(digit);
      if (sign === undefined) throw new Error(`unknown fixture digit ${digit}`);
      return sign;
    }),
  );
}

function selfIncidence(link: LinkHandle): readonly [boolean, boolean] {
  const poles = probe.poles(link);
  return Object.freeze([
    poles.start === link,
    poles.end === link,
  ]);
}

/**
 * The operator Link itself supplies its ordered external role list:
 *
 *   R = R->R   => []
 *   O = O->R   => [R]
 *   C = R->C   => [R]
 *   L = O->C   => [O,C]
 *
 * There is no ROOT/START/END/PAIR enum here.
 */
function externalRoles(operator: LinkHandle): readonly LinkHandle[] {
  const poles = probe.poles(operator);
  const roles: LinkHandle[] = [];
  if (poles.start !== operator) roles.push(poles.start);
  if (poles.end !== operator && poles.end !== poles.start) roles.push(poles.end);
  return Object.freeze(roles);
}

function sameMask(
  left: readonly [boolean, boolean],
  right: readonly [boolean, boolean],
): boolean {
  return left[0] === right[0] && left[1] === right[1];
}

interface ValidationResult {
  readonly next: number;
}

/**
 * Read-only self-interpretation of one prefix expression.
 *
 * Semantic machine fragment:
 *   - operator description = the grounded abit Link itself;
 *   - arity = number of non-self poles of that Link;
 *   - argument positions = those non-self poles, in pole order;
 *   - target validation = generic structural unification of operator template
 *     against target plus recursive validation of inferred child Links.
 *
 * Residual host bootstrap is intentionally explicit:
 *   Link identity, poles(), prefix traversal, generic unification.
 */
function validateFrom(
  source: readonly LinkHandle[],
  offset: number,
  target: LinkHandle,
): ValidationResult {
  const operator = source[offset];
  if (operator === undefined) fail("missing-operator");

  if (!sameMask(selfIncidence(operator), selfIncidence(target))) {
    fail("self-incidence-mismatch");
  }

  const roles = externalRoles(operator);
  let bindings: readonly { readonly role: LinkHandle; readonly value: LinkHandle }[];
  try {
    bindings = unifyStructuralTemplate(probe, operator, target, roles);
  } catch (error) {
    if (error instanceof StructuralRuleError) {
      fail("self-incidence-mismatch");
    }
    throw error;
  }

  const byRole = new Map(bindings.map((binding) => [binding.role, binding.value]));
  let next = offset + 1;

  for (const role of roles) {
    const child = byRole.get(role);
    if (child === undefined) fail("missing-role-binding");
    const validated = validateFrom(source, next, child);
    next = validated.next;
  }

  return Object.freeze({ next });
}

function validateProgram(
  wire: string,
  target: LinkHandle,
): void {
  const source = signs(wire);
  const before = memory.linkCount;
  const result = validateFrom(source, 0, target);
  same(memory.linkCount, before, `${wire}: validation is read-only`);
  if (result.next !== source.length) fail("trailing-source");
}

function expectValidationError(
  code: ValidationErrorCode,
  message: string,
  effect: () => unknown,
): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof ValidationError, `${message}: wrong error type`);
    same(error.code, code, `${message}: exact error`);
    return;
  }
  throw new Error(`v0.13 A10b abit self-template: ${message}: expected ${code}`);
}

// ---------------------------------------------------------------------------
// A10b.1 — arity is derived from the sign's own topology.
// ---------------------------------------------------------------------------
same(externalRoles(R).length, 0, "R derives arity 0");
same(externalRoles(O).length, 1, "O derives arity 1");
same(externalRoles(C).length, 1, "C derives arity 1");
same(externalRoles(L).length, 2, "L derives arity 2");

same(externalRoles(O)[0], R, "O external role is R");
same(externalRoles(C)[0], R, "C external role is R");
same(externalRoles(L)[0], O, "L first external role is O");
same(externalRoles(L)[1], C, "L second external role is C");

// ---------------------------------------------------------------------------
// A10b.2 — the four signs validate themselves as ostensive operation templates.
// ---------------------------------------------------------------------------
validateProgram("8", R);
validateProgram("98", O);
validateProgram("68", C);
validateProgram("19868", L);
validateProgram("16898", U);

// A non-basis finite target: Pair(Start(End(R)), End(Start(R))).
const left = memory.ensureStartSelfClosed(memory.ensureEndSelfClosed(R));
const right = memory.ensureEndSelfClosed(memory.ensureStartSelfClosed(R));
const generic = memory.ensure(left, right);
validateProgram("1968698", generic);

// ---------------------------------------------------------------------------
// A10b.3 — direct generic unification shows the sign itself is its template.
// ---------------------------------------------------------------------------
{
  const arbitrary = memory.ensure(U, L);
  const startTarget = memory.ensureStartSelfClosed(arbitrary);
  const endTarget = memory.ensureEndSelfClosed(arbitrary);
  const pairTarget = memory.ensure(startTarget, endTarget);

  const startBindings = unifyStructuralTemplate(
    probe,
    O,
    startTarget,
    externalRoles(O),
  );
  same(startBindings.length, 1, "O template infers one child");
  same(startBindings[0]?.role, R, "O template role is its non-self pole R");
  same(startBindings[0]?.value, arbitrary, "O template infers exact child");

  const endBindings = unifyStructuralTemplate(
    probe,
    C,
    endTarget,
    externalRoles(C),
  );
  same(endBindings.length, 1, "C template infers one child");
  same(endBindings[0]?.role, R, "C template role is its non-self pole R");
  same(endBindings[0]?.value, arbitrary, "C template infers exact child");

  const pairBindings = unifyStructuralTemplate(
    probe,
    L,
    pairTarget,
    externalRoles(L),
  );
  same(pairBindings.length, 2, "L template infers two children");
  same(pairBindings[0]?.role, O, "L first role is O pole");
  same(pairBindings[0]?.value, startTarget, "L first role infers exact left child");
  same(pairBindings[1]?.role, C, "L second role is C pole");
  same(pairBindings[1]?.value, endTarget, "L second role infers exact right child");

  const rootBindings = unifyStructuralTemplate(probe, R, R, externalRoles(R));
  same(rootBindings.length, 0, "R template needs no child role");
}

// ---------------------------------------------------------------------------
// A10b.4 — malformed/trailing inputs fail without writes.
// ---------------------------------------------------------------------------
for (const wire of ["9", "6", "1"]) {
  const before = memory.linkCount;
  expectValidationError(
    "missing-operator",
    `${wire}: missing child rejected`,
    () => validateProgram(wire, wire === "1" ? L : wire === "9" ? O : C),
  );
  same(memory.linkCount, before, `${wire}: missing child writes nothing`);
}

{
  const before = memory.linkCount;
  expectValidationError(
    "trailing-source",
    "88: trailing source rejected",
    () => validateProgram("88", R),
  );
  same(memory.linkCount, before, "trailing source writes nothing");
}

// ---------------------------------------------------------------------------
// A10b.5 — canonical PAIR aliases are rejected generically by topology mask.
// No term string is special-cased in the validator.
// ---------------------------------------------------------------------------
for (const [wire, target] of [
  ["188", R],   // Pair(R,R) collapses to R
  ["1988", O],  // Pair(O,R) collapses to O
  ["1868", C],  // Pair(R,C) collapses to C
] as const) {
  const before = memory.linkCount;
  expectValidationError(
    "self-incidence-mismatch",
    `${wire}: collapsed PAIR alias rejected by sign/target topology`,
    () => validateProgram(wire, target),
  );
  same(memory.linkCount, before, `${wire}: alias rejection writes nothing`);
}

// ---------------------------------------------------------------------------
// A10b.6 — U is not a fifth structural operator sign.
// Structurally it can be unified as a PAIR-shaped template, which is exactly
// why semantic sign admissibility must remain external Rule/Theory authority.
// The self-interpreter never obtains operator authority from local shape alone.
// ---------------------------------------------------------------------------
same(externalRoles(U).length, 2, "U locally has two external poles like an ordinary PAIR");
assert(
  !wireSign.has("0"),
  "A10b fixture does not admit U as a structural operator sign",
);

// ---------------------------------------------------------------------------
// A10b.7 — lifecycle stays untouched.
// ---------------------------------------------------------------------------
console.log([
  "MTS v0.13 A10b:",
  "ABIT_IS_OWN_OSTENSIVE_OPERATION_TEMPLATE",
  "FORMAL_READ_ONLY_SELF_INTERPRETATION_SUPPORTED",
  "HOST_ASPECT_ENUM_DISPATCH_NOT_SEMANTICALLY_REQUIRED_FOR_VALIDATION",
  "RESIDUAL_HOST_BOOTSTRAP=identity+poles+prefix-traversal+generic-unification",
  "WRITE_FIXED_POINT_INSTANTIATION=NOT_CLAIMED",
].join(" "));
