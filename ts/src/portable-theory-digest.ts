import type { PortableStructuralTheoryArtifact } from "./portable-theory.js";

export const PORTABLE_STRUCTURAL_THEORY_REVISION_SCHEME =
  "mts-portable-structural-theory-revision/sha-256/v0.1" as const;

export interface PortableStructuralTheoryRevision {
  readonly scheme: typeof PORTABLE_STRUCTURAL_THEORY_REVISION_SCHEME;
  readonly value: string;
}

function lowercaseHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function canonicalJson(artifact: PortableStructuralTheoryArtifact): string {
  return JSON.stringify({
    schema: artifact.schema,
    mtsSemanticBase: artifact.mtsSemanticBase,
    topology: {
      schema: artifact.topology.schema,
      root: artifact.topology.root,
      links: artifact.topology.links.map(([start, end]) => [start, end]),
    },
    theoryCoordinate: artifact.theoryCoordinate,
  });
}

export async function computePortableStructuralTheoryRevision(
  artifact: PortableStructuralTheoryArtifact,
): Promise<PortableStructuralTheoryRevision> {
  const preimage = `${PORTABLE_STRUCTURAL_THEORY_REVISION_SCHEME}\n${canonicalJson(artifact)}`;
  const encoded = new TextEncoder().encode(preimage);
  const raw = await globalThis.crypto.subtle.digest("SHA-256", encoded);
  return Object.freeze({
    scheme: PORTABLE_STRUCTURAL_THEORY_REVISION_SCHEME,
    value: lowercaseHex(new Uint8Array(raw)),
  });
}
