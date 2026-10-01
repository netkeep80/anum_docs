import {
  V015_WRITING_DIRECTION_RESEARCH,
  V015_WRITING_PROJECTION_SCHEMA,
  V015WritingProjectionError,
  denoteV015SurfaceExpression,
  parseV015WritingProjection,
  renderV015WritingProjection,
  semanticStructureEqual,
  v015Atom,
  v015Direct,
  v015Group,
  type V015ProjectionToken,
  type V015SurfaceExpression,
  type V015WritingProjection,
} from "../src/v015-writing-projection.js";
import type { V015DirectAssociationAlgebra } from "../src/v015-direct-association.js";
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

function expectCode(action: () => unknown, code: string, message: string): void {
  try {
    action();
  } catch (error) {
    assert(error instanceof V015WritingProjectionError, `${message}: wrong error type`);
    same(error.code, code, `${message}: error code`);
    return;
  }
  throw new Error(`${message}: expected failure`);
}

function expectSameStructure<T>(
  actual: V015SurfaceExpression<T>,
  expected: V015SurfaceExpression<T>,
  message: string,
): void {
  assert(semanticStructureEqual(actual, expected), message);
}

const memory = new Memory();
const { O, C, L, U } = ensureRootBasis(memory);
const algebra: V015DirectAssociationAlgebra<LinkHandle> = Object.freeze({
  link: (start: LinkHandle, end: LinkHandle) => memory.ensure(start, end),
});

const A = v015Atom(O);
const B = v015Atom(C);
const Cc = v015Atom(U);

const ungrouped = v015Direct([A, B, Cc]);
const leftGrouped = v015Direct([
  v015Group(v015Direct([A, B])),
  Cc,
]);
const rightGrouped = v015Direct([
  A,
  v015Group(v015Direct([B, Cc])),
]);

same(V015_WRITING_DIRECTION_RESEARCH.status, "RESEARCH_NOT_ACCEPTED", "P2 remains research only");
same(
  V015_WRITING_DIRECTION_RESEARCH.explicitGroupingOverridesDefaultAssociation,
  true,
  "explicit grouping wins",
);
same(
  V015_WRITING_DIRECTION_RESEARCH.writingDirectionIsSemanticOrientation,
  false,
  "writing direction is not semantic orientation",
);
same(V015_WRITING_DIRECTION_RESEARCH.chiralityAuthority, false, "J/chirality is not writing direction");
same(
  V015_WRITING_DIRECTION_RESEARCH.contextOrientationAuthority,
  false,
  "Context orientation is not writing direction",
);

// Default DirectAssociation and explicit left grouping may denote the same Link,
// but remain distinct source structures.
const defaultDenotation = denoteV015SurfaceExpression(ungrouped, algebra);
const leftDenotation = denoteV015SurfaceExpression(leftGrouped, algebra);
const rightDenotation = denoteV015SurfaceExpression(rightGrouped, algebra);
same(defaultDenotation, memory.ensure(L, U), "ungrouped triple uses P1 DirectAssociation");
same(leftDenotation, defaultDenotation, "explicit left grouping preserves the same Link denotation");
assert(rightDenotation !== defaultDenotation, "explicit right grouping remains a different Link structure");
assert(!semanticStructureEqual(ungrouped, leftGrouped), "explicit left grouping remains visible in structure");
assert(!semanticStructureEqual(leftGrouped, rightGrouped), "left/right explicit grouping remain distinct");

// LTR and RTL are projections of the same semantic structure.
for (const expression of [ungrouped, leftGrouped, rightGrouped]) {
  const ltr = renderV015WritingProjection(expression, "LTR");
  const rtl = renderV015WritingProjection(expression, "RTL");
  same(ltr.schema, V015_WRITING_PROJECTION_SCHEMA, "LTR projection schema");
  same(rtl.schema, V015_WRITING_PROJECTION_SCHEMA, "RTL projection schema");
  same(ltr.direction, "LTR", "LTR metadata");
  same(rtl.direction, "RTL", "RTL metadata");

  const parsedLtr = parseV015WritingProjection(ltr);
  const parsedRtl = parseV015WritingProjection(rtl);
  expectSameStructure(parsedLtr, expression, "LTR round-trip preserves semantic/source structure");
  expectSameStructure(parsedRtl, expression, "RTL round-trip preserves semantic/source structure");
  same(
    denoteV015SurfaceExpression(parsedLtr, algebra),
    denoteV015SurfaceExpression(parsedRtl, algebra),
    "LTR/RTL projections of one structure have one Link denotation",
  );

  const ltrKinds = ltr.physicalTokens.map((token) => token.kind);
  const rtlKinds = rtl.physicalTokens.map((token) => token.kind);
  assert(
    ltrKinds.length === rtlKinds.length &&
      ltrKinds.every((kind, index) => kind === rtlKinds[rtlKinds.length - 1 - index]),
    "RTL changes physical token order only",
  );
}

// Raw visual reversal with the wrong direction metadata is not silently treated
// as the same semantic sequence.
const validRtl = renderV015WritingProjection(rightGrouped, "RTL");
const mislabeledRtl: V015WritingProjection<LinkHandle> = Object.freeze({
  schema: V015_WRITING_PROJECTION_SCHEMA,
  direction: "LTR",
  physicalTokens: validRtl.physicalTokens,
});
expectCode(
  () => parseV015WritingProjection(mislabeledRtl),
  "invalid-token-stream",
  "raw reversal without RTL metadata is rejected",
);

// Semantic orientation markers such as J/Context orientation cannot substitute
// for writing-direction metadata.
const forgedOrientation = {
  schema: V015_WRITING_PROJECTION_SCHEMA,
  direction: "J",
  physicalTokens: validRtl.physicalTokens,
} as unknown as V015WritingProjection<LinkHandle>;
expectCode(
  () => parseV015WritingProjection(forgedOrientation),
  "invalid-projection",
  "J is not writing-direction metadata",
);

// A manually reordered physical LTR stream is simply a different source order;
// renderer layout cannot redefine the selected semantic/source order.
const ltr = renderV015WritingProjection(ungrouped, "LTR");
const atoms = ltr.physicalTokens.filter(
  (token): token is Extract<V015ProjectionToken<LinkHandle>, { kind: "ATOM" }> =>
    token.kind === "ATOM",
);
same(atoms.length, 3, "ungrouped LTR has three atom tokens");
const reordered: readonly V015ProjectionToken<LinkHandle>[] = Object.freeze([
  atoms[0]!,
  Object.freeze({ kind: "ARROW" as const }),
  atoms[2]!,
  Object.freeze({ kind: "ARROW" as const }),
  atoms[1]!,
]);
const reorderedProjection: V015WritingProjection<LinkHandle> = Object.freeze({
  schema: V015_WRITING_PROJECTION_SCHEMA,
  direction: "LTR",
  physicalTokens: reordered,
});
const reorderedParsed = parseV015WritingProjection(reorderedProjection);
assert(
  !semanticStructureEqual(reorderedParsed, ungrouped),
  "physical reordering cannot masquerade as the selected semantic/source order",
);

// Invalid projection metadata and malformed grouping fail closed.
const wrongSchema = {
  schema: "host-renderer",
  direction: "LTR",
  physicalTokens: ltr.physicalTokens,
} as unknown as V015WritingProjection<LinkHandle>;
expectCode(
  () => parseV015WritingProjection(wrongSchema),
  "invalid-projection",
  "host renderer schema is not authority",
);
const malformed: V015WritingProjection<LinkHandle> = Object.freeze({
  schema: V015_WRITING_PROJECTION_SCHEMA,
  direction: "LTR",
  physicalTokens: Object.freeze([
    Object.freeze({ kind: "OPEN" as const }),
    Object.freeze({ kind: "ATOM" as const, value: O }),
    Object.freeze({ kind: "ARROW" as const }),
    Object.freeze({ kind: "ATOM" as const, value: C }),
  ]),
});
expectCode(
  () => parseV015WritingProjection(malformed),
  "invalid-token-stream",
  "unclosed explicit grouping is rejected",
);

console.log("V15_P2_GROUPING_PRECEDENCE = GREEN_RESEARCH");
console.log("V15_P2_LTR_RTL_ROUNDTRIP = GREEN_RESEARCH");
console.log("WRITING_DIRECTION = PROJECTION_METADATA_ONLY");
console.log("J_CHI_CONTEXT_ORIENTATION = NOT_WRITING_DIRECTION_AUTHORITY");
console.log("accepted MTS v0.14 semantic delta = NONE");
