import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Integration provenance: pins already Author-approved compact NOT artifacts from #1980/#1989; no new JSON approval is introduced.
// Approval boundary: changed/new compact NOT JSON still requires explicit Author confirmation; this gate validates only the pinned approved artifact.
function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error("v0.15 compact NOT approved source integrity: " + message);
}

const repo = resolve(process.cwd(), "..");
const expected = new Map<string, string>([
  ["formal/v0.15/regression/compact-not.formal", "42697be6cad8b522e1b4a7fbfd75fda5f7af5d313a995a42105c82f8ceec2c47"],
  ["formal/v0.15/regression/compact-not.json", "eed9bebaf4ecd34be160da3a9cdf006f7f9c1802b780da0f0fe44d2fb2487da2"],
  ["formal/v0.15/regression/compact-not.recursive", "1728cf457b3d1cc6db132bb7d9e2b312d16999023002f73c3529cf622938c692"],
]);

for (const [path, sha256] of expected) {
  const bytes = readFileSync(resolve(repo, path));
  const actual = createHash("sha256").update(bytes).digest("hex");
  assert(actual === sha256, path + " approved SHA-256");
}

console.log([
  "MTS_V015_COMPACT_NOT_APPROVED_SOURCE=INTEGRITY_GREEN",
  "AUTHOR_DECISION=APPROVE_ALL_EXISTING",
  "AUTHOR_DECISION_EVIDENCE=netkeep80/anum_docs#1980 issuecomment-6024720547",
  "ARTIFACTS=FORMAL_JSON_RECURSIVE",
  "DIGESTS=EXACT",
].join(" "));
