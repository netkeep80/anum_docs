import { existsSync, readFileSync, statSync } from "node:fs";
import { relative, resolve, sep } from "node:path";

export const KNOWN_FOUNDATION_EVIDENCE_GAPS = Object.freeze(["A4", "A15", "F4", "F5"] as const);

type JsonObject = Record<string, unknown>;

export interface FoundationProvenanceIssue {
  readonly code:
    | "malformed-contract"
    | "scope-entry-mismatch"
    | "malformed-evidence"
    | "unknown-requirement-evidence"
    | "invalid-local-evidence"
    | "gap-baseline-drift";
  readonly clauseId?: string;
  readonly evidence?: string;
  readonly message: string;
}

export interface FoundationProvenanceSummary {
  readonly clauseCount: number;
  readonly directEvidenceClauseCount: number;
  readonly gapClauseIds: readonly string[];
  readonly issues: readonly FoundationProvenanceIssue[];
}

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function issue(
  code: FoundationProvenanceIssue["code"],
  message: string,
  clauseId?: string,
  evidence?: string,
): FoundationProvenanceIssue {
  return Object.freeze({
    code,
    message,
    ...(clauseId === undefined ? {} : { clauseId }),
    ...(evidence === undefined ? {} : { evidence }),
  });
}

export function validateFoundationProvenance(args: {
  readonly scope: readonly string[];
  readonly entries: Readonly<Record<string, unknown>>;
  readonly requirementIds: ReadonlySet<string>;
  readonly localEvidenceExists: (path: string) => boolean;
  readonly expectedGapClauseIds?: readonly string[];
}): FoundationProvenanceSummary {
  const expectedGaps = [...(args.expectedGapClauseIds ?? KNOWN_FOUNDATION_EVIDENCE_GAPS)];
  const issues: FoundationProvenanceIssue[] = [];
  const scope = [...args.scope];
  const uniqueScope = new Set(scope);
  if (uniqueScope.size !== scope.length || scope.some((id) => id.length === 0)) {
    issues.push(issue("malformed-contract", "foundation provenance scope must contain unique non-empty clause IDs"));
  }

  const entryIds = Object.keys(args.entries);
  const missingEntries = [...uniqueScope].filter((id) => !entryIds.includes(id)).sort();
  const extraEntries = entryIds.filter((id) => !uniqueScope.has(id)).sort();
  if (missingEntries.length > 0 || extraEntries.length > 0) {
    issues.push(issue(
      "scope-entry-mismatch",
      `foundation provenance scope/entry mismatch: missing=[${missingEntries.join(",")}] extra=[${extraEntries.join(",")}]`,
    ));
  }

  const gapIds: string[] = [];
  let directEvidenceClauseCount = 0;

  for (const clauseId of scope) {
    const entry = args.entries[clauseId];
    if (!isObject(entry)) continue;
    const evidence = entry.evidence;
    if (!Array.isArray(evidence) || evidence.some((item) => typeof item !== "string" || item.length === 0)) {
      issues.push(issue(
        "malformed-evidence",
        `${clauseId}: evidence must be an array of non-empty strings`,
        clauseId,
      ));
      continue;
    }

    if (evidence.length === 0) {
      gapIds.push(clauseId);
      continue;
    }
    directEvidenceClauseCount += 1;

    for (const ref of evidence as string[]) {
      if (/^L[0-9]+$/.test(ref)) {
        if (!args.requirementIds.has(ref)) {
          issues.push(issue(
            "unknown-requirement-evidence",
            `${clauseId}: unknown requirement evidence ${ref}`,
            clauseId,
            ref,
          ));
        }
        continue;
      }
      if (!args.localEvidenceExists(ref)) {
        issues.push(issue(
          "invalid-local-evidence",
          `${clauseId}: local evidence does not resolve: ${ref}`,
          clauseId,
          ref,
        ));
      }
    }
  }

  const expectedGapSet = new Set(expectedGaps);
  const actualGapSet = new Set(gapIds);
  if (
    actualGapSet.size !== expectedGapSet.size ||
    [...actualGapSet].some((id) => !expectedGapSet.has(id))
  ) {
    issues.push(issue(
      "gap-baseline-drift",
      `foundation direct-evidence gap set drifted: expected=[${expectedGaps.join(",")}] actual=[${gapIds.join(",")}]`,
    ));
  }

  return Object.freeze({
    clauseCount: scope.length,
    directEvidenceClauseCount,
    gapClauseIds: Object.freeze([...gapIds]),
    issues: Object.freeze(issues),
  });
}

function parseJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

export function auditRepositoryFoundationProvenance(root: string): FoundationProvenanceSummary {
  const repositoryRoot = resolve(root);
  const contractPath = resolve(repositoryRoot, "contracts/mts-contract-v0.13.json");
  const requirementsPath = resolve(repositoryRoot, "requirements/mts-v0.13.json");
  const contract = parseJson(contractPath);
  const requirements = parseJson(requirementsPath);

  if (!isObject(contract) || !isObject(requirements)) {
    return Object.freeze({
      clauseCount: 0,
      directEvidenceClauseCount: 0,
      gapClauseIds: Object.freeze([]),
      issues: Object.freeze([issue("malformed-contract", "contract and requirement registry must be JSON objects")]),
    });
  }

  const audit = contract.inheritedFoundationDeltaAudit;
  if (!isObject(audit) || !isObject(audit.baseline) || !isObject(audit.entries) || !Array.isArray(audit.baseline.scope)) {
    return Object.freeze({
      clauseCount: 0,
      directEvidenceClauseCount: 0,
      gapClauseIds: Object.freeze([]),
      issues: Object.freeze([issue("malformed-contract", "inheritedFoundationDeltaAudit baseline/scope/entries are malformed")]),
    });
  }

  const scope = audit.baseline.scope;
  if (scope.some((value) => typeof value !== "string")) {
    return Object.freeze({
      clauseCount: scope.length,
      directEvidenceClauseCount: 0,
      gapClauseIds: Object.freeze([]),
      issues: Object.freeze([issue("malformed-contract", "foundation provenance scope must contain strings")]),
    });
  }

  const requirementItems = requirements.requirements;
  const requirementIds = new Set<string>();
  if (Array.isArray(requirementItems)) {
    for (const item of requirementItems) {
      if (isObject(item) && typeof item.id === "string") requirementIds.add(item.id);
    }
  }

  const localEvidenceExists = (path: string): boolean => {
    const fullPath = resolve(repositoryRoot, path);
    const relativePath = relative(repositoryRoot, fullPath);
    if (relativePath === ".." || relativePath.startsWith(`..${sep}`)) return false;
    return existsSync(fullPath) && statSync(fullPath).isFile();
  };

  return validateFoundationProvenance({
    scope: scope as string[],
    entries: audit.entries,
    requirementIds,
    localEvidenceExists,
  });
}
