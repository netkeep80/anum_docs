import {
  ExactSequenceError,
  materializeExactSequence,
  readExactSequence,
} from "./exact-sequence.js";
import {
  MemoryError,
  verifyRootBasis,
  type LinkHandle,
  type ReadMemory,
  type RootBasis,
  type WriteMemory,
} from "./memory.js";

export type V013HierarchicalCarrierErrorCode =
  | "invalid-basis"
  | "invalid-carrier"
  | "invalid-wire";

export class V013HierarchicalCarrierError extends Error {
  override readonly name = "V013HierarchicalCarrierError";

  constructor(readonly code: V013HierarchicalCarrierErrorCode) {
    super(code);
  }
}

const ROOT_NODE = 0x00;
const START_NODE = 0x01;
const END_NODE = 0x02;
const PAIR_NODE = 0x03;

function fail(code: V013HierarchicalCarrierErrorCode): never {
  throw new V013HierarchicalCarrierError(code);
}

function requireBasis(memory: ReadMemory, basis: RootBasis): RootBasis {
  try {
    return verifyRootBasis(memory, basis);
  } catch {
    return fail("invalid-basis");
  }
}

function readQuotedNode(
  memory: ReadMemory,
  basis: RootBasis,
  carrier: LinkHandle,
): readonly LinkHandle[] {
  try {
    const sequence = readExactSequence(memory, carrier);
    if (sequence.values.length === 0) return fail("invalid-carrier");

    let namespace: LinkHandle | undefined;
    const values = sequence.values.map((quoted) => {
      const poles = memory.poles(quoted);
      const candidateNamespace = poles.start;
      const namespacePoles = memory.poles(candidateNamespace);

      if (
        namespacePoles.start !== basis.L ||
        namespacePoles.end !== basis.L
      ) {
        return fail("invalid-carrier");
      }

      if (namespace === undefined) namespace = candidateNamespace;
      if (candidateNamespace !== namespace) return fail("invalid-carrier");
      return poles.end;
    });

    return Object.freeze(values);
  } catch (error) {
    if (error instanceof V013HierarchicalCarrierError) throw error;
    if (error instanceof ExactSequenceError || error instanceof MemoryError) {
      return fail("invalid-carrier");
    }
    throw error;
  }
}

/**
 * Read-only canonical physical serialization of the quoted v0.13 hierarchy.
 *
 * Framing bytes are representation opcodes, not MTS abits:
 *
 *   00          ROOT
 *   01 node     START(node)
 *   02 node     END(node)
 *   03 node node PAIR(left,right)
 *
 * Semantic targets are never materialized by this serializer.
 */
export function serializeV013HierarchicalCarrier(
  memory: ReadMemory,
  basis: RootBasis,
  carrier: LinkHandle,
): Uint8Array {
  const verified = requireBasis(memory, basis);
  const before = memory.linkCount;
  const output: number[] = [];
  const active = new Set<LinkHandle>();

  const visit = (node: LinkHandle): void => {
    if (node === verified.R) {
      output.push(ROOT_NODE);
      return;
    }
    if (active.has(node)) return fail("invalid-carrier");
    active.add(node);
    try {
      const values = readQuotedNode(memory, verified, node);

      if (values.length === 2 && values[0] === verified.O) {
        output.push(START_NODE);
        visit(values[1]!);
        return;
      }
      if (values.length === 2 && values[0] === verified.C) {
        output.push(END_NODE);
        visit(values[1]!);
        return;
      }
      if (values.length === 3 && values[0] === verified.L) {
        output.push(PAIR_NODE);
        visit(values[1]!);
        visit(values[2]!);
        return;
      }

      return fail("invalid-carrier");
    } finally {
      active.delete(node);
    }
  };

  try {
    visit(carrier);
    return Uint8Array.from(output);
  } finally {
    if (memory.linkCount !== before) {
      throw new V013HierarchicalCarrierError("invalid-carrier");
    }
  }
}

function materializeQuotedNode(
  memory: WriteMemory,
  basis: RootBasis,
  namespace: LinkHandle,
  values: readonly LinkHandle[],
): LinkHandle {
  const quoted = values.map((value) => memory.ensure(namespace, value));
  return materializeExactSequence(memory, quoted);
}

/**
 * Materialize only the quoted hierarchical representation from canonical bytes.
 * This parser has no authority to materialize the semantic Link described by
 * the carrier.
 */
export function materializeV013HierarchicalCarrier(
  memory: WriteMemory,
  basis: RootBasis,
  bytes: Uint8Array,
): LinkHandle {
  const verified = requireBasis(memory, basis);
  if (!(bytes instanceof Uint8Array)) return fail("invalid-wire");

  // Validate the physical framing completely before any representation write.
  // This recursive walk has no semantic authority; it only checks opcode arity.
  let checked = 0;
  const check = (): void => {
    if (checked >= bytes.length) return fail("invalid-wire");
    const opcode = bytes[checked++]!;
    if (opcode === ROOT_NODE) return;
    if (opcode === START_NODE || opcode === END_NODE) {
      check();
      return;
    }
    if (opcode === PAIR_NODE) {
      check();
      check();
      return;
    }
    return fail("invalid-wire");
  };
  check();
  if (checked !== bytes.length) return fail("invalid-wire");

  // Representation namespace is itself an ordinary Link.
  const namespace = memory.ensure(verified.L, verified.L);
  let offset = 0;

  const parse = (): LinkHandle => {
    if (offset >= bytes.length) return fail("invalid-wire");
    const opcode = bytes[offset++]!;

    if (opcode === ROOT_NODE) return verified.R;

    if (opcode === START_NODE) {
      const child = parse();
      return materializeQuotedNode(
        memory,
        verified,
        namespace,
        [verified.O, child],
      );
    }

    if (opcode === END_NODE) {
      const child = parse();
      return materializeQuotedNode(
        memory,
        verified,
        namespace,
        [verified.C, child],
      );
    }

    if (opcode === PAIR_NODE) {
      const left = parse();
      const right = parse();
      return materializeQuotedNode(
        memory,
        verified,
        namespace,
        [verified.L, left, right],
      );
    }

    return fail("invalid-wire");
  };

  const carrier = parse();
  if (offset !== bytes.length) return fail("invalid-wire");
  return carrier;
}
