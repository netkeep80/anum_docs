import {
  THEOREM_CATALOG_INTEGRATION_CONTRACT,
} from "./theorem-projection-contract.js";

export type V015CandidateProofStatus =
  | "PROVED"
  | "CONDITIONAL"
  | "KERNEL_REALIZED"
  | "OPEN";

export interface V015CandidateProofProjection {
  readonly id: string;
  readonly family: "GPR" | "FRM";
  readonly projectionStatus: V015CandidateProofStatus;
  readonly classification: string;
  readonly premises: readonly string[];
  readonly exclusions: readonly string[];
  readonly lean4: readonly string[];
  readonly rocq: readonly string[];
  readonly authority: "external-cross-check-only";
  readonly ownerIssue: string;
  readonly assurancePath: string;
  readonly evidencePath: string;
  readonly evidenceStatus: string;
  readonly exactHead: string | null;
  readonly ciRun: number | null;
  readonly sourcePaths: readonly string[];
}

type JsonObject = Record<string, any>;

function fail(message: string): never {
  throw new Error("v0.15-candidate-proof-projection: " + message);
}

function object(value: unknown, label: string): JsonObject {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return fail(label + " must be an object");
  }
  return value as JsonObject;
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    return fail(label + " must be a non-empty string");
  }
  return value;
}

function strings(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) return fail(label + " must be an array");
  return value.map((entry, index) => text(entry, label + "[" + index + "]"));
}

function issue(value: unknown, label: string): string {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return "#" + value;
  }
  const raw = text(value, label);
  return raw.startsWith("#") ? raw : "#" + raw;
}

function projectionStatus(
  classification: string,
  premises: readonly string[],
): V015CandidateProofStatus {
  if (classification.includes("KERNEL_REALIZED")) return "KERNEL_REALIZED";
  if (!classification.startsWith("PROVED")) return "OPEN";
  if (premises.length > 0 || classification.includes("_UNDER_")) return "CONDITIONAL";
  return "PROVED";
}

function sourcePaths(evidence: JsonObject): string[] {
  const result = new Set<string>();
  if (evidence.externalCrossCheck !== undefined) {
    const cross = object(
      evidence.externalCrossCheck,
      "candidate evidence.externalCrossCheck",
    );
    for (const lane of ["lean4", "rocq"]) {
      if (cross[lane] === undefined) continue;
      const source = object(
        cross[lane],
        "candidate evidence.externalCrossCheck." + lane,
      );
      if (typeof source.path === "string") result.add(source.path);
    }
  }
  if (evidence.sources !== undefined) {
    const sources = object(evidence.sources, "candidate evidence.sources");
    for (const value of Object.values(sources)) {
      if (typeof value === "string") result.add(value);
    }
  }
  for (const key of ["executableWitnesses", "approvedArtifactWitnesses"]) {
    if (evidence[key] === undefined) continue;
    for (const value of strings(evidence[key], "candidate evidence." + key)) {
      result.add(value);
    }
  }
  return [...result].sort();
}

export function buildV015CandidateProofProjection(
  candidateAssurance: Readonly<Record<string, unknown>>,
  candidateEvidence: Readonly<Record<string, unknown>>,
): V015CandidateProofProjection[] {
  const result: V015CandidateProofProjection[] = [];
  const seen = new Set<string>();

  for (const family of THEOREM_CATALOG_INTEGRATION_CONTRACT.candidateProofFamilies) {
    const manifest = object(
      candidateAssurance[family.assurancePath],
      family.assurancePath,
    );
    if (manifest.authority !== "external-cross-check-only") {
      fail(family.assurancePath + " must remain external-cross-check-only");
    }

    const allowed = object(
      manifest.allowedGlobalAxioms,
      family.assurancePath + ".allowedGlobalAxioms",
    );
    if (
      strings(
        allowed.lean4,
        family.assurancePath + ".allowedGlobalAxioms.lean4",
      ).length !== 0 ||
      strings(
        allowed.rocq,
        family.assurancePath + ".allowedGlobalAxioms.rocq",
      ).length !== 0
    ) {
      fail(family.assurancePath + " global axiom allowlists must remain empty");
    }

    if (!Array.isArray(manifest.targets)) {
      fail(family.assurancePath + ".targets must be an array");
    }
    const ownerIssue = issue(
      manifest.ownerIssue,
      family.assurancePath + ".ownerIssue",
    );

    const evidenceByTarget = new Map<
      string,
      { readonly path: string; readonly value: JsonObject }
    >();

    for (const evidencePath of family.evidencePaths) {
      const evidence = object(candidateEvidence[evidencePath], evidencePath);
      if (typeof evidence.id === "string" && /^GPR-\d+$/.test(evidence.id)) {
        if (evidenceByTarget.has(evidence.id)) {
          fail("duplicate candidate evidence for " + evidence.id);
        }
        evidenceByTarget.set(evidence.id, {
          path: evidencePath,
          value: evidence,
        });
      }
      if (Array.isArray(evidence.targets)) {
        for (const [index, raw] of evidence.targets.entries()) {
          const target = object(
            raw,
            evidencePath + ".targets[" + index + "]",
          );
          const id = text(
            target.id,
            evidencePath + ".targets[" + index + "].id",
          );
          if (evidenceByTarget.has(id)) {
            fail("duplicate candidate evidence for " + id);
          }
          evidenceByTarget.set(id, {
            path: evidencePath,
            value: evidence,
          });
        }
      }
    }

    for (const [index, raw] of manifest.targets.entries()) {
      const target = object(
        raw,
        family.assurancePath + ".targets[" + index + "]",
      );
      const id = text(
        target.id,
        family.assurancePath + ".targets[" + index + "].id",
      );
      if (seen.has(id)) fail("duplicate candidate proof id " + id);
      seen.add(id);
      if (!id.startsWith(family.id + "-")) {
        fail(id + " does not belong to candidate family " + family.id);
      }

      const classification = text(
        target.classification,
        id + ".classification",
      );
      const premises = strings(target.premises, id + ".premises");
      const exclusions = strings(target.exclusions, id + ".exclusions");
      const lean4 = strings(target.lean4, id + ".lean4");
      const rocq = strings(target.rocq, id + ".rocq");
      const evidenceRef = evidenceByTarget.get(id);
      if (evidenceRef === undefined) {
        fail("missing candidate evidence package for " + id);
      }
      const evidence = evidenceRef.value;
      const evidenceStatus = text(
        evidence.status,
        evidenceRef.path + ".status",
      );

      if (Array.isArray(evidence.targets)) {
        const evidenceTarget = evidence.targets
          .map((value: unknown, targetIndex: number) =>
            object(
              value,
              evidenceRef.path + ".targets[" + targetIndex + "]",
            ),
          )
          .find((value: JsonObject) => value.id === id);
        if (evidenceTarget === undefined) {
          fail("candidate evidence target missing " + id);
        }
        if (
          text(
            evidenceTarget.classification,
            evidenceRef.path + ":" + id + ".classification",
          ) !== classification
        ) {
          fail("candidate classification mismatch for " + id);
        }
      } else if (evidence.id === id && evidenceStatus !== classification) {
        fail("candidate evidence status mismatch for " + id);
      }

      let exactHead: string | null = null;
      let ciRun: number | null = null;
      if (evidence.externalCrossCheck !== undefined) {
        const cross = object(
          evidence.externalCrossCheck,
          evidenceRef.path + ".externalCrossCheck",
        );
        if (typeof cross.exactHead === "string") exactHead = cross.exactHead;
        if (typeof cross.ciRun === "number") ciRun = cross.ciRun;
      }
      if (exactHead === null && typeof evidence.exactHead === "string") {
        exactHead = evidence.exactHead;
      }

      result.push(Object.freeze({
        id,
        family: family.id,
        projectionStatus: projectionStatus(classification, premises),
        classification,
        premises: Object.freeze(premises),
        exclusions: Object.freeze(exclusions),
        lean4: Object.freeze(lean4),
        rocq: Object.freeze(rocq),
        authority: "external-cross-check-only",
        ownerIssue,
        assurancePath: family.assurancePath,
        evidencePath: evidenceRef.path,
        evidenceStatus,
        exactHead,
        ciRun,
        sourcePaths: Object.freeze(sourcePaths(evidence)),
      }));
    }
  }

  return Object.freeze(result) as unknown as V015CandidateProofProjection[];
}
