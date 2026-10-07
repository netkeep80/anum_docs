export const THEOREM_CATALOG_INTEGRATION_CONTRACT = Object.freeze({
  schema: "mts-theorem-catalog-integration/v0.5" as const,
  repoGuard: Object.freeze({
    version: "3.2.0",
    commitSha: "756944656fa14de752f44bb404e1dca852f5fa6a",
    entrypoint: "repo-guard/dist/projection-api.mjs",
  }),
  fixedSources: Object.freeze([
    "theorems/current-v0.14.json",
    "theorems/formal-v0.15.json",
    "proofs/provers.json",
    "proofs/external-proof-assurance.json",
    "proofs/native-proof-assurance.json",
    "contracts/mts-contract-v0.14.json",
  ]),
  candidateProofFamilies: Object.freeze([
    Object.freeze({
      id: "GPR" as const,
      assurancePath: "proofs/v015-external-proof-assurance.json",
      evidencePaths: Object.freeze([
        "proofs/v015-evidence/gpr01-single-state-transformer.json",
        "proofs/v015-evidence/gpr02-canonical-anet-convergence.json",
        "proofs/v015-evidence/gpr03-generation-isolation.json",
        "proofs/v015-evidence/gpr04-partition-schedule-refinement.json",
        "proofs/v015-evidence/gpr05-finite-completion-boundary.json",
        "proofs/v015-evidence/gpr06-exact-s0-opacity.json",
        "proofs/v015-evidence/gpr07-zero-role-refinement.json",
        "proofs/v015-evidence/gpr08-j0-boundary.json",
        "proofs/v015-evidence/gpr09-c-boundary-chirality.json",
      ]),
    }),
    Object.freeze({
      id: "FRM" as const,
      assurancePath: "proofs/v015-formal-proof-assurance.json",
      evidencePaths: Object.freeze([
        "proofs/v015-evidence/formal-bootstrap-frm01-06.json",
        "proofs/v015-evidence/formal-refinement-frm07-08.json",
      ]),
    }),
  ]),
  evidenceSelection: "current-index-referenced-proofs/evidence-json" as const,
  targetPath: "docs/theory/Теоремы МТС.md",
  targetOwnership: "generated" as const,
  generatorContractId: "mts.theorem-catalog/v0.5",
  readModel: Object.freeze({
    schema: "mts-theorem-projection-model/v0.5",
    theoremFields: Object.freeze([
      "id",
      "statement",
      "origin",
      "wave",
      "lawRefs",
      "assumptions",
      "formalPremises",
      "formalV015",
      "dependsOn",
      "scope",
      "exclusions",
      "evidence",
      "externalAssurance",
      "nativeAssurance",
      "provenance",
    ]),
    evidenceLanes: Object.freeze([
      "typescript",
      "lean4",
      "coq",
      "mtsNative",
      "aprover",
    ]),
  }),
  authority: Object.freeze({
    theoremInventory: "theorems/current-v0.14.json",
    formalOverlay: "theorems/formal-v0.15.json",
    laneRoles: "proofs/provers.json",
    externalAssurance: "proofs/external-proof-assurance.json",
    nativeAssurance: "proofs/native-proof-assurance.json",
    semanticLawInventory: "contracts/mts-contract-v0.14.json",
    markdown: "derived-projection-only",
  }),
});

interface CurrentTheoremEvidence {
  readonly typescript?: unknown;
  readonly lean4?: unknown;
  readonly coq?: unknown;
  readonly mtsNative?: unknown;
  readonly aprover?: unknown;
}

interface CurrentTheorem {
  readonly evidence?: CurrentTheoremEvidence;
}

interface CurrentTheoremIndex {
  readonly theorems?: readonly CurrentTheorem[];
}

export interface TheoremCatalogProjectionSource {
  readonly id: string;
  readonly kind: "repository_content";
  readonly path: string;
  readonly algorithm: "sha256";
}

export interface TheoremCatalogProjectionDeclaration {
  readonly schema: "repo-guard/projection-model/v0";
  readonly id: "mts.current-theorem-catalog";
  readonly sources: readonly TheoremCatalogProjectionSource[];
  readonly target: Readonly<{
    path: string;
    ownership: "generated";
  }>;
  readonly generator: Readonly<{
    contract_id: string;
  }>;
  readonly required_evidence: readonly string[];
}

function evidenceArrays(evidence: CurrentTheoremEvidence): readonly unknown[] {
  return [
    evidence.typescript,
    evidence.lean4,
    evidence.coq,
    evidence.mtsNative,
    evidence.aprover,
  ];
}

export function collectCurrentTheoremEvidenceRecordPaths(
  current: CurrentTheoremIndex,
): string[] {
  if (!Array.isArray(current.theorems)) {
    throw new Error("theorem-catalog integration: current theorem index must contain theorems[]");
  }

  const paths = new Set<string>();
  for (const theorem of current.theorems) {
    const evidence = theorem.evidence ?? {};
    for (const value of evidenceArrays(evidence)) {
      if (!Array.isArray(value)) continue;
      for (const candidate of value) {
        if (typeof candidate !== "string") {
          throw new Error("theorem-catalog integration: evidence path must be a string");
        }
        if (
          candidate.startsWith("proofs/evidence/") &&
          candidate.endsWith(".json")
        ) {
          paths.add(candidate);
        }
      }
    }
  }

  return [...paths].sort();
}

function projectionSource(path: string): TheoremCatalogProjectionSource {
  return Object.freeze({
    id: path,
    kind: "repository_content" as const,
    path,
    algorithm: "sha256" as const,
  });
}

export function buildTheoremCatalogProjectionDeclaration(
  current: CurrentTheoremIndex,
): TheoremCatalogProjectionDeclaration {
  const paths = [
    ...THEOREM_CATALOG_INTEGRATION_CONTRACT.fixedSources,
    ...THEOREM_CATALOG_INTEGRATION_CONTRACT.candidateProofFamilies.flatMap(
      (family) => [family.assurancePath, ...family.evidencePaths],
    ),
    ...collectCurrentTheoremEvidenceRecordPaths(current),
  ].sort();

  return Object.freeze({
    schema: "repo-guard/projection-model/v0" as const,
    id: "mts.current-theorem-catalog" as const,
    sources: Object.freeze(paths.map(projectionSource)),
    target: Object.freeze({
      path: THEOREM_CATALOG_INTEGRATION_CONTRACT.targetPath,
      ownership: THEOREM_CATALOG_INTEGRATION_CONTRACT.targetOwnership,
    }),
    generator: Object.freeze({
      contract_id: THEOREM_CATALOG_INTEGRATION_CONTRACT.generatorContractId,
    }),
    required_evidence: Object.freeze([
      "authority-boundary",
      "deterministic-render",
      "source-integrity",
    ]),
  });
}
