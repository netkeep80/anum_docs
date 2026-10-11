import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseDocument } from "yaml";
import {
  READER_G20_PATH, loadReaderG20, parseReaderG20, readerG20Sources,
  renderReaderG20Preview,
} from "../src/tooling/mts-reader-g20.js";

const root = resolve("..");
const original = readFileSync(resolve(root, READER_G20_PATH), "utf8");
const sources = readerG20Sources(root);
const draft = loadReaderG20(root);
assert.equal(sources.length, 114);
assert.equal(new Set(sources.map(x => x.id)).size, 114);
assert.equal(draft.nodes.length, 119);
assert.equal(draft.ordered.length, 119);
assert.equal(draft.edges, 286);
assert.equal(draft.originalAtoms, 104);
assert.equal(draft.basisAndFirstUse, 10);
assert.equal(draft.replacementAtoms, 5);
assert.equal(draft.openingSpine.length, 41);
assert.deepEqual(draft.ordered.slice(0, 41).map(x => x.id), draft.openingSpine);
assert.deepEqual(draft.ordered.slice(0, 3).map(x => x.id),
  ["g4:foundation", "editorial:foundation-ontology", "g4:incidence"]);
// R35 is an individually written proposal, not Author-approved science.
// Strictly preserve every reviewed edge verdict against the current G20 DAG.
const reviews = [
  "requirements/mts-source/MTS-READER-EDGE-REVIEW-R35-W1.yaml",
  "requirements/mts-source/MTS-READER-EDGE-REVIEW-R35-W2.yaml",
].map(path => {
  const doc = parseDocument(readFileSync(resolve(root, path), "utf8"),
    { strict: true, uniqueKeys: true });
  assert.equal(doc.errors.length, 0, "invalid review YAML " + path);
  assert.equal(doc.warnings.length, 0, "ambiguous review YAML " + path);
  return doc.toJS({ maxAliasCount: 0 }) as {
    schema: string; status: string; author_approval: string;
    publication: string; review_count: number;
    entries: {source: string; consumer: string; decision: string;
      rationale_ru: string; limitation_ru: string; review_status: string}[];
  };
});
assert.deepEqual(reviews.map(x => x.review_count), [40, 48]);
const edgeReviews = reviews.flatMap(x => {
  assert.equal(x.schema, "mts-reader-edge-review/v0.1");
  assert.equal(x.status, "proposed");
  assert.equal(x.author_approval, "not-recorded");
  assert.equal(x.publication, "blocked");
  assert.equal(x.entries.length, x.review_count);
  return x.entries;
});
assert.equal(edgeReviews.length, 88, "87 old edges + one corrected CTX-03 edge");
assert.equal(new Set(edgeReviews.map(x => x.source + "->" + x.consumer)).size, 88);
assert.deepEqual(["keep", "remove", "replace"].map(v =>
  edgeReviews.filter(x => x.decision === v).length), [66, 21, 1]);
for (const item of edgeReviews) {
  assert.equal(item.review_status, "proposed");
  assert.ok(item.rationale_ru.trim().length > 35, "missing individual scientific reason");
  assert.ok(item.limitation_ru.trim().length > 35, "missing individual falsifier/scope");
  const owner = draft.nodes.find(n => n.id === item.consumer);
  assert.ok(owner, "reviewed consumer missing from G20: " + item.consumer);
  const linked = owner.readerRequires.includes(item.source);
  assert.equal(linked, item.decision === "keep",
    "R35 verdict differs from exact revised first-use edge: " + item.source + " -> " + item.consumer);
}
const originalSourceEdges = sources.reduce((sum, a) => sum + a.sourceRequires.length, 0);
assert.equal(originalSourceEdges, 57, "G4:31 + G7:16 + G8:10 must remain source-authoritative");
for (const source of sources) {
  const node = draft.nodes.find(x => x.id === source.id);
  assert.ok(node, "G20 missing source owner " + source.id);
  for (const req of source.sourceRequires) {
    assert.ok(node.readerRequires.includes(req), "G20 dropped original prerequisite " + source.id + " -> " + req);
  }
}
const requiredFirstUse: readonly [string, string][] = [
  ["g7:link-identity", "concept:anet-term"],
  ["g10:v14-l3", "g7:q-codec"],
  ["g10:v14-l4", "g8:glyph-map"],
  ["g10:v14-l10", "concept:nat-first-use"],
  ["g11:v15-term-01", "concept:anet-term"],
  ["g11:v15-onto-02", "concept:exact-sequence-first-use"],
  ["g11:v15-fals-01", "concept:formal-json-first-use"],
  ["g11:v15-ready-02", "concept:formal-json-first-use"],
  ["g11:v15-reg-01", "concept:formal-json-first-use"],
  ["g11:v15-reg-02", "concept:formal-json-first-use"],
  ["g11:v15-reg-03", "concept:formal-json-first-use"],
];
for (const [nodeId, prior] of requiredFirstUse) {
  assert.ok(draft.nodes.find(x => x.id === nodeId)?.readerRequires.includes(prior),
    "G20 first-use required science prerequisite omitted " + nodeId + " -> " + prior);
}
// Independent R35 review: remove mistaken historical/ontological ordering claims.
for (const [consumer, rejected] of [
  ["g7:anum-carrier", "concept:exact-sequence-first-use"],
  ["g7:objective-orbit-qualified", "g4:context-roles"],
  ["g8:ontology-level", "g4:incidence"],
  ["g10:v14-l11", "concept:gamma-first-use"],
  ["concept:exact-sequence-first-use", "concept:anet-term"],
] as const) {
  assert.ok(!draft.nodes.find(n => n.id === consumer)?.readerRequires.includes(rejected),
    "R35 forbidden spurious scientific dependency " + rejected + " -> " + consumer);
}
assert.ok(draft.nodes.find(n => n.id === "g7:objective-orbit-qualified")?.readerRequires
  .includes("g4:chiral-orbit"), "objective chirality must cite its own context-free proof");
assert.equal(draft.publication, "blocked");
assert.equal(draft.authorApproval, "not-recorded");
assert.equal(draft.completeness, "editorial-dependencies-unverified");
assert.equal(draft.ordered.filter(x => x.sourceOwner === "G16").length, 5);
const index = new Map(draft.ordered.map((x, i) => [x.id, i]));
// Stable didactic opening: the five historical G16 replacement atoms are
// distributed at their first meaningful positions, not left at the end.
for (const [node, position] of [
  ["editorial:foundation-ontology", 2],
  ["editorial:local-self-classification", 6],
  ["editorial:root-basis-witnesses", 18],
  ["editorial:relative-chiral-orientation", 28],
  ["editorial:representation-boundary", 38],
] as const) assert.equal(index.get(node), position - 1, "late G16 first-use " + node);
assert.equal(draft.ordered.slice(0, 41).filter(x => x.sourceOwner === "G11").length, 0);
for (const node of draft.ordered) for (const dependency of node.readerRequires) {
  assert.ok(index.has(dependency), "dangling " + node.id + "->" + dependency);
  assert.ok(index.get(dependency)! < index.get(node.id)!, "out of order " + node.id);
}
for (const symbol of ["R", "O", "C", "L"]) {
  assert.ok(index.get("basis:" + symbol)! < index.get("editorial:root-basis-witnesses")!);
}
assert.ok(index.get("g4:context-roles")! <
          index.get("editorial:relative-chiral-orientation")!);
const preview = renderReaderG20Preview(draft);
assert.ok(preview.includes("ПУБЛИКАЦИЯ ЗАБЛОКИРОВАНА"));
assert.ok(preview.includes("Тексты всех 104 исходных научных атомов"));
assert.ok(!preview.includes("Тексты первых 104 атомов"));
assert.equal((preview.match(/^## /gm) ?? []).length, 119);
for (const source of sources) {
  assert.ok(preview.includes(source.textRu), "lost source-owner scientific text " + source.id);
}
const originalOrphan = "Первичен **" + String.fromCharCode(96) + "Link" +
  String.fromCharCode(96) + "**, а не четыре команды.";
assert.ok(!preview.includes(originalOrphan));
const parse = (text: string) => parseReaderG20(text, sources);
const spineStart = original.indexOf("opening_spine:\n");
const spineEnd = original.indexOf("\nnodes:\n", spineStart);
assert.ok(spineStart >= 0 && spineEnd > spineStart);
const authoredSpine = original.slice(spineStart, spineEnd);
const editSpine = (modified: string): string => {
  assert.notEqual(modified, authoredSpine, "no-op spine falsifier");
  return original.slice(0, spineStart) + modified + original.slice(spineEnd);
};
assert.throws(() => parse(editSpine(authoredSpine.replace(
  '  - "basis:C"', '  - "basis:O"'))), /invalid\/duplicate\/unknown 41-step opening spine/);
assert.throws(() => parse(editSpine(authoredSpine.replace(
  '  - "basis:C"', '  - "basis:absent"'))), /invalid\/duplicate\/unknown 41-step opening spine/);
assert.throws(() => parse(editSpine(authoredSpine.replace(
  '  - "editorial:relative-chiral-orientation"\n', ""))),
  /invalid\/duplicate\/unknown 41-step opening spine/);
assert.throws(() => parse(editSpine(authoredSpine.replace(
  '  - "g4:incidence"\n  - "g4:local-decision"',
  '  - "g4:local-decision"\n  - "g4:incidence"'))),
  /opening spine dependency not previously introduced/);
assert.throws(() => parse(original.replace("publication: blocked", "publication: ready")),
  /cannot upgrade G20/);
assert.throws(() => parse(original.replace("completeness: editorial-dependencies-unverified",
  "completeness: verified")), /cannot upgrade G20/);
assert.throws(() => parse(original.replace("status: proposed\n",
  "status: proposed\nstatus: proposed\n")), /invalid strict YAML/);
assert.throws(() => parse(original.replace('id: "g4:foundation"',
  'id: "g4:forged"')), /forged\/missing original source/);
assert.throws(() => parse(original.replace('source_owner: G4\n    source_atom: "foundation"',
  'source_owner: G15\n    source_atom: "foundation"')), /forged\/missing original source/);
const dangling = original.replace(
  /id: "g7:link-identity"([\s\S]*?)reader_requires: \[([^\n]*)\]/,
  (all, middle: string, deps: string) => {
    assert.ok(deps.includes('"concept:anet-term"'));
    return 'id: "g7:link-identity"' + middle +
      'reader_requires: [' + deps.replace('"concept:anet-term"', '"g7:not-existent"') + ']';
  });
assert.notEqual(dangling, original);
assert.throws(() => parse(dangling), /dangling first-use reference/);
assert.throws(() => parse(original.replace('id: "g4:incidence"',
  'id: "g4:foundation"')), /invalid\/duplicate node/);
const rootBlock =
  'id: "g4:foundation"\n    source_owner: G4\n    source_atom: "foundation"\n' +
  '    accepted_id: V14-L1\n    reader_requires: []';
assert.ok(original.includes(rootBlock), "G20 root test marker drift");
assert.throws(() => parse(original.replace(rootBlock,
  rootBlock.replace('reader_requires: []',
    'reader_requires: ["editorial:relative-chiral-orientation"]'))),
  /cyclic reader first-use graph/);
const witnessBlock = 'id: "editorial:root-basis-witnesses"';
assert.ok(original.includes(witnessBlock));
const changed = original.replace(
  /id: "editorial:root-basis-witnesses"([\s\S]*?)reader_requires: \[([^\n]*)\]/,
  (whole, before: string, dependencies: string) => {
    assert.ok(dependencies.includes('"basis:R"'));
    return 'id: "editorial:root-basis-witnesses"' + before +
      'reader_requires: [' + dependencies.replace('"basis:R", ', "") + ']';
  });
assert.notEqual(changed, original);
assert.throws(() => parse(changed), /missing explicit first-use prerequisite/);
const sourceDrift = original.replace(
  /id: "g4:local-decision"([\s\S]*?)reader_requires: \[([^\n]*)\]/,
  (whole, mid: string, deps: string) => {
    assert.ok(deps.includes('"g4:incidence"'));
    return 'id: "g4:local-decision"' + mid +
      'reader_requires: [' + deps.replace(', "g4:incidence"', "") + ']';
  });
assert.notEqual(sourceDrift, original);
assert.throws(() => parse(sourceDrift), /source-owner reader dependency omitted/);
console.log("G20: 119 nodes, 286 editorial edges, 41-node opening, 57 original edges, 88 proposed R35 reviews with 22 corrected decisions, no publication, falsifiers GREEN.");
