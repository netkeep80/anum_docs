import {
  type Physics3DState,
  type Point3D,
  type VisualLinkNetwork,
} from "../src/index.js";
import {
  VISUAL_THREE_COLORS,
  buildVisualThreeSceneData,
  type VisualThreeSceneData,
} from "../src/three/index.js";
import {
  createVisualThreeRenderer,
  destroyVisualThreeRenderer,
  fitVisualThreeRenderer,
  getVisualThreeRendererSnapshot,
  resizeVisualThreeRenderer,
  updateVisualThreeRenderer,
  zoomVisualThreeRenderer,
} from "../src/three/renderer.js";

type DisposableProbe = {
  addEventListener?: (type: string, listener: () => void) => void;
};

type GeometryProbe = DisposableProbe & {
  getAttribute?: (name: string) => { readonly array: ArrayLike<number> } | undefined;
};

type MaterialProbe = DisposableProbe;

type ObjectProbe = {
  readonly userData?: Readonly<Record<string, unknown>>;
  readonly position?: Point3D;
  readonly quaternion?: Readonly<{ x: number; y: number; z: number; w: number }>;
  readonly scale?: Point3D;
  readonly geometry?: GeometryProbe;
  readonly material?: MaterialProbe | readonly MaterialProbe[];
};

type SceneProbe = {
  readonly children: readonly ObjectProbe[];
};

type CameraProbe = {
  readonly position: Point3D;
  readonly aspect: number;
};

type RendererSnapshotProbe = {
  readonly mounted: true;
  readonly nodeCount: number;
  readonly arcCount: number;
  readonly arrowCount: number;
  readonly width: number;
  readonly height: number;
  readonly cameraPosition: Point3D;
};

type FakeElement = { readonly token: string; parentNode?: FakeContainer | null };

type FakeContainer = {
  clientWidth: number;
  clientHeight: number;
  readonly children: FakeElement[];
  appendChild: (element: FakeElement) => FakeElement;
  removeChild: (element: FakeElement) => FakeElement;
  contains: (element: FakeElement) => boolean;
  getBoundingClientRect: () => { width: number; height: number };
};

type SurfaceProbe = {
  readonly domElement: FakeElement;
  setSize: (width: number, height: number, updateStyle?: boolean) => void;
  render: (scene: unknown, camera: unknown) => void;
  dispose: () => void;
};

type ObserverProbe = { disconnect: () => void };

type RendererOptionsProbe = {
  readonly samples?: number;
  readonly nodeRadius?: number;
  readonly surfaceFactory?: () => SurfaceProbe;
  readonly resizeObserverFactory?: (callback: () => void) => ObserverProbe;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`@mts/visual V2f-B: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

function close(actual: number, expected: number, message: string, epsilon = 1e-6): void {
  assert(Math.abs(actual - expected) <= epsilon, `${message}: ${actual} != ${expected}`);
}

function finitePoint(value: Point3D): boolean {
  return Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z);
}

function container(width = 640, height = 360): FakeContainer {
  const children: FakeElement[] = [];
  const result: FakeContainer = {
    clientWidth: width,
    clientHeight: height,
    children,
    appendChild(element) {
      if (!children.includes(element)) children.push(element);
      element.parentNode = result;
      return element;
    },
    removeChild(element) {
      const index = children.indexOf(element);
      if (index >= 0) children.splice(index, 1);
      element.parentNode = null;
      return element;
    },
    contains: (element) => children.includes(element),
    getBoundingClientRect: () => ({ width: result.clientWidth, height: result.clientHeight }),
  };
  return result;
}

function sceneData(): VisualThreeSceneData {
  const network: VisualLinkNetwork = {
    links: [
      { key: "R", startKey: "R", endKey: "R", label: "∞", tags: ["root"] },
      { key: "O", startKey: "O", endKey: "R" },
      { key: "C", startKey: "R", endKey: "C" },
      { key: "L", startKey: "O", endKey: "C" },
      { key: "U", startKey: "C", endKey: "O" },
      { key: "X", startKey: "L", endKey: "U" },
    ],
  };
  const points: Readonly<Record<string, Point3D>> = {
    R: { x: 0, y: 0, z: 0 },
    O: { x: -2, y: 1, z: 0.5 },
    C: { x: 2, y: -1, z: -0.5 },
    L: { x: -1, y: 2, z: 1.5 },
    U: { x: 1, y: -2, z: -1.5 },
    X: { x: 0.5, y: 0.75, z: 2.5 },
  };
  const keys = Object.keys(points);
  const state: Physics3DState = {
    positions: keys.map((key) => ({ key, point: points[key]! })),
    velocities: keys.map((key) => ({ key, vector: { x: 0, y: 0, z: 0 } })),
  };
  return buildVisualThreeSceneData(network, state);
}

function rootOnlyScene(): VisualThreeSceneData {
  const network: VisualLinkNetwork = {
    links: [{ key: "R", startKey: "R", endKey: "R", label: "∞", tags: ["root"] }],
  };
  return buildVisualThreeSceneData(network, {
    positions: [{ key: "R", point: { x: 0, y: 0, z: 0 } }],
    velocities: [{ key: "R", vector: { x: 0, y: 0, z: 0 } }],
  });
}

const host = container();
let latestScene: SceneProbe | undefined;
let latestCamera: CameraProbe | undefined;
const sizes: Array<readonly [number, number, boolean | undefined]> = [];
let renderCount = 0;
let surfaceDisposeCount = 0;
let observerDisconnectCount = 0;
let observerCallback: (() => void) | undefined;

function surface(): SurfaceProbe {
  return {
    domElement: { token: `surface-${surfaceDisposeCount}-${renderCount}`, parentNode: null },
    setSize(width, height, updateStyle) {
      sizes.push([width, height, updateStyle]);
    },
    render(scene, camera) {
      latestScene = scene as SceneProbe;
      latestCamera = camera as CameraProbe;
      renderCount += 1;
    },
    dispose() {
      surfaceDisposeCount += 1;
    },
  };
}

const options: RendererOptionsProbe = {
  samples: 12,
  nodeRadius: 0.12,
  surfaceFactory: surface,
  resizeObserverFactory(callback) {
    observerCallback = callback;
    return { disconnect: () => { observerDisconnectCount += 1; } };
  },
};

const initialScene = sceneData();
const first = createVisualThreeRenderer(host as never, initialScene, options as never) as RendererSnapshotProbe;
same(first.nodeCount, 6, "one center mesh per represented Link");
same(first.arcCount, 12, "two graphical arc lines per represented Link");
same(first.arrowCount, 6, "one direction arrow per END arc");
same(first.width, 640, "initial viewport width");
same(first.height, 360, "initial viewport height");
assert(finitePoint(first.cameraPosition), "initial camera position finite");
same(host.children.length, 1, "rendering surface attached once");
assert(renderCount > 0, "create renders at least once");
assert(latestScene !== undefined, "create supplies real Three scene to rendering surface");
assert(latestCamera !== undefined, "create supplies real Three camera to rendering surface");

const centers = latestScene.children.filter((object) => object.userData?.kind === "link-center");
const arcs = latestScene.children.filter((object) => object.userData?.kind === "link-arc");
const arrows = latestScene.children.filter((object) => object.userData?.kind === "end-arrow");
same(centers.length, 6, "scene has exactly one center Mesh per Link");
same(arcs.length, 12, "scene has exact arc Line count");
same(arrows.length, 6, "scene has END arrows only");

const rootMesh = centers.find((object) => object.userData?.key === "R");
assert(rootMesh !== undefined, "root center mesh present");
same(rootMesh.userData?.kind, "link-center", "root has ordinary center kind");
same(rootMesh.userData?.key, "R", "root key remains presentation identity");
close(rootMesh.scale?.x ?? 1, 1, "root gets no special scale.x");
close(rootMesh.scale?.y ?? 1, 1, "root gets no special scale.y");
close(rootMesh.scale?.z ?? 1, 1, "root gets no special scale.z");

function line(role: "start" | "end", key: string): ObjectProbe {
  const result = arcs.find((object) => object.userData?.role === role && object.userData?.key === key);
  assert(result !== undefined, `missing ${role} line ${key}`);
  return result;
}

function colors(object: ObjectProbe): ArrayLike<number> {
  const attribute = object.geometry?.getAttribute?.("color");
  assert(attribute !== undefined, "gradient line has color attribute");
  return attribute.array;
}

function colorAt(values: ArrayLike<number>, vertex: number): readonly [number, number, number] {
  const offset = vertex * 3;
  return [values[offset]!, values[offset + 1]!, values[offset + 2]!];
}

const startLine = line("start", "X");
const endLine = line("end", "X");
const startColors = colors(startLine);
const endColors = colors(endLine);
const startLast = startColors.length / 3 - 1;
const endLast = endColors.length / 3 - 1;
const [sr, sg, sb] = colorAt(startColors, 0);
close(sr, 1, "START outer is red.r"); close(sg, 0, "START outer is red.g"); close(sb, 0, "START outer is red.b");
const [scr, scg, scb] = colorAt(startColors, startLast);
close(scr, 0, "START center is green.r"); close(scg, 1, "START center is green.g"); close(scb, 0, "START center is green.b");
const [ecr, ecg, ecb] = colorAt(endColors, 0);
close(ecr, 0, "END center is green.r"); close(ecg, 1, "END center is green.g"); close(ecb, 0, "END center is green.b");
const [er, eg, eb] = colorAt(endColors, endLast);
close(er, 0, "END outer is blue.r"); close(eg, 0, "END outer is blue.g"); close(eb, 1, "END outer is blue.b");
same(VISUAL_THREE_COLORS.startOuter, 0xff0000, "shared RED identity retained");
same(VISUAL_THREE_COLORS.center, 0x00ff00, "shared GREEN identity retained");
same(VISUAL_THREE_COLORS.endOuter, 0x0000ff, "shared BLUE identity retained");

const firstSnapshot = getVisualThreeRendererSnapshot(host as never) as RendererSnapshotProbe | undefined;
assert(firstSnapshot !== undefined, "mounted snapshot available");
const beforeInvalidZoom = JSON.stringify(firstSnapshot.cameraPosition);
same(zoomVisualThreeRenderer(host as never, 0), false, "zero zoom rejected");
same(zoomVisualThreeRenderer(host as never, Number.NaN), false, "NaN zoom rejected");
same(JSON.stringify((getVisualThreeRendererSnapshot(host as never) as RendererSnapshotProbe).cameraPosition), beforeInvalidZoom, "invalid zoom does not mutate camera");
same(zoomVisualThreeRenderer(host as never, 0.5), true, "positive finite zoom accepted");
assert(finitePoint((getVisualThreeRendererSnapshot(host as never) as RendererSnapshotProbe).cameraPosition), "zoomed camera finite");

host.clientWidth = 800;
host.clientHeight = 500;
same(resizeVisualThreeRenderer(host as never), true, "resize mounted renderer");
same(sizes.at(-1)?.[0], 800, "resize width propagated");
same(sizes.at(-1)?.[1], 500, "resize height propagated");
close(latestCamera?.aspect ?? 0, 1.6, "camera aspect updated");
observerCallback?.();
same(sizes.at(-1)?.[0], 800, "observer callback uses current width");

same(fitVisualThreeRenderer(host as never, 1.2), true, "fit finite non-coplanar scene");
assert(finitePoint((getVisualThreeRendererSnapshot(host as never) as RendererSnapshotProbe).cameraPosition), "fit camera finite");

const disposableObjects = [...latestScene.children];
let objectDisposeEvents = 0;
for (const object of disposableObjects) {
  object.geometry?.addEventListener?.("dispose", () => { objectDisposeEvents += 1; });
  const materials = Array.isArray(object.material) ? object.material : object.material ? [object.material] : [];
  for (const material of materials) material.addEventListener?.("dispose", () => { objectDisposeEvents += 1; });
}

same(updateVisualThreeRenderer(host as never, rootOnlyScene()), true, "scene data update succeeds");
const updated = getVisualThreeRendererSnapshot(host as never) as RendererSnapshotProbe;
same(updated.nodeCount, 1, "update replaces center meshes");
same(updated.arcCount, 2, "update replaces arc lines");
same(updated.arrowCount, 1, "update retains END-only arrow count");
assert(objectDisposeEvents > 0, "update disposes replaced Three resources");
same(fitVisualThreeRenderer(host as never), true, "self-loop-only scene fits finitely");
assert(finitePoint((getVisualThreeRendererSnapshot(host as never) as RendererSnapshotProbe).cameraPosition), "self-loop fit finite");

const disposedBeforeReplace = surfaceDisposeCount;
createVisualThreeRenderer(host as never, initialScene, options as never);
same(surfaceDisposeCount, disposedBeforeReplace + 1, "second create destroys previous rendering surface");
same(observerDisconnectCount, 1, "second create disconnects previous observer");
same(host.children.length, 1, "second create leaves one attached surface");

same(destroyVisualThreeRenderer(host as never), true, "destroy mounted renderer");
same(surfaceDisposeCount, disposedBeforeReplace + 2, "destroy disposes current rendering surface");
same(observerDisconnectCount, 2, "destroy disconnects current observer");
same(host.children.length, 0, "destroy removes owned rendering element");
same(destroyVisualThreeRenderer(host as never), false, "destroy is idempotent");
same(getVisualThreeRendererSnapshot(host as never), undefined, "destroy removes mount snapshot");
same(resizeVisualThreeRenderer(host as never), false, "resize missing mount is safe false");
same(fitVisualThreeRenderer(host as never), false, "fit missing mount is safe false");
same(zoomVisualThreeRenderer(host as never, 1.1), false, "zoom missing mount is safe false");
same(updateVisualThreeRenderer(host as never, initialScene), false, "update missing mount is safe false");
