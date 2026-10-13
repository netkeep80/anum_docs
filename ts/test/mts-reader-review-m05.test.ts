import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {loadReaderG20} from "../src/tooling/mts-reader-g20.js";
import {renderReaderW6} from "../src/tooling/mts-reader-r44-w6.js";
import {loadReaderM05,parseReaderM05,REVIEW_M05_PATH}
 from "../src/tooling/mts-reader-review-m05.js";

const root=resolve(".."),raw=readFileSync(resolve(root,REVIEW_M05_PATH),"utf8");
const m=loadReaderM05(root);
assert.equal(m.publication,"blocked");
assert.equal(m.placement,"unresolved-without-source-owned-caption");
assert.equal(m.originals.length,29);
assert.equal(new Set(m.originals.map(x=>x.path)).size,29);
assert.equal(m.banner,"docs/assets/anum_docs-banner.jpg");
assert.equal(m.openObligations.length,4);
assert.ok(m.archiveMd.includes("Приложение Ж."));
assert.ok(m.archiveMd.includes("научная атрибуция не установлена"));
assert.ok(m.archiveMd.includes("30/30 файлов учтены"));
assert.equal(m.archiveMd.split("## Приложение Ж.").length-1,1);
for(const original of m.originals) {
 assert.ok(m.archiveMd.includes(original.gitBlobSha1));
 assert.ok(m.archiveMd.includes(encodeURIComponent(original.path.split("/").at(-1)!)));
}
const reader=renderReaderW6(root);
assert.equal(reader.publication,"blocked");
assert.equal(reader.annexes.split("## Приложение Ж.").length-1,1);
assert.equal(reader.mainText.includes("## Приложение Ж."),false);
assert.ok(reader.mainText.includes("### M04."));
assert.equal(reader.sourceFragments.size,119);
assert.equal(reader.mainIds.length,102);
assert.equal(reader.annexIds.length,17);
for(const atom of loadReaderG20(root).ordered)
 assert.equal(reader.sourceFragments.get(atom.id)?.join(""),atom.textRu,
  "original historical Russian prose byte drift "+atom.id);
assert.equal((reader.annexes.match(/^### R40-(?:06|07|09|10|11|12|13|14|15) /gm)??[]).length,9);
function mutate(a:string,b:string){
 assert.ok(raw.includes(a),"missing YAML mutation fixture "+a);
 return parseReaderM05(raw.replace(a,b),root);
}
assert.throws(()=>mutate("author_approval: not-recorded","author_approval: accepted"),
 /cannot alter historic original authority/);
assert.throws(()=>mutate("publication: blocked","publication: ready"),
 /cannot alter historic original authority/);
assert.throws(()=>mutate("semantic_change: false","semantic_change: true"),
 /cannot alter historic original authority/);
assert.throws(()=>mutate("history_count: 29","history_count: 28"),
 /cannot alter historic original authority/);
assert.throws(()=>mutate("historical_manifest_git_blob: 4b2dd052",
 "historical_manifest_git_blob: 00000000"),/cannot alter historic original authority/);
assert.throws(()=>mutate("scientific_placement: unresolved-without-source-owned-caption",
 "scientific_placement: completed"),/cannot alter historic original authority/);
assert.throws(()=>mutate("M05_INDIVIDUAL_29_IMAGE_SCIENTIFIC_ATTRIBUTION",
 "M05_ATTRIBUTION_APPROVED"),/individual image provenance gates remain open/);
assert.throws(()=>parseReaderM05(raw+"\npublication: accepted\n",root),
 /invalid or duplicated YAML/);
console.log("M05: 29 SHA-pinned historical originals + separate banner; source "+
 "manifest immutable, no scientific caption claims, 119/119 source fragments retained.");
