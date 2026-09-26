import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";

import { CURRENT_DOC_SIZE_SURFACE, findRepositoryRoot } from "../src/tooling/docs-sync.js";
import {
  auditRepositoryMarkdownLinks,
  listMarkdownHeadingSlugs,
} from "../src/tooling/markdown-link-audit.js";

const repositoryRoot = findRepositoryRoot();
assert.deepEqual(
  auditRepositoryMarkdownLinks(repositoryRoot, CURRENT_DOC_SIZE_SURFACE),
  [],
  "current-reader Markdown links and fragments must resolve",
);

assert.deepEqual(
  listMarkdownHeadingSlugs([
    "## А17. Акт, интерпретатор и результат различаются",
    "## 13. Нет отношения: ZERO, ONE и MANY",
    "## Повтор",
    "## Повтор",
  ].join("\n")),
  [
    "а17-акт-интерпретатор-и-результат-различаются",
    "13-нет-отношения-zero-one-и-many",
    "повтор",
    "повтор-1",
  ],
  "heading slugs are deterministic and duplicate-safe",
);

const tempRoot = mkdtempSync(resolve(tmpdir(), "mts-markdown-link-audit-"));
try {
  const put = (path: string, source: string): void => {
    const fullPath = resolve(tempRoot, path);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, source, "utf8");
  };

  put("docs/Цель документа.md", [
    '<a id="stable-anchor"></a>',
    "## Явный раздел",
    "",
    "## Повтор",
    "## Повтор",
  ].join("\n"));

  const fence = String.fromCharCode(96, 96, 96);
  put("README.md", [
    "# Главная",
    "",
    "[encoded](docs/%D0%A6%D0%B5%D0%BB%D1%8C%20%D0%B4%D0%BE%D0%BA%D1%83%D0%BC%D0%B5%D0%BD%D1%82%D0%B0.md)",
    "[stable](docs/%D0%A6%D0%B5%D0%BB%D1%8C%20%D0%B4%D0%BE%D0%BA%D1%83%D0%BC%D0%B5%D0%BD%D1%82%D0%B0.md#stable-anchor)",
    "[heading](docs/%D0%A6%D0%B5%D0%BB%D1%8C%20%D0%B4%D0%BE%D0%BA%D1%83%D0%BC%D0%B5%D0%BD%D1%82%D0%B0.md#явный-раздел)",
    "[duplicate](docs/%D0%A6%D0%B5%D0%BB%D1%8C%20%D0%B4%D0%BE%D0%BA%D1%83%D0%BC%D0%B5%D0%BD%D1%82%D0%B0.md#повтор-1)",
    "[self](#главная)",
    "[external](https://example.invalid/missing)",
    "",
    "[ref]: docs/%D0%A6%D0%B5%D0%BB%D1%8C%20%D0%B4%D0%BE%D0%BA%D1%83%D0%BC%D0%B5%D0%BD%D1%82%D0%B0.md#stable-anchor",
    "[reference][ref]",
    "",
    fence + "md",
    "[ignored](missing-inside-fence.md)",
    fence,
  ].join("\n"));

  assert.deepEqual(
    auditRepositoryMarkdownLinks(tempRoot, ["README.md"]),
    [],
    "valid inline/reference links, explicit anchors, heading slugs and fenced/external boundaries pass",
  );

  put("broken.md", [
    "# Broken",
    "[missing-file](nope.md)",
    "[missing-fragment](docs/%D0%A6%D0%B5%D0%BB%D1%8C%20%D0%B4%D0%BE%D0%BA%D1%83%D0%BC%D0%B5%D0%BD%D1%82%D0%B0.md#absent)",
    "[escape](../outside.md)",
    "[malformed](docs/%ZZ.md)",
  ].join("\n"));

  const issues = auditRepositoryMarkdownLinks(tempRoot, ["broken.md"]);
  assert.deepEqual(
    issues.map((entry) => entry.code).sort(),
    ["malformed-target", "missing-fragment", "missing-target", "target-outside-repository"].sort(),
    "negative fixtures expose all expected failure classes",
  );
  assert.ok(issues.some((entry) => entry.code === "missing-target" && entry.destination === "nope.md"));
  assert.ok(issues.some((entry) => entry.code === "missing-fragment" && entry.destination.endsWith("#absent")));
  assert.ok(issues.some((entry) => entry.code === "target-outside-repository"));
  assert.ok(issues.some((entry) => entry.code === "malformed-target"));

  const missingSource = auditRepositoryMarkdownLinks(tempRoot, ["absent-source.md"]);
  assert.equal(missingSource.length, 1);
  assert.equal(missingSource[0]!.code, "missing-target");
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}

console.log("Markdown local link/anchor audit: GREEN.");
