import assert from "node:assert/strict";
import { assessV015DocumentationAcceptance } from "../src/tooling/v015-documentation-acceptance.js";
import { findRepositoryRoot } from "../src/tooling/docs-sync.js";

const root = findRepositoryRoot();
const report = assessV015DocumentationAcceptance(root);
const again = assessV015DocumentationAcceptance(root);
assert.equal(report.schema, "mts-v015-current-documentation-acceptance/v0.1");
assert.deepEqual(report, again, "acceptance status is deterministic");
assert.equal(report.acceptedRelease, true, "MTS v0.15 release is accepted independently of docs acceptance");
assert.equal(report.normative.expected, 48);
assert.equal(report.normative.projected, 48);
assert.equal(report.theorems.historical, 21);
assert.equal(report.theorems.formal + report.theorems.missing.length, report.theorems.historical);
assert.equal(report.formulas.total, 194);
assert.equal(report.formulas.pending + report.formulas.reviewedNonFormal + report.formulas.verified, report.formulas.total);
assert.equal(report.ready, report.blockers.length === 0);
assert.equal(report.ready, false, "current docs must not be accidentally declared fully FORMAL-conformant");
assert.ok(report.blockers.some((item) => item.includes("missing FORMAL theorem projections")));
assert.ok(report.blockers.some((item) => item.includes("unverified current documentation formula candidates")));
assert.ok(report.blockers.some((item) => item.includes("manifest not COMPLETE_VERIFIED")));
console.log("MTS v0.15 documentation acceptance: release=ACCEPTED normative=48/48 strict=NOT_GREEN " +
  "theoremPending=" + report.theorems.missing.length + " formulaPending=" + report.formulas.pending);
