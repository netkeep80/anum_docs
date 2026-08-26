import type { ContractObservatoryIndex, ContractVersionSummary } from "./contract-index.js";
import {
  METHODOLOGY_STAGE_ORDER,
  buildInteractiveMethodologyModel,
  type ObservatoryInteractionState,
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
  const selectedVersionId = projection.versions.find((entry) => entry.isCurrent)?.contractId ?? projection.versions[0]?.contractId ?? null;
  const state: ObservatoryInteractionState = Object.freeze({ selectedVersionId, selectedStage: null, selectedItemId: null, filters: Object.freeze([]), viewport: Object.freeze({ x: 0, y: 0, scale: 1 }) });
  const model = buildInteractiveMethodologyModel(projection, state);
  const stageControls = model.stages.map((entry) => `<button type="button" data-methodology-stage="${entry.stage}" aria-pressed="false" title="Lifecycle stage: ${entry.stage}; derived presentation state">${escapeHtml(entry.stage)}</button>`).join("\n");
  const lanes = model.versions.map((entry, ordinal) => renderMethodologyLane(projection.versions[ordinal]!, entry)).join("\n");
  const controllerData = projection.versions.map((version, ordinal) => ({ id: version.contractId, classification: model.versions[ordinal]!.classification.toLowerCase(), itemIds: methodologyItemIds(version) }));

  return `    <section class="methodology-map" aria-labelledby="methodology-title">
      <div class="methodology-heading"><p class="eyebrow">Primary explanatory view · derived methodology</p><h2 id="methodology-title">Methodology map + version lifecycle lanes</h2><p>Две координированные, но не тождественные структуры: метод разработки и состояние жизненного цикла версии.</p></div>
      <ol class="method-chain" aria-label="Method chain"><li>Theory</li><li>Contract</li><li>Conformance</li><li>Challenge</li><li>Model/Replay</li><li>Acceptance</li><li>Current</li></ol>
      <div class="methodology-authority" aria-label="Relation authority"><span>Method/lifecycle relation: derived presentation relation</span><span>Traceability/evidence relation: source-derived reference</span><span>Semantic topology Link: not rendered in this view</span></div>
      <div class="methodology-controls">
        <div class="stage-controls" role="group" aria-label="Methodology stages">${stageControls}</div>
        <div class="filter-controls" role="group" aria-label="Version and evidence filters">${renderFilterButton("current", "CURRENT")}${renderFilterButton("previous", "PREVIOUS")}${renderFilterButton("candidate", "CANDIDATE")}${renderFilterButton("accepted", "ACCEPTED")}${renderFilterButton("positive", "POSITIVE")}${renderFilterButton("negative", "NEGATIVE")}${renderFilterButton("evidence", "EVIDENCE")}</div>
        <div class="viewport-controls" role="group" aria-label="Map viewport"><button type="button" data-viewport-action="zoom-out" aria-label="Zoom out">−</button><button type="button" data-viewport-action="reset">Reset viewport</button><button type="button" data-viewport-action="zoom-in" aria-label="Zoom in">+</button></div>
      </div>
      <div class="methodology-grid" tabindex="0" aria-label="Version lifecycle lanes">${lanes}</div>
      <p class="methodology-status" aria-live="polite"></p>
    </section>
${renderMethodologyController(controllerData, selectedVersionId)}`;
}

function renderMethodologyLane(projection: MethodologyVersionProjection, model: ReturnType<typeof buildInteractiveMethodologyModel>["versions"][number]): string {
  const evidenceByStage = new Map(projection.lifecycle.map((entry) => [entry.stage, entry.evidence.length] as const));
  const stages = model.stageStates.map((entry) => `<div class="stage-cell${entry.present ? " present" : ""}" data-lane-stage="${entry.stage}" title="${entry.stage}: ${entry.present ? "source evidence present" : "no linked source evidence"}"><span>${escapeHtml(entry.stage)}</span><span class="stage-evidence">${entry.present ? `${evidenceByStage.get(entry.stage) ?? 0} evidence` : "—"}</span></div>`).join("\n");
  const categories = methodologyCategories(projection, model.classification.toLowerCase()).join(" ");
  const evidenceItems = methodologyItemIds(projection).slice(0, 6).map((id) => `<button type="button" data-item-id="${escapeAttribute(id)}" aria-pressed="false" title="Traceability/evidence reference; presentation-only">${escapeHtml(id)}</button>`).join("");
  return `<div class="methodology-lane${model.selected ? " selected" : ""}" data-version-lane="${escapeAttribute(model.contractId)}" data-categories="${categories}"><div class="lane-version"><button type="button" class="version-select" data-version-id="${escapeAttribute(model.contractId)}" aria-pressed="${model.selected ? "true" : "false"}" title="Select version and synchronize Observatory views">${escapeHtml(model.contractId)}</button><span class="lane-classification">${model.classification}</span></div>${stages}<div class="evidence-items" aria-label="Evidence references for ${escapeAttribute(model.contractId)}">${evidenceItems || "<span>No linked evidence references</span>"}</div></div>`;
}

function methodologyItemIds(version: MethodologyVersionProjection): string[] {
  return [...new Set([...version.theoryReferences.map((entry) => entry.id), ...version.contractReferences.map((entry) => entry.id), ...version.positiveVectors.map((entry) => entry.id), ...version.negativeVectors.map((entry) => entry.id), ...version.evidenceReferences.map((entry) => entry.id), ...version.acceptanceReferences.map((entry) => entry.id)])].sort((a, b) => a.localeCompare(b));
}

function methodologyCategories(version: MethodologyVersionProjection, classification: string): string[] {
  const values = [classification];
  if (version.accepted) values.push("accepted");
  if (version.positiveVectors.length > 0) values.push("positive");
  if (version.negativeVectors.length > 0) values.push("negative");
  if (version.evidenceReferences.length > 0) values.push("evidence");
  return [...new Set(values)].sort();
}

function renderFilterButton(filter: string, label: string): string { return `<button type="button" data-methodology-filter="${filter}" aria-pressed="false">${label}</button>`; }

function renderMethodologyController(versions: readonly { readonly id: string; readonly classification: string; readonly itemIds: readonly string[] }[], defaultVersionId: string | null): string {
  const data = escapeJsonForScript(JSON.stringify({ versions, stages: METHODOLOGY_STAGE_ORDER, defaultVersionId, filters: ["accepted", "candidate", "current", "evidence", "negative", "positive", "previous"] }));
  return `    <script>
(() => {
  "use strict";
  const map = document.querySelector(".methodology-map");
  if (!map) return;
  const grid = map.querySelector(".methodology-grid");
  const config = ${data};
  const versionIds = new Set(config.versions.map((entry) => entry.id));
  const itemIds = new Set(config.versions.flatMap((entry) => entry.itemIds));
  const stages = new Set(config.stages);
  const filters = new Set(config.filters);
  const number = (value, fallback) => { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; };

  const readState = () => {
    const params = new URLSearchParams(location.hash.startsWith("#") ? location.hash.slice(1) : location.hash);
    const requestedVersion = params.get("v");
    const requestedStage = params.get("s");
    const requestedItem = params.get("item");
    return { versionId: versionIds.has(requestedVersion) ? requestedVersion : config.defaultVersionId, stage: stages.has(requestedStage) ? requestedStage : null, item: itemIds.has(requestedItem) ? requestedItem : null, filters: [...new Set(params.getAll("f").filter((value) => filters.has(value)))].sort(), x: number(params.get("x"), 0), y: number(params.get("y"), 0), z: Math.min(1.8, Math.max(.7, number(params.get("z"), 1))) };
  };
  const writeState = (mutate, replace = false) => { const params = new URLSearchParams(location.hash.startsWith("#") ? location.hash.slice(1) : location.hash); mutate(params); const next = params.toString(); if (replace) history.replaceState(null, "", location.pathname + location.search + (next ? "#" + next : "#")); else location.hash = next ? "#" + next : "#"; };

  const apply = () => {
    const state = readState();
    map.querySelectorAll("[data-methodology-stage]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.methodologyStage === state.stage)));
    map.querySelectorAll("[data-methodology-filter]").forEach((button) => button.setAttribute("aria-pressed", String(state.filters.includes(button.dataset.methodologyFilter))));
    map.querySelectorAll("[data-item-id]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.itemId === state.item)));
    map.querySelectorAll("[data-version-lane]").forEach((lane) => { const selected = lane.dataset.versionLane === state.versionId; const categories = (lane.dataset.categories || "").split(" "); const visible = state.filters.length === 0 || state.filters.every((value) => categories.includes(value)); lane.hidden = !visible; lane.classList.toggle("selected", selected); lane.querySelector("[data-version-id]")?.setAttribute("aria-pressed", String(selected)); lane.querySelectorAll("[data-lane-stage]").forEach((cell) => cell.classList.toggle("stage-selected", cell.dataset.laneStage === state.stage)); });
    document.querySelectorAll("[data-overview-version-id]").forEach((node) => node.classList.toggle("selection-synced", node.dataset.overviewVersionId === state.versionId));
    if (grid) { grid.style.zoom = String(state.z); grid.scrollLeft = state.x; grid.scrollTop = state.y; }
    const status = map.querySelector(".methodology-status");
    if (status) status.textContent = "Selected: " + (state.versionId ?? "none") + "; stage: " + (state.stage ?? "all") + "; item: " + (state.item ?? "none") + "; filters: " + (state.filters.join(", ") || "none") + "; zoom: " + state.z + ".";
  };

  map.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target.closest("button") : null;
    if (!(target instanceof HTMLButtonElement)) return;
    if (target.dataset.methodologyStage) { const stage = target.dataset.methodologyStage; const active = target.getAttribute("aria-pressed") === "true"; writeState((params) => active ? params.delete("s") : params.set("s", stage)); }
    else if (target.dataset.versionId) writeState((params) => params.set("v", target.dataset.versionId));
    else if (target.dataset.itemId) writeState((params) => params.set("item", target.dataset.itemId));
    else if (target.dataset.methodologyFilter) { const filter = target.dataset.methodologyFilter; writeState((params) => { const values = new Set(params.getAll("f").filter((value) => filters.has(value))); values.has(filter) ? values.delete(filter) : values.add(filter); params.delete("f"); [...values].sort().forEach((value) => params.append("f", value)); }); }
    else if (target.dataset.viewportAction) writeState((params) => { const state = readState(); if (target.dataset.viewportAction === "reset") { params.delete("x"); params.delete("y"); params.delete("z"); } else params.set("z", String(Math.min(1.8, Math.max(.7, state.z + (target.dataset.viewportAction === "zoom-in" ? .1 : -.1))))); });
  });
  map.addEventListener("keydown", (event) => { if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "Enter"].includes(event.key)) return; const target = event.target; if (!(target instanceof HTMLButtonElement)) return; if (event.key === "Enter") { target.click(); return; } const buttons = [...map.querySelectorAll("button:not([hidden])")].filter((button) => !button.closest("[hidden]")); const current = buttons.indexOf(target); if (current < 0 || buttons.length === 0) return; event.preventDefault(); let next = current; if (event.key === "Home") next = 0; else if (event.key === "End") next = buttons.length - 1; else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (current - 1 + buttons.length) % buttons.length; else next = (current + 1) % buttons.length; buttons[next]?.focus(); });
  grid?.addEventListener("scroll", () => writeState((params) => { if (grid.scrollLeft) params.set("x", String(Math.round(grid.scrollLeft))); else params.delete("x"); if (grid.scrollTop) params.set("y", String(Math.round(grid.scrollTop))); else params.delete("y"); }, true));
  window.addEventListener("hashchange", apply);
  apply();
})();
    </script>`;
}

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
function escapeJsonForScript(value: string): string { return value.replaceAll("<", "\\u003c").replaceAll(">", "\\u003e").replaceAll("&", "\\u0026"); }
function escapeHtml(value: string): string { return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("\"", "&quot;").replaceAll("'", "&#39;"); }
