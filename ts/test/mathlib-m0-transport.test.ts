import {
  MATHLIB_M0_TRANSPORT_SCHEMA,
  MathlibM0TransportError,
  canonicalMathlibM0TransportBundleJson,
  computeMathlibM0TransportBundleDigest,
  parseMathlibM0TransportBundle,
} from "../src/mathlib-m0-transport.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

function expectReject(code: MathlibM0TransportError["code"], input: unknown): void {
  try {
    parseMathlibM0TransportBundle(input);
  } catch (error) {
    assert(error instanceof MathlibM0TransportError, `${code}: wrong error type`);
    same(error.code, code, `${code}: wrong error code`);
    return;
  }
  throw new Error(`${code}: expected transport rejection`);
}

const PIN = Object.freeze({
  mathlibSha: "d6893048e0d784c43f3cf098b61299b3a4b4aed0",
  leanToolchain: "leanprover/lean4:v4.34.0-rc2",
});

const SORT_ZERO = Object.freeze({ kind: "sort", level: { kind: "zero" } });
const BASE = Object.freeze({ kind: "const", name: "M0.Base", levels: [] });
const EQ = Object.freeze({ kind: "const", name: "Eq", levels: [] });
const IDENTITY_TYPE = Object.freeze({
  kind: "forall",
  binderName: "x",
  binderType: BASE,
  body: BASE,
  binderInfo: "default",
});
const IDENTITY_VALUE = Object.freeze({
  kind: "lam",
  binderName: "x",
  binderType: BASE,
  body: { kind: "bvar", index: 0 },
  binderInfo: "default",
});

const bundle = Object.freeze({
  schema: MATHLIB_M0_TRANSPORT_SCHEMA,
  upstream: PIN,
  declarations: [
    {
      qualifiedName: "M0.Base",
      dependencies: [],
      externalDependencies: [],
      kernel: { kind: "axiom", type: SORT_ZERO },
    },
    {
      qualifiedName: "M0.Identity",
      dependencies: ["M0.Base"],
      externalDependencies: [],
      kernel: { kind: "theorem", type: IDENTITY_TYPE, value: IDENTITY_VALUE },
    },
  ],
});

const parsed = parseMathlibM0TransportBundle(bundle);
same(parsed.schema, MATHLIB_M0_TRANSPORT_SCHEMA, "schema must be canonical");
same(parsed.upstream.mathlibSha, PIN.mathlibSha, "mathlib pin must survive parsing");
same(parsed.upstream.leanToolchain, PIN.leanToolchain, "Lean pin must survive parsing");
same(parsed.declarations.length, 2, "dependency-closed corpus size");
same(parsed.declarations[0]?.kernel.type.kind, "sort", "kernel type must remain structural IR");
same(parsed.declarations[1]?.dependencies[0], "M0.Base", "dependency identity must remain explicit");

const canonicalA = canonicalMathlibM0TransportBundleJson(bundle);
const canonicalB = canonicalMathlibM0TransportBundleJson({
  declarations: [...bundle.declarations],
  upstream: { ...PIN },
  schema: MATHLIB_M0_TRANSPORT_SCHEMA,
});
same(canonicalA, canonicalB, "transport identity must ignore input object key order");

const digestA = await computeMathlibM0TransportBundleDigest(bundle);
const digestB = await computeMathlibM0TransportBundleDigest(JSON.parse(canonicalA));
same(digestA.scheme, "mts-mathlib-m0-transport/sha-256/v0.1", "digest scheme");
same(digestA.value, digestB.value, "canonical transport digest must replay");
assert(/^[0-9a-f]{64}$/.test(digestA.value), "digest must be lowercase SHA-256");

const changedTargetDigest = await computeMathlibM0TransportBundleDigest({
  ...bundle,
  declarations: [
    bundle.declarations[0],
    {
      ...bundle.declarations[1],
      dependencies: ["M0.Base"],
      kernel: {
        ...bundle.declarations[1]!.kernel,
        type: { ...IDENTITY_TYPE, body: SORT_ZERO },
      },
    },
  ],
});
assert(changedTargetDigest.value !== digestA.value, "changed theorem target must change transport identity");

const changedProofDigest = await computeMathlibM0TransportBundleDigest({
  ...bundle,
  declarations: [
    bundle.declarations[0],
    {
      ...bundle.declarations[1],
      kernel: {
        ...bundle.declarations[1]!.kernel,
        value: { ...IDENTITY_VALUE, body: BASE },
      },
    },
  ],
});
assert(changedProofDigest.value !== digestA.value, "changed theorem value must change transport identity");

const changedExternalDigest = await computeMathlibM0TransportBundleDigest({
  ...bundle,
  declarations: [
    bundle.declarations[0],
    {
      ...bundle.declarations[1],
      externalDependencies: ["Eq"],
      kernel: {
        ...bundle.declarations[1]!.kernel,
        value: {
          kind: "app",
          fn: { kind: "app", fn: EQ, arg: BASE },
          arg: { kind: "bvar", index: 0 },
        },
      },
    },
  ],
});
assert(changedExternalDigest.value !== digestA.value, "changed external support must change transport identity");

expectReject("unsupported-schema", {
  ...bundle,
  schema: "mts-mathlib-m0-transport/v9.9",
});

expectReject("invalid-upstream", {
  ...bundle,
  upstream: { ...PIN, mathlibSha: "main" },
});

expectReject("invalid-upstream", {
  ...bundle,
  upstream: { ...PIN, leanToolchain: "" },
});

expectReject("invalid-declaration", {
  ...bundle,
  declarations: [],
});

expectReject("duplicate-declaration", {
  ...bundle,
  declarations: [bundle.declarations[0], bundle.declarations[0]],
});

expectReject("invalid-declaration", {
  ...bundle,
  declarations: [
    bundle.declarations[0],
    { ...bundle.declarations[1], dependencies: ["M0.Base", "M0.Base"] },
  ],
});

expectReject("invalid-declaration", {
  ...bundle,
  declarations: [
    bundle.declarations[0],
    { ...bundle.declarations[1], externalDependencies: ["Nat", "Nat"] },
  ],
});

expectReject("invalid-declaration", {
  ...bundle,
  declarations: [
    bundle.declarations[0],
    { ...bundle.declarations[1], externalDependencies: ["M0.Identity"] },
  ],
});

expectReject("invalid-declaration", {
  ...bundle,
  declarations: [
    bundle.declarations[0],
    { ...bundle.declarations[1], dependencies: ["M0.Base"], externalDependencies: ["M0.Base"] },
  ],
});

expectReject("invalid-declaration", {
  ...bundle,
  declarations: [
    bundle.declarations[0],
    { ...bundle.declarations[1], dependencies: ["M0.Identity"] },
  ],
});

expectReject("missing-dependency", {
  ...bundle,
  declarations: [
    bundle.declarations[0],
    { ...bundle.declarations[1], dependencies: ["M0.Missing"] },
  ],
});

expectReject("forward-dependency", {
  ...bundle,
  declarations: [bundle.declarations[1], bundle.declarations[0]],
});

expectReject("dependency-identity-mismatch", {
  ...bundle,
  declarations: [
    bundle.declarations[0],
    { ...bundle.declarations[1], dependencies: [], externalDependencies: [] },
  ],
});

expectReject("unsupported-kernel-expression", {
  ...bundle,
  declarations: [
    bundle.declarations[0],
    {
      qualifiedName: "M0.Unsupported",
      dependencies: [],
      externalDependencies: [],
      kernel: {
        kind: "theorem",
        type: { kind: "mvar", id: "?m.1" },
        value: { kind: "bvar", index: 0 },
      },
    },
  ],
});

expectReject("unsupported-kernel-form", {
  ...bundle,
  declarations: [
    bundle.declarations[0],
    {
      qualifiedName: "M0.Unsafe",
      dependencies: [],
      externalDependencies: [],
      kernel: { kind: "opaque-bytecode", type: SORT_ZERO },
    },
  ],
});

expectReject("invalid-envelope", {
  ...bundle,
  translatorTrusted: true,
});

expectReject("invalid-envelope", {
  ...bundle,
  declarations: [
    bundle.declarations[0],
    {
      ...bundle.declarations[1],
      approved: true,
    },
  ],
});

expectReject("invalid-envelope", {
  ...bundle,
  declarations: [
    bundle.declarations[0],
    {
      ...bundle.declarations[1],
      kernel: {
        ...bundle.declarations[1]!.kernel,
        trusted: true,
      },
    },
  ],
});

console.log("mathlib-m0-transport.test.ts: ok");
