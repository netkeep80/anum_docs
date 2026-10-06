// mts-version-evidence: candidate-v0.15-metacompiler-corpus-closure-c0
// owner: #1911
// corpus-owner: #1978

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

type Json = Record<string, unknown>;

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error("v0.15 metacompiler corpus C0: " + message);
}
function record(value: unknown, message: string): Json {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), message);
  return value as Json;
}
function text(value: unknown, message: string): string {
  assert(typeof value === "string" && value.length > 0, message);
  return value;
}
function bool(value: unknown, message: string): boolean {
  assert(typeof value === "boolean", message);
  return value;
}
function sha256(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}
function read(path: string): string {
  return readFileSync(path, "utf8");
}
function json(path: string): Json {
  return JSON.parse(read(path)) as Json;
}

const repoRoot = resolve(process.cwd(), "..");
const trace = json(join(repoRoot, "traceability/mts-v0.15.json"));
const corpus = record(trace.approvedJsonCorpus, "approvedJsonCorpus");
const rawEntries = corpus.entries;
assert(Array.isArray(rawEntries), "approved corpus entries array");
const entries = rawEntries as Json[];

const baselineIds = new Set([
  "grounded-zero-role-rule",
  "two-role-meta-rule",
  "compact-boolean-and",
  "compact-boolean-not",
  "compact-boolean-or",
  "compact-boolean-xor",
]);

assert(entries.length >= baselineIds.size, "approved corpus retains six baseline artifacts");
const ids = entries.map((entry) => text(entry.id, "entry id"));
assert(new Set(ids).size === ids.length, "approved corpus IDs unique");
for (const id of baselineIds) {
  assert(ids.includes(id), "baseline approved corpus contains " + id);
}

for (const entry of entries) {
  const id = text(entry.id, "id");
  assert(text(entry.kind, id + " kind") === "EXECUTABLE", id + " is executable corpus");

  const formalPath = text(entry.formalSourceArtifact, id + " FORMAL path");
  const jsonPath = text(entry.canonicalJsonArtifact, id + " JSON path");
  const recursivePath = text(entry.expectedRecursiveRepresentation, id + " recursive path");
  const packagePath = text(entry.amemoryReplayPackage, id + " package path");
  const evidencePath = text(entry.amemoryReplayEvidence, id + " evidence path");
  const regression = record(entry.regressionEvidence, id + " regressionEvidence");
  const manifestPath = text(regression.manifest, id + " manifest path");

  for (const path of [formalPath, jsonPath, recursivePath, packagePath, evidencePath, manifestPath]) {
    assert(path.includes("formal/v0.15/regression/"), id + " artifact is permanent: " + path);
    assert(!path.includes("/candidates/"), id + " approved artifact cannot point to candidates");
    assert(existsSync(join(repoRoot, path)), id + " artifact exists: " + path);
  }

  const formal = read(join(repoRoot, formalPath));
  const canonicalJson = read(join(repoRoot, jsonPath));
  const recursive = read(join(repoRoot, recursivePath));
  const packageRaw = read(join(repoRoot, packagePath));
  const evidenceRaw = read(join(repoRoot, evidencePath));

  assert(sha256(formal) === text(entry.formalSourceDigest, id + " FORMAL digest"), id + " exact FORMAL digest");
  assert(sha256(canonicalJson) === text(entry.canonicalJsonDigest, id + " JSON digest"), id + " exact JSON digest");
  assert(sha256(recursive) === text(entry.expectedRecursiveDigest, id + " recursive digest"), id + " exact recursive digest");
  assert(sha256(packageRaw) === text(entry.amemoryReplayPackageDigest, id + " package digest"), id + " exact package digest");

  if (entry.amemoryReplayEvidenceDigest !== undefined) {
    assert(
      sha256(evidenceRaw) === text(entry.amemoryReplayEvidenceDigest, id + " evidence digest"),
      id + " exact frozen evidence digest",
    );
  }

  const recursiveLines = recursive.trim().split("\n");
  assert(recursiveLines.length > 0, id + " recursive representation nonempty");
  for (const line of recursiveLines) {
    assert(line.length > 0 && /^[8961]+$/.test(line), id + " recursive alphabet is 8/9/6/1 only");
  }

  const pkg = JSON.parse(packageRaw) as Json;
  assert(text(pkg.schema, id + " package schema") === "mts-v015-recursive-execution-package/v0.1", id + " package schema");
  const links = pkg.links;
  assert(Array.isArray(links) && links.length > 0, id + " package links");
  for (const wire of links) {
    assert(typeof wire === "string" && /^[8961]+$/.test(wire), id + " package link wire");
  }
  assert(/^[8961]+$/.test(text(pkg.entry, id + " entry wire")), id + " package entry wire");
  assert(/^[8961]+$/.test(text(pkg.negativeEntry, id + " negative entry wire")), id + " package negative entry wire");

  const evidence = JSON.parse(evidenceRaw) as Json;
  assert(text(evidence.schema, id + " evidence schema") === "mts-v015-recursive-execution-evidence/v0.1", id + " frozen evidence schema");
  assert(Array.isArray(evidence.runs) && evidence.runs.length > 0, id + " frozen positive runs");
  assert(evidence.negative_run !== null && evidence.negative_run !== undefined, id + " frozen negative run");

  const review = record(entry.authorJsonReview, id + " authorJsonReview");
  assert(text(review.state, id + " Author state") === "APPROVED", id + " exact Author approval");
  assert(text(review.artifact, id + " Author artifact") === jsonPath, id + " Author artifact path");
  assert(
    text(review.revisionOrDigest, id + " Author digest") === text(entry.canonicalJsonDigest, id + " canonical JSON digest"),
    id + " approval bound to exact JSON digest",
  );
  text(review.decisionEvidence, id + " Author decision evidence");

  assert(bool(regression.exactPersistedAmemoryEvidenceMatch, id + " exact frozen evidence parity"), id + " frozen evidence parity");

  const deps = record(entry.externalDependencies, id + " externalDependencies");
  assert(text(deps.amemoryMain, id + " frozen A-memory SHA") === "832daa89f15fd0f3b7b40819b6d3670c7fd57e7d", id + " frozen A-memory SHA");
  assert(text(deps.amemoryVersion, id + " A-memory version") === "0.175.0", id + " A-memory version");

  const manifest = json(join(repoRoot, manifestPath));
  assert(text(manifest.schema, id + " manifest schema") === "mts-v015-approved-artifact-evidence/v0.1", id + " manifest schema");
  assert(text(manifest.id, id + " manifest id") === id, id + " manifest id");
  assert(text(manifest.status, id + " manifest status") === "FULL_REGRESSION_GREEN", id + " manifest status");

  const manifestReview = manifest.authorJsonReview !== undefined
    ? record(manifest.authorJsonReview, id + " manifest authorJsonReview")
    : record(manifest.authorDecision, id + " manifest authorDecision");
  assert(text(manifestReview.state, id + " manifest approval state") === "APPROVED", id + " manifest Author approval");
}

const compatibilitySource = read(join(repoRoot, "ts/test/research-v015-compact-and-package-a2.ts"));
const discoverStart = compatibilitySource.indexOf("function discoverAdmittedRules");
const discoverEnd = compatibilitySource.indexOf("\n}\n", discoverStart);
assert(discoverStart >= 0 && discoverEnd > discoverStart, "generic Rule discovery function exists");
const discoverSource = compatibilitySource.slice(discoverStart, discoverEnd);
assert(discoverSource.includes("compiled.denotation.members"), "Rule discovery reads semantic ANet membership");
assert(discoverSource.includes("poles.start === theory"), "Rule discovery selects Theory admissions");
for (const forbidden of ["RuleFF", "RuleFT", "RuleTF", "RuleTT", "RuleF", "RuleT"]) {
  assert(!discoverSource.includes(forbidden), "Rule discovery has no program-specific " + forbidden);
}

const loweringStart = compatibilitySource.indexOf("function lowerRules");
const loweringEnd = compatibilitySource.indexOf("\n}\n", loweringStart);
assert(loweringStart >= 0 && loweringEnd > loweringStart, "generic compatibility lowering exists");
const loweringSource = compatibilitySource.slice(loweringStart, loweringEnd);
for (const forbidden of ["AND", "NOT", "OR", "XOR", "RuleFF", "RuleFT", "RuleTF", "RuleTT"]) {
  assert(!loweringSource.includes(forbidden), "compatibility lowering has no program-specific " + forbidden);
}

const workflow = read(join(repoRoot, ".github/workflows/amemory-v015-regression.yml"));
for (const required of [
  "grounded zero-role / frozen A-memory",
  "two-role meta-rule / frozen A-memory",
  "compact Boolean AND",
  "boolean-family-research:",
  "frozen A-memory approved regression",
]) {
  assert(workflow.includes(required), "frozen workflow covers " + required);
}

console.log([
  "MTS_V015_METACOMPILER_CORPUS_C0=VERTICAL_GREEN_EVIDENCE",
  "APPROVED_CORPUS_COUNT=" + entries.length,
  "FORMAL_JSON_DIGESTS=LOCKED",
  "RECURSIVE_8961=LOCKED",
  "FROZEN_PACKAGE_DIGESTS=LOCKED",
  "FROZEN_EVIDENCE=LOCKED",
  "AUTHOR_APPROVALS=LOCKED",
  "RULE_DISCOVERY=SEMANTIC_THEORY_MEMBERSHIP",
  "PROGRAM_SPECIFIC_COMPATIBILITY_DISPATCH=0",
  "METACOMPILER_OWNER=ANUM_DOCS",
  "SELF_HOSTING=DEFERRED",
].join(" "));
