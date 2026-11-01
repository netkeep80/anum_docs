import {
  existsSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import {
  basename,
  join,
  resolve,
} from "node:path";
import { loadCurrentProjection } from "../src/tooling/docs-sync.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`current docs: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}

const root = resolve(process.cwd(), "..");
const projection = loadCurrentProjection(root);
const acceptance = JSON.parse(
  readFileSync(join(root, "cutover/typescript-c1-acceptance-v0.8.json"), "utf8"),
) as any;
same(projection.currentContract, "mts-contract/v0.15", "accepted current contract");
same(projection.previousContract, "mts-contract/v0.14", "accepted previous contract");
same(projection.acceptancePath, "cutover/typescript-c1-acceptance-v0.8.json", "accepted current acceptance");
same(
  acceptance.current?.contract,
  projection.currentContractPath,
  "accepted v0.8 artifact matches native current projection",
);
assert(
  Array.isArray(acceptance.postAcceptanceWork) && acceptance.postAcceptanceWork.some((item: unknown) => typeof item === "string" && item.includes("#1951")),
  "post-acceptance FORMAL formula migration is governed by #1951",
);

function listMarkdownFiles(directory: string, relativePrefix: string): string[] {
  const result: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const relativePath = `${relativePrefix}/${entry.name}`;
    const absolutePath = join(directory, entry.name);
    if (entry.isDirectory()) {
      result.push(...listMarkdownFiles(absolutePath, relativePath));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      result.push(relativePath);
    }
  }
  return result;
}

const current = Object.freeze([
  "README.md",
  "PORTFOLIO.md",
  ...listMarkdownFiles(join(root, "docs"), "docs"),
].filter((relativePath) =>
  readFileSync(join(root, relativePath), "utf8").includes("mts-doc-version: v0.15"),
));

assert(current.length > 0, "current documentation surface is discovered from v0.15 markers");
assert(current.includes("PORTFOLIO.md"), "portfolio remains current reader-facing documentation");
assert(current.includes("docs/CONTRIBUTING.md"), "contributing guide remains current reader-facing documentation");
same(new Set(current).size, current.length, "current documentation paths are unique");

const obsoleteCurrentMarkerPattern = /mts-doc-version:\s*v0\.(?:9|10|11|12|13)\b/gi;
const versionedNamePattern = /(?:^|[\s._-])v?\d+\.\d+(?:$|[\s._-])/i;
const visibleVersionLabels = Object.freeze([
  "> **Версия МТС: v0.15**",
  "> **Документ относится к МТС v0.15**",
  "> **Текущая МТС: v0.15.",
]);

for (const relativePath of current) {
  const fullPath = join(root, relativePath);
  assert(existsSync(fullPath), `${relativePath}: current document exists`);

  const source = readFileSync(fullPath, "utf8");
  assert(source.startsWith("# "), `${relativePath}: H1 must be the first line`);

  same(
    source.split("mts-doc-version: v0.15").length - 1,
    1,
    `${relativePath}: exactly one v0.15 machine marker`,
  );
  assert(
    source.indexOf("mts-doc-version: v0.15") < 300,
    `${relativePath}: version marker must be near the title`,
  );
  assert(
    visibleVersionLabels.some((label) => source.includes(label)),
    `${relativePath}: visible v0.15 label is required`,
  );

  const obsoleteMarkers = [...source.matchAll(obsoleteCurrentMarkerPattern)]
    .map((match) => match[0]);
  same(
    obsoleteMarkers.length,
    0,
    `${relativePath}: previous MTS version must not remain as a current document marker`,
  );
  assert(
    !source.includes("> **Версия МТС: v0.13**")
      && !source.includes("> **Документ относится к МТС v0.13**"),
    `${relativePath}: v0.13 may be historical/profile evidence but not the visible current version label`,
  );

  assert(
    !versionedNamePattern.test(basename(relativePath, ".md")),
    `${relativePath}: current document filename must be versionless`,
  );

  assert(
    !source.includes("Пучки значений МТС v0.2.md"),
    `${relativePath}: obsolete versioned Link-bundle path is forbidden`,
  );
}

const oldBundlePath = join(
  root,
  "docs/specs/Пучки значений МТС v0.2.md",
);
assert(
  !existsSync(oldBundlePath),
  "obsolete versioned Link-bundle document must not remain in active tree",
);

const glossary = join(root, "docs/Словарь терминов МТС.md");
assert(
  current.includes("docs/Словарь терминов МТС.md"),
  "glossary must belong to the self-declared current documentation surface",
);
assert(existsSync(glossary), "glossary exists");

console.log([
  "MTS v0.15 current documentation surface: GREEN",
  `CURRENT_DOCS=${current.length}`,
  "VERSION_MARKER=EXACTLY_ONE_PER_DOC",
  "VISIBLE_VERSION_LABEL=REQUIRED",
  "OBSOLETE_CURRENT_VERSION_MARKERS=0",
  "VERSIONED_CURRENT_FILENAMES=0",
  "OBSOLETE_BUNDLE_PATH=ABSENT",
  "CURRENT_VERSION=v0.15",
].join(" "));
