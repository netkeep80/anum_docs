import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

import {
  THEOREM_CATALOG_INTEGRATION_CONTRACT,
  buildTheoremCatalogProjectionDeclaration,
  collectCurrentTheoremEvidenceRecordPaths,
} from "../src/tooling/theorem-projection-contract.js";

// T0 RED: this test intentionally lands before the MTS-specific contract module.
const REPO_GUARD_SHA = "756944656fa14de752f44bb404e1dca852f5fa6a";
const REPO_GUARD_VERSION = "3.2.0";
const REPO_GUARD_URL = "https://github.com/netkeep80/repo-guard.git";

function repositoryRoot(): string {
  const candidates = [resolve(process.cwd(), ".."), process.cwd()];
  const root = candidates.find((candidate) =>
    existsSync(resolve(candidate, "theorems", "current-v0.14.json")),
  );
  if (root === undefined) throw new Error("theorem projection repository root not found");
  return root;
}

function readJson(root: string, path: string): any {
  return JSON.parse(readFileSync(resolve(root, path), "utf8"));
}

function collectJson(root: string, directory: string): string[] {
  const absolute = resolve(root, directory);
  const result: string[] = [];
  for (const entry of readdirSync(absolute, { withFileTypes: true })) {
    const full = resolve(absolute, entry.name);
    if (entry.isDirectory()) {
      result.push(...collectJson(root, relative(root, full)));
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      result.push(relative(root, full).split(sep).join("/"));
    }
  }
  return result.sort();
}

function run(command: string, args: readonly string[], cwd?: string): string {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 120_000,
  });
  if (result.error !== undefined) throw result.error;
  if (result.signal !== null) throw new Error(`${command} terminated by ${result.signal}`);
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed (${result.status})\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    );
  }
  return result.stdout.trim();
}

async function main(): Promise<void> {
  const root = repositoryRoot();
  const current = readJson(root, "theorems/current-v0.14.json");
  const provers = readJson(root, "proofs/provers.json");
  const acceptedContract = readJson(root, "contracts/mts-contract-v0.14.json");

  assert.equal(current.schema, "mts-current-theorem-index/v0.1");
  assert.equal(current.mtsVersion, "v0.14");
  assert.equal(current.theorems.length, 21);

  assert.equal(
    THEOREM_CATALOG_INTEGRATION_CONTRACT.schema,
    "mts-theorem-catalog-integration/v0.4",
  );
  assert.deepEqual(
    THEOREM_CATALOG_INTEGRATION_CONTRACT.fixedSources,
    [
      "theorems/current-v0.14.json",
      "theorems/formal-v0.15.json",
      "proofs/provers.json",
      "proofs/external-proof-assurance.json",
      "proofs/native-proof-assurance.json",
      "contracts/mts-contract-v0.14.json",
    ],
  );
  assert.equal(
    THEOREM_CATALOG_INTEGRATION_CONTRACT.evidenceSelection,
    "current-index-referenced-proofs/evidence-json",
  );
  assert.equal(
    THEOREM_CATALOG_INTEGRATION_CONTRACT.targetPath,
    "docs/theory/Теоремы МТС.md",
  );
  assert.equal(THEOREM_CATALOG_INTEGRATION_CONTRACT.targetOwnership, "generated");
  assert.equal(
    THEOREM_CATALOG_INTEGRATION_CONTRACT.repoGuard.version,
    REPO_GUARD_VERSION,
  );
  assert.equal(THEOREM_CATALOG_INTEGRATION_CONTRACT.repoGuard.commitSha, REPO_GUARD_SHA);
  assert.equal(
    THEOREM_CATALOG_INTEGRATION_CONTRACT.repoGuard.entrypoint,
    "repo-guard/dist/projection-api.mjs",
  );

  assert.deepEqual(
    THEOREM_CATALOG_INTEGRATION_CONTRACT.readModel.theoremFields,
    [
      "id",
      "statement",
      "origin",
      "wave",
      "lawRefs",
      "assumptions",
      "formalPremises",
      "formalV015",
      "dependsOn",
      "scope",
      "exclusions",
      "evidence",
      "externalAssurance",
      "nativeAssurance",
      "provenance",
    ],
  );
  assert.deepEqual(
    THEOREM_CATALOG_INTEGRATION_CONTRACT.readModel.evidenceLanes,
    ["typescript", "lean4", "coq", "mtsNative", "aprover"],
  );

  // T0.1 RED: accepted lawRefs must resolve through a declared semantic-law source.
  const acceptedLawIds = new Set(Object.keys(acceptedContract.requiredSemanticLaws ?? {}));
  assert(acceptedLawIds.size > 0, "accepted semantic law inventory must be non-empty");
  for (const theorem of current.theorems) {
    for (const lawRef of theorem.lawRefs ?? []) {
      assert(
        acceptedLawIds.has(lawRef),
        `unresolved current theorem lawRef ${theorem.id} -> ${lawRef}`,
      );
    }
  }
  assert.equal(
    THEOREM_CATALOG_INTEGRATION_CONTRACT.authority.semanticLawInventory,
    "contracts/mts-contract-v0.14.json",
  );
  assert.equal(
    THEOREM_CATALOG_INTEGRATION_CONTRACT.authority.formalOverlay,
    "theorems/formal-v0.15.json",
  );

  assert.equal(provers.lanes.typescript.role, "executable-witness");
  assert.equal(provers.lanes.typescript.proofAuthority, "none");
  assert.equal(provers.lanes.lean4.role, "external-cross-check");
  assert.equal(provers.lanes.coq.role, "external-cross-check");
  assert.equal(provers.lanes.mtsNative.role, "native-proof");
  assert.equal(
    provers.lanes.mtsNative.proofAuthority,
    "native-replay-under-exact-theory",
  );
  assert.equal(provers.lanes.aprover.role, "independent-consumer-replay");

  const referencedEvidence = collectCurrentTheoremEvidenceRecordPaths(current);
  const actualEvidence = collectJson(root, "proofs/evidence");
  assert.deepEqual(
    referencedEvidence,
    actualEvidence,
    "theorem projection input must cover exactly the current evidence record inventory",
  );
  assert(
    referencedEvidence.every((path) => path.startsWith("proofs/evidence/")),
    "projection evidence sources must be evidence records, not TS witness source files",
  );

  const declaration = buildTheoremCatalogProjectionDeclaration(current);
  assert.equal(declaration.schema, "repo-guard/projection-model/v0");
  assert.equal(declaration.id, "mts.current-theorem-catalog");
  assert.deepEqual(declaration.target, {
    path: "docs/theory/Теоремы МТС.md",
    ownership: "generated",
  });
  assert.deepEqual(declaration.generator, {
    contract_id: "mts.theorem-catalog/v0.4",
  });
  assert.deepEqual(
    declaration.required_evidence,
    ["authority-boundary", "deterministic-render", "source-integrity"],
  );
  assert.deepEqual(
    declaration.sources.map((source: any) => source.path),
    [
      ...THEOREM_CATALOG_INTEGRATION_CONTRACT.fixedSources,
      ...actualEvidence,
    ].sort(),
    "repo-guard projection declaration contains every exact content dependency",
  );

  const source = readFileSync(
    resolve(root, "ts", "src", "tooling", "theorem-projection-contract.ts"),
    "utf8",
  );
  assert.doesNotMatch(
    source,
    /function\s+(normalizeProjectionModel|normalizeProjectionBuildRecord|analyzeProjection)\b/,
    "anum_docs must not reimplement repo-guard generic projection runtime",
  );

  const tempRoot = mkdtempSync(resolve(tmpdir(), "anum-docs-theorem-projection-t0-"));
  const cloneRoot = resolve(tempRoot, "repo-guard");
  try {
    run("git", ["clone", "--quiet", "--filter=blob:none", REPO_GUARD_URL, cloneRoot]);
    run("git", ["checkout", "--quiet", "--detach", REPO_GUARD_SHA], cloneRoot);
    assert.equal(run("git", ["rev-parse", "HEAD"], cloneRoot), REPO_GUARD_SHA);
    assert.equal(
      JSON.parse(readFileSync(resolve(cloneRoot, "package.json"), "utf8")).version,
      REPO_GUARD_VERSION,
    );
    run(
      "npm",
      ["ci", "--ignore-scripts", "--no-audit", "--no-fund", "--omit=dev"],
      cloneRoot,
    );
    const upstream = await import(
      pathToFileURL(resolve(cloneRoot, "dist", "projection-api.mjs")).href
    );
    assert.deepEqual(
      upstream.normalizeProjectionModel(declaration),
      declaration,
      "concrete theorem catalog declaration must be canonical under upstream repo-guard",
    );
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }

  console.log("THEOREM_CATALOG_T0_INTEGRATION_CONTRACT = FROZEN");
  console.log("GENERIC_PROJECTION_RUNTIME = REPO_GUARD_V3_2_0");
  console.log("MARKDOWN_PROOF_AUTHORITY = NONE");
  console.log("accepted semantic delta = NONE");
}

void main();
