import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
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

console.log(
  `proof infrastructure: GREEN lanes=${expectedLanes.length} theorems=${registry.theorems.length} aprover-input=mtsNative-only`,
);
