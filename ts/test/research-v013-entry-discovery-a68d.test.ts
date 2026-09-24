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
} from "../src/state.js";

function assert(c: unknown, m: string): asserts c {
  if (!c) throw new Error(`v0.13 A68d entry discovery: ${m}`);
}

function same<T>(actual: T, expected: T, m: string): void {
  assert(Object.is(actual, expected), `${m}: values differ`);
}

function setSame(
  actual: readonly LinkHandle[],
  expected: readonly LinkHandle[],
  m: string,
): void {
  same(new Set(actual).size, new Set(expected).size, `${m}: cardinality`);
  for (const x of expected) {
    assert(actual.includes(x), `${m}: missing expected Link`);
  }
}

/**
 * Discover concrete execution entries rooted directly at the selected
 * context-space boundary:
 *
 *   payload = C -> S0
 *   K0      = START(payload) = K0 -> payload
 *
 * Discovery is intentionally read-only. Physical existence of K0 is the
 * activation mark; no separate registry, flag, opcode or host list is read.
 *
 * outgoing(C) enumerates only candidate entry payloads. incoming(payload)
 * then locates an already-existing START-self-closed wrapper without calling
 * ensureStartSelfClosed(), which would incorrectly create an activation.
 */
function discoverEntryContexts(
  memory: Memory,
  contextRoot: LinkHandle,
): readonly LinkHandle[] {
  const discovered: LinkHandle[] = [];
  const seen = new Set<LinkHandle>();

  for (const payload of memory.outgoing(contextRoot)) {
    const p = memory.poles(payload);
    if (p.start !== contextRoot) continue;

    for (const candidate of memory.incoming(payload)) {
      if (seen.has(candidate)) continue;
      const c = memory.poles(candidate);
      if (c.start !== candidate || c.end !== payload) continue;

      const state = readContext(memory, candidate);
      same(state.parent, contextRoot, "discovered entry parent");
      same(state.current, p.end, "discovered entry state");

      seen.add(candidate);
      discovered.push(candidate);
    }
  }

  return Object.freeze(discovered);
}

function statesOf(
  memory: Memory,
  entries: readonly LinkHandle[],
): readonly LinkHandle[] {
  return Object.freeze(entries.map((entry) => readContext(memory, entry).current));
}

function exercise(noise: boolean): void {
  const memory = new Memory();
  const b = ensureRootBasis(memory);
  const C = b.C;

  if (noise) {
    memory.ensure(memory.ensure(b.U, b.C), memory.ensure(b.O, b.L));
    memory.ensureEndSelfClosed(memory.ensure(b.L, b.U));
  }

  const sA = memory.ensure(b.L, b.U);
  const sB = memory.ensure(b.O, b.C);
  const sChild = memory.ensure(sA, sB);
  const sOther = memory.ensure(b.C, b.L);

  // The C->S payload alone is not activation.
  const payloadA = memory.ensure(C, sA);
  const beforeFirstDiscovery = memory.linkCount;
  same(discoverEntryContexts(memory, C).length, 0,
    "bare C->S payload does not activate");
  same(memory.linkCount, beforeFirstDiscovery,
    "discovery of bare payload is read-only");

  // END-wrapping the same payload is also not activation. Entry is
  // specifically the START-self-closed form rooted through C.
  const wrongChirality = memory.ensureEndSelfClosed(payloadA);
  assert(wrongChirality !== payloadA, "END wrapper fixture is distinct");
  same(discoverEntryContexts(memory, C).length, 0,
    "END-wrapped C->S payload is not an entry");

  // The exact same payload becomes discoverable as soon as its START wrapper
  // physically exists. No registry mutation accompanies this.
  const entryA = memory.ensureStartSelfClosed(payloadA);
  same(entryA, defineContext(memory, C, sA),
    "generic START(C->S) and Context(C,S) are exact same entry identity");

  const afterEntryA = discoverEntryContexts(memory, C);
  setSame(afterEntryA, [entryA], "one physical K0 activates one entry");
  same(statesOf(memory, afterEntryA)[0], sA, "entry A state");

  // A second direct child of C is a second independent entry root.
  const entryB = defineContext(memory, C, sB);
  const afterEntryB = discoverEntryContexts(memory, C);
  setSame(afterEntryB, [entryA, entryB], "two C-rooted entries discovered");

  // Context descendants are execution growth, not new top-level entries.
  const child = defineContext(memory, entryA, sChild);
  const grandchild = defineContext(memory, child, sOther);
  const withDescendants = discoverEntryContexts(memory, C);
  setSame(withDescendants, [entryA, entryB],
    "child Context growth does not create new C-rooted entry");
  assert(!withDescendants.includes(child), "child is not top-level entry");
  assert(!withDescendants.includes(grandchild), "grandchild is not top-level entry");

  // Existing R/O rooted Contexts and ordinary START values are outside the C
  // entry namespace and remain inert to this discovery rule.
  const rContext = defineContext(memory, memory.root, sA);
  const oContext = defineContext(memory, b.O, sB);
  const ordinaryStart = memory.ensureStartSelfClosed(sOther);
  const afterForeignRoots = discoverEntryContexts(memory, C);
  setSame(afterForeignRoots, [entryA, entryB],
    "R/O rooted contexts and ordinary START values are not entries");
  assert(!afterForeignRoots.includes(rContext), "R-rooted Context excluded");
  assert(!afterForeignRoots.includes(oContext), "O-rooted Context excluded");
  assert(!afterForeignRoots.includes(ordinaryStart), "ordinary START excluded");

  // An ordinary incoming Link to an entry payload is not enough. START
  // self-incidence is part of the entry marker itself.
  const fakeStart = memory.ensure(sOther, payloadA);
  assert(memory.poles(fakeStart).start !== fakeStart,
    "fake incoming Link is not START-self-closed");
  setSame(discoverEntryContexts(memory, C), [entryA, entryB],
    "ordinary incoming Link to payload cannot activate");

  // The basis already contains U=C->O. It is only a candidate payload until
  // START(U) physically exists. This is an important topology-only boundary:
  // constructor/API provenance does not matter.
  const uPayload = b.U;
  const u = memory.poles(uPayload);
  same(u.start, C, "U is an existing C-rooted payload");
  same(u.end, b.O, "U payload state is O");
  assert(!discoverEntryContexts(memory, C).some(
    (entry) => readContext(memory, entry).current === b.O,
  ), "basis U alone does not activate O-state entry");

  const entryO = memory.ensureStartSelfClosed(uPayload);
  const withEntryO = discoverEntryContexts(memory, C);
  setSame(withEntryO, [entryA, entryB, entryO],
    "physical START(U) becomes ordinary C-rooted entry");
  same(readContext(memory, entryO).parent, C, "entryO parent");
  same(readContext(memory, entryO).current, b.O, "entryO state");

  // Discovery is purely structural and read-only even when repeated.
  const beforeReplay = memory.linkCount;
  const replay1 = discoverEntryContexts(memory, C);
  const replay2 = discoverEntryContexts(memory, C);
  setSame(replay1, replay2, "repeated discovery returns same entry set");
  same(memory.linkCount, beforeReplay, "repeated discovery writes no Links");

  // Presence is therefore sufficient for discovery, but canonical identity
  // also means this experiment does NOT yet solve repeated activation,
  // consumption, completion or re-arming of the same K0.
}

function staticGuards(): void {
  const root = resolve(process.cwd(), "..");
  const own = readFileSync(
    join(root, "ts/test/research-v013-entry-discovery-a68d.test.ts"),
    "utf8",
  );
  const begin = own.indexOf("function discoverEntryContexts(");
  const end = own.indexOf("\nfunction statesOf(", begin);
  assert(begin >= 0 && end > begin, "A68d discovery source slice");
  const core = own.slice(begin, end);

  for (const forbidden of [
    ".ensure(",
    "ensureStartSelfClosed",
    "ensureEndSelfClosed",
    ".find(",
    "allLinks(",
    "defineContext(",
    ".delete(",
    ".remove(",
    "switch",
  ]) {
    assert(!core.includes(forbidden),
      `A68d discovery excludes host/constructive primitive ${forbidden}`);
  }

  assert(core.includes("memory.outgoing(contextRoot)"),
    "entry discovery starts only from selected context root");
  assert(core.includes("memory.incoming(payload)"),
    "entry discovery observes existing wrapper without materialization");
  assert(core.includes("c.start !== candidate || c.end !== payload"),
    "entry requires exact START self-incidence");
  assert(core.includes("readContext(memory, candidate)"),
    "discovered entry validates through generic Context reader");
}

function main(): void {
  exercise(false);
  exercise(true);
  staticGuards();

  console.log([
    "MTS v0.13 A68d: LINK_NATIVE_ENTRY_DISCOVERY=GREEN_SCOPED_RESEARCH",
    "CONTEXT_SPACE_ROOT=C_END_R",
    "ENTRY_K0=START_C_TO_S0",
    "ENTRY_ACTIVATION=PHYSICAL_K0_EXISTENCE",
    "SEPARATE_ENTRY_REGISTRY=0 SEPARATE_FLAG=0 SEPARATE_OPCODE=0",
    "DISCOVERY=READ_ONLY",
    "BARE_C_TO_STATE_PAYLOAD=INERT",
    "END_WRAPPED_PAYLOAD=INERT",
    "DIRECT_C_ROOTED_START_CONTEXT=DISCOVERED",
    "CHILD_CONTEXTS=NOT_TOP_LEVEL_ENTRIES",
    "R_ROOTED_CONTEXT=INERT O_ROOTED_CONTEXT=INERT ORDINARY_START=INERT",
    "ORDINARY_INCOMING_TO_PAYLOAD=INERT",
    "BASIS_U_C_TO_O=INERT_UNTIL_START_U_EXISTS",
    "GENERIC_START_AND_DEFINE_CONTEXT_PROVENANCE=SEMANTICALLY_IRRELEVANT",
    "AMBIENT_GLOBAL_ALL_LINK_SCAN=0",
    "ENTRY_DISCOVERY_USES_C_SCOPED_OUTGOING_PLUS_PAYLOAD_INCOMING_INDEX",
    "REPEATED_DISCOVERY=CANONICAL_SAME_ENTRY_SET",
    "ACTIVATION_CONSUMPTION_REARMING=OPEN",
    "NEXT=A69_END_PREFIX_META_CONTEXT_ADDRESSING",
    "FULL_SELF_HOSTED=FALSE",
    "V013_NOT_ACCEPTED PRODUCTION_UNCHANGED",
  ].join(" "));
}

main();
