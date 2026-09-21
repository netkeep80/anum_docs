import { materializeExactSequence } from "../src/exact-sequence.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type LinkPoles,
  type ReadMemory,
} from "../src/memory.js";
import { defineContext } from "../src/state.js";
import {
  admitStructuralRule,
  defineStructuralInterpreter,
  defineStructuralRoleDictionary,
  defineStructuralRule,
} from "../src/structural-rule.js";
import { unifyStructuralTemplate } from "../src/structural-unification.js";
import {
  admitStructuralDerivationRule,
  defineStructuralDerivationRule,
} from "../src/derivation.js";
import {
  replayStructuralDerivedDerivationSchema,
  type StructuralDerivedDerivationEvidence,
} from "../src/derived-derivation-schema.js";
import {
  StructuralDerivedDerivationInstantiationError,
  instantiateStructuralDerivedDerivationSchema,
} from "../src/derived-derivation-instantiation.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`v0.13 A10b abit self-interpreter: ${message}`);
  }
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}

type A10bErrorCode =
  | "malformed-prefix"
  | "trailing-source"
  | "shape-mismatch"
  | "binding-mismatch";

class A10bError extends Error {
  override readonly name = "A10bError";
  constructor(readonly code: A10bErrorCode) {
    super(code);
  }
}

function fail(code: A10bErrorCode): never {
  throw new A10bError(code);
}

function expectError(code: A10bErrorCode, effect: () => unknown): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof A10bError, `${code}: expected A10bError`);
    same(error.code, code, `${code}: exact error`);
    return;
  }
  throw new Error(`v0.13 A10b abit self-interpreter: expected ${code}`);
}

function expectInstantiationError(
  code: StructuralDerivedDerivationInstantiationError["code"],
  effect: () => unknown,
): void {
  try {
    effect();
  } catch (error) {
    assert(
      error instanceof StructuralDerivedDerivationInstantiationError,
      `${code}: expected StructuralDerivedDerivationInstantiationError`,
    );
    same(error.code, code, `${code}: exact instantiation error`);
    return;
  }
  throw new Error(
    `v0.13 A10b abit self-interpreter: expected instantiation ${code}`,
  );
}

class PoleOnlyProbe implements ReadMemory {
  constructor(private readonly source: ReadMemory) {}

  get root(): LinkHandle {
    return this.source.root;
  }

  get linkCount(): number {
    return this.source.linkCount;
  }

  poles(link: LinkHandle): LinkPoles {
    return this.source.poles(link);
  }

  find(): LinkHandle | undefined {
    throw new Error("A10b read-only self-interpreter must not call find");
  }

  incoming(): readonly LinkHandle[] {
    throw new Error("A10b read-only self-interpreter must not scan incoming");
  }

  outgoing(): readonly LinkHandle[] {
    throw new Error("A10b read-only self-interpreter must not scan outgoing");
  }
}

interface Descriptor {
  readonly operator: LinkHandle;
  readonly startSelf: boolean;
  readonly endSelf: boolean;
  /**
   * Ordered non-self poles of the operator itself.
   *
   * These ordinary Links become structural Roles when the operator is used as
   * an ostensive template:
   *
   *   R -> []
   *   O -> [R]     // external END position
   *   C -> [R]     // external START position
   *   L -> [O,C]   // external START,END positions
   */
  readonly roles: readonly LinkHandle[];
}

interface Plan {
  readonly operator: LinkHandle;
  readonly children: readonly Plan[];
}

const memory = new Memory();
const basis = ensureRootBasis(memory);
const { R, O, C, L, U } = basis;
const probe = new PoleOnlyProbe(memory);

function descriptor(operator: LinkHandle): Descriptor {
  const poles = memory.poles(operator);
  const startSelf = poles.start === operator;
  const endSelf = poles.end === operator;
  const roles: LinkHandle[] = [];

  if (!startSelf) roles.push(poles.start);
  if (!endSelf) roles.push(poles.end);

  // The exact v0.13 root representatives have distinct non-self roles when
  // binary. Do not silently collapse two structural positions into one role.
  assert(
    new Set(roles).size === roles.length,
    "operator descriptor must expose distinct non-self role identities",
  );

  return Object.freeze({
    operator,
    startSelf,
    endSelf,
    roles: Object.freeze(roles),
  });
}

function sameShape(left: LinkHandle, right: LinkHandle): boolean {
  const a = memory.poles(left);
  const b = memory.poles(right);
  return (
    (a.start === left) === (b.start === right) &&
    (a.end === left) === (b.end === right)
  );
}

function parse(
  operators: readonly LinkHandle[],
  offset: number,
): readonly [Plan, number] {
  const operator = operators[offset];
  if (operator === undefined) fail("malformed-prefix");

  const shape = descriptor(operator);
  const children: Plan[] = [];
  let next = offset + 1;

  for (let index = 0; index < shape.roles.length; index += 1) {
    const [child, afterChild] = parse(operators, next);
    children.push(child);
    next = afterChild;
  }

  return Object.freeze([
    Object.freeze({
      operator,
      children: Object.freeze(children),
    }),
    next,
  ]);
}

function validatePlan(plan: Plan, target: LinkHandle): void {
  const shape = descriptor(plan.operator);

  // This one generic check subsumes the old object-specific PAIR alias
  // preflight: a 00 descriptor may not validate a result that collapsed to
  // 11/10/01.
  if (!sameShape(plan.operator, target)) fail("shape-mismatch");

  const before = memory.linkCount;
  const bindings = unifyStructuralTemplate(
    probe,
    plan.operator,
    target,
    shape.roles,
  );
  same(memory.linkCount, before, "operator-as-template unification is read-only");

  same(bindings.length, shape.roles.length, "one binding per structural argument role");
  same(plan.children.length, shape.roles.length, "plan arity comes from operator topology");

  const byRole = new Map(bindings.map((binding) => [binding.role, binding.value]));
  for (let index = 0; index < shape.roles.length; index += 1) {
    const role = shape.roles[index];
    const child = plan.children[index];
    if (role === undefined || child === undefined) fail("binding-mismatch");
    const value = byRole.get(role);
    if (value === undefined) fail("binding-mismatch");
    validatePlan(child, value);
  }
}

function validateProgram(
  operators: readonly LinkHandle[],
  target: LinkHandle,
): void {
  const before = memory.linkCount;
  try {
    const [plan, next] = parse(operators, 0);
    if (next !== operators.length) fail("trailing-source");
    validatePlan(plan, target);
  } finally {
    same(memory.linkCount, before, "A10b interpretation is globally read-only");
  }
}

// ---------------------------------------------------------------------------
// A10b.1 — arity is a derived property of the operator Link topology.
// No ROOT/START/END/PAIR enum or arity table is involved.
// ---------------------------------------------------------------------------
same(descriptor(R).roles.length, 0, "R topology derives arity 0");
same(descriptor(O).roles.length, 1, "O topology derives arity 1");
same(descriptor(C).roles.length, 1, "C topology derives arity 1");
same(descriptor(L).roles.length, 2, "L topology derives arity 2");

same(descriptor(O).roles[0], R, "O uses its non-self end pole R as the child Role");
same(descriptor(C).roles[0], R, "C uses its non-self start pole R as the child Role");
same(descriptor(L).roles[0], O, "L first child Role is its start pole O");
same(descriptor(L).roles[1], C, "L second child Role is its end pole C");

// ---------------------------------------------------------------------------
// A10b.2 — the operator sign is its own read-only structural template.
//
// Grounded operator sequences below correspond to the existing AC10 physical
// spellings 8 / 98 / 68 / 19868 / 16898 / 1968698, but this observer consumes
// already-grounded semantic sign Links. Physical bytes are outside this slice.
// ---------------------------------------------------------------------------
const startOfEndRoot = memory.ensureStartSelfClosed(C);
const endOfStartRoot = memory.ensureEndSelfClosed(O);
const genericFinite = memory.ensure(startOfEndRoot, endOfStartRoot);
assert(
  ![R, O, C, L, U].includes(genericFinite),
  "generic finite target is outside the root basis",
);

const positives = Object.freeze([
  Object.freeze({ id: "8", operators: Object.freeze([R]), target: R }),
  Object.freeze({ id: "98", operators: Object.freeze([O, R]), target: O }),
  Object.freeze({ id: "68", operators: Object.freeze([C, R]), target: C }),
  Object.freeze({
    id: "19868",
    operators: Object.freeze([L, O, R, C, R]),
    target: L,
  }),
  Object.freeze({
    id: "16898",
    operators: Object.freeze([L, C, R, O, R]),
    target: U,
  }),
  Object.freeze({
    id: "1968698",
    operators: Object.freeze([L, O, C, R, C, O, R]),
    target: genericFinite,
  }),
]);

for (const witness of positives) {
  validateProgram(witness.operators, witness.target);
}

// Direct binding evidence: the same operator Links expose the concrete children
// of their results without a dedicated pole-selector opcode.
{
  const startChild = memory.ensure(U, L);
  const startTarget = memory.ensureStartSelfClosed(startChild);
  const bindings = unifyStructuralTemplate(probe, O, startTarget, descriptor(O).roles);
  same(bindings.length, 1, "START descriptor yields one binding");
  same(bindings[0]?.role, R, "START descriptor child coordinate is R");
  same(bindings[0]?.value, startChild, "START descriptor infers exact child");
}
{
  const endChild = memory.ensure(L, U);
  const endTarget = memory.ensureEndSelfClosed(endChild);
  const bindings = unifyStructuralTemplate(probe, C, endTarget, descriptor(C).roles);
  same(bindings.length, 1, "END descriptor yields one binding");
  same(bindings[0]?.role, R, "END descriptor child coordinate is R");
  same(bindings[0]?.value, endChild, "END descriptor infers exact child");
}
{
  const left = memory.ensure(U, R);
  const right = memory.ensure(R, U);
  const pair = memory.ensure(left, right);
  const bindings = unifyStructuralTemplate(probe, L, pair, descriptor(L).roles);
  same(bindings.length, 2, "PAIR descriptor yields two bindings");
  same(bindings[0]?.role, O, "PAIR first coordinate is O");
  same(bindings[0]?.value, left, "PAIR descriptor infers exact left child");
  same(bindings[1]?.role, C, "PAIR second coordinate is C");
  same(bindings[1]?.value, right, "PAIR descriptor infers exact right child");
}

// ---------------------------------------------------------------------------
// A10b.3 — malformed transport is rejected from derived arity alone.
// ---------------------------------------------------------------------------
expectError("malformed-prefix", () => validateProgram([], R));
expectError("malformed-prefix", () => validateProgram([O], O));
expectError("malformed-prefix", () => validateProgram([C], C));
expectError("malformed-prefix", () => validateProgram([L, R], L));
expectError("trailing-source", () => validateProgram([R, R], R));

// ---------------------------------------------------------------------------
// A10b.4 — noncanonical PAIR aliases need no term-specific rules.
//
// The source descriptor is L / 00, but canonical pair reuse produces a target
// with a different self-incidence mask. Generic shape equality rejects it.
// ---------------------------------------------------------------------------
expectError("shape-mismatch", () =>
  validateProgram([L, R, R], R), // 188 -> Pair(R,R)=R / 11
);
expectError("shape-mismatch", () =>
  validateProgram([L, O, R, R], O), // 1988 -> Pair(O,R)=O / 10
);
expectError("shape-mismatch", () =>
  validateProgram([L, R, C, R], C), // 1868 -> Pair(R,C)=C / 01
);

// A plain unifier by itself intentionally permits ordinary-template collapse;
// the generic self-incidence mask check above is therefore semantically
// necessary and independent from object-specific operator names.
{
  const roles = descriptor(L).roles;
  const inferred = unifyStructuralTemplate(probe, L, R, roles);
  same(inferred.length, 2, "ordinary L template alone can unify with collapsed R");
  same(inferred[0]?.value, R, "collapsed pair first role inferred as R");
  same(inferred[1]?.value, R, "collapsed pair second role inferred as R");
}

// ---------------------------------------------------------------------------
// A10b.5 — executable WRITE-side gap.
//
// Generic proof/schema replay accepts O itself as a Link-defined template with
// R as its only Role. Current generic construction then rejects substitution
// because the template contains a real self-reference O=O->R.
// ---------------------------------------------------------------------------
{
  let cursor = memory.ensure(U, genericFinite);
  const fresh = (): LinkHandle => {
    cursor = memory.ensure(cursor, genericFinite);
    return cursor;
  };

  const theory = fresh();
  const dictionary = fresh();
  const grammar = fresh();
  const interpreter = defineStructuralInterpreter(memory, dictionary, grammar, theory);
  const afterContext = defineContext(memory, fresh(), fresh());

  // The structural Role is literally the non-self pole of O.
  const roleDictionary = defineStructuralRoleDictionary(memory, [R]);
  const rule = defineStructuralRule(memory, roleDictionary, O);
  const ruleAdmission = admitStructuralRule(memory, theory, rule);
  const derivationRule = defineStructuralDerivationRule(memory, rule, []);
  const derivationRuleAdmission = admitStructuralDerivationRule(
    memory,
    theory,
    derivationRule,
  );
  const premiseOccurrenceSequence = materializeExactSequence(memory, []);
  const occurrence = memory.ensure(derivationRule, premiseOccurrenceSequence);
  const identity = memory.ensure(derivationRule, theory);

  const generic: StructuralDerivedDerivationEvidence = Object.freeze({
    identity,
    targetOccurrence: occurrence,
    assumptions: Object.freeze([]),
    nodes: Object.freeze([
      Object.freeze({
        occurrence,
        derivationRule,
        ruleAdmission,
        derivationRuleAdmission,
        premiseOccurrenceSequence,
      }),
    ]),
  });

  const beforeReplay = memory.linkCount;
  const replay = replayStructuralDerivedDerivationSchema(memory, generic);
  same(replay.conclusionTemplate, O, "generic schema accepts O as structural template");
  same(memory.linkCount, beforeReplay, "generic schema replay is read-only");

  const child = fresh();
  assert(child !== R, "fixed-point instantiation child is not the Role itself");
  const beforeInstantiation = memory.linkCount;
  expectInstantiationError("cyclic-template", () =>
    instantiateStructuralDerivedDerivationSchema(
      memory,
      generic,
      interpreter,
      afterContext,
      [Object.freeze({ role: R, value: child })],
    ),
  );
  same(
    memory.linkCount,
    beforeInstantiation,
    "cyclic ostensive template fails before generic construction writes",
  );

  // Control: the target that generic fixed-point-aware instantiation would
  // need to construct is perfectly valid in Memory through the current
  // dedicated self-closure capability.
  const currentDedicatedTarget = memory.ensureStartSelfClosed(child);
  assert(
    sameShape(O, currentDedicatedTarget),
    "dedicated current write can construct the topology the generic instantiator rejects",
  );
}

console.log([
  "MTS v0.13 A10b:",
  "ABIT_IS_OWN_OSTENSIVE_OPERATION_TEMPLATE",
  "FORMAL_READ_ONLY_SELF_INTERPRETATION_SUPPORTED",
  "HOST_ASPECT_ENUM_DISPATCH_NOT_SEMANTICALLY_REQUIRED_FOR_VALIDATION",
  "WRITE_FIXED_POINT_INSTANTIATION_GAP_CONFIRMED",
].join(" "));
