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
  if (!value) throw new Error("v0.15 B30 INV-05 candidate FORMAL statement: " + message);
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
  throw new Error("v0.15 B30 INV-05 candidate FORMAL statement: " + message);
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
    scope: string; exclusions: string;
    evidence: { typescript: string[]; lean4: string[]; coq: string[]; mtsNative: string[]; aprover: string[] };
  }[] };
  const theorem = historical.theorems?.find((item) => item.id === "INV-05");
  assert(theorem !== undefined, "historical INV-05 inventory row");
  same(theorem.statement,
    "PAIR remains in the PAIR class under recursive inversion while its poles are recursively exchanged.",
    "exact historical statement");
  same(JSON.stringify(theorem.dependsOn), JSON.stringify(["INV-01", "INV-02", "INV-04"]),
    "historical dependencies");
  same(JSON.stringify(theorem.formalPremises), JSON.stringify([]), "historical formal premises");
  assert(/finite Grounded recursive inversion domain/i.test(theorem.scope), "bounded Grounded domain");
  assert(/no independent pair-preservation axiom/i.test(theorem.exclusions),
    "independent pair-preservation axiom excluded");
  assert(/no .*global arbitrary-Link extensionality/i.test(theorem.exclusions),
    "global arbitrary-Link extensionality excluded");
  same(theorem.evidence.mtsNative.length, 0, "no historical native proof");
  same(theorem.evidence.aprover.length, 0, "no historical aprover proof");
}
{
  const overlay = JSON.parse(
    readFileSync(resolve(repositoryRoot(), "theorems/formal-v0.15.json"), "utf8"),
  ) as { entries?: { id: string; migrationStatus?: string }[] };
  for (const id of ["INV-01", "INV-02", "INV-04"]) {
    const dependency = overlay.entries?.find((item) => item.id === id);
    assert(dependency !== undefined, id + " dependency exists");
    same(dependency.migrationStatus, "FORMAL_MIGRATED", id + " dependency is migrated");
  }
}
for (const path of ["proofs/evidence/INV-05/lean4.json", "proofs/evidence/INV-05/coq.json"]) {
  const evidence = JSON.parse(readFileSync(resolve(repositoryRoot(), path), "utf8")) as {
    result?: string; authority?: string; dependencies?: string[]; notes?: string;
  };
  same(evidence.result, "proved", path + " result");
  same(evidence.authority, "external-cross-check", path + " authority");
  same(JSON.stringify(evidence.dependencies), JSON.stringify(["INV-01", "INV-02", "INV-04"]),
    path + " dependencies");
  assert(evidence.notes?.includes("PAIR source remains PairLocal"), path + " PAIR-class boundary");
  assert(evidence.notes?.includes("poles are recursively exchanged"), path + " pole-exchange boundary");
  assert(evidence.notes?.includes("INV-02 involution"), path + " INV-02 reuse");
  assert(evidence.notes?.includes("INV-04 one-sided exchange"), path + " INV-04 reuse");
  assert(evidence.notes?.includes("pole reversal comes from INV-01"), path + " INV-01 reuse");
  assert(/No pairPreserved field/i.test(evidence.notes ?? ""), path + " no new pair axiom");
  assert(/global arbitrary-Link extensionality/i.test(evidence.notes ?? ""), path + " no global extensionality");
}
{
  const historicalWitness = readFileSync(
    resolve(repositoryRoot(), "ts/test/research-v013-recursive-link-inversion-a75a.test.ts"), "utf8",
  );
  assert(historicalWitness.includes("PAIR(A,B) maps exactly to PAIR(J(B),J(A))"),
    "historical executable witness keeps exact recursive pole reversal");
  assert(historicalWitness.includes("INV_05_PAIR=RECURSIVE_POLE_REVERSAL"),
    "historical executable witness exposes INV-05 marker");
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
  readonly a: string; readonly b: string; readonly ja: string; readonly jb: string;
}
const canonical: Names = Object.freeze({ a:"A", b:"B", ja:"JA", jb:"JB" });
const renamed: Names = Object.freeze({
  a:"LEFT_SOURCE", b:"RIGHT_SOURCE", ja:"LEFT_IMAGE", jb:"RIGHT_IMAGE",
});

function sourceFor(n: Names): string {
  return [
    "R : R->R", "O : O->R", "C : R->C", "L : O->C", "U : C->O",
    n.a + " : U->L", n.b + " : " + n.a + "->R",
    n.ja + " : " + n.b + "->R", n.jb + " : " + n.ja + "->R",
    "TAG_SEED : " + n.jb + "->O",
    "PAIR_TAG : TAG_SEED->O",
    "NON_PAIR_TAG : PAIR_TAG->O",
    "INVERSION_RELATION_TAG : NON_PAIR_TAG->O",
    "SOURCE_PAIR_ARGS : [" + n.a + "," + n.b + "]",
    "SOURCE_PAIR : PAIR_TAG->SOURCE_PAIR_ARGS",
    "IMAGE_PAIR_ARGS : [" + n.jb + "," + n.ja + "]",
    "IMAGE_PAIR : PAIR_TAG->IMAGE_PAIR_ARGS",
    "J_A_JA_ARGS : [" + n.a + "," + n.ja + "]",
    "J_A_JA : INVERSION_RELATION_TAG->J_A_JA_ARGS",
    "J_B_JB_ARGS : [" + n.b + "," + n.jb + "]",
    "J_B_JB : INVERSION_RELATION_TAG->J_B_JB_ARGS",
    "J_PAIR_ARGS : [SOURCE_PAIR,IMAGE_PAIR]",
    "J_PAIR : INVERSION_RELATION_TAG->J_PAIR_ARGS",
    "INV05_WITNESS : [SOURCE_PAIR,IMAGE_PAIR,J_A_JA,J_B_JB,J_PAIR]",
    "INV05_PREMISES : []",
    "INV05_CONCLUSION : [INV05_WITNESS]",
    "INV05_STATEMENT : INV05_PREMISES->INV05_CONCLUSION",
  ].join("\n");
}
const source = sourceFor(canonical);

function verify(f: Fixture, compiled: V015FormalRecursiveCompileResult, n: Names): void {
  const sourcePair = f.memory.poles(value(f, compiled, "SOURCE_PAIR"));
  same(sourcePair.start, value(f, compiled, "PAIR_TAG"), "source classified as PAIR");
  const sourceArgs = readExactSequence(f.memory, sourcePair.end).values;
  same(sourceArgs.length, 2, "source PAIR arity");
  same(sourceArgs[0], value(f, compiled, n.a), "source left pole");
  same(sourceArgs[1], value(f, compiled, n.b), "source right pole");

  const imagePair = f.memory.poles(value(f, compiled, "IMAGE_PAIR"));
  same(imagePair.start, value(f, compiled, "PAIR_TAG"), "image remains PAIR");
  const imageArgs = readExactSequence(f.memory, imagePair.end).values;
  same(imageArgs.length, 2, "image PAIR arity");
  same(imageArgs[0], value(f, compiled, n.jb), "image left pole is J(B)");
  same(imageArgs[1], value(f, compiled, n.ja), "image right pole is J(A)");

  const jaArgs = readExactSequence(f.memory, f.memory.poles(value(f, compiled, "J_A_JA")).end).values;
  same(jaArgs[0], value(f, compiled, n.a), "J(A) source");
  same(jaArgs[1], value(f, compiled, n.ja), "J(A) image");
  const jbArgs = readExactSequence(f.memory, f.memory.poles(value(f, compiled, "J_B_JB")).end).values;
  same(jbArgs[0], value(f, compiled, n.b), "J(B) source");
  same(jbArgs[1], value(f, compiled, n.jb), "J(B) image");

  const pairJ = readExactSequence(f.memory, f.memory.poles(value(f, compiled, "J_PAIR")).end).values;
  same(pairJ.length, 2, "PAIR inversion relation arity");
  same(pairJ[0], value(f, compiled, "SOURCE_PAIR"), "PAIR inversion source");
  same(pairJ[1], value(f, compiled, "IMAGE_PAIR"), "PAIR inversion image");

  const premises = readExactSequence(f.memory, value(f, compiled, "INV05_PREMISES")).values;
  same(premises.length, 0, "INV-05 has no independent formal premise");
  const conclusion = readExactSequence(f.memory, value(f, compiled, "INV05_CONCLUSION")).values;
  same(conclusion.length, 1, "INV-05 conclusion arity");
  same(conclusion[0], value(f, compiled, "INV05_WITNESS"), "conclusion carries PAIR witness");

  const statement = f.memory.poles(value(f, compiled, "INV05_STATEMENT"));
  same(statement.start, value(f, compiled, "INV05_PREMISES"), "statement premises");
  same(statement.end, value(f, compiled, "INV05_CONCLUSION"), "statement conclusion");

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
sameBytes(wire(first,compiled,"INV05_STATEMENT"),wire(second,secondCompiled,"INV05_STATEMENT"),
  "fresh-Memory wire parity");

const renamedFixture=fixture(), renamedCompiled=compile(renamedFixture,sourceFor(renamed));
verify(renamedFixture,renamedCompiled,renamed);
sameBytes(wire(first,compiled,"INV05_STATEMENT"),wire(renamedFixture,renamedCompiled,"INV05_STATEMENT"),
  "presentation rename preserves statement identity");

{
  const wrong=fixture();
  const mutated=compile(wrong,source.replace("IMAGE_PAIR_ARGS : [JB,JA]","IMAGE_PAIR_ARGS : [JA,JB]"));
  differentBytes(wire(first,compiled,"INV05_STATEMENT"),wire(wrong,mutated,"INV05_STATEMENT"),
    "PAIR poles must reverse after recursive child inversion");
}
{
  const wrong=fixture();
  const mutated=compile(wrong,source.replace("IMAGE_PAIR : PAIR_TAG->IMAGE_PAIR_ARGS","IMAGE_PAIR : NON_PAIR_TAG->IMAGE_PAIR_ARGS"));
  differentBytes(wire(first,compiled,"INV05_STATEMENT"),wire(wrong,mutated,"INV05_STATEMENT"),
    "inverted PAIR must remain in the PAIR class");
}
{
  const wrong=fixture();
  const mutated=compile(wrong,source.replace("J_A_JA_ARGS : [A,JA]","J_A_JA_ARGS : [A,JB]"));
  differentBytes(wire(first,compiled,"INV05_STATEMENT"),wire(wrong,mutated,"INV05_STATEMENT"),
    "left child must retain its own recursive inversion relation");
}

console.log([
  "MTS v0.15 B30 INV-05 FORMAL statement:",
  "MIGRATION_STATUS=FORMAL_MIGRATED",
  "FORMAL_ARTIFACT_KIND=STATEMENT_ONLY",
  "FORMAL_PREMISES=0",
  "FORMAL_DEPENDENCIES=INV-01+INV-02+INV-04",
  "DOMAIN=DECLARED_FINITE_GROUNDED_RECURSIVE_INVERSION",
  "SOURCE_CLASS=PAIR",
  "IMAGE_CLASS=PAIR",
  "PAIR_IMAGE=PAIR_OF_JB_JA",
  "PAIR_POLES=RECURSIVELY_EXCHANGED",
  "INDEPENDENT_PAIR_PRESERVATION_AXIOM=0",
  "GLOBAL_ARBITRARY_LINK_EXTENSIONALITY=NOT_CLAIMED",
  "HOST_INVERSE_FUNCTION=0",
  "REPRESENTATION_ORDER_AUTHORITY=0",
  "PRESENTATION_RENAME=SEMANTICALLY_STABLE",
  "FRESH_MEMORY_WIRE_PARITY=GREEN",
  "JSON_J1=EXACT",
  "NON_REVERSED_POLES_MUTATION=DIFF",
  "NON_PAIR_IMAGE_MUTATION=DIFF",
  "CHILD_INVERSION_MUTATION=DIFF",
  "HISTORICAL_EXTERNAL_PROOF=UNCHANGED",
  "NATIVE_PROOF=NOT_CLAIMED",
  "APROVER_ACCEPT=NOT_CLAIMED",
].join(" "));
