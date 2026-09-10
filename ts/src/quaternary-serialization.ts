import {
  CarrierInputError,
  validateCarrierVocabulary,
} from "./anum-carrier.js";
import {
  MemoryError,
  type LinkHandle,
  type ReadMemory,
  type RootBasis,
} from "./memory.js";

export type QuaternarySerializationErrorCode =
  | "invalid-basis"
  | "not-serializable";

export class QuaternarySerializationError extends Error {
  override readonly name = "QuaternarySerializationError";

  constructor(readonly code: QuaternarySerializationErrorCode) {
    super(code);
  }
}

function validateBasis(memory: ReadMemory, basis: RootBasis): void {
  if (basis.R !== memory.root) {
    throw new QuaternarySerializationError("invalid-basis");
  }
  try {
    validateCarrierVocabulary(memory, {
      opening: basis.O,
      closing: basis.C,
      linked: basis.L,
      unlinked: basis.U,
    });
  } catch (error) {
    if (error instanceof CarrierInputError || error instanceof MemoryError) {
      throw new QuaternarySerializationError("invalid-basis");
    }
    throw error;
  }
}

function bitOf(basis: RootBasis, link: LinkHandle): "1" | "0" | undefined {
  if (link === basis.L) return "1";
  if (link === basis.U) return "0";
  return undefined;
}

/**
 * Canonical serializer for the currently proven flat-Q denotation domain.
 *
 * It serializes exactly the left-associated folds whose source values are the
 * two Q value abits `1` and `0`. It does not infer source history, synthesize
 * bracket nesting, or invent an encoding for forms outside that domain.
 * Unsupported forms reject explicitly so later MTS work can extend the same
 * conformance gate without silently changing semantics.
 */
export function serializeQuaternaryLink(
  memory: ReadMemory,
  basis: RootBasis,
  link: LinkHandle,
): string {
  validateBasis(memory, basis);

  if (link === basis.R) return "";

  const reversedTail: ("1" | "0")[] = [];
  const visited = new Set<LinkHandle>();
  let current = link;

  while (true) {
    const headBit = bitOf(basis, current);
    if (headBit !== undefined) {
      return headBit + reversedTail.reverse().join("");
    }
    if (current === basis.R || visited.has(current)) {
      throw new QuaternarySerializationError("not-serializable");
    }
    visited.add(current);

    let poles;
    try {
      poles = memory.poles(current);
    } catch (error) {
      if (error instanceof MemoryError) {
        throw new QuaternarySerializationError("not-serializable");
      }
      throw error;
    }

    const tailBit = bitOf(basis, poles.end);
    if (tailBit === undefined) {
      throw new QuaternarySerializationError("not-serializable");
    }
    reversedTail.push(tailBit);
    current = poles.start;
  }
}
