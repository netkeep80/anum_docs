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

const fnd01Formal = formalOverlayEntry("FND-01");

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

function fnd01Source(
  outerRoleName: string,
  startWitnessName: string,
  finishWitnessName: string,
  pairWitnessName: string,
): string {
  return [
    "R : R->R",
    "O : O->R",
    "C : R->C",
    "L : O->C",
    "U : C->O",

    outerRoleName + " : U->L",
    startWitnessName + " : L->U",
    finishWitnessName + " : " + startWitnessName + "->R",
    pairWitnessName + " : " + finishWitnessName + "->R",

    "TAG_SEED : " + pairWitnessName + "->O",
    "LINK_DOMAIN_TAG : TAG_SEED->O",
    "FULL_SELF_TAG : LINK_DOMAIN_TAG->O",
    "ROOT_ID_TAG : FULL_SELF_TAG->O",
    "LOCAL_SELF_DECISION_TAG : ROOT_ID_TAG->O",
    "START_ONLY_TAG : LOCAL_SELF_DECISION_TAG->O",
    "FINISH_ONLY_TAG : START_ONLY_TAG->O",
    "PAIR_LOCAL_TAG : FINISH_ONLY_TAG->O",
    "EXHAUSTIVE_TAG : PAIR_LOCAL_TAG->O",
    "EXCLUSIVE_TAG : EXHAUSTIVE_TAG->O",
    "GROUNDED_TAG : EXCLUSIVE_TAG->O",
    "EXISTS_TAG : GROUNDED_TAG->O",
    "DEPENDENCY_TAG : EXISTS_TAG->O",

    "A1RecursiveSeparation : DEPENDENCY_TAG->C",
    "F2F3OneSidedExistence : A1RecursiveSeparation->C",

    "DOMAIN_X : LINK_DOMAIN_TAG->" + outerRoleName,
    "LOCAL_SELF_DECISION : LOCAL_SELF_DECISION_TAG->" + outerRoleName,
    "FND01_PREMISES : [A1RecursiveSeparation,F2F3OneSidedExistence,LOCAL_SELF_DECISION]",

    "FULL_SELF_X : FULL_SELF_TAG->" + outerRoleName,
    "ROOT_ID_XR_ARGS : [" + outerRoleName + ",R]",
    "ROOT_ID_XR : ROOT_ID_TAG->ROOT_ID_XR_ARGS",
    "FND02_DEPENDENCY_RULE : FULL_SELF_X->ROOT_ID_XR",
    "FND02_DEPENDENCY_REF : DEPENDENCY_TAG->FND02_DEPENDENCY_RULE",
    "FND01_DEPENDENCIES : [FND02_DEPENDENCY_REF]",

    "START_ONLY_X : START_ONLY_TAG->" + outerRoleName,
    "FINISH_ONLY_X : FINISH_ONLY_TAG->" + outerRoleName,
    "PAIR_LOCAL_X : PAIR_LOCAL_TAG->" + outerRoleName,
    "LOCAL_CASES : [FULL_SELF_X,START_ONLY_X,FINISH_ONLY_X,PAIR_LOCAL_X]",
    "C1_EXHAUSTIVE : EXHAUSTIVE_TAG->LOCAL_CASES",
    "C1_EXCLUSIVE : EXCLUSIVE_TAG->LOCAL_CASES",
    "C1_ROOT_BRANCH : FULL_SELF_X->ROOT_ID_XR",
    "FND01_C1 : [C1_EXHAUSTIVE,C1_EXCLUSIVE,C1_ROOT_BRANCH]",

    "FULL_SELF_ROOT : FULL_SELF_TAG->R",
    "EXISTENTIAL_ROLES : [" +
      startWitnessName + "," + finishWitnessName + "," + pairWitnessName + "]",
    "GROUNDED_START_WITNESS : GROUNDED_TAG->" + startWitnessName,
    "GROUNDED_FINISH_WITNESS : GROUNDED_TAG->" + finishWitnessName,
    "GROUNDED_PAIR_WITNESS : GROUNDED_TAG->" + pairWitnessName,
    "START_ONLY_WITNESS : START_ONLY_TAG->" + startWitnessName,
    "FINISH_ONLY_WITNESS : FINISH_ONLY_TAG->" + finishWitnessName,
    "PAIR_LOCAL_WITNESS : PAIR_LOCAL_TAG->" + pairWitnessName,
    "EXISTENTIAL_BODY : [GROUNDED_START_WITNESS,GROUNDED_FINISH_WITNESS,GROUNDED_PAIR_WITNESS,START_ONLY_WITNESS,FINISH_ONLY_WITNESS,PAIR_LOCAL_WITNESS]",
    "EXISTENTIAL_DATA : [EXISTENTIAL_ROLES,EXISTENTIAL_BODY]",
    "EXISTENTIAL_WITNESSES : EXISTS_TAG->EXISTENTIAL_DATA",
    "FND01_C2 : [FULL_SELF_ROOT,EXISTENTIAL_WITNESSES]",

    "FND01_CONCLUSION : [FND01_C1,FND01_C2]",
    fnd01Formal.formalStatement,
    "OUTER_ROLES : [" + outerRoleName + "]",

    "VALUE_A : FND01_CONCLUSION->R",
    "VALUE_B : VALUE_A->R",
  ].join("\n");
}

function freeSameSpellingSource(): string {
  return [
    "R : R->R",
    "O : O->R",
    "C : R->C",
    "L : O->C",
    "U : C->O",
    "X : R->U",
    "START_WITNESS : C->R",
    "FREE_TAG : U->R",
    "FREE_ARGS : [X,START_WITNESS]",
    "FREE_CLAIM : FREE_TAG->FREE_ARGS",
  ].join("\n");
}

function instantiate(
  f: Fixture,
  template: LinkHandle,
  role: LinkHandle,
  candidate: LinkHandle,
): LinkHandle {
  return instantiateV013StructuralTemplate(
    f.memory,
    template,
    [{ role, value: candidate }],
  );
}

function inspectFnd01Instance(
  f: Fixture,
  result: V015FormalRecursiveCompileResult,
  statement: LinkHandle,
  outerRole: LinkHandle,
  candidate: LinkHandle,
  label: string,
): void {
  const binding = [{ role: outerRole, value: candidate }] as const;
  const theorem = f.memory.poles(statement);

  const premiseValues = readExactSequence(f.memory, theorem.start).values;
  same(premiseValues.length, 3, label + " exact premise count");
  same(
    premiseValues[0],
    value(f, result, "A1RecursiveSeparation"),
    label + " A1 premise",
  );
  same(
    premiseValues[1],
    value(f, result, "F2F3OneSidedExistence"),
    label + " one-sided existence premise",
  );
  same(
    premiseValues[2],
    f.memory.ensure(value(f, result, "LOCAL_SELF_DECISION_TAG"), candidate),
    label + " LocalSelfDecision:x premise",
  );

  const conclusionValues = readExactSequence(f.memory, theorem.end).values;
  same(conclusionValues.length, 2, label + " C1/C2 conclusion arity");
  const expectedC1 = instantiateV013StructuralTemplate(
    f.memory,
    value(f, result, "FND01_C1"),
    binding,
  );
  same(conclusionValues[0], expectedC1, label + " exact C1 instance");
  same(
    conclusionValues[1],
    value(f, result, "FND01_C2"),
    label + " C2 existential realizability independent of outer x substitution",
  );

  const c1 = readExactSequence(f.memory, conclusionValues[0]!).values;
  same(c1.length, 3, label + " C1 coordinate count");
  same(
    c1[0],
    instantiateV013StructuralTemplate(
      f.memory,
      value(f, result, "C1_EXHAUSTIVE"),
      binding,
    ),
    label + " exhaustive coordinate",
  );
  same(
    c1[1],
    instantiateV013StructuralTemplate(
      f.memory,
      value(f, result, "C1_EXCLUSIVE"),
      binding,
    ),
    label + " exclusive coordinate",
  );
  same(
    c1[2],
    instantiateV013StructuralTemplate(
      f.memory,
      value(f, result, "C1_ROOT_BRANCH"),
      binding,
    ),
    label + " FullSelf-to-ROOT dependency coordinate",
  );

  const c2 = readExactSequence(f.memory, conclusionValues[1]!).values;
  same(c2.length, 2, label + " C2 coordinate count");
  same(c2[0], value(f, result, "FULL_SELF_ROOT"), label + " ROOT FullSelf witness");

  const existsClaim = f.memory.poles(c2[1]!);
  same(existsClaim.start, value(f, result, "EXISTS_TAG"), label + " existential tag");
  const existsData = readExactSequence(f.memory, existsClaim.end).values;
  same(existsData.length, 2, label + " existential payload arity");
  same(
    existsData[0],
    value(f, result, "EXISTENTIAL_ROLES"),
    label + " existential witness role carrier",
  );
  same(
    existsData[1],
    value(f, result, "EXISTENTIAL_BODY"),
    label + " existential witness body carrier",
  );

  const witnessBody = readExactSequence(f.memory, existsData[1]!).values;
  same(witnessBody.length, 6, label + " grounded/class witness coordinate count");
  same(
    witnessBody[0],
    value(f, result, "GROUNDED_START_WITNESS"),
    label + " grounded start witness",
  );
  same(
    witnessBody[1],
    value(f, result, "GROUNDED_FINISH_WITNESS"),
    label + " grounded finish witness",
  );
  same(
    witnessBody[2],
    value(f, result, "GROUNDED_PAIR_WITNESS"),
    label + " grounded pair witness",
  );
  same(
    witnessBody[3],
    value(f, result, "START_ONLY_WITNESS"),
    label + " StartOnly witness",
  );
  same(
    witnessBody[4],
    value(f, result, "FINISH_ONLY_WITNESS"),
    label + " FinishOnly witness",
  );
  same(
    witnessBody[5],
    value(f, result, "PAIR_LOCAL_WITNESS"),
    label + " PairLocal witness",
  );
}

same(fnd01Formal.migrationStatus, "FORMAL_MIGRATED", "FND-01 migration status");
same(fnd01Formal.proofClosure, "NO_PROOF_ARTIFACT", "FND-01 proof state");
same(fnd01Formal.formalArtifactKind, "STATEMENT_ONLY", "FND-01 artifact kind");
same(
  fnd01Formal.formalStatement,
  "FND01_STATEMENT : FND01_PREMISES->FND01_CONCLUSION",
  "FND-01 canonical FORMAL statement",
);
same(fnd01Formal.formalPremises.length, 3, "FND-01 exact formal premise count");
same(fnd01Formal.formalPremises[0], "A1RecursiveSeparation", "FND-01 A1 premise");
same(fnd01Formal.formalPremises[1], "F2F3OneSidedExistence", "FND-01 F2/F3 premise");
same(fnd01Formal.formalPremises[2], "LocalSelfDecision:x", "FND-01 local decision premise");
same(fnd01Formal.formalDependencies?.length, 1, "FND-01 one theorem dependency");
same(fnd01Formal.formalDependencies?.[0], "FND-02", "FND-01 exact FND-02 dependency");
same(fnd01Formal.formalDomain?.length, 1, "FND-01 one outer bound Link");
same(fnd01Formal.formalDomain?.[0], "x : Link", "FND-01 x domain");
same(fnd01Formal.formalExistentialDomain?.length, 3, "FND-01 existential arity");
assert(fnd01Formal.formalNonPremises?.includes("FND-02 as premise"), "FND-02 is dependency, not premise");
assert(fnd01Formal.formalNonPremises?.includes("FND-13"), "FND-13 is not imported");
assert(fnd01Formal.formalNonPremises?.includes("Grounded:x"), "Grounded:x is not external premise");
same(fnd01Formal.aproverStatus, "NOT_RECORDED", "FND-01 aprover boundary");

{
  const f = fixture();
  const source = fnd01Source("X", "START_WITNESS", "FINISH_WITNESS", "PAIR_WITNESS");
  assert(!source.includes("="), "FND-01 source must not use executable equality syntax");
  assert(!source.includes("FND-13"), "FND-01 source must not import FND-13");
  assert(!source.includes("Grounded:x"), "FND-01 source must not add Grounded:x premise");

  const result = compile(f, source);
  const outerRole = value(f, result, "X");
  const startWitness = value(f, result, "START_WITNESS");
  const finishWitness = value(f, result, "FINISH_WITNESS");
  const pairWitness = value(f, result, "PAIR_WITNESS");
  assert(
    new Set([outerRole, startWitness, finishWitness, pairWitness]).size === 4,
    "outer and existential roles are distinct ordinary Links",
  );

  const outerRoles = readExactSequence(f.memory, value(f, result, "OUTER_ROLES")).values;
  same(outerRoles.length, 1, "outer RoleDictionary source arity");
  same(outerRoles[0], outerRole, "outer RoleDictionary contains only x");
  const outerDictionary = readStructuralRoleDictionary(
    f.memory,
    defineStructuralRoleDictionary(f.memory, outerRoles),
  );
  same(outerDictionary.roles.length, 1, "generic outer RoleDictionary arity");

  const witnessRoles = readExactSequence(
    f.memory,
    value(f, result, "EXISTENTIAL_ROLES"),
  ).values;
  same(witnessRoles.length, 3, "existential witness role arity");
  same(witnessRoles[0], startWitness, "start witness role");
  same(witnessRoles[1], finishWitness, "finish witness role");
  same(witnessRoles[2], pairWitness, "pair witness role");
  const witnessDictionary = readStructuralRoleDictionary(
    f.memory,
    defineStructuralRoleDictionary(f.memory, witnessRoles),
  );
  same(witnessDictionary.roles.length, 3, "generic existential RoleDictionary arity");
  assert(
    !witnessDictionary.roles.includes(outerRole),
    "outer x role does not leak into existential witness dictionary",
  );

  const dependencies = readExactSequence(
    f.memory,
    value(f, result, "FND01_DEPENDENCIES"),
  ).values;
  same(dependencies.length, 1, "FND-01 source has exactly one dependency reference");
  const dependency = f.memory.poles(dependencies[0]!);
  same(
    dependency.start,
    value(f, result, "DEPENDENCY_TAG"),
    "dependency is carried as an ordinary structural Link",
  );
  same(
    dependency.end,
    value(f, result, "C1_ROOT_BRANCH"),
    "FND-02 dependency points to the exact FullSelf(x)->RootIdentity(x,R) C1 rule",
  );

  const sourcePremises = readExactSequence(
    f.memory,
    value(f, result, "FND01_PREMISES"),
  ).values;
  same(sourcePremises.length, 3, "source premise count remains three");
  assert(
    !sourcePremises.includes(dependencies[0]!),
    "FND-02 dependency reference is not smuggled into formal premises",
  );

  const template = value(f, result, "FND01_STATEMENT");
  const a = value(f, result, "VALUE_A");
  const b = value(f, result, "VALUE_B");
  assert(a !== b && a !== outerRole && b !== outerRole, "two distinct outer substitutions");

  const aStatement = instantiate(f, template, outerRole, a);
  const bStatement = instantiate(f, template, outerRole, b);
  assert(aStatement !== bStatement, "different x bindings produce different C1 instances");
  inspectFnd01Instance(f, result, aStatement, outerRole, a, "A");
  inspectFnd01Instance(f, result, bStatement, outerRole, b, "B");

  const dependencyA = instantiate(
    f,
    dependencies[0]!,
    outerRole,
    a,
  );
  const dependencyARule = f.memory.poles(dependencyA).end;
  const aConclusion = readExactSequence(
    f.memory,
    f.memory.poles(aStatement).end,
  ).values;
  const aC1 = readExactSequence(f.memory, aConclusion[0]!).values;
  same(
    dependencyARule,
    aC1[2],
    "instantiated theorem dependency is the same structural ROOT branch used by C1",
  );

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
    "FND-01 source stays on strict JSON J1",
  );
  const round = decodeV015FormalSourceAsetJson(
    f.memory,
    f.basis,
    f.grammarRoot,
    f.namespaceProfileRoot,
    f.definitionProfileRoot,
    json,
  );
  same(round.sourceAset, result.source.sourceAset, "J1 exact FND-01 source-Aset round-trip");

  const alpha = compile(
    f,
    fnd01Source("Y", "SW", "FW", "PW"),
  );
  same(value(f, alpha, "Y"), outerRole, "alpha-renamed outer role identity");
  same(value(f, alpha, "SW"), startWitness, "alpha-renamed start witness role identity");
  same(value(f, alpha, "FW"), finishWitness, "alpha-renamed finish witness role identity");
  same(value(f, alpha, "PW"), pairWitness, "alpha-renamed pair witness role identity");
  same(
    value(f, alpha, "FND01_STATEMENT"),
    template,
    "alpha renaming preserves full FND-01 statement topology",
  );

  const free = compile(f, freeSameSpellingSource());
  const freeX = value(f, free, "X");
  const freeStartWitness = value(f, free, "START_WITNESS");
  assert(freeX !== outerRole, "same-spelling free X resolves a distinct Link");
  assert(
    freeStartWitness !== startWitness,
    "same-spelling free witness resolves a distinct Link",
  );
  const freeClaim = value(f, free, "FREE_CLAIM");
  same(
    instantiate(f, freeClaim, outerRole, a),
    freeClaim,
    "outer x substitution does not capture independent same-spelling free Links",
  );
}

console.log([
  "MTS v0.15 B18 FND-01 FORMAL statement:",
  "PROOF_CLOSURE=NO_PROOF_ARTIFACT",
  "FORMAL_ARTIFACT_KIND=STATEMENT_ONLY",
  "FORMAL_PREMISES=3",
  "FORMAL_DEPENDENCIES=FND-02",
  "FND02_AS_PREMISE=0",
  "OUTER_BOUND_LINK_ROLES=1",
  "EXISTENTIAL_WITNESS_ROLES=3",
  "C1=EXHAUSTIVE+EXCLUSIVE+FULLSELF_TO_ROOT",
  "C2=ROOT_FULLSELF+EXISTENTIAL_GROUNDED_REALIZABILITY",
  "C3=C1_PLUS_C2",
  "FND13_DEPENDENCY=0",
  "GROUNDED_X_PREMISE=0",
  "OUTER_SUBSTITUTION_CAPTURES_WITNESSES=0",
  "TWO_X_INSTANTIATIONS=GREEN",
  "ALPHA_RENAME=SEMANTICALLY_STABLE",
  "SAME_SPELLING_FREE_CAPTURE=REJECTED_BY_IDENTITY",
  "JSON_J1=EXACT",
  "RUNTIME_EQUALITY_IN_TEMPLATE=0",
  "NATIVE_PROOF=NOT_CLAIMED",
  "APROVER_ACCEPT=NOT_CLAIMED",
].join(" "));
