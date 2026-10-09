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
  if (!value) throw new Error("v0.15 B33 INV-07 candidate FORMAL statement: " + message);
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
  throw new Error("v0.15 B33 INV-07 candidate FORMAL statement: " + message);
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
    evidence: { mtsNative: string[]; aprover: string[] };
  }[] };
  const theorem = historical.theorems?.find((item) => item.id === "INV-07");
  assert(theorem !== undefined, "historical INV-07 inventory row");
  same(theorem.statement,
    "Objective chirality survives inversion: J reverses orientation while preserving the structural distinction between the two one-sided self-incidence classes.",
    "exact historical statement");
  same(JSON.stringify(theorem.dependsOn), JSON.stringify(["INV-02", "INV-04", "INV-05"]),
    "historical dependencies");
  same(JSON.stringify(theorem.formalPremises), JSON.stringify([]), "historical formal premises");
  assert(/chirality\/orientation structure/i.test(theorem.scope), "chirality scope");
  assert(/not a globally privileged orientation selected by an observer/i.test(theorem.exclusions),
    "global observer orientation excluded");
  same(theorem.evidence.mtsNative.length, 0, "no historical native proof");
  same(theorem.evidence.aprover.length, 0, "no historical aprover proof");
}
{
  const overlay = readJson("theorems/formal-v0.15.json") as { entries?: { id: string; migrationStatus?: string }[] };
  for (const id of ["INV-02", "INV-04", "INV-05"]) {
    const dependency = overlay.entries?.find((item) => item.id === id);
    assert(dependency !== undefined, id + " dependency exists");
    same(dependency.migrationStatus, "FORMAL_MIGRATED", id + " dependency is migrated");
  }
}
for (const path of ["proofs/evidence/INV-07/lean4.json", "proofs/evidence/INV-07/coq.json"]) {
  const evidence = readJson(path) as {
    result?: string; authority?: string; dependencies?: string[]; notes?: string;
  };
  same(evidence.result, "proved", path + " result");
  same(evidence.authority, "external-cross-check", path + " authority");
  same(JSON.stringify(evidence.dependencies), JSON.stringify(["INV-02", "INV-04", "INV-05"]),
    path + " dependencies");
  assert(evidence.notes?.includes("exchanges proper StartOnly/FinishOnly classes without identification"),
    path + " one-sided exchange without collapse");
  assert(evidence.notes?.includes("INV-02 returns a second inversion to the original Link"),
    path + " involution reuse");
  assert(evidence.notes?.includes("INV-05 preserves PairLocal"), path + " PAIR preservation reuse");
  assert(evidence.notes?.includes("without selecting a Foundation-global absolute orientation"),
    path + " no global absolute orientation");
  assert(evidence.notes?.includes("observer semantic primitive"), path + " no observer primitive");
  assert(evidence.notes?.includes("prover-side projection machinery only"), path + " host prover boundary");
}
{
  const witness = readFileSync(
    resolve(repositoryRoot(), "ts/test/research-v013-recursive-link-inversion-a75a.test.ts"), "utf8",
  );
  assert(witness.includes("proper START maps to proper END"), "historical START-to-END witness");
  assert(witness.includes("proper END maps to proper START"), "historical END-to-START witness");
  assert(witness.includes("recursive inversion does not collapse opposite orientations"),
    "historical non-collapse witness");
  assert(witness.includes("INV_07_CHIRALITY=PRESERVED_UNDER_ORIENTATION_REVERSAL"),
    "historical INV-07 marker");

  const contextual = readFileSync(
    resolve(repositoryRoot(), "ts/test/research-v014-context-relative-a4prime.test.ts"), "utf8",
  );
  assert(contextual.includes("Objective chirality exists before any observer/context frame selection."),
    "objective chirality precedes observer");
  assert(contextual.includes("No global authority is"), "context choice does not become global authority");
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

interface Names { readonly x: string; readonly y: string; }
const canonical: Names = Object.freeze({ x:"X", y:"Y" });
const renamed: Names = Object.freeze({ x:"SOURCE_LINK", y:"INVERTED_LINK" });

function sourceFor(n: Names): string {
  return [
    "R : R->R", "O : O->R", "C : R->C", "L : O->C", "U : C->O",
    n.x + " : U->L", n.y + " : " + n.x + "->R",
    "TAG_SEED : " + n.y + "->O",
    "INVERSION_RELATION_TAG : TAG_SEED->O",
    "START_ONLY_TAG : INVERSION_RELATION_TAG->O",
    "FINISH_ONLY_TAG : START_ONLY_TAG->O",
    "PAIR_TAG : FINISH_ONLY_TAG->O",
    "NON_PAIR_TAG : PAIR_TAG->O",
    "DISTINCT_CLAIM_TAG : NON_PAIR_TAG->O",
    "START_ONLY_X : START_ONLY_TAG->" + n.x,
    "FINISH_ONLY_Y : FINISH_ONLY_TAG->" + n.y,
    "J_XY_ARGS : [" + n.x + "," + n.y + "]",
    "J_XY : INVERSION_RELATION_TAG->J_XY_ARGS",
    "J_YX_ARGS : [" + n.y + "," + n.x + "]",
    "J_YX : INVERSION_RELATION_TAG->J_YX_ARGS",
    "DISTINCT_XY_ARGS : [" + n.x + "," + n.y + "]",
    "DISTINCT_XY : DISTINCT_CLAIM_TAG->DISTINCT_XY_ARGS",
    "PAIR_SOURCE_ARGS : [" + n.x + "," + n.y + "]",
    "PAIR_SOURCE : PAIR_TAG->PAIR_SOURCE_ARGS",
    "PAIR_IMAGE_ARGS : [" + n.y + "," + n.x + "]",
    "PAIR_IMAGE : PAIR_TAG->PAIR_IMAGE_ARGS",
    "ORIENTATION_REVERSAL_WITNESS : [START_ONLY_X,FINISH_ONLY_Y,J_XY]",
    "INVOLUTION_WITNESS : [J_XY,J_YX]",
    "PAIR_PRESERVATION_WITNESS : [PAIR_SOURCE,PAIR_IMAGE]",
    "CHIRALITY_WITNESS : [ORIENTATION_REVERSAL_WITNESS,INVOLUTION_WITNESS,DISTINCT_XY,PAIR_PRESERVATION_WITNESS]",
    "INV07_PREMISES : []",
    "INV07_CONCLUSION : [CHIRALITY_WITNESS]",
    "INV07_STATEMENT : INV07_PREMISES->INV07_CONCLUSION",
  ].join("\n");
}
const source=sourceFor(canonical);

function verify(f: Fixture, compiled: V015FormalRecursiveCompileResult, n: Names): void {
  const reversal=readExactSequence(f.memory,value(f,compiled,"ORIENTATION_REVERSAL_WITNESS")).values;
  same(reversal.length,3,"orientation reversal witness arity");
  same(reversal[0],value(f,compiled,"START_ONLY_X"),"source belongs to one one-sided class");
  same(reversal[1],value(f,compiled,"FINISH_ONLY_Y"),"image belongs to opposite one-sided class");
  same(reversal[2],value(f,compiled,"J_XY"),"reversal is carried by J");

  const jxy=readExactSequence(f.memory,f.memory.poles(value(f,compiled,"J_XY")).end).values;
  same(jxy[0],value(f,compiled,n.x),"J source");
  same(jxy[1],value(f,compiled,n.y),"J image");
  const jyx=readExactSequence(f.memory,f.memory.poles(value(f,compiled,"J_YX")).end).values;
  same(jyx[0],value(f,compiled,n.y),"J² intermediate");
  same(jyx[1],value(f,compiled,n.x),"J² returns source");

  const distinct=readExactSequence(f.memory,f.memory.poles(value(f,compiled,"DISTINCT_XY")).end).values;
  same(distinct[0],value(f,compiled,n.x),"distinct source");
  same(distinct[1],value(f,compiled,n.y),"distinct image");

  for (const name of ["PAIR_SOURCE","PAIR_IMAGE"]) {
    same(f.memory.poles(value(f,compiled,name)).start,value(f,compiled,"PAIR_TAG"),name+" remains PAIR");
  }
  const pairWitness=readExactSequence(f.memory,value(f,compiled,"PAIR_PRESERVATION_WITNESS")).values;
  same(pairWitness.length,2,"PAIR preservation witness arity");

  const premises=readExactSequence(f.memory,value(f,compiled,"INV07_PREMISES")).values;
  same(premises.length,0,"INV-07 has no independent formal premise");
  const conclusion=readExactSequence(f.memory,value(f,compiled,"INV07_CONCLUSION")).values;
  same(conclusion.length,1,"INV-07 conclusion arity");
  same(conclusion[0],value(f,compiled,"CHIRALITY_WITNESS"),"objective chirality witness");

  const statement=f.memory.poles(value(f,compiled,"INV07_STATEMENT"));
  same(statement.start,value(f,compiled,"INV07_PREMISES"),"statement premises");
  same(statement.end,value(f,compiled,"INV07_CONCLUSION"),"statement conclusion");

  const json=encodeV015FormalSourceAsetJson(
    f.memory,f.basis,f.grammarRoot,f.namespaceProfileRoot,f.definitionProfileRoot,compiled.source.sourceAset,
  );
  assert(decoder.decode(json).includes('"schema":"' + V015_FORMAL_JSON_J1_SCHEMA + '"'),"strict J1 projection");
  const round=decodeV015FormalSourceAsetJson(
    f.memory,f.basis,f.grammarRoot,f.namespaceProfileRoot,f.definitionProfileRoot,json,
  );
  same(round.sourceAset,compiled.source.sourceAset,"J1 preserves source ANet");
  sameBytes(round.canonicalJson,json,"J1 canonical bytes");
}

const first=fixture(),compiled=compile(first,source);verify(first,compiled,canonical);
const second=fixture(),secondCompiled=compile(second,source);verify(second,secondCompiled,canonical);
sameBytes(wire(first,compiled,"INV07_STATEMENT"),wire(second,secondCompiled,"INV07_STATEMENT"),
  "fresh-Memory wire parity");
const renamedFixture=fixture(),renamedCompiled=compile(renamedFixture,sourceFor(renamed));
verify(renamedFixture,renamedCompiled,renamed);
sameBytes(wire(first,compiled,"INV07_STATEMENT"),wire(renamedFixture,renamedCompiled,"INV07_STATEMENT"),
  "presentation rename preserves statement identity");

for (const [from,to,label] of [
  ["FINISH_ONLY_Y : FINISH_ONLY_TAG->Y","FINISH_ONLY_Y : START_ONLY_TAG->Y","opposite class must remain distinct"],
  ["J_YX_ARGS : [Y,X]","J_YX_ARGS : [Y,Y]","second inversion must return source"],
  ["CHIRALITY_WITNESS : [ORIENTATION_REVERSAL_WITNESS,INVOLUTION_WITNESS,DISTINCT_XY,PAIR_PRESERVATION_WITNESS]",
   "CHIRALITY_WITNESS : [ORIENTATION_REVERSAL_WITNESS,INVOLUTION_WITNESS,PAIR_PRESERVATION_WITNESS]",
   "chirality must not collapse opposite classes"],
  ["PAIR_IMAGE : PAIR_TAG->PAIR_IMAGE_ARGS","PAIR_IMAGE : NON_PAIR_TAG->PAIR_IMAGE_ARGS",
   "PAIR class preservation must remain"],
] as const) {
  const wrong=fixture();
  const mutated=compile(wrong,source.replace(from,to));
  differentBytes(wire(first,compiled,"INV07_STATEMENT"),wire(wrong,mutated,"INV07_STATEMENT"),label);
}

console.log([
  "MTS v0.15 B33 INV-07 FORMAL statement:",
  "MIGRATION_STATUS=FORMAL_MIGRATED",
  "FORMAL_ARTIFACT_KIND=STATEMENT_ONLY",
  "FORMAL_PREMISES=0",
  "FORMAL_DEPENDENCIES=INV-02+INV-04+INV-05",
  "CHIRALITY=OBJECTIVE_STRUCTURAL_DISTINCTION",
  "J_ORIENTATION=REVERSED",
  "ONE_SIDED_CLASSES=EXCHANGED_NOT_COLLAPSED",
  "J2=RETURNS_SOURCE",
  "PAIR_CLASS=PRESERVED",
  "FOUNDATION_GLOBAL_ABSOLUTE_ORIENTATION=NOT_CLAIMED",
  "OBSERVER_SEMANTIC_PRIMITIVE=NOT_CLAIMED",
  "PROVER_TYPE_PROP_RECORD=NOT_SEMANTIC_AUTHORITY",
  "GLOBAL_ARBITRARY_LINK_NORMALIZATION=NOT_IMPORTED",
  "PRESENTATION_RENAME=SEMANTICALLY_STABLE",
  "FRESH_MEMORY_WIRE_PARITY=GREEN",
  "JSON_J1=EXACT",
  "ONE_SIDED_CLASS_COLLAPSE_MUTATION=DIFF",
  "INVOLUTION_MUTATION=DIFF",
  "DISTINCTION_REMOVAL=DIFF",
  "PAIR_CLASS_MUTATION=DIFF",
  "HISTORICAL_EXTERNAL_PROOF=UNCHANGED",
  "NATIVE_PROOF=NOT_CLAIMED",
  "APROVER_ACCEPT=NOT_CLAIMED",
].join(" "));
