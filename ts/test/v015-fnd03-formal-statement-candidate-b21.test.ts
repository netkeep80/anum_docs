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
  if (!value) throw new Error("v0.15 B21 FND-03 candidate FORMAL statement: " + message);
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

  const grammarRoot = materializeNativeSyntaxGrammar(memory, basis, {
    syntaxTag,
    markerSeed,
    rules,
  });
  const namespaceProfileRoot = materializeSourceNamespaceProfile(memory, {
    blockForm,
    declarationForm,
    blockItemRole,
    declarationNameRole,
    declarationBodyRole,
    sequenceForm,
    sequenceItemRole,
  });
  const definitionProfileRoot = materializeV015LinkDefinitionProfile(memory, {
    pairForm,
    nameRefForm,
    pairLeftRole,
    pairRightRole,
    referencedNameRole,
  });
  return Object.freeze({
    memory,
    basis,
    grammarRoot,
    namespaceProfileRoot,
    definitionProfileRoot,
  });
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

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

const source = [
  "R : R->R",
  "O : O->R",
  "C : R->C",
  "L : O->C",
  "FND03_PREMISES : []",
  "FND03_CONCLUSION : [R,O,C,L]",
  "FND03_STATEMENT : FND03_PREMISES->FND03_CONCLUSION",
].join("\n");

function verifyCandidate(f: Fixture, compiled: V015FormalRecursiveCompileResult): void {
  same(value(f, compiled, "R"), f.basis.R, "R is the accepted ROOT representative");
  same(value(f, compiled, "O"), f.basis.O, "O is the accepted one-sided representative");
  same(value(f, compiled, "C"), f.basis.C, "C is the opposite one-sided representative");
  same(value(f, compiled, "L"), f.basis.L, "L is the ordinary O->C PAIR representative");

  const premises = readExactSequence(f.memory, value(f, compiled, "FND03_PREMISES")).values;
  same(premises.length, 0, "FND-03 has no independent formal premise");

  const conclusion = readExactSequence(f.memory, value(f, compiled, "FND03_CONCLUSION")).values;
  same(conclusion.length, 4, "FND-03 conclusion carries four derived representatives");
  same(conclusion[0], f.basis.R, "conclusion R");
  same(conclusion[1], f.basis.O, "conclusion O");
  same(conclusion[2], f.basis.C, "conclusion C");
  same(conclusion[3], f.basis.L, "conclusion L");

  const statement = f.memory.poles(value(f, compiled, "FND03_STATEMENT"));
  same(statement.start, value(f, compiled, "FND03_PREMISES"), "statement premise carrier");
  same(statement.end, value(f, compiled, "FND03_CONCLUSION"), "statement conclusion carrier");

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
verifyCandidate(first, compiled);

const second = fixture();
const compiledSecond = compile(second, source);
verifyCandidate(second, compiledSecond);
sameBytes(
  wire(first, compiled, "FND03_STATEMENT"),
  wire(second, compiledSecond, "FND03_STATEMENT"),
  "fresh-Memory recursive statement wire",
);

{
  const wrong = fixture();
  const mutated = compile(wrong, source.replace("L : O->C", "L : C->O"));
  assert(
    value(wrong, mutated, "L") !== wrong.basis.L,
    "reversing the derived PAIR cannot still denote accepted L",
  );
}
{
  const wrong = fixture();
  const mutated = compile(wrong, source.replace("[R,O,C,L]", "[R,O,C]"));
  assert(
    readExactSequence(wrong.memory, value(wrong, mutated, "FND03_CONCLUSION")).values.length === 3,
    "missing representative changes exact conclusion identity",
  );
}

console.log([
  "MTS v0.15 B21 FND-03 candidate FORMAL statement:",
  "MIGRATION_STATUS=CANDIDATE_NOT_PROMOTED",
  "FORMAL_ARTIFACT_KIND=STATEMENT_ONLY",
  "FORMAL_PREMISES=0",
  "FORMAL_DEPENDENCIES=FND-01+FND-02",
  "DERIVED_REPRESENTATIVES=R+O+C+L",
  "FOUR_PRIMITIVE_ONTOLOGY_CONSTRUCTORS=0",
  "ROOT_BASIS_DENOTATION=EXACT",
  "FRESH_MEMORY_WIRE_PARITY=GREEN",
  "JSON_J1=EXACT",
  "PAIR_REVERSAL_MUTATION=REJECTED",
  "MISSING_REPRESENTATIVE_MUTATION=DIFF",
  "NATIVE_PROOF=NOT_CLAIMED",
  "APROVER_ACCEPT=NOT_CLAIMED",
].join(" "));
