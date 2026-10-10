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

export interface MtsSourceRequirement {
  id: string;
  schema: "mts-source-requirement/v0.1";
  kind: string;
  versionScope: string;
  modelStatus: "proposed";
  semanticChange: false;
  statement: MtsSourceStatement;
  clarification: MtsSourceText;
  normativeOrigin: {
    release: string;
    source: string;
    recordId: string;
    english: string;
    englishSha256: string;
  };
  scientificBoundary: Readonly<Record<string, MtsSourceBoundary>>;
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
  const base = parseSourceText(raw, label);
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
      "normative_origin",
      "scientific_boundary",
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
  const normativeOrigin = parseNormativeOrigin(raw.normative_origin, root);
  const scientificBoundary = parseScientificBoundary(raw.scientific_boundary);
  const artifacts = parseArtifacts(raw.artifacts, root);
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
    normativeOrigin,
    scientificBoundary,
    artifacts,
  });
}

export function loadMtsSourceRequirement(root: string, path: string): MtsSourceRequirement {
  return parseMtsSourceRequirementText(root, path, readFileSync(resolve(root, path), "utf8"));
}

export function renderMtsSourceRequirementReaderFragment(model: MtsSourceRequirement): string {
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
    "normative_origin=" + model.normativeOrigin.source + "#/requiredSemanticLaws/" + model.normativeOrigin.recordId,
    "normative_english_sha256=" + model.normativeOrigin.englishSha256,
    "source=" + model.statement.source.path + "#" + model.statement.source.anchor,
    "source_blob_sha=" + model.statement.source.blobSha,
  ].join("\n");
}
