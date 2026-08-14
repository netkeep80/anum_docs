import type { LinkHandle, ReadMemory } from "./memory.js";
import { readRootedSequence } from "./rooted-sequence.js";

export type OccurrencePath = readonly number[];
export type BundleNodeKind =
  | "bundle" | "definition" | "comparison" | "sequence" | "link"
  | "unary" | "round" | "square" | "scalar" | "judgment";
export type BundleRole = "ConstraintBundle" | "ValueBundle";
export type ExpectedRole = "none" | "constraint" | "value" | "scalar" | "definition-rhs";

export const BUNDLE_KIND_ORDER: readonly BundleNodeKind[] = Object.freeze([
  "bundle", "definition", "comparison", "sequence", "link",
  "unary", "round", "square", "scalar", "judgment",
]);

const FORM_KINDS = new Set<BundleNodeKind>([
  "bundle", "sequence", "link", "unary", "round", "square", "scalar",
]);

export interface BundleRoleAt {
  readonly path: OccurrencePath;
  readonly role: BundleRole;
}

export interface BundleElaboration {
  readonly roles: readonly BundleRoleAt[];
}

export interface ValueBundleVocabulary {
  readonly startAnchor: LinkHandle;
  readonly endAnchor: LinkHandle;
  readonly kindSeed: LinkHandle;
  readonly kindTags: readonly LinkHandle[];
}

export class ValueBundleReplayError extends Error {
  override readonly name = "ValueBundleReplayError";
  constructor(readonly code: "invalid-value-bundle-evidence") { super(code); }
}

export class BundleElaborationError extends Error {
  override readonly name = "BundleElaborationError";
  constructor(readonly code: string, readonly path: OccurrencePath) { super(`${code} at ${path.join(".")}`); }
}

function invalid(): never {
  throw new ValueBundleReplayError("invalid-value-bundle-evidence");
}

function fail(code: string, path: OccurrencePath): never {
  throw new BundleElaborationError(code, Object.freeze([...path]));
}

function sameValues(actual: readonly LinkHandle[], expected: readonly LinkHandle[]): boolean {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

function validateVocabulary(memory: ReadMemory, vocabulary: ValueBundleVocabulary): void {
  if (vocabulary.kindTags.length !== BUNDLE_KIND_ORDER.length) invalid();
  const refs = [
    vocabulary.startAnchor, vocabulary.endAnchor, vocabulary.kindSeed, ...vocabulary.kindTags,
  ];
  if (new Set(refs).size !== refs.length) invalid();
  const start = memory.poles(vocabulary.startAnchor);
  const end = memory.poles(vocabulary.endAnchor);
  const seed = memory.poles(vocabulary.kindSeed);
  if (start.start !== vocabulary.startAnchor || start.end !== memory.root) invalid();
  if (end.start !== memory.root || end.end !== vocabulary.endAnchor) invalid();
  if (seed.start !== vocabulary.startAnchor || seed.end !== vocabulary.endAnchor) invalid();
  vocabulary.kindTags.forEach((tag, index) => {
    const expected = Array<LinkHandle>(index + 1).fill(vocabulary.kindSeed);
    if (!sameValues(readRootedSequence(memory, tag).values, expected)) invalid();
  });
}

interface DecodedNode {
  readonly kind: BundleNodeKind;
  readonly children: readonly LinkHandle[];
}

function decodeNode(
  memory: ReadMemory,
  carrier: LinkHandle,
  vocabulary: ValueBundleVocabulary,
): DecodedNode {
  const poles = memory.poles(carrier);
  const index = vocabulary.kindTags.indexOf(poles.start);
  if (index < 0) invalid();
  const kind = BUNDLE_KIND_ORDER[index];
  if (kind === undefined) invalid();
  return Object.freeze({ kind, children: readRootedSequence(memory, poles.end).values });
}

function validateArity(kind: BundleNodeKind, children: readonly LinkHandle[]): void {
  const exact: Partial<Record<BundleNodeKind, readonly number[]>> = {
    definition: [2], comparison: [2], link: [2], unary: [1],
    round: [0, 1], square: [0], scalar: [0], judgment: [0],
  };
  if (kind === "sequence" && children.length < 2) invalid();
  const expected = exact[kind];
  if (expected !== undefined && !expected.includes(children.length)) invalid();
}

type IntrinsicEvidence = "constraint" | "value" | "mixed" | undefined;

function intrinsicBundleEvidence(
  memory: ReadMemory,
  children: readonly LinkHandle[],
  vocabulary: ValueBundleVocabulary,
  active: Set<LinkHandle>,
): IntrinsicEvidence {
  const evidence = new Set<"constraint" | "value">();
  for (const child of children) {
    if (active.has(child)) invalid();
    active.add(child);
    try {
      const decoded = decodeNode(memory, child, vocabulary);
      validateArity(decoded.kind, decoded.children);
      if (decoded.kind === "bundle") {
        const nested = intrinsicBundleEvidence(memory, decoded.children, vocabulary, active);
        if (nested === "mixed") return "mixed";
        if (nested !== undefined) evidence.add(nested);
      } else if (decoded.kind === "comparison" || decoded.kind === "judgment") {
        evidence.add("constraint");
      } else if (FORM_KINDS.has(decoded.kind)) {
        evidence.add("value");
      } else {
        fail("unsupported-bundle-item", []);
      }
      if (evidence.size > 1) return "mixed";
    } finally {
      active.delete(child);
    }
  }
  return evidence.values().next().value;
}

function containsBundle(
  memory: ReadMemory,
  carrier: LinkHandle,
  vocabulary: ValueBundleVocabulary,
  active: Set<LinkHandle>,
): boolean {
  if (active.has(carrier)) invalid();
  active.add(carrier);
  try {
    const decoded = decodeNode(memory, carrier, vocabulary);
    validateArity(decoded.kind, decoded.children);
    if (decoded.kind === "bundle") return true;
    if (["sequence", "link", "unary"].includes(decoded.kind)) {
      return decoded.children.some((child) => containsBundle(memory, child, vocabulary, active));
    }
    if (decoded.kind === "round" && decoded.children.length === 1) {
      return containsBundle(memory, decoded.children[0]!, vocabulary, active);
    }
    return false;
  } finally {
    active.delete(carrier);
  }
}

function elaborateBundle(
  memory: ReadMemory,
  children: readonly LinkHandle[],
  vocabulary: ValueBundleVocabulary,
  path: OccurrencePath,
  expected: ExpectedRole,
  roles: BundleRoleAt[],
  active: Set<LinkHandle>,
): void {
  const evidence = intrinsicBundleEvidence(memory, children, vocabulary, new Set());
  if (evidence === "mixed") fail("mixed-bundle-role-evidence", path);
  if (expected === "scalar") fail("bundle-not-supported-in-scalar-operator", path);

  let role: BundleRole;
  if (expected === "definition-rhs") {
    if (evidence === "value") fail("bundle-valued-definition-deferred", path);
    role = "ConstraintBundle";
  } else if (expected === "constraint") {
    if (evidence === "value") fail("bundle-role-mismatch", path);
    role = "ConstraintBundle";
  } else if (expected === "value") {
    if (evidence === "constraint") fail("bundle-role-mismatch", path);
    role = "ValueBundle";
  } else if (evidence === "constraint") {
    role = "ConstraintBundle";
  } else if (evidence === "value") {
    role = "ValueBundle";
  } else {
    fail("ambiguous-empty-bundle-role", path);
  }

  if (role === "ValueBundle") {
    for (const child of children) {
      if (decodeNode(memory, child, vocabulary).kind === "bundle") {
        fail("nested-value-bundle-not-supported", path);
      }
    }
  }
  roles.push(Object.freeze({ path: Object.freeze([...path]), role }));
  const childExpected: ExpectedRole = role === "ConstraintBundle" ? "constraint" : "scalar";
  children.forEach((child, index) => elaborateExpression(
    memory, child, vocabulary, [...path, index], childExpected, roles, active,
  ));
}

function elaborateExpression(
  memory: ReadMemory,
  carrier: LinkHandle,
  vocabulary: ValueBundleVocabulary,
  path: OccurrencePath,
  expected: ExpectedRole,
  roles: BundleRoleAt[],
  active: Set<LinkHandle>,
): void {
  if (active.has(carrier)) invalid();
  active.add(carrier);
  try {
    const { kind, children } = decodeNode(memory, carrier, vocabulary);
    validateArity(kind, children);
    if (kind === "bundle") {
      elaborateBundle(memory, children, vocabulary, path, expected, roles, active);
      return;
    }
    if (kind === "definition") {
      if (["scalar", "value", "constraint"].includes(expected)) fail("expression-role-mismatch", path);
      elaborateExpression(memory, children[0]!, vocabulary, [...path, 0], "scalar", roles, active);
      elaborateExpression(memory, children[1]!, vocabulary, [...path, 1], "definition-rhs", roles, active);
      return;
    }
    if (kind === "comparison") {
      if (expected === "scalar") fail("expression-role-mismatch", path);
      children.forEach((child, index) => elaborateExpression(
        memory, child, vocabulary, [...path, index], "value", roles, active,
      ));
      return;
    }
    if (kind === "sequence") {
      if (expected === "constraint") fail("expression-role-mismatch", path);
      const hasBundle = children.some((child) => containsBundle(memory, child, vocabulary, new Set()));
      if (expected === "scalar" && hasBundle) fail("bundle-not-supported-in-scalar-operator", path);
      if (expected === "definition-rhs" && hasBundle) fail("bundle-valued-definition-deferred", path);
      children.forEach((child, index) => elaborateExpression(
        memory, child, vocabulary, [...path, index], "value", roles, active,
      ));
      return;
    }
    if (kind === "link") {
      if (expected === "constraint") fail("expression-role-mismatch", path);
      children.forEach((child, index) => elaborateExpression(
        memory, child, vocabulary, [...path, index], "scalar", roles, active,
      ));
      return;
    }
    if (kind === "unary") {
      if (expected === "constraint") fail("expression-role-mismatch", path);
      elaborateExpression(memory, children[0]!, vocabulary, [...path, 0], "scalar", roles, active);
      return;
    }
    if (kind === "round") {
      if (expected === "constraint") fail("expression-role-mismatch", path);
      if (children.length === 1) {
        elaborateExpression(memory, children[0]!, vocabulary, [...path, 0], expected, roles, active);
      }
      return;
    }
    if (kind === "square" || kind === "scalar") {
      if (expected === "constraint") fail("expression-role-mismatch", path);
      return;
    }
    if (kind === "judgment") {
      if (expected !== "constraint") fail("expression-role-mismatch", path);
      return;
    }
    fail("unsupported-expression", path);
  } finally {
    active.delete(carrier);
  }
}

export function elaborateBundleRoles(
  memory: ReadMemory,
  carrier: LinkHandle,
  vocabulary: ValueBundleVocabulary,
  entry: ExpectedRole = "none",
): BundleElaboration {
  const before = memory.linkCount;
  try {
    if (!["none", "constraint", "value", "scalar", "definition-rhs"].includes(entry)) invalid();
    validateVocabulary(memory, vocabulary);
    const roles: BundleRoleAt[] = [];
    elaborateExpression(memory, carrier, vocabulary, [], entry, roles, new Set());
    if (memory.linkCount !== before) invalid();
    return Object.freeze({ roles: Object.freeze(roles) });
  } catch (error) {
    if (error instanceof BundleElaborationError || error instanceof ValueBundleReplayError) throw error;
    throw new ValueBundleReplayError("invalid-value-bundle-evidence");
  }
}

export function bundleRoleAt(elaboration: BundleElaboration, path: OccurrencePath): BundleRole | undefined {
  return elaboration.roles.find((item) =>
    item.path.length === path.length && item.path.every((part, index) => part === path[index])
  )?.role;
}
