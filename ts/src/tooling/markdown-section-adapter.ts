import { readdirSync } from "node:fs";
import { resolve } from "node:path";

export type MarkdownDocumentMode = "source" | "hybrid" | "generated";

export interface MarkdownHeading {
  readonly level: number;
  readonly title: string;
}

export interface MarkdownAddress {
  readonly anchorId: string;
  readonly line: number;
  readonly offset: number;
  readonly headingPath: readonly MarkdownHeading[];
}

export interface MarkdownOwnedBlock {
  readonly blockId: string;
  readonly start: number;
  readonly end: number;
  readonly content: string;
}

function fail(message: string): never {
  throw new Error(`markdown-section-adapter: ${message}`);
}

function assertSafeId(value: string, name: string): void {
  if (!/^[A-Za-z][A-Za-z0-9._-]*$/.test(value)) {
    fail(`${name} must be a stable ASCII identifier: ${value}`);
  }
}

function beginMarker(blockId: string): string {
  return `<!-- мтс:требование:${blockId}:начало -->`;
}

function endMarker(blockId: string): string {
  return `<!-- мтс:требование:${blockId}:конец -->`;
}

interface VisibleLine {
  readonly line: number;
  readonly start: number;
  readonly end: number;
  readonly text: string;
  readonly visible: boolean;
}

function linesOf(source: string): readonly VisibleLine[] {
  const result: VisibleLine[] = [];
  let line = 1;
  let offset = 0;
  let inFence = false;

  while (offset <= source.length) {
    const newline = source.indexOf("\n", offset);
    const end = newline < 0 ? source.length : newline;
    const text = source.slice(offset, end).replace(/\r$/, "");
    const trimmed = text.trim();
    const fence = /^(?:```|~~~)/.test(trimmed);
    const visible = !inFence && !fence;

    result.push(Object.freeze({ line, start: offset, end, text, visible }));

    if (fence) inFence = !inFence;
    if (newline < 0) break;
    offset = newline + 1;
    line += 1;
  }

  return Object.freeze(result);
}

function headingPathAt(lines: readonly VisibleLine[], targetLine: number): readonly MarkdownHeading[] {
  const stack: MarkdownHeading[] = [];
  for (const line of lines) {
    if (line.line > targetLine) break;
    if (!line.visible) continue;
    const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line.text);
    if (match === null) continue;
    const level = match[1]!.length;
    const title = match[2]!.trim();
    while (stack.length > 0 && stack[stack.length - 1]!.level >= level) stack.pop();
    stack.push(Object.freeze({ level, title }));
  }
  return Object.freeze([...stack]);
}

export function resolveMarkdownAnchor(source: string, anchorId: string): MarkdownAddress {
  assertSafeId(anchorId, "anchorId");
  const pattern = new RegExp(`<a\\s+id=["']${anchorId.replace(/[.*+?^$\{\}()|[\]\\]/g, "\\$&")}["']\\s*><\\/a>`);
  const lines = linesOf(source);
  const matches = lines.filter((line) => line.visible && pattern.test(line.text));

  if (matches.length === 0) fail(`anchor not found: ${anchorId}`);
  if (matches.length > 1) fail(`anchor is duplicated: ${anchorId}`);

  const match = matches[0]!;
  return Object.freeze({
    anchorId,
    line: match.line,
    offset: match.start,
    headingPath: headingPathAt(lines, match.line),
  });
}

export function readOwnedMarkdownBlock(source: string, blockId: string): MarkdownOwnedBlock | null {
  assertSafeId(blockId, "blockId");
  const startToken = beginMarker(blockId);
  const endToken = endMarker(blockId);
  const lines = linesOf(source);
  const starts = lines.filter((line) => line.visible && line.text.includes(startToken));
  const ends = lines.filter((line) => line.visible && line.text.includes(endToken));

  if (starts.length === 0 && ends.length === 0) return null;
  if (starts.length !== 1 || ends.length !== 1) {
    fail(`${blockId}: malformed owned block start=${starts.length} end=${ends.length}`);
  }

  const startLine = starts[0]!;
  const endLine = ends[0]!;
  if (endLine.line <= startLine.line) fail(`${blockId}: end marker must follow begin marker`);

  const blockStart = startLine.start;
  const blockEnd = endLine.end;
  return Object.freeze({
    blockId,
    start: blockStart,
    end: blockEnd,
    content: source.slice(blockStart, blockEnd),
  });
}

function insertAfterAnchorLine(source: string, anchor: MarkdownAddress, block: string): string {
  const lines = linesOf(source);
  const line = lines.find((candidate) => candidate.line === anchor.line);
  if (line === undefined) fail(`${anchor.anchorId}: anchor line vanished`);
  const newline = source.slice(line.end, line.end + 2) === "\r\n" ? "\r\n" : "\n";
  const insertAt = line.end;
  return `${source.slice(0, insertAt)}${newline}${block}${source.slice(insertAt)}`;
}

export function assertOutsideOwnedBlockUnchanged(
  before: string,
  after: string,
  blockId: string,
): void {
  const previous = readOwnedMarkdownBlock(before, blockId);
  const next = readOwnedMarkdownBlock(after, blockId);
  if (previous === null || next === null) {
    fail(`${blockId}: outside-change comparison requires block in both versions`);
  }
  const beforeOutside = before.slice(0, previous.start) + before.slice(previous.end);
  const afterOutside = after.slice(0, next.start) + after.slice(next.end);
  if (beforeOutside !== afterOutside) {
    fail(`${blockId}: bytes outside owned block changed`);
  }
}

export function replaceOwnedMarkdownSection(args: {
  readonly source: string;
  readonly mode: MarkdownDocumentMode;
  readonly anchorId: string;
  readonly blockId: string;
  readonly generatedContent: string;
}): string {
  const { source, mode, anchorId, blockId, generatedContent } = args;
  assertSafeId(anchorId, "anchorId");
  assertSafeId(blockId, "blockId");

  if (mode === "source") fail(`${anchorId}: SOURCE document is read-only`);
  if (mode === "generated") {
    fail(`${anchorId}: whole-file GENERATED mode is not supported by the section adapter`);
  }

  const anchor = resolveMarkdownAnchor(source, anchorId);
  const wrapped = [
    beginMarker(blockId),
    generatedContent,
    endMarker(blockId),
  ].join("\n");

  const existing = readOwnedMarkdownBlock(source, blockId);
  if (existing === null) {
    return insertAfterAnchorLine(source, anchor, wrapped);
  }

  if (existing.start < anchor.offset) {
    fail(`${blockId}: owned block precedes its anchor ${anchorId}`);
  }

  const updated = source.slice(0, existing.start) + wrapped + source.slice(existing.end);
  assertOutsideOwnedBlockUnchanged(source, updated, blockId);
  return updated;
}

function walkMarkdown(directory: string, prefix: string): string[] {
  const result: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      result.push(...walkMarkdown(resolve(directory, entry.name), path));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      result.push(path);
    }
  }
  return result;
}

export function listRepositoryMarkdownSurface(root: string): readonly string[] {
  const result = ["README.md", "PORTFOLIO.md"];
  result.push(...walkMarkdown(resolve(root, "docs"), "docs"));
  return Object.freeze(result.sort());
}
