import {
  createObservatoryInteractionKernel,
  type ObservatoryInteractionConfig,
  type ObservatoryInteractionKernel,
  type ObservatoryInteractionState,
} from "./interaction.js";

export interface ObservatoryBrowserEvent {
  readonly target?: ObservatoryBrowserNode | null;
  readonly key?: string;
  preventDefault?: () => void;
}

export interface ObservatoryBrowserClassList {
  toggle(name: string, force?: boolean): void;
}

export interface ObservatoryBrowserNodeCollection extends Iterable<ObservatoryBrowserNode> {
  forEach(callback: (node: ObservatoryBrowserNode) => void): void;
}

export interface ObservatoryBrowserNode {
  readonly dataset: Record<string, string | undefined>;
  hidden?: boolean;
  textContent?: string | null;
  scrollLeft?: number;
  scrollTop?: number;
  readonly style?: Record<string, string | undefined>;
  readonly classList?: ObservatoryBrowserClassList;
  setAttribute(name: string, value: string): void;
  getAttribute(name: string): string | null;
  querySelector(selector: string): ObservatoryBrowserNode | null;
  querySelectorAll(selector: string): ObservatoryBrowserNodeCollection;
  closest?(selector: string): ObservatoryBrowserNode | null;
  focus?(): void;
  click?(): void;
  addEventListener?(type: string, listener: (event: ObservatoryBrowserEvent) => void): void;
}

export interface ObservatoryBrowserDocument {
  activeElement?: ObservatoryBrowserNode | null;
  querySelector(selector: string): ObservatoryBrowserNode | null;
  querySelectorAll(selector: string): ObservatoryBrowserNodeCollection;
}

export interface ObservatoryBrowserLocation {
  hash: string;
  readonly pathname: string;
  readonly search: string;
}

export interface ObservatoryBrowserHistory {
  replaceState(data: null, title: string, url: string): void;
}

export interface ObservatoryBrowserWindow {
  addEventListener(type: string, listener: (event: ObservatoryBrowserEvent) => void): void;
}

export interface ObservatoryBrowserEnvironment {
  readonly document: ObservatoryBrowserDocument;
  readonly location: ObservatoryBrowserLocation;
  readonly history: ObservatoryBrowserHistory;
  readonly window: ObservatoryBrowserWindow;
}

export interface ObservatoryBrowserController {
  readonly getState: () => ObservatoryInteractionState;
  readonly apply: () => void;
}

/**
 * Thin DOM adapter. State parsing, validation, filters and viewport policy are
 * delegated to the supplied canonical interaction kernel.
 */
export function installObservatoryBrowserController(
  environment: ObservatoryBrowserEnvironment,
  kernel: ObservatoryInteractionKernel,
): ObservatoryBrowserController {
  const map = environment.document.querySelector(".methodology-map");
  if (map === null) {
    let absentState = kernel.initialState();
    return Object.freeze({
      getState: () => absentState,
      apply: () => { absentState = kernel.decode(environment.location.hash); },
    });
  }
  const grid = map.querySelector(".methodology-grid");
  let state = kernel.decode(environment.location.hash);

  const visibleButtons = (): readonly ObservatoryBrowserNode[] => Array.from(map
    .querySelectorAll("button"))
    .filter((button) => button.hidden !== true && button.closest?.("[hidden]") == null);

  const statusStageLabel = (value: string | null): string => {
    switch (value) {
      case null: return "все";
      case "research": return "Исследование";
      case "problem": return "Проблема";
      case "candidate": return "Кандидат";
      case "challenged": return "Проверка";
      case "modeled": return "Модель / воспроизведение";
      case "accepted": return "Принято";
      case "released": return "Выпущено";
      default: return value;
    }
  };

  const statusFilterLabel = (value: string): string => {
    switch (value) {
      case "accepted": return "принятые";
      case "candidate": return "кандидаты";
      case "current": return "текущие";
      case "evidence": return "со свидетельствами";
      case "negative": return "отрицательные";
      case "positive": return "положительные";
      case "previous": return "предыдущие";
      default: return value;
    }
  };

  const apply = (): void => {
    map.querySelectorAll("[data-methodology-stage]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.methodologyStage === state.selectedStage));
    });
    map.querySelectorAll("[data-methodology-filter]").forEach((button) => {
      button.setAttribute("aria-pressed", String(state.filters.includes(button.dataset.methodologyFilter ?? "")));
    });
    const highlightedItemIds = new Set(kernel.highlightedItemIds(state));
    map.querySelectorAll("[data-item-id]").forEach((button) => {
      const itemId = button.dataset.itemId ?? "";
      button.setAttribute("aria-pressed", String(itemId === state.selectedItemId));
      button.classList?.toggle("trace-highlighted", highlightedItemIds.has(itemId));
    });
    map.querySelectorAll("[data-version-lane]").forEach((lane) => {
      const versionId = lane.dataset.versionLane ?? "";
      const selected = versionId === state.selectedVersionId;
      lane.hidden = !kernel.isVersionVisible(versionId, state);
      lane.classList?.toggle("selected", selected);
      lane.querySelector("[data-version-id]")?.setAttribute("aria-pressed", String(selected));
      lane.querySelectorAll("[data-lane-stage]").forEach((cell) => {
        cell.classList?.toggle("stage-selected", cell.dataset.laneStage === state.selectedStage);
      });
    });
    environment.document.querySelectorAll("[data-overview-version-id]").forEach((node) => {
      node.classList?.toggle("selection-synced", node.dataset.overviewVersionId === state.selectedVersionId);
    });
    if (grid !== null) {
      if (grid.style !== undefined) grid.style.zoom = String(state.viewport.scale);
      grid.scrollLeft = state.viewport.x;
      grid.scrollTop = state.viewport.y;
    }
    const status = map.querySelector(".methodology-status");
    if (status !== null) {
      const filters = state.filters.map(statusFilterLabel).join(", ") || "нет";
      status.textContent = `Выбрано: версия ${state.selectedVersionId ?? "нет"}; стадия: ${statusStageLabel(state.selectedStage)}; элемент: ${state.selectedItemId ?? "нет"}; фильтры: ${filters}; масштаб: ${state.viewport.scale}.`;
    }
    const active = environment.document.activeElement;
    if (active?.closest?.("[hidden]") != null) visibleButtons()[0]?.focus?.();
  };

  const commit = (next: ObservatoryInteractionState, replace = false): void => {
    state = next;
    const hash = kernel.encode(state);
    if (replace) {
      environment.history.replaceState(
        null,
        "",
        environment.location.pathname + environment.location.search + hash,
      );
    } else if (environment.location.hash !== hash) {
      environment.location.hash = hash;
    }
    apply();
  };

  const eventButton = (event: ObservatoryBrowserEvent): ObservatoryBrowserNode | null => {
    const target = event.target;
    return target?.closest?.("button") ?? null;
  };

  map.addEventListener?.("click", (event) => {
    const target = eventButton(event);
    if (target === null) return;
    const stage = target.dataset.methodologyStage;
    const versionId = target.dataset.versionId;
    const itemId = target.dataset.itemId;
    const filter = target.dataset.methodologyFilter;
    const viewportAction = target.dataset.viewportAction;
    if (stage !== undefined) {
      const nextStage = target.getAttribute("aria-pressed") === "true" ? null : stage;
      commit(kernel.reduce(state, { type: "select-stage", stage: nextStage as ObservatoryInteractionState["selectedStage"] }));
    } else if (versionId !== undefined) {
      commit(kernel.reduce(state, { type: "select-version", versionId }));
    } else if (itemId !== undefined) {
      commit(kernel.reduce(state, { type: "select-item", itemId }));
    } else if (filter !== undefined) {
      commit(kernel.reduce(state, { type: "toggle-filter", filter }));
    } else if (viewportAction === "reset") {
      commit(kernel.reduce(state, { type: "reset-viewport" }));
    } else if (viewportAction === "zoom-in") {
      commit(kernel.reduce(state, { type: "zoom", delta: 0.1 }));
    } else if (viewportAction === "zoom-out") {
      commit(kernel.reduce(state, { type: "zoom", delta: -0.1 }));
    }
  });

  map.addEventListener?.("keydown", (event) => {
    const key = event.key ?? "";
    const target = eventButton(event);
    if (target === null) return;
    if (key === "Enter" || key === " ") {
      event.preventDefault?.();
      target.click?.();
      return;
    }
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(key)) return;
    const buttons = visibleButtons();
    const current = buttons.indexOf(target);
    if (current < 0 || buttons.length === 0) return;
    event.preventDefault?.();
    let next = current;
    if (key === "Home") next = 0;
    else if (key === "End") next = buttons.length - 1;
    else if (key === "ArrowLeft" || key === "ArrowUp") next = (current - 1 + buttons.length) % buttons.length;
    else next = (current + 1) % buttons.length;
    buttons[next]?.focus?.();
  });

  grid?.addEventListener?.("scroll", () => {
    commit(kernel.reduce(state, {
      type: "set-viewport",
      viewport: {
        x: Math.round(grid.scrollLeft ?? 0),
        y: Math.round(grid.scrollTop ?? 0),
        scale: state.viewport.scale,
      },
    }), true);
  });

  environment.window.addEventListener("hashchange", () => {
    state = kernel.decode(environment.location.hash);
    apply();
  });

  apply();
  return Object.freeze({ getState: () => state, apply });
}

export function renderObservatoryBrowserControllerScript(
  config: ObservatoryInteractionConfig,
): string {
  const serialized = escapeJsonForScript(JSON.stringify(config));
  const kernelSource = createObservatoryInteractionKernel.toString();
  const controllerSource = installObservatoryBrowserController.toString();
  return `    <script data-observatory-controller="shared-kernel">\n(() => {\n  "use strict";\n  const createKernel = (${kernelSource});\n  const installController = (${controllerSource});\n  const config = ${serialized};\n  installController({ document, location, history, window }, createKernel(config));\n})();\n    </script>`;
}

function escapeJsonForScript(value: string): string {
  return value.replaceAll("<", "\\u003c").replaceAll(">", "\\u003e").replaceAll("&", "\\u0026");
}
