import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  ExactSequenceError,
  materializeExactSequence,
  readExactSequence,
} from "../src/exact-sequence.js";
import {
  Memory,
  MemoryError,
  ensureRootBasis,
  type LinkHandle,
} from "../src/memory.js";
import {
  admitStructuralRule,
  defineStructuralInterpreter,
  defineStructuralRoleDictionary,
  defineStructuralRule,
} from "../src/structural-rule.js";
import {
  defineV013GroundedExecutionScope,
  reactV013GroundedScope,
  V013GroundedScopeCursor,
} from "../src/v013-grounded-execution.js";
import {
  defineV013WorkingScope,
  reactV013StructuralScope,
  V013CurrentScopeCursor,
} from "../src/v013-structural-execution.js";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error("v0.15 M3 grounded->legacy lowering: " + message);
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}
function sameMembers(
  actual: readonly LinkHandle[],
  expected: readonly LinkHandle[],
  message: string,
): void {
  same(actual.length, expected.length, message + " cardinality");
  for (const member of expected) assert(actual.includes(member), message + " missing member");
}

interface Fixture {
  readonly memory: Memory;
  readonly groundedTheory: LinkHandle;
  readonly K: LinkHandle;
  readonly A: LinkHandle;
  readonly B: LinkHandle;
  readonly C: LinkHandle;
  readonly D: LinkHandle;
  readonly E: LinkHandle;
  readonly fresh: () => LinkHandle;
}

function fixture(): Fixture {
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  let cursor = memory.ensure(basis.U, basis.L);
  const fresh = (): LinkHandle => (
    cursor = memory.ensure(cursor, cursor === basis.U ? basis.C : basis.O)
  );
  return Object.freeze({
    memory,
    groundedTheory: fresh(),
    K: fresh(),
    A: fresh(),
    B: fresh(),
    C: fresh(),
    D: fresh(),
    E: fresh(),
    fresh,
  });
}

function admitGrounded(
  f: Fixture,
  antecedent: LinkHandle,
  outputs: readonly LinkHandle[],
): LinkHandle {
  const image = materializeExactSequence(f.memory, outputs);
  const relation = f.memory.ensure(antecedent, image);
  f.memory.ensure(f.groundedTheory, relation);
  return relation;
}

interface LegacyLowering {
  readonly legacyTheory: LinkHandle;
  readonly interpreter: LinkHandle;
  readonly role: LinkHandle;
  readonly roleDictionary: LinkHandle;
  readonly rules: readonly LinkHandle[];
  readonly admissions: readonly LinkHandle[];
  readonly indexes: readonly LinkHandle[];
}

/**
 * Test-only compatibility lowering.
 *
 * It does NOT define program semantics. It mechanically wraps every valid
 * grounded Theory relation:
 *
 *   A -> [B...]
 *
 * as one legacy one-role structural rule:
 *
 *   X -> A  =>  [X -> B...]
 *
 * so the frozen StructuralRule executor reproduces the grounded MP step.
 */
function lowerGroundedTheoryToLegacyStructural(
  f: Fixture,
): LegacyLowering {
  const { memory, groundedTheory } = f;
  const role = f.fresh();
  const roleDictionary = defineStructuralRoleDictionary(memory, [role]);
  const legacyTheory = f.fresh();
  const grammar = f.fresh();
  const interpreter = defineStructuralInterpreter(
    memory,
    roleDictionary,
    grammar,
    legacyTheory,
  );

  const rules: LinkHandle[] = [];
  const admissions: LinkHandle[] = [];
  const indexes: LinkHandle[] = [];

  for (const sourceAdmission of memory.outgoing(groundedTheory)) {
    if (sourceAdmission === groundedTheory) continue;
    const sourceAdmissionPoles = memory.poles(sourceAdmission);
    if (
      sourceAdmissionPoles.start !== groundedTheory ||
      sourceAdmissionPoles.end === sourceAdmission
    ) continue;

    const relation = sourceAdmissionPoles.end;
    const relationPoles = memory.poles(relation);

    let outputs: readonly LinkHandle[];
    try {
      outputs = readExactSequence(memory, relationPoles.end).values;
    } catch (error) {
      if (error instanceof ExactSequenceError || error instanceof MemoryError) continue;
      throw error;
    }

    const before = memory.ensure(role, relationPoles.start);
    const outputTemplates = outputs.map((output) => memory.ensure(role, output));
    const imageTemplate = materializeExactSequence(memory, outputTemplates);
    const body = memory.ensure(before, imageTemplate);
    const rule = defineStructuralRule(memory, roleDictionary, body);
    const admission = admitStructuralRule(memory, legacyTheory, rule);
    const triggerKey = memory.poles(relationPoles.start).start;
    const index = memory.ensure(triggerKey, admission);

    rules.push(rule);
    admissions.push(admission);
    indexes.push(index);
  }

  return Object.freeze({
    legacyTheory,
    interpreter,
    role,
    roleDictionary,
    rules: Object.freeze(rules),
    admissions: Object.freeze(admissions),
    indexes: Object.freeze(indexes),
  });
}

function active(f: Fixture, value: LinkHandle): LinkHandle {
  return f.memory.ensure(f.K, value);
}

interface Differential {
  readonly groundedMembers: readonly LinkHandle[];
  readonly legacyMembers: readonly LinkHandle[];
  readonly groundedMatches: number;
  readonly legacyMatches: number;
  readonly groundedHandoff: number;
  readonly legacyHandoff: number;
  readonly groundedQuiescent: boolean;
  readonly legacyQuiescent: boolean;
}

function differential(
  f: Fixture,
  current: readonly LinkHandle[],
  lowered: LegacyLowering,
): Differential {
  const groundedScope = defineV013GroundedExecutionScope(
    f.memory,
    f.fresh(),
    f.groundedTheory,
    current,
  );
  const groundedCursor = new V013GroundedScopeCursor(f.memory, groundedScope);
  const grounded = reactV013GroundedScope(f.memory, groundedCursor, f.fresh());

  const legacyScope = defineV013WorkingScope(
    f.memory,
    f.fresh(),
    lowered.interpreter,
    current,
  );
  const legacyCursor = new V013CurrentScopeCursor(f.memory, legacyScope);
  const legacy = reactV013StructuralScope(f.memory, legacyCursor, f.fresh());

  return Object.freeze({
    groundedMembers: groundedCursor.members(),
    legacyMembers: legacyCursor.members(),
    groundedMatches: grounded.matchedRelations,
    legacyMatches: legacy.rawRuleMatches,
    groundedHandoff: grounded.handoffCount,
    legacyHandoff: legacy.handoffCount,
    groundedQuiescent: grounded.quiescent,
    legacyQuiescent: legacy.quiescent,
  });
}

function sameDifferential(actual: Differential, label: string): void {
  sameMembers(actual.legacyMembers, actual.groundedMembers, label + " members");
  same(actual.legacyMatches, actual.groundedMatches, label + " matches");
  same(actual.legacyHandoff, actual.groundedHandoff, label + " handoff");
  same(actual.legacyQuiescent, actual.groundedQuiescent, label + " quiescence");
}

// NO_MATCH.
{
  const f = fixture();
  const lowered = lowerGroundedTheoryToLegacyStructural(f);
  same(lowered.rules.length, 0, "no-match lowering has zero generated rules");
  sameDifferential(differential(f, [active(f, f.A)], lowered), "NO_MATCH");
}

// ACTIVE IDENTITY.
{
  const f = fixture();
  admitGrounded(f, f.A, [f.A]);
  const lowered = lowerGroundedTheoryToLegacyStructural(f);
  same(lowered.rules.length, 1, "identity one generated wrapper");
  sameDifferential(differential(f, [active(f, f.A)], lowered), "ACTIVE_IDENTITY");
}

// 1->0 explicit matched empty.
{
  const f = fixture();
  admitGrounded(f, f.A, []);
  const lowered = lowerGroundedTheoryToLegacyStructural(f);
  sameDifferential(differential(f, [active(f, f.A)], lowered), "ONE_TO_ZERO");
}

// 1->N plus multiple admitted relations for the same antecedent.
{
  const f = fixture();
  admitGrounded(f, f.A, [f.B, f.C]);
  admitGrounded(f, f.A, [f.C, f.D]);
  const lowered = lowerGroundedTheoryToLegacyStructural(f);
  same(lowered.rules.length, 2, "two grounded relations -> two generated wrappers");
  same(
    new Set(lowered.rules.map(() => lowered.roleDictionary)).size,
    1,
    "all generated wrappers share one RoleDictionary",
  );
  sameDifferential(differential(f, [active(f, f.A)], lowered), "ONE_TO_N_MULTI_MATCH");
}

// N->M pointwise lift with matched-empty, positive siblings and one NO_MATCH.
{
  const f = fixture();
  admitGrounded(f, f.A, []);
  admitGrounded(f, f.A, [f.B]);
  admitGrounded(f, f.C, [f.D, f.E]);
  const lowered = lowerGroundedTheoryToLegacyStructural(f);
  same(lowered.rules.length, 3, "N->M three generated wrappers");
  sameDifferential(
    differential(
      f,
      [active(f, f.A), active(f, f.C), active(f, f.B)],
      lowered,
    ),
    "N_TO_M",
  );
}

// Packed antecedent remains just another exact grounded antecedent.
{
  const f = fixture();
  const pair = f.memory.ensure(f.A, f.C);
  admitGrounded(f, pair, [f.D]);
  const lowered = lowerGroundedTheoryToLegacyStructural(f);

  sameDifferential(
    differential(f, [active(f, f.A), active(f, f.C)], lowered),
    "UNPACKED_NO_JOIN",
  );
  sameDifferential(
    differential(f, [active(f, pair)], lowered),
    "PACKED_UNARY",
  );
}

// Static anti-drift: compatibility lowering is generic and does not know any
// logical element, truth row, function opcode or program-specific dispatcher.
{
  const root = resolve(process.cwd(), "..");
  const own = readFileSync(
    join(root, "ts/test/v015-grounded-legacy-lowering-m3.test.ts"),
    "utf8",
  );
  const start = own.indexOf("function lowerGroundedTheoryToLegacyStructural(");
  const end = own.indexOf("\nfunction active(", start);
  assert(start >= 0 && end > start, "lowering source slice");
  const lowering = own.slice(start, end);

  for (const forbidden of [
    "AND",
    "OR",
    "XOR",
    "NOT",
    "FF",
    "FT",
    "TF",
    "TT",
    "opcode",
    "RuleKind",
    "selectedBranch",
    "switch(",
  ]) {
    assert(!lowering.includes(forbidden), "generic lowering excludes " + forbidden);
  }

  assert(lowering.includes("defineStructuralRoleDictionary(memory, [role])"),
    "one generic contextual role dictionary");
  assert(lowering.includes("memory.outgoing(groundedTheory)"),
    "selected grounded Theory is source authority");
  assert(lowering.includes("readExactSequence(memory, relationPoles.end)"),
    "grounded image carrier is read generically");
  assert(lowering.includes("memory.ensure(role, relationPoles.start)"),
    "wrapper antecedent preserves generic contextual K role");
  assert(lowering.includes("outputs.map((output) => memory.ensure(role, output))"),
    "wrapper outputs preserve generic contextual K role");
}

console.log([
  "MTS_V015_META_M3=GROUND_TO_LEGACY_DIFFERENTIAL_GREEN",
  "SOURCE_SEMANTICS=GROUNDED_THEORY_RELATIONS",
  "LEGACY_STRUCTURAL_RULES=GENERATED_BACKEND_REPRESENTATION",
  "SHARED_ROLE_DICTIONARY=TRUE",
  "NO_MATCH=PARITY",
  "ACTIVE_IDENTITY=PARITY",
  "ONE_TO_ZERO=PARITY",
  "ONE_TO_N=PARITY",
  "MULTIPLE_MATCHES=PARITY",
  "N_TO_M=PARITY",
  "PACKED_ANTECEDENT=PARITY",
  "PROGRAM_SPECIFIC_DISPATCH=0",
  "CANONICAL_PROGRAM_CONTAINS_LEGACY_SCAFFOLD=FALSE",
].join(" "));
