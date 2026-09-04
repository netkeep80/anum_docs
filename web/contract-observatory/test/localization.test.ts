import { buildContractObservatoryIndex } from "../src/contract-index.js";
import { renderObservatoryBrowserControllerScript } from "../src/browser-controller.js";
import {
  METHODOLOGY_STAGE_ORDER,
  OBSERVATORY_FILTERS,
  type ObservatoryInteractionConfig,
} from "../src/interaction.js";
import { buildMethodologyProjection } from "../src/methodology-projection.js";
import { renderContractObservatoryHtml } from "../src/site.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Contract Observatory RU: ${message}`);
}

const repositoryRoot = process.cwd();
const index = buildContractObservatoryIndex(repositoryRoot);
const projection = buildMethodologyProjection(repositoryRoot, index);
const html = renderContractObservatoryHtml(index, projection);

for (const marker of [
  "<title>Обозреватель контрактов МТС</title>",
  "<h1>Обозреватель контрактов МТС</h1>",
  ">Хронология<",
  ">Обзор версий<",
  "Карта методологии и жизненного цикла версий",
  "Теория",
  "Контракт",
  "Соответствие",
  "Приёмка",
  "ТЕКУЩАЯ",
  "ПРЕДЫДУЩАЯ",
  "Исходные связи трассируемости",
]) {
  assert(html.includes(marker), `missing Russian presentation marker: ${marker}`);
}

for (const legacyMarker of [
  "MTS Contract Observatory",
  "Contract Observatory</h1>",
  ">Timeline<",
  ">Version Overview<",
  "Primary explanatory view",
  "Methodology map + version lifecycle lanes",
  ">Theory<",
  ">Contract<",
  ">Conformance<",
  ">Challenge<",
  ">Model/Replay<",
  ">Acceptance<",
  ">Current<",
  "Method/lifecycle relation",
  "Traceability/evidence relation",
  "Semantic topology Link: not rendered in this view",
  "Methodology stages",
  "Version and evidence filters",
  "Reset viewport",
  "Invariant anatomy",
  "Source-derived provenance view",
  "Contract path",
  "Contract JSON Pointer",
  "Contract law",
  "Conformance path",
  "Theory reference",
  "Genesis vectors",
  "Meaning vectors",
  "Compatibility vectors",
  "Negative vectors",
  "Executable gates",
  "Existing evidence",
  "Acceptance provenance",
  "Raw provenance",
  "Source-derived traceability relations",
  "Evidence/source endpoint",
  "Obligation/target endpoint",
  "Generated deterministically",
]) {
  assert(!html.includes(legacyMarker), `legacy English UI marker remains: ${legacyMarker}`);
}

const config: ObservatoryInteractionConfig = Object.freeze({
  versions: Object.freeze([
    Object.freeze({
      id: "mts-contract/v0.11",
      categories: Object.freeze(["accepted", "current", "evidence", "negative"]),
      itemIds: Object.freeze(["vector:v011-example"]),
      relations: Object.freeze([]),
    }),
  ]),
  defaultVersionId: "mts-contract/v0.11",
  stages: METHODOLOGY_STAGE_ORDER,
  filters: OBSERVATORY_FILTERS,
  minScale: 0.7,
  maxScale: 1.8,
  zoomStep: 0.1,
});
const browserScript = renderObservatoryBrowserControllerScript(config);
assert(browserScript.includes("Выбрано:"), "dynamic browser status is Russian");
assert(!browserScript.includes("Selected:"), "legacy English dynamic browser status is absent");
for (const marker of [
  'case "accepted": return "Принято"',
  'case "released": return "Выпущено"',
  'case "current": return "текущие"',
  'case "evidence": return "со свидетельствами"',
  'case "negative": return "отрицательные"',
]) {
  assert(browserScript.includes(marker), `dynamic status enum presentation is localized: ${marker}`);
}

console.log("Contract Observatory Russian presentation specification passed.");
