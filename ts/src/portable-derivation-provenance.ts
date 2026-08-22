import {
  PORTABLE_STRUCTURAL_DERIVATION_CONTENT_DIGEST_SCHEME,
  PORTABLE_STRUCTURAL_DERIVATION_WITH_ASSUMPTIONS_CONTENT_DIGEST_SCHEME,
  computePortableStructuralDerivationContentDigest,
  computePortableStructuralDerivationWithAssumptionsContentDigest,
  type PortableStructuralDerivationContentDigest,
  type PortableStructuralDerivationWithAssumptionsContentDigest,
} from "./portable-derivation-digest.js";

export const PORTABLE_STRUCTURAL_DERIVATION_PROVENANCE_SCHEMA =
  "mts-portable-structural-derivation-provenance/v0.1" as const;
export const PORTABLE_STRUCTURAL_DERIVATION_PROVENANCE_DIGEST_SCHEME =
  "mts-portable-structural-derivation-provenance/sha-256/v0.1" as const;
export const PORTABLE_STRUCTURAL_DERIVATION_WITH_ASSUMPTIONS_PROVENANCE_SCHEMA =
  "mts-portable-structural-derivation-with-assumptions-provenance/v0.1" as const;
export const PORTABLE_STRUCTURAL_DERIVATION_WITH_ASSUMPTIONS_PROVENANCE_DIGEST_SCHEME =
  "mts-portable-structural-derivation-with-assumptions-provenance/sha-256/v0.1" as const;

export interface PortableStructuralDerivationSourceProvenance {
  readonly locator: string;
  readonly revision: string;
  readonly subject: string;
}

export interface PortableStructuralDerivationProducerProvenance {
  readonly id: string;
  readonly version: string;
}

export interface PortableStructuralDerivationProvenanceClaim {
  readonly schema: typeof PORTABLE_STRUCTURAL_DERIVATION_PROVENANCE_SCHEMA;
  readonly contentDigest: PortableStructuralDerivationContentDigest;
  readonly source: PortableStructuralDerivationSourceProvenance;
  readonly producer: PortableStructuralDerivationProducerProvenance;
}

export interface PortableStructuralDerivationProvenanceDigest {
  readonly scheme: typeof PORTABLE_STRUCTURAL_DERIVATION_PROVENANCE_DIGEST_SCHEME;
  readonly value: string;
}

export interface PortableStructuralDerivationWithAssumptionsProvenanceClaim {
  readonly schema: typeof PORTABLE_STRUCTURAL_DERIVATION_WITH_ASSUMPTIONS_PROVENANCE_SCHEMA;
  readonly contentDigest: PortableStructuralDerivationWithAssumptionsContentDigest;
  readonly source: PortableStructuralDerivationSourceProvenance;
  readonly producer: PortableStructuralDerivationProducerProvenance;
}

export interface PortableStructuralDerivationWithAssumptionsProvenanceDigest {
  readonly scheme: typeof PORTABLE_STRUCTURAL_DERIVATION_WITH_ASSUMPTIONS_PROVENANCE_DIGEST_SCHEME;
  readonly value: string;
}

export type PortableStructuralDerivationProvenanceErrorCode =
  | "invalid-envelope"
  | "unsupported-schema"
  | "invalid-content-digest"
  | "invalid-provenance-string"
  | "content-digest-mismatch";

export class PortableStructuralDerivationProvenanceError extends Error {
  override readonly name = "PortableStructuralDerivationProvenanceError";

  constructor(readonly code: PortableStructuralDerivationProvenanceErrorCode) {
    super(code);
  }
}

function fail(code: PortableStructuralDerivationProvenanceErrorCode): never {
  throw new PortableStructuralDerivationProvenanceError(code);
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail("invalid-envelope");
  }
  return value as Record<string, unknown>;
}

function exactRecord(value: unknown, keys: readonly string[]): Record<string, unknown> {
  const candidate = record(value);
  const actual = Object.keys(candidate).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    fail("invalid-envelope");
  }
  return candidate;
}

function exactText(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    fail("invalid-provenance-string");
  }
  return value;
}

function parseContentDigest(value: unknown): PortableStructuralDerivationContentDigest {
  const digest = exactRecord(value, ["scheme", "value"]);
  if (digest.scheme !== PORTABLE_STRUCTURAL_DERIVATION_CONTENT_DIGEST_SCHEME) {
    fail("invalid-content-digest");
  }
  if (typeof digest.value !== "string" || !/^[0-9a-f]{64}$/.test(digest.value)) {
    fail("invalid-content-digest");
  }
  return Object.freeze({
    scheme: PORTABLE_STRUCTURAL_DERIVATION_CONTENT_DIGEST_SCHEME,
    value: digest.value,
  });
}

function parseContentDigestWithAssumptions(
  value: unknown,
): PortableStructuralDerivationWithAssumptionsContentDigest {
  const digest = exactRecord(value, ["scheme", "value"]);
  if (digest.scheme !== PORTABLE_STRUCTURAL_DERIVATION_WITH_ASSUMPTIONS_CONTENT_DIGEST_SCHEME) {
    fail("invalid-content-digest");
  }
  if (typeof digest.value !== "string" || !/^[0-9a-f]{64}$/.test(digest.value)) {
    fail("invalid-content-digest");
  }
  return Object.freeze({
    scheme: PORTABLE_STRUCTURAL_DERIVATION_WITH_ASSUMPTIONS_CONTENT_DIGEST_SCHEME,
    value: digest.value,
  });
}

function parseSource(value: unknown): PortableStructuralDerivationSourceProvenance {
  const source = exactRecord(value, ["locator", "revision", "subject"]);
  return Object.freeze({
    locator: exactText(source.locator),
    revision: exactText(source.revision),
    subject: exactText(source.subject),
  });
}

function parseProducer(value: unknown): PortableStructuralDerivationProducerProvenance {
  const producer = exactRecord(value, ["id", "version"]);
  return Object.freeze({
    id: exactText(producer.id),
    version: exactText(producer.version),
  });
}

function parseClaim(value: unknown): PortableStructuralDerivationProvenanceClaim {
  const claim = exactRecord(value, ["schema", "contentDigest", "source", "producer"]);
  if (claim.schema !== PORTABLE_STRUCTURAL_DERIVATION_PROVENANCE_SCHEMA) {
    fail("unsupported-schema");
  }
  return Object.freeze({
    schema: PORTABLE_STRUCTURAL_DERIVATION_PROVENANCE_SCHEMA,
    contentDigest: parseContentDigest(claim.contentDigest),
    source: parseSource(claim.source),
    producer: parseProducer(claim.producer),
  });
}

function parseClaimWithAssumptions(
  value: unknown,
): PortableStructuralDerivationWithAssumptionsProvenanceClaim {
  const claim = exactRecord(value, ["schema", "contentDigest", "source", "producer"]);
  if (claim.schema !== PORTABLE_STRUCTURAL_DERIVATION_WITH_ASSUMPTIONS_PROVENANCE_SCHEMA) {
    fail("unsupported-schema");
  }
  return Object.freeze({
    schema: PORTABLE_STRUCTURAL_DERIVATION_WITH_ASSUMPTIONS_PROVENANCE_SCHEMA,
    contentDigest: parseContentDigestWithAssumptions(claim.contentDigest),
    source: parseSource(claim.source),
    producer: parseProducer(claim.producer),
  });
}

export function canonicalPortableStructuralDerivationProvenanceClaimJson(
  input: unknown,
): string {
  return JSON.stringify(parseClaim(input));
}

export function canonicalPortableStructuralDerivationWithAssumptionsProvenanceClaimJson(
  input: unknown,
): string {
  return JSON.stringify(parseClaimWithAssumptions(input));
}

export async function createPortableStructuralDerivationProvenanceClaim(
  artifact: unknown,
  source: PortableStructuralDerivationSourceProvenance,
  producer: PortableStructuralDerivationProducerProvenance,
): Promise<PortableStructuralDerivationProvenanceClaim> {
  const contentDigest = await computePortableStructuralDerivationContentDigest(artifact);
  return Object.freeze({
    schema: PORTABLE_STRUCTURAL_DERIVATION_PROVENANCE_SCHEMA,
    contentDigest,
    source: parseSource(source),
    producer: parseProducer(producer),
  });
}

export async function createPortableStructuralDerivationWithAssumptionsProvenanceClaim(
  artifact: unknown,
  source: PortableStructuralDerivationSourceProvenance,
  producer: PortableStructuralDerivationProducerProvenance,
): Promise<PortableStructuralDerivationWithAssumptionsProvenanceClaim> {
  const contentDigest = await computePortableStructuralDerivationWithAssumptionsContentDigest(artifact);
  return Object.freeze({
    schema: PORTABLE_STRUCTURAL_DERIVATION_WITH_ASSUMPTIONS_PROVENANCE_SCHEMA,
    contentDigest,
    source: parseSource(source),
    producer: parseProducer(producer),
  });
}

function lowercaseHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function computePortableStructuralDerivationProvenanceDigest(
  input: unknown,
): Promise<PortableStructuralDerivationProvenanceDigest> {
  const canonicalJson = canonicalPortableStructuralDerivationProvenanceClaimJson(input);
  const preimage = `${PORTABLE_STRUCTURAL_DERIVATION_PROVENANCE_DIGEST_SCHEME}\n${canonicalJson}`;
  const raw = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(preimage));
  return Object.freeze({
    scheme: PORTABLE_STRUCTURAL_DERIVATION_PROVENANCE_DIGEST_SCHEME,
    value: lowercaseHex(new Uint8Array(raw)),
  });
}

export async function computePortableStructuralDerivationWithAssumptionsProvenanceDigest(
  input: unknown,
): Promise<PortableStructuralDerivationWithAssumptionsProvenanceDigest> {
  const canonicalJson = canonicalPortableStructuralDerivationWithAssumptionsProvenanceClaimJson(input);
  const preimage = `${PORTABLE_STRUCTURAL_DERIVATION_WITH_ASSUMPTIONS_PROVENANCE_DIGEST_SCHEME}\n${canonicalJson}`;
  const raw = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(preimage));
  return Object.freeze({
    scheme: PORTABLE_STRUCTURAL_DERIVATION_WITH_ASSUMPTIONS_PROVENANCE_DIGEST_SCHEME,
    value: lowercaseHex(new Uint8Array(raw)),
  });
}

export async function verifyPortableStructuralDerivationProvenanceClaim(
  artifact: unknown,
  input: unknown,
): Promise<PortableStructuralDerivationProvenanceClaim> {
  const claim = parseClaim(input);
  const actual = await computePortableStructuralDerivationContentDigest(artifact);
  if (actual.value !== claim.contentDigest.value) fail("content-digest-mismatch");
  return claim;
}

export async function verifyPortableStructuralDerivationWithAssumptionsProvenanceClaim(
  artifact: unknown,
  input: unknown,
): Promise<PortableStructuralDerivationWithAssumptionsProvenanceClaim> {
  const claim = parseClaimWithAssumptions(input);
  const actual = await computePortableStructuralDerivationWithAssumptionsContentDigest(artifact);
  if (actual.value !== claim.contentDigest.value) fail("content-digest-mismatch");
  return claim;
}
