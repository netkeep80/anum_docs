import { exportCanonicalTopology } from "../src/canonical-topology.js";
import {
  materializeExactSequence,
  readExactSequence,
} from "../src/exact-sequence.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type ReadMemory,
  type WriteMemory,
} from "../src/memory.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

type QueryErrorCode =
  | "invalid-query"
  | "invalid-path-step"
  | "constraint-mismatch"
  | "underdetermined"
  | "replay-wrote";

class QueryError extends Error {
  override readonly name = "QueryError";

  constructor(readonly code: QueryErrorCode) {
    super(code);
  }
}

type PoleDirection = "start" | "end";

interface IncidenceSignature {
  readonly startSelf: boolean;
  readonly endSelf: boolean;
}

interface DecodedCorrespondence {
  readonly directions: readonly PoleDirection[];
  readonly value: LinkHandle;
}

interface DecodedQuery {
  readonly selectedRoot: LinkHandle;
  readonly correspondences: readonly DecodedCorrespondence[];
  readonly preserveForms: readonly (readonly PoleDirection[])[];
}

interface ConstraintNode {
  readonly directValues: LinkHandle[];
  preserve?: IncidenceSignature;
  start?: ConstraintNode;
  end?: ConstraintNode;
}

function expectQueryError(effect: () => unknown, code: QueryErrorCode): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof QueryError, `expected QueryError(${code})`);
    same(error.code, code, "query rejection code");
    return;
  }
  throw new Error(`expected QueryError(${code})`);
}

function incidence(memory: ReadMemory, link: LinkHandle): IncidenceSignature {
  const poles = memory.poles(link);
  return Object.freeze({
    startSelf: poles.start === link,
    endSelf: poles.end === link,
  });
}

function sameIncidence(left: IncidenceSignature, right: IncidenceSignature): boolean {
  return left.startSelf === right.startSelf && left.endSelf === right.endSelf;
}

/**
 * A path step derives its pole direction from its own one-pole self-incidence.
 * No host opcode/tag says START or END.
 */
function readPath(memory: ReadMemory, path: LinkHandle): readonly PoleDirection[] {
  let sequence;
  try {
    sequence = readExactSequence(memory, path);
  } catch {
    throw new QueryError("invalid-query");
  }

  const result: PoleDirection[] = [];
  for (const step of sequence.values) {
    const signature = incidence(memory, step);
    if (signature.startSelf === signature.endSelf) {
      throw new QueryError("invalid-path-step");
    }
    result.push(signature.startSelf ? "start" : "end");
  }
  return Object.freeze(result);
}

function navigateDirections(
  memory: ReadMemory,
  root: LinkHandle,
  directions: readonly PoleDirection[],
): LinkHandle {
  let current = root;
  for (const direction of directions) {
    const poles = memory.poles(current);
    current = direction === "start" ? poles.start : poles.end;
  }
  return current;
}

function navigate(memory: ReadMemory, root: LinkHandle, path: LinkHandle): LinkHandle {
  return navigateDirections(memory, root, readPath(memory, path));
}

function decodeQuery(memory: ReadMemory, query: LinkHandle): DecodedQuery {
  let top;
  try {
    top = readExactSequence(memory, query);
  } catch {
    throw new QueryError("invalid-query");
  }
  if (top.values.length !== 3) throw new QueryError("invalid-query");

  const selectedRoot = top.values[0];
  const correspondenceSequence = top.values[1];
  const preserveFormSequence = top.values[2];
  if (
    selectedRoot === undefined ||
    correspondenceSequence === undefined ||
    preserveFormSequence === undefined
  ) {
    throw new QueryError("invalid-query");
  }

  let correspondenceLinks;
  let preservePaths;
  try {
    correspondenceLinks = readExactSequence(memory, correspondenceSequence).values;
    preservePaths = readExactSequence(memory, preserveFormSequence).values;
  } catch {
    throw new QueryError("invalid-query");
  }

  const correspondences: DecodedCorrespondence[] = [];
  for (const relation of correspondenceLinks) {
    const poles = memory.poles(relation);
    correspondences.push(
      Object.freeze({
        directions: readPath(memory, poles.start),
        value: poles.end,
      }),
    );
  }

  return Object.freeze({
    selectedRoot,
    correspondences: Object.freeze(correspondences),
    preserveForms: Object.freeze(preservePaths.map((path) => readPath(memory, path))),
  });
}

function newConstraintNode(): ConstraintNode {
  return { directValues: [] };
}

function nodeAt(root: ConstraintNode, directions: readonly PoleDirection[]): ConstraintNode {
  let current = root;
  for (const direction of directions) {
    if (direction === "start") {
      current.start ??= newConstraintNode();
      current = current.start;
    } else {
      current.end ??= newConstraintNode();
      current = current.end;
    }
  }
  return current;
}

/**
 * Conservative uniqueness proof for this bounded corpus. A direct value pins a
 * place. Otherwise an unconstrained/ordinary node needs both poles grounded;
 * a preserved proper START needs its external end; proper END needs its start;
 * FULL is the unique fully self-closed Link in canonical Memory.
 *
 * This is deliberately fail-closed. It may reject future solvable query shapes
 * rather than invent a search/order semantics that is not presented in Links.
 */
function uniquelyGrounded(node: ConstraintNode): boolean {
  if (node.directValues.length > 0) {
    const first = node.directValues[0];
    return first !== undefined && node.directValues.every((value) => value === first);
  }

  const signature = node.preserve;
  if (signature !== undefined) {
    if (signature.startSelf && signature.endSelf) return true;
    if (signature.startSelf && !signature.endSelf) {
      return node.end !== undefined && uniquelyGrounded(node.end);
    }
    if (!signature.startSelf && signature.endSelf) {
      return node.start !== undefined && uniquelyGrounded(node.start);
    }
  }

  return (
    node.start !== undefined &&
    node.end !== undefined &&
    uniquelyGrounded(node.start) &&
    uniquelyGrounded(node.end)
  );
}

/**
 * One generic read-only verifier for all Q variants. Query meaning comes from
 * the Link carrier: exact paths, path/value relations, and explicit paths whose
 * source incidence form must be preserved in the candidate result.
 */
function verifyResolvedQuery(
  memory: ReadMemory,
  query: LinkHandle,
  candidate: LinkHandle,
): void {
  const before = memory.linkCount;
  try {
    const decoded = decodeQuery(memory, query);
    const constraints = newConstraintNode();

    for (const correspondence of decoded.correspondences) {
      const actual = navigateDirections(memory, candidate, correspondence.directions);
      if (actual !== correspondence.value) {
        throw new QueryError("constraint-mismatch");
      }
      nodeAt(constraints, correspondence.directions).directValues.push(correspondence.value);
    }

    for (const directions of decoded.preserveForms) {
      const sourceNode = navigateDirections(memory, decoded.selectedRoot, directions);
      const candidateNode = navigateDirections(memory, candidate, directions);
      const required = incidence(memory, sourceNode);
      if (!sameIncidence(required, incidence(memory, candidateNode))) {
        throw new QueryError("constraint-mismatch");
      }

      const node = nodeAt(constraints, directions);
      if (node.preserve !== undefined && !sameIncidence(node.preserve, required)) {
        throw new QueryError("constraint-mismatch");
      }
      node.preserve = required;
    }

    if (!uniquelyGrounded(constraints)) {
      throw new QueryError("underdetermined");
    }
  } finally {
    if (memory.linkCount !== before) {
      throw new QueryError("replay-wrote");
    }
  }
}

function path(memory: WriteMemory, steps: readonly LinkHandle[]): LinkHandle {
  return materializeExactSequence(memory, steps);
}

function query(
  memory: WriteMemory,
  selectedRoot: LinkHandle,
  correspondences: readonly (readonly [LinkHandle, LinkHandle])[],
  preserveForms: readonly LinkHandle[],
): LinkHandle {
  const relations = correspondences.map(([place, value]) => memory.ensure(place, value));
  const correspondenceSequence = materializeExactSequence(memory, relations);
  const preserveFormSequence = materializeExactSequence(memory, preserveForms);
  return materializeExactSequence(memory, [
    selectedRoot,
    correspondenceSequence,
    preserveFormSequence,
  ]);
}

// Q1/Q2/Q3 and P1-P6 share one selected proper START source b = ♂U.
{
  const memory = new Memory();
  const { R, O, C, L, U } = ensureRootBasis(memory);
  const b = memory.ensureStartSelfClosed(U);

  const pEmpty = path(memory, []);
  const pStart = path(memory, [O]);
  const pEnd = path(memory, [C]);
  const pStartStart = path(memory, [O, O]);

  // P1: exact places remain structurally distinct although self-incidence makes
  // all three navigations reach the same semantic Link b.
  assert(pEmpty !== pStart, "epsilon and start path carriers must differ");
  assert(pStart !== pStartStart, "start and start-start path carriers must differ");
  same(navigate(memory, b, pEmpty), b, "epsilon reaches b");
  same(navigate(memory, b, pStart), b, "start reaches self-closed b");
  same(navigate(memory, b, pStartStart), b, "start-start reaches self-closed b");

  // Q1: whole correspondence pins the result directly.
  const q1 = query(memory, b, [[pEmpty, L]], []);
  verifyResolvedQuery(memory, q1, L);
  expectQueryError(() => verifyResolvedQuery(memory, q1, R), "constraint-mismatch");

  // Q2: independently constrained poles define a new ordered-pair result. The
  // source proper-START incidence is not inherited because no preserve-form
  // obligation was presented.
  const q2 = query(
    memory,
    b,
    [
      [pStart, L],
      [pEnd, R],
    ],
    [],
  );
  const q2Result = memory.ensure(L, R);
  verifyResolvedQuery(memory, q2, q2Result);
  expectQueryError(() => verifyResolvedQuery(memory, q2, O), "constraint-mismatch");

  // Q3/P6: preserve the source root's exact proper-START incidence while the
  // external end corresponds to R. O accepts; FULL R rejects.
  const q3 = query(memory, b, [[pEnd, R]], [pEmpty]);
  verifyResolvedQuery(memory, q3, O);
  expectQueryError(() => verifyResolvedQuery(memory, q3, R), "constraint-mismatch");

  // P2: source-value equality at epsilon/start does not merge the places or
  // force equal correspondence values. L is consistent with epsilon->L and
  // start->O because start(L)=O.
  same(navigate(memory, b, pEmpty), navigate(memory, b, pStart), "source values coincide");
  const p2 = query(
    memory,
    b,
    [
      [pEmpty, L],
      [pStart, O],
    ],
    [],
  );
  verifyResolvedQuery(memory, p2, L);

  // P3: one exact place cannot simultaneously have incompatible values.
  const p3 = query(
    memory,
    b,
    [
      [pEmpty, L],
      [pEmpty, R],
    ],
    [],
  );
  expectQueryError(() => verifyResolvedQuery(memory, p3, L), "constraint-mismatch");
  expectQueryError(() => verifyResolvedQuery(memory, p3, R), "constraint-mismatch");

  // P4: whole+child constraints are simultaneous, not imperative edits.
  const p4Compatible = query(
    memory,
    b,
    [
      [pEmpty, L],
      [pStart, O],
    ],
    [],
  );
  verifyResolvedQuery(memory, p4Compatible, L);

  const p4Conflict = query(
    memory,
    b,
    [
      [pEmpty, L],
      [pStart, R],
    ],
    [],
  );
  expectQueryError(() => verifyResolvedQuery(memory, p4Conflict, L), "constraint-mismatch");

  // P5: overlapping start/start-start paths obey the same simultaneous law.
  const p5Compatible = query(
    memory,
    b,
    [
      [pStart, O],
      [pStartStart, O],
      [pEnd, C],
    ],
    [],
  );
  verifyResolvedQuery(memory, p5Compatible, L);

  const p5Conflict = query(
    memory,
    b,
    [
      [pStart, O],
      [pStartStart, R],
      [pEnd, C],
    ],
    [],
  );
  expectQueryError(() => verifyResolvedQuery(memory, p5Conflict, L), "constraint-mismatch");

  // A path step must itself select exactly one pole by self-incidence. FULL R
  // and ordinary L do not provide a direction and therefore fail closed.
  const badFullStep = path(memory, [R]);
  const badOrdinaryStep = path(memory, [L]);
  const badFullQuery = query(memory, b, [[badFullStep, L]], []);
  const badOrdinaryQuery = query(memory, b, [[badOrdinaryStep, L]], []);
  expectQueryError(() => verifyResolvedQuery(memory, badFullQuery, L), "invalid-path-step");
  expectQueryError(
    () => verifyResolvedQuery(memory, badOrdinaryQuery, L),
    "invalid-path-step",
  );

  // An unconstrained candidate may satisfy the empty relation vacuously but is
  // not a determined result. The verifier must not promote that to success.
  const underdetermined = query(memory, b, [], []);
  expectQueryError(() => verifyResolvedQuery(memory, underdetermined, L), "underdetermined");
}

interface CrossMemoryFixture {
  readonly memory: Memory;
  readonly query: LinkHandle;
  readonly source: LinkHandle;
  readonly O: LinkHandle;
  readonly R: LinkHandle;
}

function q3Fixture(sourceFirst: boolean): CrossMemoryFixture {
  const memory = new Memory();
  const { R, O, C, U } = ensureRootBasis(memory);

  let source: LinkHandle | undefined;
  let pEnd: LinkHandle | undefined;
  let correspondenceSequence: LinkHandle | undefined;
  let preserveFormSequence: LinkHandle | undefined;

  if (sourceFirst) {
    source = memory.ensureStartSelfClosed(U);
  }

  pEnd = path(memory, [C]);
  const relation = memory.ensure(pEnd, R);
  correspondenceSequence = materializeExactSequence(memory, [relation]);
  preserveFormSequence = materializeExactSequence(memory, [R]);

  if (!sourceFirst) {
    source = memory.ensureStartSelfClosed(U);
  }

  assert(source !== undefined, "source must be materialized");
  assert(correspondenceSequence !== undefined, "correspondence sequence must exist");
  assert(preserveFormSequence !== undefined, "preserve-form sequence must exist");

  const q = materializeExactSequence(memory, [
    source,
    correspondenceSequence,
    preserveFormSequence,
  ]);
  return Object.freeze({ memory, query: q, source, O, R });
}

// P7: the same query structure built in independent Memories has different
// runtime handles/allocation coordinates but identical canonical topology and
// the same verifier verdict.
{
  const a = q3Fixture(true);
  const b = q3Fixture(false);

  assert(a.query !== b.query, "independent Memories must not share query handles");
  assert(
    a.memory.issuanceIndex(a.source) !== b.memory.issuanceIndex(b.source),
    "construction order should alter a runtime allocation coordinate",
  );

  same(
    JSON.stringify(exportCanonicalTopology(a.memory).topology),
    JSON.stringify(exportCanonicalTopology(b.memory).topology),
    "cross-memory canonical query topology",
  );

  verifyResolvedQuery(a.memory, a.query, a.O);
  verifyResolvedQuery(b.memory, b.query, b.O);
  expectQueryError(() => verifyResolvedQuery(a.memory, a.query, a.R), "constraint-mismatch");
  expectQueryError(() => verifyResolvedQuery(b.memory, b.query, b.R), "constraint-mismatch");
}
