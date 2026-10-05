import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error("v0.15 GPR proof assurance: " + message);
}

function root(): string {
  const candidates = [resolve(process.cwd(), ".."), process.cwd()];
  const found = candidates.find((candidate) =>
    existsSync(resolve(candidate, "proofs/v015-external-proof-assurance.json"))
  );
  assert(found !== undefined, "repository root");
  return found;
}

const repo = root();
const accepted = JSON.parse(
  readFileSync(resolve(repo, "proofs/external-proof-assurance.json"), "utf8"),
) as { targets: Array<{ id: string }> };
const v015 = JSON.parse(
  readFileSync(resolve(repo, "proofs/v015-external-proof-assurance.json"), "utf8"),
) as {
  allowedGlobalAxioms: { lean4: string[]; rocq: string[] };
  targets: Array<{
    id: string;
    classification: string;
    lean4: string[];
    rocq: string[];
  }>;
};
const evidence = JSON.parse(
  readFileSync(
    resolve(repo, "proofs/v015-evidence/gpr07-zero-role-refinement.json"),
    "utf8",
  ),
) as {
  id: string;
  status: string;
  externalCrossCheck: { ciRun: number };
  theoremProjection: { currentV014InventoryUnchanged: boolean };
};
const lean = readFileSync(
  resolve(repo, "proofs/lean4/MtsV015GeneralizedReaction.lean"),
  "utf8",
);
const rocq = readFileSync(
  resolve(repo, "proofs/coq/MtsV015GeneralizedReaction.v"),
  "utf8",
);
const ci = readFileSync(resolve(repo, ".github/workflows/ci.yml"), "utf8");

assert(accepted.targets.length === 21, "accepted v0.14 assurance remains 21 targets");
assert(
  !accepted.targets.some((target) => target.id.startsWith("GPR-")),
  "v0.15 GPR targets do not leak into accepted v0.14 assurance",
);

assert(v015.targets.length === 1, "current v0.15 paired proof manifest has one classified target");
const gpr07 = v015.targets[0]!;
assert(gpr07.id === "GPR-07", "GPR-07 is the v0.15 proof target");
assert(
  gpr07.classification === "PROVED_UNDER_EXPLICIT_GENERIC_KERNEL_LAWS",
  "GPR-07 classification keeps its premises explicit",
);
assert(v015.allowedGlobalAxioms.lean4.length === 0, "v0.15 Lean axiom allowlist empty");
assert(v015.allowedGlobalAxioms.rocq.length === 0, "v0.15 Rocq axiom allowlist empty");
assert(gpr07.lean4.length === 2, "paired Lean assurance symbols");
assert(gpr07.rocq.length === 2, "paired Rocq assurance symbols");

for (const forbidden of ["sorry", "axiom "]) {
  assert(!lean.toLowerCase().includes(forbidden), "Lean source excludes " + forbidden);
}
for (const forbidden of ["admitted.", "axiom "]) {
  assert(!rocq.toLowerCase().includes(forbidden), "Rocq source excludes " + forbidden);
}

assert(
  lean.includes("GPR_07_grounded_zero_role_refinement"),
  "Lean contains GPR-07 refinement theorem",
);
assert(
  rocq.includes("GPR_07_grounded_zero_role_refinement"),
  "Rocq contains GPR-07 refinement theorem",
);

assert(
  ci.includes("MtsV015GeneralizedReaction.lean") &&
    ci.includes("MtsV015GeneralizedReaction.v") &&
    ci.includes("v015-external-proof-assurance.json"),
  "CI compiles and assures the separate v0.15 paired proof lane",
);

assert(evidence.id === "GPR-07", "evidence id");
assert(
  evidence.status === "PROVED_UNDER_EXPLICIT_GENERIC_KERNEL_LAWS",
  "evidence classification",
);
assert(evidence.externalCrossCheck.ciRun === 37335710302, "exact proof CI is pinned");
assert(
  evidence.theoremProjection.currentV014InventoryUnchanged === true,
  "accepted theorem inventory remains unchanged",
);

console.log([
  "MTS_V015_GPR07_PROOF_ASSURANCE=GREEN",
  "V014_ASSURANCE_TARGETS=21_UNCHANGED",
  "V015_GPR07=PAIRED_LEAN_ROCQ",
  "GLOBAL_AXIOM_ALLOWLIST=EMPTY",
  "GPR07_CLASSIFICATION=PROVED_UNDER_EXPLICIT_GENERIC_KERNEL_LAWS",
].join(" "));
