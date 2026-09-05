import {
  MATHLIB_M0_EXTERNAL_BOUNDARY_SCHEMA,
  MathlibM0ExternalBoundaryError,
  parseMathlibM0ExternalBoundary,
} from "../src/mathlib-m0-external-boundary.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

function expectReject(code: MathlibM0ExternalBoundaryError["code"], input: unknown): void {
  try {
    parseMathlibM0ExternalBoundary(input);
  } catch (error) {
    assert(error instanceof MathlibM0ExternalBoundaryError, `${code}: wrong error type`);
    same(error.code, code, `${code}: wrong error code`);
    return;
  }
  throw new Error(`${code}: expected external-boundary rejection`);
}

const PIN = Object.freeze({
  mathlibSha: "d6893048e0d784c43f3cf098b61299b3a4b4aed0",
  leanToolchain: "leanprover/lean4:v4.34.0-rc2",
});

const boundary = Object.freeze({
  schema: "mts-mathlib-m0-external-boundary/v0.1",
  upstream: PIN,
  entries: [
    { qualifiedName: "Eq", constantInfoKind: "inductive", referencedBy: ["Ne"] },
    { qualifiedName: "False", constantInfoKind: "inductive", referencedBy: ["Not"] },
    {
      qualifiedName: "Membership",
      constantInfoKind: "inductive",
      referencedBy: ["Membership.mem", "Set.instMembership"],
    },
    {
      qualifiedName: "Membership.mk",
      constantInfoKind: "constructor",
      referencedBy: ["Set.instMembership"],
    },
  ],
});

const parsed = parseMathlibM0ExternalBoundary(boundary);
same(parsed.schema, MATHLIB_M0_EXTERNAL_BOUNDARY_SCHEMA, "boundary schema must be canonical");
same(parsed.upstream.mathlibSha, PIN.mathlibSha, "mathlib pin must survive parsing");
same(parsed.upstream.leanToolchain, PIN.leanToolchain, "Lean pin must survive parsing");
same(parsed.entries.length, 4, "all boundary entries must survive parsing");
same(parsed.entries[0]?.qualifiedName, "Eq", "entries must preserve deterministic order");
same(parsed.entries[2]?.constantInfoKind, "inductive", "ConstantInfo kind must survive parsing");
same(parsed.entries[2]?.referencedBy[1], "Set.instMembership", "reference identity must survive parsing");

expectReject("unsupported-schema", { ...boundary, schema: "mts-mathlib-m0-external-boundary/v9" });
expectReject("invalid-upstream", {
  ...boundary,
  upstream: { ...PIN, mathlibSha: "not-a-sha" },
});
expectReject("invalid-upstream", {
  ...boundary,
  upstream: { ...PIN, leanToolchain: "" },
});
expectReject("unsupported-constant-info-kind", {
  ...boundary,
  entries: [
    { ...boundary.entries[0], constantInfoKind: "unknown" },
    ...boundary.entries.slice(1),
  ],
});
expectReject("duplicate-entry", {
  ...boundary,
  entries: [boundary.entries[0], boundary.entries[0], ...boundary.entries.slice(1)],
});
expectReject("unsorted-entry", {
  ...boundary,
  entries: [boundary.entries[1], boundary.entries[0], ...boundary.entries.slice(2)],
});
expectReject("duplicate-reference", {
  ...boundary,
  entries: [
    boundary.entries[0],
    boundary.entries[1],
    {
      ...boundary.entries[2],
      referencedBy: ["Membership.mem", "Membership.mem", "Set.instMembership"],
    },
    boundary.entries[3],
  ],
});
expectReject("unsorted-reference", {
  ...boundary,
  entries: [
    boundary.entries[0],
    boundary.entries[1],
    {
      ...boundary.entries[2],
      referencedBy: ["Set.instMembership", "Membership.mem"],
    },
    boundary.entries[3],
  ],
});
expectReject("invalid-entry", {
  ...boundary,
  entries: [
    { ...boundary.entries[0], qualifiedName: "" },
    ...boundary.entries.slice(1),
  ],
});
expectReject("invalid-entry", {
  ...boundary,
  entries: [
    { ...boundary.entries[0], extra: true },
    ...boundary.entries.slice(1),
  ],
});
expectReject("invalid-entry", {
  ...boundary,
  entries: [
    { qualifiedName: "Eq", constantInfoKind: "inductive" },
    ...boundary.entries.slice(1),
  ],
});
expectReject("invalid-envelope", { ...boundary, extra: true });
expectReject("invalid-envelope", {
  schema: boundary.schema,
  upstream: boundary.upstream,
});

for (const constantInfoKind of [
  "axiom",
  "definition",
  "theorem",
  "opaque",
  "quotient",
  "inductive",
  "constructor",
  "recursor",
] as const) {
  const single = parseMathlibM0ExternalBoundary({
    schema: boundary.schema,
    upstream: boundary.upstream,
    entries: [{ qualifiedName: `M0.${constantInfoKind}`, constantInfoKind, referencedBy: ["M0.Ref"] }],
  });
  same(single.entries[0]?.constantInfoKind, constantInfoKind, `${constantInfoKind} must be an explicit kind`);
}
