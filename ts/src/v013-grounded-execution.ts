import {
  ExactSequenceError,
  readExactSequence,
} from "./exact-sequence.js";
import {
  Memory,
  type LinkHandle,
} from "./memory.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`v0.13 grounded execution: ${message}`);
  }
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), message);
}

export interface V013GroundedScopeAuthority {
  readonly theory: LinkHandle;
}

/**
 * Link-native current working Scope for already-grounded relational execution.
 *
 *   scope = START(seed -> Theory)
 *   scope -> currentTruth
 *
 * Currentness itself remains the opaque mutable A-memory root established by
 * A72n/A73g; it is intentionally not reconstructed from append-only history.
 */
export function defineV013GroundedExecutionScope(
  memory: Memory,
  seed: LinkHandle,
  theory: LinkHandle,
  members: readonly LinkHandle[],
): LinkHandle {
  const scope = memory.ensureStartSelfClosed(memory.ensure(seed, theory));
  for (const member of members) memory.ensure(scope, member);
  return scope;
}

export function readV013GroundedExecutionScopeAuthority(
  memory: Memory,
  scope: LinkHandle,
): V013GroundedScopeAuthority {
  const header = memory.poles(scope);
  assert(
    header.start === scope && header.end !== scope,
    "grounded working Scope must have START shape",
  );
  const descriptor = memory.poles(header.end);
  return Object.freeze({ theory: descriptor.end });
}

export function readV013GroundedExecutionScope(
  memory: Memory,
  scope: LinkHandle,
): readonly LinkHandle[] {
  readV013GroundedExecutionScopeAuthority(memory, scope);
  const members: LinkHandle[] = [];

  for (const attachment of memory.outgoing(scope)) {
    if (attachment === scope) continue;
    const poles = memory.poles(attachment);
    if (poles.start !== scope) continue;
    if (!members.includes(poles.end)) members.push(poles.end);
  }

  return Object.freeze(members);
}

/**
 * Opaque mutable A-memory selector for the current grounded Scope.
 *
 * The cursor contains no relation discovery, Rule matching, program dispatch,
 * Theory mutation, or Link write. It only commits one already-built successor
 * Scope as current.
 */
export class V013GroundedScopeCursor {
  constructor(
    private readonly memory: Memory,
    private scope: LinkHandle,
  ) {
    readV013GroundedExecutionScope(memory, scope);
  }

  currentScope(): LinkHandle {
    return this.scope;
  }

  members(): readonly LinkHandle[] {
    return readV013GroundedExecutionScope(this.memory, this.scope);
  }

  switchAtomically(expectedOld: LinkHandle, next: LinkHandle): void {
    same(this.scope, expectedOld, "current grounded Scope root changed concurrently");
    readV013GroundedExecutionScope(this.memory, next);
    this.scope = next;
  }
}

export interface V013GroundedRelationImage {
  readonly admission: LinkHandle;
  readonly relation: LinkHandle;
  readonly outputs: readonly LinkHandle[];
}

/**
 * Current Theory is the complete executable authority frontier.
 *
 *   admission = Theory -> relation
 *   relation  = A -> exactSequence(B...)
 *
 * There is deliberately no separately authored A -> admission activation
 * index. A generated Theory -> relation Link can therefore become executable
 * immediately from the same live Memory.
 */
export function discoverV013GroundedTheoryImages(
  memory: Memory,
  theory: LinkHandle,
  antecedent: LinkHandle,
): readonly V013GroundedRelationImage[] {
  const found: V013GroundedRelationImage[] = [];

  for (const admission of memory.outgoing(theory)) {
    if (admission === theory) continue;

    const admissionPoles = memory.poles(admission);
    if (
      admissionPoles.start !== theory ||
      admissionPoles.end === admission
    ) {
      continue;
    }

    const relation = admissionPoles.end;
    const relationPoles = memory.poles(relation);
    if (relationPoles.start !== antecedent) continue;

    try {
      found.push(Object.freeze({
        admission,
        relation,
        outputs: readExactSequence(memory, relationPoles.end).values,
      }));
    } catch (error) {
      if (error instanceof ExactSequenceError) continue;
      throw error;
    }
  }

  return Object.freeze(found);
}

export interface V013GroundedScopeReaction {
  readonly oldScope: LinkHandle;
  readonly nextScope: LinkHandle;
  readonly oldMembers: readonly LinkHandle[];
  readonly nextMembers: readonly LinkHandle[];
  readonly matchedRelations: number;
  readonly transitionedMembers: number;
  readonly quiescent: boolean;
  readonly handoffCount: 0 | 1;
}

/**
 * Generalized grounded relational reaction:
 *
 *   K -> A
 *   Theory -> (A -> exactSequence(B_j))
 *   ------------------------------------
 *   K -> B_j
 *
 * - absent admitted relation: preserve current truth;
 * - admitted empty exact sequence: remove current truth from successor Scope;
 * - all admitted images fire;
 * - canonical Link identity collapses convergent duplicate outputs;
 * - generated Theory admissions are visible through live Memory;
 * - current Scope membership remains fixed until one atomic handoff.
 */
export function reactV013GroundedScope(
  memory: Memory,
  cursor: V013GroundedScopeCursor,
  nextScopeSeed: LinkHandle,
): V013GroundedScopeReaction {
  const oldScope = cursor.currentScope();
  const { theory } = readV013GroundedExecutionScopeAuthority(memory, oldScope);
  const before = cursor.members();
  const after: LinkHandle[] = [];
  const add = (link: LinkHandle): void => {
    if (!after.includes(link)) after.push(link);
  };

  let matchedRelations = 0;
  let transitionedMembers = 0;

  for (const member of before) {
    const truth = memory.poles(member);
    const images = discoverV013GroundedTheoryImages(
      memory,
      theory,
      truth.end,
    );

    if (images.length === 0) {
      add(member);
      continue;
    }

    transitionedMembers += 1;
    matchedRelations += images.length;

    for (const image of images) {
      for (const output of image.outputs) {
        add(memory.ensure(truth.start, output));
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
    oldScope,
    nextScope,
    oldMembers: before,
    nextMembers: Object.freeze(after),
    matchedRelations,
    transitionedMembers,
    quiescent: false,
    handoffCount: 1,
  });
}
