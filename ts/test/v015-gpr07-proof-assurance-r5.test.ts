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

interface GprTarget {
  readonly id: string;
  readonly classification: string;
  readonly lean4: readonly string[];
  readonly rocq: readonly string[];
}

const repo = root();
const accepted = JSON.parse(
  readFileSync(resolve(repo, "proofs/external-proof-assurance.json"), "utf8"),
) as { targets: Array<{ id: string }> };
const v015 = JSON.parse(
  readFileSync(resolve(repo, "proofs/v015-external-proof-assurance.json"), "utf8"),
) as {
  allowedGlobalAxioms: { lean4: string[]; rocq: string[] };
  targets: GprTarget[];
};
const gpr06Evidence = JSON.parse(
  readFileSync(
    resolve(repo, "proofs/v015-evidence/gpr06-exact-s0-opacity.json"),
    "utf8",
  ),
) as {
  id: string;
  status: string;
  externalCrossCheck: { ciRun: number; exactHead: string };
  architecturalConsequence: {
    pureExactS0SelfHosting: string;
    j1CrossCurrentJoinRequired: boolean;
    externalSemanticGrounderRequired: boolean;
  };
  theoremProjection: { currentV014InventoryUnchanged: boolean };
};
const gpr08Evidence = JSON.parse(
  readFileSync(
    resolve(repo, "proofs/v015-evidence/gpr08-j0-boundary.json"),
    "utf8",
  ),
) as {
  id: string;
  status: string;
  externalCrossCheck: { ciRun: number; exactHead: string };
  architecturalConsequence: {
    finiteArityImpliesJ1: boolean;
    exactSequenceRemainsLinkTopology: boolean;
    physicalRoleShapeImpliesAuthority: boolean;
  };
  theoremProjection: { currentV014InventoryUnchanged: boolean };
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

assert(v015.allowedGlobalAxioms.lean4.length === 0, "v0.15 Lean axiom allowlist empty");
assert(v015.allowedGlobalAxioms.rocq.length === 0, "v0.15 Rocq axiom allowlist empty");

const ids = v015.targets.map((target) => target.id);
assert(new Set(ids).size === ids.length, "v0.15 GPR target ids are unique");
assert(
  ids.length === 4 &&
    ids.includes("GPR-01") &&
    ids.includes("GPR-06") &&
    ids.includes("GPR-07") &&
    ids.includes("GPR-08"),
  "current paired proof manifest contains exactly GPR-01, GPR-06, GPR-07 and GPR-08",
);

function target(id: string): GprTarget {
  const found = v015.targets.find((candidate) => candidate.id === id);
  assert(found !== undefined, "missing target " + id);
  return found;
}

const gpr01 = target("GPR-01");
assert(
  gpr01.classification === "PROVED_AS_PURE_SINGLE_STATE_TRANSFORMER_REFINEMENT",
  "GPR-01 classification keeps the single-state-transformer boundary explicit",
);
assert(gpr01.lean4.length === 3, "GPR-01 paired Lean assurance symbols");
assert(gpr01.rocq.length === 3, "GPR-01 paired Rocq assurance symbols");

const gpr06 = target("GPR-06");
assert(
  gpr06.classification === "PROVED_UNDER_EXPLICIT_EXACT_S0_CLOSURE_LAW",
  "GPR-06 classification keeps the exact-S0 closure premise explicit",
);
assert(gpr06.lean4.length === 3, "GPR-06 paired Lean assurance symbols");
assert(gpr06.rocq.length === 3, "GPR-06 paired Rocq assurance symbols");

const gpr08 = target("GPR-08");
assert(
  gpr08.classification ===
    "PROVED_FOR_FINITE_EXACTSEQUENCE_J0_REPRESENTATION_AND_SEMANTIC_ROLE_AUTHORITY",
  "GPR-08 classification keeps the finite-J0 and semantic-membership boundary explicit",
);
assert(gpr08.lean4.length === 3, "GPR-08 paired Lean assurance symbols");
assert(gpr08.rocq.length === 3, "GPR-08 paired Rocq assurance symbols");

const gpr07 = target("GPR-07");
assert(
  gpr07.classification === "PROVED_UNDER_EXPLICIT_GENERIC_KERNEL_LAWS",
  "GPR-07 classification keeps its premises explicit",
);
assert(gpr07.lean4.length === 2, "GPR-07 paired Lean assurance symbols");
assert(gpr07.rocq.length === 2, "GPR-07 paired Rocq assurance symbols");

for (const forbidden of ["sorry", "axiom "]) {
  assert(!lean.toLowerCase().includes(forbidden), "Lean source excludes " + forbidden);
}
for (const forbidden of ["admitted.", "axiom "]) {
  assert(!rocq.toLowerCase().includes(forbidden), "Rocq source excludes " + forbidden);
}

for (const proofTarget of v015.targets) {
  for (const symbol of proofTarget.lean4) {
    const local = symbol.split(".").at(-1);
    assert(local !== undefined && lean.includes(local), "Lean contains " + symbol);
  }
  for (const symbol of proofTarget.rocq) {
    assert(rocq.includes(symbol), "Rocq contains " + symbol);
  }
}

assert(
  ci.includes("MtsV015GeneralizedReaction.lean") &&
    ci.includes("MtsV015GeneralizedReaction.v") &&
    ci.includes("v015-external-proof-assurance.json"),
  "CI compiles and assures the separate v0.15 paired proof lane",
);

assert(gpr06Evidence.id === "GPR-06", "GPR-06 evidence id");
assert(
  gpr06Evidence.status === "PROVED_UNDER_EXPLICIT_EXACT_S0_CLOSURE_LAW",
  "GPR-06 evidence classification",
);
assert(gpr06Evidence.externalCrossCheck.ciRun === 37450135025, "GPR-06 exact proof CI is pinned");
assert(
  gpr06Evidence.externalCrossCheck.exactHead === "68a5104f50291c114f068799d0d3e30fcf910d50",
  "GPR-06 proof head is pinned",
);
assert(
  gpr06Evidence.architecturalConsequence.pureExactS0SelfHosting ===
    "FALSIFIED_UNDER_EXPLICIT_CLOSURE_LAW",
  "GPR-06 falsifies pure exact-S0 self-hosting under its explicit closure law",
);
assert(
  gpr06Evidence.architecturalConsequence.j1CrossCurrentJoinRequired === false,
  "GPR-06 does not require J1",
);
assert(
  gpr06Evidence.architecturalConsequence.externalSemanticGrounderRequired === false,
  "selected v0.15 architecture keeps structure-sensitive capability inside Gamma",
);
assert(
  gpr06Evidence.theoremProjection.currentV014InventoryUnchanged === true,
  "GPR-06 leaves accepted theorem inventory unchanged",
);

assert(gpr08Evidence.id === "GPR-08", "GPR-08 evidence id");
assert(
  gpr08Evidence.status ===
    "PROVED_FOR_FINITE_EXACTSEQUENCE_J0_REPRESENTATION_AND_SEMANTIC_ROLE_AUTHORITY",
  "GPR-08 evidence classification",
);
assert(gpr08Evidence.externalCrossCheck.ciRun === 37451545691, "GPR-08 exact proof CI is pinned");
assert(
  gpr08Evidence.externalCrossCheck.exactHead === "a01e6187e58d483ce33184950de0f83a5b43a137",
  "GPR-08 proof head is pinned",
);
assert(
  gpr08Evidence.architecturalConsequence.finiteArityImpliesJ1 === false,
  "finite arity does not imply J1",
);
assert(
  gpr08Evidence.architecturalConsequence.exactSequenceRemainsLinkTopology === true,
  "ExactSequence remains Link topology",
);
assert(
  gpr08Evidence.architecturalConsequence.physicalRoleShapeImpliesAuthority === false,
  "physical role-shaped Link does not grant semantic role authority",
);
assert(
  gpr08Evidence.theoremProjection.currentV014InventoryUnchanged === true,
  "GPR-08 leaves accepted theorem inventory unchanged",
);

assert(evidence.id === "GPR-07", "GPR-07 evidence id");
assert(
  evidence.status === "PROVED_UNDER_EXPLICIT_GENERIC_KERNEL_LAWS",
  "GPR-07 evidence classification",
);
assert(evidence.externalCrossCheck.ciRun === 37335710302, "GPR-07 exact proof CI is pinned");
assert(
  evidence.theoremProjection.currentV014InventoryUnchanged === true,
  "accepted theorem inventory remains unchanged",
);

console.log([
  "MTS_V015_GPR_PROOF_ASSURANCE=GREEN",
  "V014_ASSURANCE_TARGETS=21_UNCHANGED",
  "V015_GPR_TARGETS=4",
  "GPR01=PAIRED_LEAN_ROCQ",
  "GPR06=PAIRED_LEAN_ROCQ",
  "GPR07=PAIRED_LEAN_ROCQ",
  "GPR08=PAIRED_LEAN_ROCQ",
  "GLOBAL_AXIOM_ALLOWLIST=EMPTY",
  "GPR01_CLASSIFICATION=PROVED_AS_PURE_SINGLE_STATE_TRANSFORMER_REFINEMENT",
  "GPR06_CLASSIFICATION=PROVED_UNDER_EXPLICIT_EXACT_S0_CLOSURE_LAW",
  "GPR07_CLASSIFICATION=PROVED_UNDER_EXPLICIT_GENERIC_KERNEL_LAWS",
  "GPR08_CLASSIFICATION=PROVED_FOR_FINITE_EXACTSEQUENCE_J0_REPRESENTATION_AND_SEMANTIC_ROLE_AUTHORITY",
].join(" "));
