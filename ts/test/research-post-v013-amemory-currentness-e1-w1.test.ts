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
    throw new Error("post-v0.13 #1558 E1/W1 currentness: " + message);
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

function exercise(): void {
  const memory = new Memory();
  const b = ensureRootBasis(memory);

  let seed = memory.ensure(b.U, b.L);
  const fresh: LinkHandle[] = [];
  for (let i = 0; i < 48; i += 1) {
    seed = memory.ensure(seed, i % 2 === 0 ? b.O : b.C);
    fresh.push(seed);
  }
  const at = (index: number): LinkHandle => {
    const value = fresh[index];
    assert(value !== undefined, "fresh anchor " + index);
    return value;
  };

  const theory = memory.ensure(at(0), at(1));
  const K = memory.ensure(at(2), at(3));
  const A = memory.ensure(at(4), at(5));
  const B = memory.ensure(at(6), at(7));

  const output = materializeExactSequence(memory, [B]);
  const relation = memory.ensure(A, output);
  memory.ensure(theory, relation);

  const KA = memory.ensure(K, A);
  const KB = memory.ensure(K, B);
  const oldScope =
    defineV013GroundedExecutionScope(memory, at(8), theory, [KA]);
  const cursor = new V013GroundedScopeCursor(memory, oldScope);

  same(cursor.currentScope(), oldScope, "initial publication root");
  sameMembers(cursor.members(), [KA], "initial current semantic state");

  const reaction = reactV013GroundedScope(memory, cursor, at(9));

  same(reaction.oldScope, oldScope, "reaction starts from published Scope");
  same(reaction.matchedRelations, 1, "exactly one admitted A relation");
  same(reaction.transitionedMembers, 1, "exactly one current truth reacts");
  same(reaction.handoffCount, 1, "exactly one atomic handoff");
  assert(!reaction.quiescent, "W1 transition is active");

  same(cursor.currentScope(), reaction.nextScope,
    "successor Scope becomes the published current root");
  assert(reaction.nextScope !== oldScope,
    "successor Scope identity differs from historical Scope");
  sameMembers(cursor.members(), [KB],
    "current semantic state after handoff is K -> B");

  // Semantic replacement does not require physical deletion.
  sameMembers(
    readV013GroundedExecutionScope(memory, oldScope),
    [KA],
    "historical Scope remains physically readable",
  );
  same(memory.ensure(K, A), KA,
    "historical K -> A Link remains canonically present");
  same(memory.ensure(K, B), KB,
    "successor K -> B Link is canonically present");
  assert(!cursor.members().includes(KA),
    "physical K -> A is no longer in the current semantic state");

  // Recheck the A72n falsifier in the exact W1 fixture: append-only
  // CURRENT -> Scope Links cannot replace the publication root by themselves.
  const currentMarker = memory.ensure(at(10), at(11));
  const binding0 = memory.ensure(currentMarker, oldScope);
  const binding1 = memory.ensure(currentMarker, reaction.nextScope);
  assert(binding0 !== binding1,
    "different Scope targets create different canonical bindings");

  const directBindings = memory.outgoing(currentMarker).filter((candidate) => {
    const poles = memory.poles(candidate);
    return poles.start === currentMarker &&
      (poles.end === oldScope || poles.end === reaction.nextScope);
  });
  same(directBindings.length, 2,
    "append-only CURRENT marker retains both old and new candidates");

  // Currentness therefore comes from the accepted A-memory current-root
  // substrate boundary, while Scope membership itself stays Link-carried.
  same(cursor.currentScope(), reaction.nextScope,
    "opaque publication root, not append order, selects current state");
}

function staticGuards(): void {
  const root = resolve(process.cwd(), "..");
  const kernel = readFileSync(
    join(root, "ts/src/v013-grounded-execution.ts"),
    "utf8",
  );
  assert(
    kernel.includes(
      "Currentness itself remains the opaque mutable A-memory root",
    ),
    "accepted production boundary keeps currentness in A-memory substrate",
  );
  assert(
    kernel.includes(
      "current Scope membership remains fixed until one atomic handoff",
    ),
    "production reaction preserves snapshot publication boundary",
  );

  const a72n = readFileSync(
    join(
      root,
      "ts/test/research-v013-append-only-currentness-falsifier-a72n.test.ts",
    ),
    "utf8",
  );
  assert(
    a72n.includes("PLAIN_APPEND_ONLY_CURRENT_BINDING_IS_INSUFFICIENT"),
    "A72n append-only currentness falsifier remains retained",
  );
  assert(
    a72n.includes(
      "MINIMUM_BOUNDARY=MUTABLE_CURRENTNESS_OR_EXTERNAL_ROOT_OR_EXPLICIT_LIFECYCLE_SEMANTICS",
    ),
    "A72n exact minimum boundary remains retained",
  );

  const own = readFileSync(
    join(
      root,
      "ts/test/research-post-v013-amemory-currentness-e1-w1.test.ts",
    ),
    "utf8",
  );
  const implementation = own.slice(
    0,
    own.indexOf("function staticGuards(): void {"),
  );
  for (const forbidden of [
    "Date.now",
    "timestamp",
    "generationNumber",
    "allocationOrder",
    "Math.max",
  ]) {
    assert(
      !implementation.includes(forbidden),
      "W1 introduces no hidden semantic time/order authority: " + forbidden,
    );
  }
}

function main(): void {
  exercise();
  staticGuards();

  console.log([
    "POST_V013_1558_E1_W1=GREEN",
    "W1=K_TO_A_PLUS_ADMITTED_A_TO_B_GIVES_CURRENT_K_TO_B",
    "OLD_SCOPE_PHYSICALLY_PRESENT=TRUE",
    "OLD_TRUTH_PHYSICALLY_PRESENT=TRUE",
    "OLD_TRUTH_SEMANTICALLY_CURRENT=FALSE",
    "SCOPE_MEMBERSHIP_AUTHORITY=LINK_CARRIED",
    "CURRENTNESS_AUTHORITY=OPAQUE_AMEMORY_CURRENT_ROOT",
    "PLAIN_APPEND_ONLY_CURRENT_BINDING=INSUFFICIENT",
    "HOST_LOCAL_VARIABLE_AS_MTS_SEMANTIC_AUTHORITY=FALSE",
    "PHYSICAL_DELETION_REQUIRED=FALSE",
    "E1_LOCAL_CLASSIFICATION=V013_SUFFICIENT",
    "ISSUE_1558_GLOBAL_CLASSIFICATION=OPEN",
    "ACCEPTED_V013_MUTATED=FALSE",
  ].join(" "));
}

main();
