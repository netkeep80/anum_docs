import {
  canonicalPortableStructuralDerivationV02Json,
  canonicalPortableStructuralDerivationWithAssumptionsV01Json,
} from "./portable-derivation.js";

export const PORTABLE_STRUCTURAL_DERIVATION_CONTENT_DIGEST_SCHEME =
  "mts-portable-structural-derivation-content/sha-256/v0.1" as const;
export const PORTABLE_STRUCTURAL_DERIVATION_WITH_ASSUMPTIONS_CONTENT_DIGEST_SCHEME =
  "mts-portable-structural-derivation-with-assumptions-content/sha-256/v0.1" as const;

export interface PortableStructuralDerivationContentDigest {
  readonly scheme: typeof PORTABLE_STRUCTURAL_DERIVATION_CONTENT_DIGEST_SCHEME;
  readonly value: string;
}

export interface PortableStructuralDerivationWithAssumptionsContentDigest {
  readonly scheme: typeof PORTABLE_STRUCTURAL_DERIVATION_WITH_ASSUMPTIONS_CONTENT_DIGEST_SCHEME;
  readonly value: string;
}

function lowercaseHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function digestCanonicalJson(scheme: string, canonicalJson: string): Promise<string> {
  const preimage = `${scheme}\n${canonicalJson}`;
  const encoded = new TextEncoder().encode(preimage);
  const raw = await globalThis.crypto.subtle.digest("SHA-256", encoded);
  return lowercaseHex(new Uint8Array(raw));
}

export async function computePortableStructuralDerivationContentDigest(
  input: unknown,
): Promise<PortableStructuralDerivationContentDigest> {
  const canonicalJson = canonicalPortableStructuralDerivationV02Json(input);
  return Object.freeze({
    scheme: PORTABLE_STRUCTURAL_DERIVATION_CONTENT_DIGEST_SCHEME,
    value: await digestCanonicalJson(
      PORTABLE_STRUCTURAL_DERIVATION_CONTENT_DIGEST_SCHEME,
      canonicalJson,
    ),
  });
}

export async function computePortableStructuralDerivationWithAssumptionsContentDigest(
  input: unknown,
): Promise<PortableStructuralDerivationWithAssumptionsContentDigest> {
  const canonicalJson = canonicalPortableStructuralDerivationWithAssumptionsV01Json(input);
  return Object.freeze({
    scheme: PORTABLE_STRUCTURAL_DERIVATION_WITH_ASSUMPTIONS_CONTENT_DIGEST_SCHEME,
    value: await digestCanonicalJson(
      PORTABLE_STRUCTURAL_DERIVATION_WITH_ASSUMPTIONS_CONTENT_DIGEST_SCHEME,
      canonicalJson,
    ),
  });
}
