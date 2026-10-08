import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  deriveV015TheoremStatementDigest,
  verifyV015TheoremStatementEvidence,
  type V015TheoremStatementEvidenceRequest,
} from "../src/tooling/v015-theorem-statement-evidence-verifier.js";

const sources = Object.freeze({
  "F0063": "FND01_STATEMENT : FND01_PREMISES->FND01_CONCLUSION",
  "F0067": "FND02_STATEMENT : FND02_PREMISES->FND02_RULE",
  "F0071": "FND13_STATEMENT : FND13_PREMISES->FND13_RULES",
  "F0084": "FND07_STATEMENT : TARGET_PREMISES->TARGET_CONCLUSION",
  "F0090": "FND08_STATEMENT : TARGET_PREMISES->G_RESULT",
  "F0094": "FND09_STATEMENT : TARGET_PREMISES->G_RESULT",
  "F0116": "EXE02_STATEMENT : EXE02_PREMISES->EXE02_CLAUSES"
});
const stages = ["grammar", "denotation", "semanticLinks", "theoremMapping"] as const;
const stageMarkers = Object.freeze({
  grammar: "THEOREM_STAGE_GRAMMAR",
  denotation: "THEOREM_STAGE_DENOTATION",
  semanticLinks: "THEOREM_STAGE_SEMANTIC_LINKS",
  theoremMapping: "THEOREM_STAGE_MAPPING",
});
assert.deepEqual(Object.keys(stageMarkers), [...stages]);

const receipts = [];
for (const [id, source] of Object.entries(sources)) {
  const sourceSha = createHash("sha256").update(source, "utf8").digest("hex");
  const semanticSha = deriveV015TheoremStatementDigest(id, source);
  const request: V015TheoremStatementEvidenceRequest = {
    id,
    role: "FORMAL_V015_THEOREM_STATEMENT",
    source,
    formalSourceSha256: sourceSha,
    expectedSemanticAnetSha256: semanticSha,
    stages,
  };
  const receipt = verifyV015TheoremStatementEvidence(request);
  assert.equal(receipt.profile, "mts-v015-theorem-statement-evidence/v0.1");
  assert.equal(receipt.outcome, "PASS");
  assert.equal(receipt.caseId, id);
  assert.equal(receipt.formalSourceSha256, sourceSha);
  assert.equal(receipt.semanticAnetSha256, semanticSha);
  assert.match(receipt.runnerSourceSha256, /^[0-9a-f]{64}$/);
  receipts.push(receipt);
}

const base: V015TheoremStatementEvidenceRequest = {
  id: "F0063",
  role: "FORMAL_V015_THEOREM_STATEMENT",
  source: sources.F0063,
  formalSourceSha256: createHash("sha256").update(sources.F0063, "utf8").digest("hex"),
  expectedSemanticAnetSha256: deriveV015TheoremStatementDigest("F0063", sources.F0063),
  stages,
};
const reject = (patch: Partial<V015TheoremStatementEvidenceRequest>, label: string): void => {
  assert.throws(() => verifyV015TheoremStatementEvidence({ ...base, ...patch }),
    /v015-theorem-statement-evidence-verifier:/, label);
};
reject({ id: "F9999" }, "unknown theorem occurrence cannot reuse statement evidence");
reject({ source: base.source + "_MUTATED" }, "statement mutation must fail closed");
reject({ role: "FORMAL_V015_NOTATION_SPECIMEN" }, "wrong FORMAL role cannot reuse theorem profile");
reject({ stages: ["grammar", "denotation", "semanticLinks"] }, "partial stage set cannot pass");
reject({ expectedSemanticAnetSha256: "0".repeat(64) }, "theorem semantic identity digest cannot be forged");

console.log("THEOREM_STAGE_GRAMMAR");
console.log("THEOREM_STAGE_DENOTATION");
console.log("THEOREM_STAGE_SEMANTIC_LINKS");
console.log("THEOREM_STAGE_MAPPING");
for (const receipt of receipts) {
  console.log("THEOREM_EVIDENCE_RECEIPT=" + JSON.stringify(receipt));
}
