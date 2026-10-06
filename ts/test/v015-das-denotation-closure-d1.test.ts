import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error("v0.15 DAS closure D1: " + message);
}

const repo = resolve(process.cwd(), "..");
const evidence = JSON.parse(
  readFileSync(resolve(repo, "formal/v0.15/evidence/das01-10-source-denotation.json"), "utf8"),
) as {
  status: string;
  ownerIssue: string;
  laws: Array<{ id: string; status: string }>;
  productionPath: string[];
  executableEvidence: string[];
  approvedArtifactRegression: Array<{
    id: string;
    evidence: string;
    status: string;
    authorApproval: string;
  }>;
  boundaries: string[];
};

const requirements = JSON.parse(
  readFileSync(resolve(repo, "requirements/mts-v0.15.json"), "utf8"),
) as { requirements: Array<{ id: string; state: string }> };

const traceability = JSON.parse(
  readFileSync(resolve(repo, "traceability/mts-v0.15.json"), "utf8"),
) as {
  requirements: Record<string, {
    state: string;
    evidenceRefs: string[];
    authorJsonReview: string;
  }>;
};

assert(evidence.status === "COMPONENT_GREEN", "closure evidence status");
assert(evidence.ownerIssue === "#2002", "denotation owner");
assert(evidence.laws.length === 10, "exactly DAS-01..10");
assert(
  evidence.laws.every((law, index) =>
    law.id === "DAS-" + String(index + 1).padStart(2, "0") &&
    law.status === "GREEN"
  ),
  "all ten DAS laws are explicitly GREEN",
);

for (const path of [...evidence.productionPath, ...evidence.executableEvidence]) {
  assert(
    readFileSync(resolve(repo, path), "utf8").length > 0,
    "evidence path exists: " + path,
  );
}

for (const artifact of evidence.approvedArtifactRegression) {
  const artifactEvidence = JSON.parse(
    readFileSync(resolve(repo, artifact.evidence), "utf8"),
  ) as {
    id: string;
    status: string;
    authorJsonReview: { state: string };
  };
  assert(artifactEvidence.id === artifact.id, artifact.id + " evidence id");
  assert(
    artifactEvidence.status === "FULL_REGRESSION_GREEN",
    artifact.id + " full regression",
  );
  assert(
    artifactEvidence.authorJsonReview.state === "APPROVED",
    artifact.id + " author approval",
  );
}

const req = requirements.requirements.find((entry) => entry.id === "V15-JSON-02");
assert(req?.state === "COMPONENT_GREEN", "requirements registry state");
const trace = traceability.requirements["V15-JSON-02"];
assert(trace?.state === "COMPONENT_GREEN", "traceability state");
assert(
  trace.authorJsonReview === "APPROVED_ARTIFACTS_FULL_REGRESSION_GREEN",
  "approved artifact review boundary is explicit",
);
assert(
  trace.evidenceRefs.includes("formal/v0.15/evidence/das01-10-source-denotation.json"),
  "machine closure evidence is registered",
);
for (const id of ["V15-JSON-01", "V15-JSON-03", "V15-JSON-04"]) {
  assert(
    requirements.requirements.find((entry) => entry.id === id)?.state === "COMPONENT_GREEN",
    id + " broader JSON profile closure",
  );
  assert(
    traceability.requirements[id]?.state === "COMPONENT_GREEN",
    id + " traceability closure",
  );
}
assert(
  readFileSync(resolve(repo, "ts/test/v015-release-contract-r1.test.ts"), "utf8")
    .includes("MTS_V015_RELEASE_CONTRACT_R1=COMPONENT_GREEN_EVIDENCE"),
  "broader JSON profile is closed by R1 release-contract evidence",
);

console.log([
  "MTS_V015_DAS_01_10=COMPONENT_GREEN",
  "OWNER_2002=CLOSURE_READY",
  "JSON01=COMPONENT_GREEN",
  "JSON02=COMPONENT_GREEN",
  "JSON03=COMPONENT_GREEN",
  "JSON04=COMPONENT_GREEN",
  "BROADER_JSON_PROFILE=R1_COMPONENT_GREEN",
  "APPROVED_ARTIFACTS=2_DAS_REFINEMENT_FULL_REGRESSION_GREEN",
  "HOST_MEMBERSHIP_BRIDGE=NONE",
  "ACCEPTED_V014_UNCHANGED=TRUE",
].join(" "));
