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

export const OBSERVATORY_FILTERS = Object.freeze([
  "accepted",
  "candidate",
  "current",
  "evidence",
  "negative",
  "positive",
  "previous",
] as const);

export type ObservatoryFilter = typeof OBSERVATORY_FILTERS[number];

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
  | { readonly type: "toggle-filter"; readonly filter: string }
  | { readonly type: "set-viewport"; readonly viewport: ObservatoryViewport }
  | { readonly type: "zoom"; readonly delta: number }
  | { readonly type: "reset-viewport" };

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

export interface ObservatoryInteractionVersionConfig {
  readonly id: string;
  readonly categories: readonly string[];
  readonly itemIds: readonly string[];
}

export interface ObservatoryInteractionConfig {
  readonly versions: readonly ObservatoryInteractionVersionConfig[];
  readonly defaultVersionId: string | null;
  readonly stages: readonly MethodologyStage[];
  readonly filters: readonly string[];
  readonly minScale: number;
  readonly maxScale: number;
  readonly zoomStep: number;
}

export interface ObservatoryInteractionKernel {
  readonly initialState: () => ObservatoryInteractionState;
  readonly decode: (hash: string) => ObservatoryInteractionState;
  readonly encode: (state: ObservatoryInteractionState) => string;
  readonly reduce: (
    state: ObservatoryInteractionState,
    action: ObservatoryInteractionAction,
  ) => ObservatoryInteractionState;
  readonly isVersionVisible: (
    versionId: string,
    state: ObservatoryInteractionState,
  ) => boolean;
}

export function buildObservatoryInteractionConfig(
  projection: MethodologyProjection,
): ObservatoryInteractionConfig {
  const versions = projection.versions.map((version) => Object.freeze({
    id: version.contractId,
    categories: Object.freeze(methodologyCategories(version)),
    itemIds: Object.freeze(methodologyItemIds(version)),
  }));
  return Object.freeze({
    versions: Object.freeze(versions),
    defaultVersionId: defaultVersionId(projection),
    stages: METHODOLOGY_STAGE_ORDER,
    filters: OBSERVATORY_FILTERS,
    minScale: 0.7,
    maxScale: 1.8,
    zoomStep: 0.1,
  });
}

/**
 * Browser-safe interaction policy. Keep every helper inside this function:
 * the same compiled function body is embedded into the generated static page.
 */
export function createObservatoryInteractionKernel(
  config: ObservatoryInteractionConfig,
): ObservatoryInteractionKernel {
  const versionIds = new Set(config.versions.map((entry) => entry.id));
  const itemIds = new Set(config.versions.flatMap((entry) => entry.itemIds));
  const stages = new Set<string>(config.stages);
  const filters = new Set(config.filters);
  const categoriesByVersion = new Map(
    config.versions.map((entry) => [entry.id, new Set(entry.categories)] as const),
  );

  const uniqueSortedAllowed = (values: readonly string[], allowed: Set<string>): readonly string[] =>
    Object.freeze([...new Set(values.filter((value) => allowed.has(value)))].sort((a, b) => a.localeCompare(b)));

  const finite = (value: number, fallback: number): number => Number.isFinite(value) ? value : fallback;
  const clampScale = (value: number): number => {
    const finiteScale = finite(value, 1);
    return Math.min(config.maxScale, Math.max(config.minScale, finiteScale));
  };
  const normalizeViewport = (viewport: ObservatoryViewport): ObservatoryViewport => Object.freeze({
    x: finite(viewport.x, 0),
    y: finite(viewport.y, 0),
    scale: clampScale(viewport.scale),
  });
  const finiteParam = (value: string | null, fallback: number): number => {
    if (value === null || value.trim() === "") return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const validVersion = (value: string | null): string | null =>
    value !== null && versionIds.has(value) ? value : config.defaultVersionId;
  const validStage = (value: string | null): MethodologyStage | null =>
    value !== null && stages.has(value) ? value as MethodologyStage : null;
  const validItem = (value: string | null): string | null =>
    value !== null && itemIds.has(value) ? value : null;
  const normalizeState = (state: ObservatoryInteractionState): ObservatoryInteractionState => Object.freeze({
    selectedVersionId: validVersion(state.selectedVersionId),
    selectedStage: validStage(state.selectedStage),
    selectedItemId: validItem(state.selectedItemId),
    filters: uniqueSortedAllowed(state.filters, filters),
    viewport: normalizeViewport(state.viewport),
  });

  const decode = (hash: string): ObservatoryInteractionState => {
    const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
    return normalizeState({
      selectedVersionId: params.get("v"),
      selectedStage: validStage(params.get("s")),
      selectedItemId: params.get("item"),
      filters: params.getAll("f"),
      viewport: {
        x: finiteParam(params.get("x"), 0),
        y: finiteParam(params.get("y"), 0),
        scale: finiteParam(params.get("z"), 1),
      },
    });
  };

  const encode = (state: ObservatoryInteractionState): string => {
    const normalized = normalizeState(state);
    const params = new URLSearchParams();
    if (normalized.selectedVersionId !== null) params.set("v", normalized.selectedVersionId);
    if (normalized.selectedStage !== null) params.set("s", normalized.selectedStage);
    if (normalized.selectedItemId !== null) params.set("item", normalized.selectedItemId);
    for (const filter of normalized.filters) params.append("f", filter);
    if (normalized.viewport.x !== 0 || normalized.viewport.y !== 0 || normalized.viewport.scale !== 1) {
      params.set("x", String(normalized.viewport.x));
      params.set("y", String(normalized.viewport.y));
      params.set("z", String(normalized.viewport.scale));
    }
    return `#${params.toString()}`;
  };

  const reduce = (
    state: ObservatoryInteractionState,
    action: ObservatoryInteractionAction,
  ): ObservatoryInteractionState => {
    const current = normalizeState(state);
    switch (action.type) {
      case "select-version":
        return normalizeState({ ...current, selectedVersionId: action.versionId });
      case "select-stage":
        return normalizeState({ ...current, selectedStage: action.stage });
      case "select-item":
        return normalizeState({ ...current, selectedItemId: action.itemId });
      case "set-filters":
        return normalizeState({ ...current, filters: action.filters });
      case "toggle-filter": {
        if (!filters.has(action.filter)) return current;
        const next = new Set(current.filters);
        next.has(action.filter) ? next.delete(action.filter) : next.add(action.filter);
        return normalizeState({ ...current, filters: [...next] });
      }
      case "set-viewport":
        return normalizeState({ ...current, viewport: action.viewport });
      case "zoom": {
        const scale = Math.round((current.viewport.scale + action.delta) * 1000) / 1000;
        return normalizeState({ ...current, viewport: { ...current.viewport, scale } });
      }
      case "reset-viewport":
        return normalizeState({ ...current, viewport: { x: 0, y: 0, scale: 1 } });
    }
  };

  const isVersionVisible = (
    versionId: string,
    state: ObservatoryInteractionState,
  ): boolean => {
    const categories = categoriesByVersion.get(versionId);
    if (categories === undefined) return false;
    return normalizeState(state).filters.every((filter) => categories.has(filter));
  };

  return Object.freeze({
    initialState: () => decode("#"),
    decode,
    encode,
    reduce,
    isVersionVisible,
  });
}

export function reduceInteractionState(
  state: ObservatoryInteractionState,
  action: ObservatoryInteractionAction,
  projection: MethodologyProjection,
): ObservatoryInteractionState {
  return createObservatoryInteractionKernel(buildObservatoryInteractionConfig(projection)).reduce(state, action);
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

export function encodeObservatoryHash(
  state: ObservatoryInteractionState,
  projection: MethodologyProjection,
): string {
  return createObservatoryInteractionKernel(buildObservatoryInteractionConfig(projection)).encode(state);
}

export function decodeObservatoryHash(
  hash: string,
  projection: MethodologyProjection,
): ObservatoryInteractionState {
  return createObservatoryInteractionKernel(buildObservatoryInteractionConfig(projection)).decode(hash);
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

function methodologyItemIds(version: MethodologyVersionProjection): string[] {
  return [...new Set([
    ...version.theoryReferences.map((entry) => entry.id),
    ...version.contractReferences.map((entry) => entry.id),
    ...version.positiveVectors.map((entry) => entry.id),
    ...version.negativeVectors.map((entry) => entry.id),
    ...version.evidenceReferences.map((entry) => entry.id),
    ...version.acceptanceReferences.map((entry) => entry.id),
  ])].sort((a, b) => a.localeCompare(b));
}

function methodologyCategories(version: MethodologyVersionProjection): string[] {
  const values = [classify(version).toLowerCase()];
  if (version.accepted) values.push("accepted");
  if (version.positiveVectors.length > 0) values.push("positive");
  if (version.negativeVectors.length > 0) values.push("negative");
  if (version.evidenceReferences.length > 0) values.push("evidence");
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}
