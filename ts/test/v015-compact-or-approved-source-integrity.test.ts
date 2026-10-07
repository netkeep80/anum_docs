import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Integration provenance: pins already Author-approved compact OR artifacts from #1980/#1989; no new JSON approval is introduced.
// Approval boundary: changed/new compact OR JSON still requires explicit Author confirmation; this gate validates only the pinned approved artifact.
// Canonical integration source is regression/* only; candidate copies are intentionally excluded from main.
function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error("v0.15 compact OR approved source integrity: " + message);
}

const repo = resolve(process.cwd(), "..");
const expected = new Map<string, string>([
  ["formal/v0.15/regression/compact-or.formal", "04f794a27c26249c0eb75a5163add1a46ddb5537d6b4b783782e3044db9528ee"],
  ["formal/v0.15/regression/compact-or.json", "3fbcd16fb0e067fa5c84be5d86a39a964da45cf7fdcc03880d2e23c28f5b6c29"],
  ["formal/v0.15/regression/compact-or.recursive", "7f0253479dacc1d568a1ce931eab943264a42770554c46dd96966a9ed4f85668"],
]);

for (const [path, sha256] of expected) {
  const bytes = readFileSync(resolve(repo, path));
  const actual = createHash("sha256").update(bytes).digest("hex");
  assert(actual === sha256, path + " approved SHA-256");
}

console.log([
  "MTS_V015_COMPACT_OR_APPROVED_SOURCE=INTEGRITY_GREEN",
  "AUTHOR_DECISION=APPROVE_ALL_EXISTING",
  "AUTHOR_DECISION_EVIDENCE=netkeep80/anum_docs#1980 issuecomment-6024720547",
  "ARTIFACTS=FORMAL_JSON_RECURSIVE",
  "DIGESTS=EXACT",
].join(" "));
