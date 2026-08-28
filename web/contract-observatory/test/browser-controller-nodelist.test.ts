import {
  installObservatoryBrowserController,
  type ObservatoryBrowserEnvironment,
  type ObservatoryBrowserEvent,
  type ObservatoryBrowserNode,
} from "../src/browser-controller.js";
import type {
  ObservatoryInteractionKernel,
  ObservatoryInteractionState,
} from "../src/interaction.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Contract Observatory NodeList regression: ${message}`);
}

class NodeListLike<T> implements Iterable<T> {
  readonly length: number;

  constructor(private readonly values: readonly T[]) {
    this.length = values.length;
  }

  forEach(callback: (value: T, index: number) => void): void {
    this.values.forEach(callback);
  }

  item(index: number): T | null {
    return this.values[index] ?? null;
  }

  [Symbol.iterator](): Iterator<T> {
    return this.values[Symbol.iterator]();
  }
}

const emptyNodes = new NodeListLike<ObservatoryBrowserNode>([]);
const listeners = new Map<string, ((event: ObservatoryBrowserEvent) => void)[]>();

const button: ObservatoryBrowserNode = {
  dataset: {},
  setAttribute: () => undefined,
  getAttribute: () => null,
  querySelector: () => null,
  querySelectorAll: () => emptyNodes as unknown as readonly ObservatoryBrowserNode[],
  closest: (selector) => selector === "button" ? button : null,
  focus: () => undefined,
};

const buttonNodes = new NodeListLike<ObservatoryBrowserNode>([button]);
assert(!("filter" in buttonNodes), "NodeList-like collection must not expose Array.prototype.filter");

const map: ObservatoryBrowserNode = {
  dataset: {},
  setAttribute: () => undefined,
  getAttribute: () => null,
  querySelector: () => null,
  querySelectorAll: (selector) => (
    selector === "button" ? buttonNodes : emptyNodes
  ) as unknown as readonly ObservatoryBrowserNode[],
  addEventListener: (type, listener) => {
    const entries = listeners.get(type) ?? [];
    entries.push(listener);
    listeners.set(type, entries);
  },
};

const state: ObservatoryInteractionState = Object.freeze({
  selectedVersionId: null,
  selectedStage: null,
  selectedItemId: null,
  filters: Object.freeze([]),
  viewport: Object.freeze({ x: 0, y: 0, scale: 1 }),
});

const kernel: ObservatoryInteractionKernel = Object.freeze({
  initialState: () => state,
  decode: () => state,
  encode: () => "#",
  reduce: (current) => current,
  isVersionVisible: () => true,
});

const environment: ObservatoryBrowserEnvironment = {
  document: {
    activeElement: null,
    querySelector: (selector) => selector === ".methodology-map" ? map : null,
    querySelectorAll: () => emptyNodes as unknown as readonly ObservatoryBrowserNode[],
  },
  location: {
    hash: "#",
    pathname: "/observatory/",
    search: "",
  },
  history: {
    replaceState: () => undefined,
  },
  window: {
    addEventListener: () => undefined,
  },
};

installObservatoryBrowserController(environment, kernel);

const keydown = listeners.get("keydown")?.[0];
assert(keydown !== undefined, "controller must install keyboard navigation");
keydown({ target: button, key: "ArrowRight", preventDefault: () => undefined });

console.log("Contract Observatory NodeList regression passed.");
