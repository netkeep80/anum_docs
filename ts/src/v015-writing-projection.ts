import {
  V015_SEMANTIC_SOURCE_ORDER_SCHEMA,
  declareV015SemanticSourceOrder,
  directSequentialAssociation,
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
  | "invalid-token-stream";

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
  if (direction !== "LTR" && direction !== "RTL") {
    throw new V015WritingProjectionError("invalid-projection");
  }

  const renderExpression = (
    current: V015SurfaceExpression<T>,
  ): V015ProjectionToken<T>[] => {
    if (current.kind === "ATOM") {
      return [Object.freeze({ kind: "ATOM" as const, value: current.value })];
    }
    if (current.kind === "GROUP") {
      return [
        Object.freeze({ kind: "OPEN" as const }),
        ...renderExpression(current.expression),
        Object.freeze({ kind: "CLOSE" as const }),
      ];
    }
    if (current.kind === "DIRECT") {
      if (
        current.source.schema !== V015_SEMANTIC_SOURCE_ORDER_SCHEMA
        || !Array.isArray(current.source.values)
        || current.source.values.length === 0
      ) {
        throw new V015WritingProjectionError("invalid-projection");
      }
      const tokens: V015ProjectionToken<T>[] = [];
      for (let index = 0; index < current.source.values.length; index += 1) {
        if (index > 0) tokens.push(Object.freeze({ kind: "ARROW" as const }));
        tokens.push(...renderExpression(current.source.values[index]!));
      }
      return tokens;
    }
    throw new V015WritingProjectionError("invalid-projection");
  };

  const semanticTokens = renderExpression(expression);
  const physicalTokens = direction === "LTR"
    ? semanticTokens
    : [...semanticTokens].reverse();

  return Object.freeze({
    schema: V015_WRITING_PROJECTION_SCHEMA,
    direction,
    physicalTokens: Object.freeze(physicalTokens),
  });
}

export function parseV015WritingProjection<T>(
  projection: V015WritingProjection<T>,
): V015SurfaceExpression<T> {
  if (
    projection.schema !== V015_WRITING_PROJECTION_SCHEMA
    || (projection.direction !== "LTR" && projection.direction !== "RTL")
    || !Array.isArray(projection.physicalTokens)
  ) {
    throw new V015WritingProjectionError("invalid-projection");
  }

  const tokens = projection.direction === "LTR"
    ? [...projection.physicalTokens]
    : [...projection.physicalTokens].reverse();
  if (tokens.length === 0) {
    throw new V015WritingProjectionError("invalid-token-stream");
  }

  let index = 0;

  function parsePrimary(): V015SurfaceExpression<T> {
    const token = tokens[index];
    if (token === undefined) {
      throw new V015WritingProjectionError("invalid-token-stream");
    }
    if (token.kind === "ATOM") {
      index += 1;
      return v015Atom(token.value);
    }
    if (token.kind === "OPEN") {
      index += 1;
      const expression = parseExpression();
      if (tokens[index]?.kind !== "CLOSE") {
        throw new V015WritingProjectionError("invalid-token-stream");
      }
      index += 1;
      return v015Group(expression);
    }
    throw new V015WritingProjectionError("invalid-token-stream");
  }

  function parseExpression(): V015SurfaceExpression<T> {
    const values: V015SurfaceExpression<T>[] = [parsePrimary()];
    while (tokens[index]?.kind === "ARROW") {
      index += 1;
      values.push(parsePrimary());
    }
    return values.length === 1 ? values[0]! : v015Direct(values);
  }

  const result = parseExpression();
  if (index !== tokens.length) {
    throw new V015WritingProjectionError("invalid-token-stream");
  }
  return result;
}

export function denoteV015SurfaceExpression<T>(
  expression: V015SurfaceExpression<T>,
  algebra: V015DirectAssociationAlgebra<T>,
): T {
  if (expression.kind === "ATOM") return expression.value;
  if (expression.kind === "GROUP") {
    return denoteV015SurfaceExpression(expression.expression, algebra);
  }
  if (expression.kind === "DIRECT") {
    if (
      expression.source.schema !== V015_SEMANTIC_SOURCE_ORDER_SCHEMA
      || !Array.isArray(expression.source.values)
    ) {
      throw new V015WritingProjectionError("invalid-projection");
    }
    const values = expression.source.values.map((value) =>
      denoteV015SurfaceExpression(value, algebra));
    return directSequentialAssociation(
      declareV015SemanticSourceOrder(values),
      algebra,
    );
  }
  throw new V015WritingProjectionError("invalid-projection");
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
    if (
      left.source.schema !== V015_SEMANTIC_SOURCE_ORDER_SCHEMA
      || right.source.schema !== V015_SEMANTIC_SOURCE_ORDER_SCHEMA
    ) return false;
    const a = left.source.values;
    const b = right.source.values;
    return a.length === b.length && a.every((value, index) =>
      semanticStructureEqual(value, b[index]!));
  }
  return false;
}
