import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import {
  deriveV015BoundedAnetDigest,
  verifyV015NativeEvidence,
  type V015NativeEvidenceRequest,
} from "../src/tooling/v015-native-evidence-verifier.js";
import { findRepositoryRoot } from "../src/tooling/docs-sync.js";

const stages = ["grammar", "denotation", "semanticLinks", "jsonParity"] as const;
const root = findRepositoryRoot();
const cli = resolve(root, "ts/dist/src/tooling/v015-native-evidence-verifier.js");

const sourceHashes = new Set<string>();
const semanticHashes = new Set<string>();
const evidenceStageMarkers = Object.freeze({
  grammar: "B20_STAGE_GRAMMAR",
  denotation: "B20_STAGE_DENOTATION",
  semanticLinks: "B20_STAGE_SEMANTIC_LINKS",
  jsonParity: "B20_STAGE_JSON_PARITY",
});
assert.deepEqual(Object.keys(evidenceStageMarkers), [...stages],
  "machine-evidence stage markers must remain aligned with the bounded verifier");
for (const [id, source] of [
  ["F0036", "A:{}"],
  ["F0152", "A:{}"],
  ["F0180", "{ A }"],
  ["F0181", "A:{}"],
  ["F0184", "A:{}"],
] as const) {
  const sourceHash = createHash("sha256").update(source, "utf8").digest("hex");
  const expectedDigest = deriveV015BoundedAnetDigest(source);
  const input: V015NativeEvidenceRequest = {
    id,
    role: "FORMAL_V015_NOTATION_SPECIMEN",
    source,
    formalSourceSha256: sourceHash,
    expectedSemanticAnetSha256: expectedDigest,
    stages,
  };
  const actual = verifyV015NativeEvidence(input);
  assert.equal(actual.profile, "mts-v015-native-evidence/v0.1");
  assert.equal(actual.outcome, "PASS");
  assert.equal(actual.caseId, id);
  assert.equal(actual.formalSourceSha256, sourceHash);
  assert.equal(actual.semanticAnetSha256, expectedDigest);
  assert.match(actual.runnerSourceSha256, /^[0-9a-f]{64}$/);
  console.log("B20_EVIDENCE_RECEIPT=" + JSON.stringify(actual));
  const proc = spawnSync(process.execPath, [cli, "--verify-stdin"], {
    cwd: root, input: JSON.stringify(input), encoding: "utf8",
  });
  assert.equal(proc.status, 0, "native verification CLI must execute successfully: " + proc.stderr);
  assert.deepEqual(JSON.parse(proc.stdout), actual, "CLI receipt must match native checked receipt");
  sourceHashes.add(sourceHash);
  semanticHashes.add(expectedDigest);

  for (const mutant of [
    { ...input, expectedSemanticAnetSha256: "0".repeat(64) },
    { ...input, formalSourceSha256: "0".repeat(64) },
    { ...input, stages: ["grammar", "denotation"] },
    { ...input, stages: [...stages, "amemoryReplay"] },
    { ...input, role: "FORMAL_V015_THEOREM_STATEMENT" },
    { ...input, id: "NOT_AN_OCCURRENCE" },
    { ...input, source: "A->B" },
  ]) {
    assert.throws(() => verifyV015NativeEvidence(mutant),
      /v015-native-evidence-verifier/, "mutated metadata/source must fail closed");
  }
  const rejected = spawnSync(process.execPath, [cli, "--verify-stdin"], {
    cwd: root,
    input: JSON.stringify({ ...input, expectedSemanticAnetSha256: "f".repeat(64) }),
    encoding: "utf8",
  });
  assert.notEqual(rejected.status, 0, "CLI must fail closed for invented ANet digest");
  assert.equal(rejected.stdout, "", "failed CLI must not emit a successful receipt");
}
assert.equal(sourceHashes.size, 2, "distinct documentation occurrences have distinct input SHA");
assert.equal(semanticHashes.size, 2, "bare declaration != empty named bundle semantic identity profile");

console.log("MTS v0.15 bounded native evidence B20: exact FORMAL/JSON source ANet parity, accepted Link denotation and fail-closed CLI PASS");
