import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { readExactSequence } from "../src/exact-sequence.js";
import { Memory, ensureRootBasis, type LinkHandle, type RootBasis } from "../src/memory.js";
import { materializeNativeSyntaxGrammar, type NativeSyntaxGrammarRuleSpec } from "../src/native-syntax-grammar.js";
import { materializeSourceNamespaceProfile } from "../src/source-namespace.js";
import {
  V015_FORMAL_JSON_J1_SCHEMA,
  decodeV015FormalSourceAsetJson,
  encodeV015FormalSourceAsetJson,
} from "../src/v015-formal-decoder.js";
import {
  compileV015FormalDefinitionsToRecursive,
  type V015FormalRecursiveCompileResult,
} from "../src/v015-formal-recursive-compiler.js";
import { materializeV015LinkDefinitionProfile } from "../src/v015-link-definition.js";
import { materializeV012StringAnum } from "../src/v012-string-anum.js";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error("v0.15 B31 FND-12 candidate FORMAL statement: " + message);
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), message + ": values differ");
}
function sameBytes(actual: Uint8Array, expected: Uint8Array, message: string): void {
  same(actual.length, expected.length, message + ": length");
  for (let i = 0; i < actual.length; i += 1) same(actual[i], expected[i], message + ": byte " + i);
}
function differentBytes(actual: Uint8Array, expected: Uint8Array, message: string): void {
  if (actual.length !== expected.length) return;
  for (let i = 0; i < actual.length; i += 1) if (actual[i] !== expected[i]) return;
  throw new Error("v0.15 B31 FND-12 candidate FORMAL statement: " + message);
}

interface Fixture {
  readonly memory: Memory;
  readonly basis: RootBasis;
  readonly grammarRoot: LinkHandle;
  readonly namespaceProfileRoot: LinkHandle;
  readonly definitionProfileRoot: LinkHandle;
}
function fixture(): Fixture {
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  let cursor = memory.ensure(basis.U, basis.L);
  const fresh = (): LinkHandle => (cursor = memory.ensure(cursor, basis.C));
  const syntaxTag = fresh(), markerSeed = fresh(), pairForm = fresh(), nameRefForm = fresh();
  const declarationForm = fresh(), blockForm = fresh(), sequenceForm = fresh();
  const pairLeftRole = fresh(), pairRightRole = fresh(), referencedNameRole = fresh();
  const declarationNameRole = fresh(), declarationBodyRole = fresh();
  const blockItemRole = fresh(), sequenceItemRole = fresh();
  const rules: readonly NativeSyntaxGrammarRuleSpec[] = [
    { form: pairForm, fields: [
      { role: pairLeftRole, target: "child", min: 1, max: 1 },
      { role: pairRightRole, target: "child", min: 1, max: 1 },
    ] },
    { form: nameRefForm, fields: [{ role: referencedNameRole, target: "carrier", min: 1, max: 1 }] },
    { form: declarationForm, fields: [
      { role: declarationNameRole, target: "carrier", min: 1, max: 1 },
      { role: declarationBodyRole, target: "child", min: 1, max: 1 },
    ] },
    { form: blockForm, fields: [{ role: blockItemRole, target: "child", min: 0, max: null }] },
    { form: sequenceForm, fields: [{ role: sequenceItemRole, target: "child", min: 0, max: null }] },
  ];
  return Object.freeze({
    memory,
    basis,
    grammarRoot: materializeNativeSyntaxGrammar(memory, basis, { syntaxTag, markerSeed, rules }),
    namespaceProfileRoot: materializeSourceNamespaceProfile(memory, {
      blockForm, declarationForm, blockItemRole, declarationNameRole, declarationBodyRole,
    }),
    definitionProfileRoot: materializeV015LinkDefinitionProfile(memory, {
      pairForm, nameRefForm, pairLeftRole, pairRightRole, referencedNameRole,
      sequenceForm, sequenceItemRole,
    }),
  });
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();
function repositoryRoot(): string {
  const root = [resolve(process.cwd(), ".."), process.cwd()].find((candidate) =>
    existsSync(resolve(candidate, "requirements/mts-v0.15.json")));
  assert(root !== undefined, "repository root");
  return root;
}
function readJson(path: string): any {
  return JSON.parse(readFileSync(resolve(repositoryRoot(), path), "utf8"));
}

{
  const historical = readJson("theorems/current-v0.14.json") as { theorems?: {
    id: string; statement: string; dependsOn: string[]; formalPremises: string[];
    scope: string; exclusions: string;
    evidence: { typescript: string[]; lean4: string[]; coq: string[]; mtsNative: string[]; aprover: string[] };
  }[] };
  const theorem = historical.theorems?.find((item) => item.id === "FND-12");
  assert(theorem !== undefined, "historical FND-12 inventory row");
  same(theorem.statement,
    "Under the accepted V14-L14 representation-layer boundary and the proved FND-01/FND-11 dependencies, structural roles and representation denotations remain over the sole semantic Link carrier; recursive structure, representations/codecs, byte-text and symbolic metanotation introduce no second ontology entity.",
    "exact historical statement");
  same(JSON.stringify(theorem.dependsOn), JSON.stringify(["FND-01", "FND-11"]), "historical dependencies");
  same(JSON.stringify(theorem.formalPremises), JSON.stringify([
    "AcceptedRepresentationLayerBoundary", "FND01LinkOnlyStructure", "FND11RepresentationSeparation",
  ]), "historical formal premises");
  assert(/representation-layer ontology boundary/i.test(theorem.scope), "representation-layer ontology scope");
  assert(/host Type inequality, an enum, Bool flag, or identity ranking/i.test(theorem.exclusions),
    "host classification excluded");
  assert(/need not themselves be Links/i.test(theorem.exclusions), "source identity boundary retained");
  same(theorem.evidence.mtsNative.length, 0, "no historical native proof");
  same(theorem.evidence.aprover.length, 0, "no historical aprover proof");
}
{
  const contract = readJson("contracts/mts-contract-v0.14.json");
  same(contract.requiredSemanticLaws["V14-L14"],
    "MTS representation layers are explicit and non-ontological above Link: recursive structure, representations/codecs, byte-text and symbolic metanotation introduce no second ontology entity.",
    "accepted V14-L14 boundary");
  const layers = contract.representationLayers;
  same(JSON.stringify(layers.ontology.members), JSON.stringify(["Link"]), "sole ontology member");
  same(layers.ontology.introducesOntologyEntity, true, "Link is ontology carrier");
  for (const key of ["recursiveStructure", "representationsAndCodecs", "byteText", "symbolicMetanotation"]) {
    same(layers[key].introducesOntologyEntity, false, key + " non-ontological");
  }
}
{
  const premiseRegistry = readJson("proofs/premise-classification-v0.14.json") as {
    premises?: { id: string; classification: string; derivationFrom?: string[]; consumedBy?: string[] }[];
  };
  const premise = (id: string) => premiseRegistry.premises?.find((item) => item.id === id);
  same(premise("AcceptedRepresentationLayerBoundary")?.classification, "INDEPENDENT_MODEL_CHOICE",
    "accepted layer boundary is explicit semantic premise");
  same(premise("FND01LinkOnlyStructure")?.classification, "DERIVED", "FND-01 adapter is derived");
  same(JSON.stringify(premise("FND01LinkOnlyStructure")?.derivationFrom), JSON.stringify(["FND-01"]),
    "FND-01 adapter provenance");
  same(premise("FND11RepresentationSeparation")?.classification, "DERIVED", "FND-11 adapter is derived");
  same(JSON.stringify(premise("FND11RepresentationSeparation")?.derivationFrom), JSON.stringify(["FND-11"]),
    "FND-11 adapter provenance");
}
{
  const overlay = readJson("theorems/formal-v0.15.json") as { entries?: { id: string; migrationStatus?: string }[] };
  for (const id of ["FND-01", "FND-11"]) {
    const dependency = overlay.entries?.find((item) => item.id === id);
    assert(dependency !== undefined, id + " dependency exists");
    same(dependency.migrationStatus, "FORMAL_MIGRATED", id + " dependency is migrated");
  }
}
for (const path of ["proofs/evidence/FND-12/lean4.json", "proofs/evidence/FND-12/coq.json"]) {
  const evidence = readJson(path) as {
    result?: string; authority?: string; dependencies?: string[]; assumptions?: string[]; notes?: string;
  };
  same(evidence.result, "proved", path + " result");
  same(evidence.authority, "external-cross-check", path + " authority");
  same(JSON.stringify(evidence.assumptions), JSON.stringify(["AcceptedRepresentationLayerBoundary"]),
    path + " accepted premise");
  same(JSON.stringify(evidence.dependencies), JSON.stringify(["FND-01", "FND-11"]), path + " dependencies");
  assert(evidence.notes?.includes("Link is the sole semantic carrier"), path + " Link-only carrier");
  assert(evidence.notes?.includes("non-ontological layers"), path + " upper-layer boundary");
  assert(evidence.notes?.includes("No host layer enum, Bool flag, Type inequality"), path + " host boundary");
  assert(evidence.notes?.includes("need not themselves be Links"), path + " representation identity boundary");
}
{
  const witness = readFileSync(resolve(repositoryRoot(), "ts/test/research-v014-preacceptance-closure.test.ts"), "utf8");
  assert(witness.includes('JSON.stringify(["Link"])'), "historical Link-only ontology witness");
  assert(witness.includes('key + " introduces no second ontology entity"'), "historical upper-layer witness");
  const capabilities = readFileSync(resolve(repositoryRoot(), "ts/test/codec-capability-model.test.ts"), "utf8");
  assert(capabilities.includes("GLOBAL_SCALAR_SCORE=FORBIDDEN"), "representation ranking remains non-authoritative");
}

function compile(f: Fixture, source: string): V015FormalRecursiveCompileResult {
  return compileV015FormalDefinitionsToRecursive(
    f.memory, f.basis, f.grammarRoot, f.namespaceProfileRoot, f.definitionProfileRoot, encoder.encode(source),
  );
}
function value(f: Fixture, compiled: V015FormalRecursiveCompileResult, name: string): LinkHandle {
  const carrier = materializeV012StringAnum(f.memory, f.basis, encoder.encode(name)).anumLink;
  const definition = compiled.definitions.find((item) => item.nameCarrier === carrier);
  assert(definition !== undefined, "missing definition " + name);
  return definition.semantic;
}
function wire(f: Fixture, compiled: V015FormalRecursiveCompileResult, name: string): Uint8Array {
  const carrier = materializeV012StringAnum(f.memory, f.basis, encoder.encode(name)).anumLink;
  const definition = compiled.definitions.find((item) => item.nameCarrier === carrier);
  assert(definition !== undefined, "missing definition " + name);
  return definition.wire;
}

interface Names {
  readonly link: string; readonly second: string;
  readonly structural: string; readonly recursive: string; readonly representation: string;
  readonly byteText: string; readonly metanotation: string;
  readonly accepted: string; readonly fnd01: string; readonly fnd11: string;
}
const canonical: Names = Object.freeze({
  link:"LINK_CARRIER", second:"SECOND_CARRIER",
  structural:"STRUCTURAL_ROLE", recursive:"RECURSIVE_LAYER_ROLE", representation:"REPRESENTATION_LAYER_ROLE",
  byteText:"BYTE_TEXT_LAYER_ROLE", metanotation:"METANOTATION_LAYER_ROLE",
  accepted:"ACCEPTED_LAYER_BOUNDARY", fnd01:"FND01_LINK_ONLY_STRUCTURE",
  fnd11:"FND11_REPRESENTATION_SEPARATION",
});
const renamed: Names = Object.freeze({
  link:"SEMANTIC_CARRIER", second:"ALTERNATE_CARRIER",
  structural:"STRUCTURAL_VIEW", recursive:"RECURSIVE_VIEW", representation:"REPRESENTATION_VIEW",
  byteText:"BYTE_TEXT_VIEW", metanotation:"SYMBOLIC_VIEW",
  accepted:"ACCEPTED_BOUNDARY_PREMISE", fnd01:"STRUCTURE_DEPENDENCY_WITNESS",
  fnd11:"REPRESENTATION_DEPENDENCY_WITNESS",
});

function sourceFor(n: Names): string {
  return [
    "R : R->R", "O : O->R", "C : R->C", "L : O->C", "U : C->O",
    n.link + " : U->L",
    n.second + " : " + n.link + "->R",
    "PREMISE_TAG : " + n.second + "->O",
    "AUTHORITY_TAG : PREMISE_TAG->O",
    "ROLE_SEED : AUTHORITY_TAG->O",
    n.structural + " : ROLE_SEED->O",
    n.recursive + " : " + n.structural + "->O",
    n.representation + " : " + n.recursive + "->O",
    n.byteText + " : " + n.representation + "->O",
    n.metanotation + " : " + n.byteText + "->O",
    n.accepted + " : PREMISE_TAG->" + n.link,
    n.fnd01 + " : PREMISE_TAG->" + n.structural,
    n.fnd11 + " : PREMISE_TAG->" + n.representation,
    "FND12_PREMISES : [" + n.accepted + "," + n.fnd01 + "," + n.fnd11 + "]",
    "SOLE_LINK_ONTOLOGY_ARGS : [" + n.link + "]",
    "SOLE_LINK_ONTOLOGY : AUTHORITY_TAG->SOLE_LINK_ONTOLOGY_ARGS",
    "STRUCTURAL_AUTHORITY_ARGS : [" + n.structural + "," + n.link + "]",
    "STRUCTURAL_AUTHORITY : AUTHORITY_TAG->STRUCTURAL_AUTHORITY_ARGS",
    "RECURSIVE_AUTHORITY_ARGS : [" + n.recursive + "," + n.link + "]",
    "RECURSIVE_AUTHORITY : AUTHORITY_TAG->RECURSIVE_AUTHORITY_ARGS",
    "REPRESENTATION_AUTHORITY_ARGS : [" + n.representation + "," + n.link + "]",
    "REPRESENTATION_AUTHORITY : AUTHORITY_TAG->REPRESENTATION_AUTHORITY_ARGS",
    "BYTE_TEXT_AUTHORITY_ARGS : [" + n.byteText + "," + n.link + "]",
    "BYTE_TEXT_AUTHORITY : AUTHORITY_TAG->BYTE_TEXT_AUTHORITY_ARGS",
    "METANOTATION_AUTHORITY_ARGS : [" + n.metanotation + "," + n.link + "]",
    "METANOTATION_AUTHORITY : AUTHORITY_TAG->METANOTATION_AUTHORITY_ARGS",
    "FND12_CONCLUSION : [SOLE_LINK_ONTOLOGY,STRUCTURAL_AUTHORITY,RECURSIVE_AUTHORITY,REPRESENTATION_AUTHORITY,BYTE_TEXT_AUTHORITY,METANOTATION_AUTHORITY]",
    "FND12_STATEMENT : FND12_PREMISES->FND12_CONCLUSION",
  ].join("\n");
}
const source = sourceFor(canonical);

function verify(f: Fixture, compiled: V015FormalRecursiveCompileResult, n: Names): void {
  const premises = readExactSequence(f.memory, value(f, compiled, "FND12_PREMISES")).values;
  same(premises.length, 3, "three explicit premise witnesses");
  same(premises[0], value(f, compiled, n.accepted), "accepted layer-boundary premise");
  same(premises[1], value(f, compiled, n.fnd01), "FND-01 dependency witness");
  same(premises[2], value(f, compiled, n.fnd11), "FND-11 dependency witness");

  const sole = readExactSequence(f.memory, f.memory.poles(value(f, compiled, "SOLE_LINK_ONTOLOGY")).end).values;
  same(sole.length, 1, "sole ontology carrier arity");
  same(sole[0], value(f, compiled, n.link), "sole ontology carrier is Link");

  for (const [relation, role] of [
    ["STRUCTURAL_AUTHORITY", n.structural],
    ["RECURSIVE_AUTHORITY", n.recursive],
    ["REPRESENTATION_AUTHORITY", n.representation],
    ["BYTE_TEXT_AUTHORITY", n.byteText],
    ["METANOTATION_AUTHORITY", n.metanotation],
  ] as const) {
    const args = readExactSequence(f.memory, f.memory.poles(value(f, compiled, relation)).end).values;
    same(args.length, 2, relation + " arity");
    same(args[0], value(f, compiled, role), relation + " role");
    same(args[1], value(f, compiled, n.link), relation + " semantic authority routes to Link");
    assert(args[1] !== value(f, compiled, n.second), relation + " does not introduce second semantic carrier");
  }

  const conclusion = readExactSequence(f.memory, value(f, compiled, "FND12_CONCLUSION")).values;
  same(conclusion.length, 6, "FND-12 conclusion clauses");
  const statement = f.memory.poles(value(f, compiled, "FND12_STATEMENT"));
  same(statement.start, value(f, compiled, "FND12_PREMISES"), "statement premises");
  same(statement.end, value(f, compiled, "FND12_CONCLUSION"), "statement conclusion");

  const json = encodeV015FormalSourceAsetJson(
    f.memory, f.basis, f.grammarRoot, f.namespaceProfileRoot, f.definitionProfileRoot, compiled.source.sourceAset,
  );
  assert(decoder.decode(json).includes('"schema":"' + V015_FORMAL_JSON_J1_SCHEMA + '"'), "strict J1 projection");
  const round = decodeV015FormalSourceAsetJson(
    f.memory, f.basis, f.grammarRoot, f.namespaceProfileRoot, f.definitionProfileRoot, json,
  );
  same(round.sourceAset, compiled.source.sourceAset, "J1 preserves source ANet");
  sameBytes(round.canonicalJson, json, "J1 canonical bytes");
}

const first=fixture(), compiled=compile(first,source); verify(first,compiled,canonical);
const second=fixture(), secondCompiled=compile(second,source); verify(second,secondCompiled,canonical);
sameBytes(wire(first,compiled,"FND12_STATEMENT"),wire(second,secondCompiled,"FND12_STATEMENT"),
  "fresh-Memory wire parity");

const renamedFixture=fixture(), renamedCompiled=compile(renamedFixture,sourceFor(renamed));
verify(renamedFixture,renamedCompiled,renamed);
sameBytes(wire(first,compiled,"FND12_STATEMENT"),wire(renamedFixture,renamedCompiled,"FND12_STATEMENT"),
  "presentation rename preserves statement identity");

{
  const wrong=fixture();
  const mutated=compile(wrong,source.replace(
    "FND12_PREMISES : [ACCEPTED_LAYER_BOUNDARY,FND01_LINK_ONLY_STRUCTURE,FND11_REPRESENTATION_SEPARATION]",
    "FND12_PREMISES : [FND01_LINK_ONLY_STRUCTURE,FND11_REPRESENTATION_SEPARATION]",
  ));
  differentBytes(wire(first,compiled,"FND12_STATEMENT"),wire(wrong,mutated,"FND12_STATEMENT"),
    "accepted V14-L14 layer boundary must remain explicit");
}
{
  const wrong=fixture();
  const mutated=compile(wrong,source.replace(
    "FND12_PREMISES : [ACCEPTED_LAYER_BOUNDARY,FND01_LINK_ONLY_STRUCTURE,FND11_REPRESENTATION_SEPARATION]",
    "FND12_PREMISES : [ACCEPTED_LAYER_BOUNDARY,FND11_REPRESENTATION_SEPARATION,FND11_REPRESENTATION_SEPARATION]",
  ));
  differentBytes(wire(first,compiled,"FND12_STATEMENT"),wire(wrong,mutated,"FND12_STATEMENT"),
    "FND-01 dependency witness must remain");
}
{
  const wrong=fixture();
  const mutated=compile(wrong,source.replace(
    "FND12_PREMISES : [ACCEPTED_LAYER_BOUNDARY,FND01_LINK_ONLY_STRUCTURE,FND11_REPRESENTATION_SEPARATION]",
    "FND12_PREMISES : [ACCEPTED_LAYER_BOUNDARY,FND01_LINK_ONLY_STRUCTURE,FND01_LINK_ONLY_STRUCTURE]",
  ));
  differentBytes(wire(first,compiled,"FND12_STATEMENT"),wire(wrong,mutated,"FND12_STATEMENT"),
    "FND-11 dependency witness must remain");
}
{
  const wrong=fixture();
  const mutated=compile(wrong,source.replace(
    "METANOTATION_AUTHORITY_ARGS : [METANOTATION_LAYER_ROLE,LINK_CARRIER]",
    "METANOTATION_AUTHORITY_ARGS : [METANOTATION_LAYER_ROLE,SECOND_CARRIER]",
  ));
  differentBytes(wire(first,compiled,"FND12_STATEMENT"),wire(wrong,mutated,"FND12_STATEMENT"),
    "upper representation layer must not introduce second semantic carrier");
}

console.log([
  "MTS v0.15 B31 FND-12 candidate FORMAL statement:",
  "MIGRATION_STATUS=CANDIDATE_NOT_PROMOTED",
  "FORMAL_ARTIFACT_KIND=STATEMENT_ONLY",
  "FORMAL_PREMISES=3_ACCEPTED_BOUNDARY_PLUS_DERIVED_FND01_FND11",
  "FORMAL_DEPENDENCIES=FND-01+FND-11",
  "ONTOLOGY_CARRIER=LINK_ONLY",
  "UPPER_LAYERS=NON_ONTOLOGICAL",
  "STRUCTURAL_ROLE_AUTHORITY=LINK",
  "RECURSIVE_LAYER_AUTHORITY=LINK",
  "REPRESENTATION_LAYER_AUTHORITY=LINK",
  "BYTE_TEXT_LAYER_AUTHORITY=LINK",
  "SYMBOLIC_METANOTATION_AUTHORITY=LINK",
  "SOURCE_OBJECT_IDENTITY_AS_LINK=NOT_REQUIRED",
  "HOST_TYPE_INEQUALITY=NOT_AUTHORITY",
  "ENUM_BOOL_IDENTITY_RANKING=NOT_AUTHORITY",
  "PRESENTATION_RENAME=SEMANTICALLY_STABLE",
  "FRESH_MEMORY_WIRE_PARITY=GREEN",
  "JSON_J1=EXACT",
  "ACCEPTED_BOUNDARY_REMOVAL=DIFF",
  "FND01_DEPENDENCY_REMOVAL=DIFF",
  "FND11_DEPENDENCY_REMOVAL=DIFF",
  "SECOND_CARRIER_MUTATION=DIFF",
  "HISTORICAL_EXTERNAL_PROOF=UNCHANGED",
  "NATIVE_PROOF=NOT_CLAIMED",
  "APROVER_ACCEPT=NOT_CLAIMED",
].join(" "));
