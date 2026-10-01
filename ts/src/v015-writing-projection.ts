import {
  V015_SEMANTIC_SOURCE_ORDER_SCHEMA,
  declareV015SemanticSourceOrder,
  type V015DirectAssociationAlgebra,
  type V015SemanticSourceOrder,
} from "./v015-direct-association.js";

export const V015_WRITING_PROJECTION_SCHEMA =
  "mts-v0.15/writing-direction-projection/research-v0" as const;

export const V015_WRITING_DIRECTION_RESEARCH = Object.freeze({
  status: "RESEARCH_NOT_ACCEPTED" as const,
  semanticOrderAuthority: V015_SEMANTIC_SOURCE_ORDER_SCHEMA,
  writingDirections: Object.freeze(["LTR", "RTL"] as const),
  explicitGroupingOverridesDefaultAssociation: true,
  writingDirectionIsSemanticOrientation: false,
  chiralityAuthority: false,
  contextOrientationAuthority: false,
});

export type V015WritingDirection = "LTR" | "RTL";

export type V015SurfaceExpression<T> =
  | { readonly kind: "ATOM"; readonly value: T }
  | {
      readonly kind: "DIRECT";
      readonly source: V015SemanticSourceOrder<V015SurfaceExpression<T>>;
    }
  | {
      readonly kind: "GROUP";
      readonly expression: V015SurfaceExpression<T>;
    };

export type V015ProjectionToken<T> =
  | { readonly kind: "ATOM"; readonly value: T }
  | { readonly kind: "ARROW" }
  | { readonly kind: "OPEN" }
  | { readonly kind: "CLOSE" };

export interface V015WritingProjection<T> {
  readonly schema: typeof V015_WRITING_PROJECTION_SCHEMA;
  readonly direction: V015WritingDirection;
  readonly physicalTokens: readonly V015ProjectionToken<T>[];
}

export type V015WritingProjectionErrorCode =
  | "invalid-projection"
  | "invalid-token-stream"
  | "unimplemented";

export class V015WritingProjectionError extends Error {
  override readonly name = "V015WritingProjectionError";

  constructor(readonly code: V015WritingProjectionErrorCode) {
    super(code);
  }
}

export function v015Atom<T>(value: T): V015SurfaceExpression<T> {
  return Object.freeze({ kind: "ATOM" as const, value });
}

export function v015Direct<T>(
  values: readonly V015SurfaceExpression<T>[],
): V015SurfaceExpression<T> {
  return Object.freeze({
    kind: "DIRECT" as const,
    source: declareV015SemanticSourceOrder(values),
  });
}

export function v015Group<T>(
  expression: V015SurfaceExpression<T>,
): V015SurfaceExpression<T> {
  return Object.freeze({ kind: "GROUP" as const, expression });
}

export function renderV015WritingProjection<T>(
  expression: V015SurfaceExpression<T>,
  direction: V015WritingDirection,
): V015WritingProjection<T> {
  void expression;
  void direction;
  throw new V015WritingProjectionError("unimplemented");
}

export function parseV015WritingProjection<T>(
  projection: V015WritingProjection<T>,
): V015SurfaceExpression<T> {
  void projection;
  throw new V015WritingProjectionError("unimplemented");
}

export function denoteV015SurfaceExpression<T>(
  expression: V015SurfaceExpression<T>,
  algebra: V015DirectAssociationAlgebra<T>,
): T {
  void expression;
  void algebra;
  throw new V015WritingProjectionError("unimplemented");
}

export function semanticStructureEqual<T>(
  left: V015SurfaceExpression<T>,
  right: V015SurfaceExpression<T>,
): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === "ATOM" && right.kind === "ATOM") return Object.is(left.value, right.value);
  if (left.kind === "GROUP" && right.kind === "GROUP") {
    return semanticStructureEqual(left.expression, right.expression);
  }
  if (left.kind === "DIRECT" && right.kind === "DIRECT") {
    const a = left.source.values;
    const b = right.source.values;
    return a.length === b.length && a.every((value, index) =>
      semanticStructureEqual(value, b[index]!));
  }
  return false;
}
