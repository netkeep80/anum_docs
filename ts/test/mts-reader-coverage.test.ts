import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadMtsSemanticIr } from "../src/tooling/mts-compiler.js";
import { loadMtsSourceRequirement } from "../src/tooling/mts-source-requirement.js";
import { loadReaderCoverage, loadReaderRoutes, parseReaderRoutes, projectReaderCoverage, renderReaderCoverageAudit,
  loadReaderIntro, parseReaderIntro, loadReaderG7, parseReaderG7, loadReaderG8, parseReaderG8,
  loadReaderScienceCensus, projectReaderScienceCensus, renderReaderScienceCensus,
  loadReaderV14G10, parseReaderV14G10, loadReaderV15G11, parseReaderV15G11,
  projectReaderAllFirstPassCensus, renderReaderAllFirstPassCensus, READER_V15_G11_PATHS,
  loadReaderDraftPreview, projectReaderDraftPreview,
  loadReaderScienceClosure, parseReaderScienceClosure, renderReaderScienceClosure,
  loadReaderBootstrapNames, parseReaderBootstrapNames, loadReaderDraftWithBootstrapPrelude,
  loadReaderFoundationOpening, parseReaderFoundationOpening, loadReaderDraftWithFoundationOpening,
  loadReaderReverseNormativeAudit, parseReaderReverseNormativeAudit, deriveReaderReverseNormativeEdges,
  renderReaderReverseNormativeAudit,
  loadReaderChapterCycleAudit, deriveReaderChapterCycles, parseReaderChapterCycleAudit,
  renderReaderChapterCycleAudit,
  loadReaderEarlyConcepts, parseReaderEarlyConcepts, loadReaderDraftWithEarlyConcepts }
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


const g9 = loadReaderScienceCensus(root);
assert.equal(g9.schema, "mts-reader-science-census/v0.1");
assert.equal(g9.acceptedIds, 62);
assert.equal(g9.proposedTextAtoms, 49);
assert.equal(g9.withSourceOwnedAtoms, 7);
assert.equal(g9.withoutSourceOwnedAtoms, 55);
assert.equal(g9.authorApproved, 0);
assert.equal(g9.publicationReady, 0);
assert.equal(g9.rows.length, 62);
assert.ok(g9.rows.every(row => row.publication === "blocked" &&
  row.authorApproval === "not-recorded" && row.completeScientificArgument === false));
assert.ok(g9.rows.filter(row => row.atomicTextCount > 0).every(row =>
  row.scienceSourceState === "proposed" && row.sourceOwnerPaths.length > 0));
assert.ok(g9.rows.filter(row => row.atomicTextCount === 0).every(row =>
  row.scienceSourceState === "not-started" && row.sourceOwnerPaths.length === 0));
assert.deepEqual(Object.fromEntries(g9.rows.filter(x => x.atomicTextCount > 0)
  .map(x => [x.id,x.atomicTextCount])), {
    "V14-L1": 20, "V14-L2": 6, "V14-L5": 3, "V14-L6": 4,
    "V14-L12": 5, "V14-L13": 5, "V14-L14": 6,
  });
assert.ok(renderReaderScienceCensus(g9).includes("scientifically_complete_id=0"));
assert.throws(()=>projectReaderScienceCensus(plan, g4, g7,
  {...g8, authorApproval:"approved" as "not-recorded"}), /only collects proposed unapproved/);
assert.throws(()=>projectReaderScienceCensus(plan, g4, {
    ...g7, atoms: [...g7.atoms, {...g7.atoms[0]!, id:g8.atoms[0]!.id}],
  },g8), /duplicate\/empty source atom ID/);
assert.throws(()=>projectReaderScienceCensus(plan, g4, {
    ...g7, atoms: [...g7.atoms, {...g7.atoms[0]!, id:"forged-owner", acceptedId:"V14-L99" as
      typeof g7.atoms[0]["acceptedId"]}],
  },g8), /unknown accepted scientific owner/);
console.log("G9 computed source-owned science coverage " + g9.proposedTextAtoms + " atoms across " +
  g9.withSourceOwnedAtoms + " accepted IDs, never publication-ready.");

const g10Source=readFileSync(resolve(root,"requirements/mts-source/MTS-READER-V14-G10.yaml"),"utf8");
const g10=loadReaderV14G10(root);
assert.equal(g10.atoms.length,7);
assert.deepEqual(g10.atoms.map(x=>x.acceptedId),[
  "V14-L3","V14-L4","V14-L7","V14-L8","V14-L9","V14-L10","V14-L11"]);
assert.ok(g10.atoms.every(x=>x.sourceQuote===v14.find(z=>z.id===x.acceptedId)?.statement));
assert.equal(g10.authorApproval,"not-recorded");
assert.equal(g10.argumentCompleteness,"unverified");
assert.equal(g10.publication,"blocked");
const p10=(text:string)=>parseReaderV14G10(text,plan,g9,new Map(v14.map(x=>[x.id,x.statement])));
assert.throws(()=>p10(g10Source.replace("status: proposed","status: accepted")),/science not approved/);
assert.throws(()=>p10(g10Source.replace("argument_completeness: unverified",
 "argument_completeness: complete")),/science not approved/);
assert.throws(()=>p10(g10Source.replace("    accepted_id: V14-L3","    accepted_id: V14-L1")),
 /duplicate, unknown or already-owned/);
assert.throws(()=>p10(g10Source.replace("  - id: v14-l4","  - id: v14-l3")),
 /duplicate, unknown or already-owned/);
assert.throws(()=>p10(g10Source.replace("  - id: v14-l3","  - id: v14-l3\n    id: v14-l3")),
 /G10 invalid YAML/);
console.log("G10: 7 v0.14 Russian first-pass laws proposed, unverified and blocked.");

const g11=loadReaderV15G11(root);
assert.ok(g10.atoms.every(x=>x.domain.length>=30&&!x.domain.includes("Принятый контракт")&&x.domain!=="Link"));
const c11=projectReaderAllFirstPassCensus(g9,g10,g11);
assert.equal(g11.atoms.length,48);
assert.ok(g11.atoms.every(x=>x.domain.length>=30&&!x.domain.includes("Принятая нормативная область")));
assert.equal(new Set([...g10.atoms,...g11.atoms].map(x=>x.domain)).size,55);
assert.ok([...g10.atoms,...g11.atoms].every(x=>!x.domain.includes(x.acceptedId)));
assert.equal(new Set(g11.atoms.map(x=>x.acceptedId)).size,48);
assert.ok(g11.atoms.every(x=>v15.find(y=>y.id===x.acceptedId)?.statement===x.sourceQuote));
assert.equal(g11.publication,"blocked");
assert.equal(g11.authorApproval,"not-recorded");
assert.equal(g11.argumentCompleteness,"unverified");
assert.equal(c11.acceptedIds,62);
assert.equal(c11.idsWithProposedRussianText,62);
assert.equal(c11.totalProposedRussianAtoms,104);
assert.equal(c11.idWithoutSourceOwner,0);
assert.equal(c11.scientificallyCompleteIds,0);
assert.equal(c11.authorApprovedIds,0);
assert.equal(c11.publicationReadyIds,0);
assert.equal(g11.atoms.filter(x=>x.wave==="W1").length,12);
assert.equal(g11.atoms.filter(x=>x.wave==="W2").length,12);
assert.equal(g11.atoms.filter(x=>x.wave==="W3").length,12);
assert.equal(g11.atoms.filter(x=>x.wave==="W4").length,12);
assert.ok(renderReaderAllFirstPassCensus(c11).includes("publication_ready_ids=0"));
const w11=READER_V15_G11_PATHS.map(path=>readFileSync(resolve(root,path),"utf8"));
const laws11=new Map(v15.map(x=>[x.id,x.statement]));
const parse11=(files:readonly string[],laws:ReadonlyMap<string,string>=laws11)=>
  parseReaderV15G11(files,plan,laws);
assert.throws(()=>parse11(w11.map((t,i)=>i===0?t.replace("status: proposed","status: accepted"):t)),
 /unauthorized scientific\/author acceptance promotion/);
assert.throws(()=>parse11(w11.map((t,i)=>i===1?t.replace("argument_completeness: unverified",
 "argument_completeness: complete"):t)),/unauthorized scientific\/author acceptance promotion/);
assert.throws(()=>parse11(w11.map((t,i)=>i===0?t.replace("    accepted_id: V15-TERM-01",
  "    accepted_id: V14-L1"):t)),/unknown\/duplicate law or source ID/);
assert.throws(()=>parse11(w11.map((t,i)=>i===2?t.replace("  - id: v15-ctx-02",
  "  - id: v15-ctx-02\n    id: v15-ctx-02"):t)),/G11 invalid YAML/);
assert.throws(()=>parse11(w11,new Map([...laws11].map(([k,v])=>
  [k,k==="V15-TERM-01"?"tampered source":v]))),/source quote differs/);
assert.throws(()=>projectReaderAllFirstPassCensus(g9,g10,{
  ...g11,atoms:[...g11.atoms,{...g11.atoms[0]!,acceptedId:"V14-L2"}]
}),/duplicate\/foreign cross-source ID/);
console.log("G11: 48 first-pass v0.15 source-owned Russian texts; 62/62 accepted ID owner presence, ZERO scientific completion.");

const draft=loadReaderDraftPreview(root);
assert.equal(draft.schema,"mts-reader-draft-preview/v0.1");
assert.equal(draft.publication,"blocked");
assert.equal(draft.authorApproval,"not-recorded");
assert.equal(draft.readerOrder,"registry-order-not-reviewed");
assert.equal(draft.sectionCount,13);
assert.equal(draft.acceptedLawCount,62);
assert.equal(draft.proposedParagraphCount,104);
assert.ok(draft.markdown.startsWith("# Метатеория Связей — научное изложение (редакционный черновик)"));
assert.ok(draft.markdown.includes("ПУБЛИКАЦИЯ ЗАПРЕЩЕНА"));
assert.ok(draft.markdown.includes("НЕ является доказанным reader DAG"));
assert.equal((draft.markdown.match(/^## /gm)??[]).length,13);
assert.equal((draft.markdown.match(/^### V1[45]-/gm)??[]).length,62);
assert.equal((draft.markdown.match(/^#### /gm)??[]).length,104);
assert.equal(loadReaderDraftPreview(root).markdown,draft.markdown);
assert.throws(()=>projectReaderDraftPreview(plan,routes,g4,g7,g8,g10,g11,{
  ...c11,authorApprovedIds:1 as 0,
}),/cannot present incomplete or approved/);
assert.throws(()=>projectReaderDraftPreview(plan,routes,g4,g7,g8,g10,{
 ...g11,atoms:[...g11.atoms,{...g11.atoms[0]!}],
},c11),/duplicate source text ownership/);
console.log("G12: 13-section 62-law 104-atom deterministic unapproved Russian draft preview.");

const g13Text=readFileSync(resolve(root,"requirements/mts-source/MTS-READER-SCIENCE-GATES-G13.yaml"),"utf8");
const g13=loadReaderScienceClosure(root);
assert.equal(g13.gates.length,12);
assert.equal(new Set(g13.gates.map(x=>x.id)).size,12);
assert.ok(g13.gates.every(x=>x.status==="pending"));
assert.equal(g13.authorApproval,"not-recorded");
assert.equal(g13.publication,"blocked");
assert.ok(renderReaderScienceClosure(g13).includes("публикация запрещена"));
assert.throws(()=>parseReaderScienceClosure(g13Text.replace("publication: blocked",
 "publication: ready"),draft),/cannot approve/);
assert.throws(()=>parseReaderScienceClosure(g13Text.replace("  - id: reader-dag",
 "  - id: science-atomicity"),draft),/missing, duplicated or falsely resolved/);
assert.throws(()=>parseReaderScienceClosure(g13Text.replace("    status: pending",
 "    status: approved"),draft),/missing, duplicated or falsely resolved/);
assert.throws(()=>parseReaderScienceClosure(g13Text.replace("  - id: reader-dag",
 "  - id: reader-dag\n    id: reader-dag"),draft),/G13 invalid gate YAML/);
assert.throws(()=>p10(g10Source.replace(/    domain: "[^"]+"/,
  '    domain: "Принятый контракт V14-L3"')),/incomplete scientific text/);
assert.throws(()=>parse11(w11.map((x,i)=>i===0?x.replace(/    domain: "[^"]+"/,
  '    domain: "Принятая нормативная область V15-TERM-01"'):x)),
  /incomplete Russian science text/);
console.log("G13: 12 unresolved science/publication blockers remain explicit and source-owned.");


const v13Contract=JSON.parse(readFileSync(resolve(root,"contracts/mts-contract-v0.13.json"),"utf8"));
const v14Contract=JSON.parse(readFileSync(resolve(root,"contracts/mts-contract-v0.14.json"),"utf8"));
const g15Yaml=readFileSync(resolve(root,"requirements/mts-source/MTS-READER-BOOTSTRAP-G15.yaml"),"utf8");
const g15=loadReaderBootstrapNames(root);
assert.deepEqual(g15.symbols.map(x=>x.symbol),["R","O","C","L","U"]);
assert.ok(g15.symbols.every(x=>x.exactEquation===v13Contract.bootstrapBasis.definitions[x.symbol]));
assert.equal(g15.authorApproval,"not-recorded");
assert.equal(g15.publication,"blocked");
const namedDraft=loadReaderDraftWithBootstrapPrelude(root);
assert.ok(namedDraft.indexOf("### Исходные обозначения корневого базиса")<
  namedDraft.indexOf("## Первичная онтология"));
assert.ok(namedDraft.includes("N₀=U, D₁=L"));
assert.equal((namedDraft.match(/^## /gm)??[]).length,13);
assert.equal((namedDraft.match(/^### V1[45]-/gm)??[]).length,62);
const p15=(txt:string,v13=v13Contract,v14=v14Contract)=>
  parseReaderBootstrapNames(txt,v13,v14);
assert.throws(()=>p15(g15Yaml.replace("status: proposed","status: accepted")),
  /cannot forge inherited basis/);
assert.throws(()=>p15(g15Yaml.replace('exact_equation: "R = R ⟼ R"',
  'exact_equation: "R = O ⟼ R"')),/missing, forged or incomplete basis definition/);
assert.throws(()=>p15(g15Yaml,{
  ...v13Contract,
  bootstrapBasis:{...v13Contract.bootstrapBasis,definitions:{
    ...v13Contract.bootstrapBasis.definitions,U:"U = R ⟼ R"}}
}),/missing, forged or incomplete basis definition/);
assert.throws(()=>p15(g15Yaml,v13Contract,{
  ...v14Contract,natTheory:{...v14Contract.natTheory,zero:"N0 = R"}
}),/inconsistent inherited U\/L\/R/);
console.log("G15: R O C L U inherited basis and model-derived Russian reader prelude.");


const g16Yaml = readFileSync(resolve(root,
  "requirements/mts-source/MTS-READER-FOUNDATION-OPENING-G16.yaml"),"utf8");
const g16 = loadReaderFoundationOpening(root);
assert.equal(g16.acceptedId,"V14-L1");
assert.equal(g16.historicalSha256,g4.statement.sha256);
assert.ok(g4.statement.ru.startsWith(g16.historicalOpening));
assert.ok(!g16.candidateRu.includes(g16.historicalOpening));
assert.ok(g16.candidateRu.includes("11") && g16.candidateRu.includes("01"));
assert.ok(g16.candidateRu.includes("START_K") && g16.candidateRu.includes("END_K"));
assert.ok(g16.candidateRu.includes("R представляет случай 11"));
assert.equal(g16.exclusions.length,3);
assert.equal(g16.authorApproval,"not-recorded");
assert.equal(g16.publication,"blocked");
const introduced = loadReaderDraftWithFoundationOpening(root);
const firstDefinition=introduced.indexOf("### Предмет МТС и четыре локальных случая");
const basisDefinition=introduced.indexOf("### Исходные обозначения корневого базиса");
const firstChapter=introduced.search(/^## /m);
assert.ok(firstDefinition>=0 && firstDefinition<basisDefinition && basisDefinition<firstChapter);
assert.equal((introduced.match(/^## /gm)??[]).length,13);
assert.equal((introduced.match(/^### V1[45]-/gm)??[]).length,62);
assert.equal((introduced.match(/^#### /gm)??[]).length,104);
const g16Parse=(text:string,model=g4,v13=v13Contract)=>
  parseReaderFoundationOpening(text,model,v13);
assert.throws(()=>g16Parse(g16Yaml.replace("status: proposed","status: accepted")),
 /G16 historical provenance or unapproved state drift/);
assert.throws(()=>g16Parse(g16Yaml.replace("publication: blocked","publication: ready")),
 /G16 historical provenance or unapproved state drift/);
assert.throws(()=>g16Parse(g16Yaml.replace("historical_sha256: b4ed8bc68c3a45a7eb26526027d39ac2de2ed72085c34e6de33eb8e8019017f5",
  "historical_sha256: altered")),
 /G16 historical provenance or unapproved state drift/);
assert.throws(()=>g16Parse(g16Yaml.replace("accepted_id: V14-L1","accepted_id: V14-L2")),
 /G16 historical provenance or unapproved state drift/);
assert.throws(()=>g16Parse(g16Yaml.replace("  - ","  - ")
  .replace("exclusions:\n","exclusions:\n  - \"\" \n")),
 /G16 needs three separate scientific noninference boundaries/);
assert.throws(()=>g16Parse(g16Yaml,g4,{
  ...v13Contract,aspectFoundationTheorem:{
    ...v13Contract.aspectFoundationTheorem,necessity:{
      ...v13Contract.aspectFoundationTheorem.necessity,witnesses:{
        ...v13Contract.aspectFoundationTheorem.necessity.witnesses,PAIR:"U"
      }
    }
  }
}),/accepted v0.13 structural witnesses drift/);
console.log("G16: original historic source unchanged; standalone blocked scientific prelude candidate.");


const g17Source=readFileSync(resolve(root,
  "requirements/mts-source/MTS-READER-INVERSION-G17.yaml"),"utf8");
const g17=loadReaderReverseNormativeAudit(root);
assert.equal(g17.schema,"mts-reader-inversion-audit/v0.1");
assert.equal(g17.normativeEdgeCount,100);
assert.equal(g17.reversedChapterEdges.length,17);
assert.equal(g17.authorApproval,"not-recorded");
assert.equal(g17.publication,"blocked");
assert.equal(g17.readerDag,"scientific-review-pending");
assert.ok(g17.reversedChapterEdges.every(x=>x.review==="pending" &&
  x.riskRu.length>=85 && x.proposalRu.length>=85));
assert.ok(g17.reversedChapterEdges.some(x=>x.prerequisite==="V14-L6"&&x.consumer==="V14-L7"));
assert.ok(g17.reversedChapterEdges.some(x=>x.prerequisite==="V15-TERM-01"&&x.consumer==="V15-NAME-01"));
assert.deepEqual(deriveReaderReverseNormativeEdges(plan,routes).map(x=>[x.prerequisite,x.consumer]),
  g17.reversedChapterEdges.map(x=>[x.prerequisite,x.consumer]));
assert.ok(renderReaderReverseNormativeAudit(g17).includes("Авторски утверждённых reader DAG переходов: 0."));
const g17Parse=(text:string,coverage=plan,routeModel=routes)=>
  parseReaderReverseNormativeAudit(text,coverage,routeModel);
assert.throws(()=>g17Parse(g17Source.replace("status: proposed","status: accepted")),
  /cannot approve editorial or normative\/reader DAG equivalence/);
assert.throws(()=>g17Parse(g17Source.replace("normative_edges_are_reader_edges: false",
  "normative_edges_are_reader_edges: true")),
  /cannot approve editorial or normative\/reader DAG equivalence/);
assert.throws(()=>g17Parse(g17Source.replace("  - prerequisite: V14-L6",
  "  - prerequisite: V14-L5")),/accepted normalized dependency\/chapter relation drift/);
assert.throws(()=>g17Parse(g17Source.replace("    review: pending","    review: green")),
  /each inversion needs individual unapproved scientific rationale/);
assert.throws(()=>g17Parse(g17Source.replace("observations:\n","observations:\n  - prerequisite: V14-L6\n    prerequisite: V14-L6\n")),
  /G17 invalid inversion YAML/);
const alteredPlan={...plan,rows:plan.rows.map(x=>x.id==="V14-L7"?{
  ...x,normativeDependsOn:["V14-L13"],
}:x)};
assert.throws(()=>g17Parse(g17Source,alteredPlan),/accepted normative dependency source drift/);
console.log("G17: 100 normative edges; 17 individually reviewed chapter inversions, zero accepted reader DAG edges.");


const g18Source=readFileSync(resolve(root,
  "requirements/mts-source/MTS-READER-CHAPTER-CYCLES-G18.yaml"),"utf8");
const g18=loadReaderChapterCycleAudit(root);
assert.equal(g18.schema,"mts-reader-chapter-cycle-audit/v0.1");
assert.equal(g18.acceptedNormativeEdges,100);
assert.equal(g18.normativeLawDagAcyclic,true);
assert.equal(g18.crossChapterEdges,37);
assert.equal(g18.components.length,2);
assert.deepEqual(g18.components.map(x=>x.members),[
  ["architecture","arithmetic","formal-notation","foundations","representation"],
  ["assurance","documentation","governance","proofs","worked-examples"],
]);
assert.deepEqual(g18.singletonSections,[
  "execution","inversion-and-context","terminology",
]);
assert.ok(g18.components.every(x=>x.review==="pending" && x.riskRu.length>=110 &&
  x.repairRu.length>=110));
assert.equal(g18.authorApproval,"not-recorded");
assert.equal(g18.publication,"blocked");
const derivedCycles=deriveReaderChapterCycles(plan,routes);
assert.equal(derivedCycles.crossChapterEdges,37);
assert.equal(derivedCycles.normativeLawDagAcyclic,true);
assert.deepEqual(derivedCycles.cyclicComponents,g18.components.map(x=>x.members));
assert.ok(renderReaderChapterCycleAudit(g18).includes("не противоречие в принятых законах"));
const g18Parse=(text:string,coverage=plan,routeModel=routes,audit=g17)=>
  parseReaderChapterCycleAudit(text,coverage,routeModel,audit);
assert.throws(()=>g18Parse(g18Source.replace("status: proposed","status: accepted")),
  /cannot approve chapter ordering or conflate distinct graphs/);
assert.throws(()=>g18Parse(g18Source.replace("normative_edges_are_reader_edges: false",
  "normative_edges_are_reader_edges: true")),
  /cannot approve chapter ordering or conflate distinct graphs/);
assert.throws(()=>g18Parse(g18Source.replace("cross_chapter_edges: 37",
  "cross_chapter_edges: 36")),
  /cannot approve chapter ordering or conflate distinct graphs/);
assert.throws(()=>g18Parse(g18Source.replace("  - id: foundation-architecture-loop",
  "  - id: proof-assurance-governance-loop")),
  /chapter SCC is altered or scientific explanation missing/);
assert.throws(()=>g18Parse(g18Source.replace("singletons: [execution, inversion-and-context, terminology]",
  "singletons: [terminology, execution, inversion-and-context]")),
  /isolated chapter set drift/);
assert.throws(()=>g18Parse(g18Source.replace("components:\n",
  "components:\n  - id: fake\n    id: fake\n")),/G18 invalid cycle YAML/);
const normativeCycle={...plan,rows:plan.rows.map(x=>x.id==="V14-L1"?{
  ...x,normativeDependsOn:["V14-L2"],
}:x)};
assert.throws(()=>deriveReaderChapterCycles(normativeCycle,routes),
  /accepted law graph has a dependency cycle/);
console.log("G18: two 5-chapter SCCs over 37 cross-chapter edges; no chapter-level DAG.");


const g19Source=readFileSync(resolve(root,
  "requirements/mts-source/MTS-READER-EARLY-CONCEPTS-G19.yaml"),"utf8");
const g19=loadReaderEarlyConcepts(root);
assert.equal(g19.schema,"mts-reader-early-concepts/v0.1");
assert.equal(g19.definitions.length,5);
assert.deepEqual(g19.definitions.map(x=>x.acceptedId),[
  "V15-TERM-01","V14-L6","V15-JSON-04","V15-JSON-02","V15-GAMMA-01",
]);
assert.ok(g19.definitions.every(x=>x.review==="pending" && x.introductoryRu.length>=190));
assert.equal(g19.publication,"blocked");
assert.equal(g19.authorApproval,"not-recorded");
const g19Draft=loadReaderDraftWithEarlyConcepts(root);
assert.ok(g19Draft.indexOf("### Минимальные определения перед первым использованием")>
  g19Draft.indexOf("### Исходные обозначения корневого базиса"));
assert.ok(g19Draft.indexOf("### Минимальные определения перед первым использованием")<
  g19Draft.search(/^## /m));
assert.equal((g19Draft.match(/^## /gm)??[]).length,13);
assert.equal((g19Draft.match(/^### V1[45]-/gm)??[]).length,62);
assert.equal((g19Draft.match(/^#### /gm)??[]).length,104);
const acceptedG19=new Map([...v14,...v15].map(x=>[x.id,x.statement]));
const parse19=(txt:string,laws:ReadonlyMap<string,string>=acceptedG19,
  contract=v14Contract)=>parseReaderEarlyConcepts(txt,laws,contract);
assert.throws(()=>parse19(g19Source.replace("status: proposed","status: accepted")),
  /cannot promote glossary to accepted theory or publication/);
assert.throws(()=>parse19(g19Source.replace("publication: blocked","publication: ready")),
  /cannot promote glossary to accepted theory or publication/);
assert.throws(()=>parse19(g19Source.replace("    accepted_id: V15-TERM-01",
  "    accepted_id: V15-ONTO-01")),/duplicate\/forged\/missing source-owned/);
assert.throws(()=>parse19(g19Source,new Map([...acceptedG19].map(([id,law])=>
  [id,id==="V15-TERM-01"?"forged":law]))),/duplicate\/forged\/missing source-owned/);
assert.throws(()=>parse19(g19Source,acceptedG19,{
  ...v14Contract,natTheory:{...v14Contract.natTheory,zero:"N0 = R"}
}),/Nat \/ Degree first-use authority drift/);
assert.throws(()=>parse19(g19Source.replace("definitions:\n",
  "definitions:\n  - id: false\n    id: false\n")),
  /G19 invalid early-concepts YAML/);
console.log("G19: five exact-source first-use terms with no promotion of 62 laws or 104 atoms.");
