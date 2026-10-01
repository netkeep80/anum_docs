import {
  V015_CANONICAL_FORMAL_GRAMMAR_RESEARCH,
  V015_FORMAL_AST_SCHEMA,
  V015_FORMAL_GRAMMAR_ID,
  V015_FORMAL_GRAMMAR_SCHEMA,
  V015FormalGrammarError,
  denoteV015FormalAst,
  elaborateV015FormalProjection,
  normalizeV015FormalAst,
  v015FormalAstStructureEqual,
  type V015FormalAst,
  type V015FormalGrammarSelection,
  type V015FormalLinkAst,
} from "../src/v015-formal-grammar.js";
import type { V015DirectAssociationAlgebra } from "../src/v015-direct-association.js";
import {
  renderV015WritingProjection,
  semanticStructureEqual,
  v015Atom,
  v015Direct,
  v015Group,
  type V015ProjectionToken,
  type V015WritingProjection,
} from "../src/v015-writing-projection.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
} from "../src/memory.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

function expectGrammarError(action: () => unknown, code: string, message: string): void {
  try {
    action();
  } catch (error) {
    assert(error instanceof V015FormalGrammarError, `${message}: wrong error type`);
    same(error.code, code, `${message}: error code`);
    return;
  }
  throw new Error(`${message}: expected V015FormalGrammarError`);
}

const memory = new Memory();
const { O, C, L, U } = ensureRootBasis(memory);
const algebra: V015DirectAssociationAlgebra<LinkHandle> = Object.freeze({
  link: (start: LinkHandle, end: LinkHandle) => memory.ensure(start, end),
});
const grammar: V015FormalGrammarSelection = V015_CANONICAL_FORMAL_GRAMMAR_RESEARCH;

same(grammar.schema, V015_FORMAL_GRAMMAR_SCHEMA, "canonical Grammar schema");
same(grammar.id, V015_FORMAL_GRAMMAR_ID, "canonical Grammar id");
same(grammar.status, "RESEARCH_NOT_ACCEPTED", "P4 remains research only");
same(V015_CANONICAL_FORMAL_GRAMMAR_RESEARCH.hostParserAuthority, false, "host parser is not authority");
same(V015_CANONICAL_FORMAL_GRAMMAR_RESEARCH.hostAstAuthority, false, "host AST is not authority");
same(V015_CANONICAL_FORMAL_GRAMMAR_RESEARCH.astOntologyKind, false, "AST is not ontology");
same(V015_CANONICAL_FORMAL_GRAMMAR_RESEARCH.onlyOntologyEntity, "Link", "one-Link ontology preserved");

const A = v015Atom(O);
const B = v015Atom(C);
const Cc = v015Atom(U);
const ungrouped = v015Direct([A, B, Cc]);
const rightGrouped = v015Direct([
  A,
  v015Group(v015Direct([B, Cc])),
]);
const singleton = v015Direct([A]);

const ungroupedLtr = renderV015WritingProjection(ungrouped, "LTR");
const ungroupedRtl = renderV015WritingProjection(ungrouped, "RTL");
const rightLtr = renderV015WritingProjection(rightGrouped, "LTR");
const singletonLtr = renderV015WritingProjection(singleton, "LTR");

// Canonical Grammar, not the host parser, elaborates the P2 semantic/source projection.
const ungroupedAstLtr = elaborateV015FormalProjection(ungroupedLtr, grammar);
const ungroupedAstRtl = elaborateV015FormalProjection(ungroupedRtl, grammar);
same(ungroupedAstLtr.schema, V015_FORMAL_AST_SCHEMA, "semantic AST schema");
same(ungroupedAstLtr.grammarId, V015_FORMAL_GRAMMAR_ID, "Grammar provenance survives elaboration");
same(ungroupedAstLtr.semanticClass, "LINK_DENOTATION", "structural chain is Link-denoting");
assert(
  v015FormalAstStructureEqual(ungroupedAstLtr, ungroupedAstRtl),
  "LTR/RTL projections elaborate to one semantic AST structure",
);

const ungroupedDenotation = denoteV015FormalAst(ungroupedAstLtr, grammar, algebra);
same(ungroupedDenotation, memory.ensure(L, U), "A⟼B⟼C denotes (A⟼B)⟼C");
same(
  denoteV015FormalAst(ungroupedAstRtl, grammar, algebra),
  ungroupedDenotation,
  "LTR/RTL ASTs have one Link denotation",
);

const normalized = normalizeV015FormalAst(ungroupedAstLtr, grammar);
assert(
  semanticStructureEqual(normalized, ungrouped),
  "AST normalizes back to the same semantic/source structure",
);

// Explicit right grouping remains AST-distinct and Link-distinct.
const rightAst = elaborateV015FormalProjection(rightLtr, grammar);
assert(
  !v015FormalAstStructureEqual(ungroupedAstLtr, rightAst),
  "explicit A⟼(B⟼C) remains AST-distinct from default DirectAssociation",
);
const rightDenotation = denoteV015FormalAst(rightAst, grammar, algebra);
same(rightDenotation, memory.ensure(O, memory.ensure(C, U)), "right grouping denotes A⟼(B⟼C)");
assert(rightDenotation !== ungroupedDenotation, "grouping is not algebraic associativity");

// Singleton DirectAssociation remains identity through Grammar -> AST -> Link.
const singletonAst = elaborateV015FormalProjection(singletonLtr, grammar);
same(denoteV015FormalAst(singletonAst, grammar, algebra), O, "singleton denotes A");

// No selected/canonical Grammar => fail closed.
expectGrammarError(
  () => elaborateV015FormalProjection(
    ungroupedLtr,
    undefined as unknown as V015FormalGrammarSelection,
  ),
  "invalid-grammar",
  "missing Grammar authority",
);
const unknownGrammar = {
  ...V015_CANONICAL_FORMAL_GRAMMAR_RESEARCH,
  id: "HOST_GRAMMAR",
} as unknown as V015FormalGrammarSelection;
expectGrammarError(
  () => elaborateV015FormalProjection(ungroupedLtr, unknownGrammar),
  "invalid-grammar",
  "unknown host Grammar cannot become semantic authority",
);
const jGrammar = {
  ...V015_CANONICAL_FORMAL_GRAMMAR_RESEARCH,
  id: "J",
} as unknown as V015FormalGrammarSelection;
expectGrammarError(
  () => elaborateV015FormalProjection(ungroupedLtr, jGrammar),
  "invalid-grammar",
  "J/chirality cannot substitute for Grammar selection",
);

// A forged host AST without canonical Grammar provenance is rejected.
const forgedAst = Object.freeze({
  schema: V015_FORMAL_AST_SCHEMA,
  grammarId: "HOST_AST",
  semanticClass: "LINK_DENOTATION",
  kind: "ATOM",
  value: O,
}) as unknown as V015FormalLinkAst<LinkHandle>;
expectGrammarError(
  () => denoteV015FormalAst(forgedAst, grammar, algebra),
  "invalid-ast",
  "host AST provenance is not semantic authority",
);

// AST object identity is irrelevant to Link identity.
const atomAstA = Object.freeze({
  schema: V015_FORMAL_AST_SCHEMA,
  grammarId: V015_FORMAL_GRAMMAR_ID,
  semanticClass: "LINK_DENOTATION" as const,
  kind: "ATOM" as const,
  value: O,
});
const atomAstB = Object.freeze({
  schema: V015_FORMAL_AST_SCHEMA,
  grammarId: V015_FORMAL_GRAMMAR_ID,
  semanticClass: "LINK_DENOTATION" as const,
  kind: "ATOM" as const,
  value: O,
});
assert(atomAstA !== atomAstB, "host AST objects are distinct");
assert(v015FormalAstStructureEqual(atomAstA, atomAstB), "AST structural equality ignores host object identity");
same(denoteV015FormalAst(atomAstA, grammar, algebra), O, "first AST denotes O");
same(denoteV015FormalAst(atomAstB, grammar, algebra), O, "second AST denotes the same O");

// P3 read/effect roles do not silently acquire pure Link denotation.
const readEffectNodes: readonly V015FormalAst<LinkHandle>[] = Object.freeze([
  Object.freeze({
    schema: V015_FORMAL_AST_SCHEMA,
    grammarId: V015_FORMAL_GRAMMAR_ID,
    semanticClass: "READ_EFFECT" as const,
    kind: "IDENTITY" as const,
    role: "LINK_IDENTITY_EQUALITY" as const,
    left: O,
    right: O,
  }),
  Object.freeze({
    schema: V015_FORMAL_AST_SCHEMA,
    grammarId: V015_FORMAL_GRAMMAR_ID,
    semanticClass: "READ_EFFECT" as const,
    kind: "BINDING" as const,
    role: "DEFINITION_BINDING" as const,
    context: null,
    name: C,
    value: O,
  }),
  Object.freeze({
    schema: V015_FORMAL_AST_SCHEMA,
    grammarId: V015_FORMAL_GRAMMAR_ID,
    semanticClass: "READ_EFFECT" as const,
    kind: "CONTEXTUAL_LOOKUP" as const,
    role: "CONTEXTUAL_LOOKUP_OR_QUALIFIER" as const,
    context: L,
    name: C,
  }),
  Object.freeze({
    schema: V015_FORMAL_AST_SCHEMA,
    grammarId: V015_FORMAL_GRAMMAR_ID,
    semanticClass: "READ_EFFECT" as const,
    kind: "CONTEXT" as const,
    role: "CONTEXT" as const,
    context: L,
    expression: atomAstA,
  }),
  Object.freeze({
    schema: V015_FORMAL_AST_SCHEMA,
    grammarId: V015_FORMAL_GRAMMAR_ID,
    semanticClass: "READ_EFFECT" as const,
    kind: "APPLICATION" as const,
    role: "APPLICATION" as const,
    callee: C,
    argument: atomAstA,
  }),
]);
for (const node of readEffectNodes) {
  expectGrammarError(
    () => denoteV015FormalAst(node, grammar, algebra),
    "not-link-denoting-node",
    `${node.kind} is not a pure Link denotation`,
  );
}

// Physical renderer order cannot masquerade as the already-selected source order.
const atomTokens = ungroupedLtr.physicalTokens.filter(
  (token): token is Extract<V015ProjectionToken<LinkHandle>, { kind: "ATOM" }> =>
    token.kind === "ATOM",
);
same(atomTokens.length, 3, "three physical atoms");
const reorderedProjection: V015WritingProjection<LinkHandle> = Object.freeze({
  schema: ungroupedLtr.schema,
  direction: "LTR",
  physicalTokens: Object.freeze([
    atomTokens[0]!,
    Object.freeze({ kind: "ARROW" as const }),
    atomTokens[2]!,
    Object.freeze({ kind: "ARROW" as const }),
    atomTokens[1]!,
  ]),
});
const reorderedAst = elaborateV015FormalProjection(reorderedProjection, grammar);
assert(
  !v015FormalAstStructureEqual(reorderedAst, ungroupedAstLtr),
  "different physical/source order yields a different semantic AST rather than overriding the selected order",
);

console.log("V15_P4_CANONICAL_GRAMMAR = GREEN_RESEARCH");
console.log("V15_P4_AST = REPRESENTATION_NOT_ONTOLOGY");
console.log("V15_P4_LTR_RTL = ONE_SEMANTIC_AST_DENOTATION");
console.log("V15_P4_READ_EFFECT = DISTINCT_FROM_LINK_DENOTATION");
console.log("HOST_PARSER_AST_AUTHORITY = NONE");
console.log("accepted MTS v0.14 semantic delta = NONE");
