import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

/** Immutable Author-designated historical picture evidence, issue #2080.
 * Changing or deleting a protected original MUST NOT pass CI unnoticed.
 * The manifest blob pin also prevents accidental "fix by editing the manifest".
 */
const root = resolve(process.cwd(), "..");
const manifestPath = resolve(root, "profiles/mts-historical-images.json");
const manifestBytes = readFileSync(manifestPath);
function gitBlobSha1(bytes: Uint8Array): string {
  return createHash("sha1")
    .update("blob " + bytes.byteLength + "\0")
    .update(bytes)
    .digest("hex");
}
assert.equal(gitBlobSha1(manifestBytes), "4b2dd0522c0fb0d9dcc8b20b69be7c330e123263",
  "the historical images preservation manifest is pinned to its original Git blob; do not silently rewrite");
const manifest = JSON.parse(manifestBytes.toString("utf8")) as {
  schema: string; origin: string; protectedSince: string;
  status: string; ownerIssue: number;
  pin: { repository: string; acceptedBaselineCommit: string };
  rules: Record<string, string>;
  assetCount: number; totalBytes: number;
  assets: { path: string; sizeBytes: number; gitBlobSha1: string }[];
};
assert.equal(manifest.schema, "mts-historical-images-protection/v0.1");
assert.equal(manifest.ownerIssue, 2080);
assert.equal(manifest.origin, "AUTHOR_DESIGNATED_HISTORICAL");
assert.equal(manifest.protectedSince, "2026-10-08");
assert.equal(manifest.status, "PERMANENT_HISTORICAL_RESEARCH_ASSETS_DO_NOT_DELETE");
assert.equal(manifest.pin.repository, "netkeep80/anum_docs");
assert.equal(manifest.pin.acceptedBaselineCommit, "813a1569300b241a3b70eb282eecd8231db15e4b");
for (const rule of ["delete", "rename", "overwrite", "compressInPlace", "replaceWithGeneratedDiagram"])
  assert.equal(manifest.rules[rule], "FORBIDDEN", "historical prohibition " + rule);
assert.equal(manifest.assetCount, 29);
assert.equal(manifest.assets.length, 29);
assert.equal(manifest.totalBytes, 12292726);
const protectedPaths = new Set<string>();
let size = 0;
for (const asset of manifest.assets) {
  assert.match(asset.path, /^pics\/[^/]+\.(?:jpe?g|png|svg)$/i,
    "only tracked historical images in pics are protected");
  assert.ok(!protectedPaths.has(asset.path), "duplicate protected image path");
  protectedPaths.add(asset.path);
  assert.ok(Number.isSafeInteger(asset.sizeBytes) && asset.sizeBytes > 0);
  assert.match(asset.gitBlobSha1, /^[0-9a-f]{40}$/);
  const localPath = resolve(root, asset.path);
  assert.ok(lstatSync(localPath).isFile(), "historical image must remain a file: " + asset.path);
  const bytes = readFileSync(localPath);
  assert.equal(bytes.length, asset.sizeBytes, "historical image byte count changed: " + asset.path);
  assert.equal(gitBlobSha1(bytes), asset.gitBlobSha1,
    "historical image bytes mutated or replaced: " + asset.path);
  size += bytes.length;
}
assert.equal(size, manifest.totalBytes, "historical image corpus byte count");
const actualImages = readdirSync(resolve(root, "pics"), { withFileTypes: true })
  .filter((entry) => /\.(jpe?g|png|svg)$/i.test(entry.name))
  .map((entry) => "pics/" + entry.name).sort();
assert.deepEqual([...protectedPaths].sort(), actualImages,
  "all pictures must be catalogued; new images require explicit historical/current role classification");
const readme = readFileSync(resolve(root, "pics/README.md"), "utf8");
assert.match(readme, /НЕ УДАЛЯТЬ/);
assert.ok(readme.includes("profiles/mts-historical-images.json"));
assert.ok(readme.includes("29"));
assert.ok(readme.includes("принятой"));
const first = manifest.assets[0];
assert.ok(first !== undefined);
const changed = Buffer.from(readFileSync(resolve(root, first.path)));
changed[0] = changed[0]! ^ 1;
assert.notEqual(gitBlobSha1(changed), first.gitBlobSha1,
  "negative regression: a one-byte historical mutation must be detected");
assert.notEqual(gitBlobSha1(Buffer.alloc(0)), first.gitBlobSha1,
  "negative regression: deleting bytes cannot preserve historical identity");
console.log("MTS HISTORICAL IMAGES: AUTHOR_PROTECTED=29/29; IMMUTABLE_GIT_BLOBS=PASS; MANIFEST_PIN=PASS; NEGATIVE_MUTATION=PASS; DELETE_RENAME_OVERWRITE=FORBIDDEN; TOTAL_BYTES=" + size);
