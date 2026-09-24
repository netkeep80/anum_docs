import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
} from "../src/memory.js";
import {
  defineContext,
  readContext,
  StateError,
} from "../src/state.js";

function assert(c: unknown, m: string): asserts c {
  if (!c) throw new Error(`v0.13 A69a END-prefix meta address: ${m}`);
}

function same<T>(actual: T, expected: T, m: string): void {
  assert(Object.is(actual, expected), `${m}: values differ`);
}

function expectThrows(fn: () => void, m: string): void {
  let threw = false;
  try {
    fn();
  } catch {
    threw = true;
  }
  assert(threw, m);
}

interface EndPrefixAddress {
  readonly depth: number;
  readonly body: LinkHandle;
}

/**
 * Read only the leading proper END-self-closed chain:
 *
 *   A                 => depth 0, body A
 *   END(A)            => depth 1, body A
 *   END(END(A))       => depth 2, body A
 *
 * ROOT is not a proper END node because both poles are self-closed.
 * START and PAIR stop the leading END prefix immediately.
 */
function readEndPrefix(
  memory: Memory,
  address: LinkHandle,
): EndPrefixAddress {
  let depth = 0;
  let body = address;
  const seen = new Set<LinkHandle>();

  while (true) {
    assert(!seen.has(body), "END prefix cycle");
    seen.add(body);

    const p = memory.poles(body);
    const startSelf = p.start === body;
    const endSelf = p.end === body;

    if (!endSelf || startSelf) {
      return Object.freeze({ depth, body });
    }

    depth += 1;
    body = p.start;
  }
}

function contextBoundary(
  memory: Memory,
  context: LinkHandle,
): LinkHandle {
  let current = context;
  const seen = new Set<LinkHandle>();

  while (true) {
    assert(!seen.has(current), "Context ancestry cycle");
    seen.add(current);

    try {
      current = readContext(memory, current).parent;
    } catch (error) {
      if (error instanceof StateError && error.code === "invalid-context") {
        return current;
      }
      throw error;
    }
  }
}

interface MetaAddressResolution {
  readonly depth: number;
  readonly scope: LinkHandle;
  readonly body: LinkHandle;
}

/**
 * Interpret the leading END depth solely as relative movement along the
 * selected C-rooted Context ancestry.
 *
 * depth 0  => current Context
 * depth 1  => parent Context
 * ...
 * final available level => C boundary itself
 *
 * The body is carried unchanged. This function does not interpret the body;
 * it proves only the address-space geometry.
 */
function resolveMetaAddress(
  memory: Memory,
  contextRoot: LinkHandle,
  currentContext: LinkHandle,
  address: LinkHandle,
): MetaAddressResolution {
  same(
    contextBoundary(memory, currentContext),
    contextRoot,
    "selected current Context belongs to selected context space",
  );

  const parsed = readEndPrefix(memory, address);
  let scope = currentContext;

  for (let i = 0; i < parsed.depth; i += 1) {
    if (scope === contextRoot) {
      throw new Error("meta-address escapes selected context-space root");
    }
    scope = readContext(memory, scope).parent;
  }

  return Object.freeze({
    depth: parsed.depth,
    scope,
    body: parsed.body,
  });
}

function endN(memory: Memory, body: LinkHandle, depth: number): LinkHandle {
  let current = body;
  for (let i = 0; i < depth; i += 1) {
    current = memory.ensureEndSelfClosed(current);
  }
  return current;
}

function exercise(noise: boolean): void {
  const memory = new Memory();
  const b = ensureRootBasis(memory);
  const C = b.C;

  if (noise) {
    memory.ensure(memory.ensure(b.U, b.C), memory.ensure(b.O, b.L));
  }

  // Two independent C-rooted execution trees.
  const a0 = memory.ensure(b.L, b.U);
  const a1 = memory.ensure(b.O, b.C);
  const a2 = memory.ensure(a0, a1);
  const a3 = memory.ensure(a1, a2);

  const eA = defineContext(memory, C, a0);
  const kA1 = defineContext(memory, eA, a1);
  const kA2 = defineContext(memory, kA1, a2);
  const kA3 = defineContext(memory, kA2, a3);

  const b0 = memory.ensure(b.C, b.L);
  const b1 = memory.ensure(b.U, b.O);
  const eB = defineContext(memory, C, b0);
  const kB1 = defineContext(memory, eB, b1);
  const kB2 = defineContext(memory, kB1, a2);
  const kB3 = defineContext(memory, kB2, a3);

  same(contextBoundary(memory, kA3), C, "A tree boundary");
  same(contextBoundary(memory, kB3), C, "B tree boundary");

  // Body deliberately has ordinary PAIR topology, so it contributes no END
  // depth of its own.
  const body = memory.ensure(b.L, b.C);
  const bp = memory.poles(body);
  assert(bp.start !== body && bp.end !== body, "address body is ordinary PAIR");

  const local = body;
  const up1 = endN(memory, body, 1);
  const up2 = endN(memory, body, 2);
  const up3 = endN(memory, body, 3);
  const up4 = endN(memory, body, 4);
  const up5 = endN(memory, body, 5);

  same(readEndPrefix(memory, local).depth, 0, "local address END depth");
  same(readEndPrefix(memory, up1).depth, 1, "one-level END depth");
  same(readEndPrefix(memory, up2).depth, 2, "two-level END depth");
  same(readEndPrefix(memory, up5).depth, 5, "five-level END depth");
  same(readEndPrefix(memory, up5).body, body, "END prefix preserves exact body");

  // Local/internal address stays in current Context.
  let r = resolveMetaAddress(memory, C, kA3, local);
  same(r.depth, 0, "local depth");
  same(r.scope, kA3, "local address stays in current Context");
  same(r.body, body, "local body");

  // Repeated leading END forms walk one Context parent per level.
  r = resolveMetaAddress(memory, C, kA3, up1);
  same(r.scope, kA2, "END(A) selects one enclosing Context");
  same(r.body, body, "one-level body preserved");

  r = resolveMetaAddress(memory, C, kA3, up2);
  same(r.scope, kA1, "END(END(A)) selects two enclosing Contexts");

  r = resolveMetaAddress(memory, C, kA3, up3);
  same(r.scope, eA, "three ENDs select entry Context");

  r = resolveMetaAddress(memory, C, kA3, up4);
  same(r.scope, C, "four ENDs reach outer C context-space boundary");

  expectThrows(
    () => resolveMetaAddress(memory, C, kA3, up5),
    "END prefix cannot escape beyond selected C boundary",
  );

  // Same relative address resolves against the selected execution branch,
  // exactly like contextual addressing rather than a global absolute lookup.
  const aTwo = resolveMetaAddress(memory, C, kA3, up2);
  const bTwo = resolveMetaAddress(memory, C, kB3, up2);
  same(aTwo.scope, kA1, "A branch two-level meta address");
  same(bTwo.scope, kB1, "B branch two-level meta address");
  assert(aTwo.scope !== bTwo.scope,
    "same END depth is branch-relative, not global absolute addressing");

  // At entry depth, one END reaches C. A second END is an overrun.
  const entryUp = resolveMetaAddress(memory, C, eA, up1);
  same(entryUp.scope, C, "END from entry reaches C boundary");
  expectThrows(
    () => resolveMetaAddress(memory, C, eA, up2),
    "two ENDs from entry escape C and fail closed",
  );

  // START chirality does not mean "go outward". A leading START wrapper is
  // carried as part of the local body and keeps meta depth zero.
  const startBody = memory.ensureStartSelfClosed(body);
  const startAddress = readEndPrefix(memory, startBody);
  same(startAddress.depth, 0, "leading START has zero meta depth");
  same(startAddress.body, startBody, "leading START remains local body");
  same(
    resolveMetaAddress(memory, C, kA3, startBody).scope,
    kA3,
    "START-prefixed form remains in current Context",
  );

  // An END nested below a PAIR is not a leading meta-address prefix.
  const nestedEnd = memory.ensure(up1, b.U);
  const nested = readEndPrefix(memory, nestedEnd);
  same(nested.depth, 0, "PAIR containing END is not outward address prefix");
  same(nested.body, nestedEnd, "nested END remains ordinary local body");

  // C itself is END(R), so as an address value it structurally carries exactly
  // one leading END with body R. Context-root role and address role are
  // interpretation-relative views of the same Link.
  const cAddress = readEndPrefix(memory, C);
  same(cAddress.depth, 1, "C=END(R) has one END prefix structurally");
  same(cAddress.body, b.R, "C END-prefix body is R");

  // The address resolver is read-only. Recursive meta depth is represented by
  // recursive END topology, not a fixed host table of $, $$, $$$, ...
  const beforeRead = memory.linkCount;
  for (let depth = 0; depth <= 4; depth += 1) {
    resolveMetaAddress(memory, C, kA3, endN(memory, body, depth));
  }
  const afterConstruction = memory.linkCount;
  // endN above may only re-materialize already-existing canonical wrappers.
  same(afterConstruction, beforeRead,
    "re-reading already-built END depths adds no Links");

  // Foreign context space is rejected even for depth zero: the selected current
  // Context is part of the address authority.
  const foreign = defineContext(memory, memory.root, a0);
  expectThrows(
    () => resolveMetaAddress(memory, C, foreign, local),
    "foreign non-C-rooted Context rejected",
  );
}

function staticGuards(): void {
  const root = resolve(process.cwd(), "..");
  const own = readFileSync(
    join(root, "ts/test/research-v013-end-prefix-meta-address-a69a.test.ts"),
    "utf8",
  );

  const readStart = own.indexOf("function readEndPrefix(");
  const resolveEnd = own.indexOf("\nfunction endN(", readStart);
  assert(readStart >= 0 && resolveEnd > readStart, "A69a core source slice");
  const core = own.slice(readStart, resolveEnd);

  for (const forbidden of [
    ".ensure(",
    "ensureStartSelfClosed",
    "ensureEndSelfClosed",
    ".find(",
    ".outgoing(",
    ".incoming(",
    "allLinks(",
    "switch",
    "$ent",
    "$obj",
    "$sub",
    "$rel",
  ]) {
    assert(!core.includes(forbidden),
      `A69a resolver excludes external addressing primitive ${forbidden}`);
  }

  assert(core.includes("const endSelf = p.end === body"),
    "meta depth derives from END self-incidence");
  assert(core.includes("scope = readContext(memory, scope).parent"),
    "one END level maps to one Context-parent step");
  assert(core.includes("contextBoundary(memory, currentContext)"),
    "meta address is scoped to selected C-rooted Context space");
}

function main(): void {
  exercise(false);
  exercise(true);
  staticGuards();

  console.log([
    "MTS v0.13 A69a: END_PREFIX_META_CONTEXT_ADDRESSING=GREEN_SCOPED_RESEARCH",
    "LOCAL_ADDRESS=ZERO_LEADING_END_CURRENT_CONTEXT",
    "META_DEPTH=COUNT_OF_LEADING_PROPER_END_SELF_CLOSURES",
    "ONE_END=ONE_PARENT_CONTEXT",
    "N_END=N_PARENT_CONTEXTS",
    "ULTIMATE_OUTER_SCOPE=C_END_R",
    "ESCAPE_BEYOND_C=FAIL_CLOSED",
    "SAME_ADDRESS_DEPTH=BRANCH_RELATIVE",
    "START_PREFIX=LOCAL_NOT_OUTWARD",
    "NESTED_NONLEADING_END=LOCAL_BODY",
    "ADDRESS_BODY=PRESERVED_EXACTLY",
    "C_AS_ADDRESS=ONE_END_OF_R",
    "SPECIAL_DOLLAR_SYMBOL_REQUIRED=NO",
    "FIXED_META_DEPTH_TABLE_REQUIRED=NO",
    "AMBIENT_MEMORY_SCAN=0 RESOLVER_WRITES=0",
    "JSONRVM_DOLLAR_CHAIN=HISTORICAL_ANALOGY_ONLY",
    "BODY_INTERPRETATION_AT_RESOLVED_SCOPE=NOT_TESTED",
    "NEXT=A69B_COMPOSE_META_SCOPE_WITH_LOCAL_ADDRESS_OR_EXECUTION",
    "FULL_SELF_HOSTED=FALSE",
    "V013_NOT_ACCEPTED PRODUCTION_UNCHANGED",
  ].join(" "));
}

main();
