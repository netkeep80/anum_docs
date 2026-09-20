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
  | "invalid-semantic-link"
  | "invalid-wire";

export class V013HierarchicalCarrierError extends Error {
  override readonly name = "V013HierarchicalCarrierError";

  constructor(readonly code: V013HierarchicalCarrierErrorCode) {
    super(code);
  }
}

// Canonical research wire uses the historical quaternary digits themselves.
// ASCII/UTF-8 keeps the physical stream directly readable as an anum such as
// "19868", while node arity makes the prefix grammar self-delimiting.
const ROOT_NODE = 0x38; // "8"
const START_NODE = 0x39; // "9"
const END_NODE = 0x36; // "6"
const PAIR_NODE = 0x31; // "1"

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
 * Project any finite Link constructible by the current Memory API into the
 * quoted ROOT/START/END/PAIR carrier.
 *
 * The projection is structural: semantic identity is read only from poles.
 * Host memoization avoids repeated traversal of shared sublinks, but no host
 * identifier enters the carrier. Shared semantic sublinks therefore map to one
 * canonical local carrier Link through ordinary memory.ensure canonicality.
 */
export function materializeV013HierarchicalCarrierFromSemanticLink(
  memory: WriteMemory,
  basis: RootBasis,
  semantic: LinkHandle,
): LinkHandle {
  const verified = requireBasis(memory, basis);
  const namespace = memory.ensure(verified.L, verified.L);
  const memo = new Map<LinkHandle, LinkHandle>();
  const active = new Set<LinkHandle>();

  const project = (link: LinkHandle): LinkHandle => {
    const known = memo.get(link);
    if (known !== undefined) return known;

    if (link === verified.R) {
      memo.set(link, verified.R);
      return verified.R;
    }

    if (active.has(link)) return fail("invalid-semantic-link");
    active.add(link);
    try {
      const poles = memory.poles(link);

      // A non-root Link cannot be self at both poles through the canonical
      // Memory constructors. Treat such a foreign/forged cycle as unsupported.
      if (poles.start === link && poles.end === link) {
        return fail("invalid-semantic-link");
      }

      let carrier: LinkHandle;
      if (poles.start === link) {
        carrier = materializeQuotedNode(
          memory,
          verified,
          namespace,
          [verified.O, project(poles.end)],
        );
      } else if (poles.end === link) {
        carrier = materializeQuotedNode(
          memory,
          verified,
          namespace,
          [verified.C, project(poles.start)],
        );
      } else {
        carrier = materializeQuotedNode(
          memory,
          verified,
          namespace,
          [verified.L, project(poles.start), project(poles.end)],
        );
      }

      memo.set(link, carrier);
      return carrier;
    } catch (error) {
      if (error instanceof V013HierarchicalCarrierError) throw error;
      if (error instanceof MemoryError) return fail("invalid-semantic-link");
      throw error;
    } finally {
      active.delete(link);
    }
  };

  return project(semantic);
}

/**
 * Read-only canonical physical serialization of the quoted v0.13 hierarchy.
 *
 * Canonical research framing is the historical quaternary alphabet:
 *
 *   8             ROOT
 *   9 <node>      START(node)
 *   6 <node>      END(node)
 *   1 <node><node> PAIR(left,right)
 *
 * The returned bytes are the ASCII/UTF-8 digits themselves, so the physical
 * stream is also the canonical prefix spelling of the structural anum.
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
