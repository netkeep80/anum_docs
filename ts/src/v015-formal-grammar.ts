import {
  V015_SEMANTIC_SOURCE_ORDER_SCHEMA,
  declareV015SemanticSourceOrder,
  directSequentialAssociation,
  type V015DirectAssociationAlgebra,
  type V015SemanticSourceOrder,
} from "./v015-direct-association.js";
import {
  V015_WRITING_PROJECTION_SCHEMA,
  parseV015WritingProjection,
  v015Atom,
  v015Direct,
  v015Group,
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
  | "not-link-denoting-node";

export class V015FormalGrammarError extends Error {
  override readonly name = "V015FormalGrammarError";

  constructor(readonly code: V015FormalGrammarErrorCode) {
    super(code);
  }
}

// Every P4 entrypoint revalidates canonical Grammar provenance; host AST/parser state is never authority.\nexport function elaborateV015FormalProjection<T>(
  projection: V015WritingProjection<T>,
  grammar: V015FormalGrammarSelection,
): V015FormalLinkAst<T> {
  if (
    grammar === undefined
    || grammar.schema !== V015_FORMAL_GRAMMAR_SCHEMA
    || grammar.id !== V015_FORMAL_GRAMMAR_ID
    || grammar.status !== "RESEARCH_NOT_ACCEPTED"
  ) {
    throw new V015FormalGrammarError("invalid-grammar");
  }

  const surface = parseV015WritingProjection(projection);

  const build = (expression: V015SurfaceExpression<T>): V015FormalLinkAst<T> => {
    if (expression.kind === "ATOM") {
      return Object.freeze({
        schema: V015_FORMAL_AST_SCHEMA,
        grammarId: V015_FORMAL_GRAMMAR_ID,
        semanticClass: "LINK_DENOTATION" as const,
        kind: "ATOM" as const,
        value: expression.value,
      });
    }
    if (expression.kind === "GROUP") {
      return Object.freeze({
        schema: V015_FORMAL_AST_SCHEMA,
        grammarId: V015_FORMAL_GRAMMAR_ID,
        semanticClass: "LINK_DENOTATION" as const,
        kind: "GROUP" as const,
        expression: build(expression.expression),
      });
    }
    if (
      expression.kind === "DIRECT"
      && expression.source.schema === V015_SEMANTIC_SOURCE_ORDER_SCHEMA
      && Array.isArray(expression.source.values)
      && expression.source.values.length > 0
    ) {
      return Object.freeze({
        schema: V015_FORMAL_AST_SCHEMA,
        grammarId: V015_FORMAL_GRAMMAR_ID,
        semanticClass: "LINK_DENOTATION" as const,
        kind: "DIRECT" as const,
        source: declareV015SemanticSourceOrder(expression.source.values.map(build)),
      });
    }
    throw new V015FormalGrammarError("invalid-ast");
  };

  return build(surface);
}

export function denoteV015FormalAst<T>(
  ast: V015FormalAst<T>,
  grammar: V015FormalGrammarSelection,
  algebra: V015DirectAssociationAlgebra<T>,
): T {
  if (
    grammar === undefined
    || grammar.schema !== V015_FORMAL_GRAMMAR_SCHEMA
    || grammar.id !== V015_FORMAL_GRAMMAR_ID
    || grammar.status !== "RESEARCH_NOT_ACCEPTED"
  ) {
    throw new V015FormalGrammarError("invalid-grammar");
  }
  if (
    ast.schema !== V015_FORMAL_AST_SCHEMA
    || ast.grammarId !== V015_FORMAL_GRAMMAR_ID
  ) {
    throw new V015FormalGrammarError("invalid-ast");
  }
  if (ast.semanticClass !== "LINK_DENOTATION") {
    throw new V015FormalGrammarError("not-link-denoting-node");
  }

  const denoteLink = (node: V015FormalLinkAst<T>): T => {
    if (
      node.schema !== V015_FORMAL_AST_SCHEMA
      || node.grammarId !== V015_FORMAL_GRAMMAR_ID
      || node.semanticClass !== "LINK_DENOTATION"
    ) {
      throw new V015FormalGrammarError("invalid-ast");
    }
    if (node.kind === "ATOM") return node.value;
    if (node.kind === "GROUP") return denoteLink(node.expression);
    if (
      node.kind === "DIRECT"
      && node.source.schema === V015_SEMANTIC_SOURCE_ORDER_SCHEMA
      && Array.isArray(node.source.values)
      && node.source.values.length > 0
    ) {
      return directSequentialAssociation(
        declareV015SemanticSourceOrder(node.source.values.map(denoteLink)),
        algebra,
      );
    }
    throw new V015FormalGrammarError("invalid-ast");
  };

  return denoteLink(ast);
}

export function normalizeV015FormalAst<T>(
  ast: V015FormalLinkAst<T>,
  grammar: V015FormalGrammarSelection,
): V015SurfaceExpression<T> {
  if (
    grammar === undefined
    || grammar.schema !== V015_FORMAL_GRAMMAR_SCHEMA
    || grammar.id !== V015_FORMAL_GRAMMAR_ID
    || grammar.status !== "RESEARCH_NOT_ACCEPTED"
  ) {
    throw new V015FormalGrammarError("invalid-grammar");
  }

  const normalize = (node: V015FormalLinkAst<T>): V015SurfaceExpression<T> => {
    if (
      node.schema !== V015_FORMAL_AST_SCHEMA
      || node.grammarId !== V015_FORMAL_GRAMMAR_ID
      || node.semanticClass !== "LINK_DENOTATION"
    ) {
      throw new V015FormalGrammarError("invalid-ast");
    }
    if (node.kind === "ATOM") return v015Atom(node.value);
    if (node.kind === "GROUP") return v015Group(normalize(node.expression));
    if (
      node.kind === "DIRECT"
      && node.source.schema === V015_SEMANTIC_SOURCE_ORDER_SCHEMA
      && Array.isArray(node.source.values)
      && node.source.values.length > 0
    ) {
      return v015Direct(node.source.values.map(normalize));
    }
    throw new V015FormalGrammarError("invalid-ast");
  };

  return normalize(ast);
}

export function v015FormalAstStructureEqual<T>(
  left: V015FormalLinkAst<T>,
  right: V015FormalLinkAst<T>,
): boolean {
  if (
    left.schema !== V015_FORMAL_AST_SCHEMA
    || right.schema !== V015_FORMAL_AST_SCHEMA
    || left.grammarId !== V015_FORMAL_GRAMMAR_ID
    || right.grammarId !== V015_FORMAL_GRAMMAR_ID
    || left.semanticClass !== "LINK_DENOTATION"
    || right.semanticClass !== "LINK_DENOTATION"
    || left.kind !== right.kind
  ) {
    return false;
  }

  if (left.kind === "ATOM" && right.kind === "ATOM") {
    return Object.is(left.value, right.value);
  }
  if (left.kind === "GROUP" && right.kind === "GROUP") {
    return v015FormalAstStructureEqual(left.expression, right.expression);
  }
  if (left.kind === "DIRECT" && right.kind === "DIRECT") {
    if (
      left.source.schema !== V015_SEMANTIC_SOURCE_ORDER_SCHEMA
      || right.source.schema !== V015_SEMANTIC_SOURCE_ORDER_SCHEMA
    ) {
      return false;
    }
    const a = left.source.values;
    const b = right.source.values;
    return a.length === b.length && a.every((value, index) =>
      v015FormalAstStructureEqual(value, b[index]!));
  }
  return false;
}
