import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error("v0.15 FORMAL proof assurance: " + message);
}

function root(): string {
  const candidates = [resolve(process.cwd(), ".."), process.cwd()];
  const found = candidates.find((candidate) =>
    existsSync(resolve(candidate, "proofs/v015-formal-proof-assurance.json"))
  );
  assert(found !== undefined, "repository root");
  return found;
}

const repo = root();
const manifest = JSON.parse(
  readFileSync(resolve(repo, "proofs/v015-formal-proof-assurance.json"), "utf8"),
) as {
  schema: string;
  status: string;
  ownerIssue: string;
  allowedGlobalAxioms: { lean4: string[]; rocq: string[] };
  targets: Array<{
    id: string;
    classification: string;
    premises: string[];
    exclusions: string[];
    lean4: string[];
    rocq: string[];
  }>;
};
const lean = readFileSync(
  resolve(repo, "proofs/lean4/MtsV015Formal.lean"),
  "utf8",
);
const rocq = readFileSync(
  resolve(repo, "proofs/coq/MtsV015Formal.v"),
  "utf8",
);
const ci = readFileSync(resolve(repo, ".github/workflows/ci.yml"), "utf8");

assert(
  manifest.schema === "mts-v015-formal-proof-assurance/v0.1",
  "manifest schema",
);
assert(manifest.ownerIssue === "#2004", "FORMAL proof owner is #2004");
assert(
  manifest.status === "EXECUTION_CORE_PROOF_GREEN",
  "FORMAL execution-core assurance status",
);
assert(manifest.allowedGlobalAxioms.lean4.length === 0, "Lean axiom allowlist empty");
assert(manifest.allowedGlobalAxioms.rocq.length === 0, "Rocq axiom allowlist empty");

const expectedIds = [
  "FRM-01",
  "FRM-02",
  "FRM-03",
  "FRM-04",
  "FRM-05",
  "FRM-06",
  "FRM-07",
  "FRM-08",
];
assert(
  JSON.stringify(manifest.targets.map((target) => target.id)) ===
    JSON.stringify(expectedIds),
  "bootstrap FRM target inventory exact",
);

const byId = new Map(manifest.targets.map((target) => [target.id, target]));
assert(
  byId.get("FRM-01")?.classification ===
    "PROVED_IN_SELECTED_MATHEMATICAL_MODEL",
  "FRM-01 classification",
);
assert(
  byId.get("FRM-02")?.classification ===
    "PROVED_IN_SELECTED_MATHEMATICAL_MODEL",
  "FRM-02 classification",
);
assert(
  byId.get("FRM-03")?.classification ===
    "PROVED_IN_SELECTED_MATHEMATICAL_MODEL",
  "FRM-03 classification",
);
assert(
  byId.get("FRM-04")?.classification ===
    "PROVED_UNDER_EXACT_SEQUENCE_INJECTIVITY",
  "FRM-04 keeps injectivity premise explicit",
);
assert(
  byId.get("FRM-05")?.classification ===
    "PROVED_UNDER_SHARED_NATIVE_SOURCE_PREMISE",
  "FRM-05 keeps source-convergence premise explicit",
);
assert(
  byId.get("FRM-06")?.classification ===
    "PROVED_UNDER_METACOMPILER_ROUNDTRIP_PREMISE",
  "FRM-06 keeps metacompiler round-trip premise explicit",
);
assert(
  byId.get("FRM-07")?.classification ===
    "PROVED_UNDER_EXPLICIT_PRODUCTION_REFINEMENT_PREMISES",
  "FRM-07 keeps production refinement premises explicit",
);
assert(
  byId.get("FRM-08")?.classification ===
    "PROVED_IN_SELECTED_MATHEMATICAL_MODEL_WITH_PRODUCTION_WITNESS",
  "FRM-08 keeps mathematical structural forms distinct from its production witness",
);

for (const target of manifest.targets) {
  assert(target.lean4.length > 0, target.id + " Lean symbols");
  assert(target.rocq.length > 0, target.id + " Rocq symbols");
  assert(target.exclusions.length > 0, target.id + " overclaim exclusions");
}

for (const forbidden of ["sorry", "axiom "]) {
  assert(!lean.toLowerCase().includes(forbidden), "Lean source excludes " + forbidden);
}
for (const forbidden of ["admitted.", "axiom "]) {
  assert(!rocq.toLowerCase().includes(forbidden), "Rocq source excludes " + forbidden);
}

for (const symbol of manifest.targets.flatMap((target) => target.lean4)) {
  const local = symbol.split(".").at(-1)!;
  assert(lean.includes(local), "Lean contains " + local);
}
for (const symbol of manifest.targets.flatMap((target) => target.rocq)) {
  assert(rocq.includes(symbol), "Rocq contains " + symbol);
}

assert(
  ci.includes("MtsV015Formal.lean") &&
    ci.includes("MtsV015Formal.v") &&
    ci.includes("v015-formal-proof-assurance.json") &&
    ci.includes("V015_FORMAL_ASSURANCE_TARGET"),
  "CI compiles and axiom-checks paired FORMAL proof lane",
);

console.log([
  "MTS_V015_FORMAL_PROOF_BOOTSTRAP=GREEN",
  "FRM_TARGETS=8",
  "PAIRED_LEAN_ROCQ=TRUE",
  "GLOBAL_AXIOM_ALLOWLIST=EMPTY",
  "PRODUCTION_REFINEMENT=GREEN_VIA_FRM07_FRM08_WITNESSES",
].join(" "));
