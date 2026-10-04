import {
  materializeExactSequence,
  readExactSequence,
} from "../src/exact-sequence.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
} from "../src/memory.js";
import {
  admitStructuralRule,
  defineStructuralInterpreter,
  defineStructuralRoleDictionary,
  defineStructuralRule,
  readStructuralRoleDictionary,
  readStructuralRule,
  verifyStructuralRuleAdmission,
} from "../src/structural-rule.js";
import {
  defineV013WorkingScope,
  reactV013StructuralScope,
  V013CurrentScopeCursor,
} from "../src/v013-structural-execution.js";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error("v0.15 M8 structural-unary legacy lowering: " + message);
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
  for (const value of expected) {
    assert(actual.includes(value), message + " missing expected member");
  }
}

class CompatibilityLoweringError extends Error {
  override readonly name = "CompatibilityLoweringError";
  constructor(readonly code: "role-dependent-trigger") {
    super(code);
  }
}

function anchors(
  memory: Memory,
  seed: LinkHandle,
  salt: LinkHandle,
  count: number,
): readonly LinkHandle[] {
  const out: LinkHandle[] = [];
  let current = memory.ensure(seed, salt);
  for (let index = 0; index < count; index += 1) {
    current = memory.ensure(current, index % 2 === 0 ? salt : seed);
    out.push(current);
  }
  return Object.freeze(out);
}

function containsRole(
  memory: Memory,
  value: LinkHandle,
  roles: ReadonlySet<LinkHandle>,
  visited = new Set<LinkHandle>(),
): boolean {
  if (roles.has(value)) return true;
  if (visited.has(value)) return false;
  visited.add(value);

  const poles = memory.poles(value);
  if (poles.start !== value && containsRole(memory, poles.start, roles, visited)) {
    return true;
  }
  if (poles.end !== value && containsRole(memory, poles.end, roles, visited)) {
    return true;
  }
  return false;
}

interface LoweredRule {
  readonly sourceRule: LinkHandle;
  readonly legacyRule: LinkHandle;
  readonly legacyAdmission: LinkHandle;
  readonly triggerKey: LinkHandle;
}

interface LegacyPackage {
  readonly legacyTheory: LinkHandle;
  readonly interpreter: LinkHandle;
  readonly contextualRole: LinkHandle;
  readonly lowered: readonly LoweredRule[];
}

/**
 * Backend-only compatibility lowering from clean v0.15 structural-unary rules:
 *
 *   roles R...
 *   A_template(R...) -> [B_template(R...)...]
 *
 * to the frozen legacy structural engine shape:
 *
 *   roles K,R...
 *   K -> A_template(R...) -> [K -> B_template(R...)...]
 *   + derived antecedent-local trigger index
 *
 * K and the trigger index do NOT belong to source program semantics.
 */
function lowerStructuralUnaryTheoryToLegacy(
  memory: Memory,
  sourceTheory: LinkHandle,
  legacyTheory: LinkHandle,
  contextualRole: LinkHandle,
  grammar: LinkHandle,
): LegacyPackage {
  const lowered: LoweredRule[] = [];

  for (const sourceAdmission of memory.outgoing(sourceTheory)) {
    if (sourceAdmission === sourceTheory) continue;
    const admissionPoles = memory.poles(sourceAdmission);
    if (
      admissionPoles.start !== sourceTheory ||
      admissionPoles.end === sourceAdmission
    ) {
      continue;
    }

    const sourceRule = admissionPoles.end;
    verifyStructuralRuleAdmission(
      memory,
      sourceTheory,
      sourceRule,
      sourceAdmission,
    );
    const source = readStructuralRule(memory, sourceRule);
    const sourceRoles = readStructuralRoleDictionary(
      memory,
      source.roleDictionary,
    ).roles;
    assert(
      !sourceRoles.includes(contextualRole),
      "backend contextual role must be fresh",
    );

    const body = memory.poles(source.body);
    const antecedentTemplate = body.start;
    const triggerKey = memory.poles(antecedentTemplate).start;
    const sourceRoleSet = new Set(sourceRoles);

    // Frozen v0.175 legacy discovery indexes by the exact direct start pole of
    // the actual antecedent. If the source template can substitute inside that
    // trigger key, one finite static legacy index is not semantics-preserving.
    if (containsRole(memory, triggerKey, sourceRoleSet)) {
      throw new CompatibilityLoweringError("role-dependent-trigger");
    }

    const outputTemplates = readExactSequence(memory, body.end).values;
    const legacyDictionary = defineStructuralRoleDictionary(
      memory,
      [contextualRole, ...sourceRoles],
    );
    const legacyBefore = memory.ensure(contextualRole, antecedentTemplate);
    const legacyOutputs = outputTemplates.map((template) =>
      memory.ensure(contextualRole, template)
    );
    const legacyImage = materializeExactSequence(memory, legacyOutputs);
    const legacyBody = memory.ensure(legacyBefore, legacyImage);
    const legacyRule = defineStructuralRule(
      memory,
      legacyDictionary,
      legacyBody,
    );
    const legacyAdmission = admitStructuralRule(
      memory,
      legacyTheory,
      legacyRule,
    );

    // Physical compatibility index required only by the frozen legacy engine.
    memory.ensure(triggerKey, legacyAdmission);

    lowered.push(Object.freeze({
      sourceRule,
      legacyRule,
      legacyAdmission,
      triggerKey,
    }));
  }

  const authorityDictionary = defineStructuralRoleDictionary(memory, []);
  const interpreter = defineStructuralInterpreter(
    memory,
    authorityDictionary,
    grammar,
    legacyTheory,
  );

  return Object.freeze({
    legacyTheory,
    interpreter,
    contextualRole,
    lowered: Object.freeze(lowered),
  });
}

const memory = new Memory();
const basis = ensureRootBasis(memory);
const aa = anchors(memory, basis.U, basis.L, 100);
const at = (index: number): LinkHandle => {
  const value = aa[index];
  assert(value !== undefined, "anchor " + index);
  return value;
};

const K = at(0);
const tag = at(1);
const grammar = at(2);
const xRole = at(3);
const yRole = at(4);
const backendKRole = at(5);
const A = at(6);
const B = at(7);

const sourceTheory = memory.ensure(at(80), at(81));
const legacyTheory = memory.ensure(at(82), at(83));

function admitSourceRule(
  theory: LinkHandle,
  roles: readonly LinkHandle[],
  antecedentTemplate: LinkHandle,
  outputTemplates: readonly LinkHandle[],
): LinkHandle {
  const dictionary = defineStructuralRoleDictionary(memory, roles);
  const image = materializeExactSequence(memory, outputTemplates);
  const body = memory.ensure(antecedentTemplate, image);
  const rule = defineStructuralRule(memory, dictionary, body);
  admitStructuralRule(memory, theory, rule);
  return rule;
}

// Clean source rule: tag -> (X -> Y)  =>  [Y -> X].
// It contains no K/caller role and no trigger index.
const antecedentTemplate = memory.ensure(tag, memory.ensure(xRole, yRole));
const outputTemplate = memory.ensure(yRole, xRole);
const sourceRule = admitSourceRule(
  sourceTheory,
  [xRole, yRole],
  antecedentTemplate,
  [outputTemplate],
);

{
  const source = readStructuralRule(memory, sourceRule);
  const sourceRoles = readStructuralRoleDictionary(
    memory,
    source.roleDictionary,
  ).roles;
  sameMembers(sourceRoles, [xRole, yRole], "source roles");
  assert(!sourceRoles.includes(backendKRole), "source rule excludes backend K role");
}

const legacy = lowerStructuralUnaryTheoryToLegacy(
  memory,
  sourceTheory,
  legacyTheory,
  backendKRole,
  grammar,
);
same(legacy.lowered.length, 1, "one source rule -> one legacy wrapper");

{
  const loweredRule = readStructuralRule(
    memory,
    legacy.lowered[0]!.legacyRule,
  );
  const loweredRoles = readStructuralRoleDictionary(
    memory,
    loweredRule.roleDictionary,
  ).roles;
  sameMembers(
    loweredRoles,
    [backendKRole, xRole, yRole],
    "legacy wrapper adds exactly one contextual role",
  );
  same(
    legacy.lowered[0]!.triggerKey,
    tag,
    "legacy trigger derives from fixed grounded template start",
  );
}

// Frozen legacy execution reproduces the clean structural-unary rule.
{
  const actual = memory.ensure(tag, memory.ensure(A, B));
  const active = memory.ensure(K, actual);
  const expected = memory.ensure(K, memory.ensure(B, A));

  const scope = defineV013WorkingScope(
    memory,
    at(84),
    legacy.interpreter,
    [active],
  );
  const cursor = new V013CurrentScopeCursor(memory, scope);
  const reaction = reactV013StructuralScope(memory, cursor, at(85));

  sameMembers(cursor.members(), [expected], "legacy backend result");
  same(reaction.oldMembers.length, 1, "legacy one current member");
  same(reaction.rawRuleMatches, 1, "legacy one generated wrapper match");
  same(reaction.transitionedMembers, 1, "legacy one transitioned member");
  same(reaction.handoffCount, 1, "legacy one atomic handoff");
}

// Capability falsifier: frozen legacy trigger indexing cannot faithfully
// represent a source rule whose direct trigger-start template itself depends on
// a role. v0.15 semantics may support it; this backend lowering must fail closed.
{
  const unsupportedSourceTheory = memory.ensure(at(86), at(87));
  const unsupportedLegacyTheory = memory.ensure(at(88), at(89));

  const variableStartAntecedent = memory.ensure(
    memory.ensure(tag, xRole),
    yRole,
  );
  admitSourceRule(
    unsupportedSourceTheory,
    [xRole, yRole],
    variableStartAntecedent,
    [xRole],
  );

  let rejected = false;
  try {
    lowerStructuralUnaryTheoryToLegacy(
      memory,
      unsupportedSourceTheory,
      unsupportedLegacyTheory,
      at(90),
      grammar,
    );
  } catch (error) {
    assert(
      error instanceof CompatibilityLoweringError,
      "role-dependent trigger rejection type",
    );
    same(
      error.code,
      "role-dependent-trigger",
      "role-dependent trigger rejection code",
    );
    rejected = true;
  }
  assert(rejected, "role-dependent legacy trigger must fail closed");
}

// No source-name/function dispatch exists in the lowerer.
{
  const source = lowerStructuralUnaryTheoryToLegacy.toString();
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
    "selectedFunction",
  ]) {
    assert(!source.includes(forbidden), "generic lowerer excludes " + forbidden);
  }
}

console.log([
  "MTS_V015_META_M8=STRUCTURAL_UNARY_TO_LEGACY_GREEN",
  "SOURCE_RULE_CALLER_ROLE=ABSENT",
  "SOURCE_TRIGGER_INDEX=ABSENT",
  "LEGACY_CONTEXT_ROLE=GENERATED_BACKEND_ONLY",
  "LEGACY_TRIGGER_INDEX=GENERATED_BACKEND_ONLY",
  "ONE_SOURCE_RULE_TO_ONE_LEGACY_WRAPPER=TRUE",
  "PARAMETRIC_TWO_ROLE_EXECUTION=GREEN",
  "PROGRAM_SPECIFIC_DISPATCH=0",
  "FROZEN_BACKEND_CAPABILITY_FIXED_TRIGGER_START=SUPPORTED",
  "FROZEN_BACKEND_CAPABILITY_ROLE_DEPENDENT_TRIGGER=FAIL_CLOSED",
  "BACKEND_CAPABILITY_GAP_IS_NOT_SEMANTIC_LIMIT=TRUE",
].join(" "));
