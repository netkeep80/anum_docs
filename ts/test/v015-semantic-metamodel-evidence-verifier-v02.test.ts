import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import {
  deriveV015SemanticMetamodelDigest,
  verifyV015SemanticMetamodelEvidence,
  type V015SemanticMetamodelEvidenceRequest,
} from "../src/tooling/v015-semantic-metamodel-evidence-verifier-v02.js";

const root = resolve("..");
const rule = "Rule = V -> (Antecedent -> ExactSequence(Image...))";
const sources = Object.freeze({
  F0005: [rule, "Theory -> Rule ∈ M_t", "M_t -> Γ(M_t) -> M_(t+1)"].join("\n"),
  F0031: rule,
  F0048: rule,
  F0130: [
    rule,
    "Theory -> Rule ∈ M_t",
    "|roles(V,M_t)| = 0  -> grounded exact refinement",
    "",
    "M_t -> Γ(M_t) -> M_(t+1)",
    "snapshot -> S1 match/bind -> S2 construct -> 0/1/N image -> atomic publication",
    "J0 = selected",
    "J1 = NOT_REQUIRED",
  ].join("\n"),
});
const expectedSemantic = Object.freeze({
  F0005: "027996fdef690e0897563f13a58894031644fcbbcc4d17d4795a6ae53849529c",
  F0031: "257cc576383eb10c4a2d3a615b6765d861e27963d96b8d4542b0a9b378ac82b3",
  F0048: "257cc576383eb10c4a2d3a615b6765d861e27963d96b8d4542b0a9b378ac82b3",
  F0130: "10189db23b6cd316358055cd8554ca46118be6c3b97c7ca46dcdd12742fd8424",
});
const stages = ["metamodelMapping", "denotation", "semanticLinks"] as const;
const stageMarkers = Object.freeze({
  metamodelMapping: "METAMODEL_STAGE_MAPPING",
  denotation: "METAMODEL_STAGE_DENOTATION",
  semanticLinks: "METAMODEL_STAGE_SEMANTIC_LINKS",
});
assert.deepEqual(Object.keys(stageMarkers), [...stages]);

const runnerSource = readFileSync(
  resolve(root, "ts/src/tooling/v015-semantic-metamodel-evidence-verifier-v02.ts"),
  "utf8",
);
const expectedRunnerSha = createHash("sha256").update(runnerSource, "utf8").digest("hex");
const receipts = [];
for (const [id, source] of Object.entries(sources)) {
  const expectedDigest = expectedSemantic[id as keyof typeof expectedSemantic];
  const sourceSha = createHash("sha256").update(source, "utf8").digest("hex");
  const semanticSha = deriveV015SemanticMetamodelDigest(id, source);
  assert.equal(semanticSha, expectedDigest, id + " semantic identity must remain byte-for-byte stable");
  const request: V015SemanticMetamodelEvidenceRequest = {
    id,
    role: "FORMAL_V015_SEMANTIC_METAMODEL",
    source,
    formalSourceSha256: sourceSha,
    expectedSemanticAnetSha256: expectedDigest,
    stages,
  };
  const receipt = verifyV015SemanticMetamodelEvidence(request);
  assert.equal(receipt.profile, "mts-v015-semantic-metamodel-evidence/v0.2");
  assert.equal(receipt.outcome, "PASS");
  assert.equal(receipt.caseId, id);
  assert.equal(receipt.formalSourceSha256, sourceSha);
  assert.equal(receipt.semanticAnetSha256, expectedDigest);
  assert.equal(receipt.runnerSourceSha256, expectedRunnerSha);
  receipts.push(receipt);
}

const base: V015SemanticMetamodelEvidenceRequest = {
  id: "F0130",
  role: "FORMAL_V015_SEMANTIC_METAMODEL",
  source: sources.F0130,
  formalSourceSha256: createHash("sha256").update(sources.F0130, "utf8").digest("hex"),
  expectedSemanticAnetSha256: expectedSemantic.F0130,
  stages,
};
const reject = (
  patch: Partial<V015SemanticMetamodelEvidenceRequest>,
  label: string,
): void => {
  assert.throws(
    () => verifyV015SemanticMetamodelEvidence({ ...base, ...patch }),
    /v015-semantic-metamodel-evidence-verifier-v02:/,
    label,
  );
};
reject({ id: "F9999" }, "unknown occurrence cannot reuse metamodel evidence");
reject({ source: base.source + "\nJ2 = invented" }, "source mutation must fail closed");
reject({ role: "FORMAL_V015_NOTATION_SPECIMEN" }, "wrong FORMAL role cannot reuse profile");
reject({ stages: ["metamodelMapping", "denotation"] }, "partial stages cannot pass");
reject({ expectedSemanticAnetSha256: "0".repeat(64) }, "semantic mapping digest cannot be forged");

const fixture = mkdtempSync(join(tmpdir(), "mts-v015-semantic-v02-"));
const copy = (path: string): void => {
  const target = resolve(fixture, path);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(resolve(root, path), target);
};
for (const path of [
  ".gitmodules",
  "ts/package.json",
  "requirements/mts-v0.15.json",
  "traceability/mts-v0.15.json",
  "contracts/mts-conformance-v0.15.json",
  "profiles/mts-v015-meta-interpreter-kernel.json",
  "profiles/mts-v015-generalized-reaction-candidate.json",
  "ts/src/tooling/v015-semantic-metamodel-evidence-verifier-v02.ts",
]) copy(path);

const originalCwd = process.cwd();
const requirementsPath = resolve(fixture, "requirements/mts-v0.15.json");
const tracePath = resolve(fixture, "traceability/mts-v0.15.json");
const requirementsRaw = readFileSync(requirementsPath, "utf8");
const traceRaw = readFileSync(tracePath, "utf8");

const assertAllDigestsStable = (label: string): void => {
  for (const [id, source] of Object.entries(sources)) {
    assert.equal(
      deriveV015SemanticMetamodelDigest(id, source),
      expectedSemantic[id as keyof typeof expectedSemantic],
      label + ": " + id,
    );
  }
};

try {
  process.chdir(fixture);

  const registryPositiveMutation = JSON.parse(requirementsRaw) as any;
  for (const id of ["V15-GAMMA-01", "V15-AND-04", "V15-CTX-01"]) {
    const row = registryPositiveMutation.requirements.find((item: any) => item.id === id);
    assert.ok(row?.evidence, "fixture registry evidence exists for " + id);
    row.evidence.positiveVectors = ["legacy-registry-positive-shadow-mutated"];
  }
  writeFileSync(requirementsPath, JSON.stringify(registryPositiveMutation), "utf8");
  assertAllDigestsStable("registry positiveVectors must not affect v0.2 semantic identity");
  writeFileSync(requirementsPath, requirementsRaw, "utf8");

  const registryGateMutation = JSON.parse(requirementsRaw) as any;
  for (const id of ["V15-GAMMA-01", "V15-AND-04", "V15-CTX-01"]) {
    const row = registryGateMutation.requirements.find((item: any) => item.id === id);
    assert.ok(row?.evidence, "fixture registry evidence exists for " + id);
    row.evidence.requiredExecutableGates = ["legacy-registry-gate-shadow-mutated"];
  }
  writeFileSync(requirementsPath, JSON.stringify(registryGateMutation), "utf8");
  assertAllDigestsStable("registry executable gates must not affect v0.2 semantic identity");
  writeFileSync(requirementsPath, requirementsRaw, "utf8");

  const missingSelected = JSON.parse(traceRaw) as any;
  missingSelected.requirements["V15-GAMMA-01"].positiveVectors =
    missingSelected.requirements["V15-GAMMA-01"].positiveVectors.filter(
      (value: string) => value !== "a9-structural-unary-one-command-sufficiency",
    );
  writeFileSync(tracePath, JSON.stringify(missingSelected), "utf8");
  assert.throws(
    () => deriveV015SemanticMetamodelDigest("F0005", sources.F0005),
    /GAMMA vectors missing a9-structural-unary-one-command-sufficiency/,
    "removing a selected traceability vector must fail closed",
  );
  writeFileSync(tracePath, traceRaw, "utf8");

  const outsidePositive = JSON.parse(traceRaw) as any;
  outsidePositive.requirements["V15-AND-04"].positiveVectors.push("outside-conformance-positive-vector");
  writeFileSync(tracePath, JSON.stringify(outsidePositive), "utf8");
  assert.throws(
    () => deriveV015SemanticMetamodelDigest("F0031", sources.F0031),
    /trace positive vector outside conformance: outside-conformance-positive-vector/,
    "traceability positive vector outside conformance must fail closed",
  );
  writeFileSync(tracePath, traceRaw, "utf8");

  const outsideGate = JSON.parse(traceRaw) as any;
  outsideGate.requirements["V15-CTX-01"].requiredExecutableGates.push("outside-conformance-executable-gate");
  writeFileSync(tracePath, JSON.stringify(outsideGate), "utf8");
  assert.throws(
    () => deriveV015SemanticMetamodelDigest("F0130", sources.F0130),
    /trace executable gate outside conformance: outside-conformance-executable-gate/,
    "traceability executable gate outside conformance must fail closed",
  );
} finally {
  process.chdir(originalCwd);
  rmSync(fixture, { recursive: true, force: true });
}

console.log("METAMODEL_STAGE_MAPPING");
console.log("METAMODEL_STAGE_DENOTATION");
console.log("METAMODEL_STAGE_SEMANTIC_LINKS");
for (const receipt of receipts) {
  console.log("METAMODEL_EVIDENCE_RECEIPT=" + JSON.stringify(receipt));
}
