import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseDocument } from "yaml";
import { loadReaderBootstrapNames } from "../src/tooling/mts-reader-coverage.js";
import {
  READER_G20_PATH, READER_G41_PATH,
  loadReaderG20, parseReaderG20, readerG20Sources,
  loadReaderG41, parseReaderG41, renderReaderG41Preview, renderReaderG20Preview,
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
// R40 is an AI editorial review, not proof or author-approved publication.
// The three independent source-owned review waves cover the entire actual G20 order.
const r40Paths = ["W1", "W2", "W3"].map(w =>
  "requirements/mts-source/MTS-READER-PROSE-AUDIT-R40-" + w + ".yaml");
const r40Waves = r40Paths.map(path => {
  const doc = parseDocument(readFileSync(resolve(root, path), "utf8"),
    { strict: true, uniqueKeys: true });
  assert.equal(doc.errors.length, 0, "R40 malformed YAML " + path);
  assert.equal(doc.warnings.length, 0, "R40 ambiguous YAML " + path);
  return doc.toJS({ maxAliasCount: 0 }) as {
    schema: string; status: string; author_approval: string;
    publication: string; coverage: string; review_count: number;
    entries: {position: number; node: string; disposition: string;
      scope_note_ru: string; publication_effect: string; review: string}[];
    findings: {id: string; severity: string; first_use_consumer: string;
      definition_node: string; state: string; remedy_ru: string}[];
  };
});
assert.deepEqual(r40Waves.map(w => w.review_count), [42, 29, 48]);
assert.deepEqual(r40Waves.map(w => w.coverage),
  ["opening-only", "v014-followup-only", "v015-current-only"]);
for (const wave of r40Waves) {
  assert.equal(wave.schema, "mts-reader-prose-audit/v0.1");
  assert.equal(wave.status, "proposed");
  assert.equal(wave.author_approval, "not-recorded");
  assert.equal(wave.publication, "blocked");
  assert.equal(wave.entries.length, wave.review_count);
}
const r40Entries = r40Waves.flatMap(w => w.entries);
assert.equal(r40Entries.length, 119);
assert.deepEqual(r40Entries.map(a => a.node), draft.ordered.map(a => a.id));
assert.deepEqual(r40Entries.map(a => a.position),
  Array.from({length: 119}, (_, i) => i + 1));
assert.equal(new Set(r40Entries.map(a => a.node)).size, 119);
for (const entry of r40Entries) {
  assert.ok(entry.scope_note_ru.length > 65,
    "R40 missing individual Russian scope " + entry.node);
  assert.equal(entry.review, "individual-proposed");
  assert.equal(entry.publication_effect, "blocked");
}
const r40Findings = r40Waves.flatMap(w => w.findings);
assert.equal(r40Findings.length, 15);
assert.equal(new Set(r40Findings.map(x => x.id)).size, 15);
for (const item of r40Findings) {
  assert.ok(item.remedy_ru.length > 75, "R40 missing concrete correction " + item.id);
  assert.ok(item.severity === "high" || item.severity === "medium");
  assert.ok(item.state === "proposed" || item.state === "corrected-in-draft");
}
assert.equal(r40Findings.find(x => x.id === "R40-05")?.state, "corrected-in-draft");
assert.equal(r40Findings.filter(x => x.state === "corrected-in-draft").length, 1);
assert.equal(index.get("g4:identity-by-poles"), 19,
  "FND-13 after conditional normalization, before inversion, at position 20");
assert.ok(index.get("basis:L")! < index.get("concept:nat-first-use")!);
assert.ok(index.get("basis:U")! < index.get("concept:exact-sequence-first-use")!);
assert.ok(index.get("g7:recursive-codec")! < index.get("g7:q-codec")!);
assert.ok(index.get("editorial:representation-boundary")! < index.get("g7:q-codec")!);
assert.ok(r40Findings.find(x => x.id === "R40-15")?.remedy_ru.includes(
  "только при предъявленном свидетельстве"),
  "Do not invent mathematical counterexamples to positional fold injectivity");
console.log("R40: all 119 source-owned scientific prose atoms individually scoped; 15 precise findings, one reordering fix, author approval and publication BLOCKED.");

// G41 is a blocked presentation view of exact existing source-owned paragraphs.
// No change to G7/G15, 119 node identities, 151 graph edges, or accepted proofs.
const g41 = loadReaderG41(root);
assert.equal(g41.schema, "mts-reader-first-use-presentation/v0.1");
assert.equal(g41.publication, "blocked");
assert.equal(g41.authorApproval, "not-recorded");
assert.deepEqual(g41.deferred.map(item => item.symbol), ["L", "U"]);
const g41Text = renderReaderG41Preview(root);
assert.equal((g41Text.match(/^## /gm) ?? []).length, 119);
assert.ok(g41Text.includes("ПУБЛИКАЦИЯ ЗАБЛОКИРОВАНА"));
const firstL = g41Text.indexOf("## basis:L\n");
const firstU = g41Text.indexOf("## basis:U\n");
const introducedNat = g41Text.indexOf("## concept:nat-first-use\n");
const definedDegree = g41Text.indexOf("## g7:degree-one\n");
const introducedQ = g41Text.indexOf("### Первое определение Q");
const qComparison = g41Text.indexOf("## g7:recursive-codec\n");
const fullQ = g41Text.indexOf("## g7:q-codec\n");
assert.ok(firstL >= 0 && firstU > firstL && introducedNat > firstU);
assert.ok(definedDegree > introducedNat);
assert.ok(introducedQ > 0 && introducedQ < qComparison && qComparison < fullQ);
const inlineL = g41Text.slice(firstL, firstU);
const inlineU = g41Text.slice(firstU, g41Text.indexOf("## g4:grounded\n"));
assert.ok(inlineL.includes("L = O ⟼ C") && !inlineL.includes("Degree"));
assert.ok(inlineU.includes("U = C ⟼ O") && !inlineU.includes("ExactSequence"));
for (const basis of g41.deferred) {
  const first = g41Text.indexOf("## " + basis.firstUseNode + "\n");
  const late = g41Text.indexOf("## " + basis.afterNode + "\n");
  const explanation = g41Text.indexOf(basis.sourceExplanationRu);
  assert.ok(first >= 0 && late > first && explanation > late,
    "G41 commentary used before its required technical introduction: " + basis.symbol);
  assert.equal(g41Text.split(basis.sourceExplanationRu).length - 1, 1,
    "G41 may not duplicate or omit original source commentary");
}
assert.equal(g41Text.split(g41.earlyQ.exactSourceOpeningRu).length - 1, 2,
  "Q's source-owned exact opening must appear once before and once inside its full G7 paragraph");
const g41Original = readFileSync(resolve(root, READER_G41_PATH), "utf8");
const parseG41 = (text: string) => parseReaderG41(
  text, draft, loadReaderBootstrapNames(root), sources);
assert.throws(() => parseG41(g41Original.replace("publication: blocked",
  "publication: ready")), /G41 cannot promote/);
assert.throws(() => parseG41(g41Original.replace(
  "Q — версионируемый кодек и интерпретатор последовательностей.",
  "Q — произвольный двоичный оператор.")),
  /G41 Q early first-use proposal drift|G41 Q first-use quote not exact prefix/);
assert.throws(() => parseG41(g41Original.replace(
  'emit_explanation_after: "g7:degree-one"',
  'emit_explanation_after: "basis:L"')),
  /G41 basis L\/U first-use\/release anchor drift/);
console.log("G41: source-owned Q first-use and deferred G15 L/U comments render once, no accepted source edit or publication.");

console.log("G20: 119 nodes, 151 reader edges, 57 inherited source edges, 94 individually reviewed authored edges, 42-node academic spine, 251 individual review decisions incl 135 R39 redundant review entries, no publication, negative falsifiers GREEN.");
