import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error("v0.15 two-role approved source integrity: " + message);
}

const repo = resolve(process.cwd(), "..");
const expected = new Map<string, string>([
  ["formal/v0.15/regression/two-role-meta-rule.formal", "f68e8629b5d476f49366f3f59e65ef64d523d5b5f8964dcf918283144ba292f9"],
  ["formal/v0.15/regression/two-role-meta-rule.json", "7597ac64d98b6243b3ffdc1a9bb5b6022aacb5a30ad134399c8b06457b9adf56"],
  ["formal/v0.15/regression/two-role-meta-rule.recursive", "ca6a6d39913a7a5947edaeaad9d45a43603781e7b2188fd5bc34a59712da8ed9"],
]);

for (const [path, sha256] of expected) {
  const bytes = readFileSync(resolve(repo, path));
  const actual = createHash("sha256").update(bytes).digest("hex");
  assert(actual === sha256, path + " approved SHA-256");
}

console.log([
  "MTS_V015_TWO_ROLE_APPROVED_SOURCE=INTEGRITY_GREEN",
  "AUTHOR_JSON_REVIEW=APPROVED_EXISTING_DECISION",
  "AUTHOR_DECISION=netkeep80/anum_docs#1188 issuecomment-5991612725",
  "ARTIFACTS=FORMAL_JSON_RECURSIVE",
  "DIGESTS=EXACT",
].join(" "));
