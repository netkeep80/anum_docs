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

export type V015DirectFormalSourceErrorCode =
  | "invalid-basis"
  | "invalid-utf8"
  | "invalid-formal"
  | "invalid-shape"
  | "duplicate-local-name"
  | "cyclic-binding";

export class V015DirectFormalSourceError extends Error {
  override readonly name = "V015DirectFormalSourceError";
  constructor(readonly code: V015DirectFormalSourceErrorCode) {
    super(code);
  }
}

export interface V015DirectFormalSourceCompileResult {
  readonly sourceContent: LinkHandle;
  readonly sourceAset: LinkHandle;
}

function fail(code: V015DirectFormalSourceErrorCode): never {
  throw new V015DirectFormalSourceError(code);
}

/**
 * Bounded direct-FORMAL parser for the v0.15 source-ANet surface.
 *
 * Supported source roles:
 *   { A }          bare member
 *   { A : X }      binding
 *   { A : [] }     ExactSequence binding
 *   { A : {...} }  anchored nested bundle
 *
 * Commas delimit entries/items; whitespace is otherwise presentation only.
 * At block-entry level the first non-leading ':' is the binder delimiter.
 * Contextual ':' remains unrestricted inside RHS expressions.  A broader
 * grammar for ambiguous bare relative paths is intentionally deferred instead
 * of being guessed here.
 */
class DirectFormalReader {
  private index = 0;

  constructor(private readonly text: string) {}

  read(): readonly V015DirectSourceEntry[] {
    this.space();
    const result = this.block();
    this.space();
    if (this.index !== this.text.length) fail("invalid-formal");
    return result;
  }

  private space(): void {
    while (
      this.index < this.text.length &&
      /[\x20\x09\x0a\x0d]/u.test(this.text[this.index]!)
    ) {
      this.index += 1;
    }
  }

  private block(): readonly V015DirectSourceEntry[] {
    this.space();
    if (this.text[this.index] !== "{") fail("invalid-formal");
    this.index += 1;
    this.space();

    const entries: V015DirectSourceEntry[] = [];
    if (this.text[this.index] === "}") {
      this.index += 1;
      return Object.freeze(entries);
    }

    while (true) {
      entries.push(this.entry());
      this.space();

      const next = this.text[this.index];
      if (next === "}") {
        this.index += 1;
        return Object.freeze(entries);
      }
      if (next !== ",") fail("invalid-formal");
      this.index += 1;
      this.space();
      if (this.text[this.index] === "}") fail("invalid-formal");
    }
  }

  private entry(): V015DirectSourceEntry {
    this.space();
    const start = this.index;
    if (start >= this.text.length) return fail("invalid-formal");

    let binder = -1;
    let squareDepth = 0;
    let roundDepth = 0;

    while (this.index < this.text.length) {
      const ch = this.text[this.index]!;

      if (ch === "[") squareDepth += 1;
      else if (ch === "]") {
        if (squareDepth === 0) fail("invalid-formal");
        squareDepth -= 1;
      } else if (ch === "(") roundDepth += 1;
      else if (ch === ")") {
        if (roundDepth === 0) fail("invalid-formal");
        roundDepth -= 1;
      }

      if (squareDepth === 0 && roundDepth === 0) {
        if (ch === "{" || ch === "}") break;
        if (ch === ",") break;
        if (ch === ":") {
          const prefix = this.text.slice(start, this.index).trim();
          // Leading ':' belongs to an absolute contextual name.  A second
          // top-level colon would be ambiguous in bare-entry position and is
          // deliberately not guessed by this bounded grammar.
          if (prefix.length > 0) {
            binder = this.index;
            break;
          }
        }
      }

      this.index += 1;
    }

    if (squareDepth !== 0 || roundDepth !== 0) fail("invalid-formal");

    if (binder < 0) {
      const head = this.text.slice(start, this.index).trim();
      if (head.length === 0) fail("invalid-formal");
      return Object.freeze({ head, rhs: null });
    }

    const head = this.text.slice(start, binder).trim();
    if (head.length === 0) fail("invalid-formal");
    this.index = binder + 1;
    this.space();

    const rhs = this.rhs();
    return Object.freeze({ head, rhs });
  }

  private rhs(): V015DirectSourceRhs {
    this.space();
    const ch = this.text[this.index];

    if (ch === "{") {
      return Object.freeze({
        kind: "bundle",
        entries: this.block(),
      });
    }
    if (ch === "[") {
      return Object.freeze({
        kind: "sequence",
        items: this.sequence(),
      });
    }

    const source = this.expressionUntil([",", "}"]);
    if (source.length === 0) fail("invalid-formal");
    return Object.freeze({ kind: "expression", source });
  }

  private sequence(): readonly V015DirectSourceSequenceItem[] {
    if (this.text[this.index] !== "[") fail("invalid-formal");
    this.index += 1;
    this.space();

    const items: V015DirectSourceSequenceItem[] = [];
    if (this.text[this.index] === "]") {
      this.index += 1;
      return Object.freeze(items);
    }

    while (true) {
      this.space();
      if (this.text[this.index] === "[") {
        items.push(Object.freeze({
          kind: "sequence",
          items: this.sequence(),
        }));
      } else {
        const source = this.expressionUntil([",", "]"]);
        if (source.length === 0) fail("invalid-formal");
        items.push(Object.freeze({ kind: "expression", source }));
      }

      this.space();
      const next = this.text[this.index];
      if (next === "]") {
        this.index += 1;
        return Object.freeze(items);
      }
      if (next !== ",") fail("invalid-formal");
      this.index += 1;
      this.space();
      if (this.text[this.index] === "]") fail("invalid-formal");
    }
  }

  private expressionUntil(delimiters: readonly string[]): string {
    const start = this.index;
    let roundDepth = 0;

    while (this.index < this.text.length) {
      const ch = this.text[this.index]!;
      if (ch === "(") roundDepth += 1;
      else if (ch === ")") {
        if (roundDepth === 0) fail("invalid-formal");
        roundDepth -= 1;
      }

      if (roundDepth === 0 && delimiters.includes(ch)) break;
      if (ch === "{" || ch === "[") fail("invalid-formal");
      this.index += 1;
    }

    if (roundDepth !== 0) fail("invalid-formal");
    return this.text.slice(start, this.index).trim();
  }
}

function mapLoweringError(error: V015DirectSourceError): never {
  if (error.code === "invalid-basis") return fail("invalid-basis");
  if (error.code === "duplicate-local-name") {
    return fail("duplicate-local-name");
  }
  if (error.code === "cyclic-binding") return fail("cyclic-binding");
  return fail("invalid-shape");
}

/**
 * Direct FORMAL source -> shared direct-source model -> native source ANet.
 *
 * This is deliberately symmetric with compileV015DirectJsonSourceAnet:
 * neither surface owns semantic membership.  Both converge before DAS.
 */
export function compileV015DirectFormalSourceAnet(
  memory: WriteMemory,
  basis: RootBasis,
  grammarRoot: LinkHandle,
  sourceAnetProfileRoot: LinkHandle,
  bytes: Uint8Array,
): V015DirectFormalSourceCompileResult {
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

  const entries = new DirectFormalReader(text).read();
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
      entries,
    );
    return Object.freeze({ sourceContent, sourceAset });
  } catch (error) {
    if (error instanceof V015DirectSourceError) return mapLoweringError(error);
    throw error;
  }
}
