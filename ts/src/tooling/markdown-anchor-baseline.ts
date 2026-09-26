import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { listMarkdownAnchorIds } from "./markdown-section-adapter.js";

export const STABLE_ANCHOR_BASELINE_PATH = "traceability/markdown-stable-anchor-baseline.json";

export interface StableAnchorBaseline {
  readonly schema: "mts-markdown-stable-anchor-baseline/v0.1";
  readonly purpose: string;
  readonly capturedMain: string;
  readonly sourceContract: string;
  readonly allowAdditionalAnchors: true;
  readonly migrationPolicy: string;
  readonly anchorsByDocument: Readonly<Record<string, readonly string[]>>;
}

export type StableAnchorBaselineIssueCode =
  | "surface-mismatch"
  | "missing-document"
  | "invalid-document-anchors"
  | "missing-baseline-anchor";

export interface StableAnchorBaselineIssue {
  readonly code: StableAnchorBaselineIssueCode;
  readonly path?: string;
  readonly anchorId?: string;
  readonly message: string;
}

type JsonRecord = Record<string, unknown>;

function fail(message: string): never {
  throw new Error(`markdown-anchor-baseline: ${message}`);
}

function record(value: unknown, source: string): JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(`${source} must be an object`);
  }
  return value as JsonRecord;
}

function text(value: unknown, source: string): string {
  if (typeof value !== "string" || value.length === 0) fail(`${source} must be a non-empty string`);
  return value;
}

function stableId(value: unknown, source: string): string {
  const id = text(value, source);
  if (!/^[A-Za-z][A-Za-z0-9._-]*$/.test(id)) fail(`${source} is not a stable ASCII anchor ID: ${id}`);
  return id;
}

export function validateStableAnchorBaseline(value: unknown): StableAnchorBaseline {
  const root = record(value, "baseline");
  if (root.schema !== "mts-markdown-stable-anchor-baseline/v0.1") fail("unexpected schema");
  if (root.allowAdditionalAnchors !== true) fail("allowAdditionalAnchors must remain true");

  const anchorsRaw = record(root.anchorsByDocument, "baseline.anchorsByDocument");
  const anchorsByDocument: Record<string, readonly string[]> = {};
  const globalOwners = new Map<string, string>();
  for (const [path, raw] of Object.entries(anchorsRaw).sort(([a], [b]) => a.localeCompare(b))) {
    if (!Array.isArray(raw)) fail(`${path}: baseline anchors must be an array`);
    const ids = raw.map((item, index) => stableId(item, `${path}[${index}]`));
    if (new Set(ids).size !== ids.length) fail(`${path}: baseline contains duplicate anchor IDs`);
    for (const id of ids) {
      const previous = globalOwners.get(id);
      if (previous !== undefined && previous !== path) {
        fail(`baseline anchor ${id} is owned by both ${previous} and ${path}`);
      }
      globalOwners.set(id, path);
    }
    anchorsByDocument[path] = Object.freeze(ids);
  }

  return Object.freeze({
    schema: "mts-markdown-stable-anchor-baseline/v0.1",
    purpose: text(root.purpose, "baseline.purpose"),
    capturedMain: text(root.capturedMain, "baseline.capturedMain"),
    sourceContract: text(root.sourceContract, "baseline.sourceContract"),
    allowAdditionalAnchors: true,
    migrationPolicy: text(root.migrationPolicy, "baseline.migrationPolicy"),
    anchorsByDocument: Object.freeze(anchorsByDocument),
  });
}

export function loadStableAnchorBaseline(root: string): StableAnchorBaseline {
  const path = resolve(root, STABLE_ANCHOR_BASELINE_PATH);
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    fail(`cannot read ${STABLE_ANCHOR_BASELINE_PATH}: ${(error as Error).message}`);
  }
  return validateStableAnchorBaseline(parsed);
}

export function auditStableAnchorDocuments(
  baseline: StableAnchorBaseline,
  registeredPaths: readonly string[],
  documents: Readonly<Record<string, string>>,
): readonly StableAnchorBaselineIssue[] {
  const issues: StableAnchorBaselineIssue[] = [];
  const expectedPaths = Object.keys(baseline.anchorsByDocument).sort();
  const actualPaths = [...new Set(registeredPaths)].sort();
  if (
    expectedPaths.length !== actualPaths.length ||
    expectedPaths.some((path, index) => path !== actualPaths[index])
  ) {
    issues.push(Object.freeze({
      code: "surface-mismatch" as const,
      message: `baseline document surface differs; expected=[${expectedPaths.join(", ")}] actual=[${actualPaths.join(", ")}]`,
    }));
  }

  for (const path of expectedPaths) {
    const source = documents[path];
    if (source === undefined) {
      issues.push(Object.freeze({
        code: "missing-document" as const,
        path,
        message: `baseline document is missing: ${path}`,
      }));
      continue;
    }

    let current: readonly string[];
    try {
      current = listMarkdownAnchorIds(source);
    } catch (error) {
      issues.push(Object.freeze({
        code: "invalid-document-anchors" as const,
        path,
        message: `${path}: ${(error as Error).message}`,
      }));
      continue;
    }

    const currentSet = new Set(current);
    for (const anchorId of baseline.anchorsByDocument[path] ?? []) {
      if (currentSet.has(anchorId)) continue;
      issues.push(Object.freeze({
        code: "missing-baseline-anchor" as const,
        path,
        anchorId,
        message: `${path}: baseline anchor disappeared or moved: ${anchorId}`,
      }));
    }
  }

  return Object.freeze(issues);
}

export function auditRepositoryStableAnchors(root: string): readonly StableAnchorBaselineIssue[] {
  const baseline = loadStableAnchorBaseline(root);
  const registryPath = resolve(root, "requirements/mts-v0.13.json");
  const registry = record(JSON.parse(readFileSync(registryPath, "utf8")), "requirements/mts-v0.13.json");
  const surface = record(registry.documentSurface, "requirements/mts-v0.13.json.documentSurface");
  const registeredPaths = Object.keys(surface);

  const documents: Record<string, string> = {};
  for (const path of Object.keys(baseline.anchorsByDocument)) {
    const fullPath = resolve(root, path);
    if (!existsSync(fullPath)) continue;
    documents[path] = readFileSync(fullPath, "utf8");
  }
  return auditStableAnchorDocuments(baseline, registeredPaths, documents);
}
