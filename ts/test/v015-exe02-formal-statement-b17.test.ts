import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  materializeExactSequence,
  readExactSequence,
} from "../src/exact-sequence.js";
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
import {
  defineStructuralRoleDictionary,
  readStructuralRoleDictionary,
} from "../src/structural-rule.js";
import { instantiateV013StructuralTemplate } from "../src/v013-structural-execution.js";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error("v0.15 B17 EXE-02 FORMAL statement: " + message);
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

  const rules: NativeSyntaxGrammarRuleSpec[] = [
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
  });
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

interface FormalOverlayEntry {
  readonly id: string;
  readonly migrationStatus: string;
  readonly proofClosure: string;
  readonly formalStatement: string;
  readonly formalPremises: readonly string[];
  readonly formalDomain?: readonly string[];
  readonly formalNonPremises?: readonly string[];
  readonly formalSourcePath: string;
  readonly aproverStatus: string;
}

function repositoryRoot(): string {
  const candidates = [resolve(process.cwd(), ".."), process.cwd()];
  const root = candidates.find((candidate) =>
    existsSync(resolve(candidate, "theorems/formal-v0.15.json"))
  );
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

const exe02Formal = formalOverlayEntry("EXE-02");

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

function nameCarrier(f: Fixture, name: string): LinkHandle {
  return materializeV012StringAnum(
    f.memory,
    f.basis,
    encoder.encode(name),
  ).anumLink;
}

function value(
  f: Fixture,
  result: V015FormalRecursiveCompileResult,
  name: string,
): LinkHandle {
  const carrier = nameCarrier(f, name);
  const definition = result.definitions.find(
    (candidate) => candidate.nameCarrier === carrier,
  );
  assert(definition !== undefined, "missing definition " + name);
  return definition.semantic;
}

function exe02Source(roleNames: readonly string[]): string {
  assert(roleNames.length === 8, "EXE-02 source requires eight role names");
  const a = roleNames[0]!;
  const ap = roleNames[1]!;
  const b = roleNames[2]!;
  const bp = roleNames[3]!;
  const x = roleNames[4]!;
  const y = roleNames[5]!;
  const c = roleNames[6]!;
  const d = roleNames[7]!;

  return [
    "R : R->R",
    "O : O->R",
    "C : R->C",
    "L : O->C",
    "U : C->O",

    a + " : U->L",
    ap + " : " + a + "->O",
    b + " : " + ap + "->O",
    bp + " : " + b + "->O",
    x + " : " + bp + "->O",
    y + " : " + x + "->O",
    c + " : " + y + "->O",
    d + " : " + c + "->O",

    "LINK_DOMAIN_TAG : U->R",
    "NEQ_TAG : R->U",
    "EQ_TAG : O->U",
    "FORM_TAG : C->U",
    "POLE_READING_TAG : L->R",
    "OR_TAG : U->C",
    "AND_TAG : C->L",

    "DOMAIN_A : LINK_DOMAIN_TAG->" + a,
    "DOMAIN_AP : LINK_DOMAIN_TAG->" + ap,
    "DOMAIN_B : LINK_DOMAIN_TAG->" + b,
    "DOMAIN_BP : LINK_DOMAIN_TAG->" + bp,
    "DOMAIN_X : LINK_DOMAIN_TAG->" + x,
    "DOMAIN_Y : LINK_DOMAIN_TAG->" + y,
    "DOMAIN_C : LINK_DOMAIN_TAG->" + c,
    "DOMAIN_D : LINK_DOMAIN_TAG->" + d,

    "NEQ_A_ARGS : [" + a + "," + ap + "]",
    "NEQ_A : NEQ_TAG->NEQ_A_ARGS",
    "NEQ_B_ARGS : [" + b + "," + bp + "]",
    "NEQ_B : NEQ_TAG->NEQ_B_ARGS",
    "CHANGED_POLE_ARGS : [NEQ_A,NEQ_B]",
    "CHANGED_POLE : OR_TAG->CHANGED_POLE_ARGS",
    "FORM_AB_ARGS : [" + a + "," + b + "]",
    "FORM_AB : FORM_TAG->FORM_AB_ARGS",
    "FORM_APBP_ARGS : [" + ap + "," + bp + "]",
    "FORM_APBP : FORM_TAG->FORM_APBP_ARGS",
    "FORM_CHANGED_ARGS : [FORM_AB,FORM_APBP]",
    "FORM_CHANGED : NEQ_TAG->FORM_CHANGED_ARGS",
    "EXE02_CLAUSE1 : CHANGED_POLE->FORM_CHANGED",

    "READ1_ARGS : [" + x + "," + a + "," + b + "]",
    "READ1 : POLE_READING_TAG->READ1_ARGS",
    "READ2_ARGS : [" + x + "," + ap + "," + bp + "]",
    "READ2 : POLE_READING_TAG->READ2_ARGS",
    "READ_PAIR_ARGS : [READ1,READ2]",
    "READ_PAIR : AND_TAG->READ_PAIR_ARGS",
    "EQ_A_ARGS : [" + a + "," + ap + "]",
    "EQ_A : EQ_TAG->EQ_A_ARGS",
    "EQ_B_ARGS : [" + b + "," + bp + "]",
    "EQ_B : EQ_TAG->EQ_B_ARGS",
    "POLE_EQ_ARGS : [EQ_A,EQ_B]",
    "POLE_EQ : AND_TAG->POLE_EQ_ARGS",
    "EXE02_CLAUSE2 : READ_PAIR->POLE_EQ",

    "NEQ_XY_ARGS : [" + x + "," + y + "]",
    "NEQ_XY : NEQ_TAG->NEQ_XY_ARGS",
    "FORM_XC_ARGS : [" + x + "," + c + "]",
    "FORM_XC : FORM_TAG->FORM_XC_ARGS",
    "FORM_YC_ARGS : [" + y + "," + c + "]",
    "FORM_YC : FORM_TAG->FORM_YC_ARGS",
    "START_SUBST_ARGS : [FORM_XC,FORM_YC]",
    "START_SUBST_NEQ : NEQ_TAG->START_SUBST_ARGS",
    "EXE02_CLAUSE3 : NEQ_XY->START_SUBST_NEQ",

    "FORM_DX_ARGS : [" + d + "," + x + "]",
    "FORM_DX : FORM_TAG->FORM_DX_ARGS",
    "FORM_DY_ARGS : [" + d + "," + y + "]",
    "FORM_DY : FORM_TAG->FORM_DY_ARGS",
    "END_SUBST_ARGS : [FORM_DX,FORM_DY]",
    "END_SUBST_NEQ : NEQ_TAG->END_SUBST_ARGS",
    "EXE02_CLAUSE4 : NEQ_XY->END_SUBST_NEQ",

    "EXE02_PREMISES : []",
    "EXE02_CLAUSES : [EXE02_CLAUSE1,EXE02_CLAUSE2,EXE02_CLAUSE3,EXE02_CLAUSE4]",
    exe02Formal.formalStatement,
    "BOUND_ROLES : [" + roleNames.join(",") + "]",

    "V0 : " + d + "->R",
    "V1 : V0->R",
    "V2 : V1->R",
    "V3 : V2->R",
    "V4 : V3->R",
    "V5 : V4->R",
    "V6 : V5->R",
    "V7 : V6->R",
    "W0 : V7->R",
    "W1 : W0->R",
    "W2 : W1->R",
    "W3 : W2->R",
    "W4 : W3->R",
    "W5 : W4->R",
    "W6 : W5->R",
    "W7 : W6->R",
  ].join("\n");
}

function freeSameSpellingSource(): string {
  return [
    "R : R->R",
    "O : O->R",
    "C : R->C",
    "L : O->C",
    "U : C->O",
    "A0 : R->U",
    "X : C->R",
    "FREE_TAG : U->R",
    "FREE_ARGS : [A0,X]",
    "FREE_CLAIM : FREE_TAG->FREE_ARGS",
  ].join("\n");
}

function bindings(
  f: Fixture,
  result: V015FormalRecursiveCompileResult,
  roles: readonly LinkHandle[],
  prefix: "V" | "W",
): readonly Readonly<{ role: LinkHandle; value: LinkHandle }>[] {
  return roles.map((role, index) => Object.freeze({
    role,
    value: value(f, result, prefix + String(index)),
  }));
}

function inspectStatement(
  f: Fixture,
  result: V015FormalRecursiveCompileResult,
  template: LinkHandle,
  actual: LinkHandle,
  actualBindings: readonly Readonly<{ role: LinkHandle; value: LinkHandle }>[],
  label: string,
): void {
  const statement = f.memory.poles(actual);
  same(statement.start, value(f, result, "EXE02_PREMISES"), label + " zero-premise carrier");
  same(
    readExactSequence(f.memory, statement.start).values.length,
    0,
    label + " zero formal premises",
  );

  const clauses = readExactSequence(f.memory, statement.end).values;
  same(clauses.length, 4, label + " exact clause count");
  for (let index = 0; index < 4; index += 1) {
    const sourceClause = value(f, result, "EXE02_CLAUSE" + String(index + 1));
    const expected = instantiateV013StructuralTemplate(
      f.memory,
      sourceClause,
      actualBindings,
    );
    same(clauses[index], expected, label + " exact clause " + String(index + 1));
  }

  same(
    actual,
    instantiateV013StructuralTemplate(f.memory, template, actualBindings),
    label + " whole theorem structural instantiation",
  );

  const clause1 = f.memory.poles(clauses[0]!);
  same(
    clause1.start,
    instantiateV013StructuralTemplate(
      f.memory,
      value(f, result, "CHANGED_POLE"),
      actualBindings,
    ),
    label + " changed-pole premise",
  );
  same(
    clause1.end,
    instantiateV013StructuralTemplate(
      f.memory,
      value(f, result, "FORM_CHANGED"),
      actualBindings,
    ),
    label + " changed-formed-Link conclusion",
  );

  const clause2 = f.memory.poles(clauses[1]!);
  same(
    clause2.start,
    instantiateV013StructuralTemplate(
      f.memory,
      value(f, result, "READ_PAIR"),
      actualBindings,
    ),
    label + " paired pole readings",
  );
  same(
    clause2.end,
    instantiateV013StructuralTemplate(
      f.memory,
      value(f, result, "POLE_EQ"),
      actualBindings,
    ),
    label + " ordered pole identity conclusion",
  );

  const clause3 = f.memory.poles(clauses[2]!);
  const clause4 = f.memory.poles(clauses[3]!);
  same(clause3.start, clause4.start, label + " shared X/Y inequality premise");
  assert(clause3.end !== clause4.end, label + " start/end substitution clauses stay distinct");
}

same(exe02Formal.migrationStatus, "FORMAL_MIGRATED", "EXE-02 migration status");
same(exe02Formal.proofClosure, "NO_PROOF_ARTIFACT", "EXE-02 proof state");
same(
  exe02Formal.formalStatement,
  "EXE02_STATEMENT : EXE02_PREMISES->EXE02_CLAUSES",
  "EXE-02 canonical FORMAL statement",
);
same(exe02Formal.formalPremises.length, 0, "EXE-02 has zero formal premises");
same(exe02Formal.formalDomain?.length, 8, "EXE-02 has eight bound Link roles");
assert(exe02Formal.formalNonPremises?.includes("FND-13"), "FND-13 is not an EXE-02 premise");
assert(exe02Formal.formalNonPremises?.includes("Grounded"), "Grounded is not an EXE-02 premise");
assert(
  exe02Formal.formalNonPremises?.includes("Memory handle/object identity"),
  "host identity is not an EXE-02 premise",
);
same(exe02Formal.aproverStatus, "NOT_RECORDED", "EXE-02 aprover boundary");

{
  const f = fixture();
  const roleNames = ["A0", "AP", "B0", "BP", "X", "Y", "C0", "D0"];
  const source = exe02Source(roleNames);
  assert(!source.includes("="), "theorem source must not use executable equality syntax");
  assert(!source.includes("FND-13"), "theorem source must not depend on FND-13");
  assert(!source.includes("Grounded"), "theorem source must not add Grounded");
  assert(!source.includes("Memory"), "theorem source must not use host/Memory identity");

  const result = compile(f, source);
  const roles = roleNames.map((name) => value(f, result, name));
  same(new Set(roles).size, 8, "eight exact distinct bound role Links");

  const roleDictionary = defineStructuralRoleDictionary(f.memory, roles);
  const readDictionary = readStructuralRoleDictionary(f.memory, roleDictionary);
  same(readDictionary.roles.length, 8, "generic RoleDictionary arity 8");
  for (let index = 0; index < roles.length; index += 1) {
    same(readDictionary.roles[index], roles[index], "role dictionary position " + String(index));
  }

  const template = value(f, result, "EXE02_STATEMENT");
  const firstBindings = bindings(f, result, roles, "V");
  const secondBindings = bindings(f, result, roles, "W");
  const first = instantiateV013StructuralTemplate(f.memory, template, firstBindings);
  const second = instantiateV013StructuralTemplate(f.memory, template, secondBindings);
  assert(first !== second, "two eight-role substitutions produce distinct theorem instances");
  inspectStatement(f, result, template, first, firstBindings, "V");
  inspectStatement(f, result, template, second, secondBindings, "W");

  const json = encodeV015FormalSourceAsetJson(
    f.memory,
    f.basis,
    f.grammarRoot,
    f.namespaceProfileRoot,
    f.definitionProfileRoot,
    result.source.sourceAset,
  );
  assert(
    decoder.decode(json).includes('"schema":"' + V015_FORMAL_JSON_J1_SCHEMA + '"'),
    "EXE-02 source stays on strict JSON J1",
  );
  const round = decodeV015FormalSourceAsetJson(
    f.memory,
    f.basis,
    f.grammarRoot,
    f.namespaceProfileRoot,
    f.definitionProfileRoot,
    json,
  );
  same(round.sourceAset, result.source.sourceAset, "J1 exact EXE-02 source-Aset round-trip");

  const alphaNames = ["P", "Q", "S", "T", "V", "W", "Z", "H"];
  const alpha = compile(f, exe02Source(alphaNames));
  for (let index = 0; index < roles.length; index += 1) {
    same(
      value(f, alpha, alphaNames[index]!),
      roles[index],
      "alpha-renamed role identity " + String(index),
    );
  }
  same(
    value(f, alpha, "EXE02_STATEMENT"),
    template,
    "alpha rename preserves EXE-02 statement topology",
  );

  const free = compile(f, freeSameSpellingSource());
  const freeA = value(f, free, "A0");
  const freeX = value(f, free, "X");
  assert(freeA !== roles[0], "same-spelling free A0 resolves distinct Link");
  assert(freeX !== roles[4], "same-spelling free X resolves distinct Link");
  const freeClaim = value(f, free, "FREE_CLAIM");
  same(
    instantiateV013StructuralTemplate(f.memory, freeClaim, firstBindings),
    freeClaim,
    "same-spelling free Links are not captured by EXE-02 roles",
  );
}

console.log([
  "MTS v0.15 B17 EXE-02 FORMAL statement:",
  "PROOF_CLOSURE=NO_PROOF_ARTIFACT",
  "FORMAL_PREMISES=0",
  "THEOREM_DEPENDENCIES=0",
  "BOUND_LINK_ROLES=8",
  "CLAUSES=4",
  "ROLE_DICTIONARY=GENERIC",
  "TWO_INSTANTIATIONS=GREEN",
  "ALPHA_RENAME=SEMANTICALLY_STABLE",
  "SAME_SPELLING_FREE_CAPTURE=REJECTED_BY_IDENTITY",
  "JSON_J1=EXACT",
  "RUNTIME_EQUALITY_IN_TEMPLATE=0",
  "FND13_PREMISE=0",
  "GROUNDED_PREMISE=0",
  "HOST_IDENTITY_PREMISE=0",
  "NATIVE_PROOF=NOT_CLAIMED",
  "APROVER_ACCEPT=NOT_CLAIMED",
].join(" "));
