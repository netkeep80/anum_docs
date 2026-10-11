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
assert.equal(draft.edges, 151);
assert.equal(draft.originalAtoms, 104);
assert.equal(draft.basisAndFirstUse, 10);
assert.equal(draft.replacementAtoms, 5);
assert.equal(draft.openingSpine.length, 42);
assert.deepEqual(draft.ordered.slice(0, 42).map(x => x.id), draft.openingSpine);
assert.deepEqual(draft.ordered.slice(0, 3).map(x => x.id),
  ["g4:foundation", "editorial:foundation-ontology", "g4:incidence"]);
// R35 is an individually written proposal, not Author-approved science.
// Strictly preserve every reviewed edge verdict against the current G20 DAG.
const reviews = [
  "requirements/mts-source/MTS-READER-EDGE-REVIEW-R35-W1.yaml",
  "requirements/mts-source/MTS-READER-EDGE-REVIEW-R35-W2.yaml",
  "requirements/mts-source/MTS-READER-EDGE-REVIEW-R36-W3.yaml",
  "requirements/mts-source/MTS-READER-EDGE-REVIEW-R36-W4.yaml",
  "requirements/mts-source/MTS-READER-EDGE-REVIEW-R36-W5.yaml",
  "requirements/mts-source/MTS-READER-EDGE-REVIEW-R39-W1.yaml",
  "requirements/mts-source/MTS-READER-EDGE-REVIEW-R39-W2.yaml",
  "requirements/mts-source/MTS-READER-EDGE-REVIEW-R39-W3.yaml",
  "requirements/mts-source/MTS-READER-EDGE-REVIEW-R39-W4.yaml",
].map(path => {
  const doc = parseDocument(readFileSync(resolve(root, path), "utf8"),
    { strict: true, uniqueKeys: true });
  assert.equal(doc.errors.length, 0, "invalid review YAML " + path);
  assert.equal(doc.warnings.length, 0, "ambiguous review YAML " + path);
  return doc.toJS({ maxAliasCount: 0 }) as {
    schema: string; status: string; author_approval: string;
    publication: string; review_count: number;
    entries: {source: string; consumer: string; decision: string;
      rationale_ru: string; limitation_ru: string; review_status: string; indirect_via?: string}[];
  };
});
assert.deepEqual(reviews.map(x => x.review_count), [40, 48, 24, 3, 1, 34, 50, 21, 30]);
const edgeReviews = reviews.flatMap(x => {
  assert.equal(x.schema, "mts-reader-edge-review/v0.1");
  assert.equal(x.status, "proposed");
  assert.equal(x.author_approval, "not-recorded");
  assert.equal(x.publication, "blocked");
  assert.equal(x.entries.length, x.review_count);
  return x.entries;
});
assert.equal(edgeReviews.length, 251, "116 original review entries + 135 individually reviewed redundant edges");
assert.equal(new Set(edgeReviews.map(x => x.source + "->" + x.consumer)).size, 251);
assert.deepEqual(["keep", "remove", "replace"].map(v =>
  edgeReviews.filter(x => x.decision === v).length), [94, 156, 1]);
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
// Every directly retained added edge has one individually scoped KEEP review.
// Inherited source-owner dependencies are independently protected and exempt.
const originalSet = new Set(sources.flatMap(a =>
  a.sourceRequires.map(from => from + "->" + a.id)));
const keptReviewSet = new Set(edgeReviews.filter(x => x.decision === "keep")
  .map(x => x.source + "->" + x.consumer));
const allDirect = draft.nodes.flatMap(n => n.readerRequires.map(from => from + "->" + n.id));
const authoredDirect = allDirect.filter(key => !originalSet.has(key));
assert.equal(originalSet.size, 57);
assert.equal(authoredDirect.length, 94);
assert.deepEqual(new Set(authoredDirect), keptReviewSet,
  "every retained authored reader edge needs its own R35/R36/R39 individual scientific review");
const originalDag = new Map(draft.nodes.map(n => [n.id, n.readerRequires]));
function reachesReader(from: string, target: string): boolean {
  const pending = [from], visited = new Set<string>();
  while (pending.length) {
    const next = pending.pop()!;
    if (next === target) return true;
    if (visited.has(next)) continue;
    visited.add(next);
    pending.push(...(originalDag.get(next) ?? []));
  }
  return false;
}
const r39Entries = reviews.slice(5).flatMap(x => x.entries);
assert.equal(r39Entries.length, 135);
assert.equal(r39Entries.filter(x => x.decision === "remove").length, 117);
assert.equal(r39Entries.filter(x => x.decision === "keep").length, 18);
for (const item of r39Entries) {
  assert.ok(typeof item.indirect_via === "string" && item.indirect_via !== item.source);
  const consumer = originalDag.get(item.consumer) ?? [];
  assert.ok(consumer.includes(item.indirect_via!),
    "R39 alternative direct prerequisite disappeared: " + item.consumer);
  assert.ok(reachesReader(item.indirect_via!, item.source),
    "R39 alternative path no longer reaches original prerequisite: " + item.consumer);
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
  ["editorial:relative-chiral-orientation", 29],
  ["editorial:representation-boundary", 39],
] as const) assert.equal(index.get(node), position - 1, "late G16 first-use " + node);
assert.equal(draft.ordered.slice(0, 42).filter(x => x.sourceOwner === "G11").length, 0);
assert.equal(index.get("g4:identity-by-poles"), index.get("g4:grounded-normalization")! + 1,
  "FND-13 should be introduced immediately after conditional Grounded normalization");
assert.ok(index.get("g4:identity-by-poles")! < index.get("g4:inversion-domain")!,
  "FND-13 explanation must precede the inversion section");
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
  '  - "basis:C"', '  - "basis:O"'))), /invalid\/duplicate\/unknown 42-step opening spine/);
assert.throws(() => parse(editSpine(authoredSpine.replace(
  '  - "basis:C"', '  - "basis:absent"'))), /invalid\/duplicate\/unknown 42-step opening spine/);
assert.throws(() => parse(editSpine(authoredSpine.replace(
  '  - "editorial:relative-chiral-orientation"\n', ""))),
  /invalid\/duplicate\/unknown 42-step opening spine/);
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
      'reader_requires: [' + deps.replace('"g4:incidence"', "") + ']';
  });
assert.notEqual(sourceDrift, original);
assert.throws(() => parse(sourceDrift), /source-owner reader dependency omitted/);
console.log("G20: 119 nodes, 151 reader edges, 57 inherited source edges, 94 individually reviewed authored edges, 42-node academic spine, 251 individual review decisions incl 135 R39 redundant review entries, no publication, negative falsifiers GREEN.");
