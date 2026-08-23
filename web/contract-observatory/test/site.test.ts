import {
  buildContractObservatoryIndex,
  type ContractObservatoryIndex,
  type ContractVersionSummary,
} from "../src/contract-index.js";
import { renderContractObservatoryHtml } from "../src/site.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Contract Observatory V3b: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
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
const realHtml = renderContractObservatoryHtml(realIndex);

same(realIndex.versions.length, 2, "real repository still exposes two live versions");
assert(realHtml.startsWith("<!doctype html>\n<html lang=\"ru\">"), "browser document baseline");
assert(realHtml.includes("<meta charset=\"utf-8\">"), "UTF-8 metadata");
assert(realHtml.includes("name=\"viewport\""), "viewport metadata");
same(count(realHtml, "<h1>"), 1, "exactly one h1");
assert(realHtml.includes("<nav class=\"timeline\""), "timeline landmark");
assert(realHtml.includes("<main class=\"versions\""), "main landmark");
assert(realHtml.includes(":focus-visible"), "visible keyboard focus styling");
assert(realHtml.includes("@media (max-width: 680px)"), "responsive baseline");
assert(!realHtml.includes("<script"), "no client script runtime");
assert(!realHtml.includes("http://") && !realHtml.includes("https://"), "no external network dependency");

const v010Position = realHtml.indexOf("mts-contract/v0.10");
const v011Position = realHtml.indexOf("mts-contract/v0.11");
assert(v010Position >= 0 && v011Position > v010Position, "timeline preserves V3a natural order");
assert(realHtml.includes("CURRENT"), "current marker visible");
assert(realHtml.includes("PREVIOUS"), "previous marker visible");
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
same(renderContractObservatoryHtml(realIndex), realHtml, "real repository rendering is deterministic");

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

console.log("Contract Observatory V3b static UI checks passed.");
