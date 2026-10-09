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
  if (!value) throw new Error("v0.15 B27 INV-04 candidate FORMAL statement: " + message);
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
  throw new Error("v0.15 B27 INV-04 candidate FORMAL statement: " + message);
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
  const theorem = historical.theorems?.find((item) => item.id === "INV-04");
  assert(theorem !== undefined, "historical INV-04 inventory row");
  same(theorem.statement,
    "Recursive inversion exchanges the two proper one-sided self-incidence orientations without identifying them.",
    "exact historical statement");
  same(JSON.stringify(theorem.dependsOn), JSON.stringify(["INV-01"]), "historical dependency");
  same(JSON.stringify(theorem.formalPremises), JSON.stringify([]), "historical formal premises");
  assert(/Context-relative/i.test(theorem.scope), "context-relative orientation boundary");
  assert(/does not select a Foundation-global absolute START side/i.test(theorem.exclusions),
    "global absolute START remains excluded");
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
for (const path of ["proofs/evidence/INV-04/lean4.json", "proofs/evidence/INV-04/coq.json"]) {
  const evidence = JSON.parse(readFileSync(resolve(repositoryRoot(), path), "utf8")) as {
    result?: string; authority?: string; dependencies?: string[]; notes?: string;
  };
  same(evidence.result, "proved", path + " result");
  same(evidence.authority, "external-cross-check", path + " authority");
  same(JSON.stringify(evidence.dependencies), JSON.stringify(["INV-01"]), path + " dependency");
  assert(evidence.notes?.includes("StartOnly maps to FinishOnly"), path + " START to END boundary");
  assert(evidence.notes?.includes("FinishOnly maps to StartOnly"), path + " END to START boundary");
  assert(evidence.notes?.includes("Source and image are not identified"), path + " distinctness boundary");
  assert(/no Foundation-global absolute orientation/i.test(evidence.notes ?? ""), path + " no global orientation");
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
const renamed: Names = Object.freeze({ x:"SOURCE_SIDE", y:"IMAGE_SIDE" });

function sourceFor(n: Names): string {
  return [
    "R : R->R", "O : O->R", "C : R->C", "L : O->C", "U : C->O",
    n.x + " : U->L", n.y + " : " + n.x + "->R",
    "TAG_SEED : " + n.y + "->O",
    "INVERSION_RELATION_TAG : TAG_SEED->O",
    "START_ONLY_TAG : INVERSION_RELATION_TAG->O",
    "FINISH_ONLY_TAG : START_ONLY_TAG->O",
    "DISTINCT_CLAIM_TAG : FINISH_ONLY_TAG->O",
    "START_ONLY_X : START_ONLY_TAG->" + n.x,
    "FINISH_ONLY_X : FINISH_ONLY_TAG->" + n.x,
    "START_ONLY_Y : START_ONLY_TAG->" + n.y,
    "FINISH_ONLY_Y : FINISH_ONLY_TAG->" + n.y,
    "J_XY_ARGS : [" + n.x + "," + n.y + "]",
    "J_XY : INVERSION_RELATION_TAG->J_XY_ARGS",
    "DISTINCT_XY_ARGS : [" + n.x + "," + n.y + "]",
    "DISTINCT_XY : DISTINCT_CLAIM_TAG->DISTINCT_XY_ARGS",
    "START_TO_FINISH_PREMISES : [START_ONLY_X,J_XY]",
    "START_TO_FINISH_CONCLUSION : [FINISH_ONLY_Y,DISTINCT_XY]",
    "START_TO_FINISH_RULE : START_TO_FINISH_PREMISES->START_TO_FINISH_CONCLUSION",
    "FINISH_TO_START_PREMISES : [FINISH_ONLY_X,J_XY]",
    "FINISH_TO_START_CONCLUSION : [START_ONLY_Y,DISTINCT_XY]",
    "FINISH_TO_START_RULE : FINISH_TO_START_PREMISES->FINISH_TO_START_CONCLUSION",
    "INV04_PREMISES : []",
    "INV04_CONCLUSION : [START_TO_FINISH_RULE,FINISH_TO_START_RULE]",
    "INV04_STATEMENT : INV04_PREMISES->INV04_CONCLUSION",
  ].join("\n");
}
const source = sourceFor(canonical);
assert(!source.includes(" = ") && !source.includes("!="),
  "distinctness is theorem metadata, not a second equality/inequality operator");

function verify(f: Fixture, compiled: V015FormalRecursiveCompileResult, n: Names): void {
  const jArgs = readExactSequence(f.memory, f.memory.poles(value(f, compiled, "J_XY")).end).values;
  same(jArgs.length, 2, "inversion relation arity");
  same(jArgs[0], value(f, compiled, n.x), "inversion source");
  same(jArgs[1], value(f, compiled, n.y), "inversion image");

  const startPremises = readExactSequence(f.memory, value(f, compiled, "START_TO_FINISH_PREMISES")).values;
  same(startPremises.length, 2, "START-side premise arity");
  same(startPremises[0], value(f, compiled, "START_ONLY_X"), "START-side structural guard");
  same(startPremises[1], value(f, compiled, "J_XY"), "START-side inversion relation");
  const startConclusion = readExactSequence(f.memory, value(f, compiled, "START_TO_FINISH_CONCLUSION")).values;
  same(startConclusion.length, 2, "START-side conclusion arity");
  same(startConclusion[0], value(f, compiled, "FINISH_ONLY_Y"), "START image is proper END");
  same(startConclusion[1], value(f, compiled, "DISTINCT_XY"), "START source/image stay distinct");

  const finishPremises = readExactSequence(f.memory, value(f, compiled, "FINISH_TO_START_PREMISES")).values;
  same(finishPremises.length, 2, "END-side premise arity");
  same(finishPremises[0], value(f, compiled, "FINISH_ONLY_X"), "END-side structural guard");
  same(finishPremises[1], value(f, compiled, "J_XY"), "END-side inversion relation");
  const finishConclusion = readExactSequence(f.memory, value(f, compiled, "FINISH_TO_START_CONCLUSION")).values;
  same(finishConclusion.length, 2, "END-side conclusion arity");
  same(finishConclusion[0], value(f, compiled, "START_ONLY_Y"), "END image is proper START");
  same(finishConclusion[1], value(f, compiled, "DISTINCT_XY"), "END source/image stay distinct");

  const premises = readExactSequence(f.memory, value(f, compiled, "INV04_PREMISES")).values;
  same(premises.length, 0, "INV-04 has no independent formal premise");
  const conclusion = readExactSequence(f.memory, value(f, compiled, "INV04_CONCLUSION")).values;
  same(conclusion.length, 2, "INV-04 has both directional exchange rules");
  same(conclusion[0], value(f, compiled, "START_TO_FINISH_RULE"), "START to END rule");
  same(conclusion[1], value(f, compiled, "FINISH_TO_START_RULE"), "END to START rule");

  const statement = f.memory.poles(value(f, compiled, "INV04_STATEMENT"));
  same(statement.start, value(f, compiled, "INV04_PREMISES"), "statement premises");
  same(statement.end, value(f, compiled, "INV04_CONCLUSION"), "statement conclusion");

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
sameBytes(wire(first,compiled,"INV04_STATEMENT"),wire(second,secondCompiled,"INV04_STATEMENT"),
  "fresh-Memory wire parity");
const renamedFixture=fixture(), renamedCompiled=compile(renamedFixture,sourceFor(renamed));
verify(renamedFixture,renamedCompiled,renamed);
sameBytes(wire(first,compiled,"INV04_STATEMENT"),wire(renamedFixture,renamedCompiled,"INV04_STATEMENT"),
  "presentation rename preserves statement identity");

{
  const wrong=fixture();
  const mutated=compile(wrong,source.replace(
    "START_TO_FINISH_CONCLUSION : [FINISH_ONLY_Y,DISTINCT_XY]",
    "START_TO_FINISH_CONCLUSION : [START_ONLY_Y,DISTINCT_XY]",
  ));
  differentBytes(wire(first,compiled,"INV04_STATEMENT"),wire(wrong,mutated,"INV04_STATEMENT"),
    "START must exchange to END, not remain START");
}
{
  const wrong=fixture();
  const mutated=compile(wrong,source.replace(
    "FINISH_TO_START_CONCLUSION : [START_ONLY_Y,DISTINCT_XY]",
    "FINISH_TO_START_CONCLUSION : [FINISH_ONLY_Y,DISTINCT_XY]",
  ));
  differentBytes(wire(first,compiled,"INV04_STATEMENT"),wire(wrong,mutated,"INV04_STATEMENT"),
    "END must exchange to START, not remain END");
}
{
  const wrong=fixture();
  const mutated=compile(wrong,source.replace(
    "START_TO_FINISH_CONCLUSION : [FINISH_ONLY_Y,DISTINCT_XY]",
    "START_TO_FINISH_CONCLUSION : [FINISH_ONLY_Y]",
  ));
  differentBytes(wire(first,compiled,"INV04_STATEMENT"),wire(wrong,mutated,"INV04_STATEMENT"),
    "dropping source/image distinctness must change statement identity");
}

console.log([
  "MTS v0.15 B27 INV-04 candidate FORMAL statement:",
  "MIGRATION_STATUS=CANDIDATE_NOT_PROMOTED",
  "FORMAL_ARTIFACT_KIND=STATEMENT_ONLY",
  "FORMAL_PREMISES=0",
  "FORMAL_DEPENDENCIES=INV-01",
  "START_TO_FINISH=STRUCTURAL_EXCHANGE",
  "FINISH_TO_START=STRUCTURAL_EXCHANGE",
  "SOURCE_IMAGE_DISTINCT=BOTH_DIRECTIONS",
  "GLOBAL_ABSOLUTE_START=NOT_SELECTED",
  "REPRESENTATION_ORDER_AUTHORITY=0",
  "DISTINCTNESS=THEOREM_METADATA_NOT_OPERATOR",
  "PRESENTATION_RENAME=SEMANTICALLY_STABLE",
  "FRESH_MEMORY_WIRE_PARITY=GREEN",
  "JSON_J1=EXACT",
  "START_SAME_CLASS_MUTATION=DIFF",
  "FINISH_SAME_CLASS_MUTATION=DIFF",
  "DISTINCTNESS_REMOVAL=DIFF",
  "HISTORICAL_EXTERNAL_PROOF=UNCHANGED",
  "NATIVE_PROOF=NOT_CLAIMED",
  "APROVER_ACCEPT=NOT_CLAIMED",
].join(" "));
