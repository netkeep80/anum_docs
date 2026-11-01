import { existsSync, readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { MarkdownStructureOptions } from "../../../vendor/repo-guard/dist/projection-api.mjs";

// Generic Markdown structure and projection belong to immutable RepoGuard 5.0.0.
// Only MTS-owned marker configuration and repository surface selection stay here.
export const REPO_GUARD_VERSION = "5.0.0";
export const REPO_GUARD_SHA = "682ac7d759873bec585d6096e4fa364ab6faef02";

export type MarkdownDocumentMode = "source" | "hybrid" | "generated";
export interface MarkdownHeading { readonly level: number; readonly title: string; }
export interface MarkdownAddress {
  readonly anchorId: string; readonly line: number; readonly offset: number;
  readonly headingPath: readonly MarkdownHeading[];
}
export interface MarkdownOwnedBlock {
  readonly blockId: string; readonly start: number; readonly end: number;
  readonly content: string;
}
export interface MarkdownNode {
  readonly anchorId: string; readonly anchorLine: number; readonly headingLine: number;
  readonly heading: MarkdownHeading; readonly headingPath: readonly MarkdownHeading[];
  readonly start: number; readonly end: number; readonly subtree: string;
}
export interface MarkdownSection {
  readonly diagnosticLine: number; readonly heading: MarkdownHeading;
  readonly headingPath: readonly MarkdownHeading[]; readonly anchorId: string | null;
  readonly start: number; readonly end: number; readonly content: string;
}

function fail(message: string): never {
  throw new Error(`markdown-section-adapter: ${message}`);
}
function assertSafeId(id: string, label: string): void {
  if (!/^[A-Za-z][A-Za-z0-9._-]*$/.test(id)) fail(`${label} must be a stable ASCII identifier: ${id}`);
}
function beginMarker(id: string): string { return `<!-- мтс:требование:${id}:начало -->`; }
function endMarker(id: string): string { return `<!-- мтс:требование:${id}:конец -->`; }
function blockSpec(id: string) {
  assertSafeId(id, "blockId");
  return { blockId: id, beginMarker: beginMarker(id), endMarker: endMarker(id) };
}

function findRepositoryRoot(): string {
  let at = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 9; i++) {
    if (existsSync(resolve(at, "repo-policy.json")) &&
        existsSync(resolve(at, ".gitmodules"))) return at;
    const next = dirname(at);
    if (next === at) break;
    at = next;
  }
  return fail("cannot locate pinned repository root");
}

const repositoryRoot = findRepositoryRoot();
const upstreamRoot = resolve(repositoryRoot, "vendor/repo-guard");
const upstreamEntrypoint = resolve(upstreamRoot, "dist/projection-api.mjs");
if (!existsSync(upstreamEntrypoint)) {
  fail("RepoGuard v5.0.0 gitlink is not checked out; run git submodule update --init");
}
const git = spawnSync("git", ["-C", upstreamRoot, "rev-parse", "HEAD"], {
  encoding: "utf8", timeout: 10000,
});
if (git.status !== 0 || git.stdout.trim() !== REPO_GUARD_SHA) {
  fail(`RepoGuard pin mismatch: expected ${REPO_GUARD_SHA}, observed ${git.stdout?.trim() ?? "unknown"}`);
}
const upstreamManifest = JSON.parse(readFileSync(resolve(upstreamRoot, "package.json"), "utf8")) as { version?: string };
if (upstreamManifest.version !== REPO_GUARD_VERSION) {
  fail(`RepoGuard package version must be ${REPO_GUARD_VERSION}`);
}
const upstream: typeof import("../../../vendor/repo-guard/dist/projection-api.mjs") =
  await import(pathToFileURL(upstreamEntrypoint).href);

function heading(value: { level: number; text: string }): MarkdownHeading {
  return Object.freeze({ level: value.level, title: value.text });
}
function headingPath(values: readonly { level: number; text: string }[]): readonly MarkdownHeading[] {
  return Object.freeze(values.map(heading));
}
function options(source: string): MarkdownStructureOptions {
  return { transparentOwnedBlocks: listOwnedMarkdownBlockIds(source).map(blockSpec) };
}

export function listMarkdownAnchorIds(source: string): readonly string[] {
  return Object.freeze(upstream.listMarkdownAnchorIds(source));
}
export function resolveMarkdownAnchor(source: string, anchorId: string): MarkdownAddress {
  const address = upstream.resolveMarkdownAnchor(source, anchorId);
  return Object.freeze({ ...address, headingPath: headingPath(address.headingPath) });
}
function node(value: ReturnType<typeof upstream.readMarkdownNode>): MarkdownNode {
  return Object.freeze({
    ...value, heading: heading(value.heading), headingPath: headingPath(value.headingPath),
  });
}
export function readMarkdownNode(source: string, anchorId: string): MarkdownNode {
  return node(upstream.readMarkdownNode(source, anchorId, options(source)));
}
export function listMarkdownChildren(source: string, parentAnchorId: string): readonly MarkdownNode[] {
  return Object.freeze(upstream.listMarkdownChildren(source, parentAnchorId, options(source)).map(node));
}
export function listMarkdownSections(source: string): readonly MarkdownSection[] {
  return Object.freeze(upstream.listMarkdownSections(source, options(source)).map(value => Object.freeze({
    ...value, heading: heading(value.heading), headingPath: headingPath(value.headingPath),
  })));
}

// MTS names of owned blocks are domain-owned, not a generic RepoGuard concept.
// Enumerate only our explicit marker vocabulary; all structure/byte operations
// below delegate to RepoGuard's generic public API.
export function listOwnedMarkdownBlockIds(source: string): readonly string[] {
  const marker = /^<!--\s*мтс:требование:([^:]+):(начало|конец)\s*-->$/;
  const ids = new Set<string>();
  let fenced = false;
  for (const line of source.split("\n")) {
    const text = line.replace(/\r$/, "").trim();
    const fence = /^(?:```|~~~)/.test(text);
    if (!fenced && !fence) {
      const match = marker.exec(text);
      if (match !== null) { assertSafeId(match[1]!, "owned block id"); ids.add(match[1]!); }
    }
    if (fence) fenced = !fenced;
  }
  const sorted = [...ids].sort((a, b) => a.localeCompare(b));
  for (const id of sorted) readOwnedMarkdownBlock(source, id);
  return Object.freeze(sorted);
}
export function readOwnedMarkdownBlock(source: string, blockId: string): MarkdownOwnedBlock | null {
  const result = upstream.readOwnedMarkdownBlock(source, blockSpec(blockId));
  return result === null ? null : Object.freeze(result);
}
export function assertOutsideOwnedBlockUnchanged(before: string, after: string, blockId: string): void {
  const prev = readOwnedMarkdownBlock(before, blockId);
  const next = readOwnedMarkdownBlock(after, blockId);
  if (prev === null || next === null) fail(`${blockId}: outside-change comparison requires block in both versions`);
  if (before.slice(0, prev.start) + before.slice(prev.end) !==
      after.slice(0, next.start) + after.slice(next.end)) {
    fail(`${blockId}: bytes outside owned block changed`);
  }
}
export function replaceOwnedMarkdownSection(args: {
  readonly source: string; readonly mode: MarkdownDocumentMode;
  readonly anchorId: string; readonly blockId: string; readonly generatedContent: string;
}): string {
  const { source, mode, anchorId, blockId, generatedContent } = args;
  assertSafeId(anchorId, "anchorId");
  const result = upstream.replaceOwnedMarkdownBlock({
    source, mode, anchorId, block: blockSpec(blockId), generatedContent,
  });
  if (mode === "hybrid" && readOwnedMarkdownBlock(source, blockId) !== null) {
    assertOutsideOwnedBlockUnchanged(source, result, blockId);
  }
  return result;
}
export const normalizeProjectionModel = upstream.normalizeProjectionModel;

function walkMarkdown(directory: string, prefix: string): string[] {
  const result: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) result.push(...walkMarkdown(resolve(directory, entry.name), path));
    else if (entry.isFile() && entry.name.endsWith(".md")) result.push(path);
  }
  return result;
}
export function listRepositoryMarkdownSurface(root: string): readonly string[] {
  return Object.freeze(["README.md", "PORTFOLIO.md", ...walkMarkdown(resolve(root, "docs"), "docs")].sort());
}
