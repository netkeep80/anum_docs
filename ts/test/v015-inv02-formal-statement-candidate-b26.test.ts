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
  if (!value) throw new Error("v0.15 B26 INV-02 candidate FORMAL statement: " + message);
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
  throw new Error("v0.15 B26 INV-02 candidate FORMAL statement: " + message);
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
  const theorem = historical.theorems?.find((item) => item.id === "INV-02");
  assert(theorem !== undefined, "historical INV-02 inventory row");
  same(theorem.statement, "Recursive inversion is involutive on its stated domain: J(J(X)) = X.",
    "exact historical statement");
  same(JSON.stringify(theorem.dependsOn), JSON.stringify(["INV-01", "FND-13"]), "historical dependencies");
  same(JSON.stringify(theorem.formalPremises), JSON.stringify([
    "A1RecursiveSeparation", "F2F3GroundedNormalization", "F2F3OneSidedExistence",
    "RecursiveInversionDomain", "Grounded:x",
  ]), "historical formal premises");
  assert(/exact Grounded domain of INV-01/i.test(theorem.scope), "scope stays on INV-01 Grounded domain");
  assert(/No arbitrary-Link\/global-normalization premise/i.test(theorem.exclusions), "global normalization excluded");
  same(theorem.evidence.mtsNative.length, 0, "no historical native proof");
  same(theorem.evidence.aprover.length, 0, "no historical aprover proof");
}
{
  const overlay = JSON.parse(
    readFileSync(resolve(repositoryRoot(), "theorems/formal-v0.15.json"), "utf8"),
  ) as { entries?: { id: string; migrationStatus?: string }[] };
  for (const id of ["INV-01", "FND-13"]) {
    const dependency = overlay.entries?.find((item) => item.id === id);
    assert(dependency !== undefined, id + " dependency exists");
    same(dependency.migrationStatus, "FORMAL_MIGRATED", id + " dependency is migrated");
  }
}
for (const path of ["proofs/evidence/INV-02/lean4.json", "proofs/evidence/INV-02/coq.json"]) {
  const evidence = JSON.parse(readFileSync(resolve(repositoryRoot(), path), "utf8")) as {
    result?: string; authority?: string; dependencies?: string[]; notes?: string;
  };
  same(evidence.result, "proved", path + " result");
  same(evidence.authority, "external-cross-check", path + " authority");
  same(JSON.stringify(evidence.dependencies), JSON.stringify(["INV-01", "FND-13"]), path + " dependencies");
  assert(evidence.notes?.includes("same finite Grounded domain as INV-01"), path + " domain boundary");
  assert(evidence.notes?.includes("no second inversion function"), path + " one inversion relation boundary");
  assert(evidence.notes?.includes("FND-13"), path + " identity boundary");
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

interface Names { readonly x: string; readonly y: string; readonly z: string; }
const canonical: Names = Object.freeze({ x: "X", y: "Y", z: "Z" });
const renamed: Names = Object.freeze({ x: "SOURCE", y: "FIRST_IMAGE", z: "SECOND_IMAGE" });

function sourceFor(n: Names): string {
  return [
    "R : R->R", "O : O->R", "C : R->C", "L : O->C", "U : C->O",
    n.x + " : U->L", n.y + " : " + n.x + "->R", n.z + " : " + n.y + "->R",
    "TAG_SEED : " + n.z + "->O",
    "PREMISE_TAG : TAG_SEED->O", "GROUNDED_TAG : PREMISE_TAG->O",
    "INVERSION_RELATION_TAG : GROUNDED_TAG->O", "IDENTITY_CLAIM_TAG : INVERSION_RELATION_TAG->O",
    "A1RecursiveSeparation : PREMISE_TAG->C",
    "F2F3GroundedNormalization : A1RecursiveSeparation->C",
    "F2F3OneSidedExistence : F2F3GroundedNormalization->C",
    "RecursiveInversionDomain : F2F3OneSidedExistence->C",
    "GROUNDED_X : GROUNDED_TAG->" + n.x,
    "INV02_PREMISES : [A1RecursiveSeparation,F2F3GroundedNormalization,F2F3OneSidedExistence,RecursiveInversionDomain,GROUNDED_X]",
    "J_XY_ARGS : [" + n.x + "," + n.y + "]",
    "J_XY : INVERSION_RELATION_TAG->J_XY_ARGS",
    "J_YZ_ARGS : [" + n.y + "," + n.z + "]",
    "J_YZ : INVERSION_RELATION_TAG->J_YZ_ARGS",
    "SECOND_IDENTITY_ARGS : [" + n.z + "," + n.x + "]",
    "SECOND_IS_SOURCE : IDENTITY_CLAIM_TAG->SECOND_IDENTITY_ARGS",
    "INV02_WITNESS : [" + n.y + "," + n.z + ",J_XY,J_YZ,SECOND_IS_SOURCE]",
    "INV02_CONCLUSION : [INV02_WITNESS]",
    "INV02_STATEMENT : INV02_PREMISES->INV02_CONCLUSION",
  ].join("\n");
}
const source = sourceFor(canonical);
assert(!source.includes(" = "), "placeholder identity is proposition metadata, not eager FORMAL equality evaluation");

function verify(f: Fixture, compiled: V015FormalRecursiveCompileResult, n: Names): void {
  const premises = readExactSequence(f.memory, value(f, compiled, "INV02_PREMISES")).values;
  same(premises.length, 5, "exact historical premise count");
  same(premises[0], value(f, compiled, "A1RecursiveSeparation"), "A1 premise");
  same(premises[1], value(f, compiled, "F2F3GroundedNormalization"), "normalization premise");
  same(premises[2], value(f, compiled, "F2F3OneSidedExistence"), "one-sided existence premise");
  same(premises[3], value(f, compiled, "RecursiveInversionDomain"), "recursive inversion domain premise");
  same(premises[4], value(f, compiled, "GROUNDED_X"), "Grounded:x premise");

  const firstArgs = readExactSequence(f.memory, f.memory.poles(value(f, compiled, "J_XY")).end).values;
  same(firstArgs.length, 2, "first inversion arity");
  same(firstArgs[0], value(f, compiled, n.x), "first inversion source");
  same(firstArgs[1], value(f, compiled, n.y), "first inversion image");

  const secondArgs = readExactSequence(f.memory, f.memory.poles(value(f, compiled, "J_YZ")).end).values;
  same(secondArgs.length, 2, "second inversion arity");
  same(secondArgs[0], value(f, compiled, n.y), "second inversion reuses first image");
  same(secondArgs[1], value(f, compiled, n.z), "second inversion image");

  const identityArgs = readExactSequence(
    f.memory, f.memory.poles(value(f, compiled, "SECOND_IS_SOURCE")).end,
  ).values;
  same(identityArgs.length, 2, "identity claim arity");
  same(identityArgs[0], value(f, compiled, n.z), "identity claim second image");
  same(identityArgs[1], value(f, compiled, n.x), "identity claim original source");

  const witness = readExactSequence(f.memory, value(f, compiled, "INV02_WITNESS")).values;
  same(witness.length, 5, "existential witness payload");
  same(witness[0], value(f, compiled, n.y), "first existential image");
  same(witness[1], value(f, compiled, n.z), "second existential image");
  same(witness[2], value(f, compiled, "J_XY"), "first graph edge");
  same(witness[3], value(f, compiled, "J_YZ"), "second graph edge");
  same(witness[4], value(f, compiled, "SECOND_IS_SOURCE"), "involution identity claim");

  const conclusion = readExactSequence(f.memory, value(f, compiled, "INV02_CONCLUSION")).values;
  same(conclusion.length, 1, "INV-02 conclusion arity");
  same(conclusion[0], value(f, compiled, "INV02_WITNESS"), "conclusion carries involution witness");

  const statement = f.memory.poles(value(f, compiled, "INV02_STATEMENT"));
  same(statement.start, value(f, compiled, "INV02_PREMISES"), "statement premises");
  same(statement.end, value(f, compiled, "INV02_CONCLUSION"), "statement conclusion");

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

const first = fixture(), compiled = compile(first, source); verify(first, compiled, canonical);
const second = fixture(), secondCompiled = compile(second, source); verify(second, secondCompiled, canonical);
sameBytes(wire(first, compiled, "INV02_STATEMENT"), wire(second, secondCompiled, "INV02_STATEMENT"),
  "fresh-Memory wire parity");

const renamedFixture = fixture(), renamedCompiled = compile(renamedFixture, sourceFor(renamed));
verify(renamedFixture, renamedCompiled, renamed);
sameBytes(wire(first, compiled, "INV02_STATEMENT"), wire(renamedFixture, renamedCompiled, "INV02_STATEMENT"),
  "presentation rename preserves statement identity");

{
  const wrong = fixture();
  const mutated = compile(wrong, source.replace(
    "INV02_PREMISES : [A1RecursiveSeparation,F2F3GroundedNormalization,F2F3OneSidedExistence,RecursiveInversionDomain,GROUNDED_X]",
    "INV02_PREMISES : [A1RecursiveSeparation,F2F3GroundedNormalization,F2F3OneSidedExistence,RecursiveInversionDomain]",
  ));
  differentBytes(wire(first, compiled, "INV02_STATEMENT"), wire(wrong, mutated, "INV02_STATEMENT"),
    "dropping Grounded:x must change statement identity");
}
{
  const wrong = fixture();
  const mutated = compile(wrong, source.replace("J_YZ_ARGS : [Y,Z]", "J_YZ_ARGS : [X,Z]"));
  differentBytes(wire(first, compiled, "INV02_STATEMENT"), wire(wrong, mutated, "INV02_STATEMENT"),
    "second inversion must start from the first image");
}
{
  const wrong = fixture();
  const mutated = compile(wrong, source.replace("SECOND_IDENTITY_ARGS : [Z,X]", "SECOND_IDENTITY_ARGS : [Y,X]"));
  differentBytes(wire(first, compiled, "INV02_STATEMENT"), wire(wrong, mutated, "INV02_STATEMENT"),
    "second image identity must point back to the original source");
}

console.log([
  "MTS v0.15 B26 INV-02 candidate FORMAL statement:",
  "MIGRATION_STATUS=CANDIDATE_NOT_PROMOTED",
  "FORMAL_ARTIFACT_KIND=STATEMENT_ONLY",
  "FORMAL_PREMISES=5_A1+NORMALIZATION+F2F3+RECURSIVE_DOMAIN+GROUNDED_X",
  "FORMAL_DEPENDENCIES=INV-01+FND-13",
  "DOMAIN=SAME_FINITE_GROUNDED_AS_INV01",
  "INVOLUTION=J_XY+J_YZ+Z_IDENTITY_X",
  "SECOND_INVERSION_FUNCTION=0",
  "GLOBAL_NORMALIZATION=NOT_CLAIMED",
  "NON_GROUNDED_CYCLES=EXCLUDED",
  "PRESENTATION_RENAME=SEMANTICALLY_STABLE",
  "FRESH_MEMORY_WIRE_PARITY=GREEN",
  "JSON_J1=EXACT",
  "GROUNDED_PREMISE_REMOVAL=DIFF",
  "SECOND_SOURCE_MUTATION=DIFF",
  "IDENTITY_TARGET_MUTATION=DIFF",
  "HISTORICAL_EXTERNAL_PROOF=UNCHANGED",
  "NATIVE_PROOF=NOT_CLAIMED",
  "APROVER_ACCEPT=NOT_CLAIMED",
].join(" "));
