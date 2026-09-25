import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.13 A75f full duality audit: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}

function sameKeys(
  actual: Record<string, unknown>,
  expected: readonly string[],
  message: string,
): void {
  const keys = Object.keys(actual).sort();
  const wanted = [...expected].sort();
  assert(
    keys.length === wanted.length &&
      keys.every((key, index) => key === wanted[index]),
    `${message}: ${keys.join(",")} != ${wanted.join(",")}`,
  );
}

const root = resolve(process.cwd(), "..");
const contract = JSON.parse(
  readFileSync(join(root, "contracts/mts-contract-v0.13.json"), "utf8"),
);
const conformance = JSON.parse(
  readFileSync(join(root, "contracts/mts-conformance-v0.13.json"), "utf8"),
);
const registry = JSON.parse(
  readFileSync(join(root, "theorems/registry.json"), "utf8"),
);
const audit = JSON.parse(
  readFileSync(
    join(root, "theorems/v0.13/inversion/dualization-audit.json"),
    "utf8",
  ),
);

same(contract.status, "accepted", "contract status");
same(contract.accepted, true, "contract accepted");
same(conformance.status, "accepted", "conformance status");
same(conformance.accepted, true, "conformance accepted");
same(audit.authority, "index-only", "audit is not proof authority");
same(audit.version, "v0.13", "audit version");
same(audit.issue, 1544, "audit issue");

const lawIds = Array.from({ length: 13 }, (_, index) => `L${index + 1}`);
const acIds = Array.from({ length: 10 }, (_, index) => `AC${index + 1}`);

sameKeys(contract.requiredSemanticLaws, lawIds, "accepted semantic law inventory");
sameKeys(audit.laws, lawIds, "duality law coverage");
sameKeys(contract.acceptanceCriteria, acIds, "contract AC inventory");
sameKeys(conformance.acceptanceCriteriaEvidence, acIds, "conformance AC evidence");
sameKeys(audit.acceptanceCriteria, acIds, "duality AC coverage");

same(
  audit.domain.finiteRootGroundingRequired,
  contract.admissibleSemanticLinks.finiteRootGroundingRequired,
  "finite grounding domain",
);
same(
  audit.domain.distinctNodeDependencyCyclesAdmissible,
  contract.admissibleSemanticLinks.distinctNodeDependencyCyclesAdmissible,
  "distinct-node cycle admissibility",
);
same(
  audit.domain.productionNonWellFoundedMutualCyclesDeferred,
  contract.explicitlyDeferred.productionNonWellFoundedMutualCycles,
  "non-well-founded production cycle deferral",
);
assert(
  JSON.stringify(audit.domain.wellFoundedModulo) ===
    JSON.stringify(contract.admissibleSemanticLinks.wellFoundedModulo),
  "well-founded-modulo boundary matches accepted contract",
);

same(audit.verdict, "THEORY_DUALIZATION", "final classification");
same(
  audit.candidates.NO_AUTOMORPHISM.holds,
  false,
  "NO_AUTOMORPHISM rejected",
);
same(
  audit.candidates.FULL_AUTOMORPHISM.holds,
  false,
  "FULL_AUTOMORPHISM rejected",
);
same(
  audit.candidates.THEORY_DUALIZATION.holds,
  true,
  "THEORY_DUALIZATION selected",
);

const theoremById = new Map(
  registry.theorems.map((theorem: any) => [theorem.id, theorem]),
);

function requireEvidence(theoremId: string, owner: string): void {
  const theorem = theoremById.get(theoremId) as any;
  assert(theorem !== undefined, `${owner}: missing theorem ${theoremId}`);
  assert(
    theorem.status === "scoped" || theorem.status === "proven",
    `${owner}: theorem ${theoremId} is not established in declared scope`,
  );
  assert(
    Array.isArray(theorem.evidence.typescript) &&
      theorem.evidence.typescript.length > 0,
    `${owner}: theorem ${theoremId} has no executable evidence`,
  );
  for (const evidencePath of theorem.evidence.typescript) {
    assert(
      existsSync(join(root, evidencePath)),
      `${owner}: missing evidence path ${evidencePath}`,
    );
  }
}

for (const lawId of lawIds) {
  const record = audit.laws[lawId];
  assert(
    typeof record.classification === "string" &&
      record.classification.length > 0,
    `${lawId}: missing classification`,
  );
  assert(
    Array.isArray(record.evidence) && record.evidence.length > 0,
    `${lawId}: missing theorem evidence`,
  );
  for (const theoremId of record.evidence) requireEvidence(theoremId, lawId);
}

for (const acId of acIds) {
  const accepted = conformance.acceptanceCriteriaEvidence[acId];
  assert(
    typeof accepted.status === "string" && accepted.status.startsWith("green"),
    `${acId}: accepted criterion is not GREEN`,
  );

  const record = audit.acceptanceCriteria[acId];
  assert(
    typeof record.classification === "string" &&
      record.classification.length > 0,
    `${acId}: missing classification`,
  );
  assert(
    Array.isArray(record.evidence) && record.evidence.length > 0,
    `${acId}: missing theorem evidence`,
  );
  for (const theoremId of record.evidence) requireEvidence(theoremId, acId);
}

for (const candidate of Object.values(audit.candidates) as any[]) {
  assert(
    Array.isArray(candidate.evidence) && candidate.evidence.length > 0,
    "candidate classification requires theorem evidence",
  );
  for (const theoremId of candidate.evidence) {
    requireEvidence(theoremId, "candidate");
  }
}

const finalTheorem = theoremById.get("INV-10") as any;
assert(finalTheorem !== undefined, "INV-10 exists");
same(finalTheorem.status, "scoped", "INV-10 status");
assert(
  JSON.stringify(finalTheorem.dependsOn) ===
    JSON.stringify(audit.finalDependencies),
  "INV-10 dependency frontier matches audit",
);
assert(
  finalTheorem.evidence.typescript.includes(
    "ts/test/research-v013-full-duality-audit-a75f.test.ts",
  ),
  "INV-10 points to A75f",
);

// The generic meta-theorem remains separate: final v0.13 classification must
// not silently turn the broader all-Link-theories claim into a proved theorem.
const generic = theoremById.get("INV-08") as any;
same(generic.status, "conjecture", "generic INV-08 remains conjecture");

console.log([
  "MTS v0.13 A75f: FULL_DUALITY_AUDIT=GREEN_SCOPED_RESEARCH",
  "SEMANTIC_LAWS=L1_L13_ALL_COVERED",
  "ACCEPTANCE_CRITERIA=AC1_AC10_ALL_COVERED",
  "ACCEPTED_DOMAIN=FINITE_ROOT_GROUNDED_WELL_FOUNDED_MODULO_DIRECT_SELF_INCIDENCE",
  "DEFERRED_DISTINCT_NODE_CYCLES=NOT_SILENTLY_INCLUDED",
  "NO_AUTOMORPHISM=FALSE",
  "FULL_AUTOMORPHISM=FALSE",
  "THEORY_DUALIZATION=TRUE",
  "FINAL_THEOREM=INV_10_SCOPED",
  "GENERIC_META_THEOREM_INV_08=STILL_CONJECTURE",
  "NEXT=DOCUMENTATION_ISSUE_1543",
].join(" "));
