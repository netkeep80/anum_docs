import * as THREE from "three";
import { sampleCenterline3D, type Point3D } from "../geometry3d.js";
import type { VisualThreeArcData, VisualThreeSceneData } from "./index.js";

export interface VisualThreeContainer {
  readonly clientWidth: number;
  readonly clientHeight: number;
  appendChild(node: Node): Node;
  removeChild(node: Node): Node;
  contains(node: Node): boolean;
  getBoundingClientRect(): { readonly width: number; readonly height: number };
}

export interface VisualThreeRenderingSurface {
  readonly domElement: Node;
  setSize(width: number, height: number, updateStyle?: boolean): void;
  render(scene: THREE.Scene, camera: THREE.Camera): void;
  dispose(): void;
}

export interface VisualThreeResizeObserver {
  disconnect(): void;
}

export interface VisualThreeRendererOptions {
  readonly samples?: number;
  readonly nodeRadius?: number;
  readonly surfaceFactory?: () => VisualThreeRenderingSurface;
  readonly resizeObserverFactory?: (callback: () => void) => VisualThreeResizeObserver;
}

export interface VisualThreeRendererSnapshot {
  readonly mounted: true;
  readonly nodeCount: number;
  readonly arcCount: number;
  readonly arrowCount: number;
  readonly width: number;
  readonly height: number;
  readonly cameraPosition: Point3D;
}

type PresentationObject = THREE.Mesh | THREE.Line;

interface MountedRenderer {
  readonly container: VisualThreeContainer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly surface: VisualThreeRenderingSurface;
  readonly samples: number;
  readonly nodeRadius: number;
  readonly objects: PresentationObject[];
  readonly fitPoints: THREE.Vector3[];
  readonly target: THREE.Vector3;
  observer?: VisualThreeResizeObserver;
  nodeCount: number;
  arcCount: number;
  arrowCount: number;
  width: number;
  height: number;
}

const mounts = new WeakMap<object, MountedRenderer>();
const UP = new THREE.Vector3(0, 1, 0);

function positiveFinite(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : fallback;
}

function segmentCount(value: number | undefined): number {
  return Math.max(1, Math.floor(positiveFinite(value, 16)));
}

function viewport(container: VisualThreeContainer): readonly [number, number] {
  const rect = container.getBoundingClientRect();
  const width = Number.isFinite(container.clientWidth) && container.clientWidth > 0
    ? container.clientWidth : rect.width;
  const height = Number.isFinite(container.clientHeight) && container.clientHeight > 0
    ? container.clientHeight : rect.height;
  return [Math.max(1, Number.isFinite(width) ? width : 1), Math.max(1, Number.isFinite(height) ? height : 1)];
}

function render(state: MountedRenderer): void {
  state.surface.render(state.scene, state.camera);
}

function materialList(material: THREE.Material | THREE.Material[]): THREE.Material[] {
  return Array.isArray(material) ? material : [material];
}

function disposeObject(object: PresentationObject): void {
  object.geometry.dispose();
  for (const material of materialList(object.material)) material.dispose();
}

function clearPresentation(state: MountedRenderer): void {
  for (const object of state.objects) {
    state.scene.remove(object);
    disposeObject(object);
  }
  state.objects.length = 0;
  state.fitPoints.length = 0;
  state.nodeCount = 0;
  state.arcCount = 0;
  state.arrowCount = 0;
}

function threePoint(point: Point3D): THREE.Vector3 {
  return new THREE.Vector3(point.x, point.y, point.z);
}

function addNode(state: MountedRenderer, node: VisualThreeSceneData["nodes"][number]): void {
  const geometry = new THREE.SphereGeometry(state.nodeRadius, 12, 8);
  const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(node.position.x, node.position.y, node.position.z);
  mesh.userData = { kind: "link-center", key: node.key };
  state.scene.add(mesh);
  state.objects.push(mesh);
  state.fitPoints.push(threePoint(node.position));
  state.nodeCount += 1;
}

function addArc(state: MountedRenderer, arc: VisualThreeArcData): readonly THREE.Vector3[] {
  const sampled = sampleCenterline3D(arc.centerline, state.samples);
  const points = sampled.map(threePoint);
  const positions = new Float32Array(points.length * 3);
  const colors = new Float32Array(points.length * 3);
  const from = new THREE.Color(arc.colorFrom);
  const to = new THREE.Color(arc.colorTo);
  const mixed = new THREE.Color();

  for (let index = 0; index < points.length; index += 1) {
    const point = points[index]!;
    const offset = index * 3;
    positions[offset] = point.x;
    positions[offset + 1] = point.y;
    positions[offset + 2] = point.z;
    mixed.copy(from).lerp(to, points.length === 1 ? 0 : index / (points.length - 1));
    colors[offset] = mixed.r;
    colors[offset + 1] = mixed.g;
    colors[offset + 2] = mixed.b;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const material = new THREE.LineBasicMaterial({ vertexColors: true });
  const line = new THREE.Line(geometry, material);
  line.userData = { kind: "link-arc", key: arc.linkKey, role: arc.role };
  state.scene.add(line);
  state.objects.push(line);
  state.fitPoints.push(...points.map((point) => point.clone()));
  state.arcCount += 1;
  return points;
}

function addEndArrow(state: MountedRenderer, arc: VisualThreeArcData, points: readonly THREE.Vector3[]): void {
  if (arc.role !== "end" || points.length < 2) return;
  const tip = points.at(-1)!;
  const before = points.at(-2)!;
  const direction = tip.clone().sub(before);
  const length = direction.length();
  if (!Number.isFinite(length) || length <= 1e-12) return;
  direction.multiplyScalar(1 / length);

  const height = Math.max(state.nodeRadius * 1.3, 0.08);
  const geometry = new THREE.ConeGeometry(Math.max(state.nodeRadius * 0.45, 0.025), height, 8);
  const material = new THREE.MeshBasicMaterial({ color: arc.colorTo });
  const arrow = new THREE.Mesh(geometry, material);
  arrow.position.copy(tip).addScaledVector(direction, -height * 0.35);
  arrow.quaternion.setFromUnitVectors(UP, direction);
  arrow.userData = { kind: "end-arrow", key: arc.linkKey, role: arc.role };
  state.scene.add(arrow);
  state.objects.push(arrow);
  state.fitPoints.push(tip.clone());
  state.arrowCount += 1;
}

function populate(state: MountedRenderer, data: VisualThreeSceneData): void {
  clearPresentation(state);
  for (const node of data.nodes) addNode(state, node);
  for (const arc of data.arcs) {
    const points = addArc(state, arc);
    addEndArrow(state, arc, points);
  }
}

function defaultSurface(): VisualThreeRenderingSurface {
  return new THREE.WebGLRenderer({ antialias: true });
}

function snapshot(state: MountedRenderer): VisualThreeRendererSnapshot {
  return Object.freeze({
    mounted: true as const,
    nodeCount: state.nodeCount,
    arcCount: state.arcCount,
    arrowCount: state.arrowCount,
    width: state.width,
    height: state.height,
    cameraPosition: Object.freeze({ x: state.camera.position.x, y: state.camera.position.y, z: state.camera.position.z }),
  });
}

export function createVisualThreeRenderer(
  container: VisualThreeContainer,
  data: VisualThreeSceneData,
  options: VisualThreeRendererOptions = {},
): VisualThreeRendererSnapshot {
  destroyVisualThreeRenderer(container);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100000);
  camera.position.set(0, 0, 5);
  const surface = options.surfaceFactory?.() ?? defaultSurface();
  const state: MountedRenderer = {
    container,
    scene,
    camera,
    surface,
    samples: segmentCount(options.samples),
    nodeRadius: positiveFinite(options.nodeRadius, 0.12),
    objects: [],
    fitPoints: [],
    target: new THREE.Vector3(),
    nodeCount: 0,
    arcCount: 0,
    arrowCount: 0,
    width: 1,
    height: 1,
  };
  mounts.set(container, state);
  container.appendChild(surface.domElement);
  populate(state, data);
  resizeVisualThreeRenderer(container);
  fitVisualThreeRenderer(container);

  if (options.resizeObserverFactory) {
    state.observer = options.resizeObserverFactory(() => { resizeVisualThreeRenderer(container); });
  } else if (typeof ResizeObserver !== "undefined" && container instanceof Element) {
    const observer = new ResizeObserver(() => { resizeVisualThreeRenderer(container); });
    observer.observe(container);
    state.observer = observer;
  }
  return snapshot(state);
}

export function updateVisualThreeRenderer(container: VisualThreeContainer, data: VisualThreeSceneData): boolean {
  const state = mounts.get(container);
  if (!state) return false;
  populate(state, data);
  render(state);
  return true;
}

export function resizeVisualThreeRenderer(container: VisualThreeContainer): boolean {
  const state = mounts.get(container);
  if (!state) return false;
  const [width, height] = viewport(container);
  state.width = width;
  state.height = height;
  state.surface.setSize(width, height, false);
  state.camera.aspect = width / height;
  state.camera.updateProjectionMatrix();
  render(state);
  return true;
}

export function fitVisualThreeRenderer(container: VisualThreeContainer, padding = 1.15): boolean {
  const state = mounts.get(container);
  if (!state || state.fitPoints.length === 0 || !Number.isFinite(padding) || padding <= 0) return false;
  const box = new THREE.Box3().setFromPoints(state.fitPoints);
  const center = box.getCenter(new THREE.Vector3());
  let radius = 0;
  for (const point of state.fitPoints) radius = Math.max(radius, point.distanceTo(center));
  const halfFov = THREE.MathUtils.degToRad(state.camera.fov) / 2;
  const distance = Math.max(radius / Math.max(Math.sin(halfFov), 1e-6), state.nodeRadius * 4, 1) * padding;
  state.target.copy(center);
  state.camera.position.set(center.x, center.y, center.z + distance);
  state.camera.lookAt(center);
  state.camera.updateMatrixWorld();
  render(state);
  return true;
}

export function zoomVisualThreeRenderer(container: VisualThreeContainer, factor: number): boolean {
  const state = mounts.get(container);
  if (!state || !Number.isFinite(factor) || factor <= 0) return false;
  const offset = state.camera.position.clone().sub(state.target);
  if (offset.lengthSq() <= 1e-24) offset.set(0, 0, 1);
  state.camera.position.copy(state.target).add(offset.multiplyScalar(factor));
  state.camera.lookAt(state.target);
  state.camera.updateMatrixWorld();
  render(state);
  return true;
}

export function getVisualThreeRendererSnapshot(container: VisualThreeContainer): VisualThreeRendererSnapshot | undefined {
  const state = mounts.get(container);
  return state ? snapshot(state) : undefined;
}

export function destroyVisualThreeRenderer(container: VisualThreeContainer): boolean {
  const state = mounts.get(container);
  if (!state) return false;
  state.observer?.disconnect();
  clearPresentation(state);
  if (container.contains(state.surface.domElement)) container.removeChild(state.surface.domElement);
  state.surface.dispose();
  mounts.delete(container);
  return true;
}
