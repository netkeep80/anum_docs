import { MATHLIB_M0_TRANSPORT_SCHEMA } from "../src/mathlib-m0-transport.js";
import {
  MathlibM0ResultError,
  buildMathlibM0ResultReport,
  computeMathlibM0DeclarationTransportDigest,
  deriveMathlibM0BoundaryDispositions,
} from "../src/mathlib-m0-result-accounting.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

async function expectReject(code: MathlibM0ResultError["code"], work: () => Promise<unknown>): Promise<void> {
  try {
    await work();
  } catch (error) {
    assert(error instanceof MathlibM0ResultError, `${code}: wrong error type`);
    same(error.code, code, `${code}: wrong error code`);
    return;
  }
  throw new Error(`${code}: expected result rejection`);
}

function expectBoundaryReject(work: () => unknown): void {
  try {
    work();
  } catch (error) {
    assert(error instanceof MathlibM0ResultError, "boundary mismatch must fail through result accounting");
    return;
  }
  throw new Error("expected boundary disposition rejection");
}

const SORT_ZERO = Object.freeze({ kind: "sort", level: { kind: "zero" } });
const BASE = Object.freeze({ kind: "const", name: "M0.Base", levels: [] });
const REJECTED = Object.freeze({ kind: "const", name: "M0.Rejected", levels: [] });

const bundle = {
  schema: MATHLIB_M0_TRANSPORT_SCHEMA,
  upstream: {
    mathlibSha: "d6893048e0d784c43f3cf098b61299b3a4b4aed0",
    leanToolchain: "leanprover/lean4:v4.34.0-rc2",
  },
  declarations: [
    {
      qualifiedName: "M0.Base",
      dependencies: [],
      externalDependencies: [],
      kernel: { kind: "axiom", type: SORT_ZERO },
    },
    {
      qualifiedName: "M0.Rejected",
      dependencies: ["M0.Base"],
      externalDependencies: [],
      kernel: { kind: "theorem", type: BASE, value: BASE },
    },
    {
      qualifiedName: "M0.Blocked",
      dependencies: ["M0.Rejected"],
      externalDependencies: [],
      kernel: { kind: "definition", type: REJECTED, value: REJECTED },
    },
  ],
} as const;

const digest = "a".repeat(64);
const outcomes = [
  {
    qualifiedName: "M0.Base",
    dependencies: [],
    translated: true,
    disposition: "approved",
    mtsEvidenceDigest: digest,
    trustedApproverDigest: digest,
  },
  {
    qualifiedName: "M0.Rejected",
    dependencies: ["M0.Base"],
    translated: true,
    disposition: "rejected",
    mtsEvidenceDigest: digest,
    trustedApproverDigest: digest,
  },
  {
    qualifiedName: "M0.Blocked",
    dependencies: ["M0.Rejected"],
    translated: false,
    disposition: "blocked-by-dependency",
    mtsEvidenceDigest: null,
    trustedApproverDigest: null,
  },
] as const;

const report = await buildMathlibM0ResultReport(bundle, outcomes);
same(report.declarations.length, 3, "all dependency-closed declarations must be accounted");
same(report.counts.translated, 2, "translated count");
same(report.counts.approved, 1, "approved count");
same(report.counts.rejected, 1, "rejected count");
same(report.counts.unsupported, 0, "unsupported count");
same(report.counts.blockedByDependency, 1, "blocked count");
assert(/^[0-9a-f]{64}$/.test(report.declarations[0]!.transportDigest), "per-declaration transport digest");

const replayDigest = await computeMathlibM0DeclarationTransportDigest(bundle, "M0.Rejected");
same(replayDigest, report.declarations[1]!.transportDigest, "declaration transport identity must replay");

const changedDigest = await computeMathlibM0DeclarationTransportDigest(
  {
    ...bundle,
    declarations: [
      bundle.declarations[0],
      {
        ...bundle.declarations[1],
        kernel: {
          ...bundle.declarations[1].kernel,
          type: { kind: "const", name: "M0.Base", levels: [{ kind: "zero" }] },
        },
      },
      bundle.declarations[2],
    ],
  },
  "M0.Rejected",
);
assert(changedDigest !== replayDigest, "changed declaration target must change per-declaration transport identity");

const changedExternalDigest = await computeMathlibM0DeclarationTransportDigest(
  {
    ...bundle,
    declarations: [
      bundle.declarations[0],
      {
        ...bundle.declarations[1],
        externalDependencies: ["Classical.choice"],
        kernel: {
          ...bundle.declarations[1].kernel,
          value: {
            kind: "app",
            fn: { kind: "const", name: "Classical.choice", levels: [] },
            arg: BASE,
          },
        },
      },
      bundle.declarations[2],
    ],
  },
  "M0.Rejected",
);
assert(
  changedExternalDigest !== replayDigest,
  "changed external support must change per-declaration transport identity",
);

await expectReject("dependency-identity-mismatch", () =>
  buildMathlibM0ResultReport(bundle, [
    outcomes[0],
    { ...outcomes[1], dependencies: [] },
    outcomes[2],
  ]),
);

await expectReject("invalid-evidence-digest", () =>
  buildMathlibM0ResultReport(bundle, [
    outcomes[0],
    { ...outcomes[1], trustedApproverDigest: "forged" },
    outcomes[2],
  ]),
);

await expectReject("invalid-dependency-result", () =>
  buildMathlibM0ResultReport(bundle, [
    outcomes[0],
    outcomes[1],
    {
      ...outcomes[2],
      translated: true,
      disposition: "approved",
      mtsEvidenceDigest: digest,
      trustedApproverDigest: digest,
    },
  ]),
);

const boundaryTransport = {
  schema: MATHLIB_M0_TRANSPORT_SCHEMA,
  upstream: bundle.upstream,
  declarations: [
    {
      qualifiedName: "M0.A",
      dependencies: [],
      externalDependencies: ["Eq"],
      kernel: {
        kind: "axiom",
        type: { kind: "const", name: "Eq", levels: [] },
      },
    },
    {
      qualifiedName: "M0.B",
      dependencies: ["M0.A"],
      externalDependencies: [],
      kernel: {
        kind: "theorem",
        type: { kind: "const", name: "M0.A", levels: [] },
        value: { kind: "const", name: "M0.A", levels: [] },
      },
    },
    {
      qualifiedName: "M0.C",
      dependencies: [],
      externalDependencies: [],
      kernel: { kind: "axiom", type: SORT_ZERO },
    },
  ],
} as const;

const boundaryEvidence = {
  schema: "mts-mathlib-m0-external-boundary/v0.1",
  upstream: bundle.upstream,
  entries: [
    {
      qualifiedName: "Eq",
      constantInfoKind: "inductive",
      referencedBy: ["M0.A"],
    },
  ],
} as const;

const boundaryDispositions = deriveMathlibM0BoundaryDispositions(boundaryTransport, boundaryEvidence);
same(boundaryDispositions.length, 3, "boundary audit must account for every transport declaration");
same(boundaryDispositions[0]!.qualifiedName, "M0.A", "direct unsupported identity");
same(boundaryDispositions[0]!.disposition, "unsupported", "direct external support must be unsupported");
same(boundaryDispositions[0]!.unsupportedExternalDependencies[0], "Eq", "direct unsupported dependency identity");
same(boundaryDispositions[1]!.qualifiedName, "M0.B", "blocked identity");
same(boundaryDispositions[1]!.disposition, "blocked-by-dependency", "unsupported dependency must block dependent");
same(boundaryDispositions[1]!.unsupportedExternalDependencies.length, 0, "blocked declaration has no direct unsupported names");
same(boundaryDispositions[2]!.qualifiedName, "M0.C", "unblocked identity");
same(boundaryDispositions[2]!.disposition, null, "boundary-clear declaration remains unclassified for future translation");

expectBoundaryReject(() =>
  deriveMathlibM0BoundaryDispositions(boundaryTransport, {
    ...boundaryEvidence,
    upstream: { ...boundaryEvidence.upstream, mathlibSha: "0".repeat(40) },
  }),
);
expectBoundaryReject(() =>
  deriveMathlibM0BoundaryDispositions(boundaryTransport, {
    ...boundaryEvidence,
    entries: [],
  }),
);
expectBoundaryReject(() =>
  deriveMathlibM0BoundaryDispositions(boundaryTransport, {
    ...boundaryEvidence,
    entries: [
      boundaryEvidence.entries[0],
      {
        qualifiedName: "False",
        constantInfoKind: "inductive",
        referencedBy: ["M0.A"],
      },
    ],
  }),
);
expectBoundaryReject(() =>
  deriveMathlibM0BoundaryDispositions(boundaryTransport, {
    ...boundaryEvidence,
    entries: [
      {
        ...boundaryEvidence.entries[0],
        referencedBy: ["M0.B"],
      },
    ],
  }),
);

console.log("mathlib-m0-result-accounting.test.ts: ok");
