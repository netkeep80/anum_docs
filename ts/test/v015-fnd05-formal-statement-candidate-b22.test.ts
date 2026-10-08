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
  if (!value) throw new Error("v0.15 B22 FND-05 candidate FORMAL statement: " + message);
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
  for (let i = 0; i < actual.length; i += 1) {
    if (actual[i] !== expected[i]) return;
  }
  throw new Error("v0.15 B22 FND-05 candidate FORMAL statement: " + message);
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

function acceptedRequirement(id: string): RequirementRow {
  const doc = JSON.parse(
    readFileSync(resolve(repositoryRoot(), "requirements/mts-v0.15.json"), "utf8"),
  ) as { requirements?: RequirementRow[] };
  const row = doc.requirements?.find((item) => item.id === id);
  assert(row !== undefined, "accepted requirement " + id);
  same(row.mandatory, true, id + " mandatory");
  same(row.state, "COMPONENT_GREEN", id + " accepted component state");
  return row;
}

for (const id of ["V15-ONTO-01", "V15-ONTO-02", "V15-STRUCT-01"]) {
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

function historicalFnd05(): HistoricalTheorem {
  const doc = JSON.parse(
    readFileSync(resolve(repositoryRoot(), "theorems/current-v0.14.json"), "utf8"),
  ) as { theorems?: HistoricalTheorem[] };
  const theorem = doc.theorems?.find((item) => item.id === "FND-05");
  assert(theorem !== undefined, "historical FND-05 inventory row");
  same(
    theorem.statement,
    "Canonical recursive structural description is unique on its explicitly declared finite ROOT-decomposable carrier domain.",
    "exact historical statement",
  );
  same(JSON.stringify(theorem.dependsOn), JSON.stringify(["FND-01", "FND-02"]),
    "historical dependencies");
  same(theorem.formalPremises.length, 0, "historical formal premise count");
  assert(/\bfinite\b/i.test(theorem.scope), "scope retains finite boundary");
  assert(/Grounded Links/i.test(theorem.scope), "scope retains Grounded Links boundary");
  assert(/finite recursive-carrier decision/i.test(theorem.scope),
    "scope retains explicit finite recursive-carrier decision");
  assert(/cycles/i.test(theorem.exclusions), "scope explicitly excludes arbitrary cycles");
  assert(theorem.evidence.lean4.length > 0 && theorem.evidence.coq.length > 0,
    "historical paired external evidence remains registered");
  same(theorem.evidence.mtsNative.length, 0, "no historical native proof record");
  same(theorem.evidence.aprover.length, 0, "no historical aprover record");
  return theorem;
}
historicalFnd05();

const historicalBoundary = readFileSync(
  resolve(repositoryRoot(), "ts/test/research-v013-finite-recursive-description-boundary.test.ts"),
  "utf8",
);
assert(
  historicalBoundary.includes("current tree carrier rejects recursive revisit"),
  "distinct-node cycle falsifier remains executable historical evidence",
);

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

interface RoleNames {
  readonly x: string;
  readonly code: string;
  readonly other: string;
}

const canonicalNames: RoleNames = Object.freeze({
  x: "X",
  code: "CODE",
  other: "OTHER",
});
const renamedNames: RoleNames = Object.freeze({
  x: "SUBJECT_LINK",
  code: "CANONICAL_CODE",
  other: "ALTERNATIVE_CODE",
});

function sourceFor(names: RoleNames): string {
  return [
    "R : R->R",
    "O : O->R",
    "C : R->C",
    "L : O->C",
    "U : C->O",
    names.x + " : U->L",
    names.code + " : L->U",
    names.other + " : " + names.code + "->R",
    "TAG_SEED : " + names.other + "->O",
    "LINK_DOMAIN_TAG : TAG_SEED->O",
    "GROUNDED_TAG : LINK_DOMAIN_TAG->O",
    "FINITE_ROOT_DECOMPOSABLE_TAG : GROUNDED_TAG->O",
    "CANONICAL_DESCRIPTION_TAG : FINITE_ROOT_DECOMPOSABLE_TAG->O",
    "EXISTS_UNIQUE_TAG : CANONICAL_DESCRIPTION_TAG->O",
    "IDENTITY_CLAIM_TAG : EXISTS_UNIQUE_TAG->O",
    "FND05_PREMISES : []",
    "DOMAIN_X : LINK_DOMAIN_TAG->" + names.x,
    "GROUNDED_X : GROUNDED_TAG->" + names.x,
    "FINITE_DOMAIN_X : FINITE_ROOT_DECOMPOSABLE_TAG->" + names.x,
    "DESCRIPTION_ARGS : [" + names.x + "," + names.code + "]",
    "DESCRIPTION_X_CODE : CANONICAL_DESCRIPTION_TAG->DESCRIPTION_ARGS",
    "OTHER_DESCRIPTION_ARGS : [" + names.x + "," + names.other + "]",
    "DESCRIPTION_X_OTHER : CANONICAL_DESCRIPTION_TAG->OTHER_DESCRIPTION_ARGS",
    "IDENTITY_ARGS : [" + names.other + "," + names.code + "]",
    "OTHER_IS_CODE : IDENTITY_CLAIM_TAG->IDENTITY_ARGS",
    "UNIQUENESS_RULE : DESCRIPTION_X_OTHER->OTHER_IS_CODE",
    "EXISTS_UNIQUE_DATA : [" + names.code + ",DESCRIPTION_X_CODE,UNIQUENESS_RULE]",
    "EXISTS_UNIQUE_DESCRIPTION : EXISTS_UNIQUE_TAG->EXISTS_UNIQUE_DATA",
    "FND05_DOMAIN : [DOMAIN_X,GROUNDED_X,FINITE_DOMAIN_X]",
    "FND05_CONCLUSION : [FND05_DOMAIN,EXISTS_UNIQUE_DESCRIPTION]",
    "FND05_STATEMENT : FND05_PREMISES->FND05_CONCLUSION",
  ].join("\n");
}
const source = sourceFor(canonicalNames);
assert(!source.includes("="), "statement uses ordinary Link metamodel, not executable equality syntax");

function verifyCandidate(
  f: Fixture,
  compiled: V015FormalRecursiveCompileResult,
  names: RoleNames,
): void {
  const x = value(f, compiled, names.x);
  const code = value(f, compiled, names.code);
  const other = value(f, compiled, names.other);
  assert(x !== code && x !== other && code !== other, "x/code/other roles are distinct Links");

  const premises = readExactSequence(f.memory, value(f, compiled, "FND05_PREMISES")).values;
  same(premises.length, 0, "FND-05 has no independent formal premise row");

  const domain = readExactSequence(f.memory, value(f, compiled, "FND05_DOMAIN")).values;
  same(domain.length, 3, "domain has Link/Grounded/finite coordinates");
  const [domainX, groundedX, finiteX] = domain;
  same(f.memory.poles(domainX!).start, value(f, compiled, "LINK_DOMAIN_TAG"), "Link-domain tag");
  same(f.memory.poles(domainX!).end, x, "Link-domain subject");
  same(f.memory.poles(groundedX!).start, value(f, compiled, "GROUNDED_TAG"), "Grounded tag");
  same(f.memory.poles(groundedX!).end, x, "Grounded subject");
  same(
    f.memory.poles(finiteX!).start,
    value(f, compiled, "FINITE_ROOT_DECOMPOSABLE_TAG"),
    "finite ROOT-decomposable domain tag",
  );
  same(f.memory.poles(finiteX!).end, x, "finite-domain subject");

  const descArgs = readExactSequence(f.memory, value(f, compiled, "DESCRIPTION_ARGS")).values;
  same(descArgs.length, 2, "canonical description arity");
  same(descArgs[0], x, "canonical description subject");
  same(descArgs[1], code, "canonical description code role");

  const otherArgs = readExactSequence(f.memory, value(f, compiled, "OTHER_DESCRIPTION_ARGS")).values;
  same(otherArgs.length, 2, "alternative description arity");
  same(otherArgs[0], x, "alternative description same subject");
  same(otherArgs[1], other, "alternative description role");

  const identityArgs = readExactSequence(f.memory, value(f, compiled, "IDENTITY_ARGS")).values;
  same(identityArgs.length, 2, "uniqueness identity arity");
  same(identityArgs[0], other, "uniqueness antecedent alternative");
  same(identityArgs[1], code, "uniqueness target canonical code");

  const uniqueRule = f.memory.poles(value(f, compiled, "UNIQUENESS_RULE"));
  same(uniqueRule.start, value(f, compiled, "DESCRIPTION_X_OTHER"), "uniqueness antecedent");
  same(uniqueRule.end, value(f, compiled, "OTHER_IS_CODE"), "uniqueness conclusion");

  const existsData = readExactSequence(
    f.memory,
    f.memory.poles(value(f, compiled, "EXISTS_UNIQUE_DESCRIPTION")).end,
  ).values;
  same(existsData.length, 3, "exists-unique payload arity");
  same(existsData[0], code, "exists-unique canonical code role");
  same(existsData[1], value(f, compiled, "DESCRIPTION_X_CODE"), "exists-unique witness claim");
  same(existsData[2], value(f, compiled, "UNIQUENESS_RULE"), "exists-unique rule");

  const conclusion = readExactSequence(f.memory, value(f, compiled, "FND05_CONCLUSION")).values;
  same(conclusion.length, 2, "FND-05 conclusion arity");
  same(conclusion[0], value(f, compiled, "FND05_DOMAIN"), "conclusion domain");
  same(conclusion[1], value(f, compiled, "EXISTS_UNIQUE_DESCRIPTION"),
    "conclusion canonical existence/uniqueness");

  const statement = f.memory.poles(value(f, compiled, "FND05_STATEMENT"));
  same(statement.start, value(f, compiled, "FND05_PREMISES"), "statement premise carrier");
  same(statement.end, value(f, compiled, "FND05_CONCLUSION"), "statement conclusion carrier");

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
  wire(first, compiled, "FND05_STATEMENT"),
  wire(second, compiledSecond, "FND05_STATEMENT"),
  "fresh-Memory recursive statement wire",
);

const renamed = fixture();
const renamedCompiled = compile(renamed, sourceFor(renamedNames));
verifyCandidate(renamed, renamedCompiled, renamedNames);
sameBytes(
  wire(first, compiled, "FND05_STATEMENT"),
  wire(renamed, renamedCompiled, "FND05_STATEMENT"),
  "role-name alpha rename preserves theorem statement identity",
);

{
  const wrong = fixture();
  const mutatedSource = source.replace(
    "FINITE_DOMAIN_X : FINITE_ROOT_DECOMPOSABLE_TAG->X",
    "FINITE_DOMAIN_X : GROUNDED_TAG->X",
  );
  const mutated = compile(wrong, mutatedSource);
  differentBytes(
    wire(first, compiled, "FND05_STATEMENT"),
    wire(wrong, mutated, "FND05_STATEMENT"),
    "dropping the finite ROOT-decomposable boundary must change statement identity",
  );
}
{
  const wrong = fixture();
  const mutatedSource = source.replace(
    "IDENTITY_ARGS : [OTHER,CODE]",
    "IDENTITY_ARGS : [CODE,OTHER]",
  );
  const mutated = compile(wrong, mutatedSource);
  differentBytes(
    wire(first, compiled, "FND05_STATEMENT"),
    wire(wrong, mutated, "FND05_STATEMENT"),
    "reversing the uniqueness identity direction must change statement identity",
  );
}

console.log([
  "MTS v0.15 B22 FND-05 candidate FORMAL statement:",
  "MIGRATION_STATUS=CANDIDATE_NOT_PROMOTED",
  "FORMAL_ARTIFACT_KIND=STATEMENT_ONLY",
  "FORMAL_PREMISES=0",
  "FORMAL_DEPENDENCIES=FND-01+FND-02",
  "DOMAIN=FINITE_GROUNDED_ROOT_DECOMPOSABLE",
  "CANONICAL_DESCRIPTION=ORDINARY_LINK_ROLE",
  "EXISTS_UNIQUE=STRUCTURAL",
  "ARBITRARY_DISTINCT_NODE_CYCLE=EXCLUDED",
  "ACCEPTED_REQUIREMENTS=V15-ONTO-01+V15-ONTO-02+V15-STRUCT-01",
  "PRESENTATION_RENAME=SEMANTICALLY_STABLE",
  "FRESH_MEMORY_WIRE_PARITY=GREEN",
  "JSON_J1=EXACT",
  "FINITE_DOMAIN_MUTATION=DIFF",
  "UNIQUENESS_DIRECTION_MUTATION=DIFF",
  "HISTORICAL_EXTERNAL_PROOF=UNCHANGED",
  "NATIVE_PROOF=NOT_CLAIMED",
  "APROVER_ACCEPT=NOT_CLAIMED",
].join(" "));
