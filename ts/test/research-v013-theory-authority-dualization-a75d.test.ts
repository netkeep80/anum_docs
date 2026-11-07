import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type RootBasis,
} from "../src/memory.js";
import {
  StructuralRuleError,
  admitStructuralRule,
  defineStructuralInterpreter,
  defineStructuralRoleDictionary,
  defineStructuralRule,
  readStructuralRoleDictionary,
  readStructuralRule,
  verifyStructuralRuleAdmission,
} from "../src/structural-rule.js";
import {
  decomposeV013SemanticLink,
} from "../src/v013-hierarchical-carrier.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.13 A75d Theory authority dualization: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}

function distinct(left: LinkHandle, right: LinkHandle, message: string): void {
  assert(left !== right, message);
}

function invertLink(
  memory: Memory,
  basis: RootBasis,
  source: LinkHandle,
  memo = new Map<LinkHandle, LinkHandle>(),
): LinkHandle {
  const known = memo.get(source);
  if (known !== undefined) return known;

  const decomposition = decomposeV013SemanticLink(memory, basis, source);
  let result: LinkHandle;
  if (decomposition.aspect === "ROOT") {
    result = basis.R;
  } else if (decomposition.aspect === "START") {
    result = memory.ensureEndSelfClosed(
      invertLink(memory, basis, decomposition.children[0]!, memo),
    );
  } else if (decomposition.aspect === "END") {
    result = memory.ensureStartSelfClosed(
      invertLink(memory, basis, decomposition.children[0]!, memo),
    );
  } else {
    const left = invertLink(memory, basis, decomposition.children[0]!, memo);
    const right = invertLink(memory, basis, decomposition.children[1]!, memo);
    result = memory.ensure(right, left);
  }

  memo.set(source, result);
  return result;
}

function expectRuleError(
  effect: () => unknown,
  code: StructuralRuleError["code"],
  message: string,
): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof StructuralRuleError, `${message}: StructuralRuleError`);
    same(error.code, code, `${message}: code`);
    return;
  }
  throw new Error(
    `v0.13 A75d Theory authority dualization: ${message}: unexpectedly accepted`,
  );
}

function defineDualRoleDictionary(
  memory: Memory,
  invertedRoleSequence: LinkHandle,
): LinkHandle {
  return memory.ensureEndSelfClosed(invertedRoleSequence);
}

function defineDualRule(
  memory: Memory,
  invertedRoleDictionary: LinkHandle,
  invertedBody: LinkHandle,
): LinkHandle {
  return memory.ensure(invertedBody, invertedRoleDictionary);
}

function defineDualAdmission(
  memory: Memory,
  invertedTheory: LinkHandle,
  invertedRule: LinkHandle,
): LinkHandle {
  return memory.ensure(invertedRule, invertedTheory);
}

function verifyDualAdmission(
  memory: Memory,
  invertedTheory: LinkHandle,
  invertedRule: LinkHandle,
  invertedAdmission: LinkHandle,
): void {
  const poles = memory.poles(invertedAdmission);
  assert(
    poles.start === invertedRule && poles.end === invertedTheory,
    "dual admission is J(Rule) -> J(Theory)",
  );
}

function defineDualInterpreter(
  memory: Memory,
  invertedDictionary: LinkHandle,
  invertedGrammar: LinkHandle,
  invertedTheory: LinkHandle,
): LinkHandle {
  return memory.ensure(
    memory.ensure(invertedTheory, invertedGrammar),
    invertedDictionary,
  );
}

function exercise(noise: boolean): readonly string[] {
  const memory = new Memory();
  const basis = ensureRootBasis(memory);

  if (noise) {
    const n1 = memory.ensure(basis.U, basis.L);
    const n2 = memory.ensure(n1, basis.C);
    memory.ensureStartSelfClosed(n2);
  }

  const dictionary = memory.ensure(basis.L, basis.U);
  const grammar = memory.ensure(basis.C, dictionary);
  const theory = memory.ensure(grammar, basis.L);
  const role = memory.ensure(basis.U, grammar);
  const body = memory.ensure(role, basis.C);

  const roleDictionary = defineStructuralRoleDictionary(memory, [role]);
  const roleDictionaryState = readStructuralRoleDictionary(memory, roleDictionary);
  const rule = defineStructuralRule(memory, roleDictionary, body);
  const admission = admitStructuralRule(memory, theory, rule);
  const interpreter = defineStructuralInterpreter(
    memory,
    dictionary,
    grammar,
    theory,
  );

  verifyStructuralRuleAdmission(memory, theory, rule, admission);

  const jDictionary = invertLink(memory, basis, dictionary);
  const jGrammar = invertLink(memory, basis, grammar);
  const jTheory = invertLink(memory, basis, theory);
  const jRole = invertLink(memory, basis, role);
  const jBody = invertLink(memory, basis, body);
  const jRoleSequence = invertLink(memory, basis, roleDictionaryState.roleSequence);
  const jRoleDictionary = invertLink(memory, basis, roleDictionary);
  const jRule = invertLink(memory, basis, rule);
  const jAdmission = invertLink(memory, basis, admission);
  const jInterpreter = invertLink(memory, basis, interpreter);

  // RoleDictionary is explicitly START(RoleSequence), so J produces its exact
  // END-dual and the current START-only reader rejects it.
  same(
    jRoleDictionary,
    defineDualRoleDictionary(memory, jRoleSequence),
    "J(RoleDictionary) is END(J(RoleSequence))",
  );
  same(
    decomposeV013SemanticLink(memory, basis, jRoleDictionary).aspect,
    "END",
    "inverted RoleDictionary is END-shaped",
  );
  expectRuleError(
    () => readStructuralRoleDictionary(memory, jRoleDictionary),
    "invalid-role-dictionary",
    "current RoleDictionary reader rejects J(RoleDictionary)",
  );

  // Current Rule convention is RoleDictionary -> Body.
  // Recursive inversion is J(Body) -> J(RoleDictionary).
  same(
    jRule,
    defineDualRule(memory, jRoleDictionary, jBody),
    "J(Rule) is exact body-to-roleDictionary dual",
  );
  const currentReadOfJRule = readStructuralRule(memory, jRule);
  same(
    currentReadOfJRule.roleDictionary,
    jBody,
    "current Rule reader sees J(Body) in roleDictionary position",
  );
  same(
    currentReadOfJRule.body,
    jRoleDictionary,
    "current Rule reader sees J(RoleDictionary) in body position",
  );

  // Theory admission T -> Rule is orientation-selecting.
  same(
    jAdmission,
    defineDualAdmission(memory, jTheory, jRule),
    "J(T->Rule) is J(Rule)->J(T)",
  );
  verifyDualAdmission(memory, jTheory, jRule, jAdmission);
  expectRuleError(
    () => verifyStructuralRuleAdmission(memory, jTheory, jRule, jAdmission),
    "rule-not-admitted",
    "current admission verifier rejects recursively inverted admission",
  );
  assert(
    memory.incoming(jTheory).includes(jAdmission),
    "dual admission is incoming to J(Theory)",
  );
  assert(
    !memory.outgoing(jTheory).includes(jAdmission),
    "dual admission is not current outgoing Theory authority",
  );

  // Structural interpreter D -> (G -> T) also has an exact dual topology.
  same(
    jInterpreter,
    defineDualInterpreter(memory, jDictionary, jGrammar, jTheory),
    "J(Interpreter) is (J(T)->J(G))->J(D)",
  );
  const currentDualCandidate = defineStructuralInterpreter(
    memory,
    jDictionary,
    jGrammar,
    jTheory,
  );
  distinct(
    jInterpreter,
    currentDualCandidate,
    "current interpreter constructor is not invariant under J",
  );

  // Generic Theory membership has the same directional obstruction as Rule
  // admission; it is not specific to StructuralRule bodies.
  const member = memory.ensure(role, dictionary);
  const membership = memory.ensure(theory, member);
  const jMember = invertLink(memory, basis, member);
  const jMembership = invertLink(memory, basis, membership);
  const jMembershipPoles = memory.poles(jMembership);
  same(jMembershipPoles.start, jMember, "J(T->member) starts at J(member)");
  same(jMembershipPoles.end, jTheory, "J(T->member) ends at J(T)");

  // Involution restores the accepted orientation exactly.
  same(invertLink(memory, basis, jRoleDictionary), roleDictionary, "J² RoleDictionary");
  same(invertLink(memory, basis, jRule), rule, "J² Rule");
  same(invertLink(memory, basis, jAdmission), admission, "J² admission");
  same(invertLink(memory, basis, jInterpreter), interpreter, "J² interpreter");
  verifyStructuralRuleAdmission(
    memory,
    invertLink(memory, basis, jTheory),
    invertLink(memory, basis, jRule),
    invertLink(memory, basis, jAdmission),
  );

  return Object.freeze([
    `ROLE:${decomposeV013SemanticLink(memory,basis,roleDictionary).aspect}->${decomposeV013SemanticLink(memory,basis,jRoleDictionary).aspect}`,
    "RULE:ROLE_TO_BODY->JBODY_TO_JROLE",
    "ADMISSION:T_TO_RULE->JRULE_TO_JT",
    "INTERPRETER:D_TO_G_T->JT_JG_TO_JD",
    "CURRENT_AUTHORITY_READER:REJECTS_DUAL",
    `JROLE:${jRole===role?"fixed":"mapped"}`,
  ]);
}

function staticGuards(): void {
  const root = resolve(process.cwd(), "..");
  const structural = readFileSync(join(root, "ts/src/structural-rule.ts"), "utf8");
  const portable = readFileSync(join(root, "ts/src/portable-theory.ts"), "utf8");

  assert(
    structural.includes("poles.start !== theory || poles.end !== rule"),
    "current StructuralRule admission authority is T -> Rule",
  );
  assert(
    structural.includes("dictionary.start !== roleDictionary || dictionary.end === roleDictionary"),
    "current RoleDictionary reader is proper START-only",
  );
  assert(
    portable.includes("memory.outgoing(theory)"),
    "portable Theory support selects outgoing Theory authority",
  );
}

function main(): void {
  const clean = exercise(false);
  const noisy = exercise(true);

  same(
    JSON.stringify(noisy),
    JSON.stringify(clean),
    "Theory authority dualization survives allocation noise",
  );
  staticGuards();

  console.log([
    "MTS v0.13 A75d: THEORY_AUTHORITY_DUALIZATION=GREEN_SCOPED_RESEARCH",
    "FRM_02_ROLE_DICTIONARY=START_TO_END_DUAL",
    "FRM_02_RULE=ROLE_TO_BODY_MAPS_TO_JBODY_TO_JROLE",
    "FRM_02_THEORY_ADMISSION=T_TO_RULE_MAPS_TO_JRULE_TO_JT",
    "FRM_02_INTERPRETER=D_TO_G_T_MAPS_TO_JT_JG_TO_JD",
    "CURRENT_ROLE_DICTIONARY_READER_ON_DUAL=REJECTS",
    "CURRENT_THEORY_ADMISSION_VERIFIER_ON_DUAL=REJECTS",
    "PORTABLE_THEORY_OUTGOING_AUTHORITY_ON_DUAL=DOES_NOT_SEE_J_ADMISSION",
    "J2_AUTHORITY=EXACT_ACCEPTED_ORIENTATION",
    "THEORY_DUALIZATION=CONFIRMED_AT_STRUCTURAL_AUTHORITY_LAYER",
    "GROUNDED_EXECUTION_DUALIZATION=NOT_YET_CLASSIFIED",
  ].join(" "));
}

main();
