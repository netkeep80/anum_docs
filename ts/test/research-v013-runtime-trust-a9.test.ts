import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Memory } from "../src/memory.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.13 A9 runtime trust coverage: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: expected ${String(expected)}, got ${String(actual)}`);
}

function setEqual(actual: readonly string[], expected: readonly string[], message: string): void {
  const left = [...actual].sort();
  const right = [...expected].sort();
  assert(
    left.length === right.length && left.every((value, index) => value === right[index]),
    `${message}: expected [${right.join(", ")}], got [${left.join(", ")}]`,
  );
}

function fnv1a64(items: readonly string[]): string {
  let hash = 14695981039346656037n;
  const prime = 1099511628211n;
  const mask = (1n << 64n) - 1n;
  const source = items.join("\n");
  for (let index = 0; index < source.length; index += 1) {
    hash ^= BigInt(source.charCodeAt(index));
    hash = (hash * prime) & mask;
  }
  return hash.toString(16).padStart(16, "0");
}

function directCallers(pathSignatures: readonly string[]): readonly string[] {
  return Object.freeze(
    [...new Set(pathSignatures.flatMap((signature) => {
      const direct = signature.slice(signature.indexOf("|") + 1).split(">")[0];
      return direct === undefined ? [] : [direct];
    }))].sort(),
  );
}

function undocumentedDirectCallers(
  pathSignatures: readonly string[],
  allowed: ReadonlySet<string>,
): readonly string[] {
  return Object.freeze(directCallers(pathSignatures).filter((file) => !allowed.has(file)));
}

interface ChildTrace {
  readonly gate: string;
  readonly pathCounts: Readonly<Record<string, number>>;
  readonly operationCounts: Readonly<Record<string, number>>;
  readonly directTestOperationCount: number;
}

const operationNames = [
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
] as const;

type OperationName = typeof operationNames[number];

function sourceFilesFromStack(stack: string | undefined): readonly string[] {
  if (stack === undefined) return [];
  const files: string[] = [];
  for (const line of stack.split("\n")) {
    const match = line.match(/\/ts\/dist\/src\/(.+?)\.js:\d+:\d+/);
    if (match === null) continue;
    const file = `ts/src/${match[1]}.ts`;
    if (file === "ts/src/memory.ts") continue;
    if (files.at(-1) !== file) files.push(file);
  }
  return Object.freeze(files);
}

function instrumentMemory(): {
  readonly finish: (gate: string) => ChildTrace;
} {
  const pathCounts = new Map<string, number>();
  const operationCounts = new Map<string, number>();
  let directTestOperationCount = 0;

  const record = (operation: OperationName): void => {
    operationCounts.set(operation, (operationCounts.get(operation) ?? 0) + 1);
    const files = sourceFilesFromStack(new Error().stack);
    if (files.length === 0) {
      directTestOperationCount += 1;
      return;
    }
    const signature = `${operation}|${files.join(">")}`;
    pathCounts.set(signature, (pathCounts.get(signature) ?? 0) + 1);
  };

  const prototype = Memory.prototype as unknown as Record<string, unknown>;

  for (const operation of [
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
  ] as const) {
    const original = prototype[operation];
    assert(typeof original === "function", `Memory.${operation} is patchable`);
    prototype[operation] = function (this: Memory, ...args: unknown[]): unknown {
      record(operation);
      return Reflect.apply(original as (...values: unknown[]) => unknown, this, args);
    };
  }

  for (const operation of ["root", "linkCount"] as const) {
    const descriptor = Object.getOwnPropertyDescriptor(Memory.prototype, operation);
    assert(descriptor?.get !== undefined, `Memory.${operation} getter is patchable`);
    const originalGet = descriptor.get;
    Object.defineProperty(Memory.prototype, operation, {
      ...descriptor,
      get(this: Memory): unknown {
        record(operation);
        return Reflect.apply(originalGet, this, []);
      },
    });
  }

  return Object.freeze({
    finish(gate: string): ChildTrace {
      return Object.freeze({
        gate,
        pathCounts: Object.freeze(
          Object.fromEntries([...pathCounts.entries()].sort(([left], [right]) => left.localeCompare(right))),
        ),
        operationCounts: Object.freeze(
          Object.fromEntries([...operationCounts.entries()].sort(([left], [right]) => left.localeCompare(right))),
        ),
        directTestOperationCount,
      });
    },
  });
}

const childGatePath = process.env.MTS_P1G_GATE_PATH;
const childTracePath = process.env.MTS_P1G_TRACE_PATH;

if (childGatePath !== undefined) {
  assert(childTracePath !== undefined, "child trace path is required");
  const instrumentation = instrumentMemory();
  let thrown: unknown = undefined;
  try {
    await import(pathToFileURL(resolve(childGatePath)).href);
  } catch (error) {
    thrown = error;
  } finally {
    writeFileSync(
      childTracePath,
      JSON.stringify(instrumentation.finish(childGatePath), null, 2),
      "utf8",
    );
  }
  if (thrown !== undefined) throw thrown;
} else {
  const repoRoot = resolve(process.cwd(), "..");
  const readJson = (path: string): any =>
    JSON.parse(readFileSync(join(repoRoot, path), "utf8"));

  const conformance = readJson("contracts/mts-conformance-v0.13.json");
  const projection = readJson("traceability/mts-v0.13-semantic-dependency-projection.json");
  const gates = conformance.requiredExecutableGates as readonly string[];

  same(gates.length, 39, "mandatory gate count");
  same(projection.coverage.packageStaticSemanticDecisionAuditComplete, true, "P1f static audit prerequisite");

  const temporary = mkdtempSync(join(tmpdir(), "mts-v013-p1g-"));
  const traces: ChildTrace[] = [];
  const self = fileURLToPath(import.meta.url);

  try {
    for (const gate of gates) {
      const builtGate = resolve(
        process.cwd(),
        gate.replace(/^ts\/test\//, "dist/test/").replace(/\.ts$/, ".js"),
      );
      const tracePath = join(temporary, `${basename(gate, ".test.ts")}.json`);
      const result = spawnSync(process.execPath, [self], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          MTS_P1G_GATE_PATH: builtGate,
          MTS_P1G_TRACE_PATH: tracePath,
        },
        encoding: "utf8",
        maxBuffer: 16 * 1024 * 1024,
      });
      assert(result.error === undefined, `${gate}: child process starts`);
      assert(result.signal === null, `${gate}: child is not terminated by signal`);
      assert(
        result.status === 0,
        `${gate}: mandatory gate failed under instrumentation\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
      );
      traces.push(JSON.parse(readFileSync(tracePath, "utf8")) as ChildTrace);
    }
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }

  const operationCounts: Record<string, number> = {};
  const sourceFileCounts: Record<string, number> = {};
  const pathCounts: Record<string, number> = {};
  let directTestOperationCount = 0;

  for (const trace of traces) {
    directTestOperationCount += trace.directTestOperationCount;
    for (const [operation, count] of Object.entries(trace.operationCounts)) {
      operationCounts[operation] = (operationCounts[operation] ?? 0) + count;
    }
    for (const [signature, count] of Object.entries(trace.pathCounts)) {
      pathCounts[signature] = (pathCounts[signature] ?? 0) + count;
      const files = signature.slice(signature.indexOf("|") + 1).split(">");
      for (const file of new Set(files)) {
        sourceFileCounts[file] = (sourceFileCounts[file] ?? 0) + count;
      }
    }
  }

  const allowedDirectSourceFiles = new Set<string>([
    ...Object.keys(projection.packageSemanticDecisionAudit.fileCategoryByFile),
    ...projection.packageDirectSemanticWriteAudit.owners.map(
      (entry: { readonly id: string }) => entry.id.slice(0, entry.id.indexOf("#")),
    ),
  ]);
  const observedPaths = Object.keys(pathCounts).sort();
  const observedDirectCallers = directCallers(observedPaths);
  const actualUndocumented = undocumentedDirectCallers(observedPaths, allowedDirectSourceFiles);

  if (projection.runtimeTrustCoverage === undefined) {
    console.log("A9 P1g runtime operation counts:\n" + JSON.stringify(operationCounts, null, 2));
    console.log("A9 P1g runtime source-file counts:\n" + JSON.stringify(sourceFileCounts, null, 2));
    console.log("A9 P1g runtime path signatures:\n" + observedPaths.join("\n"));
    console.log(`A9 P1g direct test/fixture operations: ${directTestOperationCount}`);
    console.log(
      "A9 P1g undocumented direct source callers:\n" +
      (actualUndocumented.length === 0 ? "<none>" : actualUndocumented.join("\n")),
    );
    throw new Error("v0.13 A9 P1g: runtimeTrustCoverage is not yet declared");
  }

  // GREEN below is intentionally corpus-scoped: exact mandatory gates only.
  const runtime = projection.runtimeTrustCoverage;
  same(runtime.status, "green-observed-mandatory-corpus", "runtime coverage status");
  same(runtime.scope, "requiredExecutableGates-v0.13", "runtime coverage scope");
  same(runtime.baselineMain, "832ffa3643b13eba4c9b29211ddf773ebd815b2d", "runtime baseline main");
  same(runtime.gateCount, gates.length, "runtime gate count");
  same(runtime.allMandatoryGatesPassedUnderInstrumentation, true, "all mandatory gates pass under instrumentation");
  same(runtime.instrumentation.productionRuntimeModified, false, "instrumentation is test-only");

  const normalizedOperationCounts = Object.fromEntries(
    [...operationNames].sort().map((operation) => [operation, operationCounts[operation] ?? 0]),
  );
  const observedOperationKinds = Object.entries(normalizedOperationCounts)
    .filter(([, count]) => count > 0)
    .map(([operation]) => operation)
    .sort();
  const observedSourcePathOperationKinds = [...new Set(
    observedPaths.map((signature) => signature.slice(0, signature.indexOf("|"))),
  )].sort();
  const unobservedOperationKinds = [...operationNames]
    .filter((operation) => (normalizedOperationCounts[operation] ?? 0) === 0)
    .sort();
  const fixtureOnlyOperationKinds = observedOperationKinds
    .filter((operation) => !observedSourcePathOperationKinds.includes(operation))
    .sort();
  const totalObservedOperationCount = Object.values(normalizedOperationCounts)
    .reduce((total, count) => total + count, 0);

  setEqual(runtime.instrumentation.operations, operationNames, "instrumented Memory operation surface");
  setEqual(runtime.operationCoverage.observedOperationKinds, observedOperationKinds, "observed operation kinds");
  setEqual(
    runtime.operationCoverage.observedSourcePathOperationKinds,
    observedSourcePathOperationKinds,
    "source-path operation kinds",
  );
  setEqual(runtime.operationCoverage.unobservedOperationKinds, unobservedOperationKinds, "unobserved operation kinds");
  setEqual(runtime.operationCoverage.fixtureOnlyOperationKinds, fixtureOnlyOperationKinds, "fixture-only operation kinds");
  same(
    JSON.stringify(runtime.operationCoverage.observedOperationCounts),
    JSON.stringify(normalizedOperationCounts),
    "observed operation counts",
  );
  same(runtime.operationCoverage.totalObservedOperationCount, totalObservedOperationCount, "total Memory operations");
  same(runtime.operationCoverage.directTestFixtureOperationCount, directTestOperationCount, "direct fixture operations");

  const observedSourceFiles = Object.keys(sourceFileCounts).sort();
  same(runtime.observedPathSurface.uniquePathCount, observedPaths.length, "unique runtime path count");
  same(runtime.observedPathSurface.pathFingerprintAlgorithm,
    "FNV-1a-64 over sorted unique operation|ts/src-stack signatures",
    "runtime path fingerprint algorithm");
  same(runtime.observedPathSurface.pathFingerprint, fnv1a64(observedPaths), "runtime path fingerprint");
  same(runtime.observedPathSurface.sourceFileCount, observedSourceFiles.length, "runtime source-file count");
  setEqual(runtime.observedPathSurface.sourceFiles, observedSourceFiles, "runtime source-file set");
  same(runtime.observedPathSurface.directCallerCount, observedDirectCallers.length, "runtime direct caller count");
  setEqual(runtime.observedPathSurface.directCallers, observedDirectCallers, "runtime direct caller set");
  same(actualUndocumented.length, 0, "every observed direct source caller is statically classified");
  same(runtime.observedPathSurface.undocumentedDirectCallerCount, 0, "published undocumented direct caller count");

  // Hard bypass falsification: the classifier must fail closed rather than
  // succeeding merely because the observed corpus happened to be well behaved.
  const syntheticBypass = undocumentedDirectCallers(
    [...observedPaths, "poles|ts/src/__p1g_bypass__.ts"],
    allowedDirectSourceFiles,
  );
  setEqual(syntheticBypass, ["ts/src/__p1g_bypass__.ts"], "synthetic unknown caller is rejected");

  const removedObservedCaller = observedDirectCallers[0];
  assert(removedObservedCaller !== undefined, "at least one observed direct source caller exists");
  const reducedAllowed = new Set(allowedDirectSourceFiles);
  reducedAllowed.delete(removedObservedCaller);
  assert(
    undocumentedDirectCallers(observedPaths, reducedAllowed).includes(removedObservedCaller),
    "removing one actually observed caller from the allowlist is detected",
  );
  same(runtime.falsification.status, "green", "bypass falsification status");
  same(runtime.falsification.syntheticUnknownCallerRejected, true, "synthetic bypass rejection recorded");
  same(runtime.falsification.removedObservedCallerRejected, true, "removed real caller rejection recorded");

  same(projection.coverage.mandatoryGateRuntimeTrustCoverageComplete, true, "mandatory-gate runtime coverage complete");
  same(projection.coverage.mandatoryGateRuntimeBypassFalsificationComplete, true, "runtime bypass falsification complete");
  same(projection.coverage.globalTrustBoundaryComplete, false, "corpus runtime closure does not imply global trust closure");
  same(projection.metrics.globalUndocumentedSemanticPathCount, null, "global undocumented semantic path count remains unmeasured");
  same(projection.metrics.observedMandatoryGateMemoryOperationCount, totalObservedOperationCount, "published operation count");
  same(projection.metrics.observedMandatoryGateMemoryOperationKindCount, observedOperationKinds.length, "published operation-kind count");
  same(
    projection.metrics.observedMandatoryGateSourcePathOperationKindCount,
    observedSourcePathOperationKinds.length,
    "published source-path operation-kind count",
  );
  same(
    projection.metrics.unobservedMandatoryGateInstrumentedOperationCount,
    unobservedOperationKinds.length,
    "published unobserved operation-kind count",
  );
  same(projection.metrics.observedMandatoryGateRuntimeSourceFileCount, observedSourceFiles.length, "published runtime source-file count");
  same(projection.metrics.observedMandatoryGateRuntimeDirectCallerCount, observedDirectCallers.length, "published direct caller count");
  same(projection.metrics.observedMandatoryGateUniqueRuntimePathCount, observedPaths.length, "published unique path count");
  same(projection.metrics.undocumentedObservedMandatoryGateDirectCallerCount, 0, "published undocumented observed caller count");
  same(projection.metrics.mandatoryGateDirectTestFixtureOperationCount, directTestOperationCount, "published fixture operation count");

  console.log(
    `MTS v0.13 A9 P1g: 39 mandatory gates GREEN under test-only Memory instrumentation; ${totalObservedOperationCount} calls, ${observedPaths.length} unique source paths, ${observedDirectCallers.length} direct ts/src callers, undocumented observed callers=0; incoming remains unexercised and global closure remains unclaimed: GREEN.`,
  );
}
