import {
  ExactSequenceError,
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
  defineStructuralRoleDictionary,
  defineStructuralRule,
  readStructuralRoleDictionary,
  readStructuralRule,
  StructuralRuleError,
  verifyStructuralRuleAdmission,
} from "../src/structural-rule.js";
import { unifyStructuralRuleTemplate } from "../src/structural-unification.js";
import {
  defineV013GroundedExecutionScope,
  readV013GroundedExecutionScopeAuthority,
  V013GroundedScopeCursor,
} from "../src/v013-grounded-execution.js";
import {
  instantiateV013StructuralTemplate,
} from "../src/v013-structural-execution.js";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error("v0.15 M7 structural-unary reaction: " + message);
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

interface RuleImage {
  readonly rule: LinkHandle;
  readonly outputs: readonly LinkHandle[];
}

/**
 * Candidate-B implementation of the abstract FND-08 Matches/Emits boundary.
 *
 * A selected Theory admits ordinary StructuralRule data:
 *
 *   Rule = RoleDictionary -> (AntecedentTemplate -> ExactSequence(OutputTemplates...))
 *
 * Matching is against ONE current endpoint A, never against K->A and never
 * against several current members jointly. The reaction law itself preserves K.
 *
 * There is deliberately:
 * - no trigger index;
 * - no K/caller role in program rules;
 * - no function/opcode dispatch;
 * - no runtime Scope topology inside a Rule.
 */
function discoverStructuralUnaryImages(
  memory: Memory,
  theory: LinkHandle,
  antecedent: LinkHandle,
): readonly RuleImage[] {
  const found: RuleImage[] = [];

  for (const admission of memory.outgoing(theory)) {
    if (admission === theory) continue;
    const ap = memory.poles(admission);
    if (ap.start !== theory || ap.end === admission) continue;

    try {
      const rule = ap.end;
      verifyStructuralRuleAdmission(memory, theory, rule, admission);
      const structural = readStructuralRule(memory, rule);
      const roles = readStructuralRoleDictionary(
        memory,
        structural.roleDictionary,
      ).roles;
      const body = memory.poles(structural.body);

      const bindings = unifyStructuralRuleTemplate(
        memory,
        body.start,
        antecedent,
        roles,
      );
      const groundedImage = instantiateV013StructuralTemplate(
        memory,
        body.end,
        bindings,
      );
      const outputs = readExactSequence(memory, groundedImage).values;
      found.push(Object.freeze({ rule, outputs }));
    } catch (error) {
      if (
        error instanceof StructuralRuleError ||
        error instanceof ExactSequenceError
      ) {
        continue;
      }
      throw error;
    }
  }

  return Object.freeze(found);
}

interface StructuralUnaryReaction {
  readonly oldMembers: readonly LinkHandle[];
  readonly nextMembers: readonly LinkHandle[];
  readonly rawRuleMatches: number;
  readonly transitionedMembers: number;
  readonly quiescent: boolean;
  readonly handoffCount: 0 | 1;
}

/**
 * One FND-08/FND-09-style reaction with structural-unary Matches.
 *
 * Current truth is K->A.
 * Matches(rule,A) is strict structural template matching against the ONE A.
 * Emits(rule,B) is membership in the instantiated ordered image.
 * K is preserved by the reaction law itself.
 */
function reactStructuralUnaryScope(
  memory: Memory,
  cursor: V013GroundedScopeCursor,
  nextScopeSeed: LinkHandle,
): StructuralUnaryReaction {
  const oldScope = cursor.currentScope();
  const { theory } = readV013GroundedExecutionScopeAuthority(memory, oldScope);
  const before = cursor.members();
  const after: LinkHandle[] = [];
  const add = (value: LinkHandle): void => {
    if (!after.includes(value)) after.push(value);
  };

  let rawRuleMatches = 0;
  let transitionedMembers = 0;

  for (const truth of before) {
    const truthPoles = memory.poles(truth);
    const images = discoverStructuralUnaryImages(
      memory,
      theory,
      truthPoles.end,
    );

    if (images.length === 0) {
      add(truth);
      continue;
    }

    transitionedMembers += 1;
    rawRuleMatches += images.length;

    for (const image of images) {
      for (const output of image.outputs) {
        add(memory.ensure(truthPoles.start, output));
      }
    }

    same(cursor.currentScope(), oldScope, "current root stable during derivation");
  }

  if (rawRuleMatches === 0) {
    return Object.freeze({
      oldMembers: before,
      nextMembers: before,
      rawRuleMatches,
      transitionedMembers,
      quiescent: true,
      handoffCount: 0,
    });
  }

  const nextScope = defineV013GroundedExecutionScope(
    memory,
    nextScopeSeed,
    theory,
    after,
  );
  cursor.switchAtomically(oldScope, nextScope);

  return Object.freeze({
    oldMembers: before,
    nextMembers: Object.freeze(after),
    rawRuleMatches,
    transitionedMembers,
    quiescent: false,
    handoffCount: 1,
  });
}

function anchors(
  memory: Memory,
  seed: LinkHandle,
  salt: LinkHandle,
  count: number,
): readonly LinkHandle[] {
  const out: LinkHandle[] = [];
  let current = memory.ensure(seed, salt);
  for (let i = 0; i < count; i += 1) {
    current = memory.ensure(current, i % 2 === 0 ? salt : seed);
    out.push(current);
  }
  return Object.freeze(out);
}

const memory = new Memory();
const basis = ensureRootBasis(memory);
const aa = anchors(memory, basis.U, basis.L, 80);
const at = (i: number): LinkHandle => {
  const value = aa[i];
  assert(value !== undefined, "anchor " + i);
  return value;
};

const K = at(0);
const A = at(1);
const B = at(2);
const C = at(3);
const D = at(4);
const E = at(5);
const tag = at(6);
const xRole = at(7);
const yRole = at(8);

// Build selected Theory roots after the reusable anchor chain. No later anchor
// construction uses these roots as a start pole.
const exactTheory = memory.ensure(at(60), at(61));
const parametricTheory = memory.ensure(at(62), at(63));
const dynamicTheory = memory.ensure(at(64), at(65));

function admitRule(
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

function run(
  theory: LinkHandle,
  members: readonly LinkHandle[],
  seedIndex: number,
): {
  readonly cursor: V013GroundedScopeCursor;
  readonly reaction: StructuralUnaryReaction;
} {
  const scope = defineV013GroundedExecutionScope(
    memory,
    at(seedIndex),
    theory,
    members,
  );
  const cursor = new V013GroundedScopeCursor(memory, scope);
  const reaction = reactStructuralUnaryScope(
    memory,
    cursor,
    at(seedIndex + 1),
  );
  return Object.freeze({ cursor, reaction });
}

// Exact rules are a zero-role subset of the SAME Matches implementation.
// This covers NO_MATCH, matched-empty, ordinary 1->1 and active identity.
{
  admitRule(exactTheory, [], A, []);
  admitRule(exactTheory, [], B, [C]);
  admitRule(exactTheory, [], D, [D]);

  const currentA = memory.ensure(K, A);
  const currentB = memory.ensure(K, B);
  const currentD = memory.ensure(K, D);
  const currentE = memory.ensure(K, E);

  const { cursor, reaction } = run(
    exactTheory,
    [currentA, currentB, currentD, currentE],
    66,
  );

  sameMembers(
    cursor.members(),
    [
      memory.ensure(K, C),
      currentD,
      currentE,
    ],
    "exact zero/one/identity/no-match reaction",
  );
  same(reaction.rawRuleMatches, 3, "three exact rules matched");
  same(reaction.transitionedMembers, 3, "A/B/D transitioned");
  same(reaction.handoffCount, 1, "one whole-successor handoff");
  same(reaction.quiescent, false, "exact reaction active");
}

// Parameteric structural rule matches one fresh endpoint without any prior
// exact grounded relation for that endpoint.
{
  const templateArgs = memory.ensure(xRole, yRole);
  const antecedentTemplate = memory.ensure(tag, templateArgs);
  const outputTemplate = memory.ensure(yRole, xRole);

  const rule = admitRule(
    parametricTheory,
    [xRole, yRole],
    antecedentTemplate,
    [outputTemplate],
  );

  const dictionary = readStructuralRule(memory, rule).roleDictionary;
  const roles = readStructuralRoleDictionary(memory, dictionary).roles;
  sameMembers(roles, [xRole, yRole], "program rule contains only semantic roles");
  assert(!roles.includes(K), "K/caller is not a program role");

  const actual = memory.ensure(tag, memory.ensure(A, B));
  const active = memory.ensure(K, actual);
  const expected = memory.ensure(K, memory.ensure(B, A));

  const { cursor, reaction } = run(parametricTheory, [active], 68);
  sameMembers(cursor.members(), [expected], "structural-unary parameteric result");
  same(reaction.oldMembers.length, 1, "one current member");
  same(reaction.rawRuleMatches, 1, "one structural template match");
  same(reaction.transitionedMembers, 1, "one member transitioned");
  same(reaction.handoffCount, 1, "one atomic handoff");
}

// Separate current role values never implicitly satisfy the packed structural
// antecedent. The selected Matches relation remains unary in current A.
{
  const separateA = memory.ensure(K, A);
  const separateB = memory.ensure(K, B);
  const { cursor, reaction } = run(
    parametricTheory,
    [separateA, separateB],
    70,
  );
  sameMembers(cursor.members(), [separateA, separateB], "no implicit member join");
  same(reaction.rawRuleMatches, 0, "separate members do not match packed template");
  same(reaction.handoffCount, 0, "no join means quiescent");
}

// Theory admissions are discovered directly from the selected Theory.
// No antecedent-local trigger index is part of semantic authority.
{
  const template = memory.ensure(tag, xRole);
  const output = memory.ensure(xRole, tag);
  const actual = memory.ensure(tag, C);
  const active = memory.ensure(K, actual);

  const before = run(dynamicTheory, [active], 72);
  sameMembers(before.cursor.members(), [active], "before dynamic admission no-match");
  same(before.reaction.rawRuleMatches, 0, "before dynamic admission zero matches");

  admitRule(dynamicTheory, [xRole], template, [output]);

  const after = run(dynamicTheory, [active], 74);
  sameMembers(
    after.cursor.members(),
    [memory.ensure(K, memory.ensure(C, tag))],
    "new Theory admission visible next reaction",
  );
  same(after.reaction.rawRuleMatches, 1, "new parameteric admission matched");
  same(after.reaction.handoffCount, 1, "new admission causes handoff");
}

// Multiple admitted rules may match one antecedent; every image contributes.
{
  const multiTheory = memory.ensure(at(76), at(77));
  const actual = memory.ensure(tag, memory.ensure(A, B));
  const templateArgs = memory.ensure(xRole, yRole);
  const template = memory.ensure(tag, templateArgs);

  admitRule(multiTheory, [xRole, yRole], template, [xRole]);
  admitRule(multiTheory, [xRole, yRole], template, [yRole]);

  const active = memory.ensure(K, actual);
  const { cursor, reaction } = run(multiTheory, [active], 78);
  sameMembers(
    cursor.members(),
    [memory.ensure(K, A), memory.ensure(K, B)],
    "all structural-unary matching images contribute",
  );
  same(reaction.rawRuleMatches, 2, "both matching rules fire");
  same(reaction.transitionedMembers, 1, "still one current antecedent");
}

console.log([
  "MTS_V015_META_M7=STRUCTURAL_UNARY_REACTION_CANDIDATE_GREEN",
  "MATCHES=STRUCTURAL_TEMPLATE_WITH_ROLES",
  "MATCH_DOMAIN=ONE_CURRENT_ENDPOINT",
  "K_PRESERVATION=REACTION_LAW_NOT_PROGRAM_ROLE",
  "EXACT_RULES=ZERO_ROLE_SUBSET",
  "IMAGE_ARITY=ZERO_ONE_MANY",
  "MULTIPLE_MATCHES=ALL_FIRE",
  "POINTWISE_SCOPE_LIFT=SUPPORTED",
  "TRIGGER_INDEX_REQUIRED=FALSE",
  "DYNAMIC_THEORY_ADMISSION=VISIBLE_NEXT_REACTION",
  "CROSS_MEMBER_JOIN=ABSENT",
  "PROGRAM_SPECIFIC_DISPATCH=0",
].join(" "));
