export const MATHLIB_M0_TRANSPORT_SCHEMA = "mts-mathlib-m0-transport/v0.1" as const;
export const MATHLIB_M0_TRANSPORT_DIGEST_SCHEME =
  "mts-mathlib-m0-transport/sha-256/v0.1" as const;

export interface MathlibM0UpstreamPin {
  readonly mathlibSha: string;
  readonly leanToolchain: string;
}

export type MathlibM0KernelLevel =
  | Readonly<{ kind: "zero" }>
  | Readonly<{ kind: "param"; name: string }>
  | Readonly<{ kind: "succ"; level: MathlibM0KernelLevel }>;

export type MathlibM0KernelBinderInfo =
  | "default"
  | "implicit"
  | "strictImplicit"
  | "instImplicit";

export type MathlibM0KernelLiteral =
  | Readonly<{ kind: "nat"; value: string }>
  | Readonly<{ kind: "string"; value: string }>;

export type MathlibM0KernelExpr =
  | Readonly<{ kind: "bvar"; index: number }>
  | Readonly<{ kind: "sort"; level: MathlibM0KernelLevel }>
  | Readonly<{ kind: "const"; name: string; levels: readonly MathlibM0KernelLevel[] }>
  | Readonly<{ kind: "app"; fn: MathlibM0KernelExpr; arg: MathlibM0KernelExpr }>
  | Readonly<{
      kind: "lam";
      binderName: string;
      binderType: MathlibM0KernelExpr;
      body: MathlibM0KernelExpr;
      binderInfo: MathlibM0KernelBinderInfo;
    }>
  | Readonly<{
      kind: "forall";
      binderName: string;
      binderType: MathlibM0KernelExpr;
      body: MathlibM0KernelExpr;
      binderInfo: MathlibM0KernelBinderInfo;
    }>
  | Readonly<{ kind: "lit"; literal: MathlibM0KernelLiteral }>;

export type MathlibM0KernelForm =
  | Readonly<{ kind: "axiom"; type: MathlibM0KernelExpr }>
  | Readonly<{ kind: "theorem"; type: MathlibM0KernelExpr; value: MathlibM0KernelExpr }>
  | Readonly<{ kind: "definition"; type: MathlibM0KernelExpr; value: MathlibM0KernelExpr }>;

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
  | "dependency-identity-mismatch"
  | "unsupported-kernel-form"
  | "unsupported-kernel-expression";

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

function kernelText(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) fail("unsupported-kernel-expression");
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

function parseKernelLevel(value: unknown): MathlibM0KernelLevel {
  const candidate = record(value);
  if (candidate.kind === "zero") {
    exactRecord(candidate, ["kind"]);
    return Object.freeze({ kind: "zero" });
  }
  if (candidate.kind === "param") {
    const level = exactRecord(candidate, ["kind", "name"]);
    return Object.freeze({ kind: "param", name: kernelText(level.name) });
  }
  if (candidate.kind === "succ") {
    const level = exactRecord(candidate, ["kind", "level"]);
    return Object.freeze({ kind: "succ", level: parseKernelLevel(level.level) });
  }
  fail("unsupported-kernel-expression");
}

function parseBinderInfo(value: unknown): MathlibM0KernelBinderInfo {
  if (
    value === "default" ||
    value === "implicit" ||
    value === "strictImplicit" ||
    value === "instImplicit"
  ) {
    return value;
  }
  fail("unsupported-kernel-expression");
}

function parseKernelLiteral(value: unknown): MathlibM0KernelLiteral {
  const candidate = record(value);
  if (candidate.kind === "nat") {
    const literal = exactRecord(candidate, ["kind", "value"]);
    if (typeof literal.value !== "string" || !/^(0|[1-9][0-9]*)$/.test(literal.value)) {
      fail("unsupported-kernel-expression");
    }
    return Object.freeze({ kind: "nat", value: literal.value });
  }
  if (candidate.kind === "string") {
    const literal = exactRecord(candidate, ["kind", "value"]);
    if (typeof literal.value !== "string") fail("unsupported-kernel-expression");
    return Object.freeze({ kind: "string", value: literal.value });
  }
  fail("unsupported-kernel-expression");
}

function parseKernelExpr(value: unknown): MathlibM0KernelExpr {
  const candidate = record(value);
  if (candidate.kind === "bvar") {
    const expr = exactRecord(candidate, ["kind", "index"]);
    if (typeof expr.index !== "number" || !Number.isInteger(expr.index) || expr.index < 0) {
      fail("unsupported-kernel-expression");
    }
    return Object.freeze({ kind: "bvar", index: expr.index });
  }
  if (candidate.kind === "sort") {
    const expr = exactRecord(candidate, ["kind", "level"]);
    return Object.freeze({ kind: "sort", level: parseKernelLevel(expr.level) });
  }
  if (candidate.kind === "const") {
    const expr = exactRecord(candidate, ["kind", "name", "levels"]);
    if (!Array.isArray(expr.levels)) fail("unsupported-kernel-expression");
    return Object.freeze({
      kind: "const",
      name: kernelText(expr.name),
      levels: Object.freeze(expr.levels.map(parseKernelLevel)),
    });
  }
  if (candidate.kind === "app") {
    const expr = exactRecord(candidate, ["kind", "fn", "arg"]);
    return Object.freeze({
      kind: "app",
      fn: parseKernelExpr(expr.fn),
      arg: parseKernelExpr(expr.arg),
    });
  }
  if (candidate.kind === "lam" || candidate.kind === "forall") {
    const expr = exactRecord(candidate, ["kind", "binderName", "binderType", "body", "binderInfo"]);
    return Object.freeze({
      kind: candidate.kind,
      binderName: kernelText(expr.binderName),
      binderType: parseKernelExpr(expr.binderType),
      body: parseKernelExpr(expr.body),
      binderInfo: parseBinderInfo(expr.binderInfo),
    });
  }
  if (candidate.kind === "lit") {
    const expr = exactRecord(candidate, ["kind", "literal"]);
    return Object.freeze({ kind: "lit", literal: parseKernelLiteral(expr.literal) });
  }
  fail("unsupported-kernel-expression");
}

function parseKernel(value: unknown): MathlibM0KernelForm {
  const candidate = record(value);
  if (candidate.kind === "axiom") {
    const kernel = exactRecord(candidate, ["kind", "type"]);
    return Object.freeze({ kind: "axiom", type: parseKernelExpr(kernel.type) });
  }
  if (candidate.kind === "theorem" || candidate.kind === "definition") {
    const kernel = exactRecord(candidate, ["kind", "type", "value"]);
    return Object.freeze({
      kind: candidate.kind,
      type: parseKernelExpr(kernel.type),
      value: parseKernelExpr(kernel.value),
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

function collectKernelConstants(expr: MathlibM0KernelExpr, target: Set<string>): void {
  switch (expr.kind) {
    case "const":
      target.add(expr.name);
      return;
    case "app":
      collectKernelConstants(expr.fn, target);
      collectKernelConstants(expr.arg, target);
      return;
    case "lam":
    case "forall":
      collectKernelConstants(expr.binderType, target);
      collectKernelConstants(expr.body, target);
      return;
    case "bvar":
    case "sort":
    case "lit":
      return;
  }
}

function kernelReferences(kernel: MathlibM0KernelForm): readonly string[] {
  const references = new Set<string>();
  collectKernelConstants(kernel.type, references);
  if (kernel.kind !== "axiom") collectKernelConstants(kernel.value, references);
  return Object.freeze([...references].sort());
}

function sortedUniqueDeclarationTexts(value: readonly unknown[]): readonly string[] {
  const parsed = value.map(declarationText);
  if (new Set(parsed).size !== parsed.length) fail("invalid-declaration");
  return Object.freeze([...parsed].sort());
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function parseMathlibM0TransportBundle(input: unknown): MathlibM0TransportBundle {
  const bundle = exactRecord(input, ["schema", "upstream", "declarations"]);
  if (bundle.schema !== MATHLIB_M0_TRANSPORT_SCHEMA) fail("unsupported-schema");
  const rawDeclarations = bundle.declarations;
  if (!Array.isArray(rawDeclarations) || rawDeclarations.length === 0) fail("invalid-declaration");

  const seen = new Set<string>();
  const declarations: MathlibM0TransportDeclaration[] = [];

  for (const rawDeclaration of rawDeclarations) {
    const candidate = exactRecord(rawDeclaration, [
      "qualifiedName",
      "dependencies",
      "externalDependencies",
      "kernel",
    ]);
    const qualifiedName = declarationText(candidate.qualifiedName);
    if (seen.has(qualifiedName)) fail("duplicate-declaration");
    const rawDependencies = candidate.dependencies;
    const rawExternalDependencies = candidate.externalDependencies;
    if (!Array.isArray(rawDependencies) || !Array.isArray(rawExternalDependencies)) {
      fail("invalid-declaration");
    }

    const dependencies = sortedUniqueDeclarationTexts(rawDependencies);
    const externalDependencies = sortedUniqueDeclarationTexts(rawExternalDependencies);
    if (
      dependencies.includes(qualifiedName) ||
      externalDependencies.includes(qualifiedName) ||
      externalDependencies.some((dependency) => dependencies.includes(dependency))
    ) {
      fail("invalid-declaration");
    }

    for (const externalDependency of externalDependencies) {
      if (declarationAppearsInBundle(rawDeclarations, externalDependency)) fail("invalid-declaration");
    }

    for (const dependency of dependencies) {
      if (!seen.has(dependency)) {
        fail(declarationAppearsInBundle(rawDeclarations, dependency) ? "forward-dependency" : "missing-dependency");
      }
    }

    const kernel = parseKernel(candidate.kernel);
    const references = kernelReferences(kernel);
    if (references.includes(qualifiedName)) fail("dependency-identity-mismatch");
    const derivedDependencies = references.filter((reference) =>
      declarationAppearsInBundle(rawDeclarations, reference),
    );
    const derivedExternalDependencies = references.filter(
      (reference) => !declarationAppearsInBundle(rawDeclarations, reference),
    );
    if (
      !sameStrings(dependencies, derivedDependencies) ||
      !sameStrings(externalDependencies, derivedExternalDependencies)
    ) {
      fail("dependency-identity-mismatch");
    }

    declarations.push(
      Object.freeze({
        qualifiedName,
        dependencies,
        externalDependencies,
        kernel,
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
