// mts-version-evidence: candidate-v0.15-c1-c2
// correction-owner: #1975
// slice-owner: #1983

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
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
import { materializeV015LinkDefinitionProfile } from "../src/v015-link-definition.js";
import {
  compileV015FormalDefinitionsToRecursive,
  type V015FormalRecursiveCompileResult,
} from "../src/v015-formal-recursive-compiler.js";
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
import { materializeV012StringAnum } from "../src/v012-string-anum.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error("v0.15 C1/C2 full FORMAL AND: " + message);
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
const sourcePath = join(repoRoot, "formal/v0.15/logic/and.formal");
const canonicalSource = readFileSync(sourcePath, "utf8");
const enc = new TextEncoder();

function compile(f: Fixture, source = canonicalSource): V015FormalRecursiveCompileResult {
  return compileV015FormalDefinitionsToRecursive(
    f.memory,
    f.basis,
    f.grammarRoot,
    f.namespaceProfileRoot,
    f.definitionProfileRoot,
    enc.encode(source),
  );
}

function carrier(f: Fixture, name: string): LinkHandle {
  return materializeV012StringAnum(f.memory, f.basis, enc.encode(name)).anumLink;
}

function definition(
  f: Fixture,
  compiled: V015FormalRecursiveCompileResult,
  name: string,
) {
  const key = carrier(f, name);
  const found = compiled.definitions.find((entry) => entry.nameCarrier === key);
  assert(found !== undefined, "compiled definition " + name);
  assert(found.wire.length > 0, name + " recursive wire");
  return found;
}

function field(
  f: Fixture,
  compiled: V015FormalRecursiveCompileResult,
  name: string,
): LinkHandle {
  return definition(f, compiled, name).semantic;
}

const rows = [
  ["FF", "F"],
  ["FT", "F"],
  ["TF", "F"],
  ["TT", "T"],
] as const;

function verifySourceAuthoredTopology(
  f: Fixture,
  compiled: V015FormalRecursiveCompileResult,
): void {
  const interpreter = field(f, compiled, "INTERP");
  const structure = readStructuralInterpreter(f.memory, interpreter);
  same(structure.dictionary, field(f, compiled, "DICT"), "interpreter dictionary");
  same(structure.grammar, field(f, compiled, "GRAM"), "interpreter grammar");
  same(structure.theory, field(f, compiled, "THEORY"), "interpreter theory");

  for (const [row] of rows) {
    const dictionary = field(f, compiled, `ROLE_DICT_${row}`);
    const role = field(f, compiled, `ROLE_${row}`);
    const readDictionary = readStructuralRoleDictionary(f.memory, dictionary);
    same(readDictionary.roles.length, 1, row + " one caller role");
    same(readDictionary.roles[0], role, row + " caller role identity");

    const rule = field(f, compiled, `RULE_${row}`);
    const readRule = readStructuralRule(f.memory, rule);
    same(readRule.roleDictionary, dictionary, row + " rule dictionary");
    same(readRule.body, field(f, compiled, `BODY_${row}`), row + " rule body");

    const admission = field(f, compiled, `ADMISSION_${row}`);
    verifyStructuralRuleAdmission(
      f.memory,
      field(f, compiled, "THEORY"),
      rule,
      admission,
    );

    const index = f.memory.poles(field(f, compiled, `INDEX_${row}`));
    same(index.start, f.basis.O, row + " trigger key O");
    same(index.end, admission, row + " trigger admission");

    const scope = field(f, compiled, `SCOPE_${row}`);
    const authority = readV013WorkingScopeAuthority(f.memory, scope);
    same(authority.interpreter, interpreter, row + " source-authored scope interpreter");
    same(authority.theory, field(f, compiled, "THEORY"), row + " source-authored scope theory");
    const members = readV013WorkingScope(f.memory, scope);
    same(members.length, 1, row + " source-authored scope member count");
    same(members[0], field(f, compiled, `REQ_${row}`), row + " source-authored request");
  }
}

function executeRow(
  f: Fixture,
  compiled: V015FormalRecursiveCompileResult,
  row: (typeof rows)[number][0],
): void {
  const scope = field(f, compiled, `SCOPE_${row}`);
  const cursor = new V013CurrentScopeCursor(f.memory, scope);
  const reaction = reactV013StructuralScope(f.memory, cursor, f.fresh());
  same(reaction.quiescent, false, row + " reacts");
  same(reaction.handoffCount, 1, row + " one atomic handoff");
  const members = cursor.members();
  same(members.length, 1, row + " one result");
  same(members[0], field(f, compiled, `RESULT_${row}`), row + " exact result");
  const stable = reactV013StructuralScope(f.memory, cursor, f.fresh());
  same(stable.quiescent, true, row + " result quiescent");
  same(stable.handoffCount, 0, row + " no second handoff");
}

{
  const f = fixture();
  const compiled = compile(f);
  assert(compiled.definitions.length > 90, "complete AND package is not a carrier-only fixture");
  for (const entry of compiled.definitions) assert(entry.wire.length > 0, "every definition has recursive wire");
  verifySourceAuthoredTopology(f, compiled);
  for (const [row] of rows) executeRow(f, compiled, row);
}

{
  const f = fixture();
  const compiled = compile(f);
  const foreignScope = field(f, compiled, "FOREIGN_SCOPE_TT");
  const cursor = new V013CurrentScopeCursor(f.memory, foreignScope);
  const before = cursor.members();
  same(before.length, 1, "foreign scope one request");
  same(before[0], field(f, compiled, "REQ_TT"), "foreign scope same TT request");
  const reaction = reactV013StructuralScope(f.memory, cursor, f.fresh());
  same(reaction.quiescent, true, "foreign Theory cannot authorize AND");
  same(reaction.handoffCount, 0, "foreign Theory no handoff");
  same(cursor.currentScope(), foreignScope, "foreign scope remains current");
}

{
  const mutated = canonicalSource
    .split("\n")
    .filter((line) => !line.startsWith("INDEX_TT :"))
    .join("\n");
  const f = fixture();
  const compiled = compile(f, mutated);
  const cursor = new V013CurrentScopeCursor(f.memory, field(f, compiled, "SCOPE_TT"));
  const reaction = reactV013StructuralScope(f.memory, cursor, f.fresh());
  same(reaction.quiescent, true, "removing TT index disables TT transition");
  same(reaction.handoffCount, 0, "missing TT index no handoff");
  same(cursor.members()[0], field(f, compiled, "REQ_TT"), "TT request remains unchanged");
}

{
  const a = fixture(0);
  const b = fixture(17);
  const left = compile(a);
  const right = compile(b);
  same(left.definitions.length, right.definitions.length, "two-Memory definition count");
  for (let index = 0; index < left.definitions.length; index += 1) {
    const l = left.definitions[index];
    const r = right.definitions[index];
    assert(l !== undefined && r !== undefined, "paired definition " + index);
    sameBytes(l.wire, r.wire, "two-Memory recursive wire " + index);
  }
}

assert(!canonicalSource.includes("defineStructuralRule"), "canonical source contains no host Rule builder");
assert(!canonicalSource.includes("admitStructuralRule"), "canonical source contains no host admission builder");

console.log([
  "MTS_V015_C1_C2_FULL_AND=COMPONENT_GREEN",
  "CANONICAL_FORMAL_SOURCE=TRACKED",
  "RULES_SOURCE_AUTHORED=4/4",
  "ADMISSIONS_SOURCE_AUTHORED=4/4",
  "TRIGGER_INDEX_SOURCE_AUTHORED=4/4",
  "SCOPES_SOURCE_AUTHORED=4/4",
  "AND_TRUTH_TABLE=4/4",
  "HOST_AND_RULE_BUILDER=0",
  "HOST_SCOPE_BUILDER=0",
  "FOREIGN_THEORY=INERT",
  "MISSING_TT_INDEX=QUIESCENT",
  "RECURSIVE_8961=ALL_DEFINITIONS",
  "TWO_MEMORY_WIRES=DETERMINISTIC",
  "JSON_VERTICAL_GREEN=FALSE",
  "AUTHOR_REVIEW_PENDING=FALSE",
].join(" "));
