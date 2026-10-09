import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  deriveV015SemanticMetamodelDigest,
  verifyV015SemanticMetamodelEvidence,
  type V015SemanticMetamodelEvidenceRequest,
} from "../src/tooling/v015-semantic-metamodel-evidence-verifier.js";

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

const stages = ["metamodelMapping", "denotation", "semanticLinks"] as const;
const stageMarkers = Object.freeze({
  metamodelMapping: "METAMODEL_STAGE_MAPPING",
  denotation: "METAMODEL_STAGE_DENOTATION",
  semanticLinks: "METAMODEL_STAGE_SEMANTIC_LINKS",
});
assert.deepEqual(Object.keys(stageMarkers), [...stages]);

const receipts = [];
for (const [id, source] of Object.entries(sources)) {
  const sourceSha = createHash("sha256").update(source, "utf8").digest("hex");
  const semanticSha = deriveV015SemanticMetamodelDigest(id, source);
  const request: V015SemanticMetamodelEvidenceRequest = {
    id,
    role: "FORMAL_V015_SEMANTIC_METAMODEL",
    source,
    formalSourceSha256: sourceSha,
    expectedSemanticAnetSha256: semanticSha,
    stages,
  };
  const receipt = verifyV015SemanticMetamodelEvidence(request);
  assert.equal(receipt.profile, "mts-v015-semantic-metamodel-evidence/v0.1");
  assert.equal(receipt.outcome, "PASS");
  assert.equal(receipt.caseId, id);
  assert.equal(receipt.formalSourceSha256, sourceSha);
  assert.equal(receipt.semanticAnetSha256, semanticSha);
  assert.match(receipt.runnerSourceSha256, /^[0-9a-f]{64}$/);
  receipts.push(receipt);
}

const base: V015SemanticMetamodelEvidenceRequest = {
  id: "F0130",
  role: "FORMAL_V015_SEMANTIC_METAMODEL",
  source: sources.F0130,
  formalSourceSha256: createHash("sha256").update(sources.F0130, "utf8").digest("hex"),
  expectedSemanticAnetSha256: deriveV015SemanticMetamodelDigest("F0130", sources.F0130),
  stages,
};
const reject = (
  patch: Partial<V015SemanticMetamodelEvidenceRequest>,
  label: string,
): void => {
  assert.throws(() => verifyV015SemanticMetamodelEvidence({ ...base, ...patch }),
    /v015-semantic-metamodel-evidence-verifier:/, label);
};
reject({ id: "F9999" }, "unknown occurrence cannot reuse metamodel evidence");
reject({ source: base.source + "\nJ2 = invented" }, "source mutation must fail closed");
reject({ role: "FORMAL_V015_NOTATION_SPECIMEN" }, "wrong FORMAL role cannot reuse profile");
reject({ stages: ["metamodelMapping", "denotation"] }, "partial stages cannot pass");
reject({ expectedSemanticAnetSha256: "0".repeat(64) }, "semantic mapping digest cannot be forged");

console.log("METAMODEL_STAGE_MAPPING");
console.log("METAMODEL_STAGE_DENOTATION");
console.log("METAMODEL_STAGE_SEMANTIC_LINKS");
for (const receipt of receipts) {
  console.log("METAMODEL_EVIDENCE_RECEIPT=" + JSON.stringify(receipt));
}
