import { MATHLIB_M0_TRANSPORT_SCHEMA } from "../src/mathlib-m0-transport.js";
import {
  MathlibM0ResultError,
  buildMathlibM0ResultReport,
  computeMathlibM0DeclarationTransportDigest,
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
      externalDependencies: ["Sort"],
      kernel: { kind: "axiom", type: "Sort 0" },
    },
    {
      qualifiedName: "M0.Rejected",
      dependencies: ["M0.Base"],
      externalDependencies: [],
      kernel: { kind: "theorem", type: "M0.Base", value: "proof" },
    },
    {
      qualifiedName: "M0.Blocked",
      dependencies: ["M0.Rejected"],
      externalDependencies: [],
      kernel: { kind: "definition", type: "M0.Base", value: "value" },
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
        kernel: { ...bundle.declarations[1].kernel, type: "Sort 0" },
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

console.log("mathlib-m0-result-accounting.test.ts: ok");
