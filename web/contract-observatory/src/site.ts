import type { ContractObservatoryIndex, ContractVersionSummary } from "./contract-index.js";

export function renderContractObservatoryHtml(index: ContractObservatoryIndex): string {
  const timeline = index.versions
    .map((version, ordinal) => renderTimelineItem(version, ordinal))
    .join("\n");
  const versions = index.versions
    .map((version, ordinal) => renderVersionSection(version, ordinal))
    .join("\n");

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
    a:focus-visible, summary:focus-visible { outline: 3px solid Highlight; outline-offset: 3px; }
    .shell { width: min(1120px, calc(100% - 2rem)); margin: 0 auto; padding: 2rem 0 4rem; }
    .hero { display: grid; gap: .8rem; margin-bottom: 2rem; }
    .eyebrow { margin: 0; font-size: .8rem; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; opacity: .7; }
    h1 { margin: 0; font-size: clamp(2rem, 6vw, 4.5rem); line-height: .95; max-width: 12ch; }
    .lede { margin: 0; max-width: 72ch; line-height: 1.6; opacity: .82; }
    .provenance { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .75rem; margin: 1.5rem 0 2rem; }
    .provenance div, .version-card { border: 1px solid color-mix(in srgb, CanvasText 18%, transparent); border-radius: 1rem; background: color-mix(in srgb, Canvas 94%, CanvasText 6%); }
    .provenance div { padding: .9rem 1rem; min-width: 0; }
    dt { font-size: .72rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; opacity: .65; }
    dd { margin: .35rem 0 0; overflow-wrap: anywhere; }
    .timeline { margin: 0 0 2.5rem; }
    .timeline h2, .versions h2 { margin: 0 0 1rem; font-size: 1.5rem; }
    .timeline ol { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: .8rem; padding: 0; margin: 0; list-style: none; }
    .timeline a { display: grid; gap: .5rem; min-height: 8rem; padding: 1rem; border: 1px solid color-mix(in srgb, CanvasText 18%, transparent); border-radius: 1rem; color: inherit; text-decoration: none; background: color-mix(in srgb, Canvas 96%, CanvasText 4%); }
    .timeline a:hover { border-color: color-mix(in srgb, CanvasText 45%, transparent); }
    .timeline .current { border-width: 2px; }
    .timeline-id { font-weight: 800; overflow-wrap: anywhere; }
    .badges { display: flex; flex-wrap: wrap; gap: .35rem; align-items: center; }
    .badge { display: inline-flex; align-items: center; min-height: 1.7rem; padding: .2rem .55rem; border: 1px solid currentColor; border-radius: 999px; font-size: .72rem; font-weight: 800; letter-spacing: .04em; }
    .badge-muted { opacity: .65; }
    .version-list { display: grid; gap: 1rem; }
    .version-card { overflow: hidden; }
    .version-card.current { border-width: 2px; }
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
    @media (max-width: 680px) {
      .shell { width: min(100% - 1rem, 1120px); padding-top: 1rem; }
      .provenance { grid-template-columns: 1fr; }
      th, td { display: block; width: 100%; padding-left: 0; padding-right: 0; }
      th { border-bottom: 0; padding-bottom: .2rem; }
      td { border-top: 0; padding-top: 0; }
    }
  </style>
</head>
<body>
  <div class="shell">
    <header class="hero">
      <p class="eyebrow">MTS · derived evidence</p>
      <h1>Contract Observatory</h1>
      <p class="lede">Статическое представление contract/conformance evidence. Эта страница является производной навигацией и не является источником семантики МТС.</p>
    </header>

    <dl class="provenance" aria-label="Provenance">
      ${renderDefinition("Index schema", index.schema)}
      ${renderDefinition("Acceptance", index.acceptancePath)}
      ${renderDefinition("Current contract", index.currentContractPath)}
      ${renderDefinition("Previous contract", index.previousContractPath)}
    </dl>

    <nav class="timeline" aria-labelledby="timeline-title">
      <h2 id="timeline-title">Timeline</h2>
      <ol>
${timeline}
      </ol>
    </nav>

    <main class="versions" aria-labelledby="versions-title">
      <h2 id="versions-title">Version Overview</h2>
      <div class="version-list">
${versions}
      </div>
    </main>

    <footer class="footer">Generated deterministically from ContractObservatoryIndex. Presentation is non-normative.</footer>
  </div>
</body>
</html>
`;
}

function renderTimelineItem(version: ContractVersionSummary, ordinal: number): string {
  const anchor = anchorId(ordinal);
  const classification = classify(version);
  const semanticDelta = version.observableSemanticDelta ? "SEMANTIC DELTA" : "NO SEMANTIC DELTA";
  return `        <li>
          <a href="#${anchor}" class="${version.isCurrent ? "current" : ""}"${version.isCurrent ? " aria-current=\"page\"" : ""}>
            <span class="timeline-id">${escapeHtml(version.contractId)}</span>
            <span class="badges">
              ${badge(classification, false)}
              ${badge(version.status.toUpperCase(), true)}
              ${badge(version.accepted ? "ACCEPTED" : "NOT ACCEPTED", true)}
              ${badge(semanticDelta, true)}
            </span>
          </a>
        </li>`;
}

function renderVersionSection(version: ContractVersionSummary, ordinal: number): string {
  const anchor = anchorId(ordinal);
  const issueRows = [
    version.issue === undefined ? "" : renderRow("Issue", `#${version.issue}`),
    version.candidateLifecycleIssue === undefined
      ? ""
      : renderRow("Candidate lifecycle issue", `#${version.candidateLifecycleIssue}`),
  ].filter(Boolean).join("\n");

  return `        <section id="${anchor}" class="version-card${version.isCurrent ? " current" : ""}" aria-labelledby="${anchor}-title">
          <details${version.isCurrent ? " open" : ""}>
            <summary>
              <span id="${anchor}-title">${escapeHtml(version.contractId)}</span>
              <span class="badges">${badge(classify(version), false)} ${badge(version.status.toUpperCase(), true)}</span>
            </summary>
            <div class="version-body">
              <div class="metric-grid">
                ${metric("Accepted", yesNo(version.accepted))}
                ${metric("Acceptance ready", yesNo(version.acceptanceReady))}
                ${metric("Coverage", version.coverageState)}
                ${metric("Executable gates", String(version.requiredExecutableGateCount))}
                ${metric("Negative vectors", String(version.requiredNegativeVectorCount))}
                ${metric("Semantic delta", yesNo(version.observableSemanticDelta))}
              </div>
              <table>
                <tbody>
                  ${renderRow("Contract", version.contractId)}
                  ${renderRow("Conformance", version.conformanceId)}
                  ${renderRow("Semantic base", version.semanticBase)}
                  ${renderRow("Contract path", version.contractPath)}
                  ${renderRow("Conformance path", version.conformancePath)}
                  ${renderRow("Classification", classify(version))}
${issueRows}
                </tbody>
              </table>
            </div>
          </details>
        </section>`;
}

function renderDefinition(label: string, value: string): string {
  return `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`;
}

function renderRow(label: string, value: string): string {
  return `                  <tr><th scope="row">${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`;
}

function metric(label: string, value: string): string {
  return `<div class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function badge(value: string, muted: boolean): string {
  return `<span class="badge${muted ? " badge-muted" : ""}">${escapeHtml(value)}</span>`;
}

function classify(version: ContractVersionSummary): string {
  if (version.isCurrent) return "CURRENT";
  if (version.isPrevious) return "PREVIOUS";
  return "LIVE";
}

function yesNo(value: boolean): string {
  return value ? "YES" : "NO";
}

function anchorId(ordinal: number): string {
  return `version-${ordinal + 1}`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}
