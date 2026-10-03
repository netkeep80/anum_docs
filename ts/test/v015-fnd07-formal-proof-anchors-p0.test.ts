import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
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
import {
  materializeSourceNamespaceProfile,
} from "../src/source-namespace.js";
import {
  materializeV015LinkDefinitionProfile,
} from "../src/v015-link-definition.js";
import {
  compileV015FormalDefinitionsToRecursive,
  type V015FormalRecursiveCompileResult,
} from "../src/v015-formal-recursive-compiler.js";
import { materializeV012StringAnum } from "../src/v012-string-anum.js";
import { materializeExactSequence } from "../src/exact-sequence.js";
import {
  admitStructuralRule,
  defineStructuralRoleDictionary,
  defineStructuralRule,
} from "../src/structural-rule.js";
import {
  admitStructuralDerivationRule,
  defineStructuralDerivationRule,
} from "../src/derivation.js";
import {
  type StructuralHeterogeneousDerivedDerivationEvidence,
} from "../src/derived-derivation-heterogeneous.js";
import {
  materializeHeterogeneousDerivedOpenRootedExpansion,
} from "../src/derived-derivation-heterogeneous-expansion.js";
import {
  materializeHeterogeneousDerivedClosedRootedDischarge,
} from "../src/derived-derivation-heterogeneous-discharge-materialize.js";
import {
  StructuralRootedProofAsetReplayError,
  replayStructuralRootedProofAset,
} from "../src/rooted-proof-aset.js";
import {
  exportPortableClosedRootedProof,
  replayPortableClosedRootedProof,
} from "../src/portable-closed-rooted-proof.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.15 P0 FND-07 FORMAL: ${message}`);
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}
function sameBytes(
  actual: readonly number[] | Uint8Array,
  expected: readonly number[] | Uint8Array,
  message: string,
): void {
  same(actual.length, expected.length, `${message}: byte length`);
  for (let index = 0; index < actual.length; index += 1) {
    same(actual[index], expected[index], `${message}: byte ${index}`);
  }
}
function differentBytes(
  left: readonly number[] | Uint8Array,
  right: readonly number[] | Uint8Array,
  message: string,
): void {
  if (left.length !== right.length) return;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return;
  }
  throw new Error(`v0.15 P0 FND-07 FORMAL: ${message}: bytes unexpectedly equal`);
}
function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function repositoryRoot(): string {
  const candidates = [resolve(process.cwd(), ".."), process.cwd()];
  const root = candidates.find((candidate) =>
    existsSync(resolve(candidate, "proofs", "native", "FND-07")),
  );
  if (root === undefined) throw new Error("FND-07 native artifact root not found");
  return root;
}

interface FormalFixture {
  readonly memory: Memory;
  readonly basis: RootBasis;
  readonly grammarRoot: LinkHandle;
  readonly namespaceProfileRoot: LinkHandle;
  readonly definitionProfileRoot: LinkHandle;
}

function formalFixture(): FormalFixture {
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  let cursor = memory.ensure(basis.U, basis.L);
  const fresh = (): LinkHandle => (cursor = memory.ensure(cursor, basis.C));
  const syntaxTag = fresh();
  const markerSeed = fresh();
  const pairForm = fresh();
  const nameRefForm = fresh();
  const declarationForm = fresh();
  const blockForm = fresh();
  const leftRole = fresh();
  const rightRole = fresh();
  const referencedNameRole = fresh();
  const declarationNameRole = fresh();
  const declarationBodyRole = fresh();
  const blockItemRole = fresh();

  const rules: readonly NativeSyntaxGrammarRuleSpec[] = [
    {
      form: pairForm,
      fields: [
        { role: leftRole, target: "child", min: 1, max: 1 },
        { role: rightRole, target: "child", min: 1, max: 1 },
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
    pairLeftRole: leftRole,
    pairRightRole: rightRole,
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

const enc = new TextEncoder();

function compile(
  fixture: FormalFixture,
  source: string,
): V015FormalRecursiveCompileResult {
  return compileV015FormalDefinitionsToRecursive(
    fixture.memory,
    fixture.basis,
    fixture.grammarRoot,
    fixture.namespaceProfileRoot,
    fixture.definitionProfileRoot,
    enc.encode(source),
  );
}

function nameCarrier(fixture: FormalFixture, name: string): LinkHandle {
  return materializeV012StringAnum(
    fixture.memory,
    fixture.basis,
    enc.encode(name),
  ).anumLink;
}

function value(
  fixture: FormalFixture,
  compiled: V015FormalRecursiveCompileResult,
  name: string,
): LinkHandle {
  const carrier = nameCarrier(fixture, name);
  const found = compiled.definitions.find(
    (definition) => definition.nameCarrier === carrier,
  );
  assert(found !== undefined, `compiled anchor exists for ${name}`);
  return found.semantic;
}

function basePrefix(): readonly string[] {
  return [
    "R : R->R",
    "O : O->R",
    "C : R->C",
    "L : O->C",
    "U : C->O",
    "THEORY : C->U",
    "SEED : L->U",
  ];
}

interface DetachmentNames {
  readonly currentTag: string;
  readonly S: string;
  readonly K: string;
  readonly A: string;
  readonly B: string;
  readonly s: string;
  readonly k: string;
  readonly a: string;
  readonly b: string;
  readonly scope: string;
  readonly context: string;
  readonly antecedent: string;
  readonly consequent: string;
}

const STANDARD: DetachmentNames = Object.freeze({
  currentTag: "CURRENT_TAG",
  S: "S",
  K: "K",
  A: "A",
  B: "B",
  s: "s",
  k: "k",
  a: "a",
  b: "b",
  scope: "SCOPE",
  context: "CONTEXT",
  antecedent: "ANTECEDENT",
  consequent: "CONSEQUENT",
});

const RENAMED: DetachmentNames = Object.freeze({
  currentTag: "ct",
  S: "roleS",
  K: "roleK",
  A: "roleA",
  B: "roleB",
  s: "localS",
  k: "localK",
  a: "localA",
  b: "localB",
  scope: "world",
  context: "frame",
  antecedent: "before",
  consequent: "after",
});

function detachmentSource(
  names: DetachmentNames,
  options: Readonly<{
    theory?: string;
    bDefinitionEnd?: string;
  }> = {},
): string {
  const theory = options.theory ?? "C->U";
  const bEnd = options.bDefinitionEnd ?? "O";
  return [
    "R : R->R",
    "O : O->R",
    "C : R->C",
    "L : O->C",
    "U : C->O",
    `THEORY : ${theory}`,
    "SEED : L->U",
    `${names.currentTag} : SEED->O`,
    `${names.S} : ${names.currentTag}->O`,
    `${names.K} : ${names.S}->O`,
    `${names.A} : ${names.K}->O`,
    `${names.B} : ${names.A}->${bEnd}`,
    `${names.s} : ${names.B}->O`,
    `${names.k} : ${names.s}->O`,
    `${names.a} : ${names.k}->O`,
    `${names.b} : ${names.a}->O`,
    `${names.scope} : ${names.b}->O`,
    `${names.context} : ${names.scope}->O`,
    `${names.antecedent} : ${names.context}->O`,
    `${names.consequent} : ${names.antecedent}->O`,
  ].join("\n");
}

function morphism(
  memory: Memory,
  theory: LinkHandle,
  sourceDictionary: LinkHandle,
  targetDictionary: LinkHandle,
  bindings: readonly (readonly [LinkHandle, LinkHandle])[],
): LinkHandle {
  return materializeExactSequence(memory, [
    theory,
    sourceDictionary,
    targetDictionary,
    materializeExactSequence(
      memory,
      bindings.map(([sourceRole, targetRole]) =>
        memory.ensure(sourceRole, targetRole)
      ),
    ),
  ]);
}

function primitiveClaimProof(
  memory: Memory,
  theory: LinkHandle,
  claim: LinkHandle,
): Readonly<{
  derivationRule: LinkHandle;
  occurrence: LinkHandle;
}> {
  const dictionary = defineStructuralRoleDictionary(memory, []);
  const rule = defineStructuralRule(memory, dictionary, claim);
  const derivationRule = defineStructuralDerivationRule(memory, rule, []);
  admitStructuralRule(memory, theory, rule);
  admitStructuralDerivationRule(memory, theory, derivationRule);
  const occurrence = memory.ensure(
    claim,
    memory.ensure(
      derivationRule,
      materializeExactSequence(memory, []),
    ),
  );
  return Object.freeze({ derivationRule, occurrence });
}

interface BuiltDetachment {
  readonly fixture: FormalFixture;
  readonly compiled: V015FormalRecursiveCompileResult;
  readonly proofRoot: LinkHandle;
  readonly openRoot: LinkHandle;
  readonly conclusion: LinkHandle;
  readonly bytes: Uint8Array;
}

function buildDetachment(
  source: string,
  names: DetachmentNames,
): BuiltDetachment {
  const fixture = formalFixture();
  const { memory, basis } = fixture;
  const compiled = compile(fixture, source);
  const get = (name: string): LinkHandle => value(fixture, compiled, name);

  const theory = get("THEORY");
  const currentTag = get(names.currentTag);
  const current = (scope: LinkHandle, witness: LinkHandle): LinkHandle =>
    memory.ensure(currentTag, memory.ensure(scope, witness));

  const S = get(names.S);
  const K = get(names.K);
  const A = get(names.A);
  const B = get(names.B);
  const globalDictionary = defineStructuralRoleDictionary(memory, [S, K, A, B]);
  const targetPremiseTruth = current(S, memory.ensure(K, A));
  const targetPremiseRule = current(S, memory.ensure(A, B));
  const targetConclusion = current(S, memory.ensure(K, B));
  const targetRule = defineStructuralRule(
    memory,
    globalDictionary,
    targetConclusion,
  );
  const targetDR = defineStructuralDerivationRule(
    memory,
    targetRule,
    [targetPremiseTruth, targetPremiseRule],
  );
  const targetIdentity = memory.ensure(targetDR, theory);

  const s = get(names.s);
  const k = get(names.k);
  const a = get(names.a);
  const b = get(names.b);
  const localDictionary = defineStructuralRoleDictionary(memory, [s, k, a, b]);
  const localRule = defineStructuralRule(
    memory,
    localDictionary,
    current(s, memory.ensure(k, b)),
  );
  const localDR = defineStructuralDerivationRule(
    memory,
    localRule,
    [
      current(s, memory.ensure(k, a)),
      current(s, memory.ensure(a, b)),
    ],
  );
  admitStructuralRule(memory, theory, localRule);
  admitStructuralDerivationRule(memory, theory, localDR);

  const mu = morphism(
    memory,
    theory,
    localDictionary,
    globalDictionary,
    [[s, S], [k, K], [a, A], [b, B]],
  );
  const genericTruth = memory.ensure(targetPremiseTruth, targetIdentity);
  const genericRule = memory.ensure(targetPremiseRule, targetIdentity);
  const genericTarget = memory.ensure(
    targetConclusion,
    memory.ensure(
      localDR,
      memory.ensure(
        mu,
        materializeExactSequence(memory, [genericTruth, genericRule]),
      ),
    ),
  );
  const generic: StructuralHeterogeneousDerivedDerivationEvidence =
    Object.freeze({
      identity: targetIdentity,
      targetOccurrence: genericTarget,
    });

  const scope = get(names.scope);
  const context = get(names.context);
  const antecedent = get(names.antecedent);
  const consequent = get(names.consequent);
  const currentTruth = current(
    scope,
    memory.ensure(context, antecedent),
  );
  const currentRule = current(
    scope,
    memory.ensure(antecedent, consequent),
  );
  const currentResult = current(
    scope,
    memory.ensure(context, consequent),
  );

  const openRoot = materializeHeterogeneousDerivedOpenRootedExpansion(
    memory,
    generic,
    [
      { role: S, value: scope },
      { role: K, value: context },
      { role: A, value: antecedent },
      { role: B, value: consequent },
    ],
  ).concreteRoot;

  const openIdentity = memory.poles(openRoot).start;
  const truthAssumption = memory.ensure(currentTruth, openIdentity);
  const ruleAssumption = memory.ensure(currentRule, openIdentity);
  const truthProof = primitiveClaimProof(memory, theory, currentTruth);
  const ruleProof = primitiveClaimProof(memory, theory, currentRule);

  const proofRoot = materializeHeterogeneousDerivedClosedRootedDischarge(
    memory,
    { generic, concreteRoot: openRoot },
    [
      {
        assumptionOccurrence: truthAssumption,
        proofOccurrence: truthProof.occurrence,
      },
      {
        assumptionOccurrence: ruleAssumption,
        proofOccurrence: ruleProof.occurrence,
      },
    ],
  ).closedRoot;

  const replay = replayStructuralRootedProofAset(memory, proofRoot);
  same(replay.conclusion, currentResult, "FORMAL detachment conclusion");
  same(replay.declaredAssumptionCount, 0, "FORMAL detachment is CLOSED");
  same(replay.usedAssumptionCount, 0, "FORMAL detachment uses no open assumptions");

  return Object.freeze({
    fixture,
    compiled,
    proofRoot,
    openRoot,
    conclusion: currentResult,
    bytes: exportPortableClosedRootedProof(memory, basis, proofRoot),
  });
}

interface BuiltTruthRole {
  readonly fixture: FormalFixture;
  readonly compiled: V015FormalRecursiveCompileResult;
  readonly proofRoot: LinkHandle;
  readonly conclusion: LinkHandle;
  readonly bytes: Uint8Array;
}

function truthRoleSource(
  tagName = "TRUTH_ROLE_TAG",
  claimName = "TRUTH_ROLE_CLAIM",
): string {
  return [
    ...basePrefix(),
    `${tagName} : SEED->O`,
    `${claimName} : ${tagName}->L`,
  ].join("\n");
}

function buildTruthRole(
  source: string,
  tagName = "TRUTH_ROLE_TAG",
  claimName = "TRUTH_ROLE_CLAIM",
): BuiltTruthRole {
  const fixture = formalFixture();
  const { memory, basis } = fixture;
  const compiled = compile(fixture, source);
  const theory = value(fixture, compiled, "THEORY");
  const truthRoleTag = value(fixture, compiled, tagName);
  const truthRoleClaim = value(fixture, compiled, claimName);
  same(
    truthRoleClaim,
    memory.ensure(truthRoleTag, basis.L),
    "FORMAL truth-role claim exact topology",
  );
  assert(truthRoleClaim !== basis.L, "truth role is not raw L existence");

  const proof = primitiveClaimProof(memory, theory, truthRoleClaim);
  const targetIdentity = memory.ensure(proof.derivationRule, theory);
  const proofRoot = memory.ensure(targetIdentity, proof.occurrence);
  const replay = replayStructuralRootedProofAset(memory, proofRoot);
  same(replay.conclusion, truthRoleClaim, "FORMAL A16 role conclusion");
  same(replay.declaredAssumptionCount, 0, "FORMAL A16 role is CLOSED");

  return Object.freeze({
    fixture,
    compiled,
    proofRoot,
    conclusion: truthRoleClaim,
    bytes: exportPortableClosedRootedProof(memory, basis, proofRoot),
  });
}

const root = repositoryRoot();
const trackedDetachment = readFileSync(
  resolve(root, "proofs", "native", "FND-07", "contextual-detachment.anum"),
);
const trackedTruthRole = readFileSync(
  resolve(root, "proofs", "native", "FND-07", "a16-truth-role.anum"),
);

same(
  sha256(trackedDetachment),
  "a565b72a9caa77007f297490b5cccf3b2945388b006431395b6f117cd6375347",
  "tracked detachment SHA-256 remains accepted",
);
same(
  sha256(trackedTruthRole),
  "8e03a22c06fe93b1e645785cbdf635347427a5f8e50d024aef6b2d6c15d1aea3",
  "tracked A16 truth-role SHA-256 remains accepted",
);

{
  const built = buildDetachment(detachmentSource(STANDARD), STANDARD);
  sameBytes(
    built.bytes,
    trackedDetachment,
    "FORMAL detachment reproduces tracked native artifact",
  );
  const fresh = replayPortableClosedRootedProof(built.bytes);
  same(
    fresh.replay.declaredAssumptionCount,
    0,
    "fresh portable detachment remains CLOSED",
  );
  same(
    fresh.replay.usedAssumptionCount,
    0,
    "fresh portable detachment uses zero assumptions",
  );

  let openRejected = false;
  try {
    exportPortableClosedRootedProof(
      built.fixture.memory,
      built.fixture.basis,
      built.openRoot,
    );
  } catch (error) {
    assert(
      error instanceof StructuralRootedProofAsetReplayError,
      "OPEN proof rejection comes from rooted proof boundary",
    );
    same(error.code, "proof-not-closed", "exact OPEN-as-CLOSED rejection");
    openRejected = true;
  }
  assert(openRejected, "OPEN proof cannot cross CLOSED transport");
}

{
  const renamed = buildDetachment(detachmentSource(RENAMED), RENAMED);
  sameBytes(
    renamed.bytes,
    trackedDetachment,
    "renaming FORMAL anchors preserves exact proof artifact",
  );
}

{
  const mutated = buildDetachment(
    detachmentSource(STANDARD, { bDefinitionEnd: "C" }),
    STANDARD,
  );
  differentBytes(
    mutated.bytes,
    trackedDetachment,
    "semantic source mutation must change proof artifact",
  );
}

{
  const foreign = buildDetachment(
    detachmentSource(STANDARD, { theory: "U->C" }),
    STANDARD,
  );
  differentBytes(
    foreign.bytes,
    trackedDetachment,
    "foreign Theory source cannot inherit tracked FND-07 identity",
  );
}

{
  const built = buildTruthRole(truthRoleSource());
  sameBytes(
    built.bytes,
    trackedTruthRole,
    "FORMAL truth-role reproduces tracked native artifact",
  );
  const fresh = replayPortableClosedRootedProof(built.bytes);
  same(
    fresh.replay.declaredAssumptionCount,
    0,
    "fresh portable truth-role remains CLOSED",
  );
  same(
    fresh.replay.usedAssumptionCount,
    0,
    "fresh portable truth-role uses zero assumptions",
  );
}

{
  const renamed = buildTruthRole(
    truthRoleSource("roleTag", "roleClaim"),
    "roleTag",
    "roleClaim",
  );
  sameBytes(
    renamed.bytes,
    trackedTruthRole,
    "renaming A16 FORMAL anchors preserves exact artifact",
  );
}

console.log([
  "MTS v0.15 P0 FND-07 FORMAL proof anchors:",
  "FORMAL_THEOREM_SPECIFIC_ANCHORS=COMPLETE",
  "CONTEXTUAL_DETACHMENT_ARTIFACT=BYTE_EXACT",
  "A16_TRUTH_ROLE_ARTIFACT=BYTE_EXACT",
  "FRESH_CLOSED_REPLAY=GREEN",
  "OPEN_AS_CLOSED=REJECT",
  "RENAMING_INVARIANCE=GREEN",
  "SOURCE_MUTATION=CHANGES_ARTIFACT",
  "FOREIGN_THEORY=CHANGES_ARTIFACT",
  "THEOREM_ID_DISPATCH=0",
  "ACCEPTED_V014_SEMANTIC_DELTA=NONE",
  "PROOF_ORCHESTRATION_STILL_HOST_PRODUCER=TRUE",
].join(" "));
