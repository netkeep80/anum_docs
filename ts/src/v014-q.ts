// mts-version-evidence: candidate-from=0.14

import {
  StreamError,
  parseRawQuaternary,
  type StackAlgebra,
  type StackOperation,
  type StreamDenotation,
} from "./anum.js";

/**
 * Canonical v0.14 Q surface.
 *
 * This is intentionally versioned instead of changing the accepted v0.13
 * [ ] 1 0 interpreter in place.
 */
export type V014QSign = "[" | "]" | "T" | "F";

export interface V014QToken {
  readonly sign: V014QSign;
  readonly offset: number;
}

export interface V014QForm {
  readonly tokens: readonly V014QToken[];
}

export class V014QDecodeError extends StreamError {
  override readonly name = "V014QDecodeError";

  constructor(
    readonly offset: number,
    readonly symbol: string,
  ) {
    super("non-abit");
    this.message = `non-Q14 sign at code-point offset ${offset}: ${JSON.stringify(symbol)}`;
  }
}

function isV014QSign(symbol: string): symbol is V014QSign {
  return symbol === "[" || symbol === "]" || symbol === "T" || symbol === "F";
}

function isPythonWhitespace(symbol: string): boolean {
  const code = symbol.codePointAt(0);
  if (code === undefined) return false;
  return (
    (code >= 0x09 && code <= 0x0d) ||
    (code >= 0x1c && code <= 0x20) ||
    code === 0x85 ||
    code === 0xa0 ||
    code === 0x1680 ||
    (code >= 0x2000 && code <= 0x200a) ||
    code === 0x2028 ||
    code === 0x2029 ||
    code === 0x202f ||
    code === 0x205f ||
    code === 0x3000
  );
}

/**
 * Raw-source decoder with the same whitespace/comment envelope as the legacy
 * Q13 decoder, but with the v0.14 alphabet [ ] T F only.
 */
export class IncrementalV014QDecoder {
  private committedOffset = 0;
  private inComment = false;
  private readonly committedTokens: V014QToken[] = [];

  get offset(): number {
    return this.committedOffset;
  }

  feed(chunk: string): readonly V014QToken[] {
    const emitted: V014QToken[] = [];
    let nextCommentState = this.inComment;
    let consumedCodePoints = 0;

    for (const symbol of chunk) {
      const absoluteOffset = this.committedOffset + consumedCodePoints;
      consumedCodePoints += 1;

      if (nextCommentState) {
        if (symbol === "\r" || symbol === "\n") nextCommentState = false;
        continue;
      }
      if (symbol === "#") {
        nextCommentState = true;
        continue;
      }
      if (isPythonWhitespace(symbol)) continue;
      if (!isV014QSign(symbol)) {
        throw new V014QDecodeError(absoluteOffset, symbol);
      }
      emitted.push(Object.freeze({ sign: symbol, offset: absoluteOffset }));
    }

    this.committedTokens.push(...emitted);
    this.inComment = nextCommentState;
    this.committedOffset += consumedCodePoints;
    return Object.freeze([...emitted]);
  }

  finish(): V014QForm {
    return Object.freeze({ tokens: Object.freeze([...this.committedTokens]) });
  }
}

export function parseRawV014Q(text: string): V014QForm {
  const decoder = new IncrementalV014QDecoder();
  decoder.feed(text);
  return decoder.finish();
}

export function normalizeV014QForm(form: V014QForm): string {
  return form.tokens.map((token) => token.sign).join("");
}

interface Frame<T> {
  started: boolean;
  current: T;
}

function append<T>(frame: Frame<T>, value: T, algebra: StackAlgebra<T>): void {
  if (!frame.started) {
    frame.current = value;
    frame.started = true;
    return;
  }
  frame.current = algebra.link(frame.current, value);
}

/**
 * Q14 sequence semantics.
 *
 * OPEN/CLOSE preserve the rooted local-context behavior of accepted Q13.
 * T/F select L/U respectively. This executor does not call the legacy Q13
 * parser/interpreter and therefore cannot silently accept 1/0 aliases.
 */
export function executeV014QSigns<T>(
  signs: Iterable<V014QSign>,
  algebra: StackAlgebra<T>,
): StreamDenotation<T> {
  const frames: Frame<T>[] = [{ started: false, current: algebra.root }];
  const resolvedValues: T[] = [];
  const operations: StackOperation[] = [];

  for (const sign of signs) {
    if (sign === "[") {
      frames.push({ started: false, current: algebra.root });
      operations.push("OPEN");
      continue;
    }

    if (sign === "]") {
      if (frames.length === 1) throw new StreamError("unexpected-close");
      const inner = frames.pop();
      const parent = frames[frames.length - 1];
      if (inner === undefined || parent === undefined) {
        throw new Error("internal Q14 stack invariant violated");
      }

      const returned = inner.started
        ? algebra.link(algebra.root, inner.current)
        : algebra.root;
      append(parent, returned, algebra);
      operations.push("CLOSE");
      continue;
    }

    const value = sign === "T" ? algebra.linked : algebra.unlinked;
    const current = frames[frames.length - 1];
    if (current === undefined) {
      throw new Error("internal Q14 stack invariant violated");
    }

    resolvedValues.push(value);
    append(current, value, algebra);
    operations.push("VALUE");
  }

  if (frames.length !== 1) throw new StreamError("unclosed-open");

  const rootFrame = frames[0];
  if (rootFrame === undefined) {
    throw new Error("internal Q14 stack invariant violated");
  }

  return Object.freeze({
    denotation: rootFrame.started ? rootFrame.current : algebra.root,
    resolvedValues: Object.freeze([...resolvedValues]),
    operations: Object.freeze([...operations]),
  });
}

export function deserializeV014Q<T>(
  form: V014QForm,
  algebra: StackAlgebra<T>,
): StreamDenotation<T> {
  return executeV014QSigns(form.tokens.map((token) => token.sign), algebra);
}

export function deserializeV014QStream<T>(
  source: string,
  algebra: StackAlgebra<T>,
): StreamDenotation<T> {
  const signs: V014QSign[] = [];
  let offset = 0;
  for (const symbol of source) {
    if (!isV014QSign(symbol)) throw new V014QDecodeError(offset, symbol);
    signs.push(symbol);
    offset += 1;
  }
  return executeV014QSigns(signs, algebra);
}

/**
 * Explicit compatibility operation.
 *
 * The legacy source is parsed under the accepted Q13 alphabet and then emitted
 * canonically as Q14. Whitespace/comments are intentionally not preserved:
 * denotation is preserved while exact source identity is not.
 */
export function transcodeLegacyQ13ToV014Canonical(source: string): string {
  const legacy = parseRawQuaternary(source);
  return legacy.tokens.map(({ abit }) => {
    if (abit === "1") return "T";
    if (abit === "0") return "F";
    return abit;
  }).join("");
}
