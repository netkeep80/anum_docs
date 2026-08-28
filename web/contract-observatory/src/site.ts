import { renderObservatoryBrowserControllerScript } from "./browser-controller.js";
import type { ContractObservatoryIndex, ContractVersionSummary } from "./contract-index.js";
import {
  OBSERVATORY_FILTERS,
  buildInteractiveMethodologyModel,
  buildObservatoryInteractionConfig,
  createObservatoryInteractionKernel,
  type ObservatoryInteractionVersionConfig,
} from "./interaction.js";
import type { MethodologyProjection, MethodologyVersionProjection } from "./methodology-projection.js";

export function renderContractObservatoryHtml(
  index: ContractObservatoryIndex,
  methodology?: MethodologyProjection,
): string {
  const interactive = methodology !== undefined;
  const timeline = index.versions.map((version, ordinal) => renderTimelineItem(version, ordinal, interactive)).join("\n");
  const versions = index.versions.map((version, ordinal) => renderVersionSection(version, ordinal)).join("\n");
  const methodologyMap = methodology === undefined ? "" : renderMethodologyMap(methodology);

  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>MTS Contract Observatory</title>
  <style>
    :root { color-scheme: light dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; background: Canvas; color: CanvasText; }
    a { color: LinkText; }
    a:focus-visible, summary:focus-visible, button:focus-visible { outline: 3px solid Highlight; outline-offset: 3px; }
    button { font: inherit; color: inherit; }
    .shell { width: min(1120px, calc(100% - 2rem)); margin: 0 auto; padding: 2rem 0 4rem; }
    .hero { display: grid; gap: .8rem; margin-bottom: 2rem; }
    .eyebrow { margin: 0; font-size: .8rem; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; opacity: .7; }
    h1 { margin: 0; font-size: clamp(2rem, 6vw, 4.5rem); line-height: .95; max-width: 12ch; }
    .lede { margin: 0; max-width: 72ch; line-height: 1.6; opacity: .82; }
    .provenance { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .75rem; margin: 1.5rem 0 2rem; }
    .provenance div, .version-card, .methodology-map { border: 1px solid color-mix(in srgb, CanvasText 18%, transparent); border-radius: 1rem; background: color-mix(in srgb, Canvas 94%, CanvasText 6%); }
    .provenance div { padding: .9rem 1rem; min-width: 0; }
    dt { font-size: .72rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; opacity: .65; }
    dd { margin: .35rem 0 0; overflow-wrap: anywhere; }
    .methodology-map { padding: 1.2rem; margin: 0 0 2.5rem; }
    .methodology-heading { display: grid; gap: .5rem; margin-bottom: 1rem; }
    .methodology-heading h2 { margin: 0; font-size: 1.7rem; }
    .methodology-heading p { margin: 0; max-width: 80ch; line-height: 1.5; opacity: .8; }
    .method-chain { display: grid; grid-template-columns: repeat(7, minmax(105px, 1fr)); gap: .35rem; padding: 0; margin: .8rem 0 1rem; list-style: none; overflow-x: auto; }
    .method-chain li { min-width: 105px; padding: .65rem; border: 1px solid color-mix(in srgb, CanvasText 20%, transparent); border-radius: .65rem; text-align: center; font-weight: 700; }
    .methodology-authority { display: flex; flex-wrap: wrap; gap: .5rem; margin: .8rem 0 1rem; font-size: .82rem; }
    .methodology-authority span { padding: .35rem .55rem; border: 1px solid color-mix(in srgb, CanvasText 22%, transparent); border-radius: .6rem; }
    .methodology-controls { display: grid; gap: .8rem; margin-bottom: 1rem; }
    .stage-controls, .filter-controls, .viewport-controls, .evidence-items { display: flex; flex-wrap: wrap; gap: .45rem; }
    .stage-controls button, .filter-controls button, .viewport-controls button, .version-select, .evidence-items button { cursor: pointer; border: 1px solid color-mix(in srgb, CanvasText 24%, transparent); border-radius: .65rem; background: Canvas; padding: .5rem .7rem; }
    button[aria-pressed="true"] { border-width: 2px; font-weight: 800; }
    .methodology-grid { display: grid; gap: .65rem; overflow: auto; padding-bottom: .25rem; }
    .methodology-lane { min-width: 780px; display: grid; grid-template-columns: minmax(190px, 1.4fr) repeat(7, minmax(72px, 1fr)); gap: .35rem; align-items: stretch; padding: .5rem; border: 1px solid color-mix(in srgb, CanvasText 15%, transparent); border-radius: .8rem; }
    .methodology-lane.selected, .methodology-lane.selection-synced { border-width: 2px; }
    .lane-version { display: grid; gap: .3rem; align-content: center; min-width: 0; }
    .version-select { text-align: left; overflow-wrap: anywhere; }
    .lane-classification { font-size: .72rem; font-weight: 800; letter-spacing: .05em; }
    .stage-cell { display: grid; place-items: center; min-height: 4.25rem; border: 1px dashed color-mix(in srgb, CanvasText 16%, transparent); border-radius: .65rem; padding: .35rem; text-align: center; font-size: .72rem; opacity: .45; }
    .stage-cell.present { border-style: solid; opacity: 1; }
    .stage-cell.stage-selected { border-width: 2px; font-weight: 800; }
    .stage-evidence { display: block; margin-top: .2rem; font-size: .65rem; opacity: .7; }
    .evidence-items { grid-column: 1 / -1; padding-top: .25rem; }
    .evidence-items button { padding: .3rem .5rem; font-size: .7rem; overflow-wrap: anywhere; }
    .methodology-status { margin: .8rem 0 0; min-height: 1.3em; font-size: .82rem; opacity: .75; }
    .timeline { margin: 0 0 2.5rem; }
    .timeline h2, .versions h2 { margin: 0 0 1rem; font-size: 1.5rem; }
    .timeline ol { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: .8rem; padding: 0; margin: 0; list-style: none; }
    .timeline a { display: grid; gap: .5rem; min-height: 8rem; padding: 1rem; border: 1px solid color-mix(in srgb, CanvasText 18%, transparent); border-radius: 1rem; color: inherit; text-decoration: none; background: color-mix(in srgb, Canvas 96%, CanvasText 4%); }
    .timeline a:hover { border-color: color-mix(in srgb, CanvasText 45%, transparent); }
    .timeline .current, .timeline .selection-synced { border-width: 2px; }
    .timeline-id { font-weight: 800; overflow-wrap: anywhere; }
    .badges { display: flex; flex-wrap: wrap; gap: .35rem; align-items: center; }
    .badge { display: inline-flex; align-items: center; min-height: 1.7rem; padding: .2rem .55rem; border: 1px solid currentColor; border-radius: 999px; font-size: .72rem; font-weight: 800; letter-spacing: .04em; }
    .badge-muted { opacity: .65; }
    .version-list { display: grid; gap: 1rem; }
    .version-card { overflow: hidden; }
    .version-card.current, .version-card.selection-synced { border-width: 2px; }
    .version-card summary { cursor: pointer; display: flex; flex-wrap: wrap; gap: .7rem; justify-content: space-between; align-items: center; padding: 1rem 1.2rem; font-weight: 800; }
    .version-body { padding: 0 1.2rem 1.2rem; }
    .metric-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: .7rem; margin: .4rem 0 1rem; }
    .metric { padding: .8rem; border-radius: .8rem; background: color-mix(in srgb, Canvas 90%, CanvasText 10%); }
    .metric strong { display: block; margin-top: .25rem; font-size: 1.15rem; overflow-wrap: anywhere; }
    table { width: 100%; border-collapse: collapse; font-size: .92rem; }
    th, td { padding: .65rem .4rem; border-top: 1px solid color-mix(in srgb, CanvasText 15%, transparent); text-align: left; vertical-align: top; }
    th { width: 13rem; font-weight: 700; }
    td { overflow-wrap: anywhere; }
    .footer { margin-top: 2.5rem; font-size: .85rem; opacity: .7; }
    @media (prefers-reduced-motion: reduce) { * { scroll-behavior: auto !important; } }
    @media (max-width: 680px) { .shell { width: min(100% - 1rem, 1120px); padding-top: 1rem; } .provenance { grid-template-columns: 1fr; } .methodology-map { padding: .8rem; } th, td { display: block; width: 100%; padding-left: 0; padding-right: 0; } th { border-bottom: 0; padding-bottom: .2rem; } td { border-top: 0; padding-top: 0; } }
  </style>
</head>
<body>
  <div class="shell">
    <header class="hero"><p class="eyebrow">MTS · derived evidence</p><h1>Contract Observatory</h1><p class="lede">Статическое представление contract/conformance evidence. Эта страница является производной навигацией и не является источником семантики МТС.</p></header>
    <dl class="provenance" aria-label="Provenance">${renderDefinition("Index schema", index.schema)}${renderDefinition("Acceptance", index.acceptancePath)}${renderDefinition("Current contract", index.currentContractPath)}${renderDefinition("Previous contract", index.previousContractPath)}</dl>
${methodologyMap}
    <nav class="timeline" aria-labelledby="timeline-title"><h2 id="timeline-title">Timeline</h2><ol>${timeline}</ol></nav>
    <main class="versions" aria-labelledby="versions-title"><h2 id="versions-title">Version Overview</h2><div class="version-list">${versions}</div></main>
    <footer class="footer">Generated deterministically from ContractObservatoryIndex. Presentation is non-normative.</footer>
  </div>
</body>
</html>
`;
}

function renderMethodologyMap(projection: MethodologyProjection): string {
  const config = buildObservatoryInteractionConfig(projection);
  const state = createObservatoryInteractionKernel(config).initialState();
  const model = buildInteractiveMethodologyModel(projection, state);
  const stageControls = model.stages.map((entry) => `<button type="button" data-methodology-stage="${entry.stage}" aria-pressed="false" title="Lifecycle stage: ${entry.stage}; derived presentation state">${escapeHtml(entry.stage)}</button>`).join("\n");
  const filterControls = OBSERVATORY_FILTERS.map((filter) => renderFilterButton(filter, filter.toUpperCase())).join("");
  const lanes = model.versions.map((entry, ordinal) => renderMethodologyLane(
    projection.versions[ordinal]!,
    entry,
    config.versions[ordinal]!,
  )).join("\n");

  return `    <section class="methodology-map" aria-labelledby="methodology-title">
      <div class="methodology-heading"><p class="eyebrow">Primary explanatory view · derived methodology</p><h2 id="methodology-title">Methodology map + version lifecycle lanes</h2><p>Две координированные, но не тождественные структуры: метод разработки и состояние жизненного цикла версии.</p></div>
      <ol class="method-chain" aria-label="Method chain"><li>Theory</li><li>Contract</li><li>Conformance</li><li>Challenge</li><li>Model/Replay</li><li>Acceptance</li><li>Current</li></ol>
      <div class="methodology-authority" aria-label="Relation authority"><span>Method/lifecycle relation: derived presentation relation</span><span>Traceability/evidence relation: source-derived reference</span><span>Semantic topology Link: not rendered in this view</span></div>
      <div class="methodology-controls">
        <div class="stage-controls" role="group" aria-label="Methodology stages">${stageControls}</div>
        <div class="filter-controls" role="group" aria-label="Version and evidence filters">${filterControls}</div>
        <div class="viewport-controls" role="group" aria-label="Map viewport"><button type="button" data-viewport-action="zoom-out" aria-label="Zoom out">−</button><button type="button" data-viewport-action="reset">Reset viewport</button><button type="button" data-viewport-action="zoom-in" aria-label="Zoom in">+</button></div>
      </div>
      <div class="methodology-grid" tabindex="0" aria-label="Version lifecycle lanes">${lanes}</div>
      <p class="methodology-status" aria-live="polite"></p>
    </section>
${renderObservatoryBrowserControllerScript(config)}`;
}

function renderMethodologyLane(
  projection: MethodologyVersionProjection,
  model: ReturnType<typeof buildInteractiveMethodologyModel>["versions"][number],
  config: ObservatoryInteractionVersionConfig,
): string {
  const evidenceByStage = new Map(projection.lifecycle.map((entry) => [entry.stage, entry.evidence.length] as const));
  const stages = model.stageStates.map((entry) => `<div class="stage-cell${entry.present ? " present" : ""}" data-lane-stage="${entry.stage}" title="${entry.stage}: ${entry.present ? "source evidence present" : "no linked source evidence"}"><span>${escapeHtml(entry.stage)}</span><span class="stage-evidence">${entry.present ? `${evidenceByStage.get(entry.stage) ?? 0} evidence` : "—"}</span></div>`).join("\n");
  const evidenceItems = config.itemIds.slice(0, 6).map((id) => `<button type="button" data-item-id="${escapeAttribute(id)}" aria-pressed="false" title="Traceability/evidence reference; presentation-only">${escapeHtml(id)}</button>`).join("");
  return `<div class="methodology-lane${model.selected ? " selected" : ""}" data-version-lane="${escapeAttribute(model.contractId)}"><div class="lane-version"><button type="button" class="version-select" data-version-id="${escapeAttribute(model.contractId)}" aria-pressed="${model.selected ? "true" : "false"}" title="Select version and synchronize Observatory views">${escapeHtml(model.contractId)}</button><span class="lane-classification">${model.classification}</span></div>${stages}<div class="evidence-items" aria-label="Evidence references for ${escapeAttribute(model.contractId)}">${evidenceItems || "<span>No linked evidence references</span>"}</div></div>`;
}

function renderFilterButton(filter: string, label: string): string { return `<button type="button" data-methodology-filter="${filter}" aria-pressed="false">${label}</button>`; }

function renderTimelineItem(version: ContractVersionSummary, ordinal: number, interactive: boolean): string {
  const anchor = anchorId(ordinal); const classification = classify(version); const semanticDelta = version.observableSemanticDelta ? "SEMANTIC DELTA" : "NO SEMANTIC DELTA"; const href = interactive ? `#v=${encodeURIComponent(version.contractId)}` : `#${anchor}`;
  return `<li><a href="${href}" class="${version.isCurrent ? "current" : ""}" data-overview-version-id="${escapeAttribute(version.contractId)}"${version.isCurrent ? " aria-current=\"page\"" : ""}><span class="timeline-id">${escapeHtml(version.contractId)}</span><span class="badges">${badge(classification, false)}${badge(version.status.toUpperCase(), true)}${badge(version.accepted ? "ACCEPTED" : "NOT ACCEPTED", true)}${badge(semanticDelta, true)}</span></a></li>`;
}

function renderVersionSection(version: ContractVersionSummary, ordinal: number): string {
  const anchor = anchorId(ordinal); const issueRows = [version.issue === undefined ? "" : renderRow("Issue", `#${version.issue}`), version.candidateLifecycleIssue === undefined ? "" : renderRow("Candidate lifecycle issue", `#${version.candidateLifecycleIssue}`)].filter(Boolean).join("\n");
  return `<section id="${anchor}" class="version-card${version.isCurrent ? " current" : ""}" data-overview-version-id="${escapeAttribute(version.contractId)}" aria-labelledby="${anchor}-title"><details${version.isCurrent ? " open" : ""}><summary><span id="${anchor}-title">${escapeHtml(version.contractId)}</span><span class="badges">${badge(classify(version), false)} ${badge(version.status.toUpperCase(), true)}</span></summary><div class="version-body"><div class="metric-grid">${metric("Accepted", yesNo(version.accepted))}${metric("Acceptance ready", yesNo(version.acceptanceReady))}${metric("Coverage", version.coverageState)}${metric("Executable gates", String(version.requiredExecutableGateCount))}${metric("Negative vectors", String(version.requiredNegativeVectorCount))}${metric("Observable semantic delta", yesNo(version.observableSemanticDelta))}</div><table><tbody>${renderRow("Contract", version.contractId)}${renderRow("Conformance", version.conformanceId)}${renderRow("Semantic base", version.semanticBase)}${renderRow("Contract path", version.contractPath)}${renderRow("Conformance path", version.conformancePath)}${renderRow("Classification", classify(version))}${issueRows}</tbody></table></div></details></section>`;
}

function renderDefinition(label: string, value: string): string { return `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`; }
function renderRow(label: string, value: string): string { return `<tr><th scope="row">${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`; }
function metric(label: string, value: string): string { return `<div class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`; }
function badge(value: string, muted: boolean): string { return `<span class="badge${muted ? " badge-muted" : ""}">${escapeHtml(value)}</span>`; }
function classify(version: ContractVersionSummary): string { if (version.isCurrent) return "CURRENT"; if (version.isPrevious) return "PREVIOUS"; return "LIVE"; }
function yesNo(value: boolean): string { return value ? "YES" : "NO"; }
function anchorId(ordinal: number): string { return `version-${ordinal + 1}`; }
function escapeAttribute(value: string): string { return escapeHtml(value); }
function escapeHtml(value: string): string { return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("\"", "&quot;").replaceAll("'", "&#39;"); }
