import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanV015FormalLexicalSurface } from "../src/tooling/v015-markdown-prose-audit.js";
import { assessV015DocumentationAcceptance, evaluateV015DocumentationCompletion, isV015FormalRole, isV015NonFormalRole, v015RequiredEvidenceStages } from "../src/tooling/v015-documentation-acceptance.js";
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
assert.equal(report.prose.files, 11, "full current markdown surface includes PORTFOLIO and theorem catalog");
assert.equal(report.prose.observations, 21, "broader prose-lexical observations are separately tracked");
assert.equal(report.prose.unreviewed, 21, "previously omitted ordinary markdown formulas still block acceptance");
assert.equal(report.lexical.files, 11, "FORMAL-aware universe includes every current Markdown file");
assert.equal(report.lexical.candidates, 704, "lexical discovery records :/[]/ROOT/fence/table/diagram lines");
assert.equal(report.lexical.unreviewed, 704, "wide-scan lexemes require separate review");

const lexicalFixture = mkdtempSync(join(tmpdir(), "mts-v015-markdown-"));
try {
  mkdirSync(join(lexicalFixture, "docs"));
  writeFileSync(join(lexicalFixture, "README.md"), [
    "<!-- mts-doc-version: v0.15 -->",
    "[STATUS](https://example.org/status)",
    "[Theory->Rule](https://example.org/arrow)",
    "A : [B]",
    "[A,B]",
    "![semantic arrow A->B](figure.png)",
  ].join("\n"), "utf8");
  const lexicalFixtureResult = scanV015FormalLexicalSurface(lexicalFixture);
  assert.equal(lexicalFixtureResult.observations.length, 4,
    "ordinary Markdown link labels must not become ExactSequence false positives");
  assert.deepEqual(lexicalFixtureResult.observations.map(({ line, tokens }) => [line, tokens]), [
    [3, ["LINK_DIRECTION"]],
    [4, ["CONTEXT_NAME_OR_BINDING", "EXACT_SEQUENCE"]],
    [5, ["EXACT_SEQUENCE"]],
    [6, ["LINK_DIRECTION", "DIAGRAM_OR_IMAGE"]],
  ], "real FORMAL labels, bracket sequences and diagram arrows must remain discoverable");
} finally {
  rmSync(lexicalFixture, { recursive: true, force: true });
}

assert.ok(isV015FormalRole("FORMAL_V015_NOTATION_SPECIMEN"));
assert.ok(isV015FormalRole("FORMAL_V015_THEOREM_STATEMENT"));
assert.ok(isV015FormalRole("FORMAL_V015_SEMANTIC_METAMODEL"));
assert.ok(!isV015FormalRole("FORMAL_V015"), "undeclared generic role cannot bypass verification");
assert.ok(!isV015FormalRole("FORMAL_V015_UNREVIEWED"), "unknown native role cannot pass");
assert.ok(!isV015NonFormalRole("NON_FORMAL_FAKE"), "new non-FORMAL exclusions require explicit review");
assert.deepEqual(v015RequiredEvidenceStages("FORMAL_V015_THEOREM_STATEMENT"),
  ["grammar", "denotation", "semanticLinks", "theoremMapping"]);
assert.deepEqual(v015RequiredEvidenceStages("FORMAL_V015_SEMANTIC_METAMODEL"),
  ["metamodelMapping", "denotation", "semanticLinks"],
  "metatheory does not need imaginary executable A-memory replay");
assert.throws(() => v015RequiredEvidenceStages("FORMAL_V015_UNREVIEWED"),
  /unrecognized native FORMAL documentation role/);

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
  prosePendingCount: 0,
  lexicalPendingCount: 0,
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
  lexicalPendingCount: 1,
}).some((issue) => issue.includes("unreviewed full FORMAL-aware Markdown lexical candidates")),
"one unreviewed binding or ROOT/[] occurrence must fail terminal acceptance");
assert.ok(evaluateV015DocumentationCompletion({
  ...complete,
  prosePendingCount: 1,
}).some((issue) => issue.includes("unreviewed plain Markdown formula candidates")),
"one unreviewed prose/table formula must block terminal acceptance");
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
