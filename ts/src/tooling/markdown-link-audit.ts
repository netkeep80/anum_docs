import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, relative, resolve, sep } from "node:path";

import { listMarkdownAnchorIds } from "./markdown-section-adapter.js";

export type MarkdownLinkIssueCode =
  | "malformed-target"
  | "target-outside-repository"
  | "missing-target"
  | "missing-fragment";

export interface MarkdownLinkIssue {
  readonly code: MarkdownLinkIssueCode;
  readonly sourcePath: string;
  readonly line: number;
  readonly destination: string;
  readonly message: string;
}

interface VisibleLine {
  readonly line: number;
  readonly text: string;
  readonly visible: boolean;
}

interface MarkdownLinkReference {
  readonly line: number;
  readonly destination: string;
}

function linesOf(source: string): readonly VisibleLine[] {
  const result: VisibleLine[] = [];
  let inFence = false;
  const lines = source.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const text = lines[index] ?? "";
    const fence = /^(?:\s*)(?:```|~~~)/.test(text);
    result.push(Object.freeze({ line: index + 1, text, visible: !inFence && !fence }));
    if (fence) inFence = !inFence;
  }
  return Object.freeze(result);
}

function normalizeReferenceId(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function inlineLinks(lines: readonly VisibleLine[]): readonly MarkdownLinkReference[] {
  const result: MarkdownLinkReference[] = [];
  const pattern = /!?\[[^\]]*\]\(\s*(<[^>]+>|[^\s)]+)(?:\s+["'][^)]*["'])?\s*\)/g;
  for (const line of lines) {
    if (!line.visible) continue;
    for (const match of line.text.matchAll(pattern)) {
      const raw = match[1];
      if (raw === undefined) continue;
      result.push(Object.freeze({
        line: line.line,
        destination: raw.startsWith("<") && raw.endsWith(">") ? raw.slice(1, -1) : raw,
      }));
    }
  }
  return Object.freeze(result);
}

function referenceLinks(lines: readonly VisibleLine[]): readonly MarkdownLinkReference[] {
  const definitions = new Map<string, string>();
  const definitionPattern = /^\s*\[([^\]]+)\]:\s*(<[^>]+>|\S+)/;
  for (const line of lines) {
    if (!line.visible) continue;
    const match = definitionPattern.exec(line.text);
    if (match?.[1] === undefined || match[2] === undefined) continue;
    const raw = match[2];
    definitions.set(
      normalizeReferenceId(match[1]),
      raw.startsWith("<") && raw.endsWith(">") ? raw.slice(1, -1) : raw,
    );
  }

  const result: MarkdownLinkReference[] = [];
  const referencePattern = /!?\[[^\]]+\]\[([^\]]*)\]/g;
  for (const line of lines) {
    if (!line.visible || definitionPattern.test(line.text)) continue;
    for (const match of line.text.matchAll(referencePattern)) {
      const id = normalizeReferenceId(match[1] ?? "");
      if (id.length === 0) continue;
      const destination = definitions.get(id);
      if (destination !== undefined) {
        result.push(Object.freeze({ line: line.line, destination }));
      }
    }
  }
  return Object.freeze(result);
}

function isExternal(destination: string): boolean {
  return /^(?:[A-Za-z][A-Za-z0-9+.-]*:|\/\/)/.test(destination);
}

function decode(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function headingSlugBase(title: string): string {
  return title
    .trim()
    .replace(/\s+#+\s*$/, "")
    .replace(/<[^>]*>/g, "")
    .replace(/[`*_~]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .trim()
    .replace(/\s+/g, "-");
}

export function listMarkdownHeadingSlugs(source: string): readonly string[] {
  const counts = new Map<string, number>();
  const result: string[] = [];
  for (const line of linesOf(source)) {
    if (!line.visible) continue;
    const match = /^#{1,6}\s+(.+?)\s*$/.exec(line.text);
    if (match?.[1] === undefined) continue;
    const base = headingSlugBase(match[1]);
    if (base.length === 0) continue;
    const occurrence = counts.get(base) ?? 0;
    counts.set(base, occurrence + 1);
    result.push(occurrence === 0 ? base : `${base}-${occurrence}`);
  }
  return Object.freeze(result);
}

function targetFragments(source: string): ReadonlySet<string> {
  return new Set([...listMarkdownAnchorIds(source), ...listMarkdownHeadingSlugs(source)]);
}

function issue(
  code: MarkdownLinkIssueCode,
  sourcePath: string,
  line: number,
  destination: string,
  message: string,
): MarkdownLinkIssue {
  return Object.freeze({ code, sourcePath, line, destination, message });
}

export function auditRepositoryMarkdownLinks(
  root: string,
  sourcePaths: readonly string[],
): readonly MarkdownLinkIssue[] {
  const repositoryRoot = resolve(root);
  const issues: MarkdownLinkIssue[] = [];
  const targetSourceCache = new Map<string, string>();
  const fragmentCache = new Map<string, ReadonlySet<string>>();

  const readTarget = (fullPath: string): string => {
    let source = targetSourceCache.get(fullPath);
    if (source === undefined) {
      source = readFileSync(fullPath, "utf8");
      targetSourceCache.set(fullPath, source);
    }
    return source;
  };

  for (const sourcePath of sourcePaths) {
    const sourceFullPath = resolve(repositoryRoot, sourcePath);
    if (!existsSync(sourceFullPath) || !statSync(sourceFullPath).isFile()) {
      issues.push(issue(
        "missing-target",
        sourcePath,
        1,
        sourcePath,
        `${sourcePath}: source document does not exist`,
      ));
      continue;
    }

    const source = readTarget(sourceFullPath);
    const lines = linesOf(source);
    const links = [...inlineLinks(lines), ...referenceLinks(lines)];

    for (const link of links) {
      const destination = link.destination.trim();
      if (destination.length === 0 || isExternal(destination)) continue;

      const hash = destination.indexOf("#");
      const pathPartRaw = hash < 0 ? destination : destination.slice(0, hash);
      const fragmentRaw = hash < 0 ? "" : destination.slice(hash + 1);
      const query = pathPartRaw.indexOf("?");
      const cleanPathRaw = query < 0 ? pathPartRaw : pathPartRaw.slice(0, query);

      const decodedPath = decode(cleanPathRaw);
      const decodedFragment = decode(fragmentRaw);
      if (decodedPath === null || decodedFragment === null) {
        issues.push(issue(
          "malformed-target",
          sourcePath,
          link.line,
          destination,
          `${sourcePath}:${link.line}: malformed percent-encoding in ${destination}`,
        ));
        continue;
      }

      const targetFullPath = decodedPath.length === 0
        ? sourceFullPath
        : resolve(repositoryRoot, dirname(sourcePath), decodedPath);
      const relativeTarget = relative(repositoryRoot, targetFullPath);
      if (
        relativeTarget === ".." ||
        relativeTarget.startsWith(`..${sep}`) ||
        resolve(repositoryRoot, relativeTarget) !== targetFullPath
      ) {
        issues.push(issue(
          "target-outside-repository",
          sourcePath,
          link.line,
          destination,
          `${sourcePath}:${link.line}: target escapes repository: ${destination}`,
        ));
        continue;
      }

      if (!existsSync(targetFullPath) || !statSync(targetFullPath).isFile()) {
        issues.push(issue(
          "missing-target",
          sourcePath,
          link.line,
          destination,
          `${sourcePath}:${link.line}: missing local target ${relativeTarget}`,
        ));
        continue;
      }

      if (decodedFragment.length === 0 || extname(targetFullPath).toLowerCase() !== ".md") continue;

      let fragments = fragmentCache.get(targetFullPath);
      if (fragments === undefined) {
        fragments = targetFragments(readTarget(targetFullPath));
        fragmentCache.set(targetFullPath, fragments);
      }
      if (!fragments.has(decodedFragment)) {
        issues.push(issue(
          "missing-fragment",
          sourcePath,
          link.line,
          destination,
          `${sourcePath}:${link.line}: missing fragment #${decodedFragment} in ${relativeTarget}`,
        ));
      }
    }
  }

  return Object.freeze(issues.sort((left, right) =>
    left.sourcePath.localeCompare(right.sourcePath) ||
    left.line - right.line ||
    left.destination.localeCompare(right.destination)
  ));
}
