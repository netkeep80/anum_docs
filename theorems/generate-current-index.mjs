import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

function fail(message) {
  throw new Error(`current-theorem-index: ${message}`);
}

function findRepositoryRoot() {
  const candidates = [process.cwd(), resolve(process.cwd(), "..")];
  const root = candidates.find((candidate) =>
    existsSync(resolve(candidate, "theorems", "p0-v0.14.json")),
  );
  if (root === undefined) fail("repository root not found");
  return root;
}

function readJson(root, path) {
  return JSON.parse(readFileSync(resolve(root, path), "utf8"));
}

function collectJsonFiles(root, directory) {
  const absolute = resolve(root, directory);
  if (!existsSync(absolute)) return [];
  const result = [];
  for (const entry of readdirSync(absolute, { withFileTypes: true })) {
    const path = join(absolute, entry.name);
    if (entry.isDirectory()) {
      result.push(...collectJsonFiles(root, relative(root, path)));
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      result.push(relative(root, path).split(sep).join("/"));
    }
  }
  return result.sort();
}

function sameSet(actual, expected, label) {
  const left = [...new Set(actual)].sort();
  const right = [...new Set(expected)].sort();
  if (JSON.stringify(left) !== JSON.stringify(right)) {
    fail(`${label} differs: actual=${JSON.stringify(left)} expected=${JSON.stringify(right)}`);
  }
}

function buildCurrentIndex(root) {
  const p0Path = "theorems/p0-v0.14.json";
  const assurancePath = "proofs/external-proof-assurance.json";
  const evidenceRoot = "proofs/evidence";
  const p0 = readJson(root, p0Path);
  const assurance = readJson(root, assurancePath);

  if (p0.schema !== "mts-theorem-inventory/v0.1") fail("unexpected P0 schema");
  if (p0.status !== "p0-frozen") fail("P0 must remain frozen");
  if (p0.mtsVersion !== "v0.14") fail("unexpected P0 MTS version");
  if (p0.constraints?.mutateHistoricalRegistry !== false) {
    fail("historical theorem registry mutation veto is missing");
  }

  const targets = Array.isArray(p0.targets) ? p0.targets : [];
  const targetIds = targets.map((target) => String(target.id));
  if (new Set(targetIds).size !== targetIds.length) fail("duplicate P0 theorem ID");

  const assuranceTargets = Array.isArray(assurance.targets) ? assurance.targets : [];
  sameSet(
    assuranceTargets.map((target) => String(target.id)),
    targetIds,
    "external assurance target set",
  );
  const assuranceById = new Map(
    assuranceTargets.map((target) => [String(target.id), target]),
  );

  const evidenceFiles = collectJsonFiles(root, evidenceRoot);
  const evidenceById = new Map();
  const knownLanes = new Set(["typescript", "lean4", "coq", "mtsNative", "aprover"]);
  for (const path of evidenceFiles) {
    const record = readJson(root, path);
    const theoremId = String(record.theoremId ?? "");
    const lane = String(record.lane ?? "");
    if (!targetIds.includes(theoremId)) {
      fail(`orphan current evidence theorem ID: ${theoremId} at ${path}`);
    }
    if (!knownLanes.has(lane)) fail(`unknown evidence lane ${lane} at ${path}`);
    const entries = evidenceById.get(theoremId) ?? [];
    if (entries.some((entry) => entry.lane === lane)) {
      fail(`duplicate ${lane} evidence for ${theoremId}`);
    }
    entries.push({ lane, path });
    evidenceById.set(theoremId, entries);
  }

  const theorems = targets.map((target) => {
    const records = evidenceById.get(String(target.id)) ?? [];
    const pathsFor = (lane) =>
      records.filter((entry) => entry.lane === lane).map((entry) => entry.path).sort();
    const assured = assuranceById.get(String(target.id));
    if (assured === undefined) fail(`missing assurance target ${target.id}`);

    return {
      id: target.id,
      origin: target.origin,
      wave: target.wave,
      statement: target.statement,
      lawRefs: [...(target.lawRefs ?? [])],
      assumptions: [...(target.assumptions ?? [])],
      dependsOn: [...(target.dependsOn ?? [])],
      scope: target.scope,
      exclusions: target.exclusions,
      formalPremises: [...(target.formalPremises ?? [])],
      evidence: {
        typescript: [...(target.typescriptEvidence ?? [])],
        lean4: pathsFor("lean4"),
        coq: pathsFor("coq"),
        mtsNative: pathsFor("mtsNative"),
        aprover: pathsFor("aprover"),
      },
      externalAssurance: {
        lean4: [...(assured.lean4 ?? [])],
        rocq: [...(assured.rocq ?? [])],
      },
    };
  });

  return {
    schema: "mts-current-theorem-index/v0.1",
    authority: "generated-index-only",
    mtsVersion: p0.mtsVersion,
    sourceInventory: p0Path,
    premiseClassification: p0.premiseClassification,
    externalProofAssurance: assurancePath,
    evidenceRoot,
    historicalRegistry: {
      path: p0.historicalRegistry.path,
      schema: p0.historicalRegistry.schema,
      version: p0.historicalRegistry.version,
      expectedRecordCount: p0.historicalRegistry.expectedRecordCount,
      currentSelector: false,
    },
    theorems,
  };
}

const root = findRepositoryRoot();
const outputPath = resolve(root, "theorems", "current-v0.14.json");
const serialized = JSON.stringify(buildCurrentIndex(root)) + "\n";
const mode = process.argv[2] ?? "--check";

if (mode === "--write") {
  writeFileSync(outputPath, serialized, "utf8");
  console.log("current-theorem-index: wrote theorems/current-v0.14.json");
} else if (mode === "--check") {
  if (!existsSync(outputPath)) fail("generated current index is missing");
  const actual = readFileSync(outputPath, "utf8");
  if (actual !== serialized) fail("generated current index is stale; run node theorems/generate-current-index.mjs --write");
  console.log("current-theorem-index: GREEN current=P0-v0.14 historical-registry=inactive");
} else {
  fail("usage: generate-current-index.mjs [--check|--write]");
}
