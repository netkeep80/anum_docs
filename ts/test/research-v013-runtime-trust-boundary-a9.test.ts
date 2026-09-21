import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Memory } from "../src/memory.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.13 A9 runtime trust: ${message}`);
}

const repoRoot = resolve(process.cwd(), "..");
const projection = JSON.parse(
  readFileSync(
    join(repoRoot, "traceability/mts-v0.13-semantic-dependency-projection.json"),
    "utf8",
  ),
) as any;

const targets = Object.freeze([
  Object.freeze({
    symbol: "decomposeV013SemanticLink",
    source: "ts/src/v013-hierarchical-carrier.ts",
  }),
  Object.freeze({
    symbol: "materializeV013HierarchicalCarrierFromSemanticLink",
    source: "ts/src/v013-hierarchical-carrier.ts",
  }),
  Object.freeze({
    symbol: "serializeV013HierarchicalCarrier",
    source: "ts/src/v013-hierarchical-carrier.ts",
  }),
  Object.freeze({
    symbol: "materializeV013HierarchicalCarrier",
    source: "ts/src/v013-hierarchical-carrier.ts",
  }),
  Object.freeze({
    symbol: "materializeAuthorizedRelativeUnaryFormSource",
    source: "ts/src/v013-relative-form-materialization.ts",
  }),
  Object.freeze({
    symbol: "materializeAuthorizedBinaryLinkSource",
    source: "ts/src/v013-relative-form-materialization.ts",
  }),
  Object.freeze({
    symbol: "executeAuthorizedRelativePoleSource",
    source: "ts/src/v013-relative-pole-execution.ts",
  }),
  Object.freeze({
    symbol: "evaluateV013FormalAspectProgram",
    source: "ts/src/v013-formal-aspect-evaluator.ts",
  }),
]);

const probes = Object.freeze([
  Object.freeze({
    id: "formal-root-composition",
    module: "./v013-root-aspect-formal-composition.test.js",
  }),
  Object.freeze({
    id: "unknown-whole-reconstruction",
    module: "./v013-unknown-whole-two-memory.test.js",
  }),
  Object.freeze({
    id: "relative-form-two-memory",
    module: "./v013-relative-form-two-memory.test.js",
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

interface Segment {
  readonly probe: string;
  readonly entrypoint: string;
  readonly caller: string;
  readonly operation: OperationName;
}

const segments = new Set<string>();
const entrypointOperations = new Map<string, Set<OperationName>>();
const observedEntrypoints = new Set<string>();
const operationCounts = new Map<OperationName, number>();
let currentProbe = "<none>";
let recording = true;
let deniedOperation: OperationName | null = null;
let deniedHit = false;

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

      const segment: Segment = Object.freeze({
        probe: currentProbe,
        entrypoint,
        caller,
        operation,
      });
      segments.add(
        `${segment.probe}|${segment.entrypoint}|${segment.caller}|${segment.operation}`,
      );
    }
  }

  if (deniedOperation === operation) {
    deniedHit = true;
    throw new Error(
      `A9_DENIED_MEMORY_OPERATION:${operation}:probe=${currentProbe}:entrypoints=${active.join(",")}`,
    );
  }
}

const proto = Memory.prototype as unknown as Record<string, unknown>;
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
  await import(`${probe.module}?${encodeURIComponent(suffix)}`);
}

// Fault injection starts only after the baseline matrix is frozen; fixture setup
// outside a declared semantic-entrypoint stack is intentionally not denied.
async function faultInjectOperation(operation: OperationName): Promise<string> {
  recording = false;
  deniedOperation = operation;
  deniedHit = false;

  try {
    for (const probe of probes) {
      let rejected = false;
      try {
        await importProbe(probe, `a9-fault-${operation}-${probe.id}`);
      } catch {
        rejected = true;
      }
      if (deniedHit) {
        assert(rejected, `${operation} denial must make the witness reject`);
        return probe.id;
      }
      assert(!rejected, `${operation}: unrelated probe rejection before denial hit`);
    }
  } finally {
    deniedOperation = null;
    deniedHit = false;
    currentProbe = "<none>";
  }

  throw new Error(
    `v0.13 A9 runtime trust: observed operation ${operation} bypassed hard denial`,
  );
}

async function run(): Promise<void> {
  patchMemory();
  try {
    for (const probe of probes) {
      await importProbe(probe, `a9-${probe.id}-baseline`);
    }

    const expectedSymbols = targets.map((target) => target.symbol).sort();
    const actualSymbols = [...observedEntrypoints].sort();
    assert(
      JSON.stringify(actualSymbols) === JSON.stringify(expectedSymbols),
      `probe corpus must execute all public semantic entrypoints; expected [${expectedSymbols.join(", ")}], got [${actualSymbols.join(", ")}]`,
    );

    const matrix = Object.fromEntries(
      expectedSymbols.map((symbol) => [
        symbol,
        [...(entrypointOperations.get(symbol) ?? [])].sort(),
      ]),
    );
    const operationCountObject = Object.fromEntries(
      operationNames.map((name) => [name, operationCounts.get(name) ?? 0]),
    );
    const segmentList = [...segments].sort();
    const observedOperations = operationNames
      .filter((name) => (operationCounts.get(name) ?? 0) > 0)
      .sort();
    const unobservedOperations = operationNames
      .filter((name) => (operationCounts.get(name) ?? 0) === 0)
      .sort();

    if (projection.runtimeTrustAudit === undefined) {
      console.log(
        "A9 P1g observed entrypoint × Memory-operation matrix:\n" +
        JSON.stringify(matrix, null, 2) +
        "\n\nA9 P1g observed operation call counts:\n" +
        JSON.stringify(operationCountObject, null, 2) +
        `\n\nA9 P1g observed production segments: ${segmentList.length}` +
        `\nA9 P1g segment fingerprint FNV64: ${fnv64(segmentList)}`,
      );
      throw new Error(
        "v0.13 A9 P1g: runtimeTrustAudit is not yet declared in the external projection",
      );
    }

    const audit = projection.runtimeTrustAudit;
    assert(audit.status === "public-entrypoint-runtime-trace-with-fault-injection", "runtime audit status");
    assert(audit.scope === "S1", "runtime audit uses S1 semantic-path scope");
    assert(audit.publicEntrypointCoverage.declared === expectedSymbols.length, "declared public entrypoint count");
    assert(audit.publicEntrypointCoverage.observed === actualSymbols.length, "observed public entrypoint count");
    assert(audit.publicEntrypointCoverage.missing.length === 0, "no public semantic entrypoint is missing");
    assert(
      JSON.stringify(audit.entrypointOperationMatrix) === JSON.stringify(matrix),
      "entrypoint × Memory-operation matrix matches observed runtime",
    );
    assert(audit.observedProductionSegmentCount === segmentList.length, "runtime production segment count");
    assert(audit.segmentFingerprintFNV64 === fnv64(segmentList), "runtime segment fingerprint");
    assert(
      JSON.stringify([...audit.observedMemoryOperations].sort()) === JSON.stringify(observedOperations),
      "observed Memory operation set",
    );
    assert(
      JSON.stringify([...audit.unobservedMemoryOperations].sort()) === JSON.stringify(unobservedOperations),
      "unobserved Memory operation set",
    );
    assert(audit.undocumentedObservedEntrypointCount === 0, "zero undocumented public entrypoints");
    assert(audit.undocumentedObservedMemoryOperationCount === 0, "zero undocumented observed Memory operations");
    assert(audit.undocumentedObservedEntrypointOperationSegmentCount === 0, "zero undocumented entrypoint-operation segments");
    assert(audit.globalRuntimePathCoverageComplete === false, "public probe closure does not overclaim global runtime closure");

    const faultResults: Record<string, string> = {};
    for (const operation of observedOperations) {
      faultResults[operation] = await faultInjectOperation(operation);
    }

    assert(
      Object.keys(faultResults).length === observedOperations.length,
      "every observed Memory operation receives hard denial",
    );
    assert(
      audit.faultInjection.testedOperationCount === observedOperations.length,
      "projection records every observed Memory operation fault",
    );
    assert(audit.faultInjection.failClosedCount === observedOperations.length, "all observed Memory-operation denials fail closed");
    assert(audit.faultInjection.bypassCount === 0, "no observed Memory operation bypasses denial");

    console.log(
      `MTS v0.13 A9 P1g-a: PUBLIC_ENTRYPOINT_RUNTIME_TRACE_GREEN entrypoints=${actualSymbols.length}/${expectedSymbols.length} observedMemoryOps=${observedOperations.length}/${operationNames.length} productionSegments=${segmentList.length} hardDenied=${Object.keys(faultResults).length} bypass=0 globalTrustBoundaryComplete=false`,
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
