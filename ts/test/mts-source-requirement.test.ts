// Post-v0.15 author-triggered contextual prose review: #2080 / #2127.
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

assert.equal(model.editorialReview.status, "blocked");
assert.equal(model.editorialReview.authorApproval, "not-recorded");
assert.equal(model.editorialReview.findings.length, 6);
assert.deepEqual(model.editorialReview.findings.map((item) => item.id), [
  "V14-L1-ED01",
  "V14-L1-ED02",
  "V14-L1-ED03",
  "V14-L1-ED04",
  "V14-L1-ED05",
  "V14-L1-ED06",
]);
assert.equal(model.editorialReview.proposedStatement.sourceRole, "editorial-proposal");
assert.equal(model.editorialReview.proposedStatement.authorApproval, "not-recorded");
assert.equal(
  model.editorialReview.proposedStatement.sha256,
  "cc2673338708ca4dd245e1aa2b894d51a4859359960037bf25c5d7445d2c71c9",
);
assert.ok(model.editorialReview.proposedStatement.ru.includes("LocalSelfDecision"));
assert.ok(!model.editorialReview.proposedStatement.ru.includes("четыре команды"));

assert.ok(model.readerDefinitions, "reader definitions should be typed within the single source owner");
const definitions = model.readerDefinitions!;
assert.equal(definitions.reviewEvidence.issue, 2132);
assert.equal(definitions.reviewEvidence.comment, 6103120355);
assert.deepEqual(definitions.proofSources, [
  "proofs/lean4/MtsFoundation.lean",
  "proofs/coq/MtsFoundation.v",
]);
assert.deepEqual(definitions.entries.map((entry) => entry.id), [
  "reader-def-root",
  "reader-def-local-decision",
  "reader-def-grounded",
  "reader-premise-one-sided-existence",
  "reader-def-context-relative-role",
]);
assert.deepEqual(definitions.entries.map((entry) => entry.kind), [
  "definition", "definition", "definition", "premise", "definition",
]);
assert.ok(definitions.entries.every((entry) =>
  entry.authorApproval === "not-recorded" && entry.externalMetanotation));
assert.ok(definitions.entries[1]?.ru.includes("не доказывают наличие вычислительного алгоритма"));
assert.ok(definitions.entries[1]?.ru.includes("StartOnly(x)"));
assert.ok(definitions.entries[1]?.ru.includes("FinishOnly(x)"));
assert.ok(definitions.entries[1]?.ru.includes("PairLocal(x)"));
assert.ok(definitions.entries[2]?.ru.includes("не самостоятельная теорема тотальности"));
assert.ok(definitions.entries[4]?.ru.includes("существование двух различных"));
assert.ok(definitions.entries[0]?.ru.includes("Здесь FullSelf(F,x) означает"));
assert.ok(definitions.entries[0]?.proofSymbols.includes("FullSelf"));
assert.ok(definitions.entries[1]?.proofSymbols.includes("StartOnly"));
assert.ok(definitions.entries[1]?.proofSymbols.includes("FinishOnly"));
assert.ok(definitions.entries[1]?.proofSymbols.includes("PairLocal"));
assert.ok(definitions.entries[2]?.ru.includes("F2F3GroundedNormalization не является её предпосылкой"));
assert.ok(definitions.entries[4]?.ru.includes("E неявен в Lean, явен в Rocq"));
assert.ok(definitions.entries[4]?.proofSymbols.includes("ContextLocalStartRole"));
assert.ok(definitions.entries[4]?.proofSymbols.includes("ContextLocalEndRole"));
assert.ok(definitions.entries[2]?.proofSymbols.includes("F2F3GroundedNormalization"));
assert.ok(definitions.entries[2]?.ru.includes("равенство нормальных форм двух Grounded-связей"));
assert.ok(definitions.entries[4]?.proofSymbols.includes("RecursiveInversionDomain"));
assert.ok(definitions.entries[4]?.ru.includes("их совместимость с корнем R"));
expectReject(
  sourceText.replace("reader-def-grounded", "reader-def-root"),
  /id duplicates reader-def-root/,
  "duplicate reader definition IDs must fail",
);
expectReject(
  sourceText.replace("prerequisites: [reader-def-root]", "prerequisites: [reader-def-grounded]"),
  /prerequisites must be unique, declared earlier reader IDs/,
  "forward reader dependencies must fail",
);
expectReject(
  sourceText.replace("proof_symbols: [FullSelf, root_full_self", "proof_symbols: [MissingProofSymbol, root_full_self"),
  /reference missing symbol MissingProofSymbol/,
  "invented external theorem references must fail",
);
expectReject(
  sourceText.replace("external_metanotation: true", "external_metanotation: false"),
  /must remain external_metanotation=true/,
  "reader definitions cannot become executable FORMAL claims",
);
expectReject(
  sourceText.replace("      author_approval: not-recorded", "      author_approval: approved"),
  /author_approval=not-recorded/,
  "unapproved definition must not gain author approval",
);
expectReject(
  sourceText.replace("    - proofs/coq/MtsFoundation.v", "    - proofs/coq/Missing.v"),
  /must reference a verified artifact/,
  "missing proof source must fail",
);


assert.ok(model.readerScience, "scientific Reader DAG must be part of the same YAML authority");
const science = model.readerScience!;
assert.equal(science.status, "proposed");
assert.equal(science.publication, "blocked");
assert.equal(science.authorApproval, "not-recorded");
assert.equal(science.steps.length, 18);
assert.deepEqual(science.steps.map((step) => step.id), [
  "foundation", "incidence", "grounded", "distinction", "separation-a1",
  "root-uniqueness", "one-sided-existence", "one-sided-realizability",
  "grounded-normalization", "identity-by-poles", "inversion-domain",
  "inversion-relation", "inversion-total", "inversion-involutive",
  "chiral-classes", "chiral-orbit", "context-marker", "context-roles",
]);
const position = new Map(science.steps.map((step, index) => [step.id, index]));
for (const [index, step] of science.steps.entries()) {
  assert.ok(step.requires.every((dependency) => (position.get(dependency) ?? Infinity) < index));
  assert.ok(step.sourceEntry !== null || step.bridgeRu !== null);
}
assert.equal(science.steps[5]?.role, "conditional-theorem");
assert.deepEqual(science.steps[5]?.premises, ["A1RecursiveSeparation"]);
assert.ok(science.steps[8]?.id === "grounded-normalization");
assert.equal(science.steps[15]?.proofSymbol, "CTX_03_objective_chiral_orbit_before_context");
assert.deepEqual(science.steps[17]?.premises, [
  "A1RecursiveSeparation", "F2F3OneSidedExistence", "RecursiveInversionDomain",
]);

expectReject(
  sourceText.replace("  publication: blocked", "  publication: ready"),
  /reader_science must remain proposed, publication=blocked/,
  "proposed science DAG cannot publish",
);
expectReject(
  sourceText.replace('quote: "Во внешнем математическом интерфейсе Foundation', 'quote: "Текст вне оригинала Foundation'),
  /quote is not unique in declared source_entry/,
  "typed claim must have an exact owned source quote",
);
expectReject(
  sourceText.replace("requires: [foundation]", "requires: [context-roles]"),
  /requires must contain unique earlier reader-science IDs/,
  "future reader node must not become an unannounced dependency",
);
expectReject(
  sourceText.replace("proof_symbol: FND_02_unique_root", "proof_symbol: FakeClaim"),
  /proof_symbol missing declared conditional-theorem/,
  "a declared conditional theorem must exist in both proof languages",
);
expectReject(
  sourceText.replace("role: conditional-theorem", "role: definition"),
  /proof_symbol missing declared definition/,
  "conditional theorem cannot masquerade as an ordinary definition",
);
expectReject(
  sourceText.replace("    - id: context-marker", "    - id: foundation"),
  /id is invalid or duplicated/,
  "reader science nodes must have distinct identifiers",
);

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

assert.throws(
  () => renderMtsSourceRequirementReaderFragment(model),
  /reader publication blocked by unresolved editorial review/,
  "unresolved editorial findings must not become reader publication",
);

const audit = renderMtsSourceRequirementAuditFragment(model);
assert.ok(audit.includes("model_status=proposed"));
assert.ok(audit.includes("reader_science_nodes=18"));
assert.ok(audit.includes("reader_science_publication=blocked"));
assert.ok(audit.includes("reader_definitions_count=5"));
assert.ok(audit.includes("reader_definitions_review=2132#6103120355"));
assert.ok(audit.includes("semantic_change=false"));
assert.ok(audit.includes("statement_author_approval=not-recorded"));
assert.ok(audit.includes("clarification_author_approval=not-recorded"));
assert.ok(audit.includes("editorial_review_status=blocked"));
assert.ok(audit.includes("editorial_review_open_findings=6"));
assert.ok(audit.includes("V14-L1-ED01"));
assert.ok(audit.includes("proposed_statement_author_approval=not-recorded"));
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
  sourceText.replace(
    "editorial_review:\n  status: blocked",
    "orphaned_review:\n  status: blocked",
  ),
  /has unknown field "orphaned_review"/,
  "reader-critical editorial review may not disappear or be renamed",
);
expectReject(
  sourceText.replace(
    "  author_approval: not-recorded\n  findings:",
    "  author_approval: approved\n  findings:",
  ),
  /editorial_review.author_approval cannot be forged/,
  "editorial review approval must not be silently promoted",
);
expectReject(
  sourceText.replace("  status: blocked", "  status: accepted"),
  /editorial_review.status must remain blocked/,
  "unresolved editorial review cannot be silently accepted",
);
expectReject(
  sourceText.replace("quote: 'Первичен **" + q + "Link" + q + "**, а не четыре команды.'",
    "quote: 'Несуществующая формулировка вне источника'"),
  /quote must occur exactly once in frozen source statement/,
  "every editorial finding must point to exact source words",
);
expectReject(
  sourceText.replace(
    "cc2673338708ca4dd245e1aa2b894d51a4859359960037bf25c5d7445d2c71c9",
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  ),
  /sha256 does not match exact UTF-8 ru text/,
  "unapproved replacement candidate drift must fail closed",
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
