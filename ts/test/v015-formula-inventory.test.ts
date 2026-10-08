import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd(), "..");
const inventory = JSON.parse(readFileSync(resolve(root, "audits/v015-formula-candidate-inventory.json"), "utf8")) as {
  schema: string;
  status: string;
  files: { path: string; blobSha: string; lineCount: number }[];
  counts: { files: number; candidates: number; fences: number; inline: number };
  candidates: { id: string; path: string; startLine: number; endLine: number; kind: string; source: string; role: string; denotation: string }[];
};
assert.equal(inventory.schema, "mts-v015-current-doc-formula-candidate-inventory/v0.1");
assert.equal(inventory.status, "INCOMPLETE_REQUIRES_SEMANTIC_CLASSIFICATION");
const candidate = /⟼|->|≡|∈|⇒|=|\{\}|\{[A-Za-zА-Яа-я, ]+\}|\bDen\(|\bJ\(/u;
const actual: typeof inventory.candidates = [];
for (const file of inventory.files) {
  const content = readFileSync(resolve(root, file.path), "utf8");
  const gitObject = Buffer.from("blob " + Buffer.byteLength(content, "utf8") + "\0" + content, "utf8");
  assert.equal(createHash("sha1").update(gitObject).digest("hex"), file.blobSha, file.path + " source blob drift");
  const lines = content.split(/\r?\n/);
  assert.equal(lines.length, file.lineCount, file.path + " line count drift");
  let inside = false;
  let firstLine = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const fence = line.match(/^\s*(```|~~~)(\w*)/);
    if (fence !== null) {
      if (!inside) {
        inside = true;
        firstLine = i;
      } else {
        const source = lines.slice(firstLine + 1, i).join("\n");
        if (candidate.test(source)) actual.push({
          id: "F" + String(actual.length + 1).padStart(4, "0"),
          path: file.path,
          startLine: firstLine + 2,
          endLine: i,
          kind: "fence",
          source,
          role: "UNCLASSIFIED",
          denotation: "NOT_VERIFIED",
        });
        inside = false;
      }
      continue;
    }
    if (inside) continue;
    for (const match of line.matchAll(/`([^`\n]+)`/g)) {
      const expression = match[1]!;
      if (candidate.test(expression)) actual.push({
        id: "F" + String(actual.length + 1).padStart(4, "0"),
        path: file.path,
        startLine: i + 1,
        endLine: i + 1,
        kind: "inline-code",
        source: expression,
        role: "UNCLASSIFIED",
        denotation: "NOT_VERIFIED",
      });
    }
  }
}
assert.equal(inventory.counts.files, inventory.files.length);
assert.equal(inventory.counts.candidates, actual.length);
assert.equal(inventory.counts.fences, actual.filter((entry) => entry.kind === "fence").length);
assert.equal(inventory.counts.inline, actual.filter((entry) => entry.kind === "inline-code").length);
for (let i = 0; i < actual.length; i++) {
  const expected = inventory.candidates[i]!;
  const observed = actual[i]!;
  for (const key of ["id", "path", "startLine", "endLine", "kind", "source"] as const) {
    assert.equal(observed[key], expected[key], "candidate " + observed.id + " " + key);
  }
}
assert.equal(inventory.candidates.length, actual.length);
const processCandidates = inventory.candidates.filter((entry) => entry.role === "NON_FORMAL_PROCESS_DIAGRAM");
assert.equal(processCandidates.length, 14, "only the governance/process diagram scope is reviewed as non-FORMAL");
for (const entry of processCandidates) {
  assert.equal(entry.path, "docs/CONTRIBUTING.md", "process exemption cannot be applied to semantic documentation");
  assert.equal(entry.denotation, "NOT_APPLICABLE_PROCESS_DOCUMENTATION");
}
const pending = inventory.candidates.filter((entry) => entry.role === "UNCLASSIFIED");
assert.equal(pending.length, 180, "semantic FORMAL verification backlog stays explicit");
assert.ok(pending.every((entry) => entry.denotation === "NOT_VERIFIED"), "unclassified formula must not claim semantic denotation");

console.log("v0.15 current formula candidate inventory: SNAPSHOT_GREEN " + actual.length + " candidates; 14 process / 180 pending; SEMANTIC_CONFORMANCE_NOT_YET_GREEN");
