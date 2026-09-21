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
  const observedDirectCallers = Object.keys(pathCounts)
    .flatMap((signature) => {
      const direct = signature.slice(signature.indexOf("|") + 1).split(">")[0];
      return direct === undefined ? [] : [direct];
    });
  const undocumentedDirectCallers = observedDirectCallers
    .filter((file, index, all) => !allowedDirectSourceFiles.has(file) && all.indexOf(file) === index)
    .sort();

  if (projection.runtimeTrustCoverage === undefined) {
    console.log("A9 P1g runtime operation counts:\n" + JSON.stringify(operationCounts, null, 2));
    console.log("A9 P1g runtime source-file counts:\n" + JSON.stringify(sourceFileCounts, null, 2));
    console.log("A9 P1g runtime path signatures:\n" + Object.keys(pathCounts).sort().join("\n"));
    console.log(`A9 P1g direct test/fixture operations: ${directTestOperationCount}`);
    console.log(
      "A9 P1g undocumented direct source callers:\n" +
      (undocumentedDirectCallers.length === 0 ? "<none>" : undocumentedDirectCallers.join("\n")),
    );
    throw new Error("v0.13 A9 P1g: runtimeTrustCoverage is not yet declared");
  }

  throw new Error("v0.13 A9 P1g: GREEN assertions are not implemented yet");
}
