import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { relative, resolve } from "node:path";

export interface V015ProseOccurrence {
  readonly path: string;
  readonly line: number;
  readonly source: string;
}
export interface V015MarkdownSurface {
  readonly path: string;
  readonly blobSha: string;
  readonly lineCount: number;
}
export interface V015ProseScan {
  readonly files: readonly V015MarkdownSurface[];
  readonly observations: readonly V015ProseOccurrence[];
  readonly unregistered: readonly string[];
}
const historicalResearch = new Set([
  "docs/research/Исходные мысли МТС.md",
  "docs/research/Новое осмысление МТС.md",
]);
const generatedTheoremCatalog = "docs/theory/Теоремы МТС.md";

function walk(root: string, dir: string, paths: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      walk(root, path, paths);
    } else if (entry.isFile() && path.endsWith(".md")) {
      paths.push(relative(root, path).replace(/\\/g, "/"));
    }
  }
}
/** Independent broad prose-lexical pass, deliberately NOT the fenced/inline heuristic. */
export function scanV015MarkdownProse(root: string): V015ProseScan {
  const allMarkdown: string[] = [];
  for (const dir of ["", "docs"]) {
    if (dir === "") {
      for (const entry of readdirSync(root, { withFileTypes: true })) {
        if (entry.isFile() && entry.name.endsWith(".md")) allMarkdown.push(entry.name);
      }
    } else walk(root, resolve(root, dir), allMarkdown);
  }
  allMarkdown.sort();
  const files: V015MarkdownSurface[] = [];
  const observations: V015ProseOccurrence[] = [];
  const unregistered: string[] = [];
  const broadFormulaLexemes =
    /⟼|→|⇒|≡|∈|Ω|Γ|∞|♂|♀|Den\(|J\(|\[\]|(?:^|[\s(;])(?:N0|Succ|g_AB)\s*=|(?:^|[\s(])(?:[A-Za-z][A-Za-z0-9_]*)\s*=\s*(?:[A-Za-z0-9{([])|:[A-Za-zА-Яа-я][A-Za-zА-Яа-я0-9_]*|(?:[A-Z][A-Za-z0-9_]*:[A-Z][A-Za-z0-9_]*)/u;
  for (const path of allMarkdown) {
    const source = readFileSync(resolve(root, path), "utf8");
    if (historicalResearch.has(path)) continue; // immutable, never modify
    if (!source.includes("mts-doc-version: v0.15") && path !== generatedTheoremCatalog) {
      unregistered.push(path);
      continue;
    }
    const lines = source.split(/\r?\n/);
    const blobSha = createHash("sha1")
      .update("blob " + Buffer.byteLength(source, "utf8") + "\0")
      .update(source, "utf8").digest("hex");
    files.push({ path, blobSha, lineCount: lines.length });
    let inFence = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      if (/^\s*(`{3}|~~~)/.test(line)) {
        inFence = !inFence;
        continue;
      }
      if (inFence || /^\s*<!--/.test(line)) continue;
      const prose = line.replace(/`[^`]*`/g, " ")
        .replace(/\[[^\]]+\]\([^)]+\)/g, " ")
        .replace(/https?:\/\/\S+/g, " ");
      if (broadFormulaLexemes.test(prose))
        observations.push({ path, line: i + 1, source: line });
    }
  }
  return { files, observations, unregistered };
}
