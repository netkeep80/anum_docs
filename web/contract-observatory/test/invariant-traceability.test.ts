import { buildContractObservatoryIndex } from "../src/contract-index.js";
import { buildMethodologyProjection } from "../src/methodology-projection.js";
import { renderContractObservatoryHtml } from "../src/site.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Contract Observatory V4d: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

const repositoryRoot = process.cwd();
const index = buildContractObservatoryIndex(repositoryRoot);
const projection = buildMethodologyProjection(repositoryRoot, index);
const current = projection.versions.find((version) => version.isCurrent);
const previous = projection.versions.find((version) => version.isPrevious);
const historicalV011 = projection.versions.find((version) => version.contractId === "mts-contract/v0.11");
assert(current !== undefined, "current version exists");
assert(previous !== undefined, "previous version exists");
assert(historicalV011 !== undefined, "historical v0.11 version exists");

same(current.contractId, "mts-contract/v0.13", "current release is v0.13 after A74");
same(current.semanticInvariants.length, 13, "current v0.13 exposes L1-L13 through traceability authority");
same(current.traceabilityManifestPath, "traceability/mts-v0.13.json", "current v0.13 traceability manifest source is explicit");
assert(!current.unresolvedRelations.includes("traceability-manifest"), "current v0.13 traceability manifest is resolved");

const currentFormal = current.semanticInvariants.find((invariant) => invariant.id === "L12");
assert(currentFormal !== undefined, "current v0.13 FORMAL grounding invariant L12 is projected");
assert(
  currentFormal.requiredExecutableGates.includes("ts/test/v013-root-aspect-formal-composition.test.ts"),
  "current v0.13 L12 is bound to its executable FORMAL gate",
);
const formalGroup = currentFormal.positiveGroups?.find((group) => group.sourceSet === "requiredPositiveVectors");
assert(formalGroup !== undefined, "v0.2 preserves requiredPositiveVectors as an explicit source set");
assert(
  formalGroup.vectorIds.includes("v013-formal-root-R-from-8"),
  "v0.13 L12 source set carries its exact conformance vector",
);

same(previous.contractId, "mts-contract/v0.12", "previous release is immutable v0.12 evidence");
same(previous.semanticInvariants.length, 18, "previous v0.12 exposes exactly eighteen authority invariants");
const topLevelDot = historicalV011.semanticInvariants.find((invariant) => invariant.id === "topLevelDot");
assert(topLevelDot !== undefined, "topLevelDot invariant is projected from traceability authority");
same(topLevelDot.traceabilitySourcePath, "traceability/mts-v0.11.json", "manifest source path remains explicit");
same(topLevelDot.contractPointer, "/requiredSemanticLaws/topLevelDot", "exact contract pointer is preserved");
same(topLevelDot.contractValue, ". -> R under TopBind(R,S)", "contract law is resolved from exact pointer");
same(
  topLevelDot.positive.requiredGenesisVectors.join(","),
  "v011-top-level-astrika-supplies-root-binding,v011-top-level-dot-resolves-to-root",
  "genesis vector category comes directly from manifest",
);
same(
  topLevelDot.negative.requiredNegativeVectors.join(","),
  "v011-dot-is-not-ambient-runtime-current,v011-host-stack-is-not-semantic-authority,v011-top-bind-does-not-insert-hidden-root-glyph",
  "negative vectors stay separate and normalize deterministically",
);
same(
  topLevelDot.requiredExecutableGates.join(","),
  "ts/test/research-physical-dot-bootstrap.test.ts,ts/test/v011-top-level-root-binding.test.ts",
  "required gates come directly from manifest",
);

const topLevelProduction = historicalV011.evidenceReferences.find(
  (reference) => reference.sourcePath === "ts/test/v011-top-level-root-binding.test.ts",
);
assert(topLevelProduction !== undefined, "top-level production evidence reference exists");
same(
  topLevelProduction.identifiers.map((entry) => `${entry.kind}=${entry.value}`).join(","),
  "issue=775,pullRequest=782,head=30a25ed5820cdbea039238ff021f47cacd301014,ciRun=3181,repoGuardRun=639,mergeSha=c6984ef101670732920859c4a990b62d5bb579de",
  "production evidence identifiers are preserved exactly from conformance",
);

const dotMeaning = historicalV011.semanticInvariants.find((invariant) => invariant.id === "dotMeaning");
assert(dotMeaning !== undefined, "dotMeaning invariant exists");
same(dotMeaning.negative.requiredNegativeVectors.length, 0, "explicit empty negative category remains empty");
assert(
  !dotMeaning.positive.requiredC2ClassificationVectors.some((id) => id.includes("q-boundary")),
  "Q-boundary evidence is not guessed into dotMeaning",
);

same(historicalV011.traceabilityManifestPath, "traceability/mts-v0.11.json", "historical v0.11 keeps immutable traceability provenance");
assert(!historicalV011.unresolvedRelations.includes("traceability-manifest"), "historical v0.11 traceability remains resolved after current rotates");

const html = renderContractObservatoryHtml(index, projection);
assert(html.includes('data-invariant-id="topLevelDot"'), "topLevelDot has a visible source-derived anatomy card");
assert(html.includes('data-item-id="invariant:topLevelDot"'), "invariant identity participates in shared cross-highlighting");
assert(html.includes("/requiredSemanticLaws/topLevelDot"), "exact contract JSON Pointer is visible");
assert(html.includes(". -&gt; R under TopBind(R,S)"), "resolved contract law is visible without becoming UI authority");
assert(html.includes("traceability/mts-v0.11.json"), "traceability manifest provenance is visible");
assert(html.includes("traceability/mts-v0.12.json"), "v0.12 traceability provenance is visible");
assert(html.includes("traceability/mts-v0.13.json"), "v0.13 traceability provenance is visible");
assert(html.includes("Векторы формальной нотации"), "v0.2 FORMAL positive source set has a Russian presentation label");
assert(html.includes("Межслойные векторы"), "v0.2 cross-layer positive source set has a Russian presentation label");
for (const label of [
  "Векторы генезиса",
  "Векторы смысла",
  "Векторы классификации C2",
  "Векторы совместимости",
  "Отрицательные векторы",
  "Исполняемые проверки",
]) {
  assert(html.includes(label), `invariant anatomy exposes ${label}`);
}
assert(
  html.includes('data-item-id="vector:v011-top-level-dot-resolves-to-root"'),
  "manifest-declared positive vector is an interactive source-linked endpoint",
);
assert(
  html.includes('data-item-id="vector:v011-dot-is-not-ambient-runtime-current"'),
  "manifest-declared negative vector is an interactive source-linked endpoint",
);
assert(
  html.includes('data-item-id="gate:ts/test/v011-top-level-root-binding.test.ts"'),
  "manifest-declared executable gate is an interactive source-linked endpoint",
);
for (const exactIdentifier of [
  "issue: 775",
  "pullRequest: 782",
  "head: 30a25ed5820cdbea039238ff021f47cacd301014",
  "ciRun: 3181",
  "repoGuardRun: 639",
  "mergeSha: c6984ef101670732920859c4a990b62d5bb579de",
]) {
  assert(html.includes(exactIdentifier), `raw production evidence provenance is visible: ${exactIdentifier}`);
}
const dotMeaningStart = html.indexOf('data-invariant-id="dotMeaning"');
const dotMeaningEnd = html.indexOf('data-invariant-id="', dotMeaningStart + 1);
const dotMeaningHtml = html.slice(dotMeaningStart, dotMeaningEnd < 0 ? undefined : dotMeaningEnd);
assert(dotMeaningStart >= 0, "dotMeaning anatomy card exists");
assert(dotMeaningHtml.includes("Отрицательные векторы"), "dotMeaning keeps the empty negative category visible");
assert(dotMeaningHtml.includes("нет"), "explicit absence is rendered instead of guessed evidence");
assert(!dotMeaningHtml.includes("v011-q-alphabet-remains-four-abits"), "UI does not guess C5/Q evidence into dotMeaning");

const maliciousLaw = `<img src=x onerror="alert('mts')">`;
const maliciousProjection = Object.freeze({
  ...projection,
  versions: Object.freeze(projection.versions.map((version) => version !== historicalV011 ? version : Object.freeze({
    ...version,
    semanticInvariants: Object.freeze(version.semanticInvariants.map((invariant) => invariant.id !== "topLevelDot"
      ? invariant
      : Object.freeze({ ...invariant, contractValue: maliciousLaw }))),
  }))),
});
const maliciousHtml = renderContractObservatoryHtml(index, maliciousProjection);
assert(!maliciousHtml.includes(maliciousLaw), "malicious invariant source text never survives as raw markup");
assert(
  maliciousHtml.includes("&lt;img src=x onerror=&quot;alert(&#39;mts&#39;)&quot;&gt;"),
  "malicious invariant source text is escaped in anatomy",
);

console.log("Contract Observatory V4d invariant traceability and anatomy specification passed.");
