import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { readExactSequence } from "../src/exact-sequence.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type RootBasis,
} from "../src/memory.js";
import {
  materializeNativeSyntaxGrammar,
  type NativeSyntaxGrammarRuleSpec,
} from "../src/native-syntax-grammar.js";
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
  if (!value) throw new Error("v0.15 B23 INV-01 candidate FORMAL statement: " + message);
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), message + ": values differ");
}
function sameBytes(actual: Uint8Array, expected: Uint8Array, message: string): void {
  same(actual.length, expected.length, message + ": length");
  for (let i = 0; i < actual.length; i += 1) {
    same(actual[i], expected[i], message + ": byte " + i);
  }
}
function differentBytes(actual: Uint8Array, expected: Uint8Array, message: string): void {
  if (actual.length !== expected.length) return;
  for (let i = 0; i < actual.length; i += 1) if (actual[i] !== expected[i]) return;
  throw new Error("v0.15 B23 INV-01 candidate FORMAL statement: " + message);
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
interface RequirementRow { readonly id: string; readonly state: string; readonly mandatory: boolean; }
function acceptedRequirement(id: string): void {
  const doc = JSON.parse(readFileSync(resolve(repositoryRoot(), "requirements/mts-v0.15.json"), "utf8")) as {
    requirements?: RequirementRow[];
  };
  const row = doc.requirements?.find((item) => item.id === id);
  assert(row !== undefined, "accepted requirement " + id);
  same(row.mandatory, true, id + " mandatory");
  same(row.state, "COMPONENT_GREEN", id + " accepted component state");
}
for (const id of ["V15-ONTO-01", "V15-ONTO-02", "V15-ONTO-03", "V15-STRUCT-01"]) {
  acceptedRequirement(id);
}

interface HistoricalTheorem {
  readonly id: string;
  readonly statement: string;
  readonly dependsOn: readonly string[];
  readonly formalPremises: readonly string[];
  readonly scope: string;
  readonly exclusions: string;
  readonly evidence: {
    readonly lean4: readonly string[];
    readonly coq: readonly string[];
    readonly mtsNative: readonly string[];
    readonly aprover: readonly string[];
  };
}
function historicalInv01(): HistoricalTheorem {
  const doc = JSON.parse(readFileSync(resolve(repositoryRoot(), "theorems/current-v0.14.json"), "utf8")) as {
    theorems?: HistoricalTheorem[];
  };
  const theorem = doc.theorems?.find((item) => item.id === "INV-01");
  assert(theorem !== undefined, "historical INV-01 inventory row");
  same(theorem.statement,
    "Recursive inversion J is defined directly on Link structure by J(A ⟼ B) = J(B) ⟼ J(A), with exact treatment of self-incidence cases.",
    "exact historical statement");
  same(JSON.stringify(theorem.dependsOn), JSON.stringify(["FND-01", "FND-02"]),
    "historical dependencies");
  same(JSON.stringify(theorem.formalPremises), JSON.stringify([
    "A1RecursiveSeparation", "F2F3OneSidedExistence", "RecursiveInversionDomain", "Grounded:x",
  ]), "historical formal premises");
  assert(/finite Grounded/i.test(theorem.scope), "scope retains finite Grounded domain");
  assert(/No all-Link totality claim/i.test(theorem.exclusions), "all-Link totality remains excluded");
  assert(theorem.evidence.lean4.length > 0 && theorem.evidence.coq.length > 0,
    "paired historical external evidence");
  same(theorem.evidence.mtsNative.length, 0, "no historical native proof");
  same(theorem.evidence.aprover.length, 0, "no historical aprover proof");
  return theorem;
}
historicalInv01();

for (const path of ["proofs/evidence/INV-01/lean4.json", "proofs/evidence/INV-01/coq.json"]) {
  const evidence = JSON.parse(readFileSync(resolve(repositoryRoot(), path), "utf8")) as {
    result?: string; authority?: string; assumptions?: string[]; dependencies?: string[]; notes?: string;
  };
  same(evidence.result, "proved", path + " result");
  same(evidence.authority, "external-cross-check", path + " authority");
  same(JSON.stringify(evidence.dependencies), JSON.stringify(["FND-01", "FND-02"]),
    path + " dependencies");
  assert(evidence.notes?.includes("Prop-valued structural graph"), path + " structural relation boundary");
  assert(evidence.notes?.includes("total and functional") && evidence.notes?.includes("exactly one structural inverse"),\n    path + " unique-total boundary");
  assert(evidence.notes?.includes("not as a host enum"), path + " no host enum");
}

const historicalExecutable = readFileSync(
  resolve(repositoryRoot(), "ts/test/research-v013-recursive-link-inversion-a75a.test.ts"), "utf8");
assert(historicalExecutable.includes("J(A ⟼ B) = J(B) ⟼ J(A)"),
  "historical executable witness retains recursive pair law");
assert(historicalExecutable.includes("J(J(X)) returns exact canonical Link identity"),
  "historical executable witness retains involution cross-check without importing INV-02 as premise");
const structuralWitness = readFileSync(
  resolve(repositoryRoot(), "ts/test/v015-direct-structural-aspects-s1.test.ts"), "utf8");
assert(structuralWitness.includes("Start : ♂A") && structuralWitness.includes("End : A♀"),
  "accepted v0.15 direct FORMAL retains START/END structural constructors");
assert(structuralWitness.includes("Pair : A⟼B"),
  "accepted v0.15 direct FORMAL retains PAIR structural constructor");

function compile(f: Fixture, source: string): V015FormalRecursiveCompileResult {
  return compileV015FormalDefinitionsToRecursive(
    f.memory, f.basis, f.grammarRoot, f.namespaceProfileRoot,
    f.definitionProfileRoot, encoder.encode(source),
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

interface RoleNames {
  readonly x: string; readonly y: string; readonly other: string;
  readonly child: string; readonly childInv: string;
  readonly left: string; readonly right: string;
  readonly leftInv: string; readonly rightInv: string;
}
const canonicalNames: RoleNames = Object.freeze({
  x: "X", y: "Y", other: "OTHER", child: "CHILD", childInv: "CHILD_INV",
  left: "LEFT", right: "RIGHT", leftInv: "LEFT_INV", rightInv: "RIGHT_INV",
});
const renamedNames: RoleNames = Object.freeze({
  x: "SOURCE", y: "IMAGE", other: "ALT_IMAGE", child: "SUBLINK", childInv: "SUBLINK_IMAGE",
  left: "POLE_A", right: "POLE_B", leftInv: "IMAGE_A", rightInv: "IMAGE_B",
});

function sourceFor(n: RoleNames): string {
  return [
    "R : R->R", "O : O->R", "C : R->C", "L : O->C", "U : C->O",
    n.x + " : U->L", n.y + " : " + n.x + "->R", n.other + " : " + n.y + "->R",
    n.child + " : " + n.other + "->R", n.childInv + " : " + n.child + "->R",
    n.left + " : " + n.childInv + "->R", n.right + " : " + n.left + "->R",
    n.leftInv + " : " + n.right + "->R", n.rightInv + " : " + n.leftInv + "->R",
    "TAG_SEED : " + n.rightInv + "->O",
    "PREMISE_TAG : TAG_SEED->O", "GROUNDED_TAG : PREMISE_TAG->O",
    "INVERSION_RELATION_TAG : GROUNDED_TAG->O", "START_ONLY_TAG : INVERSION_RELATION_TAG->O",
    "FINISH_ONLY_TAG : START_ONLY_TAG->O", "PAIR_LOCAL_TAG : FINISH_ONLY_TAG->O",
    "FINISH_CHILD_TAG : PAIR_LOCAL_TAG->O", "START_CHILD_TAG : FINISH_CHILD_TAG->O",
    "END_FORM_TAG : START_CHILD_TAG->O", "START_FORM_TAG : END_FORM_TAG->O",
    "UNIQUE_TOTAL_TAG : START_FORM_TAG->O", "IDENTITY_CLAIM_TAG : UNIQUE_TOTAL_TAG->O",
    "A1RecursiveSeparation : PREMISE_TAG->C",
    "F2F3OneSidedExistence : A1RecursiveSeparation->C",
    "RecursiveInversionDomain : F2F3OneSidedExistence->C",
    "GROUNDED_X : GROUNDED_TAG->" + n.x,
    "INV01_PREMISES : [A1RecursiveSeparation,F2F3OneSidedExistence,RecursiveInversionDomain,GROUNDED_X]",
    "ROOT_J_ARGS : [R,R]", "ROOT_J : INVERSION_RELATION_TAG->ROOT_J_ARGS",
    "CHILD_J_ARGS : [" + n.child + "," + n.childInv + "]",
    "CHILD_J : INVERSION_RELATION_TAG->CHILD_J_ARGS",
    "START_ONLY_X : START_ONLY_TAG->" + n.x,
    "FINISH_CHILD_ARGS : [" + n.x + "," + n.child + "]",
    "FINISH_CHILD : FINISH_CHILD_TAG->FINISH_CHILD_ARGS",
    "END_IMAGE_ARGS : [" + n.childInv + "," + n.y + "]",
    "END_IMAGE : END_FORM_TAG->END_IMAGE_ARGS",
    "START_RESULT_ARGS : [" + n.x + "," + n.y + "]",
    "START_RESULT : INVERSION_RELATION_TAG->START_RESULT_ARGS",
    "START_RULE_PREMISES : [START_ONLY_X,FINISH_CHILD,CHILD_J,END_IMAGE]",
    "START_RULE : START_RULE_PREMISES->START_RESULT",
    "FINISH_ONLY_X : FINISH_ONLY_TAG->" + n.x,
    "START_CHILD_ARGS : [" + n.x + "," + n.child + "]",
    "START_CHILD : START_CHILD_TAG->START_CHILD_ARGS",
    "START_IMAGE_ARGS : [" + n.childInv + "," + n.y + "]",
    "START_IMAGE : START_FORM_TAG->START_IMAGE_ARGS",
    "FINISH_RESULT_ARGS : [" + n.x + "," + n.y + "]",
    "FINISH_RESULT : INVERSION_RELATION_TAG->FINISH_RESULT_ARGS",
    "FINISH_RULE_PREMISES : [FINISH_ONLY_X,START_CHILD,CHILD_J,START_IMAGE]",
    "FINISH_RULE : FINISH_RULE_PREMISES->FINISH_RESULT",
    "PAIR_LOCAL_X : PAIR_LOCAL_TAG->" + n.x,
    "LEFT_J_ARGS : [" + n.left + "," + n.leftInv + "]",
    "LEFT_J : INVERSION_RELATION_TAG->LEFT_J_ARGS",
    "RIGHT_J_ARGS : [" + n.right + "," + n.rightInv + "]",
    "RIGHT_J : INVERSION_RELATION_TAG->RIGHT_J_ARGS",
    "PAIR_SOURCE : " + n.left + "->" + n.right,
    "PAIR_IMAGE : " + n.rightInv + "->" + n.leftInv,
    "PAIR_RESULT_ARGS : [PAIR_SOURCE,PAIR_IMAGE]",
    "PAIR_RESULT : INVERSION_RELATION_TAG->PAIR_RESULT_ARGS",
    "PAIR_RULE_PREMISES : [PAIR_LOCAL_X,LEFT_J,RIGHT_J]",
    "PAIR_RULE : PAIR_RULE_PREMISES->PAIR_RESULT",
    "INV01_STRUCTURAL_CASES : [ROOT_J,START_RULE,FINISH_RULE,PAIR_RULE]",
    "J_X_ARGS : [" + n.x + "," + n.y + "]", "J_X : INVERSION_RELATION_TAG->J_X_ARGS",
    "J_OTHER_ARGS : [" + n.x + "," + n.other + "]", "J_OTHER : INVERSION_RELATION_TAG->J_OTHER_ARGS",
    "IDENTITY_ARGS : [" + n.other + "," + n.y + "]",
    "OTHER_IS_Y : IDENTITY_CLAIM_TAG->IDENTITY_ARGS",
    "UNIQUENESS_RULE : J_OTHER->OTHER_IS_Y",
    "UNIQUE_TOTAL_DATA : [" + n.y + ",J_X,UNIQUENESS_RULE]",
    "UNIQUE_TOTAL_J_X : UNIQUE_TOTAL_TAG->UNIQUE_TOTAL_DATA",
    "INV01_CONCLUSION : [INV01_STRUCTURAL_CASES,UNIQUE_TOTAL_J_X]",
    "INV01_STATEMENT : INV01_PREMISES->INV01_CONCLUSION",
  ].join("\n");
}
const source = sourceFor(canonicalNames);
assert(!source.includes("="), "statement metamodel does not execute equality over placeholder roles");

function verifyCandidate(f: Fixture, compiled: V015FormalRecursiveCompileResult, n: RoleNames): void {
  const premises = readExactSequence(f.memory, value(f, compiled, "INV01_PREMISES")).values;
  same(premises.length, 4, "exact historical premise count");
  same(premises[0], value(f, compiled, "A1RecursiveSeparation"), "A1 premise");
  same(premises[1], value(f, compiled, "F2F3OneSidedExistence"), "F2/F3 premise");
  same(premises[2], value(f, compiled, "RecursiveInversionDomain"), "recursive domain premise");
  same(premises[3], value(f, compiled, "GROUNDED_X"), "Grounded:x premise");

  const rootArgs = readExactSequence(f.memory, f.memory.poles(value(f, compiled, "ROOT_J")).end).values;
  same(rootArgs.length, 2, "ROOT image arity");
  same(rootArgs[0], f.basis.R, "J ROOT source");
  same(rootArgs[1], f.basis.R, "J ROOT image");

  const startPremises = readExactSequence(f.memory, value(f, compiled, "START_RULE_PREMISES")).values;
  same(startPremises.length, 4, "START recursion coordinates");
  same(startPremises[0], value(f, compiled, "START_ONLY_X"), "START-only guard");
  same(startPremises[1], value(f, compiled, "FINISH_CHILD"), "START non-self child is finish pole");
  same(startPremises[2], value(f, compiled, "CHILD_J"), "START child recursively inverted");
  same(startPremises[3], value(f, compiled, "END_IMAGE"), "START image is END-form of child image");

  const finishPremises = readExactSequence(f.memory, value(f, compiled, "FINISH_RULE_PREMISES")).values;
  same(finishPremises.length, 4, "END recursion coordinates");
  same(finishPremises[0], value(f, compiled, "FINISH_ONLY_X"), "END-only guard");
  same(finishPremises[1], value(f, compiled, "START_CHILD"), "END non-self child is start pole");
  same(finishPremises[2], value(f, compiled, "CHILD_J"), "END child recursively inverted");
  same(finishPremises[3], value(f, compiled, "START_IMAGE"), "END image is START-form of child image");

  const pairSource = f.memory.poles(value(f, compiled, "PAIR_SOURCE"));
  same(pairSource.start, value(f, compiled, n.left), "PAIR source left pole");
  same(pairSource.end, value(f, compiled, n.right), "PAIR source right pole");
  const pairImage = f.memory.poles(value(f, compiled, "PAIR_IMAGE"));
  same(pairImage.start, value(f, compiled, n.rightInv), "J(PAIR) starts at inverse right pole");
  same(pairImage.end, value(f, compiled, n.leftInv), "J(PAIR) ends at inverse left pole");

  const cases = readExactSequence(f.memory, value(f, compiled, "INV01_STRUCTURAL_CASES")).values;
  same(cases.length, 4, "exact ROOT/START/END/PAIR case count");
  same(cases[0], value(f, compiled, "ROOT_J"), "ROOT case");
  same(cases[1], value(f, compiled, "START_RULE"), "START case");
  same(cases[2], value(f, compiled, "FINISH_RULE"), "END case");
  same(cases[3], value(f, compiled, "PAIR_RULE"), "PAIR case");

  const unique = f.memory.poles(value(f, compiled, "UNIQUE_TOTAL_J_X"));
  same(unique.start, value(f, compiled, "UNIQUE_TOTAL_TAG"), "unique-total proposition tag");
  const uniqueData = readExactSequence(f.memory, unique.end).values;
  same(uniqueData.length, 3, "unique-total payload arity");
  same(uniqueData[0], value(f, compiled, n.y), "existential image role");
  same(uniqueData[1], value(f, compiled, "J_X"), "existence relation");
  same(uniqueData[2], value(f, compiled, "UNIQUENESS_RULE"), "uniqueness relation");

  const statement = f.memory.poles(value(f, compiled, "INV01_STATEMENT"));
  same(statement.start, value(f, compiled, "INV01_PREMISES"), "statement premise carrier");
  same(statement.end, value(f, compiled, "INV01_CONCLUSION"), "statement conclusion carrier");

  const json = encodeV015FormalSourceAsetJson(
    f.memory, f.basis, f.grammarRoot, f.namespaceProfileRoot,
    f.definitionProfileRoot, compiled.source.sourceAset,
  );
  assert(decoder.decode(json).includes('"schema":"' + V015_FORMAL_JSON_J1_SCHEMA + '"'),
    "strict J1 projection");
  const round = decodeV015FormalSourceAsetJson(
    f.memory, f.basis, f.grammarRoot, f.namespaceProfileRoot,
    f.definitionProfileRoot, json,
  );
  same(round.sourceAset, compiled.source.sourceAset, "J1 preserves exact source ANet");
  sameBytes(round.canonicalJson, json, "J1 canonical bytes");
}

const first = fixture();
const compiled = compile(first, source);
verifyCandidate(first, compiled, canonicalNames);

const second = fixture();
const compiledSecond = compile(second, source);
verifyCandidate(second, compiledSecond, canonicalNames);
sameBytes(wire(first, compiled, "INV01_STATEMENT"), wire(second, compiledSecond, "INV01_STATEMENT"),
  "fresh-Memory recursive statement wire");

const renamed = fixture();
const renamedCompiled = compile(renamed, sourceFor(renamedNames));
verifyCandidate(renamed, renamedCompiled, renamedNames);
sameBytes(wire(first, compiled, "INV01_STATEMENT"), wire(renamed, renamedCompiled, "INV01_STATEMENT"),
  "presentation rename preserves theorem statement identity");

{
  const wrong = fixture();
  const mutated = compile(wrong, source.replace(
    "INV01_PREMISES : [A1RecursiveSeparation,F2F3OneSidedExistence,RecursiveInversionDomain,GROUNDED_X]",
    "INV01_PREMISES : [A1RecursiveSeparation,F2F3OneSidedExistence,RecursiveInversionDomain]",
  ));
  differentBytes(wire(first, compiled, "INV01_STATEMENT"), wire(wrong, mutated, "INV01_STATEMENT"),
    "dropping Grounded:x must change statement identity");
}
{
  const wrong = fixture();
  const mutated = compile(wrong, source.replace(
    "PAIR_IMAGE : RIGHT_INV->LEFT_INV",
    "PAIR_IMAGE : LEFT_INV->RIGHT_INV",
  ));
  differentBytes(wire(first, compiled, "INV01_STATEMENT"), wire(wrong, mutated, "INV01_STATEMENT"),
    "removing recursive pair-pole reversal must change statement identity");
}
{
  const wrong = fixture();
  const mutated = compile(wrong, source.replace(
    "INV01_STRUCTURAL_CASES : [ROOT_J,START_RULE,FINISH_RULE,PAIR_RULE]",
    "INV01_STRUCTURAL_CASES : [ROOT_J,FINISH_RULE,PAIR_RULE]",
  ));
  differentBytes(wire(first, compiled, "INV01_STATEMENT"), wire(wrong, mutated, "INV01_STATEMENT"),
    "dropping START case must change statement identity");
}

console.log([
  "MTS v0.15 B23 INV-01 candidate FORMAL statement:",
  "MIGRATION_STATUS=CANDIDATE_NOT_PROMOTED",
  "FORMAL_ARTIFACT_KIND=STATEMENT_ONLY",
  "FORMAL_PREMISES=4_A1+F2F3+RECURSIVE_DOMAIN+GROUNDED_X",
  "FORMAL_DEPENDENCIES=FND-01+FND-02",
  "DOMAIN=FINITE_GROUNDED_DECLARED",
  "J_RELATION=LINK_NATIVE_STRUCTURAL_STATEMENT",
  "ROOT_CASE=R_TO_R",
  "START_CASE=START_TO_END_RECURSIVE",
  "END_CASE=END_TO_START_RECURSIVE",
  "PAIR_CASE=REVERSED_RECURSIVE_POLES",
  "UNIQUE_TOTAL=STRUCTURAL_CLAIM",
  "ALL_LINK_TOTALITY=NOT_CLAIMED",
  "HOST_J_OPCODE=0",
  "CODEC_DIGIT_AUTHORITY=0",
  "PRESENTATION_RENAME=SEMANTICALLY_STABLE",
  "FRESH_MEMORY_WIRE_PARITY=GREEN",
  "JSON_J1=EXACT",
  "GROUNDED_PREMISE_REMOVAL=DIFF",
  "PAIR_REVERSAL_REMOVAL=DIFF",
  "START_CASE_REMOVAL=DIFF",
  "HISTORICAL_EXTERNAL_PROOF=UNCHANGED",
  "INV02_INVOLUTION_AS_PREMISE=0",
  "NATIVE_PROOF=NOT_CLAIMED",
  "APROVER_ACCEPT=NOT_CLAIMED",
].join(" "));
