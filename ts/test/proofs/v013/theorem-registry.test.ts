import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

type Status = "conjecture" | "proven" | "falsified" | "scoped";

interface Evidence {
  readonly typescript: readonly string[];
  readonly lean: readonly string[];
  readonly mtsNative: readonly string[];
  readonly aprover: readonly string[];
}

interface TheoremRecord {
  readonly id: string;
  readonly statement: string;
  readonly status: Status;
  readonly assumptions: readonly string[];
  readonly dependsOn: readonly string[];
  readonly scope: string;
  readonly exclusions: string;
  readonly sources: readonly string[];
  readonly evidence: Evidence;
}

interface Registry {
  readonly schema: string;
  readonly authority: string;
  readonly version: string;
  readonly families: Readonly<Record<string, string>>;
  readonly theorems: readonly TheoremRecord[];
}

function fail(message: string): never {
  throw new Error(`theorem-registry: ${message}`);
}

function findRegistry(): string {
  const candidates = [
    resolve("..", "theorems", "registry.json"),
    resolve("theorems", "registry.json"),
  ];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (found === undefined) fail("theorems/registry.json not found");
  return found;
}

function assertStringArray(value: unknown, field: string): asserts value is string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    fail(`${field} must be an array of strings`);
  }
}

function assertEvidence(value: unknown, id: string): asserts value is Evidence {
  if (typeof value !== "object" || value === null) fail(`${id}.evidence must be an object`);
  const candidate = value as Partial<Record<keyof Evidence, unknown>>;
  for (const key of ["typescript", "lean", "mtsNative", "aprover"] as const) {
    assertStringArray(candidate[key], `${id}.evidence.${key}`);
  }
}

function assertRecord(value: unknown, index: number): asserts value is TheoremRecord {
  if (typeof value !== "object" || value === null) fail(`theorems[${index}] must be an object`);
  const theorem = value as Partial<Record<keyof TheoremRecord, unknown>>;
  for (const field of ["id", "statement", "scope", "exclusions"] as const) {
    if (typeof theorem[field] !== "string") fail(`theorems[${index}].${field} must be a string`);
  }
  if (!/^(FND|INV|CTX|FRM|EXE|TRN|PRF)-\d{2,}$/.test(theorem.id as string)) {
    fail(`invalid theorem id: ${String(theorem.id)}`);
  }
  if (!["conjecture", "proven", "falsified", "scoped"].includes(String(theorem.status))) {
    fail(`${String(theorem.id)} has invalid status`);
  }
  assertStringArray(theorem.assumptions, `${String(theorem.id)}.assumptions`);
  assertStringArray(theorem.dependsOn, `${String(theorem.id)}.dependsOn`);
  assertStringArray(theorem.sources, `${String(theorem.id)}.sources`);
  assertEvidence(theorem.evidence, String(theorem.id));
}

const registryPath = findRegistry();
const repoRoot = resolve(dirname(registryPath), "..");
const parsed = JSON.parse(readFileSync(registryPath, "utf8")) as Partial<Registry>;

if (parsed.schema !== "mts-theorem-registry/v0.1") fail("unexpected schema");
if (parsed.authority !== "index-only") fail("registry must explicitly remain index-only");
if (parsed.version !== "v0.13") fail("unexpected theorem registry version");
if (typeof parsed.families !== "object" || parsed.families === null) fail("families must be an object");
if (!Array.isArray(parsed.theorems)) fail("theorems must be an array");

parsed.theorems.forEach(assertRecord);

const records = parsed.theorems as readonly TheoremRecord[];
const byId = new Map<string, TheoremRecord>();

for (const theorem of records) {
  if (byId.has(theorem.id)) fail(`duplicate theorem id: ${theorem.id}`);
  byId.set(theorem.id, theorem);
}

for (const theorem of records) {
  for (const dependency of theorem.dependsOn) {
    if (!byId.has(dependency)) fail(`${theorem.id} has dangling dependency ${dependency}`);
    if (dependency === theorem.id) fail(`${theorem.id} depends on itself`);
  }

  for (const paths of Object.values(theorem.evidence)) {
    for (const path of paths) {
      if (path.startsWith("/") || path.includes("..")) {
        fail(`${theorem.id} evidence path must be repository-relative: ${path}`);
      }
      if (!existsSync(resolve(repoRoot, path))) {
        fail(`${theorem.id} evidence path does not exist: ${path}`);
      }
    }
  }
}

const visiting = new Set<string>();
const visited = new Set<string>();

function visit(id: string, stack: readonly string[]): void {
  if (visited.has(id)) return;
  if (visiting.has(id)) fail(`dependency cycle: ${[...stack, id].join(" -> ")}`);

  visiting.add(id);
  const theorem = byId.get(id);
  if (theorem === undefined) fail(`missing theorem during dependency walk: ${id}`);
  for (const dependency of theorem.dependsOn) visit(dependency, [...stack, id]);
  visiting.delete(id);
  visited.add(id);
}

for (const id of byId.keys()) visit(id, []);

console.log(`theorem-registry: ${records.length} records, unique IDs, closed acyclic dependencies, evidence paths valid`);
