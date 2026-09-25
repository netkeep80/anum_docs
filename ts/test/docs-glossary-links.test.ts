import {
  existsSync,
  readFileSync,
} from "node:fs";
import {
  dirname,
  resolve,
} from "node:path";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`docs glossary: ${message}`);
}

function githubSlug(text: string): string {
  return text
    .replace(/`([^`]*)`/g, "$1")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s+/g, "-");
}

function anchorsOf(markdown: string): ReadonlySet<string> {
  const anchors = new Set<string>();

  for (const match of markdown.matchAll(/<a id="([^"]+)"><\/a>/g)) {
    const id = match[1];
    if (id !== undefined) anchors.add(id);
  }

  const duplicates = new Map<string, number>();
  for (const line of markdown.split(/\r?\n/)) {
    const heading = line.match(/^#{1,6}\s+(.+?)\s*$/);
    if (heading === null) continue;

    const raw = githubSlug(heading[1] ?? "");
    const count = duplicates.get(raw) ?? 0;
    duplicates.set(raw, count + 1);
    anchors.add(count === 0 ? raw : `${raw}-${count}`);
  }

  return anchors;
}

function main(): void {
  const root = resolve(process.cwd(), "..");
  const glossaryPath = resolve(root, "docs/Словарь терминов МТС.md");
  const glossary = readFileSync(glossaryPath, "utf8");

  assert(
    glossary.split("mts-doc-version: v0.13").length - 1 === 1,
    "exactly one v0.13 document marker is required",
  );
  assert(
    !/v0\.(?:9|10|11|12)\b/i.test(glossary),
    "current glossary must not contain previous-version exposition",
  );

  const entries = glossary
    .split(/\n(?=### )/)
    .filter((part) => part.startsWith("### "));

  assert(entries.length >= 50, "expected a substantive terminology corpus");

  let detailLinks = 0;

  for (const entry of entries) {
    const title = entry.split("\n", 1)[0] ?? "unknown term";

    assert(entry.includes("**Слой:**"), `${title}: missing layer`);
    assert(entry.includes("**Статус:**"), `${title}: missing status`);
    assert(entry.includes("**Подробнее:**"), `${title}: missing details link`);

    const detail = entry.match(
      /\*\*Подробнее:\*\*\s+\[[^\]]+\]\(([^)#]+\.md)(?:#([^)]+))?\)/,
    );
    assert(detail !== null, `${title}: malformed details link`);

    const relativeTarget = decodeURIComponent(detail[1] ?? "");
    const fragment = detail[2] === undefined
      ? undefined
      : decodeURIComponent(detail[2]);

    const targetPath = resolve(dirname(glossaryPath), relativeTarget);
    assert(existsSync(targetPath), `${title}: target file does not exist`);

    if (fragment !== undefined) {
      const target = readFileSync(targetPath, "utf8");
      assert(
        anchorsOf(target).has(fragment),
        `${title}: target fragment does not exist: ${fragment}`,
      );
    }

    detailLinks += 1;
  }

  assert(
    detailLinks === entries.length,
    "every terminology entry must have exactly one resolvable details link",
  );

  console.log(
    `MTS v0.13 glossary links: GREEN terms=${entries.length} links=${detailLinks}`,
  );
}

main();
