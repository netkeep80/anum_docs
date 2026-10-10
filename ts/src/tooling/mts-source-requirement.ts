import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseDocument } from "yaml";

type JsonObject = Record<string, unknown>;

export type MtsSourceAuthorApproval = "not-recorded" | "approved";
export type MtsSourceRelation =
  | "requires"
  | "implements"
  | "verifies"
  | "documents"
  | "immutable";

export interface MtsSourceText {
  ru: string;
  sha256: string;
  sourceRole: string;
  authorApproval: MtsSourceAuthorApproval;
  authorDecision: {
    issue: number;
    comment: number;
  } | null;
}

export interface MtsSourceStatement extends MtsSourceText {
  source: {
    path: string;
    anchor: string;
    baselineCommit: string;
    blobSha: string;
  };
}

export interface MtsSourceBoundary {
  theorem: string;
  premises: readonly string[];
  domain: readonly string[];
}

export interface MtsSourceEditorialFinding {
  id: string;
  category: string;
  quote: string;
  diagnosisRu: string;
}

export interface MtsSourceEditorialReview {
  status: "blocked";
  authorApproval: "not-recorded";
  findings: readonly MtsSourceEditorialFinding[];
  proposedStatement: MtsSourceText;
}

export interface MtsReaderDefinition {
  id: string;
  kind: "definition" | "premise";
  domain: string;
  ru: string;
  prerequisites: readonly string[];
  proofSymbols: readonly string[];
  externalMetanotation: true;
  authorApproval: "not-recorded";
}

export interface MtsReaderDefinitions {
  reviewEvidence: { issue: number; comment: number };
  proofSources: readonly string[];
  entries: readonly MtsReaderDefinition[];
}

export interface MtsSourceRequirement {
  id: string;
  schema: "mts-source-requirement/v0.1";
  kind: string;
  versionScope: string;
  modelStatus: "proposed";
  semanticChange: false;
  statement: MtsSourceStatement;
  clarification: MtsSourceText;
  editorialReview: MtsSourceEditorialReview;
  normativeOrigin: {
    release: string;
    source: string;
    recordId: string;
    english: string;
    englishSha256: string;
  };
  scientificBoundary: Readonly<Record<string, MtsSourceBoundary>>;
  readerDefinitions: MtsReaderDefinitions | null;
  artifacts: readonly {
    path: string;
    relations: readonly MtsSourceRelation[];
  }[];
}

const RELATIONS = new Set<MtsSourceRelation>([
  "requires",
  "implements",
  "verifies",
  "documents",
  "immutable",
]);
const SHA256 = /^[0-9a-f]{64}$/;
const GIT_SHA1 = /^[0-9a-f]{40}$/;
const EXACT_COMMIT = /^[0-9a-f]{40}$/;

function fail(message: string): never {
  throw new Error("mts-source-requirement: " + message);
}

function object(value: unknown, label: string): JsonObject {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(label + " must be an object");
  }
  return value as JsonObject;
}

function exactFields(value: JsonObject, allowed: readonly string[], label: string): void {
  const accepted = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!accepted.has(key)) fail(label + ' has unknown field "' + key + '"');
  }
}

function string(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    fail(label + " must be a non-empty string");
  }
  return value;
}

function boolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") fail(label + " must be a boolean");
  return value;
}

function integer(value: unknown, label: string): number {
  if (!Number.isInteger(value) || (value as number) <= 0) {
    fail(label + " must be a positive integer");
  }
  return value as number;
}

function values(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) fail(label + " must be an array");
  return value;
}

function strings(value: unknown, label: string): string[] {
  return values(value, label).map((item, index) => string(item, label + "[" + index + "]"));
}

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function gitBlobSha(text: string): string {
  const bytes = Buffer.from(text, "utf8");
  return createHash("sha1")
    .update(Buffer.from("blob " + bytes.length + "\0", "utf8"))
    .update(bytes)
    .digest("hex");
}

function repositoryPath(value: unknown, label: string): string {
  const path = string(value, label);
  if (
    path.startsWith("/")
    || path.includes(String.fromCharCode(92))
    || path.split("/").some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    fail(label + " must be a normalized repository-relative path");
  }
  return path;
}

function digest(value: unknown, label: string): string {
  const result = string(value, label).toLowerCase();
  if (!SHA256.test(result)) fail(label + " must be a 64-hex sha256");
  return result;
}

function approval(value: unknown, label: string): MtsSourceAuthorApproval {
  const result = string(value, label);
  if (result !== "not-recorded" && result !== "approved") {
    fail(label + " must be not-recorded or approved");
  }
  return result;
}

function parseAuthorDecision(
  value: unknown,
  approvalState: MtsSourceAuthorApproval,
  label: string,
): { issue: number; comment: number } | null {
  if (approvalState === "not-recorded") {
    if (value !== undefined) fail(label + " must be absent while author_approval is not-recorded");
    return null;
  }
  const decision = object(value, label);
  exactFields(decision, ["issue", "comment"], label);
  return {
    issue: integer(decision.issue, label + ".issue"),
    comment: integer(decision.comment, label + ".comment"),
  };
}

function parseSourceText(value: unknown, label: string): MtsSourceText {
  const raw = object(value, label);
  exactFields(raw, ["ru", "sha256", "source_role", "author_approval", "author_decision"], label);
  const ru = string(raw.ru, label + ".ru");
  const expectedDigest = digest(raw.sha256, label + ".sha256");
  if (sha256(ru) !== expectedDigest) fail(label + ".sha256 does not match exact UTF-8 ru text");
  const authorApproval = approval(raw.author_approval, label + ".author_approval");
  return {
    ru,
    sha256: expectedDigest,
    sourceRole: string(raw.source_role, label + ".source_role"),
    authorApproval,
    authorDecision: parseAuthorDecision(raw.author_decision, authorApproval, label + ".author_decision"),
  };
}

function parseEditorialReview(
  value: unknown,
  statement: MtsSourceStatement,
): MtsSourceEditorialReview {
  const raw = object(value, "editorial_review");
  exactFields(raw, ["status", "author_approval", "findings", "proposed_statement"], "editorial_review");
  if (raw.status !== "blocked") {
    fail("editorial_review.status must remain blocked while findings are unresolved");
  }
  if (raw.author_approval !== "not-recorded") {
    fail("editorial_review.author_approval cannot be forged");
  }
  const entries = values(raw.findings, "editorial_review.findings");
  if (entries.length === 0) fail("editorial_review.findings must not be empty");
  const ids = new Set<string>();
  const findings = entries.map((value, index) => {
    const label = "editorial_review.findings[" + index + "]";
    const finding = object(value, label);
    exactFields(finding, ["id", "category", "quote", "diagnosis_ru"], label);
    const id = string(finding.id, label + ".id");
    if (!/^V14-L1-ED[0-9]{2}$/.test(id)) fail(label + ".id is invalid");
    if (ids.has(id)) fail(label + ".id is duplicated");
    ids.add(id);
    const quote = string(finding.quote, label + ".quote");
    if (countExact(statement.ru, quote) !== 1) {
      fail(label + ".quote must occur exactly once in frozen source statement");
    }
    return Object.freeze({
      id,
      category: string(finding.category, label + ".category"),
      quote,
      diagnosisRu: string(finding.diagnosis_ru, label + ".diagnosis_ru"),
    });
  });
  const proposedStatement = parseSourceText(
    raw.proposed_statement,
    "editorial_review.proposed_statement",
  );
  if (proposedStatement.sourceRole !== "editorial-proposal"
    || proposedStatement.authorApproval !== "not-recorded") {
    fail("editorial_review.proposed_statement must remain an unapproved editorial proposal");
  }
  if (proposedStatement.ru === statement.ru) {
    fail("editorial_review.proposed_statement must differ from source text");
  }
  return Object.freeze({
    status: "blocked" as const,
    authorApproval: "not-recorded" as const,
    findings: Object.freeze(findings),
    proposedStatement,
  });
}

function countExact(text: string, value: string): number {
  if (value.length === 0) return 0;
  let count = 0;
  let offset = 0;
  while (true) {
    const index = text.indexOf(value, offset);
    if (index < 0) return count;
    count += 1;
    offset = index + value.length;
  }
}

function parseStatement(value: unknown, root: string, label: string): MtsSourceStatement {
  const raw = object(value, label);
  exactFields(
    raw,
    ["ru", "sha256", "source_role", "author_approval", "author_decision", "source"],
    label,
  );
  const base = parseSourceText({
    ru: raw.ru,
    sha256: raw.sha256,
    source_role: raw.source_role,
    author_approval: raw.author_approval,
    author_decision: raw.author_decision,
  }, label);
  const source = object(raw.source, label + ".source");
  exactFields(source, ["path", "anchor", "baseline_commit", "blob_sha"], label + ".source");
  const path = repositoryPath(source.path, label + ".source.path");
  const absolute = resolve(root, path);
  if (!existsSync(absolute)) fail(label + ".source.path does not exist: " + path);
  const sourceText = readFileSync(absolute, "utf8");
  const anchor = string(source.anchor, label + ".source.anchor");
  if (!sourceText.includes('<a id="' + anchor + '"></a>')) {
    fail(label + ".source.anchor is absent from " + path);
  }
  if (countExact(sourceText, base.ru) !== 1) {
    fail(label + ".ru must occur exactly once in " + path);
  }
  const baselineCommit = string(source.baseline_commit, label + ".source.baseline_commit").toLowerCase();
  if (!EXACT_COMMIT.test(baselineCommit)) {
    fail(label + ".source.baseline_commit must be an exact 40-hex commit");
  }
  const blobSha = string(source.blob_sha, label + ".source.blob_sha").toLowerCase();
  if (!GIT_SHA1.test(blobSha)) fail(label + ".source.blob_sha must be a 40-hex Git blob SHA");
  const actualBlobSha = gitBlobSha(sourceText);
  if (actualBlobSha !== blobSha) {
    fail(label + ".source.blob_sha mismatch: expected " + blobSha + ", got " + actualBlobSha);
  }
  return {
    ...base,
    source: { path, anchor, baselineCommit, blobSha },
  };
}

function parseBoundary(value: unknown, label: string): MtsSourceBoundary {
  const raw = object(value, label);
  exactFields(raw, ["theorem", "premises", "domain"], label);
  const premises = strings(raw.premises, label + ".premises");
  const domain = raw.domain === undefined ? [] : strings(raw.domain, label + ".domain");
  return {
    theorem: string(raw.theorem, label + ".theorem"),
    premises: Object.freeze(premises),
    domain: Object.freeze(domain),
  };
}

function parseScientificBoundary(value: unknown): Readonly<Record<string, MtsSourceBoundary>> {
  const raw = object(value, "scientific_boundary");
  if (Object.keys(raw).length === 0) fail("scientific_boundary must not be empty");
  const result: Record<string, MtsSourceBoundary> = {};
  for (const [key, entry] of Object.entries(raw)) {
    if (!/^[a-z][a-z0-9_]*$/.test(key)) fail("scientific_boundary key is invalid: " + key);
    result[key] = parseBoundary(entry, "scientific_boundary." + key);
  }
  return Object.freeze(result);
}

function parseNormativeOrigin(value: unknown, root: string): MtsSourceRequirement["normativeOrigin"] {
  const raw = object(value, "normative_origin");
  exactFields(raw, ["release", "source", "record_id", "english", "english_sha256"], "normative_origin");
  const source = repositoryPath(raw.source, "normative_origin.source");
  const sourcePath = resolve(root, source);
  if (!existsSync(sourcePath)) fail("normative_origin.source does not exist: " + source);
  const recordId = string(raw.record_id, "normative_origin.record_id");
  const english = string(raw.english, "normative_origin.english");
  const englishSha256 = digest(raw.english_sha256, "normative_origin.english_sha256");
  if (sha256(english) !== englishSha256) {
    fail("normative_origin.english_sha256 does not match exact English text");
  }
  const contract = object(JSON.parse(readFileSync(sourcePath, "utf8")) as unknown, source);
  const laws = object(contract.requiredSemanticLaws, source + ".requiredSemanticLaws");
  if (laws[recordId] !== english) {
    fail("normative_origin.english differs from frozen " + source + "#/requiredSemanticLaws/" + recordId);
  }
  return {
    release: string(raw.release, "normative_origin.release"),
    source,
    recordId,
    english,
    englishSha256,
  };
}

function parseArtifacts(
  value: unknown,
  root: string,
): MtsSourceRequirement["artifacts"] {
  const rawArtifacts = values(value, "artifacts");
  if (rawArtifacts.length === 0) fail("artifacts must not be empty");
  const seen = new Set<string>();
  return Object.freeze(rawArtifacts.map((entry, index) => {
    const label = "artifacts[" + index + "]";
    const raw = object(entry, label);
    exactFields(raw, ["path", "relations", "role"], label);
    const path = repositoryPath(raw.path, label + ".path");
    if (seen.has(path)) fail(label + ".path duplicates " + path);
    seen.add(path);
    if (!existsSync(resolve(root, path))) fail(label + ".path does not exist: " + path);
    const relationValues = strings(raw.relations, label + ".relations");
    if (relationValues.length === 0) fail(label + ".relations must not be empty");
    const relationSet = new Set<MtsSourceRelation>();
    for (const relationValue of relationValues) {
      if (!RELATIONS.has(relationValue as MtsSourceRelation)) {
        fail(label + ".relations contains unknown relation " + relationValue);
      }
      const relation = relationValue as MtsSourceRelation;
      if (relationSet.has(relation)) fail(label + ".relations duplicates " + relation);
      relationSet.add(relation);
    }
    if (!relationSet.has("requires")) {
      fail(label + ".relations must explicitly include requires");
    }
    return Object.freeze({ path, relations: Object.freeze([...relationSet]) });
  }));
}

function parseReaderDefinitions(
  value: unknown,
  root: string,
  artifacts: MtsSourceRequirement["artifacts"],
): MtsReaderDefinitions {
  const raw = object(value, "reader_definitions");
  exactFields(raw, ["review_evidence", "proof_sources", "entries"], "reader_definitions");
  const review = object(raw.review_evidence, "reader_definitions.review_evidence");
  exactFields(review, ["issue", "comment"], "reader_definitions.review_evidence");
  const reviewEvidence = {
    issue: integer(review.issue, "reader_definitions.review_evidence.issue"),
    comment: integer(review.comment, "reader_definitions.review_evidence.comment"),
  };
  const proofSources = strings(raw.proof_sources, "reader_definitions.proof_sources")
    .map((path, index) => repositoryPath(path, "reader_definitions.proof_sources[" + index + "]"));
  if (proofSources.length === 0 || new Set(proofSources).size !== proofSources.length) {
    fail("reader_definitions.proof_sources must be nonempty and unique");
  }
  const proofs = proofSources.map((path) => {
    if (!artifacts.some((a) => a.path === path && a.relations.includes("verifies"))) {
      fail("reader_definitions.proof_sources must reference a verified artifact: " + path);
    }
    return { path, text: readFileSync(resolve(root, path), "utf8") };
  });
  const ids = new Set<string>();
  const rawEntries = values(raw.entries, "reader_definitions.entries");
  if (rawEntries.length === 0) fail("reader_definitions.entries must not be empty");
  const entries = rawEntries.map((item, index) => {
    const label = "reader_definitions.entries[" + index + "]";
    const entry = object(item, label);
    exactFields(entry,
      ["id", "kind", "domain", "ru", "prerequisites", "proof_symbols", "external_metanotation", "author_approval"],
      label);
    const id = string(entry.id, label + ".id");
    const kind = string(entry.kind, label + ".kind");
    if ((kind !== "definition" && kind !== "premise") ||
        !/^reader-(def|premise)-[a-z0-9-]+$/.test(id) ||
        (kind === "definition" && !id.startsWith("reader-def-")) ||
        (kind === "premise" && !id.startsWith("reader-premise-"))) {
      fail(label + ".id/kind is invalid");
    }
    if (ids.has(id)) fail(label + ".id duplicates " + id);
    const prerequisites = strings(entry.prerequisites, label + ".prerequisites");
    if (new Set(prerequisites).size !== prerequisites.length ||
        prerequisites.some((dependency) => !ids.has(dependency))) {
      fail(label + ".prerequisites must be unique, declared earlier reader IDs");
    }
    const proofSymbols = strings(entry.proof_symbols, label + ".proof_symbols");
    if (proofSymbols.length === 0 || new Set(proofSymbols).size !== proofSymbols.length) {
      fail(label + ".proof_symbols must be nonempty and unique");
    }
    for (const symbol of proofSymbols) {
      if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(symbol)) fail(label + ".proof_symbols has invalid symbol");
      const pattern = new RegExp("(^|\\n)\\s*(?:theorem|def|inductive|structure|lemma|Theorem|Lemma|Definition|Inductive|Record)\\s+" + symbol + "\\b");
      for (const proof of proofs) {
        if (!pattern.test(proof.text)) fail(label + ".proof_symbols reference missing symbol " + symbol + " in " + proof.path);
      }
    }
    if (entry.external_metanotation !== true || entry.author_approval !== "not-recorded") {
      fail(label + " must remain external_metanotation=true and author_approval=not-recorded");
    }
    ids.add(id);
    return Object.freeze({
      id, kind: kind as "definition" | "premise",
      domain: string(entry.domain, label + ".domain"),
      ru: string(entry.ru, label + ".ru"),
      prerequisites: Object.freeze(prerequisites),
      proofSymbols: Object.freeze(proofSymbols),
      externalMetanotation: true as const,
      authorApproval: "not-recorded" as const,
    });
  });
  return Object.freeze({
    reviewEvidence: Object.freeze(reviewEvidence),
    proofSources: Object.freeze(proofSources),
    entries: Object.freeze(entries),
  });
}

function parseYaml(text: string, path: string): unknown {
  const document = parseDocument(text, {
    prettyErrors: true,
    strict: true,
    uniqueKeys: true,
  });
  if (document.errors.length > 0) {
    fail(path + " YAML parse error: " + document.errors.map((error) => error.message).join("; "));
  }
  if (document.warnings.length > 0) {
    fail(path + " YAML warning: " + document.warnings.map((warning) => warning.message).join("; "));
  }
  try {
    return document.toJS({ maxAliasCount: 0 }) as unknown;
  } catch (error) {
    fail(path + " YAML alias/shape rejection: " + (error instanceof Error ? error.message : String(error)));
  }
}

export function parseMtsSourceRequirementText(
  root: string,
  path: string,
  text: string,
): MtsSourceRequirement {
  const raw = object(parseYaml(text, path), path);
  exactFields(
    raw,
    [
      "id",
      "schema",
      "kind",
      "version_scope",
      "model_status",
      "semantic_change",
      "statement",
      "clarification",
      "editorial_review",
      "normative_origin",
      "scientific_boundary",
      "reader_definitions",
      "artifacts",
    ],
    path,
  );
  const id = string(raw.id, path + ".id");
  if (!/^MTS-[A-Z0-9-]+$/.test(id)) fail(path + ".id has invalid format");
  if (string(raw.schema, path + ".schema") !== "mts-source-requirement/v0.1") {
    fail(path + ".schema must be mts-source-requirement/v0.1");
  }
  if (string(raw.model_status, path + ".model_status") !== "proposed") {
    fail(path + ".model_status must remain proposed until explicit Author migration approval");
  }
  if (boolean(raw.semantic_change, path + ".semantic_change") !== false) {
    fail(path + ".semantic_change must be false in post-v0.15 publication source migration");
  }
  const statement = parseStatement(raw.statement, root, path + ".statement");
  const clarification = parseSourceText(raw.clarification, path + ".clarification");
  const editorialReview = parseEditorialReview(raw.editorial_review, statement);
  const normativeOrigin = parseNormativeOrigin(raw.normative_origin, root);
  const scientificBoundary = parseScientificBoundary(raw.scientific_boundary);
  const artifacts = parseArtifacts(raw.artifacts, root);
  const readerDefinitions = raw.reader_definitions === undefined
    ? null : parseReaderDefinitions(raw.reader_definitions, root, artifacts);
  if (!artifacts.some((artifact) => artifact.path === path)) {
    fail(path + " must own itself through artifacts");
  }

  return Object.freeze({
    id,
    schema: "mts-source-requirement/v0.1",
    kind: string(raw.kind, path + ".kind"),
    versionScope: string(raw.version_scope, path + ".version_scope"),
    modelStatus: "proposed",
    semanticChange: false,
    statement,
    clarification,
    editorialReview,
    normativeOrigin,
    scientificBoundary,
    readerDefinitions,
    artifacts,
  });
}

export function loadMtsSourceRequirement(root: string, path: string): MtsSourceRequirement {
  return parseMtsSourceRequirementText(root, path, readFileSync(resolve(root, path), "utf8"));
}

export function renderMtsSourceRequirementReaderFragment(model: MtsSourceRequirement): string {
  if (model.editorialReview.status === "blocked") {
    fail("reader publication blocked by unresolved editorial review: "
      + model.editorialReview.findings.map((item) => item.id).join(", "));
  }
  const q = String.fromCharCode(96);
  const proposalLabel =
    model.clarification.authorApproval === "approved"
      ? "**Утверждённое автором уточнение:**"
      : "**Редакционное уточнение — НЕ утверждено Автором:**";
  return [
    "### " + model.id,
    "",
    model.statement.ru,
    "",
    proposalLabel,
    "",
    model.clarification.ru,
    "",
    "**Доказательная граница:**",
    ...Object.entries(model.scientificBoundary).map(
      ([name, boundary]) =>
        "- " + name + ": " + q + boundary.theorem + q + "; premises: "
        + (boundary.premises.length === 0
          ? "—"
          : boundary.premises.map((item) => q + item + q).join(", "))
        + (boundary.domain.length === 0
          ? ""
          : "; domain: " + boundary.domain.map((item) => q + item + q).join(", ")),
    ),
  ].join("\n");
}

export function renderMtsSourceRequirementAuditFragment(model: MtsSourceRequirement): string {
  return [
    "id=" + model.id,
    "schema=" + model.schema,
    "model_status=" + model.modelStatus,
    "semantic_change=" + String(model.semanticChange),
    "statement_sha256=" + model.statement.sha256,
    "statement_author_approval=" + model.statement.authorApproval,
    "clarification_sha256=" + model.clarification.sha256,
    "clarification_author_approval=" + model.clarification.authorApproval,
    "reader_definitions_count=" + (model.readerDefinitions?.entries.length ?? 0),
    "reader_definitions_review=" + (model.readerDefinitions === null ? "none"
      : model.readerDefinitions.reviewEvidence.issue + "#" + model.readerDefinitions.reviewEvidence.comment),
    "editorial_review_status=" + model.editorialReview.status,
    "editorial_review_open_findings=" + model.editorialReview.findings.length,
    "editorial_review_ids=" + model.editorialReview.findings.map((item) => item.id).join(","),
    "proposed_statement_sha256=" + model.editorialReview.proposedStatement.sha256,
    "proposed_statement_author_approval=" + model.editorialReview.proposedStatement.authorApproval,
    "normative_origin=" + model.normativeOrigin.source + "#/requiredSemanticLaws/" + model.normativeOrigin.recordId,
    "normative_english_sha256=" + model.normativeOrigin.englishSha256,
    "source=" + model.statement.source.path + "#" + model.statement.source.anchor,
    "source_blob_sha=" + model.statement.source.blobSha,
  ].join("\n");
}
