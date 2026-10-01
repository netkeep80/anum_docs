export const V015_SEMANTIC_SOURCE_ORDER_SCHEMA =
  "mts-v0.15/semantic-source-order/research-v0" as const;

export const V015_DIRECT_ASSOCIATION_RESEARCH = Object.freeze({
  status: "RESEARCH_NOT_ACCEPTED" as const,
  semanticName: "Direct Sequential Association" as const,
  russianName: "прямая последовательная ассоциативность" as const,
  acceptedBase: "MTS v0.14 immutable" as const,
  minimumArity: 1,
  emptyArity: "REJECTED_NO_UNIT" as const,
  singleton: "IDENTITY" as const,
  algebraicAssociativity: false,
  rootedFoldIsDistinctMechanism: true,
  exactSequenceIdentityDistinctFromDenotation: true,
});

export interface V015SemanticSourceOrder<T> {
  readonly schema: typeof V015_SEMANTIC_SOURCE_ORDER_SCHEMA;
  readonly values: readonly T[];
}

export interface V015DirectAssociationAlgebra<T> {
  link(start: T, end: T): T;
}

export type V015DirectAssociationErrorCode =
  | "empty-semantic-source-order"
  | "invalid-semantic-source-order"
  | "unimplemented";

export class V015DirectAssociationError extends Error {
  override readonly name = "V015DirectAssociationError";

  constructor(readonly code: V015DirectAssociationErrorCode) {
    super(code);
  }
}

export function declareV015SemanticSourceOrder<T>(
  values: readonly T[],
): V015SemanticSourceOrder<T> {
  return Object.freeze({
    schema: V015_SEMANTIC_SOURCE_ORDER_SCHEMA,
    values: Object.freeze([...values]),
  });
}

export function directSequentialAssociation<T>(
  source: V015SemanticSourceOrder<T>,
  algebra: V015DirectAssociationAlgebra<T>,
): T {
  void source;
  void algebra;
  throw new V015DirectAssociationError("unimplemented");
}
