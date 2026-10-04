import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { readExactSequence } from "../src/exact-sequence.js";
import { Memory, ensureRootBasis, type LinkHandle, type RootBasis } from "../src/memory.js";
import { materializeNativeSyntaxGrammar, type NativeSyntaxGrammarRuleSpec } from "../src/native-syntax-grammar.js";
import { materializeSourceNamespaceProfile } from "../src/source-namespace.js";
import { decodeV015FormalSourceAsetJson, encodeV015FormalSourceAsetJson } from "../src/v015-formal-decoder.js";
import { compileV015FormalDefinitionsToRecursive, type V015FormalRecursiveCompileResult } from "../src/v015-formal-recursive-compiler.js";
import { materializeV015LinkDefinitionProfile } from "../src/v015-link-definition.js";
import { materializeV012StringAnum } from "../src/v012-string-anum.js";
import { defineStructuralRoleDictionary, readStructuralRoleDictionary } from "../src/structural-rule.js";
import { instantiateV013StructuralTemplate } from "../src/v013-structural-execution.js";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error("v0.15 B18 FND-01 FORMAL statement: " + message);
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), message + ": values differ");
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
  const rules: NativeSyntaxGrammarRuleSpec[] = [
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

const encoder = new TextEncoder(), decoder = new TextDecoder();
interface FormalOverlayEntry {
  readonly id: string;
  readonly migrationStatus: string;
  readonly proofClosure: string;
  readonly formalArtifactKind: string;
  readonly formalStatement: string;
  readonly formalPremises: readonly string[];
  readonly formalDependencies?: readonly string[];
  readonly formalDomain?: readonly string[];
  readonly formalExistentialDomain?: readonly string[];
  readonly formalNonPremises?: readonly string[];
  readonly formalSourcePath: string;
  readonly aproverStatus: string;
}

function repositoryRoot(): string {
  const root = [resolve(process.cwd(), ".."), process.cwd()].find((candidate) =>
    existsSync(resolve(candidate, "theorems/formal-v0.15.json")));
  assert(root !== undefined, "repository root");
  return root;
}
function formalOverlayEntry(id: string): FormalOverlayEntry {
  const overlay = JSON.parse(
    readFileSync(resolve(repositoryRoot(), "theorems/formal-v0.15.json"), "utf8"),
  ) as { entries?: FormalOverlayEntry[] };
  const entry = overlay.entries?.find((candidate) => candidate.id === id);
  assert(entry !== undefined, "FORMAL overlay entry " + id);
  return entry;
}
const fnd01Formal = formalOverlayEntry("FND-01");

function compile(f: Fixture, source: string): V015FormalRecursiveCompileResult {
  return compileV015FormalDefinitionsToRecursive(
    f.memory, f.basis, f.grammarRoot, f.namespaceProfileRoot,
    f.definitionProfileRoot, encoder.encode(source),
  );
}
function nameCarrier(f: Fixture, name: string): LinkHandle {
  return materializeV012StringAnum(f.memory, f.basis, encoder.encode(name)).anumLink;
}
function value(f: Fixture, result: V015FormalRecursiveCompileResult, name: string): LinkHandle {
  const carrier = nameCarrier(f, name);
  const definition = result.definitions.find((candidate) => candidate.nameCarrier === carrier);
  assert(definition !== undefined, "missing definition " + name);
  return definition.semantic;
}
function seq(f: Fixture, result: V015FormalRecursiveCompileResult, name: string): readonly LinkHandle[] {
  return readExactSequence(f.memory, value(f, result, name)).values;
}
function inst(f: Fixture, template: LinkHandle, role: LinkHandle, candidate: LinkHandle): LinkHandle {
  return instantiateV013StructuralTemplate(f.memory, template, [{ role, value: candidate }]);
}

function fnd01Source(x: string, sw: string, fw: string, pw: string): string {
  return [
    "R : R->R", "O : O->R", "C : R->C", "L : O->C", "U : C->O",
    x + " : U->L", sw + " : L->U", fw + " : " + sw + "->R", pw + " : " + fw + "->R",
    "TAG_SEED : " + pw + "->O", "LINK_DOMAIN_TAG : TAG_SEED->O",
    "FULL_SELF_TAG : LINK_DOMAIN_TAG->O", "ROOT_ID_TAG : FULL_SELF_TAG->O",
    "LOCAL_SELF_DECISION_TAG : ROOT_ID_TAG->O", "START_ONLY_TAG : LOCAL_SELF_DECISION_TAG->O",
    "FINISH_ONLY_TAG : START_ONLY_TAG->O", "PAIR_LOCAL_TAG : FINISH_ONLY_TAG->O",
    "EXHAUSTIVE_TAG : PAIR_LOCAL_TAG->O", "EXCLUSIVE_TAG : EXHAUSTIVE_TAG->O",
    "GROUNDED_TAG : EXCLUSIVE_TAG->O", "EXISTS_TAG : GROUNDED_TAG->O",
    "DEPENDENCY_TAG : EXISTS_TAG->O",
    "A1RecursiveSeparation : DEPENDENCY_TAG->C",
    "F2F3OneSidedExistence : A1RecursiveSeparation->C",
    "DOMAIN_X : LINK_DOMAIN_TAG->" + x,
    "LOCAL_SELF_DECISION : LOCAL_SELF_DECISION_TAG->" + x,
    "FND01_PREMISES : [A1RecursiveSeparation,F2F3OneSidedExistence,LOCAL_SELF_DECISION]",
    "FULL_SELF_X : FULL_SELF_TAG->" + x, "ROOT_ID_XR_ARGS : [" + x + ",R]",
    "ROOT_ID_XR : ROOT_ID_TAG->ROOT_ID_XR_ARGS",
    "FND02_DEPENDENCY_RULE : FULL_SELF_X->ROOT_ID_XR",
    "FND02_DEPENDENCY_REF : DEPENDENCY_TAG->FND02_DEPENDENCY_RULE",
    "FND01_DEPENDENCIES : [FND02_DEPENDENCY_REF]",
    "START_ONLY_X : START_ONLY_TAG->" + x, "FINISH_ONLY_X : FINISH_ONLY_TAG->" + x,
    "PAIR_LOCAL_X : PAIR_LOCAL_TAG->" + x,
    "LOCAL_CASES : [FULL_SELF_X,START_ONLY_X,FINISH_ONLY_X,PAIR_LOCAL_X]",
    "C1_EXHAUSTIVE : EXHAUSTIVE_TAG->LOCAL_CASES", "C1_EXCLUSIVE : EXCLUSIVE_TAG->LOCAL_CASES",
    "C1_ROOT_BRANCH : FULL_SELF_X->ROOT_ID_XR",
    "FND01_C1 : [C1_EXHAUSTIVE,C1_EXCLUSIVE,C1_ROOT_BRANCH]",
    "FULL_SELF_ROOT : FULL_SELF_TAG->R",
    "EXISTENTIAL_ROLES : [" + sw + "," + fw + "," + pw + "]",
    "GROUNDED_START_WITNESS : GROUNDED_TAG->" + sw,
    "GROUNDED_FINISH_WITNESS : GROUNDED_TAG->" + fw,
    "GROUNDED_PAIR_WITNESS : GROUNDED_TAG->" + pw,
    "START_ONLY_WITNESS : START_ONLY_TAG->" + sw,
    "FINISH_ONLY_WITNESS : FINISH_ONLY_TAG->" + fw,
    "PAIR_LOCAL_WITNESS : PAIR_LOCAL_TAG->" + pw,
    "EXISTENTIAL_BODY : [GROUNDED_START_WITNESS,GROUNDED_FINISH_WITNESS,GROUNDED_PAIR_WITNESS,START_ONLY_WITNESS,FINISH_ONLY_WITNESS,PAIR_LOCAL_WITNESS]",
    "EXISTENTIAL_DATA : [EXISTENTIAL_ROLES,EXISTENTIAL_BODY]",
    "EXISTENTIAL_WITNESSES : EXISTS_TAG->EXISTENTIAL_DATA",
    "FND01_C2 : [FULL_SELF_ROOT,EXISTENTIAL_WITNESSES]",
    "FND01_CONCLUSION : [FND01_C1,FND01_C2]", fnd01Formal.formalStatement,
    "OUTER_ROLES : [" + x + "]", "VALUE_A : FND01_CONCLUSION->R", "VALUE_B : VALUE_A->R",
  ].join("\n");
}
function freeSameSpellingSource(): string {
  return [
    "R : R->R", "O : O->R", "C : R->C", "L : O->C", "U : C->O",
    "X : R->U", "START_WITNESS : C->R", "FREE_TAG : U->R",
    "FREE_ARGS : [X,START_WITNESS]", "FREE_CLAIM : FREE_TAG->FREE_ARGS",
  ].join("\n");
}

function inspectInstance(
  f: Fixture, result: V015FormalRecursiveCompileResult, statement: LinkHandle,
  outerRole: LinkHandle, candidate: LinkHandle, label: string,
): void {
  const binding = [{ role: outerRole, value: candidate }] as const;
  const theorem = f.memory.poles(statement);
  const premises = readExactSequence(f.memory, theorem.start).values;
  same(premises.length, 3, label + " exact premise count");
  same(premises[0], value(f, result, "A1RecursiveSeparation"), label + " A1 premise");
  same(premises[1], value(f, result, "F2F3OneSidedExistence"), label + " F2/F3 premise");
  same(premises[2], f.memory.ensure(value(f, result, "LOCAL_SELF_DECISION_TAG"), candidate),
    label + " LocalSelfDecision:x");

  const conclusion = readExactSequence(f.memory, theorem.end).values;
  same(conclusion.length, 2, label + " C1/C2 arity");
  same(conclusion[0], instantiateV013StructuralTemplate(f.memory, value(f, result, "FND01_C1"), binding),
    label + " exact C1");
  same(conclusion[1], value(f, result, "FND01_C2"),
    label + " C2 stays independent of outer x substitution");

  const c1 = readExactSequence(f.memory, conclusion[0]!).values;
  same(c1.length, 3, label + " C1 coordinate count");
  for (const [index, name] of ["C1_EXHAUSTIVE", "C1_EXCLUSIVE", "C1_ROOT_BRANCH"].entries()) {
    same(c1[index], instantiateV013StructuralTemplate(f.memory, value(f, result, name), binding),
      label + " exact C1 coordinate " + name);
  }

  const c2 = readExactSequence(f.memory, conclusion[1]!).values;
  same(c2.length, 2, label + " C2 coordinate count");
  same(c2[0], value(f, result, "FULL_SELF_ROOT"), label + " ROOT FullSelf");
  const existsClaim = f.memory.poles(c2[1]!);
  same(existsClaim.start, value(f, result, "EXISTS_TAG"), label + " existential tag");
  const existsData = readExactSequence(f.memory, existsClaim.end).values;
  same(existsData.length, 2, label + " existential payload");
  same(existsData[0], value(f, result, "EXISTENTIAL_ROLES"), label + " witness roles");
  same(existsData[1], value(f, result, "EXISTENTIAL_BODY"), label + " witness body");
  const body = readExactSequence(f.memory, existsData[1]!).values;
  const names = [
    "GROUNDED_START_WITNESS", "GROUNDED_FINISH_WITNESS", "GROUNDED_PAIR_WITNESS",
    "START_ONLY_WITNESS", "FINISH_ONLY_WITNESS", "PAIR_LOCAL_WITNESS",
  ];
  same(body.length, names.length, label + " witness coordinate count");
  names.forEach((name, index) => same(body[index], value(f, result, name),
    label + " exact witness coordinate " + name));
}

same(fnd01Formal.migrationStatus, "FORMAL_MIGRATED", "migration");
same(fnd01Formal.proofClosure, "NO_PROOF_ARTIFACT", "proof state");
same(fnd01Formal.formalArtifactKind, "STATEMENT_ONLY", "artifact kind");
same(fnd01Formal.formalStatement, "FND01_STATEMENT : FND01_PREMISES->FND01_CONCLUSION",
  "canonical statement");
same(fnd01Formal.formalPremises.length, 3, "premise count");
same(fnd01Formal.formalPremises[0], "A1RecursiveSeparation", "A1 premise");
same(fnd01Formal.formalPremises[1], "F2F3OneSidedExistence", "F2/F3 premise");
same(fnd01Formal.formalPremises[2], "LocalSelfDecision:x", "decision premise");
same(fnd01Formal.formalDependencies?.length, 1, "dependency count");
same(fnd01Formal.formalDependencies?.[0], "FND-02", "dependency identity");
same(fnd01Formal.formalDomain?.[0], "x : Link", "outer domain");
same(fnd01Formal.formalExistentialDomain?.length, 3, "existential arity");
assert(fnd01Formal.formalNonPremises?.includes("FND-02 as premise"), "dependency is not premise");
assert(fnd01Formal.formalNonPremises?.includes("FND-13"), "FND-13 excluded");
assert(fnd01Formal.formalNonPremises?.includes("Grounded:x"), "Grounded:x excluded");
same(fnd01Formal.aproverStatus, "NOT_RECORDED", "aprover boundary");

{
  const f = fixture();
  const source = fnd01Source("X", "START_WITNESS", "FINISH_WITNESS", "PAIR_WITNESS");
  assert(!source.includes("="), "no executable equality syntax");
  assert(!source.includes("FND-13"), "no FND-13 import");
  assert(!source.includes("Grounded:x"), "no Grounded:x premise");
  const result = compile(f, source);
  const outer = value(f, result, "X");
  const witnessRoles = seq(f, result, "EXISTENTIAL_ROLES");
  const allRoles = [outer, ...witnessRoles];
  same(new Set(allRoles).size, 4, "outer/existential roles are distinct ordinary Links");

  const outerRoles = seq(f, result, "OUTER_ROLES");
  same(outerRoles.length, 1, "outer source role arity");
  same(outerRoles[0], outer, "outer dictionary contains only x");
  same(readStructuralRoleDictionary(f.memory,
    defineStructuralRoleDictionary(f.memory, outerRoles)).roles.length, 1,
  "generic outer RoleDictionary");
  same(witnessRoles.length, 3, "witness role arity");
  same(readStructuralRoleDictionary(f.memory,
    defineStructuralRoleDictionary(f.memory, witnessRoles)).roles.length, 3,
  "generic witness RoleDictionary");
  assert(!witnessRoles.includes(outer), "outer role does not leak into witness dictionary");

  const dependencies = seq(f, result, "FND01_DEPENDENCIES");
  same(dependencies.length, 1, "one source dependency");
  const dependency = f.memory.poles(dependencies[0]!);
  same(dependency.start, value(f, result, "DEPENDENCY_TAG"), "ordinary dependency Link");
  same(dependency.end, value(f, result, "C1_ROOT_BRANCH"), "dependency body is exact C1 root rule");
  const sourcePremises = seq(f, result, "FND01_PREMISES");
  same(sourcePremises.length, 3, "source premise count");
  assert(!sourcePremises.includes(dependencies[0]!), "FND-02 dependency is not a premise");

  const template = value(f, result, "FND01_STATEMENT");
  const a = value(f, result, "VALUE_A"), b = value(f, result, "VALUE_B");
  assert(a !== b && a !== outer && b !== outer, "two distinct x substitutions");
  const aStatement = inst(f, template, outer, a), bStatement = inst(f, template, outer, b);
  assert(aStatement !== bStatement, "different x bindings change C1");
  inspectInstance(f, result, aStatement, outer, a, "A");
  inspectInstance(f, result, bStatement, outer, b, "B");

  const dependencyA = inst(f, dependencies[0]!, outer, a);
  const aConclusion = readExactSequence(f.memory, f.memory.poles(aStatement).end).values;
  const aC1 = readExactSequence(f.memory, aConclusion[0]!).values;
  same(f.memory.poles(dependencyA).end, aC1[2],
    "instantiated dependency equals the C1 FullSelf-to-ROOT rule");

  const json = encodeV015FormalSourceAsetJson(
    f.memory, f.basis, f.grammarRoot, f.namespaceProfileRoot,
    f.definitionProfileRoot, result.source.sourceAset,
  );
  const jsonText = decoder.decode(json);
  assert(jsonText.startsWith('{"R":"R->R"'), "FND-01 uses direct JSON bundle");
  assert(jsonText.includes('"FND01_PREMISES":['), "FND-01 rooted sequences stay arrays");
  assert(!jsonText.includes('"pair"'), "FND-01 JSON has no pair host tag");
  const round = decodeV015FormalSourceAsetJson(
    f.memory, f.basis, f.grammarRoot, f.namespaceProfileRoot,
    f.definitionProfileRoot, json,
  );
  same(round.sourceAset, result.source.sourceAset, "direct JSON exact source-Aset round-trip");

  const alpha = compile(f, fnd01Source("Y", "SW", "FW", "PW"));
  same(value(f, alpha, "Y"), outer, "alpha outer role");
  ["SW", "FW", "PW"].forEach((name, index) =>
    same(value(f, alpha, name), witnessRoles[index]!, "alpha witness role " + name));
  same(value(f, alpha, "FND01_STATEMENT"), template, "alpha topology stable");

  const free = compile(f, freeSameSpellingSource());
  assert(value(f, free, "X") !== outer, "free same-spelling X distinct");
  assert(value(f, free, "START_WITNESS") !== witnessRoles[0], "free witness distinct");
  const freeClaim = value(f, free, "FREE_CLAIM");
  same(inst(f, freeClaim, outer, a), freeClaim, "same-spelling free Links not captured");
}

console.log([
  "MTS v0.15 B18 FND-01 FORMAL statement:",
  "PROOF_CLOSURE=NO_PROOF_ARTIFACT", "FORMAL_ARTIFACT_KIND=STATEMENT_ONLY",
  "FORMAL_PREMISES=3", "FORMAL_DEPENDENCIES=FND-02", "FND02_AS_PREMISE=0",
  "OUTER_BOUND_LINK_ROLES=1", "EXISTENTIAL_WITNESS_ROLES=3",
  "C1=EXHAUSTIVE+EXCLUSIVE+FULLSELF_TO_ROOT",
  "C2=ROOT_FULLSELF+EXISTENTIAL_GROUNDED_REALIZABILITY", "C3=C1_PLUS_C2",
  "FND13_DEPENDENCY=0", "GROUNDED_X_PREMISE=0", "OUTER_SUBSTITUTION_CAPTURES_WITNESSES=0",
  "TWO_X_INSTANTIATIONS=GREEN", "ALPHA_RENAME=SEMANTICALLY_STABLE",
  "SAME_SPELLING_FREE_CAPTURE=REJECTED_BY_IDENTITY", "JSON_DIRECT_BUNDLE=EXACT",
  "RUNTIME_EQUALITY_IN_TEMPLATE=0", "NATIVE_PROOF=NOT_CLAIMED", "APROVER_ACCEPT=NOT_CLAIMED",
].join(" "));
