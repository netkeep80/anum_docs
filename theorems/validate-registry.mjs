// Standalone index validator; this file grants no theorem authority.
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

function fail(message) {
  throw new Error(`theorem-registry: ${message}`);
}

const registryPath = [
  resolve("theorems", "registry.json"),
  resolve("..", "theorems", "registry.json"),
].find(existsSync);

if (registryPath === undefined) fail("theorems/registry.json not found");

const repoRoot = resolve(dirname(registryPath), "..");
const registry = JSON.parse(readFileSync(registryPath, "utf8"));

if (registry.schema !== "mts-theorem-registry/v0.1") fail("unexpected schema");
if (registry.authority !== "index-only") fail("registry must remain index-only");
if (registry.version !== "v0.13") fail("unexpected registry version");
if (!Array.isArray(registry.theorems)) fail("theorems must be an array");

const statuses = new Set(["conjecture", "proven", "falsified", "scoped"]);
const evidenceKinds = ["typescript", "lean", "mtsNative", "aprover"];
const byId = new Map();

for (const theorem of registry.theorems) {
  if (typeof theorem !== "object" || theorem === null) fail("theorem must be an object");
  if (!/^(FND|INV|CTX|FRM|EXE|TRN|PRF)-\d{2,}$/.test(theorem.id ?? "")) {
    fail(`invalid theorem id: ${String(theorem.id)}`);
  }
  if (byId.has(theorem.id)) fail(`duplicate theorem id: ${theorem.id}`);
  if (!statuses.has(theorem.status)) fail(`${theorem.id} has invalid status`);
  for (const field of ["statement", "scope", "exclusions"]) {
    if (typeof theorem[field] !== "string") fail(`${theorem.id}.${field} must be a string`);
  }
  for (const field of ["assumptions", "dependsOn", "sources"]) {
    if (!Array.isArray(theorem[field]) || theorem[field].some((item) => typeof item !== "string")) {
      fail(`${theorem.id}.${field} must be an array of strings`);
    }
  }
  if (typeof theorem.evidence !== "object" || theorem.evidence === null) {
    fail(`${theorem.id}.evidence must be an object`);
  }
  for (const kind of evidenceKinds) {
    const paths = theorem.evidence[kind];
    if (!Array.isArray(paths) || paths.some((path) => typeof path !== "string")) {
      fail(`${theorem.id}.evidence.${kind} must be an array of strings`);
    }
    for (const path of paths) {
      if (path.startsWith("/") || path.includes("..")) {
        fail(`${theorem.id} evidence path must be repository-relative: ${path}`);
      }
      if (!existsSync(resolve(repoRoot, path))) {
        fail(`${theorem.id} evidence path does not exist: ${path}`);
      }
    }
  }
  byId.set(theorem.id, theorem);
}

for (const theorem of byId.values()) {
  for (const dependency of theorem.dependsOn) {
    if (!byId.has(dependency)) fail(`${theorem.id} has dangling dependency ${dependency}`);
    if (dependency === theorem.id) fail(`${theorem.id} depends on itself`);
  }
}

const visiting = new Set();
const visited = new Set();

function visit(id, stack = []) {
  if (visited.has(id)) return;
  if (visiting.has(id)) fail(`dependency cycle: ${[...stack, id].join(" -> ")}`);
  visiting.add(id);
  for (const dependency of byId.get(id).dependsOn) visit(dependency, [...stack, id]);
  visiting.delete(id);
  visited.add(id);
}

for (const id of byId.keys()) visit(id);

console.log(
  `theorem-registry: ${byId.size} records, unique IDs, closed acyclic dependencies, evidence paths valid`,
);
