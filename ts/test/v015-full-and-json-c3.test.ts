// mts-version-evidence: candidate-v0.15-c3-author-review-pending
// owner: #1980
// requirements: #1976 #1978

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

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
  readStructuralInterpreter,
  readStructuralRoleDictionary,
  readStructuralRule,
  verifyStructuralRuleAdmission,
} from "../src/structural-rule.js";
import {
  readV013WorkingScope,
  readV013WorkingScopeAuthority,
  reactV013StructuralScope,
  V013CurrentScopeCursor,
} from "../src/v013-structural-execution.js";
import {
  decodeV015FormalSourceAsetJson,
  encodeV015FormalSourceAsetJson,
} from "../src/v015-formal-decoder.js";
import {
  compileV015FormalDefinitionsToRecursive,
  compileV015FormalSourceAsetToRecursive,
  type V015FormalSourceAsetRecursiveCompileResult,
} from "../src/v015-formal-recursive-compiler.js";
import { materializeV015LinkDefinitionProfile } from "../src/v015-link-definition.js";
import { materializeV012StringAnum } from "../src/v012-string-anum.js";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error("v0.15 C3 full AND JSON: " + message);
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}
function sameBytes(actual: Uint8Array, expected: Uint8Array, message: string): void {
  same(actual.length, expected.length, message + " length");
  for (let index = 0; index < actual.length; index += 1) {
    same(actual[index], expected[index], `${message} byte ${index}`);
  }
}

interface Fixture {
  readonly memory: Memory;
  readonly basis: RootBasis;
  readonly grammarRoot: LinkHandle;
  readonly namespaceProfileRoot: LinkHandle;
  readonly definitionProfileRoot: LinkHandle;
  readonly fresh: () => LinkHandle;
}

function fixture(noise = 0): Fixture {
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  let cursor = memory.ensure(basis.U, basis.L);
  for (let index = 0; index < noise; index += 1) {
    cursor = memory.ensure(cursor, index % 2 === 0 ? basis.O : basis.C);
  }
  const fresh = (): LinkHandle => (cursor = memory.ensure(cursor, basis.C));

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
    {
      form: pairForm,
      fields: [
        { role: pairLeftRole, target: "child", min: 1, max: 1 },
        { role: pairRightRole, target: "child", min: 1, max: 1 },
      ],
    },
    {
      form: nameRefForm,
      fields: [{ role: referencedNameRole, target: "carrier", min: 1, max: 1 }],
    },
    {
      form: declarationForm,
      fields: [
        { role: declarationNameRole, target: "carrier", min: 1, max: 1 },
        { role: declarationBodyRole, target: "child", min: 1, max: 1 },
      ],
    },
    {
      form: blockForm,
      fields: [{ role: blockItemRole, target: "child", min: 0, max: null }],
    },
    {
      form: sequenceForm,
      fields: [{ role: sequenceItemRole, target: "child", min: 0, max: null }],
    },
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
  });
  const definitionProfileRoot = materializeV015LinkDefinitionProfile(memory, {
    pairForm,
    nameRefForm,
    pairLeftRole,
    pairRightRole,
    referencedNameRole,
    sequenceForm,
    sequenceItemRole,
  });
  return Object.freeze({
    memory,
    basis,
    grammarRoot,
    namespaceProfileRoot,
    definitionProfileRoot,
    fresh,
  });
}

const repoRoot = resolve(process.cwd(), "..");
const sourceBytes = readFileSync(join(repoRoot, "formal/v0.15/logic/and.formal"));
const jsonBytes = readFileSync(join(repoRoot, "formal/v0.15/logic/and.json"));
const enc = new TextEncoder();
const dec = new TextDecoder();

function carrier(f: Fixture, name: string): LinkHandle {
  return materializeV012StringAnum(f.memory, f.basis, enc.encode(name)).anumLink;
}
function definition(
  f: Fixture,
  compiled: V015FormalSourceAsetRecursiveCompileResult,
  name: string,
) {
  const key = carrier(f, name);
  const found = compiled.definitions.find((entry) => entry.nameCarrier === key);
  assert(found !== undefined, "definition " + name);
  return found;
}
function value(
  f: Fixture,
  compiled: V015FormalSourceAsetRecursiveCompileResult,
  name: string,
): LinkHandle {
  return definition(f, compiled, name).semantic;
}
function wire(
  f: Fixture,
  compiled: V015FormalSourceAsetRecursiveCompileResult,
  name: string,
): Uint8Array {
  return definition(f, compiled, name).wire;
}
function compileJson(f: Fixture, input: Uint8Array) {
  const decoded = decodeV015FormalSourceAsetJson(
    f.memory,
    f.basis,
    f.grammarRoot,
    f.namespaceProfileRoot,
    f.definitionProfileRoot,
    input,
  );
  const compiled = compileV015FormalSourceAsetToRecursive(
    f.memory,
    f.basis,
    f.grammarRoot,
    f.namespaceProfileRoot,
    f.definitionProfileRoot,
    decoded.sourceAset,
  );
  return { decoded, compiled };
}
function executeSourceScope(
  f: Fixture,
  compiled: V015FormalSourceAsetRecursiveCompileResult,
  row: "FF" | "FT" | "TF" | "TT",
) {
  const scope = value(f, compiled, `SCOPE_${row}`);
  const authority = readV013WorkingScopeAuthority(f.memory, scope);
  same(authority.interpreter, value(f, compiled, "INTERP"), row + " scope interpreter");
  same(authority.theory, value(f, compiled, "THEORY"), row + " scope Theory");
  const before = readV013WorkingScope(f.memory, scope);
  same(before.length, 1, row + " one source-authored current member");
  same(before[0], value(f, compiled, `REQ_${row}`), row + " current request");
  const cursor = new V013CurrentScopeCursor(f.memory, scope);
  const reaction = reactV013StructuralScope(f.memory, cursor, f.fresh());
  return { reaction, cursor };
}

const f = fixture();
const textCompiled = compileV015FormalDefinitionsToRecursive(
  f.memory,
  f.basis,
  f.grammarRoot,
  f.namespaceProfileRoot,
  f.definitionProfileRoot,
  sourceBytes,
);
const canonicalJson = encodeV015FormalSourceAsetJson(
  f.memory,
  f.basis,
  f.grammarRoot,
  f.namespaceProfileRoot,
  f.definitionProfileRoot,
  textCompiled.source.sourceAset,
);
sameBytes(canonicalJson, jsonBytes, "tracked JSON exact canonical encoder bytes");

const jsonCompiled = compileJson(f, jsonBytes);
same(
  jsonCompiled.decoded.sourceAset,
  textCompiled.source.sourceAset,
  "FORMAL and JSON converge on exact same native source Aset",
);
same(jsonCompiled.compiled.definitions.length, 109, "complete AND definition count");
same(textCompiled.definitions.length, 109, "FORMAL definition count");
for (const textDefinition of textCompiled.definitions) {
  const fromJson = jsonCompiled.compiled.definitions.find(
    (entry) => entry.nameCarrier === textDefinition.nameCarrier,
  );
  assert(fromJson !== undefined, "JSON compiled definition exists");
  sameBytes(fromJson.wire, textDefinition.wire, "FORMAL/JSON recursive wire parity");
}

const interpreter = value(f, jsonCompiled.compiled, "INTERP");
const interpreterRead = readStructuralInterpreter(f.memory, interpreter);
same(interpreterRead.theory, value(f, jsonCompiled.compiled, "THEORY"), "Interpreter Theory");
for (const row of ["FF", "FT", "TF", "TT"] as const) {
  const dictionary = value(f, jsonCompiled.compiled, `ROLE_DICT_${row}`);
  const roles = readStructuralRoleDictionary(f.memory, dictionary).roles;
  same(roles.length, 1, row + " dictionary arity");
  same(roles[0], value(f, jsonCompiled.compiled, `ROLE_${row}`), row + " role");

  const rule = value(f, jsonCompiled.compiled, `RULE_${row}`);
  const ruleRead = readStructuralRule(f.memory, rule);
  same(ruleRead.roleDictionary, dictionary, row + " Rule dictionary");
  same(ruleRead.body, value(f, jsonCompiled.compiled, `BODY_${row}`), row + " Rule body");
  verifyStructuralRuleAdmission(
    f.memory,
    value(f, jsonCompiled.compiled, "THEORY"),
    rule,
    value(f, jsonCompiled.compiled, `ADMISSION_${row}`),
  );

  const index = f.memory.poles(value(f, jsonCompiled.compiled, `INDEX_${row}`));
  same(index.start, f.basis.O, row + " trigger key");
  same(index.end, value(f, jsonCompiled.compiled, `ADMISSION_${row}`), row + " trigger admission");

  const { reaction, cursor } = executeSourceScope(f, jsonCompiled.compiled, row);
  same(reaction.rawRuleMatches, 1, row + " exactly one Rule");
  same(reaction.handoffCount, 1, row + " one atomic handoff");
  same(cursor.members().length, 1, row + " one result");
  same(cursor.members()[0], value(f, jsonCompiled.compiled, `RESULT_${row}`), row + " result");
}

{
  const scope = value(f, jsonCompiled.compiled, "FOREIGN_SCOPE_TT");
  const cursor = new V013CurrentScopeCursor(f.memory, scope);
  const reaction = reactV013StructuralScope(f.memory, cursor, f.fresh());
  same(reaction.rawRuleMatches, 0, "foreign Theory inert");
  same(reaction.handoffCount, 0, "foreign Theory no handoff");
  same(cursor.members()[0], value(f, jsonCompiled.compiled, "REQ_TT"), "foreign request preserved");
}

{
  const raw = JSON.parse(dec.decode(jsonBytes)) as Record<string, unknown>;
  delete raw.INDEX_TT;
  const mutatedBytes = enc.encode(JSON.stringify(raw) + "\n");
  const m = fixture();
  const mutated = compileJson(m, mutatedBytes).compiled;
  const scope = value(m, mutated, "SCOPE_TT");
  const cursor = new V013CurrentScopeCursor(m.memory, scope);
  const reaction = reactV013StructuralScope(m.memory, cursor, m.fresh());
  same(reaction.rawRuleMatches, 0, "removing JSON INDEX_TT removes TT semantics");
  same(reaction.handoffCount, 0, "mutated TT no handoff");
  same(cursor.members()[0], value(m, mutated, "REQ_TT"), "mutated TT request remains");
}

{
  const a = fixture(0);
  const b = fixture(17);
  const left = compileJson(a, jsonBytes).compiled;
  const right = compileJson(b, jsonBytes).compiled;
  for (const name of [
    "INTERP",
    "INDEX_FF",
    "INDEX_FT",
    "INDEX_TF",
    "INDEX_TT",
    "SCOPE_FF",
    "SCOPE_FT",
    "SCOPE_TF",
    "SCOPE_TT",
    "ENTRY",
    "FOREIGN_LAUNCH_TT",
  ]) {
    sameBytes(wire(a, left, name), wire(b, right, name), "two-Memory recursive wire " + name);
  }
}

const recursivePackage = Object.freeze({
  schema: "mts-v015-recursive-execution-package/v0.1",
  links: ["INDEX_FF", "INDEX_FT", "INDEX_TF", "INDEX_TT"].map(
    (name) => dec.decode(wire(f, jsonCompiled.compiled, name)),
  ),
  entry: dec.decode(wire(f, jsonCompiled.compiled, "ENTRY")),
  negativeEntry: dec.decode(wire(f, jsonCompiled.compiled, "FOREIGN_LAUNCH_TT")),
});
console.log("AMEMORY_RECURSIVE_PACKAGE=" + JSON.stringify(recursivePackage));

console.log([
  "MTS_V015_C3=AUTHOR_REVIEW_PENDING",
  "CANONICAL_FORMAL=TRACKED",
  "CANONICAL_JSON=EXACT",
  "JSON_FORM=DIRECT_BINDERS",
  "JSON_LINK_VALUE=FORMAL_STRING",
  "JSON_ARRAY=R_ROOTED_SEQUENCE",
  "SOURCE_ASET_IDENTITY=EXACT",
  "SHARED_METACOMPILER=TRUE",
  "RECURSIVE_8961=DETERMINISTIC",
  "LOCAL_AND=4/4",
  "HOST_RULE_INJECTION=0",
  "HOST_SCOPE_INJECTION=0",
  "FOREIGN_THEORY=INERT",
  "JSON_TT_MUTATION=CHANGES_BEHAVIOR",
  "REAL_AMEMORY=PENDING_REPLAY_OF_EMITTED_PACKAGE",
  "VERTICAL_GREEN=FALSE",
].join(" "));
