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
  if (!value) throw new Error("v0.15 B32 INV-06 candidate FORMAL statement: " + message);
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
  throw new Error("v0.15 B32 INV-06 candidate FORMAL statement: " + message);
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
  const theorem = historical.theorems?.find((item) => item.id === "INV-06");
  assert(theorem !== undefined, "historical INV-06 inventory row");
  same(theorem.statement,
    "On the accepted root basis, J fixes R, exchanges O/C under the chosen orientation, and fixes L/U structurally.",
    "exact historical statement");
  same(JSON.stringify(theorem.dependsOn), JSON.stringify(["INV-03", "INV-04", "INV-05"]),
    "historical dependencies");
  same(JSON.stringify(theorem.formalPremises), JSON.stringify([]), "historical formal premises");
  assert(/orientation labels are not absolute ontology/i.test(theorem.scope), "Context-relative orientation boundary");
  assert(/not a proof of full Theory automorphism/i.test(theorem.exclusions), "full-Theory automorphism excluded");
  same(theorem.evidence.mtsNative.length, 0, "no historical native proof");
  same(theorem.evidence.aprover.length, 0, "no historical aprover proof");
}
{
  const overlay = readJson("theorems/formal-v0.15.json") as { entries?: { id: string; migrationStatus?: string }[] };
  for (const id of ["INV-03", "INV-04", "INV-05"]) {
    const dependency = overlay.entries?.find((item) => item.id === id);
    assert(dependency !== undefined, id + " dependency exists");
    same(dependency.migrationStatus, "FORMAL_MIGRATED", id + " dependency is migrated");
  }
}
for (const path of ["proofs/evidence/INV-06/lean4.json", "proofs/evidence/INV-06/coq.json"]) {
  const evidence = readJson(path) as {
    result?: string; authority?: string; dependencies?: string[]; notes?: string;
  };
  same(evidence.result, "proved", path + " result");
  same(evidence.authority, "external-cross-check", path + " authority");
  same(JSON.stringify(evidence.dependencies), JSON.stringify(["INV-03", "INV-04", "INV-05"]),
    path + " dependencies");
  for (const clause of ["J(R)=R", "J(O)=C", "J(C)=O", "J(L)=L", "J(U)=U"]) {
    assert(evidence.notes?.includes(clause), path + " " + clause);
  }
  assert(evidence.notes?.includes("Context-relative orientation"), path + " Context-relative orientation");
  assert(evidence.notes?.includes("No RootBasis ontology datatype"), path + " no RootBasis ontology");
  assert(evidence.notes?.includes("full-Theory automorphism claim"), path + " no full Theory automorphism");
  assert(evidence.notes?.includes("stronger global arbitrary-Link normalization package is not imported"),
    path + " no stronger global normalization");
}
{
  const witness = readFileSync(
    resolve(repositoryRoot(), "ts/test/research-v013-recursive-link-inversion-a75a.test.ts"), "utf8",
  );
  for (const clause of ['"J(R)=R"', '"J(O)=C"', '"J(C)=O"', '"J(L)=L"', '"J(U)=U"']) {
    assert(witness.includes(clause), "historical executable basis witness " + clause);
  }
  assert(witness.includes("INV_06_ROOT_BASIS=R_FIXED_O_C_EXCHANGED_L_FIXED_U_FIXED"),
    "historical INV-06 marker");
  assert(witness.includes("FULL_MTS_AUTOMORPHISM=NOT_YET_CLASSIFIED"),
    "historical full automorphism nonclaim");
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
  readonly jr: string; readonly jo: string; readonly jc: string; readonly jl: string; readonly ju: string;
}
const canonical: Names = Object.freeze({ jr:"J_R", jo:"J_O", jc:"J_C", jl:"J_L", ju:"J_U" });
const renamed: Names = Object.freeze({
  jr:"ROOT_IMAGE_RELATION", jo:"START_IMAGE_RELATION", jc:"END_IMAGE_RELATION",
  jl:"L_IMAGE_RELATION", ju:"U_IMAGE_RELATION",
});

function sourceFor(n: Names): string {
  return [
    "R : R->R", "O : O->R", "C : R->C", "L : O->C", "U : C->O",
    "TAG_SEED : U->L",
    "INVERSION_RELATION_TAG : TAG_SEED->O",
    "J_R_ARGS : [R,R]",
    n.jr + " : INVERSION_RELATION_TAG->J_R_ARGS",
    "J_O_ARGS : [O,C]",
    n.jo + " : INVERSION_RELATION_TAG->J_O_ARGS",
    "J_C_ARGS : [C,O]",
    n.jc + " : INVERSION_RELATION_TAG->J_C_ARGS",
    "J_L_ARGS : [L,L]",
    n.jl + " : INVERSION_RELATION_TAG->J_L_ARGS",
    "J_U_ARGS : [U,U]",
    n.ju + " : INVERSION_RELATION_TAG->J_U_ARGS",
    "INV06_PREMISES : []",
    "INV06_CONCLUSION : [" + n.jr + "," + n.jo + "," + n.jc + "," + n.jl + "," + n.ju + "]",
    "INV06_STATEMENT : INV06_PREMISES->INV06_CONCLUSION",
  ].join("\n");
}
const source = sourceFor(canonical);

function relationArgs(f: Fixture, compiled: V015FormalRecursiveCompileResult, relation: string): readonly LinkHandle[] {
  return readExactSequence(f.memory, f.memory.poles(value(f, compiled, relation)).end).values;
}
function verify(f: Fixture, compiled: V015FormalRecursiveCompileResult, n: Names): void {
  const expected = [
    [n.jr, "R", "R"],
    [n.jo, "O", "C"],
    [n.jc, "C", "O"],
    [n.jl, "L", "L"],
    [n.ju, "U", "U"],
  ] as const;
  for (const [relation, sourceName, imageName] of expected) {
    const args = relationArgs(f, compiled, relation);
    same(args.length, 2, relation + " arity");
    same(args[0], value(f, compiled, sourceName), relation + " source");
    same(args[1], value(f, compiled, imageName), relation + " image");
  }

  const premises = readExactSequence(f.memory, value(f, compiled, "INV06_PREMISES")).values;
  same(premises.length, 0, "INV-06 has no independent formal premise");
  const conclusion = readExactSequence(f.memory, value(f, compiled, "INV06_CONCLUSION")).values;
  same(conclusion.length, 5, "root-basis image has five clauses");
  same(conclusion[0], value(f, compiled, n.jr), "J(R) clause");
  same(conclusion[1], value(f, compiled, n.jo), "J(O) clause");
  same(conclusion[2], value(f, compiled, n.jc), "J(C) clause");
  same(conclusion[3], value(f, compiled, n.jl), "J(L) clause");
  same(conclusion[4], value(f, compiled, n.ju), "J(U) clause");

  const statement = f.memory.poles(value(f, compiled, "INV06_STATEMENT"));
  same(statement.start, value(f, compiled, "INV06_PREMISES"), "statement premises");
  same(statement.end, value(f, compiled, "INV06_CONCLUSION"), "statement conclusion");

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
sameBytes(wire(first,compiled,"INV06_STATEMENT"),wire(second,secondCompiled,"INV06_STATEMENT"),
  "fresh-Memory wire parity");

const renamedFixture=fixture(), renamedCompiled=compile(renamedFixture,sourceFor(renamed));
verify(renamedFixture,renamedCompiled,renamed);
sameBytes(wire(first,compiled,"INV06_STATEMENT"),wire(renamedFixture,renamedCompiled,"INV06_STATEMENT"),
  "presentation rename preserves statement identity");

for (const [from, to, label] of [
  ["J_R_ARGS : [R,R]", "J_R_ARGS : [R,O]", "R must remain fixed"],
  ["J_O_ARGS : [O,C]", "J_O_ARGS : [O,O]", "O must map to C"],
  ["J_C_ARGS : [C,O]", "J_C_ARGS : [C,C]", "C must map to O"],
  ["J_L_ARGS : [L,L]", "J_L_ARGS : [L,U]", "L must remain fixed"],
  ["J_U_ARGS : [U,U]", "J_U_ARGS : [U,L]", "U must remain fixed"],
] as const) {
  const wrong=fixture();
  const mutated=compile(wrong,source.replace(from,to));
  differentBytes(wire(first,compiled,"INV06_STATEMENT"),wire(wrong,mutated,"INV06_STATEMENT"),label);
}

console.log([
  "MTS v0.15 B32 INV-06 FORMAL statement:",
  "MIGRATION_STATUS=FORMAL_MIGRATED",
  "FORMAL_ARTIFACT_KIND=STATEMENT_ONLY",
  "FORMAL_PREMISES=0",
  "FORMAL_DEPENDENCIES=INV-03+INV-04+INV-05",
  "ROOT_BASIS_JR=R",
  "ROOT_BASIS_JO=C",
  "ROOT_BASIS_JC=O",
  "ROOT_BASIS_JL=L",
  "ROOT_BASIS_JU=U",
  "ORIENTATION=CONTEXT_RELATIVE",
  "ROOT_BASIS_ONTOLOGY_DATATYPE=NOT_CLAIMED",
  "FOUNDATION_GLOBAL_ABSOLUTE_START=NOT_CLAIMED",
  "OBSERVER_AUTHORITY=NOT_CLAIMED",
  "FULL_THEORY_AUTOMORPHISM=NOT_CLAIMED",
  "GLOBAL_ARBITRARY_LINK_NORMALIZATION=NOT_IMPORTED",
  "PRESENTATION_RENAME=SEMANTICALLY_STABLE",
  "FRESH_MEMORY_WIRE_PARITY=GREEN",
  "JSON_J1=EXACT",
  "ROOT_FIXED_MUTATION=DIFF",
  "O_TO_C_MUTATION=DIFF",
  "C_TO_O_MUTATION=DIFF",
  "L_FIXED_MUTATION=DIFF",
  "U_FIXED_MUTATION=DIFF",
  "HISTORICAL_EXTERNAL_PROOF=UNCHANGED",
  "NATIVE_PROOF=NOT_CLAIMED",
  "APROVER_ACCEPT=NOT_CLAIMED",
].join(" "));
