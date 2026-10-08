import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd(), "..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const backlog = JSON.parse(read("audits/v015-theorem-formal-migration-backlog.json")) as {
  schema: string;
  status: string;
  sourceInventoryBlobSha: string;
  sourceOverlayBlobSha: string;
  oldInventoryCount: number;
  formalMigrationCount: number;
  missingCount: number;
  migrationsRequired: { id: string; sourceStatement: string; lawRefs: string[]; dependencies: string[]; premises: string[];
    proposedFormalStatement: null; formalSemanticsEvidence: null; migrationStatus: string }[];
};
const blobSha = (source: string) =>
  createHash("sha1").update(Buffer.from("blob " + Buffer.byteLength(source, "utf8") + "\0" + source, "utf8")).digest("hex");
const historicalText = read("theorems/current-v0.14.json");
const formalText = read("theorems/formal-v0.15.json");
const historical = JSON.parse(historicalText).theorems as {
  id: string; statement: string; lawRefs: string[]; dependsOn: string[]; formalPremises: string[] }[];
const migrated = JSON.parse(formalText).entries as { id: string }[];
assert.equal(backlog.schema, "mts-v015-theorem-formal-migration-backlog/v0.1");
assert.equal(backlog.sourceInventoryBlobSha, blobSha(historicalText), "pinned historical theorem source");
assert.equal(backlog.sourceOverlayBlobSha, blobSha(formalText), "pinned current FORMAL theorem overlay");
const migratedIds = new Set(migrated.map((item) => item.id));
assert.equal(migratedIds.size, migrated.length, "no duplicate FORMAL theorem IDs");
const remaining = historical.filter((item) => !migratedIds.has(item.id));
assert.equal(backlog.oldInventoryCount, historical.length);
assert.equal(backlog.formalMigrationCount, migrated.length);
assert.equal(backlog.missingCount, remaining.length);
assert.deepEqual(backlog.migrationsRequired.map((item) => item.id), remaining.map((item) => item.id));
for (let i = 0; i < remaining.length; i++) {
  const source = remaining[i]!;
  const plan = backlog.migrationsRequired[i]!;
  assert.equal(plan.sourceStatement, source.statement, source.id + " original source mismatch");
  assert.deepEqual(plan.lawRefs, source.lawRefs);
  assert.deepEqual(plan.dependencies, source.dependsOn);
  assert.deepEqual(plan.premises, source.formalPremises);
  assert.equal(plan.proposedFormalStatement, null, "do not invent unreviewed FORMAL source");
  assert.equal(plan.formalSemanticsEvidence, null, "do not invent semantic denotation/proof evidence");
  assert.equal(plan.migrationStatus, "BLOCKED_NOT_MIGRATED");
}
if (remaining.length) assert.equal(backlog.status, "INCOMPLETE_BLOCKS_FORMAL_DOC_CONSISTENCY");
console.log("v0.15 theorem FORMAL migration: inventory locked; migrated=" +
  migrated.length + "/" + historical.length + "; remaining=" + remaining.length + "; FULL_FORMAL_COVERAGE_NOT_CLAIMED");
