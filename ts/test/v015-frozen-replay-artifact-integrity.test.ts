import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Clean-main integrity boundary for the approved v0.15 frozen replay corpus.
// Package files are generated backend compatibility artifacts; evidence files
// are exact persisted results from frozen A-memory 0.175.0 replay.
function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error("v0.15 frozen replay artifact integrity: " + message);
}

interface ReplaySpec {
  readonly id: string;
  readonly packagePath: string;
  readonly packageSha256: string;
  readonly evidencePath: string;
  readonly evidenceSha256: string;
  readonly expectedRuns: number;
}

const specs: readonly ReplaySpec[] = Object.freeze([
  {
    id: "grounded-zero-role",
    packagePath: "formal/v0.15/regression/grounded-zero-role.amemory-package.json",
    packageSha256: "354be494b42c78d310a868144f5c63fec915fec932a01d1d36b274d79258fce4",
    evidencePath: "formal/v0.15/regression/grounded-zero-role.amemory-evidence.json",
    evidenceSha256: "f57dcf427e6df2ce39ac9c5f8e2125411ded29d21bc2e5c5af8a64d389e30808",
    expectedRuns: 1,
  },
  {
    id: "two-role-meta-rule",
    packagePath: "formal/v0.15/regression/two-role-meta-rule.amemory-package.json",
    packageSha256: "ce8758fbe3ca6de992c1382db8af543f17aa55495cf0bad542e290c336e4be03",
    evidencePath: "formal/v0.15/regression/two-role-meta-rule.amemory-evidence.json",
    evidenceSha256: "1c9625a5c370fa47f8c56ac84f5b2e2df32a092e8bf0e1458864376967e17f0e",
    expectedRuns: 1,
  },
  {
    id: "compact-and",
    packagePath: "formal/v0.15/regression/compact-and.amemory-package.json",
    packageSha256: "749f2eca71bd0e7f5d9ffb6d7d9e9e530b2aea8b3318e2a8bae25a423c347c8a",
    evidencePath: "formal/v0.15/regression/compact-and.amemory-evidence.json",
    evidenceSha256: "9283e135f57629acef84579ff91c374b91bc390ebdc39e5449b344174d17692a",
    expectedRuns: 4,
  },
  {
    id: "compact-not",
    packagePath: "formal/v0.15/regression/compact-not.amemory-package.json",
    packageSha256: "8ba546035b6c9c2f9b18e87a1d30fb6edcbb9063d76cf9ffb1cb2877d7ebf227",
    evidencePath: "formal/v0.15/regression/compact-not.amemory-evidence.json",
    evidenceSha256: "a8fda00d61957d717b0c57e6b67de7c2b36d909c63a3d10cc42b0111a505f49d",
    expectedRuns: 2,
  },
  {
    id: "compact-or",
    packagePath: "formal/v0.15/regression/compact-or.amemory-package.json",
    packageSha256: "e49e977ba0dbdcd518db80e26b93cff408c04be4208f688a534640eca76c660d",
    evidencePath: "formal/v0.15/regression/compact-or.amemory-evidence.json",
    evidenceSha256: "626315ecb8662a254201c269e81e2d611b7ab2ea71a3fa7ff50145e7bf50bdb6",
    expectedRuns: 4,
  },
  {
    id: "compact-xor",
    packagePath: "formal/v0.15/regression/compact-xor.amemory-package.json",
    packageSha256: "821d135c460ccfe74d8e3f89d889375760412a1c9823ebc793f103082e923584",
    evidencePath: "formal/v0.15/regression/compact-xor.amemory-evidence.json",
    evidenceSha256: "2dec5b6e48c60ab382089c639e4ad620bf03166d117db9e7c14036cfcde4fcf9",
    expectedRuns: 4,
  },
]);

const repo = resolve(process.cwd(), "..");
const digest = (text: string): string =>
  createHash("sha256").update(text, "utf8").digest("hex");

for (const spec of specs) {
  const packageText = readFileSync(resolve(repo, spec.packagePath), "utf8");
  assert(digest(packageText) === spec.packageSha256, spec.id + " package SHA-256");

  const evidenceText = readFileSync(resolve(repo, spec.evidencePath), "utf8");
  assert(digest(evidenceText) === spec.evidenceSha256, spec.id + " evidence SHA-256");

  const evidence = JSON.parse(evidenceText) as {
    readonly schema?: unknown;
    readonly runs?: readonly { readonly expected?: unknown; readonly result?: unknown }[];
    readonly negative_run?: unknown;
  };
  assert(
    evidence.schema === "mts-v015-recursive-execution-evidence/v0.1",
    spec.id + " evidence schema",
  );
  assert(Array.isArray(evidence.runs), spec.id + " evidence runs");
  assert(evidence.runs.length === spec.expectedRuns, spec.id + " evidence run count");
  for (const run of evidence.runs) {
    assert(run.result === run.expected, spec.id + " frozen result equals expected");
  }
  assert(evidence.negative_run !== undefined, spec.id + " negative replay evidence");
}

console.log([
  "MTS_V015_FROZEN_REPLAY_ARTIFACT_INTEGRITY=GREEN",
  "ARTIFACTS=6",
  "PACKAGE_FILES=6",
  "EVIDENCE_FILES=6",
  "DIGESTS=PINNED",
  "FROZEN_AMEMORY=0.175.0",
  "FROZEN_MAIN=832daa89f15fd0f3b7b40819b6d3670c7fd57e7d",
].join(" "));
