import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error("v0.15 grounded approved source integrity: " + message);
}

const repo = resolve(process.cwd(), "..");
const expected = new Map<string, string>([
  ["formal/v0.15/regression/grounded-zero-role.formal", "b0e5760786c900ab125f775f9f30d897336220ee2393f3c0e3fd5cff2296d51a"],
  ["formal/v0.15/regression/grounded-zero-role.json", "d3304cee2d4037c8b144ac4c112b40591c8c1bf3bbd939f2e01393fa723a9f61"],
  ["formal/v0.15/regression/grounded-zero-role.recursive", "570950556cc0703a915c39e4e6f181ed55103f13544f8f8a1a5e25a099f76b11"],
]);

for (const [path, sha256] of expected) {
  const bytes = readFileSync(resolve(repo, path));
  const actual = createHash("sha256").update(bytes).digest("hex");
  assert(actual === sha256, path + " approved SHA-256");
}

console.log([
  "MTS_V015_GROUNDED_APPROVED_SOURCE=INTEGRITY_GREEN",
  "AUTHOR_JSON_REVIEW=APPROVED_EXISTING_DECISION",
  "ARTIFACTS=FORMAL_JSON_RECURSIVE",
  "DIGESTS=EXACT",
].join(" "));
