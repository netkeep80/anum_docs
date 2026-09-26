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

export interface MarkdownNode {
  readonly anchorId: string;
  readonly anchorLine: number;
  readonly headingLine: number;
  readonly heading: MarkdownHeading;
  readonly headingPath: readonly MarkdownHeading[];
  readonly start: number;
  readonly end: number;
  readonly subtree: string;
}

export interface MarkdownChildSpec {
  readonly anchorId: string;
  readonly title: string;
  readonly payload?: string;
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

function headingOf(line: VisibleLine): MarkdownHeading | null {
  if (!line.visible) return null;
  const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line.text);
  return match === null ? null : Object.freeze({ level: match[1]!.length, title: match[2]!.trim() });
}

function stableAnchorId(line: VisibleLine): string | null {
  if (!line.visible) return null;
  const match = /<a\s+id=["']([A-Za-z][A-Za-z0-9._-]*)["']\s*><\/a>/.exec(line.text);
  return match?.[1] ?? null;
}

export function listMarkdownAnchorIds(source: string): readonly string[] {
  const ids = linesOf(source).map(stableAnchorId).filter((id): id is string => id !== null);
  if (new Set(ids).size !== ids.length) fail("document contains duplicate stable anchors");
  return Object.freeze(ids);
}

function associatedHeadingLine(lines: readonly VisibleLine[], anchorLine: number): VisibleLine | null {
  let ownedBlockDepth = 0;
  for (const line of lines) {
    if (line.line <= anchorLine || !line.visible) continue;
    const trimmed = line.text.trim();
    if (trimmed.startsWith("<!-- мтс:требование:") && trimmed.endsWith(":начало -->")) {
      ownedBlockDepth += 1;
      continue;
    }
    if (trimmed.startsWith("<!-- мтс:требование:") && trimmed.endsWith(":конец -->")) {
      ownedBlockDepth -= 1;
      if (ownedBlockDepth < 0) fail("orphan compiler-owned block end marker");
      continue;
    }
    if (ownedBlockDepth > 0 || trimmed.length === 0 || /^<!--.*-->$/.test(trimmed)) continue;
    return headingOf(line) === null ? null : line;
  }
  if (ownedBlockDepth !== 0) fail("unclosed compiler-owned block before node heading");
  return null;
}

function nodeOrNull(source: string, anchorId: string): MarkdownNode | null {
  const anchor = resolveMarkdownAnchor(source, anchorId);
  const lines = linesOf(source);
  const headingLine = associatedHeadingLine(lines, anchor.line);
  if (headingLine === null) return null;
  const heading = headingOf(headingLine)!;
  const endLine = lines.find((line) =>
    line.line > headingLine.line &&
    ((candidate) => candidate !== null && candidate.level <= heading.level)(headingOf(line))
  );
  const end = endLine?.start ?? source.length;
  return Object.freeze({
    anchorId,
    anchorLine: anchor.line,
    headingLine: headingLine.line,
    heading,
    headingPath: headingPathAt(lines, headingLine.line),
    start: anchor.offset,
    end,
    subtree: source.slice(anchor.offset, end),
  });
}

export function readMarkdownNode(source: string, anchorId: string): MarkdownNode {
  const node = nodeOrNull(source, anchorId);
  if (node === null) fail(`${anchorId}: anchor is not a canonical tree node`);
  return node;
}

export function listMarkdownChildren(source: string, parentAnchorId: string): readonly MarkdownNode[] {
  const parent = readMarkdownNode(source, parentAnchorId);
  const ids = listMarkdownAnchorIds(source);
  return Object.freeze(ids
    .map((id) => nodeOrNull(source, id))
    .filter((node): node is MarkdownNode =>
      node !== null &&
      node.anchorId !== parent.anchorId &&
      node.start > parent.start &&
      node.start < parent.end &&
      node.heading.level === parent.heading.level + 1
    )
    .sort((left, right) => left.start - right.start));
}

function validateChildSpec(spec: MarkdownChildSpec): void {
  assertSafeId(spec.anchorId, "child.anchorId");
  if (spec.title.trim().length === 0 || /[\r\n]/.test(spec.title)) fail("child title must be one non-empty line");
  const payload = spec.payload ?? "";
  if (/^#{1,6}\s+/m.test(payload) || /<a\s+id=["']/i.test(payload)) {
    fail("child payload cannot contain headings or stable anchors; insert descendants explicitly");
  }
}

export function insertMarkdownChild(args: {
  readonly source: string;
  readonly mode: MarkdownDocumentMode;
  readonly parentAnchorId: string;
  readonly child: MarkdownChildSpec;
}): string {
  const { source, mode, parentAnchorId, child } = args;
  if (mode === "source") fail(`${parentAnchorId}: SOURCE document is read-only`);
  if (mode === "generated") fail(`${parentAnchorId}: whole-file GENERATED mode is not supported`);
  validateChildSpec(child);
  if (listMarkdownAnchorIds(source).includes(child.anchorId)) fail(`anchor is duplicated: ${child.anchorId}`);

  const parent = readMarkdownNode(source, parentAnchorId);
  if (parent.heading.level >= 6) fail(`${parentAnchorId}: heading level 6 cannot have a Markdown child`);

  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  const payload = child.payload?.trimEnd();
  const block = [
    `<a id="${child.anchorId}"></a>`,
    `${"#".repeat(parent.heading.level + 1)} ${child.title.trim()}`,
    ...(payload ? [payload] : []),
  ].join(newline);
  const prefix = parent.end > 0 && !source.slice(0, parent.end).endsWith(newline) ? newline : "";
  const inserted = `${prefix}${block}${newline}${newline}`;
  const updated = source.slice(0, parent.end) + inserted + source.slice(parent.end);

  if (updated.slice(0, parent.end) !== source.slice(0, parent.end) ||
      updated.slice(parent.end + inserted.length) !== source.slice(parent.end)) {
    fail("insert child modified bytes outside insertion point");
  }
  for (const id of listMarkdownAnchorIds(source)) resolveMarkdownAnchor(updated, id);
  const created = readMarkdownNode(updated, child.anchorId);
  if (created.heading.level !== parent.heading.level + 1) fail("inserted child has invalid heading level");
  return updated;
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
