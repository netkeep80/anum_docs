import type {
  MethodologyProjection,
  MethodologyStage,
  MethodologyVersionProjection,
} from "./methodology-projection.js";

export const METHODOLOGY_STAGE_ORDER: readonly MethodologyStage[] = Object.freeze([
  "research",
  "problem",
  "candidate",
  "challenged",
  "modeled",
  "accepted",
  "released",
]);

export interface ObservatoryViewport {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
}

export interface ObservatoryInteractionState {
  readonly selectedVersionId: string | null;
  readonly selectedStage: MethodologyStage | null;
  readonly selectedItemId: string | null;
  readonly filters: readonly string[];
  readonly viewport: ObservatoryViewport;
}

export type ObservatoryInteractionAction =
  | { readonly type: "select-version"; readonly versionId: string | null }
  | { readonly type: "select-stage"; readonly stage: MethodologyStage | null }
  | { readonly type: "select-item"; readonly itemId: string | null }
  | { readonly type: "set-filters"; readonly filters: readonly string[] }
  | { readonly type: "set-viewport"; readonly viewport: ObservatoryViewport };

export interface InteractiveMethodologyStageState {
  readonly stage: MethodologyStage;
  readonly selected: boolean;
}

export interface InteractiveMethodologyVersionStageState {
  readonly stage: MethodologyStage;
  readonly present: boolean;
  readonly selected: boolean;
}

export interface InteractiveMethodologyVersion {
  readonly contractId: string;
  readonly classification: "CURRENT" | "PREVIOUS" | "CANDIDATE" | "ACCEPTED" | "LIVE";
  readonly accepted: boolean;
  readonly isCurrent: boolean;
  readonly isPrevious: boolean;
  readonly selected: boolean;
  readonly stageStates: readonly InteractiveMethodologyVersionStageState[];
}

export interface InteractiveMethodologyModel {
  readonly stages: readonly InteractiveMethodologyStageState[];
  readonly versions: readonly InteractiveMethodologyVersion[];
}

const DEFAULT_VIEWPORT: ObservatoryViewport = Object.freeze({ x: 0, y: 0, scale: 1 });

export function reduceInteractionState(
  state: ObservatoryInteractionState,
  action: ObservatoryInteractionAction,
): ObservatoryInteractionState {
  switch (action.type) {
    case "select-version":
      return freezeState({ ...state, selectedVersionId: action.versionId });
    case "select-stage":
      return freezeState({ ...state, selectedStage: action.stage });
    case "select-item":
      return freezeState({ ...state, selectedItemId: action.itemId });
    case "set-filters":
      return freezeState({ ...state, filters: uniqueSorted(action.filters) });
    case "set-viewport":
      return freezeState({ ...state, viewport: normalizeViewport(action.viewport) });
  }
}

export function buildInteractiveMethodologyModel(
  projection: MethodologyProjection,
  state: ObservatoryInteractionState,
): InteractiveMethodologyModel {
  const stages = METHODOLOGY_STAGE_ORDER.map((stage) => Object.freeze({
    stage,
    selected: state.selectedStage === stage,
  }));
  const versions = projection.versions.map((version) => projectVersion(version, state));
  return Object.freeze({
    stages: Object.freeze(stages),
    versions: Object.freeze(versions),
  });
}

export function encodeObservatoryHash(state: ObservatoryInteractionState): string {
  const params = new URLSearchParams();
  if (state.selectedVersionId !== null) params.set("v", state.selectedVersionId);
  if (state.selectedStage !== null) params.set("s", state.selectedStage);
  if (state.selectedItemId !== null) params.set("item", state.selectedItemId);
  for (const filter of uniqueSorted(state.filters)) params.append("f", filter);
  if (!isDefaultViewport(state.viewport)) {
    params.set("x", String(state.viewport.x));
    params.set("y", String(state.viewport.y));
    params.set("z", String(state.viewport.scale));
  }
  return `#${params.toString()}`;
}

export function decodeObservatoryHash(
  hash: string,
  projection: MethodologyProjection,
): ObservatoryInteractionState {
  const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  const requestedVersion = params.get("v");
  const selectedVersionId = hasVersion(projection, requestedVersion)
    ? requestedVersion
    : defaultVersionId(projection);
  const requestedStage = params.get("s");
  const selectedStage = isMethodologyStage(requestedStage) ? requestedStage : null;
  const selectedItemId = params.get("item");
  const filters = uniqueSorted(params.getAll("f"));
  const viewport = normalizeViewport({
    x: finiteNumber(params.get("x"), 0),
    y: finiteNumber(params.get("y"), 0),
    scale: finiteNumber(params.get("z"), 1),
  });
  return freezeState({ selectedVersionId, selectedStage, selectedItemId, filters, viewport });
}

function projectVersion(
  version: MethodologyVersionProjection,
  state: ObservatoryInteractionState,
): InteractiveMethodologyVersion {
  const presentStages = new Set(version.lifecycle.map((entry) => entry.stage));
  const stageStates = METHODOLOGY_STAGE_ORDER.map((stage) => Object.freeze({
    stage,
    present: presentStages.has(stage),
    selected: state.selectedStage === stage,
  }));
  return Object.freeze({
    contractId: version.contractId,
    classification: classify(version),
    accepted: version.accepted,
    isCurrent: version.isCurrent,
    isPrevious: version.isPrevious,
    selected: state.selectedVersionId === version.contractId,
    stageStates: Object.freeze(stageStates),
  });
}

function classify(version: MethodologyVersionProjection): InteractiveMethodologyVersion["classification"] {
  if (version.isCurrent) return "CURRENT";
  if (version.isPrevious) return "PREVIOUS";
  if (version.status === "candidate" || !version.accepted) return "CANDIDATE";
  if (version.accepted) return "ACCEPTED";
  return "LIVE";
}

function defaultVersionId(projection: MethodologyProjection): string | null {
  return projection.versions.find((entry) => entry.isCurrent)?.contractId
    ?? projection.versions[0]?.contractId
    ?? null;
}

function hasVersion(projection: MethodologyProjection, value: string | null): value is string {
  return value !== null && projection.versions.some((entry) => entry.contractId === value);
}

function isMethodologyStage(value: string | null): value is MethodologyStage {
  return value !== null && (METHODOLOGY_STAGE_ORDER as readonly string[]).includes(value);
}

function normalizeViewport(viewport: ObservatoryViewport): ObservatoryViewport {
  const scale = Number.isFinite(viewport.scale) && viewport.scale > 0 ? viewport.scale : 1;
  const x = Number.isFinite(viewport.x) ? viewport.x : 0;
  const y = Number.isFinite(viewport.y) ? viewport.y : 0;
  return Object.freeze({ x, y, scale });
}

function finiteNumber(value: string | null, fallback: number): number {
  if (value === null || value.trim() === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isDefaultViewport(viewport: ObservatoryViewport): boolean {
  return viewport.x === 0 && viewport.y === 0 && viewport.scale === 1;
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values)].sort((left, right) => left.localeCompare(right)));
}

function freezeState(state: ObservatoryInteractionState): ObservatoryInteractionState {
  return Object.freeze({
    selectedVersionId: state.selectedVersionId,
    selectedStage: state.selectedStage,
    selectedItemId: state.selectedItemId,
    filters: Object.freeze([...state.filters]),
    viewport: normalizeViewport(state.viewport),
  });
}
