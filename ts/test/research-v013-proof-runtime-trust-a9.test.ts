import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Memory } from "../src/memory.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.13 A9 proof runtime trust: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: expected ${String(expected)}, got ${String(actual)}`);
}

const repoRoot = resolve(process.cwd(), "..");
const projection = JSON.parse(
  readFileSync(
    join(repoRoot, "traceability/mts-v0.13-semantic-dependency-projection.json"),
    "utf8",
  ),
) as any;

const targets = Object.freeze([
  Object.freeze({ symbol: "replayStructuralRootedProofAset" }),
  Object.freeze({ symbol: "replayStructuralTheorem" }),
  Object.freeze({ symbol: "replayStructuralDerivationWithTheorems" }),
  Object.freeze({ symbol: "replayPortableStructuralProof" }),
  Object.freeze({ symbol: "replayPortableProofSubAnetProjection" }),
]);

const probes = Object.freeze([
  Object.freeze({
    id: "rooted-proof-aset",
    module: "./rooted-proof-aset.test.js",
  }),
  Object.freeze({
    id: "structural-theorem",
    module: "./derivation.test.js",
  }),
  Object.freeze({
    id: "portable-trusted-kernel",
    module: "./portable-trusted-kernel-boundary.test.js",
  }),
  Object.freeze({
    id: "portable-proof-anet-package",
    module: "./portable-proof-anet-package-boundary.test.js",
  }),
]);

const operationNames = Object.freeze([
  "root",
  "linkCount",
  "poles",
  "find",
  "outgoing",
  "incoming",
  "issuanceIndex",
  "allLinks",
  "ensureRoot",
  "ensureStartSelfClosed",
  "ensureEndSelfClosed",
  "ensure",
] as const);

type OperationName = typeof operationNames[number];

const segments = new Set<string>();
const entrypointOperations = new Map<string, Set<OperationName>>();
const operationCounts = new Map<OperationName, number>();
const observedEntrypoints = new Set<string>();
let currentProbe = "<none>";
let recording = true;
let deniedOperation: OperationName | null = null;
let deniedHit = false;
const denialPrefix = "A9_DENIED_PROOF_MEMORY_OPERATION:";

function sourceFrame(stack: string): string | null {
  for (const line of stack.split("\n")) {
    const normalized = line.replaceAll("\\", "/");
    const match = normalized.match(/\/dist\/src\/([^():]+)\.js(?::\d+:\d+)?/);
    if (match?.[1] !== undefined) return `ts/src/${match[1]}.ts`;
  }
  return null;
}

function activeTargets(stack: string): readonly string[] {
  return targets
    .filter((target) => stack.includes(target.symbol))
    .map((target) => target.symbol);
}

function observe(operation: OperationName): void {
  const stack = new Error().stack ?? "";
  const active = activeTargets(stack);
  if (active.length === 0) return;

  const caller = sourceFrame(stack) ?? "<unknown-production-frame>";

  if (recording) {
    operationCounts.set(operation, (operationCounts.get(operation) ?? 0) + 1);

    for (const entrypoint of active) {
      observedEntrypoints.add(entrypoint);
      let operations = entrypointOperations.get(entrypoint);
      if (operations === undefined) {
        operations = new Set<OperationName>();
        entrypointOperations.set(entrypoint, operations);
      }
      operations.add(operation);
      segments.add(`${currentProbe}|${entrypoint}|${caller}|${operation}`);
    }
  }

  if (deniedOperation === operation) {
    deniedHit = true;
    throw new Error(
      `${denialPrefix}${operation}:probe=${currentProbe}:entrypoints=${active.join(",")}`,
    );
  }
}

const originalDescriptors = new Map<string, PropertyDescriptor>();

function patchMethod(name: OperationName): void {
  const descriptor = Object.getOwnPropertyDescriptor(Memory.prototype, name);
  assert(descriptor !== undefined, `Memory.${name} descriptor exists`);
  assert(typeof descriptor.value === "function", `Memory.${name} is a method`);
  originalDescriptors.set(name, descriptor);
  const original = descriptor.value as (this: Memory, ...args: unknown[]) => unknown;
  Object.defineProperty(Memory.prototype, name, {
    ...descriptor,
    value: function observedMemoryMethod(this: Memory, ...args: unknown[]): unknown {
      observe(name);
      return original.apply(this, args);
    },
  });
}

function patchGetter(name: "root" | "linkCount"): void {
  const descriptor = Object.getOwnPropertyDescriptor(Memory.prototype, name);
  assert(descriptor !== undefined, `Memory.${name} descriptor exists`);
  assert(typeof descriptor.get === "function", `Memory.${name} is a getter`);
  originalDescriptors.set(name, descriptor);
  const original = descriptor.get;
  Object.defineProperty(Memory.prototype, name, {
    ...descriptor,
    get: function observedMemoryGetter(this: Memory): unknown {
      observe(name);
      return original.call(this);
    },
  });
}

function patchMemory(): void {
  patchGetter("root");
  patchGetter("linkCount");
  for (const name of operationNames) {
    if (name === "root" || name === "linkCount") continue;
    patchMethod(name);
  }
}

function restoreMemory(): void {
  for (const [name, descriptor] of originalDescriptors) {
    Object.defineProperty(Memory.prototype, name, descriptor);
  }
  originalDescriptors.clear();
}

function fnv64(values: readonly string[]): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (const value of [...values].sort()) {
    for (const char of `${value}\n`) {
      hash ^= BigInt(char.charCodeAt(0));
      hash = (hash * prime) & mask;
    }
  }
  return hash.toString(16).padStart(16, "0");
}

async function importProbe(
  probe: (typeof probes)[number],
  suffix: string,
): Promise<void> {
  currentProbe = probe.id;
  // Async probes in this corpus own their top-level Promise, so import
  // completion means the tested proof scenario itself has settled.
  await import(`${probe.module}?${encodeURIComponent(suffix)}`);
}

async function faultInjectOperation(operation: OperationName): Promise<{
  readonly probe: string;
  readonly moduleRejected: boolean;
}> {
  recording = false;
  deniedOperation = operation;

  try {
    for (const probe of probes) {
      deniedHit = false;
      let rejected = false;
      try {
        await importProbe(probe, `a9-proof-fault-${operation}-${probe.id}`);
      } catch {
        rejected = true;
      }
      if (deniedHit) {
        assert(
          rejected,
          `${operation}: verifier denial was hit but the owning probe did not fail closed`,
        );
        return Object.freeze({ probe: probe.id, moduleRejected: true });
      }
      assert(!rejected, `${operation}: unrelated proof probe rejection before denial hit`);
    }
  } finally {
    deniedOperation = null;
    deniedHit = false;
    currentProbe = "<none>";
  }

  throw new Error(
    `v0.13 A9 proof runtime trust: observed operation ${operation} bypassed hard interception`,
  );
}

async function run(): Promise<void> {
  patchMemory();
  try {
    for (const probe of probes) {
      await importProbe(probe, `a9-proof-${probe.id}-baseline`);
    }

    const expected = targets.map((target) => target.symbol).sort();
    const observed = [...observedEntrypoints].sort();
    assert(
      JSON.stringify(observed) === JSON.stringify(expected),
      `proof corpus must execute all verifier entrypoints; expected [${expected.join(", ")}], got [${observed.join(", ")}]`,
    );

    const matrix = Object.fromEntries(
      expected.map((symbol) => [
        symbol,
        [...(entrypointOperations.get(symbol) ?? [])].sort(),
      ]),
    );
    const counts = Object.fromEntries(
      operationNames.map((name) => [name, operationCounts.get(name) ?? 0]),
    );
    const segmentList = [...segments].sort();
    const observedOperations = operationNames
      .filter((name) => (operationCounts.get(name) ?? 0) > 0)
      .sort();
    const unobservedOperations = operationNames
      .filter((name) => (operationCounts.get(name) ?? 0) === 0)
      .sort();

    if (
      projection.proofRuntimeTrustAudit === undefined ||
      projection.proofRuntimeTrustAudit.asyncProbeSettlementRevision !== "awaited-v2"
    ) {
      console.log(
        "A9 P1g-b proof verifier × Memory-operation matrix:\n" +
        JSON.stringify(matrix, null, 2) +
        "\n\nA9 P1g-b proof Memory-operation call counts:\n" +
        JSON.stringify(counts, null, 2) +
        `\n\nA9 P1g-b proof production segments: ${segmentList.length}` +
        `\nA9 P1g-b proof segment fingerprint FNV64: ${fnv64(segmentList)}`,
      );
      throw new Error(
        "v0.13 A9 P1g-b: settled async proof runtime baseline is not yet declared",
      );
    }

    const audit = projection.proofRuntimeTrustAudit;
    assert(audit.status === "proof-verifier-runtime-trace-with-fault-injection", "proof runtime audit status");
    assert(audit.scope === "S3", "proof verifier audit is an S3 package proof-replay slice");
    assert(audit.slice === "proof-replay", "proof verifier audit slice");
    assert(audit.verifierEntrypointCoverage.declared === expected.length, "declared verifier entrypoint count");
    assert(audit.verifierEntrypointCoverage.observed === observed.length, "observed verifier entrypoint count");
    assert(audit.verifierEntrypointCoverage.missing.length === 0, "no verifier entrypoint missing");
    assert(
      JSON.stringify(audit.entrypointOperationMatrix) === JSON.stringify(matrix),
      "proof verifier × Memory-operation matrix matches runtime",
    );
    assert(audit.observedProductionSegmentCount === segmentList.length, "proof runtime segment count");
    assert(audit.segmentFingerprintFNV64 === fnv64(segmentList), "proof runtime segment fingerprint");
    assert(
      JSON.stringify([...audit.observedMemoryOperations].sort()) === JSON.stringify(observedOperations),
      "proof observed Memory operation set",
    );
    assert(
      JSON.stringify([...audit.unobservedMemoryOperations].sort()) === JSON.stringify(unobservedOperations),
      "proof unobserved Memory operation set",
    );
    assert(audit.undocumentedObservedVerifierEntrypointCount === 0, "zero undocumented verifier entrypoints");
    assert(audit.undocumentedObservedMemoryOperationCount === 0, "zero undocumented proof Memory operations");
    assert(audit.undocumentedObservedEntrypointOperationSegmentCount === 0, "zero undocumented proof entrypoint-operation segments");
    assert(audit.globalRuntimePathCoverageComplete === false, "proof slice does not overclaim global runtime closure");

    const faultResults: Record<string, { readonly probe: string; readonly moduleRejected: boolean }> = {};
    for (const operation of observedOperations) {
      faultResults[operation] = await faultInjectOperation(operation);
    }

    assert(Object.keys(faultResults).length === observedOperations.length, "every observed proof Memory operation receives hard interception");
    assert(audit.faultInjection.testedOperationCount === observedOperations.length, "projection records every proof Memory-operation interception");
    assert(audit.faultInjection.interceptedOperationCount === observedOperations.length, "all observed proof Memory operations are intercepted");
    assert(audit.faultInjection.bypassCount === 0, "no proof Memory operation bypasses interception");
    same(
      audit.faultInjection.endToEndFailClosed,
      true,
      "every observed verifier Memory-operation denial rejects the owning proof probe",
    );

    console.log(
      `MTS v0.13 A9 P1g-b: PROOF_VERIFIER_RUNTIME_TRACE_GREEN entrypoints=${observed.length}/${expected.length} observedMemoryOps=${observedOperations.length}/${operationNames.length} productionSegments=${segmentList.length} hardIntercepted=${Object.keys(faultResults).length} bypass=0 endToEndFailClosed=GREEN globalTrustBoundaryComplete=false`,
    );
  } finally {
    recording = true;
    deniedOperation = null;
    deniedHit = false;
    currentProbe = "<none>";
    restoreMemory();
  }
}
await run();
