import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type ReadMemory,
} from "../src/memory.js";
import {
  exportCanonicalTopology,
  type CanonicalTopologyExport,
} from "../src/canonical-topology.js";
import {
  restoreTopology,
  type StorageTopologyImage,
} from "../src/persistence-topology.js";
import {
  defineContext,
  readContext,
  StateError,
} from "../src/state.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`v0.15 A5 self-contained Context freeze/resume: ${message}`);
  }
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}

function sameNumberSet(
  actual: readonly number[],
  expected: readonly number[],
  message: string,
): void {
  const a = [...new Set(actual)].sort((x, y) => x - y);
  const e = [...new Set(expected)].sort((x, y) => x - y);
  same(a.length, e.length, `${message}: cardinality`);
  for (let index = 0; index < a.length; index += 1) {
    same(a[index], e[index], `${message}: coordinate[${index}]`);
  }
}

function contextOrUndefined(
  memory: ReadMemory,
  value: LinkHandle,
): { readonly parent: LinkHandle; readonly current: LinkHandle } | undefined {
  try {
    return readContext(memory, value);
  } catch (error) {
    if (error instanceof StateError && error.code === "invalid-context") {
      return undefined;
    }
    throw error;
  }
}

/**
 * Derive the direct-gauge END boundary only from rooted Link topology.
 *
 * No RootBasis sidecar, Context pointer or all-links scan is supplied.
 * The candidate is the unique proper END-self-closed Link rooted at R:
 *
 *   C = R -> C
 */
function deriveDirectGaugeEndBoundary(memory: ReadMemory): LinkHandle {
  const R = memory.root;
  const candidates: LinkHandle[] = [];

  for (const candidate of memory.outgoing(R)) {
    if (candidate === R) continue;
    const poles = memory.poles(candidate);
    if (poles.start === R && poles.end === candidate) {
      candidates.push(candidate);
    }
  }

  same(candidates.length, 1, "exactly one proper R-rooted END boundary");
  return candidates[0]!;
}

/**
 * Read already-existing direct execution entries:
 *
 *   payload = C -> S0
 *   K0      = START(payload)
 *
 * Bare C->S0 data is inert. Entry activation is the physical START wrapper.
 */
function discoverEntriesFromMemory(memory: ReadMemory): readonly LinkHandle[] {
  const C = deriveDirectGaugeEndBoundary(memory);
  const entries: LinkHandle[] = [];
  const seen = new Set<LinkHandle>();

  for (const payload of memory.outgoing(C)) {
    const p = memory.poles(payload);
    if (p.start !== C || p.end === payload) continue;

    for (const candidate of memory.incoming(payload)) {
      if (seen.has(candidate)) continue;
      const c = memory.poles(candidate);
      if (c.start !== candidate || c.end !== payload) continue;

      const state = contextOrUndefined(memory, candidate);
      if (state === undefined || state.parent !== C || state.current !== p.end) {
        continue;
      }

      seen.add(candidate);
      entries.push(candidate);
    }
  }

  return Object.freeze(entries);
}

function childContexts(
  memory: ReadMemory,
  parent: LinkHandle,
): readonly LinkHandle[] {
  const children: LinkHandle[] = [];
  const seen = new Set<LinkHandle>();

  for (const payload of memory.outgoing(parent)) {
    const p = memory.poles(payload);
    if (p.start !== parent || p.end === payload) continue;

    for (const candidate of memory.incoming(payload)) {
      if (seen.has(candidate)) continue;
      const c = memory.poles(candidate);
      if (c.start !== candidate || c.end !== payload) continue;

      const state = contextOrUndefined(memory, candidate);
      if (state === undefined || state.parent !== parent || state.current !== p.end) {
        continue;
      }

      seen.add(candidate);
      children.push(candidate);
    }
  }

  return Object.freeze(children);
}

function closureOf(
  memory: ReadMemory,
  context: LinkHandle,
): LinkHandle | undefined {
  let closure: LinkHandle | undefined;

  for (const candidate of memory.outgoing(context)) {
    const poles = memory.poles(candidate);
    if (
      poles.start !== context ||
      poles.end !== candidate ||
      poles.start === candidate
    ) {
      continue;
    }
    assert(
      closure === undefined || closure === candidate,
      "multiple proper END closures for one Context",
    );
    closure = candidate;
  }

  return closure;
}

/**
 * Derive the complete active frontier from the A-memory topology alone.
 *
 * This intentionally remains a host-side read-only oracle:
 * the test proves self-DESCRIBING freeze/resume state, not yet a self-hosted
 * generalized-MP construction of currentness.
 */
function deriveActiveFrontier(memory: ReadMemory): readonly LinkHandle[] {
  const active: LinkHandle[] = [];
  const visited = new Set<LinkHandle>();
  const visiting = new Set<LinkHandle>();

  const walk = (context: LinkHandle): void => {
    assert(!visiting.has(context), "Context child cycle");
    if (visited.has(context)) return;
    visiting.add(context);

    const children = childContexts(memory, context);
    const closure = closureOf(memory, context);

    if (children.length > 0) {
      assert(
        closure === undefined,
        "closed non-leaf Context remains invalid lifecycle topology",
      );
      for (const child of children) walk(child);
    } else if (closure === undefined) {
      active.push(context);
    }

    visiting.delete(context);
    visited.add(context);
  };

  for (const entry of discoverEntriesFromMemory(memory)) {
    walk(entry);
  }

  return Object.freeze(active);
}

function coordinatesOf(
  exported: CanonicalTopologyExport,
  links: readonly LinkHandle[],
): readonly number[] {
  return Object.freeze(
    links.map((link) => {
      const coordinate = exported.coordinates.get(link);
      assert(coordinate !== undefined, "active Link missing canonical coordinate");
      return coordinate;
    }),
  );
}

function transferredImage(
  image: StorageTopologyImage,
): StorageTopologyImage {
  return JSON.parse(JSON.stringify(image)) as StorageTopologyImage;
}

function exercise(noise: boolean): void {
  const memory = new Memory();
  const b = ensureRootBasis(memory);

  if (noise) {
    memory.ensure(memory.ensure(b.U, b.C), memory.ensure(b.O, b.L));
    memory.ensureEndSelfClosed(memory.ensure(b.L, b.U));
  }

  const s0 = memory.ensure(b.L, b.U);
  const s1 = memory.ensure(b.O, b.L);
  const s2a = memory.ensure(b.C, b.L);
  const s2b = memory.ensure(b.U, b.C);
  const s3 = memory.ensure(s0, s1);
  const sEntryB = memory.ensure(s2a, s2b);
  const sBare = memory.ensure(s1, s2a);
  const sForeign = memory.ensure(s2b, s0);

  // Entry A grows and branches. One sibling closes; the other continues.
  const entryA = defineContext(memory, b.C, s0);
  const k1 = defineContext(memory, entryA, s1);
  const k2a = defineContext(memory, k1, s2a);
  const k2b = defineContext(memory, k1, s2b);
  memory.ensureEndSelfClosed(k2a);
  const k3 = defineContext(memory, k2b, s3);

  // Independent entry B remains active.
  const entryB = defineContext(memory, b.C, sEntryB);

  // These must remain inert to entry/frontier discovery.
  memory.ensure(b.C, sBare); // bare C->state only
  defineContext(memory, b.O, sForeign); // foreign O-rooted Context
  memory.ensureStartSelfClosed(memory.ensure(b.L, sForeign)); // ordinary START value

  const beforeDiscovery = memory.linkCount;
  const entriesA = discoverEntriesFromMemory(memory);
  const frontierA = deriveActiveFrontier(memory);
  same(memory.linkCount, beforeDiscovery, "discovery is read-only");
  same(entriesA.length, 2, "two C-rooted entries discovered");
  same(frontierA.length, 2, "two active leaves before freeze");
  assert(frontierA.includes(k3), "continued branch K3 is active");
  assert(frontierA.includes(entryB), "independent entry B is active");
  assert(!frontierA.includes(k2a), "END-closed sibling is inactive");

  // Freeze exactly the whole topology. No execution sidecar is serialized.
  const canonicalA = exportCanonicalTopology(memory);
  const entryCoordinatesA = coordinatesOf(canonicalA, entriesA);
  const frontierCoordinatesA = coordinatesOf(canonicalA, frontierA);
  const transferred = transferredImage(canonicalA.topology);

  // Restore into a fresh Memory. Old handles are invalid here by construction.
  const restored = restoreTopology(transferred);
  const beforeRestoredDiscovery = restored.linkCount;

  // Root basis reconstruction is allowed only as an audit assertion here:
  // all basis Links must already exist and this call must allocate nothing.
  ensureRootBasis(restored);
  same(
    restored.linkCount,
    beforeRestoredDiscovery,
    "restored topology already contains complete root basis",
  );

  const entriesB = discoverEntriesFromMemory(restored);
  const frontierB = deriveActiveFrontier(restored);
  same(
    restored.linkCount,
    beforeRestoredDiscovery,
    "restored frontier discovery is read-only",
  );

  const canonicalB = exportCanonicalTopology(restored);
  same(
    JSON.stringify(canonicalB.topology),
    JSON.stringify(canonicalA.topology),
    "canonical whole-memory topology survives freeze/transfer/restore",
  );
  sameNumberSet(
    coordinatesOf(canonicalB, entriesB),
    entryCoordinatesA,
    "entry identity reconstructed without sidecar",
  );
  sameNumberSet(
    coordinatesOf(canonicalB, frontierB),
    frontierCoordinatesA,
    "active frontier reconstructed without sidecar",
  );

  // Resume structurally from a reconstructed active leaf, then freeze again.
  // The test obtains the leaf from deriveActiveFrontier(restored), not from an
  // externally preserved Context handle.
  const k3Coordinate = canonicalA.coordinates.get(k3);
  assert(k3Coordinate !== undefined, "sender K3 coordinate exists");
  const resumedParent = frontierB.find(
    (candidate) => canonicalB.coordinates.get(candidate) === k3Coordinate,
  );
  assert(resumedParent !== undefined, "restored K3 found from reconstructed frontier");

  const restoredBasis = ensureRootBasis(restored);
  const resumedState = restored.ensure(restoredBasis.L, restoredBasis.C);
  const resumedChild = defineContext(restored, resumedParent, resumedState);

  const frontierAfterResume = deriveActiveFrontier(restored);
  assert(!frontierAfterResume.includes(resumedParent), "resumed parent leaves the active frontier");
  assert(frontierAfterResume.includes(resumedChild), "new child becomes active");

  const canonicalAfterResume = exportCanonicalTopology(restored);
  const frontierAfterResumeCoordinates = coordinatesOf(
    canonicalAfterResume,
    frontierAfterResume,
  );
  const secondRestored = restoreTopology(
    transferredImage(canonicalAfterResume.topology),
  );
  const secondCanonical = exportCanonicalTopology(secondRestored);
  const secondFrontier = deriveActiveFrontier(secondRestored);

  sameNumberSet(
    coordinatesOf(secondCanonical, secondFrontier),
    frontierAfterResumeCoordinates,
    "frontier remains reconstructible after resumed execution growth",
  );

  // The whole test uses no serialized current/context/scope/PC sidecar.
  same(
    Object.keys(transferred).sort().join(","),
    "links,root,schema",
    "storage image contains topology only",
  );
}

function staticGuards(): void {
  const own = readFileSync(
    resolve(
      process.cwd(),
      "test/v015-self-contained-context-freeze-resume-a5.test.ts",
    ),
    "utf8",
  );

  const begin = own.indexOf("function deriveDirectGaugeEndBoundary(");
  const end = own.indexOf("\nfunction coordinatesOf(", begin);
  assert(begin >= 0 && end > begin, "frontier derivation source slice");
  const core = own.slice(begin, end);

  for (const forbidden of [
    ".allLinks(",
    ".ensure(",
    "ensureRootBasis(",
    "defineContext(",
    "currentContextId",
    "currentScope",
    "programCounter",
    "selectedScope",
    "selectedEntry",
  ]) {
    assert(!core.includes(forbidden), `derivation excludes external/constructive authority: ${forbidden}`);
  }

  assert(core.includes("memory.root"), "boundary derives from ROOT");
  assert(core.includes("memory.outgoing(R)"), "END boundary found by rooted incidence");
  assert(core.includes("memory.outgoing(C)"), "entry discovery is C-scoped");
  assert(core.includes("memory.incoming(payload)"), "START activation observed structurally");
  assert(core.includes("closureOf(memory, context)"), "branch completion is Link-native END evidence");

  const model = JSON.parse(
    readFileSync(
      resolve(process.cwd(), "../profiles/mts-v015-meta-interpreter-model.json"),
      "utf8",
    ),
  ) as {
    contextCandidate: {
      status: string;
      directGaugeBoundary: string;
      authorDecision: string;
      acceptanceScope: string;
      chiralityNote: string;
    };
    decisionLedger: readonly {
      id: string;
      status: string;
      decision?: string;
    }[];
  };

  same(model.contextCandidate.status, "PROVED_RESEARCH", "C boundary evidence status");
  same(model.contextCandidate.directGaugeBoundary, "C", "direct-gauge execution boundary");
  same(model.contextCandidate.authorDecision, "APPROVED_FOR_V015", "Author decision for C boundary");
  same(
    model.contextCandidate.acceptanceScope,
    "V0.15_DESIGN_DECISION_NOT_FULL_VERSION_ACCEPTANCE",
    "C approval scope",
  );
  assert(
    /not promoted to an absolute Foundation-global privilege/i.test(
      model.contextCandidate.chiralityNote,
    ),
    "C boundary remains chirality/gauge relative",
  );
  const d1 = model.decisionLedger.find((entry) => entry.id === "MI-D01");
  assert(d1 !== undefined, "MI-D01 exists");
  same(d1.status, "PROVED_RESEARCH", "MI-D01 resolved evidence status");
  same(d1.decision, "AUTHOR_APPROVED_FOR_V015", "MI-D01 Author resolution");
}

function main(): void {
  exercise(false);
  exercise(true);
  staticGuards();

  console.log([
    "MTS v0.15 A5: SELF_CONTAINED_CONTEXT_FREEZE_RESUME=GREEN_RESEARCH",
    "DIRECT_GAUGE_CONTEXT_BOUNDARY=C_DERIVED_FROM_ROOT_TO_END_SELF_CLOSURE",
    "DIRECT_GAUGE_C_AUTHOR_DECISION=APPROVED_FOR_V015",
    "EXTERNAL_CURRENT_CONTEXT_POINTER=0",
    "EXTERNAL_CURRENT_SCOPE_POINTER=0",
    "EXTERNAL_PROGRAM_COUNTER=0",
    "ENTRY_DISCOVERY=C_ROOTED_START_TOPOLOGY",
    "ACTIVE_FRONTIER=DERIVED_FROM_CONTEXT_CHILD_AND_END_TOPOLOGY",
    "WHOLE_MEMORY_CANONICAL_FREEZE_TRANSFER_RESTORE=GREEN",
    "ENTRY_IDENTITY_RECONSTRUCTED_AFTER_RESTORE=TRUE",
    "FRONTIER_RECONSTRUCTED_AFTER_RESTORE=TRUE",
    "RESUME_WITHOUT_SERIALIZED_CONTEXT_HANDLE=GREEN",
    "NONCURRENT_CONTEXT_LINKS_MAY_REMAIN_PHYSICALLY=TRUE",
    "HOST_FRONTIER_TRAVERSAL=RESIDUAL_READ_ONLY_ORACLE",
    "NEGATIVE_ABSENCE_TESTS=RESIDUAL",
    "FULL_SELF_HOSTED_GENERALIZED_REACTION=NOT_YET_PROVEN",
    "ACCEPTED_V014_UNCHANGED",
  ].join(" "));
}

main();
