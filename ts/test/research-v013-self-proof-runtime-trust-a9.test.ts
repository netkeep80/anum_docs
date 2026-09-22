import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Memory } from "../src/memory.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.13 self-proof runtime trust: ${message}`);
}

const repoRoot = resolve(process.cwd(), "..");
const projection = JSON.parse(
  readFileSync(
    join(repoRoot, "traceability/mts-v0.13-semantic-dependency-projection.json"),
    "utf8",
  ),
) as any;

const targetSymbols = Object.freeze([
  "replayPortableStructuralTheory",
  "exportPortableStructuralTheory",
  "replayRecursiveLinkIdentityProofAset",
  "replayStructuralRootedProofAset",
] as const);

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

const operationCounts = new Map<OperationName, number>();
const entrypointOperations = new Map<string, Set<OperationName>>();
const observedEntrypoints = new Set<string>();
const segments = new Set<string>();
const originalDescriptors = new Map<string, PropertyDescriptor>();

let recording = true;
let deniedOperation: OperationName | null = null;
let deniedHit = false;
const denialPrefix = "A9_DENIED_SELF_PROOF_MEMORY_OPERATION:";

function activeTargets(stack: string): readonly string[] {
  return targetSymbols.filter((symbol) => stack.includes(symbol));
}

function directSourceFrame(stack: string): string {
  for (const line of stack.split("\n")) {
    const normalized = line.replaceAll("\\", "/");
    const match = normalized.match(/\/dist\/src\/([^():]+)\.js(?::\d+:\d+)?/);
    if (match?.[1] !== undefined) return `ts/src/${match[1]}.ts`;
  }
  return "<unknown-production-frame>";
}

function observe(operation: OperationName): void {
  const stack = new Error().stack ?? "";
  const active = activeTargets(stack);
  if (active.length === 0) return;

  if (recording) {
    operationCounts.set(operation, (operationCounts.get(operation) ?? 0) + 1);
    const caller = directSourceFrame(stack);
    for (const entrypoint of active) {
      observedEntrypoints.add(entrypoint);
      let operations = entrypointOperations.get(entrypoint);
      if (operations === undefined) {
        operations = new Set<OperationName>();
        entrypointOperations.set(entrypoint, operations);
      }
      operations.add(operation);
      segments.add(`bounded-self-proof|${entrypoint}|${caller}|${operation}`);
    }
  }

  if (deniedOperation === operation) {
    deniedHit = true;
    throw new Error(`${denialPrefix}${operation}:entrypoints=${active.join(",")}`);
  }
}

function patchMethod(name: OperationName): void {
  const descriptor = Object.getOwnPropertyDescriptor(Memory.prototype, name);
  assert(descriptor !== undefined, `Memory.${name} descriptor exists`);
  assert(typeof descriptor.value === "function", `Memory.${name} is a method`);
  originalDescriptors.set(name, descriptor);
  const original = descriptor.value as (this: Memory, ...args: unknown[]) => unknown;
  Object.defineProperty(Memory.prototype, name, {
    ...descriptor,
    value: function observedSelfProofMemoryMethod(
      this: Memory,
      ...args: unknown[]
    ): unknown {
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
    get: function observedSelfProofMemoryGetter(this: Memory): unknown {
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

async function importSelfProof(suffix: string): Promise<void> {
  await import(
    `./research-v013-bounded-self-proof.test.js?${encodeURIComponent(suffix)}`
  );
}

async function faultInject(operation: OperationName): Promise<void> {
  recording = false;
  deniedOperation = operation;
  deniedHit = false;
  let rejected = false;
  try {
    await importSelfProof(`a9-self-proof-fault-${operation}`);
  } catch {
    rejected = true;
  } finally {
    deniedOperation = null;
  }
  assert(deniedHit, `${operation}: observed operation must hit hard interception`);
  assert(rejected, `${operation}: owning self-proof must reject end-to-end`);
}

async function run(): Promise<void> {
  patchMemory();
  try {
    await importSelfProof("a9-self-proof-baseline");

    const expectedEntrypoints = [...targetSymbols].sort();
    const actualEntrypoints = [...observedEntrypoints].sort();
    assert(
      JSON.stringify(actualEntrypoints) === JSON.stringify(expectedEntrypoints),
      `self-proof must execute all tracked entrypoints; expected [${expectedEntrypoints.join(", ")}], got [${actualEntrypoints.join(", ")}]`,
    );

    const observedOperations = operationNames
      .filter((name) => (operationCounts.get(name) ?? 0) > 0)
      .sort();
    const unobservedOperations = operationNames
      .filter((name) => (operationCounts.get(name) ?? 0) === 0)
      .sort();
    const matrix = Object.fromEntries(
      expectedEntrypoints.map((entrypoint) => [
        entrypoint,
        [...(entrypointOperations.get(entrypoint) ?? [])].sort(),
      ]),
    );
    const counts = Object.fromEntries(
      operationNames.map((name) => [name, operationCounts.get(name) ?? 0]),
    );
    const segmentList = [...segments].sort();

    if (projection.selfProofRuntimeTrustAudit === undefined) {
      console.log(
        "SP7 bounded self-proof × Memory-operation matrix:\n" +
        JSON.stringify(matrix, null, 2) +
        "\n\nSP7 bounded self-proof Memory-operation counts:\n" +
        JSON.stringify(counts, null, 2) +
        `\n\nSP7 bounded self-proof production segments: ${segmentList.length}` +
        `\nSP7 bounded self-proof segment fingerprint FNV64: ${fnv64(segmentList)}`,
      );
      throw new Error(
        "v0.13 SP7 RED: selfProofRuntimeTrustAudit is not yet declared",
      );
    }

    const audit = projection.selfProofRuntimeTrustAudit;
    assert(audit.status === "bounded-self-proof-runtime-trace-with-fault-injection", "audit status");
    assert(audit.scope === "S1+S3-proof-intersection", "audit scope");
    assert(audit.claimSet === "L_IDENTITY+U_IDENTITY", "exact bounded claim set");
    assert(
      JSON.stringify([...audit.observedMemoryOperations].sort()) ===
        JSON.stringify(observedOperations),
      "observed Memory operation set",
    );
    assert(
      JSON.stringify([...audit.unobservedMemoryOperations].sort()) ===
        JSON.stringify(unobservedOperations),
      "unobserved Memory operation set",
    );
    assert(
      JSON.stringify(audit.entrypointOperationMatrix) === JSON.stringify(matrix),
      "entrypoint × Memory-operation matrix",
    );
    assert(
      audit.observedProductionSegmentCount === segmentList.length,
      "production segment count",
    );
    assert(
      audit.segmentFingerprintFNV64 === fnv64(segmentList),
      "production segment fingerprint",
    );
    assert(audit.undocumentedObservedEntrypointCount === 0, "zero undocumented entrypoints");
    assert(audit.undocumentedObservedMemoryOperationCount === 0, "zero undocumented operations");
    assert(
      audit.undocumentedObservedEntrypointOperationSegmentCount === 0,
      "zero undocumented entrypoint-operation segments",
    );

    const faulted: string[] = [];
    for (const operation of observedOperations) {
      await faultInject(operation);
      faulted.push(operation);
    }
    assert(
      faulted.length === observedOperations.length,
      "every observed self-proof Memory operation is fault-injected",
    );
    assert(
      audit.faultInjection.testedOperationCount === faulted.length,
      "projection records exact fault-injection count",
    );
    assert(
      audit.faultInjection.endToEndFailClosedCount === faulted.length,
      "all tested self-proof operations fail closed end-to-end",
    );
    assert(audit.faultInjection.bypassCount === 0, "zero self-proof boundary bypasses");
    assert(
      audit.globalRuntimePathCoverageComplete === false,
      "bounded self-proof trace does not claim global runtime closure",
    );

    console.log(
      `MTS v0.13 SP7: BOUNDED_SELF_PROOF_RUNTIME_TRUST_GREEN entrypoints=${actualEntrypoints.length} observedMemoryOps=${observedOperations.length}/${operationNames.length} segments=${segmentList.length} failClosed=${faulted.length} bypass=0 globalTrustBoundaryComplete=false`,
    );
  } finally {
    recording = true;
    deniedOperation = null;
    deniedHit = false;
    restoreMemory();
  }
}

await run();
