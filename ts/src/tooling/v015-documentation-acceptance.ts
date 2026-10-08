import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildMarkdownCoverageAudit } from "./markdown-coverage-audit.js";
import { findRepositoryRoot } from "./docs-sync.js";

type Obj = Record<string, unknown>;
function record(value: unknown, name: string): Obj {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("v015-documentation-acceptance: " + name + " must be an object");
  }
  return value as Obj;
}
function list(value: unknown, name: string): Obj[] {
  if (!Array.isArray(value)) throw new Error("v015-documentation-acceptance: " + name + " must be an array");
  return value.map((item, index) => record(item, name + "[" + index + "]"));
}
function field(value: Obj, name: string): string {
  if (typeof value[name] !== "string" || (value[name] as string).length === 0) {
    throw new Error("v015-documentation-acceptance: invalid " + name);
  }
  return value[name] as string;
}
function read(root: string, path: string): Obj {
  return record(JSON.parse(readFileSync(resolve(root, path), "utf8")) as unknown, path);
}

export interface V015DocumentationAcceptanceReport {
  readonly schema: "mts-v015-current-documentation-acceptance/v0.1";
  readonly acceptedRelease: boolean;
  readonly normative: Readonly<{ expected: number; projected: number }>;
  readonly theorems: Readonly<{ historical: number; formal: number; missing: readonly string[] }>;
  readonly formulas: Readonly<{ total: number; pending: number; reviewedNonFormal: number; verified: number }>;
  readonly blockers: readonly string[];
  readonly ready: boolean;
}

export function assessV015DocumentationAcceptance(root: string): V015DocumentationAcceptanceReport {
  const requirements = read(root, "requirements/mts-v0.15.json");
  const acceptedRelease = requirements.accepted === true && requirements.mtsVersion === "v0.15";
  const coverage = buildMarkdownCoverageAudit(root);
  const normativeExpected = coverage.summary.currentNormativeRequirementCount;
  const normativeProjected = coverage.summary.currentNormativeProjectedCount;
  const historical = list(read(root, "theorems/current-v0.14.json").theorems, "historical theorems");
  const overlay = list(read(root, "theorems/formal-v0.15.json").entries, "FORMAL theorem entries");
  const historicalIds = historical.map((entry) => field(entry, "id"));
  const formalIds = overlay.map((entry) => field(entry, "id"));
  const formalSet = new Set(formalIds);
  const missing = historicalIds.filter((id) => !formalSet.has(id));
  const invalidOverlayIds = formalIds.filter((id) => !historicalIds.includes(id));
  const inventory = read(root, "audits/v015-formula-candidate-inventory.json");
  const candidates = list(inventory.candidates, "formula candidates");
  const pending = candidates.filter((item) =>
    field(item, "role") === "UNCLASSIFIED" || field(item, "denotation") === "NOT_VERIFIED");
  const reviewedNonFormal = candidates.filter((item) => field(item, "role").startsWith("NON_FORMAL_") &&
    field(item, "denotation").startsWith("NOT_APPLICABLE_") &&
    typeof item.reviewBasis === "string" && item.reviewBasis.length > 0);
  const verified = candidates.filter((item) =>
    item.role === "FORMAL_V015" && item.denotation === "VERIFIED_AGAINST_ACCEPTED_V015");
  const other = candidates.length - pending.length - reviewedNonFormal.length - verified.length;
  const manifest = read(root, "audits/v015-current-documentation-migration.json");
  const blockers: string[] = [];
  if (!acceptedRelease || coverage.contract !== "mts-contract/v0.15") blockers.push("accepted release authority mismatch");
  if (normativeExpected !== 48 || normativeProjected !== normativeExpected) blockers.push("normative v0.15 requirements not fully projected");
  if (formalSet.size !== formalIds.length || invalidOverlayIds.length > 0) blockers.push("invalid/duplicate FORMAL theorem overlays");
  if (missing.length > 0) blockers.push("missing FORMAL theorem projections: " + missing.join(", "));
  if (pending.length > 0) blockers.push("unverified current documentation formula candidates: " + pending.length);
  if (other > 0) blockers.push("unreviewed/unrecognized formula classification: " + other);
  if (manifest.state !== "COMPLETE_VERIFIED") blockers.push("final author-reviewed documentation migration manifest not COMPLETE_VERIFIED");
  return Object.freeze({
    schema: "mts-v015-current-documentation-acceptance/v0.1" as const,
    acceptedRelease,
    normative: Object.freeze({ expected: normativeExpected, projected: normativeProjected }),
    theorems: Object.freeze({ historical: historical.length, formal: formalIds.length, missing: Object.freeze(missing) }),
    formulas: Object.freeze({ total: candidates.length, pending: pending.length, reviewedNonFormal: reviewedNonFormal.length, verified: verified.length }),
    blockers: Object.freeze(blockers),
    ready: blockers.length === 0,
  });
}

const invokedPath = process.argv[1] === undefined ? undefined : resolve(process.argv[1]);
if (invokedPath === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2] ?? "--status";
  if (mode !== "--status" && mode !== "--check") throw new Error("use --status or --check");
  const report = assessV015DocumentationAcceptance(findRepositoryRoot());
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  if (mode === "--check" && !report.ready) process.exitCode = 1;
}
