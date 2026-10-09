import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  deriveV015RootBasisDigest,
  verifyV015RootBasisEvidence,
  type V015RootBasisEvidenceRequest,
} from "../src/tooling/v015-root-basis-evidence-verifier.js";

const source = [
  "R : R->R",
  "O : O->R",
  "C : R->C",
  "L : O->C",
  "U : C->O",
].join("\n");

const stages = [
  "grammar",
  "denotation",
  "semanticLinks",
  "jsonParity",
] as const;

const stageMarkers = Object.freeze({
  grammar: "ROOT_BASIS_STAGE_GRAMMAR",
  denotation: "ROOT_BASIS_STAGE_DENOTATION",
  semanticLinks: "ROOT_BASIS_STAGE_SEMANTIC_LINKS",
  jsonParity: "ROOT_BASIS_STAGE_JSON_PARITY",
});
assert.deepEqual(Object.keys(stageMarkers), [...stages]);

const sourceSha = createHash("sha256").update(source, "utf8").digest("hex");
const semanticSha = deriveV015RootBasisDigest(source);
assert.match(sourceSha, /^[0-9a-f]{64}$/);
assert.match(semanticSha, /^[0-9a-f]{64}$/);
assert.equal(deriveV015RootBasisDigest(source), semanticSha,
  "root-basis semantic identity digest is deterministic");

const request: V015RootBasisEvidenceRequest = {
  id: "F0028",
  role: "FORMAL_V015_NOTATION_SPECIMEN",
  source,
  formalSourceSha256: sourceSha,
  expectedSemanticAnetSha256: semanticSha,
  stages,
};

const receipt = verifyV015RootBasisEvidence(request);
assert.equal(receipt.profile, "mts-v015-root-basis-evidence/v0.1");
assert.equal(receipt.outcome, "PASS");
assert.equal(receipt.caseId, "F0028");
assert.equal(receipt.formalSourceSha256, sourceSha);
assert.equal(receipt.semanticAnetSha256, semanticSha);
assert.match(receipt.runnerSourceSha256, /^[0-9a-f]{64}$/);

function reject(mutator: (value: V015RootBasisEvidenceRequest) => V015RootBasisEvidenceRequest, label: string): void {
  assert.throws(() => verifyV015RootBasisEvidence(mutator(request)),
    /v015-root-basis-evidence-verifier:/, label);
}

reject((value) => ({ ...value, id: "F0036" }),
  "profile cannot be reused for another documentation occurrence");
reject((value) => ({ ...value, source: value.source + "\nX : R->R" }),
  "source mutation must fail closed");
reject((value) => ({ ...value, role: "FORMAL_V015_THEOREM_STATEMENT" }),
  "theorem role cannot reuse notation-specimen evidence");
reject((value) => ({ ...value, stages: ["grammar", "denotation", "semanticLinks"] }),
  "partial stage set cannot pass");
reject((value) => ({ ...value, expectedSemanticAnetSha256: "0".repeat(64) }),
  "semantic digest cannot be forged");

console.log("ROOT_BASIS_STAGE_GRAMMAR");
console.log("ROOT_BASIS_STAGE_DENOTATION");
console.log("ROOT_BASIS_STAGE_SEMANTIC_LINKS");
console.log("ROOT_BASIS_STAGE_JSON_PARITY");
console.log("ROOT_BASIS_EVIDENCE_RECEIPT=" + JSON.stringify(receipt));
