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
    .trace-highlighted { outline: 2px solid Highlight; outline-offset: 2px; }
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
    .invariant-anatomy { margin-top: 1rem; padding: .9rem; border: 1px solid color-mix(in srgb, CanvasText 16%, transparent); border-radius: .8rem; }
    .invariant-anatomy h3 { margin: 0 0 .35rem; }
    .invariant-anatomy > p { margin: 0 0 .7rem; opacity: .75; }
    .invariant-cards { display: grid; gap: .7rem; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); }
    .invariant-card { min-width: 0; padding: .8rem; border: 1px solid color-mix(in srgb, CanvasText 15%, transparent); border-radius: .75rem; background: color-mix(in srgb, Canvas 97%, CanvasText 3%); }
    .invariant-card h4 { margin: 0 0 .6rem; }
    .invariant-select, .trace-node { cursor: pointer; border: 1px solid color-mix(in srgb, CanvasText 24%, transparent); border-radius: .55rem; background: Canvas; padding: .35rem .5rem; overflow-wrap: anywhere; text-align: left; }
    .invariant-meta { display: grid; grid-template-columns: minmax(8rem, .7fr) minmax(0, 1.8fr); gap: .35rem .7rem; margin: 0 0 .7rem; font-size: .8rem; }
    .invariant-meta dt { opacity: .7; }
    .invariant-meta dd { margin: 0; }
    .trace-group { margin-top: .55rem; }
    .trace-group h5 { margin: 0 0 .3rem; font-size: .78rem; }
    .trace-list { display: flex; flex-wrap: wrap; gap: .3rem; align-items: center; }
    .trace-node { font-size: .72rem; }
    .trace-none { font-size: .74rem; font-style: italic; opacity: .62; }
    .raw-provenance { margin-top: .65rem; font-size: .78rem; }
    .raw-provenance summary { cursor: pointer; font-weight: 700; }
    .traceability-table { margin-top: .8rem; }
    .traceability-table summary { cursor: pointer; font-weight: 800; }
    .traceability-table table { margin-top: .5rem; font-size: .78rem; }
    .traceability-table th { width: auto; }
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
    @media (max-width: 680px) { .shell { width: min(100% - 1rem, 1120px); padding-top: 1rem; } .provenance { grid-template-columns: 1fr; } .methodology-map { padding: .8rem; } .invariant-meta { grid-template-columns: 1fr; } th, td { display: block; width: 100%; padding-left: 0; padding-right: 0; } th { border-bottom: 0; padding-bottom: .2rem; } td { border-top: 0; padding-top: 0; } }
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
  const anatomy = projection.versions.map(renderInvariantAnatomy).join("\n");

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
${anatomy}
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

function renderInvariantAnatomy(version: MethodologyVersionProjection): string {
  const manifest = version.traceabilityManifestPath ?? "none";
  const cards = version.semanticInvariants.map((invariant) => renderInvariantCard(version, invariant)).join("\n");
  const missing = version.semanticInvariants.length === 0
    ? `<p class="trace-none">No source-linked semantic invariants. Traceability manifest: ${escapeHtml(manifest)}.</p>`
    : "";
  return `      <section class="invariant-anatomy" data-traceability-version="${escapeAttribute(version.contractId)}" aria-label="Invariant anatomy for ${escapeAttribute(version.contractId)}"><h3>Invariant anatomy · ${escapeHtml(version.contractId)}</h3><p>Source-derived provenance view. Traceability manifest: ${escapeHtml(manifest)}. Missing relations remain explicit.</p>${missing}<div class="invariant-cards">${cards}</div>${renderTraceabilityTable(version)}</section>`;
}

function renderInvariantCard(
  version: MethodologyVersionProjection,
  invariant: MethodologyVersionProjection["semanticInvariants"][number],
): string {
  const vectorIds = invariantVectorIds(invariant);
  const evidencePaths = linkedEvidencePaths(version, vectorIds);
  const acceptance = version.acceptanceReferences.map((reference) => Object.freeze({ id: reference.id, label: `${reference.id} · ${reference.sourcePath}` }));
  return `<article class="invariant-card" data-invariant-id="${escapeAttribute(invariant.id)}"><h4><button type="button" class="invariant-select" data-item-id="invariant:${escapeAttribute(invariant.id)}" aria-pressed="false">${escapeHtml(invariant.id)}</button></h4><dl class="invariant-meta"><dt>Contract path</dt><dd>${escapeHtml(version.contractPath)}</dd><dt>Contract JSON Pointer</dt><dd>${escapeHtml(invariant.contractPointer)}</dd><dt>Contract law</dt><dd>${escapeHtml(invariant.contractValue)}</dd><dt>Conformance path</dt><dd>${escapeHtml(version.conformancePath)}</dd><dt>Theory reference</dt><dd>none (no invariant-scoped source relation)</dd></dl>${renderTraceGroup("Genesis vectors", invariant.positive.requiredGenesisVectors, "vector")}${renderTraceGroup("Meaning vectors", invariant.positive.requiredMeaningVectors, "vector")}${renderTraceGroup("C2 classification vectors", invariant.positive.requiredC2ClassificationVectors, "vector")}${renderTraceGroup("Compatibility vectors", invariant.positive.requiredCompatibilityVectors, "vector")}${renderTraceGroup("Negative vectors", invariant.negative.requiredNegativeVectors, "vector")}${renderTraceGroup("Executable gates", invariant.requiredExecutableGates, "gate")}${renderTraceGroup("Existing evidence", evidencePaths, "evidence")}${renderReferenceGroup("Acceptance provenance", acceptance)}<details class="raw-provenance"><summary>Raw provenance</summary><dl class="invariant-meta"><dt>Invariant ID</dt><dd>${escapeHtml(invariant.id)}</dd><dt>Traceability source</dt><dd>${escapeHtml(invariant.traceabilitySourcePath)}</dd><dt>Contract source</dt><dd>${escapeHtml(version.contractPath)}#${escapeHtml(invariant.contractPointer)}</dd><dt>Conformance source</dt><dd>${escapeHtml(version.conformancePath)}</dd></dl></details></article>`;
}

function renderTraceGroup(label: string, values: readonly string[], prefix: "vector" | "gate" | "evidence"): string {
  const nodes = values.map((value) => `<button type="button" class="trace-node" data-item-id="${escapeAttribute(`${prefix}:${value}`)}" aria-pressed="false">${escapeHtml(value)}</button>`).join("");
  return `<div class="trace-group"><h5>${escapeHtml(label)}</h5><div class="trace-list">${nodes || "<span class=\"trace-none\">none</span>"}</div></div>`;
}

function renderReferenceGroup(label: string, values: readonly Readonly<{ id: string; label: string }>[] ): string {
  const nodes = values.map((value) => `<button type="button" class="trace-node" data-item-id="${escapeAttribute(value.id)}" aria-pressed="false">${escapeHtml(value.label)}</button>`).join("");
  return `<div class="trace-group"><h5>${escapeHtml(label)}</h5><div class="trace-list">${nodes || "<span class=\"trace-none\">none</span>"}</div></div>`;
}

function invariantVectorIds(invariant: MethodologyVersionProjection["semanticInvariants"][number]): readonly string[] {
  return uniqueSorted([
    ...invariant.positive.requiredGenesisVectors,
    ...invariant.positive.requiredMeaningVectors,
    ...invariant.positive.requiredC2ClassificationVectors,
    ...invariant.positive.requiredCompatibilityVectors,
    ...invariant.negative.requiredNegativeVectors,
  ]);
}

function linkedEvidencePaths(version: MethodologyVersionProjection, vectorIds: readonly string[]): readonly string[] {
  const selected = new Set(vectorIds);
  return uniqueSorted([...version.positiveVectors, ...version.negativeVectors]
    .filter((vector) => selected.has(vector.id))
    .flatMap((vector) => vector.evidence));
}

function renderTraceabilityTable(version: MethodologyVersionProjection): string {
  if (version.traceability.length === 0) {
    return `<details class="traceability-table"><summary>Source-derived traceability relations</summary><p class="trace-none">none</p></details>`;
  }
  const rows = version.traceability.map((relation) => {
    const presentation = relationPresentation(relation);
    return `<tr data-relation="${escapeAttribute(relation.relation)}"><td>${renderTraceEndpoint(presentation.source)}</td><td>${escapeHtml(presentation.label)}</td><td>${renderTraceEndpoint(presentation.target)}</td></tr>`;
  }).join("\n");
  return `<details class="traceability-table"><summary>Source-derived traceability relations</summary><table><thead><tr><th>Evidence/source endpoint</th><th>Relation</th><th>Obligation/target endpoint</th></tr></thead><tbody>${rows}</tbody></table></details>`;
}

function relationPresentation(
  relation: MethodologyVersionProjection["traceability"][number],
): Readonly<{ source: string; target: string; label: string }> {
  switch (relation.relation) {
    case "supported-by": return Object.freeze({ source: relation.to, target: relation.from, label: "supports" });
    case "challenged-by": return Object.freeze({ source: relation.to, target: relation.from, label: "challenges" });
    case "verified-by": return Object.freeze({ source: relation.to, target: relation.from, label: "verifies" });
    case "accepted-by": return Object.freeze({ source: relation.to, target: relation.from, label: "accepts" });
  }
}

function renderTraceEndpoint(id: string): string {
  return `<button type="button" class="trace-node" data-item-id="${escapeAttribute(id)}" aria-pressed="false">${escapeHtml(id)}</button>`;
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
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
