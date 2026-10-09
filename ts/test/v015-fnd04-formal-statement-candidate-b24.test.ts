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
  if (!value) throw new Error("v0.15 B24 FND-04 candidate FORMAL statement: " + message);
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
  throw new Error("v0.15 B24 FND-04 candidate FORMAL statement: " + message);
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
  const fresh = (): LinkHandle => {
    cursor = memory.ensure(cursor, basis.C);
    return cursor;
  };

  const syntaxTag = fresh();
  const markerSeed = fresh();
  const pairForm = fresh();
  const nameRefForm = fresh();
  const declarationForm = fresh();
  const blockForm = fresh();
  const sequenceForm = fresh();
  const pairLeftRole = fresh();
  const pairRightRole = fresh();
  const referencedNameRole = fresh();
  const declarationNameRole = fresh();
  const declarationBodyRole = fresh();
  const blockItemRole = fresh();
  const sequenceItemRole = fresh();

  const rules: readonly NativeSyntaxGrammarRuleSpec[] = [
    { form: pairForm, fields: [
      { role: pairLeftRole, target: "child", min: 1, max: 1 },
      { role: pairRightRole, target: "child", min: 1, max: 1 },
    ] },
    { form: nameRefForm, fields: [
      { role: referencedNameRole, target: "carrier", min: 1, max: 1 },
    ] },
    { form: declarationForm, fields: [
      { role: declarationNameRole, target: "carrier", min: 1, max: 1 },
      { role: declarationBodyRole, target: "child", min: 1, max: 1 },
    ] },
    { form: blockForm, fields: [
      { role: blockItemRole, target: "child", min: 0, max: null },
    ] },
    { form: sequenceForm, fields: [
      { role: sequenceItemRole, target: "child", min: 0, max: null },
    ] },
  ];

  return Object.freeze({
    memory,
    basis,
    grammarRoot: materializeNativeSyntaxGrammar(memory, basis, {
      syntaxTag,
      markerSeed,
      rules,
    }),
    namespaceProfileRoot: materializeSourceNamespaceProfile(memory, {
      blockForm,
      declarationForm,
      blockItemRole,
      declarationNameRole,
      declarationBodyRole,
    }),
    definitionProfileRoot: materializeV015LinkDefinitionProfile(memory, {
      pairForm,
      nameRefForm,
      pairLeftRole,
      pairRightRole,
      referencedNameRole,
      sequenceForm,
      sequenceItemRole,
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

interface RequirementRow {
  readonly id: string;
  readonly state: string;
  readonly mandatory: boolean;
}
function acceptedRequirement(id: string): void {
  const doc = JSON.parse(
    readFileSync(resolve(repositoryRoot(), "requirements/mts-v0.15.json"), "utf8"),
  ) as { requirements?: RequirementRow[] };
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
function historicalFnd04(): HistoricalTheorem {
  const doc = JSON.parse(
    readFileSync(resolve(repositoryRoot(), "theorems/current-v0.14.json"), "utf8"),
  ) as { theorems?: HistoricalTheorem[] };
  const theorem = doc.theorems?.find((item) => item.id === "FND-04");
  assert(theorem !== undefined, "historical FND-04 inventory row");
  same(
    theorem.statement,
    "U = C ⟼ O is an ordinary PAIR-derived representative and not a fifth self-incidence class.",
    "exact historical statement",
  );
  same(JSON.stringify(theorem.dependsOn), JSON.stringify(["FND-03"]), "historical dependency");
  same(JSON.stringify(theorem.formalPremises), JSON.stringify([]), "historical formal premises");
  same(theorem.scope, "Accepted root basis.", "historical scope");
  assert(/not a fifth/i.test(theorem.statement), "historical fifth-class exclusion");
  assert(theorem.evidence.lean4.length > 0 && theorem.evidence.coq.length > 0,
    "paired historical external evidence");
  same(theorem.evidence.mtsNative.length, 0, "no historical native proof");
  same(theorem.evidence.aprover.length, 0, "no historical aprover proof");
  return theorem;
}
historicalFnd04();

{
  const overlay = JSON.parse(
    readFileSync(resolve(repositoryRoot(), "theorems/formal-v0.15.json"), "utf8"),
  ) as { entries?: { id: string; migrationStatus?: string }[] };
  const dependency = overlay.entries?.find((item) => item.id === "FND-03");
  assert(dependency !== undefined, "FND-03 dependency exists in current FORMAL overlay");
  same(dependency.migrationStatus, "FORMAL_MIGRATED", "FND-03 dependency is already migrated");
}

for (const path of ["proofs/evidence/FND-04/lean4.json", "proofs/evidence/FND-04/coq.json"]) {
  const evidence = JSON.parse(readFileSync(resolve(repositoryRoot(), path), "utf8")) as {
    result?: string;
    authority?: string;
    dependencies?: string[];
    notes?: string;
  };
  same(evidence.result, "proved", path + " result");
  same(evidence.authority, "external-cross-check", path + " authority");
  same(JSON.stringify(evidence.dependencies), JSON.stringify(["FND-03"]), path + " dependencies");
  assert(evidence.notes?.includes("PairLocal"), path + " PairLocal boundary");
  assert(/fifth/i.test(evidence.notes ?? ""), path + " fifth-class exclusion");
  assert(/ontology primitive/i.test(evidence.notes ?? ""), path + " one-Link ontology boundary");
}

function compile(f: Fixture, source: string): V015FormalRecursiveCompileResult {
  return compileV015FormalDefinitionsToRecursive(
    f.memory,
    f.basis,
    f.grammarRoot,
    f.namespaceProfileRoot,
    f.definitionProfileRoot,
    encoder.encode(source),
  );
}

function value(
  f: Fixture,
  compiled: V015FormalRecursiveCompileResult,
  name: string,
): LinkHandle {
  const carrier = materializeV012StringAnum(
    f.memory,
    f.basis,
    encoder.encode(name),
  ).anumLink;
  const definition = compiled.definitions.find((item) => item.nameCarrier === carrier);
  assert(definition !== undefined, "missing compiled definition " + name);
  return definition.semantic;
}

function wire(
  f: Fixture,
  compiled: V015FormalRecursiveCompileResult,
  name: string,
): Uint8Array {
  const carrier = materializeV012StringAnum(
    f.memory,
    f.basis,
    encoder.encode(name),
  ).anumLink;
  const definition = compiled.definitions.find((item) => item.nameCarrier === carrier);
  assert(definition !== undefined, "missing compiled definition " + name);
  return definition.wire;
}

interface BasisNames {
  readonly R: string;
  readonly O: string;
  readonly C: string;
  readonly L: string;
  readonly U: string;
}
const canonicalNames: BasisNames = Object.freeze({
  R: "R", O: "O", C: "C", L: "L", U: "U",
});
const renamedNames: BasisNames = Object.freeze({
  R: "ROOT_NAME",
  O: "START_SIDE_NAME",
  C: "END_SIDE_NAME",
  L: "FORWARD_PAIR_NAME",
  U: "REVERSE_PAIR_NAME",
});

function sourceFor(names: BasisNames): string {
  return [
    names.R + " : " + names.R + "->" + names.R,
    names.O + " : " + names.O + "->" + names.R,
    names.C + " : " + names.R + "->" + names.C,
    names.L + " : " + names.O + "->" + names.C,
    names.U + " : " + names.C + "->" + names.O,
    "FND04_PREMISES : []",
    "FND04_CONCLUSION : [" + names.U + "]",
    "FND04_STATEMENT : FND04_PREMISES->FND04_CONCLUSION",
  ].join("\n");
}
const source = sourceFor(canonicalNames);

function verifyCandidate(
  f: Fixture,
  compiled: V015FormalRecursiveCompileResult,
  names: BasisNames,
): void {
  same(value(f, compiled, names.R), f.basis.R, names.R + " is accepted ROOT");
  same(value(f, compiled, names.O), f.basis.O, names.O + " is accepted O");
  same(value(f, compiled, names.C), f.basis.C, names.C + " is accepted C");
  same(value(f, compiled, names.L), f.basis.L, names.L + " is accepted L");
  same(value(f, compiled, names.U), f.basis.U, names.U + " is accepted U");

  const u = value(f, compiled, names.U);
  const poles = f.memory.poles(u);
  same(poles.start, f.basis.C, "U start pole is accepted C");
  same(poles.end, f.basis.O, "U end pole is accepted O");
  assert(poles.start !== u, "U is not START-self-incidental");
  assert(poles.end !== u, "U is not END-self-incidental");
  assert(new Set([f.basis.R, f.basis.O, f.basis.C, f.basis.L, f.basis.U]).size === 5,
    "root basis representatives remain structurally distinct");
  assert(u !== f.basis.R && u !== f.basis.O && u !== f.basis.C && u !== f.basis.L,
    "U remains an ordinary Link distinct from the other named root-basis representatives");

  const premises = readExactSequence(f.memory, value(f, compiled, "FND04_PREMISES")).values;
  same(premises.length, 0, "FND-04 has no independent formal premise");

  const conclusion = readExactSequence(f.memory, value(f, compiled, "FND04_CONCLUSION")).values;
  same(conclusion.length, 1, "FND-04 conclusion carries only the derived U representative");
  same(conclusion[0], u, "FND-04 conclusion is exact U");

  const statement = f.memory.poles(value(f, compiled, "FND04_STATEMENT"));
  same(statement.start, value(f, compiled, "FND04_PREMISES"), "statement premise carrier");
  same(statement.end, value(f, compiled, "FND04_CONCLUSION"), "statement conclusion carrier");

  const json = encodeV015FormalSourceAsetJson(
    f.memory,
    f.basis,
    f.grammarRoot,
    f.namespaceProfileRoot,
    f.definitionProfileRoot,
    compiled.source.sourceAset,
  );
  assert(
    decoder.decode(json).includes('"schema":"' + V015_FORMAL_JSON_J1_SCHEMA + '"'),
    "strict J1 projection",
  );
  const round = decodeV015FormalSourceAsetJson(
    f.memory,
    f.basis,
    f.grammarRoot,
    f.namespaceProfileRoot,
    f.definitionProfileRoot,
    json,
  );
  same(round.sourceAset, compiled.source.sourceAset, "J1 preserves exact native source ANet");
  sameBytes(round.canonicalJson, json, "J1 canonical bytes");
}

const first = fixture();
const compiled = compile(first, source);
verifyCandidate(first, compiled, canonicalNames);

const second = fixture();
const compiledSecond = compile(second, source);
verifyCandidate(second, compiledSecond, canonicalNames);
sameBytes(
  wire(first, compiled, "FND04_STATEMENT"),
  wire(second, compiledSecond, "FND04_STATEMENT"),
  "fresh-Memory recursive statement wire",
);

const renamed = fixture();
const renamedCompiled = compile(renamed, sourceFor(renamedNames));
verifyCandidate(renamed, renamedCompiled, renamedNames);
sameBytes(
  wire(first, compiled, "FND04_STATEMENT"),
  wire(renamed, renamedCompiled, "FND04_STATEMENT"),
  "topology-preserving presentation rename keeps theorem statement identity",
);

{
  const wrong = fixture();
  const mutated = compile(wrong, source.replace("U : C->O", "U : O->C"));
  same(value(wrong, mutated, "U"), wrong.basis.L, "reversed U collapses to L topology");
  assert(value(wrong, mutated, "U") !== wrong.basis.U, "reversed U cannot denote accepted U");
  differentBytes(
    wire(first, compiled, "FND04_STATEMENT"),
    wire(wrong, mutated, "FND04_STATEMENT"),
    "reversing U poles must change statement identity",
  );
}
{
  const wrong = fixture();
  const mutated = compile(wrong, source.replace("FND04_CONCLUSION : [U]", "FND04_CONCLUSION : [L]"));
  differentBytes(
    wire(first, compiled, "FND04_STATEMENT"),
    wire(wrong, mutated, "FND04_STATEMENT"),
    "replacing derived U by L must change statement identity",
  );
}

console.log([
  "MTS v0.15 B24 FND-04 FORMAL statement:",
  "MIGRATION_STATUS=FORMAL_MIGRATED",
  "FORMAL_ARTIFACT_KIND=STATEMENT_ONLY",
  "FORMAL_PREMISES=0",
  "FORMAL_DEPENDENCIES=FND-03",
  "ACCEPTED_REQUIREMENTS=V15-ONTO-01+V15-ONTO-02+V15-ONTO-03+V15-STRUCT-01",
  "U_DENOTATION=EXACT_C_TO_O",
  "PAIR_LOCAL=TOPOLOGY_CHECKED",
  "FIFTH_CLASS=EXCLUDED_BY_FND03_PLUS_PAIR_LOCAL",
  "ONE_LINK_ONTOLOGY=UNCHANGED",
  "PRESENTATION_RENAME=SEMANTICALLY_STABLE",
  "FRESH_MEMORY_WIRE_PARITY=GREEN",
  "JSON_J1=EXACT",
  "PAIR_REVERSAL_MUTATION=DIFF",
  "CONCLUSION_MUTATION=DIFF",
  "HISTORICAL_EXTERNAL_PROOF=UNCHANGED",
  "NATIVE_PROOF=NOT_CLAIMED",
  "APROVER_ACCEPT=NOT_CLAIMED",
].join(" "));
