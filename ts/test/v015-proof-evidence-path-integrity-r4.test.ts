// Corrective slice A / #2007: active v0.15 proof-evidence referential integrity.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error("v0.15 proof evidence path integrity: " + message);
}

const root = resolve(process.cwd(), "..");
const active = [
  "proofs/v015-external-proof-assurance.json",
  "proofs/v015-formal-proof-assurance.json",
  "proofs/v015-evidence/formal-bootstrap-frm01-06.json",
  "proofs/v015-evidence/formal-refinement-frm07-08.json",
  "proofs/v015-evidence/gpr01-single-state-transformer.json",
  "proofs/v015-evidence/gpr02-canonical-anet-convergence.json",
  "proofs/v015-evidence/gpr03-generation-isolation.json",
  "proofs/v015-evidence/gpr04-partition-schedule-refinement.json",
  "proofs/v015-evidence/gpr05-finite-completion-boundary.json",
  "proofs/v015-evidence/gpr06-exact-s0-opacity.json",
  "proofs/v015-evidence/gpr07-zero-role-refinement.json",
  "proofs/v015-evidence/gpr08-j0-boundary.json",
  "proofs/v015-evidence/gpr09-c-boundary-chirality.json",
] as const;

const pathLike = /^(?:ts\/|formal\/|proofs\/|profiles\/|requirements\/|traceability\/|docs\/|contracts\/|theorems\/|\.github\/)[^#]+\.(?:json|ts|md|lean|v|yml|yaml|recursive|formal)(?:#.*)?$/u;

function collect(value: unknown, out: Set<string>): void {
  if (typeof value === "string") {
    if (pathLike.test(value)) out.add(value.split("#", 1)[0]!);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collect(item, out);
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const item of Object.values(value as Record<string, unknown>)) collect(item, out);
  }
}

const refs = new Set<string>();
for (const path of active) {
  const full = resolve(root, path);
  assert(existsSync(full), "active evidence file exists: " + path);
  collect(JSON.parse(readFileSync(full, "utf8")) as unknown, refs);
}

const missing = [...refs].filter((path) => !existsSync(resolve(root, path))).sort();
assert(missing.length === 0, "missing active repository refs: " + missing.join(", "));

for (const forbidden of [
  "formal/v0.15/regression/grounded-zero-role.evidence.json",
  "formal/v0.15/regression/two-role-meta-rule.evidence.json",
  "ts/test/v015-metacompiler-corpus-closure-c0.test.ts",
  "ts/test/v015-gpr07-proof-assurance-r5.test.ts",
  "ts/test/v015-native-source-anet-denotation-das-a2.test.ts",
  "ts/test/v015-execution-image-carrier-a4.test.ts",
  "ts/test/v015-gpr09-chirality-covariance.test.ts",
]) {
  assert(!refs.has(forbidden), "obsolete research ref removed: " + forbidden);
}

console.log([
  "MTS_V015_PROOF_EVIDENCE_PATH_INTEGRITY=GREEN",
  "ACTIVE_FILES=" + active.length,
  "REFERENCED_REPOSITORY_PATHS=" + refs.size,
  "MISSING=0",
  "OBSOLETE_RESEARCH_REFS=0",
].join(" "));
