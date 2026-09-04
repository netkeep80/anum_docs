export const MATHLIB_M0_TRANSPORT_SCHEMA = "mts-mathlib-m0-transport/v0.1" as const;
export const MATHLIB_M0_TRANSPORT_DIGEST_SCHEME =
  "mts-mathlib-m0-transport/sha-256/v0.1" as const;

export interface MathlibM0UpstreamPin {
  readonly mathlibSha: string;
  readonly leanToolchain: string;
}

export type MathlibM0KernelForm =
  | Readonly<{ kind: "axiom"; type: string }>
  | Readonly<{ kind: "theorem"; type: string; value: string }>
  | Readonly<{ kind: "definition"; type: string; value: string }>;

export interface MathlibM0TransportDeclaration {
  readonly qualifiedName: string;
  readonly dependencies: readonly string[];
  readonly externalDependencies: readonly string[];
  readonly kernel: MathlibM0KernelForm;
}

export interface MathlibM0TransportBundle {
  readonly schema: typeof MATHLIB_M0_TRANSPORT_SCHEMA;
  readonly upstream: MathlibM0UpstreamPin;
  readonly declarations: readonly MathlibM0TransportDeclaration[];
}

export interface MathlibM0TransportBundleDigest {
  readonly scheme: typeof MATHLIB_M0_TRANSPORT_DIGEST_SCHEME;
  readonly value: string;
}

export type MathlibM0TransportErrorCode =
  | "invalid-envelope"
  | "unsupported-schema"
  | "invalid-upstream"
  | "invalid-declaration"
  | "duplicate-declaration"
  | "missing-dependency"
  | "forward-dependency"
  | "unsupported-kernel-form";

export class MathlibM0TransportError extends Error {
  override readonly name = "MathlibM0TransportError";

  constructor(readonly code: MathlibM0TransportErrorCode) {
    super(code);
  }
}

function fail(code: MathlibM0TransportErrorCode): never {
  throw new MathlibM0TransportError(code);
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail("invalid-envelope");
  return value as Record<string, unknown>;
}

function exactRecord(value: unknown, keys: readonly string[]): Record<string, unknown> {
  const candidate = record(value);
  const actual = Object.keys(candidate).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail("invalid-envelope");
  }
  return candidate;
}

function declarationText(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) fail("invalid-declaration");
  return value;
}

function parseUpstream(value: unknown): MathlibM0UpstreamPin {
  const upstream = exactRecord(value, ["mathlibSha", "leanToolchain"]);
  if (
    typeof upstream.mathlibSha !== "string" ||
    !/^[0-9a-f]{40}$/.test(upstream.mathlibSha) ||
    typeof upstream.leanToolchain !== "string" ||
    upstream.leanToolchain.trim().length === 0
  ) {
    fail("invalid-upstream");
  }
  return Object.freeze({
    mathlibSha: upstream.mathlibSha,
    leanToolchain: upstream.leanToolchain,
  });
}

function parseKernel(value: unknown): MathlibM0KernelForm {
  const candidate = record(value);
  if (candidate.kind === "axiom") {
    const kernel = exactRecord(candidate, ["kind", "type"]);
    return Object.freeze({ kind: "axiom", type: declarationText(kernel.type) });
  }
  if (candidate.kind === "theorem" || candidate.kind === "definition") {
    const kernel = exactRecord(candidate, ["kind", "type", "value"]);
    return Object.freeze({
      kind: candidate.kind,
      type: declarationText(kernel.type),
      value: declarationText(kernel.value),
    });
  }
  fail("unsupported-kernel-form");
}

function declarationAppearsInBundle(declarations: readonly unknown[], qualifiedName: string): boolean {
  return declarations.some((value) => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
    return (value as Record<string, unknown>).qualifiedName === qualifiedName;
  });
}

export function parseMathlibM0TransportBundle(input: unknown): MathlibM0TransportBundle {
  const bundle = exactRecord(input, ["schema", "upstream", "declarations"]);
  if (bundle.schema !== MATHLIB_M0_TRANSPORT_SCHEMA) fail("unsupported-schema");
  if (!Array.isArray(bundle.declarations) || bundle.declarations.length === 0) fail("invalid-declaration");

  const seen = new Set<string>();
  const declarations: MathlibM0TransportDeclaration[] = [];

  for (const rawDeclaration of bundle.declarations) {
    const candidate = exactRecord(rawDeclaration, [
      "qualifiedName",
      "dependencies",
      "externalDependencies",
      "kernel",
    ]);
    const qualifiedName = declarationText(candidate.qualifiedName);
    if (seen.has(qualifiedName)) fail("duplicate-declaration");
    if (!Array.isArray(candidate.dependencies) || !Array.isArray(candidate.externalDependencies)) {
      fail("invalid-declaration");
    }

    const dependencies = candidate.dependencies.map(declarationText);
    const externalDependencies = candidate.externalDependencies.map(declarationText);
    if (
      new Set(dependencies).size !== dependencies.length ||
      new Set(externalDependencies).size !== externalDependencies.length ||
      dependencies.includes(qualifiedName) ||
      externalDependencies.includes(qualifiedName) ||
      externalDependencies.some((dependency) => dependencies.includes(dependency))
    ) {
      fail("invalid-declaration");
    }

    for (const externalDependency of externalDependencies) {
      if (declarationAppearsInBundle(bundle.declarations, externalDependency)) fail("invalid-declaration");
    }

    for (const dependency of dependencies) {
      if (!seen.has(dependency)) {
        fail(declarationAppearsInBundle(bundle.declarations, dependency) ? "forward-dependency" : "missing-dependency");
      }
    }

    declarations.push(
      Object.freeze({
        qualifiedName,
        dependencies: Object.freeze([...dependencies]),
        externalDependencies: Object.freeze([...externalDependencies]),
        kernel: parseKernel(candidate.kernel),
      }),
    );
    seen.add(qualifiedName);
  }

  return Object.freeze({
    schema: MATHLIB_M0_TRANSPORT_SCHEMA,
    upstream: parseUpstream(bundle.upstream),
    declarations: Object.freeze(declarations),
  });
}

export function canonicalMathlibM0TransportBundleJson(input: unknown): string {
  return JSON.stringify(parseMathlibM0TransportBundle(input));
}

function lowercaseHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function computeMathlibM0TransportBundleDigest(
  input: unknown,
): Promise<MathlibM0TransportBundleDigest> {
  const canonicalJson = canonicalMathlibM0TransportBundleJson(input);
  const raw = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${MATHLIB_M0_TRANSPORT_DIGEST_SCHEME}\n${canonicalJson}`),
  );
  return Object.freeze({
    scheme: MATHLIB_M0_TRANSPORT_DIGEST_SCHEME,
    value: lowercaseHex(new Uint8Array(raw)),
  });
}