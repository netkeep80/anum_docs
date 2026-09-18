import {
  parseRawQuaternary,
  type AnumForm,
} from "./anum.js";
import {
  type LinkHandle,
  type ReadMemory,
  type RootBasis,
  type WriteMemory,
} from "./memory.js";

export type QuaternaryAnumErrorCode =
  | "trailing-after-root-close"
  | "unclosed-open"
  | "invalid-anum-representation";

export class QuaternaryAnumError extends Error {
  override readonly name = "QuaternaryAnumError";

  constructor(
    readonly code: QuaternaryAnumErrorCode,
    readonly offset: number | null = null,
  ) {
    super(offset === null ? code : `${code} at code-point offset ${offset}`);
  }
}

export type QuaternaryAnumBit = "0" | "1";

export interface QuaternaryAnumValueItem {
  readonly kind: "value";
  readonly abit: QuaternaryAnumBit;
  readonly link: LinkHandle;
}

export interface QuaternaryAnumChildItem {
  readonly kind: "child";
  readonly anum: QuaternaryAnumHierarchy;
}

export type QuaternaryAnumItem =
  | QuaternaryAnumValueItem
  | QuaternaryAnumChildItem;

/**
 * Host-side protocol representation of one local hierarchical Anum context.
 *
 * This is not a new ontology: `anumLink` is the actual Link in Memory.
 * `items` only preserves the source hierarchy needed to distinguish protocol
 * reading from pair topology while this bounded interpreter slice is executed.
 */
export interface QuaternaryAnumHierarchy {
  readonly anumLink: LinkHandle;
  readonly items: readonly QuaternaryAnumItem[];
}

export interface MaterializedQuaternaryAnum extends QuaternaryAnumHierarchy {
  /** True only when the top-level source contains an explicit closing `]`. */
  readonly rootClosed: boolean;
}

interface ParseResult {
  readonly hierarchy: QuaternaryAnumHierarchy;
  readonly next: number;
  readonly closed: boolean;
}

function bitLink(basis: RootBasis, abit: QuaternaryAnumBit): LinkHandle {
  return abit === "0" ? basis.U : basis.L;
}

function hierarchy(
  anumLink: LinkHandle,
  items: readonly QuaternaryAnumItem[],
): QuaternaryAnumHierarchy {
  return Object.freeze({
    anumLink,
    items: Object.freeze([...items]),
  });
}

function materializeContext(
  memory: WriteMemory,
  basis: RootBasis,
  form: AnumForm,
  from: number,
  nested: boolean,
): ParseResult {
  let current = basis.R;
  let index = from;
  const items: QuaternaryAnumItem[] = [];

  while (index < form.tokens.length) {
    const token = form.tokens[index];
    if (token === undefined) {
      throw new Error("internal Quaternary Anum token invariant violated");
    }

    if (token.abit === "]") {
      return Object.freeze({
        hierarchy: hierarchy(current, items),
        next: index + 1,
        closed: true,
      });
    }

    if (token.abit === "[") {
      const child = materializeContext(memory, basis, form, index + 1, true);
      if (!child.closed) {
        throw new QuaternaryAnumError("unclosed-open", token.offset);
      }
      items.push(Object.freeze({ kind: "child", anum: child.hierarchy }));
      current = memory.ensure(current, child.hierarchy.anumLink);
      index = child.next;
      continue;
    }

    const abit = token.abit;
    const value = bitLink(basis, abit);
    items.push(Object.freeze({ kind: "value", abit, link: value }));
    current = memory.ensure(current, value);
    index += 1;
  }

  if (nested) {
    const opener = form.tokens[from - 1];
    throw new QuaternaryAnumError("unclosed-open", opener?.offset ?? null);
  }

  return Object.freeze({
    hierarchy: hierarchy(current, items),
    next: index,
    closed: false,
  });
}

/**
 * Materialize the exact rooted hierarchical Anum represented by source.
 *
 * Every local context starts structurally at R. `]` closes the current
 * protocol context; at top level it completes the root interpretation rather
 * than appending the C Link as an ordinary value.
 */
export function materializeQuaternaryAnum(
  memory: WriteMemory,
  basis: RootBasis,
  source: string,
): MaterializedQuaternaryAnum {
  const form = parseRawQuaternary(source);
  const parsed = materializeContext(memory, basis, form, 0, false);

  if (parsed.next !== form.tokens.length) {
    const trailing = form.tokens[parsed.next];
    throw new QuaternaryAnumError(
      "trailing-after-root-close",
      trailing?.offset ?? null,
    );
  }

  return Object.freeze({
    anumLink: parsed.hierarchy.anumLink,
    items: parsed.hierarchy.items,
    rootClosed: parsed.closed,
  });
}

function exactNext(
  memory: ReadMemory,
  current: LinkHandle,
  value: LinkHandle,
): LinkHandle {
  const next = memory.find(current, value);
  if (next === undefined) {
    throw new QuaternaryAnumError("invalid-anum-representation");
  }
  return next;
}

function serializeHierarchy(
  memory: ReadMemory,
  basis: RootBasis,
  value: QuaternaryAnumHierarchy,
  stack: Set<QuaternaryAnumHierarchy>,
): string {
  if (stack.has(value)) {
    throw new QuaternaryAnumError("invalid-anum-representation");
  }
  stack.add(value);

  try {
    let exactCurrent = basis.R;
    let wire = "";

    for (const item of value.items) {
      if (item.kind === "value") {
        if (
          (item.abit !== "0" && item.abit !== "1") ||
          item.link !== bitLink(basis, item.abit)
        ) {
          throw new QuaternaryAnumError("invalid-anum-representation");
        }
        exactCurrent = exactNext(memory, exactCurrent, item.link);
        wire += item.abit;
        continue;
      }

      const childWire = serializeHierarchy(memory, basis, item.anum, stack);
      exactCurrent = exactNext(
        memory,
        exactCurrent,
        item.anum.anumLink,
      );
      wire += `[${childWire}]`;
    }

    if (exactCurrent !== value.anumLink) {
      throw new QuaternaryAnumError("invalid-anum-representation");
    }
    return wire;
  } finally {
    stack.delete(value);
  }
}

/**
 * Canonically serialize an already materialized hierarchical Quaternary Anum.
 *
 * This is deliberately not an inverse from arbitrary Link topology. The
 * hierarchy supplied by the production loader remains the protocol witness
 * that distinguishes bracket structure from coincident pair topology.
 *
 * Serialization is read-only: every hierarchy edge is verified with find()
 * and no missing Link is synthesized.
 */
export function serializeMaterializedQuaternaryAnum(
  memory: ReadMemory,
  basis: RootBasis,
  value: MaterializedQuaternaryAnum,
): string {
  const wire = serializeHierarchy(memory, basis, value, new Set());
  return value.rootClosed ? `${wire}]` : wire;
}

function resolveHierarchy(
  memory: ReadMemory,
  basis: RootBasis,
  value: QuaternaryAnumHierarchy,
): LinkHandle | undefined {
  let exactCurrent = basis.R;
  let resolvedCurrent: LinkHandle | undefined;
  let hasResolvedValue = false;

  for (const item of value.items) {
    const exactValue =
      item.kind === "value"
        ? item.link
        : item.anum.anumLink;

    const beforeOpen = exactCurrent;
    const nextExact = exactNext(memory, exactCurrent, exactValue);

    // [] is structurally neutral because R -> R is R. Since the local exact
    // current remains R, it must not manufacture a semantic first operand.
    if (
      item.kind === "child" &&
      beforeOpen === basis.R &&
      item.anum.anumLink === basis.R
    ) {
      exactCurrent = nextExact;
      continue;
    }

    let resolvedValue: LinkHandle | undefined;
    if (item.kind === "value") {
      resolvedValue = item.link;
    } else if (beforeOpen === basis.R) {
      // R[ is the indirection constructor. One hierarchy-wide Resolve removes
      // the parent/root level and therefore returns the exact child Anum Link.
      resolvedValue = item.anum.anumLink;
    } else {
      // After a non-root prefix, the child is the relative address of the next
      // pole and participates in the same one-level hierarchy shift.
      resolvedValue = resolveHierarchy(memory, basis, item.anum);
    }

    if (resolvedValue === undefined) {
      return undefined;
    }

    if (!hasResolvedValue) {
      resolvedCurrent = resolvedValue;
      hasResolvedValue = true;
    } else {
      const linked = memory.find(resolvedCurrent!, resolvedValue);
      if (linked === undefined) {
        return undefined;
      }
      resolvedCurrent = linked;
    }

    exactCurrent = nextExact;
  }

  if (exactCurrent !== value.anumLink) {
    throw new QuaternaryAnumError("invalid-anum-representation");
  }

  return hasResolvedValue ? resolvedCurrent : basis.R;
}

/**
 * Read-only one-pass associative Resolve.
 *
 * The function never calls ensure/materialize. If an addressed semantic Link
 * required by the one-level shift is absent from Memory, it returns undefined.
 * It never recursively dereferences the Link returned by this pass.
 */
export function resolveQuaternaryAnum(
  memory: ReadMemory,
  basis: RootBasis,
  value: QuaternaryAnumHierarchy,
): LinkHandle | undefined {
  return resolveHierarchy(memory, basis, value);
}
