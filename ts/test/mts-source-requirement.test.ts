import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  loadMtsSourceRequirement,
  parseMtsSourceRequirementText,
  renderMtsSourceRequirementAuditFragment,
  renderMtsSourceRequirementReaderFragment,
} from "../src/tooling/mts-source-requirement.js";

const repositoryRoot = resolve("..");
const sourcePath = "requirements/mts-source/MTS-FND-V14-L1.yaml";
const sourceText = readFileSync(resolve(repositoryRoot, sourcePath), "utf8");
const q = String.fromCharCode(96);

function expectReject(mutated: string, pattern: RegExp, label: string): void {
  assert.throws(
    () => parseMtsSourceRequirementText(repositoryRoot, sourcePath, mutated),
    pattern,
    label,
  );
}

const model = loadMtsSourceRequirement(repositoryRoot, sourcePath);

assert.equal(model.id, "MTS-FND-V14-L1");
assert.equal(model.schema, "mts-source-requirement/v0.1");
assert.equal(model.kind, "foundation");
assert.equal(model.versionScope, "post-v0.15-publication");
assert.equal(model.modelStatus, "proposed");
assert.equal(model.semanticChange, false);

assert.equal(model.statement.sourceRole, "current-published-explanation");
assert.equal(model.statement.authorApproval, "not-recorded");
assert.equal(model.statement.authorDecision, null);
assert.equal(
  model.statement.sha256,
  "b4ed8bc68c3a45a7eb26526027d39ac2de2ed72085c34e6de33eb8e8019017f5",
);
assert.equal(
  model.statement.source.blobSha,
  "2c9d86389c17be273c64b53cb7d09ede166e427d",
);
assert.equal(
  model.statement.source.baselineCommit,
  "c64b7e21340c6add248c8f380f3fef1292616ac6",
);

assert.equal(model.clarification.sourceRole, "editorial-proposal");
assert.equal(model.clarification.authorApproval, "not-recorded");
assert.equal(model.clarification.authorDecision, null);
assert.ok(model.clarification.ru.includes(q + "1" + q + " означает"));
assert.ok(model.clarification.ru.includes(q + "0" + q + " —"));
assert.ok(model.clarification.ru.includes("не вводят в МТС тип Bool, Nat"));
assert.ok(model.clarification.ru.includes("не следует существование представителя каждого случая"));
assert.ok(model.clarification.ru.includes(q + "F2F3OneSidedExistence" + q));
assert.ok(model.clarification.ru.includes(q + "A1RecursiveSeparation" + q));

assert.equal(model.normativeOrigin.release, "v0.14");
assert.equal(model.normativeOrigin.recordId, "V14-L1");
assert.equal(
  model.normativeOrigin.englishSha256,
  "3f54624df8e72ead62dce1f35a57f6190e69f544e2d640ba0a547ebf30c04910",
);

assert.deepEqual(model.scientificBoundary.logical_partition, {
  theorem: "FND_01_local_partition",
  premises: ["LocalSelfDecision", "A1RecursiveSeparation"],
  domain: [],
});
assert.deepEqual(model.scientificBoundary.realizability, {
  theorem: "FND_01_grounded_realizability",
  premises: ["F2F3OneSidedExistence"],
  domain: [],
});
assert.deepEqual(model.scientificBoundary.root_uniqueness, {
  theorem: "FND_02_unique_root",
  premises: ["A1RecursiveSeparation"],
  domain: [],
});
assert.deepEqual(model.scientificBoundary.identity_by_poles, {
  theorem: "FND_13_identity_by_poles",
  premises: ["F2F3GroundedNormalization.complete"],
  domain: ["Grounded"],
});

const byPath = new Map(model.artifacts.map((artifact) => [artifact.path, artifact.relations]));
assert.deepEqual(byPath.get(sourcePath), ["requires"]);
assert.deepEqual(
  byPath.get("docs/theory/Система аксиом МТС.md"),
  ["requires", "documents"],
);
assert.deepEqual(
  byPath.get("proofs/lean4/MtsFoundation.lean"),
  ["requires", "verifies"],
);
assert.deepEqual(
  byPath.get("ts/src/tooling/mts-source-requirement.ts"),
  ["requires", "implements"],
);
assert.deepEqual(
  byPath.get("ts/test/mts-source-requirement.test.ts"),
  ["requires", "verifies"],
);

const reader = renderMtsSourceRequirementReaderFragment(model);
assert.ok(reader.includes("Редакционное уточнение — НЕ утверждено Автором"));
assert.ok(reader.includes("logical_partition"));
assert.ok(reader.includes("FND_01_grounded_realizability"));
assert.ok(reader.includes("Grounded"));

const audit = renderMtsSourceRequirementAuditFragment(model);
assert.ok(audit.includes("model_status=proposed"));
assert.ok(audit.includes("semantic_change=false"));
assert.ok(audit.includes("statement_author_approval=not-recorded"));
assert.ok(audit.includes("clarification_author_approval=not-recorded"));
assert.ok(audit.includes("contracts/mts-contract-v0.14.json#/requiredSemanticLaws/V14-L1"));

expectReject(
  sourceText.replace("Первичен **" + q + "Link" + q + "**", "Первичен! **" + q + "Link" + q + "**"),
  /sha256 does not match exact UTF-8 ru text/,
  "Russian source drift must fail closed",
);
expectReject(
  sourceText.replace(
    "One Link ontology and one abstract Link-forming primitive",
    "One Link ontology! and one abstract Link-forming primitive",
  ),
  /english_sha256 does not match exact English text/,
  "frozen accepted English drift must fail closed",
);
expectReject(
  sourceText.replace("semantic_change: false", "semantic_change: true"),
  /semantic_change must be false/,
  "post-v0.15 source migration cannot introduce a semantic delta",
);
expectReject(
  sourceText.replace("author_approval: not-recorded", "author_approval: approved"),
  /author_decision must be an object/,
  "approval cannot be invented without an exact Author decision",
);
expectReject(
  "id: MTS-FND-V14-L1\n" + sourceText,
  /YAML parse error/,
  "duplicate YAML keys must be rejected",
);
expectReject(
  sourceText
    .replace("kind: foundation", "kind: &shared foundation")
    .replace(
      "version_scope: post-v0.15-publication",
      "version_scope: *shared",
    ),
  /YAML alias\/shape rejection/,
  "YAML aliases must be rejected in canonical authority",
);
expectReject(
  sourceText.replace(
    "  - path: ts/src/tooling/mts-source-requirement.ts\n    relations: [requires, implements]",
    "  - path: ts/src/tooling/mts-source-requirement.ts\n    relations: [implements]",
  ),
  /must explicitly include requires/,
  "every explicit artifact relation set must include requires",
);
expectReject(
  sourceText.replace(
    "blob_sha: 2c9d86389c17be273c64b53cb7d09ede166e427d",
    "blob_sha: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  ),
  /source\.blob_sha mismatch/,
  "source file Git blob provenance must be exact",
);

console.log(
  "MTS_SOURCE_YAML_V14_L1=PASS id=" + model.id
  + " model_status=" + model.modelStatus
  + " semantic_change=" + String(model.semanticChange),
);
