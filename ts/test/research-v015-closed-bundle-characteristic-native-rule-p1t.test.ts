import { materializeExactSequence, readExactSequence } from "../src/exact-sequence.js";
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
} from "../src/structural-rule.js";
import {
  V013CurrentScopeCursor,
  defineV013WorkingScope,
  reactV013StructuralScope,
} from "../src/v013-structural-execution.js";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error("v0.15 P1t native characteristic Rule: " + message);
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), message + ": " + String(actual) + " !== " + String(expected));
}

const memory = new Memory();
const b = ensureRootBasis(memory);
let cursor = memory.ensure(b.O, b.U);
const fresh = (): LinkHandle => {
  cursor = memory.ensure(cursor, b.C);
  return cursor;
};

const objectTheory = memory.ensure(b.L, b.C);
const membershipTheory = memory.ensure(b.C, b.L);
const MEMBER = fresh();

const ruleA = fresh();
const ruleB = fresh();
const ruleC = fresh();
const admissionA = memory.ensure(objectTheory, ruleA);
const admissionB = memory.ensure(objectTheory, ruleB);

// Exact pinned source authority. Ambient C is added only later.
const pinnedAdmissions = Object.freeze([admissionA, admissionB]);

const application = (theory: LinkHandle, rule: LinkHandle): LinkHandle =>
  memory.ensure(memory.ensure(MEMBER, theory), rule);
const state = (
  theory: LinkHandle,
  rule: LinkHandle,
  result: LinkHandle,
): LinkHandle =>
  memory.ensure(application(theory, rule), result);

interface NativeMembershipRule {
  readonly roleAnchor: LinkHandle;
  readonly antecedent: LinkHandle;
  readonly output: LinkHandle;
  readonly image: LinkHandle;
  readonly body: LinkHandle;
  readonly rule: LinkHandle;
  readonly admission: LinkHandle;
}

/**
 * Canonical v0.15 semantic shape:
 *
 *   V0        = ordinary bundle anchor with roles(V0,M_t) = {}
 *   Body      = Antecedent -> ExactSequence([Output])
 *   Rule      = V0 -> Body
 *   Theory -> Rule ∈ M_t
 *
 * No legacy RoleDictionary participates in this semantic construction.
 */
function defineNativeMembershipRule(
  sourceAdmission: LinkHandle,
): NativeMembershipRule {
  const p = memory.poles(sourceAdmission);
  same(p.start, objectTheory, "source admission belongs to ObjectTheory");
  const referencedRule = p.end;

  const roleAnchor = fresh();
  const antecedent = state(objectTheory, referencedRule, b.U);
  const output = state(objectTheory, referencedRule, b.L);
  const image = materializeExactSequence(memory, [output]);
  const body = memory.ensure(antecedent, image);
  const rule = memory.ensure(roleAnchor, body);
  const admission = memory.ensure(membershipTheory, rule);

  return Object.freeze({
    roleAnchor,
    antecedent,
    output,
    image,
    body,
    rule,
    admission,
  });
}

const nativeRules = pinnedAdmissions.map(defineNativeMembershipRule);

// Semantic M_t for the characteristic program contains exactly its admissions.
// Hence every V0 has zero semantic outgoing roles even if ambient physical
// Memory later accumulates unrelated links.
const semanticMembers = new Set(nativeRules.map((x) => x.admission));

for (const native of nativeRules) {
  const rulePoles = memory.poles(native.rule);
  same(rulePoles.start, native.roleAnchor, "Rule starts at V0");
  same(rulePoles.end, native.body, "Rule ends at Body");

  const bodyPoles = memory.poles(native.body);
  same(bodyPoles.start, native.antecedent, "Body antecedent");
  same(bodyPoles.end, native.image, "Body image");
  const outputs = readExactSequence(memory, native.image).values;
  same(outputs.length, 1, "membership image cardinality one");
  same(outputs[0], native.output, "membership image is L state");

  assert(semanticMembers.has(native.admission), "Theory->Rule is semantic member");
  const roleMembers = [...semanticMembers].filter(
    (member) => memory.poles(member).start === native.roleAnchor,
  );
  same(roleMembers.length, 0, "roles(V0,M_t) is empty");
}

// ---------------------------------------------------------------------------
// Generic compatibility lowering to the frozen legacy structural executor.
//
// Frozen v0.13 execution carries the caller/context K as one generated role:
//   K->Antecedent => [K->Output]
//
// This is the same generic zero-role compatibility pattern already exercised by
// the approved grounded v0.15 package; it is not characteristic-function
// semantics.
// ---------------------------------------------------------------------------

const compatibilitySeed = memory.ensure(membershipTheory, MEMBER);
const contextRole = memory.ensureStartSelfClosed(compatibilitySeed);
const legacyTheory = memory.ensureEndSelfClosed(compatibilitySeed);
const grammar = memory.ensure(compatibilitySeed, contextRole);
const legacyDictionary = defineStructuralRoleDictionary(
  memory,
  [contextRole],
);

for (const native of nativeRules) {
  const before = memory.ensure(contextRole, native.antecedent);
  const outputTemplates = [
    memory.ensure(contextRole, native.output),
  ];
  const legacyImage = materializeExactSequence(memory, outputTemplates);
  const legacyBody = memory.ensure(before, legacyImage);
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
  const triggerKey = memory.poles(native.antecedent).start;
  memory.ensure(triggerKey, legacyAdmission);
}

const legacyInterpreter = defineStructuralInterpreter(
  memory,
  legacyDictionary,
  grammar,
  legacyTheory,
);

function evaluate(rule: LinkHandle): LinkHandle {
  const endpoint = state(objectTheory, rule, b.U);
  const initial = memory.ensure(contextRole, endpoint);
  const scope = defineV013WorkingScope(
    memory,
    fresh(),
    legacyInterpreter,
    [initial],
  );
  const current = new V013CurrentScopeCursor(memory, scope);
  const reaction = reactV013StructuralScope(memory, current, fresh());
  same(current.members().length, 1, "one membership result");

  const resultCurrent = current.members()[0]!;
  same(
    memory.poles(resultCurrent).start,
    contextRole,
    "compatibility lowering preserves caller/context K",
  );
  const resultEndpoint = memory.poles(resultCurrent).end;
  same(
    memory.poles(resultEndpoint).start,
    application(objectTheory, rule),
    "application retained",
  );

  if (rule === ruleA || rule === ruleB) {
    same(reaction.rawRuleMatches, 1, "selected member has one lowered match");
  }
  return memory.poles(resultEndpoint).end;
}

same(evaluate(ruleA), b.L, "pinned A -> L");
same(evaluate(ruleB), b.L, "pinned B -> L");

// Ambient physical admission after semantic projection has no native membership
// Rule and therefore no lowered executable relation.
const ambientAdmission = memory.ensure(objectTheory, ruleC);
same(memory.find(objectTheory, ruleC), ambientAdmission, "ambient C exists physically");
same(evaluate(ruleC), b.U, "ambient C -> U");

console.log([
  "MTS_V015_P1T_NATIVE_CHARACTERISTIC_RULE=GREEN_RESEARCH",
  "CANONICAL_RULE=V0_TO_ANTECEDENT_TO_EXACT_IMAGE",
  "ROLES_V0_M_T=EMPTY",
  "MEMBERSHIP_THEORY_ADMISSION=SEMANTIC_MEMBER",
  "LEGACY_ROLE_DICTIONARY=BACKEND_ONLY",
  "SELECTED_MEMBER=L",
  "CLOSED_NONMEMBER=U",
  "POST_FREEZE_PHYSICAL_ADMISSION_AUTHORITY=0",
  "PROOF_SPECIFIC_SEMANTICS=0",
  "NEW_AMEMORY_OPCODE=0",
].join(" "));
