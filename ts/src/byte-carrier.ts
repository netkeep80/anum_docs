import {
  ExactSequenceError,
  materializeExactSequence,
  readExactSequence,
} from "./exact-sequence.js";
import {
  MemoryError,
  type LinkHandle,
  type ReadMemory,
  type RootBasis,
  type WriteMemory,
} from "./memory.js";
import {
  appendQuaternaryValue,
  closeQuaternaryState,
} from "./quaternary-state.js";

export type ByteCarrierErrorCode =
  | "invalid-byte"
  | "invalid-quaternary-byte-carrier"
  | "not-byte-link"
  | "invalid-byte-sequence"
  | "invalid-unicode-text"
  | "invalid-utf8";

export interface CanonicalByteSequence {
  readonly bytes: Uint8Array;
  readonly byteLinks: readonly LinkHandle[];
  readonly cells: readonly LinkHandle[];
}

export class ByteCarrierError extends Error {
  override readonly name: string = "ByteCarrierError";

  constructor(readonly code: ByteCarrierErrorCode) {
    super(code);
  }
}

const utf8Encoder = new TextEncoder();
const utf8Decoder = new TextDecoder("utf-8", { fatal: true });

export function byteToQuaternaryBits(value: number): string {
  if (!Number.isInteger(value) || value < 0 || value > 255) {
    throw new ByteCarrierError("invalid-byte");
  }
  return value.toString(2).padStart(8, "0");
}

/**
 * Canonical STRING -> QUATERNARY representation selected for MTS v0.9:
 * every exact physical byte is represented by its own `[8 bits]` group.
 * No code-point or Unicode-normalization boundary participates here.
 */
export function encodeBytesToQuaternary(bytes: Uint8Array): string {
  return Array.from(bytes, (value) => `[${byteToQuaternaryBits(value)}]`).join("");
}

/** Reads only the canonical per-byte spelling, not arbitrary Q syntax. */
export function decodeBytesFromQuaternary(carrier: string): Uint8Array {
  if (carrier.length % 10 !== 0) {
    throw new ByteCarrierError("invalid-quaternary-byte-carrier");
  }

  const bytes = new Uint8Array(carrier.length / 10);
  for (let offset = 0, index = 0; offset < carrier.length; offset += 10, index += 1) {
    const group = carrier.slice(offset, offset + 10);
    if (group[0] !== "[" || group[9] !== "]") {
      throw new ByteCarrierError("invalid-quaternary-byte-carrier");
    }
    const bits = group.slice(1, 9);
    if (!/^[01]{8}$/.test(bits)) {
      throw new ByteCarrierError("invalid-quaternary-byte-carrier");
    }
    bytes[index] = Number.parseInt(bits, 2);
  }
  return bytes;
}

/**
 * Structural definition Byte(p) := Denote_Q([p]). The returned handle is only
 * the runtime reference to the already-defined Link form; byte identity comes
 * from the eight Q values and canonical Link construction, never from `p` or
 * from a 256-entry table index.
 */
export function materializeByteLink(
  memory: WriteMemory,
  basis: RootBasis,
  value: number,
): LinkHandle {
  const bits = byteToQuaternaryBits(value);
  let state = memory.root;
  for (const bit of bits) {
    state = appendQuaternaryValue(
      memory,
      state,
      bit === "1" ? basis.L : basis.U,
    );
  }
  return closeQuaternaryState(memory, state);
}

/**
 * Convenience materialization of the complete byte vocabulary. Repeated calls
 * reuse the same structurally derived Links through canonical `memory.ensure`;
 * this array is not semantic authority.
 */
export function materializeByteVocabulary(
  memory: WriteMemory,
  basis: RootBasis,
): readonly LinkHandle[] {
  return Object.freeze(
    Array.from({ length: 256 }, (_, value) => materializeByteLink(memory, basis, value)),
  );
}

function semanticBitValue(
  basis: RootBasis,
  link: LinkHandle,
): 0 | 1 {
  if (link === basis.U) return 0;
  if (link === basis.L) return 1;
  throw new ByteCarrierError("not-byte-link");
}

/**
 * Pure structural inverse for Byte(p). It does not call `find` or materialize
 * missing Links, and therefore can be used by read/replay paths.
 */
export function readByteLink(
  memory: ReadMemory,
  basis: RootBasis,
  link: LinkHandle,
): number {
  try {
    const outer = memory.poles(link);
    if (outer.start !== memory.root) {
      throw new ByteCarrierError("not-byte-link");
    }

    const bits = new Array<0 | 1>(8);
    let current = outer.end;
    for (let index = 7; index >= 1; index -= 1) {
      const pair = memory.poles(current);
      bits[index] = semanticBitValue(basis, pair.end);
      current = pair.start;
    }
    bits[0] = semanticBitValue(basis, current);

    let value = 0;
    for (const bit of bits) value = (value << 1) | bit;
    return value;
  } catch (error) {
    if (error instanceof ByteCarrierError) throw error;
    if (error instanceof MemoryError) {
      throw new ByteCarrierError("not-byte-link");
    }
    throw error;
  }
}

/**
 * Exact source-byte content is an ExactSequence of canonical Byte(p) Links.
 * Occurrence/position therefore lives in sequence structure, not in copies of
 * byte values, source offsets, UUIDs or runtime handles.
 */
export function materializeCanonicalByteSequence(
  memory: WriteMemory,
  basis: RootBasis,
  bytes: Uint8Array,
): LinkHandle {
  const values = Array.from(bytes, (value) => materializeByteLink(memory, basis, value));
  return materializeExactSequence(memory, values);
}

export function readCanonicalByteSequence(
  memory: ReadMemory,
  basis: RootBasis,
  carrier: LinkHandle,
): CanonicalByteSequence {
  try {
    const sequence = readExactSequence(memory, carrier);
    const bytes = new Uint8Array(sequence.values.length);
    for (let index = 0; index < sequence.values.length; index += 1) {
      const value = sequence.values[index];
      if (value === undefined) {
        throw new ByteCarrierError("invalid-byte-sequence");
      }
      bytes[index] = readByteLink(memory, basis, value);
    }
    return Object.freeze({
      bytes,
      byteLinks: Object.freeze([...sequence.values]),
      cells: Object.freeze([...sequence.cells]),
    });
  } catch (error) {
    if (error instanceof ByteCarrierError) throw error;
    if (error instanceof ExactSequenceError) {
      throw new ByteCarrierError("invalid-byte-sequence");
    }
    throw error;
  }
}

/** Strict Unicode-text layer above exact bytes. No normalization is applied. */
export function textToUtf8Bytes(text: string): Uint8Array {
  const bytes = utf8Encoder.encode(text);
  try {
    if (utf8Decoder.decode(bytes) !== text) {
      throw new ByteCarrierError("invalid-unicode-text");
    }
  } catch (error) {
    if (error instanceof ByteCarrierError) throw error;
    throw new ByteCarrierError("invalid-unicode-text");
  }
  return bytes;
}

/** Strict UTF-8 interpretation; malformed exact bytes remain valid below it. */
export function utf8BytesToText(bytes: Uint8Array): string {
  try {
    return utf8Decoder.decode(bytes);
  } catch {
    throw new ByteCarrierError("invalid-utf8");
  }
}
