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
  if (!value) throw new Error("v0.15 B25 INV-03 candidate FORMAL statement: " + message);
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
  throw new Error("v0.15 B25 INV-03 candidate FORMAL statement: " + message);
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

{
  const historical = JSON.parse(
    readFileSync(resolve(repositoryRoot(), "theorems/current-v0.14.json"), "utf8"),
  ) as { theorems?: {
    id: string; statement: string; dependsOn: string[]; formalPremises: string[];
    scope: string; exclusions: string; evidence: { lean4: string[]; coq: string[]; mtsNative: string[]; aprover: string[] };
  }[] };
  const theorem = historical.theorems?.find((item) => item.id === "INV-03");
  assert(theorem !== undefined, "historical INV-03 inventory row");
  same(theorem.statement, "ROOT is fixed by recursive inversion.", "exact historical statement");
  same(JSON.stringify(theorem.dependsOn), JSON.stringify(["INV-01"]), "historical dependency");
  same(JSON.stringify(theorem.formalPremises), JSON.stringify([]), "historical formal premises");
  same(theorem.scope, "Declared recursive inversion domain.", "historical scope");
  same(theorem.evidence.mtsNative.length, 0, "no historical native proof");
  same(theorem.evidence.aprover.length, 0, "no historical aprover proof");
}
{
  const overlay = JSON.parse(
    readFileSync(resolve(repositoryRoot(), "theorems/formal-v0.15.json"), "utf8"),
  ) as { entries?: { id: string; migrationStatus?: string }[] };
  const dependency = overlay.entries?.find((item) => item.id === "INV-01");
  assert(dependency !== undefined, "INV-01 dependency exists");
  same(dependency.migrationStatus, "FORMAL_MIGRATED", "INV-01 dependency is migrated");
}
for (const path of ["proofs/evidence/INV-03/lean4.json", "proofs/evidence/INV-03/coq.json"]) {
  const evidence = JSON.parse(readFileSync(resolve(repositoryRoot(), path), "utf8")) as {
    result?: string; authority?: string; dependencies?: string[]; notes?: string;
  };
  same(evidence.result, "proved", path + " result");
  same(evidence.authority, "external-cross-check", path + " authority");
  same(JSON.stringify(evidence.dependencies), JSON.stringify(["INV-01"]), path + " dependency");
  assert(evidence.notes?.includes("ROOT") && evidence.notes?.includes("R~J~R"), path + " root fixed-point boundary");
  assert(/No host inverse function/i.test(evidence.notes ?? ""), path + " no host inverse authority");
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

interface Names { readonly R: string; readonly O: string; readonly C: string; readonly L: string; readonly U: string; }
const canonical: Names = Object.freeze({ R:"R", O:"O", C:"C", L:"L", U:"U" });
const renamed: Names = Object.freeze({
  R:"ROOT_NAME", O:"START_SIDE_NAME", C:"END_SIDE_NAME", L:"FORWARD_PAIR_NAME", U:"REVERSE_PAIR_NAME",
});
function sourceFor(n: Names): string {
  return [
    n.R+" : "+n.R+"->"+n.R,
    n.O+" : "+n.O+"->"+n.R,
    n.C+" : "+n.R+"->"+n.C,
    n.L+" : "+n.O+"->"+n.C,
    n.U+" : "+n.C+"->"+n.O,
    "INVERSION_RELATION_TAG : "+n.U+"->"+n.L,
    "ROOT_J_ARGS : ["+n.R+","+n.R+"]",
    "ROOT_J : INVERSION_RELATION_TAG->ROOT_J_ARGS",
    "INV03_PREMISES : []",
    "INV03_CONCLUSION : [ROOT_J]",
    "INV03_STATEMENT : INV03_PREMISES->INV03_CONCLUSION",
  ].join("\n");
}
const source = sourceFor(canonical);

function verify(f: Fixture, compiled: V015FormalRecursiveCompileResult, n: Names): void {
  same(value(f, compiled, n.R), f.basis.R, "ROOT denotation");
  const args = readExactSequence(f.memory, f.memory.poles(value(f, compiled, "ROOT_J")).end).values;
  same(args.length, 2, "root inversion relation arity");
  same(args[0], f.basis.R, "root inversion source");
  same(args[1], f.basis.R, "root inversion image");
  const premises = readExactSequence(f.memory, value(f, compiled, "INV03_PREMISES")).values;
  same(premises.length, 0, "INV-03 has no independent formal premise");
  const conclusion = readExactSequence(f.memory, value(f, compiled, "INV03_CONCLUSION")).values;
  same(conclusion.length, 1, "INV-03 conclusion arity");
  same(conclusion[0], value(f, compiled, "ROOT_J"), "conclusion is ROOT fixed-point relation");
  const statement = f.memory.poles(value(f, compiled, "INV03_STATEMENT"));
  same(statement.start, value(f, compiled, "INV03_PREMISES"), "statement premises");
  same(statement.end, value(f, compiled, "INV03_CONCLUSION"), "statement conclusion");

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
sameBytes(wire(first,compiled,"INV03_STATEMENT"),wire(second,secondCompiled,"INV03_STATEMENT"),"fresh-Memory wire parity");
const renamedFixture=fixture(), renamedCompiled=compile(renamedFixture,sourceFor(renamed));
verify(renamedFixture,renamedCompiled,renamed);
sameBytes(wire(first,compiled,"INV03_STATEMENT"),wire(renamedFixture,renamedCompiled,"INV03_STATEMENT"),
  "presentation rename preserves statement identity");

{
  const wrong=fixture();
  const mutated=compile(wrong,source.replace("ROOT_J_ARGS : [R,R]","ROOT_J_ARGS : [R,O]"));
  differentBytes(wire(first,compiled,"INV03_STATEMENT"),wire(wrong,mutated,"INV03_STATEMENT"),
    "changing ROOT image must change statement identity");
}

console.log([
  "MTS v0.15 B25 INV-03 candidate FORMAL statement:",
  "MIGRATION_STATUS=CANDIDATE_NOT_PROMOTED",
  "FORMAL_ARTIFACT_KIND=STATEMENT_ONLY",
  "FORMAL_PREMISES=0",
  "FORMAL_DEPENDENCIES=INV-01",
  "ROOT_FIXED_POINT=R_J_R",
  "J_RELATION=LINK_NATIVE_STRUCTURAL_STATEMENT",
  "PRESENTATION_RENAME=SEMANTICALLY_STABLE",
  "FRESH_MEMORY_WIRE_PARITY=GREEN",
  "JSON_J1=EXACT",
  "ROOT_IMAGE_MUTATION=DIFF",
  "HISTORICAL_EXTERNAL_PROOF=UNCHANGED",
  "NATIVE_PROOF=NOT_CLAIMED",
  "APROVER_ACCEPT=NOT_CLAIMED",
].join(" "));
