import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildMarkdownCoverageAudit } from "./markdown-coverage-audit.js";
import { findRepositoryRoot } from "./docs-sync.js";
import { scanV015MarkdownProse } from "./v015-markdown-prose-audit.js";

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
] as const);
export function isV015FormalRole(role: string): boolean {
  return (FORMAL_V015_ROLES as ReadonlySet<string>).has(role);
}
export function isV015NonFormalRole(role: string): boolean {
  return (NON_FORMAL_V015_ROLES as ReadonlySet<string>).has(role);
}

export interface V015DocumentationAcceptanceReport {
  readonly schema: "mts-v015-current-documentation-acceptance/v0.1";
  readonly acceptedRelease: boolean;
  readonly normative: Readonly<{ expected: number; projected: number }>;
  readonly theorems: Readonly<{ historical: number; formal: number; missing: readonly string[] }>;
  readonly formulas: Readonly<{ total: number; pending: number; reviewedNonFormal: number; verified: number }>;
  readonly prose: Readonly<{ files: number; observations: number; unreviewed: number }>;
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
  for (let i = 0; i < Math.min(discovered.length, candidates.length); i++) {
    const actual = discovered[i]!;
    const expected = candidates[i]!;
    if (actual.path !== expected.path || actual.kind !== expected.kind ||
        actual.source !== expected.source || actual.startLine !== expected.startLine ||
        actual.endLine !== expected.endLine) {
      inventoryIntegrityIssues.push("expression inventory mismatch at index " + i);
      break;
    }
  }
  const pending = candidates.filter((item) =>
    field(item, "role") === "UNCLASSIFIED" || field(item, "denotation") === "NOT_VERIFIED");
  const reviewedNonFormal = candidates.filter((item) => isV015NonFormalRole(field(item, "role")) &&
    field(item, "denotation") === "NOT_APPLICABLE_FORMAL_SOURCE" &&
    typeof item.reviewBasis === "string" && item.reviewBasis.length > 0 ||
    isV015NonFormalRole(field(item, "role")) &&
    field(item, "denotation") === "NOT_APPLICABLE_PROCESS_DOCUMENTATION" &&
    typeof item.reviewBasis === "string" && item.reviewBasis.length > 0);
  const verified = candidates.filter((item) =>
    isV015FormalRole(field(item, "role")) &&
    item.denotation === "VERIFIED_AGAINST_ACCEPTED_V015");
  const other = candidates.length - pending.length - reviewedNonFormal.length - verified.length;
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
    if ((path === "docs/specs/Формальная нотация МТС.md" &&
         (source.includes("A->B->C = (A->B)->C") ||
          source.includes("Rule = V -> (Antecedent -> ExactSequence(Image...))"))) ||
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
  for (const item of verified) {
    const id = field(item, "id");
    const evidence = item.semanticEvidence;
    if (evidence === null || typeof evidence !== "object" || Array.isArray(evidence)) {
      evidenceDefects.push(id + ": missing semanticEvidence");
      continue;
    }
    const proof = evidence as Obj;
    const version = proof.compilerVersion;
    const sourceDigest = proof.formalSourceSha256;
    if (typeof version !== "string" || version.length < 3 ||
        typeof sourceDigest !== "string" || !/^[0-9a-f]{64}$/.test(sourceDigest)) {
      evidenceDefects.push(id + ": missing compiler/version or source digest");
    } else {
      const sourceDigestComputed = createHash("sha256").update(field(item, "source"), "utf8").digest("hex");
      if (sourceDigestComputed !== sourceDigest) evidenceDefects.push(id + ": source digest mismatch");
    }
    for (const stage of ["grammar", "denotation", "semanticLinks", "jsonParity", "amemoryReplay"]) {
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
  }
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
  const prosePending = indexedProse.filter((entry) =>
    entry.classification === "UNREVIEWED" || entry.status === "NOT_VERIFIED");
  if (proseIntegrity.length > 0) inventoryIntegrityIssues.push(...proseIntegrity);
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
