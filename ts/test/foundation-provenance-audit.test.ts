import assert from "node:assert/strict";

import { findRepositoryRoot } from "../src/tooling/docs-sync.js";
import {
  KNOWN_FOUNDATION_EVIDENCE_GAPS,
  auditRepositoryFoundationProvenance,
  validateFoundationProvenance,
} from "../src/tooling/foundation-provenance-audit.js";

const repositoryRoot = findRepositoryRoot();
const current = auditRepositoryFoundationProvenance(repositoryRoot);

assert.equal(current.clauseCount, 25, "accepted v0.13 baseline clause count");
assert.equal(current.directEvidenceClauseCount, 21, "accepted v0.13 direct-evidence clause count");
assert.deepEqual(
  current.gapClauseIds,
  ["A4", "A15", "F4", "F5"],
  "known accepted-v0.13 direct evidence gaps remain explicit",
);
assert.deepEqual(current.gapClauseIds, [...KNOWN_FOUNDATION_EVIDENCE_GAPS]);
assert.deepEqual(current.issues, [], "current accepted v0.13 provenance baseline must validate");

const scope = ["A0", "A1", "A2"];
const entries = {
  A0: { evidence: ["L1"] },
  A1: { evidence: ["ts/test/existing.test.ts"] },
  A2: { evidence: [] },
};
const requirements = new Set(["L1"]);

assert.deepEqual(
  validateFoundationProvenance({
    scope,
    entries,
    requirementIds: requirements,
    localEvidenceExists: (path) => path === "ts/test/existing.test.ts",
    expectedGapClauseIds: ["A2"],
  }).issues,
  [],
  "resolved requirement/file evidence and explicitly pinned gap pass",
);

const unknownRequirement = validateFoundationProvenance({
  scope,
  entries: {
    ...entries,
    A0: { evidence: ["L999"] },
  },
  requirementIds: requirements,
  localEvidenceExists: () => true,
  expectedGapClauseIds: ["A2"],
});
assert.ok(
  unknownRequirement.issues.some((entry) => entry.code === "unknown-requirement-evidence"),
  "unknown L* evidence fails closed",
);

const missingLocalFile = validateFoundationProvenance({
  scope,
  entries,
  requirementIds: requirements,
  localEvidenceExists: () => false,
  expectedGapClauseIds: ["A2"],
});
assert.ok(
  missingLocalFile.issues.some((entry) => entry.code === "invalid-local-evidence"),
  "missing repository-local evidence file fails closed",
);

const missingEntry = validateFoundationProvenance({
  scope,
  entries: {
    A0: entries.A0,
    A1: entries.A1,
  },
  requirementIds: requirements,
  localEvidenceExists: () => true,
  expectedGapClauseIds: [],
});
assert.ok(
  missingEntry.issues.some((entry) => entry.code === "scope-entry-mismatch"),
  "scope without an audit entry fails closed",
);

const extraEntry = validateFoundationProvenance({
  scope,
  entries: {
    ...entries,
    A3: { evidence: ["L1"] },
  },
  requirementIds: requirements,
  localEvidenceExists: () => true,
  expectedGapClauseIds: ["A2"],
});
assert.ok(
  extraEntry.issues.some((entry) => entry.code === "scope-entry-mismatch"),
  "audit entry outside baseline scope fails closed",
);

const newGap = validateFoundationProvenance({
  scope,
  entries: {
    A0: { evidence: [] },
    A1: entries.A1,
    A2: entries.A2,
  },
  requirementIds: requirements,
  localEvidenceExists: () => true,
  expectedGapClauseIds: ["A2"],
});
assert.ok(
  newGap.issues.some((entry) => entry.code === "gap-baseline-drift"),
  "new silent direct-evidence gap fails closed",
);

const closedGapWithoutBaselineUpdate = validateFoundationProvenance({
  scope,
  entries: {
    A0: entries.A0,
    A1: entries.A1,
    A2: { evidence: ["L1"] },
  },
  requirementIds: requirements,
  localEvidenceExists: () => true,
  expectedGapClauseIds: ["A2"],
});
assert.ok(
  closedGapWithoutBaselineUpdate.issues.some((entry) => entry.code === "gap-baseline-drift"),
  "closing a pinned gap requires the baseline to be updated explicitly in the same change",
);

console.log(
  `Foundation provenance audit: GREEN ${current.directEvidenceClauseCount}/${current.clauseCount}, gaps=${current.gapClauseIds.join(",")}.`,
);
