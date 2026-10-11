import assert from "node:assert/strict";
import { resolve } from "node:path";
import { loadMtsSemanticIr } from "../src/tooling/mts-compiler.js";
import { loadReaderCoverage, projectReaderCoverage, renderReaderCoverageAudit }
  from "../src/tooling/mts-reader-coverage.js";

const root = resolve("..");
const v14 = loadMtsSemanticIr(root, "requirements/mts-v0.14.json").requirements;
const v15 = loadMtsSemanticIr(root).requirements;
const plan = loadReaderCoverage(root);
assert.equal(plan.schema, "mts-reader-coverage-plan/v0.1");
assert.equal(plan.status, "proposed");
assert.equal(plan.semanticChange, false);
assert.equal(plan.authority, "accepted-registries-only");
assert.equal(plan.rows.length, 62);
assert.equal(new Set(plan.rows.map(row => row.id)).size, 62);
assert.equal(plan.rows.filter(row => row.release === "v0.14").length, 14);
assert.equal(plan.rows.filter(row => row.release === "v0.15").length, 48);
assert.ok(plan.rows.every(row => row.authorApproval === "not-recorded" && row.publication === "blocked"));
assert.ok(plan.rows.every(row => row.readerDependsOn === "scientific-review-pending"));
assert.ok(plan.rows.every(row => row.acceptedAuthority.pointer === "/requiredSemanticLaws/" + row.id));
assert.ok(plan.rows.every(row => row.currentDocOwner.path.length > 0 && row.currentDocOwner.anchor.length > 0));
const source = new Map([...v14, ...v15].map(item => [item.id, item]));
for (const row of plan.rows) {
  const accepted = source.get(row.id);
  assert.ok(accepted, "projected IDs must match accepted source");
  assert.deepEqual(row.normativeDependsOn, accepted.dependsOn);
  assert.equal(row.acceptedAuthority.path, accepted.authorityDocument);
  assert.deepEqual(row.currentDocOwner, {path: accepted.docPath, anchor: accepted.docAnchor});
}
assert.deepEqual(plan.rows.filter(x => x.russianAtomicReview !== "not-started").map(x => x.id), ["V14-L1"]);
assert.equal(plan.rows.filter(x => x.release === "v0.15" &&
  x.currentDocOwner.path === "docs/specs/Формальная нотация МТС.md").length, 48);
assert.equal(plan.rows.find(x => x.id === "V14-L12")?.proposedSection, "inversion-and-context");
assert.equal(plan.rows.find(x => x.id === "V15-GAMMA-01")?.proposedSection, "execution");
assert.equal(plan.rows.find(x => x.id === "V15-GOV-01")?.proposedSection, "governance");
assert.equal(plan.rows.find(x => x.id === "V15-DOCS-01")?.proposedSection, "documentation");
assert.throws(() => projectReaderCoverage(v14.slice(1), v15), /exact 14 \+ 48/);
assert.throws(() => projectReaderCoverage(v14, v15.slice(1)), /exact 14 \+ 48/);
assert.throws(() => projectReaderCoverage([...v14.slice(1), v14[1]!], v15), /duplicate or non-accepted ID/);
assert.throws(() => projectReaderCoverage(v14, [
  { ...v15[0]!, classificationPath: "v015/unknown" }, ...v15.slice(1),
]), /scientific chapter routing has no owner/);
assert.throws(() => projectReaderCoverage(v14, [
  { ...v15[0]!, dependsOn: ["nonexistent"] }, ...v15.slice(1),
]), /unresolved normative dependency/);
assert.throws(() => projectReaderCoverage(v14, [
  { ...v15[0]!, authorityPointer: "/requiredSemanticLaws/FORGED" }, ...v15.slice(1),
]), /missing accepted authority/);
assert.throws(() => projectReaderCoverage(v14, [
  { ...v15[0]!, status: "proposed" }, ...v15.slice(1),
]), /duplicate or non-accepted ID/);
const audit = renderReaderCoverageAudit(plan);
for (const line of ["accepted_ids=62", "inherited_v014=14", "accepted_v015=48",
 "author_approved=0", "publication_ready=0", "reader_edges_verified=0"]) {
  assert.ok(audit.includes(line));
}
console.log("G5 reader coverage census: 62/62 proposed; publication blocked.");
