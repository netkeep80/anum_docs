import {
  existsSync,
  readFileSync,
} from "node:fs";
import {
  basename,
  join,
  resolve,
} from "node:path";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`current docs: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}

const root = resolve(process.cwd(), "..");
const policy = JSON.parse(
  readFileSync(join(root, "repo-policy.json"), "utf8"),
) as {
  paths?: {
    canonical_docs?: unknown;
  };
};

const canonical = policy.paths?.canonical_docs;
assert(Array.isArray(canonical), "repo-policy canonical_docs must be an array");
assert(
  canonical.every((value) => typeof value === "string"),
  "every canonical_docs entry must be a string",
);

const support = Object.freeze([
  "docs/CONTRIBUTING.md",
  "PORTFOLIO.md",
]);

const current = Object.freeze([
  ...canonical as string[],
  ...support,
]);

same(new Set(current).size, current.length, "current documentation paths are unique");
same(current.length, 10, "current reader-facing documentation surface cardinality");

const previousVersionPattern = /v0\.(?:9|10|11|12)\b/gi;
const versionedNamePattern = /(?:^|[\s._-])v?\d+\.\d+(?:$|[\s._-])/i;
const visibleVersionLabels = Object.freeze([
  "> **Версия МТС: v0.13**",
  "> **Документ относится к МТС v0.13**",
]);

for (const relativePath of current) {
  const fullPath = join(root, relativePath);
  assert(existsSync(fullPath), `${relativePath}: current document exists`);

  const source = readFileSync(fullPath, "utf8");
  assert(source.startsWith("# "), `${relativePath}: H1 must be the first line`);

  same(
    source.split("mts-doc-version: v0.13").length - 1,
    1,
    `${relativePath}: exactly one v0.13 machine marker`,
  );
  assert(
    source.indexOf("mts-doc-version: v0.13") < 300,
    `${relativePath}: version marker must be near the title`,
  );
  assert(
    visibleVersionLabels.some((label) => source.includes(label)),
    `${relativePath}: visible v0.13 label is required`,
  );

  const oldVersions = [...source.matchAll(previousVersionPattern)]
    .map((match) => match[0]);
  same(
    oldVersions.length,
    0,
    `${relativePath}: previous MTS version prose is forbidden`,
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
  (canonical as string[]).includes("docs/Словарь терминов МТС.md"),
  "glossary must belong to canonical current documentation surface",
);
assert(existsSync(glossary), "glossary exists");

console.log([
  "MTS v0.13 documentation conformance: GREEN",
  `CURRENT_DOCS=${current.length}`,
  "VERSION_MARKER=EXACTLY_ONE_PER_DOC",
  "VISIBLE_VERSION_LABEL=REQUIRED",
  "PREVIOUS_VERSION_PROSE=0",
  "VERSIONED_CURRENT_FILENAMES=0",
  "OBSOLETE_BUNDLE_PATH=ABSENT",
].join(" "));
