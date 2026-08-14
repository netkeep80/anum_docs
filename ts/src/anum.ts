export type Abit = "[" | "]" | "1" | "0";
export type StackOperation = "OPEN" | "CLOSE" | "VALUE";
export type StreamErrorCode = "unexpected-close" | "unclosed-open" | "non-abit";

export interface AnumToken {
  readonly abit: Abit;
  readonly offset: number;
}

export interface AnumForm {
  readonly tokens: readonly AnumToken[];
}

export interface StackAlgebra<T> {
  readonly root: T;
  readonly linked: T;
  readonly unlinked: T;
  link(start: T, end: T): T;
}

export interface StreamDenotation<T> {
  readonly denotation: T;
  readonly resolvedValues: readonly T[];
  readonly operations: readonly StackOperation[];
}

export class StreamError extends Error {
  override readonly name = "StreamError";

  constructor(readonly code: StreamErrorCode) {
    super(code);
  }
}

export class QuaternaryDecodeError extends StreamError {
  override readonly name = "QuaternaryDecodeError";

  constructor(
    readonly offset: number,
    readonly symbol: string,
  ) {
    super("non-abit");
    this.message = `non-abit at code-point offset ${offset}: ${JSON.stringify(symbol)}`;
  }
}

function isAbit(symbol: string): symbol is Abit {
  return symbol === "[" || symbol === "]" || symbol === "1" || symbol === "0";
}

function isPythonWhitespace(symbol: string): boolean {
  const code = symbol.codePointAt(0);
  if (code === undefined) {
    return false;
  }
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

export class IncrementalQuaternaryDecoder {
  private committedOffset = 0;
  private inComment = false;
  private readonly committedTokens: AnumToken[] = [];

  get offset(): number {
    return this.committedOffset;
  }

  feed(chunk: string): readonly AnumToken[] {
    const emitted: AnumToken[] = [];
    let nextCommentState = this.inComment;
    let consumedCodePoints = 0;

    // `for...of` идёт по Unicode code points. Счётчик отделён от UTF-16
    // индексов JS, чтобы observable offsets совпадали с Python str iteration.
    for (const symbol of chunk) {
      const absoluteOffset = this.committedOffset + consumedCodePoints;
      consumedCodePoints += 1;

      if (nextCommentState) {
        if (symbol === "\r" || symbol === "\n") {
          nextCommentState = false;
        }
        continue;
      }
      if (symbol === "#") {
        nextCommentState = true;
        continue;
      }
      if (isPythonWhitespace(symbol)) {
        continue;
      }
      if (!isAbit(symbol)) {
        // До этой точки меняется только локальное состояние: rejected chunk
        // не коммитит tokens, offset или comment state.
        throw new QuaternaryDecodeError(absoluteOffset, symbol);
      }
      emitted.push(Object.freeze({ abit: symbol, offset: absoluteOffset }));
    }

    this.committedTokens.push(...emitted);
    this.inComment = nextCommentState;
    this.committedOffset += consumedCodePoints;
    return Object.freeze([...emitted]);
  }

  finish(): AnumForm {
    return Object.freeze({ tokens: Object.freeze([...this.committedTokens]) });
  }
}

export function parseRawQuaternary(text: string): AnumForm {
  const decoder = new IncrementalQuaternaryDecoder();
  decoder.feed(text);
  return decoder.finish();
}

export function normalizeRawForm(form: AnumForm): string {
  return form.tokens.map((token) => token.abit).join("");
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

export function executeAbits<T>(
  abits: Iterable<Abit>,
  algebra: StackAlgebra<T>,
): StreamDenotation<T> {
  const frames: Frame<T>[] = [{ started: false, current: algebra.root }];
  const resolvedValues: T[] = [];
  const operations: StackOperation[] = [];

  for (const abit of abits) {
    if (abit === "[") {
      frames.push({ started: false, current: algebra.root });
      operations.push("OPEN");
      continue;
    }
    if (abit === "]") {
      if (frames.length === 1) {
        throw new StreamError("unexpected-close");
      }
      const inner = frames.pop();
      const parent = frames[frames.length - 1];
      if (inner === undefined || parent === undefined) {
        throw new Error("internal ANUM stack invariant violated");
      }
      const returned = inner.started
        ? algebra.link(algebra.root, inner.current)
        : algebra.root;
      append(parent, returned, algebra);
      operations.push("CLOSE");
      continue;
    }

    const value = abit === "1" ? algebra.linked : algebra.unlinked;
    const current = frames[frames.length - 1];
    if (current === undefined) {
      throw new Error("internal ANUM stack invariant violated");
    }
    resolvedValues.push(value);
    append(current, value, algebra);
    operations.push("VALUE");
  }

  if (frames.length !== 1) {
    throw new StreamError("unclosed-open");
  }
  const rootFrame = frames[0];
  if (rootFrame === undefined) {
    throw new Error("internal ANUM stack invariant violated");
  }
  return Object.freeze({
    denotation: rootFrame.started ? rootFrame.current : algebra.root,
    resolvedValues: Object.freeze([...resolvedValues]),
    operations: Object.freeze([...operations]),
  });
}

export function deserializeAnum<T>(
  form: AnumForm,
  algebra: StackAlgebra<T>,
): StreamDenotation<T> {
  return executeAbits(form.tokens.map((token) => token.abit), algebra);
}

export function deserializeStream<T>(
  source: string,
  algebra: StackAlgebra<T>,
): StreamDenotation<T> {
  const abits: Abit[] = [];
  for (const symbol of source) {
    if (!isAbit(symbol)) {
      throw new StreamError("non-abit");
    }
    abits.push(symbol);
  }
  return executeAbits(abits, algebra);
}

export function semanticLink(start: string, end: string): string {
  if (start === "R" && end === "R") return "R";
  if (start === "O" && end === "R") return "O";
  if (start === "R" && end === "C") return "C";
  if (start === "O" && end === "C") return "L";
  if (start === "C" && end === "O") return "U";
  return `(${start}⟼${end})`;
}

export const symbolicStackAlgebra: StackAlgebra<string> = Object.freeze({
  root: "R",
  linked: "L",
  unlinked: "U",
  link: semanticLink,
});
