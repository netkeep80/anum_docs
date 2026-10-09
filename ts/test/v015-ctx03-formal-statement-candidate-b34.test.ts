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
  if (!value) throw new Error("v0.15 B34 CTX-03 candidate FORMAL statement: " + message);
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
  throw new Error("v0.15 B34 CTX-03 candidate FORMAL statement: " + message);
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
    memory, basis,
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
const encoder=new TextEncoder(), decoder=new TextDecoder();
function repositoryRoot(): string {
  const root=[resolve(process.cwd(),".."),process.cwd()].find((candidate)=>
    existsSync(resolve(candidate,"requirements/mts-v0.15.json")));
  assert(root!==undefined,"repository root");
  return root;
}
function readJson(path:string):any {
  return JSON.parse(readFileSync(resolve(repositoryRoot(),path),"utf8"));
}

{
  const historical=readJson("theorems/current-v0.14.json") as {theorems?:{
    id:string;statement:string;dependsOn:string[];formalPremises:string[];
    scope:string;exclusions:string;evidence:{mtsNative:string[];aprover:string[]};
  }[]};
  const theorem=historical.theorems?.find((item)=>item.id==="CTX-03");
  assert(theorem!==undefined,"historical CTX-03 inventory row");
  same(theorem.statement,
    "Objective chirality Ω={W,J(W)} exists before observation; an oriented Context K selects χ(K), inducing local START_K/END_K roles, and relative frame transport g_AB∈{Id,J} composes as Z2.",
    "exact historical statement");
  same(JSON.stringify(theorem.dependsOn),JSON.stringify(["INV-02","INV-07"]),"historical dependencies");
  same(JSON.stringify(theorem.formalPremises),JSON.stringify([
    "A1RecursiveSeparation","F2F3GroundedNormalization","F2F3OneSidedExistence","RecursiveInversionDomain",
  ]),"historical formal premises");
  assert(/Context-relative A4/i.test(theorem.scope),"Context-relative scope");
  for(const exclusion of [
    "Foundation-global selected W","ExactSequence","host boolean","raw InR/OutR presence",
    "four primitive opcodes","stronger arbitrary-Link normalization",
  ]) assert(theorem.exclusions.includes(exclusion),"historical exclusion "+exclusion);
  same(theorem.evidence.mtsNative.length,0,"no historical native proof");
  same(theorem.evidence.aprover.length,0,"no historical aprover proof");
}
{
  const overlay=readJson("theorems/formal-v0.15.json") as {entries?:{id:string;migrationStatus?:string}[]};
  for(const id of ["INV-02","INV-07"]){
    const dependency=overlay.entries?.find((item)=>item.id===id);
    assert(dependency!==undefined,id+" dependency exists");
    same(dependency.migrationStatus,"FORMAL_MIGRATED",id+" dependency is migrated");
  }
}
for(const path of ["proofs/evidence/CTX-03/lean4.json","proofs/evidence/CTX-03/coq.json"]){
  const evidence=readJson(path) as {
    result?:string;authority?:string;dependencies?:string[];assumptions?:string[];notes?:string;
  };
  same(evidence.result,"proved",path+" result");
  same(evidence.authority,"external-cross-check",path+" authority");
  same(JSON.stringify(evidence.assumptions),JSON.stringify([
    "A1RecursiveSeparation","F2F3GroundedNormalization","F2F3OneSidedExistence","RecursiveInversionDomain",
  ]),path+" assumptions");
  same(JSON.stringify(evidence.dependencies),JSON.stringify(["INV-02","INV-07"]),path+" dependencies");
  for(const clause of [
    "objective pre-selection chirality",
    "local START_K/END_K roles",
    "relational Z2 transport",
    "unique chi(K)",
    "generalized-MP semantic-arrow covariance",
    "non-covariant TechnicalStartOperation falsifier",
    "global axiom allowlists remain empty",
    "No Foundation-global selected orientation",
    "host Frame/Gauge/Bool/ExactSequence authority",
    "raw carrier pole order",
    "stronger global arbitrary-Link normalization package is not imported",
  ]) assert(evidence.notes?.includes(clause),path+" boundary "+clause);
}
{
  const contextual=readFileSync(
    resolve(repositoryRoot(),"ts/test/research-v014-context-relative-a4prime.test.ts"),"utf8");
  for(const clause of [
    "Objective chirality exists before any observer/context frame selection.",
    "J swaps A markers",
    "same orientation gives Id transport",
    "opposite orientation gives J transport",
    "g_AB o g_BC = g_AC",
    "J o J = Id",
    "RELATIVE_TRANSPORT_GROUP=Z2",
    "GLOBAL_SELECTED_W_REQUIRED=FALSE",
    "EXACT_SEQUENCE_ORIENTATION_AUTHORITY=FALSE",
  ]) assert(contextual.includes(clause),"historical contextual witness "+clause);
  const gauge=readFileSync(
    resolve(repositoryRoot(),"ts/test/research-v014-orientation-gauge-view.test.ts"),"utf8");
  assert(gauge.includes("TECHNICAL_POLE_POSITIONS=COORDINATES_NOT_SEMANTIC_AUTHORITY"),
    "technical pole positions are not semantic authority");
  assert(gauge.includes("GENERALIZED_MP_STRUCTURAL_SKELETON_COMMUTES_WITH_J=GREEN"),
    "generalized MP covariance witness retained");
}

function compile(f:Fixture,source:string):V015FormalRecursiveCompileResult {
  return compileV015FormalDefinitionsToRecursive(
    f.memory,f.basis,f.grammarRoot,f.namespaceProfileRoot,f.definitionProfileRoot,encoder.encode(source));
}
function value(f:Fixture,c:V015FormalRecursiveCompileResult,name:string):LinkHandle {
  const carrier=materializeV012StringAnum(f.memory,f.basis,encoder.encode(name)).anumLink;
  const d=c.definitions.find((item)=>item.nameCarrier===carrier);
  assert(d!==undefined,"missing definition "+name);
  return d.semantic;
}
function wire(f:Fixture,c:V015FormalRecursiveCompileResult,name:string):Uint8Array {
  const carrier=materializeV012StringAnum(f.memory,f.basis,encoder.encode(name)).anumLink;
  const d=c.definitions.find((item)=>item.nameCarrier===carrier);
  assert(d!==undefined,"missing definition "+name);
  return d.wire;
}
interface Names {
  readonly chi:string;readonly jchi:string;readonly k:string;
  readonly a:string;readonly b:string;readonly c:string;
}
const canonical:Names=Object.freeze({chi:"CHI",jchi:"J_CHI",k:"K",a:"CTX_A",b:"CTX_B",c:"CTX_C"});
const renamed:Names=Object.freeze({
  chi:"ORBIT_MEMBER",jchi:"MIRROR_ORBIT_MEMBER",k:"ORIENTED_CONTEXT",
  a:"FRAME_A",b:"FRAME_B",c:"FRAME_C"
});

function sourceFor(n:Names):string {
  return [
    "R : R->R","O : O->R","C : R->C","L : O->C","U : C->O",
    n.chi+" : U->L",n.jchi+" : "+n.chi+"->R",n.k+" : "+n.jchi+"->O",
    n.a+" : "+n.k+"->R",n.b+" : "+n.a+"->R",n.c+" : "+n.b+"->R",
    "TAG_SEED : "+n.c+"->O",
    "PREMISE_TAG : TAG_SEED->O",
    "INVERSION_RELATION_TAG : PREMISE_TAG->O",
    "DISTINCT_CLAIM_TAG : INVERSION_RELATION_TAG->O",
    "CONTEXT_SELECTION_TAG : DISTINCT_CLAIM_TAG->O",
    "LOCAL_START_TAG : CONTEXT_SELECTION_TAG->O",
    "LOCAL_END_TAG : LOCAL_START_TAG->O",
    "TRANSPORT_TAG : LOCAL_END_TAG->O",
    "COMPOSITION_TAG : TRANSPORT_TAG->O",
    "ID_ELEMENT : COMPOSITION_TAG->O",
    "J_ELEMENT : ID_ELEMENT->O",
    "A1_PREMISE : PREMISE_TAG->R",
    "GROUNDED_NORMALIZATION_PREMISE : PREMISE_TAG->O",
    "ONE_SIDED_EXISTENCE_PREMISE : PREMISE_TAG->C",
    "RECURSIVE_INVERSION_DOMAIN_PREMISE : PREMISE_TAG->L",
    "CTX03_PREMISES : [A1_PREMISE,GROUNDED_NORMALIZATION_PREMISE,ONE_SIDED_EXISTENCE_PREMISE,RECURSIVE_INVERSION_DOMAIN_PREMISE]",
    "J_CHI_ARGS : ["+n.chi+","+n.jchi+"]",
    "J_CHI_RELATION : INVERSION_RELATION_TAG->J_CHI_ARGS",
    "J_JCHI_ARGS : ["+n.jchi+","+n.chi+"]",
    "J_JCHI_RELATION : INVERSION_RELATION_TAG->J_JCHI_ARGS",
    "CHIRAL_ORBIT : ["+n.chi+","+n.jchi+"]",
    "DISTINCT_ORBIT_ARGS : ["+n.chi+","+n.jchi+"]",
    "DISTINCT_ORBIT : DISTINCT_CLAIM_TAG->DISTINCT_ORBIT_ARGS",
    "CHI_SELECTION_ARGS : ["+n.k+","+n.chi+"]",
    "CHI_SELECTION : CONTEXT_SELECTION_TAG->CHI_SELECTION_ARGS",
    "START_K_ARGS : ["+n.k+","+n.chi+"]",
    "START_K : LOCAL_START_TAG->START_K_ARGS",
    "END_K_ARGS : ["+n.k+","+n.jchi+"]",
    "END_K : LOCAL_END_TAG->END_K_ARGS",
    "TRANSPORT_ELEMENTS : [ID_ELEMENT,J_ELEMENT]",
    "G_AB_ARGS : ["+n.a+","+n.b+",ID_ELEMENT]",
    "G_AB : TRANSPORT_TAG->G_AB_ARGS",
    "G_BC_ARGS : ["+n.b+","+n.c+",J_ELEMENT]",
    "G_BC : TRANSPORT_TAG->G_BC_ARGS",
    "G_AC_ARGS : ["+n.a+","+n.c+",J_ELEMENT]",
    "G_AC : TRANSPORT_TAG->G_AC_ARGS",
    "COMPOSE_ID_ID_ARGS : [ID_ELEMENT,ID_ELEMENT,ID_ELEMENT]",
    "COMPOSE_ID_ID : COMPOSITION_TAG->COMPOSE_ID_ID_ARGS",
    "COMPOSE_ID_J_ARGS : [ID_ELEMENT,J_ELEMENT,J_ELEMENT]",
    "COMPOSE_ID_J : COMPOSITION_TAG->COMPOSE_ID_J_ARGS",
    "COMPOSE_J_ID_ARGS : [J_ELEMENT,ID_ELEMENT,J_ELEMENT]",
    "COMPOSE_J_ID : COMPOSITION_TAG->COMPOSE_J_ID_ARGS",
    "COMPOSE_J_J_ARGS : [J_ELEMENT,J_ELEMENT,ID_ELEMENT]",
    "COMPOSE_J_J : COMPOSITION_TAG->COMPOSE_J_J_ARGS",
    "TRANSPORT_COMPOSITION_WITNESS : [G_AB,G_BC,G_AC]",
    "CTX03_CONCLUSION : [CHIRAL_ORBIT,DISTINCT_ORBIT,J_CHI_RELATION,J_JCHI_RELATION,CHI_SELECTION,START_K,END_K,TRANSPORT_ELEMENTS,COMPOSE_ID_ID,COMPOSE_ID_J,COMPOSE_J_ID,COMPOSE_J_J,TRANSPORT_COMPOSITION_WITNESS]",
    "CTX03_STATEMENT : CTX03_PREMISES->CTX03_CONCLUSION",
  ].join("\n");
}
const source=sourceFor(canonical);

function seq(f:Fixture,c:V015FormalRecursiveCompileResult,name:string):readonly LinkHandle[]{
  return readExactSequence(f.memory,value(f,c,name)).values;
}
function relationArgs(f:Fixture,c:V015FormalRecursiveCompileResult,name:string):readonly LinkHandle[]{
  return readExactSequence(f.memory,f.memory.poles(value(f,c,name)).end).values;
}
function verify(f:Fixture,c:V015FormalRecursiveCompileResult,n:Names):void {
  const premises=seq(f,c,"CTX03_PREMISES");
  same(premises.length,4,"four explicit historical premises");

  const orbit=seq(f,c,"CHIRAL_ORBIT");
  same(orbit.length,2,"objective chiral orbit cardinality");
  same(orbit[0],value(f,c,n.chi),"first orbit member");
  same(orbit[1],value(f,c,n.jchi),"mirror orbit member");
  const distinct=relationArgs(f,c,"DISTINCT_ORBIT");
  same(distinct.length,2,"objective chiral distinction arity");
  same(distinct[0],value(f,c,n.chi),"distinct orbit source");
  same(distinct[1],value(f,c,n.jchi),"distinct orbit mirror");

  const j1=relationArgs(f,c,"J_CHI_RELATION");
  const j2=relationArgs(f,c,"J_JCHI_RELATION");
  same(j1[0],value(f,c,n.chi),"J source");
  same(j1[1],value(f,c,n.jchi),"J image");
  same(j2[0],value(f,c,n.jchi),"J² intermediate");
  same(j2[1],value(f,c,n.chi),"J² returns source");

  const selection=relationArgs(f,c,"CHI_SELECTION");
  same(selection[0],value(f,c,n.k),"Context selects local chi");
  same(selection[1],value(f,c,n.chi),"selected chi belongs to objective orbit");

  const start=relationArgs(f,c,"START_K"), end=relationArgs(f,c,"END_K");
  same(start[0],value(f,c,n.k),"START_K Context");
  same(end[0],value(f,c,n.k),"END_K Context");
  same(start[1],value(f,c,n.chi),"START_K local orbit member");
  same(end[1],value(f,c,n.jchi),"END_K opposite local orbit member");
  same(start[1],distinct[0],"START_K uses one distinguished orbit member");
  same(end[1],distinct[1],"END_K uses the opposite distinguished orbit member");

  const elements=seq(f,c,"TRANSPORT_ELEMENTS");
  same(elements.length,2,"relative transport has exactly Id/J witnesses");
  same(elements[0],value(f,c,"ID_ELEMENT"),"Id transport element");
  same(elements[1],value(f,c,"J_ELEMENT"),"J transport element");

  const expected=[
    ["COMPOSE_ID_ID","ID_ELEMENT","ID_ELEMENT","ID_ELEMENT"],
    ["COMPOSE_ID_J","ID_ELEMENT","J_ELEMENT","J_ELEMENT"],
    ["COMPOSE_J_ID","J_ELEMENT","ID_ELEMENT","J_ELEMENT"],
    ["COMPOSE_J_J","J_ELEMENT","J_ELEMENT","ID_ELEMENT"],
  ] as const;
  for(const [name,left,right,result] of expected){
    const args=relationArgs(f,c,name);
    same(args.length,3,name+" arity");
    same(args[0],value(f,c,left),name+" left");
    same(args[1],value(f,c,right),name+" right");
    same(args[2],value(f,c,result),name+" result");
  }

  const gab=relationArgs(f,c,"G_AB"),gbc=relationArgs(f,c,"G_BC"),gac=relationArgs(f,c,"G_AC");
  same(gab[2],value(f,c,"ID_ELEMENT"),"same-frame transport is Id");
  same(gbc[2],value(f,c,"J_ELEMENT"),"mirror transport is J");
  same(gac[2],value(f,c,"J_ELEMENT"),"composition matches relative transport");

  const statement=f.memory.poles(value(f,c,"CTX03_STATEMENT"));
  same(statement.start,value(f,c,"CTX03_PREMISES"),"statement premises");
  same(statement.end,value(f,c,"CTX03_CONCLUSION"),"statement conclusion");

  const json=encodeV015FormalSourceAsetJson(
    f.memory,f.basis,f.grammarRoot,f.namespaceProfileRoot,f.definitionProfileRoot,c.source.sourceAset);
  assert(decoder.decode(json).includes('"schema":"' + V015_FORMAL_JSON_J1_SCHEMA + '"'),"strict J1 projection");
  const round=decodeV015FormalSourceAsetJson(
    f.memory,f.basis,f.grammarRoot,f.namespaceProfileRoot,f.definitionProfileRoot,json);
  same(round.sourceAset,c.source.sourceAset,"J1 preserves source ANet");
  sameBytes(round.canonicalJson,json,"J1 canonical bytes");
}

const first=fixture(),compiled=compile(first,source);verify(first,compiled,canonical);
const second=fixture(),secondCompiled=compile(second,source);verify(second,secondCompiled,canonical);
sameBytes(wire(first,compiled,"CTX03_STATEMENT"),wire(second,secondCompiled,"CTX03_STATEMENT"),
  "fresh-Memory wire parity");
const renamedFixture=fixture(),renamedCompiled=compile(renamedFixture,sourceFor(renamed));
verify(renamedFixture,renamedCompiled,renamed);
sameBytes(wire(first,compiled,"CTX03_STATEMENT"),wire(renamedFixture,renamedCompiled,"CTX03_STATEMENT"),
  "presentation rename preserves statement identity");

for(const [from,to,label] of [
  ["CTX03_PREMISES : [A1_PREMISE,GROUNDED_NORMALIZATION_PREMISE,ONE_SIDED_EXISTENCE_PREMISE,RECURSIVE_INVERSION_DOMAIN_PREMISE]",
   "CTX03_PREMISES : [GROUNDED_NORMALIZATION_PREMISE,ONE_SIDED_EXISTENCE_PREMISE,RECURSIVE_INVERSION_DOMAIN_PREMISE]",
   "A1 premise must remain explicit"],
  ["CHIRAL_ORBIT : [CHI,J_CHI]","CHIRAL_ORBIT : [CHI,CHI]","objective chiral orbit must not collapse"],
  ["J_JCHI_ARGS : [J_CHI,CHI]","J_JCHI_ARGS : [J_CHI,J_CHI]","J² must return original orbit member"],
  ["END_K_ARGS : [K,J_CHI]","END_K_ARGS : [K,CHI]","local START_K/END_K must remain distinct"],
  ["COMPOSE_J_J_ARGS : [J_ELEMENT,J_ELEMENT,ID_ELEMENT]",
   "COMPOSE_J_J_ARGS : [J_ELEMENT,J_ELEMENT,J_ELEMENT]",
   "Z2 requires J composed with J to be Id"],
  ["G_AC_ARGS : [CTX_A,CTX_C,J_ELEMENT]","G_AC_ARGS : [CTX_A,CTX_C,ID_ELEMENT]",
   "relative transport composition must agree with g_AB o g_BC"],
] as const){
  const wrong=fixture();
  const mutated=compile(wrong,source.replace(from,to));
  differentBytes(wire(first,compiled,"CTX03_STATEMENT"),wire(wrong,mutated,"CTX03_STATEMENT"),label);
}

console.log([
  "MTS v0.15 B34 CTX-03 candidate FORMAL statement:",
  "MIGRATION_STATUS=CANDIDATE_NOT_PROMOTED",
  "FORMAL_ARTIFACT_KIND=STATEMENT_ONLY",
  "FORMAL_PREMISES=4",
  "FORMAL_DEPENDENCIES=INV-02+INV-07",
  "OBJECTIVE_CHIRAL_ORBIT=PRE_OBSERVER",
  "CHIRAL_ORBIT=CHI_PLUS_J_CHI_DISTINCT",
  "J2=RETURNS_ORBIT_MEMBER",
  "CONTEXT_K_SELECTS_CHI=TRUE",
  "LOCAL_START_END=CONTEXT_RELATIVE_DISTINCT",
  "RELATIVE_TRANSPORT_ELEMENTS=ID+J",
  "RELATIVE_TRANSPORT_GROUP=Z2",
  "TRANSPORT_COMPOSITION=GREEN",
  "FOUNDATION_GLOBAL_SELECTED_W=NOT_CLAIMED",
  "EXACT_SEQUENCE_ORIENTATION_AUTHORITY=FALSE",
  "HOST_FRAME_GAUGE_BOOL_AUTHORITY=FALSE",
  "RAW_POLE_ORDER_AUTHORITY=FALSE",
  "FOUR_PRIMITIVE_OPCODES_AUTHORITY=FALSE",
  "SECOND_ONTOLOGY_ENTITY=NOT_INTRODUCED",
  "GLOBAL_ARBITRARY_LINK_NORMALIZATION=NOT_IMPORTED",
  "PRESENTATION_RENAME=SEMANTICALLY_STABLE",
  "FRESH_MEMORY_WIRE_PARITY=GREEN",
  "JSON_J1=EXACT",
  "A1_PREMISE_REMOVAL=DIFF",
  "CHIRAL_ORBIT_COLLAPSE=DIFF",
  "INVOLUTION_MUTATION=DIFF",
  "LOCAL_ROLE_COLLAPSE=DIFF",
  "Z2_JJ_MUTATION=DIFF",
  "TRANSPORT_COMPOSITION_MUTATION=DIFF",
  "HISTORICAL_EXTERNAL_PROOF=UNCHANGED",
  "NATIVE_PROOF=NOT_CLAIMED",
  "APROVER_ACCEPT=NOT_CLAIMED",
].join(" "));
