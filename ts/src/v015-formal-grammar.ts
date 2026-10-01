import {
  V015_SEMANTIC_SOURCE_ORDER_SCHEMA,
  type V015DirectAssociationAlgebra,
  type V015SemanticSourceOrder,
} from "./v015-direct-association.js";
import {
  V015_WRITING_PROJECTION_SCHEMA,
  type V015SurfaceExpression,
  type V015WritingProjection,
} from "./v015-writing-projection.js";
import { V015_FORMAL_ROLE_MATRIX } from "./v015-formal-roles.js";

export const V015_FORMAL_GRAMMAR_SCHEMA =
  "mts-v0.15/formal-grammar/research-v0" as const;
export const V015_FORMAL_GRAMMAR_ID = "MTS_FORMAL_V015_RESEARCH" as const;
export const V015_FORMAL_AST_SCHEMA =
  "mts-v0.15/formal-ast/research-v0" as const;

export const V015_CANONICAL_FORMAL_GRAMMAR_RESEARCH = Object.freeze({
  schema: V015_FORMAL_GRAMMAR_SCHEMA,
  id: V015_FORMAL_GRAMMAR_ID,
  status: "RESEARCH_NOT_ACCEPTED" as const,
  acceptedBase: "MTS v0.14 immutable" as const,
  sourceOrderAuthority: V015_SEMANTIC_SOURCE_ORDER_SCHEMA,
  writingProjectionAuthority: V015_WRITING_PROJECTION_SCHEMA,
  structuralLinkRole: V015_FORMAL_ROLE_MATRIX.link.role,
  identityRole: V015_FORMAL_ROLE_MATRIX.identity.role,
  bindingRole: V015_FORMAL_ROLE_MATRIX.binding.role,
  dotRole: V015_FORMAL_ROLE_MATRIX.dot.role,
  hostParserAuthority: false,
  hostAstAuthority: false,
  astOntologyKind: false,
  onlyOntologyEntity: "Link" as const,
});

export interface V015FormalGrammarSelection {
  readonly schema: typeof V015_FORMAL_GRAMMAR_SCHEMA;
  readonly id: typeof V015_FORMAL_GRAMMAR_ID;
  readonly status: "RESEARCH_NOT_ACCEPTED";
}

interface V015FormalAstBase {
  readonly schema: typeof V015_FORMAL_AST_SCHEMA;
  readonly grammarId: typeof V015_FORMAL_GRAMMAR_ID;
}

export type V015FormalLinkAst<T> =
  | (V015FormalAstBase & {
      readonly semanticClass: "LINK_DENOTATION";
      readonly kind: "ATOM";
      readonly value: T;
    })
  | (V015FormalAstBase & {
      readonly semanticClass: "LINK_DENOTATION";
      readonly kind: "DIRECT";
      readonly source: V015SemanticSourceOrder<V015FormalLinkAst<T>>;
    })
  | (V015FormalAstBase & {
      readonly semanticClass: "LINK_DENOTATION";
      readonly kind: "GROUP";
      readonly expression: V015FormalLinkAst<T>;
    });

export type V015FormalReadEffectAst<T> =
  | (V015FormalAstBase & {
      readonly semanticClass: "READ_EFFECT";
      readonly kind: "IDENTITY";
      readonly role: typeof V015_FORMAL_ROLE_MATRIX.identity.role;
      readonly left: T;
      readonly right: T;
    })
  | (V015FormalAstBase & {
      readonly semanticClass: "READ_EFFECT";
      readonly kind: "BINDING";
      readonly role: typeof V015_FORMAL_ROLE_MATRIX.binding.role;
      readonly context: T | null;
      readonly name: T;
      readonly value: T;
    })
  | (V015FormalAstBase & {
      readonly semanticClass: "READ_EFFECT";
      readonly kind: "CONTEXTUAL_LOOKUP";
      readonly role: typeof V015_FORMAL_ROLE_MATRIX.dot.role;
      readonly context: T;
      readonly name: T;
    })
  | (V015FormalAstBase & {
      readonly semanticClass: "READ_EFFECT";
      readonly kind: "CONTEXT";
      readonly role: "CONTEXT";
      readonly context: T;
      readonly expression: V015FormalLinkAst<T>;
    })
  | (V015FormalAstBase & {
      readonly semanticClass: "READ_EFFECT";
      readonly kind: "APPLICATION";
      readonly role: "APPLICATION";
      readonly callee: T;
      readonly argument: V015FormalLinkAst<T>;
    });

export type V015FormalAst<T> =
  | V015FormalLinkAst<T>
  | V015FormalReadEffectAst<T>;

export type V015FormalGrammarErrorCode =
  | "invalid-grammar"
  | "invalid-ast"
  | "not-link-denoting-node"
  | "unimplemented";

export class V015FormalGrammarError extends Error {
  override readonly name = "V015FormalGrammarError";

  constructor(readonly code: V015FormalGrammarErrorCode) {
    super(code);
  }
}

export function elaborateV015FormalProjection<T>(
  projection: V015WritingProjection<T>,
  grammar: V015FormalGrammarSelection,
): V015FormalLinkAst<T> {
  void projection;
  void grammar;
  throw new V015FormalGrammarError("unimplemented");
}

export function denoteV015FormalAst<T>(
  ast: V015FormalAst<T>,
  grammar: V015FormalGrammarSelection,
  algebra: V015DirectAssociationAlgebra<T>,
): T {
  void ast;
  void grammar;
  void algebra;
  throw new V015FormalGrammarError("unimplemented");
}

export function normalizeV015FormalAst<T>(
  ast: V015FormalLinkAst<T>,
  grammar: V015FormalGrammarSelection,
): V015SurfaceExpression<T> {
  void ast;
  void grammar;
  throw new V015FormalGrammarError("unimplemented");
}

export function v015FormalAstStructureEqual<T>(
  left: V015FormalLinkAst<T>,
  right: V015FormalLinkAst<T>,
): boolean {
  void left;
  void right;
  throw new V015FormalGrammarError("unimplemented");
}
