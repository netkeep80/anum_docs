import {
  byteToQuaternaryBits,
  decodeBytesFromQuaternary,
  encodeBytesToQuaternary,
} from "./byte-carrier.js";
import {
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

/** Convenience accessor used by bounded conformance evidence. */
export function v012StringAnumLink(
  value: MaterializedQuaternaryAnum,
): LinkHandle {
  return value.anumLink;
}
