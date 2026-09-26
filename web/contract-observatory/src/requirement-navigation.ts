import type { ObservatoryRequirement, ObservatorySemanticIr } from "./semantic-ir-bridge.js";

export type RequirementNavigationEntry = ObservatoryRequirement & Readonly<{
  layer: string;
  dependents: readonly string[];
}>;

export interface RequirementVersionComparisonRow {
  readonly id: string;
  readonly state: "same" | "changed" | "added" | "removed";
  readonly currentDigest: string | null;
  readonly previousDigest: string | null;
}

export interface RequirementVersionComparison {
  readonly available: boolean;
  readonly previousContract: string | null;
  readonly reason: string | null;
  readonly rows: readonly RequirementVersionComparisonRow[];
}

export interface RequirementNavigationModel {
  readonly contract: string;
  readonly entries: readonly RequirementNavigationEntry[];
  readonly kinds: readonly string[];
  readonly statuses: readonly string[];
  readonly layers: readonly string[];
  readonly diagnostics: readonly string[];
  readonly versionComparison: RequirementVersionComparison;
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values)].sort((left, right) => left.localeCompare(right)));
}

function comparable(requirement: ObservatoryRequirement): string {
  return JSON.stringify({
    kind: requirement.kind,
    status: requirement.status,
    classificationPath: requirement.classificationPath,
    dependsOn: [...requirement.dependsOn].sort((left, right) => left.localeCompare(right)),
    statementDigest: requirement.statementDigest,
    authorityDocument: requirement.authorityDocument,
    authorityPointer: requirement.authorityPointer,
    traceabilityPath: requirement.traceabilityPath,
    docPath: requirement.docPath,
    docAnchor: requirement.docAnchor,
  });
}

function buildVersionComparison(
  current: ObservatorySemanticIr,
  previous?: ObservatorySemanticIr,
): RequirementVersionComparison {
  if (previous === undefined) {
    return Object.freeze({
      available: false,
      previousContract: null,
      reason: "предыдущая версия не имеет compiler-supported requirement registry",
      rows: Object.freeze([]),
    });
  }

  const currentById = new Map(current.requirements.map((item) => [item.id, item] as const));
  const previousById = new Map(previous.requirements.map((item) => [item.id, item] as const));
  const ids = uniqueSorted([...currentById.keys(), ...previousById.keys()]);
  const rows = ids.map((id) => {
    const currentRequirement = currentById.get(id);
    const previousRequirement = previousById.get(id);
    const state: RequirementVersionComparisonRow["state"] =
      currentRequirement === undefined ? "removed" :
      previousRequirement === undefined ? "added" :
      comparable(currentRequirement) === comparable(previousRequirement) ? "same" : "changed";
    return Object.freeze({
      id,
      state,
      currentDigest: currentRequirement?.statementDigest ?? null,
      previousDigest: previousRequirement?.statementDigest ?? null,
    });
  });

  return Object.freeze({
    available: true,
    previousContract: previous.contract,
    reason: null,
    rows: Object.freeze(rows),
  });
}

export function buildRequirementNavigationModel(
  ir: ObservatorySemanticIr,
  previousIr?: ObservatorySemanticIr,
): RequirementNavigationModel {
  const ids = new Set(ir.requirements.map((item) => item.id));
  const dependents = new Map<string, string[]>(ir.requirements.map((item) => [item.id, []]));
  const diagnostics: string[] = [];

  for (const requirement of ir.requirements) {
    const layer = requirement.classificationPath.split("/")[0]?.trim() ?? "";
    if (layer.length === 0) diagnostics.push(`${requirement.id}: missing top-level classification layer`);
    for (const dependency of requirement.dependsOn) {
      if (!ids.has(dependency)) {
        diagnostics.push(`${requirement.id}: unresolved dependency ${dependency}`);
        continue;
      }
      dependents.get(dependency)?.push(requirement.id);
    }
  }

  const entries = [...ir.requirements]
    .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))
    .map((requirement) => Object.freeze({
      ...requirement,
      layer: requirement.classificationPath.split("/")[0] ?? "",
      dependents: uniqueSorted(dependents.get(requirement.id) ?? []),
    }));

  return Object.freeze({
    contract: ir.contract,
    entries: Object.freeze(entries),
    kinds: uniqueSorted(entries.map((item) => item.kind)),
    statuses: uniqueSorted(entries.map((item) => item.status)),
    layers: uniqueSorted(entries.map((item) => item.layer)),
    diagnostics: Object.freeze(diagnostics),
    versionComparison: buildVersionComparison(ir, previousIr),
  });
}
