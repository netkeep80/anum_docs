import { materializeExactSequence } from "./exact-sequence.js";
import {
  verifyRootBasis,
  type LinkHandle,
  type RootBasis,
  type WriteMemory,
} from "./memory.js";
import { readNativeSyntaxGrammar } from "./native-syntax-grammar.js";
import { SyntaxAsetBuilder } from "./syntax-aset-contract.js";
import { materializeV015ContextualNamePath } from "./v015-link-definition.js";
import { readV015SourceAnetProfile } from "./v015-source-anet.js";
import { materializeV012StringAnum } from "./v012-string-anum.js";

export type V015DirectSourceErrorCode =
  | "invalid-basis"
  | "invalid-shape"
  | "duplicate-local-name"
  | "cyclic-binding";

export class V015DirectSourceError extends Error {
  override readonly name = "V015DirectSourceError";
  constructor(readonly code: V015DirectSourceErrorCode) {
    super(code);
  }
}

export type V015DirectSourceSequenceItem =
  | Readonly<{ kind: "expression"; source: string }>
  | Readonly<{
      kind: "sequence";
      items: readonly V015DirectSourceSequenceItem[];
    }>;

export type V015DirectSourceRhs =
  | Readonly<{ kind: "expression"; source: string }>
  | Readonly<{
      kind: "sequence";
      items: readonly V015DirectSourceSequenceItem[];
    }>
  | Readonly<{
      kind: "bundle";
      entries: readonly V015DirectSourceEntry[];
    }>;

export interface V015DirectSourceEntry {
  readonly head: string;
  /** null means a bare source member, not an MTS null value. */
  readonly rhs: V015DirectSourceRhs | null;
}

function fail(code: V015DirectSourceErrorCode): never {
  throw new V015DirectSourceError(code);
}

function validSegment(segment: string): boolean {
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

function validateEntries(entries: readonly V015DirectSourceEntry[]): void {
  const seen = new Set<string>();
  for (const entry of entries) {
    if (entry.head.trim().length === 0) fail("invalid-shape");
    if (seen.has(entry.head)) fail("duplicate-local-name");
    seen.add(entry.head);
    if (entry.rhs?.kind === "bundle") validateEntries(entry.rhs.entries);
  }
}

/**
 * Common semantic-free lowering shared by direct FORMAL and direct JSON.
 *
 * Both surfaces must first produce V015DirectSourceEntry structures and then
 * call this function.  The output is the same native SyntaxAset profile:
 * block / bare / binding / bundle.  Semantic ANet membership is downstream in
 * denoteV015ResolvedSourceAnet and is deliberately absent here.
 */
export function compileV015DirectSourceEntries(
  memory: WriteMemory,
  basis: RootBasis,
  grammarRoot: LinkHandle,
  sourceAnetProfileRoot: LinkHandle,
  entries: readonly V015DirectSourceEntry[],
): LinkHandle {
  let verified: RootBasis;
  try {
    verified = verifyRootBasis(memory, basis);
  } catch {
    return fail("invalid-basis");
  }

  validateEntries(entries);

  const grammar = readNativeSyntaxGrammar(memory, verified, grammarRoot);
  const profile = readV015SourceAnetProfile(
    memory,
    verified,
    grammarRoot,
    sourceAnetProfileRoot,
  );

  const carrierCache = new Map<string, LinkHandle>();
  const localNameCarrier = (name: string): LinkHandle => {
    const known = carrierCache.get(name);
    if (known !== undefined) return known;
    const carrier = materializeV012StringAnum(
      memory,
      verified,
      new TextEncoder().encode(name),
    ).anumLink;
    carrierCache.set(name, carrier);
    return carrier;
  };

  const absoluteName = (name: string): LinkHandle => {
    if (name === "R") return verified.R;
    if (!validSegment(name)) fail("invalid-shape");
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
      if (segments.some((segment) => !validSegment(segment))) {
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
    if (segments.some((segment) => !validSegment(segment))) {
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

  // Preserve the currently proved direct-source contract: top-level scalar
  // bindings may refer to each other (including forward references).  Nested
  // bundle binding scope is a later explicit refinement, never a host stack.
  const rawBindings = new Map<string, V015DirectSourceRhs>();
  for (const entry of entries) {
    if (
      entry.rhs?.kind === "expression" ||
      entry.rhs?.kind === "sequence"
    ) {
      rawBindings.set(entry.head, entry.rhs);
    }
  }

  const resolvedBindings = new Map<string, LinkHandle>();
  const resolving = new Set<string>();

  let resolveRhs: (
    rhs: Extract<V015DirectSourceRhs, { kind: "expression" | "sequence" }>,
  ) => LinkHandle;

  const resolveName = (name: string): LinkHandle => {
    const bound = resolvedBindings.get(name);
    if (bound !== undefined) return bound;

    const raw = rawBindings.get(name);
    if (raw !== undefined && raw.kind !== "bundle") {
      if (resolving.has(name)) fail("cyclic-binding");
      resolving.add(name);
      const value = resolveRhs(raw);
      resolving.delete(name);
      resolvedBindings.set(name, value);
      return value;
    }

    return absoluteName(name);
  };

  const resolveEndpoint = (source: string): LinkHandle => {
    const trimmed = source.trim();
    if (trimmed.length === 0) return fail("invalid-shape");
    if (trimmed.includes(":")) return contextualPath(trimmed);
    return resolveName(trimmed);
  };

  const resolveExpr = (source: string): LinkHandle => {
    const parts = source.split("->").map((part) => part.trim());
    if (parts.length === 0 || parts.some((part) => part.length === 0)) {
      return fail("invalid-shape");
    }

    let current = resolveEndpoint(parts[0]!);
    for (let index = 1; index < parts.length; index += 1) {
      current = memory.ensure(current, resolveEndpoint(parts[index]!));
    }
    return current;
  };

  const resolveSequenceItem = (
    item: V015DirectSourceSequenceItem,
  ): LinkHandle => {
    if (item.kind === "expression") return resolveExpr(item.source);
    return materializeExactSequence(
      memory,
      item.items.map(resolveSequenceItem),
    );
  };

  resolveRhs = (rhs): LinkHandle => {
    if (rhs.kind === "expression") return resolveExpr(rhs.source);
    return materializeExactSequence(
      memory,
      rhs.items.map(resolveSequenceItem),
    );
  };

  for (const name of rawBindings.keys()) resolveName(name);

  const builder = new SyntaxAsetBuilder(memory, grammar.vocabulary);

  const addBare = (value: LinkHandle): LinkHandle =>
    builder.addOccurrence(profile.bareForm, [
      { role: profile.bareValueRole, value },
    ]);

  const addBinding = (name: LinkHandle, value: LinkHandle): LinkHandle =>
    builder.addOccurrence(profile.bindingForm, [
      { role: profile.bindingNameRole, value: name },
      { role: profile.bindingValueRole, value },
    ]);

  const addBundle = (anchor: LinkHandle, body: LinkHandle): LinkHandle =>
    builder.addOccurrence(profile.bundleForm, [
      { role: profile.bundleAnchorRole, value: anchor },
      { role: profile.bundleBodyRole, value: body },
    ]);

  const addBlock = (items: readonly LinkHandle[]): LinkHandle =>
    builder.addOccurrence(
      profile.blockForm,
      items.map((value) => ({ role: profile.itemRole, value })),
    );

  const compileBlock = (
    blockEntries: readonly V015DirectSourceEntry[],
  ): LinkHandle => {
    const items: LinkHandle[] = [];

    for (const entry of blockEntries) {
      if (entry.rhs === null) {
        items.push(addBare(resolveExpr(entry.head)));
        continue;
      }

      if (entry.rhs.kind === "bundle") {
        const body = compileBlock(entry.rhs.entries);
        items.push(addBundle(resolveExpr(entry.head), body));
        continue;
      }

      // Binder identity is separate from its resolved RHS.  A simple binder
      // is therefore the absolute contextual name itself, not resolveName()
      // (which would return its bound value).
      items.push(
        addBinding(absoluteName(entry.head), resolveRhs(entry.rhs)),
      );
    }

    return addBlock(items);
  };

  return builder.finish(compileBlock(entries));
}
