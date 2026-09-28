import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

function findRepositoryRoot(): string {
  const candidates = [resolve(process.cwd(), ".."), process.cwd()];
  const root = candidates.find((candidate) =>
    existsSync(resolve(candidate, "proofs", "provers.json")),
  );
  if (root === undefined) throw new Error("proof infrastructure root not found");
  return root;
}

const root = findRepositoryRoot();
const infrastructure = JSON.parse(
  readFileSync(resolve(root, "proofs", "provers.json"), "utf8"),
);
const evidenceSchema = JSON.parse(
  readFileSync(resolve(root, "proofs", "evidence-record.schema.json"), "utf8"),
);
const registry = JSON.parse(
  readFileSync(resolve(root, "theorems", "registry.json"), "utf8"),
);
const p0 = JSON.parse(
  readFileSync(resolve(root, "theorems", "p0-v0.14.json"), "utf8"),
);
const externalToolchains = JSON.parse(
  readFileSync(resolve(root, "proofs", "external-toolchains.json"), "utf8"),
);

assert.equal(infrastructure.schema, "mts-proof-infrastructure/v0.1");
assert.equal(infrastructure.authority, "routing-and-provenance-only");
assert.equal(infrastructure.theoremRegistry, "theorems/registry.json");
assert.equal(
  infrastructure.evidenceRecordSchema,
  "proofs/evidence-record.schema.json",
);

const expectedLanes = ["typescript", "lean4", "coq", "mtsNative", "aprover"];
assert.deepEqual(Object.keys(infrastructure.lanes).sort(), [...expectedLanes].sort());

const registryKeys = new Map(
  expectedLanes.map((lane) => [
    lane,
    infrastructure.lanes[lane].registryEvidenceKey,
  ]),
);
assert.equal(registryKeys.get("typescript"), "typescript");
assert.equal(registryKeys.get("lean4"), "lean");
assert.equal(registryKeys.get("coq"), "coq");
assert.equal(registryKeys.get("mtsNative"), "mtsNative");
assert.equal(registryKeys.get("aprover"), "aprover");

assert.equal(infrastructure.lanes.lean4.role, "external-cross-check");
assert.equal(infrastructure.lanes.lean4.proofAuthority, "external-only");
assert.equal(infrastructure.lanes.lean4.trustedAproverInput, false);
assert.equal(infrastructure.lanes.coq.role, "external-cross-check");
assert.equal(infrastructure.lanes.coq.proofAuthority, "external-only");
assert.equal(infrastructure.lanes.coq.trustedAproverInput, false);

assert.equal(infrastructure.lanes.mtsNative.role, "native-proof");
assert.equal(
  infrastructure.lanes.mtsNative.proofAuthority,
  "native-replay-under-exact-theory",
);
assert.equal(infrastructure.lanes.mtsNative.trustedAproverInput, true);
assert.equal(infrastructure.lanes.mtsNative.exactTheoryPinRequired, true);

assert.equal(infrastructure.lanes.aprover.role, "independent-consumer-replay");
assert.deepEqual(infrastructure.lanes.aprover.acceptedInputLanes, ["mtsNative"]);
assert.deepEqual(
  [...infrastructure.lanes.aprover.rejectedAuthorityInputLanes].sort(),
  ["typescript", "lean4", "coq"].sort(),
);

const expectedEvidenceKeys = ["typescript", "lean", "coq", "mtsNative", "aprover"];
for (const theorem of registry.theorems) {
  assert.deepEqual(
    Object.keys(theorem.evidence).sort(),
    [...expectedEvidenceKeys].sort(),
    `${theorem.id} evidence lanes must match proof infrastructure`,
  );
}

assert.equal(evidenceSchema.properties.schema.const, "mts-proof-evidence/v0.1");
assert.deepEqual(
  [...evidenceSchema.properties.lane.enum].sort(),
  [...expectedLanes].sort(),
);
for (const field of [
  "schema",
  "theoremId",
  "lane",
  "mts",
  "proofSource",
  "assumptions",
  "dependencies",
  "result",
  "authority",
  "artifacts",
]) {
  assert.ok(
    evidenceSchema.required.includes(field),
    `proof evidence schema must require ${field}`,
  );
}

const authorityValues = new Set(evidenceSchema.properties.authority.enum);
for (const authority of [
  "executable-witness",
  "external-cross-check",
  "native-replay",
  "independent-consumer-replay",
]) {
  assert.ok(authorityValues.has(authority));
}

function collectJsonFiles(directory: string): string[] {
  if (!existsSync(directory)) return [];
  const result: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) result.push(...collectJsonFiles(path));
    else if (entry.isFile() && entry.name.endsWith(".json")) result.push(path);
  }
  return result.sort();
}

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

const evidenceFiles = collectJsonFiles(resolve(root, "proofs", "evidence"));
assert.ok(evidenceFiles.length >= 2, "external proof evidence records must exist");

const p0Targets = new Map(
  p0.targets.map((target: any) => [String(target.id), target]),
);

const evidenceRecords = evidenceFiles.map((path) => ({
  path,
  record: JSON.parse(readFileSync(path, "utf8")),
}));

for (const { path, record } of evidenceRecords) {
  assert.equal(record.schema, "mts-proof-evidence/v0.1", `${path} schema`);
  assert.ok(expectedLanes.includes(record.lane), `${path} known lane`);
  assert.ok(p0Targets.has(record.theoremId), `${path} theorem exists in v0.14 P0 inventory`);
  assert.equal(record.mts.acceptedVersion, "v0.14", `${path} accepted MTS version`);
  assert.equal(
    record.mts.sourceCommitSha,
    p0.acceptedFreezeMainSha,
    `${path} accepted MTS source freeze`,
  );
  assert.match(record.mts.contractBlobSha, /^[0-9a-f]{40}$/, `${path} contract blob SHA`);
  assert.equal(record.proofSource.repository, "netkeep80/anum_docs", `${path} source repository`);
  assert.match(record.proofSource.commitSha, /^[0-9a-f]{40}$/, `${path} proof source commit`);

  const target = p0Targets.get(record.theoremId)!;
  assert.deepEqual(
    [...record.assumptions].sort(),
    [...target.assumptions].sort(),
    `${path} assumptions match P0`,
  );
  assert.deepEqual(
    [...record.dependencies].sort(),
    [...target.dependsOn].sort(),
    `${path} dependencies match P0`,
  );

  if (record.lane === "lean4" || record.lane === "coq") {
    assert.equal(record.authority, "external-cross-check", `${path} external authority`);
    assert.equal(record.result, "proved", `${path} external proof result`);
    assert.ok(record.proofSource.toolchain, `${path} external toolchain required`);
  }

  for (const artifact of record.artifacts) {
    const artifactPath = resolve(root, artifact.path);
    assert.ok(existsSync(artifactPath), `${path} artifact exists: ${artifact.path}`);
    assert.equal(
      sha256File(artifactPath),
      artifact.sha256,
      `${path} artifact SHA-256: ${artifact.path}`,
    );
  }
}

const fnd02 = evidenceRecords
  .filter(({ record }) => record.theoremId === "FND-02")
  .map(({ record }) => record);
assert.equal(fnd02.length, 2, "FND-02 has exactly two external evidence records");
assert.deepEqual(
  fnd02.map((record) => record.lane).sort(),
  ["coq", "lean4"],
  "FND-02 external lanes",
);
for (const record of fnd02) {
  assert.equal(
    record.proofSource.commitSha,
    "209b46d1bb376b31ad151694886cf0114102d631",
    `FND-02 ${record.lane} proof source commit`,
  );
}
const leanEvidence = fnd02.find((record) => record.lane === "lean4");
const coqEvidence = fnd02.find((record) => record.lane === "coq");
assert.ok(leanEvidence !== undefined && coqEvidence !== undefined);
assert.ok(
  leanEvidence.proofSource.toolchain.pin.includes(externalToolchains.lean4.commit),
  "Lean evidence pin includes exact release commit",
);
assert.ok(
  leanEvidence.proofSource.toolchain.pin.includes(externalToolchains.lean4.linuxReleaseSha256),
  "Lean evidence pin includes release artifact digest",
);
assert.ok(
  coqEvidence.proofSource.toolchain.pin.includes(externalToolchains.rocq.commit),
  "Rocq evidence pin includes exact release commit",
);
assert.ok(
  coqEvidence.proofSource.toolchain.pin.includes(externalToolchains.rocq.dockerManifestSha256),
  "Rocq evidence pin includes exact image digest",
);

console.log(
  `proof infrastructure: GREEN lanes=${expectedLanes.length} theorems=${registry.theorems.length} evidence=${evidenceRecords.length} fnd02=lean4+coq aprover-input=mtsNative-only`,
);
