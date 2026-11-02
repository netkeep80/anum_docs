import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { buildContractObservatoryIndex } from "../src/contract-index.js";
import { buildMethodologyProjection, type MethodologyProjection } from "../src/methodology-projection.js";
import { renderContractObservatoryHtml } from "../src/site.js";
import { loadCompiledMtsSemanticIr, type ObservatorySemanticIr } from "../src/semantic-ir-bridge.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Contract Observatory V4d: ${message}`);
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
  assert(rejected, `${message}: expected rejection`);
}

function escapeHtmlForAssertion(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function invariantCardHtml(html: string, id: string): string {
  const marker = `data-invariant-id="${id}"`;
  const markerOffset = html.indexOf(marker);
  assert(markerOffset >= 0, `${id}: invariant card exists`);
  const start = html.lastIndexOf("<article", markerOffset);
  const end = html.indexOf("</article>", markerOffset);
  assert(start >= 0 && end >= 0, `${id}: invariant card boundary exists`);
  return html.slice(start, end + "</article>".length);
}

function currentEvidenceShape(projection: MethodologyProjection): string {
  const current = projection.versions.find((version) => version.isCurrent);
  assert(current !== undefined, "current methodology version exists for evidence shape");
  return JSON.stringify(current.semanticInvariants.map((invariant) => ({
    id: invariant.id,
    positive: invariant.positive,
    positiveGroups: invariant.positiveGroups,
    negative: invariant.negative,
    requiredExecutableGates: invariant.requiredExecutableGates,
    traceabilitySourcePath: invariant.traceabilitySourcePath,
  })));
}

function withoutRequirement(ir: ObservatorySemanticIr, id: string): ObservatorySemanticIr {
  return Object.freeze({
    ...ir,
    requirements: Object.freeze(ir.requirements.filter((requirement) => requirement.id !== id)),
  });
}

const repositoryRoot = process.cwd();
const index = buildContractObservatoryIndex(repositoryRoot);
const projection = buildMethodologyProjection(repositoryRoot, index);
const semanticIr = loadCompiledMtsSemanticIr(repositoryRoot);
const current = projection.versions.find((version) => version.isCurrent);
const previous = projection.versions.find((version) => version.isPrevious);
const historicalV011 = projection.versions.find((version) => version.contractId === "mts-contract/v0.11");
assert(current !== undefined, "current version exists");
assert(previous !== undefined, "previous version exists");
assert(historicalV011 !== undefined, "historical v0.11 version exists");

same(current.contractId, "mts-contract/v0.15", "current release is v0.15 after S22");
same(current.semanticInvariants.length, 48, "current v0.15 exposes all 48 requirement invariants through traceability authority");
same(current.traceabilityManifestPath, "traceability/mts-v0.15.json", "current v0.15 traceability manifest source is explicit");
assert(!current.unresolvedRelations.includes("traceability-manifest"), "current v0.15 traceability manifest is resolved");

const currentAuthority = current.semanticInvariants.find((invariant) => invariant.id === "V15-AUTH-01");
assert(currentAuthority !== undefined, "current v0.15 authority invariant V15-AUTH-01 is projected");
assert(
  currentAuthority.requiredExecutableGates.includes("ts/test/v015-context-authority-closure-c1.test.ts"),
  "current v0.15 authority invariant is bound to its executable context-authority gate",
);

same(previous.contractId, "mts-contract/v0.14", "previous release is immutable v0.14 evidence");
same(previous.semanticInvariants.length, 14, "previous v0.14 exposes exactly fourteen authority invariants");
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

same(semanticIr.requirements.length, 48, "current native semantic IR has exactly 48 Requirements");
same(
  semanticIr.requirements.reduce((count, requirement) => count + requirement.dependsOn.length, 0),
  33,
  "current native causal display remains exactly 33 depends_on edges",
);
same(currentEvidenceShape(projection), currentEvidenceShape(projection), "current evidence anatomy is deterministic");

const html = renderContractObservatoryHtml(index, projection, semanticIr);
assert(html.includes('data-invariant-id="topLevelDot"'), "topLevelDot has a visible source-derived anatomy card");
assert(html.includes('data-item-id="invariant:topLevelDot"'), "invariant identity participates in shared cross-highlighting");
assert(html.includes("/requiredSemanticLaws/topLevelDot"), "exact contract JSON Pointer is visible");
assert(html.includes(". -&gt; R under TopBind(R,S)"), "resolved contract law is visible without becoming UI authority");
assert(html.includes("traceability/mts-v0.11.json"), "traceability manifest provenance is visible");
assert(html.includes("traceability/mts-v0.12.json"), "v0.12 traceability provenance is visible");
assert(html.includes("traceability/mts-v0.13.json"), "v0.13 traceability provenance is visible");
assert(html.includes("traceability/mts-v0.14.json"), "v0.14 traceability provenance is visible");
assert(html.includes("traceability/mts-v0.15.json"), "v0.15 traceability provenance is visible");
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

const currentJsonInvariant = current.semanticInvariants.find((invariant) => invariant.id === "V15-JSON-02");
const currentJsonRequirement = semanticIr.requirements.find((requirement) => requirement.id === "V15-JSON-02");
assert(currentJsonInvariant !== undefined && currentJsonRequirement !== undefined, "current V15-JSON-02 display sources exist");
const currentJsonCard = invariantCardHtml(html, "V15-JSON-02");
const currentJsonParts = currentJsonCard.split('<details class="raw-provenance">');
same(currentJsonParts.length, 2, "current invariant separates primary semantics from raw provenance");
const currentJsonPrimary = currentJsonParts[0]!;
const currentJsonProvenance = currentJsonParts[1]!;
assert(currentJsonPrimary.includes("Текущее нормативное требование"), "current invariant labels native IR as the current normative requirement");
assert(currentJsonPrimary.includes("Нормативный источник"), "current invariant exposes exact native normative source");
assert(
  currentJsonPrimary.includes(escapeHtmlForAssertion(currentJsonRequirement.statement)),
  "current invariant primary statement comes from compiled native semantic IR",
);
assert(
  currentJsonPrimary.includes(`${currentJsonRequirement.authorityDocument}#${currentJsonRequirement.authorityPointer}`),
  "current invariant primary authority points to exact native .rg /normative",
);
assert(!currentJsonPrimary.includes("<dt>Закон контракта</dt>"), "current invariant no longer presents legacy contract text as current law");
assert(currentJsonProvenance.includes("Принятый legacy-контракт (provenance)"), "legacy contract remains explicitly classified provenance");
assert(currentJsonProvenance.includes("Legacy-текст принятого релиза"), "legacy contract value remains visible in raw provenance");
assert(
  currentJsonProvenance.includes(escapeHtmlForAssertion(currentJsonInvariant.contractValue)),
  "exact accepted legacy contract value remains available as provenance",
);
assert(
  currentJsonProvenance.includes("только provenance; не текущий нормативный источник"),
  "legacy value cannot be mistaken for current semantic authority",
);

const historicalTopLevelCard = invariantCardHtml(html, "topLevelDot");
assert(historicalTopLevelCard.includes("<dt>Закон контракта</dt>"), "historical invariant keeps historical contract-law presentation");
assert(historicalTopLevelCard.includes(". -&gt; R under TopBind(R,S)"), "historical v0.11 exact contract value remains intact");

const fixtureRoot = mkdtempSync(join(repositoryRoot, ".mts-observatory-g3-s2a-"));
try {
  for (const directory of ["contracts", "requirements", "traceability", "cutover"] as const) {
    cpSync(join(repositoryRoot, directory), join(fixtureRoot, directory), { recursive: true });
  }
  cpSync(join(repositoryRoot, "README.md"), join(fixtureRoot, "README.md"));
  mkdirSync(join(fixtureRoot, "ts", "node_modules"), { recursive: true });
  cpSync(join(repositoryRoot, "ts", "dist"), join(fixtureRoot, "ts", "dist"), { recursive: true });
  cpSync(
    join(repositoryRoot, "ts", "node_modules", "yaml"),
    join(fixtureRoot, "ts", "node_modules", "yaml"),
    { recursive: true },
  );

  const fixtureIndex = buildContractObservatoryIndex(fixtureRoot);
  const fixtureProjection = buildMethodologyProjection(fixtureRoot, fixtureIndex);
  const fixtureIr = loadCompiledMtsSemanticIr(fixtureRoot);
  const fixtureHtml = renderContractObservatoryHtml(fixtureIndex, fixtureProjection, fixtureIr);
  const baselineEvidence = currentEvidenceShape(fixtureProjection);
  const baselineHistoricalCard = invariantCardHtml(fixtureHtml, "topLevelDot");
  const targetId = "V15-AND-01";
  const nativeBaseline = fixtureIr.requirements.find((requirement) => requirement.id === targetId);
  const legacyBaseline = fixtureProjection.versions.find((version) => version.isCurrent)
    ?.semanticInvariants.find((invariant) => invariant.id === targetId);
  assert(nativeBaseline !== undefined && legacyBaseline !== undefined, "G3-S2a focused target sources exist");

  // Falsifier A: legacy current contract mutation may change provenance, never current semantic display.
  const contractPath = join(fixtureRoot, "contracts", "mts-contract-v0.15.json");
  const contractSource = readFileSync(contractPath, "utf8");
  try {
    const contract = JSON.parse(contractSource) as any;
    contract.requiredSemanticLaws[targetId] = "G3-S2a legacy provenance mutation";
    writeFileSync(contractPath, JSON.stringify(contract), "utf8");

    const mutatedProjection = buildMethodologyProjection(fixtureRoot, buildContractObservatoryIndex(fixtureRoot));
    const mutatedIr = loadCompiledMtsSemanticIr(fixtureRoot);
    const mutatedHtml = renderContractObservatoryHtml(
      buildContractObservatoryIndex(fixtureRoot),
      mutatedProjection,
      mutatedIr,
    );
    const card = invariantCardHtml(mutatedHtml, targetId);
    const [primary, provenance] = card.split('<details class="raw-provenance">');
    same(
      mutatedIr.requirements.find((requirement) => requirement.id === targetId)?.statement,
      nativeBaseline.statement,
      "falsifier A: legacy contract mutation cannot change current semantic IR",
    );
    assert(primary?.includes(escapeHtmlForAssertion(nativeBaseline.statement)), "falsifier A: primary display remains native");
    assert(!primary?.includes("G3-S2a legacy provenance mutation"), "falsifier A: legacy mutation cannot enter primary current semantics");
    assert(provenance?.includes("G3-S2a legacy provenance mutation"), "falsifier A: legacy mutation remains visible only as provenance");
    same(currentEvidenceShape(mutatedProjection), baselineEvidence, "falsifier A: vector/gate evidence anatomy is unchanged");
  } finally {
    writeFileSync(contractPath, contractSource, "utf8");
  }

  // Falsifier B + D: native-only normative mutation changes current display and cannot affect historical v0.11 anatomy.
  const nativePath = join(fixtureRoot, "requirements", "mts-v0.15", `${targetId}.rg.yaml`);
  const nativeSource = readFileSync(nativePath, "utf8");
  try {
    writeFileSync(
      nativePath,
      nativeSource.replace(/^normative: .+$/m, 'normative: "G3-S2a native-only display mutation"'),
      "utf8",
    );
    const nativeMutatedIr = loadCompiledMtsSemanticIr(fixtureRoot);
    const nativeMutatedProjection = buildMethodologyProjection(fixtureRoot, buildContractObservatoryIndex(fixtureRoot));
    const nativeMutatedHtml = renderContractObservatoryHtml(
      buildContractObservatoryIndex(fixtureRoot),
      nativeMutatedProjection,
      nativeMutatedIr,
    );
    const card = invariantCardHtml(nativeMutatedHtml, targetId);
    const [primary, provenance] = card.split('<details class="raw-provenance">');
    same(
      nativeMutatedIr.requirements.find((requirement) => requirement.id === targetId)?.statement,
      "G3-S2a native-only display mutation",
      "falsifier B: compiler semantic IR follows native-only normative mutation",
    );
    assert(primary?.includes("G3-S2a native-only display mutation"), "falsifier B: current display follows native IR");
    assert(
      provenance?.includes(escapeHtmlForAssertion(legacyBaseline.contractValue)),
      "falsifier B: accepted legacy value remains unchanged provenance without synchronization",
    );
    same(
      invariantCardHtml(nativeMutatedHtml, "topLevelDot"),
      baselineHistoricalCard,
      "falsifier D: native v0.15 currentization cannot alter historical v0.11 invariant anatomy",
    );
    same(currentEvidenceShape(nativeMutatedProjection), baselineEvidence, "falsifier B: vector/gate evidence anatomy is unchanged");
  } finally {
    writeFileSync(nativePath, nativeSource, "utf8");
  }

  // Falsifier C: missing/duplicate/mismatched current native IR must fail closed with no contractValue fallback.
  throws(
    () => renderContractObservatoryHtml(fixtureIndex, fixtureProjection, withoutRequirement(fixtureIr, targetId)),
    "falsifier C: missing current semantic IR Requirement fails closed",
  );
  const duplicateIr = Object.freeze({
    ...fixtureIr,
    requirements: Object.freeze([...fixtureIr.requirements, fixtureIr.requirements[0]!]),
  });
  throws(
    () => renderContractObservatoryHtml(fixtureIndex, fixtureProjection, duplicateIr),
    "falsifier C: duplicate current semantic IR Requirement ID fails closed",
  );
  const mismatchedIr = Object.freeze({
    ...fixtureIr,
    contract: "mts-contract/v0.14",
  });
  throws(
    () => renderContractObservatoryHtml(fixtureIndex, fixtureProjection, mismatchedIr),
    "falsifier C: current methodology/semantic IR release mismatch fails closed",
  );
} finally {
  rmSync(fixtureRoot, { recursive: true, force: true });
}

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
const maliciousHtml = renderContractObservatoryHtml(index, maliciousProjection, semanticIr);
assert(!maliciousHtml.includes(maliciousLaw), "malicious invariant source text never survives as raw markup");
assert(
  maliciousHtml.includes("&lt;img src=x onerror=&quot;alert(&#39;mts&#39;)&quot;&gt;"),
  "malicious invariant source text is escaped in anatomy",
);

console.log("Contract Observatory V4d invariant traceability and anatomy specification passed.");
