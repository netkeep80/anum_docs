import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Integration provenance: pins already Author-approved compact AND artifacts from #1980/#1989; no new JSON approval is introduced.
// Approval boundary: changed/new compact AND JSON still requires explicit Author confirmation; this gate validates only the pinned approved artifact.
function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error("v0.15 compact AND approved source integrity: " + message);
}

const repo = resolve(process.cwd(), "..");
const expected = new Map<string, string>([
  ["formal/v0.15/regression/compact-and.formal", "4a5bc92e661ee1d4e0c2c5d51769805b5406651bb491345200d088c9ad23e5f3"],
  ["formal/v0.15/regression/compact-and.json", "cf5028f68500bba04ee10e06ac5512eec223078d8b428f4d5de1de6433ba5941"],
  ["formal/v0.15/regression/compact-and.recursive", "37b2c02b927eed6cdd061931b60930d0a31d674a49bc585b075401a5cb5ddcb0"],
]);

for (const [path, sha256] of expected) {
  const bytes = readFileSync(resolve(repo, path));
  const actual = createHash("sha256").update(bytes).digest("hex");
  assert(actual === sha256, path + " approved SHA-256");
}

console.log([
  "MTS_V015_COMPACT_AND_APPROVED_SOURCE=INTEGRITY_GREEN",
  "AUTHOR_JSON_REVIEW=APPROVED_EXISTING_DECISION",
  "AUTHOR_DECISION=netkeep80/anum_docs#1980 issuecomment-6023632594",
  "ARTIFACTS=FORMAL_JSON_RECURSIVE",
  "DIGESTS=EXACT",
].join(" "));
