import {
  installObservatoryBrowserController,
  renderObservatoryBrowserControllerScript,
  type ObservatoryBrowserDocument,
  type ObservatoryBrowserEnvironment,
  type ObservatoryBrowserEvent,
  type ObservatoryBrowserNode,
} from "../src/browser-controller.js";
import {
  METHODOLOGY_STAGE_ORDER,
  OBSERVATORY_FILTERS,
  createObservatoryInteractionKernel,
  type ObservatoryInteractionConfig,
} from "../src/interaction.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Contract Observatory V4c browser controller: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

class FakeNode implements ObservatoryBrowserNode {
  readonly dataset: Record<string, string | undefined>;
  readonly style: Record<string, string | undefined> = {};
  readonly children: FakeNode[] = [];
  readonly classes = new Set<string>();
  readonly attributes = new Map<string, string>();
  readonly listeners = new Map<string, ((event: ObservatoryBrowserEvent) => void)[]>();
  readonly classList = {
    toggle: (name: string, force?: boolean): void => {
      const enabled = force ?? !this.classes.has(name);
      enabled ? this.classes.add(name) : this.classes.delete(name);
    },
  };
  parent: FakeNode | null = null;
  ownerDocument: FakeDocument | null = null;
  hidden = false;
  textContent: string | null = null;
  scrollLeft = 0;
  scrollTop = 0;

  constructor(
    readonly tagName = "div",
    classes: readonly string[] = [],
    dataset: Record<string, string | undefined> = {},
  ) {
    classes.forEach((value) => this.classes.add(value));
    this.dataset = { ...dataset };
  }

  append(...nodes: FakeNode[]): this {
    for (const node of nodes) {
      node.parent = this;
      node.setOwnerDocument(this.ownerDocument);
      this.children.push(node);
    }
    return this;
  }

  setOwnerDocument(document: FakeDocument | null): void {
    this.ownerDocument = document;
    this.children.forEach((child) => child.setOwnerDocument(document));
  }

  setAttribute(name: string, value: string): void { this.attributes.set(name, value); }
  getAttribute(name: string): string | null { return this.attributes.get(name) ?? null; }

  querySelector(selector: string): FakeNode | null { return this.querySelectorAll(selector)[0] ?? null; }

  querySelectorAll(selector: string): FakeNode[] {
    const result: FakeNode[] = [];
    const visit = (node: FakeNode): void => {
      for (const child of node.children) {
        if (child.matches(selector)) result.push(child);
        visit(child);
      }
    };
    visit(this);
    return result;
  }

  closest(selector: string): FakeNode | null {
    let current: FakeNode | null = this;
    while (current !== null) {
      if (current.matches(selector)) return current;
      current = current.parent;
    }
    return null;
  }

  matches(selector: string): boolean {
    if (selector === "button") return this.tagName === "button";
    if (selector === "[hidden]") return this.hidden;
    if (selector.startsWith(".")) return this.classes.has(selector.slice(1));
    const data = selector.match(/^\[data-([a-z0-9-]+)\]$/);
    if (data !== null) {
      const key = data[1]!.replace(/-([a-z])/g, (_all, letter: string) => letter.toUpperCase());
      return this.dataset[key] !== undefined;
    }
    return false;
  }

  focus(): void { if (this.ownerDocument !== null) this.ownerDocument.activeElement = this; }

  click(): void {
    let current: FakeNode | null = this;
    const event: ObservatoryBrowserEvent = { target: this };
    while (current !== null) {
      current.emit("click", event);
      current = current.parent;
    }
  }

  addEventListener(type: string, listener: (event: ObservatoryBrowserEvent) => void): void {
    const entries = this.listeners.get(type) ?? [];
    entries.push(listener);
    this.listeners.set(type, entries);
  }

  emit(type: string, event: ObservatoryBrowserEvent = { target: this }): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

class FakeDocument implements ObservatoryBrowserDocument {
  activeElement: FakeNode | null = null;
  constructor(readonly root: FakeNode) {
    root.setOwnerDocument(this);
  }
  querySelector(selector: string): FakeNode | null {
    if (this.root.matches(selector)) return this.root;
    return this.root.querySelector(selector);
  }
  querySelectorAll(selector: string): FakeNode[] {
    const descendants = this.root.querySelectorAll(selector);
    return this.root.matches(selector) ? [this.root, ...descendants] : descendants;
  }
}

class FakeWindow {
  readonly listeners = new Map<string, ((event: ObservatoryBrowserEvent) => void)[]>();
  addEventListener(type: string, listener: (event: ObservatoryBrowserEvent) => void): void {
    const entries = this.listeners.get(type) ?? [];
    entries.push(listener);
    this.listeners.set(type, entries);
  }
  emit(type: string): void { for (const listener of this.listeners.get(type) ?? []) listener({}); }
}

const config: ObservatoryInteractionConfig = Object.freeze({
  versions: Object.freeze([
    Object.freeze({
      id: "current",
      categories: Object.freeze(["accepted", "current", "evidence", "negative"]),
      itemIds: Object.freeze(["item:current", "item:linked"]),
      relations: Object.freeze([
        Object.freeze({ from: "item:current", to: "item:linked" }),
      ]),
    }),
    Object.freeze({
      id: "previous",
      categories: Object.freeze(["accepted", "positive", "previous"]),
      itemIds: Object.freeze(["item:previous"]),
      relations: Object.freeze([]),
    }),
  ]),
  defaultVersionId: "current",
  stages: METHODOLOGY_STAGE_ORDER,
  filters: OBSERVATORY_FILTERS,
  minScale: 0.7,
  maxScale: 1.8,
  zoomStep: 0.1,
});

const body = new FakeNode("body");
const map = new FakeNode("section", ["methodology-map"]);
const stageCandidate = new FakeNode("button", [], { methodologyStage: "candidate" });
const stageAccepted = new FakeNode("button", [], { methodologyStage: "accepted" });
const filterCurrent = new FakeNode("button", [], { methodologyFilter: "current" });
const filterNegative = new FakeNode("button", [], { methodologyFilter: "negative" });
const filterPositive = new FakeNode("button", [], { methodologyFilter: "positive" });
const zoomIn = new FakeNode("button", [], { viewportAction: "zoom-in" });
const reset = new FakeNode("button", [], { viewportAction: "reset" });
const grid = new FakeNode("div", ["methodology-grid"]);
const currentLane = new FakeNode("div", [], { versionLane: "current" });
const currentVersion = new FakeNode("button", [], { versionId: "current" });
const currentCandidateCell = new FakeNode("div", [], { laneStage: "candidate" });
const currentItem = new FakeNode("button", [], { itemId: "item:current" });
const currentLinkedItem = new FakeNode("button", [], { itemId: "item:linked" });
currentLane.append(currentVersion, currentCandidateCell, currentItem, currentLinkedItem);
const previousLane = new FakeNode("div", [], { versionLane: "previous" });
const previousVersion = new FakeNode("button", [], { versionId: "previous" });
const previousCandidateCell = new FakeNode("div", [], { laneStage: "candidate" });
const previousItem = new FakeNode("button", [], { itemId: "item:previous" });
previousLane.append(previousVersion, previousCandidateCell, previousItem);
grid.append(currentLane, previousLane);
const status = new FakeNode("p", ["methodology-status"]);
map.append(stageCandidate, stageAccepted, filterCurrent, filterNegative, filterPositive, zoomIn, reset, grid, status);
const currentOverview = new FakeNode("a", [], { overviewVersionId: "current" });
const previousOverview = new FakeNode("a", [], { overviewVersionId: "previous" });
body.append(map, currentOverview, previousOverview);
const document = new FakeDocument(body);
const location = {
  hash: "#v=missing&s=unknown&item=%3Cscript%3E&f=unknown&z=99",
  pathname: "/observatory/",
  search: "",
};
const window = new FakeWindow();
let replaceCount = 0;
const history = {
  replaceState: (_data: null, _title: string, url: string): void => {
    replaceCount += 1;
    const marker = url.indexOf("#");
    location.hash = marker >= 0 ? url.slice(marker) : "";
  },
};
const environment: ObservatoryBrowserEnvironment = { document, location, history, window };
const controller = installObservatoryBrowserController(environment, createObservatoryInteractionKernel(config));

same(controller.getState().selectedVersionId, "current", "unknown version fails closed in the actual browser controller");
same(controller.getState().selectedStage, null, "unknown stage fails closed in the actual browser controller");
same(controller.getState().selectedItemId, null, "script-like unknown item fails closed in the actual browser controller");
same(controller.getState().filters.length, 0, "unknown filters fail closed in the actual browser controller");
same(controller.getState().viewport.scale, 1.8, "browser controller uses canonical zoom clamp");
same(currentVersion.getAttribute("aria-pressed"), "true", "default current version is selected in DOM");
assert(currentOverview.classes.has("selection-synced"), "overview selection derives from canonical state");
assert(!(status.textContent ?? "").includes("<script>"), "malicious hash data remains inert and absent from rendered status");

stageCandidate.click();
same(controller.getState().selectedStage, "candidate", "stage click reduces through canonical state");
same(stageCandidate.getAttribute("aria-pressed"), "true", "stage DOM state follows canonical state");
currentItem.click();
same(controller.getState().selectedItemId, "item:current", "known evidence item selection is canonical");
assert(currentItem.classes.has("trace-highlighted"), "selected item receives trace highlight");
assert(currentLinkedItem.classes.has("trace-highlighted"), "source-linked item receives trace highlight");
assert(!previousItem.classes.has("trace-highlighted"), "unrelated version item is not highlighted");

previousVersion.focus();
filterCurrent.click();
filterNegative.click();
same(controller.getState().filters.join(","), "current,negative", "filter toggles use canonical normalized order");
same(currentLane.hidden, false, "conjunctive CURRENT + NEGATIVE retains matching lane");
same(previousLane.hidden, true, "conjunctive CURRENT + NEGATIVE hides partial match");
assert(document.activeElement !== previousVersion, "focus is repaired when filtering hides the focused lane");
filterCurrent.click();
filterNegative.click();
same(controller.getState().filters.length, 0, "filter toggles are reversible");

let prevented = false;
stageCandidate.focus();
map.emit("keydown", { target: stageCandidate, key: "ArrowRight", preventDefault: () => { prevented = true; } });
assert(prevented, "arrow keyboard navigation prevents scroll side effects");
same(document.activeElement, stageAccepted, "arrow keyboard navigation follows visible control order");
map.emit("keydown", { target: stageCandidate, key: " ", preventDefault: () => undefined });
same(controller.getState().selectedStage, null, "Space activates button and toggles selected stage off");
map.emit("keydown", { target: stageCandidate, key: "Enter", preventDefault: () => undefined });
same(controller.getState().selectedStage, "candidate", "Enter activates button through the same click path");

for (let index = 0; index < 20; index += 1) zoomIn.click();
same(controller.getState().viewport.scale, 1.8, "repeated browser zoom remains canonically bounded");
reset.click();
same(controller.getState().viewport.scale, 1, "viewport reset uses canonical reducer");

location.hash = "#v=previous&item=item%3Aprevious&f=positive&x=12&y=5&z=.5";
window.emit("hashchange");
same(controller.getState().selectedVersionId, "previous", "hashchange/back-forward restores canonical version");
same(controller.getState().selectedItemId, "item:previous", "hashchange restores canonical known item");
same(controller.getState().filters.join(","), "positive", "hashchange restores canonical filters");
same(controller.getState().viewport.scale, 0.7, "hashchange uses the same viewport clamp");
same(grid.scrollLeft, 12, "canonical viewport x is rendered");
same(grid.scrollTop, 5, "canonical viewport y is rendered");

grid.scrollLeft = 21;
grid.scrollTop = 9;
grid.emit("scroll", { target: grid });
same(controller.getState().viewport.x, 21, "scroll updates canonical viewport x");
same(controller.getState().viewport.y, 9, "scroll updates canonical viewport y");
assert(replaceCount > 0, "scroll uses replaceState rather than history-spamming navigation");
assert(location.hash.includes("x=21") && location.hash.includes("y=9"), "replaceState receives canonical hash bytes");

const generated = renderObservatoryBrowserControllerScript(config);
assert(generated.includes("data-observatory-controller=\"shared-kernel\""), "generated page marks the shared-kernel controller");
assert(generated.includes("createKernel"), "generated page embeds the exact canonical kernel factory");
assert(!generated.includes("const readState ="), "generated controller does not retain the old handwritten hash parser");

console.log("Contract Observatory V4c/V4d executable browser-controller specification passed.");
