import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
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
const externalProofAssurance = JSON.parse(
  readFileSync(resolve(root, "proofs", "external-proof-assurance.json"), "utf8"),
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

const provedArtifactRule = evidenceSchema.allOf.find(
  (rule: any) => rule.if?.properties?.result?.const === "proved",
);
assert.ok(provedArtifactRule, "proved evidence must have an artifact rule");
assert.equal(
  provedArtifactRule.then?.properties?.artifacts?.minItems,
  1,
  "proved evidence schema requires at least one artifact",
);

for (const [lane, expectedPath] of [
  ["lean4", "proofs/lean4/MtsFoundation.lean"],
  ["coq", "proofs/coq/MtsFoundation.v"],
] as const) {
  const laneRule = evidenceSchema.allOf.find(
    (rule: any) =>
      rule.if?.properties?.lane?.const === lane &&
      rule.if?.properties?.result?.const === "proved",
  );
  assert.ok(laneRule, `${lane} proved evidence must have a lane artifact rule`);
  assert.equal(
    laneRule.then?.properties?.artifacts?.minItems,
    1,
    `${lane} proved evidence requires a non-empty artifact list`,
  );
  assert.equal(
    laneRule.then?.properties?.artifacts?.contains?.properties?.path?.const,
    expectedPath,
    `${lane} proved evidence requires its exact proof-source artifact`,
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

function gitObjectBytes(commitSha: string, path: string): Buffer {
  return execFileSync("git", ["show", `${commitSha}:${path}`], {
    cwd: root,
    encoding: "buffer",
  });
}

function gitBlobSha(commitSha: string, path: string): string {
  return execFileSync("git", ["rev-parse", `${commitSha}:${path}`], {
    cwd: root,
    encoding: "utf8",
  }).trim();
}

function sha256AtCommit(commitSha: string, path: string): string {
  return createHash("sha256").update(gitObjectBytes(commitSha, path)).digest("hex");
}

const assuranceTargets = new Map<string, any>(
  externalProofAssurance.targets.map((target: any) => [String(target.id), target] as const),
);

function externalLaneProofPath(lane: string): string | null {
  if (lane === "lean4") return "proofs/lean4/MtsFoundation.lean";
  if (lane === "coq") return "proofs/coq/MtsFoundation.v";
  return null;
}

function assertionFailure(action: () => void): boolean {
  try {
    action();
    return false;
  } catch {
    return true;
  }
}

function assertEvidenceArtifactIntegrity(path: string, record: any): void {
  if (record.result !== "proved") return;

  assert.ok(
    Array.isArray(record.artifacts) && record.artifacts.length >= 1,
    `${path} proved evidence must carry at least one verifiable artifact`,
  );

  const expectedProofPath = externalLaneProofPath(String(record.lane));
  if (expectedProofPath === null) return;

  const proofArtifact = record.artifacts.find(
    (artifact: any) => artifact?.path === expectedProofPath,
  );
  assert.ok(
    proofArtifact,
    `${path} ${record.lane} proved evidence must pin ${expectedProofPath}`,
  );

  const target = assuranceTargets.get(String(record.theoremId));
  assert.ok(target, `${path} theorem is declared in external proof assurance manifest`);
  const historicalSource = gitObjectBytes(
    String(record.proofSource.commitSha),
    expectedProofPath,
  ).toString("utf8");
  const symbols: string[] =
    record.lane === "lean4" ? [...target.lean4] : [...target.rocq];
  assert.ok(symbols.length > 0, `${path} has at least one assured theorem symbol`);

  for (const symbol of symbols) {
    const sourceSymbol =
      record.lane === "lean4"
        ? String(symbol).replace(/^MTS\.External\./, "")
        : String(symbol);
    const declaration =
      record.lane === "lean4"
        ? new RegExp(`\\btheorem\\s+${sourceSymbol}\\b`)
        : new RegExp(`\\bTheorem\\s+${sourceSymbol}\\b`);
    assert.match(
      historicalSource,
      declaration,
      `${path} historical pinned proof bytes declare ${symbol}`,
    );
  }
}

const evidenceFiles = collectJsonFiles(resolve(root, "proofs", "evidence"));
assert.ok(evidenceFiles.length >= 2, "external proof evidence records must exist");

const p0Targets = new Map<string, any>(
  p0.targets.map((target: any) => [String(target.id), target] as const),
);

const evidenceRecords = evidenceFiles.map((path) => ({
  path,
  record: JSON.parse(readFileSync(path, "utf8")),
}));

const firstProvedExternal = evidenceRecords.find(
  ({ record }) =>
    record.result === "proved" &&
    (record.lane === "lean4" || record.lane === "coq"),
);
assert.ok(firstProvedExternal, "at least one proved external evidence record exists");
const emptyArtifactMutation = {
  ...firstProvedExternal.record,
  artifacts: [],
};
assert.equal(
  assertionFailure(() =>
    assertEvidenceArtifactIntegrity(
      firstProvedExternal.path + "#mutation-artifacts-empty",
      emptyArtifactMutation,
    ),
  ),
  true,
  "proved evidence mutation with artifacts: [] must be rejected",
);

for (const { path, record } of evidenceRecords) {
  assert.equal(record.schema, "mts-proof-evidence/v0.1", `${path} schema`);
  assert.ok(expectedLanes.includes(record.lane), `${path} known lane`);
  assert.ok(p0Targets.has(record.theoremId), `${path} theorem exists in v0.14 P0 inventory`);
  assert.equal(record.mts.acceptedVersion, "v0.14", `${path} accepted MTS version`);
  assert.match(record.mts.sourceCommitSha, /^[0-9a-f]{40}$/, `${path} accepted MTS source commit`);
  assert.match(record.mts.contractBlobSha, /^[0-9a-f]{40}$/, `${path} contract blob SHA`);
  assert.equal(
    gitBlobSha(record.mts.sourceCommitSha, "contracts/mts-contract-v0.14.json"),
    record.mts.contractBlobSha,
    `${path} contract blob belongs to pinned accepted source commit`,
  );
  const acceptedContract = JSON.parse(
    gitObjectBytes(record.mts.sourceCommitSha, "contracts/mts-contract-v0.14.json").toString("utf8"),
  );
  assert.equal(acceptedContract.accepted, true, `${path} pinned source is post-acceptance`);
  assert.equal(
    acceptedContract.releaseState.currentAccepted,
    "mts-contract/v0.14",
    `${path} pinned source selects v0.14 as current accepted`,
  );
  assert.equal(
    acceptedContract.acceptance.authorDecision,
    "ACCEPT_MTS_V0_14",
    `${path} pinned source carries explicit author acceptance`,
  );
  assert.equal(
    acceptedContract.acceptance.preAcceptanceReadyMainSha,
    p0.acceptedFreezeMainSha,
    `${path} accepted source consumes the exact P0 semantic freeze`,
  );
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

  assertEvidenceArtifactIntegrity(path, record);

  for (const artifact of record.artifacts) {
    const artifactPath = resolve(root, artifact.path);
    assert.ok(existsSync(artifactPath), `${path} current artifact path exists: ${artifact.path}`);
    assert.equal(
      sha256AtCommit(record.proofSource.commitSha, artifact.path),
      artifact.sha256,
      `${path} historical proof-source SHA-256: ${artifact.path}`,
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

const fnd13 = evidenceRecords
  .filter(({ record }) => record.theoremId === "FND-13")
  .map(({ record }) => record);
assert.equal(fnd13.length, 2, "FND-13 has exactly two external evidence records");
assert.deepEqual(
  fnd13.map((record) => record.lane).sort(),
  ["coq", "lean4"],
  "FND-13 external lanes",
);
for (const record of fnd13) {
  assert.equal(
    record.proofSource.commitSha,
    "b0f1da0f3e4d1a8048cdc378fc2ccb914c736c79",
    `FND-13 ${record.lane} proof source commit`,
  );
  if (record.lane === "lean4") {
    assert.ok(
      record.proofSource.toolchain.pin.includes(externalToolchains.lean4.commit),
      "FND-13 Lean evidence pin includes exact release commit",
    );
    assert.ok(
      record.proofSource.toolchain.pin.includes(externalToolchains.lean4.linuxReleaseSha256),
      "FND-13 Lean evidence pin includes release artifact digest",
    );
  }
  if (record.lane === "coq") {
    assert.ok(
      record.proofSource.toolchain.pin.includes(externalToolchains.rocq.commit),
      "FND-13 Rocq evidence pin includes exact release commit",
    );
    assert.ok(
      record.proofSource.toolchain.pin.includes(externalToolchains.rocq.dockerManifestSha256),
      "FND-13 Rocq evidence pin includes exact image digest",
    );
  }
  assert.match(
    String(record.notes),
    /exactly restricted to the accepted finite Grounded domain/i,
    "FND-13 evidence states exact Grounded theorem scope",
  );
  assert.match(
    String(record.notes),
    /FND-02 unique ROOT is no longer presented as a dependency/i,
    "FND-13 evidence removes fake FND-02 provenance",
  );
  assert.match(
    String(record.notes),
    /stronger global normalization-completeness premise/i,
    "FND-13 evidence separates stronger arbitrary-Link extensionality",
  );
}
const fnd01 = evidenceRecords
  .filter(({ record }) => record.theoremId === "FND-01")
  .map(({ record }) => record);
assert.equal(fnd01.length, 2, "FND-01 has exactly two external evidence records");
assert.deepEqual(
  fnd01.map((record) => record.lane).sort(),
  ["coq", "lean4"],
  "FND-01 external lanes",
);
for (const record of fnd01) {
  assert.equal(
    record.proofSource.commitSha,
    "b0f1da0f3e4d1a8048cdc378fc2ccb914c736c79",
    `FND-01 ${record.lane} proof source commit`,
  );
  if (record.lane === "lean4") {
    assert.ok(
      record.proofSource.toolchain.pin.includes(externalToolchains.lean4.commit),
      "FND-01 Lean evidence pin includes exact release commit",
    );
    assert.ok(
      record.proofSource.toolchain.pin.includes(externalToolchains.lean4.linuxReleaseSha256),
      "FND-01 Lean evidence pin includes release artifact digest",
    );
  }
  if (record.lane === "coq") {
    assert.ok(
      record.proofSource.toolchain.pin.includes(externalToolchains.rocq.commit),
      "FND-01 Rocq evidence pin includes exact release commit",
    );
    assert.ok(
      record.proofSource.toolchain.pin.includes(externalToolchains.rocq.dockerManifestSha256),
      "FND-01 Rocq evidence pin includes exact image digest",
    );
  }
  assert.match(
    String(record.notes),
    /LocalSelfDecision.*explicit|explicit LocalSelfDecision/i,
    "FND-01 evidence discloses the local-decision classifier boundary",
  );
  assert.match(
    String(record.notes),
    /ContextOneSidedNames.*alias-only|alias-only.*ContextOneSidedNames/i,
    "FND-01 evidence discloses Context naming as alias-only",
  );
}

const inv01 = evidenceRecords
  .filter(({ record }) => record.theoremId === "INV-01")
  .map(({ record }) => record);
assert.equal(inv01.length, 2, "INV-01 has exactly two external evidence records");
assert.deepEqual(
  inv01.map((record) => record.lane).sort(),
  ["coq", "lean4"],
  "INV-01 external lanes",
);
for (const record of inv01) {
  assert.equal(
    record.proofSource.commitSha,
    "840f2829a93313384c7405a2e3db31e1999adf67",
    `INV-01 ${record.lane} proof source commit`,
  );
  if (record.lane === "lean4") {
    assert.ok(
      record.proofSource.toolchain.pin.includes(externalToolchains.lean4.commit),
      "INV-01 Lean evidence pin includes exact release commit",
    );
    assert.ok(
      record.proofSource.toolchain.pin.includes(externalToolchains.lean4.linuxReleaseSha256),
      "INV-01 Lean evidence pin includes release artifact digest",
    );
  }
  if (record.lane === "coq") {
    assert.ok(
      record.proofSource.toolchain.pin.includes(externalToolchains.rocq.commit),
      "INV-01 Rocq evidence pin includes exact release commit",
    );
    assert.ok(
      record.proofSource.toolchain.pin.includes(externalToolchains.rocq.dockerManifestSha256),
      "INV-01 Rocq evidence pin includes exact image digest",
    );
  }
  assert.match(
    String(record.notes),
    /Prop-valued structural graph/i,
    "INV-01 evidence discloses structural graph boundary",
  );
  assert.match(
    String(record.notes),
    /exactly one structural inverse|total and functional/i,
    "INV-01 evidence discloses unique-total function boundary",
  );
  assert.match(
    String(record.notes),
    /J\(A⟼B\)=J\(B\)⟼J\(A\)/,
    "INV-01 evidence records exact recursive pole-reversal equation",
  );
}

const inv02 = evidenceRecords
  .filter(({ record }) => record.theoremId === "INV-02")
  .map(({ record }) => record);
assert.equal(inv02.length, 2, "INV-02 has exactly two external evidence records");
assert.deepEqual(
  inv02.map((record) => record.lane).sort(),
  ["coq", "lean4"],
  "INV-02 external lanes",
);
for (const record of inv02) {
  assert.equal(
    record.proofSource.commitSha,
    "2305f259426dfcda5920fa485040ee6c0af05902",
    `INV-02 ${record.lane} proof source commit`,
  );
  if (record.lane === "lean4") {
    assert.ok(
      record.proofSource.toolchain.pin.includes(externalToolchains.lean4.commit),
      "INV-02 Lean evidence pin includes exact release commit",
    );
    assert.ok(
      record.proofSource.toolchain.pin.includes(externalToolchains.lean4.linuxReleaseSha256),
      "INV-02 Lean evidence pin includes release artifact digest",
    );
  }
  if (record.lane === "coq") {
    assert.ok(
      record.proofSource.toolchain.pin.includes(externalToolchains.rocq.commit),
      "INV-02 Rocq evidence pin includes exact release commit",
    );
    assert.ok(
      record.proofSource.toolchain.pin.includes(externalToolchains.rocq.dockerManifestSha256),
      "INV-02 Rocq evidence pin includes exact image digest",
    );
  }
  assert.match(
    String(record.notes),
    /same finite Grounded domain as INV-01|same.*domain.*INV-01/i,
    "INV-02 evidence records exact-domain reuse",
  );
  assert.match(
    String(record.notes),
    /same Prop-valued RecursiveInversion graph|no second inversion function/i,
    "INV-02 evidence discloses same inversion graph boundary",
  );
  assert.match(
    String(record.notes),
    /FND-13/,
    "INV-02 evidence records downstream FND-13 reconstruction",
  );
  assert.match(
    String(record.notes),
    /J\(J\(X\)\)=X/,
    "INV-02 evidence records involution statement",
  );
}

const inv0304 = ["INV-03", "INV-04"] as const;
for (const theoremId of inv0304) {
  const records = evidenceRecords
    .filter(({ record }) => record.theoremId === theoremId)
    .map(({ record }) => record);
  assert.equal(records.length, 2, `${theoremId} has exactly two external evidence records`);
  assert.deepEqual(
    records.map((record) => record.lane).sort(),
    ["coq", "lean4"],
    `${theoremId} external lanes`,
  );
  for (const record of records) {
    assert.equal(
      record.proofSource.commitSha,
      "54af5c6c1f9bfdaa7c23331cb431355a886794ec",
      `${theoremId} ${record.lane} proof source commit`,
    );
  }
}
for (const record of evidenceRecords
  .filter(({ record }) => record.theoremId === "INV-03")
  .map(({ record }) => record)) {
  assert.match(
    String(record.notes),
    /ROOT.*fixed point|fixed point.*ROOT/i,
    "INV-03 evidence records ROOT fixed-point statement",
  );
  assert.match(
    String(record.notes),
    /functionality/i,
    "INV-03 evidence records INV-01 graph-functionality boundary",
  );
}
for (const record of evidenceRecords
  .filter(({ record }) => record.theoremId === "INV-04")
  .map(({ record }) => record)) {
  assert.match(
    String(record.notes),
    /StartOnly.*FinishOnly|FinishOnly.*StartOnly/i,
    "INV-04 evidence records one-sided exchange",
  );
  assert.match(
    String(record.notes),
    /Context-relative|no Foundation-global absolute orientation/i,
    "INV-04 evidence preserves relative-orientation boundary",
  );
}

const inv0506 = [
  ["INV-05", "54af5c6c1f9bfdaa7c23331cb431355a886794ec"],
  ["INV-06", "b23eed9dad473e992915d3c1d52b189faec456d9"],
] as const;
for (const [theoremId, proofCommit] of inv0506) {
  const records = evidenceRecords
    .filter(({ record }) => record.theoremId === theoremId)
    .map(({ record }) => record);
  assert.equal(records.length, 2, `${theoremId} has exactly two external evidence records`);
  assert.deepEqual(
    records.map((record) => record.lane).sort(),
    ["coq", "lean4"],
    `${theoremId} external lanes`,
  );
  for (const record of records) {
    assert.equal(
      record.proofSource.commitSha,
      proofCommit,
      `${theoremId} ${record.lane} proof source commit`,
    );
    if (record.lane === "lean4") {
      assert.ok(
        record.proofSource.toolchain.pin.includes(externalToolchains.lean4.commit) &&
          record.proofSource.toolchain.pin.includes(externalToolchains.lean4.linuxReleaseSha256),
        `${theoremId} Lean evidence keeps exact compiler/artifact pins`,
      );
    }
    if (record.lane === "coq") {
      assert.ok(
        record.proofSource.toolchain.pin.includes(externalToolchains.rocq.commit) &&
          record.proofSource.toolchain.pin.includes(externalToolchains.rocq.dockerManifestSha256),
        `${theoremId} Rocq evidence keeps exact compiler/image pins`,
      );
    }
  }
}
for (const record of evidenceRecords
  .filter(({ record }) => record.theoremId === "INV-05")
  .map(({ record }) => record)) {
  assert.match(
    String(record.notes),
    /PAIR.*PairLocal|PairLocal.*PAIR/i,
    "INV-05 evidence records PAIR preservation",
  );
  assert.match(
    String(record.notes),
    /no pairPreserved|no.*new inversion-domain axiom/i,
    "INV-05 evidence records no new preservation axiom",
  );
  assert.match(
    String(record.notes),
    /INV-02.*derived|derived.*INV-02/i,
    "INV-05 evidence records INV-02 as a derived same-basis lemma",
  );
}
for (const record of evidenceRecords
  .filter(({ record }) => record.theoremId === "INV-06")
  .map(({ record }) => record)) {
  assert.match(
    String(record.notes),
    /J\(R\)=R.*J\(O\)=C.*J\(C\)=O.*J\(L\)=L.*J\(U\)=U/i,
    "INV-06 evidence records root-basis calculation",
  );
  assert.match(
    String(record.notes),
    /Context-relative|no RootBasis ontology|no.*Foundation-global/i,
    "INV-06 evidence preserves representative/orientation boundary",
  );
}

const inv07 = evidenceRecords
  .filter(({ record }) => record.theoremId === "INV-07")
  .map(({ record }) => record);
assert.equal(inv07.length, 2, "INV-07 has exactly two external evidence records");
assert.deepEqual(
  inv07.map((record) => record.lane).sort(),
  ["coq", "lean4"],
  "INV-07 external lanes",
);
for (const record of inv07) {
  assert.equal(
    record.proofSource.commitSha,
    "ad2f3128d61401c56ef24fe724d859a23f0aa9f9",
    `INV-07 ${record.lane} proof source commit`,
  );
  if (record.lane === "lean4") {
    assert.ok(
      record.proofSource.toolchain.pin.includes(externalToolchains.lean4.commit) &&
        record.proofSource.toolchain.pin.includes(externalToolchains.lean4.linuxReleaseSha256),
      "INV-07 Lean evidence keeps exact compiler/artifact pins",
    );
  }
  if (record.lane === "coq") {
    assert.ok(
      record.proofSource.toolchain.pin.includes(externalToolchains.rocq.commit) &&
        record.proofSource.toolchain.pin.includes(externalToolchains.rocq.dockerManifestSha256),
      "INV-07 Rocq evidence keeps exact compiler/image pins",
    );
  }
  assert.match(
    String(record.notes),
    /objective chirality/i,
    "INV-07 evidence records objective chirality",
  );
  assert.match(
    String(record.notes),
    /StartOnly.*FinishOnly|FinishOnly.*StartOnly/i,
    "INV-07 evidence records one-sided exchange",
  );
  assert.match(
    String(record.notes),
    /second inversion.*original Link|INV-02.*original Link/i,
    "INV-07 evidence records involutive return",
  );
  assert.match(
    String(record.notes),
    /PairLocal/,
    "INV-07 evidence records PAIR stability",
  );
  assert.match(
    String(record.notes),
    /no.*Foundation-global absolute orientation|without selecting.*Foundation-global/i,
    "INV-07 evidence preserves relative-orientation boundary",
  );
  assert.match(
    String(record.notes),
    /prover-side projection|not MTS ontology/i,
    "INV-07 evidence records the external projection boundary",
  );
}

const ctx03 = evidenceRecords
  .filter(({ record }) => record.theoremId === "CTX-03")
  .map(({ record }) => record);
assert.equal(ctx03.length, 2, "CTX-03 has exactly two external evidence records");
assert.deepEqual(
  ctx03.map((record) => record.lane).sort(),
  ["coq", "lean4"],
  "CTX-03 external lanes",
);
for (const record of ctx03) {
  assert.equal(
    record.proofSource.commitSha,
    "c0e8257eb88011aad748ae88c0599f44d275a66c",
    `CTX-03 ${record.lane} proof source commit`,
  );
  assert.deepEqual(
    record.assumptions,
    ["INV-02", "INV-07", "accepted Link-native Context orientation markers"],
    "CTX-03 assumptions preserve the P0 boundary",
  );
  assert.deepEqual(
    record.dependencies,
    ["INV-02", "INV-07"],
    "CTX-03 dependencies preserve the P0 boundary",
  );
  if (record.lane === "lean4") {
    assert.ok(
      record.proofSource.toolchain.pin.includes(externalToolchains.lean4.commit) &&
        record.proofSource.toolchain.pin.includes(externalToolchains.lean4.linuxReleaseSha256),
      "CTX-03 Lean evidence keeps exact compiler/artifact pins",
    );
  }
  if (record.lane === "coq") {
    assert.ok(
      record.proofSource.toolchain.pin.includes(externalToolchains.rocq.commit) &&
        record.proofSource.toolchain.pin.includes(externalToolchains.rocq.dockerManifestSha256),
      "CTX-03 Rocq evidence keeps exact compiler/image pins",
    );
  }
  assert.match(
    String(record.notes),
    /Link-native one-sided Context markers/i,
    "CTX-03 evidence records the Link-native Context carrier",
  );
  assert.match(
    String(record.notes),
    /unique marker-selected chi\(K\)/i,
    "CTX-03 evidence records the formal marker-to-chi bridge",
  );
  assert.match(
    String(record.notes),
    /InR_K\/OutR_K.*exchanged by structural J|exchanged by structural J.*InR_K\/OutR_K/i,
    "CTX-03 evidence records accepted direction witnesses and J exchange",
  );
  assert.match(
    String(record.notes),
    /generalized-MP semantic-arrow covariance/i,
    "CTX-03 evidence records generalized-MP semantic covariance",
  );
  assert.match(
    String(record.notes),
    /TechnicalStartOperation falsifier/i,
    "CTX-03 evidence records the non-covariant technical-operation boundary",
  );
  assert.match(
    String(record.notes),
    /START_K\/END_K|START_K.*END_K/i,
    "CTX-03 evidence records Context-local orientation roles",
  );
  assert.match(
    String(record.notes),
    /group theory.*Z2|Z2.*external proof projection/i,
    "CTX-03 evidence explicitly marks the external group-theory projection",
  );
  assert.match(
    String(record.notes),
    /not.*MTS ontology|none is promoted into MTS ontology/i,
    "CTX-03 evidence preserves the no-backflow boundary",
  );
  assert.match(
    String(record.notes),
    /no Foundation-global selected orientation|No Foundation-global selected orientation/i,
    "CTX-03 evidence excludes a global selected frame",
  );
  assert.match(
    String(record.notes),
    /unique chi\(K\)/i,
    "CTX-03 evidence records unique Context chi selection",
  );
  assert.match(
    String(record.notes),
    /generalized.*K->A.*A->B.*K->B.*covariant|generalized.*step.*covariant/i,
    "CTX-03 evidence records generalized-MP semantic covariance",
  );
  assert.match(
    String(record.notes),
    /TechnicalStartOperation.*not automatically.*semantic-covariant|counterexample.*technical first-pole/i,
    "CTX-03 evidence records a non-covariant technical-operation falsifier",
  );
}

const fnd05 = evidenceRecords
  .filter(({ record }) => record.theoremId === "FND-05")
  .map(({ record }) => record);
assert.equal(fnd05.length, 2, "FND-05 has exactly two external evidence records");
assert.deepEqual(
  fnd05.map((record) => record.lane).sort(),
  ["coq", "lean4"],
  "FND-05 external lanes",
);
for (const record of fnd05) {
  assert.equal(
    record.proofSource.commitSha,
    "284921e3e23ebfe7f3bf692c5adfe0142d412a39",
    "FND-05 " + record.lane + " proof source commit",
  );
  assert.deepEqual(
    record.assumptions,
    ["FND-01", "FND-02", "declared finite recursive carrier domain"],
    "FND-05 assumptions preserve the P0 boundary",
  );
  assert.deepEqual(
    record.dependencies,
    ["FND-01", "FND-02"],
    "FND-05 dependencies preserve the P0 boundary",
  );
  if (record.lane === "lean4") {
    assert.ok(
      record.proofSource.toolchain.pin.includes(externalToolchains.lean4.commit) &&
        record.proofSource.toolchain.pin.includes(externalToolchains.lean4.linuxReleaseSha256),
      "FND-05 Lean evidence keeps exact compiler/artifact pins",
    );
  }
  if (record.lane === "coq") {
    assert.ok(
      record.proofSource.toolchain.pin.includes(externalToolchains.rocq.commit) &&
        record.proofSource.toolchain.pin.includes(externalToolchains.rocq.dockerManifestSha256),
      "FND-05 Rocq evidence keeps exact compiler/image pins",
    );
  }
  assert.match(
    String(record.notes),
    /finite Grounded.*ROOT-decomposable|ROOT-decomposable.*Grounded/i,
    "FND-05 evidence records the finite recursive carrier boundary",
  );
  assert.match(
    String(record.notes),
    /prover-side inductive proof syntax/i,
    "FND-05 evidence records the host-code projection role",
  );
  assert.match(
    String(record.notes),
    /not MTS ontology|not a second native entity/i,
    "FND-05 evidence forbids host proof code from becoming MTS ontology",
  );
  assert.match(
    String(record.notes),
    /No additional external mathematical theory/i,
    "FND-05 evidence declares no extra external mathematical theory",
  );
  assert.match(
    String(record.notes),
    /non-well-founded.*cycles/i,
    "FND-05 evidence keeps arbitrary graph cycles outside scope",
  );
  assert.match(
    String(record.notes),
    /Anum\/Q identity/i,
    "FND-05 evidence keeps sequential Anum/Q identity outside scope",
  );
}

const fnd11 = evidenceRecords
  .filter(({ record }) => record.theoremId === "FND-11")
  .map(({ record }) => record);
assert.equal(fnd11.length, 2, "FND-11 has exactly two external evidence records");
assert.deepEqual(
  fnd11.map((record) => record.lane).sort(),
  ["coq", "lean4"],
  "FND-11 external lanes",
);
for (const record of fnd11) {
  assert.equal(
    record.proofSource.commitSha,
    "ce5faa19423feaf892abaa83d1ecdb2d56662e6a",
    "FND-11 " + record.lane + " proof source commit",
  );
  assert.deepEqual(
    record.assumptions,
    ["accepted v0.14 representation-layer definitions"],
    "FND-11 assumptions preserve the P0 boundary",
  );
  assert.deepEqual(
    record.dependencies,
    ["FND-05"],
    "FND-11 dependency remains exactly FND-05",
  );
  if (record.lane === "lean4") {
    assert.ok(
      record.proofSource.toolchain.pin.includes(externalToolchains.lean4.commit) &&
        record.proofSource.toolchain.pin.includes(externalToolchains.lean4.linuxReleaseSha256),
      "FND-11 Lean evidence keeps exact compiler/artifact pins",
    );
  }
  if (record.lane === "coq") {
    assert.ok(
      record.proofSource.toolchain.pin.includes(externalToolchains.rocq.commit) &&
        record.proofSource.toolchain.pin.includes(externalToolchains.rocq.dockerManifestSha256),
      "FND-11 Rocq evidence keeps exact compiler/image pins",
    );
  }
  assert.match(
    String(record.notes),
    /FND-05.*sole theorem dependency|sole theorem dependency.*FND-05/i,
    "FND-11 evidence records its exact theorem dependency",
  );
  assert.match(
    String(record.notes),
    /recursive Link codec identity.*Anum|Anum.*recursive Link codec identity/i,
    "FND-11 evidence records recursive-codec versus Anum target separation",
  );
  assert.match(
    String(record.notes),
    /ExactSequence positional identity.*fold denotation/i,
    "FND-11 evidence records the exact-sequence/fold boundary",
  );
  assert.match(
    String(record.notes),
    /Q source identity.*versioned denotation/i,
    "FND-11 evidence records the Q source/denotation boundary",
  );
  assert.match(
    String(record.notes),
    /every projected local sequence origin is R/i,
    "FND-11 evidence records the root-origin law",
  );
  assert.match(
    String(record.notes),
    /views\/predicates over Link|predicates over Link/i,
    "FND-11 evidence preserves one-Link ontology",
  );
  assert.match(
    String(record.notes),
    /No additional external mathematical theory/i,
    "FND-11 evidence declares no extra external mathematical theory",
  );
  assert.match(
    String(record.notes),
    /no global recursive-structure\/Q isomorphism/i,
    "FND-11 evidence preserves the no-global-isomorphism exclusion",
  );
  assert.match(
    String(record.notes),
    /no representation-strength ranking/i,
    "FND-11 evidence preserves the no-ranking exclusion",
  );
  assert.match(
    String(record.notes),
    /not.*MTS ontology|no host representation classifier is promoted into MTS ontology/i,
    "FND-11 evidence preserves the no-backflow boundary",
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
  `proof infrastructure: GREEN lanes=${expectedLanes.length} theorems=${registry.theorems.length} evidence=${evidenceRecords.length} fnd02=lean4+coq fnd13=lean4+coq fnd01=lean4+coq inv01=lean4+coq inv02=lean4+coq inv03=lean4+coq inv04=lean4+coq inv05=lean4+coq inv06=lean4+coq inv07=lean4+coq ctx03=lean4+coq fnd05=lean4+coq fnd11=lean4+coq aprover-input=mtsNative-only`,
);
