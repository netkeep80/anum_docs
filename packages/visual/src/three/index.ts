export * from "./renderer.js";

import {
  buildVisualGeometry3D,
  normalizeVisualLinkNetwork,
  type Physics3DState,
  type Point3D,
  type VisualArcOrientation3D,
  type VisualArcRole3D,
  type VisualCenterline3D,
  type VisualKey,
  type VisualLinkNetwork,
} from "../index.js";

// Explicit browser-companion presentation data. Geometry authority remains V2c.
// Three/WebGL renderer lifecycle enters only in V2f-B.

export const VISUAL_THREE_COLORS = Object.freeze({
  startOuter: 0xff0000,
  center: 0x00ff00,
  endOuter: 0x0000ff,
});

export interface VisualThreeNodeData {
  readonly key: VisualKey;
  readonly position: Point3D;
  readonly label?: string;
  readonly tags?: readonly string[];
  readonly draggable: true;
}

export interface VisualThreeArcData {
  readonly linkKey: VisualKey;
  readonly role: VisualArcRole3D;
  readonly semanticOrientation: VisualArcOrientation3D;
  readonly colorFrom: number;
  readonly colorTo: number;
  readonly centerline: VisualCenterline3D;
}

export interface VisualThreeSceneData {
  readonly nodes: readonly VisualThreeNodeData[];
  readonly arcs: readonly VisualThreeArcData[];
}

function point(value: Point3D): Point3D {
  return Object.freeze({ x: value.x, y: value.y, z: value.z });
}

export function buildVisualThreeSceneData(
  network: VisualLinkNetwork,
  state: Physics3DState,
): VisualThreeSceneData {
  const normalized = normalizeVisualLinkNetwork(network);
  const geometry = buildVisualGeometry3D(normalized, state.positions);
  const geometryByKey = new Map(geometry.links.map((link) => [link.key, link] as const));

  const nodes = normalized.links.map((link): VisualThreeNodeData => {
    const linkGeometry = geometryByKey.get(link.key)!;
    return Object.freeze({
      key: link.key,
      position: point(linkGeometry.center),
      draggable: true as const,
      ...(link.label === undefined ? {} : { label: link.label }),
      ...(link.tags === undefined ? {} : { tags: Object.freeze([...link.tags]) }),
    });
  });

  const arcs: VisualThreeArcData[] = [];
  for (const link of normalized.links) {
    const linkGeometry = geometryByKey.get(link.key)!;
    arcs.push(Object.freeze({
      linkKey: link.key,
      role: linkGeometry.start.role,
      semanticOrientation: linkGeometry.start.semanticOrientation,
      colorFrom: VISUAL_THREE_COLORS.startOuter,
      colorTo: VISUAL_THREE_COLORS.center,
      centerline: linkGeometry.start,
    }));
    arcs.push(Object.freeze({
      linkKey: link.key,
      role: linkGeometry.end.role,
      semanticOrientation: linkGeometry.end.semanticOrientation,
      colorFrom: VISUAL_THREE_COLORS.center,
      colorTo: VISUAL_THREE_COLORS.endOuter,
      centerline: linkGeometry.end,
    }));
  }

  return Object.freeze({
    nodes: Object.freeze(nodes),
    arcs: Object.freeze(arcs),
  });
}
