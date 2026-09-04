import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { materializeContractObservatorySite } from "../src/build-site.js";
import {
  buildContractObservatoryIndex,
  type ContractObservatoryIndex,
  type ContractVersionSummary,
} from "../src/contract-index.js";
import { buildMethodologyProjection } from "../src/methodology-projection.js";
import { renderContractObservatoryHtml } from "../src/site.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Contract Observatory V3b/V3c/V4c: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

function throws(action: () => void, message: string): void {
  let rejected = false;
  try {
    action();
  } catch {
    rejected = true;
  }
  assert(rejected, message);
}

function count(haystack: string, needle: string): number {
  if (needle.length === 0) return 0;
  let result = 0;
  let offset = 0;
  while (true) {
    const found = haystack.indexOf(needle, offset);
    if (found < 0) return result;
    result += 1;
    offset = found + needle.length;
  }
}

function version(overrides: Partial<ContractVersionSummary> = {}): ContractVersionSummary {
  return Object.freeze({
    contractId: "mts-contract/v1.0",
    conformanceId: "mts-conformance/v1.0",
    contractPath: "contracts/mts-contract-v1.0.json",
    conformancePath: "contracts/mts-conformance-v1.0.json",
    status: "accepted",
    accepted: true,
    acceptanceReady: true,
    semanticBase: "mts-contract/v0.9",
    observableSemanticDelta: true,
    coverageState: "complete",
    requiredExecutableGateCount: 3,
    requiredNegativeVectorCount: 4,
    isCurrent: false,
    isPrevious: false,
    ...overrides,
  });
}

function index(versions: readonly ContractVersionSummary[]): ContractObservatoryIndex {
  return Object.freeze({
    schema: "mts-contract-observatory-index/v0.1",
    acceptancePath: "cutover/acceptance.json",
    currentContractPath: "contracts/current.json",
    currentConformancePath: "contracts/current-conformance.json",
    previousContractPath: "contracts/previous.json",
    previousConformancePath: "contracts/previous-conformance.json",
    versions: Object.freeze([...versions]),
  });
}

const repositoryRoot = process.cwd();
const realIndex = buildContractObservatoryIndex(repositoryRoot);
const realProjection = buildMethodologyProjection(repositoryRoot, realIndex);
const realHtml = renderContractObservatoryHtml(realIndex, realProjection);

same(realIndex.versions.length, 2, "real repository still exposes two live versions");
assert(realHtml.startsWith("<!doctype html>\n<html lang=\"ru\">"), "browser document baseline");
assert(realHtml.includes("<meta charset=\"utf-8\">"), "UTF-8 metadata");
assert(realHtml.includes("name=\"viewport\""), "viewport metadata");
same(count(realHtml, "<h1>"), 1, "exactly one h1");
assert(realHtml.includes("<nav class=\"timeline\""), "timeline landmark retained");
assert(realHtml.includes("<main class=\"versions\""), "V3 version overview retained");
assert(realHtml.includes(":focus-visible"), "visible keyboard focus styling");
assert(realHtml.includes("@media (max-width: 680px)"), "responsive baseline");
assert(!realHtml.includes("http://") && !realHtml.includes("https://"), "no external network dependency");

assert(realHtml.includes("<section class=\"methodology-map\""), "V4c methodology map is rendered as the primary explanatory view");
assert(realHtml.includes("aria-label=\"Methodology stages\""), "methodology stages expose a semantic keyboard-navigation group");
assert(realHtml.includes("data-methodology-stage=\"challenged\""), "methodology stage controls carry deterministic stage identity");
assert(realHtml.includes("data-version-id=\"mts-contract/v0.11\""), "version lane carries exact projected contract identity");
assert(realHtml.includes("CURRENT"), "current classification remains explicit in V4c");
assert(realHtml.includes("PREVIOUS"), "previous classification remains explicit in V4c");
assert(realHtml.includes("Method/lifecycle relation"), "methodology relation authority is textually distinguished");
assert(realHtml.includes("Semantic topology Link: not rendered in this view"), "methodology view cannot be mistaken for MTS semantic Links");
assert(realHtml.includes("data-observatory-controller=\"shared-kernel\""), "static page embeds the shared canonical interaction kernel controller");
assert(!realHtml.includes("const readState ="), "static page no longer owns the old handwritten hash parser");

const v010Position = realHtml.indexOf("mts-contract/v0.10");
const v011Position = realHtml.indexOf("mts-contract/v0.11");
assert(v010Position >= 0 && v011Position > v010Position, "timeline preserves V3a natural order");
assert(realHtml.includes(realIndex.acceptancePath), "acceptance provenance visible");
assert(realHtml.includes(realIndex.currentContractPath), "current contract provenance visible");
assert(realHtml.includes(realIndex.previousContractPath), "previous contract provenance visible");

const current = realIndex.versions.find((entry) => entry.isCurrent);
const previous = realIndex.versions.find((entry) => entry.isPrevious);
assert(current !== undefined, "real current version exists");
assert(previous !== undefined, "real previous version exists");
assert(realHtml.includes(String(current.requiredExecutableGateCount)), "current gate count rendered");
assert(realHtml.includes(String(current.requiredNegativeVectorCount)), "current negative-vector count rendered");
assert(realHtml.includes(`id=\"version-${realIndex.versions.indexOf(current) + 1}\" class=\"version-card current\"`), "current section classified");
assert(realHtml.includes(`id=\"version-${realIndex.versions.indexOf(previous) + 1}\" class=\"version-card\"`), "previous section preserves order");
same(renderContractObservatoryHtml(realIndex, realProjection), realHtml, "real repository rendering is deterministic");

const malicious = `<script>alert('x')</script>&\" >`;
const synthetic = index([
  version({
    contractId: `contract-${malicious}`,
    conformanceId: `conformance-${malicious}`,
    contractPath: `contracts/${malicious}.json`,
    conformancePath: `contracts/conf-${malicious}.json`,
    status: malicious,
    semanticBase: malicious,
    coverageState: malicious,
    accepted: false,
    acceptanceReady: false,
    observableSemanticDelta: false,
    isPrevious: true,
  }),
  version({
    contractId: "mts-contract/v9.7",
    conformanceId: "mts-conformance/v9.7",
    isCurrent: true,
    issue: 77,
    candidateLifecycleIssue: 66,
  }),
  version({
    contractId: "mts-contract/v2.3",
    conformanceId: "mts-conformance/v2.3",
  }),
]);

const syntheticHtml = renderContractObservatoryHtml(synthetic);
assert(!syntheticHtml.includes(malicious), "untrusted index string never survives as raw markup");
assert(!syntheticHtml.includes("<script>alert"), "script-like text is escaped");
assert(syntheticHtml.includes("&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;&amp;&quot; &gt;"), "HTML metacharacters escaped");

same(count(syntheticHtml, "href=\"#version-1\""), 1, "first timeline link exactly once");
same(count(syntheticHtml, "href=\"#version-2\""), 1, "second timeline link exactly once");
same(count(syntheticHtml, "href=\"#version-3\""), 1, "third timeline link exactly once");
same(count(syntheticHtml, "id=\"version-1\""), 1, "first version section exactly once");
same(count(syntheticHtml, "id=\"version-2\""), 1, "second version section exactly once");
same(count(syntheticHtml, "id=\"version-3\""), 1, "third version section exactly once");
assert(syntheticHtml.indexOf("contract-&lt;script&gt;") < syntheticHtml.indexOf("mts-contract/v9.7"), "input version order retained");
assert(syntheticHtml.indexOf("mts-contract/v9.7") < syntheticHtml.indexOf("mts-contract/v2.3"), "renderer does not re-sort input");

same(count(syntheticHtml, "aria-current=\"page\""), 1, "current marker derives from isCurrent only");
assert(syntheticHtml.includes("<details open>"), "current overview is open by default");
assert(syntheticHtml.includes("#77"), "optional issue rendered when present");
assert(syntheticHtml.includes("#66"), "optional lifecycle issue rendered when present");
same(count(syntheticHtml, "Candidate lifecycle issue"), 1, "missing optional lifecycle fields are omitted");
same(renderContractObservatoryHtml(synthetic), syntheticHtml, "synthetic rendering is deterministic");

const sourcePath = join(repositoryRoot, realIndex.currentContractPath);
const sourceBefore = readFileSync(sourcePath, "utf8");
const temporaryRoot = mkdtempSync(join(tmpdir(), "mts-contract-observatory-"));
const materializedDirectory = join(temporaryRoot, "nested", "site");
try {
  const first = materializeContractObservatorySite(repositoryRoot, materializedDirectory);
  assert(existsSync(first.indexPath), "materialized index.html exists");
  assert(existsSync(first.noJekyllPath), "materialized .nojekyll exists");
  same(readFileSync(first.indexPath, "utf8"), realHtml, "materialized HTML equals pure renderer bytes");
  same(readFileSync(first.noJekyllPath, "utf8"), "", ".nojekyll is empty");
  same(first.indexBytes, Buffer.byteLength(realHtml, "utf8"), "reported byte size is deterministic");

  const second = materializeContractObservatorySite(repositoryRoot, materializedDirectory);
  same(readFileSync(second.indexPath, "utf8"), realHtml, "repeated materialization is byte-identical");
  same(readFileSync(sourcePath, "utf8"), sourceBefore, "materialization does not mutate current contract source");
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}

for (const unsafeTarget of [
  repositoryRoot,
  join(repositoryRoot, "contracts", "generated-site"),
  join(repositoryRoot, "cutover", "generated-site"),
  join(repositoryRoot, "ts", "src", "generated-site"),
  join(repositoryRoot, "ts", "test", "generated-site"),
]) {
  throws(
    () => materializeContractObservatorySite(repositoryRoot, unsafeTarget),
    `unsafe materialization target rejects: ${unsafeTarget}`,
  );
}

execFileSync(
  process.execPath,
  [join(repositoryRoot, "web", "contract-observatory", "test", "visual-consumer.test.mjs")],
  { cwd: repositoryRoot, stdio: "inherit" },
);

console.log("Contract Observatory V3b/V3c static UI, materialization and V4a/V4c interaction checks passed.");
