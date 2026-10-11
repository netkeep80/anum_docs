import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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
assert.equal(draft.edges, 307);
assert.equal(draft.originalAtoms, 104);
assert.equal(draft.basisAndFirstUse, 10);
assert.equal(draft.replacementAtoms, 5);
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
assert.equal(draft.publication, "blocked");
assert.equal(draft.authorApproval, "not-recorded");
assert.equal(draft.completeness, "editorial-dependencies-unverified");
assert.equal(draft.ordered.filter(x => x.sourceOwner === "G16").length, 5);
const index = new Map(draft.ordered.map((x, i) => [x.id, i]));
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
assert.equal((preview.match(/^## /gm) ?? []).length, 119);
for (const source of sources) {
  assert.ok(preview.includes(source.textRu), "lost source-owner scientific text " + source.id);
}
const originalOrphan = "Первичен **" + String.fromCharCode(96) + "Link" +
  String.fromCharCode(96) + "**, а не четыре команды.";
assert.ok(!preview.includes(originalOrphan));
const parse = (text: string) => parseReaderG20(text, sources);
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
assert.throws(() => parse(original.replace('reader_requires: ["g4:foundation"]',
  'reader_requires: ["g4:not-existent"]')), /dangling first-use reference/);
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
console.log("G20: 119 source-backed reader nodes, 307 edges, original 57 edges preserved, no publication, negative falsifiers GREEN.");
