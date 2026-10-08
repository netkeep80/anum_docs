import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanV015FormalLexicalSurface } from "../src/tooling/v015-markdown-prose-audit.js";
import { assessV015DocumentationAcceptance, evaluateV015DocumentationCompletion, inspectV015SecondaryLedgerRow, isV015FormalRole, isV015NonFormalRole, v015RequiredEvidenceStages } from "../src/tooling/v015-documentation-acceptance.js";
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
assert.equal(report.lexical.candidates, 478, "lexical discovery records retained FORMAL-aware rows after markup-noise normalization");
assert.equal(report.lexical.unreviewed, 106, "reviewed presentation/evidence metadata leaves only semantic/mixed/FORMAL lexical rows pending");

const lexicalFixture = mkdtempSync(join(tmpdir(), "mts-v015-markdown-"));
try {
  mkdirSync(join(lexicalFixture, "docs"));
  writeFileSync(join(lexicalFixture, "README.md"), [
    "<!-- mts-doc-version: v0.15 -->",
    "[STATUS](https://example.org/status)",
    "[Theory->Rule](https://example.org/arrow)",
    "<a id=\"technical-anchor\"></a> <!-- stable anchor -->",
    "Версия МТС: v0.15",
    "A : [B]",
    "[A,B]",
    "`K:A`",
    "![semantic arrow A->B](figure.png)",
    "```formal",
    "[A](B)",
    "```",
  ].join("\n"), "utf8");
  const lexicalFixtureResult = scanV015FormalLexicalSurface(lexicalFixture);
  assert.equal(lexicalFixtureResult.observations.length, 6,
    "Markdown/HTML infrastructure and prose colons must not become FORMAL false positives");
  assert.deepEqual(lexicalFixtureResult.observations.map(({ line, tokens }) => [line, tokens]), [
    [3, ["LINK_DIRECTION"]],
    [6, ["CONTEXT_NAME_OR_BINDING", "EXACT_SEQUENCE"]],
    [7, ["EXACT_SEQUENCE"]],
    [8, ["CONTEXT_NAME_OR_BINDING"]],
    [9, ["LINK_DIRECTION", "DIAGRAM_OR_IMAGE"]],
    [11, ["EXACT_SEQUENCE"]],
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

// An attacker must not turn a lexical/prose census GREEN with metadata flips.
const pinnedSource = "A->B";
const secondarySourceHash = createHash("sha256").update(pinnedSource).digest("hex");
const primaryWitness = {
  id: "F-PINNED", path: "docs/test.md", startLine: 2, endLine: 4,
  role: "FORMAL_V015_NOTATION_SPECIMEN", source: pinnedSource,
};
const lexicalProbe = {
  path: "docs/test.md", line: 3, source: pinnedSource,
  classification: "UNREVIEWED", verification: "NOT_VERIFIED",
};
const proseProbe = {
  path: "docs/test.md", line: 3, source: pinnedSource,
  classification: "UNREVIEWED", status: "NOT_VERIFIED",
};
assert.equal(inspectV015SecondaryLedgerRow("lexical", lexicalProbe, [primaryWitness], []).pending, true);
assert.equal(inspectV015SecondaryLedgerRow("prose", proseProbe, [primaryWitness], []).pending, true);
for (const [ledger, original, flag] of [
  ["lexical", lexicalProbe, "verification"],
  ["prose", proseProbe, "status"],
] as const) {
  const forged = { ...original, classification: "REVIEWED", [flag]: "VERIFIED" };
  const result = inspectV015SecondaryLedgerRow(ledger, forged, [primaryWitness], []);
  assert.equal(result.pending, true, "a declarative status flip cannot pass " + ledger);
  assert.match(result.defect ?? "", /unsupported review classification\/status/);
  const partiallyChanged = { ...original, [flag]: "VERIFIED" };
  assert.equal(inspectV015SecondaryLedgerRow(ledger, partiallyChanged, [], []).pending, true);
}
const reviewedNonFormal = {
  ...lexicalProbe, classification: "NON_FORMAL_GOVERNANCE_VOCABULARY",
  verification: "REVIEWED_NON_FORMAL",
  reviewBasis: "This expression describes repository governance prose, not executable MTS FORMAL.",
  reviewReference: "https://github.com/netkeep80/anum_docs/issues/1951#issuecomment-123456",
  reviewSourceSha256: secondarySourceHash,
};
assert.equal(inspectV015SecondaryLedgerRow("lexical", reviewedNonFormal, [], []).pending, false,
  "a source-pinned human review can exclude a genuinely non-FORMAL occurrence");
assert.equal(inspectV015SecondaryLedgerRow("lexical", reviewedNonFormal, [primaryWitness], []).pending, true,
  "a native FORMAL source may not be relabeled as governance prose");
assert.equal(inspectV015SecondaryLedgerRow("lexical", {
  ...reviewedNonFormal, reviewReference: "#1951",
}, [], []).pending, true, "non-FORMAL review needs a traceable comment reference");
assert.equal(inspectV015SecondaryLedgerRow("lexical", {
  ...reviewedNonFormal, reviewSourceSha256: "f".repeat(64),
}, [], []).pending, true, "non-FORMAL review must be bound to exact source");
const formalReview = {
  ...lexicalProbe, classification: "FORMAL_V015_NOTATION_SPECIMEN",
  verification: "VERIFIED_AGAINST_ACCEPTED_V015",
  primaryCandidateId: "F-PINNED", reviewSourceSha256: secondarySourceHash,
};
assert.equal(inspectV015SecondaryLedgerRow("lexical", formalReview, [primaryWitness], []).pending, true,
  "a FORMAL inventory ID without native verification is not sufficient");
assert.equal(inspectV015SecondaryLedgerRow("lexical", formalReview, [primaryWitness], [primaryWitness]).pending, false,
  "the accepted reference must be to an independently verified machine witness");
assert.equal(inspectV015SecondaryLedgerRow("lexical", {
  ...formalReview, primaryCandidateId: "F-FAKE",
}, [primaryWitness], [primaryWitness]).pending, true);
assert.equal(inspectV015SecondaryLedgerRow("lexical", {
  ...formalReview, reviewSourceSha256: "0".repeat(64),
}, [primaryWitness], [primaryWitness]).pending, true);
assert.equal(inspectV015SecondaryLedgerRow("lexical", {
  ...formalReview, line: 5,
}, [primaryWitness], [primaryWitness]).pending, true,
  "verified native evidence cannot be reused for another source occurrence");

console.log("MTS v0.15 documentation acceptance: release=ACCEPTED normative=48/48 strict=NOT_GREEN " +
  "theoremPending=" + report.theorems.missing.length + " formulaPending=" + report.formulas.pending);
