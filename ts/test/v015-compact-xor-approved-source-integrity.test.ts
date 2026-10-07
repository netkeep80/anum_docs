import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Integration provenance: pins already Author-approved compact XOR artifacts from #1980/#1989; no new JSON approval is introduced.
// Approval boundary: changed/new compact XOR JSON still requires explicit Author confirmation; this gate validates only the pinned approved artifact.
// Canonical integration source is regression/* only; candidate copies are intentionally excluded from main.
function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error("v0.15 compact XOR approved source integrity: " + message);
}

const repo = resolve(process.cwd(), "..");
const expected = new Map<string, string>([
  ["formal/v0.15/regression/compact-xor.formal", "4721b9f02400613ad05a8cc50ac0add3520c6aa72c836f95fdb4edf44bbaa038"],
  ["formal/v0.15/regression/compact-xor.json", "1dc6cb2464f0bb1fc0d54388677ea9136d907caa174ad694388c054c57d24581"],
  ["formal/v0.15/regression/compact-xor.recursive", "40747a38d8fc3a9025a8576f3632145814c81688385bfc73ee44b64fc98fcd56"],
]);

for (const [path, sha256] of expected) {
  const bytes = readFileSync(resolve(repo, path));
  const actual = createHash("sha256").update(bytes).digest("hex");
  assert(actual === sha256, path + " approved SHA-256");
}

console.log([
  "MTS_V015_COMPACT_XOR_APPROVED_SOURCE=INTEGRITY_GREEN",
  "AUTHOR_DECISION=APPROVE_ALL_EXISTING",
  "AUTHOR_DECISION_EVIDENCE=netkeep80/anum_docs#1980 issuecomment-6024720547",
  "ARTIFACTS=FORMAL_JSON_RECURSIVE",
  "DIGESTS=EXACT",
].join(" "));
