import {
  canonicalPortableProofSubAnetProjectionV01Json,
} from "./portable-proof-subanet-projection.js";

export const PORTABLE_PROOF_SUBANET_PROJECTION_CONTENT_DIGEST_SCHEME =
  "mts-portable-proof-subanet-projection-content/sha-256/v0.1" as const;

export interface PortableProofSubAnetProjectionContentDigest {
  readonly scheme: typeof PORTABLE_PROOF_SUBANET_PROJECTION_CONTENT_DIGEST_SCHEME;
  readonly value: string;
}

function lowercaseHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Computes transport-content identity only. The digest has zero proof authority:
 * trusted K1/K1e replay remains the sole proof ACCEPT/REJECT boundary.
 */
export async function computePortableProofSubAnetProjectionContentDigest(
  input: unknown,
): Promise<PortableProofSubAnetProjectionContentDigest> {
  const canonicalJson = canonicalPortableProofSubAnetProjectionV01Json(input);
  const preimage = `${PORTABLE_PROOF_SUBANET_PROJECTION_CONTENT_DIGEST_SCHEME}\n${canonicalJson}`;
  const encoded = new TextEncoder().encode(preimage);
  const raw = await globalThis.crypto.subtle.digest("SHA-256", encoded);
  return Object.freeze({
    scheme: PORTABLE_PROOF_SUBANET_PROJECTION_CONTENT_DIGEST_SCHEME,
    value: lowercaseHex(new Uint8Array(raw)),
  });
}
