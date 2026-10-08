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


export type V015LexicalContext = "fenced" | "inline" | "table" | "prose" | "diagram";
export interface V015FormalLexicalOccurrence {
  readonly path: string;
  readonly line: number;
  readonly source: string;
  readonly context: V015LexicalContext;
  readonly tokens: readonly string[];
}
export interface V015FormalLexicalScan {
  readonly files: readonly V015MarkdownSurface[];
  readonly observations: readonly V015FormalLexicalOccurrence[];
  readonly unregistered: readonly string[];
}
/** An independent candidate pass over all current Markdown lines, not proof. */
export function scanV015FormalLexicalSurface(root: string): V015FormalLexicalScan {
  const universe = scanV015MarkdownProse(root);
  const checks: ReadonlyArray<readonly [string, RegExp]> = [
    ["LINK_DIRECTION", /⟼|->|→|⇒/u],
    ["LINK_IDENTITY_OR_META_EQUALITY", /(?:[A-Za-zА-Яа-я0-9_)\]])\s*=(?!=)|≡/u],
    ["CONTEXT_NAME_OR_BINDING", /(?:^|[\s\x60"'({,])(?::[A-Za-zА-Яа-я_][\wА-Яа-я]*)|(?:[A-Za-zА-Яа-я_][\wА-Яа-я]*)\s*:\s*(?:\{\}|\[[^\]]*\]|[A-Za-zА-Яа-я_]\w*|\()/u],
    ["EXACT_SEQUENCE", /\[\s*\]|(?:\[\s*[A-Za-zА-Яа-я_:][^\]\n]*\])/u],
    ["ROOT_ASPECT", /∞|ROOT\b/u],
    ["START_END_ASPECT", /♂|♀|START_K|END_K/u],
    ["SEMANTIC_METAMODEL", /Γ|Ω|Den\(|J\(|∈/u],
    ["FORMAL_BUNDLE", /\{\s*[A-Za-zА-Яа-я_][\wА-Яа-я]*(?:\s*[,}])|\{\s*\}/u],
    ["DIAGRAM_OR_IMAGE", /!\[[^\]]*\]\([^)]+\)|<svg\b|<img\b|(?:^|\s)(?:graph|flowchart)\s+(?:TD|LR|TB)\b/u],
  ];
  const observations: V015FormalLexicalOccurrence[] = [];
  for (const file of universe.files) {
    const lines = readFileSync(resolve(root, file.path), "utf8").split(/\r?\n/);
    let inFence = false;
    let fenceLanguage = "";
    for (let i = 0; i < lines.length; i++) {
      const source = lines[i]!;
      const marker = source.match(/^\s*(\x60{3}|~~~)(\w*)/);
      if (marker) {
        if (!inFence) fenceLanguage = marker[2] ?? "";
        inFence = !inFence;
        continue;
      }
      if (/^\s*<!--/.test(source)) continue;
      // Markdown link/image brackets are presentation syntax, not FORMAL ExactSequence.
      // Keep visible labels (including FORMAL operators), but discard link destinations.
      // Fenced code remains literal FORMAL source; only rendered Markdown is normalized.
      // Diagram/image discovery still runs on the original source line.
      const semanticText = inFence ? source : source.replace(/!?\[([^\]\n]+)\]\([^)\n]*\)/g, "$1");
      const tokens = checks.filter(([name, re]) =>
        re.test(name === "DIAGRAM_OR_IMAGE" ? source : semanticText)).map(([name]) => name);
      if (tokens.length === 0) continue;
      const context: V015LexicalContext =
        tokens.includes("DIAGRAM_OR_IMAGE") || (inFence && /^(mermaid|dot)$/.test(fenceLanguage))
          ? "diagram"
          : inFence ? "fenced" : /^\s*\|/.test(source) ? "table" :
            source.includes("\x60") ? "inline" : "prose";
      observations.push({ path: file.path, line: i + 1, source, context, tokens });
    }
  }
  return { files: universe.files, observations, unregistered: universe.unregistered };
}
