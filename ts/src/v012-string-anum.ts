import {
  byteToQuaternaryBits,
  decodeBytesFromQuaternary,
  encodeBytesToQuaternary,
} from "./byte-carrier.js";
import {
  MemoryError,
  verifyRootBasis,
  type LinkHandle,
  type ReadMemory,
  type RootBasis,
  type WriteMemory,
} from "./memory.js";
import {
  materializeQuaternaryAnum,
  serializeMaterializedQuaternaryAnum,
  type MaterializedQuaternaryAnum,
} from "./quaternary-anum.js";

export type V012StringAnumErrorCode =
  | "not-v012-string-byte-anum"
  | "not-v012-string-anum";

export class V012StringAnumError extends Error {
  override readonly name = "V012StringAnumError";

  constructor(readonly code: V012StringAnumErrorCode) {
    super(code);
  }
}

export interface ReadV012StringAnum {
  readonly bytes: Uint8Array;
  readonly byteLinks: readonly LinkHandle[];
  /** Root plus every exact STRING prefix in source order. */
  readonly prefixes: readonly LinkHandle[];
}

function invalidByte(): never {
  throw new V012StringAnumError("not-v012-string-byte-anum");
}

function invalidString(): never {
  throw new V012StringAnumError("not-v012-string-anum");
}

function requireByteRootBasis(
  memory: ReadMemory,
  basis: RootBasis,
): RootBasis {
  try {
    return verifyRootBasis(memory, basis);
  } catch {
    return invalidByte();
  }
}

function requireStringRootBasis(
  memory: ReadMemory,
  basis: RootBasis,
): RootBasis {
  try {
    return verifyRootBasis(memory, basis);
  } catch {
    return invalidString();
  }
}

function bitValue(basis: RootBasis, value: LinkHandle): 0 | 1 {
  if (value === basis.U) return 0;
  if (value === basis.L) return 1;
  return invalidByte();
}

/**
 * Pure structural inverse of Byte_v012(p) := Anum(bits8(p)).
 *
 * The role is valid iff exactly eight rooted steps end in L/U and the eighth
 * predecessor is R. No hierarchy witness, lookup or materialization is used.
 */
function readVerifiedV012StringByteAnum(
  memory: ReadMemory,
  basis: RootBasis,
  link: LinkHandle,
): number {
  let current = link;
  const bits = new Array<0 | 1>(8);

  try {
    for (let index = 7; index >= 0; index -= 1) {
      if (current === basis.R) invalidByte();
      const poles = memory.poles(current);
      bits[index] = bitValue(basis, poles.end);
      current = poles.start;
    }
    if (current !== basis.R) invalidByte();
  } catch (error) {
    if (error instanceof V012StringAnumError) throw error;
    if (error instanceof MemoryError) invalidByte();
    throw error;
  }

  let result = 0;
  for (const bit of bits) result = (result << 1) | bit;
  return result;
}

export function readV012StringByteAnum(
  memory: ReadMemory,
  basis: RootBasis,
  link: LinkHandle,
): number {
  return readVerifiedV012StringByteAnum(
    memory,
    requireByteRootBasis(memory, basis),
    link,
  );
}

/**
 * Read a role-selected exact v0.12 STRING Anum directly from Link topology.
 *
 * StringAnum_v012(bytes) is a rooted left sequence of Byte_v012 Links. The
 * returned prefixes are the exact rooted positions needed by source spans.
 * This reader is intentionally poles-only and cannot synthesize missing Links.
 */
export function readV012StringAnum(
  memory: ReadMemory,
  basis: RootBasis,
  link: LinkHandle,
): ReadV012StringAnum {
  const verifiedBasis = requireStringRootBasis(memory, basis);

  if (link === verifiedBasis.R) {
    return Object.freeze({
      bytes: new Uint8Array(),
      byteLinks: Object.freeze([]),
      prefixes: Object.freeze([verifiedBasis.R]),
    });
  }

  const reversedBytes: number[] = [];
  const reversedByteLinks: LinkHandle[] = [];
  const reversedPrefixes: LinkHandle[] = [];
  const visited = new Set<LinkHandle>();
  let current = link;

  try {
    while (current !== verifiedBasis.R) {
      if (visited.has(current)) {
        throw new V012StringAnumError("not-v012-string-anum");
      }
      visited.add(current);
      reversedPrefixes.push(current);

      const poles = memory.poles(current);
      const byteLink = poles.end;
      let byte: number;
      try {
        byte = readVerifiedV012StringByteAnum(memory, verifiedBasis, byteLink);
      } catch (error) {
        if (error instanceof V012StringAnumError) {
          throw new V012StringAnumError("not-v012-string-anum");
        }
        throw error;
      }
      reversedBytes.push(byte);
      reversedByteLinks.push(byteLink);
      current = poles.start;
    }
  } catch (error) {
    if (error instanceof V012StringAnumError) throw error;
    if (error instanceof MemoryError) {
      throw new V012StringAnumError("not-v012-string-anum");
    }
    throw error;
  }

  return Object.freeze({
    bytes: Uint8Array.from([...reversedBytes].reverse()),
    byteLinks: Object.freeze([...reversedByteLinks].reverse()),
    prefixes: Object.freeze([verifiedBasis.R, ...[...reversedPrefixes].reverse()]),
  });
}

/**
 * v0.12 candidate STRING byte.
 *
 * Byte identity is the exact local rooted Anum of its eight Q bits:
 *
 *   Byte_v012(p) := Anum(bits8(p))
 *
 * This intentionally does not reuse the historical Byte_v09 denotation.
 */
export function materializeV012StringByteAnum(
  memory: WriteMemory,
  basis: RootBasis,
  value: number,
): MaterializedQuaternaryAnum {
  return materializeQuaternaryAnum(
    memory,
    basis,
    byteToQuaternaryBits(value),
  );
}

/**
 * v0.12 candidate STRING Anum.
 *
 * The canonical per-byte Q carrier is already the exact hierarchy:
 *
 *   [bits(p1)][bits(p2)]...
 *
 * Each root child is one Byte_v012 Anum and the top-level anumLink is the
 * exact rooted STRING Anum. No second semantic fold is introduced.
 */
export function materializeV012StringAnum(
  memory: WriteMemory,
  basis: RootBasis,
  bytes: Uint8Array,
): MaterializedQuaternaryAnum {
  return materializeQuaternaryAnum(
    memory,
    basis,
    encodeBytesToQuaternary(bytes),
  );
}

/**
 * Read-only faithful STRING byte serialization from the exact v0.12 hierarchy.
 *
 * Q serialization first verifies the supplied exact hierarchy through find();
 * the byte decoder then requires precisely one [8 bits] child per byte.
 */
export function serializeV012StringAnum(
  memory: ReadMemory,
  basis: RootBasis,
  value: MaterializedQuaternaryAnum,
): Uint8Array {
  return decodeBytesFromQuaternary(
    serializeMaterializedQuaternaryAnum(memory, basis, value),
  );
}

