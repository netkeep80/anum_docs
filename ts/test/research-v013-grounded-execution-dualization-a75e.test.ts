import {
  materializeExactSequence,
} from "../src/exact-sequence.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type RootBasis,
} from "../src/memory.js";
import {
  V013GroundedScopeCursor,
  defineV013GroundedExecutionScope,
  discoverV013GroundedTheoryImages,
  reactV013GroundedScope,
  readV013GroundedExecutionScopeAuthority,
} from "../src/v013-grounded-execution.js";
import {
  decomposeV013SemanticLink,
} from "../src/v013-hierarchical-carrier.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.13 A75e grounded execution dualization: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}

function sameSet(
  actual: readonly LinkHandle[],
  expected: readonly LinkHandle[],
  message: string,
): void {
  assert(actual.length === expected.length, `${message}: length`);
  const set = new Set(actual);
  assert(expected.every((value) => set.has(value)), `${message}: members`);
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

function neutralRefs(
  memory: Memory,
  basis: RootBasis,
  count: number,
): readonly LinkHandle[] {
  const result: LinkHandle[] = [];
  let current = memory.ensure(basis.U, basis.L);
  for (let index = 0; index < count; index += 1) {
    current = index % 2 === 0
      ? memory.ensure(current, basis.C)
      : memory.ensure(basis.O, current);
    result.push(current);
  }
  return Object.freeze(result);
}

function readDualExactSequence(
  memory: Memory,
  root: LinkHandle,
  sequence: LinkHandle,
): readonly LinkHandle[] {
  if (sequence === root) return Object.freeze([]);

  const outer = memory.poles(sequence);
  assert(
    outer.end === sequence && outer.start !== sequence,
    "dual ExactSequence cell is proper END(payload)",
  );
  const payload = memory.poles(outer.start);
  const previous = payload.end;
  const value = payload.start;
  return Object.freeze([
    ...readDualExactSequence(memory, root, previous),
    value,
  ]);
}

function defineDualScope(
  memory: Memory,
  seed: LinkHandle,
  theory: LinkHandle,
  members: readonly LinkHandle[],
): LinkHandle {
  const scope = memory.ensureEndSelfClosed(memory.ensure(theory, seed));
  for (const member of members) memory.ensure(member, scope);
  return scope;
}

function readDualScopeAuthority(
  memory: Memory,
  scope: LinkHandle,
): LinkHandle {
  const header = memory.poles(scope);
  assert(
    header.end === scope && header.start !== scope,
    "dual grounded Scope must have END shape",
  );
  const descriptor = memory.poles(header.start);
  return descriptor.start;
}

function readDualScope(
  memory: Memory,
  scope: LinkHandle,
): readonly LinkHandle[] {
  readDualScopeAuthority(memory, scope);
  const members: LinkHandle[] = [];
  for (const attachment of memory.incoming(scope)) {
    if (attachment === scope) continue;
    const poles = memory.poles(attachment);
    if (poles.end !== scope) continue;
    if (!members.includes(poles.start)) members.push(poles.start);
  }
  return Object.freeze(members);
}

interface DualImage {
  readonly admission: LinkHandle;
  readonly relation: LinkHandle;
  readonly outputs: readonly LinkHandle[];
}

function discoverDualTheoryImages(
  memory: Memory,
  root: LinkHandle,
  theory: LinkHandle,
  antecedent: LinkHandle,
): readonly DualImage[] {
  const found: DualImage[] = [];

  for (const admission of memory.incoming(theory)) {
    if (admission === theory) continue;
    const admissionPoles = memory.poles(admission);
    if (admissionPoles.end !== theory) continue;

    const relation = admissionPoles.start;
    const relationPoles = memory.poles(relation);
    if (relationPoles.end !== antecedent) continue;

    try {
      found.push(Object.freeze({
        admission,
        relation,
        outputs: readDualExactSequence(memory, root, relationPoles.start),
      }));
    } catch {
      // Non-dual-sequence incoming relations are not grounded images.
    }
  }

  return Object.freeze(found);
}

interface DualReaction {
  readonly oldScope: LinkHandle;
  readonly nextScope: LinkHandle;
  readonly oldMembers: readonly LinkHandle[];
  readonly nextMembers: readonly LinkHandle[];
  readonly matchedRelations: number;
  readonly transitionedMembers: number;
}

function reactDualScope(
  memory: Memory,
  root: LinkHandle,
  oldScope: LinkHandle,
  nextScopeSeed: LinkHandle,
): DualReaction {
  const theory = readDualScopeAuthority(memory, oldScope);
  const before = readDualScope(memory, oldScope);
  const after: LinkHandle[] = [];
  const add = (link: LinkHandle): void => {
    if (!after.includes(link)) after.push(link);
  };

  let matchedRelations = 0;
  let transitionedMembers = 0;

  for (const member of before) {
    const truth = memory.poles(member);
    const images = discoverDualTheoryImages(
      memory,
      root,
      theory,
      truth.start,
    );

    if (images.length === 0) {
      add(member);
      continue;
    }

    transitionedMembers += 1;
    matchedRelations += images.length;

    for (const image of images) {
      for (const output of image.outputs) {
        add(memory.ensure(output, truth.end));
      }
    }
  }

  if (matchedRelations === 0) {
    return Object.freeze({
      oldScope,
      nextScope: oldScope,
      oldMembers: before,
      nextMembers: before,
      matchedRelations,
      transitionedMembers,
    });
  }

  return Object.freeze({
    oldScope,
    nextScope: defineDualScope(memory, nextScopeSeed, theory, after),
    oldMembers: before,
    nextMembers: Object.freeze(after),
    matchedRelations,
    transitionedMembers,
  });
}

function expectCurrentScopeRejects(memory: Memory, scope: LinkHandle): void {
  try {
    readV013GroundedExecutionScopeAuthority(memory, scope);
  } catch {
    return;
  }
  throw new Error(
    "v0.13 A75e grounded execution dualization: current Scope reader accepted dual Scope",
  );
}

function exercise(noise: boolean): readonly string[] {
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  const refs = neutralRefs(memory, basis, 16);

  if (noise) {
    memory.ensure(memory.ensure(basis.L, refs[15]!), basis.U);
  }

  const seed = refs[0]!;
  const nextSeed = refs[1]!;
  const theory = refs[2]!;
  const K1 = refs[3]!;
  const K2 = refs[4]!;
  const K3 = refs[5]!;
  const A = refs[6]!;
  const C = refs[7]!;
  const D = refs[8]!;
  const B1 = refs[9]!;
  const B2 = refs[10]!;

  const manySequence = materializeExactSequence(memory, [B1, B2]);
  const manyRelation = memory.ensure(A, manySequence);
  const manyAdmission = memory.ensure(theory, manyRelation);

  const zeroSequence = materializeExactSequence(memory, []);
  const zeroRelation = memory.ensure(C, zeroSequence);
  const zeroAdmission = memory.ensure(theory, zeroRelation);

  const manyTruth = memory.ensure(K1, A);
  const zeroTruth = memory.ensure(K2, C);
  const notFoundTruth = memory.ensure(K3, D);

  const oldScope = defineV013GroundedExecutionScope(
    memory,
    seed,
    theory,
    [manyTruth, zeroTruth, notFoundTruth],
  );
  const oldAttachments = memory
    .outgoing(oldScope)
    .filter((attachment) => attachment !== oldScope);

  const cursor = new V013GroundedScopeCursor(memory, oldScope);
  const reaction = reactV013GroundedScope(memory, cursor, nextSeed);

  const expectedMany1 = memory.ensure(K1, B1);
  const expectedMany2 = memory.ensure(K1, B2);
  sameSet(
    reaction.nextMembers,
    [expectedMany1, expectedMany2, notFoundTruth],
    "current MANY/ZERO/NOT_FOUND result",
  );
  same(reaction.matchedRelations, 2, "current matched relation count");
  same(reaction.transitionedMembers, 2, "current transitioned member count");

  const nextAttachments = memory
    .outgoing(reaction.nextScope)
    .filter((attachment) => attachment !== reaction.nextScope);

  // Materialize the exact recursive image of the old execution state.
  const jOldScope = invertLink(memory, basis, oldScope);
  const jTheory = invertLink(memory, basis, theory);
  const jNextSeed = invertLink(memory, basis, nextSeed);
  invertLink(memory, basis, manyAdmission);
  invertLink(memory, basis, zeroAdmission);
  for (const attachment of oldAttachments) invertLink(memory, basis, attachment);

  // Current execution conventions reject or miss the exact dual state.
  expectCurrentScopeRejects(memory, jOldScope);
  same(
    discoverV013GroundedTheoryImages(
      memory,
      jTheory,
      invertLink(memory, basis, A),
    ).length,
    0,
    "current outgoing Theory discovery does not see dual incoming admission",
  );

  const dual = reactDualScope(memory, basis.R, jOldScope, jNextSeed);

  same(
    dual.nextScope,
    invertLink(memory, basis, reaction.nextScope),
    "dual reaction next Scope is J(current next Scope)",
  );
  sameSet(
    dual.nextMembers,
    reaction.nextMembers.map((member) => invertLink(memory, basis, member)),
    "dual reaction members equal J(current reaction members)",
  );
  same(
    dual.matchedRelations,
    reaction.matchedRelations,
    "dual/current matched relation count",
  );
  same(
    dual.transitionedMembers,
    reaction.transitionedMembers,
    "dual/current transitioned member count",
  );

  // Current next-scope membership attachments also invert exactly into the
  // incoming membership convention produced by dual reaction.
  for (const attachment of nextAttachments) {
    const inverted = invertLink(memory, basis, attachment);
    assert(
      memory.incoming(dual.nextScope).includes(inverted),
      "J(next Scope membership) is incoming dual membership",
    );
  }

  same(
    invertLink(memory, basis, jOldScope),
    oldScope,
    "J² restores accepted grounded Scope",
  );

  return Object.freeze([
    "SCOPE:START->END_DUAL",
    "MEMBERSHIP:SCOPE_TO_TRUTH->JTRUTH_TO_JSCOPE",
    "ADMISSION:T_TO_RELATION->JRELATION_TO_JT",
    "RELATION:A_TO_SEQUENCE->JSEQUENCE_TO_JA",
    "MANY:COMMUTES",
    "ZERO:COMMUTES",
    "NOT_FOUND:PRESERVED",
  ]);
}

function main(): void {
  const clean = exercise(false);
  const noisy = exercise(true);

  same(
    JSON.stringify(noisy),
    JSON.stringify(clean),
    "grounded execution dualization survives allocation noise",
  );

  console.log([
    "MTS v0.13 A75e: GROUNDED_EXECUTION_DUALIZATION=GREEN_SCOPED_RESEARCH",
    "EXE_01_DUAL_REACTION_J_STATE=J_REACTION_STATE",
    "MANY_BRANCH=COMMUTES",
    "ZERO_BRANCH=COMMUTES",
    "NOT_FOUND_BRANCH=COMMUTES",
    "CURRENT_SCOPE_READER_ON_DUAL=REJECTS",
    "CURRENT_THEORY_DISCOVERY_ON_DUAL=NO_MATCH",
    "DUAL_SCOPE=END_JTHEORY_TO_JSEED",
    "DUAL_MEMBERSHIP=JTRUTH_TO_JSCOPE",
    "DUAL_ADMISSION=JRELATION_TO_JTHEORY",
    "DUAL_RELATION=JSEQUENCE_TO_JANTECEDENT",
    "THEORY_DUALIZATION=CONFIRMED_AT_GROUNDED_EXECUTION_LAYER",
  ].join(" "));
}

main();
