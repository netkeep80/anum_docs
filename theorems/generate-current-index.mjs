import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

function fail(message) {
  throw new Error(`current-theorem-index: ${message}`);
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

function buildHistoricalIndex(root) {
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

function buildCurrentV015Index(root, historicalIndex) {
  const historicalPath = "theorems/current-v0.14.json";
  const formalOverlayPath = "theorems/formal-v0.15.json";
  const overlay = readJson(root, formalOverlayPath);

  if (overlay.schema !== "mts-formal-theorem-overlay/v0.4") {
    fail("unexpected FORMAL v0.15 theorem overlay schema");
  }
  if (overlay.authority !== "formal-migration-descriptor-only") {
    fail("FORMAL v0.15 theorem overlay must remain descriptor-only");
  }
  if (overlay.baseInventory !== historicalPath) {
    fail("FORMAL v0.15 theorem overlay base inventory mismatch");
  }
  if (overlay.mtsVersion !== "v0.15-candidate") {
    fail("unexpected FORMAL v0.15 theorem overlay version");
  }

  const historicalIds = historicalIndex.theorems.map((theorem) => String(theorem.id));
  const entries = Array.isArray(overlay.entries) ? overlay.entries : [];
  const overlayIds = entries.map((entry) => String(entry.id));
  if (new Set(overlayIds).size !== overlayIds.length) {
    fail("duplicate theorem ID in FORMAL v0.15 overlay");
  }
  sameSet(overlayIds, historicalIds, "FORMAL v0.15 theorem overlay ID set");
  for (const entry of entries) {
    if (entry.migrationStatus !== "FORMAL_MIGRATED") {
      fail(`current v0.15 theorem capsule requires FORMAL_MIGRATED descriptor for ${entry.id}`);
    }
  }

  return {
    schema: historicalIndex.schema,
    authority: historicalIndex.authority,
    mtsVersion: "v0.15",
    sourceInventory: historicalPath,
    historicalSourceInventory: historicalIndex.sourceInventory,
    premiseClassification: historicalIndex.premiseClassification,
    formalOverlay: formalOverlayPath,
    externalProofAssurance: historicalIndex.externalProofAssurance,
    evidenceRoot: historicalIndex.evidenceRoot,
    historicalRegistry: historicalIndex.historicalRegistry,
    theorems: historicalIndex.theorems,
  };
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const historicalOutputPath = resolve(root, "theorems", "current-v0.14.json");
const currentOutputPath = resolve(root, "theorems", "current-v0.15.json");
const historicalIndex = buildHistoricalIndex(root);
const currentIndex = buildCurrentV015Index(root, historicalIndex);
const historicalSerialized = JSON.stringify(historicalIndex) + "\n";
const currentSerialized = JSON.stringify(currentIndex) + "\n";
const mode = process.argv[2] ?? "--check";

function checkGenerated(path, serialized, label) {
  if (!existsSync(path)) fail(`generated ${label} index is missing`);
  const actual = readFileSync(path, "utf8");
  if (actual !== serialized) {
    fail(`generated ${label} index is stale; run node theorems/generate-current-index.mjs --write`);
  }
}

if (mode === "--write") {
  writeFileSync(historicalOutputPath, historicalSerialized, "utf8");
  writeFileSync(currentOutputPath, currentSerialized, "utf8");
  console.log("current-theorem-index: wrote historical v0.14 index and current v0.15 capsule");
} else if (mode === "--check") {
  checkGenerated(historicalOutputPath, historicalSerialized, "historical v0.14");
  checkGenerated(currentOutputPath, currentSerialized, "current v0.15");
  console.log("current-theorem-index: GREEN current=v0.15 historical=v0.14 provenance-preserved");
} else {
  fail("usage: generate-current-index.mjs [--check|--write]");
}
