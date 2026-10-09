import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildMarkdownCoverageAudit } from "./markdown-coverage-audit.js";
import { findRepositoryRoot } from "./docs-sync.js";
import { scanV015FormalLexicalSurface, scanV015MarkdownProse } from "./v015-markdown-prose-audit.js";

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

export const FORMAL_V015_ROLES = new Set([
  "FORMAL_V015_THEOREM_STATEMENT",
  "FORMAL_V015_NOTATION_SPECIMEN",
  "FORMAL_V015_SEMANTIC_METAMODEL",
] as const);
export const NON_FORMAL_V015_ROLES = new Set([
  "NON_FORMAL_FOUNDATION_EXPLANATORY_DIAGRAM",
  "NON_FORMAL_METALINGUISTIC_OPERATOR_MENTION",
  "NON_FORMAL_INHERITED_V014_MATHEMATICAL_NOTATION",
  "NON_FORMAL_GOVERNANCE_VOCABULARY",
  "NON_FORMAL_PROCESS_DIAGRAM",
  "NON_FORMAL_INHERITED_V014_RELATIONAL_METASCHEME",
  "NON_FORMAL_HISTORICAL_RELATIONAL_METASCHEME",
  "NON_FORMAL_HISTORICAL_PSEUDOCODE_MENTION",
  "NON_FORMAL_STRUCTURAL_GLYPH_LEGEND",
  "NON_FORMAL_HISTORICAL_EVIDENCE_FLAG",
  "NON_FORMAL_HISTORICAL_THEOREM_STATEMENT",
  "NON_FORMAL_PROOF_TOOLCHAIN_IDENTITY",
  "NON_FORMAL_THEOREM_EVIDENCE_COMMENTARY",
  "NON_FORMAL_ARCHITECTURE_DIAGRAM",
  "NON_FORMAL_RELEASE_STATUS",
  "NON_FORMAL_REPRESENTATION_META_NOTATION",
  "NON_FORMAL_HISTORICAL_EXECUTION_PROFILE_SKETCH",
  "NON_FORMAL_HISTORICAL_EXECUTION_PROFILE_STATUS",
  "NON_FORMAL_DERIVED_QUERY_METANOTATION",
  "NON_FORMAL_NORMATIVE_REQUIREMENT_PROSE",
  "NON_FORMAL_SEMANTIC_EXPLANATORY_PROSE",
  "NON_FORMAL_PRESENTATION_ASSET",
  "NON_FORMAL_ACCEPTED_SEMANTIC_METANOTATION",
  "NON_FORMAL_FORMAL_SYNTAX_LEGEND",
] as const);
export function isV015FormalRole(role: string): boolean {
  return (FORMAL_V015_ROLES as ReadonlySet<string>).has(role);
}
export function isV015NonFormalRole(role: string): boolean {
  return (NON_FORMAL_V015_ROLES as ReadonlySet<string>).has(role);
}

/**
 * Secondary Markdown censuses are independent discovery ledgers, not proof.
 * A status flip is never evidence: allow only explicit non-FORMAL adjudication
 * with a source-bound review record, or a FORMAL row linked to a verified native
 * candidate from the primary inventory. New unsupported FORMAL shapes fail closed.
 */
export function inspectV015SecondaryLedgerRow(
  ledger: "prose" | "lexical",
  entry: Obj,
  primaryCandidates: readonly Obj[],
  verifiedPrimary: readonly Obj[],
): Readonly<{ pending: boolean; defect?: string }> {
  const statusKey = ledger === "prose" ? "status" : "verification";
  const classification = entry.classification;
  const status = entry[statusKey];
  const label = ledger + ":" + String(entry.path) + ":" + String(entry.line);
  if (classification === "UNREVIEWED" && status === "NOT_VERIFIED")
    return { pending: true };
  if (typeof entry.path !== "string" || !Number.isInteger(entry.line) ||
      typeof entry.source !== "string" || typeof classification !== "string" ||
      typeof status !== "string")
    return { pending: true, defect: label + ": malformed secondary review row" };

  const role = classification;
  const sourceHash = createHash("sha256").update(entry.source, "utf8").digest("hex");
  const overlapping = primaryCandidates.filter((candidate) =>
    candidate.path === entry.path &&
    typeof candidate.startLine === "number" && typeof candidate.endLine === "number" &&
    candidate.startLine <= (entry.line as number) && candidate.endLine >= (entry.line as number));
  if (role === "MIXED_FORMAL_NON_FORMAL_SPANS") {
    const formalIds = Array.isArray(entry.primaryFormalCandidateIds)
      ? entry.primaryFormalCandidateIds : [];
    const nonFormalIds = Array.isArray(entry.primaryNonFormalCandidateIds)
      ? entry.primaryNonFormalCandidateIds : [];
    const review = entry.reviewBasis;
    const reference = entry.reviewReference;
    if (status !== "REVIEWED_MIXED_WITH_VERIFIED_FORMAL" ||
        formalIds.length === 0 || nonFormalIds.length === 0 ||
        formalIds.some((id) => typeof id !== "string") ||
        nonFormalIds.some((id) => typeof id !== "string") ||
        new Set(formalIds).size !== formalIds.length ||
        new Set(nonFormalIds).size !== nonFormalIds.length ||
        formalIds.some((id) => nonFormalIds.includes(id)) ||
        typeof review !== "string" || review.trim().length < 40 ||
        typeof reference !== "string" ||
        !/^https:\/\/github\.com\/netkeep80\/anum_docs\/(?:issues|pull)\/\d+#issuecomment-\d+$/.test(reference) ||
        entry.reviewSourceSha256 !== sourceHash) {
      return { pending: true, defect: label + ": mixed span review lacks exact source-bound FORMAL/NON_FORMAL evidence" };
    }
    const overlappingFormal = overlapping.filter((candidate) =>
      isV015FormalRole(String(candidate.role)));
    const overlappingNonFormal = overlapping.filter((candidate) =>
      isV015NonFormalRole(String(candidate.role)));
    const formalCoverage = overlappingFormal.length === formalIds.length &&
      overlappingFormal.every((candidate) =>
        formalIds.includes(String(candidate.id)) && verifiedPrimary.includes(candidate));
    const nonFormalCoverage = overlappingNonFormal.length === nonFormalIds.length &&
      overlappingNonFormal.every((candidate) =>
        nonFormalIds.includes(String(candidate.id)) &&
        candidate.denotation === "NOT_APPLICABLE_FORMAL_SOURCE");
    if (!formalCoverage || !nonFormalCoverage ||
        overlapping.length !== overlappingFormal.length + overlappingNonFormal.length) {
      return { pending: true, defect: label + ": mixed span review does not exactly cover verified FORMAL and reviewed NON_FORMAL primaries" };
    }
    return { pending: false };
  }
  if (isV015NonFormalRole(role)) {
    const review = entry.reviewBasis;
    const reference = entry.reviewReference;
    if (status !== "REVIEWED_NON_FORMAL" ||
        typeof review !== "string" || review.trim().length < 40 ||
        typeof reference !== "string" ||
        !/^https:\/\/github\.com\/netkeep80\/anum_docs\/(?:issues|pull)\/\d+#issuecomment-\d+$/.test(reference) ||
        entry.reviewSourceSha256 !== sourceHash) {
      return { pending: true, defect: label + ": non-FORMAL exclusion lacks pinned, traceable review" };
    }
    if (overlapping.some((candidate) => isV015FormalRole(String(candidate.role)))) {
      return { pending: true, defect: label + ": non-FORMAL exclusion overlaps native FORMAL candidate" };
    }
    return { pending: false };
  }
  if (isV015FormalRole(role)) {
    const ids = Array.isArray(entry.primaryCandidateIds)
      ? entry.primaryCandidateIds
      : typeof entry.primaryCandidateId === "string" ? [entry.primaryCandidateId] : [];
    if (ids.length === 0 || ids.some((id) => typeof id !== "string") ||
        new Set(ids).size !== ids.length) {
      return { pending: true, defect: label + ": FORMAL classification lacks exact primary candidate IDs" };
    }
    const linked = ids.map((id) => primaryCandidates.find((item) => item.id === id));
    const overlappingFormal = overlapping.filter((candidate) =>
      isV015FormalRole(String(candidate.role)));
    const overlappingNonFormal = overlapping.filter((candidate) =>
      isV015NonFormalRole(String(candidate.role)));
    const coversEveryFormal = overlappingFormal.length === linked.length &&
      overlappingFormal.every((candidate) => ids.includes(String(candidate.id)));
    const linkedValid = linked.every((candidate) => candidate !== undefined &&
      candidate.role === role && candidate.path === entry.path &&
      typeof candidate.startLine === "number" && typeof candidate.endLine === "number" &&
      candidate.startLine <= (entry.line as number) && candidate.endLine >= (entry.line as number) &&
      verifiedPrimary.includes(candidate));
    if (status !== "VERIFIED_AGAINST_ACCEPTED_V015" || !linkedValid ||
        !coversEveryFormal || overlappingNonFormal.length > 0 ||
        entry.reviewSourceSha256 !== sourceHash) {
      return { pending: true, defect: label +
        ": FORMAL line requires all overlapping native receipts and no mixed NON_FORMAL span" };
    }
    return { pending: false };
  }
  return { pending: true, defect: label + ": unsupported review classification/status (fail closed)" };
}

/**
 * Different semantic obligations apply to native source, theorem claims and
 * explanatory metatheory. These stages name evidence, NOT proof acceptance.
 */
export function v015RequiredEvidenceStages(role: string): readonly string[] {
  switch (role) {
    case "FORMAL_V015_NOTATION_SPECIMEN":
      return ["grammar", "denotation", "semanticLinks", "jsonParity"];
    case "FORMAL_V015_THEOREM_STATEMENT":
      return ["grammar", "denotation", "semanticLinks", "theoremMapping"];
    case "FORMAL_V015_SEMANTIC_METAMODEL":
      return ["metamodelMapping", "denotation", "semanticLinks"];
    default:
      throw new Error("unrecognized native FORMAL documentation role: " + role);
  }
}

const V015_EVIDENCE_RUNNERS = Object.freeze({
  "mts-v015-native-evidence/v0.1": Object.freeze({
    sourcePath: "ts/src/tooling/v015-native-evidence-verifier.ts",
    distPath: "ts/dist/src/tooling/v015-native-evidence-verifier.js",
  }),
  "mts-v015-root-basis-evidence/v0.1": Object.freeze({
    sourcePath: "ts/src/tooling/v015-root-basis-evidence-verifier.ts",
    distPath: "ts/dist/src/tooling/v015-root-basis-evidence-verifier.js",
  }),
  "mts-v015-semantic-metamodel-evidence/v0.1": Object.freeze({
    sourcePath: "ts/src/tooling/v015-semantic-metamodel-evidence-verifier.ts",
    distPath: "ts/dist/src/tooling/v015-semantic-metamodel-evidence-verifier.js",
  }),
  "mts-v015-theorem-statement-evidence/v0.1": Object.freeze({
    sourcePath: "ts/src/tooling/v015-theorem-statement-evidence-verifier.ts",
    distPath: "ts/dist/src/tooling/v015-theorem-statement-evidence-verifier.js",
  }),
} as const);

type V015EvidenceProfile = keyof typeof V015_EVIDENCE_RUNNERS;

function evidenceRunner(profile: unknown): Readonly<{ sourcePath: string; distPath: string }> | undefined {
  if (typeof profile !== "string" ||
      !Object.prototype.hasOwnProperty.call(V015_EVIDENCE_RUNNERS, profile)) return undefined;
  return V015_EVIDENCE_RUNNERS[profile as V015EvidenceProfile];
}

export interface V015DocumentationAcceptanceReport {
  readonly schema: "mts-v015-current-documentation-acceptance/v0.1";
  readonly acceptedRelease: boolean;
  readonly normative: Readonly<{ expected: number; projected: number }>;
  readonly theorems: Readonly<{ historical: number; formal: number; missing: readonly string[] }>;
  readonly formulas: Readonly<{ total: number; pending: number; reviewedNonFormal: number; verified: number }>;
  readonly prose: Readonly<{ files: number; observations: number; unreviewed: number }>;
  readonly lexical: Readonly<{ files: number; candidates: number; unreviewed: number }>;
  readonly blockers: readonly string[];
  readonly ready: boolean;
}

export interface V015CompletionSignals {
  readonly acceptedRelease: boolean;
  readonly normativeExpected: number;
  readonly normativeProjected: number;
  readonly historicalIds: readonly string[];
  readonly overlayIds: readonly string[];
  readonly verifiedFormalIds: readonly string[];
  readonly invalidOverlayIds: readonly string[];
  readonly pendingCount: number;
  readonly prosePendingCount: number;
  readonly lexicalPendingCount: number;
  readonly unexpectedFormulaCount: number;
  readonly evidenceDefects: readonly string[];
  readonly inventoryIntegrityIssues: readonly string[];
  readonly sourceClassificationIssues: readonly string[];
  readonly manifestState: string;
  readonly contract: string;
}

/** Shared strict verdict used by the live audit and future-state regression tests. */
export function evaluateV015DocumentationCompletion(facts: V015CompletionSignals): readonly string[] {
  const blockers: string[] = [];
  if (!facts.acceptedRelease || facts.contract !== "mts-contract/v0.15")
    blockers.push("accepted release authority mismatch");
  if (facts.normativeExpected !== 48 || facts.normativeProjected !== facts.normativeExpected)
    blockers.push("normative v0.15 requirements not fully projected");
  if (new Set(facts.overlayIds).size !== facts.overlayIds.length || facts.invalidOverlayIds.length > 0)
    blockers.push("invalid/duplicate FORMAL theorem overlays");
  if (facts.verifiedFormalIds.length !== facts.overlayIds.length)
    blockers.push("non-migrated or incomplete FORMAL theorem descriptors cannot satisfy coverage");
  const missing = facts.historicalIds.filter((id) => !facts.verifiedFormalIds.includes(id));
  if (missing.length > 0) blockers.push("missing FORMAL theorem projections: " + missing.join(", "));
  if (facts.pendingCount > 0) blockers.push("unverified current documentation formula candidates: " + facts.pendingCount);
  if (facts.prosePendingCount > 0) blockers.push("unreviewed plain Markdown formula candidates: " + facts.prosePendingCount);
  if (facts.lexicalPendingCount > 0) blockers.push("unreviewed full FORMAL-aware Markdown lexical candidates: " + facts.lexicalPendingCount);
  if (facts.unexpectedFormulaCount > 0) blockers.push("unreviewed/unrecognized formula classification: " + facts.unexpectedFormulaCount);
  if (facts.evidenceDefects.length > 0) blockers.push("FORMAL machine evidence incomplete: " + facts.evidenceDefects.join("; "));
  if (facts.inventoryIntegrityIssues.length > 0) blockers.push("stale/tampered formula inventory: " + facts.inventoryIntegrityIssues.join("; "));
  if (facts.sourceClassificationIssues.length > 0) blockers.push("FORMAL authority-classification mismatch: " + facts.sourceClassificationIssues.join("; "));
  if (facts.manifestState !== "COMPLETE_VERIFIED")
    blockers.push("final author-reviewed documentation migration manifest not COMPLETE_VERIFIED");
  return blockers;
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
  const allOverlayIds = overlay.map((entry) => field(entry, "id"));
  const migrated = overlay.filter((entry) =>
    entry.migrationStatus === "FORMAL_MIGRATED" &&
    typeof entry.formalStatement === "string" && entry.formalStatement.length > 0 &&
    typeof entry.formalSourcePath === "string" && entry.formalSourcePath.length > 0);
  const formalIds = migrated.map((entry) => field(entry, "id"));
  const formalSet = new Set(formalIds);
  const missing = historicalIds.filter((id) => !formalSet.has(id));
  const invalidOverlayIds = allOverlayIds.filter((id) => !historicalIds.includes(id));
  const inventory = read(root, "audits/v015-formula-candidate-inventory.json");
  const candidates = list(inventory.candidates, "formula candidates");
  const indexedFiles = list(inventory.files, "formula source files");
  const expectedSources = new Set([
    "README.md", "docs/CONTRIBUTING.md",
    "docs/theory/Основания МТС.md", "docs/theory/Система аксиом МТС.md",
    "docs/theory/Теоремы МТС.md", "docs/specs/Формальная нотация МТС.md",
    "docs/specs/Ачисла и сериализация.md",
    "docs/specs/Апамять и управление сетью связей.md",
    "docs/specs/Пучки связей.md", "docs/Словарь терминов МТС.md",
  ]);
  const indexedPaths = new Set<string>();
  const sourceLines = new Map<string, string[]>();
  const inventoryIntegrityIssues: string[] = [];
  for (const file of indexedFiles) {
    const path = field(file, "path");
    if (!expectedSources.has(path) || indexedPaths.has(path)) {
      inventoryIntegrityIssues.push("unexpected/duplicate source: " + path);
      continue;
    }
    indexedPaths.add(path);
    const source = readFileSync(resolve(root, path), "utf8");
    const gitBlobSha = createHash("sha1")
      .update("blob " + Buffer.byteLength(source, "utf8") + "\0")
      .update(source, "utf8").digest("hex");
    if (gitBlobSha !== field(file, "blobSha")) {
      inventoryIntegrityIssues.push("source SHA drift: " + path);
    }
    const lines = source.split(/\r?\n/);
    sourceLines.set(path, lines);
    if (lines.length !== file.lineCount) {
      inventoryIntegrityIssues.push("source line count drift: " + path);
    }
  }
  if (indexedPaths.size !== expectedSources.size) {
    inventoryIntegrityIssues.push("current documentation sources not exhaustively indexed");
  }
  const candidateIds = new Set<string>();
  for (const candidate of candidates) {
    const id = field(candidate, "id");
    const path = field(candidate, "path");
    const kind = field(candidate, "kind");
    const source = field(candidate, "source");
    const lines = sourceLines.get(path);
    const begin = candidate.startLine;
    const end = candidate.endLine;
    if (candidateIds.has(id)) inventoryIntegrityIssues.push("duplicate formula candidate ID: " + id);
    candidateIds.add(id);
    if (lines === undefined || !Number.isInteger(begin) || !Number.isInteger(end) ||
        (begin as number) < 1 || (end as number) < (begin as number)) {
      inventoryIntegrityIssues.push("invalid formula source coordinates: " + id);
      continue;
    }
    const excerpt = kind === "fence"
      ? lines.slice((begin as number) - 1, end as number).join("\n")
      : lines[(begin as number) - 1];
    if ((kind === "fence" && excerpt !== source) ||
        (kind === "inline-code" && (begin !== end || !excerpt?.includes("`" + source + "`"))) ||
        !["fence", "inline-code"].includes(kind)) {
      inventoryIntegrityIssues.push("formula source/line drift: " + id);
    }
  }
  // Rediscover the operator-bearing source surface independently from JSON.
  // Omitting an expression from the inventory cannot make acceptance green.
  const operatorBearing = /⟼|->|≡|∈|⇒|=|\{\}|\{[A-Za-zА-Яа-я, ]+\}|\bDen\(|\bJ\(/u;
  const discovered: Array<{
    path: string; kind: string; source: string; startLine: number; endLine: number;
  }> = [];
  for (const file of indexedFiles) {
    const path = field(file, "path");
    const lines = sourceLines.get(path);
    if (lines === undefined) continue;
    let insideFence = false;
    let firstLine = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const marker = line.match(/^\s*(\x60{3}|~~~)(\w*)/);
      if (marker !== null) {
        if (!insideFence) {
          insideFence = true;
          firstLine = i;
        } else {
          const source = lines.slice(firstLine + 1, i).join("\n");
          if (operatorBearing.test(source)) discovered.push({
            path, kind: "fence", source, startLine: firstLine + 2, endLine: i,
          });
          insideFence = false;
        }
        continue;
      }
      if (insideFence) continue;
      for (const match of line.matchAll(/\x60([^\x60\n]+)\x60/g)) {
        const source = match[1]!;
        if (operatorBearing.test(source)) discovered.push({
          path, kind: "inline-code", source, startLine: i + 1, endLine: i + 1,
        });
      }
    }
  }
  if (discovered.length !== candidates.length) {
    inventoryIntegrityIssues.push("unindexed source expressions: discovered=" +
      discovered.length + " declared=" + candidates.length);
  }
  const occurrenceKey = (entry: {
    path: unknown; kind: unknown; source: unknown; startLine: unknown; endLine: unknown;
  }): string => JSON.stringify([
    entry.path, entry.startLine, entry.endLine, entry.kind, entry.source,
  ]);
  const discoveredOccurrences = discovered.map(occurrenceKey).sort();
  const declaredOccurrences = candidates.map(occurrenceKey).sort();
  if (JSON.stringify(discoveredOccurrences) !== JSON.stringify(declaredOccurrences)) {
    inventoryIntegrityIssues.push("expression inventory occurrence-set mismatch");
  }
  if (new Set(declaredOccurrences).size !== declaredOccurrences.length) {
    inventoryIntegrityIssues.push("duplicate expression occurrence identity");
  }
  const reviewedNonFormal = candidates.filter((item) => isV015NonFormalRole(field(item, "role")) &&
    ["NOT_APPLICABLE_FORMAL_SOURCE", "NOT_APPLICABLE_PROCESS_DOCUMENTATION"].includes(field(item, "denotation")) &&
    typeof item.reviewBasis === "string" && item.reviewBasis.length > 0);
  const claimedVerified = candidates.filter((item) =>
    isV015FormalRole(field(item, "role")) &&
    item.denotation === "VERIFIED_AGAINST_ACCEPTED_V015");
  // Cross-check current FORMAL classification against independently stored
  // theorem source and the accepted generated reader surface. Source labels
  // cannot be reclassified as historical merely to evade denotation work.
  const sourceClassificationIssues: string[] = [];
  for (const entry of overlay) {
    const id = field(entry, "id");
    const statement = field(entry, "formalStatement");
    const matches = candidates.filter((candidate) =>
      candidate.path === "docs/theory/Теоремы МТС.md" &&
      candidate.kind === "fence" &&
      candidate.source === statement &&
      candidate.role === "FORMAL_V015_THEOREM_STATEMENT");
    if (matches.length !== 1) {
      sourceClassificationIssues.push("formal theorem overlay not tracked as FORMAL source: " + id);
    }
  }
  for (const candidate of candidates) {
    const source = field(candidate, "source");
    const path = field(candidate, "path");
    if (path === "docs/specs/Формальная нотация МТС.md" &&
        source.includes("A->B->C = (A->B)->C")) {
      if (field(candidate, "role") !== "NON_FORMAL_ACCEPTED_SEMANTIC_METANOTATION" ||
          candidate.sourceArtifact !== "ts/src/tooling/formal-notation-v015-markdown.ts") {
        sourceClassificationIssues.push(
          "accepted parsing/denotation metanotation lost generator-owned classification: " + path);
      }
      continue;
    }
    if ((path === "docs/specs/Формальная нотация МТС.md" &&
         source.includes("Rule = V -> (Antecedent -> ExactSequence(Image...))")) ||
        ((source === "A:{}" || source === "{ A }") &&
         ["docs/specs/Пучки связей.md",
          "docs/specs/Апамять и управление сетью связей.md",
          "docs/theory/Основания МТС.md"].includes(path))) {
      if (!isV015FormalRole(field(candidate, "role"))) {
        sourceClassificationIssues.push("current FORMAL example improperly exempted: " + path);
      }
    }
  }
  // A declarative VERIFIED flag is insufficient. Each future green claim
  // must reference source-bound, Git-SHA-pinned machine-checkable witnesses
  // for grammar, denotation, semantic Link identity, JSON parity and replay.
  // Partial native fixtures (B10/B20) are not complete attestations.
  const evidenceDefects: string[] = [];
  const verified: Obj[] = [];
  for (const item of claimedVerified) {
    const id = field(item, "id");
    const before = evidenceDefects.length;
    const evidence = item.semanticEvidence;
    if (evidence === null || typeof evidence !== "object" || Array.isArray(evidence)) {
      evidenceDefects.push(id + ": missing semanticEvidence");
      continue;
    }
    const proof = evidence as Obj;
    const role = field(item, "role");
    const version = proof.compilerVersion;
    const sourceDigest = proof.formalSourceSha256;
    if (typeof version !== "string" || version.length < 3 ||
        typeof sourceDigest !== "string" || !/^[0-9a-f]{64}$/.test(sourceDigest)) {
      evidenceDefects.push(id + ": missing compiler/version or source digest");
    } else {
      const computed = createHash("sha256").update(field(item, "source"), "utf8").digest("hex");
      if (computed !== sourceDigest) evidenceDefects.push(id + ": source digest mismatch");
    }
    // All source examples are pinned to the accepted version, not future grammar.
    if (proof.acceptedFormalVersion !== "v0.15") {
      evidenceDefects.push(id + ": evidence does not target accepted v0.15");
    }
    const stages = v015RequiredEvidenceStages(role);
    const applicability = proof.executionApplicability;
    if (applicability !== "APPLICABLE" && applicability !== "NOT_APPLICABLE") {
      evidenceDefects.push(id + ": execution applicability not classified");
    }
    const requiredStages = applicability === "APPLICABLE" ? [...stages, "amemoryReplay"] : stages;
    if (applicability === "NOT_APPLICABLE" &&
        (typeof proof.executionRationale !== "string" || proof.executionRationale.length < 20)) {
      evidenceDefects.push(id + ": missing no-replay rationale");
    }
    for (const stage of requiredStages) {
      const trace = proof[stage];
      if (trace === null || typeof trace !== "object" || Array.isArray(trace)) {
        evidenceDefects.push(id + ": missing " + stage + " machine witness");
        continue;
      }
      const attestation = trace as Obj;
      const path = attestation.path;
      const sha = attestation.gitBlobSha;
      const caseMarker = attestation.testCase;
      if (typeof path !== "string" || !/^(ts\/test\/v015-|proofs\/v015-)/.test(path) ||
          typeof sha !== "string" || !/^[0-9a-f]{40}$/.test(sha) ||
          typeof caseMarker !== "string" || caseMarker.length < 3) {
        evidenceDefects.push(id + ": malformed " + stage + " witness");
        continue;
      }
      try {
        const source = readFileSync(resolve(root, path), "utf8");
        const digest = createHash("sha1")
          .update("blob " + Buffer.byteLength(source, "utf8") + "\0")
          .update(source, "utf8").digest("hex");
        if (digest !== sha || !source.includes(caseMarker)) {
          evidenceDefects.push(id + ": witness changed or test case absent for " + stage);
        }
      } catch {
        evidenceDefects.push(id + ": unreadable witness for " + stage);
      }
    }
    // Source references alone do not prove the executable witness ran.
    // A future acceptance attestor must produce a replay-derived receipt.
    const receipt = proof.machineReceipt;
    if (receipt === null || typeof receipt !== "object" || Array.isArray(receipt)) {
      evidenceDefects.push(id + ": missing derived machineReceipt (source references alone are insufficient)");
    } else {
      const rr = receipt as Obj;
      const runnerProfile = evidenceRunner(rr.profile);
      if (runnerProfile === undefined ||
          rr.outcome !== "PASS" ||
          typeof rr.formalSourceSha256 !== "string" || rr.formalSourceSha256 !== sourceDigest ||
          typeof rr.semanticAnetSha256 !== "string" || !/^[0-9a-f]{64}$/.test(rr.semanticAnetSha256) ||
          typeof rr.runnerSourceSha256 !== "string" || !/^[0-9a-f]{64}$/.test(rr.runnerSourceSha256)) {
        evidenceDefects.push(id + ": incomplete/unknown machineReceipt semantic identity profile");
        continue;
      }
      // Recompute the receipt through the exact versioned verifier profile.
      // Adding another bounded adapter never changes an already pinned runner.
      const pinnedRunnerSource = resolve(root, runnerProfile.sourcePath);
      try {
        const trustedSource = readFileSync(pinnedRunnerSource, "utf8");
        const trustedSha = createHash("sha256").update(trustedSource, "utf8").digest("hex");
        if (trustedSha !== rr.runnerSourceSha256) {
          evidenceDefects.push(id + ": evidence verifier source differs from pinned revision");
          continue;
        }
      } catch {
        evidenceDefects.push(id + ": independently reviewed evidence verifier source unavailable");
        continue;
      }
      const runner = resolve(root, runnerProfile.distPath);
      const input = JSON.stringify({
        id, role, source: field(item, "source"), formalSourceSha256: sourceDigest,
        expectedSemanticAnetSha256: rr.semanticAnetSha256,
        stages: requiredStages,
      });
      const execution = spawnSync(process.execPath, [runner, "--verify-stdin"], {
        cwd: root, input, encoding: "utf8", timeout: 30000, maxBuffer: 4 * 1024 * 1024,
      });
      if (execution.error || execution.status !== 0) {
        evidenceDefects.push(id + ": native receipt verifier failed or unavailable (fail closed)");
      } else {
        try {
          const verifiedReceipt = record(JSON.parse(execution.stdout) as unknown, id + ".native-receipt");
          if (verifiedReceipt.profile !== rr.profile ||
              verifiedReceipt.outcome !== "PASS" ||
              verifiedReceipt.caseId !== id ||
              verifiedReceipt.formalSourceSha256 !== sourceDigest ||
              verifiedReceipt.semanticAnetSha256 !== rr.semanticAnetSha256 ||
              verifiedReceipt.runnerSourceSha256 !== rr.runnerSourceSha256) {
            evidenceDefects.push(id + ": native receipt output not equivalent to pinned expected evidence");
          }
        } catch {
          evidenceDefects.push(id + ": unreadable native receipt verifier output");
        }
      }
    }
    if (evidenceDefects.length === before) verified.push(item);
  }
  const pending = candidates.filter((item) =>
    field(item, "role") === "UNCLASSIFIED" ||
    field(item, "denotation") === "NOT_VERIFIED" ||
    isV015FormalRole(field(item, "role")) && !verified.includes(item));
  const other = candidates.length - pending.length - reviewedNonFormal.length - verified.length;
  // Broad second pass covers prose and Markdown tables outside fenced/inline code;
  // the current-doc universe is discovered from the repository, not a fixed list.
  const prose = scanV015MarkdownProse(root);
  const proseManifest = read(root, "audits/v015-markdown-prose-lexical-inventory.json");
  const indexedProse = list(proseManifest.observations, "prose observations");
  const proseFiles = list(proseManifest.files, "prose source files");
  const proseIntegrity: string[] = [...prose.unregistered.map((path) => "unregistered current Markdown file: " + path)];
  if (proseFiles.length !== prose.files.length || indexedProse.length !== prose.observations.length)
    proseIntegrity.push("prose Markdown reader scope or observation count drift");
  for (let i = 0; i < Math.min(proseFiles.length, prose.files.length); i++) {
    const expected = proseFiles[i]!;
    const actual = prose.files[i]!;
    if (expected.path !== actual.path || expected.blobSha !== actual.blobSha ||
        expected.lineCount !== actual.lineCount) proseIntegrity.push("prose source drift: " + actual.path);
  }
  for (let i = 0; i < Math.min(indexedProse.length, prose.observations.length); i++) {
    const expected = indexedProse[i]!;
    const actual = prose.observations[i]!;
    if (expected.path !== actual.path || expected.line !== actual.line || expected.source !== actual.source)
      proseIntegrity.push("prose occurrence drift: index " + i);
  }
  const proseReviews = indexedProse.map((entry) =>
    inspectV015SecondaryLedgerRow("prose", entry, candidates, verified));
  const prosePending = proseReviews.filter((review) => review.pending);
  for (const review of proseReviews) if (review.defect) sourceClassificationIssues.push(review.defect);
  if (proseIntegrity.length > 0) inventoryIntegrityIssues.push(...proseIntegrity);
  // Third, separate lexical pass: colon bindings, ExactSequence, ROOT aspects,
  // diagrams and table text. It is intentionally broader than the 202 legacy
  // operator-bearing spans and 21 ordinary-prose matches.
  const lexical = scanV015FormalLexicalSurface(root);
  const lexicalLedger = read(root, "audits/v015-formal-aware-markdown-census.json");
  const lexicalRows = list(lexicalLedger.candidates, "FORMAL lexical candidates");
  const lexicalFiles = list(lexicalLedger.files, "FORMAL lexical sources");
  const lexicalIssues: string[] = [...lexical.unregistered.map((path) => "unregistered Markdown source: " + path)];
  if (lexicalFiles.length !== lexical.files.length || lexicalRows.length !== lexical.observations.length)
    lexicalIssues.push("FORMAL-aware file universe or candidate count drift");
  for (let i = 0; i < Math.min(lexicalFiles.length, lexical.files.length); i++) {
    const actual = lexical.files[i]!;
    const pinned = lexicalFiles[i]!;
    if (pinned.path !== actual.path || pinned.blobSha !== actual.blobSha ||
        pinned.lineCount !== actual.lineCount) lexicalIssues.push("FORMAL-aware source blob drift: " + actual.path);
  }
  for (let i = 0; i < Math.min(lexicalRows.length, lexical.observations.length); i++) {
    const actual = lexical.observations[i]!;
    const pinned = lexicalRows[i]!;
    if (pinned.path !== actual.path || pinned.line !== actual.line ||
        pinned.source !== actual.source || pinned.context !== actual.context ||
        JSON.stringify(pinned.tokens) !== JSON.stringify(actual.tokens))
      lexicalIssues.push("FORMAL-aware lexical mismatch at index " + i);
  }
  const lexicalReviews = lexicalRows.map((entry) =>
    inspectV015SecondaryLedgerRow("lexical", entry, candidates, verified));
  const lexicalPending = lexicalReviews.filter((review) => review.pending);
  for (const review of lexicalReviews) if (review.defect) sourceClassificationIssues.push(review.defect);
  if (lexicalIssues.length > 0) inventoryIntegrityIssues.push(...lexicalIssues);
  const manifest = read(root, "audits/v015-current-documentation-migration.json");
  const blockers = evaluateV015DocumentationCompletion({
    acceptedRelease,
    normativeExpected,
    normativeProjected,
    historicalIds,
    overlayIds: allOverlayIds,
    verifiedFormalIds: formalIds,
    invalidOverlayIds,
    pendingCount: pending.length,
    prosePendingCount: prosePending.length,
    lexicalPendingCount: lexicalPending.length,
    unexpectedFormulaCount: other,
    evidenceDefects,
    inventoryIntegrityIssues,
    sourceClassificationIssues,
    manifestState: field(manifest, "state"),
    contract: coverage.contract,
  });
  return Object.freeze({
    schema: "mts-v015-current-documentation-acceptance/v0.1" as const,
    acceptedRelease,
    normative: Object.freeze({ expected: normativeExpected, projected: normativeProjected }),
    theorems: Object.freeze({ historical: historical.length, formal: formalIds.length, missing: Object.freeze(missing) }),
    formulas: Object.freeze({ total: candidates.length, pending: pending.length, reviewedNonFormal: reviewedNonFormal.length, verified: verified.length }),
    prose: Object.freeze({ files: prose.files.length, observations: prose.observations.length, unreviewed: prosePending.length }),
    lexical: Object.freeze({ files: lexical.files.length, candidates: lexical.observations.length, unreviewed: lexicalPending.length }),
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
