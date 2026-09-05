import { parseMathlibM0ExternalBoundary } from "./mathlib-m0-external-boundary.js";
import {
  MATHLIB_M0_TRANSPORT_DIGEST_SCHEME,
  type MathlibM0TransportBundle,
  parseMathlibM0TransportBundle,
} from "./mathlib-m0-transport.js";

export const MATHLIB_M0_RESULT_SCHEMA = "mts-mathlib-m0-result/v0.1" as const;
export const MATHLIB_M0_DECLARATION_DIGEST_SCHEME =
  "mts-mathlib-m0-declaration/sha-256/v0.1" as const;

export type MathlibM0DeclarationDisposition =
  | "approved"
  | "rejected"
  | "unsupported"
  | "blocked-by-dependency";

export interface MathlibM0DeclarationOutcome {
  readonly qualifiedName: string;
  readonly dependencies: readonly string[];
  readonly translated: boolean;
  readonly disposition: MathlibM0DeclarationDisposition;
  readonly mtsEvidenceDigest: string | null;
  readonly trustedApproverDigest: string | null;
}

export interface MathlibM0DeclarationResult extends MathlibM0DeclarationOutcome {
  readonly transportDigest: string;
}

export interface MathlibM0ResultCounts {
  readonly translated: number;
  readonly approved: number;
  readonly rejected: number;
  readonly unsupported: number;
  readonly blockedByDependency: number;
}

export interface MathlibM0ResultReport {
  readonly schema: typeof MATHLIB_M0_RESULT_SCHEMA;
  readonly upstream: MathlibM0TransportBundle["upstream"];
  readonly transportScheme: typeof MATHLIB_M0_TRANSPORT_DIGEST_SCHEME;
  readonly declarationDigestScheme: typeof MATHLIB_M0_DECLARATION_DIGEST_SCHEME;
  readonly declarations: readonly MathlibM0DeclarationResult[];
  readonly counts: MathlibM0ResultCounts;
}

export interface MathlibM0BoundaryDisposition {
  readonly qualifiedName: string;
  readonly disposition: "unsupported" | "blocked-by-dependency" | null;
  readonly unsupportedExternalDependencies: readonly string[];
}

export type MathlibM0ResultErrorCode =
  | "result-set-mismatch"
  | "dependency-identity-mismatch"
  | "invalid-result-state"
  | "invalid-evidence-digest"
  | "invalid-dependency-result"
  | "boundary-upstream-mismatch"
  | "boundary-identity-mismatch";

export class MathlibM0ResultError extends Error {
  override readonly name = "MathlibM0ResultError";

  constructor(readonly code: MathlibM0ResultErrorCode) {
    super(code);
  }
}

function fail(code: MathlibM0ResultErrorCode): never {
  throw new MathlibM0ResultError(code);
}

function lowercaseHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256(domain: string, value: unknown): Promise<string> {
  const raw = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${domain}\n${JSON.stringify(value)}`),
  );
  return lowercaseHex(new Uint8Array(raw));
}

function validDigest(value: string | null): boolean {
  return value !== null && /^[0-9a-f]{64}$/.test(value);
}

export function deriveMathlibM0BoundaryDispositions(
  transportInput: unknown,
  boundaryInput: unknown,
): readonly MathlibM0BoundaryDisposition[] {
  const bundle = parseMathlibM0TransportBundle(transportInput);
  const boundary = parseMathlibM0ExternalBoundary(boundaryInput);

  if (
    boundary.upstream.mathlibSha !== bundle.upstream.mathlibSha ||
    boundary.upstream.leanToolchain !== bundle.upstream.leanToolchain
  ) {
    fail("boundary-upstream-mismatch");
  }

  const expectedReferences = new Map<string, Set<string>>();
  for (const declaration of bundle.declarations) {
    for (const externalName of declaration.externalDependencies) {
      let referencedBy = expectedReferences.get(externalName);
      if (referencedBy === undefined) {
        referencedBy = new Set<string>();
        expectedReferences.set(externalName, referencedBy);
      }
      referencedBy.add(declaration.qualifiedName);
    }
  }

  const expectedIdentity = [...expectedReferences.entries()]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([qualifiedName, referencedBy]) => ({
      qualifiedName,
      referencedBy: [...referencedBy].sort(),
    }));
  const actualIdentity = boundary.entries.map((entry) => ({
    qualifiedName: entry.qualifiedName,
    referencedBy: [...entry.referencedBy],
  }));
  if (JSON.stringify(actualIdentity) !== JSON.stringify(expectedIdentity)) {
    fail("boundary-identity-mismatch");
  }

  const blocked = new Set<string>();
  const dispositions: MathlibM0BoundaryDisposition[] = [];
  for (const declaration of bundle.declarations) {
    let disposition: MathlibM0BoundaryDisposition["disposition"] = null;
    if (declaration.externalDependencies.length > 0) {
      disposition = "unsupported";
    } else if (declaration.dependencies.some((dependency) => blocked.has(dependency))) {
      disposition = "blocked-by-dependency";
    }

    if (disposition !== null) blocked.add(declaration.qualifiedName);
    dispositions.push(
      Object.freeze({
        qualifiedName: declaration.qualifiedName,
        disposition,
        unsupportedExternalDependencies: Object.freeze(
          disposition === "unsupported" ? [...declaration.externalDependencies] : [],
        ),
      }),
    );
  }

  return Object.freeze(dispositions);
}

export async function computeMathlibM0DeclarationTransportDigest(
  input: unknown,
  qualifiedName: string,
): Promise<string> {
  const bundle = parseMathlibM0TransportBundle(input);
  const declaration = bundle.declarations.find((candidate) => candidate.qualifiedName === qualifiedName);
  if (declaration === undefined) fail("result-set-mismatch");
  return sha256(MATHLIB_M0_DECLARATION_DIGEST_SCHEME, {
    upstream: bundle.upstream,
    declaration,
  });
}

export async function buildMathlibM0ResultReport(
  input: unknown,
  outcomes: readonly MathlibM0DeclarationOutcome[],
): Promise<MathlibM0ResultReport> {
  const bundle = parseMathlibM0TransportBundle(input);
  if (outcomes.length !== bundle.declarations.length) fail("result-set-mismatch");

  const approved = new Set<string>();
  const declarations: MathlibM0DeclarationResult[] = [];

  for (let index = 0; index < bundle.declarations.length; index += 1) {
    const declaration = bundle.declarations[index]!;
    const outcome = outcomes[index]!;
    if (outcome.qualifiedName !== declaration.qualifiedName) fail("result-set-mismatch");
    if (
      outcome.dependencies.length !== declaration.dependencies.length ||
      outcome.dependencies.some((dependency, dependencyIndex) => dependency !== declaration.dependencies[dependencyIndex])
    ) {
      fail("dependency-identity-mismatch");
    }

    const hasBlockedDependency = declaration.dependencies.some((dependency) => !approved.has(dependency));
    if (outcome.disposition === "blocked-by-dependency") {
      if (!hasBlockedDependency || outcome.translated) fail("invalid-dependency-result");
    } else if (hasBlockedDependency) {
      fail("invalid-dependency-result");
    }

    if (outcome.disposition === "approved" || outcome.disposition === "rejected") {
      if (!outcome.translated) fail("invalid-result-state");
      if (!validDigest(outcome.mtsEvidenceDigest) || !validDigest(outcome.trustedApproverDigest)) {
        fail("invalid-evidence-digest");
      }
    } else if (outcome.mtsEvidenceDigest !== null || outcome.trustedApproverDigest !== null) {
      fail("invalid-result-state");
    }

    if (outcome.disposition === "unsupported" && outcome.translated) fail("invalid-result-state");
    if (outcome.disposition === "approved") approved.add(outcome.qualifiedName);

    declarations.push(
      Object.freeze({
        ...outcome,
        dependencies: Object.freeze([...outcome.dependencies]),
        transportDigest: await computeMathlibM0DeclarationTransportDigest(bundle, declaration.qualifiedName),
      }),
    );
  }

  const count = (disposition: MathlibM0DeclarationDisposition): number =>
    declarations.filter((result) => result.disposition === disposition).length;

  return Object.freeze({
    schema: MATHLIB_M0_RESULT_SCHEMA,
    upstream: bundle.upstream,
    transportScheme: MATHLIB_M0_TRANSPORT_DIGEST_SCHEME,
    declarationDigestScheme: MATHLIB_M0_DECLARATION_DIGEST_SCHEME,
    declarations: Object.freeze(declarations),
    counts: Object.freeze({
      translated: declarations.filter((result) => result.translated).length,
      approved: count("approved"),
      rejected: count("rejected"),
      unsupported: count("unsupported"),
      blockedByDependency: count("blocked-by-dependency"),
    }),
  });
}
