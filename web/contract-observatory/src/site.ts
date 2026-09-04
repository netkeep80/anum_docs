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
  <title>Обозреватель контрактов МТС</title>
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
    .evidence-reference { display: grid; gap: .25rem; padding: .35rem; border: 1px dashed color-mix(in srgb, CanvasText 15%, transparent); border-radius: .55rem; }
    .evidence-identifiers { display: flex; flex-wrap: wrap; gap: .25rem; font-size: .68rem; opacity: .78; }
    .evidence-identifier { overflow-wrap: anywhere; }
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
    <header class="hero"><p class="eyebrow">МТС · производные свидетельства</p><h1>Обозреватель контрактов МТС</h1><p class="lede">Статическое представление свидетельств контракта и корпуса соответствия. Эта страница является производной навигацией и не является источником семантики МТС.</p></header>
    <dl class="provenance" aria-label="Происхождение данных">${renderDefinition("Схема индекса", index.schema)}${renderDefinition("Приёмка", index.acceptancePath)}${renderDefinition("Текущий контракт", index.currentContractPath)}${renderDefinition("Предыдущий контракт", index.previousContractPath)}</dl>
${methodologyMap}
    <nav class="timeline" aria-labelledby="timeline-title"><h2 id="timeline-title">Хронология</h2><ol>${timeline}</ol></nav>
    <main class="versions" aria-labelledby="versions-title"><h2 id="versions-title">Обзор версий</h2><div class="version-list">${versions}</div></main>
    <footer class="footer">Сгенерировано детерминированно из ContractObservatoryIndex. Представление ненормативно.</footer>
  </div>
</body>
</html>
`;
}

function renderMethodologyMap(projection: MethodologyProjection): string {
  const config = buildObservatoryInteractionConfig(projection);
  const state = createObservatoryInteractionKernel(config).initialState();
  const model = buildInteractiveMethodologyModel(projection, state);
  const stageControls = model.stages.map((entry) => `<button type="button" data-methodology-stage="${entry.stage}" aria-pressed="false" title="Стадия жизненного цикла: ${stageLabel(entry.stage)}; производное состояние представления">${escapeHtml(stageLabel(entry.stage))}</button>`).join("\n");
  const filterControls = OBSERVATORY_FILTERS.map((filter) => renderFilterButton(filter, filterLabel(filter))).join("");
  const lanes = model.versions.map((entry, ordinal) => renderMethodologyLane(
    projection.versions[ordinal]!,
    entry,
    config.versions[ordinal]!,
  )).join("\n");
  const anatomy = projection.versions.map(renderInvariantAnatomy).join("\n");

  return `    <section class="methodology-map" aria-labelledby="methodology-title">
      <div class="methodology-heading"><p class="eyebrow">Основное объясняющее представление · производная методология</p><h2 id="methodology-title">Карта методологии и жизненного цикла версий</h2><p>Две координированные, но не тождественные структуры: метод разработки и состояние жизненного цикла версии.</p></div>
      <ol class="method-chain" aria-label="Цепочка метода"><li>Теория</li><li>Контракт</li><li>Соответствие</li><li>Проверка</li><li>Модель / воспроизведение</li><li>Приёмка</li><li>Текущая</li></ol>
      <div class="methodology-authority" aria-label="Основания связей"><span>Связь метода и жизненного цикла: производная связь представления</span><span>Связь трассируемости и свидетельств: ссылка из исходных данных</span><span>Семантические Связи МТС: в этом представлении не отображаются</span></div>
      <div class="methodology-controls">
        <div class="stage-controls" role="group" aria-label="Стадии методологии">${stageControls}</div>
        <div class="filter-controls" role="group" aria-label="Фильтры версий и свидетельств">${filterControls}</div>
        <div class="viewport-controls" role="group" aria-label="Область карты"><button type="button" data-viewport-action="zoom-out" aria-label="Уменьшить масштаб">−</button><button type="button" data-viewport-action="reset">Сбросить вид</button><button type="button" data-viewport-action="zoom-in" aria-label="Увеличить масштаб">+</button></div>
      </div>
      <div class="methodology-grid" tabindex="0" aria-label="Полосы жизненного цикла версий">${lanes}</div>
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
  const stages = model.stageStates.map((entry) => `<div class="stage-cell${entry.present ? " present" : ""}" data-lane-stage="${entry.stage}" title="${stageLabel(entry.stage)}: ${entry.present ? "есть связанные свидетельства" : "связанные свидетельства отсутствуют"}"><span>${escapeHtml(stageLabel(entry.stage))}</span><span class="stage-evidence">${entry.present ? `${evidenceByStage.get(entry.stage) ?? 0} свидетельств` : "—"}</span></div>`).join("\n");
  const evidenceItems = config.itemIds.slice(0, 6).map((id) => `<button type="button" data-item-id="${escapeAttribute(id)}" aria-pressed="false" title="Ссылка трассируемости/свидетельства; только представление">${escapeHtml(id)}</button>`).join("");
  return `<div class="methodology-lane${model.selected ? " selected" : ""}" data-version-lane="${escapeAttribute(model.contractId)}"><div class="lane-version"><button type="button" class="version-select" data-version-id="${escapeAttribute(model.contractId)}" aria-pressed="${model.selected ? "true" : "false"}" title="Выбрать версию и синхронизировать представления обозревателя">${escapeHtml(model.contractId)}</button><span class="lane-classification">${classificationLabel(model.classification)}</span></div>${stages}<div class="evidence-items" aria-label="Ссылки на свидетельства для ${escapeAttribute(model.contractId)}">${evidenceItems || "<span>Нет связанных ссылок на свидетельства</span>"}</div></div>`;
}

function renderInvariantAnatomy(version: MethodologyVersionProjection): string {
  const manifest = version.traceabilityManifestPath ?? "нет";
  const cards = version.semanticInvariants.map((invariant) => renderInvariantCard(version, invariant)).join("\n");
  const missing = version.semanticInvariants.length === 0
    ? `<p class="trace-none">Нет семантических инвариантов, связанных с источником. Манифест трассируемости: ${escapeHtml(manifest)}.</p>`
    : "";
  return `      <section class="invariant-anatomy" data-traceability-version="${escapeAttribute(version.contractId)}" aria-label="Анатомия инвариантов для ${escapeAttribute(version.contractId)}"><h3>Анатомия инвариантов · ${escapeHtml(version.contractId)}</h3><p>Производное представление происхождения данных. Манифест трассируемости: ${escapeHtml(manifest)}. Отсутствующие связи показаны явно.</p>${missing}<div class="invariant-cards">${cards}</div>${renderTraceabilityTable(version)}</section>`;
}

function renderInvariantCard(
  version: MethodologyVersionProjection,
  invariant: MethodologyVersionProjection["semanticInvariants"][number],
): string {
  const vectorIds = invariantVectorIds(invariant);
  const evidenceReferences = linkedEvidenceReferences(version, vectorIds);
  const acceptance = version.acceptanceReferences.map((reference) => Object.freeze({ id: reference.id, label: `${reference.id} · ${reference.sourcePath}` }));
  return `<article class="invariant-card" data-invariant-id="${escapeAttribute(invariant.id)}"><h4><button type="button" class="invariant-select" data-item-id="invariant:${escapeAttribute(invariant.id)}" aria-pressed="false">${escapeHtml(invariant.id)}</button></h4><dl class="invariant-meta"><dt>Путь контракта</dt><dd>${escapeHtml(version.contractPath)}</dd><dt>JSON Pointer контракта</dt><dd>${escapeHtml(invariant.contractPointer)}</dd><dt>Закон контракта</dt><dd>${escapeHtml(invariant.contractValue)}</dd><dt>Путь корпуса соответствия</dt><dd>${escapeHtml(version.conformancePath)}</dd><dt>Ссылка на теорию</dt><dd>нет (нет исходной связи уровня инварианта)</dd></dl>${renderTraceGroup("Векторы генезиса", invariant.positive.requiredGenesisVectors, "vector")}${renderTraceGroup("Векторы смысла", invariant.positive.requiredMeaningVectors, "vector")}${renderTraceGroup("Векторы классификации C2", invariant.positive.requiredC2ClassificationVectors, "vector")}${renderTraceGroup("Векторы совместимости", invariant.positive.requiredCompatibilityVectors, "vector")}${renderTraceGroup("Отрицательные векторы", invariant.negative.requiredNegativeVectors, "vector")}${renderTraceGroup("Исполняемые проверки", invariant.requiredExecutableGates, "gate")}${renderEvidenceGroup("Существующие свидетельства", evidenceReferences)}${renderReferenceGroup("Происхождение приёмки", acceptance)}<details class="raw-provenance"><summary>Исходное происхождение данных</summary><dl class="invariant-meta"><dt>ID инварианта</dt><dd>${escapeHtml(invariant.id)}</dd><dt>Источник трассируемости</dt><dd>${escapeHtml(invariant.traceabilitySourcePath)}</dd><dt>Источник контракта</dt><dd>${escapeHtml(version.contractPath)}#${escapeHtml(invariant.contractPointer)}</dd><dt>Источник корпуса соответствия</dt><dd>${escapeHtml(version.conformancePath)}</dd></dl></details></article>`;
}

function renderTraceGroup(label: string, values: readonly string[], prefix: "vector" | "gate" | "evidence"): string {
  const nodes = values.map((value) => `<button type="button" class="trace-node" data-item-id="${escapeAttribute(`${prefix}:${value}`)}" aria-pressed="false">${escapeHtml(value)}</button>`).join("");
  return `<div class="trace-group"><h5>${escapeHtml(label)}</h5><div class="trace-list">${nodes || "<span class=\"trace-none\">нет</span>"}</div></div>`;
}

function renderEvidenceGroup(label: string, values: MethodologyVersionProjection["evidenceReferences"]): string {
  const nodes = values.map((reference) => {
    const identifiers = reference.identifiers
      .map((entry) => `<span class="evidence-identifier">${escapeHtml(entry.kind)}: ${escapeHtml(entry.value)}</span>`)
      .join("");
    return `<div class="evidence-reference"><button type="button" class="trace-node" data-item-id="${escapeAttribute(reference.id)}" aria-pressed="false">${escapeHtml(reference.sourcePath)}</button><span class="evidence-identifiers">${identifiers || "<span class=\"trace-none\">идентификаторы: нет</span>"}</span></div>`;
  }).join("");
  return `<div class="trace-group"><h5>${escapeHtml(label)}</h5><div class="trace-list">${nodes || "<span class=\"trace-none\">нет</span>"}</div></div>`;
}

function renderReferenceGroup(label: string, values: readonly Readonly<{ id: string; label: string }>[] ): string {
  const nodes = values.map((value) => `<button type="button" class="trace-node" data-item-id="${escapeAttribute(value.id)}" aria-pressed="false">${escapeHtml(value.label)}</button>`).join("");
  return `<div class="trace-group"><h5>${escapeHtml(label)}</h5><div class="trace-list">${nodes || "<span class=\"trace-none\">нет</span>"}</div></div>`;
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

function linkedEvidenceReferences(
  version: MethodologyVersionProjection,
  vectorIds: readonly string[],
): MethodologyVersionProjection["evidenceReferences"] {
  const selected = new Set(vectorIds);
  const paths = new Set([...version.positiveVectors, ...version.negativeVectors]
    .filter((vector) => selected.has(vector.id))
    .flatMap((vector) => vector.evidence));
  return version.evidenceReferences.filter((reference) => paths.has(reference.sourcePath));
}

function renderTraceabilityTable(version: MethodologyVersionProjection): string {
  if (version.traceability.length === 0) {
    return `<details class="traceability-table"><summary>Исходные связи трассируемости</summary><p class="trace-none">нет</p></details>`;
  }
  const rows = version.traceability.map((relation) => {
    const presentation = relationPresentation(relation);
    return `<tr data-relation="${escapeAttribute(relation.relation)}"><td>${renderTraceEndpoint(presentation.source)}</td><td>${escapeHtml(presentation.label)}</td><td>${renderTraceEndpoint(presentation.target)}</td></tr>`;
  }).join("\n");
  return `<details class="traceability-table"><summary>Исходные связи трассируемости</summary><table><thead><tr><th>Конечная точка свидетельства/источника</th><th>Связь</th><th>Конечная точка обязательства/цели</th></tr></thead><tbody>${rows}</tbody></table></details>`;
}

function relationPresentation(
  relation: MethodologyVersionProjection["traceability"][number],
): Readonly<{ source: string; target: string; label: string }> {
  switch (relation.relation) {
    case "supported-by": return Object.freeze({ source: relation.to, target: relation.from, label: "подтверждает" });
    case "challenged-by": return Object.freeze({ source: relation.to, target: relation.from, label: "оспаривает" });
    case "verified-by": return Object.freeze({ source: relation.to, target: relation.from, label: "проверяет" });
    case "accepted-by": return Object.freeze({ source: relation.to, target: relation.from, label: "принимает" });
  }
}

function renderTraceEndpoint(id: string): string {
  return `<button type="button" class="trace-node" data-item-id="${escapeAttribute(id)}" aria-pressed="false">${escapeHtml(id)}</button>`;
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function renderFilterButton(filter: string, label: string): string { return `<button type="button" data-methodology-filter="${filter}" aria-pressed="false">${escapeHtml(label)}</button>`; }

function renderTimelineItem(version: ContractVersionSummary, ordinal: number, interactive: boolean): string {
  const anchor = anchorId(ordinal); const classification = classify(version); const semanticDelta = version.observableSemanticDelta ? "СЕМАНТИЧЕСКОЕ ИЗМЕНЕНИЕ" : "БЕЗ СЕМАНТИЧЕСКОГО ИЗМЕНЕНИЯ"; const href = interactive ? `#v=${encodeURIComponent(version.contractId)}` : `#${anchor}`;
  return `<li><a href="${href}" class="${version.isCurrent ? "current" : ""}" data-overview-version-id="${escapeAttribute(version.contractId)}"${version.isCurrent ? " aria-current=\"page\"" : ""}><span class="timeline-id">${escapeHtml(version.contractId)}</span><span class="badges">${badge(classification, false)}${badge(statusLabel(version.status), true)}${badge(version.accepted ? "ПРИНЯТ" : "НЕ ПРИНЯТ", true)}${badge(semanticDelta, true)}</span></a></li>`;
}

function renderVersionSection(version: ContractVersionSummary, ordinal: number): string {
  const anchor = anchorId(ordinal); const issueRows = [version.issue === undefined ? "" : renderRow("Задача GitHub", `#${version.issue}`), version.candidateLifecycleIssue === undefined ? "" : renderRow("Задача жизненного цикла кандидата", `#${version.candidateLifecycleIssue}`)].filter(Boolean).join("\n");
  return `<section id="${anchor}" class="version-card${version.isCurrent ? " current" : ""}" data-overview-version-id="${escapeAttribute(version.contractId)}" aria-labelledby="${anchor}-title"><details${version.isCurrent ? " open" : ""}><summary><span id="${anchor}-title">${escapeHtml(version.contractId)}</span><span class="badges">${badge(classify(version), false)} ${badge(statusLabel(version.status), true)}</span></summary><div class="version-body"><div class="metric-grid">${metric("Принят", yesNo(version.accepted))}${metric("Готов к приёмке", yesNo(version.acceptanceReady))}${metric("Покрытие", coverageLabel(version.coverageState))}${metric("Исполняемые проверки", String(version.requiredExecutableGateCount))}${metric("Отрицательные векторы", String(version.requiredNegativeVectorCount))}${metric("Наблюдаемое семантическое изменение", yesNo(version.observableSemanticDelta))}</div><table><tbody>${renderRow("Контракт", version.contractId)}${renderRow("Корпус соответствия", version.conformanceId)}${renderRow("Семантическая база", version.semanticBase)}${renderRow("Путь контракта", version.contractPath)}${renderRow("Путь корпуса соответствия", version.conformancePath)}${renderRow("Классификация", classify(version))}${issueRows}</tbody></table></div></details></section>`;
}

function renderDefinition(label: string, value: string): string { return `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`; }
function renderRow(label: string, value: string): string { return `<tr><th scope="row">${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`; }
function metric(label: string, value: string): string { return `<div class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`; }
function badge(value: string, muted: boolean): string { return `<span class="badge${muted ? " badge-muted" : ""}">${escapeHtml(value)}</span>`; }
function classify(version: ContractVersionSummary): string { if (version.isCurrent) return "ТЕКУЩАЯ"; if (version.isPrevious) return "ПРЕДЫДУЩАЯ"; return "АКТИВНАЯ"; }
function classificationLabel(value: string): string {
  switch (value) {
    case "CURRENT": return "ТЕКУЩАЯ";
    case "PREVIOUS": return "ПРЕДЫДУЩАЯ";
    case "CANDIDATE": return "КАНДИДАТ";
    case "ACCEPTED": return "ПРИНЯТА";
    default: return "АКТИВНАЯ";
  }
}
function stageLabel(value: string): string {
  switch (value) {
    case "research": return "Исследование";
    case "problem": return "Проблема";
    case "candidate": return "Кандидат";
    case "challenged": return "Проверка";
    case "modeled": return "Модель / воспроизведение";
    case "accepted": return "Принято";
    case "released": return "Выпущено";
    default: return value;
  }
}
function filterLabel(value: string): string {
  switch (value) {
    case "accepted": return "Принятые";
    case "candidate": return "Кандидаты";
    case "current": return "Текущие";
    case "evidence": return "Со свидетельствами";
    case "negative": return "Отрицательные";
    case "positive": return "Положительные";
    case "previous": return "Предыдущие";
    default: return value;
  }
}
function statusLabel(value: string): string {
  switch (value) {
    case "accepted": return "ПРИНЯТ";
    case "candidate": return "КАНДИДАТ";
    case "current": return "ТЕКУЩИЙ";
    case "released": return "ВЫПУЩЕН";
    default: return value.toUpperCase();
  }
}
function coverageLabel(value: string): string {
  switch (value) {
    case "complete": return "полное";
    case "partial": return "частичное";
    case "missing": return "отсутствует";
    default: return value;
  }
}
function yesNo(value: boolean): string { return value ? "ДА" : "НЕТ"; }
function anchorId(ordinal: number): string { return `version-${ordinal + 1}`; }
function escapeAttribute(value: string): string { return escapeHtml(value); }
function escapeHtml(value: string): string { return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("\"", "&quot;").replaceAll("'", "&#39;"); }
