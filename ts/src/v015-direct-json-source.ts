import { materializeExactSequence } from "./exact-sequence.js";
import {
  verifyRootBasis,
  type LinkHandle,
  type RootBasis,
  type WriteMemory,
} from "./memory.js";
import { readNativeSyntaxGrammar } from "./native-syntax-grammar.js";
import { SyntaxAsetBuilder } from "./syntax-aset-contract.js";
import {
  materializeV015ContextualNamePath,
} from "./v015-link-definition.js";
import {
  readV015SourceAnetProfile,
} from "./v015-source-anet.js";
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

type DirectJsonValue =
  | null
  | string
  | readonly DirectJsonValue[]
  | ReadonlyMap<string, DirectJsonValue>;

function fail(code: V015DirectJsonSourceErrorCode): never {
  throw new V015DirectJsonSourceError(code);
}

class StrictDirectJsonReader {
  private index = 0;

  constructor(private readonly text: string) {}

  read(): DirectJsonValue {
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

  private value(): DirectJsonValue {
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

      if (ch === "\\") {
        this.index += 2;
      } else {
        this.index += 1;
      }
    }

    return fail("invalid-json");
  }

  private object(): ReadonlyMap<string, DirectJsonValue> {
    this.index += 1;
    this.space();
    const result = new Map<string, DirectJsonValue>();

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

  private array(): readonly DirectJsonValue[] {
    this.index += 1;
    this.space();
    const result: DirectJsonValue[] = [];

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

function isContextualNameSegment(segment: string): boolean {
  return (
    segment.length > 0 &&
    !/[\t\r\n :()]/u.test(segment) &&
    !segment.includes("->") &&
    !segment.includes("[") &&
    !segment.includes("]") &&
    !segment.includes(",") &&
    !segment.includes("=") &&
    !segment.includes("≡")
  );
}

/**
 * Compile the Author-selected compact JSON source surface into the same native
 * SyntaxAset carrier consumed by source-ANet denotation.
 *
 * This compiler does not publish semantic ANet membership.  It only resolves
 * source expressions and constructs source occurrences.  Membership is a
 * separate stage owned by denoteV015ResolvedSourceAnet.
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

  const grammar = readNativeSyntaxGrammar(memory, verified, grammarRoot);
  const profile = readV015SourceAnetProfile(
    memory,
    verified,
    grammarRoot,
    sourceAnetProfileRoot,
  );

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return fail("invalid-utf8");
  }

  const parsed = new StrictDirectJsonReader(text).read();
  if (!(parsed instanceof Map)) fail("invalid-shape");

  const sourceContent = materializeV012StringAnum(
    memory,
    verified,
    bytes,
  ).anumLink;

  const nameCarrierCache = new Map<string, LinkHandle>();
  const localNameCarrier = (name: string): LinkHandle => {
    const known = nameCarrierCache.get(name);
    if (known !== undefined) return known;
    const carrier = materializeV012StringAnum(
      memory,
      verified,
      new TextEncoder().encode(name),
    ).anumLink;
    nameCarrierCache.set(name, carrier);
    return carrier;
  };

  const absoluteName = (name: string): LinkHandle => {
    if (name === "R") return verified.R;
    return materializeV015ContextualNamePath(
      memory,
      verified,
      verified.R,
      [localNameCarrier(name)],
      true,
    );
  };

  const contextualPath = (source: string): LinkHandle => {
    const compact = source.replace(/[()]/gu, "").trim();
    if (compact.length === 0) fail("invalid-shape");

    if (compact.startsWith(":")) {
      const segments = compact.slice(1).split(":");
      if (segments.some((segment) => !isContextualNameSegment(segment))) {
        fail("invalid-shape");
      }
      return materializeV015ContextualNamePath(
        memory,
        verified,
        verified.R,
        segments.map(localNameCarrier),
        true,
      );
    }

    const segments = compact.split(":");
    if (segments.some((segment) => !isContextualNameSegment(segment))) {
      fail("invalid-shape");
    }
    if (segments[0] === "R") {
      if (segments.length === 1) return verified.R;
      return materializeV015ContextualNamePath(
        memory,
        verified,
        verified.R,
        segments.slice(1).map(localNameCarrier),
        true,
      );
    }

    return materializeV015ContextualNamePath(
      memory,
      verified,
      verified.R,
      segments.map(localNameCarrier),
      false,
    );
  };

  const rawBindings = new Map<string, DirectJsonValue>();
  for (const [key, value] of parsed) {
    if (typeof value === "string" || Array.isArray(value)) {
      rawBindings.set(key, value);
    }
  }

  const resolvedBindings = new Map<string, LinkHandle>();
  const resolving = new Set<string>();

  let resolveRhs: (value: DirectJsonValue) => LinkHandle;

  const resolveName = (name: string): LinkHandle => {
    const bound = resolvedBindings.get(name);
    if (bound !== undefined) return bound;

    const raw = rawBindings.get(name);
    if (raw !== undefined) {
      if (resolving.has(name)) fail("cyclic-binding");
      resolving.add(name);
      const resolved = resolveRhs(raw);
      resolving.delete(name);
      resolvedBindings.set(name, resolved);
      return resolved;
    }

    return absoluteName(name);
  };

  const resolveEndpoint = (source: string): LinkHandle => {
    const trimmed = source.trim();
    if (trimmed.includes(":")) return contextualPath(trimmed);
    return resolveName(trimmed);
  };

  const resolveExpr = (source: string): LinkHandle => {
    const parts = source.split("->").map((part) => part.trim());
    if (parts.length === 0 || parts.some((part) => part.length === 0)) {
      return fail("invalid-shape");
    }

    let currentValue = resolveEndpoint(parts[0]!);
    for (let index = 1; index < parts.length; index += 1) {
      currentValue = memory.ensure(
        currentValue,
        resolveEndpoint(parts[index]!),
      );
    }
    return currentValue;
  };

  resolveRhs = (value: DirectJsonValue): LinkHandle => {
    if (typeof value === "string") return resolveExpr(value);

    if (Array.isArray(value)) {
      const elements = value.map((item) => {
        if (typeof item === "string") return resolveExpr(item);
        if (Array.isArray(item)) return resolveRhs(item);
        return fail("invalid-shape");
      });
      return materializeExactSequence(memory, elements);
    }

    return fail("invalid-shape");
  };

  for (const key of rawBindings.keys()) resolveName(key);

  const builder = new SyntaxAsetBuilder(
    memory,
    grammar.vocabulary,
  );

  const addBare = (value: LinkHandle): LinkHandle =>
    builder.addOccurrence(profile.bareForm, [
      { role: profile.bareValueRole, value },
    ]);

  const addBinding = (
    name: LinkHandle,
    value: LinkHandle,
  ): LinkHandle =>
    builder.addOccurrence(profile.bindingForm, [
      { role: profile.bindingNameRole, value: name },
      { role: profile.bindingValueRole, value },
    ]);

  const addBundle = (
    anchor: LinkHandle,
    body: LinkHandle,
  ): LinkHandle =>
    builder.addOccurrence(profile.bundleForm, [
      { role: profile.bundleAnchorRole, value: anchor },
      { role: profile.bundleBodyRole, value: body },
    ]);

  const addBlock = (entries: readonly LinkHandle[]): LinkHandle =>
    builder.addOccurrence(
      profile.blockForm,
      entries.map((value) => ({ role: profile.itemRole, value })),
    );

  const compileObject = (
    object: ReadonlyMap<string, DirectJsonValue>,
  ): LinkHandle => {
    const entries: LinkHandle[] = [];

    for (const [key, value] of object) {
      if (value instanceof Map) {
        const body = compileObject(value);
        entries.push(addBundle(resolveExpr(key), body));
        continue;
      }

      if (value === null) {
        entries.push(addBare(resolveExpr(key)));
        continue;
      }

      if (typeof value === "string" || Array.isArray(value)) {
        entries.push(
          addBinding(absoluteName(key), resolveRhs(value)),
        );
        continue;
      }

      return fail("invalid-shape");
    }

    return addBlock(entries);
  };

  return Object.freeze({
    sourceContent,
    sourceAset: builder.finish(compileObject(parsed)),
  });
}
