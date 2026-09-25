import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { materializeExactSequence } from "../src/exact-sequence.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
} from "../src/memory.js";
import {
  V013GroundedScopeCursor,
  defineV013GroundedExecutionScope,
  readV013GroundedExecutionScope,
  reactV013GroundedScope,
} from "../src/v013-grounded-execution.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error("post-v0.13 #1558 E2/W2/W3: " + message);
  }
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), message + ": values differ");
}

function sameMembers(
  actual: readonly LinkHandle[],
  expected: readonly LinkHandle[],
  message: string,
): void {
  same(actual.length, expected.length, message + ": cardinality");
  for (const member of expected) {
    assert(actual.includes(member), message + ": missing member");
  }
}

function admit(
  memory: Memory,
  theory: LinkHandle,
  antecedent: LinkHandle,
  outputs: readonly LinkHandle[],
): LinkHandle {
  const sequence = materializeExactSequence(memory, outputs);
  const relation = memory.ensure(antecedent, sequence);
  memory.ensure(theory, relation);
  return relation;
}

function exercise(): void {
  const memory = new Memory();
  const basis = ensureRootBasis(memory);

  let seed = memory.ensure(basis.U, basis.L);
  const refs: LinkHandle[] = [];
  for (let i = 0; i < 96; i += 1) {
    seed = memory.ensure(seed, i % 2 === 0 ? basis.O : basis.C);
    refs.push(seed);
  }
  const at = (index: number): LinkHandle => {
    const value = refs[index];
    assert(value !== undefined, "fresh anchor " + index);
    return value;
  };

  const theory = memory.ensure(at(0), at(1));

  const KNone = memory.ensure(at(2), at(3));
  const KZero = memory.ensure(at(4), at(5));
  const KOne = memory.ensure(at(6), at(7));
  const KMany = memory.ensure(at(8), at(9));
  const KProbe = memory.ensure(at(10), at(11));
  const KMixed = memory.ensure(at(12), at(13));

  const ANone = memory.ensure(at(14), at(15));
  const AZero = memory.ensure(at(16), at(17));
  const AOne = memory.ensure(at(18), at(19));
  const AMany = memory.ensure(at(20), at(21));
  const AProbe = memory.ensure(at(22), at(23));
  const AMixed = memory.ensure(at(24), at(25));

  const BOne = memory.ensure(at(26), at(27));
  const BMany1 = memory.ensure(at(28), at(29));
  const BMany2 = memory.ensure(at(30), at(31));
  const BMany3 = memory.ensure(at(32), at(33));
  const BProbe = memory.ensure(at(34), at(35));
  const BMissingProbe = memory.ensure(at(36), at(37));
  const BMixed = memory.ensure(at(38), at(39));

  admit(memory, theory, AZero, []);
  admit(memory, theory, AOne, [BOne]);

  // MANY is extensional across both sequence positions and multiple admitted
  // relations; duplicate BMany1 must collapse canonically.
  admit(memory, theory, AMany, [BMany1, BMany2, BMany1]);
  admit(memory, theory, AMany, [BMany3]);

  // A specific materialized relation query can be NOT_FOUND even while another
  // admitted relation for the same antecedent exists. Such NOT_FOUND cannot be
  // the semantic preservation condition.
  admit(memory, theory, AProbe, [BProbe]);
  const missingProbeSequence =
    materializeExactSequence(memory, [BMissingProbe]);
  same(
    memory.find(AProbe, missingProbeSequence),
    undefined,
    "specific AProbe -> [BMissingProbe] query is NOT_FOUND",
  );

  // ZERO contributes no outputs, but it does not veto another admitted image.
  admit(memory, theory, AMixed, []);
  admit(memory, theory, AMixed, [BMixed]);

  const oldMembers = [
    memory.ensure(KNone, ANone),
    memory.ensure(KZero, AZero),
    memory.ensure(KOne, AOne),
    memory.ensure(KMany, AMany),
    memory.ensure(KProbe, AProbe),
    memory.ensure(KMixed, AMixed),
  ];

  const oldScope =
    defineV013GroundedExecutionScope(memory, at(40), theory, oldMembers);
  const cursor = new V013GroundedScopeCursor(memory, oldScope);
  const reaction = reactV013GroundedScope(memory, cursor, at(41));

  same(reaction.oldScope, oldScope, "reaction old Scope");
  same(reaction.matchedRelations, 7, "all seven admitted relation images fire");
  same(reaction.transitionedMembers, 5,
    "every member except no-admitted-relation member transitions");
  same(reaction.handoffCount, 1, "one complete successor publication");
  assert(!reaction.quiescent, "W2 mixed reaction is active");

  const preserved = memory.ensure(KNone, ANone);
  const expected = [
    preserved,
    memory.ensure(KOne, BOne),
    memory.ensure(KMany, BMany1),
    memory.ensure(KMany, BMany2),
    memory.ensure(KMany, BMany3),
    memory.ensure(KProbe, BProbe),
    memory.ensure(KMixed, BMixed),
  ];
  sameMembers(reaction.nextMembers, expected,
    "NO_RELATION/ZERO/ONE/MANY exact successor state");
  sameMembers(cursor.members(), expected,
    "published current state equals complete successor");

  assert(!cursor.members().includes(memory.ensure(KZero, AZero)),
    "explicit ZERO removes old truth from current semantic state");
  assert(!cursor.members().includes(memory.ensure(KOne, AOne)),
    "ONE replaces old current truth");
  assert(!cursor.members().includes(memory.ensure(KMany, AMany)),
    "MANY replaces old current truth");
  assert(!cursor.members().includes(memory.ensure(KProbe, AProbe)),
    "specific NOT_FOUND does not preserve when another relation is admitted");
  assert(!cursor.members().includes(memory.ensure(KMixed, AMixed)),
    "mixed ZERO+nonzero relation replaces old truth");
  assert(cursor.members().includes(preserved),
    "no admitted relation under selected Theory preserves old truth");

  // W3: semantic replacement/removal is only successor-Scope membership.
  // Every historical truth and the complete old Scope remain physically
  // readable/canonical after publication.
  sameMembers(
    readV013GroundedExecutionScope(memory, oldScope),
    oldMembers,
    "old Scope remains physically readable",
  );
  for (const oldMember of oldMembers) {
    const poles = memory.poles(oldMember);
    same(
      memory.ensure(poles.start, poles.end),
      oldMember,
      "historical truth remains canonical physical Link",
    );
  }

  same(cursor.currentScope(), reaction.nextScope,
    "successor Scope is the one published current root");
  assert(cursor.currentScope() !== oldScope,
    "historical Scope is no longer current");
}

function staticGuards(): void {
  const root = resolve(process.cwd(), "..");
  const production = readFileSync(
    join(root, "ts/src/v013-grounded-execution.ts"),
    "utf8",
  );
  const start = production.indexOf("export function reactV013GroundedScope(");
  assert(start >= 0, "production grounded reaction exists");
  const kernel = production.slice(start);

  assert(
    kernel.includes("if (images.length === 0)"),
    "preservation is absence of admitted images for current antecedent",
  );
  assert(
    kernel.includes("add(member)"),
    "no-admitted-relation member is preserved",
  );
  assert(
    kernel.includes("for (const image of images)"),
    "all admitted relation images participate",
  );
  assert(
    kernel.includes("for (const output of image.outputs)"),
    "each exact output image contributes successors",
  );
  assert(
    !kernel.includes("memory.delete"),
    "semantic replacement requires no physical Link deletion",
  );

  const a73h = readFileSync(
    join(root, "ts/test/research-v013-grounded-relational-execution-a73h.test.ts"),
    "utf8",
  );
  assert(
    a73h.includes("NO_RELATION_PRESERVES_CURRENT_TRUTH=GREEN"),
    "accepted no-relation preservation evidence remains retained",
  );
  assert(
    a73h.includes("EXPLICIT_EMPTY_RELATION_REMOVES_CURRENT_TRUTH=GREEN"),
    "accepted explicit-zero evidence remains retained",
  );

  const e1 = readFileSync(
    join(root, "ts/test/research-post-v013-amemory-currentness-e1-w1.test.ts"),
    "utf8",
  );
  assert(
    e1.includes("E1_LOCAL_CLASSIFICATION=V013_SUFFICIENT"),
    "E1 current-root publication result remains retained",
  );
}

function main(): void {
  exercise();
  staticGuards();

  console.log([
    "POST_V013_1558_E2_W2_W3=GREEN",
    "PRESERVE_CONDITION=NO_ADMITTED_RELATION_FOR_ANTECEDENT_IN_SELECTED_THEORY",
    "GENERIC_NOT_FOUND_EQUALS_NO_ADMITTED_RELATION=FALSE",
    "SPECIFIC_NOT_FOUND_WITH_OTHER_ADMITTED_RELATION=TRANSITIONS",
    "ZERO=EXPLICIT_ADMITTED_EMPTY_IMAGE",
    "ONE=ONE_CANONICAL_SUCCESSOR",
    "MANY=UNION_ALL_ADMITTED_OUTPUTS",
    "MIXED_ZERO_PLUS_NONZERO=NONZERO_UNION_SURVIVES",
    "DUPLICATE_SUCCESSORS=CANONICALLY_COLLAPSED",
    "OLD_SCOPE_PHYSICALLY_PRESENT=TRUE",
    "OLD_TRUTHS_PHYSICALLY_PRESENT=TRUE",
    "PHYSICAL_DELETION_REQUIRED=FALSE",
    "E2_LOCAL_CLASSIFICATION=V013_SUFFICIENT",
    "ISSUE_1558_GLOBAL_CLASSIFICATION=OPEN",
    "ACCEPTED_V013_MUTATED=FALSE",
  ].join(" "));
}

main();
