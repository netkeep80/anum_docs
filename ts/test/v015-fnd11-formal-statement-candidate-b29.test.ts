import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { materializeExactSequence, readExactSequence } from "../src/exact-sequence.js";
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
  if (!value) throw new Error("v0.15 B29 FND-11 candidate FORMAL statement: " + message);
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
  throw new Error("v0.15 B29 FND-11 candidate FORMAL statement: " + message);
}

interface Fixture {
  readonly memory: Memory;
  readonly basis: RootBasis;
  readonly grammarRoot: LinkHandle;
  readonly namespaceProfileRoot: LinkHandle;
  readonly definitionProfileRoot: LinkHandle;
}
function fixture(noise = 0): Fixture {
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  let noiseCursor = basis.U;
  for (let i = 0; i < noise; i += 1) noiseCursor = memory.ensure(noiseCursor, basis.C);
  let cursor = memory.ensure(noiseCursor, basis.L);
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
  assert(["COMPONENT_GREEN", "VERTICAL_GREEN"].includes(row.state), id + " accepted component state");
}

{
  const historical = JSON.parse(
    readFileSync(resolve(repositoryRoot(), "theorems/current-v0.14.json"), "utf8"),
  ) as { theorems?: {
    id: string; statement: string; dependsOn: string[]; formalPremises: string[];
    scope: string; exclusions: string; evidence: { lean4: string[]; coq: string[]; mtsNative: string[]; aprover: string[] };
  }[] };
  const theorem = historical.theorems?.find((item) => item.id === "FND-11");
  assert(theorem !== undefined, "historical FND-11 inventory row");
  same(theorem.statement,
    "Representation identities are separated: Anum is a rooted sequence representation family, ExactSequence preserves exact positional identity distinct from fold denotation, the recursive Link codec is not Anum, Q is a versioned sequence codec/interpreter, and every local sequence origin is R.",
    "exact historical statement");
  same(JSON.stringify(theorem.dependsOn), JSON.stringify(["FND-05"]), "historical dependency");
  same(JSON.stringify(theorem.formalPremises),
    JSON.stringify(["AcceptedV014RepresentationDefinitions", "FND05Canonicality"]),
    "historical formal premises");
  assert(/representation\/codec boundary/i.test(theorem.scope), "representation/codec scope");
  assert(/No claim that recursive structure and Q are globally isomorphic/i.test(theorem.exclusions),
    "global recursive/Q isomorphism excluded");
  assert(/No representation-strength ranking/i.test(theorem.exclusions), "representation ranking excluded");
  assert(/no host representation classifier/i.test(theorem.exclusions), "host classifier authority excluded");
  same(theorem.evidence.mtsNative.length, 0, "no historical native proof");
  same(theorem.evidence.aprover.length, 0, "no historical aprover proof");
}
{
  const contract = JSON.parse(
    readFileSync(resolve(repositoryRoot(), "contracts/mts-contract-v0.14.json"), "utf8"),
  ) as {
    sequenceSemantics?: {
      anum?: string; exactSequenceDistinctFromFoldDenotation?: boolean;
      recursiveLinkCodecDistinct?: boolean; rootOrigin?: string;
    };
    q14Interpreter?: { alphabet?: string[]; acceptsLegacy10?: boolean; mixedSourceAllowed?: boolean };
    legacyQ13Compatibility?: {
      immutable?: boolean; acceptsTF?: boolean; explicitVersionedTranscodeAllowed?: boolean;
      transcodePreservesDenotation?: boolean; transcodePreservesExactStringIdentity?: boolean;
    };
    requiredSemanticLaws?: Record<string, string>;
  };
  same(contract.sequenceSemantics?.anum, "rooted compact representation/coding of a sequence of Links",
    "accepted Anum representation role");
  same(contract.sequenceSemantics?.exactSequenceDistinctFromFoldDenotation, true,
    "accepted ExactSequence/fold separation");
  same(contract.sequenceSemantics?.recursiveLinkCodecDistinct, true, "accepted recursive-codec/Anum separation");
  same(contract.sequenceSemantics?.rootOrigin, "R", "accepted local sequence root origin");
  same(JSON.stringify(contract.q14Interpreter?.alphabet), JSON.stringify(["[", "]", "T", "F"]),
    "accepted Q14 alphabet");
  same(contract.q14Interpreter?.acceptsLegacy10, false, "Q14 version boundary");
  same(contract.q14Interpreter?.mixedSourceAllowed, false, "Q14 mixed source rejected");
  same(contract.legacyQ13Compatibility?.immutable, true, "Q13 immutable");
  same(contract.legacyQ13Compatibility?.acceptsTF, false, "Q13 rejects Q14 alphabet");
  same(contract.legacyQ13Compatibility?.explicitVersionedTranscodeAllowed, true, "explicit transcode allowed");
  same(contract.legacyQ13Compatibility?.transcodePreservesDenotation, true, "transcode denotation");
  same(contract.legacyQ13Compatibility?.transcodePreservesExactStringIdentity, false,
    "Q source identity differs from denotation");
  assert(contract.requiredSemanticLaws?.["V14-L13"]?.startsWith(
    "Anum is a rooted compact representation/coding of a sequence of Links; ExactSequence preserves exact positional sequence identity"),
    "V14-L13 exact representation boundary");
}
{
  const contract = JSON.parse(
    readFileSync(resolve(repositoryRoot(), "contracts/mts-contract-v0.15.json"), "utf8"),
  ) as {
    semanticBase?: string;
    previousAcceptedRelease?: { contract?: string; immutable?: boolean };
    requiredSemanticLaws?: Record<string, string>;
  };
  same(contract.semanticBase, "mts-contract/v0.14", "v0.15 keeps v0.14 semantic base");
  same(contract.previousAcceptedRelease?.contract, "mts-contract/v0.14", "previous accepted contract");
  same(contract.previousAcceptedRelease?.immutable, true, "v0.14 preserved immutable");
  assert(/arrays lower canonically to ExactSequence/i.test(contract.requiredSemanticLaws?.["V15-JSON-04"] ?? ""),
    "v0.15 ExactSequence carrier boundary");
  assert(/fold .*separate derived projection/i.test(contract.requiredSemanticLaws?.["V15-JSON-04"] ?? ""),
    "v0.15 fold remains separate");
}
for (const id of ["V15-ONTO-01", "V15-ONTO-02", "V15-FRESH-03", "V15-JSON-04"]) acceptedRequirement(id);
{
  const overlay = JSON.parse(
    readFileSync(resolve(repositoryRoot(), "theorems/formal-v0.15.json"), "utf8"),
  ) as { entries?: { id: string; migrationStatus?: string }[] };
  const dependency = overlay.entries?.find((item) => item.id === "FND-05");
  assert(dependency !== undefined, "FND-05 dependency exists");
  same(dependency.migrationStatus, "FORMAL_MIGRATED", "FND-05 dependency is migrated");
}
for (const path of ["proofs/evidence/FND-11/lean4.json", "proofs/evidence/FND-11/coq.json"]) {
  const evidence = JSON.parse(readFileSync(resolve(repositoryRoot(), path), "utf8")) as {
    result?: string; authority?: string; dependencies?: string[]; assumptions?: string[]; notes?: string;
  };
  same(evidence.result, "proved", path + " result");
  same(evidence.authority, "external-cross-check", path + " authority");
  same(JSON.stringify(evidence.dependencies), JSON.stringify(["FND-05"]), path + " dependency");
  same(JSON.stringify(evidence.assumptions),
    JSON.stringify([
      "AcceptedV014RepresentationDefinitions external projection of accepted representation contracts",
      "FND05Canonicality witness",
    ]),
    path + " assumptions");
  assert(evidence.notes?.includes("[] versus [R] collision witness"), path + " ExactSequence/fold witness");
  assert(evidence.notes?.includes("empty-source versus [] collision witness"), path + " Q source/denotation witness");
  assert(evidence.notes?.includes("Every projected local sequence origin is R"), path + " local root origin");
  assert(/no representation-strength ranking is claimed/i.test(evidence.notes ?? ""), path + " no ranking");
  assert(/no host representation classifier is promoted/i.test(evidence.notes ?? ""), path + " no host classifier");
}

{
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  const empty = materializeExactSequence(memory, []);
  const oneRoot = materializeExactSequence(memory, [basis.R]);
  same(empty, basis.R, "empty ExactSequence is R");
  assert(oneRoot !== empty, "ExactSequence [R] preserves one explicit position");
  const fold = (values: readonly LinkHandle[]): LinkHandle => {
    let current = basis.R;
    for (const item of values) current = memory.ensure(current, item);
    return current;
  };
  same(fold([]), basis.R, "empty rooted fold is R");
  same(fold([basis.R]), basis.R, "rooted fold [R] collapses to R");
  assert(oneRoot !== fold([basis.R]), "ExactSequence positional identity differs from rooted fold denotation");
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
  readonly anum: string; readonly exact: string; readonly fold: string;
  readonly recursive: string; readonly qSource: string; readonly qDenotation: string;
}
const canonical: Names = Object.freeze({
  anum: "ANUM_TARGET", exact: "EXACT_TARGET", fold: "FOLD_TARGET",
  recursive: "RECURSIVE_TARGET", qSource: "Q_SOURCE_TARGET", qDenotation: "Q_DENOTATION_TARGET",
});
const renamed: Names = Object.freeze({
  anum: "SEQUENCE_VIEW_A", exact: "POSITIONAL_VIEW_B", fold: "DERIVED_VIEW_C",
  recursive: "STRUCTURE_VIEW_D", qSource: "VERSIONED_SOURCE_E", qDenotation: "INTERPRETED_VIEW_F",
});

function sourceFor(n: Names): string {
  return [
    "R : R->R", "O : O->R", "C : R->C", "L : O->C", "U : C->O",
    n.anum + " : U->L",
    n.exact + " : " + n.anum + "->R",
    n.fold + " : " + n.exact + "->O",
    n.recursive + " : " + n.fold + "->C",
    n.qSource + " : " + n.recursive + "->L",
    n.qDenotation + " : " + n.qSource + "->U",
    "TAG_SEED : " + n.qDenotation + "->O",
    "PREMISE_TAG : TAG_SEED->O",
    "REPRESENTATION_TAG : PREMISE_TAG->O",
    "SEPARATION_TAG : REPRESENTATION_TAG->O",
    "VERSIONED_TAG : SEPARATION_TAG->O",
    "ROOT_ORIGIN_TAG : VERSIONED_TAG->O",
    "ACCEPTED_REPRESENTATION_DEFINITIONS_DATA : [" +
      [n.anum, n.exact, n.fold, n.recursive, n.qSource, n.qDenotation].join(",") + "]",
    "ACCEPTED_REPRESENTATION_DEFINITIONS : PREMISE_TAG->ACCEPTED_REPRESENTATION_DEFINITIONS_DATA",
    "FND05_CANONICALITY : PREMISE_TAG->" + n.recursive,
    "FND11_PREMISES : [ACCEPTED_REPRESENTATION_DEFINITIONS,FND05_CANONICALITY]",
    "ANUM_ROOTED_ARGS : [" + n.anum + ",R]",
    "ANUM_ROOTED_SEQUENCE : REPRESENTATION_TAG->ANUM_ROOTED_ARGS",
    "EXACT_POSITIONAL_IDENTITY : REPRESENTATION_TAG->" + n.exact,
    "FOLD_DENOTATION : REPRESENTATION_TAG->" + n.fold,
    "EXACT_FOLD_SEPARATION_ARGS : [EXACT_POSITIONAL_IDENTITY,FOLD_DENOTATION]",
    "EXACT_NE_FOLD : SEPARATION_TAG->EXACT_FOLD_SEPARATION_ARGS",
    "RECURSIVE_CODEC_IDENTITY : REPRESENTATION_TAG->" + n.recursive,
    "RECURSIVE_ANUM_SEPARATION_ARGS : [RECURSIVE_CODEC_IDENTITY,ANUM_ROOTED_SEQUENCE]",
    "RECURSIVE_NE_ANUM : SEPARATION_TAG->RECURSIVE_ANUM_SEPARATION_ARGS",
    "Q_VERSIONED_SOURCE : VERSIONED_TAG->" + n.qSource,
    "Q_DENOTATION : REPRESENTATION_TAG->" + n.qDenotation,
    "Q_SOURCE_DENOTATION_SEPARATION_ARGS : [Q_VERSIONED_SOURCE,Q_DENOTATION]",
    "Q_SOURCE_NE_DENOTATION : SEPARATION_TAG->Q_SOURCE_DENOTATION_SEPARATION_ARGS",
    "LOCAL_SEQUENCE_ORIGIN : ROOT_ORIGIN_TAG->R",
    "FND11_CONCLUSION : [ANUM_ROOTED_SEQUENCE,EXACT_NE_FOLD,RECURSIVE_NE_ANUM,Q_SOURCE_NE_DENOTATION,LOCAL_SEQUENCE_ORIGIN]",
    "FND11_STATEMENT : FND11_PREMISES->FND11_CONCLUSION",
  ].join("\n");
}
const source = sourceFor(canonical);
assert(!/RANK|CLASSIFIER|COST|SHORTER|STRONGER/i.test(source),
  "representation ranking/host classifier/cost ordering absent from semantic FORMAL source");

function verify(f: Fixture, compiled: V015FormalRecursiveCompileResult, n: Names): void {
  const premises = readExactSequence(f.memory, value(f, compiled, "FND11_PREMISES")).values;
  same(premises.length, 2, "historical formal premise count");
  same(premises[0], value(f, compiled, "ACCEPTED_REPRESENTATION_DEFINITIONS"),
    "accepted representation definitions premise");
  same(premises[1], value(f, compiled, "FND05_CANONICALITY"), "FND-05 canonicality premise");

  const defs = readExactSequence(f.memory, value(f, compiled, "ACCEPTED_REPRESENTATION_DEFINITIONS_DATA")).values;
  same(defs.length, 6, "representation identity target count");
  const expectedDefs = [n.anum, n.exact, n.fold, n.recursive, n.qSource, n.qDenotation]
    .map((name) => value(f, compiled, name));
  for (let i = 0; i < expectedDefs.length; i += 1) same(defs[i], expectedDefs[i], "representation target " + i);

  const anumArgs = readExactSequence(f.memory, value(f, compiled, "ANUM_ROOTED_ARGS")).values;
  same(anumArgs.length, 2, "Anum rooted role arity");
  same(anumArgs[0], value(f, compiled, n.anum), "Anum identity target");
  same(anumArgs[1], f.basis.R, "Anum rooted origin");

  const exactFold = readExactSequence(f.memory, value(f, compiled, "EXACT_FOLD_SEPARATION_ARGS")).values;
  same(exactFold.length, 2, "Exact/fold separation arity");
  same(exactFold[0], value(f, compiled, "EXACT_POSITIONAL_IDENTITY"), "Exact positional side");
  same(exactFold[1], value(f, compiled, "FOLD_DENOTATION"), "fold-denotation side");
  assert(exactFold[0] !== exactFold[1], "Exact positional identity and fold denotation remain distinct");

  const recursiveAnum = readExactSequence(
    f.memory, value(f, compiled, "RECURSIVE_ANUM_SEPARATION_ARGS"),
  ).values;
  same(recursiveAnum.length, 2, "recursive/Anum separation arity");
  same(recursiveAnum[0], value(f, compiled, "RECURSIVE_CODEC_IDENTITY"), "recursive-codec side");
  same(recursiveAnum[1], value(f, compiled, "ANUM_ROOTED_SEQUENCE"), "Anum side");
  assert(recursiveAnum[0] !== recursiveAnum[1], "recursive Link codec and Anum remain distinct");

  const qSeparation = readExactSequence(
    f.memory, value(f, compiled, "Q_SOURCE_DENOTATION_SEPARATION_ARGS"),
  ).values;
  same(qSeparation.length, 2, "Q source/denotation separation arity");
  same(qSeparation[0], value(f, compiled, "Q_VERSIONED_SOURCE"), "Q versioned-source side");
  same(qSeparation[1], value(f, compiled, "Q_DENOTATION"), "Q interpreted-denotation side");
  assert(qSeparation[0] !== qSeparation[1], "Q source identity and denotation remain distinct");

  const origin = f.memory.poles(value(f, compiled, "LOCAL_SEQUENCE_ORIGIN"));
  same(origin.end, f.basis.R, "every local sequence origin projects to R");

  const conclusion = readExactSequence(f.memory, value(f, compiled, "FND11_CONCLUSION")).values;
  same(conclusion.length, 5, "FND-11 conclusion clause count");
  same(conclusion[0], value(f, compiled, "ANUM_ROOTED_SEQUENCE"), "Anum clause");
  same(conclusion[1], value(f, compiled, "EXACT_NE_FOLD"), "Exact/fold clause");
  same(conclusion[2], value(f, compiled, "RECURSIVE_NE_ANUM"), "recursive/Anum clause");
  same(conclusion[3], value(f, compiled, "Q_SOURCE_NE_DENOTATION"), "Q version/source clause");
  same(conclusion[4], value(f, compiled, "LOCAL_SEQUENCE_ORIGIN"), "R-origin clause");

  const statement = f.memory.poles(value(f, compiled, "FND11_STATEMENT"));
  same(statement.start, value(f, compiled, "FND11_PREMISES"), "statement premises");
  same(statement.end, value(f, compiled, "FND11_CONCLUSION"), "statement conclusion");

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

const first = fixture(), compiled = compile(first, source);
verify(first, compiled, canonical);
const noisy = fixture(19), noisyCompiled = compile(noisy, source);
verify(noisy, noisyCompiled, canonical);
sameBytes(wire(first, compiled, "FND11_STATEMENT"), wire(noisy, noisyCompiled, "FND11_STATEMENT"),
  "unrelated fresh-Memory allocation noise preserves recursive statement wire");

const renamedFixture = fixture(7), renamedCompiled = compile(renamedFixture, sourceFor(renamed));
verify(renamedFixture, renamedCompiled, renamed);
sameBytes(wire(first, compiled, "FND11_STATEMENT"),
  wire(renamedFixture, renamedCompiled, "FND11_STATEMENT"),
  "presentation rename preserves theorem statement identity");

{
  const wrong = fixture();
  const mutated = compile(wrong, source.replace(
    "FND11_PREMISES : [ACCEPTED_REPRESENTATION_DEFINITIONS,FND05_CANONICALITY]",
    "FND11_PREMISES : [ACCEPTED_REPRESENTATION_DEFINITIONS]",
  ));
  differentBytes(wire(first, compiled, "FND11_STATEMENT"), wire(wrong, mutated, "FND11_STATEMENT"),
    "dropping FND-05 premise must change statement identity");
}
{
  const wrong = fixture();
  const mutated = compile(wrong, source.replace(
    "EXACT_FOLD_SEPARATION_ARGS : [EXACT_POSITIONAL_IDENTITY,FOLD_DENOTATION]",
    "EXACT_FOLD_SEPARATION_ARGS : [EXACT_POSITIONAL_IDENTITY,EXACT_POSITIONAL_IDENTITY]",
  ));
  differentBytes(wire(first, compiled, "FND11_STATEMENT"), wire(wrong, mutated, "FND11_STATEMENT"),
    "collapsing ExactSequence/fold distinction must change statement identity");
}
{
  const wrong = fixture();
  const mutated = compile(wrong, source.replace(
    "RECURSIVE_ANUM_SEPARATION_ARGS : [RECURSIVE_CODEC_IDENTITY,ANUM_ROOTED_SEQUENCE]",
    "RECURSIVE_ANUM_SEPARATION_ARGS : [RECURSIVE_CODEC_IDENTITY,RECURSIVE_CODEC_IDENTITY]",
  ));
  differentBytes(wire(first, compiled, "FND11_STATEMENT"), wire(wrong, mutated, "FND11_STATEMENT"),
    "collapsing recursive-codec/Anum distinction must change statement identity");
}
{
  const wrong = fixture();
  const mutated = compile(wrong, source.replace(
    "Q_SOURCE_DENOTATION_SEPARATION_ARGS : [Q_VERSIONED_SOURCE,Q_DENOTATION]",
    "Q_SOURCE_DENOTATION_SEPARATION_ARGS : [Q_VERSIONED_SOURCE,Q_VERSIONED_SOURCE]",
  ));
  differentBytes(wire(first, compiled, "FND11_STATEMENT"), wire(wrong, mutated, "FND11_STATEMENT"),
    "collapsing Q source/denotation distinction must change statement identity");
}
{
  const wrong = fixture();
  const mutated = compile(wrong, source.replace(
    "LOCAL_SEQUENCE_ORIGIN : ROOT_ORIGIN_TAG->R",
    "LOCAL_SEQUENCE_ORIGIN : ROOT_ORIGIN_TAG->U",
  ));
  differentBytes(wire(first, compiled, "FND11_STATEMENT"), wire(wrong, mutated, "FND11_STATEMENT"),
    "changing local sequence origin away from R must change statement identity");
}

console.log([
  "MTS v0.15 B29 FND-11 FORMAL statement:",
  "MIGRATION_STATUS=FORMAL_MIGRATED",
  "FORMAL_ARTIFACT_KIND=STATEMENT_ONLY",
  "FORMAL_PREMISES=2_ACCEPTED_REPRESENTATION_DEFINITIONS_PLUS_FND05",
  "FORMAL_DEPENDENCIES=FND-05",
  "ANUM=ROOTED_SEQUENCE_REPRESENTATION_ROLE",
  "EXACT_SEQUENCE_NE_FOLD_DENOTATION=STRUCTURAL_CLAIM",
  "RECURSIVE_CODEC_NE_ANUM=STRUCTURAL_CLAIM",
  "Q=VERSIONED_SEQUENCE_CODEC_INTERPRETER_ROLE",
  "Q_SOURCE_NE_DENOTATION=STRUCTURAL_CLAIM",
  "LOCAL_SEQUENCE_ORIGIN=R",
  "HISTORICAL_COLLISION_WITNESS_EMPTY_VS_ONE_R=GREEN",
  "FRESH_MEMORY_ALLOCATION_NOISE=SEMANTICALLY_STABLE",
  "PRESENTATION_RENAME=SEMANTICALLY_STABLE",
  "JSON_J1=EXACT",
  "FND05_PREMISE_REMOVAL=DIFF",
  "EXACT_FOLD_COLLAPSE=DIFF",
  "RECURSIVE_ANUM_COLLAPSE=DIFF",
  "Q_SOURCE_DENOTATION_COLLAPSE=DIFF",
  "ROOT_ORIGIN_MUTATION=DIFF",
  "GLOBAL_RECURSIVE_Q_ISOMORPHISM=NOT_CLAIMED",
  "REPRESENTATION_RANKING=NOT_CLAIMED",
  "HOST_REPRESENTATION_CLASSIFIER=NOT_SEMANTIC_AUTHORITY",
  "HISTORICAL_EXTERNAL_PROOF=UNCHANGED",
  "NATIVE_PROOF=NOT_CLAIMED",
  "APROVER_ACCEPT=NOT_CLAIMED",
].join(" "));
