import { canonicalPortableStructuralDerivationV02Json } from "./portable-derivation.js";

export const PORTABLE_STRUCTURAL_DERIVATION_CONTENT_DIGEST_SCHEME =
  "mts-portable-structural-derivation-content/sha-256/v0.1" as const;

export interface PortableStructuralDerivationContentDigest {
  readonly scheme: typeof PORTABLE_STRUCTURAL_DERIVATION_CONTENT_DIGEST_SCHEME;
  readonly value: string;
}

function lowercaseHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function computePortableStructuralDerivationContentDigest(
  input: unknown,
): Promise<PortableStructuralDerivationContentDigest> {
  const canonicalJson = canonicalPortableStructuralDerivationV02Json(input);
  const preimage = `${PORTABLE_STRUCTURAL_DERIVATION_CONTENT_DIGEST_SCHEME}\n${canonicalJson}`;
  const encoded = new TextEncoder().encode(preimage);
  const raw = await globalThis.crypto.subtle.digest("SHA-256", encoded);
  return Object.freeze({
    scheme: PORTABLE_STRUCTURAL_DERIVATION_CONTENT_DIGEST_SCHEME,
    value: lowercaseHex(new Uint8Array(raw)),
  });
}
