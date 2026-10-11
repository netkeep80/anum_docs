import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadMtsSemanticIr } from "../src/tooling/mts-compiler.js";
import { loadMtsSourceRequirement } from "../src/tooling/mts-source-requirement.js";
import { loadReaderCoverage, loadReaderRoutes, parseReaderRoutes, projectReaderCoverage, renderReaderCoverageAudit,
  loadReaderIntro, parseReaderIntro, loadReaderG7, parseReaderG7, loadReaderG8, parseReaderG8 }
  from "../src/tooling/mts-reader-coverage.js";

const root = resolve("..");
const v14 = loadMtsSemanticIr(root, "requirements/mts-v0.14.json").requirements;
const v15 = loadMtsSemanticIr(root).requirements;
const routes = loadReaderRoutes(root);
const plan = loadReaderCoverage(root);
assert.equal(plan.schema, "mts-reader-coverage-plan/v0.1");
assert.equal(plan.status, "proposed");
assert.equal(plan.semanticChange, false);
assert.equal(plan.authority, "accepted-registries-only");
assert.equal(plan.rows.length, 62);
assert.equal(new Set(plan.rows.map(row => row.id)).size, 62);
assert.equal(plan.rows.filter(row => row.release === "v0.14").length, 14);
assert.equal(plan.rows.filter(row => row.release === "v0.15").length, 48);
assert.ok(plan.rows.every(row => row.authorApproval === "not-recorded" && row.publication === "blocked"));
assert.ok(plan.rows.every(row => row.readerDependsOn === "scientific-review-pending"));
assert.ok(plan.rows.every(row => row.acceptedAuthority.pointer === "/requiredSemanticLaws/" + row.id));
assert.ok(plan.rows.every(row => row.currentDocOwner.path.length > 0 && row.currentDocOwner.anchor.length > 0));
const source = new Map([...v14, ...v15].map(item => [item.id, item]));
for (const row of plan.rows) {
  const accepted = source.get(row.id);
  assert.ok(accepted, "projected IDs must match accepted source");
  assert.deepEqual(row.normativeDependsOn, accepted.dependsOn);
  assert.equal(row.acceptedAuthority.path, accepted.authorityDocument);
  assert.deepEqual(row.currentDocOwner, {path: accepted.docPath, anchor: accepted.docAnchor});
}
assert.deepEqual(plan.rows.filter(x => x.russianAtomicReview !== "not-started").map(x => x.id), ["V14-L1"]);
assert.equal(plan.rows.filter(x => x.release === "v0.15" &&
  x.currentDocOwner.path === "docs/specs/Формальная нотация МТС.md").length, 48);
assert.equal(plan.rows.find(x => x.id === "V14-L12")?.proposedSection, "inversion-and-context");
assert.equal(plan.rows.find(x => x.id === "V15-GAMMA-01")?.proposedSection, "execution");
assert.equal(plan.rows.find(x => x.id === "V15-GOV-01")?.proposedSection, "governance");
assert.equal(plan.rows.find(x => x.id === "V15-DOCS-01")?.proposedSection, "documentation");
assert.throws(() => projectReaderCoverage(v14.slice(1), v15, routes), /exact 14 \+ 48/);
assert.throws(() => projectReaderCoverage(v14, v15.slice(1), routes), /exact 14 \+ 48/);
assert.throws(() => projectReaderCoverage([...v14.slice(1), v14[1]!], v15, routes), /duplicate or non-accepted ID/);
assert.throws(() => projectReaderCoverage(v14, [
  { ...v15[0]!, classificationPath: "v015/unknown" }, ...v15.slice(1),
], routes), /scientific chapter routing has no owner/);
assert.throws(() => projectReaderCoverage(v14, [
  { ...v15[0]!, dependsOn: ["nonexistent"] }, ...v15.slice(1),
], routes), /unresolved normative dependency/);
assert.throws(() => projectReaderCoverage(v14, [
  { ...v15[0]!, authorityPointer: "/requiredSemanticLaws/FORGED" }, ...v15.slice(1),
], routes), /missing accepted authority/);
assert.throws(() => projectReaderCoverage(v14, [
  { ...v15[0]!, status: "proposed" }, ...v15.slice(1),
], routes), /duplicate or non-accepted ID/);
const audit = renderReaderCoverageAudit(plan);
for (const line of ["accepted_ids=62", "inherited_v014=14", "accepted_v015=48",
 "author_approved=0", "publication_ready=0", "reader_edges_verified=0"]) {
  assert.ok(audit.includes(line));
}

const proposedYaml = readFileSync(resolve(root, "requirements/mts-source/MTS-READER-ROUTE-PROPOSAL.yaml"), "utf8");
assert.equal(Object.keys(routes.chapters).length, 13);
assert.equal(Object.keys(routes.v014).length, 14);
assert.equal(Object.keys(routes.v015Groups).length, 21);
assert.throws(() => parseReaderRoutes(proposedYaml.replace("status: proposed", "status: approved")),
  /reader routes must remain proposed/);
assert.throws(() => parseReaderRoutes(proposedYaml.replace("V14-L1: foundations", "V14-L1: missing-section")),
  /invalid section/);
assert.throws(() => parseReaderRoutes(proposedYaml.replace("  TERM: terminology", "  TERM: terminology\n  TERM: terminology")),
  /invalid editorial YAML source/);
assert.throws(() => parseReaderRoutes(proposedYaml.replace("  V14-L14: architecture\n", "")),
  /v014 coverage must equal 14/);
assert.throws(() => parseReaderRoutes(proposedYaml.replace("  REG: assurance\n", "")),
  /v015_groups coverage must equal 21/);
console.log("G5 reader coverage census: 62/62 proposed; publication blocked.");


const introYaml = readFileSync(resolve(root, "requirements/mts-source/MTS-READER-INTRO-PROPOSAL.yaml"), "utf8");
const g4 = loadMtsSourceRequirement(root, "requirements/mts-source/MTS-FND-V14-L1.yaml");
assert.ok(g4.readerScience);
const scienceIds = g4.readerScience.steps.map(step => step.id);
const intro = loadReaderIntro(root);
assert.equal(intro.schema, "mts-reader-intro-proposal/v0.1");
assert.equal(intro.status, "proposed");
assert.equal(intro.publication, "blocked");
assert.equal(intro.completeness, "partial-candidate-bridges");
assert.equal(intro.nodes.length, 19);
assert.equal(intro.nodes.reduce((n,x) => n + x.requires.length, 0), 23);
assert.equal(new Set(intro.nodes.map(x => x.acceptedId)).size, 16);
assert.ok(intro.nodes.every(x => x.review === "pending"));
assert.equal(new Set(intro.nodes.map(x => x.id)).size, 19);
const places = new Map(intro.nodes.map((x,i) => [x.id,i]));
for (const [i,x] of intro.nodes.entries()) {
  assert.equal(x.section, plan.rows.find(row => row.id === x.acceptedId)?.proposedSection);
  assert.ok(x.requires.every(dep => (places.get(dep) ?? Infinity) < i));
}
assert.equal(intro.nodes.find(x => x.id === "relative-context-pilot")?.g4ScienceStep, "context-roles");
assert.deepEqual(intro.nodes.find(x => x.id === "json-source")?.requires,
  ["contextual-names", "sequence-semantics"]);
assert.ok(intro.nodes.some(x => x.section === "governance" && x.requires.length === 0));
assert.ok(intro.nodes.every(x => x.acceptedId === "V14-L1" || x.g4ScienceStep === null));
const parse = (input: string) => parseReaderIntro(input, plan, scienceIds);
assert.throws(() => parse(introYaml.replace("publication: blocked", "publication: ready")),
  /must remain partial, proposed/);
assert.throws(() => parse(introYaml.replace("completeness: partial-candidate-bridges", "completeness: complete")),
  /must remain partial, proposed/);
assert.throws(() => parse(introYaml.replace("g4_science_step: context-roles", "g4_science_step: Fake")),
  /forged or missing G4 science anchor/);
assert.throws(() => parse(introYaml.replace("accepted_id: V15-NAME-01", "accepted_id: V15-FAKE-01")),
  /unknown\/unblocked accepted ID/);
assert.throws(() => parse(introYaml.replace("section: formal-notation", "section: governance")),
  /mismatched proposed section/);
assert.throws(() => parse(introYaml.replace("requires: [foundation]", "requires: [release-readiness]")),
  /reader prerequisites must be unique and precede/);
assert.throws(() => parse(introYaml.replace("    review: pending", "    review: approved")),
  /cannot claim approved science review/);
assert.throws(() => parse(introYaml.replace("  - id: local-incidence", "  - id: foundation")),
  /duplicate\/invalid ID/);
assert.throws(() => parse(introYaml.replace("    requires: []", "    requires: [foundation, foundation]")),
  /reader prerequisites must be unique and precede/);
assert.throws(() => parse(introYaml.replace("    section: foundations", "    section: foundations\n    section: foundations")),
  /invalid introductory DAG YAML/);
console.log("G6 scientific introduction pilot: " + intro.nodes.length +
  " candidate nodes; no claims of 62-ID reader completeness.");


const g7Yaml = readFileSync(resolve(root, "requirements/mts-source/MTS-READER-V14-G7.yaml"), "utf8");
const g7 = loadReaderG7(root);
const g7Laws = new Map(v14.map(x => [x.id, x.statement]));
assert.equal(g7.schema, "mts-reader-atomic-v14/v0.1");
assert.equal(g7.atoms.length, 17);
assert.equal(new Set(g7.atoms.map(x => x.id)).size, 17);
assert.deepEqual([...new Set(g7.atoms.map(x => x.acceptedId))],
  ["V14-L5", "V14-L6", "V14-L13", "V14-L12"]);
assert.ok(g7.atoms.every(a => a.ru.length >= 100 && a.exclusions.length > 0));
assert.ok(g7.atoms.every(a => g7Laws.get(a.acceptedId)?.includes(a.sourceQuote)));
assert.ok(g7.atoms.every(a => a.proofSymbol === null || a.g4ScienceStep !== null));
assert.deepEqual(g7.atoms.filter(a => a.proofSymbol !== null).map(a => a.g4ScienceStep),
  ["chiral-orbit", "context-roles"]);
assert.ok(g7.atoms.every(a => a.proofSymbol === null || a.proofPremises.length > 0));
assert.equal(g7.publication, "blocked");
assert.equal(g7.authorApproval, "not-recorded");
const g7Parse = (input: string) => parseReaderG7(input, g7Laws, g4.readerScience!);
assert.throws(() => g7Parse(g7Yaml.replace("publication: blocked", "publication: ready")),
  /cannot promote/);
assert.throws(() => g7Parse(g7Yaml.replace("proof_check: declarations-only", "proof_check: fully-proven")),
  /cannot promote/);
assert.throws(() => g7Parse(g7Yaml.replace("source_quote: \"Semantic Link identity is immutable\"",
  "source_quote: \"Invented law text: Link is mutable\"")), /source quote not exact/);
assert.throws(() => g7Parse(g7Yaml.replace("g4_science_step: chiral-orbit", "g4_science_step: context-roles")),
  /conditional theorem fails exact G4/);
assert.throws(() => g7Parse(g7Yaml.replace("    proof_premises: [A1RecursiveSeparation, F2F3GroundedNormalization",
  "    proof_premises: [F2F3GroundedNormalization")), /conditional theorem fails exact G4/);
assert.throws(() => g7Parse(g7Yaml.replace("  - id: nat-zero", "  - id: link-identity")),
  /duplicate\/invalid id/);
assert.throws(() => g7Parse(g7Yaml.replace("    requires: [link-identity]", "    requires: [relative-z2]")),
  /requires unique earlier G7 atoms/);
assert.throws(() => g7Parse(g7Yaml.replace("    accepted_id: V14-L13", "    accepted_id: V14-L99")),
  /unknown accepted law/);
assert.throws(() => g7Parse(g7Yaml.replace("    role: accepted-contract", "    role: conditional-theorem")),
  /field mismatch/);
assert.throws(() => g7Parse(g7Yaml.replace("  - id: link-identity", "  - id: link-identity\n    id: link-identity")),
  /invalid G7 atomic YAML/);
console.log("G7 reader source: 17 exact-origin Russian atoms / 4 accepted laws / proof status unchanged.");


const g8Yaml = readFileSync(resolve(root, "requirements/mts-source/MTS-READER-V14-G8.yaml"), "utf8");
const acceptedV14 = JSON.parse(readFileSync(resolve(root, "contracts/mts-contract-v0.14.json"), "utf8"));
const g8 = loadReaderG8(root);
assert.equal(g8.schema, "mts-reader-atomic-v14/v0.2");
assert.equal(g8.atoms.length, 12);
assert.deepEqual([...new Set(g8.atoms.map(x => x.acceptedId))], ["V14-L2", "V14-L14"]);
assert.ok(g8.atoms.every(x => x.ru.length >= 125 && x.exclusions.length > 0));
assert.ok(g8.atoms.every(x => g7Laws.get(x.acceptedId)?.includes(x.sourceQuote)));
assert.equal(g8.atoms.find(x => x.id === "v015-das-version-boundary")?.relatedAcceptedId, "V15-JSON-02");
assert.equal(g8.atoms.find(x => x.id === "no-implicit-associativity")?.acceptedDetailPointer,
  "/ostensiveFormalNotation/implicitPairAssociativity");
assert.equal(g8.atoms.find(x => x.id === "ontology-level")?.acceptedDetailPointer,
  "/representationLayers/ontology");
assert.equal(g8.proofCheck, "contract-trace-only");
assert.equal(g8.authorApproval, "not-recorded");
assert.equal(g8.publication, "blocked");
const g8Parser = (source: string, contractModel: Record<string, unknown> = acceptedV14) =>
  parseReaderG8(source, g7Laws, contractModel, plan,
  new Map(v15.map(x => [x.id, x.statement])));
assert.throws(() => g8Parser(g8Yaml, {
  ...acceptedV14, ostensiveFormalNotation: {
    ...acceptedV14.ostensiveFormalNotation, implicitPairAssociativity: "LEFT",
  },
}), /accepted v0.14 ostensive grammar scope has changed/);
assert.throws(() => g8Parser(g8Yaml, {
  ...acceptedV14, ostensiveFormalNotation: {
    ...acceptedV14.ostensiveFormalNotation, synonyms: {
      ...acceptedV14.ostensiveFormalNotation.synonyms, "♀": "9",
    },
  },
}), /glyph-to-recursive-alphabet mismatch/);
assert.throws(() => g8Parser(g8Yaml, {
  ...acceptedV14, representationLayers: {
    ...acceptedV14.representationLayers, symbolicMetanotation: {
      ...acceptedV14.representationLayers.symbolicMetanotation, introducesOntologyEntity: true,
    },
  },
}), /accepted representation layer facts changed/);
assert.throws(() => g8Parser(g8Yaml.replace("status: proposed", "status: accepted")),
  /cannot promote/);
assert.throws(() => g8Parser(g8Yaml.replace("proof_check: contract-trace-only", "proof_check: proven")),
  /cannot promote/);
assert.throws(() => g8Parser(g8Yaml.replace("source_quote: \"Ostensive ∞/♂/♀/⟼ denote ROOT/START/END/PAIR\"",
  "source_quote: \"New primitive command types are accepted\"")), /source quote not exact/);
assert.throws(() => g8Parser(g8Yaml.replace("accepted_detail_pointer: /ostensiveFormalNotation/synonyms",
  "accepted_detail_pointer: /ostensiveFormalNotation/missing")),
  /accepted detail pointer unresolved/);
assert.throws(() => g8Parser(g8Yaml.replace("related_accepted_id: V15-JSON-02",
  "related_accepted_id: V15-MISSING-00")), /version bridge must cite/);
assert.throws(() => g8Parser(g8Yaml.replace("    section: formal-notation", "    section: architecture")),
  /mismatched G5 reader section/);
assert.throws(() => g8Parser(g8Yaml.replace("  - id: positional-forms", "  - id: glyph-map")),
  /duplicate\/invalid atom id/);
assert.throws(() => g8Parser(g8Yaml.replace("    requires: [glyph-map]", "    requires: [no-second-ontology]")),
  /forward\/cyclic\/duplicate reader atom edge/);
assert.throws(() => g8Parser(g8Yaml.replace("  - id: glyph-map", "  - id: glyph-map\n    id: glyph-map")),
  /invalid G8 atomic YAML/);
assert.throws(() => g8Parser(g8Yaml.replace("accepted_scope: [V14-L2, V14-L14]",
  "accepted_scope: [V14-L2]")), /scope mismatch/);
console.log("G8: 12 exact-origin Russian atoms / two accepted v0.14 laws / no new ontology.");
