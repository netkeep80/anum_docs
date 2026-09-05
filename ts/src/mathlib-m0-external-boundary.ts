export const MATHLIB_M0_EXTERNAL_BOUNDARY_SCHEMA =
  "mts-mathlib-m0-external-boundary/v0.1" as const;

export type MathlibM0ConstantInfoKind =
  | "axiom"
  | "definition"
  | "theorem"
  | "opaque"
  | "quotient"
  | "inductive"
  | "constructor"
  | "recursor";

export interface MathlibM0ExternalBoundaryEntry {
  readonly qualifiedName: string;
  readonly constantInfoKind: MathlibM0ConstantInfoKind;
  readonly referencedBy: readonly string[];
}

export interface MathlibM0ExternalBoundary {
  readonly schema: typeof MATHLIB_M0_EXTERNAL_BOUNDARY_SCHEMA;
  readonly upstream: Readonly<{
    mathlibSha: string;
    leanToolchain: string;
  }>;
  readonly entries: readonly MathlibM0ExternalBoundaryEntry[];
}

export type MathlibM0ExternalBoundaryErrorCode =
  | "invalid-envelope"
  | "unsupported-schema"
  | "invalid-upstream"
  | "invalid-entry"
  | "unsupported-constant-info-kind"
  | "duplicate-entry"
  | "unsorted-entry"
  | "duplicate-reference"
  | "unsorted-reference";

export class MathlibM0ExternalBoundaryError extends Error {
  override readonly name = "MathlibM0ExternalBoundaryError";

  constructor(readonly code: MathlibM0ExternalBoundaryErrorCode) {
    super(code);
  }
}

const CONSTANT_INFO_KINDS = new Set<MathlibM0ConstantInfoKind>([
  "axiom",
  "definition",
  "theorem",
  "opaque",
  "quotient",
  "inductive",
  "constructor",
  "recursor",
]);

function fail(code: MathlibM0ExternalBoundaryErrorCode): never {
  throw new MathlibM0ExternalBoundaryError(code);
}

function record(
  value: unknown,
  code: MathlibM0ExternalBoundaryErrorCode,
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail(code);
  return value as Record<string, unknown>;
}

function exactRecord(
  value: unknown,
  keys: readonly string[],
  code: MathlibM0ExternalBoundaryErrorCode,
): Record<string, unknown> {
  const candidate = record(value, code);
  const actualKeys = Object.keys(candidate);
  if (actualKeys.length !== keys.length || keys.some((key) => !Object.hasOwn(candidate, key))) {
    fail(code);
  }
  return candidate;
}

function nonEmptyText(value: unknown, code: MathlibM0ExternalBoundaryErrorCode): string {
  if (typeof value !== "string" || value.length === 0) fail(code);
  return value;
}

function parseUpstream(value: unknown): MathlibM0ExternalBoundary["upstream"] {
  const upstream = exactRecord(value, ["mathlibSha", "leanToolchain"], "invalid-upstream");
  const mathlibSha = nonEmptyText(upstream.mathlibSha, "invalid-upstream");
  const leanToolchain = nonEmptyText(upstream.leanToolchain, "invalid-upstream");
  if (!/^[0-9a-f]{40}$/.test(mathlibSha)) fail("invalid-upstream");
  return Object.freeze({ mathlibSha, leanToolchain });
}

function parseConstantInfoKind(value: unknown): MathlibM0ConstantInfoKind {
  if (typeof value !== "string" || !CONSTANT_INFO_KINDS.has(value as MathlibM0ConstantInfoKind)) {
    fail("unsupported-constant-info-kind");
  }
  return value as MathlibM0ConstantInfoKind;
}

function parseReferences(value: unknown): readonly string[] {
  if (!Array.isArray(value) || value.length === 0) fail("invalid-entry");
  const references = value.map((reference) => nonEmptyText(reference, "invalid-entry"));
  const seen = new Set<string>();
  for (const reference of references) {
    if (seen.has(reference)) fail("duplicate-reference");
    seen.add(reference);
  }
  for (let index = 1; index < references.length; index += 1) {
    if (references[index]! < references[index - 1]!) fail("unsorted-reference");
  }
  return Object.freeze(references);
}

function parseEntry(value: unknown): MathlibM0ExternalBoundaryEntry {
  const entry = exactRecord(
    value,
    ["qualifiedName", "constantInfoKind", "referencedBy"],
    "invalid-entry",
  );
  return Object.freeze({
    qualifiedName: nonEmptyText(entry.qualifiedName, "invalid-entry"),
    constantInfoKind: parseConstantInfoKind(entry.constantInfoKind),
    referencedBy: parseReferences(entry.referencedBy),
  });
}

function parseEntries(value: unknown): readonly MathlibM0ExternalBoundaryEntry[] {
  if (!Array.isArray(value)) fail("invalid-envelope");
  const entries = value.map(parseEntry);
  const seen = new Set<string>();
  for (const entry of entries) {
    if (seen.has(entry.qualifiedName)) fail("duplicate-entry");
    seen.add(entry.qualifiedName);
  }
  for (let index = 1; index < entries.length; index += 1) {
    if (entries[index]!.qualifiedName < entries[index - 1]!.qualifiedName) fail("unsorted-entry");
  }
  return Object.freeze(entries);
}

export function parseMathlibM0ExternalBoundary(input: unknown): MathlibM0ExternalBoundary {
  const envelope = exactRecord(input, ["schema", "upstream", "entries"], "invalid-envelope");
  if (envelope.schema !== MATHLIB_M0_EXTERNAL_BOUNDARY_SCHEMA) fail("unsupported-schema");
  return Object.freeze({
    schema: MATHLIB_M0_EXTERNAL_BOUNDARY_SCHEMA,
    upstream: parseUpstream(envelope.upstream),
    entries: parseEntries(envelope.entries),
  });
}
