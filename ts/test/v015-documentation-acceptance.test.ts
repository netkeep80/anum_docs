import assert from "node:assert/strict";
import { assessV015DocumentationAcceptance, evaluateV015DocumentationCompletion } from "../src/tooling/v015-documentation-acceptance.js";
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
assert.equal(report.formulas.total, 202);
assert.equal(report.formulas.pending + report.formulas.reviewedNonFormal + report.formulas.verified, report.formulas.total);
assert.ok(!report.blockers.some((issue) => issue.includes("stale/tampered formula inventory")),
  "current source SHA and independently rediscovered formula candidates must be exact");
assert.ok(!report.blockers.some((issue) => issue.includes("FORMAL authority-classification mismatch")),
  "accepted theorem/notation sources must remain explicitly FORMAL");
assert.equal(report.ready, report.blockers.length === 0);
if (report.theorems.missing.length > 0 || report.formulas.pending > 0) {
  assert.equal(report.ready, false, "incomplete FORMAL migration cannot pass document acceptance");
}
if (report.theorems.missing.length > 0) assert.ok(report.blockers.some((item) => item.includes("missing FORMAL theorem projections")));
if (report.formulas.pending > 0) assert.ok(report.blockers.some((item) => item.includes("unverified current documentation formula candidates")));
assert.ok(report.blockers.every((item) => typeof item === "string" && item.length > 0));
// Future-GREEN regression: this is a synthetic *completed* machine-verified
// state. The current live repository remains RED until real witnesses exist.
const ids = Array.from({ length: 21 }, (_, i) => "T-" + (i + 1));
const complete = {
  acceptedRelease: true,
  normativeExpected: 48,
  normativeProjected: 48,
  historicalIds: ids,
  overlayIds: ids,
  verifiedFormalIds: ids,
  invalidOverlayIds: [],
  pendingCount: 0,
  unexpectedFormulaCount: 0,
  evidenceDefects: [],
  inventoryIntegrityIssues: [],
  sourceClassificationIssues: [],
  manifestState: "COMPLETE_VERIFIED",
  contract: "mts-contract/v0.15",
} as const;
assert.deepEqual(evaluateV015DocumentationCompletion(complete), [],
  "terminal state 21/21, 19 source-verified FORMAL + full evidence MUST be reachable");
assert.ok(evaluateV015DocumentationCompletion({
  ...complete,
  evidenceDefects: ["F0001: missing semantic source/denotation/replay witness"],
}).some((issue) => issue.includes("machine evidence incomplete")),
"changing VERIFIED metadata without machine evidence must not allow GREEN");
assert.ok(evaluateV015DocumentationCompletion({
  ...complete,
  pendingCount: 1,
}).some((issue) => issue.includes("unverified current documentation")),
"one unverified FORMAL case must block terminal acceptance");
assert.ok(evaluateV015DocumentationCompletion({
  ...complete,
  verifiedFormalIds: ids.slice(0, 20),
}).some((issue) => issue.includes("missing FORMAL theorem projections")),
"20/21 theorem migrations cannot pass acceptance");

console.log("MTS v0.15 documentation acceptance: release=ACCEPTED normative=48/48 strict=NOT_GREEN " +
  "theoremPending=" + report.theorems.missing.length + " formulaPending=" + report.formulas.pending);
