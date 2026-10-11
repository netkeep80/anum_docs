import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseDocument } from "yaml";
import {
  loadReaderG7, loadReaderG8, loadReaderV14G10, loadReaderV15G11,
  loadReaderBootstrapNames, loadReaderEarlyConcepts, loadReaderFoundationOpening,
} from "./mts-reader-coverage.js";
import { loadMtsSourceRequirement } from "./mts-source-requirement.js";

/**
 * G20 is an editorial graph of first-use requirements, NOT the accepted
 * theorem/requirements DAG and NOT a formal proof-premise authority.
 * All original Russian scientific paragraphs are resolved from their source.
 */
export const READER_G20_PATH = "requirements/mts-source/MTS-READER-FIRST-USE-G20.yaml";
type SourceOwner = "G4" | "G7" | "G8" | "G10" | "G11" | "G15" | "G19" | "G16";
export interface ReaderG20Source {
  readonly id: string;
  readonly owner: Exclude<SourceOwner, "G16">;
  readonly atom: string;
  readonly acceptedId: string;
  readonly textRu: string;
  /** Existing source-owner reader dependencies, not the external proof premises. */
  readonly sourceRequires: readonly string[];
}
export interface ReaderG20Node {
  readonly id: string;
  readonly sourceOwner: SourceOwner;
  readonly sourceAtom: string;
  readonly acceptedId: string;
  readonly readerRequires: readonly string[];
  readonly textRu: string;
  readonly review: "pending";
}
export interface ReaderG20Draft {
  readonly schema: "mts-reader-first-use/v0.1";
  readonly completeness: "editorial-dependencies-unverified";
  readonly authorApproval: "not-recorded";
  readonly publication: "blocked";
  readonly originalAtoms: 104;
  readonly basisAndFirstUse: 10;
  readonly replacementAtoms: 5;
  /** Proposed didactic spine; not an additional Link-law or proof dependency. */
  readonly openingSpine: readonly string[];
  readonly edges: number;
  readonly nodes: readonly ReaderG20Node[];
  readonly ordered: readonly ReaderG20Node[];
}
function fail(message: string): never { throw new Error("mts-reader-g20: " + message); }
function record(value: unknown, where: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(where + " must be object");
  }
  return value as Record<string, unknown>;
}
function fields(value: Record<string, unknown>, expected: readonly string[], where: string): void {
  if (Object.keys(value).sort().join(",") !== [...expected].sort().join(",")) {
    fail(where + " unknown/missing fields");
  }
}
function source(id: string, owner: ReaderG20Source["owner"], atom: string,
                acceptedId: string, textRu: string,
                sourceRequires: readonly string[] = []): ReaderG20Source {
  if (!textRu.trim()) fail("empty original source text " + id);
  return Object.freeze({ id, owner, atom, acceptedId, textRu,
    sourceRequires: Object.freeze([...sourceRequires]) });
}
/** Retrieve each text from its original strict, provenance-checked reader model. */
export function readerG20Sources(root: string): readonly ReaderG20Source[] {
  const g4 = loadMtsSourceRequirement(root, "requirements/mts-source/MTS-FND-V14-L1.yaml");
  if (g4.readerScience?.publication !== "blocked") fail("G4 source unavailable");
  const g7 = loadReaderG7(root), g8 = loadReaderG8(root);
  const g10 = loadReaderV14G10(root), g11 = loadReaderV15G11(root);
  const g15 = loadReaderBootstrapNames(root), g19 = loadReaderEarlyConcepts(root);
  // Historical G16 remains available for provenance but its monolithic
  // candidate is not copied to the corrected first-use preview.
  const g16 = loadReaderFoundationOpening(root);
  if (g16.publication !== "blocked" || g16.authorApproval !== "not-recorded") {
    fail("G16 historical source was promoted");
  }
  const all: ReaderG20Source[] = [
    ...g4.readerScience.steps.map(a => source("g4:" + a.id, "G4", a.id, "V14-L1", a.ru,
      a.requires.map(id => "g4:" + id))),
    ...g7.atoms.map(a => source("g7:" + a.id, "G7", a.id, a.acceptedId, a.ru,
      a.requires.map(id => "g7:" + id))),
    ...g8.atoms.map(a => source("g8:" + a.id, "G8", a.id, a.acceptedId, a.ru,
      a.requires.map(id => "g8:" + id))),
    ...g10.atoms.map(a => source("g10:" + a.id, "G10", a.id, a.acceptedId, a.ru)),
    ...g11.atoms.map(a => source("g11:" + a.id, "G11", a.id, a.acceptedId, a.ru)),
    ...g15.symbols.map(a => source("basis:" + a.symbol, "G15", a.symbol,
      "V14-L1", a.exactEquation + ". " + a.explanationRu)),
    ...g19.definitions.map(a => source("concept:" + a.id, "G19", a.id,
      a.acceptedId, a.introductoryRu)),
  ];
  if (all.length !== 114 || new Set(all.map(a => a.id)).size !== 114) {
    fail("source-owner inventory must be exactly 104 + 10");
  }
  return Object.freeze(all);
}
const EDITORIAL = Object.freeze([
  "foundation-ontology", "local-self-classification", "root-basis-witnesses",
  "relative-chiral-orientation", "representation-boundary",
]);
export function parseReaderG20(text: string, sources: readonly ReaderG20Source[]): ReaderG20Draft {
  const doc = parseDocument(text, { strict: true, uniqueKeys: true });
  if (doc.errors.length || doc.warnings.length) fail("invalid strict YAML");
  const raw = record(doc.toJS({ maxAliasCount: 0 }), "G20");
  fields(raw, ["schema", "status", "semantic_change", "author_approval",
    "publication", "completeness", "source_atoms", "first_use_definitions",
    "editorial_replacement_atoms", "opening_spine", "nodes"], "G20");
  if (raw.schema !== "mts-reader-first-use/v0.1" || raw.status !== "proposed" ||
      raw.semantic_change !== false || raw.author_approval !== "not-recorded" ||
      raw.publication !== "blocked" ||
      raw.completeness !== "editorial-dependencies-unverified" ||
      raw.source_atoms !== 104 || raw.first_use_definitions !== 10 ||
      raw.editorial_replacement_atoms !== 5) {
    fail("cannot upgrade G20 to accepted proof, review or publication");
  }
  if (!Array.isArray(raw.nodes) || raw.nodes.length !== 119 ||
      sources.length !== 114) fail("G20 missing 104 + 10 + 5 nodes");
  const expected = new Map(sources.map(s => [s.id, s]));
  if (expected.size !== 114) fail("duplicate original source ID");
  const ids = new Set<string>();
  const nodes = raw.nodes.map((value, i): ReaderG20Node => {
    const n = record(value, "node[" + i + "]");
    const editor = n.source_owner === "G16";
    fields(n, ["id", "source_owner", "source_atom", "accepted_id",
      "reader_requires", "review", ...(editor ? ["text_ru"] : [])], "node[" + i + "]");
    const id = n.id, atom = n.source_atom;
    if (typeof id !== "string" || typeof atom !== "string" ||
        typeof n.accepted_id !== "string" || ids.has(id) ||
        n.review !== "pending") fail("invalid/duplicate node identity or review");
    ids.add(id);
    const original = expected.get(id);
    let ru: string, owner: SourceOwner;
    if (editor) {
      if (!id.startsWith("editorial:") ||
          atom !== id.slice("editorial:".length) || !EDITORIAL.includes(atom) ||
          n.accepted_id !== "V14-L1" ||
          typeof n.text_ru !== "string" || n.text_ru.trim().length < 190) {
        fail("G16 unknown editorial atom or absent original Russian prose");
      }
      ru = n.text_ru; owner = "G16";
    } else {
      if (!original || n.source_owner !== original.owner ||
          atom !== original.atom || n.accepted_id !== original.acceptedId) {
        fail("G20 forged/missing original source owner or accepted law");
      }
      ru = original.textRu; owner = original.owner;
    }
    if (!Array.isArray(n.reader_requires) ||
        new Set(n.reader_requires).size !== n.reader_requires.length ||
        n.reader_requires.some(x => typeof x !== "string" || x === id)) {
      fail("duplicate/invalid reader dependency of " + id);
    }
    return Object.freeze({
      id, sourceOwner: owner, sourceAtom: atom, acceptedId: n.accepted_id,
      readerRequires: Object.freeze([...n.reader_requires]) as readonly string[],
      textRu: ru, review: "pending" as const,
    });
  });
  if (nodes.filter(x => x.sourceOwner === "G16").length !== 5 ||
      EDITORIAL.some(id => !ids.has("editorial:" + id)) ||
      [...expected.keys()].some(id => !ids.has(id))) {
    fail("G20 source coverage or atomic G16 replacement incomplete");
  }
  // Source-owned G4/G7/G8 DAG edges must survive every later editorial merge.
  // Their source is immutable for this G20 proposal; no inferred chapter edge
  // or independently authored G20 list can silently erase an earlier premise.
  const byId = new Map(nodes.map(node => [node.id, node]));
  for (const original of sources) {
    const expanded = byId.get(original.id);
    if (!expanded || original.sourceRequires.some(id => !expanded.readerRequires.includes(id))) {
      fail("source-owner reader dependency omitted: " + original.id);
    }
  }
  const index = new Map(nodes.map((node, i) => [node.id, i]));
  const indegree = nodes.map(x => x.readerRequires.length);
  const outgoing: number[][] = nodes.map(() => []);
  let edges = 0;
  for (const [i, node] of nodes.entries()) for (const dep of node.readerRequires) {
    const prev = index.get(dep);
    if (prev === undefined) fail("dangling first-use reference " + node.id + " -> " + dep);
    outgoing[prev]!.push(i); edges++;
  }
  // Deterministic Kahn order; ties preserve authored node order.
  const queue = nodes.map((_, i) => i).filter(i => indegree[i] === 0);
  const ordered: ReaderG20Node[] = [];
  for (let pos = 0; pos < queue.length; pos++) {
    const i = queue[pos]!;
    ordered.push(nodes[i]!);
    for (const child of outgoing[i]!) {
      indegree[child]!--;
      if (indegree[child] === 0) queue.push(child);
    }
  }
  if (ordered.length !== 119) fail("cyclic reader first-use graph");
  // Reader spine is an explicit *presentation* choice. It is checked for
  // exact prerequisites but contributes ZERO edges to the scientific graph.
  if (!Array.isArray(raw.opening_spine) || raw.opening_spine.length !== 42 ||
      new Set(raw.opening_spine).size !== 42 ||
      raw.opening_spine.some(id => typeof id !== "string" || !index.has(id))) {
    fail("invalid/duplicate/unknown 42-step opening spine");
  }
  const openingSpine = raw.opening_spine as string[];
  const requiredOpening = [
    "editorial:foundation-ontology", "editorial:local-self-classification",
    "editorial:root-basis-witnesses", "editorial:relative-chiral-orientation",
    "g4:identity-by-poles",
    "editorial:representation-boundary",
    ..."ROCLU".split("").map(name => "basis:" + name),
    ...["anet-term", "nat-first-use", "exact-sequence-first-use",
      "formal-json-first-use", "gamma-first-use"].map(name => "concept:" + name),
  ];
  if (openingSpine[0] !== "g4:foundation" ||
      requiredOpening.some(id => !openingSpine.includes(id))) {
    fail("opening spine is missing one of the 15 basic scientific introductions");
  }
  const introduced = new Set<string>();
  for (const anchor of openingSpine) {
    const node = nodes[index.get(anchor)!]!;
    if (node.readerRequires.some(dependency => !introduced.has(dependency))) {
      fail("opening spine dependency not previously introduced: " + anchor);
    }
    introduced.add(anchor);
  }
  // The base topological sort remains authoritative about allowed edges;
  // the 42 explicitly authored anchors are emitted first, then the remaining
  // topological order is stable. Neither text nor edge ownership changes.
  const presentation = [
    ...openingSpine.map(id => nodes[index.get(id)!]!),
    ...ordered.filter(node => !introduced.has(node.id)),
  ];
  if (presentation.length !== 119 || new Set(presentation.map(x => x.id)).size !== 119) {
    fail("opening spine dropped/duplicated original source atom");
  }
  const order = new Map(presentation.map((node, i) => [node.id, i]));
  const precedes = (node: string, dependency: string) => {
    const n = index.get(node), d = index.get(dependency);
    if (n === undefined || d === undefined) fail("missing required introduction " + node + "/" + dependency);
    if (!nodes[n]!.readerRequires.includes(dependency) ||
        order.get(dependency)! >= order.get(node)!) {
      fail("missing explicit first-use prerequisite " + node + " -> " + dependency);
    }
  };
  for (const symbol of ["R", "O", "C", "L"]) {
    precedes("editorial:root-basis-witnesses", "basis:" + symbol);
  }
  precedes("editorial:foundation-ontology", "g4:foundation");
  precedes("editorial:local-self-classification", "g4:incidence");
  precedes("editorial:relative-chiral-orientation", "g4:context-roles");
  precedes("editorial:representation-boundary", "g8:recursive-level");
  return Object.freeze({
    schema: "mts-reader-first-use/v0.1" as const,
    completeness: "editorial-dependencies-unverified" as const,
    authorApproval: "not-recorded" as const, publication: "blocked" as const,
    originalAtoms: 104 as const, basisAndFirstUse: 10 as const,
    replacementAtoms: 5 as const, openingSpine: Object.freeze([...openingSpine]), edges,
    nodes: Object.freeze(nodes), ordered: Object.freeze(presentation),
  });
}
export function loadReaderG20(root: string): ReaderG20Draft {
  return parseReaderG20(readFileSync(resolve(root, READER_G20_PATH), "utf8"),
    readerG20Sources(root));
}
export function renderReaderG20Preview(draft: ReaderG20Draft): string {
  if (draft.publication !== "blocked" || draft.authorApproval !== "not-recorded" ||
      draft.ordered.length !== 119) fail("G20 preview cannot publish unapproved material");
  return [
    "# МТС: упорядоченный научный черновик G20",
    "",
    "**ПРЕДЛОЖЕНИЕ. ПУБЛИКАЦИЯ ЗАБЛОКИРОВАНА. АВТОР НЕ УТВЕРЖДАЛ.**",
    "",
    "Порядок основан на заявленных редакционных предпосылках; их научная полнота не подтверждена.",
    "Тексты всех 104 исходных научных атомов получены из принадлежащих им моделей без повторного редактирования.",
    "",
    ...draft.ordered.flatMap(node => [
      "## " + node.id, "",
      "Источники: " + node.sourceOwner + "/" + node.sourceAtom +
      "; accepted ID: " + node.acceptedId + ".",
      "Редакционные зависимости: " +
      (node.readerRequires.length ? node.readerRequires.join(", ") : "отсутствуют") + ".",
      "",
      node.textRu, "",
      "*Рецензирование ожидается; содержательные выводы ограничены указанным источником.*", "",
    ]),
  ].join("\n");
}
