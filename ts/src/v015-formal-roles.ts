export const V015_FORMAL_ROLE_MATRIX = Object.freeze({
  link: Object.freeze({
    glyph: "⟼" as const,
    role: "STRUCTURAL_LINK" as const,
    semanticAuthority: "LINK_FOUNDATION_PLUS_SELECTED_GRAMMAR" as const,
    equality: "ACCEPTED_LINK_IDENTITY" as const,
    canMaterialize: true,
    writeAuthority: "EXPLICIT_WRITE_CAPABILITY" as const,
  }),
  identity: Object.freeze({
    glyph: "=" as const,
    role: "LINK_IDENTITY_EQUALITY" as const,
    semanticAuthority: "ACCEPTED_LINK_IDENTITY" as const,
    equality: "ACCEPTED_LINK_IDENTITY" as const,
    canMaterialize: false,
    writeAuthority: "NONE" as const,
    bindingAuthority: false,
  }),
  binding: Object.freeze({
    glyph: ":" as const,
    role: "DEFINITION_BINDING" as const,
    semanticAuthority: "SELECTED_GRAMMAR_PLUS_EXPLICIT_SCOPE" as const,
    equality: "ACCEPTED_LINK_IDENTITY" as const,
    canMaterialize: true,
    writeAuthority: "EXPLICIT_BINDING_EFFECT" as const,
    cardinalityInfersRole: false,
  }),
  dot: Object.freeze({
    glyph: "." as const,
    role: "CONTEXTUAL_LOOKUP_OR_QUALIFIER" as const,
    semanticAuthority: "SELECTED_GRAMMAR_PLUS_EXPLICIT_CONTEXT" as const,
    canMaterialize: false,
    writeAuthority: "NONE" as const,
    ambientHostCurrentAuthority: false,
    hostStackAuthority: false,
    contextualBindingComposition: ".name : value" as const,
  }),
  parentheses: Object.freeze({
    glyph: "()" as const,
    role: "ROLE_DISPATCH_DELIMITER" as const,
    semanticAuthority: "SELECTED_GRAMMAR" as const,
    allowedRoles: Object.freeze(["GROUPING", "CONTEXT", "APPLICATION"] as const),
    defaultRole: null,
    surfaceDelimiterCanMaterialize: false,
  }),
  ontology: Object.freeze({
    nameIsOntologyKind: false,
    valueIsOntologyKind: false,
    variableIsOntologyKind: false,
    constantIsOntologyKind: false,
  }),
});

export type V015ParenthesesRole = "GROUPING" | "CONTEXT" | "APPLICATION";
export type V015DotRole = "CURRENT_OCCURRENCE" | "CONTEXTUAL_NAME_QUALIFIER";
export type V015BindingMutability = "VARIABLE" | "CONSTANT";
export type V015BindingScopeRelation = "SAME_SCOPE" | "NESTED_SCOPE";
export type V015RebindingDecision =
  | "INITIAL_BINDING"
  | "IDENTICAL_BINDING"
  | "VARIABLE_SHADOW";

export type V015FormalRoleErrorCode =
  | "ambiguous-parentheses-role"
  | "invalid-parentheses-role"
  | "ambiguous-dot-role"
  | "invalid-dot-role"
  | "same-scope-rebinding-conflict"
  | "constant-rebinding"
  | "unimplemented";

export class V015FormalRoleError extends Error {
  override readonly name = "V015FormalRoleError";

  constructor(readonly code: V015FormalRoleErrorCode) {
    super(code);
  }
}

export interface V015RebindingInput {
  readonly mutability: V015BindingMutability;
  readonly scopeRelation: V015BindingScopeRelation;
  readonly hasPreviousBinding: boolean;
  readonly sameSemanticValue: boolean;
}

export function resolveV015ParenthesesRole(
  role: V015ParenthesesRole | undefined,
): V015ParenthesesRole {
  void role;
  throw new V015FormalRoleError("unimplemented");
}

export function resolveV015DotRole(
  role: V015DotRole | undefined,
): V015DotRole {
  void role;
  throw new V015FormalRoleError("unimplemented");
}

export function validateV015Rebinding(
  input: V015RebindingInput,
): V015RebindingDecision {
  void input;
  throw new V015FormalRoleError("unimplemented");
}
