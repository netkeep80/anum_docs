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

const bundle = Object.freeze({
  schema: MATHLIB_M0_TRANSPORT_SCHEMA,
  upstream: PIN,
  declarations: [
    {
      qualifiedName: "M0.Base",
      dependencies: [],
      kernel: { kind: "axiom", type: "Sort 0" },
    },
    {
      qualifiedName: "M0.Identity",
      dependencies: ["M0.Base"],
      kernel: { kind: "theorem", type: "M0.Base -> M0.Base", value: "fun x => x" },
    },
  ],
});

const parsed = parseMathlibM0TransportBundle(bundle);
same(parsed.schema, MATHLIB_M0_TRANSPORT_SCHEMA, "schema must be canonical");
same(parsed.upstream.mathlibSha, PIN.mathlibSha, "mathlib pin must survive parsing");
same(parsed.upstream.leanToolchain, PIN.leanToolchain, "Lean pin must survive parsing");
same(parsed.declarations.length, 2, "dependency-closed corpus size");
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
      kernel: {
        ...bundle.declarations[1].kernel,
        type: "M0.Base -> Sort 0",
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
        ...bundle.declarations[1].kernel,
        value: "fun _ => M0.Base",
      },
    },
  ],
});
assert(changedProofDigest.value !== digestA.value, "changed theorem value must change transport identity");

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

expectReject("unsupported-kernel-form", {
  ...bundle,
  declarations: [
    bundle.declarations[0],
    {
      qualifiedName: "M0.Unsafe",
      dependencies: ["M0.Base"],
      kernel: { kind: "opaque-bytecode", type: "M0.Base" },
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
        ...bundle.declarations[1].kernel,
        trusted: true,
      },
    },
  ],
});

console.log("mathlib-m0-transport.test.ts: ok");
