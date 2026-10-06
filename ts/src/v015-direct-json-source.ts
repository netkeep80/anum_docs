import {
  verifyRootBasis,
  type LinkHandle,
  type RootBasis,
  type WriteMemory,
} from "./memory.js";
import {
  V015DirectSourceError,
  compileV015DirectSourceEntries,
  type V015DirectSourceEntry,
  type V015DirectSourceRhs,
  type V015DirectSourceSequenceItem,
} from "./v015-direct-source.js";
import { materializeV012StringAnum } from "./v012-string-anum.js";

export type V015DirectJsonSourceErrorCode =
  | "invalid-basis"
  | "invalid-utf8"
  | "invalid-json"
  | "duplicate-key"
  | "invalid-shape"
  | "invalid-null-position"
  | "cyclic-binding";

export class V015DirectJsonSourceError extends Error {
  override readonly name = "V015DirectJsonSourceError";
  constructor(readonly code: V015DirectJsonSourceErrorCode) {
    super(code);
  }
}

export interface V015DirectJsonSourceCompileResult {
  readonly sourceContent: LinkHandle;
  readonly sourceAset: LinkHandle;
}

type JsonValue =
  | null
  | string
  | readonly JsonValue[]
  | ReadonlyMap<string, JsonValue>;

function fail(code: V015DirectJsonSourceErrorCode): never {
  throw new V015DirectJsonSourceError(code);
}

class StrictDirectJsonReader {
  private index = 0;

  constructor(private readonly text: string) {}

  read(): JsonValue {
    this.space();
    const value = this.value();
    this.space();
    if (this.index !== this.text.length) fail("invalid-json");
    return value;
  }

  private space(): void {
    while (
      this.index < this.text.length &&
      /[\x20\x09\x0a\x0d]/u.test(this.text[this.index]!)
    ) {
      this.index += 1;
    }
  }

  private value(): JsonValue {
    this.space();
    const ch = this.text[this.index];
    if (ch === "{") return this.object();
    if (ch === "[") return this.array();
    if (ch === "\"") return this.string();
    if (this.text.startsWith("null", this.index)) {
      this.index += 4;
      return null;
    }
    return fail("invalid-json");
  }

  private string(): string {
    const start = this.index;
    if (this.text[this.index] !== "\"") return fail("invalid-json");
    this.index += 1;

    while (this.index < this.text.length) {
      const ch = this.text[this.index];
      if (ch === "\"") {
        this.index += 1;
        try {
          const decoded = JSON.parse(
            this.text.slice(start, this.index),
          ) as unknown;
          if (typeof decoded !== "string") return fail("invalid-json");
          return decoded;
        } catch (error) {
          if (error instanceof V015DirectJsonSourceError) throw error;
          return fail("invalid-json");
        }
      }
      this.index += ch === "\\" ? 2 : 1;
    }

    return fail("invalid-json");
  }

  private object(): ReadonlyMap<string, JsonValue> {
    this.index += 1;
    this.space();
    const result = new Map<string, JsonValue>();
    if (this.text[this.index] === "}") {
      this.index += 1;
      return result;
    }

    while (true) {
      this.space();
      if (this.text[this.index] !== "\"") return fail("invalid-json");
      const key = this.string();
      if (result.has(key)) return fail("duplicate-key");
      this.space();
      if (this.text[this.index] !== ":") return fail("invalid-json");
      this.index += 1;
      result.set(key, this.value());
      this.space();
      const next = this.text[this.index];
      if (next === "}") {
        this.index += 1;
        return result;
      }
      if (next !== ",") return fail("invalid-json");
      this.index += 1;
    }
  }

  private array(): readonly JsonValue[] {
    this.index += 1;
    this.space();
    const result: JsonValue[] = [];
    if (this.text[this.index] === "]") {
      this.index += 1;
      return Object.freeze(result);
    }

    while (true) {
      const value = this.value();
      if (value === null) fail("invalid-null-position");
      result.push(value);
      this.space();
      const next = this.text[this.index];
      if (next === "]") {
        this.index += 1;
        return Object.freeze(result);
      }
      if (next !== ",") return fail("invalid-json");
      this.index += 1;
    }
  }
}

function sequenceItem(value: JsonValue): V015DirectSourceSequenceItem {
  if (typeof value === "string") {
    return Object.freeze({ kind: "expression", source: value });
  }
  if (Array.isArray(value)) {
    return Object.freeze({
      kind: "sequence",
      items: Object.freeze(value.map(sequenceItem)),
    });
  }
  return fail("invalid-shape");
}

function rhs(value: JsonValue): V015DirectSourceRhs | null {
  if (value === null) return null;
  if (typeof value === "string") {
    return Object.freeze({ kind: "expression", source: value });
  }
  if (Array.isArray(value)) {
    return Object.freeze({
      kind: "sequence",
      items: Object.freeze(value.map(sequenceItem)),
    });
  }
  if (value instanceof Map) {
    return Object.freeze({
      kind: "bundle",
      entries: entries(value),
    });
  }
  return fail("invalid-shape");
}

function entries(
  object: ReadonlyMap<string, JsonValue>,
): readonly V015DirectSourceEntry[] {
  return Object.freeze(
    [...object].map(([head, value]) =>
      Object.freeze({ head, rhs: rhs(value) })
    ),
  );
}

function mapLoweringError(error: V015DirectSourceError): never {
  if (error.code === "invalid-basis") return fail("invalid-basis");
  if (error.code === "cyclic-binding") return fail("cyclic-binding");
  return fail("invalid-shape");
}

/**
 * Strict compact JSON projection into the shared direct-source lowering.
 * JSON contributes syntax only; native source ANet roles and semantic ANet
 * denotation are shared with FORMAL.
 */
export function compileV015DirectJsonSourceAnet(
  memory: WriteMemory,
  basis: RootBasis,
  grammarRoot: LinkHandle,
  sourceAnetProfileRoot: LinkHandle,
  bytes: Uint8Array,
): V015DirectJsonSourceCompileResult {
  let verified: RootBasis;
  try {
    verified = verifyRootBasis(memory, basis);
  } catch {
    return fail("invalid-basis");
  }

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return fail("invalid-utf8");
  }

  const parsed = new StrictDirectJsonReader(text).read();
  if (!(parsed instanceof Map)) return fail("invalid-shape");

  const sourceContent = materializeV012StringAnum(
    memory,
    verified,
    bytes,
  ).anumLink;

  try {
    const sourceAset = compileV015DirectSourceEntries(
      memory,
      verified,
      grammarRoot,
      sourceAnetProfileRoot,
      entries(parsed),
    );
    return Object.freeze({ sourceContent, sourceAset });
  } catch (error) {
    if (error instanceof V015DirectSourceError) return mapLoweringError(error);
    throw error;
  }
}
